import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import { relative } from 'node:path'

const url = process.env.DSH_E2E_URL
if (!url) throw new Error('DSH_E2E_URL is required')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const startedAt = Date.now()
const returned = new Map([
  ['dsh-review-outbox/README.md', '退回：新增真实跨 callId revision 与迟到事件测试后，测试总数已变为 33；更新 31 计数并补充真实 Session resume 链说明。'],
  ['dsh-review-outbox/docs/STRATEGY.md', '退回：M0 仍写 31 项测试；更新为当前真实数量，并记录跨 callId revision 已纳入官方工具链验证。'],
  ['dsh-review-outbox/docs/VALIDATION.md', '退回：31/31 已过时；更新为 33/33，并记录连续 present 暴露的重复成果问题、跨 callId 修复和迟到旧事件防护。'],
  ['dsh-review-outbox/client/styles.js', '退回：button{font:inherit} 未限定 .ro-root，会污染宿主及其他插件按钮；改为 .ro-root button，并添加静态作用域回归检查。'],
  ['dsh-review-outbox/test/evidence.test.js', '退回：mkdtemp 目录和 64 MiB sparse fixture 未在测试结束清理；用 t.after rm 递归清理每组临时目录。'],
])
const approvals = new Map([
  ['dsh-ecosystem-research/REPORT.md', '通过：计数、采用代理与产品推断分离，结论可回溯到数据、源码和限制。'],
  ['dsh-ecosystem-research/METHODOLOGY.md', '通过：数据源、复现命令、证据等级和限制明确，Issue 403 未被冒用为需求证据。'],
  ['dsh-ecosystem-research/data/processed/source_commits.csv', '通过：25 条检出均固定 40 位 commit 与日期，官方提交与方法文档一致。'],
  ['dsh-ecosystem-research/data/processed/summary.json', '通过：声明计数与实际计数一致，身份重叠、拒绝分类和采用代理分列；候选 failure code 与 rejection 字段未被强行合并。'],
  ['dsh-review-outbox/docs/packs/research-report.md', '通过：清单可独立使用，人工检查与自动事实核查边界清楚，插件通过条件和验收单字段一致。'],
  ['dsh-review-outbox/src/host.js', '通过：路由统一鉴权，动作前执行 Host 检查，preview/receipt 沿用工作区约束。'],
  ['dsh-review-outbox/src/backfill.js', '通过：三级上限、尾部读取、单会话错误隔离和 finally close 均有测试及真实冷读证据。'],
  ['dsh-review-outbox/src/store.js', '通过：跨 callId 真实 revision 测试通过，串行 mutation 与迟到旧事件防护保留审阅历史。'],
  ['dsh-review-outbox/src/receipt.js', '通过：HTML 注入、CSP、路径防泄露测试及真实下载通过，文件变化提示明确。'],
  ['dsh-review-outbox/client/index.jsx', '通过：真实浏览器四项证据、队列保存、通过后筛选和下载流程均通过。'],
  ['dsh-review-outbox/test/official-present.test.js', '通过：真实 resume 的两次 present 以不同 callId 形成 revision 2，上下文与临时目录均清理。'],
  ['dsh-review-outbox/package.json', '通过：engines 与 DSH 目标明确，devDependencies 不进入 tarball，关键词与人工验收定位一致。'],
  ['dsh-review-outbox/cordis.patch.yml', '通过：仅插入 review-outbox，不修改其他插件或用户 Profile。'],
  ['dsh-review-outbox/test/host.test.js', '通过：鉴权、生命周期、回填、研究包和验收单 Host 链路覆盖，Buffer 请求符合 Node 语义。'],
  ['dsh-review-outbox/docs/e2e/research-receipt-result.json', '通过：ok=true、4/4、approved、文件变化检测和双零浏览器错误与原始流程一致。'],
])
const research = new Map([
  ['dsh-ecosystem-research/REPORT.md', {
    'claims-evidence': '第 1 节结论可回溯至第 2 节目录计数、第 3 节类别和第 4 节采用代理；策略建议明确标为推断。',
    'citations-accessible': 'METHODOLOGY 第 3 节列出 Awesome、Shop、官方及代表项目 URL 与本地快照；source_commits.csv 固定 25 个提交。',
    'data-scope': '主快照为 2026-11-05，GitHub 校准为 2026-11-06；条目、包、bundle 和仓库分别计数。',
    'method-limitations': 'METHODOLOGY 第 4 节处理流程、第 6 节证据等级、第 7 节八项限制；未全量安装和 Issue 样本缺失已披露。',
    reproduction: 'METHODOLOGY 第 5 节提供三个复现命令，原始快照、处理脚本和 CSV/JSON 均保留。',
  }],
  ['dsh-review-outbox/docs/packs/research-report.md', {
    'claims-evidence': '四项必填和一项可选与 src/packs.js 当前定义一致，通过条件可在 Host 测试复核。',
    'citations-accessible': '文档未提出依赖外部文献的事实主张；官方 present、API 和源码位置均可从 README 继续定位。',
    'data-scope': '未使用统计数据；验收包版本为 v1，DSH 与 Node 目标版本在 README 单列。',
    'method-limitations': '明确人工检查、不自动访问 URL 或替代事实核查，并披露 Office/PDF 预览边界。',
    reproduction: '提供可复制的完整检查清单和五步使用流程，无需安装即可采用。',
  }],
])

async function request(path, options) {
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(`/review-outbox/api/${path}`, options)
    const body = await response.json()
    if (!response.ok) throw new Error(`${path} ${response.status}: ${JSON.stringify(body)}`)
    return body
  }, { path, options })
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForFunction(async () => {
    const response = await fetch('/review-outbox/api/items')
    if (!response.ok) return false
    const state = await response.json()
    window.__dogfoodInitial = state
    return state.backfill?.status === 'ready' && state.items.length === 20
  }, undefined, { timeout: 60_000 })
  const initial = await page.evaluate(() => window.__dogfoodInitial)
  const backfillMs = Date.now() - startedAt
  const { packs } = await request('packs')
  const pack = packs.find(candidate => candidate.id === 'research-report')
  const reviews = []
  let firstPreviewMs = null
  const items = initial.items.sort((left, right) => `${left.sessionId}:${left.path}`.localeCompare(`${right.sessionId}:${right.path}`))
  for (const item of items) {
    const path = relative(item.cwd, item.path)
    const previewData = await request(`preview?id=${encodeURIComponent(item.id)}`)
    if (previewData.preview.kind !== 'text') throw new Error(`${path} preview was ${previewData.preview.kind}`)
    if (firstPreviewMs === null) firstPreviewMs = Date.now() - startedAt
    if (research.has(path)) {
      await request('pack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: item.id, packId: 'research-report' }) })
      const details = research.get(path)
      for (const check of pack.checks) {
        await request('check', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: item.id, checkId: check.id, checked: true, detail: details[check.id] }),
        })
      }
    }
    const action = returned.has(path) ? 'return' : 'approve'
    const note = returned.get(path) || approvals.get(path)
    if (!note) throw new Error(`Missing reviewed decision for ${path}`)
    const result = await request('action', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: item.id, action, note }),
    })
    if (result.item.status !== (action === 'approve' ? 'approved' : 'returned')) throw new Error(`${path} action failed`)
    reviews.push({
      task: item.sessionId,
      path,
      action,
      note,
      preview: { kind: previewData.preview.kind, bytes: previewData.preview.bytes, truncated: previewData.preview.truncated },
      evidence: result.item.reviewEvidence,
      pack: result.item.reviewPack?.id || null,
      packProgress: result.item.reviewProgress,
    })
  }
  const final = await request('items')
  const report = {
    ok: true,
    mode: 'scripted review of twenty real project artifacts; not external-user adoption',
    tasks: new Set(reviews.map(review => review.task)).size,
    artifacts: reviews.length,
    approved: reviews.filter(review => review.action === 'approve').length,
    returned: reviews.filter(review => review.action === 'return').length,
    backfillMs,
    firstPreviewMs,
    totalReviewMs: Date.now() - startedAt,
    pending: final.pending,
    statuses: final.items.map(item => ({ id: item.id, path: relative(item.cwd, item.path), status: item.status, revision: item.revision })),
    reviews,
  }
  if (report.approved !== 15 || report.returned !== 5 || final.pending !== 0) throw new Error(`Unexpected review totals: ${JSON.stringify(report)}`)
  await mkdir('docs/dogfood', { recursive: true })
  await writeFile('docs/dogfood/initial-review.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: true, tasks: report.tasks, artifacts: report.artifacts, approved: report.approved, returned: report.returned, backfillMs, firstPreviewMs, totalReviewMs: report.totalReviewMs }, null, 2))
} finally {
  await browser.close()
}
