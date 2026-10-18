/* ==========================================================================
   PETAQU — Lalu Lintas Jalan · Nasional · Provinsi · Kabupaten · Kota
   Lapisan jalan diwarnai tingkat kepadatan (lancar → macet parah) untuk SEMUA wilayah Indonesia.
   Cara kerja (jujur): tanpa kunci → ESTIMASI MODEL (bukan data sensor langsung). Dengan kunci API (PETAQU Live) → lapisan
   real-time + kalibrasi otomatis model dari pembacaan langsung.
   • Jalan diambil dari OpenStreetMap (Overpass) sesuai area layar, di-cache; klasifikasi perkiraan:
       motorway/trunk/primary = Nasional · secondary = Provinsi · tertiary/unclassified = Kabupaten (atau Kota bila di dalam
       poligon kota) · residential/tertiary di dalam kota = Kota.
   • Model: profil jam × jenis hari (kerja / akhir pekan-libur / mudik-Nataru, kalender otomatis) × karakter wilayah
       (kepadatan kota, jalur antarkota, wisata dari modul Rawan Macet) × kelas jalan × lajur × simpang per km × hujan
       (Open-Meteo) → kecepatan via kurva volume/kapasitas. Bisa disimulasikan per jam / animasi 24 jam.
   • Klik ruas: kecepatan estimasi, grafik 24 jam, jam terlancar/terpadat, saran rekayasa lalin untuk pekerjaan jalan.
   • Ringkasan area layar: rata-rata kecepatan per kelas, titik terpadat, wilayah (kab/kota) terpadat, ekspor CSV.
   Tampilan: SATU kartu (#pqllCard) dengan tab Ruas · Area · Atur. Kepala kartu selalu merangkum kondisi (ikon berwarna sesuai
   tingkat kepadatan), sehingga tetap informatif saat diperkecil. Tidak ada panel terpisah lagi.
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

  /* kunci bawaan (dipakai bersama; tidak pernah ditampilkan di UI). Pengguna disarankan memasang kunci sendiri. */
  var DK = "bzJTZUx2SjVWeTVKTmlzYVdoVk1ZQU5wMUl2MFE2Z2Y=";
  var dKey = function () { try { return (W.atob || atob)(DK).split("").reverse().join(""); } catch (e) { return ""; } };

  /* ============================ STATE ============================ */
  var S = { on: false, cls: { nas: true, prov: true, kab: true, kota: true }, mode: "now", key: "kerja", hour: 8, play: false, min: false, tab: "area", sel: null, live: false, ttKey: "", rain: {}, loadErr: "", busy: false };
  var pref = lsGet("petaqu_lalin_pref"); if (pref && pref.cls) S.cls = Object.assign(S.cls, pref.cls); S.live = pref ? !!pref.live : true; S.pick = pref && pref.pick != null ? !!pref.pick : true; S.min = !!(pref && pref.min); S.tab = pref && pref.tab === "set" ? "set" : "area"; S.sel = null;
  var ownKey = (function () { try { return W.localStorage.getItem("petaqu_lalin_tt") || ""; } catch (e) { return ""; } })();
  S.own = !!ownKey; S.ttKey = ownKey || dKey();
  var CAL = lsGet("petaqu_lalin_cal") || {};
  var savePref = function () { lsSet("petaqu_lalin_pref", { cls: S.cls, live: S.live, pick: S.pick, min: S.min, tab: S.tab === "set" ? "set" : "area" }); };
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
    var g = { id: el.id, bb: bbOf(pts), c: c, name: tg.name || tg.ref || "(tanpa nama)", ref: tg.ref || "", hw: hw, ln: ln, ms: ms, km: km, pts: pts, mid: [mi.lat, mi.lon], K: K, ixc: ixc, un: un, ff: ff, round: tg.junction === "roundabout", lf: lf };
    g.adj = lf * (hw === "motorway" ? 1 : 1) * (1 + Math.min(.4, (ixc / Math.max(.15, km)) * .035)) * (g.round ? 1.1 : 1) * (un ? 1.1 : 1) * (hw === "motorway" ? .65 : 1);
    return g;
  }
  function bbOf(p) { var a = 90, b = 180, c = -90, d = -180; p.forEach(function (q) { if (q[0] < a) a = q[0]; if (q[0] > c) c = q[0]; if (q[1] < b) b = q[1]; if (q[1] > d) d = q[1]; }); return [a, b, c, d]; }
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
    out.push("Jam siang paling lancar ≈ <b>" + pad2(sp.best) + ":00</b>; puncak terpadat ≈ <b>" + pad2(sp.worst) + ":00</b>. Penutupan lajur paling aman di malam hari (±22:00–05:00) dengan rambu, flagman/buka-tutup, dan koordinasi Dishub/Satlantas.");
    if (e && e.lv >= 2) out.push("Pada jam ini ruas sudah padat: siapkan petugas pengatur lalu lintas bila pekerjaan tidak bisa ditunda.");
    if (key === "mudik") out.push("Periode mudik/libur panjang: arus antarkota naik tajam — hindari pekerjaan di badan jalan.");
    if (e && e.rf > 1.05) out.push("Hujan (≈ " + Math.round((e.rf - 1) * 100) + "% tambahan hambatan) memperlambat arus.");
    if (g.un) out.push("Permukaan tidak beraspal — kecepatan turun & debu/lumpur memengaruhi arus.");
    return "<ul>" + out.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
  }
  /* ============================ PILIHAN RUAS / TITIK (satu panel) ============================ */
  /* Satu kartu #pqllCard memuat semuanya: ruas/titik terpilih (tab Ruas), ringkasan layar (tab Area), pengaturan (tab Atur).
     Kepala kartu selalu menampilkan ringkasan kondisi, jadi tetap informatif saat kartu diperkecil. */
  var hl = null, selSeq = 0;
  function unhighlight() { var m = getMap(); if (hl && m) { try { m.removeLayer(hl); } catch (e) { } } hl = null; }
  function highlight(g, ll) {
    var m = getMap(); unhighlight(); if (!m) return;
    try {
      hl = g ? L.polyline(g.pts, { renderer: rend, pane: "pqllPane", color: "#ffffff", weight: CLS[g.c].w * wScale(m.getZoom()) + 5, opacity: .9, lineCap: "round", interactive: false })
        : L.circleMarker(ll, { renderer: rend, pane: "pqllPane", radius: 7, color: "#ffffff", weight: 2, fillColor: "#22d3ee", fillOpacity: 1, interactive: false });
      hl.addTo(m); if (g && hl.bringToBack) hl.bringToBack();
    } catch (e) { hl = null; }
  }
  function clearSel() { S.sel = null; unhighlight(); if (card) { paintTabs(); renderCard(); } }
  function select(g, ll) {
    if (!getMap()) return;
    var s = { id: ++selSeq, g: g, ll: ll, lv: null, err: "", wait: !!S.ttKey };
    S.sel = s; highlight(g, ll); S.tab = "sel";
    if (card) { renderCard(); }
    if (S.ttKey) probe(s, ll || g.mid, curHour(), curKey());
  }
  function popup(g, ll) { select(g, ll || L.latLng(g.mid)); }

  /* data tampilan terpilih: sumber utama = pembacaan langsung bila ada, kalau tidak estimasi model */
  function selView() {
    var s = S.sel; if (!s) return null;
    var h = curHour(), key = curKey(), g = s.g, v = { s: s, h: h, key: key, e: null, li: null, sp: null, live: s.lv || null };
    if (g) { var arr = rainArr(g.mid); v.e = est(g, h, key, S.mode === "now" && arr ? arr[h] : 0); }
    if (v.live) { v.li = v.live.li; v.sp = v.live.cs; v.src = "Langsung"; }
    else if (v.e) { v.li = v.e.lv; v.sp = v.e.v; v.src = "Estimasi"; }
    return v;
  }
  function tipOf(li) {
    return li >= 3 ? "Hindari penutupan lajur sekarang dan pertimbangkan rute alternatif."
      : li === 2 ? "Mulai padat — tunda pekerjaan yang membutuhkan penutupan lajur."
      : "Arus relatif longgar — pekerjaan jalan lebih aman, tetap pasang rambu dan petugas.";
  }
  function renderSel() {
    var box = $("pqllSel"); if (!box) return; var v = selView();
    if (!v) {
      box.innerHTML = "<div class='em'><b>Belum ada titik dipilih</b><span>Ketuk garis jalan di peta" + (S.ttKey && S.pick ? ", atau titik mana saja," : "") + " untuk melihat kecepatan, pola 24 jam, dan saran rekayasa lalu lintas.</span></div>";
      return;
    }
    var s = v.s, g = s.g, o = [], lv = v.li != null ? LV[v.li] : null;
    /* judul */
    if (g) {
      var reg = g.K ? (g.K.n + ", " + g.K.p) : "di luar data wilayah";
      o.push("<div class='sh'><b>" + esc(g.name) + "</b><span class='tag' style='background:" + CLS[g.c].c + "'>" + CLS[g.c].full + "</span><button class='ib sm' data-clr aria-label='Hapus pilihan' title='Hapus pilihan'><i class='fa-solid fa-xmark'></i></button></div>" +
        "<div class='ss'>" + esc(reg) + " · ±" + g.km.toFixed(g.km < 1 ? 2 : 1) + " km · " + g.ln + " lajur" + (g.ms ? " · batas " + g.ms + " km/j" : "") + (g.ref && g.ref !== g.name ? " · " + esc(g.ref) : "") + "</div>");
    } else {
      var la = s.ll.lat != null ? s.ll.lat : s.ll[0], lo = s.ll.lng != null ? s.ll.lng : s.ll[1];
      o.push("<div class='sh'><b>Titik di peta</b><span class='tag' style='background:#22d3ee'>PETAQU Live</span><button class='ib sm' data-clr aria-label='Hapus pilihan' title='Hapus pilihan'><i class='fa-solid fa-xmark'></i></button></div><div class='ss'>" + la.toFixed(5) + ", " + lo.toFixed(5) + (S.mode === "now" ? " · " + nowLabel() : "") + "</div>");
    }
    /* putusan */
    if (lv) {
      o.push("<div class='vd' style='--c:" + lv.c + "'><span class='lvn'>" + lv.n + "</span><span class='spd'>" + Math.round(v.sp) + "<small> km/j</small></span><span class='src" + (v.live ? " lv" : "") + "'>" + v.src + "</span></div>");
    } else if (s.wait) {
      o.push("<div class='vd wt'><span class='lvn'>Memeriksa kondisi lalu lintas…</span></div>");
    } else {
      o.push("<div class='vd wt'><span class='lvn'>Tidak ada pembacaan langsung</span></div>");
    }
    /* rincian langsung */
    if (v.live) {
      var L0 = v.live, bits = ["arus bebas " + Math.round(L0.ffs) + " km/j", "keyakinan " + Math.round(L0.conf * 100) + "%"];
      if (L0.dly) bits.push("tambahan waktu ≈ " + L0.dly + " dtk");
      o.push("<div class='kv'><b>PETAQU Live:</b> " + bits.join(" · ") + (L0.closed ? " · <b class='rd'>JALAN DITUTUP</b>" : "") + "</div>");
      if (L0.dd != null) o.push("<div class='kv'>" + (L0.dd < .75 ? "<b class='or'>⚠ ±" + Math.round((1 - L0.dd) * 100) + "% lebih lambat dari pola biasanya jam ini</b> — kemungkinan ada hambatan (kejadian, hujan, pekerjaan/penyempitan)." : L0.dd > 1.2 ? "Lebih lancar dari pola biasanya jam ini." : "Sesuai pola biasanya jam ini.") + "</div>");
    } else if (s.err) {
      o.push("<div class='kv'><i>Real-time tidak tersedia (" + esc(s.err) + ")." + (S.own || !/ditolak|kuota/.test(s.err) ? "" : " Kunci bawaan bermasalah/habis kuota — pasang kunci API Anda sendiri di tab Atur.") + "</i></div>");
    } else if (!S.ttKey) {
      o.push("<div class='kv'><i>Ini estimasi model.</i> <button class='lk' data-go='set'>Aktifkan PETAQU Live</button> untuk pembacaan real-time.</div>");
    }
    /* model (hanya bila ruas terpilih) */
    if (v.e) {
      var e = v.e;
      o.push("<div class='kv" + (v.live ? " dim" : "") + "'>" + (v.live ? "Model: " + LV[e.lv].n + " · ≈ " + Math.round(e.v) + " km/j · " : "") + "arus bebas ≈ " + Math.round(e.ff) + " km/j · waktu tempuh ≈ " + (60 / Math.max(v.live ? v.live.cs : e.v, 3)).toFixed(1) + " mnt/km · " + pad2(v.h) + ":00 · " + KEYS[v.key].split(" (")[0] + "</div>");
    }
    /* saran singkat */
    if (lv) o.push("<p class='tp' style='--c:" + lv.c + "'>" + tipOf(v.li) + "</p>");
    /* pola 24 jam + saran rinci */
    if (g) {
      var sp = spark(g, v.h, v.key);
      o.push(sp.html + "<div class='kv dim' style='margin-top:2px'>Terlancar ≈ <b>" + pad2(sp.best) + ":00</b> · terpadat ≈ <b>" + pad2(sp.worst) + ":00</b></div>");
      o.push("<details class='dt'><summary>Saran rekayasa lalu lintas</summary>" + advice(g, v.e, sp, v.key) + "</details>");
    }
    if (v.live && v.live.cal) o.push("<div class='kv dim'>" + esc(v.live.cal) + "</div>");
    o.push("<div class='nt'>" + (g ? "Klasifikasi kelas jalan = perkiraan dari OpenStreetMap; bukan data resmi." : "Pembacaan langsung dari jaringan sensor &amp; kendaraan; cakupan di jalan kecil/pelosok bisa terbatas.") + "</div>");
    box.innerHTML = o.join("");
  }
  /* ---- pembacaan real-time (PETAQU Live) + kalibrasi otomatis ---- */
  function probe(s, ll, h, key) {
    var m = getMap(), g = s.g, la = ll.lat != null ? ll.lat : ll[0], lo = ll.lng != null ? ll.lng : ll[1], z = clamp(Math.round(m ? m.getZoom() : 12), 10, 22);
    var u = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/" + z + "/json?unit=KMPH&point=" + la.toFixed(5) + "," + lo.toFixed(5) + "&key=" + encodeURIComponent(S.ttKey);
    fetch(u).then(function (r) {
      if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? "kunci ditolak" : r.status === 400 ? "tidak ada ruas jalan terdeteksi tepat di titik ini — ketuk tepat di atas garis jalan" : r.status === 429 ? "kuota harian habis" : "HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      if (S.sel !== s) return; s.wait = false;
      var f = j && j.flowSegmentData; if (!f) { s.err = "data tidak tersedia di titik ini"; renderCard(); return; }
      var cs = f.currentSpeed, ffs = f.freeFlowSpeed, rl = ffs ? clamp(cs / ffs, .05, 1) : null, conf = f.confidence || 0;
      var lv = { li: rl == null ? 0 : lvOf(rl), cs: cs, ffs: ffs, conf: conf, dly: Math.max(0, Math.round((f.currentTravelTime || 0) - (f.freeFlowTravelTime || 0))), closed: !!f.roadClosure, dd: null, cal: "" };
      if (g && conf >= .6 && S.mode === "now") {
        var vn = est(g, h, key, rainAt(g, h)).v; lv.dd = cs / Math.max(vn, 3);
        if (rl != null) {
          var xm = est(g, h, key, rainAt(g, h), true).x, xl = Math.pow(Math.max(1 / rl - 1, .001) / .8, 1 / 3.2), tg = clamp(xl / Math.max(xm, .05), .5, 2), kk = g.c + "|" + band(h);
          CAL[kk] = clamp(.7 * (CAL[kk] == null ? 1 : CAL[kk]) + .3 * tg, .5, 2); lsSet("petaqu_lalin_cal", CAL);
          lv.cal = "Model dikalibrasi otomatis (" + CLS[g.c].t + ", " + { p: "pagi", s: "siang", o: "sore", m: "malam" }[band(h)] + "): ×" + CAL[kk].toFixed(2); recolorSoft();
        }
      }
      s.lv = lv; s.err = ""; renderCard();
    }).catch(function (e) { if (S.sel !== s) return; s.wait = false; s.err = (e && e.message) || "gagal"; renderCard(); });
  }
  /* ruas model terdekat dari titik klik (≤ maxM meter) */
  function nearestSeg(ll, maxM) {
    var la = ll.lat != null ? ll.lat : ll[0], lo = ll.lng != null ? ll.lng : ll[1], kx = Math.cos(la * Math.PI / 180) * 111320, ky = 110570, best = null, bd = maxM, pd = .0015;
    segs.forEach(function (g) {
      if (!S.cls[g.c] || !g.line || !g.bb || la < g.bb[0] - pd || la > g.bb[2] + pd || lo < g.bb[1] - pd || lo > g.bb[3] + pd) return;
      for (var i = 1; i < g.pts.length; i++) {
        var ax = (g.pts[i - 1][1] - lo) * kx, ay = (g.pts[i - 1][0] - la) * ky, bx = (g.pts[i][1] - lo) * kx, by = (g.pts[i][0] - la) * ky, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? clamp(-(ax * dx + ay * dy) / L2, 0, 1) : 0, x = ax + t * dx, y = ay + t * dy, d = Math.sqrt(x * x + y * y);
        if (d < bd) { bd = d; best = g; }
      }
    });
    return best;
  }
  /* klik di titik mana pun (tanpa ruas model) → pembacaan lalu lintas langsung di panel yang sama */
  function liveInfo(ll) {
    if (!S.ttKey) { say("Belum ada kunci API"); return; }
    var g0 = nearestSeg(ll, 70); if (g0) { popup(g0, ll); return; }
    select(null, ll);
  }
  function onMapClick(e) { if (S.on && S.pick && S.ttKey && e && e.latlng) liveInfo(e.latlng); }
  var softT = null; function recolorSoft() { clearTimeout(softT); softT = setTimeout(recolor, 600); }

  /* ============================ RINGKASAN AREA ============================ */
  function summarize() {
    var m = getMap(), b = m ? m.getBounds() : null, st = {}, regs = {}, hot = [];
    var all = { km: 0, vk: 0, rk: 0, pad: 0 }; CK.forEach(function (c) { st[c] = { km: 0, vk: 0, pad: 0 }; });
    segs.forEach(function (g) {
      if (!g.line || !S.cls[g.c] || g.v == null || (b && !b.contains(g.mid))) return;
      var s = st[g.c]; s.km += g.km; s.vk += g.v * g.km; if (g.lv >= 2) s.pad += g.km; all.km += g.km; all.vk += g.v * g.km; all.rk += g.r * g.km; if (g.lv >= 2) all.pad += g.km;
      if (g.K) { var k = g.K.n; (regs[k] = regs[k] || { n: k, p: g.K.p, km: 0, rk: 0 }).km += g.km; regs[k].rk += g.r * g.km; }
      if (g.lv >= 2 && g.km >= .15) hot.push(g);
    });
    hot.sort(function (a, b2) { return a.r - b2.r; });
    var seen = {}, top = []; for (var i = 0; i < hot.length && top.length < 6; i++) { var key = hot[i].name + "|" + (hot[i].K ? hot[i].K.n : ""); if (seen[key]) continue; seen[key] = 1; top.push(hot[i]); }
    var rg = Object.keys(regs).map(function (k) { return regs[k]; }).filter(function (r) { return r.km >= .5; }).sort(function (a, b2) { return a.rk / a.km - b2.rk / b2.km; }).slice(0, 5);
    return { st: st, top: top, rg: rg, all: all };
  }

  /* ============================ KARTU UI (satu panel) ============================ */
  var CSS = "#pqllCard{position:fixed;right:68px;top:72px;z-index:1405;width:min(364px,calc(100vw - 16px));max-height:calc(100vh - 92px);max-height:calc(100dvh - 92px);display:none;flex-direction:column;overflow:hidden;background:rgba(10,14,23,.96);color:var(--text,#e6edf5);border:1px solid rgba(148,178,204,.26);border-radius:16px;box-shadow:0 14px 40px rgba(0,0,0,.55);font:12px/1.45 var(--mono,system-ui,sans-serif);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);--hc:#8fa6bd}#pqllCard.open{display:flex}#pqllCard *{box-sizing:border-box}" +
    /* kepala = ringkasan kondisi */
    "#pqllCard header{display:flex;align-items:center;gap:2px;padding:8px 6px 8px 10px;flex:none}#pqllCard .hd{flex:1;min-width:0;display:flex;align-items:center;gap:10px;cursor:pointer;border-radius:10px;padding:2px;user-select:none;-webkit-user-select:none}#pqllCard .hd:focus-visible,#pqllCard .ib:focus-visible,#pqllCard .tabs button:focus-visible,#pqllCard .lk:focus-visible,#pqllCard summary:focus-visible{outline:2px solid #22d3ee;outline-offset:1px}" +
    "#pqllCard .ic{flex:none;width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:rgba(255,255,255,.06);color:var(--hc);font-size:15px;transition:color .25s}" +
    "#pqllCard .tt{min-width:0;display:flex;flex-direction:column;gap:1px}#pqllCard .tt>b{font:600 13.5px/1.2 var(--display,system-ui)}#pqllCard .hl{display:flex;align-items:center;gap:6px;min-width:0;font-size:11.5px;color:#a9bbcf}#pqllCard .hl i{flex:none;width:8px;height:8px;border-radius:50%;background:var(--hc)}#pqllCard .hl b{flex:none;color:var(--hc);font-weight:700}#pqllCard .hl span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}" +
    "#pqllCard .pill{flex:none;font:700 9.5px/1 var(--mono,system-ui);padding:4px 7px;border-radius:999px;border:1px solid rgba(148,178,204,.35);color:#9db0c4;margin-right:2px}#pqllCard .pill.lv{background:#22d3ee;border-color:#22d3ee;color:#06121d}" +
    "#pqllCard .ib{flex:none;width:30px;height:30px;padding:0;border:0;border-radius:50%;background:transparent;color:#8fa6bd;cursor:pointer;display:grid;place-items:center;font-size:13px}#pqllCard .ib:hover{background:rgba(255,255,255,.08);color:#fff}#pqllCard .ib.sm{width:24px;height:24px;font-size:11px;margin:-3px -4px 0 0}#pqllCard .ib.busy i{animation:pqllSpin 1s linear infinite}#pqllCard #pqllMin i{transition:transform .2s}#pqllCard.min #pqllMin i{transform:rotate(180deg)}@keyframes pqllSpin{to{transform:rotate(360deg)}}" +
    /* tab */
    "#pqllCard .tabs{display:flex;padding:0 10px;border-bottom:1px solid rgba(148,178,204,.16);flex:none}#pqllCard .tabs button{flex:1;position:relative;padding:8px 4px 9px;margin-bottom:-1px;background:0 0;border:0;border-bottom:2px solid transparent;color:#8fa6bd;font:600 12px var(--mono,system-ui);cursor:pointer}#pqllCard .tabs button:hover{color:#dbe7f3}#pqllCard .tabs button[aria-selected=true]{color:#fff;border-bottom-color:#22d3ee}#pqllCard .tabs button.has::after{content:'';position:absolute;top:8px;margin-left:5px;width:6px;height:6px;border-radius:50%;background:#22d3ee}" +
    "#pqllCard.min .tabs,#pqllCard.min .bd,#pqllCard.min .st{display:none}#pqllCard.min header{padding-bottom:10px}" +
    "#pqllCard .st{flex:none;padding:6px 12px;font-size:11px;color:#b9c9da;background:rgba(34,211,238,.07);border-bottom:1px solid rgba(148,178,204,.12)}#pqllCard .st.er{color:#fecaca;background:rgba(220,38,38,.12)}#pqllCard .st.bz::before{content:'';display:inline-block;width:8px;height:8px;margin-right:7px;border-radius:50%;border:2px solid #22d3ee;border-right-color:transparent;animation:pqllSpin .8s linear infinite;vertical-align:-1px}" +
    "#pqllCard .bd{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px}#pqllCard .pn{display:none;flex-direction:column;gap:12px}#pqllCard .pn.on{display:flex}" +
    /* tab Ruas */
    "#pqllCard .em{display:flex;flex-direction:column;gap:4px;padding:18px 6px;text-align:center;color:#9db0c4}#pqllCard .em b{color:#e6edf5;font:600 13px var(--display,system-ui)}" +
    "#pqllCard .sh{display:flex;gap:8px;align-items:flex-start}#pqllCard .sh b{flex:1;min-width:0;font:600 14.5px/1.25 var(--display,system-ui);overflow-wrap:anywhere}#pqllCard .tag{flex:none;color:#06121d;font:700 10px/1 var(--mono,system-ui);padding:4px 7px;border-radius:999px;white-space:nowrap}#pqllCard .ss{font-size:11px;color:#9db0c4;margin-top:-6px}" +
    "#pqllCard .vd{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.045);border-left:3px solid var(--c)}#pqllCard .vd .lvn{font:700 16px var(--display,system-ui);color:var(--c)}#pqllCard .vd .spd{font:700 21px var(--display,system-ui);color:#fff;font-variant-numeric:tabular-nums}#pqllCard .vd .spd small{font:500 11px var(--mono,system-ui);color:#9db0c4}#pqllCard .vd .src{margin-left:auto;align-self:center;font:700 9.5px/1 var(--mono,system-ui);padding:4px 7px;border-radius:999px;background:rgba(148,178,204,.16);color:#b9c9da}#pqllCard .vd .src.lv{background:#22d3ee;color:#06121d}#pqllCard .vd.wt{--c:#8fa6bd}#pqllCard .vd.wt .lvn{font-size:13px}" +
    "#pqllCard .kv{font-size:11.5px;color:#cfe0f0;margin-top:-4px}#pqllCard .kv.dim,#pqllCard .nt{color:#8fa6bd}#pqllCard .kv b{font-weight:700}#pqllCard .kv .or{color:#fb923c}#pqllCard .kv .rd{color:#f87171}#pqllCard .tp{margin:0;padding:8px 10px;border-radius:10px;border-left:3px solid var(--c,#22d3ee);background:rgba(255,255,255,.04);font-size:11.5px;color:#e6edf5}" +
    "#pqllCard .pqll-sp{display:flex;align-items:flex-end;gap:1px;height:44px}#pqllCard .pqll-sp i{flex:1;border-radius:2px 2px 0 0;display:block}#pqllCard .pqll-ax{display:flex;justify-content:space-between;font-size:9px;color:#8fa6bd;margin-top:-8px}" +
    "#pqllCard .lk{padding:0;border:0;background:0 0;color:#22d3ee;font:600 11.5px var(--mono,system-ui);cursor:pointer;text-decoration:underline;text-underline-offset:2px}" +
    "#pqllCard details.dt{border:1px solid rgba(148,178,204,.18);border-radius:10px;padding:0 10px}#pqllCard details.dt summary{cursor:pointer;padding:8px 0;font-weight:600;font-size:11.5px;color:#cfe0f0;list-style:none;display:flex;align-items:center;gap:6px}#pqllCard details.dt summary::-webkit-details-marker{display:none}#pqllCard details.dt summary::after{content:'\\203A';margin-left:auto;transition:transform .2s;color:#8fa6bd;font-size:15px}#pqllCard details.dt[open] summary::after{transform:rotate(90deg)}#pqllCard details.dt>ul{margin:0 0 8px;padding-left:16px;font-size:11.5px}#pqllCard details.dt>ul li{margin:3px 0}#pqllCard details.dt>.in{display:flex;flex-direction:column;gap:7px;padding-bottom:10px}" +
    /* tab Area & Atur */
    "#pqllCard h5{margin:0 0 4px;font:600 11.5px var(--display,system-ui);color:#cfe0f0}#pqllCard .lg{display:flex;gap:3px}#pqllCard .lg span{flex:1;text-align:center;padding:3px 0;border-radius:6px;font-size:9.5px;font-weight:700;color:#0a0e17}" +
    "#pqllCard .rw{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:8px}#pqllCard .rw.cl{cursor:pointer}#pqllCard .rw.cl:hover,#pqllCard .rw.cl:focus-visible{background:rgba(255,255,255,.07);outline:0}#pqllCard .rw .d{width:9px;height:9px;border-radius:50%;flex:none}#pqllCard .rw .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#pqllCard .rw .v{color:#9db0c4;font-variant-numeric:tabular-nums;text-align:right}" +
    "#pqllCard .ch{display:grid;grid-template-columns:1fr 1fr;gap:5px}#pqllCard .ch button{display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:9px;border:1px solid rgba(148,178,204,.25);background:#0f1726;color:#cfe0f0;font:600 11.5px var(--mono,system-ui);cursor:pointer;text-align:left}#pqllCard .ch button.on{border-color:var(--c);background:rgba(255,255,255,.06)}#pqllCard .ch i{width:14px;height:5px;border-radius:3px;background:var(--c);opacity:.35;flex:none}#pqllCard .ch button.on i{opacity:1}#pqllCard .ch small{margin-left:auto;color:#8fa6bd;font-weight:500}" +
    "#pqllCard .tb{display:flex;gap:5px}#pqllCard .tb button,#pqllCard .ft button{flex:1;padding:7px 8px;border-radius:9px;border:1px solid rgba(148,178,204,.25);background:#0f1726;color:#cfe0f0;font:600 11.5px var(--mono,system-ui);cursor:pointer}#pqllCard .tb button.on{background:#155e75;border-color:#22d3ee;color:#fff}#pqllCard .ft{display:flex;gap:5px;flex-wrap:wrap}" +
    "#pqllCard .sb{display:none;flex-direction:column;gap:7px}#pqllCard .sb.on{display:flex}#pqllCard select,#pqllCard input[type=text],#pqllCard input[type=password]{width:100%;padding:7px 9px;border-radius:9px;border:1px solid rgba(148,178,204,.25);background:#0f1726;color:#e6f1fb;font:12px var(--mono,system-ui)}#pqllCard input[type=range]{width:100%;accent-color:#22d3ee}#pqllTk{-webkit-text-security:disc;text-security:disc}" +
    "#pqllCard label{display:flex;gap:7px;align-items:flex-start;font-size:11.5px;color:#dbe7f3;cursor:pointer}#pqllCard input[type=checkbox]{margin:2px 0 0;accent-color:#22d3ee;flex:none}#pqllCard .nt{font-size:10.5px;line-height:1.4}#pqllCard .ft button:focus-visible,#pqllCard .tb button:focus-visible,#pqllCard .ch button:focus-visible{outline:2px solid #22d3ee;outline-offset:1px}" +
    "@media(max-width:700px){#pqllCard{left:8px;right:8px;width:auto;top:auto;bottom:calc(8px + env(safe-area-inset-bottom,0px));max-height:min(64vh,calc(100vh - 120px));max-height:min(64dvh,calc(100dvh - 120px))}}" +
    "@media(prefers-reduced-motion:reduce){#pqllCard *{animation:none!important;transition:none!important}}";
  var LVL_LEG = function () { return "<div class='lg'>" + LV.map(function (l, i) { return "<span style='background:" + l.c + (i === 4 ? ";color:#fff" : "") + "' title='" + l.n + "'>" + (i === 4 ? "Parah" : l.n.split(" ")[0]) + "</span>"; }).join("") + "</div>"; };
  var TABS = [["sel", "Ruas"], ["area", "Area"], ["set", "Atur"]];
  /* strip status: hanya tampil saat memuat / galat / saran zoom */
  function status() {
    var el = $("pqllSt"); if (!el) return;
    var t = S.loadErr || (S.busy ? (S.prog || "Memuat jalan di area ini…") : (S.hint || ""));
    el.className = "st" + (S.loadErr ? " er" : S.busy ? " bz" : ""); el.textContent = t; el.style.display = t ? "" : "none";
    var rl = $("pqllRl"); if (rl) rl.classList.toggle("busy", !!S.busy);
  }
  function nowLabel() { var d = new Date(); return HARI[d.getDay()] + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + " · " + KEYS[autoKey(d)].split(" (")[0]; }
  function setMin(v) {
    S.min = !!v; if (!card) return; card.classList.toggle("min", S.min);
    var b = $("pqllMin"); if (b) { b.title = S.min ? "Perbesar" : "Kecilkan"; b.setAttribute("aria-label", b.title); b.setAttribute("aria-expanded", String(!S.min)); }
    savePref();
  }
  function paintTabs() {
    if (!card) return;
    TABS.forEach(function (t) {
      var b = card.querySelector("[data-t=" + t[0] + "]"), p = card.querySelector("[data-p=" + t[0] + "]"), on = S.tab === t[0];
      if (b) { b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle("has", t[0] === "sel" && !!S.sel); }
      if (p) p.classList.toggle("on", on);
    });
    if (S.tab === "sel") renderSel();
  }
  function setTab(t) { S.tab = t; savePref(); if (S.min) setMin(false); paintTabs(); }
  /* kepala: ikon lampu lalu lintas berwarna sesuai kondisi + ringkasan satu baris */
  function headline(sm) {
    var hd = $("pqllHl"); if (!hd) return;
    var c = "#8fa6bd", main = "", sub = "", v = selView();
    if (S.sel) {
      var nm = S.sel.g ? S.sel.g.name : "Titik di peta";
      if (v && v.li != null) { c = LV[v.li].c; main = LV[v.li].n + " · " + Math.round(v.sp) + " km/j"; }
      else main = S.sel.wait ? "Memeriksa…" : "Tanpa data langsung";
      sub = nm;
    } else {
      var a = sm && sm.all;
      if (a && a.km > 0) { var r = a.rk / a.km, vv = a.vk / a.km; c = LV[lvOf(r)].c; main = LV[lvOf(r)].n + " · " + Math.round(vv) + " km/j"; sub = "rata-rata layar · " + Math.round(a.pad / a.km * 100) + "% padat"; }
      else { main = S.busy ? "Memuat jalan…" : (S.ttKey && S.pick ? "Ketuk peta" : "Ketuk garis jalan"); sub = S.busy ? "" : "untuk cek kondisi"; }
    }
    card.style.setProperty("--hc", c);
    hd.innerHTML = "<i></i><b>" + esc(main) + "</b>" + (sub ? "<span>" + esc(sub) + "</span>" : "");
    var pl = $("pqllPill"); if (pl) { var lvOn = !!(S.live && S.ttKey); pl.textContent = lvOn ? "Live" : "Model"; pl.className = "pill" + (lvOn ? " lv" : ""); pl.title = lvOn ? "Lapisan lalu lintas langsung aktif" : "Estimasi model (bukan sensor langsung)"; }
  }
  function renderCard() {
    if (!card) return; var sm = summarize(), h = curHour(), key = curKey();
    var cnt = {}; segs.forEach(function (g) { cnt[g.c] = (cnt[g.c] || 0) + 1; });
    var q = function (id) { return card.querySelector(id); };
    CK.forEach(function (c) { var b = q("[data-c=" + c + "]"); if (b) { b.className = S.cls[c] ? "on" : ""; var sEl = b.querySelector("small"); if (sEl) sEl.textContent = cnt[c] || ""; } });
    q("#pqllNow").className = S.mode === "now" ? "on" : ""; q("#pqllSim").className = S.mode === "sim" ? "on" : "";
    q("#pqllSimBox").classList.toggle("on", S.mode === "sim");
    q("#pqllHr").value = h; q("#pqllHrL").textContent = pad2(h) + ":00" + (S.mode === "now" ? " (sekarang)" : ""); q("#pqllKey").value = key;
    q("#pqllMode").textContent = S.mode === "now" ? nowLabel() : KEYS[key].split(" (")[0] + " · simulasi " + pad2(h) + ":00";
    q("#pqllPlay").textContent = S.play ? "■ Hentikan" : "▶ Animasi 24 jam";
    var rows = CK.filter(function (c) { return S.cls[c] && sm.st[c].km > 0; }).map(function (c) { var s = sm.st[c], v = s.vk / s.km, lv = lvOf(v / CLS[c].ff);
      return "<div class='rw'><span class='d' style='background:" + LV[lv].c + "'></span><span class='n'>" + CLS[c].full + "</span><span class='v'>" + Math.round(v) + " km/j · " + Math.round(s.pad / s.km * 100) + "% padat · " + (s.km >= 10 ? Math.round(s.km) : s.km.toFixed(1)) + " km</span></div>"; }).join("");
    q("#pqllSum").innerHTML = rows || "<div class='nt'>Belum ada jalan termuat di layar ini (zoom lebih dekat).</div>";
    q("#pqllHot").innerHTML = sm.top.length ? sm.top.map(function (g) { return "<div class='rw cl' tabindex='0' role='button' data-h='" + g.id + "'><span class='d' style='background:" + LV[g.lv].c + "'></span><span class='n'>" + esc(g.name) + (g.K ? " · " + esc(g.K.n) : "") + "</span><span class='v'>" + Math.round(g.v) + " km/j</span></div>"; }).join("") : "<div class='nt'>Tidak ada ruas padat pada jam ini di layar.</div>";
    q("#pqllReg").innerHTML = sm.rg.length ? sm.rg.map(function (r) { var rr = r.rk / r.km, lv = lvOf(rr); return "<div class='rw'><span class='d' style='background:" + LV[lv].c + "'></span><span class='n'>" + esc(r.n) + "</span><span class='v'>" + LV[lv].n + "</span></div>"; }).join("") : "<div class='nt'>—</div>";
    q("#pqllTT").checked = !!(S.live && S.ttKey); q("#pqllPk").checked = !!S.pick;
    q("#pqllKs").innerHTML = !S.ttKey ? "Belum ada kunci — hanya estimasi model." : S.own ? "Memakai <b>kunci API Anda sendiri</b> (tersimpan di perangkat ini)." : "Memakai <b>kunci bawaan PETAQU</b> (dipakai bersama, kuota harian terbatas). <b>Disarankan memasang kunci API Anda sendiri</b> (gratis) agar kuota tidak habis oleh pengguna lain — ketuk <b>Panduan kunci</b>.";
    headline(sm); paintTabs(); status();
  }
  function build_ui() {
    if (card) return; if (!$("pqllCss")) { var st = D.createElement("style"); st.id = "pqllCss"; st.textContent = CSS; D.head.appendChild(st); }
    card = D.createElement("div"); card.id = "pqllCard"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Lalu lintas jalan");
    card.innerHTML = "<header><div class='hd' id='pqllHd' role='button' tabindex='0' title='Kecilkan / perbesar panel'><span class='ic'><i class='fa-solid fa-traffic-light'></i></span><div class='tt'><b>Lalu Lintas Jalan</b><div class='hl' id='pqllHl'></div></div></div><span class='pill' id='pqllPill'></span>" +
      "<button class='ib' id='pqllRl' aria-label='Muat ulang jalan' title='Muat ulang jalan'><i class='fa-solid fa-rotate-right'></i></button><button class='ib' id='pqllMin' aria-label='Kecilkan' title='Kecilkan'><i class='fa-solid fa-chevron-down'></i></button><button class='ib' id='pqllX' aria-label='Tutup' title='Tutup'><i class='fa-solid fa-xmark'></i></button></header>" +
      "<nav class='tabs' role='tablist' aria-label='Bagian panel'>" + TABS.map(function (t) { return "<button role='tab' data-t='" + t[0] + "'>" + t[1] + "</button>"; }).join("") + "</nav>" +
      "<div class='st' id='pqllSt' role='status' style='display:none'></div>" +
      "<div class='bd'>" +
      "<section class='pn' data-p='sel' id='pqllSel'></section>" +
      "<section class='pn' data-p='area'>" + LVL_LEG() + "<div><h5>Ringkasan layar</h5><div id='pqllSum'></div></div><div><h5>Titik terpadat (ketuk untuk lihat)</h5><div id='pqllHot'></div></div><div><h5>Kab/kota terpadat di layar</h5><div id='pqllReg'></div></div></section>" +
      "<section class='pn' data-p='set'>" +
      "<div><h5>Jalan yang ditampilkan</h5><div class='ch'>" + CK.map(function (c) { return "<button data-c='" + c + "' style='--c:" + CLS[c].c + "'><i></i>" + CLS[c].full.replace("Jalan ", "") + "<small></small></button>"; }).join("") + "</div></div>" +
      "<div><h5>Waktu</h5><div class='tb'><button id='pqllNow'>Sekarang</button><button id='pqllSim'>Simulasi</button></div><div class='nt' id='pqllMode' style='margin-top:5px'></div>" +
      "<div class='sb' id='pqllSimBox' style='margin-top:7px'><select id='pqllKey' aria-label='Jenis hari'>" + Object.keys(KEYS).map(function (k) { return "<option value='" + k + "'>" + KEYS[k] + "</option>"; }).join("") + "</select><div style='display:flex;gap:8px;align-items:center'><input type='range' id='pqllHr' min='0' max='23' step='1' aria-label='Jam simulasi'><b id='pqllHrL' style='min-width:84px;text-align:right'></b></div><div class='ft'><button id='pqllPlay'>▶ Animasi 24 jam</button></div></div></div>" +
      "<div><h5>PETAQU Live</h5><div style='display:flex;flex-direction:column;gap:7px'><label><input type='checkbox' id='pqllTT'><span>Tampilkan lapisan lalu lintas langsung</span></label><label><input type='checkbox' id='pqllPk'><span>Ketuk peta = cek kondisi langsung di titik itu</span></label><div class='nt' id='pqllKs'></div>" +
      "<details class='dt'><summary>Kunci API sendiri</summary><div class='in'><input type='text' id='pqllTk' name='pqll_live_key' placeholder='Tempel kunci API lalu lintas Anda (opsional)' autocomplete='off' autocapitalize='off' autocorrect='off' spellcheck='false' data-lpignore='true' data-1p-ignore data-form-type='other'><div class='ft'><button id='pqllTs'>Simpan kunci saya</button><button id='pqllTr'>Pakai bawaan</button><button id='pqllTg'>Panduan kunci</button></div></div></details></div></div>" +
      "<div><h5>Alat</h5><div class='ft'><button id='pqllGm'>Google Maps (lalin langsung)</button><button id='pqllCsv'>Ekspor CSV layar</button><button id='pqllRs'>Reset kalibrasi</button></div></div>" +
      "<div class='nt'>Estimasi model dari pola jam/hari, karakter wilayah, kelas &amp; lajur jalan, simpang, dan hujan — bukan data sensor kecuali PETAQU Live aktif. Kelas jalan diperkirakan dari OpenStreetMap.</div>" +
      "</section></div>";
    D.body.appendChild(card);
    var q = function (id) { return card.querySelector(id); };
    q("#pqllX").onclick = close; q("#pqllRl").onclick = reload; q("#pqllMin").onclick = function () { setMin(!S.min); };
    q("#pqllHd").onclick = function () { setMin(!S.min); };
    q("#pqllHd").onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMin(!S.min); } };
    card.querySelector(".tabs").onclick = function (e) { var b = e.target.closest ? e.target.closest("[data-t]") : null; if (b) setTab(b.getAttribute("data-t")); };
    card.querySelector(".tabs").onkeydown = function (e) { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; var i = TABS.findIndex(function (t) { return t[0] === S.tab; }); i = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length; setTab(TABS[i][0]); var nb = card.querySelector("[data-t=" + TABS[i][0] + "]"); if (nb) nb.focus(); };
    q("#pqllSel").onclick = function (e) { var t = e.target.closest ? e.target : null; if (!t) return; if (t.closest("[data-clr]")) clearSel(); else { var go = t.closest("[data-go]"); if (go) setTab(go.getAttribute("data-go")); } };
    CK.forEach(function (c) { q("[data-c=" + c + "]").onclick = function () { S.cls[c] = !S.cls[c]; savePref(); var m = getMap(); if (m && groups[c]) { if (S.cls[c]) m.addLayer(groups[c]); else m.removeLayer(groups[c]); } ensure().then(renderCard); renderCard(); }; });
    q("#pqllNow").onclick = function () { S.mode = "now"; stopPlay(); recolor(); }; q("#pqllSim").onclick = function () { if (S.mode !== "sim") { S.mode = "sim"; S.hour = hourNow(); S.key = autoKey(new Date()); } recolor(); };
    q("#pqllHr").oninput = function (e) { S.hour = +e.target.value; recolor(); }; q("#pqllKey").onchange = function (e) { S.key = e.target.value; recolor(); };
    q("#pqllPlay").onclick = function () { if (S.play) stopPlay(); else { S.mode = "sim"; S.play = true; playT = setInterval(function () { S.hour = (S.hour + 1) % 24; recolor(); }, 750); recolor(); } };
    q("#pqllTs").onclick = function () { var v = q("#pqllTk").value.trim(); if (!v) { say("Isi kunci API dulu"); return; } S.ttKey = v; S.own = true; try { W.localStorage.setItem("petaqu_lalin_tt", v); } catch (e) { } q("#pqllTk").value = ""; q("#pqllTk").placeholder = "Kunci tersimpan di perangkat ini"; S.live = true; savePref(); setLive(true); say("Kunci tersimpan · lapisan PETAQU Live aktif"); recolor(); };
    q("#pqllTk").onkeydown = function (e) { if (e.key === "Enter") q("#pqllTs").click(); };
    q("#pqllTr").onclick = function () { S.ttKey = dKey(); S.own = false; try { W.localStorage.removeItem("petaqu_lalin_tt"); } catch (e) { } if (S.live) setLive(true); q("#pqllTk").placeholder = "Tempel kunci API lalu lintas Anda (opsional)"; say("Memakai kunci bawaan"); renderCard(); };
    q("#pqllTT").onchange = function (e) { if (e.target.checked && !S.ttKey) { e.target.checked = false; say("Masukkan & simpan kunci API dulu"); return; } S.live = e.target.checked; savePref(); setLive(S.live); recolor(); };
    q("#pqllPk").onchange = function (e) { S.pick = e.target.checked; savePref(); };
    q("#pqllTg").onclick = function () { window.open("https://developer.tomtom.com/", "_blank", "noopener"); };
    q("#pqllGm").onclick = function () { var m = getMap(), c = m ? m.getCenter() : { lat: -7, lng: 110 }; window.open("https://www.google.com/maps/@" + c.lat.toFixed(5) + "," + c.lng.toFixed(5) + "," + Math.max(10, Math.min(17, m ? m.getZoom() : 13)) + "z/data=!5m1!1e1", "_blank", "noopener"); };
    q("#pqllCsv").onclick = exportCsv; q("#pqllRs").onclick = function () { CAL = {}; lsSet("petaqu_lalin_cal", CAL); recolor(); say("Kalibrasi direset"); };
    var goHot = function (t) { var el = t.closest ? t.closest("[data-h]") : null; if (!el) return; var g = segs.get(+el.getAttribute("data-h")), m = getMap(); if (!g || !m) return; m.flyTo(g.mid, Math.max(m.getZoom(), 15), { duration: .8 }); setTimeout(function () { popup(g, L.latLng(g.mid)); }, 900); };
    q("#pqllHot").onclick = function (e) { goHot(e.target); };
    q("#pqllHot").onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goHot(e.target); } };
    setMin(S.min); paintTabs();
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
    m.off("moveend", onMove).on("moveend", onMove); m.off("zoomend", onZoom).on("zoomend", onZoom); m.off("click", onMapClick).on("click", onMapClick);
    clearInterval(tickT); tickT = setInterval(function () { if (S.on && S.mode === "now") recolor(); }, 300000);
    renderCard(); ensure().then(renderCard);
  }
  function close() {
    S.on = false; stopPlay(); clearInterval(tickT); var m = getMap();
    if (card) card.classList.remove("open");
    if (m) { m.off("moveend", onMove); m.off("zoomend", onZoom); m.off("click", onMapClick); CK.forEach(function (c) { if (groups[c] && m.hasLayer(groups[c])) m.removeLayer(groups[c]); }); if (ttLayer) { try { m.removeLayer(ttLayer); } catch (e) { } ttLayer = null; } try { m.closePopup(); } catch (e) { } }
    S.sel = null; unhighlight();
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
