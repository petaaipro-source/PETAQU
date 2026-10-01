/* PETAQU Apex: Dasbor Eksekutif, Titik Kritis, Rute Inspeksi Optimal, Proyeksi Multi-Tahun, Risiko Jembatan */
(function () {
  "use strict";
  const $ = (t, css, html) => { const e = document.createElement(t); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; };
  const esc = window.esc = window.esc || (s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const rp = n => "Rp " + Math.round(n).toLocaleString("id-ID");
  const say = m => { try { toast(m, 3200); } catch (e) { console.log(m); } };
  const RD = () => (typeof roads !== "undefined" ? roads : []);
  const BR = () => (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []);
  const ok = p => p && p.iri != null && p.iri !== "" && !isNaN(p.iri);
  const hav = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r, s = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(s)); };
  const COL = { baik: "#34d399", sedang: "#facc15", rr: "#f59e0b", rb: "#f43f5e" };
  const btn = (id, t, bg) => '<button id="' + id + '" style="background:' + (bg || "#0e7490") + ';color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer">' + t + "</button>";
  const inp = (id, v, w) => '<input id="' + id + '" type="number" value="' + v + '" style="width:' + (w || 90) + 'px;background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:5px">';
  const overlay = (title, w) => {
    const bg = $("div", "position:fixed;inset:0;z-index:6500;background:#000b;display:flex;align-items:flex-start;justify-content:center;padding:6vh 10px 10px");
    const box = $("div", "background:#071a26;color:#e6f1f7;border:1px solid #22d3ee66;border-radius:14px;width:min(" + w + "px,100%);max-height:88vh;display:flex;flex-direction:column;font:13px system-ui;box-shadow:0 10px 40px #000a");
    box.innerHTML = '<div style="padding:11px 14px;display:flex;align-items:center;border-bottom:1px solid #ffffff22"><b style="flex:1;font-size:15px">' + title + '</b><button class="ax-x" style="background:none;border:0;color:#fff;font-size:20px;cursor:pointer">\u2715</button></div>';
    const body = $("div", "overflow:auto;padding:12px 14px");
    box.append(body); bg.append(box); document.body.append(bg);
    const close = () => bg.remove();
    box.querySelector(".ax-x").onclick = close;
    bg.addEventListener("mousedown", e => { if (e.target === bg) close(); });
    return { body, close };
  };
  const fly = (o, p, z) => { if (window.map && p) { o && o.close(); map.flyTo([p.lat, p.lng], z || 17, { duration: .6 }); } };
  const prices = () => { let u = {}; try { u = JSON.parse(localStorage.getItem("pq_unit_price")) || {}; } catch (e) { } return Object.assign({ rb: 2.5e6, rr: 1e6, sedang: 3e5 }, u); };

  /* ---------- 1. DASBOR EKSEKUTIF ---------- */
  function stats() {
    const per = {}, tot = { baik: 0, sedang: 0, rr: 0, rb: 0 }; let km = 0, n = 0, sum = 0;
    RD().forEach(r => {
      const k = r.kabupaten || "Tanpa kabupaten", L = computeLength(r.points || []) / 1000, o = per[k] || (per[k] = { km: 0, sum: 0, n: 0, roads: 0 });
      km += L; o.km += L; o.roads++;
      (r.points || []).forEach(p => { if (!ok(p)) return; o.sum += +p.iri; o.n++; n++; sum += +p.iri; tot[getIriInfo(p.iri).key]++; });
    });
    return { per, tot, km, n, avg: n ? sum / n : null };
  }
  function dashboard() {
    const s = stats(), o = overlay("Dasbor Eksekutif Jaringan", 900), yr = new Date().getFullYear();
    const age = BR().filter(j => j.tahun).map(j => yr - j.tahun), tipe = {};
    BR().forEach(j => { const t = j.tipe || "?"; tipe[t] = (tipe[t] || 0) + 1; });
    const kpi = (l, v, c) => '<div style="flex:1;min-width:130px;background:#0b2a3b;border-radius:10px;padding:10px"><div style="color:#9fb6c3;font-size:11px">' + l + '</div><div style="font-size:20px;font-weight:700;color:' + (c || "#22d3ee") + '">' + v + "</div></div>";
    const T = s.n || 1, seg = k => (s.tot[k] / T * 100);
    const stack = '<div style="display:flex;height:22px;border-radius:6px;overflow:hidden;margin:6px 0">' + ["baik", "sedang", "rr", "rb"].map(k => '<div title="' + k + '" style="width:' + seg(k) + "%;background:" + COL[k] + '"></div>').join("") + '</div><div style="color:#9fb6c3;font-size:11.5px">' + [["baik", "Baik"], ["sedang", "Sedang"], ["rr", "Rusak Ringan"], ["rb", "Rusak Berat"]].map(a => '<span style="color:' + COL[a[0]] + '">\u25A0</span> ' + a[1] + " " + seg(a[0]).toFixed(0) + "%").join(" &nbsp; ") + "</div>";
    const kab = Object.entries(s.per).filter(e => e[1].n).map(e => [e[0], e[1].sum / e[1].n, e[1].km, e[1].roads]).sort((a, b) => b[1] - a[1]);
    const bars = kab.map(k => '<div style="display:flex;align-items:center;gap:8px;margin:3px 0"><span style="width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(k[0]) + '</span><div style="flex:1;background:#0b2a3b;border-radius:4px"><div style="width:' + Math.min(100, k[1] / 16 * 100) + "%;background:" + getIriInfo(k[1]).color + ';height:14px;border-radius:4px"></div></div><b style="width:42px;text-align:right">' + k[1].toFixed(1) + '</b><span style="width:90px;color:#9fb6c3;font-size:11px">' + k[2].toFixed(1) + " km \u00b7 " + k[3] + " ruas</span></div>").join("");
    o.body.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap">' + kpi("Ruas", RD().length) + kpi("Panjang", s.km.toFixed(1) + " km") + kpi("IRI rata-rata", s.avg == null ? "\u2013" : s.avg.toFixed(1), s.avg == null ? "#9fb6c3" : getIriInfo(s.avg).color) + kpi("Titik IRI", s.n.toLocaleString("id-ID")) + kpi("Jembatan", BR().length) + kpi("Umur rata-rata jembatan", age.length ? (age.reduce((a, b) => a + b) / age.length).toFixed(0) + " th" : "\u2013") + "</div>" +
      '<h4 style="margin:14px 0 2px;color:#22d3ee">Kondisi jaringan (porsi titik IRI)</h4>' + (s.n ? stack : "Belum ada data IRI.") +
      '<h4 style="margin:14px 0 4px;color:#22d3ee">IRI rata-rata per kabupaten</h4>' + (bars || "Belum ada data IRI.") +
      '<h4 style="margin:14px 0 4px;color:#22d3ee">Jembatan menurut tipe</h4><div style="color:#9fb6c3">' + Object.entries(tipe).map(e => esc(e[0]) + ": <b style=\"color:#e6f1f7\">" + e[1] + "</b>").join(" &nbsp; ") + "</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' + btn("axK", "Titik Kritis") + btn("axP", "Proyeksi Multi-Tahun") + btn("axJ", "Risiko Jembatan") + btn("axD", "Ekspor PDF", "#15803d") + "</div>";
    const q = i => o.body.querySelector("#" + i);
    q("axK").onclick = () => { o.close(); kritis(); }; q("axP").onclick = () => { o.close(); proyeksi(); };
    q("axJ").onclick = () => { o.close(); risikoJ(); }; q("axD").onclick = pdf;
  }
  function pdf() {
    if (!window.jspdf || !window.PETAQU_PRO) return say("Pustaka PDF belum siap");
    const d = new jspdf.jsPDF(), s = stats();
    d.setFontSize(14); d.text("Ringkasan Kondisi Jaringan Jalan - PETAQU", 14, 16);
    d.setFontSize(10); d.text(new Date().toLocaleDateString("id-ID") + " | " + RD().length + " ruas | " + s.km.toFixed(1) + " km | IRI rata-rata " + (s.avg == null ? "-" : s.avg.toFixed(1)), 14, 23);
    d.autoTable({ startY: 29, styles: { fontSize: 8 }, head: [["#", "Ruas", "Km", "IRI", "Skor", "Biaya (Rp)"]], body: PETAQU_PRO.all().slice(0, 30).map((x, i) => [i + 1, x.r.name, (x.len / 1000).toFixed(2), x.avg == null ? "-" : x.avg.toFixed(1), x.score, Math.round(x.cost).toLocaleString("id-ID")]) });
    d.save("ringkasan-petaqu-" + new Date().toISOString().slice(0, 10) + ".pdf");
  }

  /* ---------- 2. TITIK KRITIS (segmen IRI tinggi + lonjakan mendadak) ---------- */
  function segments(th) {
    const out = [];
    RD().forEach(r => {
      const P = r.points || []; let s = -1;
      const close = e => {
        if (s < 0 || e < s) { s = -1; return; }
        const seg = P.slice(s, e + 1), v = seg.map(p => +p.iri);
        out.push({ r, a: seg[0], b: seg[seg.length - 1], len: computeLength(seg), max: Math.max(...v), avg: v.reduce((x, y) => x + y) / v.length, n: seg.length, mid: seg[seg.length >> 1] });
        s = -1;
      };
      P.forEach((p, i) => { if (ok(p) && +p.iri >= th) { if (s < 0) s = i; } else close(i - 1); });
      close(P.length - 1);
    });
    return out.sort((a, b) => b.max * (b.len + 50) - a.max * (a.len + 50));
  }
  function lonjakan(d) {
    const out = [];
    RD().forEach(r => { const P = r.points || []; for (let i = 1; i < P.length; i++) if (ok(P[i]) && ok(P[i - 1]) && +P[i].iri - +P[i - 1].iri >= d) out.push({ r, p: P[i], from: +P[i - 1].iri, to: +P[i].iri }); });
    return out.sort((a, b) => (b.to - b.from) - (a.to - a.from));
  }
  function kritis() {
    const o = overlay("Titik Kritis Kerusakan", 900);
    o.body.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">Ambang IRI \u2265 ' + inp("axT", 12, 60) + " Jumlah titik rute " + inp("axN", 8, 60) + btn("axG", "Cari") + btn("axR", "Susun Rute Inspeksi", "#15803d") + '</div><div id="axO"></div>';
    let segs = [];
    const run = () => {
      const th = +o.body.querySelector("#axT").value || 12; segs = segments(th); const lj = lonjakan(4);
      o.body.querySelector("#axO").innerHTML = "<div style=\"margin-bottom:6px\"><b>" + segs.length + "</b> segmen kritis ditemukan \u00b7 <b>" + lj.length + "</b> lonjakan mendadak (\u0394IRI \u2265 4)</div>" +
        '<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:#22d3ee"><th>#</th><th>Ruas</th><th>STA</th><th>Panjang</th><th>IRI maks</th><th>IRI rata-rata</th></tr></thead><tbody>' +
        segs.slice(0, 40).map((x, i) => '<tr data-i="' + i + '" style="border-top:1px solid #ffffff14;cursor:pointer"><td>' + (i + 1) + "</td><td>" + esc(x.r.name) + "</td><td>" + esc(x.a.sta || "\u2013") + " \u2192 " + esc(x.b.sta || "\u2013") + "</td><td>" + Math.max(1, Math.round(x.len)) + ' m</td><td><b style="color:#f43f5e">' + x.max.toFixed(1) + "</b></td><td>" + x.avg.toFixed(1) + "</td></tr>").join("") + "</tbody></table>" +
        (lj.length ? '<h4 style="margin:12px 0 4px;color:#22d3ee">Lonjakan mendadak (indikasi lubang / amblas / sambungan rusak)</h4>' + lj.slice(0, 10).map((x, i) => '<div data-j="' + i + '" style="padding:4px 0;border-top:1px solid #ffffff14;cursor:pointer">' + esc(x.r.name) + " \u00b7 STA " + esc(x.p.sta || "\u2013") + " \u00b7 IRI " + x.from.toFixed(1) + " \u2192 <b style=\"color:#f43f5e\">" + x.to.toFixed(1) + "</b></div>").join("") : "");
      o.body.querySelectorAll("tr[data-i]").forEach(t => t.onclick = () => fly(o, segs[+t.dataset.i].mid));
      o.body.querySelectorAll("div[data-j]").forEach(t => t.onclick = () => fly(o, lj[+t.dataset.j].p));
    };
    o.body.querySelector("#axG").onclick = run;
    o.body.querySelector("#axR").onclick = () => { if (!segs.length) return say("Tidak ada segmen kritis"); o.close(); rute(segs.slice(0, Math.max(2, +o.body.querySelector("#axN").value || 8))); };
    run();
  }

  /* ---------- 3. RUTE INSPEKSI OPTIMAL (nearest-neighbor + 2-opt) ---------- */
  let rl = null;
  function tsp(pts) {
    pts = pts.slice(); const tour = [pts.shift()];
    while (pts.length) { const l = tour[tour.length - 1]; let k = 0; pts.forEach((p, i) => { if (hav(l, p) < hav(l, pts[k])) k = i; }); tour.push(pts.splice(k, 1)[0]); }
    let imp = true, it = 0;
    while (imp && it++ < 60) {
      imp = false;
      for (let i = 1; i < tour.length - 1; i++) for (let j = i + 1; j < tour.length; j++) {
        const a = tour[i - 1], b = tour[i], c = tour[j], d = tour[j + 1];
        if (hav(a, c) + (d ? hav(b, d) : 0) < hav(a, b) + (d ? hav(c, d) : 0) - 1) { tour.splice(i, j - i + 1, ...tour.slice(i, j + 1).reverse()); imp = true; }
      }
    }
    return tour;
  }
  const tourLen = t => t.reduce((a, p, i) => a + (i ? hav(t[i - 1], p) : 0), 0);
  function rute(segs) {
    const raw = segs.map(s => ({ lat: s.mid.lat, lng: s.mid.lng, name: s.r.name, sta: s.a.sta || "", max: s.max }));
    const naive = tourLen(raw), tour = tsp(raw), L = tourLen(tour) * 1.3, o = overlay("Rute Inspeksi Optimal", 760);
    const eta = L / 1000 / 30 * 60 + tour.length * 10;
    o.body.innerHTML = "<div style=\"margin-bottom:8px\"><b>" + tour.length + "</b> titik \u00b7 \u2248 <b>" + (L / 1000).toFixed(1) + " km</b> \u00b7 estimasi <b>" + Math.floor(eta / 60) + " j " + Math.round(eta % 60) + " mnt</b> (30 km/j + 10 mnt/titik) \u00b7 hemat <b style=\"color:#34d399\">" + (naive > 0 ? Math.max(0, Math.round((1 - tourLen(tour) / naive) * 100)) : 0) + "%</b> dibanding urutan skor</div>" +
      tour.map((p, i) => '<div style="padding:4px 0;border-top:1px solid #ffffff14"><b style="color:#22d3ee">' + (i + 1) + ".</b> " + esc(p.name) + " \u00b7 STA " + esc(p.sta || "\u2013") + " \u00b7 IRI maks " + p.max.toFixed(1) + "</div>").join("") +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' + btn("axMp", "Tampilkan di peta") + btn("axGm", "Buka Google Maps", "#15803d") + btn("axGp", "Unduh GPX", "#7c3aed") + "</div>";
    const q = i => o.body.querySelector("#" + i);
    q("axMp").onclick = () => {
      if (!window.map) return; rl && rl.remove();
      rl = L.layerGroup([L.polyline(tour.map(p => [p.lat, p.lng]), { color: "#22d3ee", weight: 4, dashArray: "8 8" })].concat(tour.map((p, i) => L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", iconSize: [24, 24], html: '<div style="width:24px;height:24px;border-radius:50%;background:#0e7490;color:#fff;border:2px solid #fff;font:700 12px/20px system-ui;text-align:center">' + (i + 1) + "</div>" }) })))).addTo(map);
      map.fitBounds(L.latLngBounds(tour.map(p => [p.lat, p.lng])).pad(.2)); o.close(); say("Rute inspeksi tampil (palet: \"Bersihkan rute\")");
    };
    q("axGm").onclick = () => window.open("https://www.google.com/maps/dir/" + tour.map(p => p.lat + "," + p.lng).join("/"), "_blank", "noopener");
    q("axGp").onclick = () => {
      const g = '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="PETAQU" xmlns="http://www.topografix.com/GPX/1/1">' + tour.map((p, i) => '<wpt lat="' + p.lat + '" lon="' + p.lng + '"><name>' + (i + 1) + ". " + esc(p.name) + " STA " + esc(p.sta) + "</name></wpt>").join("") + "<rte><name>Inspeksi PETAQU</name>" + tour.map(p => '<rtept lat="' + p.lat + '" lon="' + p.lng + '"/>').join("") + "</rte></gpx>";
      const a = $("a"); a.href = URL.createObjectURL(new Blob([g], { type: "application/gpx+xml" })); a.download = "rute-inspeksi.gpx"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    return tour;
  }

  /* ---------- 4. PROYEKSI MULTI-TAHUN ---------- */
  function simulate(years, budget, rate) {
    if (!window.PETAQU_PRO) return null;
    const pr = prices(), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const mk = () => PETAQU_PRO.all().filter(x => x.avg != null && x.len > 0).map(x => { const t = PETAQU_PRO.trend(x.r.id); return { len: x.len, iri: x.avg, slope: t.slope != null ? clamp(t.slope * 365, .1, 1.5) : rate }; });
    const A = mk(), B = mk(), W = a => { const L = a.reduce((s, x) => s + x.len, 0) || 1; return a.reduce((s, x) => s + x.iri * x.len, 0) / L; };
    const bad = a => a.reduce((s, x) => s + (x.iri > 8 ? x.len : 0), 0) / 1000;
    const rows = [{ y: 0, a: W(A), b: W(B), ka: bad(A), kb: bad(B), spend: 0 }]; let tot = 0;
    for (let y = 1; y <= years; y++) {
      A.forEach(x => x.iri += x.slope); B.forEach(x => x.iri += x.slope);
      let left = budget, spent = 0;
      B.map(x => ({ x, c: x.len * (x.iri > 12 ? pr.rb : x.iri > 8 ? pr.rr : pr.sedang) })).filter(e => e.x.iri > 8).sort((p, q) => (q.x.iri * q.x.len) / q.c - (p.x.iri * p.x.len) / p.c).forEach(e => { if (e.c <= left) { left -= e.c; spent += e.c; e.x.iri = 3; } });
      tot += spent; rows.push({ y, a: W(A), b: W(B), ka: bad(A), kb: bad(B), spend: spent });
    }
    return { rows, tot };
  }
  function proyeksi() {
    if (!window.PETAQU_PRO) return say("Modul prioritas belum siap");
    const base = PETAQU_PRO.all().reduce((a, b) => a + b.cost, 0), o = overlay("Proyeksi Kondisi Jaringan Multi-Tahun", 900);
    o.body.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">Horizon (tahun) ' + inp("axY", 5, 55) + " Anggaran/tahun (Rp) " + inp("axB", Math.round(base * .15), 150) + " Laju kerusakan default (IRI/th) " + inp("axL", .6, 60) + btn("axS", "Simulasikan") + '</div><div id="axO"></div><div style="color:#9fb6c3;margin-top:8px;font-size:11.5px">Laju per ruas memakai tren riwayat IRI bila ada (batas 0,1\u20131,5/th), selain itu laju default. Ruas IRI > 8 ditangani per tahun berdasarkan rasio manfaat/biaya hingga anggaran habis; hasil penanganan diasumsikan IRI 3. Harga satuan mengikuti menu Prioritas & RAB (asumsi).</div>';
    const run = () => {
      const g = i => +o.body.querySelector("#" + i).value, r = simulate(Math.max(1, Math.min(15, g("axY") | 0)), g("axB") || 0, g("axL") || .6);
      if (!r || r.rows.length < 2 || r.rows[0].a == null) { o.body.querySelector("#axO").textContent = "Belum ada data IRI untuk disimulasikan."; return; }
      const W = 840, H = 220, m = 34, n = r.rows.length - 1, mx = Math.max(8, ...r.rows.map(x => Math.max(x.a, x.b))) * 1.05;
      const X = i => m + i / n * (W - m - 10), Y = v => H - 24 - v / mx * (H - 40), pl = k => r.rows.map((x, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(x[k]).toFixed(1)).join("");
      o.body.querySelector("#axO").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" style="width:100%;background:#0b2a3b;border-radius:10px"><line x1="' + m + '" x2="' + (W - 10) + '" y1="' + Y(8) + '" y2="' + Y(8) + '" stroke="#f59e0b" stroke-dasharray="4 4" opacity=".6"/><text x="' + (W - 12) + '" y="' + (Y(8) - 4) + '" fill="#f59e0b" font-size="10" text-anchor="end">batas rusak (IRI 8)</text><path d="' + pl("a") + '" fill="none" stroke="#f43f5e" stroke-width="2.4"/><path d="' + pl("b") + '" fill="none" stroke="#34d399" stroke-width="2.4"/>' +
        r.rows.map((x, i) => '<text x="' + X(i) + '" y="' + (H - 6) + '" fill="#9fb6c3" font-size="10" text-anchor="middle">T+' + i + "</text>").join("") + '<text x="8" y="14" fill="#f43f5e" font-size="11">\u25A0 tanpa penanganan</text><text x="150" y="14" fill="#34d399" font-size="11">\u25A0 dengan anggaran</text></svg>' +
        '<table style="width:100%;border-collapse:collapse;margin-top:8px"><thead><tr style="text-align:left;color:#22d3ee"><th>Tahun</th><th>IRI tanpa</th><th>IRI dengan</th><th>Km rusak tanpa</th><th>Km rusak dengan</th><th>Dana terpakai</th></tr></thead><tbody>' +
        r.rows.map(x => '<tr style="border-top:1px solid #ffffff14"><td>T+' + x.y + "</td><td>" + x.a.toFixed(1) + "</td><td>" + x.b.toFixed(1) + "</td><td>" + x.ka.toFixed(1) + "</td><td>" + x.kb.toFixed(1) + "</td><td>" + (x.y ? rp(x.spend) : "\u2013") + "</td></tr>").join("") + '</tbody></table><div style="margin-top:8px">Total dana <b>' + rp(r.tot) + "</b> \u00b7 selisih akhir IRI <b style=\"color:#34d399\">" + (r.rows[n].a - r.rows[n].b).toFixed(1) + "</b> poin \u00b7 km rusak berkurang <b style=\"color:#34d399\">" + (r.rows[n].ka - r.rows[n].kb).toFixed(1) + "</b> km</div>";
    };
    o.body.querySelector("#axS").onclick = run; run();
  }

  /* ---------- 5. RISIKO JEMBATAN ---------- */
  function scoreJ() {
    const yr = new Date().getFullYear(), bad = [];
    RD().forEach(r => (r.points || []).forEach(p => { if (ok(p) && +p.iri >= 12) bad.push(p); }));
    return BR().map(j => {
      let s = 0; const why = [], age = j.tahun ? yr - j.tahun : null;
      if (age == null) { s += 10; why.push("tahun bangun tidak tercatat"); } else if (age >= 30) { s += Math.min(40, 20 + (age - 30)); why.push("umur " + age + " th"); } else if (age >= 15) s += age - 10;
      if (j.panjang >= 30) { s += 15; why.push("bentang " + j.panjang + " m"); } else if (j.panjang >= 15) s += 7;
      if (!j.lebar) { s += 5; why.push("lebar kosong"); }
      if (typeof j.lat === "number") { let mn = 1e9; bad.forEach(p => { const d = hav(j, p); if (d < mn) mn = d; }); if (mn <= 500) { s += 25; why.push("jalan IRI \u2265 12 pada " + Math.round(mn) + " m"); } }
      return { j, s: Math.min(100, s), why };
    }).sort((a, b) => b.s - a.s);
  }
  function risikoJ() {
    const rows = scoreJ(), o = overlay("Skor Risiko Jembatan", 860);
    o.body.innerHTML = '<div style="color:#9fb6c3;margin-bottom:8px">Skor 0\u2013100 dari umur, bentang, kelengkapan data, dan kedekatan dengan jalan rusak berat. Ini penyaring prioritas inspeksi, bukan penilaian struktur.</div><table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:#22d3ee"><th>#</th><th>Jembatan</th><th>Ruas</th><th>Skor</th><th>Faktor</th></tr></thead><tbody>' +
      rows.slice(0, 30).map((x, i) => '<tr data-i="' + i + '" style="border-top:1px solid #ffffff14;cursor:pointer"><td>' + (i + 1) + "</td><td>" + esc(x.j.nama || x.j.name || "\u2013") + "</td><td>" + esc(x.j.ruas || "\u2013") + '</td><td><b style="color:' + (x.s > 60 ? "#f43f5e" : x.s > 35 ? "#f59e0b" : "#34d399") + '">' + x.s + '</b></td><td style="color:#9fb6c3">' + esc(x.why.join("; ") || "\u2013") + "</td></tr>").join("") + "</tbody></table>";
    o.body.querySelectorAll("tr[data-i]").forEach(t => t.onclick = () => { const j = rows[+t.dataset.i].j; o.close(); try { focusJembatan(j.id); } catch (e) { fly(null, j); } });
  }

  /* ---------- MENU + PALET ---------- */
  function menu() {
    const o = overlay("PETAQU Apex", 520), items = [["Dasbor Eksekutif", "KPI jaringan, kondisi per kabupaten, ekspor PDF", dashboard], ["Titik Kritis", "segmen IRI tinggi & lonjakan mendadak", kritis], ["Proyeksi Multi-Tahun", "simulasi kondisi dengan/tanpa anggaran", proyeksi], ["Risiko Jembatan", "skor prioritas inspeksi jembatan", risikoJ]];
    items.forEach(a => { const e = $("div", "padding:10px;border-radius:8px;cursor:pointer;border:1px solid #22d3ee33;margin-bottom:6px", "<b>" + a[0] + '</b><div style="color:#9fb6c3;font-size:12px">' + a[1] + "</div>"); e.onmouseenter = () => (e.style.background = "#0e749055"); e.onmouseleave = () => (e.style.background = ""); e.onclick = () => { o.close(); a[2](); }; o.body.append(e); });
  }
  function mount() {
    const b = $("button"); b.innerHTML = '<i class="fa-solid fa-chart-line"></i>'; b.onclick = menu;
    window.PQ_DOCK ? PQ_DOCK.adopt(b, "Apex: dasbor & analitik") : (b.style.cssText = "position:fixed;left:10px;bottom:170px;z-index:3900", document.body.append(b));
    const N = window.PETAQU_NEXUS;
    if (N && N.ACT) N.ACT.push(["Dasbor Eksekutif", "KPI jaringan & ekspor PDF", dashboard], ["Titik Kritis", "segmen IRI tinggi, lonjakan, rute inspeksi", kritis], ["Proyeksi Multi-Tahun", "simulasi dengan/tanpa anggaran", proyeksi], ["Risiko Jembatan", "skor prioritas inspeksi", risikoJ], ["Bersihkan rute inspeksi", "hapus garis rute di peta", () => { rl && rl.remove(); rl = null; }]);
  }
  window.PETAQU_APEX = { dashboard, kritis, proyeksi, risikoJ, menu, _t: { segments, lonjakan, tsp, simulate, scoreJ, stats } };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => setTimeout(mount, 50)) : setTimeout(mount, 50);
})();
