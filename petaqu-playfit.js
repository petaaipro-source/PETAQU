/* PETAQU — Panel animasi rute (Play) ADAPTIF & tidak pernah tertutup
   • Menghitung area peta yang benar-benar terlihat (di luar panel Street View mode terbagi kanan/bawah,
     sidebar, dan layar penuh) lalu menaruh panel di tengah area itu.
   • Lebar panel menyusut otomatis; saat sempit tombol kecepatan turun ke baris kedua, saat sangat sempit
     tombol diperkecil.
   • Street View mode layar penuh: panel diangkat di atas Street View agar tombol tetap terjangkau.
   • Panel yang digeser manual tetap dijaga di dalam area terlihat (tidak lari ke bawah Street View).
   • Dua kali klik panel = kembali ke posisi otomatis (perilaku lama tetap).
   • Ringan: tanpa timer; hanya ResizeObserver/MutationObserver + 1 rAF per perubahan. */
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

  var raf = 0;
  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; apply(); }); }

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
    schedule();
  }

  window.__pqPlayFit = { calcFree: calcFree, apply: apply };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
