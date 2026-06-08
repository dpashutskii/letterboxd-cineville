// Service worker: does all cross-origin work (content scripts can't, due to CORS).
// Flow per film slug:
//   1. Resolve canonical title + year from cineville's own Next.js data endpoint.
//   2. Look up the Letterboxd rating (scrape JSON-LD) and IMDb rating (OMDb API).
//   3. Cache the result in chrome.storage.local.

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

// ---- cineville: slug -> {title, year} ----
function cleanTitle(t) {
  return (t || "").replace(/\s*\((?:19|20)\d{2}\)\s*$/, "").trim();
}

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

// ---- Letterboxd (scrape) ----
async function lbSearchSlug(title) {
  const r = await fetch(
    `https://letterboxd.com/search/films/${encodeURIComponent(title)}/`,
    { credentials: "omit" }
  );
  if (!r.ok) return null;
  const html = await r.text();
  const m =
    html.match(/data-film-slug="([^"]+)"/) ||
    html.match(/href="\/film\/([^/"?#]+)\//);
  return m ? m[1] : null;
}

async function lbFilm(slug) {
  const r = await fetch(`https://letterboxd.com/film/${slug}/`, {
    credentials: "omit",
  });
  if (!r.ok) return null;
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
  const url = `https://letterboxd.com/film/${slug}/`;
  const ar = data.aggregateRating;
  if (!ar || !ar.ratingValue) return { slug, rating: null, url };
  return {
    slug,
    rating: Math.round(ar.ratingValue * 100) / 100,
    count: ar.ratingCount,
    url,
  };
}

async function getLetterboxd(title) {
  const slug = await lbSearchSlug(title);
  if (!slug) return null;
  return await lbFilm(slug);
}

// ---- IMDb via OMDb ----
function imdbObj(j) {
  const rating = j.imdbRating && j.imdbRating !== "N/A" ? j.imdbRating : null;
  return {
    rating,
    votes: j.imdbVotes,
    id: j.imdbID,
    url: j.imdbID ? `https://www.imdb.com/title/${j.imdbID}/` : null,
  };
}

async function omdb(params, key) {
  const r = await fetch(
    `https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&${params}`
  );
  if (!r.ok) return null;
  const j = await r.json();
  return j.Response === "True" ? j : null;
}

async function getImdb(title, year, key) {
  const t = `t=${encodeURIComponent(title)}`;
  let j = await omdb(year ? `${t}&y=${year}` : t, key);
  if (!j && year) j = await omdb(t, key); // retry without year
  return j ? imdbObj(j) : null;
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

    const [lb, imdb] = await Promise.all([
      getLetterboxd(title).catch(() => null),
      enableImdb && imdbKey
        ? getImdb(title, year, imdbKey).catch(() => null)
        : Promise.resolve(null),
    ]);

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
