"""Client testimonials, shown on the home page and the Accounting page.

Publish words exactly as the client wrote them, with their written permission
(keep the email or message). Don't edit wording without their approval.
"""
import html

e = html.escape

TESTIMONIALS = [
    {
        "label": "Tax explained in BSL",
        "name": "Cory L",
        "role": "Photographer",
        "paras": [
            "Working with Lucindha has been incredibly helpful. She has taught me how to understand the tax system, especially by explaining everything in BSL at a level that helps me understand things clearly.",
            "With her support, I feel safe, confident and reassured that I can keep my taxes in order. I really appreciate her patience, understanding and support.",
        ],
    },
    {
        "label": "Rental income & tax",
        "name": "Andy R",
        "role": "",
        "paras": [
            "I’m really grateful for the help and support Lucindha has given me with my rental income and tax compliance. She took the time to sort out all the mess, explain everything clearly and get everything back on track. The difference has been huge, and everything is now running smoothly. I would highly recommend her services to anyone looking for reliable and professional accountancy support.",
        ],
    },
]


def cards():
    out = []
    for t in TESTIMONIALS:
        who = e(t["name"]) + (f", {e(t['role'])}" if t["role"] else "")
        body = "".join(f"<p>{e(p)}</p>" for p in t["paras"])
        out.append(
            f'<li><figure class="card quote-card">'
            f'<p class="sub">{e(t["label"])}</p>'
            f"<blockquote>{body}</blockquote>"
            f"<figcaption>— {who}</figcaption>"
            f"</figure></li>"
        )
    return f'<ul class="grid quotes">{"".join(out)}</ul>'


def section(eyebrow="", intro=""):
    eb = f'<p class="eyebrow">{e(eyebrow)}</p>\n' if eyebrow else ""
    it = f'<p class="muted">{e(intro)}</p>\n' if intro else ""
    return f"""<section aria-labelledby="quotes-title">
<div class="wrap">
<div class="head">
{eb}<h2 id="quotes-title">What clients say</h2>
{it}</div>
{cards()}
</div>
</section>"""
