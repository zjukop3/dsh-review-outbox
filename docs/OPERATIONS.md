# DSH 插件发布与收录：实测约束清单

这份文档记录的是**可复现的实测结果**，不是设计意图或文档转述。每一条都附了验证命令，谁都能在本机重跑。写它的原因是：DSH 插件从「写完」到「别人真的能装上」，中间有三段独立管线，任何一段断掉，作者看到的都是「明明发布了却没人装」。

结论先行：**发布成功 ≠ 可安装 ≠ 可被发现**，三者各有各的时间常数。

## 1. 发布到「别人真能装上」有四段时间常数

| 阶段 | 谁负责 | 实测节奏 | 卡住时的表现 |
| --- | --- | --- | --- |
| `npm publish` | 作者 | 自己的动作 | 约 2 分钟处理窗口后可见 |
| **`minimumReleaseAge` 冷却** | DSH 插件安装 | **1440 分钟（24 小时）** | 默认安装解析到**旧版本**，不报错 |
| 镜像同步 | `registry.npmmirror.com` 等国内镜像 | 外部，分钟级到小时级 | 解析到旧版本，或 `ERR_PNPM_NO_MATCHING_VERSION` |
| 目录重建 | `dsh-plugin-catalog` | **每天一次**，约 `04:46Z` 构建 | 市场卡片上的版本落后最多一天 |

**最容易误判的是第二行。** 我们实测到：`0.1.4` 发布于 `2026-11-09T14:42Z`、`0.1.5` 发布于 `15:05Z`，当晚在健康 registry 上执行默认安装，解析结果仍是 `0.1.3`；把冷却改成 0 后立刻变成 `0.1.5`。

```bash
# 默认：解析到 0.1.3（新版本太新，被冷却挡住）
node "$PNPM" add dsh-review-outbox --dir "$X"

# 关掉冷却：解析到 0.1.5
node "$PNPM" add dsh-review-outbox --dir "$Y" --config.minimum-release-age=0
```

这不是镜像故障，也不是目录问题——DSH 自己的代码注释里写明了这件事：

> The installed bundle's manifest version, when declared; pnpm's `minimumReleaseAge` can make it older than the newest release.

冷却值记录在 pnpm 的 `lockfile-verified.jsonl` 策略里（`"minimumReleaseAge":1440`）。同一份策略还带 `tarballUrlBinding`、`resolutionShapeCheck`，是供应链防护的一部分，默认按设计工作。

市场侧怎么看这件事，**已做界面验证**（2026-11-10，`dshmarket@1.73.16`，隔离 Profile 实测）：卡片上写的是目录里的 `v0.1.3`，点「安装 → 确认安装」之后，profile 里落地的是 **`0.1.9`**，耗时 5 秒——也就是**最新发布版，不受冷却限制**。原因是市场按精确版本安装，而精确版本规格会绕过 `minimumReleaseAge`。

所以三条路径的实际行为要分开记：

| 路径 | 拿到的版本 |
| --- | --- |
| 市场一键安装 | 最新发布版（精确版本，绕过冷却） |
| `dsh plugin add <name>`（浮动范围） | 最高**成熟**版本（受冷却） |
| `dsh plugin add <name>@<version>` | 指定版本（绕过冷却） |

`dshmarket` 的 `lib/updates.js` 里另有 `latestMaturityAt` / `nextMaturityAt` 一套判定，用于**更新检查**那条路径；那条路径没有实测，不要与安装混为一谈。

对作者的实际含义：

- **发布后的 24 小时内，不要用「用户装不到新版」去推断哪里坏了**，那是设计。
- 想让某个用户立刻拿到新版，就**显式钉版本**（`pkg@0.1.10`）。但注意 2026-11-10 06:00 的补测：**钉版本只有在 registry 的元数据里已经有这个版本时才有效**。发布 42 分钟后，镜像的 `dist.tarball` 已经能返回 302（文件可取），可元数据里还没有 `0.1.10`，于是 `add pkg@0.1.10` 报 `ERR_PNPM_NO_MATCHING_VERSION`，而裸名解析到的是冷却允许的最高成熟版本 `0.1.3`。也就是说：**发布后约一小时内，两条 CLI 路径都拿不到新版**，这与冷却无关，纯粹是镜像元数据的滞后。
- 市场卡片上的版本来自目录（每天构建），安装解析到的版本来自冷却与 registry，两者最多可以差一天。**看到「卡片是 X、装上是 X-1」不算矛盾。**

实测的目录构建时刻（连续六次）：

```
2026-11-09T04:49:06Z  2026-11-08T04:46:05Z  2026-11-07T21:13:53Z
2026-11-07T04:59:33Z  2026-11-06T04:47:52Z  2026-11-05T04:41:31Z
```

### 把两条时钟合成一条发布规则

冷却按「发布时刻 + 24h」到期，目录按每天固定时刻重建。两者可以对齐：**在目录日构建之前不久发布**，第二天那次构建就正好落在冷却到期之后，卡片与安装版本一致，没有空窗。

以实测的 `04:46Z` 构建估算，发布窗口是**北京时间 12:00–12:40 左右**（即 `04:00Z–04:40Z`）：

- 这个窗口发布 → 次日 `04:46Z` 构建收录，同时冷却已在当天 `04:00Z–04:40Z` 到期 → 用户当天中午就能装到新版。
- 深夜发布（我们多次都是）→ 次日构建先到、冷却还没到期 → 「卡片显示新版、装上是旧版」的空窗最长约一天。

实测样本（`0.1.7`，2026-11-10 01:05 发布，非窗口内）：发布约 4 分钟后 npm 与镜像的 latest 都是 `0.1.7`，但默认安装解析到的仍是 `0.1.3` —— 因为 `0.1.4` 到 `0.1.7` 全部发布在 24 小时窗口内，**最高成熟版本**刚好停在 `0.1.3`；钉版本 `@0.1.7` 则立刻装到。也就是说：发布成功、镜像同步成功、冷却照样让人装到四个版本之前。

判断方法：

```bash
npm view dsh-plugin-catalog time --json --registry=https://registry.npmjs.org | tail -8
npm view dsh-plugin-catalog dist-tags --registry=https://registry.npmjs.org
```

把自己包的发布时间和最近一次目录构建时间对比：落在构建之后的，等下一版；落在 24 小时以内的，等冷却。

## 2. 安装走的是谁的 registry

DSH 的插件安装用的是**应用内置的 pnpm**，registry 来自用户的 npm 配置，不是写死的地址。在作者机器上，`~/.npmrc` 的 `registry=` 就是插件安装真正会请求的地址。

```bash
PNPM='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs'
node "$PNPM" config get registry                       # 继承用户配置
node "$PNPM" config get registry --config.userconfig=/tmp/x/.npmrc   # 可被覆盖
```

这条约束解释的是「镜像故障时的失败形态」，而不是版本选择：

- 镜像整体故障那晚，它对这个包返回 `500 ER_NO_SUCH_TABLE`，抽查 `react` 等无关包同样 500，属于镜像自身故障；
- 那一刻默认安装仍然**成功**，只是装到旧版；显式指定新版本才报 `ERR_PNPM_NO_MATCHING_VERSION`，错误里写明抓取源是 `registry.npmmirror.com`；
- 镜像恢复后，同样的默认命令装到的还是旧版——原因不在镜像，而在上一节的冷却。

结论：**版本落后先查冷却，装不动才查镜像。** 顺序搞反会浪费一整晚。

## 2b. 能不能自动更新，取决于装的时候写下的 spec

装完不是结束：**profile 里记下的版本写法决定了它以后会不会自己动**。三种写法，实测三条结果：

| 装的时候 | profile 里的 spec | 之后 `pnpm update` |
| --- | --- | --- |
| `dsh plugin add <name>` | `^x.y.z` | 会动：冷却过了就升到当时最高成熟版本 |
| `dsh plugin add <name>@<version>` | `x.y.z`（精确） | **永远不动**：精确版本是上限，`update` 也不会越过 |
| 市场一键安装 | `x.y.z`（精确） | 不会随 `pnpm update` 动；要靠市场自己的更新动作改写 spec |

复现（把冷却临时关掉等价于"等它成熟"，不必真等一天）：

```bash
cd "$DSH_HOME/profiles/web"
node "$PNPM" update dsh-review-outbox --config.minimum-release-age=0   # 精确 spec → 仍是旧版
# 改成 "dsh-review-outbox": "^0.1.3" 再跑一遍 → 升到当时最高成熟版本
```

**作者最容易踩的坑**：为了立刻验证新版本，用 `@<version>` 装了一次，于是这个 profile 从此不再自动更新，之后每发一版都"看不到效果"。这不是管线坏了，是那行 spec 被钉死了。

## 3. 三条安装回退路径（都实测过）

| 路径 | 命令形态 | 实测结果 | 代价 |
| --- | --- | --- | --- |
| 应用内目录一键安装 | 市场里点安装 | 依赖镜像健康 | — |
| 固定提交的 GitHub 源 | `dsh plugin --profile web add 'github:OWNER/REPO#COMMIT'` | 解析到 `0.1.5` | 6 分 52 秒（走 git） |
| 显式 npmjs registry | `pnpm add PKG@VER --registry=https://registry.npmjs.org` | 解析到 `0.1.5`，9.4 秒 | 需改配置 |

固定提交路径绕过 registry，是镜像故障期间唯一「不改用户配置」也能装到新版的路径。它的代价是慢，且要求包**零运行时依赖、无安装脚本**——否则依赖解析照样会撞上 registry。

## 4. 应用内索引的 pin 语义

应用内市场索引（`format: 1`）用「固定提交」表达版本，不是用分支头。我们用 `market-release.json` 显式持有被 pin 的提交：

- 索引里的 `version` 取自**工作区** `package.json`；
- `publishTimestamp` 取自**被 pin 提交**的提交时间（`git show -s --format=%ct`）；
- 因此「改代码」和「改索引」是两次提交：先运行时提交，再 pin 提交；
- 纯文档提交**不动 pin**，否则每次改错别字都会把用户钉到不相关的提交上。

这条语义直接决定了发布顺序：运行时提交 → 更新 pin → 重建索引 → 重建页面 → 校验 → 推送。

## 5. 验证只能在隔离 Profile 里做

桌面端 profile 由 Electron 应用独占管理，CLI 拒绝修改它。想验证安装、回填、审阅这类动作，必须另起 `DSH_HOME`：

```bash
H=$(mktemp -d /tmp/dsh-verify.XXXXXX)
DSH_HOME="$H" dsh plugin --profile web add PKG
```

好处是可以把**真实状态**拷进去跑：我们就是把日常 profile 里 75 条真实待审项复制到隔离环境，才验证出分组归档在生产数据上的行为（点 4 条那组 → `{"archived":4}` → pending 75→71、分组 10→9、零报错）。用自己的真实数据验证，和用造出来的 3 条假数据验证，发现的问题不是一个量级。

## 6. 消费兄弟插件的产物的正确接缝

上游插件如果把结果写成「冻结契约」（frozen contract），契约表面往往比实际可用的东西窄。以 `dsh-research-report` 为例，冻结的 `AssembleReportResult` 只暴露 `reportDir`、`sealHash`、`verdicts`，而实际拿到文件路径的稳定接缝是工具结果里的 `tool/result.data.meta.reportFile`。

判断哪个接缝是契约的、哪个是实现细节，问上游比猜便宜。我们把这个问题作为[上游 issue](https://github.com/PerryLink/dsh-research-report/issues/27)提出，同时在自己的集成代码里按 `reportFile` 优先、`reportDir` 兜底的顺序处理，两边都不假设。

## 6b. 把消费关系写成约定，而不是靠读对方代码

跨插件耦合写进文档才可能被讨论。我们把「第三方插件怎样把产物交给审阅方」写成七条可反驳的约定：[REVIEWABLE-ARTIFACTS.md](REVIEWABLE-ARTIFACTS.md)。它的价值不在措辞，而在于**把隐性依赖变成可以被拒绝的提案**——上游若不同意，可以直接说哪一条不成立。

## 7. 度量：什么不算激活

用一条命令拿到这条度量，而不是靠感觉：

```bash
node scripts/report-usage.mjs ~/.dsh            # 人读
node scripts/report-usage.mjs --json ~/.dsh     # 可入库
```

它从状态文件里数出：成果总数、按状态与类型分布、**人工动作次数**（approve/return/archive/reopen，按动作与类型分开）、待审的中位与最久停留小时、积压最重的会话。输出里的最后一行会直说「没有任何人工决定」——待审深度不是采用。



插件生态里最容易自欺的三个数字：

- **页面访问**——可能是自己刷新；
- **npm 下载**——包含 CI、镜像抓取、`npm view` 之外的自动化；
- **目录收录**——只说明能被搜到，不说明有人装。

我们采用的激活定义是「**一次真实的人工审阅动作**」：通过、退回或归档任意一条真实成果。到 `0.1.5` 为止，日常 profile 里这条计数是 **0**（75 条待审项，0 次人工动作）。这个 0 比任何发布里程碑都更能说明产品处在什么位置。

## 7b. 一条命令看住发布状态

发布之后真正要盯的不是"有没有发成功"，而是**四个会各自漂移的数字**：

```bash
node scripts/check-milestones.mjs            # 人读
node scripts/check-milestones.mjs --json     # 可入库
```

它一次打印：npm latest 与本地版本、目录条目版本与描述开头、默认安装解析到的版本（`--with-install`，会真的装一次）、本机漏斗（成果/待审/人工动作/最久停留）、以及上游 PR/issue 的状态与评论数。慢的步骤出声提示，避免"看起来卡住"。

## 8. 发布后检查清单

八条，按顺序做，每条都有可观测的产出：

1. `pnpm run check` 全绿（测试 + 索引重建 + 构建）。
2. `npm publish --registry=https://registry.npmjs.org`，记下 shasum。
3. 等 registry 处理窗口，`npm view PKG version` 确认 latest 已是新版。
4. 触发镜像同步：`curl -X PUT https://registry.npmmirror.com/-/package/PKG/syncs`，确认返回 `201`。
5. 用**隔离 Profile** 装一次，确认解析到的版本就是新版，而不是缓存里的旧版。
6. 更新 pin → 重建索引与页面 → 确认线上 `plugins.json` 与首页的版本、提交一致。
7. `IndexNow` 提交变更 URL，记录响应码（提交不等于收录，别当成流量）。
8. 隔天核对目录条目版本，确认日构建已带上新版。

## 已知不确定项

写下来是为了以后不把它们当成结论：

- 目录重建是否也依赖镜像，未验证；能确定的只有每日一次的构建节奏。
- 冷却期间市场卡片与安装版本可以不一致（卡片按目录、安装按冷却）。这一点是从两条独立机制推出来的，未做界面级验证。
- 应用内「一键安装」的点击链路在 headless 环境里验证不出来（确认对话框接受后 profile 未变、也无报错），底层的 `dsh plugin add` 是独立验证过的另一件事。

---

本文的事实来源都在仓库里：发布记录见 [`docs/metrics/2026-11-09-release-0.1.5.json`](metrics/2026-11-09-release-0.1.5.json)，收录与搜索分析见 [`docs/metrics/2026-11-09-market-listing.json`](metrics/2026-11-09-market-listing.json)，分发策略见 [`docs/DISTRIBUTION.md`](DISTRIBUTION.md)。
