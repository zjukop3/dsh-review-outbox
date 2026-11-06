import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OutboxStore } from '../src/store.js'

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'review-outbox-store-'))
  return join(directory, 'items.json')
}

function record(seq = 1) {
  return {
    id: 'presented:one', sourceType: 'presented', sessionId: 'session-1', eventSeq: seq,
    turn: 1, cwd: '/tmp/work', path: 'report.md', description: 'Report', status: 'pending', revision: 1,
    firstSeenAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    history: [{ at: '2026-01-01T00:00:00.000Z', action: 'observed', note: '' }],
  }
}

test('review actions and revisions survive a store reload', async () => {
  const path = await fixture()
  const store = new OutboxStore(path)
  await store.initialize()
  await store.upsert([record()])
  const approved = await store.action('presented:one', 'approve', 'checked')
  assert.equal(approved.status, 'approved')

  const reloaded = new OutboxStore(path)
  await reloaded.initialize()
  assert.equal(reloaded.get('presented:one').status, 'approved')
  assert.equal(reloaded.get('presented:one').reviewNote, 'checked')

  await reloaded.upsert([record(2)])
  const revised = reloaded.get('presented:one')
  assert.equal(revised.revision, 2)
  assert.equal(revised.status, 'pending')
  assert.equal(revised.firstSeenAt, '2026-01-01T00:00:00.000Z')
  assert.equal(revised.history.at(-1).action, 'revision')

  await reloaded.action('presented:one', 'return', 'add evidence')
  await reloaded.action('presented:one', 'reopen')
  await reloaded.action('presented:one', 'archive')
  assert.equal(reloaded.get('presented:one').status, 'archived')
  assert.equal(reloaded.get('presented:one').history.length, 6)
})

test('identical rediscovery does not reset a completed review', async () => {
  const path = await fixture()
  const store = new OutboxStore(path)
  await store.initialize()
  await store.upsert([record()])
  await store.action('presented:one', 'approve')
  const changed = await store.upsert([record()])
  assert.equal(changed, 0)
  assert.equal(store.get('presented:one').status, 'approved')
})

test('different present call ids revise one artifact and late old events do not downgrade it', async () => {
  const path = await fixture()
  const store = new OutboxStore(path)
  await store.initialize()
  const first = { ...record(1), id: 'presented:session-1:call-v1:0', callId: 'call-v1', occurrence: 0 }
  const second = { ...record(2), id: 'presented:session-1:call-v2:0', callId: 'call-v2', occurrence: 0, description: 'Version 2' }
  await store.upsert([first])
  await store.action(first.id, 'approve', 'v1 checked')
  const changed = await store.upsert([second])
  assert.equal(changed, 1)
  assert.equal(store.list().length, 1)
  assert.equal(store.get(first.id), null)
  assert.equal(store.get(second.id).revision, 2)
  assert.equal(store.get(second.id).status, 'pending')
  assert.equal(store.get(second.id).history.at(-1).action, 'revision')

  const late = await store.upsert([{ ...first, description: 'late old event' }])
  assert.equal(late, 0)
  assert.equal(store.get(second.id).eventSeq, 2)
  assert.equal(store.get(second.id).description, 'Version 2')
})

test('corrupt state becomes read-only and is never overwritten', async () => {
  const path = await fixture()
  await writeFile(path, '{broken json', 'utf8')
  const store = new OutboxStore(path)
  await store.initialize()
  assert.equal(store.readOnly, true)
  assert.match(store.error, /read-only/)
  await assert.rejects(store.action('presented:one', 'approve'), /read-only/)
  assert.equal(await readFile(path, 'utf8'), '{broken json')
})

test('unknown actions and missing items fail without mutation', async () => {
  const path = await fixture()
  const store = new OutboxStore(path)
  await store.initialize()
  await store.upsert([record()])
  await assert.rejects(store.action('presented:one', 'publish'), /Unknown action/)
  await assert.rejects(store.action('missing', 'approve'), /Item not found/)
  assert.equal(store.get('presented:one').status, 'pending')
})
