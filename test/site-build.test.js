import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { validateIndexNowConfig } from '../scripts/indexnow-config.mjs'

const root = resolve(import.meta.dirname, '..')

test('research site builds are idempotent across local and public origins', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'review-outbox-site-'))
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(directory, { recursive: true, force: true })))
  const pageDirectory = resolve(directory, 'site/research-report')
  await mkdir(resolve(directory, 'docs/e2e'), { recursive: true })
  await mkdir(pageDirectory, { recursive: true })
  const indexNowSource = await readFile(resolve(root, 'indexnow.json'), 'utf8')
  await writeFile(resolve(directory, 'indexnow.json'), indexNowSource)
  const publishedIndexSource = await readFile(resolve(root, 'site/plugins.json'), 'utf8')
  await mkdir(resolve(directory, 'site'), { recursive: true })
  await writeFile(resolve(directory, 'site/plugins.json'), publishedIndexSource)
  const publishedRelease = JSON.parse(publishedIndexSource).plugins[0].versions[0]
  const pluginVersion = publishedRelease.version
  const pinnedCommit = publishedRelease.source.commit
  await writeFile(resolve(pageDirectory, 'index.html'), '<!doctype html><html><head><title>Fixture</title></head><body><p contenteditable="true"><a href="receipt-example.html">Receipt</a></p></body></html>')
  const handbookSource = await readFile(resolve(root, 'docs/OPERATIONS.md'), 'utf8')
  await writeFile(resolve(directory, 'docs/OPERATIONS.md'), handbookSource)
  const checklistSource = await readFile(resolve(root, 'docs/checklist.txt'), 'utf8')
  await writeFile(resolve(directory, 'docs/checklist.txt'), checklistSource)
  const troubleshootingSource = await readFile(resolve(root, 'docs/TROUBLESHOOTING.md'), 'utf8')
  await writeFile(resolve(directory, 'docs/TROUBLESHOOTING.md'), troubleshootingSource)
  const receipt = await readFile(resolve(root, 'docs/e2e/application-first-value.review.html'), 'utf8')
  await writeFile(resolve(directory, 'docs/e2e/application-first-value.review.html'), receipt)

  for (const origin of ['http://127.0.0.1:43227', 'https://zjukop3.github.io/dsh-review-outbox']) {
    const result = spawnSync(process.execPath, [resolve(root, 'scripts/build-research-site.mjs')], {
      cwd: directory,
      env: { ...process.env, PUBLIC_ORIGIN: origin },
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
  }

  const html = await readFile(resolve(pageDirectory, 'index.html'), 'utf8')
  const repeated = spawnSync(process.execPath, [resolve(root, 'scripts/build-research-site.mjs')], {
    cwd: directory,
    env: { ...process.env, PUBLIC_ORIGIN: 'https://zjukop3.github.io/dsh-review-outbox' },
    encoding: 'utf8',
  })
  assert.equal(repeated.status, 0, repeated.stderr)
  assert.equal(await readFile(resolve(pageDirectory, 'index.html'), 'utf8'), html)
  const publicOrigin = 'https://zjukop3.github.io/dsh-review-outbox'
  assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1)
  assert.equal((html.match(/<meta property="og:url"/g) || []).length, 1)
  assert.equal((html.match(/<script type="application\/ld\+json">/g) || []).length, 1)
  assert.equal((html.match(/<link rel="icon"/g) || []).length, 1)
  assert.equal((html.match(/<script>document\.querySelectorAll/g) || []).length, 1)
  assert.match(html, new RegExp(`<link rel="canonical" href="${publicOrigin}/research-report/">`))
  assert.match(html, new RegExp(`<meta property="og:image" content="${publicOrigin}/research-report/first-value.png">`))
  assert.doesNotMatch(html, /127\.0\.0\.1/)
  const indexNow = JSON.parse(indexNowSource)
  assert.equal(await readFile(resolve(directory, `site/${indexNow.key}.txt`), 'utf8'), `${indexNow.key}\n`)
  assert.throws(() => validateIndexNowConfig({ ...indexNow, keyLocation: 'https://zjukop3.github.io/other/08986ba4f300c03bb388875263d41845.txt' }), /inside urlPrefix/)
  assert.throws(() => validateIndexNowConfig({ ...indexNow, endpoint: 'http://www.bing.com/indexnow' }), /must use HTTPS/)

  const schemas = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
  assert.deepEqual(schemas.map(schema => schema['@type']), ['TechArticle', 'FAQPage', 'SoftwareApplication'])
  assert.equal(schemas[0].dateModified, '2026-11-09')
  assert.equal(schemas[2].softwareVersion, pluginVersion)
  assert.equal(schemas[2].installUrl, 'https://zjukop3.github.io/dsh-review-outbox/plugins.json')
  const catalogUrl = 'https://awesome-dsh-plugin.com/p/zjukop3/dsh-review-outbox/'
  assert.ok(schemas[2].sameAs.includes(catalogUrl))
  const home = await readFile(resolve(directory, 'site/index.html'), 'utf8')
  const versionText = pluginVersion.replace(/\./g, '\\.')
  assert.match(home, new RegExp(`href="${catalogUrl}"`))
  assert.match(home, new RegExp(`在 DSH 中安装 ${versionText}`))
  assert.match(home, new RegExp(`github:zjukop3/dsh-review-outbox#${pinnedCommit}`))
  assert.match(home, /旧版 0\.1\.0 tarball/)
  const llms = await readFile(resolve(directory, 'site/llms.txt'), 'utf8')
  assert.match(llms, new RegExp(catalogUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(llms, /application-first-value\.json/)
  assert.match(llms, /0\.1\.x validation/)
  const example = await readFile(resolve(pageDirectory, 'receipt-example.html'), 'utf8')
  assert.equal((example.match(/<link rel="icon"/g) || []).length, 1)
  assert.match(example, /utm_source=review-receipt&amp;utm_medium=artifact/)
  assert.match(await readFile(resolve(directory, 'site/sitemap.xml'), 'utf8'), new RegExp(`<loc>${publicOrigin}/</loc>`))

  const renderedPage = await readFile(resolve(root, 'site/research-report/index.html'), 'utf8')
  assert.doesNotMatch(renderedPage, /href=["']<a\b/)
  assert.match(renderedPage, /dsh-research-report/)
  assert.match(renderedPage, /href="https:\/\/awesome-dsh-plugin\.com\/p\/zjukop3\/dsh-review-outbox\/"/)
  assert.match(renderedPage, new RegExp(`dsh plugin --profile web add 'github:zjukop3/dsh-review-outbox#${pinnedCommit}'`))
  const headingVersion = (renderedPage.match(/安装 Review Outbox (\d+\.\d+\.\d+)/) || [])[1]
  assert.equal(headingVersion, pluginVersion, 'landing install heading must match the published index version')
  assert.match(renderedPage, /src="first-value.png"/)
  assert.match(renderedPage, /旧版 tarball/)

  const handbook = await readFile(resolve(root, 'site/operations/index.html'), 'utf8')
  assert.match(handbook, /<h1>DSH 插件发布与收录：实测约束清单<\/h1>/)
  assert.match(handbook, /<table>/, 'the handbook keeps its measured-constraint tables')
  assert.match(handbook, /04:49:06Z/, 'the catalog build cadence stays quoted')
  assert.match(handbook, new RegExp(`href="${publicOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/operations/"`), 'sitemap and page agree on the canonical handbook URL')
  assert.doesNotMatch(handbook, /\u0000/, 'inline placeholders must all be restored')
  assert.doesNotMatch(handbook, /\]\(metrics\//, 'relative doc links must not leak into the published page')
  assert.match(await readFile(resolve(directory, 'site/sitemap.xml'), 'utf8'), new RegExp(`<loc>${publicOrigin}/operations/</loc>`))
  assert.match(await readFile(resolve(directory, 'site/llms.txt'), 'utf8'), /Measured constraints on publishing, catalog ingestion/)
  const troubleshooting = await readFile(resolve(root, 'site/troubleshooting/index.html'), 'utf8')
  assert.match(troubleshooting, /ERR_PNPM_NO_MATCHING_VERSION/, 'the symptom-first page names the error people search for')
  assert.match(troubleshooting, /这不是故障/, 'and says plainly when a mismatch is not a fault')
  assert.match(await readFile(resolve(directory, 'site/sitemap.xml'), 'utf8'), new RegExp(`<loc>${publicOrigin}/troubleshooting/</loc>`))
  const checklistText = await readFile(resolve(directory, 'site/checklist.txt'), 'utf8')
  assert.equal(await readFile(resolve(directory, 'site/research-report/checklist.txt'), 'utf8'), checklistText, 'the relative link target exists beside the page')
  assert.match(checklistText, /研究报告验收清单（可复制）/, 'the plain-text checklist ships with the site')
  assert.match(checklistText, /四项必填/, 'and states the four required checks')
  const landing = await readFile(resolve(root, 'site/research-report/index.html'), 'utf8')
  assert.match(landing, /不装插件也能用的清单/, 'the page admits the checklist works without the plugin')
  assert.match(landing, /href="checklist\.txt"/, 'and links the plain-text copy')
  assert.match(landing, /downloads\/review-outbox-checklist\.docx/, 'the fillable Word template is linked')
  assert.match(landing, /downloads\/review-outbox-checklist\.pdf/, 'and the PDF')
})
