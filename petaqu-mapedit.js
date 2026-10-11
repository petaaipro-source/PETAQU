/* PETAQU — Edit STA & KM LANGSUNG di peta (tombol pensil di legenda).
   Aktif → klik titik STA / garis ruas / patok KM di peta → kartu edit muncul di tempat:
     • STA titik, KM titik (jadi patokan, titik sesudahnya otomatis mengikuti)
     • KM awal ruas, interval patok (legenda), arah KM
     • Interval STA + "ikuti titik berikutnya" (STA titik sesudahnya dihitung dari titik ini)
     • Saran patok KM terdekat + tombol "Otomatis dari Patok KM"
   Memakai mesin KM milik petaqu-km.js (PQKm) sehingga hasilnya sama di legenda, daftar ruas, peta & pemutar rute. */
(function () {
  'use strict';
  var W = window, on = false, pop = null, ctx = null;
  function isNum(v) { return v !== undefined && v !== null && v !== '' && !isNaN(v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function note(m, e) { try { W.toast && W.toast(m, !!e); } catch (x) {} }
  function fmtKm(v) { try { return W.formatKm(v); } catch (e) { return String(v); } }
  function staM(s) { var m = /^\s*(\d+)\s*\+\s*(\d{1,3})\s*$/.exec(String(s == null ? '' : s)); return m ? +m[1] * 1000 + +m[2] : null; }
  function staF(m) { m = Math.round(m); var neg = m < 0; m = Math.abs(m); return (neg ? '-' : '') + Math.floor(m / 1000) + '+' + String(m % 1000).padStart(3, '0'); }
  function roadsA() { try { return W.roads || (typeof roads !== 'undefined' ? roads : []); } catch (e) { return []; } }
  function layersA() { try { return typeof layers !== 'undefined' ? layers : null; } catch (e) { return null; } }
  function mapA() { try { return typeof map !== 'undefined' ? map : null; } catch (e) { return null; } }

  var css = document.createElement('style');
  css.textContent =
    '#pqMEpop{position:fixed;z-index:100001;width:min(330px,calc(100vw - 20px));max-height:calc(100vh - 24px);overflow:auto;background:#0d1424f7;color:#e5e9f5;border:1px solid #22d3ee66;border-radius:14px;padding:12px 13px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 14px 40px #000a}' +
    '#pqMEpop h4{margin:0 22px 2px 0;font-size:13px}#pqMEpop .sub{color:#8a96b0;font-size:11px;margin-bottom:6px}' +
    '#pqMEpop .x{position:absolute;right:8px;top:6px;background:none;border:0;color:#9fb0c8;font-size:18px;cursor:pointer}' +
    '#pqMEpop .sec{margin-top:9px;padding-top:8px;border-top:1px solid #243049;font-weight:700;color:#22d3ee;font-size:11px;letter-spacing:.02em}' +
    '#pqMEpop .g2{display:grid;grid-template-columns:1fr 1fr;gap:7px}#pqMEpop label{display:block;margin:6px 0 3px;font-size:11px;color:#b6c2d8}' +
    '#pqMEpop input[type=text],#pqMEpop select{width:100%;box-sizing:border-box;padding:7px 8px;border-radius:8px;border:1px solid #2a3550;background:#ffffff0d;color:inherit;font:600 12.5px ui-monospace,monospace}#pqMEpop select{background:#161f33}' +
    '#pqMEpop .ck{display:flex;gap:6px;align-items:center;margin-top:6px;font-size:11.5px;color:#cfd8ea}#pqMEpop .ck input{margin:0}' +
    '#pqMEpop .chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;align-items:center;color:#8a96b0;font-size:11px}' +
    '#pqMEpop .chips button,#pqMEpop .seg button{padding:4px 8px;border-radius:14px;border:1px solid #22d3ee;background:none;color:#22d3ee;font:600 11px ui-monospace,monospace;cursor:pointer}' +
    '#pqMEpop .seg{display:flex;gap:5px}#pqMEpop .seg button{flex:1;border-radius:8px;border-color:#2a3550;color:#b6c2d8}#pqMEpop .seg button.on{border-color:#22d3ee;color:#22d3ee;background:#22d3ee22}' +
    '#pqMEpop .act{display:flex;gap:6px;margin-top:11px;flex-wrap:wrap}#pqMEpop .act button{flex:1 1 auto;padding:8px 10px;border-radius:9px;border:1px solid #2a3550;background:none;color:inherit;font:700 12px system-ui;cursor:pointer}#pqMEpop .act .pri{background:#22d3ee;border-color:#22d3ee;color:#04121a}' +
    '#pqMEpop .prev{margin-top:8px;padding:6px 8px;border:1px dashed #2a3550;border-radius:8px;font:600 11px ui-monospace,monospace;color:#cfe}' +
    '.pqme-on .leaflet-container{cursor:crosshair!important}' +
    '@media(max-width:600px){#pqMEpop{left:8px!important;right:8px;top:auto!important;bottom:8px;width:auto}}';
  document.head.appendChild(css);

  function close() { if (pop) { pop.remove(); pop = null; } ctx = null; }

  /* kandidat terdekat dari klik: titik STA dalam 30 px, atau garis ruas dalam 14 px (→ titik terdekat) */
  function pick(e) {
    var m = mapA(), ly = layersA(); if (!m || !ly) return null;
    var cp = m.mouseEventToContainerPoint(e), best = null;
    roadsA().forEach(function (r) {
      var o = ly[r.id]; if (!o || !o.group || r.visible === false || !m.hasLayer(o.group)) return;
      var P = r.points || [], prev = null;
      P.forEach(function (p, i) {
        if (!isNum(p.lat) || !isNum(p.lng)) return;
        var q = m.latLngToContainerPoint([p.lat, p.lng]), d = Math.hypot(q.x - cp.x, q.y - cp.y);
        if (d <= 30 && (!best || d < best.d)) best = { r: r, i: i, d: d };
        if (prev && prev.q) {                 /* jarak titik klik ke ruas garis */
          var dx = q.x - prev.q.x, dy = q.y - prev.q.y, L2 = dx * dx + dy * dy, t = L2 ? ((cp.x - prev.q.x) * dx + (cp.y - prev.q.y) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
          var ds = Math.hypot(cp.x - (prev.q.x + dx * t), cp.y - (prev.q.y + dy * t));
          if (ds <= 14 && (!best || ds + 8 < best.d)) best = { r: r, i: t < 0.5 ? i - 1 : i, d: ds + 8 };
        }
        prev = { q: q };
      });
    });
    return best;
  }

  function stepGuess(P, i) {
    var d = [];
    for (var j = 1; j < P.length && d.length < 12; j++) { var a = staM(P[j - 1].sta), b = staM(P[j].sta); if (a != null && b != null && a !== b) d.push(b - a); }
    if (!d.length) return { step: 50, sign: 1 };
    d.sort(function (x, y) { return x - y; }); var md = d[d.length >> 1]; return { step: Math.abs(md) || 50, sign: md < 0 ? -1 : 1 };
  }

  function open(r, i, ev) {
    close();
    var P = r.points, p = P[i], sg = stepGuess(P, i), dir = r.kmDir === 'down' ? 'down' : 'up';
    var K = W.PQKm, ser = K && K.series ? K.series(r) : null, kmNow = ser && ser.s.length ? ser.s.filter(function (q) { return Math.abs(q.lat - p.lat) < 1e-9 && Math.abs(q.lng - p.lng) < 1e-9; })[0] : null;
    var kmShow = isNum(p.km) ? +p.km : kmNow ? kmNow.km : null;
    ctx = { r: r, i: i, dir: dir };
    pop = document.createElement('div'); pop.id = 'pqMEpop';
    var near = K && K.nearPatok ? K.nearPatok(p, 3) : [];
    var chips = near.length ? '<div class="chips">Patok terdekat:' + near.map(function (x) { return '<button type="button" data-km="' + x.q.km + '">KM ' + esc(fmtKm(x.q.km)) + ' · ' + Math.round(x.dm) + ' m</button>'; }).join('') + '</div>' : '<div class="chips">Tidak ada patok KM dalam 400 m.</div>';
    pop.innerHTML =
      '<button class="x" type="button" data-a="x" aria-label="Tutup">×</button>' +
      '<h4>' + esc(r.name) + '</h4><div class="sub">Titik ' + (i + 1) + ' dari ' + P.length + (ser && ser.src === 'patok' ? ' · KM otomatis dari patok' : '') + '</div>' +
      '<div class="sec">TITIK INI</div>' +
      '<div class="g2"><div><label>STA titik</label><input type="text" id="meSta" value="' + esc(p.sta || '') + '" placeholder="0+000"></div>' +
      '<div><label>KM titik</label><input type="text" id="meKm" value="' + (kmShow != null ? esc(fmtKm(kmShow)) : '') + '" placeholder="12+500"></div></div>' + chips +
      '<label class="ck"><input type="checkbox" id="meCasSta" checked> STA titik sesudahnya ikut (interval <input type="text" id="meStep" value="' + sg.step + '" style="width:52px;padding:3px 5px"> m)</label>' +
      '<div class="ck" style="color:#8a96b0">KM yang diubah di titik ini jadi patokan — titik sesudahnya otomatis mengikuti.</div>' +
      '<div class="sec">SETTINGAN AWAL RUAS</div>' +
      '<div class="g2"><div><label>KM awal ruas</label><input type="text" id="meKs" value="' + (isNum(r.kmStart) ? esc(fmtKm(+r.kmStart)) : (ser && ser.s.length ? esc(fmtKm(ser.s[0].km)) : '')) + '" placeholder="kosong = tanpa KM"></div>' +
      '<div><label>Interval patok (legenda)</label><select id="meInt"><option value="">Otomatis (zoom)</option>' + [0.1, 0.2, 0.5, 1, 2, 5, 10].map(function (v) { return '<option value="' + v + '"' + (+r.kmStep === v ? ' selected' : '') + '>Tiap ' + String(v).replace('.', ',') + ' km</option>'; }).join('') + '</select></div></div>' +
      '<label>Arah KM</label><div class="seg"><button type="button" data-d="up">KM naik</button><button type="button" data-d="down">KM turun</button></div>' +
      '<div class="act"><button class="pri" type="button" data-a="save">Simpan</button><button type="button" data-a="auto" title="Hitung KM awal dari patok yang menempel di ruas">⚡ Dari patok</button><button type="button" data-a="full" title="Dialog lengkap (STA/KM akhir)">Lengkap…</button></div>';
    document.body.appendChild(pop);
    var vw = innerWidth, vh = innerHeight, x = ev.clientX + 14, y = ev.clientY - 20, w = pop.offsetWidth, h = pop.offsetHeight;
    if (x + w > vw - 8) x = Math.max(8, ev.clientX - w - 14); if (y + h > vh - 8) y = Math.max(8, vh - h - 8); if (y < 8) y = 8;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    function seg() { pop.querySelectorAll('.seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.d === ctx.dir); }); } seg();
    ['mousedown', 'click', 'dblclick', 'touchstart', 'wheel'].forEach(function (t) { pop.addEventListener(t, function (e) { e.stopPropagation(); }); });
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.km) { pop.querySelector('#meKm').value = fmtKm(+b.dataset.km); }
      else if (b.dataset.d) { ctx.dir = b.dataset.d; seg(); }
      else if (b.dataset.a === 'x') close();
      else if (b.dataset.a === 'save') save();
      else if (b.dataset.a === 'full') { var id = r.id; close(); K && K.open(id); }
      else if (b.dataset.a === 'auto') { var rr = r; close(); K && K.adopt(rr); }
    });
    pop.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); else if (e.key === 'Escape') close(); });
  }

  function save() {
    if (!ctx) return; var r = ctx.r, i = ctx.i, P = r.points, p = P[i], K = W.PQKm;
    var q = function (id) { return pop.querySelector(id); };
    /* STA */
    var s = q('#meSta').value.trim(), sm = staM(s);
    if (s && sm == null) { note('Format STA tidak dikenali. Contoh: 1+250', true); return; }
    if (s && staF(sm) !== p.sta) {
      p.sta = staF(sm);
      if (q('#meCasSta').checked) {
        var step = Math.abs(parseFloat(q('#meStep').value.replace(',', '.'))), sg = stepGuess(P, i).sign;
        if (step > 0) for (var j = i + 1; j < P.length; j++) P[j].sta = staF(sm + sg * step * (j - i));
      }
    }
    /* KM */
    var ks = K.parse(q('#meKs').value), kp = K.parse(q('#meKm').value);
    if ((ks !== null && isNaN(ks)) || (kp !== null && isNaN(kp))) { note('Format KM tidak dikenali. Contoh: 12.5 atau 12+500', true); return; }
    var before = K.series(r), kmBefore = before ? (before.s.filter(function (z) { return Math.abs(z.lat - p.lat) < 1e-9 && Math.abs(z.lng - p.lng) < 1e-9; })[0] || {}).km : null;
    var kpChanged = kp !== null && (kmBefore == null || Math.abs(kp - kmBefore) > 0.0004);
    if (ks === null) { delete r.kmStart; delete r.kmEnd; delete r.kmDir; }
    else { r.kmStart = +ks.toFixed(3); r.kmDir = ctx.dir; delete r.kmEnd; }
    if (kpChanged) {
      if (i === 0) { r.kmStart = +kp.toFixed(3); r.kmDir = ctx.dir; delete r.kmEnd; }
      else { p.km = +kp.toFixed(3); delete p.kmAuto; }
    }
    var iv = q('#meInt').value; if (iv) r.kmStep = +iv; else delete r.kmStep;
    K.apply(r);
    try { persist(); } catch (e) {}
    try { if (typeof renderRoadLayer === 'function') renderRoadLayer(r); } catch (e) {}
    try { if (typeof renderRoadList === 'function') renderRoadList(); } catch (e) {}
    try { W.__pqLegenda && W.__pqLegenda.refresh(); } catch (e) {}
    note('Tersimpan — STA/KM "' + r.name + '" diperbarui');
    close();
  }

  function onClick(e) {
    if (!on) return;
    if (e.target.closest && e.target.closest('#pqMEpop,.leaflet-control,#legend,#legendContent,.modal-overlay,#pqKmOv')) return;
    var hit = pick(e); if (!hit) { if (pop) close(); return; }
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    open(hit.r, hit.i, e);
  }

  function set(v) {
    on = !!v; document.body.classList.toggle('pqme-on', on);
    var m = mapA(), c = m && m.getContainer && m.getContainer();
    if (c && !c.__pqme) { c.addEventListener('click', onClick, true); c.__pqme = 1; }
    if (!on) close(); else note('Edit di peta: klik titik STA / garis ruas untuk mengubah STA & KM');
    return on;
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop) close(); });
  W.PQMapEdit = { set: set, isOn: function () { return on; }, open: open, close: close };
  (function init() { if (!mapA()) return setTimeout(init, 500); try { if (localStorage.getItem('pq_lg_edit') === '1') set(true); } catch (e) {} })();
})();
