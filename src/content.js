// Content script: runs on every cineville.nl page.
// 1. Finds links to film detail pages (works on /showtimes, /films, detail pages).
// 2. Reads the Next.js buildId from the page's __NEXT_DATA__ blob (DOM, not page JS).
// 3. Asks the service worker for ratings per film slug and injects a small badge.

const LOCALE_RE = /\/(en-GB|nl-NL)(?:\/|$)/;
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

function makeBadge() {
  const b = document.createElement("span");
  b.className = "cvr-badge cvr-loading";
  b.textContent = "…";
  return b;
}

function render(badge, data) {
  badge.classList.remove("cvr-loading");
  const parts = [];
  if (data && data.lb && data.lb.rating) {
    const count = data.lb.count ? Number(data.lb.count).toLocaleString() : "?";
    const a = document.createElement("a");
    a.className = "cvr-lb";
    a.href = data.lb.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.title = `Letterboxd ${data.lb.rating}/5 — ${count} ratings`;
    a.textContent = `★ ${data.lb.rating}`;
    parts.push(a);
  }
  if (data && data.imdb && data.imdb.rating) {
    const a = document.createElement("a");
    a.className = "cvr-imdb";
    a.href = data.imdb.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.title = `IMDb ${data.imdb.rating}/10`;
    a.textContent = `IMDb ${data.imdb.rating}`;
    parts.push(a);
  }
  badge.textContent = "";
  if (parts.length === 0) {
    badge.classList.add("cvr-empty");
    badge.textContent = "no rating";
    return;
  }
  parts.forEach((p) => badge.appendChild(p));
}

function process(link) {
  if (doneLinks.has(link)) return;
  const slug = slugFromHref(link.getAttribute("href"));
  if (!slug) return;
  doneLinks.add(link);

  // Avoid two badges for the same film in one card (poster link + title link).
  const card = link.closest("article, li") || link.parentElement || link;
  card.__cvrSlugs = card.__cvrSlugs || new Set();
  if (card.__cvrSlugs.has(slug)) return;
  card.__cvrSlugs.add(slug);

  const badge = makeBadge();
  link.insertAdjacentElement("afterend", badge);

  chrome.runtime.sendMessage({ type: "getRatings", slug, buildId, locale }, (resp) => {
    if (chrome.runtime.lastError || !resp || resp.error) {
      badge.remove();
      card.__cvrSlugs.delete(slug);
      return;
    }
    render(badge, resp);
  });
}

function scan(root) {
  (root || document).querySelectorAll('a[href*="/films/"]').forEach(process);
}

scan();

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches && node.matches('a[href*="/films/"]')) process(node);
      if (node.querySelectorAll) scan(node);
    }
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
