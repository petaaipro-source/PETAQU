/* PETAQU Pelayaran — feri penyeberangan, kapal cepat, Pelni, danau & lintas negara (modul mandiri, tombol di dock).
   • Jaringan: pelabuhan + rute bawaan (data-feri.js) dengan kapal beranimasi searah rute, filter jenis kapal,
     muat jalur feri NYATA dari OpenStreetMap (route=ferry) untuk area peta yang terlihat.
   • Rute cerdas: pelabuhan ↔ pelabuhan atau titik peta / lokasi saya / ruas proyek → pelabuhan terdekat (satu pulau),
     transit multi-jalur (penalti tunggu sesuai frekuensi), 3 pilihan sekaligus (Tercepat · Termurah · Transit sedikit),
     jam berangkat → jam tiba dengan zona WIB/WITA/WIT, tarif per golongan kendaraan, CO₂.
   • Gelombang laut LIVE (Open-Meteo Marine, tanpa kunci): tiap rute dinilai layak/waspada/berisiko menurut batas
     gelombang jenis kapalnya; garis rute dapat diwarnai menurut risiko.
   • Logistik proyek: alat berat/material → golongan, tarif, jumlah keberangkatan, peringatan lowbed/LCT.
   • Ruas proyek: pelabuhan penyeberangan terdekat dari tiap ruas jalan yang sudah dimuat.
   • Skenario: tutup pelabuhan/rute, tambah pelabuhan & rute kustom, ekspor CSV/JSON, impor JSON.
   Semua angka INDIKATIF untuk pra-survei — verifikasi jadwal, tarif & kondisi laut ke operator/BMKG/Syahbandar. */
(function () {
  "use strict";
  if (window.__pqFeri) return; window.__pqFeri = 1;
  const KEY = "petaqu_feri_v1", $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const gmap = () => { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } };
  const rad = x => x * Math.PI / 180, SEA = 1.05, LAND_F = 1.35, LAND_KMH = 40, WAVE_TTL = 30 * 60 * 1000;
  const LANDJ = { n: "Darat (jalan)", ic: "🚗", kmh: 40, dwell: 0, hs: 99, col: "#e2e8f0" }, LANDR = { id: "darat", n: "Jalan darat", j: "land", f: 99, op: "", km: 0, stops: [], idx: [], pts: [], cum: [] };
  const JN = () => window.FR_JENIS || {}, GOLS = () => window.FR_GOL || [];
  const OBJ = [["cepat", "⏱ Tercepat"], ["murah", "💳 Termurah"], ["sedikit", "🔁 Transit sedikit"]];
  let S = { tab: "jaringan", on: false, lines: true, ports: true, anim: true, wcol: false, osm: true, min: false, sp: 600, jn: { ro: 1, cepat: 1, pelni: 1, speed: 1, intl: 1, danau: 1 }, A: null, B: null, obj: "cepat", gol: "0", qty: 1, dep: "", closedP: [], closedR: [], custom: { ports: [], routes: [] }, lg: { m: 0, r: "", q: 1, deck: 40 }, q: "" };
  try { const o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o) { Object.assign(S, o); S.jn = Object.assign({ ro: 1, cepat: 1, pelni: 1, speed: 1, intl: 1, danau: 1 }, S.jn || {}); S.custom = Object.assign({ ports: [], routes: [] }, S.custom || {}); S.lg = Object.assign({ m: 0, r: "", q: 1, deck: 40 }, S.lg || {}); } } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ tab: S.tab, on: S.on, lines: S.lines, ports: S.ports, anim: S.anim, wcol: S.wcol, osm: S.osm, min: S.min, sp: S.sp, jn: S.jn, A: S.A, B: S.B, obj: S.obj, gol: S.gol, qty: S.qty, dep: S.dep, closedP: S.closedP, closedR: S.closedR, custom: S.custom, lg: S.lg })); } catch (e) { } };
  let P, BTN, PT = {}, RT = [], RM = {}, ADJ = {}, DEG = {}, GL, GP, GA, GR, GO, PLAN = null, ALT = null, W = {}, wBusy = false, wAt = 0, wErr = "", clickMode = "", TT = 0, ships = [], shipT = 0, OSMN = 0, osmBusy = false, osmSeen = new Set(), MVT = 0, shownRoute = "", ROADS_CACHE = null;

  const hav = (a, b, c, d) => { const x = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
  const fkm = k => k < 1 ? Math.round(k * 1000) + " m" : k < 100 ? k.toFixed(1) + " km" : Math.round(k).toLocaleString("id-ID") + " km";
  const fmin = m => { m = Math.round(m); if (m < 60) return m + " mnt"; const h = Math.floor(m / 60); if (h < 48) return h + " j" + (m % 60 ? " " + (m % 60) + " mnt" : ""); const d = Math.floor(h / 24); return d + " hr " + (h % 24) + " j"; };
  const rp = n => "Rp " + (Math.round(n / 1000) * 1000).toLocaleString("id-ID");
  const say = (t, ms) => { let d = $("pqfrToast"); if (!d) { d = document.createElement("div"); d.id = "pqfrToast"; document.body.appendChild(d); } d.textContent = t; d.style.display = "block"; clearTimeout(TT); TT = setTimeout(() => d.style.display = "none", ms || 3000); };
  const bearing = (a, b, c, d) => { const y = Math.sin(rad(d - b)) * Math.cos(rad(c)), x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(rad(d - b)); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; };
  const tzOf = prov => (window.FR_WIT || []).includes(prov) ? 9 : (window.FR_WITA || []).includes(prov) ? 8 : 7;
  const tzN = z => z === 9 ? "WIT" : z === 8 ? "WITA" : "WIB";
  const hhmm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };

  /* ================= DATA & GRAF ================= */
  function build() {
    PT = {}; RT = []; RM = {}; ADJ = {}; DEG = {};
    const add = a => { PT[a[0]] = { k: a[0], n: a[1], city: a[2], prov: a[3], lat: +a[4], lng: +a[5], t: a[6] || "A", isl: a[7] || "", custom: !!a[8] }; };
    (window.FR_PELABUHAN || []).forEach(a => add(a));
    (S.custom.ports || []).forEach(a => add(a.concat(1)));
    const defs = (window.FR_RUTE || []).concat((S.custom.routes || []));
    defs.forEach((d, ix) => {
      const pts = [], idx = [], stops = [];
      String(d[3]).trim().split(/\s+/).forEach(tk => {
        if (tk[0] === "@") { const m = tk.slice(1).split(","); if (m.length === 2 && isFinite(+m[0]) && isFinite(+m[1])) pts.push([+m[0], +m[1]]); }
        else if (PT[tk]) { idx.push(pts.length); pts.push([PT[tk].lat, PT[tk].lng]); stops.push(tk); }
      });
      if (stops.length < 2) return;
      const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) * SEA);
      const r = { id: d[0], n: d[1], j: JN()[d[2]] ? d[2] : "ro", pts, idx, stops, cum, km: cum[cum.length - 1], f: +d[4] || 0, op: d[5] || "", custom: ix >= (window.FR_RUTE || []).length };
      RT.push(r); RM[r.id] = r; stops.forEach(k => DEG[k] = (DEG[k] || 0) + 1);
    });
    RT.forEach(r => {
      if (S.closedR.includes(r.id) || !S.jn[r.j]) return;
      for (let i = 0; i < r.stops.length - 1; i++) {
        const a = r.stops[i], b = r.stops[i + 1]; if (S.closedP.includes(a) || S.closedP.includes(b)) continue;
        const km = r.cum[r.idx[i + 1]] - r.cum[r.idx[i]];
        (ADJ[a] = ADJ[a] || []).push({ from: a, to: b, r, km, i, rev: false });
        (ADJ[b] = ADJ[b] || []).push({ from: b, to: a, r, km, i, rev: true });
      }
    });
    /* sambungan DARAT antar pelabuhan di pulau yang sama (agar perjalanan multi-pulau bisa dirangkai) */
    const byIsl = {}; Object.keys(DEG).forEach(k => { const p = PT[k]; if (p && p.isl && !S.closedP.includes(k)) (byIsl[p.isl] = byIsl[p.isl] || []).push(p); });
    Object.keys(byIsl).forEach(isl => { const l = byIsl[isl]; for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) { const km = hav(l[x].lat, l[x].lng, l[y].lat, l[y].lng) * LAND_F; if (km > 2200 || km < 1) continue; (ADJ[l[x].k] = ADJ[l[x].k] || []).push({ from: l[x].k, to: l[y].k, r: LANDR, km, land: true }); (ADJ[l[y].k] = ADJ[l[y].k] || []).push({ from: l[y].k, to: l[x].k, r: LANDR, km, land: true }); } });
  }
  const jn = r => r.j === "land" ? LANDJ : (JN()[r.j] || {});
  const sailMin = e => e.km / (jn(e.r).kmh || 20) * 60;
  const waitMin = r => r.j === "land" ? 0 : r.f > 0 ? Math.max(10, 720 / r.f) : 24 * 60 * 3;          /* tunggu rata-rata = setengah selang keberangkatan */
  const carries = (r, g) => r.j === "land" || g === "0" || ["ro", "pelni"].includes(r.j);
  function fare(r, km, gk, qty) {
    qty = qty || 1; if (r.j === "land") return (gk === "0" ? 600 * km : 1500 * km * qty); const g = GOLS().find(x => x.k === gk) || GOLS()[0] || { rate: 650 };
    if (r.j === "ro" || r.j === "danau") return g.rate * Math.max(km, 8) * qty * (r.j === "danau" ? .55 : 1);
    if (r.j === "pelni") return (gk === "0" ? 430 * km : g.rate * km * .85) * qty;
    return (r.j === "intl" ? 7000 : r.j === "speed" ? 8500 : 6500) * Math.max(km, 10) * qty;
  }
  function portsList() { return Object.values(PT); }
  function portByName(q) { q = String(q || "").toLowerCase(); return portsList().filter(p => (p.n + " " + p.city + " " + p.prov + " " + p.k + " " + p.isl).toLowerCase().includes(q)); }

  /* ================= PERENCANA RUTE ================= */
  function nearPorts(lat, lng, n) {
    const l = portsList().filter(p => !S.closedP.includes(p.k) && ADJ[p.k]).map(p => ({ p, d: hav(lat, lng, p.lat, p.lng) })).sort((a, b) => a.d - b.d);
    if (!l.length) return [];
    const isl = l[0].p.isl, same = l.filter(x => x.p.isl === isl && x.d <= 250);
    return (same.length ? same : l.slice(0, 2)).slice(0, n || 4);
  }
  function endpoints(X) {
    if (!X) return [];
    if (X.k) return PT[X.k] && ADJ[X.k] ? [{ k: X.k, landKm: 0, landMin: 0, label: PT[X.k].n }] : [];
    return nearPorts(X.lat, X.lng, 8).map(x => { const km = x.d * LAND_F; return { k: x.p.k, landKm: km, landMin: km / LAND_KMH * 60, label: x.p.n }; });
  }
  function dijkstra(srcs, dsts, obj, gk, qty) {
    const dst = {}; dsts.forEach(d => dst[d.k] = d);
    const cost = (e, prevR) => {
      const land = e.r.j === "land", sail = sailMin(e), board = !land && prevR !== e.r.id, d = land ? 0 : (jn(e.r).dwell || 30), wait = board ? waitMin(e.r) : 0;
      let m = sail + (board ? d + wait : d);
      if (land) m = sail;
      if (obj === "murah") return fare(e.r, e.km, gk, 1) + m * 250;
      if (obj === "sedikit") return (board ? 400000 : 0) + m;
      return m;
    };
    const dist = {}, prev = {}, Q = [];
    srcs.forEach(s => { const c = obj === "murah" ? s.landKm * 1500 + s.landMin * 250 : s.landMin, key = s.k + "|"; if (dist[key] === undefined || c < dist[key]) { dist[key] = c; prev[key] = { src: s }; Q.push([c, key, s.k, ""]); } });
    let best = null, bestC = 1e18;
    while (Q.length) {
      let mi = 0; for (let i = 1; i < Q.length; i++) if (Q[i][0] < Q[mi][0]) mi = i;
      const [c, key, k, rid] = Q.splice(mi, 1)[0]; if (c > dist[key]) continue;
      if (dst[k] && rid !== "") { const t = c + (obj === "murah" ? dst[k].landKm * 1500 + dst[k].landMin * 250 : dst[k].landMin); if (t < bestC) { bestC = t; best = key; } }
      if (c > bestC) break;
      (ADJ[k] || []).forEach(e => {
        if (gk !== "0" && !carries(e.r, gk)) return;
        const nc = c + cost(e, rid), nk = e.to + "|" + e.r.id;
        if (dist[nk] === undefined || nc < dist[nk]) { dist[nk] = nc; prev[nk] = { from: key, e }; Q.push([nc, nk, e.to, e.r.id]); }
      });
    }
    if (!best) return null;
    const edges = []; let key = best, src = null;
    while (key) { const p = prev[key]; if (!p) break; if (p.src) { src = p.src; break; } edges.unshift(p.e); key = p.from; }
    const endK = best.split("|")[0], dstInfo = dst[endK];
    return { edges, src, dst: dstInfo };
  }
  function assemble(res, gk, qty) {
    if (!res || !res.edges.length) return null;
    const legs = []; let cur = null;
        res.edges.forEach((e, n) => {
      const from = e.from, to = e.to;
      if (cur && cur.r.id === e.r.id) { cur.to = to; cur.km += e.km; cur.sail += sailMin(e); cur.stops.push(to); cur.segs.push(e); }
      else { cur = { r: e.r, from, to, km: e.km, sail: sailMin(e), stops: [from, to], segs: [e] }; legs.push(cur); }
    });
    let totalMin = 0, totalFare = 0, totalKm = 0, co2 = 0, wait0 = 0;
    legs.forEach((L, i) => {
      L.wait = waitMin(L.r); L.dwell = L.r.j === "land" ? 0 : (jn(L.r).dwell || 30) * L.stops.length;
      L.min = L.sail + L.dwell + L.wait; L.fare = fare(L.r, L.km, gk, qty);
      totalMin += L.min; totalFare += L.fare; totalKm += L.km; if (i === 0) wait0 = L.wait;
      co2 += L.km * (L.r.j === "ro" ? .09 : L.r.j === "pelni" ? .05 : L.r.j === "land" ? .1 : .13);
    });
    const landA = res.src ? res.src.landMin : 0, landB = res.dst ? res.dst.landMin : 0;
    totalMin += landA + landB;
    return { legs, from: PT[legs[0].from], to: PT[legs[legs.length - 1].to], totalMin, totalFare, totalKm, co2, wait0, transfers: legs.length - 1, landA: res.src, landB: res.dst, gk, qty };
  }
  function planAll() {
    ALT = null; PLAN = null;
    const A = S.A, B = S.B; if (!A || !B) { say("Pilih asal & tujuan dulu"); return; }
    const sa = endpoints(A), sb = endpoints(B);
    if (!sa.length || !sb.length) { say("Pelabuhan tidak aktif / tidak ada jalur untuk titik itu", 3500); return; }
    ALT = {};
    OBJ.forEach(o => { try { ALT[o[0]] = assemble(dijkstra(sa, sb, o[0], S.gol, S.qty), S.gol, S.qty); } catch (e) { console.error(e); ALT[o[0]] = null; } });
    PLAN = ALT[S.obj] || ALT.cepat || ALT.murah || ALT.sedikit || null;
    if (!PLAN) say(S.gol !== "0" ? "Tidak ada jalur kapal yang bisa mengangkut kendaraan itu (hanya Ro-Ro/Pelni)" : "Tidak ada jalur laut antara dua titik itu", 4500);
    drawPlan();
  }
  function arrival(p) {
    if (!S.dep || !/^\d{1,2}:\d{2}$/.test(S.dep) || !p) return null;
    const hm = S.dep.split(":").map(Number), z0 = tzOf(p.from.prov), z1 = tzOf(p.to.prov), t = hm[0] * 60 + hm[1] + p.totalMin + (z1 - z0) * 60;
    return { clock: hhmm(t), day: Math.floor(t / 1440), tz: tzN(z1) };
  }

  /* ================= GELOMBANG LAUT ================= */
  const hsClass = h => h < .5 ? "tenang" : h < 1.25 ? "rendah" : h < 2.5 ? "sedang" : h < 4 ? "tinggi" : h < 6 ? "sangat tinggi" : "ekstrem";
  function risk(r, hs) {
    if (hs == null || !isFinite(hs)) return { lv: -1, col: "#94a3b8", txt: "belum dicek" };
    const q = hs / (jn(r).hs || 2), lv = q < .5 ? 0 : q < .8 ? 1 : q < 1 ? 2 : 3;
    return { lv, col: ["#22c55e", "#eab308", "#f97316", "#ef4444"][lv], txt: ["aman", "waspada", "mendekati batas", "berisiko ditunda"][lv] };
  }
  function pointAt(r, s) {
    s = Math.max(0, Math.min(r.km, s)); let lo = 0, hi = r.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= s) lo = m; else hi = m; }
    const a = r.pts[lo], b = r.pts[hi], seg = r.cum[hi] - r.cum[lo] || 1, t = (s - r.cum[lo]) / seg;
    return { lat: a[0] + (b[0] - a[0]) * t, lng: a[1] + (b[1] - a[1]) * t, brg: bearing(a[0], a[1], b[0], b[1]) };
  }
  async function fetchWaves(force) {
    if (wBusy) return; if (!force && Date.now() - wAt < WAVE_TTL && Object.keys(W).length) return;
    wBusy = true; wErr = ""; if (P && P.style.display === "flex") render();
    try {
      const smp = RT.map(r => { const m = pointAt(r, r.km / 2); return { id: r.id, lat: +m.lat.toFixed(2), lng: +m.lng.toFixed(2) }; });
      for (let i = 0; i < smp.length; i += 40) {
        const ch = smp.slice(i, i + 40), url = "https://marine-api.open-meteo.com/v1/marine?latitude=" + ch.map(x => x.lat).join(",") + "&longitude=" + ch.map(x => x.lng).join(",") + "&current=wave_height,wave_period&daily=wave_height_max&forecast_days=3&timezone=auto";
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 20000);
        const resp = await fetch(url, { signal: ctl.signal }); clearTimeout(tm);
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const js = await resp.json(), arr = Array.isArray(js) ? js : [js];
        arr.forEach((o, n) => { const c = ch[n]; if (!c || !o) return; const cur = o.current || {}; let dm = (o.daily && o.daily.wave_height_max) || []; W[c.id] = { hs: cur.wave_height, tp: cur.wave_period, mx: (dm = dm.filter(v => v != null)).length ? Math.max.apply(null, dm) : null, day: dm }; });
      }
      wAt = Date.now();
    } catch (e) { wErr = "Cuaca laut tidak terjangkau (" + (e.name === "AbortError" ? "timeout" : e.message) + ") — periksa koneksi, lalu coba lagi."; }
    wBusy = false; drawNet(); if (P && P.style.display === "flex") render(); if (PLAN) { if (S.tab === "rute") render(); }
  }
  const waveOf = r => W[r.id] ? W[r.id] : null;
  const riskOf = r => { const w = waveOf(r); return risk(r, w ? (w.mx != null && isFinite(w.mx) ? Math.max(w.hs || 0, w.mx) : w.hs) : null); };

  /* ================= PETA ================= */
  function groups() {
    const M = gmap(); if (!M || !window.L) return false;
    if (!GL) { GL = L.layerGroup(); GP = L.layerGroup(); GA = L.layerGroup(); GR = L.layerGroup(); GO = L.layerGroup(); }
    return true;
  }
  function popRoute(r) {
    const k = riskOf(r), w = waveOf(r), a = PT[r.stops[0]], b = PT[r.stops[r.stops.length - 1]], j = jn(r);
    return '<div class="fr-pop"><b>' + esc(r.n) + '</b><div>' + j.ic + " " + esc(j.n) + (r.op ? " • " + esc(r.op) : "") + "</div><div>📏 " + fkm(r.km) + " • ⏱ ±" + fmin(r.km / (j.kmh || 20) * 60) + " • 🔁 " + (r.f >= 1 ? "±" + Math.round(r.f) + "×/hari" : r.f > 0 ? "±" + (r.f * 7).toFixed(1) + "×/minggu" : "musiman") + "</div>" +
      (w ? '<div>🌊 ' + (w.hs != null ? w.hs.toFixed(1) + " m (" + hsClass(w.hs) + ")" : "—") + (w.mx != null ? " • maks 3 hr " + w.mx.toFixed(1) + " m" : "") + ' <span class="fr-sc" style="background:' + k.col + '">' + k.txt + "</span></div>" : '<div class="fr-mini">🌊 Cek gelombang di tab Cuaca</div>') +
      '<div class="fr-pa"><button data-fr="from" data-k="' + a.k + '">Dari ' + esc(a.n.split(" (")[0]) + '</button><button data-fr="to" data-k="' + b.k + '">Ke ' + esc(b.n.split(" (")[0]) + "</button></div></div>";
  }
  function popPort(p) {
    const rs = RT.filter(r => r.stops.includes(p.k));
    return '<div class="fr-pop"><b>⚓ ' + esc(p.n) + "</b><div>" + esc(p.city) + ", " + esc(p.prov) + " • " + tzN(tzOf(p.prov)) + "</div><div class=\"fr-mini\">" + rs.length + " rute: " + rs.slice(0, 6).map(r => (jn(r).ic || "") + esc(r.n.split(" (")[0])).join(" · ") + (rs.length > 6 ? " …" : "") + '</div><div class="fr-pa"><button data-fr="from" data-k="' + p.k + '">Dari sini</button><button data-fr="to" data-k="' + p.k + '">Ke sini</button><button data-fr="clp" data-k="' + p.k + '">' + (S.closedP.includes(p.k) ? "Buka" : "Tutup") + "</button></div></div>";
  }
  function drawNet() {
    const M = gmap(); if (!M || !groups()) return;
    GL.clearLayers(); GP.clearLayers();
    RT.forEach(r => {
      if (!S.jn[r.j]) return; const closed = S.closedR.includes(r.id) || r.stops.some(k => S.closedP.includes(k)), j = jn(r);
      const col = closed ? "#6b7280" : (S.wcol ? riskOf(r).col : j.col);
      const ln = L.polyline(r.pts, { color: col, weight: r.j === "pelni" ? 2.2 : 3, opacity: closed ? .45 : .85, dashArray: closed ? "2 8" : r.j === "pelni" ? "9 6" : r.j === "cepat" || r.j === "speed" ? "5 4" : r.j === "intl" ? "10 4 2 4" : null });
      ln.bindTooltip(j.ic + " " + r.n + (closed ? " (ditutup)" : ""), { sticky: true }); ln.bindPopup(() => popRoute(r), { maxWidth: 320 }); ln.on("click", () => { shownRoute = r.id; });
      GL.addLayer(ln);
    });
    portsList().forEach(p => {
      if (!DEG[p.k]) return; const closed = S.closedP.includes(p.k), d = DEG[p.k], sz = d >= 4 ? 20 : d >= 2 ? 16 : 13;
      const m = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2], html: '<div class="pqfr-pt ' + (closed ? "x" : "t" + p.t[0]) + '" style="width:' + sz + "px;height:" + sz + 'px"></div>' }) });
      m.bindTooltip(p.n + (closed ? " (ditutup)" : ""), { direction: "top", offset: [0, -sz / 2] }); m.bindPopup(() => popPort(p), { maxWidth: 320 });
      GP.addLayer(m);
    });
    sync();
  }
  function sync() {
    const M = gmap(); if (!M || !groups()) return;
    const on = S.on !== false;
    [[GL, on && S.lines], [GP, on && S.ports], [GA, on && S.anim], [GR, true], [GO, on && S.osm && OSMN > 0]].forEach(([g, v]) => { const has = M.hasLayer(g); if (v && !has) g.addTo(M); else if (!v && has) M.removeLayer(g); });
    if (on && S.anim) startShips(); else stopShips();
    updBtn();
  }
  function startShips() {
    if (shipT) return;
    if (!ships.length) {
      RT.forEach(r => { if (r.f === 0 && r.j !== "pelni") return; const n = Math.max(1, Math.min(3, Math.round(r.km / 220))); for (let i = 0; i < n; i++) ships.push({ r, ph: (i + .5) / n, dir: i % 2 ? -1 : 1, m: null }); });
    }
    let last = performance.now();
    shipT = setInterval(() => {
      const M = gmap(); if (!M || S.on === false || !S.anim || document.hidden) return;
      const now = performance.now(), dt = Math.min(1, (now - last) / 1000); last = now; const bd = M.getBounds().pad(.2), z = M.getZoom();
      ships.forEach(sh => {
        const r = sh.r; if (S.closedR.includes(r.id) || !S.jn[r.j]) { if (sh.m) { GA.removeLayer(sh.m); sh.m = null; } return; }
        sh.ph += sh.dir * (jn(r).kmh * S.sp / 3600 * dt) / r.km; if (sh.ph >= 1) { sh.ph = 1; sh.dir = -1; } else if (sh.ph <= 0) { sh.ph = 0; sh.dir = 1; }
        const pa = pointAt(r, sh.ph * r.km), vis = z >= 5 && bd.contains([pa.lat, pa.lng]);
        if (!vis) { if (sh.m) { GA.removeLayer(sh.m); sh.m = null; } return; }
        const brg = sh.dir > 0 ? pa.brg : (pa.brg + 180) % 360;
        if (!sh.m) { sh.m = L.marker([pa.lat, pa.lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: "", iconSize: [16, 16], iconAnchor: [8, 8], html: '<div class="pqfr-sh" style="--c:' + jn(r).col + '"><i></i></div>' }) }); GA.addLayer(sh.m); }
        else sh.m.setLatLng([pa.lat, pa.lng]);
        const el = sh.m.getElement && sh.m.getElement(); if (el && el.firstChild) el.firstChild.style.transform = "rotate(" + brg.toFixed(0) + "deg)";
      });
    }, 200);
  }
  function stopShips() { clearInterval(shipT); shipT = 0; ships.forEach(s => { if (s.m && GA) GA.removeLayer(s.m); s.m = null; }); }
  function setOn(v) { S.on = v === undefined ? S.on === false : !!v; if (S.on && !S.lines) S.lines = true; save(); sync(); say(S.on ? "Jalur pelayaran: NYALA" : "Jalur pelayaran: MATI"); if (P && P.style.display === "flex") render(); }
  function updBtn() { if (!BTN) return; const on = S.on !== false; BTN.classList.toggle("on", on); BTN.classList.toggle("off", !on); BTN.title = "Jalur Pelayaran: " + (on ? "NYALA (klik untuk matikan)" : "MATI (klik untuk nyalakan)"); }

  function legPath(L) {
    const out = [];
    L.segs.forEach(e => { if (e.land) { const a = PT[e.from], b = PT[e.to]; if (!out.length) out.push([a.lat, a.lng]); out.push([b.lat, b.lng]); return; } const r = e.r, i0 = r.idx[e.i], i1 = r.idx[e.i + 1]; let part = r.pts.slice(i0, i1 + 1); if (e.rev) part = part.slice().reverse(); part.forEach((p, n) => { if (out.length && n === 0) return; out.push(p); }); });
    return out;
  }
  function drawPlan() {
    const M = gmap(); if (!M || !groups()) return; GR.clearLayers(); if (!PLAN) return;
    const all = [];
    if (PLAN.landA && PLAN.landA.landKm && S.A && !S.A.k) { const p = PT[PLAN.legs[0].from]; L.polyline([[S.A.lat, S.A.lng], [p.lat, p.lng]], { color: "#f8fafc", weight: 3, dashArray: "3 7" }).addTo(GR); all.push([S.A.lat, S.A.lng]); }
    if (PLAN.landB && PLAN.landB.landKm && S.B && !S.B.k) { const p = PT[PLAN.legs[PLAN.legs.length - 1].to]; L.polyline([[S.B.lat, S.B.lng], [p.lat, p.lng]], { color: "#f8fafc", weight: 3, dashArray: "3 7" }).addTo(GR); all.push([S.B.lat, S.B.lng]); }
    PLAN.legs.forEach(Lg => { const path = legPath(Lg); L.polyline(path, { color: "#111827", weight: 9, opacity: .55 }).addTo(GR); L.polyline(path, { color: jn(Lg.r).col, weight: 5, opacity: 1, dashArray: Lg.r.j === "land" ? "2 9" : null, lineCap: Lg.r.j === "land" ? "round" : "butt" }).addTo(GR); path.forEach(p => all.push(p)); });
    [PLAN.from, PLAN.to].forEach((p, n) => L.circleMarker([p.lat, p.lng], { radius: 8, color: "#fff", weight: 2, fillColor: n ? "#ef4444" : "#22c55e", fillOpacity: 1 }).bindTooltip((n ? "Tujuan: " : "Asal: ") + p.n, { permanent: true, direction: "top" }).addTo(GR));
    if (all.length) { try { M.fitBounds(L.latLngBounds(all).pad(.25), { maxZoom: 11 }); } catch (e) { } }
  }
  function focusPort(k) { const p = PT[k], M = gmap(); if (!p || !M) return; M.setView([p.lat, p.lng], Math.max(M.getZoom(), 10)); }
  function focusRoute(id) { const r = RM[id], M = gmap(); if (!r || !M) return; M.fitBounds(L.latLngBounds(r.pts).pad(.3)); }

  /* ---------- OSM: jalur feri nyata ---------- */
  async function loadOSM() {
    const M = gmap(); if (!M || osmBusy) return; const b = M.getBounds(), span = Math.max(b.getNorth() - b.getSouth(), b.getEast() - b.getWest());
    if (span > 8) { say("Perbesar peta (area ≤ ±8°) dulu agar jalur feri OSM bisa dimuat", 3800); return; }
    osmBusy = true; say("Memuat jalur feri dari OpenStreetMap…", 5000); if (P) render();
    const bb = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map(v => v.toFixed(4)).join(","), q = '[out:json][timeout:25];(way["route"="ferry"](' + bb + ');relation["route"="ferry"](' + bb + ');node["amenity"="ferry_terminal"](' + bb + '););out geom 400;';
    const eps = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]; let js = null;
    for (const ep of eps) { try { const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 28000); const r = await fetch(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ctl.signal }); clearTimeout(tm); if (r.ok) { js = await r.json(); break; } } catch (e) { } }
    osmBusy = false;
    if (!js) { say("Gagal memuat OSM (server sibuk / offline). Coba lagi nanti.", 4500); if (P) render(); return; }
    groups(); let nw = 0, nt = 0;
    (js.elements || []).forEach(el => {
      const key = el.type + el.id; if (osmSeen.has(key)) return; osmSeen.add(key); const tg = el.tags || {};
      const info = '<div class="fr-pop"><b>' + esc(tg.name || tg.ref || "Jalur feri (OSM)") + "</b>" + (tg.operator ? "<div>" + esc(tg.operator) + "</div>" : "") + (tg.duration ? "<div>⏱ " + esc(tg.duration) + "</div>" : "") + (tg.charge ? "<div>💳 " + esc(tg.charge) + "</div>" : "") + (tg.vehicle === "yes" || tg.motor_vehicle === "yes" ? "<div>🚗 angkut kendaraan</div>" : "") + '<div class="fr-mini">Sumber: OpenStreetMap</div></div>';
      const geoms = []; if (el.type === "way" && el.geometry) geoms.push(el.geometry); else if (el.type === "relation") (el.members || []).forEach(m => { if (m.type === "way" && m.geometry) geoms.push(m.geometry); });
      geoms.forEach(g => { const pts = g.filter(Boolean).map(p => [p.lat, p.lon]); if (pts.length > 1) { L.polyline(pts, { color: "#38bdf8", weight: 2.5, opacity: .9, dashArray: "6 5" }).bindPopup(info).bindTooltip(tg.name || "Feri (OSM)", { sticky: true }).addTo(GO); nw++; } });
      if (el.type === "node" && el.lat != null) { L.circleMarker([el.lat, el.lon], { radius: 5, color: "#0c4a6e", weight: 2, fillColor: "#7dd3fc", fillOpacity: 1 }).bindPopup(info).bindTooltip(tg.name || "Terminal feri", { direction: "top" }).addTo(GO); nt++; }
    });
    OSMN += nw + nt; sync(); say("OSM: " + nw + " jalur & " + nt + " terminal ditambahkan" + (nw + nt ? "" : " (tidak ada di area ini)"), 4000); if (P) render();
  }

  /* ================= ANALISIS ================= */
  function nearestPortsFrom(lat, lng, n) { return portsList().filter(p => DEG[p.k]).map(p => ({ p, d: hav(lat, lng, p.lat, p.lng) })).sort((a, b) => a.d - b.d).slice(0, n || 6); }
  function getRoads() { try { return typeof roads !== "undefined" && Array.isArray(roads) ? roads : []; } catch (e) { return []; } }
  function roadPorts(filter) {
    const out = [], ps = portsList().filter(p => DEG[p.k] && (p.t.includes("A") || p.t.includes("P")));
    getRoads().forEach(r => {
      if (filter && !String(r.name || "").toLowerCase().includes(filter)) return; const pts = (r.points || []).filter(p => isFinite(p.lat) && isFinite(p.lng)); if (!pts.length) return;
      const step = Math.max(1, Math.floor(pts.length / 50)); let best = null;
      for (let i = 0; i < pts.length; i += step) { const q = pts[i]; for (const p of ps) { const d = hav(q.lat, q.lng, p.lat, p.lng); if (!best || d < best.d) best = { d, p, q }; } }
      if (best) out.push({ r, d: best.d, p: best.p, q: best.q });
    });
    return out.sort((a, b) => a.d - b.d);
  }
  function stats() {
    const act = RT.filter(r => S.jn[r.j] && !S.closedR.includes(r.id)), hubs = Object.keys(DEG).map(k => [k, DEG[k]]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { np: Object.keys(DEG).length, nr: act.length, km: act.reduce((s, r) => s + r.km, 0), longest: act.slice().sort((a, b) => b.km - a.km).slice(0, 5), hubs };
  }
  function isoIslands() {
    const seen = {}, comps = []; Object.keys(ADJ).forEach(k => { if (seen[k]) return; const st = [k], c = []; seen[k] = 1; while (st.length) { const x = st.pop(); c.push(x); (ADJ[x] || []).forEach(e => { if (!e.land && !seen[e.to]) { seen[e.to] = 1; st.push(e.to); } }); } comps.push(c); });
    return comps.sort((a, b) => b.length - a.length);
  }

  /* ================= UI ================= */
  function css() {
    if ($("pqfrCss")) return; const s = document.createElement("style"); s.id = "pqfrCss";
    s.textContent = "#pqfrPanel{position:fixed;right:10px;top:70px;z-index:1311;width:min(480px,calc(100vw - 20px));max-height:calc(100vh - 90px);display:none;flex-direction:column;background:#07111cf7;color:#dbe7f3;border:1px solid #38bdf840;border-radius:14px;font:13px/1.45 system-ui,sans-serif;box-shadow:0 14px 40px #0009;backdrop-filter:blur(10px);overflow:hidden}#pqfrPanel.min .fr-tabs,#pqfrPanel.min #pqfrBody{display:none}#pqfrPanel header{display:flex;align-items:center;gap:8px;padding:11px 14px 6px}#pqfrPanel header b{flex:1;font-size:14px}#pqfrPanel header small{display:block;color:#8fa6bd;font-weight:500;font-size:11px}#pqfrPanel .x{background:none;border:0;color:#cbd5e1;font-size:18px;cursor:pointer;padding:2px 6px}\n" +
      ".fr-tabs{display:flex;gap:4px;padding:0 10px 8px;overflow-x:auto;flex:none}.fr-tabs button{flex:none;padding:6px 10px;border-radius:999px;border:1px solid #38bdf833;background:#0d1b2e;color:#cbd5e1;font:600 12px system-ui;cursor:pointer}.fr-tabs button.on{background:#0284c7;border-color:#7dd3fc;color:#fff}#pqfrBody{overflow:auto;padding:0 12px 14px;display:flex;flex-direction:column;gap:8px}\n" +
      "#pqfrPanel input,#pqfrPanel select{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid #38bdf840;background:#0d1b2e;color:#e6f1fb;font:inherit;outline:0;min-width:0}#pqfrPanel input[type=checkbox]{width:auto;padding:0;flex:none;accent-color:#0284c7}#pqfrPanel input[type=range]{padding:0}.fr-row{display:flex;gap:6px;align-items:center}.fr-row>*{flex:1}.fr-row>.s{flex:none}.fr-lab{font-size:11px;color:#8fa6bd;margin:2px 0 -3px}\n" +
      ".fr-btn{padding:7px 11px;border-radius:9px;border:1px solid #7dd3fc66;background:#0369a1;color:#fff;font:600 12.5px system-ui;cursor:pointer;flex:none}.fr-btn.g{background:#0d1b2e;border-color:#38bdf840;color:#cbd5e1}.fr-btn.sm{padding:4px 8px;font-size:11.5px}.fr-btn.w{background:#b45309;border-color:#fcd34d66}.fr-btn:disabled{opacity:.5;cursor:default}\n" +
      ".fr-chips{display:flex;flex-wrap:wrap;gap:5px}.fr-chips button{padding:4px 9px;border-radius:999px;border:1px solid #38bdf833;background:#0d1b2e;color:#cbd5e1;font:600 11.5px system-ui;cursor:pointer}.fr-chips button.on{background:#0284c7;border-color:#7dd3fc;color:#fff}.fr-card{border:1px solid #38bdf82e;border-radius:11px;background:#0b1626;padding:9px 10px}.fr-card.sel{border-color:#38bdf8}.fr-mini{color:#8fa6bd;font-size:11.5px}.fr-ins{border:1px solid #38bdf833;background:#0a2236;border-radius:10px;padding:8px 10px}.fr-st{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;margin-top:4px}\n" +
      ".fr-leg{display:flex;gap:8px;padding:6px 0;border-top:1px solid #38bdf81f}.fr-dot{width:10px;height:10px;border-radius:50%;margin-top:5px;flex:none}.fr-xfer{font-size:11px;color:#fbbf24;padding:2px 0 2px 18px}.fr-sc{display:inline-block;padding:1px 8px;border-radius:999px;font:700 11px system-ui;color:#04121a}.fr-item{cursor:pointer}.fr-item:hover{border-color:#7dd3fc}.fr-tip{font-size:12px;margin:3px 0;color:#cfe6f3}.fr-warn{border:1px solid #f59e0b55;background:#2a1d08;border-radius:10px;padding:7px 10px;font-size:12px;color:#fde68a}.fr-bad{border:1px solid #ef444455;background:#2a1010;border-radius:10px;padding:7px 10px;font-size:12px;color:#fecaca}\n" +
      ".fr-bar{height:6px;border-radius:4px;background:#0ea5e9;min-width:3px}#pqfrPanel table{width:100%;border-collapse:collapse;font-size:12px}#pqfrPanel td,#pqfrPanel th{padding:4px 5px;border-top:1px solid #38bdf81f;text-align:left;vertical-align:top}#pqfrPanel th{color:#8fa6bd;font-size:10.5px;text-transform:uppercase}\n" +
      "#pqfrToast{position:fixed;left:50%;transform:translateX(-50%);bottom:80px;z-index:5000;display:none;background:#0369a1;color:#fff;padding:8px 14px;border-radius:999px;font:600 12.5px system-ui;box-shadow:0 6px 20px #0007;max-width:90vw;text-align:center}\n" +
      "#pqfrOnOff{position:relative}#pqfrOnOff.on{color:#38bdf8}#pqfrOnOff.off{opacity:.55}#pqfrOnOff.off::after{content:\"\";position:absolute;left:18%;right:18%;top:50%;height:2px;background:#ef4444;transform:rotate(-45deg);border-radius:2px;pointer-events:none}\n" +
      ".pqfr-pt{border-radius:50%;background:#fff;border:3px solid #0369a1;box-shadow:0 0 0 1px #fff,0 2px 6px #0008;box-sizing:border-box}.pqfr-pt.tP{border-color:#16a34a}.pqfr-pt.tC{border-color:#9333ea}.pqfr-pt.tI{border-color:#dc2626}.pqfr-pt.tD{border-color:#0d9488}.pqfr-pt.x{border-color:#6b7280;background:#374151}\n" +
      ".pqfr-sh{width:16px;height:16px;display:flex;align-items:center;justify-content:center}.pqfr-sh i{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:13px solid var(--c,#0ea5e9);filter:drop-shadow(0 0 2px #000c)}\n" +
      ".fr-pop{font:12.5px/1.45 system-ui,sans-serif;min-width:200px;color:#e6f1fb!important}.fr-pop *{color:inherit}.fr-pop b{color:#7dd3fc!important;font-size:13.5px}.fr-pop .fr-mini{color:#9fb6cc!important}.fr-pa{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.fr-pa button{padding:4px 8px;border-radius:7px;border:1px solid #0369a1;background:#0284c7;color:#fff!important;font:600 11.5px system-ui;cursor:pointer}.fr-pop .fr-sc{color:#04121a}";
    document.head.appendChild(s);
  }
  const TABS = [["jaringan", "🕸️ Jaringan"], ["rute", "🧭 Rute"], ["pelabuhan", "⚓ Pelabuhan"], ["cuaca", "🌊 Cuaca"], ["logistik", "🚛 Logistik"], ["ruas", "🛣️ Ruas"], ["data", "⚙️ Data"]];
  function mount() {
    css(); P = document.createElement("div"); P.id = "pqfrPanel";
    P.innerHTML = '<header><span style="font-size:20px">⛴️</span><b>Pelayaran & Feri Indonesia<small>Rute cerdas • gelombang laut • logistik proyek</small></b><button class="x" id="pqfrMin" aria-label="Ciutkan">▾</button><button class="x" id="pqfrX" aria-label="Tutup">×</button></header><div class="fr-tabs" id="pqfrTabs"></div><div id="pqfrBody"></div>';
    document.body.appendChild(P); $("pqfrX").onclick = () => P.style.display = "none";
    const mn = $("pqfrMin"), sm = v => { P.classList.toggle("min", v); mn.textContent = v ? "▴" : "▾"; S.min = v; save(); }; mn.onclick = () => sm(!P.classList.contains("min")); if (S.min) sm(true);
    $("pqfrTabs").innerHTML = TABS.map(t => '<button data-t="' + t[0] + '">' + t[1] + "</button>").join("");
    $("pqfrTabs").onclick = e => { const t = e.target.closest("button"); if (t) { S.tab = t.dataset.t; save(); render(); } };
    P.addEventListener("click", onClick); P.addEventListener("change", onChange); P.addEventListener("input", onInput);
  }
  function open() { if (!P) mount(); if (!Object.keys(PT).length) build(); P.style.display = "flex"; drawNet(); render(); }
  function render() {
    if (!P) return; [...$("pqfrTabs").children].forEach(b => b.classList.toggle("on", b.dataset.t === S.tab));
    const B = $("pqfrBody"), top = B.scrollTop, f = document.activeElement, keep = f && f.id === "pqfrQ" ? f.selectionStart : null;
    B.innerHTML = ({ jaringan: tNet, rute: tRute, pelabuhan: tPort, cuaca: tWave, logistik: tLog, ruas: tRuas, data: tData }[S.tab] || tNet)(); B.scrollTop = top;
    if (keep !== null) { const q = $("pqfrQ"); if (q) { q.focus(); try { q.setSelectionRange(keep, keep); } catch (e) { } } }
  }
  const chip = (a, k, lab, on) => '<button data-fr="' + a + '" data-k="' + k + '" class="' + (on ? "on" : "") + '">' + lab + "</button>";
  const ck = (k, lab, v) => '<label class="fr-row" style="gap:6px;cursor:pointer"><input type="checkbox" data-fr="ck" data-k="' + k + '"' + (v ? " checked" : "") + ' class="s"><span>' + lab + "</span></label>";

  function tNet() {
    const st = stats(), j = JN();
    return '<div class="fr-ins"><b>' + st.np + " pelabuhan • " + st.nr + " rute aktif • " + Math.round(st.km).toLocaleString("id-ID") + ' km jalur</b><div class="fr-mini">Indikatif — jadwal & tarif resmi: ASDP, Pelni, operator kapal cepat.</div></div>' +
      '<div class="fr-lab">Jenis kapal</div><div class="fr-chips">' + Object.keys(j).map(k => chip("jn", k, j[k].ic + " " + j[k].n.replace(/ \(.*\)/, ""), S.jn[k])).join("") + "</div>" +
      ck("on", "Tampilkan jaringan pelayaran di peta", S.on !== false) + ck("lines", "Garis rute", S.lines) + ck("ports", "Titik pelabuhan", S.ports) + ck("anim", "Kapal beranimasi (searah rute)", S.anim) + ck("wcol", "Warnai rute menurut risiko gelombang", S.wcol) + ck("osm", "Tampilkan jalur feri OSM yang dimuat", S.osm) +
      '<div class="fr-row"><span class="fr-mini s">Kecepatan animasi</span><select data-fr="sp"><option value="300"' + (S.sp == 300 ? " selected" : "") + '>×300 (lambat)</option><option value="600"' + (S.sp == 600 ? " selected" : "") + '>×600</option><option value="1500"' + (S.sp == 1500 ? " selected" : "") + '>×1500</option><option value="4000"' + (S.sp == 4000 ? " selected" : "") + ">×4000 (cepat)</option></select></div>" +
      '<div class="fr-row"><button class="fr-btn" data-fr="osm"' + (osmBusy ? " disabled" : "") + '>' + (osmBusy ? "Memuat…" : "🗺️ Muat jalur feri OSM (area peta)") + '</button><button class="fr-btn g" data-fr="fitall">Lihat semua</button></div>' +
      '<div class="fr-lab">Hub tersibuk</div>' + st.hubs.map(h => '<div class="fr-card fr-item" data-fr="focus" data-k="' + h[0] + '"><b>⚓ ' + esc(PT[h[0]].n) + '</b> <span class="fr-mini">' + h[1] + " rute • " + esc(PT[h[0]].prov) + "</span></div>").join("") +
      '<div class="fr-lab">Rute terpanjang</div>' + st.longest.map(r => '<div class="fr-card fr-item" data-fr="frt" data-k="' + r.id + '"><b>' + jn(r).ic + " " + esc(r.n) + '</b><div class="fr-mini">' + fkm(r.km) + " • ±" + fmin(r.km / jn(r).kmh * 60) + " pelayaran</div></div>").join("");
  }
  const optPorts = sel => '<option value="">— pilih —</option><option value="@map">📍 Pilih titik di peta…</option><option value="@me">📡 Lokasi saya</option>' + (sel && !sel.k ? '<option value="@cur" selected>📌 Titik ' + sel.lat.toFixed(4) + ", " + sel.lng.toFixed(4) + (sel.label ? " — " + esc(sel.label) : "") + "</option>" : "") +
    portsList().filter(p => DEG[p.k]).sort((a, b) => a.n.localeCompare(b.n)).map(p => '<option value="' + p.k + '"' + (sel && sel.k === p.k ? " selected" : "") + ">" + esc(p.n) + " — " + esc(p.prov) + "</option>").join("");
  function legHTML(Lg, i) {
    const j = jn(Lg.r), land = Lg.r.j === "land", rk = land ? risk(Lg.r, null) : riskOf(Lg.r), w = land ? null : waveOf(Lg.r);
    return (i && Lg.r.j !== "land" ? '<div class="fr-xfer">⇄ pindah kapal — tunggu rata-rata ±' + fmin(Lg.wait) + "</div>" : "") + '<div class="fr-leg"><span class="fr-dot" style="background:' + j.col + '"></span><div><b>' + esc(PT[Lg.from].n) + " → " + esc(PT[Lg.to].n) + '</b><div class="fr-mini">' + j.ic + " " + esc(land ? "Jalan darat antar pelabuhan" : Lg.r.n) + (Lg.r.op ? " • " + esc(Lg.r.op) : "") + " • " + fkm(Lg.km) + (Lg.r.j === "land" ? " • tempuh " : " • layar ") + fmin(Lg.sail) + (Lg.stops.length > 2 ? " • " + (Lg.stops.length - 2) + " singgah" : "") + (Lg.fare ? " • ±" + rp(Lg.fare) : "") + "</div>" +
      (w ? '<div class="fr-mini">🌊 ' + (w.hs != null ? w.hs.toFixed(1) + " m" : "—") + (w.mx != null ? " (maks 3 hr " + w.mx.toFixed(1) + " m)" : "") + ' <span class="fr-sc" style="background:' + rk.col + '">' + rk.txt + "</span></div>" : "") + "</div></div>";
  }
  function planHTML() {
    if (!S.A || !S.B) return ""; if (!ALT) return '<div class="fr-mini">Tekan “Cari rute”.</div>'; if (!PLAN) return '<div class="fr-bad">Tidak ada jalur laut yang cocok. Coba tanpa kendaraan, aktifkan semua jenis kapal, atau cek apakah keduanya satu pulau (cukup via darat).</div>';
    const p = PLAN, arr = arrival(p), rks = p.legs.filter(l => l.r.j !== "land").map(l => riskOf(l.r)), worst = rks.reduce((a, b) => b.lv > a.lv ? b : a, { lv: -1 });
    const cmp = OBJ.map(o => { const x = ALT[o[0]]; if (!x) return ""; return '<div class="fr-card fr-item' + (x === p ? " sel" : "") + '" data-fr="pick" data-k="' + o[0] + '"><b>' + o[1] + '</b><div class="fr-mini">' + fmin(x.totalMin) + " • " + (x.totalFare ? "±" + rp(x.totalFare) : "—") + " • " + x.transfers + " transit</div></div>"; }).join("");
    return '<div class="fr-row" style="align-items:stretch">' + cmp + "</div>" +
      '<div class="fr-ins"><b>' + esc(p.from.n) + " → " + esc(p.to.n) + '</b><div class="fr-st"><span>⏱ <b>' + fmin(p.totalMin) + "</b></span><span>📏 <b>" + fkm(p.totalKm) + "</b> total</span><span>💳 <b>±" + rp(p.totalFare) + "</b>" + (p.qty > 1 ? " (" + p.qty + " unit)" : "") + "</span><span>🔁 <b>" + p.transfers + " transit</b></span><span>🌱 CO₂ ±<b>" + (p.co2).toFixed(1) + " kg</b>/orang</span></div>" +
      (arr ? '<div class="fr-tip">🕓 Berangkat ' + esc(S.dep) + " " + tzN(tzOf(p.from.prov)) + " → perkiraan tiba <b>" + arr.clock + " " + arr.tz + "</b>" + (arr.day ? " (+" + arr.day + " hari)" : "") + " <span class=\"fr-mini\">(termasuk tunggu rata-rata)</span></div>" : "") + "</div>" +
      (p.landA && p.landA.landKm ? '<div class="fr-tip">🚗 Darat awal ke ' + esc(p.landA.label) + ": ±" + fkm(p.landA.landKm) + " • ±" + fmin(p.landA.landMin) + " <span class=\"fr-mini\">(garis lurus ×1,35)</span></div>" : "") +
      p.legs.map(legHTML).join("") + (p.landB && p.landB.landKm ? '<div class="fr-tip">🚗 Darat akhir dari ' + esc(p.landB.label) + ": ±" + fkm(p.landB.landKm) + " • ±" + fmin(p.landB.landMin) + "</div>" : "") +
      (worst.lv >= 2 ? '<div class="fr-bad">⚠️ Gelombang pada jalur ini ' + worst.txt + " — kemungkinan jadwal ditunda. Cek BMKG & operator sebelum berangkat.</div>" : worst.lv === -1 ? '<div class="fr-mini">🌊 Gelombang belum dicek — buka tab Cuaca.</div>' : "") +
      (p.legs.some(l => l.r.j !== "land" && (l.r.j === "pelni" || l.r.f < 1)) ? '<div class="fr-warn">⏳ Ada leg dengan jadwal jarang (Pelni/musiman): waktu tunggu bisa berhari-hari — cek jadwal resmi.</div>' : "") +
      '<div class="fr-row"><button class="fr-btn g" data-fr="copy">📋 Salin ringkasan</button><button class="fr-btn g" data-fr="redraw">🗺️ Tampilkan di peta</button></div>';
  }
  function tRute() {
    const g = GOLS();
    return '<div class="fr-lab">Asal</div><div class="fr-row"><select data-fr="selA">' + optPorts(S.A) + '</select><button class="fr-btn g sm s" data-fr="swap" title="Tukar">⇅</button></div><div class="fr-lab">Tujuan</div><select data-fr="selB">' + optPorts(S.B) + "</select>" +
      '<div class="fr-row"><div><div class="fr-lab">Yang diangkut</div><select data-fr="gol">' + g.map(x => '<option value="' + x.k + '"' + (S.gol === x.k ? " selected" : "") + ">" + esc(x.n) + "</option>").join("") + '</select></div><div class="s" style="width:74px"><div class="fr-lab">Jumlah</div><input type="number" min="1" max="999" value="' + S.qty + '" data-fr="qty"></div><div class="s" style="width:96px"><div class="fr-lab">Jam berangkat</div><input type="time" value="' + esc(S.dep) + '" data-fr="dep"></div></div>' +
      '<div class="fr-chips">' + OBJ.map(o => chip("obj", o[0], o[1], S.obj === o[0])).join("") + '</div><div class="fr-row"><button class="fr-btn" data-fr="plan">🧭 Cari rute</button><button class="fr-btn g" data-fr="clr">Bersihkan</button></div>' + planHTML();
  }
  function portRow(p, extra) {
    const rs = RT.filter(r => r.stops.includes(p.k)), cl = S.closedP.includes(p.k);
    return '<div class="fr-card"><div class="fr-row"><b class="fr-item" data-fr="focus" data-k="' + p.k + '" style="flex:1">⚓ ' + esc(p.n) + (cl ? " (ditutup)" : "") + '</b><span class="fr-mini s">' + tzN(tzOf(p.prov)) + '</span></div><div class="fr-mini">' + esc(p.city) + ", " + esc(p.prov) + " • " + rs.length + " rute" + (extra || "") + '</div><div class="fr-row" style="margin-top:5px"><button class="fr-btn g sm" data-fr="from" data-k="' + p.k + '">Dari</button><button class="fr-btn g sm" data-fr="to" data-k="' + p.k + '">Ke</button><button class="fr-btn g sm" data-fr="clp" data-k="' + p.k + '">' + (cl ? "Buka" : "Tutup") + "</button></div></div>";
  }
  function tPort() {
    const M = gmap(), c = M ? M.getCenter() : { lat: -7.5, lng: 110 }, near = nearestPortsFrom(c.lat, c.lng, 5), q = S.q.trim(), res = q ? portByName(q).filter(p => DEG[p.k]).slice(0, 12) : [];
    return '<input id="pqfrQ" data-fr="q" placeholder="Cari pelabuhan, kota, provinsi, pulau…" value="' + esc(S.q) + '">' + (q ? (res.length ? res.map(p => portRow(p)).join("") : '<div class="fr-mini">Tidak ditemukan.</div>') :
      '<div class="fr-lab">Terdekat dari pusat peta</div>' + near.map(x => portRow(x.p, " • " + fkm(x.d))).join("") + '<div class="fr-row"><button class="fr-btn g" data-fr="nearme">📡 Terdekat dari lokasi saya</button></div>');
  }
  function tWave() {
    const n = Object.keys(W).length, rows = RT.filter(r => S.jn[r.j]).map(r => ({ r, k: riskOf(r), w: waveOf(r) })).sort((a, b) => b.k.lv - a.k.lv || (b.w ? b.w.hs || 0 : 0) - (a.w ? a.w.hs || 0 : 0)), bad = rows.filter(x => x.k.lv >= 2).length;
    return '<div class="fr-ins"><b>🌊 Gelombang laut (Open-Meteo Marine)</b><div class="fr-mini">Tinggi gelombang signifikan di titik tengah tiap rute, dibandingkan batas aman jenis kapal (speedboat ±1 m · kapal cepat ±1,5 m · ro-ro ±2,5 m · Pelni ±3,5 m). Model global — bukan peringatan resmi; utamakan BMKG & Syahbandar.</div></div>' +
      '<div class="fr-row"><button class="fr-btn" data-fr="wave"' + (wBusy ? " disabled" : "") + ">" + (wBusy ? "Memuat…" : n ? "🔄 Segarkan" : "🌊 Cek gelombang semua rute") + '</button>' + ck("wcol", "Warnai peta", S.wcol) + "</div>" +
      (wErr ? '<div class="fr-bad">' + esc(wErr) + "</div>" : "") + (n ? '<div class="fr-tip">' + (bad ? "⚠️ <b>" + bad + " rute</b> mendekati/melewati batas aman." : "✅ Tidak ada rute yang melewati batas aman saat ini.") + (wAt ? ' <span class="fr-mini">diperbarui ' + new Date(wAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + "</span>" : "") + "</div>" : '<div class="fr-mini">Belum ada data. Tekan tombol di atas.</div>') +
      (n ? "<table><tr><th>Rute</th><th>Kini</th><th>Maks 3 hr</th><th>Status</th></tr>" + rows.map(x => '<tr class="fr-item" data-fr="frt" data-k="' + x.r.id + '"><td>' + jn(x.r).ic + " " + esc(x.r.n.replace(/^Koridor Pelni /, "Pelni ")) + "</td><td>" + (x.w && x.w.hs != null ? x.w.hs.toFixed(1) + " m" : "—") + "</td><td>" + (x.w && x.w.mx != null ? x.w.mx.toFixed(1) + " m" : "—") + '</td><td><span class="fr-sc" style="background:' + x.k.col + '">' + x.k.txt + "</span></td></tr>").join("") + "</table>" : "");
  }
  function lgCalc() {
    const m = (window.FR_MUATAN || [])[S.lg.m] || (window.FR_MUATAN || [])[0], r = RM[S.lg.r] || RT.find(x => x.j === "ro"), q = Math.max(1, +S.lg.q || 1), deck = Math.max(10, +S.lg.deck || 40); if (!m || !r) return null;
    const g = GOLS().find(x => x.k === m[1]) || GOLS()[0], unit = fare(r, r.km, m[1], 1), sru = g.sru * q, trips = Math.max(1, Math.ceil(sru / (deck * .6))), f = r.f >= 1 ? r.f : Math.max(.1, r.f), days = Math.max(1, Math.ceil(trips / Math.max(.5, f)));
    const w = [];
    if (!carries(r, m[1])) w.push("Jenis kapal ini umumnya tidak mengangkut kendaraan — pilih rute Ro-Ro/Pelni.");
    if (m[2] > 40) w.push("Berat " + m[2] + " ton: periksa batas muat ramp & kapal; >40 t sering perlu LCT/tongkang charter.");
    if (m[4] > 3.2) w.push("Lebar " + m[4] + " m melebihi lebar lajur kendaraan Ro-Ro standar (±3 m) — izin khusus Syahbandar/operator.");
    if (m[3] > 16) w.push("Panjang " + m[3] + " m: pastikan kapal & pelabuhan menerima Gol IX (butuh ramp panjang).");
    if (r.j === "ro" && r.f < 4) w.push("Frekuensi rendah (±" + r.f + "×/hari): jadwalkan jauh hari, dan siapkan cadangan bila cuaca buruk.");
    const rk = riskOf(r); if (rk.lv >= 2) w.push("Gelombang rute ini " + rk.txt + " saat ini.");
    return { m, r, g, unit, total: unit * q, sru, trips, days, w, q, deck };
  }
  function tLog() {
    const mu = window.FR_MUATAN || [], ro = RT.filter(r => ["ro", "pelni"].includes(r.j)), c = lgCalc();
    return '<div class="fr-ins"><b>🚛 Logistik material & alat berat</b><div class="fr-mini">Pilih muatan + lintasan → golongan, tarif, jumlah keberangkatan & peringatan.</div></div><div class="fr-lab">Muatan</div><select data-fr="lgm">' + mu.map((x, i) => '<option value="' + i + '"' + (S.lg.m == i ? " selected" : "") + ">" + esc(x[0]) + " (Gol " + x[1] + ")</option>").join("") + '</select><div class="fr-lab">Lintasan</div><select data-fr="lgr">' + ro.map(r => '<option value="' + r.id + '"' + ((c && c.r.id === r.id) ? " selected" : "") + ">" + jn(r).ic + " " + esc(r.n) + " — " + fkm(r.km) + "</option>").join("") + "</select>" +
      '<div class="fr-row"><div><div class="fr-lab">Jumlah unit</div><input type="number" min="1" value="' + S.lg.q + '" data-fr="lgq"></div><div><div class="fr-lab">Kapasitas dek (SRU)</div><input type="number" min="10" value="' + S.lg.deck + '" data-fr="lgd"></div></div>' +
      (c ? '<div class="fr-ins"><b>' + esc(c.m[0]) + " × " + c.q + '</b><div class="fr-st"><span>🏷 <b>' + esc(c.g.k === "0" ? "Pejalan" : "Gol " + c.g.k) + "</b></span><span>💳 per unit <b>±" + rp(c.unit) + "</b></span><span>Σ <b>±" + rp(c.total) + "</b></span><span>📦 " + c.sru.toFixed(1) + " SRU</span><span>🚢 <b>±" + c.trips + "</b> keberangkatan</span><span>📅 ±<b>" + c.days + "</b> hari</span><span>⚖️ " + c.m[2] + " t • " + c.m[3] + "×" + c.m[4] + " m</span></div></div>" + c.w.map(x => '<div class="fr-warn">' + esc(x) + "</div>").join("") + '<div class="fr-mini">SRU = satuan ruang dek (mobil=1). Dek terpakai maks 60% untuk kendaraan proyek. Tarif = model indikatif; kendaraan berat umumnya dikenai tarif khusus/negosiasi.</div>' : "");
  }
  function tRuas() {
    const rds = getRoads(); if (!rds.length) return '<div class="fr-bad">Belum ada ruas jalan yang dimuat di PETAQU. Muat data ruas dahulu.</div>';
    if (!ROADS_CACHE || ROADS_CACHE.n !== rds.length) ROADS_CACHE = { n: rds.length, list: roadPorts("") };
    const q = S.q.trim().toLowerCase(), list = (q ? roadPorts(q) : ROADS_CACHE.list).slice(0, 30);
    return '<div class="fr-ins"><b>🛣️ Pelabuhan penyeberangan/laut terdekat dari ruas</b><div class="fr-mini">Jarak titik ruas terdekat → pelabuhan (garis lurus). Klik “Dari ruas” untuk memakainya sebagai asal rute.</div></div><input id="pqfrQ" data-fr="q" placeholder="Filter nama ruas…" value="' + esc(S.q) + '">' + list.map((x, i) => '<div class="fr-card"><b>' + esc(x.r.name || "Ruas") + '</b><div class="fr-mini">⚓ ' + esc(x.p.n) + " • " + fkm(x.d) + (x.d > 60 ? " (jauh)" : "") + '</div><div class="fr-row" style="margin-top:5px"><button class="fr-btn g sm" data-fr="rfrom" data-lat="' + x.q.lat + '" data-lng="' + x.q.lng + '" data-n="' + esc(x.r.name || "") + '">Dari ruas</button><button class="fr-btn g sm" data-fr="focus" data-k="' + x.p.k + '">Lihat pelabuhan</button></div></div>').join("");
  }
  function tData() {
    const iso = isoIslands(), main = iso[0] || [], small = iso.slice(1).filter(c => c.length >= 1).slice(0, 8);
    return '<div class="fr-ins"><b>Skenario & data</b><div class="fr-mini">Tutup pelabuhan/rute untuk uji dampak (hasil rute otomatis menghindarinya).</div></div>' +
      '<div class="fr-lab">Pelabuhan ditutup (' + S.closedP.length + ")</div><div class=\"fr-chips\">" + (S.closedP.length ? S.closedP.map(k => chip("clp", k, "✕ " + esc((PT[k] || { n: k }).n), true)).join("") : '<span class="fr-mini">— tidak ada —</span>') + "</div>" +
      '<div class="fr-lab">Rute ditutup (' + S.closedR.length + ")</div><div class=\"fr-chips\">" + (S.closedR.length ? S.closedR.map(k => chip("clr", k, "✕ " + esc((RM[k] || { n: k }).n.slice(0, 26)), true)).join("") : '<span class="fr-mini">— tidak ada —</span>') + "</div>" +
      '<div class="fr-lab">Keterhubungan jaringan aktif</div><div class="fr-tip">' + iso.length + " gugus terhubung; terbesar " + main.length + " pelabuhan." + (small.length ? " Terpisah: " + small.map(c => esc(c.map(k => PT[k].n.split(" (")[0]).slice(0, 3).join("/"))).join(" · ") : "") + "</div>" +
      '<div class="fr-lab">Tambah pelabuhan kustom</div><div class="fr-row"><input id="pqfrCn" placeholder="Nama pelabuhan"><select id="pqfrCt"><option value="A">Ro-Ro</option><option value="C">Kapal cepat</option><option value="P">Pelni</option><option value="D">Danau</option></select></div><div class="fr-row"><button class="fr-btn g" data-fr="addport">📍 Klik peta → simpan pelabuhan</button></div>' +
      '<div class="fr-lab">Tambah rute kustom (2 pelabuhan)</div><div class="fr-row"><select id="pqfrCa">' + optPorts(null).replace(/<option value="@(map|me)">[^<]*<\/option>/g, "") + '</select><select id="pqfrCb">' + optPorts(null).replace(/<option value="@(map|me)">[^<]*<\/option>/g, "") + '</select></div><div class="fr-row"><select id="pqfrCj">' + Object.keys(JN()).map(k => '<option value="' + k + '">' + JN()[k].n + "</option>").join("") + '</select><input id="pqfrCf" type="number" step="0.1" min="0" value="2" style="max-width:80px" title="keberangkatan/hari"></div><button class="fr-btn g" data-fr="addroute">➕ Tambah rute</button>' +
      '<div class="fr-lab">Ekspor / impor</div><div class="fr-row"><button class="fr-btn g" data-fr="csv">CSV rute</button><button class="fr-btn g" data-fr="json">JSON kustom</button><button class="fr-btn g" data-fr="imp">Impor JSON</button></div><input id="pqfrFile" type="file" accept=".json,application/json" style="display:none"><button class="fr-btn g w" data-fr="reset">Reset kustom & skenario</button>' +
      '<div class="fr-mini">Kustom: ' + S.custom.ports.length + " pelabuhan, " + S.custom.routes.length + " rute.</div>";
  }

  /* ---------- aksi ---------- */
  const setEnd = (w, X) => { S[w] = X; PLAN = null; ALT = null; GR && GR.clearLayers(); save(); };
  function locate(w) {
    if (!navigator.geolocation) { say("Perangkat tidak mendukung GPS"); return; } say("Mengambil lokasi…");
    navigator.geolocation.getCurrentPosition(p => { setEnd(w, { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), label: "Lokasi saya" }); S.tab = "rute"; render(); say("Lokasi diatur"); }, () => say("Lokasi ditolak / tidak tersedia", 3500), { timeout: 12000 });
  }
  function summary() {
    const p = PLAN; if (!p) return ""; const arr = arrival(p);
    return "Rute pelayaran " + p.from.n + " → " + p.to.n + "\n" + p.legs.map(l => "• " + (l.r.j === "land" ? "Darat " + PT[l.from].n + " → " + PT[l.to].n : l.r.n) + " (" + fkm(l.km) + ", " + (l.r.j === "land" ? "tempuh " : "layar ") + fmin(l.sail) + ", tunggu ±" + fmin(l.wait) + ", ±" + rp(l.fare) + ")").join("\n") + "\nTotal ±" + fmin(p.totalMin) + " • ±" + rp(p.totalFare) + " • " + p.transfers + " transit" + (arr ? " • tiba ±" + arr.clock + " " + arr.tz : "") + "\n(Indikatif — cek jadwal & tarif resmi operator.) — PETAQU";
  }
  function dl(name, text, mime) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
  function onClick(e) {
    const el = e.target.closest("[data-fr]"); if (!el || el.tagName === "SELECT" || el.tagName === "INPUT" && el.type !== "checkbox") return; const a = el.dataset.fr, k = el.dataset.k;
    if (el.tagName === "INPUT") return;
    if (a === "jn") { S.jn[k] = S.jn[k] ? 0 : 1; save(); build(); stopShips(); ships = []; drawNet(); render(); }
    else if (a === "osm") loadOSM(); else if (a === "fitall") { const M = gmap(); if (M) M.fitBounds(L.latLngBounds(portsList().filter(p => DEG[p.k]).map(p => [p.lat, p.lng])).pad(.1)); }
    else if (a === "focus") focusPort(k); else if (a === "frt") { focusRoute(k); } else if (a === "from" || a === "to") { setEnd(a === "from" ? "A" : "B", { k }); S.tab = "rute"; if (!P || P.style.display !== "flex") open(); else render(); try { gmap().closePopup(); } catch (x) { } }
    else if (a === "rfrom") { setEnd("A", { lat: +el.dataset.lat, lng: +el.dataset.lng, label: el.dataset.n }); S.tab = "rute"; render(); say("Asal = titik pada ruas"); }
    else if (a === "swap") { const t = S.A; S.A = S.B; S.B = t; PLAN = ALT = null; save(); render(); }
    else if (a === "obj") { S.obj = k; save(); if (ALT) { PLAN = ALT[k] || PLAN; drawPlan(); } render(); }
    else if (a === "pick") { S.obj = k; save(); if (ALT && ALT[k]) { PLAN = ALT[k]; drawPlan(); } render(); }
    else if (a === "plan") { readForm(); planAll(); render(); } else if (a === "clr") { PLAN = ALT = null; S.A = S.B = null; GR && GR.clearLayers(); save(); render(); }
    else if (a === "redraw") drawPlan(); else if (a === "copy") { const t = summary(); try { navigator.clipboard.writeText(t); say("Ringkasan disalin"); } catch (x) { say("Gagal menyalin"); } }
    else if (a === "wave") fetchWaves(true); else if (a === "nearme") locate("A");
    else if (a === "clp") { const i = S.closedP.indexOf(k); if (i < 0) S.closedP.push(k); else S.closedP.splice(i, 1); save(); build(); drawNet(); PLAN = ALT = null; render(); try { gmap().closePopup(); } catch (x) { } say(i < 0 ? "Pelabuhan ditutup (skenario)" : "Pelabuhan dibuka"); }
    else if (a === "addport") { if (!($("pqfrCn") || {}).value) { say("Isi nama pelabuhan dulu"); return; } clickMode = "addport"; say("Klik lokasi pelabuhan di peta…", 5000); }
    else if (a === "addroute") addRoute(); else if (a === "csv") expCsv(); else if (a === "json") dl("feri-kustom.json", JSON.stringify({ closedP: S.closedP, closedR: S.closedR, custom: S.custom }, null, 1), "application/json");
    else if (a === "imp") { const f = $("pqfrFile"); f.onchange = () => { const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(r.result); S.custom = { ports: o.custom && o.custom.ports || [], routes: o.custom && o.custom.routes || [] }; S.closedP = o.closedP || []; S.closedR = o.closedR || []; save(); build(); drawNet(); render(); say("Impor berhasil"); } catch (x) { say("File JSON tidak valid", 3500); } }; r.readAsText(f.files[0]); }; f.click(); }
    else if (a === "reset") { if (confirm("Hapus semua pelabuhan/rute kustom & skenario penutupan?")) { S.custom = { ports: [], routes: [] }; S.closedP = []; S.closedR = []; PLAN = ALT = null; save(); build(); stopShips(); ships = []; drawNet(); render(); } }
  }
  function readForm() { const q = $("pqfrBody").querySelector('[data-fr="qty"]'), d = $("pqfrBody").querySelector('[data-fr="dep"]'); if (q) S.qty = Math.max(1, Math.min(999, +q.value || 1)); if (d) S.dep = d.value || ""; save(); }
  function onChange(e) {
    const el = e.target.closest("[data-fr]"); if (!el) return; const a = el.dataset.fr, v = el.value;
    if (a === "ck") { const k = el.dataset.k; if (k === "on") S.on = el.checked; else S[k] = el.checked; save(); if (k === "wcol") { drawNet(); if (el.checked && !Object.keys(W).length) fetchWaves(); } if (k === "anim") { sync(); } else sync(); render(); }
    else if (a === "sp") { S.sp = +v; save(); } else if (a === "gol") { S.gol = v; PLAN = ALT = null; save(); render(); }
    else if (a === "selA" || a === "selB") { const w = a === "selA" ? "A" : "B"; if (v === "@map") { clickMode = w; say("Klik titik di peta untuk " + (w === "A" ? "asal" : "tujuan"), 5000); render(); } else if (v === "@me") locate(w); else if (v === "@cur") { } else if (v) { setEnd(w, { k: v }); render(); } else { setEnd(w, null); render(); } }
    else if (a === "qty" || a === "dep") { readForm(); PLAN = ALT = null; render(); }
    else if (a === "lgm") { S.lg.m = +v; save(); render(); } else if (a === "lgr") { S.lg.r = v; save(); render(); } else if (a === "lgq") { S.lg.q = Math.max(1, +v || 1); save(); render(); } else if (a === "lgd") { S.lg.deck = Math.max(10, +v || 40); save(); render(); }
  }
  function onInput(e) { const el = e.target.closest("[data-fr='q']"); if (el) { S.q = el.value; clearTimeout(onInput.t); onInput.t = setTimeout(render, 250); } }
  function addRoute() {
    const a = $("pqfrCa").value, b = $("pqfrCb").value, j = $("pqfrCj").value, f = +$("pqfrCf").value || 0; if (!a || !b || a === b) { say("Pilih dua pelabuhan berbeda"); return; }
    const id = "x" + Date.now().toString(36); S.custom.routes.push([id, (PT[a] || {}).n + " – " + (PT[b] || {}).n + " (kustom)", j, a + " " + b, f, "Kustom"]); save(); build(); stopShips(); ships = []; drawNet(); render(); say("Rute kustom ditambahkan");
  }
  function expCsv() {
    const q = v => { v = String(v == null ? "" : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }, rows = [["id", "nama", "jenis", "operator", "km", "kec_kmh", "layar_menit", "freq_per_hari", "singgah", "gelombang_m", "status"]];
    RT.forEach(r => { const w = waveOf(r); rows.push([r.id, r.n, jn(r).n, r.op, r.km.toFixed(1), jn(r).kmh, Math.round(r.km / jn(r).kmh * 60), r.f, r.stops.map(k => PT[k].n).join(" > "), w && w.hs != null ? w.hs : "", riskOf(r).txt]); });
    dl("rute-pelayaran.csv", "\ufeff" + rows.map(r => r.map(q).join(",")).join("\n"), "text/csv;charset=utf-8");
  }
  function onMapClick(ev) {
    if (!clickMode) return; const m = clickMode; clickMode = ""; const lat = +ev.latlng.lat.toFixed(5), lng = +ev.latlng.lng.toFixed(5);
    if (m === "addport") {
      const n = ($("pqfrCn") || {}).value || "Pelabuhan kustom", t = ($("pqfrCt") || {}).value || "A", k = "X" + Date.now().toString(36).toUpperCase().slice(-4);
      const nr = nearestPortsFrom(lat, lng, 1)[0]; S.custom.ports.push([k, n, "—", nr ? nr.p.prov : "", lat, lng, t, nr ? nr.p.isl : ""]); save(); build(); drawNet(); render(); say("Pelabuhan kustom ditambahkan"); return;
    }
    setEnd(m, { lat, lng, label: "" }); S.tab = "rute"; if (!P || P.style.display !== "flex") open(); else render(); say("Titik " + (m === "A" ? "asal" : "tujuan") + " diatur");
  }

  function init() {
    build(); css();
    const tg = document.createElement("button"); tg.id = "pqfrOnOff"; tg.innerHTML = '<i class="fa-solid fa-ship"></i>'; BTN = tg; updBtn(); tg.onclick = () => setOn();
    const putT = () => { try { PQ_DOCK.adopt(tg, "Pelayaran On/Off"); } catch (e) { tg.style.cssText = "position:fixed;left:10px;bottom:400px;z-index:900"; document.body.append(tg); } };
    typeof PQ_DOCK !== "undefined" ? putT() : setTimeout(putT, 1000);
    const b = document.createElement("button"); b.id = "pqfrBtn"; b.innerHTML = '<i class="fa-solid fa-anchor"></i>'; b.title = "Pelayaran: feri, kapal cepat, Pelni — rute, gelombang & logistik"; b.onclick = () => (P && P.style.display === "flex") ? (P.style.display = "none") : open();
    const put = () => { try { PQ_DOCK.adopt(b, "Pelayaran & Feri"); } catch (e) { b.style.cssText = "position:fixed;left:10px;bottom:450px;z-index:900"; document.body.append(b); } };
    typeof PQ_DOCK !== "undefined" ? put() : setTimeout(put, 1000);
    document.addEventListener("click", e => { const b = e.target.closest && e.target.closest(".fr-pop [data-fr]"); if (b) onClick({ target: b }); });
    const wait = setInterval(() => { const M = gmap(); if (M && window.L) { clearInterval(wait); drawNet(); M.on("click", onMapClick); if (S.wcol) fetchWaves(); } }, 800); setTimeout(() => clearInterval(wait), 60000);
  }
  function setPorts(v) {
    const shown = S.on !== false && S.ports; v = v === undefined ? !shown : !!v;
    if (v) { if (S.on === false) { S.on = true; S.lines = false; S.anim = false; } S.ports = true; } else S.ports = false;
    save(); sync(); say(v ? "Pelabuhan: NYALA" : "Pelabuhan: MATI"); if (P && P.style.display === "flex") render();
  }
  function setNet(v) {
    v = v === undefined ? S.on === false || !S.lines : !!v;
    if (v) { S.on = true; S.lines = true; if (S.ports === false) S.ports = true; } else S.on = false;
    save(); sync(); say(v ? "Jalur pelayaran: NYALA" : "Jalur pelayaran: MATI"); if (P && P.style.display === "flex") render();
  }
  window.PETAQU_FERI = { rows: () => [{ id: "feri", name: "Jaringan Rute Kapal & Feri", ic: "\uf21a", c: "#38bdf8", on: S.on !== false && !!S.lines }, { id: "feripel", name: "Pelabuhan Indonesia", ic: "\uf13d", c: "#0ea5e9", on: S.on !== false && !!S.ports }, { id: "feripanel", name: "Perencana Rute Kapal (panel)", ic: "\uf21a", c: "#7dd3fc", on: null }], act: id => { if (id === "feripanel") open(); else if (id === "feripel") setPorts(); else setNet(); }, open, toggle: setOn, waves: fetchWaves, _build: build, _plan: (A, B, obj, gol, qty) => { S.A = A; S.B = B; S.gol = gol || "0"; S.qty = qty || 1; const sa = endpoints(A), sb = endpoints(B); return assemble(dijkstra(sa, sb, obj || "cepat", S.gol, S.qty), S.gol, S.qty); }, _st: () => ({ PT, RT, ADJ, DEG }), _risk: risk, _calc: lgCalc, _S: S, _roadPorts: roadPorts, _iso: isoIslands, _pointAt: pointAt };
  typeof document === "undefined" ? 0 : (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init());
})();
