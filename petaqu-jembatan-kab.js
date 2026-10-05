/* PETAQU — Jembatan per Kabupaten (Jateng–DIY)
   Mengelompokkan semua jembatan menurut BATAS KABUPATEN/KOTA (point-in-polygon terhadap data batas
   di panel "Kabupaten"; bila titik tak jatuh di polygon manapun dipakai kolom "kabupaten" lalu
   kabupaten terdekat). Tampilan & kontrol sengaja sama dengan panel Wilayah Kabupaten:
   kartu provinsi, cari, urut A–Z / terbanyak, centang kabupaten, isian, garis batas, label.
   Klik nama kabupaten di daftar -> ringkasan + daftar jembatan (klik jembatan = zoom + popup). */
(function () {
  "use strict";
  if (window.__pqJbKab) return;
  window.__pqJbKab = 1;

  var KEY = "petaqu_jbkab_v1";
  var DIY = { "Kulon Progo": 1, Bantul: 1, Gunungkidul: 1, Sleman: 1, "Kota Yogyakarta": 1 };
  var PROV = { jt: "Jawa Tengah", diy: "D.I. Yogyakarta" };
  var st = { on: false, op: 0.28, lab: true, nm: true, pj: true, ln: true, clk: true, sort: "az", pv: "", chk: [] };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) {}
  var chk = {}, seq = 0;
  (Array.isArray(st.chk) ? st.chk : []).forEach(function (i) { chk[i] = ++seq; });
  function save() {
    st.chk = Object.keys(chk).map(Number).sort(function (a, b) { return chk[a] - chk[b]; });
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
  }

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n, d) { return Number(n).toLocaleString("id-ID", { maximumFractionDigits: d == null ? 1 : d }); }
  function MAP() { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } }
  function color(i) { return "hsl(" + Math.round(i * 137.508 % 360) + ",72%,58%)"; }
  function label(k) { return k.t === "Kab." ? "Kab. " + k.n : k.n; }
  function norm(s) { return String(s || "").toLowerCase().replace(/kabupaten|kab\.?|kota|\(.*?\)/g, "").replace(/[^a-z]/g, ""); }

  var K = [], bridges = [], byK = [], outside = [], ready = false;
  var map_, gPoly, gLab, gBr, polys = [], labs = [], marks = [], sel = -1, detail = -1;

  /* ---------- data ---------- */
  function loadK() {
    var el = $("kb-data");
    if (!el) return false;
    try { K = JSON.parse(el.textContent); } catch (e) { return false; }
    K.forEach(function (k) {
      var minA = 90, maxA = -90, minO = 180, maxO = -180;
      k.p.forEach(function (poly) { poly[0].forEach(function (q) { if (q[0] < minA) minA = q[0]; if (q[0] > maxA) maxA = q[0]; if (q[1] < minO) minO = q[1]; if (q[1] > maxO) maxO = q[1]; }); });
      k._b = [minA, minO, maxA, maxO];
      k._prov = DIY[k.n] ? "diy" : "jt";
    });
    return true;
  }
  function inRing(y, x, r) {
    var c = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      var yi = r[i][0], xi = r[i][1], yj = r[j][0], xj = r[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function inK(k, y, x) {
    var b = k._b;
    if (y < b[0] || y > b[2] || x < b[1] || x > b[3]) return false;
    for (var i = 0; i < k.p.length; i++) {
      var poly = k.p[i];
      if (inRing(y, x, poly[0])) {
        var hole = false;
        for (var h = 1; h < poly.length; h++) if (inRing(y, x, poly[h])) { hole = true; break; }
        if (!hole) return true;
      }
    }
    return false;
  }
  function findK(b) {
    var y = +b.lat, x = +b.lng;
    if (!isFinite(y) || !isFinite(x)) return -1;
    var hits = [];
    for (var i = 0; i < K.length; i++) if (inK(K[i], y, x)) hits.push(i);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {                       /* tumpang tindih: utamakan yang cocok dengan nama */
      var nm = norm(b.kabupaten);
      for (var h = 0; h < hits.length; h++) if (nm && norm(K[hits[h]].n) === nm) return hits[h];
      return hits[0];
    }
    var nn = norm(b.kabupaten);
    if (nn) for (var j = 0; j < K.length; j++) if (norm(K[j].n) === nn) return j;
    var best = -1, bd = 0.12;                    /* terdekat (~13 km) dari pusat wilayah */
    for (var m = 0; m < K.length; m++) {
      var dy = K[m].c[0] - y, dx = K[m].c[1] - x, d = Math.sqrt(dy * dy + dx * dx);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  function group() {
    var src = (typeof JEMBATAN_DB !== "undefined" && JEMBATAN_DB && JEMBATAN_DB.length) ? JEMBATAN_DB
      : (typeof JEMBATAN_SEED !== "undefined" ? JEMBATAN_SEED : []);
    bridges = src;
    byK = K.map(function () { return []; });
    outside = [];
    src.forEach(function (b) {
      var i = findK(b);
      b._k = i;
      if (i < 0) outside.push(b); else byK[i].push(b);
    });
  }
  function len(i) { return byK[i].reduce(function (a, b) { return a + (+b.panjang || 0); }, 0); }
  function cnt(i) { return byK[i].length; }
  function nChk() { return Object.keys(chk).length; }
  function shown(i) { return !nChk() || !!chk[i] || i === sel; }
  function ids(pv) { return K.map(function (k, i) { return i; }).filter(function (i) { return !pv || K[i]._prov === pv; }); }

  /* ---------- UI ---------- */
  var HTML =
    '<header><div style="flex:1"><b>Jembatan per Kabupaten Jateng–DIY</b><small id="jbStat"></small></div>' +
    '<label class="kb-sw" title="Tampilkan / sembunyikan"><input type="checkbox" id="jbOn"><span></span></label>' +
    '<button class="x" id="jbX" aria-label="Tutup">×</button></header>' +
    '<div class="body"><div class="kb-chips" id="jbChips"></div>' +
    '<div class="kb-row"><span>Isian</span><input type="range" id="jbOp" min="0" max="70" step="5"><b id="jbOpv"></b></div>' +
    '<div id="jbLh" style="display:flex;flex-direction:column;gap:8px">' +
    '<div class="kb-pvh"><span>Pilih provinsi</span><button type="button" id="jbPvAll">Semua</button></div><div class="kb-pv" id="jbPv"></div>' +
    '<input id="jbQ" type="search" placeholder="Cari kabupaten / kota atau jembatan…" autocomplete="off">' +
    '<div class="kb-seg" id="jbSeg"><button data-s="az">A–Z</button><button data-s="n">Terbanyak</button><button data-s="km">Terpanjang</button></div>' +
    '<div class="kb-ckbar"><span id="jbCkN"></span><button type="button" data-a="all">Centang semua</button><button type="button" data-a="none">Hapus centang</button></div></div>' +
    '<div id="jbMain"></div></div>';

  function css() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll("style"), function (s) {
      var t = s.textContent || "";
      if (s.id === "pq-jb-css" || t.indexOf("kbPanel") < 0 && t.indexOf("kbBtn") < 0) return;
      /* hanya aturan yang menyebut id panel/tombol kabupaten -> salin untuk jembatan */
      out.push(t.replace(/kbPanel/g, "jbPanel").replace(/kbBtn/g, "jbBtn").replace(/kbMain/g, "jbMain").replace(/#kbQ/g, "#jbQ"));
    });
    var el = document.createElement("style");
    el.id = "pq-jb-css";
    el.textContent = out.join("\n") +
      "\n#jbBtn{display:none}#jbPanel .jb-b{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:9px;cursor:pointer}#jbPanel .jb-b:hover{background:#ffffff0f}" +
      "#jbPanel .jb-b>i{width:4px;align-self:stretch;border-radius:3px;flex:none}#jbPanel .jb-b b{font-size:12.5px;font-weight:600}#jbPanel .jb-b small{display:block;color:#9fb0c8;font-size:11px}" +
      ".jb-dot{width:100%;height:100%}.jb-tip{background:#0a0e17f2;border:1px solid #c084fc88;color:#fff;border-radius:8px;padding:2px 7px;font:600 10.5px system-ui;box-shadow:0 4px 12px #0008}.jb-tip:before{display:none}" +
      ".jb-pop b{display:block;font-size:13px;margin-bottom:3px}.jb-pop span{display:block;font-size:12px;color:#334155}" +
      "html body #jbPanel.open{display:flex}";
    document.head.appendChild(el);
  }

  function build() {
    var btn = document.createElement("button");
    btn.id = "jbBtn"; btn.type = "button"; btn.className = "off"; btn.title = "Jembatan per kabupaten";
    btn.innerHTML = '<span class="dot"></span><span>Jembatan</span>';
    document.body.appendChild(btn);
    var p = document.createElement("div");
    p.id = "jbPanel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Jembatan per Kabupaten");
    p.innerHTML = HTML;
    document.body.appendChild(p);
    css();

    btn.onclick = function () { p.classList.toggle("open"); };
    $("jbX").onclick = function () { p.classList.remove("open"); };
    $("jbOn").onchange = function () { st.on = this.checked; save(); apply(); };
    $("jbOp").oninput = function () { st.op = this.value / 100; save(); apply(); };
    $("jbChips").onclick = function (e) {
      var o = e.target.closest(".kb-opt"); if (!o) return;
      st[o.dataset.k] = !st[o.dataset.k]; save(); apply();
    };
    $("jbPvAll").onclick = function () { pickProv(""); };
    $("jbPv").onclick = function (e) { var b = e.target.closest(".kb-pc"); if (b) pickProv(b.dataset.p); };
    $("jbQ").oninput = function () { detail = -1; list(); };
    $("jbSeg").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; st.sort = b.dataset.s; save(); list(); };
    p.querySelector(".kb-ckbar").onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var vis = ids(st.pv);
      if (b.dataset.a === "all") vis.forEach(function (i) { if (!chk[i]) chk[i] = ++seq; }); else chk = {}, seq = 0;
      save(); apply(true);
    };
    $("jbMain").onclick = function (e) {
      var c = e.target.closest(".kb-ck");
      if (c) { var i = +c.dataset.c; chk[i] ? delete chk[i] : chk[i] = ++seq; save(); apply(true); return; }
      if (e.target.closest(".jb-back")) { detail = -1; sel = -1; apply(true); return; }
      var br = e.target.closest(".jb-b");
      if (br) { goBridge(+br.dataset.b); return; }
      var k = e.target.closest(".kb-k");
      if (k) openK(+k.dataset.c);
    };
  }

  function pickProv(pv) {
    detail = -1; sel = -1;
    if (!pv || st.pv === pv) { st.pv = ""; chk = {}; seq = 0; }
    else { st.pv = pv; chk = {}; seq = 0; ids(pv).forEach(function (i) { chk[i] = ++seq; }); $("jbQ").value = ""; }
    save(); apply(true);
    var M = MAP();
    if (M && st.on && nChk() === 0 && gPoly) { try { M.fitBounds(gPoly.getBounds()); } catch (e) {} }
  }

  function openK(i) {
    detail = i; sel = i; apply(true);
    var M = MAP(); if (M && polys[i]) { try { M.fitBounds(polys[i].getBounds(), { padding: [30, 30] }); } catch (e) {} }
  }

  function goBridge(bi) {
    var b = bridges[bi]; if (!b) return;
    var M = MAP(); if (!M || !isFinite(b.lat)) return;
    if (!st.on) { st.on = true; save(); apply(); }
    M.setView([b.lat, b.lng], Math.max(M.getZoom(), 16));
    if (marks[bi]) marks[bi].openPopup();
  }

  function chips() {
    var t = [["lab", "Label nama"], ["nm", "Nama jembatan"], ["pj", "Panjang jembatan"], ["ln", "Garis batas"], ["clk", "Klik wilayah"]];
    $("jbChips").innerHTML = t.map(function (n) { return '<div class="kb-opt' + (st[n[0]] ? " on" : "") + '" data-k="' + n[0] + '"><i></i>' + n[1] + "</div>"; }).join("");
  }

  function provCards() {
    $("jbPv").innerHTML = [["jt", "fa-mountain-sun"], ["diy", "fa-landmark"]].map(function (n) {
      var e = n[0], a = ids(e), nb = a.reduce(function (s, i) { return s + cnt(i); }, 0), m = a.reduce(function (s, i) { return s + len(i); }, 0);
      var c = a.filter(function (i) { return chk[i]; }).length, on = st.pv === e;
      return '<button type="button" class="kb-pc ' + e + (on ? " on" : "") + '" data-p="' + e + '" aria-pressed="' + on + '"><span class="ck"><i class="fa-solid fa-check"></i></span>' +
        '<span class="t"><i class="fa-solid ' + n[1] + '"></i>' + PROV[e] + "</span><small><b>" + fmt(nb, 0) + "</b> jembatan · <b>" + fmt(m, 0) + '</b> m</small>' +
        '<span class="pg"><u><s style="width:' + (a.length ? c / a.length * 100 : 0) + '%"></s></u>' + c + "/" + a.length + "</span></button>";
    }).join("");
    $("jbPvAll").classList.toggle("on", !st.pv);
  }

  function list() {
    var M = $("jbMain"), q = ($("jbQ").value || "").trim().toLowerCase();
    $("jbLh").style.display = detail > -1 ? "none" : "flex";
    if (detail > -1) {
      var k = K[detail], bs = byK[detail], tl = len(detail), sorted = bs.slice().sort(function (a, b) { return (+b.panjang || 0) - (+a.panjang || 0); });
      var types = {}; bs.forEach(function (b) { var t = b.tipe || "–"; types[t] = (types[t] || 0) + 1; });
      M.innerHTML = '<button class="kb-back jb-back" type="button">← Semua kabupaten</button>' +
        '<div class="kb-hd" style="--c:' + color(detail) + '"><b>' + esc(label(k)) + "</b><small>" + PROV[k._prov] + "</small></div>" +
        '<div class="kb-st"><div><b>' + fmt(bs.length, 0) + "</b><span>jembatan</span></div><div><b>" + fmt(tl) + " m</b><span>total panjang</span></div><div><b>" +
        fmt(bs.length ? tl / bs.length : 0) + " m</b><span>rata-rata</span></div></div>" +
        '<div class="kb-lg">' + Object.keys(types).map(function (t) { return "<span>" + esc(t) + ": " + types[t] + "</span>"; }).join("") + "</div>" +
        (sorted.length ? sorted.map(function (b) {
          return '<div class="jb-b" data-b="' + bridges.indexOf(b) + '"><i style="background:' + color(detail) + '"></i><div style="flex:1;min-width:0"><b>' + esc(b.nama || "(tanpa nama)") + "</b><small>" +
            esc(b.ruas || "") + (b.nomor ? " · " + esc(b.nomor) : "") + "</small></div><em style=\"font-style:normal;font-size:11.5px;color:#9fb0c8\">" + (b.panjang ? fmt(b.panjang) + " m" : "–") + "</em></div>";
        }).join("") : '<div class="kb-emp">Tidak ada jembatan di wilayah ini.</div>');
      return;
    }
    var a = ids(st.pv).filter(function (i) {
      if (!q) return true;
      if (label(K[i]).toLowerCase().indexOf(q) > -1) return true;
      return byK[i].some(function (b) { return String(b.nama || "").toLowerCase().indexOf(q) > -1; });
    });
    a.sort(function (x, y) {
      if (st.sort === "n") return cnt(y) - cnt(x) || label(K[x]).localeCompare(label(K[y]));
      if (st.sort === "km") return len(y) - len(x) || label(K[x]).localeCompare(label(K[y]));
      return label(K[x]).localeCompare(label(K[y]), "id");
    });
    var mx = Math.max.apply(0, ids("").map(cnt).concat([1]));
    M.innerHTML = a.length ? a.map(function (i) {
      return '<div class="kb-k" data-c="' + i + '"><span class="kb-ck' + (chk[i] ? " on" : "") + '" data-c="' + i + '" style="--c:' + color(i) + '"></span>' +
        '<div><b>' + esc(label(K[i])) + '</b><span class="bar"><u style="width:' + (cnt(i) / mx * 100) + '%;background:' + color(i) + '"></u></span></div>' +
        "<em>" + fmt(cnt(i), 0) + " jbt · " + fmt(len(i), 0) + " m</em></div>";
    }).join("") : '<div class="kb-emp">Tidak ditemukan.</div>';
    var n = nChk();
    $("jbCkN").textContent = n ? n + " kabupaten dicentang" : "Belum ada yang dicentang (menampilkan semua)";
    $("jbSeg").querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.dataset.s === st.sort); });
  }

  /* ---------- peta ---------- */
  function polyStyle(i) {
    var s = i === sel, v = shown(i);
    return { fill: v, stroke: v && (s || st.ln), weight: s ? 3.2 : 1.2, opacity: s ? 1 : 0.8, color: s ? "#fde047" : "#fff", fillOpacity: st.op };
  }
  function popup(b) {
    var rows = [["No. Jembatan", b.nomor], ["Ruas", b.ruas], ["Panjang", b.panjang ? fmt(b.panjang) + " m" : ""], ["Lebar", b.lebar ? fmt(b.lebar) + " m" : ""],
      ["Tipe", b.tipe], ["Tahun", b.tahun], ["Kabupaten", b._k > -1 ? label(K[b._k]) : (b.kabupaten || "")], ["STA", b.sta]];
    return '<div class="jb-pop"><b>' + esc(b.nama || "(tanpa nama)") + "</b>" + rows.filter(function (r) { return r[1] !== "" && r[1] != null; })
      .map(function (r) { return "<span>" + r[0] + ": <b style=\"display:inline;font-size:12px\">" + esc(r[1]) + "</b></span>"; }).join("") + "</div>";
  }
  function initMap() {
    map_ = MAP();
    if (!map_ || !window.L) return false;
    if (!map_.getPane("jbKabPane")) map_.createPane("jbKabPane").style.zIndex = 262;
    if (!map_.getPane("jbLabPane")) { var lp = map_.createPane("jbLabPane"); lp.style.zIndex = 641; lp.style.pointerEvents = "none"; }
    if (!map_.getPane("jbBrPane")) map_.createPane("jbBrPane").style.zIndex = 660;
    gPoly = L.featureGroup(); gLab = L.layerGroup(); gBr = L.layerGroup();
    K.forEach(function (k, i) {
      var pg = L.polygon(k.p, Object.assign({ pane: "jbKabPane", fillColor: color(i) }, polyStyle(i)));
      pg.bindTooltip("<b>" + esc(label(k)) + "</b><span>" + fmt(cnt(i), 0) + " jembatan · " + fmt(len(i)) + " m</span>", { sticky: true, className: "kb-tip", direction: "top", opacity: 1 });
      pg.on("click", function () { if (st.clk) { var p = $("jbPanel"); p.classList.add("open"); openK(i); } });
      polys[i] = pg; gPoly.addLayer(pg);
      labs[i] = L.marker(k.c, { pane: "jbLabPane", interactive: false, keyboard: false, icon: L.divIcon({ className: "kb-lab", iconSize: [0, 0],
        html: '<div class="kb-l' + (k.t === "Kota" ? " kota" : "") + '"><b>' + esc(k.n) + "</b><small>" + cnt(i) + " jbt</small></div>" }) }).addTo(gLab);
    });
    bridges.forEach(function (b, bi) {
      if (!isFinite(b.lat) || !isFinite(b.lng) || b._k < 0) return;
      var m = L.circleMarker([b.lat, b.lng], { pane: "jbBrPane", radius: 5, weight: 1.5, color: "#fff", fillColor: color(b._k), fillOpacity: 0.95 });
      m.bindPopup(popup(b), { maxWidth: 260 });
      m._b = b; marks[bi] = m;
    });
    map_.on("zoomend moveend", brLabels);
    map_.on("zoomend", function () {
      var z = map_.getZoom(), c = map_.getContainer();
      c.classList.toggle("jbz7", z < 7);
      c.style.setProperty("--kbfs", Math.min(17, Math.max(9, 7 + (z - 7) * 1.6)).toFixed(1) + "px");
    });
    return true;
  }
  function brLabels() {
    if (!map_ || !st.on) return;
    var z = map_.getZoom(), show = (st.nm || st.pj) && z >= 14;
    marks.forEach(function (m) {
      if (!m) return;
      var has = m.getTooltip && m.getTooltip();
      if (show && m._on) {
        var t = (st.nm ? (m._b.nama || "") : "") + (st.pj && m._b.panjang ? (st.nm ? " · " : "") + fmt(m._b.panjang) + " m" : "");
        if (!t) { if (has) m.unbindTooltip(); return; }
        if (has) m.setTooltipContent(esc(t));
        else m.bindTooltip(esc(t), { permanent: true, direction: "right", offset: [6, 0], className: "jb-tip", opacity: 1 });
      } else if (has) m.unbindTooltip();
    });
  }

  function stat() {
    var tot = K.reduce(function (s, k, i) { return s + cnt(i); }, 0), tl = K.reduce(function (s, k, i) { return s + len(i); }, 0);
    $("jbStat").textContent = fmt(tot, 0) + " jembatan · " + fmt(tl, 0) + " m · " + K.length + " kab/kota" + (outside.length ? " · " + outside.length + " di luar wilayah" : "");
  }

  function apply(relist) {
    if (!ready) return;
    chips(); provCards(); stat();
    if (relist) list();
    $("jbBtn").classList.toggle("off", !st.on);
    $("jbOn").checked = st.on;
    $("jbOp").value = Math.round(st.op * 100);
    $("jbOpv").textContent = Math.round(st.op * 100) + "%";
    if (!map_ && !initMap()) return;
    if (st.on) {
      gPoly.addTo(map_);
      st.lab ? gLab.addTo(map_) : map_.removeLayer(gLab);
      gBr.addTo(map_);
    } else { [gPoly, gLab, gBr].forEach(function (g) { map_.removeLayer(g); }); }
    polys.forEach(function (p, i) { p.setStyle(polyStyle(i)); });
    marks.forEach(function (m, bi) {
      if (!m) return;
      var on = st.on && shown(bridges[bi]._k);
      m._on = on;
      on ? gBr.addLayer(m) : gBr.removeLayer(m);
    });
    labs.forEach(function (l, i) { var e = l._icon && l._icon.firstChild; if (e) e.style.display = shown(i) ? "" : "none"; });
    brLabels();
    if (sel > -1 && polys[sel]) polys[sel].bringToFront();
  }

  function init() {
    if (!loadK() || !window.L || !MAP()) return false;
    group();
    build();
    ready = true;
    list(); apply(true);
    window.PQ_JBKAB = { data: function () { return K.map(function (k, i) { return { kabupaten: label(k), jumlah: cnt(i), panjang_m: +len(i).toFixed(1), jembatan: byK[i].map(function (b) { return b.nama; }) }; }); } };
    return true;
  }

  function boot(n) {
    if (init()) return;
    if (n < 80) setTimeout(function () { boot(n + 1); }, 300);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(function () { boot(0); }, 400); });
  else setTimeout(function () { boot(0); }, 400);
})();
