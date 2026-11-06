import { join, resolve } from 'node:path'
import { executeOfficialPresent } from '../test/helpers/official-present.js'

const home = process.argv[2]
if (!home) throw new Error('Usage: node scripts/seed-official-backfill.mjs DSH_HOME')
const root = resolve(home)
const result = await executeOfficialPresent({
  workspace: join(root, 'workspace'),
  persistenceRoot: join(root, 'sessions'),
  sessionId: 'preinstall-official-session',
  callId: 'preinstall-present-call',
  fileName: 'preinstall-review.md',
  content: '# Historical official delivery\n\nThis artifact was produced and persisted before Review Outbox was installed.\n',
  description: 'Pre-installation official present delivery',
})
console.log(JSON.stringify({
  ok: true,
  home: root,
  sessionId: result.header.id,
  eventSeq: result.delivery.seq,
  callId: result.delivery.data.callId,
  files: result.delivery.data.files,
  log: result.stored.location,
}, null, 2))
