/* PETAQU Rute Pesawat Indonesia — perencana rute penerbangan domestik yang cerdas.
   • Cari rute bandara ↔ bandara ATAU titik peta/ruas jalan/lokasi proyek ↔ tujuan (otomatis menambah leg darat).
   • Mesin rute: langsung & transit (maks 2x), waktu terbang, layover, tarif perkiraan, emisi CO₂, zona waktu WIB/WITA/WIT.
   • Peringkat "Terbaik" (skor seimbang waktu/biaya/transit), Tercepat, Termurah, Paling sedikit transit.
   • Skenario "bandara tutup" (abu vulkanik, cuaca ekstrem) → rute alternatif otomatis.
   • Peta: garis lengkung rute, pesawat beranimasi, jaringan penuh, bandara terdekat dari titik/ruas proyek.
   • Data: data-bandara.js (edit mudah) + rute/bandara kustom, ekspor/impor JSON & CSV.
   Modul mandiri: tidak mengubah fitur lama, hanya menambah 1 tombol di dock. Jaringan rute INDIKATIF — cek maskapai resmi. */
(function () {
  "use strict";
  if (window.__pqPesawat) return; window.__pqPesawat = 1;
  const KEY = "petaqu_pesawat_v1";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const gmap = () => { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } };
  const TZN = { 7: "WIB", 8: "WITA", 9: "WIT" };
  const KELAS = { 1: "Hub utama", 2: "Bandara besar", 3: "Bandara sedang", 4: "Bandara kecil / perintis" };
  const PROC_BEFORE = 75, PROC_AFTER = 30;          // menit proses bandara (check-in/boarding & bagasi)
  const GROUND_KMH = 45, ROAD_FACTOR = 1.35, GROUND_RP_KM = 2500, GROUND_BASE_MIN = 20;

  let S = { tab: "rute", from: null, to: null, mode: "terbaik", pax: 1, layover: 90, when: "", closed: [], blocked: [], cAir: [], cRt: [], min: false, net: false, apts: false };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };

  /* ===================== MODEL DATA ===================== */
  const AIRS = {}, EDGES = new Map(), ADJ = {};
  const ekey = (a, b) => a < b ? a + "|" + b : b + "|" + a;
  const rad = x => x * Math.PI / 180;
  function hav(a, b) {
    const dLa = rad(b.lat - a.lat), dLo = rad(b.lng - a.lng), h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat)), x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  const compass = d => ["U", "TL", "T", "TG", "S", "BD", "B", "BL"][Math.round(d / 45) % 8];
  function pulau(prov) {
    const p = String(prov || "");
    if (/^(Aceh|Sumatera|Riau|Kepulauan Riau|Jambi|Kep\. Bangka|Bengkulu|Lampung)/.test(p)) return "Sumatera";
    if (/^(Banten|DKI|Jawa|DI Yogya)/.test(p)) return "Jawa";
    if (/^(Bali|Nusa Tenggara)/.test(p)) return "Bali & Nusa Tenggara";
    if (/^Kalimantan/.test(p)) return "Kalimantan";
    if (/^(Sulawesi|Gorontalo)/.test(p)) return "Sulawesi";
    if (/^Maluku/.test(p)) return "Maluku";
    if (/^Papua/.test(p)) return "Papua";
    return "Lainnya";
  }
  function legInfo(A, B) {
    const d = hav(A, B), prop = A.k === 4 || B.k === 4 || (d < 350 && (A.k >= 3 || B.k >= 3)) || d < 220;
    const t = Math.round((prop ? 22 : 28) + d / (prop ? 450 : 760) * 60);
    const fare = Math.round(Math.max(250000, prop ? 200000 + 1100 * d : 250000 + 850 * d) / 5000) * 5000;
    return { d, prop, t, fare, co2: d * (prop ? .13 : .09) };
  }
  function buildData() {
    Object.keys(AIRS).forEach(k => delete AIRS[k]); EDGES.clear(); Object.keys(ADJ).forEach(k => delete ADJ[k]);
    const add = r => {
      if (!r || !r[0] || !isFinite(r[5]) || !isFinite(r[6])) return;
      const c = String(r[0]).toUpperCase();
      AIRS[c] = { c, icao: r[1] || "", nama: r[2], kota: r[3], prov: r[4], lat: +r[5], lng: +r[6], tz: +r[7] || 7, k: +r[8] || 4, pulau: pulau(r[4]), custom: !!r.custom };
      ADJ[c] = [];
    };
    (window.BANDARA_DATA || []).forEach(add);
    (S.cAir || []).forEach(r => { const x = r.slice(); x.custom = true; add(x); });
    const link = (a, b, custom) => {
      a = String(a).toUpperCase(); b = String(b).toUpperCase();
      if (a === b || !AIRS[a] || !AIRS[b]) return; const k = ekey(a, b); if (EDGES.has(k)) return;
      const e = Object.assign({ a, b, custom: !!custom }, legInfo(AIRS[a], AIRS[b])); EDGES.set(k, e); ADJ[a].push(b); ADJ[b].push(a);
    };
    (window.RUTE_DATA || []).forEach(s => { const m = String(s).split(":"); if (m.length < 2) return; m[1].trim().split(/\s+/).forEach(t => link(m[0].trim(), t)); });
    (S.cRt || []).forEach(r => link(r[0], r[1], true));
  }
  const edge = (a, b) => EDGES.get(ekey(a, b));
  const isClosed = c => S.closed.indexOf(c) >= 0;
  const isBlocked = (a, b) => S.blocked.indexOf(ekey(a, b)) >= 0;
  const served = c => ADJ[c] && ADJ[c].some(n => !isClosed(n) && !isBlocked(c, n)) && !isClosed(c);
  const degree = c => (ADJ[c] || []).length;

  /* ===================== FORMAT ===================== */
  const fmtDur = m => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h ? h + "j " + String(r).padStart(2, "0") + "m" : r + "m"; };
  const fmtKm = d => (d >= 100 ? Math.round(d).toLocaleString("id-ID") : d.toFixed(1).replace(".", ",")) + " km";
  function fmtRp(n) { n = Math.round(n); if (n >= 1e6) return "Rp " + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(".", ",").replace(/,?0+$/, "") + " jt"; return "Rp " + Math.round(n / 1000) + " rb"; }
  const pad = n => String(n).padStart(2, "0");
  function localStr(ms, tz) { const d = new Date(ms + tz * 3600e3); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); }
  function localDay(ms, tz) { const d = new Date(ms + tz * 3600e3); return d.getUTCDate() + " " + ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][d.getUTCMonth()]; }
  function parseWhen(v, tz) { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || ""); if (!m) return null; return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - tz * 3600e3; }
  function defaultWhen() { const d = new Date(Date.now() + 36e5); d.setMinutes(0, 0, 0); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":00"; }

  /* ===================== MESIN RUTE ===================== */
  // Endpoint: {k:"apt",c:"CGK"} atau {k:"pt",lat,lng,label}
  function endPoint(E) { return E.k === "apt" ? AIRS[E.c] : E; }
  function cands(E, maxN) {
    const P = endPoint(E); if (!P) return [];
    const mk = (A, km) => km < 0.5 ? { c: A.c, g: null } : { c: A.c, g: { km: km * ROAD_FACTOR, min: Math.round(GROUND_BASE_MIN + km * ROAD_FACTOR / GROUND_KMH * 60), cost: Math.round(km * ROAD_FACTOR * GROUND_RP_KM / 5000) * 5000, from: P, to: A, straight: km } };
    if (E.k === "apt" && served(E.c)) return [{ c: E.c, g: null }];
    const lim = E.k === "apt" ? 320 : 450, all = Object.keys(AIRS).filter(served).map(c => ({ A: AIRS[c], d: hav(P, AIRS[c]) })).filter(x => x.d <= lim).sort((a, b) => a.d - b.d);
    return all.slice(0, maxN || (E.k === "apt" ? 3 : 4)).map(x => mk(x.A, x.d));
  }
  function paths(a, b) {
    const out = [], dir = hav(AIRS[a], AIRS[b]), lim = dir * 2.1 + 450;
    (function dfs(cur, path, dist) {
      if (cur === b) { out.push(path.slice()); return; }
      if (path.length >= 4) return;
      for (const n of ADJ[cur]) {
        if (path.indexOf(n) >= 0 || isClosed(n) || isBlocked(cur, n)) continue;
        if (n !== b && path.length >= 3) continue;
        const nd = dist + edge(cur, n).d; if (nd > lim) continue;
        path.push(n); dfs(n, path, nd); path.pop();
      }
    })(a, [a], 0);
    return out;
  }
  function plan(from, to, opt) {
    opt = Object.assign({ mode: S.mode, layover: S.layover, pax: S.pax, when: null }, opt || {});
    const O = cands(from), D = cands(to), res = [], seen = new Set();
    O.forEach(o => D.forEach(d => {
      const seqs = o.c === d.c ? [[o.c]] : paths(o.c, d.c);
      seqs.forEach(seq => {
        const key = seq.join(">") + "|" + (o.g ? 1 : 0) + (d.g ? 1 : 0); if (seen.has(key)) return; seen.add(key);
        const legs = []; for (let i = 0; i < seq.length - 1; i++) legs.push(edge(seq[i], seq[i + 1]));
        const transits = Math.max(0, seq.length - 2), fly = legs.reduce((s, e) => s + e.t, 0), lay = transits * opt.layover;
        const gIn = o.g, gOut = d.g ? { km: d.g.km, min: d.g.min, cost: d.g.cost, from: d.g.to, to: d.g.from, straight: d.g.straight } : null;
        const proc = seq.length > 1 ? PROC_BEFORE + PROC_AFTER : 0;
        const gm = (gIn ? gIn.min : 0) + (gOut ? gOut.min : 0);
        const fare = legs.reduce((s, e) => s + e.fare, 0) * opt.pax, gc = ((gIn ? gIn.cost : 0) + (gOut ? gOut.cost : 0));
        const dist = legs.reduce((s, e) => s + e.d, 0);
        res.push({ seq, legs, o, d, gIn, gOut, transits, fly, lay, proc, total: fly + lay + proc + gm, fare, gc, cost: fare + gc, dist, co2: legs.reduce((s, e) => s + e.co2, 0) * opt.pax, prop: legs.some(e => e.prop), small: seq.some(c => AIRS[c].k === 4), direct: seq.length === 2 });
      });
    }));
    if (!res.length) return { items: [], opt };
    const rng = f => { const v = res.map(f); const lo = Math.min.apply(0, v), hi = Math.max.apply(0, v); return x => hi === lo ? 0 : (f(x) - lo) / (hi - lo); };
    const nT = rng(r => r.total), nC = rng(r => r.cost);
    res.forEach(r => { r.score = .45 * nT(r) + .35 * nC(r) + .2 * (r.transits / 2) + (r.small ? .02 : 0); });
    const best = (f) => res.reduce((m, r) => f(r) < f(m) ? r : m, res[0]);
    const tags = new Map(); const tag = (r, t) => { (tags.get(r) || tags.set(r, []).get(r)).push(t); };
    tag(best(r => r.score), "⭐ Terbaik"); tag(best(r => r.total), "⚡ Tercepat"); tag(best(r => r.cost), "💰 Termurah");
    const dir = res.filter(r => r.direct && !r.gIn && !r.gOut); if (dir.length) tag(dir.reduce((m, r) => r.total < m.total ? r : m), "🎯 Langsung");
    res.forEach(r => r.tags = tags.get(r) || []);
    const sorter = { terbaik: r => r.score, tercepat: r => r.total + r.transits * .01, termurah: r => r.cost, transit: r => r.transits * 1e6 + (r.gIn ? 1 : 0) * 1e5 + r.total }[opt.mode] || (r => r.score);
    res.sort((a, b) => sorter(a) - sorter(b) || a.total - b.total);
    // buang kombinasi yang jelas didominasi (lebih lama, lebih mahal, lebih banyak transit dari yang lain)
    const keep = res.filter((r, i) => !res.some((q, j) => j !== i && q.total <= r.total && q.cost <= r.cost && q.transits <= r.transits && (q.total < r.total || q.cost < r.cost || q.transits < r.transits)));
    const items = (keep.length ? keep : res).slice(0, 7);
    for (const r of res) { if (items.length >= 4) break; if (items.indexOf(r) < 0) items.push(r); }
    items.sort((a, b) => sorter(a) - sorter(b) || a.total - b.total);
    // jadwal lokal
    const A0 = endPoint(from), t0 = opt.when != null ? opt.when : parseWhen(S.when || defaultWhen(), A0.tz || 7);
    items.forEach(r => schedule(r, t0, opt));
    return { items, opt, all: res.length };
  }
  function schedule(r, t0, opt) {
    if (t0 == null) return; let t = t0 + (r.gIn ? r.gIn.min : 0) * 6e4; const L = [];
    if (r.seq.length < 2) { r.sched = { start: t0, legs: [], end: t }; return; }
    t += PROC_BEFORE * 6e4;
    r.legs.forEach((e, i) => {
      const from = r.seq[i], to = r.seq[i + 1], dep = t, arr = dep + e.t * 6e4;
      L.push({ from, to, dep, arr, e }); t = arr + opt.layover * 6e4;
    });
    const last = L[L.length - 1]; r.sched = { start: t0, legs: L, end: last.arr + (PROC_AFTER + (r.gOut ? r.gOut.min : 0)) * 6e4 };
  }
  function insights(res, from, to) {
    const out = [], items = res.items; if (!items.length) return out;
    const best = items.find(r => r.tags.includes("⭐ Terbaik")) || items[0], cheap = items.find(r => r.tags.includes("💰 Termurah")), fast = items.find(r => r.tags.includes("⚡ Tercepat"));
    const dir = items.find(r => r.direct && !r.gIn && !r.gOut);
    if (cheap && dir && cheap !== dir && dir.cost - cheap.cost > 150000) out.push("Rute transit <b>" + cheap.seq.join("→") + "</b> bisa ±" + fmtRp(dir.cost - cheap.cost) + " lebih hemat dari penerbangan langsung, tetapi +" + fmtDur(cheap.total - dir.total) + " lebih lama.");
    if (fast && best !== fast && best.total - fast.total > 20) out.push("Rute tercepat <b>" + fast.seq.join("→") + "</b> memangkas " + fmtDur(best.total - fast.total) + " dari rute terbaik, dengan selisih biaya " + fmtRp(Math.abs(fast.cost - best.cost)) + (fast.cost > best.cost ? " lebih mahal." : " lebih murah."));
    if (!dir && !items[0].gIn && !items[0].gOut && items[0].seq.length > 1) out.push("Tidak ada penerbangan langsung di data jaringan — perlu transit (umumnya via hub " + (items[0].seq.slice(1, -1).join(", ") || "-") + ").");
    if (items.some(r => r.gIn || r.gOut)) out.push("Titik berada di luar bandara berjadwal: rute menambahkan perjalanan <b>darat</b> ke bandara terdekat yang melayani penerbangan (estimasi jalan " + GROUND_KMH + " km/jam).");
    const a = endPoint(from), b = endPoint(to), ta = a.tz, tb = b.tz;
    if (ta && tb && ta !== tb) out.push("Perbedaan zona waktu: " + TZN[ta] + " → " + TZN[tb] + " (" + (tb - ta > 0 ? "+" : "") + (tb - ta) + " jam). Jam tiba ditampilkan waktu setempat tujuan.");
    if (best.small) out.push("⚠️ Ada bandara kecil/perintis pada rute — frekuensi biasanya rendah (kadang 1–3×/pekan) & rentan cuaca. Pastikan jadwal dan sisakan hari cadangan.");
    if (best.transits && S.layover < 90) out.push("Layover " + S.layover + " menit cukup ketat bila beda maskapai/bagasi tidak terhubung; pertimbangkan ≥ 120 menit.");
    if (S.closed.length) out.push("Skenario aktif: bandara tutup (" + S.closed.join(", ") + ") — rute dihitung menghindarinya.");
    return out;
  }
  // bandara terdekat dari titik
  function nearest(P, n) {
    return Object.keys(AIRS).map(c => ({ A: AIRS[c], d: hav(P, AIRS[c]) })).sort((a, b) => a.d - b.d).slice(0, n || 8);
  }
  function components() {
    const seen = new Set(), comps = [];
    Object.keys(AIRS).forEach(c => { if (seen.has(c) || !ADJ[c].length) return; const q = [c], comp = []; seen.add(c); while (q.length) { const x = q.pop(); comp.push(x); ADJ[x].forEach(n => { if (!seen.has(n)) { seen.add(n); q.push(n); } }); } comps.push(comp); });
    return comps.sort((a, b) => b.length - a.length);
  }

  /* ===================== PETA ===================== */
  let LG = null, NET = null, APT = null, AN = { raf: 0, mk: null, on: false, path: null, t0: 0 }, PANE = false, pickCb = null, REF = null;
  function ensureLayers() {
    const m = gmap(); if (!m) return null;
    if (!PANE) { PANE = true; try { m.createPane("pqpwPane"); m.getPane("pqpwPane").style.zIndex = 455; } catch (e) { } }
    if (!LG) LG = L.layerGroup().addTo(m);
    if (!NET) NET = L.layerGroup();
    if (!APT) APT = L.layerGroup();
    return m;
  }
  const pt = A => [A.lat, A.lng];
  // beri ruang agar rute tidak tertutup panel di sisi kanan (layar lebar)
  const fit = (m, b, maxZoom) => { try { const wide = innerWidth > 760 && P && P.style.display === "flex"; m.fitBounds(L.latLngBounds(b), { paddingTopLeft: [50, 60], paddingBottomRight: [wide ? Math.min(480, innerWidth * .4) + 20 : 50, 60], maxZoom }); } catch (e) { } };
  function arc(a, b, bend, n) {
    n = n || 36; const out = [], dx = b.lng - a.lng, dy = b.lat - a.lat, len = Math.hypot(dx, dy) || 1e-9;
    let nx = -dy / len, ny = dx / len; if (ny < 0) { nx = -nx; ny = -ny; }
    for (let i = 0; i <= n; i++) { const t = i / n, s = Math.sin(Math.PI * t) * (bend == null ? .14 : bend) * len; out.push([a.lat + dy * t + ny * s, a.lng + dx * t + nx * s]); }
    return out;
  }
  const chip = (A, cls) => L.marker(pt(A), { icon: L.divIcon({ className: "pqpw-chip " + (cls || ""), html: "<b>" + esc(A.c || "") + "</b>", iconSize: [0, 0], iconAnchor: [0, 0] }), keyboard: false, zIndexOffset: 900 });
  function airPopup(A) {
    const n = degree(A.c), cl = isClosed(A.c);
    return '<div class="pqpw-pop"><b>' + esc(A.c) + " · " + esc(A.nama) + "</b><div>" + esc(A.kota) + ", " + esc(A.prov) + "</div><div class='m'>ICAO " + esc(A.icao || "-") + " · " + TZN[A.tz] + " · " + KELAS[A.k] + " · " + (n ? n + " tujuan langsung" : "tanpa jadwal reguler (data)") + (cl ? " · <span style='color:#f87171'>DITUTUP (skenario)</span>" : "") + '</div><div class="b"><button data-pw="from" data-a="' + A.c + '">Dari sini</button><button data-pw="to" data-a="' + A.c + '">Ke sini</button><button data-pw="spider" data-a="' + A.c + '">Semua rute</button></div></div>';
  }
  function clearRoute() { if (LG) LG.clearLayers(); stopAnim(); }
  function drawItin(r) {
    const m = ensureLayers(); if (!m || !r) return; clearRoute(); const bounds = [], segs = [];
    const dash = { pane: "pqpwPane", color: "#a3e635", weight: 3, dashArray: "2 8", opacity: .95 };
    const ground = (g, rev) => { if (!g) return; const a = g.from, b = g.to, line = [pt(a), pt(b)]; L.polyline(line, dash).addTo(LG); bounds.push(pt(a), pt(b)); segs.push({ pts: rev ? line : line, min: g.min, ground: true }); };
    if (r.gIn) { const P = r.gIn.from; L.circleMarker(pt(P), { radius: 7, color: "#fff", weight: 2, fillColor: "#a3e635", fillOpacity: 1 }).bindTooltip("Titik awal").addTo(LG); ground(r.gIn); }
    r.legs.forEach((e, i) => {
      const A = AIRS[r.seq[i]], B = AIRS[r.seq[i + 1]], pts = arc(A, B, .14 + Math.min(.06, e.d / 40000));
      L.polyline(pts, { pane: "pqpwPane", color: e.prop ? "#f59e0b" : "#22d3ee", weight: 4, opacity: .95, lineCap: "round" }).bindTooltip(A.c + " → " + B.c + " · " + fmtKm(e.d) + " · " + fmtDur(e.t) + " · ± " + fmtRp(e.fare) + (e.prop ? " · baling-baling" : " · jet")).addTo(LG);
      pts.forEach(p => bounds.push(p)); segs.push({ pts, min: e.t, ground: false, A, B });
      if (i < r.legs.length - 1) segs.push({ pts: [pt(B)], min: S.layover, hold: true });
    });
    r.seq.forEach((c, i) => { const A = AIRS[c]; chip(A, i === 0 || i === r.seq.length - 1 ? "end" : "mid").bindPopup(() => airPopup(A), { maxWidth: 300 }).addTo(LG); bounds.push(pt(A)); });
    if (r.gOut) { ground(r.gOut); const P = r.gOut.to; L.circleMarker(pt(P), { radius: 7, color: "#fff", weight: 2, fillColor: "#f472b6", fillOpacity: 1 }).bindTooltip("Titik tujuan").addTo(LG); }
    if (!r.legs.length && r.seq.length === 1) { const A = AIRS[r.seq[0]]; chip(A, "end").addTo(LG); bounds.push(pt(A)); }
    // urutan segmen harus: darat-masuk, leg..., darat-keluar (ground(r.gOut) ditambahkan setelah leg)
    fit(m, bounds, 9);
    startAnim(segs);
  }
  const PLANE = '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="#fff" stroke="#0e7490" stroke-width="1.2" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>';
  function startAnim(segs) {
    stopAnim(); const m = gmap(); if (!m || !segs.length) return;
    const tot = segs.reduce((s, x) => s + x.min, 0) || 1; const dur = Math.max(5000, Math.min(14000, 3500 + tot * 22));
    const mk = L.marker(segs[0].pts[0], { icon: L.divIcon({ className: "pqpw-plane", html: '<div id="pqpwPl">' + PLANE + "</div>", iconSize: [26, 26], iconAnchor: [13, 13] }), interactive: false, keyboard: false, zIndexOffset: 2000 }).addTo(LG);
    AN = { raf: 0, mk, on: true, segs, tot, dur, t0: performance.now(), pause: 0 };
    const poseAt = f => {
      let acc = f * tot; for (const s of segs) {
        if (acc <= s.min || s === segs[segs.length - 1]) {
          const u = s.min ? Math.min(1, acc / s.min) : 1, n = s.pts.length - 1; if (n < 1) return { ll: s.pts[0], ang: null, ground: s.ground };
          const x = u * n, i = Math.min(n - 1, Math.floor(x)), k = x - i, p = s.pts[i], q = s.pts[i + 1];
          return { ll: [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k], p, q, ground: s.ground };
        } acc -= s.min;
      }
    };
    const step = now => {
      if (!AN.on) return; const el = AN.paused ? AN.pause : (now - AN.t0); AN.pause = el;
      const f = Math.min(1, (el % (dur + 900)) / dur), ps = poseAt(f); if (ps) {
        mk.setLatLng(ps.ll); const e = document.getElementById("pqpwPl");
        if (e && ps.p) { const a = m.latLngToLayerPoint(L.latLng(ps.p)), b = m.latLngToLayerPoint(L.latLng(ps.q)); const ang = Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI; e.style.transform = "rotate(" + ang.toFixed(1) + "deg)"; e.style.filter = ps.ground ? "hue-rotate(80deg)" : "none"; }
      }
      AN.raf = requestAnimationFrame(step);
    };
    AN.paused = false; AN.t0 = performance.now(); AN.raf = requestAnimationFrame(step);
  }
  function stopAnim() { if (AN && AN.raf) cancelAnimationFrame(AN.raf); AN = { raf: 0, mk: null, on: false }; }
  function toggleAnim() { if (!AN.on) return; AN.paused = !AN.paused; if (!AN.paused) AN.t0 = performance.now() - AN.pause; const b = $("pqpwPlay"); if (b) b.textContent = AN.paused ? "▶" : "⏸"; }
  function drawSpider(code) {
    const m = ensureLayers(); if (!m) return; clearRoute(); const A = AIRS[code]; if (!A) return; const b = [pt(A)];
    ADJ[code].forEach(n => { const B = AIRS[n], e = edge(code, n), dead = isClosed(n) || isBlocked(code, n); L.polyline(arc(A, B, .1), { pane: "pqpwPane", color: dead ? "#64748b" : e.prop ? "#f59e0b" : "#22d3ee", weight: 2.5, opacity: .85, dashArray: dead ? "4 6" : null }).bindTooltip(code + " → " + n + " · " + fmtKm(e.d) + " · " + fmtDur(e.t) + " · ± " + fmtRp(e.fare)).addTo(LG); chip(B, "mid").bindPopup(() => airPopup(B), { maxWidth: 300 }).addTo(LG); b.push(pt(B)); });
    chip(A, "end").bindPopup(() => airPopup(A), { maxWidth: 300 }).addTo(LG);
    fit(m, b, 8);
  }
  function setNet(on) {
    S.net = !!on; save(); const m = ensureLayers(); if (!m) return; NET.clearLayers();
    if (on) { const rn = L.canvas({ padding: .3 }); EDGES.forEach(e => { if (isClosed(e.a) || isClosed(e.b) || isBlocked(e.a, e.b)) return; L.polyline(arc(AIRS[e.a], AIRS[e.b], .08, 14), { renderer: rn, color: e.prop ? "#f59e0b" : "#22d3ee", weight: 1, opacity: .4, interactive: false }).addTo(NET); }); NET.addTo(m); } else m.removeLayer(NET);
  }
  function setApts(on) {
    S.apts = !!on; save(); const m = ensureLayers(); if (!m) return; APT.clearLayers();
    if (on) { Object.keys(AIRS).forEach(c => { const A = AIRS[c], r = { 1: 8, 2: 6.5, 3: 5.5, 4: 4.5 }[A.k]; L.circleMarker(pt(A), { radius: r, color: "#fff", weight: 1.2, fillColor: isClosed(c) ? "#ef4444" : degree(c) ? (A.k <= 2 ? "#22d3ee" : "#f59e0b") : "#94a3b8", fillOpacity: .95 }).bindTooltip(c + " · " + A.nama, { direction: "top" }).bindPopup(() => airPopup(A), { maxWidth: 300 }).addTo(APT); }); APT.addTo(m); } else m.removeLayer(APT);
  }
  function drawRef(P, list) {
    const m = ensureLayers(); if (!m) return; clearRoute(); REFON = true; const b = [[P.lat, P.lng]];
    L.circleMarker([P.lat, P.lng], { radius: 8, color: "#fff", weight: 2, fillColor: "#a3e635", fillOpacity: 1 }).bindTooltip(P.label || "Titik acuan").addTo(LG);
    list.forEach((x, i) => { L.polyline([[P.lat, P.lng], pt(x.A)], { pane: "pqpwPane", color: i === 0 ? "#a3e635" : "#94a3b8", weight: i === 0 ? 3 : 1.5, dashArray: "3 7", opacity: .9 }).addTo(LG); chip(x.A, i === 0 ? "end" : "mid").bindPopup(() => airPopup(x.A), { maxWidth: 300 }).addTo(LG); b.push(pt(x.A)); });
    fit(m, b, 11);
  }

  /* ===================== UI ===================== */
  let P = null, REFON = false, TOASTT = 0, LAST = null, SEL = 0, REFSRC = { type: "center" };
  const say = (t, ms) => { let d = $("pqpwToast"); if (!d) { d = document.createElement("div"); d.id = "pqpwToast"; document.body.appendChild(d); } d.textContent = t; d.style.display = "block"; clearTimeout(TOASTT); TOASTT = setTimeout(() => d.style.display = "none", ms || 2600); };
  function css() {
    if ($("pqpwCss")) return; const s = document.createElement("style"); s.id = "pqpwCss";
    s.textContent = "#pqpwPanel{position:fixed;right:10px;top:70px;z-index:1310;width:min(460px,calc(100vw - 20px));max-height:calc(100vh - 90px);display:none;flex-direction:column;background:#0a0e17f7;color:#dbe7f3;border:1px solid #94b2cc40;border-radius:14px;font:13px/1.45 system-ui,sans-serif;box-shadow:0 14px 40px #0009;backdrop-filter:blur(10px);overflow:hidden}" +
      "#pqpwPanel.min .pw-tabs,#pqpwPanel.min #pqpwBody{display:none}#pqpwPanel header{display:flex;align-items:center;gap:8px;padding:11px 14px 6px}#pqpwPanel header b{flex:1;font-size:14px}#pqpwPanel header small{display:block;color:#8fa6bd;font-weight:400;font-size:11px}#pqpwPanel .x{background:0;border:0;color:#8fa6bd;font-size:20px;cursor:pointer;line-height:1}" +
      ".pw-tabs{display:flex;gap:4px;padding:0 10px 8px;overflow-x:auto;flex:none}.pw-tabs button{flex:none;padding:6px 10px;border-radius:999px;border:1px solid #94b2cc33;background:#0f1726;color:#cbd5e1;font:600 12px system-ui;cursor:pointer}.pw-tabs button.on{background:#0891b2;border-color:#22d3ee;color:#fff}" +
      "#pqpwBody{overflow:auto;padding:0 12px 14px;display:flex;flex-direction:column;gap:8px}#pqpwPanel input,#pqpwPanel select{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid #94b2cc40;background:#0f1726;color:#e6f1fb;font:inherit;outline:0;min-width:0}#pqpwPanel input:focus,#pqpwPanel select:focus{border-color:#22d3ee}" +
      ".pw-row{display:flex;gap:6px;align-items:center}.pw-row>*{flex:1}.pw-row>.s{flex:none}.pw-lab{font-size:11px;color:#8fa6bd;margin:2px 0 -3px}.pw-btn{padding:7px 11px;border-radius:9px;border:1px solid #22d3ee66;background:#0e7490;color:#fff;font:600 12.5px system-ui;cursor:pointer;flex:none}.pw-btn.g{background:#0f1726;border-color:#94b2cc40;color:#cbd5e1}.pw-btn.sm{padding:4px 8px;font-size:11.5px}.pw-btn:hover{filter:brightness(1.15)}" +
      ".pw-chips{display:flex;flex-wrap:wrap;gap:5px}.pw-chips button{padding:4px 9px;border-radius:999px;border:1px solid #94b2cc33;background:#0f1726;color:#cbd5e1;font:600 11.5px system-ui;cursor:pointer}.pw-chips button.on{background:#0891b2;border-color:#22d3ee;color:#fff}" +
      ".pw-card{border:1px solid #94b2cc2e;border-radius:11px;background:#0f172a;padding:9px 10px;cursor:pointer}.pw-card.on{border-color:#22d3ee;box-shadow:0 0 0 1px #22d3ee55}.pw-seq{font-weight:700;font-size:14px;display:flex;flex-wrap:wrap;gap:3px;align-items:center}.pw-seq i{color:#22d3ee;font-style:normal}.pw-seq .g{color:#a3e635;font-size:11px;font-weight:600}" +
      ".pw-tag{display:inline-block;padding:1px 7px;border-radius:999px;background:#164e63;color:#a5f3fc;font:600 10.5px system-ui;margin-right:4px}.pw-st{display:flex;flex-wrap:wrap;gap:4px 12px;color:#aebfd1;font-size:12px;margin-top:4px}.pw-st b{color:#e6f1fb}.pw-mini{color:#8fa6bd;font-size:11.5px}" +
      ".pw-leg{display:grid;grid-template-columns:auto 1fr auto;gap:2px 8px;font-size:12px;padding:5px 0;border-top:1px dashed #94b2cc26;align-items:center}.pw-leg .t{font-weight:700;color:#e6f1fb}.pw-ins{border:1px solid #22d3ee33;background:#0b2230;border-radius:10px;padding:8px 10px;font-size:12px;color:#cfe6f3}.pw-ins div{margin:2px 0}" +
      ".pw-it{border:1px solid #94b2cc2e;border-radius:10px;background:#0f172a;padding:8px 10px}.pw-it .h{display:flex;gap:8px;align-items:center}.pw-it .h b{flex:1}.pw-bar{height:6px;border-radius:4px;background:#22d3ee;min-width:3px}.pw-bw{display:flex;align-items:center;gap:6px;font-size:12px}.pw-bw span{width:34px;flex:none;font-weight:700}.pw-bw em{font-style:normal;color:#8fa6bd;width:26px;text-align:right;flex:none}" +
      ".pw-warn{color:#fbbf24}.pw-ok{color:#86efac}.pw-bad{color:#f87171}#pqpwToast{position:fixed;left:50%;transform:translateX(-50%);bottom:80px;z-index:5000;display:none;background:#0e7490;color:#fff;padding:8px 14px;border-radius:999px;font:600 12.5px system-ui;box-shadow:0 6px 20px #0007;max-width:90vw;text-align:center}" +
      ".pqpw-chip{pointer-events:auto}.pqpw-chip b{display:block;transform:translate(-50%,-50%);width:max-content;padding:2px 6px;border-radius:7px;background:#0b2a38;color:#e0f7ff;border:1.5px solid #22d3ee;font:700 11px system-ui;box-shadow:0 2px 6px #0008;white-space:nowrap}.pqpw-chip.end b{background:#0e7490;color:#fff;border-color:#fff;font-size:12px}.pqpw-chip.mid b{border-color:#f59e0b}.pqpw-plane{pointer-events:none}#pqpwPl{width:26px;height:26px;transform-origin:50% 50%;filter:drop-shadow(0 2px 3px #000a)}" +
      ".pqpw-pop b{font-size:13px}.pqpw-pop .m{color:#64748b;font-size:11.5px;margin:3px 0}.pqpw-pop .b{display:flex;gap:5px;margin-top:6px}.pqpw-pop .b button{padding:4px 8px;border-radius:7px;border:1px solid #0e7490;background:#0e7490;color:#fff;font:600 11.5px system-ui;cursor:pointer}";
    document.head.appendChild(s);
  }
  const TABS = [["rute", "✈️ Rute"], ["bandara", "🛬 Bandara"], ["dekat", "📍 Terdekat"], ["jaringan", "🕸️ Jaringan"], ["data", "⚙️ Data"]];
  function build() {
    css(); P = document.createElement("div"); P.id = "pqpwPanel";
    P.innerHTML = '<header><span style="font-size:20px">✈️</span><b>Rute Pesawat Indonesia<small>Perencana rute cerdas • langsung & transit • darat + udara</small></b><button class="x" id="pqpwMin" title="Ciutkan/lebarkan" aria-label="Ciutkan">▾</button><button class="x" id="pqpwX" aria-label="Tutup">×</button></header><div class="pw-tabs" id="pqpwTabs"></div><div id="pqpwBody"></div>';
    document.body.appendChild(P); $("pqpwX").onclick = () => P.style.display = "none";
    const mn = $("pqpwMin"), setMin = v => { P.classList.toggle("min", v); mn.textContent = v ? "▴" : "▾"; S.min = v; save(); }; mn.onclick = () => setMin(!P.classList.contains("min")); if (S.min) setMin(true);
    $("pqpwTabs").innerHTML = TABS.map(t => '<button data-t="' + t[0] + '">' + t[1] + "</button>").join("");
    $("pqpwTabs").onclick = e => { const t = e.target.closest("button"); if (t) { S.tab = t.dataset.t; save(); render(); } };
    P.addEventListener("change", onChange); P.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("#pqpwFrom,#pqpwTo")) { onChange(e); doSearch(); } });
  }
  function open() { if (!P) build(); if (!S.when || Date.parse(S.when) < Date.now() - 36e5) S.when = defaultWhen(); P.style.display = "flex"; render(); }
  function render() {
    [...$("pqpwTabs").children].forEach(b => b.classList.toggle("on", b.dataset.t === S.tab));
    const B = $("pqpwBody"); B.scrollTop = 0; B.innerHTML = ({ rute: tRute, bandara: tBandara, dekat: tDekat, jaringan: tJaringan, data: tData }[S.tab] || tRute)();
    if (S.tab !== "dekat" && REFON) { REFON = false; clearRoute(); }
    if (S.tab === "rute" && LAST && LAST.items.length) showResults();
    if (S.tab === "dekat") showNearest();
    if (S.tab === "bandara") filterAirports();
  }
  const label = E => !E ? "" : E.k === "apt" ? E.c + " — " + AIRS[E.c].nama + " · " + AIRS[E.c].kota : (E.label || "Titik peta");
  function dl() { return '<datalist id="pqpwDL">' + Object.keys(AIRS).sort().map(c => '<option value="' + esc(c + " — " + AIRS[c].nama + " · " + AIRS[c].kota) + '"></option>').join("") + "</datalist>"; }
  function tRute() {
    const pop = [["CGK", "DPS"], ["CGK", "UPG"], ["SUB", "DJJ"], ["CGK", "LBJ"], ["BPN", "MDC"], ["PWL", "DJJ"], ["MES", "DPS"], ["KOE", "TIM"]];
    return dl() + '<div class="pw-lab">Dari (bandara / kota / titik)</div><div class="pw-row"><input id="pqpwFrom" list="pqpwDL" placeholder="Ketik kota atau kode: CGK, Medan, Papua…" value="' + esc(label(S.from)) + '"><button class="pw-btn g s" data-pw="pickpt" data-a="from" title="Pilih titik di peta">📍</button><button class="pw-btn g s" data-pw="ctr" data-a="from" title="Pakai pusat peta">🎯</button></div>' +
      '<div class="pw-row" style="justify-content:center"><button class="pw-btn g sm s" data-pw="swap">⇅ Tukar</button><button class="pw-btn g sm s" data-pw="gps">📡 Lokasiku</button><button class="pw-btn g sm s" data-pw="proj">🏗️ Ruas/proyek…</button></div>' +
      '<div class="pw-lab">Ke</div><div class="pw-row"><input id="pqpwTo" list="pqpwDL" placeholder="Tujuan…" value="' + esc(label(S.to)) + '"><button class="pw-btn g s" data-pw="pickpt" data-a="to" title="Pilih titik di peta">📍</button><button class="pw-btn g s" data-pw="ctr" data-a="to" title="Pakai pusat peta">🎯</button></div>' +
      '<div class="pw-row"><div><div class="pw-lab">Berangkat (waktu lokal asal)</div><input type="datetime-local" id="pqpwWhen" value="' + esc(S.when) + '"></div><div style="flex:0 0 74px"><div class="pw-lab">Penumpang</div><input type="number" id="pqpwPax" min="1" max="20" value="' + S.pax + '"></div><div style="flex:0 0 96px"><div class="pw-lab">Layover min.</div><select id="pqpwLay">' + [45, 60, 90, 120, 180].map(v => '<option value="' + v + '"' + (v === S.layover ? " selected" : "") + ">" + v + " mnt</option>").join("") + "</select></div></div>" +
      '<div class="pw-chips" id="pqpwModes">' + [["terbaik", "⭐ Terbaik"], ["tercepat", "⚡ Tercepat"], ["termurah", "💰 Termurah"], ["transit", "🎯 Min. transit"]].map(m => '<button data-pw="mode" data-a="' + m[0] + '" class="' + (S.mode === m[0] ? "on" : "") + '">' + m[1] + "</button>").join("") + "</div>" +
      '<div class="pw-row"><button class="pw-btn" data-pw="go">🔍 Cari rute</button><button class="pw-btn g" data-pw="clear">Bersihkan peta</button></div>' +
      '<div class="pw-chips">' + pop.map(p => '<button data-pw="quick" data-a="' + p.join(">") + '">' + p.join(" → ") + "</button>").join("") + "</div>" +
      '<div id="pqpwRes"></div>';
  }
  function resolveText(t) {
    t = (t || "").trim(); if (!t) return null; if (/^📍/.test(t)) return null;
    const m = /^([A-Za-z]{3})\b/.exec(t); if (m && AIRS[m[1].toUpperCase()]) return { k: "apt", c: m[1].toUpperCase() };
    const q = t.toLowerCase(), hits = Object.keys(AIRS).map(c => { const A = AIRS[c], hay = (A.nama + " " + A.kota + " " + A.prov + " " + A.icao).toLowerCase(); let sc = 0; if (A.kota.toLowerCase().startsWith(q) || A.nama.toLowerCase().startsWith(q)) sc = 3; else if (hay.includes(q)) sc = 1; return { c, sc, k: A.k }; }).filter(x => x.sc).sort((a, b) => b.sc - a.sc || a.k - b.k);
    return hits.length ? { k: "apt", c: hits[0].c } : null;
  }
  function onChange(e) {
    const t = e.target; if (!t || !t.id) return;
    if (t.id === "pqpwFrom" || t.id === "pqpwTo") { const E = resolveText(t.value); if (E) { S[t.id === "pqpwFrom" ? "from" : "to"] = E; t.value = label(E); save(); } else if (t.value.trim() && !/^📍/.test(t.value)) say("Bandara/kota tidak ditemukan — pilih dari daftar"); }
    else if (t.id === "pqpwWhen") { S.when = t.value; save(); } else if (t.id === "pqpwPax") { S.pax = Math.max(1, Math.min(20, +t.value || 1)); save(); } else if (t.id === "pqpwLay") { S.layover = +t.value || 90; save(); }
  }
  function doSearch() {
    ["from", "to"].forEach(k => { if (S[k] && S[k].k === "apt" && !AIRS[S[k].c]) S[k] = null; const i = $(k === "from" ? "pqpwFrom" : "pqpwTo"); if (!S[k] && i) S[k] = resolveText(i.value); });
    if (!S.from || !S.to) { say("Isi asal dan tujuan dulu"); return; }
    if (S.from.k === "apt" && S.to.k === "apt" && S.from.c === S.to.c) { say("Asal dan tujuan sama"); return; }
    save(); LAST = plan(S.from, S.to); LAST.from = S.from; LAST.to = S.to; SEL = 0; showResults(); if (LAST.items.length) drawItin(LAST.items[0]);
  }
  function legsHTML(r) {
    if (!r.sched) return ""; let h = "";
    if (r.gIn) h += '<div class="pw-leg"><span>🚗</span><span><b>Darat</b> ke ' + esc(r.gIn.to.c) + " · " + fmtKm(r.gIn.km) + " (± jalan)</span><span class='t'>" + fmtDur(r.gIn.min) + "</span></div>";
    r.sched.legs.forEach((L, i) => {
      const A = AIRS[L.from], B = AIRS[L.to];
      h += '<div class="pw-leg"><span>' + (L.e.prop ? "🛩️" : "✈️") + "</span><span><b>" + L.from + " " + localStr(L.dep, A.tz) + " " + TZN[A.tz] + "</b> → <b>" + L.to + " " + localStr(L.arr, B.tz) + " " + TZN[B.tz] + "</b> <span class='pw-mini'>(" + localDay(L.arr, B.tz) + ") · " + fmtKm(L.e.d) + " · ± " + fmtRp(L.e.fare) + (L.e.prop ? " · baling-baling" : " · jet") + "</span></span><span class='t'>" + fmtDur(L.e.t) + "</span></div>";
      if (i < r.sched.legs.length - 1) h += '<div class="pw-leg"><span>⏳</span><span class="pw-mini">Transit di ' + esc(AIRS[L.to].kota) + " (" + L.to + ")</span><span class='pw-mini'>" + S.layover + "m</span></div>";
    });
    if (r.gOut) h += '<div class="pw-leg"><span>🚗</span><span><b>Darat</b> dari ' + esc(r.gOut.from.c) + " · " + fmtKm(r.gOut.km) + "</span><span class='t'>" + fmtDur(r.gOut.min) + "</span></div>";
    return h;
  }
  function showResults() {
    const R = $("pqpwRes"); if (!R || !LAST) return;
    if (!LAST.items.length) {
      const why = []; [LAST.from, LAST.to].forEach(E => { if (E.k === "apt" && isClosed(E.c)) why.push(E.c + " sedang ditutup (skenario)"); else if (E.k === "apt" && !served(E.c) && !cands(E).length) why.push(E.c + " tak punya jadwal & tak ada bandara berjadwal dalam 320 km"); });
      R.innerHTML = '<div class="pw-ins"><div class="pw-bad">Tidak ada rute dalam jaringan data (maks 2 transit).</div>' + (why.length ? "<div>" + why.join("; ") + "</div>" : "") + "<div>Coba: hapus skenario bandara tutup, tambah rute kustom di tab ⚙️ Data, atau pilih bandara hub terdekat.</div></div>"; clearRoute(); return;
    }
    const ins = insights(LAST, LAST.from, LAST.to), it = LAST.items;
    const sum = '<div class="pw-mini" style="margin:2px 0">' + esc(label(LAST.from)) + " → " + esc(label(LAST.to)) + " · garis lurus " + fmtKm(hav(endPoint(LAST.from), endPoint(LAST.to))) + " · " + LAST.all + " kombinasi dianalisis</div>";
    R.innerHTML = sum + (ins.length ? '<div class="pw-ins">' + ins.map(s => "<div>💡 " + s + "</div>").join("") + "</div>" : "") + it.map((r, i) => {
      const seq = (r.gIn ? '<span class="g">🚗 ' + fmtKm(r.gIn.km) + "</span><i>›</i>" : "") + r.seq.map(c => "<span>" + c + "</span>").join("<i>✈</i>") + (r.gOut ? '<i>›</i><span class="g">🚗 ' + fmtKm(r.gOut.km) + "</span>" : "");
      const arr = r.sched && r.sched.legs.length ? " · tiba <b>" + localStr(r.sched.end, AIRS[r.seq[r.seq.length - 1]].tz) + "</b> " + TZN[AIRS[r.seq[r.seq.length - 1]].tz] + " (" + localDay(r.sched.end, AIRS[r.seq[r.seq.length - 1]].tz) + ")" : "";
      return '<div class="pw-card' + (i === SEL ? " on" : "") + '" data-pw="sel" data-a="' + i + '"><div>' + r.tags.map(t => '<span class="pw-tag">' + t + "</span>").join("") + (r.small ? '<span class="pw-tag" style="background:#78350f;color:#fde68a">⚠ perintis</span>' : "") + '</div><div class="pw-seq">' + seq + '</div><div class="pw-st"><span>⏱ <b>' + fmtDur(r.total) + "</b> pintu-ke-pintu</span><span>✈ " + fmtDur(r.fly) + "</span><span>🔁 " + (r.transits ? r.transits + " transit" : "langsung") + "</span><span>💳 ± <b>" + fmtRp(r.cost) + "</b>" + (S.pax > 1 ? " (" + S.pax + " org)" : "") + "</span><span>📏 " + fmtKm(r.dist) + "</span><span>🌿 " + Math.round(r.co2) + " kg CO₂</span></div>" + (arr ? '<div class="pw-mini">' + arr.slice(3) + "</div>" : "") + '<details class="pw-det" ' + (i === SEL ? "open" : "") + '><summary class="pw-mini" style="cursor:pointer;margin-top:4px">Rincian perjalanan</summary>' + legsHTML(r) + '<div class="pw-mini" style="margin-top:4px">Tarif = perkiraan kelas ekonomi (rentang wajar ' + fmtRp(r.fare * .75) + "–" + fmtRp(r.fare * 1.5) + "), bukan harga resmi. Termasuk proses bandara " + (r.proc) + " mnt.</div></details>" + (i === SEL ? '<div class="pw-row" style="margin-top:6px"><button class="pw-btn sm" data-pw="play" id="pqpwPlay">⏸</button><button class="pw-btn g sm" data-pw="fit">Zoom rute</button><button class="pw-btn g sm" data-pw="copy">Salin ringkasan</button></div>' : "") + "</div>";
    }).join("");
  }
  function summaryText(r) {
    const o = label(LAST.from), d = label(LAST.to); let s = "Rute " + o + " → " + d + "\n" + r.seq.join(" ✈ ") + (r.gIn ? " (darat awal " + fmtKm(r.gIn.km) + ")" : "") + (r.gOut ? " (darat akhir " + fmtKm(r.gOut.km) + ")" : "") + "\nTotal ±" + fmtDur(r.total) + " · " + (r.transits ? r.transits + " transit" : "langsung") + " · ± " + fmtRp(r.cost) + "\n";
    if (r.sched) r.sched.legs.forEach(L => { s += L.from + " " + localStr(L.dep, AIRS[L.from].tz) + " " + TZN[AIRS[L.from].tz] + " → " + L.to + " " + localStr(L.arr, AIRS[L.to].tz) + " " + TZN[AIRS[L.to].tz] + "\n"; });
    return s + "(estimasi PETAQU — cek jadwal & harga resmi maskapai)";
  }
  /* ---- Tab Bandara ---- */
  function tBandara() {
    const pl = ["Semua", "Sumatera", "Jawa", "Bali & Nusa Tenggara", "Kalimantan", "Sulawesi", "Maluku", "Papua"];
    return '<input id="pqpwQ" placeholder="Cari bandara, kota, provinsi, kode IATA/ICAO…" oninput="PETAQU_PESAWAT._f()"><div class="pw-chips" id="pqpwIs">' + pl.map(p => '<button data-pw="isl" data-a="' + p + '" class="' + ((S.isl || "Semua") === p ? "on" : "") + '">' + p + "</button>").join("") + '</div><div id="pqpwAL" style="display:flex;flex-direction:column;gap:6px"></div>';
  }
  function filterAirports() {
    const q = ($("pqpwQ") && $("pqpwQ").value || "").toLowerCase(), isl = S.isl || "Semua", L = $("pqpwAL"); if (!L) return;
    const rows = Object.keys(AIRS).map(c => AIRS[c]).filter(A => (isl === "Semua" || A.pulau === isl) && (!q || (A.c + " " + A.icao + " " + A.nama + " " + A.kota + " " + A.prov).toLowerCase().includes(q))).sort((a, b) => a.k - b.k || degree(b.c) - degree(a.c) || a.c.localeCompare(b.c));
    L.innerHTML = rows.length ? rows.slice(0, 120).map(A => { const n = degree(A.c); return '<div class="pw-it"><div class="h"><b>' + A.c + " · " + esc(A.nama) + "</b><span class='pw-tag'>" + (n ? n + " tujuan" : "tanpa jadwal") + "</span></div><div class='pw-mini'>" + esc(A.kota) + ", " + esc(A.prov) + " · ICAO " + esc(A.icao || "-") + " · " + TZN[A.tz] + " · " + KELAS[A.k] + (A.custom ? " · kustom" : "") + (isClosed(A.c) ? " · <span class='pw-bad'>DITUTUP</span>" : "") + '</div><div class="pw-row" style="margin-top:5px;flex-wrap:wrap"><button class="pw-btn sm" data-pw="from" data-a="' + A.c + '">Dari</button><button class="pw-btn sm" data-pw="to" data-a="' + A.c + '">Ke</button><button class="pw-btn g sm" data-pw="spider" data-a="' + A.c + '">Rute</button><button class="pw-btn g sm" data-pw="goto" data-a="' + A.c + '">Lihat</button><button class="pw-btn g sm" data-pw="close" data-a="' + A.c + '">' + (isClosed(A.c) ? "Buka lagi" : "Tutup (skenario)") + "</button></div></div>"; }).join("") : '<div class="pw-mini">Tidak ada hasil.</div>';
  }
  /* ---- Tab Terdekat ---- */
  function projectList() {
    const o = []; try { (typeof roads !== "undefined" ? roads : []).forEach((r, i) => { const p = r && r.points && r.points.length ? r.points[Math.floor(r.points.length / 2)] : null; if (p && isFinite(p.lat) && isFinite(p.lng)) o.push({ g: "Ruas jalan", n: r.name || r.id || "Ruas " + (i + 1), lat: +p.lat, lng: +p.lng }); }); } catch (e) { }
    try { (window.LOKASI_DATA || []).forEach(r => { if (isFinite(r.lat) && isFinite(r.lng)) o.push({ g: "AMP / BP / Quarry", n: (r.owner || "") + " — " + (r.kabupaten || ""), lat: +r.lat, lng: +r.lng }); }); } catch (e) { }
    return o;
  }
  function tDekat() {
    const pl = projectList(), gs = {}; pl.forEach((x, i) => (gs[x.g] = gs[x.g] || []).push([i, x]));
    return '<div class="pw-mini">Temukan bandara terdekat dari titik proyek, ruas, lokasi AMP/BP/Quarry, atau posisi Anda — lengkap dengan perkiraan jarak jalan & waktu tempuh.</div><div class="pw-chips" id="pqpwRefs">' + [["center", "🎯 Pusat peta"], ["gps", "📡 Lokasiku"], ["click", "📍 Klik di peta"]].map(x => '<button data-pw="ref" data-a="' + x[0] + '" class="' + (REFSRC.type === x[0] ? "on" : "") + '">' + x[1] + "</button>").join("") + "</div>" +
      (pl.length ? '<select id="pqpwProjSel" onchange="PETAQU_PESAWAT._pj(this.value)"><option value="">— pilih ruas / lokasi proyek (' + pl.length + ") —</option>" + Object.keys(gs).map(g => '<optgroup label="' + esc(g) + '">' + gs[g].map(a => '<option value="' + a[0] + '">' + esc(a[1].n) + "</option>").join("") + "</optgroup>").join("") + "</select>" : "") + '<div id="pqpwNear"></div>';
  }
  function setRef(lat, lng, lbl) { REF = { lat, lng, label: lbl }; showNearest(); }
  function showNearest() {
    const D = $("pqpwNear"); if (!D) return; if (!REF) { const m = gmap(); if (m) { const c = m.getCenter(); REF = { lat: c.lat, lng: c.lng, label: "Pusat peta" }; } else { D.innerHTML = '<div class="pw-mini">Peta belum siap.</div>'; return; } }
    const list = nearest(REF, 8); 
    D.innerHTML = '<div class="pw-mini" style="margin:4px 0">Acuan: <b>' + esc(REF.label) + "</b> (" + REF.lat.toFixed(4) + ", " + REF.lng.toFixed(4) + ')</div><div class="pw-row" style="margin-bottom:6px"><button class="pw-btn sm" data-pw="refFrom">Jadikan asal rute</button><button class="pw-btn g sm" data-pw="refTo">Jadikan tujuan</button></div>' + list.map((x, i) => { const A = x.A, km = x.d * ROAD_FACTOR, n = degree(A.c), brg = bearing(REF, A); return '<div class="pw-it"><div class="h"><b>' + (i + 1) + ". " + A.c + " · " + esc(A.nama) + "</b><span class='pw-tag'>" + (n ? n + " tujuan" : "tanpa jadwal") + "</span></div><div class='pw-mini'>" + esc(A.kota) + ", " + esc(A.prov) + " · " + KELAS[A.k] + "</div><div class='pw-st'><span>📏 lurus <b>" + fmtKm(x.d) + "</b> (" + compass(brg) + ")</span><span>🚗 jalan ± <b>" + fmtKm(km) + "</b></span><span>⏱ ± <b>" + fmtDur(GROUND_BASE_MIN + km / GROUND_KMH * 60) + "</b></span></div><div class='pw-row' style='margin-top:5px'><button class='pw-btn g sm' data-pw='from' data-a='" + A.c + "'>Dari</button><button class='pw-btn g sm' data-pw='to' data-a='" + A.c + "'>Ke</button><button class='pw-btn g sm' data-pw='goto' data-a='" + A.c + "'>Lihat</button></div></div>"; }).join("");
    drawRef(REF, list);
  }
  /* ---- Tab Jaringan ---- */
  function tJaringan() {
    const codes = Object.keys(AIRS), served0 = codes.filter(c => degree(c)), eds = [...EDGES.values()], hubs = served0.slice().sort((a, b) => degree(b) - degree(a)).slice(0, 10), mx = degree(hubs[0]) || 1;
    const longest = eds.slice().sort((a, b) => b.d - a.d).slice(0, 5), shortest = eds.slice().sort((a, b) => a.d - b.d).slice(0, 3), comps = components(), idle = codes.filter(c => !degree(c));
    const sub = comps.slice(1);
    return '<div class="pw-st" style="margin-top:0"><span>🛬 <b>' + codes.length + "</b> bandara</span><span>✈ <b>" + eds.length + "</b> rute langsung</span><span>🏝️ <b>" + new Set(codes.map(c => AIRS[c].pulau)).size + "</b> wilayah</span><span>🔗 rata-rata <b>" + (eds.length * 2 / (served0.length || 1)).toFixed(1) + "</b> tujuan/bandara</span></div>" +
      '<div class="pw-chips"><button data-pw="net" class="' + (S.net ? "on" : "") + '">🕸️ Tampilkan semua rute di peta</button><button data-pw="apts" class="' + (S.apts ? "on" : "") + '">📌 Tampilkan semua bandara</button></div><div class="pw-mini">Biru = jet · Oranye = baling-baling/perintis · Abu = tanpa jadwal</div>' +
      '<div class="pw-it"><b>Hub terbesar (jumlah tujuan langsung)</b>' + hubs.map(c => '<div class="pw-bw"><span>' + c + '</span><div class="pw-bar" style="width:' + Math.round(degree(c) / mx * 100) * .6 + '%"></div><em>' + degree(c) + "</em></div>").join("") + "</div>" +
      '<div class="pw-it"><b>Rute terjauh</b>' + longest.map(e => '<div class="pw-mini">' + e.a + " ↔ " + e.b + " · " + fmtKm(e.d) + " · " + fmtDur(e.t) + "</div>").join("") + "<b style='display:block;margin-top:6px'>Rute terpendek</b>" + shortest.map(e => '<div class="pw-mini">' + e.a + " ↔ " + e.b + " · " + fmtKm(e.d) + " · " + fmtDur(e.t) + "</div>").join("") + "</div>" +
      '<div class="pw-it"><b>Keterhubungan</b><div class="pw-mini">' + (sub.length ? '<span class="pw-warn">⚠ ' + sub.length + " klaster terpisah: " + sub.map(c => c.join("/")).join("; ") + "</span>" : '<span class="pw-ok">✔ Semua bandara berjadwal saling terhubung (via transit).</span>') + (idle.length ? "<br>Tanpa jadwal reguler dalam data: " + idle.map(c => c + " (" + esc(AIRS[c].kota) + ")").join(", ") + "." : "") + "</div></div>";
  }
  /* ---- Tab Data ---- */
  function tData() {
    const opts = Object.keys(AIRS).sort().map(c => '<option value="' + c + '">' + c + " — " + esc(AIRS[c].kota) + "</option>").join("");
    return '<div class="pw-it"><b>Skenario bandara tutup</b><div class="pw-mini">Simulasikan bandara tertutup (abu vulkanik, banjir, cuaca ekstrem). Pencarian rute akan menghindarinya.</div><div class="pw-row" style="margin-top:5px"><select id="pqpwCl"><option value="">Pilih bandara…</option>' + opts + '</select><button class="pw-btn sm s" data-pw="closeAdd">Tutup</button></div><div class="pw-chips" style="margin-top:5px">' + (S.closed.length ? S.closed.map(c => '<button data-pw="close" data-a="' + c + '" class="on">' + c + " ✕</button>").join("") : '<span class="pw-mini">Tidak ada.</span>') + "</div></div>" +
      '<div class="pw-it"><b>Tambah rute kustom</b><div class="pw-row" style="margin-top:5px"><select id="pqpwRa"><option value="">Asal…</option>' + opts + '</select><select id="pqpwRb"><option value="">Tujuan…</option>' + opts + '</select><button class="pw-btn sm s" data-pw="rtAdd">Tambah</button></div><div class="pw-chips" style="margin-top:5px">' + S.cRt.map((r, i) => '<button data-pw="rtDel" data-a="' + i + '" class="on">' + r[0] + "↔" + r[1] + " ✕</button>").join("") + '</div></div>' +
      '<div class="pw-it"><b>Tutup / nonaktifkan rute tertentu</b><div class="pw-row" style="margin-top:5px"><select id="pqpwBa"><option value="">Asal…</option>' + opts + '</select><select id="pqpwBb"><option value="">Tujuan…</option>' + opts + '</select><button class="pw-btn sm s" data-pw="blkAdd">Nonaktif</button></div><div class="pw-chips" style="margin-top:5px">' + S.blocked.map((k, i) => '<button data-pw="blkDel" data-a="' + i + '" class="on">' + k.replace("|", "↔") + " ✕</button>").join("") + "</div></div>" +
      '<div class="pw-it"><b>Tambah bandara kustom</b><div class="pw-row" style="margin-top:5px"><input id="pqpwNc" placeholder="IATA (3 huruf)" maxlength="3" style="text-transform:uppercase"><input id="pqpwNn" placeholder="Nama bandara"></div><div class="pw-row" style="margin-top:5px"><input id="pqpwNk" placeholder="Kota"><select id="pqpwNz"><option value="7">WIB</option><option value="8">WITA</option><option value="9">WIT</option></select><select id="pqpwNl"><option value="4">Kecil</option><option value="3">Sedang</option><option value="2">Besar</option></select></div><div class="pw-row" style="margin-top:5px"><button class="pw-btn g sm" data-pw="nCtr">Pakai pusat peta</button><button class="pw-btn sm" data-pw="nAdd">Simpan bandara</button></div><div class="pw-mini" id="pqpwNpos">Koordinat: pusat peta saat ini</div><div class="pw-chips" style="margin-top:5px">' + S.cAir.map((r, i) => '<button data-pw="aDel" data-a="' + i + '" class="on">' + r[0] + " ✕</button>").join("") + "</div></div>" +
      '<div class="pw-it"><b>Ekspor / impor</b><div class="pw-row" style="margin-top:5px;flex-wrap:wrap"><button class="pw-btn g sm" data-pw="expCsv">⬇ CSV rute</button><button class="pw-btn g sm" data-pw="expJson">⬇ JSON</button><button class="pw-btn g sm" data-pw="impJson">⬆ Impor JSON</button><button class="pw-btn g sm" data-pw="reset" style="border-color:#ef444488">Reset kustom</button></div><input type="file" id="pqpwFile" accept=".json,application/json" style="display:none"><div class="pw-mini" style="margin-top:5px">Data dasar ada di <b>data-bandara.js</b> (edit untuk memperbarui jaringan resmi). Tarif, durasi & jaringan bersifat indikatif.</div></div>';
  }
  function dl2(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function reload() { buildData(); if (S.net) setNet(true); if (S.apts) setApts(true); save(); }

  /* ---- aksi (delegasi klik) ---- */
  function pickOnMap(cb, msg) {
    const m = gmap(); if (!m) return say("Peta belum siap"); say(msg || "Klik titik di peta…", 5000); const c = m.getContainer(); c.style.cursor = "crosshair";
    m.once("click", e => { c.style.cursor = ""; cb(e.latlng.lat, e.latlng.lng); });
  }
  const ptLabel = (lat, lng, n) => "📍 " + (n || "Titik peta") + " (" + lat.toFixed(3) + ", " + lng.toFixed(3) + ")";
  function setEnd(which, E) { S[which] = E; save(); if (!P || P.style.display !== "flex") open(); const i = $(which === "from" ? "pqpwFrom" : "pqpwTo"); if (i) i.value = label(E); }
  document.addEventListener("click", e => {
    const el = e.target.closest && e.target.closest("[data-pw]"); if (!el) return; const a = el.dataset.a, act = el.dataset.pw;
    switch (act) {
      case "go": doSearch(); break;
      case "mode": S.mode = a; save(); [...el.parentNode.children].forEach(b => b.classList.toggle("on", b === el)); if (S.from && S.to) doSearch(); break;
      case "clear": clearRoute(); if (REF) { } break;
      case "swap": { const t = S.from; S.from = S.to; S.to = t; save(); render(); if (S.from && S.to) doSearch(); break; }
      case "quick": { const q = a.split(">"); S.from = { k: "apt", c: q[0] }; S.to = { k: "apt", c: q[1] }; save(); render(); doSearch(); break; }
      case "sel": { if (e.target.closest("button") || e.target.closest("summary")) break; const i = +a; if (i === SEL) break; SEL = i; showResults(); drawItin(LAST.items[i]); break; }
      case "play": toggleAnim(); break;
      case "fit": { const r = LAST && LAST.items[SEL]; if (r) drawItin(r); break; }
      case "copy": { const r = LAST && LAST.items[SEL]; if (r) { const t = summaryText(r); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => say("Ringkasan disalin"), () => { dl2("rute-pesawat.txt", t); say("Diunduh sebagai file"); }); } break; }
      case "ctr": { const m = gmap(); if (!m) return say("Peta belum siap"); const c = m.getCenter(); setEnd(a, { k: "pt", lat: c.lat, lng: c.lng, label: ptLabel(c.lat, c.lng, "Pusat peta"), tz: tzFor(c.lat, c.lng) }); say("Titik = pusat peta"); break; }
      case "pickpt": pickOnMap((lat, lng) => { setEnd(a, { k: "pt", lat, lng, label: ptLabel(lat, lng), tz: tzFor(lat, lng) }); open(); }); break;
      case "gps": if (!navigator.geolocation) return say("GPS tidak tersedia"); say("Mencari lokasi…"); navigator.geolocation.getCurrentPosition(p => { setEnd("from", { k: "pt", lat: p.coords.latitude, lng: p.coords.longitude, label: ptLabel(p.coords.latitude, p.coords.longitude, "Lokasi saya"), tz: tzFor(p.coords.latitude, p.coords.longitude) }); open(); say("Asal = lokasi Anda"); }, () => say("Izin lokasi ditolak/tidak tersedia"), { timeout: 8000 }); break;
      case "proj": S.tab = "dekat"; save(); open(); render(); break;
      case "from": case "to": { const E = { k: "apt", c: a }; setEnd(act, E); say((act === "from" ? "Asal" : "Tujuan") + " = " + a); const m = gmap(); if (m) m.closePopup(); if (S.from && S.to && S.tab === "rute") doSearch(); break; }
      case "spider": drawSpider(a); break;
      case "goto": { const m = gmap(), A = AIRS[a]; if (m && A) { m.flyTo(pt(A), 11, { duration: .8 }); } break; }
      case "close": { const i = S.closed.indexOf(a); if (i >= 0) S.closed.splice(i, 1); else S.closed.push(a); reload(); render(); break; }
      case "closeAdd": { const v = $("pqpwCl").value; if (v && S.closed.indexOf(v) < 0) { S.closed.push(v); reload(); render(); say(v + " ditutup (skenario)"); } break; }
      case "isl": S.isl = a; save(); [...el.parentNode.children].forEach(b => b.classList.toggle("on", b === el)); filterAirports(); break;
      case "ref": if (a === "center") { const m = gmap(); if (m) { const c = m.getCenter(); REFSRC = { type: "center" }; setRef(c.lat, c.lng, "Pusat peta"); } } else if (a === "gps") { if (!navigator.geolocation) return say("GPS tidak tersedia"); navigator.geolocation.getCurrentPosition(p => { REFSRC = { type: "gps" }; setRef(p.coords.latitude, p.coords.longitude, "Lokasi saya"); }, () => say("Izin lokasi ditolak")); } else pickOnMap((lat, lng) => { REFSRC = { type: "click" }; setRef(lat, lng, "Titik pilihan"); open(); }); [...el.parentNode.children].forEach(b => b.classList.toggle("on", b === el)); break;
      case "refFrom": case "refTo": { if (!REF) break; setEnd(act === "refFrom" ? "from" : "to", { k: "pt", lat: REF.lat, lng: REF.lng, label: ptLabel(REF.lat, REF.lng, REF.label), tz: tzFor(REF.lat, REF.lng) }); S.tab = "rute"; save(); render(); break; }
      case "net": setNet(!S.net); el.classList.toggle("on", S.net); break;
      case "apts": setApts(!S.apts); el.classList.toggle("on", S.apts); break;
      case "rtAdd": { const x = $("pqpwRa").value, y = $("pqpwRb").value; if (!x || !y || x === y) return say("Pilih dua bandara berbeda"); if (EDGES.has(ekey(x, y))) return say("Rute sudah ada"); S.cRt.push([x, y]); reload(); render(); say("Rute " + x + "↔" + y + " ditambahkan"); break; }
      case "rtDel": S.cRt.splice(+a, 1); reload(); render(); break;
      case "blkAdd": { const x = $("pqpwBa").value, y = $("pqpwBb").value; if (!x || !y || x === y) return say("Pilih dua bandara berbeda"); if (!EDGES.has(ekey(x, y))) return say("Rute itu tidak ada di jaringan"); const k = ekey(x, y); if (S.blocked.indexOf(k) < 0) S.blocked.push(k); reload(); render(); break; }
      case "blkDel": S.blocked.splice(+a, 1); reload(); render(); break;
      case "nCtr": { const m = gmap(); if (m) { const c = m.getCenter(); window.__pqpwNew = [c.lat, c.lng]; const d = $("pqpwNpos"); if (d) d.textContent = "Koordinat: " + c.lat.toFixed(4) + ", " + c.lng.toFixed(4); } break; }
      case "nAdd": { const c = ($("pqpwNc").value || "").toUpperCase().trim(), n = $("pqpwNn").value.trim(), k = $("pqpwNk").value.trim(); if (!/^[A-Z]{3}$/.test(c)) return say("Kode IATA harus 3 huruf"); if (AIRS[c]) return say("Kode sudah dipakai"); if (!n) return say("Isi nama bandara"); let pos = window.__pqpwNew; if (!pos) { const m = gmap(); if (!m) return say("Peta belum siap"); const q = m.getCenter(); pos = [q.lat, q.lng]; } S.cAir.push([c, "", n, k || n, "-", +pos[0].toFixed(5), +pos[1].toFixed(5), +$("pqpwNz").value, +$("pqpwNl").value]); window.__pqpwNew = null; reload(); render(); say("Bandara " + c + " ditambahkan — hubungkan lewat 'rute kustom'"); break; }
      case "aDel": { const r = S.cAir[+a]; if (r) { S.cRt = S.cRt.filter(x => x[0] !== r[0] && x[1] !== r[0]); S.cAir.splice(+a, 1); reload(); render(); } break; }
      case "expCsv": { let s = "asal,tujuan,jarak_km,durasi_menit,tarif_perkiraan_rp,jenis\n"; EDGES.forEach(e => { s += e.a + "," + e.b + "," + Math.round(e.d) + "," + e.t + "," + e.fare + "," + (e.prop ? "baling-baling" : "jet") + "\n"; }); dl2("rute-pesawat-petaqu.csv", s, "text/csv"); break; }
      case "expJson": dl2("rute-pesawat-petaqu.json", JSON.stringify({ versi: 1, bandara_kustom: S.cAir, rute_kustom: S.cRt, bandara_tutup: S.closed, rute_nonaktif: S.blocked }, null, 1), "application/json"); break;
      case "impJson": { const f = $("pqpwFile"); f.onchange = () => { const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(r.result); S.cAir = Array.isArray(o.bandara_kustom) ? o.bandara_kustom : S.cAir; S.cRt = Array.isArray(o.rute_kustom) ? o.rute_kustom : S.cRt; S.closed = Array.isArray(o.bandara_tutup) ? o.bandara_tutup : S.closed; S.blocked = Array.isArray(o.rute_nonaktif) ? o.rute_nonaktif : S.blocked; reload(); render(); say("Impor berhasil"); } catch (er) { say("File JSON tidak valid"); } }; r.readAsText(f.files[0]); }; f.click(); break; }
      case "reset": if (confirm("Hapus semua bandara/rute kustom dan skenario tutup?")) { S.cAir = []; S.cRt = []; S.closed = []; S.blocked = []; reload(); render(); } break;
    }
  });
  function tzFor(lat, lng) { return lng < 114.4 ? 7 : lng < 126.5 ? 8 : 9; }  // pendekatan batas WIB/WITA/WIT (Selat Bali ≈114,4°BT; Halmahera ≈126,5°BT)

  /* ---- init ---- */
  function init() {
    buildData();
    const b = document.createElement("button"); b.id = "pqpwBtn"; b.innerHTML = '<i class="fa-solid fa-plane-departure"></i>'; b.title = "Rute Pesawat Indonesia"; b.onclick = () => (P && P.style.display === "flex") ? (P.style.display = "none") : open();
    const put = () => { try { PQ_DOCK.adopt(b, "Rute Pesawat"); } catch (e) { b.style.cssText = "position:fixed;left:10px;bottom:300px;z-index:900"; document.body.append(b); } };
    typeof PQ_DOCK !== "undefined" ? put() : setTimeout(put, 1000);
    const wait = setInterval(() => { if (gmap() && window.L) { clearInterval(wait); ensureLayers(); if (S.net) setNet(true); if (S.apts) setApts(true); } }, 800); setTimeout(() => clearInterval(wait), 60000);
  }
  window.PETAQU_PESAWAT = {
    open, _plan: plan, _nearest: nearest, _airs: AIRS, _edges: EDGES, _adj: ADJ, _draw: drawItin, _spider: drawSpider, _components: components, _state: () => S, _insights: insights, _hav: hav, _rebuild: buildData, _tz: tzFor,
    _f: filterAirports, _pj: v => { const x = projectList()[+v]; if (x) { REFSRC = { type: "proj" }; setRef(x.lat, x.lng, x.n); } },
    _set: (o) => { Object.assign(S, o); buildData(); }
  };
  if (typeof document !== "undefined") document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
