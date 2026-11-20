import test from 'node:test'
import assert from 'node:assert/strict'
import { slugOf, publishedEntries, pageUrls } from '../scripts/check-detail-pages.mjs'

// slug 规则复刻自上游 scripts/lib/terms.mjs::slugOf()（issue #13437）。
// 这些用例锁死「我猜的拼法」不能再冒充「站点的拼法」——上一版脚本用
// /p/{owner}/{包名}/ 造成 27 条详情页被误判为 404。
test('子目录条目：owner/repo--路径用短横连', () => {
  assert.equal(
    slugOf('https://github.com/zjukop3/dsh-vertical-kit/tree/main/packages/dsh-handover-check'),
    'zjukop3/dsh-vertical-kit--packages-dsh-handover-check',
  )
})

test('仓库根条目：只有 owner/repo', () => {
  assert.equal(slugOf('https://github.com/zjukop3/dsh-review-outbox'), 'zjukop3/dsh-review-outbox')
})

test('git+ 前缀与 .git 后缀不影响 slug', () => {
  assert.equal(
    slugOf('git+https://github.com/zjukop3/dsh-review-outbox.git'),
    'zjukop3/dsh-review-outbox',
  )
})

test('%20 保持原样（复现 #13437 的已知行为，不是修好它）', () => {
  assert.equal(
    slugOf('https://github.com/ljwzhaoxiaoniu/DLR/tree/2.0/DSH-based%20Agent%20Service/dsh-tsm-agent'),
    'ljwzhaoxiaoniu/DLR--DSH-based%20Agent%20Service-dsh-tsm-agent',
  )
})

test('非 github URL 返回 null，不静默造一个 slug', () => {
  assert.equal(slugOf('https://gitlab.com/a/b'), null)
})

test('名单覆盖全部 28 个已发布包，且不含手写数组', () => {
  const e = publishedEntries()
  assert.equal(e.length, 28, `期望 28 个已发布包，实际 ${e.length}`)
  assert.equal(new Set(e.map((x) => x.name)).size, e.length)
})

test('每个包都能推出一个页面 URL', () => {
  const pages = pageUrls()
  assert.equal(pages.length, 28)
  for (const p of pages) {
    assert.match(p.url, /^https:\/\/awesome-dsh-plugin\.com\/p\/[^/]+\/[^/]+\/$/, p.name)
  }
})

test('两个最晚发布的包在名单里', () => {
  const names = publishedEntries().map((e) => e.name)
  for (const n of ['dsh-handover-check', 'dsh-expense-claim-check']) {
    assert.ok(names.includes(n), `${n} 不在名单里`)
  }
})

// 上游 #13569：slug 在 URL 边界做 encodeURI，所以规范地址是 %2520 而不是 %20。
// 单编码那份 404 是修复后的预期行为，不是回归（2026-11-20 实测：%20 → 404，%2520 → 200）。
test('页面 URL 在边界做 encodeURI，与站点一致', () => {
  const page = (url) => `https://awesome-dsh-plugin.com/p/${encodeURI(slugOf(url))}/`
  assert.equal(
    page('https://github.com/ljwzhaoxiaoniu/DLR/tree/2.0/DSH-based%20Agent%20Service/dsh-tsm-agent'),
    'https://awesome-dsh-plugin.com/p/ljwzhaoxiaoniu/DLR--DSH-based%2520Agent%2520Service-dsh-tsm-agent/',
  )
  // 无特殊字符时 encodeURI 不改字节
  assert.equal(
    page('https://github.com/zjukop3/dsh-vertical-kit/tree/main/packages/dsh-license-check'),
    'https://awesome-dsh-plugin.com/p/zjukop3/dsh-vertical-kit--packages-dsh-license-check/',
  )
})
