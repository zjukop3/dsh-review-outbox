// One command for the monthly measurement: run the shapes sample (the third
// floor-band time point, rate-limited so it takes minutes), write it as a
// dated metrics file, then build the monthly page — which picks up the newest
// weekly meta and every shapes point automatically.
//
//   node scripts/report-monthly.mjs [--date YYYY-MM-DD] [--shapes N]
//
// The weekly meta file (catalog growth, upstream ledger) is a separate,
// deliberate step: it needs the full measurement suite and a human reading
// the ledger, so it is documented in SIGNAL-PROPOSAL.md rather than automated
// here.

import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = name => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
const date = flag('--date') || new Date().toISOString().slice(0, 10)
const shapesCount = Number(flag('--shapes') || 200)
const seed = Number(flag('--seed') || 20261110)

const shapesArgs = ['scripts/ecosystem-snapshot.mjs', '--shapes', String(shapesCount), '--seed', String(seed), '--json']
const shapesRun = spawnSync(process.execPath, shapesArgs, { encoding: 'utf8' })
if (shapesRun.status !== 0) {
  process.stderr.write(`${shapesRun.stderr || 'shapes measurement failed'}\n`)
  process.exit(shapesRun.status || 1)
}
const shapes = JSON.parse(shapesRun.stdout)
const shapesFile = resolve('docs/metrics', `${date}-shapes-point.json`)
await mkdir(resolve('docs/metrics'), { recursive: true })
await writeFile(shapesFile, `${JSON.stringify({ window: shapes.window, seed: shapes.seed, summary: shapes.summary }, null, 2)}\n`)
process.stdout.write(`shapes point: ${shapesFile} (floor ${shapes.summary.shareFloor}%)\n`)

const pageRun = spawnSync(process.execPath, ['scripts/ecosystem-monthly.mjs', '--date', date], { encoding: 'utf8' })
if (pageRun.status !== 0) {
  process.stderr.write(`${pageRun.stderr || 'monthly page failed'}\n`)
  process.exit(pageRun.status || 1)
}
process.stdout.write(pageRun.stdout)
