/* PETAQU Cuaca Indonesia — klik peta -> prakiraan BMKG per desa/kelurahan + animasi cuaca langsung di peta
   - Sumber utama : BMKG Data Terbuka (api.bmkg.go.id/publik/prakiraan-cuaca?adm4=KODE), prakiraan 3 hari per 3 jam.
                    Klik peta -> desa/kelurahan terdekat (indeks centroid data-adm4.js) -> kode adm4 BMKG.
   - Cadangan     : Open-Meteo (model global) bila BMKG tidak terjangkau; label sumber SELALU ditampilkan jujur.
   - Cerdas       : animasi sesuai kondisi (hujan/petir/kabut/siang-malam dari posisi matahari), penggeser waktu 3 hari,
                    penilaian dampak ke pekerjaan jalan (aspal, beton, drone, lapangan), jendela kerja kering,
                    risiko genangan/longsor, peringatan berbasis prakiraan, dan ruas/jembatan/paket terdekat.
   - Wajib        : BMKG dicantumkan sebagai sumber data (ditampilkan di panel). Batas BMKG 60 permintaan/menit/IP.
   Proxy opsional (jika browser memblokir CORS BMKG): window.PETAQU_CFG.cuacaProxy atau localStorage "petaqu_cuaca_proxy"
   = URL dasar yang menerima ?adm4=KODE (lihat bmkg-proxy-worker.js & PANDUAN-CUACA.md). */
(function () {
  "use strict";
  if (window.PETAQU_CUACA) return;

  /* ============================== util ============================== */
  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rad = d => d * Math.PI / 180;
  const say = m => { try { toast(m, 3200); } catch (e) { console.log("[cuaca]", m); } };
  const LS = "petaqu_cuaca_v1";
  const store = { get() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } }, set(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { } } };
  const getMap = () => { try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) { } return window.map && window.map.addLayer ? window.map : null; };
  const reduceMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  const distM = (a, b, c, d) => { const x = rad(d - b) * Math.cos(rad((a + c) / 2)), y = rad(c - a); return Math.sqrt(x * x + y * y) * 6371008.8; };
  const fmtKm = m => m < 950 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(m < 9950 ? 1 : 0).replace(".", ",") + " km";

  /* ============================== wilayah ============================== */
  const PROV = { 11: "Aceh", 12: "Sumatera Utara", 13: "Sumatera Barat", 14: "Riau", 15: "Jambi", 16: "Sumatera Selatan", 17: "Bengkulu", 18: "Lampung", 19: "Kep. Bangka Belitung", 21: "Kepulauan Riau", 31: "DKI Jakarta", 32: "Jawa Barat", 33: "Jawa Tengah", 34: "DI Yogyakarta", 35: "Jawa Timur", 36: "Banten", 51: "Bali", 52: "Nusa Tenggara Barat", 53: "Nusa Tenggara Timur", 61: "Kalimantan Barat", 62: "Kalimantan Tengah", 63: "Kalimantan Selatan", 64: "Kalimantan Timur", 65: "Kalimantan Utara", 71: "Sulawesi Utara", 72: "Sulawesi Tengah", 73: "Sulawesi Selatan", 74: "Sulawesi Tenggara", 75: "Gorontalo", 76: "Sulawesi Barat", 81: "Maluku", 82: "Maluku Utara", 91: "Papua", 92: "Papua Barat", 93: "Papua Selatan", 94: "Papua Tengah", 95: "Papua Pegunungan", 96: "Papua Barat Daya" };
  const inID = (lat, lng) => lat >= -11.6 && lat <= 6.4 && lng >= 94.4 && lng <= 141.6;

  let IDX = null, idxP = null;
  function buildIndex(d) {
    const raw = atob(d.b), N = d.n, u8 = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
    const I = { n: N, la0: d.la, lo0: d.lo, s: d.s, code: new Uint32Array(u8.buffer, 0, N), lat: new Uint16Array(u8.buffer, 4 * N, N), lng: new Uint16Array(u8.buffer, 6 * N, N), tp: u8.subarray(8 * N, 9 * N), head: new Int32Array(512 * 256).fill(-1), next: new Int32Array(N) };
    for (let i = 0; i < N; i++) {
      const gy = Math.floor(I.lat[i] / I.s * 10), gx = Math.floor(I.lng[i] / I.s * 10), k = gy * 512 + gx;
      I.next[i] = I.head[k]; I.head[k] = i;
    }
    return I;
  }
  const pad = (n, w) => String(n).padStart(w, "0");
  const codeStr = (I, i) => { const c = I.code[i]; return pad(c >>> 25, 2) + "." + pad((c >>> 18) & 127, 2) + "." + pad((c >>> 11) & 127, 2) + "." + I.tp[i] + pad(c & 1023, 3); };
  function loadIndex() {
    if (IDX) return Promise.resolve(IDX);
    if (idxP) return idxP;
    idxP = new Promise((res, rej) => {
      if (window.PQ_ADM4) return res(window.PQ_ADM4);
      const s = document.createElement("script"); s.src = "data-adm4.js"; s.async = true;
      s.onload = () => window.PQ_ADM4 ? res(window.PQ_ADM4) : rej(new Error("indeks desa kosong"));
      s.onerror = () => rej(new Error("data-adm4.js tidak termuat"));
      document.head.appendChild(s);
    }).then(d => (IDX = buildIndex(d))).catch(e => { idxP = null; throw e; });
    return idxP;
  }
  /* k desa terdekat (pencarian cincin pada grid 0,1 derajat). maxKm membatasi jangkauan. */
  function nearest(lat, lng, k, maxKm) {
    const I = IDX; if (!I) return [];
    const cl = Math.max(.2, Math.cos(rad(lat))), gy0 = Math.floor((lat - I.la0) * 10), gx0 = Math.floor((lng - I.lo0) * 10), out = [];
    const scan = (gx, gy) => {
      if (gx < 0 || gx >= 512 || gy < 0 || gy >= 256) return;
      for (let i = I.head[gy * 512 + gx]; i >= 0; i = I.next[i]) {
        const la = I.lat[i] / I.s + I.la0, lo = I.lng[i] / I.s + I.lo0, dx = (lo - lng) * cl * 111.32, dy = (la - lat) * 110.57;
        out.push({ i, la, lo, km: Math.sqrt(dx * dx + dy * dy) });
      }
    };
    const R = Math.ceil(maxKm / (11.05 * cl)) + 1;
    for (let r = 0; r <= R; r++) {
      if (r === 0) scan(gx0, gy0);
      else { for (let dx = -r; dx <= r; dx++) { scan(gx0 + dx, gy0 - r); scan(gx0 + dx, gy0 + r); } for (let dy = -r + 1; dy <= r - 1; dy++) { scan(gx0 - r, gy0 + dy); scan(gx0 + r, gy0 + dy); } }
      if (out.length >= k) { out.sort((a, b) => a.km - b.km); if (out[k - 1].km <= r * 11.05 * cl) break; }
    }
    out.sort((a, b) => a.km - b.km);
    return out.filter(o => o.km <= maxKm).slice(0, k).map(o => ({ code: codeStr(I, o.i), lat: o.la, lng: o.lo, km: o.km }));
  }

  /* ============================== matahari & bulan ============================== */
  function sunPos(lat, lng, tMs) {
    const n = tMs / 864e5 + 2440587.5 - 2451545.0, L = (280.46 + 0.9856474 * n) % 360, g = rad(357.528 + 0.9856003 * n),
      lam = rad(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)), eps = rad(23.439 - 4e-7 * n),
      dec = Math.asin(Math.sin(eps) * Math.sin(lam)), ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)),
      lst = rad(((18.697374558 + 24.06570982441908 * n) % 24) * 15 + lng); let ha = lst - ra; ha = Math.atan2(Math.sin(ha), Math.cos(ha));
    const la = rad(lat), el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
    return { elev: el * 180 / Math.PI, ha: ha * 180 / Math.PI };
  }
  const moonPhase = tMs => { const p = ((tMs / 864e5 + 2440587.5 - 2451550.1) / 29.530588853) % 1; return p < 0 ? p + 1 : p; };

  /* ============================== kondisi cuaca ============================== */
  /* id: kunci animasi | t: teks | lv: tingkat hujan 0-4 | e/en: emoji siang/malam */
  const CLS = {
    clear: { t: "Cerah", lv: 0, e: "☀️", en: "🌙" }, fair: { t: "Cerah Berawan", lv: 0, e: "🌤️", en: "☁️" },
    cloudy: { t: "Berawan", lv: 0, e: "⛅", en: "☁️" }, overcast: { t: "Berawan Tebal", lv: 0, e: "☁️", en: "☁️" },
    haze: { t: "Udara Kabur", lv: 0, e: "🌫️", en: "🌫️" }, smoke: { t: "Asap", lv: 0, e: "🌫️", en: "🌫️" }, fog: { t: "Kabut", lv: 0, e: "🌫️", en: "🌫️" },
    drizzle: { t: "Hujan Ringan", lv: 1, e: "🌦️", en: "🌧️" }, rain: { t: "Hujan Sedang", lv: 2, e: "🌧️", en: "🌧️" },
    heavy: { t: "Hujan Lebat", lv: 3, e: "🌧️", en: "🌧️" }, storm: { t: "Hujan Petir", lv: 4, e: "⛈️", en: "⛈️" }
  };
  function classify(desc, code, src) {
    if (src === "wmo") {
      const c = +code;
      if (c >= 95) return "storm"; if (c === 82 || c === 65 || c === 67) return "heavy"; if (c === 63 || c === 81 || c === 66) return "rain";
      if (c === 61 || c === 80 || (c >= 51 && c <= 57) || c === 71 || c === 73 || c === 75 || c === 77 || c === 85 || c === 86) return "drizzle";
      if (c === 45 || c === 48) return "fog"; if (c === 3) return "overcast"; if (c === 2) return "cloudy"; if (c === 1) return "fair"; return "clear";
    }
    const d = String(desc || "").toLowerCase();
    if (/petir/.test(d)) return "storm"; if (/lebat/.test(d)) return "heavy"; if (/sedang|lokal/.test(d)) return "rain"; if (/hujan|gerimis/.test(d)) return "drizzle";
    if (/kabut/.test(d)) return "fog"; if (/kabur/.test(d)) return "haze"; if (/asap/.test(d)) return "smoke"; if (/tebal/.test(d)) return "overcast";
    if (/cerah\s*berawan/.test(d)) return "fair"; if (/berawan/.test(d)) return "cloudy"; if (/cerah/.test(d)) return "clear";
    const c = +code; return c >= 95 ? "storm" : c >= 63 ? "heavy" : c >= 61 ? "rain" : c >= 60 ? "drizzle" : c === 45 ? "fog" : c === 5 ? "haze" : c === 10 ? "smoke" : c === 4 ? "overcast" : c === 3 ? "cloudy" : c >= 1 ? "fair" : "clear";
  }
  const COMP = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5, U: 0, T: 90, TL: 45, TG: 135, B: 270, BD: 225, BL: 315 };
  const COMPN = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];
  const compName = d => COMPN[Math.round((((d % 360) + 360) % 360) / 45) % 8];
  const DAYN = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"], MONN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const tzName = off => off === 420 ? "WIB" : off === 480 ? "WITA" : off === 540 ? "WIT" : "GMT" + (off >= 0 ? "+" : "-") + Math.abs(off / 60);

  function mkSlot(o, lat, lng, off) {
    const lt = new Date(o.t + off * 6e4), sp = sunPos(lat, lng, o.t);
    const s = Object.assign({ gust: null, rain: 0, cloud: null, vis: null }, o);
    s.cls = classify(o.desc, o.code, o.src);
    s.elev = sp.elev; s.ha = sp.ha; s.day = sp.elev > -.8;
    s.lh = lt.getUTCHours(); s.lm = lt.getUTCMinutes();
    s.dk = lt.getUTCFullYear() + "-" + pad(lt.getUTCMonth() + 1, 2) + "-" + pad(lt.getUTCDate(), 2);
    s.dow = lt.getUTCDay(); s.dd = lt.getUTCDate(); s.mo = lt.getUTCMonth();
    if (s.cloud == null) s.cloud = { clear: 8, fair: 30, cloudy: 62, overcast: 92, haze: 45, smoke: 50, fog: 85, drizzle: 85, rain: 90, heavy: 95, storm: 100 }[s.cls];
    return s;
  }

  /* ============================== pengambilan data ============================== */
  const BMKG = "https://api.bmkg.go.id/publik/prakiraan-cuaca";
  const cache = new Map(), TTL = 20 * 6e4;
  const proxyBase = () => { try { return (window.PETAQU_CFG && window.PETAQU_CFG.cuacaProxy) || localStorage.getItem("petaqu_cuaca_proxy") || ""; } catch (e) { return ""; } };
  async function getJSON(url, ms) {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms || 10000);
    try {
      const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
      if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
      return await r.json();
    } finally { clearTimeout(tm); }
  }
  const validB = j => j && j.lokasi && j.data && j.data[0] && Array.isArray(j.data[0].cuaca) && j.data[0].cuaca.length;
  const withQ = (base, code) => base + (base.indexOf("?") < 0 ? "?" : "&") + "adm4=" + encodeURIComponent(code);
  const direct = { blocked: false };
  /* urutan: langsung ke BMKG -> proxy milik sendiri (jika ada). Mengembalikan {json, via} atau melempar. */
  async function bmkgOne(code) {
    const c = cache.get(code); if (c && Date.now() - c.t < TTL) return { json: c.j, via: c.via, cached: true };
    const px = proxyBase(), tries = [];
    if (px && direct.blocked) tries.push(["proxy", withQ(px, code)]);
    tries.push(["langsung", withQ(BMKG, code)]);
    if (px && !direct.blocked) tries.push(["proxy", withQ(px, code)]);
    let last = null;
    for (const [via, url] of tries) {
      try { const j = await getJSON(url); if (!validB(j)) { const e = new Error("data kosong"); e.status = 404; throw e; } cache.set(code, { t: Date.now(), j, via }); return { json: j, via }; }
      catch (e) { last = e; if (via === "langsung" && !e.status) direct.blocked = true; if (e.status === 404 || e.status === 400) throw e; }
    }
    throw last || new Error("BMKG tidak terjangkau");
  }
  async function fetchBMKG(cands, lat, lng) {
    let err = null;
    for (const c of cands.slice(0, 3)) {
      try {
        const r = await bmkgOne(c.code), j = r.json, L = j.lokasi || {};
        const tzm = /^([+-])(\d\d)(\d\d)$/.exec(L.timezone || ""), off = tzm ? (tzm[1] === "-" ? -1 : 1) * (+tzm[2] * 60 + +tzm[3]) : 420;
        const slots = [];
        j.data[0].cuaca.forEach(day => (day || []).forEach(x => {
          const t = Date.parse(String(x.utc_datetime || x.datetime || "").replace(" ", "T").replace(/Z?$/, "Z")); if (isNaN(t)) return;
          const ws = +x.ws, wd = isFinite(+x.wd_deg) && x.wd_deg !== "" && x.wd_deg != null ? +x.wd_deg : (COMP[String(x.wd || "").toUpperCase()] != null ? COMP[String(x.wd).toUpperCase()] : 0);
          let vis = x.vs != null && isFinite(+x.vs) ? +x.vs / 1000 : (/(\d+(?:[.,]\d+)?)/.exec(x.vs_text || "") || [])[1]; vis = vis != null ? parseFloat(String(vis).replace(",", ".")) : null;
          slots.push(mkSlot({ t, src: "bmkg", temp: +x.t, hum: +x.hu, desc: x.weather_desc, code: x.weather, rain: x.tp != null && isFinite(+x.tp) ? +x.tp : 0, cloud: x.tcc != null && isFinite(+x.tcc) ? +x.tcc : null, ws: isFinite(ws) ? ws / 3.6 : 0, wdir: wd, vis }, lat, lng, off));
        }));
        slots.sort((a, b) => a.t - b.t);
        const seen = new Set(), u = slots.filter(s => !seen.has(s.t) && seen.add(s.t));
        if (!u.length) throw Object.assign(new Error("slot kosong"), { status: 404 });
        return { src: "bmkg", via: r.via, cached: !!r.cached, off, slots: u, adm4: c.code, ptLat: +L.lat || c.lat, ptLng: +L.lon || c.lng, distKm: c.km, loc: { desa: L.desa, kec: L.kecamatan, kab: L.kotkab, prov: L.provinsi }, issued: (j.data[0].analysis_date || (j.cuaca && "")) || null };
      } catch (e) { err = e; if (!(e.status === 404 || e.status === 400)) throw e; }
    }
    throw err || new Error("tidak ada desa berdekatan");
  }
  async function fetchOM(lat, lng) {
    const u = "https://api.open-meteo.com/v1/forecast?latitude=" + lat.toFixed(4) + "&longitude=" + lng.toFixed(4) +
      "&hourly=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&wind_speed_unit=ms&timezone=auto&timeformat=unixtime&forecast_days=4";
    const j = await getJSON(u, 12000), h = j && j.hourly; if (!h || !h.time) throw new Error("Open-Meteo kosong");
    const off = Math.round((j.utc_offset_seconds || 0) / 60), slots = [];
    for (let i = 0; i < h.time.length; i++) {
      const t = h.time[i] * 1000, lh = new Date(t + off * 6e4).getUTCHours(); if (lh % 3) continue;
      let r3 = 0; for (let k = Math.max(0, i - 2); k <= i; k++) r3 += +h.precipitation[k] || 0;
      slots.push(mkSlot({ t, src: "wmo", temp: h.temperature_2m[i], hum: h.relative_humidity_2m[i], code: h.weather_code[i], rain: Math.round(r3 * 10) / 10, cloud: h.cloud_cover[i], ws: h.wind_speed_10m[i], gust: h.wind_gusts_10m[i], wdir: h.wind_direction_10m[i], vis: h.visibility[i] != null ? h.visibility[i] / 1000 : null }, lat, lng, off));
    }
    if (!slots.length) throw new Error("Open-Meteo tanpa data");
    return { src: "openmeteo", via: "langsung", off, slots, adm4: null, ptLat: j.latitude, ptLng: j.longitude, distKm: 0, loc: {}, issued: null };
  }
  /* satu pintu: BMKG (jika di Indonesia) -> Open-Meteo. diag mencatat alasan cadangan dipakai. */
  async function resolveWeather(lat, lng, tok, isCur) {
    const diag = []; let near = null;
    if (inID(lat, lng)) {
      try {
        await loadIndex(); if (!isCur(tok)) return null;
        const c = nearest(lat, lng, 3, 80); near = c.length ? c[0].code : null;
        if (!c.length) diag.push("tidak ada desa dalam 80 km (laut/pedalaman)");
        else { const b = await fetchBMKG(c, lat, lng); b.diag = diag; return b; }
      } catch (e) { diag.push("BMKG: " + (e.message || e) + (direct.blocked ? " (kemungkinan diblokir CORS)" : "")); }
    } else diag.push("di luar wilayah Indonesia");
    if (!isCur(tok)) return null;
    const b = await fetchOM(lat, lng); b.diag = diag; b.near = near; return b;
  }
  const curIndex = (slots, now) => { let k = 0; for (let i = 0; i < slots.length; i++) if (slots[i].t <= now) k = i; return k; };

  /* ============================== ANIMASI CUACA (kanvas 2D) ============================== */
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgba = (c, a) => "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + (a == null ? 1 : +a.toFixed(3)) + ")";
  const SKY = { cT: [36, 126, 226], cB: [152, 213, 255], gT: [112, 134, 156], gB: [188, 201, 214], dT: [38, 48, 62], dB: [92, 104, 120], fT: [176, 188, 194], fB: [222, 227, 228], sT: [150, 118, 90], sB: [210, 180, 146], nT: [4, 9, 26], nB: [20, 36, 72], ngT: [22, 28, 40], ngB: [44, 54, 72], twT: [58, 64, 120], twB: [252, 158, 108] };
  const CLOUD_N = { clear: 0, fair: 3, cloudy: 6, overcast: 9, haze: 3, smoke: 4, fog: 3, drizzle: 8, rain: 9, heavy: 10, storm: 11 };
  const CLOUD_V = [[[.18, .66, .18], [.34, .5, .24], [.55, .42, .28], [.76, .55, .22], [.5, .66, .26], [.3, .72, .17], [.7, .72, .17]],
  [[.14, .68, .16], [.3, .56, .2], [.46, .44, .25], [.64, .5, .24], [.82, .64, .17], [.5, .7, .22], [.7, .7, .16]],
  [[.2, .64, .2], [.4, .46, .26], [.6, .52, .27], [.8, .62, .19], [.45, .7, .22], [.68, .72, .18]]];
  const sprites = {};
  function cloudSprite(v, dk, nt) {
    const key = v + ":" + dk + ":" + nt; if (sprites[key]) return sprites[key];
    const w = 180, h = 90, cv = document.createElement("canvas"); cv.width = w; cv.height = h; const g = cv.getContext("2d");
    let base = mixc([252, 253, 255], [84, 94, 108], dk / 4); const n = nt / 2;
    base = [base[0] * lerp(1, .26, n) + 8 * n, base[1] * lerp(1, .29, n) + 12 * n, base[2] * lerp(1, .44, n) + 30 * n];
    const shade = [base[0] * .8, base[1] * .82, base[2] * .88];
    [[shade, 6], [base, 0]].forEach(([c, dy]) => CLOUD_V[v].forEach(([x, y, r]) => {
      const cx = x * w, cy = y * h + dy, rr = r * h * 1.15, gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gr.addColorStop(0, rgba(c, .96)); gr.addColorStop(.6, rgba(c, .7)); gr.addColorStop(1, rgba(c, 0)); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rr, 0, 6.2832); g.fill();
    }));
    return (sprites[key] = cv);
  }
  function Scene(canvas, size) {
    const ctx = canvas.getContext("2d"); let W = size, H = size, gy = H * .79, dpr = 1;
    const cur = { elev: 40, ha: 0, gray: 0, dark: 0, rain: 0, fog: 0, smoke: 0, wind: 2, ex: 0, cloudN: 0, wet: 0 };
    const tg = Object.assign({}, cur); let cls = "clear", moonP = .5, raf = 0, last = 0, tt = 0, flash = 0, bolt = null, nb = 2.5, road = 0, light = 0;
    const rain = [], spl = [], stars = [], mist = [], streak = [], clouds = [], rm = reduceMotion();
    const rnd = Math.random;
    for (let i = 0; i < 48; i++) stars.push({ x: rnd() * W, y: rnd() * gy * .72, r: .5 + rnd() * 1.1, p: rnd() * 6.28 });
    for (let i = 0; i < 8; i++) mist.push({ x: rnd() * W, y: gy * (.35 + rnd() * .6), rx: 70 + rnd() * 70, ry: 14 + rnd() * 16, v: .6 + rnd() });
    for (let i = 0; i < 26; i++) streak.push({ x: rnd() * W, y: rnd() * gy, l: 16 + rnd() * 30, v: .7 + rnd() * .6 });
    for (let i = 0; i < 11; i++) clouds.push({ x: rnd() * W * 1.2 - W * .1, y: .06 + rnd() * .5, s: .55 + rnd() * .75, v: .6 + rnd() * .8, vr: i % 3, a: 0, o: .75 + rnd() * .25 });
    const newDrop = init => ({ x: rnd() * (W + 60) - 30, y: init ? rnd() * gy : -10 - rnd() * 40, v: 430 + rnd() * 330, l: 7 + rnd() * 9, land: gy + 6 + rnd() * (H - gy - 12), a: .28 + rnd() * .4 });
    function resize(s) {
      W = H = s || W; gy = H * .79; dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + "px"; canvas.style.height = H + "px";
    }
    function set(s) {
      cls = s.cls; const lv = CLS[cls].lv, c = clamp((s.cloud == null ? 50 : s.cloud) / 100, 0, 1);
      tg.elev = s.elev; tg.ha = s.ha; moonP = moonPhase(s.t);
      tg.gray = clamp(({ clear: 0, fair: .18, cloudy: .52, overcast: .86, haze: .35, smoke: .45, fog: .6 }[cls] != null ? { clear: 0, fair: .18, cloudy: .52, overcast: .86, haze: .35, smoke: .45, fog: .6 }[cls] : .9) * .75 + c * .25, 0, 1);
      tg.dark = [0, .26, .5, .76, 1][lv] + (cls === "overcast" ? .1 : 0);
      tg.rain = [0, .2, .5, .85, 1][lv] * (lv ? .85 + clamp((s.rain || 0) / 14, 0, .35) : 0);
      tg.fog = cls === "fog" ? 1 : cls === "haze" ? .42 : 0; tg.smoke = cls === "smoke" ? 1 : 0;
      tg.wind = s.ws || 0; tg.ex = -Math.sin(rad(s.wdir || 0)); tg.cloudN = CLOUD_N[cls]; tg.wet = lv ? clamp(.35 + lv * .22, 0, 1) : 0;
    }
    function snap() { Object.keys(tg).forEach(k => (cur[k] = tg[k])); clouds.forEach((c, i) => (c.a = i < Math.round(cur.cloudN) ? 1 : 0)); const n = Math.round(cur.rain * 230 * (rm ? .5 : 1)); while (rain.length < n) rain.push(newDrop(true)); }
    function bolt1() {
      const pts = [], x0 = W * (.25 + rnd() * .5); let x = x0, y = H * .2; pts.push([x, y]);
      while (y < gy) { y += 14 + rnd() * 18; x += (rnd() - .5) * 34; pts.push([x, Math.min(y, gy)]); } return pts;
    }
    function skyColors() {
      const dT = mixc(mixc(SKY.cT, SKY.gT, cur.gray), SKY.dT, cur.dark), dB = mixc(mixc(SKY.cB, SKY.gB, cur.gray), SKY.dB, cur.dark);
      const nG = Math.max(cur.gray * .8, cur.dark), nT = mixc(SKY.nT, SKY.ngT, nG), nB = mixc(SKY.nB, SKY.ngB, nG), df = smooth(-6, 5, cur.elev);
      let T = mixc(nT, dT, df), B = mixc(nB, dB, df);
      T = mixc(T, SKY.fT, cur.fog * .8 * df + cur.fog * .35 * (1 - df)); B = mixc(B, SKY.fB, cur.fog * .85 * df + cur.fog * .3 * (1 - df));
      T = mixc(T, SKY.sT, cur.smoke * .7 * df); B = mixc(B, SKY.sB, cur.smoke * .75 * df);
      const tw = Math.max(0, 1 - Math.abs(cur.elev - 1) / 9) * (1 - cur.dark * .8) * (1 - cur.fog * .5);
      return { T: mixc(T, SKY.twT, tw * .35), B: mixc(B, SKY.twB, tw * .75), df, tw };
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const sk = skyColors(), df = sk.df, gr = ctx.createLinearGradient(0, 0, 0, gy); gr.addColorStop(0, rgba(sk.T)); gr.addColorStop(1, rgba(sk.B)); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      /* bintang */
      const sa = (1 - smooth(-8, 2, cur.elev) * 0 - df) * clamp(1 - cur.gray * 1.25, 0, 1);
      if (sa > .02) stars.forEach(s => { ctx.globalAlpha = sa * (.55 + .45 * Math.sin(tt * 1.6 + s.p)); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill(); }); ctx.globalAlpha = 1;
      /* matahari */
      const clearK = clamp(1 - cur.gray * .95 - cur.dark, 0, 1);
      if (cur.elev > -4) {
        const sx = W * (.5 + .4 * clamp(cur.ha / 95, -1, 1)), top = H * .16, sy = top + (gy - top - 6) * (1 - Math.sin(rad(Math.max(cur.elev, -4)))), red = 1 - smooth(0, 26, cur.elev);
        const sc = mixc([255, 240, 190], [255, 140, 60], Math.max(red, cur.smoke * .8)), ga = (.62 * clearK + .12 * (1 - clearK)) * (1 - cur.fog * .5);
        let g2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, 78); g2.addColorStop(0, rgba(sc, ga)); g2.addColorStop(1, rgba(sc, 0)); ctx.fillStyle = g2; ctx.fillRect(sx - 80, sy - 80, 160, 160);
        if (clearK > .25 && cur.elev > 3 && !cur.fog) { ctx.save(); ctx.translate(sx, sy); ctx.rotate(tt * .12); ctx.fillStyle = rgba(sc, .2 * clearK); for (let i = 0; i < 14; i++) { ctx.rotate(6.2832 / 14); ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(-4.5, -58 - (i % 2) * 14); ctx.lineTo(4.5, -58 - (i % 2) * 14); ctx.fill(); } ctx.restore(); }
        ctx.globalAlpha = clamp(.35 + clearK * .65, 0, 1) * (1 - cur.fog * .6); ctx.fillStyle = rgba(mixc([255, 252, 235], sc, .5)); ctx.beginPath(); ctx.arc(sx, sy, 14, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
      }
      /* bulan */
      if (df < .85) {
        const mh = cur.ha > 0 ? cur.ha - 180 : cur.ha + 180, mx = W * (.5 + .38 * clamp(mh / 95, -1, 1)), top = H * .15, me = clamp(-cur.elev, -3, 78), my = top + (gy - top - 6) * (1 - Math.sin(rad(Math.max(me, -3))));
        const ma = (1 - df) * (1 - cur.gray * .85) * (1 - cur.fog * .6); if (ma > .03 && me > -3) {
          ctx.globalAlpha = ma; let g3 = ctx.createRadialGradient(mx, my, 0, mx, my, 38); g3.addColorStop(0, "rgba(200,215,255,.35)"); g3.addColorStop(1, "rgba(200,215,255,0)"); ctx.fillStyle = g3; ctx.fillRect(mx - 40, my - 40, 80, 80);
          const R = 11, ph = moonP, k = Math.cos(ph * 6.2832), wax = ph < .5; ctx.fillStyle = "rgba(60,70,100,.5)"; ctx.beginPath(); ctx.arc(mx, my, R, 0, 6.2832); ctx.fill();
          ctx.fillStyle = "#eef3ff"; ctx.beginPath(); ctx.arc(mx, my, R, wax ? -1.5708 : 1.5708, wax ? 1.5708 : 4.7124, false); ctx.ellipse(mx, my, Math.abs(k) * R, R, 0, wax ? 1.5708 : -1.5708, wax ? -1.5708 : 1.5708, k > 0); ctx.fill(); ctx.globalAlpha = 1;
        }
      }
      /* awan */
      const dk = clamp(Math.round((cur.dark * .85 + cur.gray * .15) * 4), 0, 4), nt = Math.round((1 - smooth(-6, 4, cur.elev)) * 2);
      clouds.forEach(c => { if (c.a < .02) return; const sp = cloudSprite(c.vr, dk, nt), sw = 180 * c.s * W / 200, sh = 90 * c.s * W / 200; ctx.globalAlpha = c.a * c.o * (1 - cur.fog * .35); ctx.drawImage(sp, c.x, c.y * gy * .8, sw, sh); }); ctx.globalAlpha = 1;
      /* kabut / kabur */
      if (cur.fog > .02) mist.forEach(m => { ctx.save(); ctx.translate(m.x, m.y); ctx.scale(m.rx, m.ry); const g4 = ctx.createRadialGradient(0, 0, 0, 0, 0, 1), mc = mixc([226, 232, 234], [60, 70, 90], 1 - df); g4.addColorStop(0, rgba(mc, .5 * cur.fog)); g4.addColorStop(1, rgba(mc, 0)); ctx.fillStyle = g4; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 6.2832); ctx.fill(); ctx.restore(); });
      /* tanah, bukit, jalan */
      const L = lerp(.24, 1, df) * (1 - cur.dark * .3) * (1 - cur.fog * .25), lc = (c, k) => rgba([c[0] * L * (k || 1), c[1] * L * (k || 1), c[2] * L * (k || 1)]);
      ctx.fillStyle = lc([60, 96, 84]); ctx.beginPath(); ctx.moveTo(0, gy + 2); for (let x = 0; x <= W; x += 8) ctx.lineTo(x, gy - 10 - 9 * Math.sin(x * .021 + 1) - 5 * Math.sin(x * .05)); ctx.lineTo(W, gy + 2); ctx.fill();
      ctx.fillStyle = lc([36, 66, 52]); ctx.beginPath(); ctx.moveTo(0, gy + 4); for (let x = 0; x <= W; x += 8) ctx.lineTo(x, gy - 3 - 6 * Math.sin(x * .03 + 3) - 3 * Math.sin(x * .07)); ctx.lineTo(W, gy + 4); ctx.fill();
      ctx.fillStyle = lc([40, 74, 50]); ctx.fillRect(0, gy, W, H - gy);
      const cx = W * .5, wt = W * .012, wb = W * .5, wet = clamp(cur.wet + cur.rain * .3, 0, 1);
      ctx.fillStyle = rgba([(70 - wet * 26) * L, (74 - wet * 24) * L, (80 - wet * 20) * L]); ctx.beginPath(); ctx.moveTo(cx - wt, gy); ctx.lineTo(cx + wt, gy); ctx.lineTo(cx + wb, H); ctx.lineTo(cx - wb, H); ctx.fill();
      if (wet > .05) { const rg = ctx.createLinearGradient(0, gy, 0, H); rg.addColorStop(0, rgba(sk.B, .55 * wet)); rg.addColorStop(1, rgba(sk.B, .08 * wet)); ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(cx - wt, gy); ctx.lineTo(cx + wt, gy); ctx.lineTo(cx + wb, H); ctx.lineTo(cx - wb, H); ctx.fill(); }
      ctx.strokeStyle = "rgba(255,255,255," + (.5 * L) + ")"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx - wt * .9, gy); ctx.lineTo(cx - wb * .94, H); ctx.moveTo(cx + wt * .9, gy); ctx.lineTo(cx + wb * .94, H); ctx.stroke();
      ctx.fillStyle = rgba([250 * L, 214 * L, 80 * L]); for (let k = 0; k < 7; k++) { const u = ((k + road) % 7) / 7, e = Math.pow(u, 1.9), e2 = Math.pow(Math.min(1, u + .07), 1.9), y1 = gy + (H - gy) * e, y2 = gy + (H - gy) * e2, w1 = 1 + 4.2 * e, w2 = 1 + 4.2 * e2; ctx.beginPath(); ctx.moveTo(cx - w1 / 2, y1); ctx.lineTo(cx + w1 / 2, y1); ctx.lineTo(cx + w2 / 2, y2); ctx.lineTo(cx - w2 / 2, y2); ctx.fill(); }
      /* hembusan angin */
      if (cur.wind > 4 && cur.rain < .6) { ctx.strokeStyle = "rgba(255,255,255," + (.2 * Math.min(1, (cur.wind - 3) / 8) * (.4 + df * .6)) + ")"; ctx.lineWidth = 1; ctx.beginPath(); const n = Math.min(streak.length, Math.round(4 + cur.wind * 1.6)); for (let i = 0; i < n; i++) { const s = streak[i], d = cur.ex >= 0 ? 1 : -1; ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(s.x + d * s.l * .5, s.y - 3, s.x + d * s.l, s.y); } ctx.stroke(); }
      /* hujan */
      if (rain.length) {
        const sl = cur.ex * clamp(cur.wind / 14, 0, 1) * .55; ctx.lineCap = "round";
        [[.5, .55, .8], [1, .9, 1.25]].forEach(([lo, hi, lw], tier) => { ctx.strokeStyle = "rgba(214,228,244," + (tier ? .62 : .38) + ")"; ctx.lineWidth = lw; ctx.beginPath(); rain.forEach((d, i) => { if ((i & 1) !== tier) return; ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - sl * d.l, d.y - d.l); }); ctx.stroke(); });
        if (spl.length) { ctx.lineWidth = 1; spl.forEach(s => { ctx.strokeStyle = "rgba(220,235,250," + (.5 * (1 - s.t)) + ")"; ctx.beginPath(); ctx.ellipse(s.x, s.y, 1 + s.t * 6, .5 + s.t * 2, 0, 0, 6.2832); ctx.stroke(); }); }
      }
      /* petir */
      if (flash > 0) { if (bolt && flash > .22) { ctx.save(); ctx.shadowColor = "#9ec5ff"; ctx.shadowBlur = 14; ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 2.2; ctx.beginPath(); bolt.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.restore(); } ctx.fillStyle = "rgba(225,235,255," + (flash * .5) + ")"; ctx.fillRect(0, 0, W, H); }
      /* vinyet */
      const vg = ctx.createRadialGradient(W / 2, H / 2, W * .3, W / 2, H / 2, W * .74); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.34)"); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    function update(dt) {
      tt += dt; const k = 1 - Math.exp(-dt * 3.2);
      Object.keys(tg).forEach(p => { if (p === "ha") { let d = tg.ha - cur.ha; d = Math.atan2(Math.sin(rad(d)), Math.cos(rad(d))) * 180 / Math.PI; cur.ha += d * k; } else cur[p] += (tg[p] - cur[p]) * k; });
      road = (road + dt * (.2 + cur.wind * .01)) % 7; const dir = cur.ex >= 0 ? 1 : -1, wsp = 5 + cur.wind * 2.6;
      clouds.forEach((c, i) => { const want = i < Math.round(cur.cloudN) ? 1 : 0; c.a += (want - c.a) * (1 - Math.exp(-dt * 2)); c.x += dir * wsp * c.v * dt * (rm ? .4 : 1); const sw = 180 * c.s * W / 200; if (c.x > W + 10) c.x = -sw; if (c.x < -sw - 10) c.x = W; });
      mist.forEach(m => { m.x += dir * (4 + cur.wind * 1.5) * m.v * dt; if (m.x > W + m.rx) m.x = -m.rx; if (m.x < -m.rx) m.x = W + m.rx; });
      streak.forEach(s => { s.x += dir * (46 + cur.wind * 16) * s.v * dt; if (s.x > W + 40) s.x = -40; if (s.x < -40) s.x = W + 40; });
      const n = Math.round(cur.rain * 230 * (rm ? .5 : 1)), sl = cur.ex * clamp(cur.wind / 14, 0, 1) * .55;
      while (rain.length < n) rain.push(newDrop(false)); if (rain.length > n) rain.length = Math.max(n, rain.length - 5);
      for (let i = 0; i < rain.length; i++) { const d = rain[i]; d.y += d.v * dt; d.x += sl * d.v * dt; if (d.y >= d.land) { if (spl.length < 36 && rnd() < .4) spl.push({ x: d.x, y: d.land, t: 0 }); rain[i] = newDrop(false); } }
      for (let i = spl.length - 1; i >= 0; i--) { spl[i].t += dt * 3; if (spl[i].t >= 1) spl.splice(i, 1); }
      if (cls === "storm" && !rm) { nb -= dt; if (nb <= 0) { flash = 1; bolt = bolt1(); nb = 2 + rnd() * 4.2; } }
      if (flash > 0) { flash -= dt * (flash > .5 ? 3.4 : 2.2); if (flash <= 0) { flash = 0; bolt = null; } else if (flash < .5 && flash > .46 && rnd() < .3) flash = .85; }
    }
    function loop(ts) { raf = requestAnimationFrame(loop); if (document.hidden) { last = ts; return; } const dt = Math.min(.05, (ts - (last || ts)) / 1000); last = ts; update(dt); draw(); }
    return {
      set, snap, resize, draw, update,
      start() { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } }, stop() { if (raf) cancelAnimationFrame(raf); raf = 0; },
      get running() { return !!raf; }, forceBolt() { flash = 1; bolt = bolt1(); }, state: () => ({ cls, cur: Object.assign({}, cur), rain: rain.length })
    };
  }

  /* ============================== KECERDASAN: dampak ke pekerjaan jalan ============================== */
  const wetNow = s => CLS[s.cls].lv > 0 || (s.rain || 0) >= .3;
  const ST = { go: ["✅", "Layak"], warn: ["⚠️", "Hati-hati"], stop: ["⛔", "Tunda"] };
  function judge(sl, i) {
    const s = sl[i], p = sl[i - 1], n = sl[i + 1], r = s.rain || 0, rp = p ? p.rain || 0 : 0, rn = n ? n.rain || 0 : 0, wet = wetNow(s), g = s.gust != null ? s.gust : s.ws * 1.5, T = s.temp;
    const a = wet ? ["stop", "hujan: aspal & lapis perekat tidak melekat"] : (rn >= 1 || rp >= .5 || s.ws > 9) ? ["warn", rp >= .5 ? "permukaan masih basah" : rn >= 1 ? "hujan segera datang" : "angin kencang mendinginkan campuran"] : ["go", "kering, campuran panas terjaga"];
    const c = (r >= .5 || rn >= 2) ? ["stop", "risiko hujan merusak beton segar"] : (rn >= .5 || T >= 35 || s.ws >= 10) ? ["warn", T >= 35 ? "panas: retak plastis, siram/curing" : rn >= .5 ? "hujan mendekat, siapkan terpal" : "angin kencang mempercepat kering"] : ["go", "kondisi baik untuk pengecoran"];
    const dr = (wet || g * 1.3 > 13 || (s.vis != null && s.vis < 1.5)) ? ["stop", wet ? "hujan" : g * 1.3 > 13 ? "angin terlalu kencang" : "jarak pandang rendah"] : (g * 1.3 > 10 || r > .2 || (s.vis != null && s.vis < 3) || s.cls === "fog") ? ["warn", "angin/kabut mendekati batas"] : ["go", "angin & jarak pandang aman"];
    const fl = s.cls === "storm" ? ["stop", "petir: hentikan kerja di area terbuka"] : s.cls === "heavy" ? ["stop", "hujan lebat: jalan licin & genangan"] : (wet || T >= 35) ? ["warn", T >= 35 ? "panas terik, atur istirahat & air minum" : "hujan: licin, pakai APD"] : ["go", "aman untuk kerja lapangan"];
    return [{ k: "asp", ic: "🛣️", t: "Pengaspalan", st: a }, { k: "bet", ic: "🧱", t: "Pengecoran beton", st: c }, { k: "drn", ic: "🚁", t: "Survei drone", st: dr }, { k: "lap", ic: "👷", t: "Kerja lapangan", st: fl }];
  }
  function risk24(sl, i) {
    let mm = 0, mx = 0, storm = false; for (let k = i; k < Math.min(sl.length, i + 8); k++) { mm += sl[k].rain || 0; mx = Math.max(mx, sl[k].rain || 0); if (sl[k].cls === "storm") storm = true; }
    const lv = mm >= 150 ? 4 : mm >= 100 ? 3 : mm >= 50 ? 2 : mm >= 20 ? 1 : 0;
    return { mm, mx, storm, lv, t: ["Rendah", "Sedang", "Lebat", "Sangat lebat", "Ekstrem"][lv], c: ["#34d399", "#facc15", "#f59e0b", "#f43f5e", "#e11d48"][lv], note: ["Relatif aman dilintasi", "Jalan bisa licin / tergenang ringan", "Waspada genangan & banjir lokal", "Waspada banjir/longsor, pantau saluran & lereng", "Ekstrem: potensi banjir/longsor serius, tunda pekerjaan galian"][lv] };
  }
  const localKey = (t, off) => { const d = new Date(t + off * 6e4); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1, 2) + "-" + pad(d.getUTCDate(), 2); };
  function windows(b) {
    const today = localKey(Date.now(), b.off), days = [], m = {};
    b.slots.forEach(s => { if (s.dk < today) return; const d = m[s.dk] || (m[s.dk] = { dk: s.dk, dow: s.dow, dd: s.dd, mo: s.mo, dry: 0, tot: 0, mm: 0 }); if (d.tot === 0 && !days.includes(d)) days.push(d); if (s.lh >= 6 && s.lh <= 15) { d.tot++; if (!wetNow(s) && (s.rain || 0) < .5) d.dry++; } d.mm += s.rain || 0; });
    const k = days.filter(d => d.tot > 0).slice(0, 4); k.forEach((d, j) => { d.label = d.dk === today ? "Hari ini" : j === 1 && d.dk > today ? "Besok" : DAYN[d.dow] + " " + d.dd; });
    return k;
  }
  function alertsFor(b, i0) {
    const out = [], sl = b.slots;
    for (let i = i0; i < Math.min(sl.length, i0 + 9); i++) {
      const s = sl[i], h = pad(s.lh, 2) + ".00", g = s.gust != null ? s.gust : s.ws * 1.5;
      if (s.cls === "storm") out.push({ lv: 3, t: "Potensi hujan petir & angin kencang sekitar " + h });
      else if (s.cls === "heavy" || (s.rain || 0) >= 20) out.push({ lv: 2, t: "Hujan lebat (" + Math.round(s.rain || 0) + " mm/3 jam) sekitar " + h });
      if (s.ws >= 10 || g >= 15) out.push({ lv: 2, t: "Angin kencang " + Math.round(Math.max(s.ws, g) * 3.6) + " km/jam sekitar " + h });
      if (s.vis != null && s.vis < 1) out.push({ lv: 1, t: "Jarak pandang < 1 km sekitar " + h });
      if (s.temp >= 35) out.push({ lv: 1, t: "Suhu tinggi " + Math.round(s.temp) + "°C sekitar " + h });
    }
    const seen = new Set(); return out.filter(a => !seen.has(a.t) && seen.add(a.t)).sort((a, b) => b.lv - a.lv).slice(0, 4);
  }
  function nearAssets(lat, lng) {
    const o = { road: null, br: [], pk: null };
    try {
      const R = typeof roads !== "undefined" ? roads : []; let best = 3000;
      R.forEach(r => (r.points || []).forEach(p => { if (Math.abs(p.lat - lat) > .03 || Math.abs(p.lng - lng) > .03) return; const d = distM(lat, lng, p.lat, p.lng); if (d < best) { best = d; o.road = { id: r.id, name: r.name || r.nama || r.id, d, sta: p.sta }; } }));
    } catch (e) { }
    try {
      const B = typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : (typeof JEMBATAN_SEED !== "undefined" ? JEMBATAN_SEED : []);
      o.br = B.filter(x => x && isFinite(x.lat) && Math.abs(x.lat - lat) < .06 && Math.abs(x.lng - lng) < .06).map(x => ({ n: x.nama || x.nomor || "Jembatan", ruas: x.ruas, d: distM(lat, lng, x.lat, x.lng) })).filter(x => x.d <= 3000).sort((a, b) => a.d - b.d).slice(0, 2);
    } catch (e) { }
    try {
      const P = window.PETAQU_PAKET; if (P) { let bd = 15000; P.all().forEach(p => { if (!isFinite(+p.lat) || !isFinite(+p.lng)) return; const dv = P.derive(p); if (!dv.aktif || dv.status === "Belum Mulai") return; const d = distM(lat, lng, +p.lat, +p.lng); if (d < bd) { bd = d; o.pk = { kode: p.kode, nama: p.nama, fisik: +p.fisik || 0, d }; } }); }
    } catch (e) { }
    return o;
  }

  /* ============================== UI ============================== */
  const CSS = [
    "#pqwxRoot{position:absolute;inset:0;z-index:690;pointer-events:none;overflow:hidden}",
    ".pqwx-an{position:absolute;width:0;height:0}",
    ".pqwx-pin{position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid #0ea5e9;box-shadow:0 0 0 3px #0ea5e955,0 2px 8px #0008}",
    ".pqwx-rip{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;border:2px solid #38bdf8;opacity:0;animation:pqwxRip 1.5s ease-out 3}",
    ".pqwx-rip:nth-child(3){animation-delay:.35s}.pqwx-rip:nth-child(4){animation-delay:.7s}",
    "@keyframes pqwxRip{0%{transform:scale(.4);opacity:.95}100%{transform:scale(5.5);opacity:0}}",
    ".pqwx-orb{box-sizing:border-box;position:absolute;left:calc(var(--s)/-2);bottom:22px;width:var(--s);height:var(--s);border-radius:50%;overflow:hidden;pointer-events:auto;cursor:pointer;border:3px solid var(--rc,#38bdf8);box-shadow:0 10px 34px #000a,0 0 22px -2px var(--rc,#38bdf8);transform-origin:50% calc(100% + 22px);animation:pqwxPop .55s cubic-bezier(.2,1.5,.35,1) both;background:#0b2a3b}",
    ".pqwx-an.below .pqwx-orb{bottom:auto;top:22px;transform-origin:50% -22px}",
    "@keyframes pqwxPop{0%{transform:scale(.05);opacity:0}100%{transform:scale(1);opacity:1}}",
    ".pqwx-tail{position:absolute;left:-9px;bottom:6px;width:0;height:0;border:9px solid transparent;border-top:16px solid var(--rc,#38bdf8);border-bottom:0;filter:drop-shadow(0 3px 3px #0006)}",
    ".pqwx-an.below .pqwx-tail{bottom:auto;top:6px;border-top:0;border-bottom:16px solid var(--rc,#38bdf8)}",
    ".pqwx-orb canvas{display:block;position:absolute;inset:0}",
    ".pqwx-chip{position:absolute;left:0;right:0;top:9px;text-align:center;font:800 15px/1.1 system-ui,sans-serif;color:#fff;text-shadow:0 1px 4px #000c,0 0 10px #0008}",
    ".pqwx-chip small{display:block;font:700 10.5px system-ui;opacity:.92;margin-top:2px}",
    ".pqwx-scan{position:absolute;inset:0;background:radial-gradient(circle,#0b2a3bf0 0,#071a26f5 100%);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:#9fdcf0;font:700 11px system-ui}",
    ".pqwx-scan:before{content:'';width:84%;aspect-ratio:1;position:absolute;border-radius:50%;background:conic-gradient(from 0deg,#22d3ee00 0,#22d3ee00 62%,#22d3eeaa 100%);animation:pqwxSp 1.15s linear infinite;-webkit-mask:radial-gradient(circle,transparent 0,#000 1px);mask:radial-gradient(circle,transparent 0,#000 1px)}",
    ".pqwx-scan:after{content:'';width:84%;aspect-ratio:1;position:absolute;border-radius:50%;border:1px solid #22d3ee55;box-shadow:inset 0 0 0 22px transparent,inset 0 0 0 23px #22d3ee22,inset 0 0 0 54px transparent,inset 0 0 0 55px #22d3ee22}",
    ".pqwx-scan span{position:relative;z-index:1}",
    "@keyframes pqwxSp{to{transform:rotate(360deg)}}",
    ".pqwx-an.hold .pqwx-orb{opacity:.35;transition:opacity .15s}",
    "#pqwxPill{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:1270;display:none;align-items:center;gap:10px;padding:7px 8px 7px 14px;border-radius:999px;background:#071a26f2;border:1px solid #38bdf8aa;color:#e6f1f7;font:700 12.5px system-ui;box-shadow:0 6px 22px #000a;backdrop-filter:blur(8px);max-width:calc(100vw - 20px)}",
    "#pqwxPill.on{display:flex;animation:pqwxDrop .35s ease-out}",
    "#pqwxPill span{white-space:nowrap}#pqwxPill .pqwx-sm{display:none}@media(max-width:520px){#pqwxPill .pqwx-lg{display:none}#pqwxPill .pqwx-sm{display:inline}}",
    "@keyframes pqwxDrop{from{transform:translate(-50%,-30px);opacity:0}}",
    "#pqwxPill button{border:0;border-radius:999px;padding:5px 11px;background:#0e7490;color:#fff;font:700 12px system-ui;cursor:pointer}",
    "body.pqwx-mode .leaflet-container,body.pqwx-mode .leaflet-container .leaflet-interactive{cursor:crosshair!important}",
    "#pqwxCard{position:fixed;right:12px;top:64px;z-index:1270;width:min(372px,calc(100vw - 24px));max-height:calc(100dvh - 84px);display:none;flex-direction:column;border-radius:16px;background:#071a26f6;color:#e6f1f7;border:1px solid #38bdf855;box-shadow:0 16px 48px #000b;font:13px/1.4 system-ui,sans-serif;backdrop-filter:blur(10px);overflow:hidden}",
    "#pqwxCard.open{display:flex;animation:pqwxSlide .35s cubic-bezier(.2,.9,.3,1)}",
    "@keyframes pqwxSlide{from{transform:translateX(30px);opacity:0}}",
    "@media(max-width:860px){#pqwxCard{right:8px;left:8px;top:auto;bottom:8px;width:auto;max-height:58dvh}#pqwxCard.open{animation-name:pqwxUp}@keyframes pqwxUp{from{transform:translateY(40px);opacity:0}}}",
    "body:has(.modal-overlay.show,#dashcam-modal:not(.hidden),#svOverlay.show,#arOverlay.show,#cmOverlay.show,#qrModal.show,#lightbox.show,#svmSketch2DModal.show,#loginScreen:not(.hide),#welcomeSplash:not(.hide)) :is(#pqwxCard,#pqwxPill){display:none!important}",
    "@media(max-width:860px){body:has(#sidebar.open) :is(#pqwxCard,#pqwxPill){opacity:0!important;pointer-events:none!important}}",
    ".pqwx-h{display:flex;gap:8px;align-items:flex-start;padding:11px 12px 8px;border-bottom:1px solid #ffffff17}",
    ".pqwx-h .t{flex:1;min-width:0}.pqwx-h b{display:block;font-size:14.5px;line-height:1.2}.pqwx-h small{display:block;color:#9fb6c3;font-size:11px;margin-top:2px}",
    ".pqwx-x{border:0;background:#ffffff14;color:#cfe3ee;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:15px;flex:none}.pqwx-x:hover{background:#ffffff2a}",
    ".pqwx-b{overflow:auto;padding:10px 12px 12px;overscroll-behavior:contain}#pqwxCard.min .pqwx-b{display:none}",
    ".pqwx-src{display:inline-block;font:800 9.5px system-ui;letter-spacing:.4px;padding:2px 7px;border-radius:8px;margin-top:4px}.pqwx-src.bmkg{background:#14532d;color:#86efac}.pqwx-src.om{background:#713f12;color:#fde68a}",
    ".pqwx-hero{display:flex;align-items:center;gap:12px}.pqwx-hero .em{font-size:44px;line-height:1}.pqwx-hero .tp{font:800 38px/1 system-ui}.pqwx-hero .tp sup{font-size:16px;font-weight:700}.pqwx-hero .ds{font-weight:700;font-size:14px}.pqwx-hero .tm{color:#9fb6c3;font-size:11.5px}",
    ".pqwx-m{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}.pqwx-m div{background:#ffffff0d;border-radius:10px;padding:6px 8px}.pqwx-m span{display:block;color:#8fa6bd;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}.pqwx-m b{font-size:13px}",
    ".pqwx-tl{background:#0a2433;border-radius:12px;padding:6px 6px 4px;margin-bottom:6px}.pqwx-tl svg{display:block;width:100%;touch-action:none;cursor:ew-resize}",
    ".pqwx-ctl{display:flex;align-items:center;gap:8px;margin-bottom:10px}.pqwx-ctl button{border:0;border-radius:8px;background:#0e7490;color:#fff;padding:5px 10px;font:700 12px system-ui;cursor:pointer}.pqwx-ctl button.s{background:#ffffff1a}.pqwx-ctl input{flex:1;accent-color:#22d3ee}",
    ".pqwx-sec{font:800 10px system-ui;letter-spacing:.7px;text-transform:uppercase;color:#7dd3fc;margin:12px 0 6px}",
    ".pqwx-act{display:grid;grid-template-columns:1fr 1fr;gap:6px}.pqwx-act div{border-radius:10px;padding:6px 8px;border:1px solid #ffffff1a;background:#ffffff08}.pqwx-act b{display:block;font-size:12px}.pqwx-act small{display:block;color:#b6c8d4;font-size:10.5px;line-height:1.3;margin-top:1px}",
    ".pqwx-act .go{border-color:#34d39955;background:#34d3991a}.pqwx-act .warn{border-color:#facc1566;background:#facc151a}.pqwx-act .stop{border-color:#f43f5e77;background:#f43f5e22}",
    ".pqwx-days{display:flex;gap:6px}.pqwx-days div{flex:1;text-align:center;border-radius:10px;padding:6px 2px;background:#ffffff0d;font-size:11px}.pqwx-days b{display:block;font-size:12px}.pqwx-days .best{outline:2px solid #34d399aa}",
    ".pqwx-rk{border-radius:10px;padding:7px 9px;border-left:4px solid var(--c);background:#ffffff0d}.pqwx-rk b{color:var(--c)}",
    ".pqwx-al{border-radius:9px;padding:6px 9px;margin-bottom:5px;font-size:12px;background:#f59e0b22;border-left:4px solid #f59e0b}.pqwx-al.l2{background:#f43f5e22;border-color:#f43f5e}.pqwx-al.l1{background:#facc1522;border-color:#facc15}",
    ".pqwx-as div{padding:4px 0;border-bottom:1px solid #ffffff10;font-size:12px}.pqwx-as small{color:#9fb6c3}.pqwx-as a{color:#38bdf8;cursor:pointer;text-decoration:underline}",
    ".pqwx-ft{margin-top:12px;font-size:10.5px;color:#8fa6bd;line-height:1.45}.pqwx-ft button{border:0;border-radius:8px;background:#ffffff1a;color:#e6f1f7;padding:5px 10px;font:700 11.5px system-ui;cursor:pointer;margin:6px 6px 0 0}",
    ".pqwx-err{padding:14px 12px;color:#fca5a5}.pqwx-err button{margin-top:8px;border:0;border-radius:8px;background:#0e7490;color:#fff;padding:6px 12px;font:700 12px system-ui;cursor:pointer}"
  ].join("\n");

  const S = { on: false, warn: false, tok: 0, b: null, i: 0, lat: 0, lng: 0, as: null, play: 0, scene: null, size: 224, dblz: false };
  let root, an, orbEl, cv, card, pill, started = false;
  const isCur = t => t === S.tok;
  const hhmm = s => pad(s.lh, 2) + "." + pad(s.lm || 0, 2);
  const when = (b, s) => { const today = localKey(Date.now(), b.off); return (s.dk === today ? "Hari ini" : DAYN[s.dow] + " " + s.dd + " " + MONN[s.mo]) + " · " + hhmm(s) + " " + tzName(b.off); };
  const place = b => { const L = b.loc || {}; if (L.desa) return [L.desa + (L.kec ? ", Kec. " + L.kec : ""), [L.kab, L.prov].filter(Boolean).join(", ")]; const cd = b.adm4 || b.near, p = cd ? PROV[+cd.slice(0, 2)] : ""; return ["Titik " + Math.abs(S.lat).toFixed(3) + "°" + (S.lat < 0 ? "LS" : "LU") + " " + S.lng.toFixed(3) + "°BT", p || "di luar jangkauan desa (laut / luar Indonesia)"]; };

  function injectCss() { if ($("pqwxCss")) return; const st = el("style"); st.id = "pqwxCss"; st.textContent = CSS; document.head.appendChild(st); }
  function buildDom(m) {
    root = el("div"); root.id = "pqwxRoot"; m.getContainer().appendChild(root);
    card = el("div"); card.id = "pqwxCard"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Cuaca"); document.body.appendChild(card);
    pill = el("div", "", '<span><span class="pqwx-lg">☁️ Mode Cuaca · ketuk peta untuk prakiraan BMKG</span><span class="pqwx-sm">☁️ Ketuk peta untuk cuaca</span></span><button type="button">Selesai</button>'); pill.id = "pqwxPill"; document.body.appendChild(pill);
    pill.querySelector("button").onclick = () => setMode(false);
    card.addEventListener("click", onCard); card.addEventListener("input", e => { if (e.target.id === "pqwxRg") { stopPlay(); setSlot(+e.target.value); } });
    document.addEventListener("keydown", e => { if (e.key === "Escape") { if (S.b || card.classList.contains("open")) closeAll(); else if (S.on) setMode(false); } });
  }

  /* ---------- orb di peta ---------- */
  function showAnchor(lat, lng) {
    const m = getMap(); if (!m) return; S.size = innerWidth <= 860 ? 176 : 224;
    if (an) an.remove(); S.scene && S.scene.stop();
    an = el("div", "pqwx-an", '<div class="pqwx-rip"></div><div class="pqwx-rip"></div><div class="pqwx-rip"></div><div class="pqwx-pin"></div><div class="pqwx-tail"></div><div class="pqwx-orb"><canvas></canvas><div class="pqwx-chip"></div><div class="pqwx-scan"><span>Memuat BMKG…</span></div></div>');
    an.style.setProperty("--s", S.size + "px"); root.appendChild(an); an._ll = [lat, lng]; orbEl = an.querySelector(".pqwx-orb"); cv = orbEl.querySelector("canvas");
    S.scene = Scene(cv, S.size); S.scene.resize(S.size); neutral(); orbEl.addEventListener("click", e => { e.stopPropagation(); card.classList.toggle("min"); });
    place_();
  }
  function neutral() { const sc = S.scene, t = Date.now(), sp = sunPos(S.lat, S.lng, t); sc.set(mkSlot({ t, src: "bmkg", desc: "Cerah", ws: 2, wdir: 90, rain: 0 }, S.lat, S.lng, 420)); sc.snap(); sc.draw(); }
  function place_() {
    const m = getMap(); if (!m || !an) return; const p = m.latLngToContainerPoint(an._ll), sz = m.getSize();
    an.style.left = p.x + "px"; an.style.top = p.y + "px"; an.classList.toggle("below", p.y < S.size + 60 && sz.y - p.y > S.size + 60);
  }
  let rq = 0; const placeSoon = () => { if (!rq) rq = requestAnimationFrame(() => { rq = 0; place_(); }); };

  /* ---------- kartu ---------- */
  function cardLoading() {
    card.className = "open"; card.innerHTML = '<div class="pqwx-h"><div class="t"><b>Memuat cuaca…</b><small>' + Math.abs(S.lat).toFixed(3) + "°" + (S.lat < 0 ? "LS" : "LU") + " " + S.lng.toFixed(3) + '°BT</small></div><button class="pqwx-x" data-a="x" aria-label="Tutup">✕</button></div>';
  }
  function cardError(e) {
    card.className = "open"; if (orbEl) { const sc = orbEl.querySelector(".pqwx-scan"); sc && sc.remove(); }
    card.innerHTML = '<div class="pqwx-h"><div class="t"><b>Cuaca tidak tersedia</b></div><button class="pqwx-x" data-a="x">✕</button></div><div class="pqwx-err">Gagal mengambil prakiraan dari BMKG maupun Open-Meteo (' + esc(e && e.message || "tanpa koneksi") + ').<br>Periksa koneksi internet lalu coba lagi.<br><button data-a="retry">Coba lagi</button></div>';
  }
  function chartSvg(b) {
    const sl = b.slots, n = sl.length, W = 300, x0 = 8, dx = (W - 2 * x0) / Math.max(1, n - 1), X = i => x0 + i * dx;
    const tmin = Math.min(...sl.map(s => s.temp)), tmax = Math.max(...sl.map(s => s.temp)), tr = Math.max(2, tmax - tmin), Y = v => 14 + (1 - (v - tmin) / tr) * 34, mr = Math.max(6, ...sl.map(s => s.rain || 0));
    let g = "", prev = null;
    sl.forEach((s, i) => { if (!s.day) g += '<rect x="' + (X(i) - dx / 2) + '" y="4" width="' + dx + '" height="68" fill="#020a14" opacity=".55"/>'; });
    sl.forEach((s, i) => { const h = (s.rain || 0) / mr * 22; if (h > .3) g += '<rect x="' + (X(i) - dx * .36) + '" y="' + (72 - h) + '" width="' + dx * .72 + '" height="' + h + '" rx="1.5" fill="#38bdf8" opacity=".85"/>'; if (s.dk !== prev) { g += '<line x1="' + (X(i) - dx / 2) + '" x2="' + (X(i) - dx / 2) + '" y1="4" y2="76" stroke="#ffffff22"/><text x="' + (X(i) - dx / 2 + 3) + '" y="86" fill="#9fb6c3" font-size="8.5" font-weight="700">' + DAYN[s.dow] + " " + s.dd + "</text>"; prev = s.dk; } });
    g += '<polyline fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linejoin="round" points="' + sl.map((s, i) => X(i).toFixed(1) + "," + Y(s.temp).toFixed(1)).join(" ") + '"/>';
    g += '<text x="3" y="11" fill="#fbbf24" font-size="8.5">' + Math.round(tmax) + '°</text><text x="3" y="55" fill="#fbbf24" font-size="8.5">' + Math.round(tmin) + "°</text>";
    const now = curIndex(sl, Date.now()); g += '<path d="M' + X(now) + ',74 l-3.5,6 h7 z" fill="#34d399"/>';
    g += '<g id="pqwxCur"><line y1="4" y2="76" stroke="#fff" stroke-width="1.4"/><circle id="pqwxDot" r="3.6" fill="#fff" stroke="#0ea5e9" stroke-width="2"/></g>';
    return '<svg id="pqwxSvg" viewBox="0 0 300 92" data-x0="' + x0 + '" data-dx="' + dx + '">' + g + "</svg>";
  }
  function renderCard() {
    const b = S.b, [t1, t2] = place(b), isB = b.src === "bmkg", sl = b.slots, wins = windows(b), bestD = wins.reduce((a, d) => (!a || d.dry > a.dry ? d : a), null);
    const as = S.as || {}, rows = [];
    if (as.road) rows.push("<div>🛣️ <b>" + esc(as.road.name) + "</b> <small>· " + fmtKm(as.road.d) + (as.road.sta ? " · STA " + esc(as.road.sta) : "") + (typeof focusRoad === "function" ? ' · <a data-a="road" data-id="' + esc(as.road.id) + '">buka</a>' : "") + "</small></div>");
    (as.br || []).forEach(x => rows.push("<div>🌉 <b>" + esc(x.n) + "</b> <small>· " + fmtKm(x.d) + (x.ruas ? " · " + esc(x.ruas) : "") + "</small></div>"));
    if (as.pk) rows.push("<div>📋 <b>" + esc(as.pk.kode) + "</b> " + esc(as.pk.nama) + " <small>· " + fmtKm(as.pk.d) + " · fisik " + as.pk.fisik + "%</small></div>");
    card.className = "open"; if (innerWidth <= 860) card.classList.add("min");
    card.innerHTML = '<div class="pqwx-h"><div class="t"><b>' + esc(t1) + "</b><small>" + esc(t2) + '</small><span class="pqwx-src ' + (isB ? "bmkg" : "om") + '">' + (isB ? "BMKG · desa " + esc(b.adm4) : "OPEN-METEO · cadangan") + "</span></div>" +
      '<button class="pqwx-x" data-a="min" title="Ciutkan/lebarkan">▾</button><button class="pqwx-x" data-a="x" title="Tutup" aria-label="Tutup">✕</button></div>' +
      '<div class="pqwx-b"><div class="pqwx-hero" id="pqwxHero"></div><div class="pqwx-m" id="pqwxM"></div><div class="pqwx-tl">' + chartSvg(b) + "</div>" +
      '<div class="pqwx-ctl"><button data-a="play" id="pqwxPlay">▶ Putar</button><input id="pqwxRg" type="range" min="0" max="' + (sl.length - 1) + '" value="' + S.i + '" aria-label="Waktu prakiraan"><button class="s" data-a="now">Sekarang</button></div>' +
      '<div id="pqwxAl"></div><div class="pqwx-sec">Dampak untuk pekerjaan jalan</div><div class="pqwx-act" id="pqwxAct"></div>' +
      '<div class="pqwx-sec">Risiko genangan & longsor (24 jam dari waktu terpilih)</div><div id="pqwxRk"></div>' +
      '<div class="pqwx-sec">Hari kerja efektif (06.00–18.00)</div><div class="pqwx-days">' + wins.map(d => '<div class="' + (bestD && d === bestD && d.dry > 0 ? "best" : "") + '"><b>' + d.label + "</b>" + d.dry + "/" + d.tot + " kering<br><small>" + Math.round(d.mm) + " mm</small></div>").join("") + "</div>" +
      (rows.length ? '<div class="pqwx-sec">Aset PETAQU terdekat</div><div class="pqwx-as">' + rows.join("") + '<small id="pqwxAdv"></small></div>' : "") +
      '<div class="pqwx-ft">' + (isB ? "Sumber data: <b>BMKG</b> (Badan Meteorologi, Klimatologi, dan Geofisika) — prakiraan desa/kelurahan, 3 hari per 3 jam" + (b.distKm > 1 ? ", titik data ±" + fmtKm(b.distKm * 1000) + " dari klik" : "") + "." : "Sumber data: <b>Open-Meteo</b> (model global), <b>bukan BMKG</b>. " + esc((b.diag || []).join("; ")) + ".") +
      " Peringatan di atas diturunkan dari prakiraan, bukan peringatan dini resmi BMKG. Kode wilayah: Kepmendagri 2025." + '<br><button data-a="copy">Salin ringkasan</button><button data-a="retry">Muat ulang</button></div></div>';
    const svg = $("pqwxSvg"); let drag = false;
    const idx = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 300; return clamp(Math.round((x - +svg.dataset.x0) / +svg.dataset.dx), 0, sl.length - 1); };
    svg.onpointerdown = e => { drag = true; svg.setPointerCapture(e.pointerId); stopPlay(); setSlot(idx(e)); }; svg.onpointermove = e => { if (drag) setSlot(idx(e)); }; svg.onpointerup = svg.onpointercancel = () => (drag = false);
  }
  function setSlot(i, first) {
    const b = S.b; if (!b) return; i = clamp(i, 0, b.slots.length - 1); S.i = i; const s = b.slots[i], c = CLS[s.cls], em = s.day ? c.e : c.en, rk = risk24(b.slots, i), vis = s.vis;
    $("pqwxHero").innerHTML = '<div class="em">' + em + '</div><div><div class="tp">' + Math.round(s.temp) + "<sup>°C</sup></div></div><div><div class=\"ds\">" + c.t + '</div><div class="tm">' + when(b, s) + (i === curIndex(b.slots, Date.now()) ? " · sekarang" : "") + "</div></div>";
    $("pqwxM").innerHTML = '<div><span>Kelembapan</span><b>' + Math.round(s.hum) + '%</b></div><div><span>Angin dari ' + compName(s.wdir) + '</span><b><span style="display:inline-block;transform:rotate(' + Math.round(s.wdir) + 'deg);color:#38bdf8">↓</span> ' + (s.ws * 3.6).toFixed(0) + ' km/j</b></div><div><span>Awan</span><b>' + Math.round(s.cloud) + '%</b></div><div><span>Hujan 3 jam</span><b>' + (s.rain || 0).toFixed(1) + ' mm</b></div><div><span>Jarak pandang</span><b>' + (vis == null ? "–" : vis >= 10 ? "> 10 km" : vis.toFixed(1).replace(".", ",") + " km") + '</b></div><div><span>Hujan 24 jam</span><b>' + Math.round(rk.mm) + " mm</b></div>";
    $("pqwxAct").innerHTML = judge(b.slots, i).map(a => '<div class="' + a.st[0] + '"><b>' + a.ic + " " + a.t + " · " + ST[a.st[0]][1] + "</b><small>" + a.st[1] + "</small></div>").join("");
    $("pqwxRk").innerHTML = '<div class="pqwx-rk" style="--c:' + rk.c + '"><b>' + rk.t + "</b> · " + Math.round(rk.mm) + " mm / 24 jam" + (rk.storm ? " · ada hujan petir" : "") + "<br><small>" + rk.note + "</small></div>";
    const al = alertsFor(b, curIndex(b.slots, Date.now())); $("pqwxAl").innerHTML = al.length ? al.map(a => '<div class="pqwx-al l' + a.lv + '">⚠️ ' + esc(a.t) + "</div>").join("") : "";
    const adv = $("pqwxAdv"); if (adv) { const ln = [], as = S.as || {}, j = judge(b.slots, i); if (rk.lv >= 2 && as.br && as.br.length) ln.push("Hujan " + rk.t.toLowerCase() + ": periksa aliran & saluran di " + esc(as.br[0].n) + "."); if (as.pk && j[0].st[0] === "stop") ln.push("Paket " + esc(as.pk.kode) + ": tunda pengaspalan pada waktu ini."); adv.innerHTML = ln.length ? "<br>💡 " + ln.join(" ") : ""; }
    const svg = $("pqwxSvg"); if (svg) { const x = +svg.dataset.x0 + i * +svg.dataset.dx, y = 14 + (1 - (s.temp - Math.min(...b.slots.map(q => q.temp))) / Math.max(2, Math.max(...b.slots.map(q => q.temp)) - Math.min(...b.slots.map(q => q.temp)))) * 34; $("pqwxCur").setAttribute("transform", "translate(" + x + ",0)"); $("pqwxDot").setAttribute("cy", y); }
    const rg = $("pqwxRg"); if (rg && +rg.value !== i) rg.value = i;
    if (orbEl) { const ch = orbEl.querySelector(".pqwx-chip"); ch.innerHTML = Math.round(s.temp) + "° " + em + "<small>" + c.t + " · " + hhmm(s) + "</small>"; orbEl.style.setProperty("--rc", rk.c === "#34d399" && s.cls !== "clear" && s.cls !== "fair" ? "#38bdf8" : rk.lv ? rk.c : "#38bdf8"); an.style.setProperty("--rc", orbEl.style.getPropertyValue("--rc")); }
    if (S.scene) { S.scene.set(s); if (first) S.scene.snap(); S.scene.start(); }
  }
  function stopPlay() { if (S.play) { clearInterval(S.play); S.play = 0; const p = $("pqwxPlay"); p && (p.textContent = "▶ Putar"); } }
  function togglePlay() { if (S.play) return stopPlay(); const p = $("pqwxPlay"); p && (p.textContent = "⏸ Jeda"); S.play = setInterval(() => { if (!S.b) return stopPlay(); setSlot((S.i + 1) % S.b.slots.length); }, 750); }
  function summary() {
    const b = S.b, s = b.slots[S.i], [t1, t2] = place(b), rk = risk24(b.slots, S.i), j = judge(b.slots, S.i);
    return ["CUACA " + t1 + " — " + t2, when(b, s), CLS[s.cls].t + ", " + Math.round(s.temp) + "°C, lembap " + Math.round(s.hum) + "%, angin " + (s.ws * 3.6).toFixed(0) + " km/j dari " + compName(s.wdir) + ", hujan 3 jam " + (s.rain || 0).toFixed(1) + " mm", "Hujan 24 jam: " + Math.round(rk.mm) + " mm (" + rk.t + ")", j.map(a => a.t + ": " + ST[a.st[0]][1]).join(" | "), "Sumber: " + (b.src === "bmkg" ? "BMKG (api.bmkg.go.id), desa " + b.adm4 : "Open-Meteo (bukan BMKG)") + " — via PETAQU"].join("\n");
  }
  function onCard(e) {
    const a = e.target.closest("[data-a]"); if (!a) return; const k = a.dataset.a;
    if (k === "x") closeAll(); else if (k === "min") card.classList.toggle("min"); else if (k === "play") togglePlay(); else if (k === "now") { stopPlay(); setSlot(curIndex(S.b.slots, Date.now())); }
    else if (k === "retry") { cache.clear(); pick(S.lat, S.lng); }
    else if (k === "copy") { const t = summary(); (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => say("Ringkasan cuaca disalin"), () => { const ta = el("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); say("Ringkasan cuaca disalin"); } catch (er) { } ta.remove(); }); }
    else if (k === "road") { try { focusRoad(a.dataset.id); } catch (er) { } }
  }
  function closeAll() { S.tok++; stopPlay(); S.b = null; card.className = ""; card.innerHTML = ""; if (an) { an.remove(); an = null; } S.scene && S.scene.stop(); }

  /* ---------- alur klik ---------- */
  async function pick(lat, lng) {
    const my = ++S.tok; stopPlay(); S.lat = lat; S.lng = lng; S.b = null; showAnchor(lat, lng); cardLoading();
    let b = null, err = null; try { b = await resolveWeather(lat, lng, my, isCur); } catch (e) { err = e; }
    if (!isCur(my)) return; if (!b) return cardError(err);
    S.b = b; S.i = curIndex(b.slots, Date.now()); S.as = nearAssets(lat, lng);
    const sc = orbEl && orbEl.querySelector(".pqwx-scan"); sc && sc.remove();
    renderCard(); setSlot(S.i, true);
  }
  let down = null;
  function onDown(e) { down = [e.clientX, e.clientY]; }
  function onClickCap(e) {
    if (!S.on) return; const m = getMap(); if (!m) return;
    if (e.target.closest && e.target.closest(".leaflet-control,.leaflet-popup,#pqwxCard,#pqwxPill,.pqwx-orb,#pqFolder,#pqFolderCard,button,a")) return;
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    e.stopPropagation(); e.preventDefault(); const ll = m.mouseEventToLatLng(e); pick(ll.lat, ll.lng);
  }
  function setMode(on) {
    const m = getMap(); if (!m) return say("Peta belum siap"); on = !!on; if (on === S.on) return; S.on = on;
    document.body.classList.toggle("pqwx-mode", on); pill.classList.toggle("on", on);
    if (on) { S.dblz = m.doubleClickZoom && m.doubleClickZoom.enabled(); S.dblz && m.doubleClickZoom.disable(); say("Mode Cuaca aktif: ketuk titik mana saja di Indonesia"); }
    else S.dblz && m.doubleClickZoom.enable();
    const o = store.get(); o.on = on; store.set(o);
  }
  function locate() {
    if (!navigator.geolocation) return say("GPS tidak didukung perangkat ini");
    say("Mencari lokasi Anda…"); navigator.geolocation.getCurrentPosition(p => { const m = getMap(); m && m.setView([p.coords.latitude, p.coords.longitude], Math.max(m.getZoom(), 12)); pick(p.coords.latitude, p.coords.longitude); }, () => say("Izin lokasi ditolak / gagal"), { timeout: 9000, maximumAge: 6e4 });
  }
  function init() {
    if (started) return; const m = getMap(); if (!m || !document.body) return false; started = true;
    injectCss(); buildDom(m); const c = m.getContainer();
    c.addEventListener("pointerdown", onDown, true); c.addEventListener("click", onClickCap, true);
    ["move", "zoom", "viewreset", "resize", "rotate"].forEach(ev => m.on(ev, placeSoon));
    m.on("zoomstart", () => an && an.classList.add("hold")); m.on("zoomend", () => { an && an.classList.remove("hold"); place_(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) S.scene && S.scene.stop(); else if (S.b && S.scene) S.scene.start(); });
    setTimeout(() => { if (!$("pqFolder") && window.PQ_DOCK) { const b = el("button", "", '<i class="fa-solid fa-cloud-sun-rain"></i>'); b.title = "Cuaca Indonesia (BMKG)"; b.onclick = () => setMode(!S.on); try { PQ_DOCK.adopt(b, "Cuaca Indonesia (BMKG)"); } catch (e) { } } }, 2500);
    return true;
  }
  window.PETAQU_CUACA = {
    isOn: () => S.on, setOn: setMode, toggle: () => setMode(!S.on), open: pick, close: closeAll, locate,
    rows: () => [{ id: "klik", name: "Cuaca klik-peta (BMKG)", ic: "\uf743", c: "#38bdf8", on: S.on }, { id: "gps", name: "Cuaca di lokasi saya", ic: "\uf3c5", c: "#34d399" }],
    act: id => { if (id === "klik") setMode(!S.on); else if (id === "gps") locate(); },
    _t: { nearest, loadIndex, resolveWeather, judge, risk24, windows, alertsFor, summary, state: S, Scene, CLS, mkSlot, classify, sunPos }
  };
  let tries = 0; const iv = setInterval(() => { if (init() || ++tries > 120) clearInterval(iv); }, 500);
})();
