/* PETAQU — Street View + label terbaca untuk SEMUA lapisan folder
   (Jalan Nasional, Patok KM, Kabupaten, Jembatan per Kabupaten, Tol & Provinsi).
   Ringan: tanpa layer baru. Hanya (1) CSS legibilitas, (2) tombol Street View/Google Maps
   yang ditambahkan ke popup mana pun yang belum punya, memakai Street View bawaan aplikasi. */
(function () {
  "use strict";
  if (window.__pqSv) return;
  window.__pqSv = 1;

  var css = document.createElement("style");
  css.id = "pq-sv-css";
  css.textContent = [
    /* popup gelap + teks terang (semua lapisan folder) */
    ".leaflet-popup-content-wrapper{background:#0f1522f2!important;color:#e6f1fb!important;border:1px solid #38bdf866;border-radius:12px;box-shadow:0 10px 30px #000a}",
    ".leaflet-popup-tip{background:#0f1522!important}.leaflet-popup-content{color:#e6f1fb!important;font-family:system-ui,sans-serif;font-size:12.5px;line-height:1.45;margin:11px 13px}",
    ".leaflet-popup-content b{color:#fff}.leaflet-popup-content a{color:#7dd3fc}.leaflet-popup-close-button{color:#fff!important}",
    /* tooltip / label putih tegas */
    ".leaflet-tooltip{background:#0a0e17f5!important;color:#fff!important;border:1px solid #ffffff44!important;border-radius:7px;font:700 11.5px system-ui,sans-serif;text-shadow:0 1px 2px #000;box-shadow:0 3px 10px #0009}",
    ".leaflet-tooltip:before{display:none!important}",
    ".tl-lab span,.kb-l,.kb-l b{color:#fff!important;text-shadow:0 0 3px #000,0 0 3px #000,0 0 6px #000,0 1px 2px #000!important;font-weight:800}",
    ".kb-l small{color:#fde68a!important}",
    /* tombol aksi */
    ".pqsv-ac{display:flex;gap:6px;margin-top:9px}.pqsv-ac button,.pqsv-ac a{flex:1;text-align:center;text-decoration:none!important;cursor:pointer;font:700 12px system-ui,sans-serif;color:#fff!important;background:#0284c7;border:0;border-radius:8px;padding:7px 8px}",
    ".pqsv-ac a{background:#ffffff1a;border:1px solid #ffffff33}.pqsv-ac button:hover{background:#0ea5e9}"
  ].join("\n");
  document.head.appendChild(css);

  function MAP() { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } }

  function openSV(lat, lng, name) {
    var M = MAP();
    try { M && M.closePopup(); } catch (e) {}
    if (window.openStreetViewForGeoResult) { window.openStreetViewForGeoResult(lat, lng, name || "Lokasi"); return; }
    window.open("https://www.google.com/maps?q=&layer=c&cbll=" + lat + "," + lng, "_blank", "noopener");
  }

  function decorate(e) {
    var p = e.popup, el = p && p.getElement && p.getElement();
    if (!el) return;
    var c = el.querySelector(".leaflet-popup-content");
    if (!c || c.querySelector(".pqsv-ac,[data-sv]") || /openStreetView|Street View/i.test(c.innerHTML)) return;
    var ll = p.getLatLng(); if (!ll) return;
    var h = c.querySelector("b,.pop-title,strong"), name = h ? h.textContent.trim() : "";
    var d = document.createElement("div");
    d.className = "pqsv-ac";
    d.innerHTML = '<button type="button">Street View</button><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + ll.lat.toFixed(6) + "," + ll.lng.toFixed(6) + '">Google Maps</a>';
    d.firstChild.onclick = function (ev) { ev.stopPropagation(); openSV(ll.lat, ll.lng, name); };
    c.appendChild(d);
    try { p.update(); } catch (x) {}
  }

  function boot(n) {
    var M = MAP();
    if (M && M.on) { M.on("popupopen", decorate); return; }
    if (n < 80) setTimeout(function () { boot(n + 1); }, 300);
  }
  boot(0);
})();
