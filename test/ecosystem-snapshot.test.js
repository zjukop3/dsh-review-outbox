import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collectDownloads, collectSeries, classifySeries, formatReport, formatShapes,
  percentile, rank, sampleNames, summarize, summarizeShapes,
} from '../scripts/ecosystem-snapshot.mjs'

test('percentile clamps at both ends instead of going out of bounds', () => {
  const sorted = [1, 2, 3, 4]
  assert.equal(percentile(sorted, 0), 1)
  assert.equal(percentile(sorted, 0.5), 3)
  assert.equal(percentile(sorted, 1), 4)
  assert.equal(percentile([], 0.5), 0)
})

test('summary states where the mass of the ecosystem actually is', () => {
  const entries = {
    a: 0, b: 0, c: 0, d: 1, e: 9, f: 99, g: 400, h: 5000,
  }
  const summary = summarize(entries)
  assert.equal(summary.measured, 8)
  assert.equal(summary.totalDownloads, 5509)
  assert.equal(summary.zero, 3)
  assert.equal(summary.under100, 6)
  assert.equal(summary.shareZero, 37.5)
  assert.equal(summary.max, 5000)
  assert.ok(summary.p90 >= summary.median)
  assert.ok(summary.median <= summary.p75 && summary.p75 <= summary.p95)
})

test('rank turns a download count into a defensible position', () => {
  const entries = { small: 10, mine: 100, big: 1000 }
  const placement = rank(entries, 'mine')
  assert.deepEqual(placement, { name: 'mine', downloads: 100, position: 2, of: 3, topPercent: 66.7 })
  assert.equal(rank(entries, 'absent'), null)
})

test('missing packages are not counted as zero-download results', () => {
  const summary = summarize({ a: 5, b: undefined, c: 'nope' })
  assert.equal(summary.measured, 1)
  assert.equal(summary.zero, 0)
})

test('bulk and scoped queries both land, and a cached name is not asked twice', async () => {
  const asked = []
  const fetchJson = async url => {
    asked.push(url)
    const names = url.slice(url.lastIndexOf('/') + 1)
    if (!names.includes(',')) return { downloads: 7, package: names }
    return Object.fromEntries(names.split(',').map((name, index) => [name, { downloads: index + 1, package: name }]))
  }
  const names = ['alpha', 'beta', '@scope/gamma', '@scope/delta']
  const downloads = await collectDownloads(names, { fetchJson, quiet: true, concurrency: 2 })
  assert.deepEqual(downloads, { alpha: 1, beta: 2, '@scope/gamma': 7, '@scope/delta': 7 })
  assert.equal(asked.filter(url => url.includes(',')).length, 1)

  const again = await collectDownloads(names, { fetchJson: async () => { throw new Error('should not ask') }, cache: downloads, quiet: true })
  assert.deepEqual(again, downloads)
})

test('the report names the median before it names the winner', () => {
  const summary = summarize({ a: 0, b: 3, c: 100 })
  const report = formatReport({
    summary,
    top: [{ name: 'c', downloads: 100 }],
    mine: rank({ a: 0, b: 3, c: 100 }, 'b'),
    catalog: { count: 3, version: '1.2.3', buildTime: 'commit abc1234' },
    measuredAt: '2026-11-10',
  })
  assert.match(report, /median plugin \| 3/)
  assert.match(report, /`b`: \*\*3\*\* downloads/)
  assert.ok(report.indexOf('median plugin') < report.indexOf('## Top 1'))
  assert.match(report, /dsh-plugin-catalog@1\.2\.3/)
})

test('a floor-level package and a burst package are not the same shape', () => {
  const steady = classifySeries(Array.from({ length: 30 }, (_, i) => 25 + (i % 4)))
  const burst = classifySeries([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 497])
  const used = classifySeries(Array.from({ length: 30 }, (_, i) => 800 + i * 10))
  assert.equal(steady.band, 'floor')
  assert.equal(steady.burst, false)
  assert.equal(burst.band, 'floor')
  assert.equal(burst.median, 0)
  assert.equal(burst.maxShare, 1)
  assert.equal(used.band, 'adopted')
  assert.equal(classifySeries([]), null)
})

test('shape summary reports shares, not just averages', () => {
  const series = {
    a: Array(30).fill(5),
    b: Array(30).fill(30),
    c: Array(30).fill(120),
    d: Array(30).fill(900),
    e: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400],
  }
  const summary = summarizeShapes(series)
  assert.equal(summary.measured, 5)
  assert.equal(summary.shareFloor, 60)
  assert.equal(summary.shareVisible, 20)
  assert.equal(summary.shareAdopted, 20)
  assert.equal(summary.shareSilent, 40)
  assert.equal(summary.shareQuiet, 20)  // only the burst package has a third of its days at zero
})

test('sampling is deterministic and does not repeat a package', () => {
  const pool = Array.from({ length: 500 }, (_, i) => `pkg-${i}`)
  const a = sampleNames(pool, 40, 7)
  const b = sampleNames(pool, 40, 7)
  assert.deepEqual(a, b)
  assert.equal(new Set(a).size, 40)
  assert.notDeepEqual(sampleNames(pool, 40, 8), a)
  assert.equal(sampleNames(pool, 10_000, 1).length, 500)
})

test('series fetching caches per window and skips unknown packages', async () => {
  const asked = []
  const cache = {}
  const fetchJson = async url => {
    asked.push(url)
    if (url.endsWith('/ghost')) throw new Error('404')
    return { downloads: [{ day: '2026-11-01', downloads: 4 }, { day: '2026-11-02', downloads: 6 }] }
  }
  const first = await collectSeries(['a', 'ghost', 'b'], { from: '2026-11-01', to: '2026-11-02', cache, pace: 0, backoff: 0, quiet: true, fetchJson })
  assert.ok(asked.every(url => /^https:\/\/api\.npmjs\.org\/downloads\/range\/2026-11-01:2026-11-02\//.test(url)),
    `range urls must not keep the point endpoint's window segment: ${asked[0]}`)
  assert.deepEqual(first, { a: [4, 6], b: [4, 6] })
  assert.equal(cache['a@2026-11-01:2026-11-02'].length, 2)
  const askedBefore = asked.length
  const second = await collectSeries(['a', 'b'], { from: '2026-11-01', to: '2026-11-02', cache, pace: 0, backoff: 0, quiet: true, fetchJson })
  assert.deepEqual(second, first)
  assert.equal(asked.length, askedBefore)
})

test('the shapes report leads with the floor, not the leaders', () => {
  const series = { a: Array(30).fill(900), b: Array(30).fill(20) }
  const report = formatShapes({
    summary: summarizeShapes(series), window: { from: '2026-10-10', to: '2026-11-08' }, seed: 7,
  })
  assert.match(report, /at or below the floor/)
  assert.ok(report.indexOf('at or below the floor') < report.indexOf('real daily use'))
  assert.match(report, /seed 7/)
})
