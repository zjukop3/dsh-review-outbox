import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.env.DSH_E2E_URL
if (!url) throw new Error('DSH_E2E_URL is required')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForFunction(async () => {
    const response = await fetch('/review-outbox/api/items')
    if (!response.ok) return false
    const state = await response.json()
    window.__dogfoodRestart = state
    return state.backfill?.status === 'ready' && state.items.length === 20
  }, undefined, { timeout: 60_000 })
  const state = await page.evaluate(() => window.__dogfoodRestart)
  if (state.backfill.changed !== 0 || state.pending !== 0) throw new Error('Restart backfill changed completed reviews')
  if (state.items.some(item => item.status !== 'approved')) throw new Error('Not all reviews survived restart')
  const previews = await page.evaluate(async items => {
    const results = []
    for (const item of items) {
      const response = await fetch(`/review-outbox/api/preview?id=${encodeURIComponent(item.id)}`)
      const body = await response.json()
      if (!response.ok || body.preview.kind !== 'text') throw new Error(`${item.path}: ${JSON.stringify(body)}`)
      results.push({ path: item.path, bytes: body.preview.bytes })
    }
    return results
  }, state.items)
  const report = {
    ok: true,
    uniqueArtifacts: state.items.length,
    approved: state.items.filter(item => item.status === 'approved').length,
    revision1: state.items.filter(item => item.revision === 1).length,
    revision2: state.items.filter(item => item.revision === 2).length,
    revision3: state.items.filter(item => item.revision === 3).length,
    pending: state.pending,
    changedAfterRestart: state.backfill.changed,
    previews: previews.length,
  }
  await mkdir('docs/dogfood', { recursive: true })
  await writeFile('docs/dogfood/restart.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
