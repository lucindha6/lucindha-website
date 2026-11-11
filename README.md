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
- Official WhatsApp Business short link (used on the site): `https://wa.me/message/55VPGHD4HYG4B1`. Confirmed 11 Nov 2026 from the QR code in the WhatsApp Business app (account: Lucindha Lawson Ltd). If the short link is ever reset in the app, it stops working, so switch back to the fallback.
- Fallback direct number link: `https://wa.me/447708996817`. This never changes.
- Where the link appears: the Contact page card (`tools/build_contact.py`), the footer and the floating button (the footer of `site/home.html`, copied to every page). To change it, replace the link in those places and rebuild.
