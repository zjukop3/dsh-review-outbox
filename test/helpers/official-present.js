import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { provideWorkingDirectoryFixture, unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { createScope } from '@deepseek-ai/dsh-scope'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import * as Present from '@deepseek-ai/dsh-tool-present'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import ToolRuntime from '@deepseek-ai/dsh-tools'

async function officialAgent(ctx, cwd, id, restoredSession) {
  let scope
  const session = restoredSession || Session.create(id, [], {
    version: SESSION_FORMAT_VERSION,
    id,
    createdAt: Date.now(),
    cwd,
    isSeeded: false,
  })
  const agent = {
    id,
    options: {},
    session,
    model: unsupportedModel(),
    inbox: unsupportedInbox(),
    status: 'idle',
    get ctx() { return scope.ctx },
    send() {},
    followup() {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' }) }),
    inject() {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  await ctx.plugin(Object.assign(inner => {
    scope = createScope(inner, agent)
  }, { inject: ['tools'] }))
  await ctx.agents.register(agent)
  return agent
}

/** Execute one or more shipped present calls and close a durable JSONL Session writer. */
export async function executeOfficialPresent({
  workspace,
  persistenceRoot,
  sessionId = 'official-present-session',
  callId = 'official-present-call',
  fileName = 'official.md',
  content = '# Produced by the official present tool\n',
  description = 'Official tool integration artifact',
  files,
  calls,
  maxFiles = 2,
  resume = false,
}) {
  await mkdir(workspace, { recursive: true })
  await mkdir(persistenceRoot, { recursive: true })
  const ctx = new Context()
  let writer
  try {
    provideWorkingDirectoryFixture(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(NativeToolExecutor)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(LocalFileSystem, { cwd: workspace })
    await ctx.plugin(JsonlSessionPersistence, { root: persistenceRoot, compression: 'zstd' })
    await ctx.plugin(Present, { maxFiles })

    const id = SessionId(sessionId)
    let restoredSession
    let previousEventCount = 0
    if (resume) {
      writer = await ctx.sessionPersistence.open(id, 'write')
      const stored = await writer.read()
      previousEventCount = stored.events.length
      restoredSession = Session.fromRestore(id, stored.events, writer.header, writer.inheritedEventCount, stored.eventState)
    }
    const owner = await officialAgent(ctx, workspace, id, restoredSession)
    if (!resume) owner.session.append('turn/start', { turn: 1 })
    const requestedCalls = calls || [{ callId, fileName, content, description, files }]
    const deliveries = []
    for (const call of requestedCalls) {
      const callFiles = call.files || files
      if (!callFiles) await writeFile(join(workspace, call.fileName || fileName), call.content ?? content, 'utf8')
      const execution = await executeToolFixture(ctx, {
        signal: new AbortController().signal,
        callId: ToolCallId(call.callId || callId),
        name: 'present',
        arguments: {
          files: callFiles || [{ path: call.fileName || fileName, description: call.description ?? description }],
        },
        agent: owner,
      })
      if (execution.isError) throw new Error(`Official present failed: ${JSON.stringify(execution)}`)
      const delivery = owner.session.snapshotEvents().filter(event => event.type === 'deliverables/presented').at(-1)
      if (!delivery) throw new Error('Official present did not append deliverables/presented')
      deliveries.push(delivery)
    }

    if (!writer) writer = await ctx.sessionPersistence.create(owner.session.header)
    await writer.append(owner.session.snapshotEvents().slice(previousEventCount))
    await writer.flush()
    const stored = (await ctx.sessionPersistence.list()).find(candidate => candidate.header.id === owner.id)
    if (!stored?.location?.path) throw new Error('Official Session log was not materialized')
    if (!(await stat(stored.location.path)).isFile()) throw new Error('Official Session log is not a file')
    return {
      delivery: deliveries.at(-1),
      deliveries,
      events: owner.session.snapshotEvents(),
      header: owner.session.header,
      stored,
    }
  } finally {
    if (writer) await writer.close()
    await ctx.fiber.dispose()
  }
}
