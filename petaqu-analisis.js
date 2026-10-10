/* PETAQU — ANALISIS RUAS CERDAS  v1
   Mengubah titik-titik hasil Ukur Jeda (lebar jalan, bahu, drainase) menjadi gambaran satu ruas utuh:
     1) PROFIL per STA          : grafik lebar jalan + jalur bahu kiri/kanan + drainase kiri/kanan, titik bermasalah diberi cincin merah.
     2) DETEKSI TEMUAN OTOMATIS : penyempitan (pembanding median ruas yang tahan pencilan), bahu hilang, drainase tidak ada,
                                  lebar terlalu sempit, keyakinan rendah, celah data. Diurutkan menurut tingkat keparahan.
     3) SKOR RUAS 0–100         : kelengkapan bahu, drainase, konsistensi lebar, kecukupan lebar, keandalan data (indikatif).
     4) TANYA DATA              : bahasa Indonesia biasa, mis. "bahu tidak ada lebih dari 500 m" atau "lebar di bawah 5,5 m".
                                  Berjalan di perangkat (tanpa kuota), hasil disorot di peta.
     5) SIMPAN OTOMATIS         : tiap pengukuran selesai langsung tersimpan (bisa dimatikan).
     6) LAPORAN                 : Excel (Ringkasan · Temuan · Data) dan laporan cetak (PDF lewat dialog cetak).
   Semua hitungan dilakukan di perangkat. Skor dan temuan adalah estimasi visual, bukan hasil survei lapangan. */
(function () {
  "use strict";

  /* ==================== BAGIAN 1 — HITUNGAN MURNI (bisa diuji tanpa browser) ==================== */
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function med(a) {
    a = a.filter(isNum).slice().sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function f1(v) { return isNum(v) ? v.toFixed(1) : "—"; }
  function parseSta(s) {
    if (s == null || s === "") return null; s = String(s);
    var m = s.match(/(\d+)\s*\+\s*(\d+(?:[.,]\d+)?)/);
    if (m) return parseInt(m[1], 10) * 1000 + parseFloat(m[2].replace(",", "."));
    var n = parseFloat(s.replace(",", ".")); return isNaN(n) ? null : n;
  }
  function staLabel(pos, mode) {
    if (mode !== "sta") return (pos / 1000).toFixed(2) + " km";
    var km = Math.floor(pos / 1000), m = Math.round(pos - km * 1000); if (m >= 1000) { km++; m = 0; }
    return km + "+" + ("00" + m).slice(-3);
  }
  function hav(a, b) {
    var r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lng - a.lng) * r;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return 12742000 * Math.asin(Math.sqrt(h));
  }
  function lenTxt(m) { return m >= 1000 ? (m / 1000).toFixed(2) + " km" : Math.round(m) + " m"; }

  /* urutkan titik sepanjang ruas: pakai STA bila cukup lengkap, jika tidak pakai jarak kumulatif */
  function prep(rows) {
    rows = (rows || []).filter(function (r) { return r && isNum(+r.lat) && isNum(+r.lng); });
    var withSta = rows.filter(function (r) { return parseSta(r.sta) != null; }).length;
    var mode = withSta >= Math.max(2, rows.length * 0.6) ? "sta" : "jarak", pts;
    if (mode === "sta") {
      pts = rows.filter(function (r) { return parseSta(r.sta) != null; }).map(function (r) { return Object.assign({}, r, { pos: parseSta(r.sta) }); });
      pts.sort(function (a, b) { return a.pos - b.pos; });
      pts = pts.filter(function (p, i) { return i === pts.length - 1 || Math.abs(pts[i + 1].pos - p.pos) > 1; });   /* STA kembar → ambil yang terbaru */
    } else {
      var cum = 0; pts = rows.map(function (r, i) {
        if (i) cum += hav(rows[i - 1], r);
        return Object.assign({}, r, { pos: cum });
      });
    }
    pts.forEach(function (p, i) { p.i = i; p.lat = +p.lat; p.lng = +p.lng; });
    return { mode: mode, pts: pts };
  }

  var bahuHilang = function (p, s) { var v = p["b" + s]; return isNum(v) && v < 0.15 && !p["b" + s + "o"]; };
  var drNone = function (p, s) { var v = p["d" + s]; return isNum(v) && v <= 0; };

  function runs(pts, pred, maxGap) {
    var out = [], cur = null;
    pts.forEach(function (p, i) {
      if (pred(p)) {
        if (cur && p.pos - cur.end <= maxGap) { cur.end = p.pos; cur.i1 = i; cur.n++; }
        else { cur = { start: p.pos, end: p.pos, i0: i, i1: i, n: 1 }; out.push(cur); }
      } else cur = null;
    });
    return out.map(function (r) { r.len = Math.max(r.end - r.start, 0); return r; });
  }

  function sevLabel(s) { return s >= 3 ? { l: "Tinggi", c: "#ef4444" } : s >= 1.5 ? { l: "Sedang", c: "#f59e0b" } : { l: "Rendah", c: "#38bdf8" }; }
  function gradeOf(t) {
    return t >= 80 ? { l: "Baik", c: "#34d399" } : t >= 60 ? { l: "Cukup", c: "#a3e635" } : t >= 40 ? { l: "Perlu perhatian", c: "#f59e0b" } : { l: "Prioritas", c: "#ef4444" };
  }

  function analyze(rows) {
    var pr = prep(rows), pts = pr.pts, n = pts.length;
    var ws = pts.map(function (p) { return p.W; }).filter(isNum);
    var m = med(ws), mad = m == null ? null : med(ws.map(function (w) { return Math.abs(w - m); }));
    var sigma = mad == null ? 0 : Math.max(0.35, 1.4826 * mad), useRel = ws.length >= 4;
    var findings = [], flag = {};
    pts.forEach(function (p) {
      var tags = [], sev = 0;
      if (isNum(p.W)) {
        if (useRel && p.W < m - Math.max(1.0, 2.5 * sigma)) { var d = m - p.W; tags.push("Penyempitan " + f1(d) + " m dari lebar umum ruas"); sev += d > 2 ? 3 : 2; p.__narrow = 1; }
        else if (useRel && p.W > m + Math.max(1.5, 3 * sigma)) { tags.push("Lebar jauh di atas lebar umum — verifikasi"); sev += 0.8; }
        if (p.W < 4.5) { tags.push("Lebar kurang dari 4,5 m"); sev += 1.5; }
      }
      var bl = bahuHilang(p, "l"), br = bahuHilang(p, "r"), dl = drNone(p, "l"), dr = drNone(p, "r");
      if (bl && br) { tags.push("Bahu kiri & kanan tidak ada"); sev += 2.5; }
      else if (bl || br) { tags.push("Bahu " + (bl ? "kiri" : "kanan") + " tidak ada"); sev += 1.2; }
      if (dl && dr) { tags.push("Drainase kedua sisi tidak ada"); sev += 1.5; }
      else if (dl || dr) { tags.push("Drainase " + (dl ? "kiri" : "kanan") + " tidak ada"); sev += 0.8; }
      if (isNum(p.conf) && p.conf < 0.45) { tags.push("Keyakinan rendah — perlu verifikasi lapangan"); sev += 0.5; }
      if (tags.length) { findings.push({ i: p.i, pos: p.pos, lat: p.lat, lng: p.lng, tags: tags, sev: sev, kind: "titik" }); if (sev >= 1.5) flag[p.i] = 1; }
    });
    var gaps = [];
    if (pr.mode === "sta") pts.forEach(function (p, i) {
      if (i && p.pos - pts[i - 1].pos > 500) {
        var g = p.pos - pts[i - 1].pos; gaps.push({ i: i, len: g });
        findings.push({ i: i, pos: p.pos, lat: p.lat, lng: p.lng, tags: ["Celah data " + lenTxt(g) + " tanpa pengukuran"], sev: 0.3, kind: "celah" });
      }
    });
    findings.sort(function (a, b) { return b.sev - a.sev || a.pos - b.pos; });
    findings.forEach(function (f) { f.lv = sevLabel(f.sev); });

    var bahuRuns = runs(pts, function (p) { return bahuHilang(p, "l") || bahuHilang(p, "r"); }, 400);
    var drRuns = runs(pts, function (p) { return drNone(p, "l") || drNone(p, "r"); }, 400);
    var longest = function (a) { return a.reduce(function (x, r) { return Math.max(x, r.len); }, 0); };

    /* ---- skor ---- */
    var parts = {}, tot, ok;
    tot = 0; ok = 0;
    pts.forEach(function (p) { ["l", "r"].forEach(function (s) { var v = p["b" + s]; if (isNum(v)) { tot++; ok += v >= 0.5 ? 1 : (v >= 0.15 ? 0.5 : 0); } }); });
    parts.bahu = tot ? ok / tot * 100 : null;
    tot = 0; ok = 0;
    pts.forEach(function (p) { ["l", "r"].forEach(function (s) { var v = p["d" + s]; if (isNum(v)) { tot++; if (v > 0) ok++; } }); });
    parts.drain = tot ? ok / tot * 100 : null;
    parts.konsisten = ws.length >= 3 ? 100 * Math.max(0, 1 - (sigma / m) / 0.2) : null;
    parts.lebar = ws.length ? ws.reduce(function (a, w) { return a + Math.min(1, w / 6); }, 0) / ws.length * 100 : null;
    var cf = pts.map(function (p) { return p.conf; }).filter(isNum);
    parts.data = cf.length ? cf.reduce(function (a, b) { return a + b; }, 0) / cf.length * 100 : null;
    var W8 = { bahu: 30, drain: 20, konsisten: 20, lebar: 20, data: 10 }, sw = 0, sv = 0;
    Object.keys(W8).forEach(function (k) { if (parts[k] != null) { sw += W8[k]; sv += W8[k] * parts[k]; } });
    var total = sw ? Math.round(sv / sw) : null;

    var span = n > 1 ? pts[n - 1].pos - pts[0].pos : 0;
    return {
      mode: pr.mode, pts: pts, n: n, med: m, sigma: sigma, findings: findings, flag: flag, gaps: gaps, span: span,
      runs: { bahu: bahuRuns, drain: drRuns }, longest: { bahu: longest(bahuRuns), drain: longest(drRuns) },
      parts: parts, total: total, grade: total == null ? null : gradeOf(total),
      stats: {
        wmin: ws.length ? Math.min.apply(null, ws) : null, wmax: ws.length ? Math.max.apply(null, ws) : null,
        bahuHilangPct: n ? Math.round(pts.filter(function (p) { return bahuHilang(p, "l") || bahuHilang(p, "r"); }).length / n * 100) : 0,
        drainHilangPct: n ? Math.round(pts.filter(function (p) { return drNone(p, "l") || drNone(p, "r"); }).length / n * 100) : 0
      }
    };
  }

  /* ---- Tanya data (bahasa Indonesia, aturan sederhana, tanpa jaringan) ---- */
  function num(s) { return parseFloat(String(s).replace(",", ".")); }
  function parseQuery(q) {
    q = " " + String(q || "").toLowerCase().replace(/\s+/g, " ") + " ";
    var conds = [], minLen = null, top = null, m;
    function cut(re) { var r = re.exec(q); if (r) q = q.replace(r[0], " "); return r; }
    function side(s) { return s === "kiri" ? ["l"] : s === "kanan" ? ["r"] : ["l", "r"]; }
    function anySide(sd, fn) { return function (p) { return sd.some(function (s) { return fn(p, s); }); }; }

    while ((m = cut(/lebar(?: jalan)?\s*(?:yang\s*)?(di bawah|kurang dari|lebih kecil dari|<|di atas|lebih dari|lebih besar dari|>)\s*([\d.,]+)\s*(?:m|meter)\b/))) {
      var lim = num(m[2]), lt = /bawah|kurang|kecil|</.test(m[1]);
      conds.push({ txt: "lebar " + (lt ? "< " : "> ") + f1(lim) + " m", pred: (function (lim, lt) { return function (p) { return isNum(p.W) && (lt ? p.W < lim : p.W > lim); }; })(lim, lt) });
    }
    while ((m = cut(/bahu\s*(kiri|kanan)?\s*(?:di bawah|kurang dari|<)\s*([\d.,]+)\s*(?:m|meter)\b/))) {
      var sd = side(m[1]), lim2 = num(m[2]);
      conds.push({ txt: "bahu" + (m[1] ? " " + m[1] : "") + " < " + f1(lim2) + " m", pred: anySide(sd, (function (lim2) { return function (p, s) { return isNum(p["b" + s]) && p["b" + s] < lim2; }; })(lim2)) });
    }
    while ((m = cut(/tanpa (bahu|drainase|saluran)(?: (?:dan|&|serta|maupun) (bahu|drainase|saluran))?/))) {
      [m[1], m[2]].forEach(function (w) {
        if (!w) return;
        if (w === "bahu") conds.push({ txt: "bahu tidak ada", pred: anySide(["l", "r"], bahuHilang) });
        else conds.push({ txt: "drainase tidak ada", pred: anySide(["l", "r"], drNone) });
      });
    }
    while ((m = cut(/bahu\s*(kiri|kanan)?\s*(?:tidak ada|tak ada|hilang|kosong|belum ada)/))) {
      conds.push({ txt: "bahu" + (m[1] ? " " + m[1] : "") + " tidak ada", pred: anySide(side(m[1]), bahuHilang) });
    }
    while ((m = cut(/(?:drainase|saluran)\s*(kiri|kanan)?\s*(?:tidak ada|tak ada|hilang|kosong|belum ada)/))) {
      conds.push({ txt: "drainase" + (m[1] ? " " + m[1] : "") + " tidak ada", pred: anySide(side(m[1]), drNone) });
    }
    if ((m = cut(/(?:lebih dari|minimal|sepanjang|berturut-turut|di atas|>)\s*([\d.,]+)\s*(km|kilometer|m|meter)\b/))) {
      minLen = num(m[1]) * (/^k/.test(m[2]) ? 1000 : 1);
    }
    if (cut(/penyempitan|menyempit/)) conds.push({ txt: "penyempitan", pred: function (p) { return !!p.__narrow; } });
    if (!conds.some(function (c) { return /^lebar/.test(c.txt); }) && cut(/\bsempit\b/)) conds.push({ txt: "lebar < 6,0 m", pred: function (p) { return isNum(p.W) && p.W < 6; } });
    if (cut(/keyakinan rendah|perlu verifikasi|ragu|tidak yakin/)) conds.push({ txt: "keyakinan rendah", pred: function (p) { return isNum(p.conf) && p.conf < 0.45; } });
    if ((m = cut(/(\d+)\s*(?:titik|ruas|temuan)\s*(?:terburuk|paling|kritis)?/))) top = parseInt(m[1], 10);
    if (cut(/kritis|prioritas|terburuk|paling parah|paling bermasalah|bermasalah/)) top = top || 5;
    return { conds: conds, minLen: minLen, top: top, used: !!(conds.length || top) };
  }

  function runQuery(an, qs) {
    var Q = parseQuery(qs), out = [];
    if (!Q.used) return { Q: Q, items: [] };
    var pred = function (p) { return Q.conds.every(function (c) { return c.pred(p); }); };
    if (Q.conds.length && Q.minLen != null) {
      runs(an.pts, pred, 400).filter(function (r) { return r.len >= Q.minLen; }).forEach(function (r) {
        var seg = an.pts.slice(r.i0, r.i1 + 1), mid = seg[seg.length >> 1];
        out.push({ run: true, title: staLabel(r.start, an.mode) + " → " + staLabel(r.end, an.mode), sub: "sepanjang " + lenTxt(r.len) + " (" + r.n + " titik)", lat: mid.lat, lng: mid.lng, line: seg.map(function (p) { return [p.lat, p.lng]; }), i: mid.i, len: r.len });
      });
      out.sort(function (a, b) { return b.len - a.len; });
    } else if (Q.conds.length) {
      an.pts.filter(pred).forEach(function (p) {
        out.push({ run: false, title: "STA " + staLabel(p.pos, an.mode), sub: "lebar " + f1(p.W) + " m · bahu " + f1(p.bl) + "/" + f1(p.br) + " m · drainase " + f1(p.dl) + "/" + f1(p.dr) + " m", lat: p.lat, lng: p.lng, i: p.i, sev: (an.findings.filter(function (f) { return f.i === p.i && f.kind === "titik"; })[0] || { sev: 0 }).sev });
      });
      if (Q.top) out.sort(function (a, b) { return b.sev - a.sev; });
    } else {
      an.findings.filter(function (f) { return f.kind === "titik"; }).forEach(function (f) {
        out.push({ run: false, title: "STA " + staLabel(f.pos, an.mode), sub: f.tags.join(" · "), lat: f.lat, lng: f.lng, i: f.i, sev: f.sev });
      });
    }
    if (Q.top) out = out.slice(0, Q.top);
    return { Q: Q, items: out };
  }

  var CORE = { isNum: isNum, med: med, parseSta: parseSta, staLabel: staLabel, prep: prep, analyze: analyze, parseQuery: parseQuery, runQuery: runQuery, runs: runs, gradeOf: gradeOf, sevLabel: sevLabel, lenTxt: lenTxt, hav: hav };
  if (typeof module !== "undefined" && module.exports) module.exports = CORE;
  if (typeof document === "undefined") return;
  if (window.__pqAnalisis) return; window.__pqAnalisis = 1;
  window.PQAnalisis = CORE;

  /* ==================== BAGIAN 2 — GRAFIK (SVG) ==================== */
  var DARK = { tx: "#9fb0c8", grid: "#ffffff17", line: "#22d3ee", med: "#f59e0b", bahu: "#a8896a", dr: "#38bdf8", bad: "#ef4444", mute: "#64748b", ok: "#34d399", mid: "#f59e0b" };
  var LIGHT = { tx: "#475569", grid: "#e2e8f0", line: "#0891b2", med: "#d97706", bahu: "#92704f", dr: "#0284c7", bad: "#dc2626", mute: "#94a3b8", ok: "#059669", mid: "#d97706" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function chartSvg(an, th) {
    th = th || DARK;
    var pts = an.pts, W = 420, H = 246, L = 64, R = 10; if (!pts.length) return "";
    var p0 = pts[0].pos, p1 = pts[pts.length - 1].pos; if (p1 - p0 < 50) { p0 -= 25; p1 += 25; }
    var X = function (v) { return L + (v - p0) / (p1 - p0) * (W - L - R); };
    var ws = pts.map(function (p) { return p.W; }).filter(isNum), lo = Math.min.apply(null, ws.concat([an.med == null ? 99 : an.med])), hi = Math.max.apply(null, ws.concat([an.med == null ? 0 : an.med]));
    if (!ws.length) { lo = 0; hi = 8; }
    lo = Math.floor(lo - 1); hi = Math.ceil(hi + 1); if (hi - lo < 4) hi = lo + 4;
    var top = 24, bot = 116, Y = function (v) { return bot - (v - lo) / (hi - lo) * (bot - top); }, o = "";
    [lo, (lo + hi) / 2, hi].forEach(function (v) { o += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="' + th.grid + '"/><text x="' + (L - 6) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end" font-size="9" fill="' + th.tx + '">' + v.toFixed(v % 1 ? 1 : 0) + ' m</text>'; });
    o += '<text x="2" y="9" font-size="9" font-weight="700" fill="' + th.tx + '">Lebar jalan</text>';
    if (an.med != null) o += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(an.med).toFixed(1) + '" y2="' + Y(an.med).toFixed(1) + '" stroke="' + th.med + '" stroke-dasharray="4 3"/><text x="' + (W - R) + '" y="' + (Y(an.med) - 3).toFixed(1) + '" text-anchor="end" font-size="8.5" fill="' + th.med + '">umum ' + an.med.toFixed(1) + ' m</text>';
    var lp = pts.filter(function (p) { return isNum(p.W); }).map(function (p) { return X(p.pos).toFixed(1) + "," + Y(p.W).toFixed(1); }).join(" ");
    if (lp) o += '<polyline points="' + lp + '" fill="none" stroke="' + th.line + '" stroke-width="1.8" stroke-linejoin="round"/>';
    pts.forEach(function (p) {
      if (!isNum(p.W)) return; var cx = X(p.pos).toFixed(1), cy = Y(p.W).toFixed(1), c = !isNum(p.conf) || p.conf >= 0.7 ? th.ok : p.conf >= 0.45 ? th.mid : th.bad;
      o += '<circle cx="' + cx + '" cy="' + cy + '" r="3.3" fill="' + c + '"/>';
      if (an.flag[p.i]) o += '<circle cx="' + cx + '" cy="' + cy + '" r="6.5" fill="none" stroke="' + th.bad + '" stroke-width="1.6"/>';
      o += '<circle data-i="' + p.i + '" cx="' + cx + '" cy="' + cy + '" r="9" fill="transparent" style="cursor:pointer"><title>STA ' + staLabel(p.pos, an.mode) + " · " + f1(p.W) + ' m</title></circle>';
    });
    var tr = [["Bahu kiri", "bl", 148, "b"], ["Bahu kanan", "br", 170, "b"], ["Drainase kiri", "dl", 192, "d"], ["Drainase kanan", "dr", 214, "d"]];
    var bw = Math.max(3, Math.min(10, (W - L - R) / Math.max(pts.length, 1) * 0.7));
    tr.forEach(function (t) {
      var yb = t[2]; o += '<text x="2" y="' + (yb - 3) + '" font-size="8.5" fill="' + th.tx + '">' + t[0] + '</text><line x1="' + L + '" x2="' + (W - R) + '" y1="' + yb + '" y2="' + yb + '" stroke="' + th.grid + '"/>';
      pts.forEach(function (p) {
        var v = p[t[1]], cx = X(p.pos);
        if (!isNum(v)) { o += '<circle cx="' + cx.toFixed(1) + '" cy="' + (yb - 5) + '" r="1.6" fill="' + th.mute + '"/>'; return; }
        if (t[3] === "b") {
          if (v < 0.15 && !p[t[1] + "o"]) o += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (yb - 3) + '" width="' + bw.toFixed(1) + '" height="3" fill="' + th.bad + '"/>';
          else o += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (yb - Math.max(2, Math.min(1, v / 2.5) * 14)).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(2, Math.min(1, v / 2.5) * 14).toFixed(1) + '" fill="' + th.bahu + '"/>';
        } else if (v > 0) o += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (yb - 10) + '" width="' + bw.toFixed(1) + '" height="8" rx="1.5" fill="' + th.dr + '"/>';
        else o += '<path d="M' + (cx - 3).toFixed(1) + ' ' + (yb - 9) + 'l6 7m0 -7l-6 7" stroke="' + th.bad + '" stroke-width="1.5" fill="none"/>';
      });
    });
    var span = p1 - p0, steps = [100, 200, 250, 500, 1000, 2000, 5000, 10000], st = steps.filter(function (s) { return span / s <= 6; })[0] || 20000;
    for (var v = Math.ceil(p0 / st) * st; v <= p1; v += st) o += '<line x1="' + X(v).toFixed(1) + '" x2="' + X(v).toFixed(1) + '" y1="224" y2="228" stroke="' + th.tx + '"/><text x="' + X(v).toFixed(1) + '" y="239" text-anchor="middle" font-size="8.5" fill="' + th.tx + '">' + staLabel(v, an.mode) + "</text>";
    return '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" aria-label="Profil lebar jalan, bahu dan drainase sepanjang ruas" style="display:block;font-family:system-ui,sans-serif">' + o + "</svg>";
  }

  /* ==================== BAGIAN 3 — PANEL ==================== */
  var $ = function (id) { return document.getElementById(id); };
  var K_AUTO = "pq_an_auto", K_MINI = "pq_an_mini";
  function jget(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function M() { try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) {} return window.map && window.map.addLayer ? window.map : null; }
  function toast_(m, err) { try { if (typeof toast === "function") toast(m, !!err); } catch (e) {} }
  function rowsAll() { try { return window.PQJeda && PQJeda.saved ? PQJeda.saved() : []; } catch (e) { return []; } }
  function ruasName(r) { return r.ruas || "(tanpa nama)"; }

  var CSS = "#pqAn{position:fixed;left:var(--pq-fl,364px);top:calc(var(--pq-ft,70px) + 52px);z-index:1270;width:min(430px,calc(100vw - 20px));max-height:calc(100dvh - var(--pq-ft,70px) - 80px);overflow:auto;overscroll-behavior:contain;display:none;box-sizing:border-box;padding:12px;border-radius:16px;border:1px solid rgba(34,211,238,.4);background:#0a0e17f7;color:#dbe7f3;font:13px/1.4 system-ui,sans-serif;box-shadow:0 14px 40px #0008;backdrop-filter:blur(10px)}" +
    "#pqAn.open{display:block}#pqAn h3{margin:0;font-size:14px}#pqAn small{color:#9fb0c8}#pqAn .an-hd{display:flex;align-items:flex-start;gap:8px;margin-bottom:8px}#pqAn .an-hd>div{flex:1}#pqAn #anTop{position:sticky;top:-12px;z-index:5;margin:-12px -12px 8px;padding:12px 12px 6px;background:#0a0e17;border-radius:16px 16px 0 0;border-bottom:1px solid #22d3ee22}#pqAn #anTop .an-hd{margin:0 0 4px}#pqAn.min{overflow:hidden;max-height:none}#pqAn.min>:not(#anTop){display:none}#pqAn.min #anTop>:not(.an-hd){display:none}#pqAn.min #anTop{margin-bottom:-12px;padding-bottom:12px;border-bottom:0;border-radius:16px}#pqAn.min #anTop .an-hd{margin:0}" +
    "#pqAn .an-mn{border:0;background:none;color:#8fa6bd;font-size:22px;line-height:1;cursor:pointer;padding:0 4px}#pqAn .an-x{border:0;background:none;color:#8fa6bd;font-size:22px;line-height:1;cursor:pointer}" +
    "#pqAn select,#pqAn input[type=text]{width:100%;box-sizing:border-box;margin:3px 0;padding:7px 9px;border-radius:9px;border:1px solid #ffffff22;background:#0f1726;color:#dbe7f3;font:12.5px system-ui}" +
    "#pqAn .an-h{margin:14px 0 6px;font:700 10px/1 system-ui;letter-spacing:.8px;text-transform:uppercase;color:#8fa6bd}" +
    "#pqAn .an-c{display:flex;gap:8px;align-items:flex-start;font-size:12px;padding:3px 0;cursor:pointer}#pqAn .an-c input{margin-top:2px;accent-color:#22d3ee}" +
    "#pqAn .an-b{display:inline-block;margin:3px 5px 3px 0;padding:7px 11px;border:0;border-radius:9px;background:#22d3ee22;color:#a5f3fc;font:600 12px system-ui;cursor:pointer}#pqAn .an-b:hover{background:#22d3ee40}#pqAn .an-lr{display:flex;align-items:center;gap:6px;padding:5px 8px;margin:2px 0;border-radius:8px;background:#ffffff0a;font:11.5px/1.3 system-ui}#pqAn .an-lr span{flex:1;min-width:0;color:#cbd5e1}#pqAn .an-lr b{color:#fff}#pqAn .an-lr button{border:0;background:#ef444433;color:#fecaca;border-radius:6px;width:24px;height:24px;font:700 14px system-ui;cursor:pointer}#pqAn .an-lst{max-height:210px;overflow:auto}#pqAn .an-dg{background:#ef444422;color:#fecaca}#pqAn .an-dg:hover{background:#ef444444}" +
    "#pqAn .an-ch{display:inline-block;margin:3px 4px 0 0;padding:4px 9px;border:1px solid #ffffff22;border-radius:99px;background:transparent;color:#c6d4e6;font:11.5px system-ui;cursor:pointer}#pqAn .an-ch:hover{border-color:#22d3ee;color:#fff}" +
    "#pqAn .an-sc{display:flex;gap:14px;align-items:center;padding:10px;border-radius:12px;background:#ffffff0a}" +
    "#pqAn .an-ring{--p:0;--c:#22d3ee;width:78px;height:78px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:conic-gradient(var(--c) calc(var(--p)*1%),#ffffff1a 0)}" +
    "#pqAn .an-ring b{width:60px;height:60px;border-radius:50%;background:#0a0e17;display:flex;align-items:center;justify-content:center;font-size:22px}" +
    "#pqAn .an-pt{flex:1;min-width:0}#pqAn .an-pt strong{font-size:15px}#pqAn .an-bar{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:10.5px;color:#9fb0c8}#pqAn .an-bar span{width:84px;flex:none}#pqAn .an-bar i{flex:1;height:5px;border-radius:3px;background:#ffffff14;overflow:hidden;display:block}#pqAn .an-bar i u{display:block;height:100%;background:#22d3ee}" +
    "#pqAn .an-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}#pqAn .an-stats div{padding:7px 8px;border-radius:10px;background:#ffffff0a;font-size:10.5px;color:#9fb0c8}#pqAn .an-stats b{display:block;font-size:14px;color:#e8f1fb;margin-top:2px}" +
    "#pqAn .an-f{display:flex;gap:8px;align-items:flex-start;width:100%;text-align:left;padding:8px 9px;margin:3px 0;border:0;border-radius:10px;background:#ffffff0a;color:inherit;font:12px/1.35 system-ui;cursor:pointer}#pqAn .an-f:hover{background:#22d3ee1c}" +
    "#pqAn .an-f em{font-style:normal;font:800 9px/1 system-ui;letter-spacing:.5px;padding:4px 6px;border-radius:7px;color:#06121a;flex:none;margin-top:1px}#pqAn .an-f b{display:block;font-size:12px}#pqAn .an-f span{color:#b7c6d8}" +
    "#pqAn .an-note{font-size:10.5px;color:#7f93ab;margin-top:10px}#pqAn .an-emp{padding:14px;border-radius:12px;background:#ffffff0a;color:#b7c6d8;font-size:12.5px}" +
    "#pqAn .an-leg{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px;font-size:10px;color:#9fb0c8}#pqAn .an-leg i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:-1px}" +
    "#pqAnBtn.active{filter:brightness(1.3)}";

  var listOpen = false, undoBuf = null, undoT = 0, panel, current = "", an = null, hiGroup = null, pulse = null, lastSig = "", lastKey = "", qItems = [];

  function groups() {
    var g = {}; rowsAll().forEach(function (r) { (g[ruasName(r)] = g[ruasName(r)] || []).push(r); });
    return g;
  }
  function build() {
    var s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
    panel = document.createElement("div"); panel.id = "pqAn"; panel.setAttribute("role", "dialog");
    panel.innerHTML = '<div id="anTop"><div class="an-hd"><div><h3>Analisis Ruas Cerdas</h3><small>profil lebar · temuan otomatis · skor · tanya data</small></div><button class="an-mn" id="anMin" aria-label="Minimalkan" title="Minimalkan">–</button><button class="an-x" id="anX" aria-label="Tutup">×</button></div>' +
      '<select id="anRuas" aria-label="Pilih ruas"></select>' +
      '<label class="an-c"><input type="checkbox" id="anAuto"><span>Simpan otomatis setiap pengukuran selesai (Ukur Jeda)</span></label></div>' +
      '<div id="anBody"></div>' +
      '<div class="an-h">Tanya data</div>' +
      '<input type="text" id="anQ" placeholder="mis. bahu tidak ada lebih dari 500 m" autocomplete="off">' +
      '<div id="anChips"></div><div id="anAsk" style="margin-top:6px"></div>' +
      '<div class="an-h">Kelola data</div>' +
      '<button class="an-b" id="anRef" type="button">⟳ Segarkan &amp; simpan semua</button><button class="an-b" id="anRst" type="button">Reset tampilan</button>' +
      '<button class="an-b an-dg" id="anDelR" type="button">Hapus ruas ini</button><button class="an-b an-dg" id="anDelA" type="button">Hapus semua daftar</button>' +
      '<button class="an-b" id="anBak" type="button">Cadangkan (JSON)</button><button class="an-b" id="anRes" type="button">Pulihkan dari JSON</button><input type="file" id="anFile" accept=".json,application/json" style="display:none">' +
      '<div class="an-note" id="anInfo"></div>' +
      '<div class="an-h">Laporan</div>' +
      '<button class="an-b" id="anXls" type="button">Unduh Excel</button><button class="an-b" id="anPrt" type="button">Laporan cetak / PDF</button>' +
      '<div class="an-note">Skor dan temuan adalah estimasi dari foto Street View dan citra, bukan hasil survei lapangan. Titik berkeyakinan rendah sebaiknya diverifikasi langsung.</div>';
    document.body.appendChild(panel);
    $("anAuto").checked = jget(K_AUTO, 1) !== 0;
    $("anChips").innerHTML = ["bahu tidak ada lebih dari 300 m", "lebar di bawah 6 m", "tanpa drainase", "5 titik terburuk", "keyakinan rendah", "penyempitan"].map(function (t) { return '<button class="an-ch" type="button" data-q="' + esc(t) + '">' + esc(t) + "</button>"; }).join("");

    function syncMin() { var m = panel.classList.contains("min"), b = $("anMin"); b.textContent = m ? "▢" : "–"; b.title = b.ariaLabel = m ? "Perbesar" : "Minimalkan"; }
    panel.classList.toggle("min", jget(K_MINI, 0) === 1); syncMin();
    $("anMin").onclick = function () { panel.classList.toggle("min"); jset(K_MINI, panel.classList.contains("min") ? 1 : 0); syncMin(); };
    $("anX").onclick = close;
    $("anRuas").onchange = function () { current = this.value; clearHi(); $("anAsk").innerHTML = ""; render(); };
    $("anAuto").onchange = function () { jset(K_AUTO, this.checked ? 1 : 0); toast_("Simpan otomatis: " + (this.checked ? "ON" : "OFF")); };
    $("anQ").addEventListener("keydown", function (e) { if (e.key === "Enter") ask(this.value); });
    $("anBak").onclick = backup; $("anRes").onclick = function () { $("anFile").click(); }; $("anFile").onchange = function () { restoreFile(this.files && this.files[0]); this.value = ""; };
    $("anRef").onclick = refreshAll; $("anRst").onclick = resetView; $("anDelR").onclick = delRuas; $("anDelA").onclick = delAll;
    $("anXls").onclick = exportXls; $("anPrt").onclick = printReport;
    panel.addEventListener("click", function (e) {
      var dl = e.target.closest("[data-del]"); if (dl) { delPoint(dl.dataset.del); return; }
      var lt = e.target.closest("[data-lt]"); if (lt) { listOpen = !listOpen; render(); return; }
      var ch = e.target.closest("[data-q]"); if (ch) { $("anQ").value = ch.dataset.q; ask(ch.dataset.q); return; }
      var pt = e.target.closest("[data-i]"); if (pt && an) { focusPoint(+pt.dataset.i); return; }
      var qi = e.target.closest("[data-qi]"); if (qi) { gotoItem(qItems[+qi.dataset.qi]); }
    });
  }

  /* ---- kelola data: segarkan, reset, hapus ---- */
  function info_(t) { var e = $("anInfo"); if (e) e.textContent = t; }
  /* Simpan pengukuran yang sedang tampil TANPA syarat (auto-simpan OFF, keyakinan rendah, lebar kosong tetap masuk),
     lalu baca ulang seluruh daftar tersimpan. */
  function refreshAll() {
    var J = window.PQJeda, before = rowsAll().length, forced = false;
    try {
      var st = J && J.state && J.state();
      if (st && st.A && !st.busy && st.c && st.c.key && J.save) { J.save(); lastKey = st.key; forced = true; }
    } catch (e) {}
    lastSig = ""; refreshList(); render(); tick();
    var after = rowsAll().length;
    var msg = "Disegarkan: " + after + " titik di " + Object.keys(groups()).length + " ruas" + (forced ? " · pengukuran saat ini ikut disimpan" : "") + (after > before ? " (+" + (after - before) + " baru)" : "");
    info_(msg); toast_(msg);
  }
  function resetView() {
    clearHi(); qItems = []; an = null;
    var q = $("anQ"), a = $("anAsk"); if (q) q.value = ""; if (a) a.innerHTML = "";
    current = ""; lastKey = ""; lastSig = ""; refreshList(); render();
    info_("Tampilan direset. Data tersimpan tidak berubah."); toast_("Tampilan direset");
  }
  function setUndo(snap, msg) {
    undoBuf = snap; var e = $("anInfo"); if (!e) return; e.innerHTML = esc(msg) + ' <button class="an-b" id="anUndo" type="button">Batalkan</button>';
    clearTimeout(undoT); undoT = setTimeout(function () { undoBuf = null; info_(""); }, 12000);
    $("anUndo").onclick = function () {
      var J = window.PQJeda; if (!undoBuf || !J || !J.restore) return;
      var n = J.restore(undoBuf); undoBuf = null; clearTimeout(undoT); lastSig = ""; refreshList(); render();
      info_("Dipulihkan " + n + " titik."); toast_("Dipulihkan " + n + " titik");
    };
  }
  function delPoint(k) {
    var J = window.PQJeda; if (!J || !J.remove) { toast_("Perlu petaqu-ukurjeda.js versi terbaru", true); return; }
    var snap = rowsAll().filter(function (r) { return r.k === k; }); if (!snap.length) return;
    J.remove(function (r) { return r.k === k; }); clearHi(); lastSig = ""; refreshList(); render();
    setUndo(snap, "1 titik dihapus.");
  }
  function backup() {
    var rows = rowsAll(); if (!rows.length) { toast_("Belum ada data untuk dicadangkan", true); return; }
    var u = URL.createObjectURL(new Blob([JSON.stringify({ app: "petaqu-ukurjeda", v: 1, tgl: new Date().toISOString(), rows: rows })], { type: "application/json" })), a = document.createElement("a");
    a.href = u; a.download = "petaqu-ukur-jeda-cadangan-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 800); info_(rows.length + " titik dicadangkan."); toast_("Cadangan diunduh");
  }
  function restoreFile(file) {
    var J = window.PQJeda; if (!file || !J || !J.restore) return;
    var fr = new FileReader();
    fr.onerror = function () { toast_("Gagal membaca file", true); };
    fr.onload = function () {
      try {
        var d = JSON.parse(fr.result), arr = Array.isArray(d) ? d : d && d.rows;
        if (!Array.isArray(arr)) throw 0;
        var n = J.restore(arr.slice(0, 800)); if (!n) { toast_("Tidak ada titik valid di file ini", true); return; }
        current = ""; lastSig = ""; refreshList(); render(); info_(n + " titik dipulihkan (titik dengan kunci sama ditimpa)."); toast_(n + " titik dipulihkan");
      } catch (e) { toast_("File bukan cadangan Ukur Jeda yang valid", true); }
    };
    fr.readAsText(file);
  }
  function delRuas() {
    var J = window.PQJeda; if (!J || !J.remove) { toast_("Perlu petaqu-ukurjeda.js versi terbaru", true); return; }
    if (!current || current === "*") { toast_("Pilih satu ruas dulu (bukan 'Semua ruas')", true); return; }
    var n = (groups()[current] || []).length; if (!n) { toast_("Ruas ini belum punya data", true); return; }
    if (!confirm("Hapus " + n + " titik pada ruas \"" + current + "\"?\nBisa dibatalkan 12 detik lewat tombol Batalkan.")) return;
    var nm = current, snapR = (groups()[nm] || []).slice(); J.remove(function (r) { return ruasName(r) === nm; });
    clearHi(); current = ""; lastSig = ""; refreshList(); render();
    setUndo(snapR, n + " titik ruas dihapus.");
  }
  function delAll() {
    var J = window.PQJeda, n = rowsAll().length; if (!J) return;
    if (!n) { toast_("Daftar sudah kosong"); return; }
    if (!confirm("Hapus SEMUA " + n + " titik pengukuran dari semua ruas?\nBisa dibatalkan 12 detik lewat tombol Batalkan.")) return;
    if (!confirm("Yakin? Semua data Ukur Jeda akan dikosongkan.")) return;
    var snapA = rowsAll(); J.clear(); clearHi(); current = ""; lastKey = ""; lastSig = ""; refreshList(); render();
    setUndo(snapA, "Semua data dihapus.");
  }

  function open() { if (!panel) return; panel.classList.add("open"); refreshList(); render(); var b = $("pqAnBtn"); if (b) b.classList.add("active"); }
  function close() { if (panel) panel.classList.remove("open"); clearHi(); var b = $("pqAnBtn"); if (b) b.classList.remove("active"); }
  function toggle() { panel && panel.classList.contains("open") ? close() : open(); }

  function refreshList() {
    var g = groups(), names = Object.keys(g).sort(), sel = $("anRuas"); if (!sel) return;
    var keep = current && (g[current] || current === "*") ? current : (names.sort(function (a, b) { return g[b].length - g[a].length; })[0] || "");
    current = keep;
    sel.innerHTML = names.length ? names.map(function (n) { return '<option value="' + esc(n) + '"' + (n === current ? " selected" : "") + ">" + esc(n) + " (" + g[n].length + " titik)</option>"; }).join("") + (names.length > 1 ? '<option value="*"' + (current === "*" ? " selected" : "") + ">— Semua ruas (untuk Tanya data) —</option>" : "") : '<option value="">Belum ada data tersimpan</option>';
  }

  function listHtml(rows) {
    if (!rows.length) return "";
    var h = '<button class="an-b" type="button" data-lt="1">' + (listOpen ? "▾ Sembunyikan" : "▸ Tampilkan") + " daftar titik (" + rows.length + ")</button>";
    if (!listOpen) return h;
    var rs = rows.slice().sort(function (a, b) { var x = parseSta(a.sta), y = parseSta(b.sta); return x != null && y != null ? x - y : String(a.t || "").localeCompare(String(b.t || "")); });
    return h + '<div class="an-lst">' + rs.map(function (r, i) {
      return '<div class="an-lr"><span><b>' + (r.sta ? "STA " + esc(r.sta) : "#" + (i + 1)) + "</b> · lebar " + f1(r.W) + " m · bahu " + f1(r.bl) + "/" + f1(r.br) + " · yakin " + (isNum(r.conf) ? Math.round(r.conf * 100) + "%" : "—") + '</span><button type="button" data-del="' + esc(r.k) + '" aria-label="Hapus titik" title="Hapus titik ini">×</button></div>';
    }).join("") + "</div>";
  }
  function render() {
    renderMain();
    var body = $("anBody"); if (!body || current === "*") return;
    body.insertAdjacentHTML("beforeend", listHtml(groups()[current] || []));
  }
  function renderMain() {
    var body = $("anBody"); if (!body) return;
    var g = groups(), rows = current === "*" ? [] : (g[current] || []);
    an = null;
    if (!rowsAll().length) { body.innerHTML = '<div class="an-emp"><b>Belum ada data.</b><br>Buka Street View, jeda animasi di titik yang ingin diukur, lalu biarkan Ukur Jeda selesai. Dengan simpan otomatis aktif, setiap hasil langsung masuk ke sini.</div>'; return; }
    if (current === "*") { body.innerHTML = '<div class="an-emp">Pilih satu ruas untuk melihat grafik, skor, dan temuan. Mode "Semua ruas" dipakai oleh kolom Tanya data di bawah.</div>'; return; }
    an = analyze(rows);
    if (an.n < 2) { body.innerHTML = '<div class="an-emp">Baru ' + an.n + ' titik pada ruas ini. Ukur minimal 3 titik berbeda agar profil dan temuan bermakna.</div>'; return; }
    var p = an.parts, bars = [["Bahu", p.bahu], ["Drainase", p.drain], ["Konsistensi lebar", p.konsisten], ["Kecukupan lebar", p.lebar], ["Keandalan data", p.data]];
    var h = '<div class="an-sc"><div class="an-ring" style="--p:' + (an.total || 0) + ";--c:" + (an.grade ? an.grade.c : "#22d3ee") + '"><b>' + (an.total == null ? "—" : an.total) + '</b></div><div class="an-pt"><strong style="color:' + (an.grade ? an.grade.c : "#fff") + '">' + (an.grade ? an.grade.l : "Data belum cukup") + "</strong><small> · skor indikatif</small>" +
      bars.map(function (b) { return '<div class="an-bar"><span>' + b[0] + '</span><i><u style="width:' + (b[1] == null ? 0 : Math.round(b[1])) + '%"></u></i>' + (b[1] == null ? "—" : Math.round(b[1])) + "</div>"; }).join("") + "</div></div>";
    h += '<div class="an-stats"><div>Panjang terukur<b>' + lenTxt(an.span) + '</b></div><div>Lebar umum<b>' + (an.med == null ? "—" : an.med.toFixed(1) + " m") + '</b></div><div>Rentang lebar<b>' + f1(an.stats.wmin) + "–" + f1(an.stats.wmax) + ' m</b></div>' +
      "<div>Bahu hilang terpanjang<b>" + (an.longest.bahu ? lenTxt(an.longest.bahu) : "tidak ada") + "</b></div><div>Tanpa drainase terpanjang<b>" + (an.longest.drain ? lenTxt(an.longest.drain) : "tidak ada") + "</b></div><div>Titik diukur<b>" + an.n + "</b></div></div>";
    h += '<div class="an-h">Profil sepanjang ruas' + (an.mode === "jarak" ? " (jarak kumulatif; STA belum lengkap)" : "") + "</div>" + chartSvg(an, DARK) +
      '<div class="an-leg"><span><i style="background:#34d399"></i>yakin</span><span><i style="background:#f59e0b"></i>sedang</span><span><i style="background:#ef4444"></i>ragu</span><span>cincin merah = temuan</span><span>× merah = tidak ada</span></div>';
    var fs = an.findings.slice(0, 12);
    h += '<div class="an-h">Temuan otomatis (' + an.findings.length + ")</div>" + (fs.length ? fs.map(function (f, i) {
      return '<button class="an-f" type="button" data-i="' + f.i + '"><em style="background:' + f.lv.c + '">' + f.lv.l.toUpperCase() + "</em><div><b>STA " + staLabel(f.pos, an.mode) + "</b><span>" + esc(f.tags.join(" · ")) + "</span></div></button>";
    }).join("") + (an.findings.length > 12 ? '<div class="an-note">+ ' + (an.findings.length - 12) + " temuan lain ada di laporan.</div>" : "") : '<div class="an-emp">Tidak ada temuan menonjol pada titik yang sudah diukur.</div>');
    body.innerHTML = h;
  }

  /* ---- peta ---- */
  function clearHi() { var m = M(); if (hiGroup && m) { try { m.removeLayer(hiGroup); } catch (e) {} } hiGroup = null; pulse = null; }
  function ensureHi() { var m = M(); if (!m || !window.L) return null; if (!hiGroup) hiGroup = L.layerGroup().addTo(m); return hiGroup; }
  function focusPoint(i) {
    var p = an && an.pts[i]; var m = M(); if (!p || !m) return;
    var g = ensureHi(); if (!g) return; if (pulse) { g.removeLayer(pulse); }
    pulse = L.circleMarker([p.lat, p.lng], { radius: 12, color: "#22d3ee", weight: 3, fillColor: "#22d3ee", fillOpacity: 0.15 }).addTo(g);
    m.flyTo([p.lat, p.lng], Math.max(m.getZoom(), 17), { duration: 0.7 });
  }
  function gotoItem(it) {
    var m = M(); if (!it || !m) return;
    if (it.line && it.line.length > 1 && window.L) m.fitBounds(L.latLngBounds(it.line), { maxZoom: 18, padding: [50, 50] });
    else m.flyTo([it.lat, it.lng], Math.max(m.getZoom(), 17), { duration: 0.7 });
  }

  /* ---- tanya data ---- */
  function ask(q) {
    var out = $("anAsk"); q = String(q || "").trim(); if (!q) { out.innerHTML = ""; return; }
    var g = groups(), names = current === "*" ? Object.keys(g) : (current ? [current] : []), items = [], Qd = null;
    if (!names.length) { out.innerHTML = '<div class="an-emp">Belum ada data untuk ditanyai.</div>'; return; }
    names.forEach(function (n) {
      var a = analyze(g[n]), r = runQuery(a, q); Qd = r.Q;
      r.items.forEach(function (it) { it.ruas = n; items.push(it); });
    });
    clearHi();
    if (!Qd.used) { out.innerHTML = '<div class="an-emp">Belum dimengerti. Coba: <i>bahu tidak ada lebih dari 500 m</i>, <i>lebar di bawah 5,5 m</i>, <i>tanpa bahu dan drainase</i>, <i>10 titik terburuk</i>.</div>'; return; }
    qItems = items;
    var h = '<small>Dipahami: ' + esc(Qd.conds.map(function (c) { return c.txt; }).join(" DAN ") || "titik paling bermasalah") + (Qd.minLen != null ? " · menerus ≥ " + lenTxt(Qd.minLen) : "") + (Qd.top ? " · " + Qd.top + " teratas" : "") + " → <b>" + items.length + " hasil</b></small>";
    h += items.slice(0, 15).map(function (it, i) {
      return '<button class="an-f" type="button" data-qi="' + i + '"><em style="background:' + (it.run ? "#f43f5e" : "#22d3ee") + '">' + (it.run ? "RUAS" : "TITIK") + "</em><div><b>" + esc((current === "*" ? it.ruas + " · " : "") + it.title) + "</b><span>" + esc(it.sub) + "</span></div></button>";
    }).join("") + (items.length > 15 ? '<div class="an-note">+ ' + (items.length - 15) + " hasil lain disorot di peta.</div>" : "");
    out.innerHTML = h;
    var gl = ensureHi(); if (gl && window.L) {
      var all = [];
      items.forEach(function (it) {
        if (it.line && it.line.length > 1) { L.polyline(it.line, { color: "#f43f5e", weight: 8, opacity: 0.75, lineCap: "round" }).bindTooltip(esc(it.title + " · " + it.sub)).addTo(gl); it.line.forEach(function (p) { all.push(p); }); }
        else { L.circleMarker([it.lat, it.lng], { radius: 9, color: "#22d3ee", weight: 3, fillColor: "#22d3ee", fillOpacity: 0.15 }).bindTooltip(esc(it.title)).addTo(gl); all.push([it.lat, it.lng]); }
      });
      var m = M(); if (m && all.length) m.fitBounds(L.latLngBounds(all), { maxZoom: 17, padding: [60, 60] });
    }
  }

  /* ---- ekspor ---- */
  function safe(n) { return String(n || "ruas").replace(/[^\w\-]+/g, "_").slice(0, 40); }
  function summaryRows(a, name) {
    return [["Ruas", name], ["Jumlah titik diukur", a.n], ["Panjang terukur (m)", Math.round(a.span)], ["Lebar umum (m)", a.med == null ? "" : +a.med.toFixed(2)],
      ["Lebar minimum (m)", a.stats.wmin == null ? "" : +a.stats.wmin.toFixed(2)], ["Lebar maksimum (m)", a.stats.wmax == null ? "" : +a.stats.wmax.toFixed(2)],
      ["Skor indikatif (0-100)", a.total == null ? "" : a.total], ["Kategori", a.grade ? a.grade.l : ""],
      ["Titik bahu hilang (%)", a.stats.bahuHilangPct], ["Titik tanpa drainase (%)", a.stats.drainHilangPct],
      ["Bahu hilang menerus terpanjang (m)", Math.round(a.longest.bahu)], ["Tanpa drainase menerus terpanjang (m)", Math.round(a.longest.drain)],
      ["Jumlah temuan", a.findings.length], ["Catatan", "Estimasi visual dari foto dan citra; verifikasi lapangan disarankan untuk titik berkeyakinan rendah."]];
  }
  function dataRows(a) {
    return a.pts.map(function (p) {
      var t = function (v, o) { return isNum(v) ? (o ? "≥" : "") + +v.toFixed(2) : ""; };
      return { STA: staLabel(p.pos, a.mode), Lat: p.lat, Lng: p.lng, "Lebar jalan (m)": t(p.W), "Bahu kiri (m)": t(p.bl, p.blo), "Bahu kanan (m)": t(p.br, p.bro), "Drainase kiri (m)": t(p.dl), "Drainase kanan (m)": t(p.dr), "Marka tepi": p.mt || "", "Marka tengah": p.mm || "", Keyakinan: isNum(p.conf) ? Math.round(p.conf * 100) + "%" : "", Panorama: p.n || "" };
    });
  }
  function exportXls() {
    if (!an || an.n < 1) { toast_("Pilih satu ruas yang sudah punya data", true); return; }
    if (!window.XLSX) { toast_("Pustaka Excel belum termuat; pakai Laporan cetak", true); return; }
    var wb = XLSX.utils.book_new(), name = current;
    var s1 = XLSX.utils.aoa_to_sheet(summaryRows(an, name)); s1["!cols"] = [{ wch: 38 }, { wch: 70 }];
    var s2 = XLSX.utils.json_to_sheet(an.findings.map(function (f, i) { return { Prioritas: i + 1, STA: staLabel(f.pos, an.mode), Tingkat: f.lv.l, Temuan: f.tags.join("; "), Lat: f.lat, Lng: f.lng }; }));
    s2["!cols"] = [{ wch: 9 }, { wch: 11 }, { wch: 9 }, { wch: 70 }, { wch: 11 }, { wch: 11 }];
    var s3 = XLSX.utils.json_to_sheet(dataRows(an)); s3["!cols"] = [{ wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 15 }, { wch: 15 }, { wch: 16 }, { wch: 16 }, { wch: 11 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, s1, "Ringkasan"); XLSX.utils.book_append_sheet(wb, s2, "Temuan"); XLSX.utils.book_append_sheet(wb, s3, "Data");
    XLSX.writeFile(wb, "petaqu-analisis-" + safe(name) + "-" + new Date().toISOString().slice(0, 10) + ".xlsx");
    toast_("Excel diunduh");
  }
  function reportHtml(a, name) {
    var tgl = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    var fs = a.findings.slice(0, 40).map(function (f, i) { return "<tr><td>" + (i + 1) + "</td><td>" + staLabel(f.pos, a.mode) + '</td><td style="color:' + f.lv.c + ';font-weight:700">' + f.lv.l + "</td><td>" + esc(f.tags.join("; ")) + "</td></tr>"; }).join("");
    var dr = dataRows(a).slice(0, 300), cols = dr.length ? Object.keys(dr[0]) : [];
    var sc = a.total == null ? "—" : a.total;
    return '<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan ' + esc(name) + '</title><style>@page{size:A4;margin:14mm}body{font:12px/1.45 system-ui,sans-serif;color:#0f172a;margin:0}h1{font-size:20px;margin:0}h2{font-size:13px;margin:18px 0 6px;color:#0e7490;text-transform:uppercase;letter-spacing:.6px}.sub{color:#64748b;margin-top:2px}.kpi{display:flex;gap:8px;margin-top:12px}.kpi div{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px}.kpi b{display:block;font-size:17px;margin-top:2px}table{border-collapse:collapse;width:100%;font-size:10.5px}th,td{border:1px solid #e2e8f0;padding:4px 6px;text-align:left}th{background:#f1f5f9}.note{margin-top:16px;color:#64748b;font-size:10.5px}</style></head><body>' +
      "<h1>Laporan Analisis Ruas</h1><div class=\"sub\">" + esc(name) + " · dibuat " + tgl + " · PETAQU</div>" +
      '<div class="kpi"><div>Skor indikatif<b style="color:' + (a.grade ? a.grade.c : "#0f172a") + '">' + sc + (a.grade ? " · " + a.grade.l : "") + "</b></div><div>Panjang terukur<b>" + lenTxt(a.span) + "</b></div><div>Lebar umum<b>" + (a.med == null ? "—" : a.med.toFixed(1) + " m") + "</b></div><div>Temuan<b>" + a.findings.length + "</b></div></div>" +
      "<h2>Profil sepanjang ruas</h2>" + chartSvg(a, LIGHT) +
      "<h2>Ringkasan</h2><table><tbody>" + summaryRows(a, name).slice(1, 13).map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</tbody></table>" +
      "<h2>Temuan menurut prioritas</h2>" + (fs ? "<table><thead><tr><th>#</th><th>STA</th><th>Tingkat</th><th>Temuan</th></tr></thead><tbody>" + fs + "</tbody></table>" : "<div>Tidak ada temuan menonjol.</div>") +
      "<h2>Data pengukuran</h2><table><thead><tr>" + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" + dr.map(function (r) { return "<tr>" + cols.map(function (c) { return "<td>" + esc(r[c]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>" +
      '<div class="note">Seluruh nilai adalah estimasi visual dari foto Street View dan citra, bukan hasil survei lapangan. Skor bersifat indikatif untuk membantu menentukan urutan pemeriksaan.</div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>';
  }
  function printReport() {
    if (!an || an.n < 1) { toast_("Pilih satu ruas yang sudah punya data", true); return; }
    var w = window.open("", "_blank");
    if (!w) { toast_("Pop-up diblokir. Izinkan pop-up untuk membuka laporan.", true); return; }
    w.document.open(); w.document.write(reportHtml(an, current)); w.document.close();
  }

  /* ---- simpan otomatis + pemantauan ---- */
  function tick() {
    try {
      var J = window.PQJeda; if (!J) return;
      if (jget(K_AUTO, 1) !== 0 && J.state && J.save) {
        var st = J.state();
        if (st && st.A && !st.busy && !st.fatal && st.c && st.c.key && st.key !== lastKey && isNum(st.A.W)) { lastKey = st.key; J.save(); }
      }
      var rows = rowsAll(), sig = rows.length + "|" + (rows.length ? rows[rows.length - 1].k + (rows[rows.length - 1].t || "") : "");
      if (sig !== lastSig) { lastSig = sig; if (panel && panel.classList.contains("open")) { refreshList(); render(); } }
    } catch (e) {}
  }
  function addBtn() {
    var bar = $("routePlayerBar"); if (!bar || $("pqAnBtn")) return;
    var b = document.createElement("button"); b.className = "rp-btn"; b.id = "pqAnBtn"; b.title = "Analisis ruas cerdas"; b.innerHTML = '<i class="fa-solid fa-chart-line"></i>';
    b.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    var j = $("pqJedaBtn"), stop = bar.querySelector(".rp-btn.danger"); bar.insertBefore(b, j ? j.nextSibling : stop || null);
  }
  function mountDock() {
    var b = document.createElement("button"); b.id = "pqAnDock"; b.innerHTML = '<i class="fa-solid fa-chart-line"></i>'; b.onclick = toggle;
    if (window.PQ_DOCK && PQ_DOCK.adopt) PQ_DOCK.adopt(b, "Analisis ruas cerdas"); else { b.style.cssText = "position:fixed;left:10px;bottom:270px;z-index:3900"; document.body.appendChild(b); }
  }

  var tries = 0, iv = setInterval(function () {
    tries++;
    if (document.body && (window.PQ_DOCK || tries > 20)) { clearInterval(iv); build(); mountDock(); setInterval(tick, 700); setInterval(addBtn, 1500); window.PQAnalisis.open = open; window.PQAnalisis.close = close; }
  }, 300);
})();
