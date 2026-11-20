// The market index is what a user adds as a source. It listed nine plugins for
// months while twenty-eight were published, because the list was hand-written and
// the count was a literal `9` asserted against another literal. Both are gone.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

async function publishedPackages() {
  const out = []
  for (const kit of ['dsh-vertical-kit', 'dsh-verify-kit']) {
    const packagesDir = resolve(root, '..', kit, 'packages')
    for (const name of await readdir(packagesDir)) {
      if (!name.startsWith('dsh-')) continue
      const manifest = JSON.parse(await readFile(resolve(packagesDir, name, 'package.json'), 'utf8'))
      out.push({ name: manifest.name, version: manifest.version })
    }
  }
  const own = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  out.push({ name: own.name, version: own.version })
  return out
}

test('the market index lists every package this project publishes', async () => {
  const expected = await publishedPackages()
  assert.ok(expected.length >= 28, `expected 28 published packages, found ${expected.length}`)
  const index = JSON.parse(await readFile(resolve(root, 'site/plugins.json'), 'utf8'))
  const listed = new Map(index.plugins.map(plugin => [plugin.name, plugin.versions[0].version]))
  const missing = expected.filter(entry => !listed.has(entry.name))
  assert.deepEqual(missing.map(entry => entry.name), [], 'a published package that cannot be installed from the index')
  assert.equal(listed.size, expected.length, 'the index must not carry entries for packages that do not exist')
})

test('every indexed version matches the published package version', async () => {
  const expected = await publishedPackages()
  const index = JSON.parse(await readFile(resolve(root, 'site/plugins.json'), 'utf8'))
  const listed = new Map(index.plugins.map(plugin => [plugin.name, plugin.versions[0].version]))
  const drifted = expected.filter(entry => listed.get(entry.name) !== entry.version)
  assert.deepEqual(drifted.map(entry => `${entry.name}: index ${listed.get(entry.name)}, package ${entry.version}`), [])
})

test('the index carries no hard-coded plugin count', async () => {
  const source = await readFile(resolve(root, 'scripts', 'build-market-index.mjs'), 'utf8')
  assert.doesNotMatch(source, /plugins\.length\s*!==\s*\d+/, 'the expected count must be derived from the entry list')
})
