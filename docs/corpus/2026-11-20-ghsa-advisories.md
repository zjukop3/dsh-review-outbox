# 真语料：三个检查第一次吃真实第三方文档

2026-11-20，用来校准 `dsh-security-advisory-check`、`dsh-migration-guide-check`、
`dsh-privacy-notice-check` 三处的默认口径与词表。这是它们第一次吃到真实第三方语料——
此前只有自己写的 fixture。

## 取样与方法

- 来源：`GET https://api.github.com/advisories?per_page=20&direction=desc`（公开接口）
- 只取 API 里字段化的事实，按公告的写法拼成一份文档：标题、公告编号、CVE、严重程度、
  受影响版本（`vulnerable_version_range`）、修复版本（`patched_versions`）、披露日期，
  正文用真实的 `description` markdown 原文。
- 拼装方式是刻意的：任何一条发现都只能来自措辞或结构，不能来自「我没给信息」。

跑法：`/tmp/corpus/probe-advisory.mjs`（一次性脚本，逻辑就是上面这段）。

## 第一次跑的结果

```
1/20 零发现
  18× workaround-missing
  15× contact-missing
  13× fixed-missing
```

三件事浮出来：

1. **20 条里 20 条没有 `patched_versions`**。也就是说这 20 条真实公告全部处于「尚未
   发布修复版本」的状态。规则只报了 13 条，另外 7 条被正文里的散文（"fixed in …"式
   说法）放过了——那 7 条其实是有答案的，规则静默是对的。
2. `contact-missing` 15/20、`workaround-missing` 18/20。**一条在大多数合法文档上都
   开火的警告不是信号，是噪音**：它会训练读者忽略所有 warn。
3. `fixed-missing` 那 13 条是真缺陷吗？是。文档里既没有修复版本，也没说「暂无修复」，
   读者无法区分「还没修」和「作者漏写」。但把这条**当成「必须有修复版本」来报**是错的
   ——未修复的公告是合法文档，缺的是那句说明。

## 改了什么

| 规则 | 改前 | 改后 |
| --- | --- | --- |
| `fixed-missing` | 没有修复版本号 → error | 既没有修复版本、也没写「暂无可用修复」→ error |
| `workaround-missing` | 默认 warn（`--require-workaround` 升级为 error） | **默认不查**，`--check-workaround` 打开 |
| `contact-missing` | 默认 warn | **默认不查**，`--check-contact` 打开 |

`--require-workaround` 作为旧参数名保留，避免 0.1.1 的调用方失效。

## 改完再跑

```
7/20 零发现
  13× fixed-missing
```

13 条全部是「没写有没有修复」这一个真问题，没有噪音项。7 条零发现里包括正文自己写了
修复信息的公告。这个分布可以直接写进 README 当承诺，因为它是量出来的。

## 教训

> 一条规则该不该默认开，取决于它在**真实合法文档**上的开火率，不取决于它在坏样例上
> 能不能响。开火率接近 1 的 warn，等价于没有这条 warn，还外加教人忽略警告的副作用。

顺带发现：`checks-data.mjs` 里 `dsh-handover-check` 与 `dsh-expense-claim-check` 的
示例输出早已和真实运行不一致（前几轮改了提示文案却没刷新）。已加
`scripts/sync-example-output.mjs`，按行重写每个条目的 `output`，并挂进 `npm run check`
——示例输出与真实运行的关系，现在是一条闸，不是一次手工同步。
## 第二批：迁移指南与隐私声明

`raw.githubusercontent.com` 这轮连续被重置，改走 GitHub contents API（`gh api … --jq .content | base64 -d`）。

| 文档 | 校准前 | 校准后 |
| --- | --- | --- |
| Vite `docs/guide/migration.md` | 2 error（breaking、steps） | 0 error、1 warn（steps） |
| TanStack Query「Migrating to v5」 | 3 error（title、from-to、steps） | 0 error、1 warn（steps） |
| GitHub General Privacy Statement | 1 error（title） | 零发现 |
| GitHub Candidate Privacy Notice | 3 error（title、data、sharing） | 零发现 |
| GitHub Cookies 政策 | 6 error | 仍在报——正确，它不是隐私声明 |

### 每一处改动都对应一个真实写法

- **frontmatter 的 `title:` 也算标题**。GitHub 三份政策与 TanStack 的指南都是这个形状；
  只认 `# ` 会把它们全部判成「没有标题」。
- **隐私的词表**：`Personal Data that We Process`、`How and Why We Disclose Personal Data`、
  `subprocessor`。原来的词表只认「收集/共享/第三方」。
- **迁移的版本**：标题写「Migrating to v5」算数——只写目标版本是真实存在的一类指南。
  但**只有版本号、没有迁移字样**（「版本说明 0.2.0」）仍然不算，那是发布说明。
- **变更清单**：整篇就是变更清单的指南（Vite）没有一节叫「破坏性变更」。判据改成
  「至少三节在讲变更」（Removed…、Renamed…、Now uses…）。
- **恢复类三问只对流程型指南有意义**：验证、回滚、备份这三条在不加条件时，在 100% 的
  真实指南上都开火。判据改成「有没有编号步骤」——真的要动手改东西的指南才问怎么收场。

### 又一次「量拼写不量属性」

改的过程中踩了两个自身缺陷，都属同一族：

1. 我用 `\A` 当正则锚点。JS 没有这个锚点，它被当成字面量 `A`，正则静默失配——
   第一次修完「frontmatter 标题」还是判红，原因是这一处。
2. rules audit 第三次漏算：`add(requireSteps ? 'error' : 'warn', 'steps-missing', …)`
   既不匹配字面量级别模式，也不匹配「标识符级别」模式，规则从 194 条里消失。
   判据现在改成「第一参数不是单个字符串字面量」。

## 第三批：真实 ADR（npryce/adr-tools）

五份 `doc/adr/*.md`，Nygard 模板。第一次跑：**0/5 零发现**，`status-missing` 5 次、
`alternatives-missing` 5 次。

两个都是误报，而且都很直白：

- `status-missing`：规则只认行内 `Status: accepted`，而 Nygard 模板把状态写成
  `## Status` 下面的一行——**这门实践本来的模板**，五份全是这样。补 `statusOf()`：
  行内、状态一节都认；取值不认识时仍 warn。
- `alternatives-missing`：原来默认 true，但 Nygard 原始模板没有「备选方案」这一节。
  100% 开火的 warn 是噪音 → 改为默认不查，`--require-alternatives` 打开。

校准后：**4/5 零发现**，第 5 份只 warn `consequences-unlabelled`（它的后果确实是没标注的
散文，属于该提示的那一类）。0.2.2 发布后从 registry 装出来跑：

```
$ adr-check 0001-record-architecture-decisions.md
ok: 0 consequences, 0 errors, 0 warnings      (exit 0)
```

## 第四批：真实 postmortem（alantech/iasql ×3、ogx-ai/ogx ×1）

第一次跑：**0/4 零发现**，`action-no-owner` 18 次、`timeline-entry-untimed` 17 次、
`impact-missing` 4 次。全部是我只认一种写法。

| 真实写法 | 我原来的假设 | 改法 |
| --- | --- | --- |
| 时间线是**表格** `| Time (UTC) | Event |` | 只认列表项 | 表头与分隔行跳过，数据行按第一格取时间 |
| 时间只写**日期**（`**2023-01-08**`） | 必须是 `HH:MM` | 日期本身就是时间 |
| 行动项是**表格** `| # | Action | Owner | Status |` | 只认「负责人：/@名字」 | 从表头记住 Owner 列号，再按列判 |
| 后续一节叫 **Prevention**、内容是散文 | 必须叫「行动项」 | 有段但列不出条目 → warn `actions-unlisted` |
| **Lessons Learned** 用列表写 | 一律当行动项 | 教训不是行动项（曾把 ogx 三条教训报成没负责人） |
| 影响写在 **Summary** 里 | 必须有一节叫 Impact | Summary 也算影响陈述 |

校准后：ogx 零发现；003 两条 warn；001 与 005 共 10 条 `action-no-owner` 是**真发现**
——它们的 Prevention 条目确实没有负责人。0.1.2 发布后从 registry 装出来跑：

```
$ incident-report-check ogx-search-indexing.md
ok: 8 timeline entries, 5 follow-ups, 0 errors, 0 warnings      (exit 0)
```

`8 timeline entries` 与 `5 follow-ups` 这两个数字就是表格解析生效的证据。

## 第五批：真实 runbook（5 份）

语料：`DevLoversTeam/devlovers.net`、`jayminwest/mulch`、`jayminwest/seeds`、
`monoscope-tech/timefusion`、`zoom/skills`。第一次跑 **0/4 零发现**，四处误报：

| 真实写法 | 我的假设 | 改法 |
| --- | --- | --- |
| `## Pre-flight`、`## Required configuration`、`## Safety rules` | 必须叫「前置条件」 | 前置显式枚举这些真实叫法 |
| `## Post-release sanity`、`## Quick Probes`、`## Health check` | 必须叫「验证」 | 验证同上 |
| 「4. 备份 WAL 目录 / 5. `rm -rf` WAL 目录」 | 警示必须**同一行** | 相邻步骤一起看：备份在上一句就是警示 |
| `Rolling back from a newer version…` 这类散文 | 必须有一节叫「回滚」 | 散文也算 |
| zoom 的 5 分钟 preflight 没有回滚 | 一律要求回滚 | 只在有部署/迁移命令的 runbook 上要求 |

校准后：**4/6 零发现**（第 5 份只 warn `shell-unspecified`，属合理；第 6 份是抓取失败的
空文件）。0.2.2 从 registry 装出来实测：

```
$ ops-runbook-check timefusion.md
ok: 20 steps, 0 errors, 0 warnings      (exit 0)
$ ops-runbook-check mulch.md
ok: 31 steps, 0 errors, 0 warnings      (exit 0)
$ ops-runbook-check zoom.md
ok: 12 steps, 0 errors, 1 warnings      (exit 0)   # shell-unspecified
```

## 第六批：真实规格（3 份 Kubernetes KEP）

语料：`keps/sig-node` 下的 `135-seccomp`、`127-user-namespaces`、
`1547-building-kubelet-without-docker`。第一次跑 **0/3 零发现**，3/3 报
`criteria-missing`。

成因单一：整个 KEP 流程把验收标准写成 `### Test Plan` 与
`### Graduation Criteria`，而我只认「验收标准 / acceptance criteria /
definition of done」。补上这两个真实叫法后：

| 文档 | 结果 |
| --- | --- |
| 1547 | 零发现 |
| 135 | 0 error，1 warn `criteria-thin`（验收标准是散文段落，不是可枚举列表）|
| 127 | 0 error，1 warn 同上 |

那两条 warn 是准确的：KEP 的 Test Plan 确实是散文。规则没白写，只是词表少了两个词。

## 第七批：真实 API 文档（3 份）

语料：`lablup/all-smi`（99KB，本机 unix socket API）、`audreyt/ethercalc`、`anylyralabs/LogShare`。
`github/docs` 的 REST 文档是 OpenAPI 生成的空壳（800 字节），`discord/discord-api-docs`
与 `go-gitea/gitea` 的目标路径这轮都取不到，所以样本只有 3 份。

第一次跑：**2/3 零发现**，all-smi 报 `auth-missing`。它是监听 unix socket + localhost 的
本机 API，本来就没有鉴权面——问它「怎么证明身份」等于问本机进程怎么证明自己是本机。

两处改动：

| 改动 | 依据 |
| --- | --- |
| 明说「无需鉴权」、或基址只在 localhost/Unix socket → 不算缺失 | all-smi 的真实写法 |
| 裸词 `token` 不再算鉴权说明 | 反向问题：分页文档里到处 `next_page_token`，它证明不了身份 |

校准后 3/3 零发现。0.1.2 发布后 tarball 暂存了一段时间才放出，最终从 registry 装出来跑真实文档：

```
$ api-doc-check all-smi.md
ok: 5 endpoints, 27 examples, 0 errors, 0 warnings      (exit 0)
```

（先写下的是「未取到 tarball、未验证」，几分钟后产物放出来补验了——这行按实际结果改，
不留那个错误的版本。）

## 结论（八批语料合起来）

> 一个规则的默认档位与词表，应该由它在**真实合法文档**上的表现决定。
> 三条实测：公告类 90%/75% 的 warn 是噪音 → 改按需；指南类恢复三问 100% 开火 → 改按类型；
> 隐私类三份真实政策被错判 → 改词表。三次都不是「我觉得」，是数字。
