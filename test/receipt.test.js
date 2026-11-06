import test from 'node:test'
import assert from 'node:assert/strict'
import { receiptFilename, renderReceipt } from '../src/receipt.js'

const reviewedEvidence = {
  status: 'available', algorithm: 'sha256', digest: 'a'.repeat(64), bytes: 12, capturedAt: '2026-01-01T00:00:00.000Z',
}

function item() {
  return {
    path: '/private/work/<img src=x onerror=alert(1)>.md',
    description: 'Research </style><script>alert(1)</script>',
    status: 'approved', revision: 3,
    firstSeenAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    reviewNote: 'Checked <b>sources</b> & citations',
    reviewEvidence: reviewedEvidence,
    history: [
      { at: '2026-01-01T00:00:00.000Z', action: 'observed', note: '' },
      { at: '2026-01-02T00:00:00.000Z', action: 'approve', note: 'Checked <b>sources</b> & citations', evidence: reviewedEvidence },
    ],
  }
}

test('receipt is self-contained, escapes artifact data, and omits local paths and contents', () => {
  const html = renderReceipt(item(), {
    currentEvidence: reviewedEvidence,
    now: () => new Date('2026-01-03T00:00:00Z'),
  })
  assert.match(html, /当前文件与审阅时摘要一致/)
  assert.match(html, /已通过/)
  assert.match(html, /r3/)
  assert.match(html, /Checked &lt;b&gt;sources&lt;\/b&gt; &amp; citations/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /utm_source=review-receipt&amp;utm_medium=artifact/)
  assert.match(html, /script-src 'none'/)
  assert.doesNotMatch(html, /<script>/i)
  assert.doesNotMatch(html, /\/private\/work/)
  assert.doesNotMatch(html, /javascript:/i)
  assert.equal(receiptFilename(item()).includes('/'), false)
  assert.match(receiptFilename(item()), /\.review-r3\.html$/)
})

test('receipt visibly detects changes after review and rejects unsafe project links', () => {
  const current = { ...reviewedEvidence, digest: 'b'.repeat(64) }
  const html = renderReceipt(item(), { currentEvidence: current, projectUrl: 'javascript:alert(1)' })
  assert.match(html, /文件在审阅后发生变化/)
  assert.doesNotMatch(html, /当前文件与审阅时摘要一致/)
  assert.doesNotMatch(html, /javascript:/i)
  assert.match(html, /https:\/\/github\.com\/zjukop3\/dsh-review-outbox/)
})

test('pending and unreadable receipts do not claim verified file equality', () => {
  const pending = { ...item(), status: 'pending', reviewEvidence: null, history: [] }
  const html = renderReceipt(pending, { currentEvidence: { status: 'unavailable' } })
  assert.match(html, /待审阅/)
  assert.match(html, /此版本没有可用的审阅时文件摘要/)
  assert.doesNotMatch(html, /当前文件与审阅时摘要一致/)
})
