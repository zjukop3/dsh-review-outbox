import test from 'node:test'
import assert from 'node:assert/strict'
import { demoRecord, presentedRecords, workspaceRecords } from '../src/events.js'

const session = { id: 'session-1', header: { cwd: '/tmp/work' } }

test('presented events preserve file order and independent duplicate paths', () => {
  const event = {
    type: 'deliverables/presented', seq: 42, time: 1_800_000_000_000,
    data: { turn: 3, callId: 'call-1', files: [
      { path: 'same.md', description: 'first' },
      { path: 'same.md', description: 'second' },
    ] },
  }
  const records = presentedRecords(session, event, new Date())
  assert.equal(records.length, 2)
  assert.deepEqual(records.map(item => item.sourceIndex), [0, 1])
  assert.deepEqual(records.map(item => item.occurrence), [0, 1])
  assert.notEqual(records[0].id, records[1].id)
  assert.equal(records[0].status, 'pending')
  assert.equal(records[0].turn, 3)
  assert.equal(records[0].eventSeq, 42)
  assert.equal(records[0].cwd, '/tmp/work')
})

test('workspace changes retain summary and diff coordinates', () => {
  const event = { type: 'workspace/changes', seq: 9, time: 1_800_000_000_000, data: { turn: 2 } }
  const summary = { cwd: '/tmp/work', turn: 2, total: 1, files: [{ path: 'src/a.ts', display: 'src/a.ts', added: 4, deleted: 2 }] }
  const [record] = workspaceRecords(session, event, summary, new Date())
  assert.equal(record.id, 'changes:session-1:2:src/a.ts')
  assert.equal(record.sourceIndex, 0)
  assert.equal(record.eventSeq, 9)
  assert.equal(record.added, 4)
  assert.equal(record.deleted, 2)
  assert.equal(record.total, 1)
})

test('irrelevant events and malformed files produce no records', () => {
  assert.deepEqual(presentedRecords(session, { type: 'turn/end', data: {} }, new Date()), [])
  assert.deepEqual(presentedRecords(session, { type: 'deliverables/presented', seq: 1, data: { files: [{ path: '' }] } }, new Date()), [])
  assert.deepEqual(workspaceRecords(session, { type: 'workspace/changes', seq: 1, data: {} }, null, new Date()), [])
})

test('demo records never pretend to have a source session', () => {
  const record = demoRecord({ path: 'demo.md', cwd: '/tmp/demo', now: '2026-01-01T00:00:00.000Z', description: 'fixture' })
  assert.equal(record.sessionId, '')
  assert.equal(record.sourceType, 'demo')
  assert.equal(record.status, 'pending')
})
