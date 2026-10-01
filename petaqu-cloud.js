/* Sinkron awan via Supabase REST (tanpa SDK). Isi window.PETAQU_CFG = {url:'https://xxx.supabase.co', anon:'<anon key>'} sebelum skrip ini. Skema: supabase-schema.sql */
(function () {
  'use strict';
  const C = () => window.PETAQU_CFG, SK = 'pq_cloud_session';
  const sess = () => { try { return JSON.parse(localStorage.getItem(SK)); } catch (_) { return null; } };
  const hdr = () => { const s = sess(); return { apikey: C().anon, Authorization: 'Bearer ' + (s ? s.access_token : C().anon), 'Content-Type': 'application/json' }; };
  async function api(path, opt) { const r = await fetch(C().url + path, Object.assign({ headers: hdr() }, opt)); if (r.status === 401) { localStorage.removeItem(SK); throw new Error('Sesi habis, login ulang'); } if (!r.ok) throw new Error(path + ' → ' + r.status + ' ' + (await r.text()).slice(0, 120)); return r.status === 204 ? null : r.json(); }
  const say = m => { try { toast(m, 3500); } catch (_) { alert(m); } };
  const P = {
    async login(email, pass) {
      const r = await fetch(C().url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: C().anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) });
      if (!r.ok) throw new Error('Login gagal'); const j = await r.json(); localStorage.setItem(SK, JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, uid: j.user.id, email })); return j.user.email;
    },
    async push() {   // kirim ruas yang lebih baru dari awan (last-write-wins per ruas)
      const rows = roads.map(r => ({ id: r.id, name: r.name, kabupaten: r.kabupaten || null, data: r, updated_by: sess().uid }));
      await api('/rest/v1/roads?on_conflict=id', { method: 'POST', headers: Object.assign(hdr(), { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(rows) });
      say('Terkirim ' + rows.length + ' ruas ke awan');
    },
    async pull() {
      const rows = await api('/rest/v1/roads?select=id,data,updated_at'); let n = 0;
      rows.forEach(x => { const i = roads.findIndex(r => r.id === x.id); if (i < 0) { roads.push(x.data); n++; } else if (JSON.stringify(roads[i]) !== JSON.stringify(x.data)) { roads[i] = x.data; n++; } });
      if (n) { persist(); say(n + ' ruas diperbarui dari awan, memuat ulang…'); setTimeout(() => location.reload(), 1200); } else say('Sudah sinkron');
    },
    logout() { localStorage.removeItem(SK); say('Keluar dari awan'); }
  };
  window.PETAQU_CLOUD = P;
  function init() {
    if (!C()) return;
    const b = document.createElement('button'); b.innerHTML = '<i class="fa-solid fa-cloud"></i>'; b.title = 'Sinkron awan (klik: kirim/tarik)';
    b.style.cssText = 'position:fixed;right:10px;bottom:240px;z-index:3900;width:44px;height:44px;border-radius:50%;border:0;background:#0e7490;color:#fff;font-size:18px;box-shadow:0 2px 10px #0006;cursor:pointer';
    b.onclick = async () => { try {
      if (!sess()) { const e = prompt('Email akun awan:'), p = e && prompt('Kata sandi:'); if (!p) return; say('Masuk sebagai ' + await P.login(e, p)); }
      const a = (prompt('Ketik: 1 = Kirim data ke awan, 2 = Tarik data dari awan, 3 = Keluar') || '').trim();
      if (a === '1') await P.push(); else if (a === '2') await P.pull(); else if (a === '3') P.logout();
    } catch (e) { say(e.message); } };
    document.body.append(b);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
