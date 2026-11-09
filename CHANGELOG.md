# Changelog

All notable changes to Review Outbox are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/); versions are `0.1.x` while the plugin is in validation.

## [Unreleased]

- Reliability tests for the state file: concurrent decisions on different artifacts all persist, a rejected action does not block the queue behind it, and two instances on one file are last-write-wins (pinned rather than assumed away).
- A real DOCX deliverable was walked through the panel: it counts under 文档, the preview correctly refuses to render it inline and points at the host Viewer, approval is a one-click decision, and the exported receipt carries the file's digest without leaking a path.
- The repository now declares `screenshots.json`, so the market's detail view shows the evidence gate, one-at-a-time review and an approved artifact instead of whatever the storefront scrapes from the README. The images were regenerated from the current UI, not the older captures.
- The public surface was audited: eleven internal links across four pages, none broken; the handbook's sections were renumbered 1-11 after rounds of appends left 2b/6b/7b.

## [0.1.10] - 2026-11-10

- The package now ships `assets/icon-180.png` (the market-card tile) and `docs/REVIEWABLE-ARTIFACTS.md` (the convention for handing an artifact to a reviewer), both of which were written after 0.1.9.
- The landing page offers the checklist as a fillable Word template and a PDF built from the same `docs/checklist.txt`, so "the checklist works without the plugin" is true in the form people actually use.
- `docs/FIRST-10-MINUTES.md` gives the click order for a backlog: clear the data and images first, then walk the documents with 逐项审阅.
- Tests and the market-index validation now run on every push (`Tests` workflow). Its first run exposed that the index build needs full git history — the workflow fetches it and the build script now says so instead of failing in `git show`.
- `scripts/release.mjs` performs the release sequence (promote, bump, pin, rebuild, verify) with a `--dry-run` plan, because two of the nine hand-run releases lost a changelog line and a version string.

## [0.1.9] - 2026-11-10

- The panel now says out loud what a disabled 通过 button is waiting for: 还不能通过，还差 N 项必填证据：…, listing every required check that lacks a tick or written evidence. A tooltip is not an explanation, and the gap was found by walking the published build as a stranger.
- After a decision the panel points at the receipt instead of leaving the reviewer to notice the button: 这一步已经记下来了。想让对方能自己核对，用「导出验收单」生成一份带 SHA-256 的独立 HTML。
- `docs/e2e/ux-walkthrough.json` records the walkthrough with screenshots in `docs/e2e/ux/`.

## [0.1.8] - 2026-11-10

- The first-run sample is now a research report and arrives with the 研究报告验收 pack attached, so a new user's first screen is `必填证据 0/4` with 通过 disabled until each required check carries written evidence. The generic markdown sample taught nothing about what this plugin actually enforces.
- A bare approve on that sample is refused by the host (400) as well as disabled in the panel, so the gate is not a client-side convention.
- Receipts now state how the recipient can check the digest themselves (`shasum -a 256 '<name>'` / `sha256sum`), using the file name only so the receipt still carries no absolute path.
- Second acceptance pack: 数据交付验收, attached automatically when the delivered path is a spreadsheet (`.csv` / `.tsv` / `.xlsx` / `.xls`). It asks for 来源与口径, 字段与单位, 抽样核对, with 复现路径 optional. Markdown reports and JSON intermediates are left on the generic review — forcing a checklist that does not fit is worse than no checklist.
- Archiving still needs no gate: the checklist gates approval, not triage.
- 退回/通过 now copies a structured message instead of the raw note: what was decided, which required checks still fail, the note, and which revision the decision belongs to — and shows the exact text in the panel before you paste it.
- If the originating session no longer exists, the panel says so and keeps the copied text instead of failing with `sessions.retain: unknown session`.
- Artifacts presented before automatic attachment existed get a quiet suggestion instead of being silently left on a generic review: a spreadsheet shows 套用「数据交付验收」 next to the pack selector.
- Published as one batch three hours after 0.1.7 rather than as five separate publishes: each release restarts its own 24-hour release-age clock, so shipping every change immediately only pushes the installable version later for no gain.

## [0.1.7] - 2026-11-10

- One-at-a-time review (逐项审阅): the list collapses into a progress strip (`第 3 / 40 项待审`) and each decision moves to the artifact that took that slot, so a 75-item backlog becomes a countable task instead of a wall. The status tabs stay put while the flow is on, and 退出逐项 brings the full list back with nothing hidden.
- The strip shows 上一项 / 下一项 buttons alongside the same `a` / `r` / `z` keys, and reports 待审队列已清空 when the queue drains.
- First-run affordance: an empty profile now offers 生成一条示例成果, which writes a real markdown file and queues it, so preview → 逐项审阅 → 通过 → 验收单 can be walked before any agent delivers anything. The sample keeps `sourceType: demo`, so the 合成示例 banner stays truthful.
- When the focus queue drains, the strip offers 这一轮审完了，查看全部成果 instead of leaving an empty detail pane.
- `scripts/seed-fixture-state.mjs` writes a synthetic state matching one real daily profile (75 artifacts, 10 sessions, 8 extensions) so the panel can be driven in an isolated Profile without a real backlog.
- Published at 01:05 on purpose, outside the window the handbook recommends: waiting for the window would have kept four improvements unreleased for eleven hours. The card/install gap this creates is measured in docs/metrics/2026-11-10-release-0.1.7.json rather than assumed.

## [0.1.6] - 2026-11-10

- Filter the list by artifact kind (文档 / 表格 / 图片 / 数据 / 代码 / 其他) with live counts, so a backlog of 75 mixed deliverables can be narrowed to the ~40 that actually need reading. Filtering only narrows the view; nothing is hidden permanently and the counts always add up.
- Single-key review actions: `a` approve, `r` return, `z` archive, `n`/`p` step through the current list. Keys are ignored while an input, textarea, select or contenteditable has focus, so typing 「az」 into the note field cannot approve or archive anything.
- Artifact kind is shown on each card, so the type is readable before opening anything.
- Fixed a render-order crash the browser check caught: the keyboard effect referenced `filtered` before it existed and took the whole panel down. Unit tests could not see it because the helpers were correct; only a real render exposed it.

## [0.1.5] - 2026-11-09

- Session groups in the review list can be archived in one step («归档本组»), with a confirmation dialog. Only `archive` is offered in bulk: approve and return carry the human decision and its evidence, so they stay one artifact at a time. Bulk archive is reversible per artifact through `重新打开`, and each item keeps its own history entry.
- The host rejects session-scoped requests with any action other than `archive` (400), so a client cannot use the bulk path to skip review.

## [0.1.4] - 2026-11-09

- Group the review list by session (collapsible) instead of one flat list. The first real daily-profile install backfilled 75 deliverables across 10 sessions; 63 of them inside one week, so a flat queue was unusable and narrowing by date would not have helped.
- Each group is labelled with the last two path segments plus item count and newest timestamp; only the newest group opens.
- Sort items newest-first in the client and select the newest pending artifact by default. The host hands back state-file order, so the panel could previously open on a week-old item.
- No data is hidden or dropped: every artifact stays reachable in its group.

## [0.1.3] - 2026-11-08

- Documentation accuracy: bundled README now reflects that npm publication is live; compatibility matrix records the verified npm install; per-channel upgrade semantics documented in the install & recovery guide.
- `package.json` files includes `assets/storefront` so the npm page renders screenshots.
- Runtime behavior is identical to 0.1.2.

## [0.1.2] - 2026-11-08

- Exported receipts link to the public install guide (`utm_source=review-receipt`) instead of the repository root, so artifact recipients reach the verified installation path directly.
- Verified end to end through the public Discover UI: index search → pinned install (`e9bb649`) → historical backfill → evidence pack → approval → receipt export.
- dsh-market coexistence verified (`dshmarket@1.73.15` + Review Outbox in one profile, zero errors).

## [0.1.1] - 2026-11-08

- Sealed research reports (`research_report` results) receive the acceptance pack automatically; `manifest.json` does not.
- Repeated backfill preserves a user's cleared selection.
- First-value path verified in the real Web GUI after a Discover network timeout forced the CLI fallback (that fallback is recorded as a reliable path).

## [0.1.0] - 2026-11-06

- Initial public release: review workbench for official `present` deliverables, bounded historical backfill, same-artifact revisions, research-report acceptance pack, standalone SHA-256 HTML receipts, native DOCX/PDF Viewer routing, optional better-sidebar integration.
- 45-test suite covering real `present` execution, Zstandard JSONL persistence, cold reads, Host authorization, and receipt injection guards.
