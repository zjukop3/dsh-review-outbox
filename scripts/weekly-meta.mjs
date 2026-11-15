// Assembles the weekly meta file the monthly report reads: catalog growth
// against the previous weekly, review-outbox's weekly downloads with the daily
// decomposition, and the kit repositories' GitHub clones. The upstream ledger
// is carried over from the previous file for a human to edit — threads need
// reading, not scraping.
//
//   node scripts/weekly-meta.mjs [--date YYYY-MM-DD] [--package NAME]
//
// Writes docs/metrics/<date>-ecosystem-weekly.json.

import { execFile } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { loadCatalog } from './ecosystem-snapshot.mjs'

const run = promisify(execFile)
const args = process.argv.slice(2)
const flag = name => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
const date = flag('--date') || new Date().toISOString().slice(0, 10)
const packageName = flag('--package') || 'dsh-review-outbox'

const catalog = await loadCatalog({ indexPath: flag('--index') })
const count = (catalog.index.plugins || []).filter(plugin => plugin.name).length

// previous weekly: growth comparison + the upstream ledger to carry over
const metricsDir = resolve('docs/metrics')
const previousName = (await readdir(metricsDir)).filter(name => /-ecosystem-weekly\.json$/.test(name) && !name.startsWith(date)).sort().at(-1)
const previous = previousName ? JSON.parse(await readFile(resolve(metricsDir, previousName), 'utf8')) : undefined
const previousCount = previous?.catalog?.entries

// npm range API: per-day downloads for the window ending two days ago
// (the last two days lag; zuwenyin verified that with a 40M-downloads package)
const to = new Date(Date.parse(`${date}T00:00:00Z`) - 2 * 86400000)
const from = new Date(to.getTime() - 6 * 86400000) // inclusive 7-day window
const iso = value => value.toISOString().slice(0, 10)
const range = await (await fetch(`https://api.npmjs.org/downloads/range/${iso(from)}:${iso(to)}/${packageName}`)).json()
const daily = Object.fromEntries((range.downloads || []).map(day => [day.day.slice(5), day.downloads]))
const weeklyTotal = (range.downloads || []).reduce((sum, day) => sum + day.downloads, 0)

// kit clones: the traffic API needs push access, so this goes through gh
async function clones(repo) {
  const payload = JSON.parse((await run('gh', ['api', `repos/zjukop3/${repo}/traffic/clones`])).stdout)
  return { clones: payload.count, uniques: payload.uniques }
}
const githubClones = {
  'dsh-verify-kit': await clones('dsh-verify-kit'),
  'dsh-vertical-kit': await clones('dsh-vertical-kit'),
}

const growth = previousCount
  ? { from: previousCount, on: previous?.date, delta: count - previousCount, pct: Math.round(((count - previousCount) / previousCount) * 1000) / 10 }
  : undefined

const weekly = {
  date,
  catalog: { entries: count, version: catalog.version, buildTime: catalog.buildTime, growth },
  reviewOutbox: { weekly: weeklyTotal, decomposition: { daily }, lagDays: 2 },
  kits: { githubClones, note: previous?.kits?.note },
  upstream: previous?.upstream || { note: 'carry over and edit: read the threads before publishing' },
}

const target = resolve(metricsDir, `${date}-ecosystem-weekly.json`)
await writeFile(target, `${JSON.stringify(weekly, null, 2)}\n`)
console.log(JSON.stringify({ ok: true, target, entries: count, previousCount, weeklyTotal, daily }, null, 2))
