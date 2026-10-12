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
      '<br><span class="pqcc-tag">' + TYPE_LBL[detect(c.url).type] + "</span>" + (nav.length > 1 ? " " + (pos + 1) + "/" + nav.length + " sepanjang " + (c.ruas ? "ruas" : "wilayah") : "") + "</div>" +
      '<div class="pqcc-vb"><button data-v="p"><i class="fa-solid fa-backward-step"></i></button><button data-v="n"><i class="fa-solid fa-forward-step"></i></button>' +
      '<button data-v="pt" class="' + (patrol ? "pri" : "") + '"><i class="fa-solid fa-' + (patrol ? "stop" : "route") + '"></i> Patroli</button>' +
      '<button data-v="o"><i class="fa-solid fa-up-right-from-square"></i> Buka</button><button data-v="e"><i class="fa-solid fa-pen"></i></button><button data-v="d"><i class="fa-solid fa-trash"></i></button></div>';
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
    "#pqCctv{margin:10px 6px 14px;border:1px solid var(--line,#1e2938);border-radius:12px;background:var(--panel,#0f1521);overflow:hidden}",
    "#pqCctv .cc-h{display:flex;align-items:center;gap:9px;padding:10px 12px;cursor:pointer;background:linear-gradient(135deg,rgba(239,68,68,.14),rgba(34,211,238,.08))}",
    "#pqCctv .cc-h>i{color:#f87171}#pqCctv .cc-h b{display:block;font-size:12.5px;color:var(--text,#e6edf5)}#pqCctv .cc-h small{font-size:10.5px;color:var(--text-dim,#7c8aa0)}",
    "#pqCctv .cc-body{display:none;padding:8px}#pqCctv.open .cc-body{display:block}",
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
    "#pqccV{position:fixed;right:14px;bottom:14px;width:min(380px,calc(100vw - 28px));background:#0b1220;border:1px solid #1e2938;border-radius:14px;z-index:99990;display:none;box-shadow:0 12px 40px rgba(0,0,0,.6);overflow:hidden;color:#e6edf5}#pqccV.show{display:block}",
    ".pqcc-vh{display:flex;align-items:center;padding:8px 12px;gap:8px;font-size:13px}.pqcc-vh b{flex:1}.pqcc-vh button{font-size:18px!important}",
    ".pqcc-pl{aspect-ratio:16/9;background:#000;position:relative}.pqcc-pl iframe,.pqcc-pl video,.pqcc-pl img{width:100%;height:100%;border:0;object-fit:contain;display:block}",
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

  var root;
  function ready() { try { return !!(window.L && gmap() && gmap().getPane && $("roadList")); } catch (e) { return false; } }
  function mount() {
    if (root && document.body.contains(root)) return;
    root = document.createElement("div"); root.id = "pqCctv";
    var anchor = $("pqAllRuas") || $("roadList"); anchor.parentNode.insertBefore(root, anchor.nextSibling);
    root.addEventListener("click", onClick);
  }
  function q() { var i = $("searchInput"); return i ? i.value.trim().toLowerCase() : ""; }
  function matches(c, s) { return !s || (c.name + " " + (c.ruas || "") + " " + (c.kab || "") + " " + (c.prov || "")).toLowerCase().indexOf(s) > -1; }
  function render() {
    if (!ready()) return; mount();
    var s = q(), cams = st.cams.filter(function (c) { return (!st.prov || c.prov === st.prov) && matches(c, s); });
    var provs = {}; GROUPS.forEach(function (g) { provs[g.prov] = 1; }); st.cams.forEach(function (c) { if (c.prov) provs[c.prov] = 1; });
    var gs = {}; GROUPS.forEach(function (g) { gs[g.name] = { name: g.name, prov: g.prov, cams: [] }; });
    cams.forEach(function (c) { var k = c.kab || "Lainnya"; (gs[k] = gs[k] || { name: k, prov: c.prov || "Lainnya", cams: [] }).cams.push(c); });
    var list = Object.keys(gs).map(function (k) { return gs[k]; }).filter(function (g) { return (!st.prov || g.prov === st.prov) && (!s || g.cams.length); })
      .sort(function (a, b) { return (b.cams.length - a.cams.length) || a.name.localeCompare(b.name, "id"); });
    var h = '<div class="cc-h" data-c="open"><i class="fa-solid fa-video"></i><div><b>CCTV · Semua Ruas & Wilayah</b><small>' + st.cams.length + " CCTV · " + Object.keys(provs).length + " provinsi · " + GROUPS.length + ' kab/kota data ruas</small></div></div><div class="cc-body">';
    h += '<div class="cc-bar"><button class="pri" data-c="add"><i class="fa-solid fa-plus"></i> Tambah CCTV</button><button data-c="show" class="' + (st.show ? "on" : "") + '">Peta ' + (st.show ? "ON" : "OFF") + '</button><button data-c="near"><i class="fa-solid fa-location-crosshairs"></i> Terdekat</button><button data-c="wall"><i class="fa-solid fa-table-cells"></i> Dinding</button><button data-c="chk">Cek status</button><button data-c="imp">Impor</button><button data-c="exj">JSON</button><button data-c="exc">CSV</button></div>';
    h += '<div class="cc-bar"><button class="' + (!st.prov ? "on" : "") + '" data-c="prov" data-p="">Semua provinsi</button>' + Object.keys(provs).sort().map(function (p) { return '<button class="' + (st.prov === p ? "on" : "") + '" data-c="prov" data-p="' + esc(p) + '">' + esc(p) + "</button>"; }).join("") + "</div>";
    if (!st.cams.length) h += '<div class="pqcc-hint">Belum ada CCTV. Klik <b>Tambah CCTV</b> lalu pilih titik di peta, atau <b>Impor</b> daftar CCTV (CSV/JSON). Tiap grup kab/kota punya tautan “cari sumber resmi” (ATCS / Dishub / Bina Marga).</div>';
    list.forEach(function (g) {
      var open = !!st.groups[g.name] || !!s, n = g.cams.length;
      h += '<div class="cc-g ' + (open ? "open" : "") + '"><div class="cc-gh" data-c="grp" data-g="' + esc(g.name) + '"><b>' + esc(g.name) + '</b><span class="cc-n ' + (n ? "has" : "") + '">' + n + "</span></div><div class=\"cc-gb\">";
      if (open) {
        h += '<div class="cc-bar"><button data-c="gwall" data-g="' + esc(g.name) + '">Dinding</button><a target="_blank" rel="noopener" href="https://www.google.com/search?q=' + encodeURIComponent("CCTV ATCS live " + g.name + " " + g.prov) + '">Cari sumber resmi ↗</a></div>';
        g.cams.sort(function (a, b) { return String(a.ruas).localeCompare(String(b.ruas)) || parseFloat(String(a.sta).replace("+", ".")) - parseFloat(String(b.sta).replace("+", ".")); })
          .forEach(function (c) { h += '<div class="cc-r" data-c="go" data-id="' + c.id + '"><span class="cc-dot" style="background:' + (c.status === "off" ? "#ef4444" : c.status === "on" ? "#22c55e" : "#22d3ee") + '"></span><div>' + esc(c.name) + "<small>" + (c.ruas ? esc(c.ruas) + " · STA " + esc(c.sta) : "di luar ruas nasional") + " · " + TYPE_LBL[detect(c.url).type] + "</small></div></div>"; });
        if (!n) h += '<div class="pqcc-hint">Belum ada CCTV di wilayah ini.</div>';
      }
      h += "</div></div>";
    });
    h += "</div>"; root.className = st.open ? "open" : ""; root.innerHTML = h;
  }
  function onClick(ev) {
    var b = ev.target.closest("[data-c]"); if (!b) return; var a = b.getAttribute("data-c"), g = b.getAttribute("data-g");
    var vis = function () { var s = q(); return st.cams.filter(function (c) { return (!st.prov || c.prov === st.prov) && matches(c, s); }); };
    if (a === "open") { st.open = !st.open; save(); render(); }
    else if (a === "add") addFlow();
    else if (a === "show") { st.show = !st.show; save(); drawMarkers(); render(); }
    else if (a === "near") { var m = gmap(); var go = function (p) { nearest(p); }; if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function (p) { go([p.coords.latitude, p.coords.longitude]); }, function () { var c = m.getCenter(); go([c.lat, c.lng]); }, { timeout: 5000 }); else { var c = m.getCenter(); go([c.lat, c.lng]); } }
    else if (a === "wall") { var bb = gmap().getBounds(), inV = vis().filter(function (c) { return bb.contains([c.lat, c.lng]); }); wall(inV.length ? inV : vis(), inV.length ? "area peta" : "semua"); }
    else if (a === "gwall") wall(st.cams.filter(function (c) { return (c.kab || "Lainnya") === g; }), g);
    else if (a === "chk") check(vis());
    else if (a === "imp") importFlow(); else if (a === "exj") exportFlow("json"); else if (a === "exc") exportFlow("csv");
    else if (a === "prov") { st.prov = b.getAttribute("data-p"); save(); render(); }
    else if (a === "grp") { st.groups[g] = !st.groups[g]; save(); render(); }
    else if (a === "go") { openViewer(b.getAttribute("data-id")); if (window.innerWidth <= 860 && typeof toggleSidebar === "function") toggleSidebar(false); }
  }
  var pend = false, sched = function () { if (pend) return; pend = true; setTimeout(function () { pend = false; render(); }, 150); };
  var tries = 0, tm = setInterval(function () {
    tries++;
    if (ready()) {
      clearInterval(tm);
      try { drawMarkers(); render(); var s = $("searchInput"); if (s) s.addEventListener("input", sched); if (typeof renderRoadList === "function") { var o = renderRoadList; window.renderRoadList = function () { var r = o.apply(this, arguments); sched(); return r; }; } } catch (e) { console.error("CCTV", e); }
    } else if (tries > 200) clearInterval(tm);
  }, 300);

  window.PQ_CCTV = { list: function () { return st.cams.slice(); }, open: openViewer, add: function (c) { c.id = c.id || uid(); c.type = detect(c.url).type; enrich(c, upsert); }, refresh: sched };
})();
