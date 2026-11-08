import { chromium } from 'playwright-core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const origin = process.env.SITE_URL || 'http://127.0.0.1:43222'
const publishedIndex = JSON.parse(await readFile(resolve('site/plugins.json'), 'utf8'))
const publishedRelease = publishedIndex.plugins[0].versions[0]
const pluginVersion = publishedRelease.version
const pinnedCommit = publishedRelease.source.commit
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
const requests = []
const pageErrors = []
const consoleErrors = []
page.on('request', request => requests.push(request.url()))
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

try {
  await page.goto(`${origin}/research-report/`, { waitUntil: 'networkidle' })
  const metadata = await page.evaluate(() => {
    const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(node => JSON.parse(node.textContent)).flat()
    return {
      title: document.title,
      description: document.querySelector('meta[name=description]')?.content,
      canonical: document.querySelector('link[rel=canonical]')?.href,
      robots: document.querySelector('meta[name=robots]')?.content,
      schemaTypes: schemas.map(schema => schema['@type']),
      h1: document.querySelector('h1')?.textContent,
      checklist: document.querySelectorAll('ul.checklist li').length,
      processSteps: document.querySelectorAll('.process-step').length,
      faqQuestions: [...document.querySelectorAll('h3')].filter(node => node.textContent.includes('？')).length,
      english: [...document.querySelectorAll('section')].find(section => section.querySelector('h2')?.textContent === 'English research report acceptance checklist')?.textContent,
    }
  })
  if (!metadata.title.includes('研究报告验收清单')) throw new Error('SEO title missing')
  if (!metadata.description.includes('无需安装')) throw new Error('Description missing independent value')
  if (metadata.canonical !== `${origin}/research-report/`) throw new Error(`Unexpected canonical: ${metadata.canonical}`)
  if (!metadata.robots.includes('index,follow')) throw new Error('Page is not indexable')
  for (const type of ['TechArticle', 'FAQPage', 'SoftwareApplication']) {
    if (!metadata.schemaTypes.includes(type)) throw new Error(`Missing schema ${type}`)
  }
  if (metadata.checklist !== 5 || metadata.processSteps !== 5 || metadata.faqQuestions !== 4) {
    throw new Error(`Content components mismatch: ${JSON.stringify(metadata)}`)
  }
  if (metadata.english.includes('Harness:**')) throw new Error('Malformed English Markdown remains')
  await page.getByRole('heading', { name: '四项必填检查', exact: true }).waitFor()
  await page.getByRole('heading', { name: `安装 Review Outbox ${pluginVersion}`, exact: true }).waitFor()
  const indexCommand = await page.locator('pre code').filter({ hasText: 'plugins.json' }).textContent()
  const pinnedCommand = await page.locator('pre code').filter({ hasText: 'dsh plugin --profile web add' }).textContent()
  if (!indexCommand.includes('https://zjukop3.github.io/dsh-review-outbox/plugins.json')) throw new Error('Current Discover index is missing')
  if (!pinnedCommand.includes(`github:zjukop3/dsh-review-outbox#${pinnedCommit}`)) throw new Error(`Pinned ${pluginVersion} CLI fallback is missing`)
  const firstValueImage = page.locator('#s-04 img[alt="密封研究报告自动回填后默认显示四项必填证据"]')
  await firstValueImage.scrollIntoViewIfNeeded()
  await page.waitForFunction(() => {
    const image = document.querySelector('#s-04 img[alt="密封研究报告自动回填后默认显示四项必填证据"]')
    return image?.complete && image.naturalWidth > 0
  })
  await page.evaluate(() => window.scrollTo(0, 0))
  const demoGifLoaded = await page.evaluate(() => [...document.querySelectorAll('img[src$="demo.gif"]')].some(image => image.complete && image.naturalWidth > 0))
  if (!demoGifLoaded) throw new Error('Walkthrough demo GIF did not load')
  await page.screenshot({ path: 'docs/e2e/09-research-site.png', fullPage: true })

  await page.getByRole('link', { name: '打开一份由真实浏览器流程导出的研究报告验收单', exact: true }).click()
  await page.getByText('研究报告验收 · v1', { exact: true }).waitFor()
  await page.getByText(/公开固定提交安装后，历史密封报告自动回填/).first().waitFor()
  if (!page.url().endsWith('/research-report/receipt-example.html')) throw new Error('Receipt link failed')
  const receiptProjectLink = await page.locator('.brand a').getAttribute('href')
  if (!receiptProjectLink?.startsWith('https://zjukop3.github.io/dsh-review-outbox/?utm_source=review-receipt')) throw new Error('Receipt does not lead to the public install guide')
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: `在 DSH 中安装 ${pluginVersion}`, exact: true }).waitFor()
  const homePinnedCommand = await page.locator('details pre code').textContent()
  if (!homePinnedCommand.includes(`#${pinnedCommit}`)) throw new Error('Homepage pinned installation is missing')
  const packageName = 'dsh-review-outbox-0.1.0.tgz'
  const download = await page.request.get(`${origin}/downloads/${packageName}`)
  if (!download.ok()) throw new Error(`Tarball download failed: ${download.status()}`)
  const downloadBody = await download.body()
  const downloadSha256 = createHash('sha256').update(downloadBody).digest('hex')
  const expectedSha256 = (await readFile(resolve(`site/downloads/${packageName}.sha256`), 'utf8')).trim().split(/\s+/)[0]
  if (downloadSha256 !== expectedSha256) throw new Error('Downloaded tarball SHA-256 mismatch')
  await page.getByRole('link', { name: '打开完整清单', exact: true }).click()
  await page.getByRole('heading', { name: '四项必填检查', exact: true }).waitFor()

  await page.setViewportSize({ width: 390, height: 844 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 1) throw new Error(`Mobile horizontal overflow: ${overflow}px`)
  await page.screenshot({ path: 'docs/e2e/10-research-mobile.png', fullPage: true })

  const offline = await browser.newContext({ offline: true })
  const offlinePage = await offline.newPage()
  await offlinePage.goto(`file://${resolve('site/research-report/index.html')}`)
  await offlinePage.getByRole('heading', { name: '四项必填检查', exact: true }).waitFor()
  await offline.close()

  const externalRequests = requests.filter(url => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'))
  if (externalRequests.length > 0) throw new Error(`External resources requested: ${externalRequests.join(', ')}`)
  if (pageErrors.length || consoleErrors.length) throw new Error([...pageErrors, ...consoleErrors].join('; '))
  const report = {
    ok: true,
    metadata,
    receiptOpened: true,
    receiptFromPinnedFirstValue: true,
    currentDiscoverIndexVisible: true,
    pinnedCliFallbackVisible: true,
    firstValueImageLoaded: true,
    receiptProjectLink,
    downloadBytes: downloadBody.length,
    downloadSha256,
    mobileOverflowPx: overflow,
    offlineOpened: true,
    externalRequests,
    pageErrors,
    consoleErrors,
    screenshots: ['docs/e2e/09-research-site.png', 'docs/e2e/10-research-mobile.png'],
  }
  await mkdir('docs/e2e', { recursive: true })
  await writeFile('docs/e2e/research-site-result.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
