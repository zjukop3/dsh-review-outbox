import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { NOT_LISTABLE } from '../scripts/catalog-coverage.mjs'

// 上游 contributing.md 第 7 条：内容只有一份依赖清单的聚合包不单独立一行。
// 例外可以存在，但必须被检查——否则这个表会变成一个「懒得写条目」的垃圾桶。
const ROOT = resolve(import.meta.dirname, '..', '..')

function packages() {
  const out = []
  for (const repo of ['dsh-vertical-kit', 'dsh-verify-kit']) {
    const dir = resolve(ROOT, repo, 'packages')
    if (!existsSync(dir)) continue
    for (const slug of readdirSync(dir)) {
      const p = resolve(dir, slug, 'package.json')
      if (!existsSync(p)) continue
      out.push({ repo, dir: resolve(dir, slug), pkg: JSON.parse(readFileSync(p, 'utf8')) })
    }
  }
  const rootPkg = resolve(ROOT, 'dsh-review-outbox', 'package.json')
  out.push({
    repo: 'dsh-review-outbox',
    dir: resolve(ROOT, 'dsh-review-outbox'),
    pkg: JSON.parse(readFileSync(rootPkg, 'utf8')),
  })
  return out
}

test('例外表里的每个名字都是真实存在的已发布包', () => {
  const byName = new Map(packages().map((p) => [p.pkg.name, p]))
  for (const name of Object.keys(NOT_LISTABLE)) {
    const p = byName.get(name)
    assert.ok(p, `${name} 不在 workspace 里——例外表里的名字要对得上真包`)
    assert.ok(!p.pkg.private, `${name} 是私有包，不涉及收录`)
  }
})

test('每个例外都真的是纯聚合包：声明 patch、没有运行时代码', () => {
  const byName = new Map(packages().map((p) => [p.pkg.name, p]))
  for (const name of Object.keys(NOT_LISTABLE)) {
    const { pkg } = byName.get(name)
    assert.ok(pkg.dsh?.bundle?.patch, `${name}: 没有 dsh.bundle.patch，它不是聚合包`)
    assert.equal(pkg.main, undefined, `${name}: 有 main 入口，说明自带运行时，不是纯聚合包`)
    assert.equal(pkg.exports?.['.'], undefined, `${name}: exports["."] 存在，说明自带运行时`)
    const filesList = pkg.files || []
    assert.ok(!filesList.some((f) => /\.(js|mjs|cjs|ts)$/.test(f)), `${name}: 发布文件里有代码`)
  }
})

test('聚合包的依赖都指向我自己发布的包（不是别人的副本）', () => {
  const mine = new Set(packages().map((p) => p.pkg.name))
  const byName = new Map(packages().map((p) => [p.pkg.name, p]))
  for (const name of Object.keys(NOT_LISTABLE)) {
    const deps = Object.keys(byName.get(name).pkg.dependencies || {})
    assert.ok(deps.length > 0, `${name}: 没有依赖，那也不是聚合包`)
    for (const d of deps) assert.ok(mine.has(d), `${name}: 依赖 ${d} 不是本项目发布的包`)
  }
})

test('除例外之外，没有任何包被顺手豁免', () => {
  const excused = new Set(Object.keys(NOT_LISTABLE))
  const suspect = packages().filter((p) => {
    if (excused.has(p.pkg.name) || p.pkg.private) return false
    // 非聚合包不该出现在例外表里；带运行时代码的包也不能被豁免
    return true
  })
  for (const p of suspect) {
    assert.ok(!excused.has(p.pkg.name), `${p.pkg.name} 不在例外表里（这条只是防止表被误用）`)
  }
  assert.deepEqual([...excused].sort(), ['dsh-check-suite'])
})