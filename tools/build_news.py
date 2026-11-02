#!/usr/bin/env python3
"""Builds news.html for the Lucindha Lawson website.
News = written coverage (articles, interviews in print/online, match reports). TV, video, documentaries,
campaigns and photoshoots go on the Media page instead (APPEARANCES in tools/build_media.py) - never list the same item in both.
To add a story: add a dict to STORIES (any order - the page sorts newest first), then run:
    python3 build_news.py <output folder>
"""
import sys, html, pathlib

# kind: article | interview | video | match | squad | campaign
STORIES = [
    dict(date="2026-03-23", outlet="England Football", kind="match", label="Match report",
         title="Two goals in the European final",
         summary="England's deaf women were crowned European futsal champions in Croatia with a 2-0 win over Poland in the final. Lucindha scored both goals, and captain Zara Musker said she took her chances brilliantly.",
         url="https://www.englandfootball.com/articles/2026/Mar/23/Reaction-as-England-Deaf-Women-crowned-European-champions",
         link="Read on England Football"),
    dict(date="2026-03-08", outlet="England Football", kind="article", label="Squad profiles",
         title="Meet the England women's deaf squad",
         summary="Before the European Championship, captain Zara Musker introduced the squad. She named Lucindha as one of the most improved players, said the team relies on her experience to get into scoring areas, and described her as the one who keeps the mood light.",
         url="https://www.englandfootball.com/articles/2026/Mar/05/zara-musker-england-womens-deaf-team-euro-preview-squad-profiles-20260703",
         link="Read on England Football"),
    dict(date="2026-02-20", outlet="England Football", kind="squad", label="Squad announcement",
         title="Selected for the 2026 European Deaf Futsal Championship",
         summary="Lucindha was named in England's 13-player women's deaf squad for the European Championship finals in Poreč, Croatia, in March 2026.",
         url="https://www.englandfootball.com/articles/2026/Feb/20/england-womens-deaf-squad-named-for-european-championship-finals-20262002",
         link="Read on England Football"),
    dict(date="2025-06-22", outlet="England Football", kind="match", label="Match report",
         title="Two goals in the World Championship quarter-final",
         summary="Lucindha was England's top scorer with two goals in the World Deaf Futsal Championship quarter-final against Ireland in Italy. England lost 6-3 but went on to finish fifth.",
         url="https://www.englandfootball.com/articles/2025/Jun/22/england-womens-deaf-championship-ireland-report-20252206",
         link="Read on England Football"),
    dict(date="2025", outlet="Sporting Equals", kind="campaign", label="Ambassador",
         title="Sporting Equals Ambassador",
         summary="Sporting Equals names Lucindha as one of its ambassadors: a Deaf athlete who plays as a pivot for Maidenhead United Futsal Club and England's women's deaf futsal team, championing equality, inclusion and representation in sport.",
         url="https://www.sportingequals.org.uk/about-us/ambassadors/",
         link="Read on Sporting Equals"),
    dict(date="2024-10-07", outlet="UK Deaf Sport", kind="squad", label="Qualifier",
         title="Great Britain qualify for the Tokyo Deaflympics",
         summary="Great Britain's deaf women beat Poland 3-2 at Hanley Town, in the first official women's deaf international played in the UK, to qualify for the 2025 Deaflympics in Tokyo.",
         url="https://ukdeafsport.org.uk/deaflympics-women-football-qualifier-gbr-vs-pol/",
         link="Read on UK Deaf Sport"),
    dict(date="2024-01-31", outlet="Haringey Community Press", kind="campaign", label="Local news",
         title="Appealing for help to reach the Winter Deaflympics",
         summary="Local coverage of Lucindha's fundraising appeal after being shortlisted for Great Britain's deaf women's futsal squad at the 2024 Winter Deaflympics, where deaf athletes had to fund their own places.",
         url="https://haringeycommunitypress.co.uk/2024/01/31/winter-deaflympics-harringay-athlete/",
         link="Read on Haringey Community Press"),
    dict(date="2022-07-21", outlet="The Limping Chicken", kind="campaign", label="News",
         title="Raising £15,000 after the FA withdrew funding",
         summary="After the FA withdrew funding from England's deaf women's futsal team, Lucindha called the decision devastating and helped lead the team's appeal to raise the money to compete.",
         url="https://limpingchicken.com/2022/07/21/england-deaf-womens-futsal-team-forced-to-raise-15000-after-fa-pulls-funding/",
         link="Read on The Limping Chicken"),
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
# tile background = brand area colour (Accounting navy, Sport & Coaching green, Public Speaking plum)
AREA = {"article": "#0B2945", "interview": "#0B2945", "video": "#0B2945", "match": "#2A3D3B", "squad": "#2A3D3B", "campaign": "#4A3046"}
MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]


def nice_date(d):
    p = d.split("-")
    if len(p) == 3: return f"{int(p[2])} {MONTHS[int(p[1])-1]} {p[0]}"
    if len(p) == 2: return f"{MONTHS[int(p[1])-1]} {p[0]}"
    return p[0]

e = lambda s: html.escape(s, quote=True)

def card(s):
    area = AREA.get(s["kind"], "#0B2945")
    if s.get("image"):
        thumb = f'<img src="{e(s["image"])}" alt="{e(s.get("alt",""))}" style="width: 100%; height: 100%; object-fit: cover; display: block">'
    else:
        thumb = f'<svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBAB74" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{ICONS.get(s["kind"], ICONS["article"])}</svg>'
    note = f'<p class="note-box"><strong>Content note:</strong> {e(s["note"])}</p>' if s.get("note") else ""
    return f"""<li class="card news-card">
<div class="news-thumb" style="background: {area}">{thumb}</div>
<div class="stack" style="gap: 10px; flex: 999 1 320px; min-width: 0">
<p class="news-meta"><time datetime="{e(s["date"])}">{nice_date(s["date"])}</time><span>{e(s["outlet"])}</span><span>{e(s["label"])}</span></p>
<h2 class="news-title">{e(s["title"])}</h2>
<p>{e(s["summary"])}</p>{note}
<a href="{e(s["url"])}" class="link" target="_blank" rel="noopener" style="align-self: flex-start">{e(s["link"])}<span class="sr"> (opens in a new tab)</span></a>
</div>
</li>"""

def body(stories):
    return f"""
<section class="hero news-hero" aria-labelledby="page-title">
<div class="wrap">
<div class="hero-text" style="flex-basis: 100%">
<nav aria-label="Breadcrumb" class="crumbs"><a href="home.html">Home</a> <span aria-hidden="true">/</span> News</nav>
<p class="eyebrow">News &amp; media</p>
<h1 id="page-title">In the <em>news.</em></h1>
<p class="lead">Articles, interviews and match reports about Lucindha – from winning medals with England and Great Britain to campaigning for Deaf accessibility. Links open the original story on the publisher's website.</p>
<div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 6px"><a href="media.html#appear-title" class="pill ghost">TV &amp; video appearances</a><a href="media.html#bio-title" class="pill ghost">Press kit</a></div>
</div>
</div>
</section>

<section class="band news-band" aria-label="Stories, newest first">
<div class="wrap">
<ol reversed class="news-list">
{chr(10).join(card(s) for s in stories)}
</ol>
</div>
</section>

<section aria-labelledby="cta-title">
<div class="wrap">
<div class="cta">
<div>
<h2 id="cta-title">Media and speaking enquiries</h2>
<p class="muted">To feature Lucindha, request an interview or invite her to speak, get in touch.</p>
</div>
<a href="contact.html" class="pill">Contact Lucindha</a>
</div>
</div>
</section>
"""

if __name__ == "__main__":
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from page_shell import page
    out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    stories = sorted(STORIES, key=lambda s: s["date"], reverse=True)
    (out / "news.html").write_text(page("News",
        "Articles, interviews and match reports about Lucindha Lawson, England deaf futsal player, Deaflympian and Deaf accessibility campaigner.",
        "news.html", body(stories)))
    print(f"news.html written with {len(stories)} stories")
