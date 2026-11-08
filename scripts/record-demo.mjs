import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const url = process.env.DSH_E2E_URL
if (!url) throw new Error('DSH_E2E_URL is required')
const outDir = process.env.DEMO_OUT_DIR || 'assets/storefront'

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 860 } },
})
const page = await context.newPage()

const dismissOverlays = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const button = page.getByRole('button', { name: '继续', exact: true })
    const masks = page.locator('[class*="_mask_"]:visible')
    if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) await button.click()
    else if (await masks.count() || await page.locator('[role=dialog]:visible').count()) await page.keyboard.press('Escape')
    else break
    await page.waitForTimeout(300)
  }
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await dismissOverlays()
  await page.getByRole('button', { name: '插件', exact: true }).click()
  await dismissOverlays()

  const toggle = page.locator('button[aria-label="启用 dsh-review-outbox"]')
  await toggle.waitFor({ state: 'visible', timeout: 30_000 })
  if (await toggle.getAttribute('aria-checked') !== 'true') await toggle.click()
  await page.waitForFunction(() => document.querySelector('button[aria-label="启用 dsh-review-outbox"]')?.getAttribute('aria-checked') === 'true', undefined, { timeout: 30_000 })

  await page.waitForFunction(async () => {
    const response = await fetch('/review-outbox/api/health')
    if (!response.ok) return false
    const state = await response.json()
    return state.ok === true && state.backfill?.status === 'ready'
  }, undefined, { timeout: 90_000 })

  await page.locator('button[aria-label="成果审阅"]').first().click()
  await page.getByText('Deliverables review outbox', { exact: true }).waitFor({ timeout: 30_000 })
  await page.waitForFunction(() => document.querySelectorAll('.ro-card').length === 2, undefined, { timeout: 20_000 })
  await page.waitForTimeout(1200)

  const cards = page.locator('.ro-card')
  await cards.filter({ hasText: 'manifest.json' }).first().click()
  await page.waitForTimeout(1500)
  await cards.filter({ hasText: 'report.md' }).first().click()
  await page.getByText('必填证据 0/4', { exact: true }).waitFor({ timeout: 15_000 })
  await page.waitForTimeout(1200)

  const notes = [
    ['核心结论有对应证据', '核心结论逐条对应 Appendix A 的 verified 证据，可定位到正文与清单。'],
    ['引用来源可复核', '三份固定证据已登记到真实 ledger，作者、标题与支持段落可逐项复核。'],
    ['数据时间与统计口径明确', '统计区间、单位与样本范围在快照中明确，比较基线一致。'],
    ['方法与限制已披露', '检索方法、纳入标准与局限性已披露，相反证据已记录。'],
  ]
  for (const [label, detail] of notes) {
    const row = page.locator('.ro-check').filter({ hasText: label })
    await row.scrollIntoViewIfNeeded()
    await row.locator('textarea').fill(detail)
    await page.waitForTimeout(600)
    await row.locator('input[type=checkbox]').click()
    await page.waitForTimeout(900)
  }
  await page.getByText('必填证据 4/4', { exact: true }).waitFor({ timeout: 15_000 })
  await page.locator('.ro-note').fill('密封报告自动回填，四项证据人工复核后通过。')
  await page.waitForTimeout(800)

  const approve = page.getByRole('button', { name: '通过', exact: true })
  await approve.click()
  await page.waitForTimeout(1500)

  const downloadEvent = page.waitForEvent('download', { timeout: 20_000 })
  await page.getByRole('button', { name: '导出验收单', exact: true }).click()
  await downloadEvent
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${outDir}/demo-final.png`, fullPage: false })
  console.log(JSON.stringify({ ok: true, outDir }))
} finally {
  await context.close().catch(() => {})
  await browser.close().catch(() => {})
}
