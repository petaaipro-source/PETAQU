/* PETAQU Strategos: Perencana Paket Pekerjaan Otomatis
   Mengubah data kerusakan (IRI / Scan) menjadi PAKET KONTRAK siap lelang:
   1. Klaster ruas rusak yang berdekatan menjadi paket (batas radius, nilai paket, jumlah ruas)
   2. Hitung RAB penanganan + biaya angkut material dari AMP terdekat (tonase x jarak jalan x tarif)
   3. Deteksi risiko: AMP terlalu jauh (suhu campuran turun), jembatan di lintasan, musim hujan
   4. Alokasi pagu: paket didanai berurutan menurut skor sampai pagu habis, sisanya ditunda
   5. Jendela cuaca 7 hari per paket (Open-Meteo) -> hari kerja efektif
   6. Tampilkan di peta + ekspor Excel (ringkasan paket & rincian ruas)
   Memakai ulang: PETAQU_PRO.all() (skor & biaya), LOKASI_DATA (AMP/BP/Quarry), JEMBATAN_DB. */
(function () {
  "use strict";
  if (window.PETAQU_STRATEGOS) return;

  const $ = (t, css, html) => { const e = document.createElement(t); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rp = n => "Rp " + Math.round(n).toLocaleString("id-ID");
  const rpS = n => n >= 1e9 ? "Rp " + (n / 1e9).toFixed(2) + " M" : n >= 1e6 ? "Rp " + (n / 1e6).toFixed(1) + " jt" : rp(n);
  const say = m => { try { toast(m, 3500); } catch (e) { console.log(m); } };
  const hav = (a, b, c, d) => (typeof haversine === "function" ? haversine(a, b, c, d) : (() => {
    const r = x => x * Math.PI / 180, dl = r(c - a), dg = r(d - b);
    const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dg / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  })());

  const KEY = "pq_strategos_cfg";
  const DEF = {
    radius: 20,        // km, jarak maks. pusat ruas ke pusat paket
    maxNilai: 10e9,    // Rp, nilai pekerjaan maks. per paket
    maxRuas: 12,       // jumlah ruas maks. per paket
    pagu: 0,           // Rp, 0 = tanpa batas pagu
    lebar: 6,          // m, lebar perkerasan rata-rata
    tebal: 0.05,       // m, tebal overlay
    tarif: 1800,       // Rp per ton-km (angkut)
    faktor: 1.3,       // jarak jalan = garis lurus x faktor
    maxAmp: 45,        // km, di atas ini campuran panas berisiko dingin
    jembatanM: 300     // m, jembatan dianggap berada di lintasan paket
  };
  const cfgGet = () => { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { return Object.assign({}, DEF); } };
  const cfgSet = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { } };

  const roadsAll = () => (typeof roads !== "undefined" ? roads : []);
  const jemb = () => (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []);
  const lokasi = () => (window.LOKASI_DATA || []).filter(l => typeof l.lat === "number" && typeof l.lng === "number");
  const kabOf = r => (r.kabupaten || ((r.name || "").split(",").slice(1).join(",").trim()) || "").replace(/^(Kab\.|Kota)\s*/i, "").trim();

  function centroid(r) {
    const p = (r.points || []).filter(x => typeof x.lat === "number" && typeof x.lng === "number");
    if (!p.length) return null;
    let a = 0, b = 0; p.forEach(x => { a += x.lat; b += x.lng; });
    return { lat: a / p.length, lng: b / p.length };
  }

  // panjang yang benar-benar perlu ditangani (m): RB & RR penuh, Sedang 40%; tanpa IRI -> skor/100
  function treated(e) {
    if (e.n > 0) return e.len * (e.share.rb + e.share.rr + 0.4 * e.share.sedang);
    return e.len * Math.min(1, (e.score || 0) / 100);
  }

  function candidates() {
    if (!window.PETAQU_PRO) return [];
    return PETAQU_PRO.all().map(e => {
      const c = centroid(e.r);
      return c && (e.cost > 0 || e.score > 0) ? { e, c, kab: kabOf(e.r), tr: treated(e) } : null;
    }).filter(Boolean).sort((a, b) => b.e.score - a.e.score || b.e.cost - a.e.cost);
  }

  function nearestPlants(c, jenis, k) {
    return lokasi().filter(l => l.jenis === jenis)
      .map(l => ({ l, d: hav(c.lat, c.lng, l.lat, l.lng) }))
      .sort((a, b) => a.d - b.d).slice(0, k || 2);
  }

  function bridgesNear(items, cfg) {
    const J = jemb().filter(j => typeof j.lat === "number" && typeof j.lng === "number");
    if (!J.length) return [];
    let minLa = 90, maxLa = -90, minLn = 180, maxLn = -180;
    items.forEach(it => (it.e.r.points || []).forEach(p => { if (p.lat < minLa) minLa = p.lat; if (p.lat > maxLa) maxLa = p.lat; if (p.lng < minLn) minLn = p.lng; if (p.lng > maxLn) maxLn = p.lng; }));
    const pad = 0.01, tol = cfg.jembatanM / 1000, out = [];
    J.forEach(j => {
      if (j.lat < minLa - pad || j.lat > maxLa + pad || j.lng < minLn - pad || j.lng > maxLn + pad) return;
      for (const it of items) {
        const pts = it.e.r.points || [];
        for (let i = 0; i < pts.length; i++) {
          if (hav(j.lat, j.lng, pts[i].lat, pts[i].lng) <= tol) { out.push(j); return; }
        }
      }
    });
    return out;
  }

  function buildPackage(items, cfg, no) {
    let L = 0, T = 0, cost = 0, sc = 0, la = 0, ln = 0;
    items.forEach(it => { const w = it.e.len || 1; L += it.e.len; T += it.tr; cost += it.e.cost; sc += it.e.score * w; la += it.c.lat * w; ln += it.c.lng * w; });
    const wsum = items.reduce((s, it) => s + (it.e.len || 1), 0) || 1;
    const c = { lat: la / wsum, lng: ln / wsum };
    const skor = Math.round(sc / wsum);
    const ton = T * cfg.lebar * cfg.tebal * 2.3; // massa jenis campuran ~2,3 t/m3
    const amps = nearestPlants(c, "amp", 2), quarry = nearestPlants(c, "quarry", 1)[0] || null;
    const amp = amps[0] || null;
    const dAmp = amp ? amp.d * cfg.faktor : null;
    const haul = dAmp != null ? ton * dAmp * cfg.tarif : 0;
    const br = bridgesNear(items, cfg);
    const kabs = Array.from(new Set(items.map(i => i.kab).filter(Boolean)));
    const bln = new Date().getMonth(); // 0=Jan
    const hujan = bln >= 9 || bln <= 2;
    const risk = [];
    if (!amp) risk.push("Tidak ada data AMP terdekat");
    else if (dAmp > cfg.maxAmp) risk.push("AMP " + dAmp.toFixed(0) + " km (>" + cfg.maxAmp + "): campuran berisiko dingin" + (amps[1] ? ", cek AMP alternatif " + esc(amps[1].l.owner || "") : ""));
    if (br.length) risk.push(br.length + " jembatan di lintasan: koordinasi lalu lintas & batas tonase");
    const tua = br.filter(j => j.tahun && new Date().getFullYear() - j.tahun > 30).length;
    if (tua) risk.push(tua + " jembatan berumur >30 th");
    if (hujan) risk.push("Musim hujan: jadwalkan di hari cerah, siapkan drainase");
    if (kabs.length > 2) risk.push("Lintas " + kabs.length + " kabupaten: koordinasi wilayah");
    const level = skor > 60 ? "Darurat" : skor > 30 ? "Prioritas" : "Terjadwal";
    return {
      no, items, kabs, len: L, treated: T, rab: cost, haul, total: cost + haul, skor, level,
      ton, amp, amp2: amps[1] || null, dAmp, quarry, bridges: br, risk, c,
      efisiensi: cost > 0 ? skor * (T / 1000) / (cost / 1e9) : 0, // skor-km per miliar
      status: "-", cuaca: null
    };
  }

  function plan(cfgIn) {
    const cfg = Object.assign({}, cfgGet(), cfgIn || {});
    const cand = candidates(), used = new Set(), pk = [];
    for (let s = 0; s < cand.length; s++) {
      if (used.has(s)) continue;
      const m = [s]; used.add(s);
      let cost = cand[s].e.cost, cLa = cand[s].c.lat, cLn = cand[s].c.lng;
      while (m.length < cfg.maxRuas) {
        let best = -1, bd = Infinity;
        for (let i = 0; i < cand.length; i++) {
          if (used.has(i)) continue;
          const d = hav(cLa / m.length, cLn / m.length, cand[i].c.lat, cand[i].c.lng);
          if (d <= cfg.radius && d < bd && cost + cand[i].e.cost <= cfg.maxNilai) { bd = d; best = i; }
        }
        if (best < 0) break;
        m.push(best); used.add(best); cost += cand[best].e.cost; cLa += cand[best].c.lat; cLn += cand[best].c.lng;
      }
      pk.push(m.map(i => cand[i]));
    }
    let list = pk.map((items, i) => buildPackage(items, cfg, i + 1));
    list.sort((a, b) => b.skor - a.skor || b.efisiensi - a.efisiensi);
    list.forEach((p, i) => { p.no = i + 1; p.kode = "PKT-" + String(i + 1).padStart(2, "0"); });
    let sisa = cfg.pagu > 0 ? cfg.pagu : Infinity;
    list.forEach(p => {
      if (cfg.pagu > 0) { if (p.total <= sisa) { p.status = "Didanai"; sisa -= p.total; } else p.status = "Ditunda"; }
      else p.status = "Didanai";
    });
    return { cfg, list, sisa: cfg.pagu > 0 ? sisa : null, ruas: cand.length };
  }

  /* ---------- Cuaca (Open-Meteo, gratis, tanpa API key) ---------- */
  async function cuaca(p) {
    const u = "https://api.open-meteo.com/v1/forecast?latitude=" + p.c.lat.toFixed(4) + "&longitude=" + p.c.lng.toFixed(4) + "&daily=precipitation_sum&timezone=auto&forecast_days=7";
    const r = await fetch(u); if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json(), pr = (j.daily && j.daily.precipitation_sum) || [];
    p.cuaca = { kerja: pr.filter(x => x != null && x < 5).length, hujan: pr.reduce((s, x) => s + (x || 0), 0), n: pr.length };
  }

  /* ---------- Peta ---------- */
  let layer = null;
  const MAP = () => (typeof map !== "undefined" ? map : window.map);
  function tampilkan(p) {
    const m = MAP(); if (!m || !window.L) return;
    if (layer) { m.removeLayer(layer); layer = null; }
    layer = L.layerGroup().addTo(m);
    const col = p.level === "Darurat" ? "#f43f5e" : p.level === "Prioritas" ? "#f59e0b" : "#22d3ee";
    const bounds = [];
    p.items.forEach(it => {
      const pts = (it.e.r.points || []).map(x => [x.lat, x.lng]);
      if (pts.length > 1) L.polyline(pts, { color: col, weight: 7, opacity: .85 }).bindTooltip(esc(it.e.r.name) + " - skor " + it.e.score).addTo(layer);
      pts.forEach(x => bounds.push(x));
    });
    const pin = (ll, html, color) => L.circleMarker(ll, { radius: 8, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }).bindPopup(html).addTo(layer);
    if (p.amp) {
      const ll = [p.amp.l.lat, p.amp.l.lng]; bounds.push(ll);
      pin(ll, "<b>AMP terdekat</b><br>" + esc(p.amp.l.owner || "") + "<br>" + p.dAmp.toFixed(1) + " km (jalan, perkiraan)", "#a855f7");
      L.polyline([[p.c.lat, p.c.lng], ll], { color: "#a855f7", weight: 2, dashArray: "6 6" }).addTo(layer);
    }
    if (p.quarry) { const ll = [p.quarry.l.lat, p.quarry.l.lng]; bounds.push(ll); pin(ll, "<b>Quarry terdekat</b><br>" + esc(p.quarry.l.owner || "") + "<br>" + (p.quarry.d * 1).toFixed(1) + " km (garis lurus)", "#84cc16"); }
    p.bridges.forEach(j => pin([j.lat, j.lng], "<b>Jembatan</b><br>" + esc(j.nama || j.name || ""), "#38bdf8"));
    if (bounds.length) m.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
  }

  /* ---------- Ekspor Excel ---------- */
  function ekspor(res) {
    if (typeof XLSX === "undefined") return say("Pustaka Excel belum termuat");
    const a = [["Kode", "Status", "Level", "Skor", "Jumlah Ruas", "Kabupaten", "Panjang (km)", "Panjang Ditangani (km)", "RAB Pekerjaan (Rp)", "Tonase Campuran (ton)", "AMP Terdekat", "Jarak AMP (km, jalan)", "Biaya Angkut (Rp)", "Total (Rp)", "Jembatan", "Cuaca 7 hari: hari kerja", "Catatan Risiko"]];
    res.list.forEach(p => a.push([p.kode, p.status, p.level, p.skor, p.items.length, p.kabs.join(", "), +(p.len / 1000).toFixed(2), +(p.treated / 1000).toFixed(2), Math.round(p.rab), Math.round(p.ton), p.amp ? (p.amp.l.owner || "") : "", p.dAmp != null ? +p.dAmp.toFixed(1) : "", Math.round(p.haul), Math.round(p.total), p.bridges.length, p.cuaca ? p.cuaca.kerja + "/" + p.cuaca.n : "", p.risk.join(" | ")]));
    const dg = res.list.filter(p => p.status === "Didanai");
    a.push([], ["TOTAL DIDANAI", "", "", "", "", "", "", "", Math.round(dg.reduce((s, p) => s + p.rab, 0)), "", "", "", Math.round(dg.reduce((s, p) => s + p.haul, 0)), Math.round(dg.reduce((s, p) => s + p.total, 0))]);
    const b = [["Paket", "Ruas", "Kabupaten", "Panjang (m)", "IRI rata-rata", "Skor", "Biaya (Rp)"]];
    res.list.forEach(p => p.items.forEach(it => b.push([p.kode, it.e.r.name, it.kab, Math.round(it.e.len), it.e.avg == null ? "" : +it.e.avg.toFixed(2), it.e.score, Math.round(it.e.cost)])));
    const c = res.cfg, d = [["Parameter", "Nilai"], ["Radius klaster (km)", c.radius], ["Nilai maks. paket (Rp)", c.maxNilai], ["Ruas maks./paket", c.maxRuas], ["Pagu (Rp)", c.pagu || "tanpa batas"], ["Lebar (m)", c.lebar], ["Tebal overlay (m)", c.tebal], ["Tarif angkut (Rp/ton-km)", c.tarif], ["Faktor jarak jalan", c.faktor], ["Catatan", "Perkiraan awal untuk perencanaan; bukan pengganti survei detail & analisis harga satuan resmi."]];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), "Paket");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b), "Rincian Ruas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d), "Asumsi");
    XLSX.writeFile(wb, "paket-pekerjaan-" + new Date().toISOString().slice(0, 10) + ".xlsx");
  }

  /* ---------- UI ---------- */
  let ov = null, state = null;
  const COL = { Darurat: "#f43f5e", Prioritas: "#f59e0b", Terjadwal: "#34d399" };
  function open() {
    if (ov) ov.remove();
    ov = $("div", "position:fixed;inset:0;z-index:6000;background:#000a;display:flex;align-items:center;justify-content:center;padding:10px");
    const box = $("div", "background:#071a26;color:#e6f1f7;border:1px solid #22d3ee55;border-radius:14px;width:min(1040px,100%);max-height:92vh;display:flex;flex-direction:column;font:13px system-ui");
    ov.append(box); document.body.append(ov);
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    const cfg = cfgGet();
    const inp = (k, label, w, scale) => '<label style="display:flex;flex-direction:column;gap:2px;color:#9fb6c3;font-size:11px">' + label + '<input data-k="' + k + '" data-s="' + (scale || 1) + '" type="number" step="any" value="' + (cfg[k] / (scale || 1)) + '" style="width:' + w + 'px;background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:4px"></label>';
    box.innerHTML = '<div style="padding:12px 14px;display:flex;gap:8px;align-items:center;border-bottom:1px solid #ffffff22"><b style="font-size:15px;flex:1">Strategos \u00b7 Perencana Paket Pekerjaan Otomatis</b><button id="stX" style="background:none;border:0;color:#fff;font-size:20px;cursor:pointer">\u2715</button></div>' +
      '<div style="padding:10px 14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">' +
      inp("pagu", "Pagu (Rp juta, 0=bebas)", 110, 1e6) + inp("maxNilai", "Maks. nilai paket (Rp juta)", 110, 1e6) + inp("radius", "Radius klaster (km)", 80) + inp("maxRuas", "Ruas/paket", 70) + inp("lebar", "Lebar (m)", 60) + inp("tebal", "Tebal (m)", 60) + inp("tarif", "Angkut Rp/ton-km", 90) + inp("maxAmp", "Maks. jarak AMP (km)", 80) +
      '<button id="stGo" style="background:#0e7490;color:#fff;border:0;border-radius:6px;padding:7px 12px;cursor:pointer">Susun Paket</button><button id="stWx" style="background:#7c3aed;color:#fff;border:0;border-radius:6px;padding:7px 12px;cursor:pointer">Cek Cuaca 7 Hari</button><button id="stXl" style="background:#15803d;color:#fff;border:0;border-radius:6px;padding:7px 12px;cursor:pointer">Ekspor Excel</button></div>' +
      '<div id="stSum" style="padding:0 14px 8px"></div><div id="stBody" style="overflow:auto;padding:0 14px 14px"></div>';
    box.querySelector("#stX").onclick = () => ov.remove();
    const read = () => { const c = {}; box.querySelectorAll("input[data-k]").forEach(i => { c[i.dataset.k] = (+i.value || 0) * (+i.dataset.s || 1); }); if (c.radius <= 0) c.radius = DEF.radius; if (c.maxRuas < 1) c.maxRuas = 1; if (c.maxNilai <= 0) c.maxNilai = DEF.maxNilai; return c; };
    const render = () => {
      const s = box.querySelector("#stSum"), body = box.querySelector("#stBody");
      if (!state.list.length) { s.innerHTML = ""; body.innerHTML = '<div style="padding:20px;color:#9fb6c3">Belum ada ruas dengan data IRI atau hasil Scan. Unggah data IRI lewat menu Upload Data, lalu susun ulang paket.</div>'; return; }
      const dg = state.list.filter(p => p.status === "Didanai"), tot = dg.reduce((a, p) => a + p.total, 0);
      s.innerHTML = "<b>" + state.list.length + "</b> paket dari <b>" + state.ruas + "</b> ruas rusak \u00b7 Didanai: <b>" + dg.length + "</b> paket senilai <b>" + rpS(tot) + "</b>" + (state.sisa != null ? " \u00b7 Sisa pagu: <b>" + rpS(state.sisa) + "</b>" : "") + '<div style="color:#9fb6c3;font-size:11px;margin-top:2px">Total = RAB (harga satuan di menu Prioritas & RAB) + biaya angkut campuran dari AMP terdekat. Jarak jalan = garis lurus x ' + state.cfg.faktor + ". Perkiraan perencanaan awal.</div>";
      body.innerHTML = '<table style="width:100%;border-collapse:collapse;min-width:860px"><thead><tr style="text-align:left;color:#22d3ee"><th>Paket</th><th>Wilayah</th><th>Ruas</th><th>Km</th><th>Skor</th><th>RAB</th><th>AMP</th><th>Angkut</th><th>Total</th><th>Cuaca</th><th>Status</th></tr></thead><tbody>' +
        state.list.map((p, i) => '<tr data-i="' + i + '" style="border-top:1px solid #ffffff14;cursor:pointer;vertical-align:top;' + (p.status === "Ditunda" ? "opacity:.55" : "") + '"><td><b>' + p.kode + '</b><div style="color:' + COL[p.level] + ';font-size:11px">' + p.level + '</div></td><td>' + esc(p.kabs.slice(0, 3).join(", ") || "-") + '</td><td>' + p.items.length + '</td><td>' + (p.len / 1000).toFixed(1) + '</td><td><b style="color:' + COL[p.level] + '">' + p.skor + '</b></td><td>' + rpS(p.rab) + '</td><td>' + (p.dAmp == null ? "-" : p.dAmp.toFixed(0) + " km") + '</td><td>' + rpS(p.haul) + '</td><td><b>' + rpS(p.total) + '</b></td><td>' + (p.cuaca ? p.cuaca.kerja + "/" + p.cuaca.n + " hari" : "-") + '</td><td>' + p.status + '</td></tr>' +
          '<tr style="border:0"><td></td><td colspan="10" style="padding-bottom:8px;color:#9fb6c3;font-size:11.5px">' + (p.risk.length ? "\u26a0 " + p.risk.join(" \u00b7 ") : "Tidak ada risiko khusus") + '</td></tr>').join("") + "</tbody></table>";
      body.querySelectorAll("tr[data-i]").forEach(tr => tr.onclick = () => { const p = state.list[+tr.dataset.i]; ov.remove(); tampilkan(p); say(p.kode + ": " + p.items.length + " ruas, " + rpS(p.total)); });
    };
    const go = () => { const c = read(); cfgSet(Object.assign(cfgGet(), c)); state = plan(c); render(); };
    box.querySelector("#stGo").onclick = go;
    box.querySelector("#stXl").onclick = () => state && ekspor(state);
    box.querySelector("#stWx").onclick = async e => {
      if (!state || !state.list.length) return;
      const b = e.target; b.disabled = true; b.textContent = "Mengambil cuaca\u2026";
      let gagal = 0;
      await Promise.all(state.list.slice(0, 15).map(p => cuaca(p).catch(() => { gagal++; })));
      b.disabled = false; b.textContent = "Cek Cuaca 7 Hari"; render();
      if (gagal) say("Cuaca gagal untuk " + gagal + " paket (offline?)");
    };
    go();
  }

  function mount() {
    const b = $("button"); b.innerHTML = '<i class="fa-solid fa-diagram-project"></i>'; b.title = "Strategos: susun paket pekerjaan otomatis"; b.onclick = open;
    window.PQ_DOCK ? PQ_DOCK.adopt(b, "Strategos: paket otomatis") : (b.style.cssText = "position:fixed;left:10px;bottom:220px;z-index:3900", document.body.append(b));
    const N = window.PETAQU_NEXUS;
    if (N && N.ACT) N.ACT.push(["Strategos: Paket Otomatis", "klaster ruas rusak jadi paket + RAB + angkut AMP + cuaca", open]);
  }

  window.PETAQU_STRATEGOS = { open, plan, tampilkan, ekspor, _t: { treated, buildPackage, candidates } };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => setTimeout(mount, 80)) : setTimeout(mount, 80);
})();
