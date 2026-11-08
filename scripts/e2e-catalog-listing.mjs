import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const detail = 'https://awesome-dsh-plugin.com/p/zjukop3/dsh-review-outbox/'
const repository = 'https://github.com/zjukop3/dsh-review-outbox'
const install = 'dsh plugin --profile web add github:zjukop3/dsh-review-outbox'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
const pageErrors = []
const consoleErrors = []
const failedResponses = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('response', response => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() }) })

try {
  await page.goto('https://awesome-dsh-plugin.com/', { waitUntil: 'networkidle', timeout: 120_000 })
  await page.locator('#q').fill('dsh-review-outbox')
  const link = page.locator('a[href="/p/zjukop3/dsh-review-outbox/"]').first()
  await link.waitFor({ state: 'visible', timeout: 30_000 })
  const card = await link.locator('xpath=ancestor::li[1]').innerText()
  assert.match(card, /zjukop3\/dsh-review-outbox/)
  assert.match(card, /Human review for DSH deliverables/)

  await link.click()
  await page.waitForURL(detail, { timeout: 30_000 })
  await page.getByRole('heading', { name: 'zjukop3/dsh-review-outbox', exact: true }).waitFor()
  const body = await page.locator('body').innerText()
  assert.match(body, /Human review for DSH deliverables/)
  assert.ok(body.includes(install))
  const readmeSectionPresent = await page.locator('section.panel.readme').count() > 0
  await page.screenshot({ path: 'docs/e2e/16-awesome-listing.png', fullPage: true })

  await page.goto('https://awesome-dsh-plugin.com/zh/p/zjukop3/dsh-review-outbox/', { waitUntil: 'networkidle', timeout: 120_000 })
  const chineseBody = await page.locator('body').innerText()
  assert.match(chineseBody, /DSH 成果人工审阅台/)
  assert.ok(chineseBody.includes(install))

  const registryResponse = await page.request.get('https://awesome-dsh-plugin.com/plugins.json', { timeout: 120_000 })
  assert.equal(registryResponse.ok(), true)
  const registry = await registryResponse.json()
  const entry = registry.plugins.find(candidate => candidate.url === repository)
  assert.ok(entry)
  assert.equal(entry.page, detail)
  assert.equal(entry.install, install)
  assert.equal(entry.category, 'workflow')
  assert.equal(entry.screenshots.length, 2)
  for (const screenshot of entry.screenshots) assert.match(screenshot, /^https:\/\/raw\.githubusercontent\.com\/zjukop3\/dsh-review-outbox\/HEAD\/assets\/storefront\//)

  const expectedMissingDiscussionRequests = failedResponses.filter(({ status, url }) => status === 404
    && url.startsWith('https://giscus.app/api/discussions?')
    && url.includes('term=plugin%3Azjukop3%2Fdsh-review-outbox'))
  const unexpectedFailedResponses = failedResponses.filter(response => !expectedMissingDiscussionRequests.includes(response))
  let expectedConsole404 = expectedMissingDiscussionRequests.length
  const unexpectedConsoleErrors = consoleErrors.filter(message => {
    if (expectedConsole404 > 0 && message === 'Failed to load resource: the server responded with a status of 404 ()') {
      expectedConsole404 -= 1
      return false
    }
    return true
  })

  const report = {
    ok: pageErrors.length === 0 && unexpectedConsoleErrors.length === 0 && unexpectedFailedResponses.length === 0,
    searchQuery: 'dsh-review-outbox',
    searchCardVisible: true,
    detail,
    chineseDetail: 'https://awesome-dsh-plugin.com/zh/p/zjukop3/dsh-review-outbox/',
    install,
    registryUpdated: registry.updated,
    registryCount: registry.count,
    capabilities: entry.capabilities,
    capabilityCheckedAt: entry.capabilityCheckedAt,
    screenshots: entry.screenshots,
    readmeSectionPresent,
    readmeRefresh: readmeSectionPresent ? 'present' : 'pending upstream daily README probe; push build uses cached data',
    pageErrors,
    consoleErrors,
    unexpectedConsoleErrors,
    failedResponses,
    unexpectedFailedResponses,
    expectedMissingDiscussionRequests,
    screenshot: 'docs/e2e/16-awesome-listing.png',
    adoptionClaim: false,
  }
  await writeFile('docs/e2e/catalog-discovery.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(unexpectedConsoleErrors, [])
  assert.deepEqual(unexpectedFailedResponses, [])
} finally {
  await browser.close()
}
