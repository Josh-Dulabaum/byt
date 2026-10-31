/* Big Year Terminal service worker: keeps the page and its libraries on the phone so it opens with no signal.
   Live data (eBird, weather, tides, iNaturalist) is not handled here; the page saves its own snapshot of the last search. */
const VER = 'v2';
const SHELL = 'byt-shell-' + VER, RUNTIME = 'byt-runtime-' + VER;
const LOCAL = ['./', './manifest.webmanifest', './icon-180.png', './icon-512.png'];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js'
];
const ASSET_HOSTS = ['cdnjs.cloudflare.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.allSettled(LOCAL.map(u => c.add(u)));
    const rt = await caches.open(RUNTIME);
    await Promise.allSettled(CDN.map(async u => { const r = await fetch(u, { mode: 'no-cors' }); await rt.put(u, r); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('byt-') && k !== SHELL && k !== RUNTIME) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Page: try the network for up to 3 s so updates arrive, otherwise open the saved copy.
async function page(req) {
  const c = await caches.open(SHELL);
  const cached = await c.match('./');
  const net = fetch(req).then(r => { if (r.ok) c.put('./', r.clone()); return r; });
  if (!cached) return net;
  const timeout = new Promise(res => setTimeout(() => res(cached), 3000));
  return Promise.race([net.catch(() => cached), timeout]);
}

// Libraries, fonts, icons: serve the saved copy at once and refresh it in the background.
async function asset(req) {
  const c = await caches.open(new URL(req.url).origin === self.location.origin ? SHELL : RUNTIME);
  const cached = await c.match(req.url);
  const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req.url, r.clone()); return r; }).catch(() => cached);
  return cached || net;
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin) return e.respondWith(page(req));
  if (url.origin === self.location.origin && /\.(png|webmanifest)$/.test(url.pathname)) return e.respondWith(asset(req));
  if (ASSET_HOSTS.includes(url.hostname)) return e.respondWith(asset(req));
  // everything else (eBird, Open-Meteo, NOAA, iNaturalist, map tiles) goes straight to the network
});
