import { chromium } from 'playwright-core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const url = process.env.DSH_E2E_URL
const artifact = process.env.DSH_E2E_ARTIFACT
if (!url || !artifact) throw new Error('DSH_E2E_URL and DSH_E2E_ARTIFACT are required')
const id = 'presented:preinstall-official-session:preinstall-present-call:0'
const errors = []
const consoleMessages = []
await mkdir('docs/e2e', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true })
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
page.on('console', message => { if (message.type() === 'error') consoleMessages.push(message.text()) })

async function dismissModals() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const continueButton = page.getByRole('button', { name: '继续', exact: true })
    const masks = page.locator('[class*="_mask_"]:visible')
    if (await continueButton.isVisible().catch(() => false)) await continueButton.click()
    else if (await masks.count() > 0 || await page.locator('[role=dialog]:visible').count() > 0) await page.keyboard.press('Escape')
    else return
    await page.locator('[role=dialog]').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
    if (await masks.count() > 0) await masks.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  }
}

async function exportReceipt(path) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出验收单', exact: true }).click()
  const download = await pending
  await download.saveAs(path)
  return { filename: download.suggestedFilename(), html: await readFile(path, 'utf8') }
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await dismissModals()
  await page.waitForFunction(async expectedId => {
    const response = await fetch('/review-outbox/api/items')
    if (!response.ok) return false
    const state = await response.json()
    return ['ready', 'degraded'].includes(state.backfill?.status) && state.items.some(item => item.id === expectedId)
  }, id, { timeout: 60_000 })
  await page.evaluate(async expectedId => {
    const response = await fetch('/review-outbox/api/items')
    const state = await response.json()
    if (state.items.find(item => item.id === expectedId)?.status !== 'pending') {
      await fetch('/review-outbox/api/action', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: expectedId, action: 'reopen', note: '' }),
      })
    }
  }, id)
  await dismissModals()
  await page.getByText('成果审阅', { exact: true }).first().click()
  await page.getByText('Deliverables review outbox', { exact: true }).waitFor({ timeout: 30_000 })
  await dismissModals()
  await page.getByText('preinstall-review.md', { exact: true }).first().click()
  await page.getByLabel('场景验收包', { exact: true }).selectOption('')
  await page.getByLabel('场景验收包', { exact: true }).selectOption('research-report')
  await page.getByText('必填证据 0/4', { exact: true }).waitFor()
  const approve = page.getByRole('button', { name: '通过', exact: true })
  if (await approve.isEnabled()) throw new Error('Approve was enabled before required research evidence')

  const checks = [
    ['claims-evidence', '核心结论有对应证据', 'E2E: conclusion mapped to section and table'],
    ['citations-accessible', '引用来源可复核', 'E2E: sampled citation and original passage'],
    ['data-scope', '数据时间与统计口径明确', 'E2E: date, timezone, unit and baseline checked'],
    ['method-limitations', '方法与限制已披露', 'E2E: method, inclusion criteria and limitations checked'],
  ]
  for (const [checkId, label, detail] of checks) {
    await page.getByLabel(`${label}证据`, { exact: true }).fill(detail)
    const row = page.locator('.ro-check').filter({ hasText: label })
    await row.getByRole('checkbox').click()
    await page.waitForFunction(async ({ expectedId, checkId, expectedDetail }) => {
      const response = await fetch('/review-outbox/api/items')
      const state = await response.json()
      const check = state.items.find(item => item.id === expectedId)?.reviewPack?.checks?.[checkId]
      return check?.checked === true && check?.detail === expectedDetail
    }, { expectedId: id, checkId, expectedDetail: detail }, { timeout: 15_000 })
  }
  await page.getByText('必填证据 4/4', { exact: true }).waitFor({ timeout: 20_000 })
  if (!(await approve.isEnabled())) throw new Error('Approve remained disabled after required research evidence')
  await approve.click()
  await page.waitForFunction(async expectedId => {
    const response = await fetch('/review-outbox/api/items')
    const state = await response.json()
    return state.items.find(item => item.id === expectedId)?.status === 'approved'
  }, id, { timeout: 20_000 })

  const receiptPath = 'docs/e2e/research-report.review-r1.html'
  const exported = await exportReceipt(receiptPath)
  if (!exported.html.includes('研究报告验收') || !exported.html.includes('E2E: sampled citation')) {
    throw new Error('Research checklist was not exported')
  }
  if (!exported.html.includes('当前文件与审阅时摘要一致')) throw new Error('Matching evidence was not exported')
  if (exported.html.includes(artifact)) throw new Error('Receipt leaked the absolute artifact path')
  if (exported.html.includes('<script>')) throw new Error('Receipt contains an executable script tag')

  const receiptPage = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  await receiptPage.setContent(exported.html, { waitUntil: 'load' })
  await receiptPage.getByText('研究报告验收 · v1', { exact: true }).waitFor()
  await receiptPage.screenshot({ path: 'docs/e2e/06-research-receipt.png', fullPage: true })
  await receiptPage.close()

  await writeFile(artifact, '# Changed after review\n', 'utf8')
  const changedPath = 'docs/e2e/research-report.changed.review-r1.html'
  const changed = await exportReceipt(changedPath)
  if (!changed.html.includes('文件在审阅后发生变化')) throw new Error('Post-review artifact change was not detected')

  const report = {
    ok: true,
    approveInitiallyDisabled: true,
    requiredEvidenceCompleted: '4/4',
    status: 'approved',
    receipt: receiptPath,
    changedReceipt: changedPath,
    suggestedFilename: exported.filename,
    postReviewChangeDetected: true,
    screenshot: 'docs/e2e/06-research-receipt.png',
    pageErrors: errors,
    consoleErrors: consoleMessages,
  }
  await writeFile('docs/e2e/research-receipt-result.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (errors.length || consoleMessages.length) throw new Error([...errors, ...consoleMessages].join('; '))
} catch (error) {
  await page.screenshot({ path: 'docs/e2e/research-receipt-failure.png', fullPage: true }).catch(() => {})
  console.error(JSON.stringify({ ok: false, error: error.message, pageErrors: errors, consoleErrors: consoleMessages }, null, 2))
  throw error
} finally {
  await browser.close()
}
