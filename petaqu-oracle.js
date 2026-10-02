/* PETAQU Oracle: Kritikalitas Jaringan & Simulasi Penutupan (graf + Dijkstra),
   Prioritas Terpadu (multi-kriteria, bobot bisa digeser), Cuaca Ekstrem (Open-Meteo, 7 hari) */
(function () {
  "use strict";
  const $ = (t, css, html) => { const e = document.createElement(t); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; };
  const esc = window.esc = window.esc || (s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const say = m => { try { toast(m, 3200); } catch (e) { console.log(m); } };
  const RD = () => (typeof roads !== "undefined" ? roads : []);
  const BR = () => (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []);
  const MAPX = () => (typeof map !== "undefined" ? map : window.map);
  const PRO = () => (window.PETAQU_PRO ? PETAQU_PRO.all() : []);
  const okc = v => v !== null && v !== undefined && v !== "" && isFinite(+v);
  const RAD = Math.PI / 180;
  const hav = (a, b) => { const dl = (b.lat - a.lat) * RAD, dg = (b.lng - a.lng) * RAD, s = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dg / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(s)); };
  const km = m => (m / 1000).toFixed(2) + " km";
  const overlay = (title, w) => {
    const bg = $("div", "position:fixed;inset:0;z-index:6500;background:#000b;display:flex;align-items:flex-start;justify-content:center;padding:6vh 10px 10px");
    const box = $("div", "background:#071a26;color:#e6f1f7;border:1px solid #22d3ee66;border-radius:14px;width:min(" + w + "px,100%);max-height:88vh;display:flex;flex-direction:column;font:13px system-ui;box-shadow:0 10px 40px #000a");
    box.innerHTML = '<div style="padding:11px 14px;display:flex;align-items:center;border-bottom:1px solid #ffffff22"><b style="flex:1;font-size:15px">' + title + '</b><button class="or-x" style="background:none;border:0;color:#fff;font-size:20px;cursor:pointer">\u2715</button></div>';
    const body = $("div", "overflow:auto;padding:12px 14px");
    box.append(body); bg.append(box); document.body.append(bg);
    const close = () => bg.remove();
    box.querySelector(".or-x").onclick = close;
    bg.addEventListener("mousedown", e => { if (e.target === bg) close(); });
    return { body, close };
  };

  /* ================= GRAF JARINGAN ================= */
  // Simpul = titik ruas; sisi = titik berurutan pada ruas yang sama + persimpangan (titik ruas lain <= snap meter).
  function buildGraph(rds, snap) {
    snap = snap || 30;
    const nodes = [], adj = [];
    rds.forEach((r, ri) => {
      let prev = -1;
      (r.points || []).forEach(p => {
        if (!okc(p.lat) || !okc(p.lng)) return;
        const id = nodes.length;
        nodes.push({ lat: +p.lat, lng: +p.lng, ri, sta: p.sta });
        adj.push([]);
        if (prev >= 0) { const w = hav(nodes[prev], nodes[id]); adj[prev].push({ to: id, w, ri }); adj[id].push({ to: prev, w, ri }); }
        prev = id;
      });
    });
    const cell = snap / 111000, grid = new Map(), key = (a, b) => a + "," + b;
    nodes.forEach((n, i) => { const k = key(Math.floor(n.lat / cell), Math.floor(n.lng / cell)); let g = grid.get(k); if (!g) grid.set(k, g = []); g.push(i); });
    let cross = 0;
    nodes.forEach((n, i) => {
      const a = Math.floor(n.lat / cell), b = Math.floor(n.lng / cell), best = new Map();
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
        const c = grid.get(key(a + da, b + db)); if (!c) continue;
        c.forEach(j => {
          if (j <= i || nodes[j].ri === n.ri) return;
          const d = hav(n, nodes[j]);
          if (d <= snap) { const o = best.get(nodes[j].ri); if (!o || d < o.d) best.set(nodes[j].ri, { j, d }); }
        });
      }
      best.forEach(o => { const w = Math.max(o.d, 1); adj[i].push({ to: o.j, w, ri: -1, x: 1 }); adj[o.j].push({ to: i, w, ri: -1, x: 1 }); cross++; });
    });
    const comp = new Int32Array(nodes.length).fill(-1); let nc = 0;
    for (let s = 0; s < nodes.length; s++) {
      if (comp[s] >= 0) continue;
      const st = [s]; comp[s] = nc;
      while (st.length) { const u = st.pop(); adj[u].forEach(e => { if (comp[e.to] < 0) { comp[e.to] = nc; st.push(e.to); } }); }
      nc++;
    }
    return { nodes, adj, comp, nc, cross, cache: new Map() };
  }

  function dijkstra(G, src, blocked, target) {
    const n = G.nodes.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), h = [];
    const push = (d, u) => { h.push([d, u]); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
    const pop = () => { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; };
    dist[src] = 0; push(0, src);
    while (h.length) {
      const [d, u] = pop();
      if (d > dist[u]) continue;
      if (u === target) break;
      for (const e of G.adj[u]) {
        if (blocked && blocked.has(u < e.to ? u * n + e.to : e.to * n + u)) continue;
        const nd = d + e.w;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; push(nd, e.to); }
      }
    }
    return { dist, prev };
  }
  const pathTo = (prev, t) => { const p = []; for (let u = t; u !== -1; u = prev[u]) p.push(u); return p.reverse(); };

  function segDist(p, a, b) {
    const kx = 111320 * Math.cos(p.lat * RAD), ky = 110540;
    const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky, bx = (b.lng - p.lng) * kx, by = (b.lat - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(ax + t * dx, ay + t * dy);
  }

  // Himpunan sisi yang ditutup + simpul batas (tempat lalu lintas harus mencari jalur lain).
  function closure(G, spec) {
    const n = G.nodes.length, bl = new Set();
    let B = [];
    if (spec.type === "road") {
      G.adj.forEach((es, u) => es.forEach(e => { if (u < e.to && (G.nodes[u].ri === spec.ri || G.nodes[e.to].ri === spec.ri)) bl.add(u * n + e.to); }));
      const seen = [];
      G.adj.forEach((es, u) => {
        if (G.nodes[u].ri === spec.ri) return;
        if (!es.some(e => G.nodes[e.to].ri === spec.ri)) return;
        if (seen.some(s => hav(G.nodes[s], G.nodes[u]) < 100)) return; // satu persimpangan = satu simpul
        seen.push(u);
      });
      B = seen;
    } else {
      const rd = Math.max(20, (spec.panjang || 0) / 2 + 12), p = { lat: spec.lat, lng: spec.lng };
      let best = Infinity, bestKey = -1;
      G.adj.forEach((es, u) => es.forEach(e => {
        if (u >= e.to) return;
        const d = segDist(p, G.nodes[u], G.nodes[e.to]);
        if (d <= rd) bl.add(u * n + e.to);
        if (d < best) { best = d; bestKey = u * n + e.to; }
      }));
      if (!bl.size && best <= 60) bl.add(bestKey);
      const s = new Set();
      bl.forEach(k => { s.add(Math.floor(k / n)); s.add(k % n); });
      B = [...s].filter(u => G.adj[u].some(e => !bl.has(u < e.to ? u * n + e.to : e.to * n + u)));
    }
    return { bl, B };
  }

  // Dampak penutupan: memutar (detour), putus total, panjang terisolasi, skor 0-100.
  function impact(G, spec) {
    const n = G.nodes.length, c = closure(G, spec), res = { spec, bl: c.bl, none: false, cut: false, maxDetour: 0, worst: null, affected: 0, unreach: 0, isolatedLen: 0, isolatedNodes: [], isolatedRoads: [], score: 0, level: "" };
    if (!c.bl.size) { res.none = true; res.level = "Tidak terhubung ke jaringan ruas"; return res; }
    const B = c.B, base = B.map(b => dijkstra(G, b, null)), alt = B.map(b => dijkstra(G, b, c.bl));
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const d0 = base[i].dist[B[j]], d1 = alt[i].dist[B[j]];
      if (!isFinite(d0)) continue;
      if (!isFinite(d1)) { res.unreach++; res.affected++; continue; }
      if (d1 - d0 > 1) {
        res.affected++;
        if (d1 - d0 > res.maxDetour) { res.maxDetour = d1 - d0; res.worst = { a: B[i], b: B[j], d0, d1, path: pathTo(alt[i].prev, B[j]) }; }
      }
    }
    // komponen setelah penutupan
    const comp2 = new Int32Array(n).fill(-1), sizes = [], subBase = [];
    for (let s = 0; s < n; s++) {
      if (comp2[s] >= 0) continue;
      const id = sizes.length, st = [s]; comp2[s] = id; let cnt = 0;
      while (st.length) {
        const u = st.pop(); cnt++;
        G.adj[u].forEach(e => { if (comp2[e.to] < 0 && !c.bl.has(u < e.to ? u * n + e.to : e.to * n + u)) { comp2[e.to] = id; st.push(e.to); } });
      }
      sizes.push(cnt); subBase.push(G.comp[s]);
    }
    const largest = new Map();
    sizes.forEach((sz, id) => { const b = subBase[id], o = largest.get(b); if (!o || sz > o.size) largest.set(b, { id, size: sz }); });
    const iso = new Uint8Array(n), rset = new Set(), skipRi = spec.type === "road" ? spec.ri : -2;
    for (let u = 0; u < n; u++) {
      if (G.nodes[u].ri === skipRi) continue;
      if (largest.get(G.comp[u]).id !== comp2[u] && sizes[comp2[u]] >= 2) { iso[u] = 1; res.isolatedNodes.push(u); rset.add(G.nodes[u].ri); }
    }
    G.adj.forEach((es, u) => es.forEach(e => { if (u < e.to && iso[u] && iso[e.to] && !c.bl.has(u * n + e.to)) res.isolatedLen += e.w; }));
    res.isolatedRoads = [...rset].filter(r => r >= 0);
    const cut = res.cut = res.unreach > 0 || res.isolatedLen > 0;
    res.score = cut ? 50 + Math.min(50, Math.round(res.isolatedLen / 500)) : Math.min(49, Math.round(res.maxDetour / 100));
    res.level = cut ? "PUTUS - tidak ada jalur alternatif" : res.maxDetour >= 3000 ? "Memutar jauh" : res.maxDetour >= 1000 ? "Memutar sedang" : res.affected ? "Memutar dekat" : "Ada alternatif, dampak kecil";
    return res;
  }

  let GC = null;
  const graph = fresh => { if (fresh || !GC) GC = buildGraph(RD()); return GC; };
  function nearestNode(G, p, maxM) { let b = -1, bd = maxM; G.nodes.forEach((n, i) => { const d = hav(p, n); if (d < bd) { bd = d; b = i; } }); return b; }
  // Kasus "putus": skor 50-100 relatif terhadap yang terbesar pada daftar yang sama, supaya peringkat tidak jenuh.
  function rescore(list) {
    const cut = list.filter(x => x.imp.cut), mx = Math.max(1, ...cut.map(x => x.imp.isolatedLen));
    cut.forEach(x => { x.imp.score = Math.round(50 + 50 * x.imp.isolatedLen / mx); });
    return list.sort((a, b) => b.imp.score - a.imp.score);
  }
  function rankBridges(G) {
    const out = [];
    BR().forEach(j => {
      if (!okc(j.lat) || !okc(j.lng)) return;
      const p = { lat: +j.lat, lng: +j.lng }, k = "b:" + j.id;
      let imp = G.cache.get(k);
      if (!imp) { imp = impact(G, { type: "bridge", lat: p.lat, lng: p.lng, panjang: +j.panjang || 0 }); G.cache.set(k, imp); }
      const ni = nearestNode(G, p, 80);
      out.push({ j, ri: ni >= 0 ? G.nodes[ni].ri : -1, imp });
    });
    return rescore(out);
  }
  function rankRoads(G) {
    const R = RD();
    return rescore(R.map((r, ri) => {
      const k = "r:" + ri; let imp = G.cache.get(k);
      if (!imp) { imp = impact(G, { type: "road", ri }); G.cache.set(k, imp); }
      return { r, ri, imp };
    }));
  }

  /* ---------- tampilan di peta ---------- */
  let lay = null, cardEl = null;
  function clearMap() { if (lay) { lay.remove(); lay = null; } if (cardEl) { cardEl.remove(); cardEl = null; } }
  function card(html) {
    if (cardEl) cardEl.remove();
    cardEl = $("div", "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:6400;background:#071a26f2;color:#e6f1f7;border:1px solid #22d3ee88;border-radius:12px;padding:10px 14px;font:13px system-ui;max-width:min(520px,94vw);box-shadow:0 6px 24px #000a", html + '<div style="text-align:right;margin-top:6px"><button class="or-c" style="background:#0e7490;color:#fff;border:0;border-radius:6px;padding:4px 12px;cursor:pointer">Tutup</button></div>');
    cardEl.querySelector(".or-c").onclick = clearMap;
    document.body.append(cardEl);
  }
  function show(imp, title) {
    const G = graph(), m = MAPX();
    clearMap();
    if (!m) return say("Peta belum siap");
    if (imp.none) { card("<b>" + esc(title) + "</b><br>" + esc(imp.level) + ". Lokasi tidak berada pada geometri ruas yang tersedia."); return; }
    const n = G.nodes.length, segs = [];
    imp.bl.forEach(k => { const u = Math.floor(k / n), v = k % n; segs.push([[G.nodes[u].lat, G.nodes[u].lng], [G.nodes[v].lat, G.nodes[v].lng]]); });
    const parts = [L.polyline(segs, { color: "#f43f5e", weight: 7, opacity: .9 })];
    if (imp.worst) parts.push(L.polyline(imp.worst.path.map(i => [G.nodes[i].lat, G.nodes[i].lng]), { color: "#22d3ee", weight: 5, dashArray: "9 8" }));
    imp.isolatedNodes.slice(0, 500).forEach(i => parts.push(L.circleMarker([G.nodes[i].lat, G.nodes[i].lng], { radius: 4, color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: .9, weight: 1 })));
    lay = L.layerGroup(parts).addTo(m);
    try { m.fitBounds(L.featureGroup(parts).getBounds().pad(.25), { maxZoom: 17 }); } catch (e) { }
    let h = "<b>" + esc(title) + "</b><br><b style=\"color:" + (imp.cut ? "#f43f5e" : imp.score >= 20 ? "#f59e0b" : "#34d399") + "\">" + esc(imp.level) + "</b> (skor " + imp.score + ")<br>";
    if (imp.worst) h += "Terpaksa memutar: <b>+" + km(imp.maxDetour) + "</b> (" + km(imp.worst.d0) + " menjadi " + km(imp.worst.d1) + "), garis cyan = jalur alternatif.<br>";
    if (imp.isolatedLen > 0) h += "Terisolasi: <b>" + km(imp.isolatedLen) + "</b> jalan" + (imp.isolatedRoads.length ? " pada " + imp.isolatedRoads.slice(0, 3).map(r => esc(RD()[r] && RD()[r].name)).join(", ") : "") + " (titik oranye).<br>";
    if (!imp.worst && !imp.isolatedLen) h += "Lalu lintas dapat dialihkan tanpa selisih jarak berarti pada data yang ada.<br>";
    h += '<span style="color:#9fb6c3;font-size:11.5px">Garis merah = bagian yang ditutup. Analisis memakai geometri ruas; jalan di luar data tidak terhitung.</span>';
    card(h);
  }

  /* ================= 1. KRITIKALITAS JARINGAN ================= */
  const badge = imp => { const c = imp.none ? "#64748b" : imp.cut ? "#f43f5e" : imp.score >= 20 ? "#f59e0b" : "#34d399"; return '<b style="color:' + c + '">' + imp.score + "</b>"; };
  function kritikal() {
    const G = graph(true), o = overlay("Kritikalitas Jaringan", 940);
    const bs = rankBridges(G), rs = rankRoads(G);
    const cutB = bs.filter(x => x.imp.cut).length, totB = bs.filter(x => !x.imp.none).length;
    let tab = "j";
    const draw = () => {
      const R = RD();
      const head = '<div style="color:#9fb6c3;margin-bottom:8px">Jaringan dibangun otomatis dari geometri ruas (' + G.nodes.length + " simpul, " + G.cross + " persimpangan, " + G.nc + ' komponen terpisah). Tiap jembatan/ruas "ditutup" secara virtual lalu dicari jalur alternatif terpendek. Skor tinggi = tidak ada atau sangat jauh jalur pengganti. Ini penyaring prioritas, bukan penilaian struktur.</div>' +
        '<div style="margin-bottom:8px">' + (totB && cutB / totB > 0.5 ? '<div style="background:#f59e0b22;border:1px solid #f59e0b66;border-radius:8px;padding:6px 8px;margin-bottom:8px;color:#fcd34d">Sebagian besar jembatan "memutus" karena ruas yang tercatat berupa koridor tunggal tanpa jalan pengganti. Jalan kabupaten/desa yang belum ada di data tidak terhitung, jadi baca angka ini sebagai <b>urutan kepentingan relatif</b> (skor makin tinggi = makin banyak jalan yang terputus), bukan kepastian bahwa akses benar-benar terisolasi. Menambahkan ruas alternatif ke data membuat hasil lebih realistis.</div>' : "") + '<b style="color:#f43f5e">' + cutB + "</b> dari " + totB + " jembatan memutus jaringan jika ditutup (tidak ada jalur pengganti pada data ruas). " +
        '<button data-t="j" style="margin-left:8px;background:' + (tab === "j" ? "#0e7490" : "#0b2a3b") + ';color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:4px 10px;cursor:pointer">Jembatan</button> ' +
        '<button data-t="r" style="background:' + (tab === "r" ? "#0e7490" : "#0b2a3b") + ';color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:4px 10px;cursor:pointer">Ruas</button></div>';
      let rows;
      if (tab === "j") rows = bs.slice(0, 40).map((x, i) => '<tr data-i="' + i + '" style="border-top:1px solid #ffffff14;cursor:pointer"><td>' + (i + 1) + "</td><td>" + esc(x.j.nama || x.j.name || "-") + "</td><td>" + esc(x.ri >= 0 ? R[x.ri].name : x.j.ruas || "-") + "</td><td>" + esc(x.imp.level) + "</td><td>" + (x.imp.maxDetour ? "+" + km(x.imp.maxDetour) : "-") + "</td><td>" + (x.imp.isolatedLen ? km(x.imp.isolatedLen) : "-") + "</td><td>" + badge(x.imp) + "</td></tr>").join("");
      else rows = rs.slice(0, 40).map((x, i) => '<tr data-i="' + i + '" style="border-top:1px solid #ffffff14;cursor:pointer"><td>' + (i + 1) + "</td><td>" + esc(x.r.name) + "</td><td>" + esc(x.r.kabupaten || "-") + "</td><td>" + esc(x.imp.level) + "</td><td>" + (x.imp.maxDetour ? "+" + km(x.imp.maxDetour) : "-") + "</td><td>" + (x.imp.isolatedLen ? km(x.imp.isolatedLen) : "-") + "</td><td>" + badge(x.imp) + "</td></tr>").join("");
      o.body.innerHTML = head + '<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:#22d3ee"><th>#</th><th>' + (tab === "j" ? "Jembatan" : "Ruas") + "</th><th>" + (tab === "j" ? "Ruas terdekat" : "Kabupaten") + "</th><th>Dampak jika ditutup</th><th>Memutar</th><th>Terisolasi</th><th>Skor</th></tr></thead><tbody>" + rows + "</tbody></table>";
      o.body.querySelectorAll("button[data-t]").forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
      o.body.querySelectorAll("tr[data-i]").forEach(t => t.onclick = () => {
        const x = (tab === "j" ? bs : rs)[+t.dataset.i]; o.close();
        show(x.imp, tab === "j" ? "Jembatan " + (x.j.nama || x.j.name || "") : "Ruas " + x.r.name);
      });
    };
    draw();
  }

  /* ================= 2. PRIORITAS TERPADU ================= */
  // faktor 0-100 per ruas: kondisi (skor PRO), kritikalitas jaringan, risiko jembatan (Apex)
  function factors() {
    const G = graph(true), R = RD(), pro = new Map(PRO().map(x => [x.r.id, x]));
    const rs = rankRoads(G), crit = new Map(rs.map(x => [x.ri, x.imp.score]));
    const jr = new Map();
    const scoreJ = window.PETAQU_APEX && PETAQU_APEX._t && PETAQU_APEX._t.scoreJ;
    if (scoreJ) scoreJ().forEach(x => {
      if (!okc(x.j.lat) || !okc(x.j.lng)) return;
      const ni = nearestNode(G, { lat: +x.j.lat, lng: +x.j.lng }, 80);
      if (ni >= 0) { const ri = G.nodes[ni].ri; jr.set(ri, Math.max(jr.get(ri) || 0, x.s)); }
    });
    return R.map((r, ri) => ({ r, kondisi: pro.get(r.id) ? Math.min(100, pro.get(r.id).score) : 0, kritikal: crit.get(ri) || 0, jembatan: jr.get(ri) || 0, hasIri: !!(pro.get(r.id) && pro.get(r.id).n) }));
  }
  function composite(rows, w) {
    const s = w.k + w.c + w.j || 1;
    return rows.map(x => { const k = x.kondisi * w.k / s, c = x.kritikal * w.c / s, j = x.jembatan * w.j / s; return { x, k, c, j, total: k + c + j }; }).sort((a, b) => b.total - a.total);
  }
  function prioritas() {
    const o = overlay("Prioritas Terpadu (multi-kriteria)", 900), rows = factors(), w = { k: 50, c: 30, j: 20 };
    const noIri = !rows.some(x => x.hasIri);
    o.body.innerHTML = '<div style="color:#9fb6c3;margin-bottom:8px">Menggabungkan tiga hal: <b>kondisi jalan</b> (skor IRI & survei), <b>kritikalitas jaringan</b> (dampak jika ruas ditutup), dan <b>risiko jembatan</b> pada ruas itu. Geser bobot untuk melihat urutan berubah.' + (noIri ? ' <b style="color:#f59e0b">Belum ada data IRI, jadi faktor kondisi bernilai 0; urutan saat ini ditentukan jaringan dan jembatan.</b>' : "") + '</div><div class="or-w"></div><div class="or-t"></div>';
    const sl = [["k", "Kondisi jalan", "#f43f5e"], ["c", "Kritikalitas jaringan", "#22d3ee"], ["j", "Risiko jembatan", "#f59e0b"]];
    const wbox = o.body.querySelector(".or-w"), tbox = o.body.querySelector(".or-t");
    sl.forEach(s => {
      const d = $("div", "display:flex;align-items:center;gap:8px;margin-bottom:4px", '<span style="width:150px;color:' + s[2] + '">' + s[1] + '</span><input type="range" min="0" max="100" value="' + w[s[0]] + '" style="flex:1"><b class="v" style="width:34px;text-align:right">' + w[s[0]] + "</b>");
      d.querySelector("input").oninput = e => { w[s[0]] = +e.target.value; d.querySelector(".v").textContent = w[s[0]]; render(); };
      wbox.append(d);
    });
    function render() {
      const top = composite(rows, w).slice(0, 25), sum = w.k + w.c + w.j || 1;
      tbox.innerHTML = '<table style="width:100%;border-collapse:collapse;margin-top:8px"><thead><tr style="text-align:left;color:#22d3ee"><th>#</th><th>Ruas</th><th>Kondisi</th><th>Jaringan</th><th>Jembatan</th><th style="width:30%">Skor terpadu</th></tr></thead><tbody>' +
        top.map((t, i) => '<tr data-i="' + i + '" style="border-top:1px solid #ffffff14;cursor:pointer"><td>' + (i + 1) + "</td><td>" + esc(t.x.r.name) + "</td><td>" + Math.round(t.x.kondisi) + "</td><td>" + Math.round(t.x.kritikal) + "</td><td>" + Math.round(t.x.jembatan) + '</td><td><div style="display:flex;height:12px;border-radius:6px;overflow:hidden;background:#0b2a3b"><div style="width:' + t.k + '%;background:#f43f5e"></div><div style="width:' + t.c + '%;background:#22d3ee"></div><div style="width:' + t.j + '%;background:#f59e0b"></div></div><b>' + t.total.toFixed(1) + "</b></td></tr>").join("") + "</tbody></table>" +
        '<div style="color:#9fb6c3;margin-top:6px;font-size:12px">Bobot efektif: kondisi ' + Math.round(100 * w.k / sum) + "%, jaringan " + Math.round(100 * w.c / sum) + "%, jembatan " + Math.round(100 * w.j / sum) + "%. Klik baris untuk terbang ke ruas.</div>";
      tbox.querySelectorAll("tr[data-i]").forEach(t => t.onclick = () => { const r = top[+t.dataset.i].x.r; o.close(); try { focusRoad(r.id); } catch (e) { } });
    }
    render();
  }

  /* ================= 3. CUACA EKSTREM (Open-Meteo) ================= */
  const WK = "pq_weather";
  const rainClass = mm => mm >= 150 ? ["ekstrem", "#a855f7"] : mm >= 100 ? ["sangat lebat", "#f43f5e"] : mm >= 50 ? ["lebat", "#f59e0b"] : mm >= 20 ? ["sedang", "#facc15"] : mm >= 5 ? ["ringan", "#34d399"] : ["kering", "#64748b"];
  function parseWeather(json, locs) {
    const arr = Array.isArray(json) ? json : [json];
    return arr.map((o, i) => {
      const d = (o && o.daily) || {}, t = d.time || [], mm = d.precipitation_sum || [], pr = d.precipitation_probability_max || [];
      return { key: locs[i].key, days: t.map((day, k) => ({ date: day, mm: +mm[k] || 0, prob: pr[k] == null ? null : +pr[k] })) };
    });
  }
  async function fetchWeather(locs) {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + locs.map(l => l.lat).join(",") + "&longitude=" + locs.map(l => l.lng).join(",") + "&daily=precipitation_sum,precipitation_probability_max&timezone=Asia%2FBangkok&forecast_days=7";
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return parseWeather(await r.json(), locs);
  }
  function areas() {
    const A = new Map(), keyOf = (la, ln) => (Math.round(la * 10) / 10).toFixed(1) + "," + (Math.round(ln * 10) / 10).toFixed(1);
    const pro = new Map(PRO().map(x => [x.r.id, x]));
    RD().forEach(r => {
      const p = (r.points || []).filter(q => okc(q.lat) && okc(q.lng)); if (!p.length) return;
      const la = p.reduce((s, q) => s + +q.lat, 0) / p.length, ln = p.reduce((s, q) => s + +q.lng, 0) / p.length, k = keyOf(la, ln);
      let a = A.get(k); if (!a) A.set(k, a = { key: k, lat: +k.split(",")[0], lng: +k.split(",")[1], name: r.kabupaten || "", roads: [], bridges: 0 });
      a.roads.push({ r, score: pro.get(r.id) ? Math.min(100, pro.get(r.id).score) : 0 });
    });
    BR().forEach(j => { if (okc(j.lat) && okc(j.lng)) { const a = A.get(keyOf(+j.lat, +j.lng)); if (a) a.bridges++; } });
    return [...A.values()];
  }
  function riskRows(ar, wx) {
    const out = [];
    ar.forEach(a => {
      const w = wx.find(x => x.key === a.key); if (!w) return;
      const mx = Math.max(0, ...w.days.map(d => d.mm)), s3 = w.days.slice(0, 3).reduce((s, d) => s + d.mm, 0);
      a.roads.forEach(x => out.push({ r: x.r, area: a, mx, s3, score: x.score, risk: Math.round(100 * Math.min(1, Math.max(mx / 100, s3 / 200)) * (0.3 + 0.7 * x.score / 100)) }));
    });
    return out.sort((a, b) => b.risk - a.risk);
  }
  async function cuaca() {
    const o = overlay("Peringatan Cuaca Ekstrem 7 Hari", 940), ar = areas();
    if (!ar.length) { o.body.textContent = "Belum ada ruas berkoordinat."; return; }
    o.body.innerHTML = '<div style="color:#9fb6c3">Mengambil prakiraan hujan untuk ' + ar.length + " area\u2026</div>";
    let wx, note = "";
    try { wx = await fetchWeather(ar); try { localStorage.setItem(WK, JSON.stringify({ t: Date.now(), wx })); } catch (e) { } }
    catch (e) {
      let c = null; try { c = JSON.parse(localStorage.getItem(WK)); } catch (e2) { }
      if (!c) { o.body.innerHTML = '<div style="color:#f59e0b">Prakiraan cuaca tidak dapat diambil (' + esc(e.message) + "). Periksa koneksi internet lalu coba lagi.</div>"; return; }
      wx = c.wx; note = '<div style="color:#f59e0b;margin-bottom:6px">Offline: memakai data tersimpan ' + Math.round((Date.now() - c.t) / 36e5) + " jam lalu.</div>";
    }
    const rows = riskRows(ar, wx), noIri = !PRO().some(x => x.n);
    let h = note + '<div style="color:#9fb6c3;margin-bottom:8px">Sumber: Open-Meteo. Kelas hujan harian mengikuti BMKG (lebat &ge; 50 mm, sangat lebat &ge; 100 mm, ekstrem &ge; 150 mm). Risiko ruas = intensitas hujan &times; tingkat kerusakan ruas.' + (noIri ? " Data IRI belum ada, jadi risiko baru mencerminkan hujan saja." : "") + "</div>";
    wx.forEach(w => {
      const a = ar.find(x => x.key === w.key), mx = Math.max(0, ...w.days.map(d => d.mm)), c = rainClass(mx);
      h += '<div style="border:1px solid #22d3ee33;border-radius:10px;padding:8px;margin-bottom:8px"><b>' + esc(a.name || w.key) + '</b> <span style="color:#9fb6c3">(' + a.roads.length + " ruas, " + a.bridges + ' jembatan)</span> <b style="color:' + c[1] + '">puncak ' + Math.round(mx) + " mm/hari: " + c[0] + '</b><div style="display:flex;gap:4px;margin-top:6px;align-items:flex-end;height:54px">' +
        w.days.map(d => { const k = rainClass(d.mm); return '<div style="flex:1;text-align:center;font-size:10px;color:#9fb6c3"><div title="' + d.date + ": " + Math.round(d.mm) + ' mm" style="height:' + Math.max(3, Math.min(40, d.mm / 150 * 40)) + "px;background:" + k[1] + ';border-radius:3px 3px 0 0"></div>' + d.date.slice(8) + "</div>"; }).join("") + "</div>" +
        (mx >= 50 ? '<div style="margin-top:6px;color:#f59e0b">Saran: periksa drainase & bahu jalan, siapkan penambalan darurat' + (a.bridges ? "; pantau " + a.bridges + " jembatan (gerusan pilar, debit sungai)" : "") + ".</div>" : "") + "</div>";
    });
    h += '<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:#22d3ee"><th>#</th><th>Ruas</th><th>Hujan puncak</th><th>3 hari</th><th>Kerusakan</th><th>Risiko</th></tr></thead><tbody>' +
      rows.slice(0, 20).map((x, i) => '<tr data-i="' + i + '" style="border-top:1px solid #ffffff14;cursor:pointer"><td>' + (i + 1) + "</td><td>" + esc(x.r.name) + "</td><td>" + Math.round(x.mx) + " mm</td><td>" + Math.round(x.s3) + " mm</td><td>" + Math.round(x.score) + '</td><td><b style="color:' + (x.risk >= 50 ? "#f43f5e" : x.risk >= 25 ? "#f59e0b" : "#34d399") + '">' + x.risk + "</b></td></tr>").join("") + "</tbody></table>";
    o.body.innerHTML = h;
    o.body.querySelectorAll("tr[data-i]").forEach(t => t.onclick = () => { const r = rows[+t.dataset.i].r; o.close(); try { focusRoad(r.id); } catch (e) { } });
  }

  /* ================= MENU + PALET ================= */
  const ITEMS = [
    ["Kritikalitas Jaringan", "jembatan/ruas mana yang jika ditutup memutus akses (simulasi + jalur alternatif)", kritikal],
    ["Prioritas Terpadu", "gabungan kondisi, jaringan, jembatan dengan bobot yang bisa digeser", prioritas],
    ["Cuaca Ekstrem 7 Hari", "prakiraan hujan per area dan ruas paling berisiko", cuaca]
  ];
  function menu() {
    const o = overlay("PETAQU Oracle", 560);
    ITEMS.forEach(a => {
      const e = $("div", "padding:10px;border-radius:8px;cursor:pointer;border:1px solid #22d3ee33;margin-bottom:6px", "<b>" + a[0] + '</b><div style="color:#9fb6c3;font-size:12px">' + a[1] + "</div>");
      e.onmouseenter = () => (e.style.background = "#0e749055"); e.onmouseleave = () => (e.style.background = "");
      e.onclick = () => { o.close(); a[2](); };
      o.body.append(e);
    });
  }
  function mount() {
    const b = $("button"); b.innerHTML = '<i class="fa-solid fa-diagram-project"></i>'; b.onclick = menu;
    window.PQ_DOCK ? PQ_DOCK.adopt(b, "Oracle: jaringan, prioritas, cuaca") : (b.style.cssText = "position:fixed;left:10px;bottom:220px;z-index:3900", document.body.append(b));
    const N = window.PETAQU_NEXUS;
    if (N && N.ACT) N.ACT.push(...ITEMS.map(a => [a[0], a[1], a[2]]), ["Bersihkan analisis jaringan", "hapus garis simulasi di peta", clearMap]);
  }
  window.PETAQU_ORACLE = { menu, kritikal, prioritas, cuaca, clear: clearMap, _t: { buildGraph, dijkstra, closure, impact, rankBridges, rankRoads, composite, parseWeather, rainClass, riskRows, segDist } };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => setTimeout(mount, 80)) : setTimeout(mount, 80);
})();
