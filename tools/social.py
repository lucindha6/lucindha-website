"""Social media links (LinkedIn company page + personal accounts @lucindha6 until business accounts exist). Used in the footer (via home.html) and on the Media page."""
SOCIAL = [
    ("LinkedIn", "https://www.linkedin.com/company/lucindhalawson",
     '<rect x="3" y="3" width="18" height="18" rx="3"></rect><path d="M8 10.5V16M8 7.8v.01M11.5 16v-5.5M11.5 13a2.5 2.5 0 0 1 5 0v3"></path>'),
    ("Instagram", "https://www.instagram.com/lucindhalawson/",
     '<rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"></circle>'),
    ("TikTok", "https://www.tiktok.com/@lucindha6",
     '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"></path><path d="M14 3c.4 2.6 2.2 4.4 5 4.6"></path>'),
    ("Facebook", "https://www.facebook.com/lucindha6",
     '<path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V9H6.5v3.5H9V21h3.5v-8.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z"></path>'),
    ("X", "https://x.com/lucindha6",
     '<path d="M4 4l16 16M20 4L4 20"></path>'),
    ("YouTube", "https://www.youtube.com/@Lucindha6",
     '<rect x="2.5" y="5.5" width="19" height="13" rx="4"></rect><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"></path>'),
]

def social_links(cls="social"):
    items = "".join(
        f'<li><a href="{u}" target="_blank" rel="noopener" aria-label="{n} (opens in a new tab)">'
        f'<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{p}</svg></a></li>'
        for n, u, p in SOCIAL)
    return f'<ul class="{cls}" aria-label="Social media">{items}</ul>'
