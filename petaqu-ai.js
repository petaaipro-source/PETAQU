/* Perintah bahasa Indonesia untuk asisten: dijalankan lokal (tanpa API key); yang tidak dikenali diteruskan ke AI. */
(function () {
  'use strict';
  const R = () => (typeof roads !== 'undefined' ? roads : []), J = () => (typeof JEMBATAN_DB !== 'undefined' ? JEMBATAN_DB : []);
  const A = () => window.PETAQU_PRO.all(), km = m => (m / 1000).toFixed(2) + ' km';
  const num = s => { const m = s.match(/(\d+(?:[.,]\d+)?)/); return m ? +m[1].replace(',', '.') : null; };
  const link = (id, t) => `<a href="#" data-pq-focus="${id}" style="color:#22d3ee">${esc(t)}</a>`;
  function route(q) {
    const t = q.toLowerCase().trim();
    if (/^(prioritas|rab|tampilkan prioritas|buka prioritas)/.test(t)) { PETAQU_PRO.open(); return 'Membuka tabel prioritas penanganan & RAB.'; }
    if (/(aktifkan|nyalakan|hidupkan|matikan).*(peringatan|geofence|alarm)/.test(t)) { PETAQU_PRO.geoToggle(); return 'Peringatan area diubah (lihat ikon lonceng).'; }
    if (/^(ringkas|statistik|rekap)/.test(t)) {
      const a = A(), tot = a.reduce((s, x) => s + x.len, 0), n = a.filter(x => x.n).length, avg = a.filter(x => x.avg != null);
      const m = avg.length ? (avg.reduce((s, x) => s + x.avg, 0) / avg.length).toFixed(1) : '–';
      return `<b>${a.length}</b> ruas (${km(tot)}), <b>${J().length}</b> jembatan. Ruas ber-data IRI: ${n}; IRI rata-rata ${m}. Terburuk: ${a.slice(0, 3).map(x => link(x.r.id, x.r.name)).join(', ') || '–'}.`;
    }
    let m;
    if ((m = t.match(/iri\s*(?:>|di atas|lebih dari|diatas)\s*(\d+(?:[.,]\d+)?)/))) {
      const lim = +m[1].replace(',', '.'), kab = (t.match(/(?:di|kab(?:upaten)?\.?)\s+([a-z ]+?)(?:\s+iri|$)/) || [])[1];
      const f = A().filter(x => x.avg > lim && (!kab || (x.r.kabupaten || '').toLowerCase().includes(kab.trim())));
      return f.length ? `${f.length} ruas IRI > ${lim}:<br>` + f.slice(0, 15).map(x => `• ${link(x.r.id, x.r.name)} — IRI ${x.avg.toFixed(1)}, ${km(x.len)}`).join('<br>') : `Tidak ada ruas dengan IRI rata-rata di atas ${lim}.`;
    }
    if ((m = t.match(/^(?:terbang ke|cari|fokus(?: ke)?|tampilkan|buka)\s+(?:ruas\s+|jembatan\s+)?(.+)$/))) {
      const k = m[1].trim(), r = R().find(x => x.name.toLowerCase().includes(k)), b = J().find(x => (x.name || '').toLowerCase().includes(k));
      if (r) { focusRoad(r.id); return 'Terbang ke ruas ' + esc(r.name) + '.'; }
      if (b) { focusJembatan(b.id); return 'Terbang ke jembatan ' + esc(b.name) + '.'; }
      return null;   // mungkin pertanyaan umum: biarkan AI menjawab
    }
    if ((m = t.match(/^(?:ekspor|unduh|export)\s+(?:ruas\s+)?(.+)$/)) && /rab|prioritas/.test(m[1])) { PETAQU_PRO.open(); return 'Tabel dibuka; tekan "Ekspor Excel".'; }
    return null;
  }
  function bubble(cls, html) { const box = document.getElementById('aiMessages'); if (!box) return; const d = document.createElement('div'); d.className = 'ai-msg ' + cls; d.innerHTML = html; box.append(d); box.scrollTop = box.scrollHeight; }
  function hook() {
    const orig = window.__aiSend; if (typeof orig !== 'function' || orig.__pq) return false;
    window.__aiSend = function () {
      const inp = document.getElementById('aiInput'), q = inp && inp.value.trim();
      if (q && window.PETAQU_PRO) { let out = null; try { out = route(q); } catch (e) { out = 'Gagal menjalankan perintah: ' + esc(e.message); }
        if (out !== null) { bubble('user', esc(q)); bubble('ai', out); inp.value = ''; inp.style.height = 'auto'; return; } }
      return orig.apply(this, arguments);
    };
    window.__aiSend.__pq = 1; return true;
  }
  document.addEventListener('click', e => { const a = e.target.closest('[data-pq-focus]'); if (a) { e.preventDefault(); try { focusRoad(a.dataset.pqFocus); } catch (_) {} } });
  let tries = 0; const iv = setInterval(() => { if (hook() || ++tries > 40) clearInterval(iv); }, 500);
})();
