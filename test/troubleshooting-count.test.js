import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// 症状清单开头那句种类数，必须等于下面真的写了多少节。
//
// 2026-11-23：这份文档写着「六种症状」，而下面已经有 7 节；加完第 8、9 节之后是 9 节。
// 数字是给读者做预期的——说六种，读者找到第七种时会先怀疑自己。
const root = resolve(import.meta.dirname, '..')

test('开头的种类数与实际章节数一致，且编号连续', async () => {
  const text = await readFile(resolve(root, 'docs/TROUBLESHOOTING.md'), 'utf8')
  const numbers = [...text.matchAll(/^## (\d+)\. /gm)].map(match => Number(match[1]))
  assert.ok(numbers.length >= 5, `只找到 ${numbers.length} 节，正则可能失效了`)
  assert.deepEqual(numbers, numbers.map((_, index) => index + 1), `编号不连续：${numbers.join(',')}`)

  const declared = text.match(/([一二三四五六七八九十]+)种症状/)
  assert.ok(declared, '开头缺少「N 种症状」这句话')
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  const value = declared[1].length === 1 ? map[declared[1]] : map[declared[1][0]] * 10 + (map[declared[1][1]] ?? 0)
  assert.equal(value, numbers.length, `开头说 ${declared[1]}种，实际 ${numbers.length} 节`)
})
