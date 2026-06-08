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
async function getOmdb(title, year, key) {
  const base = `https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&type=movie`;
  const t = `&t=${encodeURIComponent(title)}`;
  let r = await fetch(base + t + (year ? `&y=${year}` : ""));
  let j = r.ok ? await r.json() : null;
  if ((!j || j.Response !== "True") && year) {
    r = await fetch(base + t); // retry without year
    j = r.ok ? await r.json() : null;
  }
  if (!j || j.Response !== "True") return null;
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
  const ar = data.aggregateRating;
  if (!ar || !ar.ratingValue) return null;
  return {
    rating: Math.round(ar.ratingValue * 100) / 100,
    count: ar.ratingCount,
    url: filmUrl,
  };
}

async function lbFromImdb(imdbId) {
  return lbFilmFromUrl(`https://letterboxd.com/imdb/${imdbId}/`);
}

// Key-free fallback: guess the slug from the title. Best-effort only.
async function lbFromTitleGuess(title) {
  const base = slugify(title);
  if (!base) return null;
  const cands = base.startsWith("the-")
    ? [base, base.slice(4)]
    : [base, "the-" + base];
  for (const c of cands) {
    const d = await lbFilmFromUrl(`https://letterboxd.com/film/${c}/`).catch(
      () => null
    );
    if (d && d.rating) return d;
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
    if (!lb) lb = await lbFromTitleGuess(title).catch(() => null);

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
