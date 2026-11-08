import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const checkout = path.resolve(process.env.DSH_RESEARCH_REPORT_CHECKOUT || '../dsh-research-report')
const evidencePath = path.resolve(process.env.DSH_REVIEW_OUTBOX_INTEROP_EVIDENCE || path.join(repositoryRoot, 'docs/e2e/research-report-interop.json'))
const researchPackage = JSON.parse(await readFile(path.join(checkout, 'package.json'), 'utf8'))
assert.equal(researchPackage.name, 'dsh-research-report')
process.chdir(checkout)

const harness = await import(pathToFileURL(path.join(checkout, 'test/harness.ts')).href)
const reviewPlugin = await import(pathToFileURL(path.join(repositoryRoot, 'src/host.js')).href)
const { mountBase, mountPlugin, unmountBase } = harness

let handler
const webServer = {
  register(route) {
    assert.equal(route.kind, 'prefix')
    assert.equal(route.path, '/review-outbox/api')
    handler = route.handler
    return () => { handler = undefined }
  },
}
const connection = { requestRejection: () => undefined }

async function invoke(method, route, body) {
  assert.equal(typeof handler, 'function')
  const req = body === undefined
    ? { method, url: route, headers: {} }
    : Readable.from([Buffer.from(JSON.stringify(body))])
  if (body !== undefined) Object.assign(req, { method, url: route, headers: {} })
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value },
    end(value = '') { this.body = value },
  }
  await handler(req, res)
  const contentType = String(res.headers['content-type'] || '')
  return {
    status: res.statusCode,
    headers: res.headers,
    data: contentType.includes('application/json') && res.body ? JSON.parse(res.body) : res.body,
  }
}

async function waitForItems(count) {
  let response
  for (let attempt = 0; attempt < 100; attempt += 1) {
    response = await invoke('GET', '/review-outbox/api/items')
    if (response.data.items.length >= count) return response
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  return response
}

let callCounter = 0
async function executeLogged(base, name, args) {
  callCounter += 1
  const id = `review-interop-${callCounter}`
  const batch = await base.ctx.tools.execute({
    calls: [{ type: 'tool-call', id, name, arguments: JSON.stringify(args) }],
    agent: base.agent,
    signal: new AbortController().signal,
    log: { turn: 1, step: callCounter },
  })
  const outcome = batch.results[0]
  assert.ok(outcome, `No settled result for ${name}`)
  return { id, result: outcome.result }
}

function valueOf(result) {
  assert.equal(result.isError, false, result.content?.map(block => block.text || '').join('\n'))
  return result.value
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

let base
let researchFiber
let reviewFiber
let preservedArtifact
const boundaryDisposers = []
try {
  base = await mountBase('review-outbox-interop')
  boundaryDisposers.push(base.ctx.provide('webServer', webServer))
  boundaryDisposers.push(base.ctx.provide('connection', connection))
  researchFiber = await mountPlugin(base)
  reviewFiber = await base.ctx.plugin(reviewPlugin, {
    statePath: path.join(base.root, 'review-outbox-items.json'),
    backfill: false,
    // The isolated harness seals into its own temporary reportRoot, which is
    // intentionally outside the research repository fixture cwd.
    allowOutsideWorkspace: true,
  })

  const fixtures = [
    ['fixtures/market-size.md', '市场规模快照'],
    ['fixtures/growth.md', '增长率快照'],
    ['fixtures/players.md', '厂商快照'],
  ]
  const evidenceIds = []
  for (const [origin, title] of fixtures) {
    const added = valueOf((await executeLogged(base, 'evidence_add', { origin, title })).result)
    assert.equal(added.ok, true)
    evidenceIds.push(added.evidenceId)
  }
  assert.equal(evidenceIds.length, 3)

  const sealedExecution = await executeLogged(base, 'research_report', {
    topic: 'Review Outbox 真实互操作验收',
    title: 'Review Outbox 与 dsh-research-report 真实互操作验收',
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
  const sealed = valueOf(sealedExecution.result)
  assert.equal(sealed.kind, 'sealed')
  assert.deepEqual(sealed.counts, { verified: 3, unverified: 0, contradicted: 0, insufficient: 0, disproven: 0 })
  assert.equal(sealedExecution.result.meta.reportFile, sealed.reportFile)
  assert.equal(sealedExecution.result.meta.manifestFile, sealed.manifestFile)

  const listed = await waitForItems(2)
  assert.equal(listed.status, 200)
  assert.equal(listed.data.items.length, 2)
  const reportItem = listed.data.items.find(item => item.path === sealed.reportFile)
  const manifestItem = listed.data.items.find(item => item.path === sealed.manifestFile)
  assert.ok(reportItem, JSON.stringify(listed.data))
  assert.ok(manifestItem, JSON.stringify(listed.data))
  for (const item of [reportItem, manifestItem]) {
    assert.equal(item.sourceType, 'research-report')
    assert.equal(item.callId, sealedExecution.id)
    assert.equal(item.sessionId, base.session.id)
  }

  const events = base.session.snapshotEvents()
  const resultEvent = events.find(event => event.type === 'tool/result' && event.data?.message?.toolCallId === sealedExecution.id)
  assert.ok(resultEvent)
  assert.equal(resultEvent.data.meta.reportFile, sealed.reportFile)
  assert.equal(resultEvent.data.meta.manifestFile, sealed.manifestFile)
  assert.equal(reportItem.eventSeq, resultEvent.seq)
  assert.equal(manifestItem.eventSeq, resultEvent.seq)
  assert.equal(events.filter(event => event.type === 'deliverables/presented').length, 0)

  const preview = await invoke('GET', `/review-outbox/api/preview?id=${encodeURIComponent(reportItem.id)}`)
  assert.equal(preview.status, 200)
  assert.equal(preview.data.preview.kind, 'text')
  assert.match(preview.data.preview.content, /c-size/)
  assert.match(preview.data.preview.content, /✅ verified/)

  assert.equal(reportItem.reviewPack.id, 'research-report')
  assert.equal(reportItem.reviewProgress.requiredCompleted, 0)
  assert.equal(reportItem.reviewProgress.requiredTotal, 4)
  assert.equal(manifestItem.reviewPack, undefined)
  assert.equal(manifestItem.reviewProgress, null)
  const premature = await invoke('POST', '/review-outbox/api/action', { id: reportItem.id, action: 'approve' })
  assert.equal(premature.status, 400)

  const reviewNotes = {
    'claims-evidence': 'Appendix A 的 c-size、c-growth、c-share 均为 verified；manifest.json 含 3 条 verdicts 与 3 条 evidence。',
    'citations-accessible': '三份固定证据 market-size.md、growth.md、players.md 已登记并能从 ledger 快照复核；本次不声称外部 URL 可访问。',
    'data-scope': '报告中的 1,280 亿元、11.3% 与 57% 已对照固定证据快照；数字口径仅以本次合成夹具为限。',
    'method-limitations': '这是无网络的本地夹具互操作验收，只证明工具与审阅链路，不外推为真实行业研究结论。',
  }
  for (const [checkId, detail] of Object.entries(reviewNotes)) {
    const checked = await invoke('POST', '/review-outbox/api/check', { id: reportItem.id, checkId, checked: true, detail })
    assert.equal(checked.status, 200, JSON.stringify(checked.data))
  }
  const approved = await invoke('POST', '/review-outbox/api/action', {
    id: reportItem.id,
    action: 'approve',
    note: '真实 research_report 结果已自动入库；报告、manifest、3 条 verdict 与 sealHash 已核对。',
  })
  assert.equal(approved.status, 200, JSON.stringify(approved.data))
  assert.equal(approved.data.item.status, 'approved')
  assert.equal(approved.data.item.reviewProgress.complete, true)

  const reportText = await readFile(sealed.reportFile, 'utf8')
  const manifestText = await readFile(sealed.manifestFile, 'utf8')
  const reportDigest = sha256(reportText)
  const manifestDigest = sha256(manifestText)
  assert.equal(manifestDigest, sealed.sealHash)
  assert.equal(approved.data.item.reviewEvidence.digest, reportDigest)

  const receipt = await invoke('GET', `/review-outbox/api/receipt?id=${encodeURIComponent(reportItem.id)}`)
  assert.equal(receipt.status, 200)
  assert.match(receipt.data, /研究报告验收/)
  assert.match(receipt.data, /当前文件与审阅时摘要一致/)
  assert.match(receipt.data, /真实 research_report 结果已自动入库/)
  assert.doesNotMatch(receipt.data, /<script\b/i)
  assert.match(receipt.data, /https:\/\/zjukop3\.github\.io\/dsh-review-outbox\/\?utm_source=review-receipt&amp;utm_medium=artifact&amp;utm_campaign=review-outbox/)
  assert.ok(!receipt.data.includes(base.root))

  preservedArtifact = path.join(tmpdir(), `research-report-interop-artifact-${Date.now()}`)
  await cp(sealed.reportDir, preservedArtifact, { recursive: true })
  const preservedReceipt = `${preservedArtifact}.review.html`
  await writeFile(preservedReceipt, receipt.data, 'utf8')

  const evidence = {
    ok: true,
    researchReport: {
      repository: 'https://github.com/PerryLink/dsh-research-report',
      commit: '06ade6c9741dd7f4049aeb4cf4fdae7631aa2859',
      version: researchPackage.version,
    },
    runtime: {
      node: process.version,
      composition: 'real Cordis Context + real SessionStore + real ToolRuntime + real research_report pipeline with Session logging',
      webBoundary: 'Review Outbox Host route captured at the webServer registration boundary; no browser or public server claimed',
    },
    session: {
      id: base.session.id,
      toolCallEvents: events.filter(event => event.type === 'tool/call').length,
      toolResultEvents: events.filter(event => event.type === 'tool/result').length,
      presentedEvents: 0,
      sealedResultSeq: resultEvent.seq,
    },
    sealed: {
      kind: sealed.kind,
      sealHash: sealed.sealHash,
      counts: sealed.counts,
      evidenceCount: sealed.evidenceCount,
      reportSha256: reportDigest,
      manifestSha256: manifestDigest,
      manifestMatchesSeal: true,
    },
    outbox: {
      discovered: listed.data.items.length,
      sourceTypes: listed.data.items.map(item => item.sourceType),
      reportId: reportItem.id,
      manifestId: manifestItem.id,
      resultEventSeqMatched: true,
      previewKind: preview.data.preview.kind,
      defaultResearchPackAttached: reportItem.reviewPack.id === 'research-report',
      manifestPackDetached: manifestItem.reviewPack === undefined,
      manualPackSelectionRequired: false,
      prematureApprovalRejected: true,
      requiredChecksWithEvidence: Object.keys(reviewNotes),
      approved: true,
      reviewDigestMatchesArtifact: true,
      receiptScriptFree: true,
      receiptOmitsTemporaryPaths: true,
    },
  }
  await mkdir(path.dirname(evidencePath), { recursive: true })
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ok: true, evidencePath, preservedArtifact, preservedReceipt, sealHash: sealed.sealHash }, null, 2))
} finally {
  if (reviewFiber) await reviewFiber.dispose()
  if (researchFiber) await researchFiber.dispose()
  for (const dispose of boundaryDisposers.reverse()) await dispose()
  if (base) await unmountBase(base)
}
