import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { executeOfficialPresent } from '../test/helpers/official-present.js'

const home = process.argv[2]
if (!home) throw new Error('Usage: node scripts/dogfood-redeliver.mjs DSH_HOME')
const workspace = resolve(process.cwd(), '..')
const revisions = [
  {
    id: 'dogfood-docs',
    files: [
      'dsh-review-outbox/README.md',
      'dsh-review-outbox/docs/STRATEGY.md',
      'dsh-review-outbox/docs/VALIDATION.md',
    ],
  },
  {
    id: 'dogfood-client-tests',
    files: [
      'dsh-review-outbox/client/styles.js',
      'dsh-review-outbox/test/evidence.test.js',
    ],
  },
]
const manifest = []
for (const task of revisions) {
  const produced = await executeOfficialPresent({
    workspace,
    persistenceRoot: resolve(home, 'sessions'),
    sessionId: task.id,
    resume: true,
    callId: `${task.id}-v2`,
    maxFiles: 4,
    files: task.files.map(path => ({ path, description: `Dogfood ${task.id} revision 2 · ${path}` })),
  })
  manifest.push({
    task: task.id,
    callId: produced.delivery.data.callId,
    eventSeq: produced.delivery.seq,
    files: produced.delivery.data.files.map(file => file.path),
  })
  console.log(`${task.id}: ${produced.delivery.data.files.length} revised artifacts`)
}
await mkdir('docs/dogfood', { recursive: true })
await writeFile('docs/dogfood/revisions.json', JSON.stringify({ tasks: manifest }, null, 2))
console.log(JSON.stringify({ ok: true, tasks: manifest.length, revisedArtifacts: manifest.reduce((sum, task) => sum + task.files.length, 0) }))
