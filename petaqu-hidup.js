/* PETAQU Hidup: peta yang "bernapas"
   - Angin: partikel mengalir mengikuti data nyata Open-Meteo (grid ~88 titik, cache 30 menit), warna menurut kecepatan
   - Laut: gelombang merambat searah & sebesar data marine (bila gagal: estimasi dari angin); HANYA di laut,
     memakai batas kabupaten PETAQU sebagai topeng daratan (tidak ada ombak di atas pulau)
   - Denyut merah di titik jalan IRI > 12 (zoom >= 11), denyut oranye di jembatan dalam zona angin kencang
   - Cerdas: kualitas adaptif (FPS), jeda saat peta digeser / tab tersembunyi / baterai lemah / "kurangi gerak",
     ringkasan angin-gelombang di tengah layar, peringatan angin/gelombang ekstrem, hitung jembatan di zona angin kencang */
(function () {
  "use strict";
  const KEY = "pq_hidup_v1", PREF = "pq_hidup_pref", TTL = 30 * 60e3, R = Math.PI / 180;
  const LAT0 = -9.6, LAT1 = -5.2, LNG0 = 105.6, LNG1 = 112.2, MS = 0.02, STRONG = 12;
  const $ = (t, css, html) => { const e = document.createElement(t); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; };
  const say = m => { try { toast(m, 4500); } catch (e) { console.log(m); } };
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const ARAH = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];
  const arah = d => ARAH[Math.round(((d % 360) + 360) % 360 / 45) % 8];
  let pref = Object.assign({ on: null, wind: true, sea: true, pulse: true, flow: true, dark: true }, jget(PREF, {}));
  let D = null, mask = null, cvW, cvS, cx, sx, chip, btn, field = null, sea = [], pulses = [], flows = [], wdog, parts = [], raf = 0, last = 0, moving = false, q = 1, dts = [], warned = false, bridgesRisk = 0, wh = [0, 0], deb;

  /* ---------- data ---------- */
  const GRID = []; for (let la = LAT0 + .4; la <= LAT1; la += .6) for (let lo = LNG0; lo <= LNG1; lo += .66) GRID.push([+la.toFixed(2), +lo.toFixed(2)]);
  async function load() {
    const c = jget(KEY, null); if (c && c.nodes && Date.now() - c.t < TTL) return (D = c);
    const la = GRID.map(g => g[0]).join(), lo = GRID.map(g => g[1]).join();
    const w = await (await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + la + "&longitude=" + lo + "&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms")).json();
    let m = null; try { m = await (await fetch("https://marine-api.open-meteo.com/v1/marine?latitude=" + la + "&longitude=" + lo + "&current=wave_height,wave_direction,wave_period")).json(); if (!Array.isArray(m)) m = null; } catch (e) { }
    const nodes = GRID.map((g, i) => { const c1 = ((Array.isArray(w) ? w[i] : w) || {}).current || {}, c2 = (m && m[i] && m[i].current) || {}; return { lat: g[0], lng: g[1], s: c1.wind_speed_10m, d: c1.wind_direction_10m, g: c1.wind_gusts_10m, h: c2.wave_height, wd: c2.wave_direction, wp: c2.wave_period }; }).filter(n => isFinite(n.s) && isFinite(n.d));
    if (!nodes.length) throw new Error("data angin kosong");
    D = { t: Date.now(), nodes, est: !nodes.some(n => n.h != null && isFinite(n.h)) }; jset(KEY, D); return D;
  }
  /* IDW 4 titik terdekat; hasil u (timur), v (utara), kecepatan, hembusan */
  function near(lat, lng, list, k) { return list.map(n => ({ n, d: ((n.lat - lat) ** 2 + ((n.lng - lng) * Math.cos(lat * R)) ** 2) })).sort((a, b) => a.d - b.d).slice(0, k); }
  function windAt(lat, lng) {
    if (!D) return null; const nb = near(lat, lng, D.nodes, 4); if (nb[0].d > 9) return null;
    let su = 0, sv = 0, sg = 0, sw = 0; nb.forEach(o => { const w = 1 / (o.d + 1e-4), a = o.n.d * R; su += -o.n.s * Math.sin(a) * w; sv += -o.n.s * Math.cos(a) * w; sg += (o.n.g || o.n.s) * w; sw += w; });
    const u = su / sw, v = sv / sw; return { u, v, s: Math.hypot(u, v), g: sg / sw };
  }
  function waveAt(lat, lng, wd) {
    if (!D) return null;
    if (D.est) { const s = wd.s; return { h: Math.min(6, .02 * s * s), to: Math.atan2(wd.u, wd.v) / R, p: 3 + .5 * s }; }
    const nb = near(lat, lng, D.nodes.filter(n => n.h != null && isFinite(n.h)), 3); if (!nb.length || nb[0].d > .5) return null;
    let h = 0, sw = 0, su = 0, sv = 0, p = 0; nb.forEach(o => { const w = 1 / (o.d + 1e-4), a = (o.n.wd || 0) * R; h += o.n.h * w; su += Math.sin(a) * w; sv += Math.cos(a) * w; p += (o.n.wp || 6) * w; sw += w; });
    return { h: h / sw, to: Math.atan2(su, sv) / R + 180, p: p / sw };
  }

  /* ---------- topeng daratan dari batas kabupaten ---------- */
  function buildMask() {
    const K = window.PQ_KABBATAS; if (!K) return false;
    const cv = document.createElement("canvas"); cv.width = Math.round((LNG1 - LNG0) / MS); cv.height = Math.round((LAT1 - LAT0) / MS);
    const c = cv.getContext("2d"); c.fillStyle = "#000";
    ["Banten", "DKI Jakarta", "Jawa Barat", "Jawa Tengah", "DI Yogyakarta", "Jawa Timur", "Bali", "Lampung", "Nusa Tenggara Barat"].forEach(p => (K[p] || []).forEach(kb => (kb[1] || []).forEach(s => {
      let i = 0, la = 0, lo = 0, first = true; c.beginPath();
      while (i < s.length) { let b, sh = 0, r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); la += (r & 1) ? ~(r >> 1) : (r >> 1); sh = 0; r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lo += (r & 1) ? ~(r >> 1) : (r >> 1); const x = (lo / 1e5 - LNG0) / MS, y = (LAT1 - la / 1e5) / MS; first ? c.moveTo(x, y) : c.lineTo(x, y); first = false; }
      c.closePath(); c.fill();
    })));
    mask = { w: cv.width, h: cv.height, d: c.getImageData(0, 0, cv.width, cv.height).data }; return true;
  }
  const inGrid = (la, lo) => la > LAT0 && la < LAT1 && lo > LNG0 && lo < LNG1;
  const isLand = (la, lo) => { const x = Math.floor((lo - LNG0) / MS), y = Math.floor((LAT1 - la) / MS); return mask.d[(y * mask.w + x) * 4 + 3] > 20; };

  /* ---------- medan di koordinat layar (menangani rotasi peta) ---------- */
  const CELL = 26;
  function dirPx(ll, u, v, p) { const s = Math.hypot(u, v) || 1, k = 3000 / 111320; const p2 = map.latLngToContainerPoint([ll.lat + v / s * k, ll.lng + u / s * k / Math.cos(ll.lat * R)]); const dx = p2.x - p.x, dy = p2.y - p.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
  function build() {
    const sz = map.getSize(), w = sz.x, h = sz.y, cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    [cvW, cvS].forEach(c => { c.width = w * dpr; c.height = h * dpr; c.style.width = w + "px"; c.style.height = h + "px"; });
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); sx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vx = new Float32Array(cols * rows), vy = new Float32Array(cols * rows), sp = new Float32Array(cols * rows); sea = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const p = L.point((i + .5) * CELL, (j + .5) * CELL), ll = map.containerPointToLatLng(p), wd = windAt(ll.lat, ll.lng); if (!wd) continue;
      const [dx, dy] = dirPx(ll, wd.u, wd.v, p), f = 1 + 3.2 * Math.min(wd.s, 16) / 16, k = j * cols + i; vx[k] = dx * f; vy[k] = dy * f; sp[k] = wd.s;
      if (pref.sea && mask && inGrid(ll.lat, ll.lng) && !isLand(ll.lat, ll.lng)) {
        const wv = waveAt(ll.lat, ll.lng, wd); if (wv && wv.h > .05) { const a = wv.to * R, [ex, ey] = dirPx(ll, Math.sin(a), Math.cos(a), p), hs = (i * 73 + j * 151) % 97 / 97; sea.push({ x: p.x + (hs - .5) * CELL, y: p.y + ((j * 31 % 7) / 7 - .5) * CELL, dx: ex, dy: ey, a: Math.max(.35, Math.min(1, wv.h / 3)), ph: hs, sp: 1 / (Math.max(wv.p, 3) * 700) }); }
      }
    }
    field = { w, h, cols, rows, vx, vy, sp }; cx.clearRect(0, 0, w, h);
    const n = Math.round(Math.min(2200, w * h / 450) * q * (w < 700 ? .65 : 1)); parts = []; for (let i = 0; i < n; i++) parts.push(spawn({}, true));
    pulses = []; if (pref.pulse && map.getZoom() >= 11) {
      const b = map.getBounds().pad(.05), add = (la, lo, c) => { if (pulses.length < 80 && b.contains([la, lo])) { const p = map.latLngToContainerPoint([la, lo]); pulses.push({ x: p.x, y: p.y, c, ph: Math.random() }); } };
      (typeof roads !== "undefined" ? roads : []).forEach(r => (r.points || []).forEach(p => { if (p.iri > 12 && !isNaN(p.iri)) add(p.lat, p.lng, "244,63,94"); }));
      (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []).forEach(j => { if (typeof j.lat === "number") { const wd = windAt(j.lat, j.lng); if (wd && wd.s >= STRONG) add(j.lat, j.lng, "251,146,60"); } });
    }
    flows = []; if (pref.flow) {
      const b = map.getBounds().pad(.1), cand = [], CL = { baik: "34,211,238", sedang: "250,204,21", rr: "249,115,22", rb: "244,63,94" };
      (typeof roads !== "undefined" ? roads : []).forEach(r => {
        const P = (r.points || []).filter(p => typeof p.lat === "number"); if (P.length < 2 || !P.some(p => b.contains([p.lat, p.lng]))) return;
        const st = Math.max(1, Math.ceil(P.length / 150)), xy = [], cum = [0]; let iri = 0, ni = 0;
        for (let i = 0; i < P.length; i += st) { const p = map.latLngToContainerPoint([P[i].lat, P[i].lng]); xy.push(p.x, p.y); const m = xy.length / 2 - 1; if (m) cum.push(cum[m - 1] + Math.hypot(xy[m * 2] - xy[m * 2 - 2], xy[m * 2 + 1] - xy[m * 2 - 1])); if (P[i].iri != null && !isNaN(P[i].iri)) { iri += +P[i].iri; ni++; } }
        const tot = cum[cum.length - 1]; if (tot < 60 || xy.length < 4) return;
        cand.push({ xy, cum, tot, c: ni ? CL[getIriInfo(iri / ni).key] || "255,255,255" : "255,255,255", v: 55 + (tot % 50) });
      });
      cand.sort((a, b2) => b2.tot - a.tot).slice(0, 120).forEach(f => { const n = Math.min(3, 1 + Math.floor(f.tot / 500)); for (let i = 0; i < n; i++) flows.push(Object.assign({}, f, { o: f.tot * i / n })); });
    }
    summary();
  }
  function spawn(p, init) { p.x = Math.random() * field.w; p.y = Math.random() * field.h; p.age = init ? Math.random() * 60 : 0; p.life = 40 + Math.random() * 50; return p; }

  /* ---------- ringkasan, peringatan ---------- */
  function summary() {
    const c = map.getCenter(), wd = windAt(c.lat, c.lng); if (!wd) { chip.firstChild.textContent = "Angin: di luar cakupan data"; return; }
    const from = (Math.atan2(-wd.u, -wd.v) / R + 360) % 360; let t = "\u{1F32C} " + wd.s.toFixed(1) + " m/s (" + Math.round(wd.s * 3.6) + " km/j) dari " + arah(from);
    if (mask && inGrid(c.lat, c.lng) && !isLand(c.lat, c.lng)) { const wv = waveAt(c.lat, c.lng, wd); if (wv) t += " \u00b7 \u{1F30A} " + wv.h.toFixed(1) + " m" + (D.est ? " (est.)" : ""); }
    if (bridgesRisk) t += " \u00b7 \u26A0 " + bridgesRisk + " jembatan di zona angin \u2265 " + Math.round(STRONG * 3.6) + " km/j";
    chip.firstChild.textContent = t;
  }
  function assess() {
    bridgesRisk = (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []).filter(j => { if (typeof j.lat !== "number") return false; const w = windAt(j.lat, j.lng); return w && w.s >= STRONG; }).length;
    const gmax = Math.max(...D.nodes.map(n => n.g || n.s)), hmax = Math.max(0, ...D.nodes.map(n => +n.h || 0));
    if (!warned && (gmax >= 15 || hmax >= 2.5)) { warned = true; say("\u26A0 Waspada cuaca: hembusan maks " + Math.round(gmax * 3.6) + " km/j" + (hmax >= 2.5 ? ", gelombang " + hmax.toFixed(1) + " m" : "")); }
    chip.style.borderColor = gmax >= 15 || hmax >= 2.5 ? "#f43f5e" : "#22d3ee66";
  }

  /* ---------- animasi ---------- */
  const COL = ["rgba(103,232,249,.95)", "rgba(134,239,172,.95)", "rgba(253,224,71,.97)", "rgba(251,146,60,.97)"];
  function frame(t) {
    raf = requestAnimationFrame(frame); if (document.hidden || moving || !field) return;
    const dt = t - last; if (dt < 30) return; last = t; dts.push(dt); if (dts.length > 40) { const a = dts.reduce((x, y) => x + y) / dts.length; dts = []; if (a > 45 && q > .35) { q = Math.max(.35, q * .75); build(); } }
    const k = Math.min(dt, 80) / 33, { w, h, cols, rows, vx, vy, sp } = field;
    if (pref.wind) {
      cx.globalCompositeOperation = "destination-out"; cx.fillStyle = "rgba(0,0,0,.07)"; cx.fillRect(0, 0, w, h); cx.globalCompositeOperation = "source-over";
      const segs = [[], [], [], []];
      for (const p of parts) {
        const i = Math.floor(p.x / CELL), j = Math.floor(p.y / CELL), c = j * cols + i;
        if (p.age++ > p.life || i < 0 || j < 0 || i >= cols || j >= rows || sp[c] === 0) { spawn(p); continue; }
        const nx = p.x + vx[c] * k, ny = p.y + vy[c] * k, s = sp[c]; segs[s < 4 ? 0 : s < 8 ? 1 : s < 12 ? 2 : 3].push(p.x, p.y, nx, ny); p.x = nx; p.y = ny;
      }
      cx.lineWidth = 1.8; cx.lineCap = "round"; segs.forEach((a, b) => { if (!a.length) return; cx.strokeStyle = COL[b]; cx.beginPath(); for (let i = 0; i < a.length; i += 4) { cx.moveTo(a[i], a[i + 1]); cx.lineTo(a[i + 2], a[i + 3]); } cx.stroke(); });
    }
    sx.clearRect(0, 0, w, h);
    if (pref.sea) for (const c of sea) {
      const ph = (t * c.sp * 1.6 + c.ph) % 1, pos = (ph - .5) * 40, px = c.x + c.dx * pos, py = c.y + c.dy * pos, hf = 9 + 9 * c.a, nx = -c.dy, ny = c.dx, al = Math.sin(Math.PI * ph), bx = c.dx * 5 * (1 + c.a), by = c.dy * 5 * (1 + c.a);
      sx.lineCap = "round";
      sx.strokeStyle = "rgba(7,38,66," + (al * .28).toFixed(3) + ")"; sx.lineWidth = 3 + c.a; sx.beginPath(); sx.moveTo(px - nx * hf + 1.5, py - ny * hf + 2); sx.quadraticCurveTo(px + bx + 1.5, py + by + 2, px + nx * hf + 1.5, py + ny * hf + 2); sx.stroke();
      sx.strokeStyle = "rgba(235,248,255," + (al * (.45 + .5 * c.a)).toFixed(3) + ")"; sx.lineWidth = 1.6 + 1.2 * c.a; sx.beginPath(); sx.moveTo(px - nx * hf, py - ny * hf); sx.quadraticCurveTo(px + bx, py + by, px + nx * hf, py + ny * hf); sx.stroke();
      const tw = Math.sin(t / 380 + c.ph * 40); if (tw > .8) { sx.fillStyle = "rgba(255,255,255," + ((tw - .8) * 4).toFixed(2) + ")"; sx.beginPath(); sx.arc(c.x + 11, c.y - 9, 1.6, 0, 6.2832); sx.fill(); }
    }
    if (pref.pulse) for (const p of pulses) { const ph = (t / 1500 + p.ph) % 1; sx.strokeStyle = "rgba(" + p.c + "," + ((1 - ph) * .85).toFixed(2) + ")"; sx.lineWidth = 2; sx.beginPath(); sx.arc(p.x, p.y, 3 + ph * 18, 0, 6.2832); sx.stroke(); }
    if (pref.flow) for (const f of flows) {
      const sd = (t * f.v / 1000 + f.o) % f.tot; let pt = at(f, sd);
      sx.fillStyle = "rgba(" + f.c + ",.22)"; sx.beginPath(); sx.arc(pt[0], pt[1], 9, 0, 6.2832); sx.fill();
      for (let n = 0; n < 4; n++) { pt = at(f, ((sd - n * 9) % f.tot + f.tot) % f.tot); sx.fillStyle = "rgba(" + f.c + "," + (n ? .5 - n * .12 : .98) + ")"; sx.beginPath(); sx.arc(pt[0], pt[1], n ? 3 - n * .5 : 3.6, 0, 6.2832); sx.fill(); }
    }
  }

  /* ---------- kontrol ---------- */
  function setOpacity(v) { if (cvW) cvW.style.opacity = cvS.style.opacity = v; }
  function at(f, s) { const c = f.cum; let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; c[m] <= s ? lo = m : hi = m; } const k = (s - c[lo]) / ((c[hi] - c[lo]) || 1); return [f.xy[lo * 2] + (f.xy[hi * 2] - f.xy[lo * 2]) * k, f.xy[lo * 2 + 1] + (f.xy[hi * 2 + 1] - f.xy[lo * 2 + 1]) * k]; }
  function applyVeil() { if (cvS) cvS.style.background = pref.dark ? "rgba(5,22,36,.32)" : "transparent"; }
  function onMS() { moving = true; setOpacity(0); clearTimeout(wdog); wdog = setTimeout(refresh, 1500); }
  function refresh() { clearTimeout(deb); clearTimeout(wdog); deb = setTimeout(() => { if (!pref.on) return; moving = false; build(); setOpacity(1); }, 140); }
  function chipHtml() { const b = (k, t) => '<button data-k="' + k + '" style="background:' + (pref[k] ? "#0e7490" : "#334155") + ';color:#fff;border:0;border-radius:5px;padding:2px 7px;margin-left:4px;font-size:11px;cursor:pointer">' + t + "</button>"; chip.querySelector("span.t").innerHTML = b("wind", "Angin") + b("sea", "Laut") + b("pulse", "Titik") + b("flow", "Arus") + b("dark", "Gelap"); chip.querySelectorAll("button").forEach(x => x.onclick = () => { pref[x.dataset.k] = !pref[x.dataset.k]; jset(PREF, pref); if (!pref.wind) cx.clearRect(0, 0, 9999, 9999); chipHtml(); applyVeil(); build(); }); }
  async function start() {
    if (pref.on && raf) return; pref.on = true; jset(PREF, pref); btn && btn.classList.add("active");
    try { await load(); } catch (e) { pref.on = false; jset(PREF, pref); return say("Peta Hidup: data angin belum tersedia (" + (e.message || "jaringan") + ")"); }
    if (!mask && pref.sea) { if (!window.PQ_KABBATAS) await new Promise(r => { const s = document.createElement("script"); s.src = "data-kabbatas.js"; s.onload = s.onerror = r; document.head.append(s); }); try { if (!buildMask()) say("Lapisan laut butuh data batas kabupaten (belum termuat)"); } catch (e) { } }
    const c = map.getContainer(), st = "position:absolute;left:0;top:0;pointer-events:none;z-index:620;transition:opacity .4s;";
    cvS = $("canvas", st); cvW = $("canvas", st); c.append(cvS, cvW); cx = cvW.getContext("2d"); sx = cvS.getContext("2d");
    chip = $("div", "position:absolute;left:50%;bottom:44px;transform:translateX(-50%);z-index:700;max-width:92%;background:#071a26e6;color:#e6f1f7;border:1px solid #22d3ee66;border-radius:14px;padding:4px 10px;font:11.5px system-ui;text-align:center", "<span></span><span class='t'></span>"); c.append(chip); chipHtml(); applyVeil();
    map.on("movestart zoomstart", onMS); map.on("moveend zoomend resize", refresh);
    assess(); build(); raf = requestAnimationFrame(frame); setOpacity(1);
  }
  function stop() { pref.on = false; jset(PREF, pref); cancelAnimationFrame(raf); raf = 0; [cvS, cvW, chip].forEach(e => e && e.remove()); map.off("movestart zoomstart", onMS).off("moveend zoomend resize", refresh); btn && btn.classList.remove("active"); }
  const toggle = () => pref.on ? stop() : start();
  async function init() {
    btn = $("button", "", '<i class="fa-solid fa-wind"></i>'); btn.title = "Peta Hidup: angin, gelombang laut & denyut titik kritis"; btn.onclick = toggle;
    try { PQ_DOCK.adopt(btn, "Peta Hidup"); } catch (e) { btn.style.cssText = "position:fixed;left:10px;bottom:220px;z-index:900"; document.body.append(btn); }
    let low = false; try { const b = await navigator.getBattery(); low = b.level < .2 && !b.charging; } catch (e) { }
    const calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    pref.on = false; if (pref.autostart !== false && !low && !calm && jget(PREF, {}).on !== false) setTimeout(start, 2500);
    setInterval(() => { if (pref.on && D && Date.now() - D.t > TTL) { localStorage.removeItem(KEY); load().then(() => { assess(); build(); }).catch(() => { }); } }, 5 * 60e3);
  }
  window.PETAQU_HIDUP = { start, stop, toggle, _t: { windAt, waveAt, arah, setData: d => { D = d; } } };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
