// Compares two usage-funnel measurements and prints the delta. The only
// adoption-bearing number is the human-decision count; artifact growth alone
// is backfill.
//
//   node scripts/funnel-compare.mjs docs/metrics/2026-11-15-usage-funnel.json docs/metrics/2026-11-17-usage-funnel.json

import { readFile } from 'node:fs/promises'

const [beforePath, afterPath] = process.argv.slice(2)
if (!beforePath || !afterPath) {
  process.stderr.write('usage: funnel-compare <before.json> <after.json>\n')
  process.exit(2)
}
const before = JSON.parse(await readFile(beforePath, 'utf8'))
const after = JSON.parse(await readFile(afterPath, 'utf8'))

const delta = (a, b) => b - a
const rows = [
  ['installed plugin version', before.installedPluginVersion || 'unknown', after.installedPluginVersion || 'unknown'],
  ['artifacts total', before.artifacts.total, after.artifacts.total],
  ['sessions', before.artifacts.sessions, after.artifacts.sessions],
  ['pending count', before.pending.count, after.pending.count],
  ['human decisions', before.humanDecisions.total, after.humanDecisions.total],
]
const lines = rows.map(([label, a, b]) => {
  const numeric = typeof a === 'number' && typeof b === 'number'
  const change = numeric ? ` (delta ${delta(a, b) >= 0 ? '+' : ''}${delta(a, b)})` : ''
  return `${label}: ${a} -> ${b}${change}`
})

const adoptionSignal = after.humanDecisions.total > (before.humanDecisions.total || 0)
  ? `ADOPTION SIGNAL: ${after.humanDecisions.total - (before.humanDecisions.total || 0)} new human decision(s), first ${after.humanDecisions.first || 'n/a'}.`
  : 'No new human decisions — pending depth alone is not adoption.'
process.stdout.write(`${lines.join('\n')}\n${adoptionSignal}\n`)
