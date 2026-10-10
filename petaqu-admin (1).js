/* PETAQU — Panel persetujuan akses (hanya tampil untuk peran 'admin').
   Akun baru berstatus 'pending' dan TIDAK punya akses sampai admin menyetujui di sini.
   Semua keputusan dijalankan server (RPC admin_* di supabase-akses-admin.sql + supabase-pendaftaran.sql);
   tombol ini hanya antarmuka. Baru: data pendaftar & skor kepercayaan, setujui banyak, tolak & hapus,
   pencarian, notifikasi pendaftar baru, dan "Cek koneksi" yang menunjukkan persis bagian mana yang belum terhubung. */
(function () {
  "use strict";
  if (window.__pqAdmin) return;
  window.__pqAdmin = 1;

  var SK = "pq_cloud_session", btn = null, labelEl = null, panel = null, poll = 0, adminOk = false, tab = "tunggu", rows = [], lastErr = null, q = "", prevTunggu = -1, diag = null, notice = null, lgOk = true, edOpen = {}, cek = {}, selTab = "", sortKey = "tgl", sortDir = -1, vis = [], cbs = {};
  var SORT_AWAL = { abjad: 1, tgl: -1, paket: 1 };
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
    var box = el("div", "width:min(760px,100%);max-height:90vh;max-height:90dvh;display:flex;flex-direction:column;overflow:hidden;background:#0f1521;border:1px solid #22d3ee55;border-radius:14px;color:#e6f1ff;font:13px/1.45 system-ui,sans-serif;box-shadow:0 12px 40px #000c");
    var head = el("div", "flex:none;display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #ffffff18");
    head.appendChild(el("b", "flex:1;font-size:15px", "Persetujuan akses pengguna"));
    var dg = el("button", btnCss("transparent", "#e6f1ff", "#ffffff30"), "Cek koneksi");
    dg.onclick = jalankanDiag;
    var rf = el("button", btnCss("transparent", "#e6f1ff", "#ffffff30"), "Segarkan");
    rf.onclick = function () { refresh(true); };
    var cl = el("button", "background:transparent;border:0;color:#e6f1ff;font-size:20px;cursor:pointer;padding:0 6px", "×");
    cl.onclick = function () { panel.style.display = "none"; };
    head.append(dg, rf, cl);
    var tabs = el("div", "flex:none;display:flex;gap:6px;padding:10px 14px 0;flex-wrap:wrap;align-items:center");
    tabs.id = "pqAdminTabs";
    var tools = el("div", "flex:none;display:flex;gap:8px;padding:10px 14px 0;flex-wrap:wrap;align-items:center");
    tools.id = "pqAdminTools";
    var bar = el("div", "flex:none;display:none;gap:8px 10px;padding:9px 14px;margin-top:10px;flex-wrap:wrap;align-items:center;border-top:1px solid #ffffff14;border-bottom:1px solid #ffffff18;background:#0b1120");
    bar.id = "pqAdminBar";
    var list = el("div", "flex:1 1 auto;min-height:0;padding:10px 14px 14px;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:8px");
    list.id = "pqAdminList";
    var note = el("div", "flex:none;padding:8px 14px 12px;font-size:11px;color:#94a3b8;border-top:1px solid #ffffff12",
      "Akun baru otomatis berstatus “Menunggu izin” dan tidak bisa membuka aplikasi sampai kamu menyetujuinya. Skor kepercayaan hanya saran — keputusan tetap di tanganmu. Memblokir mengeluarkan akun dari semua perangkat.");
    box.append(head, tabs, tools, bar, list, note);
    panel.appendChild(box);
    panel.addEventListener("click", function (e) { if (e.target === panel) panel.style.display = "none"; });
    document.body.appendChild(panel);
  }
  /* ---------- pemberitahuan "akun disetujui" ke pendaftar ---------- */
  function pesanSetuju(r) {
    return "Halo " + (r.nama || "") + ", kabar baik! Akun PETAQU Anda (" + (r.email || "") + ") sudah DISETUJUI admin. " +
      "Silakan buka " + location.origin + " lalu masuk dengan email & password yang Anda daftarkan. Terima kasih.";
  }
  function waSetuju(r) { return r.hp ? "https://wa.me/" + r.hp + "?text=" + encodeURIComponent(pesanSetuju(r)) : ""; }
  function salin(txt, b) {
    var ok = function () { var t = b.textContent; b.textContent = "Tersalin ✓"; setTimeout(function () { b.textContent = t; }, 1600); };
    try { navigator.clipboard.writeText(txt).then(ok, function () { T("Gagal menyalin", true); }); } catch (e) { T("Gagal menyalin", true); }
  }
  function noticeBox() {
    var c = el("div", "padding:10px 12px;border:1px solid #34d39966;border-radius:10px;background:#052e1c;line-height:1.5");
    var jml = notice.rows.length;
    var h = el("div", "display:flex;align-items:center;gap:8px");
    h.appendChild(el("b", "flex:1;color:#6ee7b7", "✓ " + (jml === 1 ? "Akses disetujui" : jml + " akun disetujui") + " — beri tahu pendaftar:"));
    var x = el("button", "background:transparent;border:0;color:#a7f3d0;font-size:18px;cursor:pointer;padding:0 4px", "×");
    x.onclick = function () { notice = null; renderList(); }; h.appendChild(x); c.appendChild(h);
    notice.rows.forEach(function (r) {
      var row = el("div", "display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px");
      row.appendChild(el("span", "flex:1 1 180px;min-width:0;overflow-wrap:anywhere", r.nama || r.email));
      var w = waSetuju(r);
      if (w) { var a = el("a", btnCss("#16a34a", "#fff") + ";text-decoration:none", "Kabari via WhatsApp"); a.href = w; a.target = "_blank"; a.rel = "noopener"; row.appendChild(a); }
      var cp = el("button", btnCss("transparent", "#e6f1ff", "#ffffff40"), "Salin pesan"); cp.onclick = function () { salin(pesanSetuju(r), cp); }; row.appendChild(cp);
      if (!w) row.appendChild(el("span", "font-size:11px;color:#94a3b8", "(tanpa nomor WhatsApp)"));
      c.appendChild(row);
    });
    return c;
  }

  /* ---------- langganan: masa aktif & jatuh tempo ---------- */
  var BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  function hariIni() { return new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10); }   // tanggal WIB
  function selisih(t) { return t ? Math.round((Date.parse(String(t).slice(0, 10)) - Date.parse(hariIni())) / 864e5) : null; }   // hari dari hari ini (negatif = sudah lewat)
  function fmtTgl(t) { if (!t) return "—"; var p = String(t).slice(0, 10).split("-"); return +p[2] + " " + BLN[+p[1] - 1] + " " + p[0]; }
  function rupiah(n) { return n == null ? "—" : "Rp " + Number(n).toLocaleString("id-ID"); }
  function pelanggan(r) { return r.role === "viewer" || r.role === "surveyor"; }
  function berakhir(r) { return pelanggan(r) && !!r.aktif_sampai && selisih(r.aktif_sampai) < 0; }
  function segera(r) { var d = selisih(r.aktif_sampai); return pelanggan(r) && d != null && d >= 0 && d <= 7; }
  function telatBayar(r) { var d = selisih(r.jatuh_tempo); return pelanggan(r) && !berakhir(r) && d != null && d < 0; }
  function chipLg(txt, warna) { return el("span", "display:inline-block;margin:4px 6px 0 0;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;border:1px solid " + warna + "88;color:" + warna, txt); }
  function infoLangganan(r) {
    var w = el("div", "display:flex;flex-wrap:wrap"), d = selisih(r.aktif_sampai);
    if (!r.aktif_sampai) w.appendChild(chipLg("Masa aktif: tanpa batas", "#94a3b8"));
    else if (d < 0) w.appendChild(chipLg("Berakhir " + fmtTgl(r.aktif_sampai) + " · " + (-d) + " hari lalu", "#f87171"));
    else w.appendChild(chipLg("Aktif s/d " + fmtTgl(r.aktif_sampai) + " · " + (d === 0 ? "berakhir hari ini" : d + " hari lagi"), d <= 7 ? "#fb923c" : d <= 30 ? "#fbbf24" : "#34d399"));
    if (r.jatuh_tempo) {
      var j = selisih(r.jatuh_tempo);
      w.appendChild(chipLg("Jatuh tempo bayar " + fmtTgl(r.jatuh_tempo) + (j < 0 ? " · telat " + (-j) + " hari" : j === 0 ? " · hari ini" : " · " + j + " hari lagi"), j < 0 ? "#f87171" : j <= 7 ? "#fbbf24" : "#94a3b8"));
    }
    if (r.paket || r.tarif != null) w.appendChild(chipLg([r.paket, r.tarif != null ? rupiah(r.tarif) + "/bln" : ""].filter(Boolean).join(" · "), "#94a3b8"));
    if (r.terakhir_bayar) w.appendChild(chipLg("Bayar terakhir " + fmtTgl(r.terakhir_bayar), "#94a3b8"));
    return w;
  }
  function pesanTagihan(r) {
    var d = selisih(r.aktif_sampai), j = r.jatuh_tempo ? fmtTgl(r.jatuh_tempo) : null;
    return "Halo " + (r.nama || "") + ", ini admin PETAQU. " +
      (d != null && d < 0 ? "Masa aktif akun Anda (" + (r.email || "") + ") sudah berakhir pada " + fmtTgl(r.aktif_sampai) + ". Akses ditutup sampai ada perpanjangan."
        : "Masa aktif akun Anda (" + (r.email || "") + ") " + (d === 0 ? "berakhir hari ini" : "berakhir " + fmtTgl(r.aktif_sampai) + " (" + d + " hari lagi)") + (j ? ", jatuh tempo pembayaran " + j : "") + ".") +
      " Mohon lakukan perpanjangan agar akses tidak terputus. Terima kasih.";
  }
  function ringkasan() {
    if (!rows.length) return null;
    if (!lgOk) return el("div", "padding:8px 12px;border:1px solid #fbbf2455;border-radius:10px;background:#2a2008;color:#fde68a;font-size:12px", "Fitur masa aktif & pembayaran belum aktif di database — jalankan supabase-langganan.sql di Supabase > SQL Editor, lalu tekan Segarkan.");
    var s = rows.filter(segera).length, t = rows.filter(telatBayar).length, b = rows.filter(berakhir).length;
    if (!s && !t && !b) return null;
    var w = el("div", "display:flex;flex-wrap:wrap;gap:6px;align-items:center");
    function p(txt, warna, tujuan) { var x = el("button", "border-radius:14px;padding:3px 10px;cursor:pointer;font:700 11.5px system-ui;background:" + warna + "22;color:" + warna + ";border:1px solid " + warna + "88", txt); x.onclick = function () { tab = tujuan; render(); }; w.appendChild(x); }
    if (s) p(s + " berakhir ≤ 7 hari", "#fb923c", "aktif");
    if (t) p(t + " lewat jatuh tempo bayar", "#f87171", "aktif");
    if (b) p(b + " sudah berakhir", "#f87171", "berakhir");
    return w;
  }
  function editorLangganan(r) {
    var css = "background:#0f1521;color:#e6f1ff;border:1px solid #ffffff30;border-radius:8px;padding:6px;font:12px system-ui;color-scheme:dark;min-width:0;width:100%;box-sizing:border-box";
    var p = el("div", "flex:1 1 100%;border-top:1px dashed #ffffff22;padding-top:10px;display:" + (edOpen[r.id] ? "flex" : "none") + ";flex-direction:column;gap:10px");
    function fld(lbl, inp, grow) { var f = el("label", "display:flex;flex-direction:column;gap:3px;font-size:11px;color:#94a3b8;flex:" + (grow || "1 1 130px")); f.append(lbl, inp); return f; }
    function inp(type, val, ph) { var i = el("input", css); i.type = type; if (val != null) i.value = val; if (ph) i.placeholder = ph; return i; }
    // a) perpanjang + catat pembayaran
    var jml = inp("number", "", r.tarif != null ? "otomatis " + rupiah(r.tarif) + " × bulan" : "Rp (opsional)"), met = inp("text", "", "mis. transfer BRI");
    jml.min = "0"; jml.step = "1000";
    var rowA = el("div", "display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end");
    rowA.append(fld("Jumlah dibayar", jml), fld("Metode / catatan", met));
    var qb = el("div", "display:flex;gap:6px;flex-wrap:wrap");
    [1, 3, 6, 12].forEach(function (n) {
      var b = el("button", btnCss("#0e7490", "#fff"), "+" + n + " bln");
      b.title = "Perpanjang " + n + " bulan & catat pembayaran";
      b.onclick = function () {
        var jm = jml.value === "" ? null : Math.round(+jml.value);
        if (!confirm("Perpanjang " + n + " bulan untuk " + (r.nama || r.email) + (jm != null ? " — dibayar " + rupiah(jm) : r.tarif != null ? " — " + rupiah(r.tarif * n) : "") + "?")) return;
        act(b, "admin_perpanjang", { p_id: r.id, p_bulan: n, p_jumlah: jm, p_metode: met.value.trim() || null }, "Diperpanjang " + n + " bulan: " + (r.nama || r.email));
      };
      qb.appendChild(b);
    });
    rowA.appendChild(qb);
    p.appendChild(el("div", "font-weight:700;font-size:12px", "Perpanjang & catat pembayaran"));
    p.appendChild(rowA);
    p.appendChild(el("div", "font-size:11px;color:#94a3b8;margin-top:-4px", "Sisa masa aktif tidak hangus: perpanjangan dihitung dari tanggal berakhir (atau dari hari ini bila sudah lewat). Jatuh tempo otomatis ikut tanggal berakhir baru."));
    // b) atur tanggal manual
    var ak = inp("date", r.aktif_sampai ? String(r.aktif_sampai).slice(0, 10) : ""), jt = inp("date", r.jatuh_tempo ? String(r.jatuh_tempo).slice(0, 10) : "");
    var pk = inp("text", r.paket || "", "mis. Dinas / Basic"), tf = inp("number", r.tarif != null ? r.tarif : "", "Rp / bulan"); tf.min = "0";
    var rowB = el("div", "display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end");
    rowB.append(fld("Aktif sampai (hari terakhir)", ak), fld("Jatuh tempo pembayaran", jt), fld("Paket", pk), fld("Tarif / bulan", tf));
    var sv = el("button", btnCss("#16a34a", "#fff"), "Simpan tanggal");
    sv.onclick = function () { act(sv, "admin_atur_langganan", { p_id: r.id, p_aktif_sampai: ak.value || null, p_jatuh_tempo: jt.value || null, p_paket: pk.value.trim() || null, p_tarif: tf.value === "" ? null : Math.round(+tf.value) }, "Langganan disimpan: " + (r.nama || r.email)); };
    var nb = el("button", btnCss("transparent", "#e6f1ff", "#ffffff40"), "Tanpa batas waktu");
    nb.onclick = function () { if (confirm("Jadikan " + (r.nama || r.email) + " tanpa batas waktu (tidak pernah kedaluwarsa)?")) act(nb, "admin_atur_langganan", { p_id: r.id, p_aktif_sampai: null, p_jatuh_tempo: null, p_paket: pk.value.trim() || null, p_tarif: tf.value === "" ? null : Math.round(+tf.value) }, "Diubah ke tanpa batas: " + (r.nama || r.email)); };
    var bx = el("div", "display:flex;gap:6px;flex-wrap:wrap"); bx.append(sv, nb); rowB.appendChild(bx);
    p.appendChild(el("div", "font-weight:700;font-size:12px", "Atur manual"));
    p.appendChild(rowB);
    // c) riwayat
    var hs = el("div", "display:flex;flex-direction:column;gap:3px;font-size:12px");
    var hb = el("button", btnCss("transparent", "#e6f1ff", "#ffffff40") + ";align-self:flex-start", "Riwayat pembayaran");
    hb.onclick = async function () {
      hs.textContent = "Memuat…";
      try {
        var h = await rpc("admin_riwayat_bayar", { p_id: r.id }); hs.textContent = "";
        if (!h.length) { hs.appendChild(el("div", "color:#94a3b8", "Belum ada pembayaran tercatat.")); return; }
        h.forEach(function (x) { hs.appendChild(el("div", "padding:4px 8px;border-radius:6px;background:#ffffff08", fmtTgl(x.tanggal) + " · " + rupiah(x.jumlah) + " · " + (x.bulan || "?") + " bln → s/d " + fmtTgl(x.sampai) + (x.metode ? " · " + x.metode : ""))); });
      } catch (e) { hs.textContent = ""; fail(e); }
    };
    p.append(hb, hs);
    return p;
  }

  function group(r) { return r.role === "pending" || r.role === "trial" ? "tunggu" : r.role === "blocked" ? "blok" : berakhir(r) ? "berakhir" : "aktif"; }
  function cocok(r) {
    if (!q) return true;
    var s = [r.email, r.nama, r.instansi, r.hp, r.paket].join(" ").toLowerCase();
    return q.split(/\s+/).every(function (k) { return s.indexOf(k) >= 0; });
  }
  function render() {
    build();
    var cnt = { tunggu: 0, aktif: 0, berakhir: 0, blok: 0 };
    lgOk = !rows.length || rows.some(function (r) { return "aktif_sampai" in r; });
    rows.forEach(function (r) { cnt[group(r)]++; });
    var perhatian = lgOk ? rows.filter(function (r) { return segera(r) || telatBayar(r); }) : [];
    setBadge(cnt.tunggu + perhatian.length);
    try {   // pengingat harian untuk admin
      if (perhatian.length && localStorage.getItem("pq_exp_notif") !== hariIni()) { localStorage.setItem("pq_exp_notif", hariIni()); T(perhatian.length + " langganan akan berakhir / lewat jatuh tempo bayar"); }
    } catch (e) { /* abaikan */ }
    if (prevTunggu >= 0 && cnt.tunggu > prevTunggu) notif(cnt.tunggu - prevTunggu);
    prevTunggu = cnt.tunggu;

    var tabs = $("pqAdminTabs"); tabs.textContent = "";
    [["tunggu", "Menunggu"], ["aktif", "Aktif"], ["berakhir", "Berakhir"], ["blok", "Diblokir"]].forEach(function (t) {
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
        act(bk, "admin_setujui_banyak", { p_ids: saran.map(function (r) { return r.id; }), p_role: "viewer" }, saran.length + " akun disetujui", saran);
      };
      tools.appendChild(bk);
    }
    if (tab === "berakhir" && lgOk && cnt.berakhir) {
      var hm = el("button", btnCss("transparent", "#fca5a5", "#7f1d1d"), "Hapus yang sudah lama berakhir…");
      hm.title = "Hapus permanen akun yang berakhir lebih dari N hari";
      hm.onclick = function () {
        var h = parseInt(prompt("Hapus akun yang sudah berakhir lebih dari berapa hari?\n(minimal 7 hari)", "30"), 10);
        if (!h) return;
        if (h < 7) { T("Minimal 7 hari", true); return; }
        var el2 = rows.filter(function (r) { return berakhir(r) && -selisih(r.aktif_sampai) > h; });
        if (!el2.length) { T("Tidak ada akun yang berakhir lebih dari " + h + " hari"); return; }
        if (!confirm("HAPUS PERMANEN " + el2.length + " akun yang berakhir > " + h + " hari?\n\n" + el2.map(function (r) { return "• " + (r.nama || r.email) + " (berakhir " + fmtTgl(r.aktif_sampai) + ")"; }).join("\n") + "\n\nFoto proyek mereka dipindah ke akun admin; riwayat pembayaran tetap tersimpan.")) return;
        act(hm, "admin_hapus_kedaluwarsa", { p_hari: h }, el2.length + " akun kedaluwarsa dihapus");
      };
      tools.appendChild(hm);
    }
    renderList();
  }
  function renderList() {
    var list = $("pqAdminList"); list.textContent = "";
    if (diag) { list.appendChild(diag); vis = []; renderBar(); return; }
    if (lastErr && !rows.length) { list.appendChild(errCard(lastErr)); vis = []; renderBar(); return; }
    var rk = (tab === "aktif" || tab === "berakhir") ? ringkasan() : null; if (rk) list.appendChild(rk);
    if (notice) list.appendChild(noticeBox());
    if (selTab !== tab) { cek = {}; selTab = tab; }
    var ada = {}; rows.forEach(function (r) { ada[r.id] = 1; }); Object.keys(cek).forEach(function (k) { if (!ada[k]) delete cek[k]; });
    var sh = urut(rows.filter(function (r) { return group(r) === tab && cocok(r); }));
    vis = sh; cbs = {};
    if (!sh.length) list.appendChild(el("div", "color:#94a3b8;padding:18px 4px;text-align:center", q ? "Tidak ada yang cocok dengan pencarian." : tab === "tunggu" ? "Tidak ada akun yang menunggu persetujuan." : tab === "berakhir" ? "Tidak ada akun dengan langganan berakhir." : "Tidak ada data."));
    sh.forEach(function (r) { list.appendChild(card(r)); });
    renderBar();
  }

  /* ---------- urutan, kotak centang, aksi massal ---------- */
  function namaR(r) { return String(r.nama || r.email || r.id || ""); }
  function kunci(r) {
    if (sortKey === "abjad") return namaR(r).toLowerCase();
    if (sortKey === "tgl") return Date.parse(r.created_at) || 0;
    if (r.aktif_sampai) return Date.parse(String(r.aktif_sampai).slice(0, 10)) || 0;
    return r.paket_bulan ? Date.parse(hariIni()) + r.paket_bulan * 30 * 864e5 : Infinity;   // belum disetujui: pakai paket yang diminta; tanpa batas = paling akhir
  }
  function urut(a) {
    return a.slice().sort(function (x, y) {
      var kx = kunci(x), ky = kunci(y), c = typeof kx === "string" ? kx.localeCompare(ky, "id", { numeric: true, sensitivity: "base" }) : (kx === ky ? 0 : kx < ky ? -1 : 1);
      return c ? c * sortDir : namaR(x).localeCompare(namaR(y), "id", { numeric: true, sensitivity: "base" });
    });
  }
  var SORT_LBL = {
    abjad: ["Abjad", { 1: "A → Z", "-1": "Z → A" }],
    tgl: ["Tanggal daftar", { 1: "Terlama", "-1": "Terbaru" }],
    paket: ["Masa paket", { 1: "Segera habis", "-1": "Terpanjang" }]
  };
  function tandai(r) {   // sinkronkan tampilan kartu dengan status centang tanpa merender ulang daftar
    var o = cbs[r.id]; if (!o) return;
    o.cb.checked = !!cek[r.id];
    o.card.style.borderColor = cek[r.id] ? "#22d3ee99" : "#ffffff18";
    o.card.style.background = cek[r.id] ? "#0c1a2b" : "#0b1120";
  }
  function terpilih() { return vis.filter(function (r) { return cek[r.id] && r.role !== "admin"; }); }
  function renderBar() {
    var bar = $("pqAdminBar"); if (!bar) return;
    bar.textContent = "";
    var pilih = vis.filter(function (r) { return r.role !== "admin"; });
    if (diag || !vis.length) { bar.style.display = "none"; return; }
    bar.style.display = "flex"; bar.style.pointerEvents = "";
    var tp = terpilih(), n = tp.length;

    var lab = el("label", "display:flex;align-items:center;gap:7px;cursor:pointer;font:700 12px system-ui;user-select:none;white-space:nowrap");
    var cb = el("input", "width:16px;height:16px;margin:0;accent-color:#22d3ee;cursor:pointer");
    cb.type = "checkbox"; cb.disabled = !pilih.length;
    cb.checked = n > 0 && n === pilih.length; cb.indeterminate = n > 0 && n < pilih.length;
    cb.onchange = function () { pilih.forEach(function (r) { if (cb.checked) cek[r.id] = 1; else delete cek[r.id]; tandai(r); }); renderBar(); };
    lab.append(cb, document.createTextNode("Pilih semua (" + pilih.length + ")"));
    bar.appendChild(lab);

    var sw = el("div", "display:flex;align-items:center;gap:5px;flex-wrap:wrap");
    sw.appendChild(el("span", "font-size:11px;color:#94a3b8", "Urutkan:"));
    ["abjad", "tgl", "paket"].forEach(function (k) {
      var on = sortKey === k, d = SORT_LBL[k];
      var b = el("button", "border-radius:14px;padding:4px 10px;cursor:pointer;font:600 11.5px system-ui;white-space:nowrap;border:1px solid " + (on ? "#22d3ee" : "#ffffff30") + ";background:" + (on ? "#22d3ee22" : "transparent") + ";color:" + (on ? "#67e8f9" : "#e6f1ff"),
        on ? d[0] + ": " + d[1][sortDir] + (sortDir === 1 ? " ↑" : " ↓") : d[0] + " ⇅");
      b.title = on ? "Klik lagi untuk membalik urutan" : "Urutkan menurut " + d[0].toLowerCase();
      b.onclick = function () { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = SORT_AWAL[k]; } renderList(); };
      sw.appendChild(b);
    });
    bar.appendChild(sw);

    var aks = el("div", "display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-left:auto");
    if (n) aks.appendChild(el("span", "font:700 12px system-ui;color:#67e8f9", n + " dipilih"));
    if (n && tab === "tunggu") {
      var ok = el("button", btnCss("#16a34a", "#fff"), "Setujui (" + n + ")");
      ok.title = "Setujui sebagai “Lihat saja”, masa aktif mengikuti paket yang diminta tiap pendaftar";
      ok.onclick = function () { setujuiMassal(ok, tp); }; aks.appendChild(ok);
    }
    if (n && tab !== "blok") {
      var bl = el("button", btnCss("transparent", "#f87171", "#f87171"), "Blokir (" + n + ")");
      bl.onclick = function () { blokirMassal(bl, tp); }; aks.appendChild(bl);
    }
    var semua = n > 0 && n === pilih.length;
    var hp = el("button", btnCss(n ? "#b91c1c" : "transparent", n ? "#fff" : "#fca5a5", n ? "#b91c1c" : "#7f1d1d") + (n ? "" : ";opacity:.55"), (semua ? "Hapus semua" : "Hapus") + (n ? " (" + n + ")" : " semua"));
    hp.title = n ? "Hapus permanen akun yang dicentang" : "Centang akun dulu, atau tekan “Pilih semua”";
    hp.onclick = function () { if (!n) { T("Centang akun dulu, atau tekan “Pilih semua”"); return; } hapusMassal(hp, tp); };
    aks.appendChild(hp);
    bar.appendChild(aks);
  }
  function daftarNama(a) { return a.slice(0, 12).map(function (r) { return "• " + (r.nama ? r.nama + " — " : "") + (r.email || r.id); }).join("\n") + (a.length > 12 ? "\n… dan " + (a.length - 12) + " lainnya" : ""); }
  async function massal(b, jobs, kata, selesai) {   // jalankan satu per satu agar kegagalan satu akun tidak menggagalkan yang lain
    var bar = $("pqAdminBar"), asli = b.textContent, ok = 0, gagal = [], berhasil = [];
    if (bar) bar.style.pointerEvents = "none";
    for (var i = 0; i < jobs.length; i++) {
      b.textContent = "Memproses " + (i + 1) + "/" + jobs.length + "…";
      try { var d = await jobs[i].run(); if (d && d.ok) { ok += jobs[i].rows.length; berhasil = berhasil.concat(jobs[i].rows); } else gagal.push(jobs[i].nama + " (" + ((d && d.reason) || "ditolak") + ")"); }
      catch (e) { gagal.push(jobs[i].nama + " (gagal menghubungi server)"); }
    }
    b.textContent = asli; cek = {};
    if (selesai) selesai(berhasil);
    if (gagal.length) { T(ok + " " + kata + ", " + gagal.length + " gagal", true); try { alert(gagal.length + " akun gagal diproses:\n\n" + gagal.slice(0, 12).join("\n")); } catch (e) { /* abaikan */ } }
    else T(ok + " akun " + kata);
    await refresh();
  }
  function hapusMassal(b, a) {
    var aktifN = a.filter(function (r) { return group(r) === "aktif"; }).length;
    if (!confirm("HAPUS PERMANEN " + a.length + " akun?\n\n" + daftarNama(a) + "\n\nFoto proyek mereka dipindah ke akun admin; riwayat pembayaran tetap tersimpan. Pendaftar yang ditolak bisa mendaftar ulang.\n\nTindakan ini tidak bisa dibatalkan.")) return;
    if (aktifN && !confirm("Konfirmasi terakhir: " + aktifN + " di antaranya AKUN AKTIF dan langsung tidak bisa masuk. Hapus " + a.length + " akun sekarang?")) return;
    massal(b, a.map(function (r) {
      var g = group(r);
      return { nama: r.email || r.id, rows: [r], run: function () { return g === "aktif" ? rpc("admin_hapus_akun", { p_id: r.id, p_paksa: true }) : g === "berakhir" ? rpc("admin_hapus_akun", { p_id: r.id }) : rpc("admin_hapus_pendaftar", { p_id: r.id }); } };
    }), "dihapus");
  }
  function blokirMassal(b, a) {
    if (!confirm("Blokir " + a.length + " akun? Semuanya akan keluar dari semua perangkat.\n\n" + daftarNama(a))) return;
    massal(b, a.map(function (r) { return { nama: r.email || r.id, rows: [r], run: function () { return rpc("admin_blokir", { p_id: r.id }); } }; }), "diblokir");
  }
  function setujuiMassal(b, a) {
    var g = {}; a.forEach(function (r) { var k = r.paket_bulan ? String(r.paket_bulan) : ""; (g[k] = g[k] || []).push(r); });
    var ket = Object.keys(g).map(function (k) { return (k ? (k % 12 === 0 ? k / 12 + " tahun" : k + " bulan") : "tanpa batas waktu") + ": " + g[k].length + " akun"; }).join("\n");
    if (!confirm("Setujui " + a.length + " akun sebagai “Lihat saja”?\n\nMasa aktif mengikuti paket yang diminta:\n" + ket + "\n\n" + daftarNama(a))) return;
    massal(b, Object.keys(g).map(function (k) {
      var body = { p_ids: g[k].map(function (r) { return r.id; }), p_role: "viewer" }; if (k) body.p_bulan = +k;
      return { nama: g[k].length + " akun", rows: g[k], run: function () { return rpc("admin_setujui_banyak", body); } };
    }), "disetujui", function (ok) { if (ok.length) { notice = { rows: ok }; tab = "aktif"; } });
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
    var st = berakhir(r) ? ["Langganan berakhir", "#f87171"] : (STATUS[r.role] || [r.role, "#94a3b8"]);
    var c = el("div", "display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border:1px solid #ffffff18;border-radius:10px;background:#0b1120");
    if (r.role !== "admin") {
      var cb = el("input", "width:16px;height:16px;margin:2px 2px 0 0;accent-color:#22d3ee;cursor:pointer;flex:none;align-self:flex-start");
      cb.type = "checkbox"; cb.checked = !!cek[r.id]; cb.title = "Pilih akun ini";
      cb.onchange = function () { if (cb.checked) cek[r.id] = 1; else delete cek[r.id]; tandai(r); renderBar(); };
      cbs[r.id] = { cb: cb, card: c }; c.appendChild(cb);
      if (cek[r.id]) { c.style.borderColor = "#22d3ee99"; c.style.background = "#0c1a2b"; }
    }
    var info = el("div", "flex:1 1 240px;min-width:0");
    var judul = r.nama ? r.nama : (r.email || r.id);
    info.appendChild(el("div", "font-weight:700;overflow-wrap:anywhere", judul));
    if (r.nama && r.email) info.appendChild(el("div", "font-size:12px;color:#cbd5e1;overflow-wrap:anywhere", r.email + (r.email_terkonfirmasi === false ? " (email belum dikonfirmasi)" : "")));
    var STX = { instansi: "Instansi pemerintah", perusahaan: "Perusahaan / konsultan", pelajar: "Pelajar / mahasiswa", umum: "Perorangan / lainnya" };
    var sub = [r.status_pendaftar && STX[r.status_pendaftar], r.instansi && r.instansi !== STX[r.status_pendaftar] ? r.instansi : "", r.hp ? "+" + r.hp : ""].filter(Boolean).join(" · ");
    if (sub) info.appendChild(el("div", "font-size:12px;color:#cbd5e1;overflow-wrap:anywhere", sub));
    if (r.tujuan) info.appendChild(el("div", "margin-top:3px;font-size:11.5px;color:#94a3b8;font-style:italic;overflow-wrap:anywhere", "“" + r.tujuan + "”"));
    if (r.paket_bulan && group(r) === "tunggu") info.appendChild(el("div", "margin-top:3px;font-size:11.5px;color:#67e8f9", "Minta langganan: " + (r.paket_bulan % 12 === 0 ? r.paket_bulan / 12 + " tahun" : r.paket_bulan + " bulan") + (r.mulai_tanggal ? ", mulai " + fmtTgl(r.mulai_tanggal) : "")));
    var chip = el("span", "display:inline-block;margin-right:8px;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;border:1px solid " + st[1] + ";color:" + st[1], st[0]);
    var meta = el("div", "margin-top:4px;font-size:11px;color:#94a3b8");
    meta.appendChild(chip);
    if (group(r) === "tunggu" && r.saran && SARAN[r.saran]) {
      var sg = SARAN[r.saran];
      meta.appendChild(el("span", "display:inline-block;margin-right:8px;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;background:" + sg[1] + "22;color:" + sg[1], sg[0] + " · skor " + (r.skor || 0)));
    }
    meta.appendChild(document.createTextNode("daftar " + rel(r.created_at) + " · masuk terakhir " + rel(r.last_sign_in_at) + (r.provider ? " · " + r.provider : "") + (r.trial_dipakai ? " · sudah pakai uji coba" : "")));
    info.appendChild(meta);
    if (lgOk && pelanggan(r)) info.appendChild(infoLangganan(r));
    c.appendChild(info);
    if (r.role === "admin") return c;
    var aks = el("div", "display:flex;flex-wrap:wrap;gap:6px;align-items:center");
    var sel = el("select", "background:#0f1521;color:#e6f1ff;border:1px solid #ffffff30;border-radius:8px;padding:6px");
    [["viewer", "Lihat saja"], ["surveyor", "Surveyor (boleh ubah data)"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1];
      if (o[0] === r.role) op.selected = true; sel.appendChild(op);
    });
    var dur = null;
    if (lgOk && group(r) === "tunggu") {
      dur = el("select", "background:#0f1521;color:#e6f1ff;border:1px solid #ffffff30;border-radius:8px;padding:6px");
      [["", "Tanpa batas waktu"], ["1", "Aktif 1 bulan"], ["3", "Aktif 3 bulan"], ["6", "Aktif 6 bulan"], ["12", "Aktif 1 tahun"], ["24", "Aktif 2 tahun"], ["36", "Aktif 3 tahun"]].forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; if (r.paket_bulan && String(r.paket_bulan) === o[0]) op.selected = true; dur.appendChild(op); });
      if (r.paket_bulan && [1, 3, 6, 12, 24, 36].indexOf(+r.paket_bulan) < 0) { var ox = document.createElement("option"); ox.value = String(r.paket_bulan); ox.textContent = "Aktif " + r.paket_bulan + " bulan (diminta)"; ox.selected = true; dur.appendChild(ox); }
      dur.title = "Masa aktif langganan sejak disetujui";
    }
    var ok = el("button", btnCss("#16a34a", "#fff"), r.role === "viewer" || r.role === "surveyor" ? "Simpan peran" : "Setujui");
    ok.onclick = function () { var bd = { p_id: r.id, p_role: sel.value }; if (dur && dur.value) bd.p_bulan = +dur.value; act(ok, "admin_setujui", bd, "Akses disetujui: " + (r.nama || r.email), r.role === "pending" || r.role === "trial" ? [r] : null); };
    if (dur) aks.append(sel, dur, ok); else aks.append(sel, ok);
    var wa = r.hp ? "https://wa.me/" + r.hp + "?text=" + encodeURIComponent("Halo " + (r.nama || "") + ", ini admin PETAQU terkait pendaftaran akun Anda.") : "";
    if (lgOk && r.hp && (segera(r) || telatBayar(r) || berakhir(r))) { var a3 = el("a", btnCss("transparent", "#fbbf24", "#fbbf24") + ";text-decoration:none", "Ingatkan bayar"); a3.href = "https://wa.me/" + r.hp + "?text=" + encodeURIComponent(pesanTagihan(r)); a3.target = "_blank"; a3.rel = "noopener"; a3.title = "Kirim pengingat perpanjangan via WhatsApp"; aks.appendChild(a3); }
    else if (r.hp && group(r) === "aktif" && r.role !== "admin") { var a2 = el("a", btnCss("transparent", "#4ade80", "#4ade80") + ";text-decoration:none", "Kabari disetujui"); a2.href = waSetuju(r); a2.target = "_blank"; a2.rel = "noopener"; a2.title = "Kirim pesan WhatsApp: akun sudah disetujui"; aks.appendChild(a2); }
    if (wa && group(r) === "tunggu") { var a = el("a", btnCss("transparent", "#4ade80", "#4ade80") + ";text-decoration:none", "WhatsApp"); a.href = wa; a.target = "_blank"; a.rel = "noopener"; aks.appendChild(a); }
    var ed = null;
    if (lgOk && pelanggan(r)) {
      ed = editorLangganan(r);
      var lb = el("button", btnCss(edOpen[r.id] ? "#0e7490" : "transparent", "#e6f1ff", "#22d3ee88"), "Langganan");
      lb.title = "Masa aktif, jatuh tempo, pembayaran";
      lb.onclick = function () { edOpen[r.id] = !edOpen[r.id]; if (!edOpen[r.id]) delete edOpen[r.id]; ed.style.display = edOpen[r.id] ? "flex" : "none"; lb.style.background = edOpen[r.id] ? "#0e7490" : "transparent"; };
      aks.appendChild(lb);
    }
    if (r.role !== "blocked") {
      var bl = el("button", btnCss("transparent", "#f87171", "#f87171"), "Blokir");
      bl.onclick = function () { if (confirm("Blokir " + (r.email || "akun ini") + "? Akun akan keluar dari semua perangkat.")) act(bl, "admin_blokir", { p_id: r.id }, "Akun diblokir: " + r.email); };
      aks.appendChild(bl);
    }
    {
      var aktifNow = group(r) === "aktif", tidakLangganan = group(r) === "berakhir" || aktifNow;
      var hp = el("button", btnCss("transparent", "#fca5a5", "#7f1d1d"), tidakLangganan ? "Hapus akun" : "Tolak & hapus");
      hp.title = aktifNow ? "Hapus akun aktif ini secara permanen" : tidakLangganan ? "Hapus akun yang sudah tidak berlangganan" : "Hapus pendaftar ini sepenuhnya (bisa mendaftar ulang)";
      hp.onclick = function () {
        var nm = r.email || "akun ini";
        if (aktifNow) {
          if (!confirm("HAPUS AKUN AKTIF " + nm + (r.nama ? " (" + r.nama + ")" : "") + "?\n\nAkun dihapus permanen dan langsung tidak bisa masuk. Foto proyeknya dipindah ke akun admin; riwayat pembayaran tetap tersimpan.\n\nTindakan ini tidak bisa dibatalkan.")) return;
          if (!confirm("Konfirmasi terakhir: hapus " + nm + " sekarang?")) return;
          act(hp, "admin_hapus_akun", { p_id: r.id, p_paksa: true }, "Akun dihapus: " + nm);
          return;
        }
        var msg = tidakLangganan ? "Hapus akun " + nm + " yang langganannya berakhir " + fmtTgl(r.aktif_sampai) + "?\n\nAkun dihapus permanen. Foto proyeknya dipindah ke akun admin; riwayat pembayaran tetap tersimpan." : "Tolak & hapus " + nm + "? Akun dihapus permanen; pemilik bisa mendaftar ulang.";
        if (confirm(msg)) act(hp, tidakLangganan ? "admin_hapus_akun" : "admin_hapus_pendaftar", { p_id: r.id }, (tidakLangganan ? "Akun dihapus: " : "Pendaftar dihapus: ") + r.email);
      };
      aks.appendChild(hp);
    }
    c.appendChild(aks);
    if (ed) c.appendChild(ed);
    return c;
  }
  async function act(b, fn, body, okMsg, who) {
    b.disabled = true; b.style.opacity = ".6";
    try {
      var d = await rpc(fn, body);
      if (d && d.ok) { T(okMsg); if (who && who.length) notice = { rows: who }; tab = who && who.length ? "aktif" : tab; await refresh(); }
      else { T("Ditolak server: " + ((d && d.reason) || "tidak diketahui"), true); b.disabled = false; b.style.opacity = ""; }
    } catch (e) { fail(e); b.disabled = false; b.style.opacity = ""; }
  }
  function fail(e) {
    T(e && e.code === "nosql" ? "Jalankan supabase-langganan.sql / supabase-pendaftaran.sql di Supabase dulu"
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
        try { await api("/rest/v1/profiles?select=aktif_sampai&limit=1"); add(true, "Fitur langganan (supabase-langganan.sql)", "Masa aktif, jatuh tempo & riwayat bayar terpasang"); }
        catch (e2) { add(false, "Fitur langganan (supabase-langganan.sql)", "Belum — jalankan supabase-langganan.sql untuk masa aktif & jatuh tempo"); }
      } catch (e) { add(false, "Membaca tabel profiles", (e.msg || e.code || "gagal") + (e.status ? " (" + e.status + ")" : "")); }
      try {
        var d = await rpc("admin_daftar_pengguna");
        rows = d; lastErr = null; render();   // perbarui jumlah tab & daftar di balik hasil diagnosa
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
    tut.onclick = function () { diag = null; render(); refresh(true); }; box.appendChild(tut);
  }

  function openPanel() {
    build(); panel.style.display = "flex"; diag = null; notice = null; render(); refresh();
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
        if (!poll) poll = setInterval(function () { if (adminOk && document.visibilityState === "visible" && !Object.keys(edOpen).length && !Object.keys(cek).length) refresh(); }, 6e4);   // lencana + notifikasi pendaftar baru tiap menit
      }
    } catch (e) { /* bukan admin / offline: tidak ada tombol */ }
  }
  window.addEventListener("pq-login", function () { setTimeout(cekAdmin, 300); });
  function boot() { setTimeout(cekAdmin, 1200); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
