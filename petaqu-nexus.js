/* PETAQU Nexus: Command Palette + Suara, Heatmap IRI, Profil IRI interaktif, Optimasi Anggaran */
(function () {
  "use strict";
  const $ = (t, css, html) => { const e = document.createElement(t); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; };
  const rp = n => "Rp " + Math.round(n).toLocaleString("id-ID");
  const say = m => { try { toast(m, 3000); } catch (e) { console.log(m); } };
  const RD = () => (typeof roads !== "undefined" ? roads : []);
  const BR = () => (typeof JEMBATAN_DB !== "undefined" ? JEMBATAN_DB : []);
  const hav = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r, s = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(s)); };
  const overlay = (title, w) => {
    const bg = $("div", "position:fixed;inset:0;z-index:6500;background:#000b;display:flex;align-items:flex-start;justify-content:center;padding:8vh 10px 10px");
    const box = $("div", "background:#071a26;color:#e6f1f7;border:1px solid #22d3ee66;border-radius:14px;width:min(" + w + "px,100%);max-height:84vh;display:flex;flex-direction:column;font:13px system-ui;box-shadow:0 10px 40px #000a");
    box.innerHTML = '<div style="padding:11px 14px;display:flex;align-items:center;border-bottom:1px solid #ffffff22"><b style="flex:1;font-size:15px">' + title + '</b><button class="nx-x" style="background:none;border:0;color:#fff;font-size:20px;cursor:pointer">\u2715</button></div>';
    const body = $("div", "overflow:auto;padding:12px 14px");
    box.append(body); bg.append(box); document.body.append(bg);
    const close = () => bg.remove();
    box.querySelector(".nx-x").onclick = close;
    bg.addEventListener("mousedown", e => { if (e.target === bg) close(); });
    return { body, close, bg };
  };

  /* ---------- 1. HEATMAP IRI ---------- */
  let heat = null;
  function heatOn() {
    if (heat || !window.map) return;
    const c = $("canvas", "position:absolute;inset:0;pointer-events:none;z-index:450;opacity:.85");
    const host = map.getContainer(); host.append(c);
    const draw = () => {
      const s = map.getSize(); c.width = s.x; c.height = s.y;
      const g = c.getContext("2d"), z = map.getZoom(), rad = Math.max(14, Math.min(70, z * 4.2));
      g.globalCompositeOperation = "lighter";
      RD().forEach(r => (r.points || []).forEach(p => {
        if (p.iri == null || p.iri === "" || isNaN(p.iri)) return;
        const w = Math.min(1, Math.max(0, (+p.iri - 2) / 12)); if (w < .12) return;
        const q = map.latLngToContainerPoint([p.lat, p.lng]);
        if (q.x < -rad || q.y < -rad || q.x > s.x + rad || q.y > s.y + rad) return;
        const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, rad);
        const col = w > .66 ? "244,63,94" : w > .33 ? "245,158,11" : "52,211,153";
        gr.addColorStop(0, "rgba(" + col + "," + (.55 * w + .1) + ")"); gr.addColorStop(1, "rgba(" + col + ",0)");
        g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, rad, 0, 6.3); g.fill();
      }));
    };
    map.on("move zoom resize", draw); draw();
    heat = { c, draw, off() { map.off("move zoom resize", draw); c.remove(); heat = null; } };
    say("Heatmap IRI aktif \u2014 merah = hotspot kerusakan");
  }
  const heatToggle = () => (heat ? (heat.off(), say("Heatmap IRI dimatikan")) : heatOn());

  /* ---------- 2. PROFIL IRI INTERAKTIF ---------- */
  let probe = null;
  function profil(r) {
    const pts = (r.points || []).filter(p => isFinite(p.lat) && isFinite(p.lng));
    const d = [0]; for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + hav(pts[i - 1], pts[i]));
    const v = pts.map(p => (p.iri == null || p.iri === "" || isNaN(p.iri) ? null : +p.iri));
    const ok = v.filter(x => x != null);
    const o = overlay("Profil IRI \u2014 " + esc(r.name), 820);
    if (ok.length < 2) { o.body.innerHTML = "Ruas ini belum punya cukup data IRI untuk dibuat profil."; return; }
    const W = 780, H = 260, m = 34, L = d[d.length - 1] || 1, mx = Math.max(14, ...ok);
    const X = x => m + (x / L) * (W - m - 8), Y = y => H - 26 - (y / mx) * (H - 44);
    let path = "", pen = false;
    v.forEach((y, i) => { if (y == null) { pen = false; return; } path += (pen ? "L" : "M") + X(d[i]).toFixed(1) + " " + Y(y).toFixed(1); pen = true; });
    const band = [[0, 4, "#34d399"], [4, 8, "#84cc16"], [8, 12, "#f59e0b"], [12, mx, "#f43f5e"]].map(b => '<rect x="' + m + '" y="' + Y(Math.min(b[1], mx)) + '" width="' + (W - m - 8) + '" height="' + (Y(b[0]) - Y(Math.min(b[1], mx))) + '" fill="' + b[2] + '" opacity=".13"/>').join("");
    const avg = ok.reduce((a, b) => a + b) / ok.length, worst = Math.max(...ok);
    o.body.innerHTML = '<div style="margin-bottom:8px;color:#9fb6c3">Rata-rata IRI <b style="color:#22d3ee">' + avg.toFixed(1) + '</b> \u00b7 Terburuk <b style="color:#f43f5e">' + worst.toFixed(1) + '</b> \u00b7 Panjang ' + (L / 1000).toFixed(2) + ' km \u00b7 <i>Geser kursor di grafik untuk menyorot titik di peta</i></div>' +
      '<svg id="nxSvg" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;background:#0b2a3b;border-radius:10px;cursor:crosshair">' + band +
      '<path d="' + path + '" fill="none" stroke="#22d3ee" stroke-width="2"/><line id="nxLn" y1="10" y2="' + (H - 26) + '" stroke="#fff" stroke-opacity=".6" display="none"/>' +
      '<text x="6" y="14" fill="#9fb6c3" font-size="10">IRI</text><text x="' + (W - 8) + '" y="' + (H - 8) + '" fill="#9fb6c3" font-size="10" text-anchor="end">jarak (m)</text></svg><div id="nxTip" style="margin-top:6px;min-height:18px;color:#e6f1f7"></div>';
    const svg = o.body.querySelector("#nxSvg"), ln = o.body.querySelector("#nxLn"), tip = o.body.querySelector("#nxTip");
    svg.addEventListener("mousemove", ev => {
      const b = svg.getBoundingClientRect(), x = ((ev.clientX - b.left) / b.width) * W, t = Math.max(0, Math.min(L, ((x - m) / (W - m - 8)) * L));
      let k = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i] - t) < Math.abs(d[k] - t)) k = i;
      ln.setAttribute("x1", X(d[k])); ln.setAttribute("x2", X(d[k])); ln.removeAttribute("display");
      tip.innerHTML = "STA <b>" + esc(String(pts[k].sta || "\u2013")) + "</b> \u00b7 " + Math.round(d[k]) + " m \u00b7 IRI <b>" + (v[k] == null ? "\u2013" : v[k].toFixed(1)) + "</b>";
      if (window.map) { probe && probe.remove(); probe = L.circleMarker([pts[k].lat, pts[k].lng], { radius: 9, color: "#fff", weight: 2, fillColor: "#22d3ee", fillOpacity: .9 }).addTo(map); }
    });
    const prev = o.close; o.bg.querySelector(".nx-x").onclick = () => { probe && probe.remove(); probe = null; prev(); };
    try { focusRoad(r.id); } catch (e) { }
  }

  /* ---------- 3. OPTIMASI ANGGARAN ---------- */
  let hl = null;
  function optimasi() {
    if (!window.PETAQU_PRO) return say("Modul prioritas belum siap");
    const all = PETAQU_PRO.all().filter(x => x.cost > 0 && x.score > 0), total = all.reduce((a, b) => a + b.cost, 0);
    const o = overlay("Optimasi Anggaran Penanganan", 860);
    o.body.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">Pagu anggaran (Rp): <input id="nxB" type="number" value="' + Math.round(total * 0.3) + '" style="width:190px;background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:5px"><button id="nxGo" style="background:#0e7490;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer">Optimalkan</button><button id="nxMap" style="background:#15803d;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer">Sorot di peta</button><span style="color:#9fb6c3">Total kebutuhan semua ruas: <b>' + rp(total) + '</b></span></div><div id="nxOut"></div>';
    let pick = [];
    const run = () => {
      let B = +o.body.querySelector("#nxB").value || 0, used = 0;
      pick = [];
      [...all].sort((a, b) => b.score / b.cost - a.score / a.cost).forEach(x => { if (used + x.cost <= B) { pick.push(x); used += x.cost; } });
      const gain = pick.reduce((a, b) => a + b.score, 0), tot = all.reduce((a, b) => a + b.score, 0) || 1, km = pick.reduce((a, b) => a + b.len, 0) / 1000;
      o.body.querySelector("#nxOut").innerHTML = '<div style="margin-bottom:8px"><b>' + pick.length + '</b> ruas terpilih \u00b7 ' + km.toFixed(1) + ' km \u00b7 biaya <b>' + rp(used) + '</b> \u00b7 menutup <b style="color:#34d399">' + Math.round(gain / tot * 100) + '%</b> total skor kerusakan jaringan (strategi rasio skor/biaya tertinggi).</div><table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:#22d3ee"><th>#</th><th>Ruas</th><th>Skor</th><th>Biaya</th><th>Skor/Rp juta</th></tr></thead><tbody>' +
        pick.map((x, i) => '<tr style="border-top:1px solid #ffffff14"><td>' + (i + 1) + '</td><td>' + esc(x.r.name) + '</td><td>' + x.score + '</td><td>' + rp(x.cost) + '</td><td>' + (x.score / x.cost * 1e6).toFixed(2) + '</td></tr>').join("") + '</tbody></table>';
    };
    o.body.querySelector("#nxGo").onclick = run;
    o.body.querySelector("#nxMap").onclick = () => {
      if (!window.map || !pick.length) return say("Jalankan optimasi dulu");
      hl && hl.remove(); hl = L.layerGroup(pick.map(x => L.polyline(x.r.points.map(p => [p.lat, p.lng]), { color: "#22d3ee", weight: 8, opacity: .8 }))).addTo(map);
      o.close(); say(pick.length + " ruas prioritas disorot (ketik \"bersihkan sorotan\" di palet untuk menghapus)");
    };
    run();
  }

  /* ---------- 4. COMMAND PALETTE + SUARA ---------- */
  const ACT = [
    ["Heatmap IRI (hidup/mati)", "hotspot kerusakan", heatToggle],
    ["Optimasi Anggaran", "pilih ruas terbaik sesuai pagu", optimasi],
    ["Prioritas Penanganan & RAB", "tabel skor dan biaya", () => window.PETAQU_PRO && PETAQU_PRO.open()],
    ["Bersihkan sorotan peta", "hapus highlight optimasi", () => { hl && hl.remove(); hl = null; probe && probe.remove(); probe = null; }]
  ];
  function palette() {
    const o = overlay("Palet Perintah", 640);
    const inp = $("input", "width:100%;box-sizing:border-box;background:#0b2a3b;color:#fff;border:1px solid #22d3ee66;border-radius:8px;padding:10px;font-size:14px");
    inp.placeholder = "Cari ruas, jembatan, atau perintah\u2026 (ketik IRI > 8 untuk filter)";
    const mic = $("button", "background:#0e7490;color:#fff;border:0;border-radius:8px;padding:0 12px;cursor:pointer;font-size:16px", "\ud83c\udfa4");
    const row = $("div", "display:flex;gap:6px;margin-bottom:8px"); row.append(inp, mic);
    const list = $("div"); o.body.append(row, list); inp.focus();
    const item = (ic, t, s, fn, extra) => { const e = $("div", "display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;cursor:pointer", '<span style="width:22px;text-align:center">' + ic + '</span><span style="flex:1"><b>' + t + '</b> <span style="color:#9fb6c3">' + s + "</span></span>"); e.onmouseenter = () => (e.style.background = "#0e749055"); e.onmouseleave = () => (e.style.background = ""); e.onclick = () => { o.close(); fn(); }; if (extra) e.append(extra); return e; };
    const render = () => {
      const q = inp.value.toLowerCase().trim(); list.innerHTML = "";
      const m = q.match(/iri\s*(?:>|di atas)\s*(\d+(?:[.,]\d+)?)/);
      if (m && window.PETAQU_PRO) { const a = +m[1].replace(",", "."); PETAQU_PRO.all().filter(x => x.avg > a).slice(0, 12).forEach(x => list.append(item("\ud83d\udee3\ufe0f", esc(x.r.name), "IRI " + x.avg.toFixed(1), () => focusRoad(x.r.id)))); if (!list.children.length) list.textContent = "Tidak ada ruas dengan IRI di atas " + a; return; }
      ACT.filter(a => !q || (a[0] + a[1]).toLowerCase().includes(q)).forEach(a => list.append(item("\u26a1", a[0], a[1], a[2])));
      if (!q) return;
      RD().filter(r => (r.name + " " + (r.kabupaten || "")).toLowerCase().includes(q)).slice(0, 8).forEach(r => {
        const b = $("button", "background:#0b2a3b;color:#22d3ee;border:1px solid #22d3ee55;border-radius:6px;padding:3px 8px;cursor:pointer", "Profil IRI");
        b.onclick = e => { e.stopPropagation(); o.close(); profil(r); };
        list.append(item("\ud83d\udee3\ufe0f", esc(r.name), esc(r.kabupaten || "ruas"), () => focusRoad(r.id), b));
      });
      BR().filter(j => (j.nama || j.name || "").toLowerCase().includes(q)).slice(0, 6).forEach(j => list.append(item("\ud83c\udf09", esc(j.nama || j.name || ""), "jembatan", () => focusJembatan(j.id))));
      if (!list.children.length) list.textContent = "Tidak ada hasil.";
    };
    inp.oninput = render; render();
    inp.addEventListener("keydown", e => { if (e.key === "Escape") o.close(); if (e.key === "Enter" && list.firstChild) list.firstChild.click(); });
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) mic.style.display = "none";
    else mic.onclick = () => { const s = new SR(); s.lang = "id-ID"; s.onresult = e => { inp.value = e.results[0][0].transcript; render(); }; s.onerror = () => say("Suara tidak terbaca"); try { s.start(); say("Silakan bicara\u2026"); } catch (e) { } };
  }

  addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palette(); } });
  function mount() {
    const b = $("button"); b.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>'; b.onclick = palette;
    window.PQ_DOCK ? PQ_DOCK.adopt(b, "Palet perintah (Ctrl+K)") : (b.style.cssText = "position:fixed;left:10px;bottom:120px;z-index:3900", document.body.append(b));
  }
  window.esc = window.esc || (s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  window.PETAQU_NEXUS = { palette, heatToggle, profil, optimasi, ACT };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount) : setTimeout(mount, 0);
})();
