/* PETAQU — Bagikan peta aktif (HTML & PDF).
   • Dua tombol di toolbar kanan peta (#mapToolbar): "HTML" dan "PDF".
   • Yang dibagikan = peta yang SEDANG AKTIF: hanya ruas yang tampil di peta (+ jembatan bila lapisannya menyala),
     dengan tampilan peta (pusat, zoom, peta dasar) seperti yang sedang dilihat.
   • HTML  : memakai ulang generator laporan HTML bawaan (exportHTMLReport) -> file mandiri, bisa dibuka di browser mana pun.
   • PDF   : tangkapan peta saat ini + judul + daftar ruas, dibuat di browser (jsPDF + html2canvas yang sudah dimuat aplikasi).
   • Hemat kuota: tanpa library baru, tanpa jaringan tambahan, tanpa server/AI. Semua diproses di perangkat.
   • Berbagi: memakai menu Bagikan bawaan HP/browser (Web Share API); bila tidak didukung, file otomatis diunduh. */
(function () {
  "use strict";
  if (window.__pqShare) return;
  window.__pqShare = 1;

  var busy = false;

  function T(msg, err) { try { toast(msg, !!err); } catch (e) { /* abaikan */ } }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes());
  }

  /* ---------- data peta aktif: baca objek yang BENAR-BENAR ada di peta ---------- */
  var MAX_PTS = 200000, MAX_MK = 3000;
  function r5(n) { return Math.round(n * 1e5) / 1e5; }
  function ring(a, out) {
    if (!a || !a.length) return;
    if (typeof a[0].lat === "number") { out.push(a.map(function (p) { return [r5(p.lat), r5(p.lng)]; })); return; }
    a.forEach(function (x) { ring(x, out); });
  }
  function tipText(l) {
    try {
      var t = l.getTooltip && l.getTooltip();
      var c = t && t.getContent && t.getContent();
      if (!c) { var p = l.getPopup && l.getPopup(); c = p && p.getContent && p.getContent(); }
      if (!c) return "";
      if (typeof c === "function") return "";
      if (typeof c === "string") { var d = document.createElement("div"); d.innerHTML = c; return (d.textContent || "").trim().slice(0, 200); }
      return (c.textContent || "").trim().slice(0, 200);
    } catch (e) { return ""; }
  }
  function iconText(l) {
    try {
      var h = l.options && l.options.icon && l.options.icon.options && l.options.icon.options.html;
      if (!h) return "";
      if (typeof h !== "string") return (h.textContent || "").trim().slice(0, 200);
      var d = document.createElement("div"); d.innerHTML = h; return (d.textContent || "").trim().slice(0, 200);
    } catch (e) { return ""; }
  }
  function styleOf(o) {
    return { color: o.color, weight: o.weight, opacity: o.opacity, dashArray: o.dashArray || null, fill: o.fill, fillColor: o.fillColor, fillOpacity: o.fillOpacity, radius: o.radius };
  }
  function activeData() {
    var out = { lines: [], marks: [], nLine: 0, nMark: 0, pts: 0, roads: [], bridges: [] };
    if (typeof map === "undefined" || !map) return out;
    var raw = [];
    map.eachLayer(function (l) {
      var o = l.options || {};
      if (l instanceof L.Circle) return;
      if (l instanceof L.Polyline) {
        if (o.weight === 0 || o.opacity === 0 || o.stroke === false && !o.fill) return;
        var rings = []; ring(l.getLatLngs(), rings);
        if (!rings.length) return;
        raw.push({ k: l instanceof L.Polygon ? "g" : "l", p: rings, s: styleOf(o), t: tipText(l) });
      } else if (l instanceof L.CircleMarker) {
        var ll = l.getLatLng(); if (!ll) return;
        raw.push({ k: "c", p: [r5(ll.lat), r5(ll.lng)], s: styleOf(o), t: tipText(l) });
      } else if (l instanceof L.Marker) {
        var m = l.getLatLng(); if (!m) return;
        var tx = iconText(l);
        var isDiv = !!(o.icon && o.icon.options && o.icon.options.html !== undefined);
        raw.push({ k: isDiv ? "d" : "m", p: [r5(m.lat), r5(m.lng)], t: tx || tipText(l) });
      }
    });
    var total = 0;
    raw.forEach(function (f) { if (f.k === "l" || f.k === "g") f.p.forEach(function (r) { total += r.length; }); });
    var step = total > MAX_PTS ? Math.ceil(total / MAX_PTS) : 1;
    raw.forEach(function (f) {
      if (f.k === "l" || f.k === "g") {
        if (step > 1) f.p = f.p.map(function (r) {
          if (r.length <= 3) return r;
          var q = r.filter(function (_, i) { return i % step === 0; });
          if (q[q.length - 1] !== r[r.length - 1]) q.push(r[r.length - 1]);
          return q;
        });
        f.p.forEach(function (r) { out.pts += r.length; });
        out.lines.push(f); out.nLine++;
      } else if (out.marks.length < MAX_MK) {
        if (f.k === "d" && !f.t) return;
        out.marks.push(f); out.nMark++;
      }
    });
    try { out.roads = roads.filter(function (r) { return r && r.visible; }); } catch (e) { /* abaikan */ }
    return out;
  }
  function kmOf(rs) {
    var t = 0;
    try { rs.forEach(function (r) { t += roadLengthKm(r) || 0; }); } catch (e) { /* abaikan */ }
    return t;
  }
  function summary(d) {
    var p = [];
    if (d.nLine) p.push(d.nLine + " garis");
    if (d.nMark) p.push(d.nMark + " penanda");
    if (d.roads.length) p.push(d.roads.length + " ruas survei (" + kmOf(d.roads).toFixed(1) + " km)");
    return p.join(", ") || "peta kosong";
  }

  /* ---------- kirim / unduh ---------- */
  function saveBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  async function deliver(blob, name, mime, text) {
    try {
      var f = new File([blob], name, { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        await navigator.share({ title: "Peta PETAQU", text: text, files: [f] });
        T("Berhasil dibagikan");
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return; /* pengguna membatalkan */
    }
    saveBlob(blob, name);
    T("File diunduh: " + name);
  }

  /* ---------- HTML (mandiri: Leaflet dari CDN, data digambar ulang dari isi peta) ---------- */
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function buildHtml(d) {
    var c = map.getCenter(), bm = null;
    try { bm = BASEMAPS.find(function (b) { return b.id === currentBaseId; }); } catch (e) { /* abaikan */ }
    var bmd = bm ? { url: bm.url, opts: bm.opts || {} } : { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", opts: { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" } };
    var data = { c: [c.lat, c.lng], z: map.getZoom(), b: bmd, f: d.lines.concat(d.marks), n: "Peta PETAQU \u2014 " + new Date().toLocaleString("id-ID"), i: summary(d) };
    var json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    var run = function () {
      var D = DATA;
      var m = L.map("map", { preferCanvas: true, zoomControl: true }).setView(D.c, D.z);
      L.tileLayer(D.b.url, Object.assign({ maxZoom: 19 }, D.b.opts)).addTo(m);
      function tip(l, t) { if (t) { var e = document.createElement("span"); e.textContent = t; l.bindTooltip(e, { sticky: true }); } }
      D.f.forEach(function (f) {
        var s = f.s || {}, l;
        if (f.k === "l") l = L.polyline(f.p, { color: s.color || "#3388ff", weight: s.weight || 3, opacity: s.opacity == null ? 1 : s.opacity, dashArray: s.dashArray || null });
        else if (f.k === "g") l = L.polygon(f.p, { color: s.color || "#3388ff", weight: s.weight || 2, opacity: s.opacity == null ? 1 : s.opacity, fill: s.fill !== false, fillColor: s.fillColor || s.color, fillOpacity: s.fillOpacity == null ? .2 : s.fillOpacity });
        else if (f.k === "c") l = L.circleMarker(f.p, { radius: s.radius || 5, color: s.color || "#22d3ee", weight: s.weight || 1, fillColor: s.fillColor || s.color || "#22d3ee", fillOpacity: s.fillOpacity == null ? .8 : s.fillOpacity });
        else if (f.k === "d") l = L.circleMarker(f.p, { radius: 4, color: "#0a0e17", weight: 1, fillColor: "#22d3ee", fillOpacity: 1 });
        else l = L.marker(f.p);
        tip(l, f.t); l.addTo(m);
      });
      var info = L.control({ position: "topleft" });
      info.onAdd = function () { var d = L.DomUtil.create("div", "pqi"); d.innerHTML = "<b></b><br><small></small>"; d.firstChild.textContent = D.n; d.lastChild.textContent = D.i; return d; };
      info.addTo(m);
    };
    var html = '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc("Peta PETAQU") + '</title>' +
      '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">' +
      '<style>html,body,#map{height:100%;margin:0}body{font-family:system-ui,sans-serif}.pqi{background:#0f1521ee;color:#e6f1ff;padding:8px 12px;border-radius:10px;border:1px solid #22d3ee66;font-size:12px;max-width:70vw}.pqi small{color:#9fb3c8}</style></head><body><div id="map"></div>' +
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>' +
      '<script>var DATA=' + json + ';(' + run.toString() + ')();<\/script></body></html>';
    return new Blob([html], { type: "text/html" });
  }

  /* ---------- PDF ---------- */
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]);
  }
  async function snapMap() {
    if (typeof html2canvas !== "function") return null;
    try {
      var el = document.getElementById("map");
      var sc = Math.min(2, window.devicePixelRatio || 1);
      return await withTimeout(html2canvas(el, { useCORS: true, allowTaint: false, backgroundColor: "#0a0e17", scale: sc, logging: false }), 25000);
    } catch (e) { return null; }
  }
  async function buildPdf(d) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("Library PDF belum siap, coba lagi");
    var cv = await snapMap();
    var land = !cv || cv.width >= cv.height;
    var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4", orientation: land ? "landscape" : "portrait" });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 30;

    var info = "";
    try {
      var c = map.getCenter();
      info = "Pusat " + c.lat.toFixed(5) + ", " + c.lng.toFixed(5) + " | Zoom " + map.getZoom();
      var bm = (typeof BASEMAPS !== "undefined" && typeof currentBaseId !== "undefined") ? BASEMAPS.find(function (b) { return b.id === currentBaseId; }) : null;
      if (bm && bm.name) info += " | Peta dasar: " + bm.name;
    } catch (e) { /* abaikan */ }

    doc.setFontSize(15); doc.setTextColor(20);
    doc.text("PETA AKTIF PETAQU", M, 32);
    doc.setFontSize(9); doc.setTextColor(110);
    doc.text(summary(d) + " | " + new Date().toLocaleString("id-ID"), M, 46);
    if (info) doc.text(info, M, 58);

    var y = 68;
    if (cv) {
      var maxW = W - M * 2, maxH = H - y - 70;
      var f = Math.min(maxW / cv.width, maxH / cv.height);
      var w = cv.width * f, h = cv.height * f;
      doc.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", (W - w) / 2, y, w, h);
      y += h + 18;
    } else {
      doc.setTextColor(180, 60, 60);
      doc.text("Gambar peta tidak dapat diambil (dibatasi penyedia peta dasar). Daftar ruas tetap disertakan.", M, y + 6);
      y += 24;
    }

    doc.setFontSize(9.5); doc.setTextColor(30);
    var lines = [];
    if (d.roads.length) d.roads.slice(0, 60).forEach(function (r) {
      var L = 0; try { L = roadLengthKm(r) || 0; } catch (e) { /* abaikan */ }
      lines.push("\u2022 " + String(r.name || "-").slice(0, 90) + " (" + L.toFixed(2) + " km)");
    });
    if (d.roads.length > 60) lines.push("...dan " + (d.roads.length - 60) + " ruas lainnya");
    try {
      var lg = document.getElementById("legend");
      var lt = lg ? (lg.textContent || "").replace(/\s{2,}/g, " ").trim() : "";
      if (lt && !d.roads.length) lines.push("Legenda: " + lt.slice(0, 600));
    } catch (e) { /* abaikan */ }
    lines.forEach(function (ln) {
      doc.splitTextToSize(ln, W - M * 2).forEach(function (part) {
        if (y > H - 24) { doc.addPage("a4", land ? "landscape" : "portrait"); y = 34; }
        doc.text(part, M, y); y += 13;
      });
    });
    return doc.output("blob");
  }

  /* ---------- aksi tombol ---------- */
  function setBusy(on) {
    busy = on;
    ["pqShareHtml", "pqSharePdf"].forEach(function (id) {
      var b = document.getElementById(id);
      if (!b) return;
      b.disabled = on;
      b.style.opacity = on ? ".55" : "";
    });
  }
  async function run(kind) {
    if (busy) return;
    var d = activeData();
    if (kind === "html" && !d.nLine && !d.nMark) { T("Tidak ada objek (garis/penanda) di peta untuk dibagikan", true); return; }
    setBusy(true);
    try {
      var text = "Peta PETAQU: " + summary(d) + ".";
      if (kind === "html") {
        T("Menyiapkan HTML...");
        await deliver(buildHtml(d), "peta_aktif_" + stamp() + ".html", "text/html", text);
      } else {
        T("Menyiapkan PDF...");
        var pb = await buildPdf(d);
        await deliver(pb, "peta_aktif_" + stamp() + ".pdf", "application/pdf", text);
      }
    } catch (e) {
      T((e && e.message) || "Gagal membagikan peta", true);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- tombol di toolbar kanan ---------- */
  function mk(id, icon, label, title, kind) {
    var b = document.createElement("button");
    b.type = "button";
    b.id = id;
    b.className = "tool-btn";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.style.cssText = "flex-direction:column;gap:2px;line-height:1";
    b.innerHTML = '<i class="fa-solid ' + icon + '"></i><span style="font-size:8px;font-weight:800;letter-spacing:.3px">' + label + "</span>";
    b.addEventListener("click", function () { run(kind); });
    return b;
  }
  function inject() {
    var tb = document.getElementById("mapToolbar");
    if (!tb || document.getElementById("pqShareHtml")) return;
    var h = mk("pqShareHtml", "fa-file-code", "HTML", "Bagikan peta aktif sebagai HTML", "html");
    var p = mk("pqSharePdf", "fa-file-pdf", "PDF", "Bagikan peta aktif sebagai PDF", "pdf");
    var anchor = tb.querySelector('button[onclick*="fitAllBounds"]');
    var ref = anchor ? anchor.nextSibling : null;
    tb.insertBefore(h, ref);
    tb.insertBefore(p, h.nextSibling);
  }
  function start() {
    inject();
    var tb = document.getElementById("mapToolbar");
    if (tb && window.MutationObserver) {
      new MutationObserver(function () { if (!document.getElementById("pqShareHtml")) inject(); }).observe(tb, { childList: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.PETAQU_SHARE = { html: function () { return run("html"); }, pdf: function () { return run("pdf"); } };
})();
