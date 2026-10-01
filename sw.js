// Service worker sederhana: syarat Chrome agar aplikasi bisa DIINSTAL (bukan sekadar pintasan).
const CACHE = 'petaqu-shell-v3';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});
// Versi baru menunggu sampai pengguna menekan "Muat ulang" di banner.
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// Network-first untuk halaman; jika offline pakai salinan tersimpan. Request lain (peta, CDN) tidak disentuh.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put('index.html', copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('index.html').then(r => r || caches.match('./')))
  );
});
