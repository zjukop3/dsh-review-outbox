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
const firstValueEvidenceUrl = `${repositoryUrl}/blob/main/docs/e2e/application-first-value.json`
const firstValueImageUrl = origin ? `${origin}/research-report/first-value.png` : ''
const currentCommit = '9f7e608a192094272638802e77ca9b1197f8cff1'
const modifiedDate = '2026-11-08'
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
    dateModified: modifiedDate,
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
    softwareVersion: '0.1.1',
    url: repositoryUrl,
    installUrl: marketIndexUrl,
    sameAs: [repositoryUrl, catalogUrl, firstValueEvidenceUrl],
    isAccessibleForFree: true,
    featureList: 'Historical research-report backfill, default evidence checklist, evidence-required approval, revision history, native DOCX/PDF viewer, standalone review receipt',
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
${firstValueImageUrl ? `<meta property="og:image" content="${escapeHtml(firstValueImageUrl)}">\n<meta property="og:image:alt" content="密封研究报告自动回填后默认显示四项必填证据">` : ''}
<meta name="twitter:card" content="${firstValueImageUrl ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${firstValueImageUrl ? `<meta name="twitter:image" content="${escapeHtml(firstValueImageUrl)}">` : ''}
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
const receipt = await readFile(resolve(root, 'docs/e2e/application-first-value.review.html'), 'utf8')
await writeFile(resolve(directory, 'receipt-example.html'), receipt.replace(/https:\/\/www\.npmjs\.com\/package\/dsh-review-outbox/g, repositoryUrl).replace(/<link rel="icon" href="data:image\/svg\+xml,[^"]+">/g, '').replace(/img-src 'none'/g, 'img-src data:').replace('</head>', `${favicon}</head>`))

const home = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Review Outbox · 研究报告验收</title>${favicon}<meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow">${pageUrl ? `<link rel="canonical" href="${escapeHtml(`${origin}/`)}">` : ''}<style>
body{max-width:840px;margin:6vh auto;padding:24px;background:#fafaf8;color:#0a0a0a;font:16px/1.7 system-ui,sans-serif}main{border-top:8px solid #002fa7}h1{font-size:clamp(36px,7vw,72px);font-weight:250;line-height:1.08;margin-bottom:24px}h2{font-size:24px;font-weight:500;line-height:1.3}p,li{color:#525252}.eyebrow{font:12px/1.4 ui-monospace,monospace;letter-spacing:.12em;color:#002fa7}.install,.proof{padding:24px;margin:32px 0;background:#fff;border:1px solid #d4d4d2}.install code{display:block;padding:12px;overflow-wrap:anywhere;background:#f0f0ee;color:#0a0a0a}pre{padding:16px;overflow:auto;background:#0a0a0a;color:#fff}pre code{background:none;color:inherit}details{margin-top:20px}summary{cursor:pointer;color:#002fa7}a{display:inline-block;margin-top:16px;padding:12px 18px;background:#002fa7;color:#fff;text-decoration:none}a.dark{background:#0a0a0a}img{display:block;max-width:100%;height:auto;margin-top:20px;border:1px solid #d4d4d2}.links a{margin-right:8px}small{display:block;margin-top:28px;color:#737373}small a{padding:0;background:none;color:inherit}@media(max-width:600px){body{margin:2vh auto;padding:18px}.install,.proof{padding:18px}a{margin-top:12px}}
</style></head><body><main>
<p class="eyebrow">DEEPSEEK HARNESS PLUGIN · REVIEW OUTBOX 0.1.1</p><h1>研究报告验收清单</h1><p>核对结论、引用、数据口径和方法限制。无需安装即可使用清单并查看真实 SHA-256 验收单。</p>
<section class="install" id="install"><h2>在 DSH 中安装 0.1.1</h2><ol><li>打开「插件」，启用实验性「自定义插件索引」。</li><li>进入「发现 → 添加索引源」，添加以下地址：</li></ol><code>${marketIndexUrl}</code><ol start="3"><li>搜索 <strong>Review Outbox</strong> 或 <strong>研究报告</strong>，确认 0.1.1 和完整提交后安装。</li><li>回到「已安装」启用插件，打开左侧「成果审阅」。</li></ol><a href="./research-report/">打开完整清单</a><details><summary>应用内网络不可用时：固定提交 CLI 回退</summary><pre><code>dsh plugin --profile web add 'github:zjukop3/dsh-review-outbox#${currentCommit}'
dsh web</code></pre></details></section>
<section class="proof"><h2>第一次打开就有明确下一步</h2><p>真实 Web GUI 已验证：安装前密封报告自动回填，默认显示必填证据 0/4；完成四项证据后通过并下载验收单。</p><img src="./research-report/first-value.png" alt="Review Outbox 自动回填密封报告并显示必填证据 0/4" loading="lazy"><p><a class="dark" href="${firstValueEvidenceUrl}">查看首次价值验证证据</a> <a href="./research-report/receipt-example.html">直接查看验收单</a></p></section>
<p class="links"><a href="${catalogUrl}">Awesome 目录条目</a><a class="dark" href="${repositoryUrl}">GitHub 源码</a><a href="${marketIndexUrl}">format 1 索引</a></p><p><a class="dark" href="${downloadHref}" download>旧版 0.1.0 tarball</a></p>
<small>Review Outbox · DeepSeek Harness 成果审阅 · 0.1.0 旧包 <a href="./downloads/${packageName}.sha256">SHA-256 校验文件</a></small></main></body></html>`
await writeFile(resolve(root, 'site/index.html'), home)
await writeFile(resolve(root, 'site/robots.txt'), `User-agent: *\nAllow: /\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`)
const urls = origin ? [
  `${origin}/`,
  pageUrl,
  receiptUrl,
] : []
await writeFile(resolve(root, 'site/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((loc, index) => `  <url><loc>${escapeHtml(loc)}</loc><lastmod>${modifiedDate}</lastmod><priority>${index === 1 ? '1.0' : '0.7'}</priority></url>`).join('\n')}\n</urlset>\n`)
await writeFile(resolve(root, 'site/llms.txt'), `# Review Outbox\n\n> Research report acceptance checklist and standalone SHA-256 review receipts for DeepSeek Harness.\n\n- ${pageUrl || '/research-report/'}: Chinese and English checklist covering claims, citations, data scope, methods, and reproduction.\n- ${receiptUrl || '/research-report/receipt-example.html'}: Real browser-generated standalone receipt; no installation required.\n- ${repositoryUrl}: Public source code, installation guide, and validation evidence.\n- ${marketIndexUrl}: Officially validated DSH format-1 application market index for Review Outbox 0.1.1, pinned installation, and activation.\n- ${firstValueEvidenceUrl}: Real Web GUI evidence for historical sealed-report backfill, default 0/4 checklist, evidence completion, approval, and receipt download.\n- ${repositoryUrl}/blob/${currentCommit}: Immutable public source for the current 0.1.1 application-index installation.\n- ${catalogUrl}: Merged Awesome DSH Plugin listing with bilingual descriptions, install command, and marketplace screenshots.\n- ${downloadUrl || `./downloads/${packageName}`}: Legacy Review Outbox 0.1.0 plugin tarball without the 0.1.1 default research acceptance behavior.\n\nReview Outbox records human evidence and does not claim automatic fact-checking. The project is in 0.1.x validation; the Awesome listing is live, while npm and GitHub Release publication remain separate. The Pages tarball is an older 0.1.0 artifact.\n`)
await mkdir(directory, { recursive: true })
console.log(JSON.stringify({ ok: true, page: 'site/research-report/index.html', receipt: 'site/research-report/receipt-example.html', canonical: pageUrl || null, bytes: Buffer.byteLength(html) }))
