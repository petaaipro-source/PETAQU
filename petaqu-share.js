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

  /* ---------- data peta aktif ---------- */
  function activeData() {
    var rs = [], br = [];
    try { rs = roads.filter(function (r) { return r && r.visible; }); } catch (e) { rs = []; }
    try {
      if (rs.length && jembatanVisible && Array.isArray(JEMBATAN_DB)) {
        if (rs.length < roads.length) {
          var names = {};
          rs.forEach(function (r) { names[r.name] = 1; });
          br = JEMBATAN_DB.filter(function (b) { return names[b.ruas]; });
        } else br = JEMBATAN_DB.slice();
      }
    } catch (e) { br = []; }
    return { roads: rs, bridges: br };
  }
  function kmOf(rs) {
    var t = 0;
    try { rs.forEach(function (r) { t += roadLengthKm(r) || 0; }); } catch (e) { /* abaikan */ }
    return t;
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

  /* ---------- HTML ---------- */
  function buildHtml(d, base) {
    if (typeof exportHTMLReport !== "function") throw new Error("Fitur HTML belum siap");
    var cap = null, origDl = window.downloadFile, origToast = window.toast;
    window.downloadFile = function (n, c, m) { cap = { n: n, c: c, m: m }; };
    window.toast = function () { };
    try { exportHTMLReport(d.roads, base, d.bridges); }
    finally { window.downloadFile = origDl; window.toast = origToast; }
    if (!cap) throw new Error("Gagal membuat HTML");
    return new Blob([cap.c], { type: "text/html" });
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

    var km = kmOf(d.roads).toFixed(1);
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
    doc.text(d.roads.length + " ruas | " + km + " km" + (d.bridges.length ? " | " + d.bridges.length + " jembatan" : "") + " | " + new Date().toLocaleString("id-ID"), M, 46);
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
    var list = d.roads.slice(0, 60);
    list.forEach(function (r) {
      if (y > H - 24) { doc.addPage("a4", land ? "landscape" : "portrait"); y = 34; }
      var L = 0;
      try { L = roadLengthKm(r) || 0; } catch (e) { /* abaikan */ }
      doc.text("\u2022 " + String(r.name || "-").slice(0, 90) + " (" + L.toFixed(2) + " km)", M, y);
      y += 13;
    });
    if (d.roads.length > list.length) {
      if (y > H - 24) { doc.addPage("a4", land ? "landscape" : "portrait"); y = 34; }
      doc.text("...dan " + (d.roads.length - list.length) + " ruas lainnya", M, y);
    }
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
    if (!d.roads.length) { T("Belum ada ruas aktif di peta untuk dibagikan", true); return; }
    setBusy(true);
    try {
      var text = "Peta PETAQU: " + d.roads.length + " ruas (" + kmOf(d.roads).toFixed(1) + " km)" + (d.bridges.length ? ", " + d.bridges.length + " jembatan" : "") + ".";
      if (kind === "html") {
        T("Menyiapkan HTML...");
        var hb = buildHtml(d, "peta_aktif");
        await deliver(hb, "peta_aktif_" + stamp() + ".html", "text/html", text);
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
