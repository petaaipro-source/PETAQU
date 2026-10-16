/* PETAQU — Impor IRI: opsi Koordinat + Scan Cerdas Ruas & STA (fungsi impor lama tetap utuh) */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var say = function (m, err) { try { toast(m, !!err); } catch (e) { console.log(m); } };

  /* ================= PARSER KOORDINAT ================= */
  var IN_LAT = function (v) { return v >= -11.5 && v <= 6.5; };
  var IN_LNG = function (v) { return v >= 94 && v <= 141.5; };

  function utmToLL(E, N, zone, south) {
    var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    var x = E - 500000, y = south ? N - 10000000 : N, M = y / k0;
    var mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256));
    var e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    var p1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
    var C1 = ep2 * c * c, T1 = t * t, N1 = a / Math.sqrt(1 - e2 * s * s), R1 = a * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5), D = x / (N1 * k0);
    var lat = p1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4) / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    var lon = (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / c;
    return { lat: lat * 180 / Math.PI, lng: (zone * 6 - 183) + lon * 180 / Math.PI };
  }

  function dmsToDeg(d, m, s, h) { var v = Math.abs(+d) + (+m || 0) / 60 + (+s || 0) / 3600; if (/[SWsw]/.test(h || "") || +d < 0) v = -v; return v; }

  /* Ekstrak sepasang koordinat dari satu teks. mode: auto|dec|dms|utm. Kembalikan {lat,lng} atau null */
  function parseCoordText(t, mode, zone) {
    t = String(t || "").trim(); if (!t) return null;
    var m, vals = [];
    var dmsRe = /(\d{1,3})\s*[°º:\s]\s*(\d{1,2})\s*['′:\s]\s*(\d{1,2}(?:[.,]\d+)?)?\s*(?:["″]|'')?\s*([NSEWnsew])?/g;
    if (mode !== "dec" && mode !== "utm" && /[°º'′"″]/.test(t)) {
      while ((m = dmsRe.exec(t))) { if (m[1] === undefined) continue; vals.push({ v: dmsToDeg(m[1], m[2], (m[3] || "0").replace(",", "."), m[4]), h: (m[4] || "").toUpperCase() }); }
      if (vals.length >= 2) return orient(vals[0], vals[1]);
    }
    var tt = t.replace(/(\d)\s*[NSEWnsew]\b/g, function (x) { return x; });
    var hs = (tt.match(/[NSEWnsew]/g) || []).join("").toUpperCase();
    var nums = tt.replace(/(\d),(\d)/g, "$1.$2").match(/[-+]?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 2) return null;
    nums = nums.map(parseFloat);
    var a = nums[0], b = nums[1];
    if (mode === "utm" || (mode === "auto" && (Math.abs(a) > 1000 || Math.abs(b) > 1000))) {
      var E = Math.abs(a) < Math.abs(b) || (a > 100000 && a < 900000 && b > 1000000) ? a : b, N = E === a ? b : a;
      if (E > 100000 && E < 900000) { var r = utmToLL(E, N, zone || 49, true); return IN_LAT(r.lat) && IN_LNG(r.lng) ? r : null; }
      return null;
    }
    var lat = a, lng = b;
    if (/S/.test(hs) && lat > 0 && /^[^SsNn]*[Ss]/.test(tt)) lat = -lat;
    if (IN_LNG(a) && IN_LAT(b) && !(IN_LAT(a) && IN_LNG(b))) { lat = b; lng = a; }
    else if (!(IN_LAT(lat) && IN_LNG(lng))) return null;
    if (lat > 0 && /S/i.test(hs) && !/N/i.test(hs)) lat = -lat;
    return { lat: lat, lng: lng };
  }
  function orient(x, y) {
    var A = x.v, B = y.v, ha = x.h, hb = y.h;
    if (/[EW]/.test(ha) || (/[NS]/.test(hb))) { var tmp = A; A = B; B = tmp; }
    else if (!ha && !hb && IN_LNG(A) && IN_LAT(B) && !(IN_LAT(A) && IN_LNG(B))) { var t2 = A; A = B; B = t2; }
    return IN_LAT(A) && IN_LNG(B) ? { lat: A, lng: B } : null;
  }

  var STA_RE = /(?:^|[^\d+])(\d{1,4})\s*\+\s*(\d{1,3})(?:[.,]\d+)?(?!\d)/;
  function staFromText(t) { var m = STA_RE.exec(String(t || "")); return m ? m[1] + "+" + ("00" + m[2]).slice(-3).replace(/^0*(\d{3})$/, "$1") : null; }
  function staNorm(v) { // "12+345" | "12.345"(km) | 12.3 | "12345"(m)
    if (v == null || v === "") return null; var s = String(v).trim();
    var m = /^(\d{1,4})\s*\+\s*(\d{1,3})/.exec(s); if (m) return +m[1] * 1000 + +(m[2] + "00").slice(0, 3);
    var n = parseFloat(s.replace(",", ".")); if (isNaN(n)) return null;
    return n < 1000 ? Math.round(n * 1000) : Math.round(n);
  }
  var fmtSta = function (m) { m = Math.max(0, Math.round(m)); return Math.floor(m / 1000) + "+" + String(m % 1000).padStart(3, "0"); };

  /* ---- teks/tabel -> baris array ---- */
  function splitRows(text) {
    var lines = String(text).split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var f = lines[0], d = ["\t", ";", ","].map(function (c) { return [c, f.split(c).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0];
    var delim = d[1] > 1 ? d[0] : null;
    return lines.map(function (l) { return delim ? l.split(delim).map(function (x) { return x.replace(/^"|"$/g, "").trim(); }) : [l.trim()]; });
  }
  function readFileRows(file, cb) {
    var rd = new FileReader(), isX = /\.(xlsx|xls)$/i.test(file.name);
    rd.onload = function (e) {
      try {
        if (isX || typeof e.target.result !== "string") {
          var wb = XLSX.read(e.target.result, { type: "array" }), rows = [];
          wb.SheetNames.forEach(function (n) { rows = rows.concat(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: false })); });
          cb(rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); }));
        } else cb(splitRows(e.target.result));
      } catch (er) { say("Gagal membaca file: " + er.message, true); }
    };
    if (isX) rd.readAsArrayBuffer(file); else rd.readAsText(file);
  }

  var HDR = { lat: /^(lat|latitude|lintang|y)\b/i, lng: /^(lon|lng|long|longitude|bujur|x)\b/i, sta: /^(sta|station|stasiun|patok|km)\b/i, ruas: /(ruas|nama\s*jalan|nama\s*ruas|^jalan|segmen|link|road)/i, iri: /iri/i, kondisi: /kondisi/i, lebar: /lebar/i, ket: /(ket|catatan|note|remark)/i, coord: /(koordinat|coord|posisi|lokasi)/i, e: /(easting|^e$)/i, n: /(northing|^n$)/i };
  function detectCols(rows) {
    var h = rows[0] || [], map = {}, hasHdr = false;
    h.forEach(function (c, i) { c = String(c).trim(); if (!c || /^[-+\d.,\s+]+$/.test(c)) return; for (var k in HDR) if (map[k] === undefined && HDR[k].test(c)) { map[k] = i; hasHdr = true; } });
    return { map: map, hasHdr: hasHdr };
  }
  /* rows -> [{lat,lng,sta,staM,ruas,iri,kondisi,lebar,ket,raw,line}] */
  function normalizeRows(rows, mode, zone) {
    var dc = detectCols(rows), M = dc.map, out = [], bad = 0, start = dc.hasHdr ? 1 : 0;
    for (var i = start; i < rows.length; i++) {
      var r = rows[i], o = { line: i + 1, raw: r.join(" | ") }, ll = null;
      var g = function (k) { return M[k] !== undefined ? String(r[M[k]] == null ? "" : r[M[k]]).trim() : ""; };
      if (dc.hasHdr) {
        if (M.lat !== undefined && M.lng !== undefined) ll = parseCoordText(g("lat") + " " + g("lng"), "dec", zone) || (IN_LAT(parseFloat(g("lat").replace(",", "."))) ? { lat: parseFloat(g("lat").replace(",", ".")), lng: parseFloat(g("lng").replace(",", ".")) } : null);
        if (!ll && M.e !== undefined && M.n !== undefined) ll = parseCoordText(g("e") + " " + g("n"), "utm", zone);
        if (!ll && M.coord !== undefined) ll = parseCoordText(g("coord"), mode, zone);
        o.staTxt = g("sta"); o.ruas = g("ruas"); o.iri = g("iri"); o.kondisi = g("kondisi"); o.lebar = g("lebar"); o.ket = g("ket");
        if (!ll && !o.ruas && !o.staTxt) ll = parseCoordText(r.join(" "), mode, zone);
      } else {
        var line = r.join(" "), sta = staFromText(line);
        var rest = sta ? line.replace(STA_RE, " ") : line;
        ll = parseCoordText(rest, mode, zone); o.staTxt = sta || "";
      }
      if (ll) { o.lat = ll.lat; o.lng = ll.lng; }
      o.staM = staNorm(o.staTxt);
      if (!ll && o.staM == null) { bad++; continue; }
      out.push(o);
    }
    return { rows: out, bad: bad, hasHdr: dc.hasHdr, cols: M };
  }

  /* ================= GEOMETRI ================= */
  var KLAT = 111320;
  function distM(a, b) { var kx = KLAT * Math.cos((a[0] + b[0]) * Math.PI / 360); return Math.hypot((a[0] - b[0]) * KLAT, (a[1] - b[1]) * kx); }
  function pathStats(pts) { var c = [0]; for (var i = 1; i < pts.length; i++) c.push(c[i - 1] + distM(pts[i - 1], pts[i])); return c; }
  function decPoly(e) { for (var t = 0, n = 0, c = 0, r = []; t < e.length;) { var o = 0, u = 0, g; do g = e.charCodeAt(t++) - 63, o |= (g & 31) << u, u += 5; while (g >= 32); n += o & 1 ? ~(o >> 1) : o >> 1; o = 0; u = 0; do g = e.charCodeAt(t++) - 63, o |= (g & 31) << u, u += 5; while (g >= 32); c += o & 1 ? ~(o >> 1) : o >> 1; r.push([n / 1e5, c / 1e5]); } return r; }

  var CANDS = null;
  function buildCands(useJN) {
    var list = [];
    try {
      (roads || []).forEach(function (r) {
        var p = (r.points || []).filter(function (q) { return isFinite(q.lat) && isFinite(q.lng); });
        if (p.length < 2) return;
        var pts = p.map(function (q) { return [q.lat, q.lng]; }), sta = p.map(function (q) { return staNorm(q.sta) ; });
        var cc = mkCand(r.name, "", pts, sta, "app", r.id); cc.iri = p.map(function (q) { var v = parseFloat(q.iri); return isNaN(v) ? null : v; }); list.push(cc);
      });
    } catch (e) { }
    if (useJN) {
      try {
        var js = JSON.parse($("jn-data").textContent);
        js.r.forEach(function (r) {
          var pts = []; r[5].forEach(function (pl) { pts = pts.concat(decPoly(pl)); });
          if (pts.length > 1) list.push(mkCand(r[0], r[1] || "", pts, null, "jn", null));
        });
      } catch (e) { }
    }
    return list;
  }
  function fillSta(c) {
    var n = c.pts.length, s = c.sta ? c.sta.slice() : new Array(n).fill(null), cum = c.cum, k;
    var known = s.map(function (v, i) { return v != null ? i : -1; }).filter(function (i) { return i >= 0; });
    if (!known.length) { for (k = 0; k < n; k++) s[k] = Math.round(cum[k]); c.staReal = false; }
    else {
      c.staReal = true;
      for (k = 0; k < n; k++) if (s[k] == null) {
        var pv = -1, nx = -1, j;
        for (j = k - 1; j >= 0; j--) if (c.sta[j] != null) { pv = j; break; }
        for (j = k + 1; j < n; j++) if (c.sta[j] != null) { nx = j; break; }
        if (pv >= 0 && nx >= 0 && cum[nx] > cum[pv]) s[k] = c.sta[pv] + (c.sta[nx] - c.sta[pv]) * (cum[k] - cum[pv]) / (cum[nx] - cum[pv]);
        else if (pv >= 0) { var dir = known.length > 1 ? (c.sta[known[known.length - 1]] >= c.sta[known[0]] ? 1 : -1) : 1; s[k] = c.sta[pv] + dir * (cum[k] - cum[pv]); }
        else { var dir2 = known.length > 1 ? (c.sta[known[known.length - 1]] >= c.sta[known[0]] ? 1 : -1) : 1; s[k] = c.sta[nx] - dir2 * (cum[nx] - cum[k]); }
      }
    }
    c.s = s;
  }
  function mkCand(name, code, pts, sta, src, id) {
    var la = pts.map(function (p) { return p[0]; }), lo = pts.map(function (p) { return p[1]; });
    var c = { name: name, code: code, pts: pts, sta: sta, src: src, id: id, cum: pathStats(pts), bb: [Math.min.apply(0, la), Math.min.apply(0, lo), Math.max.apply(0, la), Math.max.apply(0, lo)], tok: tokens(name + " " + code) };
    fillSta(c); c.len = c.cum[c.cum.length - 1]; return c;
  }
  var STOP = { jalan: 1, jln: 1, jl: 1, ruas: 1, bts: 1, batas: 1, kota: 1, kab: 1, kabupaten: 1, no: 1, nasional: 1, dan: 1 };
  function tokens(s) { var o = {}; String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").forEach(function (t) { if (t && !STOP[t] && !(t.length < 2 && !/\d/.test(t))) o[t] = 1; }); return o; }
  function nameScore(a, b) { var i = 0, u = 0, k; for (k in a) { u++; if (b[k]) i++; } for (k in b) if (!a[k]) u++; return u ? i / u : 0; }

  function snap(c, lat, lng) { // titik terdekat di polyline c
    var best = { d: 1e12 }, kx = KLAT * Math.cos(lat * Math.PI / 180), P = c.pts;
    for (var i = 0; i < P.length - 1; i++) {
      var ax = (P[i][1] - lng) * kx, ay = (P[i][0] - lat) * KLAT, bx = (P[i + 1][1] - lng) * kx, by = (P[i + 1][0] - lat) * KLAT;
      var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
      var d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best.d) best = { d: d, i: i, t: t, lat: P[i][0] + t * (P[i + 1][0] - P[i][0]), lng: P[i][1] + t * (P[i + 1][1] - P[i][1]) };
    }
    best.staM = c.s[best.i] + (c.s[best.i + 1] - c.s[best.i]) * best.t; best.along = c.cum[best.i] + (c.cum[best.i + 1] - c.cum[best.i]) * best.t;
    return best;
  }
  function atSta(c, staM) { // posisi di STA tertentu
    var S = c.s, n = S.length, k;
    for (var i = 0; i < n - 1; i++) {
      var lo = Math.min(S[i], S[i + 1]), hi = Math.max(S[i], S[i + 1]);
      if (staM >= lo - 0.5 && staM <= hi + 0.5) { var t = hi > lo ? (staM - S[i]) / (S[i + 1] - S[i]) : 0; return { lat: c.pts[i][0] + t * (c.pts[i + 1][0] - c.pts[i][0]), lng: c.pts[i][1] + t * (c.pts[i + 1][1] - c.pts[i][1]), inRange: true }; }
    }
    var iMin = S.indexOf(Math.min.apply(0, S)), iMax = S.indexOf(Math.max.apply(0, S)), k2 = Math.abs(staM - S[iMin]) < Math.abs(staM - S[iMax]) ? iMin : iMax;
    return { lat: c.pts[k2][0], lng: c.pts[k2][1], inRange: false };
  }

  /* ================= SCAN ================= */
  function scan(rows, opt, progress, done) {
    CANDS = buildCands(opt.useJN);
    var cands = opt.only ? CANDS.filter(function (c) { return c.id === opt.only; }) : CANDS, res = [], i = 0, th = opt.th;
    var pad = th / KLAT * 3 + 0.0005;
    function one(r) {
      var o = { src: r, ruas: "", sta: "", dist: null, lat: r.lat, lng: r.lng, status: "none", cand: null };
      var hint = null;
      if (r.ruas) { var tk = tokens(r.ruas), sc = 0; cands.forEach(function (c) { var s = nameScore(tk, c.tok); if (c.code && String(r.ruas).indexOf(c.code) > -1) s = Math.max(s, .9); if (s > sc) { sc = s; hint = c; } }); if (sc < .4) hint = null; else o.hintScore = sc; }
      if (r.lat != null) {
        var best = null, pool = hint ? [hint] : cands;
        for (var pass = 0; pass < 2 && !best; pass++) {
          pool.forEach(function (c) {
            var bb = c.bb, p = pad * (pass ? 6 : 1);
            if (r.lat < bb[0] - p || r.lat > bb[2] + p || r.lng < bb[1] - p || r.lng > bb[3] + p) return;
            var s = snap(c, r.lat, r.lng); if (!best || s.d < best.s.d) best = { c: c, s: s };
          });
          if (!best && hint) pool = cands; else break;
        }
        if (hint && best && best.c !== hint && best.s.d > th) { var hs = null; hs = snap(hint, r.lat, r.lng); if (hs.d <= th * 3) best = { c: hint, s: hs }; }
        if (best) {
          o.cand = best.c; o.ruas = best.c.name; o.dist = best.s.d; o.staM = best.s.staM; o.sta = fmtSta(best.s.staM) + (best.c.staReal ? "" : "*");
          o.status = best.s.d <= th ? "ok" : best.s.d <= th * 4 ? "far" : "none";
          o.slat = best.s.lat; o.slng = best.s.lng;
          if (r.staM != null && best.c.staReal && Math.abs(best.s.staM - r.staM) > Math.max(300, th * 4)) { o.note = "STA asli " + fmtSta(r.staM) + " ≠ hasil scan"; if (o.status === "ok") o.status = "far"; }
          if (r.staM != null && o.status !== "ok") { /* pakai STA asli bila ada */ o.sta = fmtSta(r.staM); }
        }
      } else if (hint && r.staM != null) {
        var p2 = atSta(hint, r.staM); o.cand = hint; o.ruas = hint.name; o.sta = fmtSta(r.staM); o.staM = r.staM; o.lat = p2.lat; o.lng = p2.lng; o.dist = 0;
        o.status = p2.inRange ? (o.hintScore >= .6 ? "ok" : "far") : "far"; if (!p2.inRange) o.note = "STA di luar rentang ruas";
      }
      if (o.status === "none" && r.ruas && !o.ruas) o.ruas = r.ruas + " (tak dikenali)";
      return o;
    }
    (function tick() {
      var end = Math.min(rows.length, i + 150);
      for (; i < end; i++) res.push(one(rows[i]));
      progress(i, rows.length);
      if (i < rows.length) setTimeout(tick, 0); else done(res);
    })();
  }

  /* ================= TERAPKAN KE PETA ================= */
  function mkPoint(sta, lat, lng, extra) {
    extra = extra || {};
    var iri = parseFloat(String(extra.iri || "").replace(",", "."));
    var lb = parseFloat(String(extra.lebar || "").replace(",", "."));
    return { sta: sta, lat: lat, lng: lng, tipe: "Label Utama", iri: isNaN(iri) ? null : iri, km: null, kmAuto: null, lebar: isNaN(lb) ? null : lb, kondisi: extra.kondisi || null, tahun: null, keterangan: extra.ket || null, riwayat: null, perkerasan: null, extra: null };
  }
  function pushToRoad(name, pts, roadId) {
    if (!pts.length) return 0;
    var road = roadId ? roads.filter(function (r) { return r.id === roadId; })[0] : null;
    if (!road) road = roads.filter(function (r) { return r.name === name; })[0];
    if (road) {
      var have = {}; road.points.forEach(function (p) { have[p.sta + "|" + p.lat.toFixed(5)] = 1; });
      var add = pts.filter(function (p) { return !have[p.sta + "|" + p.lat.toFixed(5)]; });
      road.points = orderRoadPoints(road.points.concat(add)); persist(); renderRoadLayer(road); renderRoadList(); updateStats(); akRun([road], true); return add.length;
    }
    var nr = addRoad(name, orderRoadPoints(pts)); akRun([nr || roads[roads.length - 1]], true); return pts.length;
  }


  /* ================= KABUPATEN OTOMATIS (dari titik yang dipetakan) ================= */
  var AK = { idx: null, cache: {}, loading: null };
  function akDec(str) { var i = 0, la = 0, lo = 0, o = []; while (i < str.length) { var b, sh = 0, r = 0; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); la += r & 1 ? ~(r >> 1) : r >> 1; sh = 0; r = 0; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lo += r & 1 ? ~(r >> 1) : r >> 1; o.push([la / 1e5, lo / 1e5]); } return o; }
  function akPip(r, la, lo) { var c = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var a = r[i], b = r[j]; if ((a[1] > lo) !== (b[1] > lo) && la < (b[0] - a[0]) * (lo - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function akLoad(cb) {
    if (window.PQ_KABBATAS) return cb(true);
    if (AK.loading) { AK.loading.push(cb); return; } AK.loading = [cb];
    var sc = document.createElement("script"); sc.src = "data-kabbatas.js";
    var fin = function (ok) { var q = AK.loading; AK.loading = null; q.forEach(function (f) { f(ok && !!window.PQ_KABBATAS); }); };
    sc.onload = function () { fin(true); }; sc.onerror = function () { fin(false); }; document.head.appendChild(sc);
  }
  function akIndex() { // bbox murah dulu; cincin didekode malas (hanya kabupaten yang kena)
    if (AK.idx) return AK.idx; var D = window.PQ_KABBATAS || {}, L = [];
    for (var p in D) D[p].forEach(function (k) { L.push({ p: p, n: k[0], enc: k[1], rings: null, bb: null }); });
    return (AK.idx = L);
  }
  function akRings(k) {
    if (!k.rings) { k.rings = k.enc.map(akDec); var s = 90, w = 180, n = -90, e = -180; k.rings.forEach(function (r) { r.forEach(function (q) { if (q[0] < s) s = q[0]; if (q[0] > n) n = q[0]; if (q[1] < w) w = q[1]; if (q[1] > e) e = q[1]; }); }); k.bb = [s, w, n, e]; }
    return k.rings;
  }
  function akKabAt(lat, lng) {
    var key = lat.toFixed(4) + "," + lng.toFixed(4); if (AK.cache[key] !== undefined) return AK.cache[key];
    var K = akIndex(), best = null, bd = 1e9, near = [];
    for (var i = 0; i < K.length; i++) {
      var k = K[i]; akRings(k); var b = k.bb;
      if (lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3]) {
        var c = false; k.rings.forEach(function (r) { if (akPip(r, lat, lng)) c = !c; });
        if (c) return (AK.cache[key] = k.n);
        near.push(k);
      } else if (lat >= b[0] - .06 && lat <= b[2] + .06 && lng >= b[1] - .06 && lng <= b[3] + .06) near.push(k);
    }
    near.forEach(function (k) { k.rings.forEach(function (r) { for (var j = 0; j < r.length; j++) { var d = (r[j][0] - lat) * (r[j][0] - lat) + (r[j][1] - lng) * (r[j][1] - lng); if (d < bd) { bd = d; best = k; } } }); });
    return (AK.cache[key] = (best && bd < .0036) ? best.n : null); // di luar polygon (garis pantai) -> terdekat <= ~6 km
  }
  // Tetapkan kabupaten tiap titik + kabupaten ruas = dominan (mayoritas titik). Mengembalikan nama kab atau null.
  function akFixRoad(road) {
    try {
      if (!road || !road.points || !road.points.length) return null;
      if (road.kabupaten === "Rute Konstruksi Manual" || road.isManualDrawing && road.kabupaten === "Gambar Manual") return null;
      var cnt = {}, tot = 0, pts = road.points;
      for (var i = 0; i < pts.length; i++) { var q = pts[i], la = +q.lat, lo = +q.lng; if (!isFinite(la) || !isFinite(lo)) continue; var n = akKabAt(la, lo); if (!n) continue; q.kab = n; cnt[n] = (cnt[n] || 0) + 1; tot++; }
      if (!tot) return null;
      var top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0];
      road.kabupaten = top; road.kabMix = Object.keys(cnt).length > 1 ? cnt : null;
      return top;
    } catch (e) { console.error(e); return null; }
  }
  function akRun(list, silent) {
    akLoad(function (ok) {
      if (!ok) return; var ch = [], mixed = 0;
      list.forEach(function (r) { var old = r && r.kabupaten, nw = akFixRoad(r); if (nw) { if (r.kabMix) mixed++; if (nw !== old) ch.push(r.name + ": " + (old || "-") + " → " + nw); } });
      if (ch.length || list.length) { try { persist(); renderRoadList(); updateStats(); } catch (e) { } try { if (typeof updateKabupatenStyleList === "function") updateKabupatenStyleList(); } catch (e) { } }
      if (!silent || ch.length) say(ch.length ? "Kabupaten otomatis diperbarui di " + ch.length + " ruas (sesuai titik di peta)" + (mixed ? " · " + mixed + " ruas melintasi >1 kabupaten (dipakai yang dominan)" : "") : "Kabupaten sudah sesuai titik peta");
    });
  }
  function akFixAll() { akRun(roads.slice(), false); }

  /* ================= UI ================= */
  var css = "#pqIc{position:fixed;inset:0;z-index:3200;display:none;align-items:flex-start;justify-content:center;padding:12px;background:#03060cc7;backdrop-filter:blur(4px);overflow:auto}#pqIc.show{display:flex}#pqIc .bx{width:min(720px,100%);background:var(--panel,#0f1521);border:1px solid var(--line,#1e2938);border-radius:14px;color:var(--text,#e6edf5);font:13px/1.4 system-ui,sans-serif;box-shadow:0 18px 50px #000a;position:relative;margin:auto}#pqIc header{padding:12px 14px 0;display:flex;gap:8px;align-items:center}#pqIc header b{flex:1;font-size:15px}#pqIc .x{background:0;border:0;color:#8fa6bd;font-size:22px;cursor:pointer}#pqIc .tabs{display:flex;gap:6px;padding:10px 14px 0}#pqIc .tab{flex:1;padding:9px;border-radius:9px;border:1px solid var(--line,#1e2938);background:#0a0e17;color:#9db3c9;cursor:pointer;font-weight:600;font-size:12.5px}#pqIc .tab.on{border-color:#22d3ee;color:#22d3ee;background:#22d3ee14}#pqIc .pn{padding:12px 14px 14px;display:none;flex-direction:column;gap:9px}#pqIc .pn.on{display:flex}#pqIc textarea,#pqIc input[type=text],#pqIc select,#pqIc input[type=number]{width:100%;box-sizing:border-box;background:#0a0e17;border:1px solid var(--line,#1e2938);border-radius:9px;color:#e6edf5;padding:8px 10px;font:inherit;outline:0}#pqIc textarea{min-height:110px;font-family:ui-monospace,Menlo,monospace;font-size:12px;resize:vertical}#pqIc textarea:focus,#pqIc input:focus,#pqIc select:focus{border-color:#22d3ee}#pqIc .r{display:flex;gap:8px;flex-wrap:wrap}#pqIc .r>*{flex:1;min-width:130px}#pqIc label.s{font-size:11px;color:#8fa6bd;display:block;margin-bottom:3px}#pqIc .b{padding:9px 14px;border-radius:9px;border:1px solid #22d3ee;background:#22d3ee22;color:#22d3ee;font-weight:700;cursor:pointer;font-size:12.5px}#pqIc .b.g{border-color:#34d399;background:#34d39922;color:#34d399}#pqIc .b.o{border-color:var(--line,#1e2938);background:#0a0e17;color:#9db3c9}#pqIc .b:disabled{opacity:.4;cursor:default}#pqIc .hint{font-size:11.5px;color:#8fa6bd}#pqIc .sum{display:flex;gap:6px;flex-wrap:wrap}#pqIc .chip{padding:3px 9px;border-radius:999px;border:1px solid var(--line,#1e2938);background:#0a0e17;font-size:11.5px}#pqIc .tw{max-height:260px;overflow:auto;border:1px solid var(--line,#1e2938);border-radius:9px}#pqIc table{width:100%;border-collapse:collapse;font-size:11.5px}#pqIc th{position:sticky;top:0;background:#111a29;text-align:left;padding:6px 7px;color:#9db3c9}#pqIc td{padding:5px 7px;border-top:1px solid #1a2433;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis}#pqIc .ok{color:#34d399}#pqIc .far{color:#f59e0b}#pqIc .none{color:#f43f5e}#pqIc .bar{height:6px;border-radius:4px;background:#1a2433;overflow:hidden}#pqIc .bar i{display:block;height:100%;width:0;background:#22d3ee;transition:width .15s}";

  var S = { coord: { parsed: null, ll: [] }, scan: { rows: null, res: null }, layer: null };

  function build() {
    if ($("pqIc")) return;
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    var d = document.createElement("div"); d.id = "pqIc";
    d.innerHTML = '<div class="bx"><header><b><i class="fa-solid fa-wand-magic-sparkles"></i> Impor Cerdas</b><button class="x" id="icX" aria-label="Tutup">×</button></header>' +
      '<div class="tabs"><button class="tab on" data-t="k"><i class="fa-solid fa-location-dot"></i> Koordinat</button><button class="tab" data-t="s"><i class="fa-solid fa-crosshairs"></i> Scan Ruas &amp; STA</button><button class="tab" data-t="i"><i class="fa-solid fa-gauge-high"></i> Scan IRI</button></div>' +

      '<div class="pn on" id="icK"><div class="hint">Tempel titik (satu per baris) atau pilih file CSV/TXT/Excel. Format otomatis dikenali: <b>-7.5123, 109.2345</b> · <b>109.2345 -7.5123</b> (lat/lng tertukar dibetulkan) · DMS <b>7°30\'44"S 109°14\'4"E</b> · UTM <b>E N</b> · boleh disertai STA (<b>12+345</b>) &amp; header (lat, lng, sta, iri, ket).</div>' +
      '<textarea id="icKt" placeholder="-7.51234, 109.23456&#10;-7.51301, 109.23510, 12+400&#10;7°30\'44&quot;S 109°14\'4&quot;E"></textarea>' +
      '<div class="r"><div><label class="s">Atau file</label><input type="file" id="icKf" accept=".csv,.txt,.xlsx,.xls,.tsv"></div><div><label class="s">Format</label><select id="icKm"><option value="auto">Otomatis</option><option value="dec">Desimal</option><option value="dms">DMS</option><option value="utm">UTM</option></select></div><div><label class="s">Zona UTM (S)</label><select id="icKz"><option>48</option><option selected>49</option><option>50</option><option>51</option></select></div></div>' +
      '<div class="r"><div><label class="s">Nama ruas</label><input type="text" id="icKn" placeholder="mis. Ajibarang - Bts. Kota Purwokerto"></div><div><label class="s">Tujuan</label><select id="icKd"></select></div><div><label class="s">STA awal (bila tanpa STA)</label><input type="text" id="icKs" value="0+000"></div></div>' +
      '<div class="sum" id="icKsum"></div><div class="r"><button class="b o" id="icKp">Periksa &amp; Pratinjau</button><button class="b g" id="icKa" disabled>Terapkan ke Peta</button></div></div>' +

      '<div class="pn" id="icS"><div class="hint"><b>Scan cerdas:</b> setiap baris dicocokkan ke <b>ruas jalan</b> dan <b>STA</b>. Ada koordinat → dicari ruas terdekat + STA-nya (snap ke jalur). Hanya ruas + STA → posisi koordinat dihitung (interpolasi di jalur). Kolom dikenali otomatis (ruas, STA/KM, lat, lng, IRI, kondisi, lebar, ket). Tanda <b>*</b> = STA estimasi dari jarak ruas.</div>' +
      '<div class="r"><div><label class="s">File Excel/CSV</label><input type="file" id="icSf" accept=".csv,.txt,.xlsx,.xls,.tsv"></div><div><label class="s">Batasi ke ruas</label><select id="icSo"></select></div><div><label class="s">Toleransi jarak (m)</label><input type="number" id="icSt" value="50" min="5" max="500"></div></div>' +
      '<textarea id="icSt2" placeholder="…atau tempel data di sini: ruas, STA, lat, lng, IRI (satu baris per titik, pemisah koma/tab/titik koma)"></textarea>' +
      '<label class="hint"><input type="checkbox" id="icSj" checked> Ikut cocokkan ke Jalan Nasional bawaan (selain ruas yang sudah di peta)</label>' +
      '<div class="bar" id="icSb" style="display:none"><i></i></div><div class="sum" id="icSsum"></div><div class="tw" id="icStw" style="display:none"></div>' +
      '<div class="r"><button class="b" id="icSr">Mulai Scan</button><button class="b o" id="icSm" disabled>Lihat di Peta</button><button class="b o" id="icSx" disabled>Unduh Excel</button><button class="b g" id="icSa" disabled>Terapkan ke Peta</button></div></div><div class="pn" id="icI"><div class="hint"><b>Scan IRI per STA (cerdas):</b> baca Excel/CSV <b>tanpa koordinat</b> (cukup ruas + STA + IRI) maupun <b>dengan koordinat</b>. Header dikenali otomatis (di baris mana pun), satuan STA (m / km / 12+345) ditebak sendiri, nama ruas dicocokkan ke peta; bila tak ada ruas di peta, jalur dibuat dari koordinat file. Kolom <b>STA Awal/Akhir</b> juga didukung.</div><div class="r"><div><label class="s">Sumber data</label><select id="icIs"><option value="file">File Excel / CSV</option><option value="roads">Data ruas di peta</option><option value="scan">Hasil Scan terakhir</option></select></div><div><label class="s">File</label><input type="file" id="icIf" accept=".csv,.txt,.xlsx,.xls,.tsv"></div></div><div class="r"><div><label class="s">Ruas peta (paksa / filter)</label><select id="icIo"></select></div><div><label class="s">Interval STA</label><select id="icIb"><option value="auto" selected>Otomatis (dari jarak antar STA)</option><option value="100">100 m</option><option value="250">250 m</option><option value="500">500 m</option><option value="1000">1 km</option></select></div><div><label class="s">Nilai IRI berlaku pada</label><select id="icIa"><option value="center" selected>Tengah (± setengah interval)</option><option value="start">Awal (STA → STA+interval)</option><option value="end">Akhir (STA-interval → STA)</option></select></div><div><label class="s">Warna kelas</label><select id="icIk"><option value="std" selected>Standar PETAQU (dari nilai IRI)</option><option value="file">Ikuti kolom Kondisi di file</option></select></div></div><label class="hint"><input type="checkbox" id="icIg" checked> Tampilkan interval tanpa data (abu-abu putus-putus)</label> <label class="hint"><input type="checkbox" id="icIfl"> Balik arah STA (jika ruas di peta tak punya STA &amp; arahnya terbalik)</label><label class="hint"><input type="checkbox" id="icIl" checked> Tampilkan label di peta:</label> <select id="icIlf"><option value="sta" selected>STA (2+500)</option><option value="km">KM (2.5)</option></select><label class="hint"><input type="checkbox" id="icIau" checked> Otomatis masukkan IRI ke data ruas (ikut tampil di Dashboard &amp; Warna IRI)</label><div class="sum" id="icIdx"></div><div class="sum" id="icIsum"></div><div class="tw" id="icIst" style="display:none"></div><div class="tw" id="icItw" style="display:none"></div><div class="r"><button class="b" id="icIr">Scan &amp; Petakan IRI</button><button class="b g" id="icIa2" disabled>Terapkan ke Peta/Ruas</button><button class="b o" id="icIx" disabled>Unduh Excel</button></div></div></div>';
    document.body.appendChild(d);
    d.addEventListener("click", function (e) { if (e.target === d) close(); });
    $("icX").onclick = close;
    d.querySelectorAll(".tab").forEach(function (b) { b.onclick = function () { d.querySelectorAll(".tab").forEach(function (x) { x.classList.toggle("on", x === b); }); $("icK").classList.toggle("on", b.dataset.t === "k"); $("icS").classList.toggle("on", b.dataset.t === "s"); $("icI").classList.toggle("on", b.dataset.t === "i"); }; });
    $("icKp").onclick = checkCoords; $("icKa").onclick = applyCoords;
    $("icKf").onchange = function (e) { var f = e.target.files[0]; if (!f) return; readFileRows(f, function (rows) { $("icKt").value = rows.map(function (r) { return r.join("\t"); }).join("\n"); if (!$("icKn").value) $("icKn").value = (typeof guessRoadName === "function" ? guessRoadName(f.name) : f.name); checkCoords(); }); };
    $("icSf").onchange = function (e) { var f = e.target.files[0]; if (!f) return; readFileRows(f, function (rows) { S.scan.rows = rows; say(rows.length + " baris dibaca dari " + f.name); runScan(); }); };
    $("icSr").onclick = function () { var t = $("icSt2").value.trim(); if (t) S.scan.rows = splitRows(t); if (!S.scan.rows || !S.scan.rows.length) return say("Pilih file atau tempel data dulu", true); runScan(); };
    $("icIr").onclick = scanIri; $("icIx").onclick = exportIri; $("icIa2").onclick = applyIri; $("icIf").onchange = function (e) { var f = e.target.files[0]; if (f) loadIriFile(f); }; $("icSm").onclick = showScanMap; $("icSx").onclick = exportScan; $("icSa").onclick = applyScan;
  }
  function open(tab) {
    build();
    var ds = $("icKd"), so = $("icSo"), h = '<option value="">Ruas baru</option>', h2 = '<option value="">Semua ruas</option>';
    try { roads.forEach(function (r) { h += '<option value="' + esc(r.id) + '">+ ' + esc(r.name) + "</option>"; h2 += '<option value="' + esc(r.id) + '">' + esc(r.name) + "</option>"; }); } catch (e) { }
    ds.innerHTML = h; so.innerHTML = h2; $("icIo").innerHTML = h2;
    $("pqIc").classList.add("show");
    document.querySelector('#pqIc .tab[data-t="' + tab + '"]').click();
    try { closeImportModal(); } catch (e) { }
  }
  function close() { $("pqIc").classList.remove("show"); }

  function clearLayer() { clearLabels(); if (S.layer) { try { map.removeLayer(S.layer); } catch (e) { } S.layer = null; } }

  /* ---- Koordinat ---- */
  function checkCoords() {
    var rows = splitRows($("icKt").value);
    if (!rows.length) return say("Belum ada data koordinat", true);
    var n = normalizeRows(rows, $("icKm").value, +$("icKz").value), ll = n.rows.filter(function (r) { return r.lat != null; });
    S.coord.ll = ll; S.coord.n = n;
    var len = 0; for (var i = 1; i < ll.length; i++) len += distM([ll[i - 1].lat, ll[i - 1].lng], [ll[i].lat, ll[i].lng]);
    $("icKsum").innerHTML = '<span class="chip ok">✔ ' + ll.length + ' titik valid</span><span class="chip ' + (n.bad ? "none" : "") + '">✖ ' + n.bad + ' baris dilewati</span><span class="chip">≈ ' + (len / 1000).toFixed(2) + ' km</span>' + (n.rows.some(function (r) { return r.staM != null; }) ? '<span class="chip">STA dari data</span>' : '<span class="chip">STA otomatis dari jarak</span>');
    $("icKa").disabled = !ll.length;
    clearLayer();
    if (ll.length) { S.layer = L.layerGroup([L.polyline(ll.map(function (r) { return [r.lat, r.lng]; }), { color: "#22d3ee", weight: 4, dashArray: "6 6" })].concat(ll.slice(0, 400).map(function (r) { return L.circleMarker([r.lat, r.lng], { radius: 4, color: "#fff", weight: 1, fillColor: "#22d3ee", fillOpacity: 1 }); }))).addTo(map); try { map.fitBounds(L.latLngBounds(ll.map(function (r) { return [r.lat, r.lng]; })), { padding: [60, 60] }); } catch (e) { } }
  }
  function applyCoords() {
    var ll = S.coord.ll; if (!ll.length) return;
    var name = $("icKn").value.trim() || "Ruas koordinat " + new Date().toLocaleDateString("id-ID"), start = staNorm($("icKs").value) || 0, cum = 0, pts = [];
    ll.forEach(function (r, i) { if (i) cum += distM([ll[i - 1].lat, ll[i - 1].lng], [r.lat, r.lng]); pts.push(mkPoint(r.staM != null ? fmtSta(r.staM) : fmtSta(start + cum), r.lat, r.lng, r)); });
    var added = pushToRoad(name, pts, $("icKd").value);
    clearLayer(); close(); say(added + " titik koordinat ditambahkan ke \"" + name + "\"");
  }

  /* ---- Scan ---- */
  function runScan() {
    var n = normalizeRows(S.scan.rows, "auto", 49);
    if (!n.rows.length) return say("Tidak ada baris yang bisa dikenali (butuh koordinat atau ruas+STA)", true);
    var bar = $("icSb"); bar.style.display = "block";
    var opt = { th: Math.max(5, +$("icSt").value || 50), useJN: $("icSj").checked, only: $("icSo").value };
    scan(n.rows, opt, function (i, t) { bar.firstChild.style.width = Math.round(i / t * 100) + "%"; }, function (res) {
      S.scan.res = res; bar.style.display = "none"; clearLayer();
      var c = { ok: 0, far: 0, none: 0 }, per = {}; res.forEach(function (r) { c[r.status]++; if (r.status !== "none") per[r.ruas] = (per[r.ruas] || 0) + 1; });
      var top = Object.keys(per).sort(function (a, b) { return per[b] - per[a]; });
      $("icSsum").innerHTML = '<span class="chip ok">✔ ' + c.ok + ' cocok</span><span class="chip far">⚠ ' + c.far + ' perlu dicek</span><span class="chip none">✖ ' + c.none + ' tidak cocok</span><span class="chip">' + top.length + ' ruas terdeteksi</span>';
      var tw = $("icStw"); tw.style.display = "block";
      tw.innerHTML = "<table><tr><th>#</th><th>Ruas terdeteksi</th><th>STA</th><th>Jarak</th><th>Status</th><th>Catatan</th></tr>" + res.slice(0, 300).map(function (r, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(r.ruas || "-") + "</td><td>" + esc(r.sta || "-") + "</td><td>" + (r.dist != null && r.src.lat != null ? Math.round(r.dist) + " m" : "-") + '</td><td class="' + r.status + '">' + { ok: "✔ Cocok", far: "⚠ Cek", none: "✖ Tidak" }[r.status] + "</td><td>" + esc(r.note || "") + "</td></tr>"; }).join("") + "</table>" + (res.length > 300 ? '<div class="hint" style="padding:6px">+' + (res.length - 300) + " baris lain (ikut diproses)</div>" : "");
      ["icSm", "icSx", "icSa"].forEach(function (id) { $(id).disabled = !(c.ok + c.far); });
    });
  }
  function showScanMap() {
    clearLayer(); var col = { ok: "#34d399", far: "#f59e0b", none: "#f43f5e" }, g = [], bnd = [];
    S.scan.res.forEach(function (r) { if (r.lat == null) return; bnd.push([r.lat, r.lng]); if (g.length < 1500) g.push(L.circleMarker([r.lat, r.lng], { radius: 5, color: "#fff", weight: 1, fillColor: col[r.status], fillOpacity: .95 }).bindPopup("<b>" + esc(r.ruas || "-") + "</b><br>STA " + esc(r.sta || "-") + (r.dist != null && r.src.lat != null ? "<br>Jarak ke jalan " + Math.round(r.dist) + " m" : ""))); });
    if (!g.length) return; S.layer = L.layerGroup(g).addTo(map); try { map.fitBounds(L.latLngBounds(bnd), { padding: [60, 60] }); } catch (e) { }
    $("pqIc").classList.remove("show"); say("Hasil scan tampil di peta · buka lagi Impor ▸ Scan untuk menerapkan");
  }
  function exportScan() {
    var a = [["No", "Ruas", "STA", "Latitude", "Longitude", "Jarak ke jalan (m)", "Status", "Catatan", "IRI", "Kondisi", "Lebar", "Keterangan"]];
    S.scan.res.forEach(function (r, i) { a.push([i + 1, r.ruas, r.sta, r.lat, r.lng, r.dist != null && r.src.lat != null ? Math.round(r.dist) : "", { ok: "Cocok", far: "Cek", none: "Tidak cocok" }[r.status], r.note || "", r.src.iri || "", r.src.kondisi || "", r.src.lebar || "", r.src.ket || ""]); });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), "Hasil Scan"); XLSX.writeFile(wb, "hasil-scan-ruas-sta.xlsx");
  }
  function applyScan() {
    var g = {};
    S.scan.res.forEach(function (r) { if (r.status === "none" || !r.cand || r.lat == null) return; var k = r.cand.name; (g[k] = g[k] || { id: r.cand.id, pts: [] }).pts.push(mkPoint(r.sta.replace("*", ""), r.src.lat != null ? r.src.lat : r.lat, r.src.lat != null ? r.src.lng : r.lng, r.src)); });
    var names = Object.keys(g), tot = 0; if (!names.length) return say("Tidak ada baris cocok untuk diterapkan", true);
    names.forEach(function (n) { tot += pushToRoad(n, g[n].pts, g[n].id); });
    clearLayer(); close(); say(tot + " titik masuk ke " + names.length + " ruas (lengkap dengan STA)");
  }


  /* ---- Scan IRI per STA (cerdas: Excel tanpa / dengan koordinat) ---- */
  function subLine(c, lo, hi) {
    var S = c.s, P = c.pts, out = [];
    for (var i = 0; i < P.length - 1; i++) {
      var a = S[i], b = S[i + 1], mn = Math.min(a, b), mx = Math.max(a, b);
      if (mx < lo || mn > hi || a === b) continue;
      var t1 = Math.max(0, Math.min(1, (lo - a) / (b - a))), t2 = Math.max(0, Math.min(1, (hi - a) / (b - a)));
      if (a > b) { var tt = (hi - a) / (b - a), tu = (lo - a) / (b - a); t1 = Math.max(0, Math.min(1, tt)); t2 = Math.max(0, Math.min(1, tu)); }
      var A = [P[i][0] + t1 * (P[i + 1][0] - P[i][0]), P[i][1] + t1 * (P[i + 1][1] - P[i][1])], B = [P[i][0] + t2 * (P[i + 1][0] - P[i][0]), P[i][1] + t2 * (P[i + 1][1] - P[i][1])];
      if (!out.length) out.push(A); out.push(B);
    }
    return out;
  }
  var KC = function (i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  function num(v) {
    if (v == null || v === "") return null; if (typeof v === "number") return isFinite(v) ? v : null;
    var t = String(v).trim().replace(/\s/g, ""); if (!t) return null;
    if (/^[-+]?\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, "").replace(",", "."); else t = t.replace(",", ".");
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? parseFloat(t) : null;
  }
  function hdrKey(h) {
    h = String(h == null ? "" : h).trim().toLowerCase(); if (!h || /^[-+\d.,\s]+$/.test(h)) return null;
    if (/(sta|km|patok|chainage|stasiun)\s*\.?\s*(awal|dari|from|start|mulai)|^(dari|from|start)\b/.test(h)) return "sFrom";
    if (/(sta|km|patok|chainage|stasiun)\s*\.?\s*(akhir|sampai|s\.?d|to|end)|^(sampai|s\/d|to|end)\b/.test(h)) return "sTo";
    if (/iri|roughness|kekasaran/.test(h)) return "iri";
    if (/^(lat|latitude|lintang)\b|\blat\b/.test(h) || h === "y") return "lat";
    if (/^(lon|lng|long|longitude|bujur)\b|\b(lng|lon)\b/.test(h) || h === "x") return "lng";
    if (/koordinat|coord/.test(h)) return "coord";
    if (/easting/.test(h) || h === "e") return "e";
    if (/northing/.test(h) || h === "n") return "n";
    if (/^(sta|station|stasiun|patok|chainage)\b/.test(h)) return "sta";
    if (/^(km|kilometer)\b/.test(h)) return "km";
    if (/kondisi|condition|kategori|klasifikasi/.test(h)) return "kondisi";
    if (/ruas|jalan|jln|segmen|link|road|nama/.test(h)) return "ruas";
    return null;
  }
  function staCell(v) {
    if (v == null || v === "") return null; var t = String(v).trim(), m = /^(\d{1,4})\s*\+\s*(\d{1,3})(?:[.,]\d+)?$/.exec(t);
    if (m) return { v: +m[1] * 1000 + +m[2], abs: true };
    var n = num(v); return n == null ? null : { v: n, abs: false };
  }
  function staUnit(v) { // 1 = meter, 1000 = kilometer
    v = v.filter(function (x) { return x != null; }); if (!v.length) return 1;
    var mx = Math.max.apply(0, v); if (mx >= 1000) return 1;
    if (v.some(function (x) { return Math.abs(x - Math.round(x)) > 1e-9; })) return 1000;
    var u = Array.from(new Set(v)).sort(function (a, b) { return a - b; }), g = []; for (var i = 1; i < u.length; i++) g.push(u[i] - u[i - 1]); g.sort(function (a, b) { return a - b; });
    var med = g.length ? g[Math.floor(g.length / 2)] : 0;
    return med >= 10 ? 1 : (mx <= 200 ? 1000 : 1);
  }
  function medianOf(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }
  function guessCols(rows) { // tanpa header: tebak dari isi kolom
    var nc = 0; rows.forEach(function (r) { nc = Math.max(nc, r.length); });
    var st = []; for (var c = 0; c < nc; c++) { (function (c) { var n = 0, t = 0, mn = 1e18, mx = -1e18, fr = 0; rows.slice(0, 200).forEach(function (r) { var v = r[c]; if (v == null || v === "") return; var x = num(v); if (x == null) t++; else { n++; mn = Math.min(mn, x); mx = Math.max(mx, x); if (Math.abs(x - Math.round(x)) > 1e-9) fr++; } }); st.push({ c: c, n: n, t: t, mn: mn, mx: mx, fr: n ? fr / n : 0 }); })(c); }
    var m = {}, used = {};
    st.forEach(function (x) { if (x.n >= 2 && x.fr > .5) { if (m.lat === undefined && x.mn >= -11.5 && x.mx <= 6.5) { m.lat = x.c; used[x.c] = 1; } else if (m.lng === undefined && x.mn >= 94 && x.mx <= 141.5) { m.lng = x.c; used[x.c] = 1; } } });
    st.forEach(function (x) { if (!used[x.c] && m.ruas === undefined && x.t > x.n && x.t > 1) { m.ruas = x.c; used[x.c] = 1; } });
    var nums = st.filter(function (x) { return !used[x.c] && x.n >= 2; });
    var iri = nums.filter(function (x) { return x.mn >= 0 && x.mx <= 40 && x.fr >= .3; })[0] || (nums.length > 1 ? nums[nums.length - 1] : null);
    if (iri) { m.iri = iri.c; used[iri.c] = 1; }
    var sta = nums.filter(function (x) { return !used[x.c]; })[0]; if (sta) m.sta = sta.c;
    return m;
  }
  /* sheets: [{name, rows:[[...]]}] -> {rows:[{ruas,sta,from,to,iri,kond,lat,lng,line}], diag:[...], skipped} */
  function iriParse(sheets) {
    var out = [], diag = [], skipped = 0;
    sheets.forEach(function (sh) {
      var rows = sh.rows.filter(function (r) { return r.some(function (c) { return String(c == null ? "" : c).trim() !== ""; }); });
      if (!rows.length) return;
      var hi = -1, hb = 0, hm = null, i;
      for (i = 0; i < Math.min(20, rows.length); i++) {
        var m = {}, cnt = 0; rows[i].forEach(function (c, j) { if (typeof c === "number") return; var k = hdrKey(c); if (k && m[k] === undefined) { m[k] = j; cnt++; } });
        var sc = cnt + (m.iri !== undefined ? 2 : 0) + (m.sta !== undefined || m.sFrom !== undefined ? 1 : 0);
        if (cnt >= 2 && sc > hb) { hb = sc; hi = i; hm = m; }
      }
      var headerless = hi < 0; if (headerless) hm = guessCols(rows);
      if (hm.sta === undefined && hm.km !== undefined && hm.sFrom === undefined) { hm.sta = hm.km; delete hm.km; }
      if (hm.iri === undefined) { diag.push({ sheet: sh.name, err: "kolom IRI tidak ditemukan" }); return; }
      var raw = [], last = "", allv = [];
      for (i = hi + 1; i < rows.length; i++) {
        var r = rows[i], g = function (k) { return hm[k] !== undefined ? r[hm[k]] : ""; }, o = { line: i + 1, sheet: sh.name };
        var rn = String(g("ruas") == null ? "" : g("ruas")).trim();
        if (hm.ruas !== undefined) { if (rn) last = rn; else rn = last; } else rn = sheets.length > 1 ? sh.name : "";
        if (/^(rata|total|jumlah|average|avg|min|max)/i.test(rn) && g("sta") === "") { skipped++; continue; }
        o.ruas = rn; o.iri = num(g("iri")); o.kond = String(g("kondisi") == null ? "" : g("kondisi")).trim();
        o.sc = staCell(g("sta")); o.kc = staCell(g("km")); o.fc = staCell(g("sFrom")); o.tc = staCell(g("sTo"));
        [o.sc, o.fc, o.tc].forEach(function (c) { if (c && !c.abs) allv.push(c.v); });
        var ll = null, la = num(g("lat")), lo = num(g("lng"));
        if (la != null && lo != null) ll = parseCoordText(la + " " + lo, "dec", 49);
        if (!ll && hm.e !== undefined && hm.n !== undefined) ll = parseCoordText(g("e") + " " + g("n"), "utm", 49);
        if (!ll && hm.coord !== undefined) ll = parseCoordText(String(g("coord")), "auto", 49);
        if (ll) { o.lat = ll.lat; o.lng = ll.lng; }
        raw.push(o);
      }
      var uni = staUnit(allv), kept = 0, nc = 0, toM = function (c) { return c == null ? null : (c.abs ? c.v : c.v * uni); };
      raw.forEach(function (o) {
        var s = toM(o.sc), f = toM(o.fc), t = toM(o.tc), k = null;
        if (o.kc) k = o.kc.abs ? o.kc.v : (o.kc.v < 1000 ? o.kc.v * 1000 : o.kc.v);
        if (k != null && s != null && !o.sc.abs && s < 1000 && Math.abs(k % 1000) < 1e-6) s = k + s; else if (k != null && s == null && f == null) s = k;
        o.from = f; o.to = t; o.sta = (f != null && t != null) ? (f + t) / 2 : (s != null ? s : (f != null ? f : t));
        if (o.iri == null || (o.sta == null && o.lat == null)) { skipped++; return; }
        delete o.sc; delete o.kc; delete o.fc; delete o.tc; out.push(o); kept++; if (o.lat != null) nc++;
      });
      var cols = Object.keys(hm).map(function (k) { return ({ ruas: "Ruas", iri: "IRI", sta: "STA", km: "KM", sFrom: "STA awal", sTo: "STA akhir", lat: "Lat", lng: "Lng", coord: "Koordinat", e: "E", n: "N", kondisi: "Kondisi" })[k] + "=" + KC(hm[k]); });
      diag.push({ sheet: sh.name, header: headerless ? "tanpa header (ditebak dari isi)" : "baris " + (hi + 1), cols: cols, unit: uni === 1 ? "meter" : "kilometer", n: kept, coords: nc });
    });
    return { rows: out, diag: diag, skipped: skipped };
  }
  /* rows -> groups [{name,cand,mode,samples:[{sta,iri,kond,lat,lng,from,to}],note}] */
  function iriResolve(rows, opt) {
    opt = opt || {}; var cands = buildCands(false), groups = {}, order = [], th = 80;
    rows.forEach(function (r) { var k = r.ruas || "(tanpa nama)"; if (!groups[k]) { groups[k] = { name: k, rows: [] }; order.push(k); } groups[k].rows.push(r); });
    var forced = opt.only ? cands.filter(function (c) { return c.id === opt.only; })[0] : null;
    return order.map(function (k) {
      var g = groups[k], rs = g.rows, cr = rs.filter(function (r) { return r.lat != null; }), hasC = cr.length >= Math.max(2, rs.length * .6), cand = null, best = 0, tk = tokens(k), S = [], note = [];
      cands.forEach(function (c) { var sc = nameScore(tk, c.tok); if (c.code && k.indexOf(c.code) > -1) sc = Math.max(sc, .9); if (sc > best) { best = sc; cand = c; } });
      if (best < .4) cand = null;
      var smp = cr.length > 25 ? cr.filter(function (r, i) { return i % Math.ceil(cr.length / 25) === 0; }) : cr;
      var near = function (c) { return smp.map(function (r) { return snap(c, r.lat, r.lng).d; }); };
      if (!cand && hasC) {
        var bv = 0; cands.forEach(function (c) { var hit = 0; smp.forEach(function (r) { var bb = c.bb, p = .002; if (r.lat < bb[0] - p || r.lat > bb[2] + p || r.lng < bb[1] - p || r.lng > bb[3] + p) return; if (snap(c, r.lat, r.lng).d <= th) hit++; }); if (hit > bv) { bv = hit; if (hit >= smp.length * .6) cand = c; } });
        if (cand) note.push("ruas dikenali dari koordinat");
      }
      if (cand && hasC && medianOf(near(cand)) > 150) { note.push("koordinat file tak berimpit dengan ruas di peta → jalur dari koordinat file"); cand = null; }
      if (!cand && forced && (!hasC || medianOf(near(forced)) <= 150)) { cand = forced; note.push("dipaksa ke ruas pilihan"); }
      g.cand = cand; g.mode = "none";
      if (cand && hasC) {
        g.mode = "road+coord"; var df = [];
        rs.forEach(function (r) { if (r.lat != null) { r._sn = snap(cand, r.lat, r.lng); if (r.sta != null) df.push(Math.abs(r._sn.staM - r.sta)); } });
        var trust = !df.length || medianOf(df) <= 300; if (!trust) note.push("STA file ≠ STA ruas → STA diambil dari posisi koordinat");
        rs.forEach(function (r) { var st = r.lat != null ? (trust && r.sta != null ? r.sta : r._sn.staM) : r.sta; if (st == null) return; S.push({ sta: st, iri: r.iri, kond: r.kond, lat: r.lat, lng: r.lng, from: trust ? r.from : null, to: trust ? r.to : null }); });
      } else if (cand) {
        g.mode = "road"; var fl = opt.flip && !cand.staReal, fx = function (x) { return x == null ? null : (fl ? cand.len - x : x); };
        rs.forEach(function (r) { if (r.sta != null) S.push({ sta: fx(r.sta), iri: r.iri, kond: r.kond, from: fx(r.from), to: fx(r.to) }); });
        var mn = Math.min.apply(0, cand.s), mx = Math.max.apply(0, cand.s), ds = S.map(function (x) { return x.sta; });
        if (ds.length && (Math.max.apply(0, ds) < mn - 50 || Math.min.apply(0, ds) > mx + 50)) note.push("rentang STA file di luar rentang ruas (" + fmtSta(mn) + "–" + fmtSta(mx) + ")");
        else if (!cand.staReal) note.push("ruas di peta tak punya STA → STA dihitung dari jarak ujung awal (centang 'Balik arah' bila terbalik)");
      } else if (hasC) {
        var useSta = cr.filter(function (r) { return r.sta != null; }).length >= cr.length * .8, arr = cr.slice();
        if (useSta) arr = arr.filter(function (r) { return r.sta != null; }).sort(function (a, b) { return a.sta - b.sta; });
        arr = arr.filter(function (r, i) { return !i || r.lat !== arr[i - 1].lat || r.lng !== arr[i - 1].lng; });
        if (arr.length >= 2) {
          g.mode = "coords"; cand = mkCand(k, "", arr.map(function (r) { return [r.lat, r.lng]; }), useSta ? arr.map(function (r) { return r.sta; }) : null, "xls", null); g.cand = cand;
          arr.forEach(function (r, i) { S.push({ sta: useSta ? r.sta : cand.s[i], iri: r.iri, kond: r.kond, lat: r.lat, lng: r.lng, from: r.from, to: r.to }); });
          note.push("tak ada ruas cocok di peta → jalur dibuat dari koordinat file" + (useSta ? "" : " (STA dari jarak)"));
        }
      }
      if (g.mode === "none") { rs.forEach(function (r) { if (r.sta != null) S.push({ sta: r.sta, iri: r.iri, kond: r.kond, from: r.from, to: r.to }); }); note.push("tak ada ruas cocok & tanpa koordinat → hanya bagan/tabel (pilih 'Ruas peta' untuk memaksa ke ruas)"); }
      g.samples = S; g.note = note.join("; "); return g;
    });
  }
  function openSvAt(g, ll) {
    var road = (g.cand && g.cand.id ? roads.filter(function (r) { return r.id === g.cand.id; })[0] : null) || roads.filter(function (r) { return r.name === g.name; })[0];
    if (!road || !road.points || !road.points.length) return false;
    var bi = 0, bd = 1e18; road.points.forEach(function (q, i) { if (!isFinite(q.lat) || !isFinite(q.lng)) return; var d = distM([q.lat, q.lng], [ll.lat, ll.lng]); if (d < bd) { bd = d; bi = i; } });
    try { openStreetView(road.id, bi); return true; } catch (e) { return false; }
  }
  function clearLabels() { if (S.lab) { try { map.off("zoomend moveend", S.lab.fn); if (S.lab.g) map.removeLayer(S.lab.g); } catch (e) { } S.lab = null; } }
  function drawLabels() {
    var lb = S.lab; if (!lb) return; if (lb.g) map.removeLayer(lb.g);
    var g = L.layerGroup(), shown = [], bd = map.getBounds().pad(.1);
    lb.c.forEach(function (c) {
      if (!bd.contains(c.ll)) return; var p = map.latLngToLayerPoint(c.ll);
      for (var i = 0; i < shown.length; i++) if (Math.abs(shown[i].x - p.x) < 84 && Math.abs(shown[i].y - p.y) < 22) return;
      shown.push(p);
      var mk = L.marker(c.ll, { interactive: true, keyboard: false, icon: L.divIcon({ className: "", iconSize: null, html: '<div style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;cursor:pointer;font:700 11px/1.2 system-ui,sans-serif;color:#fff;background:#0b1220e6;border:1.5px solid ' + c.col + ';border-radius:9px;padding:1px 6px;box-shadow:0 1px 4px #000a">' + c.t + "</div>" }) }); mk.on("click", function () { if (typeof rulerState !== "undefined" && (rulerState || drawState || sketchMode)) return; if (!openSvAt(c.g, c.ll)) say("Street View butuh ruas di peta — aktifkan opsi Otomatis masukkan IRI", true); }); g.addLayer(mk);
    });
    lb.g = g.addTo(map);
  }
  function setLabels(c) {
    clearLabels(); if (!c.length || !$("icIl").checked) return;
    c.sort(function (a, b) { return b.pri - a.pri; }); S.lab = { c: c, g: null, fn: drawLabels }; map.on("zoomend moveend", drawLabels); drawLabels();
  }
  function modeOf(a) { var c = {}, b = null; a.forEach(function (x) { c[x] = (c[x] || 0) + 1; if (!b || c[x] > c[b]) b = x; }); return b; }
  function iriIntervals(g, opt) {
    var smp = g.samples, ints = [], ex = smp.filter(function (x) { return x.from != null && x.to != null; });
    if (ex.length && ex.length >= smp.length * .5) {
      var M = {}; ex.forEach(function (x) { var l0 = Math.min(x.from, x.to), l1 = Math.max(x.from, x.to), key = Math.round(l0) + "|" + Math.round(l1); M[key] = M[key] || { l0: l0, l1: l1, a: [], k: [] }; M[key].a.push(x.iri); if (x.kond) M[key].k.push(x.kond); });
      return Object.keys(M).map(function (k) { return M[k]; }).sort(function (a, b) { return a.l0 - b.l0; });
    }
    var auto = !opt.bin || opt.bin === "auto", bin = +opt.bin, al = opt.align || "center";
    if (auto) {
      var gg = {}; smp.forEach(function (x) { var k = Math.round(x.sta); gg[k] = gg[k] || { a: [], k: [] }; gg[k].a.push(x.iri); if (x.kond) gg[k].k.push(x.kond); });
      var st = Object.keys(gg).map(Number).sort(function (a, b) { return a - b; }), gp = [];
      for (var i = 1; i < st.length; i++) gp.push(st[i] - st[i - 1]);
      var med = Math.max(10, medianOf(gp) || 100); g.step = med;
      var nr = function (d) { return d != null && d <= med * 3; };
      st.forEach(function (k, i) {
        var pv = i ? st[i - 1] : null, nx = i < st.length - 1 ? st[i + 1] : null, l0, l1;
        if (al === "start") { l0 = k; l1 = nx != null && nr(nx - k) ? nx : k + med; }
        else if (al === "end") { l1 = k; l0 = pv != null && nr(k - pv) ? pv : k - med; }
        else { l0 = pv != null && nr(k - pv) ? (k + pv) / 2 : k - med / 2; l1 = nx != null && nr(nx - k) ? (k + nx) / 2 : k + med / 2; }
        ints.push({ l0: l0, l1: l1, a: gg[k].a, k: gg[k].k, c: k });
        if (nx != null && !nr(nx - k)) { var gs = al === "start" ? k + med : al === "end" ? k : k + med / 2, ge = al === "start" ? nx : al === "end" ? nx - med : nx - med / 2; if (ge > gs) ints.push({ l0: gs, l1: ge, a: null, k: [] }); }
      });
    } else {
      var bins = {}; smp.forEach(function (x) { var k = al === "end" ? Math.ceil(x.sta / bin) - 1 : Math.floor(x.sta / bin); bins[k] = bins[k] || { a: [], k: [] }; bins[k].a.push(x.iri); if (x.kond) bins[k].k.push(x.kond); });
      var ks = Object.keys(bins).map(Number), k0 = Math.min.apply(0, ks), k1 = Math.max.apply(0, ks);
      for (var q = k0; q <= k1; q++) ints.push({ l0: q * bin, l1: q * bin + bin, a: bins[q] ? bins[q].a : null, k: bins[q] ? bins[q].k : [] });
    }
    return ints;
  }
  function kondColor(t) { t = String(t || "").toLowerCase(); return /berat|buruk|parah/.test(t) ? "#f43f5e" : /ringan/.test(t) ? "#f59e0b" : /sedang|fair/.test(t) ? "#facc15" : /baik|good|mantap/.test(t) ? "#34d399" : "#7c8aa0"; }
  var MODE_TXT = { "road+coord": "ruas di peta + koordinat", road: "ruas di peta (via STA)", coords: "jalur dari koordinat file", none: "tanpa jalur — bagan/tabel saja" };
  var IRI_OUT = [], IRI_G = [];

  function iriGroups() {
    var src = $("icIs").value, only = $("icIo").value, out = [];
    if (src === "file") {
      if (!S.iri || !S.iri.rows) { say("Pilih file Excel/CSV dulu", true); return null; }
      return iriResolve(S.iri.rows, { only: only, flip: $("icIfl").checked });
    }
    if (src === "scan") {
      if (!S.scan.res) { say("Jalankan Scan Ruas & STA dulu", true); return null; }
      var m = {}; S.scan.res.forEach(function (r) { var v = num(r.src.iri); if (r.status === "none" || !r.cand || v == null || r.staM == null) return; if (only && r.cand.id !== only) return; var k = r.cand.name; (m[k] = m[k] || { name: k, cand: r.cand, mode: "road", samples: [], note: "" }).samples.push({ sta: r.staM, iri: v, kond: r.src.kondisi || "" }); });
      return Object.keys(m).map(function (k) { return m[k]; });
    }
    buildCands(false).forEach(function (c) { if (only && c.id !== only) return; var sm = []; c.iri.forEach(function (v, i) { if (v != null) sm.push({ sta: c.s[i], iri: v, kond: "" }); }); if (sm.length) out.push({ name: c.name, cand: c, mode: "road", samples: sm, note: "" }); });
    return out;
  }
  function stripHtml(x) {
    var h = '<div style="margin:8px 0 2px;font-weight:600">' + esc(x.name) + ' <span style="font-weight:400;opacity:.7">· ' + esc(MODE_TXT[x.mode] || "") + "</span></div>" + (x.note ? '<div class="hint" style="padding:0 0 4px">⚠ ' + esc(x.note) + "</div>" : "") + '<div style="display:flex;height:22px;border-radius:5px;overflow:hidden;border:1px solid #2a384c">';
    x.cells.forEach(function (c) { h += '<div title="' + esc(c.t) + '" style="flex:' + Math.max(1, Math.round(c.l1 - c.l0)) + ' 1 0;min-width:3px;background:' + c.c + (c.gap ? ";opacity:.4" : "") + '"></div>'; });
    return h + '</div><div style="display:flex;justify-content:space-between;font-size:10px;opacity:.7"><span>' + fmtSta(x.min) + "</span><span>" + fmtSta(x.max) + "</span></div>";
  }
  function showIriDiag(P, name) {
    var h = '<span class="chip ok">✔ ' + esc(name) + " · " + P.rows.length + " baris IRI</span>";
    P.diag.forEach(function (d) { h += d.err ? '<span class="chip none">' + esc(d.sheet) + ": " + esc(d.err) + "</span>" : '<span class="chip">' + esc(d.sheet) + " · header " + esc(d.header) + " · " + esc(d.cols.join(" ")) + " · STA " + d.unit + (d.coords ? " · " + d.coords + " koordinat" : " · tanpa koordinat") + "</span>"; });
    if (P.skipped) h += '<span class="chip far">' + P.skipped + " baris dilewati</span>";
    $("icIdx").innerHTML = h;
  }
  function loadIriFile(f) {
    var rd = new FileReader(), isX = /\.(xlsx|xls|xlsm)$/i.test(f.name);
    rd.onload = function (e) {
      try {
        var sheets = [];
        if (isX) { var wb = XLSX.read(e.target.result, { type: "array" }); wb.SheetNames.forEach(function (n) { sheets.push({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: true }) }); }); }
        else sheets = [{ name: f.name.replace(/\.[^.]+$/, ""), rows: splitRows(e.target.result) }];
        var P = iriParse(sheets);
        if (!P.rows.length) { S.iri = null; showIriDiag({ rows: [], diag: P.diag, skipped: P.skipped }, f.name); return say("Tidak ada baris IRI yang terbaca (butuh kolom IRI + STA atau koordinat)", true); }
        S.iri = P; $("icIs").value = "file"; showIriDiag(P, f.name); say(P.rows.length + " baris IRI dibaca dari " + f.name); scanIri();
      } catch (er) { say("Gagal membaca file: " + er.message, true); }
    };
    if (isX) rd.readAsArrayBuffer(f); else rd.readAsText(f);
  }
  function scanIri() {
    var G = iriGroups(); if (!G) return;
    var opt = { bin: $("icIb").value, align: $("icIa").value }, fileCls = $("icIk").value === "file", gaps = $("icIg").checked;
    var lines = [], bnd = [], tot = 0, mapped = 0, cls = {}, clsC = {}, strips = [], labs = [], lf = $("icIlf").value, lt = function (l) { l = Math.max(0, l); return lf === "km" ? "KM " + (l / 1000).toFixed(2).replace(/\.?0+$/, "") : fmtSta(l); };
    clearLayer(); IRI_OUT = []; IRI_G = [];
    G.forEach(function (g) {
      if (!g.samples.length) return;
      var ints = iriIntervals(g, opt), cells = []; g.ints = ints; IRI_G.push(g);
      ints.forEach(function (it) {
        var a = it.a, l0 = it.l0, l1 = it.l1, pts = g.cand ? subLine(g.cand, Math.min(l0, l1), Math.max(l0, l1)) : [], rg = fmtSta(Math.max(0, l0)) + " – " + fmtSta(Math.max(0, l1));
        if (!a || !a.length) { cells.push({ l0: l0, l1: l1, c: "#7c8aa0", gap: 1, t: "STA " + rg + " · tanpa data" }); if (gaps && pts.length >= 2) lines.push(L.polyline(pts, { color: "#7c8aa0", weight: 3, opacity: .7, dashArray: "4 6" })); return; }
        var avg = a.reduce(function (x, y) { return x + y; }, 0) / a.length, mx = Math.max.apply(0, a), inf = getIriInfo(avg), km = it.k && it.k.length ? modeOf(it.k) : "", label = inf.label, color = inf.color;
        if (fileCls && km) { label = km; color = kondColor(km); }
        it.avg = avg; cls[label] = (cls[label] || 0) + 1; clsC[label] = color; tot++;
        var mid = pts.length >= 2 ? pts[Math.floor(pts.length / 2)] : null;
        IRI_OUT.push([g.name, rg, +avg.toFixed(2), +mx.toFixed(2), a.length, label, km, color, mid ? +mid[0].toFixed(6) : "", mid ? +mid[1].toFixed(6) : ""]);
        cells.push({ l0: l0, l1: l1, c: color, t: "STA " + rg + " · IRI " + avg.toFixed(2) + " · " + label });
        if (pts.length >= 2) {
          mapped++; pts.forEach(function (q) { bnd.push(q); });
          var cs = it.c != null ? it.c : (l0 + l1) / 2, pa = atSta(g.cand, Math.max(0, cs)); if (pa.inRange) labs.push({ ll: L.latLng(pa.lat, pa.lng), t: lt(cs) + " • " + avg.toFixed(1), col: color, pri: avg, g: g });
          var pl = L.polyline(pts, { color: color, weight: 7, opacity: .95, lineCap: "butt" }).bindTooltip("<b>" + esc(g.name) + "</b><br>STA " + rg + " · IRI <b>" + avg.toFixed(2) + "</b> (maks " + mx.toFixed(2) + ")<br>" + esc(label) + (km && km !== label ? " (file: " + esc(km) + ")" : "") + " · " + a.length + " titik<br><i>klik = Street View</i>", { sticky: true, className: "sta-label" });
          pl.on("click", function (ev) { if (rulerState || drawState || sketchMode) return; if (!openSvAt(g, ev.latlng)) say("Street View butuh ruas di peta — aktifkan opsi Otomatis masukkan IRI", true); });
          lines.push(pl);
        }
      });
      if (cells.length) strips.push({ name: g.name, mode: g.mode, note: g.note, cells: cells, min: Math.max(0, cells[0].l0), max: Math.max(0, cells[cells.length - 1].l1) });
    });
    if (!tot) return say("Tidak ada nilai IRI yang bisa diproses", true);
    if (lines.length) { S.layer = L.layerGroup(lines).addTo(map); try { map.fitBounds(L.latLngBounds(bnd), { padding: [60, 60] }); } catch (e) { } }
    setLabels(labs);
    $("icIsum").innerHTML = '<span class="chip">' + strips.length + ' ruas</span><span class="chip">' + tot + ' interval ber-IRI</span><span class="chip ' + (mapped ? "ok" : "far") + '">' + mapped + " dipetakan</span>" + Object.keys(cls).map(function (k) { return '<span class="chip" style="border-color:' + clsC[k] + '">' + esc(k) + ": " + cls[k] + "</span>"; }).join("");
    var sb = $("icIst"); sb.style.display = "block"; sb.innerHTML = strips.map(stripHtml).join("");
    var tw = $("icItw"); tw.style.display = "block";
    tw.innerHTML = "<table><tr><th>Ruas</th><th>STA</th><th>IRI rata²</th><th>Maks</th><th>n</th><th>Kelas</th><th>Kondisi file</th></tr>" + IRI_OUT.slice(0, 400).map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td><td>" + r[4] + '</td><td style="color:' + r[7] + '">' + esc(r[5]) + "</td><td>" + esc(r[6]) + "</td></tr>"; }).join("") + "</table>";
    $("icIx").disabled = false; $("icIa2").disabled = !IRI_G.some(function (g) { return g.cand; });
    if ($("icIs").value !== "roads" && $("icIau").checked && IRI_G.some(function (g) { return g.cand; })) { var lyr = S.layer, lb = S.lab; try { applyIri(true); } catch (e) { console.error(e); } S.layer = lyr; S.lab = lb; }
    if (mapped) { $("pqIc").classList.remove("show"); say("IRI per STA dipetakan (" + mapped + " interval) · klik garis untuk detail · buka lagi Impor ▸ Scan IRI untuk tabel & terapkan"); }
    else say("Tidak ada jalur untuk dipetakan — hasil tampil sebagai bagan & tabel (pilih 'Ruas peta' atau sertakan koordinat)", true);
  }
  function exportIri() {
    var a = [["Ruas", "Interval STA", "IRI rata-rata", "IRI maks", "Jumlah titik", "Kelas", "Kondisi (file)", "Lat tengah", "Lng tengah"]].concat(IRI_OUT.map(function (r) { return [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[8], r[9]]; }));
    var b = [["Ruas", "Mode", "STA (m)", "STA", "IRI", "Kondisi", "Lat", "Lng", "Catatan"]];
    IRI_G.forEach(function (g) { g.samples.slice().sort(function (x, y) { return x.sta - y.sta; }).forEach(function (x, i) { b.push([g.name, MODE_TXT[g.mode] || "", Math.round(x.sta), fmtSta(x.sta), x.iri, x.kond || "", x.lat != null ? x.lat : "", x.lng != null ? x.lng : "", i ? "" : g.note || ""]); }); });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), "IRI per STA"); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b), "Data Terbaca"); XLSX.writeFile(wb, "scan-iri-per-sta.xlsx");
  }
  function applyIri(silent) {
    var n = 0, nr = 0;
    IRI_G.forEach(function (g) {
      if (!g.cand || !g.ints) return;
      if (g.cand.src === "xls") { var pts = g.samples.filter(function (s) { return s.lat != null; }).map(function (s) { return mkPoint(fmtSta(s.sta), s.lat, s.lng, { iri: s.iri, kondisi: s.kond }); }); if (pts.length) { n += pushToRoad(g.name, pts, null); nr++; } return; }
      var road = roads.filter(function (r) { return r.id === g.cand.id; })[0]; if (!road) return;
      var pick = function (sta) { for (var i = 0; i < g.ints.length; i++) { var it = g.ints[i]; if (it.a && it.a.length && sta >= it.l0 - .5 && sta <= it.l1 + .5) return it; } return null; };
      road.points.filter(function (q) { return isFinite(q.lat) && isFinite(q.lng); }).forEach(function (q, i) { var it = pick(g.cand.s[i]); if (it) { q.iri = +it.avg.toFixed(2); n++; } });
      persist(); try { renderRoadLayer(road); } catch (e) { } nr++;
    });
    try { renderRoadList(); updateStats(); } catch (e) { }
    if (nr) { var fx = []; IRI_G.forEach(function (g) { if (!g.cand) return; var rd = roads.filter(function (r) { return g.cand.id ? r.id === g.cand.id : r.name === g.name; })[0]; if (rd && fx.indexOf(rd) < 0) fx.push(rd); }); akRun(fx, true); }
    if (!nr) return say("Tidak ada ruas yang bisa diterapkan", true);
    if (silent === true) { say(n + " titik STA di " + nr + " ruas masuk ke data & Dashboard"); return; }
    clearLayer(); close(); try { if (!iriMode) toggleIriMode(true); } catch (e) { }
    say(n + " titik STA di " + nr + " ruas diberi nilai IRI · peta diwarnai menurut IRI");
  }

  /* ---- sisip tombol ke dialog Impor lama ---- */
  function inject() {
    var grid = document.querySelector("#importModal .export-grid"); if (!grid || grid.querySelector(".pq-ic-btn")) return;
    var mk = function (icon, t, s, tab) { var b = document.createElement("button"); b.className = "export-opt pq-ic-btn"; b.style.gridColumn = "1 / -1"; b.innerHTML = '<i class="fa-solid ' + icon + '"></i><div><b>' + t + "</b><small>" + s + "</small></div>"; b.onclick = function () { open(tab); }; return b; };
    grid.appendChild(mk("fa-location-dot", "Koordinat (teks / CSV)", "Tempel lat,lng · DMS · UTM, STA otomatis", "k"));
    grid.appendChild(mk("fa-gauge-high", "Scan IRI per STA", "Petakan nilai IRI tiap interval STA ruas", "i"));
    grid.appendChild(mk("fa-wand-magic-sparkles", "Scan Ruas &amp; STA (Cerdas)", "Cocokkan data ke ruas jalan + STA otomatis", "s"));
    var kb = mk("fa-city", "Sinkronkan Kabupaten (otomatis)", "Ubah kabupaten semua ruas sesuai posisi titik di peta", "k"); kb.onclick = function () { akFixAll(); }; grid.appendChild(kb);
  }
  window.PQ_AutoKab = { fixRoad: akFixRoad, fixAll: akFixAll, at: akKabAt };
  window.PQ_ImporCerdas = { iriParse: iriParse, iriResolve: iriResolve, iriIntervals: iriIntervals, scan: scan, open: open, parseCoordText: parseCoordText, normalizeRows: normalizeRows, utmToLL: utmToLL };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject); else inject();
  setTimeout(inject, 1500);
})();
