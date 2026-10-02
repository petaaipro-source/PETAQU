/* PETAQU Cortex: Zona Rawan (klaster DBSCAN), Prediksi Umur Layanan, Prioritas Survei,
   Tanya Data (bahasa alami, toleran typo), Laporan Naratif otomatis */
(function () {
  "use strict";
  const $ = (t, css, html) => { const e = document.createElement(t); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; };
  const esc = window.esc = window.esc || (s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const say = m => { try { toast(m, 3200); } catch (e) { console.log(m); } };
  const RD = () => (typeof roads !== "undefined" ? roads : []);
  const BR = () => (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []);
  const PRO = () => (window.PETAQU_PRO ? PETAQU_PRO.all() : []);
  const ok = p => p && p.iri != null && p.iri !== "" && !isNaN(p.iri);
  const km = m => (m / 1000).toFixed(2) + " km";
  const rp = n => "Rp " + Math.round(n).toLocaleString("id-ID");
  const pct = v => (v * 100).toFixed(0) + "%";
  const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  const HK = "pq_iri_history";
  const hist = () => { try { return JSON.parse(localStorage.getItem(HK)) || {}; } catch (e) { return {}; } };
  const KEYS = ["baik", "sedang", "rr", "rb"], LBL = { baik: "baik", sedang: "sedang", rr: "rusak ringan", rb: "rusak berat" };
  const cat = v => (v <= 4 ? "baik" : v <= 8 ? "sedang" : v <= 12 ? "rusak ringan" : "rusak berat");

  /* ---------- UI helpers ---------- */
  const btn = (id, t, bg) => '<button id="' + id + '" style="background:' + (bg || "#0e7490") + ';color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer">' + t + "</button>";
  const inp = (id, v, w) => '<input id="' + id + '" type="number" value="' + v + '" style="width:' + (w || 70) + 'px;background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:5px">';
  const note = t => '<div style="color:#9fb6c3;font-size:11.5px;margin-top:8px;line-height:1.5">' + t + "</div>";
  const table = (hs, rows) => '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><tr>' + hs.map(h => '<th style="text-align:left;padding:5px 6px;border-bottom:1px solid #22d3ee44;color:#9fb6c3">' + h + "</th>").join("") + "</tr>" + rows.join("") + "</table></div>";
  const tr = (attr, cells) => "<tr " + attr + ' style="cursor:pointer">' + cells.map(c => '<td style="padding:5px 6px;border-bottom:1px solid #ffffff12">' + c + "</td>").join("") + "</tr>";
  const overlay = (title, w) => {
    const bg = $("div", "position:fixed;inset:0;z-index:6500;background:#000b;display:flex;align-items:flex-start;justify-content:center;padding:6vh 10px 10px");
    const box = $("div", "background:#071a26;color:#e6f1f7;border:1px solid #22d3ee66;border-radius:14px;width:min(" + w + "px,100%);max-height:88vh;display:flex;flex-direction:column;font:13px system-ui;box-shadow:0 10px 40px #000a");
    box.innerHTML = '<div style="padding:11px 14px;display:flex;align-items:center;border-bottom:1px solid #ffffff22"><b style="flex:1;font-size:15px">' + title + '</b><button class="cx-x" style="background:none;border:0;color:#fff;font-size:20px;cursor:pointer">\u2715</button></div>';
    const body = $("div", "overflow:auto;padding:12px 14px");
    box.append(body); bg.append(box); document.body.append(bg);
    const close = () => bg.remove();
    box.querySelector(".cx-x").onclick = close;
    bg.addEventListener("mousedown", e => { if (e.target === bg) close(); });
    body.addEventListener("click", e => {
      const f = e.target.closest("[data-fly]"), r = e.target.closest("[data-road]");
      if (f && window.map) { const [la, ln] = f.dataset.fly.split(",").map(Number); close(); map.flyTo([la, ln], 16, { duration: .6 }); }
      else if (r) { close(); try { focusRoad(r.dataset.road); } catch (x) { } }
    });
    return { body, close, q: s => body.querySelector(s) };
  };

  /* ---------- Kabupaten: pencocokan toleran typo ---------- */
  const nk = s => String(s || "").toLowerCase().replace(/\b(kabupaten|kab\.?|kota)\b/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const lev = (a, b) => {
    if (a === b) return 0;
    let p = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const c = [i];
      for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      p = c;
    }
    return p[b.length];
  };
  const kabMap = () => {
    const m = new Map();
    RD().concat(BR()).forEach(x => { const k = nk(x.kabupaten); if (k && !m.has(k)) m.set(k, String(x.kabupaten).replace(/^(kabupaten|kab\.?)\s+/i, "")); });
    return m;
  };
  function findKab(nq) {
    const m = kabMap(), padded = " " + nq + " ";
    for (const k of m.keys()) if (padded.includes(" " + k + " ")) return k;
    const tk = nq.split(" ").filter(w => w.length >= 5);
    for (const k of m.keys()) { const ks = k.replace(/ /g, ""); if (tk.some(w => lev(w, ks) <= (ks.length >= 8 ? 2 : 1))) return k; }
    return null;
  }
  const inKab = (r, k) => !k || nk(r.kabupaten) === k;
  const kabName = k => (k && kabMap().get(k)) || "Seluruh Jaringan";

  /* ---------- 1. ZONA RAWAN: DBSCAN ---------- */
  function dbscan(pts, eps, minPts) {
    const g = new Map(), key = (a, b) => a + "," + b, lab = new Array(pts.length).fill(0);
    pts.forEach((p, i) => { const k = key(Math.floor(p.x / eps), Math.floor(p.y / eps)); if (!g.has(k)) g.set(k, []); g.get(k).push(i); });
    const nb = i => {
      const p = pts[i], cx = Math.floor(p.x / eps), cy = Math.floor(p.y / eps), out = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const c = g.get(key(cx + a, cy + b));
        if (c) for (const j of c) { const q = pts[j]; if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= eps * eps) out.push(j); }
      }
      return out;
    };
    let cid = 0;
    for (let i = 0; i < pts.length; i++) {
      if (lab[i]) continue;
      const n = nb(i);
      if (n.length < minPts) { lab[i] = -1; continue; }
      lab[i] = ++cid;
      const q = n.slice();
      for (let h = 0; h < q.length; h++) {
        const j = q[h];
        if (lab[j] === -1) lab[j] = cid;
        if (lab[j]) continue;
        lab[j] = cid;
        const m = nb(j);
        if (m.length >= minPts) for (const t of m) q.push(t);
      }
    }
    return { lab, cid };
  }
  function zones(th, eps, minPts) {
    const raw = [];
    RD().forEach(r => (r.points || []).forEach(p => { if (ok(p) && +p.iri >= th && isFinite(p.lat) && isFinite(p.lng)) raw.push({ lat: +p.lat, lng: +p.lng, iri: +p.iri, road: r.name, kab: r.kabupaten }); }));
    if (!raw.length) return [];
    const la0 = avg(raw.map(p => p.lat)), ln0 = avg(raw.map(p => p.lng)), kx = 111320 * Math.cos(la0 * Math.PI / 180);
    raw.forEach(p => { p.x = (p.lng - ln0) * kx; p.y = (p.lat - la0) * 110540; });
    const { lab, cid } = dbscan(raw, eps, minPts), out = [];
    for (let c = 1; c <= cid; c++) {
      const m = raw.filter((_, i) => lab[i] === c); if (!m.length) continue;
      const cx = avg(m.map(p => p.x)), cy = avg(m.map(p => p.y)), roads = {}, kabs = new Set();
      m.forEach(p => { roads[p.road] = (roads[p.road] || 0) + 1; if (p.kab) kabs.add(p.kab); });
      out.push({
        n: m.length, mean: avg(m.map(p => p.iri)), max: Math.max(...m.map(p => p.iri)), rb: m.filter(p => p.iri > 12).length,
        lat: la0 + cy / 110540, lng: ln0 + cx / kx, rad: Math.max(...m.map(p => Math.hypot(p.x - cx, p.y - cy))),
        score: m.reduce((s, p) => s + (p.iri - 4), 0), roads: Object.keys(roads).sort((a, b) => roads[b] - roads[a]), kabs: [...kabs]
      });
    }
    return out.sort((a, b) => b.score - a.score);
  }
  let zl = null;
  function zoneClear() { if (zl) { zl.remove(); zl = null; } }
  function zoneDraw(Z) {
    zoneClear(); if (!window.map || !window.L) return;
    zl = L.layerGroup().addTo(map);
    Z.slice(0, 40).forEach((z, i) => L.circle([z.lat, z.lng], { radius: Math.max(z.rad, 40) + 25, color: "#f43f5e", weight: 2, fillColor: "#f43f5e", fillOpacity: .12 }).bindTooltip("Zona #" + (i + 1) + " \u00b7 IRI " + z.mean.toFixed(1)).addTo(zl));
  }
  function zona() {
    const o = overlay("Zona Rawan (Klaster Hotspot)", 780), out = $("div");
    o.body.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">Ambang IRI ' + inp("zt", 8, 55) + " Radius (m) " + inp("ze", 150, 65) + " Min. titik " + inp("zm", 4, 50) + btn("zgo", "Hitung") + btn("zclr", "Bersihkan peta", "#475569") + "</div>";
    o.body.append(out);
    const run = () => {
      const t = +o.q("#zt").value || 8, e = Math.max(30, +o.q("#ze").value || 150), m = Math.max(2, +o.q("#zm").value || 4), Z = zones(t, e, m);
      zoneDraw(Z);
      out.innerHTML = Z.length
        ? '<div style="color:#9fb6c3;margin-bottom:6px"><b style="color:#fff">' + Z.length + "</b> zona ditemukan (IRI \u2265 " + t + ", radius " + e + " m, minimal " + m + " titik), diurutkan menurut keparahan. Lingkaran merah tergambar di peta; klik baris untuk terbang ke zona.</div>" +
          table(["#", "Ruas dominan", "Titik", "IRI rata-rata", "Rusak berat", "Lebar zona"], Z.slice(0, 40).map((z, i) => tr('data-fly="' + z.lat + "," + z.lng + '"', [i + 1, esc(z.roads.slice(0, 2).join(", ")) + (z.kabs.length ? '<div style="color:#9fb6c3;font-size:11px">' + esc(z.kabs.join(", ")) + "</div>" : ""), z.n, z.mean.toFixed(1) + " (maks " + z.max.toFixed(1) + ")", z.rb, "\u00b1" + Math.round(z.rad * 2) + " m"])))
        : "Tidak ada klaster pada parameter ini. Coba turunkan ambang IRI, perbesar radius, atau kurangi minimal titik.";
    };
    o.q("#zgo").onclick = run; o.q("#zclr").onclick = () => { zoneClear(); say("Zona dibersihkan"); };
    out.insertAdjacentHTML("afterend", note("Metode: DBSCAN pada titik STA ber-IRI tinggi. Zona = titik rusak yang berdekatan secara spasial walau berbeda ruas, jadi lebih tepat menunjuk lokasi penanganan terpadu daripada daftar per ruas."));
    run();
  }

  /* ---------- 2. PREDIKSI UMUR LAYANAN ---------- */
  function snapshot() {
    const items = PRO(); if (!items.length) return;
    const h = hist(), today = new Date().toISOString().slice(0, 10);
    items.forEach(x => { if (x.avg == null) return; const a = h[x.r.id] || []; if (!a.length || a[a.length - 1][0] !== today) a.push([today, +x.avg.toFixed(2)]); h[x.r.id] = a.slice(-60); });
    try { localStorage.setItem(HK, JSON.stringify(h)); } catch (e) { }
  }
  function fit(arr) {
    const t = arr.map(s => Date.parse(s[0]) / 864e5), v = arr.map(s => s[1]), n = t.length, mt = avg(t), mv = avg(v);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (t[i] - mt) * (v[i] - mv); sxx += (t[i] - mt) ** 2; syy += (v[i] - mv) ** 2; }
    return { n, slope: sxx ? sxy / sxx : 0, r2: sxx && syy ? sxy * sxy / (sxx * syy) : 0, span: t[n - 1] - t[0], last: v[n - 1], lastT: t[n - 1] };
  }
  const daysTo = (f, th) => (f.last >= th ? 0 : f.slope <= 5e-4 ? null : (th - f.last) / f.slope);
  const when = (f, d) => (d === 0 ? '<span style="color:#f43f5e">sudah terlampaui</span>' : d == null ? '<span style="color:#9fb6c3">tidak diperkirakan</span>' : new Date((f.lastT + d) * 864e5).toLocaleDateString("id-ID", { month: "short", year: "numeric" }));
  function prediksi() {
    const o = overlay("Prediksi Umur Layanan per Ruas", 820), H = hist(), rows = []; let skip = 0;
    PRO().forEach(x => {
      const a = H[x.r.id] || [];
      if (a.length < 3 || x.avg == null) { skip++; return; }
      const f = fit(a); if (f.span < 14) { skip++; return; }
      rows.push({ x, f, d8: daysTo(f, 8), d12: daysTo(f, 12) });
    });
    rows.sort((a, b) => (a.f.last >= 12 ? -1 : 0) - (b.f.last >= 12 ? -1 : 0) || (a.d12 ?? 1e9) - (b.d12 ?? 1e9) || (a.d8 ?? 1e9) - (b.d8 ?? 1e9));
    const conf = r2 => (r2 >= .7 ? "tinggi" : r2 >= .4 ? "sedang" : "rendah");
    o.body.innerHTML = rows.length
      ? '<div style="color:#9fb6c3;margin-bottom:6px">Regresi linier atas riwayat IRI rata-rata tiap ruas. ' + skip + " ruas dilewati (riwayat < 3 catatan atau rentang < 14 hari).</div>" +
        table(["Ruas", "IRI terakhir", "Tren / 90 hari", "Capai 8 (rusak ringan)", "Capai 12 (rusak berat)", "Keyakinan"], rows.slice(0, 50).map(r => tr('data-road="' + esc(r.x.r.id) + '"', [esc(r.x.r.name), r.f.last.toFixed(1), (r.f.slope * 90 >= 0 ? "+" : "") + (r.f.slope * 90).toFixed(2), when(r.f, r.d8), when(r.f, r.d12), conf(r.f.r2) + " (R\u00b2 " + r.f.r2.toFixed(2) + ")"])))
      : "Belum ada ruas dengan riwayat IRI yang cukup (" + skip + " ruas dilewati). Riwayat tercatat otomatis tiap hari aplikasi dibuka; prediksi muncul setelah minimal 3 catatan dalam rentang 14 hari atau lebih.";
    o.body.insertAdjacentHTML("beforeend", note("Perhatian: ini ekstrapolasi linier, bukan model kerusakan perkerasan. Tren hanya bermakna bila data IRI diperbarui lewat survei ulang; bila data tidak berubah, tren akan tampak datar. Pakai sebagai indikasi awal, bukan dasar anggaran."));
  }

  /* ---------- 3. PRIORITAS SURVEI ---------- */
  function survei() {
    const H = hist();
    return PRO().map(x => {
      const pts = x.r.points || [], cov = pts.length ? x.n / pts.length : 0, why = []; let s = 0;
      if (!x.n) { s += 50; why.push("belum ada data IRI"); }
      if (cov < .8) { s += 25 * (1 - cov); if (x.n) why.push("hanya " + pct(cov) + " titik ber-IRI"); }
      if (x.avg != null) { const sev = Math.min(1, Math.max(0, (x.avg - 4) / 8)); s += sev * 35; if (x.avg > 8) why.push("IRI rata-rata " + x.avg.toFixed(1)); }
      if (x.share.rb > .2) { s += 10; why.push(pct(x.share.rb) + " titik rusak berat"); }
      const a = H[x.r.id] || [];
      if (a.length >= 3) { const f = fit(a); if (f.span >= 14 && f.slope * 90 > 0.5) { s += 15; why.push("tren memburuk"); } }
      return { x, s: Math.min(100, Math.round(s)), why };
    }).sort((a, b) => b.s - a.s);
  }
  function jadwal() {
    const o = overlay("Prioritas Survei Ulang", 760), R = survei().slice(0, 30);
    o.body.innerHTML = '<div style="color:#9fb6c3;margin-bottom:6px">Ruas yang paling layak disurvei lebih dulu: belum terukur, cakupan data rendah, kondisi buruk, atau tren memburuk.</div>' +
      table(["Skor", "Ruas", "Panjang", "Alasan"], R.map(r => tr('data-road="' + esc(r.x.r.id) + '"', ["<b>" + r.s + "</b>", esc(r.x.r.name), km(r.x.len), esc(r.why.join("; ") || "pemantauan rutin")])));
    o.body.insertAdjacentHTML("beforeend", note("Skor 0\u2013100 dari bobot tetap (data kosong 50, cakupan 25, keparahan 35, rusak berat 10, tren 15). Data tidak memuat tanggal survei sebenarnya, jadi \"usia data\" tidak dipakai."));
  }

  /* ---------- 4. LAPORAN NARATIF ---------- */
  function stats(k) {
    const it = PRO().filter(x => inKab(x.r, k)), withI = it.filter(x => x.n), n = withI.reduce((s, x) => s + x.n, 0), sh = {};
    KEYS.forEach(c => (sh[c] = n ? withI.reduce((s, x) => s + x.share[c] * x.n, 0) / n : 0));
    return { it, withI, len: it.reduce((s, x) => s + x.len, 0), n, avg: n ? withI.reduce((s, x) => s + x.avg * x.n, 0) / n : null, sh, cost: it.reduce((s, x) => s + x.cost, 0) };
  }
  function narasi(k) {
    const S = stats(k), name = kabName(k), B = BR().filter(j => !k || nk(j.kabupaten) === k), Z = zones(8, 150, 4).filter(z => !k || z.kabs.some(a => nk(a) === k));
    const P = ["LAPORAN KONDISI JARINGAN JALAN \u2014 " + name.toUpperCase() + " (" + new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) + ")"];
    P.push("Cakupan data: " + S.it.length + " ruas dengan total panjang " + km(S.len) + ", " + S.withI.length + " ruas (" + pct(S.it.length ? S.withI.length / S.it.length : 0) + ") sudah memiliki data IRI.");
    if (S.avg != null) {
      P.push("Kondisi: IRI rata-rata tertimbang " + S.avg.toFixed(1) + " m/km (kategori " + cat(S.avg) + "). Dari titik terukur, " + KEYS.map(c => pct(S.sh[c]) + " " + LBL[c]).join(", ") + ".");
      const top = S.it.filter(x => x.n).slice(0, 3);
      if (top.length) P.push("Prioritas penanganan: tiga ruas dengan skor tertinggi adalah " + top.map(x => x.r.name + " (skor " + x.score + ", IRI " + x.avg.toFixed(1) + ", " + km(x.len) + ")").join("; ") + ".");
    } else P.push("Belum ada titik ber-IRI sehingga kondisi jalan belum dapat disimpulkan; survei IRI perlu dilakukan lebih dulu.");
    if (Z.length) P.push("Zona rawan: ditemukan " + Z.length + " klaster titik rusak (IRI \u2265 8). Klaster terparah berada di sekitar " + Z[0].roads[0] + " dengan " + Z[0].n + " titik dan IRI rata-rata " + Z[0].mean.toFixed(1) + ".");
    if (S.cost > 0) P.push("Anggaran: perkiraan kebutuhan penanganan " + rp(S.cost) + " berdasarkan proporsi kerusakan dan harga satuan yang tersimpan di aplikasi (bersifat indikatif).");
    if (B.length) {
      const yr = B.filter(j => +j.tahun > 1800).sort((a, b) => a.tahun - b.tahun), noYr = B.length - yr.length;
      P.push("Jembatan: tercatat " + B.length + " jembatan" + (yr.length ? "; yang tertua dibangun " + yr[0].tahun + " (" + (yr[0].nama || "tanpa nama") + ")" : "") + (noYr ? "; " + noYr + " jembatan belum memiliki tahun pembangunan" : "") + ".");
    }
    P.push("Catatan: IRI dari sensor ponsel merupakan estimasi dan tidak menggantikan pengukuran alat standar (roughometer/laser profiler). Hasil ini perlu diverifikasi sebelum dipakai sebagai dasar keputusan teknis atau anggaran.");
    return P.join("\n\n");
  }
  function laporan(k0) {
    const o = overlay("Laporan Naratif Otomatis", 760), m = kabMap();
    o.body.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><select id="lk" style="background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:6px"><option value="">Seluruh Jaringan</option>' + [...m].map(([k, v]) => '<option value="' + esc(k) + '"' + (k === k0 ? " selected" : "") + ">" + esc(v) + "</option>").join("") + "</select>" + btn("lcp", "Salin") + btn("ldl", "Unduh .txt", "#475569") + '</div><textarea id="lt" style="width:100%;height:46vh;box-sizing:border-box;background:#0b2a3b;color:#e6f1f7;border:1px solid #22d3ee55;border-radius:8px;padding:10px;font:13px/1.55 system-ui"></textarea>';
    const ta = o.q("#lt"), gen = () => { ta.value = narasi(o.q("#lk").value || null); };
    o.q("#lk").onchange = gen; gen();
    o.q("#lcp").onclick = () => { ta.select(); try { navigator.clipboard.writeText(ta.value); say("Laporan disalin"); } catch (e) { document.execCommand("copy"); } };
    o.q("#ldl").onclick = () => { const a = $("a"); a.href = URL.createObjectURL(new Blob([ta.value], { type: "text/plain;charset=utf-8" })); a.download = "laporan-petaqu.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3e3); };
    o.body.insertAdjacentHTML("beforeend", note("Teks disusun dari aturan tetap atas data yang ada (bukan karangan AI), sehingga setiap angka bisa ditelusuri. Boleh diedit sebelum disalin."));
  }

  /* ---------- 5. TANYA DATA (bahasa alami) ---------- */
  const lk = x => '<a href="#" data-pq-focus="' + esc(x.r.id) + '" style="color:#22d3ee">' + esc(x.r.name) + "</a>";
  function cmp(a, b) {
    const A = stats(a), B = stats(b), row = (n, S) => "<b>" + esc(kabName(n)) + "</b>: " + S.it.length + " ruas, " + km(S.len) + ", IRI " + (S.avg != null ? S.avg.toFixed(1) : "\u2013") + ", rusak berat " + pct(S.sh.rb) + ", rusak ringan " + pct(S.sh.rr) + ", estimasi " + rp(S.cost);
    let v = "";
    if (A.avg != null && B.avg != null) v = "<br>Kondisi lebih baik: <b>" + esc(kabName(A.avg <= B.avg ? a : b)) + "</b> (selisih IRI " + Math.abs(A.avg - B.avg).toFixed(1) + ").";
    return row(a, A) + "<br>" + row(b, B) + v;
  }
  function ask(raw) {
    const q = raw.toLowerCase().trim(), k = findKab(nk(q)), where = k ? " di " + esc(kabName(k)) : "";
    let m;
    if ((m = q.match(/bandingkan\s+(.+?)\s+(?:dan|dengan|vs|sama)\s+(.+)$/))) { const a = findKab(nk(m[1])), b = findKab(nk(m[2])); return a && b && a !== b ? cmp(a, b) : null; }
    if (/zona rawan|hotspot|klaster|titik rawan/.test(q)) { zona(); return "Membuka Zona Rawan (klaster titik rusak)."; }
    if (/prediksi|perkiraan umur|kapan.*(rusak|tembus)/.test(q)) { prediksi(); return "Membuka Prediksi Umur Layanan."; }
    if (/survei/.test(q) && /(prioritas|jadwal|dulu|duluan|mana|harus)/.test(q)) {
      const R = survei().filter(r => inKab(r.x.r, k)).slice(0, 5);
      return R.length ? "Disurvei lebih dulu" + where + ":<br>" + R.map((r, i) => (i + 1) + ". " + lk(r.x) + " (skor " + r.s + ": " + esc(r.why.join("; ") || "rutin") + ")").join("<br>") : "Tidak ada ruas" + where + ".";
    }
    if (/laporan|narasi/.test(q)) { laporan(k); return "Membuka Laporan Naratif" + where + "."; }
    if (/jembatan/.test(q) && (m = q.match(/(terpanjang|tertua|terlebar|terbaru)/))) {
      const f = { terpanjang: ["panjang", -1, " m"], terlebar: ["lebar", -1, " m"], tertua: ["tahun", 1, ""], terbaru: ["tahun", -1, ""] }[m[1]];
      const L2 = BR().filter(j => (!k || nk(j.kabupaten) === k) && +j[f[0]] > (f[0] === "tahun" ? 1800 : 0)).sort((a, b) => f[1] * (a[f[0]] - b[f[0]])).slice(0, 5);
      return L2.length ? "Jembatan " + m[1] + where + ":<br>" + L2.map((j, i) => (i + 1) + ". " + esc(j.nama || "tanpa nama") + " \u2014 " + j[f[0]] + f[2] + (j.ruas ? " (" + esc(j.ruas) + ")" : "")).join("<br>") : "Data jembatan" + where + " tidak memuat nilai itu.";
    }
    if (/(terburuk|paling rusak|terparah|paling parah)/.test(q) && /(ruas|jalan)/.test(q)) {
      const L2 = PRO().filter(x => x.avg != null && inKab(x.r, k)).sort((a, b) => b.avg - a.avg).slice(0, 5);
      return L2.length ? "Ruas dengan IRI rata-rata tertinggi" + where + ":<br>" + L2.map((x, i) => (i + 1) + ". " + lk(x) + " \u2014 IRI " + x.avg.toFixed(1) + ", " + km(x.len)).join("<br>") : "Belum ada data IRI" + where + ".";
    }
    if ((m = q.match(/(rusak berat|rusak ringan|sedang|baik)/)) && /(berapa|total|panjang|km)/.test(q)) {
      const c = { "rusak berat": "rb", "rusak ringan": "rr", sedang: "sedang", baik: "baik" }[m[1]], S = stats(k), L2 = S.withI.reduce((s, x) => s + x.len * x.share[c], 0);
      return S.withI.length ? "Perkiraan jalan <b>" + m[1] + "</b>" + where + ": \u2248 <b>" + km(L2) + "</b> dari " + km(S.withI.reduce((s, x) => s + x.len, 0)) + " ruas ber-IRI (proporsi titik dikali panjang ruas; bukan pengukuran per segmen)." : "Belum ada data IRI" + where + ".";
    }
    return null;
  }
  function addMsg(t, h) { const n = document.getElementById("aiMessages"); if (!n) return; const a = $("div"); a.className = "ai-msg " + t; a.innerHTML = h; n.append(a); n.scrollTop = n.scrollHeight; }
  function hook() {
    const t = window.__aiSend;
    if (typeof t !== "function" || t.__pq2) return false;
    window.__aiSend = function () {
      const e = document.getElementById("aiInput"), n = e && e.value.trim();
      if (n) {
        let a = null; try { a = ask(n); } catch (x) { a = null; }
        if (a !== null) { addMsg("user", esc(n)); addMsg("ai", a); e.value = ""; e.style.height = "auto"; return; }
      }
      return t.apply(this, arguments);
    };
    window.__aiSend.__pq2 = 1; return true;
  }

  /* ---------- MENU + PALET ---------- */
  function menu() {
    const o = overlay("PETAQU Cortex", 520), items = [
      ["Zona Rawan", "klaster titik rusak lintas ruas (DBSCAN)", zona],
      ["Prediksi Umur Layanan", "kapan ruas diperkirakan tembus IRI 8 / 12", prediksi],
      ["Prioritas Survei", "ruas yang paling perlu diukur ulang", jadwal],
      ["Laporan Naratif", "narasi kondisi per kabupaten, siap salin", () => laporan(null)]];
    items.forEach(a => { const e = $("div", "padding:10px;border-radius:8px;cursor:pointer;border:1px solid #22d3ee33;margin-bottom:6px", "<b>" + a[0] + '</b><div style="color:#9fb6c3;font-size:12px">' + a[1] + "</div>"); e.onmouseenter = () => (e.style.background = "#0e749055"); e.onmouseleave = () => (e.style.background = ""); e.onclick = () => { o.close(); a[2](); }; o.body.append(e); });
    o.body.append($("div", "color:#9fb6c3;font-size:11.5px;margin-top:6px", "Di chat AI, coba: <i>ruas terburuk di banyumas</i>, <i>bandingkan cilacap dan banyumas</i>, <i>berapa km rusak berat di cilacap</i>, <i>jembatan tertua</i>."));
  }
  function mount() {
    const b = $("button"); b.innerHTML = '<i class="fa-solid fa-brain"></i>'; b.onclick = menu;
    window.PQ_DOCK ? PQ_DOCK.adopt(b, "Cortex: analitik cerdas") : (b.style.cssText = "position:fixed;left:10px;bottom:220px;z-index:3900", document.body.append(b));
    const N = window.PETAQU_NEXUS;
    if (N && N.ACT) N.ACT.push(["Zona Rawan", "klaster titik rusak lintas ruas", zona], ["Prediksi Umur Layanan", "perkiraan waktu tembus IRI 8 / 12", prediksi], ["Prioritas Survei", "ruas yang perlu diukur ulang", jadwal], ["Laporan Naratif", "narasi kondisi siap salin", () => laporan(null)], ["Bersihkan Zona Rawan", "hapus lingkaran zona di peta", zoneClear]);
    setTimeout(snapshot, 1500);
    let tries = 0; const h = setInterval(() => { (hook() || ++tries > 40) && clearInterval(h); }, 500);
  }
  window.PETAQU_CORTEX = { zona, prediksi, jadwal, laporan, menu, ask, _t: { dbscan, zones, fit, daysTo, lev, findKab, nk, narasi, survei } };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => setTimeout(mount, 80)) : setTimeout(mount, 80);
})();
