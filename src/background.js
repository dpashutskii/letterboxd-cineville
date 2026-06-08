// Service worker: does all cross-origin work (content scripts can't, due to CORS).
// Flow per film slug:
//   1. Resolve canonical title + year from cineville's own Next.js data endpoint.
//   2. Resolve the film's IMDb id via OMDb (also gives the IMDb rating).
//   3. Letterboxd: jump straight to the film page via letterboxd.com/imdb/{id}/
//      (the /search/ endpoint is bot-blocked, so we never use it). Falls back to a
//      slugified title guess when no OMDb key is configured.
//   4. Cache the result in chrome.storage.local.

const TTL_OK = 7 * 24 * 60 * 60 * 1000; // 7 days for hits
const TTL_EMPTY = 24 * 60 * 60 * 1000; // 1 day for misses (so we retry)
const MAX_CONCURRENT = 3;

// ---- tiny concurrency limiter (be gentle to Letterboxd) ----
let active = 0;
const queue = [];
function schedule(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    pump();
  });
}
function pump() {
  if (active >= MAX_CONCURRENT || queue.length === 0) return;
  const { fn, resolve, reject } = queue.shift();
  active++;
  Promise.resolve()
    .then(fn)
    .then(resolve, reject)
    .finally(() => {
      active--;
      pump();
    });
}

// ---- cache ----
async function cacheGet(slug) {
  const key = "r:" + slug;
  const o = await chrome.storage.local.get(key);
  const v = o[key];
  if (!v) return null;
  const ttl = v.lb || v.imdb ? TTL_OK : TTL_EMPTY;
  if (Date.now() - v.ts > ttl) return null;
  return v;
}
async function cacheSet(slug, v) {
  await chrome.storage.local.set({ ["r:" + slug]: v });
}

// ---- settings ----
async function getSettings() {
  const o = await chrome.storage.sync.get(["imdbKey", "enableImdb"]);
  return { imdbKey: o.imdbKey || "", enableImdb: o.enableImdb !== false };
}

// ---- helpers ----
function cleanTitle(t) {
  return (t || "").replace(/\s*\((?:19|20)\d{2}\)\s*$/, "").trim();
}

function decodeEntities(s) {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&apos;|&#0?39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&hellip;|&#8230;/g, "…")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function slugify(t) {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- cineville: slug -> {title, year} ----
async function getCinevilleFilm(slug, buildId, locale) {
  locale = locale || "en-GB";
  if (buildId) {
    try {
      const r = await fetch(
        `https://cineville.nl/_next/data/${buildId}/${locale}/films/${slug}.json`
      );
      if (r.ok) {
        const j = await r.json();
        const f = j.pageProps && j.pageProps.film;
        if (f && f.title) return { title: f.title, year: f.releaseYear || null };
      }
    } catch (_) {}
  }
  // Fallback: buildId stale or missing — parse the HTML page's __NEXT_DATA__.
  try {
    const r = await fetch(`https://cineville.nl/${locale}/films/${slug}`);
    if (r.ok) {
      const html = await r.text();
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (m) {
        const j = JSON.parse(m[1]);
        const f = j.props && j.props.pageProps && j.props.pageProps.film;
        if (f && f.title) return { title: f.title, year: f.releaseYear || null };
      }
    }
  } catch (_) {}
  // Last resort: derive a rough title from the slug.
  return { title: slug.replace(/-/g, " "), year: null };
}

// ---- OMDb (IMDb rating + the all-important imdbID) ----
async function omdbFetch(params, key) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const r = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&${qs}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j.Response === "True" ? j : null;
}

async function getOmdb(title, year, key) {
  // Title-only first: cineville's NL release year is often off-by-one from
  // IMDb's, and &y= is a hard filter that would reject the correct film.
  let j = await omdbFetch({ type: "movie", t: title }, key);
  // Only fall back to a year-filtered query if the title match is wildly off
  // (e.g. a same-named remake decades apart).
  if (j && year && j.Year) {
    const y = parseInt(j.Year, 10);
    if (!Number.isNaN(y) && Math.abs(y - year) > 1) {
      // Title-only matched a different film (e.g. an older same-named one).
      // Try to pin the exact year; if that finds nothing, reject the match
      // rather than return the wrong film.
      const j2 = await omdbFetch({ type: "movie", t: title, y: year }, key);
      j = j2 || null;
    }
  }
  if (!j) return null;
  return {
    imdbID: j.imdbID || null,
    rating: j.imdbRating && j.imdbRating !== "N/A" ? j.imdbRating : null,
    votes: j.imdbVotes,
  };
}

// ---- Letterboxd (scrape JSON-LD from a film page) ----
async function lbFilmFromUrl(url) {
  const r = await fetch(url, { credentials: "omit" });
  if (!r.ok) return null;
  const filmUrl = r.url || url; // canonical url after any redirect
  const html = await r.text();
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let txt = m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(); // strip CDATA comment wrapper
  let data;
  try {
    data = JSON.parse(txt);
  } catch (_) {
    return null;
  }
  // release year, for sanity-checking matches
  let year = null;
  const sd =
    data.releasedEvent &&
    data.releasedEvent[0] &&
    data.releasedEvent[0].startDate;
  if (sd) {
    const y = parseInt(String(sd).slice(0, 4), 10);
    if (!Number.isNaN(y)) year = y;
  }
  // synopsis lives in the og:description meta, not the JSON-LD
  let description = null;
  const dm = html.match(/<meta property="og:description" content="([^"]*)"/);
  if (dm) description = decodeEntities(dm[1]).trim() || null;

  const ar = data.aggregateRating;
  const rating = ar && ar.ratingValue ? Math.round(ar.ratingValue * 100) / 100 : null;
  if (!rating && !description) return null;
  return { rating, count: ar ? ar.ratingCount : null, url: filmUrl, year, description };
}

async function lbFromImdb(imdbId) {
  // id-based, so authoritative — no year check needed
  return lbFilmFromUrl(`https://letterboxd.com/imdb/${imdbId}/`);
}

// Key-free fallback: guess the slug from the title. Best-effort, so we reject
// any candidate whose release year is far from cineville's (avoids matching an
// older film with the same name).
async function lbFromTitleGuess(title, year) {
  const base = slugify(title);
  if (!base) return null;
  const cands = base.startsWith("the-")
    ? [base, base.slice(4)]
    : [base, "the-" + base];
  for (const c of cands) {
    const d = await lbFilmFromUrl(`https://letterboxd.com/film/${c}/`).catch(
      () => null
    );
    if (d && d.rating) {
      if (year && d.year && Math.abs(d.year - year) > 1) continue; // wrong film
      return d;
    }
  }
  return null;
}

// ---- main ----
async function handle(msg) {
  const { slug, buildId, locale } = msg;
  const cached = await cacheGet(slug);
  if (cached) return cached;

  return schedule(async () => {
    const again = await cacheGet(slug); // a queued duplicate may have filled it
    if (again) return again;

    const film = await getCinevilleFilm(slug, buildId, locale);
    const title = cleanTitle(film.title);
    const year = film.year;
    const { imdbKey, enableImdb } = await getSettings();

    // OMDb resolves the IMDb id (used for an exact Letterboxd match) + IMDb rating.
    const omdb = imdbKey ? await getOmdb(title, year, imdbKey).catch(() => null) : null;

    let lb = null;
    if (omdb && omdb.imdbID) lb = await lbFromImdb(omdb.imdbID).catch(() => null);
    if (!lb) lb = await lbFromTitleGuess(title, year).catch(() => null);

    const imdb =
      enableImdb && omdb && omdb.rating
        ? {
            rating: omdb.rating,
            votes: omdb.votes,
            id: omdb.imdbID,
            url: omdb.imdbID
              ? `https://www.imdb.com/title/${omdb.imdbID}/`
              : null,
          }
        : null;

    const result = { ts: Date.now(), title, year, lb, imdb };
    await cacheSet(slug, result);
    return result;
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "getRatings") {
    handle(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ error: String(e) }));
    return true; // keep the channel open for the async response
  }
});
