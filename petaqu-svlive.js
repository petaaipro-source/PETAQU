/* PETAQU — Street View LIVE (panorama Maps JavaScript API)
   Mengganti embed iframe (yang tidak bisa melaporkan posisi) dengan panorama yang melaporkan
   posisinya, sehingga KOORDINAT, STA, jarak ke ruas, arah pandang, titik di peta, dan pemutar
   animasi ikut berubah saat Anda berpindah / menggeser di dalam Street View.
   • Dipakai untuk: titik STA, hasil pencarian, jembatan, patok KM, dan animasi rute.
   • Otomatis kembali ke embed lama bila Maps JS API gagal dimuat (kunci/koneksi) atau
     saat melihat "foto lama" (riwayat). Tidak mengubah fitur lain. */
(function () {
  "use strict";
  if (window.PQSvLive) return;

  var st = 0;               /* 0 belum, 1 memuat, 2 siap, -1 gagal */
  var pano = null, div = null, ourPano = null, seq = 0, pend = null, lastC = null, ro = null, povRaf = 0;
  var L = { userNav: false, ready: function () { return st === 2 && !!pano && div && div.style.visibility !== "hidden"; },
            heading: function () { try { return pano ? pano.getPov().heading : null; } catch (e) { return null; } } };
  window.PQSvLive = L;
  /* --- kait untuk PQSvView (mode Live / Embed / Dual) --- */
  L.pano = function () { return pano; };
  L.div = function () { return div; };
  L.state = function () { return st; };
  L.stale = false;                                   /* panorama tertinggal dari titik aplikasi (saat mode Embed) */
  L.hide = function () { seq++; hidePano(); };       /* sembunyikan panorama, tampilkan embed */
  function V_() { var v = window.PQSvView; return v && typeof v.wantsLive === "function" ? v : null; }

  function $(id) { return document.getElementById(id); }
  function SV() { try { return typeof svState !== "undefined" ? svState : null; } catch (e) { return null; } }
  function RA() { try { return typeof routeAnim !== "undefined" ? routeAnim : null; } catch (e) { return null; } }
  function toast_(m, e) { try { if (typeof toast === "function") toast(m, !!e); } catch (x) {} }
  function histOn() { try { return typeof svHistoryActivePano !== "undefined" && !!svHistoryActivePano; } catch (e) { return false; } }
  function key() { try { return getApiKey(); } catch (e) { return ""; } }
  function esc(s) { try { return escapeHTML(s); } catch (e) { return String(s == null ? "" : s); } }
  function mtr(a, b) {
    var r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lng - a.lng) * r;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return 12742000 * Math.asin(Math.sqrt(h));
  }

  /* ---------- proyeksi koordinat ke garis ruas → STA ---------- */
  function project(pts, lat, lng) {
    if (!pts || pts.length < 2) return null;
    var k = Math.cos(lat * Math.PI / 180), best = null;
    for (var i = 0; i < pts.length - 1; i++) {
      var ax = (pts[i].lng - lng) * k * 111320, ay = (pts[i].lat - lat) * 110540;
      var bx = (pts[i + 1].lng - lng) * k * 111320, by = (pts[i + 1].lat - lat) * 110540;
      var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      var t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      var px = ax + dx * t, py = ay + dy * t, d = Math.sqrt(px * px + py * py);
      if (!best || d < best.off) best = { i: i, t: t, off: d };
    }
    return best;
  }
  function staAt(road, pr) {
    var A = road.points[pr.i], B = road.points[pr.i + 1], a = null, b = null;
    try { a = parseStaMeters(A.sta); b = parseStaMeters(B.sta); } catch (e) {}
    if (a != null && b != null) return formatStaMeters(a + (b - a) * pr.t);
    return String((pr.t < .5 ? A : B).sta || "");
  }
  function roadKm(road, pr) {
    var pts = road.points, tot = 0, at = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var s = mtr(pts[i], pts[i + 1]) / 1000;
      if (i < pr.i) at += s; else if (i === pr.i) at += s * pr.t;
      tot += s;
    }
    return { at: at, tot: tot };
  }

  /* ---------- muat Maps JS API (memakai pemuat milik aplikasi bila ada) ---------- */
  var apiP = null;
  function loadApi() {
    if (window.google && google.maps && google.maps.StreetViewPanorama && google.maps.StreetViewService) return Promise.resolve();
    if (apiP) return apiP;
    apiP = (typeof ensureGoogleMapsJsApiForHistory === "function" ? ensureGoogleMapsJsApiForHistory() : Promise.reject(new Error("no loader")))
      .then(function () { if (!(window.google && google.maps && google.maps.StreetViewPanorama)) throw new Error("api"); });
    apiP.catch(function () { apiP = null; });
    return apiP;
  }
  var prevAuth = window.gm_authFailure;
  window.gm_authFailure = function () { try { if (st > 0) fail("Kunci API ditolak untuk Maps JavaScript API"); } catch (e) {} if (typeof prevAuth === "function") prevAuth(); };

  function ensureDiv() {
    if (div && div.isConnected) return div;
    var wrap = $("svFrameWrap"), f = $("svFrame"); if (!wrap) return null;
    div = document.createElement("div"); div.id = "pqSvPano";
    div.style.cssText = "position:absolute;inset:0;width:100%;height:100%;background:#05070c;visibility:hidden";
    if (f && f.nextSibling) wrap.insertBefore(div, f.nextSibling); else wrap.appendChild(div);
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { try { if (pano) google.maps.event.trigger(pano, "resize"); } catch (e) {} }); ro.observe(wrap); }
    return div;
  }
  function ensurePano() {
    if (pano) return pano;
    if (!ensureDiv()) return null;
    pano = new google.maps.StreetViewPanorama(div, {
      addressControl: false, fullscreenControl: false, enableCloseButton: false, motionTracking: false,
      motionTrackingControl: false, panControl: true, zoomControl: true, linksControl: true, clickToGo: true,
      visible: false
    });
    pano.addListener("pano_changed", onPano);
    pano.addListener("position_changed", onPos);
    pano.addListener("pov_changed", onPov);
    return pano;
  }

  function fail(msg) {
    var was = st; st = -1; seq++;
    try { if (div) div.style.visibility = "hidden"; if (pano) pano.setVisible(false); } catch (e) {}
    var f = $("svFrame"); if (f) f.style.display = "";
    if (was !== -1) toast_((msg || "Panorama langsung tidak tersedia") + " — memakai Street View embed", true);
    try { if (window.PQSvAuto) window.PQSvAuto.reset(); } catch (e) {}
    try { var V = V_(); if (V && V.onLiveFail) V.onLiveFail(); } catch (e) {}
    try { if (SV() && typeof renderStreetView === "function") renderStreetView(); } catch (e) {}
  }

  function showPano() {
    var f = $("svFrame");
    div.style.visibility = "visible";
    try { pano.setVisible(true); } catch (e) {}
    var V = V_(), keep = !!(V && V.wantsFrame());
    if (f && keep) { f.style.display = ""; f.style.visibility = "visible"; }      /* mode Dual: embed tetap tampil di samping */
    else if (f) { f.onload = null; f.onerror = null; try { clearTimeout(svLoadTimer); } catch (e) {} f.style.display = "none"; if (f.getAttribute("src")) f.src = ""; }
    var l = $("svLoading"); if (l) l.classList.add("hide");
  }
  function hidePano() {
    if (div) div.style.visibility = "hidden";
    try { if (pano) pano.setVisible(false); } catch (e) {}
    var f = $("svFrame"); if (f) f.style.display = "";
  }

  /* ---------- pindahkan panorama ke titik (dari kode kita sendiri) ---------- */
  function place(lat, lng, heading) {
    var my = ++seq, svc = new google.maps.StreetViewService(), ll = new google.maps.LatLng(lat, lng);
    function apply(data) {
      if (my !== seq || !pano) return;
      ourPano = data.location.pano;
      pano.setPano(ourPano);
      pano.setPov({ heading: heading || 0, pitch: 0 });
      L.stale = false;
      showPano();
      try { var V = V_(); if (V && V.onPlaced) { var ll2 = data.location.latLng; V.onPlaced(ll2.lat(), ll2.lng(), heading || 0); } } catch (e) {}
    }
    function ask(radius, next) {
      svc.getPanorama({ location: ll, radius: radius, source: google.maps.StreetViewSource.OUTDOOR }, function (data, status) {
        if (my !== seq) return;
        if (status === google.maps.StreetViewStatus.OK && data && data.location) return apply(data);
        if (next) return ask(next);
        toast_("Tidak ada foto Street View di dekat titik ini", true);
        var f = $("svFrame"); if (f && f.style.display !== "none") return;
        hidePano();
      });
    }
    ask(50, 250);
  }

  /* dipanggil svauto saat animasi: true = ditangani panorama */
  L.go = function (c) {
    if (st === -1 || !key()) return false;
    if (histOn()) return false;
    var V = V_();
    if (V && !V.wantsLive()) { L.stale = true; return false; }   /* mode Embed: biarkan iframe lama bekerja */
    if (st === 2) { if (!ensurePano()) return false; place(c.lat, c.lng, c.rh != null ? c.rh : c.h); return true; }
    pend = { lat: c.lat, lng: c.lng, h: c.rh != null ? c.rh : c.h };
    if (st === 0) {
      st = 1;
      loadApi().then(function () { st = 2; if (!ensurePano()) { fail(); return; } if (pend && SV()) place(pend.lat, pend.lng, pend.h); pend = null; },
                     function () { fail("Maps JavaScript API gagal dimuat"); });
    }
    return true;
  };

  /* ---------- pengguna berpindah / menggeser di dalam Street View ---------- */
  function onPano() {
    if (!pano || !SV()) return;
    var id = pano.getPano();
    if (!id || id === ourPano) return;
    ourPano = null;                 /* pano baru dipilih pengguna */
    L.userNav = true;
    var a = RA();
    try { if (a && a.playing && typeof toggleRoutePlayPause === "function") { toggleRoutePlayPause(); toast_("Animasi dijeda — Anda berpindah di Street View. Tekan Play untuk lanjut dari titik ini."); } } catch (e) {}
  }
  function onPos() {
    if (!pano || !L.userNav || !SV()) return;
    var p = pano.getPosition(); if (!p) return;
    refresh(p.lat(), p.lng());
  }
  function onPov() {
    if (povRaf) return;
    povRaf = requestAnimationFrame(function () {
      povRaf = 0;
      if (!L.userNav || !lastC || !pano) return;
      lastC.h = Math.round(pano.getPov().heading); paintAll(lastC);
    });
  }

  /* perbarui seluruh tampilan berdasarkan koordinat panorama */
  function refresh(lat, lng) {
    var S = SV(), a = RA(), road = null, c = null;
    if (S && S.type === "road") { try { road = roads.find(function (r) { return r.id === S.roadId; }); } catch (e) {} }
    else if (a && a.road && S && S.type === "geo") road = a.road;
    var heading = Math.round(pano.getPov().heading);

    if (a && road && a.road === road && a.pts && a.cum) {
      /* animasi: geser kendaraan/pemutar ke titik di ruas terdekat, lalu pakai STA yang sama dengan pemutar */
      var pr = project(a.pts, lat, lng);
      if (pr && pr.off < 80) {
        a.traveledDist = a.cum[pr.i] + (a.cum[pr.i + 1] - a.cum[pr.i]) * pr.t;
        try { updateRouteAnimVisual(); } catch (e) {}
        c = window.PQSvAuto.info(a);
        if (c) { c.lat = lat; c.lng = lng; c.h = heading; c.off = pr.off; }
      }
    } else if (road && road.points && road.points.length > 1) {
      var q = project(road.points, lat, lng);
      if (q) {
        var sta = staAt(road, q), km = roadKm(road, q), idx = q.t < .5 ? q.i : q.i + 1;
        c = { lat: lat, lng: lng, h: heading, sta: sta, name: road.name || "Ruas", kab: road.kabupaten || "",
              km: km.at.toFixed(2) + " / " + km.tot.toFixed(2) + " km", pct: km.tot ? Math.round(km.at / km.tot * 100) : 0,
              pt: road.points[idx] || null, off: q.off };
        if (S.type === "road" && q.off < 80) S.index = idx;     /* tombol Sebelumnya/Berikutnya lanjut dari sini */
      }
    }
    if (c) { lastC = c; paintAll(c); }
    else { lastC = null; coordOnly(lat, lng); }

    try { if (typeof updateSvLiveIndicator === "function") updateSvLiveIndicator({ lat: lat, lng: lng }); } catch (e) {}
    try { if (S && S.live) { S.live = c || S.live; } if (S) { S.lat = lat; S.lng = lng; } } catch (e) {}
  }
  function paintAll(c) {
    var a = RA();
    try { window.PQSvAuto.paintDom(c, a && a.playing ? a : null); } catch (e) {}
    var el = $("svInfoPanel"); if (el) el.classList.remove("pq-live");
  }
  /* jembatan / hasil pencarian: hanya koordinat yang berubah */
  function coordOnly(lat, lng) {
    var co = lat.toFixed(6) + ", " + lng.toFixed(6), t;
    if ((t = $("svCoord"))) t.textContent = co;
    if ((t = $("svLauncherCoord"))) t.textContent = co;
    var ex = $("svExternalLink"); if (ex) ex.href = "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + lat + "," + lng + "&heading=" + Math.round(pano.getPov().heading) + "&pitch=0";
    var rows = document.querySelectorAll("#svInfoPanelBody .sv-info-row");
    for (var i = 0; i < rows.length; i++) { var sp = rows[i].firstChild; if (sp && /^Koordinat$/i.test(sp.textContent)) rows[i].lastChild.textContent = co; }
  }

  /* ---------- sambungkan ke render Street View bawaan (titik STA, jembatan, pencarian, patok) ---------- */
  function wrapRender() {
    var f = window.renderStreetView;
    if (typeof f !== "function") return setTimeout(wrapRender, 300);
    if (f.__pqLive) return;
    var w = function () {
      var r = f.apply(this, arguments);
      try {
        L.userNav = false; lastC = null;
        var e = (typeof getSvPoint === "function") ? getSvPoint() : null;
        if (e && !(window.__pqSvKeep)) {
          var h = e.next ? Math.round(bearing(e.lat, e.lng, e.next.lat, e.next.lng)) : 0;
          if (L.go({ lat: e.lat, lng: e.lng, h: h })) { /* panorama menangani; iframe dimatikan saat siap */ }
          else hidePano();
        }
      } catch (x) {}
      return r;
    };
    w.__pqLive = 1; window.renderStreetView = w;
  }
  function wrapClose() {
    var f = window.closeStreetView;
    if (typeof f !== "function") return setTimeout(wrapClose, 300);
    if (f.__pqLive) return;
    var w = function () { seq++; L.userNav = false; lastC = null; ourPano = null; try { hidePano(); } catch (e) {} return f.apply(this, arguments); };
    w.__pqLive = 1; window.closeStreetView = w;
  }
  wrapRender(); wrapClose();
})();
