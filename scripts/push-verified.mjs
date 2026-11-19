#!/usr/bin/env node
// Push, then prove the push happened. Three times in this project a push loop
// reported success when nothing was pushed:
//
//   1. `git push | grep 'main -> main'` — the pipeline's exit status was tail's,
//      so a failed push looked fine;
//   2. `grep 'up-to-date'` — a commit the commit-msg hook had rejected produced
//      "up-to-date", which the loop counted as success;
//   3. `git push >/dev/null; [ $? -eq 0 ]` — git returns 0 when there is nothing
//      to push, so a blocked commit was indistinguishable from a landed one.
//
// The lesson is not "check the exit code". It is that a push is only confirmed by
// comparing the remote to the local commit, and this script does exactly that and
// nothing else. Exit 0 means: the remote default branch now points at HEAD.
//
// Usage: node scripts/push-verified.mjs [repoPath ...]
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const targets = (process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['.']).map(path => resolve(path))
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()

function gh(cwd, ...args) {
  try {
    return execFileSync('gh', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
  } catch (error) {
    return `GH_FAILED: ${String(error.stderr || error.message).split('\n')[0].slice(0, 120)}`
  }
}

function remoteSlug(cwd) {
  const url = git(cwd, 'remote', 'get-url', 'origin')
  const match = /github\.com[:/]([^/]+)\/([^/.]+)/.exec(url)
  if (!match) throw new Error(`${cwd}: origin is not a GitHub remote (${url})`)
  return `${match[1]}/${match[2]}`
}

function remoteHead(cwd, slug) {
  // git ls-remote needs the same flaky github.com:443 that the push needs, so the
  // API is the confirmation channel. A failed API call is "unknown", never "done".
  const branch = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
  const sha = gh(cwd, 'api', `repos/${slug}/commits/${branch}`, '--jq', '.sha')
  if (sha.startsWith('GH_FAILED') || !/^[0-9a-f]{40}$/.test(sha)) return { ok: false, sha: null, branch }
  return { ok: true, sha, branch }
}

let failures = 0
for (const cwd of targets) {
  const slug = remoteSlug(cwd)
  const branch = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
  const local = git(cwd, 'rev-parse', 'HEAD')
  const dirty = git(cwd, 'status', '--porcelain')

  if (dirty) {
    process.stdout.write(`${slug}: uncommitted changes present — they will not be pushed\n`)
  }

  const before = remoteHead(cwd, slug)
  if (before.ok && before.sha === local) {
    process.stdout.write(`${slug}: already up to date at ${local.slice(0, 7)} (nothing to push, and that is verified, not assumed)\n`)
    continue
  }

  let pushed = false
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      execFileSync('git', ['push', 'origin', 'HEAD'], { cwd, encoding: 'utf8', stdio: 'pipe' })
      pushed = true
      break
    } catch (error) {
      const first = String(error.stderr || error.message).split('\n').filter(Boolean)[0] ?? 'unknown'
      process.stdout.write(`${slug}: push attempt ${attempt} failed — ${first.slice(0, 100)}\n`)
      // A rejected commit-msg hook is not a network problem; retrying will not help.
      if (/commit-msg|hook/i.test(first)) break
      execFileSync('sleep', [String(attempt * 5)])
    }
  }

  const after = remoteHead(cwd, slug)
  const landed = after.ok && after.sha === local
  if (landed) {
    process.stdout.write(`${slug}: confirmed ${branch} at ${local.slice(0, 7)}${pushed ? '' : ' (was already there)'}\n`)
  } else {
    failures += 1
    const detail = after.ok ? `remote is ${after.sha.slice(0, 7)}, local is ${local.slice(0, 7)}` : 'remote could not be read'
    process.stdout.write(`${slug}: NOT confirmed — ${detail}\n`)
  }
}

process.exit(failures === 0 ? 0 : 1)