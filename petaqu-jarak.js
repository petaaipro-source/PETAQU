/* ==========================================================================
   PETAQU – Kalkulator Jarak Paket -> AMP / Batching Plant / Quarry
   --------------------------------------------------------------------------
   * Lokasi paket ditentukan di peta (klik / geser pin), dari ruas jalan PETAQU,
     koordinat (desimal, DMS, link Google Maps) atau impor Excel.
   * Jarak lurus (haversine) ke SEMUA fasilitas di data-lokasi.js, jarak jalan
     nyata via OSRM (otomatis, fallback estimasi = lurus x faktor jalan).
   * Estimasi waktu tempuh, batas waktu mutu (hotmix / beton), biaya angkut.
   * Untuk paket berupa ruas: jarak ke titik awal / tengah / akhir + min/maks/rata-rata.
   * Unduh Excel berformula hidup (Ringkasan, Kalkulator, Paket, Parameter, Detail, Fasilitas).
   API: window.PQ_JARAK.toggle() | .addPaket({nama,lat,lng}) | .exportXlsx()
   ========================================================================== */
(function () {
  "use strict";
  if (typeof window === "undefined") { globalThis.window = globalThis; }

  var KEY = "petaqu_jarak_v1";
  var R_EARTH = 6371.0088;
  var OSRM = "https://router.project-osrm.org";
  var JK = ["amp", "bp", "quarry"];
  var JN = {
    amp:    { lab: "AMP",    full: "Asphalt Mixing Plant",   color: "#f97316", unit: "ton", icon: "fa-industry" },
    bp:     { lab: "BP",     full: "Batching Plant (Beton)", color: "#3b82f6", unit: "m³",  icon: "fa-cubes" },
    quarry: { lab: "Quarry", full: "Quarry / Stone Crusher", color: "#eab308", unit: "m³",  icon: "fa-mountain" }
  };
  var DEF = {
    faktor: 1.35, topN: 5, osrm: true, radius: 0,
    kec:   { amp: 35, bp: 30, quarry: 30 },        // km/jam rata-rata dump truck bermuatan
    load:  { amp: 15, bp: 15, quarry: 10 },        // menit muat + bongkar
    tarif: { amp: 2000, bp: 2500, quarry: 2000 },  // Rp per (satuan x km) -> ISI SESUAI HSPK/ANALISA SETEMPAT
    batas: { amp: 120, bp: 90, quarry: 0 }         // batas waktu tempuh (menit), 0 = tanpa batas
  };

  /* ---------------- util ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v, d) { v = parseFloat(String(v).replace(",", ".")); return isFinite(v) ? v : d; }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function hav(a, b) {
    var r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
    var s = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) * Math.sin(dg / 2);
    return 2 * R_EARTH * Math.asin(Math.sqrt(s));
  }
  function fmtKm(x) { return x == null ? "-" : x.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function fmtRp(x) { return x ? "Rp " + Math.round(x).toLocaleString("id-ID") : "-"; }
  function fmtMin(m) { if (m == null) return "-"; m = Math.round(m); var h = Math.floor(m / 60); return h ? h + " j " + (m % 60 < 10 ? "0" : "") + (m % 60) + " m" : m + " m"; }
  function say(m) { try { if (typeof window.toast === "function") return window.toast(m); } catch (e) {} try { console.log(m); } catch (e2) {} }
  function getMap() {
    try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) {}
    return window.map && window.map.addLayer ? window.map : null;
  }
  function getRoads() { try { return typeof roads !== "undefined" && roads ? roads : (window.roads || []); } catch (e) { return window.roads || []; } }

  // "6°57'41.8"S 110°17'00.3"E" -> [lat,lng]
  function parseDMS(txt) {
    var re = /(\d+)\s*°\s*(\d+)\s*['′’]\s*([\d.]+)\s*["″”]?\s*([NSEW])/gi, m, o = {}, n = 0;
    txt = String(txt || "");
    while ((m = re.exec(txt))) {
      var d = +m[1], mi = +m[2], s = +m[3];
      if (mi >= 60 || s > 60) return null;
      var v = d + mi / 60 + s / 3600, h = m[4].toUpperCase();
      o[h] = h === "S" || h === "W" ? -v : v; n++;
    }
    if (n !== 2) return null;
    var lat = o.S != null ? o.S : o.N, lng = o.E != null ? o.E : o.W;
    return lat == null || lng == null ? null : [lat, lng];
  }
  // desimal / DMS / URL google maps
  function parseCoord(t) {
    t = String(t || "").trim(); if (!t) return null;
    var d = parseDMS(t); if (d) return d;
    var m = t.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) || t.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) || t.match(/(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    var a = num(m[1], NaN), b = num(m[2], NaN);
    if (!isFinite(a) || !isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
    return [a, b];
  }

  /* ---------------- fasilitas ---------------- */
  var F = [];
  function loadFas() {
    F = [];
    (window.LOKASI_DATA || []).forEach(function (r) {
      var p = (typeof r.lat === "number" && typeof r.lng === "number") ? [r.lat, r.lng] : parseDMS(r.koordinat);
      if (!p || !JN[r.jenis] || !isFinite(p[0]) || !isFinite(p[1])) return;
      F.push({ i: F.length, jenis: r.jenis, owner: r.owner || "-", kab: r.kabupaten || "-", prov: r.provinsi || "-", alamat: r.alamat || "", lat: p[0], lng: p[1] });
    });
  }

  /* ---------------- state ---------------- */
  var S = { pakets: [], aktif: null, par: clone(DEF), open: false, sec: { par: false, rekap: true }, seq: 1 };
  function load() {
    try {
      var sv = JSON.parse(localStorage.getItem(KEY) || "null");
      if (sv) {
        if (Array.isArray(sv.pakets)) S.pakets = sv.pakets;
        S.aktif = sv.aktif; S.open = !!sv.open; S.seq = sv.seq || 1;
        if (sv.sec) for (var k in sv.sec) S.sec[k] = sv.sec[k];
        if (sv.par) for (var p in DEF) { if (sv.par[p] != null) S.par[p] = (typeof DEF[p] === "object") ? Object.assign({}, DEF[p], sv.par[p]) : sv.par[p]; }
      }
    } catch (e) {}
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ pakets: S.pakets, aktif: S.aktif, par: S.par, open: S.open, sec: S.sec, seq: S.seq })); } catch (e) {} }

  /* ---------------- geometri paket ---------------- */
  var gStore = {};
  function geom(pk) {
    var ck = pk.id + "|" + (pk.ruasId || "") + "|" + pk.lat + "|" + pk.lng;
    if (gStore[ck]) return gStore[ck];
    var pts = null;
    if (pk.tipe === "ruas") {
      var rd = getRoads().filter(function (r) { return r.id === pk.ruasId; })[0];
      if (rd) pts = (rd.points || []).filter(function (p) { return isFinite(p.lat) && isFinite(p.lng) && (p.lat || p.lng); }).map(function (p) { return { lat: +p.lat, lng: +p.lng, sta: p.sta }; });
    }
    if (!pts || !pts.length) pts = [{ lat: pk.lat, lng: pk.lng }];
    var cum = [0]; for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1], pts[i]));
    var len = cum[cum.length - 1], mid = 0;
    for (var j = 0; j < pts.length; j++) { if (cum[j] >= len / 2) { mid = j; break; } }
    if (Object.keys(gStore).length > 60) gStore = {};
    return (gStore[ck] = { pts: pts, len: len, an: { awal: pts[0], tengah: pts[mid], akhir: pts[pts.length - 1] } });
  }

  function anchor(pk) { var g = geom(pk); return g.an[pk.acuan || "tengah"] || g.an.tengah; }

  /* ==========================================================================
     HITUNG JARAK  —  seluruh jarak = RUTE JALAN NYATA (OSRM / data OpenStreetMap)
     • Peringkat ditentukan jarak jalan, bukan jarak lurus. Jarak lurus hanya
       dipakai sebagai batas bawah (jarak jalan >= jarak lurus) untuk memangkas
       kandidat, sehingga hasilnya eksak tanpa perlu menghitung semua fasilitas.
     • Garis di peta = geometri jalan sebenarnya. Tidak ada garis lurus.
     • Estimasi (lurus × faktor) hanya cadangan saat server rute tak terjangkau,
       selalu ditandai "~".
     ========================================================================== */
  var ANCH = ["awal", "tengah", "akhir"];
  var osrmC = {};   // "lat,lng>lat,lng" -> {km,min,sa,sf} | {nr:1}   jarak jalan (sa/sf = jarak titik ke jalan, m)
  var snapC = {};   // "lat,lng" -> {d,loc:[lat,lng]}                 jarak pin ke jalan terdekat
  var rtC = {};     // "lat,lng>lat,lng" -> {pts:[[lat,lng]..],km,min}  geometri rute jalan
  var RCKEY = "petaqu_jarak_rc_v2";
  function pkey(a) { return (+a.lat).toFixed(5) + "," + (+a.lng).toFixed(5); }
  function okey(a, f) { return pkey(a) + ">" + pkey(f); }   // kunci berdasarkan koordinat (bukan indeks) -> cache tetap benar walau data-lokasi berubah
  function loadRC() { try { var sv = JSON.parse(localStorage.getItem(RCKEY) || "null"); if (sv) { osrmC = sv.o || {}; snapC = sv.s || {}; } } catch (e) {} }
  var rcTimer = null;
  function saveRC() {
    clearTimeout(rcTimer);
    rcTimer = setTimeout(function () {
      try {
        var ks = Object.keys(osrmC); if (ks.length > 3000) ks.slice(0, ks.length - 3000).forEach(function (k) { delete osrmC[k]; });
        var sk = Object.keys(snapC); if (sk.length > 1000) sk.slice(0, sk.length - 1000).forEach(function (k) { delete snapC[k]; });
        localStorage.setItem(RCKEY, JSON.stringify({ o: osrmC, s: snapC }));
      } catch (e) {}
    }, 800);
  }

  function calc(pk) {
    var g = geom(pk), an = anchor(pk);
    var rows = F.map(function (f) { return { f: f, lurus: hav(an, f), os: osrmC[okey(an, f)] || null }; });
    var by = {};
    JK.forEach(function (j) { by[j] = rows.filter(function (r) { return r.f.jenis === j; }).sort(function (a, b) { return a.lurus - b.lurus; }); });
    return { pk: pk, g: g, an: an, rows: rows, by: by };
  }
  function derive(r, pk) {
    var j = r.f.jenis, P = S.par, ok = r.os && !r.os.nr;
    var jalan = ok ? r.os.km : r.lurus * P.faktor;
    var waktu = jalan / Math.max(1, P.kec[j]) * 60 + P.load[j];
    var vol = num(pk.vol && pk.vol[j], 0);
    return { jalan: jalan, est: !ok, sf: ok ? (r.os.sf || 0) : 0, waktu: waktu, biaya: vol * P.tarif[j] * jalan, lewat: P.batas[j] > 0 && waktu > P.batas[j] };
  }
  /* N fasilitas terbaik (jenis j) menurut JARAK JALAN. Yang belum diketahui jarak jalannya dianggap estimasi. */
  function ranked(res, j, N) {
    var P = S.par, pool = [], i, r, k = 0;
    for (i = 0; i < res.by[j].length; i++) {
      r = res.by[j][i];
      if (P.radius > 0 && r.lurus > P.radius) break;
      r.os = osrmC[okey(res.an, r.f)] || null;
      if (r.os && r.os.nr) continue;          // tidak terhubung lewat jalan (mis. beda pulau)
      if (k < N || r.os) pool.push(r);
      k++;
    }
    pool.forEach(function (x) { x.d = derive(x, res.pk); });
    return pool.sort(function (a, b) { return a.d.jalan - b.d.jalan; }).slice(0, N);
  }
  function topOf(res, j) { return ranked(res, j, S.par.topN); }

  /* ---------------- OSRM: server, antrean, retry ---------------- */
  var HOSTS = [
    { u: "https://router.project-osrm.org", bad: 0 },
    { u: "https://routing.openstreetmap.de/routed-car", bad: 0 }   // cadangan (OSRM FOSSGIS)
  ];
  function fetchT(url, ms) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, ms || 15000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { if (t) clearTimeout(t); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }, function (e) { if (t) clearTimeout(t); throw e; });
  }
  function osrmReq(path, ms) {
    var now = Date.now(), i = 0;
    var order = HOSTS.slice().sort(function (a, b) { return (now - a.bad < 60000 ? 1 : 0) - (now - b.bad < 60000 ? 1 : 0); });
    function nxt(err) {
      if (i >= order.length) return Promise.reject(err || new Error("OSRM"));
      var h = order[i++];
      return fetchT(h.u + path, ms).then(function (j) {
        if (j && (j.code === "Ok" || j.code === "NoRoute" || j.code === "NoSegment")) { h.bad = 0; return j; }
        throw new Error((j && j.code) || "OSRM");
      }).catch(function (e) { h.bad = Date.now(); return nxt(e); });
    }
    return nxt();
  }
  function resetHosts() { HOSTS.forEach(function (h) { h.bad = 0; }); }

  // antrean: maks 2 permintaan paralel, jeda >= 180 ms (server publik OSRM dibatasi), prioritas kecil = lebih dulu
  var Q = { run: 0, last: 0, list: [] };
  var seqNet = 0;
  function stale(tok) { return tok != null && tok !== seqNet; }
  function qRun(fn, tok, pri) {
    return new Promise(function (ok, no) {
      Q.list.push({ fn: fn, tok: tok, pri: pri || 0, ok: ok, no: no });
      Q.list.sort(function (a, b) { return a.pri - b.pri; });
      qPump();
    });
  }
  function qPump() {
    while (Q.run < 2 && Q.list.length) {
      var t = Q.list.shift();
      if (stale(t.tok)) { t.ok(0); continue; }
      var wait = Math.max(0, Q.last + 180 - Date.now()); Q.last = Date.now() + wait; Q.run++;
      (function (t, wait) {
        setTimeout(function () {
          if (stale(t.tok)) { Q.run--; t.ok(0); return qPump(); }
          Promise.resolve().then(t.fn).then(t.ok, t.no).then(function () { Q.run--; qPump(); });
        }, wait);
      })(t, wait);
    }
  }

  /* tabel jarak: sumber[] x fasilitas[] -> osrmC. Satu koordinat yang tak bisa dipetakan ke jalan hanya melewatkan fasilitas itu. */
  function tableCall(srcs, fs) {
    var pts = srcs.concat(fs), co = pts.map(function (p) { return (+p.lng).toFixed(6) + "," + (+p.lat).toFixed(6); }).join(";");
    var si = srcs.map(function (_, i) { return i; }).join(";"), di = fs.map(function (_, i) { return srcs.length + i; }).join(";");
    return osrmReq("/table/v1/driving/" + co + "?sources=" + si + "&destinations=" + di + "&annotations=distance,duration", 20000).then(function (j) {
      if (j.code === "NoSegment") {
        var m = /coordinate (\d+)/.exec(j.message || ""), bi = m ? +m[1] : -1;
        if (bi >= srcs.length && bi < pts.length) {
          var bad = fs[bi - srcs.length];
          srcs.forEach(function (s) { osrmC[okey(s, bad)] = { nr: 1 }; });
          var rest = fs.filter(function (x) { return x !== bad; });
          return rest.length ? tableCall(srcs, rest).then(function (n) { return n + 1; }) : 1;
        }
        throw new Error("NoSegmentSrc");
      }
      if (j.code !== "Ok") throw new Error(j.code);
      var n = 0;
      srcs.forEach(function (s, a) {
        var sn = j.sources && j.sources[a];
        if (sn && sn.distance != null && sn.location) snapC[pkey(s)] = { d: Math.round(sn.distance), loc: [sn.location[1], sn.location[0]] };
        fs.forEach(function (f, k) {
          var d = j.distances && j.distances[a] && j.distances[a][k], t = j.durations && j.durations[a] && j.durations[a][k], dn = j.destinations && j.destinations[k];
          osrmC[okey(s, f)] = d == null ? { nr: 1 } : { km: r3(d / 1000), min: t != null ? Math.round(t / 6) / 10 : null, sa: sn ? Math.round(sn.distance) : 0, sf: dn ? Math.round(dn.distance) : 0 };
          n++;
        });
      });
      saveRC();
      return n;
    });
  }
  function fetchTable(srcs, fs, o) {
    return qRun(function () { return tableCall(srcs, fs).then(function (n) { if (o.ctx) o.ctx.ok++; return n; }); }, o.tok, o.pri || 0);
  }
  function errMsg(e) { return e && e.message === "NoSegmentSrc" ? "Titik paket tidak dekat jalan manapun — geser pin ke jalan." : ""; }

  /* pencarian eksak (branch & bound): periksa fasilitas berurutan dari jarak lurus terdekat; berhenti bila
     jarak lurus fasilitas berikutnya sudah melebihi jarak jalan ke-N terbaik (jalan tak mungkin lebih pendek dari garis lurus) */
  var BATCH = 20, MAXPROBE = 80;
  function probeType(res, j, N, o) {
    var arr = res.by[j], an = res.an, idx = 0;
    if (S.par.radius > 0) arr = arr.filter(function (r) { return r.lurus <= S.par.radius; });
    function kth() {
      var km = [];
      for (var i = 0; i < idx && i < arr.length; i++) { var c = osrmC[okey(an, arr[i].f)]; if (c && !c.nr) km.push(c.km); }
      if (km.length < N) return Infinity;
      km.sort(function (a, b) { return a - b; }); return km[N - 1];
    }
    function step() {
      if (stale(o.tok) || idx >= arr.length || idx >= MAXPROBE) return Promise.resolve();
      var k = kth();
      if (k < Infinity && arr[idx].lurus - 0.5 >= k) return Promise.resolve();
      var batch = arr.slice(idx, idx + BATCH); idx += batch.length;
      var need = batch.filter(function (r) { return !osrmC[okey(an, r.f)]; }).map(function (r) { return r.f; });
      if (!need.length) return step();
      return fetchTable([an], need, o).then(step, function (e) { if (o.ctx) { o.ctx.fail++; o.ctx.msg = o.ctx.msg || errMsg(e); } });
    }
    return step();
  }
  // ruas: jarak jalan dari titik awal / tengah / akhir ke fasilitas terbaik
  function fetchAnchors(res, N, o) {
    var cur = res.pk.acuan || "tengah", seen = {}, srcs = [], fs = [];
    seen[pkey(res.an)] = 1;
    ANCH.forEach(function (k) { var p = res.g.an[k]; if (k !== cur && !seen[pkey(p)]) { seen[pkey(p)] = 1; srcs.push(p); } });
    if (!srcs.length) return Promise.resolve();
    JK.forEach(function (j) { ranked(res, j, N).forEach(function (r) { if (srcs.some(function (s) { return !osrmC[okey(s, r.f)]; })) fs.push(r.f); }); });
    var chunks = []; for (var i = 0; i < fs.length; i += 25) chunks.push(fs.slice(i, i + 25));
    return chunks.reduce(function (pr, ch) {
      return pr.then(function () { return stale(o.tok) ? 0 : fetchTable(srcs, ch, o).catch(function () { return 0; }); });
    }, Promise.resolve());
  }
  function solve(res, o) {
    var N = o.N || Math.max(S.par.topN, 3);
    return Promise.all(JK.map(function (j) { return probeType(res, j, N, o).then(function () { if (!o.silent) netRender(); }); }))
      .then(function () { return stale(o.tok) || res.pk.tipe !== "ruas" ? 0 : fetchAnchors(res, N, o); });
  }

  /* geometri rute jalan (untuk digambar di peta) */
  function fetchRoute(an, f, tok, pri) {
    var k = okey(an, f);
    if (rtC[k]) return Promise.resolve(rtC[k]);
    return qRun(function () {
      var path = "/route/v1/driving/" + (+an.lng).toFixed(6) + "," + (+an.lat).toFixed(6) + ";" + (+f.lng).toFixed(6) + "," + (+f.lat).toFixed(6) + "?overview=full&geometries=geojson&steps=false";
      return osrmReq(path, 25000).then(function (j) {
        if (j.code !== "Ok" || !j.routes || !j.routes[0]) return null;
        var rt = j.routes[0], o = rtC[k] = { pts: rt.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }), km: rt.distance / 1000, min: rt.duration / 60 };
        if (!osrmC[k]) osrmC[k] = { km: r3(o.km), min: Math.round(o.min * 10) / 10, sa: 0, sf: 0 };
        var ks = Object.keys(rtC); if (ks.length > 80) delete rtC[ks[0]];
        return o;
      });
    }, tok, pri == null ? 1 : pri).catch(function () { return null; });   // 0 = dibatalkan, null = gagal
  }
  function routesFor(res, o) {
    var jobs = [];
    JK.forEach(function (j) { ranked(res, j, S.par.topN).forEach(function (r, k) { if (r.os && !r.os.nr) jobs.push({ f: r.f, k: k }); }); });
    return Promise.all(jobs.map(function (jb) {
      return fetchRoute(res.an, jb.f, o.tok, jb.k === 0 ? 1 : 2).then(function (rt) {
        if (rt === null) o.ctx.rfail++; else if (rt) drawSoon(o.tok);
      });
    }));
  }

  /* latar belakang: hitung juga paket lain agar "Rekap semua paket" memakai jarak jalan nyata */
  var bg = { run: false, again: false };
  function bgSolve() {
    if (!S.par.osrm) return;
    if (bg.run) { bg.again = true; return; }
    bg.run = true;
    var list = S.pakets.filter(function (p) { return p.id !== S.aktif; }).slice(0, 40), stop = false;
    list.reduce(function (pr, p) {
      return pr.then(function () {
        if (stop) return;
        var ctx = { ok: 0, fail: 0, msg: "" };
        return solve(calc(p), { tok: null, pri: 3, ctx: ctx, silent: true }).catch(function () { ctx.fail++; }).then(function () { if (ctx.fail) stop = true; netRender(); });
      });
    }, Promise.resolve()).then(function () { bg.run = false; if (bg.again) { bg.again = false; bgSolve(); } });
  }

  /* ---------------- peta ---------------- */
  var group = null, rgroup = null, panel = null, btn = null, picking = false, renderTimer = null, osrmState = "", warnMsg = "", hl = {};
  function pkIcon(n, on) {
    return L.divIcon({
      className: "pqj-ico",
      html: '<div class="pqj-pin' + (on ? " on" : "") + '"><span>' + n + "</span></div>",
      iconSize: [30, 38], iconAnchor: [15, 36], popupAnchor: [0, -34]
    });
  }
  function drawMap(res) {
    var M = getMap(); if (!M || !window.L) return;
    if (!group) group = L.layerGroup().addTo(M); else group.clearLayers();
    S.pakets.forEach(function (pk, i) {
      var a = pk.id === S.aktif && res ? res.an : anchor(pk);
      var m = L.marker([a.lat, a.lng], { icon: pkIcon(i + 1, pk.id === S.aktif), draggable: pk.tipe !== "ruas", zIndexOffset: pk.id === S.aktif ? 1000 : 500 });
      m.bindTooltip(esc(pk.nama), { direction: "top", offset: [0, -34] });
      m.on("click", function () { S.aktif = pk.id; save(); refresh(); });
      m.on("dragend", function () {
        var ll = m.getLatLng(); pk.lat = +ll.lat.toFixed(6); pk.lng = +ll.lng.toFixed(6); S.aktif = pk.id; save(); refresh();
      });
      group.addLayer(m);
    });
    if (res) {
      var pk = res.pk;
      if (pk.tipe === "ruas" && res.g.pts.length > 1) {
        group.addLayer(L.polyline(res.g.pts.map(function (p) { return [p.lat, p.lng]; }), { color: "#ef4444", weight: 5, opacity: .85 }));
        ANCH.forEach(function (k) {
          var p = res.g.an[k];
          group.addLayer(L.circleMarker([p.lat, p.lng], { radius: k === (pk.acuan || "tengah") ? 7 : 4, color: "#fff", weight: 2, fillColor: k === (pk.acuan || "tengah") ? "#ef4444" : "#64748b", fillOpacity: 1 }).bindTooltip(k));
        });
      }
      if (S.par.radius > 0) group.addLayer(L.circle([res.an.lat, res.an.lng], { radius: S.par.radius * 1000, color: "#22d3ee", weight: 1.5, dashArray: "6 6", fillOpacity: .04 }));
    }
    drawRoutes(res);
  }
  /* rute jalan nyata ke fasilitas teratas. Rute belum tiba = hanya penanda, TIDAK pernah garis lurus. */
  function drawRoutes(res) {
    var M = getMap(); if (!M || !window.L) return;
    if (!rgroup) rgroup = L.layerGroup().addTo(M); else rgroup.clearLayers();
    hl = {};
    if (!res) return;
    var items = [];
    JK.forEach(function (j) { ranked(res, j, S.par.topN).forEach(function (r, k) { items.push({ j: j, r: r, k: k }); }); });
    items.sort(function (a, b) { return (a.k === 0 ? 1 : 0) - (b.k === 0 ? 1 : 0); });   // terbaik digambar paling atas
    items.forEach(function (it) {
      var r = it.r, c = JN[it.j].color, best = it.k === 0, rt = rtC[okey(res.an, r.f)];
      var tip = JN[it.j].lab + " #" + (it.k + 1) + " · " + esc(r.f.owner) + " — " + fmtKm(r.d.jalan) + " km" + (r.d.est ? " (estimasi)" : " via jalan");
      if (rt && rt.pts.length > 1) {
        if (best) rgroup.addLayer(L.polyline(rt.pts, { color: "#fff", weight: 9, opacity: .5, lineCap: "round", lineJoin: "round", interactive: false }));
        var w = best ? 5 : 3, op = best ? .95 : .72;
        var ln = L.polyline(rt.pts, { color: c, weight: w, opacity: op, lineCap: "round", lineJoin: "round" }).bindTooltip(tip, { sticky: true });
        rgroup.addLayer(ln); hl[it.j + ":" + r.f.i] = { line: ln, w: w, op: op };
      }
      rgroup.addLayer(L.circleMarker([r.f.lat, r.f.lng], { radius: best ? 12 : 8, color: best ? "#22c55e" : c, weight: best ? 4 : 2, fillColor: c, fillOpacity: .25 }).bindTooltip(tip, { direction: "top" }));
    });
  }
  function hilite(key, on) {
    var o = hl[key]; if (!o) return;
    o.line.setStyle({ weight: on ? o.w + 3 : o.w, opacity: on ? 1 : o.op }); if (on) o.line.bringToFront();
  }
  var drawT = null;
  function drawSoon(tok) {
    clearTimeout(drawT);
    drawT = setTimeout(function () { if (stale(tok)) return; var pk = active(); drawRoutes(pk ? calc(pk) : null); }, 150);
  }
  function showRoute(pk, r) {
    var M = getMap(); if (!M) return;
    var a = anchor(pk), k = okey(a, r.f);
    function go(rt) {
      var b = L.latLngBounds(rt.pts); M.fitBounds(b, { padding: [60, 60] });
      say("Rute jalan " + fmtKm(rt.km) + " km");
    }
    if (rtC[k]) return go(rtC[k]);
    say("Mengambil rute jalan…");
    fetchRoute(a, r.f, null, 0).then(function (rt) {
      if (!rt) return say("Rute jalan tidak tersedia (server rute tidak terjangkau)");
      go(rt); drawSoon(null);
    });
  }

  /* ---------------- paket CRUD ---------------- */
  function uid() { return "pk" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function uniqueName(n) {
    var base = n, k = 2; while (S.pakets.some(function (p) { return p.nama === n; })) n = base + " (" + k++ + ")"; return n;
  }
  function addPaket(o) {
    var pk = {
      id: uid(), nama: uniqueName(o.nama || ("Paket " + S.seq++)), tipe: o.tipe || "titik", lat: +o.lat, lng: +o.lng,
      ruasId: o.ruasId || null, acuan: o.acuan || "tengah", vol: o.vol || { amp: 0, bp: 0, quarry: 0 }
    };
    if (!isFinite(pk.lat) || !isFinite(pk.lng)) return null;
    S.pakets.push(pk); S.aktif = pk.id; save(); refresh();
    var M = getMap(); if (M && o.fly !== false) { var a = anchor(pk); M.setView([a.lat, a.lng], Math.max(M.getZoom(), 11)); }
    return pk;
  }
  function active() { return S.pakets.filter(function (p) { return p.id === S.aktif; })[0] || null; }
  function pickOnMap() {
    var M = getMap(); if (!M) return;
    picking = true; M.getContainer().style.cursor = "crosshair"; say("Klik lokasi paket di peta (Esc = batal)");
    M.once("click", function (e) {
      picking = false; M.getContainer().style.cursor = "";
      addPaket({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6), fly: false });
    });
  }
  typeof document !== "undefined" && document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && picking) { var M = getMap(); picking = false; if (M) { M.off("click"); M.getContainer().style.cursor = ""; } }
  });

  function importXlsx(file) {
    if (!file || !window.XLSX) return say("Pustaka Excel belum siap");
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var wb = XLSX.read(fr.result, { type: "array" }), ws = wb.Sheets[wb.SheetNames[0]], rows = XLSX.utils.sheet_to_json(ws, { defval: "" }), n = 0;
        rows.forEach(function (row) {
          var low = {}; Object.keys(row).forEach(function (k) { low[k.toString().toLowerCase().trim()] = row[k]; });
          var nama = low["nama"] || low["paket"] || low["nama paket"] || low["name"] || low["ruas"] || "";
          var lat = num(low["lat"] != null && low["lat"] !== "" ? low["lat"] : low["latitude"], NaN), lng = num(low["lng"] != null && low["lng"] !== "" ? low["lng"] : (low["lon"] != null && low["lon"] !== "" ? low["lon"] : (low["long"] != null && low["long"] !== "" ? low["long"] : low["longitude"])), NaN);
          if (!isFinite(lat) || !isFinite(lng)) { var c = parseCoord(low["koordinat"] || low["coordinate"] || low["coord"] || ""); if (c) { lat = c[0]; lng = c[1]; } }
          if (isFinite(lat) && isFinite(lng) && addPaket({ nama: String(nama || ""), lat: lat, lng: lng, fly: false })) n++;
        });
        say(n ? n + " paket diimpor" : "Tidak ada baris valid. Kolom: nama, lat, lng (atau koordinat)");
        var M = getMap(); if (n && M) { var pts = S.pakets.map(function (p) { return [p.lat, p.lng]; }); M.fitBounds(pts, { padding: [60, 60], maxZoom: 13 }); }
      } catch (e) { say("Gagal membaca Excel: " + e.message); }
    };
    fr.readAsArrayBuffer(file);
  }

  /* ---------------- render panel ---------------- */
  var ui = { ruasQ: "", showRuas: false, showCoord: false };
  function refresh(noNet) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function () { doRefresh(noNet); }, 30);
  }
  var nrT = null, pend = false;
  function panelBusy() { var a = document.activeElement; return !!(panel && a && panel.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)); }
  // render ulang akibat data jaringan; tidak menimpa kolom yang sedang diketik
  function netRender() {
    clearTimeout(nrT);
    nrT = setTimeout(function () {
      var pk = active(), res = pk ? calc(pk) : null;
      if (panelBusy()) { pend = true; drawRoutes(res); renderStatus(); return; }
      render(res); drawRoutes(res);
    }, 120);
  }
  function doRefresh(noNet) {
    var pk = active(), res = pk ? calc(pk) : null;
    render(res); drawMap(res);
    if (!res) { osrmState = ""; warnMsg = ""; return; }
    if (noNet) return;
    if (!S.par.osrm) { ++seqNet; osrmState = "off"; warnMsg = ""; renderStatus(); return; }
    var my = ++seqNet, ctx = { ok: 0, fail: 0, rfail: 0, msg: "" };
    osrmState = "load"; warnMsg = ""; renderStatus();
    solve(res, { tok: my, pri: 0, ctx: ctx }).then(function () {
      if (my !== seqNet) return;
      warnMsg = ctx.msg;
      var r2 = calc(pk);
      osrmState = ctx.fail ? (ctx.ok ? "part" : "err") : "route";
      netRender();
      if (ctx.fail && !ctx.ok) return;
      return routesFor(r2, { tok: my, ctx: ctx }).then(function () {
        if (my !== seqNet) return;
        osrmState = ctx.fail ? "part" : (ctx.rfail ? "geo" : "ok"); renderStatus(); bgSolve();
      });
    }).catch(function () { if (my === seqNet) { osrmState = "err"; renderStatus(); } });
  }
  function renderStatus() {
    var el = panel && panel.querySelector("#pqjSt"); if (!el) return;
    var m = {
      load:  ["#fbbf24", "fa-spinner fa-spin", "Menghitung rute jalan…"],
      route: ["#fbbf24", "fa-spinner fa-spin", "Menggambar rute…"],
      ok:    ["#34d399", "fa-circle-check", "Rute jalan nyata"],
      part:  ["#fbbf24", "fa-triangle-exclamation", "Sebagian jarak ~ estimasi"],
      geo:   ["#fbbf24", "fa-triangle-exclamation", "Gambar rute gagal"],
      err:   ["#f87171", "fa-triangle-exclamation", "Server rute offline · ~ estimasi"],
      off:   ["#94a3b8", "fa-ruler", "Estimasi (lurus × " + S.par.faktor + ")"],
      "":    ["#94a3b8", "fa-ruler", ""]
    }[osrmState || ""];
    el.innerHTML = '<span style="color:' + m[0] + '"><i class="fa-solid ' + m[1] + '"></i> ' + m[2] + '</span>' +
      (osrmState === "err" || osrmState === "part" || osrmState === "geo" ? ' <u data-retry style="cursor:pointer;color:#22d3ee">Coba lagi</u>' : "");
  }

  function snapHTML(pk, a) {
    var sn = snapC[pkey(a)], h = "";
    if (warnMsg) h += '<div class="pqj-warn"><i class="fa-solid fa-triangle-exclamation"></i> ' + esc(warnMsg) + '</div>';
    if (sn && sn.d > 100 && pk.tipe !== "ruas") h += '<div class="pqj-warn"><i class="fa-solid fa-road"></i> Pin ±' + sn.d + ' m dari jalan terdekat — jarak jalan dihitung dari jalan itu. <button class="pqj-ib" data-snap>Tempel ke jalan</button></div>';
    return h;
  }
  function inp(id, v, w, step) { return '<input class="pqj-in" data-f="' + id + '" type="number" step="' + (step || "any") + '" value="' + esc(v) + '" style="width:' + (w || 64) + 'px">'; }

  function blockHTML(res, j) {
    var c = JN[j], rows = topOf(res, j), pk = res.pk;
    var head = '<div class="pqj-bh" style="border-color:' + c.color + '"><span class="dot" style="background:' + c.color + '"><i class="fa-solid ' + c.icon + '"></i></span><b>' + c.lab + '</b><small>' + c.full + '</small><span class="n">' + res.by[j].length + ' titik</span></div>';
    if (!rows.length) return '<div class="pqj-blk">' + head + '<div class="pqj-empty">Tidak ada ' + c.lab + (S.par.radius > 0 ? ' dalam radius ' + S.par.radius + ' km' : "") + '</div></div>';
    var body = rows.map(function (r, k) {
      var d = r.d, ruasInfo = "";
      if (pk.tipe === "ruas") {
        ruasInfo = '<div class="sub">jalan dari ' + ANCH.map(function (a) { var o = osrmC[okey(res.g.an[a], r.f)]; return a + " " + (o && !o.nr ? fmtKm(o.km) : "…"); }).join(" · ") + " km</div>";
      }
      var far = d.sf > 300 ? '<div class="sub" style="color:#fbbf24">koordinat fasilitas ±' + Math.round(d.sf) + ' m dari jalan</div>' : "";
      return '<tr class="' + (k === 0 ? "best " : "") + (d.lewat ? "warn" : "") + '" data-rt="' + j + ':' + r.f.i + '">' +
        '<td class="rk">' + (k + 1) + '</td><td class="nm"><b>' + esc(r.f.owner) + '</b><div class="sub">' + esc(r.f.kab) + ' · ' + esc(r.f.prov) + '</div>' + ruasInfo + far + '</td>' +
        '<td class="r jl">' + fmtKm(d.jalan) + (d.est ? '<i class="est" title="Estimasi (lurus × faktor) — rute jalan belum tersedia">~</i>' : '<i class="ok" title="Rute jalan nyata (OSRM)">●</i>') + '</td>' +
        '<td class="r dim">' + fmtKm(r.lurus) + '</td>' +
        '<td class="r">' + fmtMin(d.waktu) + (d.lewat ? '<div class="lw">lewat batas</div>' : "") + '</td>' +
        '<td class="r">' + fmtRp(d.biaya) + '</td></tr>';
    }).join("");
    return '<div class="pqj-blk">' + head + '<table class="pqj-t"><thead><tr><th>#</th><th>Lokasi</th><th>Jalan<br>km</th><th>Lurus<br>km</th><th>Waktu</th><th>Biaya</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function cardsHTML(res) {
    return '<div class="pqj-cards">' + JK.map(function (j) {
      var r = topOf(res, j)[0], c = JN[j];
      if (!r) return '<div class="pqj-card" style="border-color:' + c.color + '55"><b style="color:' + c.color + '">' + c.lab + '</b><div class="big">–</div></div>';
      return '<div class="pqj-card" style="border-color:' + c.color + '88" data-rt="' + j + ':' + r.f.i + '"><b style="color:' + c.color + '"><i class="fa-solid ' + c.icon + '"></i> ' + c.lab + '</b>' +
        '<div class="big">' + fmtKm(r.d.jalan) + '<small> km</small></div><div class="sm">' + fmtMin(r.d.waktu) + '</div><div class="sm nm">' + esc(r.f.owner) + '</div></div>';
    }).join("") + "</div>";
  }

  function rekapHTML() {
    if (S.pakets.length < 2) return "";
    var P = S.par, tot = 0;
    var rows = S.pakets.map(function (pk, i) {
      var res = calc(pk), cells = JK.map(function (j) {
        var r = topOf(res, j)[0]; if (!r) return '<td class="r">-</td>';
        return '<td class="r" title="' + esc(r.f.owner) + '">' + fmtKm(r.d.jalan) + (r.d.est ? '<i class="est" title="Estimasi">~</i>' : "") + '</td>';
      }).join("");
      return '<tr data-pk="' + pk.id + '" class="' + (pk.id === S.aktif ? "best" : "") + '"><td class="rk">' + (i + 1) + '</td><td class="nm"><b>' + esc(pk.nama) + '</b></td>' + cells + '</tr>';
    }).join("");
    return '<div class="pqj-sec"><div class="t" data-tg="rekap"><i class="fa-solid fa-chevron-' + (S.sec.rekap ? "down" : "right") + '"></i> Rekap semua paket (jarak jalan terdekat, km)</div>' +
      (S.sec.rekap ? '<table class="pqj-t"><thead><tr><th>#</th><th>Paket</th><th>AMP</th><th>BP</th><th>Quarry</th></tr></thead><tbody>' + rows + '</tbody></table>' : "") + '</div>';
  }

  function render(res) {
    if (!panel) return;
    var bd = panel.querySelector(".bd"), sc = bd ? bd.scrollTop : 0, P = S.par, pk = active();
    var chips = S.pakets.map(function (p, i) {
      return '<span class="pqj-chip' + (p.id === S.aktif ? " on" : "") + '" data-pk="' + p.id + '"><b>' + (i + 1) + '</b> ' + esc(p.nama) + (p.tipe === "ruas" ? ' <i class="fa-solid fa-road"></i>' : "") + '</span>';
    }).join("");
    var ed = "";
    if (pk) {
      var a = res ? res.an : anchor(pk);
      ed = '<div class="pqj-ed"><div class="row"><input class="pqj-in" data-f="nama" value="' + esc(pk.nama) + '" style="flex:1" placeholder="Nama paket">' +
        '<button class="pqj-ib" data-del title="Hapus paket"><i class="fa-solid fa-trash"></i></button></div>' +
        '<div class="row">' + (pk.tipe === "ruas"
          ? '<span class="lb">Acuan</span><select class="pqj-in" data-f="acuan">' + ["awal", "tengah", "akhir"].map(function (k) { return '<option value="' + k + '"' + ((pk.acuan || "tengah") === k ? " selected" : "") + ">Titik " + k + "</option>"; }).join("") + '</select><span class="lb">' + fmtKm(res ? res.g.len : 0) + ' km</span>'
          : '<span class="lb">Lat</span><input class="pqj-in" data-f="lat" value="' + pk.lat + '" style="width:92px"><span class="lb">Lng</span><input class="pqj-in" data-f="lng" value="' + pk.lng + '" style="width:92px"><button class="pqj-ib" data-cpy title="Salin koordinat"><i class="fa-regular fa-copy"></i></button>') + '</div>' +
        (pk.tipe === "ruas" ? '<div class="sub">Titik acuan: ' + a.lat.toFixed(5) + ', ' + a.lng.toFixed(5) + '</div>' : "") +
        snapHTML(pk, a) +
        '<div class="row vol"><span class="lb">Volume</span>' + JK.map(function (j) { return '<label>' + JN[j].lab + ' ' + inp("vol_" + j, (pk.vol && pk.vol[j]) || 0, 58) + '<small>' + JN[j].unit + '</small></label>'; }).join("") + '</div></div>';
    }
    var ruasList = "";
    if (ui.showRuas) {
      var q = ui.ruasQ.toLowerCase(), rd = getRoads().filter(function (r) { return !q || (r.name || "").toLowerCase().indexOf(q) > -1; }).slice(0, 40);
      ruasList = '<div class="pqj-pop"><input class="pqj-in" id="pqjRq" placeholder="Cari nama ruas… (' + getRoads().length + ' ruas)" value="' + esc(ui.ruasQ) + '" style="width:100%">' +
        '<div class="lst">' + (rd.map(function (r) { return '<div class="it" data-ruas="' + esc(r.id) + '"><i class="fa-solid fa-road"></i> ' + esc(r.name) + '</div>'; }).join("") || '<div class="sub">Tidak ada ruas</div>') + '</div></div>';
    }
    var coord = ui.showCoord ? '<div class="pqj-pop"><input class="pqj-in" id="pqjCo" placeholder="-7.0123, 110.4567  |  6°57\'41.8&quot;S 110°17\'00.3&quot;E  |  link Google Maps" style="width:100%"><button class="pqj-b" data-coadd style="margin-top:6px;width:100%">Tambah paket dari koordinat</button></div>' : "";

    panel.innerHTML =
      '<div class="hd"><i class="fa-solid fa-ruler-combined" style="color:#22d3ee"></i> Kalkulator Jarak Paket<span class="sum" id="pqjSt"></span><button class="x" data-close title="Tutup"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="bd">' +
      '<div class="pqj-sec"><div class="t">Lokasi paket</div>' +
      '<div class="pqj-act"><button class="pqj-b" data-pick><i class="fa-solid fa-location-crosshairs"></i> Klik peta</button>' +
      '<button class="pqj-b s" data-center><i class="fa-solid fa-bullseye"></i> Pusat peta</button>' +
      '<button class="pqj-b s" data-ruas><i class="fa-solid fa-road"></i> Dari ruas</button>' +
      '<button class="pqj-b s" data-coord><i class="fa-solid fa-keyboard"></i> Koordinat</button>' +
      '<button class="pqj-b s" data-imp><i class="fa-solid fa-file-import"></i> Impor</button><input type="file" id="pqjFile" accept=".xlsx,.xls,.csv" hidden></div>' +
      ruasList + coord +
      (chips ? '<div class="pqj-chips">' + chips + '</div>' : '<div class="pqj-empty">Belum ada paket. Klik <b>Klik peta</b> lalu pilih lokasi paket, atau pilih ruas PETAQU.</div>') + ed + '</div>' +
      (res ? cardsHTML(res) + JK.map(function (j) { return blockHTML(res, j); }).join("") : "") +
      rekapHTML() +
      '<div class="pqj-sec"><div class="t" data-tg="par"><i class="fa-solid fa-chevron-' + (S.sec.par ? "down" : "right") + '"></i> Parameter perhitungan</div>' + (S.sec.par ?
        '<div class="pqj-par"><div class="row"><span class="lb">Faktor jalan (cadangan)</span>' + inp("p_faktor", P.faktor, 60, 0.05) + '<span class="lb">Top-N</span>' + inp("p_topN", P.topN, 46, 1) + '<span class="lb">Radius km</span>' + inp("p_radius", P.radius, 52, 1) + '</div>' +
        '<label class="chk"><input type="checkbox" data-f="p_osrm"' + (P.osrm ? " checked" : "") + '> Hitung jarak lewat rute jalan nyata (OSRM, butuh internet)</label>' +
        '<table class="pqj-t pp"><thead><tr><th></th><th>km/jam</th><th>Muat+bongkar<br>menit</th><th>Tarif<br>Rp/sat·km</th><th>Batas waktu<br>menit (0=bebas)</th></tr></thead><tbody>' +
        JK.map(function (j) { return '<tr><td><b style="color:' + JN[j].color + '">' + JN[j].lab + '</b></td><td>' + inp("kec_" + j, P.kec[j], 52) + '</td><td>' + inp("load_" + j, P.load[j], 52) + '</td><td>' + inp("tarif_" + j, P.tarif[j], 70) + '</td><td>' + inp("batas_" + j, P.batas[j], 56) + '</td></tr>'; }).join("") +
        '</tbody></table><div class="sub">Tarif & batas waktu adalah nilai awal — sesuaikan dengan HSPK/analisa harga satuan dan spesifikasi proyek.</div></div>' : "") + '</div>' +
      '</div><div class="ft"><button class="sec" data-fit><i class="fa-solid fa-expand"></i> Zoom</button><button class="sec" data-lok><i class="fa-solid fa-industry"></i> Layer lokasi</button><button data-xl><i class="fa-solid fa-file-excel"></i> Unduh Excel</button></div>';
    var nb = panel.querySelector(".bd"); if (nb) nb.scrollTop = sc;
    renderStatus();
  }

  /* ---------------- events ---------------- */
  function onClick(e) {
    var t = e.target, el, M = getMap();
    if (t.closest("[data-close]")) return toggle(false);
    if (t.closest("[data-retry]")) { resetHosts(); return refresh(); }
    if (t.closest("[data-snap]")) {
      var p3 = active(), sn = p3 && snapC[pkey(anchor(p3))];
      if (sn && sn.loc) { p3.lat = +sn.loc[0].toFixed(6); p3.lng = +sn.loc[1].toFixed(6); save(); say("Pin dipindah ke jalan terdekat"); refresh(); }
      return;
    }
    if ((el = t.closest("[data-rt]"))) {
      var pr = el.getAttribute("data-rt").split(":"), f = F[+pr[1]], pk = active(); if (!f || !pk) return;
      return showRoute(pk, { f: f });
    }
    if ((el = t.closest("[data-pk]"))) { S.aktif = el.getAttribute("data-pk"); save(); var p = active(); if (p && M) { var a = anchor(p); M.setView([a.lat, a.lng], Math.max(M.getZoom(), 11)); } return refresh(); }
    if ((el = t.closest("[data-tg]"))) { var id = el.getAttribute("data-tg"); S.sec[id] = !S.sec[id]; save(); return refresh(true); }
    if (t.closest("[data-pick]")) return pickOnMap();
    if (t.closest("[data-center]")) { if (M) { var c = M.getCenter(); addPaket({ lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), fly: false }); } return; }
    if (t.closest("[data-ruas]")) { ui.showRuas = !ui.showRuas; ui.showCoord = false; return render(active() && calc(active())); }
    if (t.closest("[data-coord]")) { ui.showCoord = !ui.showCoord; ui.showRuas = false; return render(active() && calc(active())); }
    if (t.closest("[data-imp]")) return panel.querySelector("#pqjFile").click();
    if (t.closest("[data-coadd]")) {
      var c2 = parseCoord(panel.querySelector("#pqjCo").value); if (!c2) return say("Koordinat tidak dikenali");
      ui.showCoord = false; return addPaket({ lat: c2[0], lng: c2[1] });
    }
    if (t.closest("[data-del]")) { var cur = active(); if (!cur) return; S.pakets = S.pakets.filter(function (p) { return p.id !== cur.id; }); S.aktif = S.pakets.length ? S.pakets[0].id : null; save(); return refresh(); }
    if (t.closest("[data-cpy]")) { var p2 = active(); try { navigator.clipboard.writeText(p2.lat + ", " + p2.lng); say("Koordinat disalin"); } catch (er) {} return; }
    if (t.closest("[data-fit]")) {
      var pts = []; S.pakets.forEach(function (p) { var a = anchor(p); pts.push([a.lat, a.lng]); });
      var cp = active(); if (cp) { var rs = calc(cp); JK.forEach(function (j) { topOf(rs, j).slice(0, 1).forEach(function (r) { pts.push([r.f.lat, r.f.lng]); }); }); }
      if (M && pts.length) M.fitBounds(pts, { padding: [60, 60], maxZoom: 14 }); return;
    }
    if (t.closest("[data-lok]")) { try { window.PQ_LOKASI && window.PQ_LOKASI.toggle(); } catch (er2) {} return; }
    if (t.closest("[data-xl]")) return exportXlsx();
  }
  // klik item ruas (data-ruas pada .it)
  function onClickRuas(e) {
    var el = e.target.closest(".it[data-ruas]"); if (!el) return;
    e.stopPropagation();
    var rd = getRoads().filter(function (r) { return r.id === el.getAttribute("data-ruas"); })[0]; if (!rd) return;
    var pts = (rd.points || []).filter(function (p) { return isFinite(p.lat) && isFinite(p.lng); });
    if (!pts.length) return say("Ruas tidak punya koordinat");
    ui.showRuas = false; ui.ruasQ = "";
    var pk = addPaket({ nama: rd.name, tipe: "ruas", ruasId: rd.id, lat: pts[0].lat, lng: pts[0].lng, acuan: "tengah", fly: false });
    var M = getMap(); if (pk && M) M.fitBounds(pts.map(function (p) { return [p.lat, p.lng]; }), { padding: [70, 70], maxZoom: 15 });
  }
  function onChange(e) {
    var el = e.target, f = el.getAttribute && el.getAttribute("data-f"), pk = active(); if (!f) return;
    if (f === "p_osrm") { S.par.osrm = el.checked; save(); return refresh(); }
    if (f.indexOf("p_") === 0) {
      var k = f.slice(2), v = num(el.value, DEF[k]); if (k === "topN") v = Math.max(1, Math.min(15, Math.round(v))); if (k === "faktor") v = Math.max(1, v); if (k === "radius") v = Math.max(0, v);
      S.par[k] = v; save(); return refresh(true);
    }
    var m = f.match(/^(kec|load|tarif|batas)_(amp|bp|quarry)$/);
    if (m) { S.par[m[1]][m[2]] = Math.max(0, num(el.value, 0)); save(); return refresh(true); }
    if (!pk) return;
    if (f === "nama") { pk.nama = el.value.trim() || pk.nama; save(); return refresh(true); }
    if (f === "acuan") { pk.acuan = el.value; save(); return refresh(); }
    if (f === "lat" || f === "lng") {
      var c = parseCoord(el.value); var val = num(el.value, NaN);
      if (c && f === "lat" && /[,;\s°]/.test(el.value.trim())) { pk.lat = c[0]; pk.lng = c[1]; }   // tempel "lat,lng" di kolom lat
      else if (isFinite(val)) pk[f] = val;
      save(); var M = getMap(); if (M) M.setView([pk.lat, pk.lng], Math.max(M.getZoom(), 12)); return refresh();
    }
    m = f.match(/^vol_(amp|bp|quarry)$/);
    if (m) { pk.vol = pk.vol || {}; pk.vol[m[1]] = Math.max(0, num(el.value, 0)); save(); return refresh(true); }
  }

  /* ---------------- Excel ---------------- */
  var EXJS = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise(function (ok, no) {
      var s = document.createElement("script"); s.src = EXJS; s.onload = function () { window.ExcelJS ? ok(window.ExcelJS) : no(new Error("ExcelJS")); }; s.onerror = function () { no(new Error("ExcelJS tidak dapat dimuat")); };
      document.head.appendChild(s);
    });
  }

  function colL(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m) / 26); } return s; }
  function hf(la1, ln1, la2, ln2) {
    return "ROUND(2*6371.0088*ASIN(SQRT(SIN(RADIANS((" + la2 + ")-(" + la1 + "))/2)^2+COS(RADIANS(" + la1 + "))*COS(RADIANS(" + la2 + "))*SIN(RADIANS((" + ln2 + ")-(" + ln1 + "))/2)^2)),3)";
  }

  /* model murni -> workbook (dapat diuji di Node). opts.noCache: tanpa hasil cache (uji hitung ulang) */
  function buildWorkbook(ExcelJS, model, opts) {
    opts = opts || {};
    var wb = new ExcelJS.Workbook();
    wb.creator = "PETAQU"; wb.created = new Date(); wb.calcProperties = { fullCalcOnLoad: true };
    var P = model.par, FAS = model.fas, PKS = model.pakets, nF = FAS.length;
    var HEAD = "0E7490", HFONT = { bold: true, color: { argb: "FFFFFFFF" } };
    var LAB = { amp: "AMP", bp: "BP", quarry: "Quarry" }, JCOL = { amp: "FFF97316", bp: "FF3B82F6", quarry: "FFEAB308" };
    function res(v, formula) { return opts.noCache ? { formula: formula } : { formula: formula, result: v }; }
    function head(ws, row, cols) {
      ws.getRow(row).values = cols;
      ws.getRow(row).eachCell(function (c) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + HEAD } }; c.font = HFONT; c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; c.border = { bottom: { style: "medium", color: { argb: "FF22D3EE" } } }; });
      ws.getRow(row).height = 32;
    }
    function title(ws, t, sub) {
      ws.getCell("A1").value = t; ws.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF0E7490" } };
      if (sub) { ws.getCell("A2").value = sub; ws.getCell("A2").font = { italic: true, color: { argb: "FF64748B" } }; }
    }
    var INPUT = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };

    var wsR = wb.addWorksheet("Ringkasan", { properties: { tabColor: { argb: "FF22D3EE" } }, views: [{ state: "frozen", ySplit: 5, xSplit: 2 }] });
    var wsK = wb.addWorksheet("Kalkulator", { properties: { tabColor: { argb: "FF34D399" } } });
    var wsP = wb.addWorksheet("Paket", { properties: { tabColor: { argb: "FFEF4444" } }, views: [{ state: "frozen", ySplit: 4 }] });
    var wsA = wb.addWorksheet("Parameter", { properties: { tabColor: { argb: "FFFBBF24" } } });
    var wsD = wb.addWorksheet("Detail", { properties: { tabColor: { argb: "FF3B82F6" } }, views: [{ state: "frozen", ySplit: 4, xSplit: 3 }] });
    var wsF = wb.addWorksheet("Fasilitas", { properties: { tabColor: { argb: "FFEAB308" } }, views: [{ state: "frozen", ySplit: 4 }] });

    /* ---- Parameter ---- */
    title(wsA, "Parameter Perhitungan", "Sel kuning = dapat diubah. Seluruh sheet (Ringkasan, Kalkulator, Detail) langsung menghitung ulang.");
    wsA.getCell("A3").value = "Faktor jalan (jarak jalan = jarak lurus × faktor, bila OSRM tidak tersedia)"; wsA.getCell("A3").font = { bold: true };
    wsA.getCell("B3").value = P.faktor; wsA.getCell("B3").fill = INPUT; wsA.getCell("B3").numFmt = "0.00";
    head(wsA, 5, ["Jenis", "Kecepatan angkut (km/jam)", "Muat + bongkar (menit)", "Tarif angkut (Rp / satuan·km)", "Batas waktu tempuh (menit, 0 = bebas)", "Satuan volume"]);
    JK.forEach(function (j, i) {
      var r = 6 + i;
      wsA.getRow(r).values = [LAB[j], P.kec[j], P.load[j], P.tarif[j], P.batas[j], JN[j].unit];
      for (var c = 2; c <= 5; c++) { wsA.getCell(r, c).fill = INPUT; }
      wsA.getCell(r, 1).font = { bold: true, color: { argb: JCOL[j] } };
      wsA.getCell(r, 4).numFmt = "#,##0";
    });
    wsA.getCell("A10").value = "Catatan: tarif & batas waktu adalah nilai awal — sesuaikan dengan HSPK / analisa harga satuan dan spesifikasi teknis proyek (mis. batas waktu hotmix & beton siap pakai)."; wsA.getCell("A10").font = { italic: true, color: { argb: "FF64748B" } };
    wsA.columns = [{ width: 34 }, { width: 24 }, { width: 22 }, { width: 28 }, { width: 32 }, { width: 16 }];

    /* ---- Paket ---- */
    var kP = 4 + PKS.length; // baris terakhir paket
    title(wsP, "Daftar Paket", "Edit koordinat / volume di sini — Detail & Ringkasan ikut berubah. Nama paket harus unik.");
    wsP.getCell("G3").value = "Volume kebutuhan (AMP: ton · BP: m³ · Quarry: m³)"; wsP.getCell("G3").font = { italic: true, color: { argb: "FF64748B" } };
    head(wsP, 4, ["Nama Paket", "Tipe", "Lat acuan", "Lng acuan", "Titik acuan", "Panjang ruas (km)", "AMP", "BP", "Quarry"]);
    PKS.forEach(function (p, i) {
      var r = 5 + i;
      wsP.getRow(r).values = [p.nama, p.tipe === "ruas" ? "Ruas" : "Titik", p.lat, p.lng, p.tipe === "ruas" ? p.acuan : "-", p.tipe === "ruas" ? r3(p.len) : null, p.vol.amp || 0, p.vol.bp || 0, p.vol.quarry || 0];
      [1, 3, 4, 7, 8, 9].forEach(function (c) { wsP.getCell(r, c).fill = INPUT; });
      wsP.getCell(r, 3).numFmt = "0.000000"; wsP.getCell(r, 4).numFmt = "0.000000"; [7, 8, 9].forEach(function (c) { wsP.getCell(r, c).numFmt = "#,##0.##"; });
    });
    wsP.columns = [{ width: 38 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 11 }, { width: 11 }, { width: 11 }];
    var pRng = function (col) { return "Paket!$" + col + "$5:$" + col + "$" + kP; };

    /* ---- Fasilitas (+ kolom kalkulator) ---- */
    var kF = 4 + nF, kal = { lat: -7.0, lng: 110.4 };
    if (PKS[0]) { kal.lat = PKS[0].lat; kal.lng = PKS[0].lng; }
    title(wsF, "Daftar Fasilitas AMP / Batching Plant / Quarry", "Sumber: data-lokasi.js PETAQU. Kolom J–L dipakai sheet Kalkulator (jarak dari titik yang Anda isi).");
    head(wsF, 4, ["No", "Jenis", "Owner", "Kabupaten/Kota", "Provinsi", "Tautan Google Maps", "Alamat", "Lat", "Lng", "Jarak lurus ke titik Kalkulator (km)", "Peringkat dalam jenis", "Kunci"]);
    var fRank = {}; // hitung peringkat kalkulator utk cache
    var kd = FAS.map(function (f) { return r3(hav(kal, f)); });
    FAS.forEach(function (f, i) {
      var cnt = 0; for (var q = 0; q < nF; q++) { if (FAS[q].jenis === f.jenis && (kd[q] < kd[i] || (kd[q] === kd[i] && q <= i))) cnt++; }
      fRank[i] = cnt;
    });
    FAS.forEach(function (f, i) {
      var r = 5 + i;
      wsF.getRow(r).values = [i + 1, LAB[f.jenis], f.owner, f.kab, f.prov, "https://www.google.com/maps?q=" + f.lat + "," + f.lng, f.alamat, f.lat, f.lng];
      wsF.getCell(r, 8).numFmt = "0.000000"; wsF.getCell(r, 9).numFmt = "0.000000";
      wsF.getCell(r, 10).value = res(kd[i], hf("Kalkulator!$C$4", "Kalkulator!$C$5", "H" + r, "I" + r));
      wsF.getCell(r, 11).value = res(fRank[i], 'COUNTIFS($B$5:$B$' + kF + ',B' + r + ',$J$5:$J$' + kF + ',"<"&J' + r + ')+COUNTIFS($B$5:B' + r + ',B' + r + ',$J$5:J' + r + ',J' + r + ')');
      wsF.getCell(r, 12).value = res(LAB[f.jenis] + "|" + fRank[i], "B" + r + '&"|"&K' + r);
      wsF.getCell(r, 2).font = { bold: true, color: { argb: JCOL[f.jenis] } };
    });
    wsF.columns = [{ width: 6 }, { width: 9 }, { width: 38 }, { width: 22 }, { width: 16 }, { width: 38 }, { width: 50 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 12 }, { width: 12 }];
    wsF.autoFilter = { from: "A4", to: "L" + kF };
    var fRng = function (col) { return "Fasilitas!$" + col + "$5:$" + col + "$" + kF; };

    /* ---- Kalkulator ---- */
    title(wsK, "Kalkulator Jarak — Titik Bebas", "Isi koordinat titik (sel kuning). Daftar 5 fasilitas terdekat per jenis muncul otomatis. Salin koordinat dari Google Maps.");
    wsK.getCell("B4").value = "Latitude"; wsK.getCell("C4").value = kal.lat; wsK.getCell("B5").value = "Longitude"; wsK.getCell("C5").value = kal.lng;
    wsK.getCell("B6").value = "Faktor jalan"; wsK.getCell("C6").value = res(P.faktor, "Parameter!$B$3");
    ["C4", "C5"].forEach(function (a) { wsK.getCell(a).fill = INPUT; wsK.getCell(a).numFmt = "0.000000"; wsK.getCell(a).font = { bold: true }; });
    ["B4", "B5", "B6"].forEach(function (a) { wsK.getCell(a).font = { bold: true }; });
    JK.forEach(function (j, k) {
      var h = 9 + k * 8, L = LAB[j], pr = 6 + k;
      wsK.mergeCells(h, 1, h, 4);
      wsK.getCell(h, 1).value = L + " — " + JN[j].full; wsK.getCell(h, 1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      for (var c = 1; c <= 7; c++) wsK.getCell(h, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: JCOL[j] } };
      wsK.getCell(h, 5).value = "Volume (" + JN[j].unit + "):"; wsK.getCell(h, 5).font = { bold: true, color: { argb: "FFFFFFFF" } }; wsK.getCell(h, 5).alignment = { horizontal: "right" };
      wsK.getCell(h, 6).value = 1; wsK.getCell(h, 6).fill = INPUT; wsK.getCell(h, 6).font = { bold: true };
      wsK.getRow(h + 1).values = ["Peringkat", "Nama / Owner", "Kabupaten/Kota", "Jarak lurus (km)", "Jarak jalan est. (km)", "Waktu (menit)", "Biaya angkut (Rp)"];
      wsK.getRow(h + 1).eachCell(function (c) { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }; c.alignment = { horizontal: "center", wrapText: true }; });
      var cand = FAS.map(function (f, i) { return { f: f, i: i }; }).filter(function (o) { return o.f.jenis === j; }).sort(function (a, b) { return kd[a.i] - kd[b.i] || a.i - b.i; });
      for (var n = 1; n <= 5; n++) {
        var r = h + 1 + n, o = cand[n - 1], mt = 'MATCH("' + L + '|"&$A' + r + "," + fRng("L") + ",0)";
        var d = o ? kd[o.i] : null, jal = d != null ? r3(d * P.faktor) : null;
        wsK.getCell(r, 1).value = n;
        wsK.getCell(r, 2).value = res(o ? o.f.owner : "-", 'IFERROR(INDEX(' + fRng("C") + "," + mt + '),"-")');
        wsK.getCell(r, 3).value = res(o ? o.f.kab : "-", 'IFERROR(INDEX(' + fRng("D") + "," + mt + '),"-")');
        wsK.getCell(r, 4).value = res(d == null ? "" : d, 'IFERROR(INDEX(' + fRng("J") + "," + mt + '),"")');
        wsK.getCell(r, 5).value = res(jal == null ? "" : jal, 'IFERROR(ROUND(D' + r + '*$C$6,3),"")');
        var wk = jal == null ? "" : Math.round((jal / P.kec[j] * 60 + P.load[j]) * 10) / 10;
        wsK.getCell(r, 6).value = res(wk, 'IFERROR(ROUND(E' + r + '/Parameter!$B$' + pr + '*60+Parameter!$C$' + pr + ',1),"")');
        wsK.getCell(r, 7).value = res(jal == null ? "" : Math.round(1 * P.tarif[j] * jal), 'IFERROR(ROUND($F$' + h + '*Parameter!$D$' + pr + '*E' + r + ',0),"")');
        wsK.getCell(r, 7).numFmt = "#,##0"; [4, 5].forEach(function (c) { wsK.getCell(r, c).numFmt = "0.000"; });
        wsK.getCell(r, 1).alignment = { horizontal: "center" };
        if (n === 1) for (var cc = 1; cc <= 7; cc++) wsK.getCell(r, cc).font = { bold: true, color: { argb: "FF166534" } };
      }
    });
    wsK.columns = [{ width: 10 }, { width: 40 }, { width: 22 }, { width: 18 }, { width: 20 }, { width: 16 }, { width: 22 }];

    /* ---- Detail ---- */
    var rowsD = [];
    PKS.forEach(function (p) { p.rows.forEach(function (r) { rowsD.push({ p: p, r: r }); }); });
    var nD = rowsD.length, kD = 4 + nD;
    title(wsD, "Detail Jarak Semua Paket × Semua Fasilitas", "Kolom K (OSRM) = jarak jalan nyata bila tersedia, kosong = memakai estimasi (lurus × faktor). Ketik jarak jalan sendiri di kolom K untuk menimpa.");
    head(wsD, 4, ["Paket", "Jenis", "Owner", "Kabupaten/Kota", "Provinsi", "Lat fasilitas", "Lng fasilitas", "Lat paket", "Lng paket", "Jarak lurus (km)", "Jarak jalan OSRM (km)", "Jarak jalan dipakai (km)", "Sumber", "Waktu (menit)", "Biaya angkut (Rp)", "Status", "Peringkat", "Kunci", "Jalan dari awal ruas (km)", "Jalan dari tengah ruas (km)", "Jalan dari akhir ruas (km)"]);
    // cache peringkat per paket+jenis
    var rk = [];
    PKS.forEach(function (p) {
      JK.forEach(function (j) {
        var list = p.rows.map(function (r, idx) { return { r: r, idx: idx }; }).filter(function (o) { return o.r.f.jenis === j; });
        var jal = function (o) { return r3(o.r.osrmKm != null ? o.r.osrmKm : r3(o.r.lurus) * P.faktor); };
        list.forEach(function (o) { var c = 0; list.forEach(function (q) { if (jal(q) < jal(o) || (jal(q) === jal(o) && q.idx <= o.idx)) c++; }); o.r.rank = c; o.r.jal = jal(o); });
      });
    });
    var base = 0;
    PKS.forEach(function (p, pi) {
      p.rows.forEach(function (r, ri) {
        var row = 5 + base++, j = r.f.jenis, L = LAB[j], pm = "MATCH($A" + row + "," + pRng("A") + ",0)", pr = 'MATCH($B' + row + ',Parameter!$A$6:$A$8,0)';
        var lur = r3(r.lurus), jal = r.jal, wk = Math.round((jal / P.kec[j] * 60 + P.load[j]) * 10) / 10, vol = p.vol[j] || 0, bia = Math.round(vol * P.tarif[j] * jal);
        var st = P.batas[j] > 0 && wk > P.batas[j] ? "MELEBIHI BATAS" : "OK";
        wsD.getCell(row, 1).value = p.nama; wsD.getCell(row, 2).value = L; wsD.getCell(row, 3).value = r.f.owner; wsD.getCell(row, 4).value = r.f.kab; wsD.getCell(row, 5).value = r.f.prov;
        wsD.getCell(row, 6).value = r.f.lat; wsD.getCell(row, 7).value = r.f.lng;
        wsD.getCell(row, 8).value = res(p.lat, "INDEX(" + pRng("C") + "," + pm + ")");
        wsD.getCell(row, 9).value = res(p.lng, "INDEX(" + pRng("D") + "," + pm + ")");
        wsD.getCell(row, 10).value = res(lur, hf("H" + row, "I" + row, "F" + row, "G" + row));
        if (r.osrmKm != null) wsD.getCell(row, 11).value = r3(r.osrmKm);
        wsD.getCell(row, 12).value = res(jal, "ROUND(IF(ISNUMBER(K" + row + "),K" + row + ",J" + row + "*Parameter!$B$3),3)");
        wsD.getCell(row, 13).value = res(r.osrmKm != null ? "OSRM" : "Estimasi", 'IF(ISNUMBER(K' + row + '),"OSRM","Estimasi")');
        wsD.getCell(row, 14).value = res(wk, "ROUND(L" + row + "/INDEX(Parameter!$B$6:$B$8," + pr + ")*60+INDEX(Parameter!$C$6:$C$8," + pr + "),1)");
        wsD.getCell(row, 15).value = res(bia, "ROUND(INDEX(Paket!$G$5:$I$" + kP + "," + pm + ",MATCH($B" + row + ",Paket!$G$4:$I$4,0))*INDEX(Parameter!$D$6:$D$8," + pr + ")*L" + row + ",0)");
        wsD.getCell(row, 16).value = res(st, 'IF(AND(INDEX(Parameter!$E$6:$E$8,' + pr + ')>0,N' + row + '>INDEX(Parameter!$E$6:$E$8,' + pr + ')),"MELEBIHI BATAS","OK")');
        wsD.getCell(row, 17).value = res(r.rank, 'COUNTIFS($A$5:$A$' + kD + ',A' + row + ',$B$5:$B$' + kD + ',B' + row + ',$L$5:$L$' + kD + ',"<"&L' + row + ')+COUNTIFS($A$5:A' + row + ',A' + row + ',$B$5:B' + row + ',B' + row + ',$L$5:L' + row + ',L' + row + ')');
        wsD.getCell(row, 18).value = res(p.nama + "|" + L + "|" + r.rank, 'A' + row + '&"|"&B' + row + '&"|"&Q' + row);
        if (p.tipe === "ruas" && r.anc) { ["awal", "tengah", "akhir"].forEach(function (k, q) { if (r.anc[k] != null) wsD.getCell(row, 19 + q).value = r3(r.anc[k]); }); }
        [6, 7, 8, 9].forEach(function (c) { wsD.getCell(row, c).numFmt = "0.000000"; });
        [10, 11, 12, 19, 20, 21].forEach(function (c) { wsD.getCell(row, c).numFmt = "0.000"; });
        wsD.getCell(row, 11).fill = INPUT; wsD.getCell(row, 15).numFmt = "#,##0";
      });
    });
    wsD.columns = [{ width: 28 }, { width: 8 }, { width: 36 }, { width: 20 }, { width: 14 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 11 }, { width: 16 }, { width: 17 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 14 }];
    if (nD) {
      wsD.autoFilter = { from: "A4", to: "U" + kD };
      wsD.addConditionalFormatting({ ref: "P5:P" + kD, rules: [{ type: "cellIs", operator: "equal", formulae: ['"MELEBIHI BATAS"'], style: { font: { bold: true, color: { argb: "FF9C0006" } }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } } } }] });
      wsD.addConditionalFormatting({ ref: "Q5:Q" + kD, rules: [{ type: "cellIs", operator: "equal", formulae: ["1"], style: { font: { bold: true, color: { argb: "FF166534" } }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFDCFCE7" } } } }] });
      wsD.addConditionalFormatting({ ref: "L5:L" + kD, rules: [{ type: "dataBar", cfvo: [{ type: "min" }, { type: "max" }], color: { argb: "FF67E8F9" } }] });
    }
    var dRng = function (col) { return "Detail!$" + col + "$5:$" + col + "$" + kD; };

    /* ---- Ringkasan ---- */
    title(wsR, "PETAQU — Ringkasan Jarak Paket ke AMP, Batching Plant & Quarry", "Dibuat " + new Date().toLocaleString("id-ID") + " · jarak jalan: OSRM bila tersedia, selain itu estimasi (lurus × faktor " + P.faktor + ") · fasilitas terdekat menurut jarak jalan");
    wsR.mergeCells("A4:B4"); wsR.getCell("A4").value = "PAKET";
    var gcol = 3;
    JK.forEach(function (j) {
      wsR.mergeCells(4, gcol, 4, gcol + 3); var c = wsR.getCell(4, gcol); c.value = LAB[j] + " TERDEKAT"; c.alignment = { horizontal: "center" }; c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      for (var q = 0; q < 4; q++) wsR.getCell(4, gcol + q).fill = { type: "pattern", pattern: "solid", fgColor: { argb: JCOL[j] } };
      gcol += 4;
    });
    wsR.getCell(4, 15).value = "TOTAL"; wsR.getCell(4, 15).font = { bold: true, color: { argb: "FFFFFFFF" } }; wsR.getCell(4, 15).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    wsR.getCell("A4").font = { bold: true, color: { argb: "FFFFFFFF" } }; wsR.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    wsR.getCell("B4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    head(wsR, 5, ["Nama Paket", "Tipe"].concat([].concat.apply([], JK.map(function () { return ["Nama / Owner", "Jarak jalan (km)", "Waktu (menit)", "Biaya (Rp)"]; }))).concat(["Total biaya angkut (Rp)"]));
    PKS.forEach(function (p, i) {
      var r = 6 + i, gc = 3, bsum = 0;
      wsR.getCell(r, 1).value = res(p.nama, "INDEX(" + pRng("A") + "," + (i + 1) + ")");
      wsR.getCell(r, 2).value = res(p.tipe === "ruas" ? "Ruas" : "Titik", "INDEX(" + pRng("B") + "," + (i + 1) + ")");
      var sumCells = [];
      JK.forEach(function (j) {
        var L = LAB[j], best = p.rows.filter(function (x) { return x.f.jenis === j && x.rank === 1; })[0];
        var mt = 'MATCH($A' + r + '&"|' + L + '|1",' + dRng("R") + ",0)";
        var jal = best ? best.jal : "", wk = best ? Math.round((best.jal / P.kec[j] * 60 + P.load[j]) * 10) / 10 : "", bia = best ? Math.round((p.vol[j] || 0) * P.tarif[j] * best.jal) : "";
        wsR.getCell(r, gc).value = res(best ? best.f.owner : "-", 'IFERROR(INDEX(' + dRng("C") + "," + mt + '),"-")');
        wsR.getCell(r, gc + 1).value = res(jal, 'IFERROR(INDEX(' + dRng("L") + "," + mt + '),"")');
        wsR.getCell(r, gc + 2).value = res(wk, 'IFERROR(INDEX(' + dRng("N") + "," + mt + '),"")');
        wsR.getCell(r, gc + 3).value = res(bia, 'IFERROR(INDEX(' + dRng("O") + "," + mt + '),"")');
        wsR.getCell(r, gc + 1).numFmt = "0.0"; wsR.getCell(r, gc + 2).numFmt = "0"; wsR.getCell(r, gc + 3).numFmt = "#,##0";
        sumCells.push(colL(gc + 3) + r); bsum += bia === "" ? 0 : bia; gc += 4;
      });
      wsR.getCell(r, 15).value = res(bsum, "SUM(" + sumCells.join(",") + ")"); wsR.getCell(r, 15).numFmt = "#,##0"; wsR.getCell(r, 15).font = { bold: true };
      wsR.getCell(r, 1).font = { bold: true };
    });
    wsR.columns = [{ width: 34 }, { width: 8 }, { width: 30 }, { width: 12 }, { width: 11 }, { width: 14 }, { width: 30 }, { width: 12 }, { width: 11 }, { width: 14 }, { width: 30 }, { width: 12 }, { width: 11 }, { width: 14 }, { width: 18 }];
    if (PKS.length) {
      ["D", "H", "L"].forEach(function (c) { wsR.addConditionalFormatting({ ref: c + "6:" + c + (5 + PKS.length), rules: [{ type: "colorScale", cfvo: [{ type: "min" }, { type: "max" }], color: [{ argb: "FF86EFAC" }, { argb: "FFFCA5A5" }] }] }); });
    }
    var nr = 8 + PKS.length;
    wsR.getCell(nr, 1).value = "Cara pakai:"; wsR.getCell(nr, 1).font = { bold: true };
    ["• Sheet Paket: ubah koordinat / volume → seluruh hasil menghitung ulang otomatis.",
     "• Sheet Parameter: ubah kecepatan, tarif, batas waktu, faktor jalan.",
     "• Sheet Kalkulator: isi koordinat titik mana pun → 5 AMP/BP/Quarry terdekat.",
     "• Sheet Detail: seluruh fasilitas × paket (filter / urutkan). Status MELEBIHI BATAS = waktu tempuh melampaui batas mutu."]
      .forEach(function (t, i) { wsR.getCell(nr + 1 + i, 1).value = t; });
    return wb;
  }

  function buildModel() {
    var pk = S.pakets.map(function (p) {
      var res = calc(p), g = res.g;
      return {
        nama: p.nama, tipe: p.tipe, acuan: p.acuan || "tengah", lat: res.an.lat, lng: res.an.lng, len: g.len, vol: p.vol || {},
        rows: res.rows.map(function (r) {
          var anc = null;
          if (p.tipe === "ruas") {
            anc = {};
            ANCH.forEach(function (k) { var o = osrmC[okey(g.an[k], r.f)]; anc[k] = o && !o.nr ? o.km : null; });
          }
          return { f: r.f, lurus: r.lurus, osrmKm: r.os && !r.os.nr ? r.os.km : null, anc: anc };
        })
      };
    });
    return { par: clone(S.par), pakets: pk, fas: F };
  }

  function fallbackXlsx(model) {
    var wb = XLSX.utils.book_new(), rows = [["Paket", "Jenis", "Owner", "Kabupaten", "Lat", "Lng", "Jarak lurus (km)", "Jarak jalan (km)", "Sumber"]];
    model.pakets.forEach(function (p) { p.rows.forEach(function (r) { rows.push([p.nama, JN[r.f.jenis].lab, r.f.owner, r.f.kab, r.f.lat, r.f.lng, r3(r.lurus), r3(r.osrmKm != null ? r.osrmKm : r.lurus * model.par.faktor), r.osrmKm != null ? "OSRM" : "Estimasi"]); }); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Detail");
    XLSX.writeFile(wb, "petaqu-jarak-paket-" + Date.now() + ".xlsx");
  }

  var exporting = false;
  function exportXlsx() {
    if (exporting) return;
    if (!S.pakets.length) return say("Tentukan minimal satu lokasi paket dulu");
    if (!F.length) loadFas();
    exporting = true; say("Menyiapkan Excel…");
    var nExp = Math.max(S.par.topN, 8), done = 0, gagal = 0;
    var tasks = S.par.osrm ? S.pakets.map(function (p) {
      return function () {
        say("Menghitung rute jalan paket " + (++done) + "/" + S.pakets.length + "…");
        var ctx = { ok: 0, fail: 0, msg: "" };
        return solve(calc(p), { tok: null, pri: 0, ctx: ctx, N: nExp, silent: true }).catch(function () { ctx.fail++; }).then(function () { if (ctx.fail) gagal++; });
      };
    }) : [];
    tasks.reduce(function (pr, t) { return pr.then(t); }, Promise.resolve())
      .then(function () { return loadExcelJS().catch(function () { return null; }); })
      .then(function (EJ) {
        var model = buildModel();
        if (!EJ) { fallbackXlsx(model); say("ExcelJS tidak termuat — Excel sederhana diunduh"); return; }
        return buildWorkbook(EJ, model).xlsx.writeBuffer().then(function (buf) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
          a.download = "petaqu-jarak-paket-" + new Date().toISOString().slice(0, 10) + ".xlsx";
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
          say("Excel diunduh: " + S.pakets.length + " paket × " + F.length + " fasilitas" + (gagal ? " — " + gagal + " paket sebagian masih estimasi (server rute tak terjangkau)" : ""));
        });
      })
      .catch(function (e) { say("Gagal membuat Excel: " + e.message); })
      .then(function () { exporting = false; refresh(true); });
  }

  /* ---------------- UI mount ---------------- */
  function css() {
    if (document.getElementById("pqj-css")) return;
    var s = document.createElement("style"); s.id = "pqj-css";
    s.textContent =
      ".pqj-ico{background:none!important;border:0!important}" +
      ".pqj-pin{width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#64748b;border:2px solid #fff;box-shadow:0 2px 8px #000a;display:flex;align-items:center;justify-content:center;margin-top:2px}" +
      ".pqj-pin.on{background:#ef4444;box-shadow:0 0 0 3px #ef444455,0 2px 8px #000a}" +
      ".pqj-pin span{transform:rotate(45deg);color:#fff;font:800 12px system-ui}" +
      "#pqjPanel{position:absolute;top:64px;right:62px;left:auto;width:440px;max-width:calc(100% - 440px);max-height:calc(100% - 150px);z-index:905;display:none;flex-direction:column;background:#0b1320f5;border:1px solid var(--line,#1e2938);border-radius:12px;color:var(--text,#e6edf5);backdrop-filter:blur(8px);box-shadow:0 8px 28px #000a;font:500 12.5px system-ui,sans-serif}" +
      "#pqjPanel.open{display:flex}" +
      "#pqjPanel .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line,#1e2938);font-weight:700;font-size:13.5px;user-select:none;-webkit-user-select:none}" +
      "#pqjPanel .hd .sum{margin-left:auto;font-weight:600;font-size:10.5px}" +
      "#pqjPanel .x{background:none;border:0;color:inherit;cursor:pointer;font-size:15px;padding:2px 4px}" +
      "#pqjPanel .bd>*{flex-shrink:0}#pqjPanel .bd{overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}" +
      ".pqj-sec>.t{font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:.04em;font-size:11px;padding:2px 0 6px;cursor:default}.pqj-sec>.t[data-tg]{cursor:pointer}" +
      ".pqj-act{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.pqj-act .pqj-b{display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;min-width:0}" +
      ".pqj-b{padding:7px 10px;border-radius:8px;border:1px solid #22d3ee66;background:#0e7490;color:#fff;font:700 11.5px system-ui;cursor:pointer}.pqj-b.s{background:#131a28;border-color:var(--line,#1e2938);color:inherit}.pqj-b:hover{border-color:#22d3ee}" +
      ".pqj-in{background:#080b12;color:inherit;border:1px solid var(--line,#1e2938);border-radius:7px;padding:5px 7px;font:inherit;outline:0}.pqj-in:focus{border-color:#22d3ee}" +
      ".pqj-ib{background:#131a28;border:1px solid var(--line,#1e2938);color:inherit;border-radius:7px;padding:5px 8px;cursor:pointer}.pqj-ib:hover{border-color:#f87171}" +
      ".pqj-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}" +
      ".pqj-chip{display:inline-flex;gap:5px;align-items:center;padding:4px 9px;border-radius:14px;border:1px solid var(--line,#1e2938);background:#131a28;cursor:pointer;max-width:100%}.pqj-chip b{background:#475569;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:10px}" +
      ".pqj-chip.on{border-color:#ef4444;background:#ef444422}.pqj-chip.on b{background:#ef4444}" +
      ".pqj-ed{margin-top:8px;padding:8px;border:1px solid var(--line,#1e2938);border-radius:9px;background:#0d1626;display:flex;flex-direction:column;gap:7px}" +
      ".pqj-ed .row,.pqj-par .row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.lb{color:#94a3b8;font-size:11px}" +
      ".vol label{display:flex;align-items:center;gap:3px;font-size:11px}.vol small{color:#94a3b8}" +
      ".sub{font-size:10.5px;color:#94a3b8;margin-top:1px}.pqj-empty{color:#94a3b8;padding:8px 2px;font-size:12px}" +
      ".pqj-pop{margin-top:8px;padding:8px;border:1px solid #22d3ee55;border-radius:9px;background:#0d1626}.pqj-pop .lst{max-height:180px;overflow:auto;margin-top:6px}.pqj-pop .it{padding:6px 8px;border-radius:6px;cursor:pointer}.pqj-pop .it:hover{background:#0e7490}" +
      ".pqj-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}" +
      ".pqj-card{border:1px solid;border-radius:10px;padding:8px;background:#0d1626;cursor:pointer;min-width:0}.pqj-card .big{font-size:22px;font-weight:800;line-height:1.1;margin-top:3px}.pqj-card .big small{font-size:11px;color:#94a3b8;font-weight:600}.pqj-card .sm{font-size:11px;color:#cbd5e1}.pqj-card .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#94a3b8}" +
      ".pqj-blk{border:1px solid var(--line,#1e2938);border-radius:10px;overflow:hidden}" +
      ".pqj-bh{display:flex;align-items:center;gap:7px;padding:7px 9px;background:#101a2b;border-left:4px solid}.pqj-bh .dot{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff}.pqj-bh small{color:#94a3b8}.pqj-bh .n{margin-left:auto;color:#94a3b8;font-size:11px}" +
      ".pqj-t{width:100%;border-collapse:collapse;font-size:11.5px}.pqj-t th{font-size:9.5px;text-transform:uppercase;color:#94a3b8;text-align:right;padding:5px 5px;border-bottom:1px solid var(--line,#1e2938);font-weight:700}.pqj-t th:nth-child(2){text-align:left}" +
      ".pqj-t td{padding:5px;border-bottom:1px solid #1e293b66;vertical-align:top}.pqj-t td.r{text-align:right;white-space:nowrap}.pqj-t td.rk{color:#94a3b8;width:20px}.pqj-t tbody tr[data-rt],.pqj-t tbody tr[data-pk]{cursor:pointer}.pqj-t tbody tr:hover{background:#0e749022}" +
      ".pqj-t tr.best td{background:#16a34a1c}.pqj-t tr.best .jl{color:#4ade80;font-weight:800}.pqj-t tr.warn .lw{color:#f87171;font-size:9.5px;font-weight:700}.pqj-t .est{color:#fbbf24;margin-left:2px;font-style:normal}.pqj-t .ok{color:#34d399;margin-left:3px;font-size:7px;font-style:normal;vertical-align:middle}" +
      ".pqj-t td.dim{color:#64748b}.pqj-t tr.best td.dim{color:#94a3b8}#pqjPanel .hd .sum{white-space:nowrap}" +
      ".pqj-warn{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:#fbbf24;background:#fbbf2418;border:1px solid #fbbf2455;border-radius:7px;padding:5px 7px}" +
      ".pqj-t.pp td{vertical-align:middle}.pqj-par .chk{display:flex;gap:6px;align-items:center;margin:8px 0;font-size:11.5px}" +
      "#pqjPanel .ft{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line,#1e2938)}#pqjPanel .ft button{flex:1;padding:8px;border-radius:8px;border:1px solid #22d3ee66;background:#0e7490;color:#fff;font:700 12px system-ui;cursor:pointer}#pqjPanel .ft button.sec{background:#131a28;color:inherit;border-color:var(--line,#1e2938)}" +
      "@media(max-width:860px){#pqjPanel{left:8px;right:8px;top:auto;bottom:70px;width:auto;max-width:none;max-height:72%}.pqj-cards{grid-template-columns:repeat(3,1fr)}}";
    document.head.appendChild(s);
  }

  /* panel menempel tepat di kiri tombolnya (toolbar kanan), sejajar vertikal; tidak menimpa sidebar maupun tombol folder.
     Posisi dihitung ulang setiap kali ukuran layar/aplikasi berubah, dan dicoba lagi bila aplikasi belum tampil
     (mis. masih di layar login/sambutan saat panel dibuka kembali otomatis). */
  var plT = null, plN = 0, plRO = null;
  function resetPos(st) { st.left = st.right = st.top = st.bottom = st.maxHeight = st.maxWidth = ""; }
  function schedulePlace() { if (plN > 60) return; clearTimeout(plT); plT = setTimeout(function () { plN++; if (S.open) place(); }, 350); }
  function place() {
    if (!panel) return;
    var st = panel.style;
    if (window.innerWidth <= 860) { resetPos(st); return; }   // HP: lembar bawah (CSS)
    var host = panel.offsetParent || panel.parentNode, hr = host.getBoundingClientRect();
    var ref = btn && btn.getBoundingClientRect().width ? btn : document.getElementById("mapToolbar"), br = ref && ref.getBoundingClientRect();
    if (!hr.width || !br || !br.width) { resetPos(st); return schedulePlace(); }   // aplikasi belum tampil -> posisi bawaan CSS (kanan), coba lagi
    plN = 0;
    var H = hr.height, top = Math.max(56, Math.min(br.top - hr.top - 4, H - 380));
    var right = Math.max(8, Math.round(hr.right - br.left + 8));
    // batas kiri: tepi kanan sidebar & tombol folder melayang, supaya tidak saling menimpa
    var lim = hr.left + 8, sb = document.getElementById("sidebar"), fab = document.getElementById("pqFolder");
    if (sb && sb.offsetWidth) lim = Math.max(lim, sb.getBoundingClientRect().right + 8);
    if (fab && fab.offsetWidth) lim = Math.max(lim, fab.getBoundingClientRect().right + 10);
    var avail = Math.floor(hr.right - right - lim);
    st.left = "auto"; st.bottom = "auto";
    st.right = right + "px";
    st.top = Math.round(top) + "px";
    st.maxWidth = Math.max(300, Math.min(440, avail)) + "px";
    st.maxHeight = Math.max(260, Math.round(H - top - 20)) + "px";
  }
  function watchPlace() {
    window.addEventListener("resize", function () { if (S.open) place(); });
    window.addEventListener("load", function () { if (S.open) place(); });
    if (window.ResizeObserver && panel) {
      try {
        plRO = new ResizeObserver(function () { if (S.open) place(); });
        var host = panel.parentNode, tb = document.getElementById("mapToolbar");
        if (host) plRO.observe(host); if (tb) plRO.observe(tb);
      } catch (e) {}
    }
  }
  function toggle(force) {
    S.open = typeof force === "boolean" ? force : !S.open;
    if (panel) panel.classList.toggle("open", S.open);
    if (S.open) place();
    if (btn) btn.classList.toggle("active", S.open);
    save(); if (S.open) refresh();
  }

  function mount() {
    css();
    var host = document.getElementById("map") ? document.getElementById("map").parentNode : document.body;
    panel = document.createElement("div"); panel.id = "pqjPanel"; host.appendChild(panel);
    if (window.L && L.DomEvent) { L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel); }
    panel.addEventListener("click", function (e) { if (e.target.closest(".it[data-ruas]")) return onClickRuas(e); onClick(e); });
    panel.addEventListener("change", function (e) {
      if (e.target.id === "pqjFile") { importXlsx(e.target.files[0]); e.target.value = ""; return; }
      onChange(e);
    });
    panel.addEventListener("input", function (e) {
      if (e.target.id === "pqjRq") {
        ui.ruasQ = e.target.value; var pos = e.target.selectionStart;
        render(active() && calc(active())); var n = panel.querySelector("#pqjRq"); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
      }
    });
    panel.addEventListener("mouseover", function (e) { var el = e.target.closest && e.target.closest("[data-rt]"); if (el) hilite(el.getAttribute("data-rt"), true); });
    panel.addEventListener("mouseout", function (e) {
      var el = e.target.closest && e.target.closest("[data-rt]");
      if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) hilite(el.getAttribute("data-rt"), false);
    });
    panel.addEventListener("focusout", function () {
      if (!pend) return; pend = false;
      setTimeout(function () { if (!panelBusy()) { var pk = active(); render(pk ? calc(pk) : null); } }, 80);
    });
    var tb = document.getElementById("mapToolbar");
    btn = document.createElement("button"); btn.className = "tool-btn"; btn.id = "pqjBtn";
    btn.title = "Kalkulator jarak paket ke AMP / BP / Quarry"; btn.innerHTML = '<i class="fa-solid fa-ruler-combined"></i>';
    btn.onclick = function (e) { e.stopPropagation(); toggle(); };
    if (tb) { var ref = document.getElementById("pqlokBtn") || document.getElementById("basemapBtn"); ref && ref.nextSibling ? tb.insertBefore(btn, ref.nextSibling) : tb.appendChild(btn); }
    else { btn.style.cssText = "position:absolute;top:104px;right:14px;z-index:900;width:38px;height:38px"; host.appendChild(btn); }
    watchPlace();
    toggle(!!S.open); if (!S.open) drawMap(active() ? calc(active()) : null);
  }

  function init() {
    load(); loadRC();
    var tries = 0, t = setInterval(function () {
      var M = getMap();
      if ((M && window.L && document.getElementById("mapToolbar") && window.LOKASI_DATA) || ++tries > 200) {
        clearInterval(t); if (!M) return;
        loadFas(); mount();
      }
    }, 300);
  }

  window.PQ_JARAK = {
    toggle: toggle, addPaket: addPaket, exportXlsx: exportXlsx, pickOnMap: pickOnMap, refresh: refresh,
    parseCoord: parseCoord, haversine: hav,
    _build: buildWorkbook, _model: function () { if (!F.length) loadFas(); return buildModel(); },
    _setState: function (o) { S = Object.assign(S, o); }, _fas: function (a) { F = a; }, _calc: calc
  };
  if (typeof module !== "undefined" && module.exports) module.exports = window.PQ_JARAK;
  if (typeof document !== "undefined" && typeof window.__PQJ_TEST === "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  }
})();

/* ==========================================================================
   Daftar ruas: baris ikon aksi disembunyikan, tampil hanya saat kartu diklik
   ========================================================================== */
(function () {
  if (typeof document === "undefined" || typeof window.__PQJ_TEST !== "undefined") return;
  var st = document.createElement("style");
  st.textContent = ".pq-aksi-hide{display:none!important}[data-pq-card]{cursor:pointer}";
  document.head.appendChild(st);

  function rows() {
    var out = [];
    document.querySelectorAll("i.fa-trash, i.fa-trash-can").forEach(function (ic) {
      if (ic.closest("#pqjPanel")) return;
      var p = (ic.closest("button") || ic).parentElement;
      while (p && p.querySelectorAll("button").length < 6) p = p.parentElement;
      if (p && p.querySelectorAll("button").length <= 10 && out.indexOf(p) < 0) out.push(p);
    });
    return out;
  }

  function init() {
    rows().forEach(function (r) {
      if (r.dataset.pqInit) return;
      r.dataset.pqInit = 1;
      r.classList.add("pq-aksi-hide");
      if (r.parentElement) r.parentElement.dataset.pqCard = 1;
    });
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("button, input, label, a, select")) return;
    var card = e.target.closest("[data-pq-card]");
    if (!card) return;
    var row = rows().find(function (r) { return r.parentElement === card; });
    if (!row) return;
    var wasHidden = row.classList.contains("pq-aksi-hide");
    rows().forEach(function (r) { r.classList.add("pq-aksi-hide"); });
    if (wasHidden) row.classList.remove("pq-aksi-hide");
  });

  var t;
  function start() {
    new MutationObserver(function () { clearTimeout(t); t = setTimeout(init, 50); })
      .observe(document.body, { childList: true, subtree: true });
    init();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
