import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureArtifactEvidence } from '../src/evidence.js'

async function temporaryDirectory(t, label) {
  const directory = await mkdtemp(join(tmpdir(), label))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function fixture(t) {
  const cwd = await temporaryDirectory(t, 'review-outbox-evidence-')
  await writeFile(join(cwd, 'artifact.txt'), 'abc', 'utf8')
  return { cwd, item: { cwd, path: 'artifact.txt' } }
}

test('artifact evidence captures SHA-256 and size without retaining contents', async t => {
  const { item } = await fixture(t)
  const evidence = await captureArtifactEvidence(item, { now: () => new Date('2026-01-01T00:00:00Z') })
  assert.deepEqual(evidence, {
    status: 'available',
    algorithm: 'sha256',
    digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    bytes: 3,
    capturedAt: '2026-01-01T00:00:00.000Z',
  })
  assert.equal(JSON.stringify(evidence).includes('abc'), false)
})

test('evidence honors workspace containment and can explicitly allow an external artifact', async t => {
  const { cwd } = await fixture(t)
  const outside = await temporaryDirectory(t, 'review-outbox-evidence-outside-')
  await writeFile(join(outside, 'outside.txt'), 'abc', 'utf8')
  const item = { cwd, path: join(outside, 'outside.txt') }
  const denied = await captureArtifactEvidence(item)
  assert.equal(denied.status, 'unavailable')
  assert.match(denied.reason, /outside the recorded workspace/)
  const allowed = await captureArtifactEvidence(item, { allowOutsideWorkspace: true })
  assert.equal(allowed.status, 'available')
  assert.equal(allowed.bytes, 3)
})

test('evidence rejects symlink escapes and avoids reading files above 64 MiB', async t => {
  const { cwd } = await fixture(t)
  const outside = await temporaryDirectory(t, 'review-outbox-evidence-link-')
  await writeFile(join(outside, 'secret.txt'), 'abc', 'utf8')
  await symlink(join(outside, 'secret.txt'), join(cwd, 'link.txt'))
  const linked = await captureArtifactEvidence({ cwd, path: 'link.txt' })
  assert.equal(linked.status, 'unavailable')

  await writeFile(join(cwd, 'large.bin'), '', 'utf8')
  await truncate(join(cwd, 'large.bin'), 64 * 1024 * 1024 + 1)
  const large = await captureArtifactEvidence({ cwd, path: 'large.bin' })
  assert.equal(large.status, 'unavailable')
  assert.equal(large.bytes, 64 * 1024 * 1024 + 1)
  assert.match(large.reason, /64 MiB/)
})
