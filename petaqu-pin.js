/* PETAQU — Pilihan PIN kendaraan animasi rute (v1)
   Mengganti panah bawaan pada animasi rute dengan pin pilihan: motor, mobil, pesawat, roket, pelari,
   bajaj, UFO, kura-kura, dino, dll. (30+ pilihan, dikelompokkan). Pilihan diingat per perangkat.
   • Pin SVG (tampak atas) ikut berputar mengikuti arah jalan.
   • Pin emoji tetap tegak (tidak ikut terbalik saat peta berputar); ✈️ & 🚀 ikut arah.
   • "Acak" = pin berganti tiap animasi dimulai.
   Aman: hanya mengganti isi ikon marker (#routeVehicleInner) & menyesuaikan rotasinya setelah
   updateRouteAnimVisual(); tidak mengubah logika animasi, STA, kamera, atau Street View. */
(function () {
  "use strict";
  if (window.__pqPin) return; window.__pqPin = 1;

  var KEY = "pq_route_pin";
  function $(id) { return document.getElementById(id); }
  function ls(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function ss(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- SVG tampak atas (hidung menghadap atas, viewBox 32×32) ---------- */
  var SVG = {
    car: '<svg viewBox="0 0 32 32"><g fill="#0b1220"><rect x="4.2" y="6.5" width="3.6" height="6.5" rx="1.4"/><rect x="24.2" y="6.5" width="3.6" height="6.5" rx="1.4"/><rect x="4.2" y="19" width="3.6" height="6.5" rx="1.4"/><rect x="24.2" y="19" width="3.6" height="6.5" rx="1.4"/></g><rect x="8.5" y="2" width="15" height="28" rx="6.5" fill="#22d3ee" stroke="#0b1220" stroke-width="1.2"/><path d="M11.4 10.4Q16 8.2 20.6 10.4L19.6 14.4H12.4Z" fill="#0b1220" opacity=".88"/><rect x="12" y="15.8" width="8" height="6.4" rx="2" fill="#0e7490"/><path d="M12.2 24H19.8L19 26.4H13Z" fill="#0b1220" opacity=".88"/><circle cx="11.6" cy="4.6" r="1.3" fill="#fef08a"/><circle cx="20.4" cy="4.6" r="1.3" fill="#fef08a"/></svg>',
    moto: '<svg viewBox="0 0 32 32"><rect x="14.1" y="1.5" width="3.8" height="10" rx="1.9" fill="#0b1220"/><rect x="13.9" y="20.5" width="4.2" height="10" rx="2.1" fill="#0b1220"/><rect x="12.6" y="7" width="6.8" height="19" rx="3.4" fill="#fb923c" stroke="#0b1220" stroke-width="1.1"/><rect x="5.5" y="9.6" width="21" height="2.8" rx="1.4" fill="#e5e7eb" stroke="#0b1220" stroke-width=".9"/><circle cx="16" cy="17.5" r="4.3" fill="#fde68a" stroke="#0b1220" stroke-width="1.2"/><circle cx="16" cy="5.2" r="1.3" fill="#fef08a"/></svg>',
    plane: '<svg viewBox="0 0 32 32"><path d="M16 1.2C17.7 1.2 18.5 3.8 18.5 7L18.7 12 30 18.2V21.4L18.7 18.8 18.5 25 22.2 27.6V30.4L16 28.8 9.8 30.4V27.6L13.5 25 13.3 18.8 2 21.4V18.2L13.3 12 13.5 7C13.5 3.8 14.3 1.2 16 1.2Z" fill="#f8fafc" stroke="#0284c7" stroke-width="1.1" stroke-linejoin="round"/><ellipse cx="16" cy="6.5" rx="1.3" ry="2.2" fill="#38bdf8"/></svg>',
    rocket: '<svg viewBox="0 0 32 32"><path d="M12.4 21.5H19.6L16 31Z" fill="#fb923c"/><path d="M14 21.5H18L16 27Z" fill="#fde047"/><path d="M11 15 4.8 23.5 11 21.2ZM21 15 27.2 23.5 21 21.2Z" fill="#ef4444" stroke="#7f1d1d" stroke-width=".8" stroke-linejoin="round"/><path d="M16 1C21.2 6 22.4 13 21.2 21.5H10.8C9.6 13 10.8 6 16 1Z" fill="#f8fafc" stroke="#475569" stroke-width="1"/><circle cx="16" cy="11.5" r="3.1" fill="#38bdf8" stroke="#0b1220" stroke-width="1.1"/></svg>',
    heli: '<svg viewBox="0 0 32 32"><rect x="14.4" y="16" width="3.2" height="14" rx="1.6" fill="#64748b"/><rect x="11" y="27.4" width="10" height="2.6" rx="1.3" fill="#64748b"/><ellipse cx="16" cy="12" rx="5.6" ry="9" fill="#a78bfa" stroke="#0b1220" stroke-width="1.1"/><ellipse cx="16" cy="7.6" rx="3.4" ry="3.6" fill="#0b1220" opacity=".8"/><rect x="2" y="11" width="28" height="2" rx="1" fill="#e2e8f0" opacity=".9"/><rect x="15" y="2" width="2" height="20" rx="1" fill="#e2e8f0" opacity=".75"/></svg>',
    chevron: '<svg viewBox="0 0 32 32"><path d="M16 2 28 28 16 22 4 28Z" fill="#f472b6" stroke="#0b1220" stroke-width="1.3" stroke-linejoin="round"/><path d="M16 9 22.5 23 16 20 9.5 23Z" fill="#fff" opacity=".35"/></svg>'
  };

  /* ikon panah standar (sama dengan penanda bawaan: lingkaran cyan + segitiga gelap) */
  var ARROW = '<svg viewBox="0 0 32 32"><defs><linearGradient id="pqArrG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs><circle cx="16" cy="16" r="13" fill="url(#pqArrG)" stroke="#080b12" stroke-width="2"/><path d="M16 7.5 22 21H10Z" fill="#04121a"/></svg>';

  /* ---------- katalog pin ---------- */
  /* t: arrow = bawaan · svg = tampak atas (ikut arah) · emo = emoji (tegak) · emo + off = emoji yang ikut arah */
  var GROUPS = [
    ["Klasik", [
      { id: "arrow", n: "Standar", t: "arrow" },
      { id: "chevron", n: "Neon", t: "svg", s: "chevron" },
      { id: "random", n: "Acak", t: "random", e: "🎲" }
    ]],
    ["Darat", [
      { id: "moto", n: "Motor", t: "svg", s: "moto" },
      { id: "car", n: "Mobil", t: "svg", s: "car" },
      { id: "run", n: "Pelari", t: "emo", e: "🏃" },
      { id: "walk", n: "Jalan", t: "emo", e: "🚶" },
      { id: "bike", n: "Sepeda", t: "emo", e: "🚲" },
      { id: "scooter", n: "Skuter", t: "emo", e: "🛵" },
      { id: "bajaj", n: "Bajaj", t: "emo", e: "🛺" },
      { id: "bus", n: "Bus", t: "emo", e: "🚌" },
      { id: "truck", n: "Truk", t: "emo", e: "🚚" },
      { id: "tractor", n: "Traktor", t: "emo", e: "🚜" },
      { id: "racer", n: "Balap", t: "emo", e: "🏎️" },
      { id: "police", n: "Patroli", t: "emo", e: "🚓" },
      { id: "horse", n: "Kuda", t: "emo", e: "🐎" }
    ]],
    ["Udara & Luar Angkasa", [
      { id: "plane", n: "Pesawat", t: "svg", s: "plane" },
      { id: "rocket", n: "Roket", t: "svg", s: "rocket" },
      { id: "heli", n: "Heli", t: "svg", s: "heli" },
      { id: "jet", n: "Jet", t: "emo", e: "✈️", off: -45 },
      { id: "rocket2", n: "Roket 2", t: "emo", e: "🚀", off: -45 },
      { id: "ufo", n: "UFO", t: "emo", e: "🛸" },
      { id: "balloon", n: "Balon", t: "emo", e: "🎈" },
      { id: "sat", n: "Satelit", t: "emo", e: "🛰️" }
    ]],
    ["Seru & Lucu", [
      { id: "turtle", n: "Kura", t: "emo", e: "🐢" },
      { id: "rabbit", n: "Kelinci", t: "emo", e: "🐇" },
      { id: "dino", n: "Dino", t: "emo", e: "🦖" },
      { id: "dog", n: "Anjing", t: "emo", e: "🐕" },
      { id: "cat", n: "Kucing", t: "emo", e: "🐈" },
      { id: "bee", n: "Lebah", t: "emo", e: "🐝" },
      { id: "unicorn", n: "Unicorn", t: "emo", e: "🦄" },
      { id: "ghost", n: "Hantu", t: "emo", e: "👻" },
      { id: "robot", n: "Robot", t: "emo", e: "🤖" },
      { id: "fire", n: "Api", t: "emo", e: "🔥" },
      { id: "star", n: "Bintang", t: "emo", e: "⭐" },
      { id: "skate", n: "Skate", t: "emo", e: "🛹" }
    ]]
  ];
  var BY = {}, REAL = [];
  GROUPS.forEach(function (g) { g[1].forEach(function (p) { BY[p.id] = p; if (p.t !== "random" && p.t !== "arrow") REAL.push(p.id); }); });

  var sel = ls(KEY, "arrow"); if (!BY[sel]) sel = "arrow";

  /* ---------- CSS ---------- */
  (function () {
    if ($("pq-pin-css")) return;
    var c = document.createElement("style"); c.id = "pq-pin-css";
    c.textContent = [
      /* urutan tumpukan: glow di bawah, ikon pin di atas — lingkaran cyan bawaan tidak boleh menutupi pin kustom */
      ".route-vehicle .rv-glow{z-index:0}",
      ".route-vehicle .rv-core{z-index:2}",
      ".route-vehicle.pq-custom .rv-glow{display:none!important}",
      ".route-vehicle .rv-core.pq-svgpin{width:34px;height:34px;border-radius:0!important;background:none!important;box-shadow:none!important;filter:drop-shadow(0 2px 5px #000c) drop-shadow(0 0 6px #22d3ee80)}",
      ".route-vehicle .rv-core.pq-svgpin:before,.route-vehicle .rv-core.pq-svgpin:after,.route-vehicle .rv-core.pq-emo:before,.route-vehicle .rv-core.pq-emo:after{content:none!important}",
      "body.pq-scrubbing .route-vehicle .rv-core.pq-svgpin{box-shadow:none!important;background:none!important}",
      ".route-vehicle .rv-core.pq-svgpin svg{width:100%;height:100%;display:block}",
      ".route-vehicle .rv-core.pq-emo{width:32px;height:32px;background:#0b1220eb;box-shadow:0 0 0 2px #22d3ee,0 4px 14px #000a;font-size:19px;line-height:1}",
      ".route-vehicle .rv-core.pq-emo span{display:block;line-height:1;font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif}",
      "#pqPinBtn{font-size:15px;line-height:1;padding:0}#pqPinBtn svg{width:20px;height:20px;display:block}",
      "#pqPinBtn.active{background:var(--cyan);color:#04121a}",
      "#pqPinPop{position:absolute;right:0;bottom:calc(100% + 8px);z-index:5;display:none;width:min(318px,calc(100vw - 20px));max-height:min(320px,46vh);overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;padding:8px 10px 10px;border-radius:14px;background:#0b111cf7;border:1px solid var(--cyan-dim,#0e7490);box-shadow:0 14px 36px #000b;cursor:default;touch-action:pan-y}",
      "#pqPinPop.show{display:block}",
      "#pqPinPop h5{margin:8px 0 5px;font:800 9.5px var(--mono,monospace);letter-spacing:.9px;text-transform:uppercase;color:#7d92a8}#pqPinPop h5:first-child{margin-top:0}",
      "#pqPinPop .pq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:4px}",
      "#pqPinPop .pq-tile{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:5px 2px 4px;border-radius:10px;border:1px solid transparent;color:#9db3c9;font:700 9px system-ui,sans-serif;text-align:center;min-width:0}",
      "#pqPinPop .pq-tile:hover{background:#ffffff12;color:#fff}",
      "#pqPinPop .pq-tile.on{background:#22d3ee1f;border-color:#22d3ee;color:#e8fbff}",
      "#pqPinPop .pq-tile .pq-ic{height:26px;display:flex;align-items:center;justify-content:center;font-size:21px;line-height:1}",
      "#pqPinPop .pq-tile .pq-ic svg{width:26px;height:26px}",
      "#pqPinPop .pq-tile span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
    ].join("\n");
    document.head.appendChild(c);
  })();

  /* ---------- ikon (tombol & tile) ---------- */
  function iconHtml(p) {
    if (p.t === "svg") return SVG[p.s];
    if (p.t === "arrow") return ARROW;
    return p.e;
  }
  function pick(id) { return BY[id] || BY.arrow; }
  function randomId() { return REAL[Math.floor(Math.random() * REAL.length)]; }

  /* ---------- terapkan ke marker ---------- */
  function applyPin(t) {
    var id = sel;
    if (id === "random") { if (!t.dataset.rpin) t.dataset.rpin = randomId(); id = t.dataset.rpin; }
    var key = sel + "|" + id;
    if (t.dataset.pin === key) return pick(id);
    t.dataset.pin = key;
    var core = t.querySelector(".rv-core"); if (!core) return pick(id);
    var p = pick(id);
    t.classList.toggle("pq-custom", p.t !== "arrow");   /* pin kustom: sembunyikan glow bulat bawaan */
    if (p.t === "arrow") { core.className = "rv-core"; core.innerHTML = '<div class="rv-arrow"></div>'; }
    else if (p.t === "svg") { core.className = "rv-core pq-svgpin"; core.innerHTML = SVG[p.s]; }
    else { core.className = "rv-core pq-emo"; core.innerHTML = "<span>" + p.e + "</span>"; }
    return p;
  }
  function bearingMap() { try { return (typeof map !== "undefined" && map && map.getBearing) ? (map.getBearing() || 0) : 0; } catch (e) { return 0; } }
  function post() {
    var t = $("routeVehicleInner"); if (!t) return;
    var p = applyPin(t);
    if (!p || p.t === "arrow") return;
    var m = /rotate\(([-\d.]+)deg\)/.exec(t.style.transform || "");
    var x = m ? parseFloat(m[1]) : 0;
    if (p.t === "svg") t.style.transform = "rotate(" + x + "deg)";
    else if (p.off) t.style.transform = "rotate(" + (x + p.off) + "deg)";
    else t.style.transform = "rotate(" + (-bearingMap()) + "deg)";   /* tegak walau peta berputar */
  }

  function wrap() {
    var f = window.updateRouteAnimVisual;
    if (typeof f !== "function") return setTimeout(wrap, 500);
    if (f.__pqPin) return;
    var w = function () { var r = f.apply(this, arguments); try { post(); } catch (e) {} return r; };
    w.__pqPin = 1; window.updateRouteAnimVisual = w;
  }

  /* ---------- UI: tombol + panel pilihan ---------- */
  var btn = null, pop = null;
  function paintBtn() { if (btn) { btn.innerHTML = iconHtml(pick(sel === "random" ? "random" : sel)); btn.title = "Pin kendaraan: " + pick(sel).n; } }
  function mark() {
    if (!pop) return;
    Array.prototype.forEach.call(pop.querySelectorAll(".pq-tile"), function (b) { b.classList.toggle("on", b.getAttribute("data-id") === sel); });
  }
  function choose(id) {
    sel = id; ss(KEY, id); paintBtn(); mark();
    var t = $("routeVehicleInner"); if (t) {
      delete t.dataset.pin; delete t.dataset.rpin;
      try { if (typeof routeAnim !== "undefined" && routeAnim) window.updateRouteAnimVisual(); else post(); } catch (e) {}   /* hitung ulang rotasi dari arah asli */
    }
    pop.classList.remove("show"); btn.classList.remove("active");
  }
  function build() {
    var bar = $("routePlayerBar"); if (!bar) return setTimeout(build, 500);
    if ($("pqPinBtn")) return;
    btn = document.createElement("button"); btn.type = "button"; btn.id = "pqPinBtn"; btn.className = "rp-btn";
    pop = document.createElement("div"); pop.id = "pqPinPop";
    var h = "";
    GROUPS.forEach(function (g) {
      h += "<h5>" + g[0] + '</h5><div class="pq-grid">';
      g[1].forEach(function (p) { h += '<button type="button" class="pq-tile" data-id="' + p.id + '" title="' + p.n + '"><div class="pq-ic">' + iconHtml(p) + "</div><span>" + p.n + "</span></button>"; });
      h += "</div>";
    });
    pop.innerHTML = h;
    ["mousedown", "touchstart", "dblclick", "click", "wheel"].forEach(function (n) { pop.addEventListener(n, function (e) { e.stopPropagation(); }, { passive: true }); });
    pop.addEventListener("click", function (e) { var b = e.target.closest ? e.target.closest(".pq-tile") : null; if (b) choose(b.getAttribute("data-id")); });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var on = !pop.classList.contains("show");
      pop.classList.toggle("show", on); btn.classList.toggle("active", on);
      if (on) { mark(); var s = pop.querySelector(".pq-tile.on"); if (s && s.scrollIntoView) { try { s.scrollIntoView({ block: "nearest" }); } catch (x) {} } }
    });
    var stop = bar.querySelector(".rp-btn.danger");
    bar.insertBefore(btn, stop || null);
    bar.appendChild(pop);
    document.addEventListener("click", function (e) {
      if (pop.classList.contains("show") && !pop.contains(e.target) && !btn.contains(e.target)) { pop.classList.remove("show"); btn.classList.remove("active"); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && pop.classList.contains("show")) { pop.classList.remove("show"); btn.classList.remove("active"); } });
    paintBtn(); mark();
  }

  setTimeout(wrap, 1200);
  setTimeout(build, 900);
  window.PQPin = { set: choose, get: function () { return sel; }, list: GROUPS };
})();
