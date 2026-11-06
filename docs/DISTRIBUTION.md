# Review Outbox：自然搜索与成果传播基础设施

## 原则

不把维护者持续发帖或人工互推当作获客前提。用户从两个已有意图进入：搜索“研究报告怎么验收/检查引用”，或在收到研究成果时查看它的验收证据。

## 已具备的链路

1. **可索引内容**：中文完整清单、English checklist、4 个 FAQ、安装与限制说明。
2. **真实产物**：无需安装即可打开的独立 HTML 验收单。
3. **结构化发现**：`TechArticle`、`FAQPage`、`SoftwareApplication` JSON-LD，以及 `robots.txt`、`sitemap.xml`、`llms.txt`。
4. **成果回流**：插件生成的验收单包含带 `utm_source=review-receipt`、`utm_medium=artifact` 的插件入口。
5. **零外部依赖**：页面没有外部字体、图片、统计脚本、cookie 或后端写入，可离线打开。

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

站点已部署到 GitHub Pages，源码仓库与 tarball 下载入口已公开；npm、GitHub Release 和社区目录尚未发布。公开基础设施和浏览器验证不等于自然流量或外部采用，后续仍需记录真实收录、首次验收和留存。
