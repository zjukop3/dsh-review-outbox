from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
from docx.shared import Pt

output = Path("docs/fixtures/research-viewer.docx")
output.parent.mkdir(parents=True, exist_ok=True)
document = Document()
styles = document.styles
for name in ("Normal", "Title", "Heading 1"):
    style = styles[name]
    style.font.name = "Arial"
    style.font.size = Pt(11 if name == "Normal" else 18)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), "PingFang SC")

document.add_heading("DSH 插件生态研究报告（Viewer 验证样例）", level=0)
document.add_paragraph("用途：验证 Review Outbox 调用官方 Office/PDF Viewer 的真实文件流程，不作为外部研究数据。")
document.add_heading("核心结论", level=1)
document.add_paragraph("成果审阅需要独立的证据、revision 和文件摘要。模型自报完成不等于人工验收。")
document.add_heading("引用与数据口径", level=1)
table = document.add_table(rows=1, cols=3)
table.style = "Table Grid"
for cell, text in zip(table.rows[0].cells, ("来源", "快照日期", "用途")):
    cell.text = text
for source, date, purpose in (("官方 DeepSeek Harness 源码", "2026-11-04", "验证事件与 Viewer 公共入口"), ("项目真实浏览器记录", "2026-11-06", "验证审阅与导出流程")):
    cells = table.add_row().cells
    for cell, text in zip(cells, (source, date, purpose)):
        cell.text = text
document.add_heading("方法与限制", level=1)
document.add_paragraph("本文件是合成 Viewer 验证样例。它证明文件可以打开和审阅，不证明研究结论真实，也不计入外部用户采用。")
document.save(output)

reopened = Document(output)
text = "\n".join(paragraph.text for paragraph in reopened.paragraphs)
assert "DSH 插件生态研究报告" in text
assert "核心结论" in text
assert "方法与限制" in text
assert len(reopened.tables) == 1
assert len(reopened.tables[0].rows) == 3
print(output)
