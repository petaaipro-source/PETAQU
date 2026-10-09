/* PETAQU — Street View MULTI-TAMPILAN (v1)
   Memilih / menggabungkan dua sumber Street View di panel yang sama:
     • LIVE  — panorama Maps JavaScript API (posisi, STA, arah ikut bergeser real-time)
     • EMBED — Street View embed Google (gratis, tanpa watermark "development purposes only")
     • DUAL  — keduanya berdampingan (kiri-kanan / atas-bawah, pembatas bisa digeser),
               Embed OTOMATIS mengikuti posisi + arah + zoom + kemiringan panorama Live.
   Tambahan cerdas:
     • Koreksi warna per panel (balik gambar "negatif" akibat mode gelap otomatis browser /
       ekstensi seperti Dark Reader) — diingat per perangkat.
     • Deteksi dialog galat Google ("Halaman ini tidak dapat memuat Google Maps dengan benar" /
       watermark "For development purposes only") → otomatis membuka Dual agar Embed yang bersih ikut tampil.
     • Fallback otomatis ke Embed bila Live gagal; tata letak Auto menyesuaikan rasio panel.
     • Pintasan: Alt+1 Live · Alt+2 Embed · Alt+3 Dual · Alt+C koreksi warna · Alt+X tukar sisi.
   Bekerja bersama petaqu-svlive.js & petaqu-svauto.js; tidak mengubah fitur lain. */
(function () {
  "use strict";
  if (window.PQSvView) return;

  /* ------------------------------------------------------------------ util & state */
  var K = { view: "pq_sv_view", fixL: "pq_sv_fix_live", fixE: "pq_sv_fix_emb", lay: "pq_sv_layout", r: "pq_sv_dual_r", swap: "pq_sv_swap", sync: "pq_sv_sync", clean: "pq_sv_clean" };
  function ls(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function ss(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
  function $(id) { return document.getElementById(id); }
  function Live() { return window.PQSvLive || null; }
  function key() { try { return getApiKey(); } catch (e) { return ""; } }
  function RA() { try { return typeof routeAnim !== "undefined" ? routeAnim : null; } catch (e) { return null; } }
  function histOn() { try { return typeof svHistoryActivePano !== "undefined" && !!svHistoryActivePano; } catch (e) { return false; } }
  function toast_(m, e) { try { if (typeof toast === "function") toast(m, !!e); } catch (x) {} }
  function norm(h) { return ((h % 360) + 360) % 360; }
  function angd(a, b) { var d = Math.abs(norm(a) - norm(b)); return d > 180 ? 360 - d : d; }
  function dist(a, b) {
    var r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lng - a.lng) * r;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function overlayOpen() { var o = $("svOverlay"); return !!(o && o.classList.contains("show")); }

  var S = {
    view: "embed",                /* SELALU mulai dari Embed; Live disembunyikan (tidak dimuat) sampai dipilih */
    fixL: ls(K.fixL, "0") === "1",
    fixE: ls(K.fixE, "0") === "1",
    lay: ls(K.lay, "auto"),
    r: parseFloat(ls(K.r, "50")) || 50,
    swap: ls(K.swap, "0") === "1",
    sync: ls(K.sync, "1") !== "0",
    clean: ls(K.clean, "0") === "1"      /* Bersihkan layar: sembunyikan kartu & kontrol bawaan Google */
  };
  if (["live", "embed", "dual"].indexOf(S.view) < 0) S.view = "dual";
  if (["auto", "row", "col"].indexOf(S.lay) < 0) S.lay = "auto";
  S.r = Math.max(15, Math.min(85, S.r));

  var SETTLE = 700;               /* ms posisi "tenang" sebelum Embed ikut (hemat muat ulang) */
  var shown = "embed";            /* panel yang benar-benar tampil: live | embed | dual */
  var liveWarn = false, warnedOnce = false, drWarned = false;
  var ap = null, cand = null, lastCap = null, embBusy = false, unusableSince = 0, sig = "";
  var obs = null, obsDiv = null, errT = 0;

  /* ------------------------------------------------------------------ mode efektif */
  function liveFailed() { var L = Live(); return !!(L && L.state && L.state() === -1); }
  function eff() { return liveFailed() ? "embed" : S.view; }
  function wantsLive() { return eff() !== "embed"; }
  function wantsFrame() { return eff() === "dual"; }

  /* Live dianggap "dapat dipakai" bila sedang memuat / siap; jeda 2,5 dtk agar layout tidak berkedip */
  function liveUsable() {
    var L = Live(); if (!L || !key() || histOn() || liveFailed()) return false;
    var st = L.state ? L.state() : 0;
    if (st !== 2) { unusableSince = 0; return true; }
    if (L.ready()) { unusableSince = 0; return true; }
    if (!unusableSince) unusableSince = Date.now();
    return Date.now() - unusableSince < 2500;
  }
  function computeShown() {
    if (S.view === "embed" || !liveUsable()) return "embed";
    return S.view; /* live | dual */
  }

  /* ------------------------------------------------------------------ CSS */
  (function () {
    if ($("pq-svview-css")) return;
    var c = document.createElement("style"); c.id = "pq-svview-css";
    c.textContent = [
      "#svFrameWrap{--pq-r:50%}",
      /* grup tombol di HUD */
      "#pqSvView{display:flex;gap:3px;background:#0f1521d9;border:1px solid var(--line,#1f2a3d);border-radius:11px;padding:3px;flex-shrink:0;backdrop-filter:blur(8px)}",
      "#pqSvView .sv-mode-btn{width:auto;min-width:32px;padding:0 9px;gap:6px;font:700 10.5px var(--mono,monospace);letter-spacing:.3px;white-space:nowrap}",
      "#pqSvView .sv-mode-btn.pq-sep{border-left:1px solid #ffffff1f;border-radius:0 8px 8px 0;margin-left:2px}",
      "@media(max-width:560px){#pqSvView .sv-mode-btn span{display:none}#pqSvView .sv-mode-btn{padding:0;width:30px}}",
      /* layout Dual */
      "#svFrameWrap.pq-v-dual #svFrame{position:absolute!important}",
      "#svFrameWrap.pq-v-dual #pqSvPano{inset:auto!important}",
      "#svFrameWrap.pq-v-dual.pq-row #pqSvPano{left:0!important;top:0!important;width:var(--pq-r)!important;height:100%!important}",
      "#svFrameWrap.pq-v-dual.pq-row #svFrame{left:var(--pq-r)!important;top:0!important;width:calc(100% - var(--pq-r))!important;height:100%!important}",
      "#svFrameWrap.pq-v-dual.pq-row.pq-swap #svFrame{left:0!important;width:var(--pq-r)!important}",
      "#svFrameWrap.pq-v-dual.pq-row.pq-swap #pqSvPano{left:var(--pq-r)!important;width:calc(100% - var(--pq-r))!important}",
      "#svFrameWrap.pq-v-dual.pq-col #pqSvPano{left:0!important;top:0!important;width:100%!important;height:var(--pq-r)!important}",
      "#svFrameWrap.pq-v-dual.pq-col #svFrame{left:0!important;top:var(--pq-r)!important;width:100%!important;height:calc(100% - var(--pq-r))!important}",
      "#svFrameWrap.pq-v-dual.pq-col.pq-swap #svFrame{top:0!important;height:var(--pq-r)!important}",
      "#svFrameWrap.pq-v-dual.pq-col.pq-swap #pqSvPano{top:var(--pq-r)!important;height:calc(100% - var(--pq-r))!important}",
      /* pembatas */
      "#pqSvDiv{position:absolute;z-index:1;display:none;touch-action:none}",
      "#svFrameWrap.pq-v-dual #pqSvDiv{display:block}",
      "#svFrameWrap.pq-row #pqSvDiv{left:var(--pq-r);top:0;bottom:0;width:16px;margin-left:-8px;cursor:col-resize}",
      "#svFrameWrap.pq-col #pqSvDiv{top:var(--pq-r);left:0;right:0;height:16px;margin-top:-8px;cursor:row-resize}",
      "#pqSvDiv:before{content:'';position:absolute;background:#22d3ee;opacity:.75;box-shadow:0 0 10px #22d3ee99;transition:.15s}",
      "#svFrameWrap.pq-row #pqSvDiv:before{left:7px;top:0;bottom:0;width:2px}",
      "#svFrameWrap.pq-col #pqSvDiv:before{top:7px;left:0;right:0;height:2px}",
      "#pqSvDiv:after{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#0f1521;border:1px solid #22d3ee;border-radius:99px;box-shadow:0 2px 10px #000a}",
      "#svFrameWrap.pq-row #pqSvDiv:after{width:10px;height:46px}",
      "#svFrameWrap.pq-col #pqSvDiv:after{height:10px;width:46px}",
      "#pqSvDiv:hover:before,#svFrameWrap.pq-drag #pqSvDiv:before{opacity:1;box-shadow:0 0 16px #22d3eecc}",
      "#svFrameWrap.pq-drag #svFrame,#svFrameWrap.pq-drag #pqSvPano{pointer-events:none}",
      /* label panel */
      ".pq-tag{position:absolute;z-index:1;display:none;align-items:center;gap:7px;top:calc(66px + env(safe-area-inset-top,0px));left:12px;max-width:calc(100% - 24px);padding:5px 6px 5px 10px;border-radius:99px;background:#070b13d9;border:1px solid #ffffff26;color:#e6f1fb;font:700 10.5px var(--mono,monospace);letter-spacing:.4px;backdrop-filter:blur(8px);box-shadow:0 4px 14px #0008;pointer-events:auto;white-space:nowrap}",
      ".pq-tag b{color:#fff}.pq-tag i.pq-sub{font-style:normal;color:#9db3c9;font-weight:600}",
      ".pq-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55eaa;flex:none}",
      ".pq-dot.load{background:#22d3ee;box-shadow:0 0 8px #22d3eeaa;animation:pqSvBlink 1s ease-in-out infinite}",
      ".pq-dot.warn{background:#fbbf24;box-shadow:0 0 8px #fbbf24aa}.pq-dot.err{background:#ef4444;box-shadow:0 0 8px #ef4444aa}",
      "@keyframes pqSvBlink{0%,100%{opacity:1}50%{opacity:.3}}",
      ".pq-tag button{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:99px;color:#9db3c9;font-size:11px}",
      ".pq-tag button:hover{background:#ffffff1f;color:#fff}.pq-tag button.on{background:#22d3ee;color:#04121a}",
      "#svFrameWrap.pq-v-live #pqTagL,#svFrameWrap.pq-v-embed #pqTagE,#svFrameWrap.pq-v-dual .pq-tag{display:flex}",
      "#svFrameWrap.pq-v-dual.pq-row:not(.pq-swap) #pqTagE{left:calc(var(--pq-r) + 12px)}",
      "#svFrameWrap.pq-v-dual.pq-row.pq-swap #pqTagL{left:calc(var(--pq-r) + 12px)}",
      "#svFrameWrap.pq-v-dual.pq-col:not(.pq-swap) #pqTagE{top:calc(var(--pq-r) + 8px)}",
      "#svFrameWrap.pq-v-dual.pq-col.pq-swap #pqTagL{top:calc(var(--pq-r) + 8px)}",
      "@media(max-width:560px){.pq-tag .pq-sub{display:none}}",
      /* ====== BERSIHKAN LAYAR: buang kartu judul/"Lihat di Google Maps" & kontrol bawaan Google agar tidak menumpuk dengan HUD ======
         Embed (iframe lintas-domain → tak bisa disentuh CSS): iframe diperbesar ke atas/kanan lalu dipotong persis seukuran panel.
         Atribusi Google di tepi bawah (logo, syarat, hak cipta) sengaja DIPERTAHANKAN. */
      "body.pq-clean #svFrameWrap{--pq-ct:80px;--pq-cr:64px;overflow:hidden}",
      "body.pq-clean #svFrameWrap #svFrame{position:absolute!important;left:0!important;top:calc(-1 * var(--pq-ct))!important;width:calc(100% + var(--pq-cr))!important;height:calc(100% + var(--pq-ct))!important;clip-path:inset(var(--pq-ct) var(--pq-cr) 0 0)}",
      "body.pq-clean #svFrameWrap.pq-v-dual.pq-row:not(.pq-swap) #svFrame{left:var(--pq-r)!important;width:calc(100% - var(--pq-r) + var(--pq-cr))!important}",
      "body.pq-clean #svFrameWrap.pq-v-dual.pq-row.pq-swap #svFrame{left:0!important;width:calc(var(--pq-r) + var(--pq-cr))!important}",
      "body.pq-clean #svFrameWrap.pq-v-dual.pq-col:not(.pq-swap) #svFrame{top:calc(var(--pq-r) - var(--pq-ct))!important;height:calc(100% - var(--pq-r) + var(--pq-ct))!important;width:calc(100% + var(--pq-cr))!important;left:0!important}",
      "body.pq-clean #svFrameWrap.pq-v-dual.pq-col.pq-swap #svFrame{top:calc(-1 * var(--pq-ct))!important;height:calc(var(--pq-r) + var(--pq-ct))!important;width:calc(100% + var(--pq-cr))!important;left:0!important}",
      /* Live (Maps API): sembunyikan kartu alamat & kontrol zoom/pan/layar penuh; logo + hak cipta tetap */
      "body.pq-clean #pqSvPano .gm-iv-address,body.pq-clean #pqSvPano .gm-iv-address-link,body.pq-clean #pqSvPano .gm-svpc,body.pq-clean #pqSvPano .gm-fullscreen-control,body.pq-clean #pqSvPano .gm-control-active,body.pq-clean #pqSvPano .gmnoprint:not(.gm-style-cc){display:none!important}",
      "#pqSvView .sv-mode-btn.pq-clean-btn{border-left:1px solid #ffffff1f;border-radius:0;margin-left:2px}",
      /* koreksi warna (balik negatif) */
      "body.pq-fix-l #pqSvPano{filter:invert(1)}",
      "body.pq-fix-l #pqSvPano .gmnoprint,body.pq-fix-l #pqSvPano .gm-style-cc,body.pq-fix-l #pqSvPano .gm-svpc,body.pq-fix-l #pqSvPano .gm-control-active,body.pq-fix-l #pqSvPano .gm-fullscreen-control{filter:invert(1)}",
      "body.pq-fix-e #svFrame,body.pq-fix-e #svCompareFrameA,body.pq-fix-e #svCompareFrameB{filter:invert(1)}",
      /* menu */
      "#pqSvMenu{position:absolute;z-index:6;display:none;width:min(306px,calc(100% - 20px));padding:12px 13px 11px;border-radius:14px;background:#0a0e17f7;border:1px solid #22d3ee55;color:#dbe7f3;font:600 12px system-ui,sans-serif;box-shadow:0 18px 50px #000c;backdrop-filter:blur(14px)}",
      "#pqSvMenu.show{display:block}",
      "#pqSvMenu .pq-mh{font:800 11px var(--mono,monospace);letter-spacing:.8px;color:#22d3ee;text-transform:uppercase;margin-bottom:8px}",
      "#pqSvMenu .pq-ms{font:800 10px var(--mono,monospace);letter-spacing:.7px;color:#7d92a8;text-transform:uppercase;margin:11px 0 5px}",
      "#pqSvMenu .pq-row2{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0}",
      "#pqSvMenu .pq-sw{all:unset;cursor:pointer;flex:none;width:36px;height:20px;border-radius:99px;background:#334155;position:relative;transition:.15s}",
      "#pqSvMenu .pq-sw:after{content:'';position:absolute;left:2px;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s}",
      "#pqSvMenu .pq-sw.on{background:#06b6d4}#pqSvMenu .pq-sw.on:after{left:18px}",
      "#pqSvMenu .pq-seg{display:flex;gap:3px;background:#0f1521;border:1px solid #ffffff1f;border-radius:9px;padding:3px}",
      "#pqSvMenu .pq-seg button,#pqSvMenu .pq-btn{all:unset;cursor:pointer;box-sizing:border-box;text-align:center;padding:6px 8px;border-radius:7px;font:700 11px system-ui,sans-serif;color:#9db3c9}",
      "#pqSvMenu .pq-seg button{flex:1}#pqSvMenu .pq-seg button.on{background:#22d3ee;color:#04121a}",
      "#pqSvMenu .pq-btns{display:flex;gap:6px;margin-top:6px}",
      "#pqSvMenu .pq-btn{flex:1;background:#ffffff14;border:1px solid #ffffff26;color:#e6f1fb}#pqSvMenu .pq-btn:hover{background:#ffffff26}",
      "#pqSvMenu small{display:block;color:#7d92a8;font-weight:500;line-height:1.4;margin-top:2px}",
      "#pqSvMenu .pq-warn{margin-top:8px;padding:7px 9px;border-radius:8px;background:#fbbf2418;border:1px solid #fbbf2455;color:#fde68a;font-weight:600;line-height:1.4;display:none}",
      "#pqSvMenu .pq-warn.show{display:block}",
      "#pqSvMenu .pq-foot{margin-top:9px;padding-top:8px;border-top:1px solid #ffffff14;color:#6b7f95;font:600 10px var(--mono,monospace)}",
      /* ====== RAPIHKAN HUD ATAS: responsif terhadap lebar PANEL (bukan layar) ====== */
      "#svFrameWrap{container:pqsv/inline-size}",
      "#svHudTop{flex-wrap:wrap;align-items:center;gap:6px 8px;padding:10px 10px 20px;padding-top:calc(10px + env(safe-area-inset-top,0px))}",
      "#svHudTop #svClose,#svHudTop #svExternalLink,#svHudTop #svHistoryBtn,#svHudTop #svInfoToggleBtn,#svHudTop #svMeasureBtn{width:34px;height:34px;border-radius:9px;font-size:13px}",
      "#svHudTop #svModeSwitch{order:0;padding:2px;gap:2px;border-radius:10px}",
      "#svHudTop .sv-mode-btn{height:28px;min-width:28px;border-radius:8px;font-size:12px}",
      "#svHudTop #svModeSwitch .sv-mode-btn{width:28px}",
      "#svHudTop #pqSvView{padding:2px;gap:2px;border-radius:10px}",
      "#svHudTop #pqSvView .sv-mode-btn{padding:0 8px;gap:5px;font-size:10px}",
      "#svHudTop #svHistoryBtn{margin-left:auto}",
      /* baris info: nama ruas + STA/KM satu garis, tidak pernah pecah baris */
      "#svHudTop #svHudInfo{order:10;flex:1 1 100%;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:4px 8px;margin-top:-2px;min-width:0}",
      "#svHudTop #svRoadName{flex:0 1 auto;min-width:0;max-width:100%}",
      "#svHudTop #svStaBadge{flex:none;margin:0;padding:3px 10px;font-size:12px;white-space:nowrap}",
      "#svHudTop #svHistoryActiveBadge{margin:0;flex:0 1 auto;min-width:0}",
      "#svFrameWrap .pq-tag{top:calc(80px + env(safe-area-inset-top,0px));padding:3px 4px 3px 9px;font-size:10.5px}",
      "@container pqsv (max-width:640px){#pqSvView .sv-mode-btn span{display:none}#svHudTop #pqSvView .sv-mode-btn{padding:0;width:28px}}",
      "@container pqsv (max-width:420px){#svHudTop{gap:5px 4px;padding-left:8px;padding-right:8px}#svHudTop #svClose,#svHudTop #svExternalLink,#svHudTop #svHistoryBtn,#svHudTop #svInfoToggleBtn,#svHudTop #svMeasureBtn{width:32px;height:32px}#svHudTop .sv-mode-btn,#svHudTop #svModeSwitch .sv-mode-btn,#svHudTop #pqSvView .sv-mode-btn{width:26px;min-width:26px;height:26px}#svHudTop #svHudInfo{margin-top:0}#svFrameWrap .pq-tag{top:calc(76px + env(safe-area-inset-top,0px))}}",
      "@container pqsv (max-width:350px){#svFrameWrap .pq-tag{top:calc(116px + env(safe-area-inset-top,0px))}}",
      /* panel lebar: info kembali sejajar di tengah (satu baris) */
      "@container pqsv (min-width:760px){#svHudTop #svHudInfo{order:0;flex:1 1 0;margin-top:0}#svHudTop #svHistoryBtn{margin-left:0}#svFrameWrap .pq-tag{top:calc(56px + env(safe-area-inset-top,0px))}}",
      "@media(prefers-reduced-motion:reduce){.pq-dot.load{animation:none}}"
    ].join("\n");
    document.head.appendChild(c);
  })();

  /* ------------------------------------------------------------------ DOM: tombol HUD, label panel, pembatas, menu */
  var btns = {}, tagL = null, tagE = null, divEl = null, menu = null;

  function mk(tag, attrs, html) {
    var e = document.createElement(tag), k;
    for (k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  function buildUI() {
    var wrap = $("svFrameWrap"), hud = $("svHudTop"), sw = $("svModeSwitch");
    if (!wrap || !hud) return false;
    if ($("pqSvView")) return true;

    var g = mk("div", { id: "pqSvView" });
    var defs = [
      ["live", "fa-bolt", "LIVE", "Live — panorama Maps API: koordinat, STA & arah ikut bergeser (Alt+1)"],
      ["embed", "fa-window-maximize", "EMBED", "Embed Google — gratis, tanpa watermark pengembang (Alt+2)"],
      ["dual", "fa-clone", "DUAL", "Dual — Live + Embed berdampingan, Embed ikut posisi Live (Alt+3)"]
    ];
    defs.forEach(function (d) {
      var b = mk("button", { type: "button", "class": "sv-mode-btn", title: d[3], "data-v": d[0] }, '<i class="fa-solid ' + d[1] + '"></i><span>' + d[2] + "</span>");
      b.addEventListener("click", function (e) { e.stopPropagation(); setView(d[0]); });
      btns[d[0]] = b; g.appendChild(b);
    });
    var cb = mk("button", { type: "button", "class": "sv-mode-btn pq-clean-btn", id: "pqSvCleanBtn", title: "Bersihkan layar — sembunyikan kartu & kontrol bawaan Google (Alt+B)" }, '<i class="fa-solid fa-broom"></i>');
    cb.addEventListener("click", function (e) { e.stopPropagation(); setClean(!S.clean); });
    g.appendChild(cb); btns.clean = cb;
    var mb = mk("button", { type: "button", "class": "sv-mode-btn pq-sep", title: "Warna, tata letak & sinkronisasi", id: "pqSvMenuBtn" }, '<i class="fa-solid fa-sliders"></i>');
    mb.addEventListener("click", function (e) { e.stopPropagation(); toggleMenu(); });
    g.appendChild(mb); btns.menu = mb;
    if (sw && sw.parentNode === hud) hud.insertBefore(g, sw.nextSibling); else hud.insertBefore(g, hud.firstChild);

    divEl = mk("div", { id: "pqSvDiv", title: "Seret untuk mengubah ukuran · klik 2× untuk 50:50" });
    wrap.appendChild(divEl);
    wireDivider();

    tagL = mk("div", { "class": "pq-tag", id: "pqTagL" },
      '<span class="pq-dot load"></span><b>LIVE</b><i class="pq-sub" id="pqTagLsub">Maps API</i>' +
      '<button type="button" id="pqFixL" title="Koreksi warna panel Live (balik gambar negatif)"><i class="fa-solid fa-circle-half-stroke"></i></button>');
    tagE = mk("div", { "class": "pq-tag", id: "pqTagE" },
      '<span class="pq-dot"></span><b>EMBED</b><i class="pq-sub" id="pqTagEsub">Google</i>' +
      '<button type="button" id="pqFixE" title="Koreksi warna panel Embed (balik gambar negatif)"><i class="fa-solid fa-circle-half-stroke"></i></button>');
    wrap.appendChild(tagL); wrap.appendChild(tagE);
    $("pqFixL").addEventListener("click", function (e) { e.stopPropagation(); setFix("L", !S.fixL); });
    $("pqFixE").addEventListener("click", function (e) { e.stopPropagation(); setFix("E", !S.fixE); });

    menu = mk("div", { id: "pqSvMenu" },
      '<div class="pq-mh"><i class="fa-solid fa-street-view"></i> &nbsp;Tampilan Street View</div>' +
      '<div class="pq-ms">Tampilan</div>' +
      '<div class="pq-row2"><span>Bersihkan layar<small>Sembunyikan kartu judul, &ldquo;Lihat di Google Maps&rdquo; &amp; kontrol bawaan Google. Logo &amp; hak cipta Google di tepi bawah tetap tampil.</small></span><button type="button" class="pq-sw" id="pqSwClean"></button></div>' +
      '<div class="pq-ms">Warna</div>' +
      '<div class="pq-row2"><span>Koreksi warna — Live</span><button type="button" class="pq-sw" id="pqSwL"></button></div>' +
      '<div class="pq-row2"><span>Koreksi warna — Embed</span><button type="button" class="pq-sw" id="pqSwE"></button></div>' +
      '<small>Gambar tampak negatif (langit gelap, pohon putih) biasanya karena mode gelap otomatis browser atau ekstensi — bukan dari aplikasi. Nyalakan koreksi pada panel yang terbalik.</small>' +
      '<div class="pq-warn" id="pqDrWarn"><i class="fa-solid fa-triangle-exclamation"></i> Ekstensi Dark Reader terdeteksi. Matikan untuk situs ini, atau nyalakan koreksi warna di atas.</div>' +
      '<div class="pq-ms">Dual</div>' +
      '<div class="pq-seg" id="pqSegLay"><button type="button" data-l="auto">Auto</button><button type="button" data-l="row"><i class="fa-solid fa-table-columns"></i> Kiri-Kanan</button><button type="button" data-l="col"><i class="fa-solid fa-table-cells-large" style="transform:rotate(90deg)"></i> Atas-Bawah</button></div>' +
      '<div class="pq-btns"><button type="button" class="pq-btn" id="pqBtnSwap"><i class="fa-solid fa-arrow-right-arrow-left"></i> Tukar sisi</button><button type="button" class="pq-btn" id="pqBtnReset"><i class="fa-solid fa-arrows-left-right"></i> Reset 50:50</button></div>' +
      '<div class="pq-row2" style="margin-top:6px"><span>Embed ikut Live<small>Posisi, arah, zoom &amp; kemiringan disalin otomatis (hemat: tunggu posisi tenang).</small></span><button type="button" class="pq-sw" id="pqSwSync"></button></div>' +
      '<div class="pq-btns"><button type="button" class="pq-btn" id="pqBtnSync"><i class="fa-solid fa-rotate"></i> Sinkronkan sekarang</button></div>' +
      '<div class="pq-foot">Alt+1 Live · Alt+2 Embed · Alt+3 Dual · Alt+B bersihkan layar · Alt+C koreksi warna · Alt+X tukar sisi</div>');
    wrap.appendChild(menu);
    menu.addEventListener("click", function (e) { e.stopPropagation(); });
    $("pqSwL").addEventListener("click", function () { setFix("L", !S.fixL); });
    $("pqSwE").addEventListener("click", function () { setFix("E", !S.fixE); });
    $("pqSwClean").addEventListener("click", function () { setClean(!S.clean); });
    $("pqSwSync").addEventListener("click", function () { S.sync = !S.sync; ss(K.sync, S.sync ? 1 : 0); if (S.sync) syncNow(); refreshUI(); });
    $("pqBtnSync").addEventListener("click", function () { syncNow(true); });
    $("pqBtnSwap").addEventListener("click", function () { swapSides(); });
    $("pqBtnReset").addEventListener("click", function () { setRatio(50, true); });
    Array.prototype.forEach.call(menu.querySelectorAll("#pqSegLay button"), function (b) {
      b.addEventListener("click", function () { S.lay = b.getAttribute("data-l"); ss(K.lay, S.lay); sig = ""; layout(); refreshUI(); });
    });
    document.addEventListener("click", function (e) {
      if (menu && menu.classList.contains("show") && !menu.contains(e.target) && !(btns.menu && btns.menu.contains(e.target))) menu.classList.remove("show");
    });
    if (window.ResizeObserver) { try { new ResizeObserver(function () { sig = ""; }).observe(wrap); } catch (e) {} }
    refreshUI();
    return true;
  }

  function toggleMenu() {
    if (!menu) return;
    var show = !menu.classList.contains("show");
    menu.classList.toggle("show", show);
    if (show) {
      var wrap = $("svFrameWrap"), wr = wrap.getBoundingClientRect(), br = btns.menu.getBoundingClientRect();
      var left = Math.max(10, Math.min(br.left - wr.left, wr.width - menu.offsetWidth - 10));
      menu.style.left = left + "px"; menu.style.top = (br.bottom - wr.top + 8) + "px";
    }
    refreshUI();
  }

  function refreshUI() {
    ["live", "embed", "dual"].forEach(function (v) { if (btns[v]) btns[v].classList.toggle("active", S.view === v); });
    var f = function (id, on) { var e = $(id); if (e) e.classList.toggle("on", !!on); };
    f("pqFixL", S.fixL); f("pqFixE", S.fixE); f("pqSwL", S.fixL); f("pqSwE", S.fixE); f("pqSwSync", S.sync); f("pqSwClean", S.clean); f("pqSvCleanBtn", S.clean);
    if (menu) Array.prototype.forEach.call(menu.querySelectorAll("#pqSegLay button"), function (b) { b.classList.toggle("on", b.getAttribute("data-l") === S.lay); });
    var dw = $("pqDrWarn"); if (dw) dw.classList.toggle("show", hasDarkReader());
  }

  /* ------------------------------------------------------------------ koreksi warna */
  function applyFix() {
    var b = document.body; if (!b) return;
    b.classList.toggle("pq-fix-l", S.fixL);
    b.classList.toggle("pq-fix-e", S.fixE);
    b.classList.toggle("pq-clean", S.clean);
  }
  function setClean(on, quiet) {
    S.clean = !!on; ss(K.clean, S.clean ? 1 : 0);
    applyFix(); refreshUI(); resizePano();
    if (!quiet) toast_("Bersihkan layar: " + (S.clean ? "ON" : "OFF"));
  }
  function setFix(which, on, quiet) {
    if (which === "L") { S.fixL = !!on; ss(K.fixL, S.fixL ? 1 : 0); } else { S.fixE = !!on; ss(K.fixE, S.fixE ? 1 : 0); }
    applyFix(); refreshUI();
    if (!quiet) toast_("Koreksi warna " + (which === "L" ? "Live" : "Embed") + ": " + (on ? "ON" : "OFF"));
  }
  function hasDarkReader() {
    try { return !!(document.documentElement.getAttribute("data-darkreader-mode") || document.querySelector("style.darkreader,meta[name='darkreader']")); } catch (e) { return false; }
  }

  /* ------------------------------------------------------------------ tata letak */
  function orient() {
    if (S.lay === "row" || S.lay === "col") return S.lay;
    var w = $("svFrameWrap"); if (!w) return "row";
    return w.clientWidth >= w.clientHeight * 1.25 ? "row" : "col";
  }
  function resizePano() {
    try { var L = Live(), P = L && L.pano && L.pano(); if (P && window.google && google.maps) requestAnimationFrame(function () { google.maps.event.trigger(P, "resize"); }); } catch (e) {}
  }
  function layout() {
    var w = $("svFrameWrap"); if (!w) return;
    var sh = computeShown(), o = orient(), s2 = sh + "|" + o + "|" + S.swap + "|" + S.r;
    if (s2 === sig) return;
    var prev = shown; sig = s2; shown = sh;
    w.classList.remove("pq-v-live", "pq-v-embed", "pq-v-dual", "pq-row", "pq-col", "pq-swap");
    w.classList.add("pq-v-" + sh, "pq-" + o);
    if (S.swap) w.classList.add("pq-swap");
    w.style.setProperty("--pq-r", S.r + "%");
    resizePano();
    /* baru masuk Dual (mis. Live selesai dimuat) → pastikan Embed memuat posisi Live */
    if (sh === "dual" && prev !== "dual") ap = null;
  }
  function setRatio(r, save) {
    S.r = Math.max(15, Math.min(85, r)); sig = "";
    var w = $("svFrameWrap"); if (w) w.style.setProperty("--pq-r", S.r + "%");
    if (save) ss(K.r, S.r);
    layout(); resizePano();
  }
  function swapSides() { S.swap = !S.swap; ss(K.swap, S.swap ? 1 : 0); sig = ""; layout(); }

  function wireDivider() {
    var drag = false;
    function pos(e) {
      var w = $("svFrameWrap"), r = w.getBoundingClientRect(), row = w.classList.contains("pq-row");
      var p = row ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
      setRatio(p * 100, false);
    }
    divEl.addEventListener("pointerdown", function (e) {
      drag = true; try { divEl.setPointerCapture(e.pointerId); } catch (x) {}
      $("svFrameWrap").classList.add("pq-drag"); e.preventDefault(); e.stopPropagation();
    });
    divEl.addEventListener("pointermove", function (e) { if (drag) pos(e); });
    function end(e) {
      if (!drag) return; drag = false;
      try { divEl.releasePointerCapture(e.pointerId); } catch (x) {}
      $("svFrameWrap").classList.remove("pq-drag"); ss(K.r, S.r); resizePano();
    }
    divEl.addEventListener("pointerup", end); divEl.addEventListener("pointercancel", end);
    divEl.addEventListener("dblclick", function (e) { e.stopPropagation(); setRatio(50, true); });
  }

  /* ------------------------------------------------------------------ sinkron Embed ← Live */
  function readPano() {
    var L = Live(); if (!L || !L.ready || !L.ready()) return null;
    var P = L.pano && L.pano(); if (!P) return null;
    var pos = P.getPosition(); if (!pos) return null;
    var pv = P.getPov() || {};
    var z = pv.zoom != null ? pv.zoom : (P.getZoom ? P.getZoom() : 1);
    return { lat: pos.lat(), lng: pos.lng(), h: norm(pv.heading || 0), p: pv.pitch || 0, z: z == null ? 1 : z };
  }
  function appPoint() {
    try {
      var e = getSvPoint(); if (!e) return null;
      var h = e.next && typeof bearing === "function" ? Math.round(bearing(e.lat, e.lng, e.next.lat, e.next.lng)) : 0;
      return { lat: e.lat, lng: e.lng, h: norm(h), p: 0, z: 1 };
    } catch (x) { return null; }
  }
  function embedURL(c) {
    var fov = Math.max(10, Math.min(100, Math.round(180 / Math.pow(2, c.z))));
    var pitch = Math.max(-90, Math.min(90, Math.round(c.p)));
    return "https://www.google.com/maps/embed/v1/streetview?key=" + encodeURIComponent(key()) +
      "&location=" + c.lat.toFixed(6) + "," + c.lng.toFixed(6) + "&heading=" + Math.round(norm(c.h)) + "&pitch=" + pitch + "&fov=" + fov;
  }
  function applyEmbed(c) {
    var f = $("svFrame"), k = key(); if (!f || !k || !c) return;
    var url = embedURL(c);
    ap = { lat: c.lat, lng: c.lng, h: c.h, p: c.p, z: c.z, t: Date.now() };
    if (f.getAttribute("src") === url) return;
    f.style.display = ""; f.style.visibility = "visible";
    var l = $("svLoading"); if (l) l.classList.add("hide");
    embBusy = true;
    var done = function () { embBusy = false; f.removeEventListener("load", done); };
    f.addEventListener("load", done);
    setTimeout(function () { embBusy = false; }, 3500);
    f.src = url;
  }
  function syncNow(toastIt) {
    var c = readPano(); if (!c) { if (toastIt) toast_("Live belum siap — tunggu panorama selesai dimuat", true); return; }
    cand = null; applyEmbed(c);
    if (toastIt) toast_("Embed disinkronkan dengan posisi Live");
  }
  function syncTick() {
    if (shown !== "dual" || histOn()) return;
    var cur = readPano(); if (!cur) return;
    var now = Date.now(), a = RA(), playing = !!(a && a.playing);
    if (!cand || dist(cand, cur) > 1.5 || angd(cand.h, cur.h) > 2 || Math.abs(cand.p - cur.p) > 2 || Math.abs(cand.z - cur.z) > 0.15) {
      cand = { lat: cur.lat, lng: cur.lng, h: cur.h, p: cur.p, z: cur.z, t0: now };
    }
    if (!ap) { applyEmbed(cur); return; }                 /* pertama kali / baru masuk Dual */
    if (!S.sync) return;
    var diff = dist(ap, cur) >= 4 || angd(ap.h, cur.h) >= 8 || Math.abs(ap.p - cur.p) >= 8 || Math.abs(ap.z - cur.z) >= 0.4;
    if (!diff) return;
    if (playing) { if (dist(ap, cur) < 20 || now - ap.t < 2000) return; }   /* sama dengan ritme svauto */
    else if (now - cand.t0 < SETTLE) return;
    applyEmbed(cur);
  }

  /* dipanggil petaqu-svlive.js */
  function onPlaced(lat, lng, h) {
    if (S.view !== "dual" || liveFailed()) return;
    cand = null; applyEmbed({ lat: lat, lng: lng, h: h || 0, p: 0, z: 1 });
  }
  function onLiveFail() { sig = ""; try { layout(); refreshUI(); } catch (e) {} }

  /* ------------------------------------------------------------------ ganti mode */
  function setView(v, quiet) {
    if (["live", "embed", "dual"].indexOf(v) < 0) return;
    var L = Live(), prev = S.view;
    var fromPano = (L && L.ready && L.ready() && !L.stale) ? readPano() : null;
    var cap = fromPano || ((L && !L.stale && lastCap) ? lastCap : null) || appPoint();   /* lastCap: arah/zoom terakhir dipertahankan saat ganti mode */
    S.view = v; sig = "";

    if (!key() && v !== "embed") { toast_("Live butuh API key Google Maps (Pengaturan)", true); }

    if (v === "embed") {
      if (L && L.hide) L.hide();                          /* panorama disembunyikan, iframe tampil */
      if (cap) { ap = null; applyEmbed(cap); }
    } else if (L && L.go && cap && key()) {
      if (v === "dual") ap = null;
      var ok = L.go({ lat: cap.lat, lng: cap.lng, h: cap.h });   /* memuat / menampilkan panorama */
      if (v === "dual" && !ok) { /* Live tidak bisa dipakai → Embed saja */ if (cap) applyEmbed(cap); }
      if (v === "live" && prev === "dual") { /* iframe disembunyikan saat panorama tampil */
        var f = $("svFrame"); if (f && L.ready && L.ready()) { f.style.display = "none"; }
      }
    }
    layout(); refreshUI(); resizePano();
    if (!quiet) toast_({ live: "Tampilan: Live (Maps API)", embed: "Tampilan: Embed Google", dual: "Tampilan: Dual — Live + Embed" }[v]);
  }

  /* ------------------------------------------------------------------ deteksi galat Google di panel Live */
  var ERR = /tidak dapat memuat Google Maps|can.?t load Google Maps|development purposes only|Do you own this website|Apakah Anda pemilik situs/i;
  function checkErr() {
    var L = Live(), d = L && L.div && L.div(); if (!d) return;
    var was = liveWarn, t = ""; try { t = d.innerText || ""; } catch (e) {}   /* innerText: hanya teks yang benar-benar terlihat */
    liveWarn = ERR.test(t);
    if (liveWarn && !was && S.view === "live" && !warnedOnce && key()) {
      warnedOnce = true;
      toast_("Live memuat peringatan Google (kunci/penagihan) — membuka Dual agar Embed yang bersih ikut tampil", true);
      setView("dual", true);
    }
  }
  function attachObserver() {
    var L = Live(), d = L && L.div && L.div();
    if (!d || d === obsDiv || !window.MutationObserver) return;
    obsDiv = d;
    try { if (obs) obs.disconnect(); } catch (e) {}
    obs = new MutationObserver(function () { clearTimeout(errT); errT = setTimeout(checkErr, 400); });
    try { obs.observe(d, { childList: true, subtree: true, characterData: true }); } catch (e) {}
    checkErr();
  }

  /* ------------------------------------------------------------------ label status panel */
  function setTag(tag, dotCls, sub) {
    if (!tag) return;
    var dot = tag.querySelector(".pq-dot"), sp = tag.querySelector(".pq-sub");
    if (dot) { var cn = "pq-dot" + (dotCls ? " " + dotCls : ""); if (dot.className !== cn) dot.className = cn; }
    if (sp && sp.textContent !== sub) sp.textContent = sub;
  }
  function updateTags() {
    var L = Live(), st = L && L.state ? L.state() : 0, a = RA();
    var lt = ["", "Maps API"];
    if (!key()) lt = ["err", "butuh API key"];
    else if (histOn()) lt = ["warn", "foto lama → Embed"];
    else if (st === -1) lt = ["err", "gagal → Embed"];
    else if (liveWarn) lt = ["warn", "peringatan Google"];
    else if (st === 1 || (st === 0 && S.view !== "embed")) lt = ["load", "memuat…"];
    else if (st === 2 && L.ready()) lt = ["", a && a.playing ? "mengikuti kendaraan" : "siap · bisa digeser"];
    else if (st === 2) lt = ["warn", "tak ada foto di titik ini"];
    setTag(tagL, lt[0], lt[1]);
    var et = ["", "Google"];
    if (shown === "dual") et = embBusy ? ["load", "menyinkron…"] : (S.sync ? ["", "ikut Live"] : ["warn", "beku (manual)"]);
    else if (shown === "embed") et = embBusy ? ["load", "memuat…"] : ["", "tanpa watermark"];
    setTag(tagE, et[0], et[1]);
  }

  /* ------------------------------------------------------------------ siklus utama & pintasan */
  var drChecked = false, wasOpen = false;
  function tick() {
    if (!buildUI()) return;
    applyFix();
    var open = overlayOpen();
    if (!open) { if (wasOpen) { wasOpen = false; ap = null; cand = null; lastCap = null; embBusy = false; liveWarn = false; sig = ""; if (menu) menu.classList.remove("show"); } return; }
    if (!wasOpen) { wasOpen = true; ap = null; cand = null; sig = ""; if (S.view !== "embed") setView("embed", true); checkErr(); }
    if (!drChecked || (!drWarned && hasDarkReader())) {
      drChecked = true;
      if (hasDarkReader() && !drWarned) { drWarned = true; toast_("Dark Reader terdeteksi — jika Street View tampak negatif, buka menu ⚙ lalu nyalakan Koreksi warna", true); refreshUI(); }
    }
    attachObserver();
    var c0 = readPano(); if (c0) lastCap = c0;
    layout();
    syncTick();
    updateTags();
  }
  setInterval(tick, 300);

  document.addEventListener("keydown", function (e) {
    if (!e.altKey || e.ctrlKey || e.metaKey || !overlayOpen()) return;
    var t = e.target, tn = t && t.tagName;
    if (tn === "INPUT" || tn === "TEXTAREA" || tn === "SELECT" || (t && t.isContentEditable)) return;
    var k = e.key, c = e.code, done = true;
    if (c === "Digit1" || k === "1") setView("live");
    else if (c === "Digit2" || k === "2") setView("embed");
    else if (c === "Digit3" || k === "3") setView("dual");
    else if (c === "KeyC") { if (shown === "dual") { var on = !(S.fixL && S.fixE); setFix("L", on, true); setFix("E", on, true); toast_("Koreksi warna Live + Embed: " + (on ? "ON" : "OFF")); } else setFix(shown === "embed" ? "E" : "L", shown === "embed" ? !S.fixE : !S.fixL); }
    else if (c === "KeyX") swapSides();
    else if (c === "KeyB") setClean(!S.clean);
    else done = false;
    if (done) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu && menu.classList.contains("show")) menu.classList.remove("show"); });

  window.PQSvView = {
    wantsLive: wantsLive, wantsFrame: wantsFrame, onPlaced: onPlaced, onLiveFail: onLiveFail,
    setView: setView, getView: function () { return S.view; }, shown: function () { return shown; },
    setFix: setFix, setClean: setClean, getClean: function () { return S.clean; }, syncNow: syncNow, swap: swapSides, setRatio: setRatio
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { buildUI(); applyFix(); });
  else { buildUI(); applyFix(); }
})();
