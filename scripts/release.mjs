// Release procedure as code.
//
// Nine releases were done by hand, and two of them broke in ways that would have
// been caught by a checklist: a changelog entry written through a shell heredoc
// lost its backticked words, and the landing page kept the previous version in
// two places so a guard failed only after the pin moved. This script performs the
// whole sequence in one order, refuses to start from a dirty tree, and can print
// the plan without touching anything.
//
// Usage:
//   node scripts/release.mjs 0.1.10 --dry-run
//   node scripts/release.mjs 0.1.10
//
// It stops before `npm publish` on purpose: publishing is the one step that
// cannot be undone, so it stays a deliberate act with the command printed.

import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: options.quiet ? 'pipe' : 'inherit', ...options })

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const version = args.find(argument => /^\d+\.\d+\.\d+$/.test(argument))
if (!version) {
  console.error('Usage: node scripts/release.mjs <x.y.z> [--dry-run]')
  process.exit(1)
}

const read = path => readFile(resolve(root, path), 'utf8')
const write = (path, text) => writeFile(resolve(root, path), text)
const fail = message => {
  console.error(`release aborted: ${message}`)
  process.exit(1)
}

const packageJson = JSON.parse(await read('package.json'))
const previous = packageJson.version
if (version === previous) fail(`version is already ${version}`)
const [major, minor, patch] = version.split('.').map(Number)
const [oldMajor, oldMinor, oldPatch] = previous.split('.').map(Number)
const ascending = major > oldMajor || (major === oldMajor && (minor > oldMinor || (minor === oldMinor && patch > oldPatch)))
if (!ascending) fail(`${version} is not newer than ${previous}`)

const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
if (status && !dryRun) fail(`working tree is dirty:\n${status}`)

const changelog = await read('CHANGELOG.md')
const unreleased = new RegExp(`^## \\[Unreleased\\][^\\n]*$`, 'm').exec(changelog)
if (!unreleased && !dryRun) fail('CHANGELOG.md has no ## [Unreleased] section to promote')

// Local date, not UTC: a release made at 05:00 in Shanghai should not be dated
// the previous day in its own changelog.
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const steps = []

steps.push(`CHANGELOG.md: ## [Unreleased] → ## [${version}] - ${today}`)
steps.push(`package.json: version ${previous} → ${version}`)

// Version strings that describe the *current* release live in a handful of files.
// Each one is listed explicitly so a new file that needs updating shows up as a
// missing entry rather than silently staying on the old number.
const versionFiles = [
  { path: 'README.md', replacements: [
    [`应用内安装 ${previous}`, `应用内安装 ${version}`],
    [`当前源码与应用内索引为 ${previous}`, `当前源码与应用内索引为 ${version}`],
    [`dsh-review-outbox@${previous}`, `dsh-review-outbox@${version}`],
    [`可对同一个 \`${previous}\` 公开提交`, `可对同一个 \`${version}\` 公开提交`],
  ] },
  { path: 'README.en.md', replacements: [
    [`[Install ${previous} in DSH]`, `[Install ${version} in DSH]`],
    [`Current source and the application index are \`${previous}\``, `Current source and the application index are \`${version}\``],
    [`dsh-review-outbox@${previous}`, `dsh-review-outbox@${version}`],
    [`use the same public ${previous} commit`, `use the same public ${version} commit`],
  ] },
  { path: 'site/research-report/index.md', replacements: [
    [`## 安装 Review Outbox ${previous}`, `## 安装 Review Outbox ${version}`],
    [`确认版本 \`${previous}\``, `确认版本 \`${version}\``],
  ] },
  { path: 'site/research-report/index.html', replacements: [
    [`安装 Review Outbox ${previous}`, `安装 Review Outbox ${version}`],
    [previous, version],
  ] },
]

for (const file of versionFiles) {
  const text = await read(file.path).catch(() => null)
  if (text === null) fail(`expected ${file.path} to exist`)
  const missing = file.replacements.filter(([from]) => !text.includes(from)).map(([from]) => from)
  if (missing.length > 0 && !dryRun) fail(`${file.path} is missing expected text: ${missing.join(' | ')}`)
  steps.push(`${file.path}: ${file.replacements.length} replacement(s)`)
}

const pin = JSON.parse(await read('market-release.json'))
steps.push('commit the runtime change, then market-release.json pin → that commit')
steps.push('rebuild the market index and the site, run npm test')
steps.push('commit the pin and push')
steps.push(`print the publish command (npm publish for ${version}) — not executed here`)

console.log(`\nrelease ${previous} → ${version}${dryRun ? ' (dry run)' : ''}\n`)
for (const step of steps) console.log(`  · ${step}`)
if (dryRun) {
  console.log('\ndry run: nothing written, nothing committed, nothing published\n')
  process.exit(0)
}

// 1. promote the changelog and bump the manifest
await write('CHANGELOG.md', changelog.replace(/^## \[Unreleased\][^\n]*$/m, `## [${version}] - ${today}`))
packageJson.version = version
await write('package.json', `${JSON.stringify(packageJson, null, 2)}\n`)

// 2. move the version strings that describe the current release
for (const file of versionFiles) {
  let text = await read(file.path)
  for (const [from, to] of file.replacements) text = text.split(from).join(to)
  await write(file.path, text)
}

// 3. rebuild and verify before committing anything
run('node', ['scripts/build-market-index.mjs'], { stdio: 'pipe' })
run('node', ['scripts/build-research-site.mjs'], { stdio: 'pipe', env: { ...process.env, PUBLIC_ORIGIN: 'https://zjukop3.github.io/dsh-review-outbox' } })
run('npm', ['test'], { stdio: 'pipe' })
console.log('  ✓ tests, index and site rebuilt')

// 4. runtime commit
const commitMessage = `Release ${version}\n\nPromoted from Unreleased and pinned in the following commit.`
execFileSync('git', ['add', '-A'], { cwd: root })
execFileSync('git', ['commit', '-m', commitMessage], { cwd: root, stdio: 'pipe' })
const runtimeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()

// 5. pin the index to it and rebuild again
const pinData = JSON.parse(await read('market-release.json'))
const previousPin = pinData.commit
pinData.commit = runtimeCommit
pinData.notes = `Version ${version}. Documentation-only commits do not move this pin.`
await write('market-release.json', `${JSON.stringify(pinData, null, 2)}\n`)
for (const path of ['README.md', 'README.en.md', 'site/research-report/index.md', 'site/research-report/index.html']) {
  const text = await read(path)
  if (text.includes(previousPin)) await write(path, text.split(previousPin).join(runtimeCommit))
}
run('node', ['scripts/build-market-index.mjs'], { stdio: 'pipe' })
run('node', ['scripts/build-research-site.mjs'], { stdio: 'pipe', env: { ...process.env, PUBLIC_ORIGIN: 'https://zjukop3.github.io/dsh-review-outbox' } })
run('npm', ['test'], { stdio: 'pipe' })
execFileSync('git', ['add', '-A'], { cwd: root })
execFileSync('git', ['commit', '-m', `Pin the application index to the ${version} runtime commit`], { cwd: root, stdio: 'pipe' })
const pinCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()

console.log(`\n  runtime ${runtimeCommit.slice(0, 7)}  pin ${pinCommit.slice(0, 7)}`)
console.log(`\nnext:\n  git push origin main\n  npm publish --registry=https://registry.npmjs.org\n  curl -X PUT https://registry.npmmirror.com/-/package/dsh-review-outbox/syncs\n`)
