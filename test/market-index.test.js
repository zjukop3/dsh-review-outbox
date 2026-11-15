import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { marketInstallTarget, parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

const root = resolve(import.meta.dirname, '..')
const indexUrl = 'https://zjukop3.github.io/dsh-review-outbox/plugins.json'

test('application market index passes the official validator and reproducibly pins installation', async () => {
  const path = resolve(root, 'site/plugins.json')
  const source = JSON.parse(await readFile(path, 'utf8'))
  const release = JSON.parse(await readFile(resolve(root, 'market-release.json'), 'utf8'))
  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  const parsed = parseMarketIndex(source, indexUrl)
  assert.equal(parsed.format, 1)
  // review-outbox plus the eight check packages from the two kit repos
  assert.equal(parsed.plugins.length, 9)
  const plugin = parsed.plugins.find(entry => entry.name === 'dsh-review-outbox')
  assert.ok(plugin, 'the review-outbox entry stays first-class')
  assert.equal(plugin.metadata.category, 'workflow')
  const kitNames = ['dsh-hashcheck', 'dsh-citelint', 'dsh-outline-lint', 'dsh-tablelint', 'dsh-numberlint', 'dsh-agreement-check', 'dsh-invoice-check', 'dsh-listing-check']
  for (const name of kitNames) {
    const kit = parsed.plugins.find(entry => entry.name === name)
    assert.ok(kit, `${name} is in the index`)
    assert.equal(kit.versions[0].source.type, 'git')
    assert.match(kit.versions[0].source.commit, /^[a-f0-9]{40}$/)
    assert.deepEqual(kit.versions[0].engines, { dsh: '>=0.2.2-rc.1 <0.3.0-0' })
  }
  assert.match(plugin.icon, /^data:image\/svg\+xml;base64,/)
  assert.equal(plugin.versions.length, 1)
  const version = plugin.versions[0]
  assert.equal(version.version, packageJson.version)
  assert.match(version.source.commit, /^[a-f0-9]{40}$/)
  assert.equal(version.source.commit, release.commit)
  assert.equal(version.source.type, 'git')
  assert.deepEqual(version.engines, { dsh: '>=0.2.2-rc.1 <0.3.0-0' })
  assert.deepEqual(marketInstallTarget(plugin.name, version), {
    spec: `git+https://github.com/zjukop3/dsh-review-outbox.git#${version.source.commit}`,
  })

  const before = await readFile(path, 'utf8')
  const built = spawnSync(process.execPath, [resolve(root, 'scripts/build-market-index.mjs')], {
    cwd: root,
    env: { ...process.env, DSH_MARKET_COMMIT: version.source.commit, GITHUB_SHA: '' },
    encoding: 'utf8',
  })
  assert.equal(built.status, 0, built.stderr)
  assert.equal(await readFile(path, 'utf8'), before)
})
