/* ==========================================================================
   PETAQU — Lalu Lintas Jalan · Nasional · Provinsi · Kabupaten · Kota
   Lapisan jalan diwarnai tingkat kepadatan (lancar → macet parah) untuk SEMUA wilayah Indonesia.
   Cara kerja (jujur): tanpa kunci → ESTIMASI MODEL (bukan data sensor langsung). Dengan kunci TomTom → lapisan
   real-time + kalibrasi otomatis model dari pembacaan langsung.
   • Jalan diambil dari OpenStreetMap (Overpass) sesuai area layar, di-cache; klasifikasi perkiraan:
       motorway/trunk/primary = Nasional · secondary = Provinsi · tertiary/unclassified = Kabupaten (atau Kota bila di dalam
       poligon kota) · residential/tertiary di dalam kota = Kota.
   • Model: profil jam × jenis hari (kerja / akhir pekan-libur / mudik-Nataru, kalender otomatis) × karakter wilayah
       (kepadatan kota, jalur antarkota, wisata dari modul Rawan Macet) × kelas jalan × lajur × simpang per km × hujan
       (Open-Meteo) → kecepatan via kurva volume/kapasitas. Bisa disimulasikan per jam / animasi 24 jam.
   • Klik ruas: kecepatan estimasi, grafik 24 jam, jam terlancar/terpadat, saran rekayasa lalin untuk pekerjaan jalan.
   • Ringkasan area layar: rata-rata kecepatan per kelas, titik terpadat, wilayah (kab/kota) terpadat, ekspor CSV.
   Tidak mengubah modul lain. Terdaftar di menu Folder lewat window.PQ_FOLDER_EXTRA. */
(function () {
  "use strict";
  var W = typeof window !== "undefined" ? window : globalThis;
  if (W.PETAQU_LALIN) return;
  var D = W.document;

  /* ============================ UTIL ============================ */
  var $ = function (id) { return D.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var say = function (m) { try { W.toast(m, 3200); } catch (e) { try { console.log("[lalin]", m); } catch (e2) { } } };
  var lsGet = function (k) { try { return JSON.parse(W.localStorage.getItem(k)); } catch (e) { return null; } };
  var lsSet = function (k, v) { try { W.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  var getMap = function () { try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) { } return W.map && W.map.addLayer ? W.map : null; };
  var pad2 = function (n) { return (n < 10 ? "0" : "") + n; };
  var HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  /* ============================ KONSTANTA MODEL ============================ */
  var CLS = {
    nas: { t: "Nasional", full: "Jalan Nasional", c: "#38bdf8", w: 4.6, ff: 60, load: .95, minZ: 8 },
    prov: { t: "Provinsi", full: "Jalan Provinsi", c: "#a78bfa", w: 3.8, ff: 50, load: .82, minZ: 10 },
    kab: { t: "Kabupaten", full: "Jalan Kabupaten", c: "#34d399", w: 3.2, ff: 40, load: .62, minZ: 11 },
    kota: { t: "Kota", full: "Jalan Kota", c: "#fbbf24", w: 2.8, ff: 30, load: .72, minZ: 13 }
  };
  var CK = ["nas", "prov", "kab", "kota"];
  /* tingkat kepadatan berdasar rasio kecepatan terhadap arus bebas */
  var LV = [
    { n: "Lancar", c: "#22c55e", min: .8 },
    { n: "Ramai lancar", c: "#eab308", min: .6 },
    { n: "Padat", c: "#f97316", min: .4 },
    { n: "Macet", c: "#dc2626", min: .25 },
    { n: "Macet parah", c: "#7f1d1d", min: -1 }
  ];
  var lvOf = function (r) { for (var i = 0; i < LV.length; i++) if (r >= LV[i].min) return i; return 4; };
  /* profil jam (0..23): U=perkotaan, I=antarkota, W=wisata; [hari kerja, akhir pekan/libur/mudik] */
  var SH = {
    U: [[.08, .05, .04, .04, .08, .22, .55, .95, 1, .78, .62, .66, .74, .7, .68, .78, .95, 1, .92, .7, .5, .36, .22, .13],
        [.1, .07, .05, .04, .05, .09, .18, .3, .45, .58, .7, .78, .82, .8, .78, .8, .85, .9, .88, .75, .55, .38, .25, .15]],
    I: [[.28, .24, .22, .22, .3, .45, .6, .7, .75, .72, .7, .72, .75, .74, .72, .74, .8, .85, .78, .65, .55, .45, .38, .32],
        [.35, .3, .28, .3, .4, .55, .7, .82, .9, .95, .95, .92, .9, .9, .92, .95, .98, 1, .95, .85, .7, .6, .5, .42]],
    W: [[.01, .01, .01, .01, .01, .02, .04, .08, .14, .22, .28, .32, .32, .32, .31, .32, .31, .26, .19, .13, .09, .05, .03, .02],
        [.03, .02, .02, .02, .03, .06, .12, .22, .4, .62, .8, .9, .92, .9, .88, .9, .88, .75, .55, .38, .25, .15, .08, .05]]
  };
  var PROF = { kerja: [.7, .3, 0], libur: [.3, .25, .45], mudik: [.2, .65, .15] };
  var KEYS = { kerja: "Hari kerja", libur: "Akhir pekan / libur", mudik: "Mudik / libur panjang (Nataru, Lebaran)" };
  /* kalender (perkiraan; bisa ditimpa manual lewat mode Simulasi) */
  var HOLI = { "2026-12-24": 1, "2026-12-25": 1, "2027-01-01": 1 };
  var MUDIK = [["2026-12-19", "2027-01-03"], ["2027-03-03", "2027-03-17"]];
  var iso = function (d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
  function autoKey(d) {
    var s = iso(d), i;
    for (i = 0; i < MUDIK.length; i++) if (s >= MUDIK[i][0] && s <= MUDIK[i][1]) return "mudik";
    if (HOLI[s] || d.getDay() === 0 || d.getDay() === 6) return "libur";
    return "kerja";
  }

  /* ============================ STATE ============================ */
  var S = { on: false, cls: { nas: true, prov: true, kab: true, kota: true }, mode: "now", key: "kerja", hour: 8, play: false, min: false, live: false, ttKey: "", rain: {}, loadErr: "", busy: false };
  var pref = lsGet("petaqu_lalin_pref"); if (pref) { if (pref.cls) S.cls = Object.assign(S.cls, pref.cls); S.live = !!pref.live; }
  S.ttKey = (function () { try { return W.localStorage.getItem("petaqu_lalin_tt") || ""; } catch (e) { return ""; } })();
  var CAL = lsGet("petaqu_lalin_cal") || {};
  var savePref = function () { lsSet("petaqu_lalin_pref", { cls: S.cls, live: S.live }); };
  var segs = new Map(), groups = {}, loaded = [], seq = 0, rend = null, ttLayer = null, card = null, tmr = null, playT = null, moveT = null, tickT = null, lastQ = "";
  var KABS = null, nodeInfo = new Map();

  /* ============================ KALIBRASI ============================ */
  var band = function (h) { return h >= 5 && h < 10 ? "p" : h >= 10 && h < 16 ? "s" : h >= 16 && h < 20 ? "o" : "m"; };
  var calOf = function (c, h) { var v = CAL[c + "|" + band(h)]; return v == null ? 1 : v; };

  /* ============================ MODEL ESTIMASI ============================ */
  function hourNow() { var d = new Date(); return d.getHours(); }
  function curHour() { return S.mode === "now" ? hourNow() : S.hour; }
  function curKey() { return S.mode === "now" ? autoKey(new Date()) : S.key; }
  var K0 = 1.15; /* skala beban: puncak kota besar → padat/macet, kabupaten → lancar */
  var rainFac = function (mm) { return mm == null || mm < .3 ? 1 : mm < 2 ? 1.06 : mm < 6 ? 1.16 : 1.3; };
  /* g = segmen {c,ff,lf,adj,K}; h jam; key jenis hari; mm hujan (mm/jam) */
  function est(g, h, key, mm, noCal) {
    var K = g.K, t = K && K.t ? K.t : { U: 25, I: 35, W: 15 }, m = K && K.m && K.m[key] != null ? K.m[key] : 30;
    var w = PROF[key] || PROF.kerja, ix = key === "kerja" ? 0 : 1;
    var a = w[0] * t.U, b = w[1] * t.I, c = w[2] * t.W, s = (a + b + c) || 1;
    var sh = (a * SH.U[ix][h] + b * SH.I[ix][h] + c * SH.W[ix][h]) / s;
    var R = .35 + m / 100 * 1.1, rf = rainFac(mm);
    var mu = key === "mudik" && (g.c === "nas" || g.c === "prov") ? 1.2 : 1; /* arus mudik/libur panjang menekan jalan antarkota */
    var x = mu * K0 * CLS[g.c].load * R * sh * g.adj * rf * (noCal ? 1 : calOf(g.c, h));
    var ff = g.ff / Math.sqrt(rf);
    var r = 1 / (1 + .8 * Math.pow(Math.max(x, 0), 3.2));
    return { x: x, r: r, v: ff * r, ff: ff, lv: lvOf(r), rf: rf };
  }
  var rainAt = function (g, h) { if (S.mode !== "now") return 0; var a = rainArr(g.mid); return a ? a[h] : 0; };
  function rainArr(p) { var k = Math.round(p[0] * 2) + "," + Math.round(p[1] * 2), e = S.rain[k]; return e && Date.now() - e.t < 18e5 ? e.a : null; }
  function fetchRain(p) {
    var k = Math.round(p[0] * 2) + "," + Math.round(p[1] * 2), e = S.rain[k]; if (e && Date.now() - e.t < 18e5) return Promise.resolve();
    if (e && e.busy) return Promise.resolve(); S.rain[k] = { t: 0, a: null, busy: true };
    var u = "https://api.open-meteo.com/v1/forecast?latitude=" + p[0].toFixed(3) + "&longitude=" + p[1].toFixed(3) + "&hourly=precipitation&forecast_days=1&timezone=auto";
    return fetch(u).then(function (r) { return r.json(); }).then(function (j) { var a = (j && j.hourly && j.hourly.precipitation) || null; S.rain[k] = { t: Date.now(), a: a && a.length >= 24 ? a.slice(0, 24) : null }; }).catch(function () { S.rain[k] = { t: Date.now() - 12e5, a: null }; });
  }

  /* ============================ WILAYAH (kab/kota) ============================ */
  function pip(r, la, lo) { var c = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var a = r[i], b = r[j]; if ((a[1] > lo) !== (b[1] > lo) && la < (b[0] - a[0]) * (lo - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function kabList() {
    if (KABS) return KABS;
    try { var R = W.PETAQU_RAWAN && W.PETAQU_RAWAN._t; KABS = R ? (R.build() || []) : []; } catch (e) { KABS = []; }
    return KABS;
  }
  function regionOf(la, lo) {
    var L = kabList(), i, j;
    for (i = 0; i < L.length; i++) { var K = L[i], b = K.bb; if (la < b[0] || la > b[2] || lo < b[1] || lo > b[3]) continue; for (j = 0; j < K.rings.length; j++) if (pip(K.rings[j], la, lo)) return K; }
    return null;
  }
  var isKota = function (K) { return !!(K && K.nm && K.nm.t === "k"); };

  /* ============================ AMBIL & KLASIFIKASI JALAN ============================ */
  var OVP = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"], ovpI = 0;
  function overpass(q) {
    /* balapan ke semua server sekaligus; yang pertama berhasil menang, sisanya dibatalkan */
    return new Promise(function (resolve, reject) {
      var left = OVP.length, done = false, acs = [], lastErr = null;
      OVP.forEach(function (url, k) {
        var ac = typeof AbortController !== "undefined" ? new AbortController() : null; acs.push(ac);
        var to = setTimeout(function () { if (ac) ac.abort(); }, 25000);
        fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: ac ? ac.signal : undefined })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(function (j) {
            clearTimeout(to); if (done) return;
            if (!j || !j.elements || (j.remark && /timed out|runtime error|out of memory/i.test(j.remark) && !j.elements.length)) throw new Error("server sibuk");
            done = true; acs.forEach(function (a, n) { if (n !== k && a) { try { a.abort(); } catch (e) { } } }); resolve(j);
          })
          .catch(function (e) { clearTimeout(to); if (done) return; lastErr = e; if (--left === 0) reject(e && e.name === "AbortError" ? new Error("waktu habis") : (lastErr || new Error("jaringan"))); });
      });
    });
  }
  function wantedClasses(z) { return CK.filter(function (c) { return S.cls[c] && z >= CLS[c].minZ; }); }
  /* nilai highway yang diminta per kelas (tertiary hanya diminta sekali: oleh Kabupaten, atau Kota bila Kabupaten mati) */
  function hwValues(c, z) {
    var kabOn = S.cls.kab && z >= CLS.kab.minZ, v = [];
    if (c === "nas") v = ["motorway", "trunk", "primary"];
    else if (c === "prov") v = ["secondary"];
    else if (c === "kab") { v = ["tertiary"]; if (z >= 12) v.push("unclassified"); }
    else if (c === "kota") { if (z >= 14) v.push("residential"); if (!kabOn) { v.push("tertiary"); if (z >= 12) v.push("unclassified"); } }
    return v;
  }
  var lenKm = function (g) { var s = 0; for (var i = 1; i < g.length; i++) s += Math.hypot((g[i].lon - g[i - 1].lon) * Math.cos(g[i].lat * Math.PI / 180) * 111.32, (g[i].lat - g[i - 1].lat) * 110.57); return s; };
  var num = function (v) { var n = parseFloat(String(v || "").replace(/[^0-9.]/g, "")); return isFinite(n) ? n : null; };
  function classify(tags, K) {
    var h = tags.highway, kota = isKota(K);
    if (h === "motorway" || h === "trunk" || h === "primary") return "nas";
    if (h === "secondary") return "prov";
    if (h === "tertiary" || h === "unclassified") return kota ? "kota" : "kab";
    if (h === "residential") return kota ? "kota" : "kab";
    return null;
  }
  function mkSeg(el) {
    var tg = el.tags || {}, geo = el.geometry; if (!geo || geo.length < 2) return null;
    var mi = geo[geo.length >> 1], K = regionOf(mi.lat, mi.lon), c = classify(tg, K); if (!c) return null;
    var km = lenKm(geo), hw = tg.highway;
    /* simpul simpang: simpul bersama dengan jalan bernama/berbeda */
    var nm = tg.name || tg.ref || "", ixc = 0;
    (el.nodes || []).forEach(function (id) { var o = nodeInfo.get(id); if (o === undefined) nodeInfo.set(id, nm); else if (o !== null && o !== nm) { nodeInfo.set(id, null); ixc++; } else if (o === null) ixc++; });
    var step = Math.max(1, Math.ceil(geo.length / 45)), pts = []; for (var i = 0; i < geo.length; i += step) pts.push([geo[i].lat, geo[i].lon]); pts.push([geo[geo.length - 1].lat, geo[geo.length - 1].lon]);
    var ms = num(tg.maxspeed), ff = ms ? clamp(ms * .85, 20, 90) : hw === "motorway" ? 85 : CLS[c].ff;
    if (hw === "trunk" && !ms) ff = 65;
    var ln = num(tg.lanes) || (hw === "motorway" || hw === "trunk" ? 4 : 2); if (tg.oneway === "yes" && num(tg.lanes)) ln *= 2;
    var lf = ln >= 6 ? .62 : ln >= 4 ? .75 : ln === 3 ? .88 : ln <= 1 ? 1.25 : 1;
    var un = /^(unpaved|gravel|dirt|ground|sand|earth|mud|grass)$/.test(tg.surface || "");
    if (un) ff *= .7;
    var g = { id: el.id, c: c, name: tg.name || tg.ref || "(tanpa nama)", ref: tg.ref || "", hw: hw, ln: ln, ms: ms, km: km, pts: pts, mid: [mi.lat, mi.lon], K: K, ixc: ixc, un: un, ff: ff, round: tg.junction === "roundabout", lf: lf };
    g.adj = lf * (hw === "motorway" ? 1 : 1) * (1 + Math.min(.4, (ixc / Math.max(.15, km)) * .035)) * (g.round ? 1.1 : 1) * (un ? 1.1 : 1) * (hw === "motorway" ? .65 : 1);
    return g;
  }
  var RANK = { nas: 0, prov: 1, kab: 2, kota: 3 };
  function ingest(elems) {
    var added = [], out = [];
    elems.forEach(function (e) { if (e.type === "way" && !segs.has(e.id)) out.push(e); });
    if (out.length > 7000) { out.sort(function (a, b) { return (RANK[classify(a.tags || {}, null)] || 0) - (RANK[classify(b.tags || {}, null)] || 0); }); out = out.slice(0, 7000); }
    out.forEach(function (e) { var g = mkSeg(e); if (!g) return; segs.set(g.id, g); added.push(g); });
    return added;
  }
  function viewBox(m) { var b = m.getBounds(); return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]; }
  function covered(bb, vals) {
    for (var i = 0; i < loaded.length; i++) { var L = loaded[i]; if (bb[0] >= L.b[0] && bb[1] >= L.b[1] && bb[2] <= L.b[2] && bb[3] <= L.b[3] && vals.every(function (v) { return L.v.indexOf(v) >= 0; })) return true; }
    return false;
  }
  function ensure() {
    var m = getMap(); if (!m || !S.on) return Promise.resolve();
    var z = Math.round(m.getZoom()), cl = wantedClasses(z), skipped = CK.filter(function (c) { return S.cls[c] && z < CLS[c].minZ; });
    S.hint = skipped.length ? "Zoom lebih dekat untuk: " + skipped.map(function (c) { return CLS[c].t + " (z≥" + CLS[c].minZ + ")"; }).join(", ") : "";
    var vb = viewBox(m), todo = cl.filter(function (c) { var v = hwValues(c, z); return v.length && !covered(vb, v); });
    if (!todo.length) { S.busy = false; status(); return Promise.resolve(); }
    var my = ++seq, pl = (vb[2] - vb[0]) * .15, po = (vb[3] - vb[1]) * .15, bb = [vb[0] - pl, vb[1] - po, vb[2] + pl, vb[3] + po], bs = bb.map(function (x) { return x.toFixed(5); }).join(",");
    S.busy = true; S.loadErr = ""; S.prog = ""; kabList(); status();
    var chain = Promise.resolve(), errs = [];
    todo.forEach(function (c, i) {
      chain = chain.then(function () {
        if (my !== seq) return; var vals = hwValues(c, z);
        S.prog = "Memuat " + CLS[c].full + " (" + (i + 1) + "/" + todo.length + ")…"; status();
        var q = "[out:json][timeout:30];(way[\"highway\"~\"^(" + vals.join("|") + ")$\"](" + bs + "););out geom qt;";
        return overpass(q).then(function (j) {
          if (my !== seq) return;
          if (segs.size > 14000) { clearAll(); loaded = []; nodeInfo = new Map(); }
          var add = ingest(j.elements || []); loaded.push({ b: bb, v: vals }); draw(add); recolor();
        }).catch(function (e) { errs.push(CLS[c].t + " (" + ((e && e.message) || "gagal") + ")"); });
      });
    });
    return chain.then(function () {
      if (my !== seq) return; S.busy = false; S.prog = "";
      S.loadErr = errs.length ? "Gagal memuat: " + errs.join(", ") + ". Ketuk ↻ untuk coba lagi." : "";
      status(); var c0 = m.getCenter(); fetchRain([c0.lat, c0.lng]).then(function () { recolor(); });
    });
  }
  function reload() { loaded = []; seq++; S.busy = false; S.loadErr = ""; ensure().then(renderCard); }

  /* ============================ GAMBAR ============================ */
  function wScale(z) { return z < 10 ? .75 : z > 15 ? 1.35 : z > 13 ? 1.1 : 1; }
  function paneInit(m) {
    if (!m.getPane("pqllPane")) { m.createPane("pqllPane"); m.getPane("pqllPane").style.zIndex = 432; }
    if (!rend) rend = L.canvas({ pane: "pqllPane", padding: .4, tolerance: 9 });
    CK.forEach(function (c) { if (!groups[c]) groups[c] = L.layerGroup(); });
  }
  function draw(list) {
    var m = getMap(); if (!m) return; paneInit(m); var z = m.getZoom(), ws = wScale(z);
    list.forEach(function (g) {
      var e = est(g, curHour(), curKey(), 0), pl = L.polyline(g.pts, { renderer: rend, pane: "pqllPane", color: LV[e.lv].c, weight: CLS[g.c].w * ws, opacity: S.live ? .45 : .92, lineCap: "round", lineJoin: "round" });
      pl.on("click", function (ev) { L.DomEvent.stopPropagation(ev); popup(g, ev.latlng); });
      g.line = pl; groups[g.c].addLayer(pl);
    });
    CK.forEach(function (c) { var has = m.hasLayer(groups[c]); if (S.cls[c] && !has) m.addLayer(groups[c]); else if (!S.cls[c] && has) m.removeLayer(groups[c]); });
  }
  function clearAll() { segs.forEach(function (g) { if (g.line && groups[g.c]) groups[g.c].removeLayer(g.line); }); segs.clear(); }
  function recolor() {
    var h = curHour(), key = curKey(), m = getMap(), ws = m ? wScale(m.getZoom()) : 1;
    segs.forEach(function (g) {
      if (!g.line) return; var e = est(g, h, key, rainAt(g, h));
      g.lv = e.lv; g.v = e.v; g.r = e.r; g.line.setStyle({ color: LV[e.lv].c, weight: CLS[g.c].w * ws, opacity: S.live ? .45 : .92 });
    });
    renderCard();
  }

  /* ============================ POPUP RUAS ============================ */
  function spark(g, hNow, key) {
    var bars = "", i, best = 99, bh = 0, worst = -1, wh = 0, arr = rainArr(g.mid);
    for (i = 0; i < 24; i++) {
      var e = est(g, i, key, S.mode === "now" && arr ? arr[i] : 0), ht = Math.max(3, Math.round((1 - e.r) * 38 + 3));
      if (i >= 5 && i <= 21) { if (e.x < best) { best = e.x; bh = i; } }
      if (e.x > worst) { worst = e.x; wh = i; }
      bars += "<i style='height:" + ht + "px;background:" + LV[e.lv].c + (i === hNow ? ";outline:2px solid #fff;outline-offset:1px" : "") + "' title='" + pad2(i) + ":00 · ~" + Math.round(e.v) + " km/j · " + LV[e.lv].n + "'></i>";
    }
    return { html: "<div class='pqll-sp'>" + bars + "</div><div class='pqll-ax'><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>", best: bh, worst: wh };
  }
  function advice(g, e, sp, key) {
    var out = [];
    if (e.lv >= 3) out.push("<b>Hindari jam ini</b> bila ada rute lain; pekerjaan jalan jangan membuka/menutup lajur sekarang.");
    else if (e.lv === 2) out.push("Padat: tunda pekerjaan yang memerlukan penutupan lajur; siapkan petugas pengatur lalu lintas bila terpaksa.");
    else out.push("Lalu lintas relatif longgar pada jam ini.");
    out.push("Jam siang paling lancar ≈ <b>" + pad2(sp.best) + ":00</b>; puncak terpadat ≈ <b>" + pad2(sp.worst) + ":00</b>. Penutupan lajur paling aman di malam hari (±22:00–05:00) dengan rambu, flagman/buka-tutup, dan koordinasi Dishub/Satlantas.");
    if (key === "mudik") out.push("Periode mudik/libur panjang: arus antarkota naik tajam — hindari pekerjaan di badan jalan.");
    if (e.rf > 1.05) out.push("Hujan (≈ " + Math.round((e.rf - 1) * 100) + "% tambahan hambatan) memperlambat arus.");
    if (g.un) out.push("Permukaan tidak beraspal — kecepatan turun & debu/lumpur memengaruhi arus.");
    return "<ul>" + out.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>";
  }
  function popup(g, ll) {
    var m = getMap(); if (!m) return; var h = curHour(), key = curKey(), arr = rainArr(g.mid), e = est(g, h, key, S.mode === "now" && arr ? arr[h] : 0), sp = spark(g, h, key), lv = LV[e.lv];
    var reg = g.K ? (g.K.n + ", " + g.K.p) : "di luar data wilayah";
    var html = "<div class='pqll-p'><div class='pqll-h'><b>" + esc(g.name) + "</b><span style='background:" + CLS[g.c].c + "'>" + CLS[g.c].full + "</span></div>" +
      "<div class='pqll-s'>" + esc(reg) + " · ±" + g.km.toFixed(g.km < 1 ? 2 : 1) + " km · " + g.ln + " lajur" + (g.ms ? " · batas " + g.ms + " km/j" : "") + (g.ref && g.ref !== g.name ? " · " + esc(g.ref) : "") + "</div>" +
      "<div class='pqll-b' style='color:" + lv.c + "'>" + lv.n + " · ≈ " + Math.round(e.v) + " km/j</div>" +
      "<div class='pqll-s'>Arus bebas ≈ " + Math.round(e.ff) + " km/j · waktu tempuh ≈ " + (60 / Math.max(e.v, 3)).toFixed(1) + " mnt/km · " + pad2(h) + ":00 · " + KEYS[key].split(" (")[0] + "</div>" +
      sp.html + advice(g, e, sp, key) + "<div class='pqll-lv' id='pqllLive'>" + (S.ttKey ? "Memeriksa real-time…" : "<i>Estimasi model. Masukkan kunci TomTom di panel untuk pembacaan real-time.</i>") + "</div>" +
      "<div class='pqll-n'>Klasifikasi kelas jalan = perkiraan dari OpenStreetMap; bukan data resmi.</div></div>";
    L.popup({ maxWidth: 320, minWidth: 250, className: "pqll-pop", autoPanPadding: [20, 20] }).setLatLng(ll || g.mid).setContent(html).openOn(m);
    if (S.ttKey) probe(g, ll || g.mid, h, key);
  }
  /* ---- pembacaan real-time TomTom + kalibrasi otomatis ---- */
  function probe(g, ll, h, key) {
    var la = ll.lat != null ? ll.lat : ll[0], lo = ll.lng != null ? ll.lng : ll[1];
    var u = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?unit=KMPH&point=" + la.toFixed(5) + "," + lo.toFixed(5) + "&key=" + encodeURIComponent(S.ttKey);
    fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? "kunci ditolak" : "HTTP " + r.status); return r.json(); }).then(function (j) {
      var f = j && j.flowSegmentData, box = $("pqllLive"); if (!f || !box) return;
      var cs = f.currentSpeed, ffs = f.freeFlowSpeed, rl = ffs ? clamp(cs / ffs, .05, 1) : null;
      var t = "<b>Real-time (TomTom):</b> " + Math.round(cs) + " km/j (arus bebas " + Math.round(ffs) + ") · " + LV[lvOf(rl)].n + " · keyakinan " + Math.round((f.confidence || 0) * 100) + "%" + (f.roadClosure ? " · <b style='color:#f87171'>JALAN DITUTUP</b>" : "");
      if (rl != null && (f.confidence || 0) >= .6 && S.mode === "now") {
        var xm = est(g, h, key, rainAt(g, h), true).x, xl = Math.pow(Math.max(1 / rl - 1, .001) / .8, 1 / 3.2), tg = clamp(xl / Math.max(xm, .05), .5, 2), kk = g.c + "|" + band(h);
        CAL[kk] = clamp(.7 * (CAL[kk] == null ? 1 : CAL[kk]) + .3 * tg, .5, 2); lsSet("petaqu_lalin_cal", CAL); t += "<br><span style='opacity:.8'>Model dikalibrasi otomatis (" + CLS[g.c].t + ", " + { p: "pagi", s: "siang", o: "sore", m: "malam" }[band(h)] + "): ×" + CAL[kk].toFixed(2) + "</span>"; recolorSoft();
      }
      box.innerHTML = t;
    }).catch(function (e) { var box = $("pqllLive"); if (box) box.innerHTML = "<i>Real-time tidak tersedia (" + esc(e && e.message || "gagal") + ").</i>"; });
  }
  var softT = null; function recolorSoft() { clearTimeout(softT); softT = setTimeout(recolor, 600); }

  /* ============================ RINGKASAN AREA ============================ */
  function summarize() {
    var m = getMap(), b = m ? m.getBounds() : null, st = {}, regs = {}, hot = [];
    CK.forEach(function (c) { st[c] = { km: 0, vk: 0, pad: 0 }; });
    segs.forEach(function (g) {
      if (!g.line || !S.cls[g.c] || g.v == null || (b && !b.contains(g.mid))) return;
      var s = st[g.c]; s.km += g.km; s.vk += g.v * g.km; if (g.lv >= 2) s.pad += g.km;
      if (g.K) { var k = g.K.n; (regs[k] = regs[k] || { n: k, p: g.K.p, km: 0, rk: 0 }).km += g.km; regs[k].rk += g.r * g.km; }
      if (g.lv >= 2 && g.km >= .15) hot.push(g);
    });
    hot.sort(function (a, b2) { return a.r - b2.r; });
    var seen = {}, top = []; for (var i = 0; i < hot.length && top.length < 6; i++) { var key = hot[i].name + "|" + (hot[i].K ? hot[i].K.n : ""); if (seen[key]) continue; seen[key] = 1; top.push(hot[i]); }
    var rg = Object.keys(regs).map(function (k) { return regs[k]; }).filter(function (r) { return r.km >= .5; }).sort(function (a, b2) { return a.rk / a.km - b2.rk / b2.km; }).slice(0, 5);
    return { st: st, top: top, rg: rg };
  }

  /* ============================ KARTU UI ============================ */
  var CSS = "#pqllCard{position:fixed;right:12px;top:72px;z-index:1405;width:min(348px,calc(100vw - 16px));max-height:calc(100vh - 92px);display:none;flex-direction:column;background:#0a0e17;color:#e6f1fb;border:1px solid rgba(148,178,204,.28);border-radius:14px;box-shadow:0 12px 38px rgba(0,0,0,.5);font:12px/1.4 system-ui,sans-serif}#pqllCard.open{display:flex}" +
    "#pqllCard header{display:flex;align-items:center;gap:6px;padding:10px 10px 6px}#pqllCard header b{flex:1;font-size:13.5px}#pqllCard header button{background:0 0;border:0;color:#8fa6bd;font-size:19px;cursor:pointer;line-height:1;padding:0 4px}" +
    "#pqllCard .bd{padding:0 10px 10px;overflow:auto;display:flex;flex-direction:column;gap:8px}#pqllCard.min .bd{display:none}" +
    "#pqllCard .ch{display:grid;grid-template-columns:1fr 1fr;gap:5px}#pqllCard .ch button{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:9px;border:1px solid rgba(148,178,204,.25);background:#0f1726;color:#cfe0f0;font:600 11px system-ui;cursor:pointer;text-align:left}#pqllCard .ch button.on{border-color:var(--c);background:rgba(255,255,255,.06)}#pqllCard .ch i{width:14px;height:5px;border-radius:3px;background:var(--c);opacity:.35;flex:none}#pqllCard .ch button.on i{opacity:1}#pqllCard .ch small{margin-left:auto;opacity:.6;font-weight:500}" +
    "#pqllCard .tb{display:flex;gap:5px}#pqllCard .tb button,#pqllCard .ft button{flex:1;padding:6px 8px;border-radius:8px;border:1px solid rgba(148,178,204,.25);background:#0f1726;color:#cfe0f0;font:600 11px system-ui;cursor:pointer}#pqllCard .tb button.on{background:#155e75;border-color:#22d3ee;color:#fff}" +
    "#pqllCard select,#pqllCard input[type=text],#pqllCard input[type=password]{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:8px;border:1px solid rgba(148,178,204,.25);background:#0f1726;color:#e6f1fb;font:12px system-ui}#pqllCard input[type=range]{width:100%}" +
    "#pqllCard .st{font-size:11px;opacity:.85;min-height:15px}#pqllCard .st.er{color:#fca5a5}#pqllCard .lg{display:flex;gap:3px}#pqllCard .lg span{flex:1;text-align:center;padding:3px 0;border-radius:6px;font-size:9.5px;font-weight:700;color:#0a0e17}" +
    "#pqllCard h5{margin:2px 0 3px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.7}#pqllCard .rw{display:flex;align-items:center;gap:7px;padding:4px 6px;border-radius:7px}#pqllCard .rw.cl{cursor:pointer}#pqllCard .rw.cl:hover{background:rgba(255,255,255,.07)}#pqllCard .rw .d{width:9px;height:9px;border-radius:50%;flex:none}#pqllCard .rw .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#pqllCard .rw .v{opacity:.8;font-variant-numeric:tabular-nums}" +
    "#pqllCard .ft{display:flex;gap:5px;flex-wrap:wrap}#pqllCard .nt{font-size:10px;opacity:.65}#pqllCard .lv{border-top:1px solid rgba(148,178,204,.15);padding-top:7px;display:flex;flex-direction:column;gap:5px}#pqllCard label{display:flex;gap:6px;align-items:center;font-size:11px}" +
    ".pqll-pop .leaflet-popup-content-wrapper{background:#0a0e17;color:#e6f1fb;border:1px solid rgba(148,178,204,.28);border-radius:12px}.pqll-pop .leaflet-popup-tip{background:#0a0e17}.pqll-pop .leaflet-popup-content{margin:10px 12px;font:12px/1.4 system-ui,sans-serif}" +
    ".pqll-h{display:flex;gap:6px;align-items:flex-start}.pqll-h b{flex:1;font-size:13px}.pqll-h span{color:#06121d;font-weight:700;font-size:10px;padding:2px 6px;border-radius:6px;white-space:nowrap}.pqll-s{font-size:11px;opacity:.8;margin-top:2px}.pqll-b{font-size:16px;font-weight:800;margin:6px 0 2px}" +
    ".pqll-sp{display:flex;align-items:flex-end;gap:1px;height:44px;margin-top:7px}.pqll-sp i{flex:1;border-radius:2px 2px 0 0;display:block}.pqll-ax{display:flex;justify-content:space-between;font-size:9px;opacity:.6}.pqll-p ul{margin:6px 0 0;padding-left:16px}.pqll-p li{margin:2px 0}.pqll-lv{margin-top:6px;padding:6px 8px;border-radius:8px;background:rgba(34,211,238,.08);font-size:11px}.pqll-n{font-size:9.5px;opacity:.55;margin-top:6px}" +
    "@media(max-width:700px){#pqllCard{left:8px;right:8px;width:auto;top:auto;bottom:8px;max-height:58vh}}";
  var LVL_LEG = function () { return "<div class='lg'>" + LV.map(function (l, i) { return "<span style='background:" + l.c + (i === 4 ? ";color:#fff" : "") + "' title='" + l.n + "'>" + (i === 4 ? "Parah" : l.n.split(" ")[0]) + "</span>"; }).join("") + "</div>"; };
  function status() {
    var el = $("pqllSt"); if (!el) return;
    el.className = "st" + (S.loadErr ? " er" : "");
    el.textContent = S.loadErr || (S.busy ? (S.prog || "Memuat jalan di area ini…") : (S.hint || "Estimasi model · geser/zoom peta untuk memuat jalan area lain"));
  }
  function nowLabel() { var d = new Date(); return HARI[d.getDay()] + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + " · " + KEYS[autoKey(d)].split(" (")[0]; }
  function renderCard() {
    if (!card) return; var sm = summarize(), h = curHour(), key = curKey();
    var cnt = {}; segs.forEach(function (g) { cnt[g.c] = (cnt[g.c] || 0) + 1; });
    var q = function (id) { return card.querySelector(id); };
    CK.forEach(function (c) { var b = q("[data-c=" + c + "]"); if (b) { b.className = S.cls[c] ? "on" : ""; var sEl = b.querySelector("small"); if (sEl) sEl.textContent = cnt[c] || ""; } });
    q("#pqllNow").className = S.mode === "now" ? "on" : ""; q("#pqllSim").className = S.mode === "sim" ? "on" : "";
    q("#pqllSimBox").style.display = S.mode === "sim" ? "" : "none";
    q("#pqllHr").value = h; q("#pqllHrL").textContent = pad2(h) + ":00" + (S.mode === "now" ? " (sekarang)" : ""); q("#pqllKey").value = key;
    q("#pqllMode").textContent = S.mode === "now" ? nowLabel() : KEYS[key].split(" (")[0] + " · simulasi " + pad2(h) + ":00";
    q("#pqllPlay").textContent = S.play ? "■ Hentikan" : "▶ Animasi 24 jam";
    var rows = CK.filter(function (c) { return S.cls[c] && sm.st[c].km > 0; }).map(function (c) { var s = sm.st[c], v = s.vk / s.km, lv = lvOf(v / CLS[c].ff);
      return "<div class='rw'><span class='d' style='background:" + LV[lv].c + "'></span><span class='n'>" + CLS[c].full + "</span><span class='v'>" + Math.round(v) + " km/j · " + Math.round(s.pad / s.km * 100) + "% padat · " + (s.km >= 10 ? Math.round(s.km) : s.km.toFixed(1)) + " km</span></div>"; }).join("");
    q("#pqllSum").innerHTML = rows || "<div class='nt'>Belum ada jalan termuat di layar ini (zoom lebih dekat).</div>";
    q("#pqllHot").innerHTML = sm.top.length ? sm.top.map(function (g, i) { return "<div class='rw cl' data-h='" + g.id + "'><span class='d' style='background:" + LV[g.lv].c + "'></span><span class='n'>" + esc(g.name) + (g.K ? " · " + esc(g.K.n) : "") + "</span><span class='v'>" + Math.round(g.v) + " km/j</span></div>"; }).join("") : "<div class='nt'>Tidak ada ruas padat pada jam ini di layar.</div>";
    q("#pqllReg").innerHTML = sm.rg.length ? sm.rg.map(function (r) { var rr = r.rk / r.km, lv = lvOf(rr); return "<div class='rw'><span class='d' style='background:" + LV[lv].c + "'></span><span class='n'>" + esc(r.n) + "</span><span class='v'>" + LV[lv].n + "</span></div>"; }).join("") : "<div class='nt'>—</div>";
    q("#pqllTT").checked = !!(S.live && S.ttKey);
    status();
  }
  function build_ui() {
    if (card) return; if (!$("pqllCss")) { var st = D.createElement("style"); st.id = "pqllCss"; st.textContent = CSS; D.head.appendChild(st); }
    card = D.createElement("div"); card.id = "pqllCard"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Lalu lintas jalan");
    card.innerHTML = "<header><b>🚦 Lalu Lintas Jalan</b><button id='pqllRl' aria-label='Muat ulang' title='Muat ulang jalan'>↻</button><button id='pqllMin' aria-label='Kecilkan' title='Kecilkan'>–</button><button id='pqllX' aria-label='Tutup'>×</button></header><div class='bd'>" +
      "<div class='ch'>" + CK.map(function (c) { return "<button data-c='" + c + "' style='--c:" + CLS[c].c + "'><i></i>" + CLS[c].full.replace("Jalan ", "") + "<small></small></button>"; }).join("") + "</div>" +
      "<div class='tb'><button id='pqllNow'>Sekarang</button><button id='pqllSim'>Simulasi</button></div><div class='nt' id='pqllMode'></div>" +
      "<div id='pqllSimBox' style='display:none;flex-direction:column;gap:6px'><select id='pqllKey'>" + Object.keys(KEYS).map(function (k) { return "<option value='" + k + "'>" + KEYS[k] + "</option>"; }).join("") + "</select><div style='display:flex;gap:8px;align-items:center'><input type='range' id='pqllHr' min='0' max='23' step='1'><b id='pqllHrL' style='min-width:84px;text-align:right'></b></div><div class='ft'><button id='pqllPlay'>▶ Animasi 24 jam</button></div></div>" +
      "<div class='st' id='pqllSt'></div>" + LVL_LEG() +
      "<div><h5>Ringkasan layar</h5><div id='pqllSum'></div></div><div><h5>Titik terpadat (klik untuk lihat)</h5><div id='pqllHot'></div></div><div><h5>Kab/kota terpadat di layar</h5><div id='pqllReg'></div></div>" +
      "<div class='lv'><h5 style='margin:0'>Real-time (opsional)</h5><input type='password' id='pqllTk' placeholder='Kunci API TomTom (gratis, developer.tomtom.com)' autocomplete='off'><div class='ft'><button id='pqllTs'>Simpan kunci</button><button id='pqllTr'>Hapus</button></div><label><input type='checkbox' id='pqllTT'> Tampilkan lapisan lalu lintas langsung TomTom</label><div class='nt'>Dengan kunci: klik ruas → kecepatan nyata & model belajar menyesuaikan. Tanpa kunci: estimasi model saja.</div></div>" +
      "<div class='ft'><button id='pqllGm'>Google Maps (lalin langsung)</button><button id='pqllCsv'>Ekspor CSV layar</button><button id='pqllRs'>Reset kalibrasi</button></div>" +
      "<div class='nt'>Estimasi model dari pola jam/hari, karakter wilayah, kelas & lajur jalan, simpang, dan hujan — bukan data sensor kecuali TomTom aktif. Kelas jalan diperkirakan dari OpenStreetMap.</div></div>";
    D.body.appendChild(card);
    var q = function (id) { return card.querySelector(id); };
    q("#pqllX").onclick = close; q("#pqllRl").onclick = reload; q("#pqllMin").onclick = function () { S.min = !S.min; card.classList.toggle("min", S.min); };
    CK.forEach(function (c) { q("[data-c=" + c + "]").onclick = function () { S.cls[c] = !S.cls[c]; savePref(); var m = getMap(); if (m && groups[c]) { if (S.cls[c]) m.addLayer(groups[c]); else m.removeLayer(groups[c]); } ensure().then(renderCard); renderCard(); }; });
    q("#pqllNow").onclick = function () { S.mode = "now"; stopPlay(); recolor(); }; q("#pqllSim").onclick = function () { if (S.mode !== "sim") { S.mode = "sim"; S.hour = hourNow(); S.key = autoKey(new Date()); } recolor(); };
    q("#pqllHr").oninput = function (e) { S.hour = +e.target.value; recolor(); }; q("#pqllKey").onchange = function (e) { S.key = e.target.value; recolor(); };
    q("#pqllPlay").onclick = function () { if (S.play) stopPlay(); else { S.mode = "sim"; S.play = true; playT = setInterval(function () { S.hour = (S.hour + 1) % 24; recolor(); }, 750); recolor(); } };
    q("#pqllTs").onclick = function () { var v = q("#pqllTk").value.trim(); if (!v) { say("Isi kunci TomTom dulu"); return; } S.ttKey = v; try { W.localStorage.setItem("petaqu_lalin_tt", v); } catch (e) { } q("#pqllTk").value = ""; q("#pqllTk").placeholder = "Kunci tersimpan di perangkat ini"; S.live = true; savePref(); setLive(true); say("Kunci tersimpan · lapisan real-time TomTom aktif"); recolor(); };
    q("#pqllTk").onkeydown = function (e) { if (e.key === "Enter") q("#pqllTs").click(); };
    q("#pqllTr").onclick = function () { S.ttKey = ""; S.live = false; try { W.localStorage.removeItem("petaqu_lalin_tt"); } catch (e) { } setLive(false); q("#pqllTk").placeholder = "Kunci API TomTom (gratis, developer.tomtom.com)"; renderCard(); };
    q("#pqllTT").onchange = function (e) { if (e.target.checked && !S.ttKey) { e.target.checked = false; say("Masukkan & simpan kunci TomTom dulu"); return; } S.live = e.target.checked; savePref(); setLive(S.live); recolor(); };
    q("#pqllGm").onclick = function () { var m = getMap(), c = m ? m.getCenter() : { lat: -7, lng: 110 }; window.open("https://www.google.com/maps/@" + c.lat.toFixed(5) + "," + c.lng.toFixed(5) + "," + Math.max(10, Math.min(17, m ? m.getZoom() : 13)) + "z/data=!5m1!1e1", "_blank", "noopener"); };
    q("#pqllCsv").onclick = exportCsv; q("#pqllRs").onclick = function () { CAL = {}; lsSet("petaqu_lalin_cal", CAL); recolor(); say("Kalibrasi direset"); };
    q("#pqllHot").onclick = function (e) { var t = e.target.closest("[data-h]"); if (!t) return; var g = segs.get(+t.getAttribute("data-h")), m = getMap(); if (!g || !m) return; m.flyTo(g.mid, Math.max(m.getZoom(), 15), { duration: .8 }); setTimeout(function () { popup(g, L.latLng(g.mid)); }, 900); };
  }
  function setLive(on) {
    var m = getMap(); if (!m) return;
    if (ttLayer) { try { m.removeLayer(ttLayer); } catch (e) { } ttLayer = null; }
    if (on && S.ttKey) { ttLayer = L.tileLayer("https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?tileSize=256&key=" + encodeURIComponent(S.ttKey), { pane: "pqllPane", maxZoom: 22, maxNativeZoom: 22, opacity: .9, attribution: "Lalu lintas © TomTom" }); ttLayer.addTo(m); }
  }
  function exportCsv() {
    var m = getMap(), b = m ? m.getBounds() : null, rows = [["Nama", "Kelas", "Kab/Kota", "Provinsi", "Panjang_km", "Lajur", "Kecepatan_estimasi_kmj", "Arus_bebas_kmj", "Tingkat"]];
    var h = curHour(), key = curKey();
    segs.forEach(function (g) { if (!S.cls[g.c] || (b && !b.contains(g.mid))) return; var e = est(g, h, key, rainAt(g, h)); rows.push([g.name, CLS[g.c].full, g.K ? g.K.n : "", g.K ? g.K.p : "", g.km.toFixed(2), g.ln, Math.round(e.v), Math.round(e.ff), LV[e.lv].n]); });
    if (rows.length < 2) { say("Belum ada data di layar"); return; }
    var csv = "\ufeff" + rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
    var a = D.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "lalu-lintas-" + iso(new Date()) + "-" + pad2(h) + "00.csv"; D.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function stopPlay() { S.play = false; if (playT) { clearInterval(playT); playT = null; } }

  /* ============================ BUKA / TUTUP ============================ */
  function open() {
    var m = getMap(); if (!m) { say("Peta belum siap"); return; }
    S.on = true; paneInit(m); build_ui(); card.classList.add("open"); kabList();
    CK.forEach(function (c) { if (S.cls[c] && !m.hasLayer(groups[c])) m.addLayer(groups[c]); });
    if (S.live && S.ttKey) setLive(true);
    m.off("moveend", onMove).on("moveend", onMove); m.off("zoomend", onZoom).on("zoomend", onZoom);
    clearInterval(tickT); tickT = setInterval(function () { if (S.on && S.mode === "now") recolor(); }, 300000);
    renderCard(); ensure().then(renderCard);
  }
  function close() {
    S.on = false; stopPlay(); clearInterval(tickT); var m = getMap();
    if (card) card.classList.remove("open");
    if (m) { m.off("moveend", onMove); m.off("zoomend", onZoom); CK.forEach(function (c) { if (groups[c] && m.hasLayer(groups[c])) m.removeLayer(groups[c]); }); if (ttLayer) { try { m.removeLayer(ttLayer); } catch (e) { } ttLayer = null; } try { m.closePopup(); } catch (e) { } }
  }
  function onMove() { clearTimeout(moveT); moveT = setTimeout(function () { ensure().then(renderCard); renderCard(); }, 700); }
  function onZoom() { recolor(); }

  /* ============================ MENU FOLDER ============================ */
  var rows = function () { return [{ id: "lalin", name: "Lalu lintas jalan (nasional · provinsi · kab · kota)", ic: '<i class="pq-fi">\uf637</i>', c: "#22c55e", on: S.on }]; };
  var act = function () { if (S.on) close(); else open(); };
  W.PETAQU_LALIN = { open: open, close: close, reload: reload, rows: rows, act: act, isOn: function () { return S.on; }, _t: { est: est, classify: classify, mkSeg: mkSeg, ingest: ingest, lvOf: lvOf, autoKey: autoKey, S: S, segs: segs, CAL: CAL, spark: spark, summarize: summarize, popup: popup } };
  if (D && D.getElementById) {
    W.PQ_FOLDER_EXTRA = W.PQ_FOLDER_EXTRA || [];
    W.PQ_FOLDER_EXTRA.push({ t: "Lalu Lintas Jalan", rows: rows, act: act });
    var tries = 0, iv = setInterval(function () {
      if (++tries > 120) clearInterval(iv);
      if (!$("pqFolder") && W.PQ_DOCK && !W.PETAQU_LALIN._dock) { W.PETAQU_LALIN._dock = 1; try { var b = D.createElement("button"); b.innerHTML = '<i class="fa-solid fa-traffic-light"></i>'; b.title = "Lalu lintas jalan"; b.onclick = act; W.PQ_DOCK.adopt(b, "Lalu lintas jalan"); } catch (e) { } }
    }, 700);
  }
})();
