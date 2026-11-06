import test from 'node:test'
import assert from 'node:assert/strict'
import styles from '../client/styles.js'
import { watchBetterSidebar } from '../client/better-sidebar.js'
import { openNativeArtifact } from '../client/native-open.js'

test('client element selectors cannot leak into the host or other plugins', () => {
  assert.match(styles, /\.ro-root button\{font:inherit\}/)
  assert.doesNotMatch(styles, /(?:^|})\s*button\s*\{/)
})

test('native viewer mounts the source Session before opening official file addresses', async () => {
  const calls = []
  const ctx = {
    get(name) {
      if (name === 'sidebarRight') return { openResource: address => calls.push(`viewer:${address}`) }
      if (name === 'uiWorkspace') return { openSession: id => calls.push(`session:${id}`) }
      return undefined
    },
  }
  const options = { waitForSurface: async () => { calls.push('mounted') } }
  const inside = await openNativeArtifact(ctx, { sessionId: 's1', cwd: '/work app', path: '/work app/a b#c.pdf' }, options)
  const outside = await openNativeArtifact(ctx, { sessionId: 's1', cwd: '/work app', path: '/elsewhere/report.docx' }, options)
  assert.equal(inside, 'dsh-resource://file/session/s1/a%20b%23c.pdf')
  assert.equal(outside, 'dsh-resource://file/session/s1//elsewhere/report.docx')
  assert.deepEqual(calls, [
    'session:s1', 'mounted', `viewer:${inside}`,
    'session:s1', 'mounted', `viewer:${outside}`,
  ])
})

test('better-sidebar integration mounts an existing service and disposes with its owner', () => {
  const events = []
  const service = {
    registerTab(descriptor) {
      events.push(['register', descriptor.id])
      return () => events.push(['dispose', descriptor.id])
    },
  }
  const ctx = {
    get: name => name === 'betterSidebar' ? service : undefined,
    on: () => () => events.push(['off']),
  }
  const cleanup = watchBetterSidebar(ctx, current => current.registerTab({ id: 'review-outbox' }))
  assert.deepEqual(events, [['register', 'review-outbox']])
  cleanup()
  assert.deepEqual(events, [['register', 'review-outbox'], ['off'], ['dispose', 'review-outbox']])
})

test('better-sidebar integration follows late arrival, replacement, removal, and cleanup', () => {
  const events = []
  let listener
  const service = id => ({
    registerTab() {
      events.push(['register', id])
      return () => events.push(['dispose', id])
    },
  })
  const ctx = {
    get: () => undefined,
    on(name, callback) {
      assert.equal(name, 'internal/service')
      listener = callback
      return () => events.push(['off'])
    },
  }
  const cleanup = watchBetterSidebar(ctx, current => current.registerTab({ id: 'review-outbox' }))
  listener('betterSidebar', service('first'))
  listener('betterSidebar', service('second'))
  listener('betterSidebar', undefined)
  listener('otherService', service('unrelated'))
  cleanup()
  assert.deepEqual(events, [
    ['register', 'first'],
    ['dispose', 'first'], ['register', 'second'],
    ['dispose', 'second'], ['off'],
  ])
})

test('native viewer failures stay visible when the source or service is unavailable', async () => {
  await assert.rejects(openNativeArtifact({ get: () => undefined }, { path: 'report.pdf' }), /来源会话/)
  await assert.rejects(
    openNativeArtifact({ get: () => undefined }, { sessionId: 's1', path: 'report.pdf' }),
    /未提供文档 Viewer/,
  )
  await assert.rejects(
    openNativeArtifact({ get: name => name === 'sidebarRight' ? { openResource() {} } : undefined }, { sessionId: 's1', path: 'report.pdf' }),
    /无法打开成果来源会话/,
  )
})
