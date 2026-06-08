# Cineville Ratings — Letterboxd + IMDb

A Chrome (Manifest V3) extension that overlays **Letterboxd** and optional **IMDb**
ratings onto [cineville.nl](https://cineville.nl) — including the
[showtimes](https://cineville.nl/en-GB/showtimes) page, film listings, and film
detail pages.

Each film gets a small badge, e.g. `★ 4.12   IMDb 7.8`, linking to the source pages.

## How it works

- A **content script** runs on `cineville.nl`, finds links to film pages
  (`/films/{slug}`) as they render (cineville's showtimes list is loaded
  client-side, so a `MutationObserver` catches them), and injects a badge.
- The **service worker** does the cross-origin work (content scripts can't, due
  to CORS):
  1. Resolves the canonical **title + year** from cineville's own Next.js data
     endpoint (`/_next/data/{buildId}/{locale}/films/{slug}.json`).
  2. **Letterboxd:** searches by title, then reads the average rating from the
     film page's JSON-LD (`aggregateRating.ratingValue`, out of 5).
  3. **IMDb:** queries the [OMDb API](https://www.omdbapi.com/) by title + year.
  4. Caches results in `chrome.storage.local` (7 days for hits, 1 day for misses)
     to stay fast and avoid hammering Letterboxd.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Visit https://cineville.nl/en-GB/showtimes — badges appear under film titles.

## Enabling IMDb ratings (optional)

Letterboxd works with no setup. For IMDb:

1. Get a free OMDb API key: https://www.omdbapi.com/apikey.aspx (1,000 req/day).
   You'll get an activation email — click the link to activate the key.
2. Right-click the extension → **Options** (or `chrome://extensions` → Details →
   Extension options).
3. Paste the key, tick **Show IMDb ratings**, and Save.

The key is stored in your browser only and is never committed to this repo.

## Limitations & notes

- **Matching** uses the cineville title + release year. Most films match; very
  obscure festival titles may miss or occasionally mismatch.
- **Letterboxd has no public API** for this use case, so ratings are scraped from
  public pages. This is against Letterboxd's ToS, so this extension is intended for
  personal use and is **not** suitable for the Chrome Web Store as-is.
- Rendering depends on cineville's HTML structure; a site redesign may require
  selector/endpoint tweaks.

## Project layout

```
manifest.json        # MV3 manifest, host permissions, content script registration
src/content.js       # finds film links, injects badges
src/background.js     # service worker: cineville + Letterboxd + OMDb lookups, cache
src/styles.css        # badge styling
src/options.html/.js  # OMDb key + IMDb toggle
```
