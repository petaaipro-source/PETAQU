/* PETAQU Kurva S: Prediksi Keterlambatan Paket (Earned Schedule) + Potensi Denda + Kebutuhan Percepatan
   - Rencana berbentuk kurva S (atau linear), dibaca dari tanggal mulai/selesai & progres fisik paket
   - SPI(t) = ES/AT -> prakiraan tanggal selesai = mulai + durasi/SPI(t); potensi denda 1 per mil/hari (maks 5%) dari nilai kontrak
   - Grafik: rencana, realisasi, prakiraan; klik baris untuk melihat paket lain; ekspor Excel */
(function () {
  "use strict";
  const $ = (t, css, html) => { const e = document.createElement(t); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; };
  const esc = window.esc = window.esc || (s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const rp = n => "Rp " + Math.round(n).toLocaleString("id-ID");
  const say = m => { try { toast(m, 3200); } catch (e) { console.log(m); } };
  const DAY = 864e5, D = s => s ? Date.parse(s + "T00:00:00Z") / DAY : NaN, ds = n => new Date(n * DAY).toISOString().slice(0, 10);
  const fmt = n => { const [y, m, d] = ds(n).split("-"); return d + "/" + m + "/" + y.slice(2); };
  const RC = { Aman: "#34d399", Waspada: "#facc15", Kritis: "#f43f5e" };
  let MODE = "s";
  const plan = x => { x = Math.max(0, Math.min(1, x)); return MODE === "s" ? x * x * (3 - 2 * x) : x; };
  const inv = y => { if (MODE !== "s") return y; let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; plan(m) < y ? lo = m : hi = m; } return (lo + hi) / 2; };

  function calc() {
    const P = window.PETAQU_PAKET; if (!P) return [];
    const today = Math.floor(Date.now() / DAY);
    return P.all().map(p => {
      const d = P.derive(p); if (d.status !== "Berjalan" && d.status !== "Terlambat") return null;
      const a = D(p.mulai), b = D(p.selesai); if (isNaN(a) || isNaN(b) || b <= a) return null;
      const PD = b - a, AT = Math.max(0, today - a), f = Math.max(0, Math.min(100, +p.fisik || 0)), keu = +p.keu || 0;
      const spi = AT <= 0 ? 1 : f <= 0 ? 0 : PD * inv(f / 100) / AT;
      let end = null, late = null;
      if (spi > 0) { end = a + PD / spi; if (f < 100) end = Math.max(end, today + 1); late = Math.max(0, Math.ceil(end - b)); }
      const denda = late != null ? Math.min(.05, .001 * late) * (+p.nilai || 0) : null;
      const risk = late == null ? "Kritis" : late === 0 ? "Aman" : late <= 30 ? "Waspada" : "Kritis";
      return { p, a, b, PD, AT, f, keu, spi, end, late, denda, risk, today, rencana: plan(AT / PD) * 100, perlu: (100 - f) / (Math.max(b - today, 1) / 7), rata: 100 / (PD / 7) };
    }).filter(Boolean).sort((x, y) => (y.late == null ? 1e9 : y.late) - (x.late == null ? 1e9 : x.late));
  }

  function chart(x) {
    const W = 600, H = 230, L = 36, B = 26, T = 10, R = 10, t0 = x.a, t1 = Math.max(x.b, x.end || x.b, x.today) + 3;
    const X = t => L + (t - t0) / (t1 - t0) * (W - L - R), Y = v => H - B - v / 100 * (H - B - T);
    const path = fn => { let s = ""; for (let i = 0; i <= 60; i++) { const t = t0 + (t1 - t0) * i / 60; s += (i ? "L" : "M") + X(t).toFixed(1) + "," + Y(fn(t)).toFixed(1); } return s; };
    const grid = [0, 25, 50, 75, 100].map(v => '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#ffffff18"/><text x="' + (L - 4) + '" y="' + (Y(v) + 3) + '" fill="#9fb6c3" font-size="10" text-anchor="end">' + v + "</text>").join("");
    const vl = (t, c, lb) => '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="' + c + '" stroke-dasharray="4 3"/><text x="' + X(t) + '" y="' + (H - 12) + '" fill="' + c + '" font-size="10" text-anchor="middle">' + lb + "</text>";
    return '<svg viewBox="0 0 ' + W + " " + H + '" style="width:100%;background:#0b2a3b;border-radius:10px">' + grid +
      vl(x.b, "#9fb6c3", "Kontrak " + fmt(x.b)) + vl(x.today, "#e6f1f7", "Hari ini") +
      '<path d="' + path(t => plan((t - x.a) / x.PD) * 100) + '" fill="none" stroke="#22d3ee" stroke-width="2"/>' +
      (x.spi > 0 ? '<path d="' + path(t => plan((t - x.a) * x.spi / x.PD) * 100) + '" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6 4"/>' : "") +
      '<line x1="' + X(x.a) + '" y1="' + Y(0) + '" x2="' + X(x.today) + '" y2="' + Y(x.f) + '" stroke="#34d399" stroke-width="2.5"/><circle cx="' + X(x.today) + '" cy="' + Y(x.f) + '" r="4.5" fill="#34d399"/>' +
      '<text x="' + (L + 6) + '" y="' + (T + 12) + '" fill="#22d3ee" font-size="11">\u2014 Rencana</text><text x="' + (L + 70) + '" y="' + (T + 12) + '" fill="#34d399" font-size="11">\u2014 Realisasi</text><text x="' + (L + 140) + '" y="' + (T + 12) + '" fill="#f59e0b" font-size="11">- - Prakiraan</text></svg>';
  }

  function open() {
    if (!window.PETAQU_PAKET) return say("Menu Paket belum siap");
    const bg = $("div", "position:fixed;inset:0;z-index:6500;background:#000b;display:flex;align-items:flex-start;justify-content:center;padding:4vh 10px 10px");
    const box = $("div", "background:#071a26;color:#e6f1f7;border:1px solid #22d3ee66;border-radius:14px;width:min(960px,100%);max-height:92vh;display:flex;flex-direction:column;font:13px system-ui");
    const head = $("div", "padding:11px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #ffffff22", '<b style="flex:1;font-size:15px">Kurva S &amp; Prediksi Keterlambatan Paket</b><select id="kvM" style="background:#0b2a3b;color:#fff;border:1px solid #22d3ee55;border-radius:6px;padding:4px"><option value="s">Rencana kurva S</option><option value="l">Rencana linear</option></select><button id="kvX" style="background:#15803d;color:#fff;border:0;border-radius:6px;padding:5px 10px;cursor:pointer">Excel</button><button id="kvC" style="background:none;border:0;color:#fff;font-size:20px;cursor:pointer">\u2715</button>');
    const body = $("div", "overflow:auto;padding:12px 14px");
    box.append(head, body); bg.append(box); document.body.append(bg);
    const close = () => bg.remove(); let d = [];
    head.querySelector("#kvC").onclick = close; bg.addEventListener("mousedown", e => { if (e.target === bg) close(); });
    head.querySelector("#kvM").onchange = e => { MODE = e.target.value; render(); };
    head.querySelector("#kvX").onclick = () => {
      if (!window.XLSX || !d.length) return say("Tidak ada data / pustaka Excel belum siap");
      const ws = XLSX.utils.aoa_to_sheet([["Kode", "Paket", "Kabupaten", "Nilai (Rp)", "Mulai", "Selesai", "Rencana (%)", "Fisik (%)", "Keuangan (%)", "SPI(t)", "Prakiraan selesai", "Terlambat (hari)", "Potensi denda (Rp)", "Perlu (%/minggu)", "Rata rencana (%/minggu)", "Risiko"]].concat(d.map(x => [x.p.kode, x.p.nama, x.p.kabupaten || "", +x.p.nilai || 0, x.p.mulai, x.p.selesai, +x.rencana.toFixed(1), x.f, x.keu, x.spi == null ? "" : +x.spi.toFixed(2), x.end == null ? "tidak terukur" : ds(x.end), x.late == null ? "" : x.late, x.denda == null ? "" : Math.round(x.denda), +x.perlu.toFixed(1), +x.rata.toFixed(1), x.risk])));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Prediksi Paket"); XLSX.writeFile(wb, "prediksi-paket-" + ds(Math.floor(Date.now() / DAY)) + ".xlsx");
    };

    function render() {
      d = calc();
      if (!d.length) { body.innerHTML = '<div style="padding:20px;text-align:center;color:#9fb6c3">Belum ada paket berjalan dengan tanggal mulai &amp; selesai. Isi lewat menu Paket (atau "Muat Contoh").</div>'; return; }
      const cnt = k => d.filter(x => x.risk === k).length, den = d.reduce((a, x) => a + (x.denda || 0), 0);
      const kpi = (l, v, c) => '<div style="flex:1;min-width:120px;background:#0b2a3b;border-radius:10px;padding:9px"><div style="color:#9fb6c3;font-size:11px">' + l + '</div><div style="font-size:18px;font-weight:700;color:' + (c || "#e6f1f7") + '">' + v + "</div></div>";
      body.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap">' + kpi("Paket berjalan", d.length) + kpi("Aman", cnt("Aman"), RC.Aman) + kpi("Waspada", cnt("Waspada"), RC.Waspada) + kpi("Kritis", cnt("Kritis"), RC.Kritis) + kpi("Potensi denda", rp(den), den ? RC.Kritis : RC.Aman) + '</div><div id="kvG" style="margin:10px 0"></div><div id="kvI" style="margin-bottom:8px;color:#9fb6c3"></div>' +
        '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;min-width:760px"><thead><tr style="text-align:left;color:#22d3ee"><th>Paket</th><th>Renc.%</th><th>Fisik%</th><th>SPI</th><th>Prakiraan selesai</th><th>Telat</th><th>Potensi denda</th><th>Perlu %/mg</th><th>Risiko</th></tr></thead><tbody>' +
        d.map((x, i) => '<tr data-i="' + i + '" style="border-top:1px solid #ffffff14;cursor:pointer"><td>' + esc(x.p.kode) + " \u00b7 " + esc(x.p.nama) + "</td><td>" + x.rencana.toFixed(0) + "</td><td>" + x.f + "</td><td>" + (x.spi == null ? "\u2013" : x.spi.toFixed(2)) + "</td><td>" + (x.end == null ? "tidak terukur" : fmt(x.end)) + "</td><td>" + (x.late == null ? "\u2013" : x.late + " hr") + "</td><td>" + (x.denda == null ? "\u2013" : rp(x.denda)) + "</td><td>" + x.perlu.toFixed(1) + " <span style='color:#9fb6c3'>(rata " + x.rata.toFixed(1) + ")</span></td><td><b style=\"color:" + RC[x.risk] + '">' + x.risk + "</b></td></tr>").join("") + "</tbody></table></div>" +
        '<div style="color:#9fb6c3;margin-top:10px;font-size:11.5px">Metode Earned Schedule: SPI(t) = waktu rencana yang setara progres fisik \u00f7 waktu berjalan; prakiraan durasi = durasi kontrak \u00f7 SPI. Denda indikatif 1\u2030/hari nilai kontrak (maks 5%) \u2014 sesuaikan dengan klausul kontrak. Risiko: Aman (tepat waktu), Waspada (telat \u2264 30 hari), Kritis (&gt; 30 hari / progres 0). Rencana berbentuk S adalah asumsi; pilih linear bila kontrak memakai rencana lurus. Prakiraan memakai laju sejauh ini dan bisa berubah bila ada percepatan.</div>';
      const show = i => {
        const x = d[i], sel = body.querySelector("#kvG");
        sel.innerHTML = chart(x);
        body.querySelector("#kvI").innerHTML = "<b style='color:#e6f1f7'>" + esc(x.p.nama) + "</b> \u2014 butuh <b style='color:#e6f1f7'>" + x.perlu.toFixed(1) + "%/minggu</b> agar selesai sesuai kontrak (laju rencana " + x.rata.toFixed(1) + "%/minggu)" + (x.keu - x.f > 15 ? ". <span style='color:#facc15'>Keuangan (" + x.keu + "%) mendahului fisik (" + x.f + "%).</span>" : "") + (x.p.lat && x.p.lng ? " <a href='#' id='kvMap' style='color:#22d3ee'>Lihat di peta</a>" : "");
        const m = body.querySelector("#kvMap"); if (m) m.onclick = e => { e.preventDefault(); close(); try { map.flyTo([x.p.lat, x.p.lng], 15, { duration: .6 }); } catch (er) { } };
      };
      body.querySelectorAll("tr[data-i]").forEach(tr => tr.onclick = () => show(+tr.dataset.i)); show(0);
    }
    render();
  }

  function init() {
    const b = $("button", "", '<i class="fa-solid fa-chart-area"></i>'); b.title = "Kurva S & prediksi keterlambatan paket"; b.onclick = open;
    try { PQ_DOCK.adopt(b, "Kurva S paket"); } catch (e) { b.style.cssText = "position:fixed;left:10px;bottom:170px;z-index:900"; document.body.append(b); }
  }
  window.PETAQU_KURVAS = { open, calc, _setMode: m => { MODE = m; } };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
