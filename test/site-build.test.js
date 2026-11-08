import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')

test('research site builds are idempotent across local and public origins', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'review-outbox-site-'))
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(directory, { recursive: true, force: true })))
  const pageDirectory = resolve(directory, 'site/research-report')
  await mkdir(resolve(directory, 'docs/e2e'), { recursive: true })
  await mkdir(pageDirectory, { recursive: true })
  await writeFile(resolve(pageDirectory, 'index.html'), '<!doctype html><html><head><title>Fixture</title></head><body><p contenteditable="true"><a href="receipt-example.html">Receipt</a></p></body></html>')
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
  const publicOrigin = 'https://zjukop3.github.io/dsh-review-outbox'
  assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1)
  assert.equal((html.match(/<meta property="og:url"/g) || []).length, 1)
  assert.equal((html.match(/<script type="application\/ld\+json">/g) || []).length, 1)
  assert.equal((html.match(/<link rel="icon"/g) || []).length, 1)
  assert.equal((html.match(/<script>document\.querySelectorAll/g) || []).length, 1)
  assert.match(html, new RegExp(`<link rel="canonical" href="${publicOrigin}/research-report/">`))
  assert.match(html, new RegExp(`<meta property="og:image" content="${publicOrigin}/research-report/first-value.png">`))
  assert.doesNotMatch(html, /127\.0\.0\.1/)

  const schemas = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
  assert.deepEqual(schemas.map(schema => schema['@type']), ['TechArticle', 'FAQPage', 'SoftwareApplication'])
  assert.equal(schemas[0].dateModified, '2026-11-08')
  assert.equal(schemas[2].softwareVersion, '0.1.1')
  assert.equal(schemas[2].installUrl, 'https://zjukop3.github.io/dsh-review-outbox/plugins.json')
  const catalogUrl = 'https://awesome-dsh-plugin.com/p/zjukop3/dsh-review-outbox/'
  assert.ok(schemas[2].sameAs.includes(catalogUrl))
  const home = await readFile(resolve(directory, 'site/index.html'), 'utf8')
  assert.match(home, new RegExp(`href="${catalogUrl}"`))
  assert.match(home, /在 DSH 中安装 0\.1\.1/)
  assert.match(home, /github:zjukop3\/dsh-review-outbox#9f7e608a192094272638802e77ca9b1197f8cff1/)
  assert.match(home, /旧版 0\.1\.0 tarball/)
  const llms = await readFile(resolve(directory, 'site/llms.txt'), 'utf8')
  assert.match(llms, new RegExp(catalogUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(llms, /application-first-value\.json/)
  assert.match(llms, /0\.1\.x validation/)
  const example = await readFile(resolve(pageDirectory, 'receipt-example.html'), 'utf8')
  assert.equal((example.match(/<link rel="icon"/g) || []).length, 1)
  assert.match(example, /https:\/\/github\.com\/zjukop3\/dsh-review-outbox\?utm_source=review-receipt/)
  assert.match(await readFile(resolve(directory, 'site/sitemap.xml'), 'utf8'), new RegExp(`<loc>${publicOrigin}/</loc>`))

  const renderedPage = await readFile(resolve(root, 'site/research-report/index.html'), 'utf8')
  assert.doesNotMatch(renderedPage, /href=["']<a\b/)
  assert.match(renderedPage, /dsh-research-report/)
  assert.match(renderedPage, /href="https:\/\/awesome-dsh-plugin\.com\/p\/zjukop3\/dsh-review-outbox\/"/)
  assert.match(renderedPage, /dsh plugin --profile web add 'github:zjukop3\/dsh-review-outbox#9f7e608a192094272638802e77ca9b1197f8cff1'/)
  assert.match(renderedPage, /src="first-value.png"/)
  assert.match(renderedPage, /旧版 tarball/)
})
