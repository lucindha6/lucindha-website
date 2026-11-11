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
- Number: 07708 996817. Written messages preferred; voice notes welcome where transcription is available; no voice calls.
- Direct number link (used on the site): `https://wa.me/447708996817`. It's based on the business number, so it never changes.
- Official WhatsApp Business short link (not used): `https://wa.me/message/55VPGHD4HYG4B1`. It stops working if it's reset in the WhatsApp Business app.
- Where the link appears: the Contact page WhatsApp button (`tools/build_contact.py`), the footer button and the floating button (the footer of `site/home.html`, copied to every page). To change it, replace the link in those places and rebuild.
