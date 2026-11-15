<!-- 2026-12-01 提交用：复制本文件正文到新 issue，先跑 report:monthly 刷新趋势表与数字。标题建议：目录/市场「下载」列的发布日标记（带可复现测量与 mockup） -->

## 提案（一句话）

列表/市场页的「下载」列：当某包**单日下载 ≥ 周总量 50%**（判定窗口排除最近两天——npm 上报滞后）时，显示「发布日」徽标而非裸数字。**不改排序**，只改展示。

## 依据

**1. 底噪带是结构性的，跨三个测量点稳定**（窗口滑动、结构不动）：

| 测量日（窗口止） | 样本 | 底噪带 | 真实日用 | 爆发形 |
|---|---|---|---|---|
| 2026-11-10（11-08） | 198 | 58.6% | 6.1% | 19.7% |
| 2026-11-15（11-13） | 198 | 60.1% | 8.1% | 28.3% |
| 2026-12-01（11-29） | 200 | *提交日刷新* | *…* | *…* |

约六成条目停在底噪带（每天几十次下载、与是否有人用无关），发版爆发形常驻两成上下（三点区间 19.7%–28.3%，随目录新增缓升）。

**2. 自己的包是现成展品**：`dsh-review-outbox` 周下载 1,997、前 6.2%，但前两天占 82%（发版日 11-09 单日 1,131 = 安静日的 8–31 倍）。裸数字会让人读出「前 6% 的插件」，而它的安静日形状与没人用无法区分。

**3. 独立同行背书**：zuwenyin 在 #11870 独立确认同一底噪，量化其包发版日开销为安静日的 **8.3 倍**，并以 react（四千万日下载量级）证明上报滞后（最近两天报 0）。不同量级、同一种形状。

## 效果

并排 mockup（真实日值分解，非编造样例）：
https://zjukop3.github.io/dsh-review-outbox/proposal-demo/

## 实现（两个可选接入点，都不需要新数据源）

- **索引携带**：format 1 索引 version 条目含 `publishTimestamp`；UI 判「最新版发布 < 7 天」且「单日 ≥50%」两个条件同时满足时打标。
- **UI 自查**：直拉 npm downloads API 日值序列（`/downloads/range/`），同样两个条件。

## 不做什么

换排序口径 / 换信号源——#13819 已有维护者结论，本提案不动排序。

## 复现

```bash
node scripts/ecosystem-snapshot.mjs --shapes 200 --seed 20261110   # 爆发形占比
node scripts/ecosystem-snapshot.mjs --package dsh-review-outbox    # 展品全量数据
```

完整论证：[SIGNAL-PROPOSAL.md](https://github.com/zjukop3/dsh-review-outbox/blob/main/docs/SIGNAL-PROPOSAL.md) · 方法论：[底噪基线](https://zjukop3.github.io/dsh-review-outbox/baseline/) · 每期刷新：[生态月报](https://zjukop3.github.io/dsh-review-outbox/ecosystem/)
