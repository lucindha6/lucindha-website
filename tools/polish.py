#!/usr/bin/env python3
"""Adds the gradient visual layer to the Lucindha Lawson site files (HTML pages and build_news.py).
Usage: python3 polish.py file1 [file2 ...]   (safe to run more than once)"""
import sys, pathlib, re

MARK = "/* gradient-layer */"

BODY_BG = ("background-color:#0A1D37;"
           "background-image:radial-gradient(1100px 620px at 88% -8%,rgba(242,193,78,.16),transparent 62%),"
           "radial-gradient(900px 560px at -12% 18%,rgba(156,200,255,.12),transparent 60%),"
           "radial-gradient(800px 600px at 100% 70%,rgba(111,211,168,.07),transparent 60%),"
           "linear-gradient(180deg,#0A1D37 0%,#0C2244 45%,#081830 100%)")

EXTRA_CSS = MARK + """
header{position:relative;background:linear-gradient(180deg,rgba(7,21,40,.85),rgba(10,29,55,.35))}
header::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:linear-gradient(90deg,transparent,#F2C14E 30%,#FFD97A 50%,#F2C14E 70%,transparent);opacity:.75}
footer{position:relative}
footer::before{content:"";position:absolute;left:0;right:0;top:-1px;height:2px;background:linear-gradient(90deg,transparent,#2A4370 20%,#F2C14E 50%,#2A4370 80%,transparent);opacity:.6}
.gold-text{background:linear-gradient(100deg,#FFE08F 0%,#F2C14E 45%,#E8AE35 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.glow{position:relative;overflow:hidden}
.glow::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(700px 360px at 80% 0%,rgba(242,193,78,.16),transparent 65%),radial-gradient(600px 380px at 0% 0%,rgba(156,200,255,.10),transparent 65%)}
.glow>*{position:relative}
a[class~="btn"],.btn{transition:transform .15s ease,box-shadow .15s ease}
.btn:hover{transform:translateY(-1px);box-shadow:0 10px 28px rgba(242,193,78,.35)}
.lift{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.lift:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(0,0,0,.35);border-color:#F2C14E}
@media (prefers-reduced-motion:reduce){.btn,.lift{transition:none}.btn:hover,.lift:hover{transform:none}}
"""

GOLD_BTN = ("background: linear-gradient(135deg, #FFDC85 0%, #F2C14E 48%, #E3AA32 100%); "
            "box-shadow: 0 6px 18px rgba(242,193,78,.25)")
BAND = "background: linear-gradient(135deg, #17345F 0%, #112850 50%, #0C1F40 100%)"
CARD = "background: linear-gradient(160deg, #18355F 0%, #12294D 55%, #0E2242 100%)"
DEEP_CARD = "background: linear-gradient(160deg, #13305A 0%, #0D2141 60%, #0A1A35 100%)"
INNER = "background: linear-gradient(160deg, #102849 0%, #0A1C38 100%)"
FOOTER = "background: linear-gradient(180deg, #0A1D37 0%, #061226 100%)"

def polish(t: str) -> str:
    if MARK in t:
        return t
    # page background: body gets the glow gradient, wrappers go transparent
    t = t.replace("body{margin:0;background:#0A1D37}", "body{margin:0;" + BODY_BG + "}")
    t = t.replace("body{margin:0}", "body{margin:0;" + BODY_BG + "}")
    t = t.replace("position: relative; background: #0A1D37;", "position: relative; background: transparent;")
    t = t.replace("min-height: 100vh; background: #0A1D37;", "min-height: 100vh; background: transparent;")
    # gradient CSS layer
    t = t.replace("</style>", EXTRA_CSS + "</style>", 1)
    # gold buttons / number badges
    t = re.sub(r'(<a [^>]*?)style="background: #F2C14E; color: #0A1D37;', lambda m: m.group(1) + 'class="btn" style="' + GOLD_BTN + '; color: #0A1D37;', t)
    t = t.replace('style="align-self: flex-start; font: inherit; font-size: 1.15rem; font-weight: 700; background: #F2C14E;',
                  'class="btn" style="align-self: flex-start; font: inherit; font-size: 1.15rem; font-weight: 700; ' + GOLD_BTN + ';')
    t = t.replace("border-radius: 50%; background: #F2C14E; color: #0A1D37;", "border-radius: 50%; " + GOLD_BTN + "; color: #0A1D37;")
    # section bands vs cards on #13294B
    t = re.sub(r'(<section[^>]*?style="[^"]*?)background: #13294B', lambda m: m.group(1) + BAND, t)
    t = re.sub(r'(<(?:article|li|div|form)\b[^>]*?style="[^"]*?)background: #13294B', lambda m: m.group(1) + CARD, t)
    t = t.replace("background: #13294B", CARD)  # anything left (chips, swatch-free cards)
    t = t.replace("background: #0E2240", DEEP_CARD)
    # inner tiles that sat on plain navy
    t = re.sub(r'(<(?:li|a)\b[^>]*?style="[^"]*?)background: #0A1D37', lambda m: m.group(1) + INNER, t)
    t = t.replace("background: #071528", FOOTER)
    # hover lift on cards
    t = re.sub(r'<(article|li)( style="[^"]*?border-radius: 1[24]px)', r'<\1 class="lift"\2', t)
    t = t.replace('<li style="flex: 1 1 320px; border: 1px solid #2A4370;', '<li class="lift" style="flex: 1 1 320px; border: 1px solid #2A4370;')
    # hero sections glow
    for hid in ("hero-title", "acc-title", "cw-title", "news-title"):
        t = t.replace(f'<section aria-labelledby="{hid}" style="', f'<section class="glow" aria-labelledby="{hid}" style="')
    # gold headline words
    t = t.replace('<span style="color: #F2C14E">Deaf and hearing</span>', '<span class="gold-text">Deaf and hearing</span>')
    # hero monogram glow
    t = t.replace("aspect-ratio: 1; border-radius: 50%; border: 3px solid #F2C14E;",
                  "aspect-ratio: 1; border-radius: 50%; border: 3px solid #F2C14E; box-shadow: 0 0 0 10px rgba(242,193,78,.08), 0 0 80px rgba(242,193,78,.25);")
    # CTA / aside boxes with gold border get a soft gold wash
    t = t.replace("border: 2px solid #F2C14E; border-radius: 20px;",
                  "border: 2px solid #F2C14E; border-radius: 20px; background: linear-gradient(135deg, rgba(242,193,78,.16) 0%, rgba(23,52,95,.55) 55%, rgba(12,31,64,.4) 100%);")
    t = t.replace("border: 2px solid #F2C14E; border-radius: 16px;",
                  "border: 2px solid #F2C14E; border-radius: 16px; background: linear-gradient(135deg, rgba(242,193,78,.14) 0%, rgba(23,52,95,.5) 60%, rgba(12,31,64,.35) 100%);")
    # news page card classes (CSS-class based)
    t = t.replace(".card{background:#13294B;", ".card{background:linear-gradient(160deg,#18355F 0%,#12294D 55%,#0E2242 100%);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;")
    t = t.replace(".card:hover{border-color:#F2C14E}", ".card:hover{border-color:#F2C14E;transform:translateY(-2px);box-shadow:0 14px 34px rgba(0,0,0,.35)}\n@media (prefers-reduced-motion:reduce){.card{transition:none}.card:hover{transform:none}}")
    t = t.replace("border-radius:10px;background:#0A1D37;", "border-radius:10px;background:radial-gradient(120px 90px at 70% 20%,rgba(242,193,78,.14),transparent 70%),linear-gradient(160deg,#102849,#081730);")
    return t

for f in sys.argv[1:]:
    p = pathlib.Path(f)
    p.write_text(polish(p.read_text()))
    print("polished", f)
