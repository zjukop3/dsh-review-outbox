import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.env.DSH_E2E_URL
if (!url) throw new Error('DSH_E2E_URL is required')

const errors = []
const consoleMessages = []
await mkdir('docs/e2e', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
page.on('console', message => {
  if (message.type() === 'error') consoleMessages.push(message.text())
})

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  // Overlays differ per build: a 继续 button, a 开始使用 dialog, a 预览版说明
  // notice, or a bare mask. Retry the cheap exits until the pointer is free
  // instead of assuming one of them is the one on screen today.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const blocked = await page.evaluate(() => {
      const mask = document.querySelector('[aria-hidden="true"]._mask_, div[role="presentation"] > [class*="mask"]')
      if (!mask) return false
      const style = window.getComputedStyle(mask)
      return style.pointerEvents !== 'none' && style.display !== 'none' && mask.getBoundingClientRect().width > 0
    }).catch(() => false)
    const continueButton = page.getByRole('button', { name: '继续', exact: true })
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click().catch(() => {})
      await page.waitForTimeout(400)
      continue
    }
    if (blocked) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      continue
    }
    break
  }
  await page.screenshot({ path: 'docs/e2e/01-application.png', fullPage: true })
  const entry = page.getByText('成果审阅', { exact: true }).first()
  await entry.waitFor({ state: 'visible', timeout: 60_000 })
  await entry.click()
  await page.getByText('Deliverables review outbox', { exact: true }).waitFor({ timeout: 30_000 })
  await page.getByText('release-notes.md', { exact: true }).first().click()
  await page.locator('.ro-preview').getByText(/Review Outbox 0\.1\.0/).waitFor({ timeout: 20_000 })
  await page.screenshot({ path: 'docs/e2e/02-review-outbox.png', fullPage: true })

  await page.getByRole('button', { name: '通过', exact: true }).click()
  await page.waitForFunction(() => {
    const badges = [...document.querySelectorAll('.ro-count')]
    return badges.some(element => element.textContent?.trim() === '0')
  }, undefined, { timeout: 20_000 })
  const state = await page.evaluate(async () => {
    const response = await fetch('/review-outbox/api/items')
    if (!response.ok) throw new Error(`items API returned ${response.status}`)
    return response.json()
  })
  if (state.pending !== 0) throw new Error(`Expected zero pending items, got ${state.pending}`)
  const release = state.items.find(item => item.id === 'demo:release-notes.md')
  if (release?.status !== 'approved') throw new Error(`release-notes.md was not approved: ${release?.status}`)
  await page.screenshot({ path: 'docs/e2e/03-approved.png', fullPage: true })

  const report = {
    ok: true,
    pendingAfterApproval: state.pending,
    approvedItem: release.id,
    screenshots: ['docs/e2e/01-application.png', 'docs/e2e/02-review-outbox.png', 'docs/e2e/03-approved.png'],
    pageErrors: errors,
    consoleErrors: consoleMessages,
  }
  await writeFile('docs/e2e/result.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (errors.length > 0) throw new Error(`Browser page errors: ${errors.join('; ')}`)
} catch (error) {
  await page.screenshot({ path: 'docs/e2e/failure.png', fullPage: true }).catch(() => {})
  console.error(JSON.stringify({ ok: false, error: error.message, pageErrors: errors, consoleErrors: consoleMessages }, null, 2))
  throw error
} finally {
  await browser.close()
}
