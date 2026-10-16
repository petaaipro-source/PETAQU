/* PETAQU — Bayar langganan lewat QRIS DINAMIS (nominal terisi otomatis) → akun aktif otomatis tanpa admin.
   Alur: pilih lama langganan + isi email → server membuat QRIS dengan nominal pas → scan di m-banking/e-wallet apa pun →
   begitu pembayaran masuk, server (webhook Midtrans) mengaktifkan akun & masa aktif; layar ini otomatis berubah "Aktif".
   Harga SELALU dihitung di server (tabel harga_langganan di supabase-qris-otomatis.sql); angka di bawah hanya cadangan tampilan.
   Butuh: supabase-qris-otomatis.sql + Edge Function qris-buat / qris-cek / qris-webhook (lihat PANDUAN-QRIS-OTOMATIS.md). */
(function () {
  "use strict";
  if (window.PQBayar) return;

  /* cadangan tampilan bila daftar harga server belum terbaca (harus sama dengan tabel harga_langganan) */
  var HARGA0 = [
    { bulan: 1, label: "1 bulan", normal: 99900 }, { bulan: 3, label: "3 bulan", normal: 269900 }, { bulan: 6, label: "6 bulan", normal: 499900 },
    { bulan: 12, label: "1 tahun", normal: 899900 }, { bulan: 24, label: "2 tahun", normal: 1599900 }, { bulan: 36, label: "3 tahun", normal: 2199900 }
  ];
  var SK = "pq_bayar_order", POLL_MS = 3000;
  var $ = function (id) { return document.getElementById(id); };
  var cfg = function () { return window.PETAQU_CFG; };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function rp(n) { return "Rp " + Math.round(n).toLocaleString("id-ID"); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } }
  function fmtTgl(s) { var d = new Date(String(s).slice(0, 10) + "T00:00:00"); return isNaN(d) ? String(s) : d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }); }
  function emailOk(e) { return /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/.test(e) && e.length <= 120; }

  var st = { email: "", bulan: 12, harga: HARGA0.map(function (h) { return { bulan: h.bulan, label: h.label, normal: h.normal, diskon: 0, harga: h.normal }; }), tiket: null, order: null, tm: 0, tick: 0, n: 0, busy: false, final: "", hargaTm: 0 };

  /* ---------- panggilan ke server ---------- */
  function restHead() { var c = cfg(); return { apikey: c.anon, "Content-Type": "application/json" }; }
  async function rpcPub(fn, body) {
    var c = cfg(), r = await fetch(c.url + "/rest/v1/rpc/" + fn, { method: "POST", headers: restHead(), body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error(fn + " " + r.status);
    return r.json();
  }
  async function fn(nama, body) {
    var c = cfg(), r = await fetch(c.url + "/functions/v1/" + nama, { method: "POST", headers: restHead(), body: JSON.stringify(body) });
    var j = {}; try { j = await r.json(); } catch (e) { /* kosong */ }
    j._http = r.status; return j;
  }

  /* ---------- tampilan ---------- */
  var css = document.createElement("style");
  css.textContent =
    "#pqBy{position:fixed;inset:0;z-index:200001;background:rgba(3,6,12,.86);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:14px;-webkit-overflow-scrolling:touch}" +
    "#pqBy.show{display:flex}#pqBy .bx{position:relative;width:min(100%,430px);margin:auto;background:#0d1424;border:1px solid #243049;border-radius:16px;padding:18px 16px 16px;color:#e5e9f5;font:14px/1.45 system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.55)}" +
    "#pqBy h3{margin:0 0 2px;font:700 17px system-ui,sans-serif;color:#fff}#pqBy .sub{margin:0 0 12px;color:#93a1bd;font-size:12.5px}" +
    "#pqBy .x{position:absolute;top:8px;right:10px;background:none;border:0;color:#93a1bd;font-size:24px;line-height:1;cursor:pointer;padding:4px 8px}" +
    "#pqBy label{display:block;font:600 11.5px system-ui,sans-serif;color:#9fb0cf;margin:0 0 4px}" +
    "#pqBy input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid #2c3a57;background:#0a1020;color:#fff;font:15px system-ui,sans-serif;outline:none}#pqBy input:focus{border-color:#22d3ee}" +
    "#pqBy .pl{display:grid;gap:7px;margin:12px 0 10px}" +
    "#pqBy .p{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;width:100%;padding:11px 12px;border-radius:12px;border:1px solid #2c3a57;background:#0a1020;color:#e5e9f5;cursor:pointer;font:inherit}" +
    "#pqBy .p.on{border-color:#22d3ee;background:#0c2230;box-shadow:0 0 0 1px #22d3ee inset}" +
    "#pqBy .p b{font-size:14.5px}#pqBy .p small{display:block;color:#8fa0bf;font-size:11.5px;margin-top:1px}" +
    "#pqBy .p .r{text-align:right;white-space:nowrap}#pqBy .p .r b{display:block;font-size:15px}#pqBy .p s{color:#6f7f9f;font-size:11.5px}" +
    "#pqBy .p em{font:700 10px system-ui,sans-serif;font-style:normal;background:#22d3ee;color:#04121a;border-radius:999px;padding:1px 7px;margin-left:6px;vertical-align:1px}" +
    "#pqBy .p em.h{background:#34d399}" +
    "#pqBy .go{width:100%;margin-top:6px;padding:13px;border-radius:12px;border:0;background:#22d3ee;color:#04121a;font:800 15px system-ui,sans-serif;cursor:pointer}#pqBy .go:disabled{opacity:.5;cursor:default}" +
    "#pqBy .sec{width:100%;margin-top:8px;padding:11px;border-radius:12px;border:1px solid #3b4660;background:transparent;color:#cdd7ee;font:600 13.5px system-ui,sans-serif;cursor:pointer}" +
    "#pqBy .msg{min-height:18px;margin:8px 0 0;font-size:12.5px;color:#fca5a5}" +
    "#pqBy .hint{color:#8fa0bf;font-size:12px;margin-top:9px}" +
    "#pqBy .qr{background:#fff;border-radius:14px;padding:12px;margin:6px auto 10px;width:max-content;max-width:100%;text-align:center}#pqBy .qr canvas,#pqBy .qr img{display:block;width:min(70vw,270px);height:auto;image-rendering:pixelated}" +
    "#pqBy .qr .n{color:#111;font:800 11px system-ui,sans-serif;letter-spacing:.4px;margin-top:6px}" +
    "#pqBy .amt{text-align:center;margin:2px 0 4px}#pqBy .amt b{font:800 26px system-ui,sans-serif;color:#fff}#pqBy .amt small{display:block;color:#8fa0bf;font-size:12px}" +
    "#pqBy .cd{text-align:center;font:700 13px system-ui,sans-serif;color:#fbbf24;margin:4px 0 2px}" +
    "#pqBy .live{display:flex;align-items:center;justify-content:center;gap:8px;color:#9fb0cf;font-size:12.5px;margin:6px 0}" +
    "#pqBy .dot{width:9px;height:9px;border-radius:50%;background:#22d3ee;animation:pqBp 1.1s infinite}@keyframes pqBp{50%{opacity:.25}}" +
    "#pqBy .ok{text-align:center;padding:6px 0}#pqBy .ok .ic{width:64px;height:64px;margin:0 auto 10px;border-radius:50%;background:#34d39922;border:1px solid #34d399aa;display:flex;align-items:center;justify-content:center;font-size:28px;color:#34d399}" +
    "#pqBy .ok .ic.w{background:#fbbf2422;border-color:#fbbf24aa;color:#fbbf24}#pqBy .ok .ic.e{background:#f8717122;border-color:#f87171aa;color:#f87171}" +
    "#pqBy .ok h3{font-size:19px;margin-bottom:6px}#pqBy .ok p{margin:4px 0;color:#c6d1e8}" +
    "#pqBy .row{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #1d2840;font-size:13px;color:#aebbd6}#pqBy .row b{color:#fff;text-align:right}";
  document.head.appendChild(css);

  var ov, box;
  function build() {
    if (ov) return;
    ov = document.createElement("div"); ov.id = "pqBy";
    ov.innerHTML = '<div class="bx" id="pqByBox" role="dialog" aria-modal="true" aria-label="Bayar langganan"></div>';
    document.body.appendChild(ov); box = $("pqByBox");
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) tutup(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && ov.classList.contains("show")) tutup(); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && st.order && !st.final) cekStatus(true); });
  }
  function tutup() { stopPoll(); if (ov) ov.classList.remove("show"); }
  function head(judul, sub) { return '<button class="x" type="button" id="pqByX" aria-label="Tutup">×</button><h3>' + judul + '</h3><p class="sub">' + sub + "</p>"; }
  function pasangX() { var x = $("pqByX"); if (x) x.onclick = tutup; }

  /* ---------- 1) pilih paket ---------- */
  function renderPilih(pesanErr) {
    build(); stopPoll(); st.order = null; st.final = "";
    var base = st.harga[0] ? st.harga[0].harga / st.harga[0].bulan : 0, adaDiskon = st.harga.some(function (h) { return h.diskon > 0; });
    var pl = st.harga.map(function (h) {
      var perBln = h.harga / h.bulan, hemat = base && h.bulan > 1 ? Math.round((1 - perBln / base) * 100) : 0;
      return '<button type="button" class="p' + (h.bulan === st.bulan ? " on" : "") + '" data-m="' + h.bulan + '" role="radio" aria-checked="' + (h.bulan === st.bulan) + '"><span><b>' + esc(h.label) +
        (h.bulan === 12 ? "<em>Disarankan</em>" : "") + (hemat >= 5 ? '<em class="h">Hemat ' + hemat + "%</em>" : "") + "</b><small>" + rp(perBln) + " / bulan</small></span>" +
        '<span class="r"><b>' + rp(h.harga) + "</b>" + (h.diskon > 0 ? "<s>" + rp(h.normal) + "</s>" : "") + "</span></button>";
    }).join("");
    var T = st.tiket, tk = T ? '<button type="button" class="p' + (st.bulan === 0 ? " on" : "") + '" data-m="0" role="radio" aria-checked="' + (st.bulan === 0) + '"><span><b>Coba ' + T.menit + ' menit<em>Coba dulu</em></b><small>Sekali pakai · wajib Gmail · tanpa langganan</small></span><span class="r"><b>' + rp(T.harga) + "</b></span></button>" : "";
    pl = tk + pl;
    var pilih = st.bulan === 0 && T ? { harga: T.harga, tiket: 1 } : (st.harga.filter(function (h) { return h.bulan === st.bulan; })[0] || st.harga[0]);
    box.innerHTML = head('<i class="fa-solid fa-qrcode"></i> Bayar Langganan', "Bayar pakai QRIS — nominal terisi otomatis, akun aktif sendiri begitu pembayaran masuk.") +
      '<label for="pqByEm">'+(pilih.tiket?"Gmail kamu":"Email akun PETAQU (yang akan diaktifkan)")+'</label><input id="pqByEm" type="email" inputmode="email" autocomplete="email" placeholder="nama@email.com" value="' + esc(st.email) + '">' +
      '<div class="hint" id="pqByDis">' + (pilih.tiket ? "Isi <b>Gmail</b> yang akan kamu pilih saat masuk lewat Google. Tiket hanya berlaku untuk Gmail ini, sekali pakai." : adaDiskon ? "🎓 Diskon pelajar/mahasiswa aktif untuk email ini." : "Email berakhiran <b>.ac.id</b> / <b>.sch.id</b> otomatis dapat diskon pelajar/mahasiswa.") + "</div>" +
      '<div class="pl" role="radiogroup" aria-label="Lama langganan">' + pl + "</div>" +
      '<button type="button" class="go" id="pqByGo">' + (pilih.tiket ? "Bayar " + rp(pilih.harga) + " — coba " + T.menit + " menit" : "Bayar " + rp(pilih.harga) + " dengan QRIS") + "</button>" +
      '<div class="msg" id="pqByMsg">' + esc(pesanErr || "") + "</div>" +
      '<div class="hint">Belum punya akun? Daftar dulu atau bayar sekarang — akun dengan email ini langsung aktif begitu Anda mendaftar. Perpanjangan: sisa masa aktif <b>tidak hangus</b>, ditambah di belakangnya.</div>';
    pasangX();
    $("pqBy").classList.add("show");
    Array.prototype.forEach.call(box.querySelectorAll(".p"), function (b) { b.onclick = function () { st.bulan = +b.getAttribute("data-m"); st.email = $("pqByEm").value.trim(); renderPilih(); }; });
    $("pqByEm").oninput = function () { st.email = this.value.trim(); clearTimeout(st.hargaTm); st.hargaTm = setTimeout(function () { muatHarga(true); }, 500); };
    $("pqByGo").onclick = mulaiBayar;
  }

  async function muatHarga(rerender) {
    if (!cfg()) return;
    try {
      var em = emailOk(st.email) ? st.email.toLowerCase() : null;
      try { var ti = await rpcPub("tiket_info", {}); st.tiket = ti && ti.aktif ? ti : null; } catch (e) { st.tiket = null; }
      if (st.bulan === 0 && !st.tiket) st.bulan = 12;
      var rows = await rpcPub("qris_harga", { p_email: em });
      if (rows && rows.length) {
        var beda = JSON.stringify(rows) !== JSON.stringify(st.harga);
        st.harga = rows.map(function (r) { return { bulan: r.bulan, label: r.label, normal: +r.normal, diskon: r.diskon, harga: +r.harga }; });
        if (st.bulan !== 0 && !st.harga.some(function (h) { return h.bulan === st.bulan; })) st.bulan = st.harga[0].bulan;
        if (rerender && beda && !st.order && $("pqByEm")) { var f = document.activeElement === $("pqByEm"), pos = f ? $("pqByEm").selectionStart : 0; renderPilih(); if (f) { var e = $("pqByEm"); e.focus(); try { e.setSelectionRange(pos, pos); } catch (x) { /* abaikan */ } } }
      }
    } catch (e) { /* pakai harga cadangan */ }
  }

  /* ---------- 2) buat QR & tunggu ---------- */
  async function mulaiBayar() {
    if (st.busy) return;
    var em = $("pqByEm").value.trim().toLowerCase(); st.email = em;
    if (!emailOk(em)) return msg("Isi email yang benar dulu.");
    if (st.bulan === 0 && !/@(gmail|googlemail)\.com$/i.test(em)) return msg("Tiket coba hanya untuk akun Gmail (@gmail.com).");
    if (!cfg()) return msg("Konfigurasi server belum diisi.");
    st.busy = true; var g = $("pqByGo"); g.disabled = true; g.textContent = "Membuat QRIS…"; msg("");
    try {
      var j = await fn("qris-buat", { email: em, bulan: st.bulan });
      if (!j.ok) {
        var t = { email_tidak_valid: "Format email tidak valid.", paket_tidak_valid: "Paket tidak tersedia, pilih paket lain.", terlalu_banyak: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.", tiket_nonaktif: "Tiket coba sedang tidak dijual.", wajib_gmail: "Tiket coba hanya untuk akun Gmail (@gmail.com).", gateway: "Layanan pembayaran sedang bermasalah. Coba lagi beberapa saat.", origin: "Alamat situs tidak diizinkan.", server: "Server sedang bermasalah, coba lagi." }[j.reason];
        throw new Error(t || (j._http === 404 ? "Layanan pembayaran belum dipasang di server (lihat PANDUAN-QRIS-OTOMATIS.md)." : "Gagal membuat QRIS (" + (j._http || "jaringan") + ")."));
      }
      st.order = { order_id: j.order_id, email: em, bulan: j.bulan || st.bulan, jumlah: j.jumlah, qr_string: j.qr_string, qr_url: j.qr_url, kedaluwarsa: j.kedaluwarsa, diskon: j.diskon || 0 };
      lsSet(SK, st.order); renderQR(); mulaiPoll();
    } catch (e) {
      st.busy = false; renderPilih(e.message && e.message.indexOf("Failed to fetch") < 0 ? e.message : "Tidak ada koneksi / server tidak terjangkau."); return;
    }
    st.busy = false;
  }
  function msg(t) { var m = $("pqByMsg"); if (m) m.textContent = t || ""; }

  function gambarQR(canvas, text, px) {
    var qr = window.qrcode(0, "M"); qr.addData(text); qr.make();
    var n = qr.getModuleCount(), q = 2, tot = n + q * 2, sc = Math.max(2, Math.floor(px / tot)), size = tot * sc;
    canvas.width = canvas.height = size; var c = canvas.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, size, size); c.fillStyle = "#000";
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (qr.isDark(r, k)) c.fillRect((k + q) * sc, (r + q) * sc, sc, sc);
  }
  function renderQR() {
    var o = st.order, wrap;
    box.innerHTML = head('<i class="fa-solid fa-qrcode"></i> Scan untuk membayar', esc(o.email) + " · " + (o.bulan === 0 ? "Tiket coba " + (st.tiket ? st.tiket.menit : 15) + " menit" : o.bulan % 12 === 0 ? o.bulan / 12 + " tahun" : o.bulan + " bulan")) +
      '<div class="amt"><b>' + rp(o.jumlah) + '</b><small>Nominal sudah terisi otomatis di QR — jangan diubah</small></div>' +
      '<div class="qr" id="pqByQr"></div>' +
      '<div class="cd" id="pqByCd"></div>' +
      '<div class="live"><span class="dot"></span><span id="pqByLive">Menunggu pembayaran… akun aktif otomatis</span></div>' +
      '<button type="button" class="sec" id="pqByDl"><i class="fa-solid fa-download"></i> Simpan gambar QR (untuk scan dari galeri)</button>' +
      '<button type="button" class="sec" id="pqByChk">Saya sudah bayar — cek sekarang</button>' +
      '<button type="button" class="sec" id="pqByBack" style="border-color:transparent;color:#8fa0bf">← Ganti paket / email</button>' +
      '<div class="hint">Buka GoPay, OVO, DANA, ShopeePay, LinkAja atau m-banking apa pun → Scan / Bayar → pilih QR dari galeri atau arahkan kamera ke layar ini. Jangan tutup halaman ini; bila tertutup, buka lagi menu bayar — status akan dilanjutkan.</div>';
    pasangX(); wrap = $("pqByQr");
    var ok = false;
    if (o.qr_string && window.qrcode) { try { var cv = document.createElement("canvas"); wrap.appendChild(cv); gambarQR(cv, o.qr_string, 600); ok = true; wrap.__cv = cv; } catch (e) { wrap.innerHTML = ""; } }
    if (!ok && o.qr_url) wrap.innerHTML = '<img alt="QRIS" src="' + esc(o.qr_url) + '">';
    wrap.insertAdjacentHTML("beforeend", '<div class="n">QRIS · PETAQU</div>');
    $("pqBy").classList.add("show");
    $("pqByDl").onclick = function () {
      var cv = wrap.__cv, a = document.createElement("a"); a.download = "QRIS-PETAQU-" + o.jumlah + ".png";
      if (cv) a.href = cv.toDataURL("image/png"); else if (o.qr_url) { a.href = o.qr_url; a.target = "_blank"; a.rel = "noopener"; } else return;
      document.body.appendChild(a); a.click(); a.remove();
    };
    $("pqByChk").onclick = function () { cekStatus(true, true); };
    $("pqByBack").onclick = function () { lsSet(SK, null); renderPilih(); };
    hitungMundur();
  }

  /* ---------- polling status ---------- */
  function stopPoll() { clearInterval(st.tm); clearInterval(st.tick); st.tm = st.tick = 0; }
  function mulaiPoll() {
    stopPoll(); st.n = 0; st.tm = setInterval(function () { cekStatus(false); }, POLL_MS);
    st.tick = setInterval(hitungMundur, 1000);
  }
  function hitungMundur() {
    var e = $("pqByCd"), o = st.order; if (!e || !o || !o.kedaluwarsa) return;
    var s = Math.round((new Date(o.kedaluwarsa) - Date.now()) / 1000);
    if (s <= 0) { e.textContent = "QR kedaluwarsa"; return; }
    e.textContent = "Berlaku " + Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2) + " lagi";
  }
  async function cekStatus(paksa, manual) {
    var o = st.order; if (!o || st.final || st.chk) return; st.chk = true;
    var live = $("pqByLive");
    try {
      st.n++;
      var s;
      if (paksa || st.n % 3 === 0) { s = await fn("qris-cek", { order_id: o.order_id }); if (!s || !s.status) s = await rpcPub("qris_status", { p_order_id: o.order_id }); }   // tiap ±9 dtk ikut tanya Midtrans langsung (cadangan webhook)
      else s = await rpcPub("qris_status", { p_order_id: o.order_id });
      if (manual && live && s.status === "pending") live.textContent = "Belum terdeteksi. Tunggu beberapa detik — dicek otomatis.";
      if (s.status === "paid") return selesai("paid", s);
      if (s.status === "ditahan") return selesai("ditahan", s);
      if (s.status === "expired" || s.status === "failed" || s.status === "tidak_ada") return selesai(s.status, s);
    } catch (e) { if (live) live.textContent = "Koneksi terganggu — mencoba lagi…"; }
    finally { st.chk = false; }
  }

  /* ---------- 3) hasil ---------- */
  function selesai(jenis, s) {
    stopPoll(); st.final = jenis; var o = st.order || {}, h;
    if (jenis === "paid" && s.diterapkan && (s.bulan === 0 || o.bulan === 0)) {
      lsSet(SK, null); lsSet("pq_tiket", { kode: s.kode || "", email: o.email, menit: s.menit || 15 });
      h = '<div class="ok"><div class="ic"><i class="fa-solid fa-ticket"></i></div><h3>Pembayaran diterima — tiket siap!</h3><p>Waktu coba <b>' + (s.menit || 15) + ' menit</b> baru mulai berjalan setelah kamu menekan tombol di bawah.</p></div>' +
        '<div class="row"><span>Gmail tiket</span><b>' + esc(o.email) + '</b></div><div class="row"><span>Dibayar</span><b>' + rp(s.jumlah || o.jumlah) + '</b></div>' + (s.kode ? '<div class="row"><span>Kode tiket</span><b>' + esc(s.kode) + "</b></div>" : "") +
        '<button type="button" class="go" id="pqByOk" style="margin-top:14px">Mulai coba sekarang</button><div class="hint">Pilih akun Gmail <b>yang sama</b> (' + esc(o.email) + ') di layar Google. Tiket sekali pakai dan tersimpan di perangkat ini; bila tertutup, tekan tombol "Coba" di layar login.</div>';
    } else if (jenis === "paid" && s.diterapkan) {
      lsSet(SK, null);
      h = '<div class="ok"><div class="ic"><i class="fa-solid fa-check"></i></div><h3>Pembayaran diterima — akun aktif!</h3><p>Langganan Anda sudah aktif otomatis.</p></div>' +
        '<div class="row"><span>Email</span><b>' + esc(o.email) + '</b></div><div class="row"><span>Dibayar</span><b>' + rp(s.jumlah || o.jumlah) + '</b></div><div class="row"><span>Aktif sampai</span><b>' + esc(s.sampai ? fmtTgl(s.sampai) : "-") + "</b></div>" +
        '<button type="button" class="go" id="pqByOk" style="margin-top:14px">Lanjut masuk ke PETAQU</button><div class="hint">Masuk dengan email &amp; password akun ini. Bila baru mendaftar, konfirmasi email dulu (cek Spam).</div>';
    } else if (jenis === "paid") {
      lsSet(SK, null);
      h = '<div class="ok"><div class="ic"><i class="fa-solid fa-check"></i></div><h3>Pembayaran diterima</h3><p>Akun dengan email <b>' + esc(o.email) + '</b> belum terdaftar.</p><p><b>Daftar akun memakai email yang sama</b> — akun akan langsung aktif otomatis tanpa menunggu admin.</p></div>' +
        '<button type="button" class="go" id="pqByOk" style="margin-top:14px">Daftar sekarang</button>';
    } else if (jenis === "ditahan") {
      lsSet(SK, null);
      h = '<div class="ok"><div class="ic w"><i class="fa-solid fa-hourglass-half"></i></div><h3>Pembayaran diterima, perlu pengecekan</h3><p>Akun ini tidak bisa diaktifkan otomatis (mis. akun khusus / sudah tanpa batas waktu). Admin akan memeriksa pembayaran Anda; simpan bukti dari aplikasi bank Anda.</p></div>' +
        '<button type="button" class="go" id="pqByOk" style="margin-top:14px">Tutup</button>';
    } else {
      lsSet(SK, null);
      h = '<div class="ok"><div class="ic e"><i class="fa-solid fa-clock"></i></div><h3>' + (jenis === "failed" ? "Pembayaran dibatalkan" : "QR kedaluwarsa") + '</h3><p>Belum ada pembayaran yang masuk. Bila sudah terlanjur membayar, tunggu 1–2 menit — akun tetap aktif otomatis.</p></div>' +
        '<button type="button" class="go" id="pqByOk" style="margin-top:14px">Buat QR baru</button><button type="button" class="sec" id="pqByCl">Tutup</button>';
    }
    box.innerHTML = '<button class="x" type="button" id="pqByX" aria-label="Tutup">×</button>' + h; pasangX();
    var ok = $("pqByOk"), cl = $("pqByCl");
    if (ok) ok.onclick = function () {
      if (jenis === "paid" && s.diterapkan && (s.bulan === 0 || o.bulan === 0)) { tutup(); try { window.PQTrialTiket && window.PQTrialTiket.mulai(); } catch (e) { /* abaikan */ } return; }
      if (jenis === "paid" && !s.diterapkan) { tutup(); try { var b = $("pqdOpen"); if (b) b.click(); } catch (e) { /* abaikan */ } }
      else if (jenis === "expired" || jenis === "failed" || jenis === "tidak_ada") renderPilih(); else tutup();
    };
    if (cl) cl.onclick = tutup;
    if (jenis === "paid") { try { if (typeof window.toast === "function") window.toast("✓ Pembayaran diterima"); } catch (e) { /* abaikan */ } }
  }

  /* ---------- pintu masuk ---------- */
  function sesiEmail() { try { var s = JSON.parse(localStorage.getItem("pq_cloud_session") || "null"); return s && s.email ? String(s.email) : ""; } catch (e) { return ""; } }
  function open(opt) {
    opt = opt || {}; build();
    var lama = lsGet(SK);
    if (opt.email) st.email = String(opt.email).trim();
    else if (!st.email) st.email = sesiEmail() || (lama && lama.email) || "";
    if (opt.bulan === 0 || opt.tiket) st.bulan = 0;
    else if (opt.bulan && st.harga.some(function (h) { return h.bulan === +opt.bulan; })) st.bulan = +opt.bulan;
    muatHarga(false).then(function () { if (!st.order && !st.busy) renderPilih(); });
    /* lanjutkan order yang belum selesai (QR masih berlaku & email sama) */
    if (lama && lama.order_id && lama.kedaluwarsa && new Date(lama.kedaluwarsa) - Date.now() > 20000 && (!opt.email || opt.email.toLowerCase() === lama.email)) {
      st.order = lama; st.final = ""; renderQR(); mulaiPoll(); cekStatus(true); return;
    }
    renderPilih();
  }

  /* cadangan: setelah login, terapkan pembayaran yang tertahan untuk akun ini (aman, hanya miliknya sendiri) */
  window.addEventListener("pq-login", function () {
    setTimeout(function () {
      try {
        var s = JSON.parse(localStorage.getItem("pq_cloud_session") || "null"), c = cfg(); if (!s || !s.access_token || !c) return;
        fetch(c.url + "/rest/v1/rpc/qris_klaim_saya", { method: "POST", headers: { apikey: c.anon, Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" }, body: "{}" }).catch(function () { });
      } catch (e) { /* abaikan */ }
    }, 2500);
  });

  window.PQBayar = { open: open, close: tutup, siap: function () { return !!cfg() && typeof window.qrcode === "function"; } };
})();
