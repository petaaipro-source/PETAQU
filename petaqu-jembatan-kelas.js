/* PETAQU — Lapisan Jembatan per Kewenangan: Nasional · Provinsi · Kabupaten · Kota.  v1
   • Tampil di menu folder (grup "Lapisan Jembatan") dan bisa dicari lewat kolom cari (mis. ketik "jembatan nasional").
   • KLASIFIKASI OTOMATIS & TRANSPARAN — tiap jembatan diberi kelas + alasan + tingkat keyakinan, urutan dasar:
       1) kelas tertulis di data / hasil koreksi manual pengguna        → keyakinan "data" / "manual"
       2) berada ≤ 50 m dari garis Jalan Nasional (296 link di peta)    → "tinggi"
       3) kata kunci pada nama ruas (nasional, tol, jalan provinsi)    → "sedang"
       4) nama ruas bergaya penghubung "A - B" tapi tak cocok nasional → Provinsi (diduga) → "rendah"
       5) berada di wilayah administrasi Kota (poligon batas / nama)   → Kota → "sedang"
       6) selain itu                                                    → Kabupaten (default) → "rendah"
     Hasil keyakinan rendah ditandai (titik lebih pudat) dan bisa dikoreksi lewat popup; koreksi tersimpan.
   • Panel ringkasan: jumlah & total panjang per kelas, daftar + cari, impor Excel/CSV/GeoJSON (kolom dikenali otomatis,
     duplikat dilewati), unduh Excel. Data sumber = JEMBATAN_DB (sama dengan tab "Jembatan" di sidebar). */
(function () {
  "use strict";
  if (window.__pqJbKelas) return;
  window.__pqJbKelas = 1;

  var KEY = "petaqu_jbkelas_v1", NATM = 50;
  var KLS = [
    { k: "nasional", n: "Jembatan Nasional", s: "Nasional", c: "#ef4444" },
    { k: "provinsi", n: "Jembatan Provinsi", s: "Provinsi", c: "#3b82f6" },
    { k: "kabupaten", n: "Jembatan Kabupaten", s: "Kabupaten", c: "#34d399" },
    { k: "kota", n: "Jembatan Kota", s: "Kota", c: "#f59e0b" }
  ];
  var KM = {}; KLS.forEach(function (x) { KM[x.k] = x; });
  var st = { on: {}, flt: "", q: "" };
  try { var o0 = JSON.parse(localStorage.getItem(KEY) || "null"); if (o0 && o0.on) st.on = o0.on; } catch (e) { }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ on: st.on })); } catch (e) { } }

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n, d) { return Number(n).toLocaleString("id-ID", { maximumFractionDigits: d == null ? 1 : d }); }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
  function MAP() { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } }
  function tst(m, err) { try { if (typeof toast === "function") toast(m, !!err); } catch (e) { } }
  function src() {
    try { if (typeof JEMBATAN_DB !== "undefined" && JEMBATAN_DB && JEMBATAN_DB.length) return JEMBATAN_DB; } catch (e) { }
    try { if (typeof JEMBATAN_SEED !== "undefined" && JEMBATAN_SEED) return JEMBATAN_SEED; } catch (e) { }
    return [];
  }

  /* ---------- Jalan Nasional (dari data peta) → indeks grid untuk jarak titik-ke-garis ---------- */
  var NAT, CELL = 0.02;
  function dec(e) {
    for (var t = 0, n = 0, c = 0, r = []; t < e.length;) {
      var o = 0, u = 0, g;
      do { g = e.charCodeAt(t++) - 63; o |= (g & 31) << u; u += 5; } while (g >= 32);
      n += o & 1 ? ~(o >> 1) : o >> 1; o = 0; u = 0;
      do { g = e.charCodeAt(t++) - 63; o |= (g & 31) << u; u += 5; } while (g >= 32);
      c += o & 1 ? ~(o >> 1) : o >> 1; r.push([n / 1e5, c / 1e5]);
    }
    return r;
  }
  function buildNat() {
    NAT = { grid: {}, ok: false };
    var el = $("jn-data"); if (!el) return;
    var S; try { S = JSON.parse(el.textContent); } catch (e) { return; }
    (S.r || []).forEach(function (r) {
      (r[5] || []).forEach(function (enc) {
        var p = dec(enc);
        for (var i = 1; i < p.length; i++) {
          var a = p[i - 1], b = p[i], sg = { a: a, b: b, nm: r[0], cd: r[1] };
          var y0 = Math.floor(Math.min(a[0], b[0]) / CELL), y1 = Math.floor(Math.max(a[0], b[0]) / CELL);
          var x0 = Math.floor(Math.min(a[1], b[1]) / CELL), x1 = Math.floor(Math.max(a[1], b[1]) / CELL);
          if ((y1 - y0 + 1) * (x1 - x0 + 1) > 400) continue;
          for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) { var k = yy + "|" + xx; (NAT.grid[k] || (NAT.grid[k] = [])).push(sg); }
        }
      });
    });
    NAT.ok = true;
  }
  function dseg(py, px, a, b) {
    var k = 111320, cx = Math.cos(py * Math.PI / 180);
    var ax = (a[1] - px) * k * cx, ay = (a[0] - py) * k, bx = (b[1] - px) * k * cx, by = (b[0] - py) * k;
    var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
    var x = ax + t * dx, y = ay + t * dy;
    return Math.sqrt(x * x + y * y);
  }
  function nearNat(y, x) {
    if (!NAT) buildNat();
    if (!NAT.ok) return null;
    var cy = Math.floor(y / CELL), cx = Math.floor(x / CELL), best = null;
    for (var j = cy - 1; j <= cy + 1; j++) for (var i = cx - 1; i <= cx + 1; i++) {
      var L = NAT.grid[j + "|" + i]; if (!L) continue;
      for (var n = 0; n < L.length; n++) {
        var d = dseg(y, x, L[n].a, L[n].b);
        if (!best || d < best.d) best = { d: d, name: L[n].nm, code: L[n].cd };
      }
    }
    return best;
  }

  /* ---------- batas Kota (poligon dari data Kabupaten bila ada) ---------- */
  var KB;
  function inRing(y, x, r) {
    var c = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      var yi = r[i][0], xi = r[i][1], yj = r[j][0], xj = r[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function kotaAt(y, x) {
    if (KB === undefined) { KB = null; try { var el = $("kb-data"); if (el) KB = JSON.parse(el.textContent); } catch (e) { KB = null; } }
    if (!KB) return null;
    for (var i = 0; i < KB.length; i++) {
      var k = KB[i]; if (!k.p) continue;
      for (var p = 0; p < k.p.length; p++) {
        if (k.p[p][0] && inRing(y, x, k.p[p][0])) { var h = false; for (var q = 1; q < k.p[p].length; q++) if (inRing(y, x, k.p[p][q])) { h = true; break; } if (!h) return { n: k.n, kota: /kota/i.test(k.t || "") }; }
      }
    }
    return null;
  }

  /* ---------- klasifikasi ---------- */
  function kelasOf(v) {
    v = String(v || "").toLowerCase(); if (!v.trim()) return "";
    if (/nasional|\bnas\b|\bjn\b/.test(v)) return "nasional";
    if (/provinsi|\bprov\b|\bjp\b/.test(v)) return "provinsi";
    if (/kota|kodya|\bkt\b/.test(v)) return "kota";
    if (/kabupaten|\bkab\b|\bjk\b|desa/.test(v)) return "kabupaten";
    return "";
  }
  function classify(b) {
    var e = kelasOf(b.kelas);
    if (e) return b.kelasSumber === "manual" ? { k: e, conf: "manual", why: "Dikoreksi manual oleh pengguna" } : { k: e, conf: "data", why: "Tercantum pada data jembatan" };
    var y = +b.lat, x = +b.lng, ok = isFinite(y) && isFinite(x) && b.lat !== null && b.lng !== null;
    var nt = ok ? nearNat(y, x) : null;
    if (nt && nt.d <= NATM) return { k: "nasional", conf: "tinggi", why: "±" + Math.round(nt.d) + " m dari Jalan Nasional " + nt.name };
    var s = " " + (b.ruas || "") + " " + (b.nama || "") + " ";
    if (/jalan nasional|jl\.? ?nasional|\btol\b|jalan tol|trans jawa/i.test(s)) return { k: "nasional", conf: "sedang", why: "Nama ruas memuat kata nasional/tol" };
    if (/(jalan|jl\.?|ruas) provinsi/i.test(s)) return { k: "provinsi", conf: "sedang", why: "Nama ruas memuat kata jalan provinsi" };
    var kt = null;
    if (/^\s*kota\b/i.test(b.kabupaten || "")) kt = "Wilayah " + b.kabupaten;
    else if (ok) { var z = kotaAt(y, x); if (z && z.kota) kt = "Di dalam batas " + z.n; }
    if (/\s-\s/.test(b.ruas || "") && !/^\s*(jl|jln|jalan)\b/i.test(b.ruas || "")) return { k: "provinsi", conf: "rendah", why: "Ruas penghubung antarkota \"" + String(b.ruas).trim() + "\" tidak cocok Jalan Nasional → diduga Provinsi" };
    if (kt) return { k: "kota", conf: "sedang", why: kt };
    return { k: "kabupaten", conf: "rendah", why: "Bukan Jalan Nasional & bukan wilayah Kota → Kabupaten (default)" };
  }

  /* ---------- model + peta ---------- */
  var items = [], sigv = "", grp = {}, rend = null, built = false, panel = null;
  function sig(a) { var l = a.length; return l + "|" + (l ? (a[0].id || "") + "|" + (a[l - 1].id || "") : ""); }
  function build() {
    var a = src(); sigv = sig(a);
    var m = MAP();
    KLS.forEach(function (x) { if (grp[x.k]) { grp[x.k].clearLayers(); if (m && m.hasLayer(grp[x.k])) m.removeLayer(grp[x.k]); } });
    items = a.map(function (b, i) { var r = classify(b); return { b: b, k: r.k, conf: r.conf, why: r.why, i: i, mk: null }; });
    built = true;
    paint();
  }
  function rad() { var m = MAP(), z = m ? m.getZoom() : 10; return z < 9 ? 3 : z < 12 ? 4.5 : z < 15 ? 6.5 : 8.5; }
  function popup(it) {
    var b = it.b, c = KM[it.k].c;
    function r(l, v) { return v == null || v === "" ? "" : '<div class="jbk-r"><span>' + l + "</span><b>" + esc(v) + "</b></div>"; }
    var opts = KLS.map(function (x) { return '<option value="' + x.k + '"' + (x.k === it.k ? " selected" : "") + ">" + x.s + "</option>"; }).join("");
    return '<div class="jbk-pop"><div class="jbk-t"><b>' + esc(b.nama || "Jembatan") + '</b><em style="--c:' + c + '">' + KM[it.k].s + "</em></div>" +
      r("Nomor", b.nomor) + r("Ruas", b.ruas) + r("Kab/Kota", b.kabupaten) + r("STA/KM", b.sta) +
      r("Panjang", b.panjang != null && b.panjang !== "" ? fmt(b.panjang) + " m" : "") + r("Lebar", b.lebar != null && b.lebar !== "" ? fmt(b.lebar) + " m" : "") +
      r("Tipe", b.tipe) + r("Tahun", b.tahun) + r("Kondisi", b.kondisi) +
      '<div class="jbk-why"><b>Dasar kelas:</b> ' + esc(it.why) + ' <i>(keyakinan ' + it.conf + ")</i></div>" +
      '<div class="jbk-ac"><select onchange="PETAQU_JBK.ov(' + it.i + ',this.value)" title="Koreksi kelas jembatan ini"><option value="">Kelas otomatis</option>' + opts + "</select>" +
      '<a href="javascript:void 0" onclick="PETAQU_JBK.sv(' + it.i + ')">Street View</a></div></div>';
  }
  function paint() {
    var m = MAP(); if (!m || !window.L) return;
    if (!rend) rend = L.canvas({ padding: 0.4 });
    var R = rad();
    items.forEach(function (it) {
      if (it.mk) return;
      var y = +it.b.lat, x = +it.b.lng; if (!isFinite(y) || !isFinite(x) || it.b.lat === null) return;
      var c = KM[it.k].c, low = it.conf === "rendah";
      it.mk = L.circleMarker([y, x], { renderer: rend, radius: R, color: "#fff", weight: low ? 1 : 2, dashArray: low ? "2 2" : null, fillColor: c, fillOpacity: low ? 0.6 : 0.95 });
      it.mk.bindTooltip(esc(it.b.nama || "Jembatan"), { direction: "top", offset: [0, -R], className: "jbk-tip" });
      it.mk.on("click", function (e) { try { if (window.L && L.DomEvent) L.DomEvent.stopPropagation(e); } catch (x) { } openSV(it); });
      it.mk.on("contextmenu", function (e) { var m2 = MAP(); if (m2) L.popup({ maxWidth: 280 }).setLatLng(e.latlng).setContent(popup(it)).openOn(m2); });
      (grp[it.k] || (grp[it.k] = L.layerGroup())).addLayer(it.mk);
    });
    KLS.forEach(function (x) {
      var g = grp[x.k]; if (!g) return;
      if (st.on[x.k] && !m.hasLayer(g)) { g.addTo(m); g.eachLayer(function (l) { l.bringToFront && l.bringToFront(); }); }
      if (!st.on[x.k] && m.hasLayer(g)) m.removeLayer(g);
    });
  }
  function counts() {
    var c = { nasional: 0, provinsi: 0, kabupaten: 0, kota: 0 }, len = { nasional: 0, provinsi: 0, kabupaten: 0, kota: 0 }, cf = { manual: 0, data: 0, tinggi: 0, sedang: 0, rendah: 0 };
    items.forEach(function (it) { c[it.k]++; len[it.k] += +it.b.panjang || 0; cf[it.conf]++; });
    return { c: c, len: len, cf: cf, n: items.length };
  }
  function setOn(k, v) {
    st.on[k] = !!v; save();
    if (!built) build(); else paint();
    renderPanel(); 
  }
  function fly(i) {
    var it = items[i]; if (!it) return;
    var m = MAP(); if (!m) return;
    if (!st.on[it.k]) setOn(it.k, true);
    if (!it.mk) paint();
    var y = +it.b.lat, x = +it.b.lng; if (!isFinite(y) || !isFinite(x)) return;
    m.setView([y, x], Math.max(m.getZoom(), 16));
    openSV(it);
  }
  function fitKelas(k) {
    var m = MAP(); if (!m || !window.L) return;
    var pts = items.filter(function (it) { return (!k || it.k === k) && isFinite(+it.b.lat) && it.b.lat !== null; }).map(function (it) { return [+it.b.lat, +it.b.lng]; });
    if (!pts.length) { tst("Belum ada jembatan pada kelas ini", true); return; }
    m.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 15 });
  }
  function ov(i, v) {
    var it = items[+i]; if (!it) return;
    var b = it.b;
    if (v) { b.kelas = v; b.kelasSumber = "manual"; }
    else if (b.kelasSumber === "manual") { delete b.kelas; delete b.kelasSumber; }
    try { if (typeof persistJembatan === "function") persistJembatan(); } catch (e) { }
    var m = MAP(); if (m) m.closePopup();
    build(); renderPanel();
    if (v && !st.on[v]) setOn(v, true);
    tst(v ? "Kelas diubah ke " + KM[v].s : "Kelas dikembalikan ke otomatis");
  }

  /* ---------- KLIK → STREET VIEW OTOMATIS (cerdas) ----------
     • Klik titik jembatan / baris daftar → langsung masuk Street View (sama seperti fitur Patok KM & hasil cari).
     • Posisi "snap" ke garis Jalan Nasional terdekat (≤ 25 m) agar panorama jatuh di badan jalan, bukan di sungai.
     • Arah pandang otomatis searah sumbu jalan (rata-rata arah segmen di sekitar jembatan);
       bila bukan Jalan Nasional: dari jembatan tetangga pada ruas yang sama.
     • Panel Street View menampilkan data lengkap jembatan; bilah kecil di bawah: ◀ ▶ jembatan sebelum/sesudah
       sepanjang ruas, ⇄ balik arah, ↻ putar 90°, dan koreksi kelas. Klik kanan / tahan pada titik = popup data. */
  function bearingXY(dx, dy) { return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360; }
  function vecM(a, b) { var k = 111320, cx = Math.cos(a[0] * Math.PI / 180); return [(b[1] - a[1]) * k * cx, (b[0] - a[0]) * k]; }
  function axisAt(y, x) {
    if (!NAT) buildNat(); if (!NAT || !NAT.ok) return null;
    var cy = Math.floor(y / CELL), cx = Math.floor(x / CELL), segs = [], best = Infinity;
    for (var j = cy - 1; j <= cy + 1; j++) for (var i = cx - 1; i <= cx + 1; i++) {
      var L = NAT.grid[j + "|" + i]; if (!L) continue;
      for (var n = 0; n < L.length; n++) { var d = dseg(y, x, L[n].a, L[n].b); segs.push({ s: L[n], d: d }); if (d < best) best = d; }
    }
    if (!segs.length || best > 40) return null;
    var sx = 0, sy = 0, tw = 0, bs = null;
    segs.forEach(function (o) {
      if (o.d > best + 18) return;
      if (o.d === best) bs = o;
      var v = vecM(o.s.a, o.s.b), len = Math.sqrt(v[0] * v[0] + v[1] * v[1]); if (len < 0.5) return;
      var th = bearingXY(v[0], v[1]) * Math.PI / 180, w = Math.min(len, 80);
      sx += w * Math.sin(2 * th); sy += w * Math.cos(2 * th); tw += w;
    });
    if (!tw) return null;
    var axis = ((Math.atan2(sx, sy) * 90 / Math.PI) + 180) % 180, conf = Math.sqrt(sx * sx + sy * sy) / tw;
    /* titik kaki tegak lurus pada segmen terdekat */
    var foot = null;
    if (bs && best <= 25) {
      var a = bs.s.a, b = bs.s.b, p = vecM(a, [y, x]), v2 = vecM(a, b), l2 = v2[0] * v2[0] + v2[1] * v2[1], t = l2 ? Math.max(0, Math.min(1, (p[0] * v2[0] + p[1] * v2[1]) / l2)) : 0;
      foot = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    return { axis: axis, conf: conf, d: best, foot: foot, name: bs ? bs.s.nm : "" };
  }
  function geoOK(it) { var y = +it.b.lat, x = +it.b.lng; return isFinite(y) && isFinite(x) && it.b.lat !== null && it.b.lng !== null; }
  /* tetangga pada ruas yang sama (atau sangat dekat bila ruas kosong), diurutkan jarak; jembatan kembar (<12 m) dilewati */
  function neighbours(it) {
    var y = +it.b.lat, x = +it.b.lng, rk = norm(it.b.ruas), out = [];
    items.forEach(function (o) {
      if (o === it || !geoOK(o)) return;
      var v = vecM([y, x], [+o.b.lat, +o.b.lng]), d = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
      if (d < 12 || d > 5000) return;
      var same = rk && norm(o.b.ruas) === rk;
      if (!same && d > 1500) return;
      out.push({ it: o, d: d, dx: v[0], dy: v[1], same: same });
    });
    out.sort(function (a, b) { return a.d - b.d; });
    return out;
  }
  function pickHeading(it, nb) {
    var y = +it.b.lat, x = +it.b.lng, ax = axisAt(y, x), axis = null, foot = null;
    if (ax && ax.conf > 0.35) { axis = ax.axis; foot = ax.foot; }
    if (axis == null) { var n0 = nb.filter(function (n) { return n.same || n.d < 600; })[0]; if (n0) axis = bearingXY(n0.dx, n0.dy) % 180; }
    if (axis == null) return { h: 0, known: false, foot: foot };
    var cands = [axis, (axis + 180) % 360], h = cands[0];
    var n1 = nb[0];
    if (n1) { var tb = bearingXY(n1.dx, n1.dy), d0 = Math.abs(((tb - cands[0] + 540) % 360) - 180), d1 = Math.abs(((tb - cands[1] + 540) % 360) - 180); h = d0 <= d1 ? cands[0] : cands[1]; }
    return { h: h, known: true, foot: foot };
  }
  function ahead(it, h, nb) {
    var s = Math.sin(h * Math.PI / 180), c = Math.cos(h * Math.PI / 180), f = null, bk = null;
    nb.forEach(function (n) {
      var pr = n.dx * s + n.dy * c, lat = Math.abs(n.dx * c - n.dy * s);
      if (!n.same && lat > 120) return;
      if (pr > 0 && (!f || n.d < f.d)) f = n; else if (pr < 0 && (!bk || n.d < bk.d)) bk = n;
    });
    return { f: f, b: bk };
  }
  var HN = ["utara", "timur laut", "timur", "tenggara", "selatan", "barat daya", "barat", "barat laut"];
  function hName(h) { return HN[Math.round(((h % 360) + 360) % 360 / 45) % 8]; }
  var ring = null;
  function rows(it) {
    var b = it.b, r = [];
    function a(l, v) { if (v != null && v !== "") r.push([l, v]); }
    a("Nomor", b.nomor); a("Ruas", b.ruas); a("Kab/Kota", b.kabupaten); a("STA/KM", b.sta);
    if (b.panjang != null && b.panjang !== "") a("Panjang", fmt(b.panjang) + " m");
    if (b.lebar != null && b.lebar !== "") a("Lebar", fmt(b.lebar) + " m");
    a("Tipe", b.tipe); a("Tahun", b.tahun); a("Kondisi", b.kondisi);
    a("Kelas", KM[it.k].s + " (" + it.conf + ")");
    return r;
  }
  function openSV(it, hOverride) {
    if (!it || !geoOK(it)) { tst("Koordinat jembatan tidak tersedia", true); return; }
    if (typeof window.openStreetViewForGeoResult !== "function") { window.open("https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + it.b.lat + "," + it.b.lng, "_blank", "noopener"); return; }
    var y = +it.b.lat, x = +it.b.lng, nb = neighbours(it), ph = pickHeading(it, nb), idx = it.i;
    var h = hOverride != null ? ((hOverride % 360) + 360) % 360 : ph.h;
    var py = y, px = x; if (ph.foot) { py = ph.foot[0]; px = ph.foot[1]; }
    var bar = {
      can: function (d, hh) { var a = ahead(it, hh, nb); return !!(d > 0 ? a.f : a.b); },
      go: function (d, hh) { var a = ahead(it, hh, nb), t = d > 0 ? a.f : a.b; if (t) openSV(t.it, d > 0 ? hh : hh + 180); },
      sub: function (hh) { var a = ahead(it, hh, nb), c = items[idx] || it; return KM[c.k].s + (c.b.panjang != null && c.b.panjang !== "" ? " · " + fmt(c.b.panjang) + " m" : "") + (a.f ? " · ▶ " + Math.round(a.f.d) + " m" : ""); },
      cls: {
        opts: KLS.map(function (z) { return [z.k, z.s]; }), val: function () { return (items[idx] || it).k; },
        set: function (v) { ov(idx, v); var s2; try { s2 = svState; } catch (e) { } if (s2) s2.rows = rows(items[idx] || it); try { if (typeof renderSvInfoPanel === "function") renderSvInfoPanel(); } catch (e) { } }
      }
    };
    try { window.openStreetViewForGeoResult(py, px, it.b.nama || "Jembatan", { hd: Math.round(h), rows: rows(it), pqJbk: idx, bar: bar }); } catch (e) { tst("Gagal membuka Street View", true); return; }
    showRing(y, x);
    tst("Street View: " + (it.b.nama || "Jembatan") + (ph.known || hOverride != null ? " · menghadap " + hName(h) : ""));
  }
  function showRing(y, x) {
    var m = MAP(); if (!m || !window.L) return;
    if (ring) { try { m.removeLayer(ring); } catch (e) { } ring = null; }
    ring = L.circleMarker([y, x], { radius: 17, color: "#22d3ee", weight: 3, fill: false, className: "jbk-ring", interactive: false }).addTo(m);
    if (!$("jbkRingCss")) { var c = document.createElement("style"); c.id = "jbkRingCss"; c.textContent = ".jbk-ring{animation:jbkPulse 1.3s ease-in-out infinite}@keyframes jbkPulse{0%,100%{stroke-opacity:1}50%{stroke-opacity:.25}}"; document.head.appendChild(c); }
  }
  setInterval(function () {
    if (!ring) return;
    var o = $("svOverlay"), s; try { s = typeof svState !== "undefined" ? svState : null; } catch (e) { s = null; }
    if (!(o && o.classList.contains("show") && s && s.pqJbk != null)) { var m = MAP(); try { m && m.removeLayer(ring); } catch (e) { } ring = null; }
  }, 700);

  /* ---------- impor ---------- */
  var ALIAS = {
    nama: ["nama", "namajembatan", "jembatan", "namajbt", "name"], nomor: ["nomor", "nojembatan", "nomorjembatan", "nobms", "bmsno", "kode", "kodejembatan", "noaset"],
    lat: ["lat", "latitude", "lintang", "y"], lng: ["lng", "lon", "long", "longitude", "bujur", "x"], panjang: ["panjang", "panjangm", "pjg", "length"], lebar: ["lebar", "lebarm", "lbr", "width"],
    tipe: ["tipe", "type", "jenis", "tipejembatan", "bangunanatas"], tahun: ["tahun", "thn", "tahunbangun", "tahundibangun"], ruas: ["ruas", "namaruas", "ruasjalan", "namajalan", "jalan", "link", "nolink"],
    kabupaten: ["kabupaten", "kab", "kabkota", "kabupatenkota", "kotakabupaten", "wilayah"], kelas: ["kelas", "status", "kewenangan", "statusjalan", "klasifikasi", "kelasjalan", "fungsi"],
    sta: ["sta", "km", "patok", "stasiun"], kondisi: ["kondisi", "kondisijembatan"], kecamatan: ["kecamatan", "kec"], coord: ["koordinat", "coordinate", "latlong", "latlng", "posisi"]
  };
  function nk(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function num(v) { if (v === "" || v == null) return null; var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; }
  function mapRow(r) {
    var key = {}; Object.keys(r).forEach(function (k) { key[nk(k)] = r[k]; });
    var o = {};
    Object.keys(ALIAS).forEach(function (f) { for (var i = 0; i < ALIAS[f].length; i++) { var v = key[ALIAS[f][i]]; if (v !== undefined && String(v).trim() !== "") { o[f] = v; break; } } });
    var lat = num(o.lat), lng = num(o.lng);
    if ((lat == null || lng == null) && o.coord) { var m = String(o.coord).match(/-?\d+[.,]?\d*/g); if (m && m.length >= 2) { lat = num(m[0]); lng = num(m[1]); } }
    if (lat != null && lng != null && Math.abs(lat) > 90 && Math.abs(lng) <= 90) { var t = lat; lat = lng; lng = t; }
    if (lat == null || lng == null || lat < -12 || lat > 7 || lng < 94 || lng > 142) return null;
    var ke = kelasOf(o.kelas);
    return {
      nama: String(o.nama || o.nomor || "Jembatan tanpa nama").trim(), nomor: o.nomor ? String(o.nomor).trim() : null, ruas: o.ruas ? String(o.ruas).trim() : null,
      panjang: num(o.panjang), lebar: num(o.lebar), tipe: o.tipe ? String(o.tipe).trim() : null, tahun: num(o.tahun), kabupaten: o.kabupaten ? String(o.kabupaten).trim() : null,
      kecamatan: o.kecamatan ? String(o.kecamatan).trim() : null, sta: o.sta ? String(o.sta).trim() : null, kondisi: o.kondisi ? String(o.kondisi).trim() : null,
      kelas: ke || undefined, lat: lat, lng: lng
    };
  }
  function fromGeo(g) {
    var fs = g.type === "FeatureCollection" ? g.features : g.type === "Feature" ? [g] : [];
    return fs.map(function (f) {
      var c = f.geometry && f.geometry.coordinates, ll = null, gt = f.geometry && f.geometry.type;
      if (gt === "Point") ll = c; else if (gt === "LineString" && c.length) ll = c[Math.floor(c.length / 2)]; else if (gt === "MultiPoint" && c.length) ll = c[0]; else if (gt === "Polygon" && c[0] && c[0].length) ll = c[0][0];
      var p = Object.assign({}, f.properties || {}); if (ll) { p.lat = ll[1]; p.lng = ll[0]; }
      return p;
    });
  }
  function hav(a, b, c, d) { var R = 6371000, p = Math.PI / 180, x = Math.sin((c - a) * p / 2), y = Math.sin((d - b) * p / 2); var h = x * x + Math.cos(a * p) * Math.cos(c * p) * y * y; return 2 * R * Math.asin(Math.sqrt(h)); }
  function finish(rows) {
    var db; try { db = JEMBATAN_DB; } catch (e) { db = null; }
    if (!db) { tst("Database jembatan belum siap", true); return; }
    var bad = 0, dup = 0, add = 0, byNo = {}, now = Date.now(), added = [];
    db.forEach(function (b) { if (b.nomor) byNo[norm(b.nomor)] = 1; });
    rows.forEach(function (raw, i) {
      var r = mapRow(raw); if (!r) { bad++; return; }
      var d = false;
      if (r.nomor && byNo[norm(r.nomor)]) d = true;
      else { var nn = norm(r.nama); for (var j = 0; j < db.length; j++) { var b = db[j]; if (norm(b.nama) === nn && b.lat != null && hav(+b.lat, +b.lng, r.lat, r.lng) < 30) { d = true; break; } } }
      if (d) { dup++; return; }
      if (!r.kelas) delete r.kelas;
      r.id = "jbt-" + norm(r.nama).replace(/ /g, "-").slice(0, 40) + "-" + now + "-" + i; r.no = db.length + 1;
      db.push(r); added.push(r); add++; if (r.nomor) byNo[norm(r.nomor)] = 1;
    });
    try { if (typeof persistJembatan === "function") persistJembatan(); } catch (e) { }
    try { if (typeof renderJembatanList === "function") renderJembatanList(); } catch (e) { }
    build();
    var seen = {}; added.forEach(function (b) { var it = items.filter(function (x) { return x.b === b; })[0]; if (it) seen[it.k] = 1; });
    Object.keys(seen).forEach(function (k) { st.on[k] = true; }); save(); paint(); renderPanel();
    tst("Impor: " + add + " ditambahkan" + (dup ? ", " + dup + " duplikat dilewati" : "") + (bad ? ", " + bad + " ditolak (koordinat tidak valid)" : ""), !add);
  }
  function readFile(f) {
    var ext = (f.name.split(".").pop() || "").toLowerCase(), rd = new FileReader();
    if (/^(geojson|json)$/.test(ext)) {
      rd.onload = function () { try { finish(fromGeo(JSON.parse(rd.result))); } catch (e) { tst("File GeoJSON tidak valid", true); } };
      rd.readAsText(f);
    } else {
      if (!window.XLSX) { tst("Library Excel belum siap, coba lagi sebentar", true); return; }
      rd.onload = function () {
        try {
          var wb = XLSX.read(rd.result, { type: "array" }), rows = [];
          wb.SheetNames.forEach(function (sn) { rows = rows.concat(XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "" })); });
          finish(rows);
        } catch (e) { tst("File tidak bisa dibaca: " + e.message, true); }
      };
      rd.readAsArrayBuffer(f);
    }
  }
  function xls() {
    if (!window.XLSX) { tst("Library Excel belum siap", true); return; }
    var rows = items.map(function (it) {
      var b = it.b; return { "Nama": b.nama, "Nomor": b.nomor, "Kelas": KM[it.k].s, "Keyakinan": it.conf, "Dasar Klasifikasi": it.why, "Ruas": b.ruas, "Kabupaten/Kota": b.kabupaten, "STA/KM": b.sta, "Panjang (m)": b.panjang, "Lebar (m)": b.lebar, "Tipe": b.tipe, "Tahun": b.tahun, "Kondisi": b.kondisi, "Latitude": b.lat, "Longitude": b.lng };
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Jembatan");
    var c = counts(), sum = KLS.map(function (x) { return { "Kelas": x.s, "Jumlah": c.c[x.k], "Total Panjang (m)": Math.round(c.len[x.k] * 10) / 10 }; });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sum), "Ringkasan");
    XLSX.writeFile(wb, "jembatan-per-kewenangan-" + new Date().toISOString().slice(0, 10) + ".xlsx");
  }

  /* ---------- panel ---------- */
  var CSS = [
    "#jbkPanel{position:fixed;left:var(--pq-fl,364px);top:calc(var(--pq-ft,70px) + 52px);z-index:1260;width:min(390px,calc(100vw - 20px));max-height:calc(100dvh - var(--pq-ft,70px) - 70px);display:none;flex-direction:column;background:rgba(10,14,23,.97);border:1px solid #334155;border-radius:14px;color:#e6f1fb;font:12.5px system-ui,sans-serif;box-shadow:0 14px 40px #000a;overflow:hidden}",
    "#jbkPanel.open{display:flex}#jbkPanel header{display:flex;align-items:center;gap:8px;padding:11px 12px 8px}#jbkPanel header b{flex:1;font-size:14px}#jbkPanel header small{display:block;color:#8fa6bd;font-weight:400;font-size:10.5px;margin-top:2px}",
    "#jbkPanel .x{border:0;background:transparent;color:#8fa6bd;font-size:20px;line-height:1;cursor:pointer;width:28px;height:28px;border-radius:50%}#jbkPanel .x:hover{color:#fff;background:#ffffff1a}",
    "#jbkPanel .bd{overflow:auto;padding:0 12px 12px;overscroll-behavior:contain}",
    ".jbk-ch{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:4px 0 9px}",
    ".jbk-c{display:flex;flex-direction:column;gap:2px;text-align:left;padding:8px 9px;border:1px solid #334155;border-left:4px solid var(--c);border-radius:10px;background:#0f1726;color:inherit;cursor:pointer;font:inherit}.jbk-c.on{background:color-mix(in srgb,var(--c) 16%,#0f1726);border-color:var(--c)}",
    ".jbk-c b{font-size:12px}.jbk-c span{font-size:10.5px;color:#9fb3c8}.jbk-c em{font-style:normal;font-size:9px;font-weight:800;letter-spacing:.5px;color:var(--c)}",
    ".jbk-q{display:flex;gap:6px;margin:6px 0}.jbk-q input{flex:1;min-width:0;background:#0b1220;border:1px solid #334155;color:#e6f1fb;border-radius:8px;padding:7px 9px;font:inherit}",
    ".jbk-f{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px}.jbk-f button,.jbk-ab button{border:1px solid #334155;background:#0f1726;color:#c9d8e8;border-radius:999px;padding:4px 9px;font:600 11px system-ui;cursor:pointer}.jbk-f button.on{background:#22d3ee22;border-color:#22d3ee;color:#fff}",
    ".jbk-ab{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.jbk-ab button{border-radius:9px;padding:7px 10px}.jbk-ab button.p{background:linear-gradient(135deg,#0e7490,#3b82f6);border:0;color:#fff}",
    ".jbk-l{display:flex;flex-direction:column;gap:3px;max-height:260px;overflow:auto}.jbk-i{display:flex;gap:8px;align-items:center;padding:6px 7px;border-radius:8px;cursor:pointer;border:1px solid transparent}.jbk-i:hover{background:#ffffff0d;border-color:#334155}",
    ".jbk-i i{width:9px;height:9px;border-radius:50%;background:var(--c);flex:none}.jbk-i div{min-width:0;flex:1}.jbk-i b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jbk-i small{color:#8fa6bd;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}",
    ".jbk-q2{font-size:10.5px;color:#8fa6bd;line-height:1.45;margin:6px 0}.jbk-q2 b{color:#cfe3f5}",
    ".jbk-pop{min-width:230px;color:#e6f1fb}.jbk-pop .jbk-t{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #ffffff22}.jbk-pop .jbk-t em{font-style:normal;font-size:10px;font-weight:700;color:var(--c);border:1px solid var(--c);border-radius:99px;padding:2px 8px;white-space:nowrap}",
    ".jbk-r{display:flex;justify-content:space-between;gap:12px;font-size:12px;padding:1px 0}.jbk-r span{color:#9fb3c8}.jbk-r b{text-align:right;font-weight:600}.jbk-why{margin-top:7px;font-size:11px;color:#b6c8da;line-height:1.4}.jbk-why i{color:#8fa6bd}",
    ".jbk-ac{display:flex;gap:6px;margin-top:8px}.jbk-ac select,.jbk-ac a{flex:1;text-align:center;text-decoration:none;font:600 12px system-ui;color:#e6f1fb;background:#0f1726;border:1px solid #334155;border-radius:7px;padding:5px}",
    ".leaflet-popup-content-wrapper:has(.jbk-pop){background:#0f1522f2;border:1px solid #334155;color:#e6f1fb}.leaflet-popup:has(.jbk-pop) .leaflet-popup-tip{background:#0f1522f2}",
    ".jbk-tip{background:#0a0e17f5!important;border:1px solid #475569!important;color:#fff!important;border-radius:7px;padding:2px 7px;font:700 11px system-ui,sans-serif}.jbk-tip:before{display:none}"
  ].join("\n");

  function renderPanel() {
    if (!panel || !panel.classList.contains("open")) return;
    var c = counts(), h = "";
    h += '<header><div style="flex:1"><b>Jembatan per Kewenangan</b><small>' + c.n + " jembatan · diklasifikasi otomatis</small></div><button class=\"x\" data-a=\"x\" aria-label=\"Tutup\">×</button></header><div class=\"bd\">";
    h += '<div class="jbk-ch">';
    KLS.forEach(function (x) {
      h += '<button class="jbk-c' + (st.on[x.k] ? " on" : "") + '" style="--c:' + x.c + '" data-a="t:' + x.k + '" title="Nyalakan/matikan di peta"><em>' + (st.on[x.k] ? "TAMPIL" : "OFF") + "</em><b>" + x.s + " · " + c.c[x.k] + "</b><span>" + fmt(c.len[x.k], 0) + " m total panjang</span></button>";
    });
    h += "</div>";
    h += '<div class="jbk-q2">Keyakinan klasifikasi: <b>' + (c.cf.data + c.cf.manual) + "</b> dari data/manual · <b>" + c.cf.tinggi + "</b> tinggi · <b>" + c.cf.sedang + "</b> sedang · <b>" + c.cf.rendah + "</b> rendah (titik pudar bergaris putus — periksa &amp; koreksi lewat popup).</div>";
    h += '<div class="jbk-ab"><button class="p" data-a="imp">Impor Excel / CSV / GeoJSON</button><button data-a="xls">Unduh Excel</button><button data-a="fit">Lihat semua</button><button data-a="scan" title="Hitung ulang klasifikasi">Hitung ulang</button></div>';
    h += '<div class="jbk-f"><button data-a="f:" class="' + (st.flt ? "" : "on") + '">Semua</button>';
    KLS.forEach(function (x) { h += '<button data-a="f:' + x.k + '" class="' + (st.flt === x.k ? "on" : "") + '">' + x.s + "</button>"; });
    h += '</div><div class="jbk-q"><input id="jbkQ" type="search" placeholder="Cari nama, nomor, ruas, kabupaten…" value="' + esc(st.q) + '" autocomplete="off"></div><div class="jbk-l" id="jbkL"></div>';
    h += '<div class="jbk-q2">Impor mengenali kolom otomatis (nama, nomor, lat/lng atau koordinat, panjang, lebar, tipe, tahun, ruas, kabupaten, <b>kelas/status/kewenangan</b>). Jika kolom kelas ada, nilainya dipakai langsung.</div></div>';
    panel.innerHTML = h;
    renderList();
  }
  function renderList() {
    var L_ = $("jbkL"); if (!L_) return;
    var q = norm(st.q), out = "", n = 0, shown = 0;
    items.forEach(function (it) {
      if (st.flt && it.k !== st.flt) return;
      if (q && norm([it.b.nama, it.b.nomor, it.b.ruas, it.b.kabupaten].join(" ")).indexOf(q) < 0) return;
      n++; if (shown >= 120) return; shown++;
      out += '<div class="jbk-i" style="--c:' + KM[it.k].c + '" data-a="go:' + it.i + '"><i></i><div><b>' + esc(it.b.nama || "Jembatan") + "</b><small>" + KM[it.k].s + " · " + esc(it.b.ruas || it.b.kabupaten || "-") + (it.b.panjang ? " · " + fmt(it.b.panjang) + " m" : "") + "</small></div></div>";
    });
    L_.innerHTML = out || '<div class="jbk-q2">Tidak ada jembatan yang cocok.</div>';
    if (n > shown) L_.insertAdjacentHTML("beforeend", '<div class="jbk-q2">Menampilkan ' + shown + " dari " + n + " — persempit dengan kolom cari.</div>");
  }
  function openPanel() {
    if (!panel) buildPanel();
    if (!built) build();
    panel.classList.add("open"); renderPanel();
  }
  function buildPanel() {
    var s = document.createElement("style"); s.id = "jbkCss"; s.textContent = CSS; document.head.appendChild(s);
    panel = document.createElement("div"); panel.id = "jbkPanel"; document.body.appendChild(panel);
    var fi = document.createElement("input"); fi.type = "file"; fi.accept = ".xlsx,.xls,.csv,.geojson,.json"; fi.style.display = "none"; document.body.appendChild(fi);
    fi.onchange = function () { if (fi.files[0]) readFile(fi.files[0]); fi.value = ""; };
    panel.addEventListener("click", function (e) {
      var t = e.target.closest("[data-a]"); if (!t) return;
      var a = t.getAttribute("data-a");
      if (a === "x") panel.classList.remove("open");
      else if (a === "imp") fi.click();
      else if (a === "xls") xls();
      else if (a === "fit") fitKelas("");
      else if (a === "scan") { build(); renderPanel(); tst("Klasifikasi dihitung ulang"); }
      else if (a.indexOf("t:") === 0) setOn(a.slice(2), !st.on[a.slice(2)]);
      else if (a.indexOf("f:") === 0) { st.flt = a.slice(2); renderPanel(); }
      else if (a.indexOf("go:") === 0) fly(+a.slice(3));
    });
    panel.addEventListener("input", function (e) { if (e.target.id === "jbkQ") { st.q = e.target.value; renderList(); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") panel.classList.remove("open"); });
  }

  /* ---------- daftar di menu folder + kolom cari ---------- */
  var IC = '<i class="pq-fi">\ue4c9</i>';
  function rows() {
    if (!built) build();
    var c = counts();
    return KLS.map(function (x) { return { id: x.k, name: x.n + " (" + c.c[x.k] + ")", ic: IC, c: x.c, on: !!st.on[x.k] }; })
      .concat([{ id: "panel", name: "Ringkasan, daftar & impor jembatan", ic: '<i class="pq-fi">\uf0ca</i>', c: "#a78bfa", on: null }]);
  }
  function act(id) {
    if (id === "panel") { openPanel(); return; }
    if (KM[id]) { var v = !st.on[id]; setOn(id, v); if (v) { var c = counts(); if (!c.c[id]) tst("Belum ada data " + KM[id].n.toLowerCase() + " — buka Ringkasan untuk impor", true); } }
  }
  window.PQ_FOLDER_EXTRA = window.PQ_FOLDER_EXTRA || [];
  window.PQ_FOLDER_EXTRA.push({ t: "Lapisan Jembatan", rows: rows, act: act });
  window.PETAQU_JBK = {
    rows: rows, act: act, open: openPanel, ov: ov, sv: function (i) { var it = items[+i]; if (it) openSV(it); }, axis: function (y, x) { try { var a = axisAt(+y, +x); return a && a.conf > 0.35 ? a.axis : null; } catch (e) { return null; } }, classify: classify, stats: function () { if (!built) build(); return counts(); },
    items: function () { return items.map(function (it) { return { nama: it.b.nama, kelas: it.k, keyakinan: it.conf, dasar: it.why }; }); }
  };

  /* ---------- start: tunggu peta, pantau perubahan data ---------- */
  function boot() {
    build();
    var tries = 0, w = setInterval(function () {
      var m = MAP(); tries++;
      if (m && window.L && m.getPane) {
        clearInterval(w); paint();
        m.on("zoomend", function () { var R = rad(); items.forEach(function (it) { if (it.mk) it.mk.setRadius(R); }); });
      } else if (tries > 120) clearInterval(w);
    }, 500);
    setInterval(function () { try { var a = src(); if (sig(a) !== sigv) { build(); renderPanel(); } } catch (e) { } }, 2000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
