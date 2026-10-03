/* PETAQU — Panel fleksibel (Jalan Nasional, Patok KM, Kabupaten).
   Tujuan: peta di bawah panel bisa dilihat lebih luas di layar apa pun.
     1. Tombol ringkas (chevron) di kepala panel: menyembunyikan isi, kepala (judul + statistik +
        saklar ON/OFF + tutup) tetap tampil. Klik judul juga sama. Pilihan diingat per panel.
     2. Kartu Lintas Utara/Tengah/Selatan tampil RINGKAS satu baris (nama · ruas · km);
        keterangan rute bisa dibuka lewat tombol "Keterangan rute". Pilihan diingat.
     3. Tinggi panel & daftar menyesuaikan tinggi layar (HP: maks. 62% layar).
   Tidak mengubah logika panel lama; hanya menambah kelas CSS dan tombol. */
(function () {
  "use strict";
  if (window.__pqPanel) return;
  window.__pqPanel = 1;

  var KEY = "petaqu_panel_ui_v1";
  var IDS = ["jnPanel", "pkPanel", "kbPanel"];
  var st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { st = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function ent(id) { return st[id] || (st[id] = {}); }

  var SEL = IDS.map(function (i) { return "#" + i; }).join(",");
  function sel(suffix) { return IDS.map(function (i) { return "html body #" + i + (suffix || ""); }).join(","); }

  var CSS = [
    ":root{--pq-pmax:9999px}",
    "@media(max-width:860px){:root{--pq-pmax:62dvh}}",
    ".pq-fi{font-family:'Font Awesome 6 Free';font-weight:900;font-style:normal;line-height:1;display:block}",
    ".pq-minbtn{flex:none;width:30px;height:30px;padding:0;border:0;border-radius:50%;background:transparent;color:#8fa6bd;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s}",
    ".pq-minbtn:hover,.pq-minbtn:focus-visible{background:#ffffff14;color:#fff;outline:0}",
    ".pq-minbtn .pq-fi{font-size:13px}",
    sel(" header>div:first-child") + "{cursor:pointer;user-select:none;-webkit-user-select:none}",
    /* ringkas: hanya kepala yang tersisa */
    sel(".pq-min .body") + "{display:none!important}",
    sel(".pq-min") + "{max-height:none!important;height:auto!important}",
    sel(".pq-min header") + "{padding-bottom:12px}",
    /* daftar mengikuti tinggi layar */
    "html body #jnList,html body #pkList{max-height:clamp(110px,30dvh,300px)!important}",
    /* kartu lintas: ringkas satu baris per lintas */
    "html body #jnPanel:not(.pq-detail) .jn-route{display:none}",
    "html body #jnPanel:not(.pq-detail) .jn-chips{gap:5px}",
    "html body #jnPanel:not(.pq-detail) .jn-chip{align-items:center;padding:7px 10px}",
    "html body #jnPanel:not(.pq-detail) .jn-chip>i{margin-top:0}",
    "html body #jnPanel:not(.pq-detail) .jn-chip>div{display:flex;align-items:baseline;flex-wrap:wrap;column-gap:9px;row-gap:0;min-width:0}",
    "html body #jnPanel:not(.pq-detail) .jn-chip small{margin-top:0}",
    ".pq-detailbtn{align-self:flex-end;margin:-4px 0 -2px;padding:3px 4px;border:0;background:transparent;color:#8fa6bd;font:600 11px/1.2 system-ui,sans-serif;cursor:pointer}",
    ".pq-detailbtn:hover{color:#22d3ee}",
    ".pq-detailbtn .pq-fi{display:inline-block;font-size:9px;margin-left:5px;vertical-align:1px}"
  ].join("\n");

  function setMin(p, btn, v) {
    p.classList.toggle("pq-min", !!v);
    btn.firstChild.textContent = v ? "\uf078" : "\uf077";
    btn.setAttribute("aria-expanded", v ? "false" : "true");
    btn.title = v
      ? "Tampilkan isi panel"
      : "Ringkas panel — sembunyikan isi agar peta lebih luas";
    ent(p.id).min = !!v;
  }

  function wirePanel(id) {
    var p = document.getElementById(id);
    if (!p || p.getAttribute("data-pq-panel")) return;
    var head = p.querySelector("header");
    if (!head) return;
    p.setAttribute("data-pq-panel", "1");

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pq-minbtn";
    btn.innerHTML = '<i class="pq-fi">\uf077</i>';
    var x = head.querySelector(".x");
    if (x) head.insertBefore(btn, x); else head.appendChild(btn);

    function toggle() { setMin(p, btn, !p.classList.contains("pq-min")); save(); }
    btn.onclick = function (e) { e.stopPropagation(); toggle(); };
    var title = head.firstElementChild;
    if (title && title.tagName === "DIV") title.addEventListener("click", toggle);

    setMin(p, btn, !!ent(id).min);

    if (id === "jnPanel") wireDetail(p);
  }

  function wireDetail(p) {
    var chips = document.getElementById("jnChips");
    if (!chips || p.querySelector(".pq-detailbtn")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "pq-detailbtn";
    chips.parentNode.insertBefore(b, chips);
    function paint() {
      var d = p.classList.contains("pq-detail");
      b.innerHTML = (d ? "Sembunyikan keterangan rute" : "Keterangan rute") + '<i class="pq-fi">' + (d ? "\uf077" : "\uf078") + "</i>";
      b.setAttribute("aria-pressed", d ? "true" : "false");
    }
    p.classList.toggle("pq-detail", !!ent("jnPanel").detail);
    b.onclick = function () {
      p.classList.toggle("pq-detail");
      ent("jnPanel").detail = p.classList.contains("pq-detail");
      save();
      paint();
    };
    paint();
  }

  function init() {
    if (!document.getElementById("pqPanelCss")) {
      var s = document.createElement("style");
      s.id = "pqPanelCss";
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    IDS.forEach(wirePanel);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
