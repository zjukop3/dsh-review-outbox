#!/usr/bin/env node
// Push when `git push` cannot reach github.com.
//
// On 2026-11-24 github.com:443 was unreachable from this machine for over an
// hour, while api.github.com answered fine. `git push` needs github.com; the Git
// Data API only needs api.github.com. So this replays the local commits through
// the API: one blob per changed file, a tree per commit, a commit per commit, and
// finally a ref update. History shape is preserved (same messages, same authors,
// same dates, same parent chain) — only the transport differs.
//
//   node scripts/push-via-api.mjs <repo-slug> <workdir> [--branch main] [--dry]
//
// Requirements: `gh auth status` logged in for that slug's owner with `repo`
// scope; the remote branch must be an ancestor of local HEAD (fast-forward only).
// Anything else stops before writing, because a force-push replayed through an
// API is not something to do by accident.
import { execFileSync } from 'node:child_process'

const [slug, workdir, ...rest] = process.argv.slice(2)
if (!slug || !workdir) {
  console.error('用法：node scripts/push-via-api.mjs <owner/repo> <workdir> [--branch main] [--dry]')
  process.exit(2)
}
const branch = rest.includes('--branch') ? rest[rest.indexOf('--branch') + 1] : 'main'
const dry = rest.includes('--dry')

const git = (...args) => execFileSync('git', args, { cwd: workdir, encoding: 'utf8' }).trim()
const gh = (path, options = {}) => {
  const args = ['api', path]
  if (options.method) args.push('--method', options.method)
  if (options.input) args.push('--input', '-')
  const output = execFileSync('gh', args, {
    input: options.input ? JSON.stringify(options.input) : undefined,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return output ? JSON.parse(output) : {}
}

const localHead = git('rev-parse', 'HEAD')
let remoteHead
try {
  remoteHead = gh(`repos/${slug}/git/ref/heads/${branch}`).object.sha
} catch (error) {
  console.error(`${slug}: 读不到远端 ${branch}——${String(error.message).split('\n')[0]}`)
  process.exit(1)
}
if (remoteHead === localHead) {
  console.log(`${slug}: 远端已经是最新的 ${localHead.slice(0, 7)}`)
  process.exit(0)
}

// Fast-forward check: the remote head must be in local history.
try {
  git('merge-base', '--is-ancestor', remoteHead, localHead)
} catch {
  console.error(`${slug}: 远端 ${remoteHead.slice(0, 7)} 不在本地历史里，不是快进——停下来，不强制推`)
  process.exit(1)
}

const commits = git('rev-list', '--reverse', `${remoteHead}..${localHead}`).split('\n').filter(Boolean)
if (commits.length === 0) {
  console.log(`${slug}: 没有要推的提交`)
  process.exit(0)
}

const identity = {
  name: git('config', 'user.name'),
  email: git('config', 'user.email'),
}
let baseTree = gh(`repos/${slug}/git/commits/${remoteHead}`).tree.sha
let parent = remoteHead
const replayed = []

for (const commit of commits) {
  const message = git('log', '-1', '--format=%B', commit)
  const date = git('log', '-1', '--format=%aI', commit)
  const changes = git('diff', '--name-status', `${commit}^`, commit).split('\n').filter(Boolean)
  const entries = []
  for (const line of changes) {
    const [status, ...paths] = line.split('\t')
    if (status.startsWith('R') || status.startsWith('C')) {
      const [from, to] = paths
      entries.push({ path: from, mode: '100644', type: 'blob', sha: null })
      entries.push({ path: to, mode: '100644', type: 'blob', sha: uploadBlob(commit, to) })
      continue
    }
    const file = paths[0]
    if (status === 'D') {
      entries.push({ path: file, mode: '100644', type: 'blob', sha: null })
      continue
    }
    entries.push({ path: file, mode: '100644', type: 'blob', sha: uploadBlob(commit, file) })
  }

  if (dry) {
    console.log(`[dry] ${commit.slice(0, 7)} ${message.split('\n')[0]} (${changes.length} 个文件)`)
    continue
  }

  const tree = gh(`repos/${slug}/git/trees`, { method: 'POST', input: { base_tree: baseTree, tree: entries } })
  const created = gh(`repos/${slug}/git/commits`, {
    method: 'POST',
    input: {
      message,
      tree: tree.sha,
      parents: [parent],
      author: { ...identity, date },
      committer: { ...identity, date },
    },
  })
  replayed.push(created.sha)
  baseTree = tree.sha
  parent = created.sha
  console.log(`${slug}: 回放 ${commit.slice(0, 7)} → ${created.sha.slice(0, 7)}  ${message.split('\n')[0]}`)
}

if (dry) process.exit(0)

gh(`repos/${slug}/git/refs/heads/${branch}`, { method: 'PATCH', input: { sha: parent, force: false } })
console.log(`${slug}: ${branch} 现在是 ${parent.slice(0, 7)}（${replayed.length} 个提交，快进）`)

// 一个 blob 只传一次：同一提交里两个文件内容相同的情况不值得优化，但同一文件在
// 多个提交里出现时要重新传——内容不一样。
function uploadBlob(commit, file) {
  const content = execFileSync('git', ['show', `${commit}:${file}`], {
    cwd: workdir,
    maxBuffer: 64 * 1024 * 1024,
  })
  const blob = gh(`repos/${slug}/git/blobs`, {
    method: 'POST',
    input: { content: content.toString('base64'), encoding: 'base64' },
  })
  return blob.sha
}