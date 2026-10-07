/* ==========================================================================
   PETAQU – OCR PATOK KM dari Street View (gratis, kuota-aman)

   Tujuan : angka KM yang semula "estimasi dihitung dari geometri ruas" (warna biru di lapisan
            Patok KM) dikoreksi dengan angka yang TERBACA dari patok sungguhan di Street View.
            Bila tidak ada panorama / tidak ada patok / angka tidak terbaca → titik DILEWATI
            (angka geometri tidak diubah).

   Biaya  : • OCR  = Tesseract.js di browser (gratis, tanpa API key)
            • Foto = Street View Static API memakai key Anda (getApiKey()).
              – Permintaan METADATA (cek ada/tidaknya panorama) gratis & tidak memakai kuota.
              – Hanya permintaan GAMBAR yang dihitung. Modul menghitungnya per bulan dan BERHENTI
                otomatis di batas yang Anda isi (bawaan 9.000, di bawah kuota gratis 10.000/bln
                untuk Street View Static — cek di Google Cloud Console → Billing → Quotas).

   Cara kerja per titik:
     1. cek panorama sekitar titik (metadata gratis) → lewati bila tidak ada
     2. ambil foto kiri & kanan jalan di tiap panorama (radius & langkah bisa diatur)
     3. deteksi PELAT PUTIH patok (bentuk persegi, putih, berisi tulisan gelap) → potong,
        perbesar, binarisasi → OCR (angka & huruf kota, mis. "207 / 12", "PWT 6")
     4. angka dipilih (baris bawah = KM ruas, bawaan; atau baris atas) → disimpan sebagai
        "jangkar". Jangkar boleh diturunkan ke titik lain pada ruas yang sama (opsional).

   Data hasil disimpan di localStorage (petaqu_kmocr_scan_v1 / petaqu_kmocr_v1) dan dipakai
   lapisan Patok KM saat halaman dimuat ulang. Bisa diekspor JSON/CSV.
   ========================================================================== */
(function (G) {
  "use strict";

  /* ======================================================================
     BAGIAN 1 — INTI (fungsi murni, bisa diuji di Node tanpa browser)
     ====================================================================== */
  var C = {};

  C.toGray = function (img) {
    var d = img.data, n = img.width * img.height, g = new Uint8ClampedArray(n), s = new Uint8ClampedArray(n), i, r, gg, b, mx, mn;
    for (i = 0; i < n; i++) {
      r = d[i * 4]; gg = d[i * 4 + 1]; b = d[i * 4 + 2];
      g[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
      mx = r > gg ? (r > b ? r : b) : (gg > b ? gg : b);
      mn = r < gg ? (r < b ? r : b) : (gg < b ? gg : b);
      s[i] = mx - mn;
    }
    return { g: g, s: s };
  };

  // Cari pelat putih berisi tulisan gelap. Mengembalikan kotak kandidat, terbaik dulu.
  C.findPlates = function (img, opt) {
    opt = opt || {};
    var W = img.width, H = img.height, N = W * H, L = C.toGray(img), g = L.g, sat = L.s;
    var thrs = opt.thr || [130, 160, 190, 215], maxK = opt.max || 4, out = [];
    var stack = new Int32Array(N);
    thrs.forEach(function (T) {
      var mask = new Uint8Array(N), vis = new Uint8Array(N), i, x, y;
      for (i = 0; i < N; i++) mask[i] = (g[i] >= T && sat[i] <= 30 + 0.22 * g[i]) ? 1 : 0;
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var p0 = y * W + x;
        if (!mask[p0] || vis[p0]) continue;
        var sp = 0, minx = x, maxx = x, miny = y, maxy = y, area = 0, sumG = 0;
        stack[sp++] = p0; vis[p0] = 1;
        while (sp) {
          var p = stack[--sp], px = p % W, py = (p - px) / W;
          area++; sumG += g[p];
          if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py;
          if (px > 0 && mask[p - 1] && !vis[p - 1]) { vis[p - 1] = 1; stack[sp++] = p - 1; }
          if (px < W - 1 && mask[p + 1] && !vis[p + 1]) { vis[p + 1] = 1; stack[sp++] = p + 1; }
          if (py > 0 && mask[p - W] && !vis[p - W]) { vis[p - W] = 1; stack[sp++] = p - W; }
          if (py < H - 1 && mask[p + W] && !vis[p + W]) { vis[p + W] = 1; stack[sp++] = p + W; }
        }
        var w = maxx - minx + 1, h = maxy - miny + 1, ar = w / h, fill = area / (w * h);
        if (w < 10 || h < 12 || area < 120) continue;
        if (w > W * 0.6 || h > H * 0.6 || area > N * 0.2) continue;
        if (ar < 0.28 || ar > 3.2 || fill < 0.42) continue;
        var meanG = sumG / area, dark = 0, yy, xx;
        for (yy = miny; yy <= maxy; yy++) for (xx = minx; xx <= maxx; xx++) {
          var q = yy * W + xx;
          if (!mask[q] && g[q] < meanG * 0.62) dark++;
        }
        var ink = dark / (w * h);
        if (ink < 0.03 || ink > 0.5) continue;
        // kontras cincin luar (pelat biasanya lebih terang dari sekitarnya)
        var rs = 0, rc = 0, m = 3, a1, b1;
        for (a1 = miny - m; a1 <= maxy + m; a1++) for (b1 = minx - m; b1 <= maxx + m; b1++) {
          if (a1 < 0 || b1 < 0 || a1 >= H || b1 >= W) continue;
          if (a1 >= miny && a1 <= maxy && b1 >= minx && b1 <= maxx) continue;
          rs += g[a1 * W + b1]; rc++;
        }
        var ring = rc ? (meanG - rs / rc) : 0;
        var inkT = Math.max(0, 1 - Math.abs(ink - 0.14) / 0.14), sizeT = Math.min(1, Math.sqrt(area) / 40);
        var score = inkT * 0.6 + sizeT * 0.25 + (ring > 20 ? 0.15 : 0);
        if (score < 0.25) continue;
        out.push({ x: minx, y: miny, w: w, h: h, score: score, thr: T });
      }
    });
    out.sort(function (a, b) { return b.score - a.score; });
    var keep = [];
    out.forEach(function (b) {
      for (var i = 0; i < keep.length; i++) if (iou(b, keep[i]) > 0.45) return;
      keep.push(b);
    });
    return keep.slice(0, maxK);
  };
  function iou(a, b) {
    var x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    var iw = Math.max(0, x2 - x1), ih = Math.max(0, y2 - y1), inter = iw * ih;
    return inter / (a.w * a.h + b.w * b.h - inter);
  }

  C.cropGray = function (gray, W, H, box, mrg) {
    var mx = Math.round(box.w * mrg), my = Math.round(box.h * mrg);
    var x0 = Math.max(0, box.x - mx), y0 = Math.max(0, box.y - my), x1 = Math.min(W, box.x + box.w + mx), y1 = Math.min(H, box.y + box.h + my);
    var w = x1 - x0, h = y1 - y0, o = new Uint8ClampedArray(w * h), y, x;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) o[y * w + x] = gray[(y0 + y) * W + x0 + x];
    return { d: o, w: w, h: h };
  };
  C.resize = function (im, nw, nh) {
    var o = new Uint8ClampedArray(nw * nh), sx = im.w / nw, sy = im.h / nh, x, y;
    for (y = 0; y < nh; y++) {
      var fy = (y + 0.5) * sy - 0.5, y0 = Math.max(0, Math.min(im.h - 1, Math.floor(fy))), y1 = Math.min(im.h - 1, y0 + 1), wy = Math.min(1, Math.max(0, fy - y0));
      for (x = 0; x < nw; x++) {
        var fx = (x + 0.5) * sx - 0.5, x0 = Math.max(0, Math.min(im.w - 1, Math.floor(fx))), x1 = Math.min(im.w - 1, x0 + 1), wx = Math.min(1, Math.max(0, fx - x0));
        var a = im.d[y0 * im.w + x0], b = im.d[y0 * im.w + x1], c = im.d[y1 * im.w + x0], d = im.d[y1 * im.w + x1];
        o[y * nw + x] = (a * (1 - wx) + b * wx) * (1 - wy) + (c * (1 - wx) + d * wx) * wy;
      }
    }
    return { d: o, w: nw, h: nh };
  };
  function stretch(im) {   // regangkan kontras p2–p98
    var hist = new Uint32Array(256), i, n = im.d.length;
    for (i = 0; i < n; i++) hist[im.d[i]]++;
    var lo = 0, hi = 255, c = 0;
    for (i = 0; i < 256; i++) { c += hist[i]; if (c >= n * 0.02) { lo = i; break; } }
    c = 0; for (i = 255; i >= 0; i--) { c += hist[i]; if (c >= n * 0.02) { hi = i; break; } }
    if (hi - lo < 20) return im;
    var o = new Uint8ClampedArray(n);
    for (i = 0; i < n; i++) o[i] = (im.d[i] - lo) * 255 / (hi - lo);
    return { d: o, w: im.w, h: im.h };
  }
  function otsu(im) {
    var hist = new Uint32Array(256), i, n = im.d.length, sum = 0;
    for (i = 0; i < n; i++) { hist[im.d[i]]++; }
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sB = 0, wB = 0, best = 0, th = 128;
    for (i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      var wF = n - wB; if (!wF) break;
      sB += i * hist[i];
      var mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; th = i; }
    }
    return th;
  }
  function pad(im, p, val) {
    var w = im.w + 2 * p, h = im.h + 2 * p, o = new Uint8ClampedArray(w * h).fill(val), y;
    for (y = 0; y < im.h; y++) o.set(im.d.subarray(y * im.w, (y + 1) * im.w), (y + p) * w + p);
    return { d: o, w: w, h: h };
  }
  // Variasi gambar untuk OCR: [abu-abu diregangkan, hitam-putih Otsu]; tinggi pelat → ±180 px
  // PENTING: potong sedikit KE DALAM pelat (margin negatif) agar tepi gelap/dinding tidak ikut;
  // tepi gelap membuat layout Tesseract gagal total (teruji pada foto patok contoh).
  C.variants = function (img, box) {
    var L = C.toGray(img), out = [];
    [0.08, 0.15].forEach(function (shr) {
      var mx = Math.round(box.w * shr), my = Math.round(box.h * shr);
      var inner = { x: box.x + mx, y: box.y + my, w: Math.max(4, box.w - 2 * mx), h: Math.max(4, box.h - 2 * my) };
      var cr = C.cropGray(L.g, img.width, img.height, inner, 0);
      var sc = Math.max(2, Math.min(7, 150 / cr.h)), big = C.resize(cr, Math.round(cr.w * sc), Math.round(cr.h * sc));
      var st = stretch(big);
      out.push({ name: "gray" + shr, im: pad(st, 40, 255) });
      if (shr === 0.08) {
        var th = otsu(st), i, bin = new Uint8ClampedArray(st.d.length);
        for (i = 0; i < bin.length; i++) bin[i] = st.d[i] > th ? 255 : 0;
        out.push({ name: "bin" + shr, im: pad({ d: bin, w: st.w, h: st.h }, 40, 255) });
      }
    });
    return out;
  };

  /* ---------- parser teks pelat ---------- */
  function digs(s) {   // salah-baca umum OCR pada angka
    return s.replace(/[OQD]/g, "0").replace(/[IL|]/g, "1").replace(/S/g, "5").replace(/Z/g, "2").replace(/B/g, "8").replace(/G/g, "6");
  }
  C.parsePlate = function (text) {
    var lines = String(text || "").toUpperCase().split(/[\r\n]+/)
      .map(function (s) { return s.replace(/[^A-Z0-9\/+.\- |]/g, " ").replace(/\s+/g, " ").trim(); })
      .filter(function (s) { return s.length > 0; });
    if (!lines.length) return null;
    var joined = lines.join(" "), m;
    // pelat kota: "PWT 6", "PBG 13", "PWT/6"
    m = joined.match(/^([A-Z]{2,4})\s*[-./]?\s*([0-9OQDILSZB|]{1,3})$/);
    if (m && !/^[0-9OQDILSZB|]+$/.test(m[1])) {
      var dv = parseInt(digs(m[2]), 10);
      if (isFinite(dv)) return { type: "kota", kode: m[1], jarak: dv, raw: joined };
    }
    // pelat KM: dua baris/angka: "207" & "12"  (atau "207/12")
    var toks = joined.split(/[\s\/|]+/).filter(Boolean), nums = [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i].replace(/[.\-+]+$/g, "");
      if (/^[0-9OQDILSZBG]{1,4}$/.test(t) && /[0-9]/.test(t)) { var v = parseInt(digs(t), 10); if (isFinite(v)) nums.push(v); }
      else if (/^[A-Z]{2,}/.test(t)) return null;   // ada kata → bukan pelat angka
    }
    if (!nums.length || nums.length > 3) return null;
    if (nums.length === 3) nums = nums.slice(0, 2);
    var a = nums[0], b = nums.length > 1 ? nums[1] : null;
    if (a < 0 || a > 999 || (b != null && (b < 0 || b > 999))) return null;
    return { type: "km", a: a, b: b, raw: joined };
  };

  // pilih angka KM dari hasil baca. mode: "b" = baris bawah (bawaan) | "a" = baris atas
  C.pickKm = function (rd, mode) {
    if (!rd) return null;
    if (rd.b == null) return rd.a;
    return mode === "a" ? rd.a : rd.b;
  };

  /* ---------- geo ---------- */
  var RAD = Math.PI / 180;
  C.bearing = function (a, b, c, d) {
    var y = Math.sin((d - b) * RAD) * Math.cos(c * RAD), x = Math.cos(a * RAD) * Math.sin(c * RAD) - Math.sin(a * RAD) * Math.cos(c * RAD) * Math.cos((d - b) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  };
  C.dest = function (lat, lng, brg, m) {
    var R = 6371000, dr = m / R, b = brg * RAD, la = lat * RAD, lo = lng * RAD;
    var la2 = Math.asin(Math.sin(la) * Math.cos(dr) + Math.cos(la) * Math.sin(dr) * Math.cos(b));
    var lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(dr) * Math.cos(la), Math.cos(dr) - Math.sin(la) * Math.sin(la2));
    return { lat: la2 / RAD, lng: lo2 / RAD };
  };
  C.kmFmt = function (km) {
    var m = Math.round(km * 1000), s = m < 0 ? "-" : "", ab = Math.abs(m), k = Math.floor(ab / 1000), r = ab % 1000;
    return s + k + "+" + ("00" + r).slice(-3);
  };
  C.kmNum = function (t) {   // "12+300" → 12.3
    var m = String(t).match(/(\d+)\s*\+\s*(\d+)/);
    if (m) return +m[1] + +m[2] / 1000;
    var f = parseFloat(t); return isFinite(f) ? f : null;
  };

  /* ---------- jangkar → turunan (murni, mudah diuji) ----------
     rows  : [{key, km:<angka label geometri (km)>, sta:<jarak m dari awal geometri>, flag}]
     anchors: {key: kmTerbaca}
     return : { applied:{key:{km:<teks>, d:0|1, note}}, konflik:[teks] } */
  C.derive = function (rows, anchors, opt) {
    opt = opt || {};
    var tol = opt.tol || 0.3, applied = {}, konflik = [];
    var grp = {};
    rows.forEach(function (r) { (grp[r.ruas] = grp[r.ruas] || []).push(r); });
    Object.keys(grp).forEach(function (ruas) {
      var rs = grp[ruas].slice().sort(function (a, b) { return a.sta - b.sta; });
      var anc = rs.filter(function (r) { return anchors[r.key] != null && r.km != null; });
      if (!anc.length) return;
      anc.forEach(function (r) {
        applied[r.key] = { km: C.kmFmt(anchors[r.key]), d: 0, note: "terbaca dari patok (OCR Street View)" };
      });
      if (!opt.derive) return;
      var ok = true, i;
      if (anc.length > 1) {
        // arah: selisih label geometri vs selisih angka patok harus sama tanda & besar
        for (i = 1; i < anc.length; i++) {
          var dg = anc[i].km - anc[0].km, dp = anchors[anc[i].key] - anchors[anc[0].key];
          if (Math.abs(dg - dp) > tol + 0.05 * Math.abs(dg)) { ok = false; konflik.push(ruas + ": angka patok tidak sejalan dengan geometri (" + C.kmFmt(anc[0].km) + "→" + C.kmFmt(anc[i].km) + " vs " + anchors[anc[0].key] + "→" + anchors[anc[i].key] + ")"); break; }
        }
      }
      if (!ok) return;
      // geseran per-segmen: di antara dua jangkar dipakai bila keduanya sepakat (≤150 m); di luar ujung dipakai jangkar terdekat.
      // Bila dua jangkar tak sepakat (mis. −1 km vs −2 km → patok hilang/geometri keliru), titik di antaranya TIDAK diturunkan.
      var TS = opt.shiftTol || 0.15, ancS = anc.map(function (r) { return { sta: r.sta, sh: anchors[r.key] - r.km }; }), diff = 0;
      rs.forEach(function (r) {
        if (applied[r.key] || r.flag !== 3 || r.km == null) return;
        var pv = null, nx = null, j, sh;
        for (j = 0; j < ancS.length; j++) { if (ancS[j].sta <= r.sta) pv = ancS[j]; else { nx = ancS[j]; break; } }
        if (pv && nx) { if (Math.abs(pv.sh - nx.sh) > TS) { diff++; return; } sh = (pv.sh + nx.sh) / 2; }
        else sh = (pv || nx).sh;
        if (r.km + sh < 0) return;   // km negatif = di luar ruas
        applied[r.key] = { km: C.kmFmt(r.km + sh), d: 1, note: "diturunkan dari " + anc.length + " patok OCR di ruas ini (geseran " + (sh >= 0 ? "+" : "") + sh.toFixed(3) + " km)" };
      });
      if (diff) konflik.push(ruas + ": geseran KM tidak konstan antar jangkar — " + diff + " titik di antaranya tidak diturunkan (patok hilang/tergeser?), cek manual");
    });
    return { applied: applied, konflik: konflik };
  };

  /* ---------- baca satu gambar (RGBA) memakai fungsi recog(imGray) → {text, conf} ---------- */
  C.readImage = async function (img, recog, opt) {
    opt = opt || {};
    var mode = opt.mode || "b";
    var boxes = C.findPlates(img, { max: opt.maxPlates || 4 }), reads = [], kota = [], dbg = [];
    function note(box, v, psm, wl, res, pr) { dbg.push({ box: box, v: v.name, psm: psm, wl: wl, text: String(res.text || "").trim(), conf: res.conf, pr: pr }); }
    for (var bi = 0; bi < boxes.length; bi++) {
      var vars = C.variants(img, boxes[bi]), votes = {}, best = null, vi;
      // 1) pelat KM: hanya angka (whitelist angka jauh lebih akurat, mis. 7 tidak jadi 0)
      for (vi = 0; vi < vars.length; vi++) {
        var res = await recog(vars[vi].im, 6, "d"), pr = C.parsePlate(res.text);
        note(boxes[bi], vars[vi], 6, "d", res, pr);
        // pelat KM asli berisi DUA baris angka; satu angka saja = noise → dibuang
        if (!pr || pr.type !== "km" || pr.b == null) continue;
        var pick = C.pickKm(pr, mode), key = "km:" + pick;
        var v = votes[key] = votes[key] || { pr: pr, n: 0, conf: 0, v: vars[vi], as: {} };
        v.n++; v.conf = Math.max(v.conf, res.conf || 0); v.as[pr.a] = (v.as[pr.a] || 0) + 1;
        if (v.as[pr.a] > (v.as[v.pr.a] || 0)) v.pr = pr;   // angka lain (atas/bawah) ikut suara terbanyak
        if (v.n >= 2) break;
      }
      Object.keys(votes).forEach(function (k) { if (!best || votes[k].n > best.n || (votes[k].n === best.n && votes[k].conf > best.conf)) best = votes[k]; });
      if (best) { reads.push({ pr: best.pr, votes: best.n, conf: best.conf, box: boxes[bi], variant: best.v }); continue; }
      // 2) pelat kota ("PWT 6"): huruf+angka, hanya jika bukan pelat KM
      for (vi = 0; vi < Math.min(2, vars.length); vi++) {
        var r2 = await recog(vars[vi].im, 6, "a"), p2 = C.parsePlate(r2.text);
        note(boxes[bi], vars[vi], 6, "a", r2, p2);
        if (p2 && p2.type === "kota") { kota.push({ pr: p2, votes: 1, conf: r2.conf, box: boxes[bi] }); break; }
      }
    }
    reads.sort(function (a, b) { return (b.votes * 100 + b.conf) - (a.votes * 100 + a.conf); });
    return { boxes: boxes, km: reads, kota: kota, dbg: dbg };
  };

  /* ---------- PERENCANA CERDAS (murni, bisa diuji) ----------
     Tujuan: sedikit gambar, hasil sebanyak mungkin. Semua keputusan di sini memakai data GRATIS
     (metadata Street View: ada/tidaknya panorama + bulan-tahun foto) dan struktur data itu sendiri. */
  C.yearOf = function (d) { var m = /^(\d{4})/.exec(String(d || "")); return m ? +m[1] : null; };
  C.workYear = function (t) { var m = /TA\.?\s*(\d{4})/i.exec(String(t || "")); return m ? +m[1] : null; };   // "Pelebaran TA.2019" → 2019
  C.isRound = function (km, tol) { return km != null && Math.abs(km - Math.round(km)) <= (tol || 0.02); };
  // Urutan titik yang layak dicoba dalam satu ruas: (1) hanya km BULAT (patok fisik ada tiap 1 km),
  // (2) mulai dari tengah ruas, (3) probe ke-2 sejauh mungkin dari probe ke-1 (untuk verifikasi geseran), (4) sisanya.
  C.pickProbes = function (list) {
    var n = list.length, idx = [], i; if (!n) return [];
    for (i = 0; i < n; i++) idx.push(i);
    var rd = idx.filter(function (j) { return C.isRound(list[j].km); }), pool = (rd.length >= 2 ? rd : idx).slice();
    var mid = (list[0].sta + list[n - 1].sta) / 2;
    pool.sort(function (a, b) { return Math.abs(list[a].sta - mid) - Math.abs(list[b].sta - mid); });
    var first = pool[0], out = [first];
    var far = pool.slice(1).sort(function (a, b) { return Math.abs(list[b].sta - list[first].sta) - Math.abs(list[a].sta - list[first].sta); });
    if (far.length) out.push(far[0]);
    pool.concat(idx).forEach(function (j) { if (out.indexOf(j) < 0) out.push(j); });
    return out;
  };
  // Peringatan LUNAK: pelat ber-2 angka biasanya bergerak 1:1 per km (|Δatas| = |Δbawah|). Hanya penanda, tidak menolak otomatis.
  C.crossCheck = function (reads) {
    var w = [], i;
    for (i = 1; i < reads.length; i++) {
      if (reads[i].b == null || reads[0].b == null) continue;
      var da = Math.abs(reads[i].a - reads[0].a), db = Math.abs(reads[i].b - reads[0].b);
      if (da !== db) w.push("angka atas/bawah tidak seirama (" + reads[0].a + "/" + reads[0].b + " vs " + reads[i].a + "/" + reads[i].b + ") — cek 1 foto");
    }
    return w;
  };
  // Peringkat ruas dari hasil pra-survei gratis: ada panorama, lalu foto terbaru dulu.
  C.rankRuas = function (names, plan, minYear) {
    var keep = [], skipNo = [], skipOld = [];
    names.forEach(function (nm) {
      var p = plan[nm];
      if (!p) { keep.push(nm); return; }
      if (!p.ok) { skipNo.push(nm); return; }
      var y = C.yearOf(p.date);
      if (y && minYear && y < minYear) { skipOld.push(nm); return; }
      keep.push(nm);
    });
    keep.sort(function (a, b) { return String((plan[b] || {}).date || "").localeCompare(String((plan[a] || {}).date || "")) || ((plan[b] || {}).ok || 0) - ((plan[a] || {}).ok || 0); });
    return { keep: keep, skipNo: skipNo, skipOld: skipOld };
  };

  C.version = "2.0-planner";
  G.PQ_KMOCR_CORE = C;
  if (typeof module !== "undefined" && module.exports) module.exports = C;

  /* ======================================================================
     BAGIAN 2 — BROWSER (UI, Street View Static, Tesseract, penyimpanan)
     ====================================================================== */
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.PQ_KMOCR) return;

  var TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var LANG = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int";
  var K_SCAN = "petaqu_kmocr_scan_v1", K_AP = "petaqu_kmocr_v1", K_SET = "petaqu_kmocr_set_v1", K_Q = "petaqu_kmocr_quota_v1", K_PLAN = "petaqu_kmocr_plan_v1", K_SIDE = "petaqu_kmocr_side_v1";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var DATA = null, ROWS = [], SCAN = jget(K_SCAN, {}), SET = Object.assign({ cap: 9000, radius: 60, step: 15, perRuas: 3, derive: true, mode: "b", minVotes: 2, maxPano: 4, maxImgRuas: 14, minYear: (new Date().getFullYear() - 10), verify: true, cross: true, manual: false, showMap: true }, jget(K_SET, {}));
  var RUN = { on: false, stop: false, sel: -1 }, worker = null, wLoad = null, KONFLIK = [];

  function keyOf(r) { return r[0] + "," + r[1] + "|" + r[3]; }
  function staOf(r) { var v = parseFloat(String(r[4]).replace(/,/g, "")); return isFinite(v) ? v : 0; }
  function loadData() {
    if (DATA) return DATA;
    try { DATA = JSON.parse($("pk-data").textContent); } catch (e) { DATA = []; }
    ROWS = DATA.map(function (r, i) { return { i: i, key: keyOf(r), ruas: r[3], km: C.kmNum(r[2]), sta: staOf(r), flag: r[9], lat: r[0], lng: r[1] }; });
    return DATA;
  }
  // flag asli (sebelum ditimpa OCR): baris yang sudah ditimpa punya keterangan "OCR patok"
  function origFlag(r) { return /^OCR patok/.test(r[8] || "") ? 3 : r[9]; }

  /* ---- kuota ---- */
  function monthKey() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }
  function quota() { var q = jget(K_Q, null); if (!q || q.m !== monthKey()) q = { m: monthKey(), n: 0 }; return q; }
  function quotaAdd(n) { var q = quota(); q.n += n; jset(K_Q, q); return q; }
  function quotaLeft() { return SET.cap - quota().n; }

  /* ---- Street View Static ---- */
  function apiKey() { try { return typeof getApiKey === "function" ? getApiKey() : ""; } catch (e) { return ""; } }
  async function meta(lat, lng, radius) {      // GRATIS (tidak memakai kuota)
    var u = "https://maps.googleapis.com/maps/api/streetview/metadata?location=" + lat.toFixed(6) + "," + lng.toFixed(6) + "&radius=" + radius + "&source=outdoor&key=" + encodeURIComponent(apiKey());
    var r = await fetch(u); if (!r.ok) throw new Error("metadata HTTP " + r.status);
    return r.json();
  }
  function loadImg(url) {
    return new Promise(function (res, rej) {
      var im = new Image(); im.crossOrigin = "anonymous";
      im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("gagal memuat gambar Street View")); };
      im.src = url;
    });
  }
  async function svImage(pano, heading, fov, pitch) {   // 1 permintaan gambar = 1 kuota
    if (quotaLeft() <= 0) { var e = new Error("kuota"); e.quota = true; throw e; }
    quotaAdd(1);
    var u = "https://maps.googleapis.com/maps/api/streetview?size=640x640&pano=" + encodeURIComponent(pano) + "&heading=" + heading.toFixed(1) + "&pitch=" + pitch + "&fov=" + fov + "&source=outdoor&return_error_code=true&key=" + encodeURIComponent(apiKey());
    var im = await loadImg(u), cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    var cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(im, 0, 0);
    try { return cx.getImageData(0, 0, cv.width, cv.height); }
    catch (e) { var er = new Error("cors"); er.cors = true; throw er; }
  }

  /* ---- Tesseract ---- */
  function loadTess() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = TESS; s.onload = res; s.onerror = function () { rej(new Error("gagal memuat Tesseract (cek internet)")); };
      document.head.appendChild(s);
    });
  }
  function getWorker() {
    if (worker) return Promise.resolve(worker);
    if (wLoad) return wLoad;
    wLoad = loadTess().then(function () {
      return Tesseract.createWorker("eng", 1, { langPath: LANG }).catch(function () { return Tesseract.createWorker("eng"); });
    }).then(function (w) {
      return w.setParameters({ preserve_interword_spaces: "1" }).then(function () { worker = w; return w; });
    });
    return wLoad;
  }
  function grayToCanvas(im) {
    var cv = document.createElement("canvas"); cv.width = im.w; cv.height = im.h;
    var cx = cv.getContext("2d"), id = cx.createImageData(im.w, im.h), i;
    for (i = 0; i < im.d.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = im.d[i]; id.data[i * 4 + 3] = 255; }
    cx.putImageData(id, 0, 0); return cv;
  }
  async function recog(im, psm, wl) {
    var w = await getWorker();
    await w.setParameters({ tessedit_pageseg_mode: String(psm), tessedit_char_whitelist: wl === "a" ? "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/+-." : "0123456789/" });
    var r = await w.recognize(grayToCanvas(im));
    return { text: r.data.text, conf: r.data.confidence };
  }
  function thumb(img, box) {   // bukti kecil (JPEG) untuk ditinjau
    try {
      var cv = document.createElement("canvas"), src = document.createElement("canvas"); src.width = img.width; src.height = img.height;
      src.getContext("2d").putImageData(img, 0, 0);
      var m = Math.round(box.w * 0.15), x = Math.max(0, box.x - m), y = Math.max(0, box.y - m), w = Math.min(img.width - x, box.w + 2 * m), h = Math.min(img.height - y, box.h + 2 * m), sc = Math.min(3, 110 / h);
      cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
      cv.getContext("2d").drawImage(src, x, y, w, h, 0, 0, cv.width, cv.height);
      return cv.toDataURL("image/jpeg", 0.6);
    } catch (e) { return ""; }
  }

  /* ---- pindai satu titik ---- */
  function neighborBearing(i) {
    var r = DATA[i], same = [], j;
    for (j = 0; j < ROWS.length; j++) if (ROWS[j].ruas === r[3]) same.push(ROWS[j]);
    same.sort(function (a, b) { return a.sta - b.sta; });
    var p = same.findIndex(function (x) { return x.i === i; });
    var a = same[p + 1] || null, b = same[p - 1] || null;
    if (a) return C.bearing(r[0], r[1], a.lat, a.lng);
    if (b) return C.bearing(b.lat, b.lng, r[0], r[1]);
    return null;
  }
  function say(msg) { var e = $("kmoStat"); if (e) e.textContent = msg; }

  async function scanPoint(i, onMsg) {
    var r = DATA[i], brg = neighborBearing(i), step = +SET.step || 15, rad = +SET.radius || 60;
    var offs = [0], k, wy = C.workYear(r[6]), minY = +SET.minYear || 0;
    for (k = 1; k * step <= rad; k++) { offs.push(k * step); offs.push(-k * step); }
    // metadata GRATIS, dijalankan paralel (cepat). Foto lebih tua dari tahun perbaikan jalan / batas tahun → dibuang tanpa buka Street View.
    var ms = await Promise.all(offs.map(function (o) {
      var p = brg == null ? { lat: r[0], lng: r[1] } : C.dest(r[0], r[1], brg, o);
      return meta(p.lat, p.lng, Math.max(12, step)).then(function (m) { return { m: m, off: o }; });
    }));
    if (RUN.stop) return { st: "stop" };
    var seen = {}, panos = [], lama = 0;
    ms.forEach(function (x) {
      var m = x.m; if (m.status !== "OK" || seen[m.pano_id]) return; seen[m.pano_id] = 1;
      var y = C.yearOf(m.date);
      if (y && ((wy && y < wy) || (minY && y < minY))) { lama++; return; }
      panos.push({ id: m.pano_id, loc: m.location, date: m.date, off: x.off });
    });
    if (!panos.length) return lama ? { st: "fotolama", n: lama } : { st: "nopano" };
    panos.sort(function (a, b) { return Math.abs(a.off) - Math.abs(b.off); });
    panos = panos.slice(0, Math.max(1, +SET.maxPano || 4));
    // sisi jalan: dipelajari dari hasil sebelumnya; bila sudah ≥80% satu sisi, sisi itu diperiksa duluan untuk SEMUA panorama
    var side = jget(K_SIDE, { l: 0, r: 0 }), tot = side.l + side.r, heads, passes;
    if (brg == null) { heads = [0, 90, 180, 270]; passes = [heads]; }
    else {
      var R = (brg + 90) % 360, L = (brg + 270) % 360, pref = side.l > side.r ? [L, R] : [R, L];
      heads = [R, L]; passes = (tot >= 4 && Math.max(side.l, side.r) / tot >= 0.8) ? [[pref[0]], [pref[1]]] : [pref];
    }
    var lastKota = [], tries = 0, pi, h;
    for (pi = 0; pi < passes.length; pi++) {
      for (k = 0; k < panos.length; k++) {
        for (h = 0; h < passes[pi].length; h++) {
          if (RUN.stop) return { st: "stop" };
          var hd = passes[pi][h];
          onMsg && onMsg("panorama " + (k + 1) + "/" + panos.length + " arah " + Math.round(hd) + "°" + (panos[k].date ? " · foto " + panos[k].date : ""));
          var img = await svImage(panos[k].id, hd, 80, -4); tries++;
          var rd = await C.readImage(img, recog, { maxPlates: 4, mode: SET.mode });
          lastKota = lastKota.concat(rd.kota.map(function (x) { return x.pr.kode + " " + x.pr.jarak; }));
          if (rd.km.length) {
            var top = rd.km[0];
            if (brg != null) { side[((hd - brg + 360) % 360) < 180 ? "r" : "l"]++; jset(K_SIDE, side); }
            return { st: top.votes >= SET.minVotes ? "ok" : "ragu", a: top.pr.a, b: top.pr.b, votes: top.votes, conf: Math.round(top.conf || 0), kota: lastKota.slice(0, 4), pano: panos[k].id, date: panos[k].date || "", heading: Math.round(hd), off: panos[k].off, plat: panos[k].loc, ev: thumb(img, top.box), tries: tries, raw: top.pr.raw };
          }
        }
      }
    }
    return { st: "nopatok", n: panos.length, tries: tries };
  }

  /* ---- terapkan hasil → peta (lewat localStorage yang dibaca lapisan Patok KM) ---- */
  // status tinjauan: acc = dipakai · pend = terbaca, menunggu verifikasi manual · ragu · rej = ditolak
  function stat(s) {
    if (!s || (s.st !== "ok" && s.st !== "ragu")) return "";
    if (s.rej) return "rej";
    if (s.acc) return "acc";
    if (s.st === "ok") return SET.manual ? "pend" : "acc";
    return "ragu";
  }
  function accepted() {   // {key: angka KM terpilih}
    var o = {};
    Object.keys(SCAN).forEach(function (k) {
      var s = SCAN[k];
      if (stat(s) !== "acc") return;
      var km = C.pickKm(s, SET.mode); if (km != null) o[k] = km;
    });
    return o;
  }
  function rowsForDerive() {
    loadData();
    return ROWS.filter(function (r) { var f = origFlag(DATA[r.i]); return f === 3 || SCAN[r.key]; }).map(function (r) {
      // km "geometri" = angka label asli; bila sudah ditimpa, ambil dari catatan asli
      var d = DATA[r.i], km = r.km;
      var m = /semula ([^ ]+) \(estimasi/.exec(d[8] || ""); if (m) km = C.kmNum(m[1]);
      return { key: r.key, ruas: r.ruas, km: km, sta: r.sta, flag: 3 };
    });
  }
  function applyAll() {
    var res = C.derive(rowsForDerive(), accepted(), { derive: !!SET.derive });
    jset(K_AP, res.applied); KONFLIK = (res.konflik || []).concat(softWarn());
    return res;
  }
  function softWarn() {
    if (SET.cross === false) return [];
    var g = {}, w = [];
    Object.keys(SCAN).forEach(function (k) { var s = SCAN[k]; if (!s || s.rej || (s.st !== "ok" && s.st !== "ragu") || s.b == null) return; (g[s.ruas] = g[s.ruas] || []).push({ a: s.a, b: s.b }); });
    Object.keys(g).forEach(function (ru) { C.crossCheck(g[ru]).forEach(function (t) { w.push(ru + ": " + t); }); });
    return w;
  }

  /* ---- jalankan batch ---- */
  function targets() {
    loadData();
    var ruas = $("pkRuas") ? $("pkRuas").value : "", by = {}, order = [];
    ROWS.forEach(function (r) {
      if (origFlag(DATA[r.i]) !== 3) return;
      if (SET.scope === "filter" && ruas && r.ruas !== ruas) return;
      if (!by[r.ruas]) { by[r.ruas] = []; order.push(r.ruas); }
      by[r.ruas].push(r);
    });
    order.forEach(function (k) { by[k].sort(function (a, b) { return a.sta - b.sta; }); });
    return { order: order, by: by };
  }
  /* ---- PRA-SURVEI GRATIS: hanya metadata (tanpa kuota gambar). Hasil di-cache 30 hari. ---- */
  async function presurvey(T) {
    var plan = jget(K_PLAN, {}), now = Date.now(), ri, pi;
    for (ri = 0; ri < T.order.length; ri++) {
      var nm = T.order[ri], p = plan[nm];
      if (p && now - p.t < 30 * 864e5) continue;
      var list = T.by[nm], pr = C.pickProbes(list).slice(0, 2), ok = 0, best = "";
      say("Pra-survei gratis " + (ri + 1) + "/" + T.order.length + " · " + nm);
      for (pi = 0; pi < pr.length; pi++) {
        if (RUN.stop) return null;
        var row = list[pr[pi]], m = await meta(row.lat, row.lng, 100);
        if (m.status === "OK") { ok++; if ((m.date || "") > best) best = m.date || ""; }
      }
      plan[nm] = { ok: ok, date: best, t: now };
      if (ri % 10 === 9) jset(K_PLAN, plan);
    }
    jset(K_PLAN, plan);
    return C.rankRuas(T.order, plan, +SET.minYear || 0);
  }
  async function runBatch() {
    if (RUN.on) return; RUN.on = true; RUN.stop = false; ui();
    var T = targets(), hit = 0, skip = 0, pre = null;
    try {
      if (!apiKey()) throw new Error("API key Street View kosong (Pengaturan → Google Maps API key)");
      pre = await presurvey(T);
      if (!pre) { RUN.on = false; RUN.stop = false; ui(); say("Pra-survei dijeda."); return; }
      T.order = pre.keep;
      say("Pra-survei: " + pre.keep.length + " ruas dikerjakan · " + pre.skipNo.length + " tanpa panorama & " + pre.skipOld.length + " foto terlalu lama DILEWATI (0 kuota). Mulai OCR…");
      await getWorker();
      var total = T.order.length;
      for (var ri = 0; ri < T.order.length && !RUN.stop; ri++) {
        var name = T.order[ri], list = T.by[name], q0 = quota().n, seq = C.pickProbes(list), anchors = 0, li, tried = 0;
        var span = list.length ? (list[list.length - 1].sta - list[0].sta) : 0;
        var need = !SET.derive ? list.length : (SET.verify && span >= 4000 ? 2 : 1);   // ruas panjang → 1 jangkar tambahan untuk memastikan geseran sama di ujung lain
        for (li = 0; li < seq.length && !RUN.stop; li++) {
          var row = list[seq[li]], ex = SCAN[row.key];
          if (ex && ex.st !== "err") { if (ex.st === "ok" || ex.st === "ragu") anchors++; continue; }
          if (anchors >= need) {
            var kf = KONFLIK.some(function (t) { return t.indexOf(name + ":") === 0; });   // dua jangkar tak sejalan → satu jangkar penentu lagi
            if (!(kf && need < 3)) break;
            need = 3;
          }
          var used = quota().n - q0;
          if (tried >= (+SET.perRuas || 3) + (need > 1 ? 1 : 0)) break;
          if (used >= (anchors ? SET.maxImgRuas * 1.5 : SET.maxImgRuas)) break;     // anggaran gambar per ruas
          tried++;
          var head = "Ruas " + (ri + 1) + "/" + total + " · " + name + " · titik " + C.kmFmt(row.km) + " · jangkar " + anchors + "/" + need;
          say(head + " · sisa kuota " + quotaLeft());
          var s;
          try { s = await scanPoint(row.i, function (m) { say(head + " · " + m + " · sisa kuota " + quotaLeft()); }); }
          catch (e) {
            if (e.quota) { RUN.stop = true; say("Berhenti: batas kuota " + SET.cap + " tercapai bulan ini."); break; }
            if (e.cors) { RUN.stop = true; say("Gambar Street View tidak bisa dibaca browser (CORS). Pakai 'Uji dari gambar' / lihat catatan."); break; }
            s = { st: "err", msg: String(e.message || e) };
          }
          if (s.st === "stop") break;
          s.t = Date.now(); s.ruas = row.ruas; s.km0 = row.km; SCAN[row.key] = s; jset(K_SCAN, SCAN);
          if (s.st === "ok" || s.st === "ragu") { hit++; anchors++; applyAll(); } else skip++;
        }
        applyAll(); render();
      }
    } catch (e) { say("Error: " + (e.message || e)); }
    RUN.on = false; RUN.stop = false; applyAll(); ui(); render();
    say("Selesai/Jeda · terbaca " + hit + " · dilewati " + skip + (pre ? " · ruas dilewati gratis " + (pre.skipNo.length + pre.skipOld.length) : "") + " · kuota terpakai " + quota().n + "/" + SET.cap);
  }
  async function runOne(i) {
    if (RUN.on) return; loadData();
    if (!(i >= 0)) { say("Pilih dulu titik dari daftar Patok KM."); return; }
    RUN.on = true; RUN.stop = false; ui();
    try {
      if (!apiKey()) throw new Error("API key Street View kosong");
      await getWorker();
      var key = keyOf(DATA[i]), s = await scanPoint(i, function (m) { say(C.kmFmt(ROWS[i].km) + " · " + m); });
      if (s.st !== "stop") { s.t = Date.now(); s.ruas = DATA[i][3]; s.km0 = ROWS[i].km; SCAN[key] = s; jset(K_SCAN, SCAN); applyAll(); }
      say(s.st === "ok" || s.st === "ragu" ? "Terbaca: " + s.a + (s.b != null ? " / " + s.b : "") : s.st === "nopano" ? "Tidak ada panorama — dilewati." : s.st === "stop" ? "Dihentikan." : "Tidak ada patok terbaca — dilewati.");
    } catch (e) { say(e.quota ? "Batas kuota tercapai." : e.cors ? "CORS: gambar tidak bisa dibaca browser." : "Error: " + (e.message || e)); }
    RUN.on = false; ui(); render();
  }
  async function testFile(file) {
    if (!file) return;
    say("Membaca gambar…");
    try {
      var url = URL.createObjectURL(file), im = await loadImg(url), cv = document.createElement("canvas");
      cv.width = im.naturalWidth; cv.height = im.naturalHeight; var cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(im, 0, 0);
      var img = cx.getImageData(0, 0, cv.width, cv.height); await getWorker();
      var rd = await C.readImage(img, recog, { maxPlates: 5, mode: SET.mode });
      var out = rd.km.map(function (x) { return "KM-pelat: " + x.pr.a + (x.pr.b != null ? " / " + x.pr.b : "") + " (suara " + x.votes + ", conf " + Math.round(x.conf) + ")"; })
        .concat(rd.kota.map(function (x) { return "Pelat kota: " + x.pr.kode + " " + x.pr.jarak; }));
      say(out.length ? out.join("  ·  ") : "Tidak ada pelat patok terbaca pada gambar ini (" + rd.boxes.length + " kandidat pelat).");
    } catch (e) { say("Error: " + (e.message || e)); }
  }

  /* ---- UI ---- */
  var CSS2 = ".kmo-pin{min-width:44px;height:22px;line-height:18px;padding:0 6px;border-radius:11px;border:2px solid #fff;font:800 11px system-ui,sans-serif;color:#fff;text-align:center;white-space:nowrap;box-shadow:0 2px 8px #000a;box-sizing:border-box}" +
    ".kmo-pin.kmo-a{background:#16a34a}.kmo-pin.kmo-p{background:#0284c7}.kmo-pin.kmo-r{background:#d97706}.kmo-pin.kmo-x{background:#dc2626;text-decoration:line-through}.kmo-pin.kmo-n{min-width:0;width:10px;height:10px;padding:0;border-radius:50%;background:#94a3b8;border:1px solid #fff;opacity:.8}" +
    ".kmo-pp{font:12px/1.4 system-ui,sans-serif;min-width:180px}.kmo-ev{display:block;width:100%;max-height:90px;object-fit:contain;background:#fff;border-radius:6px;margin:6px 0}.kmo-rd{margin:4px 0;font-size:13px}.kmo-tg{display:inline-block;padding:1px 8px;border-radius:9px;font-weight:700;font-size:10.5px;color:#fff}.kmo-tg.kmo-a{background:#16a34a}.kmo-tg.kmo-p{background:#0284c7}.kmo-tg.kmo-r{background:#d97706}.kmo-tg.kmo-x{background:#dc2626}" +
    ".kmo-bt{display:flex;gap:5px;margin-top:7px}.kmo-bt button{flex:1;cursor:pointer;border:0;border-radius:7px;padding:6px 4px;font:700 11.5px system-ui;color:#fff;background:#16a34a}.kmo-bt button.x{background:#dc2626}.kmo-bt button.g{background:#ffffff1f;border:1px solid #ffffff44}";
  var CSS = CSS2 + ".kmo{margin:10px 0;padding:10px 11px;border:1px solid #38bdf855;border-radius:11px;background:#0b1220;font:12px/1.45 system-ui,sans-serif;color:#e6f1fb}" +
    ".kmo summary{cursor:pointer;font-weight:800;color:#a3e635}.kmo .r{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:7px 0}.kmo label{opacity:.85}" +
    ".kmo input[type=number]{width:62px;background:#0f1a2d;color:#fff;border:1px solid #ffffff33;border-radius:6px;padding:3px 5px}.kmo select{background:#0f1a2d;color:#fff;border:1px solid #ffffff33;border-radius:6px;padding:3px}" +
    ".kmo button{cursor:pointer;border:0;border-radius:8px;padding:6px 10px;font:700 12px system-ui;color:#fff;background:#0284c7}.kmo button.g{background:#ffffff1a;border:1px solid #ffffff33}.kmo button.d{background:#b91c1c}.kmo button:disabled{opacity:.45;cursor:default}" +
    ".kmo .st{margin-top:6px;color:#fde68a;word-break:break-word}.kmo .q{height:6px;border-radius:4px;background:#ffffff1a;overflow:hidden}.kmo .q i{display:block;height:100%;background:#34d399}" +
    ".kmo table{width:100%;border-collapse:collapse;margin-top:6px;font-size:11.5px}.kmo td,.kmo th{padding:3px 4px;border-bottom:1px solid #ffffff14;text-align:left;vertical-align:middle}.kmo img.ev{height:34px;border-radius:4px;background:#fff}" +
    ".kmo .tag{display:inline-block;padding:1px 6px;border-radius:9px;font-weight:700;font-size:10.5px}.kmo .t-ok{background:#a3e63533;color:#bef264}.kmo .t-ragu{background:#f59e0b33;color:#fcd34d}.kmo .t-no{background:#ffffff1a;color:#cbd5e1}.kmo .t-err{background:#f43f5e33;color:#fda4af}";

  function ui() {
    var run = $("kmoRun"); if (!run) return;
    run.disabled = RUN.on; $("kmoOne").disabled = RUN.on; $("kmoStop").disabled = !RUN.on;
    var q = quota(); $("kmoQ").style.width = Math.min(100, q.n * 100 / Math.max(1, SET.cap)) + "%";
    $("kmoQt").textContent = "Kuota gambar bulan ini: " + q.n + " / " + SET.cap + " (metadata gratis, tidak dihitung)";
  }
  function counts() {
    var c = { ok: 0, ragu: 0, nopano: 0, fotolama: 0, nopatok: 0, err: 0 };
    Object.keys(SCAN).forEach(function (k) { var s = SCAN[k] && SCAN[k].st; if (c[s] != null) c[s]++; });
    return c;
  }
  function render() {
    var box = $("kmoList"); if (!box) return;
    var c = counts(), ap = jget(K_AP, {}), nAp = Object.keys(ap).length, nDer = Object.keys(ap).filter(function (k) { return ap[k].d; }).length;
    var keys = Object.keys(SCAN).filter(function (k) { var s = SCAN[k]; return s && (s.st === "ok" || s.st === "ragu"); }).sort(function (a, b) { var pa = stat(SCAN[a]) === "pend" || stat(SCAN[a]) === "ragu" ? 1 : 0, pb = stat(SCAN[b]) === "pend" || stat(SCAN[b]) === "ragu" ? 1 : 0; return (pb - pa) || (SCAN[b].t - SCAN[a].t); }).slice(0, 100);
    box.innerHTML = '<div>Terbaca ' + c.ok + ' · ragu ' + c.ragu + ' · tanpa panorama ' + c.nopano + ' · foto lama ' + c.fotolama + ' · tanpa patok ' + c.nopatok + (c.err ? ' · error ' + c.err : '') + '. Diterapkan ke peta: ' + nAp + ' titik (' + nDer + ' turunan).</div>' +
      (KONFLIK.length ? '<div style="color:#fda4af;margin-top:4px">Perlu dicek manual (turunan tidak dipakai): ' + KONFLIK.map(esc).join('; ') + '</div>' : '') +
      (keys.length ? '<table><tr><th>Bukti</th><th>Hasil</th><th>Ruas / titik</th><th></th></tr>' + keys.map(function (k) {
        var s = SCAN[k], stt = stat(s), on = stt === "acc";
        return '<tr><td>' + (s.ev ? '<img class="ev" src="' + s.ev + '">' : '') + '</td><td><b>' + s.a + (s.b != null ? ' / ' + s.b : '') + '</b><br><span class="tag ' + (on ? 't-ok' : stt === "rej" ? 't-err' : 't-ragu') + '">' + ({ acc: 'diterima', rej: 'ditolak', pend: 'menunggu verifikasi', ragu: 'ragu' }[stt]) + '</span> <small>' + confTxt(s) + '</small>' + (s.kota && s.kota.length ? '<br><small>' + esc(s.kota.join(", ")) + '</small>' : '') + '</td><td><small>' + esc(s.ruas) + '<br>label geometri ' + C.kmFmt(s.km0) + '</small></td><td>' +
          (stt !== "acc" ? '<button data-act="acc" data-k="' + esc(k) + '">Terima</button> ' : '') + (stt !== "rej" ? '<button class="g" data-act="rej" data-k="' + esc(k) + '">Tolak</button> ' : '') + '<button class="g" data-act="loc" data-k="' + esc(k) + '" title="Lihat di peta">&#128205;</button>' + '</td></tr>';
      }).join("") + '</table>' : "");
    ui(); overlay();
  }

  /* ---- keyakinan & lapisan hasil di peta ---- */
  function confTxt(s) { var lv = s.st === "ok" && (s.votes || 0) >= 3 && (s.conf || 0) >= 70 ? "tinggi" : s.st === "ok" ? "sedang" : "rendah"; return "keyakinan " + lv + " (" + (s.votes || 0) + " suara, conf " + (s.conf || 0) + ")"; }
  var OV = null, OVK = {}, KL = [];
  function mapObj() { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } }
  function pinHtml(s, stt) {
    var cls = { acc: "a", pend: "p", ragu: "r", rej: "x" }[stt] || "n";
    return '<div class="kmo-pin kmo-' + cls + '">' + (stt ? esc(s.a + (s.b != null ? "/" + s.b : "")) : "") + '</div>';
  }
  function popupHtml(k) {
    var s = SCAN[k], stt = stat(s), row = OVK[k]; if (!s || !row) return "";
    var ok = !!stt;
    var h = '<div class="kmo-pp"><b>' + esc(row.ruas) + '</b><br><small>Label geometri: ' + C.kmFmt(row.km) + '</small>';
    if (ok) {
      h += (s.ev ? '<img class="kmo-ev" src="' + s.ev + '">' : '') + '<div class="kmo-rd">Terbaca: <b>' + esc(s.a) + (s.b != null ? " / " + esc(s.b) : "") + '</b></div><small>' + confTxt(s) + (s.date ? " · foto " + esc(s.date) : "") + '</small><br>' +
        '<span class="kmo-tg kmo-' + { acc: "a", pend: "p", ragu: "r", rej: "x" }[stt] + '">' + { acc: "diterima", rej: "ditolak", pend: "menunggu verifikasi", ragu: "ragu" }[stt] + '</span>' +
        '<div class="kmo-bt">' + (stt !== "acc" ? '<button onclick="PQ_KMO_ACT(\'' + KL.indexOf(k) + '\',\'acc\')">Terima</button>' : "") + (stt !== "rej" ? '<button class="x" onclick="PQ_KMO_ACT(\'' + KL.indexOf(k) + '\',\'rej\')">Tolak</button>' : "") + '<button class="g" onclick="PQ_KMO_SV(\'' + KL.indexOf(k) + '\')">Street View</button></div>';
    } else {
      h += '<div class="kmo-rd">' + ({ nopano: "Tanpa panorama Street View", fotolama: "Foto Street View terlalu lama", nopatok: "Patok tidak terdeteksi", err: "Gagal dibaca" }[s.st] || s.st) + '</div><div class="kmo-bt"><button class="g" onclick="PQ_KMO_SV(\'' + KL.indexOf(k) + '\')">Street View</button></div>';
    }
    return h + '</div>';
  }
  function overlay() {
    var M = mapObj();
    if (!M || typeof L === "undefined") return;
    if (!OV) OV = L.layerGroup();
    OV.clearLayers(); OVK = {}; KL = Object.keys(SCAN);
    if (!SET.showMap) { if (M.hasLayer(OV)) M.removeLayer(OV); return; }
    loadData(); if (!M.hasLayer(OV)) OV.addTo(M);
    var by = {}; ROWS.forEach(function (r) { by[r.key] = r; });
    Object.keys(SCAN).forEach(function (k) {
      var s = SCAN[k], r = by[k]; if (!s || !r || s.st === "stop") return;
      OVK[k] = r;
      var stt = stat(s), m;
      if (stt) m = L.marker([r.lat, r.lng], { icon: L.divIcon({ className: "", html: pinHtml(s, stt), iconSize: [58, 22], iconAnchor: [29, 11] }), zIndexOffset: stt === "acc" ? 900 : 1000 });
      else m = L.marker([r.lat, r.lng], { icon: L.divIcon({ className: "", html: '<div class="kmo-pin kmo-n"></div>', iconSize: [10, 10], iconAnchor: [5, 5] }), zIndexOffset: 500 });
      m.bindPopup(function () { return popupHtml(k); }, { minWidth: 190 });
      OV.addLayer(m);
    });
  }
  window.PQ_KMO_ACT = function (k, act) {
    k = KL[k]; var s = SCAN[k]; if (!s) return;
    if (act === "acc") { s.acc = 1; s.rej = 0; } else { s.rej = 1; s.acc = 0; }
    jset(K_SCAN, SCAN); applyAll(); render();
    try { var M = mapObj(); M && M.closePopup(); } catch (e) {}
  };
  window.PQ_KMO_SV = function (k) {
    k = KL[k]; var r = OVK[k]; if (!r) return;
    try { mapObj().closePopup(); } catch (e) {}
    if (window.openStreetViewForGeoResult) window.openStreetViewForGeoResult(r.lat, r.lng, "KM " + C.kmFmt(r.km));
    else window.open("https://www.google.com/maps?q=&layer=c&cbll=" + r.lat + "," + r.lng, "_blank", "noopener");
  };

  function build() {
    var pan = document.querySelector("#pkPanel .body"); if (!pan || $("kmoBox")) return !!$("kmoBox");
    loadData();
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var d = document.createElement("details"); d.className = "kmo"; d.id = "kmoBox";
    d.innerHTML = '<summary>OCR patok KM (Street View) — koreksi angka geometri</summary>' +
      '<div class="r"><small>Membaca pelat patok asli di Street View. Titik tanpa panorama/patok dilewati; angka geometri tidak diubah.</small></div>' +
      '<div class="q"><i id="kmoQ" style="width:0"></i></div><small id="kmoQt"></small>' +
      '<div class="r"><label>Batas kuota gambar/bln <input type="number" id="kmoCap" min="0" step="500"></label><label>Radius <input type="number" id="kmoRad" min="0" step="15"> m</label><label>Langkah <input type="number" id="kmoStep" min="8" step="1"> m</label></div>' +
      '<div class="r"><label>Maks titik dicoba/ruas <input type="number" id="kmoPer" min="1" max="10"></label><label>Cakupan <select id="kmoScope"><option value="all">Semua ruas estimasi</option><option value="filter">Ruas yang dipilih di filter</option></select></label></div>' +
      '<div class="r"><label>Angka patok <select id="kmoMode"><option value="b">Baris bawah (KM ruas)</option><option value="a">Baris atas</option></select></label><label><input type="checkbox" id="kmoDer"> Turunkan ke titik lain di ruas yang sama</label></div>' +
      '<div class="r"><label><input type="checkbox" id="kmoMap"> Tampilkan hasil OCR di peta</label><label><input type="checkbox" id="kmoMan"> Verifikasi manual (hasil terbaca pun harus diterima dulu)</label></div>' +
      '<div class="r"><small>Peta: <b style="color:#4ade80">hijau</b> diterima · <b style="color:#38bdf8">biru</b> menunggu verifikasi · <b style="color:#fbbf24">oranye</b> ragu · <b style="color:#f87171">merah</b> ditolak · titik abu = dilewati</small></div>' +
      '<div class="r"><button class="g" id="kmoAccAll">Terima semua terbaca</button><button class="g" id="kmoRejRagu">Tolak semua ragu</button></div>' +
      '<div class="r"><button id="kmoRun">Mulai OCR</button><button class="d" id="kmoStop" disabled>Jeda</button><button class="g" id="kmoOne">OCR titik terpilih</button><span id="kmoSel" style="opacity:.8"></span></div>' +
      '<div class="r"><label class="g">Uji dari gambar: <input type="file" id="kmoFile" accept="image/*"></label></div>' +
      '<div class="st" id="kmoStat"></div><div id="kmoList"></div>' +
      '<div class="r"><button class="g" id="kmoApply">Terapkan &amp; muat ulang peta</button><button class="g" id="kmoCsv">Ekspor CSV</button><button class="g" id="kmoJson">Ekspor JSON</button><button class="d" id="kmoClr">Hapus hasil</button></div>';
    pan.insertBefore(d, pan.firstChild);
    $("kmoCap").value = SET.cap; $("kmoRad").value = SET.radius; $("kmoStep").value = SET.step; $("kmoPer").value = SET.perRuas;
    $("kmoScope").value = SET.scope || "all"; $("kmoMode").value = SET.mode; $("kmoDer").checked = !!SET.derive; $("kmoMap").checked = SET.showMap !== false; $("kmoMan").checked = !!SET.manual;
    function sv() { SET.cap = +$("kmoCap").value || 0; SET.radius = +$("kmoRad").value || 0; SET.step = Math.max(8, +$("kmoStep").value || 15); SET.perRuas = Math.max(1, +$("kmoPer").value || 3); SET.scope = $("kmoScope").value; SET.mode = $("kmoMode").value; SET.derive = $("kmoDer").checked; SET.showMap = $("kmoMap").checked; SET.manual = $("kmoMan").checked; jset(K_SET, SET); applyAll(); ui(); render(); }
    ["kmoCap", "kmoRad", "kmoStep", "kmoPer", "kmoScope", "kmoMode", "kmoDer", "kmoMap", "kmoMan"].forEach(function (id) { $(id).onchange = sv; });
    $("kmoRun").onclick = function () { sv(); runBatch(); };
    $("kmoStop").onclick = function () { RUN.stop = true; say("Menjeda…"); };
    $("kmoOne").onclick = function () { sv(); runOne(RUN.sel); };
    $("kmoFile").onchange = function () { testFile(this.files[0]); this.value = ""; };
    $("kmoApply").onclick = function () { sv(); location.reload(); };
    $("kmoClr").onclick = function () { if (confirm("Hapus semua hasil OCR patok dan kembalikan angka geometri?")) { SCAN = {}; jset(K_SCAN, SCAN); jset(K_AP, {}); render(); say("Hasil dihapus. Muat ulang untuk mengembalikan peta."); } };
    $("kmoAccAll").onclick = function () { var n = 0; Object.keys(SCAN).forEach(function (k) { var s = SCAN[k]; if (s && s.st === "ok" && !s.rej && !s.acc) { s.acc = 1; n++; } }); jset(K_SCAN, SCAN); applyAll(); render(); say(n + " hasil terbaca diterima."); };
    $("kmoRejRagu").onclick = function () { var n = 0; Object.keys(SCAN).forEach(function (k) { var s = SCAN[k]; if (s && s.st === "ragu" && !s.acc && !s.rej) { s.rej = 1; n++; } }); jset(K_SCAN, SCAN); applyAll(); render(); say(n + " hasil ragu ditolak."); };
    $("kmoList").onclick = function (e) {
      var b = e.target.closest("button[data-act]"); if (!b) return; var s = SCAN[b.dataset.k]; if (!s) return;
      if (b.dataset.act === "loc") { var r = OVK[b.dataset.k], M = mapObj(); if (r && M) { M.flyTo([r.lat, r.lng], 18, { duration: .6 }); setTimeout(function () { OV && OV.eachLayer(function (l) { var ll = l.getLatLng && l.getLatLng(); if (ll && Math.abs(ll.lat - r.lat) < 1e-9 && Math.abs(ll.lng - r.lng) < 1e-9) l.openPopup(); }); }, 700); } return; }
      if (b.dataset.act === "acc") { s.acc = 1; s.rej = 0; } else { s.rej = 1; s.acc = 0; }
      jset(K_SCAN, SCAN); applyAll(); render();
    };
    $("kmoJson").onclick = function () { dl("petaqu-kmocr.json", JSON.stringify({ scan: SCAN, applied: jget(K_AP, {}) }, null, 1), "application/json"); };
    $("kmoCsv").onclick = function () {
      var ap = jget(K_AP, {}), rows = [["ruas", "label_geometri_km", "status", "angka_atas", "angka_bawah", "km_dipakai", "turunan", "kota_terbaca", "panorama", "tanggal_foto", "lat_pano", "lng_pano"]];
      Object.keys(SCAN).forEach(function (k) { var s = SCAN[k]; rows.push([s.ruas, C.kmFmt(s.km0), s.st, s.a == null ? "" : s.a, s.b == null ? "" : s.b, ap[k] ? ap[k].km : "", ap[k] && ap[k].d ? "ya" : "", (s.kota || []).join("; "), s.pano || "", s.date || "", s.plat ? s.plat.lat : "", s.plat ? s.plat.lng : ""]); });
      Object.keys(ap).forEach(function (k) { if (!SCAN[k]) rows.push([k.split("|")[1], "", "turunan", "", "", ap[k].km, "ya", "", "", "", "", ""]); });
      dl("petaqu-kmocr.csv", "﻿" + rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(","); }).join("\n"), "text/csv");
    };
    // titik terpilih = item terakhir yang diklik di daftar Patok KM
    $("pkList").addEventListener("click", function (e) {
      var it = e.target.closest(".pk-item"); if (!it) return; RUN.sel = +it.dataset.i;
      var r = DATA[RUN.sel]; $("kmoSel").textContent = r ? "dipilih: KM " + r[2] + " · " + String(r[3]).slice(0, 28) : "";
    }, true);
    render(); return true;
  }
  function dl(name, text, type) {
    var a = document.createElement("a"), u = URL.createObjectURL(new Blob([text], { type: type }));
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 500);
  }
  function boot(n) { if (build()) return; if (n < 100) setTimeout(function () { boot(n + 1); }, 300); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { boot(0); }); else boot(0);

  window.PQ_KMOCR = { core: C, scan: SCAN, settings: SET, runOne: runOne, runBatch: runBatch, applyAll: applyAll };
})(typeof window !== "undefined" ? window : globalThis);
