/* ===== PETAQU TAMPILAN — panel Ruas Jalan gaya menu drone (minimalis & elegan) =====
   Hanya mengubah TAMPILAN. Semua tombol, onclick, id, dan class lama tetap dipakai modul lain.
   - Kartu ruas bersih; deretan ikon aksi hanya muncul di ruas yang dipilih / disorot kursor.
   - Tombol atas (Semua / Sembunyi / Aktif dulu) jadi satu baris.
   - Matikan kapan saja: PQTampilan.off()  ·  nyalakan lagi: PQTampilan.on()
   Disimpan di localStorage 'pq_tampilan' ("0" = klasik). */
(function () {
  'use strict';
  var KEY = 'pq_tampilan', CSS_ID = 'pqvCss', root = document.documentElement;

  var css = [
    /* ---------- token ---------- */
    'html.pqv{--pqv-ink:#e6edf5;--pqv-dim:#8aa4bd;--pqv-sky:#38bdf8;--pqv-sky2:#7dd3fc;--pqv-deep:#0e7490;--pqv-card:#ffffff08;--pqv-line:#ffffff14;--pqv-glass:#0b1520}',

    /* ---------- rangka panel ---------- */
    'html.pqv body #sidebar{background:linear-gradient(180deg,#081522 0%,#06101a 100%);border-right:1px solid #38bdf833;color:var(--pqv-ink)}',
    'html.pqv body #sidebar *{scrollbar-width:thin;scrollbar-color:#38bdf84d transparent}',
    'html.pqv body #sidebar ::-webkit-scrollbar{width:6px;height:6px}',
    'html.pqv body #sidebar ::-webkit-scrollbar-thumb{background:#38bdf84d;border-radius:9px}',

    /* ---------- tab Ruas / Jembatan ---------- */
    'html.pqv body #sidebar .nav-tab{background:transparent;border:1px solid transparent;color:var(--pqv-dim);border-radius:999px;font-weight:700;font-size:12.5px;box-shadow:none;transition:.15s}',
    'html.pqv body #sidebar .nav-tab:hover{color:#fff;background:#ffffff0d}',
    'html.pqv body #sidebar .nav-tab[aria-selected="true"]{background:var(--pqv-deep);border-color:#22d3ee;color:#fff;box-shadow:0 0 0 3px #22d3ee1f}',
    'html.pqv body #sidebar .nav-tab-count{background:#ffffff1f;color:inherit;border-radius:999px;font-weight:700;font-size:10.5px;padding:1px 7px}',

    /* ---------- cari + filter ---------- */
    'html.pqv body #sidebar #searchWrap{background:var(--pqv-glass);border:1px solid #ffffff22;border-radius:12px;transition:.15s;box-shadow:none}',
    'html.pqv body #sidebar #searchWrap:focus-within{border-color:var(--pqv-sky);box-shadow:0 0 0 3px #38bdf826}',
    'html.pqv body #sidebar #searchWrap input{background:transparent!important;border:0!important;box-shadow:none!important;outline:0!important;color:var(--pqv-ink)}',
    'html.pqv body #sidebar #searchWrap i,html.pqv body #sidebar #searchWrap svg{color:var(--pqv-dim);fill:var(--pqv-dim)}',
    'html.pqv body #sidebar .nav-select{appearance:none;-webkit-appearance:none;background-color:var(--pqv-glass);border:1px solid #ffffff22;border-radius:12px;color:var(--pqv-ink);font-weight:600;padding-right:34px;cursor:pointer;',
    'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1.5l5 5 5-5\' fill=\'none\' stroke=\'%237dd3fc\' stroke-width=\'1.8\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 13px center}',
    'html.pqv body #sidebar .nav-select:focus{outline:0;border-color:var(--pqv-sky);box-shadow:0 0 0 3px #38bdf826}',
    'html.pqv body #sidebar .search-count,html.pqv body #sidebar #searchCount{color:var(--pqv-dim);font-size:11px}',

    /* ---------- tombol massal: satu baris, pil ---------- */
    'html.pqv body #sidebar .btn-row{display:flex;gap:6px;margin-top:8px}',
    'html.pqv body #sidebar .btn-row .btn{flex:1 1 0;min-width:0;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;background:var(--pqv-glass);border:1px solid #38bdf84d;color:var(--pqv-sky2);border-radius:999px;padding:7px 8px;font-size:11.5px;font-weight:700;transition:.15s}',
    'html.pqv body #sidebar .btn-row .btn:hover{background:var(--pqv-deep);border-color:#22d3ee;color:#fff}',
    'html.pqv body #sidebar .btn-row .btn.active{background:var(--pqv-deep);border-color:#22d3ee;color:#fff}',

    /* ---------- baris "Aksi lainnya" ---------- */
    'html.pqv body #sidebar .pqv-aksi{color:#5b7186;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}',

    /* ---------- bar kecil (STA otomatis, pilihan) ---------- */
    'html.pqv body #sidebar #pqStaBar,html.pqv body #sidebar #roadSelectionBar{background:var(--pqv-card);border:1px solid var(--pqv-line);border-radius:12px;margin:6px 8px}',
    'html.pqv body #sidebar #pqStaBar .pq-mini{background:var(--pqv-glass);border:1px solid #38bdf84d;color:var(--pqv-sky2);border-radius:999px;font-weight:700}',
    'html.pqv body #sidebar #pqStaBar .pq-mini:hover{background:var(--pqv-deep);color:#fff}',

    /* ---------- kartu ruas ---------- */
    'html.pqv body #sidebar #roadList{list-style:none;margin:0;padding:4px 8px 16px}',
    'html.pqv body #sidebar #roadList .road-item{position:relative;margin:0 0 7px;padding:11px 12px;border:1px solid var(--pqv-line);border-radius:14px;background:var(--pqv-card);box-shadow:none;transition:background .15s,border-color .15s}',
    'html.pqv body #sidebar #roadList .road-item:hover{background:#38bdf80d;border-color:#38bdf84d}',
    'html.pqv body #sidebar #roadList .road-item.active{background:#38bdf814;border-color:#38bdf8aa;box-shadow:0 0 0 3px #38bdf81a}',
    'html.pqv body #sidebar #roadList .road-item.checked{background:#38bdf814;border-color:#38bdf8aa}',
    'html.pqv body #sidebar #roadList .road-item.hidden-layer{opacity:.55}',
    'html.pqv body #sidebar #roadList .road-item-main{align-items:center;gap:10px}',
    'html.pqv body #sidebar #roadList .road-swatch{width:5px;align-self:stretch;min-height:34px;height:auto;border-radius:6px;box-shadow:none;flex:none}',
    'html.pqv body #sidebar #roadList .road-info{min-width:0;flex:1}',
    'html.pqv body #sidebar #roadList .road-item .rn{font-size:13.5px;font-weight:650;color:var(--pqv-ink);line-height:1.3;letter-spacing:-.005em;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    'html.pqv body #sidebar #roadList .road-item .rm{color:var(--pqv-dim);font-size:11.5px;font-weight:500;margin-top:3px;display:flex;flex-wrap:wrap;gap:2px 10px;align-items:center}',
    'html.pqv body #sidebar #roadList .road-kab-badge{display:inline-flex;align-items:center;gap:5px;background:#ffffff0d;border-radius:999px;padding:2px 9px;color:var(--pqv-sky2);font-size:10.5px;font-weight:600}',
    'html.pqv body #sidebar #roadList .pq-km-chip{color:var(--pqv-dim)}',

    /* saklar tampil/sembunyi */
    'html.pqv body #sidebar #roadList .road-toggle{background:#ffffff1f;border:1px solid #ffffff1f;box-shadow:none}',
    'html.pqv body #sidebar #roadList .road-toggle.on{background:var(--pqv-deep);border-color:#22d3ee}',
    'html.pqv body #sidebar #roadList .road-check input{accent-color:#38bdf8}',

    /* ---------- baris tambahan (progres dll) ---------- */
    'html.pqv body #sidebar #roadList .pqv-extra{display:flex;align-items:center;gap:8px;margin-top:8px;padding:2px 0;background:transparent;border:0;font-size:11.5px;color:var(--pqv-dim)}',
    'html.pqv body #sidebar #roadList .pqv-extra button{width:26px;height:26px;padding:0;border-radius:50%;border:1px solid #38bdf833;background:transparent;color:var(--pqv-sky2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:.15s;flex:none}',
    'html.pqv body #sidebar #roadList .pqv-extra button:hover{background:var(--pqv-deep);color:#fff;border-color:#22d3ee}',

    /* ---------- ikon aksi: bulat, muncul saat dipilih ---------- */
    'html.pqv body #sidebar #roadList .road-item-actions{display:none;grid-template-columns:repeat(5,1fr);gap:6px;justify-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--pqv-line)}',
    'html.pqv body #sidebar #roadList .road-item.active .road-item-actions,html.pqv body #sidebar #roadList .road-item.checked .road-item-actions,html.pqv body #sidebar #roadList .road-item:focus-within .road-item-actions{display:grid}',
    '@media(hover:hover){html.pqv body #sidebar #roadList .road-item:hover .road-item-actions{display:grid}}',
    'html.pqv body #sidebar #roadList .road-item .rowbtn{width:32px;height:32px;padding:0;border-radius:50%;border:1px solid #38bdf84d;background:var(--pqv-glass);color:var(--pqv-sky2);font-size:13px;display:inline-flex;align-items:center;justify-content:center;transition:.15s}',
    'html.pqv body #sidebar #roadList .road-item .rowbtn:hover{background:var(--pqv-deep);color:#fff;border-color:#22d3ee}',
    'html.pqv body #sidebar #roadList .road-item .rowbtn-drone{color:#38bdf8}',
    'html.pqv body #sidebar #roadList .road-item .rowbtn:last-child:hover{background:#7f1d1d;border-color:#f87171;color:#fecaca}',

    /* ---------- jembatan (tab sebelah) ikut serasi ---------- */
    'html.pqv body #sidebar #jembatanList .road-item{margin:0 0 7px;border:1px solid var(--pqv-line);border-radius:14px;background:var(--pqv-card)}',
    'html.pqv body #sidebar #jembatanList .road-item:hover{background:#38bdf80d;border-color:#38bdf84d}'
  ].join('\n');

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style'); s.id = CSS_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  var busy = false;
  function tidy() {
    if (busy || !root.classList.contains('pqv')) return;
    busy = true;
    try {
      var sb = document.getElementById('sidebar'); if (!sb) return;

      /* 1) tombol atas jadi satu baris: Semua · Sembunyi · Aktif dulu */
      var sort = document.getElementById('visibilitySortBtn');
      if (sort && !sort.__pqv) {
        var row1 = sort.closest('.btn-row'), prev = row1 && row1.previousElementSibling;
        while (prev && !(prev.classList && prev.classList.contains('btn-row'))) prev = prev.previousElementSibling;
        if (prev && prev !== row1) {
          prev.appendChild(sort);
          if (row1 && !row1.children.length) row1.parentNode.removeChild(row1);
          sort.innerHTML = '<i class="fa-solid fa-arrow-down-wide-short"></i> Aktif dulu';
        }
        sort.__pqv = 1;
      }
      sb.querySelectorAll('.btn-row .btn').forEach(function (b) {
        var t = (b.textContent || '').trim();
        if (t === 'Sembunyikan' && !b.__pqv) { b.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Sembunyi'; b.__pqv = 1; }
      });

      /* 2) penanda judul "Aksi lainnya" */
      sb.querySelectorAll('div,span,button,summary,h4,h5,small').forEach(function (el) {
        if (el.__pqvA) return;
        if (el.children.length > 3) return;
        var t = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (t === 'aksi lainnya') { el.classList.add('pqv-aksi'); el.__pqvA = 1; }
      });

      /* 3) tandai baris tambahan di dalam kartu ruas (progres, dsb.) */
      sb.querySelectorAll('#roadList .road-item').forEach(function (it) {
        Array.prototype.forEach.call(it.children, function (c) {
          if (c.classList.contains('road-item-main') || c.classList.contains('road-item-actions') || c.classList.contains('pqv-extra')) return;
          if (c.tagName === 'INPUT' || c.tagName === 'LABEL') return;
          c.classList.add('pqv-extra');
        });
      });
    } catch (e) { /* tampilan saja — jangan ganggu aplikasi */ }
    busy = false;
  }

  var tm = null;
  function sched() { clearTimeout(tm); tm = setTimeout(tidy, 80); }

  function on() {
    ensureCss(); root.classList.add('pqv');
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    tidy();
  }
  function off() {
    root.classList.remove('pqv');
    try { localStorage.setItem(KEY, '0'); } catch (e) {}
  }

  function init() {
    var pref = null; try { pref = localStorage.getItem(KEY); } catch (e) {}
    if (pref !== '0') { ensureCss(); root.classList.add('pqv'); }
    var sb = document.getElementById('sidebar');
    if (!sb) return setTimeout(init, 400);
    new MutationObserver(sched).observe(sb, { childList: true, subtree: true });
    tidy();
  }

  window.PQTampilan = { on: on, off: off };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
