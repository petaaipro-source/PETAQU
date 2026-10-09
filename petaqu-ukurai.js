/* PETAQU — UKUR AI GRATIS (PQJedaAI): pengukur cadangan untuk "Ukur Jeda" saat Google MENOLAK foto Street View
   (REQUEST_DENIED / billing belum aktif / kuota habis / CORS / tanpa kunci API).  100% GRATIS, TANPA KUNCI API, TANPA AKUN.

   Cara kerja (3 lapis, digabung berbobot keyakinan):
     1) VISI SATELIT — citra Esri World Imagery (gratis, CORS) di sekitar titik. Dari tiap titik diambil 9 irisan melintang
        tegak lurus arah jalan (±8 m sepanjang jalan, ±14 m ke samping, resolusi 0,25 m). Warna aspal/beton DIPELAJARI
        dari tengah jalan itu sendiri (adaptif, bukan angka tetap), lalu tepi jalan dicari dengan toleransi marka & noda.
        Vegetasi / atap / tanah / beton dibedakan → lebar jalan, bahu kiri/kanan, dan drainase beton (bila terlihat).
        KONSENSUS 9 irisan (persentil, bukan rata-rata) agar tajuk pohon yang menutupi jalan tidak memotong hasil.
     2) DATA OSM — Overpass API (gratis): tag width / lanes / highway / surface jalan terdekat; arah jalan dari geometri OSM
        (lebih akurat daripada arah pandang) dipakai menyetel irisan.
     3) PRIOR KELAS JALAN — standar umum (arteri/kolektor/lokal) hanya sebagai jaring pengaman bila 1 & 2 tak ada.
     Fusi: bobot = keyakinan; bila satelit & OSM sepakat → keyakinan naik; bila berbeda jauh → yang lebih yakin dipakai
     + peringatan. Keyakinan dibatasi ≤ 85% (ini estimasi citra atas, BUKAN survei alat; tipikal ±0,4–1,0 m).

   Hemat kuota/jaringan: hanya ≤4 tile + 1 kueri Overpass per titik, tile & hasil di-cache (memori + localStorage).
   Tidak memakai kuota Google sama sekali. */
(function () {
  "use strict";
  if (typeof window !== "undefined" && window.PQJedaAI) return;

  /* ==================== BAGIAN 1 — PURE (bisa diuji di Node) ==================== */
  var D = Math.PI / 180;
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function med(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function pct(a, p) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; }

  function worldPx(lat, lng, z) { var n = 256 * Math.pow(2, z), s = Math.sin(lat * D); return { x: (lng + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n }; }
  function mpp(lat, z) { return 156543.03392 * Math.cos(lat * D) / Math.pow(2, z); }

  /* raster = { x0, y0, w, h, data(RGBA) } dalam koordinat piksel dunia */
  function rgbAt(R, wx, wy) {
    var x = wx - R.x0 - 0.5, y = wy - R.y0 - 0.5, xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi + 1 >= R.w || yi + 1 >= R.h) return null;
    var fx = x - xi, fy = y - yi, d = R.data, o = [0, 0, 0], i00 = (yi * R.w + xi) * 4, i10 = i00 + 4, i01 = i00 + R.w * 4, i11 = i01 + 4;
    for (var k = 0; k < 3; k++) o[k] = (d[i00 + k] * (1 - fx) + d[i10 + k] * fx) * (1 - fy) + (d[i01 + k] * (1 - fx) + d[i11 + k] * fx) * fy;
    return o;
  }
  function feat(c) { var r = c[0], g = c[1], b = c[2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return { r: r, g: g, b: b, l: 0.299 * r + 0.587 * g + 0.114 * b, s: mx ? (mx - mn) / mx : 0 }; }
  function isVeg(f) { return (f.g > f.r + 5 && f.g >= f.b + 3 && f.s > 0.10) || (f.l < 62 && f.g >= f.r && f.g >= f.b && f.s > 0.08); }
  function isBld(f) { return (f.r > f.g + 30 && f.r > f.b + 40 && f.s > 0.52) || (f.b > f.r + 22 && f.b > f.g + 8); }
  function dist(f, ref) { var a = f.r - ref.r, b = f.g - ref.g, c = f.b - ref.b; return Math.sqrt(a * a + b * b + c * c); }

  var STEP = 0.25, TMAX = 14, ALONG = [-8, -6, -4, -2, 0, 2, 4, 6, 8], BMAX = 3.5;

  /* irisan melintang: t = −TMAX..+TMAX (negatif = KIRI arah jalan) */
  function profiles(R, lat, lng, z, heading, along) {
    var c = worldPx(lat, lng, z), m = mpp(lat, z), h = heading * D, ax = Math.sin(h), ay = -Math.cos(h), px = Math.cos(h), py = Math.sin(h), out = [], nT = Math.round(2 * TMAX / STEP) + 1;
    (along || ALONG).forEach(function (s) {
      var row = [];
      for (var i = 0; i < nT; i++) {
        var t = -TMAX + i * STEP, wx = c.x + (ax * s + px * t) / m, wy = c.y + (ay * s + py * t) / m, v = rgbAt(R, wx, wy);
        row.push(v ? feat(v) : null);
      }
      out.push(row);
    });
    return out;
  }

  /* analisis irisan → lebar jalan, bahu, drainase (satu raster) */
  function analyze(P, mz) {
    var nT = P[0] ? P[0].length : 0, mid = (nT - 1) / 2, near = [], tot = 0, i, r;
    P.forEach(function (row) { for (i = 0; i < nT; i++) { var t = -TMAX + i * STEP; if (Math.abs(t) <= 0.75) { tot++; var f = row[i]; if (f && !isVeg(f) && !isBld(f)) near.push(f); } } });
    if (!tot || near.length < tot * 0.3) return { fail: "pusat titik bukan jalan / tertutup pohon" };
    var ref = { r: med(near.map(function (f) { return f.r; })), g: med(near.map(function (f) { return f.g; })), b: med(near.map(function (f) { return f.b; })) }; ref.l = 0.299 * ref.r + 0.587 * ref.g + 0.114 * ref.b;
    var T = 24 + 0.12 * ref.l, GAP = 3, st = [];
    P.forEach(function (row) {
      var K = row.map(function (f) { /* 0=?,1=jalan,2=veg,3=bangunan,4=tanah/bahu,5=beton */
        if (!f) return 0; if (isVeg(f)) return 2; if (isBld(f)) return 3;
        if (f.s < 0.24 && dist(f, ref) < T) return 1;
        if (f.s < 0.14 && f.l > ref.l + 18 && f.l > 110) return 5;
        return 4;
      });
      var Kc = K.slice(), j, last = -1000;                                          /* tutup celah marka ≤ GAP sampel */
      for (j = 0; j < Kc.length; j++) { if (K[j] === 1) { if (last >= 0 && j - last > 1 && j - last - 1 <= GAP) { for (var q = last + 1; q < j; q++) if (K[q] !== 2 && K[q] !== 3 && K[q] !== 0) Kc[q] = 1; } last = j; } }
      var i0 = -1, best = 1e9; for (j = 0; j < Kc.length; j++) if (Kc[j] === 1) { var dd = Math.abs(j - mid) * STEP; if (dd < best) { best = dd; i0 = j; } }
      if (i0 < 0 || best > 2.5) { st.push(null); return; }
      var a = i0, b = i0; while (a > 0 && Kc[a - 1] === 1) a--; while (b < Kc.length - 1 && Kc[b + 1] === 1) b++;
      function side(from, dir) {
        var n = 0, k = from, conc = 0, cmax = 0, run = 0, firstClass = Kc[from];
        for (; k >= 0 && k < Kc.length && n * STEP < BMAX; k += dir) { var c = Kc[k]; if (c !== 4 && c !== 5) break; n++; if (c === 5) { run++; conc++; cmax = Math.max(cmax, run); } else run = 0; }
        var open = n * STEP >= BMAX - 0.01, w = n * STEP;
        return { w: w, open: open, conc: cmax * STEP, firstVeg: firstClass === 2, firstBld: firstClass === 3 };
      }
      st.push({ W: (b - a + 1) * STEP, L: side(a - 1, -1), R: side(b + 1, +1), mid: ((a + b) / 2 - mid) * STEP });
    });
    var ok = st.filter(Boolean);
    if (ok.length < 3) return { fail: "tepi jalan tak terbaca di citra (" + ok.length + "/" + P.length + " irisan)" };
    var Ws = ok.map(function (x) { return x.W; }).filter(function (w) { return w >= 2.5 && w <= 25; });
    if (Ws.length < 3) return { fail: "lebar di luar rentang wajar" };
    var m0 = med(Ws), W = pct(Ws.filter(function (w) { return w <= m0 * 1.3 + 0.5; }), 0.6), mad = med(Ws.map(function (w) { return Math.abs(w - m0); })) || 0;
    var err = Math.max(0.4, 1.4 * mad + 0.3, STEP * 1.5 * (mz / 0.3)), spread = Math.max.apply(null, Ws) - Math.min.apply(null, Ws);
    var conf = 0.8; if (spread > 1.0) conf -= 0.2; if (spread > 2.0) conf -= 0.15; if (ok.length < 6) conf *= 0.75; if (mz > 0.45) conf *= 0.8; if (near.length < tot * 0.6) conf *= 0.85;
    function sh(key) {
      var v = ok.map(function (x) { return x[key]; }), bw = med(v.map(function (x) { return x.w; })), op = v.filter(function (x) { return x.open; }).length * 2 >= v.length;
      var cv = v.filter(function (x) { return x.conc >= 0.3 && x.conc <= 1.6; }), dr = cv.length * 100 / v.length >= 40 ? med(cv.map(function (x) { return x.conc; })) : null;
      var occl = v.filter(function (x) { return x.firstVeg || x.firstBld; }).length * 2 >= v.length;
      var bb = bw - (dr || 0); return { b: bb < 0.4 ? 0 : bb, open: op, dr: dr, occl: occl };
    }
    var L = sh("L"), Rr = sh("R"), off = med(ok.map(function (x) { return x.mid; })) || 0;
    return { W: W, err: err, conf: Math.max(0.1, Math.min(0.85, conf)), spread: spread, n: ok.length, L: L, R: Rr, off: off, ref: ref };
  }

  /* ---- OSM ---- */
  var HW = { motorway: 7.5, trunk: 7.5, primary: 7.0, secondary: 6.5, tertiary: 5.5, unclassified: 4.5, residential: 4.0, living_street: 3.5, service: 3.0, road: 4.5, track: 2.5 };
  var HWR = { motorway: 9, trunk: 8, primary: 7, secondary: 6, tertiary: 5, unclassified: 4, residential: 3, road: 3, living_street: 2, service: 1, track: 0 };
  function parseW(v) { if (v == null) return null; var m = String(v).replace(",", ".").match(/(\d+(?:\.\d+)?)/); if (!m) return null; var x = +m[1]; if (/ft|'/.test(v)) x *= 0.3048; return x >= 2 && x <= 30 ? x : null; }
  function bearing(a, b) { var y = Math.sin((b.lng - a.lng) * D) * Math.cos(b.lat * D), x = Math.cos(a.lat * D) * Math.sin(b.lat * D) - Math.sin(a.lat * D) * Math.cos(b.lat * D) * Math.cos((b.lng - a.lng) * D); return (Math.atan2(y, x) / D + 360) % 360; }
  function ptSeg(p, a, b) {                                   /* jarak (m) titik→segmen, bidang lokal */
    var k = 111320, cx = Math.cos(p.lat * D), ax = (a.lng - p.lng) * k * cx, ay = (a.lat - p.lat) * k, bx = (b.lng - p.lng) * k * cx, by = (b.lat - p.lat) * k, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0, x = ax + t * dx, y = ay + t * dy;
    return Math.sqrt(x * x + y * y);
  }
  function osmPick(els, lat, lng) {
    var p = { lat: lat, lng: lng }, best = null;
    (els || []).forEach(function (w) {
      if (!w || !w.tags || !w.tags.highway || !w.geometry || w.geometry.length < 2) return;
      for (var i = 0; i + 1 < w.geometry.length; i++) {
        var a = w.geometry[i], b = w.geometry[i + 1], d = ptSeg(p, a, b);
        var rank = HWR[String(w.tags.highway).replace("_link", "")] || 0;
        if (!best || d < best.d - 3 || (Math.abs(d - best.d) <= 3 && rank > best.rank)) best = { d: d, rank: rank, tags: w.tags, brg: bearing(a, b) };
      }
    });
    return best && best.d <= 25 ? best : null;
  }
  function angDiff180(a, b) { var d = Math.abs(((a - b) % 180 + 180) % 180); return d > 90 ? 180 - d : d; }

  /* ---- fusi ---- */
  function fuse(sat, osm) {
    var parts = [], warn = [], hw = osm && String(osm.tags.highway || "").replace("_link", ""), tagW = osm ? parseW(osm.tags.width || osm.tags.est_width) : null, lanes = osm && +osm.tags.lanes;
    if (sat) parts.push({ W: sat.W, c: sat.conf, e: sat.err, k: "satelit" });
    if (tagW) parts.push({ W: tagW, c: 0.75, e: 0.5, k: "OSM width" });
    else if (lanes >= 1 && lanes <= 6) parts.push({ W: lanes * 3.1, c: 0.35, e: 1.0, k: "OSM lanes" });
    var needPrior = !parts.length || (sat && sat.conf < 0.45 && parts.length === 1);
    if (needPrior && hw && HW[hw]) { parts.push({ W: HW[hw], c: 0.25, e: 1.5, k: "kelas jalan (" + hw + ")" }); }
    if (!parts.length) return null;
    var out = { n: parts.length, W: null, err: null, conf: 0, spread: 0, warn: "", bl: null, br: null, dl: null, dr: null, blo: false, bro: false, obs: 0, shade: 0, ai: true, src: parts.map(function (p) { return p.k; }).join(" + ") };
    var hi = parts.slice().sort(function (a, b) { return b.c - a.c; }), a = hi[0], b = hi[1];
    if (b && Math.abs(a.W - b.W) > Math.max(1.5, 0.2 * a.W)) {
      out.W = a.W; out.conf = a.c * 0.8; out.err = Math.max(a.e, Math.abs(a.W - b.W) / 2); out.spread = Math.abs(a.W - b.W);
      warn.push(a.k + " " + a.W.toFixed(1) + " m ≠ " + b.k + " " + b.W.toFixed(1) + " m — dipakai yang lebih yakin");
    } else {
      var sw = 0, sc = 0, nc = 1; parts.forEach(function (p) { sw += p.c; sc += p.W * p.c; nc *= (1 - p.c); });
      out.W = sc / sw; out.conf = Math.min(0.85, parts.length > 1 ? 1 - nc * 0.9 : a.c); out.err = Math.max(0.25, Math.min.apply(null, parts.map(function (p) { return p.e; })) * (parts.length > 1 ? 0.8 : 1));
      out.spread = parts.length > 1 ? Math.max.apply(null, parts.map(function (p) { return p.W; })) - Math.min.apply(null, parts.map(function (p) { return p.W; })) : 0;
    }
    if (sat) {
      var bl = sat.L.b, br = sat.R.b;
      out.bl = bl; out.br = br; out.blo = sat.L.open; out.bro = sat.R.open;
      out.dl = sat.L.dr == null ? null : sat.L.dr; out.dr = sat.R.dr == null ? null : sat.R.dr;
      if (sat.L.occl && bl === 0) warn.push("bahu kiri 0 m bisa jadi tertutup pohon/bangunan");
      if (sat.R.occl && br === 0) warn.push("bahu kanan 0 m bisa jadi tertutup pohon/bangunan");
      if (sat.spread > 1.5) warn.push("lebar antar-irisan bervariasi " + sat.spread.toFixed(1) + " m (tajuk pohon/persimpangan?)");
      if (Math.abs(sat.off) > 2.2) warn.push("titik agak jauh dari sumbu jalan");
    }
    if (!sat) warn.push("citra satelit tak terbaca — hanya data OSM/kelas jalan (perkiraan kasar, bahu & drainase tidak diketahui)");
    if (!tagW && osm && !sat) warn.push("tag lebar OSM tidak ada");
    out.warn = warn.join(" · ");
    if (osm) out.osm = { hw: hw, surface: osm.tags.surface || "", lanes: osm.tags.lanes || "", name: osm.tags.name || osm.tags.ref || "" };
    return out;
  }

  if (typeof module !== "undefined" && module.exports) { module.exports = { worldPx: worldPx, mpp: mpp, profiles: profiles, analyze: analyze, fuse: fuse, osmPick: osmPick, parseW: parseW, bearing: bearing, angDiff180: angDiff180, rgbAt: rgbAt }; }
  if (typeof document === "undefined") return;

  /* ==================== BAGIAN 2 — BROWSER ==================== */
  var K_C = "pq_jedaai_v1", tileMem = {}, running = null;
  function jget(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function tmo(ms, p, msg) { return new Promise(function (res, rej) { var t = setTimeout(function () { rej(new Error(msg)); }, ms); p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); }); }); }

  function loadTile(z, x, y) {
    var k = z + "/" + x + "/" + y; if (tileMem[k]) return tileMem[k];
    var p = new Promise(function (res, rej) {
      var im = new Image(); im.crossOrigin = "anonymous";
      im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("tile satelit gagal dimuat")); };
      im.src = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" + z + "/" + y + "/" + x;
    });
    tileMem[k] = p; p.catch(function () { delete tileMem[k]; });
    var ks = Object.keys(tileMem); if (ks.length > 60) delete tileMem[ks[0]];
    return p;
  }
  async function getRaster(lat, lng, z) {
    var c = worldPx(lat, lng, z), r = 22 / mpp(lat, z) + 2, tx0 = Math.floor((c.x - r) / 256), tx1 = Math.floor((c.x + r) / 256), ty0 = Math.floor((c.y - r) / 256), ty1 = Math.floor((c.y + r) / 256), jobs = [], x, y;
    for (y = ty0; y <= ty1; y++) for (x = tx0; x <= tx1; x++) jobs.push({ x: x, y: y, p: loadTile(z, x, y) });
    var ims = await tmo(12000, Promise.all(jobs.map(function (j) { return j.p; })), "citra satelit lambat (timeout 12 dtk)");
    var cv = document.createElement("canvas"); cv.width = (tx1 - tx0 + 1) * 256; cv.height = (ty1 - ty0 + 1) * 256;
    var cx = cv.getContext("2d", { willReadFrequently: true });
    jobs.forEach(function (j, i) { cx.drawImage(ims[i], (j.x - tx0) * 256, (j.y - ty0) * 256); });
    var id; try { id = cx.getImageData(0, 0, cv.width, cv.height); } catch (e) { throw new Error("browser memblokir pembacaan citra satelit (CORS)"); }
    /* tile "data belum tersedia" Esri = abu-abu seragam */
    var s = 0, s2 = 0, n = 0, d = id.data; for (var i = 0; i < d.length; i += 4 * 97) { var l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; s += l; s2 += l * l; n++; }
    var sd = Math.sqrt(Math.max(0, s2 / n - (s / n) * (s / n)));
    return { x0: tx0 * 256, y0: ty0 * 256, w: cv.width, h: cv.height, data: d, flat: sd < 7 };
  }

  var OVP = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  async function getOsm(lat, lng) {
    var q = '[out:json][timeout:8];way(around:30,' + lat.toFixed(6) + ',' + lng.toFixed(6) + ')[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|track)(_link)?$"];out tags geom;';
    for (var i = 0; i < OVP.length; i++) {
      try {
        var ctl = typeof AbortController !== "undefined" ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, 7000) : 0;
        var r = await fetch(OVP[i] + "?data=" + encodeURIComponent(q), ctl ? { signal: ctl.signal } : undefined); if (t) clearTimeout(t);
        if (!r.ok) continue; var j = await r.json(); return osmPick(j.elements, lat, lng);
      } catch (e) { /* coba server berikutnya */ }
    }
    return undefined;                                                    /* undefined = gagal; null = tidak ada jalan OSM */
  }

  /* ukur satu titik. c = { lat, lng, rh } → hasil berbentuk sama dengan PQJeda.agg() (+ ai:true) */
  async function measure(c) {
    var key = c.lat.toFixed(5) + "," + c.lng.toFixed(5) + "|" + Math.round((c.rh || 0) / 15), db = jget(K_C, {});
    if (db[key]) return db[key];
    var osmP = getOsm(c.lat, c.lng), osm, sat = null, why = "", Z = [19, 18], i;
    var h = c.rh || 0;
    osm = await osmP;
    if (osm && fin(osm.brg) && fin(c.rh) && angDiff180(osm.brg, c.rh) <= 35) { var d1 = Math.abs(((osm.brg - c.rh + 540) % 360) - 180); h = d1 < 90 ? osm.brg : (osm.brg + 180) % 360; }
    for (i = 0; i < Z.length && !sat; i++) {
      try {
        var R = await getRaster(c.lat, c.lng, Z[i]);
        if (R.flat) { why = "citra z" + Z[i] + " belum tersedia"; continue; }
        var an = analyze(profiles(R, c.lat, c.lng, Z[i], h), mpp(c.lat, Z[i]));
        if (an.fail) { why = an.fail; continue; }
        if (Z[i] < 19) an.conf *= 0.75;
        sat = an; sat.z = Z[i];
      } catch (e) { why = e.message || String(e); if (/CORS/.test(why)) break; }
    }
    var out = fuse(sat, osm || null);
    if (!out) throw new Error(why || "tidak ada citra satelit maupun data OSM untuk titik ini");
    if (!sat && why) out.warn = (out.warn ? out.warn + " · " : "") + why;
    if (osm === undefined) out.warn = (out.warn ? out.warn + " · " : "") + "server OSM tak terjangkau";
    if (sat) out.src = "satelit z" + sat.z + (out.src.indexOf("OSM") >= 0 ? out.src.replace("satelit", "") : "");
    if (out.osm || sat) { db = jget(K_C, {}); var ks = Object.keys(db); if (ks.length > 300) delete db[ks[0]]; db[key] = out; jset(K_C, db); }
    return out;
  }

  window.PQJedaAI = { measure: measure, version: 1, clear: function () { jset(K_C, {}); tileMem = {}; } };
})();
