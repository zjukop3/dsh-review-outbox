// Builds the combined format-1 market index for every zjukop3 plugin: the
// review-outbox release (pinned via market-release.json) plus the eight check
// packages from the two kit repos, pinned to each repo's current HEAD. The
// index is validated with the official parser before it lands in site/, so a
// malformed entry cannot reach the Pages deploy.
//
// Version bumps that matter: the kits' package.json carries engines.dsh since
// the 2026-11-15 wave, so the index and the manifests agree.

import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const release = JSON.parse(await readFile(resolve(root, 'market-release.json'), 'utf8'))
const requestedCommit = process.env.DSH_MARKET_COMMIT || release.commit
const commit = execFileSync('git', ['rev-parse', requestedCommit], { cwd: root, encoding: 'utf8' }).trim()
const commitTime = Number(execFileSync('git', ['show', '-s', '--format=%ct', commit], { cwd: root, encoding: 'utf8' }).trim())

const indexUrl = 'https://zjukop3.github.io/dsh-review-outbox/plugins.json'
const repositoryUrl = 'https://github.com/zjukop3/dsh-review-outbox'

const icon = (fill, paths) => `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${fill}"/>${paths}</svg>`,
).toString('base64')}`
const check = '<path d="m24 40 6 6 12-14" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
const glyph = paths => paths

const kitRepos = {
  'dsh-verify-kit': resolve(root, '..', 'dsh-verify-kit'),
  'dsh-vertical-kit': resolve(root, '..', 'dsh-vertical-kit'),
}

function kitHead(repoKey) {
  const cwd = kitRepos[repoKey]
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  const time = Number(execFileSync('git', ['show', '-s', '--format=%ct', head], { cwd, encoding: 'utf8' }).trim())
  return { commit: head, time, url: `https://github.com/zjukop3/${repoKey}` }
}

// One row per kit package. Versions and engines must match the published
// manifest; the engines range is the same one review-outbox has been validated
// against on the running 0.2.2-rc.3 host.
const KITS = [
  {
    repo: 'dsh-verify-kit', name: 'dsh-hashcheck', version: '0.1.3', slug: 'hashcheck', icon: icon('#176b48', glyph('<path d="M32 12l14 6v12c0 10-6 17-14 22-8-5-14-12-14-22V18z" fill="none" stroke="#fff" stroke-width="4"/>') + check),
    title: { en: 'Hashcheck — delivery manifest', zh: 'Hashcheck · 交付文件校验清单' },
    description: {
      en: 'SHA-256 manifests for delivered files: build once, verify anywhere, and see exactly which bytes moved instead of "looks fine".',
      zh: '交付前生成 SHA-256 清单，验收时逐文件比对：哪个文件改了、哪个丢了、哪个没进清单，出口码可接 CI。',
    },
    category: 'verification',
    keywords: ['hash', 'sha256', 'manifest', 'delivery', '校验', '哈希', '交付'],
  },
  {
    repo: 'dsh-verify-kit', name: 'dsh-citelint', version: '0.1.3', slug: 'citelint', icon: icon('#1f4e8c', glyph('<path d="M20 16h24M20 26h24M20 36h14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>') + check),
    title: { en: 'Citelint — citation check', zh: 'Citelint · 报告引用检查' },
    description: {
      en: 'Citation lint for delivered reports: numbering gaps, duplicate sources, sources that are listed but never cited, and local links that do not exist.',
      zh: '编号断号、同一来源重复编号、列了却没被引用的来源、指向不存在本地文件的链接——全部从 Markdown 直接判定。',
    },
    category: 'verification',
    keywords: ['citation', 'markdown', 'report', 'lint', '引用', '报告'],
  },
  {
    repo: 'dsh-verify-kit', name: 'dsh-outline-lint', version: '0.1.2', slug: 'outline-lint', icon: icon('#2c6e49', glyph('<path d="M18 16h28M18 26h20M18 36h24M18 46h16" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>') + check),
    title: { en: 'Outline lint — document shape', zh: 'Outline lint · 文档结构检查' },
    description: {
      en: 'Shape check for delivered documents: no title, more than one level-1 heading, a lost heading level, no conclusion up front, and nothing a reader can run to reproduce the result.',
      zh: '缺标题、多个一级标题、标题跳级、开头没有结论、没有任何可复现命令——报告结构五项检查。',
    },
    category: 'verification',
    keywords: ['outline', 'structure', 'markdown', '结构', '文档'],
  },
  {
    repo: 'dsh-verify-kit', name: 'dsh-tablelint', version: '0.1.2', slug: 'tablelint', icon: icon('#4a5fa5', glyph('<path d="M14 18h36v28H14zM14 28h36M26 18v28M38 18v28" fill="none" stroke="#fff" stroke-width="4"/>') + check),
    title: { en: 'Tablelint — markdown tables', zh: 'Tablelint · 表格行列检查' },
    description: {
      en: 'Markdown table check for generated reports: rows with the wrong cell count, a delimiter row that disagrees with the header, duplicate or empty headers, and tables with no rows.',
      zh: '行内单元格数与表头不一致、分隔行数量不符、表头重名或为空、只有表头没有数据行——生成报告最常见的碎表。',
    },
    category: 'verification',
    keywords: ['table', 'markdown', 'lint', '表格', '检查'],
  },
  {
    repo: 'dsh-verify-kit', name: 'dsh-numberlint', version: '0.1.2', slug: 'numberlint', icon: icon('#5b4a8a', glyph('<path d="M20 22h10v20M40 20c-6 0-8 4-8 12s2 12 8 12 8-4 8-12-2-12-8-12z" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>') + check),
    title: { en: 'Numberlint — number consistency', zh: 'Numberlint · 数字写法一致性' },
    description: {
      en: 'Number consistency check for one document: the same quantity written 4,985 and 4985, the same percentage with and without a space, and ranges with mixed dashes.',
      zh: '同一文档内同一数量既写 4,985 又写 4985、同一百分比空格不一致、区间连接号混用——比较写法而非数值。',
    },
    category: 'verification',
    keywords: ['numbers', 'consistency', 'lint', '数字', '一致性'],
  },
  {
    repo: 'dsh-vertical-kit', name: 'dsh-agreement-check', version: '0.1.2', slug: 'agreement-check', icon: icon('#8c4632', glyph('<path d="M32 10l16 6v14c0 12-7 20-16 24-9-4-16-12-16-24V16z" fill="none" stroke="#fff" stroke-width="4"/><path d="M26 32l4 4 8-9" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>')),
    title: { en: 'Agreement check — contract structure', zh: 'Agreement check · 合同结构检查' },
    description: {
      en: 'Contract structure checks for Chinese agreements: parties, date, amount consistency (uppercase vs digits), signature blocks, dispute resolution, breach clauses.',
      zh: '甲乙方、签订日期、大写金额与数字一致、签署栏、争议解决、违约责任——合同交给法务前的结构清单。',
    },
    category: 'industry',
    keywords: ['contract', 'legal', 'agreement', '合同', '法务', '协议'],
  },
  {
    repo: 'dsh-vertical-kit', name: 'dsh-invoice-check', version: '0.1.2', slug: 'invoice-check', icon: icon('#a3622c', glyph('<path d="M16 12h32v40l-8-5-8 5-8-5-8 5zM24 24h16M24 32h16" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>')),
    title: { en: 'Invoice check — e-invoice fields', zh: 'Invoice check · 发票字段检查' },
    description: {
      en: 'Invoice field checks for Chinese e-invoices: credit-code format, amount relationships (net + tax = total), uppercase/digit amount agreement, invoice number shapes.',
      zh: '统一社会信用代码字符集、不含税+税额=价税合计的勾稽、大写金额一致、发票号码位数——不需要懂业务就能核对的部分。',
    },
    category: 'industry',
    keywords: ['invoice', 'finance', 'tax', '发票', '财务', '勾稽'],
  },
  {
    repo: 'dsh-vertical-kit', name: 'dsh-listing-check', version: '0.1.2', slug: 'listing-check', icon: icon('#7a5230', glyph('<path d="M14 20h36M14 32h36M14 44h24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="46" cy="44" r="5" fill="none" stroke="#fff" stroke-width="4"/>')),
    title: { en: 'Listing check — product export hygiene', zh: 'Listing check · 商品信息检查' },
    description: {
      en: 'E-commerce listing hygiene from CSV/JSON exports: title length bounds, keyword stuffing, price validity and bounds, SKU completeness and duplicates.',
      zh: '商品导出表的标题长度、关键词堆砌、价格有效性、SKU 完整性与重复——上架前的结构卫生，边界可配置。',
    },
    category: 'industry',
    keywords: ['ecommerce', 'listing', 'sku', '电商', '商品', '上架'],
  },
]

function kitEntry(kit) {
  const { commit: head, time, url } = kitHead(kit.repo)
  return {
    name: kit.name,
    title: kit.title,
    description: kit.description,
    icon: kit.icon,
    author: 'zjukop3',
    homepage: `https://zjukop3.github.io/${kit.repo}/${kit.slug}/`,
    repository: { url },
    metadata: {
      category: kit.category,
      keywords: ['dsh', 'dsh-plugin', 'deepseek-harness', ...kit.keywords],
      labels: [],
      sortKeys: { added: time },
    },
    versions: [
      {
        version: kit.version,
        publishTimestamp: time,
        source: { type: 'git', url, commit: head },
        engines: { dsh: '>=0.2.2-rc.1 <0.3.0-0' },
      },
    ],
  }
}

const reviewEntry = {
  name: packageJson.name,
  title: {
    en: 'Review Outbox — Deliverable Review',
    zh: 'Review Outbox · 成果审阅与研究报告验收',
  },
  description: {
    en: 'Evidence-gated acceptance for research reports: claims, citations, data scope and method limits each need a tick plus written evidence before a deliverable can pass, with same-artifact revision history and a SHA-256 receipt that says when the bytes moved.',
    zh: '研究报告的证据门：结论、引用、数据口径、方法限制四项必填检查，勾选之外还要写清证据才能通过；同一成果保留 revision 历史，通过后生成带 SHA-256 的独立验收单，文件被改动后会明确提示重新审阅。',
  },
  icon: icon('#176b48', '<path d="M16 20h32v27H16z" fill="none" stroke="#fff" stroke-width="4"/><path d="M24 28h16M24 35h9" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="m35 39 4 4 8-10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'),
  author: 'zjukop3',
  homepage: 'https://zjukop3.github.io/dsh-review-outbox/research-report/',
  repository: { url: repositoryUrl },
  metadata: {
    category: 'workflow',
    keywords: ['dsh', 'review', 'research-report', 'acceptance', 'receipt', '成果审阅', '研究报告', '验收'],
    labels: [],
    sortKeys: { added: commitTime },
  },
  versions: [
    {
      version: packageJson.version,
      publishTimestamp: commitTime,
      source: { type: 'git', url: repositoryUrl, commit },
      engines: { dsh: packageJson.engines.dsh },
    },
  ],
}

const index = {
  format: 1,
  title: {
    en: 'zjukop3 DSH Plugins',
    zh: 'zjukop3 的 DSH 插件',
  },
  description: {
    en: 'Deliverable review plus eight deterministic checks for agent output: hash manifests, citations, document shape, tables, number consistency, contracts, invoices, e-commerce listings.',
    zh: '成果审阅台 + 八个确定性交付检查：文件哈希、引用编号、文档结构、表格、数字一致性、合同、发票、电商商品信息。每个都可离线运行，出口码可接 CI。',
  },
  metadata: {
    categories: {
      workflow: { title: { en: 'Workflow & Automation', zh: '工作流与自动化' } },
      verification: { title: { en: 'Verification checks', zh: '验证检查' } },
      industry: { title: { en: 'Industry scenarios', zh: '行业场景' } },
    },
    labels: {},
    sortKeys: {
      added: { title: { en: 'Recently added', zh: '最近发布' }, order: 'desc' },
    },
  },
  plugins: [reviewEntry, ...KITS.map(kitEntry)],
}

const validated = parseMarketIndex(index, indexUrl)
if (validated.plugins.length !== 9) {
  throw new Error(`Validated index has ${validated.plugins.length} plugins, expected 9`)
}
for (const kit of KITS) {
  const entry = validated.plugins.find(plugin => plugin.name === kit.name)
  if (!entry || entry.versions[0].version !== kit.version) {
    throw new Error(`Validated index lost or mismatched ${kit.name}`)
  }
}
await writeFile(resolve(root, 'site/plugins.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ ok: true, plugins: validated.plugins.length, index: 'site/plugins.json' }, null, 2))
