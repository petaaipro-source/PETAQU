/* PETAQU Guardian: Audit Kualitas Data otomatis + pencocokan Jembatan <-> Ruas
   Mendeteksi: titik lompat/silang, urutan STA kacau, STA vs panjang geometri tidak cocok,
   koordinat di luar Jateng-DIY / lat-lng tertukar, IRI janggal, ruas & jembatan ganda,
   serta jembatan yang tercatat di ruas yang salah. Klik temuan -> peta langsung terbang ke lokasinya. */
(function () {
  "use strict";
  const $ = (t, css, html) => { const e = document.createElement(t); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; };
  const esc = window.esc = window.esc || (s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const say = m => { try { toast(m, 3200); } catch (e) { console.log(m); } };
  const RD = () => (typeof roads !== "undefined" ? roads : []);
  const BR = () => (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []);

  const BBOX = { s: -8.85, n: -5.70, w: 108.45, e: 111.75 }; // Jawa Tengah + DI Yogyakarta (longgar)
  const R = Math.PI / 180;
  const hav = (a, b) => { const dl = (b.lat - a.lat) * R, dg = (b.lng - a.lng) * R, s = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dg / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(s)); };
  const fin = v => v !== null && v !== "" && v !== undefined && isFinite(+v);
  const inBox = (la, ln) => la >= BBOX.s && la <= BBOX.n && ln >= BBOX.w && ln <= BBOX.e;
  const staM = s => { const m = String(s == null ? "" : s).match(/(\d+)\s*\+\s*(\d+)/); return m ? +m[1] * 1000 + +m[2] : null; };
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const STOP = new Set(["jl", "jalan", "ruas", "raya", "kab", "kabupaten", "kota", "cilacap", "banyumas", "jembatan", "no", "nomor"]);
  const tokens = s => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
  const median = a => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

  // jarak titik ke segmen (meter, proyeksi lokal)
  function distSeg(p, a, b) {
    const kx = 111320 * Math.cos(p.lat * R), ky = 110540;
    const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky, bx = (b.lng - p.lng) * kx, by = (b.lat - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(ax + t * dx, ay + t * dy);
  }

  function auditRoad(r, out) {
    const name = r.name || r.id || "(tanpa nama)";
    const raw = r.points || [];
    const pts = raw.filter(p => p && fin(p.lat) && fin(p.lng)).map(p => ({ ...p, lat: +p.lat, lng: +p.lng }));
    const add = (sev, kind, title, detail, at) => out.push({ sev, kind, scope: "ruas", id: r.id, name, title, detail, lat: at && at.lat, lng: at && at.lng });
    if (raw.length - pts.length > 0) add("err", "koordinat", "Titik tanpa koordinat valid", (raw.length - pts.length) + " titik tidak punya lat/lng angka.", pts[0]);
    if (pts.length < 2) { add("err", "titik", "Titik terlalu sedikit", "Hanya " + pts.length + " titik — garis ruas tidak bisa dibentuk.", pts[0]); return; }

    // wilayah / lat-lng tertukar
    const out1 = pts.filter(p => !inBox(p.lat, p.lng));
    if (out1.length) {
      const swapped = out1.filter(p => inBox(p.lng, p.lat)).length;
      add("err", "wilayah", "Koordinat di luar Jateng–DIY",
        out1.length + " titik di luar wilayah" + (swapped ? " (" + swapped + " kemungkinan lat/lng tertukar)" : "") + ".", out1[0]);
    }
    const ok = pts.filter(p => inBox(p.lat, p.lng));
    if (ok.length < 2) return;

    // lompatan / silang
    const gaps = []; for (let i = 1; i < ok.length; i++) gaps.push(hav(ok[i - 1], ok[i]));
    const med = median(gaps), lim = Math.max(300, 6 * med);
    let worst = -1; gaps.forEach((g, i) => { if (g > lim && (worst < 0 || g > gaps[worst])) worst = i; });
    const nJump = gaps.filter(g => g > lim).length;
    if (worst >= 0) {
      const a = ok[worst], b = ok[worst + 1];
      add(nJump > 2 ? "err" : "warn", "lompat", "Titik melompat jauh / rute silang",
        nJump + " lompatan; terbesar " + Math.round(gaps[worst]) + " m antara STA " + (a.sta || "?") + " → " + (b.sta || "?") + " (median antar titik " + Math.round(med) + " m). Coba “Rapikan Rute (Anti-Silang)”.",
        { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 });
    }

    // urutan STA
    const sm = pts.map(p => staM(p.sta)).filter(v => v !== null);
    if (sm.length >= 3) {
      let up = 0, down = 0; for (let i = 1; i < sm.length; i++) { if (sm[i] > sm[i - 1] + 1) up++; else if (sm[i] < sm[i - 1] - 1) down++; }
      if (up && down) add("warn", "urutan", "Urutan STA tidak konsisten", up + " naik vs " + down + " turun — titik kemungkinan tertukar urutannya.", ok[0]);
      // STA vs panjang geometri
      const lenSta = Math.abs(sm[sm.length - 1] - sm[0]);
      const lenGeo = gaps.reduce((a, b) => a + b, 0);
      if (lenSta > 0 && Math.abs(lenGeo - lenSta) / lenSta > 0.15 && Math.abs(lenGeo - lenSta) > 100)
        add("warn", "panjang", "STA tidak cocok dengan panjang garis",
          "Selisih STA = " + Math.round(lenSta) + " m, panjang geometri = " + Math.round(lenGeo) + " m (" + Math.round(100 * (lenGeo - lenSta) / lenSta) + "%).", ok[0]);
    }

    // IRI janggal
    const bad = pts.filter(p => fin(p.iri) && (+p.iri < 0 || +p.iri > 40));
    if (bad.length) add("warn", "iri", "Nilai IRI tidak wajar", bad.length + " titik IRI < 0 atau > 40 m/km (contoh: " + bad[0].iri + " di STA " + (bad[0].sta || "?") + ").", bad[0]);

    // titik kembar beruntun
    const dup = gaps.filter(g => g < 1).length;
    if (dup >= 3) add("info", "kembar", "Titik kembar beruntun", dup + " titik berjarak < 1 m dari titik sebelumnya.", ok[0]);
  }

  function auditRoadsPair(list, out) {
    const seen = {};
    list.forEach(r => { const k = norm(r.name); if (k) (seen[k] = seen[k] || []).push(r); });
    Object.keys(seen).forEach(k => { const g = seen[k]; if (g.length > 1) out.push({ sev: "warn", kind: "ganda", scope: "ruas", id: g[0].id, name: g[0].name, title: "Nama ruas ganda", detail: g.length + " ruas bernama sama: " + g.map(x => x.id).join(", ") + "." }); });
    const ends = list.map(r => { const p = (r.points || []).filter(q => q && fin(q.lat) && fin(q.lng)); return p.length > 1 ? { r, a: { lat: +p[0].lat, lng: +p[0].lng }, b: { lat: +p[p.length - 1].lat, lng: +p[p.length - 1].lng } } : null; }).filter(Boolean);
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
      const x = ends[i], y = ends[j];
      if (norm(x.r.name) === norm(y.r.name)) continue;
      if ((hav(x.a, y.a) < 25 && hav(x.b, y.b) < 25) || (hav(x.a, y.b) < 25 && hav(x.b, y.a) < 25))
        out.push({ sev: "warn", kind: "ganda", scope: "ruas", id: x.r.id, name: x.r.name, title: "Dua ruas berimpit", detail: "Titik awal & akhir sama dengan “" + (y.r.name || y.r.id) + "” (< 25 m) — kemungkinan duplikat.", lat: x.a.lat, lng: x.a.lng });
    }
  }

  function auditBridges(list, rds, out) {
    const segs = []; // {id,name,a,b}
    rds.forEach(r => { const p = (r.points || []).filter(q => q && fin(q.lat) && fin(q.lng)).map(q => ({ lat: +q.lat, lng: +q.lng, sta: q.sta })); for (let i = 1; i < p.length; i++) segs.push({ r, a: p[i - 1], b: p[i] }); });
    const byNo = {}; let unmatched = 0; const matches = [];
    list.forEach(b => {
      const nm = b.nama || b.id || "(tanpa nama)";
      const add = (sev, kind, title, detail) => out.push({ sev, kind, scope: "jembatan", id: b.id, name: nm, title, detail, lat: fin(b.lat) ? +b.lat : undefined, lng: fin(b.lng) ? +b.lng : undefined });
      if (b.nomor) (byNo[b.nomor] = byNo[b.nomor] || []).push(b);
      if (!fin(b.lat) || !fin(b.lng)) { add("err", "koordinat", "Jembatan tanpa koordinat", "Tidak bisa tampil di peta."); return; }
      const p = { lat: +b.lat, lng: +b.lng };
      if (!inBox(p.lat, p.lng)) { add("err", "wilayah", "Koordinat jembatan di luar Jateng–DIY", inBox(p.lng, p.lat) ? "Lat/lng kemungkinan tertukar." : "Periksa kembali koordinatnya."); return; }
      if (fin(b.panjang) && (+b.panjang <= 0 || +b.panjang > 2000)) add("warn", "dimensi", "Panjang jembatan tidak wajar", b.panjang + " m.");
      if (fin(b.tahun) && (+b.tahun < 1800 || +b.tahun > new Date().getFullYear())) add("warn", "dimensi", "Tahun bangun tidak wajar", String(b.tahun));
      // ruas terdekat
      let best = null;
      for (const s of segs) {
        if (Math.abs(s.a.lat - p.lat) > 0.004 && Math.abs(s.b.lat - p.lat) > 0.004) continue; // pra-saring ~450 m
        const d = distSeg(p, s.a, s.b); if (!best || d < best.d) best = { d, s };
      }
      if (!best || best.d > 150) { unmatched++; return; }
      const rn = best.s.r.name || best.s.r.id, ta = tokens(b.ruas), tb = tokens(rn);
      let overlap = 0; ta.forEach(w => { if (tb.has(w)) overlap++; });
      matches.push({ b: nm, road: rn, d: Math.round(best.d) });
      if (ta.size && tb.size && !overlap)
        add("warn", "ruas", "Jembatan mungkin salah ruas", "Tercatat di “" + b.ruas + "”, tetapi " + Math.round(best.d) + " m dari ruas “" + rn + "”.");
    });
    Object.keys(byNo).forEach(k => { const g = byNo[k]; if (g.length > 1) out.push({ sev: "warn", kind: "ganda", scope: "jembatan", id: g[0].id, name: g[0].nama, title: "Nomor jembatan ganda", detail: "Nomor " + k + " dipakai " + g.length + " jembatan: " + g.map(x => x.nama || x.id).join(", ") + ".", lat: fin(g[0].lat) ? +g[0].lat : undefined, lng: fin(g[0].lng) ? +g[0].lng : undefined }); });
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (!fin(a.lat) || !fin(b.lat) || !a.nama || norm(a.nama) !== norm(b.nama)) continue;
      if (hav({ lat: +a.lat, lng: +a.lng }, { lat: +b.lat, lng: +b.lng }) < 200)
        out.push({ sev: "warn", kind: "ganda", scope: "jembatan", id: a.id, name: a.nama, title: "Jembatan kembar", detail: "Nama sama & < 200 m dari “" + (b.nama || b.id) + "”.", lat: +a.lat, lng: +a.lng });
    }
    return { unmatched, matched: matches.length, total: list.length };
  }

  function audit() {
    const out = [], rds = RD(), brs = BR();
    rds.forEach(r => auditRoad(r, out));
    auditRoadsPair(rds, out);
    const bs = auditBridges(brs, rds, out);
    const c = { err: 0, warn: 0, info: 0 }; out.forEach(i => c[i.sev]++);
    const n = rds.length + brs.length || 1;
    const score = Math.max(0, Math.min(100, Math.round(100 - 100 * (2 * c.err + c.warn + 0.2 * c.info) / (2 * n))));
    return { issues: out, counts: c, score, roads: rds.length, bridges: brs.length, bridgeMatch: bs };
  }

  // ---------- UI ----------
  const SEV = { err: ["#f43f5e", "Error"], warn: ["#f59e0b", "Peringatan"], info: ["#22d3ee", "Info"] };
  let pulse = null;
  function fly(it) {
    try {
      if (it.scope === "ruas" && typeof focusRoad === "function") focusRoad(it.id);
      if (typeof map !== "undefined" && it.lat != null && it.lng != null) {
        setTimeout(() => {
          map.flyTo([it.lat, it.lng], Math.max(map.getZoom(), 17), { duration: .8 });
          if (pulse) pulse.remove();
          pulse = L.circleMarker([it.lat, it.lng], { radius: 16, color: SEV[it.sev][0], weight: 3, fillOpacity: .15 }).addTo(map);
          setTimeout(() => { if (pulse) { pulse.remove(); pulse = null; } }, 7000);
        }, 120);
      }
    } catch (e) { console.warn(e); }
  }
  function csv(issues) {
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const rows = [["Tingkat", "Objek", "Nama", "Jenis", "Temuan", "Detail", "Lat", "Lng"]].concat(issues.map(i => [SEV[i.sev][1], i.scope, i.name, i.kind, i.title, i.detail, i.lat, i.lng]));
    const blob = new Blob(["\ufeff" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = $("a"); a.href = URL.createObjectURL(blob); a.download = "audit-kualitas-data-petaqu.csv"; document.body.append(a); a.click(); a.remove();
  }

  function open() {
    const res = audit();
    const bg = $("div", "position:fixed;inset:0;z-index:6500;background:#000b;display:flex;align-items:flex-start;justify-content:center;padding:5vh 10px 10px");
    const box = $("div", "background:#071a26;color:#e6f1f7;border:1px solid #22d3ee66;border-radius:14px;width:min(640px,100%);max-height:90vh;display:flex;flex-direction:column;font:13px system-ui;box-shadow:0 10px 40px #000a");
    const col = res.score >= 85 ? "#34d399" : res.score >= 60 ? "#f59e0b" : "#f43f5e";
    const bm = res.bridgeMatch;
    box.innerHTML =
      '<div style="padding:11px 14px;display:flex;align-items:center;border-bottom:1px solid #ffffff22"><b style="flex:1;font-size:15px"><i class="fa-solid fa-shield-halved" style="color:#22d3ee"></i> Guardian — Audit Kualitas Data</b><button class="gx" style="background:none;border:0;color:#fff;font-size:20px;cursor:pointer">&times;</button></div>' +
      '<div style="padding:12px 14px;display:flex;gap:14px;align-items:center;border-bottom:1px solid #ffffff14">' +
      '<div style="width:68px;height:68px;border-radius:50%;border:5px solid ' + col + ';display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none"><b style="font-size:21px;line-height:1;color:' + col + '">' + res.score + '</b><small style="font-size:9px;color:#9fb6c3">/100</small></div>' +
      '<div style="flex:1;font-size:12px;line-height:1.6;color:#b9ccd6">' + res.roads + ' ruas &amp; ' + res.bridges + ' jembatan diperiksa.<br>' +
      '<span style="color:#f43f5e">' + res.counts.err + ' error</span> · <span style="color:#f59e0b">' + res.counts.warn + ' peringatan</span> · <span style="color:#22d3ee">' + res.counts.info + ' info</span><br>' +
      'Jembatan terpasang di jalur ruas: <b style="color:#e6f1f7">' + bm.matched + '</b> dari ' + bm.total + ' (≤150 m)</div></div>' +
      '<div class="gf" style="padding:8px 14px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;border-bottom:1px solid #ffffff14"></div>' +
      '<div class="gl" style="overflow:auto;padding:8px 14px 12px"></div>';
    bg.append(box); document.body.append(bg);
    const close = () => bg.remove();
    box.querySelector(".gx").onclick = close; bg.onclick = e => { if (e.target === bg) close(); };

    let filt = "all";
    const F = box.querySelector(".gf"), Lw = box.querySelector(".gl");
    const mk = (k, t) => { const b = $("button", "border:1px solid #22d3ee55;background:" + (filt === k ? "#0e7490" : "transparent") + ";color:#fff;border-radius:999px;padding:4px 11px;cursor:pointer;font:600 11.5px system-ui", t); b.onclick = () => { filt = k; draw(); }; return b; };
    function draw() {
      F.innerHTML = "";
      F.append(mk("all", "Semua " + res.issues.length), mk("err", "Error " + res.counts.err), mk("warn", "Peringatan " + res.counts.warn), mk("info", "Info " + res.counts.info));
      const csvB = $("button", "margin-left:auto;background:#0e7490;color:#fff;border:0;border-radius:6px;padding:5px 11px;cursor:pointer;font:600 11.5px system-ui", '<i class="fa-solid fa-file-csv"></i> CSV'); csvB.onclick = () => csv(res.issues); F.append(csvB);
      if (res.issues.some(i => i.kind === "lompat" || i.kind === "urutan") && typeof repairAllRoadRouteOrder === "function") {
        const fx = $("button", "background:#f59e0b;color:#1a1200;border:0;border-radius:6px;padding:5px 11px;cursor:pointer;font:700 11.5px system-ui", '<i class="fa-solid fa-route"></i> Rapikan Rute'); fx.onclick = () => { close(); repairAllRoadRouteOrder(); }; F.append(fx);
      }
      const order = { err: 0, warn: 1, info: 2 };
      const list = res.issues.filter(i => filt === "all" || i.sev === filt).sort((a, b) => order[a.sev] - order[b.sev]);
      Lw.innerHTML = "";
      if (!list.length) Lw.innerHTML = '<div style="padding:22px;text-align:center;color:#34d399">Tidak ada temuan pada kategori ini 🎉</div>';
      list.slice(0, 300).forEach(i => {
        const row = $("div", "padding:9px 10px;margin-bottom:6px;border-radius:9px;border:1px solid #ffffff1a;border-left:4px solid " + SEV[i.sev][0] + ";cursor:" + (i.lat != null || i.scope === "ruas" ? "pointer" : "default") + ";background:#0b2231");
        row.innerHTML = '<div style="display:flex;gap:6px;align-items:baseline"><b style="flex:1">' + esc(i.title) + '</b><small style="color:' + SEV[i.sev][0] + '">' + SEV[i.sev][1] + '</small></div>' +
          '<div style="font-size:11.5px;color:#9fb6c3;margin-top:2px"><i class="fa-solid ' + (i.scope === "ruas" ? "fa-road" : "fa-road-bridge") + '"></i> ' + esc(i.name) + '</div>' +
          '<div style="font-size:12px;margin-top:3px;color:#cfe0e8">' + esc(i.detail) + '</div>';
        row.onclick = () => { if (i.lat != null || i.scope === "ruas") { if (innerWidth <= 860) close(); fly(i); } };
        Lw.append(row);
      });
      if (list.length > 300) Lw.append($("div", "text-align:center;color:#9fb6c3;padding:8px", "Menampilkan 300 pertama — unduh CSV untuk daftar lengkap (" + list.length + ")."));
    }
    draw();
  }

  function mount() {
    const b = $("button"); b.innerHTML = '<i class="fa-solid fa-shield-halved"></i>'; b.onclick = open;
    window.PQ_DOCK ? PQ_DOCK.adopt(b, "Audit kualitas data") : (b.style.cssText = "position:fixed;left:10px;bottom:220px;z-index:3900", document.body.append(b));
    const N = window.PETAQU_NEXUS;
    if (N && N.ACT) N.ACT.push(["Audit Kualitas Data", "cek titik lompat, STA kacau, jembatan salah ruas", open]);
  }

  window.PETAQU_GUARD = { open, audit, _t: { auditRoad, auditBridges, staM, tokens, distSeg } };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount) : setTimeout(mount, 0);
})();
