import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/host.js'

function mockContext({ denied = false, persistence } = {}) {
  const context = {
    listener: null,
    handler: null,
    errors: [],
    effect(callback) { return callback() },
    on(name, listener) {
      assert.equal(name, 'session/event')
      context.listener = listener
      return () => {}
    },
    get(name) {
      if (name === 'connection') return { requestRejection: () => denied ? 403 : undefined }
      if (name === 'sessionPersistence') return persistence
      if (name === 'workspaceChanges') return {
        summary: () => ({ cwd: context.cwd, turn: 1, total: 1, files: [{ path: 'report.md', display: 'report.md', added: 1, deleted: 0 }] }),
        diff: async () => ({ kind: 'text', path: 'report.md', display: 'report.md', before: true, after: true, hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-old', '+new'] }] }),
      }
      return undefined
    },
    webServer: {
      register(route) {
        assert.equal(route.kind, 'prefix')
        context.handler = route.handler
        return () => {}
      },
    },
    logger: { error: (...args) => context.errors.push(args) },
  }
  return context
}

async function invoke(handler, { method = 'GET', url, body, headers = {} }) {
  const req = body === undefined
    ? { method, url, headers }
    : Readable.from([Buffer.from(JSON.stringify(body))])
  if (body !== undefined) {
    req.method = method
    req.url = url
    req.headers = headers
  }
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value },
    end(value = '') { this.body = value },
  }
  await handler(req, res)
  const isJson = String(res.headers['content-type'] || '').includes('application/json')
  return {
    status: res.statusCode,
    headers: res.headers,
    data: res.body && isJson ? JSON.parse(res.body) : res.body,
  }
}

test('host API records official events and completes the review lifecycle', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'review-outbox-host-'))
  await writeFile(join(cwd, 'report.md'), '# Evidence', 'utf8')
  const ctx = mockContext()
  ctx.cwd = cwd
  apply(ctx, { statePath: join(cwd, 'state.json') })
  const health = await invoke(ctx.handler, { url: '/review-outbox/api/health' })
  assert.equal(health.status, 200)
  assert.equal(health.data.pending, 0)

  const session = { id: 'session-1', header: { cwd } }
  ctx.listener(session, {
    type: 'deliverables/presented', seq: 7, time: Date.now(),
    data: { turn: 1, callId: 'present-1', files: [{ path: 'report.md', description: 'demo' }] },
  })
  await new Promise(resolve => setTimeout(resolve, 20))
  const listed = await invoke(ctx.handler, { url: '/review-outbox/api/items' })
  assert.equal(listed.data.pending, 1)
  const item = listed.data.items[0]
  assert.equal(item.sourceType, 'presented')

  const preview = await invoke(ctx.handler, { url: `/review-outbox/api/preview?id=${encodeURIComponent(item.id)}` })
  assert.equal(preview.data.preview.kind, 'text')
  assert.match(preview.data.preview.content, /Evidence/)

  const approved = await invoke(ctx.handler, {
    method: 'POST', url: '/review-outbox/api/action',
    body: { id: item.id, action: 'approve', note: 'verified' },
  })
  assert.equal(approved.status, 200, JSON.stringify(approved.data))
  assert.equal(approved.data.item.status, 'approved')
  assert.equal(approved.data.item.reviewEvidence.status, 'available')
  assert.match(approved.data.item.reviewEvidence.digest, /^[a-f0-9]{64}$/)

  const receipt = await invoke(ctx.handler, { url: `/review-outbox/api/receipt?id=${encodeURIComponent(item.id)}` })
  assert.equal(receipt.status, 200)
  assert.match(receipt.headers['content-type'], /text\/html/)
  assert.match(receipt.headers['content-disposition'], /attachment/)
  assert.match(receipt.data, /当前文件与审阅时摘要一致/)
  assert.match(receipt.data, /verified/)
  assert.doesNotMatch(receipt.data, new RegExp(cwd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  ctx.listener(session, {
    type: 'deliverables/presented', seq: 8, time: Date.now(),
    data: { turn: 1, callId: 'present-1', files: [{ path: 'report.md', description: 'demo v2' }] },
  })
  await new Promise(resolve => setTimeout(resolve, 20))
  const revised = await invoke(ctx.handler, { url: `/review-outbox/api/item?id=${encodeURIComponent(item.id)}` })
  assert.equal(revised.data.item.revision, 2)
  assert.equal(revised.data.item.status, 'pending')
  assert.equal(revised.data.item.reviewEvidence, undefined)

  ctx.listener(session, { type: 'workspace/changes', seq: 9, time: Date.now(), data: { turn: 1 } })
  await new Promise(resolve => setTimeout(resolve, 20))
  const withChanges = await invoke(ctx.handler, { url: '/review-outbox/api/items?status=pending' })
  const change = withChanges.data.items.find(candidate => candidate.sourceType === 'workspace-change')
  assert.ok(change)
  const diff = await invoke(ctx.handler, { url: `/review-outbox/api/diff?id=${encodeURIComponent(change.id)}` })
  assert.equal(diff.data.preview.kind, 'text')
  assert.deepEqual(diff.data.preview.hunks[0].lines, ['-old', '+new'])
  assert.deepEqual(ctx.errors, [])
})

test('host backfill API ingests persisted events and reports durable status', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'review-outbox-backfill-host-'))
  await writeFile(join(cwd, 'historic.md'), '# Historical delivery', 'utf8')
  let closed = 0
  const persistence = {
    async list() {
      return [{ header: { id: 'historic-session', createdAt: 1, cwd }, eventCount: 2 }]
    },
    async open(id, access) {
      assert.equal(id, 'historic-session')
      assert.equal(access, 'read')
      return {
        async read(offset, length) {
          assert.equal(offset, 0)
          assert.equal(length, 5000)
          return { events: [
            { type: 'message', seq: 0 },
            { type: 'deliverables/presented', seq: 1, time: 1_700_000_000_000, data: { turn: 1, callId: 'historic-call', files: [{ path: 'historic.md', description: 'from storage' }] } },
          ] }
        },
        async close() { closed += 1 },
      }
    },
  }
  const ctx = mockContext({ persistence })
  apply(ctx, { statePath: join(cwd, 'state.json') })
  const response = await invoke(ctx.handler, { method: 'POST', url: '/review-outbox/api/backfill' })
  assert.equal(response.status, 200, JSON.stringify(response.data))
  assert.equal(response.data.backfill.status, 'ready')
  assert.equal(response.data.backfill.discovered, 1)
  assert.equal(response.data.pending, 1)
  assert.equal(response.data.items[0].path, 'historic.md')
  assert.ok(closed >= 1)

  const id = response.data.items[0].id
  await invoke(ctx.handler, { method: 'POST', url: '/review-outbox/api/action', body: { id, action: 'approve' } })
  const repeated = await invoke(ctx.handler, { method: 'POST', url: '/review-outbox/api/backfill' })
  assert.equal(repeated.data.backfill.changed, 0)
  assert.equal(repeated.data.items[0].status, 'approved')
})

test('host reports unavailable persistence without disabling live ingestion', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'review-outbox-no-persistence-'))
  const ctx = mockContext()
  apply(ctx, { statePath: join(cwd, 'state.json') })
  const health = await invoke(ctx.handler, { url: '/review-outbox/api/health' })
  assert.equal(health.data.backfill.status, 'unavailable')
  ctx.listener({ id: 'live', header: { cwd } }, {
    type: 'deliverables/presented', seq: 1,
    data: { turn: 1, callId: 'live-call', files: [{ path: 'live.md' }] },
  })
  await new Promise(resolve => setTimeout(resolve, 20))
  const items = await invoke(ctx.handler, { url: '/review-outbox/api/items' })
  assert.equal(items.data.pending, 1)
})

test('research pack is enforced through Host API and exported into the receipt', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'review-outbox-research-pack-'))
  await writeFile(join(cwd, 'research.md'), '# Research report', 'utf8')
  const ctx = mockContext()
  apply(ctx, { statePath: join(cwd, 'state.json') })
  const session = { id: 'research-session', header: { cwd } }
  ctx.listener(session, {
    type: 'deliverables/presented', seq: 1,
    data: { turn: 1, callId: 'research-call', files: [{ path: 'research.md', description: 'Research report' }] },
  })
  await new Promise(resolve => setTimeout(resolve, 20))
  const id = 'presented:research-session:research-call:0'
  const packs = await invoke(ctx.handler, { url: '/review-outbox/api/packs' })
  const pack = packs.data.packs.find(candidate => candidate.id === 'research-report')
  assert.ok(pack)
  const selected = await invoke(ctx.handler, {
    method: 'POST', url: '/review-outbox/api/pack', body: { id, packId: pack.id },
  })
  assert.equal(selected.status, 200)
  assert.equal(selected.data.item.reviewProgress.requiredCompleted, 0)

  const premature = await invoke(ctx.handler, {
    method: 'POST', url: '/review-outbox/api/action', body: { id, action: 'approve' },
  })
  assert.equal(premature.status, 400)
  assert.match(premature.data.error, /填写证据/)

  for (const check of pack.checks.filter(candidate => candidate.required)) {
    const updated = await invoke(ctx.handler, {
      method: 'POST', url: '/review-outbox/api/check',
      body: { id, checkId: check.id, checked: true, detail: `Evidence ${check.id}` },
    })
    assert.equal(updated.status, 200, JSON.stringify(updated.data))
  }
  const approved = await invoke(ctx.handler, {
    method: 'POST', url: '/review-outbox/api/action', body: { id, action: 'approve', note: 'Research checked' },
  })
  assert.equal(approved.status, 200, JSON.stringify(approved.data))
  assert.equal(approved.data.item.status, 'approved')
  assert.equal(approved.data.item.reviewProgress.complete, true)
  assert.equal(approved.data.item.reviewEvidence.status, 'available')

  const receipt = await invoke(ctx.handler, { url: `/review-outbox/api/receipt?id=${encodeURIComponent(id)}` })
  assert.match(receipt.data, /研究报告验收/)
  assert.match(receipt.data, /Evidence citations-accessible/)
  assert.match(receipt.data, /证据已记录/)
  const locked = await invoke(ctx.handler, {
    method: 'POST', url: '/review-outbox/api/check',
    body: { id, checkId: 'reproduction', checked: true, detail: 'late edit' },
  })
  assert.equal(locked.status, 400)
  assert.match(locked.data.error, /Reopen/)
})

test('every host route requires host connection authorization', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'review-outbox-host-'))
  const ctx = mockContext({ denied: true })
  apply(ctx, { statePath: join(cwd, 'state.json') })
  const response = await invoke(ctx.handler, { url: '/review-outbox/api/health' })
  assert.equal(response.status, 403)
  assert.deepEqual(response.data, { error: 'Forbidden' })
})
