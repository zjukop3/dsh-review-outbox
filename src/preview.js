import { open, realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.json', '.jsonl', '.yaml', '.yml', '.js', '.jsx', '.ts', '.tsx', '.py', '.css', '.html', '.csv', '.xml', '.svg', '.sh', '.sql', '.toml'])
const IMAGE_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
])
const TEXT_LIMIT = 512 * 1024
const IMAGE_LIMIT = 2 * 1024 * 1024

function inside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

async function readPrefix(path, limit) {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(limit + 1)
    const { bytesRead } = await handle.read(buffer, 0, limit + 1, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

export async function resolveItemFile(item, { allowOutsideWorkspace = false } = {}) {
  if (!item || typeof item.path !== 'string') throw new Error('Item not found')
  const base = item.cwd ? resolve(item.cwd) : null
  const candidate = base ? resolve(base, item.path) : resolve(item.path)
  const actual = await realpath(candidate)
  if (!allowOutsideWorkspace) {
    if (!base) throw new Error('Preview outside the recorded workspace is disabled')
    const canonicalBase = await realpath(base).catch(() => base)
    if (!inside(canonicalBase, actual)) throw new Error('Preview outside the recorded workspace is disabled')
  }
  const info = await stat(actual)
  if (!info.isFile()) throw new Error('Only regular files can be previewed')
  return { path: actual, info }
}

export async function previewItem(item, options = {}) {
  const { path: actual, info } = await resolveItemFile(item, options)
  const extension = extname(actual).toLowerCase()
  if (TEXT_EXTENSIONS.has(extension)) {
    const buffer = await readPrefix(actual, TEXT_LIMIT)
    const truncated = info.size > TEXT_LIMIT
    return {
      kind: 'text',
      path: actual,
      bytes: info.size,
      truncated,
      language: extension.slice(1),
      content: buffer.subarray(0, Math.min(buffer.length, TEXT_LIMIT)).toString('utf8'),
    }
  }
  const mime = IMAGE_TYPES.get(extension)
  if (mime) {
    if (info.size > IMAGE_LIMIT) throw new Error('Image exceeds the 2 MiB preview limit')
    const buffer = await readFileBuffer(actual)
    return { kind: 'image', path: actual, bytes: info.size, mime, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` }
  }
  return { kind: 'unsupported', path: actual, bytes: info.size, extension }
}

async function readFileBuffer(path) {
  const handle = await open(path, 'r')
  try {
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}
