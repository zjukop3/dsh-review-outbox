# 验证记录

## 单元、Host 与官方工具集成测试

命令：`node --test test/*.test.js`  
结果：**38/38 通过**。

覆盖：

- 官方 presented/workspace 事件转换与重复路径处理
- revision、通过、退回、归档、重新打开与历史持久化
- 无变化重新发现和重复回填不重置已审阅状态
- 最新 Session 优先、Session/事件/成果三级上限与尾部事件读取
- 单个 Session 打开、读取和关闭失败时的故障隔离与错误报告
- 每个成功打开的持久化句柄均在 `finally` 中关闭
- 损坏状态文件只读保护
- 工作区外预览与符号链接逃逸拒绝
- 文本与图片预览
- 审阅时 SHA-256、工作区约束、符号链接逃逸与 64 MiB 证据上限
- 独立 HTML 的注入转义、无脚本 CSP、安全链接和绝对路径防泄露
- 审阅后文件变化检测
- 研究报告必填证据、Host 直调约束、持久化与新 revision 重置
- 同一 JSONL Session 恢复后跨 `callId` 的 revision，以及迟到旧事件不降级新版本
- 客户端元素选择器不污染宿主或其他插件
- 来源 Session 挂载顺序、工作区内外文件地址编码和 Viewer 服务缺失提示
- better-sidebar 已存在、延迟到达、替换、移除和插件销毁时的注册清理
- Host Connection 鉴权
- Host 模拟官方事件到预览和审阅动作的完整链路

普通 Host 测试中的事件是精确数据形状的模拟事件；官方工具链路由下述独立测试覆盖。

## 官方 `present` → 落盘 → 冷读 → 回填

`test/official-present.test.js` 直接组合并执行以下发布包，而不是手写 `deliverables/presented`：

- `@deepseek-ai/dsh-tool-present@0.2.2-rc.1`
- `@deepseek-ai/dsh-tool-testkit@0.2.2-rc.1`
- `@deepseek-ai/dsh-tool-executor-native@0.2.2-rc.1`
- `@deepseek-ai/dsh-session-persistence-jsonl@0.2.2-rc.1`

验证链：

1. 创建真实 Agent、Session、工作区和打开中的 turn。
2. 通过 NativeToolExecutor 执行官方 `present`。
3. 断言官方工具追加 `deliverables/presented`，文件路径和说明与工具结果一致。
4. 用官方 JSONL 持久化写入完整 Session，显式 `flush`，关闭 writer 和整个工具上下文。
5. 以生产默认的 Zstandard 压缩生成 `session.v4.jsonl.zstd`，确认物理文件存在。
6. 新建持久化上下文冷读日志，执行 Review Outbox 回填。
7. 断言成果 ID、Session、事件 seq、turn、工作区和说明均正确，文本预览可读取。
8. 通过后再次回填，`changed=0`，审阅状态保持 `approved`。

该测试不需要模型或 API Key；它验证官方工具的真实执行与持久化契约，不声称验证模型会自主选择调用工具。

### 真实跨 `callId` revision

首次用两个不同 `callId` 交付同一路径时，入库结果为 2 条成果，证明原身份规则无法形成真实 revision。修复后：

- `presentedRecords` 保留真实 `callId`、事件坐标和同一路径在单次调用中的出现序号。
- Store 按 Session、路径和出现序号识别同一成果；revision 更新为最新调用的事件坐标。
- 已审阅历史保留，新 revision 重新进入待审并清空旧场景检查。
- 迟到旧事件不会把较新的 revision 降级。
- 测试先创建并关闭官方 JSONL Session，再以 write 模式恢复同一会话，用不同 `callId` 执行第二次官方 `present`。最终只有 1 条成果，`revision=2`，包含 1 条 revision 历史。

## 构建

命令：`pnpm run check`  
结果：38/38 测试与客户端构建均通过。

- `dist/client.js`：39.38 kB，gzip 10.29 kB
- `dist/client.js.map`：55.62 kB，gzip 15.56 kB
- 构建工具仍提示客户端采用 CommonJS 包装；这是 DSH `window.__ModuleLoader__.load(...)` 当前加载方式所需，不是测试失败。

## 真实隔离挂载：历史官方成果

环境：

- 官方桌面 Runtime：DeepSeek Harness `0.2.2-rc.1`
- 独立 `DSH_HOME=/tmp/dsh-review-outbox-backfill-e2e.*`
- 独立 Web 实例与端口，未修改用户正在使用的 Profile
- 插件安装前，使用上述官方工具夹具生成并持久化一份 `preinstall-review.md`

首次启动结果见 [backfill-result.json](e2e/backfill-result.json)：

- `backfill.status=ready`
- `listed=1`、`scanned=1`、`discovered=1`、`changed=1`
- 默认上限为 50 个 Session、每个 5000 个事件、每轮 1000 项
- 浏览器侧栏显示安装前的成果并成功预览正文
- 点击通过后 `pending=0`
- 再次调用回填，`changed=0`，成果保持 `approved`
- `pageErrors=[]`、`consoleErrors=[]`

截图：[历史成果](e2e/04-backfill-official.png)、[通过后重复回填](e2e/05-backfill-approved.png)。

### 重启持久化

停止并重启同一隔离 Profile，结果见 [backfill-restart-result.json](e2e/backfill-restart-result.json)：

- 重启后扫描到宿主新增的第二个 Session，`listed=2`、`scanned=2`
- 仍只发现同一份官方交付，`discovered=1`、`changed=0`
- 成果保持 `approved`，待办为 0
- `observed` 和 `approve` 两条处理历史均保留
- 安装前成果的正文预览在重启后仍可读取

验证完成后已回收隔离 Web 实例。

## 真实隔离挂载：研究报告验收与独立验收单

结果见 [research-receipt-result.json](e2e/research-receipt-result.json)。

在另一个全新隔离 `DSH_HOME` 中，使用安装前生成的官方交付完成以下浏览器流程：

1. 选择「研究报告验收」后显示 `必填证据 0/4`，「通过」按钮为禁用状态。
2. 填写核心结论、引用、数据口径、方法限制四项证据并逐项勾选。
3. 每项直接读取 Host API，确认勾选和证据文本均已持久化；复现材料保持可选。
4. 进度达到 `4/4` 后通过，界面自动切换到「通过」筛选并保留当前成果。
5. 点击「导出验收单」，浏览器成功下载 `preinstall-review.md.review-r1.html`。
6. 独立打开 HTML，确认研究报告清单、证据、revision 和 SHA-256 一致提示均存在，且不包含原成果绝对路径或可执行脚本。
7. 修改原文件后再次导出，新验收单显示「文件在审阅后发生变化」。
8. `pageErrors=[]`、`consoleErrors=[]`。

产物：[验收单](e2e/research-report.review-r1.html)、[变化后的验收单](e2e/research-report.changed.review-r1.html)、[独立验收单截图](e2e/06-research-receipt.png)。

浏览器验证还覆盖了两个真实交互回归：检查项内部焦点移动不再发送互相覆盖的保存请求，所有检查保存按队列完成后才执行通过；通过后不再因「待审」筛选而丢失当前成果和导出入口。

验证完成后已回收隔离 Web 实例。该证据是合成报告的完整产品链路，不计为外部用户采用或自然流量。

## 真实 DOCX/PDF 宿主 Viewer

结果见 [native-viewer-result.json](e2e/native-viewer-result.json)。

验证文件由 `python-docx` 生成并重新读取检查，包含中文标题、结论、引用与数据口径表格、方法限制；随后用已安装的 LibreOffice Kit 导出 PDF，确认非空输出和 `%PDF-` 签名。两份文件通过同一个官方 `present` 事件进入隔离 DSH。

首次直接调用 `sidebarRight.openResource` 返回 `no session surface is mounted`，证明历史审阅成果不能绕过 Session surface。修复后客户端执行：

1. 检查 `uiWorkspace` 与 `sidebarRight` 均可用。
2. `openSession(item.sessionId)` 恢复来源会话。
3. 等待 React surface 完成挂载。
4. 用官方 `fileAddressFor` 构造地址并调用 `openResource`。

最终 DOCX 和 PDF 均显示官方 `[data-pdf-preview]`，首屏 Canvas 可见；两者文本层各提取 285 个字符并包含 DSH 报告标题。`pageErrors=[]`、`consoleErrors=[]`。本插件没有引入 Office/PDF 渲染器，只打包了官方 Workspace 地址工具。

截图：[DOCX 宿主预览](e2e/07-docx-native-viewer.png)、[PDF 宿主预览](e2e/08-pdf-native-viewer.png)。验证完成后已回收隔离 Web 实例。

## better-sidebar 0.30.0 联合验证

结果见 [better-sidebar-result.json](e2e/better-sidebar-result.json)。在另一个全新隔离 Profile 中同时安装 `dsh-better-sidebar@0.30.0` 与当前 Review Outbox 构建，并通过真实官方 `present` 交付 Markdown、DOCX、PDF 三份成果。

真实 Chrome 流程确认：

- better-sidebar 底部「成果审阅」标签页可打开，三项成果完整显示。
- Markdown 可通过审阅，并在官方 `[data-dsh-md-surface]` 的可见区域显示正文；断言不会误选隐藏编辑器节点。
- DOCX 与 PDF 均恢复来源 Session，并显示官方 `[data-pdf-preview]` 和可见 Canvas。
- 标签页可见时 6.2 秒内观察到 1 次更新请求；明确折叠底部面板并等待审阅界面隐藏后，6.2 秒内更新请求为 0。
- `pageErrors=[]`、`consoleErrors=[]`。

截图：[better-sidebar 成果审阅](e2e/11-better-sidebar-outbox.png)、[联合环境中的 DOCX Viewer](e2e/12-better-sidebar-docx.png)。该集成是可选能力，没有 better-sidebar 时仍使用原生侧栏；安装时的 peer 提示未被当作兼容证据，以上结论来自实际运行。验证完成后已回收隔离 Web 实例。

## 既有合成示例验证

此前的独立实例和合成 Markdown 验证继续保留：

- `GET /review-outbox/api/items` 返回两份待审成果
- 文本预览、通过动作和待办计数正确
- 浏览器无页面错误
- 重启后两份成果均为 `approved`，状态文件权限为 `0600`

截图：[应用](e2e/01-application.png)、[审阅台](e2e/02-review-outbox.png)、[通过后](e2e/03-approved.png)。

## 20 个真实项目成果 Dogfood

已完成 5 组真实任务、20 个工作区成果的官方交付、逐份预览、15 项通过、5 项退回、修复后再次交付和重启检查。退回项保留完整 revision 历史，最终没有重复成果或待办。

完整口径、退回原因和原始 JSON 见 [Dogfood 报告](DOGFOOD.md)。这是脚本化真实文件审阅，不计为外部用户采用或连续日常留存。

## 自然搜索静态站点

结果见 [research-site-result.json](e2e/research-site-result.json)。

工作区 `site/` 包含完整中文清单、English checklist、4 个 FAQ、真实验收单、首页、`robots.txt`、`sitemap.xml` 和 `llms.txt`。页面不请求外部字体、图片或统计脚本。

真实 Chrome 验证通过：

- SEO title、description、canonical、robots 和 `TechArticle`/`FAQPage`/`SoftwareApplication` JSON-LD。
- 5 项检查、5 步流程、4 个 FAQ 和英文摘要。
- 首页与验收单链接可导航，链接所在段落不会因可编辑模式而阻止点击；首页使用适配 Pages 项目子路径的相对链接。
- 验收单示例回流公开 GitHub 仓库；tarball 下载字节数与 SHA-256 同独立校验文件一致。
- 移动端横向溢出为 0，离线打开成功。
- 外部请求、页面错误和控制台错误均为 0。

截图：[桌面页面](e2e/09-research-site.png)、[移动页面](e2e/10-research-mobile.png)。分发口径与部署边界见 [自然分发](DISTRIBUTION.md)。站点通过 GitHub Pages 公开，但公开部署本身不计为自然流量证据。

## Node 基线、干净 tarball 与恢复

- Node.js `22.19.0`：38/38 测试和客户端构建通过，见 [node22-check.json](e2e/node22-check.json)。
- 完整链路 tarball（better-sidebar 集成前）：从包存储安装到全新 `DSH_HOME`，不是本地目录链接；历史回填、研究验收、验收单导出均通过。
- 包含 better-sidebar 集成的最终候选 tarball：在另一个全新 `DSH_HOME` 从包存储安装，真实浏览器打开原生侧栏，空成果状态、`backfill=ready`、`stateError=null`，页面与控制台错误均为 0，见 [final-package-smoke.json](e2e/final-package-smoke.json)。具体哈希只记录于独立 `.sha256` 文件，避免包内文档自引用。
- 正常重启：`approved`、两条历史、预览和文件变化检测保留，`changed=0`，见 [cleanpack-recovery-normal.json](e2e/cleanpack-recovery-normal.json)。
- 损坏状态：只读错误、回填 `failed`、写操作 400、损坏字节未覆盖，见 [cleanpack-recovery-corrupt.json](e2e/cleanpack-recovery-corrupt.json)。
- 备份恢复：审阅状态和历史恢复，状态文件权限仍为 `0600`，见 [cleanpack-recovery-restored.json](e2e/cleanpack-recovery-restored.json)。

实测范围和未覆盖平台见[兼容矩阵](COMPATIBILITY.md)，用户操作步骤见[安装恢复指南](INSTALL-RECOVERY.md)，英文入口见[英文 README](../README.en.md)。

## 打包产物

- `dsh-review-outbox-0.1.0.tgz` 仅包含运行所需源码、客户端产物、`cordis.patch.yml`、README、LICENSE 和 Markdown 文档。
- 包内没有 `demo/`、测试截图、测试依赖、`node_modules` 或本机私有文件。
- `src/backfill.js`、`src/evidence.js`、`src/packs.js`、`src/receipt.js` 和研究报告验收文档已进入 tarball。
- 曾在第二个全新 `DSH_HOME=/tmp/dsh-review-outbox-pack-e2e` 中安装并启动，干净启动为 `items=0`、`pending=0`、`stateError=null`。
- 当前 tarball 的 SHA-256 记录在工作目录中的 `dsh-review-outbox-0.1.0.tgz.sha256`；哈希文件独立于 tarball，避免自引用。

## 已记录的环境问题

通过 npm/npx 全新安装完整 DSH CLI 时，上游原生依赖 `koffi` 的安装脚本曾失败，因此真实挂载使用本机已有官方桌面 Runtime。该失败不计入本插件兼容性证据。

官方 JSONL 测试需要加载 `@deepseek-ai/node-addon-system`。DeepSeek bundled Node 与 npm 原生加载器的 macOS Team ID 不同，`dlopen` 会被系统拒绝；测试改用本机 ad-hoc 签名 Node 25.2.1 后全部通过。真实官方桌面 Runtime 的挂载和浏览器链路另行通过，插件声明的 Node 基线仍为 `>=22.19`。

## 尚未覆盖

- 连续一周日常使用的首次价值时间、漏审减少情况和继续使用意愿
- 研究报告验收包和独立 HTML 验收单的日常真实使用、成果接收者激活与自然获客证据
- 真实垂直插件联合工作流
- DSH 多版本、多平台兼容矩阵
- PPTX/XLSX、密码保护 PDF、缺字体与超大文件的宿主 Viewer 联合验证
- 外部用户第二周留存，以及场景搜索或验收单入口带来的首次激活

增长模型已从人工推广优先调整为“场景搜索、成果携带、官方事件零配置接入”，详见 [长期路线](STRATEGY.md)。这些规划不计入已完成证据。
