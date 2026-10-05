/* PETAQU — Warna Garis Adaptif (ikut Peta Dasar)
   Masalah: warna garis yang sama tidak selalu terbaca di semua peta dasar
   (mis. hijau-limau di atas peta terang, atau biru tua di atas peta gelap).

   Solusi:
   • Peta dasar dikelompokkan jadi 3 nada: Gelap · Terang · Satelit.
   • Tiap nada punya palet sendiri (terang/neon untuk gelap & satelit, pekat untuk terang).
   • Saat peta dasar diganti, warna garis otomatis menyesuaikan (bisa dimatikan).
   • Setiap warna bisa diubah manual — dan tersimpan PER NADA, jadi pilihan Anda untuk
     peta terang tidak merusak pilihan untuk peta satelit.
   • Halo (garis tepi) putih/gelap opsional supaya garis tetap tajam di atas citra apa pun.
   Kontrol ada di jendela "Peta Dasar" (tombol lapisan di toolbar peta). */
(function () {
  "use strict";
  if (window.__pqWarna) return;
  window.__pqWarna = 1;

  var KEY = "petaqu_warna_v1";
  var $ = function (id) { return document.getElementById(id); };

  /* kelompok garis yang bisa diwarnai */
  var G = [
    ["utara", "Lintas Utara"],
    ["tengah", "Lintas Tengah"],
    ["selatan", "Lintas Selatan"],
    ["tol", "Jalan Tol (operasi)"],
    ["kons", "Tol dalam konstruksi"],
    ["renc", "Rencana tol"],
    ["prov", "Jalan Provinsi (impor/vektor)"],
    ["survei", "Ruas tersurvei (data sendiri)"]
  ];
  var JN = { utara: 0, tengah: 1, selatan: 2 };      /* indeks Lintas di data Jalan Nasional */
  var TL = ["tol", "kons", "renc", "prov"];          /* kategori di petaqu-jalan.js */

  /* nada tiap peta dasar */
  var TONE_OF = {
    google_earth: "sat", google_hybrid: "sat", esri_satelit: "sat",
    peta_gelap: "dark", dark_canvas: "dark", google_night: "dark",
    google_maps: "light", topografi: "light", peta_terang: "light", osm: "light",
    peta_detail: "light", natgeo: "light", ocean: "light", light_canvas: "light",
    positron: "light", landscape: "light", clarity: "light"
  };

  /* palet per nada (otomatis) */
  var TONE = {
    dark:  { label: "Gelap",   utara: "#22d3ee", tengah: "#a3e635", selatan: "#f472b6", tol: "#fbbf24", kons: "#fb7185", renc: "#c4b5fd", prov: "#60a5fa", survei: "#e6edf5" },
    light: { label: "Terang",  utara: "#0e7490", tengah: "#4d7c0f", selatan: "#be185d", tol: "#c2410c", kons: "#b91c1c", renc: "#6d28d9", prov: "#1d4ed8", survei: "#111827" },
    sat:   { label: "Satelit", utara: "#00e5ff", tengah: "#c6ff00", selatan: "#ff4fa3", tol: "#ffb300", kons: "#ff4d4d", renc: "#d6b4ff", prov: "#4da3ff", survei: "#ffffff" }
  };

  /* palet tetap (mode manual) */
  var PRESET = {
    neon:    { label: "Neon",        c: TONE.dark },
    kontras: { label: "Kontras",     c: TONE.light },
    klasik:  { label: "Klasik",      c: { utara: "#22d3ee", tengah: "#a3e635", selatan: "#f472b6", tol: "#f59e0b", kons: "#ef4444", renc: "#a78bfa", prov: "#3b82f6", survei: null } },
    buta:    { label: "Buta warna",  c: { utara: "#0072b2", tengah: "#009e73", selatan: "#cc79a7", tol: "#e69f00", kons: "#d55e00", renc: "#56b4e9", prov: "#f0e442", survei: null } }
  };

  var st = { auto: true, preset: "neon", halo: "auto", survei: false, open: false, over: { dark: {}, light: {}, sat: {} }, manual: {}, sv: null };
  try {
    var sv = JSON.parse(localStorage.getItem(KEY) || "null");
    if (sv) Object.keys(st).forEach(function (k) { if (sv[k] !== undefined) st[k] = sv[k]; });
  } catch (e) {}
  ["dark", "light", "sat"].forEach(function (t) { st.over[t] = st.over[t] || {}; });
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  function baseId() { try { return typeof currentBaseId !== "undefined" ? currentBaseId : null; } catch (e) { return null; } }
  function toneOf(id) { return TONE_OF[id || baseId()] || "light"; }
  function baseLabel(id) {
    try { var b = BASEMAPS.filter(function (x) { return x.id === id; })[0]; return b ? b.label.replace(/\s*\(.*\)\s*$/, "") : id; } catch (e) { return id || "-"; }
  }

  /* palet efektif untuk satu nada (auto) atau palet manual */
  function palFor(t) {
    var base = st.auto ? TONE[t] : (PRESET[st.preset] || PRESET.klasik).c;
    var ov = st.auto ? (st.over[t] || {}) : (st.manual || {});
    var o = {};
    G.forEach(function (g) { o[g[0]] = ov[g[0]] || base[g[0]] || null; });
    return o;
  }
  function haloColor(t) {
    var m = st.halo;
    if (m === "white") return "255,255,255";
    if (m === "dark") return "0,0,0";
    if (m === "auto") return t === "light" ? "255,255,255" : t === "sat" ? "0,0,0" : null;
    return null;
  }

  /* ---------- terapkan ke peta ---------- */
  var haloStyle = document.createElement("style");
  haloStyle.id = "pqWarnaHalo";
  document.head.appendChild(haloStyle);
  function applyHalo(t) {
    var c = haloColor(t);
    haloStyle.textContent = c
      ? ".leaflet-pane>svg,.leaflet-pane>canvas{filter:drop-shadow(0 0 1.3px rgba(" + c + ",.95)) drop-shadow(0 0 1px rgba(" + c + ",.7))}" +
        "@media(pointer:coarse){.leaflet-pane>svg,.leaflet-pane>canvas{filter:drop-shadow(0 0 1.3px rgba(" + c + ",.95))}}"
      : "";
  }

  var lastSv = "", svTimer = 0;
  function applySurvei(P) {
    if (typeof globalDisplay === "undefined") return;
    var want = st.survei && P.survei ? P.survei : null, key = want || "off";
    if (key === lastSv) return;
    if (want) {
      if (!st.sv) st.sv = { on: !!globalDisplay.uniformColorOn, color: globalDisplay.uniformColor };
      globalDisplay.uniformColorOn = true;
      globalDisplay.uniformColor = want;
    } else if (st.sv) {
      globalDisplay.uniformColorOn = st.sv.on;
      globalDisplay.uniformColor = st.sv.color;
      st.sv = null;
    } else { lastSv = key; return; }
    lastSv = key; save();
    clearTimeout(svTimer);
    svTimer = setTimeout(function () {
      try {
        if (typeof saveDisplaySettings === "function") saveDisplaySettings();
        if (typeof renderDisplaySettingsUI === "function") renderDisplaySettingsUI();
        if (typeof renderAll === "function") renderAll();
      } catch (e) {}
    }, 250);
  }

  function apply() {
    var t = toneOf(), P = palFor(t);
    var jn = window.PQ_JN, tl = window.PQ_JALAN;
    if (jn) {
      Object.keys(JN).forEach(function (k) { if (jn.sat[JN[k]] && P[k]) jn.sat[JN[k]][1] = P[k]; });
      jn.recolor();
    }
    if (tl) {
      TL.forEach(function (k) { if (tl.CAT[k] && P[k]) tl.CAT[k].c = P[k]; });
      tl.recolor();
    }
    applyHalo(t);
    applySurvei(P);
    syncUI();
  }
  var timer = 0;
  function schedule() { clearTimeout(timer); timer = setTimeout(apply, 50); }

  /* ---------- ganti peta dasar ---------- */
  var lastId = null;
  function onBasemap(id) {
    lastId = id;
    if (!st.auto) { applyHalo(toneOf(id)); syncUI(); return; }
    apply();
    if (typeof toast === "function") toast("Warna garis disesuaikan: palet " + TONE[toneOf(id)].label);
  }
  function hook() {
    var orig = window.switchBasemap;
    if (typeof orig !== "function" || orig.__pqw) return !!(orig && orig.__pqw);
    var wrap = function (e) { var r = orig.apply(this, arguments); try { onBasemap(e); } catch (x) { console.warn("PQ warna", x); } return r; };
    wrap.__pqw = 1;
    window.switchBasemap = wrap;
    return true;
  }

  /* ---------- UI di jendela Peta Dasar ---------- */
  var CSS =
    "#basemapModal .basemap-modal{max-width:390px}" +
    "#pqwBox{margin:0 2px 12px;padding:10px 11px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,var(--panel-2),var(--panel))}" +
    "#pqwBox .pqw-head{display:flex;align-items:center;justify-content:space-between;gap:10px}" +
    "#pqwBox .pqw-ttl{display:flex;align-items:center;gap:8px;font:700 12.5px var(--display);letter-spacing:.3px;color:var(--text)}" +
    "#pqwBox .pqw-ttl i{color:var(--amber)}" +
    "#pqwBox .pqw-auto{display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;color:var(--text-dim);cursor:pointer;user-select:none}" +
    "#pqwBox .pqw-auto.on{color:var(--cyan)}" +
    "#pqwBox .pqw-info{margin:8px 0 8px;font-size:11.5px;line-height:1.5;color:var(--text-dim)}" +
    "#pqwBox .pqw-info b{color:var(--text)}" +
    "#pqwBox .pqw-prev{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}" +
    "#pqwBox .pqw-pv{border:1.5px solid var(--line);border-radius:9px;overflow:hidden;padding:0 0 5px;background:#0b1220;transition:.15s}" +
    "#pqwBox .pqw-pv.cur{border-color:var(--cyan);box-shadow:0 0 0 2px #22d3ee33}" +
    "#pqwBox .pqw-pv .bg{padding:7px 7px 4px;display:flex;flex-direction:column;gap:3px}" +
    "#pqwBox .pqw-pv .bg i{display:block;height:3px;border-radius:3px}" +
    "#pqwBox .pqw-pv .nm{font-size:10px;font-weight:700;text-align:center;margin-top:4px;color:#cfe0ef;text-shadow:0 1px 2px #000}" +
    "#pqwBox .pqw-pv[data-t=light] .nm{color:#1f2937;text-shadow:none}" +
    "#pqwBox .pqw-more{width:100%;margin-top:9px;background:transparent;border:1px dashed var(--line);color:var(--cyan);border-radius:9px;padding:7px;font:700 11.5px var(--mono);cursor:pointer}" +
    "#pqwBox .pqw-more:hover{border-color:var(--cyan)}" +
    "#pqwBox .pqw-more i{transition:transform .2s;margin-left:4px}" +
    "#pqwBox.open .pqw-more i{transform:rotate(180deg)}" +
    "#pqwBox .pqw-body{display:none;margin-top:10px}" +
    "#pqwBox.open .pqw-body{display:block}" +
    "#pqwBox .pqw-presets{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px}" +
    "#pqwBox .pqw-presets button{flex:1;min-width:70px;padding:6px 4px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--text-dim);font:700 11px var(--mono);cursor:pointer}" +
    "#pqwBox .pqw-presets button.on{border-color:var(--cyan);color:var(--cyan);background:#22d3ee1a}" +
    "#pqwBox .pqw-r{display:flex;align-items:center;gap:9px;padding:5px 2px;border-bottom:1px solid #ffffff0d}" +
    "#pqwBox .pqw-r i{width:26px;height:4px;border-radius:3px;background:var(--c);flex:none;box-shadow:0 0 6px var(--c)}" +
    "#pqwBox .pqw-r span{flex:1;font-size:11.5px;color:var(--text)}" +
    "#pqwBox input[type=color]{width:36px;height:26px;padding:0;border:1px solid var(--line);border-radius:6px;background:none;cursor:pointer;flex:none}" +
    "#pqwBox .pqw-line{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;font-size:11.5px;color:var(--text)}" +
    "#pqwBox select{width:auto;padding:5px 8px;font-size:11.5px;border-radius:7px}" +
    "#pqwBox .pqw-chk{display:flex;align-items:flex-start;gap:8px;margin-top:10px;font-size:11.5px;line-height:1.4;color:var(--text);cursor:pointer}" +
    "#pqwBox .pqw-chk input{width:auto;margin:2px 0 0;flex:none;accent-color:var(--cyan)}" +
    "#pqwBox .pqw-btns{display:flex;gap:8px;margin-top:11px}" +
    "#pqwBox .pqw-btns button{flex:1;padding:7px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--text);font:700 11.5px var(--mono);cursor:pointer}" +
    "#pqwBox .pqw-btns button:hover{border-color:var(--red);color:var(--red)}" +
    "#pqwBox .pqw-note{margin:9px 0 0;font-size:10.5px;line-height:1.5;color:var(--text-dim)}";

  var BG = { dark: "#0b1220", light: "#e8eef2", sat: "linear-gradient(135deg,#2c4631,#5b6a49 55%,#35495a)" };

  function buildUI() {
    var modal = document.querySelector("#basemapModal .modal");
    if (!modal || $("pqwBox")) return;
    var css = document.createElement("style");
    css.textContent = CSS;
    document.head.appendChild(css);

    var box = document.createElement("div");
    box.id = "pqwBox";
    box.innerHTML =
      '<div class="pqw-head"><div class="pqw-ttl"><i class="fa-solid fa-palette"></i><span>Warna Garis Peta</span></div>' +
      '<div class="pqw-auto" id="pqwAutoWrap" title="Warna garis menyesuaikan otomatis saat peta dasar diganti"><span>Otomatis</span><button type="button" class="road-toggle" id="pqwAuto" aria-label="Otomatis ikut peta dasar"></button></div></div>' +
      '<div class="pqw-info" id="pqwInfo"></div>' +
      '<div class="pqw-prev" id="pqwPrev"></div>' +
      '<button type="button" class="pqw-more" id="pqwMore"><span id="pqwMoreTxt">Atur warna</span><i class="fa-solid fa-chevron-down"></i></button>' +
      '<div class="pqw-body"><div class="pqw-presets" id="pqwPresets"></div><div id="pqwRows"></div>' +
      '<div class="pqw-line"><span>Halo garis (tepi agar tajam)</span><select id="pqwHalo"><option value="auto">Otomatis</option><option value="white">Putih</option><option value="dark">Gelap</option><option value="off">Mati</option></select></div>' +
      '<label class="pqw-chk"><input type="checkbox" id="pqwSv"><span>Ikut ke <b>ruas tersurvei</b> (data sendiri) — dipakai sebagai warna seragam; dikembalikan saat dimatikan.</span></label>' +
      '<div class="pqw-btns"><button type="button" id="pqwReset"><i class="fa-solid fa-rotate-left"></i> Reset palet ini</button></div>' +
      '<p class="pqw-note">Mode Otomatis: warna yang Anda ubah tersimpan khusus untuk nada peta dasar yang sedang aktif (Gelap / Terang / Satelit). Lapisan Provinsi dari Geoportal (WMS) berwarna dari server dan tidak bisa diganti.</p></div>';
    var title = modal.querySelector(".basemap-title");
    if (title && title.parentNode) title.parentNode.insertBefore(box, title.nextSibling);
    else modal.insertBefore(box, modal.firstChild);

    $("pqwAuto").onclick = function () { st.auto = !st.auto; save(); apply(); };
    $("pqwMore").onclick = function () { st.open = !st.open; save(); syncUI(); };
    $("pqwPresets").onclick = function (e) {
      var b = e.target.closest("button[data-p]"); if (!b) return;
      st.preset = b.getAttribute("data-p"); st.manual = {}; save(); apply();
    };
    $("pqwRows").addEventListener("input", function (e) {
      var k = e.target.getAttribute && e.target.getAttribute("data-k"); if (!k) return;
      if (st.auto) st.over[toneOf()][k] = e.target.value; else st.manual[k] = e.target.value;
      save(); schedule();
    });
    $("pqwHalo").onchange = function () { st.halo = this.value; save(); apply(); };
    $("pqwSv").onchange = function () { st.survei = this.checked; save(); apply(); };
    $("pqwReset").onclick = function () {
      if (st.auto) st.over[toneOf()] = {}; else st.manual = {};
      save(); apply();
    };
  }

  function lineHtml(P, t) {
    var h = haloColor(t), sh = h ? "box-shadow:0 0 2px rgba(" + h + ",.95);" : "";
    return ["utara", "tengah", "selatan", "tol", "kons", "renc", "prov"].map(function (k) {
      return '<i style="background:' + P[k] + ";" + sh + '"></i>';
    }).join("");
  }

  function syncUI() {
    var box = $("pqwBox"); if (!box) return;
    var t = toneOf(), id = baseId();
    box.classList.toggle("open", !!st.open);
    $("pqwMoreTxt").textContent = st.open ? "Sembunyikan" : "Atur warna";
    var a = $("pqwAuto"); a.classList.toggle("on", st.auto); $("pqwAutoWrap").classList.toggle("on", st.auto);
    $("pqwInfo").innerHTML = st.auto
      ? "Peta dasar: <b>" + baseLabel(id) + "</b> → palet <b>" + TONE[t].label + "</b>. Berubah sendiri saat peta dasar diganti."
      : "Mode manual: palet <b>" + PRESET[st.preset].label + "</b> — tidak berubah saat peta dasar diganti.";
    $("pqwPrev").innerHTML = ["dark", "light", "sat"].map(function (n) {
      return '<div class="pqw-pv' + (st.auto && n === t || !st.auto && n === t ? " cur" : "") + '" data-t="' + n + '"><div class="bg" style="background:' + BG[n] + '">' + lineHtml(palFor(n), n) + '</div><div class="nm">' + TONE[n].label + (n === t ? " ●" : "") + "</div></div>";
    }).join("");
    $("pqwPresets").style.display = st.auto ? "none" : "flex";
    $("pqwPresets").innerHTML = Object.keys(PRESET).map(function (k) {
      return '<button type="button" data-p="' + k + '" class="' + (k === st.preset ? "on" : "") + '">' + PRESET[k].label + "</button>";
    }).join("");
    var P = palFor(t), rows = $("pqwRows");
    if (!rows.firstChild) {
      rows.innerHTML = G.map(function (g) {
        return '<div class="pqw-r" data-r="' + g[0] + '"><i></i><span>' + g[1] + '</span><input type="color" data-k="' + g[0] + '"></div>';
      }).join("");
    }
    G.forEach(function (g) {
      var r = rows.querySelector('[data-r="' + g[0] + '"]'); if (!r) return;
      var col = P[g[0]] || "#ffffff";
      r.style.display = g[0] === "survei" && !st.survei ? "none" : "";
      r.firstChild.style.setProperty("--c", col);
      var inp = r.querySelector("input"); if (inp !== document.activeElement && inp.value !== col) inp.value = col;
    });
    $("pqwHalo").value = st.halo;
    $("pqwSv").checked = !!st.survei;
  }

  /* ---------- mulai ---------- */
  function mapReady() { try { return typeof map !== "undefined" && map && map.getPane; } catch (e) { return false; } }
  function boot() {
    buildUI(); hook(); syncUI();
    var n = 0, iv = setInterval(function () {
      n++; hook(); buildUI();
      if (window.PQ_JN && window.PQ_JALAN && mapReady()) { clearInterval(iv); lastId = baseId(); apply(); }
      else if (n > 60) { clearInterval(iv); lastId = baseId(); apply(); }
    }, 400);
    /* jaring pengaman: kalau peta dasar diganti lewat jalur lain */
    setInterval(function () { var id = baseId(); if (id && id !== lastId && lastId !== null) onBasemap(id); }, 1200);
  }
  window.PQ_WARNA = { apply: apply, state: st, tone: toneOf, palette: function () { return palFor(toneOf()); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
