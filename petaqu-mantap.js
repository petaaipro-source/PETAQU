/* PETAQU Mantap: Kemantapan Jalan (KPI Bina Marga: IRI <= 8 = mantap) + Simulator Target
   1. Kemantapan jaringan & per kabupaten (berbobot panjang ruas)
   2. Mode TARGET: "ingin 90% mantap, ruas mana dulu & berapa biaya?" (greedy km-mantap per rupiah)
   3. Mode ANGGARAN: "dana Rp X, kemantapan naik jadi berapa?"
   4. Klik baris -> terbang ke ruas; ekspor Excel */
(function () {
  "use strict";
  const $ = (t, css, html) => { const e = document.createElement(t); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; };
  const esc = window.esc = window.esc || (s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const rp = n => "Rp " + Math.round(n).toLocaleString("id-ID");
  const say = m => { try { toast(m, 3200); } catch (e) { console.log(m); } };
  const RD = () => (typeof roads !== "undefined" ? roads : []);
  const ok = p => p && p.iri != null && p.iri !== "" && !isNaN(p.iri);
  const prices = () => { let u = {}; try { u = JSON.parse(localStorage.getItem("pq_unit_price")) || {}; } catch (e) { } return Object.assign({ rb: 2.5e6, rr: 1e6, sedang: 3e5 }, u); };
  const col = v => v >= 90 ? "#34d399" : v >= 75 ? "#facc15" : v >= 60 ? "#f59e0b" : "#f43f5e";
  const km = m => (m / 1000).toFixed(2);

  /* Hitung per ruas: porsi titik IRI x panjang ruas */
  function calc() {
    const P = prices();
    return RD().map(r => {
      const pts = (r.points || []).filter(ok), len = computeLength(r.points || []);
      if (!pts.length || !len) return null;
      const c = { baik: 0, sedang: 0, rr: 0, rb: 0 };
      pts.forEach(p => { const k = getIriInfo(p.iri).key; if (k in c) c[k]++; });
      const n = pts.length, s = {}; for (const k in c) s[k] = c[k] / n;
      const bad = s.rb + s.rr;
      return { r, len, kab: r.kabupaten || "Tanpa kabupaten", s, bad: len * bad, mantap: len * (1 - bad), cost: len * (s.rb * P.rb + s.rr * P.rr) };
    }).filter(Boolean);
  }
  const pct = (a, b) => b ? a / b * 100 : 0;

  function perKab(d) {
    const o = {};
    d.forEach(x => { const k = o[x.kab] || (o[x.kab] = { kab: x.kab, len: 0, mantap: 0, cost: 0, n: 0 }); k.len += x.len; k.mantap += x.mantap; k.cost += x.cost; k.n++; });
    return Object.values(o).map(k => (k.p = pct(k.mantap, k.len), k)).sort((a, b) => a.p - b.p);
  }

  /* Perencana greedy: urutkan ruas by (km tidak mantap yang dipulihkan / biaya) */
  function plan(d, mode, val) {
    const tot = d.reduce((a, x) => a + x.len, 0), m0 = d.reduce((a, x) => a + x.mantap, 0);
    const cand = d.filter(x => x.bad > 0 && x.cost > 0).sort((a, b) => b.bad / b.cost - a.bad / a.cost);
    let m = m0, cost = 0; const pick = [];
    for (const x of cand) {
      if (mode === "t" && pct(m, tot) >= val) break;
      if (mode === "b" && cost + x.cost > val) continue;
      m += x.bad; cost += x.cost; pick.push({ x, cum: pct(m, tot), cumCost: cost });
    }
    return { tot, m0, m, cost, pick, p0: pct(m0, tot), p1: pct(m, tot), maxP: pct(m0 + cand.reduce((a, x) => a + x.bad, 0), tot) };
  }

  function open() {
    const d = calc();
    if (!d.length) return say("Belum ada ruas dengan data IRI");
    const bg = $("div", "position:fixed;inset:0;z-index:6500;background:#000b;display:flex;align-items:flex-start;justify-content:center;padding:5vh 10px 10px");
    const box = $("div", "background:#071a26;color:#e6f1f7;border:1px solid #22d3ee66;border-radius:14px;width:min(920px,100%);max-height:90vh;display:flex;flex-direction:column;font:13px system-ui");
    const head = $("div", "padding:11px 14px;display:flex;align-items:center;border-bottom:1px solid #ffffff22", '<b style="flex:1;font-size:15px">Kemantapan Jalan &amp; Simulator Target</b><button style="background:none;border:0;color:#fff;font-size:20px;cursor:pointer">\u2715</button>');
    const body = $("div", "overflow:auto;padding:12px 14px");
    box.append(head, body); bg.append(box); document.body.append(bg);
    const close = () => bg.remove();
    head.querySelector("button").onclick = close;
    bg.addEventListener("mousedown", e => { if (e.target === bg) close(); });

    const tot = d.reduce((a, x) => a + x.len, 0), m0 = d.reduce((a, x) => a + x.mantap, 0), p0 = pct(m0, tot);
    const kabs = perKab(d);
    const stack = ["baik", "sedang", "rr", "rb"].map((k, i) => { const w = pct(d.reduce((a, x) => a + x.len * x.s[k], 0), tot); return '<div title="' + k.toUpperCase() + " " + w.toFixed(1) + '%" style="width:' + w + "%;background:" + ["#34d399", "#facc15", "#f59e0b", "#f43f5e"][i] + '"></div>'; }).join("");
    const inp = (id, v, w) => '<input id="' + id + '" type="number" value="' + v + '" style="width:' + w + 'px;background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:5px">';
    const btn = (id, t, bg2) => '<button id="' + id + '" style="background:' + (bg2 || "#0e7490") + ';color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer">' + t + "</button>";

    body.innerHTML =
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><div style="flex:1;min-width:150px;background:#0b2a3b;border-radius:10px;padding:10px"><div style="color:#9fb6c3;font-size:11px">Kemantapan jaringan</div><div style="font-size:26px;font-weight:700;color:' + col(p0) + '">' + p0.toFixed(1) + '%</div></div>' +
      '<div style="flex:1;min-width:150px;background:#0b2a3b;border-radius:10px;padding:10px"><div style="color:#9fb6c3;font-size:11px">Panjang dinilai</div><div style="font-size:20px;font-weight:700">' + km(tot) + ' km</div><div style="color:#9fb6c3;font-size:11px">' + d.length + ' ruas</div></div>' +
      '<div style="flex:1;min-width:150px;background:#0b2a3b;border-radius:10px;padding:10px"><div style="color:#9fb6c3;font-size:11px">Tidak mantap (IRI &gt; 8)</div><div style="font-size:20px;font-weight:700;color:#f43f5e">' + km(tot - m0) + ' km</div></div></div>' +
      '<div style="display:flex;height:20px;border-radius:6px;overflow:hidden;margin:10px 0">' + stack + '</div>' +
      '<h4 style="margin:12px 0 4px;color:#22d3ee">Kemantapan per kabupaten (terendah di atas)</h4>' +
      kabs.map(k => '<div style="display:flex;align-items:center;gap:8px;margin:3px 0"><span style="width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(k.kab) + '</span><div style="flex:1;background:#0b2a3b;border-radius:4px;height:14px"><div style="width:' + k.p + "%;background:" + col(k.p) + ';height:100%;border-radius:4px"></div></div><b style="width:48px;text-align:right">' + k.p.toFixed(1) + '%</b><span style="width:62px;text-align:right;color:#9fb6c3">' + km(k.len) + " km</span></div>").join("") +
      '<h4 style="margin:16px 0 6px;color:#22d3ee">Simulator: capai target dengan biaya paling efisien</h4>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">Target % ' + inp("mtT", Math.min(100, Math.ceil(p0 / 5) * 5 + (p0 % 5 === 0 ? 5 : 0)), 70) + btn("mtGT", "Hitung ke target") + ' &nbsp; atau Anggaran (Rp) ' + inp("mtB", 5e9, 130) + btn("mtGB", "Hitung dari anggaran") + btn("mtX", "Ekspor Excel", "#15803d") + '</div><div id="mtO" style="margin-top:10px"></div>' +
      '<div style="color:#9fb6c3;margin-top:10px;font-size:11.5px">Mantap = IRI \u2264 8 (baik + sedang). Panjang tiap kategori = porsi titik IRI \u00d7 panjang ruas. Urutan ruas: km tidak-mantap yang dipulihkan per rupiah terbesar. Biaya memakai harga satuan menu Prioritas &amp; RAB (asumsi); hasil penanganan dianggap IRI \u2264 8. Ruas tanpa data IRI tidak dihitung.</div>';
    const q = i => body.querySelector("#" + i);
    let last = null;

    function show(res, label) {
      last = res;
      const o = q("mtO");
      if (!res.pick.length) { o.innerHTML = '<div style="color:#facc15">' + (label === "t" ? "Target sudah tercapai, tidak perlu penanganan." : "Anggaran terlalu kecil untuk satu ruas pun, atau tidak ada ruas tidak mantap.") + "</div>"; return; }
      const warn = label === "t" && res.p1 < +q("mtT").value ? '<div style="color:#f59e0b;margin-bottom:6px">Target tidak bisa dicapai: batas maksimum data saat ini ' + res.maxP.toFixed(1) + "%.</div>" : "";
      o.innerHTML = warn + '<div style="margin-bottom:6px">Kemantapan <b>' + res.p0.toFixed(1) + "%</b> \u2192 <b style=\"color:" + col(res.p1) + '">' + res.p1.toFixed(1) + "%</b> dengan <b>" + res.pick.length + "</b> ruas, total <b>" + rp(res.cost) + '</b></div><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;min-width:560px"><thead><tr style="text-align:left;color:#22d3ee"><th>#</th><th>Ruas</th><th>Kabupaten</th><th>Tdk mantap (km)</th><th>Biaya</th><th>Kumulatif</th><th>Kemantapan</th></tr></thead><tbody>' +
        res.pick.map((p, i) => '<tr data-id="' + esc(p.x.r.id) + '" style="border-top:1px solid #ffffff14;cursor:pointer"><td>' + (i + 1) + "</td><td>" + esc(p.x.r.name) + "</td><td>" + esc(p.x.kab) + "</td><td>" + km(p.x.bad) + "</td><td>" + rp(p.x.cost) + "</td><td>" + rp(p.cumCost) + '</td><td><b style="color:' + col(p.cum) + '">' + p.cum.toFixed(1) + "%</b></td></tr>").join("") + "</tbody></table></div>";
      o.querySelectorAll("tr[data-id]").forEach(tr => tr.onclick = () => { close(); try { focusRoad(tr.dataset.id); } catch (e) { } });
    }
    q("mtGT").onclick = () => show(plan(d, "t", +q("mtT").value || 0), "t");
    q("mtGB").onclick = () => show(plan(d, "b", +q("mtB").value || 0), "b");
    q("mtX").onclick = () => {
      if (!window.XLSX) return say("Pustaka Excel belum siap");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Kabupaten", "Ruas", "Panjang (km)", "Kemantapan (%)", "Perkiraan biaya penanganan (Rp)"]].concat(kabs.map(k => [k.kab, k.n, +km(k.len), +k.p.toFixed(1), Math.round(k.cost)]))), "Per Kabupaten");
      if (last) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["#", "Ruas", "Kabupaten", "Tidak mantap (km)", "Biaya (Rp)", "Biaya kumulatif (Rp)", "Kemantapan kumulatif (%)"]].concat(last.pick.map((p, i) => [i + 1, p.x.r.name, p.x.kab, +km(p.x.bad), Math.round(p.x.cost), Math.round(p.cumCost), +p.cum.toFixed(1)]))), "Rencana");
      XLSX.writeFile(wb, "kemantapan-jalan-" + new Date().toISOString().slice(0, 10) + ".xlsx");
    };
  }

  function init() {
    const b = $("button", "", '<i class="fa-solid fa-gauge-high"></i>');
    b.title = "Kemantapan jalan & simulator target"; b.onclick = open;
    try { PQ_DOCK.adopt(b, "Kemantapan"); } catch (e) { b.style.cssText = "position:fixed;left:10px;bottom:120px;z-index:900"; document.body.append(b); }
  }
  window.PETAQU_MANTAP = { open, calc, plan, perKab };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
