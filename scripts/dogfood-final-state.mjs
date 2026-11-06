import { chromium } from 'playwright-core'
import { writeFile } from 'node:fs/promises'

const url = process.env.DSH_E2E_URL
if (!url) throw new Error('DSH_E2E_URL is required')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
async function request(path, options) {
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(`/review-outbox/api/${path}`, options)
    const body = response.headers.get('content-type')?.includes('text/html') ? await response.text() : await response.json()
    if (!response.ok) throw new Error(JSON.stringify(body))
    return body
  }, { path, options })
}
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  const state = await request('backfill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  const item = state.items.find(candidate => candidate.path.endsWith('dsh-review-outbox/docs/VALIDATION.md'))
  if (!item || item.revision !== 3 || item.status !== 'pending') throw new Error(`Unexpected validation revision: ${JSON.stringify(item)}`)
  if (item.history.filter(entry => entry.action === 'revision').length !== 2) throw new Error('Two revision transitions were not preserved')
  const preview = await request(`preview?id=${encodeURIComponent(item.id)}`)
  if (!preview.preview.content.includes('Dogfood 报告')) throw new Error('Latest dogfood report link is missing')
  const approved = await request('action', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: item.id, action: 'approve', note: '复审通过：20 个真实成果的退回、修复、revision 和重启证据已纳入验证文档。' }),
  })
  const receipt = await request(`receipt?id=${encodeURIComponent(item.id)}`)
  if (!receipt.includes('r3') || !receipt.includes('当前文件与审阅时摘要一致')) throw new Error('Revision-3 receipt evidence mismatch')
  const repeated = await request('backfill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  const report = {
    ok: true,
    uniqueArtifacts: repeated.items.length,
    approved: repeated.items.filter(candidate => candidate.status === 'approved').length,
    revision1: repeated.items.filter(candidate => candidate.revision === 1).length,
    revision2: repeated.items.filter(candidate => candidate.revision === 2).length,
    revision3: repeated.items.filter(candidate => candidate.revision === 3).length,
    pending: repeated.pending,
    changedAfterFinalBackfill: repeated.backfill.changed,
    validationHistory: approved.item.history.map(entry => entry.action),
  }
  if (report.uniqueArtifacts !== 20 || report.approved !== 20 || report.revision1 !== 15 || report.revision2 !== 4 || report.revision3 !== 1 || report.pending !== 0) {
    throw new Error(`Unexpected final state: ${JSON.stringify(report)}`)
  }
  await writeFile('docs/dogfood/final-state.json', JSON.stringify(report, null, 2))
  await writeFile('docs/dogfood/validation.review-r3.html', receipt)
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
