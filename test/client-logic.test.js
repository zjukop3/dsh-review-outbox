import test from 'node:test'
import assert from 'node:assert/strict'
import {
  KINDS,
  OTHER_KIND,
  artifactKind,
  buildReviewMessage,
  fileExtension,
  filterByKind,
  focusProgress,
  kindCounts,
  kindLabel,
  missingRequiredChecks,
  nextAfterRemoval,
  shortcutAction,
  stepIndex,
  suggestedPack,
} from '../client/logic.js'

// The real daily profile held 75 deliverables: 35 .md, 14 .json, 9 .png, 5 .html,
// 5 .csv, 2 .py and 4 binaries (74 by extension), plus one artifact whose name
// carries no usable extension. These fixtures mirror that mix exactly.
const realMix = [
  ...Array.from({ length: 35 }, (_, index) => ({ path: `/work/report-${index}.md` })),
  ...Array.from({ length: 14 }, (_, index) => ({ path: `/work/data-${index}.json` })),
  ...Array.from({ length: 9 }, (_, index) => ({ path: `/work/shot-${index}.png` })),
  ...Array.from({ length: 5 }, (_, index) => ({ path: `/work/page-${index}.html` })),
  ...Array.from({ length: 5 }, (_, index) => ({ path: `/work/sheet-${index}.csv` })),
  ...Array.from({ length: 2 }, (_, index) => ({ path: `/work/tool-${index}.py` })),
  ...Array.from({ length: 4 }, (_, index) => ({ path: `/work/blob-${index}.bin` })),
  { path: '/work/Makefile' },
]

test('artifact kinds cover the extensions that actually showed up', () => {
  assert.equal(artifactKind('/a/b/report.md'), 'document')
  assert.equal(artifactKind('/a/b/report.HTML'), 'document')
  assert.equal(artifactKind('/a/b/sheet.csv'), 'sheet')
  assert.equal(artifactKind('/a/b/shot.png'), 'image')
  assert.equal(artifactKind('/a/b/data.json'), 'data')
  assert.equal(artifactKind('/a/b/tool.py'), 'code')
  assert.equal(artifactKind('/a/b/blob.bin'), OTHER_KIND[0])
})

test('paths without a usable extension stay other instead of guessing', () => {
  assert.equal(artifactKind('Makefile'), OTHER_KIND[0])
  assert.equal(artifactKind('/dir.with.dots/file'), OTHER_KIND[0])
  assert.equal(artifactKind('/trailing/'), OTHER_KIND[0])
  assert.equal(artifactKind(''), OTHER_KIND[0])
  assert.equal(artifactKind(null), OTHER_KIND[0])
  assert.equal(fileExtension('/a/.hidden'), '')
  assert.equal(fileExtension('/a/file.'), '')
})

test('kind counts match the real 75-item backlog and always add up', () => {
  const counts = kindCounts(realMix)
  assert.equal(counts.all, 75)
  assert.equal(counts.document, 40)
  assert.equal(counts.data, 14)
  assert.equal(counts.image, 9)
  assert.equal(counts.sheet, 5)
  assert.equal(counts.code, 2)
  assert.equal(counts.other, 5)
  const summed = [...KINDS.map(([id]) => id), OTHER_KIND[0]].reduce((total, id) => total + counts[id], 0)
  assert.equal(summed, counts.all, 'every artifact belongs to exactly one kind')
  assert.equal(kindCounts([]).all, 0)
})

test('filtering by kind never invents or drops items', () => {
  assert.equal(filterByKind(realMix, 'all').length, 75)
  assert.equal(filterByKind(realMix, 'document').length, 40)
  assert.equal(filterByKind(realMix, OTHER_KIND[0]).length, 5)
  assert.equal(filterByKind(realMix, 'nonsense').length, 0)
  assert.equal(kindLabel('document'), '文档')
  assert.equal(kindLabel(OTHER_KIND[0]), '其他')
  assert.equal(kindLabel('nonsense'), '其他')
})

const key = (value, extra = {}) => ({ key: value, target: { tagName: 'DIV' }, ...extra })

test('single keys map to review actions', () => {
  assert.equal(shortcutAction(key('a')), 'approve')
  assert.equal(shortcutAction(key('R')), 'return')
  assert.equal(shortcutAction(key('z')), 'archive')
  assert.equal(shortcutAction(key('n')), 'next')
  assert.equal(shortcutAction(key('p')), 'previous')
  assert.equal(shortcutAction(key('q')), null)
  assert.equal(shortcutAction(key('Enter')), null)
})

test('typing targets swallow every shortcut, so a note never approves by accident', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'input', 'textarea']) {
    assert.equal(shortcutAction({ key: 'a', target: { tagName } }), null, tagName)
  }
  assert.equal(shortcutAction({ key: 'a', target: { tagName: 'DIV', isContentEditable: true } }), null)
  assert.equal(shortcutAction({ key: 'z', target: { tagName: 'DIV', isContentEditable: false } }), 'archive')
  assert.equal(shortcutAction({ key: 'a', target: null }), 'approve')
  assert.equal(shortcutAction(null), null)
})

test('modifier combinations are left to the host and the browser', () => {
  assert.equal(shortcutAction(key('a', { metaKey: true })), null)
  assert.equal(shortcutAction(key('a', { ctrlKey: true })), null)
  assert.equal(shortcutAction(key('r', { altKey: true })), null)
})

test('stepping the selection wraps around and survives empty lists', () => {
  assert.equal(stepIndex(0, 5, 'next'), 1)
  assert.equal(stepIndex(4, 5, 'next'), 0)
  assert.equal(stepIndex(0, 5, 'previous'), 4)
  assert.equal(stepIndex(2, 5, 'previous'), 1)
  assert.equal(stepIndex(-1, 3, 'next'), 1)
  assert.equal(stepIndex(0, 0, 'next'), -1)
})

test('focus progress reports a human position and nothing when empty', () => {
  const queue = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(focusProgress(queue, 'a'), { index: 0, total: 3, position: 1 })
  assert.deepEqual(focusProgress(queue, 'c'), { index: 2, total: 3, position: 3 })
  assert.deepEqual(focusProgress(queue, 'missing'), { index: 0, total: 3, position: 1 })
  assert.equal(focusProgress([], 'a'), null)
  assert.equal(focusProgress(null, 'a'), null)
})

test('after a decision the reviewer keeps their place instead of jumping to the end', () => {
  const remaining = [{ id: 'b' }, { id: 'c' }, { id: 'd' }]
  assert.equal(nextAfterRemoval(remaining, 0).id, 'b', 'first decision lands on the new first item')
  assert.equal(nextAfterRemoval(remaining, 1).id, 'c')
  assert.equal(nextAfterRemoval(remaining, 9).id, 'd', 'past the end falls back to the last remaining item')
  assert.equal(nextAfterRemoval([{ id: 'z' }], 4).id, 'z')
  assert.equal(nextAfterRemoval([], 0), null)
})

test('spreadsheets without a pack get a suggestion, everything else does not', () => {
  assert.deepEqual(suggestedPack('/work/回款明细.csv'), { id: 'data-delivery', label: '数据交付验收' })
  assert.deepEqual(suggestedPack('/work/sheet.XLSX'), { id: 'data-delivery', label: '数据交付验收' })
  assert.equal(suggestedPack('/work/report.md'), null)
  assert.equal(suggestedPack('/work/data.json'), null)
  assert.equal(suggestedPack('Makefile'), null)
  assert.equal(suggestedPack(''), null)
})

test('the message pasted back into a session names what still fails', () => {
  const pack = { checks: [
    { id: 'a', label: '来源与口径写清', required: true },
    { id: 'b', label: '字段与单位可解释', required: true },
    { id: 'c', label: '复现路径', required: false },
  ] }
  const item = {
    path: '/work/回款明细.csv', revision: 2, status: 'returned', reviewNote: '第 57 行对不上。',
    reviewPack: { checks: { a: { checked: true, detail: '来源已写' }, b: { checked: true, detail: '' } } },
  }
  const message = buildReviewMessage(item, pack)
  assert.match(message, /\[成果审阅 · 退回\] 回款明细\.csv（第 2 次交付）/)
  assert.match(message, /未通过的必填检查：字段与单位可解释/)
  assert.doesNotMatch(message, /来源与口径写清/, 'a satisfied check is not listed as missing')
  assert.doesNotMatch(message, /复现路径/, 'optional checks never block')
  assert.match(message, /审阅意见：\n第 57 行对不上。/)
  assert.match(message, /重新交付到同一路径/)
  assert.match(message, /r2/)
})

test('an approved artifact still produces a message a person can paste', () => {
  const pack = { checks: [{ id: 'a', label: '核心结论有对应证据', required: true }] }
  const item = { path: '/work/report.md', revision: 1, status: 'approved', reviewPack: { checks: { a: { checked: true, detail: '第 3 节' } } } }
  const message = buildReviewMessage(item, pack)
  assert.match(message, /已通过/)
  assert.match(message, /必填检查已全部通过/)
  assert.match(message, /审阅意见：（未填写）/)
  assert.match(message, /文件若已改动需要重新审阅/)
})

test('an artifact with no pack still gets a usable message', () => {
  const message = buildReviewMessage({ path: '/work/notes.txt', revision: 1, status: 'archived' }, null)
  assert.match(message, /已归档/)
  assert.doesNotMatch(message, /必填检查/)
  assert.match(message, /notes\.txt/)
  assert.equal(buildReviewMessage(null, null), '')
})

test('the missing-evidence line names every required check that is not done', () => {
  const pack = { checks: [
    { id: 'a', label: '核心结论有对应证据', required: true },
    { id: 'b', label: '引用来源可复核', required: true },
    { id: 'c', label: '复现材料', required: false },
  ] }
  assert.deepEqual(missingRequiredChecks({ reviewPack: { checks: {} } }, pack), ['核心结论有对应证据', '引用来源可复核'])
  assert.deepEqual(
    missingRequiredChecks({ reviewPack: { checks: { a: { checked: true, detail: '第 3 节' }, b: { checked: true, detail: '   ' } } } }, pack),
    ['引用来源可复核'],
    'a tick without written evidence still counts as missing',
  )
  assert.deepEqual(missingRequiredChecks({ reviewPack: { checks: { a: { checked: true, detail: 'x' }, b: { checked: true, detail: 'y' } } } }, pack), [])
  assert.deepEqual(missingRequiredChecks({}, null), [], 'no pack means nothing to miss')
})
