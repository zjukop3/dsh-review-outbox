import React from 'react'
import { watchBetterSidebar } from './better-sidebar.js'
import { openNativeArtifact } from './native-open.js'
import css from './styles.js'

const API = '/review-outbox/api'
const FILTERS = [
  ['pending', '待审'],
  ['approved', '通过'],
  ['returned', '退回'],
  ['archived', '归档'],
  ['all', '全部'],
]
const STATUS_LABELS = { pending: '待审', approved: '通过', returned: '退回', archived: '归档' }
const SOURCE_LABELS = { presented: '交付', 'research-report': '密封研究', 'workspace-change': '变更', demo: '示例' }

async function request(path, options = {}) {
  const response = await fetch(`${API}/${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
  return data
}

function basename(path) {
  return String(path || '').split(/[\\/]/).filter(Boolean).pop() || path
}

/** Group label for one session: the last two cwd segments, else its short id. */
function sessionLabel(item) {
  const parts = String(item?.cwd || '').split(/[\\/]/).filter(Boolean)
  if (parts.length > 0) return parts.slice(-2).join('/')
  const id = String(item?.sessionId || '')
  return id ? id.slice(0, 18) : '未记录来源'
}

function timeLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Preview({ preview, loading, error }) {
  if (loading) return <div className="ro-preview-message">正在读取成果…</div>
  if (error) return <div className="ro-preview-message">{error}</div>
  if (!preview) return <div className="ro-preview-message">选择左侧成果查看内容</div>
  if (preview.kind === 'text') return (
    <>
      {preview.truncated ? <div className="ro-demo">仅显示前 512 KiB，原始文件未被修改</div> : null}
      <pre>{preview.content}</pre>
    </>
  )
  if (preview.kind === 'image') return <img src={preview.dataUrl} alt="成果预览" />
  if (preview.kind === 'unavailable') return <div className="ro-preview-message">官方仅在原会话仍存活时提供变更对比。成果元数据与审阅状态仍保留在本地。</div>
  if (preview.kind === 'unsupported') return <div className="ro-preview-message">此格式不在本面板内嵌预览。可使用宿主 Viewer，或记录审阅意见与处理状态。</div>
  if (preview.kind === 'binary' || preview.kind === 'oversized') return <div className="ro-preview-message">该文件为二进制或超出预览上限。</div>
  return <div className="ro-preview-message">暂无可显示内容</div>
}

function DiffPreview({ preview, loading, error }) {
  if (loading || error || !preview || preview.kind !== 'text') return <Preview preview={preview} loading={loading} error={error} />
  const lines = preview.hunks.flatMap((hunk, hunkIndex) => [
    <div className="ro-diff-line" key={`h-${hunkIndex}`}>@@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</div>,
    ...hunk.lines.map((line, index) => (
      <span className={`ro-diff-line ${line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : ''}`} key={`${hunkIndex}-${index}`}>{line}</span>
    )),
  ])
  return <pre>{lines}</pre>
}

function Outbox({ openSession, openNative, active = true }) {
  const [items, setItems] = React.useState([])
  const [pending, setPending] = React.useState(0)
  const [filter, setFilter] = React.useState('pending')
  const [selectedId, setSelectedId] = React.useState('')
  const [preview, setPreview] = React.useState(null)
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [previewError, setPreviewError] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [stateError, setStateError] = React.useState(null)
  const [packs, setPacks] = React.useState([])
  const [checkDetails, setCheckDetails] = React.useState({})
  const [checkChecked, setCheckChecked] = React.useState({})
  const requestVersion = React.useRef(0)
  const checkQueue = React.useRef(Promise.resolve())

  const load = React.useCallback(async (quiet = false) => {
    const version = ++requestVersion.current
    if (!quiet) setError('')
    try {
      const data = await request('items')
      if (version !== requestVersion.current) return
      setItems(data.items)
      setPending(data.pending)
      setStateError(data.stateError)
      setSelectedId(current => {
        if (current && data.items.some(item => item.id === current)) return current
        // Open on the newest pending artifact, not on whatever the state file
        // happens to list first: after a historical backfill those are rarely
        // the same, and landing on a week-old item reads like a stale panel.
        const newestFirst = (list) => [...list].sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
        const pendingItems = data.items.filter(item => item.status === 'pending')
        return (newestFirst(pendingItems.length > 0 ? pendingItems : data.items))[0]?.id || ''
      })
    } catch (cause) {
      if (!quiet) setError(cause.message)
    }
  }, [])

  React.useEffect(() => {
    void load()
    const timer = setInterval(() => {
      if (active && document.visibilityState === 'visible') void load(true)
    }, 5000)
    return () => clearInterval(timer)
  }, [load, active])

  React.useEffect(() => {
    request('packs').then(data => setPacks(data.packs || [])).catch(cause => setError(cause.message))
  }, [])

  // Newest first, once, so list order, group order and the default selection
  // agree. The host hands items back in state-file order, which is not strictly
  // by updatedAt; without this the panel could open on a week-old artifact.
  const filtered = React.useMemo(() => {
    const scoped = filter === 'all' ? items : items.filter(item => item.status === filter)
    return [...scoped].sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
  }, [filter, items])
  const selected = filtered.find(item => item.id === selectedId) || filtered[0] || null
  // Long queues are the normal case after a historical backfill: one real profile
  // produced 63 pending deliverables across 9 sessions in a week. Grouping by
  // session turns that into scannable batches without hiding or dropping anything.
  const groups = React.useMemo(() => {
    if (filtered.length < 2) return null
    const bySession = new Map()
    for (const item of filtered) {
      const key = item.sessionId || ''
      if (!bySession.has(key)) bySession.set(key, [])
      bySession.get(key).push(item)
    }
    if (bySession.size < 2) return null
    return [...bySession.entries()]
      .map(([sessionId, members]) => ({
        sessionId,
        items: members,
        label: sessionLabel(members[0]),
        newest: members.reduce((newest, item) => (String(item.updatedAt) > newest ? String(item.updatedAt) : newest), ''),
      }))
      .sort((left, right) => String(right.newest).localeCompare(String(left.newest)))
  }, [filtered])
  const renderCard = item => (
    <button className={`ro-card ${selected?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}>
      <span className="ro-card-title">{basename(item.path)}</span>
      <span className="ro-card-meta">
        <span className={`ro-badge ${item.status}`}>{STATUS_LABELS[item.status] || item.status}</span>
        <span className="ro-badge">{SOURCE_LABELS[item.sourceType] || item.sourceType}</span>
        <span>r{item.revision}</span>
        <span>{timeLabel(item.updatedAt)}</span>
      </span>
      {item.description ? <span className="ro-card-desc">{item.description}</span> : null}
    </button>
  )
  const selectedPack = packs.find(pack => pack.id === selected?.reviewPack?.id) || null

  React.useEffect(() => {
    setCheckDetails(Object.fromEntries(Object.entries(selected?.reviewPack?.checks || {}).map(([id, state]) => [id, state.detail || ''])))
    setCheckChecked(Object.fromEntries(Object.entries(selected?.reviewPack?.checks || {}).map(([id, state]) => [id, state.checked === true])))
  }, [selected?.id, selected?.updatedAt])

  React.useEffect(() => {
    if (!selected) {
      setPreview(null)
      return
    }
    setNote(selected.reviewNote || '')
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError('')
    const endpoint = selected.sourceType === 'workspace-change' ? 'diff' : 'preview'
    request(`${endpoint}?id=${encodeURIComponent(selected.id)}`)
      .then(data => { if (!cancelled) setPreview(data.preview) })
      .catch(cause => { if (!cancelled) setPreviewError(cause.message) })
      .finally(() => { if (!cancelled) setPreviewLoading(false) })
    return () => { cancelled = true }
  }, [selected?.id, selected?.updatedAt, selected?.sourceType])

  const choosePack = async packId => {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const data = await request('pack', { method: 'POST', body: JSON.stringify({ id: selected.id, packId }) })
      setItems(data.items)
      setPending(data.pending)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const saveCheck = (checkId, checked) => {
    if (!selected?.reviewPack) return checkQueue.current
    const itemId = selected.id
    const detail = checkDetails[checkId] || ''
    const previous = selected.reviewPack.checks?.[checkId]
    setCheckChecked(current => ({ ...current, [checkId]: checked }))
    if (previous?.checked === checked && previous?.detail === detail) return checkQueue.current
    const run = async () => {
      setBusy(true)
      setError('')
      try {
        const data = await request('check', {
          method: 'POST',
          body: JSON.stringify({ id: itemId, checkId, checked, detail }),
        })
        setItems(data.items)
        setPending(data.pending)
      } catch (cause) {
        setError(cause.message)
      } finally {
        setBusy(false)
      }
    }
    checkQueue.current = checkQueue.current.then(run, run)
    return checkQueue.current
  }

  const act = async action => {
    if (!selected) return
    if (action === 'return' && !note.trim()) {
      setError('退回成果时请写明需要修改的内容')
      return
    }
    await checkQueue.current
    setBusy(true)
    setError('')
    try {
      const data = await request('action', {
        method: 'POST',
        body: JSON.stringify({ id: selected.id, action, note }),
      })
      setItems(data.items)
      setPending(data.pending)
      const nextFilter = { approve: 'approved', return: 'returned', archive: 'archived', reopen: 'pending' }[action]
      if (nextFilter) setFilter(nextFilter)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const openSource = async () => {
    if (!selected?.sessionId) return
    if (note.trim()) await navigator.clipboard?.writeText(note.trim()).catch(() => {})
    openSession(selected.sessionId)
  }

  const exportReceipt = async () => {
    if (!selected) return
    await checkQueue.current
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/receipt?id=${encodeURIComponent(selected.id)}`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${response.status}`)
      }
      const blobUrl = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      const name = basename(selected.path).replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(-80) || 'artifact'
      anchor.href = blobUrl
      anchor.download = `${name}.review-r${selected.revision}.html`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 0)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const openInNativeViewer = async () => {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      await openNative(selected)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const isDemo = items.some(item => item.sourceType === 'demo')
  return (
    <div className="ro-root">
      <style>{css}</style>
      <header className="ro-header">
        <span className="ro-title">成果审阅</span>
        <span className="ro-count">{pending}</span>
        <span className="ro-subtle">Deliverables review outbox</span>
        <span className="ro-spacer" />
        <button className="ro-button" onClick={() => load()}>刷新</button>
      </header>
      {isDemo ? <div className="ro-demo">当前包含合成示例，仅用于验证安装、预览和审阅流程。</div> : null}
      {stateError ? <div className="ro-error">{stateError}</div> : null}
      {error ? <div className="ro-error">{error}</div> : null}
      <nav className="ro-toolbar" aria-label="成果状态筛选">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={`ro-tab ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>
            {label} {id === 'all' ? items.length : items.filter(item => item.status === id).length}
          </button>
        ))}
      </nav>
      <div className="ro-body">
        <aside className="ro-list" aria-label="成果列表">
          {groups
            ? groups.map((group, index) => (
              <details className="ro-group" key={group.sessionId || `group-${index}`} open={index === 0 || group.items.some(item => item.id === selected?.id)}>
                <summary className="ro-group-head">
                  <span className="ro-group-title">{group.label}</span>
                  <span className="ro-group-meta">{group.items.length} 项 · {timeLabel(group.newest)}</span>
                </summary>
                {group.items.map(renderCard)}
              </details>
            ))
            : filtered.map(renderCard)}
          {filtered.length === 0 ? <div className="ro-empty"><strong>这里还没有成果</strong><span>当 Agent 交付文件，或你切换其他状态筛选时，成果会出现在这里。</span></div> : null}
        </aside>
        <main className="ro-detail">
          {selected ? (
            <>
              <section className="ro-detail-head">
                <h2 className="ro-detail-title">{basename(selected.path)}</h2>
                <div className="ro-path">{selected.path}</div>
                <div className="ro-card-meta">
                  <span className={`ro-badge ${selected.status}`}>{STATUS_LABELS[selected.status]}</span>
                  <span className="ro-badge">{SOURCE_LABELS[selected.sourceType]}</span>
                  <span>第 {selected.revision} 次交付</span>
                  {selected.added !== undefined ? <span>+{selected.added} / −{selected.deleted}</span> : null}
                </div>
                {selected.description ? <p className="ro-subtle">{selected.description}</p> : null}
              </section>
              <section className="ro-preview">
                {selected.sourceType === 'workspace-change'
                  ? <DiffPreview preview={preview} loading={previewLoading} error={previewError} />
                  : <Preview preview={preview} loading={previewLoading} error={previewError} />}
              </section>
              <section className="ro-pack">
                <div className="ro-pack-head">
                  <select aria-label="场景验收包" value={selectedPack?.id || ''} disabled={busy || selected.status !== 'pending'} onChange={event => choosePack(event.target.value)}>
                    <option value="">通用验收（无额外检查）</option>
                    {packs.map(pack => <option value={pack.id} key={pack.id}>{pack.label}</option>)}
                  </select>
                  {selected.reviewProgress ? <span className="ro-subtle">必填证据 {selected.reviewProgress.requiredCompleted}/{selected.reviewProgress.requiredTotal}</span> : null}
                </div>
                {selectedPack ? (
                  <>
                    <p className="ro-pack-summary">{selectedPack.summary}</p>
                    <div className="ro-checks">
                      {selectedPack.checks.map(check => {
                        const state = selected.reviewPack?.checks?.[check.id] || { checked: false, detail: '' }
                        const checked = checkChecked[check.id] ?? state.checked
                        return (
                          <div className="ro-check" key={check.id} onBlur={event => {
                            if (selected.status === 'pending' && !event.currentTarget.contains(event.relatedTarget)) void saveCheck(check.id, checked)
                          }}>
                            <label>
                              <input type="checkbox" checked={checked} disabled={busy || selected.status !== 'pending'} onChange={event => saveCheck(check.id, event.target.checked)} />
                              <strong>{check.label}</strong><span>{check.required ? '必填' : '可选'}</span>
                            </label>
                            <p>{check.requirement}</p>
                            <textarea
                              aria-label={`${check.label}证据`}
                              rows={2}
                              value={checkDetails[check.id] || ''}
                              readOnly={selected.status !== 'pending'}
                              placeholder={check.placeholder}
                              onChange={event => setCheckDetails(current => ({ ...current, [check.id]: event.target.value }))}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : null}
              </section>
              <section className="ro-actions">
                <textarea className="ro-note" value={note} onChange={event => setNote(event.target.value)} placeholder="审阅意见；退回时可复制到原会话" />
                <div className="ro-action-row">
                  {selected.status === 'pending' ? (
                    <>
                      <button className="ro-button primary" disabled={busy || (selectedPack && !selected.reviewProgress?.complete)} title={selectedPack && !selected.reviewProgress?.complete ? '完成所有必填检查并填写证据后可通过' : ''} onClick={() => act('approve')}>通过</button>
                      <button className="ro-button danger" disabled={busy} onClick={() => act('return')}>退回</button>
                    </>
                  ) : <button className="ro-button" disabled={busy} onClick={() => act('reopen')}>重新打开</button>}
                  {selected.status !== 'archived' ? <button className="ro-button" disabled={busy} onClick={() => act('archive')}>归档</button> : null}
                  {selected.sessionId ? <button className="ro-button" disabled={busy} onClick={openInNativeViewer}>在宿主 Viewer 打开</button> : null}
                  <button className="ro-button" disabled={busy} onClick={exportReceipt} title="独立 HTML，不包含成果正文或本机路径">导出验收单</button>
                  {selected.sessionId ? <button className="ro-button" onClick={openSource}>复制意见并打开原会话</button> : null}
                </div>
              </section>
              <details className="ro-history">
                <summary>查看处理历史（{selected.history?.length || 0}）</summary>
                {[...(selected.history || [])].reverse().slice(0, 20).map((entry, index) => (
                  <div className="ro-history-item" key={`${entry.at}-${index}`}>
                    <strong>{entry.action}</strong> <span className="ro-subtle">{timeLabel(entry.at)}</span>
                    {entry.note ? <div className="ro-history-note">{entry.note}</div> : null}
                  </div>
                ))}
              </details>
            </>
          ) : <div className="ro-empty"><strong>选择一项成果开始审阅</strong></div>}
        </main>
      </div>
      <footer className="ro-footer">本地保存审阅状态 · 通过仅表示审阅完成，不会自动发布 · 普通问题与审批不进入此列表</footer>
    </div>
  )
}

function PanelIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3h7l4 4v14H7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M14 3v5h4M10 13l2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const inject = ['slots']

export function apply(ctx) {
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'review-outbox' }, () => <Outbox openSession={id => ctx.get('uiWorkspace')?.openSession(id)} openNative={item => openNativeArtifact(ctx, item)} />))
  ctx.effect(() => watchBetterSidebar(ctx, sidebar => sidebar.registerTab({
    id: 'review-outbox',
    title: () => '成果审阅',
    description: () => '审阅 Agent 成果、检查证据并导出验收单',
    icon: size => <PanelIcon size={size} />,
    order: 6,
    single: true,
    bottomOnly: true,
    component: ({ visible }) => <Outbox active={visible} openSession={id => ctx.get('uiWorkspace')?.openSession(id)} openNative={item => openNativeArtifact(ctx, item)} />,
  })))
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: 'review-outbox',
    order: 6,
    label: () => '成果审阅',
  }, PanelIcon)))
}
