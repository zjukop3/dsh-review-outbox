import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const script = resolve(import.meta.dirname, '..', 'scripts', 'report-usage.mjs')
const hoursAgo = hours => new Date(Date.now() - hours * 3_600_000).toISOString()

async function withState(items, run) {
  const home = await mkdtemp(join(tmpdir(), 'review-outbox-usage-'))
  try {
    await mkdir(join(home, 'review-outbox'), { recursive: true })
    await writeFile(join(home, 'review-outbox', 'items.json'), JSON.stringify({ version: 1, items }), 'utf8')
    const result = spawnSync(process.execPath, [script, '--json', home], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return await run(JSON.parse(result.stdout))
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

test('a backlog nobody touched reports zero decisions instead of claiming adoption', async () => {
  const items = [
    { id: 'a', path: '/w/report.md', status: 'pending', sessionId: 's1', updatedAt: hoursAgo(30), history: [{ action: 'observed', at: hoursAgo(30) }] },
    { id: 'b', path: '/w/data.json', status: 'pending', sessionId: 's1', updatedAt: hoursAgo(10), history: [{ action: 'observed', at: hoursAgo(10) }] },
    { id: 'c', path: '/w/shot.png', status: 'pending', sessionId: 's2', updatedAt: hoursAgo(2), history: [{ action: 'observed', at: hoursAgo(2) }] },
  ]
  await withState(items, report => {
    assert.equal(report.artifacts.total, 3)
    assert.equal(report.artifacts.sessions, 2)
    assert.deepEqual(report.artifacts.byStatus, { pending: 3 })
    assert.deepEqual(report.artifacts.byKind, { document: 1, data: 1, image: 1 })
    assert.equal(report.humanDecisions.total, 0)
    assert.equal(report.pending.count, 3)
    assert.equal(report.pending.sessionsWithPending, 2)
    assert.deepEqual(report.pending.largestSession, ['s1', 2])
    assert.match(report.reading, /not adoption/)
  })
})

test('decisions are counted from history, split by action and kind', async () => {
  const items = [
    { id: 'a', path: '/w/report.md', status: 'approved', sessionId: 's1', updatedAt: hoursAgo(20), history: [
      { action: 'observed', at: hoursAgo(40) }, { action: 'revision', at: hoursAgo(30) }, { action: 'approve', at: hoursAgo(20) }] },
    { id: 'b', path: '/w/sheet.csv', status: 'archived', sessionId: 's1', updatedAt: hoursAgo(6), history: [
      { action: 'observed', at: hoursAgo(9) }, { action: 'archive', at: hoursAgo(6) }] },
    { id: 'c', path: '/w/tool.py', status: 'returned', sessionId: 's2', updatedAt: hoursAgo(1), history: [
      { action: 'observed', at: hoursAgo(4) }, { action: 'return', at: hoursAgo(1) }] },
  ]
  await withState(items, report => {
    assert.equal(report.humanDecisions.total, 3)
    assert.deepEqual(report.humanDecisions.byAction, { approve: 1, archive: 1, return: 1 })
    assert.deepEqual(report.humanDecisions.byKind, { document: 1, sheet: 1, code: 1 })
    assert.equal(report.pending.count, 0)
    assert.match(report.reading, /decided on 3 artifact/)
    assert.ok(report.humanDecisions.first, 'the first decision time is reported')
    assert.ok(report.humanDecisions.first < report.humanDecisions.last, 'first decision predates the last')
  })
})

test('revision and observed entries are never mistaken for human decisions', async () => {
  const items = [
    { id: 'a', path: '/w/x.md', status: 'pending', sessionId: 's1', updatedAt: hoursAgo(3), history: [
      { action: 'observed', at: hoursAgo(9) }, { action: 'revision', at: hoursAgo(5) }, { action: 'revision', at: hoursAgo(3) }] },
  ]
  await withState(items, report => {
    assert.equal(report.humanDecisions.total, 0)
    assert.deepEqual(report.humanDecisions.byAction, {})
  })
})

test('median and oldest pending age come from the state, not from the clock at call time', async () => {
  const items = [
    { id: 'a', path: '/w/a.md', status: 'pending', updatedAt: hoursAgo(10), history: [] },
    { id: 'b', path: '/w/b.md', status: 'pending', updatedAt: hoursAgo(20), history: [] },
    { id: 'c', path: '/w/c.md', status: 'pending', updatedAt: hoursAgo(60), history: [] },
  ]
  await withState(items, report => {
    assert.equal(report.pending.medianAgeHours, 20)
    assert.equal(report.pending.oldestAgeHours, 60)
  })
})
