/* ==========================================================================
   PETAQU – Layer Lokasi AMP / Batching Plant / Quarry
   Data diambil dari data-lokasi.js (window.LOKASI_DATA) -> edit file itu untuk update.
   Fitur: marker per jenis, tombol ON/OFF per Jenis, Provinsi,
          Kabupaten/Kota, pencarian, zoom ke hasil, ingat pilihan terakhir.
   API  : window.PQ_LOKASI.reload() | .fit() | .toggle() | .setJenis('amp',false)
   ========================================================================== */
(function () {
  "use strict";

  var STORE_KEY = "petaqu_lokasi_v1";
  var JENIS = {
    amp:    { label: "AMP",            full: "Asphalt Mixing Plant",   color: "#f97316", fg: "#fff",    icon: "fa-industry" },
    bp:     { label: "Batching Plant", full: "Batching Plant (Beton)", color: "#3b82f6", fg: "#fff",    icon: "fa-cubes" },
    quarry: { label: "Quarry",         full: "Stone Crusher / Quarry", color: "#eab308", fg: "#2b2100", icon: "fa-mountain" }
  };

  /* ---------- util ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function getMap() {
    try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) {}
    return window.map && window.map.addLayer ? window.map : null;
  }
  // "6°57'41.8"S 110°17'00.3"E"  ->  [lat, lng]
  function parseDMS(txt) {
    var re = /(\d+)\s*°\s*(\d+)\s*['′’]\s*([\d.]+)\s*["″”]?\s*([NSEW])/gi, m, o = {}, n = 0;
    txt = String(txt || "");
    while ((m = re.exec(txt))) {
      var d = +m[1], mi = +m[2], s = +m[3];
      if (mi >= 60 || s > 60) return null;
      var v = d + mi / 60 + s / 3600, h = m[4].toUpperCase();
      o[h] = h === "S" || h === "W" ? -v : v; n++;
    }
    if (n !== 2) return null;
    var lat = o.S != null ? o.S : o.N, lng = o.E != null ? o.E : o.W;
    return lat == null || lng == null ? null : [lat, lng];
  }
  function ll(r) {
    if (typeof r.lat === "number" && typeof r.lng === "number") return [r.lat, r.lng];
    return parseDMS(r.koordinat);
  }

  /* ---------- state ---------- */
  var S = { jenis: { amp: false, bp: false, quarry: false }, offProv: [], offKab: [], q: "", open: false, sec: { prov: true, kab: true } };
  try { var sv = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); if (sv) { for (var k in sv) if (k in S) S[k] = sv[k]; } } catch (e) {}
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {} }

  var items = [], bad = [], group = null, panel = null, btn = null;
  var cat = { prov: [], kab: [] };

  /* ---------- data ---------- */
  function build() {
    var M = getMap(); if (!M) return;
    if (group) { group.clearLayers(); } else { group = L.layerGroup().addTo(M); }
    items = []; bad = [];
    (window.LOKASI_DATA || []).forEach(function (r) {
      var p = ll(r);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) { bad.push(r); return; }
      var j = JENIS[r.jenis]; if (!j) { bad.push(r); return; }
      var it = { r: r, lat: p[0], lng: p[1], prov: r.provinsi || "-", kab: r.kabupaten || "-", marker: null, on: false };
      it.marker = L.marker(p, { icon: mkIcon(r.jenis), riseOnHover: true, keyboard: false });
      it.marker.bindPopup(function () { return popup(it); }, { maxWidth: 300, className: "pqlok-pop" });
      it.marker.bindTooltip(esc(r.owner), { direction: "top", offset: [0, -14], opacity: .95 });
      items.push(it);
    });
    // katalog filter (otomatis dari data)
    function tally(key, label) {
      var m = {}; items.forEach(function (i) { var k = key(i); (m[k] = m[k] || { key: k, label: label(i), n: 0, prov: i.prov }).n++; });
      return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return a.label.localeCompare(b.label, "id", { numeric: true }); });
    }
    cat.prov = tally(function (i) { return i.prov; }, function (i) { return i.prov; });
    cat.kab = tally(function (i) { return i.kab; }, function (i) { return i.kab; });
    apply();
  }

  function mkIcon(j) {
    var c = JENIS[j];
    return L.divIcon({
      className: "pqlok-ico",
      html: '<div class="pqlok-pin" style="background:' + c.color + ';color:' + c.fg + '"><i class="fa-solid ' + c.icon + '"></i></div>',
      iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14]
    });
  }

  function popup(it) {
    var r = it.r, c = JENIS[r.jenis];
    var g = "https://www.google.com/maps/search/?api=1&query=" + it.lat + "," + it.lng;
    var rt = "https://www.google.com/maps/dir/?api=1&destination=" + it.lat + "," + it.lng;
    return '<div class="pqlok-card">' +
      '<div class="pqlok-tag" style="background:' + c.color + ';color:' + c.fg + '"><i class="fa-solid ' + c.icon + '"></i> ' + esc(c.full) + '</div>' +
      '<div class="pqlok-own">' + esc(r.owner) + '</div>' +
      '<div class="pqlok-row"><b>Kabupaten/Kota</b><span>' + esc(it.kab) + ' &middot; ' + esc(it.prov) + '</span></div>' +
      '<div class="pqlok-row"><b>Alamat</b><span>' + esc(r.alamat) + '</span></div>' +
      '<div class="pqlok-row"><b>Koordinat</b><span>' + it.lat.toFixed(6) + ', ' + it.lng.toFixed(6) + '</span></div>' +
      (r.catatan ? '<div class="pqlok-row"><b>Catatan</b><span>' + esc(r.catatan) + '</span></div>' : "") +
      '<div class="pqlok-act"><a href="' + g + '" target="_blank" rel="noopener"><i class="fa-solid fa-map-location-dot"></i> Google Maps</a>' +
      '<a href="' + rt + '" target="_blank" rel="noopener"><i class="fa-solid fa-route"></i> Rute</a></div></div>';
  }

  /* ---------- filter ---------- */
  function pass(it) {
    if (!S.jenis[it.r.jenis]) return false;
    if (S.offProv.indexOf(it.prov) > -1) return false;
    if (S.offKab.indexOf(it.kab) > -1) return false;
    if (S.q) {
      var t = (it.r.owner + " " + it.r.alamat + " " + it.kab).toLowerCase();
      if (t.indexOf(S.q.toLowerCase()) < 0) return false;
    }
    return true;
  }
  function apply() {
    if (!group) return;
    var shown = 0;
    items.forEach(function (it) {
      var on = pass(it);
      if (on && !it.on) group.addLayer(it.marker);
      if (!on && it.on) group.removeLayer(it.marker);
      it.on = on; if (on) shown++;
    });
    save(); render(shown);
  }
  function fit() {
    var M = getMap(); if (!M) return;
    var pts = items.filter(function (i) { return i.on; }).map(function (i) { return [i.lat, i.lng]; });
    if (!pts.length) return toast("Tidak ada lokasi yang tampil");
    if (pts.length === 1) M.setView(pts[0], 15); else M.fitBounds(pts, { padding: [50, 50], maxZoom: 14 });
  }
  function toast(m) { try { if (typeof window.toast === "function") return window.toast(m); } catch (e) {} }

  function toggleIn(arr, v) { var i = arr.indexOf(v); if (i > -1) arr.splice(i, 1); else arr.push(v); }
  function setAll(listName, keys, on) {
    var arr = S[listName];
    keys.forEach(function (k) { var i = arr.indexOf(k); if (on && i > -1) arr.splice(i, 1); if (!on && i < 0) arr.push(k); });
  }

  /* ---------- UI ---------- */
  function css() {
    if (document.getElementById("pqlok-css")) return;
    var s = document.createElement("style"); s.id = "pqlok-css";
    s.textContent =
      ".pqlok-ico{background:none!important;border:0!important}" +
      ".pqlok-pin{width:28px;height:28px;border-radius:50% 50% 50% 8px;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px #0009;font-size:12px}" +
      ".pqlok-pin i{transform:rotate(45deg)}" +
      "#pqlokPanel{position:absolute;top:60px;right:60px;width:340px;max-height:calc(100% - 190px);z-index:900;display:none;flex-direction:column;background:#0f1521f2;border:1px solid var(--line,#1e2938);border-radius:12px;color:var(--text,#e6edf5);backdrop-filter:blur(8px);box-shadow:0 8px 28px #000a;font:500 12.5px system-ui,sans-serif}" +
      "#pqlokPanel.open{display:flex}" +
      "#pqlokPanel .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line,#1e2938);font-weight:700;font-size:13.5px}" +
      "#pqlokPanel .hd .sum{margin-left:auto;font-weight:600;font-size:11.5px;color:var(--text-dim,#7c8aa0)}" +
      "#pqlokPanel .x{background:none;border:0;color:inherit;cursor:pointer;font-size:15px;padding:2px 4px}" +
      "#pqlokPanel .bd{overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}" +
      "#pqlokPanel input[type=search]{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line,#1e2938);background:#080b12;color:inherit;font:inherit;outline:0}" +
      "#pqlokPanel input[type=search]:focus{border-color:#22d3ee}" +
      ".pqlok-sw{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;border:1px solid var(--line,#1e2938);background:#131a28;cursor:pointer;user-select:none}" +
      ".pqlok-sw .dot{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0}" +
      ".pqlok-sw .nm{flex:1;line-height:1.2}.pqlok-sw .nm small{display:block;color:var(--text-dim,#7c8aa0);font-weight:500;font-size:11px}" +
      ".pqlok-sw .tg{width:36px;height:20px;border-radius:10px;background:#334155;position:relative;transition:.15s;flex-shrink:0}" +
      ".pqlok-sw .tg:after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s}" +
      ".pqlok-sw.on .tg{background:#22d3ee}.pqlok-sw.on .tg:after{left:18px}" +
      ".pqlok-sw:not(.on){opacity:.55}" +
      ".pqlok-sec>.t{display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:.04em;font-size:11px;padding:2px 0}" +
      ".pqlok-sec>.t .a{margin-left:auto;display:flex;gap:6px}" +
      ".pqlok-sec>.t .a button{font:600 10.5px system-ui;background:#131a28;border:1px solid var(--line,#1e2938);color:var(--text,#e6edf5);border-radius:6px;padding:2px 7px;cursor:pointer;text-transform:none;letter-spacing:0}" +
      ".pqlok-sec>.t .a button:hover{border-color:#22d3ee}" +
      ".pqlok-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}" +
      ".pqlok-chips .gl{width:100%;font-size:10.5px;color:var(--text-dim,#7c8aa0);margin-top:2px}" +
      ".pqlok-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 4px 4px 9px;border-radius:14px;border:1px solid #22d3ee88;background:#0e749033;cursor:pointer;user-select:none}" +
      ".pqlok-chip.off{border-color:var(--line,#1e2938);background:#131a28;color:var(--text-dim,#7c8aa0);text-decoration:line-through}" +
      ".pqlok-chip b{font-weight:600;font-size:10.5px;background:#0006;border-radius:9px;padding:0 6px}" +
      ".pqlok-chip .z{border:0;background:#0006;color:inherit;border-radius:50%;width:18px;height:18px;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center}" +
      ".pqlok-chip .z:hover{background:#22d3ee;color:#04121a}" +
      "#pqlokPanel .ft{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line,#1e2938)}" +
      "#pqlokPanel .ft button{flex:1;padding:8px;border-radius:8px;border:1px solid #22d3ee66;background:#0e7490;color:#fff;font:700 12px system-ui;cursor:pointer}" +
      "#pqlokPanel .ft button.sec{background:#131a28;color:inherit;border-color:var(--line,#1e2938)}" +
      ".pqlok-warn{font-size:11px;color:#fbbf24;background:#fbbf2418;border:1px solid #fbbf2455;border-radius:8px;padding:6px 8px}" +
      ".pqlok-card{font:500 12px/1.4 system-ui,sans-serif;color:#e6edf5;min-width:230px}" +
      ".pqlok-tag{display:inline-block;padding:2px 8px;border-radius:10px;font-weight:700;font-size:10.5px;margin-bottom:5px}" +
      ".pqlok-own{font-weight:800;font-size:14px;margin-bottom:6px;color:#22d3ee}" +
      ".pqlok-row{display:flex;flex-direction:column;margin-bottom:5px}.pqlok-row b{font-size:10px;text-transform:uppercase;color:#94a3b8;letter-spacing:.03em}.pqlok-row span{color:#e6edf5;word-break:break-word}" +
      ".pqlok-act{display:flex;gap:6px;margin-top:8px}.pqlok-act a{flex:1;text-align:center;padding:6px;border-radius:7px;background:#0e7490;color:#fff!important;text-decoration:none;font-weight:700;font-size:11.5px}" +
      "@media(max-width:860px){#pqlokPanel{left:8px;right:8px;top:auto;bottom:70px;width:auto;max-height:68%}}";
    document.head.appendChild(s);
  }

  function chipHTML(listName, c, label) {
    var off = S[listName].indexOf(c.key) > -1;
    return '<span class="pqlok-chip' + (off ? " off" : "") + '" data-l="' + listName + '" data-k="' + esc(c.key) + '">' +
      esc(label) + ' <b>' + c.n + '</b>' +
      (listName === "kab" ? '<button class="z" data-z="' + esc(c.key) + '" title="Zoom ke ' + esc(label) + '"><i class="fa-solid fa-crosshairs"></i></button>' : "") +
      "</span>";
  }
  function secHTML(id, title, listName, arr, labeler) {
    var open = S.sec[id], keys = arr.map(function (c) { return c.key; }), html = "";
    if (open) {
      if (id === "kab") {
        cat.prov.forEach(function (p) {
          var g = arr.filter(function (c) { return c.prov === p.key; });
          if (!g.length) return;
          html += '<div class="gl">' + esc(p.label) + "</div>";
          g.forEach(function (c) { html += chipHTML(listName, c, labeler(c)); });
        });
      } else {
        arr.forEach(function (c) {
          var lab = labeler(c);
          html += chipHTML(listName, c, lab);
        });
      }
    }
    return '<div class="pqlok-sec" data-s="' + id + '"><div class="t" data-tg="' + id + '"><i class="fa-solid fa-chevron-' + (open ? "down" : "right") + '"></i> ' + title +
      '<span class="a"><button data-all="' + listName + '" data-on="1">Semua</button><button data-all="' + listName + '" data-on="0">Kosong</button></span></div>' +
      (open ? '<div class="pqlok-chips">' + html + "</div>" : "") + "</div>";
  }

  function render(shown) {
    if (!panel) return;
    if (shown == null) shown = items.filter(function (i) { return i.on; }).length;
    var bd = panel.querySelector(".bd"), sc = bd ? bd.scrollTop : 0;
    var counts = {}; items.forEach(function (i) { counts[i.r.jenis] = (counts[i.r.jenis] || 0) + 1; });
    var jh = Object.keys(JENIS).map(function (k) {
      var c = JENIS[k];
      return '<div class="pqlok-sw' + (S.jenis[k] ? " on" : "") + '" data-j="' + k + '"><span class="dot" style="background:' + c.color + ';color:' + c.fg + '"><i class="fa-solid ' + c.icon + '"></i></span>' +
        '<span class="nm">' + esc(c.label) + "<small>" + esc(c.full) + " &middot; " + (counts[k] || 0) + ' titik</small></span><span class="tg"></span></div>';
    }).join("");
    panel.innerHTML =
      '<div class="hd"><i class="fa-solid fa-location-dot" style="color:#22d3ee"></i> Lokasi AMP / BP / Quarry<span class="sum">' + shown + " / " + items.length + '</span><button class="x" data-close title="Tutup"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="bd"><input type="search" id="pqlokQ" placeholder="Cari owner / alamat / kabupaten…" value="' + esc(S.q) + '">' +
      '<div style="display:flex;flex-direction:column;gap:6px">' + jh + "</div>" +
      secHTML("prov", "Provinsi", "offProv", cat.prov, function (c) { return c.label; }) +
      secHTML("kab", "Kabupaten / Kota", "offKab", cat.kab, function (c) { return c.label.replace(/^Kab\.\s*/, "").replace(/^Kota\s/, "Kota "); }) +
      (bad.length ? '<div class="pqlok-warn"><i class="fa-solid fa-triangle-exclamation"></i> ' + bad.length + " data tidak ditampilkan karena koordinat tidak valid: " + esc(bad.map(function (b) { return b.owner; }).join(", ")) + ". Perbaiki di data-lokasi.js.</div>" : "") +
      '</div><div class="ft"><button class="sec" data-reset><i class="fa-solid fa-rotate-left"></i> Reset</button><button data-fit><i class="fa-solid fa-expand"></i> Zoom ke hasil</button></div>';
    var nb = panel.querySelector(".bd"); if (nb) nb.scrollTop = sc;
    var q = panel.querySelector("#pqlokQ");
    if (q && S._focusQ) { q.focus(); var v = q.value; q.value = ""; q.value = v; }
  }

  function onClick(e) {
    var t = e.target, el;
    if ((el = t.closest("[data-close]"))) return toggle(false);
    if ((el = t.closest("[data-z]"))) {
      e.stopPropagation();
      var kk = el.getAttribute("data-z"); S.offKab = S.offKab.filter(function (x) { return x !== kk; });
      apply();
      var M = getMap(), pts = items.filter(function (i) { return i.kab === kk && i.on; }).map(function (i) { return [i.lat, i.lng]; });
      if (M && pts.length) { if (pts.length === 1) M.setView(pts[0], 15); else M.fitBounds(pts, { padding: [60, 60], maxZoom: 14 }); }
      return;
    }
    if ((el = t.closest("[data-all]"))) {
      e.stopPropagation();
      var ln = el.getAttribute("data-all"), on = el.getAttribute("data-on") === "1";
      var map_ = { offProv: cat.prov, offKab: cat.kab }[ln];
      setAll(ln, map_.map(function (c) { return c.key; }), on); return apply();
    }
    if ((el = t.closest("[data-tg]"))) { var id = el.getAttribute("data-tg"); S.sec[id] = !S.sec[id]; save(); return render(); }
    if ((el = t.closest("[data-j]"))) { var j = el.getAttribute("data-j"); S.jenis[j] = !S.jenis[j]; return apply(); }
    if ((el = t.closest(".pqlok-chip"))) { toggleIn(S[el.getAttribute("data-l")], el.getAttribute("data-k")); return apply(); }
    if (t.closest("[data-fit]")) return fit();
    if (t.closest("[data-reset]")) { S.jenis = { amp: true, bp: true, quarry: true }; S.offProv = []; S.offKab = []; S.q = ""; return apply(); }
  }

  function toggle(force) {
    S.open = typeof force === "boolean" ? force : !S.open;
    if (panel) panel.classList.toggle("open", S.open);
    if (btn) btn.classList.toggle("active", S.open);
    save();
  }

  function mount() {
    css();
    var host = document.getElementById("map") ? document.getElementById("map").parentNode : document.body;
    panel = document.createElement("div"); panel.id = "pqlokPanel"; host.appendChild(panel);
    if (window.L && L.DomEvent) { L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel); }
    panel.addEventListener("click", onClick);
    panel.addEventListener("input", function (e) {
      if (e.target.id === "pqlokQ") { S.q = e.target.value.trim(); S._focusQ = 1; apply(); S._focusQ = 0; }
    });
    // tombol di toolbar peta
    var tb = document.getElementById("mapToolbar");
    btn = document.createElement("button"); btn.className = "tool-btn"; btn.id = "pqlokBtn";
    btn.title = "Lokasi AMP / Batching Plant / Quarry"; btn.innerHTML = '<i class="fa-solid fa-industry"></i>';
    btn.onclick = function (e) { e.stopPropagation(); toggle(); };
    if (tb) { var ref = document.getElementById("basemapBtn"); ref && ref.nextSibling ? tb.insertBefore(btn, ref.nextSibling) : tb.appendChild(btn); }
    else { btn.style.cssText = "position:absolute;top:60px;right:14px;z-index:900;width:38px;height:38px"; host.appendChild(btn); }
    toggle(!!S.open);
  }

  function init() {
    var tries = 0, t = setInterval(function () {
      var M = getMap();
      if ((M && window.L && document.getElementById("mapToolbar")) || ++tries > 200) {
        clearInterval(t);
        if (!M) return;
        mount(); build();
      }
    }, 300);
  }

  window.PQ_LOKASI = {
    reload: build, fit: fit, toggle: toggle,
    setJenis: function (j, on) { S.jenis[j] = !!on; apply(); },
    get data() { return items.map(function (i) { return i.r; }); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
