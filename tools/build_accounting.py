#!/usr/bin/env python3
"""Builds site/accounting.html in the soft style on the Accounting navy (#0B2945).
Edit the text below and run:  python3 tools/build_accounting.py"""
import sys, pathlib, html
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from page_shell import page, ROOT
e = lambda s: html.escape(s, quote=False)
CHECK = ('<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CBAB74" stroke-width="2.2" '
         'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>')

SERVICES = [
    ("Bookkeeping", "Recording your income and expenses, reconciling your bank accounts and keeping your records ready for tax time.", "sole traders and small businesses who want their records off their plate."),
    ("VAT returns", "Preparing and submitting your VAT returns to HMRC accurately and on time.", "VAT-registered businesses of any structure."),
    ("Personal tax", "Completing your Self Assessment tax return and explaining what you owe and when.", "sole traders, landlords, company directors and anyone who needs to file a tax return."),
    ("Year-end accounts", "Preparing your annual accounts and filing them with Companies House and HMRC.", "limited companies and businesses that need formal annual accounts."),
    ("Corporation tax returns", "Working out your company's corporation tax and filing the return with HMRC.", "limited companies."),
    ("Management accounts", "Regular management reports to help you monitor and improve your business performance.", "growing businesses that want a clear, regular picture of how they are doing."),
    ("Start-up support", "Helping new businesses build strong financial foundations from day one.", "new sole traders and limited companies getting set up."),
    ("Business support", "Ongoing financial advice and practical support to help your business grow with confidence.", "owners who want a trusted accountant to turn to throughout the year."),
    ("Financial health check", "Reviewing your finances and identifying practical ways to improve your business performance.", "any business that wants a fresh look at its numbers."),
]
QUALS = [
    ("AAT Licensed Accountant", "Licensed & Regulated", "Authorised to provide accountancy services in accordance with AAT's professional, ethical and regulatory standards. Licence no. 1010532."),
    ("MAAT", "Association of Accounting Technicians", "Full member of the Association of Accounting Technicians, demonstrating recognised professional competence and a commitment to high ethical standards."),
    ("CIPFA Student", "Chartered Public Finance Accountant", "Currently studying towards the internationally recognised Chartered Public Finance Accountant qualification through CIPFA."),
]
FAQ = [
    ("When can I become a client?", "Straight away. I'm taking on new clients now – send an enquiry and I'll get back to you within 2 working days."),
    ("Do you work with Deaf clients?", "Yes. My practice welcomes Deaf, Deafblind, hard-of-hearing, visually impaired and hearing clients. Let me know in your enquiry how you'd like to communicate."),
    ("Do you offer a free consultation?", "Yes. Enquiries and a 20-minute introductory chat are free. Longer, in-depth advice sessions are charged, and the fee is taken off your first bill if you become a client."),
    ("How much do you charge?", "Every client is different, so I don't publish set prices. Once I've reviewed what you need, I'll send you a personalised quote, so you know the cost before any work starts."),
    ("What do I need to send you to get started?", "I'll send you a simple checklist. Usually it's photo ID and proof of address, your Unique Taxpayer Reference (UTR), and your recent records, such as bank statements, receipts and invoices."),
    ("Why do you need to check my identity?", "Anti-money laundering law requires every accountant to check the identity of new clients before starting work. It's quick, and your documents are kept securely."),
    ("Do you work with clients outside London?", "Yes. I'm based in London and work with clients across the UK, by email, text message and video call."),
    ("How do video calls work?", "We agree the format in advance. Calls can include a BSL interpreter, live captions or the chat box – whatever works best for both of us. If you'd prefer, we can do everything by email instead."),
    ("Can you help if I'm behind with my tax or bookkeeping?", "Yes. Many people come to an accountant when things have piled up. Tell me where you're at in your enquiry, with no judgement, and I'll suggest a plan to get you back on track."),
    ("Can I book an appointment directly?", "Please send an enquiry first. Once I've reviewed it, I'll offer you an appointment if one is needed."),
]

body = f'''
<section class="hero" aria-labelledby="page-title">
<div class="wrap">
<div class="hero-text">
<nav aria-label="Breadcrumb" class="crumbs"><a href="home.html">Home</a> <span aria-hidden="true">/</span> Accounting</nav>
<p class="eyebrow">Accounting</p>
<h1 id="page-title">Accounting services</h1>
<p class="tagline">Accounting that speaks your language.</p>
<p class="lead">Practical, plain-English accounting for sole traders, small businesses and individuals – from an AAT licensed accountant who adapts to the way you communicate.</p>
<ul class="chips">
<li>{CHECK}AAT licensed · no. 1010532</li>
<li>{CHECK}Deaf and hearing clients welcome</li>
</ul>
<div style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: 6px">
<a href="contact.html" class="pill">Request a free quote</a>
<a href="#faq-title" class="pill ghost">Common questions</a>
</div>
</div>
<div class="hero-logo">
<img src="images/logo-accounting-hero.png" alt="Lucindha Lawson Accounting logo" width="600" height="703" style="width: 340px">
</div>
</div>
</section>

<section class="band" aria-labelledby="services-title">
<div class="wrap">
<div class="head">
<h2 id="services-title">How I can help</h2>
<p class="muted">Professional accountancy services designed to help individuals, sole traders and small businesses stay organised, compliant and confident.</p>
</div>
<ul class="grid">
{"".join(f'<li class="card"><h3>{e(t)}</h3><p>{e(d)}</p><p class="good"><strong>Good for:</strong> {e(g)}</p></li>' for t, d, g in SERVICES)}
</ul>
</div>
</section>

<section aria-labelledby="quals-title">
<div class="wrap">
<div class="head">
<h2 id="quals-title">Qualified and regulated</h2>
<p class="muted">Accountancy services delivered to recognised professional, ethical and regulatory standards.</p>
</div>
<ul class="grid">
{"".join(f'<li class="card"><h3>{e(t)}</h3><p class="sub">{e(s)}</p><p>{e(d)}</p></li>' for t, s, d in QUALS)}
</ul>
<p style="margin-top: 24px"><a href="about.html#qualifications" class="link">See all qualifications and memberships</a></p>
</div>
</section>

<section class="band" aria-labelledby="pricing-title">
<div class="wrap split">
<div class="stack" style="flex: 999 1 520px">
<h2 id="pricing-title">Pricing</h2>
<p class="muted">Every client's needs are different, so I give each one a personalised quote rather than a fixed price list.</p>
<p class="muted">Sending an enquiry is always free, and so is a 20-minute introductory chat – by video call, BSL, text or face to face. Longer, in-depth advice sessions are charged, and the fee is taken off your first bill if you become a client.</p>
</div>
<div style="flex: 1 1 260px; display: flex; justify-content: flex-start">
<a href="contact.html" class="pill">Request a free quote</a>
</div>
</div>
</section>

<section aria-labelledby="faq-title">
<div class="wrap" style="max-width: 900px">
<div class="head">
<h2 id="faq-title">Common questions</h2>
</div>
<div class="faq">
{"".join(f'<details{" open" if i == 0 else ""}><summary>{e(q)}</summary><p>{e(a)}</p></details>' for i, (q, a) in enumerate(FAQ))}
</div>
</div>
</section>

<section aria-labelledby="cta-title" style="padding-top: 0">
<div class="wrap">
<div class="cta">
<div>
<h2 id="cta-title">Ready to get started?</h2>
<p class="muted">Whether you need help with bookkeeping, tax returns or ongoing business support, I'd be happy to discuss how I can help.</p>
</div>
<a href="contact.html" class="pill">Contact Lucindha</a>
</div>
</div>
</section>
'''

out = page("Accounting",
    "Bookkeeping, VAT returns, personal tax, year-end accounts, corporation tax and business support from Lucindha Lawson, an AAT licensed accountant. Free 20-minute introductory chat.",
    "accounting.html", body)
out = out.replace("<body>", '<body class="theme-acc">', 1)
(ROOT / "accounting.html").write_text(out)
print("accounting.html written")
