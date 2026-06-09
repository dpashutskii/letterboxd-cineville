# Chrome Web Store listing — copy & answers

Paste these into the Web Store developer dashboard during submission.

## Name (≤ 75 chars)

```
Cineville Ratings
```

## Summary / short description (≤ 132 chars)

```
See Letterboxd and IMDb ratings right on cineville.nl showtimes and film pages.
```

## Category

`Productivity` (alt: `Fun`)

## Language

English (UK)

## Detailed description

```
Cineville's showtimes are great, but it's hard to know which film is actually
worth seeing. Cineville Ratings adds the scores you already trust — Letterboxd
and IMDb — directly onto cineville.nl.

• See Letterboxd (out of 5) and IMDb (out of 10) ratings on the showtimes list,
  film listings, and individual film pages.
• Shows the release year on the showtimes page, which Cineville hides.
• On a film's page, adds a short synopsis.
• Click any rating to open that film on Letterboxd or IMDb.
• Fast: results are cached locally.

SETUP (one time)
Click the extension icon and add two free API keys:
• TMDB — themoviedb.org/settings/api (instant) — used to match films accurately,
  including foreign and festival titles.
• OMDb — omdbapi.com/apikey.aspx (free tier) — used for IMDb ratings.
The keys are stored only in your browser. The extension has no server and
collects no data.

Not affiliated with Cineville, Letterboxd, IMDb, or TMDB. This product uses the
TMDB API but is not endorsed or certified by TMDB.
```

## Privacy

- **Single purpose:** Display Letterboxd and IMDb ratings for films shown on
  cineville.nl.
- **Privacy policy URL:**
  `https://github.com/dpashutskii/letterboxd-cineville/blob/main/PRIVACY.md`
- **Data collection:** Declare "does NOT collect or use user data" (no analytics,
  no server). API keys are stored locally via chrome.storage.

### Permission justifications (paste into the review form)

- **storage** — Save the user's own OMDb/TMDB API keys and a local cache of
  fetched ratings.
- **Host: cineville.nl** — Read the film title and release year on the page in
  order to look up ratings and inject the badge.
- **Host: api.themoviedb.org** — Match the film by title + year (TMDB) using the
  user's key.
- **Host: letterboxd.com** — Read the film's public average rating and synopsis.
- **Host: www.omdbapi.com** — Read the IMDb rating using the user's key.
- **Remote code:** No. All code is bundled in the package.

## Assets you still need to provide

- **Screenshot(s):** at least one, 1280×800 or 640×400 PNG/JPG. Best: the
  cineville showtimes page with rating pills visible. (Crop a CleanShot to
  exactly 1280×800.)
- **Small promo tile (optional):** 440×280.
- The 128×128 store icon is auto-taken from the packaged `icons/icon128.png`.
