/**
 * ══════════════════════════════════════════════════════
 * KAKEIBO — service-worker.js
 * Strategy: Cache First (shell) + Network First (API)
 * ══════════════════════════════════════════════════════
 */

const CACHE_NAME   = 'kakeibo-v1.0.0';
const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  // Fonts sont cachées automatiquement par le navigateur
];

/* ── Install: mettre en cache le shell ── */
self.addEventListener('install', event => {
  console.log('[SW] Installing Kakeibo v1.0.0');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(SHELL_ASSETS);
      })
      .then(() => self.skipWaiting()) // activer immédiatement
  );
});

/* ── Activate: nettoyer les anciens caches ── */
self.addEventListener('activate', event => {
  console.log('[SW] Activating');

  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim()) // prendre contrôle immédiatement
  );
});

/* ── Fetch: stratégie selon la requête ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les extensions browser et les requêtes non-http
  if (!request.url.startsWith('http')) return;

  // ① API Google Apps Script → Network First (toujours frais)
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ② Google Fonts → Cache First (stable)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ③ App Shell → Cache First avec fallback réseau
  event.respondWith(cacheFirst(request));
});

/* ── Stratégie Cache First ── */
async function cacheFirst(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);

    // Mettre en cache uniquement les réponses valides
    if (response.ok && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    // Fallback: retourner index.html pour navigation offline
    const fallback = await caches.match('./index.html');
    return fallback || new Response('Hors ligne', { status: 503 });
  }
}

/* ── Stratégie Network First ── */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (err) {
    // Retourner depuis cache si disponible
    const cached = await caches.match(request);
    return cached || new Response(
      JSON.stringify({ status: 'error', message: 'Hors ligne' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/* ── Message: forcer la mise à jour ── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
