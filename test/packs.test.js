import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertReviewReady, getPack, initialReviewPack, listPacks, reviewProgress, suggestedPackId } from '../src/packs.js'
import { OutboxStore } from '../src/store.js'

function record(seq = 1) {
  return {
    id: 'presented:research', sourceType: 'presented', sessionId: 'session-1', eventSeq: seq,
    turn: 1, cwd: '/tmp/work', path: 'report.md', description: 'Research', status: 'pending', revision: 1,
    firstSeenAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    history: [{ at: '2026-01-01T00:00:00.000Z', action: 'observed', note: '' }],
  }
}

test('research pack requires both checked state and review evidence for every required check', () => {
  const pack = getPack('research-report')
  assert.equal(pack.version, 1)
  assert.equal(pack.checks.filter(check => check.required).length, 4)
  assert.equal(pack.checks.filter(check => !check.required).length, 1)
  const item = { reviewPack: initialReviewPack(pack) }
  for (const check of pack.checks.filter(candidate => candidate.required)) {
    item.reviewPack.checks[check.id].checked = true
  }
  assert.equal(reviewProgress(item).complete, false)
  assert.throws(() => assertReviewReady(item, 'approve'), /填写证据/)
  for (const check of pack.checks.filter(candidate => candidate.required)) {
    item.reviewPack.checks[check.id].detail = `Evidence for ${check.id}`
  }
  assert.deepEqual(reviewProgress(item), {
    completed: 4, total: 5, requiredCompleted: 4, requiredTotal: 4, complete: true, incomplete: [],
  })
  assert.doesNotThrow(() => assertReviewReady(item, 'approve'))
  assert.doesNotThrow(() => assertReviewReady({ ...item, reviewPack: initialReviewPack(pack) }, 'return'))
})

test('pack definitions are cloned before crossing the API boundary', () => {
  const first = listPacks()
  first[0].checks[0].label = 'mutated'
  first[0].summary = 'mutated'
  const second = listPacks()
  assert.notEqual(second[0].checks[0].label, 'mutated')
  assert.notEqual(second[0].summary, 'mutated')
  assert.equal(getPack('missing'), null)
})

test('review pack persists, optional checks remain optional, and a new revision resets old evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'review-outbox-pack-store-'))
  const path = join(directory, 'items.json')
  const store = new OutboxStore(path)
  await store.initialize()
  await store.upsert([record()])
  const pack = getPack('research-report')
  await store.setReviewPack(record().id, initialReviewPack(pack))
  for (const check of pack.checks.filter(candidate => candidate.required)) {
    await store.updateReviewCheck(record().id, check.id, { checked: true, detail: `Evidence ${check.id}` })
  }
  await store.action(record().id, 'approve', 'checked')
  const reloaded = new OutboxStore(path)
  await reloaded.initialize()
  assert.equal(reloaded.get(record().id).status, 'approved')
  assert.equal(reviewProgress(reloaded.get(record().id)).complete, true)

  await reloaded.upsert([record(2)])
  const revised = reloaded.get(record().id)
  assert.equal(revised.revision, 2)
  assert.equal(revised.reviewPack.id, 'research-report')
  assert.equal(reviewProgress(revised).complete, false)
  assert.equal(Object.values(revised.reviewPack.checks).every(state => !state.checked && state.detail === ''), true)
  await reloaded.setReviewPack(record().id, null)
  assert.equal(reloaded.get(record().id).reviewPack, null)
})

test('a delivered spreadsheet gets the data pack automatically, other kinds do not', () => {
  assert.equal(suggestedPackId('/work/回款明细.csv'), 'data-delivery')
  assert.equal(suggestedPackId('/work/sheet.TSV'), 'data-delivery')
  assert.equal(suggestedPackId('/work/sheet.xlsx'), 'data-delivery')
  assert.equal(suggestedPackId('/work/report.md'), null)
  assert.equal(suggestedPackId('/work/data.json'), null)
  assert.equal(suggestedPackId('Makefile'), null)
  assert.equal(suggestedPackId(''), null)

  const dataPack = getPack('data-delivery')
  assert.equal(dataPack.checks.filter(check => check.required).length, 3)
  const progress = reviewProgress({ reviewPack: initialReviewPack(dataPack) }, dataPack)
  assert.equal(progress.requiredTotal, 3)
  assert.equal(progress.complete, false)
})

test('the data pack refuses approval until each required check carries evidence', () => {
  const pack = getPack('data-delivery')
  const state = initialReviewPack(pack)
  const item = { reviewPack: state }
  assert.throws(() => assertReviewReady(item, 'approve'), /检查|证据|evidence/i)
  assert.doesNotThrow(() => assertReviewReady(item, 'archive'), 'archiving never needs the gate')

  for (const check of pack.checks.filter(candidate => candidate.required)) {
    state.checks[check.id] = { checked: true, detail: `核对过：${check.id}` }
  }
  assert.doesNotThrow(() => assertReviewReady(item, 'approve'))
  assert.equal(reviewProgress(item).complete, true)
})
