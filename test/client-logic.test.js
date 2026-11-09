import test from 'node:test'
import assert from 'node:assert/strict'
import {
  KINDS,
  OTHER_KIND,
  artifactKind,
  fileExtension,
  filterByKind,
  kindCounts,
  kindLabel,
  shortcutAction,
  stepIndex,
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
