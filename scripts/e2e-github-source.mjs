import { chromium } from 'playwright-core'
import { writeFile } from 'node:fs/promises'

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
    const response = await fetch('/review-outbox/api/items')
    if (!response.ok) return false
    const state = await response.json()
    return state.backfill?.status === 'ready' && state.items?.length === 1 && state.items[0].path.endsWith('github-source-install.md')
  }, undefined, { timeout: 60_000 })
  const initial = await page.evaluate(async () => (await (await fetch('/review-outbox/api/items')).json()))
  const id = initial.items[0].id
  const preview = await page.evaluate(async id => {
    const response = await fetch(`/review-outbox/api/preview?id=${encodeURIComponent(id)}`)
    if (!response.ok) throw new Error(`Preview HTTP ${response.status}`)
    return (await response.json()).preview
  }, id)
  if (preview.kind !== 'text' || !preview.content.includes('公开仓库直装后的历史回填与预览')) throw new Error('Backfilled preview mismatch')

  await page.getByRole('button', { name: '成果审阅', exact: true }).first().click()
  await page.getByText('Deliverables review outbox', { exact: true }).waitFor({ timeout: 30_000 })
  await page.locator('.ro-card').filter({ hasText: 'github-source-install.md' }).click()
  await page.locator('.ro-preview:visible').filter({ hasText: '公开仓库直装后的历史回填与预览' }).waitFor({ timeout: 15_000 })
  await page.screenshot({ path: 'docs/e2e/14-github-source-install.png', fullPage: true })

  const report = {
    ok: true,
    installCommand: 'dsh plugin --profile web add https://github.com/zjukop3/dsh-review-outbox',
    dependencySpecifier: 'github:zjukop3/dsh-review-outbox',
    resolvedCommit,
    lockfileTarball: `https://codeload.github.com/zjukop3/dsh-review-outbox/tar.gz/${resolvedCommit}`,
    sourceType: 'public GitHub repository, not a local directory link or release tarball',
    backfill: initial.backfill.status,
    discoveredItems: initial.items.length,
    nativeSidebarOpened: true,
    textPreviewVerified: true,
    pageErrors,
    consoleErrors,
    screenshot: 'docs/e2e/14-github-source-install.png',
  }
  await writeFile('docs/e2e/github-source-install.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  if (pageErrors.length || consoleErrors.length) throw new Error([...pageErrors, ...consoleErrors].join('; '))
} finally {
  await browser.close()
}
