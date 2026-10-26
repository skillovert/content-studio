"""Plan PDF for one video plan version (Content Studio, Phase 2).

    python tools/plan_pdf.py <plan-vN.json> <out.pdf> <channel folder>

Sections: overview, taxonomy card, standards, scenes (visuals, on-screen text, sources, timed
voice-over), the full timed script for recording, quotes, sources, thumbnail, YouTube draft,
the concept's own material and open questions. Needs reportlab (python -m pip install reportlab).
Fonts: Geist from <channel>/studio/public/fonts/ttf or the app's engine/public/fonts/ttf, Helvetica when missing.
"""
import json
import os
import re
import sys
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

plan_path, out_path, root = sys.argv[1], sys.argv[2], sys.argv[3]
plan = json.load(open(plan_path, encoding="utf-8"))
meta = plan.get("meta", {})

FONT = {"reg": "Helvetica", "med": "Helvetica", "bold": "Helvetica-Bold", "mono": "Courier"}
ttf = os.path.join(root, "studio", "public", "fonts", "ttf")
if not os.path.isdir(ttf):  # the app's own renderer (engine/) when the channel has no studio/
    ttf = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "engine", "public", "fonts", "ttf")
try:
    for key, name, file in [("reg", "Geist", "Geist-Regular.ttf"), ("med", "Geist-Medium", "Geist-Medium.ttf"), ("bold", "Geist-Bold", "Geist-Bold.ttf"), ("mono", "GeistMono", "GeistMono-Regular.ttf")]:
        pdfmetrics.registerFont(TTFont(name, os.path.join(ttf, file)))
        FONT[key] = name
    pdfmetrics.registerFontFamily("Geist", normal="Geist", bold="Geist-Bold", italic="Geist", boldItalic="Geist-Bold")
except Exception:
    pass

RED = colors.HexColor("#8E1B1F")
RED_BG = colors.HexColor("#F7E8E8")
INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#666666")
LINE = colors.HexColor("#E2E2E2")
AMBER = colors.HexColor("#A86A00")
AMBER_BG = colors.HexColor("#FFF4DC")
CYAN = colors.HexColor("#0E7C86")

S = {
    "h1": ParagraphStyle("h1", fontName=FONT["bold"], fontSize=21, leading=26, textColor=INK),
    "h2": ParagraphStyle("h2", fontName=FONT["bold"], fontSize=13.5, leading=18, textColor=RED, spaceBefore=12, spaceAfter=5),
    "body": ParagraphStyle("body", fontName=FONT["reg"], fontSize=9.6, leading=13.6, textColor=INK),
    "small": ParagraphStyle("small", fontName=FONT["reg"], fontSize=8.2, leading=11.2, textColor=MUTED),
    "label": ParagraphStyle("label", fontName=FONT["mono"], fontSize=7.6, leading=10, textColor=MUTED),
    "vo": ParagraphStyle("vo", fontName=FONT["med"], fontSize=10, leading=14, textColor=INK),
    "time": ParagraphStyle("time", fontName=FONT["mono"], fontSize=8.6, leading=12, textColor=RED),
    "scene": ParagraphStyle("scene", fontName=FONT["bold"], fontSize=10, leading=13, textColor=colors.white),
    "warn": ParagraphStyle("warn", fontName=FONT["med"], fontSize=9.2, leading=13, textColor=AMBER),
}



def cue_text(l):
    """The cue, led by the graphic the preview draws for this line (e.g. "[timeline] 2026: found, leaked")."""
    g = l.get("graphic") or {}
    if not g.get("type"):
        return l.get("cue") or ""
    if g["type"] == "continue":
        return "[same graphic, next item] " + (l.get("cue") or "")
    bits = [g.get("kicker"), g.get("title")] + [i.get("label") for i in g.get("items", [])[:6]]
    head = ", ".join(b for b in bits if b)
    return f"[{g['type']}] {head}" + (f" · {l['cue']}" if l.get("cue") else "")

def t(text):
    return escape(str(text or ""))


def jargon(text):
    """Bold the "quoted" jargon, as in the voice-over script PDF."""
    return re.sub(r'["“]([^"”]+)["”]', lambda m: f'<font name="{FONT["bold"]}" color="#8E1B1F">"{m.group(1)}"</font>', t(text))


def clock(sec):
    sec = float(sec or 0)
    return f"{int(sec // 60)}:{int(sec % 60):02d}"


def P(text, style="body"):
    return Paragraph(text, S[style])


def table(rows, widths, header=True, zebra=False):
    tb = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), RED_BG)]
    tb.setStyle(TableStyle(style))
    return tb


W = A4[0] - 32 * mm
story = []
code = meta.get("code", "")
try:  # the channel's name from its brand profile, for the label line
    BRAND = json.load(open(os.path.join(root, "brand", "profile.json"), encoding="utf-8")).get("name", "")
except Exception:
    BRAND = ""

# ---- overview ----
story += [
    P(f'{t(BRAND).upper() + " · " if BRAND else ""}VIDEO PLAN · {t(code)} · V{meta.get("version", "")}', "label"),
    Spacer(1, 3),
    P(t(plan["title"]), "h1"),
    Spacer(1, 4),
    P(jargon(plan["titleRoman"]), "vo"),
    Spacer(1, 6),
]
facts = [
    ["Playlist", t(meta.get("playlist")), "Format", t(meta.get("format"))],
    ["News label", t(f'{plan["newsLabel"]} News' if plan.get("newsLabel") else "none"), "As of", t(plan["asOf"])],
    ["Est. length", clock(plan.get("duration")), "Scenes / lines", f'{len(plan["scenes"])} / {sum(len(s["lines"]) for s in plan["scenes"])}'],
    ["Made", t((meta.get("created") or "")[:10]) + (" by Claude (API)" if meta.get("by") == "api" else " by Claude (brief)"), "Sources", str(len(plan["sources"]))],
]
story.append(table([[P(a, "label"), P(b), P(c, "label"), P(d)] for a, b, c, d in facts], [24 * mm, W / 2 - 24 * mm, 24 * mm, W / 2 - 24 * mm], header=False))
if meta.get("feedback"):
    story += [Spacer(1, 6), P(f"<b>Changes asked for in this version:</b> {t(meta['feedback'])}", "warn")]
story += [P("Summary", "h2"), P(t(plan["summary"])), Spacer(1, 4), P(f"<b>Cause approach.</b> {t(plan.get('causeApproach'))}")]

# ---- card ----
card = plan["card"]
rows = [[P("Field", "label"), P("Value", "label")]]
for label, key in [("Topic", "topic"), ("Section", "section"), ("Region", "region"), ("Industry", "industry"), ("Audience", "audience"), ("Breakout", "breakout"), ("Cause", "cause")]:
    v = card.get(key)
    v = ", ".join(v) if isinstance(v, list) else v
    rows.append([P(label), P(t(v or "none"))])
story += [P("Taxonomy card (proposed)", "h2"), table(rows, [32 * mm, W - 32 * mm]), Spacer(1, 4), P("Hashtags: " + t(" ".join(meta.get("hashtags", []))), "small")]

# ---- standards ----
listed = {s["name"] for s in plan["standards"]}
missing = [n for n in meta.get("requiredStandards", []) if n not in listed]
rows = [[P("Standard", "label"), P("How this piece meets it", "label")]] + [[P(f"<b>{t(s['name'])}</b>"), P(t(s["how"]))] for s in plan["standards"]]
story += [P("Standards", "h2"), table(rows, [38 * mm, W - 38 * mm])]
if missing:
    story += [Spacer(1, 4), P("Required by the card but not addressed: " + t(", ".join(missing)) + ". The standards check will block publishing until they are.", "warn")]

# ---- scenes ----
src = {s["id"]: s for s in plan["sources"]}
story.append(P("Scenes", "h2"))
for i, sc in enumerate(plan["scenes"], 1):
    head = Table([[P(f'{i:02d} · {clock(sc["start"])}–{clock(sc["end"])} · {t(sc["kind"]).upper()} · {t(sc["title"])}', "scene")]], colWidths=[W])
    head.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), INK), ("LEFTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    parts = [head, Spacer(1, 3), P(f"<b>Visual.</b> {t(sc['visual'])}")]
    if sc.get("onScreen"):
        parts.append(P("<b>On screen.</b> " + " · ".join(t(x) for x in sc["onScreen"])))
    if sc.get("sourceIds"):
        links = [f'<link href="{t(src[x]["url"])}" color="#0E7C86">{t(x)} {t(src[x]["outlet"])}</link>' for x in sc["sourceIds"] if x in src]
        parts.append(P("<b>Sources.</b> " + ", ".join(links), "small"))
    rows = [[P(f'{clock(l["start"])}', "time"), P(jargon(l["vo"]), "vo"), P(t(cue_text(l)), "small")] for l in sc["lines"]]
    tb = table(rows, [14 * mm, W * 0.58, W - 14 * mm - W * 0.58], header=False)
    story += [KeepTogether(parts + [Spacer(1, 3), tb]), Spacer(1, 8)]

# ---- recording script ----
story.append(P("Voice-over and captions (timed)", "h2"))
story.append(P("Estimated timings at 2.6 words a second. Your recorded timings replace them in the recorder (Phase 4); subtitles are made from your takes.", "small"))
rows = [[P("#", "label"), P("Time", "label"), P("Line", "label")]]
n = 0
for sc in plan["scenes"]:
    for l in sc["lines"]:
        n += 1
        rows.append([P(str(n), "small"), P(f'{clock(l["start"])}–{clock(l["end"])}', "time"), P(jargon(l["vo"]), "vo")])
story.append(table(rows, [9 * mm, 22 * mm, W - 31 * mm]))

# ---- quotes ----
if plan.get("quotes"):
    rows = [[P("Speaker", "label"), P("Verbatim quote", "label"), P("Source", "label")]]
    for q in plan["quotes"]:
        s = src.get(q["sourceId"], {})
        rows.append([P(t(q["speaker"])), P(f"“{t(q['text'])}”"), P(f'{t(s.get("outlet", q["sourceId"]))}, {t(q.get("date"))}', "small")])
    story += [P("Quotes", "h2"), table(rows, [36 * mm, W - 76 * mm, 40 * mm])]

# ---- sources ----
order = sorted(plan["sources"], key=lambda s: (s["kind"] != "primary", s["id"]))
rows = [[P("ID", "label"), P("Kind", "label"), P("Source", "label")]]
for s in order:
    rows.append([P(t(s["id"])), P(t(s["kind"]), "small"), P(f'<b>{t(s["outlet"])}</b>: {t(s["title"])} {("(" + t(s["date"]) + ")") if s.get("date") else ""}<br/><link href="{t(s["url"])}" color="#0E7C86">{t(s["url"])}</link>', "small")])
story += [P("Sources (primary first)", "h2"), table(rows, [11 * mm, 18 * mm, W - 29 * mm])]

# ---- thumbnail ----
th = plan["thumbnail"]
rows = [
    [P("Title"), P(f"<b>{t(th['jargonTitle'])}</b>")],
    [P("Urdu line"), P(t(th.get("urduLineRoman")) + "<br/>" + '<font size="7.5" color="#666666">(Nastaliq version shown in Content Studio and on the sample thumbnail)</font>')],
    [P("Stamp"), P(t(th["stamp"]))],
    [P("Key visual"), P(t(th["keyVisual"]))],
    [P("Labels"), P(t((plan.get("newsLabel") + " News · " if plan.get("newsLabel") else "") + (card["cause"][0] if card.get("cause") else "")))],
]
story += [P("Thumbnail", "h2"), table(rows, [28 * mm, W - 28 * mm], header=False)]

# ---- YouTube ----
yt = plan["youtube"]
chapters = "<br/>".join(f'{clock(s["start"])} {t(s["title"])}' for s in plan["scenes"])
story += [
    P("YouTube draft", "h2"),
    P(jargon(plan["titleRoman"]), "vo"),
    Spacer(1, 4),
    P(t(yt["description"]).replace("\n", "<br/>")),
    Spacer(1, 4),
    P("<b>Chapters (estimated)</b><br/>" + chapters, "small"),
    Spacer(1, 4),
    P("<b>Hashtags</b> " + t(" ".join(meta.get("hashtags", []))), "small"),
    P("<b>Tags</b> " + t(", ".join(yt.get("tags", []))), "small"),
]

# ---- concept + open questions ----
if plan.get("conceptItems"):
    story += [P("From your concept", "h2")] + [P("• " + t(x)) for x in plan["conceptItems"]]
story += [P("Open questions", "h2")] + ([P("• " + t(x), "warn") for x in plan["openQuestions"]] or [P("None.")])


def page(canvas, doc):
    canvas.saveState()
    canvas.setFont(FONT["mono"], 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(16 * mm, 10 * mm, f"{code} plan v{meta.get('version', '')} · as of {plan['asOf']} · Content Studio")
    canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, str(doc.page))
    canvas.setFillColor(RED)
    canvas.rect(0, A4[1] - 4, A4[0], 4, fill=1, stroke=0)
    canvas.restoreState()


os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
doc = SimpleDocTemplate(out_path, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm, bottomMargin=16 * mm, title=f"{code} plan v{meta.get('version', '')}", author="Aqsa Jamil · Content Studio")
doc.build(story, onFirstPage=page, onLaterPages=page)
print(out_path)
