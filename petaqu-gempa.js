/* PETAQU Gempa & Tsunami: gempa seluruh Indonesia (BMKG + USGS) per provinsi/kabupaten-kota, basemap Ring of Fire,
   penilaian potensi tsunami + animasi gelombang & radius terdampak (indikatif; resmi: BMKG InaTEWS). */
(function () {
  "use strict";
  const $ = id => document.getElementById(id), DEG = Math.PI / 180, V = 10.3; /* km/menit ~620 km/jam laut dalam */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = m => { try { toast(m, 3200); } catch (e) { } };
  let RP = null, EV = [], KAB = null, G, RF, HL, sel = null, cv, ctx, raf = 0, T0 = 0, P, CUR = [], F = { d: 7, m: 4, p: "", k: "", r: true }, MIN = false, MK = null, MM = null, MKey = "", TM = "off", TO = .6, timer;
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

  const ZN = e => e.lng < 115.5 ? ["WIB", "Asia/Jakarta"] : e.lng < 129 ? ["WITA", "Asia/Makassar"] : ["WIT", "Asia/Jayapura"];
  const dCat = d => d < 70 ? "dangkal" : d < 300 ? "menengah" : "dalam";
  function when(e) { const z = ZN(e); let a; try { a = new Date(e.t).toLocaleString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: z[1] }).replace(/\./g, ":"); } catch (x) { a = new Date(e.t).toLocaleString("id-ID"); } return a + " " + z[0] + " (" + new Date(e.t).toISOString().slice(11, 19) + " UTC)"; }
  function short(e) { const z = ZN(e); try { return new Date(e.t).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: z[1] }).replace(/\./g, ":").replace(",", "") + " " + z[0]; } catch (x) { return ""; } }
  function info(e) {
    const A = assess(e), l = LV[A.lv];
    return '<div style="font:12.5px/1.55 system-ui;color:#0b1a24;min-width:220px"><b style="font-size:16px">M' + e.m.toFixed(1) + '</b> <span style="background:' + l[1] + ';border-radius:8px;padding:1px 7px;font-size:10.5px;font-weight:700">' + l[0] + '</span><br>\u{1F550} ' + when(e) + '<br>\u23F3 ' + ago(e.t) + '<br>\u{1F4CD} ' + esc(e.off ? "Lepas pantai, dekat " + (e.reg || "") + ", " + (e.prov || "") : (e.reg || "") + ", " + (e.prov || "")) + '<br>\u2B07 Kedalaman ' + Math.round(e.d) + ' km (' + dCat(e.d) + ')<br>\u{1F9ED} ' + e.lat.toFixed(3) + '\u00B0, ' + e.lng.toFixed(3) + '\u00B0<br>\u{1F4E1} ' + e.src + (e.place ? ' \u00B7 ' + esc(e.place) : '') + (e.felt ? '<br>\u{1F4E3} Dirasakan: ' + esc(e.felt) : '') + '<br>\u25CE Guncangan kuat \u2248 ' + Math.round(A.rs) + ' km \u00B7 terasa \u2248 ' + Math.round(A.rf) + ' km' + (A.lv ? ' \u00B7 tsunami \u2248 ' + Math.round(A.rt) + ' km' : '') + '</div>';
  }
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
  function applyMask() { /* transparansi (peredupan) area di luar provinsi / kab-kota terpilih */
    const key = TM + "|" + F.p + "|" + F.k; if (key === MKey) return; MKey = key;
    if (MK) { map.removeLayer(MK); MK = null; MM = null; } if (TM === "off") return;
    let rings = [];
    if (TM === "p" && F.p) rings = kabs().filter(x => x.p === F.p).flatMap(x => x.rings);
    else if (TM === "k" && F.p && F.k) { const k = kabs().find(x => x.p === F.p && x.n === F.k); if (k) rings = k.rings; }
    if (!rings.length) return;
    if (!map.getPane("pqgMask")) { const pn = map.createPane("pqgMask"); pn.style.zIndex = 395; pn.style.pointerEvents = "none"; }
    const m = L.polygon([[[-85, -180], [-85, 180], [85, 180], [85, -180]]].concat(rings), { pane: "pqgMask", stroke: false, fillColor: "#020b14", fillOpacity: 0, interactive: false, className: "pqg-mask" }),
      o = L.polygon(rings, { color: "#22d3ee", weight: 2.5, fill: false, interactive: false, className: "pqg-flow" });
    MK = L.layerGroup([m, o]).addTo(map); MM = m; setTimeout(() => { if (MM === m) m.setStyle({ fillOpacity: TO }); }, 30);
  }
  function refresh() {
    if (!G) return; applyMask(); G.clearLayers(); CUR = filt(); { const tn = performance.now(); CUR.forEach((e, i) => e._b = tn + Math.min(i, 70) * 35); } go();
    if (F.r) CUR.slice(0, 160).forEach(e => { const A = assess(e), c = e.d < 70 ? "#f43f5e" : e.d < 300 ? "#fb923c" : "#60a5fa"; L.circle([e.lat, e.lng], { radius: A.rf * 1e3, color: c, weight: 1, opacity: .5, dashArray: "4 6", fill: false, interactive: false, className: "pqg-rad" }).addTo(G); L.circle([e.lat, e.lng], { radius: A.rs * 1e3, color: c, weight: 1.2, opacity: .7, fillColor: c, fillOpacity: .08, interactive: false }).addTo(G); });
    CUR.forEach(e => { const col = e.d < 70 ? "#f43f5e" : e.d < 300 ? "#fb923c" : "#60a5fa"; L.circleMarker([e.lat, e.lng], { radius: 3 + e.m * 1.5, color: "#fff", weight: e === sel ? 3 : 1, fillColor: col, fillOpacity: .72, className: Date.now() - e.t < 864e5 ? "pqg-new" : "" }).on("click", () => pick(e, true)).bindTooltip("M" + e.m.toFixed(1) + " \u00B7 " + short(e), { sticky: true }).bindPopup(info(e), { maxWidth: 300, autoPan: false }).addTo(G); });
    render();
  }
  function pick(e, fly) {
    sel = e; e._a = assess(e); if (e._a.lv) e._ck = e._ck || coastKm(e); T0 = performance.now();
    go();
    if (fly) { const R = Math.max(e._a.rt, e._a.rf * 1.2, 30); try { map.flyToBounds(L.circle([e.lat, e.lng], { radius: R * 1e3 }).getBounds(), { maxZoom: 10, padding: [30, 30], duration: 1 }); } catch (x) { } }
    render();
  }
  function mkcv() { if (cv) return; cv = document.createElement("canvas"); cv.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;z-index:450"; map.getContainer().appendChild(cv); ctx = cv.getContext("2d"); }
  function go() { if (!raf && cv) raf = requestAnimationFrame(frame); }
  function frame(ts) {
    if (!cv || ((!P || P.style.display === "none") && !(RF && map.hasLayer(RF)))) { ctx && ctx.clearRect(0, 0, cv.width, cv.height); raf = 0; return; }
    const c = map.getContainer(), dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px"; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    try { ambient(ts, w, h); } catch (x) { }
    if (!sel || RP) { raf = requestAnimationFrame(frame); return; }
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


  /* ---------- animasi hidup: riak seismik semua gempa + replay waktu ---------- */
  const RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dcol = d => d < 70 ? [244, 63, 94] : d < 300 ? [251, 146, 60] : [96, 165, 250];
  const eo = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const rgba = (c, a) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + Math.max(0, a).toFixed(3) + ")";
  function ring(x, y, r, c, a, lw) { if (a <= .01 || r < .5) return; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.strokeStyle = rgba(c, a); ctx.lineWidth = lw; ctx.stroke(); }
  function glow(x, y, r, c, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
  function tag(s, x, y, a) { ctx.globalAlpha = a; ctx.font = "700 12px system-ui"; ctx.textAlign = "center"; ctx.shadowColor = "#000"; ctx.shadowBlur = 5; ctx.fillStyle = "#fff"; ctx.fillText(s, x, y); ctx.shadowBlur = 0; ctx.textAlign = "left"; ctx.globalAlpha = 1; }
  function ambient(ts, w, h) {
    if (RM && !RP) return;
    const z = map.getZoom(), zs = 1 + Math.max(0, z - 6) * .05, B = map.getBounds().pad(.15), now = Date.now(), sec = ts / 1e3;
    ctx.globalCompositeOperation = "lighter";
    if (RF && map.hasLayer(RF)) { try { rofDraw(sec, z, zs, B); } catch (x) { } }
    if (!P || P.style.display === "none") { ctx.globalCompositeOperation = "source-over"; return; }
    if (RP) return replayDraw(ts, w, h);
    let n = 0;
    for (const e of CUR) {
      if (n >= 130) break; if (!B.contains([e.lat, e.lng])) continue;
      const bt = (ts - (e._b || 0)) / 1e3; if (bt < 0) continue; n++;
      const p = map.latLngToContainerPoint([e.lat, e.lng]), age = now - e.t, f = age < 36e5 ? 1 : age < 216e5 ? .8 : age < 864e5 ? .58 : .3,
        c = dcol(e.d), m = e.m, R = (14 + m * 7.5) * zs, hs = ((e.t / 1e3 | 0) % 997) / 997, isSel = e === sel;
      glow(p.x, p.y, R * .55 * (1 + .12 * Math.sin(sec * 3 + hs * 6)), c, (.22 + (m >= 5 ? .2 : 0)) * f);
      if (bt < 1.8) { const ph = bt / 1.8; ring(p.x, p.y, R * 2.8 * eo(ph), c, (1 - ph) * .95, 2.5 * (1 - ph) + .5); glow(p.x, p.y, R * 1.2 * (1 - ph) + 6, [255, 255, 255], (1 - ph) * .45); }
      if (isSel) continue;
      for (let k = 0; k < 2; k++) { /* gelombang P (cepat) & S (lambat) */
        const per = (k ? 4.6 : 2.7) * (1.5 - f * .5), ph = (sec / per + hs + k * .41) % 1;
        ring(p.x, p.y, R * eo(ph * 1.05), c, f * (k ? .55 : .8) * Math.pow(1 - ph, 1.6), (k ? 2.2 : 1.2) + m * .12 * (1 - ph));
      }
      if (age < 36e5) { const ph = (sec / 6 + hs) % 1; ring(p.x, p.y, R * 2.3 * eo(ph), [255, 255, 255], .5 * (1 - ph), 1.5); }
      if (m >= 5.5 && age < 864e5) tag("M" + m.toFixed(1), p.x, p.y - R * .6 - 6, .85 * f);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  function replayDraw(ts, w, h) {
    const el = ts - RP.t0, k = Math.min(1, el / RP.dur), vt = RP.from + k * (RP.to - RP.from), sp = RP.dur / (RP.to - RP.from), B = map.getBounds().pad(.15);
    let cnt = 0, mx = 0, flash = 0;
    for (let i = CUR.length - 1; i >= 0; i--) {
      const e = CUR[i]; if (e.t > vt) continue; cnt++; if (e.m > mx) mx = e.m;
      const ag = (vt - e.t) * sp; if (!B.contains([e.lat, e.lng])) continue;
      const p = map.latLngToContainerPoint([e.lat, e.lng]), c = dcol(e.d), m = e.m, R = 16 + m * 9;
      const base = Math.max(.45, 1 - ag / 5e3);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2 + m * 1.1, 0, 6.2832); ctx.fillStyle = rgba(c, .75 * base); ctx.fill();
      if (ag < 2600) { const ph = ag / 2600; glow(p.x, p.y, R * 1.4 * (1 - ph * .5), c, .55 * (1 - ph)); ring(p.x, p.y, R * 2.6 * eo(ph), c, 1 - ph, 3 * (1 - ph) + .6); ring(p.x, p.y, R * 1.6 * eo(Math.min(1, ph * 1.4)), [255, 255, 255], .7 * (1 - ph), 1.5); if (m >= 5) tag("M" + m.toFixed(1), p.x, p.y - R * .7 - 8, 1 - ph * .6); }
      if (m >= 6 && ag < 300) flash = Math.max(flash, 1 - ag / 300);
    }
    ctx.globalCompositeOperation = "source-over";
    if (flash) { ctx.fillStyle = "rgba(255,255,255," + (.12 * flash).toFixed(3) + ")"; ctx.fillRect(0, 0, w, h); }
    const bw = Math.min(360, w - 40), bx = (w - bw) / 2, by = h - 56;
    ctx.fillStyle = "rgba(7,26,38,.88)"; ctx.fillRect(bx - 10, by - 44, bw + 20, 64);
    ctx.strokeStyle = "rgba(34,211,238,.5)"; ctx.lineWidth = 1; ctx.strokeRect(bx - 10, by - 44, bw + 20, 64);
    ctx.font = "700 14px system-ui"; ctx.fillStyle = "#fff"; ctx.fillText("\u23F1 " + new Date(vt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), bx, by - 22);
    ctx.font = "12px system-ui"; ctx.fillStyle = "#9fb6c3"; ctx.textAlign = "right"; ctx.fillText(cnt + " gempa \u00B7 terkuat M" + (mx ? mx.toFixed(1) : "-"), bx + bw, by - 22); ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff22"; ctx.fillRect(bx, by, bw, 5); const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, "#22d3ee"); gr.addColorStop(1, "#f43f5e"); ctx.fillStyle = gr; ctx.fillRect(bx, by, bw * k, 5);
    if (el > RP.dur + 2500) stopReplay();
  }
  function startReplay() {
    if (!CUR.length) return say("Tidak ada gempa pada filter ini"); sel = null;
    RP = { t0: performance.now(), from: Math.min.apply(null, CUR.map(e => e.t)), to: Date.now(), dur: 14000 };
    if (G && map.hasLayer(G)) map.removeLayer(G); const b = $("pqgRp"); if (b) b.textContent = "\u23F9 Hentikan replay"; go();
  }
  function stopReplay() { RP = null; if (G && !map.hasLayer(G)) G.addTo(map); const b = $("pqgRp"); if (b) b.textContent = "\u25B6 Putar ulang waktu"; refresh(); }

  /* ---------- Ring of Fire ---------- */
  const FC = { m: "#f43f5e", s: "#fb923c", t: "#c084fc", a: "#fbbf24" }, FR = { m: [244, 63, 94], s: [251, 146, 60], t: [192, 132, 252], a: [251, 191, 36] }, FS = { m: 28, s: 38, t: 22, a: 18 };
  const VOL = [["Seulawah Agam", 5.45, 95.66, 0, "S"], ["Peut Sague", 4.91, 96.33, 0, "S"], ["Bur Ni Telong", 4.77, 96.82, 0, "S"], ["Sinabung", 3.17, 98.39, 1, "S"], ["Sibayak", 3.23, 98.52, 0, "S"], ["Toba (kaldera)", 2.68, 98.88, 0, "S"], ["Sorik Marapi", .69, 99.54, 1, "S"], ["Marapi", -.38, 100.47, 1, "S"], ["Talang", -.98, 100.68, 0, "S"], ["Kerinci", -1.7, 101.26, 1, "S"], ["Kaba", -3.52, 102.62, 0, "S"], ["Dempo", -4.03, 103.13, 0, "S"], ["Krakatau (Anak)", -6.1, 105.42, 1, "S"], ["Salak", -6.72, 106.73, 0, "S"], ["Gede", -6.78, 106.98, 0, "S"], ["Tangkuban Parahu", -6.77, 107.6, 0, "S"], ["Papandayan", -7.32, 107.73, 0, "S"], ["Galunggung", -7.25, 108.06, 0, "S"], ["Ciremai", -6.89, 108.4, 0, "S"], ["Slamet", -7.24, 109.21, 1, "S"], ["Dieng", -7.2, 109.92, 0, "S"], ["Sundoro", -7.3, 109.99, 0, "S"], ["Sumbing", -7.38, 110.07, 0, "S"], ["Merbabu", -7.45, 110.43, 0, "S"], ["Merapi", -7.54, 110.44, 1, "S"], ["Lawu", -7.63, 111.19, 0, "S"], ["Wilis", -7.81, 111.76, 0, "S"], ["Kelud", -7.93, 112.31, 0, "S"], ["Arjuno-Welirang", -7.73, 112.58, 0, "S"], ["Bromo", -7.94, 112.95, 1, "S"], ["Semeru", -8.11, 112.92, 1, "S"], ["Lamongan", -8, 113.34, 0, "S"], ["Raung", -8.12, 114.04, 1, "S"], ["Ijen", -8.06, 114.24, 0, "S"], ["Batur", -8.24, 115.38, 0, "S"], ["Agung", -8.34, 115.51, 1, "S"], ["Rinjani", -8.41, 116.47, 1, "S"], ["Tambora", -8.25, 118, 0, "S"], ["Sangeang Api", -8.18, 119.06, 0, "S"], ["Inierie", -8.87, 120.98, 0, "S"], ["Ebulobo", -8.8, 121.18, 0, "S"], ["Paluweh (Rokatenda)", -8.32, 121.71, 1, "S"], ["Kelimutu", -8.77, 121.82, 0, "S"], ["Egon", -8.67, 122.45, 0, "S"], ["Lewotobi", -8.54, 122.77, 1, "S"], ["Ili Lewotolok", -8.27, 123.5, 1, "S"], ["Gunung Api Wetar", -6.64, 126.65, 0, "B"], ["Banda Api", -4.52, 129.87, 0, "B"], ["Soputan", 1.11, 124.73, 1, "M"], ["Lokon", 1.36, 124.79, 1, "M"], ["Mahawu", 1.36, 124.86, 0, "M"], ["Ruang", 2.3, 125.37, 1, "G"], ["Karangetang", 2.78, 125.4, 1, "G"], ["Awu", 3.68, 125.5, 0, "G"], ["Gamalama", .8, 127.33, 0, "H"], ["Gamkonora", 1.38, 127.53, 0, "H"], ["Ibu", 1.49, 127.63, 1, "H"], ["Dukono", 1.69, 127.89, 1, "H"]];
  const ARCN = { S: "Busur Vulkanik Sunda", B: "Busur Banda", M: "Busur Minahasa", G: "Busur Sangihe", H: "Busur Halmahera" };
  const FL = [
    ["Palung Sunda (megathrust)", [[5.8, 93.2], [4.5, 93.6], [3, 94.4], [1.5, 95.6], [0, 97.2], [-1.5, 98.4], [-3, 99.8], [-4.5, 101.3], [-6, 102.7], [-7.2, 104.2], [-8.3, 106.2], [-9.3, 108.2], [-10, 110], [-10.5, 111.8], [-10.8, 114], [-11, 116.2], [-10.9, 118.4], [-10.8, 120.4], [-10.6, 122.4], [-10.4, 123.8], [-9.9, 125.2], [-9, 126.5], [-8.2, 127.8], [-7.5, 129], [-6.5, 130.6]], "m", "Lempeng Indo-Australia menunjam \u2248 5\u20137 cm/tahun; sumber gempa M8\u20139 (2004, 2005, 2006)"],
    ["Sesar Besar Sumatra (Semangko)", [[5.3, 95.6], [4.6, 96.4], [3.8, 97.2], [2.7, 98.4], [1.8, 98.9], [.8, 99.6], [-.2, 100.4], [-1, 100.7], [-1.8, 101.2], [-2.7, 101.9], [-3.7, 102.3], [-4.6, 102.9], [-5.4, 103.9], [-5.9, 104.6]], "s", "Sesar geser menganan sepanjang \u2248 1.650 km"],
    ["Sesar Mentawai", [[-.5, 98.4], [-2, 99.6], [-3.4, 100.7]], "t", "Sesar naik di depan busur Sumatra"],
    ["Sesar Cimandiri\u2013Lembang", [[-6.95, 106.4], [-7.05, 107.2], [-6.83, 107.5], [-6.83, 107.8]], "s", "Sesar aktif Jawa Barat"],
    ["Sesar Baribis", [[-6.3, 107.2], [-6.5, 107.9], [-6.7, 108.6]], "t", "Sesar naik Jawa Barat"],
    ["Sesar Opak", [[-7.95, 110.3], [-7.75, 110.45]], "s", "Gempa Yogyakarta 2006"],
    ["Busur belakang Flores", [[-7.6, 113], [-8, 115], [-8.2, 117], [-8.3, 119.5], [-8.1, 122], [-8, 124]], "t", "Sesar naik busur belakang Bali\u2013Flores"],
    ["Sesar Palu-Koro", [[-.5, 119.8], [-1.2, 119.9], [-2, 120.1], [-3, 120.5], [-3.6, 121.2]], "s", "Gempa & tsunami Palu 2018"],
    ["Sesar Matano", [[-2.5, 121.2], [-2.6, 122.1]], "s", "Sesar geser Sulawesi Tengah"],
    ["Palung Sulawesi Utara", [[2.5, 123.5], [1.6, 122.2], [.9, 121.2]], "m", "Subduksi Laut Sulawesi"],
    ["Tumbukan Laut Maluku", [[3, 126.7], [1.5, 126.4], [0, 126.3], [-1, 125.7]], "t", "Tumbukan dua busur pulau"],
    ["Palung Filipina (selatan)", [[6, 127.2], [4, 127.5], [2.5, 127.4]], "m", "Subduksi Laut Filipina"],
    ["Sesar Sorong", [[-.9, 130.8], [-.95, 132], [-1.2, 133.8], [-1.3, 135.5], [-2, 137.5]], "s", "Sesar geser kiri Papua"],
    ["Palung Papua", [[-.5, 133], [-.2, 135.5], [-1, 138]], "m", "Subduksi Papua utara"],
    ["Palung Seram", [[-3.2, 128], [-3.8, 130]], "m", "Kompleks tumbukan Banda"]
  ];
  Object.keys(ARCN).forEach(g => { const p = VOL.filter(v => v[4] === g).map(v => [v[1], v[2]]); if (p.length > 1) FL.push([ARCN[g], p, "a", "Rantai gunung api hasil subduksi"]); });
  const PLT = [[-13.6, 99], [-13.2, 104], [-13.6, 109.5], [-13.8, 115], [-13.4, 120.5], [-12.8, 125]];
  function flowLine(f, B, sec, zs) {
    if (!f.bb) f.bb = L.latLngBounds(f[1]); if (!B.intersects(f.bb)) return;
    const Q = f[1].map(q => map.latLngToContainerPoint(q)), cum = [0]; for (let i = 1; i < Q.length; i++) cum.push(cum[i - 1] + Math.hypot(Q[i].x - Q[i - 1].x, Q[i].y - Q[i - 1].y));
    const Lt = cum[cum.length - 1]; if (Lt < 30) return; const c = FR[f[2]], n = Math.max(2, Math.round(Lt / 75)), dirs = f[2] === "s" ? [1, -1] : [1];
    dirs.forEach((dr, di) => { for (let k = 0; k < n; k++) {
      const u = (((sec * FS[f[2]] * dr / Lt + k / n + di * .5 / n) % 1) + 1) % 1, d = u * Lt; let j = 1; while (j < cum.length - 1 && cum[j] < d) j++;
      const a = Q[j - 1], b = Q[j], sl = cum[j] - cum[j - 1] || 1, tt = (d - cum[j - 1]) / sl; let x = a.x + (b.x - a.x) * tt, y = a.y + (b.y - a.y) * tt;
      if (f[2] === "s") { x += -(b.y - a.y) / sl * dr * 3.5; y += (b.x - a.x) / sl * dr * 3.5; }
      const fd = Math.sin(u * Math.PI); glow(x, y, 8 * zs, c, .85 * fd); ring(x, y, 1.8, [255, 255, 255], .9 * fd, 2);
    } });
  }
  function rofDraw(sec, z, zs, B) {
    FL.forEach(f => flowLine(f, B, sec, zs));
    VOL.forEach((v, i) => {
      if (!B.contains([v[1], v[2]])) return; const p = map.latLngToContainerPoint([v[1], v[2]]), h = (i * .137) % 1, fl = .75 + .25 * Math.sin(sec * 7 + h * 20) * Math.sin(sec * 3.1 + h * 9), ph = (sec / 3.2 + h) % 1;
      glow(p.x, p.y, (v[3] ? 17 : 10) * fl * zs, [255, 110, 30], v[3] ? .6 : .3);
      if (v[3]) { ring(p.x, p.y, 5 + ph * 24 * zs, [255, 170, 60], .6 * (1 - ph), 1.4); for (let k = 0; k < 3; k++) { const u = (sec * .55 + h + k / 3) % 1; glow(p.x + Math.sin(u * 9 + k * 2) * 5, p.y - 4 - u * 28, 3.2, [255, 205, 90], .9 * (1 - u)); } }
    });
    if (z <= 8) PLT.forEach((s0, i) => {
      if (!B.contains(s0)) return; const p = map.latLngToContainerPoint(s0), dx = Math.sin(.26), dy = -Math.cos(.26);
      for (let k = 0; k < 3; k++) { const u = (sec * .3 + k / 3) % 1, x = p.x + dx * u * 80, y = p.y + dy * u * 80, al = Math.sin(u * Math.PI) * .75;
        ctx.beginPath(); ctx.moveTo(x - dy * 9 - dx * 7, y + dx * 9 - dy * 7); ctx.lineTo(x + dx * 6, y + dy * 6); ctx.lineTo(x + dy * 9 - dx * 7, y - dx * 9 - dy * 7); ctx.strokeStyle = "rgba(34,211,238," + al.toFixed(2) + ")"; ctx.lineWidth = 2.2; ctx.stroke(); }
      if (i === 1 && z <= 6) tag("Lempeng Indo-Australia \u2191 \u2248 7 cm/th", p.x, p.y + 22, .8);
    });
  }
  function rof(on) {
    if (!RF) {
      RF = L.layerGroup();
      L.polyline([[5.5, 95.5], [0, 100], [-5.5, 104.5], [-8, 112], [-8.4, 118], [-8.3, 123], [-6.5, 129], [-3, 129], [1, 126.5], [3, 125.5]], { color: "#fb923c", weight: 80, opacity: .06, lineCap: "round", interactive: false }).addTo(RF);
      L.polyline([[5.5, 95.5], [0, 100], [-5.5, 104.5], [-8, 112], [-8.4, 118], [-8.3, 123], [-6.5, 129], [-3, 129], [1, 126.5], [3, 125.5]], { color: "#fb923c", weight: 40, opacity: .12, lineCap: "round", interactive: false }).addTo(RF);
      FL.forEach(f => { L.polyline(f[1], { color: FC[f[2]], weight: 10, opacity: .15, interactive: false }).addTo(RF); L.polyline(f[1], { color: FC[f[2]], weight: f[2] === "a" ? 2.5 : 3, className: "pqg-flow" }).bindTooltip("<b>" + f[0] + "</b><br>" + f[3] + " <i>(skematis)</i>", { sticky: true }).addTo(RF); });
      VOL.forEach(v => L.circleMarker([v[1], v[2]], { radius: v[3] ? 6 : 4, color: "#fbbf24", weight: 3, fillColor: "#f97316", fillOpacity: 1, className: "pqg-vol" }).bindTooltip("\u{1F30B} G. " + v[0] + (v[3] ? " \u2014 sering aktif" : "")).addTo(RF));
    }
    on ? RF.addTo(map) : map.removeLayer(RF); { const lg = $("pqgLg"); if (lg) lg.style.display = on ? "flex" : "none"; if (on) { mkcv(); go(); } } const c = $("pqgRof"); if (c) c.checked = !!on;
  }

  /* ---------- panel ---------- */
  function render() {
    if (!P || P.style.display === "none") return; const b = $("pqgBody"), n = CUR.length, mx = CUR.reduce((a, e) => e.m > a.m ? e : a, { m: 0 });
    const warn = EV.filter(e => Date.now() - e.t < 864e5 && assess(e).lv).sort((a, c) => c.m - a.m)[0];
    const cnt = {}; CUR.forEach(e => { const k = F.p ? e.reg : e.prov; if (k) cnt[k] = (cnt[k] || 0) + 1; });
    const top = Object.entries(cnt).sort((a, c) => c[1] - a[1]).slice(0, 6);
    let h = ""; { const t = $("pqgT"); if (t) t.textContent = MIN ? "Gempa \u00B7 " + n + " \u00B7 M" + (mx.m ? mx.m.toFixed(1) : "-") : "Gempa & Tsunami Indonesia"; }
    if (warn) h += '<div class="pqg-warn" data-w="1">\u26A0 24 jam terakhir: M' + warn.m.toFixed(1) + " " + esc(warn.reg || "") + " \u2014 " + LV[assess(warn).lv][0] + " (ketuk)</div>";
    h += '<div class="pqg-st"><b>' + n + "</b> gempa &middot; terkuat <b>M" + (mx.m ? mx.m.toFixed(1) : "-") + "</b>" + (top.length ? "<div class='pqg-ch'>" + top.map(x => "<span data-r='" + esc(x[0]) + "'>" + esc(x[0].replace("Kabupaten ", "Kab. ")) + " " + x[1] + "</span>").join("") + "</div>" : "") + "</div>";
    if (sel) { const A = sel._a || assess(sel), l = LV[A.lv]; h += '<div class="pqg-dt" style="border-color:' + l[1] + '"><b style="color:' + l[1] + '">' + l[0] + "</b><br>M" + sel.m.toFixed(1) + " &middot; kedalaman " + Math.round(sel.d) + " km &middot; " + when(sel) + " (" + ago(sel.t) + ")<br>" + (sel.off ? "Lepas pantai, terdekat " + esc(sel.reg || "") + ", " + esc(sel.prov || "") + " \u00B1" + Math.round(sel.nd || 0) + " km" : esc(sel.reg) + ", " + esc(sel.prov)) + "<br><span style='color:#9fb6c3'>" + esc(sel.place) + " (" + sel.src + ")</span><br>" + sel.lat.toFixed(3) + "\u00B0, " + sel.lng.toFixed(3) + "\u00B0 \u00B7 " + dCat(sel.d) + (sel.felt ? "<br>Dirasakan: " + esc(sel.felt) : "") + "<br>Guncangan kuat \u2248 " + Math.round(A.rs) + " km &middot; terasa \u2248 " + Math.round(A.rf) + " km" + (A.lv ? " &middot; jangkauan tsunami \u2248 " + Math.round(A.rt) + " km<br>Perkiraan tiba di pantai terdekat: ~" + Math.max(1, Math.round((sel._ck || 0) / V)) + " menit (laut dalam, indikatif)" : "") + '<br><button class="pqg-b" data-a="rep">\u25B6 Ulang animasi</button> <button class="pqg-b" data-a="off">Tutup</button></div>'; }
    h += '<div class="pqg-ls">' + CUR.slice(0, 80).map((e, i) => { const l = LV[assess(e).lv]; return '<div class="pqg-it" data-i="' + i + '"><b style="color:' + (e.m >= 6 ? "#f43f5e" : e.m >= 5 ? "#fb923c" : "#e6f1f7") + '">M' + e.m.toFixed(1) + "</b> " + esc(e.reg || "-") + ", " + esc((e.prov || "").replace("Papua", "Papua")) + "<small>" + short(e) + " &middot; " + ago(e.t) + " &middot; " + Math.round(e.d) + " km" + (e.off ? " &middot; laut" : "") + "</small>" + (assess(e).lv ? '<i style="background:' + l[1] + '">TSUNAMI</i>' : "") + "</div>"; }).join("") + (n > 80 ? "<div style='padding:6px;color:#9fb6c3'>+" + (n - 80) + " lagi \u2014 persempit filter</div>" : "") + (n ? "" : "<div style='padding:10px;color:#9fb6c3'>Tidak ada gempa pada filter ini.</div>") + "</div>";
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
      "#pqgPanel{position:fixed;z-index:2950;top:70px;right:12px;width:340px;max-height:calc(100% - 100px);display:none;flex-direction:column;background:#071a26f2;color:#e6f1f7;border:1px solid #22d3ee55;border-radius:12px;font:12.5px system-ui;box-shadow:0 6px 24px #000a}#pqgPanel header{display:flex;align-items:center;gap:6px;padding:8px 10px;font-weight:700;border-bottom:1px solid #ffffff18}#pqgPanel header span{flex:1}#pqgPanel header button{background:none;border:0;color:#9fb6c3;font-size:16px;cursor:pointer}.pqg-ct{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px 10px}.pqg-ct select{background:#0b2736;color:#e6f1f7;border:1px solid #ffffff22;border-radius:6px;padding:5px;min-width:0}.pqg-ct label{grid-column:1/3;display:flex;gap:6px;align-items:center}#pqgBody{overflow:auto;padding:0 10px 10px}.pqg-st{padding:4px 0}.pqg-ch{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}.pqg-ch span{background:#0e7490;border-radius:10px;padding:2px 8px;cursor:pointer;font-size:11.5px}.pqg-warn{background:#7f1d1d;border:1px solid #f43f5e;border-radius:8px;padding:6px 8px;margin:4px 0;cursor:pointer;animation:pqgw 1.2s infinite}@keyframes pqgw{50%{background:#450a0a}}.pqg-dt{border-left:4px solid;background:#0b2736;border-radius:8px;padding:8px;margin:6px 0;line-height:1.5}.pqg-b{background:#0e7490;color:#fff;border:0;border-radius:6px;padding:4px 9px;margin-top:5px;cursor:pointer}.pqg-it{padding:6px 4px;border-bottom:1px solid #ffffff12;cursor:pointer;position:relative}.pqg-it:hover{background:#0b2736}.pqg-it small{display:block;color:#9fb6c3}.pqg-it i{position:absolute;right:4px;top:7px;font-style:normal;font-size:10px;color:#000;border-radius:8px;padding:1px 6px;font-weight:700}#pqgPanel.pqg-min .pqg-ct,#pqgPanel.pqg-min #pqgBody{display:none}#pqgPanel.pqg-min{max-height:none}.pqg-tr{grid-column:1/3;display:flex;gap:8px;align-items:center}.pqg-tr select{flex:1}.pqg-tr input{flex:0 0 84px;accent-color:#22d3ee}.pqg-mask{transition:fill-opacity .6s}.pqg-sc{grid-column:1/3;display:flex;gap:5px}.pqg-sc .pqg-b{margin:0;flex:1;padding:5px 4px;background:#0b2736;border:1px solid #22d3ee44}.pqg-sc .pqg-b.on{background:#0e7490;border-color:#22d3ee}.pqg-sc .pqg-b[data-sc=fs]{flex:0 0 34px}.pqg-lg{grid-column:1/3;display:none;flex-wrap:wrap;gap:3px 9px;font-size:11px;color:#9fb6c3}.pqg-lg i{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:4px;vertical-align:middle}.leaflet-tooltip{font:600 11.5px system-ui}@media(max-width:860px){#pqgPanel{left:6px;right:6px;top:auto;bottom:6px;width:auto;max-height:52vh}}";
    document.head.appendChild(css);
    P = document.createElement("div"); P.id = "pqgPanel";
    P.innerHTML = '<header><i class="fa-solid fa-water" style="color:#22d3ee"></i><span id="pqgT">Gempa & Tsunami Indonesia</span><button id="pqgR" title="Segarkan">\u21BB</button><button id="pqgN" title="Perkecil">\u2212</button><button id="pqgX" title="Tutup">\u2715</button></header><div class="pqg-ct"><select id="pqgD"><option value="1">24 jam</option><option value="7">7 hari</option><option value="30">30 hari</option></select><select id="pqgM"><option value="3.5">M \u2265 3.5</option><option value="4">M \u2265 4</option><option value="5">M \u2265 5</option><option value="6">M \u2265 6</option></select><select id="pqgP"></select><select id="pqgK" disabled></select><div class="pqg-sc"><button class="pqg-b on" data-sc="id">\u{1F1EE}\u{1F1E9} Indonesia</button><button class="pqg-b" data-sc="p">Provinsi</button><button class="pqg-b" data-sc="k">Kab/Kota</button><button class="pqg-b" data-sc="fs" title="Layar penuh">\u26F6</button></div><div class="pqg-tr"><select id="pqgTm"><option value="off">Transparansi luar: mati</option><option value="p">Redupkan luar provinsi</option><option value="k">Redupkan luar kab/kota</option></select><input type="range" id="pqgTo" min="15" max="92" value="60" title="Tingkat peredupan area luar"></div><button class="pqg-b" id="pqgRp" style="grid-column:1/3;margin:0">\u25B6 Putar ulang waktu</button><label><input type="checkbox" id="pqgRof"> Cincin Api (sesar, palung, gunung api)</label><label><input type="checkbox" id="pqgRad" checked> Radius guncangan tiap titik gempa</label><div class="pqg-lg" id="pqgLg"><span><i style="background:#f43f5e"></i>Megathrust</span><span><i style="background:#fb923c"></i>Sesar geser</span><span><i style="background:#c084fc"></i>Sesar naik</span><span><i style="background:#fbbf24"></i>Busur vulkanik</span><span><i style="background:#22d3ee"></i>Gerak lempeng</span><span>\u{1F30B} Gunung api</span></div></div><div id="pqgBody">Memuat data gempa\u2026</div>';
    document.body.appendChild(P);
    $("pqgP").innerHTML = '<option value="">Semua provinsi</option>' + Object.keys(window.PQ_KABBATAS || {}).sort().map(p => "<option>" + esc(p) + "</option>").join("");
    $("pqgD").onchange = e => { F.d = +e.target.value; refresh(); }; $("pqgM").onchange = e => { F.m = +e.target.value; refresh(); };
    $("pqgP").onchange = e => { F.p = e.target.value; fillK(); if (F.p) provFocus(); else if (HL) map.removeLayer(HL); refresh(); };
    $("pqgK").onchange = e => { F.k = e.target.value; F.k ? kabFocus() : provFocus(); refresh(); };
    $("pqgRof").onchange = e => rof(e.target.checked); const scOn = k => P.querySelectorAll("[data-sc]").forEach(x => x.classList.toggle("on", x.dataset.sc === k));
    P.querySelectorAll("[data-sc]").forEach(x => x.onclick = () => { const k = x.dataset.sc;
      if (k === "id") { F.p = F.k = ""; if (HL) { map.removeLayer(HL); HL = null; } sync(); map.fitBounds([[-11.5, 94.5], [6.5, 141.5]], { padding: [20, 20] }); refresh(); scOn("id"); }
      else if (k === "p") { if (!F.p) { say("Pilih provinsi dulu"); $("pqgP").focus(); return; } F.k = ""; $("pqgK").value = ""; provFocus(); refresh(); scOn("p"); }
      else if (k === "k") { if (!F.p) { say("Pilih provinsi lalu kabupaten/kota"); $("pqgP").focus(); return; } if (!F.k) { say("Pilih kabupaten/kota dulu"); $("pqgK").focus(); return; } kabFocus(); refresh(); scOn("k"); }
      else { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (e) { say("Layar penuh tidak didukung"); } } });
    $("pqgP").addEventListener("change", () => scOn(F.p ? "p" : "id")); $("pqgK").addEventListener("change", () => scOn(F.k ? "k" : F.p ? "p" : "id"));
    $("pqgTm").onchange = e => { TM = e.target.value; MKey = ""; if (TM === "p" && !F.p) { say("Pilih provinsi dulu"); $("pqgP").focus(); } else if (TM === "k" && !F.k) { say("Pilih provinsi lalu kabupaten/kota"); $("pqgP").focus(); } applyMask(); };
    $("pqgTo").oninput = e => { TO = e.target.value / 100; if (MM) MM.setStyle({ fillOpacity: TO }); };
    $("pqgRad").onchange = e => { F.r = e.target.checked; refresh(); }; $("pqgN").onclick = () => { MIN = !MIN; P.classList.toggle("pqg-min", MIN); $("pqgN").textContent = MIN ? "\u25A1" : "\u2212"; $("pqgN").title = MIN ? "Perbesar" : "Perkecil"; render(); }; $("pqgRp").onclick = () => RP ? stopReplay() : startReplay();
    $("pqgR").onclick = () => { $("pqgBody").innerHTML = "Memuat\u2026"; load(); }; $("pqgX").onclick = close;
    $("pqgD").value = F.d; $("pqgM").value = F.m;
  }
  function open() {
    if (!P) build(); if (!G) G = L.layerGroup().addTo(map); mkcv();
    P.style.display = "flex"; map.hasLayer(G) || G.addTo(map); EV.length ? refresh() : load(); clearInterval(timer); timer = setInterval(() => { if (P.style.display !== "none") load(); }, 3e5);
  }
  function close() { if (RP) { RP = null; } if (MK) { map.removeLayer(MK); MK = null; MM = null; } MKey = ""; P.style.display = "none"; sel = null; clearInterval(timer); if (G) map.removeLayer(G); if (HL) map.removeLayer(HL); }

  function init() {
    try { BASEMAPS.push({ id: "ring_of_fire", icon: "\u{1F30B}", label: "Ring of Fire (Cincin Api)", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", opts: { maxZoom: 19, subdomains: "abcd", attribution: "&copy; OpenStreetMap &copy; CARTO" } }); renderBasemapList(); const o = window.switchBasemap; window.switchBasemap = function (e) { const r = o.apply(this, arguments); try { rof(e === "ring_of_fire"); } catch (x) { } return r; }; if (typeof currentBaseId !== "undefined" && currentBaseId === "ring_of_fire") rof(true); } catch (e) { console.warn("Basemap Ring of Fire gagal:", e); }
    const b = document.createElement("button"); b.innerHTML = '<i class="fa-solid fa-water"></i>'; b.title = "Gempa & potensi tsunami"; b.onclick = open;
    const put = () => { try { PQ_DOCK.adopt(b, "Gempa & Tsunami"); } catch (e) { b.style.cssText = "position:fixed;left:10px;bottom:220px;z-index:900"; document.body.append(b); } };
    typeof PQ_DOCK !== "undefined" ? put() : setTimeout(put, 900);
  }
  window.PETAQU_GEMPA = { open, close, _loc: e => { locate(e); return e; }, _assess: assess };
  if (typeof document !== "undefined" && document.readyState !== undefined) document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
