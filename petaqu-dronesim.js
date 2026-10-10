/* ==========================================================================
   PETAQU – SIMULASI TERBANG DRONE (pulang-pergi) + STREET VIEW

   • Tombol drone ✈ di SETIAP ruas (daftar ruas) → membuka simulator untuk ruas itu.
   • Pilih merek/tipe drone dari TERMURAH → TERMAHAL; tiap merek langsung menampilkan waktu
     pulang-pergi, jumlah sortie (baterai 70% pakai, 30% cadangan), kelayakan (RTK/LiDAR/angin/GSD).
   • Simulasi: drone terbang awal → ujung → kembali ke awal di peta (jejak, jangkauan foto/sapuan,
     HUD tinggi-kecepatan-baterai-sortie-jarak) dengan percepatan waktu.
   • Street View ikut bergerak di titik drone (pandangan level jalan, arah mengikuti heading).
   • Mode Balapan: semua merek terbang bersamaan → terlihat mana yang paling cepat selesai.
   • Belum punya alat? cukup simulasi. Sudah punya? Ekspor misi KML / Litchi CSV (pulang-pergi).
   Catatan: harga & spesifikasi = perkiraan; perhitungan memakai perencana misi PQDrone.
   ========================================================================== */
(function () {
  "use strict";
  if (window.PQDroneSim) return;
  var $ = function (id) { return document.getElementById(id); };
  var KURS = 16500;
  function MAPX() { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } }
  function ROADS() { try { return typeof roads !== "undefined" ? roads : (window.roads || []); } catch (e) { return window.roads || []; } }
  function toast_(m, e) { try { if (typeof toast === "function") toast(m, !!e); } catch (x) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f1(v, d) { return (+v).toFixed(d == null ? 1 : d).replace(".", ","); }
  function idr(usd) { var v = usd * KURS; return v >= 1e9 ? (v / 1e9).toFixed(2).replace(".", ",") + " M" : (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(".", ",") + " jt"; }
  function fmtT(s) { s = Math.round(s); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), c = s % 60; return h ? h + "j " + m + "m" : m + "m " + (c < 10 ? "0" : "") + c + "d"; }
  var RAD = Math.PI / 180;
  function mtr(a, b) { var x = (b.lat - a.lat) * RAD, y = (b.lng - a.lng) * RAD, h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(y / 2) * Math.sin(y / 2); return 12742000 * Math.asin(Math.sqrt(h)); }
  function brg(a, b) { var y = Math.sin((b.lng - a.lng) * RAD) * Math.cos(b.lat * RAD), x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lng - a.lng) * RAD); return (Math.atan2(y, x) / RAD + 360) % 360; }

  /* ---------- state ---------- */
  var S = { rid: null, did: "mini4p", tujuan: "ortho", sx: "auto", t: 0, playing: false, race: false, follow: true, sv: true };
  var fc = 0, R = null, rows = [], layer = null, mk = null, trail = null, foot = null, raceMk = [], raf = 0, last = null, svAt = null, svT = 0, panel = null, trailN = 0;

  function loadRoad(id) {
    var r = ROADS().filter(function (x) { return x.id === id; })[0];
    if (!r || !r.points || r.points.length < 2) return null;
    var pts = r.points.map(function (p) { return { lat: +p.lat, lng: +p.lng }; }).filter(function (p) { return isFinite(p.lat) && isFinite(p.lng); }), cum = [0];
    if (pts.length < 2) return null;
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + mtr(pts[i - 1], pts[i]));
    var km0 = 0; for (var k = 0; k < r.points.length && k < cum.length; k++) { var kv = r.points[k] && r.points[k].km; if (kv !== undefined && kv !== null && kv !== "" && !isNaN(kv)) { km0 = kv * 1000 - cum[k]; break; } }
    return { id: id, name: r.name || id, color: r.color || "#22d3ee", pts: pts, cum: cum, L: cum[cum.length - 1] || 1, km0: km0 };
  }
  function at(d) {
    var c = R.cum, lo = 0, hi = c.length - 1; d = Math.max(0, Math.min(R.L, d));
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (c[mid] <= d) lo = mid; else hi = mid; }
    var a = R.pts[lo], b = R.pts[hi], seg = c[hi] - c[lo] || 1, f = (d - c[lo]) / seg;
    return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, hd: brg(a, b) };
  }
  function sta(d) { var v = Math.max(0, Math.round(R.km0 + d)), m = v % 1000; return Math.floor(v / 1000) + "+" + (m < 10 ? "00" : m < 100 ? "0" : "") + m; }
  function dd(s) { return s <= R.L ? s : 2 * R.L - s; }
  function short(n) { return n.replace(/^DJI |^Autel |^Parrot |^AgEagle /, "").split(" ").slice(0, 2).join(" "); }
  function rt(s) { var p = at(s <= R.L ? s : 2 * R.L - s); if (s > R.L) p.hd = (p.hd + 180) % 360; return p; }   /* posisi pulang-pergi */

  /* ---------- metrik tiap drone (memakai perencana misi) ---------- */
  function calc() {
    if (!window.PQDrone || !R) return [];
    var I = { panjang: Math.max(0.05, R.L / 1000), lebar: 24, tujuan: S.tujuan, anggaran: 0, kurs: KURS, angin: 0, pohon: 0 };
    return PQDrone.catalog.map(function (d) {
      var r = PQDrone.plan(d, I), T = 2 * R.L / r.v, use = d.fly * 0.7 * 60;
      return { d: d, r: r, v: r.v, T: T, use: use, sort: Math.ceil(T / use), batt: T / (d.fly * 60) * 100, H: r.H };
    }).sort(function (a, b) { return a.d.p[0] - b.d.p[0]; });
  }
  function cur() { return rows.filter(function (x) { return x.d.id === S.did; })[0] || rows[0]; }
  function speedX() {
    if (S.sx !== "auto") return +S.sx;
    var T = S.race ? Math.max.apply(null, rows.map(function (x) { return x.T; })) : (cur() ? cur().T : 60);
    return Math.max(1, T / 45);
  }

  /* ---------- peta ---------- */
  function clearMap() {
    var M = MAPX(); cancelAnimationFrame(raf); raf = 0; last = null;
    [layer, mk, trail, foot].forEach(function (l) { try { l && M.removeLayer(l); } catch (e) {} });
    raceMk.forEach(function (m) { try { M.removeLayer(m); } catch (e) {} });
    layer = mk = trail = foot = null; raceMk = [];
  }
  var ICON = '<svg viewBox="0 0 40 40" width="40" height="40" style="display:block;filter:drop-shadow(0 2px 3px #000a)"><g stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M20 20L8 8M20 20l12-12M20 20L8 32M20 20l12 12"/></g><g fill="#38bdf8" stroke="#fff" stroke-width="1.6"><circle cx="8" cy="8" r="5.5"/><circle cx="32" cy="8" r="5.5"/><circle cx="8" cy="32" r="5.5"/><circle cx="32" cy="32" r="5.5"/></g><rect x="14.5" y="14.5" width="11" height="11" rx="3.5" fill="#0ea5e9" stroke="#fff" stroke-width="1.6"/><path d="M20 9l3.5 5h-7z" fill="#fde047"/></svg>';
  function buildMap() {
    var M = MAPX(); clearMap(); if (!M || !R) return;
    var ll = R.pts.map(function (p) { return [p.lat, p.lng]; });
    layer = L.polyline(ll, { color: R.color, weight: 4, opacity: .55, dashArray: "8 8", interactive: false }).addTo(M);
    try { M.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 17 }); } catch (e) {}
    var p0 = rt(0);
    if (S.race) {
      raceMk = rows.map(function (x, i) {
        var m = L.circleMarker([p0.lat, p0.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "hsl(" + Math.round(i * 360 / rows.length) + ",85%,58%)", fillOpacity: 1, zIndexOffset: 3000 }).addTo(M);
        m.bindTooltip(short(x.d.n) + "<br>" + f1(x.v) + " m/s · STA " + sta(0), { permanent: true, direction: "top", offset: [0, -6], className: "pqds-tt" });
        return m;
      });
    } else {
      var c = cur();
      trail = L.polyline([[p0.lat, p0.lng]], { color: "#fde047", weight: 4, opacity: .95, interactive: false }).addTo(M); trailN = 0;
      foot = L.circle([p0.lat, p0.lng], { radius: c.r.wf / 2, color: "#34d399", weight: 1, fillColor: "#34d399", fillOpacity: .18, interactive: false }).addTo(M);
      mk = L.marker([p0.lat, p0.lng], { icon: L.divIcon({ className: "", iconSize: [40, 40], iconAnchor: [20, 20], html: '<div id="pqdsIc" style="width:40px;height:40px">' + ICON + "</div>" }), zIndexOffset: 5000, interactive: false }).addTo(M);
      mk.bindTooltip(f1(c.v) + " m/s · STA " + sta(0), { permanent: true, direction: "right", offset: [18, 0], className: "pqds-tt" });
    }
  }

  /* ---------- loop simulasi ---------- */
  function frame() {
    var M = MAPX(), L2 = 2 * R.L, c = cur(), done = false, p; fc++;
    if (S.race) {
      var all = true;
      rows.forEach(function (x, i) { var s = Math.min(L2, x.v * S.t); p = rt(s); raceMk[i].setLatLng([p.lat, p.lng]); x.sta = sta(dd(s)); if (fc % 4 === 0) raceMk[i].setTooltipContent(esc(short(x.d.n)) + "<br>" + f1(x.v) + " m/s · STA " + x.sta); if (s < L2) all = false; x.fin = s >= L2 ? Math.min(S.t, x.T) : null; });
      done = all; hud(null); raceBoard();
      if (S.follow) { var mx = Math.max.apply(null, rows.map(function (x) { return Math.min(L2, x.v * S.t); })); p = rt(mx); M.panTo([p.lat, p.lng], { animate: false }); }
    } else {
      var s = Math.min(L2, c.v * S.t); p = rt(s); done = s >= L2;
      mk.setLatLng([p.lat, p.lng]); foot.setLatLng([p.lat, p.lng]); if (fc % 3 === 0) mk.setTooltipContent(f1(c.v) + " m/s · STA " + sta(dd(s)));
      var ic = $("pqdsIc"); if (ic) ic.style.transform = "rotate(" + p.hd.toFixed(0) + "deg)";
      if (++trailN % 3 === 0 || done) trail.addLatLng([p.lat, p.lng]);
      if (S.follow) M.panTo([p.lat, p.lng], { animate: false });
      hud({ s: s, p: p, c: c }); svSync(p, done);
    }
    if (done) { S.playing = false; setPlayBtn(); var b = $("pqdsHud"); if (b) b.insertAdjacentHTML("beforeend", '<div class="ok">✔ Selesai pulang-pergi — ' + (S.race ? "balapan tuntas" : fmtT(c.T) + ", " + c.sort + " sortie") + "</div>"); }
  }
  function tick(ts) {
    if (!S.playing) { last = null; return; }
    if (last == null) last = ts; var dt = Math.min(0.1, (ts - last) / 1000); last = ts; S.t += dt * speedX();
    try { frame(); } catch (e) { S.playing = false; setPlayBtn(); }
    if (S.playing) raf = requestAnimationFrame(tick);
  }
  function play() { if (!R) return; if (!raf && !S.playing) { var done = S.race ? S.t >= Math.max.apply(null, rows.map(function (x) { return x.T; })) : S.t >= cur().T; if (done) reset(); } S.playing = true; setPlayBtn(); cancelAnimationFrame(raf); last = null; raf = requestAnimationFrame(tick); }
  function pause() { S.playing = false; setPlayBtn(); }
  function reset() { S.playing = false; S.t = 0; cancelAnimationFrame(raf); raf = 0; buildMap(); setPlayBtn(); hud(null); svAt = null; var b = $("pqdsRace"); if (b) b.innerHTML = ""; if (!S.race) { var p = rt(0); svSync(p, false, true); } }
  function setPlayBtn() { var b = $("pqdsPlay"); if (b) b.innerHTML = '<i class="fa-solid ' + (S.playing ? "fa-pause" : "fa-play") + '"></i>'; }

  /* ---------- Street View (embed tanpa kunci) ---------- */
  function svSync(p, force, first) {
    var f = $("pqdsSv"); if (!f || !S.sv || S.race || S.min) return; var now = Date.now();
    if (!first && !force && svAt && now - svT < 2500 && mtr(svAt, p) < 40) return;
    if (!first && svAt && now - svT < 1200 && !force) return;
    svAt = { lat: p.lat, lng: p.lng }; svT = now;
    f.src = "https://www.google.com/maps?layer=c&cbll=" + p.lat.toFixed(6) + "," + p.lng.toFixed(6) + "&cbp=12," + Math.round(p.hd) + ",,0,0&output=svembed";
  }

  /* ---------- HUD ---------- */
  function hud(o) {
    var e = $("pqdsHud"); if (!e) return;
    if (S.race) { e.innerHTML = '<div class="g"><span><i>waktu</i> ' + fmtT(S.t) + '</span><span><i>percepatan</i> ×' + Math.round(speedX()) + '</span><span><i>jarak</i> ' + f1(2 * R.L / 1000, 2) + ' km pulang-pergi</span></div>'; return; }
    var c = cur(); if (!c) return;
    var s = o ? o.s : 0, hd = o ? o.p.hd : 0, tt = Math.min(S.t, c.T), cyc = Math.min(c.sort - 1, Math.floor(tt / c.use)), bt = Math.max(0, 100 - (tt - cyc * c.use) / (c.d.fly * 60) * 100);
    e.innerHTML = '<div class="g"><span><i>tinggi</i> ' + Math.round(c.H) + ' m</span><span><i>kec.</i> ' + f1(c.v) + ' m/s</span><span><i>STA</i> ' + sta(dd(s)) + '</span><span><i>arah</i> ' + Math.round(hd) + '°</span><span><i>' + (s <= R.L ? "pergi" : "pulang") + '</i> ' + f1((s <= R.L ? s : 2 * R.L - s) / 1000, 2) + ' km</span><span><i>waktu</i> ' + fmtT(tt) + ' / ' + fmtT(c.T) + '</span><span><i>sortie</i> ' + (cyc + 1) + '/' + c.sort + '</span><span><i>×</i>' + Math.round(speedX()) + '</span></div>' +
      '<div class="bar"><div style="width:' + bt.toFixed(0) + '%;background:' + (bt < 30 ? "#f87171" : bt < 50 ? "#fde047" : "#34d399") + '"></div></div><div class="sub">Baterai ' + Math.round(bt) + '%' + (bt <= 30 ? " — ⚠ ganti baterai (cadangan 30%)" : "") + '</div>';
  }
  function raceBoard() {
    var e = $("pqdsRace"); if (!e) return;
    var o = rows.slice().sort(function (a, b) { return (a.fin == null ? 1e12 : a.fin) - (b.fin == null ? 1e12 : b.fin) || a.d.p[0] - b.d.p[0]; }), n = 0;
    e.innerHTML = o.map(function (x) { var i = rows.indexOf(x); return '<div class="rr"><span style="color:hsl(' + Math.round(i * 360 / rows.length) + ',85%,62%)">●</span> ' + (x.fin != null ? "🏁 " + (++n) + ". " : "") + esc(x.d.n) + ' <span class="sub">' + f1(x.v) + ' m/s · STA ' + (x.sta || sta(0)) + '</span><b>' + (x.fin != null ? fmtT(x.fin) : fmtT(x.T)) + "</b></div>"; }).join("");
  }

  /* ---------- ekspor misi ---------- */
  function dl(name, text, type) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function wps(max) {
    var L2 = 2 * R.L, n = Math.max(2, Math.min(max, Math.ceil(L2 / 40) + 1)), o = [];
    for (var i = 0; i < n; i++) o.push(rt(L2 * i / (n - 1)));
    return o;
  }
  function expKml() {
    var c = cur(), w = wps(400), co = w.map(function (p) { return p.lng.toFixed(6) + "," + p.lat.toFixed(6) + "," + Math.round(c.H); }).join(" ");
    dl("misi-drone-" + R.name.replace(/[^\w]+/g, "_") + ".kml", '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + esc(R.name) + " – " + esc(c.d.n) + "</name><Placemark><name>Misi pulang-pergi (" + Math.round(c.H) + " m AGL)</name><Style><LineStyle><color>ff00ffff</color><width>3</width></LineStyle></Style><LineString><altitudeMode>relativeToGround</altitudeMode><coordinates>" + co + "</coordinates></LineString></Placemark></Document></kml>", "application/vnd.google-earth.kml+xml");
  }
  function expLitchi() {
    var c = cur(), P = PQDrone.purposes[S.tujuan] || {}, hf = c.r.gsd / 100 * c.d.h, dist = Math.max(3, hf * (1 - (P.fwd || .8))), w = wps(99), pitch = /visual|jembatan/.test(S.tujuan) ? -45 : -90;
    var h = "latitude,longitude,altitude(m),heading(deg),curvesize(m),rotationdir,gimbalmode,gimbalpitchangle,actiontype1,actionparam1,altitudemode,speed(m/s),poi_latitude,poi_longitude,poi_altitude(m),poi_altitudemode,photo_timeinterval,photo_distinterval\n";
    dl("litchi-" + R.name.replace(/[^\w]+/g, "_") + ".csv", h + w.map(function (p) { return [p.lat.toFixed(7), p.lng.toFixed(7), Math.round(c.H), Math.round(p.hd), 0, 0, 2, pitch, 1, 0, 0, f1(c.v, 1).replace(",", "."), 0, 0, 0, 0, -1, dist.toFixed(1)].join(","); }).join("\n"), "text/csv");
    toast_("CSV Litchi diekspor (maks. 99 titik; ruas panjang sebaiknya dibagi per sortie)");
  }

  /* ---------- panel ---------- */
  function css() {
    if ($("pqdsCss")) return; var s = document.createElement("style"); s.id = "pqdsCss";
    s.textContent = "#pqDS{position:fixed;right:10px;top:70px;width:min(410px,calc(100vw - 20px));max-height:calc(100dvh - 90px);overflow:auto;overscroll-behavior:contain;z-index:1280;display:none;box-sizing:border-box;padding:10px;border-radius:14px;border:1px solid #38bdf866;background:#07111cf5;color:#e6edf5;font:12px/1.4 system-ui,sans-serif;box-shadow:0 12px 36px #000b}#pqDS.show{display:block}" +
      "@media(max-width:860px){#pqDS{left:0;right:0;top:auto;bottom:0;width:auto;max-height:64dvh;border-radius:16px 16px 0 0}}" +
      "#pqDS h3{margin:0 0 6px;font-size:14px;color:#38bdf8;display:flex;justify-content:space-between;align-items:center;gap:6px}#pqDS .x{background:#ffffff14;border:1px solid #ffffff25;color:#fff;border-radius:8px;padding:3px 9px;cursor:pointer}" +
      "#pqDS select{width:100%;box-sizing:border-box;margin:2px 0 6px;background:#0b1520;border:1px solid #ffffff2a;border-radius:7px;color:#e6edf5;padding:5px;font:inherit}#pqDS .sub{color:#8aa4bd;font-size:11px}" +
      "#pqDS .tb{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:6px}#pqDS .tb>.body{display:contents}#pqDS .tb .sp{flex:1}#pqDS .ib{width:34px;height:34px;border-radius:50%;border:1px solid #38bdf855;background:#0b1520;color:#7dd3fc;font-size:14px;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center}#pqDS .ib:hover{background:#0e7490;color:#fff}#pqDS .ib.on{background:#0e7490;color:#fff;border-color:#22d3ee}#pqDS #pqdsPlay{background:#0284c7;color:#fff}" +
      "#pqDS.min{left:auto;right:10px;top:70px;bottom:auto;width:auto;max-width:calc(100vw - 20px);padding:6px 8px;border-radius:22px;background:#07111ccc}#pqDS.min .body,#pqDS.min .tb .body{display:none}#pqDS.min .tb{margin:0;flex-wrap:nowrap}#pqDS.min #pqdsHud .bar,#pqDS.min #pqdsHud .sub,#pqDS.min #pqdsHud .ok{display:none}#pqDS.min #pqdsHud .g{font-size:11px;margin-top:4px;justify-content:center}#pqDS.min #pqdsHud .g span:nth-child(n+4){display:none}" +
      "#pqDS .row2{display:grid;grid-template-columns:1fr 1fr;gap:6px}#pqDS .bt{background:#0284c7;color:#fff;border:0;border-radius:8px;padding:7px 6px;font:700 12px system-ui;cursor:pointer}#pqDS .bt.g{background:#ffffff1a;border:1px solid #ffffff30}#pqDS .bt.on{background:#16a34a}" +
      "#pqDS .ls{max-height:210px;overflow:auto;margin:6px 0;border:1px solid #ffffff18;border-radius:10px}#pqDS .dr{display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid #ffffff10;cursor:pointer}#pqDS .dr:hover{background:#38bdf814}#pqDS .dr.sel{background:#0e749088}#pqDS .dr.x{opacity:.55}" +
      "#pqDS .dr .n{flex:1;min-width:0}#pqDS .dr .n b{display:block;font-size:12px}#pqDS .dr .m{text-align:right;font-variant-numeric:tabular-nums;color:#cfe0f0;font-size:11px;white-space:nowrap}#pqDS .dr .pz{color:#fde68a}" +
      "#pqDS .g{display:flex;flex-wrap:wrap;gap:3px 11px;color:#cfe0f0}#pqDS .g i{font-style:normal;color:#8aa4bd}#pqDS .bar{height:7px;background:#ffffff18;border-radius:5px;overflow:hidden;margin:5px 0 2px}#pqDS .bar div{height:100%}" +
      "#pqDS .ok{color:#6ee7b7;margin-top:4px}#pqDS .wn{color:#fde68a}#pqDS .er{color:#fca5a5}#pqDS iframe{width:100%;height:190px;border:0;border-radius:10px;background:#000;margin-top:6px}#pqDS .rr{display:flex;gap:5px;padding:2px 0}#pqDS .rr b{margin-left:auto}" +
      ".pqds-tt{background:#0a0e17f0!important;color:#fff!important;border:1px solid #fff5!important;padding:1px 5px!important;font:700 10px system-ui!important}.pqds-tt:before{display:none!important}" +
      ".rowbtn-drone{color:#38bdf8!important}";
    document.head.appendChild(s);
  }
  function ib(id, ic, t, on) { return '<button class="ib' + (on ? " on" : "") + '" id="' + id + '" title="' + t + '" aria-label="' + t + '"><i class="fa-solid ' + ic + '"></i></button>'; }
  function draw() {
    if (!panel) return; var road = ROADS().filter(function (r) { return r.points && r.points.length >= 2; }), P = PQDrone.purposes;
    panel.classList.toggle("min", !!S.min);
    var h = '<div class="tb">' + ib("pqdsPlay", "fa-play", "Terbang / jeda") + ib("pqdsReset", "fa-rotate-left", "Ulang dari awal") + ib("pqdsRc", "fa-flag-checkered", "Balapan semua merek", S.race) + ib("pqdsFl", "fa-location-crosshairs", "Kamera ikut drone", S.follow) + ib("pqdsSvb", "fa-street-view", "Street View di titik drone", S.sv) + ib("pqdsSvF", "fa-up-right-from-square", "Street View penuh di titik ini") +
      '<span class="body">' + ib("pqdsPl", "fa-calculator", "Perencana misi & biaya") + ib("pqdsKml", "fa-globe", "Ekspor misi KML (Google Earth)") + ib("pqdsLit", "fa-file-csv", "Ekspor misi CSV Litchi") + "</span>" +
      '<span class="sp"></span>' + ib("pqdsMin", S.min ? "fa-expand" : "fa-window-minimize", S.min ? "Perbesar panel" : "Kecilkan panel (lihat peta)") + ib("pqdsX", "fa-xmark", "Tutup") + "</div>" +
      '<div id="pqdsHud"></div><div class="body">' +
      '<select id="pqdsRoad">' + road.map(function (r) { var l = 0; for (var i = 1; i < r.points.length; i++) l += mtr(r.points[i - 1], r.points[i]); return '<option value="' + esc(r.id) + '"' + (r.id === S.rid ? " selected" : "") + ">" + esc(r.name) + " · " + f1(l / 1000, 2) + " km</option>"; }).join("") + "</select>" +
      '<select id="pqdsTj">' + Object.keys(P).map(function (k) { return '<option value="' + k + '"' + (k === S.tujuan ? " selected" : "") + ">" + esc(P[k].t) + "</option>"; }).join("") + "</select>" +
      '<select id="pqdsSx" title="Percepatan waktu"><option value="auto">Kecepatan: otomatis (±45 dtk)</option><option value="1">×1 (waktu nyata)</option><option value="10">×10</option><option value="60">×60</option><option value="300">×300</option></select>' +
      '<div class="sub">Drone termurah → termahal. Simulasi = belum perlu punya alat. Rute pulang-pergi ' + f1(2 * R.L / 1000, 2) + ' km.</div><div class="ls">' +
      rows.map(function (x) { var st = x.r.st; return '<div class="dr ' + (x.d.id === S.did ? "sel " : "") + (st === "x" ? "x" : "") + '" data-id="' + x.d.id + '" title="' + esc((x.r.fail.concat(x.r.warn)).join("; ")) + '"><span>' + (st === "ok" ? "✔" : st === "w" ? "⚠" : "✖") + '</span><div class="n"><b>' + esc(x.d.n) + '</b><span class="sub">' + esc(x.d.tier) + " · " + x.d.fly + " mnt · " + f1(x.v) + " m/s (" + Math.round(x.v * 3.6) + " km/j)</span></div><div class='m'><span class='pz'>Rp " + idr(x.d.p[0]) + "–" + idr(x.d.p[1]) + "</span><br>" + fmtT(x.T) + " · " + x.sort + " sortie</div></div>"; }).join("") + "</div>" +
      '<div id="pqdsRace"></div>' +
      (S.sv && !S.race ? '<iframe id="pqdsSv" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe><div class="sub">Street View = pandangan level jalan di titik drone (arah mengikuti heading).</div>' : "") +
      '<div class="sub" style="margin-top:6px">' + (R.L > 500 ? "⚠ Ruas > 500 m: melampaui jarak pandang (VLOS) — perlu pengamat/pindah titik lepas-landas per sortie. " : "") + "Ikon atas: 🧮 perencana biaya · 🌐 KML · CSV Litchi untuk drone Anda. Harga & spesifikasi perkiraan; patuhi izin & batas tinggi 120 m.</div></div>";
    panel.innerHTML = h; bind(); setPlayBtn(); hud(null); if (S.race) raceBoard();
  }
  function bind() {
    var g = function (id, f) { var e = $(id); if (e) e.onclick = f; };
    g("pqdsX", close); g("pqdsMin", function () { S.min = !S.min; draw(); if (S.sv && !S.min && !S.race) svSync(rt(Math.min(2 * R.L, cur().v * S.t)), true, true); }); g("pqdsPlay", function () { S.playing ? pause() : play(); }); g("pqdsReset", reset);
    g("pqdsRc", function () { S.race = !S.race; S.t = 0; reset(); draw(); });
    g("pqdsFl", function () { S.follow = !S.follow; draw(); }); g("pqdsSvb", function () { S.sv = !S.sv; draw(); if (S.sv) svSync(rt(Math.min(2 * R.L, cur().v * S.t)), true, true); });
    g("pqdsSvF", function () { var p = rt(Math.min(2 * R.L, cur().v * S.t)); pause(); if (window.openStreetViewForGeoResult) openStreetViewForGeoResult(p.lat, p.lng, R.name + " (drone)"); });
    g("pqdsPl", function () { if (window.PQDrone) PQDrone.open({ panjang: R.L / 1000, tujuan: S.tujuan }); });
    g("pqdsKml", expKml); g("pqdsLit", expLitchi);
    var sx = $("pqdsSx"); if (sx) { sx.value = S.sx; sx.onchange = function () { S.sx = this.value; hud(null); }; }
    var rd = $("pqdsRoad"); if (rd) rd.onchange = function () { open_(this.value, true); };
    var tj = $("pqdsTj"); if (tj) tj.onchange = function () { S.tujuan = this.value; rows = calc(); S.t = 0; reset(); draw(); };
    Array.prototype.forEach.call(panel.querySelectorAll(".dr"), function (e) { e.onclick = function () { S.did = e.getAttribute("data-id"); S.race = false; S.t = 0; reset(); draw(); svSync(rt(0), true, true); }; });
  }
  function ensure() {
    css(); if (panel) return;
    panel = document.createElement("div"); panel.id = "pqDS"; document.body.appendChild(panel);
    try { L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel); } catch (e) {}
  }
  function open_(rid, keep) {
    if (!window.PQDrone || typeof L === "undefined") { toast_("Modul drone belum siap", true); return; }
    if (!rid) { var v = ROADS().filter(function (r) { return r.visible && r.points && r.points.length >= 2; })[0] || ROADS().filter(function (r) { return r.points && r.points.length >= 2; })[0]; rid = v && v.id; }
    var r = rid && loadRoad(rid); if (!r) { toast_("Pilih ruas dengan minimal 2 titik STA untuk simulasi drone", true); return; }
    ensure(); R = r; S.rid = rid; S.t = 0; S.playing = false; svAt = null; rows = calc();
    if (!rows.some(function (x) { return x.d.id === S.did; })) S.did = rows[0].d.id;
    try { if (window.innerWidth <= 860 && typeof toggleSidebar === "function") toggleSidebar(false); } catch (e) {}
    draw(); panel.classList.add("show"); buildMap(); svSync(rt(0), true, true);
  }
  function close() { pause(); clearMap(); if (panel) panel.classList.remove("show"); R = null; }

  /* ---------- tombol drone di setiap ruas + item folder ---------- */
  function addRowBtns() {
    Array.prototype.forEach.call(document.querySelectorAll(".road-item"), function (it) {
      var a = it.querySelector(".road-item-actions"); if (!a || a.querySelector(".rowbtn-drone")) return;
      var id = it.getAttribute("data-road-id"); if (!id) return;
      var b = document.createElement("button"); b.className = "rowbtn rowbtn-drone"; b.title = "Drone: terbangkan / simulasikan di ruas ini (pulang-pergi + Street View)";
      b.innerHTML = '<i class="fa-solid fa-plane"></i>'; b.onclick = function (e) { e.stopPropagation(); open_(id); };
      var pl = a.querySelector(".rowbtn-play"); pl ? pl.insertAdjacentElement("afterend", b) : a.insertBefore(b, a.firstChild);
    });
  }
  function dock() {
    var b = document.createElement("button"); b.type = "button"; b.innerHTML = '<i class="fa-solid fa-plane-departure"></i>'; b.onclick = function () { open_(); };
    var n = 0, iv = setInterval(function () { if (window.PQ_DOCK && PQ_DOCK.adopt) { clearInterval(iv); PQ_DOCK.adopt(b, "Simulasi terbang drone"); } else if (++n > 60) clearInterval(iv); }, 250);
  }
  function init() { css(); dock(); setInterval(addRowBtns, 900); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.PQDroneSim = { open: open_, close: close, play: play, pause: pause };
})();
