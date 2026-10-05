/* PETAQU — Uji coba gratis 10 menit.
   Aturan: 1 akun Gmail ATAU 1 perangkat hanya boleh sekali, tidak dapat diulang.
   Cara kerja:
     • Tombol "Coba Gratis 10 Menit" di layar login -> isi Gmail -> klaim ke Supabase (RPC claim_trial).
     • Server (supabase-trial.sql) menyimpan Gmail (dinormalisasi: titik & +alias dibuang), ID perangkat, dan sidik perangkat.
       Waktu dihitung dengan jam SERVER, jadi mengubah jam HP/komputer tidak memperpanjang uji coba.
     • Di perangkat: status disimpan di localStorage + cookie, dan waktu pakai dihitung ganda (jam dinding + penghitung aktif)
       agar tetap berlaku saat offline / jam diubah. Setiap 60 dtk dicocokkan lagi ke server bila online.
     • Habis waktu -> layar login muncul lagi; tombol uji coba terkunci selamanya untuk Gmail/perangkat itu.
     • Login resmi (OTP / Google / username) tidak terpengaruh dan otomatis menghentikan uji coba.
   Hemat kuota: hanya 1 panggilan saat mulai + 1 panggilan kecil per menit (RPC ringan, tanpa tabel dibaca langsung). */
(function () {
  "use strict";
  if (window.__pqTrial) return;
  window.__pqTrial = 1;

  var DUR = 600000;                     /* 10 menit */
  var K = "pq_trial", AUTHK = "peta_auth_ok";
  var $ = function (id) { return document.getElementById(id); };
  var iv = 0, last = 0, ticks = 0, badge = null;

  /* ---------- penyimpanan ganda ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }
  function ckGet(k) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + k + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function ckSet(k, v) { try { document.cookie = k + "=" + encodeURIComponent(v) + ";max-age=63072000;path=/;SameSite=Lax"; } catch (e) { /* abaikan */ } }
  function rec() { try { return JSON.parse(lsGet(K)); } catch (e) { return null; } }
  function save(r) { lsSet(K, JSON.stringify(r)); if (r.done) ckSet("pq_trd", "1"); }
  function usedBefore() { var r = rec(); return !!((r && r.done) || ckGet("pq_trd") === "1"); }

  function deviceId() {
    var v = lsGet("pq_did") || ckGet("pq_did");
    if (!v || v.length < 16) {
      var a = new Uint8Array(16);
      (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); });
      v = Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    }
    lsSet("pq_did", v); ckSet("pq_did", v);
    return v;
  }

  /* ---------- sidik perangkat ---------- */
  function weakHash(s) {
    var h1 = 5381, h2 = 52711, i, c;
    for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); h1 = ((h1 << 5) + h1) ^ c; h2 = ((h2 << 5) + h2 + c) | 0; }
    var x = (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
    return (x + x + x).slice(0, 32);
  }
  async function fingerprint() {
    var p = [navigator.userAgent, navigator.language, navigator.platform, screen.width + "x" + screen.height + "x" + screen.colorDepth,
      window.devicePixelRatio, (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone, navigator.hardwareConcurrency || 0,
      navigator.deviceMemory || 0, navigator.maxTouchPoints || 0];
    try {
      var c = document.createElement("canvas"); c.width = 200; c.height = 40;
      var x = c.getContext("2d"); x.textBaseline = "top"; x.font = "14px Arial";
      x.fillStyle = "#f60"; x.fillRect(10, 5, 80, 20); x.fillStyle = "#069"; x.fillText("PETAQU fp 1.0", 4, 12);
      p.push(c.toDataURL().slice(-120));
      var g = document.createElement("canvas").getContext("webgl");
      var e = g && g.getExtension("WEBGL_debug_renderer_info");
      if (e) p.push(g.getParameter(e.UNMASKED_RENDERER_WEBGL));
    } catch (e) { /* abaikan */ }
    var s = p.join("|");
    try {
      if (crypto.subtle) {
        var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
        return Array.prototype.map.call(new Uint8Array(d), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      }
    } catch (e) { /* pakai cadangan */ }
    return weakHash(s);
  }

  /* ---------- Gmail ---------- */
  function normGmail(e) {
    var m = /^([a-z0-9._+-]+)@(gmail|googlemail)\.com$/.exec((e || "").trim().toLowerCase());
    if (!m) return null;
    var l = m[1].split("+")[0].replace(/\./g, "");
    return l.length >= 6 ? l + "@gmail.com" : null;
  }

  /* ---------- server ---------- */
  async function rpc(fn, body) {
    var c = window.PETAQU_CFG;
    if (!c) throw { code: "nocfg" };
    var r = await fetch(c.url + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { apikey: c.anon, Authorization: "Bearer " + c.anon, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (r.status === 404) throw { code: "nosql" };
    if (!r.ok) throw { code: "http" };
    return r.json();
  }

  /* ---------- tampilan ---------- */
  function T(m, e) { try { toast(m, !!e); } catch (x) { /* abaikan */ } }
  function hideLogin() {
    var s = $("loginScreen");
    if (s) s.classList.add("hide");
    try {
      typeof toggleSidebarCollapse === "function" ? toggleSidebarCollapse(true) : document.body.classList.add("sidebar-collapsed");
      typeof toggleSidebar === "function" && toggleSidebar(false);
    } catch (e) { /* abaikan */ }
    setTimeout(function () { try { window.map && (map.invalidateSize({ pan: false }), typeof fitAllBounds === "function" && fitAllBounds()); } catch (e) { /* abaikan */ } }, 80);
  }
  function showBadge() {
    if (badge) return;
    var st = document.createElement("style");
    st.textContent = "#pqTrialBadge{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:4900;display:flex;align-items:center;gap:7px;padding:6px 14px;border-radius:20px;background:#0f1521f2;border:1px solid #22d3ee;color:#e6f1ff;font:700 12px/1 system-ui,sans-serif;box-shadow:0 4px 16px #0008;pointer-events:none;white-space:nowrap}#pqTrialBadge b{font-variant-numeric:tabular-nums;color:#22d3ee}#pqTrialBadge.low{border-color:#f87171}#pqTrialBadge.low b{color:#f87171}";
    document.head.appendChild(st);
    badge = document.createElement("div");
    badge.id = "pqTrialBadge";
    badge.innerHTML = '<i class="fa-solid fa-gift"></i> Uji coba gratis <b>10:00</b>';
    document.body.appendChild(badge);
  }
  function setBadge(ms) {
    if (!badge) return;
    var s = Math.max(0, Math.ceil(ms / 1000));
    badge.querySelector("b").textContent = ("0" + Math.floor(s / 60)).slice(-2) + ":" + ("0" + (s % 60)).slice(-2);
    badge.classList.toggle("low", s <= 60);
  }
  function lockButton(txt) {
    var b = $("pqTrialBtn");
    if (!b) return;
    b.disabled = true;
    b.style.opacity = ".55"; b.style.cursor = "not-allowed";
    b.querySelector("span").textContent = txt || "Uji coba sudah digunakan";
    var f = $("pqTrialForm"); if (f) f.style.display = "none";
  }
  function formMsg(m, ok) {
    var e = $("pqTrialMsg");
    if (!e) return;
    e.textContent = m || "";
    e.style.color = ok ? "var(--cyan)" : "#f87171";
    e.style.display = m ? "" : "none";
  }

  /* ---------- hitung mundur ---------- */
  function remaining(r) { return Math.min(r.end - Date.now(), DUR - (r.used || 0)); }
  function stop() { clearInterval(iv); iv = 0; if (badge) { badge.remove(); badge = null; } }
  function finish(r) {
    stop();
    r = r || rec() || {};
    r.done = true; r.used = DUR;
    save(r);
    var s = $("loginScreen");
    if (s && lsGet(AUTHK) !== "1") {
      s.classList.remove("hide");
      var e = $("loginError");
      if (e) { e.querySelector("span").textContent = "Uji coba gratis 10 menit telah berakhir. Hubungi admin untuk akses penuh."; e.style.color = ""; e.classList.add("show"); }
    }
    lockButton("Uji coba telah berakhir");
    T("Uji coba gratis berakhir", true);
  }
  async function verify(r) {   /* cocokkan dengan jam server bila online */
    if (navigator.onLine === false) return;
    try {
      var d = await rpc("trial_status", { p_device: r.did });
      if (d && d.reason === "expired") return finish(r);
      if (d && d.ok && typeof d.remaining === "number") {
        r.end = Math.min(r.end, Date.now() + d.remaining * 1000);
        save(r);
      }
    } catch (e) { /* offline / server bermasalah: lanjut dengan hitungan lokal */ }
  }
  function run(r) {
    stop();
    showBadge();
    last = performance.now(); ticks = 0;
    var tick = function () {
      if (lsGet(AUTHK) === "1") { stop(); return; }          /* login resmi -> uji coba tidak perlu lagi */
      var n = performance.now(), dt = n - last; last = n;
      r.used = (r.used || 0) + Math.min(Math.max(dt, 0), 3000);
      var rem = remaining(r);
      setBadge(rem);
      if (rem <= 0) return finish(r);
      if (++ticks % 5 === 0) save(r);
      if (ticks % 60 === 0) verify(r);
    };
    iv = setInterval(tick, 1000);
    tick();
  }

  /* ---------- mulai uji coba ---------- */
  async function mulai() {
    var go = $("pqTrialGo"), inp = $("pqTrialMail");
    if (usedBefore()) { lockButton(); return; }
    var email = normGmail(inp.value);
    if (!email) return formMsg("Masukkan alamat Gmail yang valid (nama@gmail.com).");
    if (navigator.onLine === false) return formMsg("Butuh koneksi internet untuk memulai uji coba.");
    go.disabled = true; formMsg("Memeriksa kelayakan...", true);
    try {
      var did = deviceId();
      var d = await rpc("claim_trial", { p_email: email, p_device: did, p_fp: await fingerprint() });
      if (!d || !d.ok) {
        if (d && d.reason === "expired") { save({ did: did, email: email, end: 0, used: DUR, done: true }); lockButton("Uji coba telah berakhir"); return formMsg("Uji coba perangkat ini sudah berakhir."); }
        if (d && d.reason === "bad_email") return formMsg("Gmail tidak valid.");
        return formMsg("Uji coba gratis sudah pernah digunakan oleh Gmail atau perangkat ini dan tidak dapat diulang.");
      }
      var r = { did: did, email: email, end: Date.now() + d.remaining * 1000, used: DUR - d.remaining * 1000, done: false };
      save(r);
      formMsg("");
      hideLogin();
      run(r);
      T("Uji coba gratis dimulai: " + Math.round(d.remaining / 60) + " menit");
    } catch (e) {
      formMsg(e && e.code === "nosql" ? "Fitur uji coba belum diaktifkan di server (jalankan supabase-trial.sql)."
        : navigator.onLine === false ? "Tidak ada koneksi internet." : "Server tidak dapat dihubungi, coba lagi.");
    } finally { go.disabled = false; }
  }

  /* ---------- sisipkan tombol di layar login ---------- */
  function inject() {
    var g = $("loginGoogle");
    if (!g || $("pqTrial")) return;
    var w = document.createElement("div");
    w.id = "pqTrial";
    w.style.marginTop = "12px";
    w.innerHTML =
      '<button type="button" id="pqTrialBtn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:9px;padding:11px;border-radius:9px;border:1px solid var(--cyan);background:transparent;color:var(--cyan);font-size:14px;font-weight:700;cursor:pointer"><i class="fa-solid fa-gift"></i><span>Coba Gratis 10 Menit</span></button>' +
      '<div id="pqTrialForm" style="display:none;margin-top:10px">' +
      '<div class="login-field"><label for="pqTrialMail">Gmail untuk uji coba</label><div class="login-input-wrap"><i class="fa-brands fa-google"></i> <input type="email" id="pqTrialMail" placeholder="nama@gmail.com" autocomplete="email" autocapitalize="none" spellcheck="false"></div></div>' +
      '<button type="button" class="login-btn" id="pqTrialGo"><i class="fa-solid fa-play"></i> <span>Mulai uji coba</span></button>' +
      '<div id="pqTrialMsg" style="display:none;margin-top:8px;font-size:12px;line-height:1.45"></div>' +
      '<p style="font-size:11px;color:var(--text-dim);margin:8px 0 0;line-height:1.5">Gratis 10 menit untuk 1 akun Gmail atau 1 perangkat. Tidak dapat diulang. Butuh internet saat memulai.</p>' +
      '</div>';
    g.parentNode.insertBefore(w, g.nextSibling);
    $("pqTrialBtn").addEventListener("click", function () {
      var f = $("pqTrialForm");
      f.style.display = f.style.display === "none" ? "" : "none";
      if (f.style.display === "") $("pqTrialMail").focus();
    });
    $("pqTrialGo").addEventListener("click", mulai);
    $("pqTrialMail").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); mulai(); } });
    if (usedBefore()) lockButton();
  }

  function start() {
    if (lsGet(AUTHK) === "1") return;      /* sudah login resmi */
    inject();
    var r = rec();
    if (r && !r.done) {
      if (remaining(r) <= 0) return finish(r);
      hideLogin();
      run(r);
      verify(r);
    }
  }
  function boot() { setTimeout(start, 60); setTimeout(function () { if (!$("pqTrial")) inject(); }, 800); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
