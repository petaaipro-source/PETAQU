/* PETAQU — Legenda ADAPTIF v2: apa yang sedang dipetakan, lengkap, bisa digulir & diklik
   • SEMUA ruas yang tampil di peta didaftar (warna garis = warna di peta, panjang km). Daftar bisa digulir;
     ringkasan, bar komposisi perkerasan, pencarian & urutan tetap menempel di atas (sticky).
   • KLIK baris ruas = zoom ke ruas itu; tombol ✕ = sembunyikan ruas dari peta (langsung hilang dari daftar).
   • Pencarian (nama ruas / kabupaten) & urutan: Km terbesar -> A–Z -> urutan data; muncul otomatis bila ruas banyak.
   • Bar komposisi Aspal / Rigid Beton / Belum ditandai (km) dari ruas yang tampil; baris kosong disembunyikan.
   • Jalan Nasional yang dihidupkan didaftar per kabupaten/provinsi, klik = zoom.
   • Mode IRI / warna per kabupaten memakai legenda aslinya + ringkasan di atasnya.
   • Ringan: pembaruan ditunda (debounce); hanya dipicu saat ruas ditampilkan/disembunyikan/digambar ulang. */
(function () {
  "use strict";
  if (window.__pqLegenda) return;
  var W = window, T = 0, busy = false, LIM = 400, S = { q: "", sort: "km" }, SORTS = { km: "Km ↓", az: "A–Z", ord: "Urutan" };
  var css = [
    "#legendContent{max-height:min(46vh,380px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#38bdf8aa transparent;padding-right:2px}",
    "@media(max-width:860px){#legendContent{max-height:min(34vh,260px)}}",
    "html body #legend{max-width:min(340px,calc(100vw - 28px))}",
    ".pqlg-head{position:sticky;top:0;z-index:2;background:#0f1521;padding-bottom:5px;margin-bottom:2px}",
    ".pqlg-sec{font:800 9.5px system-ui;letter-spacing:.7px;text-transform:uppercase;color:#7dd3fc;margin:2px 0 5px}",
    ".pqlg-top{display:flex;align-items:baseline;gap:6px;color:var(--text,#e6edf5);font:700 11.5px system-ui}",
    ".pqlg-top b{flex:1;min-width:0;white-space:nowrap}.pqlg-top span{color:#9fb6c3;font-weight:600}.pqlg-top em{font-style:normal;font:700 11px ui-monospace,monospace;color:#e6edf5}",
    ".pqlg-bar{display:flex;height:6px;border-radius:4px;overflow:hidden;background:#ffffff14;margin:5px 0 3px}.pqlg-bar s{display:block;height:100%}",
    ".pqlg-ctl{display:flex;gap:6px;margin-top:5px}.pqlg-ctl input{flex:1;min-width:0;box-sizing:border-box;background:#0b1220;border:1px solid #2b3a52;color:#e6edf5;border-radius:7px;padding:4px 8px;font:11px system-ui;outline:none}.pqlg-ctl input:focus{border-color:#38bdf8}",
    ".pqlg-ctl button{flex:none;border:1px solid #2b3a52;background:#0b1220;color:#cfe0f0;border-radius:7px;padding:3px 8px;font:700 10.5px system-ui;cursor:pointer}.pqlg-ctl button:hover{border-color:#38bdf8}",
    ".pqlg-r{display:flex;align-items:center;gap:7px;margin:1px 0;padding:3px 4px;border-radius:7px;line-height:1.25;color:var(--text,#e6edf5)}",
    ".pqlg-r i{flex:none;width:18px;height:0;border-top:3px solid var(--c,#22d3ee);border-radius:2px}",
    ".pqlg-r span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pqlg-r em{flex:none;font-style:normal;font:700 10px ui-monospace,monospace;color:#9fb6c3}",
    ".pqlg-c{cursor:pointer}.pqlg-c:hover,.pqlg-c:focus-visible{background:#38bdf822;outline:none}",
    ".pqlg-x{flex:none;width:18px;height:18px;line-height:16px;text-align:center;border:0;border-radius:50%;background:transparent;color:#7f93a6;font-size:11px;cursor:pointer;padding:0;opacity:.55}.pqlg-x:hover{background:#f43f5e33;color:#fda4af;opacity:1}",
    ".pqlg-n{color:#9fb6c3;font-size:10px;padding:2px 4px}",
    ".pqlg-empty{color:#9fb6c3;font-style:italic;padding:3px 0}",
    ".pqlg-gap{margin-top:6px;padding-top:5px;border-top:1px solid #ffffff17}",
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
    rs.forEach(function (r, i) {
      if (!r || r.visible === false) return;
      var l = ly && ly[r.id]; if (m && l && l.group && m.hasLayer && !m.hasLayer(l.group)) return;
      r._lo = i; out.push(r);
    });
    return out;
  }
  function lenKm(r) { try { var f = G("roadLengthKm"); return f ? +f(r) || 0 : 0; } catch (e) { return 0; } }

  var cache = { rs: [], iri: false, kab: false };
  function listHtml() {
    var rs = cache.rs, q = S.q.trim().toLowerCase(), a = rs.filter(function (r) { return !q || (String(r.name || "") + " " + String(r.kabupaten || "")).toLowerCase().indexOf(q) >= 0; });
    if (S.sort === "km") a.sort(function (x, y) { return y._lk - x._lk; });
    else if (S.sort === "az") a.sort(function (x, y) { return String(x.name || "").localeCompare(String(y.name || ""), "id"); });
    else a.sort(function (x, y) { return x._lo - y._lo; });
    var h = "", shown = a.slice(0, LIM), plain = cache.iri || cache.kab;
    shown.forEach(function (r) {
      h += '<div class="pqlg-r pqlg-c" role="button" tabindex="0" data-id="' + esc(r.id) + '" style="--c:' + esc(plain ? "#7c8aa0" : (r.color || "#22d3ee")) + '" title="Klik untuk zoom ke ruas · ' + esc(r.name) + '"><i></i><span>' + esc(r.name) + '</span><em>' + km1(r._lk) + '</em><button type="button" class="pqlg-x" data-hide="' + esc(r.id) + '" title="Sembunyikan ruas dari peta" aria-label="Sembunyikan">✕</button></div>';
    });
    if (a.length > shown.length) h += '<div class="pqlg-n">Menampilkan ' + shown.length + ' dari ' + a.length + ' ruas — gunakan pencarian untuk menyaring.</div>';
    if (!a.length && rs.length) h = '<div class="pqlg-empty">Tidak ada ruas cocok dengan pencarian</div>';
    return h;
  }
  function renderList() { var l = document.getElementById("pqlgList"); if (l) l.innerHTML = listHtml(); }

  function build() {
    busy = false;
    var box = document.getElementById("legendContent"); if (!box) return;
    var iri = !!G("iriMode"), gd = G("globalDisplay") || {}, kab = !!gd.colorByKabupatenOn;
    var rs = visibleRoads(), info = null, tot = 0;
    try { info = typeof W.__pqNasInfo === "function" ? W.__pqNasInfo() : null; } catch (e) {}
    rs.forEach(function (r) { r._lk = lenKm(r); tot += r._lk; });
    cache = { rs: rs, iri: iri, kab: kab };

    /* simpan isi legenda bawaan (dipakai ulang bila belum diganti ulang oleh aplikasi) */
    var cont = box.querySelector(".pqlg-orig");
    if (!cont) { cont = document.createElement("div"); cont.className = "pqlg-orig"; Array.prototype.slice.call(box.childNodes).forEach(function (n) { cont.appendChild(n); }); }

    var bd = { aspal: 0, rigid: 0, belum: 0 }, has = typeof W.roadKonstruksiBreakdown === "function", cols = {};
    if (has) rs.forEach(function (r) { try { var b = W.roadKonstruksiBreakdown(r); if (b) { bd.aspal += b.aspal || 0; bd.rigid += b.rigid || 0; bd.belum += b.belum || 0; } } catch (e) {} });
    var surf = has && !iri && !kab;
    Array.prototype.forEach.call(cont.children, function (row) {
      var t = (row.textContent || "").trim(), old2 = row.querySelector(".pqlg-km"); if (old2) old2.remove();
      var key = /^Aspal/i.test(t) ? "aspal" : /^Rigid/i.test(t) ? "rigid" : /^Belum ditandai/i.test(t) ? "belum" : "";
      if (key && has) {
        var dot = row.querySelector(".iri-legend-dot"); try { if (dot) cols[key] = getComputedStyle(dot).backgroundColor; } catch (e) {}
        row.style.display = bd[key] > 0.0005 ? "" : "none";
        if (bd[key] > 0.0005) { var s = document.createElement("span"); s.className = "pqlg-km"; s.textContent = km1(bd[key]) + " km"; row.appendChild(s); }
      } else if (/Titik STA|Ruas jalan tersurvei/i.test(t)) row.style.display = rs.length ? "" : "none";
    });

    var h = '<div class="pqlg-head"><div class="pqlg-sec">Sedang dipetakan</div>';
    if (rs.length) {
      h += '<div class="pqlg-top"><b>Ruas tersurvei</b><span>' + rs.length + ' ruas</span><em>' + km1(tot) + ' km</em></div>';
      var sum = bd.aspal + bd.rigid + bd.belum;
      if (surf && sum > 0.001) h += '<div class="pqlg-bar" title="Aspal / Rigid Beton / Belum ditandai">' + ["aspal", "rigid", "belum"].map(function (k) { return bd[k] > 0.0005 ? '<s style="width:' + (bd[k] / sum * 100).toFixed(2) + '%;background:' + (cols[k] || { aspal: "#f59e0b", rigid: "#38bdf8", belum: "#7c8aa0" }[k]) + '"></s>' : ""; }).join("") + '</div>';
      if (rs.length > 6) h += '<div class="pqlg-ctl"><input id="pqlgQ" type="search" placeholder="Cari ruas / kabupaten…" value="' + esc(S.q) + '" aria-label="Cari ruas"><button type="button" id="pqlgSort" title="Ganti urutan daftar">' + SORTS[S.sort] + '</button></div>';
    } else if (!(info && info.n)) h += '<div class="pqlg-empty">Belum ada data tampil di peta</div>';
    h += '</div>';
    if (rs.length) h += '<div id="pqlgList">' + listHtml() + '</div>';
    if (info && info.n > 0) {
      h += '<div class="' + (rs.length ? "pqlg-gap" : "") + '"><div class="pqlg-top"><b style="color:#38bdf8">Jalan Nasional</b><span>' + info.n + ' ruas</span><em>' + km1(info.km) + ' km</em></div>';
      (info.groups || []).forEach(function (g) { h += '<div class="pqlg-r pqlg-c" role="button" tabindex="0" data-nas="' + g.gi + '" style="--c:#38bdf8" title="Klik untuk zoom"><i></i><span>' + esc(String(g.name).replace(/^Jalan Nasional /, "")) + '</span><em>' + km1(g.km) + '</em></div>'; });
      h += '</div>';
    }
    var top = document.createElement("div"); top.className = "pqlg-top-wrap"; top.innerHTML = h;
    box.innerHTML = ""; box.appendChild(top);
    var sep = document.createElement("div"); sep.className = "pqlg-gap"; if (cont.children.length) { box.appendChild(sep); sep.appendChild(cont); }
  }
  function refresh() { if (busy) return; busy = true; clearTimeout(T); T = setTimeout(build, 140); }
  W.__pqLegendRefresh = refresh;

  function focusRoad(id) {
    try { if (typeof W.focusRoad === "function") return W.focusRoad(id); } catch (e) {}
    try { var ly = G("layers"), m = G("map"); if (ly && ly[id] && m) m.fitBounds(ly[id].group.getBounds(), { padding: [40, 40], maxZoom: 17 }); } catch (e) {}
  }
  function act(t) {
    var x = t.closest("[data-hide]");
    if (x) { var id = x.getAttribute("data-hide"); try { if (typeof W.toggleRoadVisibility === "function") W.toggleRoadVisibility(id); } catch (e) {} return true; }
    var r = t.closest("[data-id]"); if (r) { focusRoad(r.getAttribute("data-id")); return true; }
    var n = t.closest("[data-nas]"); if (n && typeof W.__pqNasFocus === "function") { W.__pqNasFocus(+n.getAttribute("data-nas")); return true; }
    var s = t.closest("#pqlgSort"); if (s) { S.sort = S.sort === "km" ? "az" : S.sort === "az" ? "ord" : "km"; s.textContent = SORTS[S.sort]; renderList(); return true; }
    return false;
  }
  function wrap(name) {
    var f = W[name]; if (typeof f !== "function" || f.__pqlg) return;
    var w = function () { var r = f.apply(this, arguments); try { refresh(); } catch (e) {} return r; }; w.__pqlg = 1;
    try { W[name] = w; } catch (e) {}
  }
  function init() {
    var box = document.getElementById("legendContent");
    if (!box || typeof W.updateLegendForMode !== "function") return setTimeout(init, 400);
    box.addEventListener("click", function (e) { if (act(e.target)) { e.stopPropagation(); } });
    box.addEventListener("keydown", function (e) { if (e.target && e.target.id === "pqlgQ") { e.stopPropagation(); return; } if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-id],[data-nas]")) { e.preventDefault(); act(e.target); } });
    box.addEventListener("input", function (e) { if (e.target && e.target.id === "pqlgQ") { S.q = e.target.value; renderList(); } });
    ["updateLegendForMode", "toggleRoadVisibility", "showAll", "hideAll", "renderRoadLayer", "clearLayer", "persist", "toggleIriMode", "toggleColorByKabupaten"].forEach(wrap);
    refresh(); setTimeout(refresh, 1500);
  }
  W.__pqLegenda = { v: 2, refresh: refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
