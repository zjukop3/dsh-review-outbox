"""Build the downloadable checklist template (DOCX) from docs/checklist.txt.

The plain-text checklist is the source of truth; this renders the same content as
a form a reader can print or fill in, so the page offers both without inventing a
second version of the rules.
"""
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "downloads" / "review-outbox-checklist.docx"

ACCENT = RGBColor(0x17, 0x6B, 0x48)
MUTED = RGBColor(0x52, 0x52, 0x52)

document = Document()
style = document.styles["Normal"]
style.font.name = "Helvetica"
style.font.size = Pt(10.5)

title = document.add_paragraph()
title_run = title.add_run("研究报告验收清单")
title_run.bold = True
title_run.font.size = Pt(22)
title_run.font.color.rgb = ACCENT

lead = document.add_paragraph()
lead_run = lead.add_run("四项必填检查都要有勾选和书面证据，报告才算通过。清单可直接打印或填写，不需要安装任何工具。")
lead_run.font.color.rgb = MUTED

document.add_paragraph()

def section(heading, requirement, example):
    document.add_paragraph(heading, style="Heading 2")
    document.add_paragraph(requirement)
    example_paragraph = document.add_paragraph()
    run = example_paragraph.add_run("例如：" + example)
    run.font.color.rgb = MUTED
    run.font.size = Pt(9.5)
    table = document.add_table(rows=2, cols=2)
    table.style = "Table Grid"
    table.cell(0, 0).text = "已完成"
    table.cell(0, 1).text = "证据（位置 / 数据 / 来源）"
    table.cell(1, 0).text = "☐"
    table.cell(1, 0).paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph()

section(
    "1. 核心结论有对应证据",
    "逐条核对结论，记录支持它的正文位置、数据或原始来源。",
    "结论 1 见第 3 节表 2；样本数据与结论一致。",
)
section(
    "2. 引用来源可复核",
    "引用能定位到作者或机构、标题、日期及 URL/DOI，并且来源确实支持对应论断。",
    "抽查引用 [1] [3] [5]，链接可访问，原文段落与报告表述一致。",
)
section(
    "3. 数据时间与统计口径明确",
    "核对统计区间、时区、单位、样本范围和比较基线，避免直接比较不同口径的数据。",
    "数据截至 2026-10-31，UTC；金额均为人民币，同比基线一致。",
)
section(
    "4. 方法与限制已披露",
    "检查检索或实验方法、纳入排除标准、局限性和重要相反证据。",
    "检索式与数据库已记录；仅覆盖公开中文资料的限制已说明。",
)

document.add_paragraph("可选：复现材料可定位", style="Heading 2")
document.add_paragraph("脚本、数据、环境与步骤；不适用时写清原因。")

document.add_paragraph()
verdict = document.add_paragraph()
verdict_run = verdict.add_run("判定：四项必填「有勾选 + 有书面证据」才通过；任一项缺证据即退回，并写明要补什么。报告之后被改动过，需要重新审阅当前版本。")
verdict_run.bold = True

footer = document.add_paragraph()
footer_run = footer.add_run("来源 https://zjukop3.github.io/dsh-review-outbox/research-report/ · Review Outbox 按文件 SHA-256 判断版本是否变化")
footer_run.font.size = Pt(8.5)
footer_run.font.color.rgb = MUTED

OUT.parent.mkdir(parents=True, exist_ok=True)
document.save(OUT)
print(f"saved {OUT} ({OUT.stat().st_size} bytes)")
