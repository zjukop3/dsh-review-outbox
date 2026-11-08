# 插件作者集成指南：让成果进入人工审阅

Review Outbox 是 DSH 的人工审阅层：Agent 产出的文件集中到这里，由人完成预览、通过、退回和归档。本指南面向插件作者，说明你的插件产出如何进入审阅队列，以及你**不需要**做什么。

## 三条接入路径

Review Outbox 监听宿主 Session 事件流，不要求你的插件注册任何回调或依赖本插件。

### 1. 官方 `present`（零配置，推荐）

你的插件只要通过官方 `present` 工具交付文件，每个文件会自动生成一条待审记录：

- 记录字段直接来自事件：`event.data.files[].path` 与可选的 `description`。
- 记录 ID 稳定可追溯：`presented:<sessionId>:<callId>:<index>`。
- 同一次调用交付多个文件时按顺序展开，路径重复时保留各自出现序号。

**你可以做的唯一"适配"**：给 `present` 的 `description` 写一句人能看懂的话。审阅台把它原样展示给审阅者，描述质量直接决定审阅效率。

### 2. `research_report` 密封结果（自动配对）

如果你的插件基于 [`dsh-research-report`](https://github.com/PerryLink/dsh-research-report) 产出密封研究报告，成功结果会自动生成两条记录：

- `report.md`（报告正文）——自动附带内置的"研究报告验收包"：四项必填检查（结论证据、引用来源、数据口径、方法限制）加一项可选复现检查，审阅者必须逐项填写证据后才能通过。
- `manifest.json`（清单与 seal 证据）——入库但不附带验收包。

配对规则由结果事件自身决定：`tool/result` 且工具名为 `research_report`、`event.data.meta.reportFile` 与 `meta.manifestFile` 均为非空字符串。`isError === true` 的失败结果不会入库。该规则已通过真实双插件互操作验证（见[验证记录](VALIDATION.md)），不要求研究插件做任何改动。

### 3. 工作区变更（只读展示）

宿主 `workspace/changes` 事件中的文件变更会以只读形式进入队列，含增删行数与二进制/超大标记。这条路径服务于"改了哪些文件"的复查场景，不产生验收包。

## 明确不会发生的事

- **不拦截、不改写**：审阅层只旁观事件，不修改你的工具调用或结果。
- **不自动发布**：通过审阅只代表人工确认，不会向任何外部平台发送内容。
- **不写回会话**：审阅动作不产生新的工具调用或消息。
- **不要求依赖**：你的插件无需声明对 Review Outbox 的依赖；未安装本插件时上述事件照常发生，只是没有审阅界面。

## 验收包：现状与路线

当前内置 `research-report` 场景验收包。场景包是版本化的检查规则（检查项、必填证据、通过条件），后续会开放给更多场景（文档交付、代码变更等）并允许按成果类型选择。在其开放前，其他类型成果进入队列后使用通用检查：预览、通过/退回、归档，不带结构化验收清单。

## 兼容性

- 目标宿主：DeepSeek Harness `0.2.2-rc.1`，官方事件契约（`deliverables/presented`、`tool/result`、`workspace/changes`）。
- 事件识别规则有单元测试锁定（`test/official-present.test.js`、`test/events.test.js`）；宿主事件形状变化会先破坏测试再发布，不会静默失配。
- 安装与恢复见[安装恢复指南](INSTALL-RECOVERY.md)。

## 验证你插件的产出会进入队列

1. 在装有 Review Outbox 的 Profile 中触发你的插件交付。
2. 打开左侧「成果审阅」，确认新记录出现且 `description` 可读。
3. 对 `research_report` 成果：确认报告条目带验收包、清单条目不带。

任何一条不符，欢迎在[仓库 Issues](https://github.com/zjukop3/dsh-review-outbox/issues) 提交事件样本（可脱敏），我们按证据修。
