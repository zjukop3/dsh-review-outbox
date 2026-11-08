import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'

const home = process.argv[2] ? await realpath(path.resolve(process.argv[2])) : null
if (!home) throw new Error('Usage: node --experimental-transform-types scripts/seed-research-report-backfill.mjs DSH_HOME')
const temporaryRoots = [await realpath(tmpdir()), await realpath('/tmp').catch(() => null)]
  .filter(Boolean)
  .map(root => `${root}${path.sep}`)
if (!temporaryRoots.some(root => home.startsWith(root))) throw new Error('Seeding is restricted to an isolated temporary DSH_HOME')
const checkout = path.resolve(process.env.DSH_RESEARCH_REPORT_CHECKOUT || '../dsh-research-report')
if (!existsSync(checkout)) {
  throw new Error(`dsh-research-report checkout not found at ${checkout}; set DSH_RESEARCH_REPORT_CHECKOUT to a local checkout of PerryLink/dsh-research-report`)
}
const researchPackage = JSON.parse(await readFile(path.join(checkout, 'package.json'), 'utf8'))
assert.equal(researchPackage.name, 'dsh-research-report')
const researchRequire = createRequire(path.join(checkout, 'package.json'))
const importResearch = specifier => import(pathToFileURL(researchRequire.resolve(specifier)).href)

const { Context } = await importResearch('@deepseek-ai/cordis')
const { default: SessionStore, SessionId } = await importResearch('@deepseek-ai/dsh-session')
const { default: SystemPrompt } = await importResearch('@deepseek-ai/dsh-system-prompt')
const { default: ToolRuntime } = await importResearch('@deepseek-ai/dsh-tools')
const NativeToolExecutor = await importResearch('@deepseek-ai/dsh-tool-executor-native')
const { LocalJobRegistry } = await importResearch('@deepseek-ai/dsh-jobs-local')
const { mountPlugin } = await import(pathToFileURL(path.join(checkout, 'test/harness.ts')).href)

const workspace = path.join(home, 'workspace')
await mkdir(workspace, { recursive: true })
await mkdir(path.join(home, 'sessions'), { recursive: true })
process.chdir(checkout)

const ctx = new Context()
await ctx.plugin(SessionStore)
const session = ctx.sessions.create(SessionId('preinstall-research-session'), { meta: { cwd: workspace } })
await ctx.plugin(SystemPrompt, { personaPrefix: '' })
await ctx.plugin(ToolRuntime)
await ctx.plugin(NativeToolExecutor)
await ctx.plugin(LocalJobRegistry, { maxConcurrentJobsPerOwner: 10 })
ctx.jobs.attachController('test')
const agent = {
  id: session.id,
  session,
  status: 'idle',
  options: {},
  reserveTurnAdmission: () => () => undefined,
}
const base = { ctx, session, agent, root: workspace }
let researchFiber
let writerContext
let writer
let callCounter = 0

async function executeLogged(name, args) {
  callCounter += 1
  const id = `preinstall-research-${callCounter}`
  session.append('step/start', { turn: 1, step: callCounter })
  session.append('assistant/message', {
    turn: 1,
    step: callCounter,
    stream: [],
    message: {
      id: `assistant-${id}`,
      role: 'assistant',
      source: { kind: 'model', provider: 'e2e-fixture', model: 'e2e-fixture' },
      content: [{ type: 'tool-call', id, name, arguments: JSON.stringify(args) }],
    },
  }, { surfaceOp: 'append' })
  const batch = await ctx.tools.execute({
    calls: [{ type: 'tool-call', id, name, arguments: JSON.stringify(args) }],
    agent,
    signal: new AbortController().signal,
    log: { turn: 1, step: callCounter },
  })
  const outcome = batch.results[0]
  assert.ok(outcome)
  assert.equal(outcome.result.isError, false, outcome.result.content?.map(block => block.text || '').join('\n'))
  session.append('step/end', { turn: 1, step: callCounter })
  return { id, result: outcome.result }
}

try {
  researchFiber = await mountPlugin(base)
  session.append('turn/start', { turn: 1 })
  const fixtures = [
    ['fixtures/market-size.md', '市场规模快照'],
    ['fixtures/growth.md', '增长率快照'],
    ['fixtures/players.md', '厂商快照'],
  ]
  const evidenceIds = []
  for (const [origin, title] of fixtures) {
    const { result } = await executeLogged('evidence_add', { origin, title })
    assert.equal(result.value.ok, true)
    evidenceIds.push(result.value.evidenceId)
  }
  const sealedExecution = await executeLogged('research_report', {
    topic: '应用内首次验收',
    title: '应用内发现后的首次研究报告验收',
    sections: [
      { heading: '市场规模', paragraphs: [{ text: '2025 年全球示例行业市场规模为 1,280 亿元。', claimIds: ['c-size'] }] },
      { heading: '增长率', paragraphs: [{ text: '2025 年同比增长率为 11.3%。', claimIds: ['c-growth'] }] },
      { heading: '竞争格局', paragraphs: [{ text: '头部三家厂商合计占比 57%。', claimIds: ['c-share'] }] },
    ],
    claims: [
      { id: 'c-size', text: '市场规模为 1,280 亿元', evidenceIds: [evidenceIds[0]] },
      { id: 'c-growth', text: '同比增长率为 11.3%', evidenceIds: [evidenceIds[1]] },
      { id: 'c-share', text: '前三厂商合计占比为 57%', evidenceIds: [evidenceIds[2]] },
    ],
    evidenceRefs: evidenceIds,
  })
  const sealed = sealedExecution.result.value
  assert.equal(sealed.kind, 'sealed')
  assert.deepEqual(sealed.counts, { verified: 3, unverified: 0, contradicted: 0, insufficient: 0, disproven: 0 })
  const manifestText = await readFile(sealed.manifestFile, 'utf8')
  assert.equal(createHash('sha256').update(manifestText, 'utf8').digest('hex'), sealed.sealHash)

  session.append('turn/end', { turn: 1 })
  const events = session.snapshotEvents()
  assert.equal(events.filter(event => event.type === 'deliverables/presented').length, 0)
  const resultEvent = events.find(event => event.type === 'tool/result' && event.data?.message?.toolCallId === sealedExecution.id)
  assert.ok(resultEvent)
  assert.equal(resultEvent.data.meta.reportFile, sealed.reportFile)
  assert.equal(resultEvent.data.meta.manifestFile, sealed.manifestFile)

  writerContext = new Context()
  await writerContext.plugin(JsonlSessionPersistence, { root: path.join(home, 'sessions'), compression: 'zstd' })
  writer = await writerContext.sessionPersistence.create(session.header)
  await writer.append(events)
  await writer.flush()
  const stored = (await writerContext.sessionPersistence.list()).find(candidate => candidate.header.id === session.id)
  assert.ok(stored?.location?.path)
  console.log(JSON.stringify({
    ok: true,
    home,
    sessionId: session.id,
    cwd: session.header.cwd,
    callId: sealedExecution.id,
    resultSeq: resultEvent.seq,
    toolCallEvents: events.filter(event => event.type === 'tool/call').length,
    toolResultEvents: events.filter(event => event.type === 'tool/result').length,
    presentedEvents: 0,
    reportFile: sealed.reportFile,
    manifestFile: sealed.manifestFile,
    sealHash: sealed.sealHash,
    log: stored.location,
  }, null, 2))
} finally {
  if (researchFiber) await researchFiber.dispose()
  if (writer) await writer.close()
  if (writerContext) await writerContext.fiber.dispose()
  await ctx.fiber.dispose()
}
