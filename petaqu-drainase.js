/* PETAQU Drainase — lapisan drainase interaktif & cerdas.
   Aset: saluran, bendungan/waduk, pintu air, gorong-gorong, embung/kolam retensi, inlet/outlet.
   Kecerdasan (tanpa API key, gratis; elevasi & hujan dari Open-Meteo):
     • Kapasitas hidrolik (Manning) vs debit rencana (Rasional Q=0,278·C·i·A) -> status Aman/Waspada/Kritis/Meluap
     • Kemiringan & arah aliran otomatis dari elevasi (DEM); panah aliran beranimasi searah air
     • Simulasi hujan (slider) + ambil prakiraan hujan live; warna saluran berubah langsung
     • Prioritas penanganan, kedekatan dengan ruas jalan, cakupan drainase per ruas
     • Cari titik cekungan/potensi genangan pada area peta + saran
     • Eksposur hilir bendungan (ruas & jembatan yang lebih rendah)
   Indikatif untuk prioritas inspeksi; bukan pengganti desain teknis/hidrologi resmi. */
(function () {
  "use strict";
  if (window.PETAQU_DRAINASE) return;
  const KEY = "petaqu_drainase_v1";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = m => { try { toast(m, 3200); } catch (e) { console.log("[drainase]", m); } };
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const num = (v, d) => { const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : d; };
  const getMap = () => { try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) { } return window.map && window.map.addLayer ? window.map : null; };

  const KIND = {
    saluran: { n: "Saluran", ic: "fa-grip-lines", c: "#38bdf8", line: 1 },
    bendungan: { n: "Bendungan / Waduk", ic: "fa-water", c: "#6366f1" },
    pintu: { n: "Pintu Air", ic: "fa-door-closed", c: "#f59e0b" },
    gorong: { n: "Gorong-gorong", ic: "fa-circle-notch", c: "#a78bfa" },
    embung: { n: "Embung / Kolam Retensi", ic: "fa-droplet", c: "#22d3ee" },
    inlet: { n: "Inlet / Outlet", ic: "fa-arrow-down", c: "#34d399" }
  };
  const MAT = { beton: ["Beton", .013], pasangan: ["Pasangan batu", .025], tanah: ["Tanah", .03], pipa: ["Pipa PVC/HDPE", .011] };
  const KF = { baik: 1, sedang: .9, rusak: .7 };
  const ST = [[.7, "Aman", "#22c55e"], [1, "Waspada", "#facc15"], [1.3, "Kritis", "#f97316"], [1e9, "Meluap", "#ef4444"]];
  const LVL = { normal: ["Normal", "#22c55e"], waspada: ["Waspada", "#facc15"], siaga: ["Siaga", "#f97316"], awas: ["Awas", "#ef4444"] };
  const sel = (o) => o.map(x => [x[0], x[1]]);
  const KOND = [["baik", "Baik"], ["sedang", "Sedang (sedimen/retak)"], ["rusak", "Rusak"]];
  const FIELDS = {
    saluran: [["tipe", "Tipe", "s", [["terbuka", "Terbuka"], ["tertutup", "Tertutup (box)"], ["pipa", "Pipa"]]], ["mat", "Material", "s", Object.keys(MAT).map(k => [k, MAT[k][0]])], ["b", "Lebar dasar (m)", "n"], ["h", "Tinggi/dalam (m)", "n"], ["d", "Diameter pipa (m)", "n"], ["sed", "Sedimen/sampah (%)", "n"], ["s", "Kemiringan (%) — kosong = dari DEM", "n"], ["A", "Luas tangkapan (ha) — kosong = otomatis", "n"], ["C", "Koef. limpasan C — kosong = umum", "n"], ["kond", "Kondisi", "s", KOND]],
    gorong: [["tipe", "Bentuk", "s", [["pipa", "Pipa bulat"], ["tertutup", "Box"]]], ["mat", "Material", "s", Object.keys(MAT).map(k => [k, MAT[k][0]])], ["d", "Diameter (m)", "n"], ["b", "Lebar box (m)", "n"], ["h", "Tinggi box (m)", "n"], ["L", "Panjang (m)", "n"], ["sed", "Sedimen/sampah (%)", "n"], ["s", "Kemiringan (%)", "n"], ["A", "Luas tangkapan (ha)", "n"], ["kond", "Kondisi", "s", KOND]],
    bendungan: [["kap", "Kapasitas (juta m³)", "n"], ["tinggi", "Tinggi bendung (m)", "n"], ["tahun", "Tahun dibangun", "n"], ["fill", "Terisi (%)", "n"], ["lvl", "Status siaga", "s", Object.keys(LVL).map(k => [k, LVL[k][0]])], ["kond", "Kondisi", "s", KOND]],
    pintu: [["stat", "Status", "s", [["buka", "Terbuka"], ["tutup", "Tertutup"], ["rusak", "Rusak"]]], ["lebar", "Lebar bukaan (m)", "n"], ["kond", "Kondisi", "s", KOND]],
    embung: [["kap", "Kapasitas (m³)", "n"], ["fill", "Terisi (%)", "n"], ["kond", "Kondisi", "s", KOND]],
    inlet: [["jenis", "Jenis", "s", [["inlet", "Inlet (masuk)"], ["outlet", "Outlet (keluar)"]]], ["kond", "Kondisi", "s", KOND]]
  };
  const DEF = {
    saluran: { tipe: "terbuka", mat: "pasangan", b: .6, h: .6, d: .6, sed: 0, kond: "baik" },
    gorong: { tipe: "pipa", mat: "beton", d: .8, b: 1, h: 1, L: 8, sed: 0, kond: "baik" },
    bendungan: { kap: 1, tinggi: 15, fill: 60, lvl: "normal", kond: "baik" },
    pintu: { stat: "buka", lebar: 1, kond: "baik" },
    embung: { kap: 5000, fill: 40, kond: "baik" },
    inlet: { jenis: "inlet", kond: "baik" }
  };

  let DB = [], pref = { on: true, i: 80, C: .75, w: 60 };
  let G = null, R = null, DRAW = null, open = false, view = "list", editId = null, extra = null, byId = {};
  function load() { try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); if (j) { DB = j.db || []; Object.assign(pref, j.pref || {}); } } catch (e) { } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ db: DB, pref })); } catch (e) { say("Gagal menyimpan data drainase"); } }
  const uid = () => "dn" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  /* ---------- geodesi ---------- */
  const hav = (a, b) => { const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dg = (b[1] - a[1]) * r, x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dg / 2) ** 2; return 12742000 * Math.asin(Math.min(1, Math.sqrt(x))); };
  const plen = p => { let s = 0; for (let i = 1; i < p.length; i++) s += hav(p[i - 1], p[i]); return s; };
  function dSeg(q, a, b) { /* jarak titik ke segmen (m), bidang lokal */
    const k = Math.cos(q[0] * Math.PI / 180), X = (p) => [(p[1] - q[1]) * 111320 * k, (p[0] - q[0]) * 110540];
    const A = X(a), B = X(b), dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy;
    let t = l2 ? clamp(-(A[0] * dx + A[1] * dy) / l2, 0, 1) : 0;
    return Math.hypot(A[0] + t * dx, A[1] + t * dy);
  }
  function dAsset(q, it) { if (!it.pts) return hav(q, it.ll); let m = 1e12; for (let i = 1; i < it.pts.length; i++) m = Math.min(m, dSeg(q, it.pts[i - 1], it.pts[i])); return m; }
  const ctr = it => it.ll || it.pts[Math.floor(it.pts.length / 2)];
  function roadPts(bounds) { const o = []; try { (roads || []).forEach(r => (r.points || []).forEach(q => { if (!bounds || bounds.contains([q.lat, q.lng])) o.push([q.lat, q.lng, r.name]); })); } catch (e) { } return o; }
  function bridges() { try { return (JEMBATAN_DB || []).filter(j => j.lat != null).map(j => [+j.lat, +j.lng, j.nama || "Jembatan"]); } catch (e) { return []; } }

  /* ---------- hidrolika ---------- */
  function hyd(it) {
    const p = it.p || {}, line = !!it.pts;
    const L = line ? Math.max(1, plen(it.pts)) : (p.L || 8);
    let s = p.s > 0 ? p.s / 100 : (it.z && it.z[0] != null && it.z[1] != null && L > 5 ? Math.abs(it.z[0] - it.z[1]) / L : 0), asumsi = false;
    if (!(s > .0002)) { s = .002; asumsi = true; }
    const n = (MAT[p.mat] || MAT.pasangan)[1], sed = clamp(num(p.sed, 0), 0, 90) / 100;
    let A, P;
    if (p.tipe === "pipa") { const d = p.d || .6; A = Math.PI * d * d / 4 * (1 - sed); P = Math.PI * d; }
    else { const b = p.b || .5, h = (p.h || .5) * (1 - sed) * .85; A = b * h; P = b + 2 * h; }
    const Rh = A / P, Qc = (1 / n) * A * Math.pow(Rh, 2 / 3) * Math.sqrt(s) * (KF[p.kond] || 1);
    const km2 = p.A > 0 ? p.A / 100 : (line ? L * 2 * pref.w / 1e6 : 2 / 100), C = p.C > 0 ? p.C : pref.C;
    const Qd = .278 * C * pref.i * km2, ratio = Qc > 0 ? Qd / Qc : 9;
    return { L, s, asumsi, A, Qc, Qd, ratio, v: A > 0 ? Qc / A : 0, km2, C };
  }
  const stat = r => ST.find(x => r < x[0]);
  function info(it) {
    if (it.k === "saluran" || it.k === "gorong") { const h = hyd(it), s = stat(h.ratio); return { h, s: s[1], c: s[2] }; }
    if (it.k === "bendungan") { const l = LVL[it.p.lvl] || LVL.normal; return { s: l[0], c: l[1] }; }
    if (it.k === "pintu") { const m = { buka: ["Terbuka", "#22c55e"], tutup: ["Tertutup", "#f59e0b"], rusak: ["Rusak", "#ef4444"] }[it.p.stat] || ["-", "#94a3b8"]; return { s: m[0], c: m[1] }; }
    if (it.k === "embung") { const f = num(it.p.fill, 0); return { s: f + "% terisi", c: f > 90 ? "#ef4444" : f > 70 ? "#f59e0b" : "#22d3ee" }; }
    return { s: it.p.kond === "rusak" ? "Rusak" : "OK", c: it.p.kond === "rusak" ? "#ef4444" : "#34d399" };
  }
  const f2 = (v, d = 2) => isFinite(v) ? (+v).toLocaleString("id-ID", { maximumFractionDigits: d }) : "-";
  function score(it, RP) {
    let sc = 0; const i = info(it);
    if (i.h) sc += Math.min(60, i.h.ratio * 45);
    if (it.p.kond === "rusak") sc += 25; else if (it.p.kond === "sedang") sc += 10;
    if (it.k === "bendungan") sc += ({ normal: 0, waspada: 20, siaga: 40, awas: 60 })[it.p.lvl] || 0;
    if (RP && RP.length) { const n = nearest(ctr(it), RP); if (n && n.d < 40) sc += 15; }
    return Math.round(sc);
  }
  function nearest(q, P) { let b = null, bd = 1e12; for (let i = 0; i < P.length; i++) { const a = P[i][0] - q[0], c = P[i][1] - q[1]; if (Math.abs(a) > .05 || Math.abs(c) > .05) continue; const d = hav(q, P[i]); if (d < bd) { bd = d; b = P[i]; } } return b ? { d: bd, n: b[2], p: b } : null; }

  /* ---------- elevasi (Open-Meteo, gratis) ---------- */
  async function elev(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i += 100) {
      const c = pts.slice(i, i + 100);
      const u = "https://api.open-meteo.com/v1/elevation?latitude=" + c.map(p => p[0].toFixed(5)).join(",") + "&longitude=" + c.map(p => p[1].toFixed(5)).join(",");
      const r = await fetch(u); if (!r.ok) throw new Error("elevasi " + r.status);
      const j = await r.json(); (j.elevation || []).forEach(z => out.push(z));
    }
    return out;
  }

  /* ---------- peta ---------- */
  function ensureMap() {
    const m = getMap(); if (!m) return null;
    if (!G) {
      m.createPane("dnPane").style.zIndex = 455;
      R = L.svg({ pane: "dnPane" }); G = L.layerGroup();
      m.on("click", onClick); m.on("dblclick", onDbl);
      m.on("mousemove", e => { if (DRAW && DRAW.line && DRAW.pts.length) { if (!DRAW.rub) DRAW.rub = L.polyline([], { color: "#fff", weight: 2, dashArray: "4 6", interactive: false }).addTo(m); DRAW.rub.setLatLngs([DRAW.pts[DRAW.pts.length - 1], [e.latlng.lat, e.latlng.lng]]); } });
      draw();
    }
    return m;
  }
  function icon(it, c) {
    const k = KIND[it.k];
    return L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 15], html: '<div class="dn-pin" style="--c:' + c + '"><i class="fa-solid ' + k.ic + '"></i></div>' });
  }
  function popup(it) {
    const i = info(it), k = KIND[it.k], p = it.p || {};
    let b = '<div class="dn-pop"><b>' + esc(it.name || k.n) + '</b><small>' + k.n + '</small><div class="dn-chip" style="--c:' + i.c + '">' + esc(i.s) + '</div>';
    if (i.h) {
      b += '<div><span>Kapasitas</span> ' + f2(i.h.Qc, 3) + ' m³/s</div><div><span>Debit rencana</span> ' + f2(i.h.Qd, 3) + ' m³/s (i=' + pref.i + ' mm/j)</div><div><span>Rasio Q/Qc</span> ' + f2(i.h.ratio) + '</div><div><span>Kecepatan</span> ' + f2(i.h.v) + ' m/s</div><div><span>Kemiringan</span> ' + f2(i.h.s * 100, 2) + '%' + (i.h.asumsi ? ' (asumsi)' : '') + '</div>' + (it.pts ? '<div><span>Panjang</span> ' + f2(i.h.L, 0) + ' m</div>' : '') + (it.z ? '<div><span>Elevasi hulu→hilir</span> ' + f2(it.z[0], 1) + ' → ' + f2(it.z[1], 1) + ' m</div>' : '');
    } else if (it.k === "bendungan") b += '<div><span>Kapasitas</span> ' + f2(p.kap) + ' juta m³</div><div><span>Tinggi</span> ' + f2(p.tinggi) + ' m</div><div><span>Terisi</span> ' + f2(p.fill, 0) + '%</div>' + (p.tahun ? '<div><span>Tahun</span> ' + esc(p.tahun) + '</div>' : '');
    else if (it.k === "embung") b += '<div><span>Kapasitas</span> ' + f2(p.kap, 0) + ' m³</div>';
    if (it.p.cat) b += '<div><span>Catatan</span> ' + esc(it.p.cat) + '</div>';
    b += '<div class="dn-act"><button onclick="PETAQU_DRAINASE.edit(\'' + it.id + '\')">Edit</button>' + (it.k === "bendungan" ? '<button onclick="PETAQU_DRAINASE.expos(\'' + it.id + '\')">Eksposur hilir</button>' : '') + '<button class="x" onclick="PETAQU_DRAINASE.del(\'' + it.id + '\')">Hapus</button></div></div>';
    return b;
  }
  function draw() {
    const m = getMap(); if (!m || !G) return;
    G.clearLayers(); byId = {};
    DB.forEach(it => {
      const i = info(it); let ly;
      if (it.pts) {
        const base = L.polyline(it.pts, { renderer: R, pane: "dnPane", color: i.c, weight: 6, opacity: .92, lineCap: "round" }).bindPopup(popup(it), { className: "dn-popw" });
        const fl = L.polyline(it.pts, { renderer: R, pane: "dnPane", color: "#fff", weight: 2, opacity: .85, className: "dn-flow", interactive: false });
        ly = L.layerGroup([base, fl]);
      } else ly = L.marker(it.ll, { icon: icon(it, i.c), title: it.name || KIND[it.k].n }).bindPopup(popup(it), { className: "dn-popw" });
      byId[it.id] = ly; G.addLayer(ly);
    });
    if (pref.on) G.addTo(m); else m.removeLayer(G);
    render();
  }
  function refreshStyle() { draw(); }

  /* ---------- menggambar ---------- */
  function startDraw(kind) {
    const m = ensureMap(); if (!m) return say("Peta belum siap");
    try { if (typeof editMode !== "undefined" && editMode) return say("Matikan Mode Edit ruas dulu sebelum menggambar drainase"); } catch (e) { }
    stopDraw(true); pref.on = true; save(); draw();
    DRAW = { kind, line: !!KIND[kind].line, pts: [], tmp: null, rub: null };
    m.doubleClickZoom.disable(); m.getContainer().style.cursor = "crosshair";
    say(DRAW.line ? "Klik titik-titik saluran searah aliran air. Klik ganda / tombol Selesai untuk mengakhiri." : "Klik di peta untuk menempatkan " + KIND[kind].n);
    render();
  }
  function stopDraw(silent) {
    const m = getMap(); if (!DRAW) return;
    if (DRAW.tmp && m) m.removeLayer(DRAW.tmp); if (DRAW.rub && m) m.removeLayer(DRAW.rub);
    if (m) { m.doubleClickZoom.enable(); m.getContainer().style.cursor = ""; }
    DRAW = null; if (!silent) render();
  }
  function onClick(e) {
    if (TR.armed) { armTrace(false); trace(e.latlng); return; }
    if (!DRAW) return; const m = getMap(), q = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)];
    if (!DRAW.line) { const k = DRAW.kind; stopDraw(true); addItem({ id: uid(), k, name: "", ll: q, p: Object.assign({}, DEF[k]) }); return; }
    DRAW.pts.push(q);
    if (!DRAW.tmp) DRAW.tmp = L.polyline([], { color: "#38bdf8", weight: 4, interactive: false }).addTo(m);
    DRAW.tmp.setLatLngs(DRAW.pts); render();
  }
  function onDbl() { if (DRAW && DRAW.line) finishLine(); }
  function finishLine() {
    if (!DRAW) return; let p = DRAW.pts.filter((q, i, a) => !i || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]);
    if (p.length < 2) { say("Minimal 2 titik"); return; }
    const k = DRAW.kind; stopDraw(true);
    addItem({ id: uid(), k, name: "", pts: p, p: Object.assign({}, DEF[k]) });
  }
  function addItem(it) {
    it.name = KIND[it.k].n + " " + (DB.filter(x => x.k === it.k).length + 1);
    DB.push(it); save(); draw(); editId = it.id; view = "form"; open = true; render(); setOpen(true);
  }

  /* ---------- panel ---------- */
  function css() {
    const st = document.createElement("style"); st.id = "dnCss";
    st.textContent = "#dnPanel{position:fixed;left:var(--pq-fl,10px);top:calc(var(--pq-ft,66px) + 52px);z-index:1262;width:min(350px,calc(100vw - 20px));max-height:calc(100dvh - var(--pq-ft,66px) - 70px);overflow:auto;overscroll-behavior:contain;display:none;box-sizing:border-box;padding:12px;border-radius:14px;border:1px solid rgba(56,189,248,.35);background:#0a0e17f7;color:#dbe7f3;font:12.5px/1.4 system-ui,sans-serif;box-shadow:0 14px 40px #000a;backdrop-filter:blur(10px)}#dnPanel.open{display:block}" +
      "#dnPanel h4{margin:0 0 2px;font-size:14px;display:flex;align-items:center;gap:8px}#dnPanel h4 i{color:#38bdf8}#dnPanel h4 .x{margin-left:auto;background:0;border:0;color:#8fa6bd;font-size:20px;cursor:pointer}#dnPanel small{color:#8fa6bd}" +
      "#dnPanel .sec{margin:10px 0 4px;font:700 10px system-ui;letter-spacing:.8px;text-transform:uppercase;color:#8fa6bd}#dnPanel .g{display:grid;grid-template-columns:1fr 1fr;gap:6px}" +
      "#dnPanel button.b{padding:8px 6px;border-radius:9px;border:1px solid rgba(148,178,204,.28);background:#0f1726;color:#dbe7f3;font:600 11.5px system-ui;cursor:pointer;text-align:left;display:flex;gap:7px;align-items:center}#dnPanel button.b:hover{border-color:#38bdf8}#dnPanel button.b i{color:var(--c,#38bdf8);width:14px;text-align:center}#dnPanel button.pri{background:linear-gradient(135deg,#0ea5e9,#6366f1);border-color:transparent;color:#fff}" +
      "#dnPanel input,#dnPanel select,#dnPanel textarea{width:100%;box-sizing:border-box;background:#0f1726;border:1px solid rgba(148,178,204,.28);color:#e6edf5;border-radius:8px;padding:6px 8px;font:12px system-ui}#dnPanel label{display:block;margin:7px 0 2px;font-size:11px;color:#9fb0c8}" +
      "#dnPanel .it{display:flex;gap:8px;align-items:center;padding:6px 7px;border-radius:9px;cursor:pointer}#dnPanel .it:hover{background:#38bdf814}#dnPanel .dot{width:9px;height:9px;border-radius:50%;flex:none;background:var(--c)}#dnPanel .it b{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#dnPanel .it em{font-style:normal;font-size:10px;color:var(--c);font-weight:700}" +
      "#dnPanel .rep{margin-top:8px;padding:9px;border-radius:10px;background:#0f1726;border:1px solid rgba(148,178,204,.2);font-size:11.5px}#dnPanel .rep p{margin:3px 0}#dnPanel .rep h5{margin:8px 0 3px;font-size:11.5px;color:#7dd3fc}#dnPanel .rep a{color:#7dd3fc;cursor:pointer;text-decoration:underline}" +
      ".dn-pin{width:30px;height:30px;border-radius:50%;background:#0a0e17;border:2.5px solid var(--c);color:var(--c);display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 0 10px var(--c),0 3px 8px #0009}" +
      ".dn-flow{stroke-dasharray:3 13;animation:dnf .9s linear infinite}@keyframes dnf{to{stroke-dashoffset:-16}}@media(prefers-reduced-motion:reduce){.dn-flow{animation:none}}" +
      ".dn-pop{min-width:200px;font:12px/1.45 system-ui,sans-serif;color:#1f2937}.dn-pop b{font-size:13.5px;display:block}.dn-pop small{color:#64748b;display:block;margin-bottom:5px}.dn-pop span{color:#64748b}.dn-chip{display:inline-block;padding:2px 9px;border-radius:99px;background:var(--c);color:#111;font-weight:800;font-size:11px;margin:2px 0 5px}.dn-act{display:flex;gap:6px;margin-top:8px}.dn-act button{flex:1;padding:6px;border-radius:7px;border:1px solid #cbd5e1;background:#f1f5f9;cursor:pointer;font-weight:600}.dn-act .x{color:#dc2626}" +
      "body:has(.modal-overlay.show,#dashcam-modal:not(.hidden),#svOverlay.show,#arOverlay.show,#cmOverlay.show,#loginScreen:not(.hide),#welcomeSplash:not(.hide)) #dnPanel{display:none!important}@media(max-width:860px){body:has(#sidebar.open) #dnPanel{display:none!important}}";
    document.head.appendChild(st);
  }
  function setOpen(v) { open = !!v; const p = $("dnPanel"); if (p) p.classList.toggle("open", open); if (open) { ensureMap(); render(); } else if (DRAW) stopDraw(); }
  function field(f, v) {
    const [k, lb, t, o] = f, val = v[k] == null ? "" : v[k];
    if (t === "s") return '<label>' + lb + '</label><select data-f="' + k + '">' + o.map(x => '<option value="' + x[0] + '"' + (x[0] === val ? " selected" : "") + '>' + esc(x[1]) + '</option>').join("") + '</select>';
    return '<label>' + lb + '</label><input data-f="' + k + '" inputmode="decimal" value="' + esc(val) + '">';
  }
  function render() {
    const P = $("dnPanel"); if (!P) return;
    let h = '<h4><i class="fa-solid fa-droplet"></i> Drainase <button class="x" data-a="close" aria-label="Tutup">×</button></h4><small>Saluran, bendungan & aset drainase — dianalisis otomatis terhadap hujan.</small>';
    if (view === "form") {
      const it = DB.find(x => x.id === editId); if (!it) view = "list";
      else {
        h += '<div class="sec">Edit ' + KIND[it.k].n + '</div><label>Nama</label><input data-f="__name" value="' + esc(it.name) + '">' + (FIELDS[it.k] || []).map(f => field(f, it.p)).join("") + '<label>Catatan</label><textarea data-f="cat" rows="2">' + esc(it.p.cat || "") + '</textarea><div class="g" style="margin-top:10px"><button class="b pri" data-a="saveform"><i class="fa-solid fa-check"></i> Simpan</button><button class="b" data-a="cancelform"><i class="fa-solid fa-xmark"></i> Batal</button></div>';
        P.innerHTML = h; return;
      }
    }
    if (DRAW) h += '<div class="rep" style="border-color:#38bdf8"><b>Mode gambar: ' + KIND[DRAW.kind].n + '</b>' + (DRAW.line ? '<p>' + DRAW.pts.length + ' titik — klik searah aliran air.</p><div class="g"><button class="b pri" data-a="finish"><i class="fa-solid fa-check"></i> Selesai</button><button class="b" data-a="undo"><i class="fa-solid fa-rotate-left"></i> Undo titik</button></div>' : '<p>Klik peta untuk menempatkan.</p>') + '<button class="b" style="margin-top:6px;width:100%" data-a="cancel"><i class="fa-solid fa-ban"></i> Batalkan</button></div>';
    h += '<div class="sec">Tambah aset (klik di peta)</div><div class="g">' + Object.keys(KIND).map(k => '<button class="b" style="--c:' + KIND[k].c + '" data-a="add:' + k + '"><i class="fa-solid ' + KIND[k].ic + '"></i>' + KIND[k].n + '</button>').join("") + '</div>';
    h += '<div class="sec">Simulasi hujan</div><label>Intensitas: <b id="dnIv">' + pref.i + '</b> mm/jam <small>(10 gerimis • 50 lebat • 100+ ekstrem)</small></label><input type="range" id="dnI" min="10" max="250" step="5" value="' + pref.i + '"><div class="g" style="margin-top:6px"><button class="b" data-a="live"><i class="fa-solid fa-cloud-showers-heavy" style="--c:#38bdf8"></i> Hujan live area peta</button><button class="b" data-a="toggle"><i class="fa-solid ' + (pref.on ? "fa-eye" : "fa-eye-slash") + '"></i> Lapisan ' + (pref.on ? "ON" : "OFF") + '</button></div>';
    h += '<div class="sec">Analisis cerdas</div><div class="g"><button class="b pri" data-a="analisis" style="grid-column:1/-1"><i class="fa-solid fa-wand-magic-sparkles" style="color:#fff"></i> Analisis semua aset</button><button class="b" data-a="genang"><i class="fa-solid fa-water" style="--c:#f97316"></i> Cari titik genangan</button><button class="b" data-a="cover"><i class="fa-solid fa-road" style="--c:#34d399"></i> Cakupan per ruas</button><button class="b" data-a="trace" style="grid-column:1/-1"><i class="fa-solid fa-route" style="--c:#0ea5e9"></i> Telusur aliran air (klik titik di peta)</button></div>';
    if (extra) h += '<div class="rep">' + extra + '</div>';
    h += '<div class="sec">Daftar aset (' + DB.length + ')</div>';
    h += DB.length ? DB.map(it => { const i = info(it); return '<div class="it" data-a="go:' + it.id + '" style="--c:' + i.c + '"><span class="dot"></span><b>' + esc(it.name) + '</b><em>' + esc(i.s) + '</em></div>'; }).join("") : '<small>Belum ada aset. Tambahkan lewat tombol di atas.</small>';
    h += '<div class="g" style="margin-top:10px"><button class="b" data-a="export"><i class="fa-solid fa-file-export"></i> Ekspor GeoJSON</button><button class="b" data-a="import"><i class="fa-solid fa-file-import"></i> Impor</button><button class="b" data-a="clear" style="grid-column:1/-1;--c:#f87171"><i class="fa-solid fa-trash"></i> Hapus semua aset drainase</button></div><input type="file" id="dnFile" accept=".geojson,.json" style="display:none">';
    P.innerHTML = h;
    const s = $("dnI"); if (s) { s.oninput = () => { $("dnIv").textContent = s.value; }; s.onchange = () => { pref.i = +s.value; save(); draw(); }; }
    const fi = $("dnFile"); if (fi) fi.onchange = doImport;
  }
  function onPanel(e) {
    const t = e.target.closest("[data-a]"); if (!t) return; const a = t.getAttribute("data-a"), m = getMap();
    if (a === "close") setOpen(false);
    else if (a.startsWith("add:")) startDraw(a.slice(4));
    else if (a === "finish") finishLine();
    else if (a === "undo") { if (DRAW && DRAW.pts.length) { DRAW.pts.pop(); DRAW.tmp && DRAW.tmp.setLatLngs(DRAW.pts); render(); } }
    else if (a === "cancel") stopDraw();
    else if (a === "toggle") { pref.on = !pref.on; save(); draw(); }
    else if (a === "live") hujanLive();
    else if (a === "analisis") analisis();
    else if (a === "genang") genangan();
    else if (a === "cover") cover();
    else if (a === "trace") armTrace(!TR.armed);
    else if (a === "traceclr") { if (TR.lg && m) m.removeLayer(TR.lg); TR.last = null; extra = null; render(); }
    else if (a === "trace2sal") { const r = TR.last; if (r && r.pts.length > 1) { let p = r.pts.filter((q, i) => i % 3 === 0 || i === r.pts.length - 1); if (TR.lg && m) m.removeLayer(TR.lg); extra = null; addItem({ id: uid(), k: "saluran", pts: p, z: [r.zs[0], r.zs[r.zs.length - 1]], p: Object.assign({}, DEF.saluran) }); } }
    else if (a.startsWith("go:")) go(a.slice(3));
    else if (a === "saveform") saveForm();
    else if (a === "cancelform") { view = "list"; render(); }
    else if (a === "export") doExport();
    else if (a === "import") $("dnFile").click();
    else if (a === "clear") { if (DB.length && confirm("Hapus SEMUA " + DB.length + " aset drainase?")) { DB = []; extra = null; save(); draw(); } }
    else if (a.startsWith("z:")) { const [la, ln] = a.slice(2).split(","); m && m.setView([+la, +ln], Math.max(m.getZoom(), 17)); }
  }
  function go(id) { const it = DB.find(x => x.id === id), m = getMap(); if (!it || !m) return; ensureMap(); if (it.pts) m.fitBounds(L.latLngBounds(it.pts), { maxZoom: 18, padding: [60, 60] }); else m.setView(it.ll, Math.max(m.getZoom(), 17)); const ly = byId[id]; setTimeout(() => { try { (ly.getLayers ? ly.getLayers()[0] : ly).openPopup(it.pts ? L.latLngBounds(it.pts).getCenter() : undefined); } catch (e) { } }, 350); }
  function saveForm() {
    const it = DB.find(x => x.id === editId); if (!it) return; const P = $("dnPanel");
    P.querySelectorAll("[data-f]").forEach(el => { const k = el.getAttribute("data-f"), v = el.value; if (k === "__name") it.name = v.trim() || KIND[it.k].n; else if (k === "cat") it.p.cat = v.trim(); else if (el.tagName === "SELECT") it.p[k] = v; else { const n = num(v, null); if (n == null) delete it.p[k]; else it.p[k] = n; } });
    save(); view = "list"; draw(); say("Aset drainase disimpan");
  }

  /* ---------- hujan live ---------- */
  async function hujanLive() {
    const m = getMap(); if (!m) return; const c = m.getCenter();
    say("Mengambil prakiraan hujan…");
    try {
      const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + c.lat.toFixed(3) + "&longitude=" + c.lng.toFixed(3) + "&hourly=precipitation&forecast_days=2&timezone=auto");
      const j = await r.json(), a = (j.hourly && j.hourly.precipitation) || [], mx = Math.max.apply(null, a.concat([0])), tot = a.reduce((s, x) => s + (x || 0), 0);
      if (mx <= 0) { extra = '<h5>Hujan live</h5><p>Tidak ada hujan diprakirakan 48 jam ke depan di titik tengah peta. Gunakan slider untuk simulasi.</p>'; render(); return; }
      pref.i = Math.round(clamp(mx, 5, 250)); save(); draw();
      extra = '<h5>Hujan live (Open-Meteo)</h5><p>Maks. <b>' + f2(mx, 1) + ' mm/jam</b>, total ' + f2(tot, 0) + ' mm/48 jam. Intensitas simulasi diset otomatis.</p>'; render();
    } catch (e) { say("Gagal mengambil data hujan (cek koneksi)"); }
  }

  /* ---------- analisis cerdas ---------- */
  async function analisis() {
    if (!DB.length) return say("Tambahkan aset dulu");
    say("Menganalisis… mengambil elevasi (DEM)");
    const need = DB.filter(x => x.pts || x.k === "gorong");
    try {
      const pts = []; need.forEach(x => { if (x.pts) { pts.push(x.pts[0], x.pts[x.pts.length - 1]); } else pts.push(x.ll); });
      const z = pts.length ? await elev(pts) : []; let k = 0;
      need.forEach(x => { if (x.pts) { const za = z[k++], zb = z[k++]; if (za != null && zb != null) { if (za < zb) x.pts.reverse(); x.z = [Math.max(za, zb), Math.min(za, zb)]; } } else { const zz = z[k++]; x.z = null; x.zc = zz; } });
      save(); draw();
    } catch (e) { say("Elevasi gagal (offline?) — analisis tetap jalan dengan asumsi kemiringan"); }
    const RP = roadPts(null), rows = DB.map(it => ({ it, sc: score(it, RP), i: info(it) })).sort((a, b) => b.sc - a.sc);
    let h = '<h5>Prioritas penanganan (i = ' + pref.i + ' mm/jam)</h5>';
    rows.slice(0, 8).forEach(r => { const hh = r.i.h; h += '<p><a data-a="go:' + r.it.id + '">' + esc(r.it.name) + '</a> — <b style="color:' + r.i.c + '">' + esc(r.i.s) + '</b>, skor ' + r.sc + (hh ? ', Q/Qc ' + f2(hh.ratio) : '') + (hh && hh.asumsi ? ' <small>(kemiringan asumsi)</small>' : '') + '</p>'; });
    const near = []; DB.forEach(it => { if (it.k === "saluran" || it.k === "gorong") { const n = nearest(ctr(it), RP); if (n && n.d < 60) near.push('<p>' + esc(it.name) + ' ↔ ' + esc(n.n) + ' (' + Math.round(n.d) + ' m)</p>'); } });
    if (near.length) h += '<h5>Berdampingan dengan ruas jalan</h5>' + near.slice(0, 8).join("");
    const bad = rows.filter(r => r.i.h && r.i.h.ratio >= 1).length;
    h += '<h5>Saran</h5><p>' + (bad ? bad + ' saluran/gorong-gorong tidak mampu menampung debit rencana: bersihkan sedimen, perbesar penampang, atau tambah saluran paralel/embung.' : 'Semua saluran/gorong-gorong mencukupi pada intensitas ini. Coba naikkan slider hujan untuk uji ketahanan.') + '</p>';
    extra = h; render();
  }
  async function genangan() {
    const m = getMap(); if (!m) return;
    if (m.getZoom() < 13) return say("Perbesar peta (zoom ≥ 13) agar grid elevasi cukup rapat");
    const b = m.getBounds(), N = 10, pts = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) pts.push([b.getSouth() + (b.getNorth() - b.getSouth()) * (r + .5) / N, b.getWest() + (b.getEast() - b.getWest()) * (c + .5) / N]);
    say("Mengambil elevasi area peta…");
    let z; try { z = await elev(pts); } catch (e) { return say("Gagal mengambil elevasi (cek koneksi)"); }
    const Z = (r, c) => z[r * N + c], low = [];
    for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) {
      const nb = []; for (let a = -1; a <= 1; a++) for (let d = -1; d <= 1; d++) if (a || d) nb.push(Z(r + a, c + d));
      const mean = nb.reduce((s, x) => s + x, 0) / 8, dep = mean - Z(r, c);
      if (Z(r, c) <= Math.min.apply(null, nb) && dep >= .4) low.push({ p: pts[r * N + c], z: Z(r, c), dep });
    }
    low.sort((a, b2) => b2.dep - a.dep); const top = low.slice(0, 8);
    if (!window.__dnGen) window.__dnGen = L.layerGroup().addTo(m); window.__dnGen.clearLayers();
    const RP = roadPts(b), assets = DB.filter(x => x.k === "saluran" || x.k === "gorong" || x.k === "inlet" || x.k === "embung");
    let h = '<h5>Potensi genangan (cekungan) — area peta</h5>';
    if (!top.length) h += '<p>Tidak ditemukan cekungan nyata pada grid ini. Coba area lain atau zoom lebih dekat.</p>';
    top.forEach((x, i) => {
      const nr = nearest(x.p, RP); let nd = 1e12; assets.forEach(a => nd = Math.min(nd, dAsset(x.p, a)));
      const aman = nd < 150, col = aman ? "#facc15" : "#ef4444";
      L.circle(x.p, { radius: 120, color: col, weight: 2, fillColor: col, fillOpacity: .22 }).bindPopup("<b>Potensi genangan #" + (i + 1) + "</b><br>Elevasi " + f2(x.z, 1) + " m, lebih rendah " + f2(x.dep, 1) + " m dari sekitarnya").addTo(window.__dnGen);
      h += '<p><a data-a="z:' + x.p[0].toFixed(5) + ',' + x.p[1].toFixed(5) + '">#' + (i + 1) + '</a> ' + f2(x.z, 1) + ' m (−' + f2(x.dep, 1) + ' m)' + (nr && nr.d < 400 ? ', dekat <b>' + esc(nr.n) + '</b> (' + Math.round(nr.d) + ' m)' : '') + ' — ' + (nd < 1e11 ? (aman ? 'drainase ' + Math.round(nd) + ' m (periksa kapasitas)' : '<b style="color:#f87171">tanpa drainase dalam 150 m → usulkan saluran/inlet/embung</b>') : '<b style="color:#f87171">belum ada aset drainase → usulkan saluran/inlet/embung</b>') + '</p>';
    });
    h += '<p><small>Grid 10×10 (indikatif). Verifikasi di lapangan.</small></p>'; extra = h; render();
  }
  function cover() {
    const m = getMap(); if (!m) return; const b = m.getBounds(), RP = roadPts(b);
    if (!RP.length) { extra = '<h5>Cakupan drainase</h5><p>Tidak ada titik ruas pada area peta ini.</p>'; return render(); }
    const assets = DB.filter(x => x.k === "saluran" || x.k === "gorong" || x.k === "inlet"), by = {};
    RP.forEach(q => { const o = by[q[2]] || (by[q[2]] = { n: 0, c: 0, p: q }); o.n++; let ok = false; for (let i = 0; i < assets.length && !ok; i++) if (dAsset(q, assets[i]) <= 100) ok = true; if (ok) o.c++; });
    const L2 = Object.keys(by).map(k => ({ k, v: by[k], pct: by[k].c / by[k].n * 100 })).sort((a, b2) => a.pct - b2.pct).slice(0, 8);
    let h = '<h5>Cakupan drainase ruas (≤100 m dari saluran)</h5>' + (assets.length ? "" : '<p><small>Belum ada saluran tercatat — semua ruas 0%.</small></p>');
    L2.forEach(r => h += '<p><a data-a="z:' + r.v.p[0].toFixed(5) + ',' + r.v.p[1].toFixed(5) + '">' + esc(r.k) + '</a> — <b style="color:' + (r.pct < 30 ? "#f87171" : r.pct < 70 ? "#facc15" : "#22c55e") + '">' + Math.round(r.pct) + '%</b> (' + r.v.c + '/' + r.v.n + ' titik)</p>');
    extra = h; render();
  }
  async function expos(id) {
    const d = DB.find(x => x.id === id); if (!d) return; const m = getMap(), RAD = 5000; setOpen(true);
    say("Menghitung eksposur hilir bendungan…");
    const seen = {}, cand = [];
    roadPts(null).concat(bridges()).forEach(q => { const dd = hav(d.ll, q); if (dd <= RAD) { const key = q[2]; if (!seen[key] || seen[key].d > dd) seen[key] = { p: q, d: dd }; } });
    Object.keys(seen).forEach(k => cand.push(seen[k])); cand.sort((a, b) => a.d - b.d); const use = cand.slice(0, 99);
    try {
      const z = await elev([d.ll].concat(use.map(x => [x.p[0], x.p[1]]))), z0 = z[0], low = use.filter((x, i) => z[i + 1] != null && z[i + 1] < z0 - 1).map((x, i) => x);
      let h = '<h5>Eksposur hilir: ' + esc(d.name) + '</h5><p>Elevasi bendungan ±' + f2(z0, 0) + ' m. Dalam radius 5 km: ' + cand.length + ' ruas/jembatan, <b>' + low.length + '</b> lebih rendah (berpotensi terdampak limpasan/jebolnya bendungan).</p>';
      low.slice(0, 8).forEach(x => h += '<p><a data-a="z:' + x.p[0].toFixed(5) + ',' + x.p[1].toFixed(5) + '">' + esc(x.p[2]) + '</a> — ' + (x.d / 1000).toFixed(2) + ' km</p>');
      h += '<p><small>Indikatif berbasis jarak & elevasi, bukan model dam-break. Rujukan resmi: BBWS/PUPR & BNPB.</small></p>'; extra = h;
    } catch (e) { extra = '<h5>Eksposur hilir</h5><p>Gagal mengambil elevasi. Terdekat: ' + cand.slice(0, 5).map(x => esc(x.p[2])).join(", ") + '.</p>'; }
    render(); m && m.closePopup();
  }

  /* ---------- telusur aliran air (steepest descent pada DEM) ---------- */
  let TR = { armed: false, last: null, lg: null };
  const NG = 7, SP = 40;
  async function flowPath(start, elevFn, maxSteps) {
    maxSteps = maxSteps || 120; const k = Math.cos(start[0] * Math.PI / 180), dLa = SP / 110540, dLn = SP / (111320 * k);
    let cur = start.slice(), pts = [cur.slice()], zs = [], sink = false, steps = 0, fresh = true, guard = 0;
    while (steps < maxSteps && guard++ < 40) {
      const g = []; for (let r = 0; r < NG; r++) for (let c = 0; c < NG; c++) g.push([cur[0] + (r - 3) * dLa, cur[1] + (c - 3) * dLn]);
      const z = await elevFn(g); let r = 3, c = 3; if (!zs.length) zs.push(z[24]);
      for (;;) {
        let best = null, bz = z[r * NG + c] - .05;
        for (let a = -1; a <= 1; a++) for (let d = -1; d <= 1; d++) { if (!a && !d) continue; const rr = r + a, cc = c + d; if (rr < 0 || cc < 0 || rr >= NG || cc >= NG) continue; const e = z[rr * NG + cc]; if (e != null && e < bz) { bz = e; best = [rr, cc]; } }
        if (!best) { if (fresh && r === 3 && c === 3) sink = true; break; }
        r = best[0]; c = best[1]; fresh = false; steps++; pts.push(g[r * NG + c].map(x => +x.toFixed(6))); zs.push(z[r * NG + c]);
        if (r === 0 || c === 0 || r === NG - 1 || c === NG - 1 || steps >= maxSteps) break;
      }
      if (sink) break; const last = pts[pts.length - 1]; if (last[0] === cur[0] && last[1] === cur[1]) { sink = true; break; } cur = last.slice(); fresh = true;
    }
    return { pts, zs, sink, capped: steps >= maxSteps };
  }
  async function trace(ll) {
    const m = getMap(); say("Menelusuri aliran air dari titik itu…");
    let res; try { res = await flowPath([ll.lat, ll.lng], elev); } catch (e) { return say("Gagal mengambil elevasi (cek koneksi)"); }
    if (TR.lg) m.removeLayer(TR.lg); TR.lg = L.layerGroup().addTo(m); TR.last = res;
    if (res.pts.length < 2) { extra = '<h5>Telusur aliran</h5><p>Titik ini sudah di <b>cekungan/titik terendah</b> — air akan menggenang di sini. Cocok untuk inlet/embung/sumur resapan.</p>'; L.circle(res.pts[0], { radius: 25, color: "#ef4444", fillOpacity: .3 }).addTo(TR.lg); return render(); }
    L.polyline(res.pts, { renderer: R, pane: "dnPane", color: "#0ea5e9", weight: 6, opacity: .9 }).addTo(TR.lg);
    L.polyline(res.pts, { renderer: R, pane: "dnPane", color: "#fff", weight: 2, className: "dn-flow", interactive: false }).addTo(TR.lg);
    L.circleMarker(res.pts[0], { radius: 6, color: "#22c55e", fillOpacity: 1 }).bindTooltip("Awal").addTo(TR.lg);
    const end = res.pts[res.pts.length - 1]; L.circleMarker(end, { radius: 7, color: res.sink ? "#ef4444" : "#f59e0b", fillOpacity: 1 }).bindTooltip(res.sink ? "Cekungan (air menggenang)" : "Ujung penelusuran").addTo(TR.lg);
    const Ln = plen(res.pts), drop = res.zs[0] - res.zs[res.zs.length - 1], RP = roadPts(null), hit = {}, ass = {};
    res.pts.forEach(q => { const n = nearest(q, RP); if (n && n.d < 35) hit[n.n] = 1; DB.forEach(a => { if (dAsset(q, a) < 30) ass[a.name] = 1; }); });
    let h = '<h5>Telusur aliran air</h5><p>Panjang <b>' + f2(Ln, 0) + ' m</b>, turun ' + f2(drop, 1) + ' m (kemiringan rata-rata ' + f2(Ln ? drop / Ln * 100 : 0, 2) + '%).</p><p>Berakhir: ' + (res.sink ? '<b style="color:#f87171">di cekungan — rawan genangan</b>' : res.capped ? 'batas penelusuran (±4,8 km)' : 'di tepi grid') + '.</p>';
    const hk = Object.keys(hit), ak = Object.keys(ass);
    h += '<p>Ruas dilintasi: ' + (hk.length ? hk.slice(0, 6).map(esc).join(", ") : 'tidak ada') + '</p><p>Aset drainase dilewati: ' + (ak.length ? ak.slice(0, 6).map(esc).join(", ") : '<b style="color:#f87171">tidak ada — alur ini belum terlayani drainase</b>') + '</p>';
    h += '<div class="g"><button class="b pri" data-a="trace2sal"><i class="fa-solid fa-plus" style="color:#fff"></i> Jadikan saluran</button><button class="b" data-a="traceclr"><i class="fa-solid fa-eraser"></i> Hapus jalur</button></div><p><small>Resolusi grid ±40 m (indikatif); verifikasi di lapangan.</small></p>';
    extra = h; render(); m.fitBounds(L.latLngBounds(res.pts), { padding: [60, 60], maxZoom: 18 });
  }
  function armTrace(on) { const m = getMap(); if (!m) return; TR.armed = on; m.getContainer().style.cursor = on ? "crosshair" : ""; if (on) { stopDraw(true); say("Klik titik di peta (mis. di jalan/lahan) untuk melihat ke mana air mengalir"); } }

  /* ---------- ekspor/impor ---------- */
  function doExport() {
    const fc = { type: "FeatureCollection", name: "petaqu-drainase", features: DB.map(it => ({ type: "Feature", properties: { id: it.id, k: it.k, name: it.name, p: it.p, z: it.z || null }, geometry: it.pts ? { type: "LineString", coordinates: it.pts.map(q => [q[1], q[0]]) } : { type: "Point", coordinates: [it.ll[1], it.ll[0]] } })) };
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(fc)], { type: "application/geo+json" })); a.download = "petaqu-drainase.geojson"; document.body.appendChild(a); a.click(); a.remove(); say("GeoJSON drainase diekspor (" + DB.length + " aset)");
  }
  function doImport(e) {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const j = JSON.parse(r.result); let n = 0; (j.features || []).forEach(ft => { const g = ft.geometry, pr = ft.properties || {}, k = KIND[pr.k] ? pr.k : (g.type === "LineString" ? "saluran" : "inlet"); if (!g) return; const it = { id: uid(), k, name: pr.name || KIND[k].n, p: Object.assign({}, DEF[k], pr.p || {}) }; if (g.type === "LineString") it.pts = g.coordinates.map(c => [c[1], c[0]]); else if (g.type === "Point") it.ll = [g.coordinates[1], g.coordinates[0]]; else return; DB.push(it); n++; }); save(); draw(); say(n + " aset diimpor"); } catch (x) { say("File tidak valid"); } };
    r.readAsText(f); e.target.value = "";
  }

  /* ---------- integrasi folder ---------- */
  const rows = () => [
    { id: "panel", name: "Drainase (panel & lapisan)", ic: "\uf043", c: "#38bdf8", on: open || pref.on && DB.length > 0 },
    { id: "saluran", name: "Gambar saluran baru", ic: "\uf303", c: "#38bdf8", on: DRAW ? true : null },
    { id: "analisis", name: "Analisis drainase cerdas", ic: "\uf0d0", c: "#a78bfa", on: null }
  ];
  function act(id) {
    ensureMap();
    if (id === "panel") setOpen(!open);
    else if (id === "saluran") { setOpen(true); startDraw("saluran"); }
    else if (id === "analisis") { setOpen(true); analisis(); }
  }

  function build() {
    if ($("dnPanel")) return; css(); load();
    const P = document.createElement("div"); P.id = "dnPanel"; P.onclick = onPanel; document.body.appendChild(P);
    try { L.DomEvent.disableClickPropagation(P); L.DomEvent.disableScrollPropagation(P); } catch (e) { }
    document.addEventListener("keydown", e => { if (e.key === "Escape" && DRAW) stopDraw(); });
    render();
    const t = setInterval(() => { if (getMap()) { clearInterval(t); ensureMap(); } }, 400);
  }
  window.PETAQU_DRAINASE = { open: () => setOpen(true), close: () => setOpen(false), rows, act, edit: id => { editId = id; view = "form"; setOpen(true); getMap() && getMap().closePopup(); render(); }, del: id => { const it = DB.find(x => x.id === id); if (it && confirm("Hapus " + it.name + "?")) { DB = DB.filter(x => x.id !== id); save(); draw(); getMap() && getMap().closePopup(); } }, expos, _t: { flowPath, hyd, stat, info, dSeg, hav, setPref: p => Object.assign(pref, p), DEF } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
