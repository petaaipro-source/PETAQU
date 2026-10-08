/* PETAQU — Pendaftaran akun baru di layar login.
   Terhubung ke Supabase Auth (signup email+password). Akun baru berstatus 'pending' dan baru bisa masuk
   setelah admin menyetujui (panel di petaqu-admin.js). Data pendaftar + skor kepercayaan dikirim ke
   profiles lewat trigger di supabase-pendaftaran.sql.
   Pintar: cek status server (pendaftaran dibuka? perlu konfirmasi email?), deteksi salah ketik email,
   kekuatan password, normalisasi nomor WhatsApp, anti-bot (honeypot + waktu isi), deteksi email sudah terdaftar. */
(function () {
  "use strict";
  if (window.__pqDaftar) return;
  window.__pqDaftar = 1;

  var ADMIN_WA = "";            // isi nomor WhatsApp admin format 62812xxxxxxx -> muncul tombol "Hubungi admin"
  /* ===== PEMBAYARAN (isi sesuai data Anda) =====
     tarifBulan : tarif per bulan dalam rupiah (0 = belum diisi -> nominal dikonfirmasi admin)
     harga      : harga paket khusus per lama langganan (bulan), menimpa tarifBulan x bulan. Contoh: { 12: 1000000, 24: 1800000 }
     bank       : daftar rekening tujuan transfer, contoh: [{ nama: "BRI", no: "1234567890", an: "Nama Pemilik Rekening" }]
     qris       : nama file gambar QRIS (taruh di folder yang sama dengan index.html); "" = tidak dipakai */
  var PAY = { tarifBulan: 0, harga: {}, bank: [], qris: "qris.png" };
  var PK = "pq_daftar_info";    // penanda pendaftaran yang sedang menunggu (hanya di perangkat ini)
  var $ = function (id) { return document.getElementById(id); };
  var cfg = function () { return window.PETAQU_CFG; };
  var t0 = 0, settingsCache = null, resendTm = 0, busy = false;

  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } }

  /* ---------- status server: terhubung? pendaftaran dibuka? perlu konfirmasi email? ---------- */
  async function serverSettings(force) {
    if (settingsCache && !force) return settingsCache;
    var c = cfg();
    if (!c) return (settingsCache = { ok: false, why: "config" });
    try {
      var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 8000);
      var r = await fetch(c.url + "/auth/v1/settings", { headers: { apikey: c.anon }, signal: ctl.signal });
      clearTimeout(tm);
      if (!r.ok) return (settingsCache = { ok: false, why: "http", status: r.status });
      var j = await r.json();
      settingsCache = {
        ok: true,
        daftarDibuka: !j.disable_signup && (!j.external || j.external.email !== false),
        butuhKonfirmasi: !j.mailer_autoconfirm,
        google: !!(j.external && j.external.google)
      };
    } catch (e) { settingsCache = { ok: false, why: navigator.onLine === false ? "offline" : "timeout" }; }
    return settingsCache;
  }

  /* ---------- validasi pintar ---------- */
  var DOMAIN_UMUM = ["gmail.com", "yahoo.com", "yahoo.co.id", "outlook.com", "hotmail.com", "icloud.com", "ymail.com", "live.com", "proton.me", "pu.go.id"];
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function saranEmail(em) {
    var p = em.split("@"); if (p.length !== 2) return null;
    var dom = p[1].toLowerCase();
    if (DOMAIN_UMUM.indexOf(dom) >= 0 || /\.(go|ac|sch|co|or)\.id$/.test(dom) || dom.length < 5) return null;
    var best = null, bd = 3;
    DOMAIN_UMUM.forEach(function (d) { var x = lev(dom, d); if (x < bd) { bd = x; best = d; } });
    return bd <= 2 ? p[0] + "@" + best : null;
  }
  function emailOk(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120; }
  var UMUM = ["password", "password1", "12345678", "123456789", "1234567890", "qwertyui", "qwerty123", "admin123", "petaqu123", "abcd1234", "11111111", "iloveyou", "kata sandi"];
  function kekuatan(pw, email, nama) {
    var lo = pw.toLowerCase(), s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw) && /[a-zA-Z]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    var loc = (email || "").split("@")[0].toLowerCase();
    var diri = (loc.length >= 4 && lo.indexOf(loc) >= 0) || (nama && nama.length >= 4 && lo.indexOf(nama.toLowerCase().split(" ")[0]) >= 0 && nama.split(" ")[0].length >= 4);
    var umum = UMUM.some(function (u) { return lo.indexOf(u) >= 0; }) || /^(.)\1+$/.test(pw) || (/(0123|1234|2345|3456|4567|5678|6789|abcd)/.test(lo) && pw.length < 12);
    if (umum || diri) s = Math.min(s, 1);
    if (pw.length < 8) s = Math.min(s, 1);
    return { skor: Math.min(4, Math.max(0, s)), umum: umum, diri: !!diri };
  }
  function normHp(v) {
    var d = String(v || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
    if (d.indexOf("0") === 0) d = "62" + d.slice(1);
    else if (d.indexOf("8") === 0) d = "62" + d;
    return /^62\d{8,13}$/.test(d) ? d : "";
  }
  function mask(e) { var p = String(e || "").split("@"); return p.length === 2 ? p[0].slice(0, 2) + "***@" + p[1] : "***"; }

  /* ---------- status pendaftar & paket langganan ---------- */
  var STATUS = [
    { v: "instansi",   t: "Instansi pemerintah",   ic: "fa-building-columns", lbl: "Nama instansi / satker",     ph: "Nama instansi tempat Anda bekerja", wajib: true },
    { v: "perusahaan", t: "Perusahaan / konsultan", ic: "fa-briefcase",        lbl: "Nama perusahaan",            ph: "Nama perusahaan / konsultan / kontraktor", wajib: true },
    { v: "pelajar",    t: "Pelajar / mahasiswa",    ic: "fa-graduation-cap",   lbl: "Nama sekolah / kampus",      ph: "Nama sekolah atau perguruan tinggi", wajib: true },
    { v: "umum",       t: "Perorangan / lainnya",   ic: "fa-user",             lbl: "Keterangan singkat (opsional)", ph: "mis. peneliti mandiri, relawan, warga", wajib: false }
  ];
  var PLANS = [
    { m: 1,  t: "1 bulan",  s: "coba dulu" },
    { m: 3,  t: "3 bulan",  s: "1 kuartal" },
    { m: 6,  t: "6 bulan",  s: "1 semester" },
    { m: 12, t: "1 tahun",  s: "12 bulan", tag: "Disarankan" },
    { m: 24, t: "2 tahun",  s: "24 bulan" },
    { m: 36, t: "3 tahun",  s: "36 bulan" }
  ];
  var BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var stat = "", plan = 12;
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function isoTgl(plusHari) { var d = new Date(); d.setDate(d.getDate() + plusHari); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function parseIso(v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ""); if (!m) return null; var d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 ? d : null; }
  function tambahBulan(d, n) {   /* 31 Jan + 1 bln = 28/29 Feb, tidak meloncat ke Maret (sama dengan hitungan server) */
    var y = d.getFullYear(), mo = d.getMonth() + n, dd = d.getDate();
    var t = new Date(y, mo, 1), maks = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    return new Date(t.getFullYear(), t.getMonth(), Math.min(dd, maks));
  }
  function fmtTgl(d) { return pad2(d.getDate()) + " " + BLN[d.getMonth()] + " " + d.getFullYear(); }
  function isoOf(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function labelPlan(m) { return m % 12 === 0 ? m / 12 + " tahun" : m + " bulan"; }
  function totalHarga(m) { var h = PAY.harga && PAY.harga[m]; return h > 0 ? h : (PAY.tarifBulan > 0 ? PAY.tarifBulan * m : 0); }
  function rp(n) { return "Rp " + Math.round(n).toLocaleString("id-ID"); }
  function statInfo(v) { for (var i = 0; i < STATUS.length; i++) if (STATUS[i].v === v) return STATUS[i]; return null; }

  /* ---------- tampilan ---------- */
  var CSS = "#pqDaftar{position:fixed;inset:0;z-index:5300;display:none;align-items:flex-start;justify-content:center;background:rgba(3,6,12,.82);backdrop-filter:blur(4px);overflow-y:auto;padding:14px;-webkit-overflow-scrolling:touch}" +
    "#pqDaftar.show{display:flex}#pqDaftar .pqd-box{position:relative;margin:auto;width:100%;max-width:440px;background:linear-gradient(180deg,var(--panel,#0f1521),var(--bg-2,#0d121c));border:1px solid var(--line,#1e2938);border-radius:16px;padding:22px 20px 18px;box-shadow:0 20px 60px #000a;color:var(--text,#e6edf5);font-family:var(--mono,system-ui,sans-serif)}" +
    "#pqDaftar h3{margin:0 0 2px;font-family:var(--display,inherit);font-size:16px;letter-spacing:.8px;color:var(--cyan,#22d3ee)}#pqDaftar .pqd-sub{font-size:12px;color:var(--text-dim,#7c8aa0);margin:0 0 12px;line-height:1.5}" +
    "#pqDaftar label{display:block;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim,#7c8aa0);margin:11px 0 5px}#pqDaftar label small{font-weight:400;text-transform:none;letter-spacing:0}" +
    "#pqDaftar input[type=date],#pqDaftar input[type=text],#pqDaftar input[type=email],#pqDaftar input[type=tel],#pqDaftar input[type=password],#pqDaftar textarea{width:100%;box-sizing:border-box;background:var(--bg,#080b12);border:1px solid var(--line,#1e2938);color:var(--text,#e6edf5);padding:10px 11px;border-radius:9px;font:14px var(--mono,system-ui,sans-serif);outline:0}" +
    "#pqDaftar input:focus,#pqDaftar textarea:focus{border-color:var(--cyan,#22d3ee);box-shadow:0 0 0 3px #22d3ee1f}#pqDaftar input.bad{border-color:#f43f5e}#pqDaftar input.good{border-color:#34d399}" +
    "#pqDaftar .pqd-hint{font-size:11px;margin-top:4px;line-height:1.45;color:var(--text-dim,#7c8aa0);min-height:14px}#pqDaftar .pqd-hint.err{color:#f87171}#pqDaftar .pqd-hint.ok{color:#34d399}" +
    "#pqDaftar .pqd-btn{width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:9px;border:0;font:700 14px var(--mono,system-ui,sans-serif);cursor:pointer;margin-top:14px;background:linear-gradient(135deg,var(--cyan-dim,#0e7490),var(--blue,#3b82f6));color:#fff}" +
    "#pqDaftar .pqd-btn:disabled{opacity:.45;cursor:not-allowed}#pqDaftar .pqd-btn.sec{background:transparent;border:1px solid var(--line,#1e2938);color:var(--text,#e6edf5);margin-top:8px}" +
    "#pqDaftar .pqd-x{position:absolute;top:10px;right:12px;background:0;border:0;color:var(--text-dim,#7c8aa0);font-size:20px;cursor:pointer;padding:4px 8px}" +
    "#pqDaftar .pqd-pill{display:flex;align-items:center;gap:7px;font-size:11px;padding:7px 10px;border-radius:9px;border:1px solid var(--line,#1e2938);margin-bottom:6px;background:#ffffff08}" +
    "#pqDaftar .pqd-bar{display:flex;gap:4px;margin-top:6px}#pqDaftar .pqd-bar i{flex:1;height:5px;border-radius:3px;background:#ffffff1a}" +
    "#pqDaftar .pqd-chk{display:flex;gap:9px;align-items:flex-start;margin-top:13px;font-size:12px;line-height:1.5;color:var(--text,#e6edf5);text-transform:none;letter-spacing:0;font-weight:400}#pqDaftar .pqd-chk input{margin-top:3px;flex:none;accent-color:#22d3ee}" +
    "#pqDaftar input[type=date]{color-scheme:dark;min-height:42px}" +
    "#pqDaftar .pqd-seg{display:grid;grid-template-columns:1fr 1fr;gap:7px}#pqDaftar .pqd-opt{display:flex;align-items:center;gap:8px;padding:10px;border-radius:10px;border:1px solid var(--line,#1e2938);background:#ffffff06;color:var(--text,#e6edf5);font:600 12px var(--mono,system-ui,sans-serif);cursor:pointer;text-align:left;line-height:1.3}#pqDaftar .pqd-opt i{color:var(--text-dim,#7c8aa0);font-size:15px;width:18px;text-align:center}#pqDaftar .pqd-opt.on{border-color:var(--cyan,#22d3ee);background:#22d3ee14;box-shadow:0 0 0 2px #22d3ee22}#pqDaftar .pqd-opt.on i{color:var(--cyan,#22d3ee)}" +
    "#pqDaftar .pqd-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}#pqDaftar .pqd-plan{position:relative;padding:10px 4px 8px;border-radius:10px;border:1px solid var(--line,#1e2938);background:#ffffff06;color:var(--text,#e6edf5);font:700 13px var(--mono,system-ui,sans-serif);cursor:pointer;text-align:center;line-height:1.25}#pqDaftar .pqd-plan small{display:block;font-weight:400;font-size:10px;color:var(--text-dim,#7c8aa0);margin-top:2px;text-transform:none;letter-spacing:0}#pqDaftar .pqd-plan.on{border-color:var(--cyan,#22d3ee);background:#22d3ee14;box-shadow:0 0 0 2px #22d3ee22}#pqDaftar .pqd-plan em{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:#22d3ee;color:#04202a;font:800 9px var(--mono,system-ui,sans-serif);font-style:normal;padding:1px 7px;border-radius:8px;white-space:nowrap}" +
    "#pqDaftar .pqd-range{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;padding:10px 12px;border-radius:10px;border:1px solid #22d3ee44;background:#22d3ee0d;font-size:12px;line-height:1.4}#pqDaftar .pqd-range b{display:block;font-size:13px;color:var(--text,#e6edf5)}#pqDaftar .pqd-range span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-dim,#7c8aa0)}#pqDaftar .pqd-range .ar{color:var(--cyan,#22d3ee);font-size:16px}" +
    "#pqDaftar .pqd-total{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-radius:10px;background:#34d3991a;border:1px solid #34d39966;font-size:12px}#pqDaftar .pqd-total b{font-size:16px;color:#34d399}#pqDaftar .pqd-total small{display:block;font-size:10px;color:var(--text-dim,#7c8aa0)}" +
    "#pqDaftar .pqd-pay{margin:12px 0 4px;padding:12px;border:1px solid var(--line,#1e2938);border-radius:12px;background:#ffffff06}#pqDaftar .pqd-pay h4{margin:0 0 8px;font-size:13px;color:var(--cyan,#22d3ee);letter-spacing:.5px}" +
    "#pqDaftar .pqd-qris{text-align:center;margin:10px 0}#pqDaftar .pqd-qris a{display:inline-block;background:#fff;border-radius:12px;padding:8px}#pqDaftar .pqd-qris img{display:block;width:210px;max-width:100%;height:auto}#pqDaftar .pqd-qris small{display:block;margin-top:6px;font-size:11px;color:var(--text-dim,#7c8aa0)}" +
    "#pqDaftar .pqd-bank{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border-radius:9px;border:1px solid var(--line,#1e2938);margin-top:6px;font-size:12px;line-height:1.4}#pqDaftar .pqd-bank b{display:block;font-size:13px;letter-spacing:.5px}#pqDaftar .pqd-bank span{color:var(--text-dim,#7c8aa0)}#pqDaftar .pqd-copy{flex:none;border:1px solid #22d3ee66;background:transparent;color:var(--cyan,#22d3ee);border-radius:8px;padding:6px 10px;font:700 11px var(--mono,system-ui,sans-serif);cursor:pointer}" +
    "#pqDaftar .pqd-eye{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:0;border:0;color:var(--text-dim,#7c8aa0);cursor:pointer;padding:6px}" +
    "#pqDaftar .pqd-step{display:flex;gap:10px;align-items:flex-start;margin:9px 0;font-size:12.5px;line-height:1.5}#pqDaftar .pqd-step b{flex:none;width:22px;height:22px;border-radius:50%;background:#22d3ee22;border:1px solid #22d3ee66;color:#22d3ee;display:flex;align-items:center;justify-content:center;font-size:11px}" +
    "#pqDaftarEntry button.pqd-open{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;padding:11px;border-radius:9px;border:1px dashed var(--cyan-dim,#0e7490);background:transparent;color:var(--cyan,#22d3ee);font:700 13.5px var(--mono,system-ui,sans-serif);cursor:pointer}" +
    "#pqDaftarEntry .pqd-wait{font-size:11.5px;line-height:1.5;color:#fbbf24;background:#fbbf2412;border:1px solid #fbbf2455;border-radius:9px;padding:8px 10px;margin-bottom:8px}#pqDaftarEntry .pqd-wait a{color:#fcd34d;cursor:pointer;text-decoration:underline}";

  var box = null;
  function build() {
    if ($("pqDaftar")) return;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var ov = el("div"); ov.id = "pqDaftar"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    box = el("div"); box.className = "pqd-box"; ov.appendChild(box);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) tutup(); });
    ov.addEventListener("click", function (e) {
      var c = e.target.closest && e.target.closest(".pqd-copy"); if (!c) return;
      var v = c.getAttribute("data-copy"), ok = function () { c.textContent = "Tersalin ✓"; setTimeout(function () { c.textContent = "Salin"; }, 1800); };
      try { navigator.clipboard.writeText(v).then(ok, function () { window.prompt("Salin nomor:", v); }); } catch (x) { window.prompt("Salin nomor:", v); }
    });
    document.body.appendChild(ov);
  }
  function tutup() { var o = $("pqDaftar"); if (o) o.classList.remove("show"); }

  function pill(ok, teks) {
    return '<div class="pqd-pill" style="border-color:' + (ok === null ? "#fbbf2455" : ok ? "#34d39955" : "#f43f5e66") + '"><i class="fa-solid ' + (ok === null ? "fa-circle-notch fa-spin" : ok ? "fa-circle-check" : "fa-circle-xmark") +
      '" style="color:' + (ok === null ? "#fbbf24" : ok ? "#34d399" : "#f87171") + '"></i><span>' + teks + "</span></div>";
  }

  function formHtml() {
    return '<button class="pqd-x" type="button" id="pqdX" aria-label="Tutup">×</button>' +
      "<h3><i class=\"fa-solid fa-user-plus\"></i> Daftar Akun PETAQU</h3>" +
      '<p class="pqd-sub">Isi data dengan benar. Akun aktif setelah <b>disetujui admin</b>; data yang lengkap mempercepat persetujuan.</p>' +
      '<div id="pqdStatus">' + pill(null, "Menghubungi server…") + "</div>" +
      '<button type="button" class="pqd-btn sec" id="pqdGoogle" style="margin-top:6px;background:#fff;color:#1f1f1f;border-color:#dadce0"><svg viewBox="0 0 48 48" width="17" height="17"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Daftar dengan Google</button>' +
      '<div style="display:flex;align-items:center;gap:10px;margin:12px 0 0;color:var(--text-dim,#7c8aa0);font-size:11px"><span style="flex:1;height:1px;background:var(--line,#1e2938)"></span>atau isi formulir<span style="flex:1;height:1px;background:var(--line,#1e2938)"></span></div>' +
      '<form id="pqdForm" autocomplete="on" novalidate>' +
      '<label for="pqdNama">Nama lengkap</label><input type="text" id="pqdNama" autocomplete="name" maxlength="80" placeholder="Nama sesuai identitas"><div class="pqd-hint" id="hNama"></div>' +
      '<label>Saya mendaftar sebagai</label><div class="pqd-seg" id="pqdStat" role="radiogroup" aria-label="Status pendaftar">' +
      STATUS.map(function (o) { return '<button type="button" class="pqd-opt" role="radio" aria-checked="false" data-v="' + o.v + '"><i class="fa-solid ' + o.ic + '"></i><span>' + o.t + '</span></button>'; }).join("") + '</div><div class="pqd-hint" id="hStat"></div>' +
      '<div id="pqdInstWrap" style="display:none"><label for="pqdInst" id="lInst">Nama instansi</label><input type="text" id="pqdInst" maxlength="100" autocomplete="organization" placeholder=""><div class="pqd-hint" id="hInst"></div></div>' +
'<label for="pqdHp">No. WhatsApp <small>(untuk konfirmasi admin)</small></label><input type="tel" id="pqdHp" autocomplete="tel" inputmode="tel" maxlength="18" placeholder="08xxxxxxxxxx"><div class="pqd-hint" id="hHp"></div>' +
      '<label for="pqdEmail">Email</label><input type="email" id="pqdEmail" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="120" placeholder="nama@email.com"><div class="pqd-hint" id="hEmail"></div>' +
      '<label for="pqdPw">Password</label><div style="position:relative"><input type="password" id="pqdPw" autocomplete="new-password" maxlength="72" placeholder="Minimal 8 karakter" style="padding-right:40px"><button type="button" class="pqd-eye" id="pqdEye" aria-label="Lihat password"><i class="fa-solid fa-eye"></i></button></div><div class="pqd-bar" id="pqdBar"><i></i><i></i><i></i><i></i></div><div class="pqd-hint" id="hPw"></div>' +
      '<label for="pqdPw2">Ulangi password</label><input type="password" id="pqdPw2" autocomplete="new-password" maxlength="72" placeholder="Ketik ulang password"><div class="pqd-hint" id="hPw2"></div>' +
      '<label>Lama langganan</label><div class="pqd-plans" id="pqdPlans" role="radiogroup" aria-label="Lama langganan">' +
      PLANS.map(function (o) { return '<button type="button" class="pqd-plan" role="radio" aria-checked="false" data-m="' + o.m + '">' + (o.tag ? '<em>' + o.tag + '</em>' : '') + o.t + '<small>' + (totalHarga(o.m) ? rp(totalHarga(o.m)) : o.s) + '</small></button>'; }).join("") + '</div>' +
      '<label for="pqdMulai">Mulai tanggal</label><input type="date" id="pqdMulai" min="' + isoTgl(0) + '" max="' + isoTgl(60) + '" value="' + isoTgl(0) + '"><div class="pqd-hint" id="hMulai"></div>' +
      '<div class="pqd-range" id="pqdRange"></div>' +
      '<div id="pqdTotal" style="margin-top:8px"></div>' +
      '<div class="pqd-hint" style="margin-top:6px">' + (PAY.tarifBulan > 0 || Object.keys(PAY.harga || {}).length ? "Pembayaran lewat transfer bank atau QRIS setelah pendaftaran terkirim." : "Tarif &amp; cara bayar (transfer / QRIS) dikonfirmasi setelah pendaftaran terkirim.") + " Masa aktif dihitung dari tanggal mulai di atas." + '</div>' +
      '<label for="pqdTuj">Keperluan akses <small>(opsional)</small></label><textarea id="pqdTuj" rows="2" maxlength="160" placeholder="mis. surveyor ruas Cilacap, pengawas paket…"></textarea>' +
      '<input type="text" id="pqdWeb" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">' +
      '<label class="pqd-chk" for="pqdOk"><input type="checkbox" id="pqdOk"> <span>Saya mengerti akun baru aktif setelah disetujui admin dan data di atas benar.</span></label>' +
      '<div class="pqd-hint err" id="pqdMsg" style="margin-top:10px;font-size:12px"></div>' +
      '<button type="submit" class="pqd-btn" id="pqdGo" disabled><i class="fa-solid fa-paper-plane"></i> <span>Kirim Pendaftaran</span></button>' +
      '<button type="button" class="pqd-btn sec" id="pqdBack">Sudah punya akun? Masuk</button></form>';
  }

  function hint(id, txt, kind) { var h = $(id); if (!h) return; h.textContent = txt || ""; h.className = "pqd-hint" + (kind ? " " + kind : ""); }
  function mark(id, kind) { var i = $(id); if (i) i.className = kind || ""; }

  function cek(tampilkan) {
    var nama = $("pqdNama").value.trim(), inst = $("pqdInst").value.trim(), si = statInfo(stat), hp = $("pqdHp").value.trim(), em = $("pqdEmail").value.trim().toLowerCase();
    var pw = $("pqdPw").value, pw2 = $("pqdPw2").value, ok = $("pqdOk").checked, valid = true;
    var tN = nama.length >= 3, tI = !si ? false : (si.wajib ? inst.length >= 3 : true), mulaiD = parseIso($("pqdMulai").value), tM = !!mulaiD && $("pqdMulai").value >= isoTgl(0) && $("pqdMulai").value <= isoTgl(60), hpN = normHp(hp), tE = emailOk(em), k = kekuatan(pw, em, nama), tP = pw.length >= 8 && k.skor >= 2 && !k.umum, tP2 = pw2 && pw === pw2;
    var tmp = [tN, !!si, tI, tM, !!plan, !!hpN, tE, tP, !!tP2, ok];
    tmp.forEach(function (x) { if (!x) valid = false; });

    if (nama) { mark("pqdNama", tN ? "good" : "bad"); hint("hNama", tN ? (nama.indexOf(" ") > 0 ? "" : "Disarankan nama lengkap (lebih dari satu kata).") : "Nama terlalu pendek.", tN ? "" : "err"); } else hint("hNama", "");
    if (si && si.wajib && inst) { mark("pqdInst", tI ? "good" : "bad"); hint("hInst", tI ? "" : "Isi " + si.lbl.toLowerCase() + " (min. 3 huruf).", tI ? "" : "err"); } else { mark("pqdInst", ""); hint("hInst", ""); }
    if (!tM && $("pqdMulai").value) hint("hMulai", "Pilih tanggal mulai dari hari ini sampai 60 hari ke depan.", "err"); else hint("hMulai", "");
    var rg = $("pqdRange");
    if (rg) {
      if (tM && plan) { var akh = tambahBulan(mulaiD, plan), hr = Math.round((akh - mulaiD) / 864e5); rg.style.display = "flex"; rg.innerHTML = '<div><span>Mulai</span><b>' + fmtTgl(mulaiD) + '</b></div><i class=\"fa-solid fa-arrow-right ar\"></i><div style=\"text-align:right\"><span>Sampai dengan</span><b>' + fmtTgl(akh) + '</b></div>'; rg.title = labelPlan(plan) + " · " + hr + " hari"; }
      else { rg.style.display = "none"; rg.innerHTML = ""; }
    }
    var tt = $("pqdTotal"); if (tt) tt.innerHTML = plan && totalHarga(plan) ? '<div class="pqd-total"><span>Total pembayaran</span><b>' + rp(totalHarga(plan)) + '</b></div>' : "";
    if (hp) { mark("pqdHp", hpN ? "good" : "bad"); hint("hHp", hpN ? "Dipakai sebagai +" + hpN : "Nomor tidak valid. Contoh: 081234567890", hpN ? "ok" : "err"); } else hint("hHp", "");
    if (em) {
      mark("pqdEmail", tE ? "good" : "bad");
      var sg = tE ? saranEmail(em) : null;
      var h = $("hEmail");
      if (!tE) hint("hEmail", "Format email belum benar.", "err");
      else if (sg) { hint("hEmail", "Maksud Anda " + sg + "? Ketuk di sini untuk memperbaiki.", "err"); h.style.cursor = "pointer"; h.onclick = function () { $("pqdEmail").value = sg; h.onclick = null; h.style.cursor = ""; cek(); }; }
      else if (/\.go\.id$/.test(em.split("@")[1] || "")) hint("hEmail", "Email instansi pemerintah — persetujuan biasanya lebih cepat.", "ok");
      else hint("hEmail", "");
    } else hint("hEmail", "");
    var bars = $("pqdBar").children, warna = ["#f43f5e", "#f59e0b", "#facc15", "#34d399"];
    for (var i = 0; i < 4; i++) bars[i].style.background = pw && i < k.skor ? warna[Math.max(0, k.skor - 1)] : "#ffffff1a";
    if (pw) hint("hPw", k.umum ? "Terlalu mudah ditebak, hindari pola umum." : k.diri ? "Jangan memakai nama / email Anda sendiri." : pw.length < 8 ? "Minimal 8 karakter." : ["", "Lemah — tambah huruf besar, angka, atau simbol.", "Cukup.", "Kuat.", "Sangat kuat."][k.skor] || "", tP ? "ok" : "err"); else hint("hPw", "");
    if (pw2) { mark("pqdPw2", tP2 ? "good" : "bad"); hint("hPw2", tP2 ? "Cocok." : "Password belum sama.", tP2 ? "ok" : "err"); } else hint("hPw2", "");
    $("pqdGo").disabled = !valid || busy;
    return { valid: valid, nama: nama, inst: inst, stat: stat, plan: plan, mulai: tM ? mulaiD : null, sampai: tM && plan ? tambahBulan(mulaiD, plan) : null, hp: hpN, em: em, pw: pw, tuj: $("pqdTuj").value.trim() };
  }

  async function tampilStatus() {
    var s = await serverSettings(true), box2 = $("pqdStatus"); if (!box2) return;
    if (!s.ok) {
      box2.innerHTML = pill(false, s.why === "offline" ? "Tidak ada koneksi internet." : s.why === "config" ? "Konfigurasi server belum diisi (petaqu-auth.js)." : "Server belum terjangkau, coba lagi sebentar.");
      return;
    }
    box2.innerHTML = pill(true, "Terhubung ke server") +
      (s.daftarDibuka ? pill(true, s.butuhKonfirmasi ? "Pendaftaran dibuka · akan ada email konfirmasi" : "Pendaftaran dibuka") : pill(false, "Pendaftaran email sedang ditutup oleh admin. Gunakan Google atau hubungi admin."));
    if (!s.daftarDibuka) { var f = $("pqdForm"); if (f) f.querySelectorAll("input,textarea,button[type=submit]").forEach(function (x) { x.disabled = true; }); }
    if (!s.google) { var g = $("pqdGoogle"); if (g) g.style.display = "none"; }
  }

  function bukaForm() {
    build();
    box.innerHTML = formHtml();
    $("pqDaftar").classList.add("show");
    t0 = Date.now();
    $("pqdX").onclick = tutup;
    $("pqdBack").onclick = tutup;
    $("pqdGoogle").onclick = function () { tutup(); var g = $("loginGoogle"); if (g) g.click(); };
    $("pqdEye").onclick = function () {
      var p = $("pqdPw"), sh = p.type === "password"; p.type = sh ? "text" : "password"; $("pqdPw2").type = p.type;
      this.firstChild.className = "fa-solid " + (sh ? "fa-eye-slash" : "fa-eye");
    };
    stat = ""; plan = 12;
    function tandai(wadah, sel, cocok) { wadah.querySelectorAll(sel).forEach(function (b) { var on = cocok(b); b.classList.toggle("on", on); b.setAttribute("aria-checked", on ? "true" : "false"); }); }
    function pilihStatus(v) {
      stat = v; var si = statInfo(v), w = $("pqdInstWrap"), i = $("pqdInst");
      tandai($("pqdStat"), ".pqd-opt", function (b) { return b.getAttribute("data-v") === v; });
      if (si) { w.style.display = ""; $("lInst").textContent = si.lbl; i.placeholder = si.ph; }
      pesan(""); cek();
    }
    $("pqdStat").addEventListener("click", function (e) { var b = e.target.closest(".pqd-opt"); if (b) { pilihStatus(b.getAttribute("data-v")); if (!$("pqdInst").value) $("pqdInst").focus(); } });
    function pilihPlan(m) { plan = m; tandai($("pqdPlans"), ".pqd-plan", function (b) { return +b.getAttribute("data-m") === m; }); cek(); }
    $("pqdPlans").addEventListener("click", function (e) { var b = e.target.closest(".pqd-plan"); if (b) pilihPlan(+b.getAttribute("data-m")); });
    tandai($("pqdPlans"), ".pqd-plan", function (b) { return +b.getAttribute("data-m") === plan; });
    ["pqdNama", "pqdInst", "pqdMulai", "pqdHp", "pqdEmail", "pqdPw", "pqdPw2", "pqdTuj", "pqdOk"].forEach(function (id) {
      $(id).addEventListener("input", function () { $("pqdMsg").textContent = ""; cek(); });
      $(id).addEventListener("change", function () { cek(); });
    });
    $("pqdForm").addEventListener("submit", function (e) { e.preventDefault(); kirim(); });
    cek();
    tampilStatus();
    setTimeout(function () { var n = $("pqdNama"); if (n) n.focus(); }, 80);
  }

  function pesan(m) { var e = $("pqdMsg"); if (e) e.textContent = m || ""; }

  async function kirim() {
    if (busy) return;
    var d = cek(); if (!d.valid) return pesan("Lengkapi semua kolom dengan benar dulu.");
    if ($("pqdWeb").value) return;                                   // honeypot: bot mengisi kolom tersembunyi
    if (Date.now() - t0 < 3500) return pesan("Tunggu sebentar lalu kirim lagi.");
    var c = cfg(); if (!c) return pesan("Konfigurasi server belum diisi.");
    var s = await serverSettings();
    if (s && s.ok && !s.daftarDibuka) return pesan("Pendaftaran email sedang ditutup. Gunakan Google atau hubungi admin.");
    busy = true; $("pqdGo").disabled = true; $("pqdGo").querySelector("span").textContent = "Mengirim…"; pesan("");
    try {
      var r = await fetch(c.url + "/auth/v1/signup?redirect_to=" + encodeURIComponent(location.origin + location.pathname), {
        method: "POST", headers: { apikey: c.anon, "Content-Type": "application/json" },
        body: JSON.stringify({ email: d.em, password: d.pw, data: { nama: d.nama, instansi: d.inst || statInfo(d.stat).t, status: d.stat, paket_bulan: d.plan, mulai_tanggal: isoOf(d.mulai), hp: d.hp,
          tujuan: ("[" + statInfo(d.stat).t + " · " + labelPlan(d.plan) + ": " + fmtTgl(d.mulai) + " s/d " + fmtTgl(d.sampai) + "] " + d.tuj).trim() } })
      });
      var j = {}; try { j = await r.json(); } catch (e) { /* tubuh kosong */ }
      var kode = String(j.error_code || j.code || ""), txt = String(j.msg || j.message || j.error_description || j.error || "");
      if (r.status === 429 || /rate|too many|terlalu/i.test(kode + txt)) return pesan("Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.");
      if (/signup_disabled|disabled/i.test(kode + txt)) { settingsCache = null; return pesan("Pendaftaran email sedang ditutup oleh admin."); }
      if (/weak_password|password/i.test(kode + txt) && !r.ok) return pesan("Password ditolak server: " + (txt || "terlalu lemah") + ". Gunakan kombinasi yang lebih kuat.");
      if (/user_already|email_exists|already (registered|exists)/i.test(kode + txt)) return sudahAda(d.em);
      if (!r.ok) return pesan("Pendaftaran gagal (" + r.status + "): " + (txt || "tanpa keterangan"));
      var u = j.user || j;
      if (u && Array.isArray(u.identities) && u.identities.length === 0) return sudahAda(d.em);   // GoTrue menyamarkan email yang sudah ada
      if (j.access_token) { fetch(c.url + "/auth/v1/logout?scope=local", { method: "POST", headers: { apikey: c.anon, Authorization: "Bearer " + j.access_token } }).catch(function () { }); }   // belum disetujui: jangan simpan sesi
      var info = { em: d.em, nama: d.nama, ts: Date.now(), konfirmasi: !j.access_token, statT: statInfo(d.stat).t, inst: d.inst, plan: d.plan, mulai: fmtTgl(d.mulai), sampai: fmtTgl(d.sampai), total: totalHarga(d.plan) };
      lsSet(PK, info);
      sukses(info, d);
      renderEntry();
    } catch (e) {
      pesan(navigator.onLine === false ? "Tidak ada koneksi internet." : "Server tidak dapat dihubungi, coba lagi.");
    } finally {
      busy = false; var b = $("pqdGo"); if (b) { b.querySelector("span").textContent = "Kirim Pendaftaran"; cek(); }
    }
  }

  function sudahAda(em) {
    pesan("");
    hint("hEmail", "Email ini sudah terdaftar. Masuk dengan email + password, atau tunggu persetujuan admin bila baru mendaftar.", "err");
    mark("pqdEmail", "bad");
    pesan("Email sudah terdaftar.");
  }

  function waLink(info) {
    if (!ADMIN_WA) return "";
    var t = "Halo Admin PETAQU, saya baru mendaftar.\nNama: " + info.nama + "\nStatus: " + (info.statT || "-") + (info.inst ? " (" + info.inst + ")" : "") +
      "\nLangganan: " + (info.plan ? labelPlan(info.plan) + ", " + info.mulai + " s/d " + info.sampai : "-") + (info.total ? "\nTotal: " + rp(info.total) : "") +
      "\nEmail: " + info.em + "\nSaya sudah bayar via transfer/QRIS, bukti terlampir. Mohon disetujui. Terima kasih.";
    return "https://wa.me/" + ADMIN_WA + "?text=" + encodeURIComponent(t);
  }

  function payHtml(info) {
    var tot = info.total, lines = [];
    lines.push('<div class="pqd-pay"><h4><i class="fa-solid fa-wallet"></i> Pembayaran</h4>');
    lines.push(tot ? '<div class="pqd-total"><span>Total' + (info.plan ? '<small>' + labelPlan(info.plan) + ' · ' + esc(info.mulai) + ' s/d ' + esc(info.sampai) + '</small>' : "") + '</span><b>' + rp(tot) + '</b></div>' : '<div class="pqd-hint">Nominal dikonfirmasi admin lewat WhatsApp.</div>');
    if (PAY.qris) lines.push('<div class="pqd-qris"><a href="' + esc(PAY.qris) + '" target="_blank" rel="noopener" title="Ketuk untuk memperbesar / menyimpan"><img src="' + esc(PAY.qris) + '" alt="QRIS" onerror="this.parentNode.parentNode.style.display=\'none\'"></a><small>Scan QRIS dengan m-banking / e-wallet apa pun</small></div>');
    (PAY.bank || []).forEach(function (b) {
      lines.push('<div class="pqd-bank"><div><b>' + esc(b.nama) + ' · ' + esc(b.no) + '</b><span>a.n. ' + esc(b.an || "") + '</span></div><button type="button" class="pqd-copy" data-copy="' + esc(String(b.no).replace(/\s/g, "")) + '">Salin</button></div>');
    });
    lines.push('<div class="pqd-hint" style="margin-top:8px">Setelah membayar, kirim <b>bukti transfer / QRIS</b> ke admin lewat WhatsApp agar akun cepat diaktifkan.</div></div>');
    return lines.join("");
  }
  function bukaBayar(info) {
    build();
    var wa = waLink(info);
    box.innerHTML = '<button class="pqd-x" type="button" id="pqdX3" aria-label="Tutup">×</button><h3><i class="fa-solid fa-wallet"></i> Cara Bayar</h3><p class="pqd-sub">' + esc(mask(info.em)) + '</p>' + payHtml(info) +
      (wa ? '<a class="pqd-btn" style="text-decoration:none;background:#16a34a" target="_blank" rel="noopener" href="' + wa + '"><i class="fa-brands fa-whatsapp"></i> Kirim bukti bayar via WhatsApp</a>' : "") +
      '<button type="button" class="pqd-btn sec" id="pqdDone3">Tutup</button>';
    $("pqDaftar").classList.add("show");
    $("pqdX3").onclick = tutup; $("pqdDone3").onclick = tutup;
  }

  function sukses(info, d) {
    var wa = waLink(info);
    box.innerHTML = '<button class="pqd-x" type="button" id="pqdX2" aria-label="Tutup">×</button>' +
      '<div style="text-align:center;margin:4px 0 10px"><div style="width:58px;height:58px;margin:0 auto 10px;border-radius:50%;background:#34d39922;border:1px solid #34d39988;display:flex;align-items:center;justify-content:center;font-size:24px;color:#34d399"><i class="fa-solid fa-check"></i></div>' +
      "<h3>Pendaftaran terkirim</h3><p class=\"pqd-sub\" style=\"margin:4px 0 0\">" + esc(mask(info.em)) + "</p></div>" +
      (info.konfirmasi ? '<div class="pqd-step"><b>1</b><div><b style="all:unset;font-weight:700">Konfirmasi email.</b> Buka email dari PETAQU lalu ketuk tautannya (cek folder Spam).</div></div>' : "") +
      '<div class="pqd-step"><b>' + (info.konfirmasi ? "2" : "1") + '</b><div><b style="all:unset;font-weight:700">Bayar & kirim bukti.</b> Transfer atau scan QRIS di bawah, lalu kirim buktinya ke admin.</div></div>' +
      '<div class="pqd-step"><b>' + (info.konfirmasi ? "3" : "2") + '</b><div><b style="all:unset;font-weight:700">Admin mengaktifkan.</b> Setelah pembayaran dicek dan akun disetujui, masuk lewat <i>Masuk dengan email / username</i>.</div></div>' +
      payHtml(info) +
      (wa ? '<a class="pqd-btn" style="text-decoration:none;background:#16a34a" target="_blank" rel="noopener" href="' + wa + '"><i class="fa-brands fa-whatsapp"></i> Kirim bukti bayar via WhatsApp</a>' : "") +
      (info.konfirmasi ? '<button type="button" class="pqd-btn sec" id="pqdResend"><i class="fa-solid fa-envelope"></i> <span>Kirim ulang email konfirmasi</span></button><div class="pqd-hint" id="pqdResendMsg" style="text-align:center"></div>' : "") +
      '<button type="button" class="pqd-btn sec" id="pqdDone">Kembali ke Login</button>';
    $("pqdX2").onclick = tutup; $("pqdDone").onclick = tutup;
    var rb = $("pqdResend"); if (rb) rb.onclick = function () { kirimUlang(info.em); };
  }

  async function kirimUlang(em) {
    var b = $("pqdResend"), m = $("pqdResendMsg"), c = cfg(); if (!b || !c || b.disabled) return;
    b.disabled = true;
    try {
      var r = await fetch(c.url + "/auth/v1/resend?redirect_to=" + encodeURIComponent(location.origin + location.pathname), { method: "POST", headers: { apikey: c.anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "signup", email: em }) });
      m.className = "pqd-hint " + (r.ok ? "ok" : "err");
      m.textContent = r.ok ? "Email konfirmasi dikirim ulang. Cek Inbox/Spam." : r.status === 429 ? "Terlalu sering, tunggu sebentar." : "Gagal mengirim ulang (" + r.status + ").";
    } catch (e) { m.className = "pqd-hint err"; m.textContent = "Tidak ada koneksi."; }
    var n = 60; clearInterval(resendTm);
    resendTm = setInterval(function () { n--; var bb = $("pqdResend"); if (!bb) return clearInterval(resendTm); bb.querySelector("span").textContent = n > 0 ? "Kirim ulang (" + n + " dtk)" : "Kirim ulang email konfirmasi"; if (n <= 0) { clearInterval(resendTm); bb.disabled = false; } }, 1000);
  }

  /* ---------- tombol di layar login ---------- */
  function renderEntry() {
    var w = $("pqDaftarEntry"); if (!w) return;
    var info = lsGet(PK), wait = "";
    if (info && info.em && Date.now() - info.ts < 30 * 864e5) {
      wait = '<div class="pqd-wait"><i class="fa-solid fa-hourglass-half"></i> Pendaftaran <b>' + esc(mask(info.em)) + '</b> menunggu persetujuan admin. Setelah disetujui, masuk dengan email + password. ' + (info.plan ? '<a id="pqdPay">Lihat cara bayar</a> · ' : "") + '<a id="pqdClear">Hapus pengingat</a></div>';
    }
    w.innerHTML = wait + '<button type="button" class="pqd-open" id="pqdOpen"><i class="fa-solid fa-user-plus"></i><span>Daftar Akun Baru</span></button>';
    $("pqdOpen").onclick = bukaForm;
    var py = $("pqdPay"); if (py) py.onclick = function () { bukaBayar(info); };
    var cl = $("pqdClear"); if (cl) cl.onclick = function () { try { localStorage.removeItem(PK); } catch (e) { /* abaikan */ } renderEntry(); };
  }
  function inject() {
    if ($("pqDaftarEntry")) return true;
    var card = $("loginCard"); if (!card) return false;
    build();
    var w = el("div", "margin-top:12px"); w.id = "pqDaftarEntry";
    var foot = card.querySelector(".login-foot"), alt = $("pqLoginAlt");
    if (alt && alt.parentNode) alt.parentNode.insertBefore(w, alt.nextSibling); else if (foot) card.insertBefore(w, foot); else card.appendChild(w);
    renderEntry();
    return true;
  }
  /* ---------- pemberitahuan di perangkat pendaftar: akun sudah disetujui ---------- */
  function kabarSetuju() {
    try {
      var info = lsGet(PK), s = JSON.parse(localStorage.getItem("pq_cloud_session") || "null");
      if (!info || !info.em || !s || !s.email) return;
      if (String(s.email).toLowerCase() !== String(info.em).toLowerCase()) return;   // hanya untuk akun yang tadi mendaftar di perangkat ini
      localStorage.removeItem(PK);
      setTimeout(function () {
        try { if (typeof window.toast === "function") window.toast("✓ Akun Anda telah disetujui admin. Selamat datang di PETAQU!"); } catch (e) { /* abaikan */ }
        try { if ("Notification" in window && Notification.permission === "granted") new Notification("PETAQU", { body: "Akun Anda telah disetujui admin. Selamat datang!", icon: "icon-192.png" }); } catch (e) { /* abaikan */ }
      }, 1800);
    } catch (e) { /* abaikan */ }
  }

  function boot() {
    var n = 0, iv = setInterval(function () { n++; if ((inject() && $("pqLoginAlt")) || n > 60) clearInterval(iv); }, 250);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") tutup(); });
    window.addEventListener("pq-login", tutup);
    window.addEventListener("pq-login", kabarSetuju);
  }
  window.PQ_DAFTAR = { buka: bukaForm, status: function () { return serverSettings(true); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
