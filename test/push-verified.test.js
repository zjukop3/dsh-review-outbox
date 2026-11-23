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
const run = (cwd, ...rest) => {
  // 最后一个参数可以是环境变量覆盖（例如把退避压到 0 秒），其余是脚本参数。
  const maybeEnv = rest.at(-1)
  const env = maybeEnv && typeof maybeEnv === 'object' ? rest.pop() : {}
  const args = rest
  try {
    return { code: 0, out: execFileSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } }) }
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })

async function scratch(t) {
  const dir = await mkdtemp(join(tmpdir(), 'push-verified-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  git(dir, 'init', '-q', '--bare', 'remote.git')
  // 裸仓库的 HEAD 默认指向 refs/heads/master（或随 init.defaultBranch 变化），而这里推的是
  // main。不显式指定它，clone 出来的副本会落在一个 unborn 分支上，git 版本不同行为也不同：
  // 本地绿、CI 红。2026-11-23 在 runner 上就是这条红。
  git(dir, '--git-dir=remote.git', 'symbolic-ref', 'HEAD', 'refs/heads/main')
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

// 推不上去时必须说 NOT confirmed 并以 1 退出。
//
// 这个脚本存在的理由就是「三次循环报告成功、实际什么都没推上去」。已有的用例覆盖了
// 「远端动过、非快进」这一种失败；这里补另一种：远端根本连不上（网络掉线时就是这样）。
// 退避秒数用环境变量压到 0，否则真跑六次退避要 75 秒。
test('an unreachable remote is NOT confirmed either, and the exit code says so', async t => {
  const { work } = await scratch(t)
  git(work, 'remote', 'set-url', 'origin', 'file:///nonexistent-repo.git')
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'local ahead')
  const result = run(work, '.', { PUSH_VERIFIED_SLEEP: '0' })
  assert.equal(result.code, 1, result.out)
  assert.match(result.out, /NOT confirmed/)
  assert.ok(!/confirmed main at /.test(result.out), `不该出现确认行：\n${result.out}`)
})
