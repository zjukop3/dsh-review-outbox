function isoTime(value, fallback = new Date()) {
  const date = typeof value === 'number' ? new Date(value) : value ? new Date(String(value)) : fallback
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString()
}

function baseRecord({ id, sourceType, session, event, cwd, path, description, now }) {
  return {
    id,
    sourceType,
    sessionId: String(session?.id ?? ''),
    eventSeq: Number(event.seq),
    turn: Number(event.data?.turn ?? 0),
    cwd: cwd || null,
    path,
    description: description || '',
    status: 'pending',
    revision: 1,
    firstSeenAt: now,
    updatedAt: now,
    history: [{ at: now, action: 'observed', note: '' }],
  }
}

export function presentedRecords(session, event, fallbackNow) {
  if (event?.type !== 'deliverables/presented' || !session?.id || !Array.isArray(event.data?.files)) return []
  const now = isoTime(event.time, fallbackNow)
  const callId = String(event.data.callId ?? event.seq)
  const occurrences = new Map()
  return event.data.files.flatMap((file, index) => {
    if (!file || typeof file.path !== 'string' || file.path.trim() === '') return []
    const occurrence = occurrences.get(file.path) || 0
    occurrences.set(file.path, occurrence + 1)
    return [{
      ...baseRecord({
        id: `presented:${session.id}:${callId}:${index}`,
        sourceType: 'presented',
        session,
        event,
        cwd: session.header?.cwd,
        path: file.path,
        description: typeof file.description === 'string' ? file.description : '',
        now,
      }),
      callId,
      sourceIndex: index,
      occurrence,
    }]
  })
}

export function researchReportRecords(session, event, toolName, fallbackNow) {
  if (event?.type !== 'tool/result' || toolName !== 'research_report' || !session?.id) return []
  if (event.data?.message?.isError === true) return []
  const meta = event.data?.meta
  if (!meta || typeof meta.reportFile !== 'string' || typeof meta.manifestFile !== 'string') return []
  if (!meta.reportFile.trim() || !meta.manifestFile.trim()) return []
  const callId = String(event.data?.message?.toolCallId ?? event.data?.message?.source?.callId ?? event.seq)
  const now = isoTime(event.time, fallbackNow)
  const files = [
    [meta.reportFile, 'dsh-research-report 密封研究报告'],
    [meta.manifestFile, 'dsh-research-report 报告清单与 seal 证据'],
  ]
  return files.map(([path, description], index) => ({
    ...baseRecord({
      id: `research-report:${session.id}:${callId}:${index}`,
      sourceType: 'research-report',
      session,
      event,
      cwd: session.header?.cwd,
      path,
      description,
      now,
    }),
    callId,
    sourceIndex: index,
    occurrence: 0,
  }))
}

export function workspaceRecords(session, event, summary, fallbackNow) {
  if (event?.type !== 'workspace/changes' || !session?.id || !summary || !Array.isArray(summary.files)) return []
  const now = isoTime(event.time, fallbackNow)
  return summary.files.flatMap((file, index) => {
    if (!file || typeof file.path !== 'string' || file.path.trim() === '') return []
    return [{
      ...baseRecord({
        id: `changes:${session.id}:${Number(event.data?.turn ?? summary.turn ?? 0)}:${file.path}`,
        sourceType: 'workspace-change',
        session,
        event,
        cwd: summary.cwd,
        path: file.path,
        description: typeof file.display === 'string' ? file.display : file.path,
        now,
      }),
      sourceIndex: index,
      added: Number(file.added ?? 0),
      deleted: Number(file.deleted ?? 0),
      total: Number(summary.total ?? summary.files.length),
      binary: file.binary === true,
      oversized: file.oversized === true,
    }]
  })
}

export function demoRecord({ path, cwd, now, description }) {
  const name = path.split(/[\\/]/).pop()
  return {
    id: `demo:${name}`,
    sourceType: 'demo',
    sessionId: '',
    eventSeq: 0,
    turn: 0,
    callId: `demo:${name}`,
    sourceIndex: 0,
    cwd,
    path,
    description: description || 'Synthetic review fixture',
    status: 'pending',
    revision: 1,
    firstSeenAt: now,
    updatedAt: now,
    history: [{ at: now, action: 'observed', note: 'Synthetic demo item' }],
  }
}
