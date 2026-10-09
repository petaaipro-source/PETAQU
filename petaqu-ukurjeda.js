/* PETAQU — UKUR JEDA (v1): pengukuran Street View OTOMATIS saat dijeda, FOKUS 3 HAL SAJA:
     1) LEBAR JALAN   2) LEBAR BAHU (kiri/kanan)   3) LEBAR DRAINASE (kiri/kanan)
   Tidak menampilkan hal lain (marka, posisi kendaraan, panjang saluran, dst.).

   Kapan jalan?
     • Animasi rute DIJEDA / digeser lalu berhenti ≥0,8 dtk di satu titik, atau
     • tanpa animasi: Anda berhenti di satu titik Street View LIVE ≥1,3 dtk
       (arah jalan dibaca dari tautan panorama tetangga, bukan dari arah pandang).
     Saat animasi berjalan, modul ini diam (tidak membuang kuota) — HUD Dimensi biasa yang bekerja.

   Cerdas & HEMAT KUOTA (foto Static API = 1 kuota/foto; metadata gratis):
     • ADAPTIF: 1 panorama (2 foto) dulu. Bila keyakinan ≥80% & kedua sisi terbaca → selesai.
       Bila ragu/terhalang (mobil parkir, pohon, bayangan) → tambah panorama tetangga ±10 m,
       lalu ±20 m (maks 3 panorama; tombol "Teliti" sampai 5). Berhenti dini begitu hasilnya konsisten.
     • Gabung banyak sampel dengan MEDIAN (kebal terhadap sampel yang terhalang), hitung sebaran →
       ± ketidakpastian jujur; sampel tidak konsisten → keyakinan diturunkan, bukan disembunyikan.
     • Validasi kewajaran (lebar jalan 2,5–25 m); sisi yang tepinya di luar jangkauan tidak ditebak.
     • Drainase dianggap "ada" hanya bila terdeteksi di ≥ separuh sampel yang valid.
     • Cache per titik (tidak mengukur ulang titik yang sama), batal otomatis bila animasi diputar lagi /
       posisi digeser sebelum selesai; berbagi batas kuota bulanan dengan modul Dimensi (pq_dim_cap).
   Mesin ukur = PQDim.core (fotogrametri bidang-tanah). Ini ESTIMASI foto (tipikal ±0,3–0,8 m), bukan survei alat.
   Kiri/kanan mengikuti ARAH ANIMASI (atau arah jalan terbaca dari tautan panorama). Tidak mengubah fitur lain. */
(function () {
  "use strict";
  if (typeof window !== "undefined" && window.PQJeda) return;

  /* ==================== BAGIAN 1 — PURE (bisa diuji di Node) ==================== */
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function med(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function vals(S, k) { return S.map(function (x) { return x[k]; }).filter(fin); }

  /* hasil CORE.measurePair → satu sampel ringkas (hanya 3 besaran + keyakinan) */
  function toEntry(res, k) {
    if (!res) return null; k = k || 1;
    var L = res.L, R = res.R, okL = L && !L.hitMax, okR = R && !R.hitMax;
    function bahu(S) { return S && !S.hitMax ? (S.bahuPaved + S.bahuLoose) * k : null; }
    function sal(S, ok) { if (!ok) return null; return S.sal && S.salConf >= 0.4 ? S.sal.w * k : 0; }   /* 0 = tidak ada; null = tak diketahui */
    return {
      W: fin(res.W) ? res.W * k : null, bl: bahu(L), br: bahu(R), dl: sal(L, okL), dr: sal(R, okR),
      conf: fin(res.conf) ? res.conf : 0, err: fin(res.err) ? res.err * k : null, okL: !!okL, okR: !!okR
    };
  }

  /* gabungkan sampel → hasil akhir */
  function agg(S) {
    S = (S || []).filter(Boolean); var n = S.length; if (!n) return null;
    var Wv = vals(S, "W").filter(function (w) { return w >= 2.5 && w <= 25; });
    var out = { n: n, W: null, err: null, conf: 0, spread: 0, warn: "", bl: null, br: null, dl: null, dr: null };
    if (Wv.length) {
      var m0 = med(Wv), tol = Math.max(0.8, 0.12 * m0), inl = Wv.filter(function (w) { return Math.abs(w - m0) <= tol; });
      var cs = S.filter(function (x) { return fin(x.W) && x.W >= 2.5 && x.W <= 25; }).map(function (x) { return x.conf; });
      var cf = med(cs) || 0, es = med(vals(S, "err")) || 0.3;
      if (Wv.length >= 3 && inl.length >= Math.ceil(Wv.length * 0.6)) {          /* mayoritas sepakat → buang sampel terhalang */
        out.W = med(inl); out.spread = Math.max.apply(null, inl) - Math.min.apply(null, inl);
        if (inl.length < Wv.length) out.warn = (Wv.length - inl.length) + " sampel menyimpang dibuang (terhalang?)";
        if (out.spread < 0.6) cf = Math.min(1, cf + 0.12);
      } else {
        out.W = m0; out.spread = Wv.length > 1 ? Math.max.apply(null, Wv) - Math.min.apply(null, Wv) : 0;
        if (Wv.length >= 2 && out.spread > tol) { cf *= 0.65; out.warn = "sampel tidak konsisten (sebaran " + out.spread.toFixed(1) + " m) — mungkin terhalang"; }
      }
      out.conf = cf; out.err = Math.max(0.15, es, out.spread / 2);
    } else if (vals(S, "W").length) out.warn = "lebar di luar rentang wajar (2,5–25 m) — tidak dipakai";
    out.bl = med(vals(S, "bl")); out.br = med(vals(S, "br"));
    function dr(key, okKey) {
      var v = vals(S, key); if (!v.length) return null;
      var det = v.filter(function (x) { return x > 0; });
      return det.length >= Math.ceil(v.length / 2) ? med(det) : 0;
    }
    out.dl = dr("dl"); out.dr = dr("dr");
    return out;
  }

  if (typeof module !== "undefined" && module.exports) { module.exports = { agg: agg, toEntry: toEntry, med: med }; }
  if (typeof document === "undefined") return;

  /* ==================== BAGIAN 2 — BROWSER ==================== */
  var K_ON = "pq_jeda_on", K_DB = "pq_jeda_v1", K_Q = "pq_dim_quota", K_CAP = "pq_dim_cap", K_K = "pq_dim_k", K_MIN = "pq_jeda_min";
  function jget(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function $(id) { return document.getElementById(id); }
  function RA() { try { return typeof routeAnim !== "undefined" ? routeAnim : null; } catch (e) { return null; } }
  function svOpen() { var o = $("svOverlay"); return !!(o && o.classList.contains("show")); }
  function toast_(m, err) { try { if (typeof toast === "function") toast(m, !!err); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function meters(a, b) { var r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lng - a.lng) * r, h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) * Math.sin(y / 2); return 12742000 * Math.asin(Math.sqrt(h)); }
  function apiKey() { try { return typeof getApiKey === "function" ? getApiKey() : ""; } catch (e) { return ""; } }
  function CORE() { return window.PQDim && PQDim.core; }
  function offsetPt(c, d) { var r = Math.PI / 180, h = c.rh * r; return { lat: c.lat + d * Math.cos(h) / 111320, lng: c.lng + d * Math.sin(h) / (111320 * Math.cos(c.lat * r)) }; }
  function angDiff(a, b) { var d = Math.abs(((a - b) % 360 + 360) % 360); return d > 180 ? 360 - d : d; }

  var on = jget(K_ON, 1) !== 0, minimized = !!jget(K_MIN, 0);
  var seq = 0, pend = null, cur = null, cache = {}, warnedCore = false, DB = jget(K_DB, []);

  /* ---- kuota (berbagi dengan modul Dimensi) ---- */
  function monthKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1); }
  function quota() { var q = jget(K_Q, null); if (!q || q.m !== monthKey()) q = { m: monthKey(), n: 0 }; return q; }
  function quotaAdd(n) { var q = quota(); q.n += n; jset(K_Q, q); return q; }
  function capOK() { return quota().n + 2 <= jget(K_CAP, 3000); }

  /* ---- foto Street View Static ---- */
  async function meta(lat, lng, radius) {
    var u = "https://maps.googleapis.com/maps/api/streetview/metadata?location=" + lat.toFixed(6) + "," + lng.toFixed(6) + "&radius=" + radius + "&source=outdoor&key=" + encodeURIComponent(apiKey());
    var r = await fetch(u); if (!r.ok) throw new Error("metadata HTTP " + r.status); return r.json();
  }
  function loadImg(url) { return new Promise(function (res, rej) { var im = new Image(); im.crossOrigin = "anonymous"; im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("gagal memuat foto")); }; im.src = url; }); }
  async function svImage(pano, heading) {
    var O = CORE().OPT;
    var u = "https://maps.googleapis.com/maps/api/streetview?size=" + O.size + "x" + O.size + "&pano=" + encodeURIComponent(pano) + "&heading=" + (((heading % 360) + 360) % 360).toFixed(1) + "&pitch=" + O.pitch + "&fov=" + O.fov + "&source=outdoor&return_error_code=true&key=" + encodeURIComponent(apiKey());
    var im = await loadImg(u), cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    var cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(im, 0, 0);
    try { return cx.getImageData(0, 0, cv.width, cv.height); } catch (e) { var er = new Error("cors"); er.cors = true; throw er; }
  }
  async function sample(pano, rh) {
    var k = jget(K_K, 1) || 1, left = await svImage(pano, rh - 90), right = await svImage(pano, rh + 90);
    return toEntry(CORE().measurePair(left, right, CORE().OPT), k);
  }

  /* ---- konteks titik: animasi (dijeda) atau Street View LIVE yang berhenti ---- */
  function liveCtx() {
    try {
      var L = window.PQSvLive; if (!L || !L.ready || !L.ready()) return null;
      var p = L.pano(); if (!p) return null; var pos = p.getPosition(), pov = p.getPov(), links = p.getLinks() || [], rh = pov.heading, best = 999;
      links.forEach(function (l) { var d = angDiff(l.heading, pov.heading); if (d < best) { best = d; rh = l.heading; } });
      return { lat: pos.lat(), lng: pos.lng(), rh: Math.round(rh), pano: p.getPano(), sta: "", name: "", live: true };
    } catch (e) { return null; }
  }

  /* ---- proses pengukuran satu titik ---- */
  async function run(c, deep) {
    var my = ++seq, S = [], seen = {}, offs = [0, 10, -10, 20, -20], maxN = deep ? 5 : 3, A = null;
    cur = { key: c.key, c: c, A: null, busy: true, deep: !!deep, n: 0, note: "" };
    paint();
    try {
      for (var i = 0; i < offs.length && S.length < maxN; i++) {
        if (my !== seq) return;
        var off = offs[i], pano = null;
        if (off === 0 && c.pano) pano = c.pano;
        else {
          var p = off === 0 ? c : offsetPt(c, off), m = await meta(p.lat, p.lng, off === 0 ? 25 : 12);
          if (my !== seq) return;
          if (!m || m.status !== "OK" || !m.pano_id) { if (off === 0) { cur.busy = false; cur.note = "Tidak ada foto Street View di titik ini"; paint(); return; } continue; }
          if (off !== 0 && m.location && meters(p, { lat: m.location.lat, lng: m.location.lng }) > 8) continue;
          pano = m.pano_id;
        }
        if (seen[pano]) continue; seen[pano] = 1;
        if (!capOK()) { cur.note = "Batas kuota foto bulan ini tercapai"; break; }
        quotaAdd(2);
        var e = await sample(pano, c.rh); if (my !== seq) return;
        if (e) S.push(e);
        A = agg(S); cur.A = A; cur.n = S.length; paint();
        if (!deep && A) {
          var sidesOK = A.bl != null && A.br != null;
          if (S.length === 1 && A.W != null && A.conf >= 0.8 && sidesOK) break;
          if (S.length >= 2 && A.W != null && A.spread < 0.5 && A.conf >= 0.7) break;
        }
      }
      if (my !== seq) return;
      cur.busy = false; cur.A = A;
      if (!A) cur.note = cur.note || "Foto tidak terbaca (mungkin gelap / tertutup)";
      else cache[c.key] = A;
      paint();
    } catch (e) {
      if (my !== seq) return;
      cur.busy = false;
      if (e && e.cors) { on = false; jset(K_ON, 0); syncBtn(); cur.note = "Browser memblokir pembacaan foto (CORS) — dimatikan"; toast_(cur.note, true); }
      else cur.note = "Gagal mengukur: " + (e && e.message || e);
      paint();
    }
  }

  /* ---- tampilan ---- */
  function injectCss() {
    if ($("pq-jeda-css")) return;
    var st = document.createElement("style"); st.id = "pq-jeda-css";
    st.textContent =
      "#pqJeda{position:absolute;z-index:6;left:8px;bottom:calc(76px + env(safe-area-inset-bottom,0px));width:min(300px,calc(100% - 16px));box-sizing:border-box;background:#080c14e6;border:1px solid #34d39966;border-radius:14px;padding:7px 10px 9px;color:#e6edf5;font:11px/1.35 var(--mono,system-ui,sans-serif);backdrop-filter:blur(8px);display:none}" +
      "#pqJeda.show{display:block}@media(min-width:861px){#pqJeda{left:auto;right:14px;bottom:84px}}" +
      "body.pqjeda-on #pqDimHud{display:none!important}" +
      "#pqJeda .jh{display:flex;align-items:center;gap:6px;margin-bottom:4px}#pqJeda .jh b{flex:1;color:#34d399;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#pqJeda.busy .jh b:before{content:'';display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:#34d399;animation:pqJd 1s ease-in-out infinite}@keyframes pqJd{50%{opacity:.25;transform:scale(.7)}}" +
      "#pqJeda button{background:#ffffff12;border:1px solid #ffffff22;color:#e6edf5;border-radius:7px;font:700 10px var(--mono,system-ui);padding:3px 7px;cursor:pointer}#pqJeda button:hover{border-color:#34d399;color:#34d399}" +
      "#pqJeda .row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:3px 0;border-top:1px solid #ffffff14}#pqJeda .row:first-of-type{border-top:0}" +
      "#pqJeda .row>span{color:#9db3c9;white-space:nowrap}#pqJeda .row .v{display:flex;gap:10px;font-variant-numeric:tabular-nums}#pqJeda .row .v b{color:#fff;font-size:13px}#pqJeda .row .v i{font-style:normal;color:#9db3c9;font-size:9.5px;margin-right:3px}" +
      "#pqJeda .big b{font-size:21px}#pqJeda .big .v small{color:#9db3c9;font-size:10px;align-self:flex-end}" +
      "#pqJeda svg{display:block;width:100%;height:auto;margin:2px 0 4px}#pqJeda .sub{margin-top:4px;color:#9db3c9;font-size:10px}#pqJeda .btns{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}" +
      "#pqJeda .ok{color:#34d399}#pqJeda .mid{color:#facc15}#pqJeda .lo{color:#f59e0b}#pqJeda.min .bd{display:none}" +
      "@media(max-width:860px){#svOverlay.mode-split #pqJeda svg{display:none}}#pqJedaBtn.active{background:var(--cyan,#22d3ee);color:#04121a;border-color:var(--cyan,#22d3ee)}";
    document.head.appendChild(st);
  }
  function ensureCard() {
    var h = $("pqJeda"); if (h) return h;
    var wrap = $("svFrameWrap"); if (!wrap) return null;
    h = document.createElement("div"); h.id = "pqJeda"; wrap.appendChild(h);
    h.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      var a = b.getAttribute("data-a");
      if (a === "min") { minimized = !minimized; jset(K_MIN, minimized ? 1 : 0); paint(); }
      else if (a === "redo" && cur) { delete cache[cur.c.key]; run(cur.c, false); }
      else if (a === "deep" && cur) { delete cache[cur.c.key]; run(cur.c, true); }
      else if (a === "copy") copyText();
      else if (a === "save") saveCur();
      else if (a === "csv") csv();
    });
    ["touchstart", "pointerdown", "mousedown", "wheel"].forEach(function (ev) { h.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
    return h;
  }
  function f1(v) { return v == null || !isFinite(v) ? "—" : v.toFixed(1) + " m"; }
  function bahuT(v) { return v == null ? "—" : v < 0.15 ? "tidak ada" : f1(v); }
  function drT(v) { return v == null ? "—" : v <= 0 ? "tidak ada" : f1(v); }
  function cls(c) { return c >= 0.7 ? "ok" : c >= 0.45 ? "mid" : "lo"; }
  function ctxLabel(c) { return c.sta ? "STA " + esc(c.sta) : "titik ini"; }

  /* penampang melintang: hanya drainase | bahu | jalan | bahu | drainase */
  function section(A) {
    if (A.W == null) return "";
    var dl = A.dl > 0 ? A.dl : 0, dr = A.dr > 0 ? A.dr : 0, bl = A.bl > 0.15 ? A.bl : 0, br = A.br > 0.15 ? A.br : 0;
    var tot = dl + bl + A.W + br + dr, Wd = 280, pad = 4, sc = (Wd - pad * 2) / Math.max(tot, 4), x = pad, o = "";
    function seg(w, col, label, bold) { if (w <= 0) return; var ww = w * sc; o += '<rect x="' + x.toFixed(1) + '" y="6" width="' + ww.toFixed(1) + '" height="18" fill="' + col + '"/>'; if (ww > 18) o += '<text x="' + (x + ww / 2).toFixed(1) + '" y="38" text-anchor="middle" font-size="' + (bold ? 10 : 8.5) + '" ' + (bold ? 'font-weight="700" fill="#fff"' : 'fill="#cfe0f0"') + ">" + label + "</text>"; x += ww; }
    seg(dl, "#38bdf8", dl.toFixed(1)); seg(bl, "#a8896a", bl.toFixed(1)); seg(A.W, "#475569", A.W.toFixed(1) + " m", true); seg(br, "#a8896a", br.toFixed(1)); seg(dr, "#38bdf8", dr.toFixed(1));
    return '<svg viewBox="0 0 ' + Wd + ' 44" role="img" aria-label="Penampang jalan">' + o + "</svg>";
  }

  function paint() {
    var h = ensureCard(); if (!h) return;
    var show = on && svOpen() && cur; h.classList.toggle("show", !!show); document.body.classList.toggle("pqjeda-on", !!show);
    if (!show) return;
    h.classList.toggle("busy", !!cur.busy); h.classList.toggle("min", minimized);
    var A = cur.A, c = cur.c, o = '<div class="jh"><b>Ukur Jeda • ' + ctxLabel(c) + (cur.busy ? " · mengukur…" : "") + "</b>" +
      '<button data-a="min" title="Ciutkan/tampilkan">' + (minimized ? "▲" : "▼") + "</button></div>";
    if (!A) {
      o += '<div class="bd"><div class="sub">' + esc(cur.note || "Mengukur lebar jalan, bahu & drainase…") + "</div>" + (cur.busy ? "" : '<div class="btns"><button data-a="redo">Ulangi</button></div>') + "</div>";
    } else {
      var approx = A.conf < 0.45;
      o += '<div class="bd">' + section(A) +
        '<div class="row big"><span>Lebar jalan</span><div class="v"><b class="' + cls(A.conf) + '">' + (approx && A.W != null ? "≈ " : "") + f1(A.W) + "</b>" + (A.err != null && A.W != null ? "<small>±" + A.err.toFixed(1) + " m</small>" : "") + "</div></div>" +
        '<div class="row"><span>Lebar bahu</span><div class="v"><span><i>kiri</i><b>' + bahuT(A.bl) + "</b></span><span><i>kanan</i><b>" + bahuT(A.br) + "</b></span></div></div>" +
        '<div class="row"><span>Lebar drainase</span><div class="v"><span><i>kiri</i><b>' + drT(A.dl) + "</b></span><span><i>kanan</i><b>" + drT(A.dr) + "</b></span></div></div>" +
        '<div class="sub">keyakinan <b class="' + cls(A.conf) + '">' + (A.conf >= 0.7 ? "tinggi" : A.conf >= 0.45 ? "sedang" : "rendah") + "</b> · " + A.n + " panorama" + (A.warn ? "<br>⚠ " + esc(A.warn) : "") + (cur.note ? "<br>" + esc(cur.note) : "") + "</div>" +
        '<div class="btns"><button data-a="redo">Ulangi</button>' + (cur.deep || cur.busy ? "" : '<button data-a="deep" title="Tambah panorama tetangga (sampai 5) untuk hasil lebih pasti">Teliti</button>') +
        '<button data-a="copy">Salin</button><button data-a="save">Simpan</button>' + (DB.length ? '<button data-a="csv">CSV (' + DB.length + ")</button>" : "") + "</div></div>";
    }
    h.innerHTML = o;
  }
  function hideCard() { if (cur) { seq++; cur = null; } var h = $("pqJeda"); if (h) h.classList.remove("show"); document.body.classList.remove("pqjeda-on"); }

  /* ---- salin / simpan / CSV ---- */
  function summary() {
    if (!cur || !cur.A) return ""; var A = cur.A;
    return "Ukur Jeda " + ctxLabel(cur.c).replace(/&amp;/g, "&") + (cur.c.name ? " · " + cur.c.name : "") + " — Lebar jalan " + f1(A.W) + (A.err != null && A.W != null ? " (±" + A.err.toFixed(1) + ")" : "") +
      " · Bahu kiri " + bahuT(A.bl) + ", kanan " + bahuT(A.br) + " · Drainase kiri " + drT(A.dl) + ", kanan " + drT(A.dr) + " · keyakinan " + Math.round(A.conf * 100) + "%";
  }
  function copyText() {
    var t = summary(); if (!t) return;
    try { navigator.clipboard.writeText(t).then(function () { toast_("Hasil ukur disalin"); }, function () { toast_(t); }); } catch (e) { toast_(t); }
  }
  function saveCur() {
    if (!cur || !cur.A) return; var A = cur.A, c = cur.c;
    DB = DB.filter(function (x) { return x.k !== c.key; });
    DB.push({ k: c.key, ruas: c.name || "", sta: c.sta || "", lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), W: A.W, bl: A.bl, br: A.br, dl: A.dl, dr: A.dr, conf: +A.conf.toFixed(2), n: A.n, t: new Date().toISOString() });
    if (DB.length > 800) DB = DB.slice(-800); jset(K_DB, DB); toast_("Tersimpan (" + DB.length + " titik)"); paint();
  }
  function csv() {
    if (!DB.length) return; function r1(v) { return v == null ? "" : (+v).toFixed(2); }
    var head = ["Ruas", "STA", "Lat", "Lng", "Lebar jalan (m)", "Bahu kiri (m)", "Bahu kanan (m)", "Drainase kiri (m)", "Drainase kanan (m)", "Keyakinan", "Panorama", "Waktu"];
    var rows = DB.map(function (x) { return [x.ruas, x.sta, x.lat, x.lng, r1(x.W), r1(x.bl), r1(x.br), r1(x.dl), r1(x.dr), x.conf, x.n, x.t]; });
    var txt = "\ufeff" + [head].concat(rows).map(function (l) { return l.map(function (v) { v = v == null ? "" : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\n");
    var u = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })), a = document.createElement("a");
    a.href = u; a.download = "petaqu-ukur-jeda-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 800);
  }

  /* ---- tombol ON/OFF di pemutar animasi ---- */
  function syncBtn() { var b = $("pqJedaBtn"); if (!b) return; b.classList.toggle("active", on); b.title = "Ukur otomatis saat jeda (lebar jalan, bahu, drainase): " + (on ? "ON" : "OFF"); }
  function addBtn() {
    var bar = $("routePlayerBar"); if (!bar || $("pqJedaBtn")) return;
    var b = document.createElement("button"); b.className = "rp-btn"; b.id = "pqJedaBtn"; b.innerHTML = '<i class="fa-solid fa-bullseye"></i>';
    b.addEventListener("click", function (e) {
      e.stopPropagation(); on = !on; jset(K_ON, on ? 1 : 0); syncBtn(); pend = null;
      toast_(on ? "Ukur otomatis saat jeda: ON (butuh Street View terbuka)" : "Ukur otomatis saat jeda: OFF"); if (!on) hideCard();
    });
    var d = $("pqDimBtn"), stop = bar.querySelector(".rp-btn.danger"); bar.insertBefore(b, d ? d.nextSibling : stop || null); syncBtn();
  }

  /* ---- siklus utama ---- */
  function step() {
    addBtn(); injectCss();
    if (document.hidden) return;
    if (!on || !svOpen()) { if (cur) hideCard(); pend = null; return; }
    if (!CORE()) { if (!warnedCore) { warnedCore = true; toast_("Ukur Jeda butuh modul Dimensi (petaqu-dimensi.js)", true); } return; }
    var a = RA(), c = null;
    if (a) { if (a.playing) { if (cur) hideCard(); pend = null; return; } c = window.PQSvAuto ? PQSvAuto.info(a) : null; }
    else c = liveCtx();
    if (!c) { if (cur) hideCard(); return; }
    c.key = c.lat.toFixed(5) + "," + c.lng.toFixed(5) + "," + Math.round(c.rh / 10);
    var now = Date.now();
    if (!pend || meters(pend, c) > 1) {
      pend = { lat: c.lat, lng: c.lng, t: now };
      if (cur && meters(cur.c, c) > 4) hideCard();            /* bergeser → hasil lama basi, batalkan yang berjalan */
      return;
    }
    if (now - pend.t < (a ? 800 : 1300)) return;
    if (cur && cur.c.key === c.key) return;                   /* titik ini sudah diukur / sedang diukur */
    if (!apiKey()) return;
    if (cache[c.key]) { cur = { key: c.key, c: c, A: cache[c.key], busy: false, n: cache[c.key].n, note: "dari cache titik ini" }; paint(); return; }
    run(c, false);
  }
  setInterval(step, 400);

  window.PQJeda = {
    agg: agg, toEntry: toEntry,
    on: function (v) { if (v !== undefined) { on = !!v; jset(K_ON, on ? 1 : 0); syncBtn(); if (!on) hideCard(); } return on; },
    csv: csv, saved: function () { return DB.slice(); }, clear: function () { DB = []; jset(K_DB, DB); paint(); }
  };
})();
