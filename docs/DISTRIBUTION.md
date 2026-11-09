# Review Outbox：自然搜索与成果传播基础设施

## 原则

不把维护者持续发帖或人工互推当作获客前提。用户从两个已有意图进入：搜索“研究报告怎么验收/检查引用”，或在收到研究成果时查看它的验收证据。

## 已具备的链路

1. **可索引内容**：中文完整清单、English checklist、4 个 FAQ、安装与限制说明。
2. **真实产物**：无需安装即可打开的独立 HTML 验收单。
3. **结构化发现**：`TechArticle`、`FAQPage`、`SoftwareApplication` JSON-LD，以及 `robots.txt`、`sitemap.xml`、`llms.txt`。
4. **成果回流**：插件生成的验收单包含带 `utm_source=review-receipt`、`utm_medium=artifact` 的插件入口。
5. **零外部依赖**：页面没有外部字体、图片、统计脚本、cookie 或后端写入，可离线打开。
6. **应用内发现**：`site/plugins.json` 提供宿主 `format: 1` 索引，用户可在 DSH「发现」中搜索、固定提交、安装并启用。公开首页以 `0.1.1` 应用内安装为主路径，提供同一提交的 CLI 回退；旧版 tarball 不再占据主入口。详见[应用内市场指南](MARKET.md)。
7. **首次价值**：`0.1.2` 的密封研究报告默认附带验收包，打开报告即可看到 `0/4` 进度，不需要先理解并手选验收规则。真实 Web GUI 已通过**公开 Discover 界面**验证“公网索引 → 搜索 → 安装固定提交 → 历史回填 → 四项证据 → 通过 → 下载验收单”，见[首次价值证据](e2e/application-first-value.json)；验收单入口带 `utm_source=review-receipt` 直接回到安装指南，形成成果回流环。公开部署本身不计为外部激活。

站点源文件位于工作区 `site/`。部署和构建方式见 `site/README.md`。

## 浏览器证据

`scripts/e2e-research-site.mjs` 已在真实 Chrome 验证：

- SEO title、description、canonical 和 robots 正确。
- 三类 JSON-LD 均可解析。
- 5 项检查、5 步流程、4 个 FAQ 和英文摘要完整。
- 首页与验收单链接可导航。
- 移动端横向溢出为 0。
- 离线打开成功。
- 外部请求、页面错误、控制台错误均为 0。

原始结果：`docs/e2e/research-site-result.json`。

## 发布后的度量顺序

1. 静态站点公开后，先记录搜索收录和按页面聚合的访问，不采集正文或用户身份。
2. 通过带来源参数的入口区分搜索页面、验收单和目录访问。
3. 以“首次完成真实验收”作为激活，不把页面访问或 npm 下载当成活跃用户。
4. 只有形成匿名、聚合且可靠的归因后，才判断哪个场景继续扩展。

站点已部署到 GitHub Pages，源码仓库与 tarball 下载入口已公开；**`0.1.2` 已于 2026-11-08 发布到 npm**（`npm publish` 授权后执行，包内容含 storefront 截图与全部验证文档，无安装脚本、零运行时依赖），[Awesome 社区目录](https://awesome-dsh-plugin.com/p/zjukop3/dsh-review-outbox/)已合并收录并上线。公开基础设施、目录收录和浏览器验证不等于自然流量或外部采用，后续仍需记录目录引荐、首次验收和留存。

## 官方 dsh-market 索引：npm 发布打通的最后缺口

2026-11-08 发现：官方 [dsh-market](https://github.com/dsh-market/dsh-market)（DSH 内置插件市场，11k+ 星标）的插件索引来自 `dsh-plugin-catalog` npm 包，**收录门槛是 npm 发布**——当时目录里的条目因此 `version=null` 被排除在市场搜索外。awesome 目录 PR 合并与市场索引是两条独立管线，此前误将前者当成完整收录。

**2026-11-09 已收录**：`dsh-plugin-catalog@2026.1109.17642`（4985 条目）中本插件条目为 `dsh-review-outbox` v`0.1.3`，`source: npm`。真实市场界面（dshmarket 1.73.16）实测：卡片正确渲染（名称、作者、v0.1.3、工作流与自动化分类），搜索 `研究报告`、`成果人工审阅`、`验收单`、`outbox`、`zjukop3` 均能命中；点击安装会弹出含版本、能力扫描与安装命令的确认对话框。

## 安装通道的真实约束：冷却与镜像各管一段

2026-11-09 发布 `0.1.5` 时，先误判成镜像故障，最后定位到两条独立机制。**先说结论：版本落后查 `minimumReleaseAge` 冷却，装不动才查镜像。**

### 冷却：发布不满 24 小时，默认安装看不见

`pnpm add dsh-review-outbox` 在健康 registry 上解析到 `0.1.3`，加 `--config.minimum-release-age=0` 立刻变成 `0.1.5`；策略值 `1440`（分钟）记录在 pnpm 的 `lockfile-verified.jsonl` 里，DSH 自己的 schema 注释也写明「pnpm's `minimumReleaseAge` can make it older than the newest release」。这是供应链防护，按设计工作，不是缺陷。对作者的含义：发布后 24 小时内别把「用户装不到新版」当成坏了；要让某个用户立刻拿到，钉版本即可，显式版本不受冷却限制（实测 2 秒）。

### 镜像：只解释装不动，不解释版本落后

写死的不是 registry 地址，而是「继承用户 npm 配置」这一层——`node pnpm.mjs config get registry` 返回的就是 `~/.npmrc` 里的值，且可被 `--config.userconfig` 覆盖。

- `dsh plugin --profile web add dsh-review-outbox` 使用 `runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs`，实际请求 `https://registry.npmmirror.com`；设置 `npm_config_registry=https://registry.npmjs.org` 后请求仍打向镜像，未被采纳。
- 当晚镜像返回 `500 ER_NO_SUCH_TABLE Table 'npmmirrordb.team_packages' doesn't exist`。抽查 `react`、`dsh-plugin-catalog`、`dsh-bili-scroll` 同样 500，说明是**镜像自身故障，不是本包问题**。后果仍然一样：默认安装命令解析到镜像缓存的 `0.1.3`；显式指定 `dsh-review-outbox@0.1.5` 则报 `ERR_PNPM_NO_MATCHING_VERSION`。
- 已用 `PUT /-/package/dsh-review-outbox/syncs` 触发同步（`201 waiting`），同步任务只排队，元数据仍是 500。
- 同一时刻 `registry.npmjs.org` 的 latest 已是 `0.1.5`，`pnpm add dsh-review-outbox@0.1.5` 在临时目录 9.4 秒装成功。

结论，写进文档而不是写进愿景：

1. `npm publish` 成功**不等于**国内用户能装到新版。必要条件是镜像也同步完成。镜像同步是外部依赖，我们能做的只有发布后立刻触发 sync、并在镜像不可用时给出回退路径。
2. 回退路径已验证可用：`dsh plugin --profile web add 'github:zjukop3/dsh-review-outbox#<commit>'` 绕过 registry，直接取 GitHub 源码解析到 `0.1.5`，代价是耗时 6 分 52 秒。
3. 官方目录的滞后另有原因，已核实：`dsh-plugin-catalog` **每天构建一次**，最近六次发布时间为 `2026-11-09T04:49Z`、`2026-11-08T04:46Z`、`2026-11-07T21:13Z`、`2026-11-07T04:59Z`、`2026-11-06T04:47Z`、`2026-11-05T04:41Z`。本插件 `0.1.4` 发布于 `14:42Z`、`0.1.5` 发布于 `15:05Z`，都晚于当天 `04:49Z` 的构建，所以条目停在 `0.1.3` 是**日构建节奏**的必然结果，不是镜像故障，也不需要修。次日 `04:46Z` 之后的构建才会带上 `0.1.5`。
4. 产品含义：更新触达不掌握在自己手里。这也是把插件做成零运行时依赖、无安装脚本的理由之一——少了依赖解析，镜像故障时至少 GitHub 源这条路还在。

已知边界（如实记录，含两处自我修正）：① **市场搜索本身工作正常**——唯一短语 `研究报告证据清单` 能精确命中本插件；宽泛查询（`验收` 102 条、`看板` 108 条、`侧边栏` 103 条）返回 100+ 结果并出现「加载更多」，而 0 下载 0 星标的条目排在折叠线以下。**真正的约束是热度信号为零，不是搜索覆盖或条目元数据。** ② 上游 `metadata.keywords` 为空是**刻意设计**——`scripts/lib/market-index.mjs` 注释明确写着省略 format 默认字段以节省每个条目字节，因此它不是缺陷，也不是我们能单方面改的杠杆。③ 确认对话框接受后，headless 自动化环境中 profile 未实际安装且无错误浮出，因此**一键安装的点击链路未验证**；底层的 `dsh plugin --profile web add dsh-review-outbox` 已独立验证（1.6 秒、0.1.3、bundle 自动选中）。证据见[市场收录快照](metrics/2026-11-09-market-listing.json)。

## 首次聚合基线

[2026-11-07 基线](metrics/2026-11-07-baseline.json) 来自 GitHub Traffic API：当时仓库 views、unique visitors、clones、referrers、Stars、Forks 和 Watchers 均为 0。该接口可能延迟，只提供聚合诊断，不识别个人。

真实审阅激活、验收单回流激活和外部第二周留存记录为 `null`，表示尚无可靠测量，不表示真实使用量为 0。搜索收录也没有凭公开部署直接推定。后续对比沿用同一口径，北极星仍是每周被真正审阅并处置的成果数。

[2026-11-08 收录基线](metrics/2026-11-08-catalog-merge.json) 记录 PR 合并、公开详情页、市场截图与当时的聚合流量。目录 CI 会产生克隆，因此克隆数不单独作为自然激活证据；目录引荐和真实审阅激活继续保持独立测量。

[2026-11-09 首次真实使用数据](metrics/2026-11-09-first-real-usage.json)：维护者本人把插件装进日常 Profile 后，历史回填 **75 个成果 / 10 个会话 / 跨 47 天**，其中 63 个产生于最近 7 天、9 个会话。这暴露了一个真实 UX 缺陷——63 条平铺无法扫读；已按会话分组修复（10 组、75 条无丢失、默认展开最新组且默认选中最新成果）。注意：这仍是维护者自己的使用，不是外部用户激活。

[2026-11-08 0.1.2 发布快照](metrics/2026-11-08-0.1.2-release.json) 记录公开 Discover 安装验证、验收单回流链接与 IndexNow 通知上线后的聚合流量：views 仍为 1、referrers 仍为空，克隆增长主要来自目录 CI 验证。维护者运行的安装验证不计为外部激活；四项激活指标继续保持 `null` 口径。

## 插件目录

Awesome DSH Plugin 的单文件条目、差异化描述和市场截图已发布，具体规则与验证结果见[目录收录准备](CATALOG.md)。[目录 PR #13088](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/13088) 已于 `2026-11-07T21:42:52Z` 合并，[公开详情页](https://awesome-dsh-plugin.com/p/zjukop3/dsh-review-outbox/)和市场 `plugins.json` 均可匿名读取；原始安装命令已在隔离 Profile 验证。目录 README 正文由上游每日探针补充，当前不把目录收录直接换算为目录流量或外部采用。

## 应用内索引格式

真实界面验证发现，Awesome registry 直接添加到 DSH「发现」会报告 `$.format must be 1`。本项目因此在 GitHub Pages 额外发布经过宿主官方解析器验证的[应用内索引](https://zjukop3.github.io/dsh-review-outbox/plugins.json)，把网页目录收录转化为应用内可搜索、可固定提交、可安装和可启用的路径。Awesome 目录与自有索引互为补充，不复制或批量制造插件条目。公开索引的完整界面流程见[应用内验证](e2e/application-market.json)。

## IndexNow 搜索发现通知

根目录 `indexnow.json` 声明 Bing 提交端点、项目 URL 范围和公开所有权密钥。依据 [IndexNow 的 keyLocation 文档](https://www.indexnow.org/documentation)，密钥文件位于 `/dsh-review-outbox/` 项目子路径，只允许通知同一前缀下的 URL，不要求修改 `zjukop3.github.io` 根目录。

`scripts/build-research-site.mjs` 校验配置并生成 `<key>.txt`；`scripts/submit-indexnow.mjs` 从 sitemap 读取 URL，先验证线上密钥文件内容与每个 URL 的 HTTP 状态，再提交 JSON。Pages 部署成功后自动执行通知，响应作为 30 天构建 artifact 保存；通知步骤使用 `continue-on-error`，避免搜索引擎临时故障把已完成的网站部署标为失败。

```bash
PUBLIC_ORIGIN='https://zjukop3.github.io/dsh-review-outbox' node scripts/build-research-site.mjs
node scripts/submit-indexnow.mjs
```

HTTP 200/202 只表示搜索引擎已接收或等待密钥验证，**不表示已经收录、获得排名、产生自然流量或完成激活**。实际响应见 [IndexNow 提交证据](e2e/indexnow-submission.json)，收录和外部激活继续保持独立测量。

> 2026-11-08 发布记录：`dsh-review-outbox@0.1.2` 已发布到 npm（账号 `zjukop1`，官方 registry；发布前 tarball 审查确认无敏感文件、无本机路径、含 storefront 截图与全部验证文档）。registry 处理窗口约 2 分钟后可查。npm 包对应仓库提交 `3d45275`（与索引 pin `e9bb649` 的差异仅为 package.json 的 files 字段补充 assets）。
