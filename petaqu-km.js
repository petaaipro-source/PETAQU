/* PETAQU — KM ruas (manual + otomatis), tampil berdampingan dengan STA.
   Cara kerja:
   • Tiap ruas punya "KM awal" (tombol kalkulator di daftar ruas → Atur KM).
       - KOSONG  → KM tidak dihitung & tidak ditampilkan (hanya STA).
       - DIISI   → KM semua titik dihitung OTOMATIS dari KM awal + jarak STA antar titik
                   (jarak koordinat dipakai bila STA tidak terbaca). Arah KM bisa naik / turun.
   • KM yang diisi manual pada satu titik (Edit titik STA → kolom KM) tetap dipakai sebagai patokan:
     titik sesudahnya dilanjutkan dari patokan itu.
   • KM tampil bersama STA di: pemutar rute, panel info & lencana Street View, tooltip titik STA, daftar ruas.
   • Otomatis dihitung ulang setiap data ruas disimpan (titik ditambah/dihapus/STA diubah).
   Data tersimpan di ruas: kmStart (km, desimal) & kmDir ('up' | 'down'). */
(function () {
  'use strict';

  function isNum(v) { return v !== undefined && v !== null && v !== '' && !isNaN(v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function note(m, err) { try { if (typeof toast === 'function') toast(m, !!err); } catch (e) {} }
  function fmt(km) { try { return formatKm(km); } catch (e) { return String(km); } }

  /* "12.5" | "12,5" | "12+500" | "12+50" (=12+050) → km (desimal). '' → null. Tidak valid → NaN */
  function parseKm(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    var m = /^(-?\d+)\s*\+\s*(\d{1,3})$/.exec(s);
    if (m) { var k = +m[1], mt = +m[2], neg = m[1].charAt(0) === '-'; return neg ? k - mt / 1000 : k + mt / 1000; }
    s = s.replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }

  function staM(p) { try { var v = parseStaMeters(p && p.sta); return v == null ? null : v; } catch (e) { return null; } }
  /* jarak (km) titik i-1 → i : selisih STA bila terbaca, kalau tidak jarak koordinat */
  function segLen(pts, i) {
    var a = pts[i - 1], b = pts[i], x = staM(a), y = staM(b);
    if (x != null && y != null && x !== y) return Math.abs(y - x) / 1000;
    try { return haversine(a.lat, a.lng, b.lat, b.lng); } catch (e) { return 0; }
  }

  /* Hitung km tiap titik ruas. Murni terhadap objek yang diberikan (tidak menyimpan). true bila ada yang berubah. */
  function apply(road) {
    var pts = road && road.points; if (!pts || !pts.length) return false;
    var ks = isNum(road.kmStart) ? +road.kmStart : null;
    var sign = road.kmDir === 'down' ? -1 : 1;
    var cur = null, changed = false;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (isNum(p.km) && p.kmAuto !== true) { cur = +p.km; continue; }          /* patokan manual */
      if (i === 0) cur = ks;
      else if (cur != null) cur += sign * segLen(pts, i);
      var want = cur == null ? null : +cur.toFixed(3);
      if (want == null) {
        if (p.kmAuto === true) { delete p.km; delete p.kmAuto; changed = true; }
      } else if (p.km !== want || p.kmAuto !== true) { p.km = want; p.kmAuto = true; changed = true; }
    }
    return changed;
  }

  function ptKm(p) { return p && isNum(p.km) ? +p.km : null; }
  /* km di antara titik i dan i+1 (t = 0..1) */
  function interp(road, i, t) {
    var pts = road && road.points; if (!pts) return null;
    var a = ptKm(pts[i]), b = ptKm(pts[i + 1]);
    if (a != null && b != null) return a + (b - a) * t;
    if (a == null && b == null) return null;
    return t < 0.5 ? (a != null ? a : b) : (b != null ? b : a);
  }
  function interpText(road, i, t) { var k = interp(road, i, t); return k == null ? '' : fmt(k); }

  /* km pemutar rute — indeks sama persis dengan staLabelForSegment (mendukung antrean dibalik) */
  function routeKm(e, t, a) {
    try {
      var n = e.road, o = n.points.length, rev = false;
      try { rev = !!(e.queueMode && routeAllQueue && routeAllQueue[routeAllIndex] && routeAllQueue[routeAllIndex].reversed); } catch (x) {}
      var l = rev ? o - 1 - t : t, s = rev ? o - 1 - (t + 1) : t + 1;
      var pa = n.points[Math.max(0, Math.min(o - 1, l))], pb = n.points[Math.max(0, Math.min(o - 1, s))];
      var ka = ptKm(pa), kb = ptKm(pb);
      if (ka != null && kb != null) return ka + (kb - ka) * a;
      return ka != null ? ka : kb;
    } catch (e2) { return null; }
  }
  function routeText(e, t, a) { var k = routeKm(e, t, a); return k == null ? '' : fmt(k); }
  /* untuk pemutar: " • KM 12+048" atau "" */
  function routeSuffix(e, t, a) { var s = routeText(e, t, a); return s ? ' • KM ' + s : ''; }

  function reapplyAll() {
    var any = false;
    try { roads.forEach(function (r) { if (isNum(r.kmStart) && apply(r)) any = true; }); } catch (e) {}
    return any;
  }

  /* ---------- UI: dialog Atur KM ---------- */
  var css = document.createElement('style');
  css.textContent =
    '#pqKmOv{position:fixed;inset:0;z-index:100000;background:rgba(5,8,16,.72);display:flex;align-items:center;justify-content:center;padding:14px}' +
    '#pqKmBox{width:min(440px,100%);max-height:92vh;overflow:auto;background:var(--panel,#0f1626);color:var(--text,#e5e9f5);border:1px solid var(--line,#2a3550);border-radius:14px;padding:16px 16px 14px;box-shadow:0 20px 60px rgba(0,0,0,.6)}' +
    '#pqKmBox h3{margin:0 0 4px;font-size:15px}#pqKmBox .pq-km-sub{margin:0 0 12px;font-size:12px;color:var(--text-dim,#8a96b0)}' +
    '#pqKmBox label{display:block;font-size:12px;font-weight:600;margin:10px 0 5px}' +
    '#pqKmBox input[type=text]{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:9px;border:1px solid var(--line,#2a3550);background:var(--panel-2,rgba(255,255,255,.05));color:inherit;font:600 14px var(--mono,monospace)}' +
    '#pqKmBox .pq-km-seg{display:flex;gap:6px}#pqKmBox .pq-km-seg button{flex:1;padding:8px 6px;border-radius:9px;border:1px solid var(--line,#2a3550);background:transparent;color:inherit;font:600 12px inherit;cursor:pointer}' +
    '#pqKmBox .pq-km-seg button.on{background:var(--cyan-dim,rgba(0,200,255,.18));border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}' +
    '#pqKmPrev{margin-top:12px;padding:9px 10px;border-radius:9px;border:1px dashed var(--line,#2a3550);font:600 12px var(--mono,monospace);line-height:1.6;color:var(--text,#e5e9f5)}' +
    '#pqKmPrev.off{color:var(--text-dim,#8a96b0);font-weight:500}#pqKmPrev .e{color:#f87171}' +
    '#pqKmBox .pq-km-note{font-size:11px;color:var(--text-dim,#8a96b0);margin-top:8px;line-height:1.5}' +
    '#pqKmBox .pq-km-act{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}#pqKmBox .pq-km-act button{flex:1 1 auto;padding:9px 12px;border-radius:9px;border:1px solid var(--line,#2a3550);background:transparent;color:inherit;font:700 12.5px inherit;cursor:pointer}' +
    '#pqKmBox .pq-km-act button.pri{background:var(--cyan,#22d3ee);border-color:var(--cyan,#22d3ee);color:#04121a}' +
    '.pq-km-chip{font:600 10.5px var(--mono,monospace);color:var(--cyan,#22d3ee)}';
  document.head.appendChild(css);

  var cur = null; /* {id, dir} */
  function close() { var o = document.getElementById('pqKmOv'); if (o) o.remove(); cur = null; }

  function preview() {
    var box = document.getElementById('pqKmPrev'); if (!box || !cur) return;
    var road = roads.find(function (r) { return r.id === cur.id; }); if (!road) return;
    var raw = document.getElementById('pqKmIn').value, v = parseKm(raw);
    if (v == null) { box.className = 'off'; box.innerHTML = 'KM kosong → KM <b>tidak ditampilkan</b> (hanya STA).'; return; }
    if (isNaN(v)) { box.className = ''; box.innerHTML = '<span class="e">Format KM tidak dikenali.</span> Contoh: 12.5 atau 12+500'; return; }
    var sim = { points: road.points.map(function (p) { var q = Object.assign({}, p); if (q.kmAuto === true) { delete q.km; delete q.kmAuto; } return q; }), kmStart: v, kmDir: cur.dir };
    apply(sim);
    var pts = sim.points, f = pts[0], l = pts[pts.length - 1], tot = 0;
    for (var i = 1; i < pts.length; i++) tot += segLen(pts, i);
    box.className = '';
    box.innerHTML = 'STA ' + esc(f.sta) + ' → KM <b>' + fmt(ptKm(f)) + '</b><br>STA ' + esc(l.sta) + ' → KM <b>' + (ptKm(l) != null ? fmt(ptKm(l)) : '-') + '</b><br>Panjang ' + tot.toFixed(2) + ' km · ' + pts.length + ' titik';
  }

  function open(id) {
    var road = roads.find(function (r) { return r.id === id; });
    if (!road) return;
    if (!road.points || road.points.length < 1) { note('Ruas belum punya titik STA', true); return; }
    close();
    cur = { id: id, dir: road.kmDir === 'down' ? 'down' : 'up' };
    var ov = document.createElement('div'); ov.id = 'pqKmOv';
    ov.innerHTML =
      '<div id="pqKmBox" role="dialog" aria-modal="true">' +
      '<h3><i class="fa-solid fa-signs-post"></i> Atur KM ruas</h3>' +
      '<p class="pq-km-sub">' + esc(road.name) + '</p>' +
      '<label for="pqKmIn">KM awal (di titik STA pertama)</label>' +
      '<input id="pqKmIn" type="text" inputmode="decimal" autocomplete="off" placeholder="Kosong = tanpa KM. Contoh: 12.5 atau 12+500" value="' + (isNum(road.kmStart) ? esc(fmt(+road.kmStart)) : '') + '">' +
      '<label>Arah KM</label>' +
      '<div class="pq-km-seg"><button type="button" data-d="up">KM naik (searah titik)</button><button type="button" data-d="down">KM turun</button></div>' +
      '<div id="pqKmPrev"></div>' +
      '<div class="pq-km-note">Diisi → KM tiap titik dihitung otomatis dari KM awal + jarak STA, dan tampil di samping STA. ' +
      'Dikosongkan → KM tidak ditampilkan. KM yang Anda isi manual pada satu titik tetap dipakai sebagai patokan untuk titik sesudahnya.</div>' +
      '<div class="pq-km-act"><button type="button" class="pri" data-a="save">Simpan &amp; Hitung</button><button type="button" data-a="clear">Kosongkan KM</button><button type="button" data-a="cancel">Batal</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    function segPaint() { ov.querySelectorAll('.pq-km-seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.d === cur.dir); }); }
    segPaint(); preview();
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.d) { cur.dir = b.dataset.d; segPaint(); preview(); }
      else if (b.dataset.a === 'cancel') close();
      else if (b.dataset.a === 'clear') { document.getElementById('pqKmIn').value = ''; save(true); }
      else if (b.dataset.a === 'save') save(false);
    });
    var inp = document.getElementById('pqKmIn');
    inp.addEventListener('input', preview);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(false); else if (e.key === 'Escape') close(); });
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 30);
  }

  function save(clear) {
    if (!cur) return;
    var road = roads.find(function (r) { return r.id === cur.id; }); if (!road) { close(); return; }
    var v = clear ? null : parseKm(document.getElementById('pqKmIn').value);
    if (v !== null && isNaN(v)) { note('Format KM tidak dikenali. Contoh: 12.5 atau 12+500', true); return; }
    if (v === null) { delete road.kmStart; delete road.kmDir; } else { road.kmStart = +v.toFixed(3); road.kmDir = cur.dir; }
    apply(road);
    try { persist(); } catch (e) {}
    try { if (typeof renderRoadLayer === 'function') renderRoadLayer(road); } catch (e) {}
    try { if (typeof renderRoadList === 'function') renderRoadList(); } catch (e) {}
    var name = road.name;
    close();
    note(v === null ? 'KM ruas "' + name + '" dikosongkan — KM tidak ditampilkan' : 'KM ruas "' + name + '" dihitung otomatis mulai KM ' + fmt(v));
  }

  /* ---------- chip KM di daftar ruas ---------- */
  var busy = false;
  function decorate() {
    if (busy) return; busy = true;
    try {
      document.querySelectorAll('#roadList .road-item').forEach(function (it) {
        var rid = it.dataset.roadId; if (!rid) return;
        var road = roads.find(function (r) { return r.id === rid; }); if (!road) return;
        var info = it.querySelector('.road-info'); if (!info) return;
        var chip = info.querySelector('.pq-km-chip'), pts = road.points || [];
        var f = ptKm(pts[0]), l = ptKm(pts[pts.length - 1]);
        if (f == null && l == null) { if (chip) chip.parentNode.removeChild(chip); return; }
        var html = '<i class="fa-solid fa-signs-post"></i> KM ' + (f != null ? fmt(f) : '-') + ' → ' + (l != null ? fmt(l) : '-');
        if (!chip) { chip = document.createElement('div'); chip.className = 'rm pq-km-chip'; info.appendChild(chip); }
        if (chip.__h !== html) { chip.innerHTML = html; chip.__h = html; }
      });
    } catch (e) {}
    busy = false;
  }

  function init() {
    if (typeof roads === 'undefined' || typeof persist !== 'function') return setTimeout(init, 400);
    /* hitung ulang otomatis tiap data disimpan */
    var orig = window.persist;
    if (!orig.__pqKm) {
      var w = function () { reapplyAll(); return orig.apply(this, arguments); };
      w.__pqKm = 1; window.persist = w;
    }
    reapplyAll();
    var list = document.getElementById('roadList');
    if (list) { new MutationObserver(function () { decorate(); }).observe(list, { childList: true }); }
    decorate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.PQKm = { open: open, apply: apply, parse: parseKm, interp: interp, interpText: interpText, routeKm: routeKm, routeText: routeText, routeSuffix: routeSuffix, reapplyAll: reapplyAll };
})();
