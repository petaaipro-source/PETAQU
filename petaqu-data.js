/* PETAQU — Upload & Perbarui Data (ruas jalan + jembatan), mandiri tanpa GitHub.
   Alur: seret file Excel/CSV -> jenis data dikenali otomatis -> pratinjau (baru/diperbarui/sama, QA koordinat)
         -> Terapkan (langsung tampil di peta, tersimpan di perangkat) -> cadangan otomatis + Urungkan.
   Untuk dipakai semua pengguna perangkat lain: Unduh data-ruas.js / data-jembatan.js lalu unggah ke GitHub (opsional).
   Memakai parser PETAQU_CONVERT (petaqu-convert.js) agar format kolom sama dengan "Konversi ke JS". */
(function () {
  "use strict";
  if (window.__pqData) return; window.__pqData = 1;

  const $ = id => document.getElementById(id), C = () => window.PETAQU_CONVERT;
  const BB = { la: [-8.95, -5.6], ln: [108.3, 111.95] };           // kotak Jawa Tengah + DIY
  const GONE = "pq_gone_roads", R_KEY = "peta_ruas_jalan_cilacap_v1", B_KEY = "petaqu_jembatan_v1";
  const KNOWN = new Set(("ruas namaruas jalan namajalan road id kabupaten kab kota kabkota sta km station latitude lat lintang y longitude lng lon long bujur x " +
    "tipe type jenis tipejembatan iri irimkm nilaiiri lebar lebarm lebarjembatan kondisi kondisijalan tahun tahunpembangunan tahunkonstruksi thn perkerasan " +
    "keterangan catatan ket riwayat panjang panjangm panjangjembatan no nomorurut urut nomor nomorjembatan nojembatan kode kodejembatan nama namajembatan jembatan").split(" "));
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const slug = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const note = (m, e) => { try { toast(m, !!e); } catch (_) { alert(m); } };
  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (_) { return d; } };
  const fmt = n => (+n || 0).toLocaleString("id-ID");
  const cp = o => JSON.parse(JSON.stringify(o));
  const inBB = (a, b) => a >= BB.la[0] && a <= BB.la[1] && b >= BB.ln[0] && b <= BB.ln[1];
  const hav = (a, b) => { const t = Math.PI / 180, x = Math.sin((b.lat - a.lat) * t / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin((b.lng - a.lng) * t / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(x)); };
  const liveR = () => typeof roads !== "undefined" ? roads : [];
  const liveB = () => typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : [];
  const seedIds = () => typeof ROADS_SEED !== "undefined" ? ROADS_SEED.map(r => r.id) : [];
  const bKey = b => b.nomor ? "n:" + b.nomor : "m:" + slug(b.nama) + "|" + slug(b.ruas);
  const bSig = b => JSON.stringify([b.nama, b.lat, b.lng, b.panjang, b.lebar, b.tipe, b.tahun, b.ruas, b.kabupaten, b.nomor]);
  const rSig = r => (r.name || "") + "|" + JSON.stringify(r.points || []);

  /* ---------- Cadangan (IndexedDB, 8 terakhir) ---------- */
  const idb = () => new Promise((ok, no) => { const q = indexedDB.open("pq_data", 1); q.onupgradeneeded = () => q.result.createObjectStore("bak", { keyPath: "t" }); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
  const bakAll = async () => { try { const d = await idb(); return await new Promise(ok => { const r = d.transaction("bak").objectStore("bak").getAll(); r.onsuccess = () => ok(r.result.sort((a, b) => b.t - a.t)); r.onerror = () => ok([]); }); } catch (_) { return []; } };
  async function bakPut(label) {
    try {
      const d = await idb(), rec = { t: Date.now(), label, roads: cp(liveR()), jbt: cp(liveB()) };
      await new Promise(ok => { const tx = d.transaction("bak", "readwrite"); tx.objectStore("bak").put(rec); tx.oncomplete = ok; tx.onerror = ok; });
      const all = await bakAll(); if (all.length > 8) await new Promise(ok => { const tx = d.transaction("bak", "readwrite"); all.slice(8).forEach(x => tx.objectStore("bak").delete(x.t)); tx.oncomplete = ok; tx.onerror = ok; });
    } catch (e) { console.warn("PQ_DATA backup", e); }
  }

  /* ---------- Meter kapasitas memori ---------- */
  const LS_MAX = 5 * 1024 * 1024, lsLen = k => { const v = localStorage.getItem(k); return v ? k.length + v.length : 0; };
  const mb = n => n >= 1048576 ? (n / 1048576).toFixed(2) + " MB" : n >= 1024 ? Math.round(n / 1024) + " KB" : n + " B";
  const bar = (parts, tot) => '<div class="pqd-bar">' + parts.filter(p => p[0] > 0).map(p => '<i style="width:' + Math.max(p[0] / tot * 100, .8).toFixed(2) + "%;background:" + p[1] + '" title="' + p[2] + " " + mb(p[0]) + '"></i>').join("") + "</div>";
  const lg = parts => '<div class="pqd-lg">' + parts.map(p => '<span><em style="background:' + p[1] + '"></em>' + p[2] + " <b>" + mb(p[0]) + "</b></span>").join("") + "</div>";
  async function clearBak() { try { const d = await idb(); await new Promise(ok => { const tx = d.transaction("bak", "readwrite"); tx.objectStore("bak").clear(); tx.oncomplete = ok; tx.onerror = ok; }); } catch (_) { } histDraw(); note("Cadangan dikosongkan"); }
  async function memDraw() {
    const el = $("pqdMem"); if (!el) return;
    let tot = 0; for (let i = 0; i < localStorage.length; i++) tot += lsLen(localStorage.key(i));
    const r = lsLen(R_KEY), b = lsLen(B_KEY), o = Math.max(0, tot - r - b), free = Math.max(0, LS_MAX - tot), pct = Math.min(100, tot / LS_MAX * 100), cls = pct > 85 ? "bad" : pct > 65 ? "mid" : "ok";
    let est = null, per = false; try { est = await navigator.storage.estimate(); per = await navigator.storage.persisted(); } catch (_) { }
    const d = est && est.usageDetails || {}, ix = d.indexedDB || 0, ca = d.caches || 0, use = est ? est.usage || 0 : 0, q = est ? est.quota || 0 : 0, ot = Math.max(0, use - ix - ca);
    el.innerHTML = '<h4><span>Memori data PETAQU</span><span class="' + cls + '">' + pct.toFixed(1) + "% terpakai · sisa " + mb(free) + "</span></h4>" +
      bar([[r, "#22d3ee", "Ruas jalan"], [b, "#a78bfa", "Jembatan"], [o, "#64748b", "Lainnya"], [free, "#1e293b", "Sisa"]], LS_MAX) +
      lg([[r, "#22d3ee", "Ruas jalan"], [b, "#a78bfa", "Jembatan"], [o, "#64748b", "Pengaturan lain"], [free, "#334155", "Sisa bebas"]]) +
      (est ? '<h4 style="margin-top:12px"><span>Penyimpanan perangkat</span><span>' + (use / q * 100).toFixed(2) + "% dari " + mb(q) + "</span></h4>" +
        bar([[ix, "#f59e0b", "Cadangan"], [ca, "#34d399", "Cache offline"], [ot, "#64748b", "Lainnya"], [Math.max(0, q - use), "#1e293b", "Sisa"]], q) +
        lg([[ix, "#f59e0b", "Cadangan"], [ca, "#34d399", "Cache offline"], [ot, "#64748b", "Lainnya"], [Math.max(0, q - use), "#334155", "Sisa bebas"]]) : "") +
      "<small>" + (pct > 85 ? "⚠ Hampir penuh — unduh data .js lalu kosongkan cadangan agar upload berikutnya tidak gagal. " : pct > 65 ? "Mulai terisi; pantau sebelum upload besar. " : "Kapasitas aman. ") +
      (per ? "Penyimpanan ditetapkan permanen (tidak dihapus otomatis browser)." : '<a href="#" id="pqdPer" style="color:#22d3ee">Minta penyimpanan permanen</a> agar browser tidak menghapus data saat memori HP menipis.') +
      ' · <a href="#" id="pqdClr" style="color:#22d3ee">Kosongkan cadangan</a></small>';
    const pe = $("pqdPer"); if (pe) pe.onclick = async e => { e.preventDefault(); try { note(await navigator.storage.persist() ? "Penyimpanan permanen aktif" : "Browser belum mengizinkan (coba setelah memasang aplikasi ke layar utama)", false); } catch (_) { } memDraw(); };
    $("pqdClr").onclick = e => { e.preventDefault(); clearBak().then(memDraw); };
  }

  /* ---------- Baca file + deteksi jenis ---------- */
  async function readFile(f) {
    if (!window.XLSX || !C()) throw new Error("Library Excel / konverter belum termuat, coba lagi sebentar");
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    const hdr = (rows.find(r => r.filter(String).length > 2) || rows[0] || []).map(String).filter(Boolean);
    const nh = hdr.map(norm), hasSta = nh.some(h => ["sta", "km", "station"].includes(h));
    let kind = S.force === "auto" ? (hasSta ? "ruas" : "jembatan") : S.force, parsed = parse(kind, wb, f.name);
    if (S.force === "auto" && !parsed.count) { const alt = kind === "ruas" ? "jembatan" : "ruas", p2 = parse(alt, wb, f.name); if (p2.count) { kind = alt; parsed = p2; } }
    return { f, kind, parsed, ignored: hdr.filter(h => !KNOWN.has(norm(h))) };
  }
  const parse = (k, wb, n) => { try { return k === "ruas" ? C().parseRoads(wb, n) : C().parseBridges(wb); } catch (e) { return { data: [], warn: [e.message], count: 0 }; } };

  /* ---------- Analisis: diff + QA ---------- */
  function analyze(it, mode, clip) {
    const isR = it.kind === "ruas", issues = (it.parsed.warn || []).map(m => ["warn", m]);
    let data = it.parsed.data.slice(), fixed = 0, bad = 0;
    if (S.fix) {   // perbaikan otomatis: lat/lng tertukar, tanda minus hilang
      const f = (la, ln) => la == null || ln == null || inBB(la, ln) ? null : [[ln, la], [-la, ln], [-ln, la], [la, -ln]].find(c => inBB(c[0], c[1])) || null;
      data = isR ? data.map(r => { let ch = false; const pts = (r.points || []).map(p => { const c = f(p.lat, p.lng); if (!c) return p; ch = true; fixed++; return Object.assign({}, p, { lat: c[0], lng: c[1] }); }); return ch ? Object.assign({}, r, { points: pts }) : r; })
        : data.map(b => { const c = f(b.lat, b.lng); if (!c) return b; fixed++; return Object.assign({}, b, { lat: c[0], lng: c[1] }); });
      if (fixed) issues.push(["info", "✔ " + fixed + " koordinat diperbaiki otomatis (lat/lng tertukar atau tanda minus hilang)"]);
    }
    if (it.ignored.length) issues.push(["info", "Kolom tidak dikenali (diabaikan): " + it.ignored.slice(0, 6).join(", ")]);
    if (isR) {
      let out = 0, jump = [];
      data.forEach(r => { const p = r.points || [], o = p.filter(x => !inBB(x.lat, x.lng)).length; out += o; let j = false; for (let i = 1; i < p.length; i++) if (hav(p[i - 1], p[i]) > 3000) { jump.push(r.name); j = true; break; } if (o || j) bad++; });
      if (out) issues.push(["warn", fmt(out) + " titik STA berada di luar wilayah Jateng–DIY — cek tanda koma/minus pada lat/lng"]);
      if (jump.length) issues.push(["warn", "Loncatan >3 km antar titik STA pada " + jump.length + " ruas (" + jump.slice(0, 3).join("; ") + ") — kemungkinan salah ketik koordinat"]);
    } else {
      const nol = data.filter(b => b.lat == null || b.lng == null).length, out = data.filter(b => b.lat != null && b.lng != null && !inBB(b.lat, b.lng));
      if (nol) issues.push(["warn", nol + " jembatan tanpa koordinat — disimpan, tetapi tidak tampil di peta"]);
      if (out.length) { issues.push(["warn", out.length + " jembatan di luar Jateng–DIY" + (clip ? " dilewati: " : ": ") + out.slice(0, 3).map(b => b.nama).join("; ")]); if (clip) data = data.filter(b => !out.includes(b)); }
      const seen = new Set(); let dup = 0; data.forEach(b => { const k = slug(b.nama) + "|" + (+b.lat).toFixed(4) + "|" + (+b.lng).toFixed(4); seen.has(k) ? dup++ : seen.add(k); });
      bad = nol + out.length + dup; if (dup) issues.push(["warn", dup + " baris ganda (nama & koordinat sama) dalam file ini"]);
    }
    const parsed = Object.assign({}, it.parsed, { data }), base = isR ? liveR() : liveB();
    let final = C().finalize(it.kind, parsed, mode, base);
    const bm = new Map(base.map(b => [isR ? b.id : bKey(b), b]));
    if (!isR) { const byId = new Map(base.map(b => [b.id, b])); final = final.map(f => Object.assign({}, byId.get(f.id) || {}, f)); }
    let nNew = 0, nUpd = 0, nSame = 0; const hit = new Set(), chg = [], near = [], grid = new Map(), FL = ["nama", "lat", "lng", "panjang", "lebar", "tipe", "tahun", "ruas", "kabupaten", "nomor"];
    if (!isR) base.forEach(o => { if (o.lat != null && o.lng != null) { const c = Math.floor(o.lat * 400) + "," + Math.floor(o.lng * 400); if (!grid.has(c)) grid.set(c, []); grid.get(c).push(o); } });
    data.forEach(x => {
      const k = isR ? x.id : bKey(x), o = bm.get(k), nm = isR ? x.name : x.nama;
      if (!o) {
        nNew++; if (chg.length < 12) chg.push(["n", nm, ""]);
        if (!isR && x.lat != null && near.length < 5) { const la = Math.floor(x.lat * 400), lo = Math.floor(x.lng * 400); out: for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of grid.get((la + a) + "," + (lo + b)) || []) if (hav(q, x) < 30) { near.push(nm + " ≈ " + q.nama); break out; } }
      } else { hit.add(k); if (isR ? rSig(o) === rSig(x) : bSig(o) === bSig(x)) nSame++; else { nUpd++; if (chg.length < 12) chg.push(["u", nm, isR ? "nama/titik STA berubah" : FL.filter(f => o[f] !== x[f]).join(", ")]); } }
    });
    if (near.length) issues.push(["warn", "Kemungkinan duplikat (<30 m dari jembatan lama, nama berbeda): " + near.slice(0, 3).join("; ")]);
    const score = Math.max(0, Math.round(100 - bad / Math.max(1, it.parsed.data.length) * 100));
    return Object.assign({}, it, { data, final, nNew, nUpd, nSame, chg, chgMore: nNew + nUpd > 12, score, fixed, nGone: mode === "replace" ? [...bm.keys()].filter(k => !hit.has(k)).length : 0, issues });
  }

  /* ---------- Terapkan ke aplikasi ---------- */
  function refresh() {
    try { typeof migrateKabupatenIfNeeded === "function" && migrateKabupatenIfNeeded(); } catch (_) { }
    try { persist(); renderAll(); } catch (e) { console.warn(e); if (/quota/i.test(e.name + e.message)) note("Memori penuh: data aktif sementara saja. Unduh data .js dan kosongkan cadangan.", true); }
    try { persistJembatan(); renderJembatan(); renderJembatanList(); renderJembatanKabupatenFilterOptions(); } catch (e) { console.warn(e); }
    try { localStorage.setItem(GONE, JSON.stringify(seedIds().filter(id => !liveR().some(r => r.id === id)))); } catch (_) { }  // ruas bawaan yang sengaja dihapus tidak muncul lagi saat reload
  }
  const setRoads = list => { const pal = typeof PALETTE !== "undefined" ? PALETTE : ["#22d3ee"], old = new Map(liveR().map(r => [r.id, r])); roads = list.map((x, i) => Object.assign({}, x, { color: x.color || (old.get(x.id) || {}).color || pal[i % pal.length], visible: x.visible !== false })); };
  const setBr = list => { const b = liveB(); b.splice(0, b.length, ...list); };
  function fit(pts) { try { pts = pts.filter(p => isFinite(p[0]) && isFinite(p[1])); if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 16 }); } catch (_) { } }

  async function apply() {
    const todo = S.items.filter(i => i.res && i.res.data.length); if (!todo.length) return note("Belum ada data valid untuk diterapkan", true);
    if (S.mode === "replace" && !confirm("Mode GANTI SEMUA akan menghapus data lama yang tidak ada di file. Cadangan dibuat otomatis (bisa diurungkan). Lanjutkan?")) return;
    await bakPut("Sebelum upload: " + todo.map(i => i.f.name).join(", "));
    const pts = [], sum = [];
    todo.forEach(it => {
      const r = analyze(it, S.mode, S.clip);                       // dihitung ulang terhadap kondisi terbaru (aman untuk beberapa file sejenis)
      if (it.kind === "ruas") { setRoads(r.final); r.data.slice(0, 400).forEach(x => (x.points || []).slice(0, 3).forEach(p => pts.push([p.lat, p.lng]))); }
      else { setBr(r.final); r.data.slice(0, 800).forEach(x => x.lat != null && pts.push([x.lat, x.lng])); }
      sum.push(fmt(r.data.length) + " " + (it.kind === "ruas" ? "ruas" : "jembatan") + " (" + r.nNew + " baru, " + r.nUpd + " diperbarui)");
    });
    pvClear(); refresh(); fit(pts); S.items = []; draw(); histDraw();
    note("Data diperbarui: " + sum.join(" · ") + ". Tersimpan di perangkat ini.");
  }
  async function restore(t) {
    const rec = (await bakAll()).find(x => x.t === t); if (!rec) return;
    await bakPut("Sebelum memulihkan cadangan " + new Date(t).toLocaleString("id-ID"));
    setRoads(cp(rec.roads)); setBr(cp(rec.jbt)); refresh(); histDraw(); note("Cadangan dipulihkan");
  }

  /* ---------- Pratinjau di peta (oranye) sebelum diterapkan ---------- */
  let pvL = null;
  function pvClear() { try { if (pvL) map.removeLayer(pvL); } catch (_) { } pvL = null; const b = $("pqdBack"); if (b) b.remove(); }
  function preview() {
    pvClear(); const g = L.layerGroup(), pts = [];
    S.items.forEach(i => { const r = i.res; if (!r) return;
      if (i.kind === "ruas") r.data.slice(0, 400).forEach(x => { const p = (x.points || []).map(q => [q.lat, q.lng]); if (p.length > 1) { L.polyline(p, { color: "#fb923c", weight: 5, opacity: .9, dashArray: "8 6" }).bindTooltip(x.name || "").addTo(g); p.forEach((q, k) => k % 15 === 0 && pts.push(q)); } });
      else r.data.slice(0, 1500).forEach(x => { if (x.lat != null && x.lng != null) { L.circleMarker([x.lat, x.lng], { radius: 6, color: "#fff", weight: 1.5, fillColor: "#fb923c", fillOpacity: .95 }).bindTooltip(x.nama || "").addTo(g); pts.push([x.lat, x.lng]); } }); });
    if (!pts.length) return note("Tidak ada koordinat untuk ditampilkan", true);
    pvL = g.addTo(map); fit(pts); $("pqdBox").classList.remove("show");
    const b = document.createElement("button"); b.id = "pqdBack"; b.className = "pqd-btn pri"; b.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:4101;box-shadow:0 6px 24px #000a"; b.textContent = "↩ Kembali ke Upload Data (pratinjau oranye)"; b.onclick = open; document.body.appendChild(b);
  }

  /* ---------- Unduh / ekspor ---------- */
  const dl = (name, blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const seedNow = k => k === "ruas" ? (typeof buildDefaultSeedData === "function" ? buildDefaultSeedData() : liveR()) : liveB();
  const dlJS = k => dl(k === "ruas" ? "data-ruas.js" : "data-jembatan.js", new Blob([C().toJS(k, seedNow(k))], { type: "text/javascript" }));
  function dlXlsx(k) { const wb = XLSX.utils.book_new(), rows = k === "ruas" ? C().roadRows(seedNow(k)) : C().bridgeRows(liveB()); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), k === "ruas" ? "Ruas" : "Jembatan"); XLSX.writeFile(wb, "PETAQU-" + k + "-" + new Date().toISOString().slice(0, 10) + ".xlsx"); }
  async function reset() {
    if (!confirm("Kembalikan SEMUA ruas & jembatan ke data bawaan aplikasi (data-ruas.js / data-jembatan.js)? Cadangan dibuat otomatis.")) return;
    await bakPut("Sebelum reset ke data bawaan"); [R_KEY, B_KEY, GONE].forEach(k => localStorage.removeItem(k)); location.reload();
  }

  /* ---------- UI ---------- */
  const S = { items: [], mode: "merge", clip: true, fix: true, force: "auto" };
  const CSS = ".pqd{position:fixed;inset:0;z-index:4100;display:none;align-items:center;justify-content:center;background:#02060ccc;backdrop-filter:blur(3px);padding:10px}.pqd.show{display:flex}" +
    ".pqd-card{width:min(720px,100%);max-height:92vh;display:flex;flex-direction:column;border-radius:16px;border:1px solid #22d3ee44;background:#0a0e17;color:#dbe7f3;font:13px/1.45 system-ui,sans-serif;box-shadow:0 20px 60px #000a}" +
    ".pqd-h{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #94b2cc22;font-size:15px}.pqd-h b{flex:1}.pqd-h button{background:0;border:0;color:#8fa6bd;font-size:22px;cursor:pointer}" +
    ".pqd-b{padding:14px 16px;overflow:auto;display:flex;flex-direction:column;gap:12px}.pqd-drop{border:2px dashed #22d3ee66;border-radius:14px;padding:22px 14px;text-align:center;cursor:pointer;background:#0f1726}.pqd-drop.on,.pqd-drop:hover{border-color:#22d3ee;background:#0e2a3a}.pqd-drop small{display:block;color:#8fa6bd;margin-top:6px;font-size:11.5px}" +
    ".pqd-row{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;color:#9db3c9;font-size:12px}.pqd-row label{display:flex;gap:5px;align-items:center;cursor:pointer}.pqd select{background:#0f1726;color:#e6f1fb;border:1px solid #94b2cc44;border-radius:8px;padding:5px 8px}" +
    ".pqd-btn{border:1px solid #94b2cc44;background:#0f1726;color:#e6f1fb;border-radius:10px;padding:8px 13px;font:600 12.5px system-ui;cursor:pointer}.pqd-btn:hover{border-color:#22d3ee}.pqd-btn.pri{background:#0e7490;border-color:#22d3ee}.pqd-btn:disabled{opacity:.4;cursor:not-allowed}" +
    ".pqd-it{border:1px solid #94b2cc2e;border-radius:12px;padding:10px 12px;background:#0f1726}.pqd-it h4{margin:0 0 6px;font-size:13px;display:flex;gap:8px;align-items:center;word-break:break-all}.pqd-tag{font-size:10.5px;padding:2px 8px;border-radius:99px;background:#0e7490;color:#fff;flex:none}.pqd-tag.j{background:#7c3aed}" +
    ".pqd-chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0}.pqd-chips span{padding:3px 9px;border-radius:99px;background:#16233a;font-size:11.5px}.pqd-chips .n{color:#4ade80}.pqd-chips .u{color:#facc15}.pqd-chips .g{color:#f87171}" +
    ".pqd-is{margin:4px 0 0;padding:0;list-style:none;font-size:11.5px}.pqd-is li{padding:2px 0}.pqd-is .warn{color:#fbbf24}.pqd-is .info{color:#8fa6bd}.pqd details{border:1px solid #94b2cc22;border-radius:10px;padding:8px 12px}.pqd summary{cursor:pointer;font-weight:600}" +
    ".pqd-hr{display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #94b2cc17;font-size:12px}.pqd-hr span{flex:1;color:#9db3c9}.pqd-g{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}" +
    ".pqd-m h4{margin:0 0 8px;font-size:13px;display:flex;justify-content:space-between;gap:8px}.pqd-bar{display:flex;height:16px;border-radius:99px;overflow:hidden;background:#1e293b;margin:6px 0}.pqd-bar i{display:block;height:100%;min-width:3px}" +
    ".pqd-lg{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11.5px;color:#9db3c9}.pqd-lg em{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px}.pqd-lg b{color:#e6f1fb}.pqd-m .ok{color:#4ade80}.pqd-m .mid{color:#facc15}.pqd-m .bad{color:#f87171}.pqd-m small{display:block;color:#8fa6bd;margin-top:6px;font-size:11.5px}";

  function build() {
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    const box = document.createElement("div"); box.id = "pqdBox"; box.className = "pqd";
    box.innerHTML = '<div class="pqd-card"><div class="pqd-h"><b><i class="fa-solid fa-cloud-arrow-up"></i> Upload &amp; Perbarui Data</b><button id="pqdX" aria-label="Tutup">×</button></div><div class="pqd-b">' +
      '<div id="pqdMem" class="pqd-it pqd-m"></div><div id="pqdDrop" class="pqd-drop"><b>Seret file Excel / CSV ke sini</b> atau <u>pilih file</u><small>Ruas jalan (kolom Ruas, STA, Latitude, Longitude) dan/atau jembatan (Nama, Latitude, Longitude). Jenis data dikenali otomatis; boleh banyak file sekaligus. Bisa juga tempel (Ctrl+V) langsung dari Excel.</small><input id="pqdFile" type="file" multiple accept=".xlsx,.xls,.csv" hidden></div>' +
      '<div class="pqd-row">Mode: <label><input type="radio" name="pqdM" value="merge" checked> Gabung (tambah &amp; perbarui)</label><label><input type="radio" name="pqdM" value="replace"> Ganti semua</label>' +
      '<label><input type="checkbox" id="pqdClip" checked> Lewati jembatan di luar Jateng–DIY</label><label><input type="checkbox" id="pqdFix" checked> Perbaiki koordinat otomatis</label><label>Jenis: <select id="pqdKind"><option value="auto">Otomatis</option><option value="ruas">Ruas jalan</option><option value="jembatan">Jembatan</option></select></label></div>' +
      '<div id="pqdRes"></div><div class="pqd-row"><button id="pqdGo" class="pqd-btn pri" disabled>Terapkan ke peta</button><button id="pqdPv" class="pqd-btn" disabled>Lihat pratinjau di peta</button><button class="pqd-btn" data-t="ruas">Template ruas</button><button class="pqd-btn" data-t="jembatan">Template jembatan</button></div>' +
      '<details id="pqdHd"><summary>Cadangan &amp; urungkan</summary><div id="pqdHist"></div></details>' +
      '<details><summary>Simpan permanen / ekspor</summary><div style="color:#9db3c9;font-size:12px;margin-top:6px">Perubahan di atas tersimpan di perangkat ini. Agar semua pengguna ikut ter-update, unduh file .js lalu ganti file lama di hosting aplikasi.</div><div class="pqd-g">' +
      '<button class="pqd-btn" data-js="ruas">Unduh data-ruas.js</button><button class="pqd-btn" data-js="jembatan">Unduh data-jembatan.js</button><button class="pqd-btn" data-x="ruas">Excel ruas</button><button class="pqd-btn" data-x="jembatan">Excel jembatan</button><button class="pqd-btn" id="pqdReset" style="border-color:#f8717166">Reset ke data bawaan</button></div></details></div></div>';
    document.body.appendChild(box);
    const drop = $("pqdDrop"), inp = $("pqdFile");
    $("pqdX").onclick = () => { box.classList.remove("show"); pvClear(); }; box.onclick = e => { if (e.target === box) box.classList.remove("show"); };
    drop.onclick = () => inp.click(); inp.onchange = () => { take(inp.files); inp.value = ""; };
    ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("on"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("on"); }));
    drop.addEventListener("drop", e => take(e.dataTransfer.files));
    box.querySelectorAll("[name=pqdM]").forEach(r => r.onchange = () => { S.mode = r.value; reanalyze(); });
    $("pqdClip").onchange = e => { S.clip = e.target.checked; reanalyze(); };
    $("pqdKind").onchange = e => { S.force = e.target.value; const fs = S.items.map(i => i.f); S.items = []; take(fs); };
    $("pqdFix").onchange = e => { S.fix = e.target.checked; reanalyze(); }; $("pqdPv").onclick = preview;
    document.addEventListener("paste", e => { if (!box.classList.contains("show")) return; let t = (e.clipboardData || window.clipboardData).getData("text"); if (!t || !/\n/.test(t)) return; const tab = /\t/.test(t); if (!tab && (t.match(/;/g) || []).length > (t.match(/,/g) || []).length) t = t.replace(/;/g, "\t"); if (!tab && !/[;,\t]/.test(t)) return; e.preventDefault(); take([new File([t], tab || /;/.test(t) ? "tempelan.tsv" : "tempelan.csv")]); });
    $("pqdGo").onclick = apply; $("pqdReset").onclick = reset;
    box.querySelectorAll("[data-t]").forEach(b => b.onclick = () => C().downloadExample(b.dataset.t));
    box.querySelectorAll("[data-js]").forEach(b => b.onclick = () => dlJS(b.dataset.js));
    box.querySelectorAll("[data-x]").forEach(b => b.onclick = () => dlXlsx(b.dataset.x));
    $("pqdHd").ontoggle = histDraw; $("pqdHist").onclick = e => { const b = e.target.closest("[data-r]"); if (b) restore(+b.dataset.r); };
  }
  async function take(files) {
    for (const f of files) { try { S.items.push(await readFile(f)); } catch (e) { note(f.name + ": " + e.message, true); } }
    reanalyze();
  }
  function reanalyze() { pvClear(); S.items.forEach(i => { try { i.res = analyze(i, S.mode, S.clip); } catch (e) { i.res = null; i.err = e.message; } }); draw(); }
  function draw() {
    $("pqdRes").innerHTML = S.items.map(i => { const r = i.res; if (!r) return '<div class="pqd-it"><h4>' + esc(i.f.name) + '</h4><ul class="pqd-is"><li class="warn">' + esc(i.err || "Gagal dibaca") + "</li></ul></div>";
      return '<div class="pqd-it"><h4><span class="pqd-tag' + (i.kind === "ruas" ? "" : " j") + '">' + (i.kind === "ruas" ? "RUAS JALAN" : "JEMBATAN") + "</span>" + esc(i.f.name) + "</h4>" +
        '<div class="pqd-chips"><span style="color:' + (r.score >= 90 ? '#4ade80' : r.score >= 70 ? '#facc15' : '#f87171') + '">Kualitas ' + r.score + '/100</span><span>' + fmt(r.data.length) + " " + (i.kind === "ruas" ? "ruas · " + esc(i.parsed.extra || "") : "jembatan") + '</span><span class="n">+' + fmt(r.nNew) + ' baru</span><span class="u">' + fmt(r.nUpd) + ' diperbarui</span><span>' + fmt(r.nSame) + ' sama</span>' + (r.nGone ? '<span class="g">−' + fmt(r.nGone) + " dihapus</span>" : "") + "</div>" +
        (r.chg.length ? '<details style="margin-top:6px"><summary>Lihat perubahan (' + r.chg.length + (r.chgMore ? "+" : "") + ')</summary><ul class="pqd-is">' + r.chg.map(c => "<li>" + (c[0] === "n" ? '<b style="color:#4ade80">baru</b> ' : '<b style="color:#facc15">ubah</b> ') + esc(c[1]) + (c[2] ? ' <span style="color:#8fa6bd">(' + esc(c[2]) + ")</span>" : "") + "</li>").join("") + "</ul></details>" : "") + '<ul class="pqd-is">' + r.issues.map(x => '<li class="' + x[0] + '">' + (x[0] === "warn" ? "⚠ " : "ℹ ") + esc(x[1]) + "</li>").join("") + "</ul></div>"; }).join("");
    $("pqdGo").disabled = $("pqdPv").disabled = !S.items.some(i => i.res && i.res.data.length);
  }
  async function histDraw() {
    memDraw();
    const l = await bakAll(), el = $("pqdHist"); if (!el) return;
    el.innerHTML = l.length ? l.map(x => '<div class="pqd-hr"><span>' + new Date(x.t).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) + " · " + esc(x.label) + " (" + fmt(x.roads.length) + " ruas, " + fmt(x.jbt.length) + ' jembatan)</span><button class="pqd-btn" data-r="' + x.t + '">Pulihkan</button></div>').join("")
      : '<div style="color:#8fa6bd;font-size:12px;padding-top:6px">Belum ada cadangan. Dibuat otomatis setiap kali Anda menerapkan upload.</div>';
  }
  function open() { if (!$("pqdBox")) build(); const bk = $("pqdBack"); if (bk) bk.remove(); $("pqdBox").classList.add("show"); draw(); memDraw(); }
  function init() {
    const b = document.createElement("button"); b.type = "button"; b.title = "Upload data ruas jalan & jembatan (Excel/CSV) — langsung tampil di peta"; b.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i>'; b.onclick = open;
    if (window.PQ_DOCK) PQ_DOCK.adopt(b, "Upload Data");
    else { b.className = "btn primary"; b.style.cssText = "position:fixed;left:10px;bottom:120px;z-index:3900"; b.innerHTML += " Upload Data"; document.body.appendChild(b); }
  }
  window.PETAQU_DATA = { open, analyze, restore };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
