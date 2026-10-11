/* PETAQU — Legenda ADAPTIF: hanya menampilkan apa yang sedang dipetakan
   • Ringkasan otomatis: jumlah ruas & panjang (km) yang benar-benar tampil di peta, daftar ruas berwarna (terpanjang dulu),
     Jalan Nasional per kabupaten/provinsi yang dihidupkan.
   • Baris Aspal / Rigid Beton / Belum ditandai ikut dihitung (km) dan disembunyikan bila tidak ada di peta.
   • Titik STA / "Ruas jalan tersurvei" disembunyikan bila tidak ada ruas tampil; kosong -> "Belum ada data tampil".
   • Mode IRI / warna per kabupaten tetap memakai legenda aslinya + ringkasan di atasnya.
   • Tinggi isi dibatasi & bisa digulir sehingga tidak menutupi peta di layar kecil.
   • Ringan: pembaruan ditunda (debounce) & hanya dipicu saat ruas ditampilkan/disembunyikan/digambar ulang. */
(function () {
  "use strict";
  if (window.__pqLegenda) return;
  var W = window, T = 0, busy = false;
  var css = [
    "#legendContent{max-height:min(38vh,300px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}",
    "@media(max-width:860px){#legendContent{max-height:min(26vh,200px)}}",
    ".pqlg-sec{font:800 9.5px system-ui;letter-spacing:.7px;text-transform:uppercase;color:#7dd3fc;margin:2px 0 4px}",
    ".pqlg-r{display:flex;align-items:center;gap:7px;margin:3px 0;line-height:1.25;color:var(--text,#e6edf5)}",
    ".pqlg-r i{flex:none;width:18px;height:0;border-top:3px solid var(--c,#22d3ee);border-radius:2px}",
    ".pqlg-r span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pqlg-r em{flex:none;font-style:normal;font:700 10px ui-monospace,monospace;color:#9fb6c3}",
    ".pqlg-sum{border-bottom:1px solid #ffffff17;padding-bottom:5px;margin-bottom:6px}",
    ".pqlg-empty{color:#9fb6c3;font-style:italic;padding:2px 0}",
    ".pqlg-km{margin-left:6px;font:700 10px ui-monospace,monospace;color:#9fb6c3}"
  ].join("\n");
  var st = document.createElement("style"); st.id = "pqlg-css"; st.textContent = css; document.head.appendChild(st);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function km1(v) { return (Math.round(v * 10) / 10).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function G(n) {
    try {
      switch (n) {
        case "roads": return typeof roads !== "undefined" ? roads : undefined;
        case "layers": return typeof layers !== "undefined" ? layers : undefined;
        case "map": return typeof map !== "undefined" ? map : undefined;
        case "iriMode": return typeof iriMode !== "undefined" ? iriMode : false;
        case "globalDisplay": return typeof globalDisplay !== "undefined" ? globalDisplay : undefined;
        case "roadLengthKm": return typeof roadLengthKm !== "undefined" ? roadLengthKm : undefined;
      }
    } catch (e) {}
    return undefined;
  }

  function visibleRoads() {
    var rs = G("roads"), ly = G("layers"), m = G("map"), out = [];
    if (!rs || !rs.length) return out;
    rs.forEach(function (r) {
      if (!r || r.visible === false) return;
      var l = ly && ly[r.id]; if (m && l && l.group && m.hasLayer && !m.hasLayer(l.group)) return;
      out.push(r);
    });
    return out;
  }
  function lenKm(r) { try { var f = G("roadLengthKm"); return f ? +f(r) || 0 : 0; } catch (e) { return 0; } }

  function build() {
    busy = false;
    var box = document.getElementById("legendContent"); if (!box) return;
    var iri = !!G("iriMode"), gd = G("globalDisplay") || {}, kab = !!gd.colorByKabupatenOn;
    var rs = visibleRoads(), info = null;
    try { info = typeof W.__pqNasInfo === "function" ? W.__pqNasInfo() : null; } catch (e) {}
    var nas = info && info.n > 0 ? info : null;
    var sum = "", tot = 0;
    rs.forEach(function (r) { r._lk = lenKm(r); tot += r._lk; });
    sum += '<div class="pqlg-sec">Sedang dipetakan</div>';
    if (rs.length) {
      var sorted = rs.slice().sort(function (a, b) { return b._lk - a._lk; }), show = sorted.slice(0, 5);
      if (!iri && !kab && rs.length <= 8) show = sorted.slice(0, 8);
      sum += '<div class="pqlg-r"><span><b style="color:var(--text,#e6edf5)">Ruas tersurvei</b> · ' + rs.length + ' ruas</span><em>' + km1(tot) + ' km</em></div>';
      if (!iri && !kab) {
        show.forEach(function (r) { sum += '<div class="pqlg-r" style="--c:' + esc(r.color || "#22d3ee") + '" title="' + esc(r.name) + '"><i></i><span>' + esc(r.name) + '</span><em>' + km1(r._lk) + '</em></div>'; });
        if (rs.length > show.length) { var rest = 0; sorted.slice(show.length).forEach(function (r) { rest += r._lk; }); sum += '<div class="pqlg-r"><span style="color:#9fb6c3">+ ' + (rs.length - show.length) + ' ruas lainnya</span><em>' + km1(rest) + '</em></div>'; }
      }
    }
    if (nas) sum += '<div class="pqlg-r" style="--c:#38bdf8"><i></i><span><b style="color:var(--text,#e6edf5)">Jalan Nasional</b> · ' + nas.n + ' ruas</span><em>' + km1(nas.km) + ' km</em></div>';
    if (!rs.length && !nas) sum += '<div class="pqlg-empty">Belum ada data tampil di peta</div>';
    var holder = document.createElement("div"); holder.className = "pqlg-sum"; holder.innerHTML = sum;

    /* legenda bawaan (mode/warna) dirapikan: baris perkerasan dihitung km, baris tak relevan disembunyikan */
    var old = box.querySelector(".pqlg-orig");
    var cont = old;
    if (!cont) { cont = document.createElement("div"); cont.className = "pqlg-orig"; Array.prototype.slice.call(box.childNodes).forEach(function (n) { if (!(n.classList && n.classList.contains("pqlg-sum"))) cont.appendChild(n); }); }
    var cur = box.querySelector(".pqlg-sum"); if (cur) cur.remove();
    box.innerHTML = ""; box.appendChild(holder); box.appendChild(cont);

    var bd = { aspal: 0, rigid: 0, belum: 0 }, has = typeof W.roadKonstruksiBreakdown === "function";
    if (has) rs.forEach(function (r) { try { var b = W.roadKonstruksiBreakdown(r); if (b) { bd.aspal += b.aspal || 0; bd.rigid += b.rigid || 0; bd.belum += b.belum || 0; } } catch (e) {} });
    Array.prototype.forEach.call(cont.children, function (row) {
      var t = (row.textContent || "").trim(), old2 = row.querySelector(".pqlg-km"); if (old2) old2.remove();
      var key = /^Aspal/i.test(t) ? "aspal" : /^Rigid/i.test(t) ? "rigid" : /^Belum ditandai/i.test(t) ? "belum" : "";
      if (key && has) {
        row.style.display = bd[key] > 0.0005 ? "" : "none";
        if (bd[key] > 0.0005) { var s = document.createElement("span"); s.className = "pqlg-km"; s.textContent = km1(bd[key]) + " km"; row.appendChild(s); }
      } else if (/Titik STA|Ruas jalan tersurvei/i.test(t)) row.style.display = rs.length ? "" : "none";
    });
  }
  function refresh() { if (busy) return; busy = true; clearTimeout(T); T = setTimeout(build, 140); }
  W.__pqLegendRefresh = refresh;

  function wrap(name) {
    var f = W[name]; if (typeof f !== "function" || f.__pqlg) return;
    var w = function () { var r = f.apply(this, arguments); try { refresh(); } catch (e) {} return r; }; w.__pqlg = 1;
    try { W[name] = w; } catch (e) {}
  }
  function init() {
    if (!document.getElementById("legendContent") || typeof W.updateLegendForMode !== "function") return setTimeout(init, 400);
    ["updateLegendForMode", "toggleRoadVisibility", "showAll", "hideAll", "renderRoadLayer", "clearLayer", "persist", "toggleIriMode", "toggleColorByKabupaten"].forEach(wrap);
    refresh(); setTimeout(refresh, 1500);
  }
  W.__pqLegenda = { v: 1, refresh: refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
