#!/usr/bin/env python3
"""Builds site/community.html (hub page) in the soft style on the main navy (#0B1F33).
Edit the text below and run:  python3 tools/build_community.py"""
import sys, pathlib, html
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from page_shell import page, ROOT
e = lambda s: html.escape(s, quote=False)

AREAS = [
    ("sport", "Sport & Coaching", "#2A3D3B", "logo-sport.png", "sport.html", "Find out more about Sport & Coaching",
     "International Deaf football and futsal player and coach, sharing leadership, teamwork and high-performance experience gained through elite sport.",
     ["Back-to-back European champion", "Four-time Deaflympian", "Volunteer coach in youth and Deaf football"]),
    ("speaking", "Public Speaking", "#4A3046", "logo-speaking.png", "speaking.html", "See speaking topics",
     "Talks on leadership, Deaf awareness, language deprivation, accessibility, elite sport and professional development.",
     ["Schools, universities and workplaces", "Conferences, charities and sports bodies", "Every talk tailored to your audience"]),
    ("workshops", "Workshops", "#343B40", "logo-workshops.png", "workshops.html", "See workshop topics",
     "Interactive workshops on finance, British Sign Language (BSL), Deaf awareness, accessibility, CPR & AED awareness and inclusive communication.",
     ["Practical and interactive", "Accessible by design", "Tailored by topic, group size and format"]),
]
CHECK = ('<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CBAB74" stroke-width="2.2" '
         'stroke-linecap="round" stroke-linejoin="round" style="flex: none; margin-top: 4px"><path d="M20 6L9 17l-5-5"></path></svg>')

def area(key, title, colour, logo, href, linktext, summary, points):
    return f'''
<section id="{key}" class="area-panel" aria-labelledby="{key}-title" style="background: {colour}">
<img src="images/{logo}" alt="" width="360" height="360">
<div class="stack">
<p class="eyebrow">Community Work</p>
<h2 id="{key}-title">{e(title)}</h2>
<p class="lead" style="color: var(--cream)">{e(summary)}</p>
<ul class="mini-ticks">{"".join(f'<li>{CHECK}<span>{e(p)}</span></li>' for p in points)}</ul>
<a href="{href}" class="pill ghost" style="align-self: flex-start; margin-top: 6px">{e(linktext)} <span aria-hidden="true">→</span></a>
</div>
</section>'''

jump = "".join(f'<a href="#{k}" class="jump" style="background: {c}"><span aria-hidden="true" class="dot"></span>{e(t)}</a>' for k, t, c, *_ in AREAS)

body = f'''
<section class="hero" aria-labelledby="page-title">
<div class="wrap">
<div class="hero-text" style="flex-basis: 100%">
<nav aria-label="Breadcrumb" class="crumbs"><a href="home.html">Home</a> <span aria-hidden="true">/</span> Community Work</nav>
<p class="eyebrow">Community Work</p>
<h1 id="page-title">Sport, speaking <em>&amp; workshops.</em></h1>
<p class="lead">Alongside accounting, I also deliver coaching, public speaking and specialist workshops, combining professional expertise with real-world experience.</p>
<nav aria-label="On this page" class="jumps">{jump}</nav>
</div>
</div>
</section>

<div class="wrap areas-stack">
{"".join(area(*a) for a in AREAS)}
</div>

<section aria-labelledby="cta-title">
<div class="wrap">
<div class="cta">
<div>
<h2 id="cta-title">Looking for an accountant?</h2>
<p class="muted">My main service is accounting for sole traders, small businesses and individuals – clear, personal and accessible.</p>
</div>
<a href="accounting.html" class="pill">See accounting services</a>
</div>
</div>
</section>
'''

(ROOT / "community.html").write_text(page("Community Work",
    "Lucindha Lawson's community work: sport and coaching, public speaking and accessible workshops on Deaf awareness, BSL, inclusion and more.",
    "community.html", body))
print("community.html written")
