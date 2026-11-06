import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import { relative } from 'node:path'

const url = process.env.DSH_E2E_URL
if (!url) throw new Error('DSH_E2E_URL is required')
const revised = new Map([
  ['dsh-review-outbox/README.md', { text: '34 项', note: '复审通过：测试计数已更新，真实 Session resume 与跨 callId revision 说明已补齐。' }],
  ['dsh-review-outbox/docs/STRATEGY.md', { text: '34 项', note: '复审通过：M0 标准已更新，真实 revision 已纳入官方工具链证据。' }],
  ['dsh-review-outbox/docs/VALIDATION.md', { text: '34/34', note: '复审通过：验证数量、真实重复成果问题、修复和迟到事件防护均已记录。' }],
  ['dsh-review-outbox/client/styles.js', { text: '.ro-root button{font:inherit}', note: '复审通过：按钮字体选择器已限定插件根节点，并有宿主样式隔离回归测试。' }],
  ['dsh-review-outbox/test/evidence.test.js', { text: 't.after', note: '复审通过：工作区、外部目录和 64 MiB sparse fixture 均注册测试后清理。' }],
])
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
async function request(path, options) {
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(`/review-outbox/api/${path}`, options)
    const isHtml = response.headers.get('content-type')?.includes('text/html')
    const body = isHtml ? await response.text() : await response.json()
    if (!response.ok) throw new Error(`${path} ${response.status}: ${JSON.stringify(body)}`)
    return body
  }, { path, options })
}
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  const backfilled = await request('backfill', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  })
  if (backfilled.items.length !== 20) throw new Error(`Expected 20 unique artifacts after revisions, got ${backfilled.items.length}`)
  if (backfilled.backfill.changed !== 5) throw new Error(`Expected five revisions, got ${backfilled.backfill.changed}`)
  const pendingRevisions = backfilled.items.filter(item => item.revision === 2 && item.status === 'pending')
  if (pendingRevisions.length !== 5) throw new Error(`Expected five pending revision-2 items, got ${pendingRevisions.length}`)

  const reviews = []
  for (const item of pendingRevisions) {
    const path = relative(item.cwd, item.path)
    const expected = revised.get(path)
    if (!expected) throw new Error(`Unexpected revised path: ${path}`)
    if (!item.history.some(entry => entry.action === 'return') || !item.history.some(entry => entry.action === 'revision')) {
      throw new Error(`Return/revision history missing for ${path}`)
    }
    const preview = await request(`preview?id=${encodeURIComponent(item.id)}`)
    if (!preview.preview.content.includes(expected.text)) throw new Error(`Latest fix missing in preview for ${path}`)
    const result = await request('action', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: item.id, action: 'approve', note: expected.note }),
    })
    reviews.push({
      path,
      id: item.id,
      revision: result.item.revision,
      status: result.item.status,
      history: result.item.history.map(entry => entry.action),
      evidence: result.item.reviewEvidence,
    })
  }
  const repeated = await request('backfill', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  })
  if (repeated.backfill.changed !== 0 || repeated.pending !== 0) throw new Error('Repeated backfill changed completed reviews')
  if (repeated.items.length !== 20 || repeated.items.some(item => item.status !== 'approved')) {
    throw new Error('Not all twenty real artifacts reached approved')
  }
  const readme = repeated.items.find(item => item.path.endsWith('dsh-review-outbox/README.md'))
  const receipt = await request(`receipt?id=${encodeURIComponent(readme.id)}`)
  if (!receipt.includes('当前文件与审阅时摘要一致') || !receipt.includes('r2') || !receipt.includes('新 revision')) {
    throw new Error('Revision-2 receipt did not preserve review history and evidence')
  }

  const report = {
    ok: true,
    mode: 'scripted re-review of five returned real artifacts; not external-user adoption',
    uniqueArtifacts: repeated.items.length,
    approved: repeated.items.filter(item => item.status === 'approved').length,
    revision1: repeated.items.filter(item => item.revision === 1).length,
    revision2: repeated.items.filter(item => item.revision === 2).length,
    pending: repeated.pending,
    changedAfterFinalBackfill: repeated.backfill.changed,
    reviews,
  }
  await mkdir('docs/dogfood', { recursive: true })
  await writeFile('docs/dogfood/final-review.json', JSON.stringify(report, null, 2))
  await writeFile('docs/dogfood/readme.review-r2.html', receipt)
  console.log(JSON.stringify({ ok: true, uniqueArtifacts: report.uniqueArtifacts, approved: report.approved, revision1: report.revision1, revision2: report.revision2, pending: report.pending }, null, 2))
} finally {
  await browser.close()
}
