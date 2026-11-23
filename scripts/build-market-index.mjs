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
import { existsSync } from 'node:fs'
import { readFile, writeFile, readdir } from 'node:fs/promises'
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

// sortKeys.added：索引里的排列顺序，一个项目统一用开工日没问题。
const kitSort = {
  'dsh-verify-kit': Math.floor(Date.parse('2026-11-10T12:00:00Z') / 1000),
  'dsh-vertical-kit': Math.floor(Date.parse('2026-11-10T12:00:00Z') / 1000),
}

// publishTimestamp：这个**版本**的发布时间，由 scripts/fetch-publish-times.mjs 从 registry 取。
// 它以前和 sortKeys.added 用同一个常数，于是 28 个包的「发布时间」全一样，UI 判「7 天内
// 发布」的标永远不会亮，今天发的版本与九天前的看起来毫无区别。版本对不上就退回旧常数并
// 记一条 warning——宁可旧，不要编。
const PUBLISH_TIMES_PATH = resolve(root, 'docs/metrics/publish-times.json')
const PUBLISH_TIMES = existsSync(PUBLISH_TIMES_PATH)
  ? JSON.parse(await readFile(PUBLISH_TIMES_PATH, 'utf8')).packages ?? {}
  : {}
const timeWarnings = []
function publishTimestampOf(kit, fallback) {
  const cached = PUBLISH_TIMES[kit.name]
  if (!cached) {
    timeWarnings.push(`${kit.name}@${kit.version}: 缓存里没有，退回 sortKeys 常数（跑 node scripts/fetch-publish-times.mjs）`)
    return fallback
  }
  if (cached.version !== kit.version) {
    timeWarnings.push(`${kit.name}: 缓存是 ${cached.version}，本地是 ${kit.version}，退回常数`)
    return fallback
  }
  return cached.time
}
const kitRepos = {
  'dsh-verify-kit': resolve(root, '..', 'dsh-verify-kit'),
  'dsh-vertical-kit': resolve(root, '..', 'dsh-vertical-kit'),
}

// One row per kit package. Versions and engines must match the published
// manifest; the engines range is the same one review-outbox has been validated
// against on the running 0.2.2-rc.3 host.
// The index is what a user actually adds as a market source, so it has to list
// every package this project publishes. It used to list eight, hand-written, with
// hard-coded version numbers — meaning nineteen published packages could not be
// installed from the index at all, and the eight that could were pinned to
// versions that had already moved on. Nobody noticed because the upstream catalog
// was being verified, not this file.
//
// The list is now derived from the two kit repositories: their checks-data.mjs
// describes each check, their package.json carries the published version.
const KIT_SOURCES = [
  { repo: 'dsh-verify-kit', category: 'verification', color: '#176b48', glyph: '<path d="M32 12l14 6v12c0 10-6 17-14 22-8-5-14-12-14-22V18z" fill="none" stroke="#fff" stroke-width="4"/>' },
  { repo: 'dsh-vertical-kit', category: 'industry', color: '#002fa7', glyph: '<path d="M18 20h28v6H18zM18 30h28v6H18zM18 40h18v6H18z" fill="#fff"/>' },
]

const KITS = []
for (const source of KIT_SOURCES) {
  const kitRoot = resolve(root, '..', source.repo)
  const { CHECKS } = await import(resolve(kitRoot, 'scripts', 'checks-data.mjs'))
  const seen = new Set()
  for (const entry of CHECKS) {
    const manifest = JSON.parse(await readFile(resolve(kitRoot, 'packages', entry.npm, 'package.json'), 'utf8'))
    const zhTitle = String(entry.title ?? '')
    seen.add(entry.npm)
    KITS.push({
      repo: source.repo,
      name: entry.npm,
      version: manifest.version,
      slug: entry.slug,
      icon: icon(source.color, glyph(source.glyph) + check),
      title: { en: `${entry.npm} — ${entry.cli ?? entry.slug}`, zh: zhTitle },
      description: { en: String(entry.description ?? ''), zh: String(entry.description ?? '') },
      category: source.category,
      keywords: [entry.slug, entry.cli ?? entry.slug].filter(Boolean),
    })
  }

  // 已发布但不在 CHECKS 里的包（例如 dsh-check-suite 这样的 bundle）也要进索引：
  // 从包的 locale 读标题与描述，不再依赖 checks-data。用扫目录而不是再写一份名单，
  // 免得重演「索引只列了 9 个包」那次事故。
  for (const dir of await readdir(resolve(kitRoot, 'packages'))) {
    const manifestPath = resolve(kitRoot, 'packages', dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (manifest.private || !manifest.name || seen.has(manifest.name)) continue
    const locEn = JSON.parse(await readFile(resolve(kitRoot, 'packages', dir, 'locale', 'en.json'), 'utf8')).meta
    const locZh = JSON.parse(await readFile(resolve(kitRoot, 'packages', dir, 'locale', 'zh.json'), 'utf8')).meta
    seen.add(manifest.name)
    KITS.push({
      repo: source.repo,
      name: manifest.name,
      version: manifest.version,
      slug: dir,
      icon: icon(source.color, glyph(source.glyph) + check),
      title: { en: String(locEn.title), zh: String(locZh.title) },
      description: { en: String(locEn.description), zh: String(locZh.description) },
      category: source.category,
      keywords: ['bundle', dir],
    })
  }
}

function kitEntry(kit) {
  return {
    name: kit.name,
    title: kit.title,
    description: kit.description,
    icon: kit.icon,
    author: 'zjukop3',
    homepage: `https://zjukop3.github.io/${kit.repo}/${kit.slug}/`,
    repository: { url: `https://github.com/zjukop3/${kit.repo}` },
    metadata: {
      category: kit.category,
      keywords: ['dsh', 'dsh-plugin', 'deepseek-harness', ...kit.keywords],
      labels: [],
      sortKeys: { added: kitSort[kit.repo] },
    },
    versions: [
      {
        version: kit.version,
        publishTimestamp: publishTimestampOf(kit, kitSort[kit.repo]),
        source: { type: 'npm' },
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
  plugins: [reviewEntry, ...(await Promise.all(KITS.map(kitEntry)))],
}

const validated = parseMarketIndex(index, indexUrl)
// The count is derived, not written down. The old literal `9` was the same
// mistake as the hand-written KITS list: a number that had to be maintained in
// two places, and was not.
const expectedCount = 1 + KITS.length
if (validated.plugins.length !== expectedCount) {
  throw new Error(`Validated index has ${validated.plugins.length} plugins, expected ${expectedCount}`)
}
for (const kit of KITS) {
  const entry = validated.plugins.find(plugin => plugin.name === kit.name)
  if (!entry || entry.versions[0].version !== kit.version) {
    throw new Error(`Validated index lost or mismatched ${kit.name}`)
  }
  // 索引里写的发布时间必须是这个版本的真实发布时间：写成常数，UI 的「7 天内发布」标就
  // 永远不会亮，而读者也无从判断这个包是不是还在维护。
  const claimed = entry.versions[0].publishTimestamp
  const real = PUBLISH_TIMES[kit.name]
  if (real && real.version === kit.version && claimed !== real.time) {
    throw new Error(`${kit.name}: publishTimestamp ${claimed} 与 registry 的 ${real.time} 不一致`)
  }
}
await writeFile(resolve(root, 'site/plugins.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ ok: true, plugins: validated.plugins.length, index: 'site/plugins.json', publishTimeWarnings: timeWarnings }, null, 2))
