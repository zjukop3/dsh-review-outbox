// Pure helpers behind the review panel's type filter and keyboard actions.
// Kept out of the JSX so the rules can be tested without a browser: the panel
// itself only wires state to these functions.

/** Artifact kinds, ordered as they appear in the filter row. */
export const KINDS = [
  ['document', '文档', ['md', 'markdown', 'txt', 'docx', 'pdf', 'html', 'htm']],
  ['sheet', '表格', ['csv', 'tsv', 'xlsx', 'xls']],
  ['image', '图片', ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']],
  ['data', '数据', ['json', 'jsonl', 'yaml', 'yml', 'xml', 'log']],
  ['code', '代码', ['js', 'jsx', 'ts', 'tsx', 'py', 'sh', 'mjs', 'rb', 'go', 'rs']],
]

export const OTHER_KIND = ['other', '其他']

export function fileExtension(path) {
  const name = String(path || '').split(/[\\/]/).filter(Boolean).pop() || ''
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

/** Kind id for one artifact path; unknown or missing extensions are 'other'. */
export function artifactKind(path) {
  const extension = fileExtension(path)
  if (!extension) return OTHER_KIND[0]
  const match = KINDS.find(([, , extensions]) => extensions.includes(extension))
  return match ? match[0] : OTHER_KIND[0]
}

export function kindLabel(kindId) {
  if (kindId === OTHER_KIND[0]) return OTHER_KIND[1]
  const match = KINDS.find(([id]) => id === kindId)
  return match ? match[1] : OTHER_KIND[1]
}

/** Counts per kind plus 'all', so the filter row can label itself without extra passes. */
export function kindCounts(items) {
  const counts = { all: items.length }
  for (const [id] of [...KINDS, OTHER_KIND]) counts[id] = 0
  for (const item of items) counts[artifactKind(item?.path)] += 1
  return counts
}

/** Items of one kind; 'all' passes everything and an unknown kind yields an empty list. */
export function filterByKind(items, kindId) {
  if (kindId === 'all') return items
  return items.filter(item => artifactKind(item?.path) === kindId)
}

const ACTION_KEYS = new Map([
  ['a', 'approve'],
  ['r', 'return'],
  ['z', 'archive'],
  ['n', 'next'],
  ['p', 'previous'],
])

function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false
  const tag = String(target.tagName || '').toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable === true) return true
  return false
}

/**
 * Maps a keydown event to a review action.
 * Returns null when nothing should happen: modifier keys, typing targets, or
 * a key this panel does not bind. Refusing while typing matters more than any
 * shortcut — the note field and evidence boxes are plain textareas.
 */
export function shortcutAction(event) {
  if (!event || isTypingTarget(event.target)) return null
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  const key = String(event.key || '').toLowerCase()
  return ACTION_KEYS.get(key) || null
}

/** Next/previous index with wraparound, used when a shortcut steps the selection. */
export function stepIndex(current, length, direction) {
  if (length <= 0) return -1
  const base = Number.isInteger(current) && current >= 0 ? current : 0
  const next = base + (direction === 'previous' ? -1 : 1)
  return ((next % length) + length) % length
}

/**
 * Position of one artifact inside a review queue, for the one-at-a-time view.
 * Returns null when the queue is empty so callers render nothing rather than
 * "1 / 0".
 */
export function focusProgress(items, currentId) {
  if (!items || items.length === 0) return null
  const index = items.findIndex(item => item.id === currentId)
  return { index: index < 0 ? 0 : index, total: items.length, position: (index < 0 ? 0 : index) + 1 }
}

/**
 * Which artifact to show after the current one leaves the queue.
 * Keeps the reviewer in place — the item that slid into the old index becomes
 * the next one they look at — and falls back to the last item when they were
 * at the end. Returns null when the queue is exhausted.
 */
export function nextAfterRemoval(remaining, removedIndex) {
  if (!remaining || remaining.length === 0) return null
  const index = Math.min(Math.max(Number.isInteger(removedIndex) ? removedIndex : 0, 0), remaining.length - 1)
  return remaining[index]
}

/** Packs that can be applied to an artifact by its extension, in display order. */
const PACK_HINTS = [
  ['data-delivery', '数据交付验收', ['csv', 'tsv', 'xlsx', 'xls']],
]

/**
 * Pack worth offering for an artifact that carries none, or null.
 * Old presentations predate automatic pack attachment, so the panel suggests one
 * instead of silently leaving a spreadsheet on a generic review.
 */
export function suggestedPack(path) {
  const extension = fileExtension(path)
  if (!extension) return null
  const match = PACK_HINTS.find(([, , extensions]) => extensions.includes(extension))
  return match ? { id: match[0], label: match[1] } : null
}
