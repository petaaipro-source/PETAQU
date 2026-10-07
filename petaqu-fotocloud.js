/* PETAQU – FOTO PEKERJAAN ⇄ SUPABASE (bucket "foto-proyek" + tabel project_photos)
   • Kirim foto geotag yang ada di perangkat ke cloud, lengkap dengan paket, jenis pekerjaan, tahap & progres.
   • Ambil foto dari cloud (hanya untuk dilihat selama sesi; tidak memenuhi penyimpanan perangkat).
   Memakai sesi login yang sama (pq_cloud_session) dan RLS dari supabase-foto-proyek.sql.
   Peran: admin/surveyor boleh kirim; admin/surveyor/viewer boleh melihat. */
(function () {
  "use strict";
  if (window.PQ_FOTOCLOUD) return;
  var BUCKET = "foto-proyek", SK = "pq_cloud_session", LAST = "pq_fc_last_v1";
  var JENIS = {
    persiapan: "Persiapan / pembersihan", galian: "Galian", timbunan: "Timbunan", lpa: "Lapis Pondasi Agregat (LPA)",
    prime: "Prime / Tack coat", ac_base: "AC-Base", ac_bc: "AC-BC", ac_wc: "AC-WC", rigid: "Perkerasan Rigid", drainase: "Drainase / Gorong-gorong",
    bahu: "Bahu jalan", marka: "Marka & Rambu", jb_pondasi: "Jembatan – Pondasi", jb_pilar: "Jembatan – Pilar/Abutment",
    jb_girder: "Jembatan – Girder", jb_lantai: "Jembatan – Lantai", jb_lain: "Jembatan – Lainnya", kondisi: "Kondisi eksisting", lainnya: "Lainnya"
  };
  var TAHAP = { sebelum: "Sebelum (0%)", sedang: "Sedang dikerjakan", sesudah: "Sesudah (selesai)" };
  window.PQ_JENIS = JENIS;

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function say(m, err) { try { toast(m, !!err); } catch (e) { alert(m); } }
  function cfg() { return window.PETAQU_CFG; }
  function sess() { try { return JSON.parse(localStorage.getItem(SK)); } catch (e) { return null; } }
  function H(extra) { var s = sess(); return Object.assign({ apikey: cfg().anon, Authorization: "Bearer " + (s ? s.access_token : cfg().anon) }, extra || {}); }
  function F() { return window.PQ_FOTO; }

  async function ensureSession() {
    if (!cfg()) throw new Error("Konfigurasi Supabase belum diisi.");
    var s = sess(); if (!s || !s.access_token) throw new Error("Belum login. Masuk dulu ke akun PETAQU.");
    if (s.exp && s.exp - Date.now() < 6e4 && s.refresh_token) {
      try {
        var r = await fetch(cfg().url + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { apikey: cfg().anon, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
        if (r.ok) { var d = await r.json(); localStorage.setItem(SK, JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token, uid: s.uid, email: s.email, exp: Date.now() + (d.expires_in || 3600) * 1e3 })); }
      } catch (e) {}
    }
    return sess();
  }
  function isoOf(t) {
    if (!t) return null;
    var v = /^\d{4}:\d{2}:\d{2}/.test(t) ? String(t).replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3").replace(" ", "T") : t;
    var d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function pending() { var f = F(); return f ? f.get().filter(function (x) { return !x.cloud && !x.tmp; }) : []; }

  /* ---------- modal ---------- */
  function css() {
    if ($("pqFcCss")) return;
    var st = document.createElement("style"); st.id = "pqFcCss";
    st.textContent = "#pqFcModal{position:fixed;inset:0;z-index:7000;background:#03060ccc;backdrop-filter:blur(5px);display:none;align-items:center;justify-content:center;padding:14px}#pqFcModal.show{display:flex}" +
      ".pqfc-box{width:100%;max-width:420px;max-height:calc(100dvh - 28px);overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;color:var(--text);box-shadow:0 24px 70px #000a}" +
      ".pqfc-box h3{margin:0 0 4px;font-family:var(--display);font-size:16px}.pqfc-box p{margin:0 0 12px;font-size:12px;color:var(--text-dim);line-height:1.5}" +
      ".pqfc-box label{display:block;font-size:11px;font-weight:700;margin:9px 0 3px;color:var(--text-dim)}.pqfc-box input,.pqfc-box select{width:100%;box-sizing:border-box;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;font:600 12.5px var(--mono)}" +
      ".pqfc-row{display:flex;gap:8px}.pqfc-row>div{flex:1}.pqfc-bar{height:7px;border-radius:5px;background:var(--panel-2);overflow:hidden;margin:12px 0 4px}.pqfc-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#22d3ee,#34d399);transition:width .2s}" +
      ".pqfc-st{font-size:11.5px;min-height:16px;color:#fde68a;word-break:break-word}.pqfc-btns{display:flex;gap:8px;margin-top:14px}.pqfc-btns button{flex:1;padding:10px;border-radius:9px;border:1px solid var(--line);background:var(--panel-2);color:var(--text);font:700 12px var(--mono);cursor:pointer}.pqfc-btns .ok{flex:1.6;background:linear-gradient(135deg,var(--cyan-dim),var(--blue));border:0;color:#fff}.pqfc-btns button:disabled{opacity:.5;cursor:default}";
    document.head.appendChild(st);
    var o = document.createElement("div"); o.id = "pqFcModal"; document.body.appendChild(o);
    o.addEventListener("click", function (e) { if (e.target === o && !RUN) close(); });
  }
  var RUN = false;
  function close() { var o = $("pqFcModal"); o && o.classList.remove("show"); }
  function opts(map, sel) { return Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" + esc(map[k]) + "</option>"; }).join(""); }

  function openSend() {
    var f = F(); if (!f) return say("Modul foto belum siap.", true);
    var list = pending();
    if (!list.length) return say(f.get().length ? "Semua foto sudah ada di cloud." : "Belum ada foto untuk dikirim.");
    css();
    var last = {}; try { last = JSON.parse(localStorage.getItem(LAST) || "{}"); } catch (e) {}
    var o = $("pqFcModal");
    o.innerHTML = '<div class="pqfc-box"><h3><i class="fa-solid fa-cloud-arrow-up" style="color:var(--cyan)"></i> Kirim foto ke Cloud</h3>' +
      '<p><b>' + list.length + ' foto</b> belum terkirim. Isian di bawah dipakai untuk semua foto yang dikirim sekarang (bisa dibedakan dengan mengirim per kelompok).</p>' +
      '<label>Paket pekerjaan</label><input id="pqFcPaket" placeholder="mis. Paket 01 – Preservasi Jalan ..." value="' + esc(last.paket || "") + '">' +
      '<label>Jenis pekerjaan</label><select id="pqFcJenis">' + opts(JENIS, last.jenis || "ac_wc") + '</select>' +
      '<div class="pqfc-row"><div><label>Tahap</label><select id="pqFcTahap">' + opts(TAHAP, last.tahap || "sedang") + '</select></div>' +
      '<div><label>Progres (%)</label><input id="pqFcProg" type="number" min="0" max="100" value="' + (last.progres != null ? last.progres : 50) + '"></div></div>' +
      '<label>Catatan (opsional)</label><input id="pqFcCat" placeholder="mis. hamparan lapis 2, STA 3+100" value="">' +
      '<div class="pqfc-bar"><i id="pqFcBar"></i></div><div class="pqfc-st" id="pqFcSt"></div>' +
      '<div class="pqfc-btns"><button type="button" id="pqFcCancel">Tutup</button><button type="button" class="ok" id="pqFcGo"><i class="fa-solid fa-cloud-arrow-up"></i> Kirim ' + list.length + ' foto</button></div></div>';
    o.classList.add("show");
    $("pqFcCancel").onclick = function () { if (!RUN) close(); };
    $("pqFcGo").onclick = function () { doSend(); };
  }

  async function doSend() {
    if (RUN) return;
    var f = F(), list = pending(); if (!list.length) return;
    var meta = { paket: $("pqFcPaket").value.trim(), jenis: $("pqFcJenis").value, tahap: $("pqFcTahap").value, progres: Math.max(0, Math.min(100, +$("pqFcProg").value || 0)), catatan: $("pqFcCat").value.trim() };
    try { localStorage.setItem(LAST, JSON.stringify({ paket: meta.paket, jenis: meta.jenis, tahap: meta.tahap, progres: meta.progres })); } catch (e) {}
    var go = $("pqFcGo"), st = $("pqFcSt"), bar = $("pqFcBar"), ok = 0, fail = 0, lastErr = "";
    RUN = true; go.disabled = true; $("pqFcCancel").disabled = true;
    try {
      var s = await ensureSession(), yr = new Date().getFullYear();
      for (var n = 0; n < list.length; n++) {
        var p = list[n]; st.textContent = "Mengirim " + (n + 1) + " / " + list.length + " …"; bar.style.width = (n / list.length * 100) + "%";
        var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx").replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });
        var path = s.uid + "/" + yr + "/" + id + ".jpg";
        try {
          var blob = await (await fetch(p.dataUrl)).blob();
          var up = await fetch(cfg().url + "/storage/v1/object/" + BUCKET + "/" + path, { method: "POST", headers: H({ "Content-Type": "image/jpeg", "x-upsert": "false" }), body: blob });
          if (!up.ok) { var t1 = await up.text(); throw new Error(up.status === 400 || up.status === 403 ? "Akun tidak diizinkan mengunggah (butuh peran admin/surveyor). " + t1.slice(0, 80) : "Unggah gagal " + up.status + " " + t1.slice(0, 80)); }
          var near = f.near ? f.near(p) : null;
          var row = { id: id, paket: meta.paket || null, ruas_id: near ? near.id : null, ruas_nama: near ? near.name : null, jenis: meta.jenis, tahap: meta.tahap, progres: meta.progres, lat: p.lat, lng: p.lng, akurasi_m: p.accuracy || null, taken_at: isoOf(p.time), catatan: meta.catatan || null, nama_file: p.name || null, storage_path: path, size_bytes: blob.size };
          var ins = await fetch(cfg().url + "/rest/v1/project_photos", { method: "POST", headers: H({ "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify(row) });
          if (!ins.ok) { var t2 = await ins.text(); fetch(cfg().url + "/storage/v1/object/" + BUCKET + "/" + path, { method: "DELETE", headers: H() }).catch(function () {}); throw new Error("Simpan data gagal " + ins.status + " " + t2.slice(0, 80)); }
          p.cloud = { id: id, path: path }; p.meta = { jenis: meta.jenis, tahap: meta.tahap, progres: meta.progres, paket: meta.paket, catatan: meta.catatan };
          ok++;
        } catch (e) { fail++; lastErr = e.message || String(e); if (/diizinkan|401|JWT/i.test(lastErr)) break; }
      }
      f.save(); f.refresh(); bar.style.width = "100%";
    } catch (e) { lastErr = e.message || String(e); }
    RUN = false; go.disabled = false; $("pqFcCancel").disabled = false;
    var left = pending().length;
    st.style.color = fail ? "#fca5a5" : "#86efac";
    st.textContent = ok + " foto terkirim" + (fail ? ", " + fail + " gagal: " + lastErr : ".") + (left ? " Sisa belum terkirim: " + left + "." : "");
    go.innerHTML = left ? '<i class="fa-solid fa-rotate-right"></i> Coba lagi (' + left + ')' : '<i class="fa-solid fa-check"></i> Selesai';
    if (!left) go.onclick = function () { close(); };
    if (ok) say(ok + " foto tersimpan di Supabase.");
  }

  /* ---------- ambil dari cloud ---------- */
  async function pull() {
    var f = F(); if (!f) return say("Modul foto belum siap.", true);
    try {
      var s = await ensureSession();
      say("Mengambil daftar foto dari cloud …");
      var r = await fetch(cfg().url + "/rest/v1/project_photos?select=*&order=taken_at.desc.nullslast,created_at.desc&limit=200", { headers: H() });
      if (!r.ok) throw new Error("Gagal membaca data (" + r.status + "). Pastikan akun disetujui admin.");
      var rows = await r.json();
      var have = {}; f.get().forEach(function (x) { if (x.cloud) have[x.cloud.id] = 1; });
      rows = rows.filter(function (x) { return !have[x.id]; });
      if (!rows.length) return say("Tidak ada foto baru di cloud.");
      var sg = await fetch(cfg().url + "/storage/v1/object/sign/" + BUCKET, { method: "POST", headers: H({ "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: 600, paths: rows.map(function (x) { return x.storage_path; }) }) });
      if (!sg.ok) throw new Error("Gagal membuat tautan foto (" + sg.status + ").");
      var urls = {}; (await sg.json()).forEach(function (x) { if (x && x.signedURL && !x.error) urls[x.path] = cfg().url + "/storage/v1" + x.signedURL; });
      var n = 0;
      for (var k = 0; k < rows.length; k++) {
        var w = rows[k], u = urls[w.storage_path]; if (!u) continue;
        say("Mengunduh foto " + (k + 1) + " / " + rows.length + " …");
        try {
          var blob = await (await fetch(u)).blob();
          var du = await new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(blob); });
          f.add({ dataUrl: du, q: null, lat: w.lat, lng: w.lng, name: w.nama_file || ("cloud-" + w.id.slice(0, 8) + ".jpg"), time: w.taken_at || w.created_at, accuracy: w.akurasi_m, manual: false, tmp: true, cloud: { id: w.id, path: w.storage_path }, meta: { jenis: w.jenis, tahap: w.tahap, progres: w.progres, paket: w.paket, catatan: w.catatan } });
          n++;
        } catch (e) {}
      }
      f.refresh(); say(n + " foto dari cloud ditampilkan di peta (hanya selama sesi ini).");
    } catch (e) { say(e.message || String(e), true); }
  }

  window.PQ_FOTOCLOUD = { send: openSend, pull: pull, jenis: JENIS, tahap: TAHAP };
})();
