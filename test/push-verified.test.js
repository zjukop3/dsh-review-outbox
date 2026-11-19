// The script that confirms a push needs its own test, because the failure it
// guards against is silent: three times in this project a push loop reported
// success when nothing had been pushed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = resolve(import.meta.dirname, '..', 'scripts', 'push-verified.mjs')
const run = (cwd, ...args) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' }) }
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })

async function scratch(t) {
  const dir = await mkdtemp(join(tmpdir(), 'push-verified-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  git(dir, 'init', '-q', '--bare', 'remote.git')
  git(dir, 'clone', '-q', 'remote.git', 'work')
  const work = join(dir, 'work')
  git(work, 'checkout', '-q', '-b', 'main')
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init')
  git(work, 'push', '-q', 'origin', 'HEAD:main')
  return { dir, work }
}

test('a repo already at the remote commit is confirmed without a push', async t => {
  const { work } = await scratch(t)
  const result = run(work, '.')
  assert.equal(result.code, 0, result.out)
  assert.match(result.out, /already up to date/)
})

test('a new local commit is pushed and then confirmed by reading the remote', async t => {
  const { work } = await scratch(t)
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'second')
  const result = run(work, '.')
  assert.equal(result.code, 0, result.out)
  assert.match(result.out, /confirmed main at /)
  const local = git(work, 'rev-parse', 'HEAD').trim()
  const remote = git(work, 'ls-remote', 'origin', 'refs/heads/main').trim().split(/\s+/)[0]
  assert.equal(remote, local)
})

test('a diverged remote is NOT confirmed, and the exit code says so', async t => {
  // The exact case the three old loops got wrong: local cannot fast-forward, so
  // nothing lands, and only a comparison of the two commits reveals it.
  const { work } = await scratch(t)
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'local ahead')
  const other = join(work, '..', 'other')
  git(work, 'clone', '-q', join(work, '..', 'remote.git'), other)
  git(other, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'remote ahead')
  git(other, 'push', '-q', 'origin', 'HEAD:main')

  const result = run(work, '.')
  assert.equal(result.code, 1, result.out)
  assert.match(result.out, /NOT confirmed/)
  assert.match(result.out, /remote is [0-9a-f]{7}, local is [0-9a-f]{7}/)
})

test('uncommitted changes are called out rather than silently left behind', async t => {
  const { work } = await scratch(t)
  execFileSync('sh', ['-c', 'printf x > note.txt'], { cwd: work })
  const result = run(work, '.')
  assert.match(result.out, /uncommitted changes present/)
})
