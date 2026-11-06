import { presentedRecords } from './events.js'

const DEFAULT_SESSION_LIMIT = 50
const DEFAULT_EVENT_LIMIT = 5000
const DEFAULT_ITEM_LIMIT = 1000

function positiveLimit(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || new Error('Backfill aborted')
}

export function resolveBackfillOptions(options = {}) {
  return {
    sessionLimit: positiveLimit(options.sessionLimit, DEFAULT_SESSION_LIMIT),
    eventLimit: positiveLimit(options.eventLimit, DEFAULT_EVENT_LIMIT),
    itemLimit: positiveLimit(options.itemLimit, DEFAULT_ITEM_LIMIT),
  }
}

/**
 * Read a bounded, newest-first selection of persisted Sessions and ingest only
 * official deliverables/presented events. Existing review decisions remain in
 * OutboxStore, which treats identical rediscovery as a no-op.
 */
export async function backfillPresented({
  persistence,
  store,
  signal,
  now = () => new Date(),
  ...options
}) {
  const limits = resolveBackfillOptions(options)
  const result = {
    status: 'running',
    ...limits,
    listed: 0,
    scanned: 0,
    discovered: 0,
    changed: 0,
    truncated: false,
    errors: [],
    startedAt: now().toISOString(),
    finishedAt: null,
  }
  const records = []
  const seen = new Set()

  try {
    throwIfAborted(signal)
    const snapshots = await persistence.list({ signal })
    if (!Array.isArray(snapshots)) throw new Error('Session persistence returned an invalid list')
    result.listed = snapshots.length
    const selected = snapshots
      .filter(snapshot => typeof snapshot?.header?.id === 'string' && snapshot.header.id)
      .sort((left, right) => Number(right.header.createdAt || 0) - Number(left.header.createdAt || 0))
    result.truncated = selected.length > limits.sessionLimit
    const candidates = selected.slice(0, limits.sessionLimit)

    for (const snapshot of candidates) {
      if (records.length >= limits.itemLimit) {
        result.truncated = true
        break
      }
      throwIfAborted(signal)
      const id = snapshot.header.id
      if (seen.has(id)) continue
      seen.add(id)
      let handle
      let sessionError = false
      try {
        handle = await persistence.open(id, 'read', { signal })
        const eventCount = Number.isSafeInteger(snapshot.eventCount) && snapshot.eventCount >= 0
          ? snapshot.eventCount
          : undefined
        const offset = eventCount === undefined ? 0 : Math.max(0, eventCount - limits.eventLimit)
        if (eventCount !== undefined && eventCount > limits.eventLimit) result.truncated = true
        const read = await handle.read(offset, limits.eventLimit, { signal })
        if (!read || !Array.isArray(read.events)) throw new Error('Session handle returned invalid events')
        const session = { id, header: snapshot.header }
        for (const event of read.events) {
          if (event?.type !== 'deliverables/presented') continue
          const converted = presentedRecords(session, event, now())
          for (const record of converted) {
            if (records.length >= limits.itemLimit) {
              result.truncated = true
              break
            }
            records.push(record)
          }
        }
        result.scanned += 1
      } catch (error) {
        throwIfAborted(signal)
        sessionError = true
        result.errors.push({ sessionId: id, error: errorMessage(error) })
      } finally {
        if (handle) {
          try {
            await handle.close()
          } catch (error) {
            sessionError = true
            result.errors.push({ sessionId: id, error: `Close failed: ${errorMessage(error)}` })
          }
        }
      }
      if (sessionError) result.truncated = true
    }

    throwIfAborted(signal)
    result.discovered = records.length
    result.changed = await store.upsert(records)
    result.status = result.errors.length > 0 ? 'degraded' : 'ready'
    return result
  } catch (error) {
    result.status = 'failed'
    result.errors.push({ sessionId: null, error: errorMessage(error) })
    throw error
  } finally {
    result.finishedAt = now().toISOString()
  }
}
