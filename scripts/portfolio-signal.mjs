// Portfolio signal: what the downloads say about all twenty-six packages at once.
//
// The plan's stop condition is "market open + two weeks with no install-side
// signal". That condition cannot be judged without an instrument: a single
// number for one package says nothing, and a number without its publish date
// says less. This reads every package's weekly downloads, its publish date, and
// the days it has been public, then reports the rate rather than the total, and
// labels each package against the measured floor band.
//
//   node scripts/portfolio-signal.mjs [--json]
//
// The floor band is this project's own measurement: across the catalog, ~59-64%
// of packages never leave 20-40 downloads a day, and that band is automation
// (mirror sync, indexers), not people. A package inside the band has no
// install-side signal regardless of the raw number.
//
// Exit codes: 0 read ok, 2 read error.

const PACKAGES = {
  'dsh-review-outbox': '2026-11-08',
  'dsh-hashcheck': '2026-11-10', 'dsh-citelint': '2026-11-10', 'dsh-outline-lint': '2026-11-10',
  'dsh-tablelint': '2026-11-10', 'dsh-numberlint': '2026-11-10',
  'dsh-agreement-check': '2026-11-10', 'dsh-invoice-check': '2026-11-10', 'dsh-listing-check': '2026-11-10',
  'dsh-meeting-notes-check': '2026-11-16', 'dsh-resume-check': '2026-11-16',
  'dsh-release-notes-check': '2026-11-17', 'dsh-weekly-report-check': '2026-11-17',
  'dsh-bug-report-check': '2026-11-17', 'dsh-api-doc-check': '2026-11-17', 'dsh-test-report-check': '2026-11-17',
  'dsh-commit-msg-check': '2026-11-18', 'dsh-dockerfile-check': '2026-11-18', 'dsh-env-example-check': '2026-11-18',
  'dsh-license-check': '2026-11-18', 'dsh-incident-report-check': '2026-11-18', 'dsh-ops-runbook-check': '2026-11-18',
  'dsh-pr-description-check': '2026-11-18', 'dsh-spec-doc-check': '2026-11-18', 'dsh-adr-check': '2026-11-18',
  'dsh-onboarding-check': '2026-11-18',
}

// The measured floor band, in downloads per day.
const FLOOR_LOW = 20
const FLOOR_HIGH = 40
// A publish-day burst is the other shape that is not adoption: a package that
// got its whole week on one day has been indexed, not used.
const BURST_SHARE = 0.5

const args = process.argv.slice(2)
const asJson = args.includes('--json')

const fetchJson = async url => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (response.status === 429) throw new Error('rate limited')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      if (attempt === 3) throw error
      await new Promise(done => setTimeout(done, attempt * 1500))
    }
  }
}

const dayMs = 86400000
const today = new Date()

const rows = []
for (const [name, published] of Object.entries(PACKAGES)) {
  const days = Math.max(1, Math.round((today - new Date(`${published}T00:00:00Z`)) / dayMs))
  let week = null
  let daily = null
  try {
    const point = await fetchJson(`https://api.npmjs.org/downloads/point/last-week/${name}`)
    week = typeof point.downloads === 'number' ? point.downloads : null
  } catch {
    week = null
  }
  try {
    // The range endpoint is rate limited harder; a miss here leaves the shape
    // unknown rather than failing the row.
    const to = new Date(today - 2 * dayMs).toISOString().slice(0, 10)
    const from = new Date(Date.parse(`${to}T00:00:00Z`) - 6 * dayMs).toISOString().slice(0, 10)
    const range = await fetchJson(`https://api.npmjs.org/downloads/range/${from}:${to}/${name}`)
    const values = (range.downloads || []).map(day => day.downloads)
    if (values.length === 7) daily = values
  } catch {
    daily = null
  }
  const indexed = week !== null
  const perDay = indexed ? week / 7 : null
  const peak = daily ? Math.max(...daily) : null
  const peakShare = daily && week ? Math.max(...daily) / daily.reduce((sum, value) => sum + value, 0) : null
  // A week average above the floor is not by itself a signal: a package that
  // peaked early and decayed still averages high. The honest question is what
  // the LAST days look like — if the tail is inside the band, the week average
  // is a memory of the burst, not evidence of use.
  const tail = daily ? daily.slice(-3) : null
  const tailAvg = tail ? Math.round(tail.reduce((sum, value) => sum + value, 0) / tail.length) : null
  let verdict
  if (!indexed) verdict = 'not-indexed'
  else if (peakShare !== null && peakShare >= BURST_SHARE) verdict = 'burst'
  else if (tailAvg !== null && tailAvg <= FLOOR_HIGH) verdict = 'burst-decay'
  else if (tailAvg !== null && tailAvg > FLOOR_HIGH) verdict = 'sustained-above-floor'
  else if (perDay <= FLOOR_HIGH) verdict = 'floor'
  else verdict = 'above-floor-unshaped'
  rows.push({ name, published, days, week, perDay: perDay === null ? null : Math.round(perDay), peak, peakShare: peakShare === null ? null : Math.round(peakShare * 100), tailAvg, verdict })
  await new Promise(done => setTimeout(done, 120))
}

const byVerdict = rows.reduce((counts, row) => ({ ...counts, [row.verdict]: (counts[row.verdict] || 0) + 1 }), {})

// Nine different tools that land on the same tail rate are not nine tools people
// chose between — they are one client fetching all of them. A real audience
// varies per package: the useful ones get more, the niche ones less. So the
// spread across packages is itself evidence, and the coefficient of variation is
// how to state it without hand-waving.
const shaped = rows.filter(row => row.tailAvg !== null && row.days >= 7).map(row => row.tailAvg)
const mean = shaped.length ? shaped.reduce((sum, value) => sum + value, 0) / shaped.length : 0
const variance = shaped.length ? shaped.reduce((sum, value) => sum + (value - mean) ** 2, 0) / shaped.length : 0
const spread = {
  packages: shaped.length,
  meanTail: Math.round(mean),
  coefficientOfVariation: mean ? Number((Math.sqrt(variance) / mean).toFixed(3)) : null,
  values: shaped.slice().sort((a, b) => a - b),
  reading: null,
}
spread.reading = spread.coefficientOfVariation === null
  ? 'not enough shaped packages to compare'
  : spread.coefficientOfVariation < 0.25
    ? `the tail rates across ${spread.packages} different tools sit within ${Math.round(spread.coefficientOfVariation * 100)}% of each other — one automated client rate, not a per-tool audience. Treat "sustained above floor" as automation until the spread widens.`
    : `the tail rates vary by ${Math.round(spread.coefficientOfVariation * 100)}% across ${spread.packages} tools, which is the shape a real audience has: some tools used more than others.`
const summary = {
  generatedAt: new Date().toISOString(),
  packages: rows.length,
  indexed: rows.filter(row => row.verdict !== 'not-indexed').length,
  byVerdict,
  floorBand: `${FLOOR_LOW}-${FLOOR_HIGH} downloads/day`,
  installSideSignal: byVerdict['sustained-above-floor'] || 0,
  spread,
  reading: (byVerdict['sustained-above-floor'] || 0) === 0
    ? `No package has a three-day tail above the floor band. Every indexed package is either in the band, in a publish-day burst, or in the decay that follows one — the automation signature, not adoption. The stop condition is not triggered by downloads.`
    : `${byVerdict['sustained-above-floor']} package(s) hold a three-day tail above the floor band — but read the spread before calling that an audience: ${spread.reading}`
}

if (asJson) {
  process.stdout.write(`${JSON.stringify({ summary, rows }, null, 2)}\n`)
  process.exit(0)
}

const pad = (value, width) => String(value ?? '-').padEnd(width)
process.stdout.write(`# Portfolio signal\n\n`)
process.stdout.write(`checked ${summary.packages} packages, ${summary.indexed} indexed, ${summary.packages - summary.indexed} not yet in the download index\n`)
process.stdout.write(`floor band ${summary.floorBand} · above floor without a burst: ${summary.installSideSignal}\n\n`)
process.stdout.write(`${pad('package', 28)}${pad('days', 5)}${pad('week', 7)}${pad('/day', 6)}${pad('peak', 6)}${pad('peak%', 7)}${pad('tail3', 7)}verdict\n`)
for (const row of rows.sort((a, b) => (b.perDay ?? -1) - (a.perDay ?? -1))) {
  process.stdout.write(`${pad(row.name, 28)}${pad(row.days, 5)}${pad(row.week, 7)}${pad(row.perDay, 6)}${pad(row.peak, 6)}${pad(row.peakShare === null ? '-' : `${row.peakShare}%`, 7)}${pad(row.tailAvg, 7)}${row.verdict}\n`)
}
process.stdout.write(`\ntail spread across ${spread.packages} packages older than a week: mean ${spread.meanTail}/day, CV ${spread.coefficientOfVariation}, values ${spread.values.join(' ')}`)
process.stdout.write(`\n${summary.reading}\n`)