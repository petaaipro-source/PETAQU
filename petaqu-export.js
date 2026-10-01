/* PETAQU — tombol "Unduh data-ruas.js" di jendela "Jadikan Data Saat Ini sebagai Default".
 * Hasilnya file data-ruas.js utuh (hanya ROADS_SEED), tinggal menggantikan file lama di GitHub.
 * Pasang: letakkan di folder yang sama dengan index.html, lalu tambahkan di index.html (setelah petaqu-cloud.js):
 *   <script src="petaqu-export.js" defer></script>
 * Tambahkan juga 'petaqu-export.js' ke SHELL di sw.js dan naikkan versi V (mis. 'v14').
 */
(function () {
  'use strict';

  function seed() {
    if (typeof window.buildDefaultSeedData === 'function') return window.buildDefaultSeedData();
    return (window.roads || []).map(function (r) {            // cadangan bila fungsi bawaan tidak terlihat
      var o = { id: r.id, name: r.name };
      ['sourceFile', 'lengthKmFromSTA', 'lengthKmCalculated', 'kabupaten'].forEach(function (k) { if (r[k] != null) o[k] = r[k]; });
      o.points = (r.points || []).map(function (p) { var q = {}; Object.keys(p).forEach(function (k) { if (k !== 'photo' && k !== 'photoAfter') q[k] = p[k]; }); return q; });
      return o;
    });
  }

  function say(m, err) { try { toast(m, !!err); } catch (_) { alert(m); } }

  function unduh() {
    var data = seed();
    if (!data.length) { say('Belum ada ruas untuk diekspor', true); return; }
    var isi =
      '// ============================================================\n' +
      '// PETAQU - DATABASE RUAS (ROADS_SEED)\n' +
      '// Diekspor dari aplikasi pada ' + new Date().toISOString() + ' (' + data.length + ' ruas)\n' +
      '// Edit file ini saja untuk menambah/mengubah/menghapus ruas default.\n' +
      '// Dimuat oleh index.html SEBELUM script utama. Jangan ubah nama variabel ROADS_SEED.\n' +
      '// ============================================================\n' +
      'const ROADS_SEED=' + JSON.stringify(data) + ';\n';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([isi], { type: 'text/javascript' }));
    a.download = 'data-ruas.js';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    say('data-ruas.js diunduh (' + data.length + ' ruas) — ganti file di GitHub dengan ini');
  }

  function pasang() {
    var lama = document.querySelector('#defaultDataModal button[onclick*="downloadDefaultSeedCode"]');
    if (!lama || document.getElementById('pqDlDataRuas')) return;
    var b = document.createElement('button');
    b.id = 'pqDlDataRuas'; b.className = 'btn primary'; b.type = 'button';
    b.innerHTML = '<i class="fa-solid fa-file-code"></i> Unduh data-ruas.js';
    b.onclick = unduh;
    lama.parentNode.insertBefore(b, lama);
  }

  window.PETAQU_EXPORT = { unduh: unduh };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', pasang) : pasang();
})();
