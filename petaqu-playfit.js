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
    "#routePlayerBar.pqf-wrap{flex-wrap:wrap;padding:10px}",
    "#routePlayerBar.pqf-wrap .rp-info{order:4;width:100%;flex-basis:100%}",
    "#routePlayerBar.pqf-wrap .rp-speeds{order:5;width:100%;justify-content:center;margin-top:2px}",
    "#routePlayerBar.pqf-xs{padding:8px;gap:8px;border-radius:14px}",
    "#routePlayerBar.pqf-xs .rp-btn{width:32px;height:32px;font-size:12px}",
    "#routePlayerBar.pqf-xs .rp-meta{font-size:12px}",
    "#routePlayerBar.pqf-xs .rp-speed-btn{padding:4px 6px}",
    "#routePlayerBar.pqf-over{z-index:5100}"
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
    vis = shrink(f, br, tr, PAD); if (vis) vis.mr = mr;
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

  function isVeh(ll) {
    var a = RA(); if (!a || !a.followCamera || !a.marker || !ll) return false;
    try { return same(L.latLng(ll), a.marker.getLatLng()); } catch (e) { return false; }
  }

  function patchMap() {
    var m = MAP();
    if (!m || !m.panTo || !window.L) return setTimeout(patchMap, 600);
    if (m.__pqf) return; m.__pqf = 1;
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
    bar.classList.toggle("pqf-wrap", avail < 500);
    bar.classList.toggle("pqf-xs", avail < 340);
    bar.classList.toggle("pqf-over", !!f.over);

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

  window.__pqPlayFit = { calcFree: calcFree, apply: apply, shrink: shrink };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
