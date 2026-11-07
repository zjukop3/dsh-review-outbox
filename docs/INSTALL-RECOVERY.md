# 安装、升级与恢复指南

本文适用于 Review Outbox `0.1.0` 验证阶段。源码位于 [zjukop3/dsh-review-outbox](https://github.com/zjukop3/dsh-review-outbox)；已验证的 tarball 和 SHA-256 文件由 GitHub Pages 提供。npm、GitHub Release 和社区目录尚未发布。

## 环境要求

- DeepSeek Harness `>=0.2.2-rc.1 <0.3.0-0`
- Node.js `>=22.19`
- 当前真实验证环境见[兼容矩阵](COMPATIBILITY.md)

## 从公开 GitHub 仓库直装

```bash
export DSH_HOME=/tmp/dsh-review-outbox-github-source
dsh plugin --profile web add https://github.com/zjukop3/dsh-review-outbox
dsh web --no-open --port 43177
```

该方式已实测。Profile 的依赖声明为 `github:zjukop3/dsh-review-outbox`，锁文件解析到 GitHub codeload 的精确提交；验证提交为 `ac8246501e5009a8323b33ab39559bce191671ee`。安装前通过官方 `present` 持久化的成果能够回填，API 和界面正文预览一致，原生侧栏正常。原始结果见 [github-source-install.json](e2e/github-source-install.json)。

已有 Profile 的升级与回滚仍先按下方说明备份状态。需要固定已验证字节时，使用下面的 tarball 与 SHA-256 流程。

## 从 tarball 安装

下载 [tarball](https://zjukop3.github.io/dsh-review-outbox/downloads/dsh-review-outbox-0.1.0.tgz) 与 [SHA-256 文件](https://zjukop3.github.io/dsh-review-outbox/downloads/dsh-review-outbox-0.1.0.tgz.sha256)，在两者所在目录校验：

```bash
shasum -a 256 -c dsh-review-outbox-0.1.0.tgz.sha256
```

在独立 Profile 中安装，避免影响正在使用的环境：

```bash
export DSH_HOME=/tmp/dsh-review-outbox-production-candidate
dsh plugin --profile web add /absolute/path/dsh-review-outbox-0.1.0.tgz
dsh web --no-open --port 43177
```

打开命令输出的完整启动 URL，在侧栏选择「成果审阅」。启动 URL 会换取签名 Cookie；插件 API 不使用 `Authorization: Bearer` 代替这一流程。

## 首次使用检查

1. 让 Agent 通过官方 `present` 交付一个文本文件。
2. 打开「成果审阅」，确认成果出现且能够预览。
3. 选择「研究报告验收」，填写四项必填证据。
4. 通过后导出验收单，确认独立 HTML 能打开。
5. 重启 DSH，确认状态、revision、历史和预览仍在。

历史回填状态位于 API 的 `backfill` 字段：

| 状态 | 含义与处理 |
|---|---|
| `ready` | 扫描完成，没有单 Session 错误 |
| `degraded` | 部分 Session 打开、读取或关闭失败；检查 `errors`，其他成果仍可使用 |
| `running` | 正在扫描 |
| `unavailable` | 当前 Host 没有可用的 `sessionPersistence`；安装后新事件仍可接收 |
| `failed` | 列表或入库失败；同时检查 `stateError` 和 Host 日志 |
| `disabled` | 配置关闭了回填；可监听新事件 |

默认回填最新 50 个 Session、每个末尾最多 5000 个事件、每轮最多 1000 项。它不是无界全量历史导出。

## 状态文件与备份

状态保存在：

```text
$DSH_HOME/review-outbox/items.json
```

未设置 `DSH_HOME` 时为 `~/.dsh/review-outbox/items.json`。文件权限为 `0600`。

**插件当前不会自动创建备份。**升级或手工恢复前，先停止该 Profile 的 DSH Web 进程，再复制文件：

```bash
cp "$DSH_HOME/review-outbox/items.json" \
   "$DSH_HOME/review-outbox/items.json.before-upgrade"
```

停止写入后再备份，避免复制到临时 rename 的中间状态。

## 状态损坏时的行为

无法解析状态文件时：

- `stateError` 显示 `State is read-only: ...`。
- 状态存储进入只读保护，审阅动作返回 400。
- 需要入库的回填会显示 `failed`，不会伪造成功。
- 原始损坏字节不会被启动流程或回填覆盖。

已在隔离 Profile 实测以上行为。

## 从备份恢复

1. 停止该 Profile 的 DSH Web 进程。
2. 保留损坏文件用于诊断，不覆盖已有良好备份。
3. 复制良好备份回状态路径：

```bash
cp "$DSH_HOME/review-outbox/items.json.before-upgrade" \
   "$DSH_HOME/review-outbox/items.json"
```

4. 重新启动并检查成果、审阅状态、revision、预览和 `backfill.changed`。

若没有良好备份，可以把损坏文件移开后重新启动，让插件从官方 Session 重新回填成果元数据。**原审阅状态、意见和检查证据无法靠回填恢复。**只有明确接受这部分损失时才采用此路径。

## 升级与回滚

升级：

1. 停止 Profile 并备份状态。
2. 安装新版本 tarball。
3. 启动并检查 `stateError`、成果数量、待办和回填状态。
4. 抽查一个成果的预览、revision 和验收单。

回滚：

1. 停止 Profile。
2. 再备份一次当前状态，保留新版本产生的数据。
3. 安装保留的旧版本 tarball。
4. 启动并确认状态可读；如果旧版本无法理解新数据结构，恢复升级前备份。

不要把不同 Profile 的状态文件混用，也不要同时让多个 Host 写同一个 `items.json`。

## DOCX/PDF Viewer

点击「在宿主 Viewer 打开」后，插件先恢复来源 Session，再调用官方文档 Viewer。当前审阅面板不内嵌 Office/PDF 渲染器。没有来源 Session 或宿主 Viewer 时会显示具体错误，不会静默下载或上传文件。

## 常见问题

### `workspace/changes` 的旧 diff 消失

官方 diff 主要服务仍存活的 Session。重启后本插件保留成果元数据、审阅状态和文件证据，但不承诺旧 diff 仍可读取。

### 验收单提示文件已变化

审阅后文件摘要与当前文件不一致。重新预览当前版本并完成一次新审阅；旧验收单仍保留历史记录，不应被当成当前版本的通过证明。

### 安装后看不到任何历史成果

先检查 `backfill.status` 和 `errors`。只有官方 `deliverables/presented` 会被历史回填；普通问题、通知和 `workspace/changes` 不在历史回填范围内。

## English recovery summary

Stop the Profile before backing up or restoring `$DSH_HOME/review-outbox/items.json`. The plugin does not create automatic backups. A corrupt state file enters read-only mode, mutations return 400, backfill reports failure, and the original bytes are preserved. Restore a known-good backup only while the Profile is stopped, then verify reviews, revisions, previews, receipts, and backfill status. Rebuilding from Session history restores artifact metadata, not prior review decisions or notes.
