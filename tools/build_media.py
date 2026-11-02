#!/usr/bin/env python3
"""Builds site/media.html (media & press page) in the soft style on the main navy (#0B1F33).
Edit the text below and run:  python3 tools/build_media.py
Note: keep the BDA trustee role out of these bios until it's announced (after the BDA AGM on 21 Nov 2026)."""
import sys, pathlib, html
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from page_shell import page, ROOT
from social import social_links
e = lambda s: html.escape(s, quote=False)

CHECK = ('<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#CBAB74" stroke-width="2" '
         'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>')

SHORT_BIO = ("Lucindha Lawson is an AAT licensed accountant, England Deaf futsal international and four-time Deaflympian. "
             "A profoundly Deaf British Sign Language user, she runs LUCINDHA LAWSON LTD, offering accessible accounting for Deaf and hearing clients, "
             "alongside coaching, public speaking and workshops on Deaf awareness, inclusion and resilience.")
LONG_BIO = [
    "Lucindha Lawson is an AAT licensed accountant and MAAT member, currently studying towards the Chartered Public Finance Accountant (CPFA) qualification through CIPFA. "
    "She is the founder of LUCINDHA LAWSON LTD, an accountancy practice built to be accessible to Deaf, Deafblind, hard-of-hearing, visually impaired and hearing clients.",
    "As a profoundly Deaf British Sign Language (BSL) user, Lucindha experienced language deprivation as a child and lives with Long QT syndrome. "
    "She went on to become a graduate accountant, a back-to-back European champion and a four-time Deaflympian, representing England in Deaf women's futsal as part of the FA England Para Programme.",
    "Lucindha is a volunteer coach in youth and Deaf football, holds the FA's UEFA C Licence, and is an ambassador for Sporting Equals, Brown Girl Sport and Beat The Block. "
    "She speaks and delivers workshops on Deaf awareness, inclusion, accessibility, women's sport, resilience and elite sport.",
]
FACTS = ["AAT licensed accountant and MAAT member (licence no. 1010532)", "Studying CPFA through CIPFA",
         "England Deaf women's futsal international", "Back-to-back European champion", "Four-time Deaflympian",
         "UEFA C Licence and FA National Futsal Course", "Ambassador for Sporting Equals, Brown Girl Sport and Beat The Block",
         "Profoundly Deaf British Sign Language user"]
TOPICS = ["Deaf awareness and Deaf culture", "Language deprivation and education", "Equality, diversity and inclusion (EDI)",
          "Women's and elite sport", "Resilience and living with Long QT syndrome", "Accessible professional services and finance"]

FEATURED_ON = ["Sky Sports News", "BBC", "COPA90", "England Football", "The FA", "LumoTV (BSL Zone)"]
# Media appearances: (kind, outlet, title, when, description, url or None, link text)
APPEARANCES = [
    ("Television", "Sky Sports News", "TV interviews", "", "Interviewed on Sky Sports News.", None, ""),
    ("Television", "BBC", "TV interviews", "", "Interviewed by the BBC.", None, ""),
    ("Video", "England Football", "Origins: Lucindha Lawson", "May 2026", "England Football's Origins series on how football shaped Lucindha's life, from foster care to the England deaf team.", "https://www.englandfootball.com/articles/2026/May/05/england-football-origins-lucindha-lawson-20260505", "Watch on England Football"),
    ("Documentary", "COPA90 (YouTube)", "Finding the First South Asian Lioness", "June 2025", "COPA90 documentary on why England is still waiting for its first senior South Asian Lioness, featuring Lucindha.", "https://youtu.be/jy944wVYxUw", "Watch on YouTube"),
    ("Photoshoot", "England women's senior team", "England EURO match photoshoot", "", "Photoshoot at an England senior women's European Championship match.", None, ""),
    ("TV programme", "LumoTV (BSL Zone)", "Getting Personal with Lucindha Lawson", "2022", "A 27-minute conversation in British Sign Language with presenter Deepa Shastri about Lucindha's life and football career.", "https://lumotv.co.uk/watch/getting-personal/getting-personal-with-lucindha-lawson", "Watch on LumoTV"),
    ("Campaign video", "The FA", "Asian Inclusion campaign", "2019", "Featured in The FA's campaign to increase Asian participation in football.", "https://youtu.be/edPNPflDgdk", "Watch on YouTube"),
]

def appearance(kind, outlet, title, when, desc, url, linktext):
    meta = " · ".join(x for x in [kind, outlet, when] if x)
    link = (f'<a href="{url}" class="link" target="_blank" rel="noopener">{e(linktext)}<span class="sr"> – {e(title)} (opens in a new tab)</span></a>' if url else "")
    return f'<li class="card"><p class="sub">{e(meta)}</p><h3>{e(title)}</h3><p>{e(desc)}</p>{link}</li>'

body = f'''
<section class="hero" aria-labelledby="page-title">
<div class="wrap">
<div class="hero-text">
<nav aria-label="Breadcrumb" class="crumbs"><a href="home.html">Home</a> <span aria-hidden="true">/</span> Media &amp; press</nav>
<p class="eyebrow">Media &amp; press</p>
<h1 id="page-title">Media <em>&amp; press.</em></h1>
<img class="portrait-m" src="images/lucindha.jpg" alt="Lucindha Lawson smiling, wearing a navy blazer" width="800" height="1000">
<p class="lead">Media appearances, short and full biographies, key facts, the topics I speak about and a photo to download.</p>
<div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 6px">
<a href="mailto:hello@lucindhalawson.co.uk?subject=Media%20enquiry" class="pill">Media enquiries</a>
<a href="#photos-title" class="pill ghost">Download a photo</a>
</div>
</div>
<div class="hero-logo">
<img class="portrait" src="images/lucindha.jpg" alt="Lucindha Lawson smiling, wearing a navy blazer" width="800" height="1000">
</div>
</div>
</section>

<section aria-labelledby="appear-title">
<div class="wrap">
<div class="head">
<p class="eyebrow">As featured on</p>
<h2 id="appear-title">Media appearances</h2>
<p class="featured-on">{" · ".join(e(x) for x in FEATURED_ON)}</p>
</div>
<ul class="grid">{"".join(appearance(*a) for a in APPEARANCES)}</ul>
<p class="muted" style="margin-top: 28px">For articles and match reports, see the <a href="news.html">News page</a>.</p>
</div>
</section>

<section class="band" aria-labelledby="bio-title">
<div class="wrap">
<div class="head">
<h2 id="bio-title">Biography</h2>
<p class="muted">You're welcome to use either version, edited for length if needed.</p>
</div>
<div class="grid grid-2" style="align-items: start">
<div class="card">
<h3>Short biography</h3>
<p class="sub">About 50 words</p>
<p id="bio-short">{e(SHORT_BIO)}</p>
<button type="button" class="pill ghost copy-btn" data-copy="bio-short" style="align-self: flex-start; cursor: pointer">Copy short biography</button>
</div>
<div class="card">
<h3>Full biography</h3>
<p class="sub">About 150 words</p>
<div id="bio-long" class="stack" style="gap: 12px">{"".join(f"<p>{e(p)}</p>" for p in LONG_BIO)}</div>
<button type="button" class="pill ghost copy-btn" data-copy="bio-long" style="align-self: flex-start; cursor: pointer">Copy full biography</button>
</div>
</div>
<p class="muted copy-status" role="status" aria-live="polite" style="margin-top: 16px; min-height: 1.6em"></p>
</div>
</section>

<section aria-labelledby="facts-title">
<div class="wrap split" style="align-items: flex-start">
<div class="stack">
<h2 id="facts-title">Key facts</h2>
<ul class="ticks">{"".join(f"<li>{CHECK}<span>{e(f)}</span></li>" for f in FACTS)}</ul>
</div>
<div class="stack">
<h2>Topics I speak about</h2>
<ul class="ticks">{"".join(f"<li>{CHECK}<span>{e(t)}</span></li>" for t in TOPICS)}</ul>
<a href="speaking.html" class="link">See all speaking topics</a>
</div>
</div>
</section>

<section class="band" aria-labelledby="photos-title">
<div class="wrap split">
<img class="photo" src="images/lucindha.jpg" alt="Lucindha Lawson smiling, wearing a navy blazer" width="800" height="1000" style="flex: 1 1 260px; max-width: 360px; width: 100%; height: auto; border-radius: 22px; border: 1px solid var(--line); display: block">
<div class="stack" style="flex: 999 1 420px">
<h2 id="photos-title">Photos</h2>
<p class="muted">You're welcome to use this photo alongside coverage of Lucindha and her work. Please don't crop it in a way that changes its meaning or use it to suggest an endorsement. For other or higher-resolution photos, just ask.</p>
<a href="images/lucindha.jpg" download="Lucindha-Lawson.jpg" class="pill" style="align-self: flex-start">Download photo</a>
</div>
</div>
</section>

<section aria-labelledby="interviews-title">
<div class="wrap">
<div class="cta">
<div>
<h2 id="interviews-title">Interviews and bookings</h2>
<p class="muted">I'm a BSL user. Interviews can be arranged with a BSL interpreter, or questions can be sent by email. For talks and events, please include the date, location and audience.</p>
<p class="muted">Email <a href="mailto:hello@lucindhalawson.co.uk?subject=Media%20enquiry">hello@lucindhalawson.co.uk</a></p>
<p class="muted">Follow Lucindha</p>
{social_links()}
</div>
<a href="mailto:hello@lucindhalawson.co.uk?subject=Media%20enquiry" class="pill">Send an email</a>
</div>
</div>
</section>

<script>
document.querySelectorAll(".copy-btn").forEach(function (b) {{
  b.addEventListener("click", function () {{
    var el = document.getElementById(b.dataset.copy), status = document.querySelector(".copy-status");
    var text = Array.prototype.map.call(el.querySelectorAll("p").length ? el.querySelectorAll("p") : [el], function (p) {{ return p.textContent; }}).join("\\n\\n");
    function done(ok) {{ status.textContent = ok ? "Copied to your clipboard." : "Couldn't copy automatically – please select the text and copy it."; }}
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () {{ done(true); }}, function () {{ done(false); }});
    else done(false);
  }});
}});
</script>
'''

(ROOT / "media.html").write_text(page("Media & press",
    "Media and press information for Lucindha Lawson: biographies, key facts, speaking topics and a photo to download.",
    "media.html", body))
print("media.html written")
