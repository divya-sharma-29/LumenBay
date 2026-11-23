"""Build the upload-ready Word version of docs/Technical_Documentation.md."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from xml.sax.saxutils import escape
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "Technical_Documentation.md"
OUTPUT = ROOT / "docs" / "Technical_Documentation.docx"

def run_props(text, *, bold=False, italic=False, code=False, size=None, color=None):
    if not text:
        return ""
    props = []
    if bold: props.append("<w:b/>")
    if italic: props.append("<w:i/>")
    if code: props.extend(['<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>', '<w:color w:val="40556B"/>'])
    if size: props.append(f'<w:sz w:val="{size}"/>')
    if color: props.append(f'<w:color w:val="{color}"/>')
    rpr = f"<w:rPr>{''.join(props)}</w:rPr>" if props else ""
    return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'

def inline(text):
    # Preserve the readable link label and remove the Markdown destination.
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", text)
    chunks = re.split(r"(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)", text)
    out = []
    for chunk in chunks:
        if chunk.startswith("**") and chunk.endswith("**"):
            out.append(run_props(chunk[2:-2], bold=True))
        elif chunk.startswith("*") and chunk.endswith("*"):
            out.append(run_props(chunk[1:-1], italic=True))
        elif chunk.startswith("`") and chunk.endswith("`"):
            out.append(run_props(chunk[1:-1], code=True))
        else:
            out.append(run_props(chunk))
    return "".join(out)

def paragraph(text="", style=None, extra=""):
    ppr = f'<w:pPr><w:pStyle w:val="{style}"/>{extra}</w:pPr>' if style or extra else ""
    return f"<w:p>{ppr}{inline(text)}</w:p>"

def cell(text, header=False):
    fill = '<w:shd w:fill="E8EEF5"/>' if header else ""
    bold = "<w:b/>" if header else ""
    return ('<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' + fill + '</w:tcPr><w:p><w:pPr><w:spacing w:after="40"/></w:pPr>' +
            (f'<w:r><w:rPr>{bold}</w:rPr><w:t xml:space="preserve">{escape(text.strip())}</w:t></w:r>' if text.strip() else "") + '</w:p></w:tc>')

def make_table(rows):
    parsed = [[v.strip() for v in line.strip().strip("|").split("|")] for line in rows]
    if len(parsed) > 1 and all(re.fullmatch(r":?-{3,}:?", v.replace(" ", "")) for v in parsed[1]):
        parsed.pop(1)
    width = max(map(len, parsed))
    xml = ['<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="C9D4E0"/><w:left w:val="single" w:sz="4" w:color="C9D4E0"/><w:bottom w:val="single" w:sz="4" w:color="C9D4E0"/><w:right w:val="single" w:sz="4" w:color="C9D4E0"/><w:insideH w:val="single" w:sz="4" w:color="D8E0E8"/><w:insideV w:val="single" w:sz="4" w:color="D8E0E8"/></w:tblBorders></w:tblPr>']
    for ri, row in enumerate(parsed):
        xml.append("<w:tr>" + "".join(cell(row[i] if i < len(row) else "", ri == 0) for i in range(width)) + "</w:tr>")
    xml.append("</w:tbl>")
    return "".join(xml)

def convert(source):
    lines = source.splitlines()
    body = []
    i = 0
    in_code = False
    code_lines = []
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            if in_code:
                for code_line in code_lines:
                    body.append('<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>' + run_props(code_line or " ", code=True, size=18) + '</w:p>')
                body.append(paragraph())
                code_lines = []
            in_code = not in_code
            i += 1
            continue
        if in_code:
            code_lines.append(line)
            i += 1
            continue
        if not line.strip() or line.strip() == "---":
            i += 1
            continue
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(lines[i]); i += 1
            body.append(make_table(rows)); body.append(paragraph())
            continue
        heading = re.match(r"^(#{1,3})\s+(.*)$", line)
        if heading:
            level = len(heading.group(1))
            body.append(paragraph(heading.group(2), f"Heading{level}"))
            i += 1
            continue
        if line.startswith("- "):
            body.append(paragraph(line[2:], "ListBullet")); i += 1; continue
        if re.match(r"^\d+\.\s", line):
            body.append(paragraph(re.sub(r"^\d+\.\s", "", line), "ListNumber")); i += 1; continue
        body.append(paragraph(line))
        i += 1
    return "".join(body)

styles = '''<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="21"/><w:color w:val="253448"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="285" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="300" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="32"/><w:color w:val="16324F"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/><w:color w:val="235A83"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="150" w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="36566F"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="420" w:hanging="220"/><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="420" w:hanging="220"/><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>'''

content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'''
rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'''
doc_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'''

def main():
    text = SOURCE.read_text(encoding="utf-8")
    body = convert(text)
    sect = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="540" w:footer="540" w:gutter="0"/></w:sectPr>'
    document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + sect + '</w:body></w:document>'
    with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", styles)
        z.writestr("word/_rels/document.xml.rels", doc_rels)
    print(f"Created {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")

if __name__ == "__main__":
    main()
