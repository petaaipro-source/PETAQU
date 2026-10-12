/* PETAQU Blok Warna Wilayah — warnai wilayah MANA PUN (provinsi, kab/kota, kecamatan, desa/kelurahan) dengan warna sendiri.
   Sumber: (1) data batas lokal provinsi & kab/kota (offline, instan), (2) OpenStreetMap/Nominatim untuk kecamatan, desa & lainnya,
   (3) file GeoJSON sendiri, (4) ketuk peta -> wilayah di titik itu. Banyak wilayah sekaligus, tiap wilayah punya warna/transparansi/label sendiri. */
(function () {
  "use strict";
  const KEY = "petaqu_blok_v1", $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const PAL = ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef", "#ec4899", "#f97316", "#84cc16"];
  const NOM = "https://nominatim.openstreetmap.org/";
  let items = [], DLG = null, K = null, loading = false, top = true, pi = 0, found = [], picking = null, mini = false, uid = 0;
  try { const o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o) { items = o.items || []; top = o.top !== false; items.forEach(i => { uid = Math.max(uid, +i.id || 0); }); pi = items.length; } } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ top, items: items.map(i => { const c = Object.assign({}, i); delete c._g; delete c._l; delete c._mp; return c; }) })); } catch (e) { toast("Memori browser penuh — hapus beberapa wilayah online"); } };
  const ready = () => window.map && window.L;
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
  function zBase() { return top ? 440 : 395; }
  function paneOf(it, idx) { const n = "pqb_" + it.id; let p = map.getPane(n); if (!p) { p = map.createPane(n); p.style.pointerEvents = "none"; } p.style.zIndex = zBase() + (idx % 9) * .01 * 100 / 100; p.style.opacity = it.on ? it.op : 0; p.style.display = it.on ? "" : "none"; return n; }
  function labelPane() { let p = map.getPane("pqbL"); if (!p) { p = map.createPane("pqbL"); p.style.zIndex = 465; p.style.pointerEvents = "none"; } return "pqbL"; }
  function center(mp) { let best = null, ba = -1; mp.forEach(p => { const a = ringArea(p[0]); if (a > ba) { ba = a; best = p[0]; } }); let a = 1e9, b = -1e9, c = 1e9, d = -1e9; best.forEach(q => { a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); }); return [(a + b) / 2, (c + d) / 2]; }
  function short(n) { return String(n).replace(/^Kabupaten /, "Kab. ").replace(/^Kota Administrasi /, "Kota ").replace(/^Provinsi /, ""); }
  function draw(it, idx) {
    if (!ready()) return; const mp = mpOf(it); if (!mp) return;
    if (it._g) map.removeLayer(it._g); if (it._l) map.removeLayer(it._l);
    const pane = paneOf(it, idx);
    it._g = L.polygon(mp, { pane, interactive: false, color: it.color, weight: it.line, opacity: 1, fillColor: it.color, fillOpacity: 1, smoothFactor: 1.2, lineJoin: "round" }).addTo(map);
    it._l = null;
    if (it.label && it.on) { const c = center(mp); it._l = L.marker(c, { pane: labelPane(), interactive: false, keyboard: false, icon: L.divIcon({ className: "pqb-lb", html: "<span>" + esc(short(it.n)) + "</span>", iconSize: [0, 0] }) }).addTo(map); }
  }
  function redraw() { items.forEach((it, i) => { if (it._g || ready()) draw(it, i); }); }
  function zoomTo(it) { const mp = mpOf(it); if (!mp || !ready()) return; let b = L.latLngBounds([]); mp.forEach(p => p[0].forEach(q => b.extend(q))); try { map.fitBounds(b, { padding: [40, 40], maxZoom: 15 }); } catch (e) { } }
  function restore() {
    if (!ready()) return setTimeout(restore, 500);
    const needLocal = items.some(i => i.kind !== "O");
    const go = () => { redraw(); list(); badge(); };
    needLocal ? data(go) : go();
  }
  /* ---------- tambah/hapus ---------- */
  function mk(o) {
    const key = o.kind + "|" + (o.p || "") + "|" + o.n + "|" + (o.osm || "");
    const ex = items.filter(i => i.key === key)[0]; if (ex) { ex.on = true; ex.color = ex.color; return ex; }
    const it = Object.assign({ id: ++uid, key, color: PAL[pi++ % PAL.length], op: .45, line: 2, label: true, on: true }, o);
    items.push(it); return it;
  }
  function finish(arr, fit) {
    arr = arr.filter(Boolean); if (!arr.length) return;
    arr.forEach(it => { const mp = mpOf(it); it.area = mp ? Math.round(areaMP(mp)) : 0; });
    save(); redraw(); list(); badge();
    if (fit) { if (arr.length === 1) zoomTo(arr[0]); else if (ready()) { let b = L.latLngBounds([]); arr.forEach(it => { const mp = mpOf(it); mp && mp.forEach(p => p[0].forEach(q => b.extend(q))); }); try { map.fitBounds(b, { padding: [40, 40], maxZoom: 12 }); } catch (e) { } } }
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
  function rm(id) { const i = items.findIndex(x => x.id === id); if (i < 0) return; const it = items[i]; if (it._g) map.removeLayer(it._g); if (it._l) map.removeLayer(it._l); const p = map.getPane("pqb_" + it.id); if (p) p.style.display = "none"; items.splice(i, 1); save(); list(); badge(); }
  /* ---------- pencarian ---------- */
  function localFind(q) {
    const n = norm(q); if (!n) return []; const out = [], D = window.PQ_KABBATAS || {};
    for (const p in D) { if (norm(p).indexOf(n) >= 0) out.push({ kind: "P", p, n: p, sub: D[p].length + " kab/kota", s: norm(p) === n ? 0 : 1 }); }
    kabs().forEach(k => { const m = norm(k.n); if (m.indexOf(n) >= 0) out.push({ kind: "K", p: k.p, n: k.n, sub: k.p, s: m === n ? 0 : m.indexOf(n) === 0 ? 1 : 2 }); });
    return out.sort((a, b) => a.s - b.s).slice(0, 8);
  }
  function online(q) {
    if (!q.trim()) return; const box = $("pqbRes"); box.innerHTML = '<div class="pqb-m">Mencari di OpenStreetMap…</div>';
    const u = NOM + "search?format=jsonv2&limit=8&countrycodes=id&accept-language=id&addressdetails=1&polygon_geojson=1&polygon_threshold=0.0004&q=" + encodeURIComponent(q);
    fetch(u).then(r => r.json()).then(a => { found = (a || []).filter(r => r.geojson && /Polygon/.test(r.geojson.type)); const nx = (a || []).length - found.length; resFill(localFind(q), found, nx); }).catch(() => { box.innerHTML = '<div class="pqb-m">Gagal mencari online (cek internet).</div>'; });
  }
  const typeLbl = t => ({ village: "Desa", suburb: "Kelurahan/Desa", neighbourhood: "Dusun/RW", city_district: "Kecamatan", municipality: "Kecamatan", county: "Kab/Kota", city: "Kota", state: "Provinsi", administrative: "Wilayah", town: "Kota kecil", hamlet: "Dusun" }[t] || "Wilayah");
  function resFill(loc, onl, miss) {
    const box = $("pqbRes"); let h = "";
    loc.forEach((e, i) => { h += '<div class="pqb-r"><div><b>' + esc(e.n) + "</b><small>" + (e.kind === "P" ? "Provinsi · " : "Kab/Kota · ") + esc(e.sub) + '</small></div><div class="pqb-b">' + (e.kind === "P" ? '<button data-a="addP1" data-i="' + i + '" title="Satu warna">Satu warna</button><button data-a="addPK" data-i="' + i + '" title="Tiap kab/kota beda warna">Beda tiap kab</button>' : '<button data-a="addK" data-i="' + i + '">+ Warnai</button>') + "</div></div>"; });
    onl.forEach((r, i) => { h += '<div class="pqb-r"><div><b>' + esc(r.name || (r.display_name || "").split(",")[0]) + "</b><small>" + typeLbl(r.addresstype || r.type) + " · " + esc((r.display_name || "").split(",").slice(1, 4).join(",").trim()) + '</small></div><div class="pqb-b"><button data-a="addO" data-i="' + i + '">+ Warnai</button></div></div>'; });
    if (!h) h = '<div class="pqb-m">Tidak ada hasil bergaris batas. Coba tambah nama kabupaten, mis. "Karangpucung Cilacap".</div>';
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
      ".pqb-lb span{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font:700 11px system-ui,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000,0 1px 2px #000;pointer-events:none}#pqbT{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2200;background:#0a0e17f2;color:#e6f1fb;border:1px solid #22d3ee66;padding:9px 14px;border-radius:12px;font:13px system-ui;max-width:86vw;display:none;text-align:center}#pqbT.on{display:block}#pqbT:empty{display:none!important}";
    document.head.appendChild(s);
  }
  function openDlg() {
    css(); if (!DLG) {
      DLG = document.createElement("div"); DLG.id = "pqbD";
      DLG.innerHTML = '<header><span>🎨 Blok Warna Wilayah<small id="pqbN"></small></span><button class="pqb-x" data-a="min" title="Kecilkan">▁</button><button class="pqb-x" data-a="x" title="Tutup">✕</button></header><div class="pqb-bd">' +
        '<input type="text" id="pqbQ" placeholder="Cari provinsi / kab / kota / kecamatan / desa…" autocomplete="off"><div class="pqb-row"><button class="pqb-btn" data-a="online">🌐 Cari desa/kecamatan online</button></div><div id="pqbRes"></div>' +
        '<div class="pqb-h">Atau pilih langsung</div><div class="pqb-row"><select id="pqbLv"><option value="prov">Ketuk peta → Provinsi</option><option value="kab" selected>Ketuk peta → Kab/Kota</option><option value="kec">Ketuk peta → Kecamatan</option><option value="desa">Ketuk peta → Desa/Kelurahan</option></select><button class="pqb-btn" data-a="pick">📍 Ketuk peta</button></div>' +
        '<div class="pqb-row"><button class="pqb-btn" data-a="file">📂 Impor GeoJSON</button></div><input type="file" id="pqbF" accept=".geojson,.json,application/geo+json,application/json" style="display:none">' +
        '<div class="pqb-h">Wilayah berwarna <span id="pqbC"></span></div><div id="pqbL"></div>' +
        '<div class="pqb-ft"><label><input type="checkbox" id="pqbTop"> Warna di atas jalan</label><button class="pqb-btn" data-a="hideall">Sembunyikan semua</button><button class="pqb-btn" data-a="clr">Hapus semua</button></div></div>';
      document.body.appendChild(DLG);
      DLG.addEventListener("click", onClick); DLG.addEventListener("input", onInput); DLG.addEventListener("change", e => { if (e.target.id === "pqbF") { onFile(e.target.files[0]); e.target.value = ""; } if (e.target.id === "pqbTop") { top = e.target.checked; save(); redraw(); } });
      DLG.addEventListener("keydown", e => { if (e.target.id === "pqbQ" && e.key === "Enter") online(e.target.value); });
    }
    DLG.style.display = ""; DLG.classList.remove("min"); $("pqbTop").checked = top; list(); badge();
    data(() => { const q = $("pqbQ"); q && q.value && onInput({ target: q }); });
  }
  function closeDlg() { if (DLG) DLG.style.display = "none"; }
  let tmr = 0;
  function onInput(e) {
    const t = e.target;
    if (t.id === "pqbQ") { clearTimeout(tmr); tmr = setTimeout(() => { const q = t.value; if (!q.trim()) { $("pqbRes").innerHTML = ""; return; } data(() => { found = []; resFill(localFind(q), [], 0); }); }, 150); return; }
    const id = +t.dataset.id, it = items.filter(x => x.id === id)[0]; if (!it) return;
    if (t.dataset.a === "col") { it.color = t.value; if (it._g) { it._g.setStyle({ color: it.color, fillColor: it.color }); } const r = t.closest(".pqb-it"); r && r.style.setProperty("--c", it.color); save(); }
    if (t.dataset.a === "op") { it.op = t.value / 100; const p = map.getPane("pqb_" + it.id); if (p) p.style.opacity = it.op; save(); }
  }
  function onClick(e) {
    const b = e.target.closest("[data-a]"); if (!b || b.tagName === "INPUT") return; const a = b.dataset.a, id = +b.dataset.id, it = items.filter(x => x.id === id)[0];
    if (a === "x") closeDlg(); else if (a === "min") DLG.classList.toggle("min");
    else if (a === "online") online($("pqbQ").value);
    else if (a === "pick") pick($("pqbLv").value);
    else if (a === "file") $("pqbF").click();
    else if (a === "addP1" || a === "addPK" || a === "addK") { const loc = $("pqbRes")._loc || [], en = loc[+b.dataset.i]; if (en) addLocal(en, a === "addPK" ? "each" : "one"); }
    else if (a === "addO") { const r = found[+b.dataset.i]; if (r) addOnline(r); }
    else if (a === "clr") { if (items.length && confirm("Hapus semua blok warna wilayah?")) items.slice().forEach(i => rm(i.id)); }
    else if (a === "hideall") { const v = items.some(i => i.on); items.forEach(i => i.on = !v); save(); redraw(); list(); badge(); }
    else if (it) {
      if (a === "eye") { it.on = !it.on; draw(it, items.indexOf(it)); save(); list(); badge(); }
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
  const badge = () => { const n = items.filter(i => i.on).length; const el = $("pqbN"); if (el) el.textContent = n ? " · " + n + " aktif" : ""; };
  window.PETAQU_BLOK = { open: openDlg, close: closeDlg, count: () => items.filter(i => i.on).length, rows: () => [{ id: "blok", name: "Blok warna wilayah", ic: "\u25A8", c: "#f59e0b", on: items.some(i => i.on) }], cancel: cancelPick };
  document.addEventListener("keydown", e => { if (e.key === "Escape") cancelPick(); });
  items.length ? restore() : 0;
})();
