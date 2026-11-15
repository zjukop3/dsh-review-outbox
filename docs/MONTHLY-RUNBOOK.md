# 月度测量 runbook（每月 1 日）

 monthly 页与信号提案的数据都在这一天刷新。顺序重要：**report:monthly 读取最新的 weekly 文件**，所以先组装元数据、编辑完账本，再构建页面。

## 1. 组装 weekly 元数据

```bash
npm run weekly:meta -- --date YYYY-MM-DD
```

自动写入：目录规模与增长（对比上一份 weekly）、review-outbox 周下载与日值分解（7 天窗口，滞后两天如实记 0）、两个 kit 仓库的 GitHub 克隆数。

## 2. 编辑上游账本（人工）

打开 `docs/metrics/YYYY-MM-DD-ecosystem-weekly.json` 的 `upstream` 段——这一段是从上一份**沿用**的，逐条核对后更新：PR / issue / 讨论的状态变化（merged / open / closed + 一句结论）。线程需要读，不适合抓取。

## 3. 构建月报页

```bash
npm run report:monthly -- --date YYYY-MM-DD
```

自动：shapes 采样（200 包、固定 seed，写第三/四…个时间点）→ 构建页面，拾取最新 weekly 与**全部** shapes 点（底噪稳定性表自动加行）。

## 4. 信号提案 issue（仅当月报支持提案时）

- 刷新 `docs/SIGNAL-PROPOSAL-ISSUE.md` 的趋势表占位行（新测量点的三个数字）；
- 粘贴到新 issue（**目标仓库 dsh-market/dsh-market**，feature_request 模板；先搜 roadmap issues 确认无人提过下载列语义，相邻为 #934/#1008）；标题：市场「下载」列的发布日标记（带可复现测量与 mockup）；
- 链接：[mockup](https://zjukop3.github.io/dsh-review-outbox/proposal-demo/) · [月报](https://zjukop3.github.io/dsh-review-outbox/ecosystem/) · [完整提案](https://github.com/zjukop3/dsh-review-outbox/blob/main/docs/SIGNAL-PROPOSAL.md)。

## 5. 提交与部署

```bash
npm run check    # 含链接审计
git add docs/metrics site && git commit && git push
```

Pages 部署后，月报新版自动进 sitemap。

## 相关

- 发布（非月度测量）走 [RELEASE-RUNBOOK.md](RELEASE-RUNBOOK.md)：版本号、发布 pin、自举页烙印、registry 验证顺序。

## 已知口径

- 排名随目录膨胀浮动（11-15 当天 #318→#347），issue 里以当日运行为准；
- npm 日值最近两天常为 0（上报滞后），一切「单日占比」判定都排除它们；
- 操作者自用更新：0.1.11 发布于 2026-11-15 晚，市场冷却 24h 后（11-16 晚起）应用内更新入口可见；显式钉版本 `dsh-review-outbox@0.1.11` 不受冷却限制。F1（11-17）前更新即可让 funnel 测到最新版的自用数据；
- 周窗口含头含尾恰好 7 天。
