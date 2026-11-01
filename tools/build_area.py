#!/usr/bin/env python3
"""Builds the Community Work area pages in the soft style, each on its own brand colour.
Run:  python3 tools/build_area.py            (builds every area listed in AREAS)"""
import sys, pathlib, html
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from page_shell import page, ROOT
e = lambda s: html.escape(s, quote=False)
CHECK = ('<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#CBAB74" stroke-width="2" '
         'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>')

AREAS = {
  "sport": dict(
    file="sport.html", title="Sport & Coaching", colour="#2A3D3B", light="#2F4441", dark="#22322F", deep="#18231F", logo="logo-sport-hero.png",
    description="Lucindha Lawson – England Deaf futsal international, four-time Deaflympian and volunteer coach. Talks, mentoring and coaching for schools, clubs and organisations.",
    tagline="Helping athletes, teams and organisations develop on and off the court.",
    intro=["Alongside my finance career, I represent England internationally in Deaf football and futsal and coach players of different ages and abilities. I enjoy helping individuals and teams reach their potential through practical coaching, mentoring and education."],
    groups=[
      ("involved-title", "How I’m involved in sport",
       "Sport has shaped who I am. Through representing England, competing at the highest level of Deaf sport and volunteering in youth football, I aim to inspire the next generation and make the game more inclusive for everyone.",
       [("Back-to-Back European Champion", "Proud member of the England Deaf Women’s Futsal team, winning the European Championship in 2022 and 2026."),
        ("Four-time Deaflympian", "Represented Great Britain at four Deaflympic Games (2013, 2017, 2023 and 2025), competing at the highest level of Deaf football and futsal."),
        ("England Deaf Futsal International", "Representing England on the international stage, competing against the world’s best Deaf futsal teams."),
        ("International Experience", "Competing internationally has developed resilience, leadership, teamwork and the ability to perform under pressure. These qualities shape everything I do both on and off the court.")]),
      ("giving-title", "Coaching & giving back",
       "From schools to grassroots clubs, I volunteer my time to support young players and make the game more inclusive.",
       [("Heathlands School", "Volunteering at Heathlands School to inspire Deaf young people through football, futsal and positive role modelling."),
        ("St Albans City DFC Youth", "Supporting the development of young players through volunteer coaching."),
        ("Role Model", "Sharing my journey to encourage girls and young women to believe in themselves and pursue their ambitions."),
        ("Giving Back", "Passionate about making football and futsal more inclusive, supporting the next generation and creating opportunities within Deaf sport.")]),
    ],
    why=("Why invite Lucindha?",
         "From international competition to grassroots football, I use my experiences to inspire others, promote inclusion and encourage the next generation to achieve their full potential.",
         [("Elite Experience", "Representing England and Great Britain at the highest international level of Deaf football and futsal."),
          ("Inspiring Others", "Encouraging young people to build confidence, resilience and ambition through sport."),
          ("Community Impact", "Supporting schools and clubs through volunteering, mentoring, advocacy and community engagement."),
          ("Inclusive Leadership", "Championing Deaf awareness, accessibility and equal opportunities through sport.")]),
    cta=("Ready to inspire your team?",
         "Whether you’re a school, football club, charity, governing body or community organisation, I’d be delighted to share my experiences as an international Deaf athlete, volunteer and role model.",
         "Available for", ["School assemblies", "Sports clubs", "Community events", "Panel discussions", "Inclusion initiatives", "Youth development programmes"],
         "Contact Lucindha"),
  ),
}

def build(key, a):
    groups = ""
    for i, (sid, title, intro, cards) in enumerate(a["groups"]):
        groups += f'''
<section{' class="band"' if i % 2 == 0 else ''} aria-labelledby="{sid}">
<div class="wrap">
<div class="head"><h2 id="{sid}">{e(title)}</h2><p class="muted">{e(intro)}</p></div>
<ul class="grid{" grid-2" if len(cards) % 2 == 0 and len(cards) % 3 else ""}">{"".join(f'<li class="card"><h3>{e(t)}</h3><p>{e(d)}</p></li>' for t, d in cards)}</ul>
</div>
</section>'''
    wt, wi, wl = a["why"]
    band_next = len(a["groups"]) % 2 == 0
    why = f'''
<section{' class="band"' if band_next else ''} aria-labelledby="why-title">
<div class="wrap">
<div class="head"><h2 id="why-title">{e(wt)}</h2><p class="muted">{e(wi)}</p></div>
<ul class="ticks two">{"".join(f'<li>{CHECK}<span><strong>{e(t)}</strong> – {e(d)}</span></li>' for t, d in wl)}</ul>
</div>
</section>'''
    ct, cp, cl, chips, cb = a["cta"]
    cta = f'''
<section aria-labelledby="cta-title">
<div class="wrap">
<div class="cta" style="flex-direction: column; align-items: flex-start">
<div style="flex: none">
<h2 id="cta-title">{e(ct)}</h2>
<p class="muted">{e(cp)}</p>
</div>
<p style="font-weight: 700; margin: 0">{e(cl)}:</p>
<ul class="chips">{"".join(f'<li>{e(c)}</li>' for c in chips)}</ul>
<a href="contact.html" class="pill">{e(cb)}</a>
</div>
</div>
</section>'''
    body = f'''
<section class="hero" aria-labelledby="page-title">
<div class="wrap">
<div class="hero-text">
<nav aria-label="Breadcrumb" class="crumbs"><a href="home.html">Home</a> <span aria-hidden="true">/</span> <a href="community.html">Community Work</a> <span aria-hidden="true">/</span> {e(a["title"])}</nav>
<p class="eyebrow">Community Work</p>
<h1 id="page-title">{e(a["title"])}</h1>
<p class="tagline">{e(a["tagline"])}</p>
{"".join(f'<p class="lead">{e(p)}</p>' for p in a["intro"])}
<div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 6px">
<a href="contact.html" class="pill">Contact Lucindha</a>
<a href="#why-title" class="pill ghost">Why invite me?</a>
</div>
</div>
<div class="hero-logo"><img src="images/{a["logo"]}" alt="Lucindha Lawson {e(a["title"])} logo" width="600" height="641" style="width: 320px; height: auto"></div>
</div>
</section>
{groups}
{why}
{cta}
'''
    out = page(a["title"], a["description"], "community.html", body)
    out = out.replace("<body>", f'<body class="theme-area" style="--area: {a["colour"]}; --area-lt: {a["light"]}; --area-dk: {a["dark"]}; --area-deep: {a.get("deep", a["dark"])}">', 1)
    (ROOT / a["file"]).write_text(out)
    print(a["file"], "written")

if __name__ == "__main__":
    for k, a in AREAS.items():
        build(k, a)
