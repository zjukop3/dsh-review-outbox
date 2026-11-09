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

对作者的实际含义：

- **发布后的 24 小时内，不要用「用户装不到新版」去推断哪里坏了**，那是设计。
- 想让某个用户立刻拿到新版，就**显式钉版本**（`pkg@0.1.5`）；显式版本不受冷却限制，我们实测 2 秒安装成功。
- 市场卡片上的版本来自目录（每天构建），安装解析到的版本来自冷却与 registry，两者最多可以差一天。**看到「卡片是 X、装上是 X-1」不算矛盾。**

实测的目录构建时刻（连续六次）：

```
2026-11-09T04:49:06Z  2026-11-08T04:46:05Z  2026-11-07T21:13:53Z
2026-11-07T04:59:33Z  2026-11-06T04:47:52Z  2026-11-05T04:41:31Z
```

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

## 7. 度量：什么不算激活

插件生态里最容易自欺的三个数字：

- **页面访问**——可能是自己刷新；
- **npm 下载**——包含 CI、镜像抓取、`npm view` 之外的自动化；
- **目录收录**——只说明能被搜到，不说明有人装。

我们采用的激活定义是「**一次真实的人工审阅动作**」：通过、退回或归档任意一条真实成果。到 `0.1.5` 为止，日常 profile 里这条计数是 **0**（75 条待审项，0 次人工动作）。这个 0 比任何发布里程碑都更能说明产品处在什么位置。

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
