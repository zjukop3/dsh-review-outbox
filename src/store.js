import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const ACTION_STATUS = new Map([
  ['approve', 'approved'],
  ['return', 'returned'],
  ['archive', 'archived'],
  ['reopen', 'pending'],
])

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function comparable(item) {
  return JSON.stringify({
    path: item.path,
    eventSeq: item.eventSeq,
    description: item.description,
    added: item.added,
    deleted: item.deleted,
  })
}

const REVISION_SOURCES = new Set(['presented', 'research-report'])

function tracksRevision(sourceType) {
  return REVISION_SOURCES.has(sourceType)
}

function sameDeliverableArtifact(item, record) {
  return tracksRevision(item.sourceType)
    && tracksRevision(record.sourceType)
    && item.sessionId === record.sessionId
    && item.path === record.path
    && Number(item.occurrence ?? 0) === Number(record.occurrence ?? 0)
}

export class OutboxStore {
  constructor(filePath, { now = () => new Date() } = {}) {
    this.filePath = filePath
    this.now = now
    this.items = []
    this.error = null
    this.readOnly = false
    this.chain = Promise.resolve()
    this.ready = Promise.resolve()
  }

  async load() {
    try {
      const text = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(text)
      if (!parsed || !Array.isArray(parsed.items)) throw new Error('items must be an array')
      this.items = parsed.items.filter(item => item && typeof item.id === 'string' && typeof item.path === 'string')
    } catch (error) {
      if (error?.code === 'ENOENT') {
        this.items = []
        return
      }
      this.error = `State is read-only: ${error.message}`
      this.readOnly = true
      this.items = []
    }
  }

  initialize(demoRecords = []) {
    this.ready = (async () => {
      const records = await demoRecords
      await this.load()
      if (records.length > 0) await this.upsert(records)
    })()
    return this.ready
  }

  enqueue(operation) {
    const run = this.chain.then(operation)
    this.chain = run.then(() => undefined, () => undefined)
    return run
  }

  assertWritable() {
    if (this.readOnly) throw new Error(this.error || 'State is read-only')
  }

  async persist() {
    this.assertWritable()
    await mkdir(dirname(this.filePath), { recursive: true })
    const temp = `${this.filePath}.${process.pid}.tmp`
    const body = JSON.stringify({ version: 1, updatedAt: this.now().toISOString(), items: this.items }, null, 2)
    await writeFile(temp, body, { encoding: 'utf8', mode: 0o600 })
    await rename(temp, this.filePath)
  }

  upsert(records) {
    return this.enqueue(async () => {
      this.assertWritable()
      let changed = 0
      for (const record of records) {
        let index = this.items.findIndex(item => item.id === record.id)
        if (index < 0 && tracksRevision(record.sourceType)) {
          const candidates = this.items
            .map((item, candidateIndex) => ({ item, candidateIndex }))
            .filter(candidate => sameDeliverableArtifact(candidate.item, record))
            .sort((left, right) => Number(right.item.eventSeq || 0) - Number(left.item.eventSeq || 0))
          index = candidates[0]?.candidateIndex ?? -1
        }
        if (index < 0) {
          this.items.unshift(record)
          changed += 1
          continue
        }
        const previous = this.items[index]
        if (tracksRevision(record.sourceType) && Number(previous.eventSeq || 0) > Number(record.eventSeq || 0)) continue
        if (comparable(previous) === comparable(record)) continue
        const at = this.now().toISOString()
        const next = {
          ...record,
          firstSeenAt: previous.firstSeenAt,
          revision: Number(previous.revision ?? 1) + 1,
          status: 'pending',
          updatedAt: at,
          ...(previous.reviewPack ? {
            reviewPack: {
              ...previous.reviewPack,
              checks: Object.fromEntries(Object.entries(previous.reviewPack.checks || {}).map(([id]) => [id, { checked: false, detail: '' }])),
            },
          } : {}),
          history: [
            ...(Array.isArray(previous.history) ? previous.history : []),
            { at, action: 'revision', note: `Revision ${Number(previous.revision ?? 1) + 1}` },
          ].slice(-100),
        }
        this.items[index] = next
        this.items.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
        changed += 1
      }
      if (changed > 0) await this.persist()
      return changed
    })
  }

  list() {
    return clone(this.items)
  }

  get(id) {
    const item = this.items.find(candidate => candidate.id === id)
    return item ? clone(item) : null
  }

  setReviewPack(id, reviewPack) {
    return this.enqueue(async () => {
      this.assertWritable()
      const item = this.items.find(candidate => candidate.id === id)
      if (!item) throw new Error('Item not found')
      if (item.status !== 'pending') throw new Error('Reopen the item before changing its review pack')
      if (!reviewPack && !item.reviewPack) return clone(item)
      if (reviewPack && item.reviewPack?.id === reviewPack.id && item.reviewPack?.version === reviewPack.version) return clone(item)
      item.reviewPack = reviewPack ? clone(reviewPack) : null
      item.updatedAt = this.now().toISOString()
      await this.persist()
      return clone(item)
    })
  }

  updateReviewCheck(id, checkId, update) {
    return this.enqueue(async () => {
      this.assertWritable()
      const item = this.items.find(candidate => candidate.id === id)
      if (!item) throw new Error('Item not found')
      if (item.status !== 'pending') throw new Error('Reopen the item before changing review checks')
      if (!item.reviewPack?.checks?.[checkId]) throw new Error('Review check not found')
      item.reviewPack.checks[checkId] = {
        checked: update.checked === true,
        detail: String(update.detail || '').slice(0, 2000),
      }
      item.updatedAt = this.now().toISOString()
      await this.persist()
      return clone(item)
    })
  }

  /**
   * Archive every still-pending artifact of one session in a single step.
   *
   * A daily profile can hold dozens of unreviewed deliverables from sessions
   * that are simply over; clearing them one row at a time is not a realistic
   * backlog workflow. Only `archive` is offered in bulk: approval and return
   * carry the human review decision and must stay per artifact. Archiving is
   * reversible through `reopen`, and the per-item history still records it.
   */
  archiveSession(sessionId, note = '') {
    return this.enqueue(async () => {
      this.assertWritable()
      const session = String(sessionId || '')
      if (!session) throw new Error('A session id is required')
      const targets = this.items.filter(item => item.sessionId === session && item.status === 'pending')
      if (targets.length === 0) throw new Error('No pending items in this session')
      const at = this.now().toISOString()
      const reviewNote = String(note || '').slice(0, 4000)
      for (const item of targets) {
        item.status = 'archived'
        item.updatedAt = at
        item.reviewNote = reviewNote
        item.history = [
          ...(Array.isArray(item.history) ? item.history : []),
          { at, action: 'archive', note: reviewNote },
        ].slice(-100)
      }
      await this.persist()
      return { archived: targets.length, ids: targets.map(item => item.id) }
    })
  }

  action(id, action, note = '', { evidence } = {}) {    return this.enqueue(async () => {
      this.assertWritable()
      const status = ACTION_STATUS.get(action)
      if (!status) throw new Error('Unknown action')
      const item = this.items.find(candidate => candidate.id === id)
      if (!item) throw new Error('Item not found')
      const at = this.now().toISOString()
      item.status = status
      item.updatedAt = at
      item.reviewNote = String(note || '').slice(0, 4000)
      if (action === 'approve' || action === 'return') item.reviewEvidence = evidence ? clone(evidence) : null
      if (action === 'reopen') item.reviewEvidence = null
      item.history = [
        ...(Array.isArray(item.history) ? item.history : []),
        {
          at,
          action,
          note: item.reviewNote,
          ...((action === 'approve' || action === 'return') && evidence ? { evidence: clone(evidence) } : {}),
        },
      ].slice(-100)
      await this.persist()
      return clone(item)
    })
  }
}
