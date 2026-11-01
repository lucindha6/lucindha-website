#!/usr/bin/env python3
"""Search-engine and sharing setup. Run after any page is added:  python3 tools/build_seo.py
- adds/refreshes the link-preview tags on the hand-made pages (index, home, thanks)
- writes site/404.html (the 'page not found' page), site/sitemap.xml and site/robots.txt
Pages built by the other build_*.py scripts get their tags automatically through page_shell."""
import sys, pathlib, re, datetime
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from page_shell import page, ROOT, SITE, url_for, meta_block

def tag(file, title, desc, noindex=False):
    f = ROOT / file; s = f.read_text()
    block = meta_block(title, desc, file, noindex)
    if "<!--meta-->" in s:
        s = re.sub(r"<!--meta-->.*?<!--/meta-->", lambda m: block, s, flags=re.S)
    else:
        s = re.sub(r"(<title>.*?</title>)", lambda m: m.group(1) + "\n" + block, s, count=1)
    f.write_text(s)

def desc_of(file):
    m = re.search(r'<meta name="description" content="([^"]*)">', (ROOT / file).read_text())
    return m.group(1).replace("&amp;", "&").replace("&#x27;", "'").replace("&quot;", '"') if m else ""

tag("index.html", "Lucindha Lawson – Accountant. Athlete. Coach. Speaker.", desc_of("index.html"))
tag("home.html", "Lucindha Lawson – AAT licensed accountant", desc_of("home.html"))
tag("thanks.html", "Thank you – Lucindha Lawson", desc_of("thanks.html"), noindex=True)

# 404 page – <base href="/"> keeps images and styles working at any broken address
body = '''
<section class="hero" aria-labelledby="page-title">
<div class="wrap">
<div class="hero-text">
<p class="eyebrow">Page not found</p>
<h1 id="page-title">Sorry, this page <em>isn't here.</em></h1>
<p class="lead">The link may be broken, or the page may have moved. These might help:</p>
<div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 6px">
<a href="home.html" class="pill">Go to the home page</a>
<a href="accounting.html" class="pill ghost">Accounting services</a>
<a href="contact.html" class="pill ghost">Contact me</a>
</div>
</div>
<div class="hero-logo"><img src="images/logo-full.png" alt="" width="640" height="674"></div>
</div>
</section>'''
out = page("Page not found", "The page you were looking for couldn't be found.", "404.html", body)
out = out.replace("<head>", '<head>\n<base href="/">', 1).replace('<link rel="canonical" href="' + url_for("404.html") + '">', '<meta name="robots" content="noindex">')
(ROOT / "404.html").write_text(out)

# sitemap + robots
SKIP = {"404.html", "thanks.html"}
today = datetime.date.today().isoformat()
pages = sorted(p.name for p in ROOT.glob("*.html") if p.name not in SKIP)
urls = "".join(f"<url><loc>{url_for(p)}</loc><lastmod>{today}</lastmod></url>\n" for p in pages)
(ROOT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n")
(ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")
print("seo: tags on index/home/thanks, 404.html, sitemap.xml (%d pages), robots.txt" % len(pages))
