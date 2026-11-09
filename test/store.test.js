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

test('research-report deliveries keep artifact identity across call ids and sources', async () => {
  const path = await fixture()
  const store = new OutboxStore(path)
  await store.initialize()
  const first = { ...record(10), id: 'research-report:session-1:rr-v1:0', sourceType: 'research-report', callId: 'rr-v1', occurrence: 0 }
  const second = { ...record(11), id: 'presented:session-1:present-v2:0', callId: 'present-v2', occurrence: 0, description: 'Officially presented revision' }
  await store.upsert([first])
  await store.action(first.id, 'approve', 'seal checked')
  await store.upsert([second])
  assert.equal(store.list().length, 1)
  assert.equal(store.get(second.id).revision, 2)
  assert.equal(store.get(second.id).sourceType, 'presented')
  assert.equal(store.get(second.id).status, 'pending')
  assert.equal(store.get(second.id).history.at(-1).action, 'revision')
  await store.upsert([{ ...first, description: 'late sealed result' }])
  assert.equal(store.get(second.id).description, 'Officially presented revision')
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

test('bulk archive clears one session and leaves other sessions alone', async () => {
  const path = await fixture()
  const store = new OutboxStore(path)
  await store.initialize()
  const mk = (id, sessionId, status = 'pending') => ({
    ...record(), id, sessionId, path: `${id}.md`, status,
    history: [{ at: '2026-01-01T00:00:00.000Z', action: 'observed', note: '' }],
  })
  await store.upsert([
    mk('a1', 'session-a'), mk('a2', 'session-a'), mk('a3', 'session-a', 'approved'),
    mk('b1', 'session-b'),
  ])

  const result = await store.archiveSession('session-a', '会话已结束')
  assert.equal(result.archived, 2)
  assert.deepEqual(result.ids.sort(), ['a1', 'a2'])

  const byId = id => store.get(id)
  assert.equal(byId('a1').status, 'archived')
  assert.equal(byId('a2').status, 'archived')
  assert.equal(byId('a3').status, 'approved', 'an already-reviewed artifact must not be re-archived')
  assert.equal(byId('b1').status, 'pending', 'other sessions are untouched')
  assert.equal(byId('a1').reviewNote, '会话已结束')
  assert.equal(byId('a1').history.at(-1).action, 'archive')

  const reloaded = new OutboxStore(path)
  await reloaded.initialize()
  assert.equal(reloaded.get('a1').status, 'archived')
  const reopened = await reloaded.action('a1', 'reopen')
  assert.equal(reopened.status, 'pending', 'bulk archive stays reversible per artifact')

  await assert.rejects(() => store.archiveSession('session-a'), /No pending items/)
  await assert.rejects(() => store.archiveSession(''), /session id is required/)
})

test('concurrent decisions on different artifacts all persist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-outbox-concurrent-'))
  const file = join(dir, 'state.json')
  const store = new OutboxStore(file)
  store.initialize()
  await store.ready
  await store.upsert(['a', 'b', 'c', 'd'].map(id => ({
    id, path: `/work/${id}.md`, sessionId: 's1', sourceType: 'presented',
    status: 'pending', revision: 1, updatedAt: new Date().toISOString(), history: [],
  })))

  // one reviewer clicking quickly is one instance; the queue must not drop events
  await Promise.all([
    store.action('a', 'approve', 'ok'),
    store.action('b', 'archive', ''),
    store.action('c', 'return', 'needs work'),
  ])

  const reloaded = new OutboxStore(file)
  await reloaded.load()
  const statuses = Object.fromEntries(reloaded.list().map(item => [item.id, item.status]))
  assert.deepEqual(statuses, { a: 'approved', b: 'archived', c: 'returned', d: 'pending' })
})

test('a rejected action does not block the queue behind it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-outbox-queue-'))
  const file = join(dir, 'state.json')
  const store = new OutboxStore(file)
  store.initialize()
  await store.ready
  await store.upsert([{
    id: 'only', path: '/work/only.md', sessionId: 's1', sourceType: 'presented',
    status: 'pending', revision: 1, updatedAt: new Date().toISOString(), history: [],
  }])

  const failing = store.action('missing', 'approve', '').catch(error => error.message)
  const succeeding = store.action('only', 'archive', '')
  const [failure, success] = await Promise.all([failing, succeeding])
  assert.match(String(failure), /not found/i, 'the missing id is rejected with a clear message')
  assert.equal(success.status, 'archived', 'the queued action still ran after the failed one')
})

test('two instances on one state file are last-write-wins, and this is pinned on purpose', async () => {
  // The host loads one store per profile, so this cannot happen in normal use.
  // It is recorded as a test so a future change that makes it *look* safe is caught.
  const dir = await mkdtemp(join(tmpdir(), 'review-outbox-two-writers-'))
  const file = join(dir, 'state.json')
  const first = new OutboxStore(file)
  first.initialize()
  await first.ready
  await first.upsert([{
    id: 'shared', path: '/work/shared.md', sessionId: 's1', sourceType: 'presented',
    status: 'pending', revision: 1, updatedAt: new Date().toISOString(), history: [],
  }])

  const second = new OutboxStore(file)
  await second.load()

  await first.action('shared', 'archive', 'from first')
  await second.action('shared', 'archive', 'from second')

  const reloaded = new OutboxStore(file)
  await reloaded.load()
  const item = reloaded.get('shared')
  assert.equal(item.status, 'archived')
  assert.equal(item.reviewNote, 'from second', 'the later write wins; no locking is claimed')
})
