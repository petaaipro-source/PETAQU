/* PETAQU — Saklar ON/OFF Titik STA per ruas + mode "STA Otomatis" (pintar).
   - Tombol "STA" di tiap ruas (daftar Ruas): ON = titik STA ruas itu tampil di peta, OFF = disembunyikan
     (garis ruas tetap tampil). Pilihan diingat di perangkat.
   - Bilah "STA Otomatis" di atas daftar ruas:
       * Otomatis ON  : titik STA diatur sendiri mengikuti zoom — makin dekat makin rapat (jarak antar titik
                        dihitung dari jarak asli STA ruas itu), hanya yang masuk layar yang digambar, dan
                        ruas dengan STA OFF tetap tersembunyi. Peta ringan, tidak menumpuk.
       * Otomatis OFF : semua titik STA ruas yang ON tampil penuh seperti biasa.
       * Semua ON / Semua OFF : atur semua ruas sekaligus.
   Tidak mengubah data ruas; hanya menampilkan/menyembunyikan marker STA di peta. */
(function () {
  'use strict';
  var KEY = 'pq_sta_v1';
  var st = { auto: true, off: {} };
  try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { st.auto = s.auto !== false; st.off = s.off || {}; } } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  var css = document.createElement('style');
  css.textContent =
    '.pq-sta-btn{flex-shrink:0;margin-top:1px;margin-right:6px;padding:2px 7px;border-radius:12px;border:1px solid var(--line,#2a3550);background:transparent;color:var(--text-dim,#8a96b0);font:700 10px var(--mono,monospace);cursor:pointer;letter-spacing:.4px;line-height:14px}' +
    '.pq-sta-btn.on{background:var(--cyan-dim,rgba(0,200,255,.18));color:var(--cyan,#22d3ee);border-color:var(--cyan,#22d3ee)}' +
    '.pq-sta-btn:not(.on){text-decoration:line-through;opacity:.75}' +
    '#pqStaBar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0;padding:7px 9px;border:1px solid var(--line,#2a3550);border-radius:10px;background:var(--panel-2,rgba(255,255,255,.04));font:600 11px var(--mono,monospace);color:var(--text,#e5e9f5)}' +
    '#pqStaBar .pq-sta-t{flex:1 1 100%;display:flex;align-items:center;justify-content:space-between;gap:8px}' +
    '#pqStaBar .pq-sta-info{color:var(--text-dim,#8a96b0);font-weight:500;font-size:10px}' +
    '#pqStaBar button.pq-mini{padding:4px 9px;border-radius:8px;border:1px solid var(--line,#2a3550);background:transparent;color:inherit;font:700 10.5px var(--mono,monospace);cursor:pointer}' +
    '#pqStaBar button.pq-mini:active{background:var(--cyan-dim,rgba(0,200,255,.18))}' +
    '#pqStaSw{width:34px;height:19px;border-radius:20px;background:var(--line,#2a3550);position:relative;border:none;cursor:pointer;flex-shrink:0}' +
    '#pqStaSw:after{content:"";position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;top:2px;left:2px;transition:.15s}' +
    '#pqStaSw.on{background:var(--cyan-dim,rgba(0,200,255,.3))}#pqStaSw.on:after{left:17px;background:var(--cyan,#22d3ee)}';
  document.head.appendChild(css);

  function ok() { return typeof map !== 'undefined' && map && typeof roads !== 'undefined' && typeof layers !== 'undefined' && window.L; }
  function note(m) { try { if (typeof toast === 'function') toast(m); } catch (e) {} }

  /* ---- cari marker STA tiap ruas (cache per group) ---- */
  var cache = {};
  function isSta(l) {
    if (l instanceof L.Polyline || l instanceof L.Polygon) return false;
    if (l instanceof L.CircleMarker) return true;
    if (l instanceof L.Marker) {
      var h = l.options && l.options.icon && l.options.icon.options && l.options.icon.options.html;
      return typeof h === 'string' && h.indexOf('sta-thumb') > -1;
    }
    return false;
  }
  function staMarkers(id, g) {
    var c = cache[id], n = 0;
    try { n = g.getLayers().length; } catch (e) {}
    if (c && c.g === g && c.n === n) return c;
    var ms = [];
    g.eachLayer(function (l) { if (isSta(l)) ms.push(l); });
    var tot = 0;
    for (var i = 1; i < ms.length; i++) { try { tot += map.distance(ms[i - 1].getLatLng(), ms[i].getLatLng()); } catch (e) {} }
    c = cache[id] = { g: g, n: n, ms: ms, sp: ms.length > 1 ? Math.max(5, tot / (ms.length - 1)) : 50 };
    return c;
  }

  var applying = false, timer = null;
  function apply() {
    if (!ok()) return;
    applying = true;
    var shown = 0, total = 0;
    try {
      var z = map.getZoom(), b = map.getBounds().pad(0.25);
      var mpp = 156543.03 * Math.cos(map.getCenter().lat * Math.PI / 180) / Math.pow(2, z);
      roads.forEach(function (r) {
        var o = layers[r.id]; if (!o || !o.group) return;
        var g = o.group; if (!map.hasLayer(g)) return;
        var c = staMarkers(r.id, g), ms = c.ms, n = ms.length; if (!n) return;
        total += n;
        var on = !st.off[r.id];
        var step = 1;
        if (on && st.auto) step = z < 10 ? 0 : Math.max(1, Math.ceil(26 * mpp / c.sp));
        for (var i = 0; i < n; i++) {
          var m = ms[i], want = on;
          if (on && st.auto) {
            want = step === 0 ? false : (i % step === 0 || i === 0 || i === n - 1);
            if (want) { try { want = b.contains(m.getLatLng()); } catch (e) {} }
          }
          var has = map.hasLayer(m);
          if (want && !has) map.addLayer(m); else if (!want && has) map.removeLayer(m);
          if (want) shown++;
        }
      });
    } catch (e) { console.warn('PETAQU STA:', e); }
    applying = false;
    paint(shown, total);
  }
  function sched() { if (applying) return; clearTimeout(timer); timer = setTimeout(apply, 25); }

  /* ---- UI ---- */
  function paint(shown, total) {
    var sw = document.getElementById('pqStaSw'); if (sw) sw.classList.toggle('on', st.auto);
    var inf = document.getElementById('pqStaInfo');
    if (inf && shown != null) inf.textContent = 'Tampil ' + shown + ' / ' + total + ' titik · zoom ' + (ok() ? map.getZoom() : '-');
    document.querySelectorAll('.pq-sta-btn:not(.pq-sta-nbtn)').forEach(function (b) {
      var on = !st.off[b.dataset.rid]; b.classList.toggle('on', on);
      b.textContent = on ? 'STA ON' : 'STA OFF';
      b.title = on ? 'Titik STA ruas ini tampil — klik untuk menyembunyikan' : 'Titik STA ruas ini disembunyikan — klik untuk menampilkan';
    });
  }
  function setAll(on) {
    st.off = {}; if (!on && typeof roads !== 'undefined') roads.forEach(function (r) { st.off[r.id] = 1; });
    save(); apply(); note(on ? 'Semua titik STA ruas: ON' : 'Semua titik STA ruas: OFF');
  }
  function ensureBar() {
    var list = document.getElementById('roadList');
    if (!list || !list.parentNode || document.getElementById('pqStaBar')) return;
    var bar = document.createElement('div'); bar.id = 'pqStaBar';
    bar.innerHTML = '<div class="pq-sta-t"><span><i class="fa-solid fa-location-dot"></i> STA Otomatis</span><button id="pqStaSw" title="Otomatis: titik STA menyesuaikan zoom &amp; layar"></button></div>' +
      '<button class="pq-mini" data-a="on">Semua ON</button><button class="pq-mini" data-a="off">Semua OFF</button>' +
      '<span class="pq-sta-info" id="pqStaInfo"></span>';
    list.parentNode.insertBefore(bar, list);
    ['click', 'mousedown', 'touchstart'].forEach(function (ev) { bar.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    bar.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.id === 'pqStaSw') { st.auto = !st.auto; save(); apply(); note(st.auto ? 'STA Otomatis ON — titik menyesuaikan zoom' : 'STA Otomatis OFF — titik tampil penuh'); }
      else if (t.dataset.a) setAll(t.dataset.a === 'on');
    });
    paint();
  }
  function decorate() {
    ensureBar();
    document.querySelectorAll('#roadList .road-item').forEach(function (it) {
      if (it.querySelector('.pq-sta-btn')) return;
      var rid = it.dataset.roadId, tg = it.querySelector('.road-toggle'); if (!rid || !tg) return;
      var b = document.createElement('button'); b.className = 'pq-sta-btn'; b.dataset.rid = rid;
      b.addEventListener('click', function (e) {
        e.stopPropagation(); e.preventDefault();
        if (st.off[rid]) delete st.off[rid]; else st.off[rid] = 1;
        save(); apply();
      });
      tg.parentNode.insertBefore(b, tg);
    });
    paint();
  }

  function init() {
    if (!ok()) return setTimeout(init, 400);
    var list = document.getElementById('roadList');
    if (!list) return setTimeout(init, 400);
    new MutationObserver(function () { decorate(); sched(); }).observe(list, { childList: true });
    map.on('zoomend moveend', sched);
    map.on('layeradd', function (e) { if (!applying && e.layer && isSta(e.layer)) sched(); });
    decorate(); apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.PQSta = { state: st, apply: apply, setAll: setAll };
})();

/* ===== STA OTOMATIS — SEMUA JALAN NASIONAL JATENG + DIY =====
   Titik STA dibuat otomatis (tiap 100 m, menyesuaikan zoom) di sepanjang SEMUA ruas Jalan Nasional
   Jawa Tengah & DI Yogyakarta dari data panel "Jalan Nasional". Tiap ruas punya tombol STA ON/OFF
   di daftar panel Jalan Nasional; ada juga saklar Otomatis + Semua ON/OFF. Hanya titik yang masuk layar
   yang digambar (maks. ±1500) sehingga tetap ringan di HP. Menghormati saklar Jalan Nasional & Lintas. */
(function () {
  'use strict';
  var KEY = 'pq_sta_nas_v1', JK = 'petaqu_jalnas_v4';
  var ns = { auto: true, off: {} };
  try { var q = JSON.parse(localStorage.getItem(KEY) || 'null'); if (q) { ns.auto = q.auto !== false; ns.off = q.off || {}; } } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(ns)); } catch (e) {} }
  var $ = function (id) { return document.getElementById(id); };
  var S = null, D = null, grp = null, canvas = null, timer = null, geo = {};
  var MAXN = 1500, STEPS = [100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000];

  function dec(e) {
    var t = 0, n = 0, c = 0, r = [];
    while (t < e.length) {
      var o = 0, u = 0, g;
      do { g = e.charCodeAt(t++) - 63; o |= (g & 31) << u; u += 5; } while (g >= 32);
      n += (o & 1) ? ~(o >> 1) : (o >> 1); o = 0; u = 0;
      do { g = e.charCodeAt(t++) - 63; o |= (g & 31) << u; u += 5; } while (g >= 32);
      c += (o & 1) ? ~(o >> 1) : (o >> 1); r.push([n / 1e5, c / 1e5]);
    }
    return r;
  }
  function hav(a, b) {
    var R = 6371000, d2r = Math.PI / 180, dl = (b[0] - a[0]) * d2r, dg = (b[1] - a[1]) * d2r;
    var x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a[0] * d2r) * Math.cos(b[0] * d2r) * Math.sin(dg / 2) * Math.sin(dg / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function G(i) {            /* geometri ruas (cache): titik, jarak kumulatif, bbox */
    var g = geo[i]; if (g) return g;
    var pts = [];
    D[i][5].forEach(function (s) { dec(s).forEach(function (p) { pts.push(p); }); });
    var cum = [0], la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
    for (var k = 0; k < pts.length; k++) {
      if (k) cum.push(cum[k - 1] + hav(pts[k - 1], pts[k]));
      var p = pts[k]; if (p[0] < la0) la0 = p[0]; if (p[0] > la1) la1 = p[0]; if (p[1] < lo0) lo0 = p[1]; if (p[1] > lo1) lo1 = p[1];
    }
    return (geo[i] = { p: pts, c: cum, len: cum[cum.length - 1] || 0, b: [la0, lo0, la1, lo1] });
  }
  function staTxt(m) { var k = Math.floor(m / 1000), r = Math.round(m - k * 1000); if (r === 1000) { k++; r = 0; } return k + '+' + ('00' + r).slice(-3); }
  function jnState() { try { return JSON.parse(localStorage.getItem(JK) || '{"on":true,"off":{}}') || {}; } catch (e) { return { on: true, off: {} }; } }

  function render() {
    var m = (typeof map !== 'undefined') ? map : window.map;
    if (!m || !D || !window.L) return;
    if (!grp) { grp = L.layerGroup(); canvas = L.canvas({ padding: 0.5 }); }
    grp.clearLayers();
    var js = jnState(), z = m.getZoom();
    var anyOn = js.on !== false;
    if (!anyOn || (ns.auto && z < 9)) { if (m.hasLayer(grp)) m.removeLayer(grp); paintN(0); return; }
    if (!m.hasLayer(grp)) grp.addTo(m);
    var b = m.getBounds().pad(0.2), sw = b.getSouthWest(), ne = b.getNorthEast();
    var mpp = 156543.03 * Math.cos(m.getCenter().lat * Math.PI / 180) / Math.pow(2, z);
    var step = 100;
    if (ns.auto) { var want = 26 * mpp; for (var s = 0; s < STEPS.length; s++) { step = STEPS[s]; if (step >= want) break; } }
    var vis = [], est = 0;
    D.forEach(function (r, i) {
      if (ns.off[i] || (js.off && js.off[r[3]])) return;
      var g = G(i), bb = g.b;
      if (bb[2] < sw.lat || bb[0] > ne.lat || bb[3] < sw.lng || bb[1] > ne.lng) return;
      vis.push(i); est += g.len / step;
    });
    while (est > MAXN * 3 && step < 20000) { var nx = STEPS[STEPS.indexOf(step) + 1]; if (!nx) break; est = est * step / nx; step = nx; }
    var shown = 0, rad = z >= 15 ? 4.5 : z >= 13 ? 3.6 : 2.8, lab = z >= 16;
    var sat = (window.PQ_JN && window.PQ_JN.sat) || S;
    vis.forEach(function (i) {
      var r = D[i], g = G(i), col = sat[r[3]][1], p = g.p, c = g.c, k = 1, T = [];
      for (var t = 0; t < g.len; t += step) T.push(t);
      T.push(g.len);
      T.forEach(function (t) {
        while (k < c.length - 1 && c[k] < t) k++;
        var a = p[k - 1], bq = p[k], seg = c[k] - c[k - 1], f = seg > 0 ? (t - c[k - 1]) / seg : 0;
        if (f < 0) f = 0; if (f > 1) f = 1;
        var la = a[0] + (bq[0] - a[0]) * f, lo = a[1] + (bq[1] - a[1]) * f;
        if (la < sw.lat || la > ne.lat || lo < sw.lng || lo > ne.lng) return;
        if (shown >= MAXN * 1.5) return;
        var mk = L.circleMarker([la, lo], { renderer: canvas, radius: rad, color: col, weight: 2, fillColor: '#0a0e17', fillOpacity: 0.9 });
        var tx = staTxt(t);
        mk.bindPopup('<div class="lp"><b>STA ' + tx + '</b> — ' + String(r[0]).replace(/[&<>"]/g, '') + '<br>No. ' + (r[1] || '-') + ' · ' + (r[4] || '-') + '<br>' +
          la.toFixed(6) + ', ' + lo.toFixed(6) + '<br><small>STA otomatis tiap ' + step + ' m dari awal ruas (panjang geometri ' + (g.len / 1000).toFixed(2) + ' km)</small></div>');
        if (lab && est < 400) mk.bindTooltip(tx, { permanent: true, direction: 'top', offset: [0, -4], className: 'sta-label sta-label-permanent' });
        grp.addLayer(mk); shown++;
      });
    });
    paintN(shown, step);
  }
  function sched() { clearTimeout(timer); timer = setTimeout(render, 140); }

  function paintN(shown, step) {
    var inf = $('pqStaNInfo');
    if (inf) inf.textContent = (shown ? 'Tampil ' + shown + ' titik' + (step ? ' · tiap ' + step + ' m' : '') : 'STA nasional tersembunyi (zoom lebih dekat)') + ' · ' + (D ? D.length : 0) + ' ruas';
    var sw = $('pqStaNSw'); if (sw) sw.classList.toggle('on', ns.auto);
    document.querySelectorAll('.pq-sta-nbtn').forEach(function (b) {
      var on = !ns.off[b.dataset.i]; b.classList.toggle('on', on); b.textContent = on ? 'STA ON' : 'STA OFF';
    });
  }
  function setAllN(on) {
    ns.off = {}; if (!on) D.forEach(function (r, i) { ns.off[i] = 1; });
    save(); render(); try { if (typeof toast === 'function') toast(on ? 'STA Jalan Nasional: Semua ON' : 'STA Jalan Nasional: Semua OFF'); } catch (e) {}
  }
  function decorate() {
    var panel = $('jnPanel'), ch = $('jnChips'); if (!panel || !ch) return;
    if (!$('pqStaNBar')) {
      var bar = document.createElement('div'); bar.id = 'pqStaNBar'; bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0;padding:7px 9px;border:1px solid var(--line,#2a3550);border-radius:10px;background:var(--panel-2,rgba(255,255,255,.04));font:600 11px var(--mono,monospace);color:var(--text,#e5e9f5)';
      bar.innerHTML = '<div style="flex:1 1 100%;display:flex;align-items:center;justify-content:space-between;gap:8px"><span>📍 STA Otomatis</span><button id="pqStaNSw" style="width:34px;height:19px;border-radius:20px;border:none;cursor:pointer;position:relative;flex-shrink:0" class="on"></button></div>' +
        '<button class="pq-mini" data-a="on" style="padding:4px 9px;border-radius:8px;border:1px solid var(--line,#2a3550);background:transparent;color:inherit;font:700 10.5px var(--mono,monospace);cursor:pointer">Semua ON</button>' +
        '<button class="pq-mini" data-a="off" style="padding:4px 9px;border-radius:8px;border:1px solid var(--line,#2a3550);background:transparent;color:inherit;font:700 10.5px var(--mono,monospace);cursor:pointer">Semua OFF</button>' +
        '<span id="pqStaNInfo" style="color:var(--text-dim,#8a96b0);font-weight:500;font-size:10px"></span>';
      ch.parentNode.insertBefore(bar, ch);
      var sw = $('pqStaNSw'); sw.id = 'pqStaNSw';
      var st2 = document.createElement('style');
      st2.textContent = '#pqStaNSw{background:var(--line,#2a3550)}#pqStaNSw:after{content:"";position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;top:2px;left:2px;transition:.15s}#pqStaNSw.on{background:var(--cyan-dim,rgba(0,200,255,.3))}#pqStaNSw.on:after{left:17px;background:var(--cyan,#22d3ee)}';
      document.head.appendChild(st2);
      bar.addEventListener('click', function (e) {
        e.stopPropagation(); var t = e.target.closest('button'); if (!t) return;
        if (t.id === 'pqStaNSw') { ns.auto = !ns.auto; save(); render(); }
        else if (t.dataset.a) setAllN(t.dataset.a === 'on');
      });
    }
    document.querySelectorAll('#jnList .jn-item').forEach(function (it) {
      if (it.querySelector('.pq-sta-nbtn')) return;
      var b = document.createElement('button'); b.className = 'pq-sta-btn pq-sta-nbtn'; b.dataset.i = it.dataset.i;
      b.style.marginLeft = 'auto';
      b.addEventListener('click', function (e) {
        e.stopPropagation(); e.preventDefault();
        if (ns.off[b.dataset.i]) delete ns.off[b.dataset.i]; else ns.off[b.dataset.i] = 1;
        save(); render();
      });
      it.appendChild(b);
    });
    paintN(null);
  }

  function init() {
    var el = $('jn-data'), list = $('jnList');
    var m = (typeof map !== 'undefined') ? map : window.map;
    if (!el || !list || !m || !window.L || !m.getPane) return setTimeout(init, 500);
    try { var j = JSON.parse(el.textContent); S = j.sat; D = j.r; } catch (e) { return; }
    new MutationObserver(decorate).observe(list, { childList: true });
    m.on('zoomend moveend', sched);
    ['jnChips', 'jnToggle', 'jnSearch'].forEach(function (id) { var x = $(id); if (x) ['click', 'change', 'input'].forEach(function (ev) { x.addEventListener(ev, function () { setTimeout(render, 60); }); }); });
    decorate(); render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.PQStaNas = { state: ns, render: render, setAll: setAllN };
})();
