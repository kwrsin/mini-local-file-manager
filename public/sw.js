/**
 * sw.js – Service Worker for Mini Local File Manager PWA
 *
 * Strategy:
 *  - App shell (HTML, CSS, JS) → Network-first with cache fallback
 *    (ensures updates are picked up immediately on next load)
 *  - API calls (/api/*) → Network-only (always fresh from server)
 *  - External resources (fonts etc.) → Cache-first
 *
 * Cache is versioned by build timestamp so old entries are evicted on update.
 */

'use strict';

var CACHE_VERSION = 'mlfm-shell-v3';
var SHELL_URLS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/polyfill.js',
  '/js/i18n.js',
  '/js/app.js',
  '/img/favicon.svg',
  '/img/icon-192.svg',
  '/img/icon-512.svg',
  '/manifest.json'
];

/* ── Install: pre-cache app shell, activate immediately ─────── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      var promises = SHELL_URLS.map(function(url) {
        return cache.add(url).catch(function(err) {
          console.warn('[SW] Failed to cache:', url, err);
        });
      });
      return Promise.all(promises);
    }).then(function() {
      // Activate immediately — don't wait for old SW to finish
      return self.skipWaiting();
    })
  );
});

/* ── Activate: delete old caches, claim all clients ─────────── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_VERSION; })
            .map(function(key) {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
      );
    }).then(function() {
      // Take control of all open tabs immediately
      return self.clients.claim();
    })
  );
});

/* ── Fetch: routing strategy ─────────────────────────────────── */
self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  var req = event.request;

  // ── API calls: always network, never cache ────────────────────
  if (url.indexOf('/api/') !== -1) {
    event.respondWith(
      fetch(req).catch(function() {
        return new Response(
          JSON.stringify({ error: 'Server not reachable. Please start the Node.js server.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // ── External resources (Google Fonts etc.): cache-first ───────
  if (url.indexOf(self.location.origin) !== 0) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        if (cached) return cached;
        return fetch(req).then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_VERSION).then(function(cache) { cache.put(req, clone); });
          }
          return response;
        });
      })
    );
    return;
  }

  // ── App shell: NETWORK-FIRST with cache fallback ──────────────
  // Always try the network first so updates are reflected immediately.
  // Only fall back to cache when the server is unreachable.
  event.respondWith(
    fetch(req).then(function(response) {
      // Update the cache with the fresh response
      if (response && response.ok) {
        var clone = response.clone();
        caches.open(CACHE_VERSION).then(function(cache) { cache.put(req, clone); });
      }
      return response;
    }).catch(function() {
      // Network failed — serve from cache
      return caches.match(req).then(function(cached) {
        if (cached) return cached;
        // Fallback for navigation requests
        if (req.mode === 'navigate') return caches.match('/index.html');
        return new Response('', { status: 503 });
      });
    })
  );
});

/* ── Message: force update from app ─────────────────────────── */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
