#!/usr/bin/env python3
"""Builds site/about.html in the soft style. Edit the text below and run:  python3 tools/build_about.py"""
import sys, pathlib, html
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from page_shell import page, ROOT
e = lambda s: html.escape(s, quote=False)

CHECK = ('<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#CBAB74" stroke-width="2" '
         'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>')

BIO = [
    "I’m an AAT Licensed Accountant and MAAT member, currently studying towards the Chartered Public Finance Accountant (CPFA) qualification through CIPFA. Alongside my finance career in local government, I represent England internationally in Deaf football and futsal, while also coaching, speaking and delivering workshops.",
    "As a profoundly Deaf British Sign Language (BSL) user, I understand first-hand how communication barriers affect access to professional services. My aim is to provide clear, honest and accessible support so everyone can communicate with confidence.",
    "Whether I’m helping a client understand their finances, coaching young athletes or delivering workshops, my aim is always the same: build trust, create lasting relationships and make a positive difference.",
]
GOAL = "My goal is simple: to make professional services more accessible, build lasting relationships and help people and organisations succeed with confidence."
DO = ["Accounting & Bookkeeping", "Tax & Business Support", "Public Speaking", "Finance & BSL Workshops", "Deaf Awareness & Accessibility", "Football & Futsal Coaching"]
VALUES = [("Integrity", "Honest, transparent advice."), ("Accessibility", "Removing communication barriers."),
          ("Excellence", "Committed to the highest professional standards."), ("Community", "Supporting individuals, charities and small businesses.")]
QUALS = [
    ("MAAT", "Association of Accounting Technicians", "Full member of the Association of Accounting Technicians, demonstrating recognised professional competence and a commitment to high ethical standards."),
    ("AAT Licensed Accountant", "Licensed & Regulated", "Authorised to provide accountancy services in accordance with AAT's professional, ethical and regulatory standards. Licence no. 1010532."),
    ("CIPFA Student", "Chartered Public Finance Accountant", "Currently studying towards the internationally recognised Chartered Public Finance Accountant qualification through CIPFA."),
    ("England Deaf Women's Futsal", "Part of the FA England Para Programme", "Proud to represent England in Deaf women's futsal, competing at the highest level of international Deaf sport."),
    ("National Futsal Course", "The Football Association", "Successfully completed The Football Association's National Futsal Course, strengthening my specialist coaching knowledge to support the development of players and teams."),
    ("UEFA C Licence", "The Football Association", "Successfully completed The Football Association's UEFA C Licence, developing the coaching knowledge and practical skills to support player development in football and futsal."),
]
# BDA trusteeship is not announced until the BDA AGM on 21 November 2026 - set SHOW_GOV = True after that.
SHOW_GOV = False
GOV = [("British Deaf Association", "Trustee · 2026–2029", "Serving on the Board of Trustees, contributing to good governance and supporting the BDA’s work to strengthen, protect and promote British Sign Language and the Deaf community.", "https://bda.org.uk/board/")]
AMB = [
    ("Sporting Equals", "Official Ambassador · Since 2025", "As a Sporting Equals Ambassador, I use my platform and lived experience in elite Deaf sport to champion equality, inclusion and representation, helping to break down barriers and create greater opportunities in sport.", "https://www.sportingequals.org.uk/about-us/ambassadors/"),
    ("Brown Girl Sport", "Athlete Ambassador · Since 2025", "As a Brown Girl Sport Ambassador, I use my voice and lived experience as a Deaf British South Asian athlete to champion representation in sport, challenge stereotypes and inspire the next generation of South Asian women and girls to see that they belong.", "https://www.browngirlsport.co.uk/post/lucindha-lawson-england-s-first-south-asian-lioness"),
    ("Beat The Block", "Ambassador · Since 2026", "As a Beat The Block Ambassador, I use my experience as an athlete to support and inspire young women from underrepresented backgrounds, championing representation and helping them see what is possible through education, exposure and sport.", None),
]
WHY = [
    ("Accessible by Design", "As a profoundly Deaf British Sign Language (BSL) user, I understand the importance of clear, inclusive communication and making professional services accessible to everyone."),
    ("Professional Excellence", "Combining practical experience in local government finance with recognised qualifications and a commitment to continuous professional development."),
    ("High Performance Mindset", "Representing England internationally has developed discipline, resilience and teamwork – qualities I bring to every client relationship."),
    ("People First", "Building trusted, long-term relationships by providing honest advice, personal service and practical support."),
]

def card(t, sub, d, href=None):
    link = (f'<a href="{href}" class="link" target="_blank" rel="noopener">Learn more<span class="sr"> about {e(t)} (opens in a new tab)</span></a>' if href else "")
    return f'<li class="card"><h3>{e(t)}</h3><p class="sub">{e(sub)}</p><p>{e(d)}</p>{link}</li>'

def section(sid, title, intro, inner, band=False, eyebrow=None, anchor=None):
    a = f' id="{anchor}"' if anchor else ""
    eb = f'<p class="eyebrow">{e(eyebrow)}</p>\n' if eyebrow else ""
    return f'''
<section{a}{' class="band"' if band else ''} aria-labelledby="{sid}">
<div class="wrap">
<div class="head">
{eb}<h2 id="{sid}">{e(title)}</h2>
<p class="muted">{e(intro)}</p>
</div>
{inner}
</div>
</section>
'''

body = f'''
<section class="hero" aria-labelledby="page-title">
<div class="wrap">
<div class="hero-text">
<nav aria-label="Breadcrumb" class="crumbs"><a href="home.html">Home</a> <span aria-hidden="true">/</span> About</nav>
<p class="eyebrow">About Lucindha</p>
<h1 id="page-title">Hello, I’m <em>Lucindha Lawson.</em></h1>
<img class="portrait-m" src="images/lucindha.jpg" alt="Lucindha Lawson smiling, wearing a navy blazer" width="800" height="1000">
<p class="lead" style="color: var(--cream)">{e(BIO[0])}</p>
{"".join(f'<p class="muted">{e(p)}</p>' for p in BIO[1:])}
<p class="goal">{e(GOAL)}</p>
</div>
<div class="hero-logo">
<img class="portrait" src="images/lucindha.jpg" alt="Lucindha Lawson smiling, wearing a navy blazer" width="800" height="1000">
</div>
</div>
</section>

<section class="band" aria-label="What I do and my values">
<div class="wrap split" style="align-items: flex-start">
<div class="stack">
<h2>What I Do</h2>
<ul class="ticks">
{"".join(f'<li>{CHECK}<span>{e(x)}</span></li>' for x in DO)}
</ul>
</div>
<div class="stack">
<h2>My Values</h2>
<ul class="grid values">
{"".join(f'<li class="card"><h3>{e(t)}</h3><p>{e(d)}</p></li>' for t, d in VALUES)}
</ul>
</div>
</div>
</section>
''' + section("quals-title", "Qualifications & Professional Memberships",
              "Committed to continuous professional development and recognised professional standards.",
              '<ul class="grid">' + "".join(card(*q) for q in QUALS) + "</ul>", anchor="qualifications") \
  + (section("gov-title", "Leadership & Governance",
              "Contributing professional expertise, lived experience and leadership to support strong governance and positive change.",
              '<ul class="grid" style="grid-template-columns: minmax(0, 760px)">' + "".join(card(*g) for g in GOV) + "</ul>", band=True) if SHOW_GOV else "") \
  + section("amb-title", "Ambassador Roles",
              "Using sport, lived experience and advocacy to champion inclusion, representation and positive change.",
              '<ul class="grid">' + "".join(card(*a) for a in AMB) + "</ul>", band=not SHOW_GOV) \
  + section("why-title", "Why Choose Lucindha?",
              "I believe great service is about more than qualifications. It's about building trust, communicating clearly and helping every client achieve their goals with confidence.",
              '<ul class="ticks two">' + "".join(f'<li>{CHECK}<span><strong>{e(t)}</strong> – {e(d)}</span></li>' for t, d in WHY) + "</ul>", band=True) \
  + '''
<section aria-labelledby="cta-title">
<div class="wrap">
<div class="cta">
<div>
<h2 id="cta-title">Ready to Work Together?</h2>
<p class="muted">Whether you're looking for accounting support, a speaker, a workshop or simply have a question, I'd love to hear from you.</p>
</div>
<a href="contact.html" class="pill">Contact Lucindha</a>
</div>
</div>
</section>
'''

(ROOT / "about.html").write_text(page("About",
    "About Lucindha Lawson: AAT Licensed Accountant and MAAT member studying CIPFA, England Deaf futsal international" + (", BDA trustee" if SHOW_GOV else "") + " and ambassador for Sporting Equals, Brown Girl Sport and Beat The Block.",
    "about.html", body))
print("about.html written")
