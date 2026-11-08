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
  const parsed = parseMarketIndex(source, indexUrl)
  assert.equal(parsed.format, 1)
  assert.equal(parsed.plugins.length, 1)
  const plugin = parsed.plugins[0]
  assert.equal(plugin.name, 'dsh-review-outbox')
  assert.equal(plugin.metadata.category, 'workflow')
  assert.match(plugin.icon, /^data:image\/svg\+xml;base64,/)
  assert.equal(plugin.versions.length, 1)
  const version = plugin.versions[0]
  assert.equal(version.version, '0.1.0')
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
