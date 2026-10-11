/* PETAQU Cuaca Wilayah — cuaca SELURUH provinsi & kabupaten/kota Indonesia dalam satu peta (tambahan, tidak mengubah petaqu-cuaca.js)
   - Peta koroplet: ±507 kabupaten/kota (batas dari data-kabbatas.js) diwarnai menurut Kondisi / Hujan / Risiko 24 jam / Suhu / Angin.
   - Level: Otomatis (zoom jauh = provinsi, dekat = kabupaten/kota), Provinsi, atau Kabupaten/Kota. Filter 1 provinsi + pencarian nama.
   - Penggeser waktu 3 hari (per 3 jam) + animasi putar. Label peta anti-tumpuk (wilayah paling berisiko diutamakan).
   - Cerdas: ringkasan nasional, daftar peringatan (hujan lebat/petir/angin/panas) terurut risiko, dampak untuk pekerjaan jalan
            (aspal, beton, drone, lapangan), hari kerja efektif, jumlah ruas PETAQU di wilayah, salin ringkasan.
   - Sumber: ringkasan nasional = Open-Meteo (1 permintaan batch ±11 panggilan, cache 45 menit, tetap tampil dari cache saat offline).
             Detail kabupaten/kota otomatis ditingkatkan ke BMKG (desa terdekat dari pusat wilayah) bila terjangkau; tombol "Prakiraan BMKG desa"
             membuka panel BMKG lama. Provinsi = agregat kabupaten/kota-nya (hujan & angin memakai persentil-90, suhu rata-rata).
   - Peringatan di sini diturunkan dari prakiraan model, BUKAN peringatan dini resmi BMKG (lihat bmkg.go.id/peringatan-dini). */
(function () {
  "use strict";
  if (window.PETAQU_CUACA_WIL) return;

  /* ============================== util ============================== */
  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = (n, w) => String(n).padStart(w || 2, "0");
  const say = m => { try { toast(m, 3200); } catch (e) { console.log("[cuaca-wilayah]", m); } };
  const getMap = () => { try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) { } return window.map && window.map.addLayer ? window.map : null; };
  const LSP = "petaqu_cuacawil_pref", LSD = "petaqu_cuacawil_data_v1", TTL = 45 * 6e4, NSLOT = 25;
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const WX = () => (window.PETAQU_CUACA && window.PETAQU_CUACA._t) || null;
  const DAYN = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"], MONN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const tzName = off => off === 420 ? "WIB" : off === 480 ? "WITA" : off === 540 ? "WIT" : "GMT" + (off >= 0 ? "+" : "-") + Math.abs(off / 60);
  const COMPN = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];
  const compName = d => COMPN[Math.round((((d % 360) + 360) % 360) / 45) % 8];
  const ST = { go: ["✅", "Layak"], warn: ["⚠️", "Hati-hati"], stop: ["⛔", "Tunda"] };

  /* ---------- kondisi cuaca (kode WMO Open-Meteo) ---------- */
  const CLS = {
    clear: { t: "Cerah", lv: 0, e: "☀️", en: "🌙", c: "#fbbf24" }, fair: { t: "Cerah Berawan", lv: 0, e: "🌤️", en: "☁️", c: "#fcd34d" },
    cloudy: { t: "Berawan", lv: 0, e: "⛅", en: "☁️", c: "#94a3b8" }, overcast: { t: "Berawan Tebal", lv: 0, e: "☁️", en: "☁️", c: "#64748b" },
    fog: { t: "Kabut", lv: 0, e: "🌫️", en: "🌫️", c: "#a8a29e" },
    drizzle: { t: "Hujan Ringan", lv: 1, e: "🌦️", en: "🌧️", c: "#7dd3fc" }, rain: { t: "Hujan Sedang", lv: 2, e: "🌧️", en: "🌧️", c: "#38bdf8" },
    heavy: { t: "Hujan Lebat", lv: 3, e: "🌧️", en: "🌧️", c: "#6366f1" }, storm: { t: "Hujan Petir", lv: 4, e: "⛈️", en: "⛈️", c: "#e11d48" }
  };
  const ORDER = ["clear", "fair", "cloudy", "overcast", "fog", "drizzle", "rain", "heavy", "storm"];
  function wmo(c) {
    c = +c; if (c >= 95) return "storm"; if (c === 82 || c === 65 || c === 67) return "heavy"; if (c === 63 || c === 81 || c === 66) return "rain";
    if (c === 61 || c === 80 || (c >= 51 && c <= 57) || c === 71 || c === 73 || c === 75 || c === 77 || c === 85 || c === 86) return "drizzle";
    if (c === 45 || c === 48) return "fog"; if (c === 3) return "overcast"; if (c === 2) return "cloudy"; if (c === 1) return "fair"; return "clear";
  }
  /* kode model dikoreksi dengan curah hujan nyata 3 jam agar peta tidak "cerah" padahal hujan lebat */
  function clsOf(code, rain) {
    let k = wmo(code); const need = rain >= 20 ? "heavy" : rain >= 8 ? "rain" : rain >= 1 ? "drizzle" : null;
    if (need && CLS[k].lv < CLS[need].lv) k = need; return k;
  }

  /* ============================== wilayah ============================== */
  const zoneOff = pn => /^(Maluku|Papua)/.test(pn) ? 540 : /^(Bali|Nusa Tenggara|Kalimantan (Selatan|Timur|Utara)|Sulawesi|Gorontalo)/.test(pn) ? 480 : 420;
  function decode(str) {
    let i = 0, lat = 0, lng = 0; const out = [];
    while (i < str.length) {
      let b, s = 0, r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
      lat += (r & 1) ? ~(r >> 1) : (r >> 1); s = 0; r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
      lng += (r & 1) ? ~(r >> 1) : (r >> 1);
      out.push([lat / 1e5, lng / 1e5]);
    }
    return out;
  }
  function pip(lat, lng, ring) {
    let ins = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][1] * r[i][0]) - (r[i][1] * r[j][0]); return a / 2; }
  function centroid(r) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][1] * r[i][0] - r[i][1] * r[j][0]; a += f; cx += (r[j][1] + r[i][1]) * f; cy += (r[j][0] + r[i][0]) * f; }
    if (Math.abs(a) < 1e-12) return [r[0][0], r[0][1]];
    a *= 3; return [cy / a, cx / a];
  }
  const bboxOf = polys => { let a = 90, b = 180, c = -90, d = -180; polys.forEach(p => p.forEach(q => { if (q[0] < a) a = q[0]; if (q[0] > c) c = q[0]; if (q[1] < b) b = q[1]; if (q[1] > d) d = q[1]; })); return [a, b, c, d]; };

  let R = [], P = {}, PL = [], regionsReady = false, regP = null;
  function buildRegions(K) {
    R = []; P = {}; PL = [];
    Object.keys(K).sort().forEach(pn => {
      const prov = P[pn] = { name: pn, kids: [], off: zoneOff(pn), lat: 0, lng: 0, bb: null };
      K[pn].forEach(it => {
        const nm = it[0], polys = it[1].map(decode).filter(r => r.length > 2); if (!polys.length) return;
        let big = polys[0], ba = Math.abs(ringArea(big)); polys.forEach(p => { const a = Math.abs(ringArea(p)); if (a > ba) { ba = a; big = p; } });
        const bb = bboxOf(polys); let c = centroid(big);
        if (!pip(c[0], c[1], big)) { const m = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]; c = pip(m[0], m[1], big) ? m : big[Math.floor(big.length / 2)]; }
        const r = { i: R.length, prov: pn, full: nm, name: nm.replace(/^Kabupaten /, ""), label: nm.replace(/^Kabupaten /, "Kab. "), kota: /^Kota /.test(nm), polys, bb, lat: c[0], lng: c[1], off: prov.off };
        R.push(r); prov.kids.push(r);
      });
      if (!prov.kids.length) { delete P[pn]; return; }
      prov.lat = prov.kids.reduce((s, r) => s + r.lat, 0) / prov.kids.length; prov.lng = prov.kids.reduce((s, r) => s + r.lng, 0) / prov.kids.length;
      prov.bb = [Math.min(...prov.kids.map(r => r.bb[0])), Math.min(...prov.kids.map(r => r.bb[1])), Math.max(...prov.kids.map(r => r.bb[2])), Math.max(...prov.kids.map(r => r.bb[3]))];
      PL.push(prov);
    });
    regionsReady = true;
  }
  function loadRegions() {
    if (regionsReady) return Promise.resolve();
    if (regP) return regP;
    regP = new Promise((ok, no) => {
      const done = () => { try { buildRegions(window.PQ_KABBATAS); ok(); } catch (e) { no(e); } };
      if (window.PQ_KABBATAS) return done();
      const s = document.createElement("script"); s.src = "data-kabbatas.js"; s.async = true; s.onload = done; s.onerror = () => no(new Error("data-kabbatas.js tidak termuat")); document.head.appendChild(s);
    }).catch(e => { regP = null; throw e; });
    return regP;
  }
  function findRegion(lat, lng) {
    let best = null, ba = 1e9; /* batas disederhanakan bisa tumpang-tindih (kota kantong di dalam kabupaten): ambil yang terkecil */
    for (const r of R) { if (lat < r.bb[0] || lat > r.bb[2] || lng < r.bb[1] || lng > r.bb[3]) continue; const a = (r.bb[2] - r.bb[0]) * (r.bb[3] - r.bb[1]); if (a < ba && r.polys.some(p => pip(lat, lng, p))) { best = r; ba = a; } }
    return best;
  }

  /* ============================== data cuaca (Open-Meteo, batch) ============================== */
  const OM = "https://api.open-meteo.com/v1/forecast";
  const HV = "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m";
  let T = [], D = [], DATAT = 0, VC = {}, AG = {}, loading = null, progress = "";
  async function getJSON(url, ms) {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms || 20000);
    try { const r = await fetch(url, { signal: ac.signal, cache: "no-store" }); if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; } return await r.json(); } finally { clearTimeout(tm); }
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function chunkGet(ids) {
    const u = OM + "?latitude=" + ids.map(i => R[i].lat.toFixed(2)).join(",") + "&longitude=" + ids.map(i => R[i].lng.toFixed(2)).join(",") +
      "&hourly=" + HV + "&forecast_days=4&timezone=GMT&timeformat=unixtime&wind_speed_unit=kmh";
    let last = null;
    for (let a = 0; a < 3; a++) {
      try { const j = await getJSON(u, 25000); return Array.isArray(j) ? j : [j]; }
      catch (e) { last = e; await wait(a === 0 ? 700 : 2200); }
    }
    throw last;
  }
  const r1 = v => Math.round(v * 10) / 10;
  function parseOne(j, base) {
    const h = j && j.hourly; if (!h || !h.time || !h.time.length) return null;
    const out = [[], [], [], [], [], [], []], n = h.time.length, t0 = h.time[0];
    for (let k = 0; k < NSLOT; k++) {
      let ix = Math.round((base + 10800 * k - t0) / 3600); ix = clamp(ix, 0, n - 1);
      let rain = 0; for (let q = Math.max(0, ix - 2); q <= ix; q++) rain += +h.precipitation[q] || 0;
      out[0].push(r1(+h.temperature_2m[ix])); out[1].push(Math.round(+h.relative_humidity_2m[ix] || 0)); out[2].push(r1(rain));
      out[3].push(Math.round(+h.wind_speed_10m[ix] || 0)); out[4].push(Math.round(+h.wind_gusts_10m[ix] || 0)); out[5].push(Math.round(+h.wind_direction_10m[ix] || 0)); out[6].push(+h.weather_code[ix] || 0);
    }
    return out;
  }
  function setData(t, TT, dd) {
    /* buang slot yang sudah lewat > 1,5 jam */
    const cut = TT.findIndex(x => x >= Date.now() - 5400e3); if (cut < 0) return false;
    T = cut ? TT.slice(cut) : TT; D = dd.map(d => d ? d.map(a => cut ? a.slice(cut) : a) : null); DATAT = t; VC = {}; AG = {};
    return T.length > 4;
  }
  function loadCache() {
    const c = lsGet(LSD); if (!c || !c.T || !c.d || c.d.length !== R.length) return null;
    return c;
  }
  async function fetchAll(force) {
    if (loading) return loading;
    await loadRegions();
    if (!force && D.length === R.length && Date.now() - DATAT < TTL) return { stale: false };
    if (!force) { const c = loadCache(); if (c && Date.now() - c.t < TTL && setData(c.t, c.T, c.d)) return { stale: false, cached: true }; }
    loading = (async () => {
      const base = Math.floor((Date.now() - 1800e3) / 3600e3) * 3600, TT = [], dd = new Array(R.length).fill(null);
      for (let k = 0; k < NSLOT; k++) TT.push((base + 10800 * k) * 1000);
      const CH = 50, jobs = []; for (let i = 0; i < R.length; i += CH) jobs.push(Array.from({ length: Math.min(CH, R.length - i) }, (_, q) => i + q));
      let done = 0, fail = 0, p = 0, firstErr = null;
      const worker = async () => {
        while (p < jobs.length) {
          const ids = jobs[p++];
          try { const js = await chunkGet(ids); ids.forEach((id, q) => { dd[id] = parseOne(js[q], base); }); }
          catch (e) { fail++; firstErr = firstErr || e; }
          progress = "Memuat cuaca " + (++done) + "/" + jobs.length + " …"; uiProgress();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      const okN = dd.filter(Boolean).length;
      if (okN < R.length * 0.5) {
        const c = loadCache(); if (c && setData(c.t, c.T, c.d)) return { stale: true, err: firstErr };
        throw firstErr || new Error("tidak ada data");
      }
      setData(Date.now(), TT, dd); lsSet(LSD, { t: DATAT, T: TT, d: dd });
      return { stale: false, partial: fail > 0 };
    })();
    try { return await loading; } finally { loading = null; progress = ""; }
  }

  /* ============================== nilai per wilayah ============================== */
  const sumR = (a, k0, k1) => { let s = 0; for (let k = k0; k < Math.min(a.length, k1); k++) s += a[k] || 0; return s; };
  const lvOf = mm => mm >= 150 ? 4 : mm >= 100 ? 3 : mm >= 50 ? 2 : mm >= 20 ? 1 : 0;
  const isNight = (r, k) => { const h = new Date(T[k] + r.off * 6e4).getUTCHours(); return h < 6 || h >= 18; };
  function val(r, k) {
    const d = D[r.i]; if (!d) return null; const rain = d[2][k], cls = clsOf(d[6][k], rain), r24 = sumR(d[2], k, k + 8);
    return { r, temp: d[0][k], hum: d[1][k], rain, ws: d[3][k], gu: d[4][k], wd: d[5][k], cls, r24, lv: lvOf(r24), night: isNight(r, k), n: 1 };
  }
  function vals(k) { return VC[k] || (VC[k] = R.map(r => val(r, k))); }
  const pct = (arr, q) => { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[Math.floor(q * (a.length - 1))]; };
  function aggOf(list, name) {
    const v = list.filter(Boolean); if (!v.length) return null;
    const cnt = {}; v.forEach(x => (cnt[x.cls] = (cnt[x.cls] || 0) + 1));
    let cls = ORDER.slice().sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0))[0];
    ORDER.slice().reverse().some(k => { if (CLS[k].lv >= 3 && (cnt[k] || 0) / v.length >= .25) { cls = k; return true; } return false; });
    const rain = pct(v.map(x => x.rain), .9), r24 = pct(v.map(x => x.r24), .9);
    return { name, temp: r1(v.reduce((s, x) => s + x.temp, 0) / v.length), hum: Math.round(v.reduce((s, x) => s + x.hum, 0) / v.length), rain: r1(rain), ws: Math.round(pct(v.map(x => x.ws), .9)), gu: Math.round(pct(v.map(x => x.gu), .9)),
      wd: v[0].wd, cls, r24: Math.round(r24), lv: lvOf(r24), n: v.length, nWet: v.filter(x => x.rain >= .3 || CLS[x.cls].lv > 0).length, nHeavy: v.filter(x => CLS[x.cls].lv >= 3).length, nStorm: v.filter(x => x.cls === "storm").length, night: false };
  }
  function agg(k) {
    if (AG[k]) return AG[k];
    const V = vals(k), byProv = {}; PL.forEach(p => { byProv[p.name] = aggOf(p.kids.map(r => V[r.i]), p.name); });
    const nat = aggOf(V, "Indonesia"); return (AG[k] = { byProv, nat, V });
  }

  /* ============================== skala warna ============================== */
  const STOPS = {
    rain: [[0.1, "#bae6fd"], [1, "#38bdf8"], [3, "#2563eb"], [8, "#7c3aed"], [15, "#c026d3"], [30, "#e11d48"]],
    temp: [[-50, "#60a5fa"], [22, "#22d3ee"], [25, "#4ade80"], [28, "#facc15"], [31, "#fb923c"], [34, "#ef4444"], [37, "#991b1b"]],
    wind: [[0, "#86efac"], [12, "#bef264"], [20, "#facc15"], [30, "#fb923c"], [40, "#ef4444"], [60, "#7f1d1d"]]
  };
  const RISKC = ["#34d399", "#facc15", "#f59e0b", "#f43f5e", "#e11d48"], RISKT = ["Rendah", "Sedang", "Lebat", "Sangat lebat", "Ekstrem"];
  const LAYERS = [["cond", "Kondisi"], ["rain", "Hujan"], ["risk", "Risiko 24 jam"], ["temp", "Suhu"], ["wind", "Angin"]];
  const stopC = (st, v) => { let c = null; for (const s of st) if (v >= s[0]) c = s[1]; return c; };
  function colorOf(ly, v) {
    if (!v) return null;
    if (ly === "cond") return CLS[v.cls].c;
    if (ly === "rain") return stopC(STOPS.rain, v.rain);
    if (ly === "risk") return v.lv > 0 || v.r24 >= 5 ? RISKC[v.lv] : null;
    if (ly === "temp") return stopC(STOPS.temp, v.temp);
    return stopC(STOPS.wind, v.ws);
  }
  const labelOf = (ly, v) => ly === "rain" ? (v.rain >= .1 ? r1(v.rain) + " mm" : "0") : ly === "risk" ? (v.r24 < 1 ? "0 mm" : Math.round(v.r24) + " mm") : ly === "wind" ? v.ws + " km/j" : Math.round(v.temp) + "°";
  const emojiOf = v => (v.night ? CLS[v.cls].en : CLS[v.cls].e);
  const priority = v => v.lv * 100 + CLS[v.cls].lv * 20 + Math.min(40, v.rain) + v.ws / 4;

  /* ============================== state ============================== */
  const pref = Object.assign({ ly: "cond", lv: "auto", so: "warn" }, lsGet(LSP) || {});
  const S = { on: false, k: 0, play: 0, sel: null, filt: "", q: "", tok: 0, err: null, stale: false, min: false };
  let G = null, LG = null, SELG = null, card = null, started = false, rq = 0;
  const savePref = () => lsSet(LSP, pref);
  const effLevel = () => { if (pref.lv !== "auto") return pref.lv; const m = getMap(); return m && m.getZoom() <= 6 ? "prov" : "kab"; };

  /* ============================== peta ============================== */
  function ensureLayers() {
    const m = getMap(); if (!m || G) return !!G; if (!window.L) return false;
    m.createPane("pqwlPane"); const pn = m.getPane("pqwlPane"); pn.style.zIndex = 385; pn.style.pointerEvents = "none";
    const rd = L.canvas({ pane: "pqwlPane", padding: .3 }); G = L.layerGroup().addTo(m); LG = L.layerGroup().addTo(m); SELG = L.layerGroup().addTo(m);
    R.forEach(r => { r.poly = L.polygon(r.polys.map(p => [p]), { renderer: rd, interactive: false, stroke: true, weight: .6, color: "#e2e8f0", opacity: .35, fillOpacity: 0, fillColor: "#000", smoothFactor: 1.4 }); G.addLayer(r.poly); });
    m.on("moveend zoomend", softRefresh); m.on("click", onMapClick);
    return true;
  }
  function removeLayers() {
    const m = getMap(); if (!m || !G) return; m.off("moveend zoomend", softRefresh); m.off("click", onMapClick);
    m.removeLayer(G); m.removeLayer(LG); m.removeLayer(SELG); G = LG = SELG = null; R.forEach(r => { r.poly = null; });
    try { m.getPane("pqwlPane").remove(); delete m._panes.pqwlPane; } catch (e) { }
  }
  function restyle() {
    if (!G || !D.length) return; const A = agg(S.k), lev = effLevel(), ly = pref.ly;
    R.forEach(r => {
      const v = lev === "prov" ? A.byProv[r.prov] : A.V[r.i], c = colorOf(ly, v), dim = S.filt && S.filt !== r.prov;
      r.poly.setStyle({ fillColor: c || "#0b1220", fillOpacity: dim ? (c ? .07 : 0) : c ? (lev === "prov" ? .5 : .55) : 0, color: lev === "prov" && c ? c : "#e2e8f0", opacity: lev === "prov" ? .9 : (dim ? .12 : .4), weight: lev === "prov" ? .8 : .6 });
    });
  }
  function labelHtml(v, name, ly, big) {
    const c = colorOf(ly, v) || "#38bdf8", wind = ly === "wind" ? '<i style="display:inline-block;transform:rotate(' + Math.round(v.wd) + 'deg)">↓</i> ' : "";
    return '<div class="pqwl-lb' + (big ? " big" : "") + '" style="--c:' + c + '"><span>' + (ly === "wind" ? wind : emojiOf(v) + " ") + "<b>" + labelOf(ly, v) + "</b></span>" + (name ? "<small>" + esc(name) + "</small>" : "") + "</div>";
  }
  function drawLabels() {
    const m = getMap(); if (!m || !LG || !D.length) return; LG.clearLayers(); const A = agg(S.k), lev = effLevel(), ly = pref.ly, z = m.getZoom(), sz = m.getSize(), items = [];
    if (lev === "prov") PL.forEach(p => { const v = A.byProv[p.name]; if (v && (!S.filt || S.filt === p.name)) items.push({ v, lat: p.lat, lng: p.lng, name: p.name.replace("Kepulauan ", "Kep. "), t: "p", id: p.name }); });
    else {
      const b = m.getBounds().pad(.1);
      R.forEach(r => { if (S.filt && r.prov !== S.filt) return; if (!b.contains([r.lat, r.lng])) return; const v = A.V[r.i]; if (v) items.push({ v, lat: r.lat, lng: r.lng, name: r.name, t: "k", id: r.i }); });
    }
    items.sort((a, b) => priority(b.v) - priority(a.v));
    const gap = lev === "prov" ? 70 : z >= 9 ? 90 : z >= 8 ? 62 : 46, placed = [], big = z >= 8 || lev === "prov";
    items.forEach(it => {
      const p = m.latLngToContainerPoint([it.lat, it.lng]); if (p.x < -20 || p.y < -20 || p.x > sz.x + 20 || p.y > sz.y + 20) return;
      for (const q of placed) if (Math.abs(q.x - p.x) < gap && Math.abs(q.y - p.y) < (big ? 34 : 24)) return;
      if (placed.length > 220) return; placed.push(p);
      const mk = L.marker([it.lat, it.lng], { icon: L.divIcon({ className: "pqwl-ic", html: labelHtml(it.v, big ? it.name : "", ly, big), iconSize: [0, 0] }), keyboard: false, riseOnHover: true });
      mk.on("click", () => { select(it.t === "p" ? { t: "p", id: it.id } : { t: "k", id: it.id }); }); LG.addLayer(mk);
    });
  }
  function drawSel() {
    if (!SELG) return; SELG.clearLayers(); const s = S.sel; if (!s) return;
    const polys = s.t === "k" ? R[s.id].polys : P[s.id].kids.flatMap(r => r.polys);
    SELG.addLayer(L.polygon(polys.map(p => [p]), { interactive: false, fill: false, color: "#22d3ee", weight: 3, opacity: .95, dashArray: s.t === "p" ? "6 4" : null }));
  }
  function onMapClick(e) {
    if (!S.on || !R.length) return; const t = e.originalEvent && e.originalEvent.target;
    if (t && t.closest && t.closest(".pqwl-ic,#pqwlCard,.leaflet-control")) return;
    const r = findRegion(e.latlng.lat, e.latlng.lng); if (r) select({ t: "k", id: r.i });
  }
  function softRefresh() { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; if (!S.on) return; restyle(); drawLabels(); uiLegend(); uiSummary(); uiList(); }); }

  /* ============================== slot & ringkasan wilayah ============================== */
  function slotsOf(r) {
    const w = WX(), d = D[r.i]; if (!w || !d) return null;
    return T.map((t, k) => w.mkSlot({ t, src: "wmo", temp: d[0][k], hum: d[1][k], code: d[6][k], rain: d[2][k], ws: d[3][k] / 3.6, gust: d[4][k] / 3.6, wdir: d[5][k], vis: null }, r.lat, r.lng, r.off));
  }
  const nearIdx = (sl, t) => { let b = 0, bd = 1e18; sl.forEach((s, i) => { const x = Math.abs(s.t - t); if (x < bd) { bd = x; b = i; } }); return b; };
  function daily(sl, off) {
    const days = [], m = {};
    sl.forEach(s => { const lt = new Date(s.t + off * 6e4), dk = lt.getUTCFullYear() + "-" + pad(lt.getUTCMonth() + 1) + "-" + pad(lt.getUTCDate()); let d = m[dk]; if (!d) { d = m[dk] = { dk, dow: lt.getUTCDay(), dd: lt.getUTCDate(), mo: lt.getUTCMonth(), tmin: 99, tmax: -99, mm: 0, n: 0, wet: 0, worst: "clear", dry: 0, tot: 0 }; days.push(d); }
      d.tmin = Math.min(d.tmin, s.temp); d.tmax = Math.max(d.tmax, s.temp); d.mm += s.rain || 0; d.n++; const h = lt.getUTCHours();
      if (h >= 6 && h <= 15) { d.tot++; const wet = CLS[s.cls].lv > 0 || (s.rain || 0) >= .3; if (!wet) d.dry++; else d.wet++; if (CLS[s.cls].lv >= CLS[d.worst].lv && (CLS[s.cls].lv > 0 || d.worst === "clear")) d.worst = s.cls; } });
    return days.filter(d => d.n >= 3).slice(0, 4);
  }
  function countRoads(r) {
    let n = 0; try {
      const RR = typeof roads !== "undefined" ? roads : []; (RR || []).forEach(x => { const pts = x.points || []; if (!pts.length) return; const q = pts[pts.length >> 1]; if (q && isFinite(q.lat) && q.lat >= r.bb[0] && q.lat <= r.bb[2] && q.lng >= r.bb[1] && q.lng <= r.bb[3] && r.polys.some(p => pip(q.lat, q.lng, p))) n++; });
    } catch (e) { } return n;
  }

  /* ============================== pilih wilayah ============================== */
  function select(sel, noFly) {
    S.sel = sel; const my = ++S.tok; if (sel) { sel.bmkg = null; }
    const m = getMap();
    if (sel && m && !noFly) { const bb = sel.t === "k" ? R[sel.id].bb : P[sel.id].bb; try { m.flyToBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { maxZoom: sel.t === "k" ? 10 : 7, padding: [40, 40], duration: .9 }); } catch (e) { } }
    drawSel(); uiDetail();
    if (sel && sel.t === "k") {
      const r = R[sel.id], w = WX(); if (!w) return;
      Promise.resolve().then(() => w.resolveWeather(r.lat, r.lng, my, t => t === S.tok)).then(b => { if (b && my === S.tok && b.src === "bmkg") { S.sel.bmkg = b; uiDetail(); } }).catch(() => { });
    }
  }

  /* ============================== UI ============================== */
  const CSS = [
    "#pqwlCard{position:fixed;left:12px;top:164px;z-index:1270;width:min(372px,calc(100vw - 24px));max-height:calc(100dvh - 190px);display:none;flex-direction:column;border-radius:16px;background:#071a26f6;color:#e6f1f7;border:1px solid #22d3ee55;box-shadow:0 14px 40px #000a;font:13px system-ui,sans-serif;backdrop-filter:blur(8px)}",
    "#pqwlCard.open{display:flex;animation:pqwlIn .3s cubic-bezier(.2,.9,.3,1)}@keyframes pqwlIn{from{transform:translateX(-24px);opacity:0}}",
    "@media(max-width:860px){#pqwlCard{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:60dvh}#pqwlCard.open{animation-name:pqwlUp}@keyframes pqwlUp{from{transform:translateY(40px);opacity:0}}}",
    "body:has(.modal-overlay.show,#dashcam-modal:not(.hidden),#svOverlay.show,#arOverlay.show,#cmOverlay.show,#qrModal.show,#lightbox.show,#loginScreen:not(.hide),#welcomeSplash:not(.hide)) #pqwlCard{display:none!important}",
    "@media(max-width:860px){body:has(#sidebar.open) #pqwlCard{opacity:0!important;pointer-events:none!important}}",
    ".pqwl-h{display:flex;gap:8px;align-items:flex-start;padding:10px 12px 8px;border-bottom:1px solid #ffffff17}.pqwl-h .t{flex:1;min-width:0}.pqwl-h b{display:block;font-size:14.5px}.pqwl-h small{display:block;color:#9fb6c3;font-size:11px;margin-top:2px}",
    ".pqwl-x{border:0;background:#ffffff14;color:#cfe3ee;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:15px;flex:none}.pqwl-x:hover{background:#ffffff2a}",
    ".pqwl-b{overflow:auto;padding:8px 12px 12px;overscroll-behavior:contain}#pqwlCard.min .pqwl-b{display:none}",
    ".pqwl-sec{font:800 10px system-ui;letter-spacing:.7px;text-transform:uppercase;color:#67e8f9;margin:11px 0 5px;display:flex;justify-content:space-between;align-items:center}",
    ".pqwl-seg{display:flex;gap:4px;flex-wrap:wrap}.pqwl-seg button{border:1px solid #ffffff1f;background:#ffffff0d;color:#cfe3ee;border-radius:999px;padding:4px 10px;font:700 11.5px system-ui;cursor:pointer}.pqwl-seg button.on{background:#0e7490;border-color:#22d3ee;color:#fff}",
    ".pqwl-row{display:flex;gap:6px;margin-top:8px}.pqwl-row input,.pqwl-row select{flex:1;min-width:0;background:#0a2433;color:#e6f1f7;border:1px solid #ffffff22;border-radius:9px;padding:6px 8px;font:12.5px system-ui}",
    ".pqwl-tm{display:flex;align-items:center;gap:8px;margin-top:8px}.pqwl-tm button{border:0;border-radius:8px;background:#0e7490;color:#fff;padding:5px 10px;font:700 12px system-ui;cursor:pointer}.pqwl-tm button.s{background:#ffffff1a}.pqwl-tm input{flex:1;accent-color:#22d3ee;min-width:0}",
    "#pqwlTl{font:700 12px system-ui;color:#a5f3fc;margin-top:6px}",
    ".pqwl-lg{display:flex;align-items:center;gap:2px;margin-top:6px;flex-wrap:wrap}.pqwl-lg i{flex:1;min-width:26px;height:8px;border-radius:2px}.pqwl-lgl{display:flex;justify-content:space-between;color:#8fa6bd;font-size:10px;margin-top:2px}.pqwl-lgc{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:10.5px;color:#b6c8d4}.pqwl-lgc span:before{content:'';display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--c);margin-right:4px;vertical-align:-1px}",
    ".pqwl-sum{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}.pqwl-sum div{background:#ffffff0d;border-radius:10px;padding:6px 8px}.pqwl-sum span{display:block;color:#8fa6bd;font-size:10px;font-weight:700;text-transform:uppercase}.pqwl-sum b{font-size:15px}",
    ".pqwl-it{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:0;background:#ffffff08;color:inherit;border-radius:10px;padding:6px 8px;margin-bottom:4px;cursor:pointer;border-left:4px solid var(--c,#38bdf8)}.pqwl-it:hover{background:#ffffff14}.pqwl-it.sel{background:#0e74903a}",
    ".pqwl-it .e{font-size:20px}.pqwl-it .n{flex:1;min-width:0}.pqwl-it b{display:block;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pqwl-it small{display:block;color:#9fb6c3;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pqwl-it .v{font:800 12px system-ui;text-align:right;white-space:nowrap}",
    ".pqwl-hero{display:flex;align-items:center;gap:12px}.pqwl-hero .em{font-size:42px;line-height:1}.pqwl-hero .tp{font:800 36px/1 system-ui}.pqwl-hero .tp sup{font-size:15px}.pqwl-hero .ds{font-weight:700;font-size:14px}.pqwl-hero small{color:#9fb6c3;font-size:11px}",
    ".pqwl-m{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}.pqwl-m div{background:#ffffff0d;border-radius:10px;padding:6px 8px}.pqwl-m span{display:block;color:#8fa6bd;font-size:10px;font-weight:700;text-transform:uppercase}.pqwl-m b{font-size:13.5px}",
    ".pqwl-act{display:grid;grid-template-columns:1fr 1fr;gap:6px}.pqwl-act div{border-radius:10px;padding:6px 8px;border:1px solid #ffffff1a;background:#ffffff08}.pqwl-act b{display:block;font-size:12px}.pqwl-act small{display:block;color:#b6c8d4;font-size:10.5px;margin-top:2px}.pqwl-act .go{border-color:#34d39955;background:#34d3991a}.pqwl-act .warn{border-color:#facc1566;background:#facc151a}.pqwl-act .stop{border-color:#f43f5e77;background:#f43f5e22}",
    ".pqwl-days{display:flex;gap:6px}.pqwl-days div{flex:1;text-align:center;border-radius:10px;padding:6px 2px;background:#ffffff0d;font-size:11px}.pqwl-days b{display:block;font-size:12px}.pqwl-days .best{outline:2px solid #34d399aa}",
    ".pqwl-al{border-radius:9px;padding:6px 9px;margin-bottom:5px;font-size:12px;background:#f59e0b22;border-left:4px solid #f59e0b}.pqwl-al.l2{background:#f43f5e22;border-color:#f43f5e}.pqwl-al.l1{background:#facc1522;border-color:#facc15}.pqwl-al.l0{background:#34d3991a;border-color:#34d399}",
    ".pqwl-src{display:inline-block;font:800 9.5px system-ui;letter-spacing:.4px;padding:2px 7px;border-radius:8px;margin-top:4px}.pqwl-src.bmkg{background:#14532d;color:#86efac}.pqwl-src.om{background:#713f12;color:#fde68a}",
    ".pqwl-btn{border:0;border-radius:8px;background:#ffffff1a;color:#e6f1f7;padding:6px 10px;font:700 11.5px system-ui;cursor:pointer;margin:6px 6px 0 0}.pqwl-btn.p{background:#0e7490}",
    ".pqwl-ft{margin-top:10px;font-size:10.5px;color:#8fa6bd;line-height:1.45}.pqwl-err{padding:10px;color:#fca5a5}.pqwl-load{padding:14px 4px;color:#a5f3fc;font-weight:700}",
    ".pqwl-ic{background:none!important;border:0!important;overflow:visible!important}.pqwl-lb{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;text-align:center;cursor:pointer;color:#fff;font:800 11.5px/1.15 system-ui,sans-serif;padding:1px 5px 2px;border-radius:9px;background:#071a26d9;border:1.5px solid var(--c);text-shadow:0 1px 2px #000}",
    ".pqwl-lb small{display:block;font:700 9.5px system-ui;opacity:.92;max-width:96px;overflow:hidden;text-overflow:ellipsis}.pqwl-lb.big{font-size:12.5px;padding:2px 6px 3px}.pqwl-lb:hover{z-index:9999;transform:translate(-50%,-50%) scale(1.12)}"
  ].join("\n");

  function fmtTime(t) { const d = new Date(t), off = -d.getTimezoneOffset(); return DAYN[d.getDay()] + " " + d.getDate() + " " + MONN[d.getMonth()] + " · " + pad(d.getHours()) + "." + pad(d.getMinutes()) + " " + tzName(off); }
  function buildCard() {
    card = el("div"); card.id = "pqwlCard"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Cuaca seluruh Indonesia"); document.body.appendChild(card);
    card.innerHTML = '<div class="pqwl-h"><div class="t"><b>🇮🇩 Cuaca Seluruh Indonesia</b><small id="pqwlSub">Provinsi & kabupaten/kota</small></div><button class="pqwl-x" data-a="min" title="Ciutkan/lebarkan">▾</button><button class="pqwl-x" data-a="x" title="Tutup" aria-label="Tutup">✕</button></div>' +
      '<div class="pqwl-b"><div id="pqwlBody"></div></div>';
    card.addEventListener("click", onCard);
    card.addEventListener("input", e => { const id = e.target.id; if (id === "pqwlRg") { stopPlay(); setK(+e.target.value); } else if (id === "pqwlQ") { S.q = e.target.value; uiList(); } });
    card.addEventListener("change", e => { if (e.target.id === "pqwlPv") setFilter(e.target.value); });
    card.addEventListener("keydown", e => { if (e.target.id === "pqwlQ" && e.key === "Enter") { const f = listItems()[0]; if (f) select(f.sel); } });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && S.on && !document.querySelector("#pqwxCard.open")) close(); });
    renderShell();
  }
  function seg(items, cur, a) { return '<div class="pqwl-seg">' + items.map(i => '<button type="button" data-a="' + a + '" data-v="' + i[0] + '" class="' + (i[0] === cur ? "on" : "") + '">' + i[1] + "</button>").join("") + "</div>"; }
  function renderShell() {
    const b = $("pqwlBody"); if (!b) return;
    if (S.err && !D.length) { b.innerHTML = '<div class="pqwl-err">Gagal memuat cuaca (' + esc(S.err.message || S.err) + ').<br><button class="pqwl-btn p" data-a="retry">Coba lagi</button></div>'; return; }
    if (!D.length) { b.innerHTML = '<div class="pqwl-load" id="pqwlLoad">' + esc(progress || "Memuat batas wilayah…") + "</div>"; return; }
    b.innerHTML = '<div class="pqwl-sec">Tingkat wilayah</div>' + seg([["auto", "Otomatis"], ["prov", "Provinsi"], ["kab", "Kab/Kota"]], pref.lv, "lv") +
      '<div class="pqwl-sec">Lapisan peta</div>' + seg(LAYERS, pref.ly, "ly") + '<div id="pqwlLg"></div>' +
      '<div class="pqwl-row"><select id="pqwlPv" aria-label="Filter provinsi"><option value="">Semua provinsi</option>' + PL.map(p => '<option value="' + esc(p.name) + '"' + (S.filt === p.name ? " selected" : "") + ">" + esc(p.name) + "</option>").join("") + '</select></div>' +
      '<div class="pqwl-tm"><button data-a="play" id="pqwlPlay">▶ Putar</button><input id="pqwlRg" type="range" min="0" max="' + (T.length - 1) + '" value="' + S.k + '" aria-label="Waktu prakiraan"><button class="s" data-a="now">Sekarang</button></div><div id="pqwlTl"></div>' +
      '<div id="pqwlDet"></div><div class="pqwl-sec">Ringkasan nasional</div><div id="pqwlSum"></div>' +
      '<div class="pqwl-sec"><span>Daftar wilayah</span></div>' + seg([["warn", "Waspada"], ["rain", "Hujan"], ["hot", "Terpanas"], ["wind", "Terkencang"]], pref.so, "so") +
      '<div class="pqwl-row"><input id="pqwlQ" type="search" placeholder="Cari provinsi / kabupaten / kota…" value="' + esc(S.q) + '" autocomplete="off"></div><div id="pqwlList" style="margin-top:8px"></div>' +
      '<div class="pqwl-ft" id="pqwlFt"></div>';
    uiAll();
  }
  function uiProgress() { const e = $("pqwlLoad"); if (e) e.textContent = progress; }
  function uiAll() { uiLegend(); uiTime(); uiSummary(); uiList(); uiDetail(); uiFoot(); }
  function uiTime() {
    const e = $("pqwlTl"); if (!e || !T.length) return; const i = Math.round((T[S.k] - Date.now()) / 36e5);
    e.textContent = fmtTime(T[S.k]) + (S.k === 0 ? " · sekarang" : i > 0 ? " · +" + i + " jam" : ""); const rg = $("pqwlRg"); if (rg && +rg.value !== S.k) rg.value = S.k;
  }
  function uiLegend() {
    const e = $("pqwlLg"); if (!e) return; const ly = pref.ly; let h = "";
    const bar = (st, f, unit) => '<div class="pqwl-lg">' + st.map(s => '<i style="background:' + s[1] + '"></i>').join("") + '</div><div class="pqwl-lgl"><span>' + f(st[0][0]) + "</span><span>" + unit + "</span><span>" + f(st[st.length - 1][0]) + "+</span></div>";
    if (ly === "rain") h = bar(STOPS.rain, v => v, "mm per 3 jam"); else if (ly === "temp") h = bar(STOPS.temp.slice(1), v => v + "°", "suhu °C"); else if (ly === "wind") h = bar(STOPS.wind, v => v, "km/jam");
    else if (ly === "risk") h = '<div class="pqwl-lgc">' + RISKC.map((c, i) => '<span style="--c:' + c + '">' + RISKT[i] + "</span>").join("") + '</div><div class="pqwl-lgl"><span>Total hujan 24 jam dari waktu terpilih: &lt;20 · 20 · 50 · 100 · 150 mm</span></div>';
    else h = '<div class="pqwl-lgc">' + ["clear", "cloudy", "fog", "drizzle", "rain", "heavy", "storm"].map(k => '<span style="--c:' + CLS[k].c + '">' + CLS[k].t + "</span>").join("") + "</div>";
    e.innerHTML = h;
  }
  function natText(n) { return n ? n.nWet + " dari " + n.n + " wilayah hujan" : ""; }
  function uiSummary() {
    const e = $("pqwlSum"); if (!e || !D.length) return; const A = agg(S.k), V = A.V.filter(Boolean), n = A.nat; if (!n) return;
    const hot = V.reduce((a, v) => (!a || v.temp > a.temp ? v : a), null), wet = V.reduce((a, v) => (!a || v.rain > a.rain ? v : a), null), wind = V.reduce((a, v) => (!a || v.ws > a.ws ? v : a), null);
    const lv2 = V.filter(v => v.lv >= 2).length, st = V.filter(v => v.cls === "storm").length;
    e.innerHTML = '<div class="pqwl-sum"><div><span>Hujan</span><b>' + n.nWet + "/" + n.n + '</b></div><div><span>Lebat+</span><b>' + n.nHeavy + '</b></div><div><span>Petir</span><b>' + st + "</b></div></div>" +
      '<div class="pqwl-al' + (lv2 ? " l2" : " l0") + '" style="margin-top:6px">' + (lv2 ? "⚠️ " + lv2 + " kabupaten/kota berpotensi hujan lebat (≥50 mm dalam 24 jam dari waktu terpilih)" : "✅ Tidak ada wilayah dengan potensi hujan lebat 24 jam dari waktu terpilih") + "</div>" +
      '<div class="pqwl-ft" style="margin-top:4px">Terpanas: <b>' + esc(hot.r.name) + " " + Math.round(hot.temp) + "°</b> · Terhujan: <b>" + esc(wet.r.name) + " " + r1(wet.rain) + " mm</b> · Terkencang: <b>" + esc(wind.r.name) + " " + wind.ws + " km/j</b></div>";
  }
  function listItems() {
    const A = agg(S.k), lev = effLevel(), q = S.q.trim().toLowerCase(), out = [];
    const mk = (v, name, sub, sel) => ({ v, name, sub, sel });
    const addP = () => PL.forEach(p => { const v = A.byProv[p.name]; if (v && (!S.filt || S.filt === p.name || q)) out.push(mk(v, p.name, v.n + " kab/kota · " + natText(v), { t: "p", id: p.name })); });
    const addK = () => R.forEach(r => { const v = A.V[r.i]; if (!v) return; if (S.filt && r.prov !== S.filt && !q) return; out.push(mk(v, r.label, r.prov, { t: "k", id: r.i })); });
    if (q) { addP(); addK(); } else if (lev === "prov") addP(); else addK();
    let L2 = q ? out.filter(x => (x.name + " " + x.sub).toLowerCase().includes(q)) : out;
    const key = x => pref.so === "rain" ? x.v.rain * 10 + x.v.r24 / 100 : pref.so === "hot" ? x.v.temp : pref.so === "wind" ? x.v.ws + x.v.gu / 100 : priority(x.v) + x.v.r24 / 10;
    L2.sort((a, b) => key(b) - key(a)); return L2;
  }
  function uiList() {
    const e = $("pqwlList"); if (!e || !D.length) return; const L2 = listItems(), cap = S.q ? 40 : 12;
    const val2 = x => pref.so === "hot" ? Math.round(x.v.temp) + "°C" : pref.so === "wind" ? x.v.ws + " km/j" : pref.so === "rain" ? r1(x.v.rain) + " mm" : (x.v.r24 >= 1 ? Math.round(x.v.r24) + " mm/24j" : CLS[x.v.cls].t);
    e.innerHTML = L2.length ? L2.slice(0, cap).map((x, i) => { const sel = S.sel && S.sel.t === x.sel.t && S.sel.id === x.sel.id;
      return '<button type="button" class="pqwl-it' + (sel ? " sel" : "") + '" data-a="sel" data-t="' + x.sel.t + '" data-i="' + esc(x.sel.id) + '" style="--c:' + (pref.so === "warn" || pref.ly === "risk" ? RISKC[x.v.lv] : colorOf(pref.ly, x.v) || CLS[x.v.cls].c) + '"><span class="e">' + emojiOf(x.v) + '</span><span class="n"><b>' + esc(x.name) + "</b><small>" + esc(x.sub) + '</small></span><span class="v">' + val2(x) + "</span></button>"; }).join("") + (L2.length > cap ? '<div class="pqwl-ft">+' + (L2.length - cap) + " lainnya — ketik nama untuk mencari</div>" : "") : '<div class="pqwl-ft">Tidak ada wilayah yang cocok.</div>';
  }
  function uiFoot() {
    const e = $("pqwlFt"), s = $("pqwlSub"); if (!e) return; const age = Math.max(0, Math.round((Date.now() - DATAT) / 6e4));
    if (s) s.textContent = R.length + " kabupaten/kota · " + PL.length + " provinsi · diperbarui " + (age < 1 ? "baru saja" : age + " menit lalu");
    e.innerHTML = (S.stale ? '<div class="pqwl-al l1">Koneksi bermasalah — memakai data tersimpan (' + age + ' menit lalu).</div>' : "") +
      "Sumber ringkasan nasional: <b>Open-Meteo</b> (model global, titik pusat tiap wilayah). Detail kabupaten/kota ditingkatkan ke <b>BMKG</b> bila terjangkau. Provinsi = agregat kabupaten/kota (hujan & angin persentil-90, suhu rata-rata). Peringatan diturunkan dari prakiraan, bukan peringatan dini resmi BMKG." +
      '<br><button class="pqwl-btn" data-a="copyn">Salin ringkasan nasional</button><button class="pqwl-btn" data-a="refresh">Muat ulang data</button>';
  }
  function uiDetail() {
    const e = $("pqwlDet"); if (!e) return; const s = S.sel; if (!s || !D.length) { e.innerHTML = ""; return; }
    const A = agg(S.k), w = WX();
    if (s.t === "p") {
      const p = P[s.id], v = A.byProv[s.id]; if (!v) { e.innerHTML = ""; return; }
      const top = p.kids.map(r => A.V[r.i]).filter(Boolean).sort((a, b) => priority(b) - priority(a)).slice(0, 5);
      e.innerHTML = '<div class="pqwl-sec"><span>Provinsi terpilih</span></div><div class="pqwl-hero"><div class="em">' + emojiOf(v) + '</div><div><div class="tp">' + Math.round(v.temp) + "<sup>°C</sup></div></div><div><div class=\"ds\">" + esc(p.name) + "</div><small>" + CLS[v.cls].t + " · " + natText(v) + "</small></div></div>" +
        '<div class="pqwl-m"><div><span>Hujan p90</span><b>' + r1(v.rain) + ' mm</b></div><div><span>Risiko 24 j</span><b style="color:' + RISKC[v.lv] + '">' + RISKT[v.lv] + '</b></div><div><span>Angin p90</span><b>' + v.ws + " km/j</b></div></div>" +
        '<div class="pqwl-sec">Kabupaten/kota paling waspada</div>' + top.map(x => '<button type="button" class="pqwl-it" data-a="sel" data-t="k" data-i="' + x.r.i + '" style="--c:' + RISKC[x.lv] + '"><span class="e">' + emojiOf(x) + '</span><span class="n"><b>' + esc(x.r.label) + "</b><small>" + CLS[x.cls].t + '</small></span><span class="v">' + (x.r24 >= 1 ? Math.round(x.r24) + " mm/24j" : Math.round(x.temp) + "°C") + "</span></button>").join("") +
        '<button class="pqwl-btn" data-a="clr">Tutup pilihan</button><button class="pqwl-btn" data-a="copy">Salin ringkasan</button>';
      return;
    }
    const r = R[s.id], v = A.V[r.i]; if (!v) { e.innerHTML = '<div class="pqwl-err">Data wilayah ini belum tersedia.</div>'; return; }
    const b = s.bmkg, sl = b ? b.slots : slotsOf(r), off = b ? b.off : r.off, isB = !!b;
    let impact = "", dayH = "", alH = "";
    if (sl && w) {
      const i = nearIdx(sl, T[S.k]), j = w.judge(sl, i), al = w.alertsFor({ slots: sl }, nearIdx(sl, Date.now())), dy = daily(sl, off), best = dy.reduce((a, d) => (!a || d.dry > a.dry ? d : a), null);
      alH = al.length ? al.map(a => '<div class="pqwl-al l' + a.lv + '">⚠️ ' + esc(a.t) + "</div>").join("") : "";
      impact = '<div class="pqwl-sec">Dampak untuk pekerjaan jalan</div><div class="pqwl-act">' + j.map(a => '<div class="' + a.st[0] + '"><b>' + a.ic + " " + a.t + " · " + ST[a.st[0]][1] + "</b><small>" + esc(a.st[1]) + "</small></div>").join("") + "</div>";
      dayH = '<div class="pqwl-sec">Hari kerja efektif (06.00–15.00 lokal)</div><div class="pqwl-days">' + dy.map((d, q) => '<div class="' + (best && d === best && d.dry > 0 ? "best" : "") + '"><b>' + (q === 0 ? "Hari ini" : q === 1 ? "Besok" : DAYN[d.dow] + " " + d.dd) + "</b>" + CLS[d.worst].e + " " + d.dry + "/" + d.tot + " kering<br><small>" + Math.round(d.tmin) + "–" + Math.round(d.tmax) + "° · " + Math.round(d.mm) + " mm</small></div>").join("") + "</div>";
    }
    const nr = countRoads(r);
    e.innerHTML = '<div class="pqwl-sec"><span>Wilayah terpilih</span></div><div class="pqwl-hero"><div class="em">' + emojiOf(v) + '</div><div><div class="tp">' + Math.round(v.temp) + "<sup>°C</sup></div></div><div><div class=\"ds\">" + esc(r.label) + "</div><small>" + esc(r.prov) + " · " + CLS[v.cls].t + "</small></div></div>" +
      '<span class="pqwl-src ' + (isB ? "bmkg" : "om") + '">' + (isB ? "BMKG · desa " + esc(b.adm4) : "OPEN-METEO" + (WX() ? " · mencari BMKG…" : "")) + "</span>" +
      '<div class="pqwl-m"><div><span>Hujan 3 jam</span><b>' + r1(v.rain) + ' mm</b></div><div><span>Risiko 24 j</span><b style="color:' + RISKC[v.lv] + '">' + RISKT[v.lv] + " · " + Math.round(v.r24) + ' mm</b></div><div><span>Kelembapan</span><b>' + v.hum + '%</b></div><div><span>Angin ' + compName(v.wd) + "</span><b>" + v.ws + ' km/j</b></div><div><span>Embusan</span><b>' + v.gu + ' km/j</b></div><div><span>Ruas PETAQU</span><b>' + nr + "</b></div></div>" + alH + impact + dayH +
      '<button class="pqwl-btn p" data-a="bmkg">Prakiraan BMKG desa →</button><button class="pqwl-btn" data-a="copy">Salin ringkasan</button><button class="pqwl-btn" data-a="clr">Tutup pilihan</button>';
  }
  function summaryText(sel) {
    const A = agg(S.k), t = fmtTime(T[S.k]);
    if (!sel) { const n = A.nat, V = A.V.filter(Boolean), top = V.slice().sort((a, b) => priority(b) - priority(a)).slice(0, 5); return ["CUACA INDONESIA — " + t, natText(n) + ", lebat+ " + n.nHeavy + ", suhu rata-rata " + Math.round(n.temp) + "°C", "Paling waspada:"].concat(top.map(x => "• " + x.r.label + " (" + x.r.prov + "): " + CLS[x.cls].t + ", " + Math.round(x.r24) + " mm/24 jam, angin " + x.ws + " km/j")).concat(["Sumber: Open-Meteo & BMKG (PETAQU). Bukan peringatan dini resmi."]).join("\n"); }
    if (sel.t === "p") { const v = A.byProv[sel.id]; return "CUACA " + sel.id + " — " + t + "\n" + CLS[v.cls].t + ", " + Math.round(v.temp) + "°C, " + natText(v) + ", hujan 24 jam (p90) " + v.r24 + " mm, risiko " + RISKT[v.lv] + "\nSumber: Open-Meteo (agregat kab/kota) — PETAQU"; }
    const r = R[sel.id], v = A.V[r.i]; return "CUACA " + r.label + ", " + r.prov + " — " + t + "\n" + CLS[v.cls].t + ", " + Math.round(v.temp) + "°C, lembap " + v.hum + "%, angin " + v.ws + " km/j dari " + compName(v.wd) + ", hujan 3 jam " + r1(v.rain) + " mm\nHujan 24 jam: " + Math.round(v.r24) + " mm (risiko " + RISKT[v.lv] + ")\nSumber: " + (sel.bmkg ? "BMKG + " : "") + "Open-Meteo — PETAQU";
  }
  function copy(text) {
    (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => say("Ringkasan cuaca disalin"), () => { const ta = el("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); say("Ringkasan cuaca disalin"); } catch (e) { say("Gagal menyalin"); } ta.remove(); });
  }
  function onCard(e) {
    const a = e.target.closest("[data-a]"); if (!a) return; const k = a.dataset.a, v = a.dataset.v;
    if (k === "x") close(); else if (k === "min") { card.classList.toggle("min"); S.min = card.classList.contains("min"); }
    else if (k === "lv") { pref.lv = v; savePref(); renderShell(); applyAll(); }
    else if (k === "ly") { pref.ly = v; savePref(); applyAll(); card.querySelectorAll('[data-a="ly"]').forEach(b => b.classList.toggle("on", b.dataset.v === v)); }
    else if (k === "so") { pref.so = v; savePref(); card.querySelectorAll('[data-a="so"]').forEach(b => b.classList.toggle("on", b.dataset.v === v)); uiList(); }
    else if (k === "play") togglePlay(); else if (k === "now") { stopPlay(); setK(0); }
    else if (k === "sel") select(a.dataset.t === "p" ? { t: "p", id: a.dataset.i } : { t: "k", id: +a.dataset.i });
    else if (k === "clr") { S.sel = null; S.tok++; drawSel(); uiDetail(); uiList(); }
    else if (k === "bmkg" && S.sel && S.sel.t === "k" && window.PETAQU_CUACA) { const r = R[S.sel.id]; if (innerWidth <= 860) { card.classList.add("min"); } try { PETAQU_CUACA.open(r.lat, r.lng); } catch (er) { say("Panel BMKG belum siap"); } }
    else if (k === "copy") copy(summaryText(S.sel)); else if (k === "copyn") copy(summaryText(null));
    else if (k === "refresh" || k === "retry") { S.err = null; load(true); }
  }
  function setFilter(name) {
    S.filt = name || ""; if (S.filt) { const p = P[S.filt], m = getMap(); if (m && p) m.flyToBounds([[p.bb[0], p.bb[1]], [p.bb[2], p.bb[3]]], { padding: [30, 30], duration: .9 }); S.sel = { t: "p", id: S.filt }; S.tok++; } else if (S.sel && S.sel.t === "p") S.sel = null;
    drawSel(); applyAll(); uiDetail();
  }
  function setK(k) { S.k = clamp(k | 0, 0, T.length - 1); applyAll(); }
  function applyAll() { if (!D.length) return; restyle(); drawLabels(); uiTime(); uiLegend(); uiSummary(); uiList(); if (S.sel) uiDetail(); }
  function stopPlay() { if (S.play) { clearInterval(S.play); S.play = 0; const p = $("pqwlPlay"); p && (p.textContent = "▶ Putar"); } }
  function togglePlay() { if (S.play) return stopPlay(); const p = $("pqwlPlay"); p && (p.textContent = "⏸ Jeda"); S.play = setInterval(() => { if (!S.on || !T.length) return stopPlay(); setK((S.k + 1) % T.length); }, 900); }

  /* ============================== alur utama ============================== */
  async function load(force) {
    renderShell();
    try {
      await loadRegions(); if (!ensureLayers()) throw new Error("peta belum siap");
      const r = await fetchAll(force); S.stale = !!(r && r.stale); S.err = null;
      S.k = clamp(S.k, 0, T.length - 1); renderShell(); applyAll(); uiFoot();
    } catch (e) { S.err = e; if (!D.length) renderShell(); else { S.stale = true; uiFoot(); } say("Cuaca wilayah: " + (e.message || e)); }
  }
  function open(level) {
    const m = getMap(); if (!m) return say("Peta belum siap"); if (!started) init(); if (!card) return say("Panel belum siap");
    try { if (window.PETAQU_CUACA && PETAQU_CUACA.isOn()) PETAQU_CUACA.setOn(false); } catch (e) { }
    if (level === "prov" || level === "kab") { pref.lv = level; savePref(); }
    const was = S.on; S.on = true; card.classList.add("open"); card.classList.toggle("min", S.min);
    if (!was || !D.length) { if (G) { restyle(); drawLabels(); } load(false); } else { renderShell(); applyAll(); }
    if (level === "prov" && m.getZoom() > 6) m.flyTo([-2.5, 118], 5, { duration: .8 });
  }
  function close() {
    S.on = false; stopPlay(); S.tok++; if (card) { card.classList.remove("open"); } removeLayers(); S.sel = null; S.filt = ""; VC = {}; AG = {};
  }
  function init() {
    if (started) return true; if (!document.body) return false; started = true;
    if (!$("pqwlCss")) { const st = el("style"); st.id = "pqwlCss"; st.textContent = CSS; document.head.appendChild(st); }
    buildCard(); return true;
  }
  /* sambungkan ke menu folder "Cuaca Indonesia" yang sudah ada tanpa mengubah modulnya */
  function hook() {
    const C = window.PETAQU_CUACA; if (!C || C._wil) return !!(C && C._wil);
    const rows = C.rows, act = C.act; C._wil = true;
    C.rows = () => { let a = []; try { a = rows(); } catch (e) { } return a.concat([{ id: "wilp", name: "Cuaca seluruh provinsi", ic: "", c: "#22d3ee", on: S.on && effLevelSafe() === "prov" }, { id: "wilk", name: "Cuaca seluruh kabupaten/kota", ic: "", c: "#22d3ee", on: S.on && effLevelSafe() === "kab" }]); };
    C.act = id => { if (id === "wilp" || id === "wilk") { const lv = id === "wilp" ? "prov" : "kab"; if (S.on && pref.lv === lv) close(); else open(lv); } else act(id); };
    return true;
  }
  const effLevelSafe = () => { try { return effLevel(); } catch (e) { return pref.lv; } };
  window.PETAQU_CUACA_WIL = {
    isOn: () => S.on, open, close, toggle: () => (S.on ? close() : open()), select: (t, id) => select({ t, id }), refresh: () => load(true),
    _t: { buildRegions, decode, pip, findRegion, parseOne, setData, val, agg, colorOf, clsOf, lvOf, daily, listItems, R: () => R, P: () => P, T: () => T, D: () => D, state: S, pref, STOPS }
  };
  let tries = 0; const iv = setInterval(() => {
    const ok = init() && hook(); if (ok || ++tries > 120) clearInterval(iv);
    if (ok && !$("pqFolder") && window.PQ_DOCK && !window.PETAQU_CUACA_WIL._dock) { window.PETAQU_CUACA_WIL._dock = 1; setTimeout(() => { if ($("pqFolder")) return; try { const b = el("button", "", '<i class="fa-solid fa-earth-asia"></i>'); b.title = "Cuaca seluruh provinsi & kabupaten"; b.onclick = () => (S.on ? close() : open()); PQ_DOCK.adopt(b, "Cuaca seluruh provinsi & kabupaten"); } catch (e) { } }, 2800); }
  }, 500);
})();
