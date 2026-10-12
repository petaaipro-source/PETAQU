/* PETAQU — CCTV Semua Ruas · Semua Provinsi / Kabupaten / Kota.
   Folder "CCTV" di sidebar (di bawah "Jalan Nasional · Semua Kabupaten"), satu grup per kab/kota + provinsi lain.
   Pintar:
   • Tambah CCTV: klik peta → otomatis menempel ke ruas jalan terdekat (nama ruas, kab/kota, ±STA terisi sendiri);
     di luar data ruas → provinsi/kab diisi otomatis lewat geocoder (Nominatim), bisa diedit.
   • Deteksi otomatis jenis sumber: YouTube, HLS (.m3u8), MJPEG, snapshot gambar (auto-refresh 5 dtk), atau iframe.
   • Viewer + Berikutnya/Sebelumnya menyusur ruas, Patroli otomatis, Dinding CCTV (grid 2×3), Cek status (online/offline).
   • CCTV terdekat dari peta / lokasi saya, pencarian (nama, ruas, kab), filter provinsi, ON/OFF peta.
   • Impor/Ekspor JSON & CSV (tempel ratusan CCTV sekaligus), tautan "cari sumber resmi" per kab/kota.
   Data disimpan di perangkat (localStorage). Tidak mengubah data/logika lama. */
(function () {
  "use strict";
  if (window.__pqCctv) return; window.__pqCctv = 1;
  var KEY = "petaqu_cctv_v1", SNAP_MS = 5000, PATROL_MS = 12000, WALL_MAX = 6;
  var DIY = { "Kulon Progo": 1, "Bantul": 1, "Gunungkidul": 1, "Sleman": 1, "Kota Yogyakarta": 1 };
  var st = { cams: [], open: true, groups: {}, show: true, prov: "" };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) {}
  st.cams = st.cams || []; st.groups = st.groups || {};
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  /* ---------- CCTV bawaan: portal live resmi (tautan terverifikasi dari situs pemda/Bina Marga) ----------
     Titik peta = lokasi kamera yang disebut di portal / pusat wilayah (perkiraan). Klik → tombol "Buka CCTV Live". */
  var SEED_V = 2, P = "Jawa Tengah";
  var SEED = [
    ["Simpang Lima 1 (ATCS Semarang)", "https://rtsp.me/embed/iAn9e2Bk/", -6.9904, 110.4229, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Simpang Lima 2 (ATCS Semarang)", "https://rtsp.me/embed/tSZAf4ZG/", -6.9908, 110.4222, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Tugu Muda (ATCS Semarang)", "https://rtsp.me/embed/396ShEYH/", -6.9843, 110.4101, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Tlogosari (ATCS Semarang)", "https://rtsp.me/embed/drZbNihT/", -6.99, 110.465, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Fatmawati (ATCS Semarang)", "https://rtsp.me/embed/hN44Ehb8/", -7.0, 110.47, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Pucang Gading (ATCS Semarang)", "https://rtsp.me/embed/fi23r7kz/", -6.987, 110.458, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Exit Tol Gayamsari (ATCS Semarang)", "https://rtsp.me/embed/FYdfEdB4/", -6.993, 110.452, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Lamper Gajah (ATCS Semarang)", "https://rtsp.me/embed/sdEeK3tn/", -6.999, 110.429, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Milo (ATCS Semarang)", "https://rtsp.me/embed/na58kSb3/", -6.988, 110.445, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Akademik Kepolisian (ATCS Semarang)", "https://rtsp.me/embed/KhFAt63E/", -7.006, 110.418, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Kaliwiru (ATCS Semarang)", "https://rtsp.me/embed/BG3aDz43/", -7.01, 110.409, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Tegalsari (ATCS Semarang)", "https://rtsp.me/embed/5ZberGee/", -7.0085, 110.4235, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Peterongan (ATCS Semarang)", "https://rtsp.me/embed/yZ4BfKFQ/", -6.9985, 110.404, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Abdul Rahman Saleh (ATCS Semarang)", "https://rtsp.me/embed/B5ZDkQ7T/", -6.979, 110.3895, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Thamrin Pandanaran (ATCS Semarang)", "https://rtsp.me/embed/F8GTKiDN/", -6.986, 110.42, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Kyai Saleh (ATCS Semarang)", "https://rtsp.me/embed/R5BeErha/", -6.9875, 110.413, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Hutama Karya (ATCS Semarang)", "https://rtsp.me/embed/hkeEsKBS/", -6.972, 110.382, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Hanoman (ATCS Semarang)", "https://rtsp.me/embed/QQhsQHyn/", -6.978, 110.388, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Kali Banteng 1 (ATCS Semarang)", "https://rtsp.me/embed/Be9hkkQk/", -6.977, 110.387, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["Kali Banteng 2 (ATCS Semarang)", "https://rtsp.me/embed/BtGz97QS/", -6.9775, 110.388, P, "Kota Semarang", "Live ATCS Dishub Kota Semarang. Lokasi perkiraan — gunakan tombol Pindah pin untuk menepatkan.", 0],
    ["PantauSemar · Pantau Lalin Kota Semarang", "https://pantausemar.semarangkota.go.id/?cctv_category_id=fc3ed271-787c-4191-a7dd-fc84314a9f71", -6.9932, 110.4203, P, "Kota Semarang", "Peta CCTV resmi Pemkot Semarang (kategori Pantau Lalin)."],
    ["CCTV Tol Semarang–Batang (Bina Marga)", "https://binamarga.pu.go.id/contents/cctv_tol/?id_ruas=semarang-batang", -6.96, 110.1, P, "Kabupaten Kendal", "Titik perkiraan di tengah ruas tol."],
    ["CCTV Tol Semarang A/B/C (Bina Marga)", "https://binamarga.pu.go.id/contents/cctv_tol/?id_ruas=semarang-abc", -7.03, 110.4, P, "Kota Semarang", "Titik perkiraan."],
    ["CCTV Tol Semarang–Solo (Bina Marga)", "https://binamarga.pu.go.id/contents/cctv_tol/?id_ruas=semarang-solo", -7.2, 110.45, P, "Kabupaten Semarang", "Titik perkiraan (area Bawen)."],
    ["CCTV Tol Semarang–Demak Seksi 2 (Bina Marga)", "https://binamarga.pu.go.id/contents/cctv_tol/?id_ruas=semarang-demak-seksi-2-sayung-demak", -6.91, 110.52, P, "Kabupaten Demak", "Titik perkiraan (Sayung–Demak)."],
    ["ATCS Provinsi Jawa Tengah (Dishub Jateng)", "https://gis.perhubungan.jatengprov.go.id/atcs", -6.9932, 110.4203, P, "Kota Semarang", "Portal ATCS Provinsi Jawa Tengah (banyak kab/kota)."],
    ["CCTV Kota Surakarta (CC Room Dishub)", "https://ccroom-dishub.surakarta.go.id/", -7.5666, 110.8283, P, "Kota Surakarta", "Titik = pusat kota."],
    ["CCTV Kota Salatiga", "https://cctv.salatiga.go.id/", -7.3305, 110.5084, P, "Kota Salatiga", "Titik = pusat kota."],
    ["CCTV Kota Pekalongan", "https://cctv.pekalongankota.go.id/", -6.8886, 109.6753, P, "Kota Pekalongan", "Titik = pusat kota."],
    ["CCTV Kabupaten Rembang", "https://cctv.rembangkab.go.id/", -6.709, 111.342, P, "Kabupaten Rembang", "Titik = pusat kabupaten."],
    ["CCTV Kota Yogyakarta (Jogja Smart Service)", "https://cctv.jogjakota.go.id/", -7.7956, 110.3695, "DI Yogyakarta", "Kota Yogyakarta", "Titik = pusat kota."]
  ];
  function mergeSeed() {
    if (st.seedV === SEED_V) return;
    st.cams = st.cams.filter(function (c) { return !/^seed\d+-/.test(c.id); });
    SEED.forEach(function (r, i) {
      var id = "seed" + SEED_V + "-" + i;
      
      st.cams.push({ id: id, name: r[0], url: r[1], lat: r[2], lng: r[3], prov: r[4], kab: r[5], note: r[6], ruas: "", sta: "", status: "", type: "iframe", portal: r[7] === 0 ? 0 : 1 });
    });
    st.seedV = SEED_V; save();
  }
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var note = function (m, err) { try { if (typeof toast === "function") toast(m, !!err); } catch (e) {} };
  var gmap = function () { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } };
  var uid = function () { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };

  /* ---------- data ruas (dipakai ulang dari blok JSON yang sudah ada) ---------- */
  var JN = null, KB = null, GROUPS = [], SNAPIDX = null;
  try { JN = JSON.parse($("jn-data").textContent); KB = JSON.parse($("kb-data").textContent); } catch (e) {}
  function decode(str) {
    var i = 0, lat = 0, lng = 0, out = [];
    while (i < str.length) {
      var b, sh = 0, r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      lat += (r & 1) ? ~(r >> 1) : (r >> 1); sh = 0; r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      lng += (r & 1) ? ~(r >> 1) : (r >> 1);
      out.push([lat / 1e5, lng / 1e5]);
    }
    return out;
  }
  var kabLabel = function (k) { return k.t === "Kab." ? "Kabupaten " + k.n : (/^Kota\b/.test(k.n) ? k.n : "Kota " + k.n); };
  if (KB) GROUPS = KB.map(function (k) { return { name: kabLabel(k), prov: DIY[k.n] ? "DI Yogyakarta" : "Jawa Tengah" }; });
  function title(s) { return String(s || "").toLowerCase().replace(/(^|[\s(\-\/.])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/\s+/g, " ").trim(); }
  function hav(a, b) {
    var R = 6371000, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
    var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function buildSnap() {   /* indeks segmen semua ruas nasional (sekali, saat pertama dipakai) */
    if (SNAPIDX || !JN || !KB) return SNAPIDX || [];
    SNAPIDX = [];
    KB.forEach(function (k, ki) {
      k.r.forEach(function (r) {
        var R = JN.r[r[0]], acc = 0;
        r[2].forEach(function (s) {
          var p = decode(s);
          for (var i = 1; i < p.length; i++) {
            var d = hav(p[i - 1], p[i]);
            SNAPIDX.push({ a: p[i - 1], b: p[i], d: d, off: acc, ruas: title(R[0]), kab: ki });
            acc += d;
          }
        });
      });
    });
    return SNAPIDX;
  }
  function snapTo(lat, lng) {   /* → {ruas, kab, prov, sta, dist} atau null bila > 300 m dari ruas mana pun */
    var best = null, bd = 1e9, cl = Math.cos(lat * Math.PI / 180);
    buildSnap().forEach(function (s) {
      if (Math.abs(s.a[0] - lat) > .01 && Math.abs(s.b[0] - lat) > .01) return;
      var ax = s.a[1] * cl, ay = s.a[0], bx = s.b[1] * cl, by = s.b[0], px = lng * cl, py = lat;
      var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
      var q = [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t], d = hav([lat, lng], q);
      if (d < bd) { bd = d; best = { s: s, t: t }; }
    });
    if (!best || bd > 300) return null;
    var g = GROUPS[best.s.kab], m = Math.round(best.s.off + best.s.d * best.t);
    return { ruas: best.s.ruas, kab: g.name, prov: g.prov, km: m / 1000, sta: Math.floor(m / 1000) + "+" + ("00" + (m % 1000)).slice(-3), dist: Math.round(bd) };
  }

  /* ---------- deteksi jenis sumber ---------- */
  function detect(u) {
    u = String(u || "").trim();
    var y = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/))([\w-]{11})/);
    if (y) return { type: "yt", id: y[1] };
    if (/\.m3u8(\?|#|$)/i.test(u)) return { type: "hls" };
    if (/\.(mjpg|mjpeg)(\?|$)|mjpg|mjpeg|action=stream/i.test(u)) return { type: "mjpg" };
    if (/\.(jpe?g|png|webp)(\?|#|$)|snapshot|snap\.|\/image/i.test(u)) return { type: "img" };
    return { type: "iframe" };
  }
  var TYPE_LBL = { yt: "YouTube", hls: "HLS", mjpg: "MJPEG", img: "Snapshot", iframe: "Web" };

  /* ---------- peta ---------- */
  var LAY = null, MK = {};
  function layer() { if (!LAY) LAY = L.featureGroup(); return LAY; }
  function icon(c) {
    var col = c.status === "off" ? "#ef4444" : c.status === "on" ? "#22c55e" : "#22d3ee";
    return L.divIcon({ className: "pqcc-ic", html: '<div style="background:' + col + '"><i class="fa-solid fa-video"></i></div>', iconSize: [26, 26], iconAnchor: [13, 13] });
  }
  function drawMarkers() {
    var m = gmap(); if (!m) return;
    layer().clearLayers(); MK = {};
    st.cams.forEach(function (c) {
      var mk = L.marker([c.lat, c.lng], { icon: icon(c), title: c.name, zIndexOffset: 800 });
      mk.on("click", function () { openViewer(c.id); });
      MK[c.id] = mk; layer().addLayer(mk);
    });
    if (st.show) { if (!m.hasLayer(layer())) layer().addTo(m); } else if (m.hasLayer(layer())) m.removeLayer(layer());
  }

  /* ---------- tambah / edit ---------- */
  function addFlow() {
    var m = gmap(); if (!m) return;
    note("Klik lokasi CCTV di peta (otomatis menempel ke ruas terdekat)");
    if (window.innerWidth <= 860 && typeof toggleSidebar === "function") toggleSidebar(false);
    var el = m.getContainer(); el.style.cursor = "crosshair";
    m.once("click", function (e) { el.style.cursor = ""; form({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }); });
  }
  function enrich(c, done) {   /* ruas/kab/prov otomatis */
    var s = snapTo(c.lat, c.lng);
    if (s) { c.ruas = s.ruas; c.kab = s.kab; c.prov = s.prov; c.sta = s.sta; return done(c); }
    c.sta = c.sta || ""; if (c.prov && c.kab) return done(c);
    try {
      fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=id&lat=" + c.lat + "&lon=" + c.lng)
        .then(function (r) { return r.json(); }).then(function (j) {
          var a = (j && j.address) || {};
          c.prov = c.prov || a.state || a.region || "Lainnya"; c.kab = c.kab || a.county || a.city || a.municipality || a.town || "Lainnya"; done(c);
        }).catch(function () { c.prov = c.prov || "Lainnya"; c.kab = c.kab || "Lainnya"; done(c); });
    } catch (e) { c.prov = c.prov || "Lainnya"; c.kab = c.kab || "Lainnya"; done(c); }
  }
  function form(c) {
    var s = (c.lat != null && !c.id) ? snapTo(c.lat, c.lng) : null;
    var d = document.createElement("div"); d.className = "pqcc-ov";
    var f = function (id, lb, v, ph) { return '<label>' + lb + '<input id="pqcc_' + id + '" value="' + esc(v || "") + '" placeholder="' + esc(ph || "") + '"></label>'; };
    d.innerHTML = '<div class="pqcc-card"><h3>' + (c.id ? "Edit" : "Tambah") + ' CCTV</h3>' +
      (s ? '<div class="pqcc-ok">Menempel ke <b>' + esc(s.ruas) + "</b> · " + esc(s.kab) + " · ±STA " + s.sta + " (" + s.dist + " m dari garis ruas)</div>" : (c.id ? "" : '<div class="pqcc-hint">Di luar data ruas nasional — provinsi/kab diisi otomatis, bisa diubah.</div>')) +
      f("name", "Nama CCTV", c.name || (s ? "CCTV " + s.ruas + " STA " + s.sta : ""), "mis. Simpang Tiga Gombong") +
      f("url", "Link stream (YouTube / .m3u8 / MJPEG / snapshot / halaman web)", c.url, "https://...") +
      '<div class="pqcc-row">' + f("lat", "Lat", c.lat) + f("lng", "Lng", c.lng) + "</div>" +
      '<div class="pqcc-row">' + f("prov", "Provinsi", c.prov, "otomatis") + f("kab", "Kab/Kota", c.kab, "otomatis") + "</div>" +
      f("note", "Catatan", c.note) +
      '<div class="pqcc-act"><button data-x="no">Batal</button><button class="pri" data-x="ok">Simpan</button></div></div>';
    document.body.appendChild(d);
    d.addEventListener("click", function (ev) {
      var x = ev.target.getAttribute && ev.target.getAttribute("data-x");
      if (ev.target === d || x === "no") return d.remove();
      if (x !== "ok") return;
      var g = function (id) { return $("pqcc_" + id).value.trim(); };
      var n = { id: c.id || uid(), name: g("name"), url: g("url"), lat: parseFloat(g("lat")), lng: parseFloat(g("lng")), prov: g("prov"), kab: g("kab"), note: g("note"), ruas: c.ruas || "", sta: c.sta || "", status: c.status || "" };
      if (!n.name || isNaN(n.lat) || isNaN(n.lng)) return note("Nama dan koordinat wajib diisi", true);
      n.type = detect(n.url).type;
      enrich(n, function (r) { upsert(r); d.remove(); note("CCTV disimpan" + (r.ruas ? " — " + r.ruas + " STA " + r.sta : "")); });
    });
  }
  function upsert(c) {
    var i = st.cams.findIndex(function (x) { return x.id === c.id; });
    if (i > -1) st.cams[i] = c; else st.cams.push(c);
    save(); drawMarkers(); render();
  }
  var byId = function (id) { return st.cams.filter(function (c) { return c.id === id; })[0]; };

  /* ---------- player ---------- */
  var HLS_URL = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.7/hls.min.js", hlsP = null;
  function loadHls() {
    if (window.Hls) return Promise.resolve();
    return hlsP || (hlsP = new Promise(function (ok, no) { var s = document.createElement("script"); s.src = HLS_URL; s.onload = ok; s.onerror = no; document.head.appendChild(s); }));
  }
  var live = [];   /* timer & instance yang harus dibersihkan */
  function stopAll() { live.forEach(function (x) { try { x(); } catch (e) {} }); live = []; }
  function mountPlayer(host, c) {
    var t = detect(c.url), u = c.url;
    if (c.portal) { host.innerHTML = '<a class="pqcc-go" target="_blank" rel="noopener" href="' + esc(u) + '"><i class="fa-solid fa-play"></i> Buka CCTV Live ↗</a>'; return; }
    if (!u) { host.innerHTML = '<div class="pqcc-none">Belum ada link stream. Klik <b>Edit</b> untuk mengisi.</div>'; return; }
    if (t.type === "yt") host.innerHTML = '<iframe allow="autoplay;fullscreen" allowfullscreen src="https://www.youtube.com/embed/' + t.id + '?autoplay=1&mute=1"></iframe>';
    else if (t.type === "hls") {
      host.innerHTML = '<video muted autoplay playsinline controls></video>'; var v = host.firstChild;
      if (v.canPlayType("application/vnd.apple.mpegurl")) v.src = u;
      else loadHls().then(function () { if (!window.Hls.isSupported()) return; var h = new Hls({ lowLatencyMode: true }); h.loadSource(u); h.attachMedia(v); live.push(function () { h.destroy(); }); }).catch(function () { host.innerHTML = '<div class="pqcc-none">Gagal memuat pemutar HLS.</div>'; });
    } else if (t.type === "mjpg") { host.innerHTML = '<img src="' + esc(u) + '" alt="">'; live.push(function () { host.innerHTML = ""; }); }
    else if (t.type === "img") {
      host.innerHTML = '<img alt="">'; var im = host.firstChild, go = function () { im.src = u + (u.indexOf("?") > -1 ? "&" : "?") + "_t=" + Date.now(); };
      go(); var iv = setInterval(go, SNAP_MS); live.push(function () { clearInterval(iv); });
    } else host.innerHTML = '<iframe allow="autoplay;fullscreen" src="' + esc(u) + '"></iframe><div class="pqcc-hint">Jika kosong, situs memblokir penyematan — pakai tombol <b>Buka</b>.</div>';
  }

  /* ---------- viewer ---------- */
  var V = null, cur = null, patrol = null;
  function listForNav() {   /* urut menyusur ruas: ruas → STA */
    var c = byId(cur); if (!c) return [];
    return st.cams.filter(function (x) { return (c.ruas ? x.ruas === c.ruas : x.kab === c.kab); })
      .sort(function (a, b) { return parseFloat(String(a.sta).replace("+", ".")) - parseFloat(String(b.sta).replace("+", ".")); });
  }
  function openViewer(id) {
    var c = byId(id); if (!c) return; cur = id; stopAll();
    if (!V) { V = document.createElement("div"); V.id = "pqccV"; document.body.appendChild(V); V.addEventListener("click", vClick); }
    var nav = listForNav(), pos = nav.findIndex(function (x) { return x.id === id; });
    V.innerHTML = '<div class="pqcc-vh"><b>' + esc(c.name) + '</b><button data-v="x" title="Tutup">&times;</button></div>' +
      '<div class="pqcc-pl" id="pqccPl"></div>' +
      '<div class="pqcc-vm">' + esc(c.kab || "") + (c.prov ? " · " + esc(c.prov) : "") + (c.ruas ? "<br>Ruas: " + esc(c.ruas) + " · ±STA " + esc(c.sta) : "") + (c.note ? "<br><i>" + esc(c.note) + "</i>" : "") +
      '<br><span class="pqcc-tag">' + (c.portal ? "Portal live" : TYPE_LBL[detect(c.url).type]) + "</span>" + (nav.length > 1 ? " " + (pos + 1) + "/" + nav.length + " sepanjang " + (c.ruas ? "ruas" : "wilayah") : "") + "</div>" +
      '<div class="pqcc-vb"><button data-v="p"><i class="fa-solid fa-backward-step"></i></button><button data-v="n"><i class="fa-solid fa-forward-step"></i></button>' +
      '<button data-v="pt" class="' + (patrol ? "pri" : "") + '"><i class="fa-solid fa-' + (patrol ? "stop" : "route") + '"></i> Patroli</button>' +
      '<button data-v="o"><i class="fa-solid fa-up-right-from-square"></i> Buka</button><button data-v="mv" title="Pindahkan pin: klik lokasi baru di peta"><i class="fa-solid fa-location-dot"></i> Pindah pin</button><button data-v="e"><i class="fa-solid fa-pen"></i></button><button data-v="d"><i class="fa-solid fa-trash"></i></button></div>';
    V.className = "show"; mountPlayer($("pqccPl"), c);
    try { gmap().flyTo([c.lat, c.lng], Math.max(gmap().getZoom(), 15), { duration: .5 }); } catch (e) {}
  }
  function step(dir) { var n = listForNav(); if (n.length < 2) return; var i = n.findIndex(function (x) { return x.id === cur; }); openViewer(n[(i + dir + n.length) % n.length].id); }
  function setPatrol(on) {
    if (patrol) { clearInterval(patrol); patrol = null; }
    if (on) patrol = setInterval(function () { var l = st.cams.filter(function (c) { return c.url; }); if (!l.length) return; var i = l.findIndex(function (x) { return x.id === cur; }); openViewer(l[(i + 1) % l.length].id); }, PATROL_MS);
  }
  function vClick(ev) {
    var b = ev.target.closest("[data-v]"); if (!b) return; var a = b.getAttribute("data-v"), c = byId(cur);
    if (a === "x") { stopAll(); setPatrol(false); V.className = ""; V.innerHTML = ""; }
    else if (a === "n") step(1); else if (a === "p") step(-1);
    else if (a === "pt") { setPatrol(!patrol); openViewer(cur); if (patrol) note("Patroli aktif: ganti CCTV tiap " + PATROL_MS / 1000 + " dtk"); }
    else if (a === "o" && c && c.url) window.open(c.url, "_blank", "noopener");
    else if (a === "mv" && c) { note("Klik lokasi baru kamera di peta"); var mp = gmap(), ct = mp.getContainer(); ct.style.cursor = "crosshair"; mp.once("click", function (e) { ct.style.cursor = ""; c.lat = +e.latlng.lat.toFixed(6); c.lng = +e.latlng.lng.toFixed(6); c.ruas = ""; c.sta = ""; enrich(c, function (r) { upsert(r); openViewer(r.id); note("Pin dipindah" + (r.ruas ? " — " + r.ruas + " STA " + r.sta : "")); }); }); }
    else if (a === "e" && c) form(c);
    else if (a === "d" && c && confirm("Hapus CCTV \"" + c.name + "\"?")) { st.cams = st.cams.filter(function (x) { return x.id !== c.id; }); save(); drawMarkers(); render(); vClick({ target: { closest: function () { return { getAttribute: function () { return "x"; } }; } } }); }
  }

  /* ---------- dinding CCTV ---------- */
  function wall(list, ttl) {
    list = list.filter(function (c) { return c.url; }).slice(0, WALL_MAX);
    if (!list.length) return note("Tidak ada CCTV ber-link di sini", true);
    stopAll(); setPatrol(false);
    var d = document.createElement("div"); d.className = "pqcc-ov wall";
    d.innerHTML = '<div class="pqcc-card big"><h3>Dinding CCTV · ' + esc(ttl) + ' <button data-x="no">&times;</button></h3><div class="pqcc-grid">' +
      list.map(function (c, i) { return '<div><div class="pqcc-pl" data-i="' + i + '"></div><small>' + esc(c.name) + "</small></div>"; }).join("") + "</div></div>";
    document.body.appendChild(d);
    list.forEach(function (c, i) { mountPlayer(d.querySelector('[data-i="' + i + '"]'), c); });
    d.addEventListener("click", function (ev) { if (ev.target === d || ev.target.getAttribute("data-x") === "no") { stopAll(); d.remove(); } });
  }

  /* ---------- cek status ---------- */
  function check(list) {
    var n = 0, ok = 0, tg = list.filter(function (c) { var t = detect(c.url).type; return t === "img" || t === "mjpg"; });
    if (!tg.length) return note("Cek status hanya untuk Snapshot/MJPEG; jenis lain dibuka lewat viewer");
    tg.forEach(function (c) {
      var im = new Image(), done = function (s) { c.status = s; if (s === "on") ok++; if (++n === tg.length) { save(); drawMarkers(); render(); note(ok + " dari " + tg.length + " CCTV online"); } };
      var to = setTimeout(function () { im.src = ""; done("off"); }, 8000);
      im.onload = function () { clearTimeout(to); done("on"); }; im.onerror = function () { clearTimeout(to); done("off"); };
      im.src = c.url + (c.url.indexOf("?") > -1 ? "&" : "?") + "_t=" + Date.now();
    });
  }

  /* ---------- terdekat ---------- */
  function nearest(center) {
    if (!st.cams.length) return note("Belum ada CCTV", true);
    var l = st.cams.map(function (c) { return { c: c, d: hav(center, [c.lat, c.lng]) }; }).sort(function (a, b) { return a.d - b.d; });
    openViewer(l[0].c.id); note("CCTV terdekat: " + l[0].c.name + " (" + (l[0].d < 1000 ? Math.round(l[0].d) + " m" : (l[0].d / 1000).toFixed(1) + " km") + ")");
  }

  /* ---------- impor / ekspor ---------- */
  function parseCsv(t) {
    var rows = t.trim().split(/\r?\n/).map(function (l) { var o = [], q = false, s = ""; for (var i = 0; i < l.length; i++) { var ch = l[i]; if (ch === '"') q = !q; else if ((ch === "," || ch === ";" || ch === "\t") && !q) { o.push(s); s = ""; } else s += ch; } o.push(s); return o.map(function (x) { return x.trim(); }); });
    var h = rows[0].map(function (x) { return x.toLowerCase(); }), has = h.indexOf("lat") > -1;
    return (has ? rows.slice(1) : rows).map(function (r) {
      var g = function (k, i) { var j = h.indexOf(k); return has && j > -1 ? r[j] : (has ? "" : r[i]); };
      return { name: g("nama", 0), url: g("url", 1), lat: parseFloat(g("lat", 2)), lng: parseFloat(g("lng", 3)), prov: g("provinsi", 4), kab: g("kabupaten", 5) };
    });
  }
  function importFlow() {
    var d = document.createElement("div"); d.className = "pqcc-ov";
    d.innerHTML = '<div class="pqcc-card"><h3>Impor CCTV</h3><div class="pqcc-hint">Tempel JSON (hasil ekspor) atau CSV dengan kolom: <b>nama,url,lat,lng,provinsi,kabupaten</b> (provinsi/kab opsional — ruas & wilayah diisi otomatis dari koordinat).</div><textarea id="pqcc_imp" rows="9"></textarea><div class="pqcc-act"><button data-x="no">Batal</button><button class="pri" data-x="ok">Impor</button></div></div>';
    document.body.appendChild(d);
    d.addEventListener("click", function (ev) {
      var x = ev.target.getAttribute && ev.target.getAttribute("data-x");
      if (ev.target === d || x === "no") return d.remove(); if (x !== "ok") return;
      var t = $("pqcc_imp").value, arr;
      try { arr = t.trim()[0] === "[" || t.trim()[0] === "{" ? JSON.parse(t) : parseCsv(t); } catch (e) { return note("Format tidak terbaca", true); }
      arr = (Array.isArray(arr) ? arr : arr.cams || []).filter(function (c) { return c && c.name && !isNaN(parseFloat(c.lat)) && !isNaN(parseFloat(c.lng)); });
      if (!arr.length) return note("Tidak ada baris valid", true);
      var left = arr.length;
      arr.forEach(function (c) {
        var n = { id: c.id || uid(), name: String(c.name), url: c.url || "", lat: +c.lat, lng: +c.lng, prov: c.prov || c.provinsi || "", kab: c.kab || c.kabupaten || "", note: c.note || "", ruas: "", sta: "", status: "" };
        n.type = detect(n.url).type;
        var dup = st.cams.filter(function (x) { return x.url && x.url === n.url && hav([x.lat, x.lng], [n.lat, n.lng]) < 30; })[0]; if (dup) { if (--left === 0) fin(); return; }
        enrich(n, function (r) { st.cams.push(r); if (--left === 0) fin(); });
      });
      function fin() { save(); drawMarkers(); render(); d.remove(); note(arr.length + " baris diproses"); }
    });
  }
  function exportFlow(kind) {
    var txt = kind === "csv" ? "nama,url,lat,lng,provinsi,kabupaten\n" + st.cams.map(function (c) { return [c.name, c.url, c.lat, c.lng, c.prov, c.kab].map(function (x) { return '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"'; }).join(","); }).join("\n") : JSON.stringify(st.cams, null, 1);
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" })); a.download = "petaqu-cctv." + kind; a.click();
  }

  /* ---------- panel sidebar ---------- */
  var css = document.createElement("style");
  css.textContent = [
    ".pqcc-ic div{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;border:2px solid #fff;box-shadow:0 0 8px rgba(0,0,0,.6)}",
    "#pqCctv{position:fixed;left:var(--pq-fl,10px);top:calc(var(--pq-ft,66px) + 52px);z-index:1260;width:min(350px,calc(100vw - 20px));max-height:calc(100dvh - var(--pq-ft,66px) - 70px);overflow:auto;overscroll-behavior:contain;display:none;border:1px solid #1e2938;border-radius:14px;background:#0a0e17f2;backdrop-filter:blur(10px);box-shadow:0 12px 34px #000a;color:#e6edf5}#pqCctv.open{display:block}body.wx-on #pqCctv{display:none!important}",
    "#pqCctv .cc-top{display:flex;align-items:center;gap:9px;padding:11px 12px 6px}#pqCctv .cc-top>i{color:#f87171;font-size:16px}#pqCctv .cc-top b{display:block;font-size:13px}#pqCctv .cc-top small{font-size:10.5px;color:#94a3b8}#pqCctv .cc-top div{flex:1}#pqCctv .cc-top button{font-size:18px;line-height:1;border:0}",
    "#pqCctv .cc-q{display:block;width:calc(100% - 16px);margin:2px 8px 6px;padding:8px 10px;border-radius:10px;border:1px solid #1e2938;background:#0f1726;color:#e6edf5;font:12px system-ui;box-sizing:border-box}",
    "#pqCctv .cc-body{display:block;padding:0 8px 10px}",
    "#pqCctv .cc-h{display:flex;align-items:center;gap:9px;padding:10px 12px;cursor:pointer;background:linear-gradient(135deg,rgba(239,68,68,.14),rgba(34,211,238,.08))}",
    "#pqCctv .cc-h>i{color:#f87171}#pqCctv .cc-h b{display:block;font-size:12.5px;color:var(--text,#e6edf5)}#pqCctv .cc-h small{font-size:10.5px;color:var(--text-dim,#7c8aa0)}",
        "#pqCctv .cc-bar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:7px}",
    "#pqCctv button,.pqcc-card button,#pqccV button{padding:4px 10px;border-radius:8px;border:1px solid var(--line,#1e2938);background:transparent;color:var(--text,#e6edf5);font:700 10.5px system-ui;cursor:pointer}",
    "#pqCctv button.on,#pqCctv button.pri,.pqcc-card button.pri,#pqccV button.pri{background:#0e7490;border-color:#0e7490;color:#fff}",
    "#pqCctv .cc-g{border:1px solid var(--line,#1e2938);border-radius:10px;margin-bottom:5px;background:var(--panel-2,#131a28)}",
    "#pqCctv .cc-gh{display:flex;gap:8px;align-items:center;padding:7px 10px;cursor:pointer}#pqCctv .cc-gh b{flex:1;font-size:11.5px;color:var(--text,#e6edf5)}",
    "#pqCctv .cc-n{font:700 10px system-ui;padding:1px 7px;border-radius:99px;background:#1e2938;color:#94a3b8}#pqCctv .cc-n.has{background:#7f1d1d;color:#fecaca}",
    "#pqCctv .cc-gb{display:none;padding:2px 8px 8px}#pqCctv .cc-g.open .cc-gb{display:block}",
    "#pqCctv .cc-r{display:flex;gap:7px;align-items:center;padding:6px 4px;border-top:1px solid var(--line,#1e2938);cursor:pointer;font-size:11.5px;color:var(--text,#e6edf5)}",
    "#pqCctv .cc-r small{display:block;color:var(--text-dim,#7c8aa0);font-size:10px}#pqCctv .cc-r:hover{background:rgba(255,255,255,.04)}",
    "#pqCctv .cc-dot{width:8px;height:8px;border-radius:50%;background:#22d3ee;flex:none}",
    "#pqCctv a{color:#22d3ee;font-size:10.5px}",
    "#pqccV{position:fixed;right:14px;bottom:14px;width:min(460px,calc(100vw - 28px));background:#0b1220;border:1px solid #1e2938;border-radius:14px;z-index:99990;display:none;box-shadow:0 12px 40px rgba(0,0,0,.6);overflow:hidden;color:#e6edf5}#pqccV.show{display:block}",
    ".pqcc-vh{display:flex;align-items:center;padding:8px 12px;gap:8px;font-size:13px}.pqcc-vh b{flex:1}.pqcc-vh button{font-size:18px!important}",
    ".pqcc-pl{aspect-ratio:16/9;background:#000;position:relative}.pqcc-pl iframe,.pqcc-pl video,.pqcc-pl img{width:100%;height:100%;border:0;object-fit:contain;display:block}",
    ".pqcc-go{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#7f1d1d,#0e7490);color:#fff;font:700 14px system-ui;text-decoration:none}",
    ".pqcc-none,.pqcc-hint{padding:10px;font-size:11px;color:#94a3b8}.pqcc-ok{padding:7px 10px;margin-bottom:8px;border-radius:8px;background:rgba(52,211,153,.12);color:#6ee7b7;font-size:11.5px}",
    ".pqcc-vm{padding:8px 12px;font-size:11.5px;color:#94a3b8;line-height:1.5}.pqcc-tag{background:#1e2938;border-radius:6px;padding:1px 7px;font-size:10px}",
    ".pqcc-vb{display:flex;gap:6px;padding:6px 12px 12px;flex-wrap:wrap}",
    ".pqcc-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99995;display:flex;align-items:center;justify-content:center;padding:14px}",
    ".pqcc-card{background:#0f1521;border:1px solid #1e2938;border-radius:14px;padding:16px;width:min(440px,100%);max-height:92vh;overflow:auto;color:#e6edf5}.pqcc-card.big{width:min(980px,100%)}",
    ".pqcc-card h3{margin:0 0 10px;font-size:15px;display:flex;justify-content:space-between}.pqcc-card label{display:block;font-size:10.5px;color:#94a3b8;margin-bottom:8px;flex:1}",
    ".pqcc-card input,.pqcc-card textarea{display:block;width:100%;margin-top:3px;padding:7px 9px;border-radius:8px;border:1px solid #1e2938;background:#0b1220;color:#e6edf5;font:12px system-ui;box-sizing:border-box}",
    ".pqcc-row{display:flex;gap:8px}.pqcc-act{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}",
    ".pqcc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px}.pqcc-grid small{font-size:10.5px;color:#94a3b8}"
  ].join("\n");
  document.head.appendChild(css);

  var root, listEl, open = false;
  function ready() { try { return !!(window.L && gmap() && gmap().getPane); } catch (e) { return false; } }
  function mount() {
    if (root && document.body.contains(root)) return;
    root = document.createElement("div"); root.id = "pqCctv";
    root.innerHTML = '<div class="cc-top"><i class="fa-solid fa-video"></i><div><b>CCTV Lalu Lintas</b><small id="pqccSum"></small></div><button data-c="close" title="Tutup">&times;</button></div>' +
      '<input class="cc-q" id="pqccQ" placeholder="Cari CCTV, ruas, kabupaten/kota..." autocomplete="off">' +
      '<div class="cc-body"><div class="cc-bar"><button class="pri" data-c="add"><i class="fa-solid fa-plus"></i> Tambah</button><button data-c="near"><i class="fa-solid fa-location-crosshairs"></i> Terdekat</button><button data-c="wall"><i class="fa-solid fa-table-cells"></i> Dinding</button><button data-c="chk">Cek status</button><button data-c="imp">Impor</button><button data-c="exj">JSON</button><button data-c="exc">CSV</button></div><div id="pqccList"></div></div>';
    document.body.appendChild(root); listEl = $("pqccList");
    root.addEventListener("click", onClick);
    $("pqccQ").addEventListener("input", render);
    document.addEventListener("click", function (e) { if (open && !root.contains(e.target) && !(e.target.closest && e.target.closest("#pqFolder,#pqFolderCard,#pqccV,.pqcc-ov,.leaflet-container"))) setOpen(false); });
  }
  function setOpen(v) { mount(); open = !!v; root.classList.toggle("open", open); if (open) render(); }
  function q() { var i = $("pqccQ"); return i ? i.value.trim().toLowerCase() : ""; }
  function matches(c, s) { return !s || (c.name + " " + (c.ruas || "") + " " + (c.kab || "") + " " + (c.prov || "")).toLowerCase().indexOf(s) > -1; }
  var colr = function (c) { return c.status === "off" ? "#ef4444" : c.status === "on" ? "#22c55e" : "#22d3ee"; };
  function render() {
    if (!ready()) return; mount(); if (!open) return;
    var s = q(), cams = st.cams.filter(function (c) { return (!st.prov || c.prov === st.prov) && matches(c, s); });
    var provs = {}; GROUPS.forEach(function (g) { provs[g.prov] = 1; }); st.cams.forEach(function (c) { if (c.prov) provs[c.prov] = 1; });
    var gs = {}; GROUPS.forEach(function (g) { gs[g.name] = { name: g.name, prov: g.prov, cams: [] }; });
    cams.forEach(function (c) { var k = c.kab || "Lainnya"; (gs[k] = gs[k] || { name: k, prov: c.prov || "Lainnya", cams: [] }).cams.push(c); });
    var list = Object.keys(gs).map(function (k) { return gs[k]; }).filter(function (g) { return (!st.prov || g.prov === st.prov) && (!s || g.cams.length); })
      .sort(function (a, b) { return (b.cams.length - a.cams.length) || a.name.localeCompare(b.name, "id"); });
    $("pqccSum").textContent = st.cams.length + " CCTV · " + Object.keys(provs).length + " provinsi · " + list.filter(function (g) { return g.cams.length; }).length + " folder terisi";
    var h = '<div class="cc-bar"><button class="' + (!st.prov ? "on" : "") + '" data-c="prov" data-p="">Semua</button>' + Object.keys(provs).sort().map(function (p) { return '<button class="' + (st.prov === p ? "on" : "") + '" data-c="prov" data-p="' + esc(p) + '">' + esc(p) + "</button>"; }).join("") + "</div>";
    if (!st.cams.length) h += '<div class="pqcc-hint">Belum ada CCTV. Klik <b>Tambah</b> lalu pilih titik di peta, atau <b>Impor</b> daftar CCTV (CSV/JSON).</div>';
    list.forEach(function (g) {
      var op = !!st.groups[g.name] || !!s, n = g.cams.length;
      h += '<div class="cc-g ' + (op ? "open" : "") + '"><div class="cc-gh" data-c="grp" data-g="' + esc(g.name) + '"><i class="fa-solid fa-folder' + (op ? "-open" : "") + '" style="color:' + (n ? "#f87171" : "#475569") + '"></i><b>' + esc(g.name) + '</b><span class="cc-n ' + (n ? "has" : "") + '">' + n + '</span></div><div class="cc-gb">';
      if (op) {
        h += '<div class="cc-bar"><button data-c="gwall" data-g="' + esc(g.name) + '">Dinding</button><a target="_blank" rel="noopener" href="https://www.google.com/search?q=' + encodeURIComponent("CCTV ATCS live " + g.name + " " + g.prov) + '">Cari sumber resmi ↗</a></div>';
        g.cams.sort(function (a, b) { return String(a.ruas).localeCompare(String(b.ruas)) || parseFloat(String(a.sta).replace("+", ".")) - parseFloat(String(b.sta).replace("+", ".")); })
          .forEach(function (c) { h += '<div class="cc-r" data-c="go" data-id="' + c.id + '"><span class="cc-dot" style="background:' + colr(c) + '"></span><div>' + esc(c.name) + "<small>" + (c.ruas ? esc(c.ruas) + " · STA " + esc(c.sta) : (c.portal ? "portal resmi" : "di luar ruas nasional")) + " · " + (c.portal ? "Portal live" : TYPE_LBL[detect(c.url).type]) + "</small></div></div>"; });
        if (!n) h += '<div class="pqcc-hint">Belum ada CCTV di wilayah ini.</div>';
      }
      h += "</div></div>";
    });
    listEl.innerHTML = h;
  }
  function onClick(ev) {
    var b = ev.target.closest("[data-c]"); if (!b) return; var a = b.getAttribute("data-c"), g = b.getAttribute("data-g");
    var vis = function () { var s = q(); return st.cams.filter(function (c) { return (!st.prov || c.prov === st.prov) && matches(c, s); }); };
    if (a === "close") setOpen(false);
    else if (a === "add") { setOpen(false); addFlow(); }
    else if (a === "near") api.near();
    else if (a === "wall") api.wall();
    else if (a === "gwall") wall(st.cams.filter(function (c) { return (c.kab || "Lainnya") === g; }), g);
    else if (a === "chk") check(vis());
    else if (a === "imp") importFlow(); else if (a === "exj") exportFlow("json"); else if (a === "exc") exportFlow("csv");
    else if (a === "prov") { st.prov = b.getAttribute("data-p"); save(); render(); }
    else if (a === "grp") { st.groups[g] = !st.groups[g]; save(); render(); }
    else if (a === "go") { openViewer(b.getAttribute("data-id")); if (window.innerWidth <= 860) setOpen(false); }
  }
  var api = {
    near: function () { var m = gmap(), fb = function () { var c = m.getCenter(); nearest([c.lat, c.lng]); }; if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function (p) { nearest([p.coords.latitude, p.coords.longitude]); }, fb, { timeout: 5000 }); else fb(); },
    wall: function () { var bb = gmap().getBounds(), inV = st.cams.filter(function (c) { return bb.contains([c.lat, c.lng]); }); wall(inV.length ? inV : st.cams, inV.length ? "area peta" : "semua"); }
  };
  /* baris untuk menu folder (petaqu-folder.js): rows() dibaca berkala, act(id) dijalankan saat diklik */
  function rows() {
    return [
      { id: "show", name: "CCTV Live di peta", ic: "\uf03d", c: "#f87171", on: !!st.show, txt: st.show ? st.cams.length + " ON" : "OFF" },
      { id: "browse", name: "Folder CCTV semua wilayah", ic: "\uf07b", c: "#fb923c" },
      { id: "near", name: "CCTV terdekat dari saya", ic: "\uf124", c: "#22d3ee" },
      { id: "wall", name: "Dinding CCTV (area peta)", ic: "\uf009", c: "#a78bfa" },
      { id: "add", name: "Tambah CCTV (klik peta)", ic: "\uf067", c: "#34d399" }
    ];
  }
  function act(id) {
    if (!ready()) return;
    if (id === "show") { st.show = !st.show; save(); drawMarkers(); }
    else if (id === "browse") setOpen(!open);
    else if (id === "near") api.near(); else if (id === "wall") api.wall(); else if (id === "add") addFlow();
  }
  var tries = 0, tm = setInterval(function () {
    tries++;
    if (ready()) { clearInterval(tm); try { mergeSeed(); mount(); drawMarkers(); } catch (e) { console.error("CCTV", e); } }
    else if (tries > 200) clearInterval(tm);
  }, 300);

  window.PQ_CCTV = { rows: rows, act: act, open: setOpen, list: function () { return st.cams.slice(); }, view: openViewer, add: function (c) { c.id = c.id || uid(); c.type = detect(c.url).type; enrich(c, upsert); }, refresh: render };
})();
