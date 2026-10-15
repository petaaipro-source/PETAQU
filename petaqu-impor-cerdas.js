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
      road.points = orderRoadPoints(road.points.concat(add)); persist(); renderRoadLayer(road); renderRoadList(); updateStats(); return add.length;
    }
    addRoad(name, orderRoadPoints(pts)); return pts.length;
  }

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
      '<div class="r"><button class="b" id="icSr">Mulai Scan</button><button class="b o" id="icSm" disabled>Lihat di Peta</button><button class="b o" id="icSx" disabled>Unduh Excel</button><button class="b g" id="icSa" disabled>Terapkan ke Peta</button></div></div><div class="pn" id="icI"><div class="hint"><b>Scan IRI per STA:</b> nilai IRI dikumpulkan per interval STA di tiap ruas, lalu dipetakan sebagai garis berwarna menurut kelas IRI (baik → rusak berat). Sumber: data ruas yang sudah di peta, atau hasil Scan Ruas &amp; STA terakhir (kolom IRI ikut terbaca).</div><div class="r"><div><label class="s">Sumber</label><select id="icIs"><option value="roads">Data ruas di peta</option><option value="scan">Hasil Scan terakhir</option></select></div><div><label class="s">Ruas</label><select id="icIo"></select></div><div><label class="s">Interval STA</label><select id="icIb"><option value="auto" selected>Otomatis (dari jarak antar STA)</option><option value="100">100 m</option><option value="250">250 m</option><option value="500">500 m</option><option value="1000">1 km</option></select></div></div><label class="hint"><input type="checkbox" id="icIg" checked> Tampilkan interval tanpa data (abu-abu putus-putus)</label><div class="sum" id="icIsum"></div><div class="tw" id="icItw" style="display:none"></div><div class="r"><button class="b" id="icIr">Scan &amp; Petakan IRI</button><button class="b o" id="icIx" disabled>Unduh Excel</button></div></div></div>';
    document.body.appendChild(d);
    d.addEventListener("click", function (e) { if (e.target === d) close(); });
    $("icX").onclick = close;
    d.querySelectorAll(".tab").forEach(function (b) { b.onclick = function () { d.querySelectorAll(".tab").forEach(function (x) { x.classList.toggle("on", x === b); }); $("icK").classList.toggle("on", b.dataset.t === "k"); $("icS").classList.toggle("on", b.dataset.t === "s"); $("icI").classList.toggle("on", b.dataset.t === "i"); }; });
    $("icKp").onclick = checkCoords; $("icKa").onclick = applyCoords;
    $("icKf").onchange = function (e) { var f = e.target.files[0]; if (!f) return; readFileRows(f, function (rows) { $("icKt").value = rows.map(function (r) { return r.join("\t"); }).join("\n"); if (!$("icKn").value) $("icKn").value = (typeof guessRoadName === "function" ? guessRoadName(f.name) : f.name); checkCoords(); }); };
    $("icSf").onchange = function (e) { var f = e.target.files[0]; if (!f) return; readFileRows(f, function (rows) { S.scan.rows = rows; say(rows.length + " baris dibaca dari " + f.name); runScan(); }); };
    $("icSr").onclick = function () { var t = $("icSt2").value.trim(); if (t) S.scan.rows = splitRows(t); if (!S.scan.rows || !S.scan.rows.length) return say("Pilih file atau tempel data dulu", true); runScan(); };
    $("icIr").onclick = scanIri; $("icIx").onclick = exportIri; $("icSm").onclick = showScanMap; $("icSx").onclick = exportScan; $("icSa").onclick = applyScan;
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

  function clearLayer() { if (S.layer) { try { map.removeLayer(S.layer); } catch (e) { } S.layer = null; } }

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


  /* ---- Scan IRI per STA ---- */
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
  function iriSamples() {
    var src = $("icIs").value, only = $("icIo").value, map_ = {};
    if (src === "scan") {
      if (!S.scan.res) { say("Jalankan Scan Ruas & STA dulu", true); return null; }
      S.scan.res.forEach(function (r) { var v = parseFloat(String(r.src.iri || "").replace(",", ".")); if (r.status === "none" || !r.cand || isNaN(v) || r.staM == null) return; if (only && r.cand.id !== only) return; var k = r.cand.name; (map_[k] = map_[k] || { c: r.cand, s: [] }).s.push([r.staM, v]); });
    } else {
      buildCands(false).forEach(function (c) { if (only && c.id !== only) return; var arr = []; c.iri.forEach(function (v, i) { if (v != null) arr.push([c.s[i], v]); }); if (arr.length) map_[c.name] = { c: c, s: arr }; });
    }
    return map_;
  }
  var IRI_OUT = [];
  function scanIri() {
    var m = iriSamples(); if (!m) return; var names = Object.keys(m);
    if (!names.length) return say("Tidak ada nilai IRI yang ditemukan (kolom IRI kosong)", true);
    var auto = $("icIb").value === "auto", autoInfo = [], bin = +$("icIb").value, gaps = $("icIg").checked, lines = [], bnd = [], tot = 0, cls = {}, rows = [];
    clearLayer(); IRI_OUT = [];
    names.forEach(function (n) {
      var c = m[n].c, smp = m[n].s, ints = [];
      if (auto) {
        var g = {}; smp.forEach(function (x) { var k = Math.round(x[0]); (g[k] = g[k] || []).push(x[1]); });
        var st = Object.keys(g).map(Number).sort(function (a, b) { return a - b; }), gp = [];
        for (var i = 1; i < st.length; i++) gp.push(st[i] - st[i - 1]);
        gp.sort(function (a, b) { return a - b; });
        var med = gp.length ? gp[Math.floor(gp.length / 2)] : 100; med = Math.max(10, med);
        autoInfo.push(n + ": ±" + med + " m");
        st.forEach(function (k, i) {
          var pv = i ? st[i - 1] : null, nx = i < st.length - 1 ? st[i + 1] : null;
          var l0 = pv != null && k - pv <= med * 3 ? (k + pv) / 2 : k - med / 2, l1 = nx != null && nx - k <= med * 3 ? (k + nx) / 2 : k + med / 2;
          ints.push({ l0: l0, l1: l1, a: g[k] });
          if (nx != null && nx - k > med * 3) ints.push({ l0: k + med / 2, l1: nx - med / 2, a: null });
        });
      } else {
        var bins = {}; smp.forEach(function (x) { var k = Math.floor(x[0] / bin); (bins[k] = bins[k] || []).push(x[1]); });
        var ks = Object.keys(bins).map(Number), kmin = Math.min.apply(0, ks), kmax = Math.max.apply(0, ks);
        for (var k2 = kmin; k2 <= kmax; k2++) ints.push({ l0: k2 * bin, l1: k2 * bin + bin, a: bins[k2] || null });
      }
      ints.forEach(function (it) {
        var a = it.a, l0 = it.l0, l1 = it.l1, pts = subLine(c, Math.min(l0, l1), Math.max(l0, l1));
        if (pts.length < 2) return;
        if (!a) { if (gaps) lines.push(L.polyline(pts, { color: "#7c8aa0", weight: 3, opacity: .7, dashArray: "4 6" })); return; }
        var avg = a.reduce(function (x, y) { return x + y; }, 0) / a.length, mx = Math.max.apply(0, a), inf = getIriInfo(avg);
        cls[inf.label] = (cls[inf.label] || 0) + 1; tot++;
        IRI_OUT.push([n, fmtSta(l0) + " – " + fmtSta(l1), +avg.toFixed(2), +mx.toFixed(2), a.length, inf.label]);
        var pl = L.polyline(pts, { color: inf.color, weight: 7, opacity: .95, lineCap: "butt" }).bindPopup("<b>" + esc(n) + "</b><br>STA " + fmtSta(l0) + " – " + fmtSta(l1) + "<br>IRI rata-rata <b>" + avg.toFixed(2) + "</b> · maks " + mx.toFixed(2) + "<br>" + inf.label + " · " + a.length + " titik");
        lines.push(pl); pts.forEach(function (q) { bnd.push(q); });
      });
    });
    if (!lines.length) return say("Interval STA tidak bisa dipetakan (cek STA ruas)", true);
    S.layer = L.layerGroup(lines).addTo(map);
    try { map.fitBounds(L.latLngBounds(bnd), { padding: [60, 60] }); } catch (e) { }
    $("icIsum").innerHTML = '<span class="chip">' + names.length + ' ruas</span>' + (auto ? '<span class="chip">Interval otomatis: ' + esc(autoInfo.slice(0, 3).join("; ")) + (autoInfo.length > 3 ? " …" : "") + "</span>" : "") + '<span class="chip">' + tot + ' interval ber-IRI</span>' + Object.keys(cls).map(function (k) { var inf = IRI_LEVELS.filter(function (x) { return x.label === k; })[0]; return '<span class="chip" style="border-color:' + (inf ? inf.color : "#7c8aa0") + '">' + esc(k) + ": " + cls[k] + "</span>"; }).join("");
    var tw = $("icItw"); tw.style.display = "block";
    tw.innerHTML = "<table><tr><th>Ruas</th><th>STA</th><th>IRI rata²</th><th>Maks</th><th>n</th><th>Kelas</th></tr>" + IRI_OUT.slice(0, 300).map(function (r) { var inf = getIriInfo(r[2]); return "<tr><td>" + esc(r[0]) + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td><td>" + r[4] + '</td><td style="color:' + inf.color + '">' + esc(r[5]) + "</td></tr>"; }).join("") + "</table>";
    $("icIx").disabled = false;
    $("pqIc").classList.remove("show"); say("IRI per STA dipetakan (" + tot + " interval) · klik garis untuk detail");
  }
  function exportIri() {
    var a = [["Ruas", "Interval STA", "IRI rata-rata", "IRI maks", "Jumlah titik", "Kelas"]].concat(IRI_OUT);
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), "IRI per STA"); XLSX.writeFile(wb, "scan-iri-per-sta.xlsx");
  }

  /* ---- sisip tombol ke dialog Impor lama ---- */
  function inject() {
    var grid = document.querySelector("#importModal .export-grid"); if (!grid || grid.querySelector(".pq-ic-btn")) return;
    var mk = function (icon, t, s, tab) { var b = document.createElement("button"); b.className = "export-opt pq-ic-btn"; b.style.gridColumn = "1 / -1"; b.innerHTML = '<i class="fa-solid ' + icon + '"></i><div><b>' + t + "</b><small>" + s + "</small></div>"; b.onclick = function () { open(tab); }; return b; };
    grid.appendChild(mk("fa-location-dot", "Koordinat (teks / CSV)", "Tempel lat,lng · DMS · UTM, STA otomatis", "k"));
    grid.appendChild(mk("fa-gauge-high", "Scan IRI per STA", "Petakan nilai IRI tiap interval STA ruas", "i"));
    grid.appendChild(mk("fa-wand-magic-sparkles", "Scan Ruas &amp; STA (Cerdas)", "Cocokkan data ke ruas jalan + STA otomatis", "s"));
  }
  window.PQ_ImporCerdas = { scan: scan, open: open, parseCoordText: parseCoordText, normalizeRows: normalizeRows, utmToLL: utmToLL };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject); else inject();
  setTimeout(inject, 1500);
})();
