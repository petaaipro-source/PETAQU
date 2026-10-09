/* PETAQU — Panel animasi rute (Play) ADAPTIF & tidak pernah tertutup
   • Menghitung area peta yang benar-benar terlihat (di luar panel Street View mode terbagi kanan/bawah,
     sidebar, dan layar penuh) lalu menaruh panel di tengah area itu.
   • Lebar panel menyusut otomatis; saat sempit tombol kecepatan turun ke baris kedua, saat sangat sempit
     tombol diperkecil.
   • Street View mode layar penuh: panel diangkat di atas Street View agar tombol tetap terjangkau.
   • Panel yang digeser manual tetap dijaga di dalam area terlihat (tidak lari ke bawah Street View).
   • Dua kali klik panel = kembali ke posisi otomatis (perilaku lama tetap).
   • PANAH/KENDARAAN RUTE ikut adaptif: saat kamera mengikuti, panah diletakkan di tengah area peta yang
     benar-benar terlihat (di luar Street View, panel animasi, & toolbar kanan) — bukan di tengah seluruh
     peta. Saat Street View dibuka/diubah ukurannya atau panel berpindah, panah otomatis digeser masuk
     ke area terlihat (juga saat kamera-ikut dimatikan atau animasi dijeda).
   • LABEL STA di atas panah (STA berjalan + km), berdenyut tiap melewati titik STA, warnanya mengikuti warna ruas.
   • v4: (a) TITIK BIRU posisi Street View di peta disembunyikan selama panel animasi tampil — posisi sudah
     ditunjukkan ikon kendaraan, jadi tidak ada lagi dua penanda yang bertumpuk. (b) Panel selalu berada DI ATAS
     kontrol peta (z-index) dan tombol zoom +/− beserta skala jarak otomatis NAIK tepat di atas panel bila
     bertabrakan (HP/layar sempit); toolbar kanan ikut memendek agar tidak menimpa tombol zoom.
   • Ringan: tanpa timer polling; ResizeObserver/MutationObserver + 1 rAF per perubahan; rect di-cache 250 ms. */
(function () {
  "use strict";
  if (window.__pqPlayFit) return;
  var M = 8;                       // margin aman dari tepi area terlihat (px)
  var css = [
    "#routePlayerBar:not(.dragged){left:var(--pqf-x,50%);bottom:var(--pqf-b,18px);width:min(580px,var(--pqf-w,94vw));max-width:var(--pqf-w,94vw);box-sizing:border-box}",
    "#routePlayerBar.dragged{max-width:var(--pqf-w,94vw);box-sizing:border-box}",
    "#routePlayerBar{transition:left .22s ease,bottom .22s ease,width .22s ease}",
    "#routePlayerBar.dragging{transition:none}",
    "#routePlayerBar.pqf-wrap{flex-wrap:wrap;padding:8px 10px;row-gap:6px}",
    "#routePlayerBar.pqf-wrap .rp-info{order:4;width:100%;flex-basis:100%}",
    "#routePlayerBar.pqf-wrap #routePlayerFollowBtn{margin-left:auto}",
    "#routePlayerBar.pqf-xs{padding:6px 8px;gap:6px;border-radius:12px}",
    "#routePlayerBar.pqf-xs .rp-btn{width:28px;height:28px;font-size:11px}",
    "#routePlayerBar.pqf-xs .rp-meta{font-size:11.5px}",
    "#routePlayerBar.pqf-over{z-index:5100}",
    "html body #routePlayerBar{z-index:1100}",
    "html body #routePlayerBar.pqf-over{z-index:5100}",
    /* v4a: titik biru Street View disembunyikan selama animasi (kendaraan sudah menandai posisi) */
    "html body.pqf-anim .pq-sv-live-wrap{display:none!important}",
    /* v4b: zoom +/− & skala naik di atas panel; toolbar kanan memendek mengikuti */
    "html body .leaflet-bottom.leaflet-right{transition:margin-bottom .22s ease}",
    "html body.pqf-lift .leaflet-bottom.leaflet-right{margin-bottom:var(--pqf-zb,0px)}",
    "html body.pqf-tbfit #mapToolbar{bottom:max(118px,var(--pqf-tb,0px))!important}",
    "@media(max-width:860px){html body.pqf-tbfit #mapToolbar{bottom:max(128px,var(--pqf-tb,0px))!important}}",
    /* ruang kolom kanan terlalu pendek untuk toolbar + zoom → zoom bergeser ke kiri toolbar */
    "html body.pqf-side .leaflet-bottom.leaflet-right{padding-right:calc(var(--pq-edge) + 54px)}",
    ".pqf-sta{position:absolute;left:50%;bottom:calc(100% + 7px);transform:translateX(-50%);pointer-events:none;white-space:nowrap;display:flex;flex-direction:column;align-items:center;z-index:6}",
    ".pqf-sta b{position:relative;font:800 13px var(--mono,ui-monospace,monospace);letter-spacing:.3px;color:#22d3ee;background:#0b1220ee;border:1.5px solid var(--pqf-c,#22d3ee);border-radius:10px;padding:3px 9px;box-shadow:0 4px 14px #000a,0 0 12px #22d3ee40}",
    ".pqf-sta b:after{content:'';position:absolute;left:50%;bottom:-6px;width:8px;height:8px;background:#0b1220;border-right:1.5px solid var(--pqf-c,#22d3ee);border-bottom:1.5px solid var(--pqf-c,#22d3ee);transform:translateX(-50%) rotate(45deg)}",
    ".pqf-sta small{margin-top:3px;font:700 9.5px var(--mono,ui-monospace,monospace);color:#e2e8f0;text-shadow:0 0 3px #000,0 1px 2px #000}",
    "@keyframes pqfPop{0%{transform:scale(1.2)}100%{transform:scale(1)}}",
    ".pqf-sta b.pqf-pulse{animation:pqfPop .35s ease-out}"
  ].join("\n");
  var st = document.createElement("style");
  st.id = "pq-playfit-css"; st.textContent = css; document.head.appendChild(st);

  function $(id) { return document.getElementById(id); }

  /* Fungsi murni (mudah diuji): hitung area bebas dari kotak peta & kotak overlay Street View. */
  function calcFree(map, ov, vw, vh) {
    var free = { left: map.left, right: map.right, top: map.top, bottom: map.bottom, over: false };
    if (!ov || ov.width < 2 || ov.height < 2) return free;
    var fullW = ov.width >= vw * 0.9, fullH = ov.height >= vh * 0.9;
    if (fullW && fullH) { free.over = true; return free; }          // Street View layar penuh
    if (fullW) free.bottom = Math.min(free.bottom, ov.top);          // terbagi bawah (HP)
    else if (fullH || ov.right >= vw - 2) free.right = Math.min(free.right, ov.left); // terbagi kanan (desktop)
    return free;
  }


  /* ====== Panah/kendaraan rute: selalu di area terlihat ====== */
  var vis = null, visT = 0, dirty = true, ensureTm = 0, PAD = 24;
  function MAP() { try { return typeof map !== "undefined" ? map : null; } catch (e) { return null; } }
  function RA() { try { return typeof routeAnim !== "undefined" ? routeAnim : null; } catch (e) { return null; } }

  /* Murni: kurangi area bebas dengan panel animasi (atas/bawah) & toolbar kanan, lalu beri bantalan. */
  function shrink(f, bar, tb, pad) {
    var r = { left: f.left, right: f.right, top: f.top, bottom: f.bottom };
    if (bar && bar.width > 0 && bar.right > r.left && bar.left < r.right && bar.bottom > r.top && bar.top < r.bottom) {
      if ((bar.top + bar.bottom) / 2 >= (r.top + r.bottom) / 2) r.bottom = Math.min(r.bottom, bar.top - 8);
      else r.top = Math.max(r.top, bar.bottom + 8);
    }
    if (tb && tb.width > 0 && tb.left > r.left + (r.right - r.left) * 0.5 && tb.left < r.right) r.right = tb.left - 8;
    r.left += pad; r.right -= pad; r.top += pad; r.bottom -= pad;
    return (r.right - r.left < 60 || r.bottom - r.top < 60) ? null : r;
  }

  function getVis() {
    var now = Date.now();
    if (!dirty && now - visT < 250) return vis;
    var map = $("map"); if (!map) return (vis = null);
    var mr = map.getBoundingClientRect(), ovEl = $("svOverlay"), ov = null;
    if (ovEl && ovEl.classList.contains("show")) ov = ovEl.getBoundingClientRect();
    var f = calcFree(mr, ov, window.innerWidth, window.innerHeight);
    var bar = $("routePlayerBar"), tb = $("mapToolbar");
    var br = bar && bar.classList.contains("show") ? bar.getBoundingClientRect() : null;
    var tr = tb && tb.offsetWidth > 0 ? tb.getBoundingClientRect() : null;
    vis = shrink(f, br, tr, PAD);
    if (vis) { if (vis.bottom - (vis.top + 36) >= 60) vis.top += 36; vis.mr = mr; }
    visT = now; dirty = false; return vis;
  }

  function same(a, b) { return a && b && Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9; }

  /* Geser pusat peta agar titik ll tampil di tengah area terlihat (memakai koordinat layar → aman saat peta berputar). */
  function shifted(m, ll) {
    var v = getVis(); if (!v) return ll;
    var sz = m.getSize(), P = { x: (v.left + v.right) / 2 - v.mr.left, y: (v.top + v.bottom) / 2 - v.mr.top };
    var dx = sz.x / 2 - P.x, dy = sz.y / 2 - P.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return ll;
    var Vc = m.latLngToContainerPoint(ll);
    return m.containerPointToLatLng(L.point(Vc.x + dx, Vc.y + dy));
  }


  /* ====== Label STA di atas panah (ikut bergerak, berdenyut tiap melewati titik STA) ====== */
  var lastSta = "", lastKm = "", lastSeg = -1;
  function staLabel() {
    var a = RA(); if (!a || !a.marker) return;
    var ic = a.marker._icon; if (!ic) return;
    var box = ic.querySelector(".pqf-sta");
    if (!box) {
      box = document.createElement("div"); box.className = "pqf-sta";
      box.innerHTML = "<b></b><small></small>"; ic.appendChild(box); lastSta = lastKm = ""; lastSeg = -1;
    }
    var sEl = $("routePlayerSta"), kEl = $("routePlayerKm");
    var sta = sEl ? sEl.textContent : "", km = kEl ? kEl.textContent : "";
    var b = box.firstChild, sm = box.lastChild;
    if (sta !== lastSta) { b.textContent = sta; lastSta = sta; }
    if (km !== lastKm) { sm.textContent = km; lastKm = km; }
    if (a.color) box.style.setProperty("--pqf-c", a.color);
    try {
      var seg = typeof findSegmentAtDistance === "function" ? findSegmentAtDistance(a.cum, a.traveledDist) : -1;
      if (lastSeg !== -1 && seg !== lastSeg) { b.classList.remove("pqf-pulse"); void b.offsetWidth; b.classList.add("pqf-pulse"); }
      lastSeg = seg;
    } catch (e) {}
  }

  var inFrame = false;
  function wrapFrame() {   // jalur kedua: semua panTo selama satu frame animasi dianggap panTo kendaraan
    var o = window.updateRouteAnimVisual;
    if (typeof o !== "function" || o.__pqf) return;
    var w = function () { inFrame = true; var r; try { r = o.apply(this, arguments); } finally { inFrame = false; } try { staLabel(); } catch (e) {} return r; };
    w.__pqf = 1; window.updateRouteAnimVisual = w;
  }
  function isVeh(ll) {
    var a = RA(); if (!a || !a.followCamera || !a.marker || !ll) return false;
    if (inFrame) return true;
    try { return same(L.latLng(ll), a.marker.getLatLng()); } catch (e) { return false; }
  }

  function patchMap() {
    var m = MAP();
    if (!m || !m.panTo || !window.L) return setTimeout(patchMap, 600);
    wrapFrame();
    if (m.__pqf) return; m.__pqf = 1;
    try { console.info("[PETAQU] panel & panah animasi adaptif aktif (playfit v4)"); } catch (e) {}
    var oPan = m.panTo, oFly = m.flyTo;
    m.panTo = function (ll, o) {
      try { if (isVeh(ll)) ll = shifted(this, L.latLng(ll)); } catch (e) {}
      return oPan.call(this, ll, o);
    };
    m.flyTo = function (ll, z, o) {
      try {
        if (isVeh(ll)) {
          var v = getVis(), zz = z == null ? this.getZoom() : z;
          if (v) {
            var sz = this.getSize(), px = this.project(L.latLng(ll), zz);
            var P = { x: (v.left + v.right) / 2 - v.mr.left, y: (v.top + v.bottom) / 2 - v.mr.top };
            ll = this.unproject(px.add([sz.x / 2 - P.x, sz.y / 2 - P.y]), zz);
          }
        }
      } catch (e) {}
      return oFly.call(this, ll, z, o);
    };
  }

  /* Setelah tata letak berubah: pastikan panah terlihat (ikuti kamera → pusatkan; tidak ikut → geser seperlunya). */
  function ensureMarker() {
    var a = RA(), m = MAP(); if (!a || !a.marker || !m || !m.panBy) return;
    var ll = a.marker.getLatLng(), v = getVis(); if (!v) return;
    if (a.followCamera) { m.panTo(ll, { animate: true, duration: 0.3 }); return; }
    var pt = m.latLngToContainerPoint(ll), x = pt.x + v.mr.left, y = pt.y + v.mr.top, dx = 0, dy = 0;
    if (x < v.left) dx = x - v.left; else if (x > v.right) dx = x - v.right;
    if (y < v.top) dy = y - v.top; else if (y > v.bottom) dy = y - v.bottom;
    if (dx || dy) m.panBy([dx, dy], { animate: true, duration: 0.3 });
  }
  function queueEnsure() { dirty = true; clearTimeout(ensureTm); ensureTm = setTimeout(ensureMarker, 320); }

  var raf = 0;
  function schedule() { queueEnsure(); if (!raf) raf = requestAnimationFrame(function () { raf = 0; apply(); }); }

  function apply() {
    var bar = $("routePlayerBar"), map = $("map");
    if (!bar || !map) return;
    var par = bar.offsetParent || map, pr = par.getBoundingClientRect(), mr = map.getBoundingClientRect();
    var ovEl = $("svOverlay"), ov = null;
    if (ovEl && ovEl.classList.contains("show")) ov = ovEl.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var f = calcFree(mr, ov, vw, vh);
    var avail = Math.max(220, Math.floor(f.right - f.left - M * 2));
    var cx = (f.left + f.right) / 2 - pr.left;
    var base = 18, b;
    if (f.over) b = Math.max(base, pr.bottom - mr.bottom) + 150;     // di atas HUD Street View
    else b = base + Math.max(0, pr.bottom - f.bottom);
    var s = bar.style;
    s.setProperty("--pqf-x", Math.round(cx) + "px");
    s.setProperty("--pqf-w", avail + "px");
    s.setProperty("--pqf-b", Math.round(b) + "px");
    bar.classList.toggle("pqf-wrap", avail < 590);
    bar.classList.toggle("pqf-xs", avail < 340);
    bar.classList.toggle("pqf-over", !!f.over);
    try { dodge(bar, pr, f, cx, avail, b); } catch (e) {}

    if (bar.classList.contains("dragged") && !bar.classList.contains("dragging")) {
      var r = bar.getBoundingClientRect(), L = parseFloat(s.left) || 0, T = parseFloat(s.top) || 0;
      var dx = 0, dy = 0;
      if (r.right > f.right - M) dx = (f.right - M) - r.right;
      if (r.left + dx < f.left + M) dx = (f.left + M) - r.left;
      if (r.bottom > f.bottom - M) dy = (f.bottom - M) - r.bottom;
      if (r.top + dy < mr.top + M) dy = (mr.top + M) - r.top;
      if (dx) s.left = Math.round(L + dx) + "px";
      if (dy) s.top = Math.round(T + dy) + "px";
    }
  }

  /* v4: tandai mode animasi di <body> & angkat zoom/skala bila panel menutupinya (hanya ubah kelas bila berubah → tanpa loop). */
  function flag(cls, on) { var c = document.body.classList; if (c.contains(cls) !== on) c.toggle(cls, on); }
  function dodge(bar, pr, f, cx, avail, b) {
    var shown = bar.classList.contains("show"), root = document.documentElement.style;
    flag("pqf-anim", shown);
    var lift = 0;
    var z = document.querySelector(".leaflet-control-zoom");
    if (shown && !f.over && z && z.offsetWidth > 0) {
      var zr = z.getBoundingClientRect(), w = Math.min(580, avail);
      var bl = pr.left + cx - w / 2, br = bl + w, top = null;  // kotak panel (target, bukan nilai tengah-transisi)
      if (bar.classList.contains("dragged")) {                 // digeser manual → pakai kotak aktual
        var rr = bar.getBoundingClientRect(); bl = rr.left; br = rr.right; top = rr.top;
      }
      if (br > zr.left - 6 && bl < zr.right + 6) {
        var mb = document.getElementById("map").getBoundingClientRect().bottom;
        lift = Math.max(0, Math.round(top == null ? b + bar.offsetHeight + 8 : mb - top + 8));
      }
    }
    var fit = false, side = false;
    if (lift > 0) {
      root.setProperty("--pqf-zb", lift + "px"); root.setProperty("--pqf-tb", (lift + 92) + "px");
      var tb = document.getElementById("mapToolbar"), mr = document.getElementById("map").getBoundingClientRect();
      var room = tb ? (mr.bottom - (lift + 92)) - tb.getBoundingClientRect().top : 999;
      fit = room >= 130; side = !fit;                          // toolbar masih layak (≥ ±3 tombol) → pendekkan; kalau tidak → zoom ke samping
      if (side) root.setProperty("--pqf-tb", lift + "px");     // mode samping: toolbar berhenti tepat di atas panel (bisa di-scroll)
    }
    flag("pqf-lift", lift > 0); flag("pqf-tbfit", lift > 0); flag("pqf-side", side);
  }

  function init() {
    var bar = $("routePlayerBar"), map = $("map"), ov = $("svOverlay");
    if (!bar || !map) return setTimeout(init, 500);
    try {
      var ro = new ResizeObserver(schedule);
      ro.observe(map); if (ov) ro.observe(ov); ro.observe(document.documentElement);
    } catch (e) {}
    try {
      var mo = new MutationObserver(schedule);
      if (ov) mo.observe(ov, { attributes: true, attributeFilter: ["class", "style"] });
      mo.observe(bar, { attributes: true, attributeFilter: ["class"] });
      var sb = $("sidebar"); if (sb) mo.observe(sb, { attributes: true, attributeFilter: ["class"] });
      mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    } catch (e) {}
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", function () { setTimeout(schedule, 250); });
    document.addEventListener("transitionend", function (e) {
      if (e.target && (e.target.id === "svOverlay" || e.target.id === "sidebar" || e.target.id === "map")) schedule();
    }, true);
    // dua kali klik = kembali ke posisi otomatis (handler lama menghapus .dragged; kita hitung ulang)
    bar.addEventListener("dblclick", function () { setTimeout(schedule, 0); });
    schedule(); patchMap();
  }

  window.__pqPlayFit = { v: 4, calcFree: calcFree, apply: apply, shrink: shrink };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
