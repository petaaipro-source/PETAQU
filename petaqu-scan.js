/* PETAQU Scan: video dashcam -> deteksi kerusakan (YOLO/ONNX via petaqu-detect.js) -> titik di peta + estimasi luas & biaya.
   ASUMSI (ubah di panel): video berjalan beraturan dari awal sampai akhir ruas; luas tampak per frame (m2) dan harga per m2 adalah perkiraan kasar, bukan hasil ukur. */
(function () {
  'use strict';
  const K = 'pq_scan', PK = 'pq_scan_price', FK = 'pq_scan_frame_m2';
  const COL = { lubang: '#f43f5e', retak_buaya: '#f59e0b', retak_memanjang: '#facc15', tambalan: '#7c8aa0' };
  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (_) { return d; } };
  const price = () => Object.assign({ lubang: 350000, retak_buaya: 250000, retak_memanjang: 80000, tambalan: 0 }, jget(PK, {}));
  const frameM2 = () => +localStorage.getItem(FK) || 40;
  const fmt = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const sta = d => Math.floor(d / 1000) + '+' + String(Math.round(d % 1000)).padStart(3, '0');
  const say = m => { try { toast(m, 3500); } catch (_) { alert(m); } };
  const el = (t, css, html) => { const e = document.createElement(t); e.style.cssText = css || ''; if (html) e.innerHTML = html; return e; };
  const once = (o, ev) => new Promise(ok => o.addEventListener(ev, ok, { once: true }));
  const hav = (a, b) => { const R = 6371000, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const store = () => jget(K, {});
  let layer = null, stop = false;

  function pathOf(road) {
    const p = (road.points || []).filter(x => isFinite(x.lat) && isFinite(x.lng)), c = [0];
    for (let i = 1; i < p.length; i++) c.push(c[i - 1] + hav(p[i - 1], p[i]));
    return { p, c, L: c[c.length - 1] || 0 };
  }
  function at(P, d) {
    let i = 1; while (i < P.c.length - 1 && P.c[i] < d) i++;
    const seg = (P.c[i] - P.c[i - 1]) || 1, f = Math.min(1, Math.max(0, (d - P.c[i - 1]) / seg)), a = P.p[i - 1], b = P.p[i];
    return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
  }

  function parseGpx(txt) {
    const x = new DOMParser().parseFromString(txt, 'application/xml');
    const a = [...x.getElementsByTagName('trkpt')].map(p => { const t = p.getElementsByTagName('time')[0]; return [t ? Date.parse(t.textContent) : NaN, +p.getAttribute('lat'), +p.getAttribute('lon')]; })
      .filter(q => isFinite(q[0]) && isFinite(q[1]) && isFinite(q[2])).sort((u, v) => u[0] - v[0]);
    if (a.length < 2) throw new Error('GPX tidak punya jejak ber-waktu (trkpt + time)'); return a;
  }
  function gpsAt(a, ms) {
    if (ms < a[0][0] || ms > a[a.length - 1][0]) return null;
    let i = 1; while (i < a.length - 1 && a[i][0] < ms) i++;
    const f = (ms - a[i - 1][0]) / ((a[i][0] - a[i - 1][0]) || 1);
    return { lat: a[i - 1][1] + (a[i][1] - a[i - 1][1]) * f, lng: a[i - 1][2] + (a[i][2] - a[i - 1][2]) * f };
  }
  function project(P, g) {   // titik GPS -> jarak sepanjang ruas (m) + simpangan dari garis ruas (m)
    const k = Math.cos(g.lat * Math.PI / 180) * 111320, m = 110540; let best = null;
    for (let i = 1; i < P.p.length; i++) {
      const a = P.p[i - 1], b = P.p[i], ax = (a.lng - g.lng) * k, ay = (a.lat - g.lat) * m, dx = (b.lng - a.lng) * k, dy = (b.lat - a.lat) * m, l2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)), off = Math.hypot(ax + u * dx, ay + u * dy);
      if (!best || off < best.off) best = { off, d: P.c[i - 1] + u * (P.c[i] - P.c[i - 1]) };
    }
    return best;
  }

  async function scan(file, road, step, prog, G) {
    const P = pathOf(road); if (P.p.length < 2 || !P.L) throw new Error('Ruas belum punya garis/titik yang cukup');
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(file);
    await once(v, 'loadedmetadata'); const dur = v.duration, out = [], last = {};
    stop = false; let skip = 0;
    const t0 = G ? file.lastModified - dur * 1000 + G.off * 1000 : 0;   // ASUMSI: waktu ubah file = akhir rekaman; koreksi lewat "geser waktu"
    for (let t = 0; t < dur && !stop; t += step) {
      v.currentTime = t; await once(v, 'seeked');
      let d = Math.min(P.L, t / dur * P.L), pos = at(P, d); const W = v.videoWidth, H = v.videoHeight;
      if (G) { const g = gpsAt(G.trk, t0 + t * 1000), pr = g && project(P, g); if (!pr || pr.off > 50) { skip++; prog(Math.round(t / dur * 100), out.length, skip); continue; } d = pr.d; pos = g; }
      const dets = await PETAQU_DETECT.run(v, { noTag: true });
      dets.forEach(x => {
        if (last[x.cls] != null && Math.abs(d - last[x.cls]) < 3) return;   // buang duplikat frame berdekatan (<3 m)
        last[x.cls] = d;
        out.push({ cls: x.cls, score: +x.score.toFixed(2), d: Math.round(d), lat: pos.lat, lng: pos.lng, area: +(x.box[2] * x.box[3] / (W * H) * frameM2()).toFixed(2) });
      });
      prog(Math.min(100, Math.round(t / dur * 100)), out.length, skip);
    }
    URL.revokeObjectURL(v.src);
    const s = store(); s[road.id] = out; try { localStorage.setItem(K, JSON.stringify(s)); } catch (_) { say('Penyimpanan penuh; hasil hanya di layar'); }
    draw(); return out;
  }

  function draw() {
    const m = window.map; if (!m || !window.L) return;
    if (layer) layer.remove(); layer = L.layerGroup().addTo(m);
    const s = store(); Object.keys(s).forEach(id => s[id].forEach(x =>
      L.circleMarker([x.lat, x.lng], { radius: 6, color: '#fff', weight: 1, fillColor: COL[x.cls] || '#22d3ee', fillOpacity: .9 })
        .bindPopup('<b>' + x.cls + '</b> (' + Math.round(x.score * 100) + '%)<br>Jarak ±' + sta(x.d) + '<br>Luas ±' + x.area + ' m²').addTo(layer)));
  }

  function summarize(list) {
    const pr = price(), r = {}; list.forEach(x => { const o = r[x.cls] || (r[x.cls] = { n: 0, a: 0 }); o.n++; o.a += x.area; });
    let tot = 0; Object.keys(r).forEach(k => { r[k].cost = r[k].a * (pr[k] || 0); tot += r[k].cost; }); return { r, tot };
  }

  function panel() {
    const rs = (typeof roads !== 'undefined' ? roads : []);
    const w = el('div', 'position:fixed;inset:0;z-index:6000;background:#000a;display:flex;align-items:center;justify-content:center;padding:10px');
    const b = el('div', 'background:#071a26;color:#e6f1f7;border:1px solid #22d3ee55;border-radius:14px;width:min(560px,100%);max-height:92vh;overflow:auto;padding:14px;font:13px system-ui');
    const inp = 'background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:5px;width:100%;margin:3px 0 8px';
    b.innerHTML = '<div style="display:flex;justify-content:space-between"><b style="color:#22d3ee;font-size:15px">Scan video dashcam</b><button id="sx" style="background:none;border:0;color:#fff;font-size:20px;cursor:pointer">✕</button></div>' +
      'Ruas<select id="sr" style="' + inp + '">' + rs.map(r => '<option value="' + r.id + '">' + esc(r.name) + '</option>').join('') + '</select>' +
      'Video (direkam dari awal sampai akhir ruas)<input id="sf" type="file" accept="video/*" style="' + inp + '">' +
      'Log GPS .gpx (opsional; tanpa ini posisi diasumsikan dari kecepatan tetap)<input id="sgx" type="file" accept=".gpx" style="' + inp + '">' +
      '<label>Geser waktu video terhadap GPS (detik)<input id="sof" type="number" value="0" style="' + inp + '"></label>' +
      '<div style="display:flex;gap:8px"><label style="flex:1">Ambil frame tiap (detik)<input id="ss" type="number" min="0.5" step="0.5" value="1" style="' + inp + '"></label>' +
      '<label style="flex:1">Luas tampak/frame (m², asumsi)<input id="sm" type="number" min="5" value="' + frameM2() + '" style="' + inp + '"></label></div>' +
      '<div style="margin-bottom:8px">Harga Rp/m² (asumsi, sesuaikan HSPK): ' + Object.keys(COL).map(k => k + ' <input data-p="' + k + '" type="number" value="' + price()[k] + '" style="width:90px;background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:3px">').join(' · ') + '</div>' +
      '<div style="display:flex;gap:8px"><button id="sg" style="background:#0e7490;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer">Mulai scan</button><button id="sb" style="background:#7f1d1d;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer">Berhenti</button><button id="se" style="background:#15803d;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer">Ekspor Excel</button></div>' +
      '<div id="sp" style="margin:10px 0;color:#9bd">Model: ' + (window.PETAQU_MODEL ? 'siap' : '<b style="color:#f59e0b">belum diatur (PETAQU_MODEL)</b>') + '</div><div id="so"></div>';
    w.append(b); document.body.append(w);
    const $ = s => b.querySelector(s), close = () => { stop = true; w.remove(); };
    $('#sx').onclick = close; w.onclick = e => { if (e.target === w) close(); };
    const show = id => {
      const l = store()[id] || [], S = summarize(l);
      $('#so').innerHTML = l.length ? '<table style="width:100%;border-collapse:collapse"><tr style="color:#22d3ee;text-align:left"><th>Jenis</th><th>Jumlah</th><th>Luas ±m²</th><th>Biaya ±</th></tr>' +
        Object.keys(S.r).map(k => '<tr style="border-top:1px solid #ffffff14"><td>' + k + '</td><td>' + S.r[k].n + '</td><td>' + S.r[k].a.toFixed(1) + '</td><td>' + fmt(S.r[k].cost) + '</td></tr>').join('') +
        '</table><div style="margin-top:6px">Total perkiraan: <b>' + fmt(S.tot) + '</b></div>' : 'Belum ada hasil untuk ruas ini.';
    };
    $('#sr').onchange = () => show($('#sr').value); show($('#sr').value);
    $('#sb').onclick = () => { stop = true; };
    $('#sg').onclick = async () => {
      const f = $('#sf').files[0], road = rs.find(r => r.id === $('#sr').value); if (!f || !road) return say('Pilih ruas dan video dulu');
      localStorage.setItem(FK, $('#sm').value); const o = {}; b.querySelectorAll('[data-p]').forEach(i => o[i.dataset.p] = +i.value || 0); localStorage.setItem(PK, JSON.stringify(o));
      $('#sg').disabled = true;
      try { let G = null; const gf = $('#sgx').files[0]; if (gf) G = { trk: parseGpx(await gf.text()), off: +$('#sof').value || 0 };
        await scan(f, road, Math.max(.5, +$('#ss').value || 1), (p, n, s) => $('#sp').textContent = 'Memproses ' + p + '% · ' + n + ' temuan' + (s ? ' · ' + s + ' frame dilewati (di luar jejak/ruas)' : ''), G); $('#sp').textContent = 'Selesai.'; show(road.id); }
      catch (e) { $('#sp').innerHTML = '<span style="color:#f87171">' + esc(e.message) + '</span>'; }
      $('#sg').disabled = false;
    };
    $('#se').onclick = () => {
      const s = store(), pr = price(), rows = [['Ruas', 'Jenis', 'Skor', 'Jarak dari awal (m)', 'Lat', 'Lng', 'Luas ± (m2)', 'Biaya ± (Rp)']];
      Object.keys(s).forEach(id => { const rd = rs.find(r => r.id === id); s[id].forEach(x => rows.push([rd ? rd.name : id, x.cls, x.score, x.d, x.lat, x.lng, x.area, Math.round(x.area * (pr[x.cls] || 0))])); });
      if (rows.length < 2) return say('Belum ada hasil');
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Deteksi'); XLSX.writeFile(wb, 'deteksi-kerusakan-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    };
  }

  window.PETAQU_SCAN = { open: panel, data: store, summarize, redraw: draw };
  function init() {
    const b = el('button', '', '<i class="fa-solid fa-video"></i>'); b.title = 'Scan video dashcam (deteksi kerusakan)'; b.onclick = panel;
    if (window.PQ_DOCK) PQ_DOCK.adopt(b, 'Scan video'); draw();
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
