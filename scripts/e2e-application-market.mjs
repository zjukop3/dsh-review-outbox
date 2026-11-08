import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const release = JSON.parse(await readFile(new URL('../market-release.json', import.meta.url), 'utf8'))
const url = process.env.DSH_E2E_URL
const indexUrl = process.env.DSH_MARKET_INDEX_URL || 'https://zjukop3.github.io/dsh-review-outbox/plugins.json'
const expectedCommit = process.env.DSH_E2E_COMMIT || release.commit
const expectedVersion = process.env.DSH_E2E_VERSION || packageJson.version
const researchFirstValue = process.env.DSH_E2E_RESEARCH_FIRST_VALUE === '1'
const resumeInstalled = process.env.DSH_E2E_RESUME_INSTALLED === '1'
const installationDriver = process.env.DSH_E2E_INSTALLATION_DRIVER || (resumeInstalled ? 'preinstalled public source' : 'public Discover')
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

async function ensureBundleEnabled(name) {
  const toggle = page.locator(`button[aria-label="启用 ${name}"]`)
  await toggle.waitFor({ state: 'visible', timeout: 30_000 })
  if (await toggle.getAttribute('aria-checked') !== 'true') await toggle.click()
  await page.waitForFunction(label => {
    const element = document.querySelector(`button[aria-label="启用 ${label}"]`)
    return element?.getAttribute('aria-checked') === 'true'
  }, name, { timeout: 30_000 })
}

async function completeResearchFirstValue() {
  const cards = page.locator('.ro-card')
  await page.waitForFunction(() => document.querySelectorAll('.ro-card').length === 2, undefined, { timeout: 20_000 })
  assert.equal(await cards.count(), 2)
  await cards.filter({ hasText: 'manifest.json' }).first().click()
  assert.equal(await page.getByLabel('场景验收包', { exact: true }).inputValue(), '')
  await cards.filter({ hasText: 'report.md' }).first().click()
  await page.getByText('必填证据 0/4', { exact: true }).waitFor({ timeout: 15_000 })
  assert.equal(await page.getByLabel('场景验收包', { exact: true }).inputValue(), 'research-report')
  await page.locator('.ro-preview').filter({ hasText: 'c-size' }).waitFor({ timeout: 15_000 })
  const approve = page.getByRole('button', { name: '通过', exact: true })
  assert.equal(await approve.isDisabled(), true)
  await page.screenshot({ path: 'docs/e2e/19-application-first-value.png', fullPage: true })

  const notes = [
    ['claims-evidence', '核心结论有对应证据', 'Appendix A 的 c-size、c-growth、c-share 均为 verified；manifest 中有 3 条 verdict 和 3 条 evidence。'],
    ['citations-accessible', '引用来源可复核', '三份固定证据 market-size、growth、players 已登记到真实 ledger，可逐项复核；未声称外部 URL 已访问。'],
    ['data-scope', '数据时间与统计口径明确', '1,280 亿元、11.3% 与 57% 已对固定快照复核；数字口径仅限本次合成研究夹具。'],
    ['method-limitations', '方法与限制已披露', '本次为无网络固定证据的应用内安装验收，只证明真实工作流，不外推为行业研究结论。'],
  ]
  for (const [checkId, label, detail] of notes) {
    const row = page.locator('.ro-check').filter({ hasText: label })
    await row.locator('textarea').fill(detail)
    const saved = page.waitForResponse(response => {
      if (!response.url().endsWith('/review-outbox/api/check') || response.request().method() !== 'POST') return false
      const body = response.request().postData() || ''
      return body.includes(`"checkId":"${checkId}"`) && body.includes('"checked":true')
    }, { timeout: 20_000 })
    await row.locator('input[type=checkbox]').click()
    assert.equal((await saved).status(), 200)
  }
  await page.getByText('必填证据 4/4', { exact: true }).waitFor({ timeout: 15_000 })
  assert.equal(await approve.isEnabled(), true)
  const reviewNote = '公开固定提交安装后，历史密封报告自动回填并默认携带验收包；四项证据已复核。'
  await page.locator('.ro-note').fill(reviewNote)
  const approvedResponse = page.waitForResponse(response => response.url().endsWith('/review-outbox/api/action')
    && response.request().method() === 'POST'
    && (response.request().postData() || '').includes('"action":"approve"'), { timeout: 20_000 })
  await approve.click()
  const approved = await approvedResponse
  assert.equal(approved.status(), 200)
  const approvedItem = (await approved.json()).item
  assert.equal(approvedItem.status, 'approved')
  assert.match(approvedItem.reviewEvidence.digest, /^[a-f0-9]{64}$/)

  const downloadEvent = page.waitForEvent('download', { timeout: 20_000 })
  await page.getByRole('button', { name: '导出验收单', exact: true }).click()
  const download = await downloadEvent
  const receiptPath = 'docs/e2e/application-first-value.review.html'
  await download.saveAs(receiptPath)
  const receipt = await readFile(receiptPath, 'utf8')
  assert.match(receipt, /研究报告验收/)
  assert.match(receipt, /当前文件与审阅时摘要一致/)
  assert.match(receipt, /公开固定提交安装后，历史密封报告自动回填/)
  assert.doesNotMatch(receipt, /<script\b/i)
  assert.doesNotMatch(receipt, /review-outbox-first-value/)
  assert.match(receipt, /https:\/\/zjukop3\.github\.io\/dsh-review-outbox\/\?utm_source=review-receipt&amp;utm_medium=artifact&amp;utm_campaign=review-outbox/)
  await page.screenshot({ path: 'docs/e2e/20-application-first-approved.png', fullPage: true })
  return {
    discoveredArtifacts: 2,
    sourceType: 'research-report',
    defaultPackAttached: true,
    manifestPackDetached: true,
    initialRequiredProgress: '0/4',
    completedRequiredProgress: '4/4',
    approved: true,
    reviewedDigest: approvedItem.reviewEvidence.digest,
    reviewNote,
    receiptPath,
    receiptFilename: download.suggestedFilename(),
    receiptScriptFree: true,
    receiptOmitsTemporaryPaths: true,
    receiptProjectLink: 'https://zjukop3.github.io/dsh-review-outbox/?utm_source=review-receipt&utm_medium=artifact&utm_campaign=review-outbox',
  }
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await dismissOverlays()
  await openPlugins()

  if (!resumeInstalled) {
    await ensureBundleEnabled('自定义插件索引')
    await page.waitForTimeout(2500)
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
    assert.ok(discoveryText.includes(`${expectedVersion} · zjukop3`))
    if (!researchFirstValue) await page.screenshot({ path: 'docs/e2e/17-application-market.png', fullPage: true })

    await installCardButton.click()
    const confirmation = page.locator('[role=dialog]')
    await confirmation.getByText(expectedVersion, { exact: true }).waitFor({ timeout: 15_000 })
    await confirmation.getByText(expectedCommit, { exact: true }).waitFor({ timeout: 15_000 })
    await confirmation.locator('button:text-is("安装")').click()
    const installing = page.getByText('插件安装中…', { exact: true })
    await installing.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    await installing.waitFor({ state: 'hidden', timeout: 180_000 })
    await page.locator('button[aria-label="在已安装中查看 Review Outbox · 成果审阅与研究报告验收"]').waitFor({ state: 'visible', timeout: 600_000 })
    await dismissOverlays()
  }

  const installedTab = page.getByRole('tab', { name: '已安装', exact: true })
  if (await installedTab.count()) await installedTab.click()
  await page.locator('button[aria-label="查看 dsh-review-outbox"]').waitFor({ state: 'visible', timeout: 30_000 })
  await ensureBundleEnabled('dsh-review-outbox')

  await page.waitForFunction(async () => {
    const response = await fetch('/review-outbox/api/health')
    if (!response.ok) return false
    const state = await response.json()
    return state.ok === true && state.backfill?.status === 'ready'
  }, undefined, { timeout: 90_000 })
  await page.locator('button[aria-label="成果审阅"]').first().click()
  await page.getByText('Deliverables review outbox', { exact: true }).waitFor({ timeout: 30_000 })
  let firstValue = null
  if (researchFirstValue) firstValue = await completeResearchFirstValue()
  else await page.locator('.ro-empty').filter({ hasText: '这里还没有成果' }).waitFor({ timeout: 15_000 })
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
  assert.equal(health.items.length, researchFirstValue ? 2 : 0)
  assert.equal(health.pending, researchFirstValue ? 1 : 0)
  if (!researchFirstValue) await page.screenshot({ path: 'docs/e2e/18-application-market-installed.png', fullPage: true })

  const report = {
    ok: pageErrors.length === 0 && consoleErrors.length === 0 && failedResponses.length === 0,
    flow: researchFirstValue
      ? `seeded real research_report → ${installationDriver} → historical backfill → default evidence pack → approve → standalone receipt`
      : 'fresh Profile → enable Discover → add format-1 index → search → install → enable plugin → native Review Outbox',
    indexUrl,
    installationDriver,
    searchQuery: resumeInstalled ? null : '研究报告',
    searchCardVisible: resumeInstalled ? null : true,
    version: expectedVersion,
    installSpec: `git+https://github.com/zjukop3/dsh-review-outbox.git#${expectedCommit}`,
    resolvedCommit: expectedCommit,
    marketSearches,
    enabledAfterInstall: true,
    backfill: health.backfill.status,
    stateError: health.stateError,
    discoveredItems: health.items.length,
    pending: health.pending,
    nativeSidebarOpened: true,
    emptyStateVisible: !researchFirstValue,
    ...(firstValue ? { researchFirstValue: firstValue } : {}),
    pageErrors,
    consoleErrors,
    failedResponses,
    screenshots: researchFirstValue
      ? ['docs/e2e/19-application-first-value.png', 'docs/e2e/20-application-first-approved.png']
      : ['docs/e2e/17-application-market.png', 'docs/e2e/18-application-market-installed.png'],
    externalActivationClaim: false,
  }
  const evidencePath = researchFirstValue ? 'docs/e2e/application-first-value.json' : 'docs/e2e/application-market.json'
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(consoleErrors, [])
  assert.deepEqual(failedResponses, [])
} finally {
  await browser.close()
}
