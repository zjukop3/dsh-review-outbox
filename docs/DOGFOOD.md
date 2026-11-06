# Review Outbox：20 个真实项目成果 Dogfood

日期：2026-11-06  
性质：**真实项目文件 + 官方工具 + 隔离 DSH 的脚本化审阅**，不是 demo 事件，也不是外部用户采用或第二周留存证据。

## 范围与链路

- 5 组独立任务：生态研究、项目文档、Host 核心、Client/测试、发布配置。
- 每组 4 个实际工作区文件，共 20 个成果。
- 每个成果均由官方 `present` 生成事件，使用生产默认 Zstandard JSONL 持久化。
- 在独立 `DSH_HOME` 和端口中安装插件、历史回填、逐份预览并执行审阅。
- 退回文件修改后，从原 Session 恢复，用新的真实 `callId` 再交付。
- 最终重启同一 Profile，检查全部状态、revision 和预览。

原始记录：[交付清单](dogfood/manifest.json)、[初次审阅](dogfood/initial-review.json)、[revision 交付](dogfood/revisions.json)、[复审](dogfood/final-review.json)、[最终状态](dogfood/final-state.json)、[重启检查](dogfood/restart.json)。公开版本仅将工作区绝对路径前缀替换为 `<workspace>`；未改写的原始证据单独保存在本机。

## 初次审阅结果

| 任务组 | 成果数 | 通过 | 退回 | 主要内容 |
|---|---:|---:|---:|---|
| 生态研究 | 4 | 4 | 0 | 主报告、方法、25 个固定提交、处理摘要 |
| 项目文档 | 4 | 1 | 3 | README、长期路线、验证记录、研究报告清单 |
| Host 核心 | 4 | 4 | 0 | Host、历史回填、Store、独立验收单 |
| Client/测试 | 4 | 2 | 2 | 客户端、样式、证据测试、官方工具测试 |
| 发布配置 | 4 | 4 | 0 | package、bundle patch、Host 测试、E2E 结果 |
| **合计** | **20** | **15** | **5** | 初次待办全部处置 |

20 份文件均通过真实文本预览。两份研究文档执行了完整研究报告验收包，四项必填证据和可选复现材料均写入持久状态。

自动化耗时仅用于性能观察：首次回填约 1411 ms，首次预览约 1434 ms，20 项脚本化预览和动作约 1783 ms。它们不是人的“首次价值时间”。

## 五项退回与修复

| 成果 | 退回原因 | 修复 |
|---|---|---|
| README.md | 测试数量仍是 31，缺少真实 Session resume 说明 | 更新当前数量，补跨 `callId` 的真实 revision 链 |
| STRATEGY.md | M0 标准未包含新增真实 revision 证据 | 更新数量与官方工具覆盖范围 |
| VALIDATION.md | 缺少重复成果问题和迟到旧事件防护记录 | 记录失败复现、身份修复和恢复 Session 测试 |
| client/styles.js | `button{font:inherit}` 未限定插件根节点 | 改为 `.ro-root button`，新增宿主样式隔离回归 |
| test/evidence.test.js | 临时目录和 64 MiB sparse fixture 未清理 | 所有目录注册 `t.after` 递归清理 |

修复过程中测试总数由退回时的 33 增至 34，文档按最终数量更新。

## 真实 revision 结果

- 重新交付 5 个退回文件后，成果总数仍为 **20**，没有变成 25 条重复成果。
- 初次复审时：15 个 revision 1、5 个 revision 2，全部通过。
- 每条退回成果保留“发现 → 退回 → 新 revision → 通过”历史。
- 每个 revision 都重新记录文件 SHA-256；旧验收包证据不会被带入新 revision。
- 重复回填 `changed=0`，不会重置已通过状态。
- [README revision 2 验收单](dogfood/readme.review-r2.html) 可独立打开，包含退回、revision 和最终通过记录。

本报告写入验证文档后，该文档又按同一官方 Session 再交付一次，形成 revision 3；最终分布为 **15 个 revision 1、4 个 revision 2、1 个 revision 3**，仍是 20 个唯一成果。[验证文档 revision 3 验收单](dogfood/validation.review-r3.html) 保留退回、两次 revision 和对应复审历史。

## 重启结果

- 20 个唯一成果全部 `approved`，待办 0。
- 重启后重复回填 `changed=0`。
- 20 份文本预览全部仍可读取。
- 状态文件权限为 `0600`。

## 对产品的实际改进

最重要的 dogfood 发现是：真实 `present` 每次调用的 `callId` 不同，单纯按调用 ID 入库会把同一路径的再次交付变成重复成果。现在 Store 按 Session、路径和同路径出现序号识别成果，同时保留最新真实调用坐标，并忽略迟到旧事件。

这次 dogfood 证明了真实文件的技术闭环和退回修复价值，但没有证明自然流量、外部留存或连续日常使用意愿。M1 仍需连续日常工作观察；不能用脚本动作代替用户留存。
