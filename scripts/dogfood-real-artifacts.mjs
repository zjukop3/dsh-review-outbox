import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { executeOfficialPresent } from '../test/helpers/official-present.js'

const home = process.argv[2]
if (!home) throw new Error('Usage: node scripts/dogfood-real-artifacts.mjs DSH_HOME')
const workspace = resolve(process.cwd(), '..')
const tasks = [
  {
    id: 'dogfood-research',
    files: [
      'dsh-ecosystem-research/REPORT.md',
      'dsh-ecosystem-research/METHODOLOGY.md',
      'dsh-ecosystem-research/data/processed/source_commits.csv',
      'dsh-ecosystem-research/data/processed/summary.json',
    ],
  },
  {
    id: 'dogfood-docs',
    files: [
      'dsh-review-outbox/README.md',
      'dsh-review-outbox/docs/STRATEGY.md',
      'dsh-review-outbox/docs/VALIDATION.md',
      'dsh-review-outbox/docs/packs/research-report.md',
    ],
  },
  {
    id: 'dogfood-host',
    files: [
      'dsh-review-outbox/src/host.js',
      'dsh-review-outbox/src/backfill.js',
      'dsh-review-outbox/src/store.js',
      'dsh-review-outbox/src/receipt.js',
    ],
  },
  {
    id: 'dogfood-client-tests',
    files: [
      'dsh-review-outbox/client/index.jsx',
      'dsh-review-outbox/client/styles.js',
      'dsh-review-outbox/test/evidence.test.js',
      'dsh-review-outbox/test/official-present.test.js',
    ],
  },
  {
    id: 'dogfood-release',
    files: [
      'dsh-review-outbox/package.json',
      'dsh-review-outbox/cordis.patch.yml',
      'dsh-review-outbox/test/host.test.js',
      'dsh-review-outbox/docs/e2e/research-receipt-result.json',
    ],
  },
]
const manifest = []
for (const task of tasks) {
  const produced = await executeOfficialPresent({
    workspace,
    persistenceRoot: resolve(home, 'sessions'),
    sessionId: task.id,
    callId: `${task.id}-v1`,
    maxFiles: 4,
    files: task.files.map(path => ({ path, description: `Dogfood ${task.id} · ${path}` })),
  })
  manifest.push({
    task: task.id,
    callId: produced.delivery.data.callId,
    eventSeq: produced.delivery.seq,
    files: produced.delivery.data.files.map(file => ({ path: file.path, description: file.description })),
  })
  console.log(`${task.id}: ${produced.delivery.data.files.length} real artifacts`)
}
await mkdir('docs/dogfood', { recursive: true })
await writeFile('docs/dogfood/manifest.json', JSON.stringify({ workspace, tasks: manifest }, null, 2))
console.log(JSON.stringify({ ok: true, tasks: manifest.length, artifacts: manifest.reduce((sum, task) => sum + task.files.length, 0) }))
