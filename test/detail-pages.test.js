import test from 'node:test'
import assert from 'node:assert/strict'
import { publishedNames } from '../scripts/check-detail-pages.mjs'

// 发布后检查的名单必须来自真实 workspace，而不是手写数组
// （手写名单漏掉 19 个包的那次事故，见 docs/metrics/2026-11-20-index-listed-nine.json）。
test('名单覆盖全部已发布包', () => {
  const names = publishedNames()
  assert.equal(names.length, 28, `期望 28 个已发布包，实际 ${names.length}`)
})

test('两个最晚发布的包在名单里', () => {
  const names = publishedNames()
  for (const n of ['dsh-handover-check', 'dsh-expense-claim-check']) {
    assert.ok(names.includes(n), `${n} 不在名单里`)
  }
})

test('名单无私有包、无重复', () => {
  const names = publishedNames()
  assert.equal(new Set(names).size, names.length)
  assert.ok(!names.includes('placeholder'))
})
