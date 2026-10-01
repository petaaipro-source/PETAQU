/* PETAQU Pro: prioritas penanganan + RAB, tren IRI, geofence, perintah cepat, pembuka berkas (file handler). */
(function () {
  'use strict';
  const H = 'pq_iri_history', P = 'pq_unit_price';
  const fmt = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const el = (t, css, html) => { const e = document.createElement(t); e.style.cssText = css || ''; if (html) e.innerHTML = html; return e; };
  const say = (m, ms) => { try { toast(m, ms || 3000); } catch (_) { console.log(m); } };
  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (_) { return d; } };
  const prices = () => Object.assign({ rb: 2500000, rr: 1000000, sedang: 300000 }, jget(P, {}));   // Rp per meter, ASUMSI: ubah sesuai HSPK setempat

  // ---- analisis tiap ruas dari titik ber-IRI ----
  function analyze(r) {
    const pts = r.points || [], v = pts.filter(p => p.iri !== undefined && p.iri !== null && p.iri !== '' && !isNaN(p.iri));
    const len = computeLength(pts), n = v.length;
    if (!n) return { r, len, n: 0, avg: null, share: { baik: 0, sedang: 0, rr: 0, rb: 0 }, score: 0, cost: 0 };
    const c = { baik: 0, sedang: 0, rr: 0, rb: 0 }; v.forEach(p => c[getIriInfo(p.iri).key]++);
    const share = {}; for (const k in c) share[k] = c[k] / n;
    const avg = v.reduce((s, p) => s + (+p.iri), 0) / n, pr = prices();
    const cost = len * (share.rb * pr.rb + share.rr * pr.rr + share.sedang * pr.sedang);
    // skor 0-100: keparahan (rusak berat 1, ringan .6, sedang .25) dikali bobot panjang (maks 5 km = 1)
    const sev = share.rb + .6 * share.rr + .25 * share.sedang, score = Math.round(100 * sev * (.5 + .5 * Math.min(1, len / 5000)));
    return { r, len, n, avg, share, score, cost };
  }
  const all = () => (typeof roads !== 'undefined' ? roads : []).map(analyze).sort((a, b) => b.score - a.score);

  // ---- riwayat & tren (snapshot harian, regresi linear bila >=3 titik) ----
  function snapshot() {
    const h = jget(H, {}), d = new Date().toISOString().slice(0, 10);
    all().forEach(a => { if (a.avg == null) return; const k = a.r.id, arr = h[k] || []; if (!arr.length || arr[arr.length - 1][0] !== d) arr.push([d, +a.avg.toFixed(2)]); h[k] = arr.slice(-60); });
    try { localStorage.setItem(H, JSON.stringify(h)); } catch (_) {}
  }
  function trend(id) {
    const a = (jget(H, {})[id] || []);
    if (a.length < 2) return { txt: '–', slope: null };
    const t = a.map(x => Date.parse(x[0]) / 864e5), y = a.map(x => x[1]), n = a.length, mt = t.reduce((s, v) => s + v) / n, my = y.reduce((s, v) => s + v) / n;
    let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (t[i] - mt) * (y[i] - my); den += (t[i] - mt) ** 2; }
    const slope = den ? num / den : 0, d = y[n - 1] - y[0], proj = n >= 3 ? ' · +90h≈' + (y[n - 1] + slope * 90).toFixed(1) : '';
    return { txt: (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '= ') + d.toFixed(1) + proj, slope };
  }

  // ---- panel ----
  let panel;
  function open() {
    if (panel) panel.remove();
    panel = el('div', 'position:fixed;inset:0;z-index:6000;background:#000a;display:flex;align-items:center;justify-content:center;padding:10px');
    const box = el('div', 'background:#071a26;color:#e6f1f7;border:1px solid #22d3ee55;border-radius:14px;width:min(920px,100%);max-height:92vh;display:flex;flex-direction:column;font:13px system-ui');
    const pr = prices(), rows = all();
    const total = rows.reduce((s, a) => s + a.cost, 0);
    box.innerHTML = '<div style="padding:12px 14px;display:flex;gap:8px;align-items:center;border-bottom:1px solid #ffffff22"><b style="font-size:15px;flex:1">Prioritas Penanganan & RAB</b>' +
      '<button id="pqX" style="background:none;border:0;color:#fff;font-size:20px;cursor:pointer">✕</button></div>' +
      '<div style="padding:10px 14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">Harga satuan (Rp/m, <i>asumsi</i>):' +
      ['rb:Rusak Berat', 'rr:Rusak Ringan', 'sedang:Sedang'].map(s => { const [k, l] = s.split(':'); return `<label>${l} <input data-k="${k}" type="number" value="${pr[k]}" style="width:100px;background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:3px"></label>`; }).join('') +
      '<button id="pqRe" style="background:#0e7490;color:#fff;border:0;border-radius:6px;padding:5px 10px;cursor:pointer">Hitung ulang</button><button id="pqXl" style="background:#15803d;color:#fff;border:0;border-radius:6px;padding:5px 10px;cursor:pointer">Ekspor Excel</button></div>' +
      '<div style="padding:0 14px 6px">Total perkiraan: <b>' + fmt(total) + '</b> · ' + rows.length + ' ruas. Hanya ruas ber-data IRI yang dinilai.</div>' +
      '<div style="overflow:auto;padding:0 14px 14px"><table style="width:100%;border-collapse:collapse;min-width:640px"><thead><tr style="text-align:left;color:#22d3ee"><th>#</th><th>Ruas</th><th>Km</th><th>IRI</th><th>%RB</th><th>%RR</th><th>Skor</th><th>Tren IRI</th><th>Biaya</th></tr></thead><tbody>' +
      rows.map((a, i) => `<tr data-id="${a.r.id}" style="border-top:1px solid #ffffff14;cursor:pointer"><td>${i + 1}</td><td>${esc(a.r.name)}</td><td>${(a.len / 1000).toFixed(2)}</td><td>${a.avg == null ? '–' : a.avg.toFixed(1)}</td><td>${(a.share.rb * 100).toFixed(0)}</td><td>${(a.share.rr * 100).toFixed(0)}</td><td><b style="color:${a.score > 60 ? '#f43f5e' : a.score > 30 ? '#f59e0b' : '#34d399'}">${a.score}</b></td><td>${trend(a.r.id).txt}</td><td>${fmt(a.cost)}</td></tr>`).join('') + '</tbody></table></div>';
    panel.append(box); document.body.append(panel);
    box.querySelector('#pqX').onclick = () => panel.remove();
    panel.onclick = e => { if (e.target === panel) panel.remove(); };
    box.querySelector('#pqRe').onclick = () => { const o = {}; box.querySelectorAll('input[data-k]').forEach(i => o[i.dataset.k] = +i.value || 0); localStorage.setItem(P, JSON.stringify(o)); open(); };
    box.querySelector('#pqXl').onclick = () => {
      const aoa = [['Peringkat', 'Ruas', 'Kabupaten', 'Panjang (m)', 'IRI rata-rata', '% Rusak Berat', '% Rusak Ringan', '% Sedang', 'Skor', 'Tren IRI', 'Perkiraan Biaya (Rp)']]
        .concat(rows.map((a, i) => [i + 1, a.r.name, a.r.kabupaten || '', Math.round(a.len), a.avg == null ? '' : +a.avg.toFixed(2), +(a.share.rb * 100).toFixed(1), +(a.share.rr * 100).toFixed(1), +(a.share.sedang * 100).toFixed(1), a.score, trend(a.r.id).txt, Math.round(a.cost)]));
      aoa.push([], ['Asumsi Rp/m', 'RB', pr.rb, 'RR', pr.rr, 'Sedang', pr.sedang], ['TOTAL', '', '', '', '', '', '', '', '', '', Math.round(total)]);
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Prioritas'); XLSX.writeFile(wb, 'prioritas-rab-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    };
    box.querySelectorAll('tbody tr').forEach(tr => tr.onclick = () => { panel.remove(); try { focusRoad(tr.dataset.id); } catch (_) {} });
  }

  // ---- geofence: peringatan suara/getar mendekati titik IRI buruk & jembatan ----
  let wid = null, last = {}, gbtn;
  const COOL = 120000, RADIUS = 200;
  function targets() {
    const t = []; (typeof roads !== 'undefined' ? roads : []).forEach(r => (r.points || []).forEach(p => { if (p.iri > 8 && !isNaN(p.iri)) t.push({ lat: p.lat, lng: p.lng, id: r.id + ':' + p.lat.toFixed(4) + p.lng.toFixed(4), msg: 'Jalan rusak ' + getIriInfo(p.iri).label + ' di depan, ruas ' + r.name }); }));
    (typeof JEMBATAN_DB !== 'undefined' ? JEMBATAN_DB : []).forEach(j => { if (typeof j.lat === 'number') t.push({ lat: j.lat, lng: j.lng, id: 'j' + j.id, msg: 'Mendekati jembatan ' + (j.name || '') }); });
    return t;
  }
  function geoToggle() {
    if (wid != null) { navigator.geolocation.clearWatch(wid); wid = null; gbtn.style.background = '#0e7490'; return say('Peringatan area dimatikan'); }
    if (!navigator.geolocation) return say('GPS tidak tersedia');
    let tg = targets(); if (!tg.length) return say('Belum ada titik IRI buruk/jembatan');
    gbtn.style.background = '#b91c1c'; say('Peringatan area aktif (' + tg.length + ' titik)');
    wid = navigator.geolocation.watchPosition(pos => {
      const { latitude: la, longitude: lo } = pos.coords, now = Date.now();
      for (const t of tg) {
        if (haversine(la, lo, t.lat, t.lng) * 1000 > RADIUS || now - (last[t.id] || 0) < COOL) continue;
        last[t.id] = now; say('⚠ ' + t.msg, 5000);
        navigator.vibrate && navigator.vibrate([200, 100, 200]);
        try { const u = new SpeechSynthesisUtterance(t.msg); u.lang = 'id-ID'; speechSynthesis.speak(u); } catch (_) {}
        break;
      }
    }, () => say('GPS gagal'), { enableHighAccuracy: true, maximumAge: 3000 });
  }

  // ---- pembuka berkas dari OS (file_handlers di manifest) ----
  if ('launchQueue' in window) launchQueue.setConsumer(async p => {
    if (!p.files || !p.files.length) return;
    const files = await Promise.all(p.files.map(h => h.getFile()));
    const ext = files[0].name.split('.').pop().toLowerCase();
    try { pendingImportFormat = ['xlsx', 'xls'].includes(ext) ? 'xlsx' : ext === 'kmz' ? 'kmz' : ext; handleImportFile({ target: { files, value: '' } }); say('Mengimpor ' + files.length + ' berkas…'); }
    catch (e) { say('Gagal mengimpor: ' + e.message, 4000); }
  });

  // ---- perintah cepat: ketik di konsol: PETAQU_CMD('iri>8') / PETAQU_CMD('cari banyumas') ----
  window.PETAQU_PRO = { open, all, geoToggle, trend };
  window.PETAQU_CMD = q => {
    q = String(q).toLowerCase().trim(); let m;
    if ((m = q.match(/^iri\s*>\s*([\d.]+)/))) return all().filter(a => a.avg > +m[1]).map(a => a.r.name);
    if ((m = q.match(/^cari\s+(.+)/))) { const f = roads.find(r => r.name.toLowerCase().includes(m[1])); if (f) focusRoad(f.id); return f ? f.name : null; }
    return 'Perintah: "iri>8", "cari <nama ruas>"';
  };

  function init() {
    const mk = (ico, title, label, fn) => { const b = el('button', '', ico); b.title = title; b.onclick = fn; PQ_DOCK.adopt(b, label); return b; };
    mk('<i class="fa-solid fa-ranking-star"></i>', 'Prioritas penanganan & RAB', 'Prioritas & RAB', open);
    gbtn = mk('<i class="fa-solid fa-bell"></i>', 'Peringatan mendekati jalan rusak/jembatan', 'Peringatan area', geoToggle);
    setTimeout(snapshot, 4000);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
