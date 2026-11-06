import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import { resolveItemFile } from './preview.js'

const EVIDENCE_LIMIT = 64 * 1024 * 1024

/** Capture a bounded content digest without retaining the artifact contents. */
export async function captureArtifactEvidence(item, {
  allowOutsideWorkspace = false,
  now = () => new Date(),
} = {}) {
  const capturedAt = now().toISOString()
  let handle
  try {
    const resolved = await resolveItemFile(item, { allowOutsideWorkspace })
    handle = await open(resolved.path, 'r')
    const info = await handle.stat()
    if (!info.isFile()) return { status: 'unavailable', reason: 'Only regular files can be hashed', capturedAt }
    if (info.size > EVIDENCE_LIMIT) {
      return { status: 'unavailable', reason: 'File exceeds the 64 MiB evidence limit', bytes: info.size, capturedAt }
    }
    const hash = createHash('sha256')
    const stream = handle.createReadStream({ autoClose: false })
    for await (const chunk of stream) hash.update(chunk)
    return {
      status: 'available',
      algorithm: 'sha256',
      digest: hash.digest('hex'),
      bytes: info.size,
      capturedAt,
    }
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : String(error),
      capturedAt,
    }
  } finally {
    if (handle) await handle.close()
  }
}
