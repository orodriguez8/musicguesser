// Service worker de MusicGuesser. Vite lo copia a dist/sw.js en cada build
// rellenando VERSION y PRECACHE (ver vite.config.ts).
//
// - Páginas: primero la red (así cada despliegue llega al momento) y, sin conexión, la copia guardada.
// - Archivos con hash de /assets/: de la caché, porque nunca cambian.
// - Supabase, Deezer, LRCLIB, MusicBrainz y fuentes: ni se tocan, siempre en directo.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `musicguesser-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          [...new Set(PRECACHE)].map((path) =>
            fetch(path, { cache: 'reload' }).then((res) => {
              if (!res.ok) throw new Error(`${path}: ${res.status}`);
              return cache.put(path, res);
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('musicguesser-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put('./', copy));
          }
          return res;
        })
        .catch(() => caches.match('./').then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && url.pathname.includes('/assets/')) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
