/* PETAQU — Aksi Peta: (1) cabang opsi tombol "Lihat Semua Ruas", (2) Screenshot & Rekam layar dengan crop bebas.
   Tidak mengubah logika lama: hanya menambah tombol di #mapToolbar dan memanggil fungsi yang sudah ada
   (fitAllBounds, focusRoad, showAll, persist, renderRoadList). */
(function () {
  "use strict";
  if (window.__pqAksi) return;
  window.__pqAksi = 1;

  var KEY = "petaqu_aksi_v1";
  var cfg = { iso: false, sys: true, mic: false, q: "0", fps: 30, fmt: "auto", rect: null, ratio: "free" };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function note(m, err) { try { if (typeof toast === "function") { toast(m, !!err); return; } } catch (e) {} console.log(m); }
  function gmap() { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } }
  function gRoads() { try { return typeof roads !== "undefined" && Array.isArray(roads) ? roads : []; } catch (e) { return []; } }
  function fmt(n, d) { return Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: d == null ? 1 : d }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function stamp() { var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }

  /* ================= GAYA ================= */
  var css = document.createElement("style");
  css.id = "pqAksiCss";
  css.textContent = [
    "#mapToolbar .tool-btn{position:relative}",
    ".pqa-caret{position:absolute;left:1px;bottom:1px;width:15px;height:15px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#22d3ee;background:#04121acc;border:1px solid #22d3ee66;cursor:pointer;line-height:1}",
    ".pqa-caret:hover{background:#22d3ee;color:#04121a}",
    ".pqa-pulse{animation:pqaPulse 1.4s ease 3}@keyframes pqaPulse{0%,100%{box-shadow:0 0 0 0 #22d3ee00}50%{box-shadow:0 0 0 6px #22d3ee55}}",
    "#pqaMenu{position:fixed;z-index:99980;width:262px;max-width:calc(100vw - 20px);max-height:calc(100dvh - 20px);overflow:auto;overscroll-behavior:contain;padding:8px;border-radius:14px;background:#0a0e17f2;border:1px solid #22d3ee55;box-shadow:0 12px 36px #000a;backdrop-filter:blur(10px);color:#e6edf5;font:600 12.5px/1.3 system-ui,sans-serif;display:none}",
    "#pqaMenu.open{display:block}",
    "#pqaMenu .m-h{padding:4px 6px 8px;font-size:12px;color:#e6edf5}#pqaMenu .m-h small{display:block;font-weight:500;color:#8fa6bd;font-size:10.5px;margin-top:2px}",
    "#pqaMenu .m-r{display:flex;align-items:center;gap:10px;width:100%;padding:7px 8px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;animation:pqaFan .22s both;animation-delay:calc(var(--i,0)*26ms)}",
    "@keyframes pqaFan{from{opacity:0;transform:translateX(16px) scale(.96)}to{opacity:1;transform:none}}",
    "#pqaMenu .m-r:hover,#pqaMenu .m-r:focus-visible{background:#22d3ee1c;outline:0}#pqaMenu .m-r[disabled]{opacity:.38;pointer-events:none}",
    "#pqaMenu .m-i{flex:none;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--c,#22d3ee);color:var(--c,#22d3ee);background:#0f1726;font-size:12px}",
    "#pqaMenu .m-t{flex:1;min-width:0}#pqaMenu .m-t small{display:block;font-weight:500;font-size:10.5px;color:#8fa6bd}",
    "#pqaMenu em{font-style:normal;flex:none;font:800 10px/1 system-ui;padding:3px 7px;border-radius:8px;background:#22d3ee22;color:#67e8f9}",
    "#pqaMenu .m-s{margin:8px 6px 4px;font:800 9.5px/1 system-ui;letter-spacing:.8px;text-transform:uppercase;color:#8fa6bd}",
    "#pqaMenu .m-chk{display:flex;align-items:center;gap:8px;padding:6px 8px;font-weight:600;font-size:11.5px;color:#cbd5e1;cursor:pointer}",
    "#pqaMenu .m-chk input{accent-color:#22d3ee;width:15px;height:15px}",
    "#pqaMenu .m-in{width:100%;box-sizing:border-box;margin:2px 0 4px;padding:8px 10px;border-radius:9px;border:1px solid #22d3ee44;background:#0f1726;color:#e6edf5;font:500 12px system-ui;outline:0}#pqaMenu .m-in:focus{border-color:#22d3ee}",
    "#pqaMenu .m-chips{display:flex;flex-wrap:wrap;gap:5px;padding:2px 4px 4px}",
    "#pqaMenu .m-chip{padding:5px 9px;border-radius:999px;border:1px solid #22d3ee44;background:#0f1726;color:#cbd5e1;font:700 10.5px system-ui;cursor:pointer}#pqaMenu .m-chip:hover{background:#22d3ee;color:#04121a;border-color:#22d3ee}",
    "#pqaMenu .m-chip b{color:#67e8f9;margin-left:3px}#pqaMenu .m-chip:hover b{color:#04121a}",
    "#pqaMenu .m-res{max-height:150px;overflow:auto}",
    "#pqaMenu select{padding:5px 6px;border-radius:8px;border:1px solid #22d3ee44;background:#0f1726;color:#e6edf5;font:600 11px system-ui}",
    "#pqaMenu .m-row2{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 8px;font-size:11.5px;color:#cbd5e1}",
    /* overlay crop */
    "#pqaCrop{position:fixed;inset:0;z-index:99990;pointer-events:none;display:none;font-family:system-ui,sans-serif}",
    "#pqaCrop.show{display:block}",
    "#pqaCrop .r{position:absolute;box-sizing:border-box;border:2px dashed #22d3ee;box-shadow:0 0 0 9999px #0008;cursor:move;pointer-events:auto;touch-action:none}",
    "#pqaCrop.rec .r{box-shadow:none;border:0;outline:2px solid #ef4444;outline-offset:2px;pointer-events:none;cursor:default}",
    "#pqaCrop.pass .r{pointer-events:none}",
    "#pqaCrop .hd{position:absolute;width:22px;height:22px;margin:-11px;border-radius:50%;background:#22d3ee;border:2px solid #04121a;pointer-events:auto;touch-action:none}",
    "#pqaCrop.rec .hd,#pqaCrop.rec .lb{display:none}",
    "#pqaCrop .lb{position:absolute;left:0;top:-26px;padding:3px 8px;border-radius:7px;background:#22d3ee;color:#04121a;font:800 11px/1.2 system-ui;white-space:nowrap;pointer-events:none}",
    "#pqaCrop .r.in .lb{top:6px;left:6px}",
    "#pqaCrop .pn{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;max-width:calc(100vw - 20px);padding:9px 11px;border-radius:14px;background:#0a0e17f5;border:1px solid #22d3ee66;box-shadow:0 10px 30px #000a;pointer-events:auto;color:#e6edf5;font:700 11.5px system-ui}",
    "#pqaCrop.rec .pn{display:none}",
    "#pqaCrop .pn input,#pqaCrop .pn select{padding:6px 7px;border-radius:8px;border:1px solid #22d3ee44;background:#0f1726;color:#e6edf5;font:700 12px system-ui}#pqaCrop .pn input{width:62px}",
    "#pqaCrop .pn button,.pqa-btn{padding:8px 13px;border-radius:10px;border:1px solid #22d3ee66;background:#0f1726;color:#e6edf5;font:800 12px system-ui;cursor:pointer}",
    "#pqaCrop .pn button:hover,.pqa-btn:hover{border-color:#22d3ee}#pqaCrop .pn .go,.pqa-btn.go{background:#22d3ee;border-color:#22d3ee;color:#04121a}#pqaCrop .pn .go.rc,.pqa-btn.rc{background:#ef4444;border-color:#ef4444;color:#fff}",
    "#pqaCrop .pn .on{background:#22d3ee33;border-color:#22d3ee}",
    "#pqaCount{position:fixed;inset:0;z-index:99991;display:none;align-items:center;justify-content:center;pointer-events:none;font:900 120px system-ui;color:#fff;text-shadow:0 4px 30px #000}#pqaCount.show{display:flex}",
    /* pil rekam */
    "#pqaRec{position:fixed;z-index:99992;display:none;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-radius:999px;background:#0a0e17f5;border:1px solid #ef4444;color:#fff;font:800 12px system-ui;box-shadow:0 6px 20px #000a}#pqaRec.show{display:flex}",
    "#pqaRec i{width:10px;height:10px;border-radius:50%;background:#ef4444;animation:pqaBlink 1s infinite}#pqaRec.paused i{animation:none;background:#f59e0b}@keyframes pqaBlink{50%{opacity:.25}}",
    "#pqaRec button{padding:5px 10px;border-radius:999px;border:1px solid #ffffff44;background:#1e293b;color:#fff;font:800 11px system-ui;cursor:pointer}#pqaRec button.st{background:#ef4444;border-color:#ef4444}",
    /* kartu hasil */
    "#pqaRes{position:fixed;z-index:99993;right:14px;bottom:14px;width:min(340px,calc(100vw - 28px));padding:10px;border-radius:14px;background:#0a0e17f7;border:1px solid #22d3ee66;box-shadow:0 14px 40px #000b;color:#e6edf5;font:600 12px system-ui;display:none}#pqaRes.show{display:block}",
    "#pqaRes .pv{width:100%;max-height:200px;object-fit:contain;border-radius:9px;background:#000;display:block}",
    "#pqaRes .tt{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}#pqaRes .tt small{color:#8fa6bd;font-weight:500}",
    "#pqaRes .pqa-cs{margin-top:7px;color:#9db3c9;font-weight:500;font-size:11px}#pqaRes .pqa-bar{height:5px;border-radius:3px;background:#ffffff1a;overflow:hidden;margin-bottom:5px}#pqaRes .pqa-bar i{display:block;height:100%;background:#22d3ee;transition:width .25s}#pqaRes .pqa-btn:disabled{opacity:.45;cursor:default}",
    "#pqaRes .bs{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}#pqaRes .x{border:0;background:transparent;color:#8fa6bd;font-size:20px;line-height:1;cursor:pointer}",
    "body.wx-on #pqaMenu{display:none!important}"
  ].join("\n");
  document.head.appendChild(css);

  /* ================= MENU (popover) ================= */
  var menu = document.createElement("div");
  menu.id = "pqaMenu";
  document.body.appendChild(menu);
  var menuFor = null;
  function closeMenu() { menu.classList.remove("open"); menuFor = null; }
  function placeMenu(btn) {
    var r = btn.getBoundingClientRect(), w = Math.min(262, innerWidth - 20);
    menu.style.top = "0px"; menu.classList.add("open");
    var h = menu.offsetHeight;
    if (r.left > innerWidth * 0.6) {            /* tombol di toolbar kanan → menu keluar ke kiri */
      menu.style.left = "auto"; menu.style.right = clamp(innerWidth - r.left + 10, 10, innerWidth - w - 10) + "px";
      menu.style.top = clamp(r.top - 6, 10, Math.max(10, innerHeight - h - 10)) + "px";
    } else {                                    /* tombol di kotak cari → menu turun di bawahnya */
      menu.style.right = "auto"; menu.style.left = clamp(r.right - w, 10, Math.max(10, innerWidth - w - 10)) + "px";
      menu.style.top = clamp(r.bottom + 10, 10, Math.max(10, innerHeight - h - 10)) + "px";
    }
  }
  function openMenu(btn, kind) {
    if (menuFor === kind && menu.classList.contains("open")) { closeMenu(); return; }
    menuFor = kind;
    if (kind === "fit") renderFit(); else renderCap();
    placeMenu(btn);
  }
  document.addEventListener("pointerdown", function (e) {
    if (menu.classList.contains("open") && !menu.contains(e.target) && !e.target.closest(".pqa-tb")) closeMenu();
  }, true);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
  window.addEventListener("resize", closeMenu);

  /* ================= BAGIAN 1: CABANG "LIHAT SEMUA RUAS" ================= */
  var hist = [], histLock = false, histBound = false;
  function bindHist() {
    var m = gmap();
    if (histBound || !m || !m.on) return;
    histBound = true;
    var push = function () {
      if (histLock) return;
      var c = m.getCenter(), z = m.getZoom(), l = hist[hist.length - 1];
      if (l && Math.abs(l.z - z) < 0.01 && Math.abs(l.lat - c.lat) < 1e-5 && Math.abs(l.lng - c.lng) < 1e-5) return;
      hist.push({ lat: c.lat, lng: c.lng, z: z });
      if (hist.length > 30) hist.shift();
    };
    push(); m.on("moveend", push);
  }
  function ptsOf(list) {
    var out = [];
    list.forEach(function (r) { (r.points || []).forEach(function (p) { if (isFinite(p.lat) && isFinite(p.lng)) out.push([p.lat, p.lng]); }); });
    return out;
  }
  function fitRoads(list, label) {
    var m = gmap(), p = ptsOf(list);
    if (!m || !p.length) { note("Tidak ada ruas untuk ditampilkan", true); return; }
    m.flyToBounds(L.latLngBounds(p), { padding: [40, 40], duration: 0.6 });
    if (label) note(label);
  }
  function isolate(list) {
    var ids = {}, m = gmap();
    list.forEach(function (r) { ids[r.id] = 1; });
    gRoads().forEach(function (r) {
      var v = !!ids[r.id]; r.visible = v;
      var ly = typeof layers !== "undefined" ? layers[r.id] : null;
      if (ly && ly.group) { if (v) ly.group.addTo(m); else m.removeLayer(ly.group); }
    });
    try { persist(); renderRoadList(); } catch (e) {}
  }
  function act(list, label) {
    if (!list.length) { note("Tidak ada ruas", true); return; }
    if (cfg.iso) isolate(list);
    fitRoads(list, label);
  }
  function kmOf(r) { return +r.lengthKmFromSTA || +r.lengthKmCalculated || 0; }
  function renderFit() {
    var R = gRoads(), vis = R.filter(function (r) { return r.visible !== false; });
    var sel = []; try { sel = R.filter(function (r) { return selectedRoadIds.has(r.id); }); } catch (e) {}
    var km = R.reduce(function (s, r) { return s + kmOf(r); }, 0);
    var kab = {};
    R.forEach(function (r) { var k = r.kabupaten || "Tanpa kabupaten"; (kab[k] = kab[k] || []).push(r); });
    var ks = Object.keys(kab).sort();
    var items = [
      ["all", "fa-expand", "#22d3ee", "Semua ruas", "Seluruh data ruas", R.length],
      ["vis", "fa-eye", "#34d399", "Hanya yang tampil", "Abaikan ruas yang disembunyikan", vis.length],
      ["sel", "fa-hand-pointer", "#f59e0b", "Ruas terpilih", sel.length ? "Dari daftar ruas (centang)" : "Belum ada ruas dicentang", sel.length, !sel.length],
      ["long", "fa-ruler-horizontal", "#c084fc", "Ruas terpanjang", "Fokus ke ruas dengan km terbesar", ""],
      ["jateng", "fa-map", "#60a5fa", "Seluruh Jawa Tengah", "Tampilan provinsi", ""],
      ["back", "fa-clock-rotate-left", "#94a3b8", "Tampilan sebelumnya", "Kembali ke posisi peta tadi", hist.length > 1 ? hist.length - 1 : "", hist.length < 2]
    ];
    var h = '<div class="m-h">Lihat ruas<small>' + R.length + " ruas · " + fmt(km) + " km · " + vis.length + " tampil</small></div>";
    items.forEach(function (it, i) {
      h += '<button type="button" class="m-r" data-a="' + it[0] + '" style="--i:' + i + ';--c:' + it[2] + '"' + (it[6] ? " disabled" : "") + '>' +
        '<span class="m-i"><i class="fa-solid ' + it[1] + '"></i></span><span class="m-t">' + it[3] + "<small>" + esc(it[4]) + "</small></span>" +
        (it[5] === "" ? "" : "<em>" + it[5] + "</em>") + "</button>";
    });
    h += '<label class="m-chk"><input type="checkbox" id="pqaIso"' + (cfg.iso ? " checked" : "") + '> Sembunyikan ruas lain (isolasi)</label>';
    h += '<div class="m-s">Cari ruas</div><input class="m-in" id="pqaQ" placeholder="Ketik nama jalan…" autocomplete="off"><div class="m-res" id="pqaQres"></div>';
    if (ks.length) {
      h += '<div class="m-s">Per kabupaten / kota</div><div class="m-chips">';
      ks.forEach(function (k) { h += '<button type="button" class="m-chip" data-k="' + esc(k) + '">' + esc(k) + "<b>" + kab[k].length + "</b></button>"; });
      h += "</div>";
    }
    if (vis.length < R.length) h += '<button type="button" class="m-r" data-a="showall" style="--i:9;--c:#f87171"><span class="m-i"><i class="fa-solid fa-eye"></i></span><span class="m-t">Tampilkan semua ruas<small>' + (R.length - vis.length) + " ruas sedang disembunyikan</small></span></button>";
    menu.innerHTML = h;
    menu._kab = kab;
  }
  menu.addEventListener("input", function (e) {
    if (e.target.id !== "pqaQ") return;
    var q = e.target.value.trim().toLowerCase(), box = $("pqaQres"), h = "";
    if (q) {
      gRoads().filter(function (r) { return String(r.name || "").toLowerCase().indexOf(q) > -1; }).slice(0, 8).forEach(function (r) {
        h += '<button type="button" class="m-r" data-id="' + esc(r.id) + '" style="--c:' + esc(r.color || "#22d3ee") + '"><span class="m-i"><i class="fa-solid fa-road"></i></span><span class="m-t">' + esc(r.name) + "<small>" + (r.kabupaten ? esc(r.kabupaten) + " · " : "") + fmt(kmOf(r), 2) + " km</small></span></button>";
      });
      if (!h) h = '<div class="m-chk">Tidak ditemukan</div>';
    }
    box.innerHTML = h;
  });
  menu.addEventListener("change", function (e) {
    if (e.target.id === "pqaIso") { cfg.iso = e.target.checked; save(); }
    else if (e.target.id === "pqaSys") { cfg.sys = e.target.checked; save(); }
    else if (e.target.id === "pqaMic") { cfg.mic = e.target.checked; save(); }
    else if (e.target.id === "pqaQual") { cfg.q = e.target.value; save(); }
    else if (e.target.id === "pqaFps") { cfg.fps = +e.target.value; save(); }
    else if (e.target.id === "pqaFmt") { cfg.fmt = e.target.value; save(); }
  });
  menu.addEventListener("click", function (e) {
    var chip = e.target.closest(".m-chip");
    if (chip) { var k = chip.getAttribute("data-k"); closeMenu(); act(menu._kab[k] || [], k + " — " + (menu._kab[k] || []).length + " ruas"); return; }
    var it = e.target.closest(".m-r");
    if (!it) return;
    var id = it.getAttribute("data-id"), a = it.getAttribute("data-a"), R = gRoads();
    if (id) { closeMenu(); var r = R.filter(function (x) { return x.id === id; })[0]; if (r) { if (cfg.iso) isolate([r]); try { focusRoad(id); } catch (er) { fitRoads([r]); } } return; }
    if (a === "cap") { return; }
    closeMenu();
    if (a === "all") { if (cfg.iso) isolate(R); try { fitAllBounds(); } catch (er) { fitRoads(R); } }
    else if (a === "vis") act(R.filter(function (r) { return r.visible !== false; }), "Ruas yang tampil");
    else if (a === "sel") { var s = []; try { s = R.filter(function (r) { return selectedRoadIds.has(r.id); }); } catch (er) {} act(s, s.length + " ruas terpilih"); }
    else if (a === "long") { var o = R.slice().sort(function (x, y) { return kmOf(y) - kmOf(x); })[0]; if (o) { if (cfg.iso) isolate([o]); fitRoads([o], o.name + " · " + fmt(kmOf(o), 2) + " km"); } }
    else if (a === "jateng") { var m = gmap(); if (m) m.flyToBounds(L.latLngBounds([[-8.25, 108.4], [-5.85, 111.85]]), { duration: 0.7 }); }
    else if (a === "back") {
      if (hist.length < 2) return;
      hist.pop(); var p = hist[hist.length - 1], mm = gmap(); histLock = true;
      mm.flyTo([p.lat, p.lng], p.z, { duration: 0.5 }); setTimeout(function () { histLock = false; }, 700);
    }
    else if (a === "showall") { try { showAll(); } catch (er) {} try { fitAllBounds(); } catch (er) {} }
  });

  function setupFit(btn) {
    btn.classList.add("pqa-tb");
    btn.title = "Lihat Semua Ruas — tahan atau ketuk panah kecil untuk opsi";
    var caret = document.createElement("span");
    caret.className = "pqa-caret"; caret.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    btn.appendChild(caret);
    var timer = null, long = false, block = false;
    var orig = window.fitAllBounds;
    if (typeof orig === "function" && !orig.__pqa) {
      window.fitAllBounds = function () { if (block) return; return orig.apply(this, arguments); };
      window.fitAllBounds.__pqa = 1;
    }
    var holdBlock = function () { block = true; setTimeout(function () { block = false; }, 0); };
    btn.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".pqa-caret")) return;
      long = false; clearTimeout(timer);
      timer = setTimeout(function () { long = true; openMenu(btn, "fit"); }, 480);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { btn.addEventListener(ev, function () { clearTimeout(timer); }); });
    btn.addEventListener("click", function (e) {
      if (e.target.closest(".pqa-caret")) { holdBlock(); e.preventDefault(); e.stopImmediatePropagation(); openMenu(btn, "fit"); return; }
      if (long) { long = false; holdBlock(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    }, true);
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); openMenu(btn, "fit"); });
    if (!localStorage.getItem(KEY + "_hint")) {
      btn.classList.add("pqa-pulse");
      try { localStorage.setItem(KEY + "_hint", "1"); } catch (e) {}
      setTimeout(function () { btn.classList.remove("pqa-pulse"); }, 4800);
    }
    bindHist();
  }

  /* ================= BAGIAN 2: SCREENSHOT & REKAM ================= */
  var HAS_DM = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  var overlay, rectEl, lbEl, panel, mode = "shot", rc = { x: 0, y: 0, w: 0, h: 0 }, busy = false;
  var RATIOS = [["free", "Bebas"], ["1", "1:1"], ["1.3333", "4:3"], ["1.7778", "16:9"], ["0.5625", "9:16"], ["1.5", "3:2"], ["0.7071", "A4 ↕"], ["1.4142", "A4 ↔"]];

  function renderCap() {
    var h = '<div class="m-h">Rekam &amp; Screenshot<small>' + (HAS_DM ? "Tangkap peta persis seperti di layar" : "Perangkat ini tidak mendukung rekam layar — screenshot memakai mode cadangan") + "</small></div>";
    var it = [
      ["shot", "fa-crop-simple", "#22d3ee", "Screenshot area", "Atur ukuran crop bebas"],
      ["shotfull", "fa-expand", "#34d399", "Screenshot layar penuh", "Seluruh tampilan peta"],
      ["rec", "fa-circle-dot", "#ef4444", "Rekam area", HAS_DM ? "Atur ukuran crop bebas" : "Tidak didukung di perangkat ini", !HAS_DM],
      ["recfull", "fa-video", "#f59e0b", "Rekam layar penuh", HAS_DM ? "Seluruh tampilan" : "Tidak didukung di perangkat ini", !HAS_DM]
    ];
    it.forEach(function (x, i) {
      h += '<button type="button" class="m-r" data-cap="' + x[0] + '" style="--i:' + i + ';--c:' + x[2] + '"' + (x[5] ? " disabled" : "") + '><span class="m-i"><i class="fa-solid ' + x[1] + '"></i></span><span class="m-t">' + x[3] + "<small>" + x[4] + "</small></span></button>";
    });
    h += '<div class="m-s">Pengaturan rekam</div>' +
      '<label class="m-chk"><input type="checkbox" id="pqaSys"' + (cfg.sys ? " checked" : "") + '> Ikut rekam suara tab / sistem</label>' +
      '<label class="m-chk"><input type="checkbox" id="pqaMic"' + (cfg.mic ? " checked" : "") + '> Ikut rekam mikrofon (narasi)</label>' +
      '<div class="m-row2"><span>Format video</span><select id="pqaFmt"><option value="auto">Otomatis</option><option value="mp4">MP4</option><option value="webm">WebM</option></select></div>' +
      '<div class="m-chk" style="cursor:default;color:#8fa6bd;font-size:10.5px">' + (nativeMp4() ? "MP4 langsung didukung perangkat ini" : "MP4 langsung belum didukung — hasil WebM bisa dikonversi ke MP4 setelah rekam") + "</div>" +
      '<div class="m-row2"><span>Kualitas</span><select id="pqaQual"><option value="0">Asli</option><option value="1080">1080p</option><option value="720">720p</option></select></div>' +
      '<div class="m-row2"><span>Frame rate</span><select id="pqaFps"><option>15</option><option>24</option><option>30</option><option>60</option></select></div>' +
      '<div class="m-chk" style="cursor:default;color:#8fa6bd;font-size:10.5px">Pintasan: Alt+Shift+R = mulai/stop rekam</div>';
    menu.innerHTML = h;
    var q = $("pqaQual"), f = $("pqaFps"), fm = $("pqaFmt");
    if (fm) fm.value = cfg.fmt || "auto";
    if (q) q.value = cfg.q; if (f) f.value = String(cfg.fps);
  }
  document.addEventListener("click", function (e) {
    var c = e.target.closest && e.target.closest("[data-cap]");
    if (!c || !menu.contains(c)) return;
    var m = c.getAttribute("data-cap"); closeMenu();
    if (m === "shotfull") { fullRect(); doShot(); }
    else if (m === "recfull") { fullRect(); startRecord(); }
    else openCrop(m);
  });

  function fullRect() { rc = { x: 0, y: 0, w: innerWidth, h: innerHeight }; }
  function loadRect() {
    var f = cfg.rect;
    if (f && f.w > 0.05 && f.h > 0.05) rc = { x: f.x * innerWidth, y: f.y * innerHeight, w: f.w * innerWidth, h: f.h * innerHeight };
    else { var w = Math.round(innerWidth * 0.6), h = Math.round(innerHeight * 0.55); rc = { x: Math.round((innerWidth - w) / 2), y: Math.round((innerHeight - h) / 2 - 20), w: w, h: h }; }
    fixRect();
  }
  function saveRect() { cfg.rect = { x: rc.x / innerWidth, y: rc.y / innerHeight, w: rc.w / innerWidth, h: rc.h / innerHeight }; save(); }
  function fixRect() {
    rc.w = clamp(rc.w, 40, innerWidth); rc.h = clamp(rc.h, 40, innerHeight);
    rc.x = clamp(rc.x, 0, innerWidth - rc.w); rc.y = clamp(rc.y, 0, innerHeight - rc.h);
  }
  function ratio() { return cfg.ratio === "free" ? 0 : parseFloat(cfg.ratio); }
  function applyRatio(anchor) {
    var r = ratio(); if (!r) return;
    if (anchor === "h") rc.w = rc.h * r; else rc.h = rc.w / r;
    if (rc.w > innerWidth) { rc.w = innerWidth; rc.h = rc.w / r; }
    if (rc.h > innerHeight) { rc.h = innerHeight; rc.w = rc.h * r; }
  }

  function buildOverlay() {
    if (overlay) return;
    overlay = document.createElement("div"); overlay.id = "pqaCrop";
    var hs = ["nw", "n", "ne", "e", "se", "s", "sw", "w"], pos = { nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50], se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50] };
    var cur = { nw: "nwse", se: "nwse", ne: "nesw", sw: "nesw", n: "ns", s: "ns", e: "ew", w: "ew" };
    var h = '<div class="r"><div class="lb"></div>';
    hs.forEach(function (d) { h += '<div class="hd" data-d="' + d + '" style="left:' + pos[d][0] + "%;top:" + pos[d][1] + "%;cursor:" + cur[d] + '-resize"></div>'; });
    h += "</div>";
    h += '<div class="pn"><span id="pqaTitle">Crop</span>' +
      'W <input type="number" id="pqaW" min="40"> H <input type="number" id="pqaH" min="40">' +
      '<select id="pqaRatio">' + RATIOS.map(function (r) { return '<option value="' + r[0] + '">' + r[1] + "</option>"; }).join("") + "</select>" +
      '<button type="button" id="pqaPass" title="Geser/zoom peta tanpa menutup crop">✋ Geser peta</button>' +
      '<button type="button" id="pqaFull">Penuh</button>' +
      '<button type="button" class="go" id="pqaGo">Ambil</button><button type="button" id="pqaCancel">Batal</button></div>';
    overlay.innerHTML = h; document.body.appendChild(overlay);
    rectEl = overlay.querySelector(".r"); lbEl = overlay.querySelector(".lb"); panel = overlay.querySelector(".pn");
    var drag = null;
    function down(e, d) {
      if (e.button != null && e.button > 0) return;
      e.preventDefault(); e.stopPropagation();
      drag = { d: d, sx: e.clientX, sy: e.clientY, o: { x: rc.x, y: rc.y, w: rc.w, h: rc.h } };
      e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
    }
    rectEl.addEventListener("pointerdown", function (e) { if (e.target.classList.contains("hd")) down(e, e.target.getAttribute("data-d")); else down(e, "m"); });
    window.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy, o = drag.o, d = drag.d, n = { x: o.x, y: o.y, w: o.w, h: o.h };
      if (d === "m") { n.x = o.x + dx; n.y = o.y + dy; }
      else {
        if (d.indexOf("e") > -1) n.w = o.w + dx;
        if (d.indexOf("w") > -1) { n.w = o.w - dx; n.x = o.x + dx; }
        if (d.indexOf("s") > -1) n.h = o.h + dy;
        if (d.indexOf("n") > -1) { n.h = o.h - dy; n.y = o.y + dy; }
        n.w = Math.max(40, n.w); n.h = Math.max(40, n.h);
        if (ratio()) {
          var onlyV = d === "n" || d === "s";
          if (onlyV) n.w = n.h * ratio(); else n.h = n.w / ratio();
          if (d.indexOf("w") > -1) n.x = o.x + o.w - n.w;
          if (d.indexOf("n") > -1) n.y = o.y + o.h - n.h;
        }
      }
      rc = n; fixRect(); draw();
    });
    ["pointerup", "pointercancel"].forEach(function (ev) { window.addEventListener(ev, function () { if (drag) { drag = null; saveRect(); } }); });
    $("pqaW").onchange = function () { rc.w = +this.value; applyRatio("w"); fixRect(); draw(); saveRect(); };
    $("pqaH").onchange = function () { rc.h = +this.value; applyRatio("h"); fixRect(); draw(); saveRect(); };
    $("pqaRatio").onchange = function () { cfg.ratio = this.value; save(); applyRatio("w"); fixRect(); draw(); saveRect(); };
    $("pqaPass").onclick = function () { overlay.classList.toggle("pass"); this.classList.toggle("on", overlay.classList.contains("pass")); };
    $("pqaFull").onclick = function () { fullRect(); draw(); saveRect(); };
    $("pqaCancel").onclick = closeCrop;
    $("pqaGo").onclick = function () { saveRect(); var m = mode; closeCrop(true); if (m === "rec") startRecord(); else doShot(); };
    window.addEventListener("resize", function () { if (overlay.classList.contains("show") && !overlay.classList.contains("rec")) { fixRect(); draw(); } });
    document.addEventListener("keydown", function (e) {
      if (!overlay.classList.contains("show") || overlay.classList.contains("rec")) return;
      if (e.key === "Escape") closeCrop(); else if (e.key === "Enter" && !/INPUT|SELECT/.test((e.target || {}).tagName || "")) $("pqaGo").click();
    });
  }
  function draw() {
    if (!rectEl) return;
    rectEl.style.left = Math.round(rc.x) + "px"; rectEl.style.top = Math.round(rc.y) + "px";
    rectEl.style.width = Math.round(rc.w) + "px"; rectEl.style.height = Math.round(rc.h) + "px";
    rectEl.classList.toggle("in", rc.y < 30);
    var dpr = window.devicePixelRatio || 1;
    lbEl.textContent = Math.round(rc.w) + " × " + Math.round(rc.h) + " px" + (dpr > 1 ? "  (≈ " + Math.round(rc.w * dpr) + " × " + Math.round(rc.h * dpr) + ")" : "");
    var w = $("pqaW"), h = $("pqaH"), r = $("pqaRatio");
    if (w && document.activeElement !== w) w.value = Math.round(rc.w);
    if (h && document.activeElement !== h) h.value = Math.round(rc.h);
    if (r) r.value = cfg.ratio;
  }
  function openCrop(m) {
    buildOverlay(); mode = m; loadRect();
    overlay.classList.remove("rec", "pass"); $("pqaPass").classList.remove("on");
    overlay.classList.add("show");
    $("pqaTitle").textContent = m === "rec" ? "● Rekam area" : "Screenshot area";
    var go = $("pqaGo"); go.textContent = m === "rec" ? "Mulai rekam" : "Ambil"; go.className = "go" + (m === "rec" ? " rc" : "");
    draw();
  }
  function closeCrop(keep) { if (overlay) { overlay.classList.remove("show", "rec", "pass"); } }

  /* ---------- akuisisi frame ---------- */
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  async function getStream(withAudio) {
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 60, max: 60 }, cursor: "always" },
      audio: withAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
      preferCurrentTab: true, selfBrowserSurface: "include", systemAudio: "include", surfaceSwitching: "exclude", monitorTypeSurfaces: "include"
    });
  }
  async function makeVideo(stream) {
    var v = document.createElement("video"); v.muted = true; v.playsInline = true; v.srcObject = stream;
    await v.play();
    if (!v.videoWidth) await new Promise(function (r) { v.onloadedmetadata = r; });
    return v;
  }
  /* petakan crop (px viewport) → px frame video, sesuai jenis permukaan yang dibagikan */
  function mapRect(v, track, r) {
    var s = (track.getSettings && track.getSettings()) || {}, sf = s.displaySurface || "browser";
    var vw = v.videoWidth, vh = v.videoHeight, sx, sy, k;
    if (sf === "browser") {
      sx = vw / innerWidth; sy = vh / innerHeight;
      return { x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy, sf: sf };
    }
    var bx = Math.max(0, (outerWidth - innerWidth) / 2), top = Math.max(0, outerHeight - innerHeight - bx);
    if (sf === "monitor") { k = vw / screen.width; return { x: (screenX + bx + r.x) * k, y: (screenY + top + r.y) * k, w: r.w * k, h: r.h * k, sf: sf }; }
    k = vw / outerWidth; return { x: (bx + r.x) * k, y: (top + r.y) * k, w: r.w * k, h: r.h * k, sf: sf };
  }
  function hideUi() {
    var a = [menu, overlay, $("pqaRes"), $("pqaRec")].filter(Boolean), old = a.map(function (e) { return e.style.visibility; });
    a.forEach(function (e) { e.style.visibility = "hidden"; });
    return function () { a.forEach(function (e, i) { e.style.visibility = old[i]; }); };
  }

  async function doShot() {
    if (busy) return; busy = true;
    var r0 = { x: rc.x, y: rc.y, w: rc.w, h: rc.h }, blob = null;
    try {
      if (HAS_DM) {
        var stream = await getStream(false), track = stream.getVideoTracks()[0], restore = hideUi();
        try {
          var v = await makeVideo(stream);
          await sleep(450);                       /* tunggu bilah "membagikan layar" & tampilan stabil */
          if (v.requestVideoFrameCallback) await new Promise(function (res) { v.requestVideoFrameCallback(function () { res(); }); });
          var m = mapRect(v, track, r0), c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(m.w)); c.height = Math.max(1, Math.round(m.h));
          c.getContext("2d").drawImage(v, m.x, m.y, m.w, m.h, 0, 0, c.width, c.height);
          blob = await new Promise(function (res) { c.toBlob(res, "image/png"); });
          if (m.sf !== "browser") note("Tip: pilih \"Tab ini\" saat diminta berbagi agar potongan lebih presisi");
        } finally { stream.getTracks().forEach(function (t) { t.stop(); }); restore(); }
      } else if (window.html2canvas) {
        var rs = hideUi();
        try {
          var cv = await html2canvas(document.body, { x: r0.x, y: r0.y, width: r0.w, height: r0.h, scrollX: 0, scrollY: 0, windowWidth: innerWidth, windowHeight: innerHeight, useCORS: true, backgroundColor: null, scale: window.devicePixelRatio || 1, logging: false });
          blob = await new Promise(function (res) { cv.toBlob(res, "image/png"); });
        } finally { rs(); }
        note("Mode cadangan: peta satelit bisa tampak kosong. Gunakan browser desktop untuk hasil penuh.");
      } else { note("Screenshot tidak didukung di perangkat ini", true); }
    } catch (e) {
      note(e && e.name === "NotAllowedError" ? "Dibatalkan — izin berbagi layar tidak diberikan" : "Gagal mengambil screenshot: " + (e && e.message || e), true);
    }
    busy = false;
    if (blob) showResult({ type: "image", blob: blob, name: "petaqu-" + stamp() + ".png" });
  }

  /* ---------- rekam ---------- */
  var REC = null;
  var MP4C = ["video/mp4;codecs=avc1.64002A,mp4a.40.2", "video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4"],
    WEBC = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  function firstOk(c) { for (var i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {} } return ""; }
  function nativeMp4() { try { return !!(window.MediaRecorder && firstOk(MP4C)); } catch (e) { return false; } }
  /* Otomatis/MP4 → MP4 langsung bila perangkat mendukung (Chrome/Edge 126+, Safari, Android), selain itu WebM */
  function pickMime() {
    var f = cfg.fmt || "auto", m = f === "webm" ? "" : firstOk(MP4C);
    return m || firstOk(WEBC) || firstOk(MP4C);
  }
  async function countdown(n) {
    var el = $("pqaCount"); if (!el) { el = document.createElement("div"); el.id = "pqaCount"; document.body.appendChild(el); }
    el.classList.add("show");
    for (var i = n; i > 0; i--) { el.textContent = i; await sleep(800); }
    el.classList.remove("show");
  }
  function placePill(pill) {
    var w = pill.offsetWidth || 220, h = pill.offsetHeight || 36, g = 12, P = [
      [g, g], [innerWidth - w - g, g], [g, innerHeight - h - g], [innerWidth - w - g, innerHeight - h - g], [(innerWidth - w) / 2, g], [(innerWidth - w) / 2, innerHeight - h - g]
    ], hit = function (p) { return !(p[0] + w < rc.x - 4 || p[0] > rc.x + rc.w + 4 || p[1] + h < rc.y - 4 || p[1] > rc.y + rc.h + 4); };
    for (var i = 0; i < P.length; i++) if (!hit(P[i])) { pill.style.left = P[i][0] + "px"; pill.style.top = P[i][1] + "px"; return true; }
    pill.style.left = (innerWidth - w - g) + "px"; pill.style.top = g + "px"; return false;
  }
  async function startRecord() {
    if (REC) { stopRecord(); return; }
    if (busy) return;
    if (!HAS_DM || !window.MediaRecorder) { note("Rekam layar tidak didukung di perangkat ini", true); return; }
    busy = true;
    var r0 = { x: rc.x, y: rc.y, w: rc.w, h: rc.h }, stream, mic = null, actx = null, v, track;
    try {
      stream = await getStream(!!cfg.sys); track = stream.getVideoTracks()[0];
      if (cfg.mic) { try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { note("Mikrofon tidak tersedia — merekam tanpa narasi", true); } }
      v = await makeVideo(stream);
    } catch (e) {
      busy = false;
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      note(e && e.name === "NotAllowedError" ? "Dibatalkan — izin berbagi layar tidak diberikan" : "Gagal memulai rekam: " + (e && e.message || e), true);
      return;
    }
    /* bingkai merah di luar area rekam (tidak ikut terekam) */
    buildOverlay(); rc = r0; draw(); overlay.classList.add("show", "rec");
    var restore = hideUi(); if (overlay) overlay.style.visibility = "";
    var cd = $("pqaCount"); await countdown(3);

    var m = mapRect(v, track, r0), ow = Math.round(m.w), oh = Math.round(m.h);
    if (cfg.q !== "0") { var maxH = +cfg.q; if (oh > maxH) { var f = maxH / oh; ow = Math.round(ow * f); oh = maxH; } }
    ow -= ow % 2; oh -= oh % 2; ow = Math.max(2, ow); oh = Math.max(2, oh);
    var cv = document.createElement("canvas"); cv.width = ow; cv.height = oh;
    var cx = cv.getContext("2d"), fps = cfg.fps || 30;
    var out = cv.captureStream(fps);
    var ats = stream.getAudioTracks().concat(mic ? mic.getAudioTracks() : []);
    if (ats.length) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)(); var dst = actx.createMediaStreamDestination();
        ats.forEach(function (t) { actx.createMediaStreamSource(new MediaStream([t])).connect(dst); });
        dst.stream.getAudioTracks().forEach(function (t) { out.addTrack(t); });
      } catch (e) { ats.forEach(function (t) { out.addTrack(t); }); }
    }
    var mime = pickMime(), opts = { videoBitsPerSecond: clamp(Math.round(ow * oh * fps * 0.07), 2500000, 14000000) };
    if (mime) opts.mimeType = mime;
    var rec = new MediaRecorder(out, opts), chunks = [], alive = true, t0 = Date.now(), paused = 0, pAt = 0;
    var tick = function () { if (!alive) return; try { var mm = mapRect(v, track, r0); cx.drawImage(v, mm.x, mm.y, mm.w, mm.h, 0, 0, ow, oh); } catch (e) {} };
    var loop = function () { tick(); if (alive && v.requestVideoFrameCallback) v.requestVideoFrameCallback(loop); };
    var iv = null;
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(loop); else iv = setInterval(tick, 1000 / fps);
    var keep = setInterval(tick, 1000 / fps);            /* cadangan bila video statis (rVFC tidak menembak) */
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };

    var pill = $("pqaRec");
    if (!pill) { pill = document.createElement("div"); pill.id = "pqaRec"; document.body.appendChild(pill); }
    pill.innerHTML = '<i></i><span id="pqaTm">00:00</span><button type="button" id="pqaPs">Jeda</button><button type="button" id="pqaSt" class="st">Berhenti</button>';
    pill.className = "show"; pill.style.visibility = "";
    var free = placePill(pill), pillTimer = null;
    if (!free) pillTimer = setTimeout(function () { pill.style.opacity = ".12"; }, 3500);
    var tm = setInterval(function () {
      var s = Math.floor(((pAt ? pAt : Date.now()) - t0 - paused) / 1000), el = $("pqaTm");
      if (el) el.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    }, 500);
    $("pqaPs").onclick = function () {
      if (rec.state === "recording") { rec.pause(); pAt = Date.now(); pill.classList.add("paused"); this.textContent = "Lanjut"; }
      else if (rec.state === "paused") { rec.resume(); paused += Date.now() - pAt; pAt = 0; pill.classList.remove("paused"); this.textContent = "Jeda"; }
    };
    $("pqaSt").onclick = stopRecord;
    track.addEventListener("ended", stopRecord);

    var done = false;
    function finish() {
      if (done) return; done = true; alive = false;
      clearInterval(tm); clearInterval(keep); if (iv) clearInterval(iv); clearTimeout(pillTimer);
      stream.getTracks().forEach(function (t) { t.stop(); }); if (mic) mic.getTracks().forEach(function (t) { t.stop(); });
      try { actx && actx.close(); } catch (e) {}
      pill.className = ""; if (overlay) overlay.classList.remove("show", "rec");
      restore(); REC = null; busy = false;
      var type = (rec.mimeType || mime || "video/webm").split(";")[0], ext = /mp4/.test(type) ? "mp4" : "webm";
      var blob = new Blob(chunks, { type: type });
      if (blob.size) showResult({ type: "video", blob: blob, name: "petaqu-rekam-" + stamp() + "." + ext, auto: true, dur: Math.max(1, ((pAt || Date.now()) - t0 - paused) / 1000) });
      else note("Rekaman kosong", true);
    }
    rec.onstop = finish;
    REC = { stop: function () { try { if (rec.state !== "inactive") rec.stop(); else finish(); } catch (e) { finish(); } } };
    rec.start(1000);
    var camOn = function (v) { [].forEach.call(document.querySelectorAll(".cam"), function (b) { b.classList.toggle("on", v); }); };
    camOn(true); rec.addEventListener("stop", function () { camOn(false); });
  }
  function stopRecord() { if (REC) REC.stop(); }
  document.addEventListener("keydown", function (e) {
    if (e.altKey && e.shiftKey && (e.key === "R" || e.key === "r")) {
      e.preventDefault();
      if (REC) stopRecord(); else if (overlay && overlay.classList.contains("show")) $("pqaGo").click(); else openCrop("rec");
    }
  });

  /* ---------- kartu hasil ---------- */
  var resUrl = null, HERE = (document.currentScript && document.currentScript.src) || "";
  function loadConv() {
    if (window.PQVidConv) return Promise.resolve();
    return new Promise(function (res, rej) {
      var u = HERE ? HERE.replace(/[^\/?#]*([?#].*)?$/, "petaqu-videoconv.js") : "petaqu-videoconv.js", sc = document.createElement("script");
      sc.src = u + "?v=1"; sc.onload = res; sc.onerror = function () { rej(new Error("modul konversi (petaqu-videoconv.js) tidak ditemukan")); }; document.head.appendChild(sc);
    });
  }
  var CONV = { mp4: ["MP4 (H.264)", "Paling kompatibel: WhatsApp, iPhone, Premiere, CapCut"], mp4s: ["MP4 ringan 480p", "File kecil untuk kirim lewat chat"], gif: ["GIF (maks 20 dtk)", "Animasi tanpa suara, mudah ditempel"], webm: ["WebM bisa digeser", "Perbaiki durasi/seek tanpa mengubah kualitas"] };
  function showResult(o) {
    var el = $("pqaRes");
    if (!el) { el = document.createElement("div"); el.id = "pqaRes"; document.body.appendChild(el); }
    if (resUrl) URL.revokeObjectURL(resUrl);
    resUrl = URL.createObjectURL(o.blob);
    var mb = o.blob.size > 1048576 ? fmt(o.blob.size / 1048576, 1) + " MB" : fmt(o.blob.size / 1024, 0) + " KB", isVid = o.type === "video", isMp4 = /mp4/.test(o.blob.type), ext = (o.name.match(/\.(\w+)$/) || [, ""])[1].toUpperCase();
    var file = function () { try { return new File([o.blob], o.name, { type: o.blob.type }); } catch (e) { return null; } };
    var f0 = file(), canShare = !!(f0 && navigator.canShare && navigator.canShare({ files: [f0] })), canPick = !!window.showSaveFilePicker;
    var opts = isVid && !o.gif ? (isMp4 ? ["mp4s", "gif"] : ["mp4", "mp4s", "gif", "webm"]) : [];
    el.innerHTML = '<div class="tt"><b>' + (o.type === "image" ? "Screenshot siap" : o.conv ? "Hasil konversi" : "Rekaman tersimpan") + ' <small>' + esc(ext + " · " + mb) + '</small></b><button type="button" class="x" id="pqaX">×</button></div>' +
      (o.type === "image" ? '<img class="pv" src="' + resUrl + '" alt="">' : o.gif ? '<img class="pv" src="' + resUrl + '" alt="">' : '<video class="pv" src="' + resUrl + '" controls playsinline></video>') +
      '<div class="bs"><a class="pqa-btn go" id="pqaDl" href="' + resUrl + '" download="' + esc(o.name) + '" style="text-decoration:none">Unduh ' + esc(ext) + '</a>' +
      (o.type === "image" ? '<button type="button" class="pqa-btn" id="pqaCp">Salin</button>' : "") +
      (canPick ? '<button type="button" class="pqa-btn" id="pqaPk" title="Pilih folder & nama file">Simpan ke…</button>' : "") +
      (canShare ? '<button type="button" class="pqa-btn" id="pqaSh">Bagikan</button>' : "") + "</div>" +
      (opts.length ? '<div class="pqa-cv"><div class="m-s" style="margin:9px 0 4px">Simpan sebagai</div><div class="bs" style="margin-top:0">' + opts.map(function (k) { return '<button type="button" class="pqa-btn" data-cv="' + k + '" title="' + esc(CONV[k][1]) + '">' + esc(CONV[k][0]) + "</button>"; }).join("") + '</div><div id="pqaCvS" class="pqa-cs"></div></div>' : "");
    el.classList.add("show");
    $("pqaX").onclick = function () { el.classList.remove("show"); try { window.PQVidConv && PQVidConv.cancel(); } catch (e) {} };
    var cp = $("pqaCp"); if (cp) cp.onclick = async function () {
      try { await navigator.clipboard.write([new ClipboardItem({ "image/png": o.blob })]); note("Gambar disalin ke clipboard"); } catch (e) { note("Salin tidak didukung browser ini — gunakan Unduh", true); }
    };
    var sh = $("pqaSh"); if (sh) sh.onclick = function () { navigator.share({ files: [file()], title: "PETAQU" }).catch(function () {}); };
    var pk = $("pqaPk"); if (pk) pk.onclick = async function () {
      try {
        var x = (o.name.match(/\.(\w+)$/) || [, "bin"])[1], h = await window.showSaveFilePicker({ suggestedName: o.name, types: [{ description: x.toUpperCase(), accept: (function () { var a = {}; a[o.blob.type || "application/octet-stream"] = ["." + x]; return a; })() }] });
        var w = await h.createWritable(); await w.write(o.blob); await w.close(); note("Tersimpan: " + h.name);
      } catch (e) { if (e && e.name !== "AbortError") note("Gagal menyimpan ke folder — gunakan Unduh", true); }
    };
    [].forEach.call(el.querySelectorAll("[data-cv]"), function (b) {
      b.onclick = async function () {
        var to = b.getAttribute("data-cv"), S = $("pqaCvS"), all = el.querySelectorAll("[data-cv]"), set = function (t, pct) { if (S) S.innerHTML = '<div class="pqa-bar"><i style="width:' + Math.round((pct || 0) * 100) + '%"></i></div><span>' + esc(t) + '</span> <button type="button" class="pqa-btn" id="pqaCvX">Batal</button>'; var x = $("pqaCvX"); if (x) x.onclick = function () { try { PQVidConv.cancel(); } catch (e) {} if (S) S.textContent = "Dibatalkan"; [].forEach.call(all, function (z) { z.disabled = false; }); }; };
        [].forEach.call(all, function (z) { z.disabled = true; }); set("Menyiapkan…", 0);
        try {
          await loadConv();
          var r = await PQVidConv.run(o.blob, { to: to, dur: o.dur, onStatus: set });
          var nm = o.name.replace(/\.\w+$/, "") + (to === "mp4s" ? "-ringan" : "") + "." + r.ext;
          showResult({ type: "video", blob: r.blob, name: nm, auto: true, dur: o.dur, conv: true, gif: to === "gif" });
        } catch (e) {
          if (/dibatalkan/.test(e && e.message || "")) return;
          if (S) S.innerHTML = '<span style="color:#fca5a5">Gagal: ' + esc((e && e.message) || e) + "</span>";
          [].forEach.call(all, function (z) { z.disabled = false; });
        }
      };
    });
    if (o.auto) { var a = $("pqaDl"); try { a.click(); } catch (e) {} }
  }

  /* ================= PASANG TOMBOL ================= */
  function setup() {
    var tb = $("mapToolbar");
    var fit = tb && tb.querySelector('.tool-btn[onclick*="fitAllBounds"]');
    if (!fit) return false;
    if (fit.dataset.pqa) return true;
    fit.dataset.pqa = "1";
    setupFit(fit);
    return true;
  }
  var tries = 0;
  (function wait() {
    if (setup()) return;
    if (++tries < 80) setTimeout(wait, 250);
  })();

  window.PETAQU_AKSI = { menu: function (btn) { if (REC) { stopRecord(); return; } openMenu(btn, "cap"); }, screenshot: function () { openCrop("shot"); }, record: function () { openCrop("rec"); }, stop: stopRecord, fit: function () { var b = document.querySelector('[data-pqa="1"]'); if (b) openMenu(b, "fit"); } };
})();
