/* PETAQU Atlas Rute Pesawat Indonesia — modul mandiri (tidak mengubah fitur lama, hanya menambah 1 tombol di dock).
   Lapisan: Bandara · Rute (busur great-circle per maskapai) · Pesawat simulasi beranimasi · Pesawat LIVE (ADS-B OpenSky) ·
   Cuaca & risiko bandara (Open-Meteo, gratis tanpa key) · Konektivitas hub · Jangkauan terbang 1/2/3 jam · Meridian zona waktu.
   Pintar: perencana rute multi-transit (Dijkstra), bandara cadangan, bandara terdekat dari pusat peta/GPS, wawasan jaringan, ekspor GeoJSON.
   Data rute bersifat INDIKATIF (pola umum jaringan), bukan jadwal resmi. Cuaca/risiko bukan pengganti METAR/BMKG. */
(function () {
  "use strict";
  if (window.__pqPesawat) return; window.__pqPesawat = 1;
  const KEY = "petaqu_pesawat_v2";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const gmap = () => { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } };

  /* ===================== DATA ===================== */
  // IATA|nama|kota|lat|lon|kelas(H hub internasional, I internasional, D domestik, P perintis/kecil)|bobot 1-5
  const AP = {}; `CGK|Soekarno-Hatta|Tangerang|-6.1256|106.6559|H|5
HLP|Halim Perdanakusuma|Jakarta|-6.2666|106.891|D|3
DPS|I Gusti Ngurah Rai|Bali|-8.7482|115.1672|H|5
SUB|Juanda|Surabaya|-7.3798|112.7869|H|4
YIA|Yogyakarta Intl|Kulon Progo|-7.9007|110.0573|I|3
JOG|Adisutjipto|Yogyakarta|-7.7882|110.4318|P|1
SRG|Ahmad Yani|Semarang|-6.9714|110.3742|I|2
SOC|Adi Soemarmo|Solo|-7.516|110.7569|D|2
BDO|Husein Sastranegara|Bandung|-6.9006|107.5763|D|2
KJT|Kertajati|Majalengka|-6.6489|108.1667|D|1
MLG|Abdul Rachman Saleh|Malang|-7.9266|112.7145|D|1
BWX|Banyuwangi|Banyuwangi|-8.3103|114.3405|D|1
KNO|Kualanamu|Medan|3.6422|98.8853|H|4
BTJ|Sultan Iskandar Muda|Banda Aceh|5.5236|95.4204|I|2
PDG|Minangkabau|Padang|-0.7869|100.2806|I|2
PKU|Sultan Syarif Kasim II|Pekanbaru|0.4608|101.4447|I|2
BTH|Hang Nadim|Batam|1.121|104.1189|I|3
TNJ|Raja Haji Fisabilillah|Tanjungpinang|0.9226|104.5324|D|1
PLM|Sultan Mahmud Badaruddin II|Palembang|-2.8983|104.6999|I|3
DJB|Sultan Thaha|Jambi|-1.638|103.6444|D|2
BKS|Fatmawati Soekarno|Bengkulu|-3.8637|102.3389|D|1
PGK|Depati Amir|Pangkalpinang|-2.162|106.139|D|1
TKG|Radin Inten II|Lampung|-5.2423|105.1789|D|2
PNK|Supadio|Pontianak|-0.1507|109.404|I|2
PKY|Tjilik Riwut|Palangka Raya|-2.2252|113.9433|D|1
BDJ|Syamsudin Noor|Banjarmasin|-3.4424|114.7625|I|2
BPN|SAMS Sepinggan|Balikpapan|-1.2683|116.8944|I|3
SRI|APT Pranoto|Samarinda|-0.3731|117.2574|D|1
TRK|Juwata|Tarakan|3.3267|117.5656|D|1
UPG|Sultan Hasanuddin|Makassar|-5.0617|119.554|H|4
MDC|Sam Ratulangi|Manado|1.5493|124.9259|I|2
PLW|Mutiara SIS Al-Jufri|Palu|-0.9185|119.9097|D|1
KDI|Haluoleo|Kendari|-4.0816|122.4177|D|1
LUW|Syukuran Aminuddin Amir|Luwuk|-1.0389|122.7728|P|1
GTO|Jalaluddin|Gorontalo|0.6371|122.8498|D|1
LOP|Lombok Intl|Praya|-8.7573|116.2767|I|2
BMU|Sultan M. Salahuddin|Bima|-8.5396|118.687|D|1
LBJ|Komodo|Labuan Bajo|-8.4867|119.8892|I|2
KOE|El Tari|Kupang|-10.1716|123.6711|D|2
WGP|Umbu Mehang Kunda|Waingapu|-9.6673|120.3025|P|1
TMC|Tambolaka|Sumba Barat Daya|-9.4097|119.2445|P|1
MOF|Frans Seda|Maumere|-8.6407|122.2369|P|1
AMQ|Pattimura|Ambon|-3.7103|128.0891|D|2
TTE|Sultan Babullah|Ternate|0.8314|127.3815|D|1
SOQ|Domine Eduard Osok|Sorong|-0.9264|131.1214|D|2
MKW|Rendani|Manokwari|-0.8918|134.049|D|1
BIK|Frans Kaisiepo|Biak|-1.19|136.108|D|1
DJJ|Sentani|Jayapura|-2.5769|140.5164|D|2
TIM|Mozes Kilangin|Timika|-4.5283|136.8874|D|1
MKQ|Mopah|Merauke|-8.5203|140.4183|D|1`.split("\n").forEach(l => { const p = l.split("|"); AP[p[0]] = { c: p[0], n: p[1], k: p[2], lat: +p[3], lon: +p[4], t: p[5], w: +p[6], nb: {} }; });
  const KELAS = { H: "Hub internasional", I: "Internasional", D: "Domestik", P: "Perintis/kecil" };
  const KCOL = { H: "#f43f5e", I: "#f59e0b", D: "#38bdf8", P: "#a3e635" };
  const AL = { GA: ["Garuda", "#38bdf8"], QG: ["Citilink", "#22c55e"], JT: ["Lion Air", "#ef4444"], ID: ["Batik Air", "#f97316"], IU: ["Super Air Jet", "#eab308"], SJ: ["Sriwijaya", "#a855f7"], QZ: ["AirAsia", "#f43f5e"], IW: ["Wings Air", "#14b8a6"], "8B": ["TransNusa", "#ec4899"] };
  const R_RAW = `CGK-DPS GA QG JT ID IU
CGK-SUB GA QG JT ID IU SJ
CGK-KNO GA QG JT ID IU
CGK-UPG GA QG JT ID
CGK-YIA GA QG JT ID IU
CGK-SRG GA QG JT ID
CGK-SOC GA QG JT
CGK-BDJ GA QG JT ID
CGK-BPN GA QG JT ID
CGK-PLM GA QG JT ID
CGK-PKU GA QG JT ID
CGK-PDG GA QG JT ID
CGK-BTH GA QG JT ID
CGK-PNK GA QG JT ID
CGK-MDC GA JT ID
CGK-AMQ GA JT ID
CGK-DJJ GA JT
CGK-SOQ GA JT
CGK-LOP GA QG JT ID
CGK-LBJ GA QG JT ID
CGK-KOE GA JT ID
CGK-BTJ GA JT
CGK-DJB QG JT ID SJ
CGK-TKG QG SJ
CGK-PGK SJ QG
CGK-BKS SJ
CGK-PKY QG JT
CGK-TRK GA JT
CGK-SRI JT
CGK-MLG JT ID
CGK-BWX QG
CGK-KDI JT ID
CGK-PLW JT
CGK-TNJ QG
CGK-MKW
HLP-SUB QG
HLP-DPS QG
HLP-SRG QG
BDO-DPS JT QG
KJT-DPS QG
DPS-SUB GA QG JT ID IU
DPS-UPG GA JT ID
DPS-LOP QG JT IW
DPS-LBJ GA QG JT ID IU
DPS-KOE GA JT
DPS-BTH QZ
DPS-KNO QZ
DPS-YIA IU
DPS-SRG JT
DPS-BPN JT
DPS-BDJ JT
SUB-UPG GA JT ID
SUB-BDJ GA JT ID
SUB-BPN GA JT
SUB-BTH JT
SUB-KNO JT
SUB-LOP QG
SUB-LBJ QG JT
SUB-KOE JT
SUB-MDC JT
SUB-PNK JT
SUB-AMQ JT
UPG-MDC GA JT
UPG-BPN GA JT
UPG-KDI GA JT IW
UPG-PLW GA JT
UPG-AMQ GA JT
UPG-SOQ JT
UPG-DJJ GA JT
UPG-KOE JT
UPG-LBJ JT
UPG-BDJ JT
UPG-LUW IW
UPG-BTH JT
UPG-KNO JT
AMQ-DJJ GA
AMQ-SOQ GA JT
AMQ-TTE GA
SOQ-DJJ JT
SOQ-MKW IW
DJJ-MKQ GA JT
DJJ-TIM GA
DJJ-BIK GA IW
BIK-MKW IW
MKQ-TIM IW
MDC-TTE GA
MDC-GTO IW
MDC-PLW IW
KNO-BTH GA QG JT QZ
KNO-BTJ JT
KNO-PKU QG JT
KNO-PDG QG
BTH-PKU JT
BTH-PLM JT
BTH-PNK QG JT
BTH-TNJ IW
BTH-PGK IW
BTH-DJB IW
PLM-BKS IW
PLM-DJB IW
PNK-PKY IW
BDJ-PKY IW
BDJ-BPN IW
BPN-SRI IW
BPN-TRK JT
KOE-WGP IW
KOE-MOF IW
KOE-TMC IW
KOE-LBJ IW
LOP-BMU IW
LOP-LBJ IW
BMU-LBJ IW
LBJ-WGP IW
YIA-UPG JT
KDI-LUW IW
PLW-LUW IW
MLG-DPS IW`;
  const RT = [];
  R_RAW.split("\n").forEach(l => { const p = l.trim().split(/\s+/); const [a, b] = p[0].split("-"); if (!AP[a] || !AP[b]) return; const o = { a, b, al: p.slice(1) }; o.d = hav(AP[a], AP[b]); o.id = a + "-" + b; RT.push(o); AP[a].nb[b] = o; AP[b].nb[a] = o; });
  function hav(p, q) { const R = 6371, r = Math.PI / 180, dLa = (q.lat - p.lat) * r, dLo = (q.lon - p.lon) * r; const x = Math.sin(dLa / 2) ** 2 + Math.cos(p.lat * r) * Math.cos(q.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }
  function arc(p, q, n) { const r = Math.PI / 180, la1 = p.lat * r, lo1 = p.lon * r, la2 = q.lat * r, lo2 = q.lon * r; const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2)); const out = []; if (d < 1e-9) return [[p.lat, p.lon], [q.lat, q.lon]]; for (let i = 0; i <= n; i++) { const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d); const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2), y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2), z = A * Math.sin(la1) + B * Math.sin(la2); out.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / r, Math.atan2(y, x) / r]); } return out; }
  const brg = (a, b) => { const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r), x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r); return (Math.atan2(y, x) / r + 360) % 360; };
  const fmtT = h => { const m = Math.round(h * 60); return Math.floor(m / 60) + "j " + String(m % 60).padStart(2, "0") + "m"; };
  const legT = d => d / 780 + 0.4;     // jam: jelajah 780 km/j + 0,4 j lepas-landas/pendaratan
  const CO2 = d => d * 0.1;            // kg/penumpang (indikatif)

  /* ===================== STATE ===================== */
  let S = { on: { ap: false, rt: false, sim: false, live: false, wx: false, hub: false, ring: false, mer: false, lbl: true }, al: Object.keys(AL).concat(["_"]), kls: ["H", "I", "D", "P"], minD: 0, tab: "lapis", from: "CGK", to: "UPG", sel: "CGK" };
  try { const o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o) { Object.assign(S, o); S.on = Object.assign({ ap: false, rt: false, sim: false, live: false, wx: false, hub: false, ring: false, mer: false, lbl: true }, o.on || {}); S.sim = undefined; } } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };
  let P = null, G = {}, WX = {}, WXT = 0, planes = [], raf = 0, lastF = 0, liveT = 0, liveM = [], hl = null, status = "";
  const say = t => { status = t; const s = $("pqwSt"); if (s) s.textContent = t; };

  /* ===================== CSS ===================== */
  function css() {
    if ($("pqwCss")) return; const s = document.createElement("style"); s.id = "pqwCss";
    s.textContent = `
#pqwPanel{position:fixed;left:10px;bottom:70px;width:min(372px,94vw);max-height:72vh;z-index:1200;display:none;flex-direction:column;background:rgba(10,20,32,.96);color:#e2e8f0;border:1px solid #1e3a52;border-radius:14px;box-shadow:0 12px 40px #000a;font:13px/1.4 Roboto,system-ui,sans-serif;backdrop-filter:blur(8px)}
#pqwPanel .h{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #1e3a52;font-weight:700;background:linear-gradient(90deg,#0c4a6e,#0f172a);border-radius:14px 14px 0 0}
#pqwPanel .h b{flex:1;font-size:14px}#pqwPanel .h button{background:none;border:0;color:#94a3b8;font-size:18px;cursor:pointer}
#pqwPanel .tabs{display:flex;border-bottom:1px solid #1e3a52}#pqwPanel .tabs button{flex:1;padding:8px 2px;background:none;border:0;color:#94a3b8;cursor:pointer;font-size:12px;font-weight:600;border-bottom:2px solid transparent}
#pqwPanel .tabs button.on{color:#38bdf8;border-color:#38bdf8}
#pqwBody{overflow:auto;padding:10px 12px;flex:1}
#pqwPanel .row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed #16293b}
#pqwPanel .row span{flex:1}#pqwPanel .row small{color:#7c93a8;display:block;font-size:11px}
#pqwPanel .sw{appearance:none;width:34px;height:19px;border-radius:20px;background:#334155;position:relative;cursor:pointer;flex:none;transition:.2s}
#pqwPanel .sw:checked{background:#0ea5e9}#pqwPanel .sw:after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:.2s}#pqwPanel .sw:checked:after{left:17px}
#pqwPanel .chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;margin:2px 3px 2px 0;border-radius:20px;border:1px solid #334155;background:#0f2133;color:#cbd5e1;font-size:11px;cursor:pointer;user-select:none}
#pqwPanel .chip.on{background:#0c4a6e;border-color:#38bdf8;color:#fff}#pqwPanel .chip i{width:8px;height:8px;border-radius:50%;display:inline-block}
#pqwPanel select,#pqwPanel input[type=text],#pqwPanel input[type=search]{width:100%;background:#0f2133;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:7px;font-size:13px}
#pqwPanel .btn{background:#0ea5e9;color:#fff;border:0;border-radius:8px;padding:8px 10px;font-weight:700;cursor:pointer;font-size:12px}#pqwPanel .btn.g{background:#1e3a52}
#pqwPanel h4{margin:10px 0 4px;font-size:12px;color:#38bdf8;text-transform:uppercase;letter-spacing:.5px}
#pqwPanel .card{background:#0f2133;border:1px solid #1e3a52;border-radius:10px;padding:8px 10px;margin:6px 0}
#pqwPanel .card.best{border-color:#22c55e;box-shadow:0 0 0 1px #22c55e55}
#pqwPanel .li{display:flex;gap:8px;align-items:center;padding:6px 4px;border-bottom:1px solid #16293b;cursor:pointer}#pqwPanel .li:hover{background:#12304a}
#pqwPanel .li b{min-width:34px}#pqwPanel .li span{flex:1}#pqwPanel .li small{color:#7c93a8}
#pqwPanel .bar{height:6px;border-radius:4px;background:#1e293b;overflow:hidden}#pqwPanel .bar i{display:block;height:100%}
#pqwSt{padding:6px 12px;border-top:1px solid #1e3a52;font-size:11px;color:#94a3b8;min-height:26px}
#pqwBtn{width:40px;height:40px;border-radius:12px;border:0;background:#0c4a6e;color:#fff;font-size:17px;cursor:pointer}
.pqw-pl{width:22px;height:22px;filter:drop-shadow(0 0 3px #000);transition:none}.pqw-pl svg{width:100%;height:100%}
.pqw-ap{font:700 10px Roboto,sans-serif;color:#fff;background:#0f172ae6;border:1px solid #38bdf8;border-radius:5px;padding:0 4px;box-shadow:none}
.pqw-ap:before{display:none}
.pqw-pop{font:12px/1.4 Roboto,sans-serif}.pqw-pop b{font-size:13px}.pqw-pop button{margin:3px 3px 0 0;background:#0ea5e9;color:#fff;border:0;border-radius:6px;padding:4px 8px;cursor:pointer;font-weight:700;font-size:11px}
.pqw-glow{filter:drop-shadow(0 0 6px #22c55e)}`;
    document.head.appendChild(s);
  }

  /* ===================== LAYER ===================== */
  const PLANE_SVG = c => `<svg viewBox="0 0 24 24"><path fill="${c}" stroke="#0b1220" stroke-width=".8" d="M12 1.5l2 7.2 8.5 4.6v2.2l-8.5-2.4v5.2l2.4 2.1v1.3L12 20.6l-4.4 1.1v-1.3L10 18.3v-5.2l-8.5 2.4v-2.2L10 8.7z"/></svg>`;
  function paneInit(m) { [["pqwR", 620], ["pqwA", 630], ["pqwP", 640]].forEach(([n, z]) => { if (!m.getPane(n)) { const p = m.createPane(n); p.style.zIndex = z; } }); }
  const passA = a => S.kls.includes(a.t);
  const passR = r => r.d >= S.minD && r.al.some(x => S.al.includes(x)) || (r.al.length === 0 && S.al.includes("_") && r.d >= S.minD);
  const visR = r => passR(r) && passA(AP[r.a]) && passA(AP[r.b]);
  const rcol = r => r.al.length ? (AL[r.al[0]] || [0, "#94a3b8"])[1] : "#94a3b8";
  function risk(c) { const w = WX[c]; return w ? w.risk : -1; }
  const rcls = v => v < 0 ? ["#64748b", "n/a"] : v < 20 ? ["#22c55e", "Aman"] : v < 45 ? ["#eab308", "Waspada"] : v < 70 ? ["#f97316", "Terganggu"] : ["#ef4444", "Berat"];
  function g(n) { if (!G[n]) G[n] = L.layerGroup(); return G[n]; }
  function sync(n, on) { const m = gmap(); if (!m) return; const l = g(n); if (on && !m.hasLayer(l)) l.addTo(m); if (!on && m.hasLayer(l)) m.removeLayer(l); }

  function drawRoutes() {
    const l = g("rt"); l.clearLayers();
    RT.filter(visR).forEach(r => {
      const pts = arc(AP[r.a], AP[r.b], Math.max(8, Math.min(48, Math.round(r.d / 40))));
      const ln = L.polyline(pts, { pane: "pqwR", color: rcol(r), weight: 1 + Math.min(2.5, r.al.length * .45), opacity: .72 });
      ln.bindPopup(() => routePop(r), { maxWidth: 260 });
      ln.on("mouseover", () => ln.setStyle({ weight: 5, opacity: 1 })); ln.on("mouseout", () => ln.setStyle({ weight: 1 + Math.min(2.5, r.al.length * .45), opacity: .72 }));
      l.addLayer(ln);
    });
  }
  function routePop(r) {
    const A = AP[r.a], B = AP[r.b];
    return `<div class="pqw-pop"><b>${A.c} ⇄ ${B.c}</b><br>${esc(A.k)} – ${esc(B.k)}<br>Jarak ${Math.round(r.d)} km · ±${fmtT(legT(r.d))} · CO₂ ≈ ${Math.round(CO2(r.d))} kg/pnp<br>${r.al.map(x => `<span style="color:${(AL[x] || [0, "#aaa"])[1]}">● ${(AL[x] || [x])[0]}</span>`).join(" ") || "Perintis/carter"}<br><button onclick="PETAQU_PESAWAT.plan('${r.a}','${r.b}')">Rencanakan</button></div>`;
  }
  function apPop(a) {
    const nb = Object.keys(a.nb), w = WX[a.c], rc = rcls(risk(a.c));
    return `<div class="pqw-pop"><b>${a.c} · ${esc(a.n)}</b><br>${esc(a.k)} · ${KELAS[a.t]}<br>Rute langsung: ${nb.length ? nb.sort().join(", ") : "—"}${w ? `<br>Cuaca: angin ${w.wind}kt (gust ${w.gust}) · vis ${w.vis >= 1e4 ? "≥10" : (w.vis / 1000).toFixed(1)} km · hujan ${w.pr}mm · <b style="color:${rc[0]}">${rc[1]}</b>` : ""}<br><button onclick="PETAQU_PESAWAT.setFrom('${a.c}')">Asal</button><button onclick="PETAQU_PESAWAT.setTo('${a.c}')">Tujuan</button><button onclick="PETAQU_PESAWAT.sel('${a.c}')">Jangkauan</button><button onclick="PETAQU_PESAWAT.wxOne('${a.c}')">Cuaca</button></div>`;
  }
  function drawAirports() {
    const l = g("ap"); l.clearLayers();
    Object.values(AP).filter(passA).forEach(a => {
      const rc = rcls(risk(a.c)), col = S.on.wx && risk(a.c) >= 0 ? rc[0] : KCOL[a.t];
      const m = L.circleMarker([a.lat, a.lon], { pane: "pqwA", radius: 4 + a.w * 1.3, color: "#0b1220", weight: 1.5, fillColor: col, fillOpacity: .95 });
      m.bindPopup(() => apPop(a), { maxWidth: 280 });
      if (S.on.lbl) m.bindTooltip(a.c, { permanent: true, direction: "right", offset: [6, 0], className: "pqw-ap" });
      l.addLayer(m);
    });
  }
  function drawHub() {
    const l = g("hub"); l.clearLayers();
    Object.values(AP).forEach(a => { const deg = Object.keys(a.nb).length; if (!deg) return; l.addLayer(L.circle([a.lat, a.lon], { pane: "pqwR", radius: 12000 + deg * 4500, stroke: false, fillColor: "#f43f5e", fillOpacity: Math.min(.5, .08 + deg * .012), interactive: false })); });
  }
  function drawRing() {
    const l = g("ring"); l.clearLayers(); const a = AP[S.sel]; if (!a) return;
    [1, 2, 3].forEach(h => { const km = (h - 0.4) * 780; l.addLayer(L.circle([a.lat, a.lon], { pane: "pqwR", radius: km * 1000, color: "#22d3ee", weight: 1.2, dashArray: "6 6", fill: false, interactive: false })); l.addLayer(L.marker([a.lat + km / 111, a.lon], { pane: "pqwR", interactive: false, icon: L.divIcon({ className: "", html: `<div style="color:#67e8f9;font:700 11px Roboto;text-shadow:0 0 3px #000;white-space:nowrap">${h} jam dari ${a.c}</div>` }) })); });
  }
  function drawMer() {
    const l = g("mer"); l.clearLayers();
    [[105, "WIB (UTC+7)"], [120, "WITA (UTC+8)"], [135, "WIT (UTC+9)"]].forEach(([lo, t]) => { l.addLayer(L.polyline([[8, lo], [-13, lo]], { pane: "pqwR", color: "#a78bfa", weight: 1.2, dashArray: "2 6", interactive: false })); l.addLayer(L.marker([7, lo], { pane: "pqwR", interactive: false, icon: L.divIcon({ className: "", html: `<div style="color:#c4b5fd;font:700 11px Roboto;text-shadow:0 0 3px #000;white-space:nowrap;transform:translateX(-50%)">Meridian ${t}</div>` }) })); });
  }
  function redraw() {
    const m = gmap(); if (!m || typeof L === "undefined") return; paneInit(m);
    drawRoutes(); drawAirports(); drawHub(); drawRing(); drawMer();
    sync("rt", S.on.rt); sync("ap", S.on.ap); sync("hub", S.on.hub); sync("ring", S.on.ring); sync("mer", S.on.mer);
    simSet(S.on.sim); liveSet(S.on.live);
  }

  /* ===================== PESAWAT SIMULASI ===================== */
  function mkPlane(r, rev, col) { const pts = arc(AP[rev ? r.b : r.a], AP[rev ? r.a : r.b], 48); const mk = L.marker(pts[0], { pane: "pqwP", interactive: true, icon: L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11], html: `<div class="pqw-pl">${PLANE_SVG(col)}</div>` }) }); const f = rev ? r.b : r.a, t = rev ? r.a : r.b; mk.bindTooltip(`${f} → ${t} (simulasi)`, { direction: "top" }); return { mk, pts, r, t: Math.random(), dur: 25 + r.d / 25, seg: -1 }; }
  function simSet(on) {
    const m = gmap(); if (!m) return; const l = g("sim");
    if (!on) { cancelAnimationFrame(raf); raf = 0; sync("sim", false); return; }
    if (!planes.length) {
      const rs = RT.filter(visR); const pool = []; rs.forEach(r => { const w = Math.max(1, Math.round(r.al.length * (1 + r.d / 1500))); for (let i = 0; i < w; i++)pool.push(r); });
      for (let i = 0; i < Math.min(80, pool.length); i++) { const r = pool[Math.floor(Math.random() * pool.length)]; const p = mkPlane(r, Math.random() < .5, rcol(r)); planes.push(p); l.addLayer(p.mk); }
    }
    sync("sim", true); lastF = performance.now(); if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = 0; if (!S.on.sim) return; const dt = Math.min(.1, (now - lastF) / 1000); lastF = now;
    if (!document.hidden && now - (tick.l || 0) > 45) { tick.l = now; planes.forEach(p => { p.t += dt / p.dur; if (p.t >= 1) p.t -= 1; const n = p.pts.length - 1, f = p.t * n, i = Math.min(n - 1, Math.floor(f)), u = f - i, a = p.pts[i], b = p.pts[i + 1]; p.mk.setLatLng([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); if (i !== p.seg) { p.seg = i; const el = p.mk.getElement(); if (el && el.firstChild) el.firstChild.style.transform = "rotate(" + brg(a, b).toFixed(0) + "deg)"; } }); }
    raf = requestAnimationFrame(tick);
  }
  function simReset() { const l = g("sim"); l.clearLayers(); planes = []; if (S.on.sim) simSet(true); }

  /* ===================== LIVE ADS-B (OpenSky) ===================== */
  async function liveFetch() {
    if (!S.on.live) return; say("Mengambil pesawat live (OpenSky)…");
    try {
      const r = await fetch("https://opensky-network.org/api/states/all?lamin=-11.5&lomin=94&lamax=6.5&lomax=141.5", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 429 ? "kuota OpenSky habis, coba lagi 1–2 menit" : "HTTP " + r.status);
      const j = await r.json(), l = g("live"); l.clearLayers(); let n = 0;
      (j.states || []).forEach(s => { if (s[8] || s[5] == null || s[6] == null) return; n++; const col = (s[7] || 0) > 6000 ? "#fde047" : "#fb923c"; const mk = L.marker([s[6], s[5]], { pane: "pqwP", icon: L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11], html: `<div class="pqw-pl" style="transform:rotate(${(s[10] || 0).toFixed(0)}deg)">${PLANE_SVG(col)}</div>` }) }); mk.bindPopup(`<div class="pqw-pop"><b>${esc((s[1] || "").trim() || s[0])}</b> <small>LIVE</small><br>Negara: ${esc(s[2])}<br>Alt ${s[7] != null ? Math.round(s[7] * 3.281) + " ft" : "—"} · ${s[9] != null ? Math.round(s[9] * 1.944) + " kt" : "—"} · hdg ${Math.round(s[10] || 0)}°<br>V/S ${s[11] != null ? Math.round(s[11] * 196.85) + " fpm" : "—"}</div>`); l.addLayer(mk); });
      say("LIVE: " + n + " pesawat di udara · " + new Date().toLocaleTimeString("id-ID"));
    } catch (e) { say("Live ADS-B gagal: " + (e.message || e) + " (tersedia tanpa key, kadang dibatasi)"); }
  }
  function liveSet(on) { clearInterval(liveT); liveT = 0; if (!on) { sync("live", false); g("live").clearLayers(); return; } sync("live", true); liveFetch(); liveT = setInterval(() => { if (!document.hidden) liveFetch(); }, 30000); }

  /* ===================== CUACA BANDARA ===================== */
  function calcRisk(w) { let r = 0; if (w.gust >= 35) r += 40; else if (w.gust >= 25) r += 20; else if (w.gust >= 18) r += 8; if (w.vis < 1500) r += 40; else if (w.vis < 5000) r += 20; else if (w.vis < 8000) r += 8; if (w.pr >= 7) r += 25; else if (w.pr >= 2) r += 12; else if (w.pr > .2) r += 4; if (w.code >= 95) r += 35; else if (w.code === 45 || w.code === 48) r += 20; else if (w.code === 65 || w.code === 82) r += 15; return Math.min(100, r); }
  async function fetchWx(list) {
    const cs = list || Object.keys(AP); say("Mengambil cuaca " + cs.length + " bandara…");
    try {
      const la = cs.map(c => AP[c].lat).join(","), lo = cs.map(c => AP[c].lon).join(",");
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,visibility,cloud_cover,precipitation,weather_code&wind_speed_unit=kn&timezone=auto`);
      if (!r.ok) throw new Error("HTTP " + r.status); let j = await r.json(); if (!Array.isArray(j)) j = [j];
      j.forEach((o, i) => { const c = o.current || {}; const w = { temp: Math.round(c.temperature_2m), wind: Math.round(c.wind_speed_10m || 0), gust: Math.round(c.wind_gusts_10m || 0), vis: c.visibility != null ? c.visibility : 1e4, cloud: c.cloud_cover || 0, pr: +(c.precipitation || 0).toFixed(1), code: c.weather_code || 0 }; w.risk = calcRisk(w); WX[cs[i]] = w; });
      WXT = Date.now(); say("Cuaca bandara diperbarui " + new Date().toLocaleTimeString("id-ID")); drawAirports(); if (P && S.tab) render();
    } catch (e) { say("Cuaca gagal: " + (e.message || e)); }
  }

  /* ===================== PERENCANA RUTE (Dijkstra) ===================== */
  function dijkstra(src, dst, ban) {
    const dist = {}, prev = {}, Q = new Set(Object.keys(AP)); Object.keys(AP).forEach(k => dist[k] = Infinity); dist[src] = 0;
    while (Q.size) { let u = null; Q.forEach(k => { if (u === null || dist[k] < dist[u]) u = k; }); if (u === null || dist[u] === Infinity) break; Q.delete(u); if (u === dst) break;
      for (const v in AP[u].nb) { if (!Q.has(v) || (ban && ban.has(v) && v !== dst)) continue; const pen = v === dst ? 0 : .9; const w = legT(AP[u].nb[v].d) + pen + (WX[v] && v !== dst ? WX[v].risk / 400 : 0); if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; } } }
    if (dist[dst] === Infinity) return null; const path = [dst]; while (path[0] !== src) path.unshift(prev[path[0]]); return path;
  }
  function pathInfo(p) { let d = 0, h = 0, al = null; for (let i = 0; i < p.length - 1; i++) { const r = AP[p[i]].nb[p[i + 1]]; d += r.d; h += legT(r.d); const s = new Set(r.al); al = al ? new Set([...al].filter(x => s.has(x))) : s; } h += (p.length - 2) * .9; const direct = hav(AP[p[0]], AP[p[p.length - 1]]); return { p, d, h, co2: CO2(d), stops: p.length - 2, al: [...(al || [])], detour: d / Math.max(1, direct) }; }
  function plan(a, b) { if (a) S.from = a; if (b) S.to = b; save(); S.tab = "rute"; if (P) { P.style.display = "flex"; } render(); runPlan(); }
  function runPlan() {
    const out = $("pqwPlanOut"); if (!out) return; const a = S.from, b = S.to; if (a === b) { out.innerHTML = '<div class="card">Asal dan tujuan sama.</div>'; return; }
    const best = dijkstra(a, b); if (!best) { out.innerHTML = `<div class="card">Tidak ada jalur di jaringan data. Jarak lurus ${Math.round(hav(AP[a], AP[b]))} km. Coba via hub CGK/UPG/SUB/DPS.</div>`; return; }
    const alts = [], seen = new Set([best.join(">")]); const mids = best.slice(1, -1);
    (mids.length ? mids : []).forEach(x => { const q = dijkstra(a, b, new Set([x])); if (q && !seen.has(q.join(">"))) { seen.add(q.join(">")); alts.push(q); } });
    if (!mids.length) { ["CGK", "UPG", "SUB", "DPS", "KNO"].forEach(h => { if (h !== a && h !== b) { const q1 = dijkstra(a, h), q2 = dijkstra(h, b); if (q1 && q2) { const q = q1.concat(q2.slice(1)); if (new Set(q).size === q.length && !seen.has(q.join(">"))) { seen.add(q.join(">")); alts.push(q); } } } }); }
    const all = [best].concat(alts.slice(0, 3)).map(pathInfo); const cheapestCO2 = Math.min(...all.map(x => x.co2)), fastest = Math.min(...all.map(x => x.h));
    out.innerHTML = all.map((x, i) => { const wr = Math.max(...x.p.map(c => risk(c))); const rc = rcls(wr); return `<div class="card ${i === 0 ? "best" : ""}" data-act="hl" data-i="${i}" style="cursor:pointer"><b>${i === 0 ? "⭐ Terbaik" : "Alternatif " + i}</b> · ${x.stops === 0 ? "Langsung" : x.stops + " transit"}${x.h === fastest ? " · ⚡tercepat" : ""}${x.co2 === cheapestCO2 ? " · 🌱hemat CO₂" : ""}<br>${x.p.join(" → ")}<br>${Math.round(x.d)} km · ±${fmtT(x.h)} (termasuk transit) · CO₂ ≈ ${Math.round(x.co2)} kg<br>Maskapai: ${x.al.length ? x.al.map(k => (AL[k] || [k])[0]).join(", ") : "beda maskapai per segmen"}<br><span style="color:${rc[0]}">● Risiko cuaca rute: ${rc[1]}</span>${x.detour > 1.25 ? ` · <small>jalan memutar ×${x.detour.toFixed(2)}</small>` : ""}</div>`; }).join("");
    out._all = all; showPath(all[0].p);
    const alt = Object.values(AP).filter(o => o.c !== b && o.c !== a).map(o => ({ o, d: hav(AP[b], o) })).sort((x, y) => x.d - y.d).slice(0, 3);
    out.innerHTML += `<h4>Bandara cadangan (alternate) ${b}</h4>` + alt.map(x => `<div class="li" data-act="fly" data-c="${x.o.c}"><b>${x.o.c}</b><span>${esc(x.o.k)}</span><small>${Math.round(x.d)} km</small></div>`).join("");
    out._all = all;
  }
  function showPath(p) { const m = gmap(); if (!m) return; paneInit(m); if (hl) m.removeLayer(hl); const gr = L.layerGroup(); let all = []; for (let i = 0; i < p.length - 1; i++) { const pts = arc(AP[p[i]], AP[p[i + 1]], 48); all = all.concat(pts); gr.addLayer(L.polyline(pts, { pane: "pqwP", color: "#22c55e", weight: 5, opacity: .95, className: "pqw-glow" })); } p.forEach(c => gr.addLayer(L.circleMarker([AP[c].lat, AP[c].lon], { pane: "pqwP", radius: 9, color: "#fff", weight: 2, fillColor: "#22c55e", fillOpacity: 1 }).bindTooltip(c, { permanent: true, direction: "top", className: "pqw-ap" }))); hl = gr.addTo(m); try { m.fitBounds(L.latLngBounds(all), { padding: [50, 50] }); } catch (e) { } }

  /* ===================== TERDEKAT ===================== */
  function nearest(lat, lon) {
    const out = $("pqwNearOut"); if (!out) return; const rows = Object.values(AP).map(a => ({ a, d: hav({ lat, lon }, a) })).sort((x, y) => x.d - y.d).slice(0, 5);
    out.innerHTML = rows.map(x => { const rc = rcls(risk(x.a.c)); return `<div class="li" data-act="fly" data-c="${x.a.c}"><b>${x.a.c}</b><span>${esc(x.a.n)}<br><small>${KELAS[x.a.t]} · ${Object.keys(x.a.nb).length} rute</small></span><small style="text-align:right">${Math.round(x.d)} km<br>±${fmtT(x.d * 1.35 / 55)} darat<br><span style="color:${rc[0]}">● ${rc[1]}</span></small></div>`; }).join("");
  }
  function nearMap() { const m = gmap(); if (!m) return; const c = m.getCenter(); nearest(c.lat, c.lng); say("Bandara terdekat dari pusat peta"); }
  function nearGps() { if (!navigator.geolocation) return say("GPS tidak tersedia"); navigator.geolocation.getCurrentPosition(p => { nearest(p.coords.latitude, p.coords.longitude); say("Bandara terdekat dari lokasi Anda"); }, () => say("Izin GPS ditolak")); }

  /* ===================== PANEL ===================== */
  function chip(act, key, label, on, col) { return `<span class="chip ${on ? "on" : ""}" data-act="${act}" data-k="${key}">${col ? `<i style="background:${col}"></i>` : ""}${label}</span>`; }
  function row(k, t, sub) { return `<div class="row"><span>${t}<small>${sub}</small></span><input type="checkbox" class="sw" data-act="tg" data-k="${k}" ${S.on[k] ? "checked" : ""}></div>`; }
  function tabLapis() {
    return row("ap", "✈️ Bandara", "55 bandara, warna menurut kelas") + row("rt", "🛫 Rute penerbangan", "Busur great-circle per maskapai") + row("sim", "🛩️ Pesawat simulasi", "Animasi lalu lintas mengikuti jaringan rute") + row("live", "📡 Pesawat LIVE (ADS-B)", "Posisi nyata via OpenSky, tanpa key") + row("wx", "⛈️ Cuaca & risiko bandara", "Warna bandara = risiko (Open-Meteo)") + row("hub", "🔥 Konektivitas hub", "Lingkar panas menurut jumlah rute") + row("ring", "🎯 Jangkauan 1/2/3 jam", "Dari bandara terpilih: " + S.sel) + row("mer", "🕒 Meridian zona waktu", "WIB · WITA · WIT") + row("lbl", "🏷️ Label kode IATA", "Tampilkan kode di peta")
      + `<h4>Filter kelas bandara</h4>` + Object.keys(KELAS).map(k => chip("kls", k, KELAS[k], S.kls.includes(k), KCOL[k])).join("")
      + `<h4>Filter maskapai</h4>` + Object.keys(AL).map(k => chip("al", k, AL[k][0], S.al.includes(k), AL[k][1])).join("") + chip("al", "_", "Perintis/lain", S.al.includes("_"), "#94a3b8")
      + `<h4>Jarak minimum rute: <b id="pqwMD">${S.minD}</b> km</h4><input type="range" min="0" max="3500" step="100" value="${S.minD}" id="pqwMin" style="width:100%">`
      + `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn g" data-act="all">Semua maskapai</button><button class="btn g" data-act="fit">🇮🇩 Pusatkan Indonesia</button><button class="btn g" data-act="geo">⬇ Ekspor GeoJSON</button></div>`;
  }
  function opts(sel) { return Object.values(AP).sort((a, b) => a.c.localeCompare(b.c)).map(a => `<option value="${a.c}" ${a.c === sel ? "selected" : ""}>${a.c} — ${esc(a.k)}</option>`).join(""); }
  function tabRute() {
    return `<h4>Perencana rute pintar</h4><select id="pqwF">${opts(S.from)}</select><div style="text-align:center;margin:3px"><button class="btn g" data-act="swap">⇅ Tukar</button></div><select id="pqwT">${opts(S.to)}</select><div style="margin:8px 0"><button class="btn" data-act="plan" style="width:100%">🧠 Cari rute terbaik</button></div><div id="pqwPlanOut"></div>
      <h4>Bandara terdekat</h4><div style="display:flex;gap:6px"><button class="btn g" data-act="nm" style="flex:1">📍 Pusat peta</button><button class="btn g" data-act="ng" style="flex:1">🛰️ GPS saya</button></div><div id="pqwNearOut"></div>`;
  }
  function tabBandara() {
    return `<input type="search" id="pqwQ" placeholder="Cari kode / nama / kota…" autocomplete="off"><div id="pqwList" style="margin-top:6px">${listHtml("")}</div>`;
  }
  function listHtml(q) { q = q.toLowerCase(); return Object.values(AP).filter(a => !q || (a.c + a.n + a.k).toLowerCase().includes(q)).sort((a, b) => b.w - a.w || a.c.localeCompare(b.c)).map(a => { const rc = rcls(risk(a.c)); return `<div class="li" data-act="fly" data-c="${a.c}"><b>${a.c}</b><span>${esc(a.n)}<br><small>${esc(a.k)} · ${KELAS[a.t]}</small></span><small style="text-align:right">${Object.keys(a.nb).length} rute<br><span style="color:${rc[0]}">●</span></small></div>`; }).join("") || "<div class='card'>Tidak ditemukan.</div>"; }
  function tabInfo() {
    const ds = Object.values(AP).map(a => ({ a, deg: Object.keys(a.nb).length })), top = ds.sort((x, y) => y.deg - x.deg).slice(0, 6), long = RT.slice().sort((x, y) => y.d - x.d)[0], short = RT.slice().sort((x, y) => x.d - y.d)[0];
    const iso = ds.filter(x => x.deg === 0).map(x => x.a.c), leaf = ds.filter(x => x.deg === 1).length, tot = RT.reduce((s, r) => s + r.d, 0);
    const wx = Object.entries(WX).sort((x, y) => y[1].risk - x[1].risk).slice(0, 5), mx = top[0].deg;
    return `<div class="card">${Object.keys(AP).length} bandara · ${RT.length} rute · total ${Math.round(tot).toLocaleString("id-ID")} km busur.<br>Rute terpanjang: <b>${long.a}–${long.b}</b> (${Math.round(long.d)} km, ±${fmtT(legT(long.d))}). Terpendek: <b>${short.a}–${short.b}</b> (${Math.round(short.d)} km).<br>${leaf} bandara hanya punya 1 rute (rawan putus konektivitas).${iso.length ? " Tanpa rute komersial di data: " + iso.join(", ") + "." : ""}</div>
      <h4>Hub tersibuk (jumlah rute)</h4>${top.map(x => `<div class="li" data-act="fly" data-c="${x.a.c}"><b>${x.a.c}</b><span><div class="bar"><i style="width:${x.deg / mx * 100}%;background:#38bdf8"></i></div></span><small>${x.deg}</small></div>`).join("")}
      <h4>Risiko cuaca tertinggi saat ini</h4>${wx.length ? wx.map(([c, w]) => { const rc = rcls(w.risk); return `<div class="li" data-act="fly" data-c="${c}"><b>${c}</b><span>angin ${w.wind}kt (gust ${w.gust}) · vis ${w.vis >= 1e4 ? "≥10" : (w.vis / 1000).toFixed(1)}km · hujan ${w.pr}mm</span><small style="color:${rc[0]}">${rc[1]}</small></div>`; }).join("") : `<div class="card">Belum dimuat. <button class="btn" data-act="wx">Muat cuaca semua bandara</button></div>`}
      <div class="card" style="font-size:11px;color:#94a3b8">⚠ Rute = pola jaringan indikatif, bukan jadwal resmi. Estimasi waktu: 780 km/j + 0,4 j; transit 0,9 j. CO₂ ≈ 0,1 kg/pnp-km. Cuaca: Open-Meteo; keselamatan penerbangan tetap merujuk BMKG/METAR/NOTAM. Live: OpenSky Network (cakupan ADS-B tidak merata di Papua/pedalaman).</div>`;
  }
  function render() {
    if (!P) return; const b = $("pqwBody"), keep = b ? b.scrollTop : 0;
    P.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x.dataset.t === S.tab));
    b.innerHTML = S.tab === "lapis" ? tabLapis() : S.tab === "rute" ? tabRute() : S.tab === "bandara" ? tabBandara() : tabInfo(); b.scrollTop = keep;
    if (S.tab === "rute") { const o = $("pqwPlanOut"); if (o && o._all) { /* kosong setelah render ulang */ } }
  }
  function toggle(k, v) { S.on[k] = v; save(); if (k === "wx") { if (v && Date.now() - WXT > 600000) fetchWx(); drawAirports(); } if (k === "lbl") drawAirports(); if (k === "sim") simSet(v); if (k === "live") liveSet(v); if (["ap", "rt", "hub", "ring", "mer"].includes(k)) { if (k === "ring") drawRing(); sync(k, v); } }
  function refilter() { save(); drawRoutes(); drawAirports(); simReset(); }
  function fly(c) { const m = gmap(), a = AP[c]; if (!m || !a) return; m.flyTo([a.lat, a.lon], Math.max(m.getZoom(), 8), { duration: 1.2 }); setTimeout(() => { const l = g("ap"); l.eachLayer(x => { const p = x.getLatLng && x.getLatLng(); if (p && Math.abs(p.lat - a.lat) < 1e-6 && Math.abs(p.lng - a.lon) < 1e-6) x.openPopup(); }); }, 1300); }
  function geo() {
    const f = []; Object.values(AP).forEach(a => f.push({ type: "Feature", properties: { iata: a.c, nama: a.n, kota: a.k, kelas: KELAS[a.t], rute: Object.keys(a.nb).length }, geometry: { type: "Point", coordinates: [a.lon, a.lat] } }));
    RT.filter(visR).forEach(r => f.push({ type: "Feature", properties: { rute: r.id, jarak_km: Math.round(r.d), maskapai: r.al.join(",") }, geometry: { type: "LineString", coordinates: arc(AP[r.a], AP[r.b], 40).map(p => [p[1], p[0]]) } }));
    const u = URL.createObjectURL(new Blob([JSON.stringify({ type: "FeatureCollection", features: f })], { type: "application/geo+json" })); const a = document.createElement("a"); a.href = u; a.download = "rute-pesawat-indonesia.geojson"; a.click(); setTimeout(() => URL.revokeObjectURL(u), 3000); say("GeoJSON diekspor");
  }
  function build() {
    css(); P = document.createElement("div"); P.id = "pqwPanel";
    P.innerHTML = `<div class="h"><span>✈️</span><b>Atlas Rute Pesawat Indonesia</b><button data-act="x" title="Tutup">✕</button></div><div class="tabs"><button data-t="lapis">Lapisan</button><button data-t="rute">Rute</button><button data-t="bandara">Bandara</button><button data-t="info">Wawasan</button></div><div id="pqwBody"></div><div id="pqwSt">${esc(status)}</div>`;
    document.body.appendChild(P);
    try { L.DomEvent.disableClickPropagation(P); L.DomEvent.disableScrollPropagation(P); } catch (e) { }
    P.addEventListener("click", e => {
      const t = e.target.closest("[data-t]"); if (t) { S.tab = t.dataset.t; save(); render(); return; }
      const el = e.target.closest("[data-act]"); if (!el) return; const a = el.dataset.act, k = el.dataset.k;
      if (a === "x") P.style.display = "none";
      else if (a === "tg") toggle(k, el.checked);
      else if (a === "kls") { S.kls = S.kls.includes(k) ? S.kls.filter(x => x !== k) : S.kls.concat(k); refilter(); render(); }
      else if (a === "al") { S.al = S.al.includes(k) ? S.al.filter(x => x !== k) : S.al.concat(k); refilter(); render(); }
      else if (a === "all") { S.al = Object.keys(AL).concat(["_"]); S.kls = ["H", "I", "D", "P"]; S.minD = 0; refilter(); render(); }
      else if (a === "fit") { const m = gmap(); m && m.fitBounds([[-11.2, 95], [6, 141]], { padding: [20, 20] }); }
      else if (a === "geo") geo();
      else if (a === "swap") { const f = S.from; S.from = S.to; S.to = f; save(); render(); runPlan(); }
      else if (a === "plan") { S.from = $("pqwF").value; S.to = $("pqwT").value; save(); runPlan(); }
      else if (a === "nm") nearMap(); else if (a === "ng") nearGps();
      else if (a === "fly") fly(el.dataset.c);
      else if (a === "wx") fetchWx();
      else if (a === "hl") { const o = $("pqwPlanOut"); o._all && showPath(o._all[+el.dataset.i].p); }
    });
    P.addEventListener("input", e => { if (e.target.id === "pqwMin") { S.minD = +e.target.value; $("pqwMD").textContent = S.minD; clearTimeout(build.t); build.t = setTimeout(refilter, 250); } if (e.target.id === "pqwQ") $("pqwList").innerHTML = listHtml(e.target.value); });
  }
  function open() { if (!P) build(); P.style.display = "flex"; render(); if (S.tab === "rute") runPlan(); redraw(); }
  function init() {
    const b = document.createElement("button"); b.id = "pqwBtn"; b.innerHTML = '<i class="fa-solid fa-plane-departure"></i>'; b.title = "Atlas Rute Pesawat Indonesia"; css();
    b.onclick = () => (P && P.style.display === "flex") ? (P.style.display = "none") : open();
    const put = () => { try { PQ_DOCK.adopt(b, "Rute Pesawat"); } catch (e) { b.style.cssText = "position:fixed;left:10px;bottom:310px;z-index:900"; document.body.append(b); } };
    typeof PQ_DOCK !== "undefined" ? put() : setTimeout(put, 1000);
    const m = gmap(); if (m && (S.on.ap || S.on.rt || S.on.sim || S.on.live || S.on.hub)) redraw(); else if (!m) setTimeout(() => { if (gmap() && (S.on.rt || S.on.ap)) redraw(); }, 2500);
  }
  window.PETAQU_PESAWAT = {
    open, plan, redraw, fetchWx, data: { AP, RT },
    setFrom: c => { S.from = c; save(); S.tab = "rute"; open(); },
    setTo: c => { S.to = c; save(); S.tab = "rute"; open(); },
    sel: c => { S.sel = c; S.on.ring = true; save(); drawRing(); sync("ring", true); render(); },
    wxOne: c => fetchWx([c]),
    isOn: () => !!(S.on.rt || S.on.ap || S.on.sim || S.on.live)
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(init, 500)); else setTimeout(init, 500);
})();
