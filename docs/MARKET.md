# DSH 应用内市场索引

Review Outbox 同时提供 Awesome 社区目录和 DSH「发现」页面所需的 `format: 1` 索引。两者共享公开源码，但格式和使用场景不同：

- [Awesome 目录](https://awesome-dsh-plugin.com/p/zjukop3/dsh-review-outbox/)用于网页搜索、分类浏览和市场 registry。
- [DSH 应用内索引](https://zjukop3.github.io/dsh-review-outbox/plugins.json)用于宿主「插件 → 发现 → 添加索引源」，支持搜索、版本确认、提交固定、安装和启用。

当前源码索引版本为 `0.1.2`：密封研究报告进入成果审阅时自动附带研究报告验收包，manifest 不附加；用户可以更换或清除验收包，重复回填不会覆盖该选择。新导出的验收单默认链接到公开安装指南。Pages 的 `0.1.0` tarball 保持原版本，不伪装成包含此行为的安装包。

## 用户安装

在 DSH `0.2.2-rc.1` 的隔离或日常 Profile 中：

1. 打开「插件」，启用实验性「自定义插件索引」。
2. 打开「发现」，选择「添加索引源」。
3. 添加：

   ```text
   https://zjukop3.github.io/dsh-review-outbox/plugins.json
   ```

4. 搜索 `Review Outbox` 或 `研究报告`，检查版本、仓库和完整提交后点击「安装」。
5. 安装完成后回到「已安装」，启用 `dsh-review-outbox`。左侧出现「成果审阅」后即可使用。

「安装」和「启用」是两个独立步骤；安装后 Host 尚未挂载时，启用是必要的。

## 为什么需要单独索引

真实隔离验证中，直接把 Awesome 的 `https://awesome-dsh-plugin.com/plugins.json` 添加到 DSH「发现」会返回：

```text
https://awesome-dsh-plugin.com/plugins.json: $.format must be 1
```

该文件是目录 registry，不是宿主的应用内索引。`site/plugins.json` 使用 `@deepseek-ai/dsh-plugin-market-index@0.2.2-rc.1` 的 `parseMarketIndex` 逐字段校验，包含：

- `format: 1`、双语索引与插件标题、描述和分类。
- 精确 SemVer、发布时间和 DSH engines。
- Git source、完整 40 位公开提交。
- 内联 SVG 图标和双语搜索关键词。

应用内安装目标由官方 `marketInstallTarget` 生成：

```text
git+https://github.com/zjukop3/dsh-review-outbox.git#e9bb649d515a38de0f61226980f40e3d45173f1d
```

## 构建与更新

```bash
node scripts/build-market-index.mjs
```

默认读取 `market-release.json` 中的明确发布提交，并从该提交读取 Unix 发布时间；`DSH_MARKET_COMMIT` 仅作为显式覆盖。文档提交和普通 `HEAD` 移动不会悄悄改变用户的安装字节。索引不包含访问统计、用户身份或远程写入逻辑。

修改插件版本或运行代码后，先发布并验证目标提交，再把 `market-release.json` 的 `commit` 更新到该提交并重新生成索引：

```bash
DSH_MARKET_COMMIT=<full-public-commit> node scripts/build-market-index.mjs
npm run check
```

测试同时校验静态索引与 release 锚点一致，防止安装 pin 随文档提交漂移。

`test/market-index.test.js` 使用官方解析器验证索引、安装目标和重复构建的字节一致性。

## 真实界面验证

在全新隔离 `DSH_HOME` 和独立端口启动 DSH Web 后：

```bash
DSH_E2E_URL='http://127.0.0.1:<port>/?token=<token>' \
DSH_E2E_COMMIT=9f7e608a192094272638802e77ca9b1197f8cff1 \
node scripts/e2e-application-market.mjs
```

脚本覆盖启用发现、添加索引、中文搜索、提交确认、安装、启用、Host 健康和原生侧栏。最终公开索引证据见 [application-market.json](e2e/application-market.json)，Awesome registry 与 `format: 1` 的差异见 [application-market-format-check.json](e2e/application-market-format-check.json)。这是隔离安装验证，不计为外部用户激活或留存。

### 历史研究报告的首次价值

`scripts/seed-research-report-backfill.mjs` 用真实 `dsh-research-report` 工具在隔离临时 `DSH_HOME` 中生成安装前的密封报告和完整生产 JSONL。随后可从同一个公开固定提交安装并验证历史回填：

```bash
DSH_RESEARCH_REPORT_CHECKOUT=/absolute/path/dsh-research-report \
  node --experimental-transform-types scripts/seed-research-report-backfill.mjs "$DSH_HOME"

dsh plugin --profile web add \
  'github:zjukop3/dsh-review-outbox#9f7e608a192094272638802e77ca9b1197f8cff1'

DSH_E2E_URL='http://127.0.0.1:<port>/?token=<token>' \
DSH_E2E_RESEARCH_FIRST_VALUE=1 \
DSH_E2E_RESUME_INSTALLED=1 \
DSH_E2E_INSTALLATION_DRIVER='CLI github source after Discover network timeout' \
  node scripts/e2e-application-market.mjs
```

种子脚本只接受临时目录，不修改日常 Profile。恢复模式不重走「发现」搜索，因此证据中的 `searchQuery`、`searchCardVisible` 和 `marketSearches` 明确记录为未执行；本次对应 Profile 的 Discover 网络安装超时，使用 CLI 安装同一个公开提交，不把这次运行写成 Discover 安装成功。

浏览器逐项断言 report 与 manifest 两项回填、manifest 无验收包、report 默认 `research-report` 和 `0/4`、四项证据、通过及验收单下载。结果见 [application-first-value.json](e2e/application-first-value.json)，截图为 [首次价值](e2e/19-application-first-value.png) 与 [通过后](e2e/20-application-first-approved.png)。
