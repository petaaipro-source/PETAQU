/* PETAQU — DOCK Street View (satu baris tombol di bawah).
   Semua tombol yang tadinya tersebar (tutup, ◀ ▶ + judul, ⇄ ↻, kecepatan & play, Live/Embed/Dual, bersihkan layar,
   pengaturan, split/penuh, ukur, riwayat foto, info titik, buka di Google Maps, Rekam/Tabel/Auto/Peta) dipindahkan
   ke SATU dock di bawah panel Street View. Elemen dipindah (bukan disalin) sehingga ID, event & logikanya tetap utuh.
   • Bilah atas (nama ruas/STA, tombol) disembunyikan — infonya sudah ada di judul dock.
   • Dock dapat digeser mendatar (roda mouse / geser jari) bila panel sempit; tepi memudar sebagai petunjuk.
   • Tombol ⋮⋮ (Rekam) membuka/menutup baris alat tambahan; pilihan diingat per perangkat.
   • Dock diberi jarak ±22 px dari tepi bawah supaya logo & hak cipta Google (wajib ditampilkan) tetap terlihat.
   Tidak mengubah fitur lain; hanya memindahkan tombol & menata ulang tampilan. */
(function () {
  "use strict";
  if (window.__pqSvDock) return;
  window.__pqSvDock = 1;

  var KEY = "pq_sv_dock_open";
  function $(id) { return document.getElementById(id); }
  function ls(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function ss(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { } }
  function open_() { var o = $("svOverlay"); return !!(o && o.classList.contains("show")); }

  /* ------------------------------------------------------------------ CSS */
  function css() {
    if ($("pqSvDockCss")) return;
    var s = document.createElement("style"); s.id = "pqSvDockCss";
    s.textContent = [
      "#svFrameWrap{--pqd-b:36px;--pqd-gap:22px;--pqd-h:calc(var(--pqd-b) + 14px);--pqd-top:calc(var(--pqd-gap) + var(--pqd-h) + 8px + env(safe-area-inset-bottom,0px))}",
      /* ===== bersihkan layar (kartu judul & kontrol bawaan Google) — juga di Mode Ringan, saat petaqu-svview.js tidak dimuat ===== */
      "body.pq-clean #svFrameWrap{--pq-ct:132px;--pq-cr:72px;overflow:hidden}",
      "body.pq-clean #svFrameWrap #svFrame{position:absolute!important;left:0!important;top:calc(-1 * var(--pq-ct))!important;width:calc(100% + var(--pq-cr))!important;height:calc(100% + var(--pq-ct))!important;clip-path:inset(var(--pq-ct) var(--pq-cr) 0 0)}",
      "body.pq-clean #pqSvPano .gm-iv-address,body.pq-clean #pqSvPano .gm-iv-address-link,body.pq-clean #pqSvPano .gm-svpc,body.pq-clean #pqSvPano .gm-fullscreen-control,body.pq-clean #pqSvPano .gm-control-active,body.pq-clean #pqSvPano .gmnoprint:not(.gm-style-cc){display:none!important}",
      /* ===== bilah atas lama: tidak dipakai lagi (semua tombol pindah ke dock) ===== */
      "#svFrameWrap #svHudTop,#svFrameWrap #svHudBottom,#svFrameWrap .pq-tag{display:none!important}",
      /* ===== dock ===== */
      "#pqSvDock{position:absolute;z-index:12;left:0;right:0;margin:0 auto;width:max-content;max-width:calc(100% - 16px);bottom:calc(var(--pqd-gap) + env(safe-area-inset-bottom,0px));border-radius:18px;background:#0a0e17ec;border:1px solid #38bdf84d;box-shadow:0 10px 30px #000b,inset 0 1px 0 #ffffff12;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#e6f1fb;font:600 12px system-ui,sans-serif;pointer-events:auto}",
      "#pqSvDockRow{display:flex;align-items:center;gap:6px;padding:6px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;overscroll-behavior-x:contain;touch-action:pan-x;-webkit-overflow-scrolling:touch;border-radius:inherit;--fl:0px;--fr:0px;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 var(--fl),#000 calc(100% - var(--fr)),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 var(--fl),#000 calc(100% - var(--fr)),transparent 100%)}",
      "#pqSvDockRow::-webkit-scrollbar{display:none}",
      "#pqSvDock.pqd-l #pqSvDockRow{--fl:22px}#pqSvDock.pqd-r #pqSvDockRow{--fr:22px}",
      /* grup: pemisah tipis di antara kelompok */
      "#pqSvDockRow>*{flex:none;order:5}",
      "#pqSvDockRow>*+*{position:relative;margin-left:2px;padding-left:8px}",
      "#pqSvDockRow>*+*:before{content:'';position:absolute;left:0;top:7px;bottom:7px;width:1px;background:#ffffff24}",
      "#pqSvDockRow>.pqd-close{order:0}#pqSvDockRow>#pqSvBar{order:1}#pqSvDockRow>#svAutoPlayGroup{order:2}#pqSvDockRow>#pqRkTools{order:3}#pqSvDockRow>#pqSvView{order:4}#pqSvDockRow>#svModeSwitch{order:5}#pqSvDockRow>.pqd-tools{order:6}#pqSvDockRow>.pqd-more{order:7}",
      ".pqd-g{display:flex;align-items:center;gap:4px}",
      /* ===== tombol seragam ===== */
      "#pqSvDock .pqd-b,#pqSvDock #pqSvBar button,#pqSvDock #svAutoPlayGroup button,#pqSvDock #pqSvView button,#pqSvDock #svModeSwitch button,#pqSvDock #pqRkTools button,#pqSvDock #pqRkLaunch{all:unset;box-sizing:border-box;position:relative;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:var(--pqd-b);width:var(--pqd-b);height:var(--pqd-b);padding:0;margin:0;border-radius:11px;background:#ffffff12;border:1px solid #ffffff26;color:#e6f1fb;font:700 13px system-ui,sans-serif;line-height:1;cursor:pointer;box-shadow:none;text-decoration:none;transition:background .15s,border-color .15s,color .15s,transform .1s;-webkit-tap-highlight-color:transparent}",
      "#pqSvDock .pqd-b:hover,#pqSvDock #pqSvBar button:hover:not(:disabled),#pqSvDock #svAutoPlayGroup button:hover,#pqSvDock #pqSvView button:hover,#pqSvDock #svModeSwitch button:hover,#pqSvDock #pqRkTools button:hover,#pqSvDock #pqRkLaunch:hover{background:#38bdf829;border-color:#38bdf8;color:#7dd3fc}",
      "#pqSvDock .pqd-b:active,#pqSvDock #pqSvBar button:active:not(:disabled),#pqSvDock #svAutoPlayGroup button:active,#pqSvDock #pqSvView button:active,#pqSvDock #svModeSwitch button:active,#pqSvDock #pqRkTools button:active,#pqSvDock #pqRkLaunch:active{transform:scale(.93)}",
      "#pqSvDock .pqd-b:focus-visible,#pqSvDock button:focus-visible{outline:2px solid #22d3ee;outline-offset:1px}",
      "#pqSvDock #pqSvBar button:disabled{opacity:.3;cursor:default;pointer-events:none}",
      "#pqSvDock .pqd-b i,#pqSvDock button i{font-size:14px;line-height:1;margin:0}",
      /* aktif */
      "#pqSvDock .pqd-b.active,#pqSvDock #svAutoPlayBtn.active,#pqSvDock #pqSvView button.active,#pqSvDock #svModeSwitch button.active,#pqSvDock #pqRkTools button.on,#pqSvDock #pqRkLaunch.on,#pqSvDock #pqSvView button.on{background:var(--cyan,#22d3ee);border-color:var(--cyan,#22d3ee);color:#04121a;box-shadow:0 0 12px #22d3ee66}",
      "#pqSvDock #pqRkLaunch.on{background:#22d3ee26;color:var(--cyan,#22d3ee);box-shadow:0 0 0 2px #22d3ee40}",
      /* khusus */
      "#pqSvDock .pqd-close #svClose:hover{background:#ef444426;border-color:#ef4444;color:#fca5a5}",
      "#pqSvDock .pqd-b#svHistoryBtn.active{background:#f59e0b26;border-color:#f59e0b;color:#fbbf24;box-shadow:0 0 12px #f59e0b4d}",
      "#pqSvDock .pqd-b#svHistoryBtn:disabled{opacity:.35;cursor:default}",
      "#pqSvDock #pqRkTools #pqRkRec{background:linear-gradient(135deg,#e11d48,#f43f5e);border-color:#fda4af;color:#fff}#pqSvDock #pqRkTools #pqRkRec:hover{filter:brightness(1.12);color:#fff}",
      "#pqSvDock #svAutoPlayGroup #svAutoPlaySpeedBtn{font:800 11px var(--mono,monospace);letter-spacing:.2px;min-width:40px;width:auto;padding:0 8px}",
      "#pqSvDock #svAutoPlayGroup #svAutoPlaySpeedBtn span{font:inherit}",
      /* label teks tombol Rekam dll. disembunyikan (tooltip tetap ada) */
      "#pqSvDock #pqRkTools button{font-size:0}#pqSvDock #pqRkTools button i{font-size:14px}",
      "#pqSvDock #pqRkTools,#pqSvDock #svAutoPlayGroup,#pqSvDock #pqSvView,#pqSvDock #svModeSwitch{flex-direction:row;align-items:center;gap:4px;padding-top:0;padding-bottom:0;margin-top:0;margin-bottom:0;box-shadow:none;border-top:0;border-right:0;border-bottom:0;border-radius:0;background:none;backdrop-filter:none;animation:none}",
      "#pqSvDock #pqRkTools{display:none}#pqSvDock #pqRkTools.show{display:flex}",
      "#pqSvDock #svAutoPlayGroup{display:none}#pqSvDock #svAutoPlayGroup.show{display:flex}",
      "#pqSvDock .pqrk-n{position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;border-radius:8px;background:var(--cyan,#22d3ee);color:#04121a;font:800 9.5px/16px var(--mono,system-ui);text-align:center;padding:0 4px;box-sizing:border-box;pointer-events:none}",
      "#pqSvDock #pqRkLaunch .pqrk-n{top:-5px;right:-5px}",
      /* ikon tombol alat selalu ⋮⋮ (modul Rekam mengganti jadi ✕ saat terbuka → membingungkan dengan tombol tutup Street View) */
      "#pqSvDock #pqRkLaunchIc:before{content:'\\f58d'!important}",
      /* label mode Live/Embed/Dual hanya di panel lebar */
      "#pqSvDock #pqSvView button{width:var(--pqd-b);padding:0}#pqSvDock #pqSvView button span{display:none}",
      "@container pqsv (min-width:1060px){#pqSvDock #pqSvView button:not(.pq-clean-btn):not(#pqSvMenuBtn){width:auto;padding:0 11px;font:800 10.5px var(--mono,monospace);letter-spacing:.3px}#pqSvDock #pqSvView button:not(.pq-clean-btn):not(#pqSvMenuBtn) span{display:inline}}",
      "#pqSvDock #pqSvView button.pq-sep,#pqSvDock #pqSvView button.pq-clean-btn{border-left:1px solid #ffffff26;border-radius:11px;margin-left:0}",
      /* titik status mode (pengganti label EMBED/LIVE di atas) */
      "#pqSvDock #pqSvView:after{content:'';position:absolute;left:4px;top:-1px;width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px #22c55e99;display:none}",
      "#pqSvDock #pqSvView[data-st=load]:after,#pqSvDock #pqSvView[data-st=warn]:after,#pqSvDock #pqSvView[data-st=err]:after{display:block}",
      "#pqSvDock #pqSvView[data-st=load]:after{background:#22d3ee;box-shadow:0 0 6px #22d3eeaa;animation:pqSvBlink 1s ease-in-out infinite}#pqSvDock #pqSvView[data-st=warn]:after{background:#fbbf24;box-shadow:0 0 6px #fbbf24aa}#pqSvDock #pqSvView[data-st=err]:after{background:#ef4444;box-shadow:0 0 6px #ef4444aa}",
      /* bilah navigasi (◀ judul ▶ ⇄ ↻) menjadi bagian dock */
      "#pqSvDock #pqSvBar{position:static!important;transform:none!important;left:auto!important;top:auto!important;display:flex;align-items:center;gap:4px;padding:0 0 0 8px;margin-left:2px;max-width:none;background:none;border:0;border-radius:0;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;flex:0 0 auto}",
      "#pqSvDock #pqSvBar .sb-t{min-width:96px;width:clamp(96px,30cqw,260px);padding:0 4px;cursor:pointer;border-radius:8px}",
      "#pqSvDock #pqSvBar .sb-t:hover b{color:#7dd3fc}",
      "#pqSvDock #pqSvBar .sb-t b{font-size:12.5px}#pqSvDock #pqSvBar .sb-t span{font-size:10.5px}",
      "#pqSvDock #pqSvBar select{height:var(--pqd-b);max-width:110px;border-radius:11px;padding:0 6px}",
      /* penanda "foto lama" melayang tepat di atas dock */
      "#svFrameWrap>#svHistoryActiveBadge{position:absolute;z-index:12;left:50%;transform:translateX(-50%);bottom:calc(var(--pqd-top) + 2px);margin:0;max-width:calc(100% - 20px);box-shadow:0 6px 18px #0009}",
      /* kartu-kartu lain tidak boleh menutup dock */
      "#svFrameWrap #svInfoPanel,#svFrameWrap #pqJeda,#svFrameWrap #pqDimHud,#svFrameWrap #svKeyBanner{bottom:calc(var(--pqd-top) + 2px)!important}",
      "#svFrameWrap #svHistoryPanel{top:12px}",
      "#svFrameWrap #pqRkPanel{right:10px;top:12px;bottom:calc(var(--pqd-top) + 2px);width:min(430px,calc(100% - 20px))}",
      "#svFrameWrap #pqSvMenu{z-index:14}",
      "#svFrameWrap #pqRkDock{display:none!important}",
      /* panel sempit / layar kecil */
      "@container pqsv (max-width:520px){#svFrameWrap{--pqd-b:34px}#pqSvDock{max-width:calc(100% - 10px)}#pqSvDock #pqSvBar .sb-t{width:clamp(88px,32cqw,200px)}}",
      "@media(max-width:639px){#svFrameWrap{--pqd-gap:20px}}",
      "@media(prefers-reduced-motion:reduce){#pqSvDock *{transition:none!important}}"
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ DOM */
  var dock = null, row = null, gClose = null, gTools = null, gMore = null, wasOpen = false, pending = 0;

  function mkDiv(cls) { var d = document.createElement("div"); d.className = cls; return d; }
  function build() {
    if (dock) return true;
    var wrap = $("svFrameWrap"); if (!wrap) return false;
    css();
    dock = document.createElement("div"); dock.id = "pqSvDock"; dock.setAttribute("role", "toolbar"); dock.setAttribute("aria-label", "Kontrol Street View");
    row = document.createElement("div"); row.id = "pqSvDockRow";
    gClose = mkDiv("pqd-g pqd-close"); gTools = mkDiv("pqd-g pqd-tools"); gMore = mkDiv("pqd-g pqd-more");
    row.appendChild(gClose); row.appendChild(gTools); row.appendChild(gMore);
    dock.appendChild(row); wrap.appendChild(dock);

    /* jangan biarkan sentuhan/geser/klik pada dock menggerakkan panorama di belakangnya */
    ["mousedown", "pointerdown", "touchstart", "dblclick", "contextmenu"].forEach(function (ev) { dock.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
    dock.addEventListener("click", function (e) { e.stopPropagation(); });
    /* roda mouse → geser mendatar */
    dock.addEventListener("wheel", function (e) {
      e.stopPropagation();
      if (row.scrollWidth <= row.clientWidth + 1) return;
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      row.scrollLeft += d; e.preventDefault();
    }, { passive: false });
    row.addEventListener("scroll", edges, { passive: true });
    if (window.ResizeObserver) { try { var ro = new ResizeObserver(edges); ro.observe(row); ro.observe(wrap); } catch (e) { } }
    return true;
  }

  function edges() {
    if (!dock || !row) return;
    var max = row.scrollWidth - row.clientWidth, x = row.scrollLeft;
    dock.classList.toggle("pqd-l", max > 2 && x > 2);
    dock.classList.toggle("pqd-r", max > 2 && x < max - 2);
  }

  function mv(el, parent, cls) {
    if (!el || !parent) return;
    if (cls) el.classList.add(cls);
    if (el.parentNode !== parent) parent.appendChild(el);
  }
  function adopt() {
    if (!build()) return;
    var wrap = $("svFrameWrap"), x;
    mv($("svClose"), gClose, "pqd-b");
    ["svMeasureBtn", "svHistoryBtn", "svInfoToggleBtn", "svExternalLink"].forEach(function (id, i) { var el = $(id); if (el) { el.style.order = i; mv(el, gTools, "pqd-b"); } });
    mv($("pqRkLaunch"), gMore, null);
    /* kontainer yang sudah berupa kelompok → langsung jadi anak dock */
    ["pqSvBar", "svAutoPlayGroup", "pqRkTools", "pqSvView", "svModeSwitch"].forEach(function (id) { x = $(id); if (x && x.parentNode !== row) row.appendChild(x); });
    x = $("svHistoryActiveBadge"); if (x && wrap && x.parentNode !== wrap) wrap.appendChild(x);
    /* tanpa modul Rekam, alat lain tetap tampil (tidak ada tombol ⋮⋮ untuk membukanya) */
    dock.classList.toggle("pqd-hub", !!$("pqRkLaunch"));
    Array.prototype.forEach.call(dock.querySelectorAll("button,a"), function (b) {
      if (!b.getAttribute("aria-label") && b.title) b.setAttribute("aria-label", b.title);
    });
    /* ⋮⋮ → "Alat" */
    var L = $("pqRkLaunch"); if (L && !L.__pqd) {
      L.__pqd = 1; L.title = "Tampilkan / sembunyikan alat (Rekam, tampilan, ukur, riwayat…)";
      L.addEventListener("click", function (e) { if (e.isTrusted) setTimeout(saveHub, 0); });   /* hanya klik pengguna yang diingat */
    }
    edges();
  }

  var restoring = 0;
  function hubOn() { var w = $("svFrameWrap"); return !!(w && w.classList.contains("pq-hub-on")); }
  document.addEventListener("keydown", function (e) {   /* Esc menutup alat (ditangani modul Rekam) → ingat pilihannya */
    if (e.key !== "Escape" || !open_() || !hubOn()) return;
    setTimeout(function () { if (!hubOn()) saveHub(); }, 60);
  });
  function saveHub() { if (restoring) return; ss(KEY, hubOn() ? "1" : "0"); if (hubOn()) setTimeout(toEnd, 60); }
  function toEnd() { if (row && row.scrollWidth > row.clientWidth) { try { row.scrollTo({ left: row.scrollWidth, behavior: "smooth" }); } catch (e) { row.scrollLeft = row.scrollWidth; } } }
  /* saat Street View dibuka: pulihkan keadaan alat. Belum pernah dipilih → terbuka di panel lebar, tertutup di panel sempit */
  function restoreHub() {
    var L = $("pqRkLaunch"), w = $("svFrameWrap"); if (!L || !w) return false;
    var pref = ls(KEY, null), want = pref == null ? w.clientWidth >= 720 : pref === "1";
    if (want !== hubOn()) { restoring = 1; L.click(); setTimeout(function () { restoring = 0; }, 400); }
    return true;
  }

  /* CSS gating: alat tambahan hanya tampil bila hub terbuka (hanya saat tombol ⋮⋮ ada) */
  (function () {
    var st = document.createElement("style"); st.id = "pqSvDockGate";
    st.textContent = "#svFrameWrap:not(.pq-hub-on) #pqSvDock.pqd-hub :is(#pqSvView,#svModeSwitch,.pqd-tools){display:none!important}#svFrameWrap:not(.pq-hub-on) #pqSvMenu{display:none!important}";
    (document.head || document.documentElement).appendChild(st);
  })();

  function tick() {
    adopt();
    if (!window.PQSvView && document.body) document.body.classList.toggle("pq-clean", ls("pq_sv_clean2", "1") === "1");   /* Mode Ringan: svview tidak ada → bersihkan layar tetap aktif */
    var o = open_();
    if (o && !wasOpen) { wasOpen = true; pending = 14; try { row.scrollLeft = 0; } catch (e) { } }
    else if (!o && wasOpen) { wasOpen = false; pending = 0; }
    if (o && pending > 0) { pending--; if (restoreHub()) pending = 0; }   /* modul Rekam membangun tombolnya sedikit terlambat → coba lagi */
    if (dock) dock.style.display = o ? "" : "none";
  }
  setInterval(function () { try { tick(); } catch (e) { } }, 350);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { try { adopt(); } catch (e) { } });
  else { try { adopt(); } catch (e) { } }

  window.PQSvDock = { adopt: adopt, el: function () { return dock; } };
})();
