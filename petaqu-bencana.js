/* PETAQU Rawan Bencana: peta risiko banjir, longsor, kekeringan, angin kencang, rob/tsunami & gabungan.
   Cara kerja: DEM (elevasi) + prakiraan/riwayat hujan & angin Open-Meteo (gratis, tanpa key) pada area peta yang tampil
   -> kerentanan medan (statis) x pemicu cuaca (dinamis) -> heatmap + paparan ruas jalan & jembatan PETAQU.
   Indikatif untuk prioritas inspeksi; resmi: BMKG (peringatan dini), BNPB InaRISK, PVMBG (gerakan tanah). */
(function () {
  "use strict";
  const DEG = Math.PI / 180, N = 10, NW = 5, PAST = 30, FUT = 7, PREF = "petaqu_bencana_v1";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = m => { try { toast(m, 3200); } catch (e) { } };
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const lin = (x, a, b) => clamp((x - a) / (b - a));
  const HZ = {
    banjir: { n: "Banjir", ic: "fa-water", c: "#38bdf8" },
    longsor: { n: "Longsor", ic: "fa-mountain", c: "#f59e0b" },
    kering: { n: "Kekeringan", ic: "fa-sun-plant-wilt", c: "#facc15" },
    angin: { n: "Angin Kencang", ic: "fa-wind", c: "#a78bfa" },
    pesisir: { n: "Rob & Tsunami", ic: "fa-house-tsunami", c: "#22d3ee" },
    semua: { n: "Gabungan", ic: "fa-layer-group", c: "#f43f5e" }
  };
  const KEYS = ["banjir", "longsor", "kering", "angin", "pesisir"];
  const ADV = {
    banjir: ["Cek & bersihkan gorong-gorong, saluran dan inlet di titik rendah/cekungan sebelum hujan.", "Siapkan rambu genangan, barikade & rute alternatif; pantau muka air di jembatan (freeboard, pilar, oprit).", "Segmen dengan IRI tinggi (retak/lubang) + genangan cepat rusak: prioritaskan inspeksi."],
    longsor: ["Inspeksi tebing, talud & bahu jalan: retakan tanah, rembesan air, pohon miring.", "Siagakan alat berat & material di pos terdekat; pasang rambu rawan longsor.", "Hindari galian/timbunan baru di lereng saat musim hujan."],
    kering: ["Tanah menyusut: waspada retak memanjang & amblas di timbunan, oprit dan bahu jalan.", "Waspada kebakaran lahan/semak di sisi jalan.", "Manfaatkan periode kering untuk perbaikan perkerasan dan pembersihan drainase."],
    angin: ["Pangkas ranting & pohon rapuh di tepi jalan; periksa rambu, PJU dan reklame.", "Siagakan tim evakuasi pohon tumbang pada ruas bernilai tinggi."],
    pesisir: ["Periksa elevasi muka jalan dan tanggul/pelindung terhadap rob & gelombang tinggi.", "Pastikan rambu & jalur evakuasi tsunami jelas; pintu air/pompa berfungsi.", "Hasil statis & indikatif; rujukan resmi: BMKG InaTEWS / BNPB InaRISK."],
    semua: ["Fokuskan inspeksi pada ruas & jembatan dengan indeks gabungan tinggi (daftar di bawah).", "Pantau peringatan dini BMKG harian dan perbarui analisis saat cuaca berubah."]
  };
  const STOPS = [[0, [34, 197, 94, 0]], [.2, [34, 197, 94, 70]], [.4, [250, 204, 21, 150]], [.6, [249, 115, 22, 185]], [.8, [239, 68, 68, 205]], [1, [126, 34, 206, 225]]];
  function ramp(t) { t = clamp(t); for (let k = 1; k < STOPS.length; k++) if (t <= STOPS[k][0]) { const a = STOPS[k - 1], b = STOPS[k], f = (t - a[0]) / (b[0] - a[0]); return a[1].map((v, i) => v + (b[1][i] - v) * f); } return STOPS[STOPS.length - 1][1]; }
  const LV = [["Rendah", "#22c55e"], ["Sedang", "#facc15"], ["Tinggi", "#f97316"], ["Sangat tinggi", "#ef4444"]];
  const lvi = t => t < .25 ? 0 : t < .45 ? 1 : t < .65 ? 2 : 3;
  const pct = t => Math.round(t * 100) + "%";

  /* ---------- jaringan & cache ---------- */
  async function jget(url, ms) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms || 20000);
    try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } finally { clearTimeout(t); }
  }
  async function cached(key, ttl, fn) {
    try { const c = JSON.parse(sessionStorage.getItem("pqb:" + key) || "null"); if (c && Date.now() - c.t < ttl) return c.v; } catch (e) { }
    const v = await fn(); try { sessionStorage.setItem("pqb:" + key, JSON.stringify({ t: Date.now(), v })); } catch (e) { } return v;
  }
  const gridPts = (b, n) => { const la = [], lo = []; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { la.push((b.n - (b.n - b.s) * r / (n - 1)).toFixed(4)); lo.push((b.w + (b.e - b.w) * c / (n - 1)).toFixed(4)); } return [la, lo]; };
  async function getElev(b) { /* 5 titik per sel (pusat + 4 arah +-300 m): elevasi grid & kemiringan LOKAL yang tidak bergantung zoom */
    const [la, lo] = gridPts(b, N), dLa = 300 / 111320, mid = (b.n + b.s) / 2, dLo = 300 / (111320 * Math.cos(mid * DEG)), f = a => a.map(Number);
    const q = (A, O) => jget("https://api.open-meteo.com/v1/elevation?latitude=" + A.map(v => v.toFixed(5)) + "&longitude=" + O.map(v => v.toFixed(5))).then(j => { if (!j.elevation || j.elevation.length !== N * N) throw new Error("elevasi tidak lengkap"); return j.elevation; });
    const LA = f(la), LO = f(lo), [c, nn, ss, ee, ww] = await Promise.all([q(LA, LO), q(LA.map(v => v + dLa), LO), q(LA.map(v => v - dLa), LO), q(LA, LO.map(v => v + dLo)), q(LA, LO.map(v => v - dLo))]);
    return { el: c, sl: c.map((_, i) => Math.atan(Math.hypot((ee[i] - ww[i]) / 600, (nn[i] - ss[i]) / 600)) / DEG) };
  }
  async function getWx(b) {
    const [la, lo] = gridPts(b, NW), j = await jget("https://api.open-meteo.com/v1/forecast?latitude=" + la + "&longitude=" + lo + "&daily=precipitation_sum,wind_gusts_10m_max&past_days=" + PAST + "&forecast_days=" + FUT + "&timezone=auto", 25000);
    return (Array.isArray(j) ? j : [j]).map(o => wxMetrics(o.daily || {}));
  }
  function wxMetrics(dl) {
    const p = (dl.precipitation_sum || []).map(v => v == null ? 0 : v), g = (dl.wind_gusts_10m_max || []).map(v => v == null ? 0 : v), t0 = PAST;
    const sum = (a, i, j) => { let s = 0; for (let k = Math.max(0, i); k <= j && k < a.length; k++) s += a[k] || 0; return s; };
    let hth = 0; for (let k = t0 - 1; k >= 0 && p[k] < 1; k--) hth++;
    return { past3: sum(p, t0 - 3, t0 - 1), f3: sum(p, t0, t0 + 2), f7: sum(p, t0, t0 + 6), peak: Math.max(0, ...p.slice(t0, t0 + 3)), r14: sum(p, t0 - 14, t0 - 1), r30: sum(p, 0, t0 - 1), hth, gust: Math.max(0, ...g.slice(t0, t0 + 3)) };
  }

  /* ---------- inti analisis (murni, bisa diuji) ---------- */
  function bil(f, n, u, v) {
    const x = clamp(u) * (n - 1), y = clamp(v) * (n - 1), i = Math.min(n - 2, Math.floor(x)), j = Math.min(n - 2, Math.floor(y)), fx = x - i, fy = y - j;
    return f[i * n + j] * (1 - fx) * (1 - fy) + f[i * n + j + 1] * (1 - fx) * fy + f[(i + 1) * n + j] * fx * (1 - fy) + f[(i + 1) * n + j + 1] * fx * fy;
  }
  function analyze(b, el, wx, sl) {
    const kmY = (b.n - b.s) * 111.32 / (N - 1), kmX = (b.e - b.w) * 111.32 * Math.cos((b.n + b.s) / 2 * DEG) / (N - 1), cell = (kmX + kmY) / 2;
    const comp = Math.pow(clamp(cell / .5, 1, 100), .28); /* cadangan bila kemiringan lokal tak tersedia */
    const Z = (r, c) => el[Math.min(N - 1, Math.max(0, r)) * N + Math.min(N - 1, Math.max(0, c))];
    const W = {}; if (wx) ["past3", "f3", "f7", "peak", "r14", "r30", "hth", "gust"].forEach(k => W[k] = wx.map(m => m[k]));
    const seaIdx = []; el.forEach((z, i) => { if (z <= .5) seaIdx.push(i); });
    const risk = {}; KEYS.concat("semua").forEach(k => risk[k] = new Float32Array(N * N)); const det = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const i = r * N + c, z = el[i], land = z > .5, u = r / (N - 1), v = c / (N - 1);
      const c0 = Math.max(c - 1, 0), c1 = Math.min(c + 1, N - 1), r0 = Math.max(r - 1, 0), r1 = Math.min(r + 1, N - 1);
      const gx = (Z(r, c1) - Z(r, c0)) / ((c1 - c0) * kmX * 1000), gy = (Z(r1, c) - Z(r0, c)) / ((r1 - r0) * kmY * 1000);
      let mx = -1e9, mn = 1e9, sm = 0, nn = 0; for (let a = r - 1; a <= r + 1; a++) for (let d = c - 1; d <= c + 1; d++) { const q = Z(a, d); mx = Math.max(mx, q); mn = Math.min(mn, q); sm += q; nn++; }
      const slope = Math.atan(Math.hypot(gx, gy)) / DEG, relief = Math.atan((mx - mn) / (2 * cell * 1000)) / DEG, se = sl ? sl[i] : Math.max(slope, .8 * relief) * comp, basin = lin(sm / nn - z, 0, 25);
      let dSea = Infinity; for (const q of seaIdx) { const d = Math.hypot((Math.floor(q / N) - r) * kmY, ((q % N) - c) * kmX); if (d < dSea) dSea = d; }
      const sL = land ? .7 * lin(se, 4, 30) + .3 * lin(z, 50, 750) : 0, flat = 1 - lin(se, 1, 9), low = 1 - lin(z, 3, 120), sB = land ? .4 * low + .35 * flat + .25 * basin : 0;
      let rainF = .3, trigL = .35, dry = 0, wind = 0, g = null;
      if (wx) {
        const f = k => bil(W[k], NW, u, v); g = { past3: f("past3"), f3: f("f3"), f7: f("f7"), peak: f("peak"), r14: f("r14"), r30: f("r30"), hth: f("hth"), gust: f("gust") };
        rainF = Math.max(lin(.35 * g.past3 + g.f3, 30, 250), lin(g.peak, 20, 150));
        trigL = clamp(.55 * rainF + .45 * lin(g.r14, 100, 450));
        dry = clamp(.55 * lin(g.hth, 5, 45) + .45 * (1 - lin(g.r30, 20, 150))) * (1 - .4 * lin(g.f7, 40, 120));
        wind = lin(g.gust, 25, 70) * (.85 + .15 * lin(z, 50, 750));
      }
      const prox = isFinite(dSea) ? 1 - lin(dSea, .5, 20) : (z < 8 ? .25 : 0), sP = land ? clamp(prox * (1 - lin(z, 2, 30)) * (.7 + .3 * flat)) : 0;
      const o = { banjir: sB * (.3 + .7 * rainF), longsor: sL * (.3 + .7 * trigL), kering: land && wx ? dry : 0, angin: land ? wind : 0, pesisir: sP };
      KEYS.forEach(k => risk[k][i] = land ? clamp(o[k]) : 0);
      risk.semua[i] = land ? 1 - KEYS.reduce((p, k) => p * (1 - .85 * risk[k][i]), 1) : 0;
      det.push({ z, land, slope: se, dSea, sB, sL, rainF, trigL, g });
    }
    return { b, el, risk, det, wx: !!wx, cell };
  }

  /* ---------- state & util peta ---------- */
  let Pn, IMG, MK, D = null, hz = "banjir", op = .7, busy = false, pick = false, minim = false;
  try { const p = JSON.parse(localStorage.getItem(PREF) || "{}"); if (HZ[p.hz]) hz = p.hz; if (p.op >= .2 && p.op <= 1) op = p.op; } catch (e) { }
  const savePref = () => { try { localStorage.setItem(PREF, JSON.stringify({ hz, op })); } catch (e) { } };
  const look = (la, lo, k) => { if (!D) return null; const b = D.b, u = (b.n - la) / (b.n - b.s), v = (lo - b.w) / (b.e - b.w); if (u < 0 || u > 1 || v < 0 || v > 1) return null; if (bil(D.el, N, u, v) <= .3) return null; return bil(D.risk[k || hz], N, u, v); };
  const cellAt = (la, lo) => { const b = D.b; return D.det[Math.round(clamp((b.n - la) / (b.n - b.s)) * (N - 1)) * N + Math.round(clamp((lo - b.w) / (b.e - b.w)) * (N - 1))]; };

  function paint() {
    if (!D) return; const S = 120, cv = document.createElement("canvas"); cv.width = cv.height = S;
    const x = cv.getContext("2d"), im = x.createImageData(S, S), f = D.risk[hz];
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const u = py / (S - 1), v = px / (S - 1), o = (py * S + px) * 4;
      if (bil(D.el, N, u, v) <= .3) { im.data[o + 3] = 0; continue; }
      const c = ramp(bil(f, N, u, v)); im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = c[3];
    }
    x.putImageData(im, 0, 0); if (IMG) map.removeLayer(IMG);
    if (!map.getPane("pqbPane")) { map.createPane("pqbPane"); map.getPane("pqbPane").style.zIndex = 250; map.getPane("pqbPane").style.pointerEvents = "none"; }
    IMG = L.imageOverlay(cv.toDataURL(), [[D.b.s, D.b.w], [D.b.n, D.b.e]], { opacity: op, interactive: false, pane: "pqbPane" }).addTo(map);
  }

  function exposure() {
    const b = D.b, thr = .55, out = { roads: [], br: [], hot: [] };
    const inb = (la, lo) => la >= b.s && la <= b.n && lo >= b.w && lo <= b.e;
    (typeof roads !== "undefined" ? roads : []).forEach(rd => {
      let mx = -1, mp = null, hi = 0, n = 0, si = 0, ni = 0;
      (rd.points || []).forEach(p => {
        const la = +p.lat, lo = +p.lng; if (isNaN(la) || isNaN(lo) || !inb(la, lo)) return; const v = look(la, lo); if (v == null) return;
        n++; if (v >= thr) { hi++; out.hot.push({ la, lo, v, rd, sta: p.sta }); } if (v > mx) { mx = v; mp = p; }
        if (p.iri != null && p.iri !== "" && !isNaN(p.iri)) { si += +p.iri; ni++; }
      });
      if (!n) return; const iri = ni ? si / ni : null, share = hi / n, len = typeof roadLengthKm === "function" ? roadLengthKm(rd) : 0;
      out.roads.push({ rd, mx, mp, share, n, iri, len, pr: (.6 * mx + .4 * share) * (1 + (iri == null ? 0 : .35 * lin(iri, 4, 12))) });
    });
    out.roads.sort((a, c) => c.pr - a.pr);
    (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []).forEach(j => { const la = +j.lat, lo = +j.lng; if (isNaN(la) || isNaN(lo) || !inb(la, lo)) return; const v = look(la, lo); if (v != null) out.br.push({ j, v, la, lo }); });
    out.br.sort((a, c) => c.v - a.v); return out;
  }

  function markers(X) {
    if (MK) map.removeLayer(MK); MK = L.layerGroup().addTo(map);
    X.hot.sort((a, c) => c.v - a.v).slice(0, 350).forEach(h => L.circleMarker([h.la, h.lo], { radius: 5, color: "#fff", weight: 1, fillColor: LV[lvi(h.v)][1], fillOpacity: .95 }).bindPopup(popRoad(h)).addTo(MK));
    X.br.filter(x => x.v >= .35).slice(0, 80).forEach(x => L.circleMarker([x.la, x.lo], { radius: 9, color: "#fff", weight: 2, fillColor: LV[lvi(x.v)][1], fillOpacity: .95 }).bindPopup(popBr(x)).addTo(MK));
  }
  const bars = (la, lo) => KEYS.concat("semua").map(k => { const v = look(la, lo, k); return v == null ? "" : '<div class="pqb-bar"><span>' + HZ[k].n + '</span><i><b style="width:' + pct(v) + ";background:" + LV[lvi(v)][1] + '"></b></i><em>' + pct(v) + "</em></div>"; }).join("");
  const popRoad = h => '<div class="pqb-pop"><b>' + esc(h.rd.name) + "</b><small>STA " + esc(h.sta || "-") + " · " + HZ[hz].n + " " + pct(h.v) + " (" + LV[lvi(h.v)][0] + ")</small>" + bars(h.la, h.lo) + "</div>";
  const popBr = x => '<div class="pqb-pop"><b>Jembatan ' + esc(x.j.nama || "-") + "</b><small>" + esc(x.j.ruas || "") + " · " + esc(x.j.kabupaten || "") + "</small>" + bars(x.la, x.lo) + "</div>";

  /* ---------- panel ---------- */
  function css() {
    if ($("pqbCss")) return; const s = document.createElement("style"); s.id = "pqbCss";
    s.textContent = "#pqbPanel{position:fixed;right:12px;top:70px;z-index:1300;width:min(390px,94vw);max-height:calc(100vh - 92px);display:none;flex-direction:column;background:#0a0e17f7;border:1px solid var(--line,#2a3a4f);border-radius:14px;color:var(--text,#dbe7f3);font:12.5px/1.45 var(--mono,system-ui);box-shadow:0 14px 40px #000a;backdrop-filter:blur(10px)}#pqbPanel.pqb-min #pqbBody,#pqbPanel.pqb-min #pqbCtl,#pqbPanel.pqb-min #pqbTabs{display:none}" +
      "#pqbHd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line,#2a3a4f)}#pqbHd b{flex:1;font-size:13.5px}#pqbHd button{background:0 0;border:0;color:var(--text-dim,#8fa6bd);cursor:pointer;font-size:15px;padding:3px 6px}#pqbHd button:hover{color:var(--cyan,#22d3ee)}" +
      "#pqbTabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px 12px 4px}.pqb-t{display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 4px;border-radius:9px;border:1px solid var(--line,#2a3a4f);background:var(--panel-2,#0f1726);color:var(--text-dim,#9db3c9);font:700 11px var(--mono,system-ui);cursor:pointer}.pqb-t.on{color:#04121a;border-color:transparent}" +
      "#pqbCtl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 12px}#pqbCtl input[type=range]{flex:1;min-width:70px;accent-color:var(--cyan,#22d3ee)}.pqb-b{background:var(--panel-2,#0f1726);border:1px solid var(--line,#2a3a4f);color:var(--text,#dbe7f3);border-radius:8px;padding:6px 10px;font:700 11px var(--mono,system-ui);cursor:pointer}.pqb-b:hover,.pqb-b.on{border-color:var(--cyan,#22d3ee);color:var(--cyan,#22d3ee)}.pqb-b.pri{background:var(--cyan,#22d3ee);color:#04121a;border-color:var(--cyan,#22d3ee)}" +
      "#pqbSt{padding:2px 12px 6px;font-size:10.5px;color:var(--text-dim,#8fa6bd)}#pqbBody{overflow:auto;padding:0 12px 12px}.pqb-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:6px 0 10px}.pqb-card{background:var(--panel-2,#0f1726);border:1px solid var(--line,#2a3a4f);border-radius:10px;padding:8px 6px;text-align:center}.pqb-card b{display:block;font-size:16px}.pqb-card small{font-size:9px;color:var(--text-dim,#8fa6bd);text-transform:uppercase;letter-spacing:.4px}" +
      ".pqb-leg{height:9px;border-radius:5px;background:linear-gradient(90deg,#22c55e,#facc15,#f97316,#ef4444,#7e22ce);margin:4px 0 2px}.pqb-legl{display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-dim,#8fa6bd)}.pqb-h{margin:12px 0 6px;font:800 11px var(--mono,system-ui);letter-spacing:.4px;text-transform:uppercase;color:var(--cyan,#22d3ee)}" +
      ".pqb-drv{display:grid;grid-template-columns:repeat(2,1fr);gap:5px 10px;font-size:11px}.pqb-drv span{color:var(--text-dim,#8fa6bd)}.pqb-adv{margin:0;padding-left:16px;font-size:11.5px}.pqb-adv li{margin:3px 0}.pqb-it{display:flex;align-items:center;gap:8px;padding:7px 4px;border-bottom:1px solid var(--line,#2a3a4f);cursor:pointer}.pqb-it:hover{background:#22d3ee14}.pqb-it i{width:9px;height:9px;border-radius:50%;flex:none}.pqb-it div{flex:1;min-width:0}.pqb-it b{display:block;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pqb-it small{color:var(--text-dim,#8fa6bd);font-size:10px}.pqb-it em{font-style:normal;font-weight:800;font-size:11.5px}" +
      ".pqb-note{font-size:10px;color:var(--text-dim,#8fa6bd);line-height:1.55;margin-top:10px;padding:8px;border:1px solid var(--line,#2a3a4f);border-radius:9px;background:var(--panel-2,#0f1726)}.pqb-note a{color:var(--cyan,#22d3ee)}.pqb-pop{font:12px var(--mono,system-ui);min-width:200px}.pqb-pop b{display:block;font-size:12.5px}.pqb-pop small{display:block;color:#64748b;margin:2px 0 6px}.pqb-bar{display:flex;align-items:center;gap:6px;margin:3px 0;font-size:10.5px}.pqb-bar span{width:84px;flex:none}.pqb-bar i{flex:1;height:6px;background:#e2e8f0;border-radius:4px;overflow:hidden}.pqb-bar b{display:block;height:100%}.pqb-bar em{width:32px;text-align:right;font-style:normal;font-weight:700}" +
      "@media(max-width:860px){#pqbPanel{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:64vh}}";
    document.head.appendChild(s);
  }
  function build() {
    css(); Pn = document.createElement("div"); Pn.id = "pqbPanel";
    Pn.innerHTML = '<div id="pqbHd"><i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b"></i><b>Peta Rawan Bencana</b><button id="pqbRf" title="Analisis ulang area peta ini"><i class="fa-solid fa-arrows-rotate"></i></button><button id="pqbMn" title="Perkecil">&minus;</button><button id="pqbX" title="Tutup"><i class="fa-solid fa-xmark"></i></button></div><div id="pqbTabs">' +
      Object.keys(HZ).map(k => '<button class="pqb-t" data-k="' + k + '"><i class="fa-solid ' + HZ[k].ic + '"></i>' + HZ[k].n + "</button>").join("") +
      '</div><div id="pqbCtl"><i class="fa-solid fa-droplet" title="Transparansi"></i><input id="pqbOp" type="range" min="20" max="100"><button class="pqb-b pri" id="pqbRun"><i class="fa-solid fa-crosshairs"></i> Analisis area ini</button><button class="pqb-b" id="pqbPk" title="Ketuk peta untuk lihat detail titik"><i class="fa-solid fa-location-crosshairs"></i> Cek titik</button><button class="pqb-b" id="pqbCsv" title="Ekspor paparan ruas & jembatan"><i class="fa-solid fa-file-csv"></i></button></div><div id="pqbSt"></div><div id="pqbBody"></div>';
    document.body.appendChild(Pn); try { L.DomEvent.disableClickPropagation(Pn); L.DomEvent.disableScrollPropagation(Pn); } catch (e) { }
    $("pqbOp").value = op * 100; $("pqbOp").oninput = e => { op = e.target.value / 100; if (IMG) IMG.setOpacity(op); savePref(); };
    $("pqbX").onclick = close; $("pqbMn").onclick = () => { minim = !minim; Pn.classList.toggle("pqb-min", minim); $("pqbMn").innerHTML = minim ? "&#9633;" : "&minus;"; };
    $("pqbRf").onclick = $("pqbRun").onclick = run; $("pqbPk").onclick = armPick; $("pqbCsv").onclick = csv;
    $("pqbTabs").onclick = e => { const t = e.target.closest(".pqb-t"); if (t) setHz(t.dataset.k); };
    $("pqbBody").onclick = e => { const it = e.target.closest("[data-go]"); if (!it) return; const [la, lo] = it.dataset.go.split(",").map(Number); map.flyTo([la, lo], Math.max(map.getZoom(), 14), { duration: .7 }); };
  }
  function tabs() { document.querySelectorAll(".pqb-t").forEach(t => { const on = t.dataset.k === hz; t.classList.toggle("on", on); t.style.background = on ? HZ[t.dataset.k].c : ""; }); }
  function setHz(k) { hz = k; savePref(); tabs(); if (D) { paint(); body(); markers(D.X = exposure()); } }
  const setSt = m => { const e = $("pqbSt"); if (e) e.innerHTML = m; };

  function body() {
    if (!D) return; const f = D.risk[hz], land = []; D.el.forEach((z, i) => { if (z > .5) land.push(f[i]); });
    const X = D.X = D.X || exposure(), mxv = land.length ? Math.max(...land) : 0, hi = land.length ? land.filter(v => v >= .55).length / land.length : 0, top = lvi(mxv);
    const hiRoads = X.roads.filter(r => r.mx >= .55).length;
    let h = '<div class="pqb-cards"><div class="pqb-card"><b style="color:' + LV[top][1] + '">' + pct(mxv) + "</b><small>Risiko tertinggi</small></div><div class=\"pqb-card\"><b>" + pct(hi) + "</b><small>Area tinggi</small></div><div class=\"pqb-card\"><b>" + hiRoads + "</b><small>Ruas terpapar</small></div></div>";
    h += '<div class="pqb-leg"></div><div class="pqb-legl"><span>Rendah</span><span>Sedang</span><span>Tinggi</span><span>Sangat tinggi</span></div>';
    if (D.wx) {
      const m = k => D.det.reduce((s, d) => s + (d.g ? d.g[k] : 0), 0) / D.det.length, mx = k => Math.max(...D.det.map(d => d.g ? d.g[k] : 0));
      h += '<div class="pqb-h">Pemicu cuaca (rata-rata area)</div><div class="pqb-drv"><div><span>Hujan 3 hr lalu</span><br><b>' + m("past3").toFixed(0) + ' mm</b></div><div><span>Prakiraan 3 hari</span><br><b>' + m("f3").toFixed(0) + ' mm</b> <span>(puncak ' + mx("peak").toFixed(0) + '/hr)</span></div><div><span>Hujan 30 hr lalu</span><br><b>' + m("r30").toFixed(0) + ' mm</b></div><div><span>Hari tanpa hujan</span><br><b>' + m("hth").toFixed(0) + ' hari</b></div><div><span>Hembusan maks 3 hr</span><br><b>' + mx("gust").toFixed(0) + ' km/j</b></div><div><span>Prakiraan 7 hari</span><br><b>' + m("f7").toFixed(0) + " mm</b></div></div>";
    } else h += '<div class="pqb-note" style="border-color:#f59e0b">Data cuaca gagal dimuat: peta hanya menampilkan <b>kerentanan medan</b> (statis). Kekeringan tidak dapat dihitung. Coba analisis ulang.</div>';
    const adv = (ADV[hz] || []).slice(); if (hz === "semua") { const ks = KEYS.map(k => [k, Math.max(0, ...D.el.map((z, i) => z > .5 ? D.risk[k][i] : 0))]).sort((a, c) => c[1] - a[1]).slice(0, 2); adv.unshift("Ancaman dominan: " + ks.map(k => HZ[k[0]].n + " (" + pct(k[1]) + ")").join(", ") + "."); }
    h += '<div class="pqb-h">Rekomendasi tindakan' + (top === 0 ? " (risiko rendah, tetap pantau)" : "") + '</div><ul class="pqb-adv">' + adv.map(a => "<li>" + esc(a) + "</li>").join("") + "</ul>";
    h += '<div class="pqb-h">Ruas jalan paling terpapar (' + X.roads.length + " ruas di area)</div>";
    h += X.roads.slice(0, 10).map(r => { const l = lvi(r.mx), g = r.mp ? r.mp.lat + "," + r.mp.lng : ""; return '<div class="pqb-it" data-go="' + g + '"><i style="background:' + LV[l][1] + '"></i><div><b>' + esc(r.rd.name) + "</b><small>maks " + pct(r.mx) + " · " + pct(r.share) + " titik tinggi" + (r.len ? " · ±" + (r.share * r.len).toFixed(1) + " km" : "") + (r.iri != null ? " · IRI " + r.iri.toFixed(1) : "") + "</small></div><em style=\"color:" + LV[l][1] + '">' + LV[l][0] + "</em></div>"; }).join("") || '<div class="pqb-note">Tidak ada ruas PETAQU di area ini.</div>';
    h += '<div class="pqb-h">Jembatan paling terpapar (' + X.br.length + " di area)</div>";
    h += X.br.slice(0, 8).map(x => { const l = lvi(x.v); return '<div class="pqb-it" data-go="' + x.la + "," + x.lo + '"><i style="background:' + LV[l][1] + '"></i><div><b>' + esc(x.j.nama || "Jembatan") + "</b><small>" + esc(x.j.ruas || "") + "</small></div><em style=\"color:" + LV[l][1] + '">' + pct(x.v) + "</em></div>"; }).join("") || '<div class="pqb-note">Tidak ada jembatan di area ini.</div>';
    h += '<div class="pqb-note"><b>Metode:</b> risiko = kerentanan medan (elevasi, kemiringan lokal DEM &plusmn;300 m, cekungan, jarak pantai) &times; pemicu cuaca (hujan 3 hr lalu, prakiraan, kejenuhan 14 hr, hari tanpa hujan, hembusan angin). Skor ruas = 60% titik tertinggi + 40% porsi titik berisiko, diperberat IRI buruk. Resolusi grid ±' + D.cell.toFixed(1) + ' km: <b>zoom lebih dekat lalu analisis ulang</b> untuk detail. Ini <b>indikatif</b> untuk prioritas inspeksi, bukan pengganti peringatan dini BMKG, <a href="https://inarisk.bnpb.go.id" target="_blank" rel="noopener">BNPB InaRISK</a> &amp; <a href="https://magma.esdm.go.id" target="_blank" rel="noopener">PVMBG</a>. Gempa: gunakan modul Gempa &amp; Tsunami. Sumber: Open-Meteo (DEM Copernicus, model cuaca).</div>';
    $("pqbBody").innerHTML = h;
  }

  async function run() {
    if (busy) return; if (typeof map === "undefined") return; busy = true; setSt('<i class="fa-solid fa-circle-notch fa-spin"></i> Mengambil elevasi &amp; cuaca…');
    const bb = map.getBounds(); let s = bb.getSouth(), n = bb.getNorth(), w = bb.getWest(), e = bb.getEast(), cut = false;
    const cap = 2, fit = (a, c, mn) => { let m = (a + c) / 2, sp = c - a; if (sp > cap) { sp = cap; cut = true; } if (sp < mn) sp = mn; return [m - sp / 2, m + sp / 2]; };
    [s, n] = fit(s, n, .05); [w, e] = fit(w, e, .05); const b = { s, n, w, e }, key = [s, w, n, e].map(v => v.toFixed(2)).join(",");
    try {
      const wxp = cached("wx" + key, 18e5, () => getWx(b)).catch(() => null);
      const E = await cached("el2" + key, 864e5, () => getElev(b)), wx = await wxp;
      D = analyze(b, E.el, wx, E.sl); D.X = null; D.t = new Date(); paint(); D.X = exposure(); markers(D.X); body();
      setSt("Diperbarui " + D.t.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " · grid " + N + "&times;" + N + (wx ? " + cuaca " + NW + "&times;" + NW : " (tanpa cuaca)") + (cut ? " · area dibatasi 2&deg;, zoom lebih dekat untuk detail" : ""));
    } catch (err) { console.warn("Bencana:", err); setSt('<span style="color:#f87171">Gagal memuat data elevasi (' + esc(err.message || err) + "). Periksa internet lalu coba lagi.</span>"); }
    busy = false;
  }
  function armPick() {
    if (!D) { say("Jalankan analisis dulu"); return; } pick = !pick; $("pqbPk").classList.toggle("on", pick); if (!pick) return; say("Ketuk titik di peta");
    map.once("click", ev => { pick = false; $("pqbPk").classList.remove("on"); if (!D) return; const la = ev.latlng.lat, lo = ev.latlng.lng, v = look(la, lo); if (v == null) { say("Titik di luar area analisis / laut"); return; } const d = cellAt(la, lo);
      L.popup().setLatLng(ev.latlng).setContent('<div class="pqb-pop"><b>Detail titik</b><small>Elevasi ±' + d.z.toFixed(0) + " m · kemiringan lokal ±" + d.slope.toFixed(1) + "&deg;" + (isFinite(d.dSea) ? " · pantai ±" + d.dSea.toFixed(0) + " km" : "") + "</small>" + bars(la, lo) + "</div>").openOn(map); });
  }
  function csv() {
    if (!D) { say("Jalankan analisis dulu"); return; } const X = D.X || exposure(), q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const rows = [["Jenis", "Nama", "Ruas/Kabupaten", "Bahaya", "Risiko %", "Tingkat", "Titik tinggi %", "IRI rata2"]];
    X.roads.forEach(r => rows.push(["Ruas", r.rd.name, r.rd.kabupaten || "", HZ[hz].n, Math.round(r.mx * 100), LV[lvi(r.mx)][0], Math.round(r.share * 100), r.iri == null ? "" : r.iri.toFixed(2)]));
    X.br.forEach(x => rows.push(["Jembatan", x.j.nama || "", x.j.ruas || "", HZ[hz].n, Math.round(x.v * 100), LV[lvi(x.v)][0], "", ""]));
    const t = rows.map(r => r.map(q).join(",")).join("\n"); try { downloadFile("rawan-bencana-" + hz + "-" + Date.now() + ".csv", "\ufeff" + t, "text/csv"); say("CSV diekspor"); } catch (e) { say("Ekspor gagal"); }
  }
  function open() { if (!Pn) build(); Pn.style.display = "flex"; tabs(); if (!D) run(); else { paint(); markers(D.X || (D.X = exposure())); } }
  function close() { if (Pn) Pn.style.display = "none"; if (IMG) { map.removeLayer(IMG); IMG = null; } if (MK) { map.removeLayer(MK); MK = null; } }

  function init() {
    const b = document.createElement("button"); b.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>'; b.title = "Peta rawan bencana (banjir, longsor, kekeringan, dll.)"; b.onclick = open;
    const put = () => { try { PQ_DOCK.adopt(b, "Rawan Bencana"); } catch (e) { b.style.cssText = "position:fixed;left:10px;bottom:270px;z-index:900"; document.body.append(b); } };
    typeof PQ_DOCK !== "undefined" ? put() : setTimeout(put, 900);
  }
  window.PETAQU_BENCANA = { open, close, run, _analyze: analyze, _wx: wxMetrics, _bil: bil };
  if (typeof document !== "undefined" && document.readyState !== undefined) document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
