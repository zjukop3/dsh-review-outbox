import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const url = process.env.DSH_E2E_URL
const indexUrl = process.env.DSH_MARKET_INDEX_URL || 'https://zjukop3.github.io/dsh-review-outbox/plugins.json'
const expectedCommit = process.env.DSH_E2E_COMMIT || '923d129731b5080c85ac96236487ff9af1879dae'
if (!url) throw new Error('DSH_E2E_URL is required; use a fresh isolated DSH Web Profile')
if (!/^[a-f0-9]{40}$/.test(expectedCommit)) throw new Error('DSH_E2E_COMMIT must be a full commit SHA')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
const pageErrors = []
const consoleErrors = []
const failedResponses = []
const marketSearches = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('response', response => {
  if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() })
  if (response.url().endsWith('/api/pluginMarket/search')) marketSearches.push(response.status())
})

async function dismissOverlays() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const button = page.getByRole('button', { name: '继续', exact: true })
    const masks = page.locator('[class*="_mask_"]:visible')
    if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) await button.click()
    else if (await masks.count() || await page.locator('[role=dialog]:visible').count()) await page.keyboard.press('Escape')
    else break
    await page.waitForTimeout(400)
  }
}

async function openPlugins() {
  await dismissOverlays()
  await page.getByRole('button', { name: '插件', exact: true }).click()
  await page.waitForTimeout(1200)
  await dismissOverlays()
}

async function openDiscover() {
  await dismissOverlays()
  await page.locator('button:text-is("发现")').click()
  await page.waitForTimeout(800)
  await dismissOverlays()
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await dismissOverlays()
  await openPlugins()

  const enableMarket = page.locator('button[aria-label="启用 自定义插件索引"]')
  if (await enableMarket.isVisible().catch(() => false)) {
    await enableMarket.click()
    await page.waitForTimeout(2500)
  }
  await openDiscover()
  await page.locator('button:text-is("添加索引源")').click()
  await page.getByRole('textbox', { name: '索引 URL', exact: true }).fill(indexUrl)
  await page.locator('button:text-is("添加")').last().click()
  await page.locator('button[aria-label="安装 Review Outbox · 成果审阅与研究报告验收"]').waitFor({ state: 'visible', timeout: 60_000 })
  await dismissOverlays()

  await page.getByRole('searchbox', { name: '搜索插件', exact: true }).fill('研究报告')
  const installCardButton = page.locator('button[aria-label="安装 Review Outbox · 成果审阅与研究报告验收"]')
  await installCardButton.waitFor({ state: 'visible', timeout: 30_000 })
  const discoveryText = await page.locator('body').innerText()
  assert.match(discoveryText, /Review Outbox · 成果审阅与研究报告验收/)
  assert.match(discoveryText, /0\.1\.0 · zjukop3/)
  await page.screenshot({ path: 'docs/e2e/17-application-market.png', fullPage: true })

  await installCardButton.click()
  const confirmation = page.locator('[role=dialog]')
  await confirmation.getByText(expectedCommit, { exact: true }).waitFor({ timeout: 15_000 })
  await confirmation.locator('button:text-is("安装")').click()
  const installing = page.getByText('插件安装中…', { exact: true })
  await installing.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  await installing.waitFor({ state: 'hidden', timeout: 180_000 })
  await dismissOverlays()

  await page.getByRole('tab', { name: '已安装', exact: true }).click()
  await page.locator('button[aria-label="查看 dsh-review-outbox"]').waitFor({ state: 'visible', timeout: 30_000 })
  const enableOutbox = page.locator('button[aria-label="启用 dsh-review-outbox"]')
  if (await enableOutbox.isVisible().catch(() => false)) await enableOutbox.click()

  await page.waitForFunction(async () => {
    const response = await fetch('/review-outbox/api/health')
    if (!response.ok) return false
    const state = await response.json()
    return state.ok === true && state.backfill?.status === 'ready'
  }, undefined, { timeout: 90_000 })
  await page.getByRole('button', { name: '成果审阅', exact: true }).first().click()
  await page.getByText('Deliverables review outbox', { exact: true }).waitFor({ timeout: 30_000 })
  await page.locator('.ro-empty').filter({ hasText: '这里还没有成果' }).waitFor({ timeout: 15_000 })
  await page.waitForTimeout(500)
  await page.waitForFunction(async () => {
    const response = await fetch('/review-outbox/api/health')
    if (!response.ok) return false
    const state = await response.json()
    return state.ok === true && state.backfill?.status === 'ready'
  }, undefined, { timeout: 90_000 })
  const health = await page.evaluate(async () => (await (await fetch('/review-outbox/api/health')).json()))
  assert.equal(health.backfill.status, 'ready')
  assert.equal(health.stateError, null)
  assert.equal(health.items.length, 0)
  assert.equal(health.pending, 0)
  await page.screenshot({ path: 'docs/e2e/18-application-market-installed.png', fullPage: true })

  const report = {
    ok: pageErrors.length === 0 && consoleErrors.length === 0 && failedResponses.length === 0,
    flow: 'fresh Profile → enable Discover → add format-1 index → search → install → enable plugin → native Review Outbox',
    indexUrl,
    searchQuery: '研究报告',
    searchCardVisible: true,
    version: '0.1.0',
    installSpec: `git+https://github.com/zjukop3/dsh-review-outbox.git#${expectedCommit}`,
    resolvedCommit: expectedCommit,
    marketSearches,
    enabledAfterInstall: true,
    backfill: health.backfill.status,
    stateError: health.stateError,
    discoveredItems: health.items.length,
    nativeSidebarOpened: true,
    emptyStateVisible: true,
    pageErrors,
    consoleErrors,
    failedResponses,
    screenshots: ['docs/e2e/17-application-market.png', 'docs/e2e/18-application-market-installed.png'],
    externalActivationClaim: false,
  }
  await writeFile('docs/e2e/application-market.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(consoleErrors, [])
  assert.deepEqual(failedResponses, [])
} finally {
  await browser.close()
}
