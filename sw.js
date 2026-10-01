// PETAQU Service Worker v4: offline penuh (shell + pustaka CDN + tile peta), update lewat banner, sinkron latar.
const V = 'v14';
const SHELL_C = 'petaqu-shell-' + V, LIB_C = 'petaqu-lib-' + V, TILE_C = 'petaqu-tile-v1';
const KEEP = [SHELL_C, LIB_C, TILE_C];
const MAX_TILES = 4000;
const SHELL = ['./', 'index.html', 'data-ruas.js', 'data-jembatan.js', 'petaqu-extra.js', 'petaqu-pro.js', 'petaqu-ai.js', 'petaqu-cloud.js', 'petaqu-detect.js', 'petaqu-scan.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdn.jsdelivr.net/npm/leaflet-rotate@0.2.7/dist/leaflet-rotate-src.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://unpkg.com/@phosphor-icons/web',
  'https://cdn.tailwindcss.com'
];
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const TILE_HOSTS = ['basemaps.cartocdn.com', 'server.arcgisonline.com', 'services.arcgisonline.com', 'mt1.google.com', 'tile.openstreetmap.org'];

// Satu per satu: kegagalan satu berkas tidak membatalkan yang lain (addAll bersifat atomik).
async function precache(name, urls) {
  const c = await caches.open(name);
  await Promise.allSettled(urls.map(u => c.add(new Request(u, { cache: 'reload' }))));
}
self.addEventListener('install', e => e.waitUntil(Promise.all([precache(SHELL_C, SHELL), precache(LIB_C, LIBS)])));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

async function trimTiles() {
  const c = await caches.open(TILE_C), ks = await c.keys();
  if (ks.length > MAX_TILES) await Promise.all(ks.slice(0, ks.length - MAX_TILES).map(k => c.delete(k)));
}
let puts = 0;
async function tileFirst(req) {
  const c = await caches.open(TILE_C), hit = await c.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); if (++puts % 100 === 0) trimTiles(); }
    return res;
  } catch (_) { return new Response('', { status: 504 }); }
}
async function libSWR(req) {
  const c = await caches.open(LIB_C), hit = await c.match(req);
  const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || new Response('', { status: 504 });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then(res => {
        const copy = res.clone();
        caches.open(SHELL_C).then(c => c.put('index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('index.html').then(r => r || caches.match('./')))
    );
    return;
  }
  if (TILE_HOSTS.some(h => url.hostname.endsWith(h)) && /\.(png|jpe?g|webp)|\/tile|\/vt\/|\/MapServer\/tile/i.test(url.pathname + url.search)) { e.respondWith(tileFirst(req)); return; }
  if (LIB_HOSTS.includes(url.hostname)) { e.respondWith(libSWR(req)); return; }
  // Database ruas & jembatan: network-first agar update data-ruas.js / data-jembatan.js langsung terbaca; offline pakai salinan cache.
  if (url.origin === location.origin && /\/data-(ruas|jembatan)\.js$/.test(url.pathname)) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(SHELL_C).then(c => c.put(req, cp)); }
      return res;
    }).catch(() => caches.match(req)));
    return;
  }
  if (url.origin === location.origin) e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(SHELL_C).then(c => c.put(req, cp)); }
    return res;
  }).catch(() => caches.match(req))));
});

self.addEventListener('message', async e => {
  const d = e.data, src = e.source;
  if (d === 'SKIP_WAITING') return self.skipWaiting();
  if (d && d.type === 'CACHE_TILES') {           // unduh area peta untuk offline
    const c = await caches.open(TILE_C); let done = 0, fail = 0, i = 0;
    const worker = async () => {
      while (i < d.urls.length) {
        const u = d.urls[i++];
        try { if (!(await c.match(u))) { const r = await fetch(new Request(u, { mode: 'no-cors' })); await c.put(u, r); } } catch (_) { fail++; }
        if (++done % 10 === 0 || done === d.urls.length) src && src.postMessage({ type: 'TILES_PROGRESS', done, total: d.urls.length, fail });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    src && src.postMessage({ type: 'TILES_DONE', total: d.urls.length, fail });
  }
  if (d && d.type === 'CLEAR_TILES') { await caches.delete(TILE_C); src && src.postMessage({ type: 'TILES_CLEARED' }); }
});

// Background Sync: minta halaman membuang antrean data lapangan.
self.addEventListener('sync', e => {
  if (e.tag === 'petaqu-outbox') e.waitUntil(self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage({ type: 'FLUSH_OUTBOX' }))));
});
