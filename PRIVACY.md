# Privacy Policy — Cineville Ratings

_Last updated: 2026-06-09_

Cineville Ratings is a browser extension that displays Letterboxd and IMDb
ratings on cineville.nl pages. This policy explains exactly what the extension
does with data.

## What we collect

**Nothing is collected, transmitted to, or stored by the developer.** The
extension has no backend server and no analytics.

## Data stored locally on your device

The following are stored only in your browser via the `chrome.storage` API and
never leave your device except as described under "Network requests":

- **Your OMDb and TMDB API keys** (if you choose to add them), so the extension
  can look up ratings. They are used solely to authenticate your own requests to
  those services.
- **A cache of ratings** already fetched, to keep the extension fast and reduce
  network requests.

You can clear all of this at any time with the **Clear cache** button in the
extension popup, or by removing the extension.

## Network requests

When you view a film on cineville.nl, the extension makes requests to fetch
rating data:

- **cineville.nl** — to read the film's title and release year.
- **api.themoviedb.org (TMDB)** — to match the film (uses your TMDB key).
- **letterboxd.com** — to read the public average rating and synopsis.
- **www.omdbapi.com (OMDb)** — to read the IMDb rating (uses your OMDb key).

These requests contain only the film title/year and your own API keys. No
personal information about you is sent, and the developer does not receive,
log, or have access to any of these requests.

## Permissions

- `storage` — to save your API keys and the ratings cache locally.
- Host access to the four domains above — to fetch ratings on your behalf.

## Third-party services

Ratings and data come from Letterboxd, IMDb (via OMDb), and TMDB, each governed
by their own terms and privacy policies. This product uses the TMDB API but is
not endorsed or certified by TMDB.

## Contact

Questions: open an issue at
https://github.com/dpashutskii/letterboxd-cineville/issues
