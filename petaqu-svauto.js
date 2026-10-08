/* PETAQU — Street View OTOMATIS saat animasi rute berjalan
   • Tombol baru (ikon orang) di panel pemutar animasi: ON/OFF (diingat, default ON)
   • Saat animasi berjalan, panel Street View terbuka otomatis & mengikuti posisi kendaraan
     dengan arah pandang searah jalan. Berhenti saat animasi dijeda / selesai / dihentikan.
   • Hemat kuota: hanya memuat ulang tiap ±20 m / ≥2 dtk, memakai Street View bawaan aplikasi. */
(function () {
  "use strict";
  if (window.__pqSvAuto) return;
  window.__pqSvAuto = 1;
  var KEY = "pq_sv_auto", MIN_M = 20, MIN_MS = 2000, TICK = 700;
  var on = true; try { on = localStorage.getItem(KEY) !== "0"; } catch (e) {}
  var last = null, lastT = 0, opened = false, btn = null;

  function RA() { try { return typeof routeAnim !== "undefined" ? routeAnim : null; } catch (e) { return null; } }
  function overlay() { return document.getElementById("svOverlay"); }
  function svOpen() { var o = overlay(); return !!(o && o.classList.contains("show")); }
  function toast_(m, err) { try { if (typeof toast === "function") toast(m, !!err); } catch (e) {} }
  function meters(a, b) {
    var r = Math.PI / 180, x = (b.lat - a.lat) * r, y = (b.lng - a.lng) * r;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return 12742000 * Math.asin(Math.sqrt(h));
  }
  function setBtn() { if (!btn) return; btn.classList.toggle("active", on); btn.title = "Street View otomatis saat animasi: " + (on ? "ON" : "OFF"); }

  function addBtn() {
    var bar = document.getElementById("routePlayerBar");
    if (!bar || document.getElementById("pqSvAutoBtn")) return !!bar;
    btn = document.createElement("button");
    btn.className = "rp-btn"; btn.id = "pqSvAutoBtn";
    btn.innerHTML = '<i class="fa-solid fa-street-view"></i>';
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      on = !on; try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (x) {}
      setBtn(); last = null; opened = false;
      toast_(on ? "Street View otomatis: ON" : "Street View otomatis: OFF");
      if (!on) { try { if (svOpen() && typeof closeStreetView === "function") closeStreetView(); } catch (x) {} }
    });
    var stop = bar.querySelector(".rp-btn.danger");
    bar.insertBefore(btn, stop || null);
    setBtn(); return true;
  }

  function pos(a) {
    var o = (typeof findSegmentAtDistance === "function") ? findSegmentAtDistance(a.cum, a.traveledDist) : 0;
    var p = a.pts[o], q = a.pts[o + 1] || a.pts[o];
    var s = Math.min(1, Math.max(0, (a.traveledDist - a.cum[o]) / ((a.cum[o + 1] - a.cum[o]) || 1e-9)));
    var h = (typeof calcBearing === "function" && q !== p) ? Math.round(calcBearing(p, q)) : 0;
    return { lat: p.lat + (q.lat - p.lat) * s, lng: p.lng + (q.lng - p.lng) * s, h: h };
  }

  function tick() {
    addBtn();
    var a = RA();
    if (!a || !a.playing || !on) { if (!a) { last = null; opened = false; } return; }
    if (opened && !svOpen()) { /* ditutup manual oleh pengguna -> matikan otomatis */
      on = false; try { localStorage.setItem(KEY, "0"); } catch (e) {} setBtn(); opened = false; toast_("Street View otomatis dimatikan"); return;
    }
    var now = Date.now(), c = pos(a);
    if (last && (now - lastT < MIN_MS || meters(last, c) < MIN_M)) return;
    var key = ""; try { key = getApiKey(); } catch (e) {}
    if (!key) { toast_("Street View butuh API key Google Maps (Pengaturan)", true); on = false; setBtn(); return; }
    var label = "STA " + (document.getElementById("routePlayerSta") ? document.getElementById("routePlayerSta").textContent.replace(/^STA\s*/, "") : "");
    var name = a.road && a.road.name ? a.road.name : "Rute";
    var src = "https://www.google.com/maps/embed/v1/streetview?key=" + encodeURIComponent(key) + "&location=" + c.lat + "," + c.lng + "&heading=" + c.h + "&pitch=0&fov=90";
    try {
      if (!svOpen()) {
        openStreetViewForGeoResult(c.lat, c.lng, name + " • " + label);
        opened = true;
      } else if (typeof svState !== "undefined" && svState) { svState.lat = c.lat; svState.lng = c.lng; svState.label = name + " • " + label; }
      var f = document.getElementById("svFrame");
      if (f) { f.style.visibility = "visible"; f.src = src; }
      var set = function (id, t) { var el = document.getElementById(id); if (el) el.textContent = t; };
      set("svRoadName", name); set("svCoord", c.lat.toFixed(6) + ", " + c.lng.toFixed(6));
      var b = document.getElementById("svStaBadge"); if (b) b.innerHTML = '<i class="fa-solid fa-location-dot"></i> ' + label;
      var l = document.getElementById("svLoading"); if (l) l.classList.add("hide");
    } catch (e) {}
    last = { lat: c.lat, lng: c.lng }; lastT = now;
  }
  setInterval(tick, TICK);
})();
