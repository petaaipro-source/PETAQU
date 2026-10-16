/* PETAQU Kereta Api — jaringan, perlintasan & jenis kereta (modul mandiri, 1 tombol di dock).
   • Jaringan: jalur + stasiun bawaan (data-kereta.js) + muat jalur rinci & perlintasan resmi dari OSM (area peta).
   • Rute cerdas: stasiun ↔ stasiun / titik peta → stasiun terdekat; transit (penalti pindah jalur), waktu, tarif, jenis KA otomatis, animasi kereta.
   • Perlintasan cerdas: DETEKSI OTOMATIS titik potong ruas jalan proyek × jalur KA (sudut, STA, jenis jaga),
     skor risiko 0-100, jarak pandang segitiga, waktu pembersihan, jarak henti KA, rekomendasi (palang/underpass/flyover).
   • Jenis KA: kecepatan, rem, panjang rangkaian, tarif; kalkulator jarak henti & waktu peringatan.
   Semua angka INDIKATIF untuk pra-survei — verifikasi lapangan & ketentuan resmi (Kemenhub/DJKA/KAI). */
(function () {
  "use strict";
  if (window.__pqKereta) return; window.__pqKereta = 1;
  const KEY = "petaqu_kereta_v1", $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const gmap = () => { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } };
  const rad = x => x * Math.PI / 180, RF = 1.18, TRANSFER_MIN = 25, DWELL = 2;
  let S = { tab: "jaringan", on: true, auto: true, prov: "", fp: "", fk: [], q: "", jalur: true, stasiun: true, cross: true, osm: false, min: false, from: "", to: "", kerja: [], custom: [], ref: { vt: 100, trains: 0, aadt: 0, veh: "truk", tracks: 1, ctrl: "unknown", sight: 0, jenis: "eko" } };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ on: S.on, auto: S.auto, tab: S.tab, prov: S.prov, fp: S.fp, fk: S.fk, jalur: S.jalur, stasiun: S.stasiun, cross: S.cross, min: S.min, from: S.from, to: S.to, custom: S.custom, ref: S.ref })); } catch (e) { } };
  S.ref = Object.assign({ vt: 100, trains: 0, aadt: 0, veh: "truk", tracks: 1, ctrl: "unknown", sight: 0, jenis: "eko" }, S.ref || {});
  let P, G, GL, GS, GC, GR, GA, ST = {}, JL = [], ADJ = {}, OSMW = [], OSMC = [], XS = [], XSel = null, PLAN = null, anim = 0, osmBusy = false, clickMode = 0, TT = 0, TL = {}, TQ = [], LD = new Set(), FAIL = {}, tBusy = 0, MVT = 0, RDT = 0, SEENW = new Set(), SEENC = new Set(), WARNED = 0, BTN = null;
  const JN = () => window.KA_JENIS || {};
  const hav = (a, b, c, d) => { const x = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
  const fm = m => m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(1) + " km";
  const fmin = m => { m = Math.round(m); return m < 60 ? m + " mnt" : Math.floor(m / 60) + " j " + (m % 60 ? m % 60 + " mnt" : ""); };
  const rupiah = n => "Rp " + (Math.round(n / 1000) * 1000).toLocaleString("id-ID");
  const say = (t, ms) => { let d = $("pqkrToast"); if (!d) { d = document.createElement("div"); d.id = "pqkrToast"; document.body.appendChild(d); } d.textContent = t; d.style.display = "block"; clearTimeout(TT); TT = setTimeout(() => d.style.display = "none", ms || 2800); };

  /* ================= DATA ================= */
  function build() {
    ST = {}; JL = []; ADJ = {};
    (window.KA_STASIUN || []).forEach(a => ST[a[0]] = { k: a[0], n: a[1], city: a[2], prov: a[3], lat: a[4], lng: a[5], cls: a[6], lines: [] });
    (window.KA_JALUR || []).forEach(j => {
      const codes = j[4].split(/\s+/).filter(c => ST[c]); if (codes.length < 2) return;
      const pts = codes.map(c => [ST[c].lat, ST[c].lng]), jn = JN()[j[3]] || {};
      JL.push({ id: j[0], n: j[1], col: j[2], jenis: j[3], codes, pts, vavg: jn.vavg || 50 });
      codes.forEach(c => ST[c].lines.push(j[0]));
      for (let i = 0; i < codes.length - 1; i++) { const a = ST[codes[i]], b = ST[codes[i + 1]], km = hav(a.lat, a.lng, b.lat, b.lng) * RF; (ADJ[a.k] = ADJ[a.k] || []).push({ to: b.k, km, line: j[0] }); (ADJ[b.k] = ADJ[b.k] || []).push({ to: a.k, km, line: j[0] }); }
    });
  }
  const line = id => JL.find(j => j.id === id);
  /* Dijkstra pada state (stasiun, jalur) dengan penalti pindah jalur */
  function plan(a, b) {
    if (!ST[a] || !ST[b] || a === b) return null;
    const dist = {}, prev = {}, q = new Map(), key = (s, l) => s + "|" + l;
    JL.filter(l => l.codes.includes(a)).forEach(l => { dist[key(a, l.id)] = 0; q.set(key(a, l.id), 0); });
    let end = null;
    while (q.size) {
      let bk = null, bv = 1e18; q.forEach((v, k) => { if (v < bv) { bv = v; bk = k; } }); q.delete(bk);
      const [s, l] = bk.split("|"); if (s === b) { end = bk; break; }
      (ADJ[s] || []).forEach(e => {
        const ln = line(e.line), t = e.km / ln.vavg * 60 + DWELL + (e.line !== l ? TRANSFER_MIN : 0), nk = key(e.to, e.line), nd = bv + t;
        if (dist[nk] == null || nd < dist[nk]) { dist[nk] = nd; prev[nk] = { k: bk, km: e.km }; q.set(nk, nd); }
      });
    }
    if (!end) return null;
    const seq = []; let k = end; while (k) { const p = prev[k]; seq.unshift({ s: k.split("|")[0], l: k.split("|")[1], km: p ? p.km : 0 }); k = p && p.k; }
    const legs = []; seq.forEach((x, i) => { if (!i) return; const L = legs[legs.length - 1]; if (L && L.line === x.l) { L.to = x.s; L.km += x.km; L.path.push(x.s); } else legs.push({ line: x.l, from: seq[i - 1].s, to: x.s, km: x.km, path: [seq[i - 1].s, x.s] }); });
    let tm = 0, fare = 0, km = 0;
    legs.forEach((L, i) => { const ln = line(L.line), jn = JN()[ln.jenis] || {}; L.min = L.km / ln.vavg * 60 + DWELL * (L.path.length - 2); L.fare = jn.tarif ? Math.max(L.km * jn.tarif, ln.jenis === "krl" ? 3000 : 5000) : 0; tm += L.min + (i ? TRANSFER_MIN : 0); fare += L.fare; km += L.km; });
    return { legs, min: tm, fare, km, a, b };
  }
  function nearestSt(lat, lng, n) { return Object.values(ST).map(s => ({ s, d: hav(lat, lng, s.lat, s.lng) })).sort((x, y) => x.d - y.d).slice(0, n || 5); }

  /* ================= FILTER WILAYAH (provinsi / kab-kota) =================
     Tujuan: ringan. Jika provinsi/kab-kota dipilih, HANYA petak rel OSM yang beririsan dengan wilayah itu yang diunduh,
     dan hanya jalur/stasiun/perlintasan di dalam wilayah itu yang digambar. Batas wilayah: data-kabbatas.js (dimuat sekali, ±144 KB). */
  let REG = null, REGLD = 0, REGP = 0, BULK = null; const RTOL = .006;
  function dec(s) { let i = 0, la = 0, lo = 0, o = []; while (i < s.length) { let b, sh = 0, r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); la += r & 1 ? ~(r >> 1) : r >> 1; sh = 0; r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lo += r & 1 ? ~(r >> 1) : r >> 1; o.push([la / 1e5, lo / 1e5]); } return o; }
  function regLoad(cb) {
    if (window.PQ_KABBATAS) return cb(); if (REGLD) { setTimeout(() => regLoad(cb), 300); return; } REGLD = 1;
    const sc = document.createElement("script"); sc.src = "data-kabbatas.js"; sc.onload = () => { REGLD = 0; cb(); };
    sc.onerror = () => { REGLD = 0; S.fp = ""; S.fk = []; save(); say("Batas wilayah gagal dimuat — menampilkan semua wilayah.", 4000); cb(); }; document.head.appendChild(sc);
  }
  const sigOf = () => S.fp ? S.fp + "|" + (S.fk || []).slice().sort().join(";") : "";
  function buildReg() {
    REG = null; if (!S.fp || !window.PQ_KABBATAS) return;
    const D = window.PQ_KABBATAS[S.fp]; if (!D) { S.fp = ""; S.fk = []; save(); return; }
    const sel = (S.fk || []).length ? D.filter(k => S.fk.includes(k[0])) : D, rings = []; let s = 90, w = 180, n = -90, e = -180;
    sel.forEach(k => k[1].forEach(enc => { const pts = dec(enc); if (pts.length < 3) return; let a = 90, b = 180, c = -90, d = -180; pts.forEach(q => { if (q[0] < a) a = q[0]; if (q[0] > c) c = q[0]; if (q[1] < b) b = q[1]; if (q[1] > d) d = q[1]; }); rings.push({ pts, s: a, w: b, n: c, e: d }); s = Math.min(s, a); w = Math.min(w, b); n = Math.max(n, c); e = Math.max(e, d); }));
    if (!rings.length) { S.fp = ""; S.fk = []; save(); return; }
    REG = { sig: sigOf(), rings, s, w, n, e, tl: null };
  }
  function regReady() {
    if (!S.fp || REG) return true;
    if (!REGP) { REGP = 1; regLoad(() => { REGP = 0; buildReg(); drawNet(); autoLoad(); if (P && P.style.display === "flex") render(); }); }
    return false;
  }
  function pip(r, la, lo) { let ins = false; const p = r.pts; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if ((p[i][0] > la) !== (p[j][0] > la) && lo < (p[j][1] - p[i][1]) * (la - p[i][0]) / (p[j][0] - p[i][0]) + p[i][1]) ins = !ins; } return ins; }
  function inExact(la, lo) { if (la < REG.s || la > REG.n || lo < REG.w || lo > REG.e) return false; for (const r of REG.rings) { if (la < r.s || la > r.n || lo < r.w || lo > r.e) continue; if (pip(r, la, lo)) return true; } return false; }
  /* toleransi ±650 m: batas disederhanakan, rel/stasiun pesisir tidak boleh terpotong */
  function inReg(la, lo) { if (!REG) return true; if (la < REG.s - RTOL || la > REG.n + RTOL || lo < REG.w - RTOL || lo > REG.e + RTOL) return false; return inExact(la, lo) || inExact(la + RTOL, lo) || inExact(la - RTOL, lo) || inExact(la, lo + RTOL) || inExact(la, lo - RTOL); }
  function wayIn(w) { if (!REG) return true; if (w._s === REG.sig) return w._v; let v = false; const g = w.g, k = Math.max(1, Math.floor(g.length / 6)); for (let i = 0; i < g.length && !v; i += k) v = inReg(g[i][0], g[i][1]); if (!v) v = inReg(g[g.length - 1][0], g[g.length - 1][1]); w._s = REG.sig; w._v = v; return v; }
  const stIn = s => inReg(s.lat, s.lng);
  const curW = () => REG ? OSMW.filter(wayIn) : OSMW, curC = () => REG ? OSMC.filter(c => inReg(c.lat, c.lng)) : OSMC;
  function tileIn(t) {
    if (!REG) return true; if (t.s > REG.n || t.s + TS < REG.s || t.w > REG.e || t.w + TS < REG.w) return false;
    for (let i = 0; i <= 8; i++)for (let j = 0; j <= 8; j++) if (inReg(t.s + TS * i / 8, t.w + TS * j / 8)) return true;
    for (const r of REG.rings) { if (r.s > t.s + TS || r.n < t.s || r.w > t.w + TS || r.e < t.w) continue; for (const q of r.pts) if (q[0] >= t.s && q[0] <= t.s + TS && q[1] >= t.w && q[1] <= t.w + TS) return true; }
    return false;
  }
  function regTiles() { if (!REG) return []; if (REG.tl) return REG.tl; const out = []; for (let i = Math.floor(REG.s / TS); i <= Math.floor(REG.n / TS); i++)for (let j = Math.floor(REG.w / TS); j <= Math.floor(REG.e / TS); j++) { const t = { k: i + "_" + j, s: i * TS, w: j * TS }; if (tileIn(t)) out.push(t); } return (REG.tl = out); }
  function scopeName() { if (!S.fp) return "Semua wilayah (area peta)"; const k = S.fk || []; return S.fp + (k.length ? " › " + (k.length > 2 ? k.slice(0, 2).join(", ") + " +" + (k.length - 2) : k.join(", ")) : " (seluruh provinsi)"); }
  function dropBulk() { BULK = null; for (let i = TQ.length - 1; i >= 0; i--) if (TQ[i].bulk) TQ.splice(i, 1); }
  function regApply(fit) {
    dropBulk(); const go = () => {
      buildReg(); drawNet();
      if (fit && REG) { const m = gmap(); if (m) m.fitBounds([[REG.s, REG.w], [REG.n, REG.e]], { padding: [30, 30] }); }
      autoLoad(); if (P && P.style.display === "flex") render();
    }; S.fp ? regLoad(go) : go();
  }
  function setScope(p, ks, fit) { S.fp = p || ""; S.fk = p ? (ks || []) : []; save(); regApply(fit !== false); }
  /* muat SEMUA petak rel di wilayah terpilih (bukan hanya yang terlihat) — hasilnya tersimpan di perangkat (cache 30 hari) */
  function loadRegion() {
    if (!REG) { say("Pilih provinsi dulu."); return; } if (S.on === false) setOn(true);
    const need = regTiles().filter(t => !TL[t.k] && !LD.has(t.k)); if (!need.length) { say("Semua petak rel di wilayah ini sudah termuat.", 2500); return; }
    if (need.length > 40 && !confirm("Wilayah ini butuh " + need.length + " petak rel (cukup berat, hanya sekali — setelahnya tersimpan di perangkat). Lanjut?")) return;
    WARNED = 0; BULK = { total: need.length, done: 0 }; need.forEach(t => { FAIL[t.k] = 0; TQ.push(Object.assign({}, t, { bulk: 1, force: false })); });
    say("Memuat " + need.length + " petak rel wilayah terpilih…", 3000); pump(); if (P && P.style.display === "flex") render();
  }
  const kabNames = p => ((window.PQ_KABBATAS || {})[p] || []).map(k => k[0]).sort();
  function scopeCard() {
    const D = window.PQ_KABBATAS; let h = '<div class="kr-card"><b>📍 Wilayah tampil</b> <span class="kr-mini">— pilih agar peta ringan</span>';
    if (!D) return h + '<div class="kr-mini" style="margin-top:4px">Memuat daftar wilayah…</div></div>';
    const nSt = {}; Object.values(ST).forEach(x => { if (x.prov) nSt[x.prov] = (nSt[x.prov] || 0) + 1; });
    h += '<div class="kr-lab">Provinsi</div><select id="krSP"><option value="">Semua wilayah (area peta)</option>' + Object.keys(D).sort().map(n => '<option value="' + esc(n) + '"' + (n === S.fp ? " selected" : "") + ">" + esc(n) + (nSt[n] ? " — " + nSt[n] + " stasiun" : "") + "</option>").join("") + "</select>";
    if (S.fp && D[S.fp]) {
      const ks = kabNames(S.fp), fk = S.fk || [];
      h += '<div class="kr-lab">Kabupaten / Kota <span style="color:#fbbf24">(kosong = seluruh provinsi)</span></div><div class="kr-kab">' + ks.map(n => '<label class="kr-ck"><input type="checkbox" data-kk="' + esc(n) + '"' + (fk.includes(n) ? " checked" : "") + "> " + esc(n.replace(/^Kabupaten /, "Kab. ")) + "</label>").join("") + "</div>";
      const tl = REG ? regTiles() : [], ld = tl.filter(t => TL[t.k]).length, ns = REG ? Object.values(ST).filter(stIn).length : 0;
      h += '<div class="kr-mini" style="margin-top:4px">Menampilkan: <b>' + esc(scopeName()) + "</b>" + (REG ? " • " + ns + " stasiun • petak rel termuat " + ld + "/" + tl.length : "") + "</div>";
      if (BULK) h += '<div class="kr-mini" style="color:#fbbf24">⏳ Memuat rel wilayah: ' + BULK.done + "/" + BULK.total + "</div>";
      h += '<div class="kr-row" style="margin-top:5px"><button class="kr-btn g sm" data-kr="zreg">🔍 Zoom wilayah</button><button class="kr-btn sm" data-kr="lreg">⬇️ Muat rel wilayah ini</button></div><div class="kr-row" style="margin-top:4px"><button class="kr-btn g sm" data-kr="kall">Semua kab/kota</button><button class="kr-btn g sm" data-kr="sclr">✖ Semua wilayah</button></div>';
    } else h += '<div class="kr-mini" style="margin-top:4px">Tanpa filter: rel dimuat untuk seluruh area yang terlihat di peta (lebih berat). Pilih provinsi lalu kab./kota agar hanya wilayah itu yang diunduh &amp; digambar.</div>';
    return h + "</div>";
  }

  /* ================= PETA ================= */
  function ensure() { const m = gmap(); if (!m || !window.L) return false; if (G) return true; G = L.layerGroup(); GL = L.layerGroup(); GS = L.layerGroup(); GC = L.layerGroup(); GR = L.layerGroup(); GA = L.layerGroup(); return true; }
  const stIcon = s => L.divIcon({ className: "", html: '<div class="pqkr-st c' + s.cls + '"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
  function drawNet() {
    if (!ensure()) return; if (!regReady()) return; const m = gmap(); GL.clearLayers(); GS.clearLayers(); GC.clearLayers();
    drawLines();
    Object.values(ST).filter(stIn).forEach(s => GS.addLayer(L.marker([s.lat, s.lng], { icon: stIcon(s), title: s.n }).bindPopup('<b>🚉 ' + esc(s.n) + '</b><div style="color:#64748b;font-size:11.5px">' + esc(s.city + ", " + s.prov) + "<br>Jalur: " + esc(s.lines.map(l => line(l).n).join(", ")) + '</div><div class="pqkr-pb"><button onclick="PETAQU_KERETA.setPt(\'from\',\'' + s.k + '\')">Asal</button><button onclick="PETAQU_KERETA.setPt(\'to\',\'' + s.k + '\')">Tujuan</button></div>')));
    OSMC.forEach(c => { c.id = c.id || "osm" + c.lat.toFixed(5) + c.lng.toFixed(5); });
    syncVis(); drawX();
  }
  function syncVis() {
    if (!ensure()) return; const m = gmap(), on = S.on !== false;
    [[GL, on && S.jalur], [GS, on && S.stasiun], [GC, on && S.cross], [GR, on], [GA, on]].forEach(([g, v]) => v ? (!m.hasLayer(g) && g.addTo(m)) : (m.hasLayer(g) && m.removeLayer(g)));
    updBtn();
  }
  function updBtn() { if (!BTN) return; const on = S.on !== false; BTN.classList.toggle("on", on); BTN.classList.toggle("off", !on); BTN.title = "Jaringan Kereta Api: " + (on ? "NYALA (klik untuk matikan)" : "MATI (klik untuk nyalakan)"); BTN.setAttribute("aria-pressed", on ? "true" : "false"); }
  function setOn(v) { S.on = v == null ? !(S.on !== false) : !!v; save(); syncVis(); if (S.on) { if (!G) { build(); } drawNet(); autoLoad(); } say("🚆 Jaringan kereta api " + (S.on ? "DINYALAKAN" : "DIMATIKAN"), 1800); if (P && P.style.display === "flex") render(); }

  /* ---- gambar jalur: rel asli (OSM) + garis perkiraan HANYA di bagian yang belum ada rel aslinya ---- */
  function relPop(w) { const t = w.t || {}; return '<b>' + esc(t.name || "Jalur KA (OSM)") + '</b><br><span style="color:#64748b">' + esc([t.railway, t.usage, t.gauge ? "sepur " + t.gauge + " mm" : "", t.electrified && t.electrified !== "no" ? "listrik" : "", t.maxspeed ? t.maxspeed + " km/j" : "", t.tracks ? t.tracks + " jalur" : "", t.bridge ? "jembatan" : "", t.tunnel ? "terowongan" : ""].filter(Boolean).join(" • ")) + "</span>"; }
  const TS = .25, tkey = (la, lo) => Math.floor(la / TS) + "_" + Math.floor(lo / TS);
  function covered(a, b) {
    const A = ST[a], B = ST[b]; if (!A || !B) return false; const n = Math.max(2, Math.ceil(hav(A.lat, A.lng, B.lat, B.lng) / 3)); let any = false;
    for (let i = 0; i <= n; i++) { const f = i / n, r = TL[tkey(A.lat + (B.lat - A.lat) * f, A.lng + (B.lng - A.lng) * f)]; if (!r) return false; if (r.n > 0) any = true; }
    return any;
  }
  function drawLines() {
    if (!ensure()) return; GL.clearLayers();
    JL.forEach(j => {
      let run = []; const flush = () => { if (run.length > 1) GL.addLayer(L.polyline(run, { color: j.col, weight: 2, opacity: .55, dashArray: "7 7" }).bindPopup('<b>' + esc(j.n) + '</b><br><span style="color:#64748b">' + esc((JN()[j.jenis] || {}).n || "") + " • garis perkiraan antar-stasiun (rel asli belum dimuat)</span>")); run = []; };
      for (let i = 0; i < j.codes.length - 1; i++) { if (REG && !(inReg(j.pts[i][0], j.pts[i][1]) || inReg(j.pts[i + 1][0], j.pts[i + 1][1]))) { flush(); continue; } if (covered(j.codes[i], j.codes[i + 1])) flush(); else { if (!run.length) run.push(j.pts[i]); run.push(j.pts[i + 1]); } } flush();
    });
    const W = curW(), many = W.length > 2500, st = w => { const t = w.t || {}, br = t.bridge || t.tunnel, sub = /subway|light_rail|tram/.test(t.railway || ""), nar = t.railway === "narrow_gauge"; return { col: br ? "#94a3b8" : sub ? "#a78bfa" : nar ? "#84cc16" : "#f97316", wt: t.usage === "main" || t.usage === "branch" ? 3.6 : 2.6 }; };
    if (!many) W.forEach(w => { const s = st(w); GL.addLayer(L.polyline(w.g, { color: "#0f172a", weight: s.wt + 2.2, opacity: .6, interactive: false, lineJoin: "round" })); });
    W.forEach(w => { const s = st(w); GL.addLayer(L.polyline(w.g, { color: s.col, weight: s.wt, opacity: .97, lineJoin: "round", lineCap: "butt" }).bindPopup(() => relPop(w))); });
    W.forEach(w => { GL.addLayer(L.polyline(w.g, { color: "#fff", weight: 1.1, opacity: .85, dashArray: "2 7", interactive: false })); });
  }
  const soonDraw = () => { clearTimeout(RDT); RDT = setTimeout(() => { drawLines(); drawX(); if (P && P.style.display === "flex" && (S.tab === "jaringan" || S.tab === "perlintasan")) render(); }, 350); };

  /* ---- cache rel per petak (IndexedDB, 30 hari) ---- */
  const IDB = new Promise(res => { try { const r = indexedDB.open("petaqu_kereta_rel", 1); r.onupgradeneeded = () => r.result.createObjectStore("t"); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } });
  const idbGet = k => IDB.then(d => d ? new Promise(r => { try { const q = d.transaction("t").objectStore("t").get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); } catch (e) { r(null); } }) : null);
  const idbPut = (k, v) => IDB.then(d => { if (d) try { d.transaction("t", "readwrite").objectStore("t").put(v, k); } catch (e) { } });
  const idbDel = k => IDB.then(d => { if (d) try { d.transaction("t", "readwrite").objectStore("t").delete(k); } catch (e) { } });
  const TAGS = ["railway", "usage", "name", "bridge", "tunnel", "gauge", "electrified", "maxspeed", "tracks", "service"];
  const r5 = v => Math.round(v * 1e5) / 1e5;
  function applyTile(t, rec) {
    (rec.w || []).forEach(w => { if (SEENW.has(w.id)) return; SEENW.add(w.id); OSMW.push(w); });
    (rec.c || []).forEach(c => { if (SEENC.has(c.oid)) return; SEENC.add(c.oid); c.id = "osm" + c.lat.toFixed(5) + c.lng.toFixed(5); OSMC.push(c); });
    (rec.s || []).forEach(s => { if (!Object.values(ST).some(x => hav(x.lat, x.lng, s.lat, s.lng) < .35)) ST[s.k] = { k: s.k, n: s.n, city: "(OSM)", prov: "", lat: s.lat, lng: s.lng, cls: 3, lines: [] }; });
    TL[t.k] = { n: (rec.w || []).length };
  }
  async function fetchTile(t) {
    const bb = [t.s, t.w, t.s + TS, t.w + TS].map(v => v.toFixed(5)).join(",");
    const q = '[out:json][timeout:40];(way["railway"~"^(rail|light_rail|subway|narrow_gauge)$"]["service"!~"yard|siding|spur|crossover"](' + bb + ');node["railway"="level_crossing"](' + bb + ');node["railway"="station"]["station"!="subway"](' + bb + '););out geom tags;';
    let j = null;
    for (const u of OVP) { try { const c = new AbortController(), to = setTimeout(() => c.abort(), 38000), r = await fetch(u + "?data=" + encodeURIComponent(q), { signal: c.signal }); clearTimeout(to); if (!r.ok) continue; j = await r.json(); break; } catch (e) { } }
    if (!j) return null;
    const rec = { t: Date.now(), w: [], c: [], s: [] };
    (j.elements || []).forEach(e => { const tg = e.tags || {};
      if (e.type === "way" && e.geometry && e.geometry.length > 1) { const o = {}; TAGS.forEach(k => { if (tg[k] != null) o[k] = tg[k]; }); rec.w.push({ id: e.id, t: o, g: e.geometry.map(p => [r5(p.lat), r5(p.lon)]) }); }
      else if (e.type === "node" && tg.railway === "level_crossing") { const bar = tg["crossing:barrier"], ctrl = bar && bar !== "no" ? "gate" : tg.crossing === "barrier" || tg["crossing:light"] === "yes" ? "gate" : tg.crossing === "uncontrolled" || bar === "no" ? "nogate" : "unknown"; rec.c.push({ oid: e.id, lat: e.lat, lng: e.lon, ctrl, road: tg.name || "Perlintasan sebidang (OSM)", line: "", t: { crossing: tg.crossing, barrier: bar } }); }
      else if (e.type === "node" && tg.railway === "station" && tg.name) rec.s.push({ k: "O" + e.id, n: tg.name, lat: e.lat, lng: e.lon }); });
    return rec;
  }
  async function loadTile(t, force) {
    if (force) await idbDel(t.k);
    let rec = force ? null : await idbGet(t.k);
    if (rec && Date.now() - rec.t < 30 * 864e5) { applyTile(t, rec); return true; }
    rec = await fetchTile(t);
    if (!rec) { FAIL[t.k] = Date.now() + 90000; return false; }
    idbPut(t.k, rec); applyTile(t, rec); return true;
  }
  function viewTiles() {
    const m = gmap(), b = m.getBounds(), c = m.getCenter(), out = [];
    for (let i = Math.floor(b.getSouth() / TS); i <= Math.floor(b.getNorth() / TS); i++)for (let j = Math.floor(b.getWest() / TS); j <= Math.floor(b.getEast() / TS); j++) out.push({ k: i + "_" + j, s: i * TS, w: j * TS, d: Math.hypot((i + .5) * TS - c.lat, (j + .5) * TS - c.lng) });
    return out.filter(tileIn).sort((a, b) => a.d - b.d).slice(0, 12);
  }
  function setLoading(v) { if (BTN) BTN.classList.toggle("ld", !!v); }
  function autoLoad(force) {
    if (S.on === false || (!S.auto && !force) || !ensure()) return; if (!regReady()) return; const m = gmap(); if (m.getZoom() < (REG ? 9 : 10)) return;
    const need = viewTiles().filter(t => force || (!TL[t.k] && !LD.has(t.k) && !(FAIL[t.k] > Date.now())));
    for (let i = TQ.length - 1; i >= 0; i--) if (!TQ[i].bulk) TQ.splice(i, 1); need.forEach(t => TQ.push(Object.assign(t, { force: !!force }))); pump();
  }
  function pump() {
    while (tBusy < 2 && TQ.length) {
      const t = TQ.shift(); if (LD.has(t.k) || (TL[t.k] && !t.force)) continue; LD.add(t.k); tBusy++;
      loadTile(t, t.force).then(ok => { if (!ok && !WARNED) { WARNED = 1; say("Server OSM sibuk/offline — garis perkiraan tetap ditampilkan, akan dicoba lagi otomatis.", 4500); } soonDraw(); }).catch(() => { }).finally(() => { LD.delete(t.k); tBusy--; if (t.bulk && BULK) BULK.done++; if (!tBusy && !TQ.length) { if (BULK) { say("✅ Rel wilayah terpilih selesai dimuat (" + BULK.done + " petak).", 3500); BULK = null; } setLoading(false); soonDraw(); } pump(); });
    }
    setLoading(tBusy > 0 || TQ.length > 0);
  }
  const XC = { Rendah: "#34d399", Sedang: "#facc15", Tinggi: "#fb923c", Kritis: "#ef4444" };
  function drawX() {
    if (!GC) return; GC.clearLayers(); const all = allX();
    all.forEach(c => { const r = risk(c); GC.addLayer(L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "", html: '<div class="pqkr-x" style="background:' + XC[r.lv] + '">' + (c.ctrl === "bridge" || c.ctrl === "under" ? "≠" : "✕") + "</div>", iconSize: [20, 20], iconAnchor: [10, 10] }), zIndexOffset: 500 }).bindPopup(xPop(c, r)).on("click", () => { XSel = c.id; })); });
  }
  const CTRL = { gate: "Berpalang pintu", nogate: "Tanpa palang (tidak dijaga)", unknown: "Belum diketahui", bridge: "Flyover (tidak sebidang)", under: "Underpass (tidak sebidang)" };
  function xPop(c, r) { return '<b>⚠️ ' + esc(c.road || "Perlintasan") + '</b><div style="font-size:12px;color:#334155;margin:3px 0">' + esc(CTRL[c.ctrl] || c.ctrl) + (c.sta ? " • STA " + esc(c.sta) : "") + (c.line ? "<br>Jalur: " + esc(c.line) : "") + (c.angle ? " • sudut " + Math.round(c.angle) + "°" : "") + '<br>Risiko: <b style="color:' + XC[r.lv] + '">' + r.lv + " (" + r.score + ")</b></div>" + '<div class="pqkr-pb"><button onclick="PETAQU_KERETA.focusX(\'' + c.id + "')\">Analisis</button></div>"; }

  /* ================= PERLINTASAN ================= */
  const allX = () => XS.concat(OSMC.map(c => Object.assign({ src: "osm" }, c))).concat(S.custom.map(c => Object.assign({ src: "manual" }, c))).filter(c => inReg(c.lat, c.lng));
  const projXY = (lat, lng, la0) => [lng * 111.32 * Math.cos(rad(la0)) * 1000, lat * 110.57 * 1000];
  function segX(a, b, c, d) { const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null; const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; if (t < 0 || t > 1 || u < 0 || u > 1) return null; return { t, u }; }
  function railSegs() {
    const o = []; JL.forEach(j => { if (j.jenis === "mrt" || j.jenis === "cepat") return; for (let i = 0; i < j.pts.length - 1; i++) { if (REG && !(inReg(j.pts[i][0], j.pts[i][1]) || inReg(j.pts[i + 1][0], j.pts[i + 1][1]))) continue; o.push({ a: j.pts[i], b: j.pts[i + 1], l: j.n, jn: j.jenis, bd: 0 }); } });
    OSMW.forEach(w => { if (!wayIn(w)) return; for (let i = 0; i < w.g.length - 1; i++) o.push({ a: w.g[i], b: w.g[i + 1], l: w.t.name || "Jalur KA (OSM)", jn: /subway|light_rail/.test(w.t.railway) ? "mrt" : "eko", bd: w.t.bridge || w.t.tunnel ? 1 : 0, t: w.t }); });
    return o;
  }
  function detect() {
    const rd = (() => { try { return typeof roads !== "undefined" ? roads : []; } catch (e) { return []; } })(); XS = [];
    if (!rd.length) { say("Belum ada ruas jalan proyek di peta."); return 0; }
    const segs = railSegs(), grid = new Map(), CELL = .01, gk = (la, lo) => Math.floor(la / CELL) + "_" + Math.floor(lo / CELL);
    segs.forEach(sg => { const x0 = Math.floor(Math.min(sg.a[0], sg.b[0]) / CELL), x1 = Math.floor(Math.max(sg.a[0], sg.b[0]) / CELL), y0 = Math.floor(Math.min(sg.a[1], sg.b[1]) / CELL), y1 = Math.floor(Math.max(sg.a[1], sg.b[1]) / CELL); for (let x = x0; x <= x1; x++)for (let y = y0; y <= y1; y++) { const k = x + "_" + y; (grid.get(k) || grid.set(k, []).get(k)).push(sg); } });
    const seen = new Set();
    rd.forEach((r, ri) => { const pts = (r.points || []).filter(p => isFinite(p.lat) && isFinite(p.lng)); for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], cand = new Set(); const x0 = Math.floor(Math.min(p.lat, q.lat) / CELL), x1 = Math.floor(Math.max(p.lat, q.lat) / CELL), y0 = Math.floor(Math.min(p.lng, q.lng) / CELL), y1 = Math.floor(Math.max(p.lng, q.lng) / CELL);
      for (let x = x0; x <= x1; x++)for (let y = y0; y <= y1; y++)(grid.get(x + "_" + y) || []).forEach(s => cand.add(s));
      cand.forEach(sg => { const la0 = p.lat, A = projXY(p.lat, p.lng, la0), B = projXY(q.lat, q.lng, la0), C = projXY(sg.a[0], sg.a[1], la0), D = projXY(sg.b[0], sg.b[1], la0), h = segX(A, B, C, D); if (!h) return;
        const lat = p.lat + (q.lat - p.lat) * h.t, lng = p.lng + (q.lng - p.lng) * h.t, k = lat.toFixed(4) + "," + lng.toFixed(4); if (seen.has(k)) return; seen.add(k);
        const v1 = [B[0] - A[0], B[1] - A[1]], v2 = [D[0] - C[0], D[1] - C[1]], cs = Math.abs(v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1), ang = Math.acos(Math.min(1, cs)) * 180 / Math.PI;
        const o = OSMC.find(c => hav(c.lat, c.lng, lat, lng) < .03), jn = JN()[sg.jn] || {}; let ctrl = o ? o.ctrl : "unknown"; if (sg.bd) ctrl = "bridge";
        XS.push({ id: "px" + XS.length, src: "proyek", lat, lng, road: r.name || r.id || "Ruas " + (ri + 1), sta: pts[i].sta || "", line: sg.l, jn: sg.jn, ctrl, angle: ang, tracks: sg.t && +sg.t.tracks > 0 ? +sg.t.tracks : 0, vt: sg.t && parseInt(sg.t.maxspeed) > 0 ? parseInt(sg.t.maxspeed) : jn.vmax ? Math.min(jn.vmax, 100) : 80 });
      });
    } });
    XS.sort((a, b) => risk(b).score - risk(a).score); drawX(); return XS.length;
  }
  /* skor risiko + perhitungan keselamatan */
  function trainsDay(c) { const R = S.ref; if (c.trains > 0) return c.trains; if (R.trains > 0) return R.trains; return ({ krl: 220, mrt: 150, eks: 70, eko: 40, bandara: 60, lokal: 30, wisata: 6, barang: 15 })[c.jn] || 30; }
  function risk(c) {
    const R = S.ref, jn = JN()[c.jn || R.jenis] || JN().eko, vt = +c.vt || +R.vt || 80, trains = trainsDay(c), aadt = +c.aadt || +R.aadt || 3000, veh = c.veh || R.veh, tracks = +c.tracks || +R.tracks || 1;
    const L = veh === "truk" ? 12 : veh === "bus" ? 11 : 5, a = veh === "mobil" ? 2 : veh === "motor" ? 2.5 : 1, D = 4.5, W = 1.067 + (tracks - 1) * 5, tc = 2 + Math.sqrt(2 * (L + 2 * D + W) / a), dT = vt / 3.6 * tc, dStop = (vt / 3.6) ** 2 / (2 * (jn.rem || .8)) + vt / 3.6 * 3;
    const sight = +c.sight || +R.sight || 0, exp = trains * aadt, ctrl = c.ctrl || R.ctrl; let sc = 0; const tips = [];
    if (ctrl === "bridge" || ctrl === "under") return { score: 2, lv: "Rendah", tc, dT, dStop, exp, trains, aadt, vt, tips: ["Tidak sebidang — konflik langsung KA × lalu lintas dihilangkan. Pastikan clearance & drainase."], sightOk: true };
    sc += ctrl === "nogate" ? 38 : ctrl === "gate" ? 14 : 28; sc += Math.min(28, 28 * Math.log10(1 + exp / 1000) / 2); sc += Math.min(14, vt / 9); if (tracks > 1) sc += 5; if (c.angle && c.angle < 60) sc += 5;
    let sightOk = true; if (sight > 0 && sight < dT) { sightOk = false; sc += 6 + 12 * Math.min(1, (dT - sight) / dT); }
    if (veh === "truk" || veh === "bus") sc += 4; if (jn.pj > 400) sc += 4;
    sc = Math.min(100, Math.round(sc)); const lv = sc >= 75 ? "Kritis" : sc >= 55 ? "Tinggi" : sc >= 30 ? "Sedang" : "Rendah";
    if (ctrl === "nogate") tips.push("Tanpa palang: pasang palang pintu + sirene/lampu, atau tutup/alihkan lalu lintas.");
    if (exp > 50000) tips.push("Eksposur (KA/hari × LHR) ≈ " + Math.round(exp / 1000) + " rb — melampaui ambang indikatif ±50 rb → pertimbangkan flyover/underpass.");
    if (!sightOk) tips.push("Jarak pandang tersedia " + Math.round(sight) + " m < kebutuhan " + Math.round(dT) + " m → bersihkan vegetasi/bangunan di segitiga pandang atau pasang rambu/pembatas kecepatan.");
    if (c.angle && c.angle < 60) tips.push("Persilangan miring (" + Math.round(c.angle) + "°): luruskan mendekati 90° bila memungkinkan.");
    if (jn.pj > 400) tips.push("KA barang panjang → perlintasan tertutup lama; sediakan jalur alternatif.");
    if (tracks > 1) tips.push("Jalur ganda: ada risiko KA kedua (“second train coming”) — beri rambu & peringatan tambahan.");
    if (!tips.length) tips.push("Pertahankan perawatan palang, marka, dan rambu; lakukan inspeksi berkala.");
    return { score: sc, lv, tc, dT, dStop, exp, trains, aadt, vt, tips, sightOk };
  }

  /* ================= OSM ================= */
  const OVP = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
  function loadOSM() { const m = gmap(); if (!m) return; if (!regReady()) return; const mz = REG ? 9 : 10; if (m.getZoom() < mz) { say("Perbesar peta (zoom ≥ " + mz + ") agar rel asli bisa dimuat" + (REG ? ", atau tekan “Muat rel wilayah ini”." : "."), 3800); return; } if (S.on === false) setOn(true); WARNED = 0; say("Menyegarkan rel asli area ini…", 2500); autoLoad(true); }

  /* ================= RUTE ================= */
  function drawPlan(p) {
    if (!ensure()) return; GR.clearLayers(); GA.clearLayers(); clearInterval(anim); if (!p) return; const all = [];
    p.legs.forEach(L => { const ln = line(L.line), pts = L.path.map(c => [ST[c].lat, ST[c].lng]); all.push(...pts); GR.addLayer(L_pl(pts, ln.col)); });
    const m = gmap(); m.fitBounds(L.latLngBounds(all), { padding: [60, 60], maxZoom: 11 });
    const cum = [0]; for (let i = 1; i < all.length; i++)cum.push(cum[i - 1] + hav(all[i - 1][0], all[i - 1][1], all[i][0], all[i][1])); const tot = cum[cum.length - 1] || 1;
    const mk = L.marker(all[0], { icon: L.divIcon({ className: "", html: '<div class="pqkr-tr">🚆</div>', iconSize: [28, 28], iconAnchor: [14, 14] }), interactive: false, zIndexOffset: 900 }).addTo(GA); let d = 0;
    anim = setInterval(() => { d += tot / 260; if (d > tot) d = 0; let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), a = all[i - 1], b = all[i]; mk.setLatLng([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }, 60);
  }
  const L_pl = (pts, col) => L.polyline(pts, { color: col, weight: 7, opacity: .85, lineCap: "round" });
  function doPlan() {
    if (!S.from || !S.to) { say("Pilih stasiun asal & tujuan."); return; } PLAN = plan(S.from, S.to); if (!PLAN) say("Rute tidak ditemukan pada jaringan bawaan."); drawPlan(PLAN); save(); render();
  }
  function planHTML() {
    if (!PLAN) return S.from && S.to ? '<div class="kr-mini">Tekan “Cari rute”.</div>' : "";
    const p = PLAN, legs = p.legs.map(L => { const ln = line(L.line), jn = JN()[ln.jenis] || {}; return '<div class="kr-leg"><span class="kr-dot" style="background:' + ln.col + '"></span><div><b>' + esc(ST[L.from].n) + " → " + esc(ST[L.to].n) + '</b><div class="kr-mini">' + (jn.ic || "🚆") + " " + esc(jn.n || "") + " • " + esc(ln.n) + " • " + L.km.toFixed(0) + " km • " + fmin(L.min) + (L.fare ? " • ±" + rupiah(L.fare) : "") + "</div></div></div>"; }).join('<div class="kr-xfer">⇄ pindah jalur ±' + TRANSFER_MIN + " mnt</div>");
    const first = (JN()[line(p.legs[0].line).jenis] || {}), co2 = p.km * .035;
    return '<div class="kr-ins"><b>' + esc(ST[p.a].n) + " → " + esc(ST[p.b].n) + '</b><div class="kr-st"><span>⏱ <b>' + fmin(p.min) + "</b></span><span>📏 <b>" + p.km.toFixed(0) + ' km</b></span><span>💳 <b>' + (p.fare ? "±" + rupiah(p.fare) : "—") + "</b></span><span>🔁 <b>" + (p.legs.length - 1) + ' transit</b></span><span>🌱 CO₂ ±<b>' + co2.toFixed(1) + " kg</b>/penumpang</span></div></div>" + legs + '<div class="kr-mini" style="margin-top:6px">Rekomendasi: ' + (p.km > 300 ? "pilih Eksekutif bila ingin cepat, Ekonomi bila hemat" : p.km < 60 ? "KRL/lokal paling praktis" : "KA antarkota reguler") + ". Waktu & tarif indikatif, bukan jadwal resmi.</div>";
  }

  /* ================= UI ================= */
  function css() {
    if ($("pqkrCss")) return; const s = document.createElement("style"); s.id = "pqkrCss";
    s.textContent = "#pqkrPanel{position:fixed;right:10px;top:70px;z-index:1311;width:min(470px,calc(100vw - 20px));max-height:calc(100vh - 90px);display:none;flex-direction:column;background:#0b0f1af7;color:#dbe7f3;border:1px solid #94b2cc40;border-radius:14px;font:13px/1.45 system-ui,sans-serif;box-shadow:0 14px 40px #0009;backdrop-filter:blur(10px);overflow:hidden}#pqkrPanel.min .kr-tabs,#pqkrPanel.min #pqkrBody{display:none}#pqkrPanel header{display:flex;align-items:center;gap:8px;padding:11px 14px 6px}#pqkrPanel header b{flex:1;font-size:14px}#pqkrPanel header small{display:block;color:#8fa6bd;font-weight:400;font-size:11px}#pqkrPanel .x{background:0;border:0;color:#8fa6bd;font-size:20px;cursor:pointer;line-height:1}" +
      ".kr-tabs{display:flex;gap:4px;padding:0 10px 8px;overflow-x:auto;flex:none}.kr-tabs button{flex:none;padding:6px 10px;border-radius:999px;border:1px solid #94b2cc33;background:#111a2b;color:#cbd5e1;font:600 12px system-ui;cursor:pointer}.kr-tabs button.on{background:#dc2626;border-color:#fca5a5;color:#fff}#pqkrBody{overflow:auto;padding:0 12px 14px;display:flex;flex-direction:column;gap:8px}" +
      "#pqkrPanel input,#pqkrPanel select{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid #94b2cc40;background:#111a2b;color:#e6f1fb;font:inherit;outline:0;min-width:0}.kr-row{display:flex;gap:6px;align-items:center}.kr-row>*{flex:1}.kr-row>.s{flex:none}.kr-lab{font-size:11px;color:#8fa6bd;margin:2px 0 -3px}.kr-btn{padding:7px 11px;border-radius:9px;border:1px solid #fca5a566;background:#b91c1c;color:#fff;font:600 12.5px system-ui;cursor:pointer;flex:none}.kr-btn.g{background:#111a2b;border-color:#94b2cc40;color:#cbd5e1}.kr-btn.sm{padding:4px 8px;font-size:11.5px}.kr-btn:hover{filter:brightness(1.15)}" +
      ".kr-chips{display:flex;flex-wrap:wrap;gap:5px}.kr-chips button{padding:4px 9px;border-radius:999px;border:1px solid #94b2cc33;background:#111a2b;color:#cbd5e1;font:600 11.5px system-ui;cursor:pointer}.kr-chips button.on{background:#dc2626;border-color:#fca5a5;color:#fff}.kr-card{border:1px solid #94b2cc2e;border-radius:11px;background:#0f172a;padding:9px 10px}.kr-mini{color:#8fa6bd;font-size:11.5px}.kr-ins{border:1px solid #fca5a533;background:#2a1215;border-radius:10px;padding:8px 10px}.kr-st{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;margin-top:4px}.kr-leg{display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-top:1px dashed #94b2cc26}.kr-dot{width:10px;height:10px;border-radius:50%;margin-top:5px;flex:none}.kr-xfer{color:#fbbf24;font-size:11px;margin-left:18px}" +
      ".kr-sc{display:inline-block;min-width:32px;text-align:center;padding:1px 7px;border-radius:999px;font:700 11.5px system-ui;color:#0b0f1a}.kr-tip{font-size:12px;margin:3px 0;color:#cfe6f3}.kr-sw{display:inline-block;width:18px;height:4px;border-radius:2px;vertical-align:middle;margin-right:5px}.kr-item{cursor:pointer}.kr-item:hover{border-color:#fca5a5}.kr-bar{height:6px;border-radius:4px;background:#ef4444;min-width:3px}" +
      "#pqkrToast{position:fixed;left:50%;transform:translateX(-50%);bottom:80px;z-index:5000;display:none;background:#b91c1c;color:#fff;padding:8px 14px;border-radius:999px;font:600 12.5px system-ui;box-shadow:0 6px 20px #0007;max-width:90vw;text-align:center}" +
      "#pqkrOnOff{position:relative}#pqkrOnOff.on{color:#fb923c}#pqkrOnOff.off{opacity:.55}#pqkrOnOff.off::after{content:\"\";position:absolute;left:18%;right:18%;top:50%;height:2px;background:#ef4444;transform:rotate(-45deg);border-radius:2px;pointer-events:none}#pqkrOnOff.ld i{animation:pqkrp 1s ease-in-out infinite}@keyframes pqkrp{50%{opacity:.25}}.pqkr-st{width:11px;height:11px;border-radius:50%;background:#fff;border:3px solid #1e293b;box-shadow:0 0 0 1px #fff}.pqkr-st.c1{width:15px;height:15px;border-color:#dc2626}.pqkr-st.c2{border-color:#2563eb}.pqkr-x{width:20px;height:20px;border-radius:50%;border:2px solid #fff;color:#111;font:800 12px/16px system-ui;text-align:center;box-shadow:0 2px 6px #0009}.pqkr-tr{font-size:22px;filter:drop-shadow(0 2px 3px #000a)}.pqkr-pb{display:flex;gap:5px;margin-top:6px}.pqkr-pb button{padding:4px 8px;border-radius:7px;border:1px solid #b91c1c;background:#b91c1c;color:#fff;font:600 11.5px system-ui;cursor:pointer}";
    s.textContent += "#pqkrPanel input[type=checkbox]{width:auto;padding:0;flex:none;accent-color:#dc2626}.kr-kab{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;max-height:150px;overflow:auto;margin-top:5px;padding:6px;border:1px solid #94b2cc2e;border-radius:9px;background:#0b1424}.kr-ck{display:flex;align-items:center;gap:5px;font-size:11.5px;color:#cbd5e1;cursor:pointer;min-width:0}";
    document.head.appendChild(s);
  }
  const TABS = [["jaringan", "🕸️ Jaringan"], ["wilayah", "🗺️ Wilayah"], ["rute", "🧭 Rute"], ["perlintasan", "⚠️ Perlintasan"], ["jenis", "🚄 Jenis KA"], ["hitung", "🧮 Kalkulator"]];
  function mount() {
    css(); P = document.createElement("div"); P.id = "pqkrPanel";
    P.innerHTML = '<header><span style="font-size:20px">🚆</span><b>Kereta Api Indonesia<small>Jaringan • perlintasan cerdas • jenis KA</small></b><button class="x" id="pqkrMin" aria-label="Ciutkan">▾</button><button class="x" id="pqkrX" aria-label="Tutup">×</button></header><div class="kr-tabs" id="pqkrTabs"></div><div id="pqkrBody"></div>';
    document.body.appendChild(P); $("pqkrX").onclick = () => P.style.display = "none";
    const mn = $("pqkrMin"), sm = v => { P.classList.toggle("min", v); mn.textContent = v ? "▴" : "▾"; S.min = v; save(); }; mn.onclick = () => sm(!P.classList.contains("min")); if (S.min) sm(true);
    $("pqkrTabs").innerHTML = TABS.map(t => '<button data-t="' + t[0] + '">' + t[1] + "</button>").join("");
    $("pqkrTabs").onclick = e => { const t = e.target.closest("button"); if (t) { S.tab = t.dataset.t; save(); render(); } };
    P.addEventListener("click", onClick); P.addEventListener("change", onChange);
  }
  function open() { if (!P) mount(); if (!G) { build(); drawNet(); } P.style.display = "flex"; render(); if (!window.PQ_KABBATAS) regLoad(() => { if (P && P.style.display === "flex") render(); }); }
  function render() {
    [...$("pqkrTabs").children].forEach(b => b.classList.toggle("on", b.dataset.t === S.tab));
    const B = $("pqkrBody"), top = B.scrollTop, kb0 = B.querySelector(".kr-kab"), kt = kb0 ? kb0.scrollTop : 0; B.innerHTML = ({ jaringan: tNet, wilayah: tWil, rute: tRute, perlintasan: tX, jenis: tJenis, hitung: tCalc }[S.tab] || tNet)(); if (S.tab === "perlintasan" || S.tab === "jaringan") B.scrollTop = top; const kb1 = B.querySelector(".kr-kab"); if (kb1) kb1.scrollTop = kt;
  }
  const chip = (k, lab, on) => '<button data-kr="tg" data-k="' + k + '" class="' + (on ? "on" : "") + '">' + lab + "</button>";
  function tNet() {
    const sub = {}; JL.forEach(j => sub[j.jenis] = (sub[j.jenis] || 0) + 1);
    return scopeCard() + '<div class="kr-mini">Rel asli (OSM) dimuat OTOMATIS mengikuti area peta (zoom ≥ 10) dan disimpan di perangkat. Garis putus-putus = perkiraan antar-stasiun, hanya tampil di bagian yang rel aslinya belum termuat. (' + Object.keys(ST).length + " stasiun, " + JL.length + ' jalur)</div><div class="kr-chips">' + chip("on", "⏻ Jaringan KA", S.on !== false) + chip("auto", "🔄 Rel asli otomatis", S.auto) + chip("jalur", "🛤️ Jalur", S.jalur) + chip("stasiun", "🚉 Stasiun", S.stasiun) + chip("cross", "⚠️ Perlintasan", S.cross) + '</div><div class="kr-row"><button class="kr-btn" data-kr="osm">' + (osmBusy ? "Memuat…" : "⬇️ Segarkan rel asli area ini") + '</button></div><div class="kr-mini">Rel asli termuat: ' + curW().length + " segmen jalur • " + curC().length + " perlintasan sebidang" + (REG ? " (di wilayah terpilih)" : "") + (OSMW.length ? ' • <a href="#" data-kr="clrosm" style="color:#fca5a5">bersihkan</a>' : "") + '</div><div class="kr-card"><b>Legenda jalur</b>' + JL.map(j => '<div class="kr-mini" style="margin-top:3px"><span class="kr-sw" style="background:' + j.col + '"></span>' + esc(j.n) + "</div>").join("") + "</div>";
  }

  /* ===== Tab Wilayah: Provinsi → Kab./Kota → stasiun & jalur ===== */
  function tWil() {
    const all = Object.values(ST), provs = {}; all.forEach(s => (provs[s.prov] = provs[s.prov] || []).push(s));
    const names = Object.keys(provs).sort(), q = (S.q || "").toLowerCase();
    let h = '<div class="kr-mini">' + all.length + " stasiun di " + names.length + " provinsi. Belum ada jalur KA penumpang di dataset ini: Aceh, Kalimantan, Sulawesi, Bali, NTB/NTT, Maluku, Papua (sebagian belum beroperasi / belum dimasukkan).</div>";
    h += '<input id="krQ" placeholder="Cari stasiun / kab. / kota…" value="' + esc(S.q || "") + '" style="width:100%;margin:6px 0;padding:7px;border-radius:8px;border:1px solid #94b2cc33;background:#0b1424;color:#e2e8f0"/>';
    h += '<div class="kr-chips">' + chip("pv", "Semua", !S.prov).replace('data-kr="tg" data-k="pv"', 'data-kr="pv" data-p=""') + names.map(n => '<button data-kr="pv" data-p="' + esc(n) + '" class="' + (S.prov === n ? "on" : "") + '">' + esc(n) + " (" + provs[n].length + ")</button>").join("") + "</div>";
    const pick = S.prov ? [S.prov] : names;
    pick.forEach(pn => {
      let arr = provs[pn]; if (q) arr = arr.filter(s => (s.n + " " + s.city + " " + pn).toLowerCase().includes(q)); if (!arr.length) return;
      const kab = {}; arr.forEach(s => (kab[s.city] = kab[s.city] || []).push(s));
      const jl = new Set(); arr.forEach(s => s.lines.forEach(l => jl.add(l)));
      h += '<div class="kr-card"><b>' + esc(pn) + '</b> <span class="kr-mini">' + arr.length + " stasiun • " + Object.keys(kab).length + " kab./kota • " + jl.size + ' jalur</span> <a href="#" data-kr="zp" data-p="' + esc(pn) + '" style="color:#7dd3fc;font-size:11px">🔍 zoom</a> <a href="#" data-kr="sp" data-p="' + esc(pn) + '" style="color:#fca5a5;font-size:11px">🎯 batasi peta</a>';
      Object.keys(kab).sort().forEach(c => {
        h += '<div style="margin-top:5px"><span class="kr-mini" style="color:#fbbf24">' + esc(c) + "</span>" + kab[c].map(s => '<div class="kr-mini" style="margin-left:8px"><a href="#" data-kr="zs" data-id="' + s.k + '" style="color:#e2e8f0">🚉 ' + esc(s.n) + "</a> — " + s.lines.map(l => '<span class="kr-sw" style="background:' + line(l).col + ';display:inline-block;width:8px;height:8px;border-radius:50%" title="' + esc(line(l).n) + '"></span>').join(" ") + "</div>").join("") + "</div>";
      });
      h += "</div>";
    });
    return h;
  }
  function stOpts(sel) { const arr = Object.values(ST).sort((a, b) => a.n.localeCompare(b.n)); return '<option value="">— pilih stasiun —</option>' + arr.map(s => '<option value="' + s.k + '"' + (s.k === sel ? " selected" : "") + ">" + esc(s.n + " (" + s.city + ")") + "</option>").join(""); }
  function tRute() {
    return '<div class="kr-lab">Asal</div><select id="krFrom">' + stOpts(S.from) + '</select><div class="kr-lab">Tujuan</div><select id="krTo">' + stOpts(S.to) + '</select><div class="kr-row"><button class="kr-btn" data-kr="plan">Cari rute</button><button class="kr-btn g" data-kr="swap">⇅ Tukar</button><button class="kr-btn g" data-kr="near">📍 Stasiun terdekat dari pusat peta</button></div><div id="krNear"></div>' + planHTML();
  }
  function tJenis() {
    return '<div class="kr-mini">Jenis kereta & karakteristik operasional (indikatif). Panjang rangkaian & rem menentukan keselamatan perlintasan.</div>' + Object.entries(JN()).map(([k, j]) => '<div class="kr-card"><b>' + j.ic + " " + esc(j.n) + '</b> <span class="kr-mini">• ' + esc(j.kat) + '</span><div class="kr-st"><span>⚡ maks <b>' + j.vmax + '</b> km/j</span><span>⏱ rata-rata <b>' + j.vavg + '</b></span><span>🧱 rangkaian <b>±' + j.pj + ' m</b></span><span>🛑 jarak henti darurat <b>≈' + Math.round(((j.vmax > 120 ? 120 : j.vmax) / 3.6) ** 2 / (2 * j.rem) + (Math.min(j.vmax, 120) / 3.6) * 3) + ' m</b> @' + Math.min(j.vmax, 120) + (j.tarif ? ' km/j</span><span>💳 ±<b>Rp ' + j.tarif.toLocaleString("id-ID") + "</b>/km" : " km/j") + '</span></div><div class="kr-mini" style="margin-top:3px">' + esc(j.ket) + '</div><div class="kr-mini">Jalur: ' + (JL.filter(l => l.jenis === k).map(l => esc(l.n)).join(" • ") || "—") + "</div></div>").join("");
  }
  const sel = (id, v, opts) => '<select id="' + id + '">' + opts.map(o => '<option value="' + o[0] + '"' + (String(o[0]) === String(v) ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select>";
  const jenisOpts = () => Object.entries(JN()).map(([k, j]) => [k, j.ic + " " + j.n]);
  function tCalc() {
    const R = S.ref, r = risk({ jn: R.jenis, ctrl: R.ctrl }), jn = JN()[R.jenis] || {};
    return '<div class="kr-mini">Kalkulator keselamatan perlintasan sebidang (model segitiga pandang AASHTO disederhanakan). Parameter ini juga jadi default untuk semua perlintasan yang tidak punya data sendiri.</div><div class="kr-row"><div><div class="kr-lab">Jenis KA</div>' + sel("krJ", R.jenis, jenisOpts()) + '</div><div><div class="kr-lab">Kec. KA (km/j)</div><input id="krVt" type="number" value="' + R.vt + '"></div></div><div class="kr-row"><div><div class="kr-lab">KA per hari (0=asumsi)</div><input id="krTr" type="number" value="' + R.trains + '"></div><div><div class="kr-lab">LHR jalan (kend/hari)</div><input id="krAd" type="number" value="' + R.aadt + '"></div></div><div class="kr-row"><div><div class="kr-lab">Kendaraan kritis</div>' + sel("krV", R.veh, [["truk", "Truk (12 m)"], ["bus", "Bus (11 m)"], ["mobil", "Mobil (5 m)"], ["motor", "Motor"]]) + '</div><div><div class="kr-lab">Jumlah jalur rel</div>' + sel("krTk", R.tracks, [[1, "1 (tunggal)"], [2, "2 (ganda)"], [3, "3"]]) + '</div></div><div class="kr-row"><div><div class="kr-lab">Pengamanan</div>' + sel("krC", R.ctrl, [["unknown", "Belum diketahui"], ["nogate", "Tanpa palang"], ["gate", "Berpalang pintu"], ["bridge", "Flyover"], ["under", "Underpass"]]) + '</div><div><div class="kr-lab">Jarak pandang tersedia (m, 0=?)</div><input id="krSg" type="number" value="' + R.sight + '"></div></div>' +
      '<div class="kr-ins"><div class="kr-st"><span>Skor <span class="kr-sc" style="background:' + XC[r.lv] + '">' + r.score + "</span> <b>" + r.lv + "</b></span><span>Waktu kendaraan melintas <b>" + r.tc.toFixed(1) + " dtk</b></span><span>Jarak pandang KA dibutuhkan <b>" + Math.round(r.dT) + " m</b></span><span>Jarak henti KA <b>" + Math.round(r.dStop) + " m</b></span><span>Eksposur <b>" + Math.round(r.exp).toLocaleString("id-ID") + "</b></span></div>" + r.tips.map(t => '<div class="kr-tip">• ' + esc(t) + "</div>").join("") + '</div><div class="kr-mini">Waktu peringatan palang disarankan ≥ ' + Math.ceil(r.tc + 5) + " dtk sebelum KA tiba (waktu lintas + 5 dtk cadangan). " + (jn.pj ? "Rangkaian ±" + jn.pj + " m memblokir perlintasan ±" + Math.round((jn.pj + 10) / (r.vt / 3.6)) + " dtk pada " + r.vt + " km/j." : "") + "</div>";
  }
  function tX() {
    const all = allX().map(c => ({ c, r: risk(c) })).sort((a, b) => b.r.score - a.r.score), cnt = { Kritis: 0, Tinggi: 0, Sedang: 0, Rendah: 0 }; all.forEach(x => cnt[x.r.lv]++);
    const mx = Math.max(1, ...Object.values(cnt));
    const sum = all.length ? Object.entries(cnt).map(([k, v]) => '<div class="kr-row" style="gap:6px"><span style="width:52px;flex:none;font-size:11.5px">' + k + '</span><div class="kr-bar" style="flex:none;width:' + Math.round(v / mx * 160 + 3) + "px;background:" + XC[k] + '"></div><em class="kr-mini" style="flex:none;font-style:normal">' + v + "</em></div>").join("") : '<div class="kr-mini">Belum ada perlintasan. Tekan “Deteksi dari ruas proyek” (butuh jalur: gunakan jaringan bawaan atau muat OSM dulu agar presisi), atau tambah manual.</div>';
    return '<div class="kr-row"><button class="kr-btn" data-kr="detect">🔎 Deteksi dari ruas proyek</button><button class="kr-btn g" data-kr="addx">➕ Tambah (klik peta)</button></div><div class="kr-row"><button class="kr-btn g sm" data-kr="osm">⬇️ Muat OSM area ini</button><button class="kr-btn g sm" data-kr="expx">⬇️ CSV</button></div><div class="kr-card"><b>Ringkasan risiko (' + all.length + ')</b>' + sum + "</div>" +
      all.slice(0, 40).map(({ c, r }) => '<div class="kr-card kr-item" data-kr="fx" data-id="' + c.id + '"><div class="kr-row"><b style="flex:1">' + esc(c.road || "Perlintasan") + '</b><span class="kr-sc" style="background:' + XC[r.lv] + ';flex:none">' + r.score + '</span></div><div class="kr-mini">' + esc(CTRL[c.ctrl] || c.ctrl) + (c.line ? " • " + esc(c.line) : "") + (c.sta ? " • STA " + esc(c.sta) : "") + " • " + ({ proyek: "proyek", osm: "OSM", manual: "manual" }[c.src]) + "</div>" + (XSel === c.id ? '<div style="margin-top:5px">' + r.tips.map(t => '<div class="kr-tip">• ' + esc(t) + "</div>").join("") + '<div class="kr-mini">KA ±' + Math.round(r.trains) + "/hari • " + Math.round(r.vt) + " km/j • butuh pandang " + Math.round(r.dT) + " m • henti KA " + Math.round(r.dStop) + " m</div>" + (c.src === "manual" ? '<button class="kr-btn g sm" data-kr="delx" data-id="' + c.id + '">Hapus</button>' : "") + "</div>" : "") + "</div>").join("") + (all.length > 40 ? '<div class="kr-mini">+' + (all.length - 40) + " lainnya (diurut risiko) — lihat peta/CSV.</div>" : "");
  }
  function onChange(e) {
    const t = e.target, R = S.ref;
    if (t.id === "krSP") { setScope(t.value, [], true); return; } if (t.dataset && t.dataset.kk != null) { const n = t.dataset.kk, fk = (S.fk || []).slice(), i = fk.indexOf(n); if (t.checked && i < 0) fk.push(n); if (!t.checked && i >= 0) fk.splice(i, 1); setScope(S.fp, fk, true); return; } if (t.id === "krQ") { S.q = t.value; save(); const B = $("pqkrBody"); render(); const i = $("krQ"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } else if (t.id === "krFrom") { S.from = t.value; save(); } else if (t.id === "krTo") { S.to = t.value; save(); }
    else if (/^kr(J|Vt|Tr|Ad|V|Tk|C|Sg)$/.test(t.id)) { const v = t.value; ({ krJ: () => { R.jenis = v; R.vt = Math.min(+(JN()[v] || {}).vmax || 100, 120) || R.vt; }, krVt: () => R.vt = +v || 80, krTr: () => R.trains = +v || 0, krAd: () => R.aadt = +v || 0, krV: () => R.veh = v, krTk: () => R.tracks = +v, krC: () => R.ctrl = v, krSg: () => R.sight = +v || 0 })[t.id](); save(); drawX(); render(); }
  }
  function onClick(e) {
    const a = e.target.closest("[data-kr]"); if (!a) return; e.preventDefault(); const k = a.dataset.kr;
    if (k === "tg") { const kk = a.dataset.k; if (kk === "on") { setOn(); return; } S[kk] = !S[kk]; save(); syncVis(); if (kk === "auto" && S.auto) autoLoad(); render(); }
    else if (k === "pv") { S.prov = a.dataset.p || ""; save(); render(); }
    else if (k === "zp") { const m = gmap(); const ar = Object.values(ST).filter(s => s.prov === a.dataset.p); if (m && ar.length) m.fitBounds(ar.map(s => [s.lat, s.lng]), { padding: [40, 40], maxZoom: 11 }); }
    else if (k === "zs") { const s = ST[a.dataset.id], m = gmap(); if (m && s) m.setView([s.lat, s.lng], 15); }
    else if (k === "sp") { setScope(a.dataset.p, [], true); say("🎯 Peta dibatasi ke " + a.dataset.p + " — rel hanya dimuat di provinsi ini.", 3200); }
    else if (k === "zreg") { const m = gmap(); if (m && REG) m.fitBounds([[REG.s, REG.w], [REG.n, REG.e]], { padding: [30, 30] }); }
    else if (k === "lreg") loadRegion();
    else if (k === "kall") setScope(S.fp, [], true);
    else if (k === "sclr") setScope("", [], false);
    else if (k === "osm") loadOSM();
    else if (k === "clrosm") { OSMW = []; OSMC = []; S.osm = false; TL = {}; FAIL = {}; SEENW = new Set(); SEENC = new Set(); IDB.then(d => { if (d) try { d.transaction("t", "readwrite").objectStore("t").clear(); } catch (e) { } }); drawNet(); autoLoad(); render(); }
    else if (k === "plan") doPlan();
    else if (k === "swap") { const t = S.from; S.from = S.to; S.to = t; PLAN = null; render(); }
    else if (k === "near") { const m = gmap(); if (!m) return; const c = m.getCenter(); $("krNear").innerHTML = nearestSt(c.lat, c.lng, 5).map(x => '<div class="kr-card" style="margin-top:5px"><b>🚉 ' + esc(x.s.n) + '</b> <span class="kr-mini">' + x.d.toFixed(1) + " km (≈" + fmin(x.d * 1.35 / 35 * 60) + ' via jalan)</span><div class="kr-row" style="margin-top:4px"><button class="kr-btn g sm" data-kr="pickfrom" data-id="' + x.s.k + '">Asal</button><button class="kr-btn g sm" data-kr="pickto" data-id="' + x.s.k + '">Tujuan</button></div></div>').join(""); }
    else if (k === "pickfrom") { S.from = a.dataset.id; save(); render(); } else if (k === "pickto") { S.to = a.dataset.id; save(); render(); }
    else if (k === "detect") { const n = detect(); render(); if (n) say(n + " perlintasan terdeteksi dari ruas proyek.", 3500); else if (gmap && (typeof roads !== "undefined" ? roads : []).length) say("Tidak ada ruas yang memotong jalur. Muat OSM untuk jalur yang lebih rinci.", 4200); }
    else if (k === "addx") { clickMode = 1; say("Klik lokasi perlintasan di peta…", 5000); gmap().once("click", ev => { if (!clickMode) return; clickMode = 0; const id = "mx" + Date.now(); S.custom.push({ id, lat: ev.latlng.lat, lng: ev.latlng.lng, road: "Perlintasan manual " + (S.custom.length + 1), ctrl: "unknown", jn: S.ref.jenis }); save(); XSel = id; drawX(); render(); }); }
    else if (k === "fx") { XSel = XSel === a.dataset.id ? null : a.dataset.id; focusX(a.dataset.id, true); render(); }
    else if (k === "delx") { S.custom = S.custom.filter(c => c.id !== a.dataset.id); XSel = null; save(); drawX(); render(); }
    else if (k === "expx") { const rows = [["id", "sumber", "ruas/nama", "lat", "lng", "STA", "jalur_KA", "pengamanan", "sudut", "KA_per_hari", "kec_KA", "skor", "level", "pandang_butuh_m", "henti_KA_m"]]; allX().forEach(c => { const r = risk(c); rows.push([c.id, c.src, c.road, c.lat.toFixed(6), c.lng.toFixed(6), c.sta || "", c.line || "", CTRL[c.ctrl] || c.ctrl, c.angle ? Math.round(c.angle) : "", Math.round(r.trains), Math.round(r.vt), r.score, r.lv, Math.round(r.dT), Math.round(r.dStop)]); }); const blob = new Blob(["﻿" + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(",")).join("\n")], { type: "text/csv" }), l = document.createElement("a"); l.href = URL.createObjectURL(blob); l.download = "perlintasan-kereta-petaqu.csv"; document.body.appendChild(l); l.click(); l.remove(); }
  }
  function focusX(id, noRender) { const c = allX().find(x => x.id === id); if (!c) return; XSel = id; const m = gmap(); if (m) m.setView([c.lat, c.lng], Math.max(m.getZoom(), 16)); S.tab = "perlintasan"; if (!noRender && P) render(); }
  function setPt(w, k) { S[w] = k; save(); S.tab = "rute"; open(); render(); }

  function init() {
    build(); css();
    const tg = document.createElement("button"); tg.id = "pqkrOnOff"; tg.innerHTML = '<i class="fa-solid fa-train-tram"></i>'; BTN = tg; updBtn(); tg.onclick = () => setOn();
    const putT = () => { try { PQ_DOCK.adopt(tg, "KA On/Off"); } catch (e) { tg.style.cssText = "position:fixed;left:10px;bottom:300px;z-index:900"; document.body.append(tg); } };
    typeof PQ_DOCK !== "undefined" ? putT() : setTimeout(putT, 1000);
    const b = document.createElement("button"); b.id = "pqkrBtn"; b.innerHTML = '<i class="fa-solid fa-train"></i>'; b.title = "Kereta Api: jaringan, perlintasan & jenis KA"; b.onclick = () => (P && P.style.display === "flex") ? (P.style.display = "none") : open();
    const put = () => { try { PQ_DOCK.adopt(b, "Kereta Api"); } catch (e) { b.style.cssText = "position:fixed;left:10px;bottom:350px;z-index:900"; document.body.append(b); } };
    typeof PQ_DOCK !== "undefined" ? put() : setTimeout(put, 1000);
    const wait = setInterval(() => { if (gmap() && window.L) { clearInterval(wait); drawNet(); const mm = gmap(); mm.on("moveend", () => { clearTimeout(MVT); MVT = setTimeout(autoLoad, 700); }); autoLoad(); } }, 800); setTimeout(() => clearInterval(wait), 60000);
  }
  window.PETAQU_KERETA = { open, toggle: setOn, refresh: () => autoLoad(true), setPt, focusX, _plan: plan, _risk: risk, _detect: detect, _st: () => ST, _jl: () => JL, _build: build, _osm: (w, c) => { OSMW = w || []; OSMC = c || []; }, setScope, loadRegion, _reg: { S, card: scopeCard, build: buildReg, inReg, tileIn, wayIn, tiles: regTiles, get REG() { return REG; } } };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
