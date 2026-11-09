import { execFileSync } from 'node:child_process'

const packageName = 'dsh-review-outbox'
const catalogPackage = 'dsh-plugin-catalog'

function npmView(spec, field) {
  return execFileSync('npm', ['view', spec, field, '--json', '--registry=https://registry.npmjs.org'], { encoding: 'utf8' }).trim()
}

const catalogVersion = JSON.parse(npmView(catalogPackage, 'version'))
const pluginVersion = JSON.parse(npmView(packageName, 'version'))
const tarball = JSON.parse(npmView(`${catalogPackage}@${catalogVersion}`, 'dist.tarball'))

const response = await fetch(tarball)
if (!response.ok) throw new Error(`catalog tarball fetch failed: ${response.status}`)
const buffer = Buffer.from(await response.arrayBuffer())

const { execSync } = await import('node:child_process')
execSync('rm -rf /tmp/catalog-presence-check && mkdir -p /tmp/catalog-presence-check')
execSync(`tar -xzf - -C /tmp/catalog-presence-check`, { input: buffer, shell: '/bin/zsh' })
const index = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile('/tmp/catalog-presence-check/package/index.json', 'utf8')))

const entry = index.plugins?.find(plugin => plugin.name === packageName)
const result = {
  checkedAt: new Date().toISOString(),
  catalogVersion,
  indexEntries: index.plugins?.length ?? 0,
  pluginVersion,
  listed: Boolean(entry),
  listedVersion: entry?.versions?.at(-1)?.version ?? null,
  indexingStatus: entry ? 'listed' : 'pending-catalog-build',
}
console.log(JSON.stringify(result, null, 2))
if (!entry) process.exitCode = 2
