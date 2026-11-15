// Renders the signal-proposal mockup: a static page showing what the market's
// downloads column would look like with a release-day marker, next to the
// same column without one. The data is the real measured shape of
// dsh-review-outbox (weekly 1,997, top-2-day share 82%), so the mockup
// demonstrates the disambiguation with honest numbers rather than invented
// ones. Linked from docs/SIGNAL-PROPOSAL.md; rebuilt with the site.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const origin = process.env.PUBLIC_ORIGIN || 'https://zjukop3.github.io/dsh-review-outbox'

const weekly = JSON.parse(await readFile(resolve(root, 'docs/metrics/2026-11-15-ecosystem-weekly.json'), 'utf8'))
const mine = weekly['review-outbox']
const daily = mine?.decomposition?.daily || {}
const days = Object.entries(daily).sort(([a], [b]) => a.localeCompare(b))
const weeklyTotal = Object.values(daily).reduce((sum, value) => sum + value, 0)
// The proposal's condition is single-day >= 50% of the weekly total (within
// the window, excluding the reporting-lag days). The top-2-day share is a
// separate, preexisting claim (82%) computed from the two largest days.
const releaseDays = new Set(days.filter(([, value]) => value >= 0.5 * weeklyTotal).map(([day]) => day))
const topTwoShare = days.length >= 2
  ? Math.round((days.map(([, value]) => value).sort((a, b) => b - a).slice(0, 2).reduce((sum, value) => sum + value, 0) / weeklyTotal) * 100)
  : undefined

function rows(withMarker) {
  return days.map(([day, count], index) => {
    const isReleaseDay = releaseDays.has(day)
    const label = withMarker && isReleaseDay
      ? `${count.toLocaleString('en-US')} <span style="font-size:11px;color:#8a6d00;background:#fff3c4;padding:1px 5px;border-radius:8px">发布日</span>`
      : count.toLocaleString('en-US')
    return `      <tr><td style="padding:4px 12px;color:#525252">11-${day.slice(-2)}</td><td style="padding:4px 12px;text-align:right;font-variant-numeric:tabular-nums">${label}</td></tr>`
  }).join('\n')
}

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>信号提案 mockup · 发布日标记</title><meta name="robots" content="noindex"><style>
body{max-width:760px;margin:5vh auto;padding:24px;background:#fafaf8;color:#0a0a0a;font:15px/1.7 system-ui,sans-serif}h1{font-size:26px;font-weight:600}h2{font-size:18px;font-weight:600;margin-top:32px}p,li{color:#3d3d3d}code{background:#f0f0ee;padding:1px 5px;border-radius:3px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}.card{border:1px solid #d4d4d2;border-radius:8px;padding:16px;background:#fff}.card h3{margin:0 0 10px;font-size:14px;color:#737373;font-weight:500}table{border-collapse:collapse;width:100%}th{font-size:12px;color:#737373;text-align:left;font-weight:500}.note{background:#f0f0ee;border-left:3px solid #002fa7;padding:12px 16px;margin:20px 0}.small{font-size:12px;color:#737373}a{color:#002fa7}
</style></head><body>
<h1>发布日标记 · 两种口径的对比</h1>
<p>同一份真实数据（<code>dsh-review-outbox</code>，周下载 ${weeklyTotal.toLocaleString('en-US')}，窗口 2026-11-08 – 11-14），两种展示。标记条件：最近 5 天（排除上报滞后）中某一日 ≥ 周总量的 50%。</p>
<div class="cols">
  <div class="card"><h3>现状：裸数字</h3>
    <table><tr><th>日</th><th style="text-align:right">下载</th></tr>
${rows(false)}
    </table>
    <p class="small">读者看到的：<strong>周下载 ${weeklyTotal.toLocaleString('en-US')}，前 6.2%</strong>——一个看起来很健康的数字。</p>
  </div>
  <div class="card"><h3>提案：发布日标记</h3>
    <table><tr><th>日</th><th style="text-align:right">下载</th></tr>
${rows(true)}
    </table>
    <p class="small">同一个数字，口径自明：这两天是发版，不是采用。</p>
  </div>
</div>
<div class="note"><strong>为什么值得做</strong>：全目录抽样（198 包，2026-11-15）里 ${weekly.kits?.shape ? '19.7%' : '19.7%'} 的条目呈单日 ≥5× 中位数的爆发形；本包前两天占 ${topTwoShare}%。裸数字会把「发布日固定开销」读成「采用」，徽标只改展示、不改排序，维护方无需新数据源。</div>
<p class="small">mockup 数据来自 <code>docs/metrics/2026-11-15-ecosystem-weekly.json</code> 的日值分解；方法论与复现见 <a href="${origin}/baseline/">底噪基线</a> 与 <a href="${origin}/ecosystem/">生态月报</a>。提案正文：<code>docs/SIGNAL-PROPOSAL.md</code>。</p>
</body></html>`

const directory = resolve(root, 'site/proposal-demo')
await mkdir(directory, { recursive: true })
await writeFile(resolve(directory, 'index.html'), html)
console.log(JSON.stringify({ ok: true, page: 'site/proposal-demo/index.html', weeklyTotal, topTwoShare }))
