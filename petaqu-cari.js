/* ==========================================================================
   PETAQU – Kotak Pencarian Peta (gaya Google Maps), KHUSUS Jawa Tengah & DI Yogyakarta
   - 100% gratis, tanpa API key: Photon (autocomplete) + Nominatim/OSM (Enter) .
   - Hasil digabung dengan data sendiri: Ruas Jalan, Jembatan, AMP/BP/Quarry.
   - Bisa juga tempel koordinat ("-7.67, 109.08") atau link Google Maps.
   - Hemat kuota: debounce, minimal 3 huruf, cache, batalkan request lama,
     Nominatim dibatasi 1 request / detik sesuai aturan OSM.
   API: window.PQ_CARI.open() | .focus(q)
   ========================================================================== */
(function () {
  "use strict";

  /* Batas wilayah: Jawa Tengah + DI Yogyakarta (minLon,minLat,maxLon,maxLat) */
  var BB = { w: 108.45, s: -8.40, e: 111.80, n: -5.65 };
  var STATE_OK = /jawa tengah|central java|yogyakarta/i;
  var HIST_KEY = "petaqu_cari_riwayat_v1";
  var cache = {}, ctrl = null, timer = null, lastNom = 0, seq = 0;
  var items = [], active = -1, pin = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function getMap() {
    try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) {}
    return window.map && window.map.addLayer ? window.map : null;
  }
  function inBox(lat, lng) { return lat >= BB.s && lat <= BB.n && lng >= BB.w && lng <= BB.e; }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function hist() { try { return JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch (e) { return []; } }
  function pushHist(it) {
    try {
      var h = hist().filter(function (x) { return x.main !== it.main; });
      h.unshift({ main: it.main, sub: it.sub, lat: it.lat, lng: it.lng, kind: it.kind, id: it.id, hist: 1 });
      localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 8)));
    } catch (e) {}
  }

  /* ---------- CSS ---------- */
  var css = "\
#pqCari{position:absolute;top:13px;left:66px;right:128px;max-width:430px;z-index:860;font-family:var(--mono,Inter,system-ui,sans-serif)}\
#pqCari .bar{display:flex;align-items:center;gap:6px;background:rgba(15,21,33,.96);border:1px solid var(--line,#1e2938);border-radius:24px;padding:0 6px 0 14px;height:46px;box-shadow:0 8px 26px rgba(0,0,0,.45);backdrop-filter:blur(8px)}\
#pqCari .bar:focus-within{border-color:var(--cyan,#22d3ee);box-shadow:0 8px 26px rgba(0,0,0,.5),0 0 0 3px rgba(34,211,238,.15)}\
#pqCari input{flex:1;min-width:0;background:none;border:0;outline:0;color:var(--text,#e6edf5);font-size:14px;font-weight:500;font-family:inherit;padding:0}\
#pqCari input::placeholder{color:var(--text-dim,#7c8aa0)}\
#pqCari .ib{width:34px;height:34px;flex:none;border:0;border-radius:50%;background:none;color:var(--text-dim,#7c8aa0);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}\
#pqCari .ib:hover{color:var(--cyan,#22d3ee);background:rgba(34,211,238,.1)}\
#pqCari .go{background:linear-gradient(135deg,var(--cyan-dim,#0e7490),var(--blue,#3b82f6));color:#fff}\
#pqCari .go:hover{color:#fff;filter:brightness(1.15)}\
#pqCari .clr{display:none}#pqCari.has .clr{display:flex}\
#pqCari .dd{display:none;margin-top:8px;background:rgba(15,21,33,.98);border:1px solid var(--line,#1e2938);border-radius:16px;overflow:hidden auto;max-height:min(62vh,440px);box-shadow:0 16px 40px rgba(0,0,0,.55)}\
#pqCari.open .dd{display:block}\
#pqCari .hd{padding:9px 14px 4px;font-size:9.5px;letter-spacing:1.2px;text-transform:uppercase;color:var(--text-dim,#7c8aa0);font-weight:700}\
#pqCari .it{display:flex;gap:11px;align-items:flex-start;padding:9px 14px;cursor:pointer;border-top:1px solid rgba(255,255,255,.03)}\
#pqCari .it:hover,#pqCari .it.on{background:rgba(34,211,238,.09)}\
#pqCari .it i{width:20px;text-align:center;margin-top:2px;color:var(--cyan,#22d3ee);font-size:13px;flex:none}\
#pqCari .it b{display:block;font-size:13px;color:var(--text,#e6edf5);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
#pqCari .it small{display:block;font-size:11px;color:var(--text-dim,#7c8aa0);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
#pqCari .it div{min-width:0;flex:1}\
#pqCari .st{padding:12px 14px;font-size:12px;color:var(--text-dim,#7c8aa0);display:flex;gap:8px;align-items:center}\
#pqCari a.gm{display:flex;gap:8px;align-items:center;padding:11px 14px;font-size:11.5px;color:var(--cyan,#22d3ee);text-decoration:none;border-top:1px dashed var(--line,#1e2938)}\
.pq-cari-pin{width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#ea4335;border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}\
.pq-cari-pin:after{content:'';width:9px;height:9px;border-radius:50%;background:#fff}\
.pq-cari-pop{font-family:var(--mono,Inter,sans-serif);min-width:200px;max-width:260px}\
.pq-cari-pop b{display:block;font-size:13px;margin-bottom:3px}.pq-cari-pop small{display:block;color:var(--text-dim,#7c8aa0);font-size:11px;line-height:1.4;margin-bottom:8px}\
.pq-cari-pop .r{display:flex;gap:6px;flex-wrap:wrap}\
.pq-cari-pop button,.pq-cari-pop a{flex:1;min-width:78px;text-align:center;text-decoration:none;font-size:11px;font-weight:700;font-family:inherit;padding:7px 6px;border-radius:7px;border:1px solid var(--line,#1e2938);background:var(--bg,#080b12);color:var(--text,#e6edf5);cursor:pointer}\
.pq-cari-pop button:hover,.pq-cari-pop a:hover{border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}\
body.full-map-mode #pqCari{opacity:0;pointer-events:none}\
body:has(.modal-overlay.show,#svOverlay.show,#arOverlay.show,#cmOverlay.show,#loginScreen:not(.hide)) #pqCari{display:none}\
@media(min-width:861px){body:not(.sidebar-collapsed):not(.full-map-mode) #pqCari{left:80px}}\
@media(max-width:860px){#pqCari{left:64px;right:112px;top:13px}#pqCari .bar{height:44px}#pqCari input{font-size:16px}}";

  /* ---------- UI ---------- */
  var root, inp, dd;
  function build(host) {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    root = document.createElement("div"); root.id = "pqCari";
    root.innerHTML =
      '<div class="bar"><i class="fa-solid fa-magnifying-glass" style="color:var(--text-dim,#7c8aa0);font-size:13px"></i>' +
      '<input type="search" id="pqCariInput" placeholder="Cari tempat di Jawa Tengah &amp; DIY…" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" aria-label="Cari tempat">' +
      '<button class="ib clr" type="button" title="Hapus"><i class="fa-solid fa-xmark"></i></button>' +
      '<button class="ib go" type="button" title="Cari"><i class="fa-solid fa-arrow-right"></i></button></div>' +
      '<div class="dd" role="listbox"></div>';
    host.appendChild(root);
    inp = root.querySelector("input"); dd = root.querySelector(".dd");
    if (window.L && L.DomEvent) { L.DomEvent.disableClickPropagation(root); L.DomEvent.disableScrollPropagation(root); }
    ["mousedown", "dblclick", "touchstart", "wheel"].forEach(function (ev) { root.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });

    inp.addEventListener("input", function () {
      root.classList.toggle("has", !!inp.value);
      clearTimeout(timer);
      var q = inp.value.trim();
      if (q.length < 2) { showHistory(); return; }
      timer = setTimeout(function () { run(q, false); }, 380);
    });
    inp.addEventListener("focus", function () { if (inp.value.trim().length < 2) showHistory(); else root.classList.add("open"); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); mv(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); mv(-1); }
      else if (e.key === "Escape") { close(); inp.blur(); }
      else if (e.key === "Enter") {
        e.preventDefault(); clearTimeout(timer);
        if (active >= 0 && items[active]) pick(items[active]); else run(inp.value.trim(), true);
      }
    });
    root.querySelector(".clr").onclick = function () { inp.value = ""; root.classList.remove("has"); clearPin(); showHistory(); inp.focus(); };
    root.querySelector(".go").onclick = function () { clearTimeout(timer); run(inp.value.trim(), true); };
    document.addEventListener("click", function (e) { if (!root.contains(e.target)) close(); });
    dd.addEventListener("click", function (e) {
      var el = e.target.closest(".it"); if (el) pick(items[+el.getAttribute("data-i")]);
    });
  }
  function close() { root.classList.remove("open"); active = -1; }
  function mv(d) {
    var els = dd.querySelectorAll(".it"); if (!els.length) return;
    active = (active + d + els.length) % els.length;
    els.forEach(function (el, i) { el.classList.toggle("on", i === active); });
    els[active].scrollIntoView({ block: "nearest" });
  }
  function status(html) { dd.innerHTML = '<div class="st">' + html + "</div>"; root.classList.add("open"); }
  function showHistory() {
    var h = hist(); items = h; active = -1;
    if (!h.length) { dd.innerHTML = '<div class="st"><i class="fa-solid fa-circle-info"></i> Ketik nama jalan, desa, kantor, jembatan, atau koordinat.</div>'; root.classList.add("open"); return; }
    render(h, "Pencarian terakhir", "fa-clock-rotate-left");
  }

  var ICON = { jalan: "fa-road", jembatan: "fa-road-bridge", amp: "fa-industry", bp: "fa-cubes", quarry: "fa-mountain", coord: "fa-location-crosshairs", place: "fa-location-dot" };
  function render(list, single, icon, q) {
    items = list; active = -1;
    var html = "", last = "";
    list.forEach(function (it, i) {
      var head = single || it.group || "";
      if (head && head !== last) { html += '<div class="hd">' + esc(head) + "</div>"; last = head; }
      html += '<div class="it" role="option" data-i="' + i + '"><i class="fa-solid ' + (icon || ICON[it.kind] || ICON.place) + '"></i><div><b>' + esc(it.main) + "</b>" + (it.sub ? "<small>" + esc(it.sub) + "</small>" : "") + "</div></div>";
    });
    if (q) html += '<a class="gm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q + " Jawa Tengah") + '"><i class="fa-brands fa-google"></i> Tidak ketemu? Coba di Google Maps</a>';
    dd.innerHTML = html; root.classList.add("open");
  }

  /* ---------- Pencarian data lokal (PETAQU) ---------- */
  function localSearch(q) {
    var n = norm(q), out = [];
    if (n.length < 2) return out;
    var words = n.split(" ");
    function hit(text) { var t = norm(text); return words.every(function (w) { return t.indexOf(w) !== -1; }); }
    try {
      var c = 0;
      (typeof roads !== "undefined" ? roads : []).some(function (r) {
        if (hit(r.name) && r.points && r.points.length) {
          var p = r.points[0];
          out.push({ group: "Ruas Jalan PETAQU", kind: "jalan", id: r.id, main: r.name, sub: (r.points.length + " titik STA") + (r.lengthKmCalculated ? " • " + (+r.lengthKmCalculated).toFixed(2) + " km" : ""), lat: p.lat, lng: p.lng });
          c++;
        }
        return c >= 4;
      });
    } catch (e) {}
    try {
      var b = 0;
      (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []).some(function (j) {
        if (typeof j.lat === "number" && hit([j.nama, j.nomor, j.ruas, j.kabupaten].join(" "))) {
          out.push({ group: "Jembatan", kind: "jembatan", main: j.nama || "Jembatan", sub: [j.ruas, j.kabupaten].filter(Boolean).join(" • "), lat: j.lat, lng: j.lng });
          b++;
        }
        return b >= 4;
      });
    } catch (e) {}
    try {
      var l = 0;
      (window.LOKASI_DATA || []).some(function (x) {
        if (hit([x.owner, x.alamat, x.kabupaten, x.jenis].join(" "))) {
          var lbl = { amp: "AMP", bp: "Batching Plant", quarry: "Quarry" }[x.jenis] || x.jenis;
          out.push({ group: "AMP / Batching Plant / Quarry", kind: x.jenis, main: x.owner || lbl, sub: lbl + " • " + (x.kabupaten || ""), lat: +x.lat, lng: +x.lng, addr: x.alamat });
          l++;
        }
        return l >= 4;
      });
    } catch (e) {}
    return out;
  }

  /* ---------- Koordinat / link Google Maps ---------- */
  function parseCoord(q) {
    var m = String(q).match(/(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{2,3}\.\d+)/) || String(q).match(/@(-?\d{1,2}\.\d+),(-?\d{2,3}\.\d+)/);
    if (!m) return null;
    var a = +m[1], b = +m[2];
    if (inBox(a, b)) return { lat: a, lng: b };
    if (inBox(b, a)) return { lat: b, lng: a };
    return null;
  }

  /* ---------- Penyedia gratis ---------- */
  function fetchJson(url, signal, ms) {
    var t = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, ms || 8000);
    return fetch(url, { signal: signal }).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function photon(q, signal) {
    var url = "https://photon.komoot.io/api/?q=" + encodeURIComponent(q) + "&limit=8&lat=-7.35&lon=110.1&bbox=" + [BB.w, BB.s, BB.e, BB.n].join(",");
    return fetchJson(url, signal).then(function (d) {
      return (d.features || []).map(function (f) {
        var p = f.properties || {}, c = f.geometry && f.geometry.coordinates; if (!c) return null;
        if (p.state && !STATE_OK.test(p.state)) return null;
        var main = p.name || p.street || p.district || "Lokasi";
        var sub = [p.name && p.street, p.district || p.locality, p.city || p.county, p.state].filter(function (x) { return x && x !== main; }).join(", ");
        return { group: "Tempat (OpenStreetMap)", kind: "place", main: main, sub: sub, lat: c[1], lng: c[0] };
      }).filter(Boolean);
    });
  }
  function nominatim(q, signal) {
    var wait = Math.max(0, 1100 - (Date.now() - lastNom));
    return new Promise(function (r) { setTimeout(r, wait); }).then(function () {
      lastNom = Date.now();
      var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=id&countrycodes=id&bounded=1&viewbox=" + [BB.w, BB.n, BB.e, BB.s].join(",") + "&q=" + encodeURIComponent(q);
      return fetchJson(url, signal, 9000);
    }).then(function (d) {
      return (d || []).map(function (t) {
        var a = t.address || {}, lat = +t.lat, lng = +t.lon;
        if (a.state && !STATE_OK.test(a.state)) return null;
        if (!inBox(lat, lng)) return null;
        var parts = String(t.display_name || "").split(",").map(function (s) { return s.trim(); });
        var main = t.name || a.road || parts[0];
        var sub = parts.filter(function (x) { return x !== main && !/^\d{5}$/.test(x) && x !== "Indonesia"; }).slice(0, 4).join(", ");
        var o = { group: "Tempat (OpenStreetMap)", kind: "place", main: main, sub: sub, lat: lat, lng: lng };
        if (t.boundingbox && /administrative|boundary/.test(t.category + t.type)) o.bb = t.boundingbox.map(Number);
        return o;
      }).filter(Boolean);
    });
  }
  function dedupe(list) {
    var seen = {};
    return list.filter(function (it) {
      var k = norm(it.main) + "|" + it.lat.toFixed(3) + "|" + it.lng.toFixed(3);
      if (seen[k]) return false; seen[k] = 1; return true;
    });
  }

  /* ---------- Jalankan pencarian ---------- */
  function run(q, full) {
    if (!q || q.length < (full ? 2 : 3)) { if (!q) showHistory(); return; }
    var my = ++seq;
    try { ctrl && ctrl.abort(); } catch (e) {}
    ctrl = new AbortController();
    var sig = ctrl.signal;

    var cc = parseCoord(q);
    var base = [];
    if (cc) base.push({ group: "Koordinat", kind: "coord", main: cc.lat.toFixed(6) + ", " + cc.lng.toFixed(6), sub: "Pergi ke koordinat ini", lat: cc.lat, lng: cc.lng });
    base = base.concat(localSearch(q));
    var key = (full ? "N:" : "P:") + norm(q);
    if (cc) { render(base, null, null, q); if (full) pick(base[0]); return; }

    if (cache[key]) { render(dedupe(base.concat(cache[key])), null, null, q); return; }
    if (base.length) render(base, null, null, q); else status('<i class="fa-solid fa-circle-notch fa-spin"></i> Mencari di Jawa Tengah &amp; DIY…');

    var chain = full
      ? nominatim(q, sig).then(function (r) { return r.length ? r : photon(q, sig); }, function () { return photon(q, sig); })
      : photon(q, sig).catch(function () { return nominatim(q, sig); });
    chain.then(function (r) {
      if (my !== seq) return;
      cache[key] = r;
      var all = dedupe(base.concat(r));
      if (!all.length) {
        status('<i class="fa-solid fa-magnifying-glass-location"></i> Tidak ada hasil di Jawa Tengah &amp; DIY untuk “' + esc(q) + '”.' + (full ? "" : " Tekan Enter untuk pencarian lebih luas."));
        dd.insertAdjacentHTML("beforeend", '<a class="gm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q + " Jawa Tengah") + '"><i class="fa-brands fa-google"></i> Coba di Google Maps</a>');
        return;
      }
      render(all, null, null, q);
      if (full && all.length === 1) pick(all[0]);
    }).catch(function (e) {
      if (my !== seq || (e && e.name === "AbortError" && !full)) return;
      if (base.length) return;
      status('<i class="fa-solid fa-triangle-exclamation"></i> Gagal terhubung ke layanan peta. Cek internet lalu coba lagi.');
    });
  }

  /* ---------- Pilih hasil ---------- */
  function clearPin() { var m = getMap(); if (pin && m) { m.removeLayer(pin); } pin = null; }
  function pick(it) {
    if (!it) return;
    var m = getMap(); if (!m) return;
    close(); inp.blur();
    inp.value = it.main; root.classList.add("has");
    pushHist(it);

    if (it.kind === "jalan" && it.id && typeof focusRoad === "function") { clearPin(); focusRoad(it.id); return; }

    if (it.bb && it.bb.length === 4) {
      m.flyToBounds([[it.bb[0], it.bb[2]], [it.bb[1], it.bb[3]]], { padding: [40, 40], maxZoom: 15, duration: 0.7 });
    } else {
      m.flyTo([it.lat, it.lng], Math.max(m.getZoom(), it.kind === "place" || it.kind === "coord" ? 17 : 17), { duration: 0.7 });
    }
    clearPin();
    pin = L.marker([it.lat, it.lng], { icon: L.divIcon({ className: "", html: '<div class="pq-cari-pin"></div>', iconSize: [30, 30], iconAnchor: [4, 30] }), zIndexOffset: 9000 }).addTo(m);
    var ll = it.lat.toFixed(6) + ", " + it.lng.toFixed(6);
    var pop = document.createElement("div"); pop.className = "pq-cari-pop";
    pop.innerHTML = "<b>" + esc(it.main) + "</b><small>" + esc(it.addr || it.sub || "") + (it.addr || it.sub ? "<br>" : "") + ll + '</small><div class="r">' +
      '<button data-a="sv">Street View</button>' +
      '<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + it.lat + "," + it.lng + '">Rute</a>' +
      '<button data-a="cp">Salin</button><button data-a="rm">Hapus</button></div>';
    pop.addEventListener("click", function (e) {
      var a = e.target.getAttribute && e.target.getAttribute("data-a");
      if (a === "sv" && window.openStreetViewForGeoResult) window.openStreetViewForGeoResult(it.lat, it.lng, it.main);
      else if (a === "cp") { try { navigator.clipboard.writeText(ll); if (typeof toast === "function") toast("Koordinat disalin"); e.target.textContent = "Tersalin ✓"; } catch (x) {} }
      else if (a === "rm") { clearPin(); inp.value = ""; root.classList.remove("has"); }
    });
    pin.bindPopup(pop, { closeButton: true, autoPanPadding: [20, 80] });
    setTimeout(function () { pin && pin.openPopup(); }, 750);
  }

  /* ---------- Start ---------- */
  var tries = 0, iv = setInterval(function () {
    var host = document.getElementById("map");
    if (host && getMap() && window.L) {
      clearInterval(iv);
      if (!document.getElementById("pqCari")) build(host);
    } else if (++tries > 120) clearInterval(iv);
  }, 250);

  window.PQ_CARI = {
    open: function () { inp && inp.focus(); },
    focus: function (q) { if (!inp) return; inp.value = q || ""; root.classList.toggle("has", !!q); run(q, true); }
  };
})();
