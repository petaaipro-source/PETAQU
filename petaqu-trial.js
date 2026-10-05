/* PETAQU — Uji coba gratis 10 menit, TANPA Supabase / server / login.
   Murni di perangkat: satu klik langsung mulai. 1 perangkat/browser hanya boleh sekali.
   Penanda disimpan berlapis (localStorage + cookie + IndexedDB + Cache Storage) agar tidak mudah diulang.
   Catatan: karena tanpa server, pembatasan bisa dilewati dengan membersihkan seluruh data browser / mode penyamaran. */
(function () {
  "use strict";
  if (window.__pqTrial) return;
  window.__pqTrial = 1;

  var DUR = 600000;                     /* 10 menit */
  var K = "pq_trial", AUTHK = "peta_auth_ok";
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

  /* ---------- mulai uji coba (lokal) ---------- */
  function mulai() {
    if (usedBefore()) { lockButton(); return formMsg("Perangkat/browser ini sudah pernah memakai uji coba dan tidak dapat diulang."); }
    var did = deviceId();
    begin({ did: did, email: "", end: Date.now() + DUR, used: 0, done: false, local: true }, "Uji coba gratis dimulai: 10 menit");
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
      '<div id="pqTrialForm" style="margin-top:8px">' +
      '<div id="pqTrialMsg" style="display:none;font-size:12px;line-height:1.5"></div>' +
      '<p style="font-size:11px;color:var(--text-dim);margin:6px 0 0;line-height:1.5">Gratis 10 menit, tanpa login. Hanya sekali per perangkat.</p>' +
      '</div>';
    g.parentNode.insertBefore(w, g.nextSibling);
    $("pqTrialBtn").addEventListener("click", mulai);
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
    if (r && !r.done) {
      if (remaining(r) <= 0) return finish(r);
      hideLogin();
      run(r);
    }
  }
  function boot() { setTimeout(start, 60); setTimeout(function () { if (!$("pqTrial")) inject(); }, 800); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
