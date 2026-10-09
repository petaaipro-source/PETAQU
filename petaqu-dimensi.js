/* PETAQU — DIMENSI JALAN OTOMATIS dari Street View (v1)
   Saat animasi rute diputar & Street View terbuka, modul ini membaca foto Street View di KIRI dan
   KANAN jalan pada titik kendaraan, lalu menghitung (fotogrametri bidang-tanah, bukan OCR teks):
     • lebar perkerasan jalan & lebar lajur efektif (bila garis tepi terbaca)
     • lebar bahu jalan kiri / kanan (bahu beraspal, bahu tanah/kerikil/rumput)
     • ada/tidaknya saluran (drainase) kiri / kanan + jenisnya, dan PANJANG SALURAN kumulatif per sisi
     • marka tengah (terbaca / tidak), posisi kendaraan terhadap tepi jalan
   Cara kerja (ringkas):
     1. Metadata Street View (gratis) → id panorama terdekat. Lalu 2 foto: tegak lurus ke kiri & ke kanan arah jalan.
     2. Tiap baris gambar di bawah garis cakrawala diproyeksikan ke bidang tanah (tinggi kamera ±2,5 m,
        sudut pitch & FOV diketahui) → jarak lateral nyata dari kendaraan, bukan perkiraan visual.
     3. Warna permukaan aspal/beton diambil dari tanah tepat di bawah kamera (pasti jalan), lalu tepi jalan
        dicari dengan region-grow berwarna (Lab) yang toleran terhadap marka, retak & tambalan.
     4. Setelah tepi: marka tepi → bahu beraspal; tanah/kerikil/rumput → bahu; beton/pasangan abu terang
        atau parit gelap sempit → saluran.
     5. Hasil per titik diratakan (median + buang outlier) antar titik berurutan, digabung dengan data OSM
        (lebar/lajur/kelas jalan) sebagai pembanding bila foto tidak jelas. Panjang saluran dijumlah per sisi.
   Jujur soal akurasi: ini ESTIMASI dari foto (tipikal ±0,3–0,8 m untuk tepi jalan yang jelas), bukan survei
   alat ukur. Tiap angka membawa tingkat keyakinan; angka dengan keyakinan rendah ditampilkan sebagai "≈".
   Kiri/kanan mengikuti ARAH ANIMASI. Memakai kunci Street View yang sama (getApiKey()). Tidak mengubah fitur lain. */
(function () {
  "use strict";
  if (typeof window !== "undefined" && window.PQDim) return;

  /* ==================================================================================
     BAGIAN 1 — INTI PENGUKURAN (murni, tanpa DOM → bisa diuji di Node)
     ================================================================================== */
  var CORE = (function () {
    var D2R = Math.PI / 180;
    var OPT = { fov: 90, pitch: -22, camH: 2.5, zMax: 16, size: 640 };

    function lab(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
      g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
      b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
      var x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
      function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
      return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
    }
    function dE(p, q) { var a = p[0] - q[0], b = p[1] - q[1], c = p[2] - q[2]; return Math.sqrt(a * a + b * b + c * c); }
    function med(a) { if (!a.length) return NaN; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

    /* ---- profil lateral: tiap baris di bawah cakrawala → jarak tanah Z (m) + warna median kolom tengah ---- */
    function profile(img, o, xf, bwf) {
      o = o || OPT;
      var W = img.width, H = img.height, d = img.data;
      var f = (W / 2) / Math.tan(o.fov * D2R / 2), th = o.pitch * D2R, s = Math.sin(th), c = Math.cos(th);
      /* xf = pergeseran kolom (pecahan lebar gambar, 0 = tengah); bwf = setengah lebar pita (pecahan lebar) */
      var bw = Math.max(5, Math.round(W * (bwf || 0.075))), xm = Math.round((W >> 1) + (xf || 0) * W);
      xm = Math.max(bw, Math.min(W - 1 - bw, xm));
      var x0 = xm - bw, x1 = xm + bw, rows = [];
      var rs = new Array(x1 - x0 + 1), gs = new Array(x1 - x0 + 1), bs = new Array(x1 - x0 + 1);
      for (var y = H - 2; y >= 0; y--) {
        var yc = (y - H / 2) / f, den = yc * c - s;
        if (den <= 0.03) break;                              /* cakrawala tercapai */
        var t = o.camH / den, Z = t * (c + yc * s);
        if (Z > o.zMax) break;
        var k = 0;
        for (var x = x0; x <= x1; x++, k++) { var i = (y * W + x) * 4; rs[k] = d[i]; gs[k] = d[i + 1]; bs[k] = d[i + 2]; }
        var R = med(rs), G = med(gs), B = med(bs);
        rows.push({ z: Z, r: R, g: G, b: B, lab: lab(R, G, B) });
      }
      return rows;                                           /* Z naik (dekat → jauh) */
    }

    /* ---- warna dasar jalan dari tanah tepat di bawah kamera (±1–1,7 m) kedua sisi ---- */
    function seedFrom(rowsList) {
      var L = [], A = [], B = [];
      rowsList.forEach(function (rows) { rows.forEach(function (r) { if (r.z <= 1.7) { L.push(r.lab[0]); A.push(r.lab[1]); B.push(r.lab[2]); } }); });
      if (L.length < 4) return null;
      var m = [med(L), med(A), med(B)], dev = [];
      rowsList.forEach(function (rows) { rows.forEach(function (r) { if (r.z <= 1.7) dev.push(dE(r.lab, m)); }); });
      return { lab: m, sd: med(dev) * 1.4826 };
    }

    /* ---- label baris: R jalan · B terang(marka/beton) · V vegetasi · S tanah · D gelap · G abu-terang · X lain ---- */
    function labelRow(r, seed, T) {
      var L = r.lab[0], ch = Math.sqrt(r.lab[1] * r.lab[1] + r.lab[2] * r.lab[2]);
      var dd = dE(r.lab, seed.lab);
      if (dd <= T) return "R";
      /* H = aspal TERNAUNGI (bayangan pohon/bangunan): gelap tetapi rona (a,b) tetap mirip aspal */
      var dab = Math.abs(r.lab[1] - seed.lab[1]) + Math.abs(r.lab[2] - seed.lab[2]);
      if (L < seed.lab[0] - 8 && L >= 9 && ch < 14 && dab <= 6 + seed.sd * 0.5) return "H";
      /* O = objek berwarna biru dominan (mobil, atap seng biru, terpal) — bukan permukaan jalan */
      if (r.b > r.r + 25 && r.b > r.g + 15 && ch > 25) return "O";
      var yellow = r.lab[2] > 35 && L > 110 && r.lab[1] < 25;
      if (L - seed.lab[0] > 30 && (ch < 26 || yellow)) return "B";
      if (r.g > r.r + 7 && r.g > r.b + 7) return "V";
      if (r.r > r.b + 16 && r.r > r.g - 6 && L > 30 && ch > 14) return "S";
      if (L < seed.lab[0] - 14 || L < 22) return "D";
      if (ch < 20 && L - seed.lab[0] > 9) return "G";
      return "X";
    }
    function modeFilter(lbl) {
      var out = lbl.slice();
      for (var i = 2; i < lbl.length - 2; i++) {
        var cnt = {}, best = lbl[i], bn = 0;
        for (var j = i - 2; j <= i + 2; j++) { var q = lbl[j]; cnt[q] = (cnt[q] || 0) + 1; if (cnt[q] > bn) { bn = cnt[q]; best = q; } }
        out[i] = bn >= 3 ? best : lbl[i];
      }
      return out;
    }
    function toRuns(rows, lbl) {
      var runs = [], i = 0;
      while (i < rows.length) {
        var j = i; while (j + 1 < rows.length && lbl[j + 1] === lbl[i]) j++;
        var z0 = i ? (rows[i - 1].z + rows[i].z) / 2 : rows[i].z, z1 = j + 1 < rows.length ? (rows[j].z + rows[j + 1].z) / 2 : rows[j].z;
        runs.push({ c: lbl[i], z0: z0, z1: z1, len: z1 - z0, i0: i, i1: j });
        i = j + 1;
      }
      return runs;
    }
    function meanLab(rows, a, b) { var s = [0, 0, 0], n = 0; for (var i = Math.max(0, a); i <= Math.min(rows.length - 1, b); i++) { s[0] += rows[i].lab[0]; s[1] += rows[i].lab[1]; s[2] += rows[i].lab[2]; n++; } return n ? [s[0] / n, s[1] / n, s[2] / n] : null; }

    /* ---- analisis satu sisi: tepi jalan, garis marka, bahu, saluran ---- */
    function analyzeSide(rows, seed, o) {
      o = o || OPT;
      if (rows.length < 12) return null;
      var T = Math.max(13, seed.sd * 2.6 + 7), GAP = 0.5;
      var lbl = modeFilter(rows.map(function (r) { return labelRow(r, seed, T); }));
      var runs = toRuns(rows, lbl);
      if (!runs.length || runs[0].c !== "R") return null;         /* tanah dekat kamera bukan jalan → tak bisa dipercaya */
      var roadEnd = runs[0].z1, marks = [], k = 1, endIdx = runs[0].i1;
      var shaded = false;
      while (k < runs.length) {
        var r = runs[k], nx = runs[k + 1];
        if (r.c === "R") { roadEnd = r.z1; endIdx = r.i1; k++; continue; }
        /* bayangan menutupi sampai tepi: H panjang di ujung jalan dianggap masih aspal (keyakinan diturunkan) */
        if (r.c === "H" && r.len >= 0.5 && (!nx || nx.c !== "R")) { roadEnd = r.z1; endIdx = r.i1; shaded = true; k++; break; }
        if (nx && nx.c === "R" && r.len <= GAP) {                 /* sela pendek di antara aspal = marka/retak/tambalan */
          if (r.c === "B" && r.len >= 0.04 && r.len <= 0.45) marks.push({ z: (r.z0 + r.z1) / 2, w: r.len });
          k++; continue;
        }
        /* bayangan / benda sesaat di TENGAH jalan: rentetan H/D/X/G/B (tanpa tanah/rumput) lalu aspal lagi → tetap badan jalan */
        if (r.c === "H" || r.c === "D" || r.c === "X" || r.c === "G" || r.c === "B") {
          var j = k, solid = 0, okRun = true;
          while (j < runs.length && runs[j].c !== "R") {
            var cj = runs[j].c;
            if (cj !== "H" && cj !== "D" && cj !== "X" && cj !== "G" && cj !== "B") { okRun = false; break; }
            if (cj !== "H") solid += runs[j].len;
            j++;
          }
          var hadH = false; for (var q0 = k; q0 < j; q0++) if (runs[q0].c === "H") hadH = true;
          if (okRun && j < runs.length && runs[j].len >= (hadH ? 0.3 : 0.7) && solid <= 1.0 && (runs[j].z0 - r.z0) <= 4.5) {
            if (hadH) shaded = true;
            roadEnd = runs[j].z1; endIdx = runs[j].i1; k = j + 1; continue;
          }
        }

        if (r.c === "B" && r.len >= 0.04 && r.len <= 0.45 && (!nx || nx.c !== "B")) {   /* marka tepat di tepi → garis tepi */
          marks.push({ z: (r.z0 + r.z1) / 2, w: r.len, edge: true }); roadEnd = r.z1; endIdx = r.i1; k++; }
        break;
      }
      var hitMax = roadEnd >= rows[rows.length - 1].z - 0.25;     /* jalan menerus sampai batas pandang → tepi tak terlihat */
      /* garis tepi = marka terakhir yang dekat tepi; marka lain (di dalam) = marka tengah/pemisah lajur */
      var line = null, centre = false;
      marks.sort(function (a, b) { return a.z - b.z; });
      if (marks.length) {
        var last = marks[marks.length - 1];
        if (roadEnd - last.z <= 3.5 && last.z >= 0.5) { line = last; }
        marks.forEach(function (m) { if (m !== line && m.z >= 0.6 && m.z < roadEnd - 0.8) centre = true; });
      }
      var bahuPaved = line ? Math.max(0, roadEnd - line.z) : 0;
      var obstacle = !!(runs[k] && runs[k].c === "O" && runs[k].len >= 0.5);
      /* keyakinan tepi: kontras warna 0,5 m sebelum vs sesudah tepi */
      var conf = 0.2;
      if (!hitMax) {
        var before = meanLab(rows, endIdx - 8, endIdx - 1), after = meanLab(rows, endIdx + 2, endIdx + 9);
        var jump = before && after ? dE(before, after) : 0;
        conf = Math.max(0.2, Math.min(0.95, (jump - 6) / 24 + 0.2));
        if (roadEnd < 0.9) conf *= 0.5;
        /* uji konsistensi: ujung "jalan" harus semirip warna dasar aspal; bila menyimpang (mis. kerikil abu mirip aspal) → ragu */
        var tailRows = [];
        for (var ti = Math.max(0, endIdx - 14); ti <= endIdx; ti++) if (lbl[ti] === "R") tailRows.push(rows[ti]);
        if (tailRows.length >= 4) {
          var tl = [0, 0, 0]; tailRows.forEach(function (r) { tl[0] += r.lab[0]; tl[1] += r.lab[1]; tl[2] += r.lab[2]; });
          tl = [tl[0] / tailRows.length, tl[1] / tailRows.length, tl[2] / tailRows.length];
          if (dE(tl, seed.lab) > Math.max(6.5, T * 0.5)) conf *= 0.4;
        }
      }
      if (shaded) conf *= 0.85;
      if (obstacle) conf *= 0.4;
      /* bahu & saluran setelah tepi */
      var after2 = runs.filter(function (q) { return q.z0 >= roadEnd - 0.05 && q.i0 > endIdx - 1; });
      var bahu = 0, bahuType = "", sal = null, spent = 0, bahuOpen = false;
      for (var m = 0; m < after2.length && m < 6; m++) {
        var q = after2[m];
        if (q.len < 0.08) continue;
        if (q.z0 - roadEnd > 6.5) break;
        if (q.c === "V") {                                   /* rumput: langsung di tepi = tanpa bahu; setelah bahu tanah = batas luar */
          if (!bahu) bahuType = "tepi rumput";
          break;
        } else if (q.c === "S" || q.c === "X") {
          var take = Math.min(q.len, 3.2);
          bahu += take; bahuType = "tanah/kerikil";
          if (q.len > 3.2 || (q.i1 >= rows.length - 2 && q.len > 2.2)) { bahuOpen = true; break; }
        } else if (q.c === "G" || q.c === "B") {
          if (q.len >= 0.25 && q.len <= 1.05) { sal = { w: q.len, type: "beton/pasangan", at: q.z0 - roadEnd }; break; }
          if (q.len > 1.05 && !bahu) { bahu += Math.min(q.len, 3.2); bahuType = "kerikil/beton"; }
          break;
        } else if (q.c === "O" || q.c === "H") {              /* objek biru / bayangan di luar tepi: tak bisa dipercaya → berhenti */
          break;
        } else if (q.c === "D") {
          var nxq = after2[m + 1], prevOK = bahu > 0 || m === 0;
          if (q.len >= 0.2 && q.len <= 1.6 && prevOK && (nxq || q.z1 < rows[rows.length - 1].z - 0.3)) { sal = { w: q.len, type: "tanah/berair", at: q.z0 - roadEnd }; }
          break;
        } else break;
        spent++;
      }
      var salConf = sal ? (sal.type === "beton/pasangan" ? 0.55 : 0.4) : 0;
      return {
        edge: roadEnd, hitMax: hitMax, conf: conf, marks: marks, line: line ? line.z : null, centre: centre, shaded: shaded, obstacle: obstacle, bahuOpen: bahuOpen,
        bahuPaved: bahuPaved, bahuLoose: bahu, bahuType: bahuPaved > 0.25 ? (bahu > 0.2 ? "aspal + " + bahuType : "aspal") : bahuType,
        sal: sal, salConf: salConf, errAtEdge: 0.6 * roadEnd * roadEnd / (o.camH * ((o.size / 2) / Math.tan(o.fov * D2R / 2))) + 0.03 * roadEnd
      };
    }

    /* ---- MARKA: menerus vs putus-putus dibedakan dari KONSISTENSI antar kolom foto (menerus = hadir di ≥80% kolom;
       putus-putus = hadir di sebagian kolom). Marka berdekatan ≤0,5 m = ganda. ---- */
    function markClusters(cols) {
      var all = [], n = cols.length; cols.forEach(function (q, ci) { (q.marks || []).forEach(function (m) { if (m.z >= 0.4) all.push({ z: m.z, w: m.w, ci: ci }); }); });
      all.sort(function (a, b) { return a.z - b.z; });
      var cl = []; all.forEach(function (m) { var c = cl[cl.length - 1]; if (c && Math.abs(m.z - c.zs[c.zs.length - 1]) <= 0.35) { c.zs.push(m.z); c.ws.push(m.w); c.cs[m.ci] = 1; } else { var cs = {}; cs[m.ci] = 1; cl.push({ zs: [m.z], ws: [m.w], cs: cs }); } });
      return cl.map(function (c) { var k = Object.keys(c.cs).length; return { z: med(c.zs), w: med(c.ws), k: k, frac: k / n, solid: k / n >= 0.8 }; }).filter(function (c) { return n < 4 || c.k >= 2; });
    }
    function classifyMarks(mL, mR, eL, eR) {
      var W = eL + eR; if (!(W > 0)) return null;
      function outer(ms, e) { var b = null; (ms || []).forEach(function (m) { if (e - m.z <= 3.0 && (!b || m.z > b.z)) b = m; }); return b; }
      var bl = outer(mL, eL), br = outer(mR, eR);
      function T(m) { return m.solid ? "menerus" : "putus-putus"; }
      var pts = [];
      (mL || []).forEach(function (m) { if (m !== bl) pts.push({ x: -m.z, m: m }); });
      (mR || []).forEach(function (m) { if (m !== br) pts.push({ x: m.z, m: m }); });
      pts.sort(function (a, b) { return a.x - b.x; });
      var groups = []; pts.forEach(function (p) { var g = groups[groups.length - 1]; if (g && p.x - g.xs[g.xs.length - 1] <= 0.5) { g.xs.push(p.x); g.ms.push(p.m); } else groups.push({ xs: [p.x], ms: [p.m] }); });
      var div = groups.map(function (g) {
        var x = med(g.xs), dbl = g.ms.length >= 2, sol = g.ms.filter(function (m) { return m.solid; }).length, t;
        if (dbl) t = sol === g.ms.length ? "ganda menerus" : sol ? "menerus + putus" : "ganda putus-putus";
        else { t = T(g.ms[0]); if (g.ms[0].w >= 0.3 && g.ms[0].solid) { t = "ganda menerus"; dbl = true; } }
        return { f: (eL + x) / W, t: t, dbl: dbl };
      });
      return { eL: bl ? { t: T(bl), f: (eL - bl.z) / W } : null, eR: br ? { t: T(br), f: (eL + br.z) / W } : null, div: div, lanes: div.length + 1 };
    }

    /* ---- gabungkan sisi kiri + kanan ---- */
    var COLS = [0, -0.11, 0.11, -0.22, 0.22];
    /* analisis tiap kolom lalu ambil KONSENSUS: tepi = median kolom yang sepakat; mobil/pohon/orang yang hanya
       menutupi sebagian kolom tidak lagi memotong lebar jalan. */
    function analyzeMulti(lists, seed, o) {
      var res = lists.map(function (rows) { return analyzeSide(rows, seed, o); }).filter(Boolean);
      if (!res.length) return null;
      var valid = res.filter(function (q) { return !q.hitMax; });
      if (valid.length * 2 <= res.length) return res.filter(function (q) { return q.hitMax; })[0] || res[0];   /* mayoritas tak melihat tepi */
      var m0 = med(valid.map(function (q) { return q.edge; })), tol = Math.max(0.45, 0.09 * m0);
      var inl = valid.filter(function (q) { return Math.abs(q.edge - m0) <= tol; });
      var base = inl.slice().sort(function (a, b) { return b.conf - a.conf; })[0];
      var out = Object.assign({}, base);
      out.edge = med(inl.map(function (q) { return q.edge; }));
      out.bahuPaved = med(inl.map(function (q) { return q.bahuPaved; }));
      out.bahuLoose = med(inl.map(function (q) { return q.bahuLoose; }));
      var sals = inl.filter(function (q) { return q.sal; });
      if (sals.length * 2 >= inl.length && sals.length) { out.sal = { w: med(sals.map(function (q) { return q.sal.w; })), type: sals[0].sal.type, at: med(sals.map(function (q) { return q.sal.at; })) }; out.salConf = med(sals.map(function (q) { return q.salConf; })); }
      else { out.sal = null; out.salConf = 0; }
      var lines = inl.filter(function (q) { return q.line != null; });
      out.line = lines.length * 2 >= inl.length && lines.length ? med(lines.map(function (q) { return q.line; })) : null;
      var agree = inl.length / res.length;                               /* 1 = semua kolom sepakat */
      out.conf = Math.max(0.15, Math.min(0.97, base.conf * (0.72 + 0.28 * agree) + (inl.length >= 4 ? 0.04 : 0)));
      if (agree < 0.5) out.conf *= 0.7;
      out.marks = markClusters(inl);
      out.nCol = res.length; out.nAgree = inl.length;
      out.bahuOpen = inl.filter(function (q) { return q.bahuOpen; }).length * 2 >= inl.length; out.shaded = inl.some(function (q) { return q.shaded; }); out.obstacle = inl.filter(function (q) { return q.obstacle; }).length * 2 > inl.length;
      return out;
    }
    function measurePair(left, right, o) {
      o = o || OPT;
      var xs = o.cols || COLS;
      var rlL = xs.map(function (x) { return profile(left, o, x, 0.045); }), rlR = xs.map(function (x) { return profile(right, o, x, 0.045); });
      var seed = seedFrom(rlL.concat(rlR));
      if (!seed) return null;
      var L = analyzeMulti(rlL, seed, o), R = analyzeMulti(rlR, seed, o);
      if (!L && !R) return null;
      var out = { eL: L ? L.edge : null, eR: R ? R.edge : null, L: L, R: R, seed: seed };
      var okL = L && !L.hitMax && !L.obstacle, okR = R && !R.hitMax && !R.obstacle;
      if (okL && okR) {
        out.W = L.edge + R.edge;
        out.Wcar = (L.line != null && R.line != null) ? L.line + R.line : null;
        out.conf = Math.min(L.conf, R.conf);
        out.err = Math.sqrt(L.errAtEdge * L.errAtEdge + R.errAtEdge * R.errAtEdge);
      } else { out.W = null; out.Wcar = null; out.conf = 0.15; out.err = null; }
      out.mark = !!((L && L.centre) || (R && R.centre));
      out.mkc = (okL && okR) ? classifyMarks(L.marks, R.marks, L.edge, R.edge) : null;
      out.surfaceL = seed.lab[0] > 62 ? "beton/rigid" : "aspal";
      return out;
    }
    return { OPT: OPT, lab: lab, dE: dE, med: med, profile: profile, seedFrom: seedFrom, analyzeSide: analyzeSide, analyzeMulti: analyzeMulti, measurePair: measurePair, markClusters: markClusters, classifyMarks: classifyMarks };
  })();

  if (typeof module !== "undefined" && module.exports) { module.exports = { CORE: CORE }; }
  if (typeof document === "undefined") return;

  /* ==================================================================================
     BAGIAN 2 — BROWSER: pengambilan foto, penyaringan, HUD, penyimpanan
     ================================================================================== */
  var K_ON = "pq_dim_on", K_STEP = "pq_dim_step", K_K = "pq_dim_k", K_DB = "pq_dim_v1", K_Q = "pq_dim_quota", K_MIN = "pq_dim_min", K_CAP = "pq_dim_cap";
  function jget(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var on = jget(K_ON, 1) !== 0, STEP = jget(K_STEP, 30), KCAL = jget(K_K, 1), minimized = !!jget(K_MIN, 0), CAP = jget(K_CAP, 3000);
  var DB = jget(K_DB, {});                                   /* { roadId: { name, s:[...] } } */
  var busy = false, last = null, lastT = 0, pend = null, hist = [], curRoad = null, mode = "live", wasActive = false, lastShown = null;
  var osmCache = {}, osmNow = null, noPano = 0;

  function $(id) { return document.getElementById(id); }
  function RA() { try { return typeof routeAnim !== "undefined" ? routeAnim : null; } catch (e) { return null; } }
  function svOpen() { var o = $("svOverlay"); return !!(o && o.classList.contains("show")); }
  function toast_(m, err) { try { if (typeof toast === "function") toast(m, !!err); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function meters(a, b) {
    var r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lng - a.lng) * r;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return 12742000 * Math.asin(Math.sqrt(h));
  }
  function apiKey() { try { return typeof getApiKey === "function" ? getApiKey() : ""; } catch (e) { return ""; } }
  function monthKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1); }
  function quota() { var q = jget(K_Q, null); if (!q || q.m !== monthKey()) q = { m: monthKey(), n: 0 }; return q; }
  function quotaAdd(n) { var q = quota(); q.n += n; jset(K_Q, q); return q; }

  /* ---------- foto Street View Static (2 permintaan gambar = 2 kuota; metadata gratis) ---------- */
  var metaFn = null, imgFn = null;
  async function meta(lat, lng) {
    if (metaFn) return metaFn(lat, lng);
    var u = "https://maps.googleapis.com/maps/api/streetview/metadata?location=" + lat.toFixed(6) + "," + lng.toFixed(6) + "&radius=25&source=outdoor&key=" + encodeURIComponent(apiKey());
    var r = await fetch(u); if (!r.ok) throw new Error("metadata HTTP " + r.status);
    return r.json();
  }
  function loadImg(url) {
    return new Promise(function (res, rej) {
      var im = new Image(); im.crossOrigin = "anonymous";
      im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("gagal memuat foto")); }; im.src = url;
    });
  }
  async function svImage(pano, heading) {
    if (imgFn) return imgFn(pano, heading);
    var O = CORE.OPT;
    var u = "https://maps.googleapis.com/maps/api/streetview?size=" + O.size + "x" + O.size + "&pano=" + encodeURIComponent(pano) + "&heading=" + (((heading % 360) + 360) % 360).toFixed(1) + "&pitch=" + O.pitch + "&fov=" + O.fov + "&source=outdoor&return_error_code=true&key=" + encodeURIComponent(apiKey());
    var im = await loadImg(u), cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    var cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(im, 0, 0);
    try { return cx.getImageData(0, 0, cv.width, cv.height); } catch (e) { var er = new Error("cors"); er.cors = true; throw er; }
  }

  /* ---------- pembanding OSM (lebar/lajur/kelas) — opsional, 1× per ±300 m ---------- */
  var HW_RANK = { motorway: 1, trunk: 2, primary: 3, secondary: 4, tertiary: 5, unclassified: 6, residential: 7, living_street: 8, service: 9 };
  var HW_W = { motorway: 14, trunk: 9, primary: 7.5, secondary: 7, tertiary: 6, unclassified: 5, residential: 4.5, living_street: 4, service: 3.5 };
  async function osmPrior(lat, lng, name) {
    var cell = lat.toFixed(3) + "," + lng.toFixed(3);
    if (osmCache[cell] !== undefined) return osmCache[cell];
    osmCache[cell] = null;
    try {
      var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, 7000);
      var q = "[out:json][timeout:8];way(around:35," + lat.toFixed(6) + "," + lng.toFixed(6) + ")[highway];out tags;";
      var r = await fetch("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(q), { signal: ctl.signal }); clearTimeout(to);
      var j = await r.json(), best = null, bs = -1;
      var toks = String(name || "").toLowerCase().split(/[^a-z0-9]+/).filter(function (t) { return t.length > 2 && t !== "jalan"; });
      (j.elements || []).forEach(function (e) {
        var t = e.tags || {}, hw = t.highway; if (!HW_RANK[hw]) return;
        var sc = 10 - HW_RANK[hw], nm = String(t.name || "").toLowerCase();
        toks.forEach(function (tk) { if (nm.indexOf(tk) >= 0) sc += 6; });
        if (sc > bs) { bs = sc; best = t; }
      });
      if (best) {
        var w = parseFloat(String(best.width || "").replace(",", ".")), ln = parseInt(best.lanes, 10);
        osmCache[cell] = { hw: best.highway, width: isFinite(w) ? w : null, lanes: isFinite(ln) ? ln : null, surface: best.surface || "", name: best.name || "" };
      }
    } catch (e) {}
    return osmCache[cell];
  }
  function priorWidth(p) {
    if (!p) return null;
    if (p.width) return { w: p.width, src: "OSM (lebar tercatat)" };
    if (p.lanes) return { w: p.lanes * 3.25, src: "OSM (" + p.lanes + " lajur)" };
    if (HW_W[p.hw]) return { w: HW_W[p.hw], src: "perkiraan kelas jalan (" + p.hw + ")" };
    return null;
  }

  /* ---------- penyaringan antar titik: median + buang outlier ---------- */
  function fnum(arr, key) { return arr.map(function (x) { return x[key]; }).filter(function (v) { return typeof v === "number" && isFinite(v); }); }
  function smooth(entry) {
    hist.push(entry); if (hist.length > 7) hist.shift();
    var h = hist.slice(-5);
    function mm(key) { var v = fnum(h, key); return v.length ? CORE.med(v) : null; }
    var W = mm("W"), good = fnum(h, "W").length;
    /* titik yang menyimpang >35% dari median dengan keyakinan rendah dianggap outlier */
    if (W != null && entry.W != null && Math.abs(entry.W - W) / W > 0.35 && entry.conf < 0.6 && good >= 3) entry = hist[hist.length - 1] = Object.assign({}, entry, { W: W, outlier: true });
    return {
      W: mm("W"), Wcar: mm("Wcar"), eL: mm("eL"), eR: mm("eR"), bl: mm("bl"), br: mm("br"),
      sl: h.filter(function (x) { return x.sl; }).length >= Math.ceil(h.length / 2) ? lastOf(h, "sl") : null,
      sr: h.filter(function (x) { return x.sr; }).length >= Math.ceil(h.length / 2) ? lastOf(h, "sr") : null,
      blT: lastOf(h, "blT"), brT: lastOf(h, "brT"),
      mark: h.filter(function (x) { return x.mark; }).length >= Math.ceil(h.length / 2),
      conf: mm("conf") || 0, err: mm("err"), surface: entry.surface, src: entry.src, date: entry.date, n: good
    };
  }
  function lastOf(h, key) { for (var i = h.length - 1; i >= 0; i--) if (h[i][key]) return h[i][key]; return null; }

  /* ---------- satu siklus pengukuran pada titik c ---------- */
  async function measureAt(c, a) {
    var key = apiKey(); if (!key) return;
    var q = quota();
    if (q.n + 2 > CAP) { on = false; jset(K_ON, 0); syncBtn(); toast_("Dimensi jalan: batas kuota foto bulan ini (" + CAP + ") tercapai — dihentikan", true); return; }
    var m = await meta(c.lat, c.lng);
    if (!m || m.status !== "OK" || !m.pano_id) { noPano++; paintHud(null, c, "Tidak ada foto Street View di titik ini"); return; }
    quotaAdd(2);
    var left = await svImage(m.pano_id, c.rh - 90), right = await svImage(m.pano_id, c.rh + 90);
    var res = CORE.measurePair(left, right, CORE.OPT);
    var prior = priorWidth(await osmPrior(c.lat, c.lng, c.name));
    var entry = { conf: 0, mark: false, surface: "aspal", date: m.date || "" };
    if (res) {
      var k = KCAL || 1, L = res.L, R = res.R;
      entry = {
        W: res.W != null ? res.W * k : null, Wcar: res.Wcar != null ? res.Wcar * k : null,
        eL: res.eL != null ? res.eL * k : null, eR: res.eR != null ? res.eR * k : null,
        bl: L && !L.hitMax ? (L.bahuPaved + L.bahuLoose) * k : null, br: R && !R.hitMax ? (R.bahuPaved + R.bahuLoose) * k : null,
        blT: L && L.bahuType || "", brT: R && R.bahuType || "",
        sl: L && L.sal && L.salConf >= 0.4 ? { w: L.sal.w * k, type: L.sal.type } : null,
        sr: R && R.sal && R.salConf >= 0.4 ? { w: R.sal.w * k, type: R.sal.type } : null,
        mark: res.mark, conf: res.conf, err: res.err != null ? res.err * k : null, surface: res.surfaceL, date: m.date || ""
      };
    }
    entry.src = entry.W != null && entry.conf >= 0.45 ? "terukur dari foto" : prior ? prior.src : "tidak terbaca";
    var sm = smooth(entry);
    if ((sm.W == null || sm.conf < 0.45) && prior) { sm.Wprior = prior.w; sm.src = prior.src; }
    else sm.src = entry.conf >= 0.45 ? "terukur dari foto" : sm.src;
    lastShown = sm;
    store(c, a, sm);
    paintHud(sm, c);
  }

  /* ---------- penyimpanan per ruas ---------- */
  function roadId(a) { return (a && a.road && (a.road.id || a.road.name)) || "ruas"; }
  function store(c, a, sm) {
    if (sm.W == null && !sm.sl && !sm.sr && sm.bl == null && sm.br == null) return;
    var id = roadId(a), r = DB[id] || (DB[id] = { name: c.name, s: [] }), t = Math.round(a.traveledDist || 0);
    r.name = c.name;
    r.s = r.s.filter(function (x) { return Math.abs(x[0] - t) > 6; });
    r.s.push([t, +c.lat.toFixed(6), +c.lng.toFixed(6), c.sta, sm.W != null ? +sm.W.toFixed(2) : null, sm.Wcar != null ? +sm.Wcar.toFixed(2) : null,
      sm.bl != null ? +sm.bl.toFixed(2) : null, sm.br != null ? +sm.br.toFixed(2) : null,
      sm.sl ? +sm.sl.w.toFixed(2) : 0, sm.sr ? +sm.sr.w.toFixed(2) : 0, sm.mark ? 1 : 0, +sm.conf.toFixed(2), sm.src || "", sm.sl ? sm.sl.type : "", sm.sr ? sm.sr.type : ""]);
    r.s.sort(function (x, y) { return x[0] - y[0]; });
    if (r.s.length > 1500) r.s = r.s.slice(-1500);
    var keys = Object.keys(DB); if (keys.length > 40) delete DB[keys[0]];
    jset(K_DB, DB);
  }
  function stats(id) {
    var r = DB[id]; if (!r || !r.s.length) return null;
    var s = r.s, n = s.length, cover = [], i;
    for (i = 0; i < n; i++) {
      var p = i ? s[i - 1][0] : s[i][0] - STEP / 2, nx = i < n - 1 ? s[i + 1][0] : s[i][0] + STEP / 2;
      cover.push(Math.min(Math.max(0, (nx - p) / 2), STEP * 1.6));
    }
    var tot = 0, sl = 0, sr = 0, W = [], bl = [], br = [], minW = null, minSta = "", marks = 0;
    for (i = 0; i < n; i++) {
      tot += cover[i]; if (s[i][8] > 0) sl += cover[i]; if (s[i][9] > 0) sr += cover[i];
      if (s[i][4] != null) { W.push(s[i][4]); if (minW == null || s[i][4] < minW) { minW = s[i][4]; minSta = s[i][3]; } }
      if (s[i][6] != null) bl.push(s[i][6]); if (s[i][7] != null) br.push(s[i][7]); if (s[i][10]) marks++;
    }
    function q(a, p) { if (!a.length) return null; var t = a.slice().sort(function (x, y) { return x - y; }); return t[Math.min(t.length - 1, Math.floor(p * t.length))]; }
    return { name: r.name, n: n, len: tot, sl: sl, sr: sr, slPct: tot ? sl / tot * 100 : 0, srPct: tot ? sr / tot * 100 : 0,
      W: CORE.med(W), Wmin: minW, WminSta: minSta, Wmax: q(W, 0.98), bl: CORE.med(bl), br: CORE.med(br), markPct: n ? marks / n * 100 : 0 };
  }

  /* ---------- HUD di dalam Street View ---------- */
  function injectCss() {
    if ($("pq-dim-css")) return;
    var st = document.createElement("style"); st.id = "pq-dim-css";
    st.textContent =
      "#pqDimHud{position:absolute;z-index:5;left:8px;bottom:calc(76px + env(safe-area-inset-bottom,0px));width:min(330px,calc(100% - 16px));box-sizing:border-box;background:#080c14d9;border:1px solid #22d3ee59;border-radius:14px;padding:7px 10px 9px;color:#e6edf5;font:11px/1.35 var(--mono,system-ui,sans-serif);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:none;box-shadow:0 10px 28px #0008}" +
      "#pqDimHud.show{display:block}" +
      "@media(min-width:861px){#pqDimHud{left:auto;right:14px;bottom:84px}}" +
      "#pqDimHud .dh{display:flex;align-items:center;gap:6px;margin-bottom:5px}" +
      "#pqDimHud .dh b{flex:1;color:#22d3ee;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#pqDimHud .dh b:before{content:'';display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:#22d3ee;box-shadow:0 0 8px #22d3ee;vertical-align:1px}" +
      "#pqDimHud.rec .dh b:before{animation:pqDimPulse 1s ease-in-out infinite}@keyframes pqDimPulse{50%{opacity:.3;transform:scale(.7)}}" +
      "#pqDimHud button{background:#ffffff12;border:1px solid #ffffff22;color:#e6edf5;border-radius:7px;font:700 10px var(--mono,system-ui);padding:3px 7px;cursor:pointer}" +
      "#pqDimHud button:hover{border-color:#22d3ee;color:#22d3ee}" +
      "#pqDimHud .big{display:flex;align-items:baseline;gap:6px;margin:2px 0 3px}#pqDimHud .big b{font-size:22px;color:#fff;font-variant-numeric:tabular-nums}#pqDimHud .big small{color:#9db3c9;font-size:10px}" +
      "#pqDimHud .g{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px}#pqDimHud .g div{display:flex;justify-content:space-between;gap:6px}#pqDimHud .g span{opacity:.72}#pqDimHud .g b{font-variant-numeric:tabular-nums;text-align:right}" +
      "#pqDimHud .sub{margin-top:5px;color:#9db3c9;font-size:10px}#pqDimHud svg{display:block;width:100%;height:auto;margin:3px 0}" +
      "#pqDimHud .ok{color:#34d399}#pqDimHud .mid{color:#facc15}#pqDimHud .lo{color:#f59e0b}#pqDimHud .nil{color:#7c8aa0}" +
      "#pqDimHud.min .body{display:none}" +
      "@media(max-width:860px){#svOverlay.mode-split #pqDimHud svg{display:none}#svOverlay.mode-split #pqDimHud{padding:5px 8px 6px}}" +
      "#pqDimBtn.active{background:var(--cyan,#22d3ee);color:#04121a;border-color:var(--cyan,#22d3ee)}";
    document.head.appendChild(st);
  }
  function ensureHud() {
    var hud = $("pqDimHud"); if (hud) return hud;
    var wrap = $("svFrameWrap"); if (!wrap) return null;
    hud = document.createElement("div"); hud.id = "pqDimHud";
    wrap.appendChild(hud);
    hud.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      var act = b.getAttribute("data-a");
      if (act === "min") { minimized = !minimized; jset(K_MIN, minimized ? 1 : 0); applyMin(); }
      else if (act === "mode") { mode = mode === "live" ? "recap" : "live"; repaint(); }
      else if (act === "step") { var o = [20, 30, 50, 100], i = o.indexOf(STEP); STEP = o[(i + 1) % o.length]; jset(K_STEP, STEP); repaint(); toast_("Interval ukur dimensi: tiap " + STEP + " m"); }
      else if (act === "cal") calibrate();
      else if (act === "csv") downloadCsv();
    });
    ["touchstart", "pointerdown", "mousedown", "wheel"].forEach(function (ev) { hud.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
    return hud;
  }
  function applyMin() { var h = $("pqDimHud"); if (h) h.classList.toggle("min", minimized); }
  function f1(v) { return v == null || !isFinite(v) ? "—" : v.toFixed(1) + " m"; }
  function confCls(c) { return c >= 0.7 ? "ok" : c >= 0.45 ? "mid" : "lo"; }
  function confTxt(c) { return c >= 0.7 ? "tinggi" : c >= 0.45 ? "sedang" : "rendah"; }

  /* penampang melintang (skema) */
  function section(sm) {
    var eL = sm.eL, eR = sm.eR; if (eL == null || eR == null) return "";
    var bl = sm.bl || 0, br = sm.br || 0, sl = sm.sl ? sm.sl.w : 0, sr = sm.sr ? sm.sr.w : 0;
    var total = sl + bl + eL + eR + br + sr, Wd = 300, pad = 6, sc = (Wd - pad * 2) / Math.max(total, 4), x = pad, o = "";
    function seg(w, col, label) { if (w <= 0) return; var ww = w * sc; o += '<rect x="' + x.toFixed(1) + '" y="14" width="' + ww.toFixed(1) + '" height="20" fill="' + col + '"/>'; if (label && ww > 20) o += '<text x="' + (x + ww / 2).toFixed(1) + '" y="48" text-anchor="middle" font-size="8.5" fill="#cfe0f0">' + label + "</text>"; x += ww; }
    seg(sl, "#38bdf8", sl.toFixed(1)); seg(bl, "#a8896a", bl.toFixed(1));
    var roadX = x; seg(eL, "#475569", ""); var camX = x; seg(eR, "#475569", ""); var roadW = x - roadX;
    o += '<text x="' + (roadX + roadW / 2).toFixed(1) + '" y="48" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff">' + (eL + eR).toFixed(1) + " m</text>";
    if (sm.mark) o += '<line x1="' + (roadX + roadW / 2).toFixed(1) + '" x2="' + (roadX + roadW / 2).toFixed(1) + '" y1="16" y2="32" stroke="#fde68a" stroke-width="1.6" stroke-dasharray="3 3"/>';
    seg(br, "#a8896a", br.toFixed(1)); seg(sr, "#38bdf8", sr.toFixed(1));
    o += '<path d="M' + camX.toFixed(1) + ' 6 l-4 -6 h8z" fill="#22d3ee"/><text x="' + camX.toFixed(1) + '" y="62" text-anchor="middle" font-size="7.5" fill="#22d3ee">posisi kendaraan</text>';
    o += '<text x="4" y="10" font-size="8" fill="#9db3c9">KIRI</text><text x="' + (Wd - 4) + '" y="10" font-size="8" text-anchor="end" fill="#9db3c9">KANAN</text>';
    return '<svg viewBox="0 0 ' + Wd + ' 66" role="img" aria-label="Penampang melintang jalan">' + o + "</svg>";
  }
  function bahuTxt(v, t) { if (v == null) return "—"; if (v < 0.15) return /rumput/.test(t || "") ? "tepi rumput" : "tidak ada"; return f1(v); }
  function salTxt(s) { return s ? "ada " + s.w.toFixed(1) + " m" : "tidak terdeteksi"; }

  function paintHud(sm, c, msg) {
    var hud = ensureHud(); if (!hud) return;
    var a = RA(), show = svOpen() && (a || mode === "recap") && on;
    hud.classList.toggle("show", !!show); if (!show) return;
    hud.classList.toggle("rec", !!(a && a.playing)); applyMin();
    var id = a ? roadId(a) : curRoad, st = id ? stats(id) : null, h = "";
    var title = "Dimensi Jalan" + (c ? " • STA " + esc(c.sta) : "");
    var head = '<div class="dh"><b>' + title + "</b>" +
      '<button data-a="mode" title="Ganti tampilan live / rekap ruas">' + (mode === "live" ? "Rekap" : "Live") + "</button>" +
      '<button data-a="min" title="Ciutkan/tampilkan">' + (minimized ? "▲" : "▼") + "</button></div>";
    if (mode === "recap" && st) {
      h = '<div class="body"><div class="big"><b>' + f1(st.W) + '</b><small>lebar jalan median · ' + st.n + " titik · " + (st.len / 1000).toFixed(2) + " km terbaca</small></div>" +
        '<div class="g"><div><span>Terkecil</span><b>' + f1(st.Wmin) + "</b></div><div><span>di STA</span><b>" + esc(st.WminSta || "—") + "</b></div>" +
        "<div><span>Bahu kiri</span><b>" + f1(st.bl) + "</b></div><div><span>Bahu kanan</span><b>" + f1(st.br) + "</b></div>" +
        "<div><span>Saluran kiri</span><b>" + Math.round(st.sl) + " m (" + Math.round(st.slPct) + "%)</b></div><div><span>Saluran kanan</span><b>" + Math.round(st.sr) + " m (" + Math.round(st.srPct) + "%)</b></div>" +
        "<div><span>Marka tengah</span><b>" + Math.round(st.markPct) + "% titik</b></div><div><span>Interval</span><b>" + STEP + " m</b></div></div>" +
        '<div class="sub">' + esc(st.name) + ' · kiri/kanan menurut arah animasi · <button data-a="csv">Unduh CSV</button> <button data-a="step">Interval ' + STEP + " m</button></div></div>";
    } else if (mode === "recap") {
      h = '<div class="body"><div class="sub">Belum ada data dimensi untuk ruas ini. Putar animasi dengan Street View terbuka.</div></div>';
    } else if (sm) {
      var wv = sm.W != null && sm.conf >= 0.45 ? sm.W : sm.W != null ? sm.W : sm.Wprior, approx = !(sm.W != null && sm.conf >= 0.45);
      var w2 = sm.Wcar != null ? " · lajur efektif " + sm.Wcar.toFixed(1) + " m" : "";
      h = '<div class="body">' + section(sm) +
        '<div class="big"><b class="' + confCls(sm.conf) + '">' + (approx && wv != null ? "≈ " : "") + f1(wv) + "</b><small>lebar jalan" + w2 + (sm.err != null && !approx ? " · ±" + Math.max(0.2, sm.err).toFixed(1) + " m" : "") + "</small></div>" +
        '<div class="g"><div><span>Bahu kiri</span><b>' + (sm.bl != null ? f1(sm.bl) : "—") + "</b></div><div><span>Bahu kanan</span><b>" + (sm.br != null ? f1(sm.br) : "—") + "</b></div>" +
        "<div><span>Saluran kiri</span><b>" + salTxt(sm.sl) + "</b></div><div><span>Saluran kanan</span><b>" + salTxt(sm.sr) + "</b></div>" +
        (st ? "<div><span>Σ saluran kiri</span><b>" + Math.round(st.sl) + " m (" + Math.round(st.slPct) + "%)</b></div><div><span>Σ saluran kanan</span><b>" + Math.round(st.sr) + " m (" + Math.round(st.srPct) + "%)</b></div>" : "") +
        "</div>" +
        '<div class="sub">' + (sm.surface ? esc(sm.surface) + " · " : "") + "marka tengah " + (sm.mark ? "terbaca" : "tidak terbaca") + " · keyakinan <b class=\"" + confCls(sm.conf) + '">' + confTxt(sm.conf) + "</b> · " + esc(sm.src || "") + (sm.date ? " · foto " + esc(sm.date) : "") +
        '<br><button data-a="step">Tiap ' + STEP + ' m</button> <button data-a="cal" title="Isi lebar jalan sebenarnya untuk mengkalibrasi hasil">Kalibrasi</button></div></div>';
    } else {
      h = '<div class="body"><div class="sub">' + esc(msg || "Mengukur dimensi jalan…") + "</div></div>";
    }
    hud.innerHTML = head + h;
  }
  function repaint() { var a = RA(), c = a && window.PQSvAuto ? PQSvAuto.info(a) : null; paintHud(lastShown, c); }

  /* ---------- kalibrasi & ekspor ---------- */
  function calibrate() {
    if (!lastShown || lastShown.W == null) { toast_("Belum ada hasil ukur untuk dikalibrasi", true); return; }
    var raw = lastShown.W / (KCAL || 1);
    var v = prompt("Lebar jalan SEBENARNYA di titik ini (meter)?\nSaat ini terbaca " + lastShown.W.toFixed(1) + " m.\nIsi 0 untuk mengembalikan ke bawaan.", lastShown.W.toFixed(1));
    if (v == null) return;
    var n = parseFloat(String(v).replace(",", "."));
    if (!isFinite(n) || n < 0) return;
    KCAL = n === 0 ? 1 : Math.max(0.6, Math.min(1.6, n / raw)); jset(K_K, KCAL);
    hist = []; toast_("Kalibrasi disimpan (faktor " + KCAL.toFixed(2) + "×) — berlaku untuk titik berikutnya");
  }
  function downloadCsv() {
    var a = RA(), id = a ? roadId(a) : curRoad, r = id && DB[id]; if (!r || !r.s.length) { toast_("Belum ada data dimensi", true); return; }
    var head = ["ruas", "jarak_m", "sta", "lat", "lng", "lebar_jalan_m", "lebar_lajur_efektif_m", "bahu_kiri_m", "bahu_kanan_m", "saluran_kiri_m", "saluran_kanan_m", "jenis_saluran_kiri", "jenis_saluran_kanan", "marka_tengah", "keyakinan", "sumber"];
    var rows = r.s.map(function (x) { return [r.name, x[0], x[3], x[1], x[2], x[4], x[5], x[6], x[7], x[8], x[9], x[13], x[14], x[10] ? "ya" : "tidak", x[11], x[12]]; });
    var csv = [head].concat(rows).map(function (l) { return l.map(function (v) { v = v == null ? "" : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\n");
    var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), u = URL.createObjectURL(blob), el = document.createElement("a");
    el.href = u; el.download = "dimensi-jalan-" + String(r.name).replace(/[^\w]+/g, "_").slice(0, 40) + ".csv"; document.body.appendChild(el); el.click();
    setTimeout(function () { URL.revokeObjectURL(u); el.remove(); }, 800);
  }

  /* ---------- tombol di panel pemutar ---------- */
  function syncBtn() { var b = $("pqDimBtn"); if (!b) return; b.classList.toggle("active", on); b.title = "Ukur dimensi jalan otomatis (lebar, bahu, saluran): " + (on ? "ON" : "OFF"); }
  function addBtn() {
    var bar = $("routePlayerBar"); if (!bar || $("pqDimBtn")) return !!bar;
    var b = document.createElement("button"); b.className = "rp-btn"; b.id = "pqDimBtn"; b.innerHTML = '<i class="fa-solid fa-ruler-combined"></i>';
    b.addEventListener("click", function (e) {
      e.stopPropagation(); on = !on; jset(K_ON, on ? 1 : 0); syncBtn(); last = null; pend = null; hist = [];
      toast_(on ? "Ukur dimensi jalan: ON (butuh Street View terbuka)" : "Ukur dimensi jalan: OFF");
      if (!on) { var h = $("pqDimHud"); if (h) h.classList.remove("show"); }
    });
    var sv = $("pqSvAutoBtn"), stop = bar.querySelector(".rp-btn.danger");
    bar.insertBefore(b, sv ? sv.nextSibling : stop || null); syncBtn(); return true;
  }

  /* ---------- siklus utama ---------- */
  function step() {
    addBtn(); injectCss();
    if (document.hidden) return;
    var a = RA();
    if (!a) {
      if (wasActive) { wasActive = false; if (curRoad && stats(curRoad)) { mode = "recap"; toast_("Rekap dimensi jalan siap — lihat panel di Street View"); } last = null; pend = null; hist = []; }
      if (svOpen() && mode === "recap") paintHud(null, null); else { var h0 = $("pqDimHud"); if (h0) h0.classList.remove("show"); }
      return;
    }
    if (!wasActive) { wasActive = true; mode = "live"; hist = []; last = null; }
    curRoad = roadId(a);
    if (!on || !svOpen() || busy || !window.PQSvAuto) return;
    var c = PQSvAuto.info(a); if (!c) return;
    var now = Date.now(), moved = last ? meters(last, c) : Infinity, go = false;
    if (a.playing) { pend = null; go = moved >= STEP && now - lastT >= 1500; if (!last) go = true; }
    else if (!last) go = true;
    else {                                              /* dijeda / digeser: tunggu posisi tenang */
      if (!pend || meters(pend, c) > 1) pend = { lat: c.lat, lng: c.lng, t: now };
      else if (now - pend.t >= 900 && moved >= 10) go = true;
    }
    if (!go) return;
    busy = true; last = { lat: c.lat, lng: c.lng }; lastT = now; pend = null;
    paintHud(lastShown, c, "Mengukur dimensi jalan…");
    measureAt(c, a).catch(function (e) {
      if (e && e.cors) { on = false; jset(K_ON, 0); syncBtn(); toast_("Dimensi jalan: browser memblokir pembacaan foto (CORS) — dimatikan", true); }
      else paintHud(lastShown, c, "Gagal mengukur: " + (e && e.message || e));
    }).then(function () { busy = false; });
  }
  setInterval(step, 400);

  window.PQDim = {
    _set: function (o) { if (o.meta) metaFn = o.meta; if (o.img) imgFn = o.img; },
    core: CORE, stats: function (id) { return stats(id || curRoad); }, csv: downloadCsv,
    on: function (v) { if (v !== undefined) { on = !!v; jset(K_ON, on ? 1 : 0); syncBtn(); } return on; },
    reset: function (id) { if (id || curRoad) { delete DB[id || curRoad]; jset(K_DB, DB); } hist = []; lastShown = null; }
  };
})();
