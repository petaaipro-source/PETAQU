/* PETAQU — Folder melayang tunggal.
   Menyatukan semua tombol kecil yang tadinya berserakan menjadi SATU tombol folder:
     • Lapisan jalan : Jalan Nasional, Patok KM, Kabupaten, Tol & Provinsi   (tombol aslinya disembunyikan, logikanya tetap dipakai)
     • Tampilan      : Transparansi area luar Jawa Tengah (◐)
     • Alat PETAQU   : semua item yang didaftarkan lewat PQ_DOCK (Peta offline, Apex, Cortex, dst.)
   Tidak ada logika lama yang diubah: folder hanya meneruskan klik ke tombol aslinya, sehingga
   fitur baru yang mendaftar ke PQ_DOCK otomatis muncul di sini. */
(function () {
  "use strict";
  if (window.__pqFolder) return;
  window.__pqFolder = 1;

  var $ = function (id) { return document.getElementById(id); };
  var LAY = [
    ["jnBtn", "Jalan Nasional", "\uf018", "#22d3ee", "jnPanel"],
    ["pkBtn", "Patok KM", "\uf277", "#34d399", "pkPanel"],
    ["kbBtn", "Kabupaten", "\uf279", "#c084fc", "kbPanel"],
    ["tlBtn", "Tol & Jalan Provinsi", "\uf1b9", "#f59e0b", "tlPanel"]
  ];

  var CSS = [
    /* tombol lama disembunyikan; tetap ada di DOM supaya logikanya jalan */
    "html body #jnBtn,html body #pkBtn,html body #kbBtn,html body #pqDock,html body #jtFloat .jt-fb{display:none!important}",
    /* posisi folder mengikuti sidebar (sama seperti tombol lapisan sebelumnya) */
    ":root{--pq-fl:10px;--pq-ft:66px}",
    "@media(min-width:861px){:root{--pq-fl:364px;--pq-ft:70px}body.sidebar-collapsed,body.full-map-mode{--pq-fl:34px}}",
    ".pq-fi{font-family:'Font Awesome 6 Free';font-weight:900;font-style:normal;line-height:1;display:block}",
    "#pqFolder{position:fixed;left:var(--pq-fl);top:var(--pq-ft);z-index:1250;width:44px;height:44px;padding:0;border-radius:50%;border:1.5px solid #22d3ee;background:#0a0e17ee;color:#22d3ee;box-shadow:0 4px 14px #0006,0 0 10px -2px #22d3ee;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:left .25s ease,transform .15s,background .15s,color .15s}",
    "#pqFolder:hover{transform:translateY(-1px) scale(1.06)}#pqFolder:active{transform:scale(.94)}",
    "#pqFolder.open{background:#0e7490;color:#fff}",
    "#pqFolder .pq-fi{font-size:18px}",
    "#pqFolder b{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;background:#34d399;color:#04121a;border:2px solid #0a0e17;font:800 10px/14px system-ui,sans-serif;text-align:center}",
    "#pqFolder b:empty{display:none}",
    "#pqFolderCard{position:fixed;left:var(--pq-fl);top:calc(var(--pq-ft) + 52px);z-index:1260;width:min(300px,calc(100vw - 20px));max-height:calc(100dvh - var(--pq-ft) - 70px);overflow:auto;overscroll-behavior:contain;display:none;box-sizing:border-box;padding:4px 6px 8px;border-radius:14px;border:1px solid rgba(148,178,204,.25);background:#0a0e17f5;color:#dbe7f3;font:13px/1.4 system-ui,sans-serif;box-shadow:0 14px 40px #0008;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);transition:left .25s ease}",
    "#pqFolderCard.open{display:block}",
    ".pqf-h{font:700 10px/1 system-ui,sans-serif;letter-spacing:.8px;text-transform:uppercase;color:#8fa6bd;padding:11px 10px 5px}",
    ".pqf-row{display:flex;align-items:center;gap:11px;width:100%;padding:7px 10px;border:0;border-radius:10px;background:transparent;color:inherit;font:600 12.5px/1.25 system-ui,sans-serif;cursor:pointer;text-align:left}",
    ".pqf-row:hover,.pqf-row:focus-visible{background:#22d3ee17;outline:0}",
    ".pqf-row.pqf-danger{margin-bottom:2px;border:1px solid #f8717144;background:#f871710d}.pqf-row.pqf-danger:hover,.pqf-row.pqf-danger:focus-visible{background:#f8717126}",
    ".pqf-ic{width:30px;height:30px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--c,#22d3ee);color:var(--c,#22d3ee);background:#0f1726;font-size:13px}",
    ".pqf-ic .pq-fi,.pqf-ic i{font-size:13px}",
    ".pqf-t{flex:1;min-width:0}",
    ".pqf-st{flex:none;font:800 9px/1 system-ui,sans-serif;letter-spacing:.6px;padding:3px 6px;border-radius:8px;background:rgba(52,211,153,.18);color:#6ee7b7}",
    ".pqf-st.off{background:#334155aa;color:#94a3b8}",
    /* grup tema yang bisa dilipat */
    ".pqf-g{margin:3px 0}",
    ".pqf-gh{display:flex;align-items:center;gap:9px;width:100%;padding:8px 9px;border:0;border-radius:10px;background:#ffffff08;color:#9fb3c8;font:700 10.5px/1 system-ui,sans-serif;letter-spacing:.8px;text-transform:uppercase;cursor:pointer;text-align:left}",
    ".pqf-gh:hover,.pqf-gh:focus-visible{background:#22d3ee14;color:#e2eefa;outline:0}",
    ".pqf-gi{width:22px;height:22px;flex:none;border-radius:7px;display:flex;align-items:center;justify-content:center;border:1px solid var(--c,#22d3ee);color:var(--c,#22d3ee);background:#0f1726}.pqf-gi .pq-fi{font-size:11px}",
    ".pqf-gt{flex:1;min-width:0}",
    ".pqf-gc{flex:none;font:800 9px/1 system-ui,sans-serif;letter-spacing:.4px;padding:3px 6px;border-radius:8px;background:#334155aa;color:#94a3b8}.pqf-gc.on{background:rgba(52,211,153,.18);color:#6ee7b7}",
    ".pqf-chev{flex:none;font-size:10px!important;transition:transform .2s;transform:rotate(-90deg)}.pqf-g.open .pqf-chev{transform:none}",
    ".pqf-b{display:none;padding:2px 0 4px 2px}.pqf-g.open .pqf-b{display:block}",
    ".pqf-tip{padding:7px 10px 2px;font:11px/1.35 system-ui,sans-serif;color:#7c8aa0}.pqf-tip b{color:#22d3ee;font-weight:700}",
    /* panel transparansi: muncul di bawah folder, bukan lagi di pojok kiri-bawah */
    "html body #jtFloat.open .jt-fp{position:fixed;left:var(--pq-fl);top:calc(var(--pq-ft) + 52px);width:min(270px,calc(100vw - 20px));max-width:none;max-height:calc(100dvh - var(--pq-ft) - 80px);z-index:1260;padding-right:30px;background:rgba(7,26,38,.94);border-color:#22d3ee44;transition:left .25s ease}",
    ".pqf-x{position:absolute;top:4px;right:6px;width:24px;height:24px;border:0;border-radius:50%;background:transparent;color:#8fa6bd;font-size:18px;line-height:1;cursor:pointer}.pqf-x:hover{color:#fff;background:#ffffff1a}",
    /* sembunyi bila ada modal / layar login / mode cuaca; samar saat sidebar HP terbuka */
    "body:has(.modal-overlay.show,#dashcam-modal:not(.hidden),#svOverlay.show,#arOverlay.show,#cmOverlay.show,#qrModal.show,#lightbox.show,#svmSketch2DModal.show,#loginScreen:not(.hide),#welcomeSplash:not(.hide)) :is(#pqFolder,#pqFolderCard){display:none!important}",
    "body.wx-on #pqFolder,body.wx-on #pqFolderCard{display:none!important}",
    "@media(max-width:860px){body:has(#sidebar.open) #pqFolder,body:has(#sidebar.open) #pqFolderCard{opacity:0!important;pointer-events:none!important;visibility:hidden}}"
  ].join("\n");

  var btn, card, isOpen = false, sig = "", items = [];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function dockItems() {
    var d = $("pqDock");
    var n = d && d.children[1];
    return n ? Array.prototype.filter.call(n.children, function (a) { return a.tagName === "BUTTON" && a.id !== "pqkBtn" && a.id !== "pqgBtn" && !/KA On\/Off|^\s*Kereta Api\s*$|Rute Pesawat/i.test(((a.children[1] ? a.children[1].textContent : a.textContent) || "")); }) : [];
  }

  function jtParts() {
    return { fb: document.querySelector("#jtFloat .jt-fb"), chk: document.querySelector("#jtFloat .jt-on"), box: $("jtFloat") };
  }

  function set(v) {
    isOpen = !!v;
    card.classList.toggle("open", isOpen);
    btn.classList.toggle("open", isOpen);
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    btn.firstChild.textContent = isOpen ? "\uf07c" : "\uf07b";
    if (isOpen) { render(true); }
  }

  function closePanels(exceptId) {
    LAY.forEach(function (l) {
      if (l[4] === exceptId) return;
      var p = $(l[4]);
      if (p && p.classList.contains("open")) p.classList.remove("open");
    });
  }

  function closeJt() {
    var j = jtParts();
    if (j.box && j.box.classList.contains("open") && j.fb) j.fb.click();
  }

  /* ---------- model: semua lapisan/alat dikelompokkan per tema ---------- */
  var OPEN_KEY = "pqf_open_v1";
  function gOpen() { try { var o = JSON.parse(localStorage.getItem(OPEN_KEY) || "null"); if (o && typeof o === "object") return o; } catch (e) { } return { jalan: 1 }; }
  function gSave(o) { try { localStorage.setItem(OPEN_KEY, JSON.stringify(o)); } catch (e) { } }
  function fi(g) { return '<i class="pq-fi">' + g + "</i>"; }

  function model() {
    var G = [], g;
    function grp(id, t, icon, c) { g = { id: id, t: t, icon: icon, c: c, rows: [] }; G.push(g); return g; }
    function add(k, name, ic, c, on, label) { g.rows.push({ k: k, name: name, ic: ic, c: c, on: on == null ? null : !!on, label: label }); }

    grp("jalan", "Lapisan Jalan", "\uf018", "#22d3ee");
    LAY.forEach(function (l) { var b = $(l[0]); if (b) add("L:" + l[0], l[1], fi(l[2]), l[3], !b.classList.contains("off")); });

    grp("tampil", "Tampilan Peta", "\uf1de", "#a78bfa");
    var j = jtParts();
    if (j.fb) add("T", "Transparansi wilayah (pilih)", "\u25D0", "#22d3ee", !!(j.chk && j.chk.checked));
    if (window.PETAQU_BLOK) { var BK = 0; try { BK = PETAQU_BLOK.count(); } catch (e) { } add("B", "Blok warna wilayah", "\u25A8", "#f59e0b", BK > 0, BK ? BK + " ON" : "OFF"); }

    var W = [];
    try { if (window.PETAQU_CUACA && PETAQU_CUACA.rows) W = PETAQU_CUACA.rows(); } catch (e) { W = []; }
    try { if (window.PETAQU_KLIMAT && PETAQU_KLIMAT.rows) W = W.concat(PETAQU_KLIMAT.rows()); } catch (e) { }
    grp("cuaca", "Cuaca & Iklim", "\uf743", "#38bdf8");
    W.forEach(function (x) { add("W:" + x.id, x.name, fi(x.ic), x.c, x.on); });

    var Z = [];
    try { if (window.PETAQU_RAWAN && PETAQU_RAWAN.rows) Z = PETAQU_RAWAN.rows(); } catch (e) { Z = []; }
    try { if (window.PETAQU_GEMPA && PETAQU_GEMPA.rows) Z = Z.concat(PETAQU_GEMPA.rows()); } catch (e) { }
        grp("rawan", "Rawan Bencana", "\uf071", "#f87171");
    Z.forEach(function (x) { add("Z:" + x.id, x.name, fi(x.ic), x.c, x.on); });

    var T = [];
    try { if (window.PETAQU_KERETA && PETAQU_KERETA.rows) T = T.concat(PETAQU_KERETA.rows().map(function (x) { x.p = "KA"; return x; })); } catch (e) { }
    try { if (window.PETAQU_PESAWAT && PETAQU_PESAWAT.rows) T = T.concat(PETAQU_PESAWAT.rows().map(function (x) { x.p = "PW"; return x; })); } catch (e) { }
    try { if (window.PETAQU_FLIGHT && PETAQU_FLIGHT.rows) T = T.concat(PETAQU_FLIGHT.rows().map(function (x) { x.p = "FL"; return x; })); } catch (e) { }
    grp("transport", "Kereta Api & Pesawat", "\uf238", "#f59e0b");
    T.forEach(function (x) { add("K:" + x.p + ":" + x.id, x.name, fi(x.ic), x.c, x.on); });

    var N = []; try { if (window.PETAQU_DRAINASE && PETAQU_DRAINASE.rows) N = PETAQU_DRAINASE.rows(); } catch (e) { }
    grp("drainase", "Drainase", "\uf043", "#2dd4bf");
    N.forEach(function (x) { add("N:" + x.id, x.name, fi(x.ic), x.c, x.on); });

    try {
      (window.PQ_FOLDER_EXTRA || []).forEach(function (sec, si) {
        var r = sec.rows(); if (!r.length) return;
        grp("x" + si, sec.t || sec.title, "\uf5fd", "#c084fc");
        r.forEach(function (x) { add("X:" + si + ":" + x.id, x.name, x.ic, x.c, x.on); });
      });
    } catch (e) { }

    items = dockItems();
    grp("alat", "Alat PETAQU", "\uf552", "#fbbf24");
    items.forEach(function (a, i) {
      add("D:" + i, (a.children[1] ? a.children[1].textContent : a.textContent).trim(), a.children[0] ? a.children[0].innerHTML : "", "#22d3ee", null);
    });
    return G.filter(function (x) { return x.rows.length; });
  }

  function render(force) {
    var G = model(), cnt = 0;
    G.forEach(function (g) { g.rows.forEach(function (x) { if (x.on === true) cnt++; }); });
    var badge = btn.querySelector("b"), txt = cnt ? String(cnt) : "";
    if (badge.textContent !== txt) badge.textContent = txt;

    var s = JSON.stringify(G.map(function (g) { return [g.id, g.t, g.rows.map(function (r) { return [r.k, r.name, r.on, r.label]; })]; }));
    if (s === sig && !force) return;
    sig = s;

    var op = gOpen();
    var h = '<button type="button" class="pqf-row pqf-danger" data-k="R" style="--c:#f87171" title="Kembalikan semua data ruas ke data asli impor Excel awal">' +
      '<span class="pqf-ic"><i class="pq-fi">\uf2ea</i></span><span class="pqf-t">Reset ke Data Asli</span></button>' +
      '<div class="pqf-tip"><b>Tips:</b> ketik nama lapisan di kolom cari (mis. <b>hujan</b>, <b>tol</b>, <b>gempa</b>) untuk menyalakannya langsung.</div>';
    G.forEach(function (g) {
      var on = g.rows.filter(function (r) { return r.on === true; }).length, o = !!op[g.id];
      h += '<div class="pqf-g' + (o ? " open" : "") + '" data-g="' + g.id + '">' +
        '<button type="button" class="pqf-gh" aria-expanded="' + o + '" style="--c:' + g.c + '">' +
        '<span class="pqf-gi"><i class="pq-fi">' + g.icon + '</i></span><span class="pqf-gt">' + esc(g.t) + '</span>' +
        '<span class="pqf-gc' + (on ? " on" : "") + '">' + (on ? on + " aktif" : g.rows.length) + '</span><i class="pq-fi pqf-chev">\uf078</i></button><div class="pqf-b">';
      g.rows.forEach(function (x) {
        h += '<button type="button" class="pqf-row" data-k="' + esc(x.k) + '" style="--c:' + x.c + '">' +
          '<span class="pqf-ic">' + x.ic + '</span><span class="pqf-t">' + esc(x.name) + "</span>" +
          (x.on == null ? "" : '<span class="pqf-st' + (x.on ? "" : " off") + '">' + (x.label || (x.on ? "ON" : "OFF")) + "</span>") + "</button>";
      });
      h += "</div></div>";
    });
    var top = card.scrollTop;
    card.innerHTML = h || '<div class="pqf-h">Belum ada item</div>';
    card.scrollTop = top;
  }

  function toggleGroup(gEl) {
    var o = gEl.classList.toggle("open"), id = gEl.getAttribute("data-g"), op = gOpen();
    op[id] = o ? 1 : 0; gSave(op);
    var hb = gEl.querySelector(".pqf-gh"); if (hb) hb.setAttribute("aria-expanded", o ? "true" : "false");
  }

  function activate(k) {
    if (k === "R") {
      closePanels(); closeJt();
      try { if (typeof resetToOriginal === "function") resetToOriginal(); } catch (e) { }
    } else if (k.charAt(0) === "L") {
      var id = k.slice(2), meta = LAY.filter(function (l) { return l[0] === id; })[0];
      closePanels(meta && meta[4]); closeJt();
      var b = $(id); if (b) b.click();
    } else if (k.charAt(0) === "W") {
      closePanels(); closeJt();
      var wid = k.slice(2);
      try { if (wid === "angin" || wid === "awan" || wid === "enso") PETAQU_KLIMAT.act(wid); else PETAQU_CUACA.act(wid); } catch (e) { }
    } else if (k.charAt(0) === "Z") {
      closePanels(); closeJt();
      var zid = k.slice(2);
      try { if (zid === "penerbangan") PETAQU_FLIGHT.act(); else if (zid === "gempatsunami") PETAQU_GEMPA.act(); else PETAQU_RAWAN.act(zid); } catch (e) { }
    } else if (k.charAt(0) === "K") {
      closePanels(); closeJt();
      var kp = k.split(":");
      try { if (kp[1] === "KA") PETAQU_KERETA.act(kp[2]); else if (kp[1] === "PW") PETAQU_PESAWAT.act(kp[2]); else PETAQU_FLIGHT.act(); } catch (e) { }
    } else if (k.charAt(0) === "N") {
      closePanels(); closeJt();
      try { PETAQU_DRAINASE.act(k.slice(2)); } catch (e) { }
    } else if (k.charAt(0) === "X") {
      var pr = k.split(":"), sx = (window.PQ_FOLDER_EXTRA || [])[+pr[1]];
      closePanels(); closeJt();
      try { if (sx) sx.act(pr.slice(2).join(":")); } catch (e) { }
    } else if (k === "B") {
      closePanels();
      try { PETAQU_BLOK.open(); } catch (e) { }
    } else if (k === "T") {
      closePanels();
      var j = jtParts(); if (j.fb) j.fb.click();
    } else if (k.charAt(0) === "D") {
      closePanels(); closeJt();
      var a = items[+k.slice(2)]; if (a) a.click();
    }
    setTimeout(function () { render(); }, 60);
  }

  function onRow(e) {
    var gh = e.target.closest(".pqf-gh");
    if (gh) { toggleGroup(gh.parentNode); return; }
    var r = e.target.closest(".pqf-row");
    if (!r) return;
    set(false);
    activate(r.getAttribute("data-k") || "");
  }

  /* API untuk mesin pencari (petaqu-cari.js): daftar semua lapisan + alat, dan jalankan satu item */
  window.PQ_FOLDER = {
    entries: function () {
      var out = [];
      try { model().forEach(function (g) { g.rows.forEach(function (r) { if (r.k !== "R") out.push({ k: r.k, name: r.name, group: g.t, gid: g.id, c: r.c, on: r.on }); }); }); } catch (e) { }
      return out;
    },
    go: function (k) { if (card) set(false); activate(k); },
    open: function (gid) {
      if (!card) return;
      if (gid) { var op = gOpen(); op[gid] = 1; gSave(op); }
      set(true);
    }
  };

  function addCloseToJt() {
    var fp = document.querySelector("#jtFloat .jt-fp");
    if (!fp || fp.querySelector(".pqf-x")) return;
    var x = document.createElement("button");
    x.type = "button";
    x.className = "pqf-x";
    x.setAttribute("aria-label", "Tutup");
    x.textContent = "\u00D7";
    x.onclick = function (e) { e.stopPropagation(); closeJt(); };
    fp.appendChild(x);
  }

  function build() {
    if (btn) return;
    var st = document.createElement("style");
    st.id = "pqFolderCss";
    st.textContent = CSS;
    document.head.appendChild(st);

    btn = document.createElement("button");
    btn.id = "pqFolder";
    btn.type = "button";
    btn.title = "Menu PETAQU — lapisan, tampilan & alat";
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = '<i class="pq-fi">\uf07b</i><b></b>';

    card = document.createElement("div");
    card.id = "pqFolderCard";
    card.setAttribute("role", "menu");
    document.body.appendChild(btn);
    document.body.appendChild(card);

    btn.onclick = function (e) { e.stopPropagation(); set(!isOpen); };
    card.onclick = onRow;
    document.addEventListener("click", function (e) {
      if (isOpen && !card.contains(e.target) && !btn.contains(e.target)) set(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen) { set(false); btn.focus(); }
    });

    render(true);
    /* modul lain mendaftar belakangan (PQ_DOCK, peta Leaflet): pantau perubahan secara ringan */
    setInterval(function () { render(); addCloseToJt(); }, 700);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
