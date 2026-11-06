import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backfillPresented, resolveBackfillOptions } from '../src/backfill.js'
import { OutboxStore } from '../src/store.js'

function presented(seq, callId, path, description = '') {
  return {
    type: 'deliverables/presented', seq, time: 1_700_000_000_000 + seq,
    data: { turn: 1, callId, files: [{ path, description }] },
  }
}

function snapshot(id, createdAt, eventCount) {
  return { header: { id, createdAt, cwd: `/work/${id}` }, eventCount }
}

async function storeFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'review-outbox-backfill-'))
  const store = new OutboxStore(join(directory, 'items.json'))
  await store.initialize()
  return store
}

function persistenceFixture(sessions) {
  const opened = []
  const closed = []
  const reads = []
  return {
    opened,
    closed,
    reads,
    async list() { return Object.keys(sessions).map(id => sessions[id].snapshot) },
    async open(id, access) {
      assert.equal(access, 'read')
      opened.push(id)
      const entry = sessions[id]
      if (entry.openError) throw entry.openError
      return {
        async read(offset, length) {
          reads.push({ id, offset, length })
          if (entry.readError) throw entry.readError
          if (entry.invalidRead) return { events: null }
          return { events: entry.events.slice(offset, offset + length) }
        },
        async close() {
          closed.push(id)
          if (entry.closeError) throw entry.closeError
        },
      }
    },
  }
}

test('backfill reads newest bounded Sessions, tail slices, and only official presentations', async () => {
  const store = await storeFixture()
  const persistence = persistenceFixture({
    newest: {
      snapshot: snapshot('newest', 30, 3),
      events: [
        { type: 'message', seq: 0 },
        presented(1, 'new-call', 'new.md', 'new delivery'),
        presented(2, 'ignored-call', 'ignored.md'),
      ],
    },
    middle: {
      snapshot: snapshot('middle', 20, 1),
      events: [presented(0, 'middle-call', 'middle.md')],
    },
    oldest: {
      snapshot: snapshot('oldest', 10, 1),
      events: [presented(0, 'old-call', 'old.md')],
    },
  })
  const result = await backfillPresented({ persistence, store, sessionLimit: 2, eventLimit: 2, itemLimit: 1 })
  assert.equal(result.status, 'ready')
  assert.equal(result.listed, 3)
  assert.equal(result.scanned, 1)
  assert.equal(result.discovered, 1)
  assert.equal(result.changed, 1)
  assert.equal(result.truncated, true)
  assert.deepEqual(persistence.opened, ['newest'])
  assert.deepEqual(persistence.closed, ['newest'])
  assert.deepEqual(persistence.reads, [{ id: 'newest', offset: 1, length: 2 }])
  assert.equal(store.list()[0].path, 'new.md')
  assert.equal(store.list()[0].cwd, '/work/newest')
})

test('identical backfill rediscovery preserves an approved review and closes every handle', async () => {
  const store = await storeFixture()
  const events = [presented(4, 'call', 'report.md', 'checked')]
  const persistence = persistenceFixture({ one: { snapshot: snapshot('one', 1, 1), events } })
  await backfillPresented({ persistence, store })
  const id = store.list()[0].id
  await store.action(id, 'approve', 'looks good')
  const second = await backfillPresented({ persistence, store })
  assert.equal(second.changed, 0)
  assert.equal(store.get(id).status, 'approved')
  assert.equal(store.get(id).reviewNote, 'looks good')
  assert.deepEqual(persistence.closed, ['one', 'one'])
})

test('one malformed Session becomes a visible error without blocking other Sessions', async () => {
  const store = await storeFixture()
  const persistence = persistenceFixture({
    broken: { snapshot: snapshot('broken', 20, 1), invalidRead: true },
    healthy: { snapshot: snapshot('healthy', 10, 1), events: [presented(0, 'ok', 'healthy.md')] },
    absent: { snapshot: snapshot('absent', 15, 1), openError: new Error('missing log') },
  })
  const result = await backfillPresented({ persistence, store })
  assert.equal(result.status, 'degraded')
  assert.equal(result.scanned, 1)
  assert.equal(result.errors.length, 2)
  assert.match(result.errors.map(error => error.error).join('\n'), /invalid events/)
  assert.match(result.errors.map(error => error.error).join('\n'), /missing log/)
  assert.deepEqual(persistence.closed.sort(), ['broken', 'healthy'])
  assert.equal(store.list()[0].path, 'healthy.md')
})

test('close failures are contained and read-only state failures remain loud', async () => {
  const store = await storeFixture()
  const persistence = persistenceFixture({
    one: {
      snapshot: snapshot('one', 1, 1),
      events: [presented(0, 'call', 'one.md')],
      closeError: new Error('close exploded'),
    },
  })
  const result = await backfillPresented({ persistence, store })
  assert.equal(result.status, 'degraded')
  assert.match(result.errors[0].error, /Close failed: close exploded/)
  assert.equal(store.list().length, 1)

  store.readOnly = true
  store.error = 'State is read-only: fixture'
  await assert.rejects(backfillPresented({ persistence, store }), /read-only/)
})

test('backfill options reject zero, negative, fractional, and unsafe limits', () => {
  assert.deepEqual(resolveBackfillOptions({ sessionLimit: 0, eventLimit: -1, itemLimit: 1.5 }), {
    sessionLimit: 50,
    eventLimit: 5000,
    itemLimit: 1000,
  })
  assert.deepEqual(resolveBackfillOptions({ sessionLimit: 2, eventLimit: 3, itemLimit: 4 }), {
    sessionLimit: 2,
    eventLimit: 3,
    itemLimit: 4,
  })
})
