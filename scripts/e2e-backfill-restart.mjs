import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.env.DSH_E2E_URL
if (!url) throw new Error('DSH_E2E_URL is required')
const id = 'presented:preinstall-official-session:preinstall-present-call:0'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForFunction(async expectedId => {
    const response = await fetch('/review-outbox/api/items')
    if (!response.ok) return false
    const state = await response.json()
    window.__reviewRestartState = state
    return ['ready', 'degraded'].includes(state.backfill?.status)
      && state.items.some(item => item.id === expectedId)
  }, id, { timeout: 60_000 })
  const state = await page.evaluate(() => window.__reviewRestartState)
  const item = state.items.find(candidate => candidate.id === id)
  if (state.backfill.status !== 'ready') throw new Error(JSON.stringify(state.backfill))
  if (state.backfill.changed !== 0) throw new Error(`Restart backfill changed ${state.backfill.changed} items`)
  if (state.pending !== 0 || item?.status !== 'approved') throw new Error(`Review state did not survive: ${JSON.stringify(item)}`)
  if (item.history.length !== 2 || item.history.at(-1)?.action !== 'approve') throw new Error(`Unexpected history: ${JSON.stringify(item.history)}`)
  const preview = await page.evaluate(async expectedId => {
    const response = await fetch(`/review-outbox/api/preview?id=${encodeURIComponent(expectedId)}`)
    const body = await response.json()
    if (!response.ok) throw new Error(JSON.stringify(body))
    return body.preview
  }, id)
  if (preview.kind !== 'text' || !preview.content.includes('Historical official delivery')) {
    throw new Error(`Preview failed after restart: ${JSON.stringify(preview)}`)
  }
  const report = {
    ok: true,
    itemId: id,
    status: item.status,
    pending: state.pending,
    historyLength: item.history.length,
    backfill: state.backfill,
    previewKind: preview.kind,
  }
  await mkdir('docs/e2e', { recursive: true })
  await writeFile('docs/e2e/backfill-restart-result.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
