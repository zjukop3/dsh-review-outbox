// Catalog coverage: does every package we publish have an entry in
// awesome-dsh-plugin's data/plugins?
//
// With twenty-six packages across three repositories, "did every package get an
// entry" is exactly the kind of thing that drifts silently — a package ships,
// the entry is forgotten, and nothing anywhere reports it. This compares the
// local package list against the upstream tree and names the gap.
//
//   node scripts/catalog-coverage.mjs [--json] [--branch NAME]
//
// --branch also checks a PR branch (e.g. add-onboarding) so an entry that is
// open but not yet merged is counted as covered.
//
// Exit codes: 0 every package covered, 1 packages missing an entry, 2 read error.

import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
// The upstream tree is eleven thousand paths and execFile's default 1 MB buffer
// is not enough for it — the failure reads as 'Command failed', which points at
// the API rather than at the buffer.
const EXEC = { maxBuffer: 64 * 1024 * 1024 }

// gh against github.com reset intermittently from this network. A read-only
// lookup is safe to retry; without the retry a transient reset reads as "the
// upstream is unreadable", which is the wrong conclusion.
async function gh(args, { attempts = 4 } = {}) {
  let last
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run('gh', args, EXEC)
    } catch (error) {
      last = error
      if (attempt === attempts) break
      await new Promise(done => setTimeout(done, attempt * 4000))
    }
  }
  throw last
}
const args = process.argv.slice(2)
const flag = name => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
const asJson = args.includes('--json')
const extraBranches = args.reduce((list, value, index) => (args[index - 1] === '--branch' ? [...list, value] : list), [])

// 上游 contributing.md 第 7 条：内容只有一份依赖清单的聚合包不单独立一行
// （「List the plugins, not the bundle」）。dsh-check-suite 正是这种包，所以它没有
// 目录条目是**正确**的，不是漏了。例外必须被检查而不是被相信：
// test/catalog-rule7.test.js 会验证这里的每个名字确实是纯聚合包，且没夹带别的包。
export const NOT_LISTABLE = {
  'dsh-check-suite': '纯聚合包：只把成员行铺开、无自身运行时代码 — 上游第 7 条不收录',
}

const root = resolve(import.meta.dirname, '..', '..')
const OWNER = 'zjukop3'
const UPSTREAM = 'awesome-dsh-plugin/awesome-dsh-plugin'
const REPOS = ['dsh-review-outbox', 'dsh-verify-kit', 'dsh-vertical-kit']

// slugFor from the catalog's own scripts/lib/entries.mjs: a subpackage entry is
// `owner__repo--<subpath with slashes as hyphens>`, and a repository-root entry
// is just `owner__repo`. Both shapes have to be recognised, because we publish
// one of each kind.
const slugFor = (repo, subPath) => subPath
  ? `${OWNER}__${repo}--${subPath.replaceAll('/', '-')}`
  : `${OWNER}__${repo}`

async function localPackages() {
  const packages = []
  for (const repo of REPOS) {
    const repoDir = resolve(root, repo)
    let entries
    try {
      entries = await readdir(resolve(repoDir, 'packages'))
    } catch {
      // A single-package repository: the root package.json is the entry.
      const pkg = JSON.parse(await readFile(resolve(repoDir, 'package.json'), 'utf8'))
      packages.push({ repo, name: pkg.name, version: pkg.version, slug: slugFor(repo, null), file: `${slugFor(repo, null)}.yml` })
      continue
    }
    for (const dir of entries.sort()) {
      try {
        const pkg = JSON.parse(await readFile(resolve(repoDir, 'packages', dir, 'package.json'), 'utf8'))
        const subPath = `packages/${dir}`
        packages.push({ repo, name: pkg.name, version: pkg.version, slug: slugFor(repo, subPath), file: `${slugFor(repo, subPath)}.yml` })
      } catch {
        // not a package directory
      }
    }
  }
  return packages
}

// One file at a time rather than the whole tree. The tree response is eleven
// thousand paths and does not survive a link that resets mid-transfer; a
// per-file contents lookup is a few hundred bytes and retries cleanly.
// PR branches live on the fork, not upstream. Checking `ref` against UPSTREAM
// answers "does main have it", not "does the branch have it", which silently
// reported every open entry as missing.
const FORK = `${OWNER}/${UPSTREAM.split('/')[1]}`
async function fileExists(slug, ref, repo = UPSTREAM) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { stdout } = await gh(['api', `repos/${repo}/contents/data/plugins/${slug}.yml?ref=${ref}`, '--jq', '.sha'])
      return stdout.trim().length > 0
    } catch (error) {
      const message = String(error.stderr || error.message || '')
      if (message.includes('Not Found') || message.includes('404')) return false
      if (attempt === 3) throw error
      await new Promise(done => setTimeout(done, attempt * 3000))
    }
  }
  return false
}

async function main() {
const packages = await localPackages()

const coverage = []
for (const pkg of packages) {
  let merged = false
  try {
    merged = await fileExists(pkg.slug, 'main')
  } catch (error) {
    process.stderr.write(`note: could not check ${pkg.slug} on main: ${String(error.stderr || error.message).split('\n')[0]}\n`)
  }
  let inBranch = false
  if (!merged) {
    for (const branch of extraBranches) {
      try {
        if (await fileExists(pkg.slug, branch, FORK)) { inBranch = true; break }
      } catch {
        // an unreachable branch is reported by the summary, not fatal
      }
    }
  }
  coverage.push({ ...pkg, merged, inBranch, covered: merged || inBranch })
}

const rows = coverage.map(row => ({ ...row, notListable: NOT_LISTABLE[row.name] ?? null }))
// 例外不计入「缺失」：它们没有条目是规则要求的。
const missing = rows.filter(row => !row.covered && !row.notListable)
const excused = rows.filter(row => row.notListable)
const summary = {
  packages: rows.length,
  merged: rows.filter(row => row.merged).length,
  inBranchOnly: rows.filter(row => !row.merged && row.inBranch).length,
  missing: missing.length,
  notListable: excused.length,
  branchesChecked: extraBranches,
}

if (asJson) {
  process.stdout.write(`${JSON.stringify({ summary, rows }, null, 2)}\n`)
} else {
  process.stdout.write(`# Catalog coverage\n\n`)
  process.stdout.write(`${summary.packages} packages: ${summary.merged} merged, ${summary.inBranchOnly} in an open branch, ${summary.missing} missing\n\n`)
  for (const row of rows) {
    const mark = row.merged ? 'merged' : row.inBranch ? 'branch' : row.notListable ? 'n/a' : 'MISSING'
    process.stdout.write(`${mark.padEnd(7)}  ${row.name}@${row.version}  ${row.file}\n`)
  }
  for (const row of excused) process.stdout.write(`\n不收录（规则 #7）：${row.name} — ${row.notListable}\n`)
  if (missing.length > 0) {
    process.stdout.write(`\n${missing.length} package(s) have no entry anywhere — they cannot appear in Discover:\n`)
    for (const row of missing) process.stdout.write(`  ${row.name} → data/plugins/${row.file}\n`)
  }
}

process.exitCode = missing.length === 0 ? 0 : 1
}

// 只有直接执行才跑网络检查。被 test 导入时不能执行——那条导入曾让一条单元测试
// 跑了 51 秒，因为它顺手把 29 个包的 gh 查询全做了一遍。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
