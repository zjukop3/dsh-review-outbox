import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { backfillPresented } from '../src/backfill.js'
import { previewItem } from '../src/preview.js'
import { OutboxStore } from '../src/store.js'
import { executeOfficialPresent } from './helpers/official-present.js'

test('two real present calls for the same artifact form one revision history', async t => {
  const root = await mkdtemp(join(tmpdir(), 'review-outbox-real-revision-'))
  let reopened
  t.after(async () => {
    if (reopened) await reopened.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })
  const first = await executeOfficialPresent({
    workspace: join(root, 'workspace'),
    persistenceRoot: join(root, 'sessions'),
    sessionId: 'real-revision-session',
    callId: 'real-call-v1', fileName: 'artifact.md', content: '# Version 1\n', description: 'first delivery',
  })
  const produced = await executeOfficialPresent({
    workspace: join(root, 'workspace'),
    persistenceRoot: join(root, 'sessions'),
    sessionId: 'real-revision-session',
    resume: true,
    callId: 'real-call-v2', fileName: 'artifact.md', content: '# Version 2\n', description: 'second delivery',
  })
  assert.equal(produced.events.filter(event => event.type === 'deliverables/presented').length, 2)
  assert.notEqual(first.delivery.data.callId, produced.delivery.data.callId)

  reopened = new Context()
  await reopened.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'zstd' })
  const store = new OutboxStore(join(root, 'outbox.json'))
  await store.initialize()
  await backfillPresented({ persistence: reopened.sessionPersistence, store })
  assert.equal(store.list().length, 1)
  const item = store.list()[0]
  assert.equal(item.revision, 2)
  assert.equal(item.description, 'second delivery')
  assert.equal(item.eventSeq, produced.delivery.seq)
  assert.equal(item.history.filter(entry => entry.action === 'revision').length, 1)
})

test('official present executes, persists through JSONL, cold-reads, and enters the Outbox', async t => {
  const root = await mkdtemp(join(tmpdir(), 'review-outbox-official-present-'))
  const workspace = join(root, 'workspace')
  const persistenceRoot = join(root, 'sessions')
  let reopened
  t.after(async () => {
    if (reopened) await reopened.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })

  const produced = await executeOfficialPresent({ workspace, persistenceRoot })
  assert.deepEqual(produced.delivery.data.files, [{
    path: await realpath(join(workspace, 'official.md')),
    description: 'Official tool integration artifact',
  }])

  reopened = new Context()
  await reopened.plugin(JsonlSessionPersistence, { root: persistenceRoot, compression: 'zstd' })
  const store = new OutboxStore(join(root, 'outbox', 'items.json'))
  await store.initialize()
  const backfilled = await backfillPresented({ persistence: reopened.sessionPersistence, store })
  assert.equal(backfilled.status, 'ready')
  assert.equal(backfilled.listed, 1)
  assert.equal(backfilled.scanned, 1)
  assert.equal(backfilled.discovered, 1)
  assert.equal(backfilled.changed, 1)

  const item = store.get('presented:official-present-session:official-present-call:0')
  assert.ok(item)
  assert.equal(item.sessionId, produced.header.id)
  assert.equal(item.eventSeq, produced.delivery.seq)
  assert.equal(item.turn, 1)
  assert.equal(item.cwd, workspace)
  assert.equal(item.description, 'Official tool integration artifact')
  const preview = await previewItem(item)
  assert.equal(preview.kind, 'text')
  assert.match(preview.content, /Produced by the official present tool/)

  await store.action(item.id, 'approve', 'official event verified')
  const repeated = await backfillPresented({ persistence: reopened.sessionPersistence, store })
  assert.equal(repeated.changed, 0)
  assert.equal(store.get(item.id).status, 'approved')
})
