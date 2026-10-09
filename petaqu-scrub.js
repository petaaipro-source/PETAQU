/* PETAQU — GESER PANAH ANIMASI RUTE (scrub) v1
   Panah/kendaraan animasi rute sekarang bisa DIPEGANG & DIGESER maju-mundur sepanjang ruas,
   baik saat dijeda maupun saat sedang berjalan. Street View, panel info, STA, dan video dashcam
   ikut bergeser real-time.

   Cerdas:
   • Menempel ke garis ruas (snap) + "kontinuitas": di ruas yang berputar / bolak-balik / saling
     memotong, panah tetap di cabang yang sedang dipegang — tidak melompat ke bagian lain.
   • Magnet ke titik STA: saat zoom cukup dekat, panah "klik" tepat di titik STA bila dilepas dekat titik itu.
   • Offset genggaman: panah tidak melompat ke bawah jari/kursor — posisi pegang dipertahankan.
   • Sedang berjalan → otomatis dijeda selama dipegang, lanjut sendiri saat dilepas.
   • Ketuk panah (tanpa menggeser) = Play / Jeda.
   • Garis pemandu putus-putus dari jari ke panah saat jari jauh dari ruas; peta ikut menggeser
     sendiri bila panah diseret ke tepi layar.
   • Bar progres juga bisa diketuk / digeser untuk lompat ke posisi mana pun (ruas tunggal).
   • Tombol ⏮ / ⏭ pada pemutar (tahan = berulang) & tombol Sebelumnya / Berikutnya di Street View
     → lompat ke titik STA sebelumnya / berikutnya. Panah ←/→ keyboard juga (Shift = ±50 m).
   • Street View hemat kuota: saat digeser diperbarui tiap ±0,2–0,5 dtk, dan DIPASTIKAN tepat di
     posisi akhir begitu dilepas. Navigasi manual di dalam Street View otomatis di-reset.
   Tidak mengubah fitur lain. Bekerja bersama petaqu-svauto.js / svlive.js / svview.js / playfit.js. */
(function () {
  "use strict";
  if (window.PQScrub) return;

  /* ------------------------------------------------------------------ util */
  function $(id) { return document.getElementById(id); }
  function MAP() { try { return typeof map !== "undefined" ? map : null; } catch (e) { return null; } }
  function RA() { try { return typeof routeAnim !== "undefined" ? routeAnim : null; } catch (e) { return null; } }
  function SV() { try { return typeof svState !== "undefined" ? svState : null; } catch (e) { return null; } }
  function toast_(m, err) { try { if (typeof toast === "function") toast(m, !!err); } catch (e) {} }
  function svOpen() { var o = $("svOverlay"); return !!(o && o.classList.contains("show")); }
  function typing(t) {
    var tn = t && t.tagName;
    return tn === "INPUT" || tn === "TEXTAREA" || tn === "SELECT" || !!(t && t.isContentEditable);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }

  var HINT_KEY = "pq_scrub_hint_v1";
  var MAGNET_PX = 8;          /* jarak layar utk "klik" ke titik STA */
  var MAGNET_MIN_SEG = 22;    /* magnet hanya aktif jika jarak antar-titik di layar ≥ ini (px) */
  var TOL_PX = 14;            /* cabang rute yang "sama dekat" → pilih yang paling kontinu */
  var DRAG_THRESHOLD = 4;     /* px sebelum dianggap geser (bukan ketuk) */
  var EDGE = 40, EDGE_SPEED = 14;

  var api = { active: false, commit: false, v: 1 };
  window.PQScrub = api;

  /* ------------------------------------------------------------------ CSS */
  (function () {
    if ($("pq-scrub-css")) return;
    var c = document.createElement("style"); c.id = "pq-scrub-css";
    c.textContent = [
      ".route-vehicle{cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none}",
      ".route-vehicle:before{content:'';position:absolute;inset:-14px;border-radius:50%}",   /* area sentuh lebih lebar */
      ".route-vehicle .rv-core{transition:transform .14s ease,box-shadow .14s ease}",
      "body.pq-scrubbing,body.pq-scrubbing *{cursor:grabbing!important}",
      "body.pq-scrubbing .route-vehicle .rv-core{transform:scale(1.3);box-shadow:0 0 0 3px #080b12eb,0 0 0 6px #22d3ee99,0 6px 20px #000b}",
      "body.pq-scrubbing .route-vehicle .rv-glow{animation:none;opacity:1;transform:scale(1.5)}",
      "body.pq-scrubbing #svOverlay iframe,body.pq-scrubbing #pqSvPano{pointer-events:none!important}",
      "body.pq-scrubbing{-webkit-user-select:none;user-select:none}",
      /* petunjuk ▲▼ sepanjang arah jalan (ikut berputar bersama panah) saat dijeda */
      ".pq-sc-hint{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .2s}",
      ".pq-sc-hint i{position:absolute;left:50%;width:0;height:0;margin-left:-5px;border-left:5px solid transparent;border-right:5px solid transparent;filter:drop-shadow(0 0 3px #22d3ee)}",
      ".pq-sc-hint i:first-child{top:-17px;border-bottom:7px solid #22d3ee}",
      ".pq-sc-hint i:last-child{bottom:-17px;border-top:7px solid #22d3ee}",
      "body.pq-sc-paused .pq-sc-hint{opacity:.95;animation:pqScNudge 1.6s ease-in-out infinite}",
      "body.pq-scrubbing .pq-sc-hint{opacity:0!important;animation:none}",
      "@keyframes pqScNudge{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}",
      /* bar progres bisa digeser */
      ".rp-progress-track{cursor:pointer;touch-action:none;overflow:visible!important}",
      ".rp-progress-track:before{content:'';position:absolute;left:0;right:0;top:-10px;bottom:-10px}",   /* area sentuh tinggi */
      ".rp-progress-fill{position:relative}",
      ".rp-progress-fill:after{content:'';position:absolute;right:-6px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:#e8fbff;box-shadow:0 0 0 2px #22d3ee,0 2px 8px #000a;opacity:0;transform:scale(.6);transition:.15s}",
      ".rp-progress-track:hover .rp-progress-fill:after,.rp-progress-track.pq-seeking .rp-progress-fill:after{opacity:1;transform:scale(1)}",
      "#routePlayerBar.pq-noseek .rp-progress-track{cursor:default}",
      "#routePlayerBar.pq-noseek .rp-progress-fill:after{display:none}",
      /* dua tombol ⏮ ⏭ menambah lebar → lebarkan pemutar sedikit & cegah teks STA / km turun baris */
      "#routePlayerBar{width:min(600px,94vw)}",
      "#routePlayerBar:not(.dragged){width:min(600px,var(--pqf-w,94vw))}",
      "#routePlayerBar .rp-meta span{white-space:nowrap}",
      /* tombol STA sebelumnya / berikutnya */
      ".rp-btn.pq-step{width:28px;height:28px;font-size:10.5px}",
      "#routePlayerBar.pqf-xs .rp-btn.pq-step{width:26px;height:26px}",
      "#routePlayerBar.pq-noseek .rp-btn.pq-step{opacity:.9}",
      /* garis pemandu */
      "@media(prefers-reduced-motion:reduce){body.pq-sc-paused .pq-sc-hint{animation:none}}"
    ].join("\n");
    document.head.appendChild(c);
  })();

  /* ------------------------------------------------------------------ geometri rute */
  /* posisi (km) → indeks segmen & fraksi */
  function segAt(cum, d) {
    var lo = 0, hi = cum.length - 2;
    if (hi < 0) return { i: 0, t: 0 };
    d = clamp(d, 0, cum[cum.length - 1]);
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid - 1; }
    var L = (cum[lo + 1] - cum[lo]) || 1e-12;
    return { i: lo, t: clamp((d - cum[lo]) / L, 0, 1) };
  }

  /* ------------------------------------------------------------------ pindahkan panah ke jarak d (km) */
  function playIcon(a) {
    var b = $("routePlayerPlayBtn"); if (!b || !a) return;
    var end = a.traveledDist >= a.totalDist - 1e-9;
    var cls = a.playing ? "fa-solid fa-pause" : end ? "fa-solid fa-rotate-right" : "fa-solid fa-play";
    var i = b.firstElementChild;
    if (!i || i.className !== cls) b.innerHTML = '<i class="' + cls + '"></i>';
  }
  function seek(d, opts) {
    var a = RA(); if (!a || !a.cum) return false;
    opts = opts || {};
    a.traveledDist = clamp(d, 0, a.totalDist);
    a.lastTs = null;
    try { updateRouteAnimVisual(); } catch (e) {}
    playIcon(a);
    return true;
  }

  /* ------------------------------------------------------------------ geser panah dengan pointer */
  var HANDLERS = ["dragging", "touchZoom", "touchRotate", "touchGestures", "doubleClickZoom", "boxZoom"];
  var drag = null, leash = null;

  function prepProj(a, z) {
    var m = MAP(), n = a.pts.length, X = new Float64Array(n), Y = new Float64Array(n);
    for (var i = 0; i < n; i++) { var p = m.project(a.pts[i], z); X[i] = p.x; Y[i] = p.y; }
    return { z: z, X: X, Y: Y, T: new Float64Array(n), D: new Float64Array(n) };
  }

  /* titik (px,py) → posisi terdekat pada rute (km) dengan kontinuitas terhadap sPrev */
  function project(a, P, px, py, sPrev) {
    var n = a.pts.length, X = P.X, Y = P.Y, T = P.T, D = P.D, cum = a.cum, dmin = Infinity, i;
    for (i = 0; i < n - 1; i++) {
      var ax = X[i], ay = Y[i], dx = X[i + 1] - ax, dy = Y[i + 1] - ay, l2 = dx * dx + dy * dy;
      var t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
      var qx = ax + dx * t - px, qy = ay + dy * t - py, d = Math.sqrt(qx * qx + qy * qy);
      T[i] = t; D[i] = d; if (d < dmin) dmin = d;
    }
    /* Kandidat = segmen yang hampir sama dekatnya dengan yang terdekat. Segmen kandidat yang BERSAMBUNGAN
       dianggap satu "cabang" → di dalam cabang selalu ambil yang paling dekat ke jari (tanpa lag).
       Hanya bila ada beberapa cabang terpisah (ruas berputar / bolak-balik / bersilangan) → pilih cabang
       yang posisinya paling dekat dengan posisi sebelumnya (kontinuitas). */
    var lim = dmin + TOL_PX, bestI = 0, bestGap = Infinity, runBest = -1, runD = Infinity, last = -2;
    function closeRun() {
      if (runBest < 0) return;
      var s = cum[runBest] + T[runBest] * (cum[runBest + 1] - cum[runBest]), gap = Math.abs(s - sPrev);
      if (gap < bestGap) { bestGap = gap; bestI = runBest; }
      runBest = -1; runD = Infinity;
    }
    for (i = 0; i < n - 1; i++) {
      if (D[i] > lim) continue;
      if (i !== last + 1) closeRun();
      if (D[i] < runD) { runD = D[i]; runBest = i; }
      last = i;
    }
    closeRun();
    var t0 = T[bestI], segPx = Math.sqrt(Math.pow(X[bestI + 1] - X[bestI], 2) + Math.pow(Y[bestI + 1] - Y[bestI], 2));
    var sOut = cum[bestI] + t0 * (cum[bestI + 1] - cum[bestI]), snapped = false;
    if (segPx >= MAGNET_MIN_SEG) {                              /* magnet ke titik STA */
      if (t0 * segPx <= MAGNET_PX) { sOut = cum[bestI]; snapped = true; }
      else if ((1 - t0) * segPx <= MAGNET_PX) { sOut = cum[bestI + 1]; snapped = true; }
    }
    return { s: sOut, off: D[bestI], snapped: snapped };
  }

  function ensureLeash() {
    var m = MAP(); if (!m || leash) return;
    leash = L.polyline([[0, 0], [0, 0]], { color: "#22d3ee", weight: 2, opacity: .9, interactive: false, dashArray: "3 6" });
  }
  function drawLeash(pointerLL, vehLL, far) {
    var m = MAP(); if (!m) return;
    ensureLeash();
    if (!far) { if (m.hasLayer(leash)) m.removeLayer(leash); return; }
    leash.setLatLngs([pointerLL, vehLL]);
    if (!m.hasLayer(leash)) leash.addTo(m);
  }

  function onDown(e) {
    var a = RA(), m = MAP();
    if (!a || !m || !a.marker || !a.pts || a.pts.length < 2 || drag) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    var ic = a.marker._icon;
    if (!ic || !ic.contains(e.target)) return;

    var cp = m.mouseEventToContainerPoint(e), vp = m.latLngToContainerPoint(a.marker.getLatLng());
    drag = {
      id: e.pointerId, a: a, startX: e.clientX, startY: e.clientY, moved: false,
      wasPlaying: !!a.playing, follow: a.followCamera,
      offX: vp.x - cp.x, offY: vp.y - cp.y,              /* offset genggaman */
      ev: e, dirty: true, raf: 0, P: null, sPrev: a.traveledDist, snapped: false,
      saved: []
    };
    /* matikan gesture peta selama panah dipegang (pointerdown terjadi SEBELUM mousedown/touchstart Leaflet) */
    HANDLERS.forEach(function (n) {
      try { var h = m[n]; if (h && h.enabled && h.enabled()) { h.disable(); drag.saved.push(n); } } catch (x) {}
    });
    e.stopPropagation(); e.preventDefault();
    try { ic.setPointerCapture(e.pointerId); } catch (x) {}
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: false });
    window.addEventListener("pointercancel", onUp, { passive: false });
  }

  function beginMove() {
    var a = drag.a, m = MAP();
    drag.moved = true; api.active = true;
    document.body.classList.add("pq-scrubbing");
    drag.wasPlaying = !!a.playing;
    a.playing = false;                                    /* jeda selama dipegang */
    a.followCamera = false;                               /* kamera tidak berebut dengan jari */
    try { if (window.PQSvLive) window.PQSvLive.userNav = false; } catch (e) {}
    try { m.stop && m.stop(); } catch (e) {}
    drag.P = prepProj(a, m.getZoom());
    drag.sPrev = a.traveledDist;
    playIcon(a);
    if (!lsGet(HINT_KEY, "")) { lsSet(HINT_KEY, "1"); }
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    drag.ev = e;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      beginMove();
    }
    drag.dirty = true;
    if (!drag.raf) drag.raf = requestAnimationFrame(frame);
  }

  function frame() {
    if (!drag) return;
    drag.raf = 0;
    var m = MAP(), a = drag.a;
    if (!m || RA() !== a) { endDrag(false); return; }              /* animasi diganti/dihentikan saat dipegang */

    /* pan otomatis bila panah diseret ke tepi peta (hanya saat peta tidak diputar) */
    var cr = m.getContainer().getBoundingClientRect(), ev = drag.ev, panned = false;
    var rotated = false; try { rotated = typeof m.getBearing === "function" && Math.abs(m.getBearing() || 0) > 0.5; } catch (x) {}
    if (!rotated) {
      var dx = 0, dy = 0, px = ev.clientX - cr.left, py = ev.clientY - cr.top;
      if (px < EDGE) dx = -EDGE_SPEED * (1 - Math.max(0, px) / EDGE);
      else if (px > cr.width - EDGE) dx = EDGE_SPEED * (1 - Math.max(0, cr.width - px) / EDGE);
      if (py < EDGE) dy = -EDGE_SPEED * (1 - Math.max(0, py) / EDGE);
      else if (py > cr.height - EDGE) dy = EDGE_SPEED * (1 - Math.max(0, cr.height - py) / EDGE);
      var ov = $("svOverlay");                                       /* jangan autopan ke arah panel Street View */
      if (ov && ov.classList.contains("show")) {
        var orc = ov.getBoundingClientRect();
        if (orc.width > 2 && orc.width < window.innerWidth * 0.9 && ev.clientX > orc.left - EDGE && orc.left > cr.left) dx = Math.min(dx, 0);
        if (orc.height > 2 && orc.height < window.innerHeight * 0.9 && ev.clientY > orc.top - EDGE && orc.top > cr.top) dy = Math.min(dy, 0);
      }
      if (dx || dy) { try { m.panBy([dx, dy], { animate: false }); panned = true; } catch (x) {} }
    }

    if (drag.dirty || panned) {
      drag.dirty = false;
      if (drag.P.z !== m.getZoom()) drag.P = prepProj(a, m.getZoom());   /* zoom berubah → proyeksi ulang */
      var cp = m.mouseEventToContainerPoint(ev);
      var tgtPt = L.point(cp.x + drag.offX, cp.y + drag.offY);
      var tgtLL = m.containerPointToLatLng(tgtPt);
      var tp = m.project(tgtLL, drag.P.z);
      var r = project(a, drag.P, tp.x, tp.y, drag.sPrev);
      drag.sPrev = r.s;
      if (r.snapped !== drag.snapped) { drag.snapped = r.snapped; if (r.snapped && navigator.vibrate) { try { navigator.vibrate(8); } catch (x) {} } }
      seek(r.s);
      drawLeash(tgtLL, a.marker.getLatLng(), r.off > 28);
    }
    if (panned) { drag.dirty = true; drag.raf = requestAnimationFrame(frame); }     /* lanjut selama di tepi */
  }

  function restoreMap(d) {
    var m = MAP(); if (!m || !d) return;
    d.saved.forEach(function (n) { try { m[n].enable(); } catch (x) {} });
  }

  function endDrag(commit) {
    var d = drag; if (!d) return;
    drag = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (d.raf) cancelAnimationFrame(d.raf);
    try { d.a.marker._icon.releasePointerCapture(d.id); } catch (x) {}
    restoreMap(d);
    var m = MAP(); if (m && leash && m.hasLayer(leash)) m.removeLayer(leash);
    document.body.classList.remove("pq-scrubbing");
    api.active = false;
    var a = RA();
    if (!d.moved) {                                     /* ketuk tanpa geser → Play / Jeda */
      if (a === d.a && commit) { try { handleRoutePlayerPlayClick(); } catch (x) {} }
      return;
    }
    if (a !== d.a) return;
    api.commit = true;                                  /* svauto: muat Street View tepat di posisi akhir */
    a.followCamera = d.follow;
    if (d.wasPlaying) {
      if (a.traveledDist < a.totalDist - 1e-9) {          /* lanjut jalan otomatis */
        a.playing = true; a.lastTs = null;
        if (a.rafId) cancelAnimationFrame(a.rafId);
        a.rafId = requestAnimationFrame(routeAnimStep);
      } else { try { finishRouteAnimation(); } catch (x) {} }   /* dilepas di ujung: lanjut ruas berikutnya (mode antrean) / selesai */
    }
    try { updateRouteAnimVisual(); } catch (x) {}       /* kamera ikut (bila "Ikuti Kamera" aktif) */
    playIcon(a);
    /* click susulan setelah geser jangan diteruskan ke peta (mis. mode edit) */
    var kill = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener("click", kill, true);
    setTimeout(function () { document.removeEventListener("click", kill, true); }, 60);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    endDrag(e.type === "pointerup");
  }

  /* ------------------------------------------------------------------ lompat ke titik STA sebelumnya / berikutnya */
  function stepSta(dir, fine) {
    var a = RA(); if (!a || !a.cum) return false;
    if (fine) {                                          /* Shift: ±50 m */
      seek(a.traveledDist + dir * 0.05);
    } else {
      var cum = a.cum, d = a.traveledDist, eps = 0.0005, target = null, i;
      if (dir > 0) { for (i = 0; i < cum.length; i++) if (cum[i] > d + eps) { target = cum[i]; break; } if (target == null) target = a.totalDist; }
      else { for (i = cum.length - 1; i >= 0; i--) if (cum[i] < d - eps) { target = cum[i]; break; } if (target == null) target = 0; }
      seek(target);
    }
    try { if (window.PQSvLive) window.PQSvLive.userNav = false; } catch (e) {}
    if (a.playing) { a.playing = false; playIcon(a); }   /* langkah manual → jeda */
    api.commit = true;
    return true;
  }
  api.seek = seek; api.step = stepSta;

  /* ------------------------------------------------------------------ bar progres: ketuk / geser */
  var bar = { on: false, id: null };
  function seekFromBar(e) {
    var a = RA(), tr = $("routePlayerFill") && $("routePlayerFill").parentNode; if (!a || !tr) return;
    var r = tr.getBoundingClientRect(), f = clamp((e.clientX - r.left) / (r.width || 1), 0, 1);
    seek(f * a.totalDist);
  }
  function wireBar() {
    var fill = $("routePlayerFill"), tr = fill && fill.parentNode;
    if (!tr || tr.__pqSc) return !!tr;
    tr.__pqSc = 1;
    /* bar pemutar punya drag-panel sendiri (mousedown/touchstart) — jangan sampai ikut tergeser */
    ["mousedown", "touchstart"].forEach(function (n) { tr.addEventListener(n, function (e) { e.stopPropagation(); }, { passive: true }); });
    tr.addEventListener("pointerdown", function (e) {
      var a = RA(); if (!a || a.queueMode) return;        /* mode "Putar Semua": bar = progres seluruh antrean → tidak bisa di-seek per ruas */
      if (e.pointerType === "mouse" && e.button !== 0) return;
      bar.on = true; bar.id = e.pointerId; bar.was = !!a.playing;
      a.playing = false; playIcon(a);
      try { if (window.PQSvLive) window.PQSvLive.userNav = false; } catch (x) {}
      try { tr.setPointerCapture(e.pointerId); } catch (x) {}
      tr.classList.add("pq-seeking"); api.active = true;
      document.body.classList.add("pq-sc-barseek");
      seekFromBar(e); e.preventDefault(); e.stopPropagation();
    });
    tr.addEventListener("pointermove", function (e) { if (bar.on && e.pointerId === bar.id) { seekFromBar(e); e.preventDefault(); } });
    function end(e) {
      if (!bar.on || (e && e.pointerId !== bar.id)) return;
      bar.on = false; tr.classList.remove("pq-seeking"); api.active = false; api.commit = true;
      document.body.classList.remove("pq-sc-barseek");
      var a = RA();
      if (a && bar.was) {
        if (a.traveledDist < a.totalDist - 1e-9) { a.playing = true; a.lastTs = null; if (a.rafId) cancelAnimationFrame(a.rafId); a.rafId = requestAnimationFrame(routeAnimStep); }
        else { try { finishRouteAnimation(); } catch (x) {} }
      }
      if (a) playIcon(a);
    }
    tr.addEventListener("pointerup", end); tr.addEventListener("pointercancel", end);
    return true;
  }

  /* ------------------------------------------------------------------ tombol ⏮ ⏭ di pemutar (tahan = berulang) */
  function mkStep(dir) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "rp-btn pq-step"; b.id = dir < 0 ? "pqScPrev" : "pqScNext";
    b.title = (dir < 0 ? "Titik STA sebelumnya" : "Titik STA berikutnya") + " (tahan = berulang · Shift = ±50 m)";
    b.innerHTML = '<i class="fa-solid ' + (dir < 0 ? "fa-backward-step" : "fa-forward-step") + '"></i>';
    var t1 = 0, t2 = 0;
    function stop() { clearTimeout(t1); clearInterval(t2); t1 = t2 = 0; }
    b.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      var fine = e.shiftKey;
      stepSta(dir, fine);
      t1 = setTimeout(function () { t2 = setInterval(function () { stepSta(dir, fine); }, 110); }, 380);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (n) { b.addEventListener(n, stop); });
    ["mousedown", "touchstart", "click"].forEach(function (n) { b.addEventListener(n, function (e) { e.stopPropagation(); }, { passive: true }); });
    return b;
  }
  function wireButtons() {
    var pb = $("routePlayerPlayBtn");
    if (!pb || $("pqScPrev")) return !!pb;
    var prev = mkStep(-1), next = mkStep(1);
    pb.parentNode.insertBefore(prev, pb);
    pb.parentNode.insertBefore(next, pb.nextSibling);
    return true;
  }

  /* ------------------------------------------------------------------ keyboard (←/→) saat Street View tertutup */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    var a = RA(); if (!a || !a.cum || svOpen()) return;                 /* saat Street View terbuka, ←/→ ditangani svNav (di bawah) */
    var bar_ = $("routePlayerBar"); if (!bar_ || !bar_.classList.contains("show")) return;
    if (document.querySelector(".modal-overlay.show")) return;
    if (e.key === "Home") seek(0); else if (e.key === "End") seek(a.totalDist);
    else stepSta(e.key === "ArrowRight" ? 1 : -1, e.shiftKey);
    api.commit = true;
    e.preventDefault(); e.stopPropagation();
  }, true);

  /* ------------------------------------------------------------------ tombol Sebelumnya / Berikutnya Street View → geser panah */
  function wrapSvNav() {
    var f = window.svNav;
    if (typeof f !== "function") return setTimeout(wrapSvNav, 400);
    if (f.__pqSc) return;
    var w = function (dir) {
      var a = RA(), S = SV();
      if (a && a.cum && S && S.type === "geo") {          /* mode animasi: pindah ke titik STA sebelumnya/berikutnya */
        var fine = false;
        try { fine = !!(window.event && window.event.shiftKey); } catch (e) {}
        stepSta(dir < 0 ? -1 : 1, fine);
        return;
      }
      return f.apply(this, arguments);
    };
    w.__pqSc = 1; window.svNav = w;
  }
  wrapSvNav();

  /* ------------------------------------------------------------------ dekorasi panah + status jeda (ringan) */
  function decorate() {
    var a = RA();
    document.body.classList.toggle("pq-sc-paused", !!(a && !a.playing));
    var bar_ = $("routePlayerBar");
    if (bar_) bar_.classList.toggle("pq-noseek", !!(a && a.queueMode));
    wireBar(); wireButtons();
    if (!a || !a.marker || !a.marker._icon) return;
    var v = a.marker._icon.querySelector(".route-vehicle");
    if (v && !v.querySelector(".pq-sc-hint")) {
      var h = document.createElement("div"); h.className = "pq-sc-hint"; h.innerHTML = "<i></i><i></i>";
      v.appendChild(h);
    }
    if (a && !drag && !bar.on) playIcon(a);               /* ikon Play/Jeda selalu sesuai status */
  }
  setInterval(decorate, 300);

  /* ------------------------------------------------------------------ pasang pendengar pointer pada peta */
  function init() {
    var m = MAP();
    if (!m || !window.L) return setTimeout(init, 500);
    m.getContainer().addEventListener("pointerdown", onDown, true);   /* capture: sebelum Leaflet memulai geser peta */
    try { console.info("[PETAQU] geser panah animasi rute aktif (scrub v1)"); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
