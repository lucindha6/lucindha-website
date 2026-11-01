#!/usr/bin/env python3
"""Builds site/contact.html in the soft style on the main navy (#0B1F33).
The form keeps its Netlify Forms set-up (name="enquiry", data-netlify, honeypot, field names) - don't rename fields.
Run:  python3 tools/build_contact.py"""
import sys, pathlib, html
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from page_shell import page, ROOT
e = lambda s: html.escape(s, quote=True)

ACC_SERVICES = ["Bookkeeping", "VAT returns", "Personal tax", "Year-end accounts", "Corporation tax returns",
                "Management accounts", "Start-up support", "Business support", "Financial health check"]
COMMUNITY = ["Sport & Coaching", "Public Speaking", "Workshops"]
CONTACT = ["Email", "Text message", "Video call", "Phone call", "Face to face"]

def checks(name, values, checked=()):
    return "".join(f'<label class="opt"><input type="checkbox" name="{name}" value="{e(v)}"{" checked" if v in checked else ""}><span>{e(v)}</span></label>' for v in values)

body = f'''
<section class="hero contact-hero" aria-labelledby="page-title">
<div class="wrap contact-grid">

<div class="stack contact-side">
<nav aria-label="Breadcrumb" class="crumbs"><a href="home.html">Home</a> <span aria-hidden="true">/</span> Contact</nav>
<p class="eyebrow">Contact</p>
<h1 id="page-title">Request a <em>free quote.</em></h1>
<p class="lead">Tell me about your situation and I'll review it before sending a personalised quote. Enquiries are free and there's no obligation.</p>

<div class="card steps">
<h2>What happens next</h2>
<ol>
<li><span class="num" aria-hidden="true">1</span><span>I review your enquiry within 2 working days.</span></li>
<li><span class="num" aria-hidden="true">2</span><span>I reply in the way you've asked me to.</span></li>
<li><span class="num" aria-hidden="true">3</span><span>You get a quote, or a free 20-minute introductory chat if it helps to talk first.</span></li>
</ol>
</div>

<div class="card">
<h2>Prefer email?</h2>
<p><a href="mailto:hello@lucindhalawson.co.uk" class="link">hello@lucindhalawson.co.uk</a></p>
<p>Based in London, working with clients across the UK. BSL interpreters can be arranged where required.</p>
</div>
</div>

<form class="form-card" name="enquiry" method="POST" action="/thanks.html" data-netlify="true" netlify-honeypot="bot-field" aria-labelledby="form-title">
<input type="hidden" name="form-name" value="enquiry">
<p hidden><label>Leave this empty: <input name="bot-field"></label></p>
<h2 id="form-title">Your enquiry</h2>
<p class="muted small">Fields marked "(required)" must be filled in.</p>

<div class="row">
<div class="field"><label for="name">Full name (required)</label><input id="name" name="name" class="fld" type="text" autocomplete="name" required></div>
<div class="field"><label for="email">Email address (required)</label><input id="email" name="email" class="fld" type="email" autocomplete="email" required></div>
</div>

<div class="field">
<label for="phone">Mobile number (optional)</label>
<span id="phone-hint" class="hint">For text messages or video calls, if you prefer them.</span>
<input id="phone" name="phone" class="fld" type="tel" autocomplete="tel" aria-describedby="phone-hint" style="max-width: 360px">
</div>

<fieldset>
<legend>What is your enquiry about? (required)</legend>
<div class="opts">
<label class="opt"><input type="radio" name="about" value="Accounting services" checked required><span>Accounting services</span></label>
<label class="opt"><input type="radio" name="about" value="Community Work (sport, speaking or workshops)" required><span>Community Work (sport, speaking or workshops)</span></label>
<label class="opt"><input type="radio" name="about" value="Something else" required><span>Something else</span></label>
</div>
</fieldset>

<fieldset>
<legend>Which services are you interested in? Choose any that apply.</legend>
<p class="group-label">Accounting</p>
<div class="opts two">{checks("services", ACC_SERVICES)}</div>
<p class="group-label">Community Work</p>
<div class="opts two">{checks("services", COMMUNITY)}{checks("services", ["I'm not sure yet"])}</div>
</fieldset>

<div class="field">
<label for="type">Which best describes you?</label>
<select id="type" name="client-type" class="fld" style="max-width: 420px">
<option value="">Please choose</option>
<option>Sole trader</option>
<option>Limited company</option>
<option>Partnership</option>
<option>Individual or landlord</option>
<option>School, charity or organisation</option>
<option>Other</option>
</select>
</div>

<div class="field">
<label for="details">Tell me about your situation (required)</label>
<span id="details-hint" class="hint">For example: what your business does, roughly how many transactions a month, and any deadlines. For talks or workshops: the audience, date and location.</span>
<textarea id="details" name="details" class="fld" rows="6" aria-describedby="details-hint" required></textarea>
</div>

<fieldset class="highlight">
<legend>How would you like me to contact you? (required)</legend>
<div class="opts two">{checks("contact-method", CONTACT, checked=("Email",))}</div>
<div class="field" style="margin-top: 10px">
<label for="access">Any communication or access needs? (optional)</label>
<span id="access-hint" class="hint">For example BSL, an interpreter, large print or more time in meetings. Whatever helps.</span>
<textarea id="access" name="access" class="fld" rows="3" aria-describedby="access-hint"></textarea>
</div>
</fieldset>

<label class="opt consent"><input type="checkbox" name="consent" value="yes" required><span>I agree that my details will be used to respond to this enquiry, as explained in the <a href="#">privacy notice</a>. (required)</span></label>

<button type="submit" class="pill" style="align-self: flex-start; border: 0; cursor: pointer">Send enquiry <span aria-hidden="true">→</span></button>
</form>

</div>
</section>
'''

out = page("Contact", "Request a free, no-obligation quote from Lucindha Lawson. Choose how you'd like to be contacted, including BSL and other access needs.",
           "contact.html", body)
out = out.replace('\n<a href="contact.html" class="pill">Request a quote</a>', "")   # no quote button on the quote page itself
(ROOT / "contact.html").write_text(out)
print("contact.html written")
