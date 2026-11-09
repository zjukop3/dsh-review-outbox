// Reports the human-side funnel from a Review Outbox state file.
//
// The numbers that matter for adoption are not downloads or page views: they are
// how many artifacts a person actually decided on, how long they sat first, and
// which kinds get decided. This script reads one state file (or a DSH_HOME) and
// prints those numbers, so a weekly check is one command instead of a guess.
//
// Usage:
//   node scripts/report-usage.mjs [STATE_FILE | DSH_HOME]
//   node scripts/report-usage.mjs --json [STATE_FILE | DSH_HOME]

import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const target = args.find(argument => !argument.startsWith('--'))
  || process.env.DSH_HOME
  || join(homedir(), '.dsh')

const statePath = target.endsWith('.json') ? resolve(target) : join(resolve(target), 'review-outbox', 'items.json')

const DECISIONS = new Set(['approve', 'return', 'archive', 'reopen'])

function kindOf(path) {
  const name = String(path || '').split(/[\\/]/).filter(Boolean).pop() || ''
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return 'other'
  const extension = name.slice(dot + 1).toLowerCase()
  if (['md', 'markdown', 'txt', 'docx', 'pdf', 'html', 'htm'].includes(extension)) return 'document'
  if (['csv', 'tsv', 'xlsx', 'xls'].includes(extension)) return 'sheet'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension)) return 'image'
  if (['json', 'jsonl', 'yaml', 'yml', 'xml', 'log'].includes(extension)) return 'data'
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'sh', 'mjs', 'rb', 'go', 'rs'].includes(extension)) return 'code'
  return 'other'
}

function countBy(entries, keyOf) {
  const counts = {}
  for (const entry of entries) {
    const key = keyOf(entry)
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}

const raw = await readFile(statePath, 'utf8')
const state = JSON.parse(raw)
const items = Array.isArray(state.items) ? state.items : []
const now = Date.now()

const decisions = []
for (const item of items) {
  for (const entry of item.history || []) {
    if (!DECISIONS.has(entry.action)) continue
    decisions.push({ id: item.id, kind: kindOf(item.path), action: entry.action, at: entry.at, sessionId: item.sessionId })
  }
}

const pending = items.filter(item => item.status === 'pending')
const pendingAgesHours = pending
  .map(item => (now - new Date(item.updatedAt || item.presentedAt || 0).getTime()) / 3_600_000)
  .filter(age => Number.isFinite(age) && age > 0)
  .sort((left, right) => left - right)

const ages = pendingAgesHours
const medianAgeHours = ages.length === 0
  ? null
  : Number((ages.length % 2 === 1 ? ages[(ages.length - 1) / 2] : (ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2).toFixed(1))

const sessions = new Set(items.map(item => item.sessionId).filter(Boolean))
const sessionPending = countBy(pending, item => item.sessionId || 'unknown')

const report = {
  statePath,
  generatedAt: new Date(now).toISOString(),
  artifacts: {
    total: items.length,
    byStatus: countBy(items, item => item.status || 'unknown'),
    byKind: countBy(items, item => kindOf(item.path)),
    sessions: sessions.size,
  },
  humanDecisions: {
    total: decisions.length,
    byAction: countBy(decisions, decision => decision.action),
    byKind: countBy(decisions, decision => decision.kind),
    first: decisions.map(d => d.at).sort()[0] || null,
    last: decisions.map(d => d.at).sort().at(-1) || null,
  },
  pending: {
    count: pending.length,
    medianAgeHours,
    oldestAgeHours: ages.length ? Number(ages.at(-1).toFixed(1)) : null,
    sessionsWithPending: Object.keys(sessionPending).length,
    largestSession: Object.entries(sessionPending).sort((left, right) => right[1] - left[1])[0] || null,
  },
  reading: decisions.length === 0
    ? 'No human decision has ever been recorded in this state. Pending depth alone is not adoption.'
    : `A person decided on ${decisions.length} artifact(s); ${pending.length} remain.`,
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const { artifacts, humanDecisions, pending: pendingSummary } = report
  console.log(`${statePath}`)
  console.log(`  成果 ${artifacts.total} 条 / 会话 ${artifacts.sessions} 个`)
  console.log(`  状态 ${Object.entries(artifacts.byStatus).map(([key, value]) => `${key} ${value}`).join(' · ')}`)
  console.log(`  类型 ${Object.entries(artifacts.byKind).map(([key, value]) => `${key} ${value}`).join(' · ')}`)
  console.log(`  人工动作 ${humanDecisions.total} 次${humanDecisions.total ? `（${Object.entries(humanDecisions.byAction).map(([key, value]) => `${key} ${value}`).join(' · ')}）` : ''}`)
  console.log(`  待审 ${pendingSummary.count} 条，中位停留 ${pendingSummary.medianAgeHours ?? '—'} 小时，最久 ${pendingSummary.oldestAgeHours ?? '—'} 小时`)
  if (pendingSummary.largestSession) console.log(`  最大积压会话 ${pendingSummary.largestSession[0]}（${pendingSummary.largestSession[1]} 条）`)
  console.log(`  ${report.reading}`)
}
