# Lucindha Lawson – website

The live website for LUCINDHA LAWSON LTD, hosted on Netlify.

- `site/` – the published pages: `index.html` (welcome page), `home.html`, `about.html`, `accounting.html`, `community.html` (hub), `sport.html`, `speaking.html`, `workshops.html`, `news.html`, `contact.html`, `thanks.html`.
- `tools/build_news.py` – rebuilds `site/news.html` from the list of stories: `python3 tools/build_news.py site`
- `netlify.toml` – tells Netlify to publish the `site` folder.

Every change saved to the `main` branch is published by Netlify automatically.

## Brand colours
- Gold `#A87928` – logo, lines, borders. Small text and links use the lighter tint `#CBAB74` so they stay readable.
- Main background `#0B1F33` · Accounting `#0B2945` · Sport & Coaching `#2A3D3B` · Public Speaking `#4A3046` · Workshops `#343B40`

## WhatsApp Business
- Number: 07708 996817 (written messages only – no voice notes or calls).
- Direct number link (used on the site now): `https://wa.me/447708996817`. This never changes and is the fallback.
- Official WhatsApp Business short link: `https://wa.me/message/55VPGHD4HYG4B1`. A short link stops working if it is reset in the WhatsApp Business app, so check it before switching the site to it.
- Where the link appears: the Contact page card (`tools/build_contact.py`), the footer and the floating button (the footer of `site/home.html`, copied to every page). To change it, replace the link in those places and rebuild.
