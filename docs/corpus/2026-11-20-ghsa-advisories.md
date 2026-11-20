# 真语料：20 条 GHSA 公告跑 dsh-security-advisory-check

2026-11-20，用来校准 `dsh-security-advisory-check` 的默认口径。这是这个包第一次吃到
真实第三方语料——此前它只有自己写的 fixture。

## 取样与方法

- 来源：`GET https://api.github.com/advisories?per_page=20&direction=desc`（公开接口）
- 只取 API 里字段化的事实，按公告的写法拼成一份文档：标题、公告编号、CVE、严重程度、
  受影响版本（`vulnerable_version_range`）、修复版本（`patched_versions`）、披露日期，
  正文用真实的 `description` markdown 原文。
- 拼装方式是刻意的：任何一条发现都只能来自措辞或结构，不能来自「我没给信息」。

跑法：`/tmp/corpus/probe-advisory.mjs`（一次性脚本，逻辑就是上面这段）。

## 第一次跑的结果

```
1/20 零发现
  18× workaround-missing
  15× contact-missing
  13× fixed-missing
```

三件事浮出来：

1. **20 条里 20 条没有 `patched_versions`**。也就是说这 20 条真实公告全部处于「尚未
   发布修复版本」的状态。规则只报了 13 条，另外 7 条被正文里的散文（"fixed in …"式
   说法）放过了——那 7 条其实是有答案的，规则静默是对的。
2. `contact-missing` 15/20、`workaround-missing` 18/20。**一条在大多数合法文档上都
   开火的警告不是信号，是噪音**：它会训练读者忽略所有 warn。
3. `fixed-missing` 那 13 条是真缺陷吗？是。文档里既没有修复版本，也没说「暂无修复」，
   读者无法区分「还没修」和「作者漏写」。但把这条**当成「必须有修复版本」来报**是错的
   ——未修复的公告是合法文档，缺的是那句说明。

## 改了什么

| 规则 | 改前 | 改后 |
| --- | --- | --- |
| `fixed-missing` | 没有修复版本号 → error | 既没有修复版本、也没写「暂无可用修复」→ error |
| `workaround-missing` | 默认 warn（`--require-workaround` 升级为 error） | **默认不查**，`--check-workaround` 打开 |
| `contact-missing` | 默认 warn | **默认不查**，`--check-contact` 打开 |

`--require-workaround` 作为旧参数名保留，避免 0.1.1 的调用方失效。

## 改完再跑

```
7/20 零发现
  13× fixed-missing
```

13 条全部是「没写有没有修复」这一个真问题，没有噪音项。7 条零发现里包括正文自己写了
修复信息的公告。这个分布可以直接写进 README 当承诺，因为它是量出来的。

## 教训

> 一条规则该不该默认开，取决于它在**真实合法文档**上的开火率，不取决于它在坏样例上
> 能不能响。开火率接近 1 的 warn，等价于没有这条 warn，还外加教人忽略警告的副作用。

顺带发现：`checks-data.mjs` 里 `dsh-handover-check` 与 `dsh-expense-claim-check` 的
示例输出早已和真实运行不一致（前几轮改了提示文案却没刷新）。已加
`scripts/sync-example-output.mjs`，按行重写每个条目的 `output`，并挂进 `npm run check`
——示例输出与真实运行的关系，现在是一条闸，不是一次手工同步。