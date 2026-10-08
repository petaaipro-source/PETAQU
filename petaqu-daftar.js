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

  /* ---------- tampilan ---------- */
  var CSS = "#pqDaftar{position:fixed;inset:0;z-index:5300;display:none;align-items:flex-start;justify-content:center;background:rgba(3,6,12,.82);backdrop-filter:blur(4px);overflow-y:auto;padding:14px;-webkit-overflow-scrolling:touch}" +
    "#pqDaftar.show{display:flex}#pqDaftar .pqd-box{position:relative;margin:auto;width:100%;max-width:440px;background:linear-gradient(180deg,var(--panel,#0f1521),var(--bg-2,#0d121c));border:1px solid var(--line,#1e2938);border-radius:16px;padding:22px 20px 18px;box-shadow:0 20px 60px #000a;color:var(--text,#e6edf5);font-family:var(--mono,system-ui,sans-serif)}" +
    "#pqDaftar h3{margin:0 0 2px;font-family:var(--display,inherit);font-size:16px;letter-spacing:.8px;color:var(--cyan,#22d3ee)}#pqDaftar .pqd-sub{font-size:12px;color:var(--text-dim,#7c8aa0);margin:0 0 12px;line-height:1.5}" +
    "#pqDaftar label{display:block;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-dim,#7c8aa0);margin:11px 0 5px}#pqDaftar label small{font-weight:400;text-transform:none;letter-spacing:0}" +
    "#pqDaftar input[type=text],#pqDaftar input[type=email],#pqDaftar input[type=tel],#pqDaftar input[type=password],#pqDaftar textarea{width:100%;box-sizing:border-box;background:var(--bg,#080b12);border:1px solid var(--line,#1e2938);color:var(--text,#e6edf5);padding:10px 11px;border-radius:9px;font:14px var(--mono,system-ui,sans-serif);outline:0}" +
    "#pqDaftar input:focus,#pqDaftar textarea:focus{border-color:var(--cyan,#22d3ee);box-shadow:0 0 0 3px #22d3ee1f}#pqDaftar input.bad{border-color:#f43f5e}#pqDaftar input.good{border-color:#34d399}" +
    "#pqDaftar .pqd-hint{font-size:11px;margin-top:4px;line-height:1.45;color:var(--text-dim,#7c8aa0);min-height:14px}#pqDaftar .pqd-hint.err{color:#f87171}#pqDaftar .pqd-hint.ok{color:#34d399}" +
    "#pqDaftar .pqd-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:9px;border:0;font:700 14px var(--mono,system-ui,sans-serif);cursor:pointer;margin-top:14px;background:linear-gradient(135deg,var(--cyan-dim,#0e7490),var(--blue,#3b82f6));color:#fff}" +
    "#pqDaftar .pqd-btn:disabled{opacity:.45;cursor:not-allowed}#pqDaftar .pqd-btn.sec{background:transparent;border:1px solid var(--line,#1e2938);color:var(--text,#e6edf5);margin-top:8px}" +
    "#pqDaftar .pqd-x{position:absolute;top:10px;right:12px;background:0;border:0;color:var(--text-dim,#7c8aa0);font-size:20px;cursor:pointer;padding:4px 8px}" +
    "#pqDaftar .pqd-pill{display:flex;align-items:center;gap:7px;font-size:11px;padding:7px 10px;border-radius:9px;border:1px solid var(--line,#1e2938);margin-bottom:6px;background:#ffffff08}" +
    "#pqDaftar .pqd-bar{display:flex;gap:4px;margin-top:6px}#pqDaftar .pqd-bar i{flex:1;height:5px;border-radius:3px;background:#ffffff1a}" +
    "#pqDaftar .pqd-chk{display:flex;gap:9px;align-items:flex-start;margin-top:13px;font-size:12px;line-height:1.5;color:var(--text,#e6edf5);text-transform:none;letter-spacing:0;font-weight:400}#pqDaftar .pqd-chk input{margin-top:3px;flex:none;accent-color:#22d3ee}" +
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
      '<p class="pqd-sub">Isi data dengan benar. Akun aktif setelah <b>disetujui admin</b>; data yang lengkap &amp; email instansi mempercepat persetujuan.</p>' +
      '<div id="pqdStatus">' + pill(null, "Menghubungi server…") + "</div>" +
      '<button type="button" class="pqd-btn sec" id="pqdGoogle" style="margin-top:6px;background:#fff;color:#1f1f1f;border-color:#dadce0"><svg viewBox="0 0 48 48" width="17" height="17"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Daftar dengan Google</button>' +
      '<div style="display:flex;align-items:center;gap:10px;margin:12px 0 0;color:var(--text-dim,#7c8aa0);font-size:11px"><span style="flex:1;height:1px;background:var(--line,#1e2938)"></span>atau isi formulir<span style="flex:1;height:1px;background:var(--line,#1e2938)"></span></div>' +
      '<form id="pqdForm" autocomplete="on" novalidate>' +
      '<label for="pqdNama">Nama lengkap</label><input type="text" id="pqdNama" autocomplete="name" maxlength="80" placeholder="Nama sesuai identitas"><div class="pqd-hint" id="hNama"></div>' +
      '<label for="pqdInst">Instansi / perusahaan</label><input type="text" id="pqdInst" list="pqdInstList" maxlength="100" placeholder="mis. BBPJN Jateng-DIY, Dinas PUPR, Konsultan…"><datalist id="pqdInstList"><option value="BBPJN Jateng-DIY"><option value="Satker PJN Wilayah"><option value="Dinas PUPR Provinsi"><option value="Dinas PUPR Kabupaten/Kota"><option value="Konsultan Pengawas"><option value="Kontraktor"><option value="Mahasiswa / Peneliti"></datalist><div class="pqd-hint" id="hInst"></div>' +
      '<label for="pqdHp">No. WhatsApp <small>(untuk konfirmasi admin)</small></label><input type="tel" id="pqdHp" autocomplete="tel" inputmode="tel" maxlength="18" placeholder="08xxxxxxxxxx"><div class="pqd-hint" id="hHp"></div>' +
      '<label for="pqdEmail">Email</label><input type="email" id="pqdEmail" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="120" placeholder="nama@instansi.go.id"><div class="pqd-hint" id="hEmail"></div>' +
      '<label for="pqdPw">Password</label><div style="position:relative"><input type="password" id="pqdPw" autocomplete="new-password" maxlength="72" placeholder="Minimal 8 karakter" style="padding-right:40px"><button type="button" class="pqd-eye" id="pqdEye" aria-label="Lihat password"><i class="fa-solid fa-eye"></i></button></div><div class="pqd-bar" id="pqdBar"><i></i><i></i><i></i><i></i></div><div class="pqd-hint" id="hPw"></div>' +
      '<label for="pqdPw2">Ulangi password</label><input type="password" id="pqdPw2" autocomplete="new-password" maxlength="72" placeholder="Ketik ulang password"><div class="pqd-hint" id="hPw2"></div>' +
      '<label for="pqdTuj">Keperluan akses <small>(opsional)</small></label><textarea id="pqdTuj" rows="2" maxlength="240" placeholder="mis. surveyor ruas Cilacap, pengawas paket…"></textarea>' +
      '<input type="text" id="pqdWeb" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">' +
      '<label class="pqd-chk" for="pqdOk"><input type="checkbox" id="pqdOk"> <span>Saya mengerti akun baru aktif setelah disetujui admin dan data di atas benar.</span></label>' +
      '<div class="pqd-hint err" id="pqdMsg" style="margin-top:10px;font-size:12px"></div>' +
      '<button type="submit" class="pqd-btn" id="pqdGo" disabled><i class="fa-solid fa-paper-plane"></i> <span>Kirim Pendaftaran</span></button>' +
      '<button type="button" class="pqd-btn sec" id="pqdBack">Sudah punya akun? Masuk</button></form>';
  }

  function hint(id, txt, kind) { var h = $(id); if (!h) return; h.textContent = txt || ""; h.className = "pqd-hint" + (kind ? " " + kind : ""); }
  function mark(id, kind) { var i = $(id); if (i) i.className = kind || ""; }

  function cek(tampilkan) {
    var nama = $("pqdNama").value.trim(), inst = $("pqdInst").value.trim(), hp = $("pqdHp").value.trim(), em = $("pqdEmail").value.trim().toLowerCase();
    var pw = $("pqdPw").value, pw2 = $("pqdPw2").value, ok = $("pqdOk").checked, valid = true;
    var tN = nama.length >= 3, tI = inst.length >= 3, hpN = normHp(hp), tE = emailOk(em), k = kekuatan(pw, em, nama), tP = pw.length >= 8 && k.skor >= 2 && !k.umum, tP2 = pw2 && pw === pw2;
    var tmp = [tN, tI, !!hpN, tE, tP, !!tP2, ok];
    tmp.forEach(function (x) { if (!x) valid = false; });

    if (nama) { mark("pqdNama", tN ? "good" : "bad"); hint("hNama", tN ? (nama.indexOf(" ") > 0 ? "" : "Disarankan nama lengkap (lebih dari satu kata).") : "Nama terlalu pendek.", tN ? "" : "err"); } else hint("hNama", "");
    if (inst) { mark("pqdInst", tI ? "good" : "bad"); hint("hInst", tI ? "" : "Isi nama instansi / perusahaan.", tI ? "" : "err"); } else hint("hInst", "");
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
    return { valid: valid, nama: nama, inst: inst, hp: hpN, em: em, pw: pw, tuj: $("pqdTuj").value.trim() };
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
    ["pqdNama", "pqdInst", "pqdHp", "pqdEmail", "pqdPw", "pqdPw2", "pqdTuj", "pqdOk"].forEach(function (id) {
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
        body: JSON.stringify({ email: d.em, password: d.pw, data: { nama: d.nama, instansi: d.inst, hp: d.hp, tujuan: d.tuj } })
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
      var info = { em: d.em, nama: d.nama, ts: Date.now(), konfirmasi: !j.access_token };
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

  function waLink(info, d) {
    if (!ADMIN_WA) return "";
    var t = "Halo Admin PETAQU, saya baru mendaftar.\nNama: " + info.nama + "\nInstansi: " + (d && d.inst || "-") + "\nEmail: " + info.em + "\nMohon disetujui. Terima kasih.";
    return "https://wa.me/" + ADMIN_WA + "?text=" + encodeURIComponent(t);
  }

  function sukses(info, d) {
    var wa = waLink(info, d);
    box.innerHTML = '<button class="pqd-x" type="button" id="pqdX2" aria-label="Tutup">×</button>' +
      '<div style="text-align:center;margin:4px 0 10px"><div style="width:58px;height:58px;margin:0 auto 10px;border-radius:50%;background:#34d39922;border:1px solid #34d39988;display:flex;align-items:center;justify-content:center;font-size:24px;color:#34d399"><i class="fa-solid fa-check"></i></div>' +
      "<h3>Pendaftaran terkirim</h3><p class=\"pqd-sub\" style=\"margin:4px 0 0\">" + esc(mask(info.em)) + "</p></div>" +
      (info.konfirmasi ? '<div class="pqd-step"><b>1</b><div><b style="all:unset;font-weight:700">Konfirmasi email.</b> Buka email dari PETAQU lalu ketuk tautannya (cek folder Spam).</div></div>' : "") +
      '<div class="pqd-step"><b>' + (info.konfirmasi ? "2" : "1") + '</b><div><b style="all:unset;font-weight:700">Menunggu admin.</b> Admin meninjau data Anda. Kabari admin lewat WhatsApp agar lebih cepat.</div></div>' +
      '<div class="pqd-step"><b>' + (info.konfirmasi ? "3" : "2") + '</b><div><b style="all:unset;font-weight:700">Masuk.</b> Setelah disetujui, masuk lewat <i>Masuk dengan email / username</i> memakai email &amp; password tadi.</div></div>' +
      (wa ? '<a class="pqd-btn" style="text-decoration:none;background:#16a34a" target="_blank" rel="noopener" href="' + wa + '"><i class="fa-brands fa-whatsapp"></i> Hubungi admin via WhatsApp</a>' : "") +
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
      wait = '<div class="pqd-wait"><i class="fa-solid fa-hourglass-half"></i> Pendaftaran <b>' + esc(mask(info.em)) + '</b> menunggu persetujuan admin. Setelah disetujui, masuk dengan email + password. <a id="pqdClear">Hapus pengingat</a></div>';
    }
    w.innerHTML = wait + '<button type="button" class="pqd-open" id="pqdOpen"><i class="fa-solid fa-user-plus"></i><span>Daftar Akun Baru</span></button>';
    $("pqdOpen").onclick = bukaForm;
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
