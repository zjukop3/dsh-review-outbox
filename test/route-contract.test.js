// The contract documented in docs/API.md, asserted against the real handler.
//
// A route reference drifts the moment nobody runs it. Every status code and
// response shape in that document is checked here, including the ones that are
// easy to get wrong from memory: a wrong method returns 404 rather than 405
// because dispatch compares method and last path segment with no separate
// method check, and bulk disposition refuses anything but archive.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/host.js'

function context({ denied = false } = {}) {
  const ctx = {
    handler: null,
    effects: [],
    effect(callback) { return callback() },
    on() { return () => {} },
    get(name) {
      if (name === 'connection') return { requestRejection: () => (denied ? 403 : undefined) }
      return undefined
    },
    webServer: {
      register(route) {
        assert.equal(route.kind, 'prefix')
        assert.equal(route.path, '/review-outbox/api')
        ctx.handler = route.handler
        return () => {}
      },
    },
    logger: { error() {} },
  }
  return ctx
}

async function mount(options) {
  const ctx = context(options)
  const dir = await mkdtemp(join(tmpdir(), 'contract-'))
  apply(ctx, { statePath: join(dir, 'state.json') })
  const call = async (method, path, body) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
    req.method = method
    req.url = path
    req.headers = { 'content-type': 'application/json' }
    const chunks = []
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(key, value) { this.headers[key.toLowerCase()] = value },
      end(chunk) { if (chunk) chunks.push(Buffer.from(chunk)) },
    }
    await ctx.handler(req, res)
    const text = Buffer.concat(chunks).toString('utf8')
    let json = null
    try { json = JSON.parse(text) } catch { /* receipt returns HTML */ }
    return { status: res.statusCode, headers: res.headers, text, json }
  }
  return { call, ctx }
}

test('the four read routes answer 200 with the documented keys', async () => {
  const { call } = await mount()

  const health = await call('GET', '/review-outbox/api/health')
  assert.equal(health.status, 200)
  assert.equal(health.json.ok, true)
  for (const key of ['version', 'items', 'pending', 'stateError', 'backfill']) assert.ok(key in health.json, key)
  // The documented backfill fields. An earlier draft of docs/API.md said
  // `running`/`queued`; the real shape is `status` plus four counters.
  for (const key of ['status', 'listed', 'scanned', 'discovered', 'changed', 'truncated', 'errors', 'startedAt', 'finishedAt']) {
    assert.ok(key in health.json.backfill, key)
  }
  assert.ok(['idle', 'running', 'done', 'unavailable', 'disabled'].includes(health.json.backfill.status))

  const packs = await call('GET', '/review-outbox/api/packs')
  assert.equal(packs.status, 200)
  assert.ok(Array.isArray(packs.json.packs))
  assert.ok(packs.json.packs.length > 0, 'at least one review pack ships')

  const items = await call('GET', '/review-outbox/api/items')
  assert.equal(items.status, 200)
  assert.deepEqual(Object.keys(items.json).sort(), ['backfill', 'items', 'pending', 'stateError', 'version'])

  const filtered = await call('GET', '/review-outbox/api/items?status=pending')
  assert.equal(filtered.status, 200)
  assert.ok(filtered.json.items.every(item => item.status === 'pending'))
})

test('a missing id is a 404 with the documented error shape', async () => {
  const { call } = await mount()
  for (const route of ['item', 'preview', 'receipt', 'diff']) {
    const response = await call('GET', `/review-outbox/api/${route}?id=nope`)
    assert.equal(response.status, 404, route)
    assert.equal(response.json.error, 'Item not found', route)
  }
})

test('a wrong method returns 404, not 405 — the documented oddity', async () => {
  const { call } = await mount()
  for (const [method, path] of [['PUT', '/review-outbox/api/items'], ['DELETE', '/review-outbox/api/item?id=x'], ['POST', '/review-outbox/api/health']]) {
    const response = await call(method, path)
    assert.equal(response.status, 404, `${method} ${path}`)
    assert.equal(response.json.error, 'Route not found')
  }
})

test('an unknown route is a 404, and never a stack trace', async () => {
  const { call } = await mount()
  const response = await call('GET', '/review-outbox/api/nope')
  assert.equal(response.status, 404)
  assert.deepEqual(Object.keys(response.json), ['error'])
})

test('bulk disposition refuses anything but archive', async () => {
  const { call } = await mount()
  const refused = await call('POST', '/review-outbox/api/action', { sessionId: 'sess', action: 'approve' })
  assert.equal(refused.status, 400)
  assert.equal(refused.json.error, 'Bulk actions are limited to archive')

  // archive is allowed, but a session with nothing pending is a 400, not
  // `archived: 0` — another shape the first draft of docs/API.md got wrong.
  const empty = await call('POST', '/review-outbox/api/action', { sessionId: 'sess', action: 'archive', note: 'x' })
  assert.equal(empty.status, 400)
  assert.equal(empty.json.error, 'No pending items in this session')
})

test('the documented 400s fire, in the documented order', async () => {
  const { call } = await mount()
  const badPack = await call('POST', '/review-outbox/api/pack', { id: 'x', packId: 'does-not-exist' })
  assert.equal(badPack.status, 400)
  assert.equal(badPack.json.error, 'Review pack not found')

  const badCheck = await call('POST', '/review-outbox/api/check', { id: 'x', checkId: 'nope', checked: true })
  assert.equal(badCheck.status, 400)
  assert.equal(badCheck.json.error, 'Review check not found')

  // Order matters and is now documented: with no item there is no pack, so the
  // pack lookup answers first and the boolean is never examined.
  const notBoolean = await call('POST', '/review-outbox/api/check', { id: 'x', checkId: 'claims', checked: 'yes' })
  assert.equal(notBoolean.status, 400)
  assert.equal(notBoolean.json.error, 'Review check not found')
})

test('on a real item, a non-boolean checked is the 400 you get', async () => {
  // The path that needs a real item with a real pack: only then does the
  // boolean check get its turn. Walking it needs the sample route, which is why
  // this assertion is separate from the ordering test above.
  const { call } = await mount()
  const created = await call('POST', '/review-outbox/api/sample', {})
  // 201, not 200 — the one non-200 success in the document.
  assert.equal(created.status, 201)
  const sample = created.json.items.find(item => item.reviewPack)
  assert.ok(sample, 'the sample route ships an item with a review pack')

  // reviewPack.checks is an object keyed by check id, not the array that
  // /packs returns. Two shapes, one name — an earlier draft of docs/API.md
  // had this wrong, and it is the field a front-end reads first.
  const checkId = Object.keys(sample.reviewPack.checks)[0]
  assert.equal(typeof checkId, 'string')
  const notBoolean = await call('POST', '/review-outbox/api/check', { id: sample.id, checkId, checked: 'yes' })
  assert.equal(notBoolean.status, 400)
  assert.equal(notBoolean.json.error, 'checked must be a boolean')

  const boolean = await call('POST', '/review-outbox/api/check', { id: sample.id, checkId, checked: true, detail: '证据' })
  assert.equal(boolean.status, 200)
  const progress = boolean.json.item.reviewProgress
  assert.equal(progress.completed, 1)
  assert.equal(progress.complete, false)
  assert.ok(!progress.incomplete.includes(checkId))
})

test('a broken connection rejects the whole prefix with 403', async () => {
  const { call } = await mount({ denied: true })
  for (const path of ['health', 'packs', 'items']) {
    const response = await call('GET', `/review-outbox/api/${path}`)
    assert.equal(response.status, 403, path)
    assert.equal(response.json.error, 'Forbidden')
  }
})

test('every route in the documented list exists', async () => {
  const { call } = await mount()
  // The twelve routes docs/API.md names. A 404 here means the document is
  // describing a route that is gone.
  const routes = [
    ['GET', 'health'], ['GET', 'packs'], ['GET', 'items'], ['GET', 'item?id=x'],
    ['GET', 'preview?id=x'], ['GET', 'receipt?id=x'], ['GET', 'diff?id=x'],
    ['POST', 'pack'], ['POST', 'check'], ['POST', 'backfill'], ['POST', 'action'], ['POST', 'sample'],
  ]
  for (const [method, path] of routes) {
    const response = await call(method, `/review-outbox/api/${path}`, method === 'POST' ? {} : undefined)
    const missing = response.status === 404 && response.json?.error === 'Route not found'
    assert.equal(missing, false, `${method} ${path} is documented but not routed`)
  }
})