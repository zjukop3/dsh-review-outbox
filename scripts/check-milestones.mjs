// One command that answers "where does the release actually stand" — the
// questions that otherwise get re-derived by hand every few hours:
//
//   1. what version does npm serve, and what does the daily catalog list
//   2. what does a default install resolve today (the release-age window)
//   3. what does the funnel read on this machine
//   4. are the upstream pull requests and issues still unanswered
//
// Usage: node scripts/check-milestones.mjs [--json]
// Requires network. Every number is printed with the command that produced it,
// so a surprising result can be re-run by hand.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const run = promisify(execFile)
const asJson = process.argv.includes('--json')
const withInstall = process.argv.includes('--with-install')
const note = message => { if (!asJson) process.stderr.write(`${message}\n`) }
const repoRoot = resolve(import.meta.dirname, '..')
const npmjs = 'https://registry.npmjs.org'

async function npmJson(args) {
  const { stdout } = await run('npm', [...args, '--json', `--registry=${npmjs}`], { cwd: repoRoot })
  return JSON.parse(stdout)
}

async function catalogEntry() {
  const { writeFile, readFile } = await import('node:fs/promises')
  const version = JSON.parse(await run('npm', ['view', 'dsh-plugin-catalog', 'version', '--json', `--registry=${npmjs}`], { cwd: repoRoot }).then(r => r.stdout))
  const tarball = JSON.parse(await run('npm', ['view', `dsh-plugin-catalog@${version}`, 'dist.tarball', '--json', `--registry=${npmjs}`], { cwd: repoRoot }).then(r => r.stdout))
  const response = await fetch(tarball, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`catalog tarball: HTTP ${response.status}`)
  const dir = await mkdtemp(join(tmpdir(), 'catalog-check-'))
  try {
    // execFile cannot stream stdin; write the archive and extract from disk.
    const archive = join(dir, 'catalog.tgz')
    await writeFile(archive, Buffer.from(await response.arrayBuffer()))
    await run('tar', ['-xzf', archive, '-C', dir], { cwd: dir, timeout: 60_000 })
    const index = JSON.parse(await readFile(join(dir, 'package/index.json'), 'utf8'))
    const entry = (index.plugins || []).find(plugin => plugin.name === 'dsh-review-outbox')
    return {
      catalogVersion: version,
      entries: (index.plugins || []).length,
      listed: Boolean(entry),
      listedVersion: entry?.versions?.at(-1)?.version ?? null,
      listedDescriptionStart: entry?.description?.zh?.slice(0, 40) ?? null,
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function installResolution() {
  const home = await mkdtemp(join(tmpdir(), 'milestone-home-'))
  const dsh = '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
  try {
    await run(dsh, ['plugin', '--profile', 'web', 'add', 'dsh-review-outbox'], {
      env: { ...process.env, DSH_HOME: home }, timeout: 300_000, cwd: repoRoot,
    })
    const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(join(home, 'profiles/web/node_modules/dsh-review-outbox/package.json'), 'utf8'))
    return { bareNameResolved: manifest.version }
  } catch (error) {
    return { bareNameResolved: null, error: String(error.stderr || error.message).split('\n').slice(-2).join(' ') }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

async function funnel() {
  try {
    const { stdout } = await run(process.execPath, [join(repoRoot, 'scripts/report-usage.mjs'), '--json'], { cwd: repoRoot })
    const report = JSON.parse(stdout)
    return { artifacts: report.artifacts.total, pending: report.pending.count, decisions: report.humanDecisions.total, oldestPendingHours: report.pending.oldestAgeHours }
  } catch (error) {
    return { error: String(error.message).slice(0, 120) }
  }
}

async function upstream() {
  const queries = [
    ['pr', 'awesome-dsh-plugin/awesome-dsh-plugin', 13722],
    ['pr', 'awesome-dsh-plugin/awesome-dsh-plugin', 13729],
    ['issue', 'PerryLink/dsh-research-report', 27],
    ['issue', 'dsh-market/dsh-market', 1093],
  ]
  const results = []
  for (const [kind, repo, number] of queries) {
    try {
      const { stdout } = await run('gh', [kind, 'view', String(number), '--repo', repo, '--json', kind === 'pr' ? 'state,reviewDecision,comments' : 'state,comments'], { cwd: repoRoot })
      const data = JSON.parse(stdout)
      results.push({ repo, number, state: data.state, comments: (data.comments || []).length })
    } catch (error) {
      results.push({ repo, number, error: String(error.message).slice(0, 80) })
    }
  }
  return results
}

note('· npm version')
const npmVersion = JSON.parse(await run('npm', ['view', 'dsh-review-outbox', 'version', '--json', `--registry=${npmjs}`], { cwd: repoRoot }).then(r => r.stdout))
const localVersion = JSON.parse(await (await import('node:fs/promises')).readFile(join(repoRoot, 'package.json'), 'utf8')).version
const latestTag = (await run('npm', ['view', 'dsh-review-outbox', 'dist-tags.latest', `--registry=${npmjs}`], { cwd: repoRoot })).stdout.trim()

note('· catalog entry')
const catalog = await catalogEntry()
note('· funnel')
const funnelReport = await funnel()
note('· upstream')
const upstreamReport = await upstream()

let installReport = { skipped: 're-run with --with-install to resolve a throwaway profile' }
if (withInstall) {
  note('· default install resolution (downloads a package, can take minutes)')
  installReport = await installResolution()
}

const report = {
  checkedAt: new Date().toISOString(),
  versions: { npmLatest: npmVersion, local: localVersion, latestTag },
  catalog,
  install: installReport,
  funnel: funnelReport,
  upstream: upstreamReport,
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const c = report.catalog
  console.log(`npm latest    ${report.versions.npmLatest}   (local ${report.versions.local}, tag ${report.versions.latestTag})`)
  console.log(`catalog       ${c.catalogVersion} → listed ${c.listedVersion ?? 'no'}${c.listedVersion ? '' : ' (absent)'} of ${c.entries} entries`)
  console.log(`catalog desc  ${c.listedDescriptionStart ?? '—'}`)
  console.log(`bare install  ${report.install.bareNameResolved ?? report.install.skipped ?? 'failed'}${report.install.error ? ` (${report.install.error})` : ''}`)
  console.log(`funnel        ${report.funnel.artifacts ?? '?'} artifacts / ${report.funnel.pending ?? '?'} pending / ${report.funnel.decisions ?? '?'} decisions / oldest ${report.funnel.oldestPendingHours ?? '?'} h`)
  for (const item of report.upstream) {
    console.log(`upstream      ${item.repo}#${item.number}  ${item.state ?? item.error}  comments ${item.comments ?? '?'}`)
  }
}
