#!/usr/bin/env python3
"""Shared header/footer for pages built in the new soft style (same as home.html).
Usage from another script:  from page_shell import page;  page(title, description, current_href, body_html)"""
import pathlib, re, html

ROOT = pathlib.Path(__file__).resolve().parent.parent / "site"
_home = (ROOT / "home.html").read_text()
_HEAD = _home.split('<main id="main">', 1)[0]
_FOOT = "</main>" + _home.split("</main>", 1)[1]

def page(title, description, current, body):
    h = _HEAD.replace('<a href="home.html" aria-current="page">Home</a>', '<a href="home.html">Home</a>')
    h = h.replace(f'<a href="{current}">', f'<a href="{current}" aria-current="page">', 1)
    h = re.sub(r"<title>.*?</title>", f"<title>{html.escape(title)} – Lucindha Lawson</title>", h)
    h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{html.escape(description)}">', h)
    return h + '<main id="main">\n' + body + "\n" + _FOOT
