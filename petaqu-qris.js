/* PETAQU — QRIS pembayaran di layar login: ikon kecil → ketuk untuk zoom → tombol Unduh.
   Gambar: qris.png (sama dengan yang dipakai petaqu-daftar.js, tidak digandakan). Link QRIS di panel "Cara Bayar" ikut dibuka lewat penampil ini. */
(function () {
  'use strict';
  var SRC = 'qris.png', NAMA = 'QRIS-PETAQU.png';
  var css = document.createElement('style');
  css.textContent =
    '#pqQrisIco{display:inline-flex;align-items:center;gap:7px;margin:12px auto 0;padding:5px 11px 5px 6px;border-radius:999px;border:1px solid rgba(34,211,238,.35);background:rgba(255,255,255,.05);color:#cfe9f3;font:600 11.5px system-ui,sans-serif;cursor:pointer}' +
    '#pqQrisIco img{width:26px;height:26px;border-radius:5px;background:#fff;object-fit:cover;object-position:50% 60%}' +
    '#pqQrisIco:hover{border-color:#22d3ee}#pqQrisWrap{text-align:center}' +
    '#pqQrisOv{position:fixed;inset:0;z-index:200000;background:rgba(3,6,12,.88);display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:14px}' +
    '#pqQrisOv.show{display:flex}#pqQrisOv .pq-qz{max-width:min(94vw,560px);max-height:78vh;overflow:auto;border-radius:12px;background:#fff;-webkit-overflow-scrolling:touch}' +
    '#pqQrisOv img{display:block;width:100%;height:auto;cursor:zoom-in;transition:width .15s}#pqQrisOv img.z{width:200%;cursor:zoom-out;max-width:none}' +
    '#pqQrisOv .pq-qb{display:flex;gap:8px}#pqQrisOv .pq-qb a,#pqQrisOv .pq-qb button{padding:10px 18px;border-radius:10px;border:1px solid #22d3ee;background:#22d3ee;color:#04121a;font:700 13px system-ui,sans-serif;text-decoration:none;cursor:pointer}' +
    '#pqQrisOv .pq-qb button{background:transparent;color:#e5e9f5;border-color:#3b4660}#pqQrisOv .pq-qt{color:#cbd5e1;font:12px system-ui,sans-serif;text-align:center}';
  document.head.appendChild(css);

  var ov;
  function build() {
    if (ov) return;
    ov = document.createElement('div'); ov.id = 'pqQrisOv';
    ov.innerHTML = '<div class="pq-qt">Scan dengan GoPay / m-banking / e-wallet apa pun · ketuk gambar untuk zoom</div>' +
      '<div class="pq-qz"><img alt="QRIS PETAQU" src="' + SRC + '"></div>' +
      '<div class="pq-qb"><a download="' + NAMA + '" href="' + SRC + '"><i class="fa-solid fa-download"></i> Unduh QRIS</a><button type="button">Tutup</button></div>';
    document.body.appendChild(ov);
    var img = ov.querySelector('img');
    img.onclick = function () { img.classList.toggle('z'); };
    ov.querySelector('button').onclick = close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
  }
  function open() {
    if (window.PQBayar && window.PQBayar.siap()) return window.PQBayar.open();   /* QRIS dinamis + aktif otomatis (petaqu-bayar.js); gambar statis hanya cadangan */
    build(); ov.querySelector('img').classList.remove('z'); ov.classList.add('show'); }
  function close() { if (ov) ov.classList.remove('show'); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  /* link QRIS di panel Cara Bayar (petaqu-daftar.js) → pakai penampil ini */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.pqd-qris a'); if (!a) return;
    e.preventDefault(); open();
  }, true);

  function mount() {
    if (document.getElementById('pqQrisIco')) return true;
    var card = document.getElementById('loginCard') || document.getElementById('loginScreen'); if (!card) return false;
    var w = document.createElement('div'); w.id = 'pqQrisWrap';
    w.innerHTML = '<button type="button" id="pqQrisIco" title="Bayar langganan lewat QRIS — aktif otomatis"><img src="' + SRC + '" alt=""><span>Bayar / Perpanjang via QRIS</span></button>';
    card.appendChild(w);
    w.firstChild.onclick = open;
    return true;
  }
  function init() { if (!mount()) setTimeout(init, 500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.PQQris = { open: open, close: close };
})();
