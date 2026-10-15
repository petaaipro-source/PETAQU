/* PETAQU — Tombol MODE RINGAN / MODE PENUH
   • Ringan : hanya fitur jalan & jembatan (peta ruas, jembatan, STA/KM, cari, legenda, data Excel, bagikan).
              Modul berat tidak diunduh & tidak dijalankan → cepat, hemat data, memori & baterai.
   • Penuh  : semua fitur.
   Penentuan modul dilakukan lebih awal oleh <script id="pqModeBoot"> di index.html (window.PQ).
   File ini hanya antarmuka: saklar di header + di layar login, kartu konfirmasi, dan pemanasan cache offline (Penuh). */
(function () {
  "use strict";
  var PQ = window.PQ;
  if (!PQ) return;

  var INFO = {
    ringan: {
      nama: "Ringan",
      judul: "Beralih ke Mode Ringan?",
      ringkas: "Hanya jalan & jembatan",
      ada: ["Peta Jalan Nasional, Tol & Provinsi", "Jembatan, STA & KM, edit di peta", "Pencarian, legenda, impor/ekspor Excel", "Bagikan peta (HTML/PDF), animasi rute"],
      tidak: "Cuaca, bencana, penerbangan, Street View, ukur otomatis, drone, paket, analitik & AI tidak dimuat.",
      untung: "Lebih cepat dibuka, hemat kuota, memori & baterai. Layer tambahan dimatikan."
    },
    penuh: {
      nama: "Penuh",
      judul: "Beralih ke Mode Penuh?",
      ringkas: "Semua fitur",
      ada: ["Semua fitur Mode Ringan", "Cuaca, gempa, bencana, karhutla, drainase", "Street View, ukur jeda otomatis, drone, scan kerusakan", "Paket & Kurva S, analitik, rute pesawat, wilayah"],
      tidak: "Memuat ±40 modul tambahan sehingga butuh data, memori & baterai lebih besar.",
      untung: "Cocok untuk laptop / jaringan lancar."
    }
  };

  var ICON = {
    ringan: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
    penuh: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/><path d="m3 17.5 9 5 9-5" opacity=".55"/></svg>'
  };

  var CSS = [
    ".pq-mode{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:999px;background:rgba(7,26,38,.78);border:1px solid rgba(34,211,238,.28);box-shadow:0 2px 10px rgba(0,0,0,.35);flex:none;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}",
    ".pq-mode button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 11px;border-radius:999px;font:700 11.5px/1 var(--mono,ui-monospace,monospace);letter-spacing:.2px;color:#8fa6bd;cursor:pointer;transition:background .18s,color .18s,box-shadow .18s;white-space:nowrap;-webkit-tap-highlight-color:transparent}",
    ".pq-mode button:hover{color:#e6f1fb}",
    ".pq-mode button:focus-visible{outline:2px solid #22d3ee;outline-offset:1px}",
    ".pq-mode button[aria-checked=true]{color:#04121a;cursor:default}",
    ".pq-mode button[data-m=ringan][aria-checked=true]{background:linear-gradient(135deg,#34d399,#22d3ee);box-shadow:0 0 12px rgba(52,211,153,.45)}",
    ".pq-mode button[data-m=penuh][aria-checked=true]{background:linear-gradient(135deg,#22d3ee,#60a5fa);box-shadow:0 0 12px rgba(34,211,238,.45)}",
    "#pqModeHdr{margin:0 10px 0 14px}",
    "#headerStats+#pqModeHdr,#pqModeHdr{order:0}",
    "@media(max-width:640px){#pqModeHdr{margin:0 6px 0 auto}#pqModeHdr button{padding:0 9px;height:30px}#pqModeHdr button[aria-checked=false] span{display:none}}",
    "@media(max-width:560px){#headerStats{display:none!important}#brand{min-width:0;gap:8px}#pqModeHdr{margin:0 8px 0 auto}}",
    "@media(max-width:420px){#brand h1{display:none}}",
    "@media(max-width:560px){#pqModeHdr button[aria-checked=false] span{display:none}#pqModeHdr button{padding:0 10px}}",
    "#pqModeLogin{position:fixed;left:0;right:0;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:5;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}",
    "#pqModeLogin>*{pointer-events:auto}",
    "#pqModeLogin small{font:500 11px/1.3 system-ui,sans-serif;color:#8fa6bd;text-align:center;padding:0 16px}",
    "@media(max-height:640px){#pqModeLogin{position:static;margin:10px 0 14px}}",
    "#pqModeDlg{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(2,8,14,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}",
    "#pqModeDlg.on{display:flex}",
    "#pqModeDlg .pqm-card{width:min(420px,100%);max-height:calc(100dvh - 32px);overflow:auto;border-radius:18px;padding:20px 20px 16px;background:linear-gradient(180deg,#0d2230,#081520);border:1px solid rgba(34,211,238,.35);box-shadow:0 20px 60px rgba(0,0,0,.6);color:#e6f1fb;font-family:system-ui,sans-serif;animation:pqmIn .18s ease-out}",
    "@keyframes pqmIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}",
    "@media(prefers-reduced-motion:reduce){#pqModeDlg .pqm-card{animation:none}.pq-mode button{transition:none}}",
    "#pqModeDlg h3{margin:0 0 4px;font:800 17px/1.25 var(--display,system-ui,sans-serif);display:flex;align-items:center;gap:8px}",
    "#pqModeDlg .pqm-sub{margin:0 0 12px;font-size:12.5px;color:#8fa6bd}",
    "#pqModeDlg ul{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:6px}",
    "#pqModeDlg li{position:relative;padding-left:20px;font-size:13px;line-height:1.35}",
    "#pqModeDlg li:before{content:'';position:absolute;left:3px;top:.38em;width:9px;height:5px;border-left:2px solid #34d399;border-bottom:2px solid #34d399;transform:rotate(-45deg)}",
    "#pqModeDlg .pqm-note{margin:0 0 8px;padding:9px 11px;border-radius:10px;background:rgba(255,255,255,.04);font-size:12px;line-height:1.4;color:#c4d4e4}",
    "#pqModeDlg .pqm-note b{color:#e6f1fb}",
    "#pqModeDlg .pqm-warn{font-size:11.5px;color:#f5c26b;margin:0 0 14px}",
    "#pqModeDlg .pqm-act{display:flex;gap:8px;justify-content:flex-end}",
    "#pqModeDlg .pqm-act button{all:unset;box-sizing:border-box;cursor:pointer;padding:10px 16px;border-radius:11px;font:700 13px/1 system-ui,sans-serif;-webkit-tap-highlight-color:transparent}",
    "#pqModeDlg .pqm-act button:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}",
    "#pqModeDlg .pqm-no{background:rgba(255,255,255,.07);color:#c4d4e4}",
    "#pqModeDlg .pqm-ok{background:linear-gradient(135deg,#22d3ee,#3b82f6);color:#04121a}"
  ].join("\n");

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  function makeSwitch(id, confirmSwitch) {
    var w = el("div", { "class": "pq-mode", role: "radiogroup", "aria-label": "Mode tampilan PETAQU", id: id });
    ["ringan", "penuh"].forEach(function (m) {
      var b = el("button", {
        type: "button", role: "radio", "data-m": m,
        "aria-checked": String(PQ.mode === m),
        title: m === "ringan"
          ? "Mode Ringan — hanya fitur jalan & jembatan (cepat, hemat kuota & baterai)"
          : "Mode Penuh — semua fitur"
      }, ICON[m] + "<span>" + INFO[m].nama + "</span>");
      b.addEventListener("click", function () {
        if (PQ.mode === m) { if (PQ.auto) PQ.set(m); return; }
        confirmSwitch ? openDlg(m) : PQ.set(m);
      });
      w.appendChild(b);
    });
    return w;
  }

  var dlg, pending;
  function openDlg(m) {
    pending = m;
    var I = INFO[m];
    dlg.querySelector(".pqm-body").innerHTML =
      "<h3>" + ICON[m] + " " + I.judul + "</h3>" +
      '<p class="pqm-sub">' + I.ringkas + "</p>" +
      "<ul>" + I.ada.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" +
      '<p class="pqm-note"><b>Catatan:</b> ' + I.tidak + "<br>" + I.untung + "</p>" +
      '<p class="pqm-warn">Halaman dimuat ulang. Data di perangkat tetap aman; ekspor dulu pekerjaan yang belum disimpan.</p>';
    dlg.querySelector(".pqm-ok").textContent = "Beralih & Muat Ulang";
    dlg.classList.add("on");
    setTimeout(function () { dlg.querySelector(".pqm-ok").focus(); }, 30);
  }
  function closeDlg() { dlg.classList.remove("on"); pending = null; }

  function buildDlg() {
    dlg = el("div", { id: "pqModeDlg", role: "dialog", "aria-modal": "true", "aria-label": "Ganti mode tampilan" },
      '<div class="pqm-card"><div class="pqm-body"></div><div class="pqm-act"><button type="button" class="pqm-no">Batal</button><button type="button" class="pqm-ok"></button></div></div>');
    dlg.addEventListener("click", function (e) { if (e.target === dlg) closeDlg(); });
    dlg.querySelector(".pqm-no").addEventListener("click", closeDlg);
    dlg.querySelector(".pqm-ok").addEventListener("click", function () { var m = pending; closeDlg(); if (m) PQ.set(m); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && dlg.classList.contains("on")) closeDlg(); });
    document.body.appendChild(dlg);
  }

  function mount() {
    if (document.getElementById("pqModeCss")) return;
    var st = el("style", { id: "pqModeCss" }); st.textContent = CSS; document.head.appendChild(st);
    buildDlg();

    // 1) header aplikasi (sebelum tombol Instal)
    var inst = document.getElementById("installBtn");
    if (inst && inst.parentNode) inst.parentNode.insertBefore(makeSwitch("pqModeHdr", true), inst);

    // 2) layar login (tanpa konfirmasi: belum ada pekerjaan yang bisa hilang)
    var ls = document.getElementById("loginScreen");
    if (ls) {
      var box = el("div", { id: "pqModeLogin" });
      box.appendChild(makeSwitch("pqModeLoginSw", false));
      box.appendChild(el("small", null, PQ.ringan
        ? "Mode Ringan: hanya fitur jalan &amp; jembatan — cepat &amp; hemat kuota."
        : "Mode Penuh: semua fitur."));
      ls.appendChild(box);
    }
    document.documentElement.setAttribute("data-pq-mode", PQ.mode);
  }

  // Penuh: hangatkan cache offline modul berat (di waktu senggang), Ringan: tidak mengunduh apa pun.
  function warm() {
    if (PQ.ringan || !navigator.serviceWorker) return;
    var go = function () { navigator.serviceWorker.ready.then(function (r) { r.active && r.active.postMessage({ type: "PRECACHE_FULL" }); }).catch(function () {}); };
    "requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 8000 }) : setTimeout(go, 6000);
  }

  function start() { mount(); warm(); }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();
