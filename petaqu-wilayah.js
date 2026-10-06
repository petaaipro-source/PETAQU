/* ==========================================================================
   PETAQU – Data Wilayah Otomatis (dipanggil dari chip pencarian)
   • "Seluruh Jateng" / "Yogyakarta" -> batas tiap kabupaten + semua data di dalamnya:
     Ruas Jalan, Jembatan, AMP, Batching Plant, Quarry (+ ringkasan angka per kabupaten)
   • Klik kabupaten (di peta / daftar) -> zoom + daftar isi kabupaten itu
   • "Lokasi saya" -> data TERDEKAT (ruas, jembatan, AMP, BP, quarry) lengkap dengan jarak
   Hemat kuota: 100% memakai data yang sudah ada di aplikasi, TANPA request jaringan.
   API: PQ_WILAYAH.show("jateng"|"diy") | .kab(index) | .nearest(lat,lng) | .clear()
   ========================================================================== */
(function () {
  "use strict";
  if (window.PQ_WILAYAH) return;
  var DIY = { "Kulon Progo": 1, Bantul: 1, Gunungkidul: 1, Sleman: 1, "Kota Yogyakarta": 1 };
  var TYPES = [
    ["jalan", "Ruas", "#e11d48", "fa-road"], ["jembatan", "Jembatan", "#fbbf24", "fa-road-bridge"],
    ["amp", "AMP", "#f97316", "fa-industry"], ["bp", "Batching Plant", "#38bdf8", "fa-truck-droplet"],
    ["quarry", "Quarry", "#a3e635", "fa-mountain"]
  ];
  var TM = {}; TYPES.forEach(function (t) { TM[t[0]] = t; });
  var K = null, G = null, layer = null, view = null, nearestData = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function getMap() { try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) {} return window.map && window.map.addLayer ? window.map : null; }
  function dd() { return document.querySelector("#pqCari .dd"); }
  function norm(s) { return String(s || "").toLowerCase().replace(/kabupaten|kab\.?|kota|\(.*?\)/g, "").replace(/[^a-z]/g, ""); }
  function isKota(s) { return /kota/i.test(s || ""); }
  function label(k) { return k.t === "Kab." ? "Kab. " + k.n : k.n; }
  function dist(a, b, c, d) { var r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r, h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) * Math.sin(y / 2); return 12742 * Math.asin(Math.sqrt(h)); }
  function fmtD(k) { return k < 1 ? Math.round(k * 1000) + " m" : k < 100 ? k.toFixed(1).replace(".", ",") + " km" : Math.round(k) + " km"; }
  function getRoads() { try { return typeof roads !== "undefined" && roads ? roads : (window.roads || []); } catch (e) { return window.roads || []; } }
  function getJbt() { try { return (typeof JEMBATAN_DB !== "undefined" && JEMBATAN_DB && JEMBATAN_DB.length) ? JEMBATAN_DB : (typeof JEMBATAN_SEED !== "undefined" ? JEMBATAN_SEED : []); } catch (e) { return []; } }

  /* ---------- titik-dalam-poligon (sama dengan modul Jembatan per Kabupaten) ---------- */
  function inRing(y, x, r) { var c = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var yi = r[i][0], xi = r[i][1], yj = r[j][0], xj = r[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
  function inK(k, y, x) {
    var b = k._b; if (y < b[0] || y > b[2] || x < b[1] || x > b[3]) return false;
    for (var i = 0; i < k.p.length; i++) { var poly = k.p[i]; if (inRing(y, x, poly[0])) { var hole = false; for (var h = 1; h < poly.length; h++) if (inRing(y, x, poly[h])) { hole = true; break; } if (!hole) return true; } }
    return false;
  }
  function findK(lat, lng, nm) {
    if (!isFinite(lat) || !isFinite(lng)) return -1;
    var hits = []; for (var i = 0; i < K.length; i++) if (inK(K[i], lat, lng)) hits.push(i);
    if (hits.length === 1) return hits[0];
    var key = norm(nm), kota = isKota(nm);
    if (hits.length > 1) { for (var h = 0; h < hits.length; h++) if (key && norm(K[hits[h]].n) === key && (K[hits[h]].t !== "Kab.") === kota) return hits[h]; return hits[0]; }
    if (key) for (var j = 0; j < K.length; j++) if (norm(K[j].n) === key && (K[j].t !== "Kab.") === kota) return j;
    var best = -1, bd = 0.12;
    for (var m = 0; m < K.length; m++) { var dy = K[m].c[0] - lat, dx = K[m].c[1] - lng, d = Math.sqrt(dy * dy + dx * dx); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  /* ---------- kelompokkan semua data per kabupaten (sekali, lalu di-cache) ---------- */
  function build(force) {
    if (G && !force) return G;
    if (!K) {
      var el = document.getElementById("kb-data"); if (!el) return null;
      try { K = JSON.parse(el.textContent); } catch (e) { return null; }
      K.forEach(function (k) {
        var a = 90, z = -90, o = 180, w = -180;
        k.p.forEach(function (poly) { poly[0].forEach(function (q) { if (q[0] < a) a = q[0]; if (q[0] > z) z = q[0]; if (q[1] < o) o = q[1]; if (q[1] > w) w = q[1]; }); });
        k._b = [a, o, z, w];
      });
    }
    G = K.map(function (k, i) { return { i: i, k: k, name: label(k), prov: DIY[k.n] ? "diy" : "jt", jalan: [], jembatan: [], amp: [], bp: [], quarry: [] }; });
    getJbt().forEach(function (b) {
      var lat = +b.lat, lng = +b.lng, i = findK(lat, lng, b.kabupaten); if (i < 0) return;
      G[i].jembatan.push({ t: "jembatan", lat: lat, lng: lng, name: b.nama || "Jembatan", sub: [b.ruas, b.panjang ? b.panjang + " m" : ""].filter(Boolean).join(" • "), rec: b });
    });
    (window.LOKASI_DATA || []).forEach(function (x) {
      var lat = +x.lat, lng = +x.lng; if (!TM[x.jenis] || !isFinite(lat) || !isFinite(lng) || (!x.lat && x.lat !== 0)) return;
      var i = findK(lat, lng, x.kabupaten); if (i < 0) return;
      G[i][x.jenis].push({ t: x.jenis, lat: lat, lng: lng, name: x.owner || TM[x.jenis][1], sub: x.alamat || "", rec: x });
    });
    getRoads().forEach(function (r) {
      var pts = r.points || [], seen = {}, step = Math.max(1, Math.floor(pts.length / 30));
      for (var n = 0; n < pts.length; n += step) { var i = findK(+pts[n].lat, +pts[n].lng, ""); if (i >= 0 && !seen[i]) { seen[i] = 1; G[i].jalan.push({ t: "jalan", id: r.id, name: r.name, pts: pts, lat: +pts[0].lat, lng: +pts[0].lng, sub: (r.lengthKmCalculated ? (+r.lengthKmCalculated).toFixed(2) + " km • " : "") + pts.length + " titik STA" }); } }
    });
    return G;
  }
  function total(g) { return TYPES.reduce(function (a, t) { return a + g[t[0]].length; }, 0); }

  /* ---------- gambar di peta ---------- */
  function clear() { var m = getMap(); if (layer && m) m.removeLayer(layer); layer = null; view = null; nearestData = null; }
  function newLayer() { var m = getMap(); clear(); layer = L.layerGroup().addTo(m); return layer; }
  function popup(it, extra) {
    function row(k, v) { return v == null || v === "" ? "" : '<div class="dr"><span>' + k + "</span><b>" + esc(v) + "</b></div>"; }
    var det, p = it.pts || [];
    if (it.t === "jalan") det = '<div class="dt">' + row("Info", it.sub) + row("STA awal", (p[0] || {}).sta) + row("STA akhir", (p[p.length - 1] || {}).sta) + row("Jarak", extra) + "</div>";
    else det = '<div class="dt">' + row("Jarak", extra) + (window.PQ_DETAIL && it.rec ? window.PQ_DETAIL(it.t, it.rec).replace(/^<div class="dt">|<\/div>$/g, "") : row("Info", it.sub)) + row("Koordinat", it.lat.toFixed(6) + ", " + it.lng.toFixed(6)) + "</div>";
    return '<div class="pq-cari-pop"><b>' + esc(it.name) + "</b><small>" + esc(TM[it.t][1]) + "</small>" + det + (it.t !== "jalan" ? '<div class="r"><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + it.lat + "," + it.lng + '">Rute</a></div>' : "") + "</div>";
  }
  function drawItem(g, it, big, extra) {
    var c = TM[it.t][2];
    if (it.t === "jalan") {
      var pl = L.polyline(it.pts.map(function (p) { return [+p.lat, +p.lng]; }), { color: c, weight: big ? 5 : 3, opacity: .9 }).addTo(g);
      pl.bindPopup(popup(it, extra), { maxWidth: 320 }); pl.bindTooltip(esc(it.name), { sticky: true });
    } else {
      var mk = L.circleMarker([it.lat, it.lng], { radius: big ? 8 : 5, color: "#0b1220", weight: 1.5, fillColor: c, fillOpacity: .95 }).addTo(g);
      mk.bindPopup(popup(it, extra), { maxWidth: 320 }); mk.bindTooltip(esc(it.name), { direction: "top" });
    }
  }
  function polyOf(g, strong) {
    var p = L.polygon(g.k.p, { color: "#22d3ee", weight: strong ? 2.5 : 1.3, dashArray: strong ? null : "5 4", fillColor: "#22d3ee", fillOpacity: strong ? .04 : .07 });
    p.on("click", function () { api.kab(g.i); });
    return p;
  }

  /* ---------- panel di dropdown pencarian ---------- */
  function open() { var r = document.getElementById("pqCari"); if (r) r.classList.add("open"); }
  function panel(html) { var d = dd(); if (!d) return; d.innerHTML = html; open(); }
  function head(title, sub, back) {
    return '<div class="pqw-h">' + (back ? '<button class="pqw-b" data-w="back" title="Kembali"><i class="fa-solid fa-chevron-left"></i></button>' : "") + '<div class="pqw-t"><b>' + esc(title) + "</b><small>" + esc(sub) + '</small></div><button class="pqw-b" data-w="clear" title="Bersihkan peta"><i class="fa-solid fa-xmark"></i></button></div>';
  }
  function badges(g) { return TYPES.filter(function (t) { return g[t[0]].length; }).map(function (t) { return '<span class="pqw-c" style="--c:' + t[2] + '" title="' + t[1] + '"><i class="fa-solid ' + t[3] + '"></i>' + g[t[0]].length + "</span>"; }).join(""); }

  function showProv(pv) {
    var m = getMap(); if (!m || !build()) { panel('<div class="st"><i class="fa-solid fa-triangle-exclamation"></i> Data wilayah belum siap, coba lagi sebentar.</div>'); return; }
    var list = G.filter(function (g) { return pv === "all" || g.prov === pv; }), g = newLayer(), bounds = [];
    view = { type: "prov", pv: pv };
    list.forEach(function (x) {
      polyOf(x, false).addTo(g);
      TYPES.forEach(function (t) { if (t[0] !== "jalan") x[t[0]].forEach(function (it) { drawItem(g, it, false); }); });
      x.jalan.forEach(function (it) { drawItem(g, it, false); });
      var n = total(x);
      L.marker(x.k.c, { interactive: false, icon: L.divIcon({ className: "", iconSize: [0, 0], html: '<div class="pqw-lb">' + esc(x.k.n) + (n ? "<em>" + n + "</em>" : "") + "</div>" }) }).addTo(g);
      x.k.p.forEach(function (poly) { poly[0].forEach(function (q) { bounds.push(q); }); });
    });
    if (bounds.length) m.flyToBounds(L.latLngBounds(bounds), { padding: [30, 30], duration: 0.9 });
    var sum = {}; TYPES.forEach(function (t) { sum[t[0]] = list.reduce(function (a, x) { return a + x[t[0]].length; }, 0); });
    var sorted = list.slice().sort(function (a, b) { return total(b) - total(a) || a.name.localeCompare(b.name, "id"); });
    var title = pv === "diy" ? "D.I. Yogyakarta" : pv === "jt" ? "Jawa Tengah" : "Jawa Tengah & DIY";
    panel(head(title, list.length + " kabupaten/kota • " + TYPES.map(function (t) { return sum[t[0]] + " " + t[1].toLowerCase(); }).join(" • ")) +
      '<div class="ls">' + sorted.map(function (x) { return '<div class="pqw-r" data-w="kab" data-i="' + x.i + '"><b>' + esc(x.name) + '</b><span>' + (badges(x) || '<small style="color:#5f6e84">belum ada data</small>') + "</span></div>"; }).join("") + "</div>");
  }

  function showKab(i) {
    var m = getMap(), x = G && G[i]; if (!m || !x) return;
    var g = newLayer(); view = { type: "kab", i: i, pv: x.prov };
    polyOf(x, true).addTo(g);
    TYPES.forEach(function (t) { x[t[0]].forEach(function (it) { drawItem(g, it, true); }); });
    var b = []; x.k.p.forEach(function (poly) { poly[0].forEach(function (q) { b.push(q); }); });
    m.flyToBounds(L.latLngBounds(b), { padding: [30, 30], duration: 0.8 });
    var html = head(x.name, total(x) + " data di kabupaten ini", true) + '<div class="ls">';
    TYPES.forEach(function (t) {
      var arr = x[t[0]]; if (!arr.length) return;
      html += '<div class="hd">' + t[1] + " (" + arr.length + ")</div>";
      arr.forEach(function (it, n) { html += '<div class="pqw-r" data-w="it" data-i="' + i + '" data-t="' + t[0] + '" data-n="' + n + '"><i class="fa-solid ' + t[3] + '" style="color:' + t[2] + '"></i><b>' + esc(it.name) + "</b>" + (it.sub ? "<small>" + esc(it.sub) + "</small>" : "") + "</div>"; });
    });
    if (!total(x)) html += '<div class="st">Belum ada data di kabupaten ini.</div>';
    panel(html + "</div>");
  }

  function focusItem(it) {
    var m = getMap(); if (!m) return;
    if (it.t === "jalan") m.flyToBounds(L.latLngBounds(it.pts.map(function (p) { return [+p.lat, +p.lng]; })), { padding: [50, 50], maxZoom: 16, duration: 0.8 });
    else m.flyTo([it.lat, it.lng], Math.max(m.getZoom(), 15), { duration: 0.8 });
    if (layer) layer.eachLayer(function (l) { if (l.getLatLng && it.t !== "jalan") { var p = l.getLatLng(); if (Math.abs(p.lat - it.lat) < 1e-9 && Math.abs(p.lng - it.lng) < 1e-9) setTimeout(function () { l.openPopup(); }, 850); } });
  }

  /* ---------- terdekat dari lokasi saya ---------- */
  function nearest(lat, lng) {
    var m = getMap(); if (!m) return; if (!build()) { /* data wilayah tidak wajib untuk mode terdekat */ }
    var all = { jalan: [], jembatan: [], amp: [], bp: [], quarry: [] };
    getRoads().forEach(function (r) {
      var best = 1e9, pts = r.points || [];
      for (var n = 0; n < pts.length; n++) { var d = dist(lat, lng, +pts[n].lat, +pts[n].lng); if (d < best) best = d; }
      if (isFinite(best) && pts.length) all.jalan.push({ t: "jalan", id: r.id, name: r.name, pts: pts, lat: +pts[0].lat, lng: +pts[0].lng, d: best, sub: pts.length + " titik STA" });
    });
    getJbt().forEach(function (b) { var a = +b.lat, o = +b.lng; if (isFinite(a) && isFinite(o)) all.jembatan.push({ t: "jembatan", lat: a, lng: o, name: b.nama || "Jembatan", sub: [b.ruas, b.kabupaten].filter(Boolean).join(" • "), d: dist(lat, lng, a, o), rec: b }); });
    (window.LOKASI_DATA || []).forEach(function (x) { var a = +x.lat, o = +x.lng; if (TM[x.jenis] && x.lat != null && isFinite(a) && isFinite(o)) all[x.jenis].push({ t: x.jenis, lat: a, lng: o, name: x.owner || TM[x.jenis][1], sub: x.kabupaten || "", d: dist(lat, lng, a, o), rec: x }); });
    var g = newLayer(), picked = [], b = [[lat, lng]];
    view = { type: "near" }; nearestData = { lat: lat, lng: lng };
    L.circleMarker([lat, lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#3b82f6", fillOpacity: 1 }).addTo(g).bindTooltip("Lokasi saya", { permanent: false });
    TYPES.forEach(function (t) {
      var arr = all[t[0]].sort(function (a, c) { return a.d - c.d; }).slice(0, t[0] === "jembatan" || t[0] === "jalan" ? 5 : 3);
      arr.forEach(function (it) { picked.push(it); drawItem(g, it, true, fmtD(it.d) + " dari Anda"); if (it.t !== "jalan" && it.d < 60) b.push([it.lat, it.lng]); if (it.t === "jalan" && it.d < 60) b.push([it.lat, it.lng]); });
      all[t[0]] = arr;
    });
    if (b.length > 1) m.flyToBounds(L.latLngBounds(b), { padding: [50, 50], maxZoom: 14, duration: 0.9 }); else m.flyTo([lat, lng], 14, { duration: 0.9 });
    var html = head("Terdekat dari lokasi saya", picked.length + " data terdekat • dari titik GPS Anda") + '<div class="ls">';
    TYPES.forEach(function (t) {
      var arr = all[t[0]]; if (!arr.length) return;
      html += '<div class="hd">' + t[1] + " terdekat</div>";
      arr.forEach(function (it, n) { html += '<div class="pqw-r" data-w="nit" data-t="' + t[0] + '" data-n="' + n + '"><i class="fa-solid ' + t[3] + '" style="color:' + t[2] + '"></i><b>' + esc(it.name) + "</b><em>" + fmtD(it.d) + "</em>" + (it.sub ? "<small>" + esc(it.sub) + "</small>" : "") + "</div>"; });
    });
    nearestData.all = all;
    panel(html + "</div>");
  }

  /* ---------- delegasi klik di panel ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-w]"); if (!el || !el.closest("#pqCari")) return;
    var w = el.getAttribute("data-w");
    if (w === "kab") showKab(+el.getAttribute("data-i"));
    else if (w === "back") showProv(view && view.pv ? view.pv : "all");
    else if (w === "clear") { clear(); var d = dd(); if (d) { document.getElementById("pqCari").classList.remove("open"); } }
    else if (w === "it") { var x = G[+el.getAttribute("data-i")]; focusItem(x[el.getAttribute("data-t")][+el.getAttribute("data-n")]); }
    else if (w === "nit" && nearestData) focusItem(nearestData.all[el.getAttribute("data-t")][+el.getAttribute("data-n")]);
  });

  var css = "#pqCari .pqw-h{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #1a2333}#pqCari .pqw-t{flex:1;min-width:0}#pqCari .pqw-t b{display:block;font-size:13px;color:#e6edf5}#pqCari .pqw-t small{display:block;font-size:10.5px;color:#7c8aa0;margin-top:2px}" +
    "#pqCari .pqw-b{width:30px;height:30px;flex:none;border:0;border-radius:50%;background:rgba(255,255,255,.05);color:#9fb0c6;cursor:pointer}#pqCari .pqw-b:hover{color:#22d3ee;background:rgba(34,211,238,.12)}" +
    "#pqCari .pqw-r{display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-left:3px solid transparent;flex-wrap:wrap}#pqCari .pqw-r:hover{background:rgba(34,211,238,.08);border-left-color:#22d3ee}" +
    "#pqCari .pqw-r b{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:#e6edf5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#pqCari .pqw-r small{flex-basis:100%;font-size:10.5px;color:#7c8aa0;padding-left:26px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#pqCari .pqw-r em{font-style:normal;font-size:10.5px;font-weight:700;color:#7c8aa0}" +
    "#pqCari .pqw-r>span{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}#pqCari .pqw-c{font-size:10px;font-weight:700;color:var(--c);border:1px solid var(--c);border-radius:9px;padding:1px 6px;display:inline-flex;gap:4px;align-items:center;opacity:.9}" +
    ".pqw-lb{transform:translate(-50%,-50%);white-space:nowrap;font:700 10px Inter,system-ui,sans-serif;color:#e6edf5;text-shadow:0 0 3px #000,0 0 3px #000,0 0 6px #000;text-align:center;pointer-events:none}.pqw-lb em{display:block;font-style:normal;color:#22d3ee;font-size:9px}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var api = window.PQ_WILAYAH = {
    show: function (pv) { showProv(pv === "diy" ? "diy" : pv === "jateng" || pv === "jt" ? "jt" : "all"); },
    kab: showKab, nearest: nearest, clear: clear,
    reload: function () { build(true); }
  };
})();
