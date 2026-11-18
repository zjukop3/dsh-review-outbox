// Do the top packages move independently, or in lockstep?
//
// The rank-stratified burst measurement answered "is the leaderboard inflated by
// publish days" (it is not). This asks a different question the burst share
// cannot: are the top packages' daily rates independent of each other, the way
// nine different tools with different audiences would be, or do they rise and
// fall together, the way one automated client fetching all of them would?
//
// The instrument is the coefficient of variation of each package's daily series
// against the others', plus the correlation of day-over-day changes. Independent
// audiences produce spread; a single fetcher produces lockstep.
//
//   node scripts/spread-check.mjs [--top 50] [--days 30] [--json]
//
// Exit codes: 0 read ok, 2 read error.

import { collectDownloads, loadCatalog } from './ecosystem-snapshot.mjs'
import { readFile } from 'node:fs/promises'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = name => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
const asJson = args.includes('--json')
const topN = Number(flag('--top') || 50)
const days = Number(flag('--days') || 30)
const cachePath = flag('--cache') || resolve('docs/metrics', 'spread-check-cache.json')

const sleep = ms => new Promise(done => setTimeout(done, ms))

async function fetchJson(url, attempts = 4) {
  let last
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (response.status === 429) throw new Error('rate limited')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      last = error
      if (attempt === attempts) break
      await sleep(attempt * 2000)
    }
  }
  throw last
}

// loadCatalog fetches the catalog tarball from npm; a body timeout there throws
// outside every inner try and takes the process down. Retry it, then fail with a
// message that names the cause instead of an undici stack.
let catalog
for (let attempt = 1; attempt <= 4; attempt += 1) {
  try {
    catalog = await loadCatalog({ indexPath: flag('--index') })
    break
  } catch (error) {
    if (attempt === 4) {
      process.stderr.write(`cannot load the catalog (${error.message}) — retried 4 times\n`)
      process.exit(2)
    }
    process.stderr.write(`catalog fetch failed (${error.message}), retrying\n`)
    await sleep(attempt * 5000)
  }
}
const names = (catalog.index.plugins || []).map(plugin => plugin.name).filter(Boolean)

// Weekly totals first, to find the top of the distribution. collectDownloads is
// the shared implementation: it splits plain from scoped names before batching,
// because the bulk point endpoint rejects a whole batch that contains an @scope
// name — hand-rolling this loop here produced twenty HTTP 400s and an empty set.
// collectDownloads throws on a network error, and this link resets often enough
// that an unretried run dies partway and reports nothing. Hand it a fetcher that
// retries, and keep the partial result rather than losing the whole sweep.
// Reuse the shared weekly cache: the ecosystem snapshot already wrote 5,641
// entries, and re-fetching them takes twenty minutes on this link for numbers
// that have not changed.
let weeklyCache = {}
try {
  weeklyCache = JSON.parse(await readFile(resolve('docs/metrics', 'ecosystem-downloads.json'), 'utf8'))
} catch {
  weeklyCache = {}
}
const weekly = await collectDownloads(names, { quiet: true, fetchJson: fetchJson, cache: weeklyCache })
  .catch(error => {
    process.stderr.write(`weekly sweep interrupted: ${error.message} — continuing with what completed\n`)
    return {}
  })

const ranked = Object.entries(weekly)
  .filter(([, value]) => Number.isFinite(value))
  .sort((a, b) => b[1] - a[1])
  .slice(0, topN)
if (ranked.length === 0) {
  process.stderr.write('no weekly downloads collected\n')
  process.exit(2)
}

const to = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
const from = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10)

const series = {}
for (const [name] of ranked) {
  try {
    const payload = await fetchJson(`https://api.npmjs.org/downloads/range/${from}:${to}/${name}`)
    const values = (payload.downloads || []).map(day => day.downloads)
    if (values.length === days) series[name] = values
  } catch {
    // a package npm has no history for simply does not enter
  }
  await sleep(250)
}

const measured = Object.keys(series)
if (measured.length < 5) {
  process.stderr.write(`only ${measured.length} series collected — not enough to compare\n`)
  process.exit(2)
}

// Per-package tail rate: the last three days, which is what a package looks like
// once its publish burst is behind it.
const tail = {}
for (const name of measured) tail[name] = series[name].slice(-3).reduce((sum, value) => sum + value, 0) / 3
const tailValues = Object.values(tail)
const tailMean = tailValues.reduce((sum, value) => sum + value, 0) / tailValues.length
const tailVariance = tailValues.reduce((sum, value) => sum + (value - tailMean) ** 2, 0) / tailValues.length
const tailCV = Math.sqrt(tailVariance) / tailMean

// Day-over-day correlation between every pair: if one client fetches all of
// them, the day-to-day changes line up.
function pearson(a, b) {
  const n = a.length
  const meanA = a.reduce((sum, value) => sum + value, 0) / n
  const meanB = b.reduce((sum, value) => sum + value, 0) / n
  let numerator = 0
  let denominatorA = 0
  let denominatorB = 0
  for (let index = 0; index < n; index += 1) {
    const da = a[index] - meanA
    const db = b[index] - meanB
    numerator += da * db
    denominatorA += da * da
    denominatorB += db * db
  }
  return denominatorA === 0 || denominatorB === 0 ? 0 : numerator / Math.sqrt(denominatorA * denominatorB)
}

// Change series rather than levels: two packages can both trend down while
// being independent, but they cannot both jump on the same day unless
// something touched both.
const changes = {}
for (const name of measured) {
  const values = series[name]
  changes[name] = values.slice(1).map((value, index) => value - values[index])
}

const pairs = []
for (let i = 0; i < measured.length; i += 1) {
  for (let j = i + 1; j < measured.length; j += 1) {
    pairs.push(pearson(changes[measured[i]], changes[measured[j]]))
  }
}
pairs.sort((a, b) => a - b)
const medianPair = pairs[Math.floor(pairs.length / 2)]
const meanPair = pairs.reduce((sum, value) => sum + value, 0) / pairs.length
const upperQuartile = pairs[Math.floor(pairs.length * 0.75)]

// A shared fetcher shows up as many pairs moving together. Count how many pairs
// correlate strongly, which no set of independent audiences would produce.
const stronglyCorrelated = pairs.filter(value => value >= 0.5).length
const shareStrong = stronglyCorrelated / pairs.length

const report = {
  generatedAt: new Date().toISOString(),
  window: { from, to, days },
  topN,
  measured: measured.length,
  tail: {
    mean: Math.round(tailMean),
    coefficientOfVariation: Number(tailCV.toFixed(3)),
    values: measured.map(name => ({ name, tail: Math.round(tail[name]) })).sort((a, b) => a.tail - b.tail),
  },
  dayOverDay: {
    pairs: pairs.length,
    medianCorrelation: Number(medianPair.toFixed(3)),
    meanCorrelation: Number(meanPair.toFixed(3)),
    upperQuartile: Number(upperQuartile.toFixed(3)),
    shareCorrelatedAtLeastHalf: Number(shareStrong.toFixed(3)),
  },
  reading: null,
}
report.reading = report.dayOverDay.shareCorrelatedAtLeastHalf >= 0.25
  ? `A quarter or more of the pairs move together day to day (share ≥ 0.5: ${report.dayOverDay.shareCorrelatedAtLeastHalf}). That is what one client fetching many packages looks like, not ${measured} separate audiences. The leaderboard's levels cannot be read as popularity.`
  : `Only ${(report.dayOverDay.shareCorrelatedAtLeastHalf * 100).toFixed(1)}% of pairs move together day to day, and the median pair correlation is ${report.dayOverDay.medianCorrelation}. The top packages are not being fetched in lockstep — their movement is largely independent, so their levels are not one automated client's artefact.`

await writeFile(cachePath, JSON.stringify({ window: report.window, series }, null, 2))

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exit(0)
}

const pad = (value, width) => String(value).padEnd(width)
process.stdout.write(`# Spread check — top ${measured} packages by weekly downloads\n\n`)
process.stdout.write(`window ${from} .. ${to} (${days} days)\n\n`)
process.stdout.write(`tail rate (last 3 days): mean ${report.tail.mean}/day, coefficient of variation ${report.tail.coefficientOfVariation}\n`)
process.stdout.write(`day-over-day correlation across ${report.dayOverDay.pairs} pairs: median ${report.dayOverDay.medianCorrelation}, mean ${report.dayOverDay.meanCorrelation}, p75 ${report.dayOverDay.upperQuartile}\n`)
process.stdout.write(`pairs correlating at least 0.5: ${(report.dayOverDay.shareCorrelatedAtLeastHalf * 100).toFixed(1)}%\n\n`)
process.stdout.write(`${pad('package', 32)}${pad('tail/day', 10)}week\n`)
for (const row of [...report.tail.values].sort((a, b) => b.tail - a.tail)) {
  process.stdout.write(`${pad(row.name, 32)}${pad(row.tail, 10)}${weekly[row.name] ?? '-'}\n`)
}
process.stdout.write(`\n${report.reading}\n`)