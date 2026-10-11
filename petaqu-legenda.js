/* PETAQU — Legenda ADAPTIF v4: ruas dikelompokkan PER KABUPATEN, tombol berupa ikon
   • Setiap kabupaten tampil sebagai satu grup (warna, jumlah ruas, km); klik untuk buka/tutup daftar ruasnya.
     Ikon di kepala grup: zoom ke seluruh ruas kabupaten & sembunyikan semua ruas kabupaten dari peta.
   • Ikon MATA di tiap ruas, tiap kabupaten, dan satu MATA UTAMA di toolbar: tampil/sembunyi. Ruas yang disembunyikan tetap
     terdaftar (redup) supaya bisa dihidupkan lagi. Shift/Ctrl+klik mata = tampilkan HANYA ruas/kabupaten itu (lainnya disembunyikan).
   • Baris ruas: klik = zoom ke ruas (ruas tersembunyi otomatis ditampilkan dulu). Pencarian (ruas / kabupaten) otomatis membuka grup yang cocok.
   • Semua tombol (mode warna, urutan, buka/tutup semua, warna otomatis, reset) berupa ikon SVG + tooltip — hemat ruang.
   • Mode "Per kabupaten": swatch kabupaten di kepala grup bisa diklik untuk ganti warna; mode IRI memakai legenda aslinya.
   • Bar komposisi Aspal / Rigid Beton / Belum ditandai (km) tetap ada; Jalan Nasional per kabupaten/provinsi tetap didaftar.
   • Tombol STA (ikon): tampilkan titik STA/KM HANYA untuk ruas yang aktif di peta & yang masuk layar; makin dekat makin rapat,
     dan saat zoom ≥ 16 label "STA • KM" tampil permanen. Dimatikan = kembali ke tampilan bawaan (semua titik). Pilihan diingat.
   • Ringan: pembaruan ditunda (debounce); posisi gulir & fokus kolom cari dipertahankan saat legenda diperbarui. */
(function () {
  "use strict";
  if (window.__pqLegenda) return;
  var W = window, T = 0, busy = false, LIM = 400;
  var S = { q: "", sort: "km", pick: null, open: {}, nasOpen: true, sta: false, staTxt: "" };
  try { S.sta = localStorage.getItem("pq_lg_sta") === "1"; } catch (e) {}
  var SORTS = { km: "Km terbesar dulu", az: "Nama A–Z", ord: "Urutan data" };

  /* ---------- ikon SVG (tanpa teks, ikut warna tombol) ---------- */
  var IC = {
    road: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16"/>',
    kab: '<path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    all: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    km: '<path d="M4 6h16M4 12h11M4 18h6"/>',
    az: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M14 9h5l-5 6h5"/>',
    ord: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    expand: '<path d="M7 9l5-5 5 5M7 15l5 5 5-5"/>',
    collapse: '<path d="M7 4l5 5 5-5M7 20l5-5 5 5"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.2-.8-1.6-.8-2.6 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4c0-4.4-4-7.8-9-7.8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    zoom: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    sta: '<circle cx="5" cy="13" r="1.7"/><circle cx="12" cy="13" r="1.7"/><circle cx="19" cy="13" r="1.7"/><path d="M6.7 13h3.6M13.7 13h3.6M5 7v3M12 5v5M19 7v3"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyepart: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="1.2"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3 3.5M6.5 7.5C4 9.2 3 12 3 12s4 6 9 6c1.2 0 2.3-.3 3.3-.7M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'
  };
  function ico(n, sz) { return '<svg class="pqlg-ic" width="' + (sz || 15) + '" height="' + (sz || 15) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[n] + '</svg>'; }
  function ibtn(attr, icon, title, cls) { return '<button type="button" class="pqlg-ib' + (cls ? " " + cls : "") + '" ' + attr + ' title="' + esc(title) + '" aria-label="' + esc(title) + '">' + ico(icon) + '</button>'; }

  var css = [
    "#legendContent{max-height:min(46vh,380px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#38bdf8aa transparent;padding-right:2px}",
    "@media(max-width:860px){#legendContent{max-height:min(34vh,260px)}}",
    "html body #legend{max-width:min(340px,calc(100vw - 28px))}",
    ".pqlg-head{position:sticky;top:0;z-index:2;background:#0f1521;padding-bottom:5px;margin-bottom:2px}",
    ".pqlg-sec{font:800 9.5px system-ui;letter-spacing:.7px;text-transform:uppercase;color:#7dd3fc;margin:2px 0 5px}",
    ".pqlg-top{display:flex;align-items:baseline;gap:6px;color:var(--text,#e6edf5);font:700 11.5px system-ui}",
    ".pqlg-top b{flex:1;min-width:0;white-space:nowrap}.pqlg-top span{color:#9fb6c3;font-weight:600}.pqlg-top em{font-style:normal;font:700 11px ui-monospace,monospace;color:#e6edf5}",
    ".pqlg-bar{display:flex;height:6px;border-radius:4px;overflow:hidden;background:#ffffff14;margin:5px 0 3px}.pqlg-bar s{display:block;height:100%}",
    /* toolbar ikon */
    ".pqlg-tb{display:flex;align-items:center;gap:4px;margin-top:5px;flex-wrap:wrap}",
    ".pqlg-seg{display:flex;flex:none;border:1px solid #2b3a52;border-radius:8px;overflow:hidden}.pqlg-seg .pqlg-ib{border:0;border-radius:0;border-right:1px solid #2b3a52}.pqlg-seg .pqlg-ib:last-child{border-right:0}",
    ".pqlg-ib{flex:none;display:inline-flex;align-items:center;justify-content:center;width:27px;height:25px;padding:0;border:1px solid #2b3a52;background:#0b1220;color:#9fb6c3;border-radius:7px;cursor:pointer}",
    ".pqlg-ib:hover{border-color:#38bdf8;color:#e6edf5}.pqlg-ib.on{background:#0e7490;color:#fff}.pqlg-ib:disabled{opacity:.4;cursor:not-allowed}.pqlg-ib:focus-visible{outline:2px solid #38bdf8;outline-offset:1px}",
    ".pqlg-ic{display:block;pointer-events:none}",
    ".pqlg-tb input{flex:1 1 90px;min-width:70px;box-sizing:border-box;height:25px;background:#0b1220;border:1px solid #2b3a52;color:#e6edf5;border-radius:7px;padding:0 8px;font:11px system-ui;outline:none}.pqlg-tb input:focus{border-color:#38bdf8}",
    ".pqlg-pal{margin-top:6px;padding:6px;border:1px solid #2b3a52;border-radius:9px;background:#0b1220}.pqlg-pal-t{display:flex;align-items:center;gap:6px;font:700 10.5px system-ui;color:#cfe0f0;margin-bottom:5px}.pqlg-pal-t b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pqlg-sw{display:flex;flex-wrap:wrap;gap:5px}.pqlg-sw button{width:20px;height:20px;border-radius:50%;border:2px solid #ffffff30;padding:0;cursor:pointer}.pqlg-sw button.on{border-color:#fff;box-shadow:0 0 0 2px #38bdf8}.pqlg-sw input[type=color]{width:24px;height:22px;padding:0;border:1px solid #2b3a52;border-radius:6px;background:none;cursor:pointer}",
    /* baris ruas */
    ".pqlg-r{display:flex;align-items:center;gap:7px;margin:1px 0;padding:3px 4px;border-radius:7px;line-height:1.25;color:var(--text,#e6edf5)}",
    ".pqlg-r i{flex:none;position:relative;width:22px;height:16px;border-radius:4px}.pqlg-r i[data-pick]{cursor:pointer}.pqlg-r i:after{content:\"\";position:absolute;left:2px;right:2px;top:6px;border-top:3px solid var(--c,#22d3ee);border-radius:2px}.pqlg-r i[data-pick]:hover{background:#ffffff1f}",
    ".pqlg-r span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pqlg-r em{flex:none;font-style:normal;font:700 10px ui-monospace,monospace;color:#9fb6c3}",
    ".pqlg-c{cursor:pointer}.pqlg-c:hover,.pqlg-c:focus-visible{background:#38bdf822;outline:none}",
    ".pqlg-eye{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:20px;border:0;border-radius:6px;background:transparent;color:#7dd3fc;cursor:pointer;padding:0;opacity:.85}.pqlg-eye:hover{background:#38bdf833;opacity:1;color:#fff}.pqlg-eye.off{color:#64748b}.pqlg-eye.part{color:#93c5fd;opacity:.7}",
    ".pqlg-ib.pqlg-eye{width:27px;height:25px;border:1px solid #2b3a52;background:#0b1220;border-radius:7px}",
    ".pqlg-r.off>span,.pqlg-r.off>i,.pqlg-r.off>em{opacity:.4}.pqlg-r.off>span{font-style:italic}",
    ".pqlg-gc.part{background:#f59e0b33;color:#fcd34d}.pqlg-gh em.dim{opacity:.45}",
    ".pqlg-x{flex:none;width:18px;height:18px;line-height:16px;text-align:center;border:0;border-radius:50%;background:transparent;color:#7f93a6;font-size:11px;cursor:pointer;padding:0;opacity:.55}.pqlg-x:hover{background:#f43f5e33;color:#fda4af;opacity:1}",
    /* grup kabupaten */
    ".pqlg-g{margin:2px 0;border-radius:8px}",
    ".pqlg-gh{display:flex;align-items:center;gap:6px;padding:4px 4px 4px 2px;border-radius:7px;cursor:pointer;color:var(--text,#e6edf5);font:700 11.5px system-ui;background:#ffffff0a}",
    ".pqlg-gh:hover,.pqlg-gh:focus-visible{background:#38bdf822;outline:none}",
    ".pqlg-gh>.pqlg-ic{flex:none;color:#7f93a6;transition:transform .15s}.pqlg-g.open>.pqlg-gh>.pqlg-ic,.pqlg-gh.on>.pqlg-ic{transform:rotate(90deg)}",
    ".pqlg-gh .pqlg-gn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pqlg-gh .pqlg-gc{flex:none;min-width:16px;padding:0 5px;border-radius:9px;background:#ffffff14;color:#cfe0f0;font:700 9.5px/16px system-ui;text-align:center}",
    ".pqlg-gh em{flex:none;font-style:normal;font:700 10px ui-monospace,monospace;color:#9fb6c3}",
    ".pqlg-gh .pqlg-ib{width:22px;height:20px;border:0;background:transparent;opacity:.6}.pqlg-gh .pqlg-ib:hover{opacity:1;background:#38bdf833}.pqlg-gh .pqlg-ib.pqlg-danger:hover{background:#f43f5e33;color:#fda4af}",
    ".pqlg-chip{flex:none;position:relative;width:18px;height:14px;border-radius:4px}.pqlg-chip:after{content:\"\";position:absolute;left:2px;right:2px;top:5px;border-top:4px solid var(--c,#22d3ee);border-radius:2px}.pqlg-chip[data-pick]:hover{background:#ffffff26}",
    ".pqlg-gb{display:none;margin-left:9px;padding-left:5px;border-left:1px solid #ffffff1f}.pqlg-g.open>.pqlg-gb{display:block}",
    ".pqlg-n{color:#9fb6c3;font-size:10px;padding:2px 4px}",
    ".pqlg-ib.pqlg-sta.on{background:#b45309;border-color:#fbbf24;color:#fff}",
    ".pqlg-stainfo{color:#fcd34d;font-size:10px;padding:3px 4px 0;line-height:1.3}",
    ".pqlg-stalabel{pointer-events:none}",
    ".pqlg-empty{color:#9fb6c3;font-style:italic;padding:3px 0}",
    ".pqlg-gap{margin-top:6px;padding-top:5px;border-top:1px solid #ffffff17}",
    ".pqlg-km{margin-left:6px;font:700 10px ui-monospace,monospace;color:#9fb6c3}"
  ].join("\n");
  var st = document.createElement("style"); st.id = "pqlg-css"; st.textContent = css; document.head.appendChild(st);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function km1(v) { return (Math.round(v * 10) / 10).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function G(n) {
    try {
      switch (n) {
        case "roads": return typeof roads !== "undefined" ? roads : undefined;
        case "layers": return typeof layers !== "undefined" ? layers : undefined;
        case "map": return typeof map !== "undefined" ? map : undefined;
        case "iriMode": return typeof iriMode !== "undefined" ? iriMode : false;
        case "globalDisplay": return typeof globalDisplay !== "undefined" ? globalDisplay : undefined;
        case "roadLengthKm": return typeof roadLengthKm !== "undefined" ? roadLengthKm : undefined;
      }
    } catch (e) {}
    return undefined;
  }
  function scanRoads() {
    var rs = G("roads") || [], ly = G("layers"), m = G("map"), all = [], vis = [];
    rs.forEach(function (r, i) {
      if (!r) return; r._lo = i; r._lk = lenKm(r);
      var l = ly && ly[r.id];
      r._v = r.visible !== false && !(m && l && l.group && m.hasLayer && !m.hasLayer(l.group));
      all.push(r); if (r._v) vis.push(r);
    });
    return { all: all, vis: vis };
  }
  /* tampil/sembunyikan banyak ruas sekaligus (satu kali simpan & render ulang daftar) */
  function setVis(list, on) {
    var ly = G("layers"), m = G("map");
    list.forEach(function (r) {
      r.visible = !!on; var l = ly && ly[r.id];
      if (on && !l) { try { if (typeof W.renderRoadLayer === "function") W.renderRoadLayer(r); } catch (e) {} l = (G("layers") || {})[r.id]; }
      if (l && l.group && m) { if (on) { if (!m.hasLayer(l.group)) l.group.addTo(m); } else if (m.hasLayer(l.group)) m.removeLayer(l.group); }
    });
    try { if (typeof W.persist === "function") W.persist(); } catch (e) {}
    try { if (typeof W.renderRoadList === "function") W.renderRoadList(); } catch (e) {}
    refresh();
  }
  function visibleRoads() {
    var rs = G("roads"), ly = G("layers"), m = G("map"), out = [];
    if (!rs || !rs.length) return out;
    rs.forEach(function (r, i) {
      if (!r || r.visible === false) return;
      var l = ly && ly[r.id]; if (m && l && l.group && m.hasLayer && !m.hasLayer(l.group)) return;
      r._lo = i; out.push(r);
    });
    return out;
  }
  var PAL = ["#22d3ee","#38bdf8","#60a5fa","#818cf8","#a78bfa","#e879f9","#f472b6","#f43f5e","#fb923c","#f59e0b","#facc15","#a3e635","#4ade80","#34d399","#2dd4bf","#ffffff","#e5e7eb","#94a3b8","#111827","#b91c1c","#15803d","#1d4ed8"];
  function GD() { return G("globalDisplay") || {}; }
  function curMode() { var g = GD(); return g.colorByKabupatenOn ? "kab" : g.uniformColorOn ? "all" : "road"; }

  /* kabupaten: kunci data (boleh kosong) → label tampil & kunci gaya warna (sama dengan aplikasi: bawaan Cilacap) */
  function kabKey(r) { return String(r.kabupaten == null ? "" : r.kabupaten).trim(); }
  function kabLabel(k) { return k || "Tanpa kabupaten"; }
  function kabSK(k) { return k || "Kabupaten Cilacap"; }
  function kabColor(k) { try { return W.getKabStyle(kabSK(k)).color; } catch (e) { return "#22d3ee"; } }

  function effColor(r) {
    var g = GD(); if (G("iriMode")) return "#7c8aa0";
    if (g.colorByKabupatenOn && typeof W.getKabStyle === "function") { try { return W.getKabStyle(r.kabupaten).color; } catch (e) {} }
    if (g.uniformColorOn) return g.uniformColor || "#22d3ee";
    return r.color || "#22d3ee";
  }
  function applyAll() {
    try { if (typeof W.saveDisplaySettings === "function") W.saveDisplaySettings(); } catch (e) {}
    try { if (typeof W.renderDisplaySettingsUI === "function") W.renderDisplaySettingsUI(); } catch (e) {}
    try { if (typeof W.renderAll === "function") W.renderAll(); } catch (e) {}
    try { if (typeof W.updateLegendForMode === "function") W.updateLegendForMode(); } catch (e) {}
    refresh();
  }
  function setMode(m) {
    var g = GD(); if (!g || G("iriMode")) return;
    g.colorByKabupatenOn = m === "kab"; g.uniformColorOn = m === "all"; g.colorByKonstruksiOn = false;
    S.pick = null; applyAll();
  }
  function pickInfo() {
    var m = curMode(), g = GD();
    if (m === "all") return { t: "all", label: "Satu warna untuk semua ruas", cur: g.uniformColor };
    if (!S.pick) return null;
    if (S.pick.t === "kab") return { t: "kab", key: S.pick.key, label: "Kabupaten: " + S.pick.key, cur: (function () { try { return W.getKabStyle(S.pick.key).color; } catch (e) { return ""; } })() };
    var r = (G("roads") || []).filter(function (x) { return String(x.id) === String(S.pick.key); })[0];
    return r ? { t: "road", key: S.pick.key, label: r.name, cur: r.color } : null;
  }
  function setColor(c) {
    var pi = pickInfo(), g = GD(); if (!pi || !c) return;
    if (pi.t === "all") g.uniformColor = c;
    else if (pi.t === "kab") { g.kabupatenStyles = g.kabupatenStyles || {}; g.kabupatenStyles[pi.key] = Object.assign({}, g.kabupatenStyles[pi.key], { color: c }); }
    else {
      var r = (G("roads") || []).filter(function (x) { return String(x.id) === String(pi.key); })[0]; if (!r) return;
      r.color = c; try { if (typeof W.persist === "function") W.persist(); } catch (e) {}
      try { if (typeof W.renderRoadLayer === "function" && curMode() === "road") W.renderRoadLayer(r); } catch (e) {}
    }
    applyAll();
  }
  function autoColors() {
    var rs = G("roads") || [], i = 0; rs.forEach(function (r) { r.color = PAL[(i++ * 5) % 15]; });
    try { if (typeof W.persist === "function") W.persist(); } catch (e) {}
    applyAll();
  }
  function resetKab() { var g = GD(); g.kabupatenStyles = {}; applyAll(); }

  /* panel palet hanya muncul saat ada yang dipilih (atau mode satu warna); petunjuk ada di tooltip ikon */
  function paletteHtml() {
    var iri = !!G("iriMode"), m = curMode(), pi = iri ? null : pickInfo(), h = "";
    if (iri) return '<div class="pqlg-n">Mode IRI aktif — warna mengikuti kondisi jalan.</div>';
    if (!pi) return "";
    h += '<div class="pqlg-pal"><div class="pqlg-pal-t"><b>' + esc(pi.label) + '</b>' + (m !== "all" ? '<button type="button" class="pqlg-x" data-pickclose="1" title="Tutup" aria-label="Tutup">✕</button>' : "") + '</div><div class="pqlg-sw">';
    var cur = String(pi.cur || "").toLowerCase();
    PAL.forEach(function (c) { h += '<button type="button" data-col="' + c + '" style="background:' + c + '"' + (cur === c ? ' class="on"' : "") + ' aria-label="' + c + '"></button>'; });
    h += '<input type="color" id="pqlgCol" value="' + (/^#[0-9a-f]{6}$/i.test(pi.cur || "") ? pi.cur : "#22d3ee") + '" title="Warna bebas"></div></div>';
    return h;
  }
  function lenKm(r) { try { var f = G("roadLengthKm"); return f ? +f(r) || 0 : 0; } catch (e) { return 0; } }

  /* ---------- pengelompokan per kabupaten ---------- */
  var cache = { rs: [], iri: false, kab: false };
  function groupsData() {
    var q = S.q.trim().toLowerCase(), map = {}, arr = [];
    cache.all.forEach(function (r) {
      var k = kabKey(r), kl = kabLabel(k).toLowerCase();
      if (q && kl.indexOf(q) < 0 && String(r.name || "").toLowerCase().indexOf(q) < 0) return;
      var g = map[k]; if (!g) { g = map[k] = { k: k, rs: [], km: 0, kt: 0, nv: 0, ord: r._lo }; arr.push(g); }
      g.rs.push(r); g.kt += r._lk; if (r._v) { g.km += r._lk; g.nv++; } if (r._lo < g.ord) g.ord = r._lo;
    });
    var rcmp = S.sort === "km" ? function (x, y) { return y._lk - x._lk; }
      : S.sort === "az" ? function (x, y) { return String(x.name || "").localeCompare(String(y.name || ""), "id"); }
      : function (x, y) { return x._lo - y._lo; };
    arr.forEach(function (g) { g.rs.sort(rcmp); });
    arr.sort(S.sort === "km" ? function (x, y) { return y.kt - x.kt; }
      : S.sort === "az" ? function (x, y) { return kabLabel(x.k).localeCompare(kabLabel(y.k), "id"); }
      : function (x, y) { return x.ord - y.ord; });
    return arr;
  }
  function isOpen(g, n) { if (S.q.trim()) return true; var v = S.open[g.k]; return v === undefined ? n === 1 : !!v; }

  function roadRow(r, mode) {
    var pk = mode === "road" ? ' data-pick="road" data-key="' + esc(r.id) + '" title="Ubah warna"' : "";
    var ey = r._v ? ibtn2("data-eye=\"" + esc(r.id) + "\"", "eye", "Sembunyikan ruas ini · Shift+klik: tampilkan hanya ruas ini", "") : ibtn2("data-eye=\"" + esc(r.id) + "\"", "eyeoff", "Tampilkan ruas ini · Shift+klik: tampilkan hanya ruas ini", "off");
    return '<div class="pqlg-r pqlg-c' + (r._v ? "" : " off") + '" role="button" tabindex="0" data-id="' + esc(r.id) + '" style="--c:' + esc(effColor(r)) + '" title="Klik untuk zoom ke ruas · ' + esc(r.name) + '"><i' + pk + '></i><span>' + esc(r.name) + '</span><em>' + km1(r._lk) + '</em>' + ey + '</div>';
  }
  function ibtn2(attr, icon, title, cls) { return '<button type="button" class="pqlg-eye' + (cls ? " " + cls : "") + '" ' + attr + ' title="' + esc(title) + '" aria-label="' + esc(title) + '">' + ico(icon, 15) + '</button>'; }
  function listHtml() {
    var gs = groupsData(), mode = curMode(), h = "", used = 0, total = 0, n = gs.length;
    gs.forEach(function (g) { total += g.rs.length; });
    gs.forEach(function (g) {
      var open = isOpen(g, n), key = esc(g.k), lab = esc(kabLabel(g.k)), chip;
      if (mode === "kab") chip = '<i class="pqlg-chip" data-pick="kab" data-key="' + esc(kabSK(g.k)) + '" style="--c:' + esc(kabColor(g.k)) + '" title="Ubah warna kabupaten"></i>';
      else if (mode === "all") chip = '<i class="pqlg-chip" style="--c:' + esc(GD().uniformColor || "#22d3ee") + '"></i>';
      else chip = "";
      h += '<div class="pqlg-g' + (open ? " open" : "") + '"><div class="pqlg-gh" role="button" tabindex="0" aria-expanded="' + open + '" data-kg="' + key + '" title="' + lab + ' — klik untuk ' + (open ? "tutup" : "buka") + ' daftar ruas">' + ico("chev", 13) + chip +
        '<span class="pqlg-gn">' + lab + '</span><span class="pqlg-gc' + (g.nv < g.rs.length ? " part" : "") + '" title="' + g.nv + ' dari ' + g.rs.length + ' ruas tampil">' + (g.nv < g.rs.length ? g.nv + "/" + g.rs.length : g.rs.length) + '</span><em class="' + (g.nv ? "" : "dim") + '">' + km1(g.nv ? g.km : g.kt) + '</em>' +
        ibtn('data-kgzoom="' + key + '"', "zoom", "Zoom ke semua ruas " + kabLabel(g.k)) +
        ibtn2('data-kgeye="' + key + '" data-to="' + (g.nv === g.rs.length ? 0 : 1) + '"', g.nv === g.rs.length ? "eye" : g.nv ? "eyepart" : "eyeoff", (g.nv === g.rs.length ? "Sembunyikan semua ruas " : "Tampilkan semua ruas ") + kabLabel(g.k) + " · Shift+klik: tampilkan hanya kabupaten ini", g.nv === g.rs.length ? "" : g.nv ? "part" : "off") + '</div>';
      if (open) {
        h += '<div class="pqlg-gb">';
        g.rs.forEach(function (r) { if (used < LIM) { h += roadRow(r, mode); used++; } });
        h += '</div>';
      }
      h += '</div>';
    });
    if (used < total && gs.some(function (g) { return isOpen(g, n); })) h += '<div class="pqlg-n">Menampilkan ' + used + ' ruas — gunakan pencarian untuk menyaring.</div>';
    if (!gs.length && cache.all.length) h = '<div class="pqlg-empty">Tidak ada ruas / kabupaten cocok dengan pencarian</div>';
    return h;
  }
  function renderList() { var l = document.getElementById("pqlgList"); if (l) l.innerHTML = listHtml(); }

  function toolbarHtml(rs, nKab) {
    var iri = !!G("iriMode"), m = curMode(), h = '<div class="pqlg-tb"><div class="pqlg-seg" role="group" aria-label="Mode warna">';
    [["road", "road", "Warna per ruas"], ["kab", "kab", "Warna per kabupaten"], ["all", "all", "Satu warna untuk semua ruas"]].forEach(function (x) {
      h += ibtn('data-mode="' + x[0] + '"' + (iri ? " disabled" : ""), x[1], x[2], m === x[0] && !iri ? "on" : "");
    });
    h += '</div>';
    var nv = cache.rs.length, na = cache.all.length;
    h += ibtn2('data-eyeall="' + (nv === na ? 0 : 1) + '"', nv === na ? "eye" : nv ? "eyepart" : "eyeoff", nv === na ? "Sembunyikan SEMUA ruas dari peta" : "Tampilkan SEMUA ruas di peta (" + nv + " dari " + na + " tampil)", (nv === na ? "" : nv ? "part" : "off") + " pqlg-ib");
    h += ibtn('data-sta="1" aria-pressed="' + S.sta + '"', "sta", S.sta ? "STA/KM: hanya ruas aktif di peta & layar (ON) — klik untuk kembali ke semua titik" : "Tampilkan STA/KM hanya untuk ruas aktif di peta & layar", "pqlg-sta" + (S.sta ? " on" : ""));
    if (m === "road" && !iri) h += ibtn('data-auto="1"', "palette", "Warna otomatis semua ruas");
    if (m === "kab" && !iri) h += ibtn('data-resetkab="1"', "reset", "Reset warna kabupaten");
    if (nKab > 1 || cache.all.length > 6) {
      h += ibtn('data-sort="1"', S.sort, "Urutan: " + SORTS[S.sort] + " (klik untuk ganti)");
      var allOpen = cache.allOpen; h += ibtn('data-expall="1"', allOpen ? "collapse" : "expand", allOpen ? "Tutup semua kabupaten" : "Buka semua kabupaten");
    }
    if (cache.all.length > 6 || nKab > 1) h += '<input id="pqlgQ" type="search" placeholder="Cari ruas / kabupaten…" value="' + esc(S.q) + '" aria-label="Cari ruas atau kabupaten">';
    return h + '</div>';
  }


  /* ---------- STA/KM: hanya ruas AKTIF di peta & yang masuk layar ---------- */
  var STA = { t: 0, ap: false, touched: false, cache: {}, MAX: 1500, LAB: 150 };
  function isSta(l) {
    if (!W.L) return false;
    if (l instanceof L.Polyline || l instanceof L.Polygon) return false;
    if (l instanceof L.CircleMarker) return true;
    if (l instanceof L.Marker) { var h = l.options && l.options.icon && l.options.icon.options && l.options.icon.options.html; return typeof h === "string" && h.indexOf("sta-thumb") > -1; }
    return false;
  }
  function staMarkers(id, g, m) {
    var c = STA.cache[id], n = 0; try { n = g.getLayers().length; } catch (e) {}
    if (c && c.g === g && c.n === n) return c;
    var ms = [], tot = 0; g.eachLayer(function (l) { if (isSta(l)) ms.push(l); });
    for (var i = 1; i < ms.length; i++) { try { tot += m.distance(ms[i - 1].getLatLng(), ms[i].getLatLng()); } catch (e) {} }
    return (STA.cache[id] = { g: g, n: n, ms: ms, sp: ms.length > 1 ? Math.max(5, tot / (ms.length - 1)) : 50 });
  }
  function labelOn(mk) {
    if (mk.__pqlgT) return; var tp = mk.getTooltip && mk.getTooltip(); if (!tp) return;
    mk.__pqlgT = { c: tp.getContent(), o: Object.assign({}, tp.options) };
    mk.unbindTooltip(); mk.bindTooltip(mk.__pqlgT.c, { permanent: true, direction: "top", offset: mk.__pqlgT.o.offset, className: "sta-label pqlg-stalabel" });
  }
  function labelOff(mk) {
    var o = mk.__pqlgT; if (!o) return; delete mk.__pqlgT;
    mk.unbindTooltip(); mk.bindTooltip(o.c, o.o);
  }
  function staInfo(txt) { S.staTxt = txt; var e = document.getElementById("pqlgStaInfo"); if (e) e.textContent = txt; }
  function staApply() {
    var m = G("map"), ly = G("layers"), rs = G("roads"); if (!m || !ly || !rs || !W.L) return;
    if (!S.sta && !STA.touched) return;
    STA.ap = true;
    try {
      var act = [], total = 0;
      rs.forEach(function (r) { var o = ly[r.id]; if (!o || !o.group) return; if (r.visible === false || !m.hasLayer(o.group)) return; var c = staMarkers(r.id, o.group, m); act.push(c); total += c.ms.length; });
      if (!S.sta) {                                   /* OFF → kembalikan tampilan bawaan: semua titik, tooltip asli */
        act.forEach(function (c) { c.ms.forEach(function (mk) { labelOff(mk); if (!m.hasLayer(mk)) m.addLayer(mk); }); });
        STA.touched = false; staInfo(""); return;
      }
      STA.touched = true;
      var z = m.getZoom(), b = m.getBounds().pad(0.2), mpp = 156543.03 * Math.cos(m.getCenter().lat * Math.PI / 180) / Math.pow(2, z);
      var near = z >= 10, f = 1, want, shown = 0;
      function pass() {
        want = []; shown = 0;
        act.forEach(function (c, ci) {
          var ms = c.ms, n = ms.length, step = Math.max(1, Math.ceil(26 * mpp * f / c.sp)), set = [];
          if (near) for (var i = 0; i < n; i++) { if (i % step === 0 || i === 0 || i === n - 1) { try { if (b.contains(ms[i].getLatLng())) { set.push(i); shown++; } } catch (e) {} } }
          want[ci] = set;
        });
      }
      pass(); for (var k = 0; k < 4 && shown > STA.MAX; k++) { f *= Math.ceil(shown / STA.MAX); pass(); }
      var lab = near && z >= 16 && shown <= STA.LAB;
      act.forEach(function (c, ci) {
        var keep = {}; want[ci].forEach(function (i) { keep[i] = 1; });
        c.ms.forEach(function (mk, i) {
          var has = m.hasLayer(mk), w = !!keep[i];
          if (lab && w) labelOn(mk); else labelOff(mk);
          if (w && !has) m.addLayer(mk); else if (!w && has) m.removeLayer(mk);
        });
      });
      staInfo(!near ? "STA/KM aktif — dekatkan zoom (≥ 10) untuk menampilkan titik" : "STA/KM " + shown + " dari " + total + " titik · " + act.length + " ruas aktif" + (lab ? " · label tampil" : z < 16 ? " · zoom ≥ 16 untuk label" : " · label muncul bila ≤ " + STA.LAB + " titik"));
    } catch (e) { try { console.warn("PETAQU legenda STA:", e); } catch (e2) {} }
    STA.ap = false;
  }
  function staSched() { if (STA.ap) return; if (!S.sta && !STA.touched) return; clearTimeout(STA.t); STA.t = setTimeout(staApply, 90); }
  function toggleSta() {
    S.sta = !S.sta; try { localStorage.setItem("pq_lg_sta", S.sta ? "1" : "0"); } catch (e) {}
    try { if (typeof W.toast === "function") W.toast(S.sta ? "STA/KM: hanya ruas aktif di peta & layar" : "STA/KM: semua titik (bawaan)"); } catch (e) {}
    staApply(); build();
  }

  function build() {
    busy = false;
    var box = document.getElementById("legendContent"); if (!box) return;
    var sc = box.scrollTop, qa = document.activeElement && document.activeElement.id === "pqlgQ" ? document.activeElement : null, qs = qa ? qa.selectionStart : 0;
    var iri = !!G("iriMode"), gd = G("globalDisplay") || {}, kab = !!gd.colorByKabupatenOn;
    var sc2 = scanRoads(), rs = sc2.vis, info = null, tot = 0, kset = {}, kvis = {};
    try { info = typeof W.__pqNasInfo === "function" ? W.__pqNasInfo() : null; } catch (e) {}
    rs.forEach(function (r) { tot += r._lk; kvis[kabKey(r)] = 1; });
    sc2.all.forEach(function (r) { kset[kabKey(r)] = 1; });
    var nKab = Object.keys(kset).length, nKabV = Object.keys(kvis).length;
    cache = { rs: rs, all: sc2.all, iri: iri, kab: kab, allOpen: false };
    cache.allOpen = nKab > 0 && Object.keys(kset).every(function (k) { var v = S.open[k]; return v === undefined ? nKab === 1 : !!v; });

    /* simpan isi legenda bawaan (dipakai ulang bila belum diganti ulang oleh aplikasi) */
    var cont = box.querySelector(".pqlg-orig");
    if (!cont) { cont = document.createElement("div"); cont.className = "pqlg-orig"; Array.prototype.slice.call(box.childNodes).forEach(function (n) { cont.appendChild(n); }); }

    var bd = { aspal: 0, rigid: 0, belum: 0 }, has = typeof W.roadKonstruksiBreakdown === "function", cols = {};
    if (has) rs.forEach(function (r) { try { var b = W.roadKonstruksiBreakdown(r); if (b) { bd.aspal += b.aspal || 0; bd.rigid += b.rigid || 0; bd.belum += b.belum || 0; } } catch (e) {} });
    var surf = has && !iri && !kab;
    Array.prototype.forEach.call(cont.children, function (row) {
      var t = (row.textContent || "").trim(), old2 = row.querySelector(".pqlg-km"); if (old2) old2.remove();
      row.style.display = "";
      var key = /^Aspal/i.test(t) ? "aspal" : /^Rigid/i.test(t) ? "rigid" : /^Belum ditandai/i.test(t) ? "belum" : "";
      if (key && has) {
        var dot = row.querySelector(".iri-legend-dot"); try { if (dot) cols[key] = getComputedStyle(dot).backgroundColor; } catch (e) {}
        row.style.display = bd[key] > 0.0005 ? "" : "none";
        if (bd[key] > 0.0005) { var s = document.createElement("span"); s.className = "pqlg-km"; s.textContent = km1(bd[key]) + " km"; row.appendChild(s); }
      } else if (/Titik STA|Ruas jalan tersurvei/i.test(t)) row.style.display = rs.length ? "" : "none";
      else if (kab && !iri && rs.length) row.style.display = "none"; /* daftar warna kabupaten sudah ada di kepala grup */
    });

    var h = '<div class="pqlg-head"><div class="pqlg-sec">Sedang dipetakan</div>';
    if (cache.all.length) {
      h += '<div class="pqlg-top"><b>Ruas tersurvei</b><span>' + nKabV + ' kab · ' + (rs.length < cache.all.length ? rs.length + " dari " + cache.all.length : rs.length) + ' ruas</span><em>' + km1(tot) + ' km</em></div>';
      var sum = bd.aspal + bd.rigid + bd.belum;
      if (surf && sum > 0.001) h += '<div class="pqlg-bar" title="Aspal / Rigid Beton / Belum ditandai">' + ["aspal", "rigid", "belum"].map(function (k) { return bd[k] > 0.0005 ? '<s style="width:' + (bd[k] / sum * 100).toFixed(2) + '%;background:' + (cols[k] || { aspal: "#f59e0b", rigid: "#38bdf8", belum: "#7c8aa0" }[k]) + '"></s>' : ""; }).join("") + '</div>';
      h += toolbarHtml(rs, nKab) + (S.sta ? '<div class="pqlg-stainfo" id="pqlgStaInfo">' + esc(S.staTxt) + '</div>' : "") + paletteHtml();
    } else if (!(info && info.n)) h += '<div class="pqlg-empty">Belum ada data tampil di peta</div>';
    h += '</div>';
    if (cache.all.length) h += '<div id="pqlgList">' + listHtml() + '</div>';
    if (info && info.n > 0) {
      var no = S.nasOpen;
      h += '<div class="' + (cache.all.length ? "pqlg-gap" : "") + '"><div class="pqlg-gh' + (no ? " on" : "") + '" role="button" tabindex="0" aria-expanded="' + no + '" data-nastoggle="1" title="Buka/tutup daftar Jalan Nasional" style="background:none">' + ico("chev", 13) + '<span class="pqlg-gn" style="color:#38bdf8">Jalan Nasional</span><span class="pqlg-gc">' + info.n + '</span><em>' + km1(info.km) + '</em></div>';
      if (no) (info.groups || []).forEach(function (g) { h += '<div class="pqlg-r pqlg-c" role="button" tabindex="0" data-nas="' + g.gi + '" style="--c:#38bdf8;margin-left:9px" title="Klik untuk zoom"><i></i><span>' + esc(String(g.name).replace(/^Jalan Nasional /, "")) + '</span><em>' + km1(g.km) + '</em></div>'; });
      h += '</div>';
    }
    var top = document.createElement("div"); top.className = "pqlg-top-wrap"; top.innerHTML = h;
    box.innerHTML = ""; box.appendChild(top);
    var sep = document.createElement("div"); sep.className = "pqlg-gap"; if (cont.children.length) { box.appendChild(sep); sep.appendChild(cont); }
    box.scrollTop = sc;
    if (qa) { var q2 = document.getElementById("pqlgQ"); if (q2) { try { q2.focus(); q2.setSelectionRange(qs, qs); } catch (e) {} } }
  }
  function refresh() { staSched(); if (busy) return; busy = true; clearTimeout(T); T = setTimeout(build, 140); }
  W.__pqLegendRefresh = refresh;

  function focusRoad(id) {
    try { if (typeof W.focusRoad === "function") return W.focusRoad(id); } catch (e) {}
    try { var ly = G("layers"), m = G("map"); if (ly && ly[id] && m) m.fitBounds(ly[id].group.getBounds(), { padding: [40, 40], maxZoom: 17 }); } catch (e) {}
  }
  function kabRoads(k) { return cache.all.filter(function (r) { return kabKey(r) === k; }); }
  function focusKab(k) {
    var ly = G("layers"), m = G("map"), b = null; if (!ly || !m) return;
    var all = kabRoads(k), vis = all.filter(function (r) { return r._v; });
    if (!vis.length && all.length) { setVis(all, true); vis = all; }
    vis.forEach(function (r) { try { var l = ly[r.id], lb = l && l.group && l.group.getBounds(); if (lb && lb.isValid()) b = b ? b.extend(lb) : L.latLngBounds(lb.getSouthWest(), lb.getNorthEast()); } catch (e) {} });
    if (b) try { m.fitBounds(b, { padding: [40, 40], maxZoom: 15 }); } catch (e) {}
  }
  /* solo: tampilkan hanya daftar ini, sembunyikan semua ruas lain */
  function solo(list) {
    var ids = {}; list.forEach(function (r) { ids[r.id] = 1; });
    setVis(cache.all.filter(function (r) { return !ids[r.id]; }), false); setVis(list, true);
  }
  function act(t, ev) {
    var solo1 = !!(ev && (ev.shiftKey || ev.ctrlKey || ev.metaKey));
    if (t.closest("[data-sta]")) { toggleSta(); return true; }
    var md = t.closest("[data-mode]"); if (md) { if (!md.disabled) setMode(md.getAttribute("data-mode")); return true; }
    var cl = t.closest("[data-col]"); if (cl) { setColor(cl.getAttribute("data-col")); return true; }
    if (t.closest("[data-pickclose]")) { S.pick = null; refresh(); return true; }
    if (t.closest("[data-auto]")) { autoColors(); return true; }
    if (t.closest("[data-resetkab]")) { resetKab(); return true; }
    var pk = t.closest("[data-pick]"); if (pk) { var t2 = pk.getAttribute("data-pick"), k2 = pk.getAttribute("data-key"); S.pick = (S.pick && S.pick.t === t2 && S.pick.key === k2) ? null : { t: t2, key: k2 }; if (curMode() === "all") S.pick = null; build(); return true; }
    var kz = t.closest("[data-kgzoom]"); if (kz) { focusKab(kz.getAttribute("data-kgzoom")); return true; }
    var ea = t.closest("[data-eyeall]"); if (ea) { setVis(cache.all, ea.getAttribute("data-eyeall") === "1"); return true; }
    var ke = t.closest("[data-kgeye]");
    if (ke) { var kk0 = ke.getAttribute("data-kgeye"), kl = kabRoads(kk0); if (solo1) { solo(kl); focusKab(kk0); } else setVis(kl, ke.getAttribute("data-to") === "1"); return true; }
    var ey = t.closest("[data-eye]");
    if (ey) {
      var rid = ey.getAttribute("data-eye"), rr = cache.all.filter(function (z) { return String(z.id) === rid; })[0]; if (!rr) return true;
      if (solo1) { solo([rr]); focusRoad(rr.id); } else setVis([rr], !rr._v);
      return true;
    }
    var r = t.closest("[data-id]");
    if (r) { var id0 = r.getAttribute("data-id"), r0 = cache.all.filter(function (z) { return String(z.id) === id0; })[0]; if (r0 && !r0._v) setVis([r0], true); focusRoad(id0); return true; }
    var n = t.closest("[data-nas]"); if (n && typeof W.__pqNasFocus === "function") { W.__pqNasFocus(+n.getAttribute("data-nas")); return true; }
    if (t.closest("[data-nastoggle]")) { S.nasOpen = !S.nasOpen; build(); return true; }
    if (t.closest("[data-sort]")) { S.sort = S.sort === "km" ? "az" : S.sort === "az" ? "ord" : "km"; build(); return true; }
    if (t.closest("[data-expall]")) { var to = !cache.allOpen; cache.all.forEach(function (r) { S.open[kabKey(r)] = to; }); build(); return true; }
    var kg = t.closest("[data-kg]");
    if (kg) { var kk = kg.getAttribute("data-kg"), nn = Object.keys(cache.all.reduce(function (a, r) { a[kabKey(r)] = 1; return a; }, {})).length, cur = S.open[kk] === undefined ? nn === 1 : !!S.open[kk]; S.open[kk] = !cur; build(); return true; }
    return false;
  }
  function wrap(name) {
    var f = W[name]; if (typeof f !== "function" || f.__pqlg) return;
    var w = function () { var r = f.apply(this, arguments); try { refresh(); } catch (e) {} return r; }; w.__pqlg = 1;
    try { W[name] = w; } catch (e) {}
  }
  function init() {
    var box = document.getElementById("legendContent");
    if (!box || typeof W.updateLegendForMode !== "function") return setTimeout(init, 400);
    box.addEventListener("click", function (e) { if (act(e.target, e)) { e.stopPropagation(); } });
    box.addEventListener("keydown", function (e) { if (e.target && e.target.id === "pqlgQ") { e.stopPropagation(); return; } if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-id],[data-nas],[data-kg],[data-nastoggle]")) { e.preventDefault(); act(e.target, e); } });
    box.addEventListener("change", function (e) { if (e.target && e.target.id === "pqlgCol") setColor(e.target.value); });
    box.addEventListener("input", function (e) { if (e.target && e.target.id === "pqlgQ") { S.q = e.target.value; renderList(); } });
    ["updateLegendForMode", "toggleRoadVisibility", "showAll", "hideAll", "renderRoadLayer", "clearLayer", "persist", "toggleIriMode", "toggleColorByKabupaten"].forEach(wrap);
    var mp = G("map"); if (mp && mp.on) mp.on("zoomend moveend", staSched);
    refresh(); setTimeout(refresh, 1500); if (S.sta) setTimeout(staApply, 1800);
  }
  W.__pqLegenda = { v: 5, refresh: refresh, sta: function (on) { if (on !== undefined && !!on !== S.sta) toggleSta(); return S.sta; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
