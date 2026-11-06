import { chromium } from 'playwright-core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const url = process.env.DSH_E2E_URL
if (!url) throw new Error('DSH_E2E_URL is required')
const output = resolve('assets/storefront')
await mkdir(output, { recursive: true })
await mkdir('docs/e2e', { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true })
const pageErrors = []
const consoleErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

async function dismissModals() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const continueButton = page.getByRole('button', { name: '继续', exact: true })
    const masks = page.locator('[class*="_mask_"]:visible')
    if (await continueButton.isVisible().catch(() => false) && await continueButton.isEnabled().catch(() => false)) await continueButton.click()
    else if (await masks.count() || await page.locator('[role=dialog]:visible').count()) await page.keyboard.press('Escape')
    else return
    await page.locator('[role=dialog]').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
    if (await masks.count()) await masks.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  }
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await dismissModals()
  await page.waitForFunction(async () => {
    const response = await fetch('/review-outbox/api/items')
    if (!response.ok) return false
    const state = await response.json()
    return state.backfill?.status === 'ready' && state.items.some(item => item.path.endsWith('research-report.md'))
  }, undefined, { timeout: 60_000 })
  await page.getByText('成果审阅', { exact: true }).first().click()
  await page.getByText('Deliverables review outbox', { exact: true }).waitFor({ timeout: 30_000 })
  await dismissModals()
  await page.evaluate(async () => {
    const state = await (await fetch('/review-outbox/api/items')).json()
    const item = state.items.find(item => item.path.endsWith('research-report.md'))
    if (item?.status !== 'pending') {
      await fetch('/review-outbox/api/action', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id, action: 'reopen', note: '' }),
      })
    }
  })
  await page.locator('.ro-card').filter({ hasText: 'research-report.md' }).click()
  await page.getByLabel('场景验收包', { exact: true }).selectOption('')
  await page.getByLabel('场景验收包', { exact: true }).selectOption('research-report')

  const checks = [
    ['claims-evidence', '核心结论有对应证据', '合成样例：结论 1–2 已定位到第 2 节与附录 A 的示例数据。'],
    ['citations-accessible', '引用来源可复核', '合成样例：引用 [1] 的作者、标题、日期、URL 与支持段落均已记录。'],
    ['data-scope', '数据时间与统计口径明确', '合成样例：统计区间、UTC 时区、样本单位与比较基线已逐项核对。'],
    ['method-limitations', '方法与限制已披露', '合成样例：检索方法、纳入标准、样本限制与相反证据见第 4 节。'],
  ]
  for (const [checkId, label, detail] of checks) {
    await page.getByLabel(`${label}证据`, { exact: true }).fill(detail)
    const row = page.locator('.ro-check').filter({ hasText: label })
    await row.getByRole('checkbox').click()
    await page.waitForFunction(async ({ checkId, detail }) => {
      const state = await (await fetch('/review-outbox/api/items')).json()
      const item = state.items.find(item => item.path.endsWith('research-report.md'))
      const check = item?.reviewPack?.checks?.[checkId]
      return check?.checked === true && check?.detail === detail
    }, { checkId, detail }, { timeout: 15_000 })
  }
  await page.getByText('必填证据 4/4', { exact: true }).waitFor({ timeout: 20_000 })
  const visibleText = await page.locator('body').innerText()
  if (process.env.USER && (visibleText.includes(`/Users/${process.env.USER}/`) || visibleText.includes(`/home/${process.env.USER}/`))) throw new Error('Workbench exposes a local home path')
  await page.screenshot({ path: resolve(output, 'review-workbench.png'), fullPage: true })

  await page.getByRole('button', { name: '通过', exact: true }).click()
  await page.waitForFunction(async () => {
    const state = await (await fetch('/review-outbox/api/items')).json()
    return state.items.find(item => item.path.endsWith('research-report.md'))?.status === 'approved'
  })
  const pendingDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出验收单', exact: true }).click()
  const download = await pendingDownload
  const receiptPath = resolve('docs/e2e/storefront-receipt.html')
  await download.saveAs(receiptPath)
  const receipt = await readFile(receiptPath, 'utf8')
  if (process.env.USER && (receipt.includes(`/Users/${process.env.USER}/`) || receipt.includes(`/home/${process.env.USER}/`))) throw new Error('Receipt contains a local home path')
  const receiptPage = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  await receiptPage.setContent(receipt, { waitUntil: 'load' })
  await receiptPage.getByText('研究报告验收 · v1', { exact: true }).waitFor()
  await receiptPage.screenshot({ path: resolve(output, 'research-receipt.png'), fullPage: true })
  await receiptPage.close()

  const report = {
    ok: true,
    syntheticArtifact: true,
    requiredEvidenceCompleted: '4/4',
    status: 'approved',
    localHomePathVisible: false,
    screenshots: ['assets/storefront/review-workbench.png', 'assets/storefront/research-receipt.png'],
    receipt: 'docs/e2e/storefront-receipt.html',
    pageErrors,
    consoleErrors,
  }
  await writeFile('docs/e2e/storefront-result.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  if (pageErrors.length || consoleErrors.length) throw new Error([...pageErrors, ...consoleErrors].join('; '))
} finally {
  await browser.close()
}
