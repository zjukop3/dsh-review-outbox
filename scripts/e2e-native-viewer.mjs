import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.env.DSH_E2E_URL
if (!url) throw new Error('DSH_E2E_URL is required')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } })
const pageErrors = []
const consoleErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

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

async function showOutbox() {
  const heading = page.getByText('Deliverables review outbox', { exact: true })
  if (!(await heading.isVisible().catch(() => false))) await page.getByText('成果审阅', { exact: true }).first().click()
  await heading.waitFor({ timeout: 30_000 })
}

async function openAndVerify(name, screenshot) {
  await showOutbox()
  await page.locator('.ro-card').filter({ hasText: name }).first().click()
  await page.locator('.ro-preview').getByText(/不在本面板内嵌预览/).waitFor()
  await page.getByRole('button', { name: '在宿主 Viewer 打开', exact: true }).click()
  await page.locator('[data-pdf-preview]').waitFor({ state: 'visible', timeout: 120_000 })
  await page.locator('[data-pdf-preview] canvas').first().waitFor({ state: 'visible', timeout: 120_000 })
  await page.waitForFunction(() => (document.querySelector('[data-pdf-text]')?.textContent?.trim().length || 0) > 10, undefined, { timeout: 120_000 })
  const text = await page.locator('[data-pdf-text]').first().textContent()
  await page.screenshot({ path: screenshot, fullPage: true })
  return { name, textLength: text.trim().length, titlePresent: text.includes('DSH') }
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await dismissModals()
  await page.waitForFunction(async () => {
    const response = await fetch('/review-outbox/api/items')
    if (!response.ok) return false
    const state = await response.json()
    return state.backfill?.status === 'ready' && state.items.length === 2
  }, undefined, { timeout: 60_000 })
  await dismissModals()
  await showOutbox()
  await dismissModals()
  const docx = await openAndVerify('research-viewer.docx', 'docs/e2e/07-docx-native-viewer.png')
  const pdf = await openAndVerify('research-viewer.pdf', 'docs/e2e/08-pdf-native-viewer.png')
  const report = { ok: true, docx, pdf, pageErrors, consoleErrors }
  await mkdir('docs/e2e', { recursive: true })
  await writeFile('docs/e2e/native-viewer-result.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (pageErrors.length || consoleErrors.length) throw new Error([...pageErrors, ...consoleErrors].join('; '))
} catch (error) {
  const diagnostics = await page.evaluate(() => ({
    outboxError: document.querySelector('.ro-error')?.textContent,
    viewerFailures: [...document.querySelectorAll('[data-textpreview-failed],[role=alert]')].map(element => element.textContent),
    bodyTail: document.body.innerText.slice(-3000),
  })).catch(() => ({}))
  await page.screenshot({ path: 'docs/e2e/native-viewer-failure.png', fullPage: true }).catch(() => {})
  console.error(JSON.stringify({ ok: false, error: error.message, diagnostics, pageErrors, consoleErrors }, null, 2))
  throw error
} finally {
  await browser.close()
}
