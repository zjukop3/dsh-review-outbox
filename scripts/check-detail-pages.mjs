#!/usr/bin/env node
// 发布后检查：每个已发布的包，市场详情页必须点得开。
// 数 feed 长度是不够的 —— 条目存在不等于用户能到达（见
// docs/incidents/2026-11-20-catalog-detail-pages-404.md）。
//
// 用法：node scripts/check-detail-pages.mjs [owner]
// 退出码：全部 200 → 0；有非 200 → 1。
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const owner = process.argv[2] || 'zjukop3'
const ORIGIN = 'https://awesome-dsh-plugin.com'

/** 已发布的包名：本仓库根包 + 两个 kit 里所有非 private 的包。 */
export function publishedNames(base = root) {
  const names = []
  const rootPkg = resolve(base, 'package.json')
  if (existsSync(rootPkg)) {
    const j = JSON.parse(readFileSync(rootPkg, 'utf8'))
    if (j.name && !j.private) names.push(j.name)
  }
  for (const kit of ['dsh-vertical-kit', 'dsh-verify-kit']) {
    const dir = resolve(base, '..', kit, 'packages')
    if (!existsSync(dir)) continue
    for (const slug of readdirSync(dir)) {
      const p = resolve(dir, slug, 'package.json')
      if (!existsSync(p)) continue
      const j = JSON.parse(readFileSync(p, 'utf8'))
      if (j.name && !j.private) names.push(j.name)
    }
  }
  return [...new Set(names)].sort()
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
  const names = publishedNames()
  let bad = 0
  for (const name of names) {
    const url = `${ORIGIN}/p/${owner}/${name}/`
    const status = await head(url)
    const ok = status === 200
    if (!ok) bad += 1
    console.log(`${ok ? 'ok  ' : 'MISS'} ${status}  ${name}`)
  }
  console.log(`\n${names.length - bad}/${names.length} 详情页可达`)
  if (bad) {
    // 这里只是量了「一个包一个页」这一种假设。若全部 MISS 而仓库名页 200，
    // 说明路由是按键在仓库上的，修法就变成改条目的 name（用纯包名），
    // 而不是改这个脚本。
    console.log('修复方向：目录条目的 name 用纯包名，子目录交给 url；若仓库名页 200 而包名页全 MISS，')
    console.log('则路由按仓库键，需提 PR 改 27 条条目的 name（每 PR 最多 3 条）。')
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}