import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// 索引里 publishTimestamp 的语义是「这个版本什么时候发布的」。
//
// 2026-11-23 之前它不是：build-market-index 把两个 kit 的 28 个包全填成同一个常数
// （2026-11-10T12:00:00Z，项目开工那天）。后果不是显示错，是判断错——UI 用这个字段判
// 「7 天内发布」，那个标永远不会亮；今天发的 24 个补丁版本与九天前那批在索引里长得一模
// 一样。判据是「索引里的时间 == registry 给这个版本的时间」，不是「字段存在」。
const root = resolve(import.meta.dirname, '..')
const KIT_ROOTS = [resolve(root, '..', 'dsh-verify-kit'), resolve(root, '..', 'dsh-vertical-kit')]

async function kits() {
  const out = []
  for (const kitRoot of KIT_ROOTS) {
    for (const slug of await readdirSafe(resolve(kitRoot, 'packages'))) {
      const manifest = JSON.parse(await readFile(resolve(kitRoot, 'packages', slug, 'package.json'), 'utf8'))
      if (manifest.private || !manifest.name) continue
      out.push({ name: manifest.name, version: manifest.version })
    }
  }
  return out
}

async function readdirSafe(dir) {
  const { readdir } = await import('node:fs/promises')
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

test('publishTimestamp 是各版本自己的发布时间，不是同一个常数', async () => {
  const cache = JSON.parse(await readFile(resolve(root, 'docs/metrics/publish-times.json'), 'utf8'))
  const index = JSON.parse(await readFile(resolve(root, 'site/plugins.json'), 'utf8'))
  const byName = new Map(index.plugins.map(plugin => [plugin.name, plugin]))

  const wrong = []
  for (const kit of await kits()) {
    const plugin = byName.get(kit.name)
    if (!plugin) continue
    const cached = cache.packages[kit.name]
    if (!cached || cached.version !== kit.version) continue // 缓存落后就会在构建里报 warning，这里不算失败
    const claimed = plugin.versions[0].publishTimestamp
    if (claimed !== cached.time) wrong.push(`${kit.name}: 索引 ${claimed}，registry ${cached.time}`)
  }
  assert.deepEqual(wrong, [], wrong.join('\n'))
})

test('常数不再出现：不能有两个 kit 包共用同一个「发布时间」而不共用版本', async () => {
  const index = JSON.parse(await readFile(resolve(root, 'site/plugins.json'), 'utf8'))
  const stampOf = plugin => plugin.versions[0].publishTimestamp
  const kitPlugins = index.plugins.filter(plugin => /^dsh-/.test(plugin.name) && plugin.name !== 'dsh-review-outbox')
  const stamps = new Set(kitPlugins.map(stampOf))
  // 33 个包里 30 个不同时间（同一批发布会有相同秒级时间），这已经足够远离「一个常数」。
  assert.ok(stamps.size >= Math.floor(kitPlugins.length * 0.8), `只有 ${stamps.size} 个不同时间，共 ${kitPlugins.length} 个包`)
  assert.ok(!stamps.has(Math.floor(Date.parse('2026-11-10T12:00:00Z') / 1000)), '还在用项目开工日当发布时间')
})
