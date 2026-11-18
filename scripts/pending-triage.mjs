// Triage report for the review-outbox pending queue.
//
// The funnel's only adoption signal is a human decision, and the queue has never
// had one. The reason is not unwillingness — it is that "99 pending" is a single
// number with no handle on it. This script turns it into batches a person can
// actually work through: grouped by project, ordered so the first batch clears
// the most, with the oldest age in each group and a sample of paths.
//
// It is READ-ONLY on purpose. There is no --approve, no --mark, no bulk path.
// A decision has to be one a person actually made, in the panel, after reading
// the artifact. A CLI that marked items in bulk would not be an optimisation of
// this metric; it would be the end of the metric.
//
//   node scripts/pending-triage.mjs [--state PATH] [--json] [--top N]
//
// Exit codes: 0 there is nothing pending, 1 there is pending work, 2 read error.

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const flag = name => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
const asJson = args.includes('--json')
const topCount = Number(flag('--top') || 5)

const statePath = flag('--state') || resolve(homedir(), '.dsh', 'review-outbox', 'items.json')

let state
try {
  state = JSON.parse(await readFile(statePath, 'utf8'))
} catch (error) {
  process.stderr.write(`cannot read ${statePath}: ${error.message}\n`)
  process.stderr.write('Pass --state PATH or run the plugin once so the state exists.\n')
  process.exit(2)
}

const items = Array.isArray(state.items) ? state.items : []
const pending = items.filter(item => item.status === 'pending')

if (pending.length === 0) {
  if (asJson) process.stdout.write(`${JSON.stringify({ statePath, pending: 0, groups: [] }, null, 2)}\n`)
  else process.stdout.write(`no pending artifacts in ${statePath}\n`)
  process.exit(0)
}

const now = Date.now()
const ageHours = item => (now - Date.parse(item.firstSeenAt || item.updatedAt || new Date().toISOString())) / 3600000

// Group by project (the cwd the artifact came from). That is the axis a person
// actually works along: one project's artifacts share context, so reviewing
// them back to back costs less than switching projects between each one.
const groups = new Map()
for (const item of pending) {
  const project = item.cwd || '(unknown project)'
  if (!groups.has(project)) groups.set(project, { project, items: [], oldestHours: 0, newestHours: Infinity })
  const group = groups.get(project)
  const age = ageHours(item)
  group.items.push(item)
  group.oldestHours = Math.max(group.oldestHours, age)
  group.newestHours = Math.min(group.newestHours, age)
}

const summarise = group => {
  const extensions = new Map()
  for (const item of group.items) {
    const path = item.path || ''
    const dot = path.lastIndexOf('.')
    const extension = dot > 0 ? path.slice(dot + 1).toLowerCase() : '(no extension)'
    extensions.set(extension, (extensions.get(extension) || 0) + 1)
  }
  const sessions = new Set(group.items.map(item => item.sessionId).filter(Boolean))
  return {
    project: group.project,
    count: group.items.length,
    sessions: sessions.size,
    oldestHours: Math.round(group.oldestHours),
    newestHours: Math.round(group.newestHours),
    byExtension: Object.fromEntries([...extensions.entries()].sort((a, b) => b[1] - a[1])),
    // A sample, not the list: the point is to show what the batch looks like,
    // and the panel is where the actual review happens.
    sample: group.items
      .slice()
      .sort((a, b) => (a.firstSeenAt || '').localeCompare(b.firstSeenAt || ''))
      .slice(0, topCount)
      .map(item => ({ path: item.path || '', ageHours: Math.round(ageHours(item)) })),
  }
}

// Largest batch first: one sitting clears the most pending, which is the
// difference between starting and not starting.
const ordered = [...groups.values()].map(summarise).sort((a, b) => b.count - a.count || b.oldestHours - a.oldestHours)

const report = {
  statePath,
  generatedAt: new Date().toISOString(),
  storeVersion: state.version ?? null,
  storeUpdatedAt: state.updatedAt ?? null,
  pending: pending.length,
  projects: ordered.length,
  sessions: new Set(pending.map(item => item.sessionId).filter(Boolean)).size,
  oldestHours: Math.round(Math.max(...pending.map(ageHours))),
  medianHours: (() => {
    const ages = pending.map(ageHours).sort((a, b) => a - b)
    return Math.round(ages[Math.floor(ages.length / 2)])
  })(),
  groups: ordered,
  readOnly: 'This report does not change any item. A decision is recorded only when a person makes one in the panel; a bulk mark here would end the metric it reports on.',
}

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exit(1)
}

const lines = []
lines.push(`# Review Outbox 待审分诊`)
lines.push('')
lines.push(`状态文件：${report.statePath}`)
lines.push(`待审：**${report.pending}** 项，来自 ${report.projects} 个项目、${report.sessions} 个会话`)
lines.push(`最老 ${Math.round(report.oldestHours / 24)} 天，中位数 ${Math.round(report.medianHours / 24)} 天`)
lines.push('')
lines.push('## 按项目分批（先清最大的那批）')
lines.push('')
lines.push('| 批次 | 项目 | 待审 | 会话 | 最老 | 文件类型 |')
lines.push('| ---: | --- | ---: | ---: | ---: | --- |')
ordered.forEach((group, index) => {
  const kinds = Object.entries(group.byExtension).map(([extension, count]) => `${extension}×${count}`).join(' ')
  lines.push(`| ${index + 1} | \`${group.project}\` | ${group.count} | ${group.sessions} | ${Math.round(group.oldestHours / 24)}d | ${kinds} |`)
})
lines.push('')
lines.push('## 每个批次里最老的那几项')
for (const group of ordered) {
  lines.push('')
  lines.push(`**${group.project}**（${group.count} 项）`)
  for (const sample of group.sample) {
    lines.push(`- \`${sample.path}\` — ${Math.round(sample.ageHours / 24)} 天`)
  }
}
lines.push('')
lines.push(`> ${report.readOnly}`)
lines.push('')
lines.push('在面板里逐项读完再判。这个脚本的分组只用来决定「先做哪一批」，不用来决定「通过还是不通过」。')

process.stdout.write(lines.join('\n') + '\n')
process.exit(1)
