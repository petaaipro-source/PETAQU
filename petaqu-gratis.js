/* PETAQU — KONTROL GRATIS (tab di panel "Persetujuan akses", HANYA admin).
   Dimuat on-demand oleh petaqu-admin.js setelah server memastikan akun ini 'admin'; pengguna lain tidak pernah memuat file ini.
   Semua keputusan dijalankan server (RPC admin_gratis_* di supabase-gratis-kontrol.sql); file ini hanya antarmuka.
   Isi: saklar hidup/mati, durasi (menit) yang ditentukan admin, pengaman cerdas (kuota harian/total, anti-lonjakan per jam,
   batas per perangkat, jam buka WIB, tanggal tutup otomatis), penasihat otomatis, undangan khusus (tautan pribadi),
   klaim terbaru (hentikan / jatah ulang / blokir), dan daftar blokir. */
(function () {
  "use strict";
  if (window.__pqGratis) return;
  var K = window.__pqAdminKit;
  if (!K) return;
  var el = K.el, btnCss = K.btnCss;

  var D = null, draft = null, dirty = false, err = null, loading = false, saveBar = null, durNote = null;
  var openSec = { set: true, inv: false, klaim: true, blok: false };
  var lastInv = null, invForm = { email: "", menit: "30", hari: "7", catatan: "" }, blokForm = { nilai: "", alasan: "" };

  var C = { txt: "#e6f1ff", mut: "#94a3b8", bg: "#0b1120", line: "#ffffff18", cy: "#22d3ee", ok: "#34d399", warn: "#fbbf24", bad: "#f87171", org: "#fb923c" };
  var INP = "background:#0f1521;color:#e6f1ff;border:1px solid #ffffff30;border-radius:8px;padding:7px 9px;font:12px system-ui;color-scheme:dark;min-width:0;width:100%;box-sizing:border-box";
  var TUTUP = { nonaktif: "dimatikan admin", ditutup: "di luar jam buka / melewati tanggal tutup", kuota_habis: "kuota sudah habis", penuh: "batas pendaftar per jam tercapai (anti-lonjakan)" };
  var ALASAN = { email_tidak_valid: "Email harus akun Gmail yang valid", jenis_tidak_valid: "Jenis tidak valid", nilai_kosong: "Nilai kosong", tidak_ada: "Data tidak ditemukan" };

  var PRESET = {
    rekomendasi: { lbl: "★ Rekomendasi", tip: "Seimbang: 10 mnt · 30/hari · 10/jam · 1 per perangkat", v: { menit: 10, kuota_harian: 30, kuota_total: "", maks_per_jam: 10, maks_per_fp: 1, jam_mulai: "", jam_selesai: "", buka_sampai: "" } },
    ketat: { lbl: "Ketat", tip: "5 mnt · 10/hari · 3/jam — untuk menekan penyalahgunaan", v: { menit: 5, kuota_harian: 10, kuota_total: "", maks_per_jam: 3, maks_per_fp: 1, jam_mulai: "", jam_selesai: "", buka_sampai: "" } },
    jam: { lbl: "Jam kerja", tip: "15 mnt · 40/hari · buka 08.00–17.00 WIB", v: { menit: 15, kuota_harian: 40, kuota_total: "", maks_per_jam: 10, maks_per_fp: 1, jam_mulai: 8, jam_selesai: 17, buka_sampai: "" } },
    event: { lbl: "Event 24 jam", tip: "30 mnt · 200/hari · tutup otomatis 24 jam lagi", v: { menit: 30, kuota_harian: 200, kuota_total: "", maks_per_jam: 60, maks_per_fp: 2, jam_mulai: "", jam_selesai: "", buka_sampai: "+24" } },
    demo: { lbl: "Demo terbatas", tip: "60 mnt · hanya 5 orang pertama", v: { menit: 60, kuota_harian: "", kuota_total: 5, maks_per_jam: 5, maks_per_fp: 1, jam_mulai: "", jam_selesai: "", buka_sampai: "" } }
  };

  /* ---------- util ---------- */
  function fmtDur(m) { m = Math.round(+m || 0); var h = Math.floor(m / 60), r = m % 60; return h ? h + " jam" + (r ? " " + r + " menit" : "") : m + " menit"; }
  function fmtSisa(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), d = s % 60; return m + ":" + ("0" + d).slice(-2); }
  function rel(iso) {
    if (!iso) return "—";
    var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
    return m < 1 ? "baru saja" : m < 60 ? m + " mnt lalu" : m < 1440 ? Math.round(m / 60) + " jam lalu" : Math.round(m / 1440) + " hari lalu";
  }
  function isoToWib(iso) { return iso ? new Date(Date.parse(iso) + 7 * 36e5).toISOString().slice(0, 16) : ""; }
  function wibToIso(v) { return v ? new Date(Date.parse(v + ":00Z") - 7 * 36e5).toISOString() : null; }
  function numOrNull(v) { v = String(v == null ? "" : v).trim(); return v === "" ? null : Math.max(0, Math.round(+v) || 0) || null; }
  function fromCfg(c) {
    return { menit: c.menit, kuota_harian: c.kuota_harian == null ? "" : c.kuota_harian, kuota_total: c.kuota_total == null ? "" : c.kuota_total,
      maks_per_jam: c.maks_per_jam == null ? "" : c.maks_per_jam, maks_per_fp: c.maks_per_fp, jam_mulai: c.jam_mulai == null ? "" : c.jam_mulai,
      jam_selesai: c.jam_selesai == null ? "" : c.jam_selesai, buka_sampai: isoToWib(c.buka_sampai), pesan_habis: c.pesan_habis || "" };
  }
  function bodyDraft() {
    return { menit: Math.max(1, Math.min(1440, Math.round(+draft.menit) || 10)), kuota_harian: numOrNull(draft.kuota_harian), kuota_total: numOrNull(draft.kuota_total),
      maks_per_jam: numOrNull(draft.maks_per_jam), maks_per_fp: Math.max(1, Math.min(10, Math.round(+draft.maks_per_fp) || 1)),
      jam_mulai: draft.jam_mulai === "" ? null : +draft.jam_mulai, jam_selesai: draft.jam_selesai === "" ? null : +draft.jam_selesai,
      buka_sampai: wibToIso(draft.buka_sampai), pesan_habis: String(draft.pesan_habis || "").trim() };
  }
  function redraw() { try { K.redraw(); } catch (e) { /* abaikan */ } }
  function linkUndangan(kode) { return location.origin + location.pathname.replace(/index\.html$/, "") + "?gratis=" + kode; }
  function salin(txt, b) {
    var ok = function () { var t = b.textContent; b.textContent = "Tersalin ✓"; setTimeout(function () { b.textContent = t; }, 1600); };
    try { navigator.clipboard.writeText(txt).then(ok, function () { K.T("Gagal menyalin", true); }); } catch (e) { K.T("Gagal menyalin", true); }
  }
  function chip(txt, warna) { return el("span", "display:inline-block;margin:3px 6px 0 0;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;border:1px solid " + warna + "88;color:" + warna, txt); }
  function card(border) { return el("div", "padding:12px 14px;border:1px solid " + (border || C.line) + ";border-radius:12px;background:" + C.bg); }
  function ghost(t) { return el("button", btnCss("transparent", C.txt, "#ffffff40"), t); }

  /* ---------- data ---------- */
  async function muat(manual) {
    if (loading) return;
    loading = true;
    try {
      D = await K.rpc("admin_gratis_ambil"); err = null;
      if (!draft || !dirty) { draft = fromCfg(D.config); dirty = false; }
      if (manual) K.T("Data gratis diperbarui");
    } catch (e) { err = e; if (manual || (e && e.code !== "http")) K.fail(e); }
    loading = false; redraw();
  }
  async function aksi(b, fn, body, okMsg, after) {
    b.disabled = true; b.style.opacity = ".6";
    try {
      var d = await K.rpc(fn, body);
      if (d && d.ok === false) K.T("Ditolak server: " + (ALASAN[d.reason] || d.reason || "tidak diketahui"), true);
      else { K.T(okMsg); if (after) after(d); await muat(); return; }
    } catch (e) { K.fail(e); }
    b.disabled = false; b.style.opacity = "";
  }

  /* ---------- penasihat cerdas ---------- */
  function saran() {
    var c = D.config, s = D.stat, t = D.tersedia || {}, out = [], conv = s.total ? Math.round(100 * s.konversi / s.total) : 0;
    function add(lv, tx) { out.push({ lv: lv, tx: tx }); }
    if (!c.aktif) { add("info", "Gratis sedang MATI: tombol tidak tampil di layar login dan tidak ada yang tahu fitur ini ada. Undangan khusus tetap bisa dipakai."); }
    else {
      if (!t.ok) add("warn", "Gratis aktif tetapi sedang tertutup: " + (TUTUP[t.reason] || t.reason) + ". Pengunjung tidak melihat tombol gratis.");
      if (c.menit > 60) add("warn", "Durasi " + fmtDur(c.menit) + " cukup panjang — berisiko dipakai sebagai akses gratis harian. 10–30 menit biasanya cukup untuk kesan pertama.");
      else if (c.menit < 5) add("info", "Durasi " + c.menit + " menit mungkin terlalu singkat untuk memuat peta dan menilai fitur. Coba 8–15 menit.");
      if (!c.kuota_harian && !c.kuota_total) add("warn", "Belum ada kuota harian/total: jumlah pendaftar gratis tidak terbatas. Disarankan kuota harian (mis. 30).");
      if (!c.maks_per_jam) add("warn", "Belum ada batas per jam: lonjakan mendadak (bot / tautan viral) tidak tertahan. Disarankan 10–20 per jam.");
      if (c.maks_per_fp > 2) add("warn", "Batas per perangkat " + c.maks_per_fp + " longgar; 1 paling aman.");
      if (c.buka_sampai && Date.parse(c.buka_sampai) < Date.now()) add("warn", "Tanggal tutup otomatis sudah lewat — gratis tertutup sampai kamu mengubah/menghapusnya.");
      if (c.kuota_harian && s.hari_ini_umum >= 0.8 * c.kuota_harian && s.hari_ini_umum < c.kuota_harian) add("warn", "Kuota harian hampir habis (" + s.hari_ini_umum + "/" + c.kuota_harian + ").");
      var al = s.alasan_24j || {}, pen = (al.penuh || 0) + (al.kuota_habis || 0);
      if (pen >= 5) add("info", pen + " calon pengguna ditolak 24 jam terakhir karena penuh/kuota. Bila itu pengunjung asli, naikkan batasnya sedikit; bila mencurigakan, biarkan.");
    }
    if (s.fp_ganda > 0) add("warn", s.fp_ganda + " perangkat tercatat membuat lebih dari satu klaim. Periksa daftar “Klaim terbaru” dan blokir bila perlu.");
    if (s.total >= 15) {
      if (conv < 5) add("info", "Hanya " + conv + "% dari " + s.total + " uji coba yang lanjut berlangganan. Isi “Pesan saat waktu habis” dengan ajakan + kontak admin, atau coba ubah durasi.");
      else if (conv >= 15) add("ok", "Konversi bagus: " + conv + "% uji coba menjadi pelanggan.");
    }
    if (s.total > 0 && !c.pesan_habis) add("info", "Pesan saat waktu habis masih kosong — tampilkan ajakan berlangganan / nomor WhatsApp admin di sana.");
    if (!out.length || out.every(function (x) { return x.lv === "ok"; })) add("ok", "Pengaturan sehat. Tidak ada yang perlu dibenahi.");
    return out;
  }

  /* ---------- tampilan ---------- */
  function kartuUtama() {
    var c = D.config, t = D.tersedia || {}, on = !!c.aktif, buka = on && t.ok;
    var warna = buka ? C.ok : on ? C.warn : "#64748b";
    var b = card(warna + "88"); b.style.display = "flex"; b.style.flexWrap = "wrap"; b.style.alignItems = "center"; b.style.gap = "10px";
    var l = el("div", "flex:1 1 240px;min-width:0");
    l.appendChild(el("div", "font-weight:800;font-size:15px", "Uji coba gratis"));
    var st = el("div", "margin-top:3px;font-size:12.5px;color:" + warna + ";font-weight:700", buka ? "AKTIF · " + fmtDur(c.menit) + " per pendaftar" : on ? "AKTIF tetapi sedang TERTUTUP" : "MATI");
    l.appendChild(st);
    l.appendChild(el("div", "margin-top:3px;font-size:11.5px;color:" + C.mut, buka ? "Tombol “Coba Gratis” tampil di layar login."
      : on ? "Alasan: " + (TUTUP[t.reason] || t.reason) + ". Tombol disembunyikan." : "Tombol tidak tampil di layar login; pengunjung tidak tahu fitur ini ada. Hanya undangan khusus yang bisa memulai."));
    b.appendChild(l);
    var a = el("div", "display:flex;gap:6px;flex-wrap:wrap;align-items:center");
    var sw = el("button", btnCss(on ? "transparent" : "#16a34a", on ? C.bad : "#fff", on ? C.bad : "transparent") + ";padding:9px 16px;font-size:13px", on ? "Matikan gratis" : "Nyalakan gratis");
    sw.onclick = function () {
      if (!on && !confirm("Nyalakan uji coba gratis?\n\n• " + fmtDur(c.menit) + " per pendaftar\n• Kuota harian: " + (c.kuota_harian || "tanpa batas") + "\n• Maks per jam: " + (c.maks_per_jam || "tanpa batas") + "\n\nTombol “Coba Gratis” akan tampil di layar login." + (dirty ? "\n\n(Perubahan di formulir yang belum disimpan TIDAK ikut tersimpan.)" : ""))) return;
      aksi(sw, "admin_gratis_simpan", { p_cfg: { aktif: !on } }, on ? "Gratis dimatikan" : "Gratis dinyalakan");
    };
    a.appendChild(sw);
    if (D.stat.berjalan > 0) {
      var hs = el("button", btnCss("transparent", C.org, C.org), "Hentikan yang berjalan (" + D.stat.berjalan + ")");
      hs.title = "Menghentikan semua uji coba yang sedang berjalan; berlaku di perangkat paling lambat ±1 menit";
      hs.onclick = function () { if (confirm("Hentikan " + D.stat.berjalan + " uji coba yang sedang berjalan sekarang?")) aksi(hs, "admin_gratis_hentikan", {}, "Uji coba dihentikan"); };
      a.appendChild(hs);
    }
    var rf = ghost("Segarkan"); rf.onclick = function () { muat(true); }; a.appendChild(rf);
    b.appendChild(a);
    return b;
  }

  function kartuStat() {
    var s = D.stat, c = D.config, w = el("div", "display:flex;flex-direction:column;gap:8px");
    var g = el("div", "display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px");
    function k(lbl, val, sub, warna) {
      var x = el("div", "padding:9px 11px;border:1px solid " + C.line + ";border-radius:10px;background:" + C.bg);
      x.appendChild(el("div", "font-size:10.5px;color:" + C.mut + ";text-transform:uppercase;letter-spacing:.3px", lbl));
      x.appendChild(el("div", "font-size:20px;font-weight:800;color:" + (warna || C.txt), String(val)));
      if (sub) x.appendChild(el("div", "font-size:10.5px;color:" + C.mut, sub));
      g.appendChild(x);
    }
    k("Berjalan kini", s.berjalan, "", s.berjalan ? C.ok : null);
    k("Hari ini", s.hari_ini, c.kuota_harian ? "kuota " + s.hari_ini_umum + "/" + c.kuota_harian : "tanpa kuota harian");
    k("7 hari", s.tujuh_hari, "total " + s.total);
    k("Jadi pelanggan", s.total ? Math.round(100 * s.konversi / s.total) + "%" : "—", s.konversi + " dari " + s.total, s.konversi ? C.ok : null);
    k("Ditolak 24 jam", s.ditolak_24j, "", s.ditolak_24j ? C.warn : null);
    k("Perangkat ganda", s.fp_ganda, "klaim >1 per perangkat", s.fp_ganda ? C.org : null);
    w.appendChild(g);
    var jam = (s.per_jam || []).slice().reverse(), mx = Math.max(1, Math.max.apply(null, jam.concat([1])));
    var ch = el("div", "padding:9px 11px;border:1px solid " + C.line + ";border-radius:10px;background:" + C.bg);
    ch.appendChild(el("div", "font-size:10.5px;color:" + C.mut + ";margin-bottom:6px", "Klaim per jam — 24 jam terakhir (kiri = lama, kanan = sekarang)" + (c.maks_per_jam ? " · batas " + c.maks_per_jam + "/jam" : "")));
    var bars = el("div", "display:flex;align-items:flex-end;gap:2px;height:38px");
    jam.forEach(function (n, i) {
      var h = n ? Math.max(4, Math.round(36 * n / mx)) : 2, x = el("div", "flex:1;border-radius:2px 2px 0 0;height:" + h + "px;background:" + (n ? (c.maks_per_jam && n >= c.maks_per_jam ? C.warn : C.cy) : "#ffffff14"));
      x.title = n + " klaim · " + (23 - i) + " jam lalu"; bars.appendChild(x);
    });
    ch.appendChild(bars); w.appendChild(ch);
    var al = s.alasan_24j || {}, ks = Object.keys(al);
    if (ks.length) {
      var r = el("div", "font-size:11.5px;color:" + C.mut);
      r.appendChild(document.createTextNode("Penolakan 24 jam: "));
      ks.forEach(function (x) { r.appendChild(chip((TUTUP[x] ? x.replace("_", " ") : x) + " ×" + al[x], C.warn)); });
      w.appendChild(r);
    }
    return w;
  }

  function kartuSaran() {
    var list = saran(), warna = { ok: C.ok, warn: C.warn, info: C.cy };
    var b = card("#a78bfa66"); b.style.background = "#120f24";
    var h = el("div", "display:flex;align-items:center;gap:8px;flex-wrap:wrap");
    h.appendChild(el("b", "flex:1;color:#c4b5fd", "Penasihat cerdas"));
    var rec = ghost("Terapkan rekomendasi terbaik"); rec.title = PRESET.rekomendasi.tip;
    rec.onclick = function () { terapkan("rekomendasi"); }; h.appendChild(rec);
    b.appendChild(h);
    list.forEach(function (x) {
      var r = el("div", "display:flex;gap:8px;margin-top:7px;font-size:12px;line-height:1.5");
      r.appendChild(el("span", "flex:none;font-weight:800;color:" + warna[x.lv], x.lv === "ok" ? "✓" : x.lv === "warn" ? "!" : "i"));
      r.appendChild(el("span", "color:#dbe4f3", x.tx)); b.appendChild(r);
    });
    return b;
  }

  function seksi(key, judul, isi, n) {
    var b = card(); b.style.padding = "0";
    var h = el("button", "width:100%;display:flex;align-items:center;gap:8px;padding:11px 14px;background:transparent;border:0;color:" + C.txt + ";font:700 13px system-ui;cursor:pointer;text-align:left");
    h.appendChild(el("span", "flex:1", judul + (n != null ? " (" + n + ")" : "")));
    h.appendChild(el("span", "color:" + C.mut, openSec[key] ? "▲" : "▼"));
    h.onclick = function () { openSec[key] = !openSec[key]; redraw(); };
    b.appendChild(h);
    if (openSec[key]) { var body = el("div", "padding:0 14px 14px;display:flex;flex-direction:column;gap:10px;border-top:1px solid " + C.line); body.style.paddingTop = "12px"; isi(body); b.appendChild(body); }
    return b;
  }

  function fld(lbl, input, hint, basis) {
    var f = el("label", "display:flex;flex-direction:column;gap:3px;font-size:11px;color:" + C.mut + ";flex:" + (basis || "1 1 150px"));
    f.append(lbl, input); if (hint) f.appendChild(el("span", "font-size:10.5px;opacity:.85", hint)); return f;
  }
  function inp(type, val, ph) { var i = el("input", INP); i.type = type; i.value = val == null ? "" : val; if (ph) i.placeholder = ph; return i; }
  function bind(i, key) { i.oninput = function () { draft[key] = i.value; dirty = true; tandaiDirty(); }; return i; }
  function tandaiDirty() {
    if (saveBar) { saveBar.style.display = dirty ? "flex" : "none"; }
    if (durNote) durNote.textContent = "= " + fmtDur(+draft.menit || 0);
  }
  function terapkan(nama) {
    var v = Object.assign({}, PRESET[nama].v);
    if (v.buka_sampai === "+24") v.buka_sampai = isoToWib(new Date(Date.now() + 864e5).toISOString());
    draft = Object.assign({}, draft, v); dirty = true; openSec.set = true;
    K.T("Preset “" + PRESET[nama].lbl.replace("★ ", "") + "” dimasukkan ke formulir — tekan Simpan untuk menerapkan"); redraw();
  }

  function formPengaturan(b) {
    var pr = el("div", "display:flex;gap:6px;flex-wrap:wrap;align-items:center");
    pr.appendChild(el("span", "font-size:11px;color:" + C.mut, "Preset cepat:"));
    Object.keys(PRESET).forEach(function (k) { var x = ghost(PRESET[k].lbl); x.title = PRESET[k].tip; x.onclick = function () { terapkan(k); }; pr.appendChild(x); });
    b.appendChild(pr);

    var dm = inp("number", draft.menit, "menit"); dm.min = "1"; dm.max = "1440"; bind(dm, "menit");
    durNote = el("span", "font-size:11px;color:" + C.cy, "= " + fmtDur(+draft.menit || 0));
    var chips = el("div", "display:flex;gap:5px;flex-wrap:wrap;margin-top:2px");
    [5, 10, 15, 30, 60, 120].forEach(function (m) { var x = ghost(m + " mnt"); x.style.padding = "4px 9px"; x.onclick = function () { draft.menit = m; dm.value = m; dirty = true; tandaiDirty(); }; chips.appendChild(x); });
    var r1 = el("div", "display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end");
    var fd = fld("Lama gratis per pendaftar (menit, 1–1440)", dm, null, "1 1 220px"); fd.appendChild(chips);
    r1.append(fd); r1.appendChild(durNote); b.appendChild(r1);

    var kh = bind(inp("number", draft.kuota_harian, "kosong = tanpa batas"), "kuota_harian"), kt = bind(inp("number", draft.kuota_total, "kosong = tanpa batas"), "kuota_total");
    var mj = bind(inp("number", draft.maks_per_jam, "kosong = tanpa batas"), "maks_per_jam"), mf = bind(inp("number", draft.maks_per_fp, "1"), "maks_per_fp");
    mf.min = "1"; mf.max = "10";
    var r2 = el("div", "display:flex;gap:10px;flex-wrap:wrap");
    r2.append(fld("Kuota harian (pendaftar baru / hari WIB)", kh, "Habis = tombol hilang sampai besok", "1 1 190px"), fld("Kuota total (seumur hidup)", kt, "Habis = tertutup permanen", "1 1 190px"),
      fld("Maks pendaftar per jam (anti-lonjakan)", mj, "Menahan bot / tautan viral", "1 1 190px"), fld("Maks klaim per sidik perangkat", mf, "1 = satu perangkat satu kali", "1 1 190px"));
    b.appendChild(r2);

    var jm = bind(inp("number", draft.jam_mulai, "0–24"), "jam_mulai"), js = bind(inp("number", draft.jam_selesai, "0–24"), "jam_selesai");
    jm.min = js.min = "0"; jm.max = js.max = "24";
    var bs = bind(inp("datetime-local", draft.buka_sampai), "buka_sampai");
    var r3 = el("div", "display:flex;gap:10px;flex-wrap:wrap");
    r3.append(fld("Buka mulai jam (WIB)", jm, "kosong = sepanjang hari", "1 1 130px"), fld("Tutup jam (WIB)", js, "20 → 6 berarti malam hari", "1 1 130px"), fld("Tutup otomatis pada (WIB)", bs, "kosong = tidak ada tanggal tutup", "1 1 230px"));
    b.appendChild(r3);

    var ph = el("textarea", INP + ";min-height:54px;resize:vertical"); ph.maxLength = 240; ph.value = draft.pesan_habis || ""; ph.placeholder = "mis. Terima kasih sudah mencoba! Untuk akses penuh hubungi admin via WhatsApp 08xx…";
    ph.oninput = function () { draft.pesan_habis = ph.value; dirty = true; tandaiDirty(); };
    b.appendChild(fld("Pesan saat waktu habis (tampil di layar login)", ph, null, "1 1 100%"));

    saveBar = el("div", "display:" + (dirty ? "flex" : "none") + ";gap:8px;align-items:center;flex-wrap:wrap;padding:9px 11px;border-radius:10px;background:#1b1608;border:1px solid #fbbf2455");
    saveBar.appendChild(el("span", "flex:1 1 160px;font-size:12px;color:#fde68a", "Ada perubahan yang belum disimpan."));
    var sv = el("button", btnCss("#16a34a", "#fff"), "Simpan pengaturan");
    sv.onclick = function () {
      var bd = bodyDraft(), jmv = bd.jam_mulai, jsv = bd.jam_selesai;
      if ((jmv == null) !== (jsv == null)) { K.T("Isi jam mulai DAN jam tutup, atau kosongkan keduanya", true); return; }
      aksi(sv, "admin_gratis_simpan", { p_cfg: bd }, "Pengaturan gratis disimpan", function () { dirty = false; });
    };
    var bt = ghost("Batalkan"); bt.onclick = function () { draft = fromCfg(D.config); dirty = false; redraw(); };
    saveBar.append(sv, bt); b.appendChild(saveBar);
    b.appendChild(el("div", "font-size:11px;color:" + C.mut + ";line-height:1.5", "Perubahan menit hanya berlaku untuk pendaftar BARU; yang sedang berjalan tetap memakai menit saat ia mulai. Saklar hidup/mati di kartu atas tersimpan langsung."));
  }

  function undangan(b) {
    b.appendChild(el("div", "font-size:11.5px;color:" + C.mut + ";line-height:1.5", "Buat tautan pribadi berisi menit khusus. Berlaku walau gratis umum MATI atau kuota habis, sekali pakai, tidak terkena batas per jam. Bila Gmail diisi, jatah lama Gmail itu dihapus dan kunci akunnya dibuka."));
    var em = inp("text", invForm.email, "kosong = siapa saja yang membuka tautan"), mn = inp("number", invForm.menit, "menit"), hr = inp("number", invForm.hari, "hari"), ct = inp("text", invForm.catatan, "mis. tamu dinas");
    em.oninput = function () { invForm.email = em.value; }; mn.oninput = function () { invForm.menit = mn.value; }; hr.oninput = function () { invForm.hari = hr.value; }; ct.oninput = function () { invForm.catatan = ct.value; };
    mn.min = "1"; mn.max = "1440"; hr.min = "0"; hr.max = "365";
    var r = el("div", "display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end");
    r.append(fld("Gmail (opsional)", em, null, "2 1 220px"), fld("Menit", mn, null, "1 1 80px"), fld("Berlaku (hari, 0 = tanpa batas)", hr, null, "1 1 110px"), fld("Catatan", ct, null, "1 1 150px"));
    var go = el("button", btnCss("#0e7490", "#fff"), "Buat undangan");
    go.onclick = function () {
      var mnt = Math.max(1, Math.min(1440, Math.round(+invForm.menit) || 0));
      if (!mnt) { K.T("Isi menit 1–1440", true); return; }
      aksi(go, "admin_gratis_undang", { p_email: invForm.email.trim() || null, p_menit: mnt, p_hari: Math.max(0, Math.round(+invForm.hari) || 0), p_catatan: invForm.catatan.trim() || null }, "Undangan dibuat",
        function (d) { lastInv = { kode: d.kode, menit: mnt, email: invForm.email.trim() }; invForm.email = ""; invForm.catatan = ""; });
    };
    r.appendChild(go); b.appendChild(r);
    if (lastInv) {
      var bx = card(C.ok + "88"); bx.style.background = "#052e1c";
      var lk = linkUndangan(lastInv.kode);
      bx.appendChild(el("div", "font-weight:700;color:#6ee7b7", "✓ Undangan siap — " + fmtDur(lastInv.menit) + (lastInv.email ? " untuk " + lastInv.email : " untuk siapa saja") ));
      var li = el("input", INP + ";margin-top:6px;font-family:ui-monospace,monospace"); li.readOnly = true; li.value = lk; li.onclick = function () { li.select(); };
      bx.appendChild(li);
      var ac = el("div", "display:flex;gap:6px;flex-wrap:wrap;margin-top:7px");
      var cp = el("button", btnCss("#16a34a", "#fff"), "Salin tautan"); cp.onclick = function () { salin(lk, cp); };
      var wa = el("a", btnCss("transparent", "#4ade80", "#4ade80") + ";text-decoration:none", "Kirim via WhatsApp");
      wa.href = "https://wa.me/?text=" + encodeURIComponent("Halo, ini undangan uji coba gratis PETAQU (" + fmtDur(lastInv.menit) + "). Buka tautan ini lalu pilih akun Gmail Anda: " + lk); wa.target = "_blank"; wa.rel = "noopener";
      var tp = ghost("Tutup"); tp.onclick = function () { lastInv = null; redraw(); };
      ac.append(cp, wa, tp); bx.appendChild(ac); b.appendChild(bx);
    }
    D.undangan.forEach(function (u) {
      var pakai = !!u.dipakai_at, kad = u.berlaku_sampai && Date.parse(u.berlaku_sampai) < Date.now() && !pakai;
      var row = el("div", "display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 10px;border:1px solid " + C.line + ";border-radius:9px;background:#0f1521" + (pakai || kad ? ";opacity:.7" : ""));
      var t = el("div", "flex:1 1 200px;min-width:0;overflow-wrap:anywhere");
      t.appendChild(el("div", "font-weight:700", (u.email || "Siapa saja (tautan)") + " · " + fmtDur(u.menit)));
      t.appendChild(el("div", "font-size:11px;color:" + C.mut, "kode " + u.kode + " · dibuat " + rel(u.dibuat) + (u.catatan ? " · " + u.catatan : "") + (u.berlaku_sampai && !pakai ? " · berlaku s/d " + new Date(u.berlaku_sampai).toLocaleDateString("id-ID") : "")));
      row.appendChild(t);
      row.appendChild(chip(pakai ? "Dipakai " + rel(u.dipakai_at) + (u.dipakai_oleh ? " · " + u.dipakai_oleh : "") : kad ? "Kedaluwarsa" : "Berlaku", pakai ? C.mut : kad ? C.bad : C.ok));
      if (!pakai && !kad) {
        var cp2 = ghost("Salin tautan"); cp2.onclick = function () { salin(linkUndangan(u.kode), cp2); };
        row.appendChild(cp2);
      }
      if (!pakai) { var cb = el("button", btnCss("transparent", C.bad, C.bad), "Cabut"); cb.onclick = function () { if (confirm("Cabut undangan " + u.kode + "?")) aksi(cb, "admin_gratis_cabut_undangan", { p_kode: u.kode }, "Undangan dicabut"); }; row.appendChild(cb); }
      b.appendChild(row);
    });
    if (!D.undangan.length) b.appendChild(el("div", "color:" + C.mut + ";font-size:12px", "Belum ada undangan."));
  }

  function klaim(b) {
    b.appendChild(el("div", "font-size:11.5px;color:" + C.mut + ";line-height:1.5", "40 klaim terakhir. “Jatah ulang” menghapus klaim itu dan membuka kunci akunnya agar bisa mencoba lagi. “Blokir” menghentikan uji cobanya dan menolak klaim berikutnya."));
    D.klaim.forEach(function (k) {
      var jalan = !k.dihentikan && k.sisa > 0;
      var row = el("div", "display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 10px;border:1px solid " + C.line + ";border-radius:9px;background:#0f1521");
      var t = el("div", "flex:1 1 220px;min-width:0;overflow-wrap:anywhere");
      t.appendChild(el("div", "font-weight:700", k.email));
      var m = el("div", "font-size:11px;color:" + C.mut), meta = "mulai " + rel(k.mulai) + " · " + fmtDur(k.menit) + " · perangkat " + k.dev;
      m.appendChild(document.createTextNode(meta)); t.appendChild(m);
      var cw = el("div", ""); 
      cw.appendChild(jalan ? chip("Berjalan · sisa " + fmtSisa(k.sisa), C.ok) : k.dihentikan ? chip("Dihentikan", C.org) : chip("Habis", C.mut));
      if (k.sumber === "undangan") cw.appendChild(chip("Undangan", C.cy));
      if (k.konversi) cw.appendChild(chip("Jadi pelanggan", C.ok));
      if (k.fp_ganda > 0) cw.appendChild(chip("Perangkat ganda ×" + (k.fp_ganda + 1), C.org));
      if (k.blok) cw.appendChild(chip("Terblokir", C.bad));
      t.appendChild(cw); row.appendChild(t);
      var ac = el("div", "display:flex;gap:6px;flex-wrap:wrap");
      if (jalan) { var hs = el("button", btnCss("transparent", C.org, C.org), "Hentikan"); hs.onclick = function () { if (confirm("Hentikan uji coba " + k.email + " sekarang?")) aksi(hs, "admin_gratis_hentikan", { p_klaim: k.id }, "Dihentikan: " + k.email); }; ac.appendChild(hs); }
      var rs = ghost("Jatah ulang"); rs.onclick = function () { if (confirm("Beri jatah ulang untuk " + k.email + "?\n\nKlaim dihapus dan akun uji cobanya dibuka kuncinya, sehingga ia bisa mencoba lagi (bila gratis sedang dibuka).")) aksi(rs, "admin_gratis_reset", { p_klaim: k.id }, "Jatah ulang diberikan: " + k.email); }; ac.appendChild(rs);
      if (!k.blok) {
        var be = el("button", btnCss("transparent", C.bad, C.bad), "Blokir email"); be.onclick = function () { if (confirm("Blokir " + k.email + " dari uji coba gratis?")) aksi(be, "admin_gratis_blokir", { p_jenis: "email", p_klaim: k.id, p_alasan: "diblokir admin" }, "Email diblokir"); };
        var bp = el("button", btnCss("transparent", C.bad, C.bad), "Blokir perangkat"); bp.onclick = function () { if (confirm("Blokir sidik perangkat " + k.fp + " (semua Gmail dari perangkat ini)?")) aksi(bp, "admin_gratis_blokir", { p_jenis: "fp", p_klaim: k.id, p_alasan: "diblokir admin" }, "Perangkat diblokir"); };
        ac.append(be, bp);
      }
      row.appendChild(ac); b.appendChild(row);
    });
    if (!D.klaim.length) b.appendChild(el("div", "color:" + C.mut + ";font-size:12px", "Belum ada yang memakai uji coba gratis."));
  }

  function blokir(b) {
    var nv = inp("text", blokForm.nilai, "Gmail yang diblokir"), al = inp("text", blokForm.alasan, "alasan (opsional)");
    nv.oninput = function () { blokForm.nilai = nv.value; }; al.oninput = function () { blokForm.alasan = al.value; };
    var r = el("div", "display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end");
    var go = el("button", btnCss("transparent", C.bad, C.bad), "Blokir email");
    go.onclick = function () { if (!blokForm.nilai.trim()) { K.T("Isi Gmail yang akan diblokir", true); return; } aksi(go, "admin_gratis_blokir", { p_jenis: "email", p_nilai: blokForm.nilai.trim(), p_alasan: blokForm.alasan.trim() || null }, "Email diblokir", function () { blokForm.nilai = ""; blokForm.alasan = ""; }); };
    r.append(fld("Gmail", nv, null, "2 1 220px"), fld("Alasan", al, null, "2 1 180px"), go); b.appendChild(r);
    D.blokir.forEach(function (x) {
      var row = el("div", "display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 10px;border:1px solid " + C.line + ";border-radius:9px;background:#0f1521");
      var t = el("div", "flex:1 1 200px;min-width:0;overflow-wrap:anywhere");
      t.appendChild(el("div", "font-weight:700", (x.jenis === "fp" ? "Perangkat " : x.jenis === "device" ? "ID perangkat " : "Email ") + (x.jenis === "email" ? x.nilai : String(x.nilai).slice(0, 12) + "…")));
      t.appendChild(el("div", "font-size:11px;color:" + C.mut, rel(x.dibuat) + (x.alasan ? " · " + x.alasan : ""))); row.appendChild(t);
      var ub = ghost("Buka blokir"); ub.onclick = function () { aksi(ub, "admin_gratis_buka_blokir", { p_id: x.id }, "Blokir dibuka"); }; row.appendChild(ub);
      b.appendChild(row);
    });
    if (!D.blokir.length) b.appendChild(el("div", "color:" + C.mut + ";font-size:12px", "Tidak ada yang diblokir."));
  }

  function errCard() {
    var c = el("div", "padding:14px;border:1px solid #f8717166;border-radius:10px;background:#2a0f14;line-height:1.55");
    var nosql = err && err.code === "nosql";
    c.appendChild(el("b", "color:#fca5a5", nosql ? "Kontrol gratis belum dipasang di Supabase" : err && err.code === "denied" ? "Hanya admin yang boleh membuka kontrol gratis" : "Gagal memuat kontrol gratis"));
    c.appendChild(el("div", "color:#fecaca;margin-top:4px", nosql ? "Jalankan supabase-gratis-kontrol.sql di Supabase > SQL Editor (paling akhir, setelah file SQL lainnya), lalu tekan Segarkan." : "Tekan Segarkan; bila berulang, jalankan “Cek koneksi”."));
    if (err && err.msg) c.appendChild(el("div", "margin-top:6px;font:11px ui-monospace,monospace;color:#fda4af;overflow-wrap:anywhere", "Detail: " + err.msg));
    var b = ghost("Segarkan"); b.style.marginTop = "10px"; b.onclick = function () { muat(true); }; c.appendChild(b);
    return c;
  }

  function render(list) {
    saveBar = null; durNote = null;
    if (err && !D) { list.appendChild(errCard()); return; }
    if (!D) { list.appendChild(el("div", "color:" + C.mut + ";padding:18px 4px;text-align:center", "Memuat kontrol gratis…")); if (!loading) muat(); return; }
    list.appendChild(kartuUtama());
    list.appendChild(kartuStat());
    list.appendChild(kartuSaran());
    list.appendChild(seksi("set", "Pengaturan gratis", formPengaturan));
    list.appendChild(seksi("inv", "Undangan khusus (tautan pribadi)", undangan, D.undangan.length));
    list.appendChild(seksi("klaim", "Klaim terbaru", klaim, D.klaim.length));
    list.appendChild(seksi("blok", "Daftar blokir", blokir, D.blokir.length));
  }
  function tag() { return !D ? "" : !D.config.aktif ? " · OFF" : D.tersedia && D.tersedia.ok ? " · ON" : " · TUTUP"; }

  window.__pqGratis = { render: render, muat: muat, tag: tag };
})();
