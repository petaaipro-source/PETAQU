/* PETAQU — Lapisan Jalan Tol (Trans Jawa), Tol Konstruksi/Rencana & Jalan Provinsi Jawa Tengah.  v3
   PRIORITAS SUMBER RESMI (berurutan, otomatis turun ke sumber berikutnya bila gagal):

   TOL (operasi · konstruksi · rencana)
     1) Bina Marga / BPJT – Kementerian PU  : ArcGIS REST  gisportal.binamarga.pu.go.id  (folder "Tol"; ditemukan otomatis)
     2) BIG Rupabumi Indonesia (RBI)         : atribut TOLRJL & status STARJL
     3) OpenStreetMap (Overpass)             : hanya cadangan terakhir / pelengkap bila diaktifkan

   JALAN PROVINSI JAWA TENGAH
     1) Geoportal Borobudur/Palapa (Satu Peta Jateng, Dinas PU BM-CK) : overlay WMS
        "Jalan Provinsi Kewenangan Provinsi Jawa Tengah Skala 1:50000" (nama layer dicari otomatis dari GetCapabilities)
     2) Bina Marga – Kementerian PU (folder "Hosted", layer jalan provinsi)  : garis yang bisa diklik
     3) BIG RBI (AUTRJL=2)                                                   : garis yang bisa diklik

   Tambahan: impor GeoJSON sendiri (BPJT / PUPR / SHP Dinas PU yang dikonversi), uji koneksi sumber, tautan peta resmi.
   Data di-cache per kotak 0,5° (localStorage). Tombol #tlBtn disembunyikan; dibuka lewat menu folder (petaqu-folder.js). */
(function () {
  "use strict";
  if (window.__pqJalan) return;
  window.__pqJalan = 1;

  var $ = function (id) { return document.getElementById(id); };
  var KEY = "petaqu_jalan_v3", OLDKEY = "petaqu_jalan_v2", CK = "petaqu_jalan_cache_v3", DK = "petaqu_jalan_disc_v3", IK = "petaqu_jalan_import_v1";
  var CELL = 0.5, TTL = 7 * 864e5, DTTL = 3 * 864e5;

  var OVP = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  var BM = "https://gisportal.binamarga.pu.go.id/arcgis/rest/services";
  var BIG = "https://geoservices.big.go.id/rbi/rest/services/BASEMAP/Rupabumi_Indonesia/MapServer/547/query";
  var SP = "https://satupeta.jatengprov.go.id/geoserver/palapa/wms", SPG = "https://satupeta.jatengprov.go.id/geoserver/wms";
  var BIG_F = "NAMRJL,KONRJL,FGSRJL,KLSRJL,JPARJL,STARJL,KLLRJL,TOLRJL,AUTRJL";

  var SRCN = {
    bm: "Bina Marga / BPJT – Kementerian PU",
    big: "BIG – Rupabumi Indonesia",
    osm: "OpenStreetMap",
    sp: "Satu Peta Jateng (WMS)",
    imp: "Impor GeoJSON"
  };

  /* tautan resmi untuk dibuka di tab baru */
  var LINKS = [
    ["Geoportal Borobudur – Satu Peta Jateng", "https://satupeta.jatengprov.go.id/main/peta"],
    ["WebGIS Jalan – Dinas PU BM-CK Jateng", "https://dpubinmarcipka.jatengprov.go.id/webgis/index.php"],
    ["Peta Jalan Provinsi (Open Data Jateng)", "https://data.jatengprov.go.id/dataset/peta-jalan-provinsi-jawa-tengah-tahun-2024"],
    ["Peta Jalan Tol – BPJT / Kementerian PU", "https://gis.bpjt.pu.go.id"],
    ["Bina Marga GIS Portal (ArcGIS REST)", "https://gisportal.binamarga.pu.go.id/arcgis/rest/services"]
  ];

  /* kategori. chain = urutan sumber; big = filter SQL layer BIG; q = filter Overpass; z = zoom minimum */
  var CAT = {
    tol:  { n: "Jalan Tol (operasi)",  c: "#f59e0b", w: 4, z: 8,  d: "",    big: "TOLRJL=1 AND STARJL=1", chain: ["bm", "big", "osm"], q: '[highway~"^(motorway|motorway_link)$"]' },
    kons: { n: "Tol Dalam Konstruksi", c: "#ef4444", w: 4, z: 8,  d: "9 6", big: "TOLRJL=1 AND STARJL=3", chain: ["bm", "big", "osm"], q: '[highway=construction][construction~"^(motorway|motorway_link|trunk)$"]' },
    renc: { n: "Rencana Tol",          c: "#a78bfa", w: 3, z: 8,  d: "3 8", big: "TOLRJL=1 AND STARJL=2", chain: ["bm", "big", "osm"], q: '[highway=proposed][proposed~"^(motorway|trunk)$"]' },
    prov: { n: "Ruas Jalan Provinsi",  c: "#3b82f6", w: 3, z: 10, d: "",    big: "AUTRJL=2 AND (TOLRJL IS NULL OR TOLRJL<>1)", chain: ["bm", "big"], q: '[highway~"^(secondary|secondary_link)$"]' }
  };
  var ORDER = ["tol", "kons", "renc", "prov"];

  /* koridor tol untuk lompat cepat (status berubah; lihat BPJT) */
  var PROYEK = [
    ["Trans Jawa: Brebes–Pemalang–Batang–Semarang", -6.93, 109.45, 9],
    ["Semarang ABC & Semarang–Demak", -6.97, 110.45, 11],
    ["Semarang–Solo", -7.28, 110.58, 10],
    ["Solo–Ngawi (Trans Jawa timur)", -7.52, 111.0, 10],
    ["Yogyakarta–Bawen", -7.45, 110.4, 10],
    ["Solo–Yogyakarta–YIA", -7.78, 110.5, 10],
    ["Cilacap–Yogyakarta (rencana)", -7.65, 109.6, 9]
  ];

  var LBL = {
    STARJL: { 1: "Operasional", 2: "Akan dibangun", 3: "Sedang dibangun" },
    KONRJL: { 1: "Mantap", 2: "Tidak mantap", 3: "Kritis" },
    FGSRJL: { 1: "Arteri primer", 2: "Kolektor primer", 5: "Arteri sekunder" },
    JPARJL: { 1: "1 lajur", 2: "2 lajur", 3: "3 lajur" }
  };

  var DEF = { on: false, show: { tol: true, kons: false, renc: false, prov: false }, op: 0.9, osmTol: false, osmProv: false, lbl: false, nm: true, sp: { on: false, layer: "", ep: "" } };
  var st = JSON.parse(JSON.stringify(DEF));
  try {
    var sv = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!sv) { /* migrasi nama layer WMS dari versi lama */
      var ov = JSON.parse(localStorage.getItem(OLDKEY) || "null");
      if (ov && ov.sp && ov.sp.layer) st.sp.layer = ov.sp.layer;
    } else {
      Object.assign(st, sv); st.show = Object.assign({}, DEF.show, sv.show); st.sp = Object.assign({}, DEF.sp, sv.sp);
    }
  } catch (e) {}
  st.show.prov = false; st.osmProv = false; /* jalan provinsi hanya dari peta resmi Geoportal (WMS); garis vektor dinonaktifkan */
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  var spAll = [], rend, rendOsm, groups = {}, seen = {}, cells = {}, timer, cache = {}, imported = {}, spLayer = null, spNames = [];
  var disc = null, discP = null, discFail = null, SS = {}, chipT = 0;
  try { cache = JSON.parse(localStorage.getItem(CK) || "{}"); } catch (e) {}

  /* index.html mendeklarasikan `const map` (bukan window.map), jadi ambil lewat lingkup global */
  function M() {
    try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) {}
    return window.map && window.map.addLayer ? window.map : null;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var useOsm = function (k) { return k === "prov" ? st.osmProv : st.osmTol; };
  function explain(e) {
    var m = (e && e.message) || String(e);
    if (e && e.name === "AbortError") return "waktu habis";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "tidak terjangkau (offline, diblokir CORS, atau server mati)";
    return m;
  }

  /* ---------- status sumber ---------- */
  function stat(s, ok, msg) {
    var o = SS[s] || (SS[s] = { ok: 0, err: 0, last: "" });
    if (ok) o.ok++; else { o.err++; o.last = msg || ""; }
    clearTimeout(chipT); chipT = setTimeout(chips, 250);
  }
  function chips() {
    var el = $("tlSrc"); if (!el) return;
    el.innerHTML = ["bm", "big", "sp", "osm"].map(function (s) {
      var o = SS[s], col = !o ? "#64748b" : (o.ok ? "#34d399" : "#f87171"), tx = !o ? "belum dipakai" : (o.ok ? "aktif (" + o.ok + ")" : "gagal");
      return '<div class="tl-chip" title="' + esc(o && o.last ? o.last : "") + '"><i style="background:' + col + '"></i><span>' + SRCN[s] + '</span><em>' + tx + "</em></div>";
    }).join("");
  }

  /* ---------- UI ---------- */
  var CSS = "#tlBtn{display:none!important}" +
    "#tlPanel{position:fixed;left:var(--pq-fl,364px);top:calc(var(--pq-ft,70px) + 52px);z-index:1260;width:min(340px,calc(100vw - 20px));max-height:calc(100dvh - var(--pq-ft,70px) - 80px);overflow:auto;display:none;box-sizing:border-box;padding:12px;border-radius:16px;border:1px solid rgba(245,158,11,.35);background:#0a0e17f5;color:#dbe7f3;font:13px/1.4 system-ui,sans-serif;box-shadow:0 14px 40px #0008;backdrop-filter:blur(10px)}" +
    "#tlPanel.open{display:block}#tlPanel h3{margin:0 0 2px;font-size:14px}#tlPanel small{color:#9fb0c8}" +
    ".tl-x{position:absolute;top:8px;right:10px;border:0;background:none;color:#8fa6bd;font-size:20px;cursor:pointer}" +
    ".tl-lab{pointer-events:none!important}.tl-lab span{position:absolute;left:0;top:0;white-space:nowrap;font:700 11px/1 system-ui,sans-serif;color:#fff;letter-spacing:.2px;text-shadow:0 0 3px #000,0 0 3px #000,0 1px 2px #000,0 -1px 2px #000;transform-origin:50% 50%}" +
    "#tlLegend{margin-top:6px}#tlLegend b{display:block;margin-top:6px;font-size:10px;letter-spacing:.6px;text-transform:uppercase}#tlLegend .jn-lg-row{display:flex;align-items:center;gap:8px;margin-top:5px;white-space:nowrap;color:#d7e5f3;font-size:11.5px;font-weight:600}#tlLegend .jn-lg-row i{width:22px;height:4px;border-radius:3px;flex:none;display:block}" +
    "html body #legend{min-width:236px;padding:11px 14px 12px;line-height:1.35}" +
    "html body #legend>b{font-size:11px;letter-spacing:.9px;color:#e6edf5;margin-bottom:7px}" +
    "html body #legend #legendContent .lg-row{display:flex;align-items:center;gap:10px;margin-top:5px;color:#c4d3e3;font-size:11.5px}" +
    "html body #legend .lg-dot{width:10px;height:10px;margin:0 10px;border-radius:50%;background:#fff;border:2px solid #0b1220;box-shadow:0 0 0 1.5px #94a3b8;flex:none;display:block}" +
    "html body #legend .lg-ln{width:30px;height:0;margin:0;border-top:3px solid #94a3b8;border-radius:3px;flex:none;display:block}" +
    "html body #legend #tlLegend,html body #legend #jnLegend{margin-top:9px;padding-top:8px;border-top:1px solid rgba(148,178,204,.22)}" +
    "html body #legend #tlLegend:empty,html body #legend #jnLegend:empty{display:none}" +
    "html body #legend #tlLegend b,html body #legend #jnLegend b{display:block;margin:9px 0 0;font-size:10px;letter-spacing:.9px;text-transform:uppercase;color:#8fa6bd}" +
    "html body #legend #tlLegend b:first-child,html body #legend #jnLegend b:first-child{margin-top:0}" +
    "html body #legend .jn-lg-row{gap:10px;margin-top:6px;font-size:11.5px;font-weight:600;color:#e2ecf6}" +
    "html body #legend .jn-lg-row i{width:30px;height:5px;border-radius:4px}" +
    ".lg-sw{flex:none;width:30px;height:8px;display:block;line-height:0}.lg-sw svg{display:block;filter:drop-shadow(0 0 3px rgba(0,0,0,.6))}" +
    ".tl-hd{display:flex;align-items:flex-start;gap:10px;margin-bottom:4px}.tl-hd .tl-x{position:static;line-height:1;padding:0 2px}.tl-hd .jn-sw{margin-top:2px}" +
    ".tl-r{display:flex;align-items:center;gap:10px;padding:8px 6px;border-radius:10px;cursor:pointer}.tl-r:hover{background:#ffffff0d}" +
    ".tl-r input{accent-color:var(--c)}.tl-sw{width:30px;height:0;border-top:4px var(--ds,solid) var(--c);border-radius:2px;flex:none}" +
    ".tl-r b{flex:1;font-weight:600}.tl-r em{font-style:normal;font-size:11px;color:#9fb0c8}" +
    ".tl-h{margin:12px 0 4px;font:700 10px/1 system-ui;letter-spacing:.8px;text-transform:uppercase;color:#8fa6bd}" +
    ".tl-p{display:block;width:100%;text-align:left;padding:7px 8px;margin:2px 0;border:0;border-radius:8px;background:#ffffff0a;color:inherit;font:600 12px system-ui;cursor:pointer}.tl-p:hover{background:#f59e0b26}" +
    "a.tl-a{display:block;padding:6px 8px;margin:2px 0;border-radius:8px;background:#ffffff0a;color:#7dd3fc;font:600 12px system-ui;text-decoration:none}a.tl-a:hover{background:#38bdf826}" +
    "#tlSt{margin-top:8px;font-size:11px;color:#9fb0c8}#tlPanel input[type=range]{width:100%}" +
    ".tl-tip{background:#0a0e17f2;border:1px solid #f59e0b88;color:#fff;border-radius:8px;padding:5px 9px}" +
    "#tlPanel input[type=text],#tlPanel select{width:100%;box-sizing:border-box;margin:3px 0;padding:6px 8px;border-radius:8px;border:1px solid #ffffff22;background:#0f1726;color:#dbe7f3;font:12px system-ui}" +
    ".tl-b{display:inline-block;margin:3px 4px 3px 0;padding:6px 10px;border:0;border-radius:8px;background:#f59e0b26;color:#fde7b0;font:600 12px system-ui;cursor:pointer}.tl-b:hover{background:#f59e0b44}" +
    ".tl-c{display:flex;align-items:flex-start;gap:8px;padding:4px 2px;font-size:12px;cursor:pointer}.tl-c input{margin-top:2px}" +
    ".tl-src{display:inline-block;margin-top:4px;padding:1px 6px;border-radius:6px;background:#ffffff14;color:#9fb0c8;font-size:10px}" +
    ".tl-chip{display:flex;align-items:center;gap:7px;padding:3px 2px;font-size:11px}.tl-chip i{width:8px;height:8px;border-radius:50%;flex:none}.tl-chip span{flex:1}.tl-chip em{font-style:normal;color:#9fb0c8}" +
    "#tlTestOut{margin-top:4px;font-size:11px;line-height:1.5;color:#c6d4e6}";

  function build() {
    var s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
    var b = document.createElement("button"); b.id = "tlBtn"; b.type = "button"; document.body.appendChild(b);
    var p = document.createElement("div"); p.id = "tlPanel"; p.setAttribute("role", "dialog");
    var h = '<div class="tl-hd"><div style="flex:1"><h3>Tol & Jalan Provinsi</h3>' +
      "<small>Sumber resmi: Kementerian PU (Bina Marga/BPJT) · Dinas PU BM-CK & Geoportal Jateng · BIG</small></div>" +
      '<label class="jn-sw" style="--a:#f59e0b;--b:#d97706" title="Tampilkan / sembunyikan"><input type="checkbox" id="tlToggle"><span></span></label>' +
      '<button class="tl-x" id="tlClose" aria-label="Tutup">×</button></div>';

    function row(k) {
      var c = CAT[k];
      return '<label class="tl-r" style="--c:' + c.c + '"><input type="checkbox" data-k="' + k + '"><span class="tl-sw" style="--ds:' + (c.d ? "dashed" : "solid") + '"></span><b>' + c.n + '</b><em id="tlN_' + k + '">0</em></label>';
    }
    h += '<div class="tl-h">Jalan tol · Trans Jawa & jaringan tol</div>' + row("tol") + row("kons") + row("renc");
    h += '<div class="tl-h">Jalan provinsi Jawa Tengah</div>' +
      '<label class="tl-c"><input type="checkbox" id="tlSpOn"><span>Peta resmi <b>Jalan Provinsi Kewenangan Prov. Jateng</b> (Geoportal Borobudur · Dinas PU BM-CK)</span></label>' +
      '<input type="text" id="tlSpLayer" list="tlSpList" placeholder="Nama layer WMS (otomatis dicari)"><datalist id="tlSpList"></datalist>' +
      '<button class="tl-b" id="tlSpFind" type="button">Cari layer otomatis</button><div id="tlSpSt" style="font-size:11px;color:#9fb0c8"></div><div id="tlSpCand"></div>' +
      '<small>Label nama ruas diambil dari layer yang sama (zoom ≥ 11).</small>';
    h += '<div class="tl-h">Status sumber data</div><div id="tlSrc"></div>' +
      '<button class="tl-b" id="tlTest" type="button">Uji koneksi sumber</button><div id="tlTestOut"></div>';
    h += '<div class="tl-h">Sumber tambahan (belum tentu resmi)</div>' +
      '<label class="tl-c"><input type="checkbox" id="tlOsmTol"><span>Lengkapi tol/konstruksi/rencana dengan OpenStreetMap (lebih baru; digambar tipis di bawah data resmi)</span></label>';
    h += '<div class="tl-h">Impor GeoJSON (BPJT / PUPR / Dinas PU)</div>' +
      '<select id="tlImpCat"><option value="tol">Jalan Tol (operasi)</option><option value="kons">Tol Dalam Konstruksi</option><option value="renc">Rencana Tol</option></select>' +
      '<input type="file" id="tlImpFile" accept=".geojson,.json,application/geo+json,application/json" style="display:none">' +
      '<button class="tl-b" id="tlImpBtn" type="button">Pilih file GeoJSON…</button><button class="tl-b" id="tlImpClr" type="button">Hapus impor</button><div id="tlImpSt" style="font-size:11px;color:#9fb0c8"></div>';
    h += '<div class="tl-h">Opasitas</div><input type="range" id="tlOp" min="3" max="10" step="1">';
    h += '<label class="tl-c" style="margin-top:8px"><input type="checkbox" id="tlNm"><span>Label nama ruas pada garis (zoom ≥ 11; juga untuk layer WMS Geoportal lewat WFS)</span></label>';
    h += '<label class="tl-c"><input type="checkbox" id="tlLbl"><span>Label nama tempat di atas semua layer (hanya basemap Google Hybrid)</span></label>';
    h += '<div class="tl-h">Lompat ke koridor tol</div>';
    PROYEK.forEach(function (x, i) { h += '<button class="tl-p" data-i="' + i + '">' + esc(x[0]) + "</button>"; });
    h += '<div class="tl-h">Buka peta resmi (tab baru)</div>';
    LINKS.forEach(function (x) { h += '<a class="tl-a" target="_blank" rel="noopener" href="' + x[1] + '">' + esc(x[0]) + " ↗</a>"; });
    h += '<div id="tlSt"></div><small>Status tol berubah cepat; rujukan akhir tetap BPJT/Kementerian PU. Status ruas jalan provinsi mengikuti SK Gubernur Jateng No. 622/2 Tahun 2023.</small>';
    p.innerHTML = h; document.body.appendChild(p);

    p.querySelectorAll("input[data-k]").forEach(function (i) { i.checked = !!st.show[i.dataset.k]; });
    $("tlNm").checked = st.nm !== false; $("tlLbl").checked = st.lbl !== false; $("tlToggle").checked = !!st.on; $("tlOp").value = Math.round(st.op * 10);
    $("tlOsmTol").checked = !!st.osmTol;
    $("tlSpOn").checked = !!st.sp.on; $("tlSpLayer").value = st.sp.layer || "";
    chips();
    b.onclick = function () { p.classList.toggle("open"); };
    $("tlClose").onclick = function () { p.classList.remove("open"); };
    p.addEventListener("change", function (e) {
      var t = e.target, k = t.dataset.k;
      if (t.id === "tlNm") { st.nm = t.checked; save(); lblNames(); spWfs(); return; }
      if (t.id === "tlLbl") { st.lbl = t.checked; save(); lblSync(); return; }
      if (t.id === "tlToggle") { st.on = t.checked; save(); sync(); spSync(false); if (st.on) fetchView(); return; }
      if (k) { st.show[k] = t.checked; var was = st.on; st.on = true; $("tlToggle").checked = true; save(); sync(); if (!was) spSync(false); fetchView(); return; }
      if (t.id === "tlOsmTol") {
        st.osmTol = t.checked; save();
        if (!t.checked) clearOsm();
        resetCells(); fetchView(); return;
      }
      if (t.id === "tlSpOn") { st.sp.on = t.checked; save(); spSync(true); return; }
      if (t.id === "tlSpLayer") {
        st.sp.layer = t.value.trim();
        var hit = spAll.filter(function (x) { return x.name === st.sp.layer; })[0];
        st.sp.ep = hit && hit.ep !== SP ? hit.ep : (/^[^:]+:/.test(st.sp.layer) && !/^palapa:/i.test(st.sp.layer) ? SPG : "");
        save(); spSync(true); return;
      }
      if (t.id === "tlImpFile") { impFile(t.files && t.files[0]); t.value = ""; }
    });
    $("tlOp").oninput = function () { st.op = this.value / 10; save(); each(function (l) { l.setStyle && l.setStyle({ opacity: opOf(l) }); }); if (spLayer) spLayer.setOpacity(st.op); };
    $("tlSpFind").onclick = function () { spDiscover(true); };
    $("tlTest").onclick = function () { testSources(); };
    $("tlImpBtn").onclick = function () { $("tlImpFile").click(); };
    $("tlImpClr").onclick = function () { clearImport(); };
    p.addEventListener("click", function (e) {
      var sq = e.target.closest("[data-sp]");
      if (sq) { var xx = spNames[+sq.dataset.sp]; if (xx) spPick(xx); return; }
      var q = e.target.closest(".tl-p"); if (!q || q.dataset.i == null) return;
      var x = PROYEK[+q.dataset.i], m = M(); if (!x || !m) return;
      st.show.tol = st.show.kons = st.show.renc = true; p.querySelectorAll("input[data-k]").forEach(function (i) { i.checked = !!st.show[i.dataset.k]; });
      save(); sync(); m.flyTo([x[1], x[2]], x[3], { duration: .8 });
    });
  }

  /* ---------- peta ---------- */
  function each(fn) { ORDER.forEach(function (k) { groups[k] && groups[k].eachLayer(fn); }); }

  function sync() {
    var m = M(); if (!m) return;
    ORDER.forEach(function (k) {
      var g = groups[k], want = st.on && st.show[k];
      if (want && !m.hasLayer(g)) g.addTo(m);
      if (!want && m.hasLayer(g)) m.removeLayer(g);
    });
    lblNames();
    var on = ORDER.filter(function (k) { return st.show[k]; }).length;
    var b = $("tlBtn"); if (b) b.classList.toggle("off", !st.on || !on);
    legend();
  }

  /* Palet garis PETAQU (semua unik, tidak boleh ada yang sama):
       Tol operasi #f59e0b (amber, solid) · Tol konstruksi #ef4444 (merah, putus-putus) · Rencana tol #a78bfa (ungu, titik-titik)
       Provinsi #3b82f6 (biru) · Lintas Utara #22d3ee (cyan) · Lintas Tengah #a3e635 (lime) · Lintas Selatan #f472b6 (pink) */
  var LGD = { kons: "7 4", renc: "1 5" };
  function swatch(c, dash) {
    return '<span class="lg-sw"><svg width="30" height="8" viewBox="0 0 30 8" aria-hidden="true"><line x1="3" y1="4" x2="27" y2="4" stroke="' + c +
      '" stroke-width="4" stroke-linecap="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : "") + "/></svg></span>";
  }
  function legend() {
    var g = $("legend"); if (!g) return;
    var el = $("tlLegend"); if (!el) { el = document.createElement("div"); el.id = "tlLegend"; g.appendChild(el); }
    function row(k) {
      var c = CAT[k];
      return '<div class="jn-lg-row">' + swatch(c.c, c.d ? LGD[k] : "") + "<span>" + c.n + "</span></div>";
    }
    var tol = ORDER.filter(function (k) { return k !== "prov" && st.on && st.show[k]; }).map(row).join("");
    var jt = "";
    if (st.on && spLayer && M() && M().hasLayer(spLayer)) jt = '<div class="jn-lg-row">' + swatch(CAT.prov.c, "") + "<span>Jalan Provinsi Jawa Tengah</span></div>";
    el.innerHTML = (tol ? "<b>Jalan Tol</b>" + tol : "") + (jt ? '<b class="tl-lh">Jalan Provinsi</b>' + jt : "");
  }

  function count() {
    lblNames();
    ORDER.forEach(function (k) {
      var e = $("tlN_" + k); if (e) e.textContent = groups[k].getLayers().filter(function (l) { return !l.__sub; }).length + " ruas";
    });
  }

  /* ---------- atribut & popup ---------- */
  var NK = ["nama_ruas", "nm_ruas", "namaruas", "nama_jalan", "nama_tol", "nama_ruas_", "nama", "name", "ruas", "namrjl"];
  function pickName(t) {
    var keys = Object.keys(t || {}), low = {};
    keys.forEach(function (k) { low[k.toLowerCase()] = k; });
    for (var i = 0; i < NK.length; i++) { var v = t[low[NK[i]]]; if (v != null && String(v).trim()) return String(v).trim(); }
    for (var j = 0; j < keys.length; j++) { var kk = keys[j]; if (/nama|^nm_|ruas|name/i.test(kk) && typeof t[kk] === "string" && t[kk].trim()) return t[kk].trim(); }
    return "";
  }
  var SKIP = /^(objectid|fid|shape|globalid|gdb_|created|last_edited|st_length|st_area|id$)/i;

  function popup(k, src, t) {
    var c = CAT[k], nm = (src === "big" ? t.NAMRJL : pickName(t)) || t.name || t["name:id"] || t.ref || "(tanpa nama)";
    var r = "<b>" + esc(nm) + '</b><div style="color:' + c.c + ';font-weight:700">' + c.n + "</div>";
    var rows = [];
    if (src === "big") {
      var g = function (f) { var v = t[f]; return v == null ? "" : (LBL[f] && LBL[f][v]) || ""; };
      rows = [["Status", g("STARJL")], ["Kondisi", g("KONRJL")], ["Fungsi", g("FGSRJL")], ["Lajur", g("JPARJL")], ["Pengelola", t.KLLRJL]];
    } else if (src === "osm") {
      rows = [["No/Ref", t.ref], ["Operator", t.operator], ["Jalur", t.lanes], ["Kec. maks", t.maxspeed], ["Permukaan", t.surface], ["Rencana buka", t.opening_date], ["Mulai", t.start_date]];
    } else {
      Object.keys(t).forEach(function (f) {
        var v = t[f];
        if (rows.length >= 10 || SKIP.test(f) || v == null || v === "" || typeof v === "object" || (typeof v === "string" && v.trim() === String(nm))) return;
        rows.push([f.replace(/_/g, " "), typeof v === "number" ? Math.round(v * 1000) / 1000 : String(v).slice(0, 70)]);
      });
    }
    rows.forEach(function (f) { if (f[1] !== "" && f[1] != null) r += "<div><span style='color:#9fb0c8'>" + esc(f[0]) + ":</span> " + esc(f[1]) + "</div>"; });
    return r + '<span class="tl-src">' + (SRCN[src] || src) + "</span>";
  }

  /* ---------- bagian tol di LUAR Jawa Tengah ikut "Transparansi luar Jateng" ----------
     Peta dasar di luar Jateng dipudarkan oleh modul penutup (kunci petaqu_jateng_mask_v4: on, tp).
     Garis tol dipotong di batas Jateng; potongan di luar memakai opasitas = opasitas tol x tp penutup
     (penutup mati => tp diabaikan, garis tampil penuh). Cincin batas dibaca dari window.__pqJtS. */
  var JK = "petaqu_jateng_mask_v4", jtBox = null;
  function jtRings() {
    var S = window.__pqJtS; if (!S || !S.length) return null;
    if (!jtBox) {
      var b = [90, 180, -90, -180];
      S.forEach(function (r) { r.forEach(function (q) { if (q[0] < b[0]) b[0] = q[0]; if (q[1] < b[1]) b[1] = q[1]; if (q[0] > b[2]) b[2] = q[0]; if (q[1] > b[3]) b[3] = q[1]; }); });
      jtBox = b;
    }
    return S;
  }
  function inRing(y, x, r) {
    var c = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      var yi = r[i][0], xi = r[i][1], yj = r[j][0], xj = r[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function inJateng(q, S) {
    var b = jtBox;
    if (q[0] < b[0] || q[0] > b[2] || q[1] < b[1] || q[1] > b[3]) return false;
    for (var i = 0; i < S.length; i++) if (inRing(q[0], q[1], S[i])) return true;
    return false;
  }
  /* pecah garis menjadi potongan {g, out}; tanpa data batas => satu potongan "dalam" */
  function splitJt(g) {
    var S = jtRings(); if (!S) return [{ g: g, out: false }];
    var parts = [], cur = null, prev = null;
    for (var i = 0; i < g.length; i++) {
      var out = !inJateng(g[i], S);
      if (!cur || cur.out !== out) {
        cur = { g: prev && cur ? [prev] : [], out: out };
        parts.push(cur);
      }
      cur.g.push(g[i]); prev = g[i];
    }
    return parts.filter(function (p) { return p.g.length >= 2; });
  }
  var jtMask = null, jtMaskT = 0;
  function jtMaskLayer() {
    var m = M(); if (!m) return null;
    if (jtMask && jtMask.options && jtMask.options.pane === "jatengMaskPane") return jtMask;
    if (Date.now() - jtMaskT < 1500) return null; /* jangan memindai semua layer terlalu sering */
    jtMaskT = Date.now();
    m.eachLayer(function (l) { if (l.options && l.options.pane === "jatengMaskPane" && l.setStyle) jtMask = l; });
    return jtMask;
  }
  /* 1 = tampil penuh; <1 = pudar. Sumber utama: layer penutup yang sedang tampil di peta (nilai sebenarnya);
     cadangan: pengaturan tersimpan, dengan bawaan modul penutup (aktif, transparansi 75%) bila belum pernah diubah. */
  function outVis() {
    var m = M(), l = jtMaskLayer();
    if (l && m) {
      if (!m.hasLayer(l)) return 1;
      var fo = l.options.fillOpacity;
      return isFinite(fo) ? Math.min(1, Math.max(0, 1 - fo)) : 1;
    }
    var o = null;
    try { o = JSON.parse(localStorage.getItem(JK) || "null"); } catch (e) {}
    if (o && o.on === false) return 1;
    return o && isFinite(o.tp) ? Math.min(1, Math.max(0, +o.tp)) : 0.75;
  }
  function opOf(l) { return (l.__osm ? st.op * 0.75 : st.op) * (l.__out ? outVis() : 1); }
  var outSig = "";
  function outSync() {
    var sig = String(outVis()) + "|" + st.op;
    if (sig === outSig) return; outSig = sig;
    each(function (l) { if (l.__out && l.setStyle) l.setStyle({ opacity: opOf(l) }); });
  }

  var lastLine = 0; /* cadangan: penanda klik garis */
  /* els: [{id, s:'bm'|'big'|'osm'|'imp', p:{props}, g:[[lat,lng],...]}] */
  function draw(els, k) {
    var c = CAT[k], n = 0;
    els.forEach(function (e) {
      var key = k + e.s + e.id; if (seen[key] || !e.g || e.g.length < 2) return; seen[key] = 1;
      var t = e.p || {}, nm = (e.s === "big" ? t.NAMRJL : pickName(t)) || t.name || t.ref || "";
      var osm = e.s === "osm", w = osm ? Math.max(2, c.w - 1) : c.w;
      splitJt(e.g).forEach(function (part, pi) {
        var pl = L.polyline(part.g, { color: c.c, weight: w, opacity: 1, dashArray: c.d || null, lineCap: "round", lineJoin: "round", renderer: osm ? rendOsm : rend, pane: osm ? "pqJalanOsm" : "pqJalanPane" });
        if (e.s === "imp") pl.__imp = 1;
        if (pi === 0 && nm) pl.__nm = String(nm);
        if (pi > 0) pl.__sub = 1;
        if (osm) pl.__osm = 1;
        if (part.out) pl.__out = 1;
        pl.setStyle({ opacity: opOf(pl) });
        pl.bindPopup(popup(k, e.s, t));
        if (nm) pl.bindTooltip(esc(nm), { sticky: true, className: "tl-tip" });
        pl.on("mouseover", function () { pl.setStyle({ weight: w + 3 }); }).on("mouseout", function () { pl.setStyle({ weight: w }); });
        pl.on("click", function () { lastLine = Date.now(); });
        groups[k].addLayer(pl);
      });
      n++;
    });
    return n;
  }

  function rnd(a) { return Math.round(a * 1e5) / 1e5; }
  /* sebagian server ArcGIS mengabaikan outSR dan mengirim meter (Web Mercator): deteksi & ubah ke derajat */
  function ll(q) {
    var x = q[0], y = q[1];
    if (Math.abs(x) > 360 || Math.abs(y) > 90) {
      var R = 6378137;
      return [rnd((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI), rnd(x / R * 180 / Math.PI)];
    }
    return [rnd(y), rnd(x)];
  }
  function lines(geom) {
    if (!geom) return [];
    var parts = geom.type === "LineString" ? [geom.coordinates] : geom.type === "MultiLineString" ? geom.coordinates : [];
    return parts.map(function (pt) { return pt.map(ll); });
  }
  /* salt selalu dipakai sebagai awalan id agar id antar-layer/antar-sumber tidak bertabrakan */
  function fromGeo(fc, src, salt, keep) {
    var out = [];
    (fc.features || []).forEach(function (f) {
      var pr = f.properties || {};
      if (keep && !keep(pr)) return;
      var ps = lines(f.geometry), id0 = f.id != null ? f.id : (pr.OBJECTID != null ? pr.OBJECTID : pr.objectid);
      ps.forEach(function (g, j) {
        var id = salt + ":" + (id0 != null ? id0 : g[0][0] + "_" + g[0][1] + "_" + g.length) + "#" + j;
        out.push({ id: id, s: src, p: pr, g: g });
      });
    });
    return out;
  }

  /* ---------- jaringan ---------- */
  async function getJSON(url, opt) {
    var ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, 20000);
    try {
      var r = await fetch(url, Object.assign({ signal: ac.signal }, opt || {}));
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(to); }
  }

  /* ----- Bina Marga / BPJT (Kementerian PU): penemuan layer otomatis ----- */
  function classify(s) {
    s = String(s || "").toLowerCase();
    if (/gerbang|gardu|rest.?area|simpang|interchange|junction|tarif|cctv|titik|point|label|buffer|batas|jembatan/.test(s)) return null;
    if (/konstruksi|pembangunan|progres|progress|construction/.test(s)) return "kons";
    if (/rencana|rencum|rujt|ppjt|usulan|proposed|plan\b/.test(s)) return "renc";
    if (/operasi|operasional|beroperasi|existing|eksisting/.test(s)) return "tol";
    if (/tol/.test(s)) return "tol";
    return null;
  }
  async function bmFolder(f) {
    var j = await getJSON(BM + "/" + f + "?f=json");
    if (j.error) throw new Error(j.error.message || "folder " + f);
    return j.services || [];
  }
  async function bmLayers(svc) {
    var base = BM + "/" + svc.name + "/" + svc.type, j = await getJSON(base + "?f=json"), out = [];
    if (j.error) throw new Error(j.error.message || svc.name);
    var ls = (j.layers || []).filter(function (l) { return !l.subLayerIds; }).slice(0, 8);
    for (var i = 0; i < ls.length; i++) {
      var info = null;
      try { info = await getJSON(base + "/" + ls[i].id + "?f=json"); } catch (e) {}
      if (info && info.geometryType && info.geometryType !== "esriGeometryPolyline") continue;
      out.push({ u: base + "/" + ls[i].id, n: ls[i].name || "", svc: svc.name, st: !!(info && info.fields && info.fields.some(function (f) { return /^(status|stat_ruas|status_ruas|status_tol|tahap)$/i.test(f.name); })) });
    }
    return out;
  }
  async function bmDisc0() {
    try {
      var c = JSON.parse(localStorage.getItem(DK) || "null");
      if (c && c.ok && Date.now() - c.t < DTTL) return (disc = c);
    } catch (e) {}
    var d = { t: Date.now(), ok: 0, tol: [], kons: [], renc: [], prov: [] }, err = null, jobs = [];
    try { (await bmFolder("Tol")).forEach(function (s) { if (/^(MapServer|FeatureServer)$/.test(s.type)) jobs.push([s, null]); }); } catch (e) { err = e; }
    try {
      (await bmFolder("Hosted")).forEach(function (s) {
        if (/^(MapServer|FeatureServer)$/.test(s.type) && /jalan.?prov|prov.*jalan|jln.?prov/i.test(s.name)) jobs.push([s, "prov"]);
      });
    } catch (e) { err = err || e; }
    /* layanan yang terverifikasi ada di server Bina Marga: selalu disertakan bila belum terdaftar */
    [[{ name: "Tol/Jalan_Tol_Konstruksi", type: "MapServer" }, "kons"], [{ name: "Tol/rencana_umum_tol", type: "MapServer" }, "renc"], [{ name: "Hosted/Jalan_Provinsi_DIY", type: "FeatureServer" }, "prov"]].forEach(function (kn) {
      if (!jobs.some(function (j) { return j[0].name === kn[0].name; })) jobs.push(kn);
    });
    for (var i = 0; i < jobs.length; i++) {
      try {
        var ls = await bmLayers(jobs[i][0]);
        ls.forEach(function (l) { var k = jobs[i][1] || classify(l.svc + " " + l.n); if (k) d[k].push(l); });
      } catch (e) { err = err || e; }
    }
    d.ok = d.tol.length + d.kons.length + d.renc.length + d.prov.length;
    if (!d.ok) throw err || new Error("tidak ada layer ditemukan di server Bina Marga");
    try { localStorage.setItem(DK, JSON.stringify(d)); } catch (e) {}
    return (disc = d);
  }
  function bmDiscover(force) {
    if (force) { disc = null; discP = null; discFail = null; try { localStorage.removeItem(DK); } catch (e) {} }
    if (discFail && Date.now() - discFail.t < 60000) return Promise.reject(discFail.e);
    if (discP) return discP;
    discP = bmDisc0();
    discP.catch(function (e) { discP = null; discFail = { t: Date.now(), e: e }; });
    return discP;
  }

  async function getArc(l, k, bb) {
    var out = [], off = 0, tag = l.u.split("/").slice(-3).join("/");
    var keep = (k === "tol" && l.st) ? function (p) {
      var s = ""; for (var f in p) if (/^(status|stat_ruas|status_ruas|status_tol|tahap)$/i.test(f) && typeof p[f] === "string") s += " " + p[f];
      return !/konstruksi|pembangunan|sedang dibangun|rencana|akan dibangun|construction/i.test(s);
    } : null;
    for (var pg = 0; pg < 5; pg++) {
      var o = {
        where: "1=1", geometry: bb[1] + "," + bb[0] + "," + bb[3] + "," + bb[2], geometryType: "esriGeometryEnvelope",
        inSR: "4326", outSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "*", returnGeometry: "true",
        maxAllowableOffset: "0.00008", f: "geojson"
      };
      if (off) { o.resultOffset = String(off); o.resultRecordCount = "1000"; }
      var j = await getJSON(l.u + "/query?" + new URLSearchParams(o).toString());
      if (j.error) throw new Error(j.error.message || "ArcGIS error");
      var n = (j.features || []).length;
      out = out.concat(fromGeo(j, "bm", tag, keep));
      var more = j.exceededTransferLimit || (j.properties && j.properties.exceededTransferLimit);
      if (!more || !n) break;
      off += n;
    }
    return out;
  }

  async function getBM(k, bb) {
    var d = await bmDiscover(), ls = d[k] || [];
    if (!ls.length) throw new Error("server Bina Marga tidak punya layer untuk kategori ini");
    var rs = await Promise.allSettled(ls.map(function (l) { return getArc(l, k, bb); })), out = [], bad = 0, why = "";
    rs.forEach(function (r) { if (r.status === "fulfilled") out = out.concat(r.value); else { bad++; why = explain(r.reason); } });
    if (bad === rs.length) throw new Error(why);
    return out;
  }

  /* ----- BIG ----- */
  async function getBig(k, bb) {
    var out = [], off = 0;
    for (var pg = 0; pg < 5; pg++) {
      var p = new URLSearchParams({
        where: CAT[k].big, geometry: bb[1] + "," + bb[0] + "," + bb[3] + "," + bb[2], geometryType: "esriGeometryEnvelope",
        inSR: "4326", outSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: BIG_F, returnGeometry: "true",
        maxAllowableOffset: "0.0001", resultOffset: String(off), resultRecordCount: "1000", f: "geojson"
      });
      var j = await getJSON(BIG + "?" + p.toString());
      if (j.error) throw new Error(j.error.message || "BIG error");
      var n = (j.features || []).length;
      out = out.concat(fromGeo(j, "big", "big", null));
      var more = j.exceededTransferLimit || (j.properties && j.properties.exceededTransferLimit);
      if (!more || !n) break;
      off += n;
    }
    return out;
  }

  /* ----- OpenStreetMap ----- */
  async function getOsm(k, bb) {
    var q = "[out:json][timeout:25];way" + CAT[k].q + "(" + bb.join(",") + ");out tags geom;", err;
    for (var i = 0; i < OVP.length; i++) {
      try {
        var j = await getJSON(OVP[i], { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        return (j.elements || []).filter(function (e) { return e.geometry && e.geometry.length > 1; }).map(function (e) {
          return { id: "osm:" + e.id, s: "osm", p: e.tags || {}, g: e.geometry.map(function (p) { return [rnd(p.lat), rnd(p.lon)]; }) };
        });
      } catch (e) { err = e; }
    }
    throw err;
  }

  function saveCache() {
    for (var n = 0; n < 8; n++) {
      try { localStorage.setItem(CK, JSON.stringify(cache)); return; } catch (er) {
        var ks = Object.keys(cache).sort(function (a, b) { return cache[a].t - cache[b].t; });
        if (!ks.length) return;
        ks.slice(0, Math.max(1, Math.ceil(ks.length / 3))).forEach(function (kk) { delete cache[kk]; });
      }
    }
  }

  var FETCH = { bm: getBM, big: getBig, osm: getOsm };

  /* satu kotak per kategori: coba sumber berurutan; turun ke berikutnya hanya bila sumber GAGAL */
  async function loadCell(k, cx, cy) {
    var id = k + ":" + cx + ":" + cy; if (cells[id]) return null; cells[id] = 1;
    var c = cache[id], res = null;
    if (c && Date.now() - c.t < TTL) { draw(c.e, k); res = { src: c.s, n: c.e.length }; }
    else {
      var s0 = cy * CELL, w0 = cx * CELL, bb = [s0, w0, s0 + CELL, w0 + CELL], errs = [];
      var chain = CAT[k].chain, emptyOk = null;
      for (var i = 0; i < chain.length && !res; i++) {
        var src = chain[i];
        try {
          var els = await FETCH[src](k, bb);
          stat(src, true);
          /* layer provinsi Bina Marga yang terverifikasi hanya DIY: kosong di Jateng ≠ tidak ada jalan → lanjut ke sumber berikut */
          if (!els.length && k === "prov" && i < chain.length - 1) { emptyOk = src; continue; }
          draw(els, k); res = { src: src, n: els.length };
          if (els.length < 1500) { cache[id] = { t: Date.now(), s: src, e: els }; saveCache(); }
        } catch (e) { stat(src, false, explain(e)); errs.push(src + ": " + explain(e)); }
      }
      if (!res && emptyOk) res = { src: emptyOk, n: 0 };
      if (!res) { delete cells[id]; throw new Error(errs.join(" | ")); }
    }
    /* pelengkap OSM (opsional) */
    if (useOsm(k) && res.src !== "osm") {
      var oid = "osm:" + id, oc = cache[oid];
      try {
        if (oc && Date.now() - oc.t < TTL) draw(oc.e, k);
        else {
          var s1 = cy * CELL, w1 = cx * CELL, oe = await getOsm(k, [s1, w1, s1 + CELL, w1 + CELL]);
          stat("osm", true); draw(oe, k);
          if (oe.length < 1500) { cache[oid] = { t: Date.now(), s: "osm", e: oe }; saveCache(); }
        }
      } catch (e) { stat("osm", false, explain(e)); }
    }
    return res;
  }

  function resetCells() { cells = {}; }
  function clearOsm() {
    ORDER.forEach(function (k) { groups[k].eachLayer(function (l) { if (l.__osm) groups[k].removeLayer(l); }); });
    Object.keys(seen).forEach(function (key) { if (/^(tol|kons|renc|prov)osm/.test(key)) delete seen[key]; });
    count();
  }

  async function fetchView() {
    var m = M(); if (!m || !st.on) return;
    var z = m.getZoom(), b = m.getBounds(), jobs = [], low = false;
    ORDER.forEach(function (k) {
      if (!st.show[k]) return;
      if (z < CAT[k].z) { low = true; return; }
      for (var x = Math.floor(b.getWest() / CELL); x <= Math.floor(b.getEast() / CELL); x++)
        for (var y = Math.floor(b.getSouth() / CELL); y <= Math.floor(b.getNorth() / CELL); y++) {
          if (jobs.length > 40) continue;
          jobs.push([k, x, y]);
        }
    });
    var s = $("tlSt"), fail = 0, used = {}, failMsg = "";
    if (s) s.textContent = jobs.length ? "Memuat data…" : (low ? "Perbesar peta untuk menampilkan lapisan ini." : "");
    for (var i = 0; i < jobs.length; i += 3) {
      await Promise.all(jobs.slice(i, i + 3).map(function (j) {
        return loadCell(j[0], j[1], j[2]).then(function (r) { if (r) used[r.src] = (used[r.src] || 0) + 1; }).catch(function (e) { fail++; failMsg = explain(e); });
      }));
      count();
    }
    count();
    if (s && jobs.length) {
      var parts = Object.keys(used).map(function (u) { return SRCN[u] + " (" + used[u] + " kotak)"; });
      var msg = parts.length ? "Sumber: " + parts.join(", ") + "." : "Tidak ada data baru.";
      if (used.osm && !used.bm) msg += " Data resmi Kementerian PU/BIG belum terjangkau; yang tampil dari OpenStreetMap sebagai cadangan.";
      if (fail) msg += " " + fail + " kotak gagal dimuat (" + failMsg + "). Geser peta untuk mencoba lagi atau tekan “Uji koneksi sumber”.";
      s.textContent = msg;
    }
  }

  /* ---------- WMS Satu Peta / Geoportal Borobudur Jateng ---------- */
  function spStatus(t) { var e = $("tlSpSt"); if (e) e.textContent = t || ""; }

  function spSync(discover) {
    var m = M(); if (!m) return;
    spFeat = {}; spWfsKey = ""; lblNames();
    if (spLayer) { m.removeLayer(spLayer); spLayer = null; }
    if (!st.sp.on || !st.on) { spStatus(""); legend(); return; }
    if (!st.sp.layer) { if (discover) spDiscover(false); else spStatus("Isi nama layer, atau tekan “Cari layer otomatis”."); return; }
    mkPane(m, "pqJalanWms", 385);
    spLayer = L.tileLayer.wms(st.sp.ep || SP, { layers: st.sp.layer, styles: "", format: "image/png", transparent: true, version: "1.1.1", pane: "pqJalanWms", opacity: st.op, maxZoom: 22, attribution: "© Pemprov Jateng – Geoportal Borobudur (Palapa) · Dinas PU BM-CK" });
    spLayer.on("tileerror", function () { stat("sp", false, "tile gagal: periksa nama layer atau koneksi"); spStatus("Sebagian tile gagal dimuat. Periksa nama layer atau koneksi."); });
    spLayer.on("tileload", function () { stat("sp", true); });
    spLayer.addTo(m); spStatus("Layer: " + st.sp.layer); legend(); spWfs();
  }

  var SP_NO = /apill|lampu|rambu|rppj|perlintasan|halte|jembatan|pju|penerangan|terminal|pelabuhan|kereta|\brel\b|bandara|kecelakaan|rawan|\bdkr\b|dkr_|lalu.?lintas|lalin|volume|kondisi.?(?:jalan)?.?rusak/i;
  function spScore(x) {
    var s = (x.name + " " + x.title).toLowerCase(), n = 0;
    if (/jalan provinsi kewenangan|kewenangan.*prov.*jalan|jalan.*kewenangan.*prov/.test(s)) n += 10;
    if (/jalan|\bjln\b|jln_/.test(s)) n += 3;
    if (/prov/.test(s)) n += 3;
    if (/_ln_|\bln\b|garis|line/.test(s)) n += 2;
    if (/_pt_|_ar_/.test(s)) n -= 5;
    if (/50000|50k/.test(s)) n += 1;
    return n;
  }
  function spParse(txt, ep) {
    var xml = new DOMParser().parseFromString(txt, "text/xml"), all = [];
    xml.querySelectorAll("Layer").forEach(function (l) {
      var n = null, t = null;
      for (var i = 0; i < l.children.length; i++) { var cn = l.children[i].localName; if (cn === "Name" && !n) n = l.children[i]; if (cn === "Title" && !t) t = l.children[i]; }
      if (n) all.push({ name: n.textContent, title: t ? t.textContent : "", ep: ep });
    });
    return all;
  }
  async function spFetchCaps(ep) {
    var ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, 20000), r;
    try { r = await fetch(ep + "?service=WMS&request=GetCapabilities&version=1.3.0", { signal: ac.signal }); } finally { clearTimeout(to); }
    if (!r.ok) throw new Error("HTTP " + r.status);
    return spParse(await r.text(), ep);
  }
  /* membaca GetCapabilities dari endpoint workspace "palapa" dan endpoint global; gagal bila CORS diblokir */
  async function spCaps() {
    var all = [], err = null;
    var rs = await Promise.allSettled([spFetchCaps(SP), spFetchCaps(SPG)]);
    rs.forEach(function (r) { if (r.status === "fulfilled") all = all.concat(r.value); else err = err || r.reason; });
    if (!all.length) throw err || new Error("daftar layer kosong");
    var seenN = {}; spAll = all.filter(function (x) { var k = x.name.replace(/^[^:]+:/, ""); if (seenN[k]) return false; seenN[k] = 1; return true; });
    spNames = spAll.filter(function (x) { return /jalan|\bjln|ruas/i.test(x.name + " " + x.title) && !SP_NO.test(x.name + " " + x.title); })
      .sort(function (a, b) { return spScore(b) - spScore(a); });
    var dl = $("tlSpList"); if (dl) dl.innerHTML = spAll.map(function (x) { return '<option value="' + esc(x.name) + '">' + esc(x.title) + "</option>"; }).join("");
    spCand();
    stat("sp", true);
    return spNames.length;
  }
  function spCand() {
    var el = $("tlSpCand"); if (!el) return;
    el.innerHTML = spNames.slice(0, 8).map(function (x, i) {
      return '<button class="tl-p" type="button" data-sp="' + i + '" title="' + esc(x.name) + '">' + esc(x.title || x.name) + "</button>";
    }).join("");
  }
  function spPick(x) {
    st.sp.layer = x.name; st.sp.ep = x.ep === SP ? "" : x.ep; st.sp.on = true;
    $("tlSpLayer").value = x.name; $("tlSpOn").checked = true; save(); spSync(false);
    spStatus("Dipakai: " + (x.title || x.name) + " (" + x.name + ").");
  }

  async function spDiscover() {
    spStatus("Mencari layer di Geoportal Borobudur (Satu Peta Jateng)…");
    try {
      await spCaps();
      var best = spNames[0];
      if (!best) { spStatus("Dari " + spAll.length + " layer, tidak ada yang cocok sebagai ruas jalan provinsi. Ketik kata kunci (mis. “jalan”) di kolom nama layer untuk menelusuri semua layer, atau tempel nama layer dari Geoportal."); return; }
      spPick(best);
      spStatus("Dipakai: " + (best.title || best.name) + " (" + best.name + "). " + (spNames.length > 1 ? "Kandidat lain ada di bawah — klik untuk mengganti." : ""));
    } catch (e) {
      stat("sp", false, explain(e));
      spStatus("Daftar layer tidak bisa dibaca dari browser (" + explain(e) + "). Isi nama layer manual: buka Geoportal Borobudur, pilih “Jalan Provinsi Kewenangan Provinsi Jawa Tengah Skala 1:50000”, salin nama layernya (mis. palapa:…), tempel di kolom di atas.");
    }
  }

  /* ---------- uji koneksi ---------- */
  async function testSources() {
    var o = $("tlTestOut"), out = [];
    function show() { o.innerHTML = out.join("<br>"); }
    async function t(name, fn) {
      out.push("… " + esc(name)); show();
      var i = out.length - 1;
      try { var m = await fn(); out[i] = "✓ <b>" + esc(name) + "</b>: " + esc(m); }
      catch (e) { out[i] = "✗ <b>" + esc(name) + "</b>: " + esc(explain(e)); }
      show();
    }
    o.textContent = "Menguji…";
    await t("Bina Marga / BPJT (Kementerian PU)", async function () {
      var d = await bmDiscover(true); stat("bm", true);
      return "layer tol " + d.tol.length + ", konstruksi " + d.kons.length + ", rencana " + d.renc.length + ", provinsi " + d.prov.length;
    });
    await t("BIG Rupabumi", async function () {
      var j = await getJSON(BIG + "?where=1%3D0&returnCountOnly=true&f=json");
      if (j.error) throw new Error(j.error.message || "error"); stat("big", true); return "terjangkau";
    });
    await t("Satu Peta Jateng (GetCapabilities)", async function () { var n = await spCaps(); return n + " layer jalan terbaca"; });
    resetCells(); fetchView();
  }

  /* ---------- impor GeoJSON ---------- */
  function impStatus(t) { var e = $("tlImpSt"); if (e) e.textContent = t || ""; }

  function addImported(cat, fc, persist) {
    var els = fromGeo(fc, "imp", "i" + Date.now(), null);
    var n = draw(els, cat);
    if (persist) {
      imported[cat] = (imported[cat] || []).concat(els.map(function (e) { return { id: e.id, s: "imp", p: e.p, g: e.g }; }));
      try { localStorage.setItem(IK, JSON.stringify(imported)); return n; } catch (er) { return -n; }
    }
    return n;
  }

  function impFile(f) {
    if (!f) return;
    var cat = $("tlImpCat").value, rd = new FileReader();
    rd.onload = function () {
      try {
        var j = JSON.parse(rd.result);
        if (j.type !== "FeatureCollection" && j.type !== "Feature") throw new Error("bukan GeoJSON");
        var fc = j.type === "Feature" ? { features: [j] } : j;
        var n = addImported(cat, fc, true);
        st.show[cat] = true; save(); sync(); count();
        $("tlPanel").querySelector('input[data-k="' + cat + '"]').checked = true;
        impStatus(n > 0 ? n + " ruas diimpor ke “" + CAT[cat].n + "” dan disimpan di perangkat." : Math.abs(n) + " ruas diimpor, tetapi terlalu besar untuk disimpan; hilang saat halaman ditutup.");
        var bl = groups[cat].getBounds(); if (bl.isValid() && M()) M().fitBounds(bl, { maxZoom: 12 });
      } catch (e) { impStatus("Gagal membaca file: " + e.message + ". Pastikan GeoJSON berisi garis (LineString) dalam koordinat WGS84."); }
    };
    rd.readAsText(f);
  }

  function clearImport() {
    imported = {}; try { localStorage.removeItem(IK); } catch (e) {}
    ORDER.forEach(function (k) {
      groups[k].eachLayer(function (l) { if (l.__imp) groups[k].removeLayer(l); });
    });
    Object.keys(seen).forEach(function (key) { if (/^(tol|kons|renc|prov)imp/.test(key)) delete seen[key]; });
    count();
    impStatus("Impor dihapus. Muat ulang halaman untuk membersihkan sepenuhnya.");
  }

  /* ---------- label nama ruas di sepanjang garis ----------
     Satu label per ruas (diputar mengikuti arah garis), dengan penyaringan tumpang-tindih. Hanya garis vektor yang punya nama;
     gambar WMS Geoportal tidak memuat atribut sehingga tidak bisa diberi label. */
  var nmGroup = null, nmT = 0;
  function lblNames() { clearTimeout(nmT); nmT = setTimeout(nmDraw, 120); }
  function nmDraw() {
    var m = M(); if (!m) return;
    if (!nmGroup) nmGroup = L.layerGroup().addTo(m);
    nmGroup.clearLayers();
    if (!st.on || st.nm === false || m.getZoom() < 11) return;
    var sz = m.getSize(), placed = [], byName = {}, made = 0;
    function flat(a, o) { (a || []).forEach(function (x) { if (Array.isArray(x) && typeof x[0] !== "number") flat(x, o); else o.push(x); }); return o; }
    function tryLabel(nm, ll) {
      if (made >= 120 || !nm || ll.length < 2) return;
      var step = Math.max(1, Math.ceil(ll.length / 40)), pts = [], i;
      for (i = 0; i < ll.length; i += step) pts.push(m.latLngToContainerPoint(ll[i]));
      pts.push(m.latLngToContainerPoint(ll[ll.length - 1]));
      var len = 0, cum = [0];
      for (i = 1; i < pts.length; i++) { len += pts[i].distanceTo(pts[i - 1]); cum.push(len); }
      var w = nm.length * 6.4 + 8, h = 15;
      if (len < w * 0.9) return;
      var half = len / 2, j = 1; while (j < pts.length - 1 && cum[j] < half) j++;
      var a = pts[Math.max(0, j - 1)], c = pts[Math.min(pts.length - 1, j)];
      var f = (half - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1), cx = a.x + (c.x - a.x) * f, cy = a.y + (c.y - a.y) * f;
      if (cx < 10 || cy < 10 || cx > sz.x - 10 || cy > sz.y - 10) return;
      var ang = Math.atan2(c.y - a.y, c.x - a.x) * 180 / Math.PI; if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
      var rc = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], bad = false;
      placed.forEach(function (q) { if (!(rc[2] < q[0] || rc[0] > q[2] || rc[3] < q[1] || rc[1] > q[3])) bad = true; });
      (byName[nm] = byName[nm] || []).forEach(function (q) { if (Math.abs(q[0] - cx) + Math.abs(q[1] - cy) < 320) bad = true; });
      if (bad) return;
      placed.push(rc); byName[nm].push([cx, cy]); made++;
      L.marker(m.containerPointToLatLng([cx, cy]), { interactive: false, keyboard: false, zIndexOffset: -500,
        icon: L.divIcon({ className: "tl-lab", iconSize: [0, 0], html: '<span style="transform:translate(-50%,-50%) rotate(' + ang.toFixed(1) + 'deg)">' + esc(nm) + "</span>" }) }).addTo(nmGroup);
    }
    var vb = m.getBounds();
    ORDER.forEach(function (k) {
      if (!st.show[k] || !groups[k] || !m.hasLayer(groups[k])) return;
      groups[k].eachLayer(function (pl) {
        if (!pl.__nm) return;
        var b = pl.getBounds && pl.getBounds(); if (!b || !vb.intersects(b)) return;
        tryLabel(pl.__nm, flat(pl.getLatLngs(), []));
      });
    });
    /* garis WMS Geoportal: nama diambil lewat WFS (layer yang sama) */
    if (st.sp.on && st.sp.layer) Object.keys(spFeat).forEach(function (id) { var e = spFeat[id]; tryLabel(e.nm, e.g); });
  }

  /* ---------- nama ruas untuk layer WMS Geoportal (via WFS dari layer yang sama) ---------- */
  var spFeat = {}, spWfsKey = "", spWfsBusy = false;
  async function spWfs() {
    var m = M();
    if (!m || !st.on || !st.sp.on || !st.sp.layer || st.nm === false || m.getZoom() < 11 || spWfsBusy) return;
    var b = m.getBounds().pad(0.15), key = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(function (v) { return v.toFixed(2); }).join(",");
    if (key === spWfsKey) return;
    spWfsKey = key; spWfsBusy = true;
    try {
      var base = (st.sp.ep || SP).replace(/\/wms\/?$/i, "/wfs");
      var url = base + "?service=WFS&version=1.0.0&request=GetFeature&typeName=" + encodeURIComponent(st.sp.layer) + "&outputFormat=application%2Fjson&srsName=EPSG%3A4326&maxFeatures=600&bbox=" +
        [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(rnd).join(",") + ",EPSG%3A4326";
      var fc = await getJSON(url), els = fromGeo(fc, "sp", "sp", null), n = 0, noName = 0;
      els.forEach(function (e) {
        if (spFeat[e.id]) return;
        var nm = pickName(e.p); if (!nm) { noName++; return; }
        spFeat[e.id] = { nm: nm, g: e.g }; n++;
      });
      var ks = Object.keys(spFeat); if (ks.length > 3000) ks.slice(0, ks.length - 3000).forEach(function (kx) { delete spFeat[kx]; });
      stat("sp", true);
      spStatus("Layer: " + st.sp.layer + " · label ruas: " + ks.length + (els.length && !ks.length ? " (atribut nama tidak ditemukan pada " + noName + " garis)" : ""));
      lblNames();
    } catch (e) {
      spWfsKey = "";
      spStatus("Layer: " + st.sp.layer + " · label ruas gagal (WFS: " + explain(e) + ")");
    } finally { spWfsBusy = false; }
  }

  /* pane harus ada di kontainer yang sama dengan overlayPane (pada leaflet-rotate = rotatePane), agar ikut berputar
     bersama peta dan tetap berada DI BAWAH popup/marker (yang berada di norotatePane). */
  function mkPane(m, name, z, nopt) {
    var pn = m.getPane(name);
    if (!pn) { var ov = m.getPane("overlayPane"); pn = m.createPane(name, ov && ov.parentNode ? ov.parentNode : undefined); }
    pn.style.zIndex = z; if (nopt) pn.style.pointerEvents = "none";
    return pn;
  }

  /* ---------- label di atas layer ----------
     Pada basemap Google Hybrid, nama tempat sudah "tertanam" di ubin dasar sehingga tertutup garis overlay.
     Solusi: ubin Google khusus label/jalan (lyrs=h, transparan, posisi identik) digambar di pane z=450,
     di atas semua garis overlay tetapi di bawah marker, tooltip & popup. */
  var lblLayer = null;
  function lblSync() {
    var m = M(); if (!m) return;
    var base = ""; try { base = typeof currentBaseId !== "undefined" ? currentBaseId : ""; } catch (e) {}
    var want = st.lbl !== false && base === "google_hybrid";
    if (want && !lblLayer) {
      mkPane(m, "pqJalanLbl", 450, true);
      lblLayer = L.tileLayer("https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}", { pane: "pqJalanLbl", subdomains: ["mt0", "mt1", "mt2", "mt3"], maxNativeZoom: 20, maxZoom: 22, keepBuffer: 2, updateWhenIdle: true, interactive: false }).addTo(m);
    } else if (!want && lblLayer) { m.removeLayer(lblLayer); lblLayer = null; }
  }

  function init() {
    var m = M();
    if (st.sp.layer && SP_NO.test(st.sp.layer)) { st.sp.layer = ""; st.sp.ep = ""; st.sp.on = false; save(); } /* bersihkan pilihan lama yang salah (mis. titik rawan kecelakaan) */
    mkPane(m, "pqJalanOsm", 408);
    mkPane(m, "pqJalanPane", 410);
    rend = L.canvas({ pane: "pqJalanPane", padding: 0.3 });
    rendOsm = L.canvas({ pane: "pqJalanOsm", padding: 0.3 });
    ORDER.forEach(function (k) { groups[k] = L.featureGroup(); });
    build(); sync();
    try { imported = JSON.parse(localStorage.getItem(IK) || "{}") || {}; } catch (e) { imported = {}; }
    var ni = 0; Object.keys(imported).forEach(function (k) { if (CAT[k]) ni += draw(imported[k], k); });
    if (ni) impStatus(ni + " ruas hasil impor dipulihkan.");
    count(); spSync(false); fetchView(); lblSync(); setInterval(lblSync, 800); setInterval(outSync, 500);
    m.on("moveend zoomend", lblNames);
    m.on("moveend", function () { clearTimeout(timer); timer = setTimeout(function () { fetchView(); spWfs(); }, 600); });
    window.__pqJalanDebug = { state: st, status: SS, discovery: function () { return disc; }, test: testSources };
  }

  /* API warna adaptif (dipakai petaqu-warna.js): ubah CAT[k].c lalu panggil recolor() */
  window.PQ_JALAN = {
    CAT: CAT,
    recolor: function () {
      ORDER.forEach(function (k) { if (groups[k]) groups[k].eachLayer(function (pl) { pl.setStyle({ color: CAT[k].c }); }); });
      try { legend(); } catch (e) {}
      document.querySelectorAll(".tl-r input[data-k]").forEach(function (inp) {
        var k = inp.getAttribute("data-k");
        if (CAT[k] && inp.parentNode) inp.parentNode.style.setProperty("--c", CAT[k].c);
      });
    }
  };

  var tries = 0, iv = setInterval(function () {
    tries++;
    if (window.L && M() && document.body) { clearInterval(iv); init(); }
    else if (tries > 100) clearInterval(iv);
  }, 300);
})();
