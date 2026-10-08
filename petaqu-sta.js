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
    document.querySelectorAll('.pq-sta-btn').forEach(function (b) {
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
