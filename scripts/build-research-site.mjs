import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const directory = resolve(root, 'site/research-report')
const origin = (process.env.PUBLIC_ORIGIN || '').replace(/\/+$/, '')
const pageUrl = origin ? `${origin}/research-report/` : ''
const receiptUrl = origin ? `${origin}/research-report/receipt-example.html` : ''
const repositoryUrl = 'https://github.com/zjukop3/dsh-review-outbox'
const catalogUrl = 'https://awesome-dsh-plugin.com/p/zjukop3/dsh-review-outbox/'
const marketIndexUrl = 'https://zjukop3.github.io/dsh-review-outbox/plugins.json'
const packageName = 'dsh-review-outbox-0.1.0.tgz'
const downloadUrl = origin ? `${origin}/downloads/${packageName}` : ''
const downloadHref = origin ? downloadUrl : `./downloads/${packageName}`
const title = '研究报告验收清单：AI 报告事实、引用与数据复核'
const description = '免费、无需安装的研究报告验收清单：核对核心结论、引用来源、数据口径、方法限制和复现材料，并查看独立 SHA-256 成果验收单。'
const favicon = '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' fill=\'%23002fa7\'/%3E%3Cpath d=\'M9 16l5 5 9-10\' stroke=\'white\' stroke-width=\'3\' fill=\'none\'/%3E%3C/svg%3E">'
const faq = [
  ['为什么只勾选检查项还不够？', '勾选只表示认为完成了，证据说明才能定位到具体章节、数据、引用或复现材料。Review Outbox 要求四项必填检查同时具有勾选和证据文本。'],
  ['验收单会自动上传报告吗？', '不会。验收单在本地生成，不自动上传，也不自动包含成果正文、绝对路径或会话内容。检查证据和审阅意见按填写内容导出。'],
  ['审阅后报告又发生变化怎么办？', '通过或退回时记录文件 SHA-256。导出时重新计算并比较；不一致时验收单会提示重新审阅当前版本。'],
  ['没有 DeepSeek Harness 能使用这份清单吗？', '可以。清单可直接复制使用，独立验收单也无需安装即可阅读。自动记录状态、revision、文件摘要和验收单导出需要插件。'],
]
const structured = [
  {
    '@context': 'https://schema.org', '@type': 'TechArticle',
    headline: title,
    description,
    datePublished: '2026-11-06',
    dateModified: '2026-11-06',
    inLanguage: ['zh-CN', 'en-US'],
    isAccessibleForFree: true,
    author: { '@type': 'Organization', name: 'Review Outbox' },
    about: ['DeepSeek Harness', '研究报告', '引用复核', 'Research report acceptance'],
    ...(pageUrl ? { mainEntityOfPage: pageUrl } : {}),
  },
  {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map(([question, answer]) => ({
      '@type': 'Question', name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  },
  {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication',
    name: 'Review Outbox',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'DeepSeek Harness >=0.2.2-rc.1 <0.3.0-0, Node.js >=22.19',
    description: 'Human deliverable review, research-report evidence checklists, revision history, native document viewing, and standalone SHA-256 review receipts.',
    url: repositoryUrl,
    sameAs: [repositoryUrl, catalogUrl],
    ...(downloadUrl ? { downloadUrl } : {}),
    isAccessibleForFree: true,
    featureList: 'Research report checklist, evidence required approval, revision history, native DOCX/PDF viewer, standalone review receipt',
  },
]
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const metadata = `
<!-- review-outbox:metadata:start -->
${favicon}
<meta name="description" content="${escapeHtml(description)}">
<meta name="author" content="Review Outbox">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="keywords" content="DeepSeek Harness,研究报告验收,AI报告检查清单,引用复核,Research report review,Review Outbox">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Review Outbox">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:locale" content="zh_CN">
<meta property="og:locale:alternate" content="en_US">
${pageUrl ? `<meta property="og:url" content="${escapeHtml(pageUrl)}">\n<link rel="canonical" href="${escapeHtml(pageUrl)}">` : '<!-- Set PUBLIC_ORIGIN to emit canonical and Open Graph URLs. -->'}
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>
<!-- review-outbox:metadata:end -->
`
const linkScript = '<script>document.querySelectorAll("a[href]").forEach(link => { const parent = link.closest("[contenteditable]"); if (parent) parent.setAttribute("contenteditable", "false"); });</script>'

let html = await readFile(resolve(directory, 'index.html'), 'utf8')
html = html
  .replace(/\n?<!-- review-outbox:metadata:start -->[\s\S]*?<!-- review-outbox:metadata:end -->\n?/g, '\n')
  .replace(/<script>document\.querySelectorAll\("a\[href\]"\)[\s\S]*?<\/script>\n?/g, '')
  .replace(/<link[^>]*(?:fonts\.googleapis|fonts\.gstatic)[^>]*>\n?/g, '')
  .replace(/\sdata-href="[^"]*"/g, '')
  .replace(/<img class="hero-bg"[^>]*\/>/, '<div class="hero-bg" role="presentation"></div>')
  .replace('</head>', `${metadata}</head>`)
  .replace('</body>', `${linkScript}\n</body>`)
if (/Harness:\*\*/.test(html)) throw new Error('Malformed English emphasis remains')
await writeFile(resolve(directory, 'index.html'), html)
const receipt = await readFile(resolve(root, 'docs/e2e/research-report.review-r1.html'), 'utf8')
await writeFile(resolve(directory, 'receipt-example.html'), receipt.replace(/https:\/\/www\.npmjs\.com\/package\/dsh-review-outbox/g, repositoryUrl).replace(/<link rel="icon" href="data:image\/svg\+xml,[^"]+">/g, '').replace(/img-src 'none'/g, 'img-src data:').replace('</head>', `${favicon}</head>`))

const home = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Review Outbox · 研究报告验收</title>${favicon}<meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow">${pageUrl ? `<link rel="canonical" href="${escapeHtml(`${origin}/`)}">` : ''}<style>body{max-width:760px;margin:12vh auto;padding:24px;background:#fafaf8;color:#0a0a0a;font:16px/1.7 system-ui,sans-serif}main{border-top:8px solid #002fa7}h1{font-size:clamp(36px,7vw,72px);font-weight:250;line-height:1.08}p{color:#525252}a{display:inline-block;margin-top:24px;padding:12px 18px;background:#002fa7;color:#fff;text-decoration:none}small{display:block;margin-top:28px;color:#737373}</style></head><body><main><h1>研究报告验收清单</h1><p>核对结论、引用、数据口径和方法限制。无需安装即可使用清单并查看真实 SHA-256 验收单。</p><a href="./research-report/">打开完整清单</a><p><a href="./research-report/receipt-example.html" style="background:#0a0a0a">直接查看验收单</a></p><p><a href="${downloadHref}" download>下载 Review Outbox 0.1.0</a></p><p><a href="${catalogUrl}">Awesome 目录条目</a></p><p><a href="${marketIndexUrl}">DSH 应用内索引（format 1）</a></p><p><a href="${repositoryUrl}" style="background:#0a0a0a">GitHub 源码与安装说明</a></p><small>Review Outbox · DeepSeek Harness 成果审阅 · <a href="./downloads/${packageName}.sha256" style="padding:0;background:none;color:inherit">SHA-256 校验文件</a></small></main></body></html>`
await writeFile(resolve(root, 'site/index.html'), home)
await writeFile(resolve(root, 'site/robots.txt'), `User-agent: *\nAllow: /\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`)
const urls = origin ? [
  `${origin}/`,
  pageUrl,
  receiptUrl,
] : []
await writeFile(resolve(root, 'site/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((loc, index) => `  <url><loc>${escapeHtml(loc)}</loc><lastmod>2026-11-06</lastmod><priority>${index === 1 ? '1.0' : '0.7'}</priority></url>`).join('\n')}\n</urlset>\n`)
await writeFile(resolve(root, 'site/llms.txt'), `# Review Outbox\n\n> Research report acceptance checklist and standalone SHA-256 review receipts for DeepSeek Harness.\n\n- ${pageUrl || '/research-report/'}: Chinese and English checklist covering claims, citations, data scope, methods, and reproduction.\n- ${receiptUrl || '/research-report/receipt-example.html'}: Real browser-generated standalone receipt; no installation required.\n- ${repositoryUrl}: Public source code, installation guide, and validation evidence.\n- ${downloadUrl || `./downloads/${packageName}`}: Review Outbox 0.1.0 plugin tarball.\n- ${catalogUrl}: Merged Awesome DSH Plugin listing with bilingual descriptions, install command, and marketplace screenshots.\n- ${marketIndexUrl}: Officially validated DSH format-1 application market index for Discover, pinned installation, and activation.\n\nReview Outbox records human evidence and does not claim automatic fact-checking. The project is in 0.1.0 validation; the Awesome listing is live, while npm and GitHub Release publication remain separate.\n`)
await mkdir(directory, { recursive: true })
console.log(JSON.stringify({ ok: true, page: 'site/research-report/index.html', receipt: 'site/research-report/receipt-example.html', canonical: pageUrl || null, bytes: Buffer.byteLength(html) }))
