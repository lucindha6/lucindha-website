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

  "speaking": dict(
    file="speaking.html", title="Public Speaking", colour="#4A3046", light="#4F344B", dark="#3E2839", deep="#2A1A27", logo="logo-speaking-hero.png",
    description="Book Lucindha Lawson to speak on Deaf awareness, inclusion, resilience, women's sport, elite sport and education. Talks tailored to schools, businesses, charities and conferences.",
    tagline="Inspiring audiences through lived experience, leadership and inclusion.",
    intro=["Whether speaking to schools, businesses, charities, conferences or sports organisations, I enjoy sharing my journey to inspire confidence, resilience and a greater understanding of Deaf culture and inclusion.",
           "From experiencing language deprivation as a child and living with Long QT syndrome to competing as an international Deaf athlete and building a professional career in accountancy, my journey has been shaped by resilience, determination and the belief that with the right support and opportunities, barriers can be overcome."],
    groups=[
      ("topics-title", "Speaking topics",
       "Every audience is different. Whether I’m speaking to schools, businesses, charities or sporting organisations, every talk is tailored to your audience, objectives and event.",
       [("Deaf Awareness", "Helping organisations better understand Deaf culture, communication and inclusion."),
        ("Women’s Sport", "Sharing experiences of competing as an elite female Deaf athlete."),
        ("Disability, Diversity & Inclusion (EDI)", "Sharing practical insights into Deaf culture, accessibility and inclusive communication, helping organisations create environments where everyone can thrive."),
        ("Resilience", "Sharing how I’ve overcome challenges, including language deprivation, Long QT syndrome and the pressures of elite sport, while maintaining a positive mindset and determination to succeed."),
        ("Inclusion & Accessibility", "Creating environments where everyone feels valued and included."),
        ("Education, Language & Career", "From experiencing language deprivation as a child to becoming a graduate accountant and international athlete, I share how education, determination and the right support can transform lives."),
        ("Role Model", "Encouraging young people to believe in themselves and achieve their ambitions."),
        ("Elite Sport", "What it takes to compete at the highest international level, perform under pressure and develop a high-performance mindset."),
        ("Question & Answer Sessions", "Interactive question and answer sessions, encouraging open conversations tailored to your audience.")]),
    ],
    why=("Why invite Lucindha?",
         "Whether speaking in a classroom, conference, or boardroom, I bring lived experience, authenticity and practical insights that inspire audiences to think differently, overcome challenges and create more inclusive communities.",
         [("Authentic Story", "A journey few people will ever experience.", "From language deprivation as a child to becoming a graduate accountant, international Deaf athlete and public speaker, I share an honest story of resilience, growth and possibility."),
          ("Real-World Experience", "Experience that goes beyond the stage.", "My talks are shaped by experiences in elite sport, education, local government, voluntary work and Deaf advocacy, making every presentation practical and relatable."),
          ("Audience Engagement", "More than just a presentation.", "I encourage discussion, reflection and participation, creating engaging experiences that audiences remember."),
          ("Lasting Impact", "Inspiring action, not just applause.", "I want every audience to leave with greater confidence, empathy and practical ideas they can apply in their workplace, school or community.")]),
    cta=("Ready to inspire your audience?",
         "Whether you’re organising a school assembly, conference, business event, charity fundraiser or community programme, I’d be delighted to discuss how I can tailor a talk to suit your audience.",
         "Available for", ["Schools and colleges", "Universities", "Businesses and workplaces", "Local authorities and public sector organisations", "Charities and community groups", "Sports clubs and governing bodies", "Conferences and events"],
         "Enquire today"),
  ),

  "workshops": dict(
    file="workshops.html", title="Workshops", colour="#343B40", light="#394146", dark="#2C3236", deep="#1D2124", logo="logo-workshops-hero.png",
    description="Interactive, accessible workshops from Lucindha Lawson on Deaf awareness, British Sign Language, inclusion, CPR & AED awareness and more – tailored to your organisation.",
    tagline="Interactive workshops that build confidence, inclusion and practical understanding.",
    intro=["Every workshop is designed to be engaging, practical and tailored to the needs of your organisation. Drawing on my lived experience as a Deaf person, international athlete and graduate accountant, I create sessions that encourage participation, discussion and meaningful learning."],
    cta_hero="Enquire about a workshop", second=("#why-title", "How workshops work"),
    groups=[
      ("topics-title", "Workshop topics",
       "Workshops are available for schools, businesses, charities, sports organisations and community groups. Each session can be tailored to your audience, organisation and learning objectives.",
       [("Deaf Awareness & Deaf Culture", "Helping participants understand Deaf culture, communication, accessibility and how to create more inclusive environments."),
        ("Introduction to British Sign Language (BSL)", "A practical introduction to everyday British Sign Language, basic signs and more confident communication with Deaf people."),
        ("Language Deprivation in Deaf Children", "Exploring the lifelong impact of language deprivation and why early access to language is essential for Deaf children's development."),
        ("Mental Health in the Deaf Community", "Raising awareness of mental health, wellbeing and the unique challenges faced by Deaf people in accessing support."),
        ("CPR & AED Awareness for Deaf Communities", "Raising CPR and AED awareness, exploring Deaf-friendly accessibility and building confidence around responding to emergency situations."),
        ("Long QT Syndrome & Deafness Awareness", "Drawing on lived experience to raise awareness of Long QT syndrome and deafness, including the importance of recognition, accessible communication and appropriate support."),
        ("Supporting Deaf Children in Care", "Helping foster carers, social workers and professionals better understand the communication, identity and wellbeing needs of Deaf children in care."),
        ("Inclusion & Accessibility in Practice", "Providing practical strategies to improve accessibility, communication and inclusion in workplaces, schools and community settings."),
        ("Creating Deaf-Friendly Schools, Workplaces & Communities", "Supporting organisations to build welcoming environments where Deaf people can participate, communicate and thrive.")]),
    ],
    why=("How workshops work",
         "Every workshop can be adapted to suit your organisation, participants and learning objectives. Sessions are designed to encourage discussion, participation and practical learning rather than simply listening to a presentation.",
         [("Tailored to Your Audience", "No two organisations are the same.", "Content can be adapted for schools, businesses, charities, sports organisations, professionals and community groups."),
          ("Interactive & Practical", "Learning through participation.", "Workshops can include activities, discussions, scenarios, questions and practical exercises, depending on the topic and audience."),
          ("Accessible Communication", "Accessibility is built into the session.", "Workshops are designed with accessibility in mind, using clear visual communication and appropriate communication arrangements agreed when booking."),
          ("Flexible Delivery", "Designed around your organisation.", "Sessions can be tailored in length, group size and format, with requirements agreed in advance to make the workshop appropriate for your audience.")]),
    cta=("Bring a workshop to your organisation?",
         "Whether you are a school, business, charity, sports organisation or community group, I’d be delighted to discuss a workshop tailored to your audience and learning objectives. Sessions can be tailored by topic, audience, group size and format, and accessibility requirements can be discussed as part of the booking process.",
         "Workshops are available for", ["Schools and colleges", "Businesses and workplaces", "Charities and community organisations", "Sports clubs and governing bodies", "Foster carers and social care professionals", "Conferences and professional development events"],
         "Enquire about a workshop"),
  ),
}

def build(key, a):
    from PIL import Image
    lw, lh = Image.open(ROOT / "images" / a["logo"]).size
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
<ul class="ticks two">{"".join(f'<li>{CHECK}<span><strong>{e(w[0])}</strong> – {e(" ".join(w[1:]))}</span></li>' for w in wl)}</ul>
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
<a href="contact.html" class="pill">{e(a.get("cta_hero", "Contact Lucindha"))}</a>
<a href="{a.get("second", ("#why-title", "Why invite me?"))[0]}" class="pill ghost">{e(a.get("second", ("#why-title", "Why invite me?"))[1])}</a>
</div>
</div>
<div class="hero-logo"><img src="images/{a["logo"]}" alt="Lucindha Lawson {e(a["title"])} logo" width="{lw}" height="{lh}" style="width: 320px; height: auto"></div>
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
