#!/usr/bin/env node
// 每个已发布版本的真实发布时间，供 build-market-index 写 publishTimestamp。
//
// 为什么需要它：索引里 publishTimestamp 的语义是「这个版本什么时候发布的」——UI 拿它判
// 「7 天内发布」的标。而 build-market-index 一直把两个 kit 的这个字段都填成同一个常数
// （2026-11-10T12:00:00Z，项目开工那天）。于是 28 个包的「发布时间」全一样，全部是假的；
// 今天发的 24 个新版本在索引里看起来和九天前那批毫无区别，而「新发布」的标永远不会亮。
//
// 判据落在「这个版本」上：只认 registry 的 time[<version>]，且要求它等于本地 manifest 的
// version。版本对不上就不写——宁可让构建回退到旧值并报出来，也不要编一个时间。
//
// 用法：
//   node scripts/fetch-publish-times.mjs            刷新缓存（走网络）
//   node scripts/fetch-publish-times.mjs --check    只核对缓存与 registry，不写文件
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const CACHE = resolve(root, 'docs/metrics/publish-times.json')
const REGISTRY = process.env.NPM_REGISTRY || 'https://registry.npmjs.org'
const KIT_ROOTS = [resolve(root, '..', 'dsh-verify-kit'), resolve(root, '..', 'dsh-vertical-kit')]

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')

async function localPackages() {
  const out = []
  for (const kitRoot of KIT_ROOTS) {
    const dir = resolve(kitRoot, 'packages')
    if (!existsSync(dir)) continue
    for (const slug of await readdir(dir)) {
      const manifestPath = resolve(dir, slug, 'package.json')
      if (!existsSync(manifestPath)) continue
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      if (manifest.private || !manifest.name) continue
      out.push({ kit: kitRoot.split('/').pop(), name: manifest.name, version: manifest.version })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

async function publishTime(name, version) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${REGISTRY}/${name}`, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      const stamp = body.time?.[version]
      if (!stamp) return { error: `registry 没有 ${version} 的 time 记录（已发版本：${Object.keys(body.time ?? {}).filter(k => /\d+\.\d+\.\d+/.test(k)).slice(-3).join(', ')}）` }
      return { time: Math.floor(Date.parse(stamp) / 1000), iso: stamp }
    } catch (error) {
      if (attempt === 3) return { error: String(error.message || error) }
      await new Promise(done => setTimeout(done, attempt * 1500))
    }
  }
}

async function main() {
  const packages = await localPackages()
  const previous = existsSync(CACHE) ? JSON.parse(await readFile(CACHE, 'utf8')) : { packages: {} }
  const entries = {}
  const problems = []
  for (const pkg of packages) {
    const result = await publishTime(pkg.name, pkg.version)
    if (result.error) {
      // 已发但 registry 还没登记：保留缓存里的旧值，并报出来。编时间比缺时间更糟。
      const cached = previous.packages?.[pkg.name]
      if (cached) entries[pkg.name] = cached
      problems.push(`${pkg.name}@${pkg.version}: ${result.error}`)
      continue
    }
    entries[pkg.name] = { version: pkg.version, time: result.time, iso: result.iso }
  }

  if (checkOnly) {
    const stale = packages.filter(pkg => entries[pkg.name]?.version !== pkg.version).map(pkg => pkg.name)
    console.log(JSON.stringify({ ok: stale.length === 0, stale, problems }, null, 2))
    return stale.length === 0 && problems.length === 0 ? 0 : 1
  }

  await mkdir(dirname(CACHE), { recursive: true })
  await writeFile(CACHE, JSON.stringify({ registry: REGISTRY, fetchedAt: new Date().toISOString(), packages: entries }, null, 2) + '\n')
  const distinct = new Set(Object.values(entries).map(entry => entry.time)).size
  console.log(`写入 ${CACHE}`)
  console.log(`${Object.keys(entries).length} 个包，${distinct} 个不同发布时间`)
  for (const problem of problems) console.log(`  ! ${problem}`)
  return problems.length === 0 ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().then(code => process.exit(code)).catch(error => {
    console.error(`抓发布时间失败：${error.message || error}`)
    process.exit(2)
  })
}