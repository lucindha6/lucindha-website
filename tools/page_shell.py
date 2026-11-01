#!/usr/bin/env python3
"""Shared header/footer for pages built in the new soft style (same as home.html).
Usage from another script:  from page_shell import page;  page(title, description, current_href, body_html)"""
import pathlib, re, html

ROOT = pathlib.Path(__file__).resolve().parent.parent / "site"
SITE = "https://www.lucindhalawson.co.uk"   # the live web address (used for link previews, Google and the sitemap)

def url_for(href):
    """home.html -> https://www.lucindhalawson.co.uk/home ; index.html -> https://www.lucindhalawson.co.uk/"""
    slug = href[:-5] if href.endswith(".html") else href
    return SITE + "/" + ("" if slug == "index" else slug)

def meta_block(title, description, href, noindex=False):
    """Canonical address + link-preview tags (WhatsApp, LinkedIn, Facebook, X). Lives between <!--meta--> markers."""
    t, d, u = html.escape(title), html.escape(description), url_for(href)
    robots = '<meta name="robots" content="noindex">\n' if noindex else ""
    return ("<!--meta-->\n" + robots +
            f'<link rel="canonical" href="{u}">\n'
            '<meta property="og:type" content="website">\n'
            '<meta property="og:site_name" content="Lucindha Lawson">\n'
            '<meta property="og:locale" content="en_GB">\n'
            f'<meta property="og:title" content="{t}">\n'
            f'<meta property="og:description" content="{d}">\n'
            f'<meta property="og:url" content="{u}">\n'
            f'<meta property="og:image" content="{SITE}/images/share.png">\n'
            '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
            '<meta property="og:image:alt" content="Lucindha Lawson logo: a gold LL monogram on navy">\n'
            '<meta name="twitter:card" content="summary_large_image">\n'
            "<!--/meta-->")
_home = (ROOT / "home.html").read_text()
_HEAD = _home.split('<main id="main">', 1)[0]
_FOOT = "</main>" + _home.split("</main>", 1)[1]

def page(title, description, current, body):
    h = _HEAD.replace('<a href="home.html" aria-current="page">Home</a>', '<a href="home.html">Home</a>')
    h = h.replace(f'<a href="{current}">', f'<a href="{current}" aria-current="page">', 1)
    h = re.sub(r"<title>.*?</title>", f"<title>{html.escape(title)} – Lucindha Lawson</title>", h)
    h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{html.escape(description)}">', h)
    h = re.sub(r"<!--meta-->.*?<!--/meta-->", lambda m: meta_block(f"{title} – Lucindha Lawson", description, current), h, flags=re.S)
    return h + '<main id="main">\n' + body + "\n" + _FOOT
