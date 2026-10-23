/* Minimal, conservative service worker.
   - Never touches /api (data is always live, lock/PIN stays server-side)
   - Network-first for navigations & assets; falls back to cache offline
   - Runtime cache only, capped — keeps the installed app usable when the
     PC is briefly unreachable on Wi-Fi. */
const CACHE = 'notion-shell-v1';
const MAX_ENTRIES = 60;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.json', '/icon-192.png']).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;             // never cache mutations
  if (url.pathname.startsWith('/api/')) return;       // data is always live
  if (url.origin !== location.origin) return;         // fonts/CDN pass through

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => {
            c.put(e.request, clone).then(() => trim(c));
          });
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((hit) => hit || caches.match('/')),
      ),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i]);
}
