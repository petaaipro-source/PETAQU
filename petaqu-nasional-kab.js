/* ==========================================================================
   PETAQU – Jalan Nasional per Kabupaten (ringkas, tanpa duplikat, tanpa request jaringan)
   • Daftar kabupaten (tampil/sembunyi di peta) -> buka -> tiap ruas di kabupaten itu
   • Ruas yang sama (nama + No. Link) digabung, tidak pernah tampil dobel
   • Tombol "+ STA": jadikan ruas (bagian di kabupaten itu) ruas terkelola penuh
     (titik STA tiap 100 m) -> muncul aksi lengkap seperti kartu ruas:
     ganti nama, animasi, video dashcam, IRI, interval STA, hitung KM, PDF, ekspor, hapus
   • Tombol hide/show untuk data di atasnya (pencarian, lintas, tebal, daftar ruas)
   Sumber data: #kb-data (ruas per kabupaten) + #jn-data (nama/lintas) yang sudah ada.
   ========================================================================== */
(function () {
  "use strict";
  var W = typeof window !== "undefined" ? window : globalThis;
  if (W.PQ_JNKAB) return;
  var LS_LINK = "pq_jnkab_link", LS_HIDE = "pq_jn_top_hidden";
  var K = null, R = null, SAT = [], G = null, kLayers = {}, openKab = {}, linkMap = {}, filterQ = "";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtKm(v) { return (Math.round(v * 10 + 1e-6) / 10).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} return null; }
  function toast(m, err) { try { if (typeof W.toast === "function") return W.toast(m, !!err); } catch (e) {} }
  function getMap() { try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) {} return W.map && W.map.addLayer ? W.map : null; }
  function getRoads() { try { return typeof roads !== "undefined" && roads ? roads : (W.roads || []); } catch (e) { return W.roads || []; } }

  /* ---------- decode polyline (presisi 5) ---------- */
  function decode(str) {
    var i = 0, lat = 0, lng = 0, out = [];
    while (i < str.length) {
      var b, s = 0, r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
      lat += (r & 1) ? ~(r >> 1) : (r >> 1); s = 0; r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
      lng += (r & 1) ? ~(r >> 1) : (r >> 1);
      out.push([lat / 1e5, lng / 1e5]);
    }
    return out;
  }
  function hav(a, b) {
    var r = Math.PI / 180, x = (b[0] - a[0]) * r, y = (b[1] - a[1]) * r;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return 12742000 * Math.asin(Math.sqrt(h));
  }

  /* ---------- kelompok data: kabupaten -> ruas (digabung, tanpa duplikat) ---------- */
  function build() {
    if (G) return G;
    var a = document.getElementById("kb-data"), b = document.getElementById("jn-data");
    if (!a || !b) return null;
    try { K = JSON.parse(a.textContent); var d = JSON.parse(b.textContent); R = d.r || []; SAT = d.sat || []; } catch (e) { return null; }
    G = [];
    K.forEach(function (k, ki) {
      var by = {}, list = [];
      (k.r || []).forEach(function (x) {
        var ref = R[x[0]]; if (!ref) return;
        var key = String(ref[0]).trim().toUpperCase() + "|" + (ref[1] || "");
        var it = by[key];
        if (!it) { it = by[key] = { key: key, ri: x[0], name: ref[0], no: ref[1], lintas: ref[3], color: (SAT[ref[3]] || [])[1] || "#22d3ee", km: 0, lines: [] }; list.push(it); }
        it.km += +x[1] || 0;
        (x[2] || []).forEach(function (l) { if (it.lines.indexOf(l) < 0) it.lines.push(l); });
      });
      if (!list.length) return;
      list.sort(function (p, q) { return q.km - p.km; });
      G.push({ ki: ki, name: k.t === "Kab." ? "Kabupaten " + k.n : "Kota " + k.n, n: k.n, items: list, km: list.reduce(function (s, v) { return s + v.km; }, 0) });
    });
    G.sort(function (p, q) { return p.name.localeCompare(q.name); });
    return G;
  }

  /* ---------- gambar di peta ---------- */
  function popupHtml(g, it) {
    return '<div style="font-size:12px"><b>' + esc(it.name) + "</b><br>No. Link " + esc(it.no || "-") + "<br>" + esc(g.name) + " · " + fmtKm(it.km) + " km</div>";
  }
  function lyr(g, it) {
    var id = g.ki + "|" + it.key; if (kLayers[id]) return kLayers[id];
    var m = getMap(); if (!m || !W.L) return null;
    var grp = L.featureGroup();
    it.lines.forEach(function (s) { L.polyline(decode(s), { color: it.color, weight: 5, opacity: .95 }).bindPopup(popupHtml(g, it)).addTo(grp); });
    return (kLayers[id] = grp);
  }
  function setItem(g, it, on, fit) {
    var m = getMap(), l = lyr(g, it); if (!m || !l) return;
    if (on) { if (!m.hasLayer(l)) l.addTo(m); if (fit) try { m.fitBounds(l.getBounds(), { padding: [40, 40], maxZoom: 14 }); } catch (e) {} }
    else m.removeLayer(l);
  }
  function itemOn(g, it) { var m = getMap(), l = kLayers[g.ki + "|" + it.key]; return !!(m && l && m.hasLayer(l)); }
  function kabOn(g) { return g.items.some(function (it) { return itemOn(g, it); }); }
  function setKab(g, on, noFit) {
    g.items.forEach(function (it) { setItem(g, it, on, false); });
    if (on && !noFit) { var m = getMap(), b = null; g.items.forEach(function (it) { var l = kLayers[g.ki + "|" + it.key]; if (l) b = b ? b.extend(l.getBounds()) : L.latLngBounds(l.getBounds().getSouthWest(), l.getBounds().getNorthEast()); }); if (m && b) try { m.fitBounds(b, { padding: [30, 30] }); } catch (e) {} }
  }

  /* ---------- "+ STA": jadikan ruas terkelola penuh ---------- */
  function sampleSta(it) {
    var pts = []; it.lines.forEach(function (s) { decode(s).forEach(function (p) { var l = pts[pts.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) pts.push(p); }); });
    if (pts.length < 2) return [];
    var out = [], step = 100, cum = 0, next = 0, res = [];
    for (var i = 1; i < pts.length; i++) {
      var d = hav(pts[i - 1], pts[i]); if (!d) continue;
      while (next <= cum + d + 1e-6) { var t = (next - cum) / d; res.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, next]); next += step; }
      cum += d;
    }
    var last = pts[pts.length - 1]; if (cum - res[res.length - 1][2] > 5) res.push([last[0], last[1], cum]);
    res.forEach(function (p) {
      var km = Math.floor(p[2] / 1000), m = Math.round(p[2] - km * 1000);
      out.push({ sta: km + "+" + String(m).padStart(3, "0"), lat: +p[0].toFixed(6), lng: +p[1].toFixed(6), tipe: Math.round(p[2]) % 500 === 0 ? "Label Utama" : "Titik Detail" });
    });
    return out;
  }
  function roadFor(g, it) {
    var rs = getRoads(), id = linkMap[g.ki + "|" + it.key], r = id && rs.filter(function (x) { return x.id === id; })[0];
    if (r) return r;
    return rs.filter(function (x) { return x && x.name === it.name && x.kabupaten === g.name; })[0] || null;
  }
  function addSta(g, it) {
    var ex = roadFor(g, it);
    if (ex) { linkMap[g.ki + "|" + it.key] = ex.id; ls(LS_LINK, linkMap); try { W.focusRoad(ex.id); } catch (e) {} return render(); }
    if (typeof W.addRoad !== "function") return toast("Fitur ruas belum siap, coba lagi sebentar", true);
    var pts = sampleSta(it); if (pts.length < 2) return toast("Geometri ruas terlalu pendek", true);
    var multi = G.filter(function (x) { return x.items.some(function (y) { return y.key === it.key; }); }).length > 1;
    var nm = multi ? it.name + " (" + g.name.replace(/^Kabupaten /, "Kab. ") + ")" : it.name;
    var r = W.addRoad(nm, pts, "Jalan Nasional (PETAQU)");
    if (r) { r.kabupaten = g.name; try { W.persist(); W.renderRoadList(); } catch (e) {} linkMap[g.ki + "|" + it.key] = r.id; ls(LS_LINK, linkMap); toast("Ruas \"" + nm + "\" siap dikelola (" + pts.length + " titik STA)"); }
    render();
  }
  var ACT = [
    ["staEdit", "⇄ STA", "Atur / tukar STA awal–akhir, kalibrasi lapangan"], ["renameRoad", "✎ Nama", "Ganti nama ruas"],
    ["playRouteAnimation", "▶ Animasi", "Putar animasi rute"], ["pqDroneRoad", "✈ Drone", "Terbangkan / simulasikan drone di ruas ini (pulang-pergi + Street View)"], ["openDashcamUpload", "🎥 Video", "Sinkron video dashcam"],
    ["openIriAnalysis", "📊 IRI", "Analisis IRI"], ["reIntervalRoad", "📏 Interval", "Edit interval STA"],
    ["autoFillRoadKm", "🧮 KM", "Hitung otomatis KM"], ["quickRoadPdf", "📄 PDF", "Unduh PDF ruas"],
    ["openExportModal", "⤴ Ekspor", "Ekspor ruas"], ["deleteRoad", "🗑 Hapus", "Hapus ruas"]
  ];
  var BST = "display:inline-flex!important;visibility:visible!important;opacity:1!important;align-items:center;height:28px;padding:0 9px;margin:0;border-radius:8px;border:1px solid #2b3a52;background:#0b1220;color:#cfe0f0;font-size:11px;font-weight:600;cursor:pointer;width:auto!important;pointer-events:auto!important";


  /* ---------- Editor STA: tukar awal/akhir, ubah nilai, kalibrasi patok lapangan ---------- */
  function parseSta(v) {
    v = String(v == null ? "" : v).trim().replace(",", "."); if (!v) return NaN;
    var m = v.match(/^(\d+)\s*\+\s*(\d{1,3}(?:\.\d+)?)$/); if (m) return (+m[1]) * 1000 + (+m[2]);
    return /^\d+(\.\d+)?$/.test(v) ? parseFloat(v) * 1000 : NaN;
  }
  function fmtSta(m) { m = Math.max(0, Math.round(m)); var k = Math.floor(m / 1000); return k + "+" + String(m - k * 1000).padStart(3, "0"); }
  function cumOf(pts) { var c = [0]; for (var i = 1; i < pts.length; i++) c.push(c[i - 1] + hav([+pts[i - 1].lat, +pts[i - 1].lng], [+pts[i].lat, +pts[i].lng])); return c; }
  function openSta(id) {
    var r = getRoads().filter(function (x) { return x.id === id; })[0]; if (!r || !r.points || r.points.length < 2) return toast("Ruas butuh minimal 2 titik STA", true);
    var old = document.getElementById("jkStaM"); if (old) old.remove();
    var pts = r.points, backup = pts.map(function (p) { return p.sta; }), snap = pts.slice();
    var cum = cumOf(pts), len = cum[cum.length - 1];
    var st = { a: parseSta(pts[0].sta), desc: false };
    if (isNaN(st.a)) st.a = 0;
    var lastV = parseSta(pts[pts.length - 1].sta); if (!isNaN(lastV) && lastV < st.a) st.desc = true;
    var m = document.createElement("div"); m.id = "jkStaM";
    m.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:14px";
    var inp = "width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid #2b3a52;background:#0b1220;color:#e6f1fb;font-size:13px", bt = "padding:8px 10px;border-radius:9px;border:1px solid #2b3a52;background:#101a2c;color:#cfe0f0;font-size:12px;cursor:pointer";
    m.innerHTML = '<div style="background:#0f1726;border:1px solid #2b3a52;border-radius:14px;padding:14px;width:min(380px,100%);max-height:90vh;overflow:auto;color:#cfe0f0;font-size:12px;display:flex;flex-direction:column;gap:9px">' +
      '<b style="font-size:14px;color:#e6f1fb">Atur STA — ' + esc(r.name) + '</b><small style="color:#8fa6bd">Panjang ' + (len / 1000).toFixed(2) + " km · " + pts.length + ' titik. Format STA: 10+500</small>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label>STA awal<input id="jsA" style="' + inp + '"></label><label>STA akhir<input id="jsB" style="' + inp + '"></label></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><button id="jsSw" style="' + bt + '">⇄ Tukar nilai awal↔akhir</button><button id="jsRev" style="' + bt + '">↺ Balik arah ruas</button><button id="jsZero" style="' + bt + '">STA awal = 0+000</button></div>' +
      '<div style="border-top:1px dashed #2b3a52;padding-top:8px"><b style="color:#e6f1fb">Kalibrasi patok lapangan</b><small style="display:block;color:#8fa6bd;margin:2px 0 6px">Titik ke-N di peta = STA patok sebenarnya; sisanya menyesuaikan.</small><div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end"><label>Titik ke-<input id="jsN" type="number" min="1" max="' + pts.length + '" value="1" style="' + inp + '"></label><label>STA lapangan<input id="jsV" style="' + inp + '" placeholder="mis. 8+200"></label><button id="jsCal" style="' + bt + '">Terapkan</button></div></div>' +
      '<div id="jsPrev" style="color:#8fa6bd"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button id="jsX" style="' + bt + '">Batal</button><button id="jsRst" style="' + bt + '">Kembalikan asli</button><button id="jsOk" style="' + bt + ';background:#06b6d4;color:#04121a;font-weight:700;border-color:#06b6d4">Simpan</button></div></div>';
    document.body.appendChild(m);
    function val(i) { return st.a + (st.desc ? -1 : 1) * cum[i]; }
    function show() {
      var b = val(pts.length - 1), A = document.getElementById("jsA"), B = document.getElementById("jsB");
      if (document.activeElement !== A) A.value = fmtSta(st.a); if (document.activeElement !== B) B.value = fmtSta(b);
      document.getElementById("jsPrev").textContent = "Pratinjau: " + fmtSta(st.a) + " → " + fmtSta(b) + (st.desc ? " (menurun)" : " (menaik)") + (b < 0 || st.a < 0 ? " ⚠ ada STA negatif" : "");
    }
    function $(i) { return document.getElementById(i); }
    $("jsA").onchange = function () { var v = parseSta(this.value); if (!isNaN(v)) st.a = v; show(); };
    $("jsB").onchange = function () { var v = parseSta(this.value); if (isNaN(v)) return show(); st.desc = v < st.a; if (!st.desc) { /* awal tetap, akhir diminta: sesuaikan awal agar panjang konsisten */ st.a = v - len; } else st.a = v + len; if (st.a < 0) st.a = Math.max(0, st.a); show(); };
    $("jsSw").onclick = function () { var b = val(pts.length - 1); st.desc = !st.desc; st.a = b < 0 ? 0 : b; show(); };
    $("jsRev").onclick = function () { pts = pts.slice().reverse(); cum = cumOf(pts); show(); toast("Arah ruas dibalik (belum disimpan)"); };
    $("jsZero").onclick = function () { st.a = 0; st.desc = false; show(); };
    $("jsCal").onclick = function () { var n = Math.round(+$("jsN").value) - 1, v = parseSta($("jsV").value); if (n < 0 || n >= pts.length || isNaN(v)) return toast("Isi nomor titik & STA lapangan dengan benar", true); st.a = v - (st.desc ? -1 : 1) * cum[n]; show(); };
    $("jsX").onclick = function () { r.points = snap; m.remove(); };
    $("jsRst").onclick = function () { pts = snap.slice(); cum = cumOf(pts); pts.forEach(function (p, i) { p.sta = backup[snap.indexOf(p)]; }); st.a = parseSta(backup[0]) || 0; st.desc = false; var lv = parseSta(backup[backup.length - 1]); if (!isNaN(lv) && lv < st.a) st.desc = true; show(); };
    $("jsOk").onclick = function () {
      if (val(pts.length - 1) < 0 || st.a < 0) return toast("STA tidak boleh negatif, ubah STA awal", true);
      pts.forEach(function (p, i) { p.sta = fmtSta(val(i)); });
      r.points = pts;
      try { W.persist(); W.renderRoadLayer(r); W.renderRoadList(); if (W.updateStats) W.updateStats(); } catch (e) { console.error(e); }
      m.remove(); toast("STA \"" + r.name + "\" disimpan: " + fmtSta(val(0)) + " → " + fmtSta(val(pts.length - 1))); render();
    };
    m.addEventListener("click", function (e) { if (e.target === m) $("jsX").click(); });
    show();
  }

  /* ---------- Hidupkan / matikan semua ruas ber-STA ---------- */
  function staItems() {
    var out = [], seen = {};
    (G || []).forEach(function (g) { g.items.forEach(function (it) { var r = roadFor(g, it); if (r) out.push({ g: g, it: it, r: r }); }); });
    return out.filter(function (x) { var k = x.g.ki + "|" + x.it.key; if (seen[k]) return false; seen[k] = 1; return true; });
  }
  function roadVis(list, on) {
    var m = getMap(), ml = null;
    try { ml = typeof layers !== "undefined" ? layers : W.layers; } catch (e) {}  /* layers milik aplikasi utama */
    list.forEach(function (x) {
      x.r.visible = on;
      var l = ml && ml[x.r.id];
      if (!l && on) { try { W.renderRoadLayer(x.r); l = ml && ml[x.r.id]; } catch (e) {} }
      if (l && l.group && m) { if (on) { if (!m.hasLayer(l.group)) l.group.addTo(m); } else if (m.hasLayer(l.group)) m.removeLayer(l.group); }
    });
    try { W.persist(); W.renderRoadList(); } catch (e) {}
  }
  /* buat ruas ber-STA otomatis untuk semua ruas yang belum punya (bertahap, simpan sekali) */
  var busy = false;
  function ensureAllSta(done) {
    var todo = [];
    G.forEach(function (g) { g.items.forEach(function (it) { if (!roadFor(g, it)) todo.push({ g: g, it: it }); }); });
    if (!todo.length) return done(0);
    if (typeof W.renderRoadLayer !== "function") return toast("Fitur ruas belum siap, coba lagi sebentar", true);
    if (!confirm("Buat titik STA (tiap 100 m) otomatis untuk " + todo.length + " ruas yang belum ber-STA?\nProses bisa memakan waktu beberapa saat.")) return done(-1);
    busy = true;
    var rs = getRoads(), made = 0, i = 0, info = document.getElementById("jkInfo"), stamp = Date.now().toString(36);
    var slug = typeof W.slugify === "function" ? W.slugify : function (v) { return String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "ruas"; };
    function step() {
      var t0 = Date.now();
      while (i < todo.length && Date.now() - t0 < 120) {
        var x = todo[i++], g = x.g, it = x.it, pts = sampleSta(it);
        if (pts.length < 2) continue;
        var multi = G.filter(function (y) { return y.items.some(function (z) { return z.key === it.key; }); }).length > 1;
        var nm = multi ? it.name + " (" + g.name.replace(/^Kabupaten /, "Kab. ") + ")" : it.name, pal = null;
        try { pal = typeof PALETTE !== "undefined" ? PALETTE : null; } catch (e) {}
        var r = { id: slug(nm) + "-" + stamp + (i % 1296).toString(36) + Math.random().toString(36).slice(2, 4), name: nm, sourceFile: "Jalan Nasional (PETAQU)", points: pts, color: pal ? pal[rs.length % pal.length] : it.color, visible: true, kabupaten: g.name, isManualDrawing: false };
        rs.push(r); linkMap[g.ki + "|" + it.key] = r.id; made++;
        try { W.renderRoadLayer(r); } catch (e) { console.error(e); }
      }
      if (info) info.textContent = "Membuat STA… " + i + " / " + todo.length;
      if (i < todo.length) return setTimeout(step, 20);
      ls(LS_LINK, linkMap);
      try { W.persist(); } catch (e) { toast("Penyimpanan penuh: sebagian ruas hanya tersimpan sementara", true); }
      try { W.renderRoadList(); if (W.updateStats) W.updateStats(); } catch (e) {}
      busy = false; done(made);
    }
    step();
  }
  function setStaAll(on) {
    if (busy) return toast("Sedang membuat STA, tunggu sebentar…", true);
    if (!on) {
      var l0 = staItems();
      if (!l0.length) return toast("Belum ada ruas ber-STA", true);
      l0.forEach(function (x) { setItem(x.g, x.it, false, false); });
      roadVis(l0, false); toast("Dimatikan: " + l0.length + " ruas ber-STA"); return render();
    }
    ensureAllSta(function (made) {
      if (made < 0) return render();
      var list = staItems();
      list.forEach(function (x) { setItem(x.g, x.it, true, false); });
      roadVis(list, true);
      toast("Dihidupkan: " + list.length + " ruas ber-STA" + (made ? " (" + made + " baru dibuat)" : ""));
      render();
    });
  }
  function setAllLines(on) {
    (G || []).forEach(function (g) { setKab(g, on, true); });
    roadVis(staItems(), on);
    var m = getMap();
    if (on && m) { var b = null; Object.keys(kLayers).forEach(function (k) { var l = kLayers[k]; if (l && m.hasLayer(l)) { try { var lb = l.getBounds(); b = b ? b.extend(lb) : L.latLngBounds(lb.getSouthWest(), lb.getNorthEast()); } catch (e) {} } }); if (b) try { m.fitBounds(b, { padding: [30, 30] }); } catch (e) {} }
    toast(on ? "Semua ruas dihidupkan" : "Semua ruas dimatikan");
    render();
  }

  /* ---------- UI ---------- */
  function css() {
    if (document.getElementById("jnkab-css")) return;
    var s = document.createElement("style"); s.id = "jnkab-css";
    s.textContent = "#jnKab{display:flex;flex-direction:column;gap:8px;border-top:1px dashed rgba(148,178,204,.25);padding-top:10px}" +
      ".jk-bar{display:flex;gap:6px;align-items:center}.jk-bar b{flex:1;font-size:12.5px;color:#e6f1fb}" +
      ".jk-b{background:#0f1726;border:1px solid rgba(148,178,204,.28);color:#cfe0f0;border-radius:8px;padding:5px 9px;font-size:11px;cursor:pointer}" +
      "#jkQ{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid rgba(148,178,204,.25);background:#0b1220;color:#e6f1fb;font-size:12px}" +
      ".jk-k{border:1px solid rgba(148,178,204,.22);background:#0f1726;border-radius:12px;overflow:hidden}" +
      ".jk-h{display:flex;align-items:center;gap:9px;padding:10px 12px;cursor:pointer}.jk-h i{color:#8fa6bd;font-size:11px;transition:transform .15s;width:10px}" +
      ".jk-k.o .jk-h i{transform:rotate(90deg)}.jk-h div{flex:1;min-width:0}.jk-h b{display:block;font-size:13px;color:#e6f1fb}.jk-h small{color:#9db3c9;font-size:11px}" +
      ".jk-sw{width:38px;height:22px;border-radius:99px;background:#2a3446;position:relative;border:0;cursor:pointer;flex:none}.jk-sw:after{content:'';position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#e6f1fb;transition:left .15s}.jk-sw.on{background:#06b6d4}.jk-sw.on:after{left:19px}" +
      ".jk-l{display:none;border-top:1px solid rgba(148,178,204,.15)}.jk-k.o .jk-l{display:block}" +
      ".jk-r{padding:8px 12px;border-bottom:1px solid rgba(148,178,204,.1)}.jk-r:last-child{border-bottom:0}.jk-rt{display:flex;align-items:center;gap:8px;cursor:pointer}" +
      ".jk-rt i{width:9px;height:9px;border-radius:50%;flex:none}.jk-rt div{flex:1;min-width:0}.jk-rt b{display:block;font-size:11.5px;color:#dbe9f7;line-height:1.3}.jk-rt small{font-size:10.5px;color:#8fa6bd}" +
      ".jk-sta{font:800 9.5px inherit;font-family:inherit;color:#34d399;background:transparent;border:1px solid #34d39966;border-radius:6px;padding:3px 7px;cursor:pointer;pointer-events:auto;position:relative;z-index:2;-webkit-tap-highlight-color:transparent}.jk-sta.on{background:#34d3992e}.jk-sta.off{color:#8fa6bd;border-color:#8fa6bd66;text-decoration:line-through;opacity:.8}" +
      ".jk-ac{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.jk-ac button{width:30px;height:28px;border-radius:8px;border:1px solid rgba(148,178,204,.25);background:#0b1220;color:#cfe0f0;cursor:pointer;font-size:12px}.jk-ac button.add{width:auto;padding:0 10px;font-weight:700;color:#34d399;border-color:#34d39966}" +
      ".jk-hide{width:100%;margin:2px 0}.jn-hid{display:none!important}" +
      "#jkSticky{position:sticky;top:0;z-index:20;display:flex;flex-direction:column;gap:8px;background:#0a0e17;padding:8px 0 8px;margin:0;box-shadow:0 6px 8px -6px rgba(0,0,0,.7)}" +
      ".jk-sta2{display:grid;grid-template-columns:1fr 1fr;gap:6px}.jk-sta2 .jk-b{padding:7px 6px;font-weight:700;text-align:center}" +
      ".jk-on{color:#34d399;border-color:#34d39988}.jk-off{color:#fb7185;border-color:#fb718588}.jk-b:hover{filter:brightness(1.25)}";
    document.head.appendChild(s);
  }
  function topEls() {
    var b = document.querySelector("#jnPanel .body"); if (!b) return [];
    return ["jnSearch", "jnChips", "jnList"].map(function (i) { return document.getElementById(i); }).concat(Array.prototype.slice.call(b.querySelectorAll(".jn-row"))).filter(Boolean);
  }
  function applyTop() {
    var h = !!ls(LS_HIDE), btn = document.getElementById("jkHide");
    topEls().forEach(function (e) { e.classList.toggle("jn-hid", h); });
    if (btn) btn.innerHTML = h ? '<i class="fa-solid fa-eye"></i> Tampilkan data di atas' : '<i class="fa-solid fa-eye-slash"></i> Sembunyikan data di atas';
  }
  var provOpen = {};
  var PROV_ALL = ["Aceh","Sumatera Utara","Sumatera Barat","Riau","Kepulauan Riau","Jambi","Sumatera Selatan","Kepulauan Bangka Belitung","Bengkulu","Lampung","DKI Jakarta","Banten","Jawa Barat","Jawa Tengah","DI Yogyakarta","Jawa Timur","Bali","Nusa Tenggara Barat","Nusa Tenggara Timur","Kalimantan Barat","Kalimantan Tengah","Kalimantan Selatan","Kalimantan Timur","Kalimantan Utara","Sulawesi Utara","Gorontalo","Sulawesi Tengah","Sulawesi Barat","Sulawesi Selatan","Sulawesi Tenggara","Maluku","Maluku Utara","Papua","Papua Barat","Papua Barat Daya","Papua Selatan","Papua Tengah","Papua Pegunungan"];
  var DIY_K = { "Kulon Progo": 1, Bantul: 1, Gunungkidul: 1, Sleman: 1, "Kota Yogyakarta": 1, Yogyakarta: 1 };
  function provOf(g) { return (g.prov) || (DIY_K[g.n] ? "DI Yogyakarta" : "Jawa Tengah"); }
  function render() {
    var box = document.getElementById("jnKab"); if (!box || !G) return;
    var q = filterQ.trim().toLowerCase(), h = "", shown = 0, B = {};
    G.forEach(function (g, gi) {
      var items = g.items.filter(function (it) { return !q || g.name.toLowerCase().indexOf(q) >= 0 || it.name.toLowerCase().indexOf(q) >= 0 || String(it.no).indexOf(q) >= 0; });
      if (!items.length) return; shown++;
      var h0 = h; h = "";
      var o = openKab[gi] || !!q, on = kabOn(g);
      h += '<div class="jk-k' + (o ? " o" : "") + '" data-g="' + gi + '"><div class="jk-h" data-a="open"><i class="fa-solid fa-chevron-right"></i><div><b>' + esc(g.name) + "</b><small>" + g.items.length + " ruas · " + fmtKm(g.km) + ' km' + (g.src === "OSM" ? " · OSM (perkiraan)" : "") + '</small></div><button class="jk-sw' + (on ? " on" : "") + '" data-a="kab" title="Tampilkan semua ruas di peta"></button></div>';
      if (o) {
        h += '<div class="jk-l">';
        items.forEach(function (it) {
          var ii = g.items.indexOf(it), r = roadFor(g, it), a = "";
          if (r) ACT.forEach(function (x) { a += '<button type="button" data-a="' + x[0] + '" title="' + x[2] + '" style="' + BST + (x[0] === "deleteRoad" ? ";color:#fb7185;border-color:#fb718566" : "") + '">' + x[1] + "</button>"; });
          else a = '<button type="button" class="add" style="' + BST + ';color:#34d399;border-color:#34d39966" data-a="sta" title="Jadikan ruas terkelola penuh (titik STA tiap 100 m)">+ STA</button>';
          h += '<div class="jk-r" data-i="' + ii + '"><div class="jk-rt" data-a="zoom"><i style="background:' + it.color + '"></i><div><b>' + esc(it.name) + "</b><small>No. " + esc(it.no || "-") + " · " + fmtKm(it.km) + " km</small></div>" + '<button type="button" class="jk-sta' + (r && r.visible ? " on" : " off") + '" data-a="staTog" title="' + (!r ? "Klik: buat titik STA otomatis (tiap 100 m) & tampilkan di peta" : r.visible ? "Titik STA tampil — klik untuk menyembunyikan" : "Titik STA disembunyikan — klik untuk menampilkan") + '">STA</button>' + '<button class="jk-sw' + (itemOn(g, it) ? " on" : "") + '" data-a="item" title="Tampil/sembunyi ruas ini"></button></div><div class="jk-ac" style="display:flex!important;flex-wrap:wrap;gap:5px;margin-top:7px">' + (r ? "" : "") + a + "</div></div>";
        });
        h += "</div>";
      }
      h += "</div>";
      var pv = provOf(g); (B[pv] = B[pv] || []).push(h); h = h0;
    });
    /* pengelompokan per provinsi (38 provinsi; yang belum ada datanya ditandai) */
    var done = {}, order = Object.keys(B).sort().concat(PROV_ALL.filter(function (n) { return !B[n]; }).sort());
    order.forEach(function (nm) {
      var has = !!B[nm]; if (!has && q && nm.toLowerCase().indexOf(q) < 0) return;
      var op = q ? true : (provOpen[nm] === undefined ? has : provOpen[nm]), cnt = has ? B[nm].length : 0;
      h += '<div class="jk-p" data-a="prov" data-p="' + esc(nm) + '" style="display:flex;align-items:center;gap:8px;margin:10px 0 6px;padding:8px 10px;border-radius:10px;background:' + (has ? "#12304a" : "#141b29") + ';border:1px solid ' + (has ? "#38bdf866" : "#2b3a52") + ';cursor:pointer;color:' + (has ? "#e6f1fb" : "#8fa6bd") + '"><i class="fa-solid fa-chevron-' + (op ? "down" : "right") + '" style="font-size:11px"></i><b style="flex:1;font-size:12.5px">' + esc(nm) + '</b><small>' + (has ? cnt + " kab/kota" : "belum ada data") + "</small></div>";
      if (op) h += has ? B[nm].join("") : '<div style="padding:2px 6px 8px"><small style="display:block;color:#8fa6bd;margin-bottom:6px">Belum dimuat.</small>' + (PBB[nm] ? '<button type="button" class="jk-b jk-on" data-a="provLoad" data-p="' + esc(nm) + '">' + (provBusy ? "Memuat…" : "Muat jalan nasional") + '</button>' : "") + "</div>";
    });
    document.getElementById("jkList").innerHTML = h || '<small style="color:#8fa6bd">Tidak ada hasil.</small>';
    var pb = document.getElementById("jkProvAll"); if (pb) { pb.textContent = provBusy ? "⏹ Hentikan pemuatan" : "Muat semua provinsi"; pb.className = "jk-b " + (provBusy ? "jk-off" : "jk-on"); }
    document.getElementById("jkInfo").textContent = PROV_ALL.length + " provinsi (" + (PROV_ALL.length - provsEmpty().length) + " berisi data) · " + G.length + " kab/kota · " + G.reduce(function (s, g) { return s + g.items.length; }, 0) + " ruas (tanpa duplikat) · " + staItems().length + " ber-STA" + (diagMsg ? " ⚠ " + diagMsg : "");
    var pg = document.getElementById("jkProg"); if (pg && !provBusy) pg.textContent = "";
  }

  /* ---------- muat jalan nasional SEMUA provinsi (otomatis, ringan, tahan gagal) ----------
     Sumber berurutan per provinsi: (1) server BIG (resmi) bila terjangkau, (2) OpenStreetMap via Overpass
     (jalan trunk + primary per batas provinsi = pendekatan jalan nasional). Hasil disederhanakan, ruas
     disambung, disimpan di IndexedDB (tanpa batas kuota 5 MB localStorage), dan hanya digambar saat dinyalakan. */
  var BIGQ = "https://geoservices.big.go.id/rbi/rest/services/BASEMAP/Rupabumi_Indonesia/MapServer/547/query";
  var BIGW = "AUTRJL=1 AND (TOLRJL IS NULL OR TOLRJL<>1)", BIGW2 = "FGSRJL IN (1,2) AND (TOLRJL IS NULL OR TOLRJL<>1)", lastErr = "", whereUse = "", diagMsg = "", progMsg = "";
  var LS_PV = "pq_jnprov_v1", LS_AUTO = "pq_jn_auto", NAS_COLOR = "#38bdf8", IDB_NAME = "pq_jnprov", TTL = 90 * 864e5;
  var OVP = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"], ovpFirst = 0;
  var ISO = {"Aceh":"ID-AC","Sumatera Utara":"ID-SU","Sumatera Barat":"ID-SB","Riau":"ID-RI","Kepulauan Riau":"ID-KR","Jambi":"ID-JA","Sumatera Selatan":"ID-SS","Kepulauan Bangka Belitung":"ID-BB","Bengkulu":"ID-BE","Lampung":"ID-LA","DKI Jakarta":"ID-JK","Banten":"ID-BT","Jawa Barat":"ID-JB","Jawa Timur":"ID-JI","Bali":"ID-BA","Nusa Tenggara Barat":"ID-NB","Nusa Tenggara Timur":"ID-NT","Kalimantan Barat":"ID-KB","Kalimantan Tengah":"ID-KT","Kalimantan Selatan":"ID-KS","Kalimantan Timur":"ID-KI","Kalimantan Utara":"ID-KU","Sulawesi Utara":"ID-SA","Gorontalo":"ID-GO","Sulawesi Tengah":"ID-ST","Sulawesi Barat":"ID-SR","Sulawesi Selatan":"ID-SN","Sulawesi Tenggara":"ID-SG","Maluku":"ID-MA","Maluku Utara":"ID-MU","Papua":"ID-PA","Papua Barat":"ID-PB","Papua Barat Daya":"ID-PD","Papua Selatan":"ID-PS","Papua Tengah":"ID-PT","Papua Pegunungan":"ID-PE"};
  /* kotak perkiraan [selatan, barat, utara, timur]; dipakai untuk BIG dan cadangan Overpass (segmen ditetapkan ke provinsi berpusat terdekat) */
  var PBB = {"Aceh":[1.9,94.9,6.1,98.4],"Sumatera Utara":[-0.1,97,4.4,100.5],"Sumatera Barat":[-3.4,98.5,0.9,101.9],"Riau":[-1.2,100,2.5,103.9],"Kepulauan Riau":[-1.3,103.4,4.2,109.2],"Jambi":[-2.8,101,-0.7,104.6],"Sumatera Selatan":[-4.9,102.1,-1.6,106.2],"Kepulauan Bangka Belitung":[-3.2,105,-1.4,108.3],"Bengkulu":[-5.6,101,-2.2,103.9],"Lampung":[-6.2,103.5,-3.7,106.3],"DKI Jakarta":[-6.4,106.65,-5.9,107],"Banten":[-7,105.1,-5.8,106.8],"Jawa Barat":[-7.9,106.4,-5.9,108.9],"Jawa Timur":[-8.8,110.9,-6.7,114.7],"Bali":[-8.9,114.4,-8,115.8],"Nusa Tenggara Barat":[-9.2,115.7,-8,119.2],"Nusa Tenggara Timur":[-11,118.9,-8.1,125.3],"Kalimantan Barat":[-3.1,108.7,2.1,114.3],"Kalimantan Tengah":[-3.6,110.7,0,115.9],"Kalimantan Selatan":[-4.3,114.3,-1.3,116.6],"Kalimantan Timur":[-2.6,113.8,2.4,119.1],"Kalimantan Utara":[1,114.8,4.4,118.1],"Sulawesi Utara":[0.2,123,5.6,127.2],"Gorontalo":[0.2,121.1,1,123.6],"Sulawesi Tengah":[-3.7,119.4,1.5,124.4],"Sulawesi Barat":[-3.6,118.7,-1,119.9],"Sulawesi Selatan":[-7.9,118.9,-1.9,121.9],"Sulawesi Tenggara":[-6.3,120.8,-2.8,124.6],"Maluku":[-8.4,125.7,-2.7,134.9],"Maluku Utara":[-2.5,124.2,2.6,129.2],"Papua":[-4,136,-1,141.1],"Papua Barat":[-4.3,131,-0.5,135.2],"Papua Barat Daya":[-1.7,129.3,0,132.6],"Papua Selatan":[-9.2,137.7,-5,141.1],"Papua Tengah":[-5.2,134.5,-3,138.5],"Papua Pegunungan":[-5,137.5,-3.6,141]};
  function pCenter(n) { var b = PBB[n]; return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  function inBB(pt, b) { return pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3]; }
  function pArea(n) { var b = PBB[n]; return (b[2] - b[0]) * (b[3] - b[1]); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function encNum(v) { v = v < 0 ? ~(v << 1) : v << 1; var o = ""; while (v >= 32) { o += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; } return o + String.fromCharCode(v + 63); }
  function encode(pts) { var la = 0, ln = 0, o = ""; pts.forEach(function (p) { var a = Math.round(p[0] * 1e5), b = Math.round(p[1] * 1e5); o += encNum(a - la) + encNum(b - ln); la = a; ln = b; }); return o; }
  function owner(pt, want) {
    var best = null, bd = 1e9;
    Object.keys(PBB).forEach(function (n) { if (!inBB(pt, PBB[n])) return; var c = pCenter(n), d = (c[0] - pt[0]) * (c[0] - pt[0]) + (c[1] - pt[1]) * (c[1] - pt[1]); if (d < bd) { bd = d; best = n; } });
    return best === want ? want : null;
  }
  function msgOf(e) { return (e && e.name === "AbortError") ? "waktu habis" : ((e && e.message) || String(e)); }

  /* --- penyederhanaan garis (Douglas-Peucker, iteratif) & penyambungan potongan way --- */
  function segD(p, a, b) { var x = b[1] - a[1], y = b[0] - a[0], l = x * x + y * y, t = l ? ((p[1] - a[1]) * x + (p[0] - a[0]) * y) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; var dx = a[1] + t * x - p[1], dy = a[0] + t * y - p[0]; return Math.sqrt(dx * dx + dy * dy); }
  function simplify(p, tol) {
    if (p.length < 3) return p;
    var keep = new Uint8Array(p.length), st = [[0, p.length - 1]], i; keep[0] = keep[p.length - 1] = 1;
    while (st.length) {
      var s = st.pop(), a = s[0], b = s[1], md = 0, mi = -1;
      for (i = a + 1; i < b; i++) { var d = segD(p[i], p[a], p[b]); if (d > md) { md = d; mi = i; } }
      if (mi > 0 && md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    return p.filter(function (_, i2) { return keep[i2]; });
  }
  function chain(ws) {
    var ends = {}, used = new Array(ws.length), out = [], i;
    function k(p) { return p[0] + "," + p[1]; }
    function take(key) { var l = ends[key]; if (!l) return -1; while (l.length) { var j = l.pop(); if (!used[j]) return j; } return -1; }
    ws.forEach(function (w, ix) { [k(w[0]), k(w[w.length - 1])].forEach(function (e) { (ends[e] = ends[e] || []).push(ix); }); });
    for (i = 0; i < ws.length; i++) {
      if (used[i]) continue; used[i] = true;
      var c = ws[i].slice(), j, w;
      for (;;) { j = take(k(c[c.length - 1])); if (j < 0) break; used[j] = true; w = ws[j]; if (k(w[0]) !== k(c[c.length - 1])) w = w.slice().reverse(); c = c.concat(w.slice(1)); }
      for (;;) { j = take(k(c[0])); if (j < 0) break; used[j] = true; w = ws[j]; if (k(w[w.length - 1]) !== k(c[0])) w = w.slice().reverse(); c = w.concat(c.slice(1)); }
      out.push(c);
    }
    return out;
  }
  /* elemen Overpass -> {NAMA: {nm, r, km, l:[polyline]}}, diproses bertahap agar UI tidak macet */
  async function osmToBy(els, pn, own) {
    var g = {}, by = {}, i, t0 = Date.now();
    for (i = 0; i < els.length; i++) {
      var e = els[i], t = e.tags || {}, nm = String(t.name || t.ref || "").trim();
      if (!nm || !e.geometry || e.geometry.length < 2) continue;
      var ll = e.geometry.map(function (p) { return [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5]; });
      if (own && owner(ll[ll.length >> 1], pn) !== pn) continue;
      var k = nm.toUpperCase(), o = g[k] || (g[k] = { nm: nm, r: "", w: [] });
      if (!o.r && t.ref) o.r = String(t.ref).trim();
      o.w.push(ll);
      if (Date.now() - t0 > 40) { await sleep(0); t0 = Date.now(); }
    }
    var ks = Object.keys(g);
    for (i = 0; i < ks.length; i++) {
      var q = g[ks[i]], ent = { nm: q.nm, r: q.r, km: 0, l: [] };
      chain(q.w).forEach(function (c) {
        var len = 0; for (var z = 1; z < c.length; z++) len += hav(c[z - 1], c[z]);
        c = simplify(c, 0.00005); if (c.length < 2) return;
        ent.km += len / 1000; ent.l.push(encode(c));
      });
      if (ent.l.length && ent.km >= 0.05) by[ks[i]] = ent;
      if (Date.now() - t0 > 40) { await sleep(0); t0 = Date.now(); }
    }
    return by;
  }

  /* --- cache IndexedDB (cadangan memori bila IndexedDB ditolak) --- */
  var idbP = null, mem = {};
  function idb() {
    if (idbP) return idbP;
    return (idbP = new Promise(function (res) {
      try { var r = indexedDB.open(IDB_NAME, 1); r.onupgradeneeded = function () { r.result.createObjectStore("p"); }; r.onsuccess = function () { res(r.result); }; r.onerror = r.onblocked = function () { res(null); }; } catch (e) { res(null); }
    }));
  }
  async function cacheGet(pn) {
    if (mem[pn]) return mem[pn];
    var db = await idb(), v = null;
    if (db) v = await new Promise(function (res) { try { var q = db.transaction("p").objectStore("p").get(pn); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; } catch (e) { res(null); } });
    if (!v) { try { var old = (JSON.parse(localStorage.getItem(LS_PV)) || {})[pn]; if (old) v = { by: old, ts: 0, src: "lama" }; } catch (e) {} }
    if (v && v.by && Object.keys(v.by).length) { mem[pn] = v; return v; }
    return null;
  }
  async function cacheSet(pn, by, src) {
    var v = { by: by, ts: Date.now(), src: src }; mem[pn] = v;
    var db = await idb(); if (!db) return;
    await new Promise(function (res) { try { var tx = db.transaction("p", "readwrite"); tx.objectStore("p").put(v, pn); tx.oncomplete = tx.onerror = tx.onabort = function () { res(); }; } catch (e) { res(); } });
  }

  /* ---------- deteksi kabupaten otomatis: ruas provinsi dipotong per batas kabupaten/kota ---------- */
  var KB = {};   /* cache batas per provinsi: [{n, rings:[[[lat,lng]..]], bb:[s,w,n,e]}] */
  function kabBounds(pn) {
    if (KB[pn]) return KB[pn];
    var src = W.PQ_KABBATAS && W.PQ_KABBATAS[pn]; if (!src) return (KB[pn] = []);
    return (KB[pn] = src.map(function (k) {
      var bb = [90, 180, -90, -180], rings = k[1].map(function (s) {
        var r = decode(s); r.forEach(function (p) { if (p[0] < bb[0]) bb[0] = p[0]; if (p[0] > bb[2]) bb[2] = p[0]; if (p[1] < bb[1]) bb[1] = p[1]; if (p[1] > bb[3]) bb[3] = p[1]; }); return r;
      });
      return { n: k[0], rings: rings, bb: bb };
    }));
  }
  function inKab(pt, k) {
    if (pt[0] < k.bb[0] || pt[0] > k.bb[2] || pt[1] < k.bb[1] || pt[1] > k.bb[3]) return false;
    var c = false;   /* even-odd lintas semua cincin (lubang ikut benar) */
    for (var r = 0; r < k.rings.length; r++) {
      var ring = k.rings[r];
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
        if ((yi > pt[0]) !== (yj > pt[0]) && pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi) c = !c;
      }
    }
    return c;
  }
  function kabAt(pt, ks, hint) {
    if (hint >= 0 && inKab(pt, ks[hint])) return hint;
    for (var i = 0; i < ks.length; i++) if (i !== hint && inKab(pt, ks[i])) return i;
    return -1;
  }
  /* potong satu garis jadi bagian-bagian per kabupaten; titik batas dicari dengan bagi-dua agar presisi */
  function splitLine(pts, ks) {
    var ids = [], last = -1, i, firstOk = -1;
    for (i = 0; i < pts.length; i++) { var k = kabAt(pts[i], ks, last); if (k >= 0) { last = k; if (firstOk < 0) firstOk = k; } ids.push(k >= 0 ? k : -2); }
    last = firstOk; for (i = 0; i < ids.length; i++) { if (ids[i] === -2) ids[i] = last; else last = ids[i]; }
    var parts = [], cur = [pts[0]], ck = ids[0];
    for (i = 1; i < pts.length; i++) {
      if (ids[i] === ck) { cur.push(pts[i]); continue; }
      var a = pts[i - 1], b = pts[i], lo = 0, hi = 1, m;
      for (var it = 0; it < 9; it++) { m = (lo + hi) / 2; var q = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]; if (kabAt(q, ks, ck) === ck) lo = m; else hi = m; }
      var cut = [Math.round((a[0] + (b[0] - a[0]) * lo) * 1e5) / 1e5, Math.round((a[1] + (b[1] - a[1]) * lo) * 1e5) / 1e5];
      cur.push(cut); parts.push({ k: ck, p: cur });
      cur = [cut, pts[i]]; ck = ids[i];
    }
    parts.push({ k: ck, p: cur });
    return parts;
  }
  function plen(c) { var l = 0; for (var z = 1; z < c.length; z++) l += hav(c[z - 1], c[z]); return l; }

  function addProvGroup(pn, byName, src) {
    if (G.some(function (g) { return g.prov === pn; })) return;
    var ks = kabBounds(pn), pi = Math.max(0, PROV_ALL.indexOf(pn)), base = 1000 + pi * 1000;
    var names = Object.keys(byName), groups = {};
    if (ks.length) {
      names.forEach(function (key) {
        var v = byName[key], acc = {};
        v.l.forEach(function (line) {
          var pts = decode(line); if (pts.length < 2) return;
          splitLine(pts, ks).forEach(function (pt) {
            if (pt.p.length < 2) return; var len = plen(pt.p); if (len < 20) return;
            var a = acc[pt.k] || (acc[pt.k] = { km: 0, l: [] }); a.km += len / 1000; a.l.push(encode(pt.p));
          });
        });
        Object.keys(acc).forEach(function (ki) {
          if (acc[ki].km < 0.05) return;
          var gr = groups[ki] || (groups[ki] = []);
          gr.push({ key: key.toUpperCase() + "|", ri: -1, name: v.nm, no: v.r || "", lintas: null, color: NAS_COLOR, km: acc[ki].km, lines: acc[ki].l });
        });
      });
      Object.keys(groups).map(Number).sort(function (a, b) { return ks[a].n.localeCompare(ks[b].n); }).forEach(function (ki) {
        var items = groups[ki]; items.sort(function (a, b) { return b.km - a.km; });
        G.push({ ki: base + ki, name: ks[ki].n, n: ks[ki].n.replace(/^(Kabupaten|Kota) /, ""), prov: pn, src: src, items: items, km: items.reduce(function (t, v) { return t + v.km; }, 0) });
      });
      return;
    }
    /* provinsi tanpa data batas kabupaten: tetap satu kelompok per provinsi */
    var items = names.map(function (k) { var v = byName[k]; return { key: k.toUpperCase() + "|", ri: -1, name: v.nm, no: v.r || "", lintas: null, color: NAS_COLOR, km: v.km || 0, lines: v.l }; });
    if (!items.length) return;
    items.sort(function (a, b) { return b.km - a.km; });
    G.push({ ki: base + 999, name: "Jalan Nasional " + pn, n: pn, prov: pn, src: src, items: items, km: items.reduce(function (t, v) { return t + v.km; }, 0) });
  }

  /* --- sumber 1: server BIG (kotak 2°, bertahap) --- */
  async function jget(url, ms) {
    var ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, ms || 12000);
    try { var r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error("HTTP " + r.status); var j = await r.json(); if (j.error) throw new Error(j.error.message || "server error"); return j; }
    finally { clearTimeout(to); }
  }
  var bigState = null; /* null=belum diuji, true/false */
  async function probeBig() {
    if (bigState !== null) return bigState;
    var cnt = function (w) { return jget(BIGQ + "?" + new URLSearchParams({ where: w, returnCountOnly: "true", f: "json" }).toString(), 9000).then(function (j) { return +j.count || 0; }); };
    try {
      if (await cnt(BIGW) > 0) { whereUse = BIGW; return (bigState = true); }
      if (await cnt(BIGW2) > 0) { whereUse = BIGW2; return (bigState = true); }
      lastErr = "filter BIG tidak cocok";
    } catch (e) { lastErr = msgOf(e); }
    return (bigState = false);
  }
  async function fetchBig(pn) {
    var b = PBB[pn], T = 2, by = {}, seenId = {}, jobs = [], i, j, fail = 0, done = 0;
    for (i = b[0]; i < b[2]; i += T) for (j = b[1]; j < b[3]; j += T) jobs.push([i, j, Math.min(i + T, b[2]), Math.min(j + T, b[3])]);
    var raw = {};
    async function cell(c) {
      var off = 0;
      for (var pg = 0; pg < 4; pg++) {
        var q = new URLSearchParams({ where: whereUse, geometry: c[1] + "," + c[0] + "," + c[3] + "," + c[2], geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "OBJECTID,NAMRJL", returnGeometry: "true", maxAllowableOffset: "0.0006", resultOffset: String(off), resultRecordCount: "1000", f: "geojson" });
        var jn = await jget(BIGQ + "?" + q.toString(), 15000), fs = jn.features || [];
        fs.forEach(function (f) {
          var pr = f.properties || {}, id = pr.OBJECTID != null ? pr.OBJECTID : f.id, g = f.geometry; if (!g) return;
          if (id != null) { if (seenId[id]) return; seenId[id] = 1; }
          var parts = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
          var nm = String(pr.NAMRJL || "").trim() || "(tanpa nama)", k = nm.toUpperCase();
          parts.forEach(function (pt) {
            if (pt.length < 2) return;
            var ll = pt.map(function (q2) { return [Math.round(q2[1] * 1e5) / 1e5, Math.round(q2[0] * 1e5) / 1e5]; });
            if (owner(ll[ll.length >> 1], pn) !== pn) return;
            (raw[k] || (raw[k] = { nm: nm, w: [] })).w.push(ll);
          });
        });
        if (!(jn.exceededTransferLimit || (jn.properties && jn.properties.exceededTransferLimit)) || !fs.length) break;
        off += fs.length;
      }
    }
    for (i = 0; i < jobs.length && !stopReq; i += 3) {
      await Promise.all(jobs.slice(i, i + 3).map(function (c) { return cell(c).catch(function (er) { fail++; lastErr = msgOf(er); }); }));
      done = Math.min(jobs.length, i + 3); progress(pn + " (BIG) " + done + "/" + jobs.length);
    }
    Object.keys(raw).forEach(function (k) {
      var e = { nm: raw[k].nm, r: "", km: 0, l: [] };
      chain(raw[k].w).forEach(function (c) { var len = 0; for (var z = 1; z < c.length; z++) len += hav(c[z - 1], c[z]); c = simplify(c, 0.00005); if (c.length < 2) return; e.km += len / 1000; e.l.push(encode(c)); });
      if (e.l.length) by[k] = e;
    });
    return { by: by, fail: fail };
  }

  /* --- sumber 2: OpenStreetMap / Overpass --- */
  async function ovpFetch(q) {
    var err = null, r, i;
    for (r = 0; r < 2 && !stopReq; r++) {
      for (i = 0; i < OVP.length && !stopReq; i++) {
        var u = OVP[(i + ovpFirst) % OVP.length], ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, 110000);
        try {
          var res = await fetch(u, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ac.signal });
          if (!res.ok) throw new Error("HTTP " + res.status);
          var j = await res.json();
          if (j.remark && !(j.elements && j.elements.length) && /error|timed out|memory/i.test(j.remark)) throw new Error(String(j.remark).slice(0, 80));
          ovpFirst = (i + ovpFirst) % OVP.length; return j;
        } catch (e) { err = new Error(u.split("/")[2] + ": " + msgOf(e)); }
        finally { clearTimeout(to); }
      }
      if (r === 0) await sleep(5000);
    }
    throw err || new Error("dihentikan");
  }
  async function fetchOsm(pn) {
    var F = '[highway~"^(trunk|primary)$"]', out = ";out tags geom qt;", H = "[out:json][timeout:100][maxsize:536870912];";
    progress(pn + " (OSM) mengunduh…");
    var q = H + 'area["ISO3166-2"="' + ISO[pn] + '"]["boundary"="administrative"]->.a;(way(area.a)' + F + "[name];way(area.a)" + F + "[!name][ref];)" + out;
    var j = await ovpFetch(q), els = j.elements || [], own = false;
    if (!els.length) { /* batas provinsi belum ada di OSM: pakai kotak perkiraan + saring kepemilikan */
      var b = PBB[pn].join(","); own = true; progress(pn + " (OSM, kotak) mengunduh…");
      j = await ovpFetch(H + "(way(" + b + ")" + F + "[name];way(" + b + ")" + F + "[!name][ref];)" + out); els = j.elements || [];
    }
    progress(pn + " (OSM) mengolah " + els.length + " ruas…");
    return { by: await osmToBy(els, pn, own), fail: 0 };
  }

  /* --- satu provinsi: cache -> BIG -> OSM --- */
  async function loadOne(pn) {
    if (!PBB[pn] || !G) return "skip";
    var c = await cacheGet(pn);
    if (c) { addProvGroup(pn, c.by, c.src); return "cache"; }
    var r = null, src = "", errs = [];
    if (await probeBig()) {
      try { r = await fetchBig(pn); src = "BIG"; if (r.fail || !Object.keys(r.by).length) { if (r.fail) errs.push("BIG: " + lastErr); r = r.fail ? null : r; } } catch (e) { errs.push("BIG: " + msgOf(e)); r = null; }
    }
    if (stopReq) return "stop";
    if (!r || !Object.keys(r.by).length) {
      try { r = await fetchOsm(pn); src = "OSM"; } catch (e) { errs.push("OSM: " + msgOf(e)); r = null; }
    }
    if (stopReq) return "stop";
    if (!r) throw new Error(errs.join(" | ") || "gagal");
    if (!Object.keys(r.by).length) return "empty";
    await cacheSet(pn, r.by, src);
    addProvGroup(pn, r.by, src);
    return "net";
  }
  var provBusy = false, stopReq = false, rT = 0;
  function progress(m) { progMsg = m; var e = document.getElementById("jkProg"); if (e) e.textContent = m ? "⏳ " + m : ""; }
  function schedRender() { if (rT) return; rT = setTimeout(function () { rT = 0; try { render(); } catch (e) {} }, 300); }
  function provsEmpty() { return Object.keys(PBB).filter(function (n) { return !G.some(function (g) { return provOf(g) === n; }); }); }

  /* muat semua provinsi yang masih kosong: cache dulu (instan), lalu jaringan satu per satu (kecil dulu) */
  async function loadAll(auto) {
    if (provBusy || !G) return;
    provBusy = true; stopReq = false; diagMsg = ""; if (!auto) ls(LS_AUTO, true);
    var ok = 0, net = 0, fails = [], list = provsEmpty().sort(function (a, b) { return pArea(a) - pArea(b); }), i, retry = [];
    render();
    try {
      for (i = 0; i < list.length && !stopReq; i++) { var c = await cacheGet(list[i]); if (c) { addProvGroup(list[i], c.by, c.src); ok++; } }
      list = provsEmpty().sort(function (a, b) { return pArea(a) - pArea(b); });
      if (list.length) { schedRender(); }
      for (var pass = 0; pass < 2 && list.length && !stopReq; pass++) {
        retry = [];
        for (i = 0; i < list.length && !stopReq; i++) {
          progress("Provinsi " + (i + 1) + "/" + list.length + (pass ? " (ulang)" : "") + " — " + list[i]);
          try { var r = await loadOne(list[i]); if (r === "net" || r === "cache") { ok++; if (r === "net") net++; } }
          catch (e) { retry.push(list[i]); if (pass) fails.push(list[i] + " — " + msgOf(e)); }
          await sleep(700);
        }
        list = retry;
      }
    } finally {
      provBusy = false; progress("");
      var left = provsEmpty().length;
      if (fails.length) diagMsg = fails.length + " provinsi gagal: " + fails[0] + (fails.length > 1 ? " (+" + (fails.length - 1) + " lagi)" : "") + ". Tekan \"Muat semua provinsi\" untuk mengulang yang gagal.";
      else if (stopReq) diagMsg = "Dihentikan. Sisa " + left + " provinsi belum dimuat.";
      render();
    }
    if (!(auto && !net)) toast(stopReq ? "Pemuatan dihentikan" : "Selesai: " + ok + " provinsi dimuat" + (fails.length ? ", " + fails.length + " gagal" : ""), !!fails.length);
  }
  async function loadProvList(list) {
    if (list.length !== 1) return loadAll(false);
    if (provBusy) return toast("Sedang memuat data provinsi, tunggu sebentar…", true);
    var pn = list[0]; provBusy = true; stopReq = false; diagMsg = ""; render();
    try {
      var r = await loadOne(pn);
      var gs = G.filter(function (g) { return g.prov === pn; });
      if (gs.length) { gs.forEach(function (g) { setKab(g, true, true); }); toast(pn + ": " + gs.length + " kab/kota, " + gs.reduce(function (t, g) { return t + g.items.length; }, 0) + " ruas dimuat & ditampilkan"); }
      else toast(pn + ": tidak ada data jalan nasional" + (r === "empty" ? "" : ""), true);
    } catch (e) { diagMsg = pn + ": " + msgOf(e); toast(pn + " gagal — " + msgOf(e), true); }
    finally { provBusy = false; progress(""); render(); }
  }
  function toggleAll() { if (provBusy) { stopReq = true; ls(LS_AUTO, false); progress("Menghentikan…"); return; } loadAll(false); }
  function onClick(e) {
    var t = e.target.closest("[data-a]"); if (!t) return;
    var kEl = t.closest(".jk-k"), g = kEl && G[+kEl.dataset.g], rEl = t.closest(".jk-r"), it = rEl && g && g.items[+rEl.dataset.i], a = t.dataset.a;
    e.stopPropagation();
    if (a === "provLoad") { loadProvList([t.dataset.p]); return; }
    if (a === "provAll") { toggleAll(); return; }
    if (a === "prov") { var pn = t.dataset.p, cur = provOpen[pn]; if (cur === undefined) cur = G.some(function (x) { return provOf(x) === pn; }); provOpen[pn] = !cur; return render(); }
    if (a === "open") { openKab[kEl.dataset.g] = !openKab[kEl.dataset.g]; return render(); }
    if (a === "kab") { setKab(g, !kabOn(g)); return render(); }
    if (a === "item") { setItem(g, it, !itemOn(g, it), false); return render(); }
    if (a === "zoom") { setItem(g, it, true, true); return render(); }
    if (a === "sta") return addSta(g, it);
    if (a === "staTog") {
      if (busy) return toast("Sedang membuat STA, tunggu sebentar…", true);
      var rt = roadFor(g, it);
      if (!rt) {                       /* belum ber-STA: buat otomatis lalu tampilkan (sama seperti "Hidupkan semua STA") */
        addSta(g, it); rt = roadFor(g, it); if (!rt) return;
        setItem(g, it, true, true); roadVis([{ r: rt }], true);
        return render();
      }
      var turnOn = !rt.visible;        /* sudah ber-STA: ON/OFF garis + titik STA, sama seperti tombol "semua STA" */
      setItem(g, it, turnOn, false); roadVis([{ r: rt }], turnOn);
      toast("Titik STA \"" + rt.name + "\": " + (turnOn ? "ON" : "OFF"));
      return render();
    }
    var r = it && roadFor(g, it); if (!r) return;
    if (a === "staEdit") return openSta(r.id);
    var fn = typeof W[a] === "function" ? W[a] : null;
    if (!fn) { try { fn = (0, eval)("typeof " + a + "==='function'?" + a + ":null"); } catch (er) {} }
    if (!fn) return toast("Fitur " + a + " belum tersedia di versi ini", true);
    try { fn(r.id); } catch (er) { console.error(er); toast("Gagal membuka fitur: " + (er && er.message), true); }
    if (a === "deleteRoad" || a === "renameRoad") setTimeout(render, 700);
  }
  function mount() {
    var body = document.querySelector("#jnPanel .body"); if (!body || document.getElementById("jnKab") || !build()) return false;
    css();
    var box = document.createElement("div"); box.id = "jnKab";
    box.innerHTML = '<button class="jk-b jk-hide" id="jkHide"></button>' +
      '<div id="jkSticky"><div class="jk-bar"><b>Per Kabupaten</b><button class="jk-b jk-on" id="jkAllOn" title="Tampilkan semua ruas di peta">Hidupkan semua</button><button class="jk-b jk-off" id="jkAllOff" title="Matikan semua ruas di peta">Matikan semua</button></div>' +
      '<div class="jk-sta2"><button class="jk-b jk-on" id="jkProvAll" data-a="provAll" title="Muat jalan nasional semua provinsi yang masih kosong dari server BIG (butuh internet; hasil disimpan di perangkat)" style="width:100%">Muat semua provinsi</button></div>' +
      '<div class="jk-sta2"><button class="jk-b jk-on" id="jkStaOn" title="Tampilkan semua ruas yang sudah ber-STA">Hidupkan semua STA</button><button class="jk-b jk-off" id="jkStaOff" title="Sembunyikan semua ruas yang sudah ber-STA">Matikan semua STA</button></div>' +
      '<small id="jkInfo" style="color:#8fa6bd;font-size:11px"></small><small id="jkProg" style="color:#38bdf8;font-size:11px"></small>' +
      '<input id="jkQ" type="search" placeholder="Cari kabupaten / ruas / No. Link…" autocomplete="off"></div><div id="jkList" style="display:flex;flex-direction:column;gap:8px"></div>';
    body.appendChild(box);
    try { linkMap = ls(LS_LINK) || {}; } catch (e) { linkMap = {}; }
    document.getElementById("jkHide").onclick = function () { ls(LS_HIDE, !ls(LS_HIDE)); applyTop(); };
    document.getElementById("jkAllOff").onclick = function () { setAllLines(false); };
    document.getElementById("jkProvAll").onclick = function (ev) { ev.stopPropagation(); toggleAll(); };
    document.getElementById("jkAllOn").onclick = function () { setAllLines(true); };
    document.getElementById("jkStaOn").onclick = function () { setStaAll(true); };
    document.getElementById("jkStaOff").onclick = function () { setStaAll(false); };
    document.getElementById("jkQ").oninput = function () { filterQ = this.value; render(); };
    document.getElementById("jkList").addEventListener("click", onClick);
    var jb = document.getElementById("jnBtn"); if (jb) jb.addEventListener("click", function () { setTimeout(render, 50); });
    applyTop(); render();
    /* otomatis: isi data tiap provinsi di latar belakang (hemat: lewati bila mode hemat data / offline / pernah dihentikan pengguna) */
    try {
      var cn = navigator.connection || {};
      if (ls(LS_AUTO) !== false && navigator.onLine !== false && !cn.saveData) setTimeout(function () { loadAll(true); }, 1500);
    } catch (e) {}
    return true;
  }
  W.PQ_JNKAB = { openSta: openSta, build: build, decode: decode, render: render, loadAll: function () { return loadAll(false); }, _t: { group: function (pn, by, src) { G = G || []; addProvGroup(pn, by, src); return G; }, simplify: simplify, chain: chain, encode: encode, osmToBy: osmToBy } };
  if (typeof document !== "undefined" && document.addEventListener) {
    var n = 0, t = setInterval(function () { if (mount() || ++n > 40) clearInterval(t); }, 500);
  }
})();
