// Content script: runs on every cineville.nl page.
// - Listing/showtimes pages: badge each film link (+ show the release year,
//   which cineville hides on the showtimes page).
// - Film detail pages: place one badge next to the title and add the Letterboxd
//   synopsis, instead of spamming the showtimes sidebar.
// Reads the Next.js buildId from the page's __NEXT_DATA__ blob (DOM, not page JS)
// and asks the service worker for ratings per film slug.

const LOCALE_RE = /\/(en-GB|nl-NL)(?:\/|$)/;
const DETAIL_RE = /\/films\/([^/?#]+)\/?$/;
const doneLinks = new WeakSet();

function getBuildId() {
  try {
    const el = document.getElementById("__NEXT_DATA__");
    if (el) return JSON.parse(el.textContent).buildId || null;
  } catch (_) {}
  return null;
}

function getLocale() {
  const m = location.pathname.match(LOCALE_RE);
  return m ? m[1] : "en-GB";
}

const buildId = getBuildId();
const locale = getLocale();

function slugFromHref(href) {
  const m = (href || "").match(/\/films\/([^/?#]+)/);
  return m ? m[1] : null;
}

function currentDetailSlug() {
  const m = location.pathname.match(DETAIL_RE);
  return m ? m[1] : null;
}

function requestRatings(slug, cb) {
  chrome.runtime.sendMessage({ type: "getRatings", slug, buildId, locale }, (resp) => {
    if (chrome.runtime.lastError || !resp || resp.error) return cb(null);
    cb(resp);
  });
}

function makeBadge() {
  const b = document.createElement("span");
  b.className = "cvr-badge cvr-loading";
  b.textContent = "···";
  return b;
}

// A rating chip is a real link, but we stop the click from bubbling so it never
// triggers the surrounding cineville card link.
function chip(kind, label, href, title) {
  const a = document.createElement("a");
  a.className = "cvr-chip cvr-" + kind;
  a.href = href || "#";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = title;
  a.textContent = label;
  a.addEventListener("click", (e) => e.stopPropagation());
  return a;
}

function render(badge, data, opts) {
  opts = opts || {};
  badge.classList.remove("cvr-loading");
  badge.textContent = "";
  const els = [];

  if (opts.withYear && data && data.year) {
    const y = document.createElement("span");
    y.className = "cvr-year";
    y.textContent = data.year;
    els.push(y);
  }
  if (data && data.lb && data.lb.rating) {
    const count = data.lb.count ? Number(data.lb.count).toLocaleString() : "?";
    els.push(
      chip("lb", `★ ${data.lb.rating}`, data.lb.url,
        `Letterboxd — ${data.lb.rating}/5 from ${count} ratings`)
    );
  }
  if (data && data.imdb && data.imdb.rating) {
    els.push(
      chip("imdb", `IMDb ${data.imdb.rating}`, data.imdb.url,
        `IMDb — ${data.imdb.rating}/10`)
    );
  }

  if (els.length === 0) {
    badge.classList.add("cvr-empty");
    badge.textContent = "–";
    badge.title = "No Letterboxd/IMDb rating found";
    return;
  }
  els.forEach((e) => badge.appendChild(e));
}

// ---- listing / showtimes pages ----
function process(link) {
  if (doneLinks.has(link)) return;
  const slug = slugFromHref(link.getAttribute("href"));
  if (!slug) return;
  // On a detail page the main film is handled by the title badge — skip its
  // showtimes-sidebar links to avoid duplicate badges.
  if (slug === currentDetailSlug()) return;
  doneLinks.add(link);

  // Avoid two badges for the same film in one card (poster link + title link).
  const card = link.closest("article, li") || link.parentElement || link;
  card.__cvrSlugs = card.__cvrSlugs || new Set();
  if (card.__cvrSlugs.has(slug)) return;
  card.__cvrSlugs.add(slug);

  const badge = makeBadge();
  link.insertAdjacentElement("afterend", badge);
  requestRatings(slug, (data) => {
    if (!data) {
      badge.remove();
      card.__cvrSlugs.delete(slug);
      return;
    }
    render(badge, data, { withYear: true });
    const text = data.lb && data.lb.description;
    if (text) addListDescription(card, link, text);
  });
}

// Append a truncated synopsis at the bottom of the card's text column.
function addListDescription(card, link, text) {
  const heading =
    card.querySelector("h1, h2, h3, h4, h5") ||
    link.closest("h1, h2, h3, h4, h5");
  if (!heading) return;
  // The title sits in a <dd>; its parent is the text column that also holds the
  // venue/specials. Append there so the synopsis lands below them, not under the
  // title. Fall back to the heading's parent on other layouts.
  const ddWrap = heading.closest("dd");
  const column = (ddWrap && ddWrap.parentElement) || heading.parentElement;
  if (!column || column.querySelector(":scope > .cvr-desc-sm")) return;
  const p = document.createElement("p");
  p.className = "cvr-desc-sm";
  p.textContent = text;
  column.appendChild(p);
}

function scan(root) {
  (root || document).querySelectorAll('a[href*="/films/"]').forEach(process);
}

// ---- film detail page ----
function injectDetailBadge() {
  const slug = currentDetailSlug();
  if (!slug) return;
  if (document.querySelector(".cvr-detail")) return; // already done for this page
  const h1 = document.querySelector("h1");
  if (!h1) return; // title not rendered yet; observer will retry

  const wrap = document.createElement("div");
  wrap.className = "cvr-detail";
  const badge = makeBadge();
  const desc = document.createElement("p");
  desc.className = "cvr-desc";
  wrap.appendChild(badge);
  wrap.appendChild(desc);
  h1.insertAdjacentElement("afterend", wrap);

  requestRatings(slug, (data) => {
    render(badge, data, { withYear: false });
    const text = data && data.lb && data.lb.description;
    if (text) desc.textContent = text;
    else desc.remove();
  });
}

// ---- run + react to SPA navigation ----
function tick() {
  if (currentDetailSlug()) injectDetailBadge();
  else scan();
}

tick();

const observer = new MutationObserver((mutations) => {
  if (currentDetailSlug()) {
    injectDetailBadge();
    return;
  }
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches && node.matches('a[href*="/films/"]')) process(node);
      if (node.querySelectorAll) scan(node);
    }
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// Next.js client-side navigation doesn't reload the page; re-run on URL change.
let lastPath = location.pathname;
function onNav() {
  if (location.pathname === lastPath) return;
  lastPath = location.pathname;
  setTimeout(tick, 250);
}
["pushState", "replaceState"].forEach((fn) => {
  const orig = history[fn];
  history[fn] = function () {
    const r = orig.apply(this, arguments);
    onNav();
    return r;
  };
});
window.addEventListener("popstate", onNav);
