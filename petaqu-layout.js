/* PETAQU — Pengatur tata letak panel kiri (Layout Manager).
   Masalah yang diselesaikan:
     • Panel Jalan Nasional / Patok KM / Kabupaten / Tol & Provinsi / Transparansi / menu Folder
       masing-masing punya posisi `left` sendiri (364 / 530 / 668 px ...), sehingga bergeser
       tidak sama saat sidebar dibuka-tutup dan bisa saling tumpuk.
     • Tinggi panel tidak memperhitungkan legenda di kiri-bawah, sehingga menutupi legenda.
   Cara kerja:
     1. SATU panel aktif: begitu satu panel dibuka, panel kiri lainnya (dan menu folder) otomatis
        ditutup. Yang dibuka terakhir yang menang. Esc menutup panel aktif.
     2. SATU geometri: semua panel memakai --pq-fl (kiri, mengikuti sidebar dengan transisi mulus)
        dan --pq-pt (atas, tepat di bawah tombol folder).
     3. TINGGI OTOMATIS: --pq-avail = ruang kosong antara panel dan legenda (atau tepi layar).
        Isi panel yang lebih tinggi di-scroll di dalam panel, daftar ruas ikut melebar/menyusut.
     4. LEGENDA MENYESUAIKAN: bila ruang tidak cukup, legenda diciutkan jadi satu baris
        ("Legenda ▴"); klik untuk menutup panel dan menampilkan legenda penuh lagi.
   Tidak mengubah logika modul lain: hanya CSS tambahan + pengamat kelas `.open`. */
(function () {
  "use strict";
  if (window.__pqLayout) return;
  window.__pqLayout = 1;

  var $ = function (id) { return document.getElementById(id); };
  var GAP = 10;          /* jarak aman panel ke legenda */
  var CAP_PANEL = 640;   /* tinggi maks. panel berdaftar */
  var MIN_AVAIL = 150;

  /* id elemen "pemilik" status .open ; el geometri = elemen yang benar-benar tampil */
  var P = [
    { id: "pqFolderCard", geo: "pqFolderCard" },
    { id: "jnPanel", geo: "jnPanel" },
    { id: "pkPanel", geo: "pkPanel" },
    { id: "kbPanel", geo: "kbPanel" },
    { id: "tlPanel", geo: "tlPanel" },
    { id: "jtFloat", geo: null, sub: ".jt-fp" }
  ];

  var ALL = "#jnPanel,#pkPanel,#kbPanel,#tlPanel";
  function sel(suffix) {
    return ["jnPanel", "pkPanel", "kbPanel", "tlPanel"].map(function (i) {
      return "html body #" + i + "[id]" + (suffix || "");
    }).join(",");
  }

  var CSS = [
    ":root{--pq-pt:calc(var(--pq-ft,70px) + 52px);--pq-avail:calc(100dvh - var(--pq-pt) - 24px)}",

    /* ---- 1. geometri tunggal untuk semua panel kiri ---- */
    sel(".open") + ",html body #pqFolderCard[id].open{position:fixed!important;left:var(--pq-fl,364px)!important;top:var(--pq-pt)!important;right:auto!important;bottom:auto!important;margin:0!important;transform:none;box-sizing:border-box;max-width:calc(100vw - var(--pq-fl,10px) - 10px);transition:left .25s ease,max-height .2s ease;animation:pqLayIn .18s ease-out;overscroll-behavior:contain}",
    sel(".open") + "{max-height:min(var(--pq-avail),var(--pq-cap,640px))!important}",
    "html body #pqFolderCard[id].open{max-height:var(--pq-avail)!important}",
    "html body #jtFloat.open .jt-fp[class]{max-height:min(var(--pq-avail),var(--pq-cap,640px))!important;overflow:auto;animation:pqLayIn .18s ease-out;overscroll-behavior:contain}",
    "@keyframes pqLayIn{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}",
    "@media(prefers-reduced-motion:reduce){html body :is(" + ALL + ",#pqFolderCard).open,html body #jtFloat.open .jt-fp{animation:none!important;transition:none!important}}",
    "@media(max-width:600px){html body :is(" + ALL + ",#pqFolderCard).open{width:calc(100vw - 20px)!important}}",

    /* ---- 2. isi panel: kepala tetap, badan scroll, daftar melebar mengisi sisa ruang ---- */
    sel(".open .body") + "{min-height:0;flex:1 1 auto;overscroll-behavior:contain}",
    sel(".open .body>*") + "{flex:none}",
    sel(".open .body>#jnList") + "," + sel(".open .body>#pkList") + "," + sel(".open .body>#kbMain") + "{flex:1 1 auto;min-height:130px;max-height:none!important;overflow:auto;overscroll-behavior:contain}",
    sel(".open header") + "{flex:none}",

    /* scrollbar tipis serasi tema */
    ":is(" + ALL + ",#pqFolderCard,.jt-fp,#jnList,#pkList,#kbMain,.body){scrollbar-width:thin;scrollbar-color:#22d3ee55 transparent}",
    ":is(" + ALL + ",#pqFolderCard,.jt-fp,#jnList,#pkList,#kbMain,.body)::-webkit-scrollbar{width:6px}",
    ":is(" + ALL + ",#pqFolderCard,.jt-fp,#jnList,#pkList,#kbMain,.body)::-webkit-scrollbar-thumb{background:#22d3ee44;border-radius:6px}",

    /* ---- 3. legenda ciut saat ruang sempit ---- */
    "html body #legend.pq-lg-mini{cursor:pointer;padding:7px 12px;max-width:none!important;transition:background .15s,border-color .15s}",
    "html body #legend.pq-lg-mini:hover{border-color:#22d3ee;background:#0f1521}",
    "html body #legend.pq-lg-mini>:not(b){display:none!important}",
    "html body #legend.pq-lg-mini>b{display:flex!important;align-items:center;gap:8px;margin:0!important;white-space:nowrap}",
    "html body #legend.pq-lg-mini>b::after{content:'\\25B4';margin-left:auto;font-size:10px;opacity:.7}"
  ].join("\n");

  var prev = {};
  var raf = 0;
  var legend = null, fullH = 0, gapB = 14;
  var watched = new WeakSet();

  function el(p) {
    var o = $(p.id);
    if (!o) return null;
    return p.geo ? o : o.querySelector(p.sub);
  }
  function isOpen(p) {
    var o = $(p.id);
    return !!(o && o.classList.contains("open"));
  }
  function states() {
    var s = {};
    P.forEach(function (p) { s[p.id] = isOpen(p); });
    return s;
  }
  function openList() { return P.filter(isOpen); }

  function close(p) {
    var o = $(p.id);
    if (!o || !o.classList.contains("open")) return;
    if (p.id === "pqFolderCard") { var b = $("pqFolder"); if (b) b.click(); else o.classList.remove("open"); }
    else if (p.id === "jtFloat") { var fb = o.querySelector(".jt-fb"); if (fb) fb.click(); else o.classList.remove("open"); }
    else o.classList.remove("open");
  }

  /* tepi atas area panel: tepat di bawah tombol folder; cadangan bila tombol disembunyikan */
  function panelTop() {
    var b = $("pqFolder");
    if (b) {
      var r = b.getBoundingClientRect();
      if (r.height > 0) return Math.round(r.bottom + 8);
    }
    return innerWidth <= 860 ? 118 : 122;
  }

  function legendShown() {
    return !!(legend && legend.isConnected && getComputedStyle(legend).display !== "none" && legend.offsetHeight > 0);
  }

  function update() {
    raf = 0;
    legend = legend || $("legend");
    var open = openList();
    var vh = innerHeight;
    var top = panelTop();
    var shown = legendShown();

    /* ukuran legenda penuh (diukur hanya saat tidak diciutkan) */
    if (shown && !legend.classList.contains("pq-lg-mini") && !legend.classList.contains("pq-lg-min")) {
      var r0 = legend.getBoundingClientRect();
      fullH = r0.height;
      gapB = Math.max(0, vh - r0.bottom);
    }

    var cur = open.length ? el(open[open.length - 1]) : null;
    var mini = false;
    if (cur && shown && fullH > 60) {
      var availFull = vh - gapB - fullH - GAP - top;
      /* menu folder: ingin semua baris terlihat; panel berdaftar: cukup ±380px lalu daftar di-scroll */
      var nat = (cur.scrollHeight || 0) + 2;
      var want = cur.id === "pqFolderCard" ? nat : Math.min(nat, 380);
      mini = availFull < want;
    }
    if (legend) {
      legend.classList.toggle("pq-lg-mini", mini);
      if (mini) legend.title = "Klik untuk menutup panel dan melihat legenda lengkap";
      else legend.removeAttribute("title");
    }

    /* ruang tersedia: sampai tepi atas legenda (bila tampil), selain itu sampai tepi layar */
    var bottomLimit = vh - 14;
    if (shown) bottomLimit = Math.min(bottomLimit, legend.getBoundingClientRect().top - GAP);
    var avail = Math.max(MIN_AVAIL, Math.floor(bottomLimit - top));
    var root = document.documentElement.style;
    if (root.getPropertyValue("--pq-avail") !== avail + "px") root.setProperty("--pq-avail", avail + "px");
  }

  function sched() {
    if (!raf) raf = requestAnimationFrame(update);
  }

  /* satu panel aktif: yang baru dibuka menang */
  function onClass() {
    var now = states();
    var fresh = P.filter(function (p) { return now[p.id] && !prev[p.id]; });
    if (fresh.length && openList().length > 1) {
      var keep = fresh[fresh.length - 1];
      P.forEach(function (p) { if (p !== keep) close(p); });
    }
    prev = states();
    update(); /* sinkron: tinggi benar sejak frame pertama, tanpa kedip */
  }

  var mo = new MutationObserver(onClass);
  function wire() {
    P.forEach(function (p) {
      var o = $(p.id);
      if (o && !watched.has(o)) { watched.add(o); mo.observe(o, { attributes: true, attributeFilter: ["class"] }); }
    });
    var lg = $("legend");
    if (lg && !watched.has(lg)) {
      watched.add(lg);
      legend = lg;
      new MutationObserver(sched).observe(lg, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
      if (window.ResizeObserver) new ResizeObserver(sched).observe(lg);
      lg.addEventListener("click", function () {
        if (lg.classList.contains("pq-lg-mini")) openList().forEach(close);
      });
    }
  }

  function init() {
    if (!$("pqLayoutMgrCss")) {
      var s = document.createElement("style");
      s.id = "pqLayoutMgrCss";
      s.textContent = CSS;
      /* di akhir body: menang atas <style> lain yang sama spesifisitasnya */
      (document.body || document.head).appendChild(s);
    }
    wire();
    prev = states();
    update();

    /* sidebar / mode peta penuh / cuaca mengubah geometri */
    new MutationObserver(function () { sched(); setTimeout(sched, 300); })
      .observe(document.body, { attributes: true, attributeFilter: ["class"] });
    addEventListener("resize", sched);
    addEventListener("orientationchange", function () { setTimeout(sched, 300); });
    /* isi panel berubah (cari / filter / centang): ukur ulang ringan */
    document.addEventListener("input", sched, true);
    document.addEventListener("click", function () { sched(); }, true);

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var o = openList();
      if (o.length) { close(o[o.length - 1]); }
    });

    /* modul lain membuat elemen belakangan (panel Transparansi, Tol): pasang pengamat saat muncul */
    var n = 0, t = setInterval(function () { wire(); if (++n > 40) clearInterval(t); }, 500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
