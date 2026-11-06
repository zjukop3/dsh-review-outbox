import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.env.DSH_E2E_URL
if (!url) throw new Error('DSH_E2E_URL is required')
const expectedId = 'presented:preinstall-official-session:preinstall-present-call:0'
const errors = []
const consoleMessages = []
await mkdir('docs/e2e', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
page.on('console', message => {
  if (message.type() === 'error') consoleMessages.push(message.text())
})

async function request(path, options) {
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(path, options)
    const body = await response.json()
    if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`)
    return body
  }, { path, options })
}

async function dismissModals() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const continueButton = page.getByRole('button', { name: '继续', exact: true })
    const masks = page.locator('[class*="_mask_"]:visible')
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click()
    } else if (await masks.count() > 0 || await page.locator('[role=dialog]:visible').count() > 0) {
      await page.keyboard.press('Escape')
    } else {
      return
    }
    await page.locator('[role=dialog]').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
    if (await masks.count() > 0) await masks.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  }
  if (await page.locator('[class*="_mask_"]:visible').count() > 0) throw new Error('Host modal remained visible after dismissal')
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await dismissModals()

  await page.waitForFunction(async id => {
    const response = await fetch('/review-outbox/api/items')
    if (!response.ok) return false
    const state = await response.json()
    window.__reviewBackfillState = state
    return ['ready', 'degraded'].includes(state.backfill?.status)
      && state.items.some(item => item.id === id)
  }, expectedId, { timeout: 60_000 })
  const initial = await page.evaluate(() => window.__reviewBackfillState)
  if (initial.backfill.status !== 'ready') throw new Error(`Backfill was not clean: ${JSON.stringify(initial.backfill)}`)
  if (initial.backfill.discovered !== 1) throw new Error(`Expected one historical delivery: ${JSON.stringify(initial.backfill)}`)
  const historical = initial.items.find(item => item.id === expectedId)
  if (!historical?.path?.endsWith('preinstall-review.md')) {
    throw new Error(`Unexpected historical path: ${historical?.path}`)
  }

  await dismissModals()
  const entry = page.getByText('成果审阅', { exact: true }).first()
  await entry.waitFor({ state: 'visible', timeout: 60_000 })
  await entry.click()
  await page.getByText('Deliverables review outbox', { exact: true }).waitFor({ timeout: 30_000 })
  await dismissModals()
  await page.getByText('preinstall-review.md', { exact: true }).first().click()
  await page.locator('.ro-preview').getByText(/Historical official delivery/).waitFor({ timeout: 20_000 })
  await page.screenshot({ path: 'docs/e2e/04-backfill-official.png', fullPage: true })

  await page.getByRole('button', { name: '通过', exact: true }).click()
  await page.waitForFunction(async id => {
    const response = await fetch('/review-outbox/api/items')
    const state = await response.json()
    return state.pending === 0 && state.items.find(item => item.id === id)?.status === 'approved'
  }, expectedId, { timeout: 20_000 })

  const repeated = await request('/review-outbox/api/backfill', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (repeated.backfill.changed !== 0) throw new Error(`Rediscovery changed ${repeated.backfill.changed} items`)
  if (repeated.items.find(item => item.id === expectedId)?.status !== 'approved') {
    throw new Error('Backfill reset the completed review')
  }
  await page.screenshot({ path: 'docs/e2e/05-backfill-approved.png', fullPage: true })

  const report = {
    ok: true,
    itemId: expectedId,
    initialBackfill: initial.backfill,
    pendingAfterApproval: repeated.pending,
    statusAfterRediscovery: repeated.items.find(item => item.id === expectedId)?.status,
    changedAfterRediscovery: repeated.backfill.changed,
    screenshots: ['docs/e2e/04-backfill-official.png', 'docs/e2e/05-backfill-approved.png'],
    pageErrors: errors,
    consoleErrors: consoleMessages,
  }
  await writeFile('docs/e2e/backfill-result.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (errors.length > 0 || consoleMessages.length > 0) {
    throw new Error(`Browser errors: ${[...errors, ...consoleMessages].join('; ')}`)
  }
} catch (error) {
  await page.screenshot({ path: 'docs/e2e/backfill-failure.png', fullPage: true }).catch(() => {})
  console.error(JSON.stringify({ ok: false, error: error.message, pageErrors: errors, consoleErrors: consoleMessages }, null, 2))
  throw error
} finally {
  await browser.close()
}
