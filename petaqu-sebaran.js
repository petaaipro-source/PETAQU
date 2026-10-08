/* PETAQU — Sebaran lokasi & akses perangkat pengguna.
   1) PENCATAT (semua pengguna login, senyap): kirim jenis perangkat/OS/browser + perkiraan lokasi (dari IP, IP tidak disimpan).
   2) PANEL (HANYA admin): peta sebaran, statistik perangkat, daftar pengguna, peringatan akun mencurigakan.
   Bukan admin -> tombol & panel TIDAK PERNAH dibuat (tidak ada di DOM). Penegakan sebenarnya di server:
   admin_sebaran_pengguna() menolak non-admin (lihat supabase-sebaran-pengguna.sql). */
(function () {
  "use strict";
  if (window.__pqSebaran) return;
  window.__pqSebaran = 1;

  var SK = "pq_cloud_session", DEV = "pq_device_id", GEO = "pq_geo_v2", LAST = "pq_dev_last";
  var ONLINE_MS = 7 * 6e4, HEARTBEAT_MS = 4 * 6e4, GEO_TTL = 12 * 36e5;
  var $ = function (id) { return document.getElementById(id); };
  function cfg() { return window.PETAQU_CFG; }
  function sess() { try { return JSON.parse(localStorage.getItem(SK)); } catch (e) { return null; } }
  function isAdmin() { return window.__pqIsAdmin === true; }
  function T(m, e) { try { toast(m, !!e); } catch (x) { /* abaikan */ } }

  async function rpc(fn, body) {
    var c = cfg(), s = sess();
    if (!c || !s || !s.access_token) throw { code: "nosess" };
    var r = await fetch(c.url + "/rest/v1/rpc/" + fn, {
      method: "POST", keepalive: fn === "catat_perangkat",
      headers: { apikey: c.anon, Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    if (r.ok) return r.status === 204 ? null : r.json();
    var b = {}; try { b = await r.json(); } catch (e) { /* kosong */ }
    var pg = String(b.code || "");
    if (r.status === 404 || pg === "PGRST202") throw { code: "nosql" };
    if (r.status === 401 || r.status === 403 || pg === "42501") throw { code: "denied" };
    throw { code: "http", status: r.status, msg: String(b.message || "") };
  }

  /* ================= 1) PENCATAT ================= */
  function deviceId() {
    var id = null;
    try { id = localStorage.getItem(DEV); } catch (e) { /* abaikan */ }
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(DEV, id); } catch (e) { /* abaikan */ }
    }
    return id;
  }
  function parseUA() {
    var ua = navigator.userAgent || "", uad = navigator.userAgentData || null, os = "Lainnya", m;
    if (/Android/i.test(ua)) { m = ua.match(/Android\s([\d.]+)/i); os = "Android" + (m ? " " + parseInt(m[1], 10) : ""); }
    else if (/iPhone|iPad|iPod/i.test(ua)) { m = ua.match(/OS (\d+)[_\d]*/i); os = "iOS" + (m ? " " + m[1] : ""); }
    else if (/CrOS/i.test(ua)) os = "ChromeOS";
    else if (/Windows NT 10/i.test(ua)) os = "Windows 10/11";
    else if (/Windows/i.test(ua)) os = "Windows";
    else if (/Mac OS X|Macintosh/i.test(ua)) os = (navigator.maxTouchPoints > 1) ? "iPadOS" : "macOS";
    else if (/Linux/i.test(ua)) os = "Linux";
    var br = "Lainnya";
    if (/Edg\//i.test(ua)) br = "Edge";
    else if (/OPR\/|Opera/i.test(ua)) br = "Opera";
    else if (/SamsungBrowser/i.test(ua)) br = "Samsung Internet";
    else if (/Firefox|FxiOS/i.test(ua)) br = "Firefox";
    else if (/CriOS|Chrome/i.test(ua)) br = "Chrome";
    else if (/Safari/i.test(ua)) br = "Safari";
    var jenis = "desktop";
    if (/iPad|Tablet|Tab\b/i.test(ua) || (os === "iPadOS") || (/Android/i.test(ua) && !/Mobile/i.test(ua))) jenis = "tablet";
    else if ((uad && uad.mobile) || /Mobi|iPhone|iPod|Android/i.test(ua)) jenis = "mobile";
    var model = null;
    if (/Android/i.test(ua)) { m = ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\sBuild|\))/i); if (m && !/^(K|Linux|U)$/i.test(m[1].trim())) model = m[1].trim(); }
    else if (/iPhone/i.test(ua)) model = "iPhone";
    else if (/iPad/i.test(ua)) model = "iPad";
    return { jenis: jenis, os: os, browser: br, model: model };
  }
  function highEntropyModel(base) {   // Chrome Android membekukan model di UA -> minta nama model asli bila tersedia
    var uad = navigator.userAgentData;
    if (!uad || !uad.getHighEntropyValues) return Promise.resolve(base);
    return Promise.race([
      uad.getHighEntropyValues(["model"]).then(function (v) { if (v && v.model) base.model = v.model; return base; }),
      new Promise(function (res) { setTimeout(function () { res(base); }, 800); })
    ]).catch(function () { return base; });
  }
  function jsonFetch(url, ms) {
    var ac = window.AbortController ? new AbortController() : null, t = ac && setTimeout(function () { ac.abort(); }, ms || 6000);
    return fetch(url, ac ? { signal: ac.signal } : {}).then(function (r) { if (!r.ok) throw 0; return r.json(); }).finally(function () { t && clearTimeout(t); });
  }
  async function perkiraanLokasi() {
    try {   // cache 12 jam: hemat kuota & tidak membocorkan IP berulang ke layanan geolokasi
      var c = JSON.parse(localStorage.getItem(GEO) || "null");
      if (c && Date.now() - c.t < GEO_TTL && c.v) return c.v;
    } catch (e) { /* abaikan */ }
    var v = null;
    try {
      var a = await jsonFetch("https://ipwho.is/?fields=success,country,region,city,latitude,longitude");
      if (a && a.success !== false && a.country) v = { negara: a.country, provinsi: a.region || null, kota: a.city || null, lat: a.latitude, lng: a.longitude, sumber: "ip" };
    } catch (e) { /* coba cadangan */ }
    if (!v) {
      try {
        var b = await jsonFetch("https://ipapi.co/json/");
        if (b && b.country_name) v = { negara: b.country_name, provinsi: b.region || null, kota: b.city || null, lat: b.latitude, lng: b.longitude, sumber: "ip" };
      } catch (e) { /* lanjut ke zona waktu */ }
    }
    if (!v) {   // cadangan terakhir: tebak dari zona waktu perangkat
      var z = ""; try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* abaikan */ }
      var idn = { "Asia/Jakarta": "Jawa", "Asia/Pontianak": "Kalimantan", "Asia/Makassar": "Sulawesi/Bali", "Asia/Jayapura": "Papua" };
      v = { negara: idn[z] ? "Indonesia" : (z.split("/")[0] || null), provinsi: idn[z] || null, kota: null, lat: null, lng: null, sumber: "zona" };
    }
    try { localStorage.setItem(GEO, JSON.stringify({ t: Date.now(), v: v })); } catch (e) { /* abaikan */ }
    return v;
  }
  var sending = false;
  async function lapor(force) {
    if (sending) return;
    var s = sess(); if (!s || !s.uid || !s.access_token || !cfg()) return;
    var last = +(localStorage.getItem(LAST) || 0);
    if (!force && Date.now() - last < HEARTBEAT_MS - 15e3) return;
    sending = true;
    try {
      var d = await highEntropyModel(parseUA()), g = await perkiraanLokasi(), tz = "";
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* abaikan */ }
      var pwa = false; try { pwa = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { /* abaikan */ }
      var con = navigator.connection || {};
      await rpc("catat_perangkat", {
        p_device_id: deviceId(), p_jenis: d.jenis, p_os: d.os, p_browser: d.browser, p_model: d.model,
        p_layar: screen.width + "x" + screen.height + "@" + (window.devicePixelRatio || 1), p_bahasa: navigator.language || null, p_zona: tz,
        p_pwa: pwa, p_jaringan: con.effectiveType || null, p_negara: g.negara, p_provinsi: g.provinsi, p_kota: g.kota,
        p_lat: g.lat == null ? null : +g.lat, p_lng: g.lng == null ? null : +g.lng, p_sumber: g.sumber
      });
      localStorage.setItem(LAST, String(Date.now()));
    } catch (e) { /* senyap: SQL belum dipasang / offline / sesi habis -> tidak mengganggu pengguna */ }
    sending = false;
  }
  function mulaiPencatat() {
    setTimeout(function () { lapor(true); }, 4000);
    setInterval(function () { if (document.visibilityState === "visible") lapor(false); }, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") lapor(false); });
    window.addEventListener("pq-login", function () { setTimeout(function () { lapor(true); }, 1500); });
  }

  /* ================= 2) PANEL ADMIN ================= */
  var btn = null, panel = null, map = null, mapLayer = null, rows = [], tab = "lokasi", q = "", periode = "semua", err = null, loading = false, poll = 0;

  function el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
  function btnCss(bg, fg, bd) { return "background:" + bg + ";color:" + fg + ";border:1px solid " + (bd || "transparent") + ";border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;font-size:12px"; }
  function rel(iso) {
    if (!iso) return "belum pernah";
    var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
    if (m < 1) return "baru saja"; if (m < 60) return m + " mnt lalu";
    if (m < 1440) return Math.round(m / 60) + " jam lalu"; return Math.round(m / 1440) + " hari lalu";
  }
  function age(r) { return Date.now() - new Date(r.terakhir).getTime(); }
  function lokasiLabel(r) { var p = [r.kota, r.provinsi].filter(Boolean); if (!p.length) return r.negara || "Lokasi tidak diketahui"; return p.join(", ") + (r.negara && r.negara !== "Indonesia" ? " (" + r.negara + ")" : ""); }
  function perangkatLabel(r) { return [r.model, r.os, r.browser].filter(Boolean).join(" · ") + (r.pwa ? " · terpasang (PWA)" : ""); }
  var JENIS = { mobile: "HP", tablet: "Tablet", desktop: "Komputer" };

  /* kelompokkan per pengguna; lokasi pengguna = perangkat yang paling baru dipakai */
  function users() {
    var map = {}, out = [];
    rows.forEach(function (r) {
      var u = map[r.user_id];
      if (!u) { u = map[r.user_id] = { id: r.user_id, email: r.email, nama: r.nama, instansi: r.instansi, role: r.role, devs: [], terakhir: r.terakhir, loc: r }; out.push(u); }
      u.devs.push(r);
      if (new Date(r.terakhir) > new Date(u.terakhir)) { u.terakhir = r.terakhir; u.loc = r; }
    });
    out.forEach(function (u) { u.online = Date.now() - new Date(u.terakhir).getTime() < ONLINE_MS; u.flags = flagsFor(u); });
    out.sort(function (a, b) { return new Date(b.terakhir) - new Date(a.terakhir); });
    return out;
  }
  function flagsFor(u) {
    var f = [], d30 = u.devs.filter(function (d) { return age(d) < 30 * 864e5; }), d24 = u.devs.filter(function (d) { return age(d) < 864e5; });
    if (d30.length >= 3) f.push(d30.length + " perangkat berbeda aktif dalam 30 hari (kemungkinan akun dipakai bersama)");
    var wil = {}; d24.forEach(function (d) { wil[(d.negara || "?") + "|" + (d.provinsi || "?")] = 1; });
    if (Object.keys(wil).length >= 2) f.push("Diakses dari " + Object.keys(wil).length + " wilayah berbeda dalam 24 jam");
    if (u.devs.some(function (d) { return d.negara && d.negara !== "Indonesia" && d.sumber !== "zona"; })) f.push("Pernah diakses dari luar Indonesia");
    return f;
  }
  function hitung(list, fn) {
    var m = {}; list.forEach(function (x) { var k = fn(x) || "Tidak diketahui"; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }
  function bars(data, total, warna, maks) {
    var w = el("div", "display:flex;flex-direction:column;gap:6px");
    data.slice(0, maks || 8).forEach(function (d) {
      var row = el("div", "display:flex;flex-direction:column;gap:2px");
      var h = el("div", "display:flex;justify-content:space-between;gap:8px;font-size:12px");
      h.append(el("span", "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", d[0]), el("b", "flex:none", d[1] + " (" + Math.round(d[1] * 100 / Math.max(1, total)) + "%)"));
      var tr = el("div", "height:6px;border-radius:4px;background:#ffffff14;overflow:hidden"), fl = el("div", "height:100%;border-radius:4px;background:" + warna + ";width:" + Math.max(3, d[1] * 100 / Math.max(1, total)) + "%");
      tr.appendChild(fl); row.append(h, tr); w.appendChild(row);
    });
    if (!data.length) w.appendChild(el("div", "font-size:12px;color:#94a3b8", "Belum ada data."));
    return w;
  }
  function card(judul, isi) { var c = el("div", "border:1px solid #ffffff1a;border-radius:10px;padding:10px 12px;background:#0b1120;min-width:0"); c.appendChild(el("div", "font-weight:700;font-size:12px;margin-bottom:8px;color:#9fe8f5", judul)); c.appendChild(isi); return c; }

  function build() {
    if (panel) return;
    panel = el("div", "position:fixed;inset:0;z-index:5300;display:none;align-items:center;justify-content:center;background:#000a;padding:12px");
    panel.id = "pqSebaranPanel";
    var box = el("div", "width:min(860px,100%);max-height:92vh;display:flex;flex-direction:column;background:#0f1521;border:1px solid #22d3ee55;border-radius:14px;color:#e6f1ff;font:13px/1.45 system-ui,sans-serif;box-shadow:0 20px 60px #000c;overflow:hidden");
    var head = el("div", "display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #ffffff18;flex-wrap:wrap");
    head.appendChild(el("b", "flex:1;font-size:15px;min-width:160px", "Sebaran pengguna · lokasi & perangkat"));
    var ex = el("button", btnCss("transparent", "#e6f1ff", "#ffffff30"), "Ekspor CSV"); ex.onclick = eksporCsv;
    var rf = el("button", btnCss("transparent", "#e6f1ff", "#ffffff30"), "Segarkan"); rf.onclick = function () { muat(true); };
    var cl = el("button", "background:transparent;border:0;color:#e6f1ff;font-size:20px;cursor:pointer;padding:0 6px", "×"); cl.onclick = tutup;
    head.append(ex, rf, cl);
    var ins = el("div", "padding:10px 14px 0"); ins.id = "pqSbInsight";
    var tabs = el("div", "display:flex;gap:6px;padding:10px 14px 0;flex-wrap:wrap;align-items:center"); tabs.id = "pqSbTabs";
    var body = el("div", "padding:10px 14px 14px;overflow:auto;display:flex;flex-direction:column;gap:10px"); body.id = "pqSbBody";
    var note = el("div", "padding:8px 14px 12px;font-size:11px;color:#94a3b8;border-top:1px solid #ffffff12",
      "Lokasi adalah PERKIRAAN dari alamat IP (akurat di tingkat kota/provinsi; pada data seluler bisa bergeser ke kota operator). IP tidak disimpan, koordinat dibulatkan ±1 km. Data ini hanya terlihat oleh admin.");
    box.append(head, ins, tabs, body, note); panel.appendChild(box);
    panel.addEventListener("click", function (e) { if (e.target === panel) tutup(); });
    document.body.appendChild(panel);
  }
  function tutup() { if (panel) panel.style.display = "none"; }
  function buka() {
    if (!isAdmin()) return;   // lapisan pengaman tambahan di sisi tampilan
    build(); panel.style.display = "flex"; render(); muat(false);
  }

  async function muat(manual) {
    if (!isAdmin() || loading) return;
    loading = true; if (manual) { err = null; render(); }
    try { rows = await rpc("admin_sebaran_pengguna") || []; err = null; }
    catch (e) { err = e && e.code ? e : { code: "http" }; if (err.code === "denied") { bersihkan(); loading = false; return; } }
    loading = false; render();
  }

  function filtered(list) {
    var batas = { jam: 36e5, hari: 864e5, minggu: 7 * 864e5, bulan: 30 * 864e5 }[periode];
    return list.filter(function (u) {
      if (batas && Date.now() - new Date(u.terakhir).getTime() > batas) return false;
      if (!q) return true;
      return [u.nama, u.email, u.instansi, lokasiLabel(u.loc)].concat(u.devs.map(perangkatLabel)).join(" ").toLowerCase().indexOf(q) >= 0;
    });
  }

  function insight(us) {
    var h = $("pqSbInsight"); if (!h) return; h.textContent = "";
    if (err || !us.length) return;
    var online = us.filter(function (u) { return u.online; }).length, h24 = us.filter(function (u) { return Date.now() - new Date(u.terakhir) < 864e5; }).length;
    var kota = hitung(us, function (u) { return u.loc.kota; })[0], jenis = hitung(rows, function (r) { return JENIS[r.jenis] || r.jenis; })[0], os = hitung(rows, function (r) { return (r.os || "").split(" ")[0]; })[0];
    var wasp = us.filter(function (u) { return u.flags.length; }).length;
    var g = el("div", "display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px");
    function k(angka, label, warna) { var c = el("div", "border:1px solid " + warna + "55;border-radius:10px;padding:8px 10px;background:" + warna + "12"); c.append(el("div", "font-size:20px;font-weight:800;color:" + warna, String(angka)), el("div", "font-size:11px;color:#94a3b8", label)); return c; }
    g.append(k(us.length, "pengguna terlacak", "#22d3ee"), k(online, "online sekarang", "#34d399"), k(h24, "aktif 24 jam", "#a78bfa"), k(wasp, "perlu dicek", wasp ? "#fb923c" : "#64748b"));
    h.appendChild(g);
    var kal = "Terbanyak dari " + (kota && kota[0] !== "Tidak diketahui" ? kota[0] + " (" + kota[1] + " pengguna)" : "lokasi belum terdeteksi") + ". " +
      (jenis ? Math.round(jenis[1] * 100 / rows.length) + "% perangkat berupa " + jenis[0] : "") + (os ? ", dominan " + os[0] + "." : ".") +
      (wasp ? " ⚠ " + wasp + " akun menunjukkan pola akses tidak biasa — lihat tab Waspada." : "");
    h.appendChild(el("div", "margin-top:8px;font-size:12px;color:#cbd5e1", kal));
  }

  function render() {
    if (!panel) return;
    var body = $("pqSbBody"), tabs = $("pqSbTabs"); if (!body || !tabs) return;
    var us = users(), fu = filtered(us), wasp = us.filter(function (u) { return u.flags.length; });
    insight(us);
    tabs.textContent = "";
    [["lokasi", "Lokasi"], ["perangkat", "Perangkat"], ["daftar", "Pengguna (" + fu.length + ")"], ["waspada", "Waspada (" + wasp.length + ")"]].forEach(function (t) {
      var b = el("button", "border-radius:16px;padding:5px 12px;cursor:pointer;font:600 12px system-ui;border:1px solid " + (tab === t[0] ? "#22d3ee" : "#ffffff30") + ";background:" + (tab === t[0] ? "#22d3ee" : "transparent") + ";color:" + (tab === t[0] ? "#04121a" : "#e6f1ff"), t[1]);
      b.onclick = function () { tab = t[0]; render(); }; tabs.appendChild(b);
    });
    var sel = el("select", "background:#0b1120;color:#e6f1ff;border:1px solid #ffffff30;border-radius:8px;padding:6px 8px;font:12px system-ui;margin-left:auto");
    [["semua", "Semua waktu"], ["jam", "1 jam terakhir"], ["hari", "24 jam terakhir"], ["minggu", "7 hari"], ["bulan", "30 hari"]].forEach(function (o) { var op = el("option", "", o[1]); op.value = o[0]; if (periode === o[0]) op.selected = true; sel.appendChild(op); });
    sel.onchange = function () { periode = sel.value; render(); }; tabs.appendChild(sel);

    body.textContent = "";
    if (loading && !rows.length) { body.appendChild(el("div", "color:#94a3b8", "Memuat data…")); return; }
    if (err) {
      var m = err.code === "nosql" ? "Fitur ini belum aktif di database. Jalankan file supabase-sebaran-pengguna.sql di Supabase › SQL Editor, lalu klik Segarkan."
        : err.code === "nosess" ? "Sesi login tidak ditemukan. Masuk ulang lalu buka lagi." : "Gagal memuat data (" + (err.status || err.code) + "). Coba Segarkan.";
      body.appendChild(el("div", "padding:10px 12px;border:1px solid #fbbf2455;border-radius:10px;background:#2a2008;color:#fde68a", m)); return;
    }
    if (!us.length) { body.appendChild(el("div", "color:#94a3b8", "Belum ada data. Data muncul otomatis begitu pengguna membuka aplikasi setelah SQL dipasang (perangkat admin sendiri tercatat dalam beberapa detik).")); return; }
    if (tab === "lokasi") return renderLokasi(body, fu);
    if (tab === "perangkat") return renderPerangkat(body, fu);
    if (tab === "waspada") return renderWaspada(body, wasp);
    renderDaftar(body, fu);
  }

  function renderLokasi(body, fu) {
    var mw = el("div", "height:270px;border-radius:10px;overflow:hidden;border:1px solid #ffffff1a;position:relative");
    var mc = el("div", "position:absolute;inset:0"); mw.appendChild(mc); body.appendChild(mw);
    var kel = {}; fu.forEach(function (u) { var l = u.loc; if (l.lat == null || l.lng == null) return; var k = (l.kota || l.provinsi || "?") + "|" + l.lat + "|" + l.lng; (kel[k] = kel[k] || { n: 0, on: 0, l: l }).n++; if (u.online) kel[k].on++; });
    setTimeout(function () {
      try {
        if (map) { map.remove(); map = null; }
        map = L.map(mc, { zoomControl: true, rotate: false, rotateControl: false, attributionControl: false, minZoom: 3 }).setView([-2.5, 118], 4);
        L.tileLayer("https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, maxNativeZoom: 16 }).addTo(map);
        mapLayer = L.layerGroup().addTo(map);
        var pts = [];
        Object.keys(kel).forEach(function (k) {
          var g = kel[k], ll = [+g.l.lat, +g.l.lng]; pts.push(ll);
          L.circleMarker(ll, { radius: Math.min(26, 8 + g.n * 3), color: g.on ? "#34d399" : "#22d3ee", weight: 2, fillColor: g.on ? "#34d399" : "#22d3ee", fillOpacity: .35 })
            .bindTooltip((g.l.kota || g.l.provinsi || "Lokasi") + " · " + g.n + " pengguna" + (g.on ? " (" + g.on + " online)" : "")).addTo(mapLayer);
        });
        if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(.3), { maxZoom: 10 });
        map.invalidateSize();
      } catch (e) { mc.textContent = "Peta tidak dapat dimuat."; }
    }, 60);
    var g = el("div", "display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px");
    g.append(card("Provinsi / wilayah", bars(hitung(fu, function (u) { return u.loc.provinsi || u.loc.negara; }), fu.length, "#22d3ee", 10)),
      card("Kota / kabupaten", bars(hitung(fu, function (u) { return u.loc.kota; }), fu.length, "#a78bfa", 10)),
      card("Negara", bars(hitung(fu, function (u) { return u.loc.negara; }), fu.length, "#34d399", 6)));
    body.appendChild(g);
  }
  function renderPerangkat(body, fu) {
    var ids = {}; fu.forEach(function (u) { ids[u.id] = 1; });
    var dv = rows.filter(function (r) { return ids[r.user_id]; });
    var g = el("div", "display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px");
    g.append(card("Jenis perangkat", bars(hitung(dv, function (r) { return JENIS[r.jenis] || r.jenis; }), dv.length, "#22d3ee")),
      card("Sistem operasi", bars(hitung(dv, function (r) { return r.os; }), dv.length, "#a78bfa")),
      card("Browser", bars(hitung(dv, function (r) { return r.browser; }), dv.length, "#34d399")),
      card("Cara akses", bars(hitung(dv, function (r) { return r.pwa ? "Aplikasi terpasang (PWA)" : "Browser biasa"; }), dv.length, "#fbbf24")),
      card("Model perangkat", bars(hitung(dv.filter(function (r) { return r.model; }), function (r) { return r.model; }), dv.filter(function (r) { return r.model; }).length, "#fb923c", 8)),
      card("Kualitas jaringan", bars(hitung(dv, function (r) { return r.jaringan ? r.jaringan.toUpperCase() : null; }), dv.length, "#f472b6", 5)));
    body.appendChild(g);
    body.appendChild(el("div", "font-size:11px;color:#94a3b8", dv.length + " perangkat dari " + fu.length + " pengguna. Satu pengguna bisa punya beberapa perangkat."));
  }
  function userRow(u) {
    var c = el("div", "border:1px solid #ffffff1a;border-radius:10px;padding:10px 12px;background:#0b1120;display:flex;flex-direction:column;gap:6px");
    var top = el("div", "display:flex;align-items:center;gap:8px;flex-wrap:wrap");
    top.appendChild(el("span", "width:9px;height:9px;border-radius:50%;flex:none;background:" + (u.online ? "#34d399" : "#64748b") + (u.online ? ";box-shadow:0 0 6px #34d399" : "")));
    top.appendChild(el("b", "flex:1 1 160px;min-width:0;overflow-wrap:anywhere", u.nama || u.email));
    top.appendChild(el("span", "font-size:11px;padding:1px 8px;border-radius:10px;border:1px solid #ffffff30;color:#94a3b8", u.role));
    top.appendChild(el("span", "font-size:11px;color:#94a3b8", u.online ? "online" : rel(u.terakhir)));
    c.appendChild(top);
    if (u.nama) c.appendChild(el("div", "font-size:11.5px;color:#94a3b8;overflow-wrap:anywhere", [u.email, u.instansi].filter(Boolean).join(" · ")));
    c.appendChild(el("div", "font-size:12px", "📍 " + lokasiLabel(u.loc)));
    u.devs.slice().sort(function (a, b) { return new Date(b.terakhir) - new Date(a.terakhir); }).forEach(function (d) {
      c.appendChild(el("div", "font-size:11.5px;color:#cbd5e1;padding-left:4px;overflow-wrap:anywhere", (d.jenis === "mobile" ? "📱 " : d.jenis === "tablet" ? "📲 " : "💻 ") + perangkatLabel(d) + " — " + rel(d.terakhir) + " · " + d.jml_akses + "× akses"));
    });
    u.flags.forEach(function (f) { c.appendChild(el("div", "font-size:11.5px;color:#fdba74", "⚠ " + f)); });
    return c;
  }
  function renderDaftar(body, fu) {
    var si = el("input", "background:#0b1120;color:#e6f1ff;border:1px solid #ffffff30;border-radius:8px;padding:7px 10px;font:12px system-ui;width:100%;box-sizing:border-box");
    si.placeholder = "Cari nama, email, instansi, kota, perangkat…"; si.value = q;
    si.oninput = function () { q = si.value.trim().toLowerCase(); var p = si.selectionStart; render(); var n = $("pqSbBody") && $("pqSbBody").querySelector("input"); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) { /* abaikan */ } } };
    body.appendChild(si);
    if (!fu.length) body.appendChild(el("div", "color:#94a3b8", "Tidak ada pengguna yang cocok."));
    fu.slice(0, 200).forEach(function (u) { body.appendChild(userRow(u)); });
  }
  function renderWaspada(body, wasp) {
    body.appendChild(el("div", "font-size:12px;color:#94a3b8", "Penanda otomatis, bukan bukti pelanggaran: bisa saja pengguna berpindah jaringan/VPN atau berganti HP. Tinjau dulu sebelum memblokir lewat panel Persetujuan akses."));
    if (!wasp.length) { body.appendChild(el("div", "color:#34d399;font-weight:600", "✓ Tidak ada pola akses yang mencurigakan.")); return; }
    wasp.sort(function (a, b) { return b.flags.length - a.flags.length; }).forEach(function (u) { body.appendChild(userRow(u)); });
  }

  function eksporCsv() {
    if (!rows.length) { T("Belum ada data untuk diekspor", true); return; }
    var kol = ["email", "nama", "instansi", "role", "jenis", "os", "browser", "model", "negara", "provinsi", "kota", "lat", "lng", "pwa", "jaringan", "pertama", "terakhir", "jml_akses"];
    var esc = function (v) { v = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };   // cegah injeksi rumus Excel
    var csv = "\ufeff" + kol.join(",") + "\n" + rows.map(function (r) { return kol.map(function (k) { return esc(r[k]); }).join(","); }).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "sebaran-pengguna-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  /* ---- tombol: dibuat HANYA untuk admin, dihapus total saat bukan admin / logout ---- */
  function addButton() {
    if (btn || !isAdmin()) return;
    btn = document.createElement("button");
    btn.id = "pqSebaranBtn"; btn.innerHTML = '<i class="fa-solid fa-earth-asia"></i>'; btn.title = "Sebaran lokasi & perangkat pengguna (admin)"; btn.onclick = buka;
    if (typeof PQ_DOCK !== "undefined" && PQ_DOCK.adopt) PQ_DOCK.adopt(btn, "Sebaran pengguna");
    else { btn.style.cssText = "position:fixed;left:10px;bottom:220px;z-index:3900;width:42px;height:42px;border-radius:12px;border:1px solid #22d3ee66;background:#0e7490;color:#fff;cursor:pointer"; document.body.appendChild(btn); }
    if (!poll) poll = setInterval(function () { if (isAdmin() && panel && panel.style.display === "flex" && document.visibilityState === "visible") muat(false); }, 6e4);
  }
  function bersihkan() {   // bukan admin lagi / logout: musnahkan UI & data dari memori
    if (poll) { clearInterval(poll); poll = 0; }
    try { if (map) { map.remove(); map = null; } } catch (e) { /* abaikan */ }
    if (panel) { panel.remove(); panel = null; }
    if (btn) { var w = btn.closest && (btn.closest("[data-pq-dock-item]") || null); (w || btn).remove(); btn = null; }
    rows = []; err = null;
  }
  function sinkron() { if (isAdmin()) addButton(); else bersihkan(); }
  window.addEventListener("pq-admin", sinkron);
  window.addEventListener("pq-login", function () { setTimeout(sinkron, 1800); });
  window.addEventListener("storage", function (e) { if (e.key === SK && !e.newValue) { window.__pqIsAdmin = false; sinkron(); } });

  function boot() { mulaiPencatat(); setTimeout(sinkron, 2500); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
