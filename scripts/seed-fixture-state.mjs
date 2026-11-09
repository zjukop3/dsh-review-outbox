// Writes a synthetic outbox state into a DSH_HOME so the review panel can be
// driven without a real 75-item backlog. The mix mirrors one real daily profile:
// 35 .md, 14 .json, 9 .png, 5 .html, 5 .csv, 2 .py, 4 binaries and one file with
// no extension — 75 artifacts across 10 sessions.
//
// Usage: node scripts/seed-fixture-state.mjs DSH_HOME [--items N] [--sessions N]

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const home = process.argv[2]
if (!home) throw new Error('Usage: node scripts/seed-fixture-state.mjs DSH_HOME [--items N] [--sessions N]')
const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index > 0 ? Number(process.argv[index + 1]) : fallback
}
const itemBudget = flag('items', 75)
const sessionCount = flag('sessions', 10)

const MIX = [
  ['md', 35, 'report'],
  ['json', 14, 'data'],
  ['png', 9, 'shot'],
  ['html', 5, 'page'],
  ['csv', 5, 'sheet'],
  ['py', 2, 'tool'],
  ['bin', 4, 'blob'],
  ['', 1, 'Makefile'],
]

const plan = []
for (const [extension, count, stem] of MIX) {
  for (let index = 0; index < count; index += 1) plan.push([extension, `${stem}-${index}${extension ? `.${extension}` : ''}`])
}
while (plan.length < itemBudget) plan.push(['md', `extra-${plan.length}.md`])

const now = Date.now()
const items = plan.slice(0, itemBudget).map(([extension, name], index) => {
  const session = `fixture-session-${(index % sessionCount) + 1}`
  const at = new Date(now - index * 3_600_000).toISOString()
  return {
    id: `fixture-${index + 1}`,
    path: `/work/${session}/${name}`,
    sessionId: session,
    cwd: `/Users/fixture/work/${session}`,
    sourceType: 'presented',
    status: 'pending',
    revision: 1,
    presentedAt: at,
    updatedAt: at,
    description: `${extension || 'no extension'} fixture deliverable ${name}`,
    history: [{ action: 'observed', at }],
  }
})

const target = join(resolve(home), 'review-outbox', 'items.json')
await mkdir(dirname(target), { recursive: true })
await writeFile(target, `${JSON.stringify({ version: 1, updatedAt: new Date(now).toISOString(), items }, null, 2)}\n`, 'utf8')

const counts = {}
for (const item of items) {
  const name = item.path.split('/').pop()
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : 'other'
  counts[extension] = (counts[extension] || 0) + 1
}
console.log(JSON.stringify({ ok: true, state: target, items: items.length, sessions: sessionCount, extensions: counts }, null, 2))
