# 参与贡献

感谢考虑贡献。这里是个人维护的 0.1.x 验证阶段项目，反馈和 PR 都欢迎。

## 提问题

- 界面或安装问题：用 [Bug report 模板](.github/ISSUE_TEMPLATE/bug_report.yml)开 issue，样本脱敏。
- 插件集成问题（你的插件产出没有进入审阅队列）：先按[插件作者集成指南](docs/INTEGRATION.md)的"验证你插件的产出会进入队列"自查，再带事件样本提 issue。

## 提 PR

1. Fork 后从 `main` 拉分支。
2. `pnpm install --ignore-scripts && pnpm run check` 必须通过（45 项测试 + 客户端构建）。
3. 行为变化需要证据：浏览器流程或互操作脚本输出，存入 `docs/e2e/` 并在 PR 描述引用。
4. `market-release.json` 的 pin 只在运行时行为变化且经真实安装验证后移动；文档提交不动 pin。
5. PR 模板的自查清单逐项确认。

## 设计边界

新增功能前先读[长期路线](docs/STRATEGY.md)的"决策纪律"：不重复通用工作流类产品、不冒充自动事实核查、不自动发布或改写会话、不用安装量替代真实审阅行为。
