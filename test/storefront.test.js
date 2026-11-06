import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('storefront manifest exposes only bounded local PNG screenshots that exist', async () => {
  const manifest = JSON.parse(await readFile(resolve(root, 'screenshots.json'), 'utf8'))
  assert.ok(Array.isArray(manifest))
  assert.ok(manifest.length >= 1 && manifest.length <= 8)
  assert.equal(new Set(manifest).size, manifest.length)
  for (const path of manifest) {
    assert.match(path, /^assets\/storefront\/[a-z0-9-]+\.png$/)
    assert.ok(!path.startsWith('/') && !path.includes('..') && !path.startsWith('https:'))
    const image = await readFile(resolve(root, path))
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.ok(image.readUInt32BE(16) >= 1000, `${path} width`)
    assert.ok(image.readUInt32BE(20) >= 600, `${path} height`)
    assert.ok(image.length > 10_000, `${path} should contain a real capture`)
  }
})
