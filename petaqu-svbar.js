/* PETAQU — Bilah kontrol Street View UNIVERSAL (bawah layar Street View) untuk SEMUA lapisan/fitur.
   Satu bilah yang sama muncul setiap Street View terbuka — dari Patok KM / titik STA ruas, Jembatan (semua tab & lapisan),
   hasil pencarian, OCR KM, simulasi drone, legenda, dll:
     ◀ ▶  titik / jembatan sebelumnya & berikutnya (sepanjang ruas atau jembatan terdekat searah pandang)
     ⇄    balik arah pandang      ↻  putar 90°      [kelas]  koreksi kelas (khusus jembatan berkelas)
   Arah pandang otomatis (PQ_AUTOHEAD): mengikuti sumbu jalan terdekat (ruas yang dimuat → Jalan Nasional) bila fitur tidak
   memberi arah sendiri. Tidak mengubah fitur lain; sumber arah/tetangga khusus diberikan lewat svState.bar / svState.hd. */
(function () {
  "use strict";
  if (window.__pqSvBar) return;
  window.__pqSvBar = 1;

  var R = Math.PI / 180, bar = null, lastSig = "", cache = {};
  function $(id) { return document.getElementById(id); }
  function S() { try { return typeof svState !== "undefined" ? svState : null; } catch (e) { return null; } }
  function ROADS() { try { return typeof roads !== "undefined" && roads ? roads : []; } catch (e) { return []; } }
  function JDB() { try { return typeof JEMBATAN_DB !== "undefined" && JEMBATAN_DB ? JEMBATAN_DB : []; } catch (e) { return []; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtM(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + " km" : Math.round(n) + " m"; }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
  function vec(a, b) { var k = 111320, cx = Math.cos(a.lat * R); return [(b.lng - a.lng) * k * cx, (b.lat - a.lat) * k]; }
  function brg(dx, dy) { return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360; }
  var HN = ["utara", "timur laut", "timur", "tenggara", "selatan", "barat daya", "barat", "barat laut"];
  function hName(h) { return HN[Math.round(((h % 360) + 360) % 360 / 45) % 8]; }
  function angDiff(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }

  /* ---------- arah pandang otomatis ---------- */
  function nearRoadPt(lat, lng, maxM) {
    var best = null, a = { lat: lat, lng: lng }, dd = maxM / 111320 * 1.5;
    ROADS().forEach(function (r) {
      var p = r.points; if (!p) return;
      for (var i = 0; i < p.length; i++) {
        var q = p[i]; if (Math.abs(q.lat - lat) > dd || Math.abs(q.lng - lng) > dd * 1.5) continue;
        var v = vec(a, q), d = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
        if (d <= maxM && (!best || d < best.d)) best = { d: d, r: r, i: i };
      }
    });
    return best;
  }
  function autoHead(e) {
    if (!e || !isFinite(e.lat)) return 0;
    var key = e.lat.toFixed(5) + "," + e.lng.toFixed(5);
    if (cache[key] != null) return cache[key];
    var h = 0, n = nearRoadPt(e.lat, e.lng, 40);
    if (n) {
      var p = n.r.points, a = p[n.i], b = p[n.i + 1] || null, c = p[n.i - 1] || null;
      if (b) { var v = vec(a, b); h = brg(v[0], v[1]); } else if (c) { var v2 = vec(c, a); h = brg(v2[0], v2[1]); }
    } else {
      try { var ax = window.PETAQU_JBK && PETAQU_JBK.axis ? PETAQU_JBK.axis(e.lat, e.lng) : null; if (ax != null) h = ax; } catch (x) { }
    }
    h = Math.round(h); if (Object.keys(cache).length > 400) cache = {}; cache[key] = h; return h;
  }
  window.PQ_AUTOHEAD = autoHead;

  function curHeading() {
    var s = S(); if (!s) return 0;
    if (s.hd != null) return s.hd;
    var e; try { e = getSvPoint(); } catch (x) { e = null; } if (!e) return 0;
    if (e.next) return Math.round(brg.apply(null, vec(e, e.next)));
    return autoHead(e);
  }

  /* ---------- penyedia ◀ ▶ bawaan ---------- */
  function ahead(me, h, list) {
    var s = Math.sin(h * R), c = Math.cos(h * R), f = null, b = null;
    list.forEach(function (o) {
      var v = vec(me, o), d = Math.sqrt(v[0] * v[0] + v[1] * v[1]); if (d < 12 || d > 5000) return;
      var same = me.ruas && norm(o.ruas) === norm(me.ruas); if (!same && d > 1500) return;
      var pr = v[0] * s + v[1] * c, lat = Math.abs(v[0] * c - v[1] * s); if (!same && lat > 120) return;
      var rec = { o: o, d: d };
      if (pr > 0 && (!f || d < f.d)) f = rec; else if (pr < 0 && (!b || d < b.d)) b = rec;
    });
    return { f: f, b: b };
  }
  function providerFor(s) {
    if (s.bar) return s.bar;
    var e; try { e = getSvPoint(); } catch (x) { e = null; } if (!e) return null;
    if (s.type === "road") {
      var rd = ROADS().filter(function (r) { return r.id === s.roadId; })[0], n = rd && rd.points ? rd.points.length : 0;
      return { can: function (d) { var k = s.index + d; return k >= 0 && k < n; }, go: function (d) { try { svNav(d); } catch (x) { } }, sub: function () { return "titik " + (s.index + 1) + " / " + n; } };
    }
    if (s.type === "jembatan") {
      var cur = JDB().filter(function (b) { return b.id === s.jembatanId; })[0]; if (!cur) return null;
      var me = { lat: cur.lat, lng: cur.lng, ruas: cur.ruas }, list = JDB().filter(function (b) { return b !== cur && typeof b.lat === "number" && typeof b.lng === "number"; }).map(function (b) { return { lat: b.lat, lng: b.lng, ruas: b.ruas, id: b.id }; });
      return {
        can: function (d, h) { var a = ahead(me, h, list); return !!(d > 0 ? a.f : a.b); },
        go: function (d, h) { var a = ahead(me, h, list), t = d > 0 ? a.f : a.b; if (t) window.openStreetViewForJembatan(t.o.id, d > 0 ? h : (h + 180) % 360); },
        sub: function (h) { var a = ahead(me, h, list); return "Jembatan" + (cur.panjang ? " · " + cur.panjang + " m" : "") + (a.f ? " · ▶ " + fmtM(a.f.d) : ""); }
      };
    }
    /* hasil pencarian / titik bebas: melangkah sepanjang ruas terdekat (≤ 60 m) bila ada */
    var nr = nearRoadPt(e.lat, e.lng, 60); if (!nr) return null;
    function step(d, h) {
      var p = nr.r.points, a = p[nr.i], b = p[nr.i + 1], dir = 1;
      if (b) { var v = vec(a, b); dir = angDiff(brg(v[0], v[1]), h) <= 90 ? 1 : -1; } else dir = -1;
      return nr.i + (d > 0 ? dir : -dir);
    }
    return {
      can: function (d, h) { var k = step(d, h); return k >= 0 && k < nr.r.points.length; },
      go: function (d, h) { var k = step(d, h); try { openStreetView(nr.r.id, k); } catch (x) { } },
      sub: function () { return nr.r.name || ""; }
    };
  }

  /* ---------- UI ---------- */
  function mk() {
    if (bar) return bar;
    var wrap = $("svFrameWrap") || $("svOverlay"); if (!wrap) return null;
    var st = document.createElement("style"); st.id = "pqSvBarCss";
    st.textContent = "#pqSvBar{position:absolute;left:50%;top:176px;transform:translateX(-50%);z-index:9;display:none;align-items:center;gap:6px;max-width:calc(100% - 20px);padding:6px 8px;border-radius:14px;background:#0a0e17ee;border:1px solid #38bdf866;color:#e6f1fb;font:600 12px system-ui,sans-serif;box-shadow:0 8px 24px #000a;backdrop-filter:blur(6px)}" +
      "#pqSvBar button{flex:none;width:30px;height:30px;border-radius:9px;border:1px solid #ffffff2e;background:#ffffff14;color:#fff;font-size:14px;cursor:pointer}#pqSvBar button:hover:not(:disabled){background:#0ea5e9}#pqSvBar button:disabled{opacity:.3;cursor:default}" +
      "#pqSvBar .sb-t{min-width:0;display:flex;flex-direction:column;line-height:1.25;max-width:300px}#pqSvBar .sb-t b{color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#pqSvBar .sb-t span{font-weight:500;opacity:.75;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#pqSvBar select{flex:none;max-width:104px;background:#111827;color:#e6f1fb;border:1px solid #ffffff2e;border-radius:8px;padding:5px 4px;font:600 11px system-ui,sans-serif}" +
      "@media(max-width:520px){#pqSvBar{top:112px;gap:4px;padding:5px}#pqSvBar .sb-t{max-width:110px}#pqSvBar select{max-width:78px}}";
    document.head.appendChild(st);
    bar = document.createElement("div"); bar.id = "pqSvBar";
    bar.innerHTML = '<button data-n="p" title="Sebelumnya">&#9664;</button><div class="sb-t"><b></b><span></span></div><button data-n="n" title="Berikutnya">&#9654;</button>' +
      '<button data-n="f" title="Balik arah pandang">&#8644;</button><button data-n="r" title="Putar 90&deg;">&#8635;</button><select title="Koreksi kelas" style="display:none"></select>';
    bar.addEventListener("click", function (e) {
      e.stopPropagation(); var t = e.target.closest("button[data-n]"); if (!t || t.disabled) return;
      var s = S(); if (!s) return; var n = t.getAttribute("data-n"), h = curHeading();
      if (n === "f" || n === "r") { s.hd = ((h + (n === "f" ? 180 : 90)) % 360 + 360) % 360; try { renderStreetView(); } catch (x) { return; } lastSig = ""; refresh(); return; }
      var p = providerFor(s), d = n === "n" ? 1 : -1, ob = $(d > 0 ? "svNextBtn" : "svPrevBtn");
      if (p && p.can(d, h)) p.go(d, h); else if (ob && !ob.disabled) ob.click();   /* cadangan: tombol ◀ ▶ bawaan aplikasi (mis. Patok KM) */
      lastSig = "";
    });
    bar.addEventListener("click", function (e) {
      if (!e.target.closest(".sb-t")) return;
      var pt; try { pt = getSvPoint(); } catch (x) { pt = null; } if (!pt) return;
      var txt = pt.lat.toFixed(6) + ", " + pt.lng.toFixed(6);
      function ok() { try { if (typeof toast === "function") toast("Koordinat disalin: " + txt); } catch (x) { } }
      try { navigator.clipboard.writeText(txt).then(ok, function () { }); } catch (x) { }
    });
    bar.addEventListener("change", function (e) {
      var s = S(), p = s && s.bar; if (p && p.cls && e.target.tagName === "SELECT") { p.cls.set(e.target.value); lastSig = ""; refresh(); }
    });
    ["mousedown", "touchstart", "wheel", "dblclick"].forEach(function (ev) { bar.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    wrap.appendChild(bar);
    try { if (window.PQSvDock) window.PQSvDock.adopt(); } catch (e) { }   /* dock Street View memindahkan bilah ini ke baris tombol bawah */
    return bar;
  }
  function refresh() {
    var o = $("svOverlay"), s = S(), shown = !!(o && o.classList.contains("show") && s);
    if (!shown) { if (bar) bar.style.display = "none"; lastSig = ""; return; }
    var e; try { e = getSvPoint(); } catch (x) { e = null; } if (!e) { if (bar) bar.style.display = "none"; return; }
    var h = curHeading(), p = providerFor(s);
    var sig = [s.type, s.jembatanId, s.roadId, s.index, e.lat, e.lng, h, s.pqJbk, p && p.cls ? p.cls.val() : ""].join("|");
    if (sig === lastSig && bar && bar.style.display === "flex") return;
    lastSig = sig;
    if (!mk()) return;
    var title = e.isJembatan || e.isGeo ? e.label : (e.roadName || e.label), sub = p && p.sub ? p.sub(h) : (e.isJembatan || e.isGeo ? "" : e.label);
    if (!e.isJembatan && !e.isGeo && sub.indexOf(e.label) < 0) sub = e.label + " · " + sub;
    bar.querySelector(".sb-t b").textContent = title || "Street View";
    bar.querySelector(".sb-t span").textContent = (sub ? sub + " · " : "") + "hadap " + hName(h);
    var ob0 = $("svPrevBtn"), ob1 = $("svNextBtn");
    bar.querySelector('[data-n="p"]').disabled = !((p && p.can(-1, h)) || (ob0 && !ob0.disabled));
    bar.querySelector('[data-n="n"]').disabled = !((p && p.can(1, h)) || (ob1 && !ob1.disabled));
    bar.querySelector(".sb-t").title = "Ketuk untuk menyalin koordinat · " + e.lat.toFixed(6) + ", " + e.lng.toFixed(6);
    var sel = bar.querySelector("select");
    if (p && p.cls) {
      var cv = p.cls.val();
      if (sel.getAttribute("data-k") !== p.cls.opts.join("|")) { sel.innerHTML = p.cls.opts.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + "</option>"; }).join(""); sel.setAttribute("data-k", p.cls.opts.join("|")); }
      sel.value = cv; sel.style.display = "";
    } else sel.style.display = "none";
    bar.style.display = "flex";
  }
  setInterval(function () { try { refresh(); } catch (e) { } }, 350);
})();
