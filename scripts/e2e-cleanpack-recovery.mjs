import { chromium } from 'playwright-core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const url = process.env.DSH_E2E_URL
const phase = process.env.RECOVERY_PHASE
const statePath = process.env.DSH_STATE_PATH
if (!url || !phase || !statePath) throw new Error('DSH_E2E_URL, RECOVERY_PHASE, and DSH_STATE_PATH are required')
const id = 'presented:preinstall-official-session:preinstall-present-call:0'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
async function request(path, options) {
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(`/review-outbox/api/${path}`, options)
    const body = response.headers.get('content-type')?.includes('text/html') ? await response.text() : await response.json()
    return { status: response.status, body }
  }, { path, options })
}
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForFunction(async () => {
    const response = await fetch('/review-outbox/api/health')
    if (!response.ok) return false
    const state = await response.json()
    window.__cleanpackHealth = state
    return ['ready', 'failed'].includes(state.backfill?.status)
  }, undefined, { timeout: 60_000 })
  const health = await page.evaluate(() => window.__cleanpackHealth)
  const report = { phase }
  if (phase === 'corrupt') {
    if (!health.stateError?.includes('read-only')) throw new Error(`Missing read-only state error: ${JSON.stringify(health)}`)
    if (health.backfill.status !== 'failed') throw new Error(`Backfill did not fail loudly: ${JSON.stringify(health.backfill)}`)
    const action = await request('action', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, action: 'approve' }),
    })
    if (action.status !== 400 || !action.body.error?.includes('read-only')) throw new Error(`Mutation was not read-only: ${JSON.stringify(action)}`)
    const persisted = await readFile(statePath, 'utf8')
    if (persisted !== '{broken json') throw new Error(`Corrupt state was overwritten: ${persisted}`)
    Object.assign(report, { ok: true, stateError: health.stateError, backfillStatus: health.backfill.status, mutationStatus: action.status, corruptBytesPreserved: true })
  } else {
    const item = health.items.find(candidate => candidate.id === id)
    if (health.backfill.status !== 'ready' || health.backfill.changed !== 0) throw new Error(`Unexpected backfill: ${JSON.stringify(health.backfill)}`)
    if (health.pending !== 0 || item?.status !== 'approved' || item?.history?.length !== 2) throw new Error(`Review did not survive: ${JSON.stringify(item)}`)
    const preview = await request(`preview?id=${encodeURIComponent(id)}`)
    if (preview.status !== 200 || preview.body.preview.kind !== 'text' || !preview.body.preview.content.includes('Changed after review')) {
      throw new Error(`Unexpected preview: ${JSON.stringify(preview)}`)
    }
    const receipt = await request(`receipt?id=${encodeURIComponent(id)}`)
    if (!receipt.body.includes('文件在审阅后发生变化')) throw new Error('Changed-artifact evidence was not preserved')
    Object.assign(report, { ok: true, status: item.status, historyLength: item.history.length, backfill: health.backfill, previewKind: preview.body.preview.kind, changeDetected: true })
  }
  await mkdir('docs/e2e', { recursive: true })
  await writeFile(`docs/e2e/cleanpack-recovery-${phase}.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
