/* PETAQU Gempa & Tsunami: gempa seluruh Indonesia (BMKG + USGS) per provinsi/kabupaten-kota, basemap Ring of Fire,
   penilaian potensi tsunami + animasi gelombang & radius terdampak (indikatif; resmi: BMKG InaTEWS). */
(function () {
  "use strict";
  const $ = id => document.getElementById(id), DEG = Math.PI / 180, V = 10.3; /* km/menit ~620 km/jam laut dalam */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = m => { try { toast(m, 3200); } catch (e) { } };
  let EV = [], KAB = null, G, RF, HL, sel = null, cv, ctx, raf = 0, T0 = 0, P, CUR = [], F = { d: 7, m: 4, p: "", k: "" }, timer;
  const hav = (a, b, c, d) => { const x = Math.sin((c - a) * DEG / 2) ** 2 + Math.cos(a * DEG) * Math.cos(c * DEG) * Math.sin((d - b) * DEG / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  function dec(s) { let i = 0, la = 0, lo = 0, o = []; while (i < s.length) { let b, sh = 0, r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); la += r & 1 ? ~(r >> 1) : r >> 1; sh = 0; r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lo += r & 1 ? ~(r >> 1) : r >> 1; o.push([la / 1e5, lo / 1e5]); } return o; }
  function kabs() {
    if (KAB) return KAB; KAB = []; const D = window.PQ_KABBATAS || {};
    for (const p in D) D[p].forEach(k => { const rings = k[1].map(dec); let s = 90, w = 180, n = -90, e = -180; rings.forEach(r => r.forEach(q => { if (q[0] < s) s = q[0]; if (q[0] > n) n = q[0]; if (q[1] < w) w = q[1]; if (q[1] > e) e = q[1]; })); KAB.push({ p, n: k[0], rings, bb: [s, w, n, e], c: [(s + n) / 2, (w + e) / 2] }); });
    return KAB;
  }
  function pip(r, la, lo) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > lo) !== (b[1] > lo) && la < (b[0] - a[0]) * (lo - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function locate(e) {
    const K = kabs(); let best = null, bd = 1e9;
    for (const k of K) {
      const b = k.bb; if (e.lat >= b[0] && e.lat <= b[2] && e.lng >= b[1] && e.lng <= b[3]) { let c = false; k.rings.forEach(r => { if (pip(r, e.lat, e.lng)) c = !c; }); if (c) { e.prov = k.p; e.reg = k.n; e.off = false; e.nd = 0; return; } }
      const d = hav(e.lat, e.lng, k.c[0], k.c[1]); if (d < bd) { bd = d; best = k; }
    }
    if (best) { e.prov = best.p; e.reg = best.n; e.nd = bd; } e.off = true;
  }
  function coastKm(e) { let b = 1e9; kabs().forEach(k => { if (hav(e.lat, e.lng, k.c[0], k.c[1]) > 900) return; k.rings.forEach(r => r.forEach(q => { const d = hav(e.lat, e.lng, q[0], q[1]); if (d < b) b = d; })); }); return b; }
  function assess(e) {
    const m = e.m, d = e.d, off = e.off !== false; let lv = 0;
    if (off && d <= 100) { if (m >= 7.5) lv = 3; else if (m >= 7) lv = 2; else if (m >= 6.5 && d <= 60) lv = 1; }
    return { lv, rs: Math.pow(10, .4 * m - 1), rf: Math.pow(10, .5 * m - 1), rt: lv ? Math.max(60, Math.pow(10, .75 * m - 3.1)) : 0 };
  }
  const LV = [["Tidak berpotensi tsunami", "#34d399"], ["Waspada tsunami", "#facc15"], ["Berpotensi tsunami", "#fb923c"], ["Potensi tsunami TINGGI", "#f43f5e"]];
  const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 6e4)); return m < 60 ? m + " mnt lalu" : m < 1440 ? Math.round(m / 60) + " jam lalu" : Math.round(m / 1440) + " hari lalu"; };

  /* ---------- data ---------- */
  function add(list, e) { if (isNaN(e.t) || isNaN(e.lat) || isNaN(e.lng) || isNaN(e.m)) return; if (list.some(x => Math.abs(x.t - e.t) < 12e4 && hav(x.lat, x.lng, e.lat, e.lng) < 150)) return; list.push(e); }
  async function load() {
    const iso = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19), out = [];
    const U = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=-12.5&maxlatitude=7.5&minlongitude=94&maxlongitude=142&minmagnitude=3.5&orderby=time&limit=2500&starttime=" + iso;
    const B = ["gempaterkini", "gempadirasakan"].map(n => fetch("https://data.bmkg.go.id/DataMKG/TEWS/" + n + ".json").then(r => r.json()));
    const [u, ...b] = await Promise.allSettled([fetch(U).then(r => r.json()), ...B]);
    b.forEach(r => { if (r.status === "fulfilled") ((r.value.Infogempa || {}).gempa || []).forEach(g => { const c = String(g.Coordinates || "").split(",").map(Number); add(out, { t: Date.parse(g.DateTime), lat: c[0], lng: c[1], m: +g.Magnitude, d: parseFloat(g.Kedalaman) || 10, src: "BMKG", place: g.Wilayah || "", felt: g.Dirasakan || "" }); }); });
    if (u.status === "fulfilled") (u.value.features || []).forEach(f => { const c = f.geometry.coordinates, p = f.properties; add(out, { t: p.time, lat: c[1], lng: c[0], m: +p.mag, d: Math.max(1, c[2] || 10), src: "USGS", place: p.place || "", felt: "" }); });
    if (out.length) { out.forEach(locate); out.sort((a, b) => b.t - a.t); EV = out; try { localStorage.setItem("pq_gempa", JSON.stringify(out)); } catch (e) { } }
    else { try { EV = JSON.parse(localStorage.getItem("pq_gempa") || "[]"); } catch (e) { EV = []; } say(EV.length ? "Offline: menampilkan data gempa tersimpan" : "Gagal memuat data gempa (BMKG/USGS)"); }
    refresh();
  }
  const filt = () => { const lim = Date.now() - F.d * 864e5; return EV.filter(e => e.t >= lim && e.m >= F.m && (!F.p || e.prov === F.p) && (!F.k || e.reg === F.k)); };

  /* ---------- peta ---------- */
  function refresh() {
    if (!G) return; G.clearLayers(); CUR = filt();
    CUR.forEach(e => { const col = e.d < 70 ? "#f43f5e" : e.d < 300 ? "#fb923c" : "#60a5fa"; L.circleMarker([e.lat, e.lng], { radius: 3 + e.m * 1.5, color: "#fff", weight: e === sel ? 3 : 1, fillColor: col, fillOpacity: .72, className: Date.now() - e.t < 864e5 ? "pqg-new" : "" }).on("click", () => pick(e, true)).addTo(G); });
    render();
  }
  function pick(e, fly) {
    sel = e; e._a = assess(e); if (e._a.lv) e._ck = e._ck || coastKm(e); T0 = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
    if (fly) { const R = Math.max(e._a.rt, e._a.rf * 1.2, 30); try { map.flyToBounds(L.circle([e.lat, e.lng], { radius: R * 1e3 }).getBounds(), { maxZoom: 10, padding: [30, 30], duration: 1 }); } catch (x) { } }
    render();
  }
  function frame(ts) {
    if (!sel) { ctx && ctx.clearRect(0, 0, cv.width, cv.height); raf = 0; return; }
    const c = map.getContainer(), dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px"; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const p = map.latLngToContainerPoint([sel.lat, sel.lng]), mpp = 40075016.686 * Math.cos(sel.lat * DEG) / (256 * Math.pow(2, map.getZoom())), px = k => k * 1e3 / mpp, A = sel._a, t = (ts - T0) / 1e3;
    const circ = (r, st, lw, dash) => { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(r, .1), 0, 6.2832); ctx.strokeStyle = st; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); };
    const lab = (s, x, y) => { ctx.font = "600 11.5px system-ui"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4; ctx.fillStyle = "#fff"; ctx.fillText(s, x, y); ctx.shadowBlur = 0; };
    if (A.lv) { /* tsunami: gelombang menjalar */
      const R = px(A.rt); ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 6.2832); ctx.fillStyle = "rgba(34,211,238,.07)"; ctx.fill(); circ(R, "rgba(34,211,238,.8)", 1.5, [8, 6]); lab("Jangkauan tsunami \u2248 " + Math.round(A.rt) + " km", p.x + R * .71 + 6, p.y - R * .71);
      for (let k = 0; k < 3; k++) { const ph = (t / 10 + k / 3) % 1, r = ph * R; circ(r, "rgba(34,211,238," + (.95 * (1 - ph)).toFixed(2) + ")", 1 + 5 * (1 - ph)); if (k === 0 && ph > .04) lab("T+" + Math.round(ph * A.rt / V) + " mnt", p.x - r * .71 - 46, p.y + r * .71); }
    }
    const rs = px(A.rs), g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(rs, 1)); g.addColorStop(0, "rgba(244,63,94,.5)"); g.addColorStop(1, "rgba(244,63,94,.06)");
    ctx.beginPath(); ctx.arc(p.x, p.y, rs * (1 + .03 * Math.sin(t * 9)), 0, 6.2832); ctx.fillStyle = g; ctx.fill(); circ(rs, "rgba(244,63,94,.9)", 1.5);
    circ(px(A.rf), "rgba(251,146,60,.85)", 1.5, [4, 5]); lab("Terasa \u2248 " + Math.round(A.rf) + " km", p.x + px(A.rf) * .71 + 6, p.y + px(A.rf) * .71);
    for (let k = 0; k < 2; k++) { const ph = (t / 2 + k / 2) % 1; circ(4 + ph * 34, "rgba(255,255,255," + (.9 * (1 - ph)).toFixed(2) + ")", 2); }
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 6.2832); ctx.fillStyle = "#fff"; ctx.fill(); circ(5, "#f43f5e", 2.5);
    raf = requestAnimationFrame(frame);
  }

  /* ---------- Ring of Fire ---------- */
  const FL = [["Palung Sunda (megathrust)", [[5.5, 92.5], [3, 94], [0, 97], [-3, 99.8], [-6, 102.5], [-8.5, 105.5], [-10.3, 108.5], [-11, 112], [-11.1, 115], [-10.9, 118], [-10.7, 121], [-10.5, 123.5], [-9.5, 126], [-8, 129], [-6.5, 131]]], ["Sesar Besar Sumatra", [[5.3, 95.5], [3.5, 97.5], [1.5, 99], [-.5, 100.5], [-2.5, 101.5], [-4.5, 102.6], [-5.9, 104.3]]], ["Busur belakang Flores", [[-7.8, 113], [-8.2, 116], [-8.3, 119], [-8.2, 122]]], ["Sesar Palu-Koro", [[-.5, 119.8], [-1.6, 120.1], [-3, 120.5]]], ["Tumbukan Laut Maluku", [[3, 126.5], [0, 126.2], [-1, 125.5]]], ["Palung Sulawesi Utara", [[2.5, 123.5], [1.5, 122], [.5, 121]]], ["Sesar Sorong", [[-.9, 130.8], [-1, 132.5], [-1.2, 134.5], [-1.3, 136]]], ["Palung Papua", [[-.5, 133], [-.2, 135.5], [-1, 138]]]];
  const VOL = [["Krakatau", -6.1, 105.42], ["Merapi", -7.54, 110.44], ["Bromo", -7.94, 112.95], ["Semeru", -8.11, 112.92], ["Agung", -8.34, 115.51], ["Rinjani", -8.41, 116.47], ["Tambora", -8.25, 118], ["Sinabung", 3.17, 98.39], ["Kerinci", -1.7, 101.26], ["Marapi", -.38, 100.47], ["Slamet", -7.24, 109.21], ["Raung", -8.12, 114.04], ["Ijen", -8.06, 114.24], ["Kelud", -7.93, 112.31], ["Gede", -6.78, 106.98], ["Lokon", 1.36, 124.79], ["Ruang", 2.3, 125.37], ["Ibu", 1.49, 127.63], ["Dukono", 1.69, 127.89], ["Soputan", 1.11, 124.73]];
  function rof(on) {
    if (!RF) {
      RF = L.layerGroup(); L.polyline([[5.5, 95.5], [0, 100], [-5.5, 104.5], [-8, 112], [-8.4, 118], [-8.3, 123], [-6.5, 129], [-3, 129], [1, 126.5], [3, 125.5]], { color: "#fb923c", weight: 46, opacity: .13, lineCap: "round", interactive: false }).addTo(RF);
      FL.forEach(f => L.polyline(f[1], { color: "#f43f5e", weight: 3, className: "pqg-flow" }).bindTooltip(f[0] + " (skematis)").addTo(RF));
      VOL.forEach(v => L.circleMarker([v[1], v[2]], { radius: 5, color: "#fbbf24", weight: 4, fillColor: "#f97316", fillOpacity: 1, className: "pqg-vol" }).bindTooltip("\u{1F30B} G. " + v[0]).addTo(RF));
    }
    on ? RF.addTo(map) : map.removeLayer(RF); const c = $("pqgRof"); if (c) c.checked = !!on;
  }

  /* ---------- panel ---------- */
  function render() {
    if (!P || P.style.display === "none") return; const b = $("pqgBody"), n = CUR.length, mx = CUR.reduce((a, e) => e.m > a.m ? e : a, { m: 0 });
    const warn = EV.filter(e => Date.now() - e.t < 864e5 && assess(e).lv).sort((a, c) => c.m - a.m)[0];
    const cnt = {}; CUR.forEach(e => { const k = F.p ? e.reg : e.prov; if (k) cnt[k] = (cnt[k] || 0) + 1; });
    const top = Object.entries(cnt).sort((a, c) => c[1] - a[1]).slice(0, 6);
    let h = "";
    if (warn) h += '<div class="pqg-warn" data-w="1">\u26A0 24 jam terakhir: M' + warn.m.toFixed(1) + " " + esc(warn.reg || "") + " \u2014 " + LV[assess(warn).lv][0] + " (ketuk)</div>";
    h += '<div class="pqg-st"><b>' + n + "</b> gempa &middot; terkuat <b>M" + (mx.m ? mx.m.toFixed(1) : "-") + "</b>" + (top.length ? "<div class='pqg-ch'>" + top.map(x => "<span data-r='" + esc(x[0]) + "'>" + esc(x[0].replace("Kabupaten ", "Kab. ")) + " " + x[1] + "</span>").join("") + "</div>" : "") + "</div>";
    if (sel) { const A = sel._a || assess(sel), l = LV[A.lv]; h += '<div class="pqg-dt" style="border-color:' + l[1] + '"><b style="color:' + l[1] + '">' + l[0] + "</b><br>M" + sel.m.toFixed(1) + " &middot; kedalaman " + Math.round(sel.d) + " km &middot; " + new Date(sel.t).toLocaleString("id-ID") + " (" + ago(sel.t) + ")<br>" + (sel.off ? "Lepas pantai, terdekat " + esc(sel.reg || "") + ", " + esc(sel.prov || "") + " \u00B1" + Math.round(sel.nd || 0) + " km" : esc(sel.reg) + ", " + esc(sel.prov)) + "<br><span style='color:#9fb6c3'>" + esc(sel.place) + " (" + sel.src + ")</span><br>Guncangan kuat \u2248 " + Math.round(A.rs) + " km &middot; terasa \u2248 " + Math.round(A.rf) + " km" + (A.lv ? " &middot; jangkauan tsunami \u2248 " + Math.round(A.rt) + " km<br>Perkiraan tiba di pantai terdekat: ~" + Math.max(1, Math.round((sel._ck || 0) / V)) + " menit (laut dalam, indikatif)" : "") + '<br><button class="pqg-b" data-a="rep">\u25B6 Ulang animasi</button> <button class="pqg-b" data-a="off">Tutup</button></div>'; }
    h += '<div class="pqg-ls">' + CUR.slice(0, 80).map((e, i) => { const l = LV[assess(e).lv]; return '<div class="pqg-it" data-i="' + i + '"><b style="color:' + (e.m >= 6 ? "#f43f5e" : e.m >= 5 ? "#fb923c" : "#e6f1f7") + '">M' + e.m.toFixed(1) + "</b> " + esc(e.reg || "-") + ", " + esc((e.prov || "").replace("Papua", "Papua")) + "<small>" + ago(e.t) + " &middot; " + Math.round(e.d) + " km" + (e.off ? " &middot; laut" : "") + "</small>" + (assess(e).lv ? '<i style="background:' + l[1] + '">TSUNAMI</i>' : "") + "</div>"; }).join("") + (n > 80 ? "<div style='padding:6px;color:#9fb6c3'>+" + (n - 80) + " lagi \u2014 persempit filter</div>" : "") + (n ? "" : "<div style='padding:10px;color:#9fb6c3'>Tidak ada gempa pada filter ini.</div>") + "</div>";
    b.innerHTML = h;
    b.querySelectorAll(".pqg-it").forEach(x => x.onclick = () => pick(CUR[+x.dataset.i], true));
    b.querySelectorAll("[data-r]").forEach(x => x.onclick = () => { if (F.p) { F.k = x.dataset.r; $("pqgK").value = F.k; kabFocus(); } else { F.p = x.dataset.r; $("pqgP").value = F.p; fillK(); provFocus(); } refresh(); });
    const w = b.querySelector("[data-w]"); if (w) w.onclick = () => { F.d = 30; F.m = 3.5; F.p = F.k = ""; sync(); pick(EV.filter(e => Date.now() - e.t < 864e5 && assess(e).lv).sort((a, c) => c.m - a.m)[0], true); refresh(); };
    const rp = b.querySelector("[data-a=rep]"); if (rp) rp.onclick = () => { T0 = performance.now(); if (!raf) raf = requestAnimationFrame(frame); };
    const of = b.querySelector("[data-a=off]"); if (of) of.onclick = () => { sel = null; refresh(); };
  }
  function fillK() { const k = $("pqgK"); k.innerHTML = '<option value="">Semua kabupaten/kota</option>' + kabs().filter(x => x.p === F.p).map(x => "<option>" + esc(x.n) + "</option>").join(""); k.disabled = !F.p; F.k = ""; }
  function sync() { $("pqgD").value = F.d; $("pqgM").value = F.m; $("pqgP").value = F.p; fillK(); }
  function hl(rings, fit) { if (HL) map.removeLayer(HL); HL = L.polygon(rings, { color: "#22d3ee", weight: 2, fillOpacity: .08, interactive: false }).addTo(map); if (fit) map.fitBounds(HL.getBounds(), { padding: [30, 30], maxZoom: 11 }); }
  function provFocus() { const a = kabs().filter(x => x.p === F.p); if (a.length) hl(a.flatMap(x => x.rings), true); }
  function kabFocus() { const k = kabs().find(x => x.p === F.p && x.n === F.k); if (k) hl(k.rings, true); }
  function build() {
    const css = document.createElement("style"); css.textContent = ".pqg-new{animation:pqgp 1.6s ease-out infinite}@keyframes pqgp{0%{stroke-width:1;stroke-opacity:1}100%{stroke-width:14;stroke-opacity:0}}.pqg-flow{stroke-dasharray:10 8;animation:pqgf 1.2s linear infinite}@keyframes pqgf{to{stroke-dashoffset:-36}}.pqg-vol{animation:pqgv 2s ease-in-out infinite}@keyframes pqgv{50%{stroke-width:10;stroke-opacity:.15}}" +
      "#pqgPanel{position:fixed;z-index:2950;top:70px;right:12px;width:340px;max-height:calc(100% - 100px);display:none;flex-direction:column;background:#071a26f2;color:#e6f1f7;border:1px solid #22d3ee55;border-radius:12px;font:12.5px system-ui;box-shadow:0 6px 24px #000a}#pqgPanel header{display:flex;align-items:center;gap:6px;padding:8px 10px;font-weight:700;border-bottom:1px solid #ffffff18}#pqgPanel header span{flex:1}#pqgPanel header button{background:none;border:0;color:#9fb6c3;font-size:16px;cursor:pointer}.pqg-ct{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px 10px}.pqg-ct select{background:#0b2736;color:#e6f1f7;border:1px solid #ffffff22;border-radius:6px;padding:5px;min-width:0}.pqg-ct label{grid-column:1/3;display:flex;gap:6px;align-items:center}#pqgBody{overflow:auto;padding:0 10px 10px}.pqg-st{padding:4px 0}.pqg-ch{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}.pqg-ch span{background:#0e7490;border-radius:10px;padding:2px 8px;cursor:pointer;font-size:11.5px}.pqg-warn{background:#7f1d1d;border:1px solid #f43f5e;border-radius:8px;padding:6px 8px;margin:4px 0;cursor:pointer;animation:pqgw 1.2s infinite}@keyframes pqgw{50%{background:#450a0a}}.pqg-dt{border-left:4px solid;background:#0b2736;border-radius:8px;padding:8px;margin:6px 0;line-height:1.5}.pqg-b{background:#0e7490;color:#fff;border:0;border-radius:6px;padding:4px 9px;margin-top:5px;cursor:pointer}.pqg-it{padding:6px 4px;border-bottom:1px solid #ffffff12;cursor:pointer;position:relative}.pqg-it:hover{background:#0b2736}.pqg-it small{display:block;color:#9fb6c3}.pqg-it i{position:absolute;right:4px;top:7px;font-style:normal;font-size:10px;color:#000;border-radius:8px;padding:1px 6px;font-weight:700}@media(max-width:860px){#pqgPanel{left:6px;right:6px;top:auto;bottom:6px;width:auto;max-height:52vh}}";
    document.head.appendChild(css);
    P = document.createElement("div"); P.id = "pqgPanel";
    P.innerHTML = '<header><i class="fa-solid fa-water" style="color:#22d3ee"></i><span>Gempa & Tsunami Indonesia</span><button id="pqgR" title="Segarkan">\u21BB</button><button id="pqgX" title="Tutup">\u2715</button></header><div class="pqg-ct"><select id="pqgD"><option value="1">24 jam</option><option value="7">7 hari</option><option value="30">30 hari</option></select><select id="pqgM"><option value="3.5">M \u2265 3.5</option><option value="4">M \u2265 4</option><option value="5">M \u2265 5</option><option value="6">M \u2265 6</option></select><select id="pqgP"></select><select id="pqgK" disabled></select><label><input type="checkbox" id="pqgRof"> Cincin Api (sesar, palung, gunung api)</label></div><div id="pqgBody">Memuat data gempa\u2026</div>';
    document.body.appendChild(P);
    $("pqgP").innerHTML = '<option value="">Semua provinsi</option>' + Object.keys(window.PQ_KABBATAS || {}).sort().map(p => "<option>" + esc(p) + "</option>").join("");
    $("pqgD").onchange = e => { F.d = +e.target.value; refresh(); }; $("pqgM").onchange = e => { F.m = +e.target.value; refresh(); };
    $("pqgP").onchange = e => { F.p = e.target.value; fillK(); if (F.p) provFocus(); else if (HL) map.removeLayer(HL); refresh(); };
    $("pqgK").onchange = e => { F.k = e.target.value; F.k ? kabFocus() : provFocus(); refresh(); };
    $("pqgRof").onchange = e => rof(e.target.checked);
    $("pqgR").onclick = () => { $("pqgBody").innerHTML = "Memuat\u2026"; load(); }; $("pqgX").onclick = close;
    $("pqgD").value = F.d; $("pqgM").value = F.m;
  }
  function open() {
    if (!P) build(); if (!G) { G = L.layerGroup().addTo(map); cv = document.createElement("canvas"); cv.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;z-index:450"; map.getContainer().appendChild(cv); ctx = cv.getContext("2d"); }
    P.style.display = "flex"; map.hasLayer(G) || G.addTo(map); EV.length ? refresh() : load(); clearInterval(timer); timer = setInterval(() => { if (P.style.display !== "none") load(); }, 3e5);
  }
  function close() { P.style.display = "none"; sel = null; clearInterval(timer); if (G) map.removeLayer(G); if (HL) map.removeLayer(HL); }

  function init() {
    try { BASEMAPS.push({ id: "ring_of_fire", icon: "\u{1F30B}", label: "Ring of Fire (Cincin Api)", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", opts: { maxZoom: 19, subdomains: "abcd", attribution: "&copy; OpenStreetMap &copy; CARTO" } }); renderBasemapList(); const o = window.switchBasemap; window.switchBasemap = function (e) { const r = o.apply(this, arguments); try { rof(e === "ring_of_fire"); } catch (x) { } return r; }; if (typeof currentBaseId !== "undefined" && currentBaseId === "ring_of_fire") rof(true); } catch (e) { console.warn("Basemap Ring of Fire gagal:", e); }
    const b = document.createElement("button"); b.innerHTML = '<i class="fa-solid fa-water"></i>'; b.title = "Gempa & potensi tsunami"; b.onclick = open;
    const put = () => { try { PQ_DOCK.adopt(b, "Gempa & Tsunami"); } catch (e) { b.style.cssText = "position:fixed;left:10px;bottom:220px;z-index:900"; document.body.append(b); } };
    typeof PQ_DOCK !== "undefined" ? put() : setTimeout(put, 900);
  }
  window.PETAQU_GEMPA = { open, close, _loc: e => { locate(e); return e; }, _assess: assess };
  if (typeof document !== "undefined" && document.readyState !== undefined) document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
