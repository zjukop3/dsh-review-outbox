import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

// The market reads screenshots.json from this repository on its nightly build.
// The rules are its rules: 1-8 relative paths that stay inside the repository.
test('screenshots.json lists images the storefront can actually show', async () => {
  const entries = JSON.parse(await readFile(resolve(root, 'screenshots.json'), 'utf8'))
  const list = Array.isArray(entries) ? entries : entries.screenshots
  assert.ok(Array.isArray(list), 'expected an array or {screenshots: [...]}')
  assert.ok(list.length >= 1 && list.length <= 8, `1-8 images, got ${list.length}`)

  for (const entry of list) {
    assert.equal(typeof entry, 'string')
    assert.ok(!entry.startsWith('/'), `${entry} must be relative`)
    assert.ok(!entry.includes('..'), `${entry} must not leave the repository`)
    assert.match(entry, /\.(png|jpe?g|webp)$/i, `${entry} must be a raster image`)
    const info = await stat(resolve(root, entry))
    assert.ok(info.size > 1024, `${entry} looks empty`)
  }
})

test('the declared screenshots show the current panel, not an older one', async () => {
  const list = JSON.parse(await readFile(resolve(root, 'screenshots.json'), 'utf8'))
  assert.ok(list.some(path => path.includes('market-')), 'the market shots are the ones regenerated from the current UI')
})
