/* PETAQU extra: lencana online/offline, unduh peta offline, antrean sinkron data lapangan. */
(function () {
  'use strict';
  const $ = (t, css, html) => { const e = document.createElement(t); e.style.cssText = css || ''; if (html) e.innerHTML = html; return e; };
  const sw = () => navigator.serviceWorker && navigator.serviceWorker.controller;

  // Dock tunggal: satu tombol "Alat" di kiri bawah, menu berlabel mengembang ke atas (tidak menimpa kontrol peta).
  if (!window.PQ_DOCK) (function () {
    let box, main, list, items = [];
    function build() {
      box = document.createElement('div'); box.style.cssText = 'position:fixed;left:10px;bottom:calc(64px + env(safe-area-inset-bottom,0px));z-index:3900;display:flex;flex-direction:column-reverse;align-items:flex-start;gap:8px;font:600 12.5px system-ui';
      main = document.createElement('button'); main.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i>'; main.title = 'Alat PETAQU';
      main.style.cssText = 'width:44px;height:44px;border-radius:50%;border:1px solid #22d3ee66;background:#071a26ee;color:#22d3ee;font-size:17px;box-shadow:0 2px 10px #0007;cursor:pointer';
      list = document.createElement('div'); list.style.cssText = 'display:none;flex-direction:column-reverse;gap:6px';
      box.append(main, list); document.body.append(box);
      // Letakkan dock tepat di atas tumpukan kontrol kiri-bawah milik aplikasi (legenda, tombol tema, dll.), baik di HP maupun PC.
      const big = e => { const r = e.getBoundingClientRect(); return r.width > innerWidth * .6 && r.height > innerHeight * .5; };
      const place = () => {
        // Jangan menimpa sidebar: di HP sembunyikan dock saat sidebar terbuka; di PC geser ke kanan sidebar.
        const sb = document.getElementById('sidebar'), mobile = innerWidth <= 860;
        if (mobile && sb && sb.classList.contains('open')) { box.style.display = 'none'; return; }
        box.style.display = 'flex';
        const left = (!mobile && sb) ? Math.max(10, Math.round(sb.getBoundingClientRect().right) + 10) : 10;
        box.style.left = left + 'px';
        const x = left + 16; let top = innerHeight, gap = 0;
        for (let y = innerHeight - 4; y > innerHeight * .35; y -= 4) {
          const hit = document.elementsFromPoint(x, y).some(e => e !== document.documentElement && e !== document.body && !box.contains(e) && !big(e) && !e.closest('.leaflet-pane') && !e.closest('#sidebar, #sidebarScrim') && getComputedStyle(e).pointerEvents !== 'none');
          if (hit) { top = y; gap = 0; } else if (top < innerHeight && ++gap > 4) break;
        }
        box.style.bottom = Math.max(14, innerHeight - top + 10) + 'px';
      };
      const sbEl = document.getElementById('sidebar');
      if (sbEl && window.MutationObserver) new MutationObserver(place).observe(sbEl, { attributes: true, attributeFilter: ['class'] });
      if (document.body && window.MutationObserver) new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      place(); setInterval(place, 1200); addEventListener('resize', place); addEventListener('orientationchange', () => setTimeout(place, 300));
      main.onclick = e => { e.stopPropagation(); const o = list.style.display === 'none'; list.style.display = o ? 'flex' : 'none'; main.style.background = o ? '#0e7490' : '#071a26ee'; main.style.color = o ? '#fff' : '#22d3ee'; };
      document.addEventListener('click', e => { if (!box.contains(e.target)) { list.style.display = 'none'; main.style.background = '#071a26ee'; main.style.color = '#22d3ee'; } });
    }
    window.PQ_DOCK = { adopt(btn, label) {
      if (!box) build();
      const ico = btn.innerHTML; btn.innerHTML = '<span style="width:20px;text-align:center">' + ico + '</span><span>' + label + '</span>';
      btn.style.cssText = 'display:flex;align-items:center;gap:8px;height:38px;padding:0 14px 0 11px;border-radius:19px;border:1px solid #22d3ee55;background:#0e7490;color:#fff;font:600 12.5px system-ui;box-shadow:0 2px 8px #0006;cursor:pointer;white-space:nowrap';
      const orig = btn.onclick; btn.onclick = function (e) { list.style.display = 'none'; main.style.background = '#071a26ee'; main.style.color = '#22d3ee'; return orig && orig.call(this, e); };
      list.append(btn); return btn;
    } };
  })();

  // 1) Lencana status jaringan
  const badge = $('div', 'position:fixed;left:50%;transform:translateX(-50%);top:76px;z-index:4000;padding:5px 11px;border-radius:14px;font:600 12px system-ui;color:#fff;display:none;pointer-events:none');
  const upd = () => { const on = navigator.onLine; badge.style.display = on ? 'none' : 'block'; badge.style.background = '#b45309'; badge.textContent = '● Offline — memakai data tersimpan'; if (on) flush(); };
  addEventListener('online', upd); addEventListener('offline', upd);

  // 2) Unduh area peta untuk offline
  const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
  const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
  function tileUrls(maxExtra) {
    const m = window.map; if (!m || !window.L) return [];
    let layer = null; m.eachLayer(l => { if (l instanceof L.TileLayer && l._url && !layer) layer = l; });
    if (!layer) return [];
    const b = m.getBounds(), z0 = Math.round(m.getZoom()), urls = [];
    for (let z = z0; z <= Math.min(z0 + maxExtra, layer.options.maxZoom || 19); z++) {
      const x1 = lon2x(b.getWest(), z), x2 = lon2x(b.getEast(), z), y1 = lat2y(b.getNorth(), z), y2 = lat2y(b.getSouth(), z);
      for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) urls.push(layer.getTileUrl({ x, y, z }));
      if (urls.length > 4000) break;
    }
    return urls.slice(0, 4000);
  }
  const btn = $('button', 'position:fixed;right:10px;bottom:84px;z-index:3900;width:44px;height:44px;border-radius:50%;border:0;background:#0e7490;color:#fff;font-size:18px;box-shadow:0 2px 10px #0006;cursor:pointer', '<i class="fa-solid fa-cloud-arrow-down"></i>');
  btn.title = 'Unduh area peta yang tampil untuk offline';
  const toast = $('div', 'position:fixed;left:50%;transform:translateX(-50%);bottom:70px;z-index:4100;background:#071a26;color:#fff;border:1px solid #22d3ee;padding:8px 14px;border-radius:10px;font:500 13px system-ui;display:none;max-width:90vw;text-align:center');
  const say = (t, ms) => { toast.textContent = t; toast.style.display = 'block'; clearTimeout(say.t); if (ms) say.t = setTimeout(() => toast.style.display = 'none', ms); };
  btn.onclick = () => {
    if (!sw()) return say('Service worker belum aktif. Muat ulang sekali lalu coba lagi.', 3500);
    const urls = tileUrls(2);
    if (!urls.length) return say('Peta dasar belum siap.', 2500);
    if (!confirm('Unduh ' + urls.length + ' tile (zoom saat ini sampai +2) untuk area yang tampil?\nSebaiknya pakai Wi-Fi.')) return;
    say('Mengunduh 0/' + urls.length); navigator.serviceWorker.controller.postMessage({ type: 'CACHE_TILES', urls });
  };
  btn.oncontextmenu = e => { e.preventDefault(); if (confirm('Hapus semua tile offline?')) sw() && navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_TILES' }); };

  // 3) Antrean sinkron: PETAQU.enqueue({...}) lalu dikirim ke PETAQU_SYNC_URL saat online
  const KEY = 'pq_outbox';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
  async function flush() {
    const url = window.PETAQU_SYNC_URL; let q = read();
    if (!url || !q.length || !navigator.onLine) return;
    const rest = [];
    for (const it of q) { try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it) }); if (!r.ok) rest.push(it); } catch (_) { rest.push(it); } }
    localStorage.setItem(KEY, JSON.stringify(rest));
    if (rest.length < q.length) say((q.length - rest.length) + ' data lapangan tersinkron', 2500);
  }
  window.PETAQU = { enqueue(item) { const q = read(); q.push(Object.assign({ t: Date.now() }, item)); localStorage.setItem(KEY, JSON.stringify(q)); navigator.serviceWorker.ready.then(r => r.sync && r.sync.register('petaqu-outbox')).catch(() => {}); flush(); }, flush };

  navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', e => {
    const d = e.data || {};
    if (d.type === 'TILES_PROGRESS') say('Mengunduh ' + d.done + '/' + d.total);
    if (d.type === 'TILES_DONE') say('Selesai: ' + (d.total - d.fail) + ' tile tersimpan' + (d.fail ? ', ' + d.fail + ' gagal' : ''), 4000);
    if (d.type === 'TILES_CLEARED') say('Tile offline dihapus', 2500);
    if (d.type === 'FLUSH_OUTBOX') flush();
  });
  document.addEventListener('DOMContentLoaded', () => { document.body.append(badge, toast); PQ_DOCK.adopt(btn, 'Peta offline'); upd(); });
})();
