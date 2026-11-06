import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.env.DSH_E2E_URL
if (!url) throw new Error('DSH_E2E_URL is required')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } })
const pageErrors = []
const consoleErrors = []
const itemRequests = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('request', request => {
  const url = new URL(request.url())
  if (url.pathname === '/review-outbox/api/items') itemRequests.push(Date.now())
})

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

async function openBetterTab() {
  const heading = page.getByText('Deliverables review outbox', { exact: true })
  if (await heading.isVisible().catch(() => false)) return
  const expand = page.getByRole('button', { name: /展开底部面板|Expand bottom panel/ })
  if (await expand.isVisible().catch(() => false)) await expand.click()
  const newTab = page.getByRole('button', { name: /新建标签页|New tab/ }).first()
  await newTab.click()
  const menu = page.locator('[role=menu]')
  await menu.getByText('成果审阅', { exact: true }).click()
  await heading.waitFor({ timeout: 30_000 })
}

async function openNative(name) {
  await openBetterTab()
  await page.locator('.ro-toolbar .ro-tab').filter({ hasText: /^全部 / }).click()
  await page.locator('.ro-card').filter({ hasText: name }).first().click()
  await page.getByRole('button', { name: '在宿主 Viewer 打开', exact: true }).click()
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await dismissModals()
  await page.waitForFunction(async () => {
    const response = await fetch('/review-outbox/api/items')
    if (!response.ok) return false
    const state = await response.json()
    return state.backfill?.status === 'ready' && state.items.length === 3
  }, undefined, { timeout: 60_000 })
  await dismissModals()
  await openBetterTab()
  await page.screenshot({ path: 'docs/e2e/11-better-sidebar-outbox.png', fullPage: true })

  const visibleBefore = itemRequests.length
  await page.waitForTimeout(6200)
  const visiblePolls = itemRequests.length - visibleBefore
  if (visiblePolls < 1) throw new Error('Visible better-sidebar tab did not poll for review updates')

  await page.locator('.ro-toolbar .ro-tab').filter({ hasText: /^全部 / }).click()
  await page.locator('.ro-card').filter({ hasText: 'research-report.md' }).click()
  const reopen = page.getByRole('button', { name: '重新打开', exact: true })
  if (await reopen.isVisible().catch(() => false)) await reopen.click()
  await page.getByRole('button', { name: '通过', exact: true }).click()
  await page.waitForFunction(async () => {
    const response = await fetch('/review-outbox/api/items')
    const state = await response.json()
    return state.items.some(item => item.path.endsWith('research-report.md') && item.status === 'approved')
  })
  await page.getByRole('button', { name: '在宿主 Viewer 打开', exact: true }).click()
  await page.locator('[data-dsh-md-surface]:visible').filter({ hasText: /DeepSeek Harness 研究报告验收清单与 Review Outbox 验收包/ }).waitFor({ timeout: 60_000 })

  await openNative('research-viewer.docx')
  await page.locator('[data-pdf-preview]').waitFor({ state: 'visible', timeout: 120_000 })
  await page.locator('[data-pdf-preview] canvas').first().waitFor({ state: 'visible', timeout: 120_000 })
  await page.screenshot({ path: 'docs/e2e/12-better-sidebar-docx.png', fullPage: true })

  await openNative('research-viewer.pdf')
  await page.locator('[data-pdf-preview]').waitFor({ state: 'visible', timeout: 120_000 })
  await page.locator('[data-pdf-preview] canvas').first().waitFor({ state: 'visible', timeout: 120_000 })

  const collapse = page.getByRole('button', { name: /折叠底部面板|Collapse bottom panel/ }).last()
  await collapse.click()
  await page.getByText('Deliverables review outbox', { exact: true }).waitFor({ state: 'hidden', timeout: 10_000 })
  const hiddenBefore = itemRequests.length
  await page.waitForTimeout(6200)
  const hiddenPolls = itemRequests.length - hiddenBefore
  if (hiddenPolls !== 0) throw new Error(`Hidden better-sidebar tab continued polling ${hiddenPolls} times`)

  const report = {
    ok: true,
    betterSidebarVersion: '0.30.0',
    bottomTabOpened: true,
    markdownApproved: true,
    markdownOpened: true,
    docxNativeViewer: true,
    pdfNativeViewer: true,
    visiblePolls,
    hiddenPolls,
    pageErrors,
    consoleErrors,
    screenshots: ['docs/e2e/11-better-sidebar-outbox.png', 'docs/e2e/12-better-sidebar-docx.png'],
  }
  await mkdir('docs/e2e', { recursive: true })
  await writeFile('docs/e2e/better-sidebar-result.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (pageErrors.length || consoleErrors.length) throw new Error([...pageErrors, ...consoleErrors].join('; '))
} catch (error) {
  const diagnostics = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll('button')].map(button => button.getAttribute('aria-label') || button.textContent?.trim()).filter(Boolean).slice(-80),
    outboxError: document.querySelector('.ro-error')?.textContent,
    bodyTail: document.body.innerText.slice(-3000),
  })).catch(() => ({}))
  await page.screenshot({ path: 'docs/e2e/better-sidebar-failure.png', fullPage: true }).catch(() => {})
  console.error(JSON.stringify({ ok: false, error: error.message, diagnostics, pageErrors, consoleErrors }, null, 2))
  throw error
} finally {
  await browser.close()
}
