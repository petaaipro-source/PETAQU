/* PETAQU — Rekam Koordinat & KM (inventarisasi patok KM dari Street View)
   Satu launcher (HUB) di tepi kanan Street View. Tertutup = layar bersih; klik sekali → SEMUA alat muncul rapi
   (mode Live/Embed/Dual, layout, bersihkan, warna, ukur, riwayat, info, buka Maps + Rekam, Tabel, Auto, Peta). Klik lagi / Esc = sembunyi.
   Tabel rekaman: koordinat, ruas, KM, edit, hapus, unduh.
   Setiap rekaman LANGSUNG tampil di peta (titik + garis per ruas). Seluruh fitur bisa di-hide/show.
   Pintar: ruas/STA/KM terisi otomatis dari posisi Street View, KM kosong ditaksir dari rekaman
   tetangga (tanda ~), deteksi titik ganda, rekam otomatis per jarak, pintasan Shift+R.
   Ringan: tanpa pustaka baru, data di localStorage. */
(function () {
  "use strict";
  if (window.PQRekam) return;

  var KEY = "petaqu_rekam_v1", UIK = "petaqu_rekam_ui_v1";
  var rec = [], ui = { open: false, onMap: true, sort: "new", step: 100, mode: "d", tsec: 10, cust: [], cx: false, fmt: "xlsx" }, dock = false;
  var auto = false, editId = null, flashId = null, layer = null, markers = {}, lastAuto = null, lastAutoT = 0, tick = 0;
  var PRE = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000], PRE_T = [5, 10, 30, 60], MIN_M = 1, MAX_M = 100000, MIN_T = 1, MAX_T = 3600;
  var PAL = ["#22d3ee", "#f59e0b", "#a78bfa", "#34d399", "#f43f5e", "#60a5fa", "#fb923c", "#e879f9", "#facc15"];

  function $(i) { return document.getElementById(i); }
  function isNum(v) { return v !== undefined && v !== null && v !== "" && isFinite(+v); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function note(m, e) { try { if (typeof toast === "function") toast(m, !!e); } catch (x) {} }
  function MAP() { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } }
  function SV() { try { return typeof svState !== "undefined" ? svState : null; } catch (e) { return null; } }
  function ROADS() { try { return typeof roads !== "undefined" && Array.isArray(roads) ? roads : []; } catch (e) { return []; } }

  function load() {
    try { var a = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(a)) rec = a; } catch (e) {}
    try { Object.assign(ui, JSON.parse(localStorage.getItem(UIK) || "{}")); } catch (e) {}
    ui.open = false; dock = false; ui.cx = false;
    if (!isFinite(+ui.step) || ui.step < MIN_M || ui.step > MAX_M) ui.step = 100;
    if (!isFinite(+ui.tsec) || ui.tsec < MIN_T || ui.tsec > MAX_T) ui.tsec = 10;
    if (ui.mode !== "t") ui.mode = "d";
    if (!Array.isArray(ui.cust)) ui.cust = [];
    ui.cust = ui.cust.map(Number).filter(function (v) { return isFinite(v) && v >= MIN_M && v <= MAX_M; }).slice(0, 5);
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { note("Penyimpanan penuh — unduh lalu kosongkan data", true); } }
  function saveUi() { try { localStorage.setItem(UIK, JSON.stringify(ui)); } catch (e) {} }

  function dist(a, b) {
    var r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lng - a.lng) * r;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return 12742000 * Math.asin(Math.sqrt(h));
  }
  function parseKm(s) {
    s = String(s == null ? "" : s).trim().replace(",", ".");
    if (!s) return null;
    var m = /^(-?\d+)\s*\+\s*(\d{1,3})$/.exec(s);
    if (m) return +m[1] + +(m[2].padStart(3, "0")) / 1000;
    var v = parseFloat(s); return isNaN(v) ? null : v;
  }
  function fmtKm(v) {
    if (!isNum(v)) return "";
    try { if (typeof formatKm === "function") return formatKm(+v); } catch (e) {}
    var n = Math.floor(+v + 1e-9), o = Math.round((+v - n) * 1000); if (o >= 1000) { o -= 1000; n++; }
    return n + "+" + String(o).padStart(3, "0");
  }
  function staM(s) { try { var v = parseStaMeters(s); return v == null ? null : v; } catch (e) { return null; } }
  function colorOf(name) { var h = 0, s = String(name || ""); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PAL[h % PAL.length]; }

  /* ruas terdekat (titik STA terdekat) — dipakai bila Street View bukan dari ruas tertentu */
  function nearestRoad(lat, lng) {
    var best = null, k = Math.cos(lat * Math.PI / 180);
    ROADS().forEach(function (r) {
      (r.points || []).forEach(function (p) {
        if (!isNum(p.lat) || !isNum(p.lng)) return;
        var dx = (p.lng - lng) * k * 111320, dy = (p.lat - lat) * 110540, d = dx * dx + dy * dy;
        if (!best || d < best.d) best = { d: d, r: r, p: p };
      });
    });
    return best && best.d < 6400 ? best : null;
  }

  /* posisi & atribut Street View saat ini */
  function current() {
    var S = SV(); if (!S) return null;
    var c = { lat: NaN, lng: NaN, ruas: "", roadId: null, sta: "", km: null, kab: "" };
    var lat = +S.lat, lng = +S.lng;
    if (S.type === "road") {
      var r = ROADS().find(function (x) { return x.id === S.roadId; });
      if (r) {
        c.ruas = r.name || ""; c.roadId = r.id; c.kab = r.kabupaten || "";
        var p = r.points && r.points[S.index];
        if (p) {
          if (!isFinite(lat) || !isFinite(lng)) { lat = +p.lat; lng = +p.lng; }
          c.sta = p.sta || ""; if (isNum(p.km)) c.km = +p.km;
        }
      }
    }
    var Lv = S.live;
    if (Lv && typeof Lv === "object" && isFinite(+Lv.lat) && isFinite(+Lv.lng)) {
      var ok = !isFinite(lat) || !isFinite(lng) || dist({ lat: lat, lng: lng }, { lat: +Lv.lat, lng: +Lv.lng }) < 150;
      if (ok) {
        if (!isFinite(lat) || !isFinite(lng)) { lat = +Lv.lat; lng = +Lv.lng; }
        if (Lv.name) c.ruas = Lv.name; if (Lv.kab) c.kab = Lv.kab; if (Lv.sta) c.sta = Lv.sta;
        var k = parseKm(Lv.kmpos); if (k != null) c.km = k;
      }
    }
    if (!isFinite(lat) || !isFinite(lng)) {
      var t = $("svCoord"), m = t && /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/.exec(t.textContent || "");
      if (m) { lat = +m[1]; lng = +m[2]; }
    }
    if (!isFinite(lat) || !isFinite(lng)) return null;
    c.lat = +lat.toFixed(6); c.lng = +lng.toFixed(6);
    if (!c.ruas && S.type === "geo" && S.label) c.ruas = String(S.label);
    if (!c.roadId) {
      var nr = nearestRoad(c.lat, c.lng);
      if (nr) { c.ruas = nr.r.name || c.ruas; c.roadId = nr.r.id; c.kab = nr.r.kabupaten || c.kab; if (!c.sta) c.sta = nr.p.sta || ""; if (c.km == null && isNum(nr.p.km)) c.km = +nr.p.km; }
    }
    return c;
  }

  /* taksir KM dari rekaman lain di ruas yang sama (berdasarkan selisih STA) */
  function estKm(c) {
    if (c.km != null || !c.sta) return null;
    var s = staM(c.sta); if (s == null) return null;
    var refs = rec.filter(function (r) { return r.km != null && !r.kmEst && (c.roadId && r.roadId ? r.roadId === c.roadId : r.ruas === c.ruas); })
      .map(function (r) { return { s: staM(r.sta), k: r.km }; }).filter(function (r) { return r.s != null; });
    if (!refs.length) return null;
    refs.sort(function (a, b) { return Math.abs(a.s - s) - Math.abs(b.s - s); });
    var a = refs[0], dir = 1, b = refs.find(function (x) { return x.s !== a.s; });
    if (b) dir = (b.k - a.k) / (b.s - a.s) >= 0 ? 1 : -1;
    var v = a.k + dir * (s - a.s) / 1000;
    return v >= 0 ? Math.round(v * 1000) / 1000 : null;
  }

  /* ---------- interval rekam otomatis (jarak bebas / waktu) ---------- */
  function mLabel(m) { m = +m; if (m >= 1000) { var k = +(m / 1000).toFixed(3); return k + " km"; } return +m.toFixed(1) + " m"; }
  function tLabel(t) { t = +t; return t >= 60 && t % 60 === 0 ? (t / 60) + " menit" : t + " detik"; }
  function stepLabel() { return ui.mode === "t" ? "tiap " + tLabel(ui.tsec) : "tiap " + mLabel(ui.step); }
  function stepSel() { return ui.mode === "t" ? "t:" + ui.tsec : "d:" + ui.step; }
  function stepOpts() {
    var o = PRE.map(function (m) { return [m, "Auto " + mLabel(m)]; });
    ui.cust.forEach(function (m) { if (PRE.indexOf(m) < 0) o.push([m, "Auto " + mLabel(m) + " \u2605"]); });
    if (ui.mode === "d" && PRE.indexOf(ui.step) < 0 && ui.cust.indexOf(ui.step) < 0) o.push([ui.step, "Auto " + mLabel(ui.step) + " \u2605"]);
    o.sort(function (a, b) { return a[0] - b[0]; });
    var h = '<optgroup label="Per jarak">' + o.map(function (x) { return '<option value="d:' + x[0] + '">' + x[1] + "</option>"; }).join("") + "</optgroup>";
    var tt = PRE_T.slice(); if (ui.mode === "t" && tt.indexOf(ui.tsec) < 0) tt.push(ui.tsec); tt.sort(function (a, b) { return a - b; });
    h += '<optgroup label="Per waktu">' + tt.map(function (t) { return '<option value="t:' + t + '">Auto ' + tLabel(t) + "</option>"; }).join("") + "</optgroup>";
    return h + '<option value="custom">\u270E Kustom\u2026</option>';
  }
  function paintStep() {
    var sel = $("pqRkStep"); if (!sel) return;
    var h = stepOpts(); if (sel.getAttribute("data-h") !== h) { sel.innerHTML = h; sel.setAttribute("data-h", h); }
    sel.value = ui.cx ? "custom" : stepSel();
    var row = $("pqRkIv"); if (row) row.classList.toggle("show", !!ui.cx);
    var ab = $("pqRkAuto"); if (ab) ab.title = "Rekam otomatis " + stepLabel() + " (ubah interval di tabel)";
  }
  function setStepFrom(v) {
    if (v === "custom") { ui.cx = true; paintStep(); var i = $("pqRkIvVal"); if (i) { try { i.focus(); i.select(); } catch (e) {} } return; }
    var p = String(v).split(":"), n = +p[1]; ui.cx = false;
    if (p[0] === "t") { ui.mode = "t"; ui.tsec = n; } else { ui.mode = "d"; ui.step = n; }
    saveUi(); paintStep(); resetAuto();
  }
  function applyCustom() {
    var i = $("pqRkIvVal"), u = $("pqRkIvUnit"); if (!i || !u) return;
    var v = parseFloat(String(i.value).replace(",", ".")), unit = u.value;
    if (!isFinite(v) || v <= 0) { note("Isi angka interval lebih dari 0", true); i.focus(); return; }
    if (unit === "t" || unit === "mnt") {
      var sec = Math.round(unit === "mnt" ? v * 60 : v);
      if (sec < MIN_T || sec > MAX_T) { note("Interval waktu: 1 detik \u2013 60 menit", true); return; }
      ui.mode = "t"; ui.tsec = sec;
    } else {
      var m = unit === "km" ? v * 1000 : v; m = Math.round(m * 10) / 10;
      if (m < MIN_M || m > MAX_M) { note("Interval jarak: 1 m \u2013 100 km", true); return; }
      ui.mode = "d"; ui.step = m;
      if (PRE.indexOf(m) < 0) { ui.cust = [m].concat(ui.cust.filter(function (x) { return x !== m; })).slice(0, 5); }
    }
    ui.cx = false; saveUi(); paintStep(); resetAuto();
    note("Interval rekam otomatis: " + stepLabel());
  }
  function resetAuto() { lastAuto = auto ? current() : null; lastAutoT = Date.now(); if (ui.open) paintCur(); }

  function uid() { return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  function record(silent, minD) {
    var c = current();
    if (!c) { if (!silent) note("Buka Street View dulu, lalu tekan Rekam", true); return null; }
    var dup = rec.find(function (r) { return (r.roadId || r.ruas) === (c.roadId || c.ruas) && dist(r, c) < (typeof minD === "number" ? minD : 3); });
    if (dup) { if (!silent) { flash(dup.id); note("Titik ini sudah direkam (jarak < 3 m)", true); } return null; }
    var e = estKm(c);
    var r = { id: uid(), ts: Date.now(), lat: c.lat, lng: c.lng, ruas: c.ruas || "(Tanpa ruas)", roadId: c.roadId, sta: c.sta, km: c.km != null ? c.km : e, kmEst: c.km == null && e != null, kab: c.kab, note: "" };
    rec.push(r); save(); syncMap(); render(); flash(r.id);
    if (!silent) note("Terekam: " + (r.km != null ? (r.kmEst ? "~" : "") + "KM " + fmtKm(r.km) + " • " : "") + r.lat.toFixed(5) + ", " + r.lng.toFixed(5));
    return r;
  }

  function flash(id) {
    flashId = id; render();
    var m = markers[id]; try { if (m && ui.onMap) { m.setStyle({ radius: 12 }); setTimeout(function () { try { m.setStyle({ radius: 7 }); } catch (e) {} }, 700); } } catch (e) {}
    setTimeout(function () { if (flashId === id) { flashId = null; var tr = document.querySelector('#pqRkBody tr[data-id="' + id + '"]'); if (tr) tr.classList.remove("fl"); } }, 1600);
  }

  /* ---------- peta ---------- */
  function sorted(mode) {
    var a = rec.slice();
    if (mode === "new") return a.sort(function (x, y) { return y.ts - x.ts; });
    return a.sort(function (x, y) { return (x.ruas || "").localeCompare(y.ruas || "") || ((x.km == null) - (y.km == null)) || (x.km - y.km) || (x.ts - y.ts); });
  }
  function syncMap() {
    var M = MAP(), LF = window.L; if (!M || !LF) return;
    try {
      if (!layer) layer = LF.layerGroup();
      layer.clearLayers(); markers = {};
      if (!dock || !ui.onMap || !rec.length) { if (M.hasLayer(layer)) M.removeLayer(layer); return; }
      if (!M.hasLayer(layer)) layer.addTo(M);
      var perm = rec.length <= 60, groups = {};
      rec.forEach(function (r) {
        var col = colorOf(r.roadId || r.ruas);
        var m = LF.circleMarker([r.lat, r.lng], { radius: 7, color: "#04121a", weight: 2, fillColor: col, fillOpacity: 1 });
        var lbl = r.km != null ? (r.kmEst ? "~" : "") + fmtKm(r.km) : "?";
        m.bindTooltip(lbl, { permanent: perm, direction: "top", offset: [0, -6] });
        m.bindPopup('<div style="min-width:170px"><b>' + esc(r.ruas) + '</b><br>KM ' + esc(r.km != null ? (r.kmEst ? "~" : "") + fmtKm(r.km) : "—") + (r.sta ? ' • STA ' + esc(r.sta) : "") +
          '<br><small>' + r.lat.toFixed(6) + ", " + r.lng.toFixed(6) + '</small><div class="pqsv-ac"><button onclick="PQRekam.edit(\'' + r.id + '\')">Edit</button><button onclick="PQRekam.del(\'' + r.id + '\')">Hapus</button></div></div>');
        layer.addLayer(m); markers[r.id] = m;
        (groups[r.roadId || r.ruas] = groups[r.roadId || r.ruas] || []).push(r);
      });
      Object.keys(groups).forEach(function (g) {
        var a = groups[g]; if (a.length < 2) return;
        var allKm = a.every(function (x) { return x.km != null; });
        a = a.slice().sort(function (x, y) { return allKm ? x.km - y.km : x.ts - y.ts; });
        layer.addLayer(LF.polyline(a.map(function (x) { return [x.lat, x.lng]; }), { color: colorOf(g), weight: 3, opacity: .85, dashArray: "6 7", interactive: false }));
      });
    } catch (e) { console.error("PQRekam peta:", e); }
  }
  function goTo(id) {
    var r = rec.find(function (x) { return x.id === id; }), M = MAP(); if (!r || !M) return;
    try { M.setView([r.lat, r.lng], Math.max(M.getZoom(), 17)); } catch (e) {}
    var m = markers[id]; if (m && ui.onMap) setTimeout(function () { try { m.openPopup(); } catch (e) {} }, 250);
  }

  /* ---------- unduh ---------- */
  function rows() {
    return sorted("ruas").map(function (r, i) {
      return { No: i + 1, Latitude: r.lat, Longitude: r.lng, Koordinat: r.lat + ", " + r.lng, Ruas: r.ruas, KM: (r.kmEst ? "~" : "") + fmtKm(r.km), "KM (desimal)": r.km == null ? "" : r.km, STA: r.sta || "", Kabupaten: r.kab || "", Catatan: r.note || "", Waktu: new Date(r.ts).toLocaleString("id-ID") };
    });
  }
  function dl(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
  function download() {
    if (!rec.length) { note("Belum ada rekaman untuk diunduh", true); return; }
    var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); }, base = "rekam-km-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
    var f = ui.fmt, R = rows();
    if (f === "geojson") {
      var gj = { type: "FeatureCollection", features: sorted("ruas").map(function (r) { return { type: "Feature", geometry: { type: "Point", coordinates: [r.lng, r.lat] }, properties: { ruas: r.ruas, km: r.km, km_teks: (r.kmEst ? "~" : "") + fmtKm(r.km), sta: r.sta || "", kabupaten: r.kab || "", catatan: r.note || "", waktu: new Date(r.ts).toISOString() } }; }) };
      dl(new Blob([JSON.stringify(gj)], { type: "application/geo+json" }), base + ".geojson"); return;
    }
    if (f === "xlsx" && window.XLSX) {
      try {
        var ws = XLSX.utils.json_to_sheet(R); ws["!cols"] = [{ wch: 5 }, { wch: 11 }, { wch: 12 }, { wch: 24 }, { wch: 36 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 24 }, { wch: 20 }];
        var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Rekam KM"); XLSX.writeFile(wb, base + ".xlsx"); return;
      } catch (e) { console.error(e); }
    }
    var cols = Object.keys(R[0]), q = function (v) { v = String(v == null ? "" : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var csv = "\ufeff" + cols.join(",") + "\n" + R.map(function (r) { return cols.map(function (c) { return q(r[c]); }).join(","); }).join("\n");
    dl(new Blob([csv], { type: "text/csv;charset=utf-8" }), base + ".csv");
  }

  /* ---------- UI ---------- */
  function css() {
    if ($("pqRkCss")) return;
    var s = document.createElement("style"); s.id = "pqRkCss";
    s.textContent = [
      "#pqRkDock{position:absolute;z-index:9;right:10px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:7px;pointer-events:none}",
      "#pqRkDock>*{pointer-events:auto}",
      ".pqrk-b{position:relative;width:48px;padding:7px 0 5px;border-radius:14px;border:1px solid #ffffff2e;background:#0f1521f0;color:#e6f1fb;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;box-shadow:0 6px 16px #0009;font:700 8.5px/1 var(--mono,system-ui);letter-spacing:.3px;text-transform:uppercase}",
      ".pqrk-b i{font-size:16px}.pqrk-b:hover{border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}.pqrk-b.on{background:var(--cyan,#22d3ee);color:#04121a;border-color:var(--cyan,#22d3ee)}",
      "#pqRkRec{background:linear-gradient(135deg,#e11d48,#f43f5e);border-color:#fda4af;color:#fff}#pqRkRec:hover{color:#fff;filter:brightness(1.12)}#pqRkRec:active{transform:scale(.94)}",
      "#pqRkLaunch{width:44px;height:44px;padding:0;border-radius:50%;justify-content:center}#pqRkLaunch i{font-size:18px}",
      "#pqRkLaunch.on{background:#0f1521f0;color:var(--cyan,#22d3ee);border-color:var(--cyan,#22d3ee);box-shadow:0 0 0 3px #22d3ee33,0 6px 16px #0009}",
      ".pqrk-n{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;border-radius:9px;background:var(--cyan,#22d3ee);color:#04121a;font:800 10.5px/18px var(--mono,system-ui);text-align:center;padding:0 5px;box-sizing:border-box}",
      "#pqRkTools{display:none;flex-direction:column;gap:7px;align-items:center}#pqRkTools.show{display:flex;animation:pqrkIn .16s ease}@keyframes pqrkIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
      "#pqRkPanel{position:absolute;z-index:9;right:70px;top:68px;bottom:calc(118px + env(safe-area-inset-bottom,0px));width:min(430px,calc(100% - 84px));display:none;flex-direction:column;background:#0a0e17f7;border:1px solid #38bdf855;border-radius:14px;box-shadow:0 18px 44px #000a;color:#dbe7f3;font:12px/1.4 var(--mono,system-ui);overflow:hidden}",
      "#pqRkPanel.show{display:flex}",
      "#pqRkHead{display:flex;align-items:center;gap:8px;padding:9px 10px;border-bottom:1px solid #ffffff1f}#pqRkHead b{flex:1;font-size:12.5px;color:var(--cyan,#22d3ee);letter-spacing:.3px}",
      ".pqrk-ib{width:28px;height:28px;border-radius:8px;background:#ffffff0d;border:1px solid #ffffff22;color:#cfe0f0;cursor:pointer;font-size:12px}.pqrk-ib:hover{border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}",
      "#pqRkCur{padding:7px 10px;font-size:11px;color:#9fb6cc;border-bottom:1px solid #ffffff14;word-break:break-word}#pqRkCur b{color:#fff}",
      "#pqRkBar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid #ffffff14}",
      "#pqRkBar button,#pqRkBar select{font:700 11px var(--mono,system-ui);border-radius:8px;border:1px solid #ffffff26;background:#ffffff10;color:#e6f1fb;padding:6px 9px;cursor:pointer}",
      "#pqRkBar .d:hover{border-color:#f43f5e;color:#f43f5e}#pqRkBar .sp{flex:1}",
      "#pqRkIv{display:none;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid #ffffff14;background:#22d3ee0d}#pqRkIv.show{display:flex}#pqRkIv span{font-weight:700;color:#9fb6cc}#pqRkIv input,#pqRkIv select{font:700 12px var(--mono,system-ui);border-radius:8px;border:1px solid #38bdf866;background:#05070c;color:#fff;padding:6px 8px}#pqRkIv input{width:84px}#pqRkIv button{font:800 11px var(--mono,system-ui);border-radius:8px;border:1px solid var(--cyan,#22d3ee);background:var(--cyan,#22d3ee);color:#04121a;padding:6px 11px;cursor:pointer}#pqRkIv small{flex-basis:100%;color:#8fa6bd;font-size:10px;line-height:1.4}",
      "#pqRkWrap{overflow:auto;flex:1;min-height:70px}#pqRkTbl{width:100%;border-collapse:collapse}",
      "#pqRkTbl th{position:sticky;top:0;background:#101826;text-align:left;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#8fa6bd;padding:6px 7px;z-index:1}",
      "#pqRkTbl td{padding:6px 7px;border-top:1px solid #ffffff12;vertical-align:top}#pqRkTbl small{display:block;color:#8fa6bd;font-size:10px}",
      "#pqRkTbl td.n{color:#8fa6bd;width:22px}#pqRkTbl td.co,#pqRkTbl td.ru{cursor:pointer}#pqRkTbl td.co{font-size:11px;white-space:nowrap}#pqRkTbl td.km{font-weight:800;color:#fde68a;white-space:nowrap}",
      "#pqRkTbl td.ac{white-space:nowrap;text-align:right}#pqRkTbl td.ac button{width:26px;height:26px;border-radius:7px;background:#ffffff0d;border:1px solid #ffffff22;color:#cfe0f0;cursor:pointer;margin-left:3px}#pqRkTbl td.ac button:hover{border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}#pqRkTbl td.ac button.d:hover{border-color:#f43f5e;color:#f43f5e}",
      "#pqRkTbl tr.fl td{background:#22d3ee22}#pqRkTbl input{width:100%;box-sizing:border-box;background:#05070c;border:1px solid #38bdf866;color:#fff;border-radius:6px;padding:5px 6px;font:11.5px var(--mono,system-ui);margin-bottom:4px}",
      ".pqrk-empty{padding:22px 14px;text-align:center;color:#8fa6bd;line-height:1.6}.pqrk-tip,.leaflet-tooltip.pqrk-tip{font-size:10.5px}",
      /* ===== HUB: satu launcher untuk semua alat Street View ===== */
      "#pqRkTools{padding:7px;border-radius:18px;background:#0a0e17ee;border:1px solid #38bdf844;box-shadow:0 10px 28px #000a;backdrop-filter:blur(10px);gap:6px}",
      "#pqRkTools .pqrk-b{box-shadow:none;width:46px;border-radius:12px}",
      "#pqRkTools .pqrk-sep{width:30px;height:1px;background:#ffffff26;margin:1px 0}",
      "#pqRkLaunch i{transition:transform .2s}#pqRkLaunch.on i{transform:rotate(90deg)}",
      /* tertutup = hanya tombol tutup (X) + nama ruas/STA; semua alat lain disembunyikan */
      "#svFrameWrap:not(.pq-hub-on) #svHudTop #svModeSwitch,#svFrameWrap:not(.pq-hub-on) #svHudTop #pqSvView,#svFrameWrap:not(.pq-hub-on) #svHudTop #svMeasureBtn,#svFrameWrap:not(.pq-hub-on) #svHudTop #svHistoryBtn,#svFrameWrap:not(.pq-hub-on) #svHudTop #svInfoToggleBtn,#svFrameWrap:not(.pq-hub-on) #svHudTop #svExternalLink,#svFrameWrap:not(.pq-hub-on) #pqSvMenu{display:none!important}",
      "#svFrameWrap.pq-hub-on #svHudTop>*:not(#svClose):not(#svHudInfo){animation:pqrkIn .16s ease}",
      "@media(max-width:560px){#pqRkPanel{right:62px;width:calc(100% - 74px)}.pqrk-b{width:44px}}"
    ].join("\n");
    document.head.appendChild(s);
  }

  function build() {
    var wrap = $("svFrameWrap"); if (!wrap || $("pqRkDock")) return !!$("pqRkDock");
    css();
    var dk = document.createElement("div"); dk.id = "pqRkDock";
    dk.innerHTML = '<div id="pqRkTools">' +
      '<button id="pqRkRec" class="pqrk-b" type="button" title="Rekam koordinat titik ini (Shift+R)"><i class="fa-solid fa-circle-dot"></i>Rekam</button>' +
      '<button id="pqRkTog" class="pqrk-b" type="button" title="Tampilkan / sembunyikan tabel rekaman"><i class="fa-solid fa-table-list"></i>Tabel<span class="pqrk-n" id="pqRkCnt">0</span></button>' +
      '<button id="pqRkAuto" class="pqrk-b" type="button" title="Rekam otomatis tiap menempuh jarak tertentu"><i class="fa-solid fa-bolt"></i>Auto</button>' +
      '<button id="pqRkMapBtn" class="pqrk-b" type="button" title="Tampilkan rekaman di peta"><i class="fa-solid fa-map-location-dot"></i>Peta</button></div>' +
      '<button id="pqRkLaunch" class="pqrk-b" type="button" title="Menu alat Street View — klik untuk tampil / sembunyikan"><i class="fa-solid fa-grip" id="pqRkLaunchIc"></i><span class="pqrk-n" id="pqRkCnt2">0</span></button>';
    var pn = document.createElement("div"); pn.id = "pqRkPanel";
    pn.innerHTML = '<div id="pqRkHead"><i class="fa-solid fa-location-crosshairs" style="color:var(--cyan,#22d3ee)"></i><b>Rekam Koordinat &amp; KM</b>' +
      '<button class="pqrk-ib" id="pqRkClose" type="button" title="Tutup tabel"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div id="pqRkCur"></div>' +
      '<div id="pqRkBar"><select id="pqRkStep" title="Interval rekam otomatis (tombol Auto) — pilih Kustom untuk angka bebas"></select>' +
      '<button id="pqRkSort" type="button" title="Urutan tabel"></button><span class="sp"></span>' +
      '<select id="pqRkFmt" title="Format unduhan"><option value="xlsx">Excel</option><option value="csv">CSV</option><option value="geojson">GeoJSON</option></select>' +
      '<button id="pqRkDl" type="button"><i class="fa-solid fa-download"></i> Unduh</button>' +
      '<button class="d" id="pqRkClear" type="button" title="Hapus semua rekaman"><i class="fa-solid fa-trash"></i></button></div>' +
      '<div id="pqRkIv"><span>Rekam tiap</span><input id="pqRkIvVal" type="text" inputmode="decimal" autocomplete="off" value="75" aria-label="Nilai interval"><select id="pqRkIvUnit" aria-label="Satuan interval"><option value="m">meter</option><option value="km">km</option><option value="t">detik</option><option value="mnt">menit</option></select><button id="pqRkIvOk" type="button">Terapkan</button><small>Jarak 1 m\u2013100 km \u2022 waktu 1 dtk\u201360 mnt. Mode waktu hanya merekam bila posisi sudah bergeser \u2265 1 m.</small></div>' +
      '<div id="pqRkWrap"><table id="pqRkTbl"><thead><tr><th>#</th><th>Koordinat</th><th>Ruas</th><th>KM</th><th></th></tr></thead><tbody id="pqRkBody"></tbody></table></div>';
    wrap.appendChild(pn); wrap.appendChild(dk);
    ["pointerdown", "mousedown", "touchstart", "wheel"].forEach(function (ev) { [dk, pn].forEach(function (el) { el.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); }); });

    $("pqRkLaunch").onclick = function () { setDock(!dock); };
    $("pqRkRec").onclick = function () { record(false); };
    $("pqRkTog").onclick = function () { ui.open = !ui.open; paintUi(); };
    $("pqRkClose").onclick = function () { ui.open = false; paintUi(); };
    $("pqRkMapBtn").onclick = function () { ui.onMap = !ui.onMap; saveUi(); syncMap(); paintUi(); };
    $("pqRkAuto").onclick = function () { setAuto(!auto); };
    $("pqRkStep").onchange = function () { setStepFrom(this.value); };
    $("pqRkIvOk").onclick = applyCustom;
    $("pqRkIvVal").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); applyCustom(); } });
    $("pqRkSort").onclick = function () { ui.sort = ui.sort === "new" ? "ruas" : "new"; saveUi(); paintUi(); render(); };
    $("pqRkFmt").onchange = function () { ui.fmt = this.value; saveUi(); };
    $("pqRkDl").onclick = download;
    $("pqRkClear").onclick = function () { if (!rec.length) return; if (confirm("Hapus SEMUA " + rec.length + " rekaman? Unduh dulu bila perlu.")) { rec = []; editId = null; save(); syncMap(); render(); } };
    $("pqRkBody").addEventListener("click", onRow);
    $("pqRkBody").addEventListener("keydown", function (e) { if (e.key === "Enter") { var b = e.target.closest("tr"); if (b) saveEdit(b.getAttribute("data-id")); } else if (e.key === "Escape") { editId = null; render(); } });
    paintUi(); render();
    return true;
  }
  function setDock(v) {
    dock = !!v;
    if (!dock) { ui.open = false; if (auto) setAuto(false); }
    syncMap(); paintUi(); if (dock) paintCur();
  }
  function setAuto(v) {
    auto = !!v; lastAuto = auto ? current() : null; lastAutoT = Date.now();
    note(auto ? "Rekam otomatis aktif " + stepLabel() + " \u2014 jalankan Street View / animasi" : "Rekam otomatis dimatikan");
    paintUi();
  }

  function onRow(e) {
    var tr = e.target.closest("tr"); if (!tr) return;
    var id = tr.getAttribute("data-id"), b = e.target.closest("[data-act]"); if (!b) return;
    var a = b.getAttribute("data-act");
    if (a === "go") goTo(id);
    else if (a === "edit") { editId = id; render(); }
    else if (a === "del") del(id);
    else if (a === "ok") saveEdit(id);
    else if (a === "cancel") { editId = null; render(); }
  }
  function del(id) {
    var r = rec.find(function (x) { return x.id === id; }); if (!r) return;
    if (!confirm("Hapus rekaman " + (r.km != null ? "KM " + fmtKm(r.km) : r.lat + ", " + r.lng) + " — " + r.ruas + "?")) return;
    rec = rec.filter(function (x) { return x.id !== id; }); if (editId === id) editId = null;
    save(); syncMap(); render(); try { var M = MAP(); M && M.closePopup(); } catch (e) {}
  }
  function saveEdit(id) {
    var r = rec.find(function (x) { return x.id === id; }), tr = document.querySelector('#pqRkBody tr[data-id="' + id + '"]'); if (!r || !tr) return;
    var g = function (n) { var i = tr.querySelector('[data-f="' + n + '"]'); return i ? i.value : ""; };
    var m = /(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/.exec(g("co"));
    if (!m || Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) { note("Koordinat tidak valid — format: -7.552253, 109.289429", true); return; }
    var kmTxt = g("km").trim(), km = parseKm(kmTxt);
    if (kmTxt && km == null) { note("KM tidak valid — contoh 2+800 atau 2.8", true); return; }
    r.lat = +(+m[1]).toFixed(6); r.lng = +(+m[2]).toFixed(6); r.ruas = g("ruas").trim() || r.ruas;
    r.km = km; r.kmEst = false; r.sta = g("sta").trim(); r.note = g("note").trim();
    editId = null; save(); syncMap(); render(); note("Perubahan disimpan");
  }

  function render() {
    var body = $("pqRkBody"); if (!body) return;
    var cnt = $("pqRkCnt"), c2 = $("pqRkCnt2"); if (cnt) cnt.textContent = rec.length; if (c2) { c2.textContent = rec.length; c2.style.display = rec.length ? "" : "none"; }
    if (!rec.length) { body.innerHTML = '<tr><td colspan="5"><div class="pqrk-empty"><i class="fa-solid fa-location-crosshairs"></i><br>Belum ada rekaman.<br>Geser Street View ke patok KM lalu tekan <b>Rekam</b> (atau Shift+R).</div></td></tr>'; return; }
    body.innerHTML = sorted(ui.sort).map(function (r, i) {
      if (r.id === editId) {
        return '<tr data-id="' + r.id + '"><td class="n">' + (i + 1) + '</td><td colspan="3"><input data-f="co" value="' + r.lat + ', ' + r.lng + '" placeholder="lat, lng">' +
          '<input data-f="ruas" value="' + esc(r.ruas) + '" placeholder="Ruas"><input data-f="km" value="' + esc(r.km == null ? "" : fmtKm(r.km)) + '" placeholder="KM, mis. 2+800">' +
          '<input data-f="sta" value="' + esc(r.sta || "") + '" placeholder="STA (opsional)"><input data-f="note" value="' + esc(r.note || "") + '" placeholder="Catatan (opsional)"></td>' +
          '<td class="ac"><button data-act="ok" title="Simpan"><i class="fa-solid fa-check"></i></button><button data-act="cancel" class="d" title="Batal"><i class="fa-solid fa-xmark"></i></button></td></tr>';
      }
      var km = r.km != null ? (r.kmEst ? "~" : "") + fmtKm(r.km) : "—";
      return '<tr data-id="' + r.id + '"' + (r.id === flashId ? ' class="fl"' : "") + '><td class="n">' + (i + 1) + '</td>' +
        '<td class="co" data-act="go" title="Lihat di peta">' + r.lat.toFixed(6) + '<br>' + r.lng.toFixed(6) + '</td>' +
        '<td class="ru" data-act="go">' + esc(r.ruas) + (r.note ? '<small>' + esc(r.note) + '</small>' : "") + '</td>' +
        '<td class="km">' + esc(km) + (r.sta ? '<small>STA ' + esc(r.sta) + '</small>' : "") + '</td>' +
        '<td class="ac"><button data-act="edit" title="Edit"><i class="fa-solid fa-pen"></i></button><button data-act="del" class="d" title="Hapus"><i class="fa-solid fa-trash"></i></button></td></tr>';
    }).join("");
    var ed = body.querySelector("input[data-f]"); if (ed && editId) { try { ed.focus(); } catch (e) {} }
  }

  function paintUi() {
    var dk = $("pqRkDock"); if (!dk) return;
    $("pqRkTools").classList.toggle("show", dock);
    $("pqRkLaunch").classList.toggle("on", dock);
    var wr = $("svFrameWrap"); if (wr) wr.classList.toggle("pq-hub-on", dock);
    var ic = $("pqRkLaunchIc"); if (ic) ic.className = "fa-solid " + (dock ? "fa-xmark" : "fa-grip");
    if (!dock) { try { var mn = $("pqSvMenu"); if (mn) mn.classList.remove("show"); } catch (e) {} }
    $("pqRkPanel").classList.toggle("show", dock && !!ui.open);
    $("pqRkTog").classList.toggle("on", dock && !!ui.open);
    $("pqRkMapBtn").classList.toggle("on", !!ui.onMap);
    $("pqRkAuto").classList.toggle("on", auto);
    paintStep(); $("pqRkFmt").value = ui.fmt;
    $("pqRkSort").innerHTML = ui.sort === "new" ? '<i class="fa-solid fa-clock"></i> Terbaru' : '<i class="fa-solid fa-arrow-down-1-9"></i> Ruas+KM';
    if (ui.open) paintCur();
  }

  function autoInfo(c) {
    if (!auto) return "";
    var t = '<br><span style="color:#22d3ee">\u26A1 Auto ' + stepLabel() + "</span>";
    if (lastAuto) {
      if (ui.mode === "t") { var w = Math.max(0, Math.ceil(ui.tsec - (Date.now() - lastAutoT) / 1000)); t += " \u2022 berikutnya \u00B1" + tLabel(w); }
      else { var sisa = Math.max(0, ui.step - dist(lastAuto, c)); t += " \u2022 berikutnya \u00B1" + mLabel(Math.round(sisa)) + " lagi"; }
    }
    return t + " \u2022 " + rec.length + " titik";
  }
  function paintCur() {
    var el = $("pqRkCur"); if (!el) return;
    var c = current();
    if (!c) { el.textContent = "Street View belum aktif."; return; }
    var e = c.km == null ? estKm(c) : null;
    el.innerHTML = 'Titik sekarang: <b>' + c.lat.toFixed(6) + ', ' + c.lng.toFixed(6) + '</b><br>' + esc(c.ruas || "(ruas belum terdeteksi)") +
      (c.sta ? ' • STA ' + esc(c.sta) : "") + ' • <b>KM ' + (c.km != null ? fmtKm(c.km) : e != null ? "~" + fmtKm(e) : "—") + '</b>' + autoInfo(c);
  }

  /* detak ringan: segarkan info titik & rekam otomatis */
  function loop() {
    var ov = $("svOverlay"); if (!ov || !ov.classList.contains("show")) return;
    if (!$("pqRkDock") && !build()) return;
    if (!dock) return;
    if (ui.open) paintCur();
    if (auto) {
      var c = current(); if (!c) return;
      if (!lastAuto) { lastAuto = c; lastAutoT = Date.now(); return; }
      if (ui.mode === "t") {
        if (Date.now() - lastAutoT >= ui.tsec * 1000) {
          lastAutoT = Date.now();
          if (dist(lastAuto, c) >= 1) { record(true, 1); lastAuto = c; }
        }
      } else if (dist(lastAuto, c) >= ui.step) { record(true, Math.min(3, ui.step / 2)); lastAuto = c; lastAutoT = Date.now(); }
    }
  }

  function init() {
    load(); build(); syncMap();
    tick = setInterval(loop, 600);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && dock) {
        var t0 = e.target, tg = t0 && t0.tagName, ov0 = $("svOverlay");
        if (tg !== "INPUT" && tg !== "TEXTAREA" && tg !== "SELECT" && ov0 && ov0.classList.contains("show")) { setDock(false); return; }
      }
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || (e.key !== "R" && e.key !== "r")) return;
      var t = e.target, tag = t && t.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      var ov = $("svOverlay"); if (!dock || !ov || !ov.classList.contains("show")) return;
      e.preventDefault(); record(false);
    });
  }

  window.PQRekam = {
    record: function () { return record(false); }, all: function () { return rec.slice(); },
    open: function () { build(); dock = true; ui.open = true; syncMap(); paintUi(); },
    edit: function (id) { build(); dock = true; ui.open = true; editId = id; syncMap(); paintUi(); render(); try { var M = MAP(); M && M.closePopup(); } catch (e) {} },
    del: del, download: download,
    setInterval: function (v, unit) { if (unit === "t" || unit === "mnt") { ui.mode = "t"; ui.tsec = Math.round(unit === "mnt" ? v * 60 : v); } else { ui.mode = "d"; ui.step = unit === "km" ? v * 1000 : +v; } paintStep(); resetAuto(); return stepLabel(); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
