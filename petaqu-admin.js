/* PETAQU — Panel persetujuan akses (hanya tampil untuk peran 'admin').
   Akun baru berstatus 'pending' dan TIDAK punya akses sampai admin menyetujui di sini.
   Semua keputusan dijalankan server (RPC admin_* di supabase-akses-admin.sql + supabase-pendaftaran.sql);
   tombol ini hanya antarmuka. Baru: data pendaftar & skor kepercayaan, setujui banyak, tolak & hapus,
   pencarian, notifikasi pendaftar baru, dan "Cek koneksi" yang menunjukkan persis bagian mana yang belum terhubung. */
(function () {
  "use strict";
  if (window.__pqAdmin) return;
  window.__pqAdmin = 1;

  var SK = "pq_cloud_session", btn = null, labelEl = null, panel = null, poll = 0, adminOk = false, tab = "tunggu", rows = [], lastErr = null, q = "", prevTunggu = -1, diag = null;
  var $ = function (id) { return document.getElementById(id); };
  function sess() { try { return JSON.parse(localStorage.getItem(SK)); } catch (e) { return null; } }
  function cfg() { return window.PETAQU_CFG; }
  function T(m, e) { try { toast(m, !!e); } catch (x) { /* abaikan */ } }

  async function api(path, opt) {
    var c = cfg(), s = sess();
    if (!c || !s || !s.access_token) throw { code: "nosess" };
    var r = await fetch(c.url + path, Object.assign({
      headers: { apikey: c.anon, Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" }
    }, opt || {}));
    if (r.ok) return r.status === 204 ? null : r.json();
    var body = {}; try { body = await r.json(); } catch (e) { /* kosong */ }
    var msg = String(body.message || body.msg || body.hint || body.error_description || ""), pg = String(body.code || "");
    if (r.status === 404 || pg === "PGRST202") throw { code: "nosql", msg: msg };
    if (r.status === 401 || r.status === 403 || pg === "42501") throw { code: "denied", status: r.status, msg: msg };
    throw { code: "http", status: r.status, msg: msg, pg: pg };
  }
  var rpc = function (fn, body) { return api("/rest/v1/rpc/" + fn, { method: "POST", body: JSON.stringify(body || {}) }); };

  function rel(iso) {
    if (!iso) return "belum pernah";
    var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
    if (m < 1) return "baru saja";
    if (m < 60) return m + " mnt lalu";
    if (m < 1440) return Math.round(m / 60) + " jam lalu";
    return Math.round(m / 1440) + " hari lalu";
  }
  var STATUS = {
    pending: ["Menunggu izin", "#fbbf24"], trial: ["Uji coba selesai", "#fb923c"], blocked: ["Diblokir", "#f87171"],
    viewer: ["Aktif (lihat)", "#34d399"], surveyor: ["Aktif (surveyor)", "#34d399"], admin: ["Admin", "#22d3ee"]
  };
  var SARAN = { setujui: ["Disarankan setujui", "#34d399"], tinjau: ["Perlu ditinjau", "#fbbf24"], waspada: ["Data kurang / waspada", "#fb923c"], tolak: ["Email sekali pakai", "#f87171"] };
  function el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
  function btnCss(bg, fg, bd) { return "background:" + bg + ";color:" + fg + ";border:1px solid " + (bd || "transparent") + ";border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer;font-size:12px"; }

  /* ---------- tombol di dock + lencana jumlah menunggu ---------- */
  function setBadge(n) {
    if (labelEl) labelEl.textContent = n > 0 ? "Persetujuan akses (" + n + ")" : "Persetujuan akses";
    if (btn) btn.style.background = n > 0 ? "#b45309" : "#0e7490";
    try { document.title = document.title.replace(/^\(\d+\)\s*/, ""); if (n > 0) document.title = "(" + n + ") " + document.title; } catch (e) { /* abaikan */ }
  }
  function notif(n) {   // pendaftar baru masuk -> toast + notifikasi sistem bila diizinkan
    T(n + " pendaftar baru menunggu persetujuan");
    try { if ("Notification" in window && Notification.permission === "granted") new Notification("PETAQU", { body: n + " pendaftar baru menunggu persetujuan", icon: "icon-192.png" }); } catch (e) { /* abaikan */ }
  }
  function addButton() {
    if (btn || typeof PQ_DOCK === "undefined") return;
    btn = document.createElement("button");
    btn.innerHTML = '<i class="fa-solid fa-user-check"></i>';
    btn.title = "Setujui / blokir akun pengguna";
    btn.onclick = openPanel;
    PQ_DOCK.adopt(btn, "Persetujuan akses");
    labelEl = btn.querySelectorAll("span")[1] || null;
  }

  /* ---------- panel ---------- */
  function build() {
    if (panel) return;
    panel = el("div", "position:fixed;inset:0;z-index:5200;display:none;align-items:center;justify-content:center;background:#000a;padding:12px");
    panel.id = "pqAdminPanel";
    var box = el("div", "width:min(760px,100%);max-height:90vh;display:flex;flex-direction:column;background:#0f1521;border:1px solid #22d3ee55;border-radius:14px;color:#e6f1ff;font:13px/1.45 system-ui,sans-serif;box-shadow:0 12px 40px #000c");
    var head = el("div", "display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #ffffff18");
    head.appendChild(el("b", "flex:1;font-size:15px", "Persetujuan akses pengguna"));
    var dg = el("button", btnCss("transparent", "#e6f1ff", "#ffffff30"), "Cek koneksi");
    dg.onclick = jalankanDiag;
    var rf = el("button", btnCss("transparent", "#e6f1ff", "#ffffff30"), "Segarkan");
    rf.onclick = function () { refresh(true); };
    var cl = el("button", "background:transparent;border:0;color:#e6f1ff;font-size:20px;cursor:pointer;padding:0 6px", "×");
    cl.onclick = function () { panel.style.display = "none"; };
    head.append(dg, rf, cl);
    var tabs = el("div", "display:flex;gap:6px;padding:10px 14px 0;flex-wrap:wrap;align-items:center");
    tabs.id = "pqAdminTabs";
    var tools = el("div", "display:flex;gap:8px;padding:10px 14px 0;flex-wrap:wrap;align-items:center");
    tools.id = "pqAdminTools";
    var list = el("div", "padding:10px 14px 14px;overflow:auto;display:flex;flex-direction:column;gap:8px");
    list.id = "pqAdminList";
    var note = el("div", "padding:8px 14px 12px;font-size:11px;color:#94a3b8;border-top:1px solid #ffffff12",
      "Akun baru otomatis berstatus “Menunggu izin” dan tidak bisa membuka aplikasi sampai kamu menyetujuinya. Skor kepercayaan hanya saran — keputusan tetap di tanganmu. Memblokir mengeluarkan akun dari semua perangkat.");
    box.append(head, tabs, tools, list, note);
    panel.appendChild(box);
    panel.addEventListener("click", function (e) { if (e.target === panel) panel.style.display = "none"; });
    document.body.appendChild(panel);
  }
  function group(r) { return r.role === "pending" || r.role === "trial" ? "tunggu" : r.role === "blocked" ? "blok" : "aktif"; }
  function cocok(r) {
    if (!q) return true;
    var s = [r.email, r.nama, r.instansi, r.hp].join(" ").toLowerCase();
    return q.split(/\s+/).every(function (k) { return s.indexOf(k) >= 0; });
  }
  function render() {
    build();
    var cnt = { tunggu: 0, aktif: 0, blok: 0 };
    rows.forEach(function (r) { cnt[group(r)]++; });
    setBadge(cnt.tunggu);
    if (prevTunggu >= 0 && cnt.tunggu > prevTunggu) notif(cnt.tunggu - prevTunggu);
    prevTunggu = cnt.tunggu;

    var tabs = $("pqAdminTabs"); tabs.textContent = "";
    [["tunggu", "Menunggu"], ["aktif", "Aktif"], ["blok", "Diblokir"]].forEach(function (t) {
      var b = el("button", "border-radius:16px;padding:5px 12px;cursor:pointer;font:600 12px system-ui;border:1px solid " + (tab === t[0] ? "#22d3ee" : "#ffffff30") +
        ";background:" + (tab === t[0] ? "#22d3ee" : "transparent") + ";color:" + (tab === t[0] ? "#04121a" : "#e6f1ff"), t[1] + " (" + cnt[t[0]] + ")");
      b.onclick = function () { tab = t[0]; render(); };
      tabs.appendChild(b);
    });

    var tools = $("pqAdminTools"); tools.textContent = "";
    var si = el("input", "flex:1 1 180px;min-width:0;background:#0b1120;color:#e6f1ff;border:1px solid #ffffff30;border-radius:8px;padding:7px 10px;font:12px system-ui");
    si.placeholder = "Cari nama, instansi, email, WhatsApp…"; si.value = q;
    si.oninput = function () { q = si.value.trim().toLowerCase(); var pos = si.selectionStart; renderList(); si.focus(); try { si.setSelectionRange(pos, pos); } catch (e) { /* abaikan */ } };
    tools.appendChild(si);
    var saran = rows.filter(function (r) { return group(r) === "tunggu" && r.saran === "setujui" && r.role !== "blocked"; });
    if (tab === "tunggu" && saran.length) {
      var bk = el("button", btnCss("#16a34a", "#fff"), "Setujui " + saran.length + " yang disarankan");
      bk.onclick = function () {
        if (!confirm("Setujui " + saran.length + " akun dengan skor tinggi sebagai “Lihat saja”?\n\n" + saran.map(function (r) { return "• " + (r.nama || r.email); }).join("\n"))) return;
        act(bk, "admin_setujui_banyak", { p_ids: saran.map(function (r) { return r.id; }), p_role: "viewer" }, saran.length + " akun disetujui");
      };
      tools.appendChild(bk);
    }
    renderList();
  }
  function renderList() {
    var list = $("pqAdminList"); list.textContent = "";
    if (diag) { list.appendChild(diag); return; }
    if (lastErr && !rows.length) { list.appendChild(errCard(lastErr)); return; }
    var sh = rows.filter(function (r) { return group(r) === tab && cocok(r); });
    if (!sh.length) list.appendChild(el("div", "color:#94a3b8;padding:18px 4px;text-align:center", q ? "Tidak ada yang cocok dengan pencarian." : tab === "tunggu" ? "Tidak ada akun yang menunggu persetujuan." : "Tidak ada data."));
    sh.forEach(function (r) { list.appendChild(card(r)); });
  }
  function errCard(e) {
    var c = el("div", "padding:14px;border:1px solid #f8717166;border-radius:10px;background:#2a0f14;line-height:1.55");
    var judul = e.code === "nosql" ? "Fungsi admin belum ada di Supabase" : e.code === "denied" ? "Akun ini tidak diizinkan melihat daftar pengguna" : e.code === "nosess" ? "Sesi login tidak ditemukan" : "Server menolak permintaan" + (e.status ? " (" + e.status + ")" : "");
    var solusi = e.code === "nosql" ? "Jalankan supabase-akses-admin.sql lalu supabase-pendaftaran.sql di Supabase > SQL Editor." :
      e.code === "denied" ? "Pastikan peran akun ini 'admin' di tabel profiles." :
      e.code === "nosess" ? "Keluar lalu masuk lagi." :
      "Kemungkinan fungsi admin_daftar_pengguna belum diperbarui. Jalankan supabase-pendaftaran.sql, lalu tekan Segarkan.";
    c.appendChild(el("b", "color:#fca5a5", judul));
    c.appendChild(el("div", "color:#fecaca;margin-top:4px", solusi));
    if (e.msg) c.appendChild(el("div", "margin-top:6px;font:11px ui-monospace,monospace;color:#fda4af;overflow-wrap:anywhere", "Detail: " + e.msg));
    var b = el("button", btnCss("transparent", "#e6f1ff", "#ffffff40") + ";margin-top:10px", "Cek koneksi lengkap");
    b.onclick = jalankanDiag; c.appendChild(b);
    return c;
  }
  function card(r) {
    var st = STATUS[r.role] || [r.role, "#94a3b8"];
    var c = el("div", "display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border:1px solid #ffffff18;border-radius:10px;background:#0b1120");
    var info = el("div", "flex:1 1 240px;min-width:0");
    var judul = r.nama ? r.nama : (r.email || r.id);
    info.appendChild(el("div", "font-weight:700;overflow-wrap:anywhere", judul));
    if (r.nama && r.email) info.appendChild(el("div", "font-size:12px;color:#cbd5e1;overflow-wrap:anywhere", r.email + (r.email_terkonfirmasi === false ? " (email belum dikonfirmasi)" : "")));
    var sub = [r.instansi, r.hp ? "+" + r.hp : ""].filter(Boolean).join(" · ");
    if (sub) info.appendChild(el("div", "font-size:12px;color:#cbd5e1;overflow-wrap:anywhere", sub));
    if (r.tujuan) info.appendChild(el("div", "margin-top:3px;font-size:11.5px;color:#94a3b8;font-style:italic;overflow-wrap:anywhere", "“" + r.tujuan + "”"));
    var chip = el("span", "display:inline-block;margin-right:8px;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;border:1px solid " + st[1] + ";color:" + st[1], st[0]);
    var meta = el("div", "margin-top:4px;font-size:11px;color:#94a3b8");
    meta.appendChild(chip);
    if (group(r) === "tunggu" && r.saran && SARAN[r.saran]) {
      var sg = SARAN[r.saran];
      meta.appendChild(el("span", "display:inline-block;margin-right:8px;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;background:" + sg[1] + "22;color:" + sg[1], sg[0] + " · skor " + (r.skor || 0)));
    }
    meta.appendChild(document.createTextNode("daftar " + rel(r.created_at) + " · masuk terakhir " + rel(r.last_sign_in_at) + (r.provider ? " · " + r.provider : "") + (r.trial_dipakai ? " · sudah pakai uji coba" : "")));
    info.appendChild(meta);
    c.appendChild(info);
    if (r.role === "admin") return c;
    var aks = el("div", "display:flex;flex-wrap:wrap;gap:6px;align-items:center");
    var sel = el("select", "background:#0f1521;color:#e6f1ff;border:1px solid #ffffff30;border-radius:8px;padding:6px");
    [["viewer", "Lihat saja"], ["surveyor", "Surveyor (boleh ubah data)"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1];
      if (o[0] === r.role) op.selected = true; sel.appendChild(op);
    });
    var ok = el("button", btnCss("#16a34a", "#fff"), r.role === "viewer" || r.role === "surveyor" ? "Simpan peran" : "Setujui");
    ok.onclick = function () { act(ok, "admin_setujui", { p_id: r.id, p_role: sel.value }, "Akses disetujui: " + (r.nama || r.email)); };
    aks.append(sel, ok);
    var wa = r.hp ? "https://wa.me/" + r.hp + "?text=" + encodeURIComponent("Halo " + (r.nama || "") + ", ini admin PETAQU terkait pendaftaran akun Anda.") : "";
    if (wa && group(r) === "tunggu") { var a = el("a", btnCss("transparent", "#4ade80", "#4ade80") + ";text-decoration:none", "WhatsApp"); a.href = wa; a.target = "_blank"; a.rel = "noopener"; aks.appendChild(a); }
    if (r.role !== "blocked") {
      var bl = el("button", btnCss("transparent", "#f87171", "#f87171"), "Blokir");
      bl.onclick = function () { if (confirm("Blokir " + (r.email || "akun ini") + "? Akun akan keluar dari semua perangkat.")) act(bl, "admin_blokir", { p_id: r.id }, "Akun diblokir: " + r.email); };
      aks.appendChild(bl);
    }
    if (group(r) !== "aktif") {
      var hp = el("button", btnCss("transparent", "#fca5a5", "#7f1d1d"), "Tolak & hapus");
      hp.title = "Hapus pendaftar ini sepenuhnya (bisa mendaftar ulang)";
      hp.onclick = function () { if (confirm("Tolak & hapus " + (r.email || "akun ini") + "? Akun dihapus permanen; pemilik bisa mendaftar ulang.")) act(hp, "admin_hapus_pendaftar", { p_id: r.id }, "Pendaftar dihapus: " + r.email); };
      aks.appendChild(hp);
    }
    c.appendChild(aks);
    return c;
  }
  async function act(b, fn, body, okMsg) {
    b.disabled = true; b.style.opacity = ".6";
    try {
      var d = await rpc(fn, body);
      if (d && d.ok) { T(okMsg); await refresh(); }
      else { T("Ditolak server: " + ((d && d.reason) || "tidak diketahui"), true); b.disabled = false; b.style.opacity = ""; }
    } catch (e) { fail(e); b.disabled = false; b.style.opacity = ""; }
  }
  function fail(e) {
    T(e && e.code === "nosql" ? "Jalankan supabase-pendaftaran.sql di Supabase dulu"
      : e && e.code === "denied" ? "Hanya admin yang boleh melakukan ini"
      : navigator.onLine === false ? "Tidak ada koneksi internet" : "Gagal menghubungi server" + (e && e.status ? " (" + e.status + ")" : ""), true);
  }
  async function refresh(manual) {
    try { rows = await rpc("admin_daftar_pengguna"); lastErr = null; diag = null; render(); if (manual) T("Daftar diperbarui"); }
    catch (e) { lastErr = e; if (panel && panel.style.display === "flex") render(); if (manual || (e && e.code !== "http")) fail(e); }
  }

  /* ---------- diagnosa: tunjukkan bagian mana yang belum terhubung ---------- */
  async function jalankanDiag() {
    build(); panel.style.display = "flex";
    var box = el("div", "display:flex;flex-direction:column;gap:6px");
    box.appendChild(el("div", "font-weight:700", "Pemeriksaan koneksi…"));
    diag = box; renderList();
    var out = [], c = cfg(), s = sess();
    function add(ok, judul, ket) { out.push([ok, judul, ket]); }
    add(!!c, "Konfigurasi Supabase di aplikasi", c ? c.url : "petaqu-auth.js belum berisi URL & anon key");
    if (c) {
      try {
        var r = await fetch(c.url + "/auth/v1/settings", { headers: { apikey: c.anon } });
        if (r.ok) {
          var j = await r.json();
          add(true, "Server Supabase terjangkau", "Auth merespons normal");
          add(!j.disable_signup && (!j.external || j.external.email !== false), "Pendaftaran email dibuka", j.disable_signup ? "‘Allow new users to sign up’ masih mati di Authentication > Sign In / Providers" : "Pendaftar baru bisa membuat akun");
          add(!j.mailer_autoconfirm, "Konfirmasi email aktif (disarankan)", j.mailer_autoconfirm ? "Mati: siapa pun bisa daftar dengan email palsu. Aktifkan ‘Confirm email’ di Providers > Email" : "Pendaftar harus membuktikan email miliknya");
          add(!!(j.external && j.external.google), "Login Google aktif", j.external && j.external.google ? "OK" : "Provider Google belum diaktifkan");
        } else add(false, "Server Supabase terjangkau", "Status " + r.status + " — cek URL & anon key");
      } catch (e) { add(false, "Server Supabase terjangkau", navigator.onLine === false ? "Tidak ada internet" : "Gagal dihubungi"); }
    }
    add(!!(s && s.access_token), "Sesi login admin", s && s.email ? s.email : "Tidak ada sesi — keluar lalu masuk lagi");
    if (s && s.access_token) {
      try {
        var p = await api("/rest/v1/profiles?select=role,skor,nama&id=eq." + encodeURIComponent(s.uid));
        add(!!(p && p[0] && p[0].role === "admin"), "Peran akun ini = admin", p && p[0] ? "Peran: " + p[0].role : "Profil tidak ditemukan di tabel profiles");
        add(!!(p && p[0] && "skor" in p[0]), "Kolom pendaftaran (supabase-pendaftaran.sql)", p && p[0] && "skor" in p[0] ? "Terpasang" : "Belum — jalankan supabase-pendaftaran.sql");
      } catch (e) { add(false, "Membaca tabel profiles", (e.msg || e.code || "gagal") + (e.status ? " (" + e.status + ")" : "")); }
      try {
        var d = await rpc("admin_daftar_pengguna");
        add(true, "Fungsi admin_daftar_pengguna", d.length + " pengguna terbaca" + (d.length && !("skor" in d[0]) ? " (versi lama — jalankan supabase-pendaftaran.sql)" : ""));
      } catch (e) { add(false, "Fungsi admin_daftar_pengguna", e.code === "nosql" ? "Belum ada — jalankan supabase-akses-admin.sql lalu supabase-pendaftaran.sql" : (e.msg || e.code || "gagal") + (e.status ? " (" + e.status + ")" : "")); }
      try { await rpc("admin_daftar_domain"); add(true, "Fungsi domain resmi & setujui banyak", "Terpasang"); }
      catch (e) { add(false, "Fungsi domain resmi & setujui banyak", "Belum ada — jalankan supabase-pendaftaran.sql"); }
    }
    box.textContent = "";
    var semua = out.every(function (x) { return x[0]; });
    box.appendChild(el("div", "font-weight:700;color:" + (semua ? "#34d399" : "#fbbf24"), semua ? "Semua terhubung dengan baik" : "Ada bagian yang perlu diperbaiki"));
    out.forEach(function (x) {
      var row = el("div", "display:flex;gap:9px;align-items:flex-start;padding:8px 10px;border-radius:9px;border:1px solid " + (x[0] ? "#34d39944" : "#f8717155") + ";background:#ffffff06");
      row.appendChild(el("span", "flex:none;font-weight:800;color:" + (x[0] ? "#34d399" : "#f87171"), x[0] ? "✓" : "✗"));
      var t = el("div", "min-width:0"); t.appendChild(el("div", "font-weight:600", x[1])); t.appendChild(el("div", "font-size:11.5px;color:#94a3b8;overflow-wrap:anywhere", x[2]));
      row.appendChild(t); box.appendChild(row);
    });
    var tut = el("button", btnCss("transparent", "#e6f1ff", "#ffffff40") + ";align-self:flex-start;margin-top:4px", "Tutup hasil");
    tut.onclick = function () { diag = null; render(); }; box.appendChild(tut);
  }

  function openPanel() {
    build(); panel.style.display = "flex"; diag = null; render(); refresh();
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (e) { /* abaikan */ }
  }

  /* ---------- aktif hanya bila yang login adalah admin ---------- */
  /* penanda admin untuk modul lain (mis. kartu kapasitas GitHub hanya tampil bagi admin) */
  function setFlag(v) { if (!!window.__pqIsAdmin === v) return; window.__pqIsAdmin = v; try { window.dispatchEvent(new Event("pq-admin")); } catch (e) { /* abaikan */ } }
  async function cekAdmin() {
    var s = sess();
    if (!s || !s.uid || localStorage.getItem("peta_auth_ok") !== "1") { adminOk = false; setFlag(false); return; }
    if (adminOk) return;
    try {
      var r = await api("/rest/v1/profiles?select=role&id=eq." + encodeURIComponent(s.uid));
      if (r && r[0] && r[0].role === "admin") {
        adminOk = true; setFlag(true); addButton(); refresh();
        if (!poll) poll = setInterval(function () { if (adminOk && document.visibilityState === "visible") refresh(); }, 6e4);   // lencana + notifikasi pendaftar baru tiap menit
      }
    } catch (e) { /* bukan admin / offline: tidak ada tombol */ }
  }
  window.addEventListener("pq-login", function () { setTimeout(cekAdmin, 300); });
  function boot() { setTimeout(cekAdmin, 1200); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
