/**
 * sw.js – Service Worker for Mini Local File Manager PWA
 *
 * Strategy:
 *  - App shell (HTML, CSS, JS, fonts) → Cache-first, update in background
 *  - API calls (/api/*) → Network-only (always fresh from server)
 *  - Images / raw files (/api/raw) → Network-only (local FS content)
 *
 * The app is a localhost tool so offline mode caches only the UI shell.
 * Actual file operations always require the Node.js server to be running.
 */

'use strict';

var CACHE_NAME    = 'mlfm-shell-v2';
var CACHE_TIMEOUT = 5000; // ms before falling back to cache

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

/* ── Install: pre-cache the app shell ───────────────────────── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Use individual adds so one failure doesn't block others
      var promises = SHELL_URLS.map(function(url) {
        return cache.add(url).catch(function(err) {
          console.warn('[SW] Failed to cache:', url, err);
        });
      });
      return Promise.all(promises);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ── Activate: clean up old caches ──────────────────────────── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ── Fetch: routing strategy ─────────────────────────────────── */
self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  var req = event.request;

  // Always go to network for API calls (file operations, auth, etc.)
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

  // WebSocket — let pass through (SW doesn't intercept WS)
  if (url.indexOf('ws://') === 0 || url.indexOf('wss://') === 0) return;

  // External resources (Google Fonts etc.) — network with cache fallback
  if (url.indexOf(self.location.origin) !== 0) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        var networkFetch = fetch(req).then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(req, clone); });
          }
          return response;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // App shell: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(req).then(function(cached) {
        var networkFetch = fetch(req).then(function(response) {
          if (response && response.ok) {
            cache.put(req, response.clone());
          }
          return response;
        }).catch(function() {
          // Network failed — return offline page for navigation requests
          if (req.mode === 'navigate') {
            return cache.match('/index.html');
          }
          return null;
        });

        // Return cached immediately; update in background
        return cached || networkFetch;
      });
    })
  );
});

/* ── Message: force update ───────────────────────────────────── */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
