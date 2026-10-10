/* ==========================================================================
   PETAQU – DRONE SURVEI JALAN & JEMBATAN (termurah → termahal) + PERENCANA MISI CERDAS

   Isi   : katalog 11 drone (entry → enterprise/LiDAR), tiap drone dihitung otomatis untuk ruas Anda:
           tinggi terbang untuk GSD target, lebar sapuan, jumlah jalur, kecepatan (dibatasi interval
           jepret), jumlah sortie (batas VLOS ±500 m & baterai 70%), jumlah hari, volume data, akurasi.
   Cerdas: • tujuan (inspeksi / ortofoto / ukur-DED / jembatan 3D / DTM-LiDAR) → syarat otomatis
             (GSD, RTK/PPK, rana mekanik, LiDAR)
           • lebar koridor & tutupan pohon DIISI OTOMATIS dari hasil Ukur Jeda terakhir
           • pohon rapat → fotogrametri tidak menembus tajuk → disarankan LiDAR
           • rekomendasi: termurah yang memenuhi, tercepat, terbaik dalam anggaran
   Catatan: harga & spesifikasi = PERKIRAAN (USD, bisa berubah/berbeda per dealer) — verifikasi sebelum beli.
   ========================================================================== */
(function () {
  "use strict";
  if (window.PQDrone) return;
  var K = "pq_drone_in_v1";
  /* sw = lebar sensor (mm), f = fokus nyata (mm), w/h = piksel, fly = menit terbang, v = kecepatan petakan maks (m/s),
     shot = interval jepret min (dtk), rtk/mech/lidar = kemampuan, wind = m/s, p = [harga min, maks] USD */
  var D = [
    { id: "neo", n: "DJI Neo", tier: "Entry", p: [180, 250], sw: 6.4, f: 4.4, w: 4000, h: 3000, fly: 18, v: 6, shot: 2, rtk: 0, mech: 0, lidar: 0, wind: 8, avoid: 0, g: 135, note: "sangat murah, ringan; untuk dokumentasi dekat" },
    { id: "mini4k", n: "DJI Mini 4K", tier: "Pemula", p: [280, 400], sw: 6.17, f: 4.3, w: 4000, h: 3000, fly: 31, v: 10, shot: 2, rtk: 0, mech: 0, lidar: 0, wind: 10, avoid: 0, g: 249, note: "249 g, baterai awet; inspeksi visual dasar" },
    { id: "mini4p", n: "DJI Mini 4 Pro / Mini 5 Pro", tier: "Pemula+", p: [750, 1100], sw: 9.8, f: 6.7, w: 8064, h: 6048, fly: 34, v: 12, shot: 2, rtk: 0, mech: 0, lidar: 0, wind: 10.7, avoid: 1, g: 249, note: "sensor besar, hindar rintangan; terbaik per rupiah" },
    { id: "air3s", n: "DJI Air 3S", tier: "Prosumer", p: [1100, 1500], sw: 13.2, f: 8.8, w: 8192, h: 6144, fly: 45, v: 15, shot: 2, rtk: 0, mech: 0, lidar: 0, wind: 12, avoid: 1, g: 724, note: "sensor 1\", 45 mnt, kamera ganda" },
    { id: "m4p", n: "DJI Mavic 4 Pro", tier: "Prosumer+", p: [2000, 3200], sw: 17.3, f: 12, w: 11648, h: 8736, fly: 51, v: 15, shot: 1.5, rtk: 0, mech: 0, lidar: 0, wind: 12, avoid: 1, g: 1063, note: "4/3\" 100 MP, 51 mnt; detail tinggi" },
    { id: "m3e", n: "DJI Mavic 3 Enterprise (+RTK)", tier: "Survei", p: [3500, 5000], sw: 17.3, f: 12.3, w: 5280, h: 3956, fly: 45, v: 15, shot: 0.7, rtk: 1, mech: 1, lidar: 0, wind: 12, avoid: 1, g: 915, note: "rana mekanik + modul RTK; pemetaan ringkas" },
    { id: "m4e", n: "DJI Matrice 4E", tier: "Survei+", p: [3500, 6000], sw: 17.3, f: 12, w: 5280, h: 3956, fly: 49, v: 15, shot: 0.7, rtk: 1, mech: 1, lidar: 0, wind: 12, avoid: 1, g: 1219, note: "RTK bawaan, rana mekanik, misi otomatis" },
    { id: "m350p1", n: "DJI Matrice 350 RTK + Zenmuse P1", tier: "Profesional", p: [15000, 22000], sw: 35.9, f: 35, w: 8192, h: 5460, fly: 38, v: 15, shot: 0.7, rtk: 1, mech: 1, lidar: 0, wind: 15, avoid: 1, g: 6470, note: "full-frame 45 MP, IP55; fotogrametri akurasi tinggi" },
    { id: "wingtra", n: "WingtraOne GEN II (VTOL + PPK)", tier: "Fixed-wing", p: [25000, 40000], sw: 35.9, f: 35, w: 8000, h: 5320, fly: 59, v: 16, shot: 1.5, rtk: 1, mech: 1, lidar: 0, wind: 12, avoid: 0, g: 3700, note: "sayap tetap: koridor panjang sangat efisien (butuh area lepas-landas)" },
    { id: "m350l2", n: "DJI Matrice 350 RTK + Zenmuse L2 (LiDAR)", tier: "LiDAR", p: [25000, 38000], sw: 17.3, f: 12, w: 5280, h: 3956, fly: 35, v: 10, shot: 0.7, rtk: 1, mech: 1, lidar: 1, wind: 15, avoid: 1, g: 6470, note: "LiDAR + RGB: DTM menembus pohon, kabel & struktur" },
    { id: "ent", n: "Kelas enterprise survei (LiDAR long-range / sayap tetap premium)", tier: "Enterprise", p: [45000, 120000], sw: 35.9, f: 35, w: 9504, h: 6336, fly: 60, v: 18, shot: 1, rtk: 1, mech: 1, lidar: 1, wind: 14, avoid: 0, g: 9000, note: "survei nasional skala besar; sewa/jasa sering lebih ekonomis" }
  ];
  var P = {
    visual: { t: "Inspeksi visual (retak, lubang, rambu, drainase)", gsd: 1.5, side: 0.6, fwd: 0.7, rtk: 0, pf: 1 },
    ortho: { t: "Ortofoto / peta kondisi ruas", gsd: 3, side: 0.7, fwd: 0.8, rtk: 0.5, pf: 1 },
    ukur: { t: "Pengukuran / DED / volume (akurasi ≤ 5 cm)", gsd: 2, side: 0.7, fwd: 0.8, rtk: 1, pf: 1 },
    jembatan: { t: "Inspeksi jembatan & model 3D", gsd: 0.8, side: 0.75, fwd: 0.85, rtk: 0, pf: 3, avoid: 1 },
    dtm: { t: "DTM / profil tanah (di bawah vegetasi)", gsd: 3, side: 0.7, fwd: 0.8, rtk: 1, pf: 1, lidarIfCanopy: 1 }
  };
  function $(id) { return document.getElementById(id); }
  function jget(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function idr(usd, kurs) { var v = usd * kurs; return v >= 1e9 ? "Rp " + (v / 1e9).toFixed(2).replace(".", ",") + " M" : "Rp " + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(".", ",") + " jt"; }
  function f1(v, d) { return (+v).toFixed(d == null ? 1 : d).replace(".", ","); }

  /* ---------- perencana misi untuk satu drone ---------- */
  function plan(d, I) {
    var pu = P[I.tujuan] || P.ortho, why = [], warn = [], fail = [];
    var canopy = I.pohon >= 0.3, lidarNeed = pu.lidarIfCanopy && canopy || I.tujuan === "dtm" && canopy;
    var gT = pu.gsd, Ht = gT / 100 * d.f * d.w / d.sw, minH = pu.avoid ? 10 : 30;   /* tinggi (m) untuk GSD target: H = GSD·f·W/sw */
    var H = Math.max(minH, Math.min(120, Ht)), gsd = H * d.sw / (d.f * d.w) * 100;   /* cm/px */
    if (Ht > 120) warn.push("batas 120 m: GSD lebih halus dari target (aman, tetapi foto lebih banyak)");
    if (Ht < minH && gsd > gT) warn.push("tinggi aman min. " + minH + " m (pohon/kabel/struktur) → GSD " + f1(gsd) + " cm lebih kasar dari target " + f1(gT) + " cm");
    if (gsd > gT * 1.25) fail.push("GSD " + f1(gsd) + " cm > target " + f1(gT) + " cm");
    if (pu.rtk === 1 && !d.rtk) fail.push("butuh RTK/PPK (akurasi ≤ 5 cm)");
    if (pu.rtk === 0.5 && !d.rtk) warn.push("tanpa RTK: wajib GCP agar akurasi ≤ 0,5 m");
    if (I.tujuan === "ukur" && d.rtk && !d.mech) warn.push("rana elektronik: tambah GCP");
    if (lidarNeed && !d.lidar) fail.push("tajuk pohon rapat (≈" + Math.round(I.pohon * 100) + "%) → fotogrametri tak menembus tanah; butuh LiDAR");
    if (I.tujuan === "dtm" && !d.lidar && !canopy) warn.push("tanpa LiDAR: DTM = permukaan (DSM); area bervegetasi tidak akurat");
    if (pu.avoid && !d.avoid) warn.push("tanpa sensor hindar rintangan — berisiko dekat struktur jembatan");
    if (I.angin && d.wind < I.angin) fail.push("angin " + I.angin + " m/s > batas drone " + d.wind + " m/s");
    var wf = gsd / 100 * d.w, hf = gsd / 100 * d.h;                     /* sapuan melintang & memanjang (m) */
    var side = d.lidar ? 0.3 : pu.side, fwd = pu.fwd, W = Math.max(I.lebar, 6), n = W <= wf * 0.85 ? 1 : Math.ceil((W - wf) / (wf * (1 - side))) + 1;
    var dist = hf * (1 - fwd), vmax = d.lidar ? d.v : dist / d.shot, v = Math.max(1.5, Math.min(d.v, vmax));
    if (!d.lidar && vmax < 3) warn.push("interval jepret membatasi kecepatan ke " + f1(v) + " m/s (lambat)");
    var Lm = I.panjang * 1000, pf = pu.pf, usable = d.fly * 0.7 * 60 - 120;
    var segMax = Math.max(50, usable * v / (n * pf)), seg = Math.min(1000, segMax), sorties = Math.ceil(Lm / seg);
    var sortieMin = Math.min(d.fly * 0.7, (seg * n * pf / v + 120) / 60), perDay = Math.max(1, Math.floor(300 / (sortieMin + 8)));
    var days = Math.ceil(sorties / perDay), photos = d.lidar ? 0 : Math.round(Lm / dist * n * pf), gb = d.lidar ? Lm / 1000 * n * 1.2 : photos * (d.w * d.h / 1e6) * 0.4 / 1024;
    var acc = d.rtk ? "≈ " + f1(Math.max(3, gsd * 1.5)) + "–" + f1(Math.max(5, gsd * 3), 0) + " cm (RTK/PPK)" : "≈ 1–3 m tanpa GCP; ≈ " + f1(gsd * 2) + "–" + f1(gsd * 3) + " cm dengan GCP";
    if (d.lidar) acc = "≈ 3–10 cm (LiDAR + RTK)";
    var okc = fail.length ? "x" : warn.length ? "w" : "ok";
    return { d: d, H: H, gsd: gsd, wf: wf, n: n, v: v, seg: seg, sorties: sorties, days: days, photos: photos, gb: gb, acc: acc, warn: warn, fail: fail, st: okc, usd: d.p };
  }

  /* ---------- rekomendasi ---------- */
  function analyse(I) {
    var rows = D.map(function (d) { return plan(d, I); }).sort(function (a, b) { return a.usd[0] - b.usd[0]; });
    var el = rows.filter(function (r) { return r.st !== "x"; }), rec = {}, notes = [];
    rec.cheap = el[0] || null;
    rec.fast = el.slice().sort(function (a, b) { return a.days - b.days || a.usd[0] - b.usd[0]; })[0] || null;
    if (I.anggaran > 0) { var inb = el.filter(function (r) { return r.usd[0] * I.kurs <= I.anggaran; }); rec.budget = inb.length ? inb.slice().sort(function (a, b) { return a.gsd - b.gsd || b.usd[0] - a.usd[0]; })[0] : null; }
    if (I.pohon >= 0.3) notes.push("Tutupan pohon ≈ " + Math.round(I.pohon * 100) + "% (dari Ukur Jeda): foto udara hanya menangkap tajuk — untuk profil tanah/DED di bawah pohon pakai LiDAR atau kombinasikan ukur darat.");
    if (I.tujuan === "jembatan") notes.push("Jembatan: terbang nadir + 2 pass miring (×3 jalur), dekati struktur dari sisi, hindari area di bawah dek tanpa sensor/GNSS-denied mode.");
    if (I.panjang >= 20) notes.push("Ruas ≥ 20 km: pertimbangkan fixed-wing/sewa jasa survei — biaya sortie multi-hari drone multirotor menumpuk.");
    notes.push("Aturan: pastikan registrasi/izin operasi (Kemenhub – cek PM 37/2020 & pembaruannya), hindari kawasan KKOP bandara, jaga VLOS, batas tinggi 120 m dipakai konservatif, serta izin pemilik lahan & ruang udara jalan.");
    return { rows: rows, rec: rec, notes: notes };
  }

  /* ---------- UI ---------- */
  var I = Object.assign({ panjang: 5, lebar: 24, tujuan: "ortho", anggaran: 0, kurs: 16500, angin: 0, pohon: 0, auto: 0 }, jget(K, {}));
  function fromJeda() {
    try {
      var s = window.PQJeda && PQJeda.state && PQJeda.state(), A = s && s.A; if (!A || A.W == null) return false;
      var w = A.W + (A.bl > 0 ? A.bl : 0) + (A.br > 0 ? A.br : 0) + (A.dl > 0 ? A.dl : 0) + (A.dr > 0 ? A.dr : 0) + 8;
      I.lebar = Math.round(w); var cv = 0; if (A.tree) [A.tree.L, A.tree.R].forEach(function (t) { if (t && t.cover > cv) cv = t.cover; }); I.pohon = +cv.toFixed(2); I.auto = 1; return true;
    } catch (e) { return false; }
  }
  function css() {
    if ($("pq-drone-css")) return; var st = document.createElement("style"); st.id = "pq-drone-css";
    st.textContent = "#pqDroneBtn{position:fixed;left:10px;bottom:calc(150px + env(safe-area-inset-bottom,0px));z-index:7;width:42px;height:42px;border-radius:50%;border:1px solid #38bdf866;background:#080c14e6;color:#38bdf8;font-size:19px;cursor:pointer}#pqDroneBtn:hover{background:#38bdf8;color:#04121a}" +
      "#pqDrone{position:fixed;inset:0;z-index:99999;background:#050a12f2;display:none;overflow:auto;color:#e6edf5;font:12px/1.45 system-ui,sans-serif;padding:max(10px,env(safe-area-inset-top)) 10px 30px}#pqDrone.show{display:block}" +
      "#pqDrone .w{max-width:880px;margin:0 auto}#pqDrone h2{margin:6px 0;font-size:16px;color:#38bdf8;display:flex;justify-content:space-between;align-items:center}#pqDrone .x{background:#ffffff12;border:1px solid #ffffff22;color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer}" +
      "#pqDrone .f{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;background:#ffffff0a;border:1px solid #ffffff18;border-radius:12px;padding:10px;margin:8px 0}#pqDrone label{display:block;color:#9db3c9;font-size:10.5px}#pqDrone input,#pqDrone select{width:100%;box-sizing:border-box;margin-top:2px;background:#0b1520;border:1px solid #ffffff2a;border-radius:7px;color:#fff;padding:6px;font:inherit}" +
      "#pqDrone .rec{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin:8px 0}#pqDrone .rc{background:#0b2a1f;border:1px solid #34d39966;border-radius:12px;padding:9px}#pqDrone .rc b{color:#34d399}#pqDrone .rc.no{background:#2a1313;border-color:#f8717166}" +
      "#pqDrone .nt{background:#ffffff0a;border-left:3px solid #fde047;padding:6px 9px;margin:5px 0;border-radius:6px;color:#dbe7f3}#pqDrone .c{background:#ffffff08;border:1px solid #ffffff18;border-radius:12px;padding:9px;margin:7px 0}#pqDrone .c.ok{border-color:#34d39977}#pqDrone .c.w{border-color:#fde04788}#pqDrone .c.x{opacity:.62}" +
      "#pqDrone .h{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}#pqDrone .h b{font-size:13px}#pqDrone .tg{font-size:9.5px;padding:1px 7px;border-radius:99px;background:#38bdf822;color:#7dd3fc}#pqDrone .pr{margin-left:auto;font-weight:700;color:#fde68a;font-variant-numeric:tabular-nums}" +
      "#pqDrone .g{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:5px;color:#cfe0f0}#pqDrone .g span i{font-style:normal;color:#8aa4bd}#pqDrone .m{color:#fca5a5;margin-top:3px}#pqDrone .wn{color:#fde68a;margin-top:3px}#pqDrone .sub{color:#8aa4bd}";
    document.head.appendChild(st);
  }
  function render() {
    var R = analyse(I), h = $("pqDrone"), o = '<div class="w"><h2>🛩 Drone Survei — termurah → termahal <button class="x" id="pqDx">✕ Tutup</button></h2>' +
      '<div class="sub">Harga & spesifikasi perkiraan (USD) — verifikasi dealer. Perhitungan memakai GSD, overlap, batas VLOS ±500 m, cadangan baterai 30%.</div><div class="f">' +
      '<label>Tujuan<select id="dTj">' + Object.keys(P).map(function (k) { return '<option value="' + k + '"' + (k === I.tujuan ? " selected" : "") + ">" + esc(P[k].t) + "</option>"; }).join("") + "</select></label>" +
      '<label>Panjang ruas (km)<input id="dPj" type="number" min="0.1" step="0.1" value="' + I.panjang + '"></label>' +
      '<label>Lebar koridor (m)' + (I.auto ? " · otomatis dari Ukur Jeda" : "") + '<input id="dLb" type="number" min="6" step="1" value="' + I.lebar + '"></label>' +
      '<label>Tutupan pohon (0–1)' + (I.auto ? " · otomatis" : "") + '<input id="dPh" type="number" min="0" max="1" step="0.05" value="' + I.pohon + '"></label>' +
      '<label>Angin lapangan (m/s)<input id="dAg" type="number" min="0" step="1" value="' + I.angin + '"></label>' +
      '<label>Anggaran alat (Rp, opsional)<input id="dBg" type="number" min="0" step="1000000" value="' + I.anggaran + '"></label>' +
      '<label>Kurs (Rp/USD)<input id="dKs" type="number" min="10000" step="100" value="' + I.kurs + '"></label></div>';
    function rc(t, r, extra) { return r ? '<div class="rc"><b>' + t + "</b><br>" + esc(r.d.n) + '<br><span class="sub">' + idr(r.usd[0], I.kurs) + " – " + idr(r.usd[1], I.kurs) + " · " + r.days + " hari · GSD " + f1(r.gsd) + " cm" + (extra || "") + "</span></div>" : '<div class="rc no"><b>' + t + '</b><br><span class="sub">tidak ada yang memenuhi</span></div>'; }
    o += '<div class="rec">' + rc("✅ Termurah yang memenuhi", R.rec.cheap) + rc("⚡ Paling cepat selesai", R.rec.fast) + (I.anggaran > 0 ? rc("💰 Terbaik dalam anggaran", R.rec.budget) : "") + "</div>";
    R.notes.forEach(function (n) { o += '<div class="nt">' + esc(n) + "</div>"; });
    R.rows.forEach(function (r) {
      var d = r.d;
      o += '<div class="c ' + r.st + '"><div class="h"><b>' + (r.st === "ok" ? "✔ " : r.st === "w" ? "⚠ " : "✖ ") + esc(d.n) + '</b><span class="tg">' + d.tier + '</span><span class="pr">' + idr(r.usd[0], I.kurs) + " – " + idr(r.usd[1], I.kurs) + '</span></div><div class="sub">' + esc(d.note) + " · " + d.fly + " mnt · " + d.g + " g" + (d.rtk ? " · RTK/PPK" : "") + (d.mech ? " · rana mekanik" : "") + (d.lidar ? " · LiDAR" : "") + " · angin ≤ " + d.wind + " m/s</div>" +
        '<div class="g"><span><i>tinggi</i> ' + Math.round(r.H) + ' m</span><span><i>GSD</i> ' + f1(r.gsd) + ' cm/px</span><span><i>sapuan</i> ' + Math.round(r.wf) + ' m × ' + r.n + ' jalur</span><span><i>kecepatan</i> ' + f1(r.v) + ' m/s</span><span><i>sortie</i> ' + r.sorties + ' (' + Math.round(r.seg) + ' m/sortie)</span><span><i>hari</i> ' + r.days + '</span><span><i>data</i> ' + (d.lidar ? "≈ " : "") + f1(r.gb) + ' GB' + (r.photos ? " · " + r.photos + " foto" : "") + '</span><span><i>akurasi</i> ' + esc(r.acc) + "</span></div>";
      r.fail.forEach(function (m) { o += '<div class="m">✖ ' + esc(m) + "</div>"; }); r.warn.forEach(function (m) { o += '<div class="wn">⚠ ' + esc(m) + "</div>"; }); o += "</div>";
    });
    h.innerHTML = o + '<div class="sub" style="margin-top:10px">Panduan: pilih berdasarkan tujuan & akurasi, bukan hanya harga. Untuk ruas pendek/sesekali, sewa jasa survei sering lebih murah daripada membeli kelas profesional.</div></div>';
    $("pqDx").onclick = close;
    [["dTj", "tujuan", 0], ["dPj", "panjang", 1], ["dLb", "lebar", 1], ["dPh", "pohon", 1], ["dAg", "angin", 1], ["dBg", "anggaran", 1], ["dKs", "kurs", 1]].forEach(function (q) {
      $(q[0]).onchange = function () { var v = this.value; I[q[1]] = q[2] ? Math.max(0, +v || 0) : v; if (q[1] === "lebar" || q[1] === "pohon") I.auto = 0; if (q[1] === "kurs" && !I.kurs) I.kurs = 16500; if (q[1] === "panjang" && !I.panjang) I.panjang = 1; jset(K, I); render(); };
    });
  }
  function open_() { css(); var h = $("pqDrone"); if (!h) { h = document.createElement("div"); h.id = "pqDrone"; document.body.appendChild(h); } fromJeda(); jset(K, I); render(); h.classList.add("show"); }
  function close() { var h = $("pqDrone"); if (h) h.classList.remove("show"); }
  function init() {
    css(); if ($("pqDroneBtn")) return; var b = document.createElement("button"); b.id = "pqDroneBtn"; b.title = "Drone survei: termurah → termahal + perencana misi"; b.textContent = "🛩"; b.addEventListener("click", open_); document.body.appendChild(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.PQDrone = { open: open_, close: close, catalog: D, plan: plan, analyse: analyse };
})();
