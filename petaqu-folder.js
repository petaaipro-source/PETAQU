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
    ["jbBtn", "Jembatan per Kabupaten", "\ue4c8", "#f472b6", "jbPanel"],
    ["tlBtn", "Tol & Jalan Provinsi", "\uf1b9", "#f59e0b", "tlPanel"]
  ];

  var CSS = [
    /* tombol lama disembunyikan; tetap ada di DOM supaya logikanya jalan */
    "html body #jnBtn,html body #pkBtn,html body #kbBtn,html body #jbBtn,html body #pqDock,html body #jtFloat .jt-fb{display:none!important}",
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
    ".pqf-ic{width:30px;height:30px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--c,#22d3ee);color:var(--c,#22d3ee);background:#0f1726;font-size:13px}",
    ".pqf-ic .pq-fi,.pqf-ic i{font-size:13px}",
    ".pqf-t{flex:1;min-width:0}",
    ".pqf-st{flex:none;font:800 9px/1 system-ui,sans-serif;letter-spacing:.6px;padding:3px 6px;border-radius:8px;background:rgba(52,211,153,.18);color:#6ee7b7}",
    ".pqf-st.off{background:#334155aa;color:#94a3b8}",
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
    return n ? Array.prototype.filter.call(n.children, function (a) { return a.tagName === "BUTTON"; }) : [];
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

  function render(force) {
    var L = [];
    LAY.forEach(function (l) {
      var b = $(l[0]);
      if (b) L.push({ id: l[0], name: l[1], ic: l[2], c: l[3], on: !b.classList.contains("off") });
    });
    var j = jtParts();
    var T = j.fb ? { on: !!(j.chk && j.chk.checked) } : null;
    items = dockItems();
    var D = items.map(function (a) {
      return {
        ic: a.children[0] ? a.children[0].innerHTML : "",
        t: (a.children[1] ? a.children[1].textContent : a.textContent).trim()
      };
    });

    var cnt = L.filter(function (x) { return x.on; }).length;
    var badge = btn.querySelector("b");
    var txt = cnt ? String(cnt) : "";
    if (badge.textContent !== txt) badge.textContent = txt;

    var s = JSON.stringify([L, T, D.map(function (d) { return d.t; })]);
    if (s === sig && !force) return;
    sig = s;

    var h = "";
    if (L.length) {
      h += '<div class="pqf-h">Lapisan jalan</div>';
      L.forEach(function (x) {
        h += '<button type="button" class="pqf-row" data-k="L:' + x.id + '" style="--c:' + x.c + '">' +
          '<span class="pqf-ic"><i class="pq-fi">' + x.ic + "</i></span>" +
          '<span class="pqf-t">' + esc(x.name) + "</span>" +
          '<span class="pqf-st' + (x.on ? "" : " off") + '">' + (x.on ? "ON" : "OFF") + "</span></button>";
      });
    }
    if (T) {
      h += '<div class="pqf-h">Tampilan</div>' +
        '<button type="button" class="pqf-row" data-k="T" style="--c:#22d3ee">' +
        '<span class="pqf-ic">\u25D0</span><span class="pqf-t">Transparansi luar Jawa Tengah</span>' +
        '<span class="pqf-st' + (T.on ? "" : " off") + '">' + (T.on ? "ON" : "OFF") + "</span></button>";
    }
    if (D.length) {
      h += '<div class="pqf-h">Alat PETAQU</div>';
      D.forEach(function (d, i) {
        h += '<button type="button" class="pqf-row" data-k="D:' + i + '" style="--c:#22d3ee">' +
          '<span class="pqf-ic">' + d.ic + '</span><span class="pqf-t">' + esc(d.t) + "</span></button>";
      });
    }
    card.innerHTML = h || '<div class="pqf-h">Belum ada item</div>';
  }

  function onRow(e) {
    var r = e.target.closest(".pqf-row");
    if (!r) return;
    var k = r.getAttribute("data-k") || "";
    set(false);
    if (k.charAt(0) === "L") {
      var id = k.slice(2), meta = LAY.filter(function (l) { return l[0] === id; })[0];
      closePanels(meta && meta[4]);
      closeJt();
      var b = $(id);
      if (b) b.click();
    } else if (k === "T") {
      closePanels();
      var j = jtParts();
      if (j.fb) j.fb.click();
    } else if (k.charAt(0) === "D") {
      closePanels();
      closeJt();
      var a = items[+k.slice(2)];
      if (a) a.click();
    }
    setTimeout(function () { render(); }, 60);
  }

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
