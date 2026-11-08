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
7. **首次价值**：`0.1.1` 的密封研究报告默认附带验收包，打开报告即可看到 `0/4` 进度，不需要先理解并手选验收规则。真实 Web GUI 已验证“安装前报告 → 固定提交安装 → 历史回填 → 四项证据 → 通过 → 下载验收单”，见[首次价值证据](e2e/application-first-value.json)；本次安装使用 Discover 超时后的 CLI 固定提交路径，不计为外部激活。

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

站点已部署到 GitHub Pages，源码仓库与 tarball 下载入口已公开；npm 和 GitHub Release 尚未发布，[Awesome 社区目录](https://awesome-dsh-plugin.com/p/zjukop3/dsh-review-outbox/)已合并收录并上线。公开基础设施、目录收录和浏览器验证不等于自然流量或外部采用，后续仍需记录目录引荐、首次验收和留存。

## 首次聚合基线

[2026-11-07 基线](metrics/2026-11-07-baseline.json) 来自 GitHub Traffic API：当时仓库 views、unique visitors、clones、referrers、Stars、Forks 和 Watchers 均为 0。该接口可能延迟，只提供聚合诊断，不识别个人。

真实审阅激活、验收单回流激活和外部第二周留存记录为 `null`，表示尚无可靠测量，不表示真实使用量为 0。搜索收录也没有凭公开部署直接推定。后续对比沿用同一口径，北极星仍是每周被真正审阅并处置的成果数。

[2026-11-08 收录基线](metrics/2026-11-08-catalog-merge.json) 记录 PR 合并、公开详情页、市场截图与当时的聚合流量。目录 CI 会产生克隆，因此克隆数不单独作为自然激活证据；目录引荐和真实审阅激活继续保持独立测量。

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
