/* PETAQU — Uji coba gratis 10 menit (Gmail WAJIB dipilih lewat Google, tidak bisa diketik).
   Aturan: 1 akun Gmail ATAU 1 perangkat hanya boleh sekali, tidak dapat diulang.
   Alur:
     1. Tombol "Coba Gratis 10 Menit" -> "Lanjut dengan Google" -> pilih akun Gmail di layar Google (terverifikasi).
     2. Saat kembali ke aplikasi, token Google dipakai SEKALI untuk klaim uji coba ke Supabase (RPC claim_trial_g,
        email dibaca server dari token, bukan dari input), lalu langsung keluar. Tidak ada sesi login/akses penuh.
     3. Waktu dihitung jam SERVER (supabase-trial.sql). Di perangkat: localStorage + cookie + IndexedDB + Cache Storage.
     4. Habis waktu -> layar login muncul lagi; tombol terkunci selamanya untuk Gmail/perangkat itu.
   Bila SQL belum dipasang: tetap memakai Gmail terverifikasi Google, tetapi pembatasan hanya per perangkat (tanpa server). */
(function () {
  "use strict";
  if (window.__pqTrial) return;
  window.__pqTrial = 1;

  var DUR = 600000;                     /* 10 menit */
  var K = "pq_trial", AUTHK = "peta_auth_ok", FLAG = "pq_trial_oauth";
  var $ = function (id) { return document.getElementById(id); };
  var iv = 0, last = 0, ticks = 0, badge = null;

  /* ---------- penyimpanan ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* abaikan */ } }
  function ckGet(k) { var m = document.cookie.match(new RegExp("(?:^|; )" + k + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : null; }
  function ckSet(k, v) { try { document.cookie = k + "=" + encodeURIComponent(v) + ";max-age=63072000;path=/;SameSite=Lax"; } catch (e) { /* abaikan */ } }
  function rec() { try { return JSON.parse(lsGet(K)); } catch (e) { return null; } }
  function save(r) { lsSet(K, JSON.stringify(r)); if (r.done) ckSet("pq_trd", "1"); }
  function usedBefore() { var r = rec(); return !!((r && r.done) || ckGet("pq_trd") === "1" || +lsGet("pq_tstart") || +ckGet("pq_tstart")); }

  function idbOpen() {
    return new Promise(function (res, rej) {
      try {
        var q = indexedDB.open("pq_trial_db", 1);
        q.onupgradeneeded = function () { q.result.createObjectStore("k"); };
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { rej(); };
      } catch (e) { rej(); }
    });
  }
  async function idbGet() {
    try {
      var db = await idbOpen();
      return await new Promise(function (res) { var g = db.transaction("k").objectStore("k").get("start"); g.onsuccess = function () { res(g.result); }; g.onerror = function () { res(null); }; });
    } catch (e) { return null; }
  }
  async function idbSet(v) { try { var db = await idbOpen(); db.transaction("k", "readwrite").objectStore("k").put(v, "start"); } catch (e) { /* abaikan */ } }
  async function cacheGet() { try { var c = await caches.open("pq-trial"); var r = await c.match("/__pq_trial_start"); return r ? +(await r.text()) : null; } catch (e) { return null; } }
  async function cacheSet(v) { try { var c = await caches.open("pq-trial"); await c.put("/__pq_trial_start", new Response(String(v))); } catch (e) { /* abaikan */ } }
  async function setMark(ms) { lsSet("pq_tstart", String(ms)); ckSet("pq_tstart", String(ms)); await Promise.all([idbSet(ms), cacheSet(ms)]); }
  async function recover() {   /* catatan utama hilang tetapi penanda masih ada -> pulihkan, tetap terhitung terpakai */
    var c = [+lsGet("pq_tstart"), +ckGet("pq_tstart"), await idbGet(), await cacheGet()].filter(function (n) { return n > 1e12 && n <= Date.now() + 864e5; });
    if (!c.length) return;
    var m = Math.min.apply(null, c);
    setMark(m);
    if (!rec()) {
      var end = m + DUR;
      save({ did: deviceId(), email: "", end: end, used: Math.max(0, Math.min(DUR, Date.now() - m)), done: Date.now() >= end, local: true });
    }
  }

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
  function normGmail(e) {
    var m = /^([a-z0-9._+-]+)@(gmail|googlemail)\.com$/.exec((e || "").trim().toLowerCase());
    if (!m) return null;
    var l = m[1].split("+")[0].replace(/\./g, "");
    return l.length >= 6 ? l + "@gmail.com" : null;
  }

  /* ---------- server ---------- */
  async function rpc(fn, body, tok) {
    var c = window.PETAQU_CFG;
    if (!c) throw { code: "nocfg" };
    var r = await fetch(c.url + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { apikey: c.anon, Authorization: "Bearer " + (tok || c.anon), "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (r.status === 404) throw { code: "nosql" };
    if (!r.ok) {
      var tx = ""; try { tx = (await r.text()).slice(0, 160); } catch (e) { /* abaikan */ }
      throw { code: "http", status: r.status, msg: tx };
    }
    return r.json();
  }
  function signOut(tok) {   /* token Google hanya dipakai sekali; jangan simpan sesi apa pun */
    var c = window.PETAQU_CFG;
    if (!c || !tok) return;
    try { fetch(c.url + "/auth/v1/logout?scope=local", { method: "POST", headers: { apikey: c.anon, Authorization: "Bearer " + tok } }).catch(function () { }); } catch (e) { /* abaikan */ }
  }

  /* ---------- tangkap hasil login Google SEBELUM modul login biasa membacanya ---------- */
  var oauth = (function () {
    var pend = +lsGet(FLAG);
    if (!pend) return null;
    var h = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
    var tok = h.get("access_token"), err = h.get("error_description") || q.get("error_description");
    if (Date.now() - pend > 6e5 || (!tok && !err)) { lsDel(FLAG); return null; }   /* kedaluwarsa / dibatalkan */
    lsDel(FLAG);
    try { history.replaceState(null, "", location.pathname); } catch (e) { /* abaikan */ }
    return { tok: tok, err: err };
  })();

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
    b.disabled = true; b.style.opacity = ".55"; b.style.cursor = "not-allowed";
    b.querySelector("span").textContent = txt || "Uji coba sudah digunakan";
    var f = $("pqTrialForm"); if (f) f.style.display = "none";
  }
  function formMsg(m, ok) {
    var f = $("pqTrialForm"); if (f && m) f.style.display = "";
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
  async function verify(r) {
    if (r.local || navigator.onLine === false) return;
    try {
      var d = await rpc("trial_status", { p_device: r.did });
      if (d && d.reason === "expired") return finish(r);
      if (d && d.ok && typeof d.remaining === "number") { r.end = Math.min(r.end, Date.now() + d.remaining * 1000); save(r); }
    } catch (e) { /* offline / server bermasalah: lanjut hitungan lokal */ }
  }
  function run(r) {
    stop();
    showBadge();
    last = performance.now(); ticks = 0;
    var tick = function () {
      if (lsGet(AUTHK) === "1") { stop(); return; }
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
  function begin(r, msg) {
    save(r);
    setMark(r.end - DUR);
    formMsg("");
    hideLogin();
    run(r);
    T(msg || "Uji coba gratis dimulai: 10 menit");
  }

  /* ---------- Gmail dipilih lewat Google ---------- */
  function keGoogle() {
    var c = window.PETAQU_CFG;
    if (usedBefore()) { lockButton(); return formMsg("Perangkat/browser ini sudah pernah memakai uji coba (termasuk saat pengetesan) dan tidak dapat diulang."); }
    if (!c) return formMsg("Login Google belum dikonfigurasi.");
    if (navigator.onLine === false) return formMsg("Butuh koneksi internet untuk memilih akun Google.");
    deviceId();
    lsSet(FLAG, String(Date.now()));
    location.href = c.url + "/auth/v1/authorize?provider=google&prompt=select_account&redirect_to=" + encodeURIComponent(location.origin + location.pathname);
  }
  async function selesaiGoogle(o) {
    formMsg("Memverifikasi akun Google...", true);
    if (!o.tok) {
      return formMsg(/banned/i.test(o.err || "") ? "Uji coba gratis untuk akun ini sudah berakhir. Hubungi admin untuk berlangganan." : /signup|not allowed|database error/i.test(o.err || "")
        ? "Pendaftaran akun baru belum diizinkan di Supabase (Authentication > Sign In / Providers > Allow new users to sign up). [" + String(o.err).slice(0, 90) + "]"
        : "Login Google dibatalkan atau gagal: " + String(o.err || "tanpa keterangan").slice(0, 120));
    }
    var c = window.PETAQU_CFG, tok = o.tok, email = null;
    try {
      var r = await fetch(c.url + "/auth/v1/user", { headers: { apikey: c.anon, Authorization: "Bearer " + tok } });
      if (!r.ok) throw 0;
      email = normGmail((await r.json()).email);
    } catch (e) { signOut(tok); return formMsg("Verifikasi Google gagal, coba lagi."); }
    if (!email) { signOut(tok); return formMsg("Gunakan akun Gmail (@gmail.com) untuk uji coba."); }
    if (usedBefore()) { signOut(tok); lockButton(); return formMsg("Perangkat/browser ini sudah pernah memakai uji coba (termasuk saat pengetesan) dan tidak dapat diulang."); }
    var did = deviceId();
    try {
      var d = await rpc("claim_trial_g", { p_device: did, p_fp: await fingerprint() }, tok);
      signOut(tok);
      if (!d || !d.ok) {
        if (d && d.reason === "expired") { save({ did: did, email: email, end: 0, used: DUR, done: true }); lockButton("Uji coba telah berakhir"); return formMsg("Uji coba perangkat ini sudah berakhir."); }
        if (d && d.reason === "bad_email") return formMsg("Gunakan akun Gmail (@gmail.com) untuk uji coba.");
        if (d && d.reason === "used") return formMsg("Uji coba gratis sudah pernah digunakan oleh Gmail atau perangkat ini dan tidak dapat diulang.");
        return formMsg("Server menolak klaim uji coba (alasan: " + ((d && d.reason) || "tidak diketahui") + ").");
      }
      begin({ did: did, email: email, end: Date.now() + d.remaining * 1000, used: DUR - d.remaining * 1000, done: false }, "Uji coba gratis dimulai: " + Math.round(d.remaining / 60) + " menit");
    } catch (e) {
      signOut(tok);
      if (e && e.code === "nosql") {   /* SQL belum dipasang: Gmail tetap terverifikasi, batas per perangkat */
        return begin({ did: did, email: email, end: Date.now() + DUR, used: 0, done: false, local: true });
      }
      formMsg(navigator.onLine === false ? "Tidak ada koneksi internet."
        : e && e.status ? "Server menolak (kode " + e.status + "): " + (e.msg || "tanpa keterangan")
        : "Server tidak dapat dihubungi, coba lagi.");
    }
  }

  /* ---------- tombol di layar login ---------- */
  function inject() {
    var g = $("loginGoogle");
    if (!g || $("pqTrial")) return;
    var w = document.createElement("div");
    w.id = "pqTrial";
    w.style.marginTop = "12px";
    w.innerHTML =
      '<button type="button" id="pqTrialBtn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:9px;padding:11px;border-radius:9px;border:1px solid var(--cyan);background:transparent;color:var(--cyan);font-size:14px;font-weight:700;cursor:pointer"><i class="fa-solid fa-gift"></i><span>Coba Gratis 10 Menit</span></button>' +
      '<div id="pqTrialForm" style="display:none;margin-top:10px">' +
      '<button type="button" class="login-btn" id="pqTrialGo"><i class="fa-brands fa-google"></i> <span>Pilih Gmail dengan Google</span></button>' +
      '<div id="pqTrialMsg" style="display:none;margin-top:8px;font-size:12px;line-height:1.5"></div>' +
      '<p style="font-size:11px;color:var(--text-dim);margin:8px 0 0;line-height:1.5">Gratis 10 menit untuk 1 akun Gmail atau 1 perangkat. Tidak dapat diulang. Gmail dipilih lewat Google, tidak bisa diketik.</p>' +
      '</div>';
    g.parentNode.insertBefore(w, g.nextSibling);
    $("pqTrialBtn").addEventListener("click", function () { var f = $("pqTrialForm"); f.style.display = f.style.display === "none" ? "" : "none"; });
    $("pqTrialGo").addEventListener("click", keGoogle);
    g.addEventListener("click", function () { lsDel(FLAG); }, true);   /* login Google biasa tidak boleh dianggap uji coba */
    if (usedBefore()) lockButton();

    /* kolom Email/OTP disembunyikan (index.html). Akses: Google (terverifikasi) atau Username untuk akun admin */
    if (!$("pqLoginAlt")) {
      var a = document.createElement("div");
      a.id = "pqLoginAlt";
      a.innerHTML = '<button type="button" id="pqLoginAltBtn">Masuk dengan username</button>';
      w.parentNode.insertBefore(a, w.nextSibling);
      var u = false, ab = $("pqLoginAltBtn");
      ab.addEventListener("click", function () {
        u = !u;
        var t = $(u ? "tabUser" : "tabEmail");
        if (t) t.click();
        w.style.display = u ? "none" : "";
        ab.textContent = u ? "\u2190 Kembali, masuk dengan Google" : "Masuk dengan username";
      });
    }
  }

  async function start() {
    if (lsGet(AUTHK) === "1") return;
    await recover();
    inject();
    var r = rec();
    if (oauth) { await selesaiGoogle(oauth); return; }
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
