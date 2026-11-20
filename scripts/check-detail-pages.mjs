#!/usr/bin/env node
// 发布后检查：每个已发布的包，市场详情页必须点得开。
//
// 页面 URL 不是 /p/{owner}/{包名}/ —— 那是错的（我曾据此误判 27 条全是 404，
// 见 docs/incidents/2026-11-20-catalog-detail-pages-404.md）。站点规则是：
//
//   github.com/{owner}/{repo}/tree/{ref}/{path...}
//     ->  {origin}/p/{owner}/{repo}--{path 用 - 连}/
//
// 这条规则来自上游 scripts/lib/terms.mjs::slugOf()，见 issue #13437。
// 本脚本复刻它，并对复刻本身做单元测试（test/detail-pages.test.js）。
//
// 用法：node scripts/check-detail-pages.mjs [owner]
// 退出码：全部 200 → 0；有非 200 → 1。
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = 'https://awesome-dsh-plugin.com'

/** 复刻站点 slugOf()：github URL → 页面 slug（不含 origin 和前后斜杠）。 */
export function slugOf(url) {
  const clean = String(url)
    .replace(/^git\+/, '')
    .replace(/\.git(?=$|\/)/, '')
    .replace(/\/$/, '')
  const m = clean.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/tree\/[^/]+\/(.+))?$/i)
  if (!m) return null
  const [, owner, repo, path] = m
  return path ? `${owner}/${repo}--${path.split('/').join('-')}` : `${owner}/${repo}`
}

/** 已发布包及其条目 URL（子目录写成 /tree/main/packages/<dir>）。 */
export function publishedEntries(base = root) {
  const out = []
  const rootPkg = resolve(base, 'package.json')
  if (existsSync(rootPkg)) {
    const j = JSON.parse(readFileSync(rootPkg, 'utf8'))
    if (j.name && !j.private) {
      const u = j.repository?.url || j.repository || ''
      out.push({ name: j.name, url: normalise(u) })
    }
  }
  for (const kit of ['dsh-vertical-kit', 'dsh-verify-kit']) {
    const dir = resolve(base, '..', kit, 'packages')
    if (!existsSync(dir)) continue
    for (const slug of readdirSync(dir)) {
      const p = resolve(dir, slug, 'package.json')
      if (!existsSync(p)) continue
      const j = JSON.parse(readFileSync(p, 'utf8'))
      if (!j.name || j.private) continue
      const repo = normalise(j.repository?.url || j.repository || '')
      out.push({ name: j.name, url: `${repo}/tree/main/packages/${slug}` })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function normalise(u) {
  return String(u).replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/$/, '')
}

/** 每个条目的详情页 URL。 */
export function pageUrls(base = root, origin = ORIGIN) {
  return publishedEntries(base).map((e) => ({
    name: e.name,
    url: `${origin}/p/${slugOf(e.url)}/`,
  }))
}

async function head(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45_000) })
    return res.status
  } catch (err) {
    return `ERR ${err.name}`
  }
}

async function main() {
  const pages = pageUrls()
  let bad = 0
  for (const p of pages) {
    const status = await head(p.url)
    const ok = status === 200
    if (!ok) bad += 1
    console.log(`${ok ? 'ok  ' : 'MISS'} ${status}  ${p.name}  ${p.url}`)
  }
  console.log(`\n${pages.length - bad}/${pages.length} 详情页可达`)
  if (bad) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}