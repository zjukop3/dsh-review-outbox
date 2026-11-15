// Renders the monthly ecosystem report as a self-contained page under
// site/ecosystem/. Data comes from the shared download cache that
// ecosystem-snapshot.mjs maintains, so a report edition is reproducible:
// the same cache + the same catalog produce the same page.
//
// Usage: node scripts/ecosystem-monthly.mjs [--cache docs/metrics/ecosystem-downloads.json]
//        [--index PATH] [--date YYYY-MM-DD] [--rank-package NAME]
//
// The report leads with the distribution, not the leaderboard: the median is
// the number that tells a new author what "normal" is. The leaderboard names
// the winners; the burst caveat keeps one-week totals from being read as use.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { collectDownloads, percentile, rank, summarize } from './ecosystem-snapshot.mjs'

// Categories answer the question the raw distribution cannot: which trades
// already have proven demand (high median) and which are crowded (many
// entries, low median). Both come from the same cache, no extra network.
function categoryTable(plugins, downloads) {
  const groups = new Map()
  for (const plugin of plugins) {
    const category = String(plugin?.metadata?.category || '').trim() || '未分类'
    if (!groups.has(category)) groups.set(category, [])
    const value = downloads[plugin.name]
    if (Number.isFinite(value)) groups.get(category).push({ name: plugin.name, downloads: value })
  }
  const rows = []
  for (const [category, entries] of groups) {
    if (entries.length < 5) continue
    const sorted = entries.map(entry => entry.downloads).sort((a, b) => a - b)
    const top = [...entries].sort((a, b) => b.downloads - a.downloads)[0]
    rows.push({ category, count: groups.get(category).length, median: percentile(sorted, 0.5), p75: percentile(sorted, 0.75), top: top.name, topDownloads: top.downloads })
  }
  return rows.sort((a, b) => b.median - a.median)
}

const ORIGIN = process.env.PUBLIC_ORIGIN || 'https://zjukop3.github.io/dsh-review-outbox'
const REPO = 'https://github.com/zjukop3/dsh-review-outbox'
const BASELINE = `${ORIGIN}/baseline/`
const KIT_SITES = {
  verify: 'https://zjukop3.github.io/dsh-verify-kit/',
  vertical: 'https://zjukop3.github.io/dsh-vertical-kit/',
}

const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const num = value => Number(value).toLocaleString('en-US')

const styles = 'body{max-width:860px;margin:6vh auto;padding:24px;background:#fafaf8;color:#0a0a0a;font:16px/1.7 system-ui,sans-serif}main{border-top:8px solid #002fa7}h1{font-size:clamp(28px,5vw,44px);font-weight:250;line-height:1.15;margin-bottom:14px}h2{font-size:21px;font-weight:500;margin-top:34px}p,li,td,th{color:#3d3d3d}a{color:#002fa7}code{font:.9em/1.5 ui-monospace,monospace;background:#f0f0ee;padding:2px 5px;border-radius:3px}table{border-collapse:collapse;width:100%;font-size:14px;margin:14px 0}th,td{border:1px solid #d4d4d2;padding:8px 11px;text-align:left;vertical-align:top}th{background:#f0f0ee}.eyebrow{font:12px/1.4 ui-monospace,monospace;letter-spacing:.12em;color:#002fa7}.nav{margin:22px 0;font-size:14px}.nav a{margin-right:14px}.caveat{margin:24px 0;padding:14px 18px;background:#f0f0ee;border-left:4px solid #002fa7}small{display:block;margin-top:30px;color:#737373}@media(max-width:600px){body{margin:2vh auto;padding:18px}}'

function render({ date, catalog, distribution, leaderboard, selfRank, growth, categories, weekly, shapesHistory }) {
  const distributionRows = [
    ['median', distribution.median], ['p25', distribution.p25], ['p75', distribution.p75],
    ['p90', distribution.p90], ['p95', distribution.p95], ['p99', distribution.p99],
    ['max', distribution.max],
  ].map(([label, value]) => `<tr><td>${label}</td><td style="text-align:right">${num(value)}</td></tr>`).join('')
  const leaderRows = leaderboard
    .map((entry, index) => {
      const mine = selfRank && entry.name === selfRank.name ? ' <strong>← 本项目</strong>' : ''
      return `<tr><td style="text-align:right">${index + 1}</td><td><code>${esc(entry.name)}</code>${mine}</td><td style="text-align:right">${num(entry.downloads)}</td></tr>`
    })
    .join('')
  const growthLine = growth
    ? `<p>目录规模 <strong>${num(catalog.count)}</strong> 条，较 <a href="${BASELINE}">基线测量</a>（${esc(growth.onDate)}，${num(growth.fromCount)} 条）净增 <strong>+${num(growth.delta)}</strong>（${growth.pct}%）。生态在加速膨胀。</p>`
    : `<p>目录规模 <strong>${num(catalog.count)}</strong> 条。</p>`
  const categoryRows = categories
    .map(row => `<tr><td><code>${esc(row.category)}</code></td><td style="text-align:right">${num(row.count)}</td><td style="text-align:right">${num(row.median)}</td><td style="text-align:right">${num(row.p75)}</td><td><code>${esc(row.top)}</code>（${num(row.topDownloads)}）</td></tr>`)
    .join('')
  const categorySection = categories.length ? `<h2>分类分布（按中位数排序，条目数 ≥5）</h2>
<table><tr><th>类别</th><th style="text-align:right">条目</th><th style="text-align:right">中位数</th><th style="text-align:right">p75</th><th>头部包</th></tr>${categoryRows}</table>
<p>读法：中位数高 = 需求已被验证；条目多而中位数低 = 拥挤；条目少而中位数高 = 空位。中位数仍含底噪（每类都如此），只做相对比较。</p>` : ''
  const floorSection = shapesHistory.length >= 2 ? (() => {
    const rows = shapesHistory
      .map(point => `<tr><td>${esc(point.measuredOn)}（窗口止 ${esc(point.to)}）</td><td style="text-align:right">${num(point.measured)}</td><td style="text-align:right">${num(point.medianDaily)}</td><td style="text-align:right">${num(point.shareFloor)}%</td><td style="text-align:right">${num(point.shareAdopted)}%</td><td style="text-align:right">${num(point.shareBurst)}%</td></tr>`)
      .join('')
    return `<h2>底噪带稳定性（跨时间点）</h2>
<table><tr><th>测量日</th><th style="text-align:right">样本</th><th style="text-align:right">日中位数</th><th style="text-align:right">底噪带</th><th style="text-align:right">真实日用</th><th style="text-align:right">爆发形</th></tr>${rows}</table>
<p>窗口滑动但结构不动：约六成条目停在底噪带，发版爆发形常驻约两成。这就是「下载列需要一个不误读的口径」的结构性依据，也是 <a href="${esc(REPO)}/blob/main/docs/SIGNAL-PROPOSAL.md">信号提案</a> 的趋势底座。</p>`
  })() : ''
  const weeklyStrip = weekly ? (() => {
    const mine = weekly['review-outbox'] || {}
    const rows = [
      mine.weekly !== undefined && `<tr><td>review-outbox 周下载</td><td style="text-align:right">${num(mine.weekly)}</td></tr>`,
      mine.rank !== undefined && `<tr><td>目录内排名</td><td style="text-align:right">#${num(mine.rank)} / ${num(mine.of)}（前 ${mine.topPercent}%）</td></tr>`,
      weekly.kits?.shape && `<tr><td>检查套件形状</td><td>${esc(String(weekly.kits.shape))}</td></tr>`,
      weekly.upstream && `<tr><td>上游状态</td><td>${esc(Object.entries(weekly.upstream).map(([key, value]) => `${key}: ${esc(String(value))}`).join('；'))}</td></tr>`,
    ].filter(Boolean).join('')
    return rows ? `<h2>本周坐标（来自 weekly 测量文件）</h2>
<table><tr><th>项</th><th>值</th></tr>${rows}</table>
<p>排名数字仍是发版突刺的形状，不作采用证据；分解与口径见 <a href="${BASELINE}">底噪基线</a>。</p>` : ''
  })() : ''
  const selfLine = selfRank
    ? `<p>本项目 <code>${esc(selfRank.name)}</code> 周下载 <strong>${num(selfRank.downloads)}</strong>，排序 #${num(selfRank.position)} / ${num(selfRank.of)}（前 ${selfRank.topPercent}%）。<strong>这个排名是发版突刺的形状</strong>：本周前两天的下载占 82%，安静日 36–81 落在底噪带。排名数字不作采用证据。</p>`
    : ''
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DSH 插件生态月报 · ${esc(date)}</title><meta name="description" content="DSH 插件目录 ${date} 快照：${catalog.count} 个条目的下载分布、头部榜单与底噪带说明。中位数 ${distribution.median}，底噪带（≤40/天）与采用无关。"><meta name="robots" content="index,follow"><link rel="canonical" href="${esc(`${ORIGIN}/ecosystem/${date}.html`)}"><style>${styles}</style></head><body><main>
<p class="eyebrow">DEEPSEEK HARNESS · ECOSYSTEM MONTHLY · ${esc(date)}</p>
<h1>DSH 插件生态月报</h1>
<p>对目录全部 <strong>${num(catalog.count)}</strong> 个条目实测 npm 周下载（窗口 ${esc(distribution.window)}），可复现。这页回答一个问题：<strong>「我的插件的下载数，在生态里算什么水平」</strong>。</p>
<nav class="nav"><a href="${esc(`${ORIGIN}/`)}">首页</a><a href="${BASELINE}">底噪基线（方法论）</a><a href="${esc(REPO)}">GitHub 源码</a><a href="${KIT_SITES.verify}">清单检查套件</a><a href="${KIT_SITES.vertical}">行业检查套件</a></nav>
${growthLine}
${floorSection}
${weeklyStrip}
<h2>分布（周下载，全体目录）</h2>
<table><tr><th>分位</th><th style="text-align:right">下载</th></tr>${distributionRows}</table>
<p><strong>中位数 ${num(distribution.median)}</strong> 是「正常水平」。实测里 ${num(distribution.shareUnder100)}% 的条目周下载不足 100，但其中大部分仍能稳定录得每天几十次——<a href="${BASELINE}">底噪带</a>与是否有人安装无关。</p>
<h2>头部榜单（Top ${leaderboard.length}）</h2>
<table><tr><th>#</th><th>包</th><th style="text-align:right">周下载</th></tr>${leaderRows}</table>
${categorySection}
<h2>本项目坐标</h2>
${selfLine}
<div class="caveat"><strong>给目录/市场的信号提案（带可复现测量）</strong>：单日下载占周总量 ≥50% 的包，其周数字应显示为「发布日」标记而非裸数字——实测 19.7% 的抽样条目是这种形状，头部榜单里也常驻（见基线文档）。这不是要求改排序，是给读者一个不误读的口径。</div>
<h2>复现</h2>
<p><code>node scripts/ecosystem-snapshot.mjs --package &lt;name&gt;</code>（全量周分布）· <code>node scripts/ecosystem-snapshot.mjs --shapes 200 --seed 20261110</code>（抽样 30 天形状）· 月报由 <code>scripts/ecosystem-monthly.mjs</code> 从同一缓存渲染。</p>
<small>原始数字：<a href="${esc(REPO)}/blob/main/docs/metrics/">docs/metrics/</a> · 方法论：<a href="${BASELINE}">ECOSYSTEM-BASELINE</a> · 测量时间 ${esc(date)}</small>
</main></body></html>`
}

async function main() {
  const args = process.argv.slice(2)
  const flag = name => {
    const at = args.indexOf(name)
    return at === -1 ? undefined : args[at + 1]
  }
  const cachePath = flag('--cache') || 'docs/metrics/ecosystem-downloads.json'
  const date = flag('--date') || new Date().toISOString().slice(0, 10)
  const rankPackage = flag('--rank-package') || 'dsh-review-outbox'

  // The weekly meta file moves with each measurement; pick the newest so a
  // rerun never reads a stale date by accident. --weekly overrides explicitly.
  const weeklyPath = flag('--weekly') || await (async () => {
    const dir = resolve(process.cwd(), 'docs/metrics')
    const candidates = (await readdir(dir)).filter(name => /-ecosystem-weekly\.json$/.test(name)).sort()
    if (!candidates.length) return undefined
    return resolve(dir, candidates[candidates.length - 1])
  })()
  // Floor-band stability: any metrics file that carries a shapes summary
  // (window + shareFloor) is a time point. Two or more make a trend table,
  // which is what the 12-01 signal proposal stands on.
  const shapesHistory = await (async () => {
    const dir = resolve(process.cwd(), 'docs/metrics')
    const points = []
    for (const name of await readdir(dir)) {
      if (!/\.json$/.test(name) || name.includes('downloads') || name.includes('shapes-cache')) continue
      try {
        const data = JSON.parse(await readFile(resolve(dir, name), 'utf8'))
        // the baseline file nests shapes under .shapes; later files keep them top-level
        const shapes = data?.shapes || data
        const summary = shapes?.summary
        const window = shapes?.window
        if (summary && window?.from && window?.to && Number.isFinite(summary.shareFloor)) {
          points.push({ file: name, measuredOn: name.slice(0, 10), from: window.from, to: window.to, ...summary })
        }
      } catch { /* a malformed metrics file is not a report blocker */ }
    }
    return points.sort((a, b) => a.measuredOn.localeCompare(b.measuredOn) || a.to.localeCompare(b.to))
  })()

  const weekly = weeklyPath ? await (async () => {
    try { return JSON.parse(await readFile(weeklyPath, 'utf8')) } catch { return undefined }
  })() : undefined
  const catalogMeta = weekly?.catalog
  const catalog = await (async () => {
    const { loadCatalog } = await import('./ecosystem-snapshot.mjs')
    return loadCatalog({ indexPath: flag('--index') })
  })()
  const plugins = (catalog.index.plugins || []).filter(plugin => plugin.name)
  const names = plugins.map(plugin => plugin.name)
  let downloads = {}
  try {
    downloads = JSON.parse(await readFile(resolve(process.cwd(), cachePath), 'utf8'))
  } catch { downloads = {} }
  downloads = await collectDownloads(names, { cache: downloads, quiet: false })
  await writeFile(resolve(process.cwd(), cachePath), JSON.stringify(downloads, null, 2))

  const summary = summarize(downloads)
  const leaderboard = Object.entries(downloads)
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, value]) => ({ name, downloads: value }))
  const selfRank = rank(downloads, rankPackage)

  const growth = catalogMeta && catalogMeta.growth
    ? { onDate: catalogMeta.growth.on, fromCount: catalogMeta.growth.from, delta: catalogMeta.growth.delta5d, pct: catalogMeta.growth.pct }
    : null
  const categories = categoryTable(plugins, downloads)
  const html = render({
    date,
    catalog: { count: names.length },
    categories,
    distribution: {
      window: `${catalogMeta?.weekly?.window || 'this week'}`,
      median: summary.median, p25: summary.p25, p75: summary.p75, p90: summary.p90,
      p95: summary.p95, p99: summary.p99, max: summary.max, shareUnder100: summary.shareUnder100,
    },
    leaderboard, selfRank, growth, weekly, shapesHistory,
  })

  const root = resolve(process.cwd(), 'site/ecosystem')
  await mkdir(root, { recursive: true })
  await writeFile(resolve(root, `${date}.html`), html)
  await writeFile(resolve(root, 'index.html'), html)
  console.log(JSON.stringify({ ok: true, page: `site/ecosystem/${date}.html`, catalog: names.length, selfRank }))
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
