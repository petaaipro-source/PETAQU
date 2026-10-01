/* PETAQU - Konversi Data Jalan/Jembatan  <->  Excel/CSV  ->  data-ruas.js / data-jembatan.js
   Alur: unduh contoh format (data saat ini) -> isi/ubah di Excel -> unggah -> konversi -> unggah .js ke GitHub. */
(function () {
  "use strict";
  const ALIAS = {
    ruas: ["ruas", "namaruas", "jalan", "namajalan", "road"], id: ["id"],
    kabupaten: ["kabupaten", "kab", "kota", "kabkota"], sta: ["sta", "km", "station"],
    lat: ["latitude", "lat", "lintang", "y"], lng: ["longitude", "lng", "lon", "long", "bujur", "x"],
    tipe: ["tipe", "type", "jenis", "tipejembatan"], iri: ["iri", "irimkm", "nilaiiri"],
    lebar: ["lebar", "lebarm", "lebarjembatan"], kondisi: ["kondisi", "kondisijalan"],
    tahun: ["tahun", "tahunpembangunan", "tahunkonstruksi", "thn"], perkerasan: ["perkerasan"],
    keterangan: ["keterangan", "catatan", "ket"], riwayat: ["riwayat"],
    panjang: ["panjang", "panjangm", "panjangjembatan"], no: ["no", "nomorurut", "urut"],
    nomor: ["nomor", "nomorjembatan", "nojembatan", "kode", "kodejembatan"], nama: ["nama", "namajembatan", "jembatan"]
  };
  const REV = {}; Object.keys(ALIAS).forEach(f => ALIAS[f].forEach(a => REV[a] = f));
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const mapRow = r => { const o = {}; for (const k in r) { const f = REV[norm(k)]; if (f && (o[f] === undefined || o[f] === "")) o[f] = r[k]; } return o; };
  const str = v => (v == null || v === "") ? null : (String(v).trim() || null);
  const num = v => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; };
  const slug = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const r6 = n => Math.round(n * 1e6) / 1e6, r3 = n => Math.round(n * 1e3) / 1e3;
  const fmtSta = m => Math.floor(m / 1000) + "+" + String(Math.round(m % 1000)).padStart(3, "0");
  const staM = s => { const m = String(s || "").match(/^(\d+)\s*\+\s*(\d+)$/); return m ? +m[1] * 1000 + +m[2] : null; };
  const hav = (a, b) => { const R = 6371, t = Math.PI / 180, dLa = (b.lat - a.lat) * t, dLo = (b.lng - a.lng) * t, h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const OPT = ["iri", "lebar", "kondisi", "tahun", "perkerasan", "keterangan", "riwayat"];
  const validLL = (a, b) => a != null && b != null && Math.abs(a) <= 90 && Math.abs(b) <= 180;

  /* ---------- Data -> baris Excel (contoh format) ---------- */
  const ROAD_COLS = ["Ruas", "Kabupaten", "STA", "Latitude", "Longitude", "Tipe", "IRI", "Lebar (m)", "Kondisi", "Tahun", "Perkerasan", "Keterangan"];
  const BR_COLS = ["No", "Nomor", "Nama", "Panjang (m)", "Lebar (m)", "Tipe", "Tahun", "Ruas", "Latitude", "Longitude", "Kabupaten", "STA"];
  const e = v => v == null ? "" : v;
  function roadRows(roads) {
    const out = [];
    (roads || []).forEach(r => (r.points || []).forEach(p => out.push({
      "Ruas": r.name, "Kabupaten": e(r.kabupaten), "STA": e(p.sta), "Latitude": p.lat, "Longitude": p.lng, "Tipe": e(p.tipe),
      "IRI": e(p.iri), "Lebar (m)": e(p.lebar), "Kondisi": e(p.kondisi), "Tahun": e(p.tahun), "Perkerasan": e(p.perkerasan), "Keterangan": e(p.keterangan)
    })));
    return out;
  }
  const bridgeRows = list => (list || []).map(b => ({
    "No": e(b.no), "Nomor": e(b.nomor), "Nama": e(b.nama), "Panjang (m)": e(b.panjang), "Lebar (m)": e(b.lebar), "Tipe": e(b.tipe),
    "Tahun": e(b.tahun), "Ruas": e(b.ruas), "Latitude": b.lat, "Longitude": b.lng, "Kabupaten": e(b.kabupaten), "STA": e(b.sta)
  }));

  /* ---------- Excel/CSV -> data ---------- */
  function parseRoads(wb, fname) {
    const map = new Map(), warn = [];
    wb.SheetNames.forEach(sn => {
      if (/^(petunjuk|readme|info)/i.test(sn)) return;
      XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "" }).forEach((raw, i) => {
        const o = mapRow(raw), lat = num(o.lat), lng = num(o.lng);
        if (!validLL(lat, lng)) { if (Object.values(raw).some(v => v !== "")) warn.push(`Sheet "${sn}" baris ${i + 2}: Latitude/Longitude tidak valid, dilewati`); return; }
        const name = str(o.ruas) || sn, key = slug(str(o.id) || name);
        let r = map.get(key);
        if (!r) { r = { id: key, name, sourceFile: fname || sn, points: [], _cum: 0 }; if (str(o.kabupaten)) r.kabupaten = str(o.kabupaten); map.set(key, r); }
        const prev = r.points[r.points.length - 1];
        if (prev) r._cum += hav(prev, { lat, lng }) * 1000;
        let sta = str(o.sta);
        if (sta && !sta.includes("+")) { const n = num(sta); sta = n == null ? null : fmtSta(Math.round(n * 1000)); }
        if (!sta) { sta = fmtSta(r._cum); warn.push(`Sheet "${sn}" baris ${i + 2}: STA kosong, dihitung otomatis (${sta})`); }
        const m = staM(sta), p = { sta, lat: r6(lat), lng: r6(lng), tipe: str(o.tipe) || (m != null && m % 100 === 0 ? "Label Utama" : "Titik Detail") };
        OPT.forEach(k => { const v = k === "iri" || k === "lebar" ? num(o[k]) : str(o[k]); if (v != null) p[k] = v; });
        r.points.push(p);
      });
    });
    const roads = [...map.values()].map(r => {
      const pts = r.points; let len = 0; for (let i = 1; i < pts.length; i++) len += hav(pts[i - 1], pts[i]);
      const a = staM(pts[0].sta), b = staM(pts[pts.length - 1].sta);
      const out = { id: r.id, name: r.name, sourceFile: r.sourceFile };
      if (a != null && b != null) out.lengthKmFromSTA = r3(Math.abs(b - a) / 1000);
      out.lengthKmCalculated = r3(len);
      if (r.kabupaten) out.kabupaten = r.kabupaten;
      out.points = pts; return out;
    });
    if (!roads.length) warn.push("Tidak ada baris valid. Butuh kolom Ruas, STA, Latitude, Longitude (lihat contoh format).");
    return { data: roads, warn, count: roads.length, unit: "ruas", extra: roads.reduce((a, r) => a + r.points.length, 0) + " titik STA" };
  }

  function parseBridges(wb) {
    const rows = [], warn = [];
    wb.SheetNames.forEach(sn => {
      if (/^(petunjuk|readme|info)/i.test(sn)) return;
      XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "" }).forEach((raw, i) => {
        const o = mapRow(raw), lat = num(o.lat), lng = num(o.lng), nama = str(o.nama);
        if (!nama) { if (Object.values(raw).some(v => v !== "")) warn.push(`Baris ${i + 2}: kolom Nama kosong, dilewati`); return; }
        if (!validLL(lat, lng)) { warn.push(`Baris ${i + 2} (${nama}): Latitude/Longitude tidak valid, dilewati`); return; }
        const s = str(o.sta), tahun = num(o.tahun);
        rows.push({
          id: null, no: num(o.no), nomor: str(o.nomor), nama, panjang: num(o.panjang), lebar: num(o.lebar), tipe: str(o.tipe),
          tahun: tahun == null ? null : Math.round(tahun), ruas: str(o.ruas), lat, lng, kabupaten: str(o.kabupaten),
          sta: s == null ? null : (s.includes("+") || isNaN(num(s)) ? s : num(s)), _id: str(o.id)
        });
      });
    });
    if (!rows.length) warn.push("Tidak ada baris valid. Butuh kolom Nama, Latitude, Longitude (lihat contoh format).");
    return { data: rows, warn, count: rows.length, unit: "jembatan", extra: "" };
  }

  const bId = b => b._id || ((b.nomor ? slug(b.nomor) + "-" : "jbt-") + slug(b.nama) + "-" + b.no);
  const bKey = b => b.nomor ? "n:" + b.nomor : "m:" + slug(b.nama) + "|" + slug(b.ruas);
  const BR_ORDER = ["id", "no", "nomor", "nama", "panjang", "lebar", "tipe", "tahun", "ruas", "lat", "lng", "kabupaten", "sta"];

  /* ---------- Gabung/ganti + hasilkan teks .js ---------- */
  function finalize(kind, parsed, mode, base) {
    base = base || [];
    if (kind === "ruas") {
      if (mode !== "merge") return parsed.data;
      const m = new Map(base.map(r => [r.id, r])); parsed.data.forEach(r => m.set(r.id, r)); return [...m.values()];
    }
    let list = mode === "merge" ? base.map(b => Object.assign({}, b)) : [], idx = new Map(list.map((b, i) => [bKey(b), i]));
    let next = Math.max(0, ...list.map(b => b.no || 0)) + 1;
    parsed.data.forEach(b => {
      const k = bKey(b), at = idx.get(k);
      if (at != null) { const old = list[at]; list[at] = Object.assign({}, b, { id: old.id, no: old.no }); }
      else { if (b.no == null || (mode === "merge" && list.some(x => x.no === b.no))) b.no = mode === "merge" ? next++ : list.length + 1; idx.set(k, list.length); list.push(b); }
    });
    if (mode !== "merge") list.forEach((b, i) => { if (b.no == null) b.no = i + 1; });
    return list.map(b => { const c = Object.assign({}, b, { id: b.id || bId(b) }), o = {}; BR_ORDER.forEach(k => o[k] = c[k] === undefined ? null : c[k]); return o; });
  }
  function toJS(kind, data) {
    const ruas = kind === "ruas", file = ruas ? "data-ruas.js" : "data-jembatan.js", v = ruas ? "ROADS_SEED" : "JEMBATAN_SEED";
    return "// ============================================================\n// PETAQU - DATABASE " + (ruas ? "RUAS" : "JEMBATAN") + " (" + v + ")\n// Dihasilkan oleh Konversi Data pada " + new Date().toISOString() + " (" + data.length + (ruas ? " ruas" : " jembatan") + ")\n// Ganti isi file " + file + " di GitHub dengan file ini, lalu commit. Jangan ubah nama variabel " + v + ".\n// ============================================================\nconst " + v + "=" + JSON.stringify(data) + ";\n";
  }

  /* ---------- Util browser ---------- */
  const note = (m, err) => { try { toast(m, !!err); } catch (_) { alert(m); } };
  const dl = (name, text) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/javascript" })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const liveRoads = () => typeof buildDefaultSeedData === "function" ? buildDefaultSeedData() : (typeof roads !== "undefined" ? roads : []);
  const liveBr = () => typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : [];
  const seedRoads = () => typeof ROADS_SEED !== "undefined" ? ROADS_SEED : [];
  const seedBr = () => typeof JEMBATAN_SEED !== "undefined" ? JEMBATAN_SEED : [];

  const GUIDE = {
    ruas: [["PETUNJUK FORMAT DATA JALAN / RUAS"], ["Sheet 'Ruas': satu baris = satu titik STA. Baris dengan nama Ruas yang sama digabung menjadi satu ruas (urutan baris = urutan rute)."], ["Kolom wajib: Ruas, STA, Latitude, Longitude. STA ditulis sebagai teks, contoh 0+050 (format Excel: Text)."], ["Tipe: 'Label Utama' atau 'Titik Detail' (kosong = otomatis). Kolom lain (Kabupaten, IRI, Lebar, Kondisi, Tahun, Perkerasan, Keterangan) opsional."], ["Alternatif: satu sheet per ruas, nama sheet = nama ruas, tanpa kolom Ruas."], ["Desimal koordinat boleh titik atau koma. Latitude Cilacap/Banyumas bernilai negatif (-7.xxx)."]],
    jembatan: [["PETUNJUK FORMAT DATA JEMBATAN"], ["Sheet 'Jembatan': satu baris = satu jembatan."], ["Kolom wajib: Nama, Latitude, Longitude. Lainnya opsional (No, Nomor, Panjang (m), Lebar (m), Tipe, Tahun, Ruas, Kabupaten, STA)."], ["Mode 'Gabung': jembatan dengan Nomor (atau Nama+Ruas) yang sama diperbarui, yang baru ditambahkan. Mode 'Ganti': seluruh isi file diganti."], ["STA boleh berupa teks (54+470) atau angka km (2.43)."]]
  };
  function downloadExample(kind) {
    const ruas = kind === "ruas", rows = ruas ? roadRows(liveRoads()) : bridgeRows(liveBr());
    if (!rows.length) return note("Belum ada data untuk dijadikan contoh", true);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: ruas ? ROAD_COLS : BR_COLS }), ruas ? "Ruas" : "Jembatan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(GUIDE[kind]), "Petunjuk");
    XLSX.writeFile(wb, "contoh-format-" + (ruas ? "ruas-jalan" : "jembatan") + ".xlsx");
    note("Contoh format diunduh (" + rows.length + " baris dari data saat ini)");
  }

  /* ---------- Modal ---------- */
  let S = { kind: "ruas", parsed: null, name: "" }, box;
  const $ = id => document.getElementById(id);
  function build() {
    box = document.createElement("div"); box.className = "modal-overlay"; box.id = "pqcvModal";
    box.innerHTML = '<div class="modal" style="max-width:600px;max-height:92vh;overflow:auto"><h3><i class="fa-solid fa-file-code"></i> Konversi Data ke JS (GitHub)</h3>' +
      '<div style="display:flex;gap:6px;margin-bottom:10px"><button class="btn primary" id="pqcvTabR" type="button">Data Jalan</button><button class="btn" id="pqcvTabB" type="button">Data Jembatan</button></div>' +
      '<div style="font-size:11.5px;line-height:1.5;margin-bottom:10px;padding:10px 12px;border:1px solid rgba(34,211,238,.25);border-radius:10px;background:rgba(34,211,238,.08)"><b>Alur:</b> 1) Unduh contoh format &rarr; 2) isi/ubah di Excel &rarr; 3) pilih file di bawah &rarr; 4) Konversi &rarr; 5) ganti <code id="pqcvFile"></code> di GitHub &amp; commit.</div>' +
      '<div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap;gap:6px;margin-bottom:10px"><button class="btn" id="pqcvEx" type="button"><i class="fa-solid fa-download"></i> Unduh Contoh Format (Excel)</button><button class="btn" id="pqcvCur" type="button"><i class="fa-solid fa-code"></i> Ekspor Data Saat Ini &rarr; .js</button></div>' +
      '<label>File Excel / CSV yang sudah diisi</label><input type="file" id="pqcvIn" accept=".xlsx,.xls,.csv" style="width:100%;margin:4px 0 8px">' +
      '<label>Mode</label><select id="pqcvMode" style="width:100%;margin:4px 0 8px"><option value="replace">Ganti seluruh isi file (data = isi Excel)</option><option value="merge">Gabung dengan data default saat ini (perbarui yang sama, tambah yang baru)</option></select>' +
      '<div id="pqcvInfo" style="font-size:11.5px;line-height:1.5;margin-bottom:8px"></div>' +
      '<div class="modal-actions"><button class="btn ghost" id="pqcvX" type="button">Tutup</button><button class="btn" id="pqcvCopy" type="button" disabled><i class="fa-solid fa-copy"></i> Salin Kode</button><button class="btn primary" id="pqcvGo" type="button" disabled><i class="fa-solid fa-file-arrow-down"></i> Konversi &amp; Unduh .js</button></div></div>';
    document.body.appendChild(box);
    $("pqcvTabR").onclick = () => tab("ruas"); $("pqcvTabB").onclick = () => tab("jembatan");
    $("pqcvX").onclick = () => box.classList.remove("show");
    $("pqcvEx").onclick = () => downloadExample(S.kind);
    $("pqcvCur").onclick = () => { const d = S.kind === "ruas" ? liveRoads() : liveBr(); if (!d.length) return note("Belum ada data", true); dl(S.kind === "ruas" ? "data-ruas.js" : "data-jembatan.js", toJS(S.kind, d)); note("File .js diunduh (" + d.length + " " + (S.kind === "ruas" ? "ruas" : "jembatan") + ") - ganti file di GitHub"); };
    $("pqcvIn").onchange = ev => readFile(ev.target.files[0]);
    $("pqcvMode").onchange = refresh;
    $("pqcvGo").onclick = () => { const o = out(); if (o) { dl(o.file, o.text); note(o.file + " dibuat (" + o.n + ")"); } };
    $("pqcvCopy").onclick = () => { const o = out(); if (!o) return; (navigator.clipboard ? navigator.clipboard.writeText(o.text) : Promise.reject()).then(() => note("Kode disalin"), () => note("Gagal menyalin, gunakan tombol Unduh", true)); };
  }
  function tab(k) { S = { kind: k, parsed: null, name: "" }; $("pqcvIn").value = ""; $("pqcvTabR").className = k === "ruas" ? "btn primary" : "btn"; $("pqcvTabB").className = k === "ruas" ? "btn" : "btn primary"; $("pqcvFile").textContent = k === "ruas" ? "data-ruas.js" : "data-jembatan.js"; refresh(); }
  function readFile(f) {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = ev => {
      try { const wb = XLSX.read(ev.target.result, { type: "array" }); S.name = f.name; S.parsed = S.kind === "ruas" ? parseRoads(wb, f.name) : parseBridges(wb); }
      catch (err) { console.error(err); S.parsed = { data: [], warn: ["Gagal membaca file: " + err.message], count: 0 }; }
      refresh();
    };
    rd.readAsArrayBuffer(f);
  }
  function out() {
    const p = S.parsed; if (!p || !p.count) return null;
    const data = finalize(S.kind, p, $("pqcvMode").value, S.kind === "ruas" ? seedRoads() : seedBr());
    return { file: S.kind === "ruas" ? "data-ruas.js" : "data-jembatan.js", text: toJS(S.kind, data), n: data.length + (S.kind === "ruas" ? " ruas" : " jembatan") };
  }
  function refresh() {
    const p = S.parsed, ok = !!(p && p.count); $("pqcvGo").disabled = $("pqcvCopy").disabled = !ok;
    if (!p) { $("pqcvInfo").innerHTML = '<span style="color:var(--text-dim)">Belum ada file dipilih.</span>'; return; }
    let h = ok ? '<b style="color:#22c55e"><i class="fa-solid fa-circle-check"></i> ' + p.count + " " + p.unit + (p.extra ? " (" + p.extra + ")" : "") + " terbaca dari " + esc(S.name) + "</b>" : '<b style="color:var(--red)">Tidak ada data valid</b>';
    if (ok && $("pqcvMode").value === "merge") { const o = out(); h += '<br>Hasil gabungan: <b>' + o.n + "</b>"; }
    if (p.warn.length) h += '<ul style="margin:6px 0 0 16px;color:var(--text-dim)">' + p.warn.slice(0, 8).map(w => "<li>" + esc(w) + "</li>").join("") + (p.warn.length > 8 ? "<li>... +" + (p.warn.length - 8) + " peringatan lain</li>" : "") + "</ul>";
    $("pqcvInfo").innerHTML = h;
  }
  function open() { if (!window.XLSX) return note("Library Excel belum termuat, coba lagi sebentar", true); if (!box) build(); tab(S.kind); box.classList.add("show"); }

  window.PETAQU_CONVERT = { open, parseRoads, parseBridges, finalize, toJS, roadRows, bridgeRows, downloadExample };
  function init() {
    if (typeof document === "undefined" || !document.body) return;
    const b = document.createElement("button"); b.type = "button"; b.title = "Konversi data jalan/jembatan Excel \u2194 JS (GitHub)"; b.innerHTML = '<i class="fa-solid fa-file-code"></i>'; b.onclick = open;
    if (window.PQ_DOCK) PQ_DOCK.adopt(b, "Konversi ke JS");
    else { b.className = "btn primary"; b.style.cssText = "position:fixed;left:10px;bottom:70px;z-index:3900"; b.innerHTML += " Konversi ke JS"; document.body.appendChild(b); }
  }
  if (typeof document !== "undefined") document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
