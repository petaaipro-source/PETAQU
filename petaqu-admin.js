/* PETAQU — Panel persetujuan akses (hanya tampil untuk peran 'admin').
   Akun baru berstatus 'pending' dan TIDAK punya akses sampai admin menyetujui di sini.
   Semua keputusan dijalankan server (RPC admin_* di supabase-akses-admin.sql); tombol ini hanya antarmuka.
   Tanpa SQL itu, panel menampilkan petunjuk dan tidak mengubah apa pun. */
(function () {
  "use strict";
  if (window.__pqAdmin) return;
  window.__pqAdmin = 1;

  var SK = "pq_cloud_session", btn = null, labelEl = null, panel = null, poll = 0, adminOk = false, tab = "tunggu", rows = [];
  var $ = function (id) { return document.getElementById(id); };
  function sess() { try { return JSON.parse(localStorage.getItem(SK)); } catch (e) { return null; } }
  function cfg() { return window.PETAQU_CFG; }
  function T(m, e) { try { toast(m, !!e); } catch (x) { /* abaikan */ } }

  async function api(path, opt) {
    var c = cfg(), s = sess();
    if (!c || !s || !s.access_token) throw { code: "nosess" };
    var r = await fetch(c.url + path, Object.assign({
      headers: { apikey: c.anon, Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" }
    }, opt || {}));
    if (r.status === 404) throw { code: "nosql" };
    if (r.status === 401 || r.status === 403) throw { code: "denied" };
    if (!r.ok) throw { code: "http", status: r.status };
    return r.status === 204 ? null : r.json();
  }
  var rpc = function (fn, body) { return api("/rest/v1/rpc/" + fn, { method: "POST", body: JSON.stringify(body || {}) }); };

  function rel(iso) {
    if (!iso) return "belum pernah";
    var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
    if (m < 1) return "baru saja";
    if (m < 60) return m + " mnt lalu";
    if (m < 1440) return Math.round(m / 60) + " jam lalu";
    return Math.round(m / 1440) + " hari lalu";
  }
  var STATUS = {
    pending: ["Menunggu izin", "#fbbf24"], trial: ["Uji coba selesai", "#fb923c"], blocked: ["Diblokir", "#f87171"],
    viewer: ["Aktif (lihat)", "#34d399"], surveyor: ["Aktif (surveyor)", "#34d399"], admin: ["Admin", "#22d3ee"]
  };
  function el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }

  /* ---------- tombol di dock + lencana jumlah menunggu ---------- */
  function setBadge(n) {
    if (!labelEl) return;
    labelEl.textContent = n > 0 ? "Persetujuan akses (" + n + ")" : "Persetujuan akses";
    if (btn) btn.style.background = n > 0 ? "#b45309" : "#0e7490";
  }
  function addButton() {
    if (btn || typeof PQ_DOCK === "undefined") return;
    btn = document.createElement("button");
    btn.innerHTML = '<i class="fa-solid fa-user-check"></i>';
    btn.title = "Setujui / blokir akun pengguna";
    btn.onclick = openPanel;
    PQ_DOCK.adopt(btn, "Persetujuan akses");
    labelEl = btn.querySelectorAll("span")[1] || null;
  }

  /* ---------- panel ---------- */
  function build() {
    if (panel) return;
    panel = el("div", "position:fixed;inset:0;z-index:5200;display:none;align-items:center;justify-content:center;background:#000a;padding:12px");
    panel.id = "pqAdminPanel";
    var box = el("div", "width:min(720px,100%);max-height:88vh;display:flex;flex-direction:column;background:#0f1521;border:1px solid #22d3ee55;border-radius:14px;color:#e6f1ff;font:13px/1.45 system-ui,sans-serif;box-shadow:0 12px 40px #000c");
    var head = el("div", "display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #ffffff18");
    head.appendChild(el("b", "flex:1;font-size:15px", "Persetujuan akses pengguna"));
    var rf = el("button", "background:transparent;border:1px solid #ffffff30;color:#e6f1ff;border-radius:8px;padding:5px 10px;cursor:pointer", "Segarkan");
    rf.onclick = function () { refresh(true); };
    var cl = el("button", "background:transparent;border:0;color:#e6f1ff;font-size:20px;cursor:pointer;padding:0 6px", "×");
    cl.onclick = function () { panel.style.display = "none"; };
    head.append(rf, cl);
    var tabs = el("div", "display:flex;gap:6px;padding:10px 14px 0");
    tabs.id = "pqAdminTabs";
    var list = el("div", "padding:10px 14px 14px;overflow:auto;display:flex;flex-direction:column;gap:8px");
    list.id = "pqAdminList";
    var note = el("div", "padding:8px 14px 12px;font-size:11px;color:#94a3b8;border-top:1px solid #ffffff12",
      "Akun baru otomatis berstatus “Menunggu izin” dan tidak bisa membuka aplikasi sampai kamu menyetujuinya. Memblokir mengeluarkan akun dari semua perangkat.");
    box.append(head, tabs, list, note);
    panel.appendChild(box);
    panel.addEventListener("click", function (e) { if (e.target === panel) panel.style.display = "none"; });
    document.body.appendChild(panel);
  }
  function group(r) { return r.role === "pending" || r.role === "trial" ? "tunggu" : r.role === "blocked" ? "blok" : "aktif"; }
  function render() {
    build();
    var cnt = { tunggu: 0, aktif: 0, blok: 0 };
    rows.forEach(function (r) { cnt[group(r)]++; });
    setBadge(cnt.tunggu);
    var tabs = $("pqAdminTabs"); tabs.textContent = "";
    [["tunggu", "Menunggu"], ["aktif", "Aktif"], ["blok", "Diblokir"]].forEach(function (t) {
      var b = el("button", "border-radius:16px;padding:5px 12px;cursor:pointer;font:600 12px system-ui;border:1px solid " + (tab === t[0] ? "#22d3ee" : "#ffffff30") +
        ";background:" + (tab === t[0] ? "#22d3ee" : "transparent") + ";color:" + (tab === t[0] ? "#04121a" : "#e6f1ff"), t[1] + " (" + cnt[t[0]] + ")");
      b.onclick = function () { tab = t[0]; render(); };
      tabs.appendChild(b);
    });
    var list = $("pqAdminList"); list.textContent = "";
    var sh = rows.filter(function (r) { return group(r) === tab; });
    if (!sh.length) list.appendChild(el("div", "color:#94a3b8;padding:18px 4px;text-align:center", tab === "tunggu" ? "Tidak ada akun yang menunggu persetujuan." : "Tidak ada data."));
    sh.forEach(function (r) { list.appendChild(card(r)); });
  }
  function card(r) {
    var st = STATUS[r.role] || [r.role, "#94a3b8"];
    var c = el("div", "display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border:1px solid #ffffff18;border-radius:10px;background:#0b1120");
    var info = el("div", "flex:1 1 220px;min-width:0");
    info.appendChild(el("div", "font-weight:700;overflow-wrap:anywhere", r.email || r.id));
    var chip = el("span", "display:inline-block;margin-right:8px;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;border:1px solid " + st[1] + ";color:" + st[1], st[0]);
    var meta = el("div", "margin-top:3px;font-size:11px;color:#94a3b8");
    meta.appendChild(chip);
    meta.appendChild(document.createTextNode("daftar " + rel(r.created_at) + " · masuk terakhir " + rel(r.last_sign_in_at) + (r.provider ? " · " + r.provider : "") + (r.trial_dipakai ? " · sudah pakai uji coba" : "")));
    info.appendChild(meta);
    c.appendChild(info);
    if (r.role === "admin") return c;
    var sel = el("select", "background:#0f1521;color:#e6f1ff;border:1px solid #ffffff30;border-radius:8px;padding:6px");
    [["viewer", "Lihat saja"], ["surveyor", "Surveyor (boleh ubah data)"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1];
      if (o[0] === r.role) op.selected = true; sel.appendChild(op);
    });
    var ok = el("button", "background:#16a34a;color:#fff;border:0;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer", r.role === "viewer" || r.role === "surveyor" ? "Simpan peran" : "Setujui");
    ok.onclick = function () { act(ok, "admin_setujui", { p_id: r.id, p_role: sel.value }, "Akses disetujui: " + r.email); };
    c.append(sel, ok);
    if (r.role !== "blocked") {
      var bl = el("button", "background:transparent;color:#f87171;border:1px solid #f87171;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer", "Blokir");
      bl.onclick = function () { if (confirm("Blokir " + (r.email || "akun ini") + "? Akun akan keluar dari semua perangkat.")) act(bl, "admin_blokir", { p_id: r.id }, "Akun diblokir: " + r.email); };
      c.appendChild(bl);
    }
    return c;
  }
  async function act(b, fn, body, okMsg) {
    b.disabled = true; b.style.opacity = ".6";
    try {
      var d = await rpc(fn, body);
      if (d && d.ok) { T(okMsg); await refresh(); }
      else { T("Ditolak server: " + ((d && d.reason) || "tidak diketahui"), true); b.disabled = false; b.style.opacity = ""; }
    } catch (e) { fail(e); b.disabled = false; b.style.opacity = ""; }
  }
  function fail(e) {
    T(e && e.code === "nosql" ? "Jalankan supabase-akses-admin.sql di Supabase dulu"
      : e && e.code === "denied" ? "Hanya admin yang boleh melakukan ini"
      : navigator.onLine === false ? "Tidak ada koneksi internet" : "Gagal menghubungi server", true);
  }
  async function refresh(manual) {
    try { rows = await rpc("admin_daftar_pengguna"); render(); if (manual) T("Daftar diperbarui"); }
    catch (e) { if (manual || (e && e.code !== "http")) fail(e); }
  }
  function openPanel() { build(); panel.style.display = "flex"; render(); refresh(); }

  /* ---------- aktif hanya bila yang login adalah admin ---------- */
  async function cekAdmin() {
    var s = sess();
    if (!s || !s.uid || localStorage.getItem("peta_auth_ok") !== "1") { adminOk = false; return; }
    if (adminOk) return;
    try {
      var r = await api("/rest/v1/profiles?select=role&id=eq." + encodeURIComponent(s.uid));
      if (r && r[0] && r[0].role === "admin") {
        adminOk = true; addButton(); refresh();
        if (!poll) poll = setInterval(function () { if (adminOk && document.visibilityState === "visible") refresh(); }, 6e4);   // lencana jumlah menunggu diperbarui tiap menit
      }
    } catch (e) { /* bukan admin / offline: tidak ada tombol */ }
  }
  window.addEventListener("pq-login", function () { setTimeout(cekAdmin, 300); });
  function boot() { setTimeout(cekAdmin, 1200); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
