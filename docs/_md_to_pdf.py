#!/usr/bin/env python3
"""Lightweight Markdown -> PDF converter for Aetheria docs.

Not a full markdown engine; covers what our docs use:
- # / ## / ### headings
- bullet/numbered lists
- pipe tables
- bold/italic, inline code
- code fences (rendered as monospace blocks)
- horizontal rules
- blockquotes
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Preformatted, ListFlowable, ListItem, HRFlowable,
)


def build_styles():
    base = getSampleStyleSheet()
    styles = {
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontSize=20,
                              textColor=colors.HexColor("#3b1d6e"), spaceAfter=10),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontSize=15,
                              textColor=colors.HexColor("#5a2bbd"), spaceBefore=12, spaceAfter=6),
        "h3": ParagraphStyle("h3", parent=base["Heading3"], fontSize=12,
                              textColor=colors.HexColor("#7a3fd8"), spaceBefore=8, spaceAfter=4),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontSize=10, leading=14),
        "quote": ParagraphStyle("quote", parent=base["BodyText"], fontSize=10, leading=14,
                                  leftIndent=18, textColor=colors.HexColor("#555555"),
                                  fontName="Helvetica-Oblique"),
        "code": ParagraphStyle("code", parent=base["Code"], fontSize=8.5, leading=11,
                                 backColor=colors.HexColor("#f3f0fa"),
                                 borderColor=colors.HexColor("#d8cdf2"),
                                 borderWidth=0.5, borderPadding=4),
    }
    return styles


_BOLD = re.compile(r"\*\*(.+?)\*\*")
_ITAL = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
_CODE = re.compile(r"`([^`]+)`")


def inline(text: str) -> str:
    text = (text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;"))
    text = _BOLD.sub(r"<b>\1</b>", text)
    text = _ITAL.sub(r"<i>\1</i>", text)
    text = _CODE.sub(r'<font face="Courier" backColor="#f3f0fa">\1</font>', text)
    return text


def parse(md: str, styles):
    lines = md.splitlines()
    flow = []
    i = 0
    while i < len(lines):
        line = lines[i]

        if line.strip().startswith("```"):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1
            flow.append(Preformatted("\n".join(buf), styles["code"]))
            flow.append(Spacer(1, 6))
            continue

        if line.startswith("### "):
            flow.append(Paragraph(inline(line[4:]), styles["h3"])); i += 1; continue
        if line.startswith("## "):
            flow.append(Paragraph(inline(line[3:]), styles["h2"])); i += 1; continue
        if line.startswith("# "):
            flow.append(Paragraph(inline(line[2:]), styles["h1"])); i += 1; continue

        if re.match(r"^-{3,}$", line.strip()):
            flow.append(HRFlowable(width="100%", color=colors.HexColor("#bbb"),
                                    spaceBefore=6, spaceAfter=6))
            i += 1; continue

        if line.lstrip().startswith("> "):
            buf = []
            while i < len(lines) and lines[i].lstrip().startswith("> "):
                buf.append(lines[i].lstrip()[2:]); i += 1
            flow.append(Paragraph(inline(" ".join(buf)), styles["quote"]))
            continue

        if line.lstrip().startswith(("- ", "* ")):
            items = []
            while i < len(lines) and lines[i].lstrip().startswith(("- ", "* ")):
                items.append(ListItem(Paragraph(
                    inline(lines[i].lstrip()[2:]), styles["body"])))
                i += 1
            flow.append(ListFlowable(items, bulletType="bullet", leftIndent=14))
            flow.append(Spacer(1, 4)); continue

        if re.match(r"^\d+\.\s", line.lstrip()):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s", lines[i].lstrip()):
                txt = re.sub(r"^\d+\.\s", "", lines[i].lstrip())
                items.append(ListItem(Paragraph(inline(txt), styles["body"])))
                i += 1
            flow.append(ListFlowable(items, bulletType="1", leftIndent=14))
            flow.append(Spacer(1, 4)); continue

        if line.strip().startswith("|") and i + 1 < len(lines) \
                and re.match(r"^\|\s*[:\-\s|]+\|", lines[i + 1].strip()):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            data = [rows[0]] + rows[2:]
            data = [[Paragraph(inline(c), styles["body"]) for c in r] for r in data]
            tbl = Table(data, hAlign="LEFT", repeatRows=1)
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#5a2bbd")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#bbbbbb")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1),
                 [colors.white, colors.HexColor("#f7f4fc")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]))
            flow.append(tbl); flow.append(Spacer(1, 6)); continue

        if line.strip() == "":
            flow.append(Spacer(1, 4)); i += 1; continue

        para = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not lines[i].startswith(("#", "- ", "* ", "|", ">", "```")) \
                and not re.match(r"^\d+\.\s", lines[i].lstrip()):
            para.append(lines[i]); i += 1
        flow.append(Paragraph(inline(" ".join(para)), styles["body"]))
    return flow


def convert(src: Path, dst: Path):
    md = src.read_text(encoding="utf-8")
    styles = build_styles()
    doc = SimpleDocTemplate(str(dst), pagesize=A4,
                             leftMargin=1.8 * cm, rightMargin=1.8 * cm,
                             topMargin=1.8 * cm, bottomMargin=1.8 * cm,
                             title=src.stem, author="Aetheria")
    doc.build(parse(md, styles))
    print(f"wrote {dst}  ({dst.stat().st_size} bytes)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: _md_to_pdf.py <file.md> [file2.md ...]"); sys.exit(2)
    for arg in sys.argv[1:]:
        p = Path(arg)
        convert(p, p.with_suffix(".pdf"))
