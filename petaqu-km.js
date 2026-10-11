/* PETAQU — KM ruas (manual + otomatis), tampil berdampingan dengan STA.
   Cara kerja:
   • Tiap ruas punya "KM awal" (+ opsional KM akhir, STA awal/akhir, saran dari data Patok KM) (tombol kalkulator di daftar ruas → Atur KM).
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
    /* KM akhir diisi → KM titik tengah diinterpolasi proporsional jarak antara KM awal dan KM akhir */
    var ke = isNum(road.kmEnd) ? +road.kmEnd : null, cum = null;
    if (ks != null && ke != null && pts.length > 1) {
      cum = [0]; for (var j = 1; j < pts.length; j++) cum[j] = cum[j - 1] + segLen(pts, j);
      if (!(cum[pts.length - 1] > 0)) cum = null;
    }
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (isNum(p.km) && p.kmAuto !== true) { cur = +p.km; continue; }          /* patokan manual */
      if (cum) cur = ks + (ke - ks) * cum[i] / cum[pts.length - 1];
      else if (i === 0) cur = ks;
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
    '#pqKmBox select{width:100%;padding:8px;border-radius:9px;border:1px solid var(--line,#2a3550);background:var(--panel-2,#161f33);color:inherit}' +
    '#pqKmBox input[type=text]{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:9px;border:1px solid var(--line,#2a3550);background:var(--panel-2,rgba(255,255,255,.05));color:inherit;font:600 14px var(--mono,monospace)}' +
    '#pqKmBox .pq-km-seg{display:flex;gap:6px}#pqKmBox .pq-km-seg button{flex:1;padding:8px 6px;border-radius:9px;border:1px solid var(--line,#2a3550);background:transparent;color:inherit;font:600 12px inherit;cursor:pointer}' +
    '#pqKmBox .pq-km-seg button.on{background:var(--cyan-dim,rgba(0,200,255,.18));border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}' +
    '#pqKmPrev{margin-top:12px;padding:9px 10px;border-radius:9px;border:1px dashed var(--line,#2a3550);font:600 12px var(--mono,monospace);line-height:1.6;color:var(--text,#e5e9f5)}' +
    '#pqKmPrev.off{color:var(--text-dim,#8a96b0);font-weight:500}#pqKmPrev .e{color:#f87171}' +
    '#pqKmBox .pq-km-note{font-size:11px;color:var(--text-dim,#8a96b0);margin-top:8px;line-height:1.5}' +
    '#pqKmBox .pq-km-act{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}#pqKmBox .pq-km-act button{flex:1 1 auto;padding:9px 12px;border-radius:9px;border:1px solid var(--line,#2a3550);background:transparent;color:inherit;font:700 12.5px inherit;cursor:pointer}' +
    '#pqKmBox .pq-km-act button.pri{background:var(--cyan,#22d3ee);border-color:var(--cyan,#22d3ee);color:#04121a}' +
    '#pqKmBox .pq-km-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}#pqKmBox .opt{font-weight:400;color:var(--text-dim,#8a96b0);font-size:10.5px}' +
    '#pqKmBox .pq-km-ck{display:flex;gap:7px;align-items:center;font-weight:400;font-size:11.5px;margin:6px 0 0}#pqKmBox .pq-km-ck input{width:auto;margin:0}' +
    '#pqKmBox .pq-km-sug{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:6px;font-size:11px}#pqKmBox .pq-km-sug .lb,#pqKmBox .pq-km-sug .none{color:var(--text-dim,#8a96b0)}' +
    '#pqKmBox .pq-km-sug button{padding:4px 8px;border-radius:14px;border:1px solid var(--cyan,#22d3ee);background:transparent;color:var(--cyan,#22d3ee);font:600 11px var(--mono,monospace);cursor:pointer}' +
    '.pq-km-chip{font:600 10.5px var(--mono,monospace);color:var(--cyan,#22d3ee)}';
  document.head.appendChild(css);

  var cur = null; /* {id, dir} */
  function close() { var o = document.getElementById('pqKmOv'); if (o) o.remove(); cur = null; }

  /* ---- data Patok KM (lapisan Patok KM + hasil OCR) → saran KM terdekat. Tidak menduplikasi data: dibaca dari sumber yang sama ---- */
  var PK = null;
  function patok() {
    if (PK) return PK;
    PK = [];
    try {
      var d = JSON.parse(document.getElementById('pk-data').textContent), o = {};
      try { o = JSON.parse(localStorage.getItem('petaqu_kmocr_v1') || '{}') || {}; } catch (e) {}
      d.forEach(function (r) {
        var q = o[r[0] + ',' + r[1] + '|' + r[3]], km = q && isNum(q.km) ? +q.km : parseKm(String(r[2]).replace(/\s/g, ''));
        if (km == null || isNaN(km)) return;
        PK.push({ lat: r[0], lng: r[1], km: km, ruas: r[3], ocr: !!q, flag: q ? 0 : r[9] });
      });
    } catch (e) {}
    return PK;
  }
  function nearPatok(p, n) {
    if (!p) return [];
    var out = [], list = patok();
    for (var i = 0; i < list.length; i++) {
      var q = list[i]; if (q.flag > 2) continue;   /* estimasi geometri bukan patok sungguhan */
      if (Math.abs(q.lat - p.lat) > 0.01 || Math.abs(q.lng - p.lng) > 0.01) continue;
      var dm = 0; try { dm = haversine(p.lat, p.lng, q.lat, q.lng) * 1000; } catch (e) { continue; }
      if (dm <= 400) out.push({ q: q, dm: dm });
    }
    out.sort(function (a, b) { return a.dm - b.dm; });
    return out.slice(0, n || 3);
  }
  function sugHtml(p, tgt) {
    var l = nearPatok(p, 3);
    if (!l.length) return '<div class="pq-km-sug"><span class="none">Tidak ada patok KM dalam 400 m — isi manual.</span></div>';
    return '<div class="pq-km-sug"><span class="lb">Patok terdekat:</span>' + l.map(function (x) {
      return '<button type="button" data-t="' + tgt + '" data-km="' + x.q.km + '" title="' + esc(x.q.ruas) + '">KM ' + esc(fmt(x.q.km)) + ' · ' + Math.round(x.dm) + ' m' + (x.q.ocr ? ' ✓' : '') + '</button>';
    }).join('') + '</div>';
  }


  /* ---------- KM OTOMATIS dari data Patok KM (sumber yang sama dengan lapisan Patok KM → legenda, daftar ruas & peta selaras) ---------- */
  var AUTO = {};
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n % 2 ? a[(n - 1) >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2; }
  function auto(road) {
    var P = (road && road.points || []).filter(function (p) { return isNum(p.lat) && isNum(p.lng); });
    if (P.length < 2) return null;
    var key = road.id + '|' + P.length + '|' + P[0].lat + ',' + P[0].lng + '|' + P[P.length - 1].lat + ',' + P[P.length - 1].lng + '|' + (patok().length);
    if (AUTO[key] !== undefined) return AUTO[key];
    var ky = 110.57, kx = 111.32 * Math.cos(P[0].lat * Math.PI / 180), cum = [0], xs = [], ys = [], mnA = 99, mxA = -99, mnO = 999, mxO = -999;
    P.forEach(function (p, i) {
      xs[i] = p.lng * kx; ys[i] = p.lat * ky;
      if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
      mnA = Math.min(mnA, p.lat); mxA = Math.max(mxA, p.lat); mnO = Math.min(mnO, p.lng); mxO = Math.max(mxO, p.lng);
    });
    var M = 0.0006, an = [];
    patok().forEach(function (q) {
      if (q.flag > 1 || q.lat < mnA - M || q.lat > mxA + M || q.lng < mnO - M || q.lng > mxO + M) return;
      var qx = q.lng * kx, qy = q.lat * ky, best = null;
      for (var i = 1; i < P.length; i++) {
        var dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1], L2 = dx * dx + dy * dy, t = L2 ? ((qx - xs[i - 1]) * dx + (qy - ys[i - 1]) * dy) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        var d = Math.hypot(qx - (xs[i - 1] + dx * t), qy - (ys[i - 1] + dy * t));
        if (!best || d < best.d) best = { d: d, s: cum[i - 1] + t * Math.sqrt(L2) };
      }
      if (best && best.d <= 0.045) an.push({ s: best.s, km: q.km, d: best.d });
    });
    var res = null;
    if (an.length) {
      var bestFit = null;
      [1, -1].forEach(function (dir) {
        var offs = an.map(function (a) { return a.km - dir * a.s; }), med = median(offs), inl = an.filter(function (a, i) { return Math.abs(offs[i] - med) <= 0.3; });
        if (inl.length) { var m2 = median(inl.map(function (a) { return a.km - dir * a.s; })); if (!bestFit || inl.length > bestFit.n) bestFit = { dir: dir, off: m2, n: inl.length }; }
      });
      if (bestFit) {
        var dirW = bestFit.dir;
        if (an.length === 1 || (bestFit.n === 1)) dirW = road.kmDir === 'down' ? -1 : 1, bestFit = { dir: dirW, off: an[0].km - dirW * an[0].s, n: 1 };
        res = { kmStart: +bestFit.off.toFixed(3), dir: bestFit.dir < 0 ? 'down' : 'up', n: bestFit.n, tot: an.length, conf: bestFit.n >= 2 ? 'tinggi' : 'rendah' };
      }
    }
    AUTO[key] = res; return res;
  }
  function copyPts(road) { return (road.points || []).map(function (p) { var q = Object.assign({}, p); if (q.kmAuto === true) { delete q.km; delete q.kmAuto; } return q; }); }
  /* deret KM efektif satu ruas: {s:[{lat,lng,km}], real, src:'manual'|'patok'} atau null (→ pemanggil pakai STA) */
  function series(road) {
    var ps = (road && road.points || []).filter(function (p) { return isNum(p.lat) && isNum(p.lng); });
    if (isNum(road.kmStart) || ps.some(function (p) { return isNum(p.km); })) {
      return { s: ps.filter(function (p) { return isNum(p.km); }).map(function (p) { return { lat: +p.lat, lng: +p.lng, km: +p.km }; }), real: true, src: 'manual' };
    }
    var a = auto(road); if (!a) return null;
    var sim = { points: copyPts(road).filter(function (p) { return isNum(p.lat) && isNum(p.lng); }), kmStart: a.kmStart, kmDir: a.dir };
    if (isNum(road.kmEnd)) sim.kmEnd = +road.kmEnd;
    apply(sim);
    return { s: sim.points.map(function (p) { return { lat: +p.lat, lng: +p.lng, km: +p.km }; }), real: true, src: 'patok', auto: a };
  }
  /* jadikan hasil patok sebagai pengaturan ruas (tersimpan) */
  function adopt(road, silent) {
    var a = auto(road); if (!a) { if (!silent) note('Tidak ada patok KM dalam 45 m dari ruas ini — isi manual.', true); return false; }
    road.kmStart = a.kmStart; road.kmDir = a.dir; delete road.kmEnd; apply(road);
    try { persist(); } catch (e) {}
    try { if (typeof renderRoadLayer === 'function') renderRoadLayer(road); } catch (e) {}
    try { if (typeof renderRoadList === 'function') renderRoadList(); } catch (e) {}
    try { window.__pqLegenda && window.__pqLegenda.refresh(); } catch (e) {}
    if (!silent) note('KM "' + road.name + '" disetel dari ' + a.n + ' patok: KM awal ' + fmt(a.kmStart) + (a.conf === 'rendah' ? ' (1 patok — periksa arah)' : ''));
    return true;
  }
  /* indeks titik terdekat ke koordinat (untuk editor di peta) */
  function nearestIdx(road, lat, lng) {
    var b = -1, bd = 1e9; (road.points || []).forEach(function (p, i) { var d = Math.hypot(p.lat - lat, p.lng - lng); if (d < bd) { bd = d; b = i; } }); return b;
  }

  function simulate(road, v, ke, dir) {
    var sim = { points: road.points.map(function (p) { var q = Object.assign({}, p); if (q.kmAuto === true) { delete q.km; delete q.kmAuto; } return q; }), kmStart: v, kmDir: dir };
    if (ke != null && !isNaN(ke)) sim.kmEnd = ke;
    apply(sim); return sim;
  }
  function preview() {
    var box = document.getElementById('pqKmPrev'); if (!box || !cur) return;
    var road = roads.find(function (r) { return r.id === cur.id; }); if (!road) return;
    var v = parseKm(document.getElementById('pqKmIn').value), ke = parseKm(document.getElementById('pqKmEnd').value);
    if (v == null) { box.className = 'off'; box.innerHTML = 'KM awal kosong → KM <b>tidak ditampilkan</b> (hanya STA).'; return; }
    if (isNaN(v) || isNaN(ke)) { box.className = ''; box.innerHTML = '<span class="e">Format KM tidak dikenali.</span> Contoh: 12.5 atau 12+500'; return; }
    var sim = simulate(road, v, ke, cur.dir), pts = sim.points, f = pts[0], l = pts[pts.length - 1], tot = 0;
    for (var i = 1; i < pts.length; i++) tot += segLen(pts, i);
    var note2 = '';
    if (ke != null) { var sel = Math.abs(ke - v); if (tot > 0 && Math.abs(sel - tot) > Math.max(0.15, tot * 0.15)) note2 = '<br><span class="e">Selisih KM ' + sel.toFixed(2) + ' km ≠ panjang ruas ' + tot.toFixed(2) + ' km — periksa lagi.</span>'; }
    box.className = '';
    box.innerHTML = 'STA ' + esc(document.getElementById('pqStaA').value || f.sta) + ' → KM <b>' + fmt(ptKm(f)) + '</b><br>STA ' + esc(document.getElementById('pqStaB').value || l.sta) + ' → KM <b>' + (ptKm(l) != null ? fmt(ptKm(l)) : '-') + '</b><br>Panjang ' + tot.toFixed(2) + ' km · ' + pts.length + ' titik' + note2;
  }

  function open(id) {
    var road = roads.find(function (r) { return r.id === id; });
    if (!road) return;
    if (!road.points || road.points.length < 1) { note('Ruas belum punya titik STA', true); return; }
    close();
    var P = road.points, F = P[0], L = P[P.length - 1];
    cur = { id: id, dir: road.kmDir === 'down' ? 'down' : 'up' };
    var ov = document.createElement('div'); ov.id = 'pqKmOv';
    function inp(idn, val, ph) { return '<input id="' + idn + '" type="text" inputmode="text" autocomplete="off" placeholder="' + ph + '" value="' + esc(val) + '">'; }
    ov.innerHTML =
      '<div id="pqKmBox" role="dialog" aria-modal="true">' +
      '<h3><i class="fa-solid fa-signs-post"></i> Edit STA &amp; KM ruas</h3>' +
      '<p class="pq-km-sub">' + esc(road.name) + '</p>' +
      '<div class="pq-km-2"><div><label for="pqStaA">STA awal</label>' + inp('pqStaA', F.sta || '', '0+000') + '</div>' +
      '<div><label for="pqStaB">STA akhir</label>' + inp('pqStaB', L.sta || '', '1+250') + '</div></div>' +
      '<label class="pq-km-ck"><input type="checkbox" id="pqStaMid"> Hitung ulang STA titik tengah (proporsional jarak)</label>' +
      '<div class="pq-km-2"><div><label for="pqKmIn">KM awal</label>' + inp('pqKmIn', isNum(road.kmStart) ? fmt(+road.kmStart) : '', 'Kosong = tanpa KM') + '</div>' +
      '<div><label for="pqKmEnd">KM akhir <span class="opt">(opsional)</span></label>' + inp('pqKmEnd', isNum(road.kmEnd) ? fmt(+road.kmEnd) : '', 'Mis. 36+400') + '</div></div>' +
      '<div class="pq-km-sug"><button type="button" data-a="auto" title="Hitung KM awal dari patok yang menempel di ruas">⚡ Otomatis dari Patok KM</button></div><div id="pqKmSugA">' + sugHtml(F, 'pqKmIn') + '</div><div id="pqKmSugB">' + (P.length > 1 ? sugHtml(L, 'pqKmEnd') : '') + '</div>' +
      '<label>Arah KM <span class="opt">(otomatis bila KM akhir diisi)</span></label>' +
      '<div class="pq-km-seg"><button type="button" data-d="up">KM naik (searah titik)</button><button type="button" data-d="down">KM turun</button></div>' +
      '<label for="pqKmStep">Interval patok di peta <span class="opt">(legenda)</span></label>' +
      '<select id="pqKmStep"><option value="">Otomatis (ikut zoom)</option>' + [0.1, 0.2, 0.5, 1, 2, 5, 10].map(function (v) { return '<option value="' + v + '"' + (+road.kmStep === v ? ' selected' : '') + '>Tiap ' + String(v).replace('.', ',') + ' km</option>'; }).join('') + '</select>' +
      '<div id="pqKmPrev"></div>' +
      '<div class="pq-km-note">Sumber KM: ketik manual (12.5 atau 12+500) atau ketuk saran dari data <b>Patok KM</b>. Hanya KM awal → KM titik lain dihitung dari jarak STA. ' +
      'KM awal + akhir → KM titik tengah dibagi proporsional. KM yang diisi manual pada satu titik (Edit Titik STA) tetap jadi patokan.</div>' +
      '<div class="pq-km-act"><button type="button" class="pri" data-a="save">Simpan &amp; Hitung</button><button type="button" data-a="clear">Kosongkan KM</button><button type="button" data-a="cancel">Batal</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    function segPaint() { ov.querySelectorAll('.pq-km-seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.d === cur.dir); }); }
    function autoDir() {
      var v = parseKm(document.getElementById('pqKmIn').value), k = parseKm(document.getElementById('pqKmEnd').value);
      if (v != null && k != null && !isNaN(v) && !isNaN(k) && v !== k) { cur.dir = k > v ? 'up' : 'down'; segPaint(); }
    }
    segPaint(); preview();
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.t) { document.getElementById(b.dataset.t).value = fmt(+b.dataset.km); autoDir(); preview(); }
      else if (b.dataset.d) { cur.dir = b.dataset.d; segPaint(); preview(); }
      else if (b.dataset.a === 'auto') {
        var a = auto(road); if (!a) { note('Tidak ada patok KM dalam 45 m dari ruas ini — isi manual.', true); return; }
        document.getElementById('pqKmIn').value = fmt(a.kmStart); document.getElementById('pqKmEnd').value = ''; cur.dir = a.dir; segPaint(); preview();
        note('Terbaca dari ' + a.n + ' patok' + (a.conf === 'rendah' ? ' (hanya 1 patok — periksa arah)' : ''));
      }
      else if (b.dataset.a === 'cancel') close();
      else if (b.dataset.a === 'clear') { document.getElementById('pqKmIn').value = ''; document.getElementById('pqKmEnd').value = ''; save(true); }
      else if (b.dataset.a === 'save') save(false);
    });
    ['pqKmIn', 'pqKmEnd', 'pqStaA', 'pqStaB'].forEach(function (k) {
      var el = document.getElementById(k);
      el.addEventListener('input', function () { autoDir(); preview(); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(false); else if (e.key === 'Escape') close(); });
    });
    setTimeout(function () { try { document.getElementById('pqKmIn').focus(); } catch (e) {} }, 30);
  }

  function staFmt(m) { try { return formatStaMeters(m); } catch (e) { return String(m); } }
  /* simpan STA awal/akhir (+ opsional sebar titik tengah) */
  function applySta(road) {
    var a = document.getElementById('pqStaA').value.trim(), b = document.getElementById('pqStaB').value.trim(), P = road.points, n = P.length;
    var ma = staM({ sta: a }), mb = staM({ sta: b });
    if ((a && ma == null) || (b && mb == null)) { note('Format STA tidak dikenali. Contoh: 1+250', true); return false; }
    if (a) P[0].sta = staFmt(ma);
    if (b && n > 1) P[n - 1].sta = staFmt(mb);
    if (document.getElementById('pqStaMid').checked && n > 2 && ma != null && mb != null) {
      var cum = [0]; for (var i = 1; i < n; i++) { try { cum[i] = cum[i - 1] + haversine(P[i - 1].lat, P[i - 1].lng, P[i].lat, P[i].lng); } catch (e) { cum[i] = cum[i - 1]; } }
      if (cum[n - 1] > 0) for (var k = 1; k < n - 1; k++) P[k].sta = staFmt(ma + (mb - ma) * cum[k] / cum[n - 1]);
    }
    return true;
  }

  function save(clear) {
    if (!cur) return;
    var road = roads.find(function (r) { return r.id === cur.id; }); if (!road) { close(); return; }
    var v = clear ? null : parseKm(document.getElementById('pqKmIn').value);
    var ke = clear ? null : parseKm(document.getElementById('pqKmEnd').value);
    if ((v !== null && isNaN(v)) || (ke !== null && isNaN(ke))) { note('Format KM tidak dikenali. Contoh: 12.5 atau 12+500', true); return; }
    if (!applySta(road)) return;
    var stp = document.getElementById('pqKmStep'); if (stp && stp.value) road.kmStep = +stp.value; else delete road.kmStep;
    if (v === null) { delete road.kmStart; delete road.kmEnd; delete road.kmDir; }
    else {
      road.kmStart = +v.toFixed(3); road.kmDir = cur.dir;
      if (ke !== null) { road.kmEnd = +ke.toFixed(3); road.kmDir = ke < v ? 'down' : 'up'; } else delete road.kmEnd;
    }
    apply(road);
    try { persist(); } catch (e) {}
    try { if (typeof renderRoadLayer === 'function') renderRoadLayer(road); } catch (e) {}
    try { if (typeof renderRoadList === 'function') renderRoadList(); } catch (e) {}
    var name = road.name;
    close();
    note(v === null ? 'STA ruas "' + name + '" disimpan — KM dikosongkan' : 'STA & KM ruas "' + name + '" disimpan (KM ' + fmt(v) + (ke !== null ? ' → ' + fmt(ke) : '') + ')');
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
        var chip = info.querySelector('.pq-km-chip'), sr = series(road), pts = sr ? sr.s : [];
        var f = pts.length ? pts[0].km : null, l = pts.length ? pts[pts.length - 1].km : null;
        if (f == null && l == null) { if (chip) chip.parentNode.removeChild(chip); return; }
        var html = '<i class="fa-solid fa-signs-post"></i> KM ' + (f != null ? fmt(f) : '-') + ' → ' + (l != null ? fmt(l) : '-') + (sr.src === 'patok' ? ' <span title="Dihitung otomatis dari data Patok KM">≈ patok</span>' : '');
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
      var w = function () { reapplyAll(); var rv = orig.apply(this, arguments); try { clearTimeout(w.__t); w.__t = setTimeout(function () { try { window.__pqLegenda && window.__pqLegenda.refresh(); } catch (e) {} }, 250); } catch (e) {} return rv; };
      w.__pqKm = 1; window.persist = w;
    }
    reapplyAll();
    var list = document.getElementById('roadList');
    if (list) { new MutationObserver(function () { decorate(); }).observe(list, { childList: true }); }
    decorate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.PQKm = { series: series, auto: auto, adopt: adopt, nearestIdx: nearestIdx, patok: patok, nearPatok: nearPatok, open: open, apply: apply, parse: parseKm, interp: interp, interpText: interpText, routeKm: routeKm, routeText: routeText, routeSuffix: routeSuffix, reapplyAll: reapplyAll };
})();
