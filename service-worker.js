/**
 * service-worker.js
 * Warboss Companion PWA — Stage 7
 *
 * Strategy:
 *   • App shell + data files  → Cache-First (offline-safe; Battle mode works with no network)
 *   • Google domains          → Network-First with cache fallback
 *                               (Fonts, Sheets API, Apps Script; stale font CSS is fine,
 *                                but Sheets data should always try fresh first)
 *   • Everything else         → Network-only (no accidental caching of third-party content)
 *
 * Install behaviour:
 *   • Cache all SHELL_FILES that can be fetched (HTTP 200 only).
 *   • A single missing file does NOT abort the install; the SW comes up even if
 *     skins.js or icons haven't been committed yet (they 404 gracefully).
 *
 * Update behaviour:
 *   • A new SW version triggers skipWaiting immediately so the updated app
 *     shell is served without requiring a second tab close.
 *
 * Ways-of-Working notes:
 *   • CACHE_VERSION is the only "magic number" here; bump it any time the
 *     file list or strategy changes so the old cache is pruned cleanly.
 *   • Google domains are identified by hostname suffix, not hardcoded URLs,
 *     so any new Apps Script deployment URL is covered automatically.
 *   • No game-specific values live here — all content comes from kow.json.
 */

'use strict';

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const CACHE_VERSION  = 'wbc-v16';
const CACHE_SHELL    = CACHE_VERSION + '-shell';   // app shell + data
const CACHE_FONTS    = CACHE_VERSION + '-fonts';   // Google Fonts responses

/**
 * All files that must be available offline for the app to function.
 * Icons and skins.js are included even if not yet committed; a 404 at
 * install time is swallowed gracefully (see cacheShell() below).
 */
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/skins.js',
  './js/app.js',
  './js/storage.js',
  './js/sheets.js',
  './js/muster.js',
  './js/battle.js',
  './js/chronicle.js',
  './data/systems/index.json',
  './data/systems/kow.json',
  './data/armies/kow/index.json',
  './data/armies/kow/goblins.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
  './assets/icons/favicon.ico',
];

/**
 * Hostname suffixes that should be handled with Network-First.
 * Covers fonts.googleapis.com, fonts.gstatic.com, script.google.com,
 * and any Apps Script deployment URL (*.googleapis.com, script.googleusercontent.com).
 */
const NETWORK_FIRST_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'script.google.com',
  'script.googleusercontent.com',
  'sheets.googleapis.com',
  'googleapis.com',
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function isNetworkFirstHost(url) {
  try {
    const hostname = new URL(url).hostname;
    return NETWORK_FIRST_HOSTS.some(function (suffix) {
      return hostname === suffix || hostname.endsWith('.' + suffix);
    });
  } catch (e) {
    return false;
  }
}

function isSameOriginOrRelative(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch (e) {
    return true; // relative URL — treat as same origin
  }
}

// ─── INSTALL: populate shell cache ───────────────────────────────────────────

/**
 * Cache each shell file individually.
 * Swallows errors per file so a single 404 (e.g. icons not yet uploaded,
 * skins.js not yet committed) does not abort the entire install.
 */
async function cacheShell() {
  const cache = await caches.open(CACHE_SHELL);
  const results = await Promise.allSettled(
    SHELL_FILES.map(async function (url) {
      try {
        const response = await fetch(url, { credentials: 'same-origin' });
        if (response.ok) {
          await cache.put(url, response);
        }
        // Non-200 silently skipped; not a fatal install error
      } catch (err) {
        // Network failure for this file silently skipped
        console.warn('[SW] Could not cache:', url, err.message);
      }
    })
  );
  return results;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    cacheShell().then(function () {
      // Take control immediately without waiting for old clients to close
      return self.skipWaiting();
    })
  );
});

// ─── ACTIVATE: prune old caches ──────────────────────────────────────────────

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            // Delete any cache that isn't from this version
            return key !== CACHE_SHELL && key !== CACHE_FONTS;
          })
          .map(function (key) {
            console.log('[SW] Pruning old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(function () {
      // Claim all existing clients so they switch to this SW immediately
      return self.clients.claim();
    })
  );
});

// ─── FETCH: routing ──────────────────────────────────────────────────────────

self.addEventListener('fetch', function (event) {
  const url = event.request.url;

  // Non-GET requests (POST to Apps Script, etc.) always go to network
  if (event.request.method !== 'GET') {
    return;
  }

  if (isNetworkFirstHost(url)) {
    // ── Network-First for Google domains ──────────────────────────────────
    // Try network; on failure return cached copy (fonts are fine stale,
    // Sheets data will show an error notice via sheets.js fail-gracefully path)
    event.respondWith(networkFirstWithFontCache(event.request));
    return;
  }

  if (isSameOriginOrRelative(url)) {
    // ── Cache-First for app shell and data ────────────────────────────────
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else: network only (don't accidentally cache CDN assets, etc.)
  // No respondWith → browser handles normally
});

/**
 * Cache-First strategy.
 * Returns cached response if present, otherwise fetches from network,
 * caches the result, and returns it.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_SHELL);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Network failed and nothing cached — return a minimal offline page
    // for HTML requests; for other assets just propagate the failure
    if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
      return offlineFallback();
    }
    throw err;
  }
}

/**
 * Network-First strategy with font-specific cache fallback.
 * Fonts land in CACHE_FONTS; Sheets API failures propagate so sheets.js
 * can surface its own "retry" UI.
 */
async function networkFirstWithFontCache(request) {
  const isFont = (
    request.url.includes('fonts.googleapis.com') ||
    request.url.includes('fonts.gstatic.com')
  );
  try {
    const response = await fetch(request);
    if (isFont && response.ok) {
      const cache = await caches.open(CACHE_FONTS);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    if (isFont) {
      const cached = await caches.match(request, { cacheName: CACHE_FONTS });
      if (cached) return cached;
    }
    // Non-font Google domain failure (Sheets, Apps Script): propagate so
    // the calling module (sheets.js) handles it and shows the retry UI
    throw err;
  }
}

/**
 * Minimal offline fallback HTML returned when the user navigates
 * to a page and nothing is cached and the network is unavailable.
 * In practice this should never appear because index.html is cached
 * at install time, but it is here as a last resort.
 */
function offlineFallback() {
  return new Response(
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Warboss Companion</title>' +
    '<style>body{background:#16120e;color:#8a7f72;font-family:serif;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0}' +
    'p{text-align:center;line-height:2;font-size:1.1rem}</style></head>' +
    '<body><p>You are offline.<br>Return to the field when your connection is restored.</p></body></html>',
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}
