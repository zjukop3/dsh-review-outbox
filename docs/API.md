# Review Outbox HTTP 接口参考

Review Outbox 在 DSH 的 Web 服务上注册一个前缀 `/review-outbox/api`，下面有 12 条路由。它们在 DSH 进程内运行，读写的是同一个 `store`，也就是左侧「成果审阅」面板看到的那份数据。这份文档按代码里的实际分支写，不是按设计意图写。

## 鉴权

没有 token，也没有 API key。

路由在每次请求进来时调用宿主的 `connection.requestRejection({ headers })`：只有在 DSH 的 `connection` 服务不可用时才一律返回 403。也就是说，**能不能调取决于 DSH 自己认不认这条连接**，插件不额外加一层。

因此：浏览器里任何网页都能向你本机的这个前缀发请求，和它能不能调其它 DSH 插件路由的风险相同。这不是一个可以暴露到公网的接口，`host` 不要绑 `0.0.0.0`。需要把成果给别人看，用 `GET /receipt` 导出的独立验收单，那是纯 HTML，不依赖本机服务。

## 通用约定

- 请求体是 JSON。`POST` 的 `content-type` 不校验，但解析失败会返回 400。
- 查询参数从 URL 取，路径参数不存在——所有单条资源的定位都用 `?id=`。
- 时间一律 ISO 8601 字符串（`2026-11-19T04:12:33.000Z`）。
- 响应头是 `application/json; charset=utf-8`；只有 `GET /receipt` 返回 HTML 并带附件文件名。

## GET /review-outbox/api/health

存活与规模。面板启动时先调这条。

```bash
curl -s http://127.0.0.1:PORT/review-outbox/api/health
```

```json
{
  "ok": true,
  "version": 1,
  "items": [],
  "pending": 0,
  "stateError": null,
  "backfill": {
    "status": "idle",
    "listed": 0,
    "scanned": 0,
    "discovered": 0,
    "changed": 0,
    "truncated": false,
    "errors": [],
    "startedAt": null,
    "finishedAt": null
  }
}
```

`stateError` 非空表示状态文件读写出过问题，此时 `items` 可能是上一份内存快照而不是磁盘内容。

`backfill.status` 取值：`idle`、`running`、`done`、`unavailable`、`disabled`（插件配置了 `backfill: false`）。`listed` 是列出的条目数，`scanned` 是真正读过的数，`truncated` 为 `true` 表示这一轮达到上限提前收尾。

## GET /review-outbox/api/packs

可用的验收包清单，也就是「用哪套清单来审」。

```bash
curl -s http://127.0.0.1:PORT/review-outbox/api/packs
```

```json
{
  "packs": [
    {
      "id": "research-report",
      "version": 1,
      "label": "研究报告验收",
      "summary": "核对结论、引用、数据口径和方法限制。",
      "checks": [
        {
          "id": "claims-evidence",
          "label": "核心结论有对应证据",
          "required": true,
          "requirement": "逐条核对核心结论，记录能支撑结论的正文位置、数据或原始来源。",
          "placeholder": "例：结论 1 见第 3 节表 2；样本数据与结论一致。"
        }
      ]
    }
  ]
}
```

## GET /review-outbox/api/items

全部成果，加一次汇总。可选 `?status=pending|approved|returned|archived` 过滤。

```bash
curl -s 'http://127.0.0.1:PORT/review-outbox/api/items?status=pending'
```

```json
{
  "version": 1,
  "items": [
    {
      "id": "3f2a…",
      "status": "pending",
      "title": "华东区渠道回款变化",
      "path": "/Users/me/reports/q3.md",
      "firstSeenAt": "2026-11-19T03:40:00.000Z",
      "updatedAt": "2026-11-19T03:40:00.000Z",
      "reviewPack": {
        "id": "research-report",
        "version": 1,
        "checks": {
          "claims-evidence": { "checked": false, "detail": "" },
          "citations-accessible": { "checked": false, "detail": "" },
          "data-scope": { "checked": false, "detail": "" },
          "method-limitations": { "checked": false, "detail": "" },
          "reproduction": { "checked": false, "detail": "" }
        }
      },
      "reviewProgress": {
        "completed": 0,
        "total": 5,
        "requiredCompleted": 0,
        "requiredTotal": 4,
        "complete": false,
        "incomplete": ["claims-evidence", "citations-accessible", "data-scope", "method-limitations"]
      }
    }
  ],
  "pending": 1,
  "stateError": null,
  "backfill": { "running": false, "scanned": 0, "queued": 0, "errors": [] }
}
```

## GET /review-outbox/api/item

单条成果，带验收进度。必须给 `?id=`。

```bash
curl -s 'http://127.0.0.1:PORT/review-outbox/api/item?id=3f2a…'
```

```json
{
  "item": {
    "id": "3f2a…",
    "status": "pending",
    "reviewProgress": { "completed": 2, "total": 5, "requiredCompleted": 2, "requiredTotal": 4, "complete": false, "incomplete": ["data-scope", "method-limitations"] }
  }
}
```

两个形状容易混：**包的 `checks` 是数组**（定义，来自 `/packs`），**成果里的 `reviewPack.checks` 是以 checkId 为键的对象**（状态，带 `checked` 与 `detail`）。`reviewProgress` 里没有 `ready` 字段，判断能不能通过看 `complete`；`incomplete` 直接列出还没完成的 checkId。

找不到返回 404：

```json
{ "error": "Item not found" }
```

## GET /review-outbox/api/preview

成果内容的预览。图片走 `dataUrl`，文本走原文，二进制走 `unsupported`。

```bash
curl -s 'http://127.0.0.1:PORT/review-outbox/api/preview?id=3f2a…'
```

```json
{
  "preview": {
    "kind": "text",
    "path": "/Users/me/reports/q3.md",
    "bytes": 2048,
    "text": "# 华东区渠道回款变化\n…"
  }
}
```

`kind` 取值：`text`、`image`（带 `mime`、`dataUrl`）、`unsupported`（带 `extension`）、`unavailable`。文件在工作区外时，除非插件配置了 `allowOutsideWorkspace`，否则拒绝读取。

## GET /review-outbox/api/receipt

导出独立验收单。返回 HTML，`content-disposition: attachment`，文件名形如 `review-receipt-<id>.html`。这份文件不依赖本机服务，可以直接发给别人。

```bash
curl -s -OJ 'http://127.0.0.1:PORT/review-outbox/api/receipt?id=3f2a…'
```

响应不是 JSON，是一个完整的 HTML 文档，内含当前证据的 SHA-256 摘要与每条决策的时间。

## GET /review-outbox/api/diff

工作区变更类的成果，取这次改动的 diff。其它来源的成果返回 400。

```bash
curl -s 'http://127.0.0.1:PORT/review-outbox/api/diff?id=3f2a…'
```

```json
{ "preview": { "kind": "text", "text": "--- a/q3.md\n+++ b/q3.md\n@@ -1,3 +1,4 @@\n…" } }
```

宿主没有提供 `workspaceChanges` 服务，或 diff 超时（5 秒），都会返回 `{ "preview": { "kind": "unavailable" } }`，状态码仍是 200。

## POST /review-outbox/api/sample

在空配置里造一条示例成果，让整条流程（预览 → 处置 → 验收单）在第一个真实成果出现前就能走一遍。写一个小 Markdown 文件到 `~/review-outbox/sample/` 并入队，带 `research-report` 验收包。

```bash
curl -s -X POST http://127.0.0.1:PORT/review-outbox/api/sample
```

```json
{
  "version": 1,
  "items": [
    {
      "id": "8b71…",
      "status": "pending",
      "path": "/Users/me/review-outbox/sample/sample-review-m3x1p2.md",
      "reviewPack": { "id": "research-report", "version": 1 },
      "reviewProgress": { "completed": 0, "total": 5, "requiredCompleted": 0, "requiredTotal": 4, "complete": false }
    }
  ],
  "pending": 1
}
```

**状态码是 201，不是 200**——这是这份文档里唯一一条非 200 的成功响应。写客户端时按 2xx 判断，别按 200。

## POST /review-outbox/api/pack

给一条成果换验收包。传空 `packId` 表示清空，回到无清单状态。

```bash
curl -s -X POST http://127.0.0.1:PORT/review-outbox/api/pack \
  -H 'content-type: application/json' \
  -d '{"id":"3f2a…","packId":"research-report"}'
```

```json
{ "item": { "id": "3f2a…", "reviewPack": { "id": "research-report" } }, "pending": 1 }
```

`packId` 不存在返回 400 `{"error":"Review pack not found"}`。

## POST /review-outbox/api/check

勾选或取消一项验收证据。`checked` 必须是布尔值，`detail` 是书面证据，非字符串会被当成空串。

```bash
curl -s -X POST http://127.0.0.1:PORT/review-outbox/api/check \
  -H 'content-type: application/json' \
  -d '{"id":"3f2a…","checkId":"claims","checked":true,"detail":"第 1 节的三个结论各自对应一份渠道回款明细"}'
```

```json
{
  "item": {
    "id": "3f2a…",
    "reviewPack": { "checks": { "claims-evidence": { "checked": true, "detail": "第 1 节的三个结论各自对应一份渠道回款明细" } } },
    "reviewProgress": { "completed": 1, "total": 5, "requiredCompleted": 1, "requiredTotal": 4, "complete": false, "incomplete": ["citations-accessible", "data-scope", "method-limitations"] }
  },
  "pending": 1
}
```

两种 400 的判定顺序是先查清单、后查类型：`id` 指向的成果不存在或没有验收包时，无论如何都先得到 `{"error":"Review check not found"}`；只有当 `checkId` 确实在当前包里，`checked` 不是布尔才会得到 `{"error":"checked must be a boolean"}`。

## POST /review-outbox/api/backfill

触发一次回填扫描：把历史上已经交过、但没进队列的成果补进来。立即返回，扫描在后台继续，进度看 `backfill`。

```bash
curl -s -X POST http://127.0.0.1:PORT/review-outbox/api/backfill
```

```json
{
  "version": 1,
  "items": [],
  "pending": 0,
  "backfill": { "status": "running", "listed": 0, "scanned": 0, "discovered": 0, "changed": 0, "truncated": false, "errors": [], "startedAt": "2026-11-19T04:30:00.000Z", "finishedAt": null }
}
```

扫描过程中 `status` 为 `running`，结束后变 `done`。`errors` 里每条是 `{ path, message }`——单个文件读不了不会中断整轮。宿主没有提供会话持久化服务时，`status` 直接是 `unavailable`。

## POST /review-outbox/api/action

对一条成果做处置。`action` 取 `approve`、`return`、`archive`、`reopen`。

```bash
curl -s -X POST http://127.0.0.1:PORT/review-outbox/api/action \
  -H 'content-type: application/json' \
  -d '{"id":"3f2a…","action":"approve","note":"四项证据齐了"}'
```

```json
{ "item": { "id": "3f2a…", "status": "approved" }, "pending": 0 }
```

`approve` 与 `return` 会先快照当前证据（SHA-256），并检查四项必填证据是否齐全；没齐返回 400，不会写入状态。`archive` 不要求证据。

**按会话批量处置**：传 `sessionId` 而不是 `id` 时走批量路径，且**只允许 `archive`**。传其它动作返回 400 `{"error":"Bulk actions are limited to archive"}`。这是有意为之：批准与打回各自携带一个人的决策和证据，只能一条一条来。

```bash
curl -s -X POST http://127.0.0.1:PORT/review-outbox/api/action \
  -H 'content-type: application/json' \
  -d '{"sessionId":"sess-9c1","action":"archive","note":"本轮无关成果，整批归档"}'
```

```json
{ "archived": 47, "pending": 52 }
```

该会话里没有待处置成果时返回 400，而不是 `archived: 0`：

```json
{ "error": "No pending items in this session" }
```

## 错误形状

所有错误都是 `{"error": "<一句话>"}`，没有错误码字段，也没有 envelope。按状态码区分：

| 状态码 | 何时 |
| --- | --- |
| 400 | 请求体不是合法 JSON、必填字段缺失、`checkId`/`packId` 不存在、`checked` 不是布尔、批量处置用了 archive 以外的动作、批量归档了一个没有待处置成果的会话（`No pending items in this session`）、对非工作区变更取 diff |
| 403 | DSH 的 `connection` 服务不可用，整条前缀一律拒绝 |
| 404 | 路由不存在（`{"error":"Route not found"}`）、`?id=` 找不到成果、`GET /receipt` 的目标文件已不在磁盘 |
| 405 | 不会出现：方法不匹配时落到 404，而不是 405 |

`405` 那一行是照代码写的实测结论：分发用的是「方法 + 末段路径」的精确比较，没有单独的方法校验分支，所以 `PUT /items` 返回的是 404 而不是 405。写接口客户端时不要依赖 405。

## 复现

这份文档里的每个形状都可以用两条命令核对：

```bash
npm test                      # 含路由与面板的一致性测试
node -e 'import("./src/host.js").then(m=>console.log(typeof m.apply))'
```

接口的实际分支在 `src/host.js` 的 `handler` 里，路径常量是同一文件顶部的 `API_PREFIX`。

`test/route-contract.test.js` 把这份文档里的每个状态码和响应形状都对着真 handler 断言了一遍，包括上面那个 404-而不是-405 的怪处和批量处置只收 archive 的约束。文档与代码不一致时以代码为准；不一致到那条测试会红，所以通常轮不到你来发现。

第一版这份文档里写错了六处，全部是先写文档、后跑探针才发现的：`backfill` 的字段名（写成 `running`/`queued`，实际是 `status` 加四个计数器）、批量归档空会话的返回（以为 200 带 `archived: 0`，实际 400）、`check` 两种 400 的判定顺序、`reviewProgress` 的字段（写成 `checked`/`total`/`ready`，实际是 `completed`/`requiredCompleted`/`complete`/`incomplete`）、以及包的 `checks` 是数组而成果里的 `reviewPack.checks` 是对象。最后两条是前端最常读的字段。第六处是 `POST /sample`：第一版根本没写这条路由，而且它返回 201 而不是 200。