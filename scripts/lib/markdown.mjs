// Minimal Markdown renderer for the public handbook page.
// Scope is deliberately narrow: headings, paragraphs, lists, fenced code,
// tables, blockquotes, and inline code/bold/links. Anything outside that scope
// stays literal text instead of being guessed at.

const escapeHtml = value =>
  String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])

function renderInline(text) {
  const slots = []
  const stash = html => `\u0000${slots.push(html) - 1}\u0000`
  let out = text
    .replace(/`([^`]+)`/g, (_, code) => stash(`<code>${escapeHtml(code)}</code>`))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) =>
      stash(`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`))
  out = escapeHtml(out)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Slots can nest (a link whose label is inline code), so restore them until
  // no placeholder is left instead of a single pass.
  let previous
  do {
    previous = out
    out = out.replace(/\u0000(\d+)\u0000/g, (_, index) => slots[Number(index)])
  } while (out !== previous)
  return out.replace(/\u0000/g, '')
}

const slug = text =>
  text
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

export function renderMarkdown(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n')
  const out = []
  let index = 0
  let paragraph = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    out.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
    paragraph = []
  }

  const readTableRow = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      index += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      flushParagraph()
      const language = trimmed.slice(3).trim()
      const body = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        body.push(lines[index])
        index += 1
      }
      index += 1
      const className = language ? ` class="language-${escapeHtml(language)}"` : ''
      out.push(`<pre><code${className}>${escapeHtml(body.join('\n'))}</code></pre>`)
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      const level = heading[1].length
      const text = heading[2].trim()
      out.push(`<h${level} id="${escapeHtml(slug(text))}">${renderInline(text)}</h${level}>`)
      index += 1
      continue
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph()
      out.push('<hr>')
      index += 1
      continue
    }

    // Table: header row followed by a delimiter row.
    if (trimmed.startsWith('|') && /^\|?[\s:|-]+\|[\s:|-]*$/.test((lines[index + 1] || '').trim())) {
      flushParagraph()
      const header = readTableRow(trimmed)
      index += 2
      const rows = []
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(readTableRow(lines[index].trim()))
        index += 1
      }
      const head = `<thead><tr>${header.map(cell => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`
      const body = rows.length
        ? `<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`
        : ''
      out.push(`<div class="table-wrap"><table>${head}${body}</table></div>`)
      continue
    }

    if (trimmed.startsWith('> ')) {
      flushParagraph()
      const quote = []
      while (index < lines.length && lines[index].trim().startsWith('> ')) {
        quote.push(lines[index].trim().slice(2))
        index += 1
      }
      out.push(`<blockquote>${renderInline(quote.join(' '))}</blockquote>`)
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph()
      const items = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(renderInline(lines[index].trim().replace(/^[-*]\s+/, '')))
        index += 1
      }
      out.push(`<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph()
      const items = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(renderInline(lines[index].trim().replace(/^\d+\.\s+/, '')))
        index += 1
      }
      out.push(`<ol>${items.map(item => `<li>${item}</li>`).join('')}</ol>`)
      continue
    }

    paragraph.push(trimmed)
    index += 1
  }

  flushParagraph()
  return out.join('\n')
}

export function extractTitle(markdown) {
  const match = /^#\s+(.+)$/m.exec(String(markdown))
  return match ? match[1].trim() : 'Review Outbox'
}
