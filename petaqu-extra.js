/* PETAQU extra: lencana online/offline, unduh peta offline, antrean sinkron data lapangan. */
(function () {
  'use strict';
  const $ = (t, css, html) => { const e = document.createElement(t); e.style.cssText = css || ''; if (html) e.innerHTML = html; return e; };
  const sw = () => navigator.serviceWorker && navigator.serviceWorker.controller;

  // 1) Lencana status jaringan
  const badge = $('div', 'position:fixed;left:10px;bottom:10px;z-index:4000;padding:5px 11px;border-radius:14px;font:600 12px system-ui;color:#fff;display:none;pointer-events:none');
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
  document.addEventListener('DOMContentLoaded', () => { document.body.append(badge, btn, toast); upd(); });
})();
