/* ==========================================================================
   PETAQU – Pencarian Terpadu (gaya Google Maps) KHUSUS Jawa Tengah & DI Yogyakarta
   • Menyatu dengan tombol Folder dalam satu "pil" pencarian
   • Gratis tanpa API key: Photon (autocomplete) + Nominatim/OSM (Enter)
   • Data sendiri ikut dicari: Ruas Jalan, Jembatan, AMP/BP/Quarry
   • Filter kategori, jarak dari pusat peta, sorot kata, suara (id-ID), lokasi saya
   • Pintasan: "/" atau Ctrl+K untuk fokus • ↑↓ Enter Esc
   API: window.PQ_CARI.open() | .focus(q)
   ========================================================================== */
(function () {
  "use strict";
  var BB = { w: 108.45, s: -8.40, e: 111.80, n: -5.65 };
  var STATE_OK = /jawa tengah|central java|yogyakarta/i;
  var HIST_KEY = "petaqu_cari_riwayat_v1";
  var cache = {}, ctrl = null, timer = null, lastNom = 0, seq = 0;
  var items = [], lastAll = [], lastQ = "", filter = "all", active = -1, pin = null, rec = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function getMap() { try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) {} return window.map && window.map.addLayer ? window.map : null; }
  function inBox(a, b) { return a >= BB.s && a <= BB.n && b >= BB.w && b <= BB.e; }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function hist() { try { return JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch (e) { return []; } }
  function pushHist(it) { try { var h = hist().filter(function (x) { return x.main !== it.main; }); h.unshift({ main: it.main, sub: it.sub, lat: it.lat, lng: it.lng, kind: it.kind, id: it.id, group: "Pencarian terakhir" }); localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 8))); } catch (e) {} }
  function dist(a, b, c, d) { var r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r, h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) * Math.sin(y / 2); return 12742 * Math.asin(Math.sqrt(h)); }
  function detail(kind, r) {
    var rows = [];
    function add(k, v) { if (v !== null && v !== undefined && v !== "" && v !== "-") rows.push('<div class="dr"><span>' + k + "</span><b>" + esc(v) + "</b></div>"); }
    if (kind === "jembatan") { add("No. Jembatan", r.nomor); add("Ruas", r.ruas); add("STA", r.sta); add("Kabupaten", r.kabupaten); add("Panjang", r.panjang != null ? r.panjang + " m" : ""); add("Lebar", r.lebar != null ? r.lebar + " m" : ""); add("Tipe", r.tipe); add("Tahun", r.tahun); add("Kondisi", r.kondisi); }
    else { add("Jenis", { amp: "Asphalt Mixing Plant", bp: "Batching Plant", quarry: "Quarry" }[r.jenis] || r.jenis); add("Pemilik", r.owner); add("Alamat", r.alamat); add("Kabupaten", r.kabupaten); add("Provinsi", r.provinsi); add("Catatan", r.catatan); }
    return rows.length ? '<div class="dt">' + rows.join("") + "</div>" : "";
  }
  window.PQ_DETAIL = detail;
  function fmtD(k) { return k < 1 ? Math.round(k * 1000) + " m" : k < 100 ? k.toFixed(1).replace(".", ",") + " km" : Math.round(k) + " km"; }
  function hl(text, q) {
    var w = norm(q).split(" ").filter(function (x) { return x.length > 1; });
    if (!w.length) return esc(text);
    var re = new RegExp("(" + w.map(function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")", "ig");
    return String(text).split(re).map(function (p, i) { return i % 2 ? "<mark>" + esc(p) + "</mark>" : esc(p); }).join("");
  }

  var css = "\
#pqCari{position:fixed;left:calc(var(--pq-fl,10px) - 3px);top:calc(var(--pq-ft,70px) - 3px);right:128px;max-width:540px;z-index:1240;font-family:var(--mono,Inter,system-ui,sans-serif);transition:left .25s ease}\
#pqCari .bar{position:relative;display:flex;align-items:center;gap:4px;height:50px;padding:0 6px 0 56px;border-radius:26px;background:linear-gradient(135deg,rgba(10,14,23,.94),rgba(17,25,40,.92));backdrop-filter:blur(14px) saturate(1.4);box-shadow:0 10px 30px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06)}\
#pqCari .bar:before{content:'';position:absolute;inset:-1.5px;border-radius:inherit;padding:1.5px;background:linear-gradient(120deg,#22d3ee,#3b82f6,#a855f7,#22d3ee);background-size:300% 100%;animation:pqflow 5s linear infinite;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:.45;transition:opacity .25s;pointer-events:none}\
#pqCari.focus .bar:before,#pqCari.open .bar:before{opacity:1}\
#pqCari.focus .bar{box-shadow:0 10px 34px rgba(0,0,0,.55),0 0 26px -4px rgba(34,211,238,.45)}\
@keyframes pqflow{to{background-position:300% 0}}\
#pqCari input{flex:1;min-width:0;background:none;border:0;outline:0;color:#e6edf5;font-size:14px;font-weight:500;font-family:inherit;padding:0 4px;height:100%}\
#pqCari input::placeholder{color:#7c8aa0}\
#pqCari input::-webkit-search-cancel-button{display:none}\
#pqCari .tag{flex:none;font-size:8.5px;font-weight:800;letter-spacing:1px;color:#22d3ee;border:1px solid rgba(34,211,238,.35);background:rgba(34,211,238,.08);border-radius:10px;padding:3px 7px;white-space:nowrap}\
#pqCari .kbd{flex:none;font-size:10px;color:#7c8aa0;border:1px solid #2a3547;border-radius:5px;padding:1px 6px}\
#pqCari.focus .kbd,#pqCari.has .kbd{display:none}\
#pqCari .ib{width:36px;height:36px;flex:none;border:0;border-radius:50%;background:none;color:#8a99ae;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:.15s}\
#pqCari .ib:hover{color:#22d3ee;background:rgba(34,211,238,.1)}\
#pqCari .mic.rec{color:#fff;background:#ef4444;animation:pqpulse 1s infinite}\
#pqCari .go{background:linear-gradient(135deg,#0e7490,#3b82f6);color:#fff}\
#pqCari .go:hover{color:#fff;filter:brightness(1.2)}\
#pqCari .clr{display:none}#pqCari.has .clr{display:flex}\
#pqCari .dd{display:none;margin-top:8px;background:rgba(10,14,23,.97);backdrop-filter:blur(14px);border:1px solid #1e2938;border-radius:18px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.6)}\
#pqCari.open .dd{display:block;animation:pqin .18s ease}\
@keyframes pqin{from{opacity:0;transform:translateY(-6px)}}\
#pqCari .ls{max-height:min(56vh,400px);overflow-y:auto}\
#pqCari .chips{display:flex;gap:6px;padding:10px 12px 8px;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid #1a2333}\
#pqCari .chip{flex:none;border:1px solid #243044;background:#0d1320;color:#9fb0c6;font:700 11px inherit;font-family:inherit;border-radius:14px;padding:5px 11px;cursor:pointer;transition:.15s}\
#pqCari .chip:hover{border-color:#22d3ee;color:#22d3ee}\
#pqCari .chip.on{background:linear-gradient(135deg,#0e7490,#3b82f6);border-color:transparent;color:#fff}\
#pqCari .chip em{font-style:normal;opacity:.7;margin-left:4px;font-size:10px}\
#pqCari .hd{padding:10px 14px 4px;font-size:9.5px;letter-spacing:1.3px;text-transform:uppercase;color:#6b7a90;font-weight:800}\
#pqCari .it{display:flex;gap:12px;align-items:center;padding:9px 14px;cursor:pointer;border-left:3px solid transparent}\
#pqCari .it:hover,#pqCari .it.on{background:rgba(34,211,238,.08);border-left-color:#22d3ee}\
#pqCari .ic{width:32px;height:32px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;color:#22d3ee;background:rgba(34,211,238,.1)}\
#pqCari .ic.jembatan{color:#fbbf24;background:rgba(251,191,36,.1)}#pqCari .ic.lokasi{color:#fb923c;background:rgba(251,146,60,.1)}#pqCari .ic.coord{color:#a78bfa;background:rgba(167,139,250,.1)}#pqCari .ic.place{color:#f87171;background:rgba(248,113,113,.1)}#pqCari .ic.hist{color:#94a3b8;background:rgba(148,163,184,.1)}\
#pqCari .tx{min-width:0;flex:1}\
#pqCari .tx b{display:block;font-size:13px;color:#e6edf5;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
#pqCari .tx small{display:block;font-size:11px;color:#7c8aa0;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
#pqCari mark{background:none;color:#22d3ee;font-weight:800}\
#pqCari .ds{flex:none;font-size:10.5px;color:#7c8aa0;font-weight:700}\
#pqCari .st{padding:14px;font-size:12px;color:#8a99ae;display:flex;gap:10px;align-items:center}\
#pqCari .sk{padding:6px 14px 12px}#pqCari .sk i{display:block;height:34px;border-radius:10px;margin-top:8px;background:linear-gradient(90deg,#111a2a 25%,#1a2740 50%,#111a2a 75%);background-size:200% 100%;animation:pqsh 1.1s infinite}\
@keyframes pqsh{to{background-position:-200% 0}}\
#pqCari .qa{display:flex;gap:8px;padding:10px 12px;flex-wrap:wrap}\
#pqCari .ft{display:flex;justify-content:space-between;gap:8px;padding:8px 14px;border-top:1px solid #1a2333;font-size:10px;color:#5f6e84}\
#pqCari a.gm{color:#22d3ee;text-decoration:none;font-weight:700}\
.pq-cari-pin{position:relative;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:linear-gradient(135deg,#ff5a4d,#ea4335);border:2px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}\
.pq-cari-pin:after{content:'';width:9px;height:9px;border-radius:50%;background:#fff}\
.pq-cari-pin:before{content:'';position:absolute;inset:-10px;border-radius:50%;border:2px solid #ea4335;opacity:0;animation:pqring 2s ease-out infinite}\
@keyframes pqring{0%{transform:scale(.4);opacity:.9}100%{transform:scale(1.6);opacity:0}}\
@keyframes pqpulse{50%{box-shadow:0 0 0 7px rgba(239,68,68,.25)}}\
.pq-cari-pop{font-family:var(--mono,Inter,sans-serif);min-width:210px;max-width:310px}\
.pq-cari-pop b{display:block;font-size:13px;margin-bottom:3px}.pq-cari-pop small{display:block;color:#7c8aa0;font-size:11px;line-height:1.45;margin-bottom:9px}\
.pq-cari-pop .r{display:flex;gap:6px;flex-wrap:wrap}\
.pq-cari-pop button,.pq-cari-pop a{flex:1;min-width:76px;text-align:center;text-decoration:none;font-size:11px;font-weight:700;font-family:inherit;padding:7px 6px;border-radius:8px;border:1px solid #243044;background:#0d1320;color:#e6edf5;cursor:pointer}\
.pq-cari-pop button:hover,.pq-cari-pop a:hover{border-color:#22d3ee;color:#22d3ee}\
.pq-cari-pop .dt{max-height:220px;overflow-y:auto;margin:2px 0 8px;border-top:1px solid #243044}.pq-cari-pop .dr{display:flex;gap:10px;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1a2333;font-size:11px}.pq-cari-pop .dr span{color:#7c8aa0;flex:none}.pq-cari-pop .dr b{display:block;margin:0;font-size:11px;text-align:right;font-weight:600}\
body.full-map-mode #pqCari{opacity:0;pointer-events:none}\
#pqCari{transition:left .25s ease,opacity .22s ease,visibility .22s}\
#pqCari.away:not(.focus):not(.open){opacity:0;visibility:hidden;pointer-events:none}\
#pqCari.nofolder .bar{padding-left:18px}\
body:has(.modal-overlay.show,#svOverlay.show,#arOverlay.show,#cmOverlay.show,#loginScreen:not(.hide)) #pqCari{display:none}\
@media(max-width:860px){#pqCari{right:112px}#pqCari .bar{height:48px}#pqCari input{font-size:16px}#pqCari .tag,#pqCari .kbd,#pqCari .ft span+span{display:none}}";

  var FILTERS = [["all", "Semua"], ["jalan", "Ruas"], ["jembatan", "Jembatan"], ["lokasi", "AMP/BP/Quarry"], ["place", "Tempat"]];
  function cat(it) { return it.kind === "jalan" ? "jalan" : it.kind === "jembatan" ? "jembatan" : (it.kind === "amp" || it.kind === "bp" || it.kind === "quarry") ? "lokasi" : "place"; }
  var ICON = { jalan: "fa-road", jembatan: "fa-road-bridge", lokasi: "fa-industry", coord: "fa-location-crosshairs", place: "fa-location-dot" };

  var root, inp, dd;
  function build() {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    root = document.createElement("div"); root.id = "pqCari";
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    root.innerHTML =
      '<div class="bar"><input type="search" placeholder="Cari jalan, desa, kantor, jembatan, koordinat…" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" aria-label="Cari">' +
      '<span class="kbd">/</span><span class="tag">JATENG · DIY</span>' +
      '<button class="ib clr" type="button" title="Hapus"><i class="fa-solid fa-xmark"></i></button>' +
      (SR ? '<button class="ib mic" type="button" title="Cari dengan suara"><i class="fa-solid fa-microphone"></i></button>' : "") +
      '<button class="ib go" type="button" title="Cari"><i class="fa-solid fa-arrow-right"></i></button></div><div class="dd"></div>';
    document.body.appendChild(root);
    inp = root.querySelector("input"); dd = root.querySelector(".dd");
    if (window.L && L.DomEvent) { L.DomEvent.disableClickPropagation(root); L.DomEvent.disableScrollPropagation(root); }

    inp.addEventListener("input", function () {
      root.classList.toggle("has", !!inp.value); clearTimeout(timer);
      var q = inp.value.trim(); if (q.length < 2) { showHome(); return; }
      timer = setTimeout(function () { run(q, false); }, 380);
    });
    inp.addEventListener("focus", function () { root.classList.add("focus"); if (inp.value.trim().length < 2) showHome(); else root.classList.add("open"); });
    inp.addEventListener("blur", function () { root.classList.remove("focus"); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); mv(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); mv(-1); }
      else if (e.key === "Escape") { close(); inp.blur(); }
      else if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer); if (active >= 0 && items[active]) pick(items[active]); else run(inp.value.trim(), true); }
    });
    root.querySelector(".clr").onclick = function () { inp.value = ""; root.classList.remove("has"); clearPin(); showHome(); inp.focus(); };
    root.querySelector(".go").onclick = function () { clearTimeout(timer); run(inp.value.trim(), true); };
    var mic = root.querySelector(".mic"); if (mic) mic.onclick = function () { voice(SR, mic); };
    document.addEventListener("click", function (e) { if (!root.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) {
      var t = e.target && e.target.tagName;
      if ((e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t) && !(e.target && e.target.isContentEditable)) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); inp.focus(); inp.select(); }
    });
    dd.addEventListener("click", function (e) {
      var c = e.target.closest(".chip"); if (c) { filter = c.getAttribute("data-f"); draw(); return; }
      var q = e.target.closest("[data-qa]"); if (q) { quick(q.getAttribute("data-qa")); return; }
      var el = e.target.closest(".it"); if (el) pick(items[+el.getAttribute("data-i")]);
    });
  }
  function close() { root.classList.remove("open"); active = -1; }
  function mv(d) { var els = dd.querySelectorAll(".it"); if (!els.length) return; active = (active + d + els.length) % els.length; els.forEach(function (el, i) { el.classList.toggle("on", i === active); }); els[active].scrollIntoView({ block: "nearest" }); }
  function open() { root.classList.add("open"); }
  function status(html) { dd.innerHTML = '<div class="st">' + html + "</div>"; open(); }
  function skeleton() { dd.innerHTML = '<div class="sk"><i></i><i></i><i></i></div>'; open(); }
  function footer(q) { return '<div class="ft"><span>↑↓ pilih · Enter buka · Esc tutup</span><span>' + (q ? '<a class="gm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q + " Jawa Tengah") + '">Coba di Google Maps ↗</a>' : "OSM + data PETAQU") + "</span></div>"; }

  function showHome() {
    var h = hist(); items = h; active = -1; lastAll = [];
    var html = '<div class="qa"><button class="chip" data-qa="loc"><i class="fa-solid fa-crosshairs"></i> Lokasi saya</button><button class="chip" data-qa="jateng"><i class="fa-solid fa-map"></i> Seluruh Jateng</button><button class="chip" data-qa="diy"><i class="fa-solid fa-landmark"></i> Yogyakarta</button></div><div class="ls">';
    if (h.length) html += rows(h, "");
    else html += '<div class="st"><i class="fa-solid fa-circle-info"></i> Ketik nama jalan, desa, jembatan, atau tempel koordinat.</div>';
    dd.innerHTML = html + "</div>" + footer(""); open();
  }
  function rows(list, q) {
    var c = getMap() && getMap().getCenter(), html = "", last = "";
    list.forEach(function (it, i) {
      var g = it.group || "";
      if (g && g !== last) { html += '<div class="hd">' + esc(g) + "</div>"; last = g; }
      var k = g === "Pencarian terakhir" ? "hist" : (it.kind === "coord" ? "coord" : cat(it));
      var d = c && typeof it.lat === "number" ? '<span class="ds">' + fmtD(dist(c.lat, c.lng, it.lat, it.lng)) + "</span>" : "";
      html += '<div class="it" role="option" data-i="' + i + '"><div class="ic ' + k + '"><i class="fa-solid ' + (k === "hist" ? "fa-clock-rotate-left" : ICON[k] || ICON.place) + '"></i></div><div class="tx"><b>' + hl(it.main, q) + "</b>" + (it.sub ? "<small>" + esc(it.sub) + "</small>" : "") + "</div>" + d + "</div>";
    });
    return html;
  }
  function draw() {
    var cnt = {}; lastAll.forEach(function (it) { var k = cat(it); cnt[k] = (cnt[k] || 0) + 1; });
    var list = filter === "all" ? lastAll : lastAll.filter(function (it) { return cat(it) === filter; });
    var chips = '<div class="chips">' + FILTERS.filter(function (f) { return f[0] === "all" || cnt[f[0]]; }).map(function (f) {
      return '<button class="chip' + (filter === f[0] ? " on" : "") + '" data-f="' + f[0] + '">' + f[1] + "<em>" + (f[0] === "all" ? lastAll.length : cnt[f[0]]) + "</em></button>";
    }).join("") + "</div>";
    items = list; active = -1;
    dd.innerHTML = chips + '<div class="ls">' + (list.length ? rows(list, lastQ) : '<div class="st">Tidak ada hasil pada kategori ini.</div>') + "</div>" + footer(lastQ);
    open();
  }

  function localSearch(q) {
    var n = norm(q), out = [];
    if (n.length < 2) return out;
    var words = n.split(" ");
    function hit(t) { t = norm(t); return words.every(function (w) { return t.indexOf(w) !== -1; }); }
    try { var c = 0; (typeof roads !== "undefined" ? roads : []).some(function (r) { if (hit(r.name) && r.points && r.points.length) { var p = r.points[0]; out.push({ group: "Ruas Jalan PETAQU", kind: "jalan", id: r.id, main: r.name, sub: r.points.length + " titik STA" + (r.lengthKmCalculated ? " • " + (+r.lengthKmCalculated).toFixed(2) + " km" : ""), lat: p.lat, lng: p.lng }); c++; } return c >= 5; }); } catch (e) {}
    try { var b = 0; (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []).some(function (j) { if (typeof j.lat === "number" && hit([j.nama, j.nomor, j.ruas, j.kabupaten].join(" "))) { out.push({ group: "Jembatan", kind: "jembatan", main: j.nama || "Jembatan", sub: [j.ruas, j.kabupaten].filter(Boolean).join(" • "), lat: j.lat, lng: j.lng, rec: j }); b++; } return b >= 5; }); } catch (e) {}
    try { var l = 0; (window.LOKASI_DATA || []).some(function (x) { if (hit([x.owner, x.alamat, x.kabupaten, x.jenis].join(" "))) { var lb = { amp: "AMP", bp: "Batching Plant", quarry: "Quarry" }[x.jenis] || x.jenis; out.push({ group: "AMP / Batching Plant / Quarry", kind: x.jenis, main: x.owner || lb, sub: lb + " • " + (x.kabupaten || ""), lat: +x.lat, lng: +x.lng, addr: x.alamat, rec: x }); l++; } return l >= 5; }); } catch (e) {}
    return out;
  }
  function parseCoord(q) {
    var m = String(q).match(/(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{2,3}\.\d+)/) || String(q).match(/@(-?\d{1,2}\.\d+),(-?\d{2,3}\.\d+)/);
    if (!m) return null; var a = +m[1], b = +m[2];
    if (inBox(a, b)) return { lat: a, lng: b }; if (inBox(b, a)) return { lat: b, lng: a }; return null;
  }
  function fetchJson(url, signal, ms) {
    var t = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, ms || 8000);
    return fetch(url, { signal: signal }).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function photon(q, signal) {
    var c = getMap() && getMap().getCenter();
    var url = "https://photon.komoot.io/api/?q=" + encodeURIComponent(q) + "&limit=8&lat=" + (c && inBox(c.lat, c.lng) ? c.lat : -7.35) + "&lon=" + (c && inBox(c.lat, c.lng) ? c.lng : 110.1) + "&bbox=" + [BB.w, BB.s, BB.e, BB.n].join(",");
    return fetchJson(url, signal).then(function (d) {
      return (d.features || []).map(function (f) {
        var p = f.properties || {}, g = f.geometry && f.geometry.coordinates; if (!g) return null;
        if (p.state && !STATE_OK.test(p.state)) return null;
        var main = p.name || p.street || p.district || "Lokasi";
        var sub = [p.name && p.street, p.district || p.locality, p.city || p.county, p.state].filter(function (x) { return x && x !== main; }).join(", ");
        return { group: "Tempat (OpenStreetMap)", kind: "place", main: main, sub: sub, lat: g[1], lng: g[0] };
      }).filter(Boolean);
    });
  }
  function nominatim(q, signal) {
    var wait = Math.max(0, 1100 - (Date.now() - lastNom));
    return new Promise(function (r) { setTimeout(r, wait); }).then(function () {
      lastNom = Date.now();
      return fetchJson("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=id&countrycodes=id&bounded=1&viewbox=" + [BB.w, BB.n, BB.e, BB.s].join(",") + "&q=" + encodeURIComponent(q), signal, 9000);
    }).then(function (d) {
      return (d || []).map(function (t) {
        var a = t.address || {}, lat = +t.lat, lng = +t.lon;
        if ((a.state && !STATE_OK.test(a.state)) || !inBox(lat, lng)) return null;
        var parts = String(t.display_name || "").split(",").map(function (s) { return s.trim(); });
        var main = t.name || a.road || parts[0];
        var o = { group: "Tempat (OpenStreetMap)", kind: "place", main: main, sub: parts.filter(function (x) { return x !== main && !/^\d{5}$/.test(x) && x !== "Indonesia"; }).slice(0, 4).join(", "), lat: lat, lng: lng };
        if (t.boundingbox && /administrative|boundary/.test(t.category + t.type)) o.bb = t.boundingbox.map(Number);
        return o;
      }).filter(Boolean);
    });
  }
  function dedupe(list) { var s = {}; return list.filter(function (it) { var k = norm(it.main) + "|" + it.lat.toFixed(3) + "|" + it.lng.toFixed(3); if (s[k]) return false; s[k] = 1; return true; }); }

  function run(q, full) {
    if (!q || q.length < (full ? 2 : 3)) { if (!q) showHome(); return; }
    var my = ++seq; try { ctrl && ctrl.abort(); } catch (e) {}
    ctrl = new AbortController(); var sig = ctrl.signal;
    var cc = parseCoord(q), base = [];
    if (cc) base.push({ group: "Koordinat", kind: "coord", main: cc.lat.toFixed(6) + ", " + cc.lng.toFixed(6), sub: "Pergi ke koordinat ini", lat: cc.lat, lng: cc.lng });
    base = base.concat(localSearch(q)); lastQ = q; filter = "all";
    if (cc) { lastAll = base; draw(); if (full) pick(base[0]); return; }
    var key = (full ? "N:" : "P:") + norm(q);
    if (cache[key]) { lastAll = dedupe(base.concat(cache[key])); draw(); return; }
    if (base.length) { lastAll = base; draw(); } else skeleton();
    var chain = full ? nominatim(q, sig).then(function (r) { return r.length ? r : photon(q, sig); }, function () { return photon(q, sig); }) : photon(q, sig).catch(function () { return nominatim(q, sig); });
    chain.then(function (r) {
      if (my !== seq) return; cache[key] = r; lastAll = dedupe(base.concat(r));
      if (!lastAll.length) { status('<i class="fa-solid fa-magnifying-glass-location"></i> Tidak ada hasil di Jawa Tengah &amp; DIY untuk “' + esc(q) + '”.' + (full ? "" : " Tekan Enter untuk pencarian lebih luas.")); dd.insertAdjacentHTML("beforeend", footer(q)); return; }
      draw(); if (full && lastAll.length === 1) pick(lastAll[0]);
    }).catch(function (e) {
      if (my !== seq || (e && e.name === "AbortError" && !full) || base.length) return;
      status('<i class="fa-solid fa-triangle-exclamation"></i> Gagal terhubung ke layanan peta. Cek internet lalu coba lagi.');
    });
  }

  function voice(SR, btn) {
    if (rec) { try { rec.stop(); } catch (e) {} return; }
    rec = new SR(); rec.lang = "id-ID"; rec.interimResults = false; rec.maxAlternatives = 1;
    btn.classList.add("rec"); inp.placeholder = "Silakan bicara…";
    rec.onresult = function (e) { var t = e.results[0][0].transcript; inp.value = t; root.classList.add("has"); run(t, true); };
    rec.onend = rec.onerror = function () { btn.classList.remove("rec"); inp.placeholder = "Cari jalan, desa, kantor, jembatan, koordinat…"; rec = null; };
    try { rec.start(); } catch (e) { rec = null; btn.classList.remove("rec"); }
  }
  function quick(a) {
    var m = getMap(); if (!m) return; close();
    if (a === "jateng") { if (window.PQ_WILAYAH) PQ_WILAYAH.show("jateng"); else m.flyTo([-7.15, 110.15], 8, { duration: 1 }); }
    else if (a === "diy") { if (window.PQ_WILAYAH) PQ_WILAYAH.show("diy"); else m.flyTo([-7.88, 110.4], 10, { duration: 1 }); }
    else if (a === "loc") {
      if (!navigator.geolocation) return status("Perangkat tidak mendukung GPS.");
      navigator.geolocation.getCurrentPosition(function (p) {
        var la = p.coords.latitude, ln = p.coords.longitude;
        if (!inBox(la, ln)) { status('<i class="fa-solid fa-location-pin-lock"></i> Lokasi Anda di luar Jawa Tengah &amp; DIY.'); return; }
        if (window.PQ_WILAYAH) PQ_WILAYAH.nearest(la, ln); else pick({ kind: "coord", main: "Lokasi saya", sub: "Posisi GPS perangkat", lat: la, lng: ln }, true);
      }, function () { status('<i class="fa-solid fa-triangle-exclamation"></i> Izin lokasi ditolak.'); open(); }, { enableHighAccuracy: true, timeout: 10000 });
    }
  }

  function clearPin() { var m = getMap(); if (pin && m) m.removeLayer(pin); pin = null; }
  function pick(it, noHist) {
    if (!it) return; var m = getMap(); if (!m) return;
    close(); inp.blur(); inp.value = it.main; root.classList.add("has");
    if (!noHist) pushHist(it);
    if (it.kind === "jalan" && it.id && typeof focusRoad === "function") { clearPin(); focusRoad(it.id); return; }
    if (it.bb && it.bb.length === 4) m.flyToBounds([[it.bb[0], it.bb[2]], [it.bb[1], it.bb[3]]], { padding: [40, 40], maxZoom: 15, duration: 0.8 });
    else m.flyTo([it.lat, it.lng], Math.max(m.getZoom(), 17), { duration: 0.8 });
    clearPin();
    pin = L.marker([it.lat, it.lng], { icon: L.divIcon({ className: "", html: '<div class="pq-cari-pin"></div>', iconSize: [30, 30], iconAnchor: [4, 30] }), zIndexOffset: 9000 }).addTo(m);
    var ll = it.lat.toFixed(6) + ", " + it.lng.toFixed(6);
    var det = it.rec ? detail(it.kind, it.rec) : ""; var pop = document.createElement("div"); pop.className = "pq-cari-pop";
    pop.innerHTML = "<b>" + esc(it.main) + "</b>" + (det ? det + "<small>" + ll + "</small>" : "<small>" + esc(it.addr || it.sub || "") + (it.addr || it.sub ? "<br>" : "") + ll + "</small>") + '<div class="r"><button data-a="sv">Street View</button><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + it.lat + "," + it.lng + '">Rute</a><button data-a="cp">Salin</button><button data-a="rm">Hapus</button></div>';
    pop.addEventListener("click", function (e) {
      var a = e.target.getAttribute && e.target.getAttribute("data-a");
      if (a === "sv" && window.openStreetViewForGeoResult) window.openStreetViewForGeoResult(it.lat, it.lng, it.main);
      else if (a === "cp") { try { navigator.clipboard.writeText(ll); e.target.textContent = "Tersalin ✓"; } catch (x) {} }
      else if (a === "rm") { clearPin(); inp.value = ""; root.classList.remove("has"); }
    });
    pin.bindPopup(pop, { closeButton: true, autoPanPadding: [20, 90] });
    setTimeout(function () { pin && pin.openPopup(); }, 850);
  }


  /* ---------- Adaptif: sembunyi otomatis bila ada panel lain menimpa pil ---------- */
  var adaptT = null, whyEl = null;
  function cls(el) { var c = el.className; return String(c && c.baseVal !== undefined ? c.baseVal : c || ""); }
  function adapt() {
    if (!root) return;
    var bar = root.querySelector(".bar"), r = bar.getBoundingClientRect();
    var fo = document.getElementById("pqFolder"), nf = true;
    if (fo) { var fs = getComputedStyle(fo), fr = fo.getBoundingClientRect(); nf = fs.display === "none" || fs.visibility === "hidden" || +fs.opacity < 0.05 || fr.width < 10; }
    if (root.classList.contains("nofolder") !== nf) root.classList.toggle("nofolder", nf);
    var mapEl = document.getElementById("map"), appEl = document.getElementById("app"), seen = [], hide = false; whyEl = null;
    [document.body, mapEl, appEl].forEach(function (par) {
      if (!par || hide) return;
      Array.prototype.some.call(par.children, function (el) {
        if (seen.indexOf(el) !== -1) return false; seen.push(el);
        if (el === root || el.id === "pqFolder" || /^(SCRIPT|STYLE|LINK|META)$/.test(el.tagName)) return false;
        if (mapEl && (el === mapEl || el.contains(mapEl))) return false;
        if (/leaflet/.test(cls(el))) return false;
        var cs = getComputedStyle(el);
        if ((cs.position !== "fixed" && cs.position !== "absolute") || cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05 || cs.pointerEvents === "none") return false;
        var er = el.getBoundingClientRect();
        if (er.width < 120 || er.height < 80) return false;
        if (er.left < r.right - 4 && er.right > r.left + 4 && er.top < r.bottom - 4 && er.bottom > r.top + 4) { hide = true; whyEl = el; return true; }
        return false;
      });
    });
    if (root.classList.contains("away") !== hide) root.classList.toggle("away", hide);
  }
  function sched() { clearTimeout(adaptT); adaptT = setTimeout(adapt, 90); }
  function startAdapt() {
    var mo = new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var t = ms[i].target;
        if (t === root || (root && root.contains(t))) continue;
        if (t.nodeType === 1 && /leaflet/.test(cls(t))) continue;
        sched(); return;
      }
    });
    [document.body, document.getElementById("map"), document.getElementById("app")].forEach(function (el) {
      if (el) mo.observe(el, { attributes: true, attributeFilter: ["class", "style", "hidden"], childList: true });
    });
    window.addEventListener("resize", sched);
    document.addEventListener("transitionend", sched, true);
    setInterval(adapt, 800);
    adapt();
  }
  var tries = 0, iv = setInterval(function () {
    if (getMap() && window.L && document.body) { clearInterval(iv); if (!document.getElementById("pqCari")) { build(); startAdapt(); } }
    else if (++tries > 120) clearInterval(iv);
  }, 250);
  window.PQ_CARI = { why: function () { return whyEl; }, open: function () { inp && inp.focus(); }, focus: function (q) { if (!inp) return; inp.value = q || ""; root.classList.toggle("has", !!q); run(q, true); } };
})();
