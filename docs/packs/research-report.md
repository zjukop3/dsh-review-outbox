# DeepSeek Harness 研究报告验收清单与 Review Outbox 验收包

适用于 AI 研究报告、文献综述、市场调研、技术调研和带引用的分析文档。核心问题是：**模型说“已完成”之后，审阅者怎样确认结论、引用、数据口径和方法限制真的经过复核？**

Review Outbox 将下面这份清单变成持久化检查项、通过条件和独立 HTML 验收单。即使不安装插件，也可以直接复制清单使用。

## 四项必填检查

- [ ] **核心结论有对应证据**：逐条核对核心结论，记录支持结论的正文位置、数据或原始来源。
- [ ] **引用来源可复核**：引用能定位到作者或机构、标题、日期及 URL/DOI，并确认原文确实支持对应论断。
- [ ] **数据时间与统计口径明确**：核对统计区间、时区、单位、样本范围和比较基线。
- [ ] **方法与限制已披露**：检查检索或实验方法、纳入排除标准、局限性和重要相反证据。

在插件中，仅勾选还不够；每项都必须填写可定位、可复核的证据说明，才能完成“通过”。

## 一项可选检查

- [ ] **复现材料可定位**：需要复现的报告提供脚本、数据、环境和步骤；不适用时记录原因。

## 在 Review Outbox 中使用

1. 让 Agent 正常完成报告并通过官方 `present` 交付。
2. 打开「成果审阅」，选择报告和「研究报告验收」。
3. 阅读报告，逐项填写证据；勾选表示已完成该项人工检查。
4. 四项必填证据齐全后通过；需要返工时填写退回意见。
5. 通过后导出独立 HTML 验收单，与报告一起提供给成果接收者。

插件也接收安装前持久化 Session 中的官方交付，不要求上游研究插件专门适配。

## 验收单包含什么

- 报告文件名、revision、状态和审阅意见
- 每项检查的完成状态与证据说明
- 处理历史
- 通过或退回时的文件 SHA-256
- 导出时文件与审阅时摘要是否一致
- Review Outbox 插件入口

验收单是无脚本、无外部资源的独立 HTML，接收者无需安装即可打开。它不自动上传，不写入原报告，不包含本机绝对路径或会话内容；证据与意见按审阅者填写内容导出。

## 边界

本验收包记录的是**人工审阅证据**，不会自动访问 URL、验证 DOI、判断来源真伪或替代领域专家。当前文本报告流程最完整；Office/PDF 内嵌预览仍待复用成熟 Viewer。

## English search summary

**Research report acceptance checklist for DeepSeek Harness:** verify claims against evidence, inspect citations, confirm data scope and dates, disclose methods and limitations, record reproduction materials, and export a standalone SHA-256 review receipt. Review Outbox stores human review evidence; it does not claim automatic fact-checking.
