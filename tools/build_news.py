#!/usr/bin/env python3
"""Builds news.html for the Lucindha Lawson website.
To add a story: add a dict to STORIES (any order - the page sorts newest first), then run:
    python3 build_news.py <output folder>
"""
import sys, html, pathlib

# kind: article | interview | video | match | squad | campaign
STORIES = [
    dict(date="2026-05-05", outlet="England Football", kind="video", label="Video & article",
         title="Origins: how football found Lucindha",
         summary="In England Football's Origins series, Lucindha looks back on growing up in London, her years in foster care, the deaf school where she found belonging, and how football has supported her wellbeing and her England career.",
         url="https://www.englandfootball.com/articles/2026/May/05/england-football-origins-lucindha-lawson-20260505",
         link="Watch on England Football"),
    dict(date="2026-03-21", outlet="Her Football Hub", kind="match", label="Match report",
         title="England crowned European Deaf Futsal champions",
         summary="England's deaf women went unbeaten in Croatia to win the European Deaf Futsal Championship. Lucindha scored twice in the opening win over Poland and both goals in the final against them.",
         url="https://herfootballhub.com/england-win-womens-european-deaf-futsal-championship/",
         link="Read on Her Football Hub"),
    dict(date="2026-01-08", outlet="Tamil Guardian", kind="interview", label="Interview",
         title="Bronze at the Tokyo Deaflympics",
         summary="Lucindha talks about winning bronze with Great Britain's deaf women's football team in Tokyo, raising around £4,000 herself to get there, and why she campaigns for government funding and better deaf education.",
         url="https://www.tamilguardian.com/content/british-tamil-football-player-speaks-her-success-deaflympics",
         link="Read on Tamil Guardian"),
    dict(date="2025-11-09", outlet="Thamarai", kind="article", label="Feature",
         title="Representing England at the Deaflympics in Tokyo",
         summary="A profile of Lucindha as a British Tamil deaf footballer heading to her fourth Deaflympics. It covers losing her brother in 2016, a diagnosis of a rare inherited heart condition, and how Deaflympians must fund their own places on the team.",
         url="https://thamarai.com/lifestyle/society/british-tamil-footballer-lucindha-lawson-represents-england-in-tokyo",
         link="Read on Thamarai"),
    dict(date="2025-07-22", outlet="UK Deaf Sport", kind="squad", label="Squad announcement",
         title="Named in the DeaflympicsGB squad for Tokyo 2025",
         summary="UK Deaf Sport announced its provisional DeaflympicsGB team for the Tokyo Deaflympics, with Lucindha selected for the women's football squad.",
         url="https://ukdeafsport.org.uk/deaflympicsgb-squad-for-tokyo-2025/",
         link="Read on UK Deaf Sport"),
    dict(date="2025-06-17", outlet="England Football", kind="match", label="Match report",
         title="Opening goal in a 5-0 win over Italy",
         summary="Lucindha opened the scoring as England's deaf women beat Italy 5-0 at the World Deaf Futsal Championship in Pescara, sealing a place in the quarter-finals.",
         url="https://www.englandfootball.com/articles/2025/Jun/17/england-womens-deaf-championship-italy-report-20251706",
         link="Read on England Football"),
    dict(date="2025-05-07", outlet="England Football", kind="squad", label="Squad announcement",
         title="Selected for the 2025 World Deaf Futsal Championship",
         summary="Lucindha was named in England's 12-player women's deaf squad for the World Deaf Futsal Championship in Italy, where the team aimed to build on its 2023 bronze.",
         url="https://www.englandfootball.com/articles/2025/May/07/england-deaf-women-world-deaf-futsal-championship-squad-confirmed-20250705",
         link="Read on England Football"),
    dict(date="2024-11-20", outlet="Ocean Outdoor", kind="campaign", label="Campaign",
         title="Launching the DeaflympicsGB fundraising appeal",
         summary="Lucindha joined the Leicester Square launch of a fundraising appeal for DeaflympicsGB athletes, who receive no government or National Lottery funding, one year before the Tokyo Games.",
         url="https://oceanoutdoor.com/blog/ocean-supports-deaflympicsgb-athletes-with-urgent-fundraising-appeal-copy/",
         link="Read on Ocean Outdoor"),
    dict(date="2024-11-12", outlet="defibshop", kind="campaign", label="Campaign",
         title="Making defibrillators accessible for Deaf people",
         summary="defibshop donated a defibrillator to support Lucindha's campaigning on safe access to emergency equipment for Deaf people, since most defibrillators rely on spoken instructions.",
         url="https://www.defibshop.co.uk/blog/post/lucindha-lawson",
         link="Read on defibshop"),
    dict(date="2023-11-09", outlet="North East Londoner", kind="squad", label="Local news",
         title="London Helvecia defender heads to Brazil with England",
         summary="Local coverage of Lucindha's selection for England's squad at the World Deaf Futsal Championships in Brazil, looking back to her bronze medal at the 2014 European Championships in Sofia.",
         url="https://www.nelondoner.co.uk/sport/09112023-england-deaf-futsal",
         link="Read on North East Londoner"),
    dict(date="2023-11-02", outlet="England Football", kind="squad", label="Squad announcement",
         title="Selected for the 2023 World Deaf Futsal Championships",
         summary="Lucindha was named in England's nine-player women's deaf futsal squad for the World Championships in São Paulo, where the team went on to win bronze.",
         url="https://www.englandfootball.com/articles/2023/Nov/02/england-deaf-women-futsal-world-championship-squad-20231102",
         link="Read on England Football"),
    dict(date="2023-09-07", outlet="Sports Gazette", kind="interview", label="Interview",
         title="Being deaf and from an ethnic minority in sport",
         summary="Lucindha talks about helping crowdfund England's deaf women's futsal team to a European title, how she plays using visual cues, and her responsibility to advocate for others.",
         url="https://sportsgazette.co.uk/being-minority-inside-minority-demanding-rewarding-england-deaf-futsal-lucindha-lawson/",
         link="Read on Sports Gazette"),
    dict(date="2023-04-18", outlet="England Football", kind="interview", label="Interview",
         title="Looking ahead to a big year for England's deaf women",
         summary="Lucindha describes starting football at nine and catching up on communication through hard work, calls the European futsal title a career highlight, and says she plans to keep playing until she's 40.",
         url="https://www.englandfootball.com/articles/2023/Apr/18/england-womens-deaf-team-interview-lucindha-lawson-20231804",
         link="Read on England Football"),
    dict(date="2023", outlet="LumoTV · Getting Personal", kind="video", label="Video interview",
         title="Getting Personal with Lucindha Lawson",
         summary="Presenter Deepa Shastri talks with Lucindha, the first deaf Asian woman to win gold for England at the European Women's Deaf Futsal Championship, about her childhood, time in care, losing her brother, and how football gave her stability and belonging. Produced with BSLBT.",
         url="https://lumotv.co.uk/watch/getting-personal/getting-personal-with-lucindha-lawson",
         link="Watch on LumoTV",
         note="this interview discusses suicide and childhood trauma."),
]

# Optional photo per story: put the file in the site's images/ folder and add image="images/name.jpg", alt="..." to the story.

ICONS = {  # simple stroke icons, decorative
    "article":   '<path d="M4 4h12l4 4v12H4z"></path><path d="M8 10h8M8 14h8M8 18h5"></path>',
    "interview": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M8 9h8M8 13h5"></path>',
    "video":     '<rect x="2" y="5" width="15" height="14" rx="2"></rect><path d="M17 10l5-3v10l-5-3z"></path>',
    "match":     '<circle cx="12" cy="12" r="9"></circle><path d="M12 7l4 3-1.5 5h-5L8 10z"></path>',
    "squad":     '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"></path>',
    "campaign":  '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1z"></path><path d="M17 8a5 5 0 0 1 0 8M19.5 5.5a8.5 8.5 0 0 1 0 13"></path>',
}
TINT = {"article": "#F2C14E", "interview": "#F2C14E", "video": "#9CC8FF", "match": "#6FD3A8", "squad": "#6FD3A8", "campaign": "#FF9F87"}
MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

def nice_date(d):
    p = d.split("-")
    if len(p) == 3: return f"{int(p[2])} {MONTHS[int(p[1])-1]} {p[0]}"
    if len(p) == 2: return f"{MONTHS[int(p[1])-1]} {p[0]}"
    return p[0]

e = lambda s: html.escape(s, quote=True)

def card(s):
    tint = TINT.get(s["kind"], "#F2C14E")
    if s.get("image"):
        thumb = f'<img src="{e(s["image"])}" alt="{e(s.get("alt",""))}" style="width: 100%; height: 100%; object-fit: cover; display: block">'
    else:
        thumb = f'<svg aria-hidden="true" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="{tint}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ICONS.get(s["kind"], ICONS["article"])}</svg>'
    note = (f'\n<p style="margin: 0; font-size: 1rem; background: #0A1D37; border-radius: 8px; padding: 10px 14px"><strong>Content note:</strong> {e(s["note"])}</p>'
            if s.get("note") else "")
    return f'''<li class="card">
<div class="thumb" style="border-top: 4px solid {tint}">{thumb}</div>
<div style="flex: 999 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 10px">
<p style="margin: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 1rem; color: #C5CFDD"><time datetime="{e(s["date"])}" style="color: #F2C14E; font-weight: 700">{nice_date(s["date"])}</time><span>{e(s["outlet"])}</span><span>· {e(s["label"])}</span></p>
<h2 style="margin: 0; font-size: 1.4rem; line-height: 1.3">{e(s["title"])}</h2>
<p style="margin: 0; color: #C5CFDD">{e(s["summary"])}</p>{note}
<a href="{e(s["url"])}" target="_blank" rel="noopener" style="font-weight: 700; padding: 6px 0; align-self: flex-start">{e(s["link"])}<span class="sr"> (opens in a new tab)</span></a>
</div>
</li>'''

PAGE = '''<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Articles, interviews, match reports and videos about Lucindha Lawson, England deaf futsal player, Deaflympian and Deaf accessibility campaigner.">
<title>News – Lucindha Lawson</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&amp;display=swap">
<style>
body{margin:0;background-color:#0A1D37;background-image:radial-gradient(1100px 620px at 88% -8%,rgba(242,193,78,.16),transparent 62%),radial-gradient(900px 560px at -12% 18%,rgba(156,200,255,.12),transparent 60%),radial-gradient(800px 600px at 100% 70%,rgba(111,211,168,.07),transparent 60%),linear-gradient(180deg,#0A1D37 0%,#0C2244 45%,#081830 100%)}
a{color:#F2C14E}a:hover{color:#FFD97A}
a:focus-visible,button:focus-visible{outline:3px solid #F2C14E;outline-offset:3px}
.skip{position:absolute;left:16px;top:-80px;background:#F2C14E;color:#0A1D37;padding:12px 16px;font-weight:700;border-radius:6px;z-index:10}
.skip:focus{top:12px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.card{background:linear-gradient(160deg,#18355F 0%,#12294D 55%,#0E2242 100%);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;border:1px solid #2A4370;border-radius:14px;padding:24px;display:flex;flex-wrap:wrap;gap:20px 24px;align-items:flex-start}
.card:hover{border-color:#F2C14E;transform:translateY(-2px);box-shadow:0 14px 34px rgba(0,0,0,.35)}
@media (prefers-reduced-motion:reduce){.card{transition:none}.card:hover{transform:none}}
.thumb{flex:0 0 120px;height:120px;border-radius:10px;background:radial-gradient(120px 90px at 70% 20%,rgba(242,193,78,.14),transparent 70%),linear-gradient(160deg,#102849,#081730);display:flex;align-items:center;justify-content:center;overflow:hidden;box-sizing:border-box}
@media (max-width:520px){.thumb{flex:1 1 100%;height:140px}}
/* gradient-layer */
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
</style>
</head>
<body>
<div style="position: relative; background: transparent; color: #F7F3E8; font-family: 'Atkinson Hyperlegible', Arial, sans-serif; font-size: 1.125rem; line-height: 1.6">
<a href="#main" class="skip">Skip to main content</a>

<header style="border-bottom: 1px solid #2A4370">
<div style="max-width: 1180px; margin: 0 auto; padding: 18px 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px">
<a href="index.html" aria-label="Lucindha Lawson – home" style="display: flex; align-items: center; gap: 14px; text-decoration: none; color: #F7F3E8">
<div aria-hidden="true" style="width: 52px; height: 52px; border: 2px solid #F2C14E; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #F2C14E; font-weight: 700; font-size: 1.25rem">LL</div>
<div style="display: flex; flex-direction: column; line-height: 1.2">
<span style="font-weight: 700; letter-spacing: 0.14em; font-size: 1.05rem">LUCINDHA LAWSON</span>
<span style="font-size: 0.875rem; color: #C5CFDD; letter-spacing: 0.06em">Accounting &amp; Bookkeeping</span>
</div>
</a>
<nav aria-label="Main" style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px 22px">
<a href="index.html" style="color: #F7F3E8; text-decoration: none; padding: 10px 0">Home</a>
<a href="index.html#about" style="color: #F7F3E8; text-decoration: none; padding: 10px 0">About</a>
<a href="accounting.html" style="color: #F7F3E8; text-decoration: none; padding: 10px 0">Accounting</a>
<a href="community.html" style="color: #F7F3E8; text-decoration: none; padding: 10px 0">Community Work</a>
<a href="news.html" aria-current="page" style="color: #F7F3E8; text-decoration: underline; text-decoration-color: #F2C14E; text-decoration-thickness: 3px; text-underline-offset: 8px; padding: 10px 0; font-weight: 700">News</a>
<a href="contact.html" style="color: #F7F3E8; text-decoration: none; padding: 10px 0">Contact</a>
<a href="contact.html" class="btn" style="background: linear-gradient(135deg, #FFDC85 0%, #F2C14E 48%, #E3AA32 100%); box-shadow: 0 6px 18px rgba(242,193,78,.25); color: #0A1D37; text-decoration: none; font-weight: 700; padding: 12px 20px; border-radius: 8px">Request a quote</a>
</nav>
</div>
</header>

<main id="main">

<section class="glow" aria-labelledby="news-title" style="padding: 72px 0 48px">
<div style="max-width: 1180px; margin: 0 auto; padding: 0 24px; display: flex; flex-direction: column; gap: 20px">
<nav aria-label="Breadcrumb" style="font-size: 1rem; color: #C5CFDD"><a href="index.html">Home</a> <span aria-hidden="true">/</span> News</nav>
<h1 id="news-title" style="margin: 0; font-size: clamp(2.1rem, 4vw, 3rem); line-height: 1.15">News &amp; media</h1>
<p style="margin: 0; font-size: 1.2rem; color: #C5CFDD; max-width: 40em">Articles, interviews, match reports and videos about Lucindha – from winning medals with England and Great Britain to campaigning for Deaf accessibility. Links open the original story on the publisher's website.</p>
</div>
</section>

<div style="max-width: 960px; margin: 0 auto; padding: 0 24px 88px; display: flex; flex-direction: column; gap: 32px">
<ol reversed aria-label="Stories, newest first" style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 20px">
%CARDS%
</ol>

<aside aria-label="Media enquiries" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; border: 2px solid #F2C14E; border-radius: 16px; background: linear-gradient(135deg, rgba(242,193,78,.14) 0%, rgba(23,52,95,.5) 60%, rgba(12,31,64,.35) 100%); padding: 28px 32px">
<p style="margin: 0; flex: 1 1 380px"><strong>Media and speaking enquiries</strong> <span style="color: #C5CFDD">– to feature Lucindha or invite her to speak, get in touch.</span></p>
<a href="contact.html" class="btn" style="background: linear-gradient(135deg, #FFDC85 0%, #F2C14E 48%, #E3AA32 100%); box-shadow: 0 6px 18px rgba(242,193,78,.25); color: #0A1D37; text-decoration: none; font-weight: 700; padding: 14px 24px; border-radius: 10px">Contact Lucindha</a>
</aside>
</div>
</main>

<footer style="border-top: 1px solid #2A4370; background: linear-gradient(180deg, #0A1D37 0%, #061226 100%); padding: 40px 0; font-size: 0.95rem">
<div style="max-width: 1180px; margin: 0 auto; padding: 0 24px; display: flex; flex-wrap: wrap; gap: 16px 28px; justify-content: space-between; color: #C5CFDD">
<span>© 2026 LUCINDHA LAWSON LTD · Company no. [NUMBER] · AAT licence no. [NUMBER]</span>
<nav aria-label="Legal" style="display: flex; flex-wrap: wrap; gap: 8px 20px">
<a href="#" style="color: #F7F3E8">Privacy</a><a href="#" style="color: #F7F3E8">Cookies</a><a href="#" style="color: #F7F3E8">Accessibility</a><a href="#" style="color: #F7F3E8">Terms</a>
</nav>
</div>
</footer>
</div>
</body>
</html>
'''

if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    stories = sorted(STORIES, key=lambda s: s["date"], reverse=True)
    (out / "news.html").write_text(PAGE.replace("%CARDS%", "\n".join(card(s) for s in stories)))
    print(f"news.html written with {len(stories)} stories")
