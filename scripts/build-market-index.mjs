import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

const root = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const release = JSON.parse(await readFile(resolve(root, 'market-release.json'), 'utf8'))
const requestedCommit = process.env.DSH_MARKET_COMMIT || release.commit
const commit = execFileSync('git', ['rev-parse', requestedCommit], { cwd: root, encoding: 'utf8' }).trim()
let publishTimestamp
try {
  publishTimestamp = Number(execFileSync('git', ['show', '-s', '--format=%ct', commit], { cwd: root, encoding: 'utf8' }).trim())
} catch {
  throw new Error(
    `Cannot read the committer time of ${commit}. This is usually a shallow clone: fetch the full history ` +
    `(git fetch --unshallow, or actions/checkout with fetch-depth: 0) before building the index, ` +
    `because the index publishes that timestamp as the version's release time.`,
  )
}
const indexUrl = 'https://zjukop3.github.io/dsh-review-outbox/plugins.json'
const repositoryUrl = 'https://github.com/zjukop3/dsh-review-outbox'
const iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#176b48"/><path d="M16 20h32v27H16z" fill="none" stroke="#fff" stroke-width="4"/><path d="M24 28h16M24 35h9" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="m35 39 4 4 8-10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'

const index = {
  format: 1,
  title: {
    en: 'zjukop3 DSH Plugins',
    zh: 'zjukop3 的 DSH 插件',
  },
  description: {
    en: 'Review and acceptance workflows for DeepSeek Harness deliverables.',
    zh: '面向 DeepSeek Harness 成果审阅与验收的插件索引。',
  },
  metadata: {
    categories: {
      workflow: { title: { en: 'Workflow & Automation', zh: '工作流与自动化' } },
    },
    labels: {},
    sortKeys: {
      added: { title: { en: 'Recently added', zh: '最近发布' }, order: 'desc' },
    },
  },
  plugins: [
    {
      name: packageJson.name,
      title: {
        en: 'Review Outbox — Deliverable Review',
        zh: 'Review Outbox · 成果审阅与研究报告验收',
      },
      description: {
        en: 'Evidence-gated acceptance for research reports: claims, citations, data scope and method limits each need a tick plus written evidence before a deliverable can pass, with same-artifact revision history and a SHA-256 receipt that says when the bytes moved.',
        zh: '研究报告的证据门：结论、引用、数据口径、方法限制四项必填检查，勾选之外还要写清证据才能通过；同一成果保留 revision 历史，通过后生成带 SHA-256 的独立验收单，文件被改动后会明确提示重新审阅。',
      },
      icon: `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`,
      author: 'zjukop3',
      homepage: 'https://zjukop3.github.io/dsh-review-outbox/research-report/',
      repository: { url: repositoryUrl },
      metadata: {
        category: 'workflow',
        keywords: ['dsh', 'review', 'research-report', 'acceptance', 'receipt', '成果审阅', '研究报告', '验收'],
        labels: [],
        sortKeys: { added: publishTimestamp },
      },
      versions: [
        {
          version: packageJson.version,
          publishTimestamp,
          source: { type: 'git', url: repositoryUrl, commit },
          engines: { dsh: packageJson.engines.dsh },
        },
      ],
    },
  ],
}

const validated = parseMarketIndex(index, indexUrl)
if (validated.plugins.length !== 1 || validated.plugins[0].versions[0].source.commit !== commit) {
  throw new Error('Validated market index did not preserve the expected plugin and commit')
}
await writeFile(resolve(root, 'site/plugins.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ ok: true, index: 'site/plugins.json', url: indexUrl, plugin: packageJson.name, version: packageJson.version, commit, publishTimestamp }, null, 2))
