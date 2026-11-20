# 2026-11-20 — 我把 27 个能打开的详情页判定成 404（假警报）

> 本文替换同名的前一版。前一版得出的结论是「27 条市场条目详情页全部 404，根因是我把
> `name` 写成 `owner/repo#package`，要提 9 个 PR 改名字」。**那个结论是错的**，错在我，
> 不在条目，也不在站点。保留这篇是因为错的过程比对的结论更有用。

## 发生了什么

我测了这些 URL，得到一片 404：

| 我测的 URL | 状态 |
| --- | --- |
| `/p/zjukop3/dsh-vertical-kit/` | 404 |
| `/p/zjukop3/dsh-verify-kit/` | 404 |
| `/p/zjukop3/dsh-license-check/` | 404 |
| `/p/zjukop3/dsh-handover-check/` | 404 |
| `/p/zjukop1/dsh-license-check/` | 404 |

对照组（他人条目 `/p/0-0-user/dsh-plan-note/` 与我的仓库名条目 `/p/zjukop3/dsh-review-outbox/`）
都是 200。于是我断定：条目在 feed 里，但页面推不出来，问题在 `name` 里的 `#`。
我还顺手查了上游目录，发现 **904 条**条目都用 `owner/repo#package` 写法——我把这当成
"生态主流写法，所以是我的锅"，提了个 9 个 PR 的修复计划。

## 错在哪

真实的 slug 规则是 `owner/repo--路径用短横连`，站点自己有：

```
https://github.com/zjukop3/dsh-vertical-kit/tree/main/packages/dsh-handover-check
  ->  zjukop3/dsh-vertical-kit--packages-dsh-handover-check
```

按这个规则测，**28/28 全部 200**，包括我判定"尚未被探针收录"的 `dsh-handover-check`
和 `dsh-expense-claim-check`：

| 真实 URL | 状态 |
| --- | --- |
| `/p/zjukop3/dsh-vertical-kit--packages-dsh-license-check/` | 200 |
| `/p/zjukop3/dsh-vertical-kit--packages-dsh-handover-check/` | 200 |
| `/p/zjukop3/dsh-verify-kit--packages-dsh-tablelint/` | 200 |

我用自己**猜的** URL 拼法（`/p/{owner}/{包名}/`）去判断"页面在不在"，而不是去读站点自己的
`slugOf()`。同一个错误在本次会话里已经是第四次：

1. `\b发票号码` —— 量的是正则拼写，不是"中文后面能不能匹配"
2. `subject-empty` 用 `.+` —— 量的是正则拼写，不是"空主题会不会被拒"
3. `git push | grep` / `grep up-to-date` / `[ $? -eq 0 ]` —— 量的是命令退出码，不是远端有没有那个 commit
4. 这一次 —— 量的是我猜的 URL，不是"用户点开得到 200 吗"

前三次的教训我写进了台账，还在 README 里立了"每条规则必须双向观察"的规矩。规矩没覆盖到
**验证脚本自己的输入**：我一直在审自己的校验规则，却没审自己造 URL 的那一行。

## 还有一个自己挖的坑：904 条对照组

查到 904 条同样写法的条目时，我本该立刻做一步对照——随便点开其中一条。
我做了，但用的是同一个错 URL（`/p/Kevin-McIsaac/dsh-workspace-git-badge/` → 404），
于是"别人的也 404"被我读成"这是站点级缺陷，我无能为力"，而不是
"我的测法在 904 条上一致地错"。**一个在所有样本上都失败的测法，第一个怀疑对象应该是测法。**

上游其实早就把规则写清楚了：issue #13437（已关闭）整篇在讲 `slugOf()` 怎么生成 slug、
哪些地方会漏编码。我 12 天前读过这个仓库的目录数据，没读这个 issue。

## 造成的实际损害

1. 一份错误的 incident 被提交并推到远端（`060a7f8`），会作为"事实依据"被后来的自己引用。
2. 一份 9 个 PR 的修复计划——如果我照做，会改 27 条本来正确的目录条目，把好数据改坏。
3. 一次错误的对外陈述："28 个包里只有 1 个能被点开"。

## 修正后的产物

- `scripts/check-detail-pages.mjs` 不再拼 `/p/{owner}/{包名}/`，改为复刻站点规则
  `slugOf(url)`，并且对 slug 函数本身做单元测试（含 #13437 里那个 `%20` 用例，
  必须复现站点的输出）。
- 实测口径：**28/28 详情页 200**。
- 顺带确认：`dsh-handover-check` 与 `dsh-expense-claim-check` 的详情页已存在，
  说明它们已被站点收录，之前"等 02:23 探针"的等待可以结束了。

## 教训（写给下一轮）

> 拿不到预期结果时，先怀疑自己的取数方式，再怀疑被测对象。
> 一个在所有样本上一致失败的测法，是测法有问题的最强信号。

并且：**验证脚本的输入也需要被验证**。规则双向观察只覆盖了"规则对不对"，
没覆盖"我喂给规则的东西对不对"。