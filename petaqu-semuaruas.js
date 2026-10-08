/* PETAQU — Semua Ruas Semua Kabupaten di panel Ruas Jalan.
   Masalah: daftar "Ruas Jalan" hanya memuat 46 ruas (Banyumas & Cilacap), padahal data Jalan Nasional
   Jateng–DIY di aplikasi memuat 296 ruas di 40 kabupaten/kota.
   Solusi: bagian baru di bawah daftar ruas, dikelompokkan per kabupaten/kota (data yang SAMA dengan panel
   "Jalan Nasional" & "Kabupaten", tanpa menggandakan data):
     • Satu bagian "Jalan Nasional · Semua Kabupaten" — filter provinsi, urutan A–Z / terpanjang, ON/OFF semua.
     • Tiap kabupaten/kota = grup (jumlah ruas, km). Klik grup untuk membuka daftar ruasnya.
     • Tiap ruas: klik = tampil di peta + zoom; saklar = tampil/sembunyi; tombol "+ STA" = jadikan ruas penuh
       (titik STA tiap 50 m, bisa ekspor/PDF/IRI/animasi seperti ruas lain). Ruas yang sudah punya data STA
       (mis. Banyumas & Cilacap) ditandai "STA" dan langsung membuka ruas aslinya — tidak digandakan.
     • Terhubung dengan kotak cari & filter kabupaten di atas daftar.
   Tidak mengubah data-ruas.js maupun logika lama; hanya menambah bagian di sidebar. */
(function () {
  "use strict";
  if (window.__pqSemuaRuas) return;
  window.__pqSemuaRuas = 1;

  var KEY = "petaqu_semuaruas_v1";
  var STEP_M = 50;                 /* jarak titik STA saat ruas dijadikan ruas penuh */
  var DIY = { "Kulon Progo": 1, "Bantul": 1, "Gunungkidul": 1, "Sleman": 1, "Kota Yogyakarta": 1 };

  var st = { open: true, groups: {}, on: {}, prov: "", sort: "az" };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) {}
  st.groups = st.groups || {}; st.on = st.on || {};
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n, d) { return Number(n).toLocaleString("id-ID", { maximumFractionDigits: d == null ? 1 : d }); }
  function note(m, err) { try { if (typeof toast === "function") toast(m, !!err); } catch (e) {} }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
  function norm(s) { return String(s || "").toLowerCase().replace(/^\s*\d+\s*\.\s*/, "").replace(/[^a-z0-9]+/g, ""); }
  function title(s) {
    return String(s || "").toLowerCase()
      .replace(/(^|[\s(\-\/.])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); })
      .replace(/\bJln\b\.?/g, "Jl.").replace(/\b(Sp|Bts|Kab|Prov|Jl|Ir|Dr|Mt|Kh|Rs|Kp)\b(?!\.)/g, "$1.")
      .replace(/\s+/g, " ").replace(/\/\s+/g, "/").replace(/\s+\)/g, ")").replace(/\)\s*\(/g, ") (").trim()
      .replace(/\.\./g, ".").replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix)\b/g, function (m) { return m.toUpperCase(); });
  }

  /* ---------- data (dipakai ulang dari blok JSON yang sudah ada di index.html) ---------- */
  var JN, KB;
  try {
    JN = JSON.parse($("jn-data").textContent);
    KB = JSON.parse($("kb-data").textContent);
  } catch (e) { console.error("SemuaRuas: data Jalan Nasional tidak ditemukan", e); return; }
  var SAT = JN.sat, RUAS = JN.r;

  function decode(str) {
    var i = 0, lat = 0, lng = 0, out = [];
    while (i < str.length) {
      var b, sh = 0, r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      lat += (r & 1) ? ~(r >> 1) : (r >> 1);
      sh = 0; r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      lng += (r & 1) ? ~(r >> 1) : (r >> 1);
      out.push([lat / 1e5, lng / 1e5]);
    }
    return out;
  }
  function kabLabel(k) { return k.t === "Kab." ? "Kabupaten " + k.n : (/^Kota\b/.test(k.n) ? k.n : "Kota " + k.n); }

  var spanCount = {};
  KB.forEach(function (k) { k.r.forEach(function (r) { spanCount[r[0]] = (spanCount[r[0]] || 0) + 1; }); });

  var GROUPS = KB.map(function (k, ki) {
    var label = kabLabel(k), prov = DIY[k.n] ? "diy" : "jt";
    var entries = k.r.map(function (r) {
      var ji = r[0], R = RUAS[ji];
      return {
        key: "j" + ji + "k" + ki, id: "jalnas-" + ji + "-" + slug(k.n), ji: ji, ki: ki,
        name: title(R[0]), rawName: R[0], link: R[1] || "", km: r[1], skKm: R[2], lintas: R[3],
        provName: R[4], parts: r[2], multi: spanCount[ji] > 1, kab: label, kabShort: k.n
      };
    });
    return {
      ki: ki, key: "g" + ki, name: label, short: k.n, prov: prov, entries: entries,
      km: entries.reduce(function (s, e) { return s + e.km; }, 0)
    };
  });
  var ENTRY = {};
  GROUPS.forEach(function (g) { g.entries.forEach(function (e) { ENTRY[e.key] = e; }); });
  var TOTAL_RUAS = RUAS.length;   /* ruas unik (satu ruas bisa melewati beberapa kabupaten) */
  var TOTAL_KM = GROUPS.reduce(function (s, g) { return s + g.km; }, 0);

  /* ---------- gaya ---------- */
  var css = document.createElement("style");
  css.id = "pqSemuaCss";
  css.textContent = [
    "#pqAllRuas{margin:10px 6px 14px;border:1px solid var(--line,#1e2938);border-radius:12px;background:var(--panel,#0f1521);overflow:hidden}",
    "#pqAllRuas .sr-h{display:flex;align-items:center;gap:9px;padding:10px 12px;cursor:pointer;user-select:none;background:linear-gradient(135deg,rgba(34,211,238,.12),rgba(168,85,247,.08))}",
    "#pqAllRuas .sr-h>i{color:var(--cyan,#22d3ee);font-size:14px}",
    "#pqAllRuas .sr-h b{display:block;font-size:12.5px;color:var(--text,#e6edf5)}",
    "#pqAllRuas .sr-h small{display:block;font-size:10.5px;color:var(--text-dim,#7c8aa0);margin-top:1px}",
    "#pqAllRuas .sr-h .sr-chev{margin-left:auto;transition:transform .15s;color:var(--text-dim,#7c8aa0);font-size:12px}",
    "#pqAllRuas.open .sr-h .sr-chev{transform:rotate(90deg)}",
    "#pqAllRuas .sr-body{display:none;padding:8px 8px 10px}",
    "#pqAllRuas.open .sr-body{display:block}",
    "#pqAllRuas .sr-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}",
    "#pqAllRuas .sr-chip,#pqAllRuas .sr-btn{padding:4px 10px;border-radius:999px;border:1px solid var(--line,#1e2938);background:transparent;color:var(--text-dim,#7c8aa0);font:700 10.5px var(--mono,system-ui);cursor:pointer;line-height:1.4}",
    "#pqAllRuas .sr-chip.on{background:rgba(34,211,238,.16);border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}",
    "#pqAllRuas .sr-btn{border-radius:8px;color:var(--text,#e6edf5)}",
    "#pqAllRuas .sr-btn:hover,#pqAllRuas .sr-chip:hover{border-color:var(--cyan,#22d3ee)}",
    "#pqAllRuas .sr-btn.pri{background:var(--cyan-dim,#0e7490);border-color:var(--cyan-dim,#0e7490);color:#fff}",
    "#pqAllRuas .sr-sp{flex:1}",
    "#pqAllRuas .sr-g{border:1px solid var(--line,#1e2938);border-radius:10px;margin-bottom:5px;background:var(--panel-2,#131a28);overflow:hidden}",
    "#pqAllRuas .sr-g.empty{opacity:.55}",
    "#pqAllRuas .sr-gh{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;user-select:none}",
    "#pqAllRuas .sr-gh .sr-chev{font-size:10px;color:var(--text-dim,#7c8aa0);transition:transform .15s;width:10px}",
    "#pqAllRuas .sr-g.open .sr-gh .sr-chev{transform:rotate(90deg)}",
    "#pqAllRuas .sr-gh .t{flex:1;min-width:0}",
    "#pqAllRuas .sr-gh .t b{display:block;font-size:12px;color:var(--text,#e6edf5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#pqAllRuas .sr-gh .t small{font-size:10.5px;color:var(--text-dim,#7c8aa0)}",
    "#pqAllRuas .sr-gb{display:none;padding:2px 6px 8px}",
    "#pqAllRuas .sr-g.open .sr-gb{display:block}",
    "#pqAllRuas .sr-tools{display:flex;gap:6px;flex-wrap:wrap;padding:4px 2px 7px}",
    "#pqAllRuas .sr-r{display:flex;align-items:flex-start;gap:8px;padding:8px 6px;border-top:1px solid var(--line,#1e2938);cursor:pointer;border-radius:6px}",
    "#pqAllRuas .sr-r:hover{background:rgba(255,255,255,.04)}",
    "#pqAllRuas .sr-sw{flex:none;width:10px;height:10px;border-radius:50%;margin-top:4px;box-shadow:0 0 6px currentColor}",
    "#pqAllRuas .sr-in{flex:1;min-width:0}",
    "#pqAllRuas .sr-n{font-size:12px;color:var(--text,#e6edf5);line-height:1.3;word-break:break-word}",
    "#pqAllRuas .sr-m{font-size:10.5px;color:var(--text-dim,#7c8aa0);margin-top:2px;display:flex;flex-wrap:wrap;gap:3px 8px;align-items:center}",
    "#pqAllRuas .sr-ok{color:#34d399;font-weight:700}",
    "#pqAllRuas .sr-add{padding:2px 8px;border-radius:999px;border:1px solid var(--cyan-dim,#0e7490);background:transparent;color:var(--cyan,#22d3ee);font:700 10px var(--mono,system-ui);cursor:pointer}",
    "#pqAllRuas .sr-add:hover{background:var(--cyan-dim,#0e7490);color:#fff}",
    "#pqAllRuas .sr-sw2{flex:none;width:34px;height:19px;border-radius:20px;background:var(--line,#1e2938);position:relative;border:none;cursor:pointer;margin-top:2px;padding:0}",
    "#pqAllRuas .sr-sw2:after{content:'';position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;top:2px;left:2px;transition:.15s}",
    "#pqAllRuas .sr-sw2.on{background:var(--cyan-dim,#0e7490)}",
    "#pqAllRuas .sr-sw2.on:after{left:17px;background:var(--cyan,#22d3ee)}",
    "#pqAllRuas .sr-sw2.part{background:#5b6b82}",
    "#pqAllRuas .sr-sw2.part:after{left:10px}",
    "#pqAllRuas .sr-none{padding:14px 8px;text-align:center;font-size:11.5px;color:var(--text-dim,#7c8aa0)}",
    "#pqAllRuas .sr-note{font-size:10.5px;color:var(--text-dim,#7c8aa0);padding:2px 2px 8px;line-height:1.45}",
    ".sr-pop-add{margin-top:7px;padding:5px 11px;border-radius:8px;border:1px solid #0e7490;background:#0e7490;color:#fff;font:700 11px system-ui;cursor:pointer}"
  ].join("\n");
  document.head.appendChild(css);

  /* ---------- peta ---------- */
  function gmap() { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } }
  function ready() {
    try { return !!(window.L && gmap() && gmap().getPane && typeof roads !== "undefined" && roads && $("roadList") && $("roadListWrap")); }
    catch (e) { return false; }
  }

  var LAY = null, PL = {};
  function layer() { if (!LAY) LAY = L.featureGroup().addTo(gmap()); return LAY; }
  function popupHtml(e) {
    var s = SAT[e.lintas], ex = findRoad(e);
    return '<div class="jn-pop"><b>' + esc(e.name) + "</b>" +
      "<div><span>No. Link:</span> " + esc(e.link || "-") + "</div>" +
      "<div><span>Panjang di " + esc(e.kab) + ":</span> " + num(e.km, 2) + " km</div>" +
      "<div><span>Panjang SK:</span> " + num(e.skKm, 2) + " km</div>" +
      "<div><span>Lintas:</span> <em class=\"jn-tag\" style=\"--c:" + s[1] + '">' + esc(s[0]) + "</em></div>" +
      "<div><span>Provinsi:</span> " + esc(e.provName || "-") + "</div>" +
      (ex ? '<div style="color:#34d399;font-weight:700;margin-top:4px">Sudah ada di daftar Ruas Jalan (STA)</div>'
        : '<button class="sr-pop-add" data-sr-add="' + e.key + '">+ Jadikan ruas dengan titik STA</button>') + "</div>";
  }
  function line(e) {
    if (PL[e.key]) return PL[e.key];
    var parts = e.parts.map(decode);
    var p = L.polyline(parts, { color: SAT[e.lintas][1], weight: 5, opacity: .95, lineJoin: "round" });
    p.bindPopup(function () { return popupHtml(e); });
    p.on("mouseover", function () { p.setStyle({ weight: 8 }); }).on("mouseout", function () { p.setStyle({ weight: 5 }); });
    return (PL[e.key] = p);
  }
  function show(e) { try { layer().addLayer(line(e)); } catch (x) { console.error(x); } }
  function hide(e) { if (PL[e.key] && LAY) LAY.removeLayer(PL[e.key]); }
  function setOn(e, on) { if (on) { st.on[e.key] = 1; show(e); } else { delete st.on[e.key]; hide(e); } }
  function fly(e) {
    try {
      var b = line(e).getBounds();
      gmap().flyToBounds(b, { padding: [50, 50], maxZoom: 16, duration: .6 });
      if (window.innerWidth <= 860 && typeof toggleSidebar === "function") toggleSidebar(false);
    } catch (x) { console.error(x); }
  }

  /* ---------- hubungan dengan ruas yang sudah ada (46 ruas ber-STA + yang ditambahkan) ---------- */
  var IDX = null;
  function buildIdx() {
    IDX = { id: {}, nm: {} };
    (roads || []).forEach(function (r) {
      IDX.id[r.id] = r;
      var n = norm(r.name); (IDX.nm[n] = IDX.nm[n] || []).push(r);
    });
  }
  /* nama "inti": buang awalan nomor, isi kurung, dan kata wilayah/gelar supaya ejaan berbeda tetap cocok */
  var STOP = { jl: 1, jln: 1, ir: 1, h: 1, hj: 1, dr: 1, cilacap: 1, banyumas: 1, purwokerto: 1 };
  function core(s) {
    return String(s || "").toLowerCase().replace(/^\s*\d+\s*\.\s*/, "").replace(/\([^)]*\)/g, " ")
      .split(/[^a-z0-9]+/).filter(function (w) { return w && !STOP[w]; }).join("");
  }
  function sim(a, b) {   /* kemiripan Levenshtein 0..1 */
    if (a === b) return 1; if (!a || !b) return 0;
    var m = a.length, n = b.length, d = [], i, j;
    for (j = 0; j <= n; j++) d[j] = j;
    for (i = 1; i <= m; i++) {
      var prev = d[0]; d[0] = i;
      for (j = 1; j <= n; j++) {
        var t = d[j];
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        prev = t;
      }
    }
    return 1 - d[n] / Math.max(m, n);
  }
  function roadKm(r) {
    try { if (r.lengthKmFromSTA) return +r.lengthKmFromSTA; if (typeof roadLengthKm === "function") return roadLengthKm(r); } catch (x) {}
    return 0;
  }
  var FZ = {};
  function findRoad(e) {
    if (!IDX) { buildIdx(); FZ = {}; }
    if (IDX.id[e.id]) return IDX.id[e.id];
    var bc = e.kabShort === "Banyumas" || e.kabShort === "Cilacap";
    var c = IDX.nm[norm(e.name)] || IDX.nm[norm(e.rawName)];
    if (c) {
      for (var i = 0; i < c.length; i++) {
        var k = c[i].kabupaten || "";
        if (k === e.kab || (bc && (k === "Kabupaten Banyumas" || k === "Kabupaten Cilacap"))) return c[i];
      }
    }
    if (!bc) return null;
    /* ejaan beda (Sukaraja/Sokaraja, Pattimura/Patimura, dst.): cocok bila nama inti mirip DAN panjangnya sepadan */
    if (FZ[e.key] !== undefined) return FZ[e.key];
    var ce = core(e.rawName), best = null, bs = 0;
    (roads || []).forEach(function (r) {
      var k = r.kabupaten || ""; if (k !== "Kabupaten Banyumas" && k !== "Kabupaten Cilacap") return;
      var sc = sim(ce, core(r.name)); if (sc < .86 || sc <= bs) return;
      var L1 = roadKm(r), L2 = e.skKm;
      if (L1 && L2 && Math.abs(L1 - L2) > Math.max(.6, .15 * L2)) return;
      best = r; bs = sc;
    });
    return (FZ[e.key] = best);
  }

  /* ---------- jadikan ruas penuh (titik STA tiap 50 m) ---------- */
  function hav(a, b) {
    var R = 6371000, p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180,
      dp = (b[0] - a[0]) * Math.PI / 180, dl = (b[1] - a[1]) * Math.PI / 180,
      h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function staText(m) { return Math.floor(m / 1000) + "+" + ("00" + Math.round(m % 1000)).slice(-3); }
  function makePoints(e) {
    var path = [];
    e.parts.forEach(function (s) { decode(s).forEach(function (p) {
      var l = path[path.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) path.push(p);
    }); });
    var cum = [0]; for (var i = 1; i < path.length; i++) cum.push(cum[i - 1] + hav(path[i - 1], path[i]));
    var total = cum[cum.length - 1], pts = [], seg = 1;
    function at(d) {
      while (seg < path.length - 1 && cum[seg] < d) seg++;
      var a = path[seg - 1], b = path[seg], span = cum[seg] - cum[seg - 1], t = span > 0 ? (d - cum[seg - 1]) / span : 0;
      t = Math.max(0, Math.min(1, t));
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    function push(d, utama) {
      var q = at(d);
      pts.push({ sta: staText(d), lat: +q[0].toFixed(6), lng: +q[1].toFixed(6), tipe: utama ? "Label Utama" : "Titik Detail" });
    }
    for (var d = 0; d < total; d += STEP_M) push(d, d % 100 === 0);
    push(total, true);
    var calc = 0; for (var q = 1; q < pts.length; q++) calc += hav([pts[q - 1].lat, pts[q - 1].lng], [pts[q].lat, pts[q].lng]);
    return { pts: pts, km: total / 1000, calc: calc / 1000 };
  }
  function buildRoad(e, idx) {
    var mp = makePoints(e), nm = e.multi ? e.name + " (bagian " + e.kab + ")" : e.name;
    var pal = (typeof PALETTE !== "undefined" && PALETTE.length) ? PALETTE[((roads.length + idx) % PALETTE.length)] : SAT[e.lintas][1];
    return {
      id: e.id, name: nm, sourceFile: "Jalan Nasional (Jalnas) · " + e.kab, noLink: e.link,
      lengthKmFromSTA: +mp.km.toFixed(3), lengthKmCalculated: +mp.calc.toFixed(3),
      kabupaten: e.kab, isManualDrawing: false, color: pal, visible: true, points: mp.pts
    };
  }
  function addEntries(list, focusId) {
    list = list.filter(function (e) { return !findRoad(e); });
    if (!list.length) { note("Semua ruas di sini sudah ada di daftar Ruas Jalan"); return; }
    var made = [];
    try { list.forEach(function (e, i) { made.push(buildRoad(e, i)); }); }
    catch (x) { console.error(x); note("Gagal menyusun titik STA", true); return; }
    var before = roads.length, pts = made.reduce(function (s, r) { return s + r.points.length; }, 0);
    roads.push.apply(roads, made);
    try { persist(); }
    catch (x) {
      roads.length = before;
      console.error(x);
      note("Penyimpanan perangkat penuh — tidak bisa menambah " + made.length + " ruas (" + num(pts) + " titik). Hapus data lain atau tambah per ruas.", true);
      return;
    }
    list.forEach(function (e) { setOn(e, false); });
    made.forEach(function (r) { try { renderRoadLayer(r); } catch (x) { console.error(x); } });
    try { renderRoadList(); } catch (x) {}
    try { updateStats(); } catch (x) {}
    save(); IDX = null; render();
    note(made.length === 1 ? "Ruas ditambahkan: " + made[0].name + " (" + num(pts) + " titik STA)" : made.length + " ruas ditambahkan (" + num(pts) + " titik STA)");
    if (focusId) { try { focusRoad(focusId); } catch (x) {} }
  }

  /* ---------- UI ---------- */
  var root, pending = false;
  function mount() {
    if (root && document.body.contains(root)) return;
    root = document.createElement("div");
    root.id = "pqAllRuas";
    var ul = $("roadList");
    ul.parentNode.insertBefore(root, ul.nextSibling);
    root.addEventListener("click", onClick);
  }
  function schedule() {
    if (pending) return; pending = true;
    (window.requestAnimationFrame || setTimeout)(function () { pending = false; IDX = null; render(); });
  }
  function query() { var i = $("searchInput"); return i ? i.value.trim().toLowerCase() : ""; }
  function kabSel() { var s = $("kabupatenFilterSelect"); return s ? s.value : ""; }

  function entryMatch(e, q) {
    return !q || (e.name + " " + e.rawName + " " + e.link + " " + e.kab + " " + SAT[e.lintas][0]).toLowerCase().indexOf(q) > -1;
  }
  function visibleGroups() {
    var q = query(), ks = kabSel(), out = [];
    var gs = GROUPS.filter(function (g) { return (!st.prov || g.prov === st.prov) && (!ks || g.name === ks); });
    gs.forEach(function (g) {
      var gm = q && g.name.toLowerCase().indexOf(q) > -1;
      var es = g.entries.filter(function (e) { return gm || entryMatch(e, q); });
      if (q && !es.length) return;
      out.push({ g: g, es: es });
    });
    out.sort(function (a, b) {
      if (st.sort === "km") return b.g.km - a.g.km;
      return a.g.name.localeCompare(b.g.name, "id");
    });
    return out;
  }

  function rowHtml(e) {
    var s = SAT[e.lintas], ex = findRoad(e), on = !!st.on[e.key];
    var meta = "<span>No. " + esc(e.link || "-") + "</span><span>" + num(e.km, 2) + " km</span><span>" + esc(s[0]) + "</span>";
    if (e.multi) meta += "<span>(sebagian, ruas melewati " + spanCount[e.ji] + " wilayah)</span>";
    var act = ex ? '<span class="sr-ok" title="Sudah ada di daftar Ruas Jalan (dengan titik STA)"><i class="fa-solid fa-circle-check"></i> STA</span>'
      : '<button type="button" class="sr-add" data-sr-add="' + e.key + '" title="Jadikan ruas dengan titik STA tiap 50 m (bisa ekspor, PDF, IRI, animasi)">+ STA</button>';
    return '<div class="sr-r" data-sr-go="' + e.key + '"><span class="sr-sw" style="background:' + s[1] + ";color:" + s[1] + '"></span>' +
      '<div class="sr-in"><div class="sr-n">' + esc(e.name) + '</div><div class="sr-m">' + meta + act + "</div></div>" +
      (ex ? "" : '<button type="button" class="sr-sw2 ' + (on ? "on" : "") + '" data-sr-tg="' + e.key + '" title="Tampil/Sembunyi di peta"></button>') + "</div>";
  }
  function groupSwitch(es) {
    var n = es.filter(function (e) { return st.on[e.key]; }).length;
    return n === 0 ? "" : (n === es.length ? "on" : "part");
  }

  function render() {
    if (!root || !document.body.contains(root)) { if (!ready()) return; mount(); }
    var vg = visibleGroups(), q = query(), km = 0, uniq = {};
    vg.forEach(function (x) { x.es.forEach(function (e) { uniq[e.ji] = 1; km += e.km; }); });
    var shown = Object.keys(uniq).length;
    var filtered = !!(q || kabSel() || st.prov);
    var html = '<div class="sr-h" data-sr-open="1"><i class="fa-solid fa-road"></i><div><b>Jalan Nasional · Semua Kabupaten</b><small>' +
      (filtered ? num(shown) + " dari " + num(TOTAL_RUAS) + " ruas · " + num(km) + " km" : num(TOTAL_RUAS) + " ruas · " + num(TOTAL_KM) + " km · " + GROUPS.length + " kab/kota Jateng–DIY") +
      '</small></div><i class="fa-solid fa-chevron-right sr-chev"></i></div><div class="sr-body">';
    html += '<div class="sr-bar">' +
      '<button type="button" class="sr-chip ' + (!st.prov ? "on" : "") + '" data-sr-prov="">Semua</button>' +
      '<button type="button" class="sr-chip ' + (st.prov === "jt" ? "on" : "") + '" data-sr-prov="jt">Jawa Tengah</button>' +
      '<button type="button" class="sr-chip ' + (st.prov === "diy" ? "on" : "") + '" data-sr-prov="diy">DI Yogyakarta</button>' +
      '<span class="sr-sp"></span>' +
      '<button type="button" class="sr-chip ' + (st.sort === "az" ? "on" : "") + '" data-sr-sort="az">A–Z</button>' +
      '<button type="button" class="sr-chip ' + (st.sort === "km" ? "on" : "") + '" data-sr-sort="km">Terpanjang</button></div>';
    html += '<div class="sr-bar"><button type="button" class="sr-btn" data-sr-all="on"><i class="fa-solid fa-eye"></i> Tampilkan semua' + (filtered ? " (hasil)" : "") + '</button>' +
      '<button type="button" class="sr-btn" data-sr-all="off"><i class="fa-solid fa-eye-slash"></i> Sembunyikan</button></div>';
    html += '<div class="sr-note">Sumber: data Jalan Nasional Jateng–DIY di PETAQU. Ruas bertanda <span class="sr-ok">STA</span> sudah punya titik STA di daftar atas. Tombol <b>+ STA</b> menjadikan ruas bisa dikelola penuh (ekspor, PDF, IRI, animasi).</div>';

    if (!vg.length) html += '<div class="sr-none">Tidak ada ruas yang cocok dengan pencarian / filter.</div>';
    vg.forEach(function (x) {
      var g = x.g, open = !!st.groups[g.key] || !!q, empty = !g.entries.length;
      var kmShown = x.es.reduce(function (s, e) { return s + e.km; }, 0);
      var sw = groupSwitch(x.es);
      html += '<div class="sr-g ' + (open && !empty ? "open" : "") + (empty ? " empty" : "") + '"><div class="sr-gh" data-sr-grp="' + g.key + '">' +
        '<i class="fa-solid fa-chevron-right sr-chev"></i><div class="t"><b>' + esc(g.name) + "</b><small>" +
        (empty ? "Belum ada ruas nasional pada data" : num(x.es.length) + " ruas · " + num(kmShown) + " km") + "</small></div>" +
        (empty ? "" : '<button type="button" class="sr-sw2 ' + sw + '" data-sr-gtg="' + g.key + '" title="Tampil/Sembunyi semua ruas ' + esc(g.name) + '"></button>') + "</div>";
      if (open && !empty) {
        var todo = x.es.filter(function (e) { return !findRoad(e); }).length;
        html += '<div class="sr-gb"><div class="sr-tools">' +
          '<button type="button" class="sr-btn" data-sr-fit="' + g.key + '"><i class="fa-solid fa-crosshairs"></i> Zoom wilayah</button>' +
          (todo ? '<button type="button" class="sr-btn pri" data-sr-gadd="' + g.key + '"><i class="fa-solid fa-plus"></i> Tambah ' + todo + " ruas + STA</button>" : "") +
          "</div>" + x.es.map(rowHtml).join("") + "</div>";
      }
      html += "</div>";
    });
    html += "</div>";
    root.className = st.open ? "open" : "";
    root.innerHTML = html;
  }

  function groupEntries(key) {
    var vg = visibleGroups().filter(function (x) { return x.g.key === key; });
    return vg.length ? vg[0].es : [];
  }
  function onClick(ev) {
    var t = ev.target, el;
    if ((el = t.closest("[data-sr-add]"))) { ev.stopPropagation(); var e = ENTRY[el.getAttribute("data-sr-add")]; if (e) { try { var p = gmap(); p && p.closePopup(); } catch (x) {} addEntries([e], e.id); } return; }
    if ((el = t.closest("[data-sr-tg]"))) { ev.stopPropagation(); var e2 = ENTRY[el.getAttribute("data-sr-tg")]; setOn(e2, !st.on[e2.key]); save(); render(); return; }
    if ((el = t.closest("[data-sr-gtg]"))) {
      ev.stopPropagation();
      var es = groupEntries(el.getAttribute("data-sr-gtg")).filter(function (x) { return !findRoad(x); });
      var allOn = es.length && es.every(function (x) { return st.on[x.key]; });
      es.forEach(function (x) { setOn(x, !allOn); }); save(); render(); return;
    }
    if ((el = t.closest("[data-sr-go]"))) {
      var e3 = ENTRY[el.getAttribute("data-sr-go")], ex = findRoad(e3);
      if (ex) { try { focusRoad(ex.id); } catch (x) {} return; }
      setOn(e3, true); save(); fly(e3); render(); return;
    }
    if ((el = t.closest("[data-sr-fit]"))) {
      var es2 = groupEntries(el.getAttribute("data-sr-fit")).filter(function (x) { return !findRoad(x); });
      es2.forEach(function (x) { setOn(x, true); }); save();
      var b = null; es2.forEach(function (x) { var bb = line(x).getBounds(); b = b ? b.extend(bb) : L.latLngBounds(bb.getSouthWest(), bb.getNorthEast()); });
      if (b) { gmap().flyToBounds(b, { padding: [40, 40], maxZoom: 13, duration: .7 }); if (window.innerWidth <= 860 && typeof toggleSidebar === "function") toggleSidebar(false); }
      render(); return;
    }
    if ((el = t.closest("[data-sr-gadd]"))) {
      var list = groupEntries(el.getAttribute("data-sr-gadd")).filter(function (x) { return !findRoad(x); });
      var estPts = Math.round(list.reduce(function (s, x) { return s + x.km; }, 0) * 1000 / STEP_M);
      if (confirm("Tambahkan " + list.length + " ruas (± " + num(estPts) + " titik STA, tiap " + STEP_M + " m) ke daftar Ruas Jalan?\n\nData disimpan di perangkat ini.")) addEntries(list);
      return;
    }
    if ((el = t.closest("[data-sr-grp]"))) { var k = el.getAttribute("data-sr-grp"); st.groups[k] = !st.groups[k]; save(); render(); return; }
    if ((el = t.closest("[data-sr-prov]"))) { st.prov = el.getAttribute("data-sr-prov"); save(); render(); return; }
    if ((el = t.closest("[data-sr-sort]"))) { st.sort = el.getAttribute("data-sr-sort"); save(); render(); return; }
    if ((el = t.closest("[data-sr-all]"))) {
      var on = el.getAttribute("data-sr-all") === "on";
      var all = []; visibleGroups().forEach(function (x) { x.es.forEach(function (y) { if (!findRoad(y)) all.push(y); }); });
      if (on && all.length > 120 && !confirm("Menampilkan " + all.length + " ruas sekaligus bisa memberatkan peta di HP. Lanjutkan?")) return;
      all.forEach(function (x) { setOn(x, on); }); save(); render(); return;
    }
    if ((el = t.closest("[data-sr-open]"))) { st.open = !st.open; save(); render(); return; }
  }

  /* tombol di popup peta */
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest(".sr-pop-add");
    if (!b) return;
    var e = ENTRY[b.getAttribute("data-sr-add")];
    if (e) { ev.stopPropagation(); try { gmap().closePopup(); } catch (x) {} addEntries([e], e.id); }
  }, true);  /* fase capture: Leaflet menghentikan klik di dalam popup */

  /* ---------- sambungkan dengan daftar lama ---------- */
  function hook() {
    if (typeof renderRoadList === "function" && !renderRoadList.__pqSR) {
      var orig = renderRoadList;
      var wrapped = function () { var r = orig.apply(this, arguments); schedule(); return r; };
      wrapped.__pqSR = 1;
      try { window.renderRoadList = wrapped; } catch (e) {}
    }
    var s = $("searchInput"); if (s && !s.__pqSR) { s.__pqSR = 1; s.addEventListener("input", schedule); }
    var k = $("kabupatenFilterSelect"); if (k && !k.__pqSR) { k.__pqSR = 1; k.addEventListener("change", schedule); }
  }

  /* pulihkan ruas yang tadi dinyalakan */
  function restore() {
    Object.keys(st.on).forEach(function (key) {
      var e = ENTRY[key];
      if (!e || findRoad(e)) { delete st.on[key]; return; }
      show(e);
    });
  }

  var tries = 0, timer = setInterval(function () {
    tries++;
    if (ready()) {
      clearInterval(timer);
      try { hook(); mount(); IDX = null; restore(); render(); } catch (e) { console.error("SemuaRuas", e); }
    } else if (tries > 200) clearInterval(timer);
  }, 300);

  /* API kecil untuk modul lain / konsol */
  window.PQ_SEMUARUAS = {
    total: function () { return { ruas: TOTAL_RUAS, km: TOTAL_KM, kabupaten: GROUPS.length }; },
    refresh: schedule
  };
})();
