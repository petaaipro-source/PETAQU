/* PETAQU — Sebaran lokasi & akses perangkat pengguna.
   1) PENCATAT (semua pengguna login, senyap): kirim jenis perangkat/OS/browser + perkiraan lokasi (dari IP, IP tidak disimpan).
   2) PANEL (HANYA admin): peta sebaran, statistik perangkat, daftar pengguna, peringatan akun mencurigakan.
   3) RIWAYAT (HANYA admin): linimasa semua kejadian (daftar, buka aplikasi, perangkat/lokasi baru, peran, bayar, hapus akun),
      riwayat pengguna GRATIS (uji coba 10 menit) + analisis cerdas. Disimpan di tabel terpisah (supabase-riwayat-pengguna.sql)
      sehingga tetap ada walau akun gratis dikunci/dihapus.
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
  /* dipakai petaqu-trial.js: info perangkat + perkiraan lokasi untuk riwayat pengguna GRATIS (tanpa IP; hasil lokasi di-cache 12 jam) */
  window.__pqInfoPerangkat = async function () {
    var d = await highEntropyModel(parseUA()), g = await perkiraanLokasi(), tz = "", con = navigator.connection || {};
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* abaikan */ }
    return { jenis: d.jenis, os: d.os, browser: d.browser, model: d.model, layar: screen.width + "x" + screen.height + "@" + (window.devicePixelRatio || 1),
      bahasa: navigator.language || null, zona: tz, jaringan: con.effectiveType || null, negara: g.negara, provinsi: g.provinsi, kota: g.kota };
  };
  function mulaiPencatat() {
    setTimeout(function () { lapor(true); }, 4000);
    setInterval(function () { if (document.visibilityState === "visible") lapor(false); }, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") lapor(false); });
    window.addEventListener("pq-login", function () { setTimeout(function () { lapor(true); }, 1500); });
  }

  /* ================= 2) PANEL ADMIN ================= */
  var btn = null, panel = null, map = null, mapLayer = null, rows = [], tab = "lokasi", q = "", periode = "semua", err = null, loading = false, poll = 0;
  var ev = [], gr = [], errR = null, loadingR = false, loadedR = false, qR = "", qG = "", filR = "semua", stG = "semua";

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
    var rf = el("button", btnCss("transparent", "#e6f1ff", "#ffffff30"), "Segarkan"); rf.onclick = function () { muat(true); muatRiwayat(true); };
    var cl = el("button", "background:transparent;border:0;color:#e6f1ff;font-size:20px;cursor:pointer;padding:0 6px", "×"); cl.onclick = tutup;
    head.append(ex, rf, cl);
    var ins = el("div", "padding:10px 14px 0"); ins.id = "pqSbInsight";
    var tabs = el("div", "display:flex;gap:6px;padding:10px 14px 0;flex-wrap:wrap;align-items:center"); tabs.id = "pqSbTabs";
    var body = el("div", "padding:10px 14px 14px;overflow:auto;display:flex;flex-direction:column;gap:10px"); body.id = "pqSbBody";
    var note = el("div", "padding:8px 14px 12px;font-size:11px;color:#94a3b8;border-top:1px solid #ffffff12",
      "Lokasi adalah PERKIRAAN dari alamat IP (akurat di tingkat kota/provinsi; pada data seluler bisa bergeser ke kota operator). IP tidak disimpan, koordinat dibulatkan ±1 km. Riwayat hanya mencatat jenis kejadian, waktu, email, perangkat & perkiraan kota. Data ini hanya terlihat oleh admin.");
    box.append(head, ins, tabs, body, note); panel.appendChild(box);
    panel.addEventListener("click", function (e) { if (e.target === panel) tutup(); });
    document.body.appendChild(panel);
  }
  function tutup() { if (panel) panel.style.display = "none"; }
  function buka() {
    if (!isAdmin()) return;   // lapisan pengaman tambahan di sisi tampilan
    build(); panel.style.display = "flex"; render(); muat(false); muatRiwayat(false);
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
    [["lokasi", "Lokasi"], ["perangkat", "Perangkat"], ["daftar", "Pengguna (" + fu.length + ")"], ["riwayat", "Riwayat"], ["gratis", "Gratis (" + gr.filter(function (r) { return inP(r.mulai); }).length + ")"], ["waspada", "Waspada (" + wasp.length + ")"]].forEach(function (t) {
      var b = el("button", "border-radius:16px;padding:5px 12px;cursor:pointer;font:600 12px system-ui;border:1px solid " + (tab === t[0] ? "#22d3ee" : "#ffffff30") + ";background:" + (tab === t[0] ? "#22d3ee" : "transparent") + ";color:" + (tab === t[0] ? "#04121a" : "#e6f1ff"), t[1]);
      b.onclick = function () { tab = t[0]; render(); }; tabs.appendChild(b);
    });
    var sel = el("select", "background:#0b1120;color:#e6f1ff;border:1px solid #ffffff30;border-radius:8px;padding:6px 8px;font:12px system-ui;margin-left:auto");
    [["semua", "Semua waktu"], ["jam", "1 jam terakhir"], ["hari", "24 jam terakhir"], ["minggu", "7 hari"], ["bulan", "30 hari"]].forEach(function (o) { var op = el("option", "", o[1]); op.value = o[0]; if (periode === o[0]) op.selected = true; sel.appendChild(op); });
    sel.onchange = function () { periode = sel.value; render(); }; tabs.appendChild(sel);

    body.textContent = "";
    if (tab === "riwayat" || tab === "gratis") return renderRiwayatTab(body);   // tidak bergantung pada data perangkat (pengguna gratis tidak punya sesi)
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
        var tl = L.tileLayer("https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, maxNativeZoom: 16 }).addTo(map), gagal = 0;
        tl.on("tileerror", function () {   // cadangan otomatis ke OpenStreetMap bila tile Esri gagal dimuat
          if (++gagal === 4) { map.removeLayer(tl); L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map); }
        });
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

  /* ================= 3) RIWAYAT & PENGGUNA GRATIS (hanya admin) ================= */
  var ROLE_LBL = { pending: "menunggu", trial: "uji coba gratis", viewer: "viewer", surveyor: "surveyor", admin: "admin", blocked: "diblokir", dihapus: "dihapus", expired: "berakhir" };
  var ALASAN = { used: "Gmail/perangkat ini sudah pernah memakai uji coba", expired: "Jatah 10 menit sudah habis", bad_email: "Bukan akun Gmail yang valid", bad_device: "Data perangkat tidak valid", no_auth: "Tidak terautentikasi" };
  var EVT = {   /* ikon, label, warna, kelompok */
    daftar: ["🆕", "Mendaftar", "#38bdf8", "akun"], peran: ["🔑", "Perubahan peran", "#fbbf24", "akun"], bayar: ["💳", "Pembayaran", "#4ade80", "akun"], hapus_akun: ["🗑️", "Akun dihapus", "#f87171", "akun"],
    sesi: ["🔓", "Membuka aplikasi", "#34d399", "akses"], perangkat_baru: ["📱", "Perangkat baru", "#a78bfa", "akses"], lokasi_baru: ["📍", "Pindah lokasi", "#fb923c", "akses"],
    trial_klaim: ["🎁", "Mulai uji coba gratis", "#22d3ee", "gratis"], trial_lanjut: ["⏱️", "Lanjut uji coba", "#22d3ee", "gratis"], trial_ditolak: ["🚫", "Uji coba ditolak", "#f87171", "gratis"],
    trial_info: ["ℹ️", "Info perangkat uji coba", "#64748b", "info"]
  };
  var GRUP = [["semua", "Semua"], ["akses", "Akses"], ["gratis", "Gratis"], ["akun", "Akun & bayar"]];
  var ST = {
    berjalan: ["Sedang berjalan", "#22d3ee"], habis: ["Habis · belum berlangganan", "#fbbf24"], berlangganan: ["Berlangganan", "#34d399"],
    berlangganan_berakhir: ["Langganan berakhir", "#fb923c"], diblokir: ["Diblokir", "#f87171"], akun_dihapus: ["Akun dihapus", "#94a3b8"]
  };

  function wib(x, opt) { try { return new Date(x).toLocaleString("id-ID", Object.assign({ timeZone: "Asia/Jakarta" }, opt || {})); } catch (e) { return String(x); } }
  function hariKey(x) { return new Date(new Date(x).getTime() + 7 * 36e5).toISOString().slice(0, 10); }   /* tanggal WIB */
  function hariLabel(k) {
    if (k === hariKey(Date.now())) return "Hari ini"; if (k === hariKey(Date.now() - 864e5)) return "Kemarin";
    return wib(k + "T12:00:00+07:00", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function jamTxt(x) { return wib(x, { hour: "2-digit", minute: "2-digit", hour12: false }); }
  function rupiah(n) { return n == null ? "" : "Rp" + Number(n).toLocaleString("id-ID"); }
  function inP(x) { var b = { jam: 36e5, hari: 864e5, minggu: 7 * 864e5, bulan: 30 * 864e5 }[periode]; return !b || Date.now() - new Date(x).getTime() <= b; }
  function uniq(a) { var m = {}; a.forEach(function (x) { if (x) m[x] = 1; }); return Object.keys(m); }
  function mmss(s) { s = Math.max(0, s | 0); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function chip(txt, warna) { return el("span", "font-size:10.5px;padding:1px 8px;border-radius:10px;border:1px solid " + warna + "66;color:" + warna + ";background:" + warna + "14;white-space:nowrap", txt); }
  function pesanR(e) {
    return e.code === "nosql" ? "Fitur riwayat belum aktif di database. Jalankan file supabase-riwayat-pengguna.sql di Supabase › SQL Editor, lalu klik Segarkan."
      : e.code === "nosess" ? "Sesi login tidak ditemukan. Masuk ulang lalu buka lagi." : "Gagal memuat riwayat (" + (e.status || e.code) + "). Coba Segarkan.";
  }

  async function muatRiwayat(manual) {
    if (!isAdmin() || loadingR) return;
    loadingR = true; if (manual) { errR = null; render(); }
    try {
      var r = await Promise.all([rpc("admin_riwayat_akses", { p_hari: 365, p_limit: 3000 }), rpc("admin_riwayat_gratis")]);
      ev = r[0] || []; gr = r[1] || []; errR = null; loadedR = true;
    } catch (e) { errR = e && e.code ? e : { code: "http" }; if (errR.code === "denied") { bersihkan(); loadingR = false; return; } }
    loadingR = false; render();
  }

  function deskripsi(e) {
    var d = e.detail || {};
    switch (e.jenis) {
      case "daftar": return "Akun dibuat" + (d.provider ? " lewat " + (d.provider === "google" ? "Google" : d.provider) : "") + (d.isi_ulang ? " (riwayat lama)" : "");
      case "peran": return (ROLE_LBL[d.dari] || d.dari) + " → " + (ROLE_LBL[d.ke] || d.ke) + (e.oleh_email ? " · oleh " + e.oleh_email : "");
      case "bayar": return [d.bulan ? d.bulan + " bulan" : "", rupiah(d.jumlah), d.metode, d.sampai ? "aktif s/d " + d.sampai : ""].filter(Boolean).join(" · ");
      case "hapus_akun": return "Peran terakhir: " + (ROLE_LBL[d.peran_terakhir] || d.peran_terakhir || "?") + (d.login_terakhir ? " · login terakhir " + rel(d.login_terakhir) : " · tidak pernah login");
      case "lokasi_baru": return (d.dari || "?") + " → " + (d.ke || "?");
      case "trial_klaim": return "Jatah 10 menit dimulai" + (d.isi_ulang ? " (riwayat lama)" : "");
      case "trial_lanjut": return "Melanjutkan sisa jatah" + (d.sisa ? " (" + Math.round(d.sisa / 60) + " menit)" : "");
      case "trial_ditolak": return ALASAN[d.alasan] || ("Ditolak: " + (d.alasan || "?"));
      default:
        return [perangkatLabel(d), lokasiLabel(d)].filter(function (x) { return x && x !== "Lokasi tidak diketahui"; }).join(" · ") +
          (d.menit ? " · " + d.menit + " mnt" : "") + (d.jeda_menit > 4320 ? " · kembali setelah " + Math.round(d.jeda_menit / 1440) + " hari" : "");
    }
  }
  function evFiltered() {
    return ev.filter(function (e) {
      var m = EVT[e.jenis]; if (!m || m[3] === "info" || !inP(e.at)) return false;
      if (filR !== "semua" && m[3] !== filR) return false;
      return !qR || [e.email, e.nama, deskripsi(e), m[1]].join(" ").toLowerCase().indexOf(qR) >= 0;
    });
  }
  function grFiltered() {
    return gr.filter(function (r) {
      if (!inP(r.mulai) || (stG !== "semua" && r.status !== stG)) return false;
      return !qG || [r.email, r.nama, r.instansi, r.hp, r.kota, r.provinsi].join(" ").toLowerCase().indexOf(qG) >= 0;
    });
  }
  function fokusEmail(email) { qR = String(email || "").toLowerCase(); filR = "semua"; tab = "riwayat"; render(); }
  function kotakCari(ph, kunci) {
    var si = el("input", "background:#0b1120;color:#e6f1ff;border:1px solid #ffffff30;border-radius:8px;padding:7px 10px;font:12px system-ui;flex:1 1 180px;min-width:0;box-sizing:border-box");
    si.placeholder = ph; si.value = kunci === "gratis" ? qG : qR;
    si.oninput = function () { var v = si.value.trim().toLowerCase(); if (kunci === "gratis") qG = v; else qR = v; var p = si.selectionStart; render(); var n = $("pqSbBody") && $("pqSbBody").querySelector("input"); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) { /* abaikan */ } } };
    return si;
  }

  /* ---- grafik mini ---- */
  function heat(list) {
    var g = [], mx = 0, i, j, HR = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
    for (i = 0; i < 7; i++) { g.push([]); for (j = 0; j < 24; j++) g[i].push(0); }
    list.forEach(function (e) { var t = new Date(new Date(e.at).getTime() + 7 * 36e5), r = (t.getUTCDay() + 6) % 7, h = t.getUTCHours(); mx = Math.max(mx, ++g[r][h]); });
    var w = el("div", "display:grid;grid-template-columns:26px repeat(24,1fr);gap:2px;align-items:center;font-size:9px;color:#94a3b8");
    w.appendChild(el("span", ""));
    for (j = 0; j < 24; j++) w.appendChild(el("span", "text-align:center", j % 6 === 0 ? String(j) : ""));
    for (i = 0; i < 7; i++) {
      w.appendChild(el("span", "", HR[i]));
      for (j = 0; j < 24; j++) { var c = el("span", "height:12px;border-radius:2px;background:rgba(34,211,238," + (mx ? (0.06 + 0.9 * g[i][j] / mx).toFixed(2) : "0.06") + ")"); c.title = HR[i] + " pukul " + j + ".00 WIB · " + g[i][j] + " kejadian"; w.appendChild(c); }
    }
    return w;
  }
  function spark(vals, warna, tip) {
    var mx = Math.max(1, Math.max.apply(null, vals)), w = el("div", "display:flex;align-items:flex-end;gap:3px;height:46px");
    vals.forEach(function (v, i) { var b = el("div", "flex:1;border-radius:3px 3px 0 0;background:" + warna + ";opacity:" + (v ? 1 : 0.2) + ";height:" + Math.max(5, v * 100 / mx) + "%"); b.title = tip(i, v); w.appendChild(b); });
    return w;
  }
  function seri14() {
    var ks = [], i; for (i = 13; i >= 0; i--) ks.push(hariKey(Date.now() - i * 864e5));
    var akt = ks.map(function (k) { return uniq(ev.filter(function (e) { return (e.jenis === "sesi" || e.jenis === "perangkat_baru") && hariKey(e.at) === k; }).map(function (e) { return e.email; })).length; });
    var gra = ks.map(function (k) { return ev.filter(function (e) { return e.jenis === "trial_klaim" && hariKey(e.at) === k; }).length; });
    return { ks: ks, akt: akt, gra: gra };
  }

  /* ---- analisis cerdas: kesimpulan otomatis dari seluruh riwayat ---- */
  function analisis() {
    var out = [], now = Date.now(), D = 864e5;
    function add(t, s, act) { out.push({ t: t, s: s, act: act || null }); }
    var akt = ev.filter(function (e) { return e.jenis === "sesi" || e.jenis === "perangkat_baru"; });
    var w1 = akt.filter(function (e) { return now - new Date(e.at) <= 7 * D; }), w0 = akt.filter(function (e) { var a = now - new Date(e.at); return a > 7 * D && a <= 14 * D; });
    if (w1.length + w0.length >= 4) {
      if (!w0.length) add("info", "Aktivitas 7 hari terakhir: " + w1.length + " sesi dari " + uniq(w1.map(function (e) { return e.email; })).length + " pengguna.");
      else { var p = Math.round((w1.length - w0.length) * 100 / w0.length); add(p <= -30 ? "warn" : p >= 20 ? "ok" : "info", "Aktivitas 7 hari terakhir " + (p >= 0 ? "naik " : "turun ") + Math.abs(p) + "% dibanding 7 hari sebelumnya (" + w0.length + " → " + w1.length + " sesi)."); }
    }
    var b30 = ev.filter(function (e) { return (e.jenis === "sesi" || e.jenis === "perangkat_baru" || e.jenis === "trial_klaim") && now - new Date(e.at) <= 30 * D; });
    if (b30.length >= 10) {
      var jm = {}; b30.forEach(function (e) { var h = new Date(new Date(e.at).getTime() + 7 * 36e5).getUTCHours(); jm[h] = (jm[h] || 0) + 1; });
      var top = Object.keys(jm).sort(function (a, b) { return jm[b] - jm[a]; })[0] | 0;
      add("info", "Jam tersibuk sekitar pukul " + ("0" + top).slice(-2) + ".00–" + ("0" + ((top + 1) % 24)).slice(-2) + ".00 WIB (" + jm[top] + " dari " + b30.length + " kejadian 30 hari terakhir). Hindari pemeliharaan di jam ini.");
    }
    var mnt = ev.filter(function (e) { return e.jenis === "sesi" && e.detail && e.detail.menit && now - new Date(e.at) <= 30 * D; }).map(function (e) { return +e.detail.menit; }).sort(function (a, b) { return a - b; });
    if (mnt.length >= 3) add("info", "Lama sesi rata-rata " + Math.round(mnt.reduce(function (a, b) { return a + b; }, 0) / mnt.length) + " menit (median " + mnt[mnt.length >> 1] + " menit, dari " + mnt.length + " sesi 30 hari).");
    var cnt = {}; w1.forEach(function (e) { if (e.email) cnt[e.email] = (cnt[e.email] || 0) + 1; });
    var tp = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 3);
    if (tp.length) add("ok", "Paling aktif minggu ini: " + tp.map(function (e) { return e + " (" + cnt[e] + "×)"; }).join(", ") + ".", function () { fokusEmail(tp[0]); });
    var pindah = ev.filter(function (e) { return e.jenis === "lokasi_baru" && now - new Date(e.at) <= 7 * D; });
    if (pindah.length) add("warn", pindah.length + " perpindahan lokasi akses dalam 7 hari terakhir (" + uniq(pindah.map(function (e) { return e.email; })).length + " akun). Bisa wajar (pindah jaringan/VPN), cek bila berulang.", function () { filR = "akses"; qR = "pindah lokasi"; render(); });

    if (gr.length) {
      var ber = gr.filter(function (r) { return r.status === "berlangganan" || r.status === "berlangganan_berakhir"; }).length, pct = Math.round(ber * 100 / gr.length);
      add(gr.length >= 5 && pct < 10 ? "warn" : pct >= 25 ? "ok" : "info", ber + " dari " + gr.length + " pengguna uji coba gratis akhirnya berlangganan (" + pct + "%)." + (gr.length >= 5 && pct < 10 ? " Konversi rendah: pertimbangkan menghubungi calon pelanggan sebelum jatah habis." : ""), function () { tab = "gratis"; qG = ""; stG = "semua"; render(); });
      var hangat = gr.filter(function (r) { return r.status === "habis" && now - new Date(r.mulai) <= 14 * D; });
      if (hangat.length) add("warn", "🔥 " + hangat.length + " pengguna gratis baru habis jatah (≤14 hari) dan belum berlangganan. Waktu terbaik untuk menghubungi" + (hangat.some(function (r) { return r.hp; }) ? " (ada nomor HP)." : "."), function () { stG = "habis"; qG = ""; tab = "gratis"; render(); });
      var curiga = gr.filter(function (r) { return r.ditolak > 0 || r.klaim_se_perangkat > 0; });
      if (curiga.length) add("bad", curiga.length + " klaim gratis menunjukkan upaya mengulang (ditolak berkali-kali atau satu perangkat dipakai beberapa Gmail).", function () { stG = "semua"; qG = ""; tab = "gratis"; render(); });
    }
    var diam = users().filter(function (u) { return (u.role === "viewer" || u.role === "surveyor") && now - new Date(u.terakhir) > 14 * D; });
    if (diam.length) add("warn", diam.length + " pelanggan berbayar tidak membuka aplikasi ≥14 hari — berisiko tidak memperpanjang. Hubungi: " + diam.slice(0, 3).map(function (u) { return u.nama || u.email; }).join(", ") + (diam.length > 3 ? ", …" : "."), function () { tab = "daftar"; periode = "semua"; q = diam[0].email.toLowerCase(); render(); });
    if (!out.length) add("info", "Belum cukup data untuk disimpulkan. Analisis muncul otomatis seiring bertambahnya riwayat.");
    return out;
  }

  function evRow(e) {
    var m = EVT[e.jenis], r = el("div", "display:flex;gap:8px;align-items:flex-start;padding:7px 10px;border:1px solid #ffffff14;border-left:3px solid " + m[2] + ";border-radius:8px;background:#0b1120");
    r.title = wib(e.at, { dateStyle: "medium", timeStyle: "medium" }) + " WIB";
    r.appendChild(el("span", "flex:none;width:40px;font-size:11px;color:#94a3b8;padding-top:1px", jamTxt(e.at)));
    r.appendChild(el("span", "flex:none;font-size:14px;line-height:1.2", m[0]));
    var c = el("div", "min-width:0;flex:1;display:flex;flex-direction:column;gap:2px"), t = el("div", "display:flex;gap:6px;flex-wrap:wrap;align-items:baseline");
    t.appendChild(el("b", "font-size:12px;color:" + m[2], m[1]));
    var who = el("span", "font-size:12px;overflow-wrap:anywhere;cursor:pointer;border-bottom:1px dotted #64748b", e.nama || e.email || "(tanpa email)");
    who.title = "Lihat seluruh riwayat akun ini"; who.onclick = function () { fokusEmail(e.email); }; t.appendChild(who);
    if (e.role && e.role !== "dihapus") t.appendChild(el("span", "font-size:10.5px;color:#64748b", ROLE_LBL[e.role] || e.role));
    c.appendChild(t); c.appendChild(el("div", "font-size:11.5px;color:#cbd5e1;overflow-wrap:anywhere", deskripsi(e)));
    r.appendChild(c); return r;
  }

  function renderRiwayat(body) {
    var box = el("div", "border:1px solid #a78bfa55;border-radius:10px;padding:10px 12px;background:#a78bfa0f;display:flex;flex-direction:column;gap:6px"), W = { ok: "#34d399", info: "#22d3ee", warn: "#fb923c", bad: "#f87171" };
    box.appendChild(el("div", "font-weight:800;font-size:12px;color:#c4b5fd", "🧠 Analisis cerdas (otomatis dari seluruh riwayat)"));
    analisis().forEach(function (a) {
      var r = el("div", "display:flex;gap:8px;font-size:12px;color:#e2e8f0;line-height:1.45" + (a.act ? ";cursor:pointer" : "")); if (a.act) { r.onclick = a.act; r.title = "Klik untuk melihat detail"; }
      r.append(el("span", "flex:none;width:8px;height:8px;border-radius:50%;margin-top:5px;background:" + W[a.t]), el("span", "min-width:0;overflow-wrap:anywhere", a.s));
      box.appendChild(r);
    });
    body.appendChild(box);

    var s = seri14(), g = el("div", "display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px");
    var heatSrc = ev.filter(function (e) { return (e.jenis === "sesi" || e.jenis === "perangkat_baru" || e.jenis === "trial_klaim") && Date.now() - new Date(e.at) <= 30 * 864e5; });
    g.append(card("Pola aktivitas 30 hari (jam WIB × hari)", heat(heatSrc)),
      card("14 hari terakhir", (function () {
        var w = el("div", "display:flex;flex-direction:column;gap:6px");
        w.append(el("div", "font-size:11px;color:#94a3b8", "Pengguna aktif per hari"), spark(s.akt, "#22d3ee", function (i, v) { return hariLabel(s.ks[i]) + ": " + v + " pengguna aktif"; }),
          el("div", "font-size:11px;color:#94a3b8", "Uji coba gratis baru per hari"), spark(s.gra, "#fbbf24", function (i, v) { return hariLabel(s.ks[i]) + ": " + v + " uji coba"; }));
        return w;
      })()));
    body.appendChild(g);

    var bar = el("div", "display:flex;gap:6px;flex-wrap:wrap;align-items:center");
    GRUP.forEach(function (t) {
      var b = el("button", "border-radius:14px;padding:4px 11px;cursor:pointer;font:600 11.5px system-ui;border:1px solid " + (filR === t[0] ? "#a78bfa" : "#ffffff30") + ";background:" + (filR === t[0] ? "#a78bfa" : "transparent") + ";color:" + (filR === t[0] ? "#10061f" : "#e6f1ff"), t[1]);
      b.onclick = function () { filR = t[0]; render(); }; bar.appendChild(b);
    });
    bar.appendChild(kotakCari("Cari email, nama, kejadian, kota, perangkat…", "riwayat"));
    body.appendChild(bar);

    var list = evFiltered(), MAKS = 300;
    body.appendChild(el("div", "font-size:11px;color:#94a3b8", list.length + " kejadian" + (qR ? " untuk “" + qR + "”" : "") + (list.length > MAKS ? " (menampilkan " + MAKS + " terbaru — persempit dengan pencarian/periode)" : "") + ". Klik nama/email untuk melihat riwayat satu akun."));
    if (!list.length) { body.appendChild(el("div", "color:#94a3b8", ev.length ? "Tidak ada kejadian yang cocok." : "Belum ada riwayat. Kejadian tercatat otomatis mulai sekarang (daftar, buka aplikasi, uji coba gratis, perubahan peran, pembayaran).")); return; }
    var last = "", wrap = el("div", "display:flex;flex-direction:column;gap:5px");
    list.slice(0, MAKS).forEach(function (e) {
      var k = hariKey(e.at); if (k !== last) { last = k; wrap.appendChild(el("div", "font-size:11.5px;font-weight:700;color:#9fe8f5;margin-top:6px", hariLabel(k))); }
      wrap.appendChild(evRow(e));
    });
    body.appendChild(wrap);
  }

  function waLink(r) {
    var h = String(r.hp || "").replace(/\D/g, ""); if (h.length < 8) return null;
    if (h.charAt(0) === "0") h = "62" + h.slice(1); else if (h.charAt(0) === "8") h = "62" + h;
    var a = el("a", btnCss("#16a34a", "#fff") + ";text-decoration:none;display:inline-block", "WhatsApp");
    a.href = "https://wa.me/" + h + "?text=" + encodeURIComponent("Halo" + (r.nama ? " " + r.nama : "") + ", terima kasih sudah mencoba PETAQU. Jika Anda tertarik berlangganan atau butuh bantuan, silakan balas pesan ini.");
    a.target = "_blank"; a.rel = "noopener noreferrer"; return a;
  }
  function gratisRow(r) {
    var st = ST[r.status] || [r.status, "#94a3b8"], c = el("div", "border:1px solid #ffffff1a;border-left:3px solid " + st[1] + ";border-radius:10px;padding:10px 12px;background:#0b1120;display:flex;flex-direction:column;gap:5px");
    var top = el("div", "display:flex;align-items:center;gap:8px;flex-wrap:wrap");
    top.append(el("b", "flex:1 1 170px;min-width:0;overflow-wrap:anywhere", r.nama || r.email), chip(st[0], st[1]), el("span", "font-size:11px;color:#94a3b8", rel(r.mulai)));
    c.appendChild(top);
    var info = [r.nama ? r.email : "", r.instansi, r.hp].filter(Boolean).join(" · "); if (info) c.appendChild(el("div", "font-size:11.5px;color:#94a3b8;overflow-wrap:anywhere", info));
    c.appendChild(el("div", "font-size:12px", "🎁 Mulai " + wib(r.mulai, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " WIB" + (r.status === "berjalan" ? " · sisa " + mmss(r.sisa_detik) : "")));
    if (r.kota || r.negara) c.appendChild(el("div", "font-size:12px", "📍 " + lokasiLabel(r)));
    var pl = perangkatLabel(r); if (pl) c.appendChild(el("div", "font-size:11.5px;color:#cbd5e1;overflow-wrap:anywhere", (r.jenis === "mobile" ? "📱 " : r.jenis === "tablet" ? "📲 " : "💻 ") + pl));
    var hari = (Date.now() - new Date(r.mulai)) / 864e5;
    if (r.ditolak > 0) c.appendChild(el("div", "font-size:11.5px;color:#fdba74", "⚠ " + r.ditolak + " percobaan klaim ditolak" + (r.ditolak_terakhir ? " (terakhir " + rel(r.ditolak_terakhir) + ")" : "")));
    if (r.klaim_se_perangkat > 0) c.appendChild(el("div", "font-size:11.5px;color:#fdba74", "⚠ Perangkat ini juga dipakai klaim Gmail lain (" + r.klaim_se_perangkat + ") — kemungkinan satu orang memakai beberapa akun"));
    if (r.status === "habis" && hari <= 14) c.appendChild(el("div", "font-size:11.5px;color:#fcd34d", "🔥 Calon pelanggan hangat — jatah habis " + rel(r.mulai) + ", belum berlangganan"));
    if (r.dikonversi_pada) c.appendChild(el("div", "font-size:11.5px;color:#6ee7b7", "✅ Berlangganan " + Math.max(0, Math.round((new Date(r.dikonversi_pada) - new Date(r.mulai)) / 864e5)) + " hari setelah mencoba"));
    var act = el("div", "display:flex;gap:6px;flex-wrap:wrap;margin-top:2px");
    var b = el("button", btnCss("transparent", "#e6f1ff", "#ffffff30"), "Riwayat lengkap"); b.onclick = function () { fokusEmail(r.email); }; act.appendChild(b);
    var wa = (r.status === "habis" || r.status === "berlangganan_berakhir") ? waLink(r) : null; if (wa) act.appendChild(wa);
    c.appendChild(act); return c;
  }
  function renderGratis(body) {
    var all = gr.filter(function (r) { return inP(r.mulai); }), n = all.length, now = Date.now();
    var jlh = function (f) { return all.filter(f).length; };
    var ber = jlh(function (r) { return r.status === "berlangganan" || r.status === "berlangganan_berakhir"; }), run = jlh(function (r) { return r.status === "berjalan"; });
    var hot = jlh(function (r) { return r.status === "habis" && now - new Date(r.mulai) <= 14 * 864e5; }), sus = jlh(function (r) { return r.ditolak > 0 || r.klaim_se_perangkat > 0; });
    var k = el("div", "display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px");
    function kp(a, l, w) { var d = el("div", "border:1px solid " + w + "55;border-radius:10px;padding:8px 10px;background:" + w + "12"); d.append(el("div", "font-size:20px;font-weight:800;color:" + w, String(a)), el("div", "font-size:11px;color:#94a3b8", l)); return d; }
    k.append(kp(n, "pernah mencoba gratis", "#22d3ee"), kp(run, "sedang berjalan", "#34d399"), kp(ber, "jadi berlangganan" + (n ? " (" + Math.round(ber * 100 / n) + "%)" : ""), "#a78bfa"), kp(hot, "calon pelanggan hangat", hot ? "#fbbf24" : "#64748b"), kp(sus, "perlu dicek", sus ? "#fb923c" : "#64748b"));
    body.appendChild(k);
    body.appendChild(el("div", "font-size:12px;color:#cbd5e1", n ? "Riwayat uji coba tetap tersimpan walau akun gratis sudah dikunci atau dihapus. " + (hot ? hot + " orang baru selesai mencoba dan belum berlangganan — tombol WhatsApp muncul bila mereka mengisi nomor HP." : "") : "Belum ada yang memakai uji coba gratis pada periode ini."));
    if (n) body.appendChild(card("Corong konversi", bars([["Mencoba gratis", n], ["Berlangganan setelah mencoba", ber], ["Habis, belum berlangganan", jlh(function (r) { return r.status === "habis"; })]], n, "#34d399", 4)));
    var bar = el("div", "display:flex;gap:8px;flex-wrap:wrap;align-items:center");
    var sel = el("select", "background:#0b1120;color:#e6f1ff;border:1px solid #ffffff30;border-radius:8px;padding:6px 8px;font:12px system-ui");
    [["semua", "Semua status"]].concat(Object.keys(ST).map(function (x) { return [x, ST[x][0]]; })).forEach(function (o) { var op = el("option", "", o[1]); op.value = o[0]; if (stG === o[0]) op.selected = true; sel.appendChild(op); });
    sel.onchange = function () { stG = sel.value; render(); };
    bar.append(sel, kotakCari("Cari email, nama, instansi, HP, kota…", "gratis")); body.appendChild(bar);
    var list = grFiltered();
    if (!list.length) { body.appendChild(el("div", "color:#94a3b8", "Tidak ada data yang cocok.")); return; }
    list.slice(0, 200).forEach(function (r) { body.appendChild(gratisRow(r)); });
  }
  function renderRiwayatTab(body) {
    if (loadingR && !loadedR) { body.appendChild(el("div", "color:#94a3b8", "Memuat riwayat…")); return; }
    if (errR) { body.appendChild(el("div", "padding:10px 12px;border:1px solid #fbbf2455;border-radius:10px;background:#2a2008;color:#fde68a", pesanR(errR))); return; }
    if (tab === "gratis") renderGratis(body); else renderRiwayat(body);
  }

  function unduh(nama, kol, data) {
    var esc = function (v) { v = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };   // cegah injeksi rumus Excel
    var csv = "\ufeff" + kol.join(",") + "\n" + data.map(function (r) { return kol.map(function (k) { return esc(r[k]); }).join(","); }).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = nama + "-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function eksporCsv() {
    if (tab === "riwayat") {
      var l = evFiltered(); if (!l.length) { T("Belum ada riwayat untuk diekspor", true); return; }
      unduh("riwayat-pengguna", ["waktu", "kejadian", "email", "nama", "peran", "keterangan", "oleh"], l.map(function (e) { return { waktu: e.at, kejadian: EVT[e.jenis][1], email: e.email, nama: e.nama, peran: ROLE_LBL[e.role] || e.role, keterangan: deskripsi(e), oleh: e.oleh_email }; }));
      return;
    }
    if (tab === "gratis") {
      var g = grFiltered(); if (!g.length) { T("Belum ada data uji coba untuk diekspor", true); return; }
      unduh("pengguna-gratis", ["email", "nama", "instansi", "hp", "mulai", "status", "peran", "ditolak", "klaim_se_perangkat", "jenis", "os", "browser", "model", "kota", "provinsi", "negara", "dikonversi_pada"],
        g.map(function (r) { return Object.assign({}, r, { status: (ST[r.status] || [r.status])[0], peran: ROLE_LBL[r.role] || r.role }); }));
      return;
    }
    if (!rows.length) { T("Belum ada data untuk diekspor", true); return; }
    unduh("sebaran-pengguna", ["email", "nama", "instansi", "role", "jenis", "os", "browser", "model", "negara", "provinsi", "kota", "lat", "lng", "pwa", "jaringan", "pertama", "terakhir", "jml_akses"], rows);
  }

  /* ---- tombol: dibuat HANYA untuk admin, dihapus total saat bukan admin / logout ---- */
  function addButton() {
    if (btn || !isAdmin()) return;
    btn = document.createElement("button");
    btn.id = "pqSebaranBtn"; btn.innerHTML = '<i class="fa-solid fa-earth-asia"></i>'; btn.title = "Sebaran lokasi & perangkat pengguna (admin)"; btn.onclick = buka;
    if (typeof PQ_DOCK !== "undefined" && PQ_DOCK.adopt) PQ_DOCK.adopt(btn, "Sebaran pengguna");
    else { btn.style.cssText = "position:fixed;left:10px;bottom:220px;z-index:3900;width:42px;height:42px;border-radius:12px;border:1px solid #22d3ee66;background:#0e7490;color:#fff;cursor:pointer"; document.body.appendChild(btn); }
    if (!poll) poll = setInterval(function () { if (isAdmin() && panel && panel.style.display === "flex" && document.visibilityState === "visible") { muat(false); muatRiwayat(false); } }, 6e4);
  }
  function bersihkan() {   // bukan admin lagi / logout: musnahkan UI & data dari memori
    if (poll) { clearInterval(poll); poll = 0; }
    try { if (map) { map.remove(); map = null; } } catch (e) { /* abaikan */ }
    if (panel) { panel.remove(); panel = null; }
    if (btn) { var w = btn.closest && (btn.closest("[data-pq-dock-item]") || null); (w || btn).remove(); btn = null; }
    rows = []; err = null; ev = []; gr = []; errR = null; loadedR = false; qR = ""; qG = ""; filR = "semua"; stG = "semua";
  }
  function sinkron() { if (isAdmin()) addButton(); else bersihkan(); }
  window.addEventListener("pq-admin", sinkron);
  window.addEventListener("pq-login", function () { setTimeout(sinkron, 1800); });
  window.addEventListener("storage", function (e) { if (e.key === SK && !e.newValue) { window.__pqIsAdmin = false; sinkron(); } });

  function boot() { mulaiPencatat(); setTimeout(sinkron, 2500); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
