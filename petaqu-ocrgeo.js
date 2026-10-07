/* ==========================================================================
   PETAQU – OCR-GEO: baca koordinat dari TEKS di dalam foto (tanpa tag GPS/EXIF)
   Cocok untuk foto dari aplikasi GPS Map Camera / Timemark / Solocator / watermark
   survei, atau screenshot Google Maps. Terhubung otomatis ke "Upload Foto Geotag"
   dan "Foto dari Folder" (fallback saat EXIF GPS kosong) → langsung jadi titik peta.

   Kecerdasan:
   • OCR Tesseract (jalan di HP/browser, gratis, tanpa API key; cache offline)
   • Multi-pass: crop bawah/atas/tengah + kontras otomatis + inversi + binarisasi Otsu,
     berhenti dini jika sudah yakin → cepat; banyak foto diproses berurutan
   • Parser tahan salah-baca OCR: desimal (titik/koma), label Lat/Long/Lintang/Bujur,
     DMS (7°12'34.5"S, LS/BT/BB), derajat-menit desimal, UTM zona 46–54 → lat/lng,
     tanda minus hilang → otomatis dikoreksi ke belahan bumi selatan, lat/lng tertukar
   • Skor keyakinan + voting antar-pass + validasi wilayah (Jateng/DIY diprioritaskan)
   • Ikut membaca tanggal-jam & alamat pada watermark

   API: PQ_OCRGEO.read(file, exifTime) → {lat,lng,time,conf,low,fmt,alt[]} | null
        PQ_OCRGEO.parse(teks)          → daftar kandidat koordinat (untuk uji/modul lain)
   ========================================================================== */
(function () {
  "use strict";
  if (window.PQ_OCRGEO) return;

  var BB = { w: 108.45, s: -8.40, e: 111.80, n: -5.65 };   // Jateng + DIY
  var ID = { w: 94.5, s: -11.5, e: 141.5, n: 6.5 };        // Indonesia (cadangan)
  var TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var LANG = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int";
  var PASSES = [
    { r: [0.60, 1.00], m: "auto", psm: 6 },   // watermark GPS kamera umumnya di bawah
    { r: [0.00, 1.00], m: "auto", psm: 11 },  // seluruh foto, teks tersebar
    { r: [0.00, 0.35], m: "auto", psm: 6 },   // atas
    { r: [0.60, 1.00], m: "bin", psm: 6 },    // bawah, hitam-putih (Otsu)
    { r: [0.00, 1.00], m: "bin", psm: 11 },
    { r: [0.30, 0.70], m: "auto", psm: 6 }    // tengah
  ];
  var worker = null, wLoad = null, idleT = null, chain = Promise.resolve(), warned = false;

  function inB(b, a, c) { return a >= b.s && a <= b.n && c >= b.w && c <= b.e; }
  function say(msg) {
    try {
      var el = document.getElementById("pqUploadStatus");
      if (el && el.classList.contains("show") && el.className.indexOf("pq-error") < 0) el.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> ' + msg;
    } catch (e) {}
  }
  function meters(a, b, c, d) {
    var r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r * Math.cos(a * r);
    return Math.sqrt(x * x + y * y) * 6371000;
  }

  /* ------------------------------ UTM → lat/lng ------------------------------ */
  function utm(z, band, E, N) {
    var south = !band || /[C-MS]/i.test(band) || N > 8.5e6;
    var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
    var A = a / (1 + n) * (1 + n2 / 4 + n4 / 64);
    var x = E - 5e5, y = south ? N - 1e7 : N, xi = y / (k0 * A), eta = x / (k0 * A);
    var b = [n / 2 - 2 * n2 / 3 + 37 * n3 / 96, n2 / 48 + n3 / 15, 17 * n3 / 480];
    var d = [2 * n - 2 * n2 / 3 - 2 * n3, 7 * n2 / 3 - 8 * n3 / 5, 56 * n3 / 15];
    var xp = xi, ep = eta, j;
    for (j = 1; j <= 3; j++) { xp -= b[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= b[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
    var chi = Math.asin(Math.sin(xp) / Math.cosh(ep)), phi = chi;
    for (j = 1; j <= 3; j++) phi += d[j - 1] * Math.sin(2 * j * chi);
    var lam = (z * 6 - 183) * Math.PI / 180 + Math.atan2(Math.sinh(ep), Math.cos(xp));
    return { lat: phi * 180 / Math.PI, lng: lam * 180 / Math.PI };
  }

  /* --------------------------------- Parser ---------------------------------- */
  function norm(t) {
    t = String(t || "")
      .replace(/[\u2212\u2012-\u2015]/g, "-").replace(/[\u00BA\u02DA\u2070]/g, "\u00B0")
      .replace(/[\u2032\u2019\u2018`\u00B4]/g, "'").replace(/[\u2033\u201D\u201C]/g, '"')
      .replace(/\r?\n/g, " ");
    t = t.replace(/(\d)\s*\*\s*(?=\d)/g, "$1\u00B0 ").replace(/(\d)\s*[oO]\s*(?=\d{1,2}\s?')/g, "$1\u00B0");
    for (var i = 0; i < 2; i++) {
      t = t.replace(/(\d)[Oo](?=\d)/g, function (m, d) { return d + "0"; }).replace(/(\d)[Il|](?=\d)/g, function (m, d) { return d + "1"; });
    }
    return t.replace(/''/g, '"').replace(/\s+/g, " ");
  }
  function mkc(lat, lng, fmt, raw, o) {
    o = o || {};
    var z = inB(BB, lat, lng) ? 1 : 0.6;
    var s = { dec: 0.55, dms: 0.65, utm: 0.6 }[fmt] + 0.2 * z + (o.lab ? 0.1 : 0) + (o.prec ? 0.05 : 0) - (o.pen || 0);
    return { lat: lat, lng: lng, fmt: fmt, score: Math.min(0.99, Math.max(0.05, s)), votes: 1, raw: String(raw).slice(0, 70) };
  }
  // pilih urutan lat/lng & tanda terbaik; a,b = {v: nilai bertanda, ex: tanda eksplisit}
  function resolve(a, b, known) {
    var opts = [[a, b, 0]], best = null;
    if (!known) opts.push([b, a, 0.05]);
    opts.forEach(function (o) {
      var ps = [[o[0].v, o[1].v, o[2]]];
      if (!o[0].ex) ps.push([-o[0].v, o[1].v, o[2] + 0.15]);      // minus hilang → belahan selatan
      ps.forEach(function (p) {
        var zn = inB(BB, p[0], p[1]) ? 1 : inB(ID, p[0], p[1]) ? 0.6 : 0;
        if (!zn) return;
        var s = zn - p[2];
        if (!best || s > best.s) best = { lat: p[0], lng: p[1], pen: p[2], s: s };
      });
    });
    return best;
  }
  function parseText(raw) {
    var t = norm(raw), c = [], HM = "LS|LU|BT|BB|[NSEW]", m;
    function hs(h) { if (!h) return 0; h = h.toUpperCase(); return (h === "S" || h === "W" || h === "LS" || h === "BB") ? -1 : 1; }
    function ax(h) { if (!h) return ""; h = h.toUpperCase(); return (h === "N" || h === "S" || h === "LU" || h === "LS") ? "lat" : "lon"; }
    function tk(h, val, neg, lab) {
      var a = ax(h); if (!a && lab) a = /^(lat|lint)/i.test(lab) ? "lat" : "lon";
      var s = hs(h); return { a: a, v: s ? s * val : (neg ? -val : val), ex: !!(s || neg), lab: !!(h || lab), p: 0 };
    }
    function pair(toks, fmt) {
      for (var i = 0; i < toks.length - 1;) {
        var a = toks[i], b = toks[i + 1];
        if (a.a && b.a && a.a === b.a) { i++; continue; }
        var la = a, lo = b; if (a.a === "lon" || b.a === "lat") { la = b; lo = a; }
        var r = resolve(la, lo, !!(a.a || b.a));
        if (r) { c.push(mkc(r.lat, r.lng, fmt, "", { pen: r.pen, lab: a.lab || b.lab, prec: fmt === "dec" && a.p >= 5 && b.p >= 5 })); i += 2; }
        else i++;
      }
    }
    // 1) UTM
    var reU = /(?:utm\s*)?\b(4[6-9]|5[0-4])\s*([C-HJ-NP-Xc-hj-np-x])?\s*[,:;]?\s*(?:E|mE|easting|x)?\s*[:=]?\s*(\d{5,7})(?:[.,]\d+)?\s*(?:m\s*E)?\s*[,;\/ ]\s*(?:N|mN|northing|y)?\s*[:=]?\s*(\d{6,8})(?:[.,]\d+)?/gi;
    t = t.replace(reU, function (all, z, band, e, n) {
      e = +e; n = +n;
      if (e >= 1e5 && e <= 9e5) { var r = utm(+z, band, e, n); if (r && inB(ID, r.lat, r.lng)) c.push(mkc(r.lat, r.lng, "utm", all, { lab: /utm/i.test(all) })); }
      return " ";
    });
    // 2) DMS dengan simbol
    var reD = new RegExp("(?:\\b(" + HM + ")\\b\\s*[:=]?\\s*)?(-?\\d{1,3})\\s*\u00B0\\s*(\\d{1,2})\\s*'\\s*(\\d{1,2}(?:[.,]\\d{1,6})?)\\s*[\"']{0,2}\\s*(?:\\b(" + HM + ")\\b)?", "gi");
    var toks = [];
    t = t.replace(reD, function (all, h1, d, mi, se, h2) {
      var neg = d.charAt(0) === "-", v = Math.abs(+d) + (+mi) / 60 + parseFloat(String(se).replace(",", ".")) / 3600;
      toks.push(tk(h1 || h2, v, neg, "")); return " ";
    });
    // 2b) DMS tanpa simbol menit/detik tapi ada hemisfer
    var reD2 = new RegExp("(?:\\b(" + HM + ")\\b\\s*[:=]?\\s*)?(-?\\d{1,3})\\s*\u00B0?\\s+(\\d{1,2})\\s+(\\d{1,2}[.,]\\d{1,4})\\s*[\"']*\\s*\\b(" + HM + ")\\b", "gi");
    t = t.replace(reD2, function (all, h1, d, mi, se, h2) {
      var neg = d.charAt(0) === "-", v = Math.abs(+d) + (+mi) / 60 + parseFloat(String(se).replace(",", ".")) / 3600;
      toks.push(tk(h1 || h2, v, neg, "")); return " ";
    });
    pair(toks, "dms");
    // 3) Derajat + menit desimal
    var reM = new RegExp("(?:\\b(" + HM + ")\\b\\s*[:=]?\\s*)?(-?\\d{1,3})\\s*\u00B0\\s*(\\d{1,2}[.,]\\d{2,})\\s*'?\\s*(?:\\b(" + HM + ")\\b)?", "gi");
    toks = [];
    t = t.replace(reM, function (all, h1, d, mi, h2) {
      var neg = d.charAt(0) === "-", v = Math.abs(+d) + parseFloat(String(mi).replace(",", ".")) / 60;
      toks.push(tk(h1 || h2, v, neg, "")); return " ";
    });
    pair(toks, "dms");
    // 4) Desimal
    var reN = new RegExp("(?:\\b(lat(?:itude)?|lintang|lng|lon(?:g(?:itude)?)?|bujur)\\b\\.?\\s*[:=]?\\s*)?(?:\\b(" + HM + ")\\b\\s*[:=]?\\s*)?(-?\\d{1,3}[.,]\\d{3,})\\s*\u00B0?\\s*(?:\\b(" + HM + ")\\b)?", "gi");
    toks = [];
    t.replace(reN, function (all, lab, h1, num, h2) {
      var neg = num.charAt(0) === "-", s = num.replace("-", "").replace(",", ".");
      var o = tk(h1 || h2, parseFloat(s), neg, lab); o.p = (s.split(".")[1] || "").length; toks.push(o); return " ";
    });
    pair(toks, "dec");
    return merge([], c);
  }
  // gabung kandidat; yang berdekatan (<30 m) dianggap sama → votes naik
  function merge(a, b) {
    var out = a.slice();
    b.forEach(function (x) {
      var hit = null;
      out.forEach(function (y) { if (!hit && meters(x.lat, x.lng, y.lat, y.lng) < 30) hit = y; });
      if (hit) { hit.votes += x.votes || 1; if (x.score > hit.score) { hit.lat = x.lat; hit.lng = x.lng; hit.fmt = x.fmt; hit.score = x.score; } }
      else out.push({ lat: x.lat, lng: x.lng, fmt: x.fmt, score: x.score, votes: x.votes || 1, raw: x.raw });
    });
    out.forEach(function (y) { y.eff = Math.min(0.99, y.score + 0.04 * (y.votes - 1)); });
    return out.sort(function (p, q) { return q.eff - p.eff; });
  }
  function extras(raw) {
    var lines = String(raw || "").split(/\n/).map(function (l) { return l.trim(); });
    var addr = lines.filter(function (l) {
      return l.length > 8 && /(desa|kel(?:urahan)?\.?\s|kec(?:amatan)?\.?\s|kab(?:upaten)?\.?\s|kota\s|jl\.?\s|jalan\s|jawa tengah|yogyakarta|indonesia)/i.test(l) && !/\d{1,3}[.,]\d{4,}/.test(l);
    }).slice(0, 2).join(", ");
    var ts = null, m = String(raw || "").match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})(?:[ ,T]+(\d{1,2})[:.](\d{2}))?/);
    if (m) ts = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
    else if ((m = String(raw || "").match(/(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[ ,T]+(\d{1,2})[:.](\d{2}))?/))) ts = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    if (ts && (isNaN(ts.getTime()) || ts.getFullYear() < 2005 || ts > Date.now() + 864e5)) ts = null;
    return { addr: addr, time: ts ? ts.toISOString() : null };
  }

  /* ----------------------------- Gambar & OCR -------------------------------- */
  function loadBmp(file) {
    var p = window.createImageBitmap ? createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return createImageBitmap(file); }) : Promise.reject();
    return p.catch(function () {
      return new Promise(function (res, rej) {
        var u = URL.createObjectURL(file), im = new Image();
        im.onload = function () { res(im); }; im.onerror = rej; im.src = u;
      });
    });
  }
  function prep(b, p) {
    var bw = b.width || b.naturalWidth, bh = b.height || b.naturalHeight;
    var sy = Math.round(p.r[0] * bh), sh = Math.max(20, Math.min(bh - sy, Math.round((p.r[1] - p.r[0]) * bh)));
    var W = Math.max(1000, Math.min(2000, bw)), sc = W / bw, H = Math.max(20, Math.round(sh * sc));
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var x = cv.getContext("2d", { willReadFrequently: true }); x.imageSmoothingQuality = "high";
    x.drawImage(b, 0, sy, bw, sh, 0, 0, W, H);
    var id = x.getImageData(0, 0, W, H), d = id.data, n = W * H, g = new Uint8Array(n), h1 = new Uint32Array(256), i, k, v;
    for (i = 0, k = 0; i < n; i++, k += 4) { v = (d[k] * 299 + d[k + 1] * 587 + d[k + 2] * 114) / 1000 | 0; g[i] = v; h1[v]++; }
    var lo = 0, hi = 255, acc = 0;
    for (lo = 0; lo < 255 && (acc += h1[lo]) < n * 0.02; lo++);
    acc = 0; for (hi = 255; hi > 0 && (acc += h1[hi]) < n * 0.02; hi--);
    if (hi - lo < 30) { lo = 0; hi = 255; }
    var h2 = new Uint32Array(256), s2 = 0;
    for (i = 0; i < n; i++) { v = (g[i] - lo) * 255 / (hi - lo); v = v < 0 ? 0 : v > 255 ? 255 : v | 0; g[i] = v; h2[v]++; s2 += v; }
    var inv = false, t = -1;
    if (p.m === "bin") {
      var wB = 0, sB = 0, mx = 0, q;
      for (q = 0; q < 256; q++) {
        wB += h2[q]; if (!wB) continue; var wF = n - wB; if (!wF) break;
        sB += q * h2[q]; var mB = sB / wB, mF = (s2 - sB) / wF, bt = wB * wF * (mB - mF) * (mB - mF);
        if (bt > mx) { mx = bt; t = q; }
      }
      if (t < 0) t = 127;
      var white = 0; for (q = t + 1; q < 256; q++) white += h2[q];
      inv = white < n / 2;                       // teks = kelompok minoritas → jadikan hitam
    } else inv = (s2 / n) < 115;                 // latar gelap + teks terang → balik
    for (i = 0, k = 0; i < n; i++, k += 4) {
      var o = g[i]; if (t >= 0) o = o > t ? 255 : 0; if (inv) o = 255 - o;
      d[k] = d[k + 1] = d[k + 2] = o; d[k + 3] = 255;
    }
    x.putImageData(id, 0, 0);
    return cv;
  }
  function loadTess() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = TESS; s.onload = res;
      s.onerror = function () { rej(new Error("OCR tidak bisa dimuat")); }; document.head.appendChild(s);
    });
  }
  function getW() {
    clearTimeout(idleT);
    if (worker) return Promise.resolve(worker);
    if (wLoad) return wLoad;
    wLoad = loadTess().then(function () {
      return Tesseract.createWorker("eng", 1, { langPath: LANG }).catch(function () { return Tesseract.createWorker("eng"); });
    }).then(function (w) { worker = w; wLoad = null; return w; }, function (e) { wLoad = null; throw e; });
    return wLoad;
  }
  function releaseSoon() {
    clearTimeout(idleT);
    idleT = setTimeout(function () { if (worker) { try { worker.terminate(); } catch (e) {} worker = null; } }, 90000);
  }

  function one(file, exifTime) {
    var name = (file && file.name) || "foto";
    say("Membaca teks koordinat di foto: " + name + " …");
    return loadBmp(file).then(function (bmp) {
      var best = [], texts = [], i = 0;
      function done() { try { if (bmp.close) bmp.close(); } catch (e) {} }
      return getW().then(function (w) {
        function next() {
          if (i >= PASSES.length) return;
          var p = PASSES[i++]; say("OCR " + name + " — tahap " + i + "/" + PASSES.length + " …");
          var cv = prep(bmp, p);
          return w.setParameters({ tessedit_pageseg_mode: String(p.psm) })
            .then(function () { return w.recognize(cv); })
            .then(function (r) {
              var tx = (r && r.data && r.data.text) || ""; texts.push(tx); cv.width = cv.height = 0;
              best = merge(best, parseText(tx));
              var b0 = best[0]; if (b0 && (b0.eff >= 0.9 || (b0.eff >= 0.78 && b0.votes >= 2))) return;
              return next();
            });
        }
        return next();
      }).then(function () {
        done();
        var all = texts.join("\n");
        if (!best.length) best = merge([], parseText(all));
        var top = best[0]; if (!top || top.eff < 0.45) return null;
        var ex = extras(all), lm = file && file.lastModified ? new Date(file.lastModified).toISOString() : null;
        return {
          lat: top.lat, lng: top.lng, time: exifTime || ex.time || lm, accuracy: null, altitude: null,
          ocr: true, fmt: top.fmt, conf: Math.round(top.eff * 100), low: top.eff < 0.6, addr: ex.addr,
          alt: best.slice(1, 4).map(function (c) { return { lat: c.lat, lng: c.lng, conf: Math.round(c.eff * 100) }; })
        };
      }, function (e) { done(); throw e; });
    });
  }
  function read(file, exifTime) {
    var p = chain.then(function () { return one(file, exifTime); }).catch(function (e) {
      if (!warned && window.toast) { warned = true; window.toast("Pembaca teks foto (OCR) belum bisa jalan: " + (e && e.message || e) + " — butuh internet saat pertama kali.", true); }
      return null;
    }).then(function (r) { releaseSoon(); return r; });
    chain = p.then(function () {}, function () {});
    return p;
  }

  window.PQ_OCRGEO = { read: read, parse: parseText, utm: utm, extras: extras };
})();
