import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { backfillPresented } from './backfill.js'
import { captureArtifactEvidence } from './evidence.js'
import { demoRecord, presentedRecords, researchReportRecords, workspaceRecords } from './events.js'
import { assertReviewReady, getPack, initialReviewPack, listPacks, reviewProgress } from './packs.js'
import { previewItem } from './preview.js'
import { receiptFilename, renderReceipt } from './receipt.js'
import { OutboxStore } from './store.js'

export const name = 'review-outbox'
export const inject = ['webServer', 'connection']

const API_PREFIX = '/review-outbox/api'
const BODY_LIMIT = 64 * 1024

function home() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function html(res, body, filename) {
  res.statusCode = 200
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('content-security-policy', "default-src 'none'; script-src 'none'; object-src 'none'; img-src 'none'; font-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
  res.setHeader('content-disposition', `attachment; filename="review-receipt.html"; filename*=UTF-8''${encodeURIComponent(filename)}`)
  res.end(body)
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > BODY_LIMIT) throw new Error('Request body exceeds 64 KiB')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function rejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return 403
  return connection.requestRejection({ headers: req.headers })
}

async function loadDemoRecords(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const now = new Date().toISOString()
  return entries
    .filter(entry => entry.isFile() && /\.(md|markdown|txt|json|png|jpe?g|webp|gif)$/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(entry => demoRecord({
      path: entry.name,
      cwd: directory,
      now,
      description: 'Synthetic artifact for installation and review-flow verification',
    }))
}

function withReviewProgress(item) {
  return item ? { ...item, reviewProgress: reviewProgress(item) } : item
}

function summary(store, backfill) {
  const items = store.list().map(withReviewProgress)
  return {
    version: 1,
    items,
    pending: items.filter(item => item.status === 'pending').length,
    stateError: store.error,
    backfill: { ...backfill, errors: backfill.errors.map(error => ({ ...error })) },
  }
}

export function apply(ctx, config = {}) {
  const statePath = typeof config.statePath === 'string' && config.statePath
    ? config.statePath
    : join(home(), 'review-outbox', 'items.json')
  const store = new OutboxStore(statePath)
  const demoDir = typeof config.demoDir === 'string' && config.demoDir
    ? config.demoDir
    : process.env.DSH_REVIEW_OUTBOX_DEMO_DIR || ''
  store.initialize(demoDir ? loadDemoRecords(demoDir) : [])

  const backfillEnabled = config.backfill !== false
  const backfillOptions = config.backfill && typeof config.backfill === 'object' ? config.backfill : {}
  const backfillController = new AbortController()
  let backfillPromise = null
  let backfill = {
    status: backfillEnabled ? 'idle' : 'disabled',
    listed: 0,
    scanned: 0,
    discovered: 0,
    changed: 0,
    truncated: false,
    errors: [],
    startedAt: null,
    finishedAt: null,
  }

  function startBackfill() {
    if (backfillPromise) return backfillPromise
    backfillPromise = (async () => {
      await store.ready
      if (!backfillEnabled) return backfill
      const persistence = ctx.get('sessionPersistence')
      if (!persistence || typeof persistence.list !== 'function' || typeof persistence.open !== 'function') {
        backfill = { ...backfill, status: 'unavailable', finishedAt: new Date().toISOString() }
        return backfill
      }
      backfill = { ...backfill, status: 'running', startedAt: new Date().toISOString(), finishedAt: null, errors: [] }
      try {
        backfill = await backfillPresented({
          persistence,
          store,
          signal: backfillController.signal,
          ...backfillOptions,
        })
        return backfill
      } catch (error) {
        backfill = {
          ...backfill,
          status: 'failed',
          finishedAt: new Date().toISOString(),
          errors: [{ sessionId: null, error: error.message || String(error) }],
        }
        throw error
      }
    })().finally(() => {
      backfillPromise = null
    })
    return backfillPromise
  }

  ctx.effect(() => {
    if (backfillEnabled) {
      void startBackfill().catch(error => {
        if (!backfillController.signal.aborted) ctx.logger.error('review-outbox: historical backfill failed', error)
      })
    }
    return () => backfillController.abort()
  })

  const toolCalls = new Map()
  const toolKey = (session, callId) => JSON.stringify([String(session?.id || ''), String(callId || '')])
  ctx.effect(() => ctx.on('session/event', (session, event) => {
    if (event?.type === 'tool/call') {
      const key = toolKey(session, event.data?.callId)
      if (toolCalls.size >= 1000) toolCalls.delete(toolCalls.keys().next().value)
      toolCalls.set(key, String(event.data?.name || ''))
      return
    }
    if (event?.type === 'tool/result') {
      const key = toolKey(session, event.data?.message?.toolCallId)
      const toolName = toolCalls.get(key)
      toolCalls.delete(key)
      const records = researchReportRecords(session, event, toolName, new Date())
      if (records.length > 0) void store.ready.then(() => store.upsert(records)).catch(error => ctx.logger.error('review-outbox: failed to record sealed research report', error))
      return
    }
    if (event?.type === 'deliverables/presented') {
      const records = presentedRecords(session, event, new Date())
      if (records.length === 0) return
      void store.ready.then(() => store.upsert(records)).catch(error => ctx.logger.error('review-outbox: failed to record delivery', error))
      return
    }
    if (event?.type !== 'workspace/changes') return
    const changes = ctx.get('workspaceChanges')
    if (typeof changes?.summary !== 'function') return
    const details = changes.summary(session.id, event.seq)
    const records = workspaceRecords(session, event, details, new Date())
    if (records.length === 0) return
    void store.ready.then(() => store.upsert(records)).catch(error => ctx.logger.error('review-outbox: failed to record workspace change', error))
  }))

  const handler = async (req, res) => {
    const denied = rejection(ctx, req)
    if (denied) return json(res, denied, { error: 'Forbidden' })
    try {
      const url = new URL(req.url || '/', 'http://dsh.local')
      const method = url.pathname.slice(API_PREFIX.length).replace(/^\//, '')
      if (req.method === 'GET' && method === 'health') {
        await store.ready
        return json(res, 200, { ok: true, ...summary(store, backfill) })
      }
      if (req.method === 'GET' && method === 'packs') {
        return json(res, 200, { packs: listPacks() })
      }
      if (req.method === 'GET' && method === 'items') {
        await store.ready
        const data = summary(store, backfill)
        const status = url.searchParams.get('status')
        if (status) data.items = data.items.filter(item => item.status === status)
        return json(res, 200, data)
      }
      if (req.method === 'GET' && method === 'item') {
        await store.ready
        const item = store.get(url.searchParams.get('id') || '')
        return item ? json(res, 200, { item: withReviewProgress(item) }) : json(res, 404, { error: 'Item not found' })
      }
      if (req.method === 'GET' && method === 'preview') {
        await store.ready
        const item = store.get(url.searchParams.get('id') || '')
        if (!item) return json(res, 404, { error: 'Item not found' })
        const preview = await previewItem(item, { allowOutsideWorkspace: config.allowOutsideWorkspace === true })
        return json(res, 200, { preview })
      }
      if (req.method === 'GET' && method === 'receipt') {
        await store.ready
        const item = store.get(url.searchParams.get('id') || '')
        if (!item) return json(res, 404, { error: 'Item not found' })
        const currentEvidence = await captureArtifactEvidence(item, { allowOutsideWorkspace: config.allowOutsideWorkspace === true })
        const body = renderReceipt(item, { currentEvidence, projectUrl: config.projectUrl, reviewPack: getPack(item.reviewPack?.id) })
        return html(res, body, receiptFilename(item))
      }
      if (req.method === 'GET' && method === 'diff') {
        await store.ready
        const item = store.get(url.searchParams.get('id') || '')
        if (!item) return json(res, 404, { error: 'Item not found' })
        if (item.sourceType !== 'workspace-change') return json(res, 400, { error: 'Diff is only available for workspace changes' })
        const changes = ctx.get('workspaceChanges')
        if (typeof changes?.diff !== 'function') return json(res, 200, { preview: { kind: 'unavailable' } })
        const preview = await changes.diff(item.sessionId, item.eventSeq, item.sourceIndex, AbortSignal.timeout(5000))
        return json(res, 200, { preview: preview || { kind: 'unavailable' } })
      }
      if (req.method === 'POST' && method === 'pack') {
        await store.ready
        const body = await readJson(req)
        const packId = String(body.packId || '')
        const pack = packId ? getPack(packId) : null
        if (packId && !pack) return json(res, 400, { error: 'Review pack not found' })
        const item = await store.setReviewPack(String(body.id || ''), pack ? initialReviewPack(pack) : null)
        return json(res, 200, { item: withReviewProgress(item), ...summary(store, backfill) })
      }
      if (req.method === 'POST' && method === 'check') {
        await store.ready
        const body = await readJson(req)
        const id = String(body.id || '')
        const existing = store.get(id)
        const pack = getPack(existing?.reviewPack?.id)
        const checkId = String(body.checkId || '')
        if (!pack?.checks.some(check => check.id === checkId)) return json(res, 400, { error: 'Review check not found' })
        if (typeof body.checked !== 'boolean') return json(res, 400, { error: 'checked must be a boolean' })
        const item = await store.updateReviewCheck(id, checkId, {
          checked: body.checked,
          detail: typeof body.detail === 'string' ? body.detail : '',
        })
        return json(res, 200, { item: withReviewProgress(item), ...summary(store, backfill) })
      }
      if (req.method === 'POST' && method === 'backfill') {
        await startBackfill()
        return json(res, 200, summary(store, backfill))
      }
      if (req.method === 'POST' && method === 'action') {
        await store.ready
        const body = await readJson(req)
        const id = String(body.id || '')
        const action = String(body.action || '')
        const note = typeof body.note === 'string' ? body.note : ''
        // Session-scoped bulk disposition. Deliberately archive-only: approve
        // and return each carry a human decision and evidence, so they stay
        // one artifact at a time.
        if (typeof body.sessionId === 'string' && body.sessionId) {
          if (action !== 'archive') return json(res, 400, { error: 'Bulk actions are limited to archive' })
          const result = await store.archiveSession(body.sessionId, note)
          return json(res, 200, { archived: result.archived, ...summary(store, backfill) })
        }
        const existing = store.get(id)
        assertReviewReady(existing, action)
        const evidence = existing && (action === 'approve' || action === 'return')
          ? await captureArtifactEvidence(existing, { allowOutsideWorkspace: config.allowOutsideWorkspace === true })
          : undefined
        const item = await store.action(id, action, note, { evidence })
        return json(res, 200, { item: withReviewProgress(item), ...summary(store, backfill) })
      }
      return json(res, 404, { error: 'Route not found' })
    } catch (error) {
      const status = error?.code === 'ENOENT' ? 404 : error instanceof SyntaxError ? 400 : 400
      return json(res, status, { error: error.message || 'Request failed' })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler }))
}
