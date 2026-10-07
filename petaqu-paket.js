/* PETAQU Paket: Paket Berjalan & Riwayat Paket (kontrak pemeliharaan jalan/jembatan)
   - Unggah Excel/CSV (pratinjau baru/diperbarui/sama + galat -> Terapkan -> Urungkan), tersimpan di perangkat
   - Status OTOMATIS dari tanggal & progres: Belum Mulai / Berjalan / Terlambat / Selesai (+ Putus Kontrak manual)
   - Rencana linear vs realisasi fisik -> deviasi (Sesuai / Waspada / Kritis), sisa hari kontrak
   - Riwayat progres tiap paket (tercatat saat progres berubah via unggah ulang atau edit)
   - Tampil di peta (garis ruas berwarna menurut status), ekspor Excel (bisa diunggah ulang), template + data contoh
   - LAMPIRAN unggahan: tiap unggahan yang diterapkan disimpan sebagai lampiran terpisah (Ringkasan, Baru, Diperbarui + perubahan nilai, Galat) dan bisa diunduh sebagai Excel/ditinjau kapan saja; paket baru/diperbarui diberi lencana di tabel
   - Terhubung ke Strategos: ruas dalam paket aktif tidak diusulkan ulang; ruas yang baru selesai ditandai. */
(function () {
  "use strict";
  if (window.PETAQU_PAKET) return;

  const $ = (t, css, html) => { const e = document.createElement(t); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rp = n => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
  const rpS = n => n >= 1e9 ? "Rp " + (n / 1e9).toFixed(2) + " M" : n >= 1e6 ? "Rp " + (n / 1e6).toFixed(1) + " jt" : rp(n);
  const say = m => { try { toast(m, 3500); } catch (e) { console.log(m); } };
  const pad = n => String(n).padStart(2, "0");
  const norm = s => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");

  const KEY = "pq_paket_v1", BAK = KEY + "_bak";
  const load = () => { try { const a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const store = a => { try { localStorage.setItem(KEY, JSON.stringify(a)); return true; } catch (e) { say("Gagal menyimpan (penyimpanan penuh?)"); return false; } };
  let DB = load();

  const roadsAll = () => (typeof roads !== "undefined" ? roads : []);
  const MAP = () => (typeof map !== "undefined" ? map : window.map);
  const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const dayN = s => s ? Date.parse(s + "T00:00:00Z") / 864e5 : NaN;
  const fmtD = s => { if (!s) return "-"; const [y, m, d] = s.split("-"); return d + "/" + m + "/" + y.slice(2); };

  /* ---------- Turunan: status, rencana, deviasi ---------- */
  function derive(p, today) {
    const t = dayN(today || todayStr()), a = dayN(p.mulai), b = dayN(p.selesai), fisik = +p.fisik || 0;
    let rencana = null;
    if (!isNaN(a) && !isNaN(b) && b > a) rencana = Math.max(0, Math.min(100, (t - a) / (b - a) * 100));
    let status;
    if (p.statusManual === "Putus Kontrak") status = "Putus Kontrak";
    else if (p.statusManual === "Selesai" || fisik >= 100) status = "Selesai";
    else if (!isNaN(a) && t < a) status = "Belum Mulai";
    else if (!isNaN(b) && t > b) status = "Terlambat";
    else status = "Berjalan";
    const aktif = status === "Berjalan" || status === "Terlambat" || status === "Belum Mulai";
    const dev = rencana == null || status === "Belum Mulai" ? null : fisik - rencana;
    const kat = !aktif || status === "Belum Mulai" || dev == null ? "" : dev >= 0 ? "Sesuai" : dev >= -10 ? "Waspada" : "Kritis";
    return { status, aktif, rencana, dev, kat, sisa: isNaN(b) ? null : Math.round(b - t) };
  }

  /* ---------- Pencocokan ke ruas di peta ---------- */
  function matchRoads(p) {
    const R = roadsAll(), ids = String(p.ruasId || "").split(/[;|]/).map(s => s.trim()).filter(Boolean);
    const names = String(p.ruas || "").split(/[;|]/).map(norm).filter(Boolean);
    let out = R.filter(r => ids.includes(r.id) || names.includes(norm(r.name)));
    if (!out.length && names.length) out = R.filter(r => { const rn = norm(r.name); return rn.length > 5 && names.some(n => n.length > 5 && (rn.includes(n) || n.includes(rn))); });
    return out;
  }
  function ruasAktif() {
    const s = new Set(), tg = todayStr();
    DB.forEach(p => { if (derive(p, tg).aktif) matchRoads(p).forEach(r => s.add(r.id)); });
    return s;
  }
  function ruasBaruSelesai(tahun) {
    const m = new Map(), tg = todayStr(), lim = dayN(tg) - 365 * (tahun || 2);
    DB.forEach(p => { if (derive(p, tg).status === "Selesai") { const e = dayN(p.selesai); if (!isNaN(e) && e >= lim) matchRoads(p).forEach(r => m.set(r.id, { kode: p.kode, selesai: p.selesai })); } });
    return m;
  }

  /* ---------- Impor Excel/CSV ---------- */
  const ALIAS = {
    kode: ["kodepaket", "kode", "nopaket", "paket"], nama: ["namapaket", "nama", "pekerjaan", "uraian"], kabupaten: ["kabupaten", "kabkota", "kab", "kota", "wilayah"],
    ruasId: ["idruas", "ruasid"], ruas: ["ruas", "namaruas", "ruasjalan", "jalan"], jenis: ["jenispenanganan", "jenispekerjaan", "jenis", "penanganan"],
    tahun: ["tahunanggaran", "tahun", "ta"], nilai: ["nilaikontrak", "nilai", "nilairp"], penyedia: ["penyediajasa", "penyedia", "kontraktor", "pelaksana", "rekanan"],
    noKontrak: ["nokontrak", "nomorkontrak"], mulai: ["tglmulai", "tanggalmulai", "mulai"], selesai: ["tglselesai", "tanggalselesai", "selesai", "akhir"],
    fisik: ["progresfisik", "realisasifisik", "fisik"], keu: ["progreskeuangan", "realisasikeuangan", "keuangan"], status: ["status"],
    sumber: ["sumberdana", "sumber"], panjang: ["panjangkm", "panjang"], lat: ["latitude", "lat"], lng: ["longitude", "lng", "lon"], catatan: ["catatan", "keterangan"]
  };
  function fieldOf(h) {
    if (!h) return null;
    for (const f in ALIAS) if (ALIAS[f].includes(h)) return f;
    for (const f in ALIAS) if (ALIAS[f].some(a => a.length >= 4 && h.startsWith(a))) return f;
    return null;
  }
  const BULAN = { jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5, jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agt: 8, agustus: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, nov: 11, november: 11, des: 12, desember: 12 };
  function parseDate(v) {
    if (v === "" || v == null) return "";
    const ymd = (y, m, d) => (y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) ? y + "-" + pad(m) + "-" + pad(d) : null;
    if (v instanceof Date) return isNaN(v) ? null : ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === "number") { if (v < 20000 || v > 80000) return null; const d = new Date(Math.round((v - 25569) * 864e5)); return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    const s = String(v).trim().toLowerCase(); let m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return ymd(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) return ymd(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    if ((m = s.match(/^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})/)) && BULAN[m[2]]) return ymd(+m[3], BULAN[m[2]], +m[1]);
    return null;
  }
  function parseNum(v) {
    if (v === "" || v == null) return null;
    if (typeof v === "number") return v;
    const s = String(v).replace(/rp|\s/gi, "").replace(/%/g, "");
    const n = /,/.test(s) && /\./.test(s) ? +s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? +s.replace(/\./g, "") : +s.replace(",", ".");
    return isNaN(n) ? null : n;
  }
  function parseProg(v) { let n = parseNum(v); if (n == null) return null; if (n > 0 && n < 1) n *= 100; return Math.max(0, Math.min(100, Math.round(n * 10) / 10)); }
  const titleKab = s => String(s || "").replace(/^(kabupaten|kab\.?|kota)\s+/i, "").trim().replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());

  function parseWorkbook(wb) {
    const ws = wb.Sheets[wb.SheetNames.find(n => /paket/i.test(n)) || wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    let hi = -1, map = {};
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const m = {}; rows[i].forEach((c, j) => { const f = fieldOf(norm(c)); if (f && m[f] == null) m[f] = j; });
      if (Object.keys(m).length >= 4 && (m.kode != null || m.nama != null)) { hi = i; map = m; break; }
    }
    if (hi < 0) return { err: "Baris judul kolom tidak ditemukan. Gunakan template (minimal kolom Kode Paket & Nama Paket).", items: [], errors: [] };
    const items = [], errors = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i], g = f => (map[f] == null ? "" : r[map[f]]);
      if (!r.some(c => c !== "" && c != null)) continue;
      const line = i + 1, kode = String(g("kode")).trim(), nama = String(g("nama")).trim();
      if (!kode || !nama) { errors.push("Baris " + line + ": Kode Paket / Nama Paket kosong, dilewati"); continue; }
      const p = { kode: kode.toUpperCase(), nama, kabupaten: titleKab(g("kabupaten")), ruas: String(g("ruas")).trim(), ruasId: String(g("ruasId")).trim(), jenis: String(g("jenis")).trim(), penyedia: String(g("penyedia")).trim(), noKontrak: String(g("noKontrak")).trim(), sumber: String(g("sumber")).trim(), catatan: String(g("catatan")).trim() };
      const w = [];
      const tg = parseNum(g("tahun")); p.tahun = tg == null ? null : Math.round(tg);
      p.nilai = parseNum(g("nilai")); if (p.nilai == null && g("nilai") !== "") w.push("Nilai tidak terbaca");
      ["mulai", "selesai"].forEach(f => { const d = parseDate(g(f)); if (d === null) { w.push("Tanggal " + f + " tidak terbaca"); p[f] = ""; } else p[f] = d; });
      if (p.mulai && p.selesai && p.selesai < p.mulai) w.push("Tgl selesai sebelum tgl mulai");
      p.fisik = parseProg(g("fisik")) || 0; p.keu = parseProg(g("keu")) || 0;
      if (g("fisik") !== "" && parseProg(g("fisik")) == null) w.push("Progres fisik tidak terbaca");
      p.panjang = parseNum(g("panjang")); p.lat = parseNum(g("lat")); p.lng = parseNum(g("lng"));
      if ((p.lat != null) !== (p.lng != null)) { w.push("Latitude/Longitude harus berpasangan"); p.lat = p.lng = null; }
      const st = String(g("status")).trim().toLowerCase();
      p.statusManual = st === "putus kontrak" || st === "putus" ? "Putus Kontrak" : st === "selesai" ? "Selesai" : "";
      if (!p.tahun && p.mulai) p.tahun = +p.mulai.slice(0, 4);
      if (/^contoh/i.test(p.catatan)) p._contoh = true;
      w.forEach(x => errors.push("Baris " + line + " (" + kode + "): " + x));
      items.push(p);
    }
    return { items, errors };
  }

  const SIG = p => JSON.stringify([p.nama, p.kabupaten, p.ruas, p.ruasId, p.jenis, p.tahun, p.nilai, p.penyedia, p.noKontrak, p.mulai, p.selesai, p.fisik, p.keu, p.statusManual, p.sumber, p.panjang, p.lat, p.lng, p.catatan]);
  function diff(items) {
    const by = new Map(DB.map(p => [p.kode, p])), r = { baru: [], ubah: [], sama: [] };
    items.forEach(p => { const o = by.get(p.kode); (!o ? r.baru : SIG(o) === SIG(p) ? r.sama : r.ubah).push(p); });
    return r;
  }
  function logProgres(p, fisik, keu) {
    p.log = p.log || []; const t = todayStr(), L = p.log[p.log.length - 1];
    if (L && L[0] === t) { L[1] = fisik; L[2] = keu; } else p.log.push([t, fisik, keu]);
    p.log = p.log.slice(-40);
  }

  /* ---------- Lampiran unggahan (terpisah dari data utama) ---------- */
  const LKEY = "pq_paket_lampiran_v1", LMAX = 15;
  const loadL = () => { try { const a = JSON.parse(localStorage.getItem(LKEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const storeL = a => { try { localStorage.setItem(LKEY, JSON.stringify(a)); return true; } catch (e) { return false; } };
  let LAMP = loadL();
  const FLD = [["nama", "Nama Paket"], ["kabupaten", "Kabupaten"], ["ruas", "Ruas"], ["ruasId", "ID Ruas"], ["jenis", "Jenis"], ["tahun", "Tahun"], ["nilai", "Nilai (Rp)"], ["penyedia", "Penyedia"], ["noKontrak", "No. Kontrak"], ["mulai", "Tgl Mulai"], ["selesai", "Tgl Selesai"], ["fisik", "Fisik (%)"], ["keu", "Keuangan (%)"], ["statusManual", "Status"], ["sumber", "Sumber Dana"], ["panjang", "Panjang (km)"], ["lat", "Lat"], ["lng", "Lng"], ["catatan", "Catatan"]];
  const eq = (a, b) => (a == null || a === "" ? "" : a) === (b == null || b === "" ? "" : b);
  function ubahan(o, n) { return FLD.filter(f => !eq(o[f[0]], n[f[0]])).map(f => ({ f: f[1], dari: o[f[0]] == null ? "" : o[f[0]], ke: n[f[0]] == null ? "" : n[f[0]] })); }
  // Bangun lampiran dari hasil diff; dipanggil SEBELUM data diterapkan (DB masih keadaan lama)
  function bangunLampiran(items, errors, nama) {
    const d = diff(items), by = new Map(DB.map(p => [p.kode, p])), clean = p => { const c = Object.assign({}, p); delete c._contoh; delete c.log; return c; };
    return {
      id: "L" + Date.now().toString(36), waktu: new Date().toISOString(), berkas: nama || "-", total: items.length,
      baru: d.baru.map(clean), sama: d.sama.length,
      ubah: d.ubah.map(p => ({ kode: p.kode, nama: p.nama, perubahan: ubahan(by.get(p.kode), p) })),
      galat: errors.slice(0, 500), contoh: items.filter(p => p._contoh).length
    };
  }
  function simpanLampiran(L) { LAMP.unshift(L); LAMP = LAMP.slice(0, LMAX); if (!storeL(LAMP)) { LAMP = LAMP.slice(0, 3); storeL(LAMP); } }
  const fmtW = iso => { const d = new Date(iso); return isNaN(d) ? "-" : pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  function unduhLampiran(L) {
    if (typeof XLSX === "undefined") return say("Pustaka Excel belum termuat");
    L = L || LAMP[0]; if (!L) return say("Belum ada lampiran unggahan");
    const wb = XLSX.utils.book_new(), tg = todayStr();
    const ring = [["LAMPIRAN UNGGAHAN DATA PAKET"], [""], ["Berkas", L.berkas], ["Waktu unggah", fmtW(L.waktu)], ["Total baris terbaca", L.total], ["Paket baru", L.baru.length], ["Paket diperbarui", L.ubah.length], ["Tidak berubah", L.sama], ["Galat / peringatan", L.galat.length]];
    if (L.contoh) ring.push(["Catatan", L.contoh + " baris bertanda CONTOH (data fiktif)"]);
    const w1 = XLSX.utils.aoa_to_sheet(ring); w1["!cols"] = [{ wch: 24 }, { wch: 50 }]; XLSX.utils.book_append_sheet(wb, w1, "Ringkasan");
    const w2 = XLSX.utils.aoa_to_sheet([HDR].concat(L.baru.map(toRow))); w2["!cols"] = [13, 40, 12, 34, 30, 20, 10, 18, 28, 22, 12, 13, 10, 11, 16, 14, 10, 13, 13, 46].map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, w2, "Paket Baru");
    const rows = [["Kode", "Nama Paket", "Kolom", "Sebelum", "Sesudah"]];
    L.ubah.forEach(u => u.perubahan.forEach(c => rows.push([u.kode, u.nama, c.f, c.dari, c.ke])));
    const w3 = XLSX.utils.aoa_to_sheet(rows); w3["!cols"] = [13, 40, 18, 28, 28].map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, w3, "Diperbarui");
    if (L.galat.length) { const w4 = XLSX.utils.aoa_to_sheet([["Galat / peringatan"]].concat(L.galat.map(g => [g]))); w4["!cols"] = [{ wch: 100 }]; XLSX.utils.book_append_sheet(wb, w4, "Galat"); }
    XLSX.writeFile(wb, "lampiran-unggahan-paket-" + L.waktu.slice(0, 10) + "-" + L.id.slice(-4) + ".xlsx");
  }
  function hapusLampiran(id) { LAMP = LAMP.filter(l => l.id !== id); storeL(LAMP); }
  const barusan = kode => { const L = LAMP[0]; if (!L) return ""; return L.baru.some(p => p.kode === kode) ? "baru" : L.ubah.some(u => u.kode === kode) ? "ubah" : ""; };

  function lampiranUi() {
    const o = $("div", "position:fixed;inset:0;z-index:6100;background:#000b;display:flex;align-items:center;justify-content:center;padding:10px"), b = $("div", "background:#071a26;color:#e6f1f7;border:1px solid #22d3ee55;border-radius:14px;width:min(720px,100%);max-height:90vh;overflow:auto;padding:14px;font:13px system-ui");
    const draw = () => {
      b.innerHTML = '<div style="display:flex;align-items:center"><b style="flex:1;font-size:14px">Lampiran Unggahan Data Paket</b><button id="lX" style="background:none;border:0;color:#fff;font-size:18px;cursor:pointer">\u2715</button></div>' +
        '<div style="color:#9fb6c3;margin:6px 0 10px;line-height:1.5">Setiap unggahan yang diterapkan disimpan sebagai lampiran terpisah dari data utama: berisi paket baru, perubahan paket lama (sebelum \u2192 sesudah), dan galat. Menyimpan ' + LMAX + ' unggahan terakhir di perangkat ini.</div>' +
        (LAMP.length ? LAMP.map((l, i) => '<div style="border:1px solid #ffffff22;border-radius:8px;padding:9px 10px;margin-bottom:8px;background:#0b2a3b"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="flex:1;min-width:160px;word-break:break-all">' + esc(l.berkas) + (i === 0 ? " " + bdg("terbaru", "#22d3ee") : "") + '</b><span style="color:#9fb6c3;font-size:11px">' + fmtW(l.waktu) + '</span></div><div style="margin:5px 0;font-size:12px"><span style="color:#34d399">' + l.baru.length + ' baru</span> \u00b7 <span style="color:#f59e0b">' + l.ubah.length + ' diperbarui</span> \u00b7 ' + l.sama + ' sama' + (l.galat.length ? ' \u00b7 <span style="color:#fecaca">' + l.galat.length + ' galat</span>' : "") + '</div>' +
          (l.baru.length || l.ubah.length ? '<div style="font-size:11px;color:#9fb6c3;max-height:64px;overflow:auto">' + l.baru.slice(0, 40).map(p => esc(p.kode)).join(", ") + (l.ubah.length ? (l.baru.length ? " \u00b7 diperbarui: " : "diperbarui: ") + l.ubah.slice(0, 40).map(u => esc(u.kode)).join(", ") : "") + "</div>" : "") +
          '<div style="margin-top:7px;display:flex;gap:6px">' + '<button data-d="' + l.id + '" style="background:#15803d;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font:600 12px system-ui">Unduh Excel</button><button data-h="' + l.id + '" style="background:#b91c1c;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font:600 12px system-ui">Hapus lampiran</button></div></div>').join("")
          : '<div style="padding:16px;color:#9fb6c3">Belum ada lampiran. Lampiran dibuat otomatis saat Anda menekan <b>Terapkan</b> pada pratinjau unggahan.</div>');
      b.querySelector("#lX").onclick = () => o.remove();
      b.querySelectorAll("[data-d]").forEach(x => x.onclick = () => unduhLampiran(LAMP.find(l => l.id === x.dataset.d)));
      b.querySelectorAll("[data-h]").forEach(x => x.onclick = () => { if (confirm("Hapus lampiran ini? Data paket utama tidak terpengaruh.")) { hapusLampiran(x.dataset.h); draw(); render(); } });
    };
    o.append(b); document.body.append(o); o.onclick = e => { if (e.target === o) o.remove(); }; draw();
  }

  function terapkan(items) {
    try { localStorage.setItem(BAK, JSON.stringify(DB)); } catch (e) { }
    const by = new Map(DB.map(p => [p.kode, p]));
    items.forEach(p => {
      const o = by.get(p.kode), n = Object.assign({}, p); delete n._contoh;
      n.log = o && o.log ? o.log.slice() : [];
      if (!o || o.fisik !== n.fisik || o.keu !== n.keu) logProgres(n, n.fisik, n.keu);
      by.set(p.kode, n);
    });
    DB = Array.from(by.values()); return store(DB);
  }
  function urungkan() {
    try { const b = JSON.parse(localStorage.getItem(BAK)); if (!Array.isArray(b)) return false; DB = b; store(DB); if (LAMP.length && Date.now() - Date.parse(LAMP[0].waktu) < 36e5) { LAMP.shift(); storeL(LAMP); } return true; } catch (e) { return false; }
  }

  /* ---------- Template & ekspor ---------- */
  const HDR = ["Kode Paket", "Nama Paket", "Kabupaten", "Ruas", "ID Ruas (opsional)", "Jenis Penanganan", "Tahun Anggaran", "Nilai Kontrak (Rp)", "Penyedia Jasa", "No. Kontrak", "Tgl Mulai", "Tgl Selesai Kontrak", "Progres Fisik (%)", "Progres Keuangan (%)", "Status (opsional)", "Sumber Dana", "Panjang (km)", "Latitude (opsional)", "Longitude (opsional)", "Catatan"];
  const toRow = p => [p.kode, p.nama, p.kabupaten, p.ruas, p.ruasId, p.jenis, p.tahun, p.nilai, p.penyedia, p.noKontrak, p.mulai, p.selesai, p.fisik, p.keu, p.statusManual || "", p.sumber, p.panjang, p.lat, p.lng, p.catatan].map(v => v == null ? "" : v);
  const PETUNJUK = [["PETUNJUK PENGISIAN - Paket Pekerjaan"], [""], ["1) Hapus baris contoh (Catatan berawalan CONTOH), isi paket asli."], ["2) Kode Paket = kunci. Kode sama saat unggah ulang = memperbarui paket & mencatat riwayat progres."], ["3) Wajib: Kode Paket & Nama Paket. Tgl Mulai/Selesai diperlukan untuk status otomatis & deviasi."], ["4) ID Ruas = id di data-ruas.js (mis. 33-banyumas-buntu); beberapa ruas dipisah titik koma (;). Paket titik (jembatan) cukup isi Latitude & Longitude."], ["5) Progres 0-100 tanpa %. Status dikosongkan (otomatis) atau isi hanya 'Putus Kontrak' / 'Selesai'."], ["6) Tanggal: format tanggal Excel, dd/mm/yyyy, yyyy-mm-dd, atau '5 Maret 2026'."], ["Data contoh bersifat FIKTIF (nilai, penyedia, no. kontrak)."]];
  function sheetBook(rows, extra) {
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([HDR].concat(rows));
    ws["!cols"] = [13, 40, 12, 34, 30, 20, 10, 18, 28, 22, 12, 13, 10, 11, 16, 14, 10, 13, 13, 46].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Paket");
    if (extra) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(PETUNJUK), "Petunjuk");
    return wb;
  }
  function unduhTemplate() {
    if (typeof XLSX === "undefined") return say("Pustaka Excel belum termuat");
    const rows = (window.PAKET_CONTOH || []).map(toRow);
    XLSX.writeFile(sheetBook(rows, true), "template-paket-banyumas-cilacap.xlsx");
  }
  function ekspor(list) {
    if (typeof XLSX === "undefined") return say("Pustaka Excel belum termuat");
    const tg = todayStr(), wb = sheetBook((list || DB).map(toRow), false);
    const L = [["Kode", "Nama Paket", "Status", "Rencana (%)", "Fisik (%)", "Deviasi (%)", "Kategori", "Sisa Hari", "Nilai Kontrak (Rp)", "Riwayat Progres (tgl:fisik/keu)"]];
    (list || DB).forEach(p => { const d = derive(p, tg); L.push([p.kode, p.nama, d.status, d.rencana == null ? "" : +d.rencana.toFixed(1), p.fisik, d.dev == null ? "" : +d.dev.toFixed(1), d.kat, d.sisa == null ? "" : d.sisa, p.nilai || 0, (p.log || []).map(x => x[0] + ":" + x[1] + "/" + x[2]).join(" ; ")]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(L), "Status per " + tg);
    XLSX.writeFile(wb, "paket-pekerjaan-" + tg + ".xlsx");
  }

  /* ---------- Peta ---------- */
  const SC = { "Berjalan": "#22d3ee", "Terlambat": "#f43f5e", "Belum Mulai": "#a78bfa", "Selesai": "#34d399", "Putus Kontrak": "#94a3b8" };
  const KC = { Sesuai: "#34d399", Waspada: "#f59e0b", Kritis: "#f43f5e" };
  const CK = "pq_paket_lbl_v1", LBL_Z = 9;
  let CFG = (() => { try { return Object.assign({ lbl: true, auto: false }, JSON.parse(localStorage.getItem(CK)) || {}); } catch (e) { return { lbl: true, auto: false }; } })();
  const cfgSave = () => { try { localStorage.setItem(CK, JSON.stringify(CFG)); } catch (e) { } };
  let layer = null, lblLayer = null, mode = null, chip = null, zHook = false;
  function css() {
    if (document.getElementById("pqPaketCss")) return;
    const st = $("style"); st.id = "pqPaketCss";
    st.textContent = ".pqpl-w{background:none!important;border:0!important}.pqpl{display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;background:#071a26ee;color:#fff;border:2px solid #22d3ee;border-radius:10px;padding:1px 7px;font:700 11px system-ui;box-shadow:0 1px 6px #0009;cursor:pointer}";
    document.head.appendChild(st);
  }
  function labelPos(p, rs) {
    let best = null; rs.forEach(r => { const q = r.points || []; if (q.length && (!best || q.length > best.length)) best = q; });
    if (best) { const m = best[Math.floor(best.length / 2)]; return [m.lat, m.lng]; }
    return p.lat != null && p.lng != null ? [p.lat, p.lng] : null;
  }
  function lblApply() {
    const m = MAP(); if (!m || !lblLayer) return;
    const show = CFG.lbl && m.getZoom() >= LBL_Z, on = m.hasLayer(lblLayer);
    if (show && !on) lblLayer.addTo(m); else if (!show && on) m.removeLayer(lblLayer);
  }
  function chipRender() {
    if (!layer) { if (chip) chip.style.display = "none"; return; }
    if (!chip) {
      chip = $("div", "position:fixed;right:10px;bottom:136px;z-index:3900;display:flex;gap:5px;font:600 11.5px system-ui");
      document.body.append(chip);
    }
    const b = (id, on, t, tip) => '<button data-c="' + id + '" title="' + tip + '" style="border:1px solid #22d3ee66;border-radius:14px;padding:5px 10px;cursor:pointer;color:#fff;background:' + (on ? "#0e7490" : "#071a26ee") + '">' + t + (on === null ? "" : on ? ": ON" : ": OFF") + "</button>";
    chip.innerHTML = b("lbl", CFG.lbl, "Label paket", "Label tampil mulai zoom " + LBL_Z) + b("auto", CFG.auto, "Otomatis", "Tampilkan paket aktif di peta setiap aplikasi dibuka") + b("x", null, "\u2715", "Sembunyikan paket dari peta");
    chip.style.display = "flex";
    chip.querySelector('[data-c="lbl"]').onclick = () => setLabel(!CFG.lbl);
    chip.querySelector('[data-c="auto"]').onclick = () => setAuto(!CFG.auto);
    chip.querySelector('[data-c="x"]').onclick = hapusPeta;
  }
  function syncUi() { chipRender(); if (ov) { const a = ov.querySelector("#pkLbl"), b = ov.querySelector("#pkAuto"); if (a) a.checked = CFG.lbl; if (b) b.checked = CFG.auto; } }
  function setLabel(v) { CFG.lbl = !!v; cfgSave(); lblApply(); syncUi(); say("Label paket " + (CFG.lbl ? "ON (tampil mulai zoom " + LBL_Z + ")" : "OFF")); }
  function setAuto(v) { CFG.auto = !!v; cfgSave(); syncUi(); if (CFG.auto && !layer) sync(); say("Tampil otomatis " + (CFG.auto ? "ON: paket aktif muncul di peta saat aplikasi dibuka" : "OFF")); }
  function petakan(list, opt) {
    opt = opt || {};
    const m = MAP(); if (!m || !window.L) return say("Peta belum siap");
    css();
    if (layer) m.removeLayer(layer); if (lblLayer && m.hasLayer(lblLayer)) m.removeLayer(lblLayer);
    layer = L.layerGroup().addTo(m); lblLayer = L.layerGroup();
    mode = opt.auto ? { auto: true } : { kodes: list.map(p => p.kode) };
    const bnd = [], tg = todayStr();
    list.forEach(p => {
      const d = derive(p, tg), col = SC[d.status], pop = "<b>" + esc(p.kode) + "</b><br>" + esc(p.nama) + "<br>" + esc(d.status) + " \u00b7 fisik " + p.fisik + "%" + (d.dev != null ? " (dev " + d.dev.toFixed(1) + ")" : "") + "<br>" + esc(p.penyedia || "") + "<br>" + rpS(p.nilai || 0);
      const rs = matchRoads(p);
      rs.forEach(r => { const pts = (r.points || []).map(x => [x.lat, x.lng]); if (pts.length > 1) { L.polyline(pts, { color: col, weight: 7, opacity: .9 }).bindPopup(pop).addTo(layer); pts.forEach(x => bnd.push(x)); } });
      if (!rs.length && p.lat != null && p.lng != null) { L.circleMarker([p.lat, p.lng], { radius: 9, color: "#fff", weight: 2, fillColor: col, fillOpacity: 1 }).bindPopup(pop).addTo(layer); bnd.push([p.lat, p.lng]); }
      const lp = labelPos(p, rs);
      if (lp) L.marker(lp, { icon: L.divIcon({ className: "pqpl-w", iconSize: [0, 0], html: '<span class="pqpl" style="border-color:' + col + '">' + (d.status === "Terlambat" ? "\u26a0 " : "") + esc(p.kode) + " \u00b7 " + p.fisik + "%</span>" }), keyboard: false }).on("click", () => detail(p.kode)).addTo(lblLayer);
    });
    if (!zHook) { zHook = true; m.on("zoomend", lblApply); }
    lblApply(); chipRender();
    if (opt.fit !== false) { if (bnd.length) m.fitBounds(bnd, { padding: [50, 50], maxZoom: 14 }); else say("Tidak ada paket yang bisa dipetakan (isi ID Ruas atau Lat/Lng)"); }
  }
  function hapusPeta() { const m = MAP(); if (m) { if (layer) m.removeLayer(layer); if (lblLayer && m.hasLayer(lblLayer)) m.removeLayer(lblLayer); } layer = lblLayer = mode = null; chipRender(); }
  // segarkan peta setelah data berubah (unggah/edit/hapus/urungkan); mode otomatis = semua paket aktif
  function sync() {
    if (!layer && !CFG.auto) return;
    const tg = todayStr();
    const list = !mode || mode.auto ? DB.filter(p => derive(p, tg).aktif) : mode.kodes.map(k => DB.find(p => p.kode === k)).filter(Boolean);
    if (!list.length) return hapusPeta();
    petakan(list, { fit: false, auto: !mode || !!mode.auto });
  }
  function autoStart() { let n = 0; const iv = setInterval(() => { n++; if (MAP() && window.L && roadsAll().length && DB.length) { clearInterval(iv); sync(); } else if (n > 40) clearInterval(iv); }, 500); }

  /* ---------- UI ---------- */
  let ov = null, tab = "aktif", fKab = "", fThn = "", fQ = "", pending = null;
  const bdg = (t, c) => '<span style="background:' + c + '33;color:' + c + ';border:1px solid ' + c + '66;border-radius:10px;padding:1px 7px;font-size:11px;white-space:nowrap">' + esc(t) + "</span>";
  const btn = (id, t, bg) => '<button id="' + id + '" style="background:' + bg + ';color:#fff;border:0;border-radius:6px;padding:7px 11px;cursor:pointer;font:600 12px system-ui">' + t + "</button>";

  function open() {
    if (ov) ov.remove();
    ov = $("div", "position:fixed;inset:0;z-index:6000;background:#000a;display:flex;align-items:center;justify-content:center;padding:10px");
    const box = $("div", "background:#071a26;color:#e6f1f7;border:1px solid #22d3ee55;border-radius:14px;width:min(1100px,100%);max-height:92vh;display:flex;flex-direction:column;font:13px system-ui");
    ov.append(box); document.body.append(ov); ov.onclick = e => { if (e.target === ov) ov.remove(); };
    box.innerHTML = '<div style="padding:12px 14px;display:flex;gap:8px;align-items:center;border-bottom:1px solid #ffffff22"><b style="font-size:15px;flex:1">Paket Berjalan & Riwayat Paket</b><button id="pkX" style="background:none;border:0;color:#fff;font-size:20px;cursor:pointer">\u2715</button></div>' +
      '<div style="padding:10px 14px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + btn("pkUp", "Unggah Excel", "#0e7490") + btn("pkTpl", "Unduh Template", "#475569") + btn("pkDemo", "Muat Contoh Banyumas & Cilacap", "#7c3aed") + btn("pkMap", "Tampilkan di Peta", "#0369a1") + btn("pkXl", "Ekspor Excel", "#15803d") + btn("pkLamp", "Lampiran Unggahan", "#0f766e") + btn("pkUndo", "Urungkan", "#92400e") + '<label style="display:flex;align-items:center;gap:4px;margin-left:6px"><input id="pkLbl" type="checkbox"> Label paket di peta</label><label style="display:flex;align-items:center;gap:4px"><input id="pkAuto" type="checkbox"> Tampil otomatis</label><input id="pkFile" type="file" accept=".xlsx,.xls,.csv" style="display:none"></div>' +
      '<div id="pkPrev"></div><div id="pkKpi" style="padding:0 14px"></div>' +
      '<div style="padding:8px 14px;display:flex;gap:6px;flex-wrap:wrap;align-items:center" id="pkBar"></div><div id="pkBody" style="overflow:auto;padding:0 14px 14px"></div>';
    const q = s => box.querySelector(s), file = q("#pkFile");
    q("#pkX").onclick = () => ov.remove();
    q("#pkLbl").checked = CFG.lbl; q("#pkAuto").checked = CFG.auto;
    q("#pkLbl").onchange = e => setLabel(e.target.checked); q("#pkAuto").onchange = e => setAuto(e.target.checked);
    q("#pkUp").onclick = () => file.click();
    q("#pkTpl").onclick = unduhTemplate;
    q("#pkLamp").onclick = lampiranUi;
    q("#pkXl").onclick = () => DB.length ? ekspor(filtered()) : say("Belum ada data paket");
    q("#pkMap").onclick = () => { const l = filtered(); if (!l.length) return say("Tidak ada paket"); ov.remove(); petakan(l); };
    q("#pkUndo").onclick = () => { if (urungkan()) { say("Dikembalikan ke data sebelum perubahan terakhir"); render(); sync(); } else say("Tidak ada cadangan"); };
    q("#pkDemo").onclick = () => { if (!window.PAKET_CONTOH) return say("data-paket-contoh.js belum termuat"); preview(window.PAKET_CONTOH.map(p => Object.assign({ statusManual: p.status || "", _contoh: true }, p)), [], "Data contoh"); };
    file.onchange = async () => {
      const f = file.files[0]; file.value = ""; if (!f) return;
      if (typeof XLSX === "undefined") return say("Pustaka Excel belum termuat");
      try { const r = parseWorkbook(XLSX.read(await f.arrayBuffer(), { type: "array" })); if (r.err) { q("#pkPrev").innerHTML = '<div style="margin:0 14px;padding:10px;border:1px solid #f43f5e;border-radius:8px;color:#fecaca">' + esc(r.err) + "</div>"; return; } preview(r.items, r.errors, f.name); }
      catch (e) { say("Gagal membaca berkas: " + e.message); }
    };
    function preview(items, errors, nm) {
      const d = diff(items), contoh = items.filter(p => p._contoh).length; pending = items;
      q("#pkPrev").innerHTML = '<div style="margin:0 14px 8px;padding:10px;border:1px solid #22d3ee66;border-radius:8px;background:#0b2a3b"><b>Pratinjau: ' + esc(nm) + "</b><br>" + items.length + " paket terbaca \u00b7 <span style='color:#34d399'>" + d.baru.length + " baru</span> \u00b7 <span style='color:#f59e0b'>" + d.ubah.length + " diperbarui</span> \u00b7 " + d.sama.length + " sama" +
        (contoh ? "<br><span style='color:#fbbf24'>\u26a0 " + contoh + " baris bertanda CONTOH (data fiktif). Terapkan hanya untuk mencoba fitur.</span>" : "") +
        (errors.length ? '<div style="margin-top:6px;color:#fecaca;font-size:12px;max-height:90px;overflow:auto">' + errors.slice(0, 30).map(esc).join("<br>") + (errors.length > 30 ? "<br>\u2026" : "") + "</div>" : "") +
        '<div style="margin-top:8px;display:flex;gap:6px">' + btn("pkOk", "Terapkan", "#15803d") + btn("pkPL", "Unduh Lampiran (pratinjau)", "#0f766e") + btn("pkNo", "Batal", "#475569") + "</div></div>";
      q("#pkNo").onclick = () => { pending = null; q("#pkPrev").innerHTML = ""; };
      q("#pkPL").onclick = () => { if (pending) unduhLampiran(bangunLampiran(pending, errors, nm)); };
      q("#pkOk").onclick = () => { if (!pending) return; const n = pending.length, L = bangunLampiran(pending, errors, nm); if (terapkan(pending)) { simpanLampiran(L); say(n + " paket diterapkan \u00b7 " + L.baru.length + " baru, " + L.ubah.length + " diperbarui \u00b7 lampiran tersimpan (bisa diurungkan)"); } pending = null; q("#pkPrev").innerHTML = ""; render(); sync(); };
    }
    render();
  }

  function filtered() {
    const tg = todayStr(), qq = fQ.toLowerCase();
    return DB.filter(p => {
      const d = derive(p, tg);
      if (tab === "aktif" && !d.aktif) return false;
      if (tab === "riwayat" && d.aktif) return false;
      if (fKab && p.kabupaten !== fKab) return false;
      if (fThn && String(p.tahun) !== fThn) return false;
      if (qq && !(p.kode + " " + p.nama + " " + p.ruas + " " + p.penyedia).toLowerCase().includes(qq)) return false;
      return true;
    }).sort((a, b) => {
      const da = derive(a, tg), db = derive(b, tg);
      if (tab === "aktif") { const o = { Kritis: 0, Waspada: 1, Sesuai: 2, "": 3 }; return (o[da.kat] - o[db.kat]) || ((da.sisa == null ? 1e9 : da.sisa) - (db.sisa == null ? 1e9 : db.sisa)); }
      return String(b.selesai || "").localeCompare(String(a.selesai || ""));
    });
  }

  function render() {
    if (!ov) return;
    const q = s => ov.querySelector(s), tg = todayStr();
    const all = DB.map(p => ({ p, d: derive(p, tg) })), ak = all.filter(x => x.d.aktif), rw = all.filter(x => !x.d.aktif);
    const nilAk = ak.reduce((s, x) => s + (x.p.nilai || 0), 0);
    const avg = nilAk ? ak.reduce((s, x) => s + (x.p.fisik || 0) * (x.p.nilai || 0), 0) / nilAk : (ak.length ? ak.reduce((s, x) => s + (x.p.fisik || 0), 0) / ak.length : 0);
    const kritis = ak.filter(x => x.d.kat === "Kritis" || x.d.status === "Terlambat").length;
    const kpi = (t, v, c) => '<div style="flex:1;min-width:130px;background:#0b2a3b;border:1px solid #ffffff1a;border-radius:8px;padding:7px 10px"><div style="color:#9fb6c3;font-size:11px">' + t + '</div><div style="font:700 15px system-ui;color:' + (c || "#fff") + '">' + v + "</div></div>";
    q("#pkKpi").innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap">' + kpi("Paket aktif", ak.length) + kpi("Nilai kontrak aktif", rpS(nilAk)) + kpi("Progres fisik (tertimbang nilai)", avg.toFixed(1) + "%") + kpi("Terlambat / Kritis", kritis, kritis ? "#f43f5e" : "#34d399") + kpi("Riwayat (selesai/putus)", rw.length + " \u00b7 " + rpS(rw.reduce((s, x) => s + (x.p.nilai || 0), 0))) + "</div>";
    const kabs = Array.from(new Set(DB.map(p => p.kabupaten).filter(Boolean))).sort(), thn = Array.from(new Set(DB.map(p => p.tahun).filter(Boolean))).sort((a, b) => b - a);
    const sel = (id, opts, v, lbl) => '<select id="' + id + '" style="background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:5px"><option value="">' + lbl + "</option>" + opts.map(o => '<option ' + (String(o) === String(v) ? "selected" : "") + ' value="' + esc(o) + '">' + esc(o) + "</option>").join("") + "</select>";
    const tb = (k, t, n) => '<button data-tab="' + k + '" style="border:1px solid #22d3ee66;border-radius:14px;padding:5px 12px;cursor:pointer;font:600 12px system-ui;background:' + (tab === k ? "#0e7490" : "transparent") + ';color:#fff">' + t + " (" + n + ")</button>";
    q("#pkBar").innerHTML = tb("aktif", "Aktif / Berjalan", ak.length) + tb("riwayat", "Riwayat", rw.length) + tb("semua", "Semua", all.length) + sel("pkKab", kabs, fKab, "Semua kabupaten") + sel("pkThn", thn, fThn, "Semua tahun") + '<input id="pkQ" placeholder="Cari kode / paket / ruas / penyedia" value="' + esc(fQ) + '" style="flex:1;min-width:160px;background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:6px">';
    q("#pkBar").querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    q("#pkKab").onchange = e => { fKab = e.target.value; render(); }; q("#pkThn").onchange = e => { fThn = e.target.value; render(); };
    q("#pkQ").onchange = e => { fQ = e.target.value; render(); };
    const list = filtered(), body = q("#pkBody");
    if (!DB.length) { body.innerHTML = '<div style="padding:18px;color:#9fb6c3;line-height:1.6">Belum ada data paket. Klik <b>Unduh Template</b>, isi, lalu <b>Unggah Excel</b>. Untuk mencoba, klik <b>Muat Contoh Banyumas & Cilacap</b> (data fiktif).</div>'; return; }
    if (!list.length) { body.innerHTML = '<div style="padding:18px;color:#9fb6c3">Tidak ada paket pada filter ini.</div>'; return; }
    body.innerHTML = '<table style="width:100%;border-collapse:collapse;min-width:900px"><thead><tr style="text-align:left;color:#22d3ee"><th>Paket</th><th>Kab.</th><th>Ruas / Penyedia</th><th>Periode</th><th>Nilai</th><th style="width:170px">Progres fisik</th><th>Deviasi</th><th>Status</th></tr></thead><tbody>' +
      list.map(p => { const d = derive(p, tg), c = SC[d.status];
        const bar = '<div style="position:relative;height:10px;background:#ffffff1a;border-radius:5px"><div style="height:10px;border-radius:5px;width:' + Math.min(100, p.fisik) + "%;background:" + c + '"></div>' + (d.rencana != null && d.aktif ? '<div title="Rencana ' + d.rencana.toFixed(0) + '%" style="position:absolute;top:-3px;left:' + d.rencana + '%;width:2px;height:16px;background:#fff"></div>' : "") + '</div><div style="font-size:11px;color:#9fb6c3">' + p.fisik + "% fisik \u00b7 " + p.keu + "% keu</div>";
        return '<tr data-k="' + esc(p.kode) + '" style="border-top:1px solid #ffffff14;cursor:pointer;vertical-align:top"><td><b>' + esc(p.kode) + '</b> ' + (barusan(p.kode) === "baru" ? bdg("BARU", "#34d399") : barusan(p.kode) === "ubah" ? bdg("DIPERBARUI", "#f59e0b") : "") + '<div style="max-width:230px">' + esc(p.nama) + '</div><div style="color:#9fb6c3;font-size:11px">' + esc(p.jenis || "") + "</div></td><td>" + esc(p.kabupaten) + '</td><td style="max-width:200px">' + esc(p.ruas) + '<div style="color:#9fb6c3;font-size:11px">' + esc(p.penyedia || "-") + "</div></td><td>" + fmtD(p.mulai) + " \u2192 " + fmtD(p.selesai) + (d.aktif && d.sisa != null ? '<div style="font-size:11px;color:' + (d.sisa < 0 ? "#f43f5e" : "#9fb6c3") + '">' + (d.sisa < 0 ? "lewat " + -d.sisa : "sisa " + d.sisa) + " hari</div>" : "") + "</td><td>" + rpS(p.nilai || 0) + "</td><td>" + bar + "</td><td>" + (d.kat ? bdg(d.kat + " " + (d.dev > 0 ? "+" : "") + d.dev.toFixed(0), KC[d.kat]) : "-") + "</td><td>" + bdg(d.status, c) + "</td></tr>"; }).join("") + "</tbody></table>";
    body.querySelectorAll("tr[data-k]").forEach(tr => tr.onclick = () => detail(tr.dataset.k));
  }

  function detail(kode) {
    const p = DB.find(x => x.kode === kode); if (!p) return;
    const d = derive(p, todayStr()), o = $("div", "position:fixed;inset:0;z-index:6100;background:#000b;display:flex;align-items:center;justify-content:center;padding:10px"), b = $("div", "background:#071a26;color:#e6f1f7;border:1px solid #22d3ee55;border-radius:14px;width:min(560px,100%);max-height:90vh;overflow:auto;padding:14px;font:13px system-ui");
    const inp = (id, v, w) => '<input id="' + id + '" type="number" min="0" max="100" step="0.1" value="' + v + '" style="width:' + w + 'px;background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:5px">';
    const log = (p.log || []).slice(-8).reverse().map(x => fmtD(x[0]) + ": fisik " + x[1] + "% \u00b7 keu " + x[2] + "%").join("<br>") || "-";
    b.innerHTML = '<div style="display:flex;align-items:center"><b style="flex:1;font-size:14px">' + esc(p.kode) + " \u00b7 " + esc(p.nama) + '</b><button id="dX" style="background:none;border:0;color:#fff;font-size:18px;cursor:pointer">\u2715</button></div>' +
      '<div style="margin:6px 0">' + bdg(d.status, SC[d.status]) + (d.kat ? " " + bdg(d.kat, KC[d.kat]) : "") + "</div>" +
      '<div style="color:#9fb6c3;line-height:1.6">' + esc(p.kabupaten) + " \u00b7 " + esc(p.ruas) + "<br>Penyedia: " + esc(p.penyedia || "-") + " \u00b7 Kontrak: " + esc(p.noKontrak || "-") + "<br>Nilai: " + rp(p.nilai) + " \u00b7 " + esc(p.sumber || "-") + " \u00b7 TA " + (p.tahun || "-") + "<br>Periode: " + fmtD(p.mulai) + " \u2192 " + fmtD(p.selesai) + (d.rencana != null ? " \u00b7 Rencana hari ini " + d.rencana.toFixed(1) + "%" : "") + (d.dev != null ? " \u00b7 Deviasi " + d.dev.toFixed(1) + "%" : "") + "</div>" +
      '<div style="margin:10px 0;display:flex;gap:10px;flex-wrap:wrap;align-items:center">Fisik % ' + inp("dF", p.fisik, 70) + " Keuangan % " + inp("dK", p.keu, 70) + '<label>Status <select id="dS" style="background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:5px"><option value="">Otomatis</option><option ' + (p.statusManual === "Selesai" ? "selected" : "") + '>Selesai</option><option ' + (p.statusManual === "Putus Kontrak" ? "selected" : "") + ">Putus Kontrak</option></select></label></div>" +
      '<textarea id="dC" rows="2" style="width:100%;background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:6px" placeholder="Catatan">' + esc(p.catatan || "") + "</textarea>" +
      '<div style="margin:8px 0;font-size:12px"><b>Riwayat progres</b><div style="color:#9fb6c3">' + log + "</div></div>" +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' + btn("dSave", "Simpan", "#15803d") + btn("dMap", "Lihat di Peta", "#0369a1") + btn("dDel", "Hapus", "#b91c1c") + "</div>";
    o.append(b); document.body.append(o); o.onclick = e => { if (e.target === o) o.remove(); };
    const q = s => b.querySelector(s), clamp = v => Math.max(0, Math.min(100, +v || 0));
    q("#dX").onclick = () => o.remove();
    q("#dSave").onclick = () => {
      try { localStorage.setItem(BAK, JSON.stringify(DB)); } catch (e) { }
      const f = clamp(q("#dF").value), k = clamp(q("#dK").value);
      if (f !== p.fisik || k !== p.keu) logProgres(p, f, k);
      p.fisik = f; p.keu = k; p.statusManual = q("#dS").value; p.catatan = q("#dC").value.trim();
      if (store(DB)) say("Tersimpan"); o.remove(); render(); sync();
    };
    q("#dMap").onclick = () => { o.remove(); if (ov) ov.remove(); petakan([p]); };
    q("#dDel").onclick = () => { if (!confirm("Hapus paket " + p.kode + "? (bisa diurungkan lewat tombol Urungkan)")) return; try { localStorage.setItem(BAK, JSON.stringify(DB)); } catch (e) { } DB = DB.filter(x => x.kode !== p.kode); store(DB); o.remove(); render(); sync(); };
  }

  function mount() {
    const b = $("button"); b.innerHTML = '<i class="fa-solid fa-file-contract"></i>'; b.title = "Paket berjalan & riwayat paket"; b.onclick = open;
    window.PQ_DOCK ? PQ_DOCK.adopt(b, "Paket berjalan & riwayat") : (b.style.cssText = "position:fixed;left:10px;bottom:270px;z-index:3900", document.body.append(b));
    /* Tombol Paket juga dipasang di toolbar peta, tepat di sebelah tombol Lokasi (AMP/BP/Quarry) */
    (function () {
      let tries = 0;
      const t = setInterval(() => {
        const tb = document.getElementById("mapToolbar");
        if (document.getElementById("pqPaketToolBtn")) { clearInterval(t); return; }
        const lok = document.getElementById("pqlokBtn");
        if ((tb && lok) || ++tries > 60) {
          clearInterval(t);
          if (!tb) return;
          const tbtn = document.createElement("button");
          tbtn.className = "tool-btn"; tbtn.id = "pqPaketToolBtn";
          tbtn.title = "Paket berjalan & riwayat paket (unggah Excel)";
          tbtn.innerHTML = '<i class="fa-solid fa-file-contract"></i>';
          tbtn.onclick = e => { e.stopPropagation(); open(); };
          lok && lok.parentNode === tb ? tb.insertBefore(tbtn, lok.nextSibling) : tb.appendChild(tbtn);
        }
      }, 300);
    })();
    const N = window.PETAQU_NEXUS;
    if (N && N.ACT) N.ACT.push(["Paket Berjalan & Riwayat", "kontrak aktif, progres, deviasi, riwayat; unggah Excel", open], ["Paket di Peta", "tampilkan semua paket berwarna menurut status", () => petakan(DB)], ["Label Paket ON/OFF", "tampilkan/sembunyikan label kode & progres paket di peta", () => setLabel(!CFG.lbl)]);
    if (CFG.auto) autoStart();
  }

  window.PETAQU_PAKET = { open, all: () => DB.slice(), derive, ruasAktif, ruasBaruSelesai, petakan, hapusPeta, setLabel, setAuto, sync, ekspor, unduhTemplate, lampiran: () => LAMP.slice(), unduhLampiran, lampiranUi, _t: { bangunLampiran, simpanLampiran, parseWorkbook, parseDate, parseNum, parseProg, matchRoads, diff, terapkan } };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => setTimeout(mount, 90)) : setTimeout(mount, 90);
})();
