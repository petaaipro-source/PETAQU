/* PETAQU — UKUR JEDA (v2 "supercerdas"): ukur otomatis dari Street View yang DIJEDA / berhenti, FOKUS 3 HAL SAJA:
     1) LEBAR JALAN   2) LEBAR BAHU (kiri/kanan)   3) LEBAR DRAINASE (kiri/kanan, hanya bila ada)
   Tidak menampilkan hal lain (marka, posisi kendaraan, panjang saluran, dst.).

   Yang baru di v2
     • MEMBACA STREET VIEW YANG SEDANG TAMPIL: bila panorama LIVE aktif, yang diukur persis panorama itu (id panorama
       yang sama dengan yang Anda lihat) — bukan sekadar titik terdekat di peta. Berlaku saat animasi rute dijeda,
       saat animasi tidak ada, dan saat Anda berhenti/menggeser Street View ke titik lain.
     • ARAH JALAN dikunci dari tautan panorama (maju + mundur dirata-ratakan), jadi foto kiri/kanan benar-benar
       tegak lurus jalan walau Anda menoleh ke arah lain. Tanpa tautan → arah rute/arah pandang (ditandai).
     • Mesin ukur baru (PQDim.core): KONSENSUS 5 KOLOM foto — mobil/pohon/orang yang hanya menutupi sebagian foto
       tidak lagi memotong lebar jalan; BAYANGAN pohon di badan jalan dikenali (aspal ternaungi); objek biru
       (mobil/atap) di tepi → tepi dinyatakan "tidak diketahui", bukan ditebak; bahu tanah tanpa batas luar
       ditandai "≥".
     • ERROR yang jelas, bukan "tidak ada foto": kunci API tak punya Street View Static API, referrer dibatasi,
       kuota/limit Google habis, tanpa koneksi, foto gagal dimuat, CORS — masing-masing punya pesan & solusi.
       Timeout 9–12 dtk agar tidak pernah "mengukur…" selamanya; gangguan jaringan sesaat dicoba ulang otomatis 1×.
     • Kartu "siaga" selalu terlihat saat Street View terbuka + tombol "Ukur sekarang" (tanpa menunggu jeda).

   Kapan jalan otomatis?
     • Animasi DIJEDA / digeser lalu berhenti ≥0,8 dtk di satu titik, atau
     • tanpa animasi: berhenti di satu panorama Street View LIVE ≥1,3 dtk. Saat animasi berjalan modul diam
       (tidak membuang kuota) — HUD Dimensi biasa yang bekerja.

   Hemat kuota (foto Static API = 1 kuota/foto; metadata gratis):
     • ADAPTIF: 1 panorama (2 foto) dulu. Bila keyakinan ≥80% & kedua sisi terbaca → selesai. Bila ragu/terhalang
       → tambah panorama tetangga ±10 m, ±20 m (maks 3; 4 bila lebar belum terbaca; tombol "Teliti" sampai 5).
     • Gabung banyak sampel dengan MEDIAN + buang yang menyimpang; sebaran → ± ketidakpastian jujur.
     • Validasi kewajaran (lebar jalan 2,5–25 m). Drainase "ada" hanya bila terdeteksi di ≥ separuh sampel.
     • Cache per titik; batal otomatis bila animasi diputar lagi / posisi bergeser; berbagi batas kuota bulanan
       dengan modul Dimensi (pq_dim_cap).
   Ini ESTIMASI foto (tipikal ±0,3–0,8 m), bukan survei alat. Tidak mengubah fitur lain. */
(function () {
  "use strict";
  if (typeof window !== "undefined" && window.PQJeda) return;

  /* ==================== BAGIAN 1 — PURE (bisa diuji di Node) ==================== */
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function med(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function vals(S, k) { return S.map(function (x) { return x[k]; }).filter(fin); }

  /* hasil CORE.measurePair → satu sampel ringkas (hanya 3 besaran + keyakinan) */
  function toEntry(res, k) {
    if (!res) return null; k = k || 1;
    var L = res.L, R = res.R, okL = !!(L && !L.hitMax && !L.obstacle), okR = !!(R && !R.hitMax && !R.obstacle);
    function bahu(S, ok) { return ok ? (S.bahuPaved + S.bahuLoose) * k : null; }
    function sal(S, ok) { if (!ok) return null; return S.sal && S.salConf >= 0.4 ? S.sal.w * k : 0; }   /* 0 = tidak ada; null = tak diketahui */
    return {
      W: fin(res.W) ? res.W * k : null, bl: bahu(L, okL), br: bahu(R, okR), dl: okL ? sal(L, okL) : null, dr: okR ? sal(R, okR) : null,
      blo: !!(okL && L.bahuOpen), bro: !!(okR && R.bahuOpen), eL: okL && fin(L.edge) ? L.edge * k : null, eR: okR && fin(R.edge) ? R.edge * k : null,
      pl: okL ? (L.bahuPaved || 0) * k : null, pr: okR ? (R.bahuPaved || 0) * k : null, tl: okL ? (L.bahuType || "") : "", tr: okR ? (R.bahuType || "") : "",
      mkc: res.mkc || null, conf: fin(res.conf) ? res.conf : 0, err: fin(res.err) ? res.err * k : null, okL: okL, okR: okR,
      obs: !!((L && L.obstacle) || (R && R.obstacle)), shade: !!((L && L.shaded) || (R && R.shaded))
    };
  }

  /* gabungkan sampel → hasil akhir */
  function agg(S) {
    S = (S || []).filter(Boolean); var n = S.length; if (!n) return null;
    var Wv = vals(S, "W").filter(function (w) { return w >= 2.5 && w <= 25; });
    var out = { n: n, W: null, err: null, conf: 0, spread: 0, warn: "", bl: null, br: null, dl: null, dr: null, blo: false, bro: false, obs: 0, shade: 0 };
    S.forEach(function (x) { if (x.obs) out.obs++; if (x.shade) out.shade++; });
    if (Wv.length) {
      var m0 = med(Wv), tol = Math.max(0.8, 0.12 * m0), inl = Wv.filter(function (w) { return Math.abs(w - m0) <= tol; });
      var cs = S.filter(function (x) { return fin(x.W) && x.W >= 2.5 && x.W <= 25; }).map(function (x) { return x.conf; });
      var cf = med(cs) || 0, es = med(vals(S, "err")) || 0.3;
      if (Wv.length >= 3 && inl.length >= Math.ceil(Wv.length * 0.6)) {          /* mayoritas sepakat → buang sampel terhalang */
        out.W = med(inl); out.spread = Math.max.apply(null, inl) - Math.min.apply(null, inl);
        if (inl.length < Wv.length) out.warn = (Wv.length - inl.length) + " sampel menyimpang dibuang (terhalang?)";
        if (out.spread < 0.6) cf = Math.min(1, cf + 0.12);
      } else {
        out.W = m0; out.spread = Wv.length > 1 ? Math.max.apply(null, Wv) - Math.min.apply(null, Wv) : 0;
        if (Wv.length >= 2 && out.spread > tol) { cf *= 0.65; out.warn = "sampel tidak konsisten (sebaran " + out.spread.toFixed(1) + " m) — mungkin terhalang"; }
      }
      out.conf = cf; out.err = Math.max(0.15, es, out.spread / 2);
    } else if (vals(S, "W").length) out.warn = "lebar di luar rentang wajar (2,5–25 m) — tidak dipakai";
    else if (out.obs) out.warn = "tepi jalan tertutup kendaraan/objek — coba titik lain atau tekan Teliti";
    out.bl = med(vals(S, "bl")); out.br = med(vals(S, "br"));
    function openOf(key) { var v = S.filter(function (x) { return fin(x[key === "bl" ? "bl" : "br"]); }); if (!v.length) return false; return v.filter(function (x) { return x[key === "bl" ? "blo" : "bro"]; }).length * 2 >= v.length; }
    out.pl = med(vals(S, "pl")); out.pr = med(vals(S, "pr"));
    out.tl = mode(S.map(function (x) { return x.tl; }).filter(Boolean)); out.tr = mode(S.map(function (x) { return x.tr; }).filter(Boolean));
    out.blo = openOf("bl"); out.bro = openOf("br");
    function dr(key) {
      var v = vals(S, key); if (!v.length) return null;
      var det = v.filter(function (x) { return x > 0; });
      return det.length >= Math.ceil(v.length / 2) ? med(det) : 0;
    }
    out.dl = dr("dl"); out.dr = dr("dr");
    out.mk = aggMarks(S);
    if (out.shade && !out.warn) out.warn = "ada bayangan di jalan — diperhitungkan";
    return out;
  }

  /* gabungkan klasifikasi marka antar panorama: tepi kiri/kanan, marka tengah (klaster posisi), jumlah lajur */
  function mode(a) { var c = {}, b = null, bn = 0; a.forEach(function (v) { c[v] = (c[v] || 0) + 1; if (c[v] > bn) { bn = c[v]; b = v; } }); return b; }
  function aggMarks(S) {
    var it = S.map(function (x) { return x && x.mkc; }).filter(Boolean), n = it.length; if (!n) return null;
    function edge(k) { var p = it.filter(function (i) { return i[k]; }); if (p.length / n < 0.5) return null; return { t: mode(p.map(function (i) { return i[k].t; })), f: med(p.map(function (i) { return i[k].f; })) }; }
    var cl = []; it.forEach(function (i, si) { i.div.forEach(function (d) { var c = null; cl.forEach(function (q) { if (!c && Math.abs(q.f - d.f) <= 0.07) c = q; }); if (c) { c.ds.push(d); c.fs.push(d.f); c.si[si] = 1; c.f = med(c.fs); } else { var si2 = {}; si2[si] = 1; cl.push({ f: d.f, fs: [d.f], ds: [d], si: si2 }); } }); });
    var div = cl.filter(function (c) { return n === 1 || Object.keys(c.si).length >= 2 || Object.keys(c.si).length * 2 >= n; }).map(function (c) {
      var pres = Object.keys(c.si).length / n, t = mode(c.ds.map(function (d) { return d.t; }));
      if (n >= 3 && pres < 0.75 && t === "menerus") t = "putus-putus";       /* terlihat hanya di sebagian panorama → terputus */
      return { f: c.f, t: t, dbl: /ganda|\+/.test(t) };
    }).sort(function (a, b) { return a.f - b.f; });
    return { eL: edge("eL"), eR: edge("eR"), div: div, lanes: div.length + 1, n: n };
  }
  function mkText(M) {
    if (!M) return { edge: "—", mid: "—", lanes: "—" };
    var e = (M.eL ? "kiri " + M.eL.t : "kiri tak terbaca") + " · " + (M.eR ? "kanan " + M.eR.t : "kanan tak terbaca");
    return { edge: e, mid: M.div.length ? M.div.map(function (d) { return d.t; }).join(" | ") : "tidak terbaca", lanes: M.div.length ? "≈ " + M.lanes + " lajur" : (M.eL || M.eR ? "1 lajur/tanpa marka tengah" : "—") };
  }

  /* arah jalan dari tautan panorama: cari tautan (maju/mundur) terdekat dgn arah yg diinginkan, rata-ratakan dgn lawannya */
  function angDiff(a, b) { var d = Math.abs(((a - b) % 360 + 360) % 360); return d > 180 ? 360 - d : d; }
  function axisFrom(links, want, maxDiff) {
    if (!links || !links.length || !fin(want)) return null;
    var D = Math.PI / 180, best = null, bd = 999;
    links.forEach(function (h) {
      var d = angDiff(h, want); if (d < bd) { bd = d; best = h; }
      var r = (h + 180) % 360, d2 = angDiff(r, want); if (d2 < bd) { bd = d2; best = r; }
    });
    if (best == null || bd > (maxDiff || 40)) return null;
    var rev = (best + 180) % 360, opp = null, od = 999;
    links.forEach(function (h) { var d = angDiff(h, rev); if (d < od) { od = d; opp = h; } });
    if (opp != null && od <= 25) {
      var a = best * D, b = ((opp + 180) % 360) * D;
      return (Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b)) / D + 360) % 360;
    }
    return best;
  }

  /* pesan untuk status metadata Google */
  function metaProblem(m) {
    if (!m) return { msg: "Tidak ada jawaban dari Google", fatal: false, retry: true };
    var st = m.status;
    if (st === "OK" || st === "ZERO_RESULTS" || st === "NOT_FOUND") return null;
    var em = m.error_message ? " (" + String(m.error_message).slice(0, 110) + ")" : "";
    if (st === "REQUEST_DENIED") return { msg: "Google menolak: aktifkan \"Street View Static API\" pada kunci API (Maps JavaScript API saja belum cukup) & cek batasan referrer/situs kunci" + em, fatal: true };
    if (st === "OVER_QUERY_LIMIT" || st === "OVER_DAILY_LIMIT") return { msg: "Kuota/limit Google habis — coba lagi nanti atau cek penagihan akun Google Cloud" + em, fatal: true };
    if (st === "INVALID_REQUEST") return { msg: "Permintaan ke Google tidak valid" + em, fatal: false };
    return { msg: "Layanan Google sedang bermasalah (" + st + ") — dicoba lagi" + em, fatal: false, retry: true };
  }

  if (typeof module !== "undefined" && module.exports) { module.exports = { aggMarks: aggMarks, mkText: mkText, agg: agg, aggMarks: aggMarks, mkText: mkText, toEntry: toEntry, med: med, axisFrom: axisFrom, metaProblem: metaProblem }; }
  if (typeof document === "undefined") return;

  /* ==================== BAGIAN 2 — BROWSER ==================== */
  var K_ON = "pq_jeda_on", K_DB = "pq_jeda_v1", K_Q = "pq_dim_quota", K_CAP = "pq_dim_cap", K_K = "pq_dim_k", K_MIN = "pq_jeda_min";
  function jget(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function $(id) { return document.getElementById(id); }
  function RA() { try { return typeof routeAnim !== "undefined" ? routeAnim : null; } catch (e) { return null; } }
  function svOpen() { var o = $("svOverlay"); return !!(o && o.classList.contains("show")); }
  function toast_(m, err) { try { if (typeof toast === "function") toast(m, !!err); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function meters(a, b) { var r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lng - a.lng) * r, h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) * Math.sin(y / 2); return 12742000 * Math.asin(Math.sqrt(h)); }
  function apiKey() { try { return typeof getApiKey === "function" ? getApiKey() : ""; } catch (e) { return ""; } }
  function CORE() { return window.PQDim && PQDim.core; }
  function offsetPt(c, d) { var r = Math.PI / 180, h = c.rh * r; return { lat: c.lat + d * Math.cos(h) / 111320, lng: c.lng + d * Math.sin(h) / (111320 * Math.cos(c.lat * r)) }; }

  var on = jget(K_ON, 1) !== 0, minimized = !!jget(K_MIN, 0);
  var seq = 0, pend = null, cur = null, cache = {}, warnedCore = false, DB = jget(K_DB, []), apiOK = null, hooks = { meta: null, img: null }, retryT = 0;

  /* ---- kuota (berbagi dengan modul Dimensi) ---- */
  function monthKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1); }
  function quota() { var q = jget(K_Q, null); if (!q || q.m !== monthKey()) q = { m: monthKey(), n: 0 }; return q; }
  function quotaAdd(n) { var q = quota(); q.n += n; jset(K_Q, q); return q; }
  function capOK() { return quota().n + 2 <= jget(K_CAP, 3000); }

  /* ---- jaringan dengan timeout ---- */
  function netErr(msg, kind) { var e = new Error(msg); e.kind = kind; return e; }
  async function meta(lat, lng, radius) {
    if (hooks.meta) return hooks.meta(lat, lng, radius);
    var u = "https://maps.googleapis.com/maps/api/streetview/metadata?location=" + lat.toFixed(6) + "," + lng.toFixed(6) + "&radius=" + radius + "&source=outdoor&key=" + encodeURIComponent(apiKey());
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null, tm = ctl ? setTimeout(function () { ctl.abort(); }, 9000) : 0, r;
    try { r = await fetch(u, ctl ? { signal: ctl.signal } : undefined); }
    catch (e) { throw netErr(e && e.name === "AbortError" ? "Google lambat merespons (timeout 9 dtk)" : "Tidak ada koneksi internet / diblokir jaringan", "net"); }
    finally { if (tm) clearTimeout(tm); }
    if (r.status === 403) { var j403 = null; try { j403 = await r.json(); } catch (e) {} return j403 && j403.status ? j403 : { status: "REQUEST_DENIED", error_message: "HTTP 403" }; }
    if (r.status === 429) return { status: "OVER_QUERY_LIMIT" };
    if (!r.ok) throw netErr("Metadata Google HTTP " + r.status, "net");
    try { return await r.json(); } catch (e) { throw netErr("Jawaban Google tidak terbaca", "net"); }
  }
  function loadImg(url) {
    return new Promise(function (res, rej) {
      var im = new Image(), done = false, tm = setTimeout(function () { if (!done) { done = true; rej(netErr("Foto lambat dimuat (timeout 12 dtk)", "net")); } }, 12000);
      im.crossOrigin = "anonymous";
      im.onload = function () { if (!done) { done = true; clearTimeout(tm); res(im); } };
      im.onerror = function () { if (!done) { done = true; clearTimeout(tm); rej(netErr("Foto Street View tidak bisa dimuat (tidak tersedia / kuota / jaringan)", "img")); } };
      im.src = url;
    });
  }
  async function svImage(pano, heading) {
    if (hooks.img) return hooks.img(pano, heading);
    var O = CORE().OPT;
    var u = "https://maps.googleapis.com/maps/api/streetview?size=" + O.size + "x" + O.size + "&pano=" + encodeURIComponent(pano) + "&heading=" + (((heading % 360) + 360) % 360).toFixed(1) + "&pitch=" + O.pitch + "&fov=" + O.fov + "&source=outdoor&return_error_code=true&key=" + encodeURIComponent(apiKey());
    var im = await loadImg(u), cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    var cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(im, 0, 0);
    try { return cx.getImageData(0, 0, cv.width, cv.height); } catch (e) { throw netErr("cors", "cors"); }
  }
  async function sample(pano, rh) {
    var k = jget(K_K, 1) || 1, left = await svImage(pano, rh - 90), right = await svImage(pano, rh + 90);
    var e = toEntry(CORE().measurePair(left, right, CORE().OPT), k); if (e) e._im = [left, right]; return e;
  }

  /* ---- konteks titik: yang DITAMPILKAN Street View LIVE (utama) atau titik animasi ---- */
  function liveInfo() {
    try {
      var L = window.PQSvLive; if (!L || !L.ready || !L.ready()) return null;
      var p = L.pano(); if (!p) return null; var pos = p.getPosition(); if (!pos) return null;
      var pov = p.getPov() || { heading: 0 }, links = (p.getLinks() || []).map(function (l) { return l.heading; }).filter(fin);
      return { pano: p.getPano(), lat: pos.lat(), lng: pos.lng(), pov: pov.heading, links: links };
    } catch (e) { return null; }
  }
  /* konteks dari state Street View (tanpa panorama live & tanpa animasi): titik ruas / patok KM / lokasi → arah jalan dari titik ruas terdekat */
  function bearing(a, b) {
    var t = Math.PI / 180, dl = (b.lng - a.lng) * t, y = Math.sin(dl) * Math.cos(b.lat * t), x = Math.cos(a.lat * t) * Math.sin(b.lat * t) - Math.sin(a.lat * t) * Math.cos(b.lat * t) * Math.cos(dl);
    return (Math.atan2(y, x) / t + 360) % 360;
  }
  function svStateCtx() {
    try {
      var st = typeof svState !== "undefined" ? svState : null, R = typeof roads !== "undefined" ? roads : []; if (!st) return null;
      var lat, lng, road = null, idx = -1, label = st.label || "";
      if (st.type === "road") {
        road = R.filter(function (r) { return r.id === st.roadId; })[0]; if (!road || !road.points[st.index]) return null;
        idx = st.index; lat = +road.points[idx].lat; lng = +road.points[idx].lng;
      } else if (st.type === "jembatan") {      /* Street View dibuka dari jembatan → ukur di titik jembatan, arah dari ruas terdekat */
        var J = (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []).filter(function (j) { return j.id === st.jembatanId; })[0];
        if (!J || !isFinite(J.lat) || !isFinite(J.lng)) return null;
        lat = +J.lat; lng = +J.lng; label = J.nama || "Jembatan"; var bj = 120;
        R.forEach(function (r) { (r.points || []).forEach(function (p, i) { var d = meters({ lat: lat, lng: lng }, { lat: +p.lat, lng: +p.lng }); if (d < bj) { bj = d; road = r; idx = i; } }); });
      } else if (st.type === "geo" && isFinite(st.lat) && isFinite(st.lng)) {
        lat = +st.lat; lng = +st.lng; var bd = 80;
        R.forEach(function (r) { (r.points || []).forEach(function (p, i) { var d = meters({ lat: lat, lng: lng }, { lat: +p.lat, lng: +p.lng }); if (d < bd) { bd = d; road = r; idx = i; } }); });
      } else return null;
      var rh = 0, axis = "pandang", sta = "", name = label;
      if (road && idx >= 0) {
        var P = road.points, nb = P[idx + 1] || P[idx - 1];
        if (nb) { rh = Math.round(bearing({ lat: lat, lng: lng }, { lat: +nb.lat, lng: +nb.lng })); if (!P[idx + 1]) rh = (rh + 180) % 360; axis = "rute"; }
        sta = P[idx].sta || ""; name = road.name || label;
      }
      return { lat: lat, lng: lng, rh: rh, pano: null, sta: sta, name: name, live: false, axis: axis };
    } catch (e) { return null; }
  }
  function resolveCtx(a) {
    var base = null; try { base = a && window.PQSvAuto ? PQSvAuto.info(a) : null; } catch (e) { base = null; }
    var lv = liveInfo(), c = null;
    if (lv && (!base || meters(base, lv) <= 45)) {                       /* baca panorama yang sedang tampil */
      var want = base ? base.rh : lv.pov, ax = axisFrom(lv.links, want, base ? 40 : 90);
      c = { lat: lv.lat, lng: lv.lng, rh: Math.round(ax != null ? ax : want), pano: lv.pano, sta: base ? base.sta : "", name: base ? base.name : "", live: true, axis: ax != null ? "tautan" : (base ? "rute" : "pandang") };
    } else if (lv) {                                                     /* menjauh dari rute: baca yang terlihat */
      var ax2 = axisFrom(lv.links, lv.pov, 90);
      c = { lat: lv.lat, lng: lv.lng, rh: Math.round(ax2 != null ? ax2 : lv.pov), pano: lv.pano, sta: "", name: "", live: true, axis: ax2 != null ? "tautan" : "pandang" };
    } else if (base) {
      c = { lat: base.lat, lng: base.lng, rh: base.rh, pano: null, sta: base.sta, name: base.name, live: false, axis: "rute" };
    }
    if (!c) c = svStateCtx();     /* Embed / Street View dibuka dari patok KM, titik STA atau lokasi tanpa animasi rute */
    if (c) c.key = (c.pano || (c.lat.toFixed(5) + "," + c.lng.toFixed(5))) + "|" + Math.round(c.rh / 10);
    return c;
  }

  /* ---- proses pengukuran satu titik ---- */
  function fail(my, p) {
    if (my !== seq || !cur) return;
    cur.busy = false; cur.A = null; cur.note = p.msg; cur.fatal = !!p.fatal;
    if (p.fatal) apiOK = false;
    paint();
    if (p.retry && !cur.retried) { var c0 = cur.c, key = cur.key; cur.retried = true; clearTimeout(retryT); retryT = setTimeout(function () { if (cur && cur.key === key && !cur.busy && !cur.A) { var keep = cur.retried; run(c0, false); if (cur) cur.retried = keep; } }, 4000); }
  }
  /* ---- CADANGAN: AI gratis (satelit + OSM) saat Google menolak / kuota habis / CORS / tanpa kunci ---- */
  async function runAI(my, c, reason) {
    if (my !== seq || !cur) return;
    var AI = window.PQJedaAI;
    if (!AI) { fail(my, { msg: reason + " (modul petaqu-ukurai.js tidak termuat)", fatal: true }); return; }
    cur.busy = true; cur.note = reason + " → AI gratis (satelit + OSM) mengukur…"; cur.fatal = false; paint();
    try {
      var A = await AI.measure(c); if (my !== seq || !cur) return;
      cur.busy = false; cur.A = A; cur.n = A.n; cur.fatal = false; cur.note = reason + " → hasil dari AI gratis"; cache[c.key] = A; paint();
    } catch (e) {
      if (my !== seq || !cur) return;
      cur.busy = false; cur.A = null; cur.fatal = true; cur.note = reason + " · AI gratis juga gagal: " + (e && e.message || e); paint();
    }
  }
  async function run(c, deep, forceAI) {
    var my = ++seq, S = [], seen = {}, offs = [0, 10, -10, 20, -20], maxN = deep ? 5 : 3, A = null;
    clearTimeout(retryT);
    cur = { key: c.key, c: c, A: null, busy: true, deep: !!deep, n: 0, note: "", fatal: false, retried: false };
    paint();
    if (forceAI || apiOK === false || !apiKey()) { await runAI(my, c, !apiKey() ? "Tanpa kunci API Google" : forceAI ? "Ukur AI dipilih" : "Google menolak foto Street View"); return; }
    try {
      if (apiOK !== true) {                                              /* uji kunci API dulu (metadata gratis) → pesan error yang jelas */
        var m0 = await meta(c.lat, c.lng, 25); if (my !== seq) return;
        var pr0 = metaProblem(m0); if (pr0) { if (pr0.fatal) { apiOK = false; await runAI(my, c, /OVER_|limit|Kuota/i.test(pr0.msg) ? "Kuota Google habis" : "Google menolak foto Street View"); return; } fail(my, pr0); return; }
        apiOK = true;
      }
      for (var i = 0; i < offs.length && S.length < maxN; i++) {
        if (my !== seq) return;
        var off = offs[i], pano = null;
        if (off === 0 && c.pano) pano = c.pano;
        else {
          var p = off === 0 ? c : offsetPt(c, off), m = await meta(p.lat, p.lng, off === 0 ? 25 : 12);
          if (my !== seq) return;
          var pr = metaProblem(m); if (pr) { if (pr.fatal) { apiOK = false; await runAI(my, c, "Google menolak foto Street View"); return; } fail(my, pr); return; }
          if (!m || m.status !== "OK" || !m.pano_id) { if (off === 0) { cur.busy = false; cur.note = "Tidak ada foto Street View di titik ini"; paint(); return; } continue; }
          if (off !== 0 && m.location && meters(p, { lat: m.location.lat, lng: m.location.lng }) > 8) continue;
          pano = m.pano_id;
        }
        if (seen[pano]) continue; seen[pano] = 1;
        if (!capOK()) { if (!S.length) { await runAI(my, c, "Batas kuota foto bulan ini tercapai"); return; } cur.note = "Batas kuota foto bulan ini tercapai (pq_dim_cap)"; break; }
        quotaAdd(2);
        var e = await sample(pano, c.rh); if (my !== seq) return;
        if (e) S.push(e);
        A = agg(S); cur.A = A; cur.n = S.length; paint();
        if (!deep && A) {
          if (S.length >= 3 && A.W == null && maxN < 4) maxN = 4;        /* lebar belum terbaca (tepi tertutup) → satu panorama lagi */
          var sidesOK = A.bl != null && A.br != null;
          if (S.length === 1 && A.W != null && A.conf >= 0.8 && sidesOK && !A.obs) break;
          if (S.length >= 2 && A.W != null && A.spread < 0.5 && A.conf >= 0.7) break;
        }
      }
      if (my !== seq) return;
      cur.busy = false; cur.A = A;
      if (!A) cur.note = cur.note || "Foto terbaca tetapi tepi jalan tidak ditemukan (gelap / tertutup)";
      else { cache[c.key] = A; if (!A.ai) { readTrees(S, A); if (!A.km) readKm(my, c, S, A); else S.forEach(function (x) { if (x) delete x._im; }); } }
      paint();
    } catch (e) {
      if (my !== seq) return;
      cur.busy = false;
      if (e && e.kind === "cors") { apiOK = false; await runAI(my, c, "Browser memblokir pembacaan foto Google (CORS)"); }
      else if (e && (e.kind === "net" || e.kind === "img")) fail(my, { msg: e.message, retry: true });
      else fail(my, { msg: "Gagal mengukur: " + (e && e.message || e), retry: false });
    }
  }

  /* ---- tampilan ---- */
  function injectCss() {
    if ($("pq-jeda-css")) return;
    var st = document.createElement("style"); st.id = "pq-jeda-css";
    st.textContent =
      "#pqJeda{position:absolute;z-index:6;left:8px;bottom:calc(76px + env(safe-area-inset-bottom,0px));width:min(300px,calc(100% - 16px));box-sizing:border-box;background:#080c14e6;border:1px solid #34d39966;border-radius:14px;padding:7px 10px 9px;color:#e6edf5;font:11px/1.35 var(--mono,system-ui,sans-serif);backdrop-filter:blur(8px);display:none}" +
      "#pqJeda.show{display:block}@media(min-width:861px){#pqJeda{left:auto;right:14px;bottom:84px}}" +
      "body.pqjeda-on #pqDimHud{display:none!important}" +
      "#pqJeda .jh{display:flex;align-items:center;gap:6px;margin-bottom:4px}#pqJeda .jh b{flex:1;color:#34d399;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#pqJeda.busy .jh b:before{content:'';display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:#34d399;animation:pqJd 1s ease-in-out infinite}@keyframes pqJd{50%{opacity:.25;transform:scale(.7)}}" +
      "#pqJeda button{background:#ffffff12;border:1px solid #ffffff22;color:#e6edf5;border-radius:7px;font:700 10px var(--mono,system-ui);padding:3px 7px;cursor:pointer}#pqJeda button:hover{border-color:#34d399;color:#34d399}#pqJeda button.on{background:#22d3ee;border-color:#22d3ee;color:#04222b}#pqJeda .mfx{margin-top:5px;padding:5px 7px;border-radius:7px;background:#34d3991f;color:#bff5df;font-size:10px;line-height:1.35}#pqJeda .mfx.w{background:#f59e0b24;color:#fde7b0}" +
      "#pqJeda .row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:3px 0;border-top:1px solid #ffffff14}#pqJeda .row:first-of-type{border-top:0}" +
      "#pqJeda .row>span{color:#9db3c9;white-space:nowrap}#pqJeda .row .v{display:flex;gap:10px;font-variant-numeric:tabular-nums}#pqJeda .row .v b{color:#fff;font-size:13px}#pqJeda .row .v i{font-style:normal;color:#9db3c9;font-size:9.5px;margin-right:3px}" +
      "#pqJeda .big b{font-size:21px}#pqJeda .big .v small{color:#9db3c9;font-size:10px;align-self:flex-end}" +
      "#pqJeda svg{display:block;width:100%;height:auto;margin:2px 0 4px}#pqJeda .sub{margin-top:4px;color:#9db3c9;font-size:10px}#pqJeda .btns{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}" +
      "#pqJeda .ok{color:#34d399}#pqJeda .mid{color:#facc15}#pqJeda .lo{color:#f59e0b}#pqJeda.min .bd{display:none}" +
      "@media(max-width:860px){#svOverlay.mode-split #pqJeda svg{display:none}}#pqJedaBtn.active{background:var(--cyan,#22d3ee);color:#04121a;border-color:var(--cyan,#22d3ee)}";
        st.textContent += "#pqJeda.idle{padding:5px 9px;border-color:#ffffff22;background:#080c14b8}#pqJeda.idle .jh{margin:0}#pqJeda.idle .jh b{color:#9db3c9;font-weight:600}" +
      "#pqJeda .sub.lo{color:#fda4af;white-space:normal}";
    document.head.appendChild(st);
  }
  
  /* ---- KOREKSI MARKA: tepi putih menerus + marka tengah (kuning putus-putus / kelipatannya) → jumlah lajur × lebar lajur standar ---- */
  var K_MKU = "pq_jeda_mku", U = Object.assign({ on: 1, man: 0, eL: 1, eR: 1, mid: "ky", n: 1 }, jget(K_MKU, {}));
  /* marka OTOMATIS: (1) terbaca dari foto Street View (A.mk) → pengamatan; (2) mode AI tanpa foto → perkiraan dari kelas jalan & jumlah lajur OSM */
  function autoU(A) {
    if (!A) return null;
    if (A.mk && !A.ai) {
      var d = A.mk.div || [], t0 = d.length ? String(d[0].t || "") : "";
      if (d.length === 3) { var mi = 0; d.forEach(function (q, i) { if (Math.abs(q.f - 0.5) < Math.abs(d[mi].f - 0.5)) mi = i; }); if (!/putus/.test(String(d[mi].t)) && d.every(function (q, i) { return i === mi || /putus/.test(String(q.t)); })) return { eL: A.mk.eL ? 1 : 0, eR: A.mk.eR ? 1 : 0, mid: "kp", n: 3, est: false }; }
      return { eL: A.mk.eL ? 1 : 0, eR: A.mk.eR ? 1 : 0, mid: d.length ? (/putus/.test(t0) ? "ky" : "km") : "none", n: Math.max(1, Math.min(3, d.length)), est: false };
    }
    if (A.osm) {
      var hw = String(A.osm.hw || ""), ln = +A.osm.lanes, n = ln >= 2 ? Math.min(3, ln - 1) : 1;
      if (ln === 1) return { eL: 0, eR: 0, mid: "none", n: 1, est: true };
      if (/^(trunk|primary|secondary)$/.test(hw) && ln >= 4) return { eL: 1, eR: 1, mid: "kp", n: 3, est: true };
      if (/^(trunk|primary|secondary)$/.test(hw)) return { eL: 1, eR: 1, mid: "ky", n: n, est: true };
      if (/^(tertiary|unclassified)$/.test(hw)) return { eL: 0, eR: 0, mid: "pp", n: n, est: true };
      return { eL: 0, eR: 0, mid: "none", n: 1, est: true };
    }
    return null;
  }
  function eff(A) {
    if (U.man) return { eL: U.eL, eR: U.eR, mid: U.mid, n: U.n, est: false, man: true };
    return autoU(A);
  }
  function fuse(A) {
    if (A.W0 === undefined) { A.W0 = A.W; A.conf0 = A.conf; A.err0 = A.err; A.warn0 = A.warn; }
    A.W = A.W0; A.conf = A.conf0; A.err = A.err0; A.warn = A.warn0; A.lanes = null; A.mfix = ""; A.mfw = false;
    var E = eff(A); if (!U.on || !E || E.mid === "none") return;
    var nd = E.mid === "kp" ? 3 : Math.max(1, Math.min(4, E.n | 0)), lanes = nd + 1, white = E.mid === "pp";
    var L = white ? 3.25 : 3.5, sL = white ? 0.35 : 0.3, edges = (E.eL ? 1 : 0) + (E.eR ? 1 : 0);
    var Wm = lanes * L, sm = sL * lanes * 0.8 + (edges === 2 ? 0 : edges === 1 ? 0.12 : 0.25) + 0.1 + (E.est ? 0.25 : 0);
    var W0 = A.W0, e0 = Math.max(A.err0 || 0.5, A.ai ? 0.9 : 0.3), lo = lanes * 2.8, hi = lanes * 4.1, base = lanes + " lajur × " + L.toFixed(2).replace(/0$/, "").replace(".", ",") + " m = " + Wm.toFixed(1).replace(".", ",") + " m";
    A.lanes = lanes;
    if (!fin(W0)) { A.W = Wm; A.err = sm + 0.2; A.conf = 0.5; A.mfix = "Ukur gagal → memakai estimasi marka: " + base + "."; return; }
    if (W0 >= lo && W0 <= hi) {
      var w0 = 1 / (e0 * e0), wm = 1 / (sm * sm);
      A.W = (W0 * w0 + Wm * wm) / (w0 + wm); A.err = Math.sqrt(1 / (w0 + wm)); A.conf = Math.min(0.95, Math.max(A.conf0 || 0, 0.45) + 0.2);
      A.mfix = "Selaras dengan marka (" + base + "): hasil ukur " + W0.toFixed(1) + " m digabung dengan estimasi marka → " + A.W.toFixed(1) + " m.";
    } else if (W0 < lo) {
      A.W = Wm; A.err = sm + 0.3; A.conf = 0.5; A.mfw = true;
      A.mfix = "Hasil ukur " + W0.toFixed(1) + " m terlalu sempit untuk " + lanes + " lajur (min ≈ " + lo.toFixed(1) + " m) → dikoreksi ke " + base + ". Verifikasi di lapangan.";
    } else {
      A.conf = Math.min(A.conf0 || 0.5, 0.6); A.mfw = true;
      A.mfix = "Hasil ukur " + W0.toFixed(1) + " m melebihi " + lanes + " lajur (maks ≈ " + hi.toFixed(1) + " m): mungkin termasuk bahu beraspal/persimpangan, atau garis pembagi kurang. Nilai ukur dipertahankan.";
    }
    if (E.est) { A.conf = Math.min(A.conf, 0.6); A.mfix = "(Marka diperkirakan dari kelas jalan OSM, bukan terbaca di foto) " + A.mfix; }
    A.warn = (A.warn0 ? A.warn0 + " · " : "") + "koreksi marka aktif";
  }
  function mkU(A) {
    var E = U.on && eff(A); if (!E) return null;
    var e = E.eL && E.eR ? "putih menerus kiri & kanan" : E.eL ? "putih menerus kiri saja" : E.eR ? "putih menerus kanan saja" : "tidak terlihat";
    var m = { ky: "kuning putus-putus", km: "kuning menerus/ganda", pp: "putih putus-putus", kp: "kuning menerus di tengah + putih putus-putus kiri & kanan", none: "tidak ada" }[E.mid];
    return { edge: e + (E.man ? " (manual)" : E.est ? " (perkiraan)" : " (terbaca)"), mid: m + (E.mid !== "none" && E.mid !== "kp" ? " ×" + E.n : ""), lanes: E.mid !== "none" ? "≈ " + (E.n + 1) + " lajur" : "" };
  }
  function mkChips(A) {
    var E = eff(A) || {}, src = U.man ? "manual" : E.mid ? (E.est ? "otomatis · perkiraan dari kelas jalan OSM" : "otomatis · terbaca dari foto") : "belum ada data otomatis — pilih manual";
    function ch(k, v, t, on) { return '<button data-a="mk" data-k="' + k + '" data-v="' + v + '" class="' + (on ? "on" : "") + '">' + t + "</button>"; }
    return '<div class="sub">Marka: <b>' + src + "</b> (ketuk untuk mengubah manual)</div>" +
      '<div class="btns">' + ch("eL", E.eL ? 0 : 1, "Tepi kiri putih", E.eL) + ch("eR", E.eR ? 0 : 1, "Tepi kanan putih", E.eR) + "</div>" +
      '<div class="btns">' + ch("mid", "ky", "Kuning putus", E.mid === "ky") + ch("mid", "km", "Kuning menerus", E.mid === "km") + ch("mid", "pp", "Putih putus", E.mid === "pp") + ch("mid", "kp", "2 jalur: kuning + putih putus", E.mid === "kp") + ch("mid", "none", "Tanpa tengah", E.mid === "none") + "</div>" +
      '<div class="btns"><span style="color:#9db3c9;font-size:10px;align-self:center">Garis pembagi:</span>' + ch("n", 1, "1", E.n === 1) + ch("n", 2, "2", E.n === 2) + ch("n", 3, "3", E.n === 3) +
      (U.man ? '<button data-a="mkauto" title="Kembali mengikuti pembacaan otomatis">↺ Otomatis</button>' : "") +
      '<button data-a="mkon" class="' + (U.on ? "on" : "") + '" title="Koreksi lebar memakai jumlah lajur × lebar lajur standar jalan nasional">Koreksi marka: ' + (U.on ? "ON" : "OFF") + "</button></div>";
  }
  function ensureCard() {
    var h = $("pqJeda"); if (h) return h;
    var wrap = $("svFrameWrap"); if (!wrap) return null;
    h = document.createElement("div"); h.id = "pqJeda"; wrap.appendChild(h);
    h.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      var a = b.getAttribute("data-a");
      if (a === "min") { minimized = !minimized; jset(K_MIN, minimized ? 1 : 0); paint(); }
      else if (a === "mk" || a === "mkon" || a === "mkauto") {
        if (a === "mkon") U.on = U.on ? 0 : 1;
        else if (a === "mkauto") { U.man = 0; U.on = 1; }
        else {
          var k = b.getAttribute("data-k"), v = b.getAttribute("data-v");
          if (!U.man) { var E0 = eff(cur && cur.A); if (E0) { U.eL = E0.eL ? 1 : 0; U.eR = E0.eR ? 1 : 0; U.mid = E0.mid; U.n = E0.n || 1; } }   /* salin pembacaan otomatis, lalu ubah satu hal */
          U.man = 1; U[k] = k === "mid" ? v : +v; U.on = 1; if (k === "mid" && v === "kp") U.n = 3;
        }
        jset(K_MKU, U); paint();
        if (cur && cur.A && DB.some(function (x) { return x.k === cur.c.key; })) saveCur();
      }
      else if (a === "now") measureNow(false);
      else if (a === "redo" && cur) { delete cache[cur.c.key]; apiOK = apiOK === false ? null : apiOK; run(cur.c, false); }
      else if (a === "ai" && cur) { delete cache[cur.c.key]; run(cur.c, false, true); }
      else if (a === "deep" && cur) { delete cache[cur.c.key]; run(cur.c, true); }
      else if (a === "copy") copyText();
      else if (a === "save") saveCur();
      else if (a === "csv") csv();
    });
    ["touchstart", "pointerdown", "mousedown", "wheel"].forEach(function (ev) { h.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
    return h;
  }
  function f1(v) { return v == null || !isFinite(v) ? "—" : v.toFixed(1) + " m"; }
  function bahuT(v, open) { return v == null ? "—" : v < 0.15 ? "tidak ada" : (open ? "≥ " : "") + f1(v); }
  function drT(v) { return v == null ? "—" : v <= 0 ? "tidak ada" : f1(v); }
  function cls(c) { return c >= 0.7 ? "ok" : c >= 0.45 ? "mid" : "lo"; }
  function ctxLabel(c) { return c.sta ? "STA " + esc(c.sta) : "titik ini"; }

  /* model marka efektif untuk gambar: tepi putih menerus, pembagi (kuning menerus di tengah, putih putus-putus di sisi) */
  function mkLines(A) {
    var E = eff(A), M = A.mk, out = { edges: [], divs: [] };
    if (!E) return out;
    var eLf = M && M.eL ? M.eL.f : 0.03, eRf = M && M.eR ? M.eR.f : 0.97;
    if (E.eL) out.edges.push({ f: eLf, solid: !(M && M.eL && /putus/.test(M.eL.t)) });
    if (E.eR) out.edges.push({ f: eRf, solid: !(M && M.eR && /putus/.test(M.eR.t)) });
    if (E.mid === "none") return out;
    var meas = M && !U.man && !A.ai && M.div && M.div.length ? M.div : null;
    if (meas && !(E.mid === "kp" && meas.length !== 3)) {
      var ci = 0; meas.forEach(function (d, i) { if (Math.abs(d.f - 0.5) < Math.abs(meas[ci].f - 0.5)) ci = i; });
      meas.forEach(function (d, i) { var c = i === ci && (meas.length === 1 || Math.abs(d.f - 0.5) < 0.12); out.divs.push({ f: d.f, solid: !/putus/.test(d.t) || /menerus/.test(d.t), yellow: c, dbl: !!d.dbl }); });
      return out;
    }
    if (E.mid === "kp") { out.divs.push({ f: 0.25, solid: false, yellow: false }, { f: 0.5, solid: true, yellow: true }, { f: 0.75, solid: false, yellow: false }); return out; }
    var n = Math.max(1, Math.min(4, E.n | 0));
    for (var i = 1; i <= n; i++) out.divs.push({ f: i / (n + 1), solid: E.mid === "km", yellow: E.mid !== "pp", dbl: E.mid === "km" && n === 1 });
    return out;
  }

  /* ---------- POHON TEPI JALAN: dideteksi otomatis dari foto kiri/kanan yang sama (tanpa foto tambahan) ----------
     Pohon = piksel hijau di ATAS cakrawala kamera (lebih tinggi dari kamera ±2,5 m). Rumput/semak di tanah tidak ikut.
     Tinggi dihitung dari sudut puncak tajuk + jarak lateral nyata (tepi jalan + bahu) → ≈ m; tajuk terpotong tepi foto = "≥". */
  function treeOne(im, D) {
    var O = CORE().OPT, W = im.width, Hh = im.height, d = im.data, f = (W / 2) / Math.tan(O.fov * Math.PI / 360), th = O.pitch * Math.PI / 180;
    var yh = Math.max(20, Math.min(Hh - 1, Math.round(Hh / 2 + f * Math.tan(th)))), bs = 5, gw = Math.floor(W / bs), gh = Math.floor(yh / bs), g = new Uint8Array(gw * gh), n = 0, x, y;
    for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) { var i = ((y * bs + 2) * W + (x * bs + 2)) * 4, r = d[i], gg = d[i + 1], b = d[i + 2]; if (gg >= r * 1.04 && gg >= b * 1.12 && gg > 22) { g[y * gw + x] = 1; n++; } }
    var tot = gw * gh; if (!tot) return null;
    var seen = new Uint8Array(tot), best = null;
    for (var s0 = 0; s0 < tot; s0++) {
      if (!g[s0] || seen[s0]) continue;
      var q = [s0], qi = 0, a = 0, mnY = 1e9, mnX = 1e9, mxX = -1; seen[s0] = 1;
      while (qi < q.length) { var c = q[qi++], cx = c % gw, cy = (c / gw) | 0; a++; if (cy < mnY) mnY = cy; if (cx < mnX) mnX = cx; if (cx > mxX) mxX = cx;
        [c - 1, c + 1, c - gw, c + gw].forEach(function (k, j) { if (k < 0 || k >= tot || seen[k] || !g[k]) return; if (j < 2 && ((k / gw) | 0) !== cy) return; seen[k] = 1; q.push(k); }); }
      if (!best || a > best.a) best = { a: a, mnY: mnY, mnX: mnX, mxX: mxX };
    }
    var cover = n / tot; if (!best || best.a < 12 || cover < 0.03) return { has: false };
    var cut = best.mnY <= 0, ytop = best.mnY * bs, el = th + Math.atan((Hh / 2 - ytop) / f), h = O.camH + D * Math.tan(Math.max(0, el));
    return { has: true, cover: cover, w: (best.mxX - best.mnX + 1) / gw, cut: cut, h: Math.max(O.camH, Math.min(30, h)) };
  }
  function treeSide(list) {
    var ok = list.filter(function (r) { return r && r.has; }); if (!ok.length || ok.length * 2 < list.length) return null;
    var cv = med(ok.map(function (r) { return r.cover; })), h = med(ok.map(function (r) { return r.h; })), w = med(ok.map(function (r) { return r.w; })), cut = ok.filter(function (r) { return r.cut; }).length * 2 >= ok.length;
    var kind = h < 4 ? "semak" : cv >= 0.45 || w >= 0.7 && cv >= 0.3 ? "rapat" : cv >= 0.15 ? "sedang" : "jarang";
    return { kind: kind, cover: cv, h: h, cut: cut && h >= 4, w: w };
  }
  function readTrees(S, A) {
    var L = [], R = [];
    try {
      S.forEach(function (x) {
        if (!x || !x._im) return;
        function D(e, b, dr) { return Math.max(2.5, Math.min(25, (fin(e) ? e : (x.W || 7) / 2) + (b > 0.15 ? b : 0) + (dr > 0 ? dr : 0) + 1.0)); }
        L.push(treeOne(x._im[0], D(x.eL, x.bl, x.dl))); R.push(treeOne(x._im[1], D(x.eR, x.br, x.dr)));
      });
    } catch (e) { return; }
    if (!L.length) return;
    A.tree = { L: treeSide(L), R: treeSide(R) };
  }
  var TK = { rapat: "tajuk rapat", sedang: "pohon sedang", jarang: "pohon jarang", semak: "semak/pohon rendah" };
  function treeT(T) {
    if (!T || (!T.L && !T.R)) return "";
    function one(r) { return r ? TK[r.kind] + " · tajuk " + Math.round(r.cover * 100) + "% · " + (r.cut ? "≥ " : "≈ ") + r.h.toFixed(1) + " m" : "tidak ada"; }
    return "kiri: " + one(T.L) + "; kanan: " + one(T.R);
  }

  /* ---------- PATOK KM: baca pelat putih (angka) dari foto kiri/kanan yang sudah diambil — tanpa foto tambahan ---------- */
  var TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js", LANG_URL = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int", kmW = null, kmWL = null;
  function kmWorker() {
    if (kmW) return Promise.resolve(kmW); if (kmWL) return kmWL;
    kmWL = (window.Tesseract ? Promise.resolve() : new Promise(function (res, rej) { var s = document.createElement("script"); s.src = TESS_URL; s.onload = res; s.onerror = function () { rej(new Error("tesseract")); }; document.head.appendChild(s); }))
      .then(function () { return Tesseract.createWorker("eng", 1, { langPath: LANG_URL }).catch(function () { return Tesseract.createWorker("eng"); }); })
      .then(function (w) { return w.setParameters({ preserve_interword_spaces: "1" }).then(function () { kmW = w; return w; }); });
    kmWL.catch(function () { kmWL = null; });
    return kmWL;
  }
  function grayCv(im) { var cv = document.createElement("canvas"); cv.width = im.w; cv.height = im.h; var cx = cv.getContext("2d"), id = cx.createImageData(im.w, im.h), i; for (i = 0; i < im.d.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = im.d[i]; id.data[i * 4 + 3] = 255; } cx.putImageData(id, 0, 0); return cv; }
  async function kmRecog(im, psm, wl) {
    var w = await kmWorker();
    await w.setParameters({ tessedit_pageseg_mode: String(psm), tessedit_char_whitelist: wl === "a" ? "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/+-." : "0123456789/" });
    var r = await w.recognize(grayCv(im)); return { text: r.data.text, conf: r.data.confidence };
  }
  function kmT(k) {
    if (!k || !k.ok) return ""; var s = [];
    if (k.a != null) s.push(k.b != null ? "KM " + k.b + " · ruas " + k.a : "KM " + k.a);
    if (k.kota) s.push("pelat " + k.kota.kode + " " + k.kota.jarak);
    return s.join("; ") + " (" + (k.side === "L" ? "kiri" : "kanan") + ")";
  }
  async function readKm(my, c, S, A) {
    var K = window.PQ_KMOCR && PQ_KMOCR.core, imgs = [];
    S.forEach(function (x) { if (x && x._im) { imgs.push({ im: x._im[0], side: "L" }); imgs.push({ im: x._im[1], side: "R" }); } });
    S.forEach(function (x) { if (x) delete x._im; });
    if (!K || !imgs.length) return;
    imgs = imgs.slice(0, 6); cur && (cur.kmBusy = true); paint();
    var best = null, bestK = null;
    try {
      for (var i = 0; i < imgs.length; i++) {
        if (my !== seq) return;
        var boxes = K.findPlates(imgs[i].im, { max: 4 }); if (!boxes || !boxes.length) continue;      /* tak ada pelat putih → lewati (hemat CPU) */
        var rd = await K.readImage(imgs[i].im, kmRecog, { maxPlates: 3 });
        if (rd.km && rd.km.length) { var q = rd.km[0], sc = q.votes * 100 + q.conf; if (!best || sc > best.sc) best = { sc: sc, pr: q.pr, side: imgs[i].side }; }
        if (rd.kota && rd.kota.length) { var z = rd.kota[0], sz = z.votes * 100 + z.conf; if (!bestK || sz > bestK.sc) bestK = { sc: sz, pr: z.pr, side: imgs[i].side }; }
        if (best && bestK) break;
      }
    } catch (e) { /* OCR gagal/offline: abaikan, ukuran jalan tetap tampil */ }
    if (my !== seq && !(cur && cur.A === A)) return;
    A.km = (best || bestK) ? { ok: 1, a: best ? best.pr.a : null, b: best ? best.pr.b : null, kota: bestK ? { kode: bestK.pr.kode, jarak: bestK.pr.jarak } : null, side: (best || bestK).side } : { none: 1 };
    if (cur) cur.kmBusy = false; paint();
  }

  /* penampang melintang (potongan tegak) — HANYA jalan, bahu & saluran, digambar dari hasil scan:
       saluran drainase (U-ditch beton, hanya bila terdeteksi) | bahu (beraspal di dekat jalan + tanah/agregat/semen di luar)
       | badan jalan (aspal + lapis pondasi, punggung jalan/crown) | bahu | saluran.
     Cerdas & jujur pada data: lebar digambar sebanding skala meter; bahu "≥" (melebihi jangkauan baca) diberi tepi pudar;
     bahu 0 m = tepi jalan langsung turun ke tanah; saluran tak terbaca (—) TIDAK digambar (tidak mengarang); marka sesuai
     data efektif (terbaca / perkiraan / manual). Ringan: satu SVG kecil, tanpa foto/jaringan tambahan. */
  function section(A) {
    if (A.W == null) return "";
    var dl = A.dl > 0 ? A.dl : 0, dr = A.dr > 0 ? A.dr : 0, bl = A.bl > 0.15 ? A.bl : 0, br = A.br > 0.15 ? A.br : 0;
    var Wd = 280, pad = 3, M = 14, Y0 = 46, CAM = 2.8, YB = 76, f2 = function (v) { return v.toFixed(1); };
    var tot = dl + bl + A.W + br + dr, sc = (Wd - pad * 2 - M * 2) / Math.max(tot, 4);
    var xl0 = pad + M, xdl1 = xl0 + dl * sc, xbl1 = xdl1 + bl * sc, rx = xbl1, rw = A.W * sc, rx1 = rx + rw, xbr1 = rx1 + br * sc, xdr1 = xbr1 + dr * sc, xe = xdr1 + M;
    var yE = Y0 + CAM, K = [];                                              /* titik-titik permukaan tanah kiri → kanan */
    function roadY(t) { return yE + 4 * t * (1 - t) * (Y0 - yE); }          /* punggung jalan (parabola): tepi yE, tengah Y0 */
    function sd(b) { return b ? Math.min(3.4, 0.7 + b * sc * 0.06) : 0; }   /* kemiringan bahu ke luar */
    var yL = yE + sd(bl), yR = yE + sd(br), i;
    function ditch(xa, xb, yG, rev) {                                       /* profil U-ditch; kembalikan titik (kiri→kanan) */
      var w = xb - xa, wx = Math.min(w * 0.26, 3.4), dd = Math.max(5, Math.min(10.5, w * 0.62));
      return [{ x: xa, y: yG }, { x: xa + wx, y: yG + dd }, { x: xb - wx, y: yG + dd }, { x: xb, y: yG }];
    }
    var dLp = dl ? ditch(xl0, xdl1, yL) : null, dRp = dr ? ditch(xbr1, xdr1, yR) : null;
    K.push({ x: pad, y: (dl ? yL - 2.2 : yL + (A.blo && bl ? 0 : 2.4)) }, { x: xl0, y: dl ? yL - 0.8 : yL + (A.blo && bl ? 0 : 0.6) });
    if (dLp) dLp.forEach(function (q) { K.push(q); }); else K.push({ x: xbl1 - bl * sc, y: yL });
    K.push({ x: rx, y: yE });
    for (i = 1; i < 14; i++) K.push({ x: rx + rw * i / 14, y: roadY(i / 14) });
    K.push({ x: rx1, y: yE }); K.push({ x: xbr1, y: yR });
    if (dRp) dRp.forEach(function (q) { K.push(q); });
    K.push({ x: xe - M, y: dr ? yR - 0.8 : yR + (A.bro && br ? 0 : 0.6) }, { x: xe, y: dr ? yR - 2.2 : yR + (A.bro && br ? 0 : 2.4) });
    K.sort(function (a, b) { return a.x - b.x; });
    function Yat(x) { for (var j = 0; j + 1 < K.length; j++) if (x >= K[j].x && x <= K[j + 1].x) { var d = K[j + 1].x - K[j].x, t = d > 1e-6 ? (x - K[j].x) / d : 0; return K[j].y + t * (K[j + 1].y - K[j].y); } return K[K.length - 1].y; }
    function between(a, b) { var r = [{ x: a, y: Yat(a) }]; K.forEach(function (k) { if (k.x > a + 0.05 && k.x < b - 0.05) r.push(k); }); r.push({ x: b, y: Yat(b) }); return r; }
    function path(p, dy) { return p.map(function (q, j) { return (j ? "L" : "M") + f2(q.x) + " " + f2(q.y + dy); }).join(""); }
    function layer(a, b, off, thk, fill, extra) {
      if (b - a < 0.2) return ""; var p = between(a, b), d = path(p, off), q = p.slice().reverse().map(function (z) { return "L" + f2(z.x) + " " + f2(z.y + off + thk); }).join("");
      return '<path d="' + d + q + 'Z" fill="' + fill + '"' + (extra || "") + "/>";
    }
    var defs = '<defs>' +
      '<pattern id="pqGr" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#2f9e44"/><path d="M1 6V3M3 6V1.5M5 6V3.5" stroke="#86e07a" stroke-width="1" stroke-linecap="round"/></pattern>' +
      '<pattern id="pqSo" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#8a5a36"/><circle cx="1.5" cy="2" r=".7" fill="#6b4226"/><circle cx="5" cy="5" r=".8" fill="#a8764c"/><circle cx="5.5" cy="1.2" r=".5" fill="#6b4226"/></pattern>' +
      '<pattern id="pqAg" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#b39a74"/><circle cx="1.8" cy="1.8" r="1.1" fill="#e7dcc6"/><circle cx="5.2" cy="3.2" r="1" fill="#7d6a4d"/><circle cx="2.8" cy="5.6" r=".9" fill="#d3c3a2"/><circle cx="6" cy="6" r=".6" fill="#8e7a5a"/></pattern>' +
      '<pattern id="pqCe" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#c4c8cd"/><circle cx="1.5" cy="1.5" r=".5" fill="#a9aeb5"/><circle cx="4.5" cy="4" r=".5" fill="#dfe2e5"/></pattern>' +
      '<pattern id="pqSG" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#8a5a36"/><circle cx="1.8" cy="1.8" r="1" fill="#d9c8a6"/><circle cx="5.2" cy="4.6" r=".9" fill="#b9a27c"/><circle cx="5.6" cy="1.2" r=".5" fill="#6b4226"/></pattern>' +
      '<linearGradient id="pqFdL" x1="1" x2="0"><stop offset="0" stop-color="#0d1622" stop-opacity="0"/><stop offset="1" stop-color="#0d1622" stop-opacity=".92"/></linearGradient>' +
      '<linearGradient id="pqFdR" x1="0" x2="1"><stop offset="0" stop-color="#0d1622" stop-opacity="0"/><stop offset="1" stop-color="#0d1622" stop-opacity=".92"/></linearGradient></defs>';
    var o = "";
    /* tanah dasar mengikuti permukaan */
    o += '<path d="' + path(K, 0) + "L" + f2(xe) + " " + YB + "L" + f2(pad) + " " + YB + 'Z" fill="url(#pqSo)"/>';
    /* jenis bahu longgar: tanah (coklat) | agregat (butiran) | tanah+kerikil | semen/beton */
    function kind(t) { t = t || ""; return /beton|semen/.test(t) ? "pqCe" : /tanah/.test(t) && /kerikil/.test(t) ? "pqSG" : /kerikil|agregat/.test(t) ? "pqAg" : "pqSo"; }
    var dim = [];                                                           /* rantai dimensi: [x0, x1, teks, tebal] */
    /* bahu: bagian beraspal di dekat jalan + bagian longgar di luar */
    function shoulder(b, p, t, left, open) {
      if (!b) return;
      var w = b * sc, pv = Math.max(0, Math.min(b, p > 0.05 ? p : 0)) * sc, lo = w - pv, a = left ? rx - w : rx1, c = left ? rx - pv : rx1 + pv;
      if (left) { if (lo > 0.2) o += layer(a, c, 0, 5.2, "url(#" + kind(t) + ")"); if (pv > 0.2) o += layer(c, rx, 0, 2.4, "#64748b") + layer(c, rx, 2.4, 3, "url(#pqAg)"); }
      else { if (pv > 0.2) o += layer(rx1, c, 0, 2.4, "#64748b") + layer(rx1, c, 2.4, 3, "url(#pqAg)"); if (lo > 0.2) o += layer(c, a + w, 0, 5.2, "url(#" + kind(t) + ")"); }
      if (lo > 0.2 && kind(t) !== "pqCe") o += layer(left ? a : c, left ? c : a + w, 0, 1.4, kind(t) === "pqSo" ? "#c99a6b" : "#e7dcc6");
      if (lo > 0 && !/beton|semen/.test(t || "")) { var gx = left ? a : a + w - 14; for (var j = 0; j < 3; j++) { var tx = gx + 2 + j * 4.5, ty = Yat(tx); o += '<path d="M' + f2(tx) + " " + f2(ty) + "l-1 -3.5M" + f2(tx) + " " + f2(ty) + "l.4 -4M" + f2(tx) + " " + f2(ty) + 'l1.6 -3" stroke="#4ade80" stroke-width="1" stroke-linecap="round" fill="none"/>'; } }
      dim.push([a, a + w, (open ? "≥" : "") + b.toFixed(1), 0]);
    }
    shoulder(bl, A.pl, A.tl, true, A.blo); shoulder(br, A.pr, A.tr, false, A.bro);
    /* badan jalan: lapis aspal + lapis pondasi agregat di bawahnya */
    o += layer(rx, rx1, 3.2, 5.6, "url(#pqAg)") + layer(rx, rx1, 0, 3.2, "#475569") + layer(rx, rx1, 0, 0.9, "#5b6b80");
    /* rumput di tepi luar (bukan di bahu terbuka) */
    function grass(a, b) { var p = between(a, b); o += '<path d="' + path(p, 0.2) + '" fill="none" stroke="url(#pqGr)" stroke-width="2.6" stroke-linejoin="round"/>'; for (var j = 0; j < 3; j++) { var tx = a + (b - a) * (0.2 + j * 0.3), ty = Yat(tx); o += '<path d="M' + f2(tx) + " " + f2(ty) + "l-1 -3M" + f2(tx) + " " + f2(ty) + "l.4 -3.6M" + f2(tx) + " " + f2(ty) + 'l1.4 -2.6" stroke="#4ade80" stroke-width="1" stroke-linecap="round" fill="none"/>'; } }
    if (!(A.blo && bl)) grass(pad, xl0); if (!(A.bro && br)) grass(xdr1, xe);
    /* saluran beton U (hanya bila terdeteksi) */
    function drain(p, w, x0) {
      o += '<path d="' + path(p, 0) + '" fill="none" stroke="#c4c8cd" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<path d="' + path(p, 0) + '" fill="none" stroke="#e9ecef" stroke-width=".7" stroke-linejoin="round" opacity=".7" transform="translate(0 -.9)"/>';
      dim.push([x0, x0 + w, (w / sc).toFixed(1), 0]);
    }
    if (dLp) drain(dLp, xdl1 - xl0, xl0); if (dRp) drain(dRp, xdr1 - xbr1, xbr1);
    /* tepi pudar untuk bahu yang melebihi jangkauan baca (≥) */
    if (A.blo && bl) o += '<rect x="' + pad + '" y="' + (Y0 + 1) + '" width="' + M + '" height="' + (YB - Y0 - 1) + '" fill="url(#pqFdL)"/>';
    if (A.bro && br) o += '<rect x="' + (xe - M) + '" y="' + (Y0 + 1) + '" width="' + M + '" height="' + (YB - Y0 - 1) + '" fill="url(#pqFdR)"/>';
    /* ---- marka (dari data efektif: terbaca / perkiraan OSM / manual) ---- */
    var MK = mkLines(A), mk = function (f, solid, col, dx) { f = Math.max(0.015, Math.min(0.985, f)); var mx = rx + f * rw + (dx || 0), my = roadY(f); o += '<rect x="' + f2(mx - 1.1) + '" y="' + f2(my - (solid ? 2.6 : 1.8)) + '" width="2.2" height="' + (solid ? 2.6 : 1.5) + '" fill="' + col + '"' + (solid ? "" : ' opacity=".75"') + "/>"; };
    MK.edges.forEach(function (e) { mk(e.f, e.solid, "#fff"); });
    MK.divs.forEach(function (d) { var c = d.yellow ? "#fde047" : "#fff"; if (d.dbl) { mk(d.f, d.solid, c, -1.7); mk(d.f, d.solid, c, 1.7); } else mk(d.f, d.solid, c); });
    /* ---- rantai dimensi (di atas): saluran | bahu | JALAN | bahu | saluran ---- */
    dim.push([rx, rx1, A.W.toFixed(1) + " m", 1]);
    dim.sort(function (a, b) { return a[0] - b[0]; });
    var cy = 14;
    dim.forEach(function (q) {
      var a = q[0], b = q[1], cx = (a + b) / 2, bold = q[3];
      o += '<path d="M' + f2(a) + " " + (cy - 3.5) + "v7M" + f2(b) + " " + (cy - 3.5) + "v7M" + f2(a) + " " + cy + "H" + f2(b) + '" stroke="' + (bold ? "#fde68a" : "#8fb3d4") + '" stroke-width="' + (bold ? 1.1 : 0.8) + '" fill="none"/>';
      if (b - a >= 15) o += '<text x="' + f2(cx) + '" y="' + (cy - 5) + '" text-anchor="middle" font-size="' + (bold ? 10 : 8.5) + '" ' + (bold ? 'font-weight="700" fill="#fff"' : 'fill="#cfe0f0"') + ">" + q[2] + "</text>";
    });
    /* bahu 0 m / saluran tak terbaca: tanda jujur di tepi jalan (tanpa mengarang bentuk) */
    function note(x, txt, anchor, col) { o += '<text x="' + f2(x) + '" y="' + (cy + 1) + '" text-anchor="' + anchor + '" font-size="7.5" fill="' + col + '">' + txt + "</text>"; }
    if (A.bl != null && !bl) note(rx - 2, "0", "end", "#f59e0b"); if (A.br != null && !br) note(rx1 + 2, "0", "start", "#f59e0b");
    /* lebar tiap lajur (m) di antara garis pembagi */
    var bf = [0].concat(MK.divs.map(function (d) { return d.f; })).concat([1]).sort(function (a, b) { return a - b; });
    if (bf.length > 2) for (var li = 0; li < bf.length - 1; li++) {
      var a2 = rx + bf[li] * rw, b2 = rx + bf[li + 1] * rw, lw = (bf[li + 1] - bf[li]) * A.W;
      o += '<path d="M' + f2(a2) + " 25.5v4M" + f2(b2) + " 25.5v4M" + f2(a2) + " 27.5H" + f2(b2) + '" stroke="#64748b" stroke-width=".7" fill="none"/>';
      if (b2 - a2 >= 20) o += '<text x="' + f2((a2 + b2) / 2) + '" y="36.5" text-anchor="middle" font-size="7.5" fill="#e2e8f0" opacity=".9">' + lw.toFixed(1) + "</text>";
    }
    /* legenda */
    var lg = [["url(#pqSo)", "tanah"], ["url(#pqAg)", "agregat"], ["url(#pqCe)", "semen/saluran"], ["url(#pqGr)", "rumput"], ["#475569", "aspal"]], lx0 = 5, lw0 = [40, 48, 66, 46, 40];
    lg.forEach(function (q, j) { o += '<rect x="' + lx0 + '" y="' + (YB + 7) + '" width="8" height="8" rx="1" fill="' + q[0] + '"/><text x="' + (lx0 + 11) + '" y="' + (YB + 14.5) + '" font-size="7.5" fill="#9db3c9">' + q[1] + "</text>"; lx0 += lw0[j]; });
    return '<svg viewBox="0 0 ' + Wd + " " + (YB + 20) + '" role="img" aria-label="Penampang jalan: saluran, bahu, jalan">' + defs + o + "</svg>";
  }

  function setCard(h, html) { if (h.__h !== html) { h.innerHTML = html; h.__h = html; } }
  /* kartu siaga: selalu ada saat Street View terbuka & fitur ON, supaya jelas modul ini hidup */
  function paintIdle(kind, extra) {
    var h = ensureCard(); if (!h) return;
    var show = on && svOpen(); h.classList.toggle("show", !!show); h.classList.remove("busy"); h.classList.add("idle");
    document.body.classList.toggle("pqjeda-on", false);
    if (!show) return;
    var msg = kind === "playing" ? "siaga — jeda animasi untuk mengukur" : kind === "nokey" ? "isi kunci API Street View dulu" : kind === "core" ? "butuh modul Dimensi (petaqu-dimensi.js)" : kind === "nopano" ? "siaga — belum ada panorama yang bisa dibaca" : "membaca titik ini…";
    setCard(h, '<div class="jh"><b>Ukur Jeda • ' + esc(extra || msg) + '</b>' + (kind === "wait" || kind === "nopano" ? '<button data-a="now" title="Ukur titik ini sekarang tanpa menunggu">Ukur sekarang</button>' : "") + "</div>");
  }
  function paint() {
    var h = ensureCard(); if (!h) return;
    var show = svOpen() && cur && (on || cur.fatal); h.classList.toggle("show", !!show); document.body.classList.toggle("pqjeda-on", !!show);
    if (!show) return;
    h.classList.remove("idle"); h.classList.toggle("busy", !!cur.busy); h.classList.toggle("min", minimized);
    if (cur.A) fuse(cur.A);
    var A = cur.A, c = cur.c, o = '<div class="jh"><b>Ukur Jeda • ' + ctxLabel(c) + (cur.busy ? " · mengukur…" : "") + "</b>" +
      '<button data-a="min" title="Ciutkan/tampilkan">' + (minimized ? "▲" : "▼") + "</button></div>";
    if (!A) {
      o += '<div class="bd"><div class="sub' + (cur.fatal ? " lo" : "") + '">' + esc(cur.note || "Mengukur lebar jalan, bahu & drainase…") + "</div>" + (cur.busy ? "" : '<div class="btns"><button data-a="redo">Ulangi</button><button data-a="ai" title="Ukur memakai AI gratis (satelit + OSM), tanpa Google">Ukur AI</button></div>') + "</div>";
    } else {
      var approx = A.conf < 0.45, src = A.ai ? "🤖 AI gratis: " + esc(A.src || "satelit + OSM") : c.live ? "panorama yang tampil" : "titik rute";
      o += '<div class="bd">' + section(A) +
        '<div class="row big"><span>Lebar jalan</span><div class="v"><b class="' + cls(A.conf) + '">' + (approx && A.W != null ? "≈ " : "") + f1(A.W) + "</b>" + (A.err != null && A.W != null ? "<small>±" + A.err.toFixed(1) + " m</small>" : "") + "</div></div>" +
        (A.mfix ? '<div class="mfx' + (A.mfw ? " w" : "") + '">' + esc(A.mfix) + "</div>" : "") +
        '<div class="row"><span>Lebar bahu</span><div class="v"><span><i>kiri</i><b>' + bahuT(A.bl, A.blo) + "</b></span><span><i>kanan</i><b>" + bahuT(A.br, A.bro) + "</b></span></div></div>" +
        '<div class="row"><span>Marka tepi</span><div class="v"><b style="font-size:11px">' + esc(mkU(A) ? mkU(A).edge : A.ai ? "butuh foto Google" : mkText(A.mk).edge) + "</b></div></div>" +
        '<div class="row"><span>Marka tengah</span><div class="v"><b style="font-size:11px">' + esc(mkU(A) ? mkU(A).mid : A.ai ? "butuh foto Google" : mkText(A.mk).mid) + "</b><small>" + esc(mkU(A) ? mkU(A).lanes : A.ai ? "" : mkText(A.mk).lanes) + "</small></div></div>" +
        (A.tree ? '<div class="row"><span>Pohon tepi</span><div class="v"><b style="font-size:11px">' + esc(treeT(A.tree) || "tidak terlihat") + "</b></div></div>" : "") + (cur.kmBusy ? '<div class="row"><span>Patok KM</span><div class="v"><small>membaca…</small></div></div>' : A.km ? '<div class="row"><span>Patok KM</span><div class="v"><b style="font-size:11px">' + (A.km.ok ? esc(kmT(A.km)) : "tidak terlihat") + "</b></div></div>" : "") +
        '<div class="row"><span>Lebar drainase</span><div class="v"><span><i>kiri</i><b>' + drT(A.dl) + "</b></span><span><i>kanan</i><b>" + drT(A.dr) + "</b></span></div></div>" +
        '<div class="sub">keyakinan <b class="' + cls(A.conf) + '">' + (A.conf >= 0.7 ? "tinggi" : A.conf >= 0.45 ? "sedang" : "rendah") + "</b> · " + (A.ai ? A.n + " sumber" : A.n + " panorama") + " · " + src + (c.axis === "pandang" ? " · arah jalan ditebak dari arah pandang" : "") + (A.warn ? "<br>⚠ " + esc(A.warn) : "") + (cur.note ? "<br>" + esc(cur.note) : "") + "</div>" +
        mkChips(A) +
        '<div class="btns"><button data-a="redo">Ulangi</button>' + (A.ai || cur.busy ? "" : '<button data-a="ai" title="Bandingkan dengan AI gratis (satelit + OSM)">Ukur AI</button>') + (A.ai || cur.deep || cur.busy ? "" : '<button data-a="deep" title="Tambah panorama tetangga (sampai 5) untuk hasil lebih pasti">Teliti</button>') +
        '<button data-a="copy">Salin</button><button data-a="save">Simpan</button>' + (DB.length ? '<button data-a="csv">CSV (' + DB.length + ")</button>" : "") + "</div></div>";
    }
    setCard(h, o);
  }
  function hideCard() { if (cur) { seq++; clearTimeout(retryT); cur = null; } var h = $("pqJeda"); if (h) { h.classList.remove("show"); h.__h = ""; } document.body.classList.remove("pqjeda-on"); }

  /* ---- salin / simpan / CSV ---- */
  function summary() {
    if (!cur || !cur.A) return ""; var A = cur.A;
    return "Ukur Jeda " + ctxLabel(cur.c).replace(/&amp;/g, "&") + (cur.c.name ? " · " + cur.c.name : "") + " — Lebar jalan " + f1(A.W) + (A.err != null && A.W != null ? " (±" + A.err.toFixed(1) + ")" : "") +
      (kmT(A.km) ? " · Patok KM " + kmT(A.km) : "") + (treeT(A.tree) ? " · Pohon " + treeT(A.tree) : "") + " · Bahu kiri " + bahuT(A.bl, A.blo) + ", kanan " + bahuT(A.br, A.bro) + " · Drainase kiri " + drT(A.dl) + ", kanan " + drT(A.dr) + (A.mk ? " · Marka tepi " + mkText(A.mk).edge + "; tengah " + mkText(A.mk).mid + " (" + mkText(A.mk).lanes + ")" : "") + " · keyakinan " + Math.round(A.conf * 100) + "%";
  }
  function copyText() {
    var t = summary(); if (!t) return;
    try { navigator.clipboard.writeText(t).then(function () { toast_("Hasil ukur disalin"); }, function () { toast_(t); }); } catch (e) { toast_(t); }
  }
  function saveCur() {
    if (!cur || !cur.A) return; var A = cur.A, c = cur.c;
    DB = DB.filter(function (x) { return x.k !== c.key; });
    DB.push({ k: c.key, ruas: c.name || "", sta: c.sta || "", lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), W: A.W, bl: A.bl, br: A.br, dl: A.dl, dr: A.dr, blo: A.blo ? 1 : 0, bro: A.bro ? 1 : 0, mt: A.mk ? mkText(A.mk).edge : "", mm: A.mk ? mkText(A.mk).mid : "", kmt: kmT(A.km), pht: treeT(A.tree), ln: A.mk ? A.mk.lanes : "", conf: +A.conf.toFixed(2), lj: A.lanes || "", w0: fin(A.W0) && A.lanes && Math.abs(A.W0 - A.W) > 0.05 ? +A.W0.toFixed(2) : null, n: A.n, ai: A.ai ? 1 : 0, t: new Date().toISOString() });
    if (DB.length > 800) DB = DB.slice(-800); jset(K_DB, DB); toast_("Tersimpan (" + DB.length + " titik)"); paint();
  }
  function csv() {
    if (!DB.length) return; function r1(v, o) { return v == null ? "" : (o ? "≥" : "") + (+v).toFixed(2); }
    var head = ["Ruas", "STA", "Lat", "Lng", "Lebar jalan (m)", "Bahu kiri (m)", "Bahu kanan (m)", "Drainase kiri (m)", "Drainase kanan (m)", "Marka tepi", "Marka tengah", "Lajur", "Patok KM", "Pohon tepi", "Keyakinan", "Panorama", "Waktu"];
    var rows = DB.map(function (x) { return [x.ruas, x.sta, x.lat, x.lng, r1(x.W), r1(x.bl, x.blo), r1(x.br, x.bro), r1(x.dl), r1(x.dr), x.mt || "", x.mm || "", x.ln || "", x.kmt || "", x.pht || "", x.conf, x.n, x.t]; });
    var txt = "\ufeff" + [head].concat(rows).map(function (l) { return l.map(function (v) { v = v == null ? "" : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\n");
    var u = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })), a = document.createElement("a");
    a.href = u; a.download = "petaqu-ukur-jeda-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 800);
  }

  /* ---- tombol ON/OFF di pemutar animasi ---- */
  function syncBtn() { var b = $("pqJedaBtn"); if (!b) return; b.classList.toggle("active", on); b.title = "Ukur otomatis saat jeda (lebar jalan, bahu, drainase): " + (on ? "ON" : "OFF"); }
  function addBtn() {
    var bar = $("routePlayerBar"); if (!bar || $("pqJedaBtn")) return;
    var b = document.createElement("button"); b.className = "rp-btn"; b.id = "pqJedaBtn"; b.innerHTML = '<i class="fa-solid fa-bullseye"></i>';
    b.addEventListener("click", function (e) {
      e.stopPropagation(); on = !on; jset(K_ON, on ? 1 : 0); syncBtn(); pend = null; if (on && apiOK === false) apiOK = null;
      toast_(on ? "Ukur otomatis saat jeda: ON (butuh Street View terbuka)" : "Ukur otomatis saat jeda: OFF"); if (!on) hideCard();
    });
    var d = $("pqDimBtn"), stop = bar.querySelector(".rp-btn.danger"); bar.insertBefore(b, d ? d.nextSibling : stop || null); syncBtn();
  }

  /* ---- ukur sekarang (tanpa menunggu jeda) ---- */
  function measureNow(deep) {
    if (!svOpen()) { toast_("Buka Street View dulu", true); return; }
    if (!CORE()) { toast_("Ukur Jeda butuh modul Dimensi (petaqu-dimensi.js)", true); return; }
    var a = RA(); if (a && a.playing) { toast_("Jeda animasi dulu, baru ukur", true); return; }
    var c = resolveCtx(a); if (!c) { toast_("Belum ada panorama Street View yang bisa dibaca", true); return; }
    if (cur && cur.busy && cur.key === c.key) return;
    delete cache[c.key]; if (apiOK === false) apiOK = null; run(c, !!deep);
  }

  /* ---- siklus utama ---- */
  function step() {
    addBtn(); injectCss();
    if (document.hidden) return;
    if (!on || !svOpen()) { if (cur) hideCard(); pend = null; var h0 = $("pqJeda"); if (h0 && h0.classList.contains("show")) { h0.classList.remove("show"); h0.__h = ""; } return; }
    if (!CORE()) { if (!warnedCore) { warnedCore = true; toast_("Ukur Jeda butuh modul Dimensi (petaqu-dimensi.js)", true); } paintIdle("core"); return; }
    var a = RA();
    if (a && a.playing) { if (cur) hideCard(); pend = null; paintIdle("playing"); return; }
    var c = resolveCtx(a);
    if (!c) { if (cur) hideCard(); paintIdle("nopano"); return; }
    var now = Date.now();
    if (!pend || pend.pano !== (c.pano || null) || meters(pend, c) > 1) {
      pend = { lat: c.lat, lng: c.lng, pano: c.pano || null, t: now };
      if (cur && (cur.c.pano !== (c.pano || undefined) || meters(cur.c, c) > 4)) hideCard();    /* bergeser → hasil lama basi, batalkan yang berjalan */
      if (!cur) paintIdle("wait");
      return;
    }
    if (now - pend.t < (a ? 800 : 1300)) { if (!cur) paintIdle("wait"); return; }
    if (cur && cur.key === c.key) return;                     /* titik ini sudah diukur / sedang diukur */
    if (cache[c.key]) { cur = { key: c.key, c: c, A: cache[c.key], busy: false, n: cache[c.key].n, note: "dari cache titik ini" }; paint(); return; }
    run(c, false);
  }
  setInterval(step, 400);

  window.PQJeda = {
    agg: agg, aggMarks: aggMarks, mkText: mkText, toEntry: toEntry, axisFrom: axisFrom, metaProblem: metaProblem,
    on: function (v) { if (v !== undefined) { on = !!v; jset(K_ON, on ? 1 : 0); syncBtn(); if (!on) hideCard(); } return on; },
    now: measureNow, state: function () { return cur; }, save: saveCur,
    csv: csv, saved: function () { return DB.slice(); }, restore: function (a) { if (!Array.isArray(a)) return 0; var n = 0; a.forEach(function (r) { if (r && r.k && isFinite(+r.lat) && isFinite(+r.lng)) { DB = DB.filter(function (x) { return x.k !== r.k; }); DB.push(r); n++; } }); if (DB.length > 800) DB = DB.slice(-800); jset(K_DB, DB); paint(); return n; }, remove: function (fn) { var n = DB.length; DB = DB.filter(function (x) { return !fn(x); }); jset(K_DB, DB); paint(); return n - DB.length; }, clear: function () { DB = []; jset(K_DB, DB); paint(); },
    _set: function (o) { if (o.meta) hooks.meta = o.meta; if (o.img) hooks.img = o.img; }
  };
})();
