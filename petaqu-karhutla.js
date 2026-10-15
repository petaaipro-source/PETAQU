/* PETAQU Karhutla: peta KERAWANAN & POTENSI kebakaran hutan/lahan + animasi cerdas.
   Data: elevasi DEM + cuaca 30 hari lalu & 7 hari ke depan (Open-Meteo, gratis tanpa key) pada area peta yang tampil.
   Model: neraca air bahan bakar (hujan - evapotranspirasi) -> indeks kekeringan, x cuaca api (RH min, suhu, angin) x bahan bakar (gambut, dataran rendah).
   Animasi: (1) partikel angin yang berwarna menurut bahaya, (2) bara api melayang searah angin dari titik panas,
   (3) time-lapse potensi 7 hari, (4) SIMULASI PENJALARAN API (automata seluler: angin, kekeringan, lereng, gambut) + waktu jangkau ruas/jembatan.
   INDIKATIF untuk prioritas patroli/inspeksi; resmi: BMKG, SiPongi KLHK, NASA FIRMS (titik panas satelit). */
(function () {
  "use strict";
  if (window.PETAQU_KARHUTLA) return;
  const DEG = Math.PI / 180, N = 10, NW = 6, FG = 44, PAST = 30, FUT = 7, SG = 84, PREF = "petaqu_karhutla_v1";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = m => { try { toast(m, 3200); } catch (e) { console.log("[karhutla]", m); } };
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const lin = (x, a, b) => clamp((x - a) / (b - a));
  const pct = t => Math.round(t * 100) + "%";
  const LV = [["Rendah", "#22c55e"], ["Sedang", "#facc15"], ["Tinggi", "#f97316"], ["Sangat tinggi", "#dc2626"]];
  const lvi = t => t < .25 ? 0 : t < .45 ? 1 : t < .65 ? 2 : 3;
  const STOPS = [[0, [250, 204, 21, 0]], [.2, [250, 204, 21, 70]], [.4, [251, 146, 60, 140]], [.6, [239, 68, 68, 185]], [.8, [185, 28, 28, 215]], [1, [88, 10, 60, 238]]];
  function ramp(t) { t = clamp(t); for (let k = 1; k < STOPS.length; k++) if (t <= STOPS[k][0]) { const a = STOPS[k - 1], b = STOPS[k], f = (t - a[0]) / (b[0] - a[0]); return a[1].map((v, i) => v + (b[1][i] - v) * f); } return STOPS[5][1]; }
  const TAB = { rawan: ["Kerawanan", "fa-fire-flame-simple", "#f97316"], potensi: ["Potensi 7 hari", "fa-calendar-days", "#ef4444"], sim: ["Simulasi api", "fa-fire", "#fb7185"], wil: ["Wilayah", "fa-map-location-dot", "#a78bfa"] };

  /* zona gambut kasar (poligon [lat,lng]) - indikatif, untuk bobot bahan bakar & bara dalam tanah */
  const PEAT = [
    [[2.3, 100.9], [1.7, 102.3], [0.6, 103.6], [-.4, 103.3], [-.2, 101.9], [1.2, 101.2]],
    [[-.6, 103.4], [-1, 104.4], [-2.5, 104.7], [-3.2, 105.6], [-3.6, 105.9], [-3.9, 105.2], [-3, 104.1], [-1.8, 103.5]],
    [[1, 109.3], [.3, 110.2], [-.8, 110.4], [-1.5, 110], [-1.2, 109.2], [-.2, 109]],
    [[-1.4, 111], [-1.3, 113.6], [-2.2, 114.9], [-3.3, 114.6], [-3.4, 112], [-2.4, 111.3]],
    [[-6.6, 138.6], [-6.4, 140.2], [-7.6, 140.6], [-8, 139.2], [-7.3, 138.4]],
    [[-2.2, 137.5], [-2.2, 139.3], [-3.2, 139.3], [-3.2, 137.5]]
  ];
  function inPoly(la, lo, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > lo) !== (b[1] > lo) && la < (b[0] - a[0]) * (lo - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  const peatAt = (la, lo) => PEAT.some(P => inPoly(la, lo, P)) ? 1 : 0;

  /* ---------- jaringan ---------- */
  async function jget(url, ms) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms || 20000);
    try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } finally { clearTimeout(t); }
  }
  async function cached(key, ttl, fn) {
    try { const c = JSON.parse(sessionStorage.getItem("pqk:" + key) || "null"); if (c && Date.now() - c.t < ttl) return c.v; } catch (e) { }
    const v = await fn(); try { sessionStorage.setItem("pqk:" + key, JSON.stringify({ t: Date.now(), v })); } catch (e) { } return v;
  }
  const gridPts = (b, n) => { const la = [], lo = []; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { la.push((b.n - (b.n - b.s) * r / (n - 1)).toFixed(4)); lo.push((b.w + (b.e - b.w) * c / (n - 1)).toFixed(4)); } return [la, lo]; };
  const getElev = b => { const [la, lo] = gridPts(b, N); return jget("https://api.open-meteo.com/v1/elevation?latitude=" + la + "&longitude=" + lo).then(j => { if (!j.elevation || j.elevation.length !== N * N) throw new Error("elevasi tidak lengkap"); return j.elevation; }); };
  async function getWx(b) {
    const [la, lo] = gridPts(b, NW), j = await jget("https://api.open-meteo.com/v1/forecast?latitude=" + la + "&longitude=" + lo + "&daily=temperature_2m_max,relative_humidity_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,precipitation_sum,et0_fao_evapotranspiration&past_days=" + PAST + "&forecast_days=" + FUT + "&timezone=auto", 28000);
    return (Array.isArray(j) ? j : [j]).map(o => o.daily || {});
  }

  /* ---------- inti model (murni, bisa diuji) ---------- */
  function bil(f, n, u, v) {
    const x = clamp(u) * (n - 1), y = clamp(v) * (n - 1), i = Math.min(n - 2, Math.floor(x)), j = Math.min(n - 2, Math.floor(y)), fx = x - i, fy = y - j;
    return f[i * n + j] * (1 - fx) * (1 - fy) + f[i * n + j + 1] * (1 - fx) * fy + f[(i + 1) * n + j] * fx * (1 - fy) + f[(i + 1) * n + j + 1] * fx * fy;
  }
  /* satu titik cuaca -> bahaya per hari. Ember air tanah/bahan bakar: M += hujan - 0.85*ET0 (0..150 mm) */
  function pointModel(d) {
    const g = (k, i, def) => { const v = d[k] && d[k][i]; return v == null ? def : v; }, n = (d.time || []).length || PAST + FUT;
    let M = 70; const Ms = [], out = { D: [], dang: [], wind: [], dir: [], rh: [], tmax: [], rain: [], dth: [], et: [] };
    let dth = 0;
    for (let k = 0; k < n; k++) {
      const rain = g("precipitation_sum", k, 0), tx = g("temperature_2m_max", k, 31), et = g("et0_fao_evapotranspiration", k, 3.5 + .12 * (tx - 28));
      M = clamp(M + rain - .85 * et, 0, 150); Ms.push(M); dth = rain >= 3 ? 0 : dth + 1;
      if (k >= PAST) {
        const rh = g("relative_humidity_2m_min", k, 62), wd = g("wind_speed_10m_max", k, 12), dr = g("wind_direction_10m_dominant", k, 120), D = 1 - M / 150;
        const w = .4 * (1 - lin(rh, 30, 85)) + .25 * lin(tx, 28, 36) + .35 * lin(wd, 6, 35), kill = 1 - lin(rain, 2, 14);
        out.D.push(D); out.dang.push(clamp(Math.pow(D, 1.5) * (.35 + .9 * w) * kill)); out.wind.push(wd); out.dir.push(dr); out.rh.push(rh); out.tmax.push(tx); out.rain.push(rain); out.dth.push(dth); out.et.push(et);
      }
    }
    return out;
  }
  function analyze(b, elev, wxd) {
    const days = FUT, P = wxd ? wxd.map(pointModel) : null, F = { b, elev, wx: !!P, days, time: wxd && wxd[0] && wxd[0].time ? wxd[0].time.slice(PAST) : [], P };
    const pf = (k, d) => Float32Array.from(P, p => p[k][d]);
    if (P) { F.W = []; for (let d = 0; d < days; d++) F.W.push({ dang: pf("dang", d), D: pf("D", d), wind: pf("wind", d), rh: pf("rh", d), tmax: pf("tmax", d), rain: pf("rain", d), dth: pf("dth", d), u: Float32Array.from(P, p => { const a = (p.dir[d] + 180) * DEG; return p.wind[d] * Math.sin(a); }), v: Float32Array.from(P, p => { const a = (p.dir[d] + 180) * DEG; return p.wind[d] * Math.cos(a); }) }); }
    F.land = new Uint8Array(FG * FG); F.peat = new Uint8Array(FG * FG); F.rawan = new Float32Array(FG * FG); F.danger = []; for (let d = 0; d < days; d++) F.danger.push(new Float32Array(FG * FG));
    for (let r = 0; r < FG; r++) for (let c = 0; c < FG; c++) {
      const i = r * FG + c, u = r / (FG - 1), v = c / (FG - 1), la = b.n - (b.n - b.s) * u, lo = b.w + (b.e - b.w) * v, el = bil(elev, N, u, v), pe = peatAt(la, lo), land = el > .3 || pe;
      F.land[i] = land ? 1 : 0; F.peat[i] = pe; if (!land) continue;
      const alt = 1 - .7 * lin(el, 1500, 2800), low = 1 - lin(el, 50, 1400), Dn = P ? bil(F.W[0].D, NW, u, v) : .45;
      F.rawan[i] = clamp(.38 * pe + .22 * low + .40 * Dn);
      if (P) for (let d = 0; d < days; d++) F.danger[d][i] = clamp(bil(F.W[d].dang, NW, u, v) * (.75 + .45 * pe) * alt);
      else F.danger[0][i] = F.rawan[i];
    }
    return F;
  }
  function windAt(F, d, u, v) { if (!F.W) return [0, 0, 0]; const W = F.W[Math.min(d, F.days - 1)], wu = bil(W.u, NW, u, v), wv = bil(W.v, NW, u, v); return [wu, wv, Math.hypot(wu, wv)]; }

  /* ---------- state ---------- */
  let Pn, IMG, MK, FX, CTX, F = null, tab = "potensi", day = 0, op = .72, busy = false, minim = false, play = null, raf = 0, fxOn = true;
  let KAB = null, RG = null, HL = null, REG = null, WR = { prov: "", q: "", dyn: null, busy: false }, PT = [], EM = [], HS = [], SIM = null, simArm = false, simSpeed = 2, lastT = 0, pxs = null;
  try { const p = JSON.parse(localStorage.getItem(PREF) || "{}"); if (TAB[p.tab]) tab = p.tab; if (p.op >= .2 && p.op <= 1) op = p.op; if (p.fx === false) fxOn = false; } catch (e) { }
  const savePref = () => { try { localStorage.setItem(PREF, JSON.stringify({ tab, op, fx: fxOn })); } catch (e) { } };
  const fld = () => !F ? null : tab === "rawan" ? F.rawan : F.danger[Math.min(day, F.days - 1)];
  const uv = (la, lo) => { const b = F.b, u = (b.n - la) / (b.n - b.s), v = (lo - b.w) / (b.e - b.w); return (u < 0 || u > 1 || v < 0 || v > 1) ? null : [u, v]; };
  const look = (la, lo, f) => { if (!F) return null; const q = uv(la, lo); if (!q) return null; if (!F.land[Math.round(q[0] * (FG - 1)) * FG + Math.round(q[1] * (FG - 1))]) return null; return bil(f || fld(), FG, q[0], q[1]); };
  const dayName = d => { const t = F && F.time[d]; if (!t) return "H+" + d; if (d === 0) return "Hari ini"; try { return new Date(t + "T12:00:00").toLocaleDateString("id-ID", { weekday: "short", day: "numeric" }); } catch (e) { return t.slice(5); } };

  function paint() {
    if (!F) return; const S = 130, cv = document.createElement("canvas"); cv.width = cv.height = S;
    const x = cv.getContext("2d"), im = x.createImageData(S, S), f = fld();
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const u = py / (S - 1), v = px / (S - 1), o = (py * S + px) * 4;
      if (!F.land[Math.round(u * (FG - 1)) * FG + Math.round(v * (FG - 1))]) continue;
      const c = ramp(bil(f, FG, u, v)); im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = c[3];
    }
    x.putImageData(im, 0, 0); if (IMG) map.removeLayer(IMG);
    if (!map.getPane("pqkPane")) { map.createPane("pqkPane"); map.getPane("pqkPane").style.zIndex = 250; map.getPane("pqkPane").style.pointerEvents = "none"; }
    IMG = L.imageOverlay(cv.toDataURL(), [[F.b.s, F.b.w], [F.b.n, F.b.e]], { opacity: op, interactive: false, pane: "pqkPane" }).addTo(map);
    hotspots();
  }
  function hotspots() { /* maksimum lokal bahaya -> pusat denyut api */
    HS = []; if (!F) return; const f = fld();
    for (let r = 1; r < FG - 1; r++) for (let c = 1; c < FG - 1; c++) { const v = f[r * FG + c]; if (v < .55 || !F.land[r * FG + c]) continue; let ok = true; for (let a = -1; a <= 1 && ok; a++) for (let d = -1; d <= 1; d++) if ((a || d) && f[(r + a) * FG + c + d] > v) { ok = false; break; } if (ok) HS.push({ la: F.b.n - (F.b.n - F.b.s) * r / (FG - 1), lo: F.b.w + (F.b.e - F.b.w) * c / (FG - 1), v, ph: Math.random() * 6.28 }); }
    HS.sort((a, c) => c.v - a.v); const keep = []; for (const h of HS) { if (keep.every(k => Math.hypot(k.la - h.la, k.lo - h.lo) > (F.b.n - F.b.s) / 7)) keep.push(h); if (keep.length >= 12) break; } HS = keep;
  }

  /* ---------- paparan ruas & jembatan ---------- */
  function exposure() {
    const b = F.b, thr = .55, out = { roads: [], br: [], pts: [] }, f = fld(), inb = (la, lo) => la >= b.s && la <= b.n && lo >= b.w && lo <= b.e;
    (typeof roads !== "undefined" ? roads : []).forEach(rd => {
      let mx = -1, mp = null, hi = 0, n = 0;
      (rd.points || []).forEach(p => { const la = +p.lat, lo = +p.lng; if (isNaN(la) || isNaN(lo) || !inb(la, lo)) return; const v = look(la, lo, f); if (v == null) return; n++; out.pts.push({ la, lo, name: rd.name }); if (v >= thr) hi++; if (v > mx) { mx = v; mp = p; } });
      if (n) out.roads.push({ rd, mx, mp, share: hi / n, n });
    });
    out.roads.sort((a, c) => (c.mx * .6 + c.share * .4) - (a.mx * .6 + a.share * .4));
    (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []).forEach(j => { const la = +j.lat, lo = +j.lng; if (isNaN(la) || isNaN(lo) || !inb(la, lo)) return; const v = look(la, lo, f); if (v != null) { out.br.push({ j, v, la, lo }); out.pts.push({ la, lo, name: "Jembatan " + (j.nama || "-") }); } });
    out.br.sort((a, c) => c.v - a.v); return out;
  }
  function markers(X) {
    if (MK) map.removeLayer(MK); MK = L.layerGroup().addTo(map);
    X.roads.filter(r => r.mp && r.mx >= .45).slice(0, 120).forEach(r => L.circleMarker([+r.mp.lat, +r.mp.lng], { radius: 5, color: "#fff", weight: 1, fillColor: LV[lvi(r.mx)][1], fillOpacity: .95 }).bindPopup(popup(+r.mp.lat, +r.mp.lng, r.rd.name + " · STA " + (r.mp.sta || "-"))).addTo(MK));
    X.br.filter(x => x.v >= .4).slice(0, 60).forEach(x => L.circleMarker([x.la, x.lo], { radius: 8, color: "#fff", weight: 2, fillColor: LV[lvi(x.v)][1], fillOpacity: .95 }).bindPopup(popup(x.la, x.lo, "Jembatan " + (x.j.nama || "-"))).addTo(MK));
  }
  function popup(la, lo, title) {
    const q = uv(la, lo), r = look(la, lo, F.rawan), p = look(la, lo, F.danger[Math.min(day, F.days - 1)]); let w = "";
    if (q && F.W) { const [, , sp] = windAt(F, day, q[0], q[1]); w = " · angin ±" + sp.toFixed(0) + " km/j"; }
    const bar = (n, v) => v == null ? "" : '<div class="pqk-bar"><span>' + n + '</span><i><b style="width:' + pct(v) + ";background:" + LV[lvi(v)][1] + '"></b></i><em>' + pct(v) + "</em></div>";
    return '<div class="pqk-pop"><b>' + esc(title || "Detail titik") + "</b><small>" + LV[lvi(p == null ? r || 0 : p)][0] + w + "</small>" + bar("Kerawanan", r) + bar("Potensi " + dayName(day), p) + "</div>";
  }

  /* ---------- animasi: partikel angin + bara + denyut + simulasi ---------- */
  const pxPerDeg = () => 256 * Math.pow(2, map.getZoom()) / 360;
  function fxInit() {
    if (FX) return; const c = map.getContainer(); FX = document.createElement("canvas"); FX.id = "pqkCanvas"; FX.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;z-index:450;pointer-events:none";
    c.appendChild(FX); CTX = FX.getContext("2d"); fxSize(); map.on("resize", fxSize); map.on("movestart zoomstart", () => { if (CTX) CTX.clearRect(0, 0, FX.width, FX.height); });
  }
  function fxSize() { if (!FX) return; const c = map.getContainer(), dpr = Math.min(2, window.devicePixelRatio || 1); FX.width = c.clientWidth * dpr; FX.height = c.clientHeight * dpr; CTX.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function spawn(p) {
    const vb = map.getBounds(), b = F.b, s = Math.max(vb.getSouth(), b.s), n = Math.min(vb.getNorth(), b.n), w = Math.max(vb.getWest(), b.w), e = Math.min(vb.getEast(), b.e);
    if (n <= s || e <= w) { p.on = false; return p; } p.la = s + Math.random() * (n - s); p.lo = w + Math.random() * (e - w); p.age = 0; p.life = 60 + Math.random() * 90; p.on = true; return p;
  }
  function stepFx(dt) {
    if (!F || !fxOn) { CTX.clearRect(0, 0, FX.width, FX.height); return; }
    const W = FX.clientWidth, H = FX.clientHeight, ppd = pxPerDeg(), d = Math.min(day, F.days - 1), t = performance.now() / 1000;
    CTX.globalCompositeOperation = "destination-out"; CTX.fillStyle = "rgba(0,0,0,.16)"; CTX.fillRect(0, 0, W, H); CTX.globalCompositeOperation = "lighter";
    const want = innerWidth < 700 ? 380 : 800; while (PT.length < want) PT.push(spawn({}));
    if (F.W) for (const p of PT) {
      if (!p.on || p.age++ > p.life) { spawn(p); continue; } const q = uv(p.la, p.lo); if (!q) { spawn(p); continue; }
      const [wu, wv, sp] = windAt(F, d, q[0], q[1]), danger = tab === "rawan" ? bil(F.rawan, FG, q[0], q[1]) : bil(F.danger[d], FG, q[0], q[1]), pxs = (8 + sp * 2.4) * dt, m = Math.max(sp, .01);
      const a = map.latLngToContainerPoint([p.la, p.lo]); p.la += (wv / m) * pxs / (ppd / Math.cos(p.la * DEG)); p.lo += (wu / m) * pxs / ppd;
      const b2 = map.latLngToContainerPoint([p.la, p.lo]); if (b2.x < -20 || b2.y < -20 || b2.x > W + 20 || b2.y > H + 20) { p.age = 1e9; continue; }
      const fade = Math.sin(Math.PI * p.age / p.life), c = danger > .55 ? "255,120,60" : danger > .3 ? "255,200,90" : "130,205,255";
      CTX.strokeStyle = "rgba(" + c + "," + (.15 + .6 * fade * (.35 + danger)).toFixed(2) + ")"; CTX.lineWidth = 1.1 + danger; CTX.beginPath(); CTX.moveTo(a.x, a.y); CTX.lineTo(b2.x, b2.y); CTX.stroke();
    }
    /* denyut & bara dari titik panas potensial */
    if (HS.length) {
      for (const h of HS) {
        const q = uv(h.la, h.lo); if (!q) continue; const pt = map.latLngToContainerPoint([h.la, h.lo]); if (pt.x < -50 || pt.y < -50 || pt.x > W + 50 || pt.y > H + 50) continue;
        const pu = .5 + .5 * Math.sin(t * 2.4 + h.ph), r = 12 + 14 * h.v + 8 * pu, g = CTX.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
        g.addColorStop(0, "rgba(255,150,50," + (.22 + .18 * pu).toFixed(2) + ")"); g.addColorStop(.5, "rgba(239,68,68," + (.08 * h.v).toFixed(2) + ")"); g.addColorStop(1, "rgba(239,68,68,0)");
        CTX.fillStyle = g; CTX.beginPath(); CTX.arc(pt.x, pt.y, r, 0, 6.3); CTX.fill();
        if (Math.random() < h.v * 4 * dt && EM.length < 260) { const [wu, wv] = windAt(F, d, q[0], q[1]); EM.push({ x: pt.x + (Math.random() - .5) * 14, y: pt.y + (Math.random() - .5) * 10, vx: wu * 1.6 + (Math.random() - .5) * 14, vy: -wv * 1.6 - 16 - Math.random() * 26, a: 0, life: 1.6 + Math.random() * 1.8, s: 1 + Math.random() * 1.6 }); }
      }
    }
    for (let i = EM.length - 1; i >= 0; i--) { const e = EM[i]; e.a += dt; if (e.a > e.life) { EM.splice(i, 1); continue; } e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 6 * dt; const k = 1 - e.a / e.life; CTX.fillStyle = "rgba(255," + Math.round(90 + 130 * k) + "," + Math.round(30 * k) + "," + (.9 * k).toFixed(2) + ")"; CTX.beginPath(); CTX.arc(e.x, e.y, e.s * (.5 + k), 0, 6.3); CTX.fill(); }
  }

  /* ---------- simulasi penjalaran api (automata seluler) ---------- */
  const NB = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  function simStart(la, lo) {
    if (!F) return; const vb = map.getBounds(), b = { s: Math.max(vb.getSouth(), F.b.s), n: Math.min(vb.getNorth(), F.b.n), w: Math.max(vb.getWest(), F.b.w), e: Math.min(vb.getEast(), F.b.e) };
    if (la < b.s || la > b.n || lo < b.w || lo > b.e) { say("Titik di luar area analisis"); return; }
    const kmY = (b.n - b.s) * 111.32 / SG, kmX = (b.e - b.w) * 111.32 * Math.cos((b.n + b.s) / 2 * DEG) / SG, S = { b, kmX, kmY, st: new Uint8Array(SG * SG), age: new Float32Array(SG * SG), dur: new Float32Array(SG * SG), land: new Uint8Array(SG * SG), pe: new Uint8Array(SG * SG), z: new Float32Array(SG * SG), q: new Float32Array(SG * SG * 2), t: 0, cnt: 0, hits: {}, hitL: [], run: true };
    const cs = Math.min(kmX, kmY); S.dtH = clamp(cs * .5, .04, 1);
    for (let r = 0; r < SG; r++) for (let c = 0; c < SG; c++) {
      const i = r * SG + c, u = r / (SG - 1), v = c / (SG - 1), la2 = b.n - (b.n - b.s) * u, lo2 = b.w + (b.e - b.w) * v, fu = (F.b.n - la2) / (F.b.n - F.b.s), fv = (lo2 - F.b.w) / (F.b.e - F.b.w);
      S.q[i * 2] = fu; S.q[i * 2 + 1] = fv; S.z[i] = bil(F.elev, N, fu, fv); S.pe[i] = peatAt(la2, lo2); S.land[i] = (S.z[i] > .3 || S.pe[i]) ? 1 : 0;
    }
    const r0 = Math.round((b.n - la) / (b.n - b.s) * (SG - 1)), c0 = Math.round((lo - b.w) / (b.e - b.w) * (SG - 1)), i0 = r0 * SG + c0;
    if (!S.land[i0]) { say("Titik api harus di daratan"); return; }
    S.st[i0] = 1; S.dur[i0] = (S.pe[i0] ? 60 : 3) / S.dtH; S.cnt = 1; S.off = document.createElement("canvas"); S.off.width = S.off.height = SG; S.oc = S.off.getContext("2d"); S.im = S.oc.createImageData(SG, SG);
    const X = (F.X = F.X || exposure()); S.rp = X.pts.map(p => ({ i: Math.round((S.b.n - p.la) / (S.b.n - S.b.s) * (SG - 1)) * SG + Math.round((p.lo - S.b.w) / (S.b.e - S.b.w) * (SG - 1)), name: p.name, ok: p.la >= b.s && p.la <= b.n && p.lo >= b.w && p.lo <= b.e })).filter(p => p.ok);
    SIM = S; simArm = false; $("pqkIg") && $("pqkIg").classList.remove("on"); say("Api menyala. Simulasi berjalan.");
  }
  function simStep() {
    const S = SIM; if (!S || !S.run) return; const dayI = Math.min(F.days - 1, Math.floor((S.t + day * 24) / 24)), dang = F.danger[dayI], H = S.dtH, ign = [], die = [];
    for (let r = 0; r < SG; r++) for (let c = 0; c < SG; c++) {
      const i = r * SG + c; if (S.st[i] !== 1) continue; S.age[i]++;
      const [wu, wv, sp] = windAt(F, dayI, S.q[i * 2], S.q[i * 2 + 1]), wm = Math.max(sp, .01), dg = bil(dang, FG, S.q[i * 2], S.q[i * 2 + 1]);
      if (S.age[i] > S.dur[i] || (dg < .1 && !S.pe[i] && Math.random() < .35)) { die.push(i); continue; }
      for (const [dr, dc] of NB) {
        const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= SG || cc >= SG) continue; const j = rr * SG + cc; if (S.st[j] || !S.land[j]) continue;
        const dKm = Math.hypot(dr * S.kmY, dc * S.kmX), dgj = bil(dang, FG, S.q[j * 2], S.q[j * 2 + 1]), dot = (dc * S.kmX * wu / wm + (-dr) * S.kmY * wv / wm) / dKm;
        const ros = (.03 + .85 * Math.pow(dgj, 1.4) + (S.pe[j] ? .12 : 0)) * (.5 + .9 * lin(sp, 2, 35)), slope = 1 + clamp(2.5 * (S.z[j] - S.z[i]) / (dKm * 1000), -.5, 1.5);
        if (Math.random() < clamp(ros * H / dKm * Math.exp(.07 * sp * dot) * slope, 0, .95)) ign.push(j);
      }
    }
    die.forEach(i => { S.st[i] = 2; });
    ign.forEach(j => { if (!S.st[j]) { S.st[j] = 1; S.age[j] = 0; S.dur[j] = (S.pe[j] ? 36 + Math.random() * 40 : 2 + Math.random() * 3) / H; S.cnt++; } });
    S.t += H; S.rp.forEach(p => { if (S.st[p.i] && !S.hits[p.name]) { S.hits[p.name] = S.t; S.hitL.push([p.name, S.t]); } });
    if (S.t >= FUT * 24 - day * 24 - 1) S.run = false;
    let burning = 0; for (let i = 0; i < S.st.length; i++) if (S.st[i] === 1) burning++; if (!burning) S.run = false; S.burning = burning;
  }
  function drawSim(t) {
    const S = SIM; if (!S) return; const d = S.im.data;
    for (let i = 0; i < S.st.length; i++) {
      const s = S.st[i], o = i * 4; if (s === 1) { const a = clamp(S.age[i] / Math.min(S.dur[i], 14 / S.dtH)), fl = .75 + .25 * Math.random(); d[o] = 255; d[o + 1] = (240 - 190 * a) * fl; d[o + 2] = 60 * (1 - a) * fl; d[o + 3] = 245; }
      else if (s === 2) { d[o] = 40; d[o + 1] = 26; d[o + 2] = 24; d[o + 3] = 150; } else d[o + 3] = 0;
    }
    S.oc.putImageData(S.im, 0, 0); const nw = map.latLngToContainerPoint([S.b.n, S.b.w]), se = map.latLngToContainerPoint([S.b.s, S.b.e]);
    CTX.save(); CTX.globalCompositeOperation = "source-over"; CTX.imageSmoothingEnabled = true; CTX.drawImage(S.off, nw.x, nw.y, se.x - nw.x, se.y - nw.y);
    CTX.globalCompositeOperation = "lighter"; CTX.filter = "blur(5px)"; CTX.globalAlpha = .55; CTX.drawImage(S.off, nw.x, nw.y, se.x - nw.x, se.y - nw.y); CTX.restore();
  }
  function simInfo() {
    const S = SIM, el = $("pqkSim"); if (!el) return; if (!S) { el.innerHTML = '<div class="pqk-note">Tekan <b>Nyalakan api</b>, lalu ketuk titik di daratan. Api merambat 8 arah mengikuti <b>angin</b> (searah angin jauh lebih cepat), <b>kekeringan bahan bakar</b>, <b>lereng</b> (naik lereng lebih cepat) dan <b>gambut</b> (membara lama). Cuaca berganti mengikuti prakiraan harian.</div>'; return; }
    const ha = S.cnt * S.kmX * S.kmY * 100, hh = S.t, dd = Math.floor(hh / 24);
    el.innerHTML = '<div class="pqk-cards"><div class="pqk-card"><b>' + (dd ? dd + "hr " : "") + Math.floor(hh % 24) + 'j</b><small>Waktu</small></div><div class="pqk-card"><b style="color:#fb7185">' + (ha >= 100 ? Math.round(ha).toLocaleString("id-ID") : ha.toFixed(1)) + '</b><small>Terbakar (ha)</small></div><div class="pqk-card"><b>' + (S.burning || 0) + '</b><small>Sel menyala</small></div></div>' +
      '<div class="pqk-h">Aset terjangkau api' + (S.run ? " (berjalan…)" : " (selesai)") + "</div>" + (S.hitL.length ? S.hitL.slice(-8).reverse().map(h => '<div class="pqk-it"><i style="background:#ef4444"></i><div><b>' + esc(h[0]) + "</b><small>T+" + Math.floor(h[1]) + " jam sejak penyalaan</small></div></div>").join("") : '<div class="pqk-note">Belum ada ruas/jembatan terjangkau.</div>');
  }

  /* ---------- loop ---------- */
  function loop(ts) {
    raf = requestAnimationFrame(loop); if (!Pn || Pn.style.display === "none" || !F) return; const dt = Math.min(.05, (ts - lastT) / 1000 || .016); lastT = ts;
    stepFx(dt); if (SIM) { if (SIM.run) { SIM._a = (SIM._a || 0) + dt * 14 * simSpeed; let k = 0; while (SIM._a >= 1 && k++ < 12) { SIM._a--; simStep(); } } drawSim(ts); SIM._i = (SIM._i || 0) + 1; if (SIM._i % 12 === 0) simInfo(); }
  }

  /* ---------- panel ---------- */
  function css() {
    if ($("pqkCss")) return; const s = document.createElement("style"); s.id = "pqkCss";
    s.textContent = "#pqkPanel{position:fixed;right:12px;top:70px;z-index:1300;width:min(390px,94vw);max-height:calc(100vh - 92px);display:none;flex-direction:column;background:#120b0af7;border:1px solid #5a2a22;border-radius:14px;color:var(--text,#f3e3dc);font:12.5px/1.45 var(--mono,system-ui);box-shadow:0 14px 40px #000a,0 0 34px #f9731622;backdrop-filter:blur(10px)}#pqkPanel.pqk-min #pqkBody,#pqkPanel.pqk-min #pqkCtl,#pqkPanel.pqk-min #pqkTabs,#pqkPanel.pqk-min #pqkDays{display:none}" +
      "#pqkHd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #4a2620}#pqkHd b{flex:1;font-size:13.5px}#pqkHd i.fl{color:#fb923c;animation:pqkf 1.1s ease-in-out infinite alternate}@keyframes pqkf{from{filter:drop-shadow(0 0 2px #f97316);transform:scale(1)}to{filter:drop-shadow(0 0 9px #ef4444);transform:scale(1.18)}}#pqkHd button{background:0 0;border:0;color:#c9a99c;cursor:pointer;font-size:15px;padding:3px 6px}#pqkHd button:hover{color:#fb923c}" +
      "#pqkTabs{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;padding:10px 12px 4px}.pqk-t{display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 4px;border-radius:9px;border:1px solid #4a2620;background:#1c110f;color:#c9a99c;font:700 11px var(--mono,system-ui);cursor:pointer}.pqk-t.on{color:#1a0a05;border-color:transparent}" +
      "#pqkDays{display:flex;gap:4px;padding:6px 12px 2px;align-items:flex-end}.pqk-d{flex:1;border:1px solid #4a2620;border-radius:8px;background:#1c110f;color:#c9a99c;cursor:pointer;padding:3px 0 4px;text-align:center;font:700 9.5px var(--mono,system-ui)}.pqk-d i{display:block;margin:0 auto 3px;width:70%;border-radius:3px 3px 0 0;min-height:3px}.pqk-d.on{border-color:#fb923c;color:#fff;box-shadow:0 0 10px #f9731655}" +
      "#pqkCtl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 12px}#pqkCtl input[type=range]{flex:1;min-width:70px;accent-color:#fb923c}.pqk-b{background:#1c110f;border:1px solid #4a2620;color:#f3e3dc;border-radius:8px;padding:6px 10px;font:700 11px var(--mono,system-ui);cursor:pointer}.pqk-b:hover,.pqk-b.on{border-color:#fb923c;color:#fb923c}.pqk-b.pri{background:#f97316;color:#1a0a05;border-color:#f97316}" +
      "#pqkSt{padding:2px 12px 6px;font-size:10.5px;color:#b59486}#pqkBody{overflow:auto;padding:0 12px 12px}.pqk-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:6px 0 10px}.pqk-card{background:#1c110f;border:1px solid #4a2620;border-radius:10px;padding:8px 6px;text-align:center}.pqk-card b{display:block;font-size:16px}.pqk-card small{font-size:9px;color:#b59486;text-transform:uppercase;letter-spacing:.4px}" +
      ".pqk-leg{height:9px;border-radius:5px;background:linear-gradient(90deg,#fde68a,#fb923c,#ef4444,#991b1b,#58103c);margin:4px 0 2px}.pqk-legl{display:flex;justify-content:space-between;font-size:9.5px;color:#b59486}.pqk-h{margin:12px 0 6px;font:800 11px var(--mono,system-ui);letter-spacing:.4px;text-transform:uppercase;color:#fb923c}" +
      ".pqk-drv{display:grid;grid-template-columns:repeat(2,1fr);gap:5px 10px;font-size:11px}.pqk-drv span{color:#b59486}.pqk-adv{margin:0;padding-left:16px;font-size:11.5px}.pqk-adv li{margin:3px 0}.pqk-it{display:flex;align-items:center;gap:8px;padding:7px 4px;border-bottom:1px solid #3a1e19;cursor:pointer}.pqk-it:hover{background:#f9731618}.pqk-it i{width:9px;height:9px;border-radius:50%;flex:none}.pqk-it div{flex:1;min-width:0}.pqk-it b{display:block;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pqk-it small{color:#b59486;font-size:10px}.pqk-it em{font-style:normal;font-weight:800;font-size:11.5px}" +
      ".pqk-note{font-size:10px;color:#b59486;line-height:1.55;margin-top:10px;padding:8px;border:1px solid #4a2620;border-radius:9px;background:#1c110f}.pqk-note a{color:#fb923c}.pqk-pop{font:12px var(--mono,system-ui);min-width:200px}.pqk-pop b{display:block;font-size:12.5px}.pqk-pop small{display:block;color:#64748b;margin:2px 0 6px}.pqk-bar{display:flex;align-items:center;gap:6px;margin:3px 0;font-size:10.5px}.pqk-bar span{width:96px;flex:none}.pqk-bar i{flex:1;height:6px;background:#e2e8f0;border-radius:4px;overflow:hidden}.pqk-bar b{display:block;height:100%}.pqk-bar em{width:32px;text-align:right;font-style:normal;font-weight:700}" +
      "@media(max-width:860px){#pqkPanel{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:64vh}}";
    document.head.appendChild(s);
  }
  function build() {
    css(); Pn = document.createElement("div"); Pn.id = "pqkPanel";
    Pn.innerHTML = '<div id="pqkHd"><i class="fa-solid fa-fire fl"></i><b>Karhutla: Rawan &amp; Potensi</b><button id="pqkRf" title="Analisis ulang area peta ini"><i class="fa-solid fa-arrows-rotate"></i></button><button id="pqkMn" title="Perkecil">&minus;</button><button id="pqkX" title="Tutup"><i class="fa-solid fa-xmark"></i></button></div><div id="pqkTabs">' +
      Object.keys(TAB).map(k => '<button class="pqk-t" data-k="' + k + '"><i class="fa-solid ' + TAB[k][1] + '"></i>' + TAB[k][0] + "</button>").join("") +
      '</div><div id="pqkDays"></div><div id="pqkCtl"><i class="fa-solid fa-droplet" title="Transparansi"></i><input id="pqkOp" type="range" min="20" max="100"><button class="pqk-b pri" id="pqkRun"><i class="fa-solid fa-crosshairs"></i> Analisis</button><button class="pqk-b" id="pqkPl" title="Putar time-lapse 7 hari"><i class="fa-solid fa-play"></i></button><button class="pqk-b on" id="pqkFx" title="Animasi angin & bara"><i class="fa-solid fa-wind"></i></button></div><div id="pqkSt"></div><div id="pqkBody"></div>';
    document.body.appendChild(Pn); try { L.DomEvent.disableClickPropagation(Pn); L.DomEvent.disableScrollPropagation(Pn); } catch (e) { }
    $("pqkOp").value = op * 100; $("pqkOp").oninput = e => { op = e.target.value / 100; if (IMG) IMG.setOpacity(op); savePref(); };
    $("pqkX").onclick = close; $("pqkMn").onclick = () => { minim = !minim; Pn.classList.toggle("pqk-min", minim); $("pqkMn").innerHTML = minim ? "&#9633;" : "&minus;"; };
    $("pqkRf").onclick = $("pqkRun").onclick = run; $("pqkPl").onclick = togglePlay;
    $("pqkFx").classList.toggle("on", fxOn); $("pqkFx").onclick = () => { fxOn = !fxOn; $("pqkFx").classList.toggle("on", fxOn); savePref(); if (CTX) CTX.clearRect(0, 0, FX.width, FX.height); };
    $("pqkTabs").onclick = e => { const t = e.target.closest(".pqk-t"); if (t) setTab(t.dataset.k); };
    $("pqkDays").onclick = e => { const t = e.target.closest(".pqk-d"); if (t) { stopPlay(); setDay(+t.dataset.d); } };
    $("pqkBody").onclick = e => {
      const ig = e.target.closest("#pqkIg"), rs = e.target.closest("#pqkRs"), sp = e.target.closest("#pqkSp"), it = e.target.closest("[data-go]");
      if (ig) { simArm = !simArm; ig.classList.toggle("on", simArm); if (simArm) { say("Ketuk titik di peta untuk menyalakan api"); map.once("click", ev => { if (simArm) simStart(ev.latlng.lat, ev.latlng.lng); }); } }
      else if (rs) { SIM = null; simInfo(); if (CTX) CTX.clearRect(0, 0, FX.width, FX.height); }
      else if (sp) { simSpeed = simSpeed >= 8 ? 1 : simSpeed * 2; sp.textContent = "Kecepatan ×" + simSpeed; }
      else if (it && it.dataset.go) { const [la, lo] = it.dataset.go.split(",").map(Number); map.flyTo([la, lo], Math.max(map.getZoom(), 14), { duration: .7 }); }
    };
  }
  function tabs() { document.querySelectorAll(".pqk-t").forEach(t => { const on = t.dataset.k === tab; t.classList.toggle("on", on); t.style.background = on ? TAB[t.dataset.k][2] : ""; }); const dv = $("pqkDays"); if (dv) dv.style.display = F && F.wx && tab !== "rawan" ? "flex" : "none"; }
  function setTab(k) { tab = k; savePref(); tabs(); if (k === "wil") wilEnsure(); else rgClear(); if (F) { paint(); F.X = null; body(); markers(F.X = exposure()); } }
  function setDay(d) { day = clamp(d, 0, (F ? F.days : FUT) - 1); if (tab === "wil") rgDraw(); if (F) { paint(); F.X = exposure(); markers(F.X); body(); days(); } }
  function stopPlay() { if (play) { clearInterval(play); play = null; } const b = $("pqkPl"); if (b) b.innerHTML = '<i class="fa-solid fa-play"></i>'; }
  function togglePlay() { if (play) { stopPlay(); return; } if (!F || !F.wx) { say("Butuh data cuaca"); return; } if (tab === "rawan") setTab("potensi"); $("pqkPl").innerHTML = '<i class="fa-solid fa-pause"></i>'; play = setInterval(() => setDay((day + 1) % F.days), 1500); }
  function days() {
    const dv = $("pqkDays"); if (!dv || !F || !F.wx) return;
    dv.innerHTML = F.danger.map((f, d) => { let m = 0; for (let i = 0; i < f.length; i++) if (F.land[i] && f[i] > m) m = f[i]; return '<button class="pqk-d' + (d === day ? " on" : "") + '" data-d="' + d + '"><i style="height:' + Math.round(6 + 34 * m) + "px;background:" + LV[lvi(m)][1] + '"></i>' + (d === 0 ? "Ini" : dayName(d).replace(",", "")) + "</button>"; }).join("");
  }
  const setSt = m => { const e = $("pqkSt"); if (e) e.innerHTML = m; };
  const ADV = [
    ["Kondisi aman: tetap pantau, bersihkan sampah kering/serasah di tepi jalan."],
    ["Patroli rutin pada ruas tepi hutan/kebun; larang pembakaran lahan & puntung rokok di bahu jalan."],
    ["Siagakan pos pemadam & sumber air (embung/kanal) dekat ruas; patroli pagi-sore; pasang rambu rawan kebakaran.", "Waspada asap: jarak pandang turun di ruas & jembatan, siapkan rambu/lampu dan pembatasan kecepatan."],
    ["Status siaga: koordinasi BPBD/Manggala Agni; siapkan penutupan sementara ruas yang berasap tebal.", "Lahan gambut: api membara di bawah tanah dan bisa merusak badan jalan/oprit; periksa amblasan setelah kebakaran.", "Jauhkan bahan mudah terbakar dari jembatan kayu/komposit & PJU."]
  ];

  function body() {
    if (!F) return; const f = fld(), land = []; for (let i = 0; i < f.length; i++) if (F.land[i]) land.push(f[i]);
    const X = F.X = F.X || exposure(), mxv = land.length ? Math.max(...land) : 0, hi = land.length ? land.filter(v => v >= .55).length / land.length : 0, top = lvi(mxv), hiRoads = X.roads.filter(r => r.mx >= .55).length;
    let h = tab === "wil" ? wilHtml() : "";
    if (tab === "sim") {
      h += '<div class="pqk-cards" style="grid-template-columns:repeat(3,1fr)"><button class="pqk-b pri" id="pqkIg"><i class="fa-solid fa-fire"></i> Nyalakan api</button><button class="pqk-b" id="pqkSp">Kecepatan ×' + simSpeed + '</button><button class="pqk-b" id="pqkRs"><i class="fa-solid fa-rotate-left"></i> Reset</button></div><div id="pqkSim"></div>';
    } else {
      h += '<div class="pqk-cards"><div class="pqk-card"><b style="color:' + LV[top][1] + '">' + pct(mxv) + "</b><small>" + (tab === "rawan" ? "Kerawanan maks" : "Potensi maks") + '</small></div><div class="pqk-card"><b>' + pct(hi) + '</b><small>Area tinggi</small></div><div class="pqk-card"><b>' + hiRoads + "</b><small>Ruas terpapar</small></div></div>";
    }
    h += '<div class="pqk-leg"></div><div class="pqk-legl"><span>Rendah</span><span>Sedang</span><span>Tinggi</span><span>Sangat tinggi</span></div>';
    if (F.wx) {
      const W = F.W[Math.min(day, F.days - 1)], av = a => a.reduce((s, v) => s + v, 0) / a.length;
      h += '<div class="pqk-h">Pemicu api · ' + (tab === "rawan" ? dayName(0) : dayName(day)) + '</div><div class="pqk-drv"><div><span>Kekeringan bahan bakar</span><br><b>' + pct(av(W.D)) + '</b></div><div><span>Hari tanpa hujan (&ge;3mm)</span><br><b>' + Math.round(av(W.dth)) + ' hari</b></div><div><span>Kelembapan min</span><br><b>' + Math.round(av(W.rh)) + '%</b></div><div><span>Suhu maks</span><br><b>' + av(W.tmax).toFixed(0) + '&deg;C</b></div><div><span>Angin maks</span><br><b>' + Math.max(...W.wind).toFixed(0) + ' km/j</b></div><div><span>Hujan hari itu</span><br><b>' + av(W.rain).toFixed(1) + " mm</b></div></div>";
    } else h += '<div class="pqk-note" style="border-color:#f59e0b">Data cuaca gagal dimuat: hanya <b>kerawanan statis</b> (gambut &amp; dataran rendah). Potensi harian & simulasi memerlukan cuaca. Coba analisis ulang.</div>';
    if (tab !== "sim") {
      h += '<div class="pqk-h">Rekomendasi tindakan</div><ul class="pqk-adv">' + (ADV[top] || []).map(a => "<li>" + esc(a) + "</li>").join("") + "</ul>";
    }
    h += '<div class="pqk-h">Ruas paling terpapar (' + X.roads.length + " di area)</div>";
    h += X.roads.slice(0, 8).map(r => { const l = lvi(r.mx), g = r.mp ? r.mp.lat + "," + r.mp.lng : ""; return '<div class="pqk-it" data-go="' + g + '"><i style="background:' + LV[l][1] + '"></i><div><b>' + esc(r.rd.name) + "</b><small>maks " + pct(r.mx) + " · " + pct(r.share) + ' titik tinggi</small></div><em style="color:' + LV[l][1] + '">' + LV[l][0] + "</em></div>"; }).join("") || '<div class="pqk-note">Tidak ada ruas PETAQU di area ini.</div>';
    h += '<div class="pqk-h">Jembatan paling terpapar (' + X.br.length + ")</div>";
    h += X.br.slice(0, 6).map(x => { const l = lvi(x.v); return '<div class="pqk-it" data-go="' + x.la + "," + x.lo + '"><i style="background:' + LV[l][1] + '"></i><div><b>' + esc(x.j.nama || "Jembatan") + "</b><small>" + esc(x.j.ruas || "") + '</small></div><em style="color:' + LV[l][1] + '">' + pct(x.v) + "</em></div>"; }).join("") || '<div class="pqk-note">Tidak ada jembatan di area ini.</div>';
    h += '<div class="pqk-note"><b>Metode:</b> kekeringan bahan bakar = neraca air (hujan &minus; 0,85&times;evapotranspirasi, 30 hari + prakiraan) &rarr; &times; cuaca api (kelembapan min, suhu, angin) &times; bahan bakar (gambut +, dataran rendah +, pegunungan &minus;), hujan &ge;10 mm memadamkan. Zona gambut berupa poligon <b>kasar</b>. Ini <b>indikatif</b> untuk prioritas patroli/inspeksi, bukan pengganti <a href="https://sipongi.menlhk.go.id" target="_blank" rel="noopener">SiPongi KLHK</a>, <a href="https://firms.modaps.eosdis.nasa.gov/map/" target="_blank" rel="noopener">NASA FIRMS</a> (titik panas satelit nyata) &amp; peringatan BMKG. Sumber: Open-Meteo.</div>';
    $("pqkBody").innerHTML = h; if (tab === "sim") simInfo(); if (tab === "wil") wilBind();
  }


  /* ---------- WILAYAH: semua provinsi, kabupaten & kota ---------- */
  function wilEnsure(cb) {
    const go = () => { const R = window.PETAQU_RAWAN; if (!R || !R._t || !R._t.build) { say("Modul Rawan belum siap, coba lagi"); return; } if (!KAB) { try { KAB = R._t.build(); } catch (e) { console.warn(e); say("Gagal memuat batas wilayah"); return; } } rgDraw(); if (tab === "wil") { wilList(); } cb && cb(); };
    if (window.PQ_KABBATAS) { go(); return; } say("Memuat batas wilayah…"); const sc = document.createElement("script"); sc.src = "data-kabbatas.js"; sc.onload = go; sc.onerror = () => say("Gagal memuat data-kabbatas.js"); document.head.appendChild(sc);
  }
  const wst = K => (K.h && K.h.karhutla != null ? K.h.karhutla : 0) / 100;
  const wval = (K, i) => WR.dyn && WR.dyn[i] ? WR.dyn[i][Math.min(day, FUT - 1)] : wst(K);
  function wrows() { if (!KAB) return []; const q = WR.q.trim().toLowerCase(); return KAB.map((K, i) => ({ K, i, v: wval(K, i) })).filter(r => (!WR.prov || r.K.p === WR.prov) && (!q || (r.K.n + " " + r.K.p).toLowerCase().includes(q))); }
  function wilHtml() {
    const P = KAB ? Object.keys(KAB.PM || {}).sort() : [];
    return '<div id="pqkWil"><div class="pqk-cards" style="grid-template-columns:1fr 1fr;margin-bottom:6px"><select class="pqk-b" id="pqkPv" style="grid-column:1/3"><option value="">Semua Indonesia (' + (KAB ? KAB.length : "…") + ' kab/kota)</option>' + P.map(x => '<option value="' + esc(x) + '"' + (x === WR.prov ? " selected" : "") + ">" + esc(x) + "</option>").join("") + '</select><input class="pqk-b" id="pqkQ" placeholder="Cari kab/kota…" value="' + esc(WR.q) + '" style="font-weight:400"><button class="pqk-b pri" id="pqkDy" title="Ambil cuaca 7 hari tiap wilayah (±' + (KAB ? Math.ceil(KAB.length / 50) : 11) + ' permintaan)">' + (WR.dyn ? "Perbarui potensi" : "Hitung potensi 7 hari") + '</button></div><div id="pqkWs" class="pqk-note" style="margin:0 0 6px">' + (WR.dyn ? "Warna & urutan = <b>potensi " + esc(dayName(day)) + "</b> (pilih hari di atas)." : "Warna & urutan = <b>kerawanan statis</b> (skor wilayah). Tekan <b>Hitung potensi 7 hari</b> untuk potensi dinamis semua wilayah.") + '</div>' + (REG ? regCard() : "") + '<div id="pqkWl"></div></div>';
  }
  function wilBind() {
    const pv = $("pqkPv"), q = $("pqkQ"), dy = $("pqkDy"), wl = $("pqkWl");
    if (pv) pv.onchange = () => { WR.prov = pv.value; rgDraw(true); wilList(); };
    if (q) q.oninput = () => { WR.q = q.value; wilList(); };
    if (dy) dy.onclick = wilDyn;
    if (wl) wl.onclick = e => { const it = e.target.closest("[data-k]"); if (it) wilFocus(+it.dataset.k); };
    wilList();
  }
  function wilList() {
    const wl = $("pqkWl"); if (!wl) return; if (!KAB) { wl.innerHTML = '<div class="pqk-note">Memuat batas wilayah…</div>'; return; }
    const R = wrows().sort((a, b) => b.v - a.v);
    wl.innerHTML = '<div class="pqk-h">' + R.length + " wilayah · urut tertinggi</div>" + R.slice(0, 80).map(r => { const l = lvi(r.v); return '<div class="pqk-it" data-k="' + r.i + '"><i style="background:' + LV[l][1] + '"></i><div><b>' + esc(r.K.n) + "</b><small>" + esc(r.K.p) + '</small></div><em style="color:' + LV[l][1] + '">' + pct(r.v) + "</em></div>"; }).join("") + (R.length > 80 ? '<div class="pqk-note">Menampilkan 80 teratas — persempit dengan provinsi/pencarian.</div>' : "");
  }
  function rgClear() { if (RG) { map.removeLayer(RG); RG = null; } if (HL) { map.removeLayer(HL); HL = null; } }
  function rgDraw(fit) {
    if (!KAB || tab !== "wil") return; if (RG) map.removeLayer(RG);
    if (!map.getPane("pqkRg")) { map.createPane("pqkRg"); map.getPane("pqkRg").style.zIndex = 260; }
    RG = L.layerGroup().addTo(map); const rend = L.canvas({ pane: "pqkRg" }); let s = 90, w = 180, n = -90, e = -180, any = false;
    wrows().forEach(r => { const K = r.K, l = lvi(r.v), b = K.bb; any = true; s = Math.min(s, b[0]); w = Math.min(w, b[1]); n = Math.max(n, b[2]); e = Math.max(e, b[3]);
      L.polygon(K.rings, { renderer: rend, pane: "pqkRg", color: "#1b0f0d", weight: .7, fillColor: LV[l][1], fillOpacity: .42 }).bindTooltip(esc(K.n) + " · " + pct(r.v) + " (" + LV[l][0] + ")", { sticky: true }).on("click", () => wilFocus(r.i)).addTo(RG); });
    if (fit && any) map.fitBounds([[s, w], [n, e]], { padding: [30, 30] });
  }
  function wilFocus(i) {
    const K = KAB[i]; if (!K) return; REG = { K, i }; if (HL) map.removeLayer(HL); HL = L.polygon(K.rings, { color: "#fff", weight: 2.5, fill: false, interactive: false }).addTo(map);
    map.fitBounds([[K.bb[0], K.bb[1]], [K.bb[2], K.bb[3]]], { padding: [30, 30] }); busy = false; map.once("moveend", () => setTimeout(() => run().then(() => { if (tab === "wil") body(); }), 150));
  }
  function regStats(R) {
    if (!F) return null; const K = R.K, o = []; for (let d = 0; d < F.days; d++) o.push({ mx: 0, sum: 0, n: 0 });
    for (let r = 0; r < FG; r++) for (let c = 0; c < FG; c++) { const i = r * FG + c; if (!F.land[i]) continue; const la = F.b.n - (F.b.n - F.b.s) * r / (FG - 1), lo = F.b.w + (F.b.e - F.b.w) * c / (FG - 1); if (la < K.bb[0] || la > K.bb[2] || lo < K.bb[1] || lo > K.bb[3] || !K.rings.some(g => inPoly(la, lo, g))) continue; for (let d = 0; d < F.days; d++) { const v = F.danger[d][i]; o[d].n++; o[d].sum += v; if (v > o[d].mx) o[d].mx = v; } }
    return o[0].n ? o : null;
  }
  function regCard() {
    const R = REG, st = wst(R.K), S = regStats(R); let h = '<div class="pqk-note" style="border-color:#a78bfa;margin:0 0 8px"><b>' + esc(R.K.n) + "</b> · " + esc(R.K.p) + "<br>Kerawanan statis <b style=\"color:" + LV[lvi(st)][1] + '">' + pct(st) + " (" + LV[lvi(st)][0] + ")</b>";
    if (S) h += '<div style="display:flex;gap:3px;margin-top:6px;align-items:flex-end">' + S.map((x, d) => { const m = x.mx; return '<div style="flex:1;text-align:center;font-size:9px"><i style="display:block;margin:0 auto 2px;width:70%;height:' + Math.round(4 + 28 * m) + "px;background:" + LV[lvi(m)][1] + ';border-radius:3px 3px 0 0"></i>' + (d === 0 ? "Ini" : dayName(d).split(" ")[0].replace(",", "")) + "<br><b>" + Math.round(m * 100) + "</b></div>"; }).join("") + "</div><small>Potensi maks tiap hari di dalam wilayah (rata-rata hari ini " + Math.round(S[0].sum / S[0].n * 100) + "%)</small>"; else h += "<br><small>Analisis potensi sedang dimuat / wilayah di luar area analisis…</small>";
    return h + "</div>";
  }
  async function wilDyn() {
    if (!KAB || WR.busy) return; WR.busy = true; const st = $("pqkWs"), N50 = 50, dy = new Array(KAB.length);
    try {
      for (let a = 0; a < KAB.length; a += N50) {
        const part = KAB.slice(a, a + N50); if (st) st.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Cuaca wilayah ' + Math.min(a + N50, KAB.length) + "/" + KAB.length + "…";
        const J = await cached("wr" + a + ":" + part.length, 18e5, async () => { const j = await jget("https://api.open-meteo.com/v1/forecast?latitude=" + part.map(K => K.c[0].toFixed(3)) + "&longitude=" + part.map(K => K.c[1].toFixed(3)) + "&daily=temperature_2m_max,relative_humidity_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,precipitation_sum,et0_fao_evapotranspiration&past_days=" + PAST + "&forecast_days=" + FUT + "&timezone=auto", 40000); return (Array.isArray(j) ? j : [j]).map(o => o.daily || {}); });
        part.forEach((K, k) => { const m = pointModel(J[k] || {}), pe = peatAt(K.c[0], K.c[1]), sf = .45 + .75 * wst(K); dy[a + k] = m.dang.map(v => clamp(v * sf * (1 + .25 * pe))); });
        if (a + N50 < KAB.length) await new Promise(r => setTimeout(r, 400));
      }
      WR.dyn = dy; say("Potensi 7 hari semua wilayah siap"); rgDraw(); if (tab === "wil") body();
    } catch (e) { console.warn(e); if (st) st.innerHTML = '<span style="color:#f87171">Gagal memuat cuaca wilayah (' + esc(e.message || e) + "). Coba lagi nanti (batas gratis Open-Meteo).</span>"; }
    WR.busy = false;
  }

  async function run() {
    if (busy || typeof map === "undefined") return; busy = true; setSt('<i class="fa-solid fa-circle-notch fa-spin"></i> Mengambil elevasi &amp; cuaca…');
    const bb = map.getBounds(); let s = bb.getSouth(), n = bb.getNorth(), w = bb.getWest(), e = bb.getEast(), cut = false;
    const fit = (a, c, mn) => { let m = (a + c) / 2, sp = c - a; if (sp > 2) { sp = 2; cut = true; } if (sp < mn) sp = mn; return [m - sp / 2, m + sp / 2]; };
    [s, n] = fit(s, n, .05); [w, e] = fit(w, e, .05); const b = { s, n, w, e }, key = [s, w, n, e].map(v => v.toFixed(2)).join(",");
    try {
      const wxp = cached("wx" + key, 18e5, () => getWx(b)).catch(() => null), el = await cached("el" + key, 864e5, () => getElev(b)), wx = await wxp;
      F = analyze(b, el, wx); SIM = null; day = Math.min(day, F.days - 1); paint(); F.X = exposure(); markers(F.X); tabs(); days(); body(); fxStart();
      setSt("Diperbarui " + new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + (wx ? " · cuaca " + NW + "&times;" + NW + " + 7 hari" : " (tanpa cuaca)") + (cut ? " · area dibatasi 2&deg;" : ""));
    } catch (err) { console.warn("Karhutla:", err); setSt('<span style="color:#f87171">Gagal memuat data (' + esc(err.message || err) + "). Periksa internet lalu coba lagi.</span>"); }
    busy = false;
  }
  function fxStart() { fxInit(); if (!raf) raf = requestAnimationFrame(loop); }
  function open() { if (typeof map === "undefined") return; if (!Pn) build(); Pn.style.display = "flex"; tabs(); if (tab === "wil") wilEnsure(); fxStart(); if (!F) run(); else { paint(); markers(F.X = exposure()); } }
  function close() { stopPlay(); rgClear(); if (Pn) Pn.style.display = "none"; if (IMG) { map.removeLayer(IMG); IMG = null; } if (MK) { map.removeLayer(MK); MK = null; } if (CTX) CTX.clearRect(0, 0, FX.width, FX.height); if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  function init() {
    const b = document.createElement("button"); b.innerHTML = '<i class="fa-solid fa-fire"></i>'; b.title = "Rawan & potensi kebakaran hutan/lahan (animasi)"; b.onclick = open;
    const put = () => { try { PQ_DOCK.adopt(b, "Karhutla"); } catch (e) { b.style.cssText = "position:fixed;left:10px;bottom:320px;z-index:900"; document.body.append(b); } };
    typeof PQ_DOCK !== "undefined" ? put() : setTimeout(put, 900);
  }
  window.PETAQU_KARHUTLA = { open, close, run, _analyze: analyze, _pointModel: pointModel, _bil: bil, _peat: peatAt };
  if (typeof document !== "undefined" && document.readyState !== undefined) document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
