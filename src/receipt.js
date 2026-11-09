const DEFAULT_PROJECT_URL = 'https://zjukop3.github.io/dsh-review-outbox/'
const STATUS = {
  pending: ['待审阅', 'pending'],
  approved: ['已通过', 'approved'],
  returned: ['已退回', 'returned'],
  archived: ['已归档', 'archived'],
}
const ACTIONS = {
  observed: '发现成果',
  approve: '通过',
  return: '退回',
  archive: '归档',
  reopen: '重新打开',
  revision: '新 revision',
}

function escape(value, limit = 4000) {
  return String(value ?? '').slice(0, limit).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function basename(path) {
  return String(path || 'artifact').split(/[\\/]/).filter(Boolean).pop() || 'artifact'
}

function projectLink(value) {
  try {
    const url = new URL(value || DEFAULT_PROJECT_URL)
    if (url.protocol !== 'https:') throw new Error('Unsupported project URL')
    url.searchParams.set('utm_source', 'review-receipt')
    url.searchParams.set('utm_medium', 'artifact')
    url.searchParams.set('utm_campaign', 'review-outbox')
    return escape(url.href, 2000)
  } catch {
    return projectLink(DEFAULT_PROJECT_URL)
  }
}

function digest(evidence) {
  return evidence?.status === 'available' && evidence.algorithm === 'sha256' && typeof evidence.digest === 'string'
    ? evidence.digest
    : null
}

function comparison(item, currentEvidence) {
  const reviewed = digest(item.reviewEvidence)
  const current = digest(currentEvidence)
  if (!reviewed) return { kind: 'unknown', text: '此版本没有可用的审阅时文件摘要' }
  if (!current) return { kind: 'unknown', text: '导出时未能重新读取文件；保留下方审阅时摘要' }
  return reviewed === current
    ? { kind: 'match', text: '当前文件与审阅时摘要一致' }
    : { kind: 'changed', text: '文件在审阅后发生变化，请重新审阅当前版本' }
}

export function receiptFilename(item) {
  const name = basename(item?.path).replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(-80) || 'artifact'
  return `${name}.review-r${Number(item?.revision || 1)}.html`
}

/** Render a self-contained, script-free receipt without local paths or file contents. */
export function renderReceipt(item, {
  currentEvidence = null,
  projectUrl,
  reviewPack = null,
  now = () => new Date(),
} = {}) {
  if (!item || typeof item.path !== 'string') throw new Error('Item not found')
  const [statusLabel, statusClass] = STATUS[item.status] || ['未知状态', 'pending']
  const name = basename(item.path)
  const current = comparison(item, currentEvidence)
  const reviewedDigest = digest(item.reviewEvidence)
  const history = (Array.isArray(item.history) ? item.history : []).slice(-50).reverse()
  const historyHtml = history.length > 0 ? history.map(entry => `
    <li class="history-row">
      <div><strong>${escape(ACTIONS[entry.action] || entry.action, 80)}</strong><time>${escape(entry.at, 40)}</time></div>
      ${entry.note ? `<p>${escape(entry.note)}</p>` : ''}
      ${digest(entry.evidence) ? `<code title="审阅时 SHA-256">${escape(digest(entry.evidence), 64)}</code>` : ''}
    </li>`).join('') : '<li class="empty">暂无处理历史</li>'
  const packHtml = reviewPack ? `<section>
    <span class="label">场景验收包</span>
    <h2 class="pack-title">${escape(reviewPack.label, 120)} · v${Number(reviewPack.version || 1)}</h2>
    <p class="description">${escape(reviewPack.summary, 1000)}</p>
    <ol class="checklist">${reviewPack.checks.map(check => {
      const state = item.reviewPack?.checks?.[check.id] || {}
      const detail = String(state.detail || '')
      const complete = state.checked === true && detail.trim().length > 0
      return `<li class="check-row">
        <div><strong>${complete ? '✓' : '○'} ${escape(check.label, 200)}</strong><span>${check.required ? '必填' : '可选'} · ${complete ? '证据已记录' : '未完成'}</span></div>
        <p>${escape(check.requirement, 1000)}</p>
        ${detail ? `<blockquote>${escape(detail, 2000)}</blockquote>` : ''}
      </li>`
    }).join('')}</ol>
  </section>` : ''

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; object-src 'none'; img-src 'none'; font-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>${escape(name, 240)} · Review Outbox 验收单</title>
  <style>
    :root{color-scheme:light;--ink:#17211b;--muted:#657069;--line:#dfe5e0;--paper:#fff;--wash:#f4f6f4;--accent:#176b48}
    *{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{max-width:860px;margin:0 auto;padding:56px 24px 40px}.brand{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:36px}
    .brand strong{font-size:14px;letter-spacing:.08em}.brand a{color:var(--accent);font-weight:650;text-decoration:none}.eyebrow{font-size:12px;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}
    h1{font-size:clamp(28px,5vw,46px);line-height:1.16;margin:10px 0 18px;overflow-wrap:anywhere}.badge{display:inline-block;padding:5px 12px;border-radius:999px;font-weight:700;font-size:13px}
    .approved{background:#e0f3e9;color:#12603e}.returned{background:#fff0dc;color:#9a4c00}.pending{background:#e8ebf5;color:#44527d}.archived{background:#e9ecea;color:#58615b}
    section{margin-top:20px;padding:24px;background:var(--paper);border:1px solid var(--line);border-radius:16px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
    .label{display:block;color:var(--muted);font-size:12px;margin-bottom:4px}.value{font-weight:650;overflow-wrap:anywhere}.comparison{margin-top:20px;padding:13px 16px;border-radius:10px;font-weight:650}
    .comparison.match{background:#e0f3e9;color:#12603e}.comparison.changed{background:#fff0dc;color:#9a4c00}.comparison.unknown{background:#eef0ef;color:#606963}
    .digest{display:block;margin-top:12px;font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all;color:#39473f}.verify{margin:10px 0 0;color:var(--muted);font-size:12px;line-height:1.6}.verify code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}
    .note{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0}.description{color:#3d4942;margin:0}.pack-title{font-size:20px;margin:4px 0 8px}.checklist{list-style:none;padding:0;margin:16px 0 0}.check-row{padding:14px 0;border-top:1px solid var(--line)}.check-row>div{display:flex;justify-content:space-between;gap:16px}.check-row>div>span{color:var(--muted);font-size:12px;white-space:nowrap}.check-row p{margin:5px 0;color:var(--muted);font-size:13px}.check-row blockquote{margin:8px 0 0;padding:10px 12px;background:var(--wash);border-left:3px solid var(--accent);white-space:pre-wrap;overflow-wrap:anywhere}.history{list-style:none;padding:0;margin:0}.history-row{padding:16px 0;border-bottom:1px solid var(--line)}
    .history-row:last-child{border-bottom:0}.history-row>div{display:flex;justify-content:space-between;gap:16px}.history-row time{color:var(--muted);font-size:12px;text-align:right}.history-row p{margin:6px 0;white-space:pre-wrap}.history-row code{display:block;font-size:11px;color:var(--muted);word-break:break-all}.empty{color:var(--muted)}
    footer{display:flex;justify-content:space-between;gap:20px;color:var(--muted);font-size:12px;margin-top:24px}.generated{margin-top:6px;color:var(--muted);font-size:12px}
    @media(max-width:620px){main{padding:28px 14px}.meta{grid-template-columns:1fr 1fr}section{padding:18px}.brand,footer,.history-row>div{align-items:flex-start;flex-direction:column}.history-row time{text-align:left}}
    @media print{body{background:#fff}main{max-width:none;padding:0}section{break-inside:avoid}.brand a{display:none}}
  </style>
</head>
<body><main>
  <header class="brand"><strong>REVIEW OUTBOX · 成果验收单</strong><a href="${projectLink(projectUrl)}" target="_blank" rel="noopener noreferrer">获取同款插件 ↗</a></header>
  <div class="eyebrow">DeepSeek Harness deliverable review</div>
  <h1>${escape(name, 240)}</h1>
  <span class="badge ${statusClass}">${statusLabel}</span>
  <section>
    <div class="meta">
      <div><span class="label">Revision</span><span class="value">r${Number(item.revision || 1)}</span></div>
      <div><span class="label">首次发现</span><span class="value">${escape(item.firstSeenAt, 40)}</span></div>
      <div><span class="label">最近处置</span><span class="value">${escape(item.updatedAt, 40)}</span></div>
    </div>
    <div class="comparison ${current.kind}">${current.text}</div>
    ${reviewedDigest ? `<code class="digest">审阅时 SHA-256 · ${escape(reviewedDigest, 64)}</code>` : ''}
    ${reviewedDigest ? `<p class="verify">自查方法：对这份文件跑 <code>shasum -a 256 '${escape(name, 240)}'</code>（或用 <code>sha256sum</code>），输出应与上面的摘要一致。不一致说明文件在审阅之后被改过。</p>` : ''}
  </section>
  ${item.description ? `<section><span class="label">成果说明</span><p class="description">${escape(item.description)}</p></section>` : ''}
  ${packHtml}
  <section><span class="label">当前审阅意见</span><p class="note">${escape(item.reviewNote || '未填写审阅意见')}</p></section>
  <section><span class="label">处理历史 · 最近 ${history.length} 条</span><ol class="history">${historyHtml}</ol></section>
  <footer><span>本地生成，未自动上传；不自动包含成果正文、绝对路径或会话内容，检查证据与意见按填写内容导出。</span><span class="generated">导出时间 ${escape(now().toISOString(), 40)}</span></footer>
</main></body></html>`
}
