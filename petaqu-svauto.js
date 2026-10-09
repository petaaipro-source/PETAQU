/* PETAQU — Street View OTOMATIS saat animasi rute berjalan (v2 — panel info ADAPTIF)
   • Tombol (ikon orang) di panel pemutar animasi: ON/OFF (diingat, default ON)
   • Saat animasi berjalan, panel Street View terbuka otomatis & mengikuti posisi kendaraan
     dengan arah pandang searah jalan.
   • BARU: teks STA, nama ruas, koordinat, progres, arah, kondisi/IRI pada panel info
     (kotak kiri-bawah), badge atas, dan tautan "Buka di Google Maps" diperbarui REAL-TIME
     (±7x/detik) — saat animasi berjalan, dijeda lalu digeser/diseek, atau animasi selesai.
   • Hemat kuota: yang dibatasi hanyalah pemuatan ulang foto Street View (tiap ±20 m / ≥2 dtk
     saat berjalan; setelah posisi "tenang" ≥0,7 dtk saat digeser dalam keadaan jeda). */
(function () {
  "use strict";
  if (window.__pqSvAuto) return;
  window.__pqSvAuto = 2;

  var KEY = "pq_sv_auto", MIN_M = 20, MIN_MS = 2000, MIN_M_PAUSED = 6, SETTLE_MS = 700, TICK = 140;
  var on = true; try { on = localStorage.getItem(KEY) !== "0"; } catch (e) {}
  var loaded = null, loadedT = 0, pend = null, opened = false, btn = null, cache = {};

  /* ---------- akses variabel global aplikasi (aman bila belum ada) ---------- */
  function RA() { try { return typeof routeAnim !== "undefined" ? routeAnim : null; } catch (e) { return null; } }
  function SV() { try { return typeof svState !== "undefined" ? svState : null; } catch (e) { return null; } }
  function $(id) { return document.getElementById(id); }
  function svOpen() { var o = $("svOverlay"); return !!(o && o.classList.contains("show")); }
  function toast_(m, err) { try { if (typeof toast === "function") toast(m, !!err); } catch (e) {} }
  function esc(s) {
    try { if (typeof escapeHTML === "function") return escapeHTML(s); } catch (e) {}
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function meters(a, b) {
    var r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lng - a.lng) * r;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return 12742000 * Math.asin(Math.sqrt(h));
  }
  var DIRS = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];
  function dirName(h) { return DIRS[Math.round(((h % 360) + 360) % 360 / 45) % 8]; }

  /* ---------- CSS kecil: indikator LIVE pada judul panel ---------- */
  (function () {
    if ($("pq-svauto-css")) return;
    var st = document.createElement("style"); st.id = "pq-svauto-css";
    st.textContent =
      "#svInfoPanel.pq-live #svInfoPanelTitle:before{content:'';display:inline-block;width:7px;height:7px;margin-right:7px;border-radius:50%;background:#22d3ee;box-shadow:0 0 8px #22d3eee6;animation:pqSvLive 1.1s ease-in-out infinite;vertical-align:1px}" +
      "@keyframes pqSvLive{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}" +
      "#svInfoPanel .sv-info-row b.pq-sta{color:#22d3ee;font-family:var(--mono,monospace);font-variant-numeric:tabular-nums}" +
      "#svInfoPanel .sv-info-row b{font-variant-numeric:tabular-nums}" +
      /* ringkas & minimalis: lebar mengikuti isi, label & nilai berdampingan, baris mengalir (tanpa ruang kosong) */
      "#svInfoPanel{width:fit-content;max-width:min(300px,calc(100vw - 20px));padding:7px 10px 8px;gap:3px;border-radius:12px;max-height:min(220px,38vh)}" +
      "#svInfoPanel #svInfoPanelTitle{font-size:11px;margin:0 0 1px;max-width:100%}" +
      "#svInfoPanel #svInfoPanelBody{display:flex;flex-wrap:wrap;gap:1px 12px}" +
      "#svInfoPanel .sv-info-row{display:inline-flex;justify-content:flex-start;gap:5px;font-size:10.5px;line-height:1.35;min-width:0;max-width:100%}" +
      "#svInfoPanel .sv-info-row span{opacity:.75}" +
      "#svInfoPanel .sv-info-row span:after{content:':'}" +
      "#svInfoPanel .sv-info-row b{text-align:left}" +
      "@media(max-width:639px){#svInfoPanel{left:8px;right:auto;width:fit-content;max-width:min(330px,calc(100% - 16px));bottom:calc(70px + env(safe-area-inset-bottom,0px))}}" +
      "@media(prefers-reduced-motion:reduce){#svInfoPanel.pq-live #svInfoPanelTitle:before{animation:none}}";
    document.head.appendChild(st);
  })();

  function setBtn() { if (!btn) return; btn.classList.toggle("active", on); btn.title = "Street View otomatis saat animasi: " + (on ? "ON" : "OFF"); }

  function addBtn() {
    var bar = $("routePlayerBar");
    if (!bar || $("pqSvAutoBtn")) return !!bar;
    btn = document.createElement("button");
    btn.className = "rp-btn"; btn.id = "pqSvAutoBtn";
    btn.innerHTML = '<i class="fa-solid fa-street-view"></i>';
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      on = !on; try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (x) {}
      setBtn(); loaded = null; pend = null; opened = false;
      toast_(on ? "Street View otomatis: ON" : "Street View otomatis: OFF");
      if (!on) { try { if (svOpen() && typeof closeStreetView === "function") closeStreetView(); } catch (x) {} }
    });
    var stop = bar.querySelector(".rp-btn.danger");
    bar.insertBefore(btn, stop || null);
    setBtn(); return true;
  }

  /* ---------- hitung posisi + STA kendaraan saat ini ---------- */
  function info(a) {
    if (!a || !a.pts || !a.cum || !a.pts.length || !a.road) return null;
    var fs = (typeof findSegmentAtDistance === "function") ? findSegmentAtDistance : function () { return 0; };
    var o = fs(a.cum, a.traveledDist || 0);
    var p = a.pts[o], q = a.pts[o + 1] || p; if (!p) return null;
    var s = Math.min(1, Math.max(0, ((a.traveledDist || 0) - a.cum[o]) / ((a.cum[o + 1] - a.cum[o]) || 1e-9)));
    var h = (typeof calcBearing === "function" && q !== p) ? Math.round(calcBearing(p, q)) : (cache.h || 0);
    cache.h = h;
    var road_h = h;
    try { var L_ = window.PQSvLive; if (L_ && L_.ready() && L_.heading() != null) h = Math.round(L_.heading()); } catch (e) {}
    /* STA dihitung LANGSUNG dengan fungsi yang sama dengan panel pemutar → selalu sinkron,
       tidak lagi bergantung pada teks DOM yang bisa tertinggal/“STA 0+000” */
    var sta = "";
    try { sta = staLabelForSegment(a, o, s); } catch (e) {}
    if (!sta) { var el = $("routePlayerSta"); sta = el ? el.textContent.replace(/^\s*STA\s*/i, "") : "0+000"; }
    /* titik STA terdekat (untuk kondisi/IRI) — memperhitungkan mode antrean yang dibalik */
    var pt = null;
    try {
      var pts = a.road.points || [], n = pts.length, k = Math.max(0, Math.min(n - 1, s < 0.5 ? o : o + 1));
      var rev = !!(a.queueMode && typeof routeAllQueue !== "undefined" && routeAllQueue && routeAllQueue[routeAllIndex] && routeAllQueue[routeAllIndex].reversed);
      pt = pts[rev ? n - 1 - k : k] || null;
    } catch (e) {}
    var kmEl = $("routePlayerKm"), kmpos = "";
    try { kmpos = window.PQKm ? PQKm.routeText(a, o, s) : ""; } catch (e) {}
    return {
      lat: p.lat + (q.lat - p.lat) * s, lng: p.lng + (q.lng - p.lng) * s, h: h, rh: road_h,
      sta: String(sta), name: a.road.name || "Rute", kab: a.road.kabupaten || "",
      km: kmEl ? kmEl.textContent : "", kmpos: kmpos,
      pct: a.totalDist ? Math.min(100, Math.max(0, Math.round((a.traveledDist || 0) / a.totalDist * 100))) : 0,
      pt: pt
    };
  }

  function panoUrl(c) { return "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + c.lat + "," + c.lng + "&heading=" + c.h + "&pitch=0"; }
  function setTxt(id, t) { var el = $(id); if (el && el.textContent !== t) el.textContent = t; }
  function setHtml(id, h) { var el = $(id); if (el && el.__h !== h) { el.innerHTML = h; el.__h = h; } }

  /* ---------- panel info (kotak kiri-bawah) ---------- */
  function row(k, v, cls, style) { return v === "" || v == null ? "" : '<div class="sv-info-row"><span>' + k + "</span><b" + (cls ? ' class="' + cls + '"' : "") + (style ? ' style="' + style + '"' : "") + ">" + v + "</b></div>"; }
  function paintPanel(c, a) {
    var t = $("svInfoPanelTitle"), b = $("svInfoPanelBody"), p = $("svInfoPanel");
    if (!t || !b || !p || !c) return;
    setTxt("svInfoPanelTitle", "STA " + c.sta + (c.kmpos ? " \u2022 KM " + c.kmpos : ""));
    var h = row("Ruas", esc(c.name)) +
      row("Progres", esc(c.km) + " (" + c.pct + "%)") +
      row("Koordinat", c.lat.toFixed(6) + ", " + c.lng.toFixed(6), "", "font-size:10.5px;") +
      row("Arah pandang", c.h + "° " + dirName(c.h)) +
      (c.off > 25 ? row("Jarak ke ruas", Math.round(c.off) + " m", "", "color:#fbbf24") : "") +
      (c.kab ? row("Kabupaten", esc(c.kab)) : "");
    var pt = c.pt;
    if (pt) {
      if (pt.kondisi) h += row("Kondisi", esc(String(pt.kondisi)));
      if (pt.iri !== undefined && pt.iri !== null && pt.iri !== "" && !isNaN(pt.iri)) {
        try { var ii = getIriInfo(pt.iri); h += row("IRI", Number(pt.iri).toFixed(1) + " (" + esc(ii.label) + ")", "", "color:" + ii.color); }
        catch (e) { h += row("IRI", Number(pt.iri).toFixed(1)); }
      }
    }
    setHtml("svInfoPanelBody", h);
    p.classList.toggle("pq-live", !!(a && a.playing));
    try { if (typeof applySvInfoPanelVisibility === "function") applySvInfoPanelVisibility(); } catch (e) {}
  }

  /* render ulang panel oleh aplikasi (mis. ganti mode/riwayat) tidak boleh menimpa data live */
  var wrapTries = 0;
  function wrapPanel() {
    var f = window.renderSvInfoPanel;
    if (typeof f !== "function") { if (wrapTries++ < 100) setTimeout(wrapPanel, 300); return; }
    if (f.__pqSa) return;
    var w = function () {
      try { var S = SV(); if (S && S.live) { paintPanel(S.live, RA()); return; } } catch (e) {}
      return f.apply(this, arguments);
    };
    w.__pqSa = 1; window.renderSvInfoPanel = w;
  }
  wrapPanel();

  /* ---------- sinkronkan SEMUA label Street View dengan posisi terkini ---------- */
  function paintDom(c, a) {
    var label = "STA " + c.sta + (c.kmpos ? " \u2022 KM " + c.kmpos : "");
    setTxt("svRoadName", c.name);
    setHtml("svStaBadge", '<i class="fa-solid fa-location-dot"></i> ' + esc(label));
    var co = c.lat.toFixed(6) + ", " + c.lng.toFixed(6);
    setTxt("svCoord", co);
    var url = panoUrl(c), ex = $("svExternalLink"); if (ex && ex.getAttribute("href") !== url) ex.href = url;
    /* kartu peluncur (tampil saat tanpa API key) */
    setTxt("svLauncherRoad", c.name);
    setHtml("svLauncherSta", '<i class="fa-solid fa-location-dot"></i> ' + esc(label));
    setTxt("svLauncherCoord", co);
    var lb = $("svLauncherBtn"); if (lb && lb.getAttribute("href") !== url) lb.href = url;
    paintPanel(c, a);
    try { if (typeof updateSvLiveIndicator === "function") updateSvLiveIndicator(c); } catch (e) {}
  }
  function paint(c, a) {
    var S = SV(); if (!S) return;
    S.lat = c.lat; S.lng = c.lng; S.label = c.name + " • STA " + c.sta + (c.kmpos ? " • KM " + c.kmpos : ""); S.live = c;
    paintDom(c, a);
  }
  window.PQSvAuto = { paintDom: paintDom, info: info, reset: function () { loaded = null; pend = null; } };

  function loadFrame(c, key) {
    var f = $("svFrame"); if (!f) return;
    var src = "https://www.google.com/maps/embed/v1/streetview?key=" + encodeURIComponent(key) + "&location=" + c.lat + "," + c.lng + "&heading=" + c.h + "&pitch=0&fov=90";
    f.style.visibility = "visible"; f.src = src;
    var l = $("svLoading"); if (l) l.classList.add("hide");
  }

  /* ---------- siklus utama ---------- */
  function step() {
    addBtn();
    if (document.hidden) return;
    var a = RA();
    if (!a) { if (opened || loaded) { loaded = null; pend = null; opened = false; var S0 = SV(); if (S0) S0.live = null; var p0 = $("svInfoPanel"); if (p0) p0.classList.remove("pq-live"); } return; }
    if (!on) return;
    if (opened && !svOpen()) { /* ditutup manual oleh pengguna → matikan otomatis */
      on = false; try { localStorage.setItem(KEY, "0"); } catch (e) {} setBtn(); opened = false; loaded = null; toast_("Street View otomatis dimatikan"); return;
    }
    var L = window.PQSvLive;
    if (L && L.userNav) {                  /* pengguna berpindah sendiri di Street View */
      if (a.playing) { L.userNav = false; loaded = null; pend = null; }   /* tekan Play → ikuti kendaraan lagi */
      else return;
    }
    var c = info(a); if (!c) return;
    var now = Date.now(), open = svOpen(), S = SV();
    var SC = window.PQScrub, scrub = !!(SC && SC.active), commit = !!(SC && SC.commit);   /* panah sedang digeser / baru dilepas (petaqu-scrub.js) */

    /* 1) teks live: tiap tick, tanpa membebani (hanya menyentuh DOM bila berubah) */
    if (open && S && S.live) paint(c, a);

    /* 2) kapan memuat ulang foto Street View? */
    var need = false, moved = loaded ? meters(loaded, c) : Infinity;
    if (!loaded) { need = !!a.playing || scrub || commit; }
    else if (a.playing && !scrub && !commit) { pend = null; need = moved >= MIN_M && now - loadedT >= MIN_MS; }
    else if (scrub) {                     /* panah sedang dipegang & digeser: ikuti cepat (Live ±0,2 dtk, Embed ±0,5 dtk) */
      var live = false; try { live = !!(window.PQSvLive && window.PQSvLive.ready() && window.PQSvView && window.PQSvView.shown() !== "embed"); } catch (e) {}
      pend = null; need = moved >= 3 && now - loadedT >= (live ? 200 : 500);
    }
    else if (commit) {                    /* baru dilepas: pastikan foto TEPAT di posisi akhir (sekali) */
      SC.commit = false; pend = null; need = moved >= 1.5;
    }
    else if (opened && open) {            /* dijeda lalu digeser/diseek: tunggu posisi tenang */
      if (!pend || meters(pend, c) > 1) pend = { lat: c.lat, lng: c.lng, t: now };
      else if (now - pend.t >= SETTLE_MS && moved >= MIN_M_PAUSED) need = true;
    }
    if (commit && SC) SC.commit = false;
    if (!need) return;

    var key = ""; try { key = getApiKey(); } catch (e) {}
    if (!key) { toast_("Street View butuh API key Google Maps (Pengaturan)", true); on = false; setBtn(); return; }
    try {
      if (!open || !S || !S.live) {
        openStreetViewForGeoResult(c.lat, c.lng, c.name + " • STA " + c.sta);
        opened = true; S = SV();
      }
      paint(c, a);
      if (!(window.PQSvLive && window.PQSvLive.go(c))) loadFrame(c, key);
    } catch (e) {}
    loaded = { lat: c.lat, lng: c.lng }; loadedT = now; pend = null;
  }
  setInterval(step, TICK);
})();
