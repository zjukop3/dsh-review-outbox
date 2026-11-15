// Measures the adoption funnel from the running app's own state file: how
// many artifacts exist, how deep the pending backlog is, and — the only
// number that says anything about adoption — how many human decisions have
// ever been recorded.
//
//   node scripts/usage-funnel.mjs [--state ~/.dsh/review-outbox/items.json] [--out docs/metrics/YYYY-MM-DD-usage-funnel.json]
//
// Same schema as the 2026-11-10 ad-hoc measurement, so two runs compare.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const flag = name => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
const statePath = flag('--state') || resolve(homedir(), '.dsh', 'review-outbox', 'items.json')
const date = flag('--date') || new Date().toISOString().slice(0, 10)
const now = Date.now()

const state = await (async () => {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      process.stderr.write(`no app state at ${statePath} — the plugin has not backfilled anything yet, so there is no funnel to measure\n`)
      process.exit(2)
    }
    throw error
  }
})()
const items = state.items || []

const byStatus = {}
const byKind = {}
const sessions = new Set()
let oldestPending = null
const pendingAges = []
for (const item of items) {
  byStatus[item.status] = (byStatus[item.status] || 0) + 1
  byKind[item.sourceType] = (byKind[item.sourceType] || 0) + 1
  if (item.sessionId) sessions.add(item.sessionId)
  if (item.status === 'pending') {
    const seen = Date.parse(item.firstSeenAt)
    if (Number.isFinite(seen)) {
      const ageHours = Math.round(((now - seen) / 3600000) * 10) / 10
      pendingAges.push(ageHours)
      if (oldestPending === null || ageHours > oldestPending) oldestPending = ageHours
    }
  }
}
pendingAges.sort((a, b) => a - b)
const median = list => list.length ? list[Math.floor(list.length / 2)] : null

const decisions = []
for (const item of items) {
  for (const entry of item.history || []) {
    if (entry.action === 'approve' || entry.action === 'return') {
      decisions.push({ action: entry.action, at: entry.at, kind: item.sourceType })
    }
  }
}
const byAction = {}
for (const decision of decisions) byAction[decision.action] = (byAction[decision.action] || 0) + 1
const decisionTimes = decisions.map(decision => decision.at).sort()

const largestSession = Object.entries(items.reduce((acc, item) => {
  if (item.status !== 'pending' || !item.sessionId) return acc
  acc[item.sessionId] = (acc[item.sessionId] || 0) + 1
  return acc
}, {})).sort((a, b) => b[1] - a[1])[0] || [null, 0]

// The installed plugin version, so a funnel measurement self-documents which
// release's state it read — the 11-17 comparison may span 0.1.3 -> 0.1.11.
const installedVersion = await (async () => {
  try {
    // the state lives at ~/.dsh/review-outbox/, the daily profile at ~/.dsh/profiles/desktop/
    const dshHome = dirname(dirname(statePath))
    const pkg = JSON.parse(await readFile(resolve(dshHome, 'profiles', 'desktop', 'node_modules', 'dsh-review-outbox', 'package.json'), 'utf8'))
    return pkg.version
  } catch { return null }
})()

const funnel = {
  statePath,
  generatedAt: new Date().toISOString(),
  installedPluginVersion: installedVersion,
  appStateUpdatedAt: state.updatedAt,
  artifacts: {
    total: items.length,
    byStatus,
    byKind,
    sessions: sessions.size,
  },
  humanDecisions: {
    total: decisions.length,
    byAction,
    first: decisionTimes[0] || null,
    last: decisionTimes.at(-1) || null,
  },
  pending: {
    count: byStatus.pending || 0,
    medianAgeHours: median(pendingAges),
    oldestAgeHours: oldestPending,
    sessionsWithPending: new Set(items.filter(item => item.status === 'pending' && item.sessionId).map(item => item.sessionId)).size,
    largestSession,
  },
  reading: decisions.length
    ? `${decisions.length} human decision(s) recorded, first ${decisionTimes[0]}, last ${decisionTimes.at(-1)}.`
    : 'No human decision has ever been recorded in this state. Pending depth alone is not adoption.',
}

const out = flag('--out') || resolve('docs/metrics', `${date}-usage-funnel.json`)
await mkdir(dirname(out), { recursive: true })
await writeFile(out, `${JSON.stringify(funnel, null, 2)}\n`)
console.log(JSON.stringify({ ok: true, out, artifacts: funnel.artifacts.total, humanDecisions: funnel.humanDecisions.total, reading: funnel.reading }, null, 2))
