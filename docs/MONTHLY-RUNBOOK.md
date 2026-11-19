# 月度测量 runbook（每月 1 日）

 monthly 页与信号提案的数据都在这一天刷新。顺序重要：**report:monthly 读取最新的 weekly 文件**，所以先组装元数据、编辑完账本，再构建页面。

## 前置条件

- Node ≥ 22.19；`jq` 可选（只用于人眼看 JSON）。
- 能连 registry.npmjs.org（拉每个包的周下载数）和 api.github.com（读目录仓库的文件）。
- 上一次的月报文件在 `site/ecosystem/` 下，第一次跑时目录可能为空——空目录也能跑，只是"环比"一栏会缺。

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

自动：shapes 采样（200 包、固定 seed，写第三/四…个时间点）→ 采用漏斗（读本地 App 状态，免费）→ 构建页面，拾取最新 weekly 与**全部** shapes/funnel 点（底噪稳定性表与采用漏斗表自动加行）。

## 4. 信号提案（已撤回，2026-11-16）

提案以 [dsh-market #1207](https://github.com/dsh-market/dsh-market/issues/1207) 提交并按维护者的重开条件跑了排名分层测量——数据不支持（TOP-200 爆发形 10.8% vs 全目录 28%），已如实撤回。月度测量照常；若未来数据变化（如排名分层结果反转），重启对话时引用 #1207 与本仓库的 `--shapes-rank` 模式。

- 刷新 `docs/SIGNAL-PROPOSAL-ISSUE.md` 的趋势表占位行（新测量点的三个数字）；
- 粘贴到新 issue（**目标仓库 dsh-market/dsh-market**，feature_request 模板；先搜 roadmap issues 确认无人提过下载列语义，相邻为 #934/#1008）；标题：市场「下载」列的发布日标记（带可复现测量与 mockup）；
- 链接：[mockup](https://zjukop3.github.io/dsh-review-outbox/proposal-demo/) · [月报](https://zjukop3.github.io/dsh-review-outbox/ecosystem/) · [完整提案](https://github.com/zjukop3/dsh-review-outbox/blob/main/docs/SIGNAL-PROPOSAL.md)。

## 5. 提交与部署

```bash
npm run check    # 含链接审计
git add docs/metrics site && git commit && git push
```

Pages 部署后，月报新版自动进 sitemap。

## 验证

推送之后按顺序确认三件事，任何一条不对就说明这一版月报不可信：

1. `curl -s -o /dev/null -w '%{http_code}' https://zjukop3.github.io/dsh-review-outbox/ecosystem/<日期>.html` 返回 200——Pages 部署通常要等 1–3 分钟，200 之前不要去核对数字；
2. 月报页的目录总数与 `docs/metrics/<日期>-ecosystem-baseline.json` 里的 `total` 相等，分类前四名与 JSON 一致——页面上任何数字都应该能在 JSON 里找到同一个；
3. `site/sitemap.xml` 里出现了这一期的 URL。没进 sitemap 等于搜索引擎看不到，等于这一期白做。

## 回滚

这期数字错了（口径变了、目录快照抓歪、环比算错）就走这条，不要"就地改一版"覆盖——覆盖之后没人知道哪一版是错的：

```bash
git revert --no-edit <这期的提交>
npm run check && git push     # 重推，让 Pages 回到上一期
```

Pages 上旧页面会保留（历史期次按日期命名，不覆盖），所以回滚的实质是**把 sitemap 和首页的入口退回上一期**，历史页仍可访问。如果错的只是某一期的一个数字，允许直接修那一期的文件并单独提交，但提交信息里要写清修的是哪一期、错在哪——不要把它混进下一期的提交里。

## 相关

- 发布（非月度测量）走 [RELEASE-RUNBOOK.md](RELEASE-RUNBOOK.md)：版本号、发布 pin、自举页烙印、registry 验证顺序。

## 已知口径

- 排名随目录膨胀浮动（11-15 当天 #318→#347），issue 里以当日运行为准；
- npm 日值最近两天常为 0（上报滞后），一切「单日占比」判定都排除它们；
- 操作者自用更新：0.1.11 发布于 2026-11-15 晚，市场冷却 24h 后（11-16 晚起）应用内更新入口可见；显式钉版本 `dsh-review-outbox@0.1.11` 不受冷却限制。Profile 的每日自动更新（22:42 cadence）在 11-15 那次跑在冷却结束前，所以 11-15 当晚不会动；11-16 22:42 的周期在冷却结束后，F1（11-17）测到的应是 0.1.11 的自用数据；
- 周窗口含头含尾恰好 7 天。
