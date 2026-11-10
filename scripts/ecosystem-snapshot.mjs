// Measures the download distribution of every plugin in the DSH catalog.
//
// The interesting question for anyone publishing into this ecosystem is not
// "how many downloads did I get" but "what does this distribution look like at
// all". A single number cannot tell you whether 400 downloads is a flop or the
// top decile. This script answers that: it takes the catalog index, asks npm for
// each package's last-week downloads, and prints the shape of the whole market.
//
// Usage:
//   node scripts/ecosystem-snapshot.mjs [--index PATH] [--cache PATH]
//                                       [--package NAME] [--top N] [--json]
//   node scripts/ecosystem-snapshot.mjs --shapes N [--since YYYY-MM-DD] [--seed S]
//
// The first form answers "what does a week across the whole catalog look like".
// The second answers the question that number cannot: "is a given package's
// traffic steady, or one publish-day burst above a floor that every package
// gets". It samples N packages and reports the bands.
//
// Without --index the catalog is downloaded from npm (dsh-plugin-catalog@latest)
// and its index.json is used. Downloads are cached, so a second run is instant.

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const run = promisify(execFile)

const DOWNLOAD_API = 'https://api.npmjs.org/downloads/point/last-week'
const RANGE_API = 'https://api.npmjs.org/downloads/range'
const BULK_LIMIT = 110
const CATALOG_PACKAGE = 'dsh-plugin-catalog'

export function percentile(sorted, q) {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))
  return sorted[index]
}

// The shape of a distribution, stated in the terms a publisher actually asks:
// what does a typical plugin get, and where does a given package sit.
export function summarize(entries) {
  const values = Object.values(entries).filter(value => Number.isFinite(value))
  const sorted = [...values].sort((a, b) => a - b)
  const total = sorted.reduce((sum, value) => sum + value, 0)
  const at = q => percentile(sorted, q)
  return {
    measured: sorted.length,
    totalDownloads: total,
    mean: sorted.length ? Math.round((total / sorted.length) * 10) / 10 : 0,
    median: at(0.5),
    p25: at(0.25),
    p75: at(0.75),
    p90: at(0.9),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    zero: values.filter(value => value === 0).length,
    under10: values.filter(value => value < 10).length,
    under100: values.filter(value => value < 100).length,
    shareZero: sorted.length ? Math.round((values.filter(v => v === 0).length / sorted.length) * 1000) / 10 : 0,
    shareUnder100: sorted.length ? Math.round((values.filter(v => v < 100).length / sorted.length) * 1000) / 10 : 0,
  }
}

// Where one package sits. "top 4%" is a claim you can defend; "497 downloads" is not.
export function rank(entries, name) {
  const value = entries[name]
  if (!Number.isFinite(value)) return null
  const values = Object.values(entries).filter(v => Number.isFinite(v))
  const above = values.filter(v => v > value).length
  return {
    name,
    downloads: value,
    position: above + 1,
    of: values.length,
    topPercent: Math.round(((above + 1) / values.length) * 1000) / 10,
  }
}

// A weekly total hides whether anything happened. This reads the daily series
// instead and puts a package in one of three bands, plus flags the burst shape
// that a publish day leaves behind.
export const BANDS = [
  { id: 'floor', max: 40, label: 'at or below the floor' },
  { id: 'visible', max: 150, label: 'visible above the floor' },
  { id: 'adopted', max: Infinity, label: 'real daily use' },
]

export function classifySeries(values) {
  const days = values.filter(value => Number.isFinite(value))
  if (days.length === 0) return null
  const sorted = [...days].sort((a, b) => a - b)
  const median = percentile(sorted, 0.5)
  const max = sorted[sorted.length - 1]
  const total = days.reduce((sum, value) => sum + value, 0)
  const zeros = days.filter(value => value === 0).length
  const band = BANDS.find(candidate => median <= candidate.max).id
  return {
    median,
    max,
    total,
    zeros,
    days: days.length,
    band,
    burst: total > 0 && max >= 5 * Math.max(median, 1) && zeros <= days.length / 3,
    maxShare: total > 0 ? Math.round((max / total) * 100) / 100 : 0,
  }
}

export function summarizeShapes(series) {
  const classified = Object.entries(series)
    .map(([name, values]) => [name, classifySeries(values || [])])
    .filter(([, result]) => result)
  const count = classified.length
  const share = predicate => count ? Math.round((classified.filter(predicate).length / count) * 1000) / 10 : 0
  const medians = classified.map(([, result]) => result.median).sort((a, b) => a - b)
  return {
    measured: count,
    medianDaily: percentile(medians, 0.5),
    p25Daily: percentile(medians, 0.25),
    p75Daily: percentile(medians, 0.75),
    p90Daily: percentile(medians, 0.9),
    shareFloor: share(([, result]) => result.band === 'floor'),
    shareVisible: share(([, result]) => result.band === 'visible'),
    shareAdopted: share(([, result]) => result.band === 'adopted'),
    shareSilent: share(([, result]) => result.median <= 10),
    shareBurst: share(([, result]) => result.burst),
    shareQuiet: share(([, result]) => result.zeros >= result.days / 3),
  }
}

export function formatShapes({ summary, window, seed }) {
  const line = (label, value) => `| ${label} | ${value} |`
  return [
    `# Download shape of ${summary.measured} sampled catalog packages`,
    '',
    `Window ${window.from} to ${window.to}, sample seed ${seed}.`,
    '',
    '| | |',
    '| --- | ---: |',
    line('median package, daily downloads', summary.medianDaily),
    line('p25 / p75 daily', `${summary.p25Daily} / ${summary.p75Daily}`),
    line('p90 daily', summary.p90Daily),
    line('at or below the floor (<=40/day)', `${summary.shareFloor}%`),
    line('silent (<=10/day)', `${summary.shareSilent}%`),
    line('visible above the floor', `${summary.shareVisible}%`),
    line('real daily use (>150/day)', `${summary.shareAdopted}%`),
    line('one-burst shape', `${summary.shareBurst}%`),
    line('a third or more of days at zero', `${summary.shareQuiet}%`),
    '',
    'A package that nobody installs still records a few dozen downloads a day.',
    'Anything in the floor band therefore says nothing about whether a plugin is used.',
    '',
  ].join('\n')
}

export function formatReport({ summary, top, mine, catalog, measuredAt }) {
  const n = summary.measured.toLocaleString('en-US')
  const rows = top.map((entry, i) =>
    `| ${i + 1} | \`${entry.name}\` | ${entry.downloads.toLocaleString('en-US')} |`).join('\n')
  const mineLine = mine
    ? `\n\`${mine.name}\`: **${mine.downloads.toLocaleString('en-US')}** downloads in the last week — #${mine.position} of ${mine.of.toLocaleString('en-US')}, top ${mine.topPercent}%.\n`
    : ''
  return [
    `# DSH plugin ecosystem, downloads as of ${measuredAt}`,
    '',
    `Catalog: ${catalog.count.toLocaleString('en-US')} entries (\`${CATALOG_PACKAGE}@${catalog.version}\`, ${catalog.buildTime}).`,
    `Measured: ${n} packages with a reachable npm download record.`,
    '',
    '| | last week |',
    '| --- | ---: |',
    `| median plugin | ${summary.median.toLocaleString('en-US')} |`,
    `| p75 | ${summary.p75.toLocaleString('en-US')} |`,
    `| p90 | ${summary.p90.toLocaleString('en-US')} |`,
    `| p95 | ${summary.p95.toLocaleString('en-US')} |`,
    `| p99 | ${summary.p99.toLocaleString('en-US')} |`,
    `| max | ${summary.max.toLocaleString('en-US')} |`,
    `| mean | ${summary.mean.toLocaleString('en-US')} |`,
    '',
    `${summary.zero.toLocaleString('en-US')} packages (${summary.shareZero}%) recorded zero downloads; ` +
      `${summary.under100.toLocaleString('en-US')} (${summary.shareUnder100}%) recorded fewer than 100.`,
    mineLine,
    `## Top ${top.length}`,
    '',
    '| # | package | last week |',
    '| ---: | --- | ---: |',
    rows,
    '',
  ].join('\n')
}

async function loadCatalog({ indexPath }) {
  if (indexPath) {
    const index = JSON.parse(await readFile(indexPath, 'utf8'))
    return { index, version: 'local file', buildTime: 'local file' }
  }
  const meta = await json(`${registry()}/${CATALOG_PACKAGE}/latest`)
  const dir = await mkdtemp(join(tmpdir(), 'eco-'))
  try {
    const tarball = join(dir, 'catalog.tgz')
    const response = await fetch(meta.dist.tarball)
    await writeFile(tarball, Buffer.from(await response.arrayBuffer()))
    await run('tar', ['-xzf', tarball, '-C', dir, 'package/index.json'])
    const index = JSON.parse(await readFile(join(dir, 'package', 'index.json'), 'utf8'))
    return { index, version: meta.version, buildTime: meta.gitHead ? `commit ${meta.gitHead.slice(0, 7)}` : 'npm latest' }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function registry() {
  return process.env.NPM_REGISTRY || 'https://registry.npmjs.org'
}

async function json(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return response.json()
}

// npm's bulk endpoint takes comma-separated names but not scoped ones, so scoped
// packages are asked one at a time. That asymmetry is the whole reason this
// costs a few minutes instead of a few seconds.
export async function collectDownloads(names, { cache = {}, concurrency = 6, quiet = false, fetchJson = json } = {}) {
  const out = { ...cache }
  const todo = names.filter(name => !Number.isFinite(out[name]))
  const plain = todo.filter(name => !name.startsWith('@'))
  const scoped = todo.filter(name => name.startsWith('@'))

  for (let i = 0; i < plain.length; i += BULK_LIMIT) {
    const group = plain.slice(i, i + BULK_LIMIT)
    const payload = await fetchJson(`${DOWNLOAD_API}/${group.join(',')}`)
    if (payload && Number.isFinite(payload.downloads) && group.length === 1) {
      out[group[0]] = payload.downloads
    } else if (payload && typeof payload === 'object') {
      for (const [name, value] of Object.entries(payload)) {
        if (value && Number.isFinite(value.downloads)) out[name] = value.downloads
      }
    }
    if (!quiet) process.stderr.write(`\rbulk ${Math.min(i + BULK_LIMIT, plain.length)}/${plain.length}`)
  }

  for (let i = 0; i < scoped.length; i += concurrency) {
    const group = scoped.slice(i, i + concurrency)
    const results = await Promise.all(group.map(async name => {
      try {
        const payload = await fetchJson(`${DOWNLOAD_API}/${name}`)
        return Number.isFinite(payload.downloads) ? [name, payload.downloads] : null
      } catch {
        return null
      }
    }))
    for (const entry of results) if (entry) out[entry[0]] = entry[1]
    if (!quiet) process.stderr.write(`\rscoped ${Math.min(i + concurrency, scoped.length)}/${scoped.length}`)
  }
  if (!quiet) process.stderr.write('\n')
  return out
}

// Deterministic sampling so two people running this get the same packages.
export function sampleNames(names, count, seed) {
  const pool = [...names].sort()
  let state = seed >>> 0
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
  const picked = new Set()
  const limit = Math.min(count, pool.length)
  while (picked.size < limit) picked.add(Math.floor(next() * pool.length))
  return [...picked].map(index => pool[index])
}

// The range endpoint is rate limited hard, so this goes one at a time with a
// small pace and caches every answer. A 200-package sample takes minutes.
export async function collectSeries(names, { from, to, cache = {}, pace = 250, backoff = 1500, quiet = false, fetchJson = json } = {}) {
  const out = {}
  for (const [index, name] of names.entries()) {
    const key = `${name}@${from}:${to}`
    if (Array.isArray(cache[key])) {
      out[name] = cache[key]
      continue
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const payload = await fetchJson(`${RANGE_API}/${from}:${to}/${name}`)
        const values = (payload.downloads || []).map(day => day.downloads)
        if (values.length > 0) {
          out[name] = values
          cache[key] = values
        }
        break
      } catch {
        // A package npm has no history for simply does not enter the sample; a
        // rate limit is worth one more ask with a pause.
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, backoff * (attempt + 1)))
      }
    }
    if (!quiet) process.stderr.write(`\rseries ${index + 1}/${names.length}`)
    if (pace > 0) await new Promise(resolve => setTimeout(resolve, pace))
  }
  if (!quiet) process.stderr.write('\n')
  return out
}

async function main() {
  const args = process.argv.slice(2)
  const flag = name => {
    const at = args.indexOf(name)
    return at === -1 ? undefined : args[at + 1]
  }
  const asJson = args.includes('--json')
  const topCount = Number(flag('--top') || 20)
  const cachePath = flag('--cache')
  const mineName = flag('--package') || 'dsh-review-outbox'

  const catalog = await loadCatalog({ indexPath: flag('--index') })
  const names = (catalog.index.plugins || []).map(plugin => plugin.name).filter(Boolean)
  if (names.length === 0) throw new Error('catalog index has no plugins')

  let cache = {}
  if (cachePath) {
    try { cache = JSON.parse(await readFile(cachePath, 'utf8')) } catch { cache = {} }
  }

  const shapes = Number(flag('--shapes') || 0)
  if (shapes > 0) {
    const seed = Number(flag('--seed') || 20261110)
    const to = flag('--until') || new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
    const from = flag('--since') || new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10)
    const sample = sampleNames(names, shapes, seed)
    const series = await collectSeries(sample, { from, to, cache })
    if (cachePath) await writeFile(cachePath, JSON.stringify(cache, null, 2))
    const summary = summarizeShapes(series)
    if (asJson) process.stdout.write(`${JSON.stringify({ window: { from, to }, seed, summary }, null, 2)}\n`)
    else process.stdout.write(formatShapes({ summary, window: { from, to }, seed }))
    return
  }

  const downloads = await collectDownloads(names, { cache })
  if (cachePath) await writeFile(cachePath, JSON.stringify(downloads, null, 2))

  const summary = summarize(downloads)
  const top = Object.entries(downloads)
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => b[1] - a[1])
    .slice(0, topCount)
    .map(([name, value]) => ({ name, downloads: value }))
  const mine = rank(downloads, mineName)
  const measuredAt = new Date().toISOString().slice(0, 10)
  const report = { measuredAt, catalog: { count: names.length, version: catalog.version, buildTime: catalog.buildTime }, summary, top, mine, downloads }

  if (asJson) {
    const { downloads: _omit, ...rest } = report
    process.stdout.write(`${JSON.stringify(rest, null, 2)}\n`)
    return
  }
  process.stdout.write(formatReport({ summary, top, mine, catalog: { count: names.length, ...catalog }, measuredAt }))
}

// A plain `file://${argv[1]}` comparison breaks the moment the checkout path has
// a character that URL-encodes, and then the script exits 0 having done nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
