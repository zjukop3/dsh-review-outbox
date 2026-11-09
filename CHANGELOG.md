# Changelog

All notable changes to Review Outbox are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/); versions are `0.1.x` while the plugin is in validation.

## [Unreleased] — 0.1.7

- One-at-a-time review (逐项审阅): the list collapses into a progress strip (`第 3 / 40 项待审`) and each decision moves to the artifact that took that slot, so a 75-item backlog becomes a countable task instead of a wall. The status tabs stay put while the flow is on, and 退出逐项 brings the full list back with nothing hidden.
- The strip shows 上一项 / 下一项 buttons alongside the same `a` / `r` / `z` keys, and reports 待审队列已清空 when the queue drains.
- `scripts/seed-fixture-state.mjs` writes a synthetic state matching one real daily profile (75 artifacts, 10 sessions, 8 extensions) so the panel can be driven in an isolated Profile without a real backlog.
- Held back from npm on purpose: 0.1.6 is the published version, and this entry is promoted to `0.1.7` together with the publish, inside the 12:00-12:40 window documented in the operations handbook. Publishing now would leave the catalog card and the resolvable version disagreeing for about a day.

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
