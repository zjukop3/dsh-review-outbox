# 插件目录收录准备

目标目录：[Awesome DSH Plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。这是长期可搜索的插件生态入口，不以维护者持续发帖为前提。

## 规则核对

依据上游 `contributing.md` 与 PR 模板：

| 条件 | Review Outbox 状态 |
|---|---|
| `package.json` 声明 `dsh.bundle`，并提供 `cordis.patch.yml` | 已满足 |
| 真实可安装、可运行代码 | 已通过 tarball、公开克隆与真实 DSH 验证 |
| `dsh-plugin` topic | 已设置 |
| 单 PR 一个 `data/plugins/<owner>__<repo>.yml` | 已在独立上游克隆中准备 |
| 仓库创建满 1 天 | 创建时间 `2026-11-06T14:39:31Z`；资格时刻 `2026-11-07T14:39:31Z`，即北京时间 `2026-11-07 22:39:31` |
| 描述准确、无夸张营销词 | 按实际 Host/Client、验收包、Viewer 与验收单能力撰写 |

上游克隆基线：`7843a1ac2de8332ffad16f54982ac07de564594d`。用户已明确授权在年龄门槛满足后提交一次目录 PR；一次性任务 `schedule-3d2919eb-8885-4cda-a9b2-644448683a1f` 已于北京时间 `2026-11-07 22:45` 后重新检查规则并完成一次提交，没有重复创建 PR。

公开 GitHub URL 直装已补做真实验证：`dsh plugin --profile web add https://github.com/zjukop3/dsh-review-outbox` 在全新 Profile 中解析到公开提交 `ac8246501e5009a8323b33ab39559bce191671ee`，历史回填、文本预览与原生侧栏全部通过，见 [github-source-install.json](e2e/github-source-install.json)。这覆盖目录用户实际会走的源码安装路径，不只是 tarball 安装。

## 条目草案

上游目标路径：`data/plugins/zjukop3__dsh-review-outbox.yml`。本仓库在 `docs/catalog/zjukop3__dsh-review-outbox.yml` 保留同内容草案，避免临时上游克隆清理后丢失。

```yaml
url: https://github.com/zjukop3/dsh-review-outbox
name: zjukop3/dsh-review-outbox
category: workflow
description:
  en: 'Human review for DSH deliverables: research-report evidence checklists, same-artifact revision history, native DOCX/PDF viewing, approval/return/archive workflows, and standalone SHA-256 HTML receipts.'
  zh: 'DSH 成果人工审阅台：研究报告证据清单、同一成果 revision 历史、宿主 DOCX/PDF Viewer、通过/退回/归档流程，以及带 SHA-256 的独立 HTML 验收单。'
```

当前 Pages 下载链接不写入 `tarball:`：上游只接受 GitHub Release 托管的 `.tgz`。GitHub Release 发布前保留该字段缺省，避免把不可接受的链接塞入目录。

## 与相邻条目的差异

目录已有交付回执和任务验收项目。Review Outbox 的条目只声明已验证的差异：

- 研究报告必填证据检查，勾选与证据文本同时存在才允许通过。
- 同一路径跨真实 `callId` 的 revision 与迟到旧事件防护。
- 恢复来源 Session 后调用官方 DOCX/PDF Viewer。
- 无脚本、无外部资源、带 SHA-256 和审阅后变化提示的独立 HTML 验收单。

它不泛化为任务看板、自动事实核查或通用完成闸门。

## 市场截图

根目录 `screenshots.json` 按上游约定声明两张相对路径 PNG：

1. `assets/storefront/review-workbench.png`
2. `assets/storefront/research-receipt.png`

截图来自全新隔离 Profile、官方 `present` 和合成研究样例。`scripts/capture-storefront.mjs` 完成四项真实证据保存、通过和验收单导出后截图；图片不包含日常会话。测试校验路径边界、PNG 签名、尺寸与文件存在性。市场读取 GitHub 仓库中的这些素材，运行 tarball 继续只包含运行所需文件。

重新截图时，在隔离实例中设置 `DSH_E2E_URL`，运行：

```bash
node scripts/capture-storefront.mjs
```

## 本地验收

在独立上游克隆中执行与 PR 相同的主要检查：

```bash
npm ci
node scripts/generate-readme.mjs
node scripts/generate-readme.mjs --check
npx awesome-lint
node --test scripts/added-dates.test.mjs scripts/capabilities.test.mjs scripts/adopt-discussions.test.mjs scripts/entries-path.test.mjs
SKIP_PUBLISH_CHECKS=1 node scripts/build-site.mjs
```

提交门禁在本地只读取条目数据并检查公开仓库，不创建 PR。实际预检结果见 [catalog-preflight.json](e2e/catalog-preflight.json)：

- 双语生成器成功生成 9,301 条目，本插件的中英文行均正确；再次执行 `--check` 为最新状态。
- `awesome-lint` 返回 0；上游大型 README 共报告 237 个既有拼写警告，因此这里只记录退出码，不宣称零警告。
- 上游 added-date、capability、discussion-adoption 和 entry-path 规则测试合计 24/24 通过。
- 站点构建已解析 9,301 个双语条目，随后按上游设计停在“新增条目需要完整历史且已进入提交”的日期推导前置条件。本地只保留一个未提交 YAML，没有为绕过前置条件创建临时提交；完整构建随真实 PR CI 验证。
- 提交门禁检查了 1 个条目，Manifest 等检查通过，唯一失败是仓库当时 `0.4` 天、要求满 1 天；门禁原文明确年龄是唯一失败项。
- 预检后已还原本地生成的两个上游 README，候选变更只剩 `data/plugins/zjukop3__dsh-review-outbox.yml`。

## 已提交目录 PR

一次性任务已于 `2026-11-07T14:45Z` 后执行，最终创建 [Awesome DSH Plugin #13088](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/13088)。

- PR 只新增 `data/plugins/zjukop3__dsh-review-outbox.yml`，6 行新增、0 行删除，未混入其他开发中改动。
- 本地完整构建基线为 `27032187146074a6713ef02d6d7b854710800ff1`；最终候选提交为 `097826b80c6ed5d887d80ecf5549e98041c994fa`。
- 双语生成器覆盖 9,406 个条目，`--check` 为最新状态；`awesome-lint` 返回 0，新增行没有 lint 警告。
- 上游 24/24 规则测试通过，提交门禁 `ok=true`，没有失败或不完整检查。
- 完整站点构建成功：`site built: 9406 rows × 2 locales + sitemap + count badge`。
- [PR check 42399620911](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/actions/runs/42399620911) 已全部通过，耗时 17m50s；后续 [Submission gate 42401151040](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/actions/runs/42401151040) 也已成功，耗时 52s，日志确认检查了本插件且 `all checked entries pass`。
- PR 当前为 `OPEN / CLEAN / MERGEABLE`，尚未合并。合并与收录仍以维护者审核和上游最终状态为准，不把已提交或检查通过等同于已收录、自然流量或真实采用。
