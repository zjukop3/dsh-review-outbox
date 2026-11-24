// 这个脚本存在的理由值得一条测试：2026-11-24 github.com:443 断了快两小时，
// 而 api.github.com 一直是通的。`git push` 需要前者，Git Data API 只需要后者，
// 于是提交可以在断网时照样落地——但它必须拒绝任何「不是快进」的情形。
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const script = resolve(root, 'scripts/push-via-api.mjs')
const source = readFileSync(script, 'utf8')

test('不给参数时打印用法并以 2 退出，不去碰网络', () => {
  try {
    execFileSync(process.execPath, [script], { encoding: 'utf8', stdio: 'pipe' })
    assert.fail('没有参数时应该非零退出')
  } catch (error) {
    assert.equal(error.status, 2)
    assert.match(String(error.stderr), /push-via-api\.mjs <owner\/repo> <workdir>/)
  }
})

test('只做快进：非快进与远端读不到都在写之前停下', () => {
  // 判据写死在脚本里，这里只钉住「必须先检查再写」的顺序：
  // merge-base 的祖先判断出现在任何 POST 之前。
  const guardIndex = source.indexOf('merge-base')
  const firstWriteIndex = source.indexOf("method: 'POST'")
  assert.ok(guardIndex > 0, '脚本里有快进判断')
  assert.ok(firstWriteIndex > guardIndex, '快进判断在第一个写操作之前')
  assert.match(source, /force: false/, 'ref 更新不强制')
  assert.match(source, /--dry/, '有 dry-run')
})
