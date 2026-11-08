# 兼容矩阵

本矩阵只记录真实执行结果。`engines` 中的版本范围是目标支持范围，不代表范围内所有版本和平台都已验证。

## Runtime 与测试

| 环境 | 验证 | 结果 |
|---|---|---|
| Node.js `22.19.0`，macOS arm64 | 全部 45 项测试 + 客户端构建 | 通过 |
| Node.js `25.2.1`，Homebrew ad-hoc 签名，macOS arm64 | 全部 45 项测试 + 客户端构建 | 通过 |
| DeepSeek Harness `0.2.2-rc.1` 官方桌面 Runtime `24.21.0`，`dsh web` | 隔离 Profile 的真实 Host、Client、API、浏览器、重启 | 通过 |
| 上述 Runtime + `dsh-better-sidebar@0.30.0` | 底部标签页、Markdown 审阅与打开、DOCX/PDF Viewer、可见/隐藏轮询 | 通过 |
| 真实 Cordis/Session/ToolRuntime + `dsh-research-report@0.3.32` | 密封报告自动入库、预览、证据验收、验收单；Node 22.19 与 25.2.1 | 通过；完整 Web GUI 联合日常使用未覆盖 |
| 完整链路 tarball，全新 `DSH_HOME` | 从包存储安装、历史回填、研究验收、验收单、正常重启 | 通过（better-sidebar 集成前包） |
| 当前最终 tarball，另一全新 `DSH_HOME` | 从包存储安装、真实 Host/Client 挂载、原生侧栏、空状态与回填 | 通过 |
| 损坏状态与备份恢复 | 只读保护、回填失败、写操作 400、原字节保留、备份恢复 | 通过 |
| 其他 DSH `0.2.x` 版本 | 未执行 | 不声明实测兼容 |
| Windows / Linux | 未执行 | 不声明实测兼容 |
| Firefox / Safari / 移动浏览器 | 未执行 | 不声明实测兼容 |

## 文件与界面

| 能力 | 已验证范围 | 未覆盖 |
|---|---|---|
| 官方事件 | `deliverables/presented`、Zstandard JSONL、历史冷读、跨 `callId` revision | 其他 Session 后端 |
| 研究插件事件 | `research_report` 成功结果 metadata、report/manifest 自动入库、实时与有界回填、跨来源 revision | background/gathered 无密封成果；读取窗口外的调用；其他插件版本 |
| 文本与数据 | Markdown、TXT、JSON、JSONL、CSV、常见源码、YAML | 超过 512 KiB 时只预览前缀 |
| 图片 | PNG、JPEG、WebP、GIF，最大 2 MiB | 更大图片 |
| DOCX | 官方 Office 转 PDF + 官方 PDF Viewer，中文正文和表格 | 复杂排版、缺字体、加密文件 |
| PDF | 官方 PDF.js Viewer，Canvas 与文本层 | 密码保护、损坏和超大 PDF |
| PPTX / XLSX | 未执行联合验证 | 不声明实测兼容 |
| 静态搜索站点 | Chrome 桌面/移动视口、离线打开、零外部请求 | 其他浏览器、真实搜索收录 |

## 安装形式

| 形式 | 状态 |
|---|---|
| 本地源码目录 | 已验证 |
| `.tgz` 安装包 | 已在全新 `DSH_HOME` 验证 |
| npm | 尚未发布，无安装证据 |
| GitHub URL 直装 | 公开提交 `ac8246501e5009a8323b33ab39559bce191671ee`；全新 Profile、历史回填、文本预览和原生侧栏均通过 | 其他提交与平台按各自证据判断 |
| GitHub 仓库 / Pages tarball | 公开克隆测试与构建、Pages 下载 SHA-256、全新 Profile 安装和真实浏览器挂载均通过 | 未覆盖平台见上表 |
| Awesome 目录 / `github:` 直装 | PR #13088 已合并，目录搜索、中英文详情和市场 JSON 均通过；原样命令在全新 Profile 解析到 `2e8cb8d1f5b7237a6ad1159e6ae027b3cd6a5700`，真实 Host、原生侧栏与空状态通过 |
| GitHub Release | 尚未发布，无安装证据 |

## 原生加载器测试环境说明

官方 JSONL 集成测试需要 `@deepseek-ai/node-addon-system`。DeepSeek bundled Node 与 npm 原生加载器的 macOS Team ID 不同，直接在该测试进程中 `dlopen` 会被系统拒绝。Node 22.19.0 和 Homebrew Node 25.2.1 已完成全部测试；官方桌面 Runtime 的真实挂载与浏览器链路另行通过。不要把这项测试进程签名差异误写成 DSH Host 不兼容。

## 升级原则

每次新增支持声明前，需要保留相同层级的证据：单元/集成测试、真实 tarball 安装、目标 Host 的浏览器流程和重启恢复。静态源码审查不替代运行时验证。
