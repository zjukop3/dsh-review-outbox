import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const url = process.env.DSH_E2E_URL
const resolvedCommit = process.env.DSH_E2E_COMMIT
if (!url || !resolvedCommit) throw new Error('DSH_E2E_URL and DSH_E2E_COMMIT are required')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
const pageErrors = []
const consoleErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const button = page.getByRole('button', { name: '继续', exact: true })
    const masks = page.locator('[class*="_mask_"]:visible')
    if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) await button.click()
    else if (await masks.count() || await page.locator('[role=dialog]:visible').count()) await page.keyboard.press('Escape')
    else break
    await page.waitForTimeout(400)
  }

  await page.waitForFunction(async () => {
    const response = await fetch('/review-outbox/api/health')
    if (!response.ok) return false
    const state = await response.json()
    return state.ok === true && state.backfill?.status === 'ready'
  }, undefined, { timeout: 60_000 })
  const health = await page.evaluate(async () => (await (await fetch('/review-outbox/api/health')).json()))
  assert.equal(health.stateError, null)
  assert.equal(health.items.length, 0)
  assert.equal(health.pending, 0)

  await page.getByRole('button', { name: '成果审阅', exact: true }).first().click()
  await page.getByText('Deliverables review outbox', { exact: true }).waitFor({ timeout: 30_000 })
  await page.locator('.ro-empty').filter({ hasText: '这里还没有成果' }).waitFor({ timeout: 15_000 })
  await page.screenshot({ path: 'docs/e2e/15-catalog-install.png', fullPage: true })

  const report = {
    ok: true,
    listing: 'https://awesome-dsh-plugin.com/p/zjukop3/dsh-review-outbox/',
    installCommand: 'dsh plugin --profile web add github:zjukop3/dsh-review-outbox',
    dependencySpecifier: 'github:zjukop3/dsh-review-outbox',
    resolvedCommit,
    lockfileTarball: `https://codeload.github.com/zjukop3/dsh-review-outbox/tar.gz/${resolvedCommit}`,
    isolatedHome: true,
    isolatedPort: true,
    backfill: health.backfill.status,
    stateError: health.stateError,
    discoveredItems: health.items.length,
    nativeSidebarOpened: true,
    emptyStateVisible: true,
    pageErrors,
    consoleErrors,
    screenshot: 'docs/e2e/15-catalog-install.png',
  }
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(consoleErrors, [])
  await writeFile('docs/e2e/catalog-install.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
