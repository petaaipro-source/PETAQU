/* PETAQU Blok Warna Wilayah — warnai wilayah MANA PUN (provinsi, kab/kota, kecamatan, desa/kelurahan) dengan warna sendiri.
   Sumber: (1) data batas lokal provinsi & kab/kota (offline, instan), (2) OpenStreetMap/Nominatim untuk kecamatan, desa & lainnya,
   (3) file GeoJSON sendiri, (4) ketuk peta -> wilayah di titik itu. Banyak wilayah sekaligus, tiap wilayah punya warna/transparansi/label sendiri. */
(function () {
  "use strict";
  const KEY = "petaqu_blok_v1", $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const PAL = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#d946ef", "#ec4899"];
  const NOM = "https://nominatim.openstreetmap.org/";
  let focus = true, offIds = [], items = [], DLG = null, K = null, loading = false, top = true, pi = 0, found = [], picking = null, mini = false, uid = 0;
  try { const o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o) { items = o.items || []; top = o.top !== false; focus = o.focus !== false; items.forEach(i => { uid = Math.max(uid, +i.id || 0); }); pi = items.length; } } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ top, focus, items: items.map(i => { const c = Object.assign({}, i); delete c._g; delete c._l; delete c._mp; delete c._cd; delete c._bb; return c; }) })); } catch (e) { toast("Memori browser penuh — hapus beberapa wilayah online"); } };
  /* Mode fokus: saat ada blok warna aktif, lapisan lain (Kabupaten, Jalan Nasional+label ruas, Tol, Patok KM) dimatikan; dipulihkan saat blok dimatikan */
  const FL = [["kbBtn", "kbPanel"], ["jnBtn", "jnPanel"], ["tlBtn", "tlPanel"], ["pkBtn", "pkPanel"]];
  function applyFocus() {
    const act = items.some(i => i.on);
    FL.forEach(f => { const b = $(f[0]); if (!b) return; const isOff = b.classList.contains("off"), mine = offIds.indexOf(f[0]) >= 0;
      if (focus && act && !isOff) { b.click(); offIds.push(f[0]); setTimeout(() => { const pn = $(f[1]); pn && pn.classList.remove("open"); }, 60); }
      else if ((!focus || !act) && mine) { if (isOff) { b.click(); setTimeout(() => { const pn = $(f[1]); pn && pn.classList.remove("open"); }, 60); } offIds = offIds.filter(x => x !== f[0]); } });
  }
  /* `map` di index.html dideklarasikan dengan `let` (bukan var) sehingga TIDAK ada di window.map — akses lewat nama global langsung */
  const gmap = () => { try { return typeof map !== "undefined" && map ? map : window.map; } catch (e) { return window.map; } };
  const ready = () => { const m = gmap(); return !!(m && m.getPane && window.L); };
  function toast(m, ms) { let t = $("pqbT"); if (!t) { t = document.createElement("div"); t.id = "pqbT"; document.body.appendChild(t); } t.textContent = m; t.className = "on"; clearTimeout(t._t); if (ms !== 0) t._t = setTimeout(() => t.className = "", ms || 3200); }
  function dec(s) { let i = 0, la = 0, lo = 0, o = []; while (i < s.length) { let b, sh = 0, r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); la += r & 1 ? ~(r >> 1) : r >> 1; sh = 0; r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lo += r & 1 ? ~(r >> 1) : r >> 1; o.push([la / 1e5, lo / 1e5]); } return o; }
  function data(cb) {
    if (window.PQ_KABBATAS) return cb();
    if (loading) return setTimeout(() => data(cb), 300); loading = true;
    const s = document.createElement("script"); s.src = "data-kabbatas.js"; s.onload = () => { loading = false; cb(); }; s.onerror = () => { loading = false; toast("Data batas lokal gagal dimuat"); }; document.head.appendChild(s);
  }
  function kabs() { if (K) return K; K = []; const D = window.PQ_KABBATAS || {}; for (const p in D) D[p].forEach(k => K.push({ p, n: k[0], enc: k[1], mp: null })); return K; }
  const mpK = k => k.mp || (k.mp = k.enc.map(dec).map(r => [r]));
  const norm = s => String(s || "").toLowerCase().replace(/\b(kabupaten|kab\.?|kota adm\.?|kota|provinsi|prov\.?|kecamatan|kec\.?|desa|kelurahan|kel\.?)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  /* ---------- geometri ---------- */
  function fromGeo(g) {
    if (!g) return null; const sw = ring => ring.map(c => [c[1], c[0]]);
    if (g.type === "Polygon") return [g.coordinates.map(sw)];
    if (g.type === "MultiPolygon") return g.coordinates.map(p => p.map(sw));
    if (g.type === "GeometryCollection") { let o = []; g.geometries.forEach(x => { const m = fromGeo(x); if (m) o = o.concat(m); }); return o.length ? o : null; }
    return null;
  }
  function ringArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += (b[1] - a[1]) * Math.PI / 180 * (2 + Math.sin(a[0] * Math.PI / 180) + Math.sin(b[0] * Math.PI / 180)); } return Math.abs(s * 6371.0088 * 6371.0088 / 2); }
  const areaMP = mp => mp.reduce((t, p) => t + p.reduce((a, r, i) => a + (i ? -ringArea(r) : ringArea(r)), 0), 0);
  function inRing(la, lo, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > lo) !== (b[1] > lo) && la < (b[0] - a[0]) * (lo - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  const inMP = (la, lo, mp) => mp.some(p => inRing(la, lo, p[0]) && !p.slice(1).some(h => inRing(la, lo, h)));
  function mpOf(it) {
    if (it._mp) return it._mp;
    if (it.kind === "O") return it._mp = fromGeo(it.geom);
    const D = window.PQ_KABBATAS; if (!D) return null; const ks = kabs();
    if (it.kind === "P") { let o = []; ks.forEach(k => { if (k.p === it.p) o = o.concat(mpK(k)); }); return it._mp = o.length ? o : null; }
    const k = ks.filter(x => x.p === it.p && x.n === it.n)[0]; return it._mp = k ? mpK(k) : null;
  }
  /* ---------- render di peta ---------- */
  /* Blok di z=380: di atas peta dasar (200), warna kabupaten (260) & masker (250); di bawah semua lapisan jalan/pin/label PETAQU (385+). */
  function zBase() { return 380; }
  function fixRoads() { }
  /* Satu pane (=satu kanvas) dipakai bersama semua wilayah dengan transparansi sama (kelipatan 5%) — jauh lebih ringan untuk puluhan provinsi */
  function paneOf(it) { const b = Math.max(5, Math.min(95, Math.round(it.op * 20) * 5)), n = "pqbo_" + b; let p = map.getPane(n); if (!p) { p = map.createPane(n, map.getPane("overlayPane").parentNode); p.style.pointerEvents = "none"; p.style.zIndex = zBase(); p.style.opacity = b / 100; } return n; }
  function labelPane() { let p = map.getPane("pqbL"); if (!p) { p = map.createPane("pqbL"); p.style.zIndex = 660; p.style.pointerEvents = "none"; } return "pqbL"; }
  function center(mp) { let best = null, ba = -1; mp.forEach(p => { const a = ringArea(p[0]); if (a > ba) { ba = a; best = p[0]; } }); let a = 1e9, b = -1e9, c = 1e9, d = -1e9; best.forEach(q => { a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); }); return [(a + b) / 2, (c + d) / 2]; }
  function short(n) { return String(n).replace(/^Kabupaten /, "Kab. ").replace(/^Kota Administrasi /, "Kota ").replace(/^Provinsi /, ""); }
  function polysOf(it) { if (it.kind === "P") { if (!window.PQ_KABBATAS) return []; return kabs().filter(k => k.p === it.p).map(mpK); } const mp = mpOf(it); return mp ? [mp] : []; }
  function draw(it) {
    if (!ready()) return;
    if (it._g) { map.removeLayer(it._g); it._g = null; } if (it._l) { map.removeLayer(it._l); it._l = null; }
    if (!it.on) return; const polys = polysOf(it); if (!polys.length) return;
    const o = { pane: paneOf(it), interactive: false, color: it.color, weight: it.line, opacity: 1, fillColor: it.color, fillOpacity: 1, smoothFactor: 1.5, lineJoin: "round" };
    it._g = L.featureGroup(polys.map(m => L.polygon(m, o))).addTo(map);
    const mp = mpOf(it);
    if (it.label && mp) { const c = cands(it)[0] || center(mp); it._l = L.marker(c, { pane: labelPane(), interactive: false, keyboard: false, icon: L.divIcon({ className: "pqb-lb pqb-hid", html: "<span>" + esc(short(it.n)) + "</span>", iconSize: [0, 0] }) }).addTo(map); }
    bindEv(); sched(120);
  }
  function moveOp(it) { if (!it._g) return; const n = paneOf(it); it._g.eachLayer(l => { if (l.options.pane !== n) { map.removeLayer(l); l.options.pane = n; l.addTo(map); } }); }
  function redraw() { items.forEach(it => { if (it._g || ready()) draw(it); }); }
  const bbL = bb => [[bb[0], bb[1]], [bb[2], bb[3]]];
  function zoomTo(it) { const bb = getBB(it); if (!bb || !ready()) return; try { map.fitBounds(bbL(bb), { padding: [40, 40], maxZoom: 15 }); } catch (e) { } }
  function restore() {
    if (!ready()) return setTimeout(restore, 500);
    const needLocal = items.some(i => i.kind !== "O");
    const go = () => { redraw(); list(); badge(); setTimeout(applyFocus, 900); };
    needLocal ? data(go) : go();
  }
/* ---------- otomatis & cerdas ---------- */
  const gm = () => gmap();
  function isSat() { try { const im = document.querySelector(".leaflet-tile-pane img.leaflet-tile"); return !!(im && /arcgis|google|satellite|imagery|mt[0-3]\.google/i.test(im.src)); } catch (e) { return true; } }
  const defOp = () => isSat() ? .45 : .38;
  function hue(hex) { const n = parseInt(String(hex).replace("#", ""), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; }
  const hd = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  function getBB(it) { if (it._bb) return it._bb; const mp = mpOf(it); if (!mp) return null; let a = 1e9, b = -1e9, c = 1e9, d = -1e9; mp.forEach(p => p[0].forEach(q => { a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); })); return it._bb = [a, c, b, d]; }
  const touch = (a, b, m) => { m = m == null ? .06 : m; return a[0] - m < b[2] && a[2] + m > b[0] && a[1] - m < b[3] && a[3] + m > b[1]; };
  /* warna otomatis: beda mencolok dari tetangga yang bersinggungan, dan tetap beda dari semua wilayah lain */
  function pickColor(it, others) {
    others = (others || items.filter(x => x !== it)).filter(x => x.color); const bb = getBB(it), nb = bb ? others.filter(o => { const ob = getBB(o); return ob && touch(bb, ob); }) : [];
    let best = PAL[0], bs = -1e9;
    PAL.forEach(c => { const h = hue(c), dn = nb.length ? Math.min.apply(null, nb.map(o => hd(h, hue(o.color)))) : 180, da = others.length ? Math.min.apply(null, others.map(o => hd(h, hue(o.color)))) : 180, sc = dn * 3 + da - (others.some(o => o.color === c) ? 200 : 0); if (sc > bs) { bs = sc; best = c; } });
    return best;
  }
  function autoColors() {
    data(() => {
      if (!items.length) return toast("Belum ada wilayah");
      const its = items.slice(); its.forEach(getBB);
      const deg = i => { const b = getBB(i); return b ? its.filter(o => { const ob = getBB(o); return o !== i && ob && touch(b, ob); }).length : 0; };
      const ord = its.slice().sort((a, b) => deg(b) - deg(a) || (b.area || 0) - (a.area || 0)), done = [];
      ord.forEach(it => { it.color = pickColor(it, done); it.op = defOp(); it.label = true; if (it.line < 1) it.line = 2; done.push(it); });
      save(); redraw(); list(); fitAll(); toast("✨ Warna disusun otomatis — wilayah bersebelahan dibuat kontras", 4200);
    });
  }
  function fitList(arr, mz) { let b = L.latLngBounds([]); arr.forEach(it => { const bb = getBB(it); bb && b.extend(bbL(bb)); }); try { b.isValid() && gm().fitBounds(b, { padding: [50, 50], maxZoom: mz || 13 }); } catch (e) { } }
  function fitAll() { if (ready()) fitList(items.filter(i => i.on), 13); }
  /* kandidat posisi label: titik-titik di dalam poligon yang paling jauh dari tepi (pusat "sejati", bukan sekadar tengah kotak) */
  function cands(it) {
    if (it._cd) return it._cd; const mp = mpOf(it); if (!mp) return []; const bb = getBB(it);
    if (it.kind === "P") {
      let cx = 0, cy = 0, tw = 0; mp.forEach(pp => { const a = ringArea(pp[0]), c = center([pp]); cx += c[0] * a; cy += c[1] * a; tw += a; }); cx /= tw || 1; cy /= tw || 1;
      const cl = Math.cos(cx * Math.PI / 180), N = 22, o2 = [], sp = Math.max(bb[2] - bb[0], bb[3] - bb[1]) * .06;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const la = bb[0] + (bb[2] - bb[0]) * (i + .5) / N, lo = bb[1] + (bb[3] - bb[1]) * (j + .5) / N; if (inMP(la, lo, mp)) o2.push({ ll: [la, lo], d: Math.hypot(la - cx, (lo - cy) * cl) }); }
      o2.sort((a, b) => a.d - b.d); const sl = []; o2.forEach(c => { if (sl.length < 12 && sl.every(q => Math.hypot(q[0] - c.ll[0], q[1] - c.ll[1]) > sp)) sl.push(c.ll); });
      return it._cd = sl.length ? sl : [center(mp)];
    }
    const parts = mp.map(p => ({ p, a: ringArea(p[0]) })), mx = Math.max.apply(null, parts.map(x => x.a)), out = [];
    const sep = Math.max(bb[2] - bb[0], bb[3] - bb[1]) * .05;
    parts.filter(x => x.a >= mx * .08).slice(0, 6).forEach(x => {
      const r = x.p[0], big = x.a >= mx * .5; let a1 = 1e9, b1 = -1e9, c1 = 1e9, d1 = -1e9; r.forEach(q => { a1 = Math.min(a1, q[0]); b1 = Math.max(b1, q[0]); c1 = Math.min(c1, q[1]); d1 = Math.max(d1, q[1]); });
      const cl = Math.cos((a1 + b1) / 2 * Math.PI / 180), N = big ? 14 : 6, pts = []; let tot = 0; x.p.forEach(rg => tot += rg.length); const st = Math.max(1, Math.floor(tot / 1500)); x.p.forEach(rg => { for (let i = 0; i < rg.length; i += st) pts.push(rg[i]); });
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const la = a1 + (b1 - a1) * (i + .5) / N, lo = c1 + (d1 - c1) * (j + .5) / N; if (!(inRing(la, lo, r) && !x.p.slice(1).some(h => inRing(la, lo, h)))) continue; let md = 1e9; for (let k = 0; k < pts.length; k++) { const dy = pts[k][0] - la, dx = (pts[k][1] - lo) * cl, d = dy * dy + dx * dx; if (d < md) md = d; } out.push({ ll: [la, lo], d: Math.sqrt(md) * (big ? 1 : .6) }); }
    });
    out.sort((a, b) => b.d - a.d); const sel = []; out.forEach(c => { if (sel.length < 16 && sel.every(s2 => Math.hypot(s2.ll[0] - c.ll[0], s2.ll[1] - c.ll[1]) > sep)) sel.push(c); });
    return it._cd = sel.length ? sel.map(c => c.ll) : [center(mp)];
  }
  /* tata letak label: ukuran mengikuti zoom, tidak menabrak label jalan / label lain / panel, pindah ke bagian wilayah yang terlihat */
  let lt = 0, bound = false;
  const sched = ms => { clearTimeout(lt); lt = setTimeout(layout, ms || 260); };
  function bindEv() { if (bound || !ready()) return; bound = true; const m = gm(); m.on("zoomend moveend rotate resize", () => sched()); window.addEventListener("resize", () => sched()); setInterval(() => { if (!document.hidden && items.some(i => i.on && i.label)) layout(); }, 4000); }
  function layout() {
    if (!ready()) return; const m = gm(), cr = m.getContainer().getBoundingClientRect(), act = items.filter(i => i.on && i.label && i._l && i._l._icon && i._l._icon.firstChild); if (!act.length) return;
    const obs = [], vis = r => r.width > 0 && r.height > 0 && r.right > cr.left && r.left < cr.right && r.bottom > cr.top && r.top < cr.bottom;
    document.querySelectorAll(".kb-rl:not(.kbh),.kb-l:not(.kbh),#pqbD,#kbPanel.open").forEach(el => { const r = el.getBoundingClientRect(); vis(r) && obs.push(r); });
    const placed = [], vb = m.getBounds();
    act.sort((a, b) => (b.area || 0) - (a.area || 0)).forEach(it => {
      const ic = it._l._icon, sp = ic.firstChild, bb = getBB(it), mp = mpOf(it); if (!bb || !mp) return;
      if (bb[2] < vb.getSouth() || bb[0] > vb.getNorth() || bb[3] < vb.getWest() || bb[1] > vb.getEast()) { ic.classList.add("pqb-hid"); return; }
      const cs = [[bb[0], bb[1]], [bb[0], bb[3]], [bb[2], bb[1]], [bb[2], bb[3]]].map(q => m.latLngToContainerPoint(q)), xs = cs.map(q => q.x), ys = cs.map(q => q.y), pw = Math.max.apply(null, xs) - Math.min.apply(null, xs), ph = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      const nm = sp.textContent || "x"; if (pw < 36 || ph < 14) { ic.classList.add("pqb-hid"); return; }
      sp.style.fontSize = Math.max(10, Math.min(18, pw / (nm.length * .6) * .7)).toFixed(1) + "px";
      const sr = sp.getBoundingClientRect(), w = sr.width || 60, h = sr.height || 14;
      /* kandidat: titik tersimpan + titik di dalam area yang sedang terlihat (urut dari pusat layar) */
      const tryC = list => { for (let k = 0; k < list.length; k++) {
        const cp = m.latLngToContainerPoint(list[k]), x = cr.left + cp.x, y = cr.top + cp.y, R = { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 };
        if (R.left < cr.left + 4 || R.right > cr.right - 4 || R.top < cr.top + 4 || R.bottom > cr.bottom - 4) continue;
        let sc = 0; obs.concat(placed).forEach(o => { const ox = Math.min(R.right, o.right) - Math.max(R.left, o.left), oy = Math.min(R.bottom, o.bottom) - Math.max(R.top, o.top); if (ox > 0 && oy > 0) sc += ox * oy; });
        if (sc < bs) { bs = sc; best = { ll: list[k], R }; } if (sc === 0) return true;
      } return false; };
      let best = null, bs = 1e18;
      if (!tryC(cands(it))) { /* tak ada tempat bersih: coba titik di dalam area yang sedang terlihat */
        const ex = [], ca = Math.min(bb[2], vb.getNorth()), cb = Math.max(bb[0], vb.getSouth()), cc = Math.max(bb[1], vb.getWest()), cd = Math.min(bb[3], vb.getEast());
        if (ca > cb && cd > cc) { for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { const la = cb + (ca - cb) * (i + .5) / 5, lo = cc + (cd - cc) * (j + .5) / 5; if (inMP(la, lo, mp)) ex.push([la, lo]); } const cn = vb.getCenter(); ex.sort((a, b) => Math.hypot(a[0] - cn.lat, a[1] - cn.lng) - Math.hypot(b[0] - cn.lat, b[1] - cn.lng)); tryC(ex); }
      }
            if (best && bs < .3 * w * h) { it._l.setLatLng(best.ll); ic.classList.remove("pqb-hid"); placed.push(best.R); } else ic.classList.add("pqb-hid");
    });
  }
  /* pencarian toleran salah ketik */
  function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let pr = []; for (let j = 0; j <= n; j++) pr[j] = j; for (let i = 1; i <= m; i++) { const cu = [i]; for (let j = 1; j <= n; j++) cu[j] = Math.min(pr[j] + 1, cu[j - 1] + 1, pr[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); pr = cu; } return pr[n]; }
  const entOf = e => e.kind === "P" ? mk({ kind: "P", p: e.p, n: e.p, sub: "Provinsi" }) : mk({ kind: "K", p: e.p, n: e.n, sub: e.p });
  /* Enter: "banyumas, cilacap, kebumen" -> semua sekaligus; nama persis & unik -> langsung diwarnai; selain itu cari online */
  function smartEnter(v) {
    v = String(v || "").trim(); if (!v) return; const parts = v.split(/\s*(?:,|;|\n|&|\bdan\b)\s*/i).filter(Boolean);
    data(() => {
      if (parts.length > 1) { const arr = [], miss = []; parts.forEach(p => { const r = localFind(p)[0]; r ? arr.push(entOf(r)) : miss.push(p); }); if (arr.length) { finish(arr, true); toast(arr.length + " wilayah ditambahkan" + (miss.length ? " · tidak ada di data lokal: " + miss.join(", ") + " (coba 🌐 online)" : ""), 5200); const q = $("pqbQ"); if (q && !miss.length) { q.value = ""; $("pqbRes").innerHTML = ""; } } else online(v); return; }
      const ex = localFind(v).filter(x => x.s === 0);
      if (ex.length === 1) { finish([entOf(ex[0])], true); toast("Ditambahkan: " + ex[0].n); $("pqbQ").value = ""; $("pqbRes").innerHTML = ""; return; }
      online(v);
    });
  }
  /* ---------- tambah/hapus ---------- */
  function mk(o) {
    const key = o.kind + "|" + (o.p || "") + "|" + o.n + "|" + (o.osm || "");
    const ex = items.filter(i => i.key === key)[0]; if (ex) { ex.on = true; ex.color = ex.color; return ex; }
    const it = Object.assign({ id: ++uid, key, color: null, op: defOp(), line: 2, label: true, on: true }, o);
    items.push(it); it.color = pickColor(it); return it;
  }
  function finish(arr, fit) {
    arr = arr.filter(Boolean); if (!arr.length) return;
    arr.forEach(it => { const mp = mpOf(it); it.area = mp ? Math.round(areaMP(mp)) : 0; });
    save(); redraw(); list(); badge(); applyFocus();
    if (fit) { if (arr.length === 1) zoomTo(arr[0]); else if (ready()) fitList(arr, 12); }
  }
  function addLocal(e, mode) {
    data(() => {
      if (e.kind === "K") return finish([mk({ kind: "K", p: e.p, n: e.n, sub: e.p })], true);
      if (mode === "each") { const g = []; kabs().forEach(k => { if (k.p === e.p) g.push(mk({ kind: "K", p: k.p, n: k.n, sub: k.p })); }); pi++; return finish(g, true); }
      finish([mk({ kind: "P", p: e.p, n: e.p, sub: "Provinsi" })], true);
    });
  }
  function addOnline(r) {
    const mp = fromGeo(r.geojson); if (!mp) return toast("Batas wilayah ini tidak tersedia di OpenStreetMap (hanya titik)");
    const a = r.address || {}, nm = r.name || (r.display_name || "").split(",")[0];
    const sub = [a.village || a.suburb || a.neighbourhood, a.city_district || a.municipality, a.county || a.city, a.state].filter(Boolean).filter(x => x !== nm).slice(0, 3).join(", ") || String(r.display_name || "").split(",").slice(1, 3).join(",").trim();
    finish([mk({ kind: "O", n: nm, sub, osm: r.osm_type + r.osm_id, geom: r.geojson, type: r.addresstype || r.type })], true);
  }
  function rm(id) { const i = items.findIndex(x => x.id === id); if (i < 0) return; const it = items[i]; if (it._g) map.removeLayer(it._g); if (it._l) map.removeLayer(it._l); items.splice(i, 1); save(); list(); badge(); applyFocus(); }
  /* ---------- pilih provinsi (seluruh Indonesia) ---------- */
  const ISL = { "Sumatera": ["Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Kepulauan Riau", "Jambi", "Sumatera Selatan", "Kepulauan Bangka Belitung", "Bengkulu", "Lampung"], "Jawa": ["Banten", "DKI Jakarta", "Jawa Barat", "Jawa Tengah", "DI Yogyakarta", "Jawa Timur"], "Bali & Nusa Tenggara": ["Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur"], "Kalimantan": ["Kalimantan Barat", "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara"], "Sulawesi": ["Sulawesi Utara", "Gorontalo", "Sulawesi Tengah", "Sulawesi Barat", "Sulawesi Selatan", "Sulawesi Tenggara"], "Maluku": ["Maluku", "Maluku Utara"], "Papua": ["Papua", "Papua Barat", "Papua Barat Daya", "Papua Pegunungan", "Papua Selatan", "Papua Tengah"] };
  const provItems = p => items.filter(i => i.p === p && (i.kind === "P" || i.kind === "K"));
  const allProv = () => Object.keys(window.PQ_KABBATAS || {}).sort();
  function rmMany(fn) { items.filter(fn).forEach(it => { if (it._g) map.removeLayer(it._g); if (it._l) map.removeLayer(it._l); items.splice(items.indexOf(it), 1); }); save(); list(); badge(); applyFocus(); }
  function addProv(ps, mode, fit) {
    data(() => {
      const arr = []; ps.forEach(p => {
        if (mode === "each") { rmMany(i => i.kind === "P" && i.p === p); kabs().forEach(k => { if (k.p === p) arr.push(mk({ kind: "K", p: k.p, n: k.n, sub: k.p })); }); }
        else { rmMany(i => i.kind === "K" && i.p === p); arr.push(mk({ kind: "P", p, n: p, sub: "Provinsi" })); }
      });
      finish(arr, fit !== false);
    });
  }
  function provToggle(p) { if (provItems(p).length) rmMany(i => i.p === p && (i.kind === "P" || i.kind === "K")); else addProv([p], $("pqbPM") ? $("pqbPM").value : "one"); }
  function pgRender() {
    const box = $("pqbPG"); if (!box || !window.PQ_KABBATAS) return; const D = window.PQ_KABBATAS, q = norm(($("pqbPQ") || {}).value || ""), on = allProv().filter(p => provItems(p).length).length;
    const c = $("pqbPC"); c && (c.textContent = "(" + on + "/" + allProv().length + ")");
    box.innerHTML = allProv().filter(p => !q || norm(p).indexOf(q) >= 0).map(p => { const pi2 = provItems(p), col = pi2.length ? pi2[0].color : ""; return '<button type="button" class="pqb-pc' + (pi2.length ? " on" : "") + '" data-a="pv" data-p="' + esc(p) + '"' + (col ? ' style="--c:' + col + '"' : "") + '><b>' + esc(p) + "</b><small>" + D[p].length + " kab/kota" + (pi2.length && pi2[0].kind === "K" ? " · tiap kab" : "") + "</small></button>"; }).join("") || '<div class="pqb-m">Provinsi tidak ditemukan</div>';
  }
  function linkKab() {
    const pv = $("kbPv"); if (!pv) return false; if ($("pqbKbLink")) return true; const b = document.createElement("button"); b.id = "pqbKbLink"; b.type = "button"; b.textContent = "🎨 Provinsi lain · seluruh Indonesia (Blok Warna)";
    b.style.cssText = "margin:8px 0 2px;width:100%;padding:9px 10px;border-radius:12px;border:1px solid rgba(34,211,238,.45);background:#0e2a3a;color:#7fe9ff;font:600 12px system-ui,sans-serif;cursor:pointer";
    b.onclick = () => { openDlg(); setTimeout(() => { const g = $("pqbPH"); g && g.scrollIntoView({ block: "start" }); }, 120); }; pv.parentNode.insertBefore(b, pv.nextSibling); return true;
  }
  { let tries = 0; const iv = setInterval(() => { if (linkKab() || ++tries > 60) clearInterval(iv); }, 1500); }
  /* ---------- pencarian ---------- */
  function localFind(q) {
    const n = norm(q); if (!n) return []; const out = [], D = window.PQ_KABBATAS || {};
    for (const p in D) { if (norm(p).indexOf(n) >= 0) out.push({ kind: "P", p, n: p, sub: D[p].length + " kab/kota", s: norm(p) === n ? 0 : 1 }); }
    kabs().forEach(k => { const m = norm(k.n); if (m.indexOf(n) >= 0) out.push({ kind: "K", p: k.p, n: k.n, sub: k.p, s: m === n ? 0 : m.indexOf(n) === 0 ? 1 : 2 }); });
    if (!out.some(o => o.s === 0) && out.length < 3 && n.length >= 4) { const t = n.length <= 5 ? 1 : 2, near = x => { const w = x.split(" ").concat([x]); return Math.min.apply(null, w.map(y => lev(n, y))); };
      for (const p in D) { const d = near(norm(p)); if (d <= t && !out.some(o => o.kind === "P" && o.p === p)) out.push({ kind: "P", p, n: p, sub: D[p].length + " kab/kota · mirip", s: 3 + d }); }
      kabs().forEach(k => { const d = near(norm(k.n)); if (d <= t && !out.some(o => o.kind === "K" && o.p === k.p && o.n === k.n)) out.push({ kind: "K", p: k.p, n: k.n, sub: k.p + " · mirip", s: 3 + d }); }); }
    return out.sort((a, b) => a.s - b.s).slice(0, 8);
  }
  function variants(q) {
    const w = norm(q).split(" ").filter(Boolean), v = [q.trim()];
    if (w.length > 1) { v.push(w[0]); v.push(w[0] + " " + w[w.length - 1]); v.push("desa " + w[0] + " " + w.slice(1).join(" ")); }
    else if (w.length) { v.push("desa " + w[0]); v.push("kecamatan " + w[0]); }
    return v.filter((x, i, a) => x && a.indexOf(x) === i).slice(0, 4);
  }
  const enc = encodeURIComponent;
  function jget(u, ms) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 12000); return fetch(u, { signal: c.signal }).then(r => { clearTimeout(t); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).catch(e => { clearTimeout(t); throw e; }); }
  function photon(q) { return jget("https://photon.komoot.io/api/?limit=8&lang=id&bbox=95,-11.5,141.5,6.5&q=" + enc(q)).then(d => (d.features || []).map(f => { const p = f.properties || {}, g = f.geometry.coordinates; return { osm_type: { R: "relation", W: "way", N: "node" }[p.osm_type] || "node", osm_id: p.osm_id, name: p.name, display_name: [p.name, p.district || p.locality, p.county || p.city, p.state].filter(Boolean).join(", "), lat: g[1], lon: g[0], addresstype: p.osm_value || p.type, address: {} }; })); }
  /* 1) cari kandidat (tanpa poligon, ringan & andal) -> 2) ambil poligon lewat lookup */
  function cand(q) { return jget(NOM + "search?format=jsonv2&limit=8&countrycodes=id&accept-language=id&addressdetails=1&q=" + enc(q)).catch(() => photon(q)); }
  function lookup(list) {
    const ids = list.filter(r => r.osm_type === "relation" || r.osm_type === "way").slice(0, 12).map(r => r.osm_type[0].toUpperCase() + r.osm_id);
    if (!ids.length) return Promise.resolve();
    return jget(NOM + "lookup?format=jsonv2&accept-language=id&polygon_geojson=1&polygon_threshold=0.0004&osm_ids=" + ids.join(","), 20000).then(a => { (a || []).forEach(x => { list.forEach(r => { if (r.osm_type === x.osm_type && +r.osm_id === +x.osm_id && x.geojson) r.geojson = x.geojson; }); }); }).catch(() => { });
  }
  function online(q) {
    if (!q.trim()) return; const box = $("pqbRes"); box.innerHTML = '<div class="pqb-m">Mencari di OpenStreetMap (beberapa variasi nama)…</div>';
    const vs = variants(q), toks = norm(q).split(" ").filter(Boolean), need = Math.min(2, toks.length); let all = [], seen = {}, i = 0, err = null;
    const match = r => toks.filter(t => norm(r.display_name).indexOf(t) >= 0).length;
    const done = () => {
      if (!all.length) { box.innerHTML = '<div class="pqb-m">' + (err ? "Gagal terhubung ke OpenStreetMap (" + esc(err) + "). Periksa internet lalu coba lagi." : 'Tidak ditemukan. Coba tulis nama saja (mis. "Kembaran"), atau pakai "Ketuk peta" / Impor GeoJSON.') + "</div>"; return; }
      box.innerHTML = '<div class="pqb-m">Mengambil garis batas…</div>';
      all.forEach(r => { r._s = match(r) * 10 + (/boundary|administrative|village|suburb|city_district|municipality|county/.test((r.category || "") + (r.type || "") + (r.addresstype || "")) ? 3 : 0); });
      all.sort((a, b) => b._s - a._s); all = all.slice(0, 10);
      lookup(all).then(() => { all.forEach(r => { r._s += (r.geojson && /Polygon/.test(r.geojson.type)) ? 5 : 0; }); all.sort((a, b) => b._s - a._s); found = all; resFill(localFind(q), found, 0); });
    };
    const next = () => {
      if (i >= vs.length) return done();
      cand(vs[i++]).then(a => { (a || []).forEach(r => { const k = r.osm_type + r.osm_id; if (!seen[k]) { seen[k] = 1; all.push(r); } }); }, e => { err = e.message || "error"; }).then(() => { if (all.some(r => match(r) >= need && need > 0)) i = vs.length; i >= vs.length ? done() : setTimeout(next, 1100); });
    };
    next();
  }
  function circ(lat, lon, km) { const o = []; for (let k = 0; k < 72; k++) { const a = k * 5 * Math.PI / 180, dl = km / 111.32; o.push([lon + dl * Math.sin(a) / Math.cos(lat * Math.PI / 180), lat + dl * Math.cos(a)]); } o.push(o[0]); return { type: "Polygon", coordinates: [o] }; }
  function addCircle(r) {
    const km = parseFloat(String(prompt("Batas wilayah ini hanya berupa titik di OpenStreetMap.\nBuat blok lingkaran perkiraan, radius (km):", "1.5") || "").replace(",", "."));
    if (!(km > 0)) return; const nm = r.name || (r.display_name || "").split(",")[0];
    finish([mk({ kind: "O", n: nm + " (± " + km + " km)", sub: "Perkiraan lingkaran · " + (r.display_name || "").split(",").slice(1, 3).join(",").trim(), osm: "c" + r.osm_type + r.osm_id + "_" + km, geom: circ(+r.lat, +r.lon, km), type: "circle" })], true);
  }
  const typeLbl = t => ({ village: "Desa", suburb: "Kelurahan/Desa", neighbourhood: "Dusun/RW", city_district: "Kecamatan", municipality: "Kecamatan", county: "Kab/Kota", city: "Kota", state: "Provinsi", administrative: "Wilayah", town: "Kota kecil", hamlet: "Dusun" }[t] || "Wilayah");
  function resFill(loc, onl, miss) {
    const box = $("pqbRes"); let h = "";
    loc.forEach((e, i) => { h += '<div class="pqb-r"><div><b>' + esc(e.n) + "</b><small>" + (e.kind === "P" ? "Provinsi · " : "Kab/Kota · ") + esc(e.sub) + '</small></div><div class="pqb-b">' + (e.kind === "P" ? '<button data-a="addP1" data-i="' + i + '" title="Satu warna">Satu warna</button><button data-a="addPK" data-i="' + i + '" title="Tiap kab/kota beda warna">Beda tiap kab</button>' : '<button data-a="addK" data-i="' + i + '">+ Warnai</button>') + "</div></div>"; });
    onl.forEach((r, i) => { const poly = r.geojson && /Polygon/.test(r.geojson.type); h += '<div class="pqb-r"><div><b>' + esc(r.name || (r.display_name || "").split(",")[0]) + "</b><small>" + typeLbl(r.addresstype || r.type) + (poly ? "" : " · titik saja") + " · " + esc((r.display_name || "").split(",").slice(1, 4).join(",").trim()) + '</small></div><div class="pqb-b">' + (poly ? '<button data-a="addO" data-i="' + i + '">+ Warnai</button>' : '<button data-a="addC" data-i="' + i + '" title="Batas tidak ada, buat lingkaran perkiraan">◯ Lingkaran</button>') + "</div></div>"; });
    if (!h) h = '<div class="pqb-m">Tidak ditemukan di OpenStreetMap. Coba tulis nama saja (mis. "Bantarwuni"), atau pakai "Ketuk peta" / Impor GeoJSON.</div>';
    else if (miss) h += '<div class="pqb-m">' + miss + " hasil tanpa garis batas disembunyikan.</div>";
    box.innerHTML = h; box._loc = loc;
  }
  /* ---------- ketuk peta ---------- */
  function pick(level) {
    if (!ready()) return; closeDlg(); const c = map.getContainer(); c.style.cursor = "crosshair"; toast("Ketuk peta pada wilayah yang ingin diwarnai (" + level + ") — ketuk tombol 🎨 lagi untuk batal", 0);
    const h = ev => { c.style.cursor = ""; picking = null; toast("Mencari wilayah…", 0); const la = ev.latlng.lat, lo = ev.latlng.lng;
      const back = () => { toast(""); $("pqbT") && ($("pqbT").className = ""); openDlg(); };
      if (level === "prov" || level === "kab") { data(() => { const k = kabs().filter(k => inMP(la, lo, mpK(k)))[0]; if (!k) { toast("Titik di luar data batas lokal"); return openDlg(); } level === "kab" ? finish([mk({ kind: "K", p: k.p, n: k.n, sub: k.p })], true) : finish([mk({ kind: "P", p: k.p, n: k.p, sub: "Provinsi" })], true); toast("Ditambahkan: " + (level === "kab" ? k.n : k.p)); openDlg(); }); return; }
      const z = level === "kec" ? 12 : 13;
      fetch(NOM + "reverse?format=jsonv2&zoom=" + z + "&accept-language=id&addressdetails=1&polygon_geojson=1&polygon_threshold=0.0004&lat=" + la + "&lon=" + lo).then(r => r.json()).then(r => { if (!r || !r.geojson) { toast("Wilayah tidak ditemukan"); return openDlg(); } addOnline(r); toast("Ditambahkan: " + (r.name || "wilayah")); openDlg(); }).catch(() => { toast("Gagal mengambil wilayah (cek internet)"); openDlg(); });
    };
    picking = h; map.once("click", h);
  }
  function cancelPick() { if (!picking) return false; map.off("click", picking); picking = null; map.getContainer().style.cursor = ""; toast("Dibatalkan"); return true; }
  /* ---------- file GeoJSON ---------- */
  function onFile(f) {
    if (!f) return; const rd = new FileReader();
    rd.onload = () => { try { const j = JSON.parse(rd.result), fs = j.type === "FeatureCollection" ? j.features : j.type === "Feature" ? [j] : [{ type: "Feature", properties: {}, geometry: j }]; const arr = [];
      fs.forEach((ft, i) => { if (!fromGeo(ft.geometry)) return; const pr = ft.properties || {}; const nm = pr.name || pr.NAME || pr.nama || pr.NAMOBJ || pr.WADMKD || pr.WADMKC || pr.WADMKK || pr.WADMPR || (f.name.replace(/\.\w+$/, "") + (fs.length > 1 ? " " + (i + 1) : "")); arr.push(mk({ kind: "O", n: String(nm), sub: "File " + f.name, osm: "f" + f.name + i, geom: ft.geometry, type: "file" })); });
      if (!arr.length) return toast("File tidak berisi poligon"); if (arr.length > 60) arr.length = 60; finish(arr, true); toast(arr.length + " wilayah dari file ditambahkan"); } catch (e) { toast("File GeoJSON tidak valid"); } };
    rd.readAsText(f);
  }
  /* ---------- UI ---------- */
  function css() {
    if ($("pqb-css")) return; const s = document.createElement("style"); s.id = "pqb-css";
    s.textContent = "#pqbD{position:fixed;left:12px;top:78px;z-index:2100;width:min(390px,calc(100vw - 24px));max-height:calc(100dvh - 160px);display:flex;flex-direction:column;background:#0a0e17f2;color:#e6f1fb;border:1px solid rgba(34,211,238,.4);border-radius:16px;box-shadow:0 14px 40px #000a;font:13px/1.35 system-ui,sans-serif;backdrop-filter:blur(8px)}#pqbD.min .pqb-bd{display:none}@media(max-width:600px){#pqbD{left:6px;right:6px;top:auto;bottom:6px;width:auto;max-height:68dvh}}" +
      "#pqbD header{display:flex;align-items:center;gap:6px;padding:10px 12px;font-weight:700;border-bottom:1px solid #22d3ee33}#pqbD header span{flex:1}#pqbD header small{color:#22d3ee;font-weight:600;margin-left:4px}#pqbD button{cursor:pointer;font:inherit}.pqb-x{background:none;border:0;color:#9fb3c8;font-size:16px;padding:2px 6px}" +
      ".pqb-bd{overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:9px;overscroll-behavior:contain}#pqbD input[type=text],#pqbD select{width:100%;box-sizing:border-box;background:#111a28;color:#e6f1fb;border:1px solid #22d3ee55;border-radius:10px;padding:9px 10px;font:inherit}" +
      ".pqb-row{display:flex;gap:6px}.pqb-row>*{flex:1}#pqbD .pqb-btn,.pqb-b button{background:#0e2a3a;color:#7fe9ff;border:1px solid #22d3ee66;border-radius:9px;padding:7px 9px}.pqb-r{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:10px;background:#111a28}.pqb-r>div:first-child{flex:1;min-width:0}.pqb-r small{display:block;color:#8aa0b6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pqb-b{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}.pqb-m{color:#8aa0b6;padding:4px 2px;font-size:12px}" +
      ".pqb-h{font-size:11px;letter-spacing:.08em;color:#22d3ee;text-transform:uppercase;margin-top:2px}.pqb-it{border-radius:12px;background:#111a28;padding:8px;display:flex;flex-direction:column;gap:6px;border-left:4px solid var(--c)}.pqb-it.off{opacity:.55}.pqb-t{display:flex;align-items:center;gap:6px}.pqb-t>div{flex:1;min-width:0}.pqb-t b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pqb-t small{color:#8aa0b6}.pqb-t input[type=color]{width:30px;height:30px;border:0;padding:0;background:none;border-radius:8px}.pqb-ic{background:#0e2a3a;border:1px solid #22d3ee44;color:#cfefff;border-radius:8px;min-width:30px;height:30px}.pqb-ic.on{background:#0e7490}.pqb-sl{display:flex;align-items:center;gap:6px;color:#8aa0b6;font-size:11px}.pqb-sl input{flex:1;accent-color:#22d3ee}.pqb-ft{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px;color:#9fb3c8}" +
      ".pqb-hid{visibility:hidden!important}.pqb-isl{display:flex;flex-wrap:wrap;gap:5px}#pqbD .pqb-chip{padding:4px 10px;border-radius:999px;font-size:12px}.pqb-pg{display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:232px;overflow:auto;overscroll-behavior:contain}.pqb-pc{display:flex;flex-direction:column;gap:2px;text-align:left;padding:8px 26px 8px 9px;border-radius:12px;background:#111a28;color:#e6f1fb;border:1px solid #22d3ee33;border-left:4px solid var(--c,#22d3ee55);position:relative;cursor:pointer;font:inherit}.pqb-pc b{font-size:12.5px}.pqb-pc small{color:#8aa0b6;font-size:11px}.pqb-pc.on{background:#0e2a3a;border-color:var(--c)}.pqb-pc.on::after{content:'\\2713';position:absolute;right:9px;top:7px;color:var(--c);font-weight:700}.pqb-lb span{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font:700 11px system-ui,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000,0 1px 2px #000;pointer-events:none}#pqbT{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2200;background:#0a0e17f2;color:#e6f1fb;border:1px solid #22d3ee66;padding:9px 14px;border-radius:12px;font:13px system-ui;max-width:86vw;display:none;text-align:center}#pqbT.on{display:block}#pqbT:empty{display:none!important}";
    document.head.appendChild(s);
  }
  function openDlg() {
    css(); if (!DLG) {
      DLG = document.createElement("div"); DLG.id = "pqbD";
      DLG.innerHTML = '<header><span>🎨 Blok Warna Wilayah<small id="pqbN"></small></span><button class="pqb-x" data-a="min" title="Kecilkan">▁</button><button class="pqb-x" data-a="x" title="Tutup">✕</button></header><div class="pqb-bd">' +
        '<input type="text" id="pqbQ" placeholder="Cari provinsi / kab / kota / kecamatan / desa…" autocomplete="off"><div class="pqb-row"><button class="pqb-btn" data-a="online">🌐 Cari desa/kecamatan online</button></div><div id="pqbRes"></div>' +
        '<div class="pqb-h" id="pqbPH">Pilih provinsi · seluruh Indonesia <span id="pqbPC"></span></div><div class="pqb-row"><select id="pqbPM"><option value="one">Satu warna per provinsi</option><option value="each">Tiap kab/kota beda warna</option></select><button class="pqb-btn" data-a="allp" title="Warnai ke-38 provinsi sekaligus (satu warna per provinsi, warna tetangga dibuat kontras)">🇮🇩 Semua Indonesia</button></div><div class="pqb-isl" id="pqbIsl">' + Object.keys(ISL).map(k => '<button class="pqb-btn pqb-chip" data-a="isl" data-i="' + esc(k) + '">' + esc(k) + '</button>').join('') + '<button class="pqb-btn pqb-chip" data-a="clrp">Lepas semua provinsi</button></div><input type="text" id="pqbPQ" placeholder="Filter provinsi…" autocomplete="off"><div class="pqb-pg" id="pqbPG"></div>' +
        '<div class="pqb-h">Atau pilih langsung</div><div class="pqb-row"><select id="pqbLv"><option value="prov">Ketuk peta → Provinsi</option><option value="kab" selected>Ketuk peta → Kab/Kota</option><option value="kec">Ketuk peta → Kecamatan</option><option value="desa">Ketuk peta → Desa/Kelurahan</option></select><button class="pqb-btn" data-a="pick">📍 Ketuk peta</button></div>' +
        '<div class="pqb-row"><button class="pqb-btn" data-a="file">📂 Impor GeoJSON</button></div><input type="file" id="pqbF" accept=".geojson,.json,application/geo+json,application/json" style="display:none">' +
        '<div class="pqb-h">Wilayah berwarna <span id="pqbC"></span></div><div id="pqbL"></div>' +
        '<div class="pqb-ft"><label title="Matikan Kabupaten, Jalan Nasional, Tol & Patok KM selagi blok warna aktif"><input type="checkbox" id="pqbFoc"> Fokus (matikan lapisan lain)</label><button class="pqb-btn" data-a="auto" title="Susun ulang warna otomatis: wilayah bersebelahan dibuat kontras, transparansi disesuaikan peta dasar">✨ Auto warna</button><button class="pqb-btn" data-a="fit">⤢ Pas semua</button><button class="pqb-btn" data-a="hideall">Sembunyikan semua</button><button class="pqb-btn" data-a="clr">Hapus semua</button></div></div>';
      document.body.appendChild(DLG);
      DLG.addEventListener("click", onClick); DLG.addEventListener("input", onInput); DLG.addEventListener("change", e => { if (e.target.id === "pqbF") { onFile(e.target.files[0]); e.target.value = ""; } if (e.target.id === "pqbFoc") { focus = e.target.checked; save(); applyFocus(); }  });
      DLG.addEventListener("keydown", e => { if (e.target.id === "pqbQ" && e.key === "Enter") smartEnter(e.target.value); });
    }
    DLG.style.display = ""; DLG.classList.remove("min"); $("pqbFoc").checked = focus; list(); badge();
    data(() => { pgRender(); const q = $("pqbQ"); q && q.value && onInput({ target: q }); });
  }
  function closeDlg() { if (DLG) DLG.style.display = "none"; }
  let tmr = 0;
  function onInput(e) {
    const t = e.target;
    if (t.id === "pqbQ") { clearTimeout(tmr); tmr = setTimeout(() => { const q = t.value; if (!q.trim()) { $("pqbRes").innerHTML = ""; return; } data(() => { found = []; resFill(localFind(q), [], 0); }); }, 150); return; }
    if (t.id === "pqbPQ") { pgRender(); return; }
    const id = +t.dataset.id, it = items.filter(x => x.id === id)[0]; if (!it) return;
    if (t.dataset.a === "col") { it.color = t.value; if (it._g) { it._g.setStyle({ color: it.color, fillColor: it.color }); } const r = t.closest(".pqb-it"); r && r.style.setProperty("--c", it.color); save(); }
    if (t.dataset.a === "op") { it.op = t.value / 100; moveOp(it); save(); }
  }
  function onClick(e) {
    const b = e.target.closest("[data-a]"); if (!b || b.tagName === "INPUT") return; const a = b.dataset.a, id = +b.dataset.id, it = items.filter(x => x.id === id)[0];
    if (a === "x") closeDlg(); else if (a === "min") DLG.classList.toggle("min");
    else if (a === "online") online($("pqbQ").value);
    else if (a === "pick") pick($("pqbLv").value);
    else if (a === "file") $("pqbF").click();
    else if (a === "auto") autoColors();
    else if (a === "fit") fitAll();
    else if (a === "addP1" || a === "addPK" || a === "addK") { const loc = $("pqbRes")._loc || [], en = loc[+b.dataset.i]; if (en) addLocal(en, a === "addPK" ? "each" : "one"); }
    else if (a === "addC") { const r = found[+b.dataset.i]; if (r) addCircle(r); }
    else if (a === "addO") { const r = found[+b.dataset.i]; if (r) addOnline(r); }
    else if (a === "pv") provToggle(b.dataset.p);
    else if (a === "allp") addProv(allProv(), "one");
    else if (a === "isl") addProv(ISL[b.dataset.i] || [], $("pqbPM").value);
    else if (a === "clrp") rmMany(i => i.kind === "P" || i.kind === "K");
    else if (a === "clr") { if (items.length && confirm("Hapus semua blok warna wilayah?")) items.slice().forEach(i => rm(i.id)); }
    else if (a === "hideall") { const v = items.some(i => i.on); items.forEach(i => i.on = !v); save(); redraw(); list(); badge(); applyFocus(); }
    else if (it) {
      if (a === "eye") { it.on = !it.on; draw(it, items.indexOf(it)); save(); list(); badge(); applyFocus(); }
      else if (a === "lbl") { it.label = !it.label; draw(it, items.indexOf(it)); save(); list(); }
      else if (a === "zoom") zoomTo(it);
      else if (a === "del") rm(id);
      else if (a === "line") { it.line = it.line >= 4 ? 0 : it.line + 1; if (it._g) it._g.setStyle({ weight: it.line }); save(); list(); }
    }
  }
  function list() {
    const box = $("pqbL"); if (!box) return; const t = items.reduce((s, i) => s + (i.area || 0), 0);
    $("pqbC").textContent = items.length ? "(" + items.length + (t ? " · " + t.toLocaleString("id-ID") + " km²" : "") + ")" : "";
    box.innerHTML = items.length ? items.map(it => '<div class="pqb-it' + (it.on ? "" : " off") + '" style="--c:' + it.color + '"><div class="pqb-t"><input type="color" data-a="col" data-id="' + it.id + '" value="' + it.color + '"><div><b>' + esc(it.n) + "</b><small>" + esc(it.sub || "") + (it.area ? " · " + it.area.toLocaleString("id-ID") + " km²" : "") + '</small></div>' +
      '<button class="pqb-ic' + (it.on ? " on" : "") + '" data-a="eye" data-id="' + it.id + '" title="Tampil/sembunyi">👁</button><button class="pqb-ic' + (it.label ? " on" : "") + '" data-a="lbl" data-id="' + it.id + '" title="Label nama">Aa</button><button class="pqb-ic" data-a="line" data-id="' + it.id + '" title="Tebal garis tepi (' + it.line + ')">▢</button><button class="pqb-ic" data-a="zoom" data-id="' + it.id + '" title="Zoom ke wilayah">⌖</button><button class="pqb-ic" data-a="del" data-id="' + it.id + '" title="Hapus">✕</button></div>' +
      '<div class="pqb-sl">Transparansi <input type="range" min="10" max="90" value="' + Math.round(it.op * 100) + '" data-a="op" data-id="' + it.id + '"></div></div>').join("") : '<div class="pqb-m">Belum ada. Cari wilayah di atas atau ketuk peta.</div>';
  }
  const badge0 = () => { pgRender(); };
  const badge = () => { pgRender(); const n = items.filter(i => i.on).length; const el = $("pqbN"); if (el) el.textContent = n ? " · " + n + " aktif" : ""; };
  window.PETAQU_BLOK = { auto: autoColors, fit: fitAll, relayout: layout, open: openDlg, close: closeDlg, count: () => items.filter(i => i.on).length, rows: () => [{ id: "blok", name: "Blok warna wilayah", ic: "\u25A8", c: "#f59e0b", on: items.some(i => i.on) }], cancel: cancelPick };
  document.addEventListener("keydown", e => { if (e.key === "Escape") cancelPick(); });
  if (window.__PQB_TEST) window.__PQB_T = { addProv, rmMany, provItems, polysOf, paneOf, pgRender, allProv, ISL, lev, hue, hd, pickColor, cands, localFind, mk, items: () => items, data, autoColors, getBB };
  items.length ? restore() : 0;
})();
