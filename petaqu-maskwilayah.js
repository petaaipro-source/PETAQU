/* PETAQU Transparansi Wilayah: memperluas "Transparansi luar Jawa Tengah" -> pilih provinsi / kab-kota MANA PUN (banyak sekaligus).
   Mode: terang hanya di wilayah terpilih (luar diredupkan) ATAU wilayah terpilih yang diredupkan. Kosong = bawaan Jawa Tengah. */
(function () {
  "use strict";
  const KEY = "petaqu_mask_wil_v1", $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let sel = new Set(), inv = false, K = null, DLG = null, OP = new Set(), tm = 0, loading = false;
  try { const o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o) { sel = new Set(o.sel || []); inv = !!o.inv; } } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ sel: [...sel], inv })); } catch (e) { } };
  function dec(s) { let i = 0, la = 0, lo = 0, o = []; while (i < s.length) { let b, sh = 0, r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); la += r & 1 ? ~(r >> 1) : r >> 1; sh = 0; r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lo += r & 1 ? ~(r >> 1) : r >> 1; o.push([la / 1e5, lo / 1e5]); } return o; }
  function data(cb) {
    if (window.PQ_KABBATAS) return cb();
    if (loading) return setTimeout(() => data(cb), 400); loading = true;
    const s = document.createElement("script"); s.src = "data-kabbatas.js"; s.onload = () => { loading = false; cb(); }; s.onerror = () => { loading = false; }; document.head.appendChild(s);
  }
  function kabs() { if (K) return K; K = []; const D = window.PQ_KABBATAS || {}; for (const p in D) D[p].forEach(k => K.push({ p, n: k[0], enc: k[1], rings: null })); return K; }
  const ringsOf = k => k.rings || (k.rings = k.enc.map(dec));
  function names() {
    if (!sel.size) return "Jawa Tengah (bawaan)"; const a = [...sel].map(x => { const q = x.split("|"); return q[0] === "P" ? q[1] : q[2]; });
    return a.length > 3 ? a.slice(0, 3).join(", ") + " +" + (a.length - 3) : a.join(", ");
  }
  function apply(fit) {
    if (!window.__pqJtRebuild) return;
    const doIt = () => {
      let R = [], pts = [];
      if (sel.size) kabs().forEach(k => { if (sel.has("P|" + k.p) || sel.has("K|" + k.p + "|" + k.n)) ringsOf(k).forEach(r => { R.push(r); }); });
      window.__pqJtR = R.length ? R : null; window.__pqJtRebuild(inv);
      if (sel.size) { try { window.setJatengMask(true); } catch (e) { } }
      if (fit && R.length && window.map && window.L) { let b = L.latLngBounds([]); R.forEach(r => r.forEach(q => b.extend(q))); try { map.fitBounds(b, { padding: [30, 30], maxZoom: 12 }); } catch (e) { } }
      paint();
    };
    sel.size ? data(doIt) : doIt();
  }
  const later = fit => { clearTimeout(tm); tm = setTimeout(() => apply(fit), 160); };
  function paint() {
    document.querySelectorAll(".jt-reg").forEach(c => {
      if (!c.dataset.ok) { c.dataset.ok = 1; c.innerHTML = '<div class="jw-sum"></div><div class="jw-bt"><button type="button" data-j="pick">\u{1F4CD} Pilih wilayah</button><button type="button" data-j="inv"></button><button type="button" data-j="def" title="Kembali ke Jawa Tengah">Jateng</button></div>'; c.addEventListener("click", e => { const j = e.target.dataset && e.target.dataset.j; if (!j) return; e.stopPropagation(); if (j === "pick") dlg(true); else if (j === "inv") { inv = !inv; save(); apply(false); } else if (j === "def") { sel.clear(); save(); apply(true); if (!sel.size) { try { map.setView([-7.15, 110.2], 8); } catch (x) { } } } }); }
      c.querySelector(".jw-sum").innerHTML = "Wilayah: <b>" + esc(names()) + "</b>";
      c.querySelector("[data-j=inv]").textContent = inv ? "Mode: redupkan wilayah" : "Mode: redupkan luar";
    });
    document.querySelectorAll(".jt-lt").forEach(x => x.textContent = inv ? "Redupkan wilayah terpilih" : "Kosongkan peta di luar wilayah terpilih");
    const b = $("pqjwCnt"); if (b) b.textContent = sel.size ? sel.size + " dipilih" : "bawaan";
  }
  function chg() { save(); paint(); later(false); }
  function list() {
    const L2 = $("pqjwL"), st = L2.scrollTop, q = ($("pqjwQ").value || "").trim().toLowerCase(), by = {}; kabs().forEach(k => (by[k.p] = by[k.p] || []).push(k)); let h = "";
    Object.keys(by).sort().forEach(p => {
      const ks = by[p], pm = p.toLowerCase().indexOf(q) >= 0, ms = q ? ks.filter(k => pm || k.n.toLowerCase().indexOf(q) >= 0) : ks; if (q && !ms.length) return;
      const all = sel.has("P|" + p), ns = ks.filter(k => sel.has("K|" + p + "|" + k.n)).length, op = OP.has(p) || (q && !pm);
      h += '<div class="jw-p"><label><input type="checkbox" data-p="' + esc(p) + '"' + (all ? " checked" : "") + (!all && ns ? ' data-ind="1"' : "") + '> <b>' + esc(p) + '</b></label><small>' + (all ? "semua" : ns ? ns + "/" + ks.length : ks.length + " kab/kota") + '</small><span data-o="' + esc(p) + '">' + (op ? "\u25BE" : "\u25B8") + '</span></div>';
      if (op) h += '<div class="jw-k">' + ms.map(k => '<label><input type="checkbox" data-k="' + esc(p) + '|' + esc(k.n) + '"' + (all || sel.has("K|" + p + "|" + k.n) ? " checked" : "") + (all ? " disabled" : "") + '> ' + esc(k.n) + '</label>').join("") + '</div>';
    });
    L2.innerHTML = h || "<div style='padding:10px;opacity:.7'>Tidak ditemukan.</div>"; L2.querySelectorAll("[data-ind]").forEach(x => x.indeterminate = true); L2.scrollTop = st;
  }
  function dlg(show) {
    if (!DLG) {
      const css = document.createElement("style"); css.textContent = ".jw-sum{margin:8px 0 6px;font-size:12px}.jw-bt{display:flex;flex-wrap:wrap;gap:5px}.jw-bt button{flex:1;background:#0e7490;color:#fff;border:0;border-radius:7px;padding:6px 8px;font-size:11.5px;cursor:pointer;white-space:nowrap}.jw-bt button[data-j=def]{flex:0 0 auto;background:#334155}#pqjw{position:fixed;z-index:3300;left:50%;top:50%;transform:translate(-50%,-50%);width:min(380px,94vw);max-height:80vh;display:none;flex-direction:column;background:#071a26;color:#e6f1f7;border:1px solid #22d3ee77;border-radius:14px;font:13px system-ui;box-shadow:0 10px 40px #000c}#pqjw header{display:flex;align-items:center;gap:8px;padding:10px 12px;font-weight:700;border-bottom:1px solid #ffffff18}#pqjw header span{flex:1}#pqjw header small{color:#22d3ee;font-weight:600}#pqjw header button{background:none;border:0;color:#9fb6c3;font-size:18px;cursor:pointer}.jw-tb{display:flex;gap:5px;padding:8px 12px;flex-wrap:wrap}.jw-tb input{flex:1 1 100%;background:#0b2736;color:#e6f1f7;border:1px solid #ffffff22;border-radius:7px;padding:7px}.jw-tb button{flex:1;background:#0e7490;color:#fff;border:0;border-radius:7px;padding:6px;cursor:pointer;font-size:12px}#pqjwL{overflow:auto;padding:0 12px 6px;flex:1;min-height:120px}.jw-p{display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #ffffff10}.jw-p label{flex:1;display:flex;gap:7px;align-items:center;cursor:pointer}.jw-p small{color:#9fb6c3}.jw-p span{cursor:pointer;width:20px;text-align:center;color:#22d3ee}.jw-k{padding:2px 0 6px 24px;display:grid;grid-template-columns:1fr 1fr;gap:3px 8px}.jw-k label{display:flex;gap:5px;align-items:center;cursor:pointer;font-size:12px}.jw-ft{display:flex;gap:6px;padding:8px 12px;border-top:1px solid #ffffff18}.jw-ft button{flex:1;background:#0e7490;color:#fff;border:0;border-radius:8px;padding:8px;cursor:pointer;font-weight:600}.jw-ft button[data-d=m]{background:#334155}";
      document.head.appendChild(css);
      DLG = document.createElement("div"); DLG.id = "pqjw";
      DLG.innerHTML = '<header><span>Transparansi wilayah <small id="pqjwCnt"></small></span><button data-d="x">\u2715</button></header><div class="jw-tb"><input id="pqjwQ" placeholder="Cari provinsi / kabupaten / kota\u2026"><button data-d="all">Semua provinsi</button><button data-d="none">Kosongkan</button></div><div id="pqjwL">Memuat\u2026</div><div class="jw-ft"><button data-d="m"></button><button data-d="ok">Terapkan & zoom</button></div>';
      document.body.appendChild(DLG);
      DLG.addEventListener("click", e => { const t = e.target, d = t.dataset.d, o = t.dataset.o;
        if (d === "x") dlg(false); else if (d === "ok") { save(); dlg(false); apply(true); } else if (d === "all") { sel.clear(); Object.keys(window.PQ_KABBATAS || {}).forEach(p => sel.add("P|" + p)); chg(); list(); } else if (d === "none") { sel.clear(); chg(); list(); }
        else if (d === "m") { inv = !inv; save(); apply(false); mlab(); } else if (o) { OP.has(o) ? OP.delete(o) : OP.add(o); list(); } });
      DLG.addEventListener("change", e => { const t = e.target;
        if (t.dataset.p) { const p = t.dataset.p; [...sel].forEach(x => { if (x.indexOf("K|" + p + "|") === 0) sel.delete(x); }); t.checked ? sel.add("P|" + p) : sel.delete("P|" + p); chg(); list(); }
        else if (t.dataset.k) { const k = "K|" + t.dataset.k; t.checked ? sel.add(k) : sel.delete(k); chg(); list(); } });
      $("pqjwQ").addEventListener("input", list);
    }
    if (show === false) { DLG.style.display = "none"; return; }
    DLG.style.display = "flex"; mlab(); paint(); data(() => list());
  }
  const mlab = () => { const b = DLG && DLG.querySelector("[data-d=m]"); if (b) b.textContent = inv ? "Mode: redupkan wilayah \u21C4" : "Mode: redupkan luar \u21C4"; };
  window.PETAQU_MASKWIL = { open: () => dlg(true), apply };
  let tries = 0; const iv = setInterval(() => { tries++; paint(); if (window.__pqJtRebuild && !window.__pqJtInit) { window.__pqJtInit = 1; if (sel.size || inv) apply(false); } if (tries > 400) clearInterval(iv); }, 1200);
})();
