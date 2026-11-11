"""Social media links.
BUSINESS = LUCINDHA LAWSON LTD accounts -> footer of every page (via home.html).
PERSONAL = Lucindha's own accounts, all @lucindha6 -> Media & press page only.
The footer list is pasted into site/home.html (copied to every page): after changing BUSINESS,
replace the <ul class="social"> in home.html with social_links(BUSINESS, "LUCINDHA LAWSON LTD on social media")."""
ICONS = {
    "LinkedIn": '<rect x="3" y="3" width="18" height="18" rx="3"></rect><path d="M8 10.5V16M8 7.8v.01M11.5 16v-5.5M11.5 13a2.5 2.5 0 0 1 5 0v3"></path>',
    "Instagram": '<rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"></circle>',
    "Facebook": '<path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V9H6.5v3.5H9V21h3.5v-8.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z"></path>',
    "TikTok": '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"></path><path d="M14 3c.4 2.6 2.2 4.4 5 4.6"></path>',
    "X": '<path d="M4 4l16 16M20 4L4 20"></path>',
    "YouTube": '<rect x="2.5" y="5.5" width="19" height="13" rx="4"></rect><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"></path>',
}
BUSINESS = [
    ("LinkedIn", "https://www.linkedin.com/company/lucindhalawson"),
    ("Instagram", "https://www.instagram.com/lucindhalawson/"),
    ("Facebook", "https://www.facebook.com/lucindhalawsonltd"),
]
PERSONAL = [
    ("LinkedIn", "https://www.linkedin.com/in/lucindha6/"),
    ("Instagram", "https://www.instagram.com/lucindha6/"),
    ("TikTok", "https://www.tiktok.com/@lucindha6"),
    ("Facebook", "https://www.facebook.com/lucindha6"),
    ("X", "https://x.com/lucindha6"),
    ("YouTube", "https://www.youtube.com/@Lucindha6"),
]

def social_links(accounts=None, label="Social media", cls="social"):
    accounts = BUSINESS if accounts is None else accounts
    items = "".join(
        f'<li><a href="{u}" target="_blank" rel="noopener" aria-label="{n} (opens in a new tab)">'
        f'<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ICONS[n]}</svg></a></li>'
        for n, u in accounts)
    return f'<ul class="{cls}" aria-label="{label}">{items}</ul>'


def social_named(accounts=None, label="Follow LUCINDHA LAWSON LTD"):
    """Icon plus the platform name as visible text (Contact page) - clearer than icons alone."""
    accounts = BUSINESS if accounts is None else accounts
    items = "".join(
        f'<li><a href="{u}" target="_blank" rel="noopener">'
        f'<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ICONS[n]}</svg>'
        f'<span>{n}</span><span class="sr"> (opens in a new tab)</span></a></li>'
        for n, u in accounts)
    return f'<ul class="social-named" aria-label="{label}">{items}</ul>'
