import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { renderReceipt } from '../src/receipt.js'

const script = resolve(import.meta.dirname, '..', 'scripts', 'verify-receipt.mjs')

async function fixture(body) {
  const dir = await mkdtemp(join(tmpdir(), 'verify-receipt-'))
  const file = join(dir, 'report.md')
  await writeFile(file, body, 'utf8')
  const digest = createHash('sha256').update(body).digest('hex')
  const now = new Date('2026-11-10T00:00:00Z')
  const html = renderReceipt({
    path: file,
    status: 'approved',
    revision: 1,
    firstSeenAt: now.toISOString(),
    updatedAt: now.toISOString(),
    reviewEvidence: { status: 'available', algorithm: 'sha256', digest },
    history: [],
  }, { currentEvidence: { status: 'available', algorithm: 'sha256', digest }, now: () => now })
  const receipt = join(dir, 'receipt.html')
  await writeFile(receipt, html, 'utf8')
  return { dir, file, receipt, digest }
}

test('a matching file passes, and the digest is printable', async () => {
  const { dir, file, receipt, digest } = await fixture('# Report\n\nReviewed.\n')
  try {
    const ok = spawnSync(process.execPath, [script, receipt, file], { encoding: 'utf8' })
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(ok.stdout, /match/)

    const printed = spawnSync(process.execPath, [script, receipt, '--print'], { encoding: 'utf8' })
    assert.equal(printed.status, 0)
    assert.equal(printed.stdout.trim(), digest)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a changed file fails with both digests, and says what to do', async () => {
  const { dir, file, receipt } = await fixture('# Report\n\nReviewed.\n')
  try {
    await writeFile(file, '# Report\n\nEdited after review.\n', 'utf8')
    const bad = spawnSync(process.execPath, [script, receipt, file], { encoding: 'utf8' })
    assert.equal(bad.status, 1, 'a mismatch must be a non-zero exit so CI can gate on it')
    assert.match(bad.stderr, /mismatch/)
    assert.match(bad.stderr, /Re-review the current bytes/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a receipt exported before any decision has nothing to verify', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'verify-receipt-pending-'))
  try {
    const file = join(dir, 'report.md')
    await writeFile(file, '# Report\n', 'utf8')
    const now = new Date('2026-11-10T00:00:00Z')
    const html = renderReceipt({
      path: file, status: 'pending', revision: 1,
      firstSeenAt: now.toISOString(), updatedAt: now.toISOString(), history: [],
    }, { currentEvidence: { status: 'unavailable' }, now: () => now })
    const receipt = join(dir, 'receipt.html')
    await writeFile(receipt, html, 'utf8')
    const result = spawnSync(process.execPath, [script, receipt, file], { encoding: 'utf8' })
    assert.equal(result.status, 2)
    assert.match(result.stderr, /no reviewed digest/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
