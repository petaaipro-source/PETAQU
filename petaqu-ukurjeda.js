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
      blo: !!(okL && L.bahuOpen), bro: !!(okR && R.bahuOpen),
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
    return toEntry(CORE().measurePair(left, right, CORE().OPT), k);
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
      else cache[c.key] = A;
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
      "#pqJeda button{background:#ffffff12;border:1px solid #ffffff22;color:#e6edf5;border-radius:7px;font:700 10px var(--mono,system-ui);padding:3px 7px;cursor:pointer}#pqJeda button:hover{border-color:#34d399;color:#34d399}" +
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
  
  function ensureCard() {
    var h = $("pqJeda"); if (h) return h;
    var wrap = $("svFrameWrap"); if (!wrap) return null;
    h = document.createElement("div"); h.id = "pqJeda"; wrap.appendChild(h);
    h.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      var a = b.getAttribute("data-a");
      if (a === "min") { minimized = !minimized; jset(K_MIN, minimized ? 1 : 0); paint(); }
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

  /* penampang melintang: hanya drainase | bahu | jalan | bahu | drainase */
  function section(A) {
    if (A.W == null) return "";
    var dl = A.dl > 0 ? A.dl : 0, dr = A.dr > 0 ? A.dr : 0, bl = A.bl > 0.15 ? A.bl : 0, br = A.br > 0.15 ? A.br : 0;
    var tot = dl + bl + A.W + br + dr, Wd = 280, pad = 4, sc = (Wd - pad * 2) / Math.max(tot, 4), x = pad, o = "";
    function seg(w, col, label, bold) { if (w <= 0) return; var ww = w * sc; o += '<rect x="' + x.toFixed(1) + '" y="6" width="' + ww.toFixed(1) + '" height="18" fill="' + col + '"/>'; if (ww > 18) o += '<text x="' + (x + ww / 2).toFixed(1) + '" y="38" text-anchor="middle" font-size="' + (bold ? 10 : 8.5) + '" ' + (bold ? 'font-weight="700" fill="#fff"' : 'fill="#cfe0f0"') + ">" + label + "</text>"; x += ww; }
    seg(dl, "#38bdf8", dl.toFixed(1)); seg(bl, "#a8896a", bl.toFixed(1)); var rx = x, rw = A.W * sc; seg(A.W, "#475569", A.W.toFixed(1) + " m", true); seg(br, "#a8896a", br.toFixed(1)); seg(dr, "#38bdf8", dr.toFixed(1));
    if (A.mk) {
      var ln = function (f, t, col) { var lx = rx + Math.max(0.02, Math.min(0.98, f)) * rw; o += '<line x1="' + lx.toFixed(1) + '" x2="' + lx.toFixed(1) + '" y1="7" y2="23" stroke="' + col + '" stroke-width="1.6"' + (/putus/.test(t) ? ' stroke-dasharray="3 3"' : '') + '/>'; };
      if (A.mk.eL) ln(A.mk.eL.f, A.mk.eL.t, "#fff"); if (A.mk.eR) ln(A.mk.eR.f, A.mk.eR.t, "#fff");
      A.mk.div.forEach(function (d) { ln(d.f, d.t, "#fde047"); if (d.dbl) ln(d.f + 0.012, d.t, "#fde047"); });
    }
    return '<svg viewBox="0 0 ' + Wd + ' 44" role="img" aria-label="Penampang jalan">' + o + "</svg>";
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
    var A = cur.A, c = cur.c, o = '<div class="jh"><b>Ukur Jeda • ' + ctxLabel(c) + (cur.busy ? " · mengukur…" : "") + "</b>" +
      '<button data-a="min" title="Ciutkan/tampilkan">' + (minimized ? "▲" : "▼") + "</button></div>";
    if (!A) {
      o += '<div class="bd"><div class="sub' + (cur.fatal ? " lo" : "") + '">' + esc(cur.note || "Mengukur lebar jalan, bahu & drainase…") + "</div>" + (cur.busy ? "" : '<div class="btns"><button data-a="redo">Ulangi</button><button data-a="ai" title="Ukur memakai AI gratis (satelit + OSM), tanpa Google">Ukur AI</button></div>') + "</div>";
    } else {
      var approx = A.conf < 0.45, src = A.ai ? "🤖 AI gratis: " + esc(A.src || "satelit + OSM") : c.live ? "panorama yang tampil" : "titik rute";
      o += '<div class="bd">' + section(A) +
        '<div class="row big"><span>Lebar jalan</span><div class="v"><b class="' + cls(A.conf) + '">' + (approx && A.W != null ? "≈ " : "") + f1(A.W) + "</b>" + (A.err != null && A.W != null ? "<small>±" + A.err.toFixed(1) + " m</small>" : "") + "</div></div>" +
        '<div class="row"><span>Lebar bahu</span><div class="v"><span><i>kiri</i><b>' + bahuT(A.bl, A.blo) + "</b></span><span><i>kanan</i><b>" + bahuT(A.br, A.bro) + "</b></span></div></div>" +
        '<div class="row"><span>Marka tepi</span><div class="v"><b style="font-size:11px">' + esc(A.ai ? "butuh foto Google" : mkText(A.mk).edge) + "</b></div></div>" +
        '<div class="row"><span>Marka tengah</span><div class="v"><b style="font-size:11px">' + esc(A.ai ? "butuh foto Google" : mkText(A.mk).mid) + "</b><small>" + esc(A.ai ? "" : mkText(A.mk).lanes) + "</small></div></div>" +
        '<div class="row"><span>Lebar drainase</span><div class="v"><span><i>kiri</i><b>' + drT(A.dl) + "</b></span><span><i>kanan</i><b>" + drT(A.dr) + "</b></span></div></div>" +
        '<div class="sub">keyakinan <b class="' + cls(A.conf) + '">' + (A.conf >= 0.7 ? "tinggi" : A.conf >= 0.45 ? "sedang" : "rendah") + "</b> · " + (A.ai ? A.n + " sumber" : A.n + " panorama") + " · " + src + (c.axis === "pandang" ? " · arah jalan ditebak dari arah pandang" : "") + (A.warn ? "<br>⚠ " + esc(A.warn) : "") + (cur.note ? "<br>" + esc(cur.note) : "") + "</div>" +
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
      " · Bahu kiri " + bahuT(A.bl, A.blo) + ", kanan " + bahuT(A.br, A.bro) + " · Drainase kiri " + drT(A.dl) + ", kanan " + drT(A.dr) + (A.mk ? " · Marka tepi " + mkText(A.mk).edge + "; tengah " + mkText(A.mk).mid + " (" + mkText(A.mk).lanes + ")" : "") + " · keyakinan " + Math.round(A.conf * 100) + "%";
  }
  function copyText() {
    var t = summary(); if (!t) return;
    try { navigator.clipboard.writeText(t).then(function () { toast_("Hasil ukur disalin"); }, function () { toast_(t); }); } catch (e) { toast_(t); }
  }
  function saveCur() {
    if (!cur || !cur.A) return; var A = cur.A, c = cur.c;
    DB = DB.filter(function (x) { return x.k !== c.key; });
    DB.push({ k: c.key, ruas: c.name || "", sta: c.sta || "", lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), W: A.W, bl: A.bl, br: A.br, dl: A.dl, dr: A.dr, blo: A.blo ? 1 : 0, bro: A.bro ? 1 : 0, mt: A.mk ? mkText(A.mk).edge : "", mm: A.mk ? mkText(A.mk).mid : "", ln: A.mk ? A.mk.lanes : "", conf: +A.conf.toFixed(2), n: A.n, ai: A.ai ? 1 : 0, t: new Date().toISOString() });
    if (DB.length > 800) DB = DB.slice(-800); jset(K_DB, DB); toast_("Tersimpan (" + DB.length + " titik)"); paint();
  }
  function csv() {
    if (!DB.length) return; function r1(v, o) { return v == null ? "" : (o ? "≥" : "") + (+v).toFixed(2); }
    var head = ["Ruas", "STA", "Lat", "Lng", "Lebar jalan (m)", "Bahu kiri (m)", "Bahu kanan (m)", "Drainase kiri (m)", "Drainase kanan (m)", "Marka tepi", "Marka tengah", "Lajur", "Keyakinan", "Panorama", "Waktu"];
    var rows = DB.map(function (x) { return [x.ruas, x.sta, x.lat, x.lng, r1(x.W), r1(x.bl, x.blo), r1(x.br, x.bro), r1(x.dl), r1(x.dr), x.mt || "", x.mm || "", x.ln || "", x.conf, x.n, x.t]; });
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
    csv: csv, saved: function () { return DB.slice(); }, remove: function (fn) { var n = DB.length; DB = DB.filter(function (x) { return !fn(x); }); jset(K_DB, DB); paint(); return n - DB.length; }, clear: function () { DB = []; jset(K_DB, DB); paint(); },
    _set: function (o) { if (o.meta) hooks.meta = o.meta; if (o.img) hooks.img = o.img; }
  };
})();
