# 2026-11-20 — 27 条市场条目在 feed 里，但详情页全部 404

## 一句话

我的 28 个已发布包里，27 个（vertical-kit 22 + verify-kit 5）在 `awesome-dsh-plugin.com/index.json` 里
有条目，但它们的详情页 `/p/{owner}/{repo}/` 一律 404；唯一能打开的是名字等于仓库名的
`dsh-review-outbox`。也就是说：**能被搜到，不能被点开**。这不是内容质量问题，是分发面的问题。

## 证据（同一时间窗内的对照）

| URL | 状态 |
| --- | --- |
| `/p/0-0-user/dsh-plan-note/` | 200（他人条目，对照组） |
| `/p/zjukop3/dsh-review-outbox/` | 200（我的仓库名 = 包名那条） |
| `/p/zjukop3/dsh-vertical-kit/` | 404 |
| `/p/zjukop3/dsh-verify-kit/` | 404 |
| `/p/zjukop3/dsh-license-check/` | 404 |
| `/p/zjukop3/dsh-handover-check/` | 404 |
| `/p/zjukop3/dsh-expense-claim-check/` | 404 |
| `/p/zjukop1/dsh-license-check/` | 404 |

对照组在同一个窗口内 200，排除了"站点正好抖动"这一解释。逐包名、仓库名、npm 用户名三种拼法都试过，
全部 404。

## 根因

我提交的目录条目里，`name` 写的是 `zjukop3/dsh-vertical-kit#dsh-handover-check`：

```yaml
url: 'https://github.com/zjukop3/dsh-vertical-kit/tree/main/packages/dsh-handover-check'
name: 'zjukop3/dsh-vertical-kit#dsh-handover-check'
```

页面的路由是从 `name` 推出来的。`#` 在 URL 里是片段分隔符，推不出路径段；换成
`zjukop3/dsh-vertical-kit-dsh-license-check`、`dsh-license-check`、`%23` 编码三种写法同样 404。
而 `dsh-review-outbox` 这个包的仓库名恰好等于包名，条目 `name` 是干净的 `owner/repo`，页面就正常。

这是同一个家族的第三次：**量了一个拼写，而不是那个属性**。前两次是校验规则里量错了字符串
（`\b` 在中文后永不匹配、`subject-empty` 因为 `.+` 不可达），这次是分发面里量错了名字。

## 为什么之前没发现

我一直在数"feed 里有几条"，数出来 26/27/28，就当作分发成功。**条目存在 ≠ 用户能到达**。
我的验收口径里从来没有"点得开"这一项，只有"在里面"。这和之前那批假绿灯
（`git push | grep`、`grep up-to-date`、`[ $? -eq 0 ]`）是同一个错误：
用一个容易通过的代理指标，替代了真正的那个。

## 修复方向

1. 之后提交的条目，`name` 用**纯包名**（`dsh-handover-check`）或干净的 `owner/repo`；
   `url` 仍然指到子目录。子目录这件事交给 `url`，不要塞进 `name`。
2. 对已合并的 27 条，提一个改 `name` 的 PR；一次最多 3 条（`MAX_ENTRIES_PER_PR`），
   所以这是 9 个 PR 的活，不是 1 个。
3. 验收口径改成**逐个 GET 详情页**并断言 200，写进 `scripts/` 的发布后检查，
   而不是数 feed 长度。

## 教训

指标的分子必须是用户实际能做到的那一步。能被检索到、但点开是 404，用户看到的是一个坏站点，
比不在里面更糟——不在里面只是没被发现，点开 404 是**被发现之后失败**。