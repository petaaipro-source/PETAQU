/* PETAQU Bencana Indonesia — gempa, tsunami, gunung api, banjir, longsor, karhutla & cuaca ekstrem
   untuk seluruh provinsi dan kabupaten/kota, lengkap dengan RIWAYAT kejadian & analisis cerdas.
   Sumber data: USGS (katalog gempa sejak 1900), BMKG (gempa terkini & dirasakan), NASA EONET (banjir, longsor,
   gunung api, karhutla, badai), + basis data kejadian besar bersejarah (kurasi BNPB/PVMBG/BMKG/USGS).
   Skor & peluang bersifat INDIKATIF (statistik historis), bukan peta bahaya resmi → rujuk InaRISK BNPB & BMKG.
   Terdaftar di menu Folder lewat window.PQ_FOLDER_EXTRA. */
(function () {
  "use strict";
  if (window.PETAQU_BENCANA_SEMUA) return;
  const $ = id => document.getElementById(id), DEG = Math.PI / 180, NOW = () => Date.now();
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = m => { try { toast(m, 3200); } catch (e) { } };
  const hav = (a, b, c, d) => { const x = Math.sin((c - a) * DEG / 2) ** 2 + Math.cos(a * DEG) * Math.cos(c * DEG) * Math.sin((d - b) * DEG / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const fD = t => { try { return new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); } catch (e) { return ""; } };
  const fDT = t => { try { return new Date(t).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\./g, ":"); } catch (e) { return ""; } };
  const nf = n => Math.round(n).toLocaleString("id-ID");
  const ago = t => { const d = (NOW() - t) / 864e5; return d < 1 ? Math.max(1, Math.round(d * 24)) + " jam lalu" : d < 60 ? Math.round(d) + " hari lalu" : d < 730 ? Math.round(d / 30) + " bln lalu" : Math.round(d / 365) + " th lalu"; };

  /* ---------- jenis bencana ---------- */
  const HZ = {
    gempa: { n: "Gempa bumi", e: "\u{1F30D}", c: "#f43f5e" },
    gunung: { n: "Gunung api", e: "\u{1F30B}", c: "#fb923c" },
    banjir: { n: "Banjir", e: "\u{1F4A7}", c: "#38bdf8" },
    longsor: { n: "Tanah longsor", e: "\u26F0\uFE0F", c: "#a16207" },
    karhutla: { n: "Kebakaran hutan & lahan", e: "\u{1F525}", c: "#f97316" },
    badai: { n: "Badai & cuaca ekstrem", e: "\u{1F300}", c: "#a78bfa" },
    hotspot: { n: "Titik panas satelit", e: "\u{1F6F0}\uFE0F", c: "#ef4444" },
    kering: { n: "Kekeringan", e: "\u{1F3DC}\uFE0F", c: "#facc15" }
  };
  const EON = { floods: "banjir", landslides: "longsor", volcanoes: "gunung", wildfires: "karhutla", severeStorms: "badai", drought: "kering" };
  const TIPS = {
    gempa: "Kenali jalur evakuasi & titik kumpul; saat guncangan lakukan Merunduk-Berlindung-Berpegangan; siapkan tas siaga bencana; pastikan bangunan tahan gempa.",
    tsunami: "Bila gempa kuat/lama terasa di pesisir, segera ke tempat tinggi tanpa menunggu sirine; hafal rute evakuasi vertikal/horizontal.",
    gunung: "Patuhi status & radius rekomendasi PVMBG/Badan Geologi; siapkan masker, kacamata; waspada lahar dingin saat hujan di hulu.",
    banjir: "Pantau peringatan dini cuaca BMKG; amankan dokumen & listrik; kenali titik kumpul; jangan menerobos arus deras.",
    longsor: "Waspadai lereng curam, retakan tanah, mata air keruh & hujan lebat berhari-hari; hindari hunian di bawah tebing.",
    karhutla: "Jangan membakar lahan; pantau titik panas; gunakan masker saat kabut asap; lapor ke BPBD/Manggala Agni.",
    hotspot: "Laporkan titik api ke BPBD/Manggala Agni; jangan membakar lahan; siapkan masker saat asap.",
    kering: "Hemat air, pantau status siaga kekeringan BMKG; waspada karhutla di lahan gambut kering.",
    badai: "Pangkas pohon rapuh, amankan atap & baliho; ikuti peringatan dini BMKG; hindari area terbuka saat petir."
  };

  /* ---------- basis data kejadian besar bersejarah (kurasi; angka korban = perkiraan, sumber berbeda dapat berbeda) ---------- */
  /* [jenis, tanggal, nama, lat, lng, korban jiwa, magnitudo, catatan, tsunami] */
  const CUR_RAW = [
    ["gunung", "1815-04-10", "Letusan Gunung Tambora (VEI 7)", -8.25, 118.0, 71000, null, "Letusan terbesar dalam sejarah tercatat; korban termasuk dampak kelaparan & penyakit. Memicu 'tahun tanpa musim panas' 1816.", 0],
    ["gunung", "1883-08-27", "Letusan Krakatau 1883", -6.10, 105.42, 36000, null, "Tsunami raksasa menyapu pesisir Selat Sunda; suara terdengar ribuan km.", 1],
    ["gunung", "1919-05-19", "Letusan Gunung Kelud 1919", -7.93, 112.31, 5100, null, "Lahar besar menerjang Blitar; mendorong dibangunnya terowongan pengendali air kawah.", 0],
    ["gunung", "1930-12-13", "Letusan Gunung Merapi 1930", -7.54, 110.45, 1369, null, "Awan panas melanda puluhan desa di lereng Merapi.", 0],
    ["gunung", "1963-03-17", "Letusan Gunung Agung 1963", -8.34, 115.51, 1600, null, "Aliran piroklastik & lahar; letusan terbesar Bali abad ke-20.", 0],
    ["gunung", "1979-02-20", "Gas beracun kawah Sinila, Dieng", -7.21, 109.92, 149, null, "Semburan gas CO\u2082 saat evakuasi warga akibat gempa & letusan freatik.", 0],
    ["gunung", "1982-05-05", "Letusan Gunung Galunggung 1982-83", -7.25, 108.06, null, null, "Abu vulkanik membuat pesawat British Airways 9 kehilangan semua mesin.", 0],
    ["gempa", "2000-06-04", "Gempa Enggano, Bengkulu", -4.72, 102.09, 103, 7.9, "Guncangan kuat di Bengkulu & Sumatera Selatan.", 0],
    ["gempa", "1992-12-12", "Gempa & tsunami Flores", -8.48, 121.9, 2500, 7.8, "Tsunami setinggi >20 m di Pulau Babi; Maumere paling parah.", 1],
    ["gempa", "1994-06-03", "Tsunami Banyuwangi", -10.48, 112.84, 250, 7.8, "Gempa 'tsunami earthquake' di selatan Jawa Timur.", 1],
    ["gempa", "2004-12-26", "Gempa & tsunami Aceh (Samudra Hindia)", 3.30, 95.78, 167000, 9.1, "Salah satu bencana alam paling mematikan; total >230.000 jiwa di 14 negara.", 1],
    ["gempa", "2005-03-28", "Gempa Nias", 2.09, 97.11, 1300, 8.6, "Menyusul gempa Aceh; pengangkatan daratan & kerusakan luas di Nias-Simeulue.", 0],
    ["gempa", "2006-05-27", "Gempa Yogyakarta", -7.96, 110.46, 5700, 6.4, "Sesar darat dangkal; kerusakan berat di Bantul & Klaten.", 0],
    ["gempa", "2006-07-17", "Tsunami Pangandaran", -9.33, 107.32, 650, 7.7, "Gempa tsunami di selatan Jawa Barat-Jawa Tengah (Cilacap).", 1],
    ["gempa", "2009-09-30", "Gempa Padang", -0.72, 99.87, 1100, 7.6, "Gempa intraslab dalam; ribuan bangunan runtuh di Padang & Pariaman.", 0],
    ["gempa", "2010-10-25", "Gempa & tsunami Mentawai", -3.49, 100.08, 500, 7.8, "Tsunami setinggi hingga 10 m di Pagai Selatan.", 1],
    ["gempa", "2012-04-11", "Gempa Aceh strike-slip M8.6", 2.33, 93.06, 2, 8.6, "Gempa mendatar raksasa di lepas pantai; korban sangat minim.", 0],
    ["gempa", "2018-08-05", "Gempa Lombok", -8.29, 116.45, 560, 6.9, "Rangkaian gempa Juli-Agustus 2018 di Lombok Utara.", 0],
    ["gempa", "2018-09-28", "Gempa, tsunami & likuefaksi Palu-Donggala", -0.18, 119.84, 4300, 7.5, "Likuefaksi masif di Petobo & Balaroa; tsunami di Teluk Palu.", 1],
    ["gempa", "2019-09-26", "Gempa Ambon", -3.60, 128.40, 41, 6.5, "Kerusakan luas di Ambon & Maluku Tengah.", 0],
    ["gempa", "2021-01-15", "Gempa Majene-Mamuju", -2.98, 118.89, 105, 6.2, "Merobohkan bangunan di Mamuju & Majene, Sulawesi Barat.", 0],
    ["gempa", "2022-11-21", "Gempa Cianjur", -6.84, 107.05, 600, 5.6, "Sesar darat dangkal (Cugenang); ribuan rumah rusak.", 0],
    ["gunung", "2010-10-26", "Letusan Gunung Merapi 2010", -7.54, 110.45, 350, null, "Letusan eksplosif terbesar sejak 1870; ratusan ribu mengungsi.", 0],
    ["gunung", "2014-02-01", "Erupsi Gunung Sinabung 2014", 3.17, 98.39, 16, null, "Awan panas menewaskan 16 orang (2014) & 7 orang (2016).", 0],
    ["gunung", "2018-12-22", "Tsunami Selat Sunda (Anak Krakatau)", -6.10, 105.42, 437, null, "Longsoran tubuh Anak Krakatau memicu tsunami tanpa peringatan gempa.", 1],
    ["gunung", "2021-12-04", "Erupsi & awan panas Gunung Semeru", -8.11, 112.92, 50, null, "Awan panas guguran melanda Curah Kobokan & Sumberwuluh, Lumajang.", 0],
    ["gunung", "2023-12-03", "Erupsi Gunung Marapi", -0.38, 100.47, 23, null, "Erupsi mendadak saat puluhan pendaki berada di jalur pendakian.", 0],
    ["gunung", "2024-11-03", "Erupsi Lewotobi Laki-laki", -8.54, 122.78, 9, null, "Erupsi besar menghantam desa-desa di Flores Timur.", 0],
    ["longsor", "2014-12-12", "Longsor Jemblung, Banjarnegara", -7.28, 109.67, 95, null, "Longsor besar menimbun dusun di Karangkobar, Jawa Tengah.", 0],
    ["banjir", "2007-02-02", "Banjir besar Jakarta 2007", -6.20, 106.85, 80, null, "Sekitar 60% wilayah Jakarta tergenang.", 0],
    ["banjir", "2016-09-20", "Banjir bandang Garut", -7.22, 107.90, 26, null, "Sungai Cimanuk meluap; puluhan hilang.", 0],
    ["banjir", "2019-03-16", "Banjir bandang Sentani", -2.57, 140.50, 112, null, "Banjir & longsor setelah hujan ekstrem di Jayapura.", 0],
    ["banjir", "2020-01-01", "Banjir Jabodetabek Tahun Baru 2020", -6.25, 106.85, 66, null, "Curah hujan tertinggi dalam puluhan tahun terakhir.", 0],
    ["banjir", "2021-01-14", "Banjir Kalimantan Selatan", -3.32, 114.59, 21, null, "Puluhan ribu rumah terendam di Banjar, HST, Tanah Laut.", 0],
    ["banjir", "2024-05-11", "Banjir lahar & bandang Sumatera Barat", -0.45, 100.45, 67, null, "Lahar dingin Marapi & hujan deras di Agam, Tanah Datar, Padang Panjang.", 0],
    ["karhutla", "2015-09-15", "Karhutla & asap lintas negara 2015", -2.2, 113.9, null, null, "\u00B12,6 juta ha terbakar (Sumatera & Kalimantan); salah satu krisis asap terburuk.", 0],
    ["karhutla", "2019-09-15", "Karhutla 2019", -2.3, 114.0, null, null, "\u00B11,6 juta ha terbakar; ISPU berbahaya di Riau, Jambi, Kalimantan.", 0]
  ];
  const CUR = CUR_RAW.map(a => ({ id: "c" + a[1] + a[3], type: a[0], t: Date.parse(a[1] + "T00:00:00Z"), title: a[2], lat: a[3], lng: a[4], deaths: a[5], m: a[6], note: a[7], tsu: !!a[8], cur: 1, src: "Kurasi BNPB/PVMBG/BMKG/USGS" }));
  /* gunung api aktif: [nama, lat, lng, tinggi mdpl, kelas(1=sangat aktif), riwayat] */
  const VOL = [
    ["Merapi", -7.542, 110.446, 2910, 1, "Letusan 1930 (\u22481.369 jiwa), 2010 (\u2248350 jiwa). Aktif hampir kontinu."],
    ["Semeru", -8.108, 112.922, 3676, 1, "Erupsi hampir tiap hari; awan panas 4 Des 2021 (\u224850 jiwa)."],
    ["Bromo", -7.942, 112.95, 2329, 1, "Kaldera Tengger; erupsi 2010-2011 & 2016."],
    ["Kelud", -7.93, 112.308, 1731, 1, "Letusan 1919 (\u22485.100 jiwa), 1990, 2007, 2014 (abu hingga Jabar)."],
    ["Anak Krakatau", -6.102, 105.423, 110, 1, "Runtuh 22 Des 2018 \u2192 tsunami Selat Sunda (437 jiwa). Induknya meletus 1883."],
    ["Sinabung", 3.17, 98.392, 2460, 1, "Aktif kembali 2010; awan panas mematikan 2014 (16) & 2016 (7)."],
    ["Agung", -8.342, 115.508, 3031, 1, "Letusan 1963 (\u22481.100-1.600 jiwa); erupsi 2017-2019."],
    ["Slamet", -7.242, 109.208, 3428, 1, "Gunung api tertinggi di Jawa Tengah; erupsi strombolian berkala."],
    ["Marapi", -0.38, 100.473, 2891, 1, "Erupsi 3 Des 2023 menewaskan 23 pendaki."],
    ["Lewotobi Laki-laki", -8.542, 122.775, 1584, 1, "Erupsi besar 3 Nov 2024 (9 jiwa)."],
    ["Ibu", 1.488, 127.63, 1325, 1, "Erupsi hampir harian sejak 2008."],
    ["Dukono", 1.693, 127.894, 1229, 1, "Erupsi kontinu sejak 1933."],
    ["Karangetang", 2.78, 125.407, 1797, 1, "Salah satu gunung api paling aktif di Sulawesi Utara."],
    ["Ruang", 2.3, 125.37, 725, 1, "Erupsi April 2024 memicu evakuasi ribuan warga & peringatan tsunami."],
    ["Lokon", 1.358, 124.792, 1580, 1, "Erupsi eksplosif berulang di dekat Tomohon-Manado."],
    ["Soputan", 1.108, 124.725, 1784, 1, "Erupsi eksplosif berulang (2011, 2016, 2018)."],
    ["Ijen", -8.058, 114.242, 2799, 2, "Danau kawah asam terbesar; gas beracun berbahaya bagi penambang."],
    ["Raung", -8.125, 114.042, 3332, 2, "Erupsi 2015 mengganggu penerbangan Bali-Jawa."],
    ["Tambora", -8.25, 118.0, 2850, 2, "Letusan 1815 (VEI 7), terbesar dalam sejarah tercatat."],
    ["Rinjani", -8.411, 116.457, 3726, 2, "Samalas 1257 (VEI 7); erupsi Barujari 2015-2016."],
    ["Galunggung", -7.25, 108.058, 2168, 2, "Letusan 1822 (ribuan jiwa) & 1982-83."],
    ["Dieng", -7.2, 109.92, 2565, 2, "Gas CO\u2082 Sinila 1979 (149 jiwa); letusan freatik Sileri 2017."],
    ["Tangkuban Parahu", -6.77, 107.6, 2084, 2, "Erupsi freatik berkala (2013, 2019); obyek wisata kawah."],
    ["Gede-Pangrango", -6.78, 106.98, 2958, 2, "Gunung api di Jawa Barat; pernah erupsi 1957."],
    ["Kerinci", -1.697, 101.264, 3805, 2, "Gunung api tertinggi di Sumatera; erupsi kecil berkala."]
  ].map(v => ({ id: "v" + v[0], type: "gunung", vol: 1, title: "Gunung " + v[0], lat: v[1], lng: v[2], elev: v[3], k: v[4], note: v[5] }));

  /* ---------- wilayah (batas kab/kota BIG) ---------- */
  let KAB = null;
  function dec(s) { let i = 0, la = 0, lo = 0, o = []; while (i < s.length) { let b, sh = 0, r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); la += r & 1 ? ~(r >> 1) : r >> 1; sh = 0; r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lo += r & 1 ? ~(r >> 1) : r >> 1; o.push([la / 1e5, lo / 1e5]); } return o; }
  function kabs() {
    if (KAB) return KAB; KAB = []; const D = window.PQ_KABBATAS || {};
    for (const p in D) D[p].forEach(k => { const rings = k[1].map(dec); let s = 90, w = 180, n = -90, e = -180; rings.forEach(r => r.forEach(q => { if (q[0] < s) s = q[0]; if (q[0] > n) n = q[0]; if (q[1] < w) w = q[1]; if (q[1] > e) e = q[1]; })); KAB.push({ p, n: k[0], rings, bb: [s, w, n, e], c: [(s + n) / 2, (w + e) / 2] }); });
    return KAB;
  }
  const pip = (r, la, lo) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > lo) !== (b[1] > lo) && la < (b[0] - a[0]) * (lo - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  function locate(e) {
    const K = kabs(); let best = null, bd = 1e9;
    for (const k of K) {
      const b = k.bb; if (e.lat >= b[0] && e.lat <= b[2] && e.lng >= b[1] && e.lng <= b[3]) { let c = false; k.rings.forEach(r => { if (pip(r, e.lat, e.lng)) c = !c; }); if (c) { e.prov = k.p; e.reg = k.n; e.off = false; return e; } }
      const d = hav(e.lat, e.lng, k.c[0], k.c[1]); if (d < bd) { bd = d; best = k; }
    }
    if (best) { e.prov = best.p; e.reg = best.n; e._k = best; } e.off = true; return e;
  }
  const provs = () => { const s = new Set(); kabs().forEach(k => s.add(k.p)); return [...s].sort(); };
  const kabOf = p => kabs().filter(k => k.p === p).map(k => k.n).sort();
  function regionObj() {
    if (!S.prov) return null; const L = kabs().filter(k => k.p === S.prov && (!S.kab || k.n === S.kab)); if (!L.length) return null;
    let s = 90, w = 180, n = -90, e = -180; L.forEach(k => { s = Math.min(s, k.bb[0]); w = Math.min(w, k.bb[1]); n = Math.max(n, k.bb[2]); e = Math.max(e, k.bb[3]); });
    return { list: L, bb: [s, w, n, e], c: [(s + n) / 2, (w + e) / 2], name: S.kab || S.prov };
  }
  const inReg = e => !S.prov || (e.prov === S.prov && (!S.kab || e.reg === S.kab));
  const distToReg = (R, lat, lng) => { let b = 1e9; R.list.forEach(k => k.rings.forEach(r => { for (let i = 0; i < r.length; i += 2) { const d = hav(lat, lng, r[i][0], r[i][1]); if (d < b) b = d; } })); return b; };

  /* ---------- state ---------- */
  const S = { t: {}, days: 30, mag: 4.5, hs: "24h", sb: "off", sov: {}, sop: .85, sd: new Date(Date.now() - 864e5).toISOString().slice(0, 10), src: {}, prov: "", kab: "", tab: "now", panel: false, loading: 0 };
  let FIREH = [], FC = {}, BG = null, ANI = 0, GROWN = {}, HOT = [], hotLoaded = false, SBL = null, SOL = {}, LIVE = [], EON_ALL = [], HIST = {}, LG = null, HG = null, OL = null, MK = {}, LST = [], P = null, started = false, loaded = false, histMarkers = false;
  CUR.forEach(locate); VOL.forEach(locate);
  const anyOn = () => Object.keys(S.t).some(k => S.t[k]);

  /* ---------- pengambilan data ---------- */
  const tmo = (u, ms) => { const c = new AbortController(); const id = setTimeout(() => c.abort(), ms || 25000); return fetch(u, { signal: c.signal }).then(r => { clearTimeout(id); if (!r.ok) throw 0; return r.json(); }); };
  function addEq(list, e) { if ([e.t, e.lat, e.lng, e.m].some(isNaN)) return; if (list.some(x => Math.abs(x.t - e.t) < 12e4 && hav(x.lat, x.lng, e.lat, e.lng) < 150)) return; list.push(e); }
  const usgsUrl = (bb, mm, start) => "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=" + bb[0] + "&maxlatitude=" + bb[2] + "&minlongitude=" + bb[1] + "&maxlongitude=" + bb[3] + "&minmagnitude=" + mm + "&orderby=time&limit=20000&starttime=" + start;
  const eonUrl = (bb, extra) => "https://eonet.gsfc.nasa.gov/api/v3/events?status=all&bbox=" + bb[1] + "," + bb[2] + "," + bb[3] + "," + bb[0] + "&category=floods,landslides,volcanoes,wildfires,severeStorms,drought&limit=1000" + (extra || "");
  function usgsList(j, out) { (j.features || []).forEach(f => { const c = f.geometry.coordinates, p = f.properties; addEq(out, { id: "u" + f.id, type: "gempa", t: p.time, lat: c[1], lng: c[0], m: +p.mag, d: Math.max(1, c[2] || 10), src: "USGS", title: "Gempa M" + (+p.mag).toFixed(1), place: p.place || "", url: p.url, tsu: p.tsunami === 1 }); }); }
  function eonList(j, out) {
    (j.events || []).forEach(ev => {
      const cat = EON[(ev.categories[0] || {}).id]; if (!cat || !ev.geometry || !ev.geometry.length) return;
      const g = ev.geometry[ev.geometry.length - 1]; let co = g.coordinates; while (Array.isArray(co[0])) co = co[0]; if (!co || co.length < 2) return;
      const src = (ev.sources && ev.sources[0]) ? ev.sources[0].url : ev.link; let ha = 0, poly = null;
      if (cat === "karhutla") { const mu = String(g.magnitudeUnit || ""), mv = +g.magnitudeValue; if (mv > 0) ha = /acre/i.test(mu) ? mv * .4047 : /hect/i.test(mu) ? mv : /km/i.test(mu) ? mv * 100 : 0; if (g.type === "Polygon" && g.coordinates && g.coordinates[0] && g.coordinates[0].length > 3) { poly = g.coordinates[0].map(c => [c[1], c[0]]); } }
      out.push({ id: "e" + ev.id, type: cat, t: Date.parse(ev.geometry[0].date), t2: Date.parse(g.date), lat: co[1], lng: co[0], title: ev.title, src: "NASA EONET", url: src, closed: ev.closed, ha, poly, mag: g.magnitudeValue ? g.magnitudeValue + " " + (g.magnitudeUnit || "") : "" });
    });
  }
  const FIRMS = [["VIIRS S-NPP", "suomi-npp-viirs-c2", "SUOMI_VIIRS_C2", "VIIRS_SNPP_NRT"], ["VIIRS NOAA-20", "noaa-20-viirs-c2", "J1_VIIRS_C2", "VIIRS_NOAA20_NRT"], ["VIIRS NOAA-21", "noaa-21-viirs-c2", "J2_VIIRS_C2", "VIIRS_NOAA21_NRT"], ["MODIS Terra/Aqua", "modis-c6.1", "MODIS_C6_1", "MODIS_NRT"]];
  const SATB = [["off", "Mati", "", 0], ["MODIS_Terra_CorrectedReflectance_TrueColor", "MODIS Terra", "jpg", 9], ["MODIS_Aqua_CorrectedReflectance_TrueColor", "MODIS Aqua", "jpg", 9], ["VIIRS_SNPP_CorrectedReflectance_TrueColor", "VIIRS S-NPP", "jpg", 9], ["VIIRS_NOAA20_CorrectedReflectance_TrueColor", "VIIRS NOAA-20", "jpg", 9]];
  const SATO = [["VIIRS_SNPP_Thermal_Anomalies_375m_All", "\u{1F525} Anomali termal VIIRS", "png", 9], ["MODIS_Combined_Value_Added_AOD", "\u{1F32B} Asap/aerosol (AOD)", "png", 6]];
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k) || ""; localStorage.setItem(k, v); } catch (e) { return ""; } };
  const txt = (u, ms) => { const c = new AbortController(); const id = setTimeout(() => c.abort(), ms || 40000); return fetch(u, { signal: c.signal }).then(r => { clearTimeout(id); if (!r.ok) throw 0; return r.text(); }); };
  function parseFirms(t, name, out) {
    const ln = t.trim().split(/\r?\n/), hd = (ln[0] || "").split(","), ix = k => hd.indexOf(k); const iLa = ix("latitude"), iLo = ix("longitude"), iD = ix("acq_date"), iT = ix("acq_time"), iC = ix("confidence"), iF = ix("frp"), iN = ix("daynight");
    if (iLa < 0 || iLo < 0 || iD < 0) return -1; let n = 0;
    for (let i = 1; i < ln.length; i++) {
      const c = ln[i].split(","), la = +c[iLa], lo = +c[iLo]; if (!(la > -12.5 && la < 7.5 && lo > 94 && lo < 142)) continue;
      const cf = c[iC], cn = isNaN(+cf) ? ({ l: 20, n: 60, h: 90 }[cf] || 50) : +cf; if (cn < 30) continue;
      const tm = String(c[iT] || "0000").padStart(4, "0"), t = Date.parse(c[iD] + "T" + tm.slice(0, 2) + ":" + tm.slice(2) + ":00Z"); if (isNaN(t)) continue;
      out.push({ sat: name, lat: la, lng: lo, t, frp: +c[iF] || 0, conf: cn, dn: c[iN], d: c[iD] }); n++;
    } return n;
  }
  const edgeKm = e => { const k = e._k; if (!k) return 1e9; let b = 1e9; k.rings.forEach(r => r.forEach(q => { const d = hav(e.lat, e.lng, q[0], q[1]); if (d < b) b = d; })); return b; };
  async function loadHot(force) {
    if (hotLoaded && !force) return; hotLoaded = true; S.loading++; render();
    const key = ls("pq_firms_key"), px = ls("pq_bnc_px"), span = S.hs, days = span === "24h" ? 1 : span === "48h" ? 2 : 5, raw = [], wrap = u => px ? px + encodeURIComponent(u) : u;
    await Promise.all(FIRMS.map(async f => {
      let t = null, err = "";
      try { t = await txt(wrap("https://firms.modaps.eosdis.nasa.gov/data/active_fire/" + f[1] + "/csv/" + f[2] + "_SouthEast_Asia_" + span + ".csv")); } catch (x) { err = "diblokir CORS / tidak tersedia"; }
      let n = t != null ? parseFirms(t, f[0], raw) : -1;
      if (n < 0 && key) { try { t = await txt(wrap("https://firms.modaps.eosdis.nasa.gov/api/area/csv/" + key + "/" + f[3] + "/94,-12.5,142,7.5/" + days)); n = parseFirms(t, f[0], raw); err = n < 0 ? "MAP_KEY tidak valid" : ""; } catch (x) { err = "API key gagal"; } }
      S.src[f[0]] = n >= 0 ? { ok: 1, n } : { ok: 0, err: err || "format tidak dikenali" };
    }));
    const M = {}; raw.forEach(r => { const k = Math.round(r.lat * 100) + "_" + Math.round(r.lng * 100) + "_" + r.d, o = M[k]; if (!o) M[k] = { ...r, sats: [r.sat] }; else { if (o.sats.indexOf(r.sat) < 0) o.sats.push(r.sat); if (r.frp > o.frp) { o.frp = r.frp; o.t = r.t; } } });
    const out = Object.keys(M).map(k => { const m = M[k]; return { id: "h" + k, type: "hotspot", t: m.t, lat: m.lat, lng: m.lng, frp: m.frp, conf: m.conf, dn: m.dn, sats: m.sats, title: "Titik panas satelit", src: "NASA FIRMS \u00B7 " + m.sats.join(", ") }; });
    out.forEach(locate); HOT = out.filter(e => !e.off || edgeKm(e) < 8).sort((a, b) => b.t - a.t);
    S.src["Titik panas (gabungan)"] = { ok: HOT.length > 0 ? 1 : 0, n: HOT.length, err: HOT.length ? "" : "belum ada data \u2014 isi MAP_KEY/proxy" };
    FIREH = clusterFires(HOT);
    S.loading--; draw(); render();
  }
  function gdacsList(j, out) {
    const M = { FL: "banjir", TC: "badai", VO: "gunung", WF: "karhutla", DR: "kering" };
    (j.features || []).forEach(f => { const p = f.properties || {}, g = f.geometry || {}, ty = M[p.eventtype]; if (!ty || !g.coordinates) return; let co = g.coordinates; while (Array.isArray(co[0])) co = co[0]; const la = co[1], lo = co[0]; if (!(la > -12.5 && la < 7.5 && lo > 94 && lo < 142)) return;
      out.push({ id: "g" + p.eventid + "_" + (p.episodeid || 0), type: ty, t: Date.parse(p.fromdate), t2: Date.parse(p.todate || p.fromdate), lat: la, lng: lo, title: p.name || p.eventname || HZ[ty].n, alert: p.alertlevel, note: String(p.description || "").slice(0, 200), src: "GDACS (PBB/UE)", url: (p.url || {}).report || (p.url || {}).details, closed: p.iscurrent === "false" || p.iscurrent === false }); });
  }
  const mkTile = o => L.tileLayer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + o[0] + "/default/" + S.sd + "/GoogleMapsCompatible_Level" + o[3] + "/{z}/{y}/{x}." + o[2], { maxNativeZoom: o[3], maxZoom: 19, opacity: S.sop, zIndex: o[2] === "jpg" ? 20 : 22, attribution: "NASA GIBS" });
  function applySat() {
    if (typeof map === "undefined" || !map || !map.getPane) return; if (SBL) { map.removeLayer(SBL); SBL = null; }
    Object.keys(SOL).forEach(k => { map.removeLayer(SOL[k]); delete SOL[k]; });
    const b = SATB.find(x => x[0] === S.sb); if (b && b[0] !== "off") SBL = mkTile(b).addTo(map);
    SATO.forEach(o => { if (S.sov[o[0]]) SOL[o[0]] = mkTile(o).addTo(map); });
  }
  /* ---------- area terbakar: polygon organik dari luas (ha) atau gugus titik panas ---------- */
  const toKm = (p, c) => [(p[1] - c[1]) * 111.32 * Math.cos(c[0] * DEG), (p[0] - c[0]) * 110.57], fromKm = (q, c) => [c[0] + q[1] / 110.57, c[1] + q[0] / (111.32 * Math.cos(c[0] * DEG))];
  const areaKm2 = r => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
  function hull(P) { P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P; const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = []; P.forEach(p => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }); const up = []; for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } lo.pop(); up.pop(); return lo.concat(up); }
  const chaikin = (r, it) => { for (let k = 0; k < it; k++) { const o = []; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; o.push([.75 * p[0] + .25 * q[0], .75 * p[1] + .25 * q[1]], [.25 * p[0] + .75 * q[0], .25 * p[1] + .75 * q[1]]); } r = o; } return r; };
  const rng = str => { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } let a = h >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  function blobKm(A, seed) {
    const R = rng(seed), N = 32, r = Math.sqrt(A / Math.PI), el = 1 + R() * .7, th0 = R() * 6.283, ph = [R() * 6.28, R() * 6.28, R() * 6.28], pts = [];
    for (let i = 0; i < N; i++) { const t = i / N * 6.283, rho = r * (1 + .13 * Math.sin(2 * t + ph[0]) + .08 * Math.sin(3 * t + ph[1]) + .05 * Math.sin(5 * t + ph[2])), x = rho * Math.cos(t) * Math.sqrt(el), y = rho * Math.sin(t) / Math.sqrt(el); pts.push([x * Math.cos(th0) - y * Math.sin(th0), x * Math.sin(th0) + y * Math.cos(th0)]); }
    const k = Math.sqrt(A / areaKm2(pts)); return pts.map(p => [p[0] * k, p[1] * k]);
  }
  function eonFire(e) {
    if (FC[e.id]) return FC[e.id]; const c = [e.lat, e.lng]; let ring, ha = e.ha;
    if (e.poly) { ring = e.poly; const km = ring.map(q => toKm(q, c)); if (!ha) ha = areaKm2(km) * 100; }
    else ring = blobKm(ha / 100, e.id).map(q => fromKm(q, c));
    return FC[e.id] = { id: e.id, ring, c, ha, t: e.t2 || e.t, src: "NASA EONET", title: e.title, prov: e.prov, reg: e.reg, url: e.url, active: !e.closed && NOW() - (e.t2 || e.t) < 14 * 864e5, eon: 1, real: !!e.poly };
  }
  function clusterFires(H) {
    const cs = .03, G = {}; H.forEach((h, i) => { (G[Math.floor(h.lat / cs) + "_" + Math.floor(h.lng / cs)] = G[Math.floor(h.lat / cs) + "_" + Math.floor(h.lng / cs)] || []).push(i); });
    const par = H.map((_, i) => i), find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    H.forEach((h, i) => { const ci = Math.floor(h.lat / cs), cj = Math.floor(h.lng / cs); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) (G[(ci + a) + "_" + (cj + b)] || []).forEach(j => { if (j > i && hav(h.lat, h.lng, H[j].lat, H[j].lng) < 3) par[find(j)] = find(i); }); });
    const C = {}; H.forEach((h, i) => { const r = find(i); (C[r] = C[r] || []).push(h); });
    return Object.keys(C).map(k => {
      const pts = C[k], n = pts.length, c = [pts.reduce((s, q) => s + q.lat, 0) / n, pts.reduce((s, q) => s + q.lng, 0) / n], uniq = new Set(pts.map(q => Math.round(q.lat * 300) + "_" + Math.round(q.lng * 300))).size, want = Math.max(.14, uniq * .14), id = "f" + Math.round(c[0] * 1000) + "_" + Math.round(c[1] * 1000);
      let km = hull(pts.map(q => toKm([q.lat, q.lng], c))), ring;
      if (km.length < 3 || areaKm2(km) < .02) ring = blobKm(want, id);
      else { const R = rng(id); km = km.map(p => { const d = Math.hypot(p[0], p[1]) || 1, f = (d + .45) / d; return [p[0] * f, p[1] * f]; }); ring = chaikin(km, 2).map(p => { const j = 1 + (R() - .5) * .1; return [p[0] * j, p[1] * j]; }); const ar = areaKm2(ring); if (ar < want) { const f = Math.min(2.5, Math.sqrt(want / ar)); ring = ring.map(p => [p[0] * f, p[1] * f]); } }
      const o = pts.reduce((m, q) => q.t > m.t ? q : m, pts[0]), sats = new Set(); pts.forEach(q => (q.sats || []).forEach(x => sats.add(x)));
      return { id, ring: ring.map(q => fromKm(q, c)), c, ha: areaKm2(ring) * 100, t: o.t, src: "NASA FIRMS \u00B7 " + [...sats].join(", "), title: "Area kebakaran terdeteksi satelit", prov: o.prov, reg: o.reg, n, frp: pts.reduce((s, q) => s + (q.frp || 0), 0), active: NOW() - o.t < 72 * 36e5, hs: 1 };
    });
  }
  function fires() { const lim = NOW() - S.days * 864e5, out = []; FIREH.forEach(f => { if (f.t >= lim && inReg(f)) out.push(f); }); EON_ALL.forEach(e => { if (e.type === "karhutla" && (e.ha > 0 || e.poly) && (e.t2 || e.t) >= lim && inReg(e)) out.push(eonFire(e)); }); return out; }
  const FB = f => L.latLngBounds(f.ring);
  const sc = (ring, c, k) => ring.map(p => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]);
  function firePopup(f) {
    const km2 = f.ha / 100, ff = f.ha / .714;
    let h = '<div class="ph" style="background:linear-gradient(135deg,#7c2d12,#ea580c 60%,#f59e0b)"><div class="pe">\u{1F525}</div><div class="pt"><b>' + esc(f.title) + "</b><small>" + (f.active ? "Aktif / baru terdeteksi" : "Sudah padam / lama") + (f.real ? " \u00B7 batas resmi EONET" : " \u00B7 bentuk perkiraan") + '</small></div></div><div class="pb">';
    h += rowP("\u{1F4D0}", "Luas", "<b>" + nf(f.ha) + " ha</b> \u00B7 " + (km2 < 10 ? km2.toFixed(2) : nf(km2)) + " km\u00B2") + rowP("\u26BD", "Setara", "\u2248" + nf(ff) + " lapangan sepak bola");
    if (f.n) h += rowP("\u{1F6F0}", "Titik panas", nf(f.n) + " \u00B7 FRP " + nf(f.frp) + " MW"); h += rowP("\u{1F550}", "Terdeteksi", fDT(f.t) + " <em>" + ago(f.t) + "</em>") + rowP("\u{1F4CD}", "Wilayah", esc((f.reg ? f.reg + ", " : "") + (f.prov || "")));
    h += '<div class="pn">' + (f.real ? "Polygon dari data NASA EONET." : f.hs ? "Bentuk & luas diperkirakan dari gugus titik panas satelit (\u00B1, 1 piksel VIIRS \u2248 14 ha) \u2014 bukan batas resmi." : "Bentuk digambar menyesuaikan luas yang dilaporkan; batas sebenarnya bisa berbeda.") + '</div><div class="pf"><span>' + esc(f.src) + "</span>" + (f.url ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">Detail \u2197</a>' : "") + "</div></div>";
    return h;
  }
  function drawBurn(bnd) {
    const z = map.getZoom(); if (z < 7) return; const F = fires().filter(f => !bnd || bnd.intersects(FB(f))).sort((a, b) => b.ha - a.ha).slice(0, 140), items = [];
    F.forEach((f, i) => {
      const live = f.active, K = [1, .8, .42], cls = ["pqbs-burn" + (live ? "" : " out"), "pqbs-front", "pqbs-core"], P = [];
      const fresh = !GROWN[f.id]; GROWN[f.id] = 1;
      [0, 1, live ? 2 : -1].forEach((n, j) => { if (n < 0) return; const pl = L.polygon(fresh ? sc(f.ring, f.c, .03) : sc(f.ring, f.c, K[n]), { className: cls[n], interactive: n === 0, smoothFactor: .6 }); if (n === 0) pl.bindPopup(firePopup(f), { maxWidth: 300, className: "pqbs-pop" }); if (!live && n === 1) return; BG.addLayer(pl); P.push({ pl, k: K[n], j }); });
      if (fresh) items.push({ f, P });
      if (live && i < 30 && z >= 8) { let sp = ""; for (let q = 0; q < 6; q++) sp += '<i style="--dx:' + Math.round((q - 2.5) * 9) + "px;animation-delay:" + (q * .38).toFixed(2) + 's"></i>'; BG.addLayer(L.marker(f.c, { icon: L.divIcon({ className: "", html: '<div class="pqbs-spk">' + sp + "</div>", iconSize: [0, 0] }), interactive: false, keyboard: false })); }
    });
    if (items.length) { const t0 = performance.now(), D = 2400, tok = ANI; (function fr(now) { if (tok !== ANI) return; const k = Math.min(1, (now - t0) / D); items.forEach(it => it.P.forEach(o => { const d = o.j * .12, e0 = Math.min(1, Math.max(0, (k - d) / (1 - d))), e = 1 - Math.pow(1 - e0, 3); o.pl.setLatLngs(sc(it.f.ring, it.f.c, Math.max(.03, o.k * e))); })); if (k < 1) requestAnimationFrame(fr); })(t0); }
  }
  async function load(force) {
    if (loaded && !force) return; loaded = true; S.loading++; render();
    const iso = new Date(NOW() - 365 * 864e5).toISOString().slice(0, 19), nat = [-12.5, 94, 7.5, 142], out = [], ev = [];
    const B = ["gempaterkini", "gempadirasakan"].map(n => tmo("https://data.bmkg.go.id/DataMKG/TEWS/" + n + ".json", 15000));
    const gd = new Date(NOW() - 120 * 864e5).toISOString().slice(0, 10), gt = new Date().toISOString().slice(0, 10);
    const [u, e, gx, ...b] = await Promise.allSettled([tmo(usgsUrl(nat, 4.5, iso)), tmo(eonUrl(nat, "&days=730")), tmo("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=FL,TC,VO,WF,DR&fromdate=" + gd + "&todate=" + gt, 30000), ...B]);
    S.src["USGS (gempa)"] = u.status === "fulfilled" ? { ok: 1, n: ((u.value || {}).features || []).length } : { ok: 0, err: "gagal dimuat" };
    S.src["NASA EONET"] = e.status === "fulfilled" ? { ok: 1, n: ((e.value || {}).events || []).length } : { ok: 0, err: "gagal dimuat" };
    S.src["GDACS (PBB/UE)"] = gx.status === "fulfilled" ? { ok: 1, n: ((gx.value || {}).features || []).length } : { ok: 0, err: "gagal/CORS" };
    S.src["BMKG (gempa)"] = b.some(r => r.status === "fulfilled") ? { ok: 1, n: 0 } : { ok: 0, err: "gagal/CORS" };
    b.forEach(r => { if (r.status === "fulfilled") ((r.value.Infogempa || {}).gempa || []).forEach(g => { const c = String(g.Coordinates || "").split(",").map(Number); addEq(out, { id: "b" + g.DateTime, type: "gempa", t: Date.parse(g.DateTime), lat: c[0], lng: c[1], m: +g.Magnitude, d: parseFloat(g.Kedalaman) || 10, src: "BMKG", title: "Gempa M" + (+g.Magnitude).toFixed(1), place: g.Wilayah || "", felt: g.Dirasakan || "", tsu: /berpotensi tsunami/i.test(g.Potensi || "") && !/tidak/i.test(g.Potensi || "") }); }); });
    if (u.status === "fulfilled") usgsList(u.value, out);
    if (e.status === "fulfilled") eonList(e.value, ev);
    if (gx.status === "fulfilled") gdacsList(gx.value, ev);
    if (out.length) { out.forEach(locate); out.sort((a, b) => b.t - a.t); LIVE = out; try { localStorage.setItem("pq_bnc_eq", JSON.stringify(out.slice(0, 1500))); } catch (x) { } }
    else { try { LIVE = JSON.parse(localStorage.getItem("pq_bnc_eq") || "[]"); } catch (x) { LIVE = []; } say(LIVE.length ? "Offline: data gempa tersimpan dipakai" : "Gagal memuat data gempa (USGS/BMKG)"); }
    if (ev.length) { ev.forEach(locate); ev.sort((a, b) => b.t2 - a.t2); EON_ALL = ev; try { localStorage.setItem("pq_bnc_eon", JSON.stringify(ev.slice(0, 600))); } catch (x) { } }
    else { try { EON_ALL = JSON.parse(localStorage.getItem("pq_bnc_eon") || "[]"); } catch (x) { EON_ALL = []; } }
    S.loading--; draw(); render(); if (S.t.hotspot || S.t.burn) loadHot();
  }
  async function loadHist() {
    const R = regionObj(); if (!R) return; const key = S.prov + "|" + S.kab; if (HIST[key]) return;
    S.loading++; render(); const pad = .3, bb = [R.bb[0] - pad, R.bb[1] - pad, R.bb[2] + pad, R.bb[3] + pad], eq = [], ev = [];
    const [u, e] = await Promise.allSettled([tmo(usgsUrl(bb, S.kab ? 4 : 4.5, "1900-01-01"), 40000), tmo(eonUrl(bb), 25000)]);
    if (u.status === "fulfilled") usgsList(u.value, eq); if (e.status === "fulfilled") eonList(e.value, ev);
    eq.forEach(locate); ev.forEach(locate); const f = x => x.prov === S.prov && (!S.kab || x.reg === S.kab);
    HIST[key] = { eq: eq.filter(f).sort((a, b) => b.t - a.t), ev: ev.filter(f), ok: u.status === "fulfilled", t: NOW() };
    S.loading--; draw(); render();
  }

  /* ---------- statistik & analisis cerdas ---------- */
  function volNear(R, km) { return VOL.map(v => ({ v, d: distToReg(R, v.lat, v.lng), inside: v.prov === S.prov && (!S.kab || v.reg === S.kab) && !v.off })).filter(x => x.inside || x.d <= km).sort((a, b) => a.d - b.d); }
  function analyze() {
    const R = regionObj(); if (!R) return null; const H = HIST[S.prov + "|" + S.kab]; if (!H) return null;
    const Y0 = 1973, yrs = new Date().getUTCFullYear() - Y0 + 1, eq = H.eq.filter(e => e.t >= Date.UTC(Y0, 0, 1)), cnt = m => eq.filter(e => e.m >= m).length;
    const rate = m => cnt(m) / yrs, p10 = m => 1 - Math.exp(-rate(m) * 10);
    const e45 = eq.filter(e => e.m >= 4.5); let b = null;
    if (e45.length >= 30) { const mean = e45.reduce((s, e) => s + e.m, 0) / e45.length; b = Math.LOG10E / (mean - 4.45); }
    const last5 = e45.filter(e => e.t >= NOW() - 5 * 365.25 * 864e5).length / 5, longRate = e45.length / yrs, trend = longRate ? last5 / longRate : 0;
    const curR = CUR.filter(inReg), allEv = H.ev.concat(EON_ALL.filter(inReg).filter(x => !H.ev.some(y => y.id === x.id)));
    const ec = c => allEv.filter(x => x.type === c).length, cc = c => curR.filter(x => x.type === c).length;
    const vn = volNear(R, 45), tsuC = curR.filter(x => x.tsu).length, offM7 = eq.filter(e => e.off && e.m >= 6.8 && e.d <= 70).length;
    const sx = rate(5) + 4 * rate(6) + 20 * rate(7), sc = {
      gempa: Math.round(100 * (1 - Math.exp(-sx / 1.5))),
      tsunami: Math.min(100, tsuC * 35 + offM7 * 12 + (curR.some(x => x.tsu) ? 10 : 0)),
      gunung: Math.min(100, vn.reduce((s, x) => s + (x.v.k === 1 ? (x.inside ? 50 : x.d < 25 ? 38 : 20) : (x.inside ? 28 : 12)), 0)),
      banjir: Math.min(100, ec("banjir") * 14 + cc("banjir") * 30), longsor: Math.min(100, ec("longsor") * 16 + cc("longsor") * 30),
      karhutla: Math.min(100, ec("karhutla") * 10 + cc("karhutla") * 25 + Math.round(HOT.filter(inReg).length / 3)), badai: Math.min(100, ec("badai") * 18)
    };
    const ks = Object.keys(sc).sort((a, b) => sc[b] - sc[a]), overall = Math.min(100, Math.round(sc[ks[0]] * .6 + (sc[ks[1]] + sc[ks[2]]) / 2 * .4));
    const top = eq.slice().sort((a, b) => b.m - a.m).slice(0, 6), deadly = curR.filter(x => x.deaths).sort((a, b) => b.deaths - a.deaths);
    return { R, H, eq, e45, yrs, Y0, rate, p10, b, last5, longRate, trend, allEv, ec, cc, vn, sc, ks, overall, top, deadly, curR, n: { 5: cnt(5), 6: cnt(6), 7: cnt(7) } };
  }
  const LVL = v => v < 20 ? ["Rendah", "#34d399"] : v < 45 ? ["Sedang", "#facc15"] : v < 70 ? ["Tinggi", "#fb923c"] : ["Sangat tinggi", "#f43f5e"];
  const NM = { hotspot: "Titik panas", kering: "Kekeringan", gempa: "Gempa bumi", tsunami: "Tsunami", gunung: "Gunung api", banjir: "Banjir", longsor: "Longsor", karhutla: "Karhutla", badai: "Badai/cuaca ekstrem" };
  function narrative(A) {
    const nm = A.R.name, o = [], lv = LVL(A.overall)[0].toLowerCase();
    o.push("Profil kebencanaan " + nm + (S.kab ? ", " + S.prov : "") + " tergolong <b>" + lv + "</b> (skor " + A.overall + "/100), dengan bahaya dominan <b>" + NM[A.ks[0]].toLowerCase() + "</b>" + (A.sc[A.ks[1]] >= 20 ? " dan " + NM[A.ks[1]].toLowerCase() : "") + ".");
    if (A.H.ok && A.eq.length) {
      const t = A.top[0]; o.push("Sejak " + A.Y0 + " tercatat <b>" + nf(A.e45.length) + "</b> gempa M\u22654,5 (\u2248" + A.longRate.toFixed(1) + "/tahun); terkuat <b>M" + t.m.toFixed(1) + "</b> pada " + fD(t.t) + " (kedalaman " + Math.round(t.d) + " km).");
      if (A.rate(6) > 0) o.push("Peluang \u22651 gempa M\u22656 dalam 10 tahun ke depan \u2248 <b>" + Math.round(A.p10(6) * 100) + "%</b>" + (A.rate(7) > 0 ? ", M\u22657 \u2248 " + Math.round(A.p10(7) * 100) + "%" : "") + " (model Poisson dari frekuensi historis, indikatif).");
      if (A.longRate > 0 && A.e45.length > 20) o.push("Aktivitas 5 tahun terakhir <b>" + A.trend.toFixed(1) + "\u00D7</b> rata-rata jangka panjang" + (A.trend > 1.5 ? " \u2014 lebih aktif dari biasanya." : A.trend < .6 ? " \u2014 relatif tenang (bukan jaminan aman)." : " \u2014 mendekati normal."));
      if (A.b) o.push("Nilai-b Gutenberg-Richter \u2248 " + A.b.toFixed(2) + (A.b < .85 ? " (proporsi gempa besar relatif tinggi)." : A.b > 1.15 ? " (didominasi gempa kecil/swarm)." : " (normal)."));
    } else if (!A.H.ok) o.push("Katalog gempa USGS belum bisa dimuat (periksa koneksi); analisis memakai data lain.");
    if (A.vn.length) o.push("Gunung api terdekat: " + A.vn.slice(0, 3).map(x => "<b>" + esc(x.v.title.replace("Gunung ", "")) + "</b> (" + (x.inside ? "di wilayah ini" : Math.round(x.d) + " km") + ")").join(", ") + ".");
    if (A.deadly.length) { const d = A.deadly[0]; o.push("Kejadian paling mematikan tercatat: <b>" + esc(d.title) + "</b> (" + new Date(d.t).getUTCFullYear() + ", \u2248" + nf(d.deaths) + " jiwa)."); }
    const hh = HOT.filter(inReg).length; if (hh) o.push("Satelit (NASA FIRMS) mendeteksi <b>" + nf(hh) + "</b> titik panas di wilayah ini dalam " + ({ "24h": "24 jam", "48h": "48 jam", "7d": "7 hari" })[S.hs] + " terakhir.");
    const fa = fires().filter(f => true), ft = fa.reduce((q, f) => q + f.ha, 0); if (fa.length) o.push("Area kebakaran terdeteksi: <b>" + nf(fa.length) + "</b> area, total \u2248 <b>" + nf(ft) + " ha</b> (perkiraan satelit).");
    const hy = A.ec("banjir") + A.ec("longsor"); if (hy) o.push("NASA EONET mencatat " + A.ec("banjir") + " kejadian banjir & " + A.ec("longsor") + " longsor besar di wilayah ini (belum termasuk kejadian kecil lokal \u2014 lihat DIBI/InaRISK BNPB).");
    return o;
  }
  function plainText(A) { const d = document.createElement("div"); d.innerHTML = narrative(A).join("\n"); return "RIWAYAT & RISIKO BENCANA \u2014 " + A.R.name + (S.kab ? ", " + S.prov : "") + "\n" + d.textContent + "\nSumber: USGS, BMKG, NASA EONET, kurasi PETAQU. Indikatif; rujuk BNPB (inarisk.bnpb.go.id) & BMKG."; }

  /* ---------- peta ---------- */
  const rowP = (ic, l, v) => v ? '<div class="pr"><span>' + ic + '</span><i>' + l + '</i><b>' + v + '</b></div>' : "";
  function popup(e) {
    const h = HZ[e.type], c = h.c, q = e.type === "gempa" && e.m != null;
    const kind = e.vol ? "Gunung api " + (e.k === 1 ? "sangat aktif" : "aktif") : e.cur ? "Kejadian besar bersejarah" : h.n;
    let s = '<div class="ph" style="background:linear-gradient(135deg,' + c + "," + c + '88)"><div class="pe">' + (q ? '<b>' + e.m.toFixed(1) + '</b>' : e.tsu ? "\u{1F30A}" : h.e) + '</div><div class="pt"><b>' + esc(e.title) + "</b><small>" + esc(kind) + (e.tsu ? " \u00B7 \u{1F30A} tsunami" : "") + "</small></div></div><div class=\"pb\">";
    if (e.vol) s += rowP("\u26F0", "Tinggi", nf(e.elev) + " mdpl");
    else if (e.t) s += rowP("\u{1F550}", "Waktu", (e.cur ? fD(e.t) : fDT(e.t)) + ' <em>' + (e.cur ? new Date(e.t).getUTCFullYear() : ago(e.t)) + "</em>");
    if (e.t2 && e.t2 - e.t > 36e5) s += rowP("\u21BB", "Pembaruan", fD(e.t2) + (e.closed ? " (selesai)" : " (berlangsung)"));
    if (e.d != null) s += rowP("\u2B07", "Kedalaman", Math.round(e.d) + " km (" + (e.d < 70 ? "dangkal" : e.d < 300 ? "menengah" : "dalam") + ")");
    if (e.type === "hotspot") { s += rowP("\u{1F321}", "Daya api (FRP)", (e.frp ? e.frp.toFixed(1) : "-") + " MW"); s += rowP("\u{1F6F0}", "Satelit", esc((e.sats || []).join(", "))); s += rowP("\u{1F3AF}", "Keyakinan", Math.round(e.conf) + "% \u00B7 " + (e.dn === "N" ? "malam" : "siang")); }
    if (e.alert) s += rowP("\u{1F6A8}", "Siaga GDACS", esc(e.alert));
    if (e.reg || e.prov) s += rowP("\u{1F4CD}", "Wilayah", esc((e.off ? "Dekat " : "") + (e.reg ? e.reg + ", " : "") + (e.prov || "")));
    if (e.place) s += rowP("\u{1F9ED}", "Lokasi", esc(e.place)); if (e.felt) s += rowP("\u{1F4E3}", "Dirasakan", esc(e.felt)); if (e.mag) s += rowP("\u{1F4CF}", "Ukuran", esc(e.mag));
    if (e.deaths) s += rowP("\u{1F480}", "Korban", "\u2248" + nf(e.deaths) + " jiwa");
    if (e.note) s += '<div class="pn">' + esc(e.note) + "</div>";
    s += '<div class="pf"><span>' + esc(e.src || "MAGMA/PVMBG") + "</span>" + (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">Detail \u2197</a>' : e.vol ? '<a href="https://magma.esdm.go.id/" target="_blank" rel="noopener">MAGMA \u2197</a>' : "") + "</div></div>";
    return s;
  }
  const bdg = (cls, c, sz, inner, pulse) => L.divIcon({ className: "", html: '<div class="pqbs-b ' + cls + (pulse ? " pqbs-pulse" : "") + '" style="--c:' + c + ";width:" + sz + "px;height:" + sz + "px;font-size:" + Math.round(sz * .5) + 'px">' + inner + "</div>", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
  function mk(e) {
    const h = HZ[e.type], o = { maxWidth: 300, className: "pqbs-pop" }, recent = NOW() - (e.t2 || e.t) < 3 * 864e5; let m;
    if (e.vol) m = L.marker([e.lat, e.lng], { icon: bdg("pqbs-vol", e.k === 1 ? "#f97316" : "#fbbf24", e.k === 1 ? 30 : 24, "\u{1F30B}", e.k === 1), zIndexOffset: 400 });
    else if (e.cur) m = L.marker([e.lat, e.lng], { icon: bdg("pqbs-star", h.c, 32, e.tsu ? "\u{1F30A}" : h.e, true), zIndexOffset: 800 });
    else if (e.type === "hotspot") { const f = e.frp || 0; m = L.circleMarker([e.lat, e.lng], { radius: 3.5 + Math.min(4.5, Math.sqrt(f) / 2.2), color: "#fff", weight: .7, fillColor: f >= 100 ? "#be123c" : f >= 40 ? "#ef4444" : f >= 10 ? "#f97316" : "#fbbf24", fillOpacity: .9 }); }
    else if (e.type === "gempa") {
      const mc = e.m >= 6 ? "#f43f5e" : e.m >= 5 ? "#fb923c" : "#facc15";
      if (e.m >= 5.5) { const z = Math.round(24 + (e.m - 5.5) * 10); m = L.marker([e.lat, e.lng], { icon: bdg("pqbs-q", mc, z, "<b>" + e.m.toFixed(1) + "</b>", recent), zIndexOffset: 600 + Math.round(e.m * 10) }); }
      else m = L.circleMarker([e.lat, e.lng], { radius: Math.max(3, 2.5 * (e.m - 3.4)), color: "#ffffffcc", weight: .8, fillColor: mc, fillOpacity: .8 });
    } else m = L.marker([e.lat, e.lng], { icon: bdg("pqbs-ev", h.c, 24, h.e, recent && !e.closed), zIndexOffset: 300 });
    return m.bindPopup(popup(e), o);
  }
  function clusterMk(a) {
    const n = a.length, h = HZ[a[0].type], la = a.reduce((s, e) => s + e.lat, 0) / n, ln = a.reduce((s, e) => s + e.lng, 0) / n, sz = Math.round(30 + Math.min(22, Math.log2(n) * 6));
    const m = L.marker([la, ln], { icon: L.divIcon({ className: "", html: '<div class="pqbs-b pqbs-cl" style="--c:' + h.c + ";width:" + sz + "px;height:" + sz + 'px"><span>' + h.e + "</span><b>" + n + "</b></div>", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }), zIndexOffset: 200 });
    m.bindTooltip(n + " " + h.n.toLowerCase() + " \u2014 klik untuk zoom", { direction: "top" }); m.on("click", () => map.setView([la, ln], Math.min(map.getZoom() + 2, 10))); return m;
  }
  const vis = () => { const lim = NOW() - S.days * 864e5; return LIVE.filter(e => S.t.gempa && e.t >= lim && e.m >= S.mag && inReg(e)).concat(HOT.filter(e => S.t.hotspot && e.t >= lim && inReg(e))).concat(EON_ALL.filter(e => S.t[e.type] && (e.t2 || e.t) >= lim && inReg(e))).sort((a, b) => (b.t2 || b.t) - (a.t2 || a.t)); };
  function draw() {
    if (typeof map === "undefined" || !map || !map.getPane) return;
    if (!LG) { LG = L.layerGroup().addTo(map); HG = L.layerGroup().addTo(map); OL = L.layerGroup().addTo(map); BG = L.layerGroup().addTo(map); }
    LG.clearLayers(); HG.clearLayers(); OL.clearLayers(); BG.clearLayers(); ANI++; MK = {}; LST = [];
    const R = regionObj(); if (R && anyOn()) R.list.forEach(k => OL.addLayer(L.polygon(k.rings, { color: "#22d3ee", weight: 2.5, fillColor: "#22d3ee", fillOpacity: .06, dashArray: "7 6", interactive: false })));
    if (!anyOn()) return;
    const add = e => { const m = mk(e); MK[e.id] = m; LG.addLayer(m); }, z = map.getZoom(), cell = z >= 8 ? 0 : 360 / Math.pow(2, z) * .2, cl = {};
    LST = vis(); const bnd = (!cell && LST.length > 400) ? map.getBounds().pad(.4) : null; LST.slice(0, 20000).forEach(e => { if (bnd && !bnd.contains([e.lat, e.lng]) && !(e.type === "gempa" && e.m >= 5.5)) return; if (!cell || (e.type === "gempa" && e.m >= 5.5)) add(e); else { const k = e.type + Math.floor(e.lat / cell) + "_" + Math.floor(e.lng / cell); (cl[k] = cl[k] || []).push(e); } });
    Object.keys(cl).forEach(k => { const a = cl[k]; if (a.length === 1) add(a[0]); else LG.addLayer(clusterMk(a)); });
    if (S.t.hist) CUR.filter(inReg).forEach(add);
    if (S.t.vol) VOL.filter(v => !S.prov || inReg(v) || (R && distToReg(R, v.lat, v.lng) < 45)).forEach(add);
    if (S.t.burn) drawBurn(bnd || (LST.length > 0 || true ? map.getBounds().pad(.3) : null));
    const H = HIST[S.prov + "|" + S.kab]; if (H && S.tab === "his" && histMarkers) H.eq.filter(e => e.m >= 5).slice(0, 1200).forEach(e => HG.addLayer(mk(e)));
  }
  function fit() { const R = regionObj(); if (R && typeof map !== "undefined") map.fitBounds([[R.bb[0], R.bb[1]], [R.bb[2], R.bb[3]]], { padding: [30, 30], maxZoom: 11 }); else if (typeof map !== "undefined") map.fitBounds([[-11.5, 95], [6.5, 141]]); }
  function fly(id) { const m = MK[id]; if (m) { map.setView(m.getLatLng(), Math.max(map.getZoom(), 8)); m.openPopup(); return; } const e = LST.concat(CUR, VOL).find(x => x.id === id); if (!e) return; map.setView([e.lat, e.lng], Math.max(map.getZoom(), 9)); setTimeout(() => { const mm = MK[id]; if (mm) mm.openPopup(); }, 700); }

  /* ---------- panel ---------- */
  const CSS = ".pqbs-pop,.pqbs-pop *{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif!important}path.pqbs-burn{fill:#120907;fill-opacity:.8;stroke:#ff7a1a;stroke-width:2.2;stroke-dasharray:9 7;stroke-linejoin:round;filter:drop-shadow(0 0 6px #ff4d00);animation:pqbsDash 1.1s linear infinite;cursor:pointer}path.pqbs-burn.out{stroke:#8b7766;stroke-dasharray:none;filter:none;animation:none;fill-opacity:.72}path.pqbs-front{fill:none;stroke:#ff3d00;stroke-width:5;stroke-opacity:.5;filter:blur(2.5px);pointer-events:none;animation:pqbsBreath 1.5s ease-in-out infinite alternate}path.pqbs-core{fill:#ff6a00;fill-opacity:.38;stroke:none;filter:blur(5px);pointer-events:none;animation:pqbsFlick .9s ease-in-out infinite alternate}@keyframes pqbsDash{to{stroke-dashoffset:-32}}@keyframes pqbsBreath{from{stroke-opacity:.22;stroke-width:3}to{stroke-opacity:.85;stroke-width:8}}@keyframes pqbsFlick{0%{fill-opacity:.18}40%{fill-opacity:.55;fill:#ffb000}100%{fill-opacity:.3;fill:#ff3d00}}.pqbs-spk{position:relative;width:0;height:0}.pqbs-spk i{position:absolute;left:0;top:0;width:4px;height:4px;margin:-2px;border-radius:50%;background:#ffd27a;box-shadow:0 0 6px 2px #ff6a00;opacity:0;animation:pqbsRise 2.3s ease-out infinite}@keyframes pqbsRise{0%{transform:translate(0,0) scale(1);opacity:0}15%{opacity:1}100%{transform:translate(var(--dx),-64px) scale(.2);opacity:0}}" +
    "#pqbsPanel{position:fixed;z-index:2950;top:70px;right:12px;width:380px;max-width:calc(100vw - 20px);max-height:calc(100% - 90px);display:none;flex-direction:column;background:linear-gradient(165deg,#071a26f2,#150d24f2);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#e6f1f7;border:1px solid #fb923c55;border-radius:18px;font:12.5px system-ui;box-shadow:0 20px 60px #000c,inset 0 1px 0 #ffffff14;overflow:hidden}#pqbsPanel.on{display:flex;animation:pqbsIn .28s ease}@keyframes pqbsIn{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:none}}" +
    "#pqbsPanel .h{display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(120deg,#f9731633,#f43f5e22 60%,transparent);border-bottom:1px solid #ffffff14}#pqbsPanel .h>span{font-size:22px;filter:drop-shadow(0 0 8px #fb923c)}#pqbsPanel .h b{flex:1;font-size:15px;letter-spacing:.3px;background:linear-gradient(90deg,#fed7aa,#fb923c,#f43f5e);-webkit-background-clip:text;background-clip:text;color:transparent}#pqbsPanel .x{cursor:pointer;width:26px;height:26px;border-radius:50%;background:#ffffff14;border:0;color:#fff;font-size:13px}#pqbsPanel .x:hover{background:#f43f5e}" +
    "#pqbsPanel .rg{display:flex;gap:6px;padding:10px 14px 0}#pqbsPanel select{flex:1;min-width:0;background:#0b2a3bcc;color:#e6f1f7;border:1px solid #ffffff26;border-radius:10px;padding:7px 6px;font:12px system-ui;outline:0}#pqbsPanel select:focus{border-color:#fb923c}" +
    "#pqbsPanel .tb{display:flex;gap:4px;margin:10px 14px 0;padding:3px;background:#00000040;border-radius:12px}#pqbsPanel .tb button{flex:1;padding:7px 2px;border-radius:9px;border:0;background:transparent;color:#9fc3d6;font:700 11.5px system-ui;cursor:pointer;transition:.2s}#pqbsPanel .tb button.a{background:linear-gradient(135deg,#fb923c,#f43f5e);color:#fff;box-shadow:0 3px 12px #f43f5e66}" +
    "#pqbsPanel .bd{overflow:auto;padding:10px 14px 14px;flex:1;scrollbar-width:thin;scrollbar-color:#fb923c55 transparent}#pqbsPanel .ch{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px}#pqbsPanel .c{padding:4px 9px;border-radius:14px;border:1px solid #ffffff26;cursor:pointer;font-size:11.5px;background:#ffffff08;opacity:.6;transition:.2s}#pqbsPanel .c:hover{opacity:.95}#pqbsPanel .c.a{opacity:1;border-color:var(--c);background:linear-gradient(135deg,var(--c)33,transparent);font-weight:700;box-shadow:0 0 10px var(--c)44}" +
    "#pqbsPanel .it{display:flex;gap:9px;padding:7px 6px;border-radius:10px;cursor:pointer;align-items:center;transition:.15s;border-left:3px solid var(--c,#ffffff22);margin-bottom:3px;background:#ffffff06}#pqbsPanel .it:hover{background:#ffffff14;transform:translateX(2px)}#pqbsPanel .it .e{font-size:15px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:9px;background:#ffffff10;flex:none;font-weight:800}#pqbsPanel .it small{display:block;color:#8fb0c2;font-size:11px;margin-top:1px}" +
    "#pqbsPanel .bx{background:linear-gradient(145deg,#ffffff10,#ffffff05);border:1px solid #ffffff16;border-radius:14px;padding:10px 12px;margin-bottom:10px}#pqbsPanel h4{margin:12px 0 6px;font-size:11.5px;color:#fdba74;letter-spacing:.8px;text-transform:uppercase}#pqbsPanel .bar{height:7px;border-radius:5px;background:#ffffff16;overflow:hidden;margin:3px 0 7px}#pqbsPanel .bar i{display:block;height:100%;border-radius:5px;transition:width .6s}" +
    "#pqbsPanel .rw{display:flex;justify-content:space-between;gap:8px;align-items:center}#pqbsPanel .mut{color:#8fb0c2;font-size:11px}#pqbsPanel .btn{padding:7px 11px;border-radius:9px;border:1px solid #fb923c77;background:linear-gradient(135deg,#fb923c33,#f43f5e22);color:#ffe1c4;cursor:pointer;font:700 11.5px system-ui;margin:2px 4px 2px 0;transition:.2s}#pqbsPanel .btn:hover{background:linear-gradient(135deg,#fb923c,#f43f5e);color:#fff}#pqbsPanel a{color:#7dd3fc}#pqbsPanel p{margin:5px 0;line-height:1.55}" +
    "#pqbsPanel .sg{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:9px}#pqbsPanel .st{background:linear-gradient(160deg,#ffffff12,#ffffff05);border:1px solid #ffffff14;border-radius:12px;padding:8px 4px;text-align:center}#pqbsPanel .st b{display:block;font-size:21px;line-height:1.1;color:var(--c,#fff);text-shadow:0 0 14px var(--c,transparent)}#pqbsPanel .st span{font-size:10.5px;color:#8fb0c2}" +
    "#pqbsPanel .stk{display:flex;height:9px;border-radius:6px;overflow:hidden;margin:6px 0 4px;background:#ffffff14}#pqbsPanel .stk i{display:block;height:100%}#pqbsPanel .lg{display:flex;gap:10px;flex-wrap:wrap;font-size:10.5px;color:#9fc3d6;margin:2px 0 8px}#pqbsPanel .lg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;vertical-align:-1px}#pqbsPanel .gz{display:flex;align-items:center;gap:10px}#pqbsPanel .gz svg{width:110px;flex:none}" +
    ".pqbs-b{position:relative;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 35% 30%,#fff8,var(--c) 55%);border:2px solid #fff;box-shadow:0 0 14px var(--c),0 2px 7px #000b;color:#fff;font-weight:800;cursor:pointer;transition:transform .15s}.pqbs-b:hover{transform:scale(1.18)}.pqbs-q b{font-size:.8em;text-shadow:0 1px 2px #000}.pqbs-star{border-radius:30%;border-color:#fde047}.pqbs-vol{border-color:#fed7aa}.pqbs-cl{flex-direction:column;line-height:1;border-width:3px}.pqbs-cl span{font-size:12px}.pqbs-cl b{font-size:12px;text-shadow:0 1px 2px #000}" +
    ".pqbs-pulse::after{content:'';position:absolute;inset:-5px;border-radius:50%;border:2px solid var(--c);animation:pqbsP 1.9s ease-out infinite;pointer-events:none}@keyframes pqbsP{0%{transform:scale(.7);opacity:.95}100%{transform:scale(2);opacity:0}}" +
    ".pqbs-pop .leaflet-popup-content-wrapper{background:linear-gradient(170deg,#0b2233,#120c20);color:#e6f1f7;border-radius:16px;padding:0;overflow:hidden;border:1px solid #ffffff26;box-shadow:0 14px 40px #000c}.pqbs-pop .leaflet-popup-content{margin:0!important;width:auto!important;min-width:250px;font:12.5px/1.45 system-ui}.pqbs-pop .leaflet-popup-tip{background:#0e1626}.pqbs-pop a.leaflet-popup-close-button{color:#fff!important;top:7px;right:8px;font-size:18px;z-index:3}" +
    ".pqbs-pop .ph{display:flex;gap:10px;align-items:center;padding:11px 32px 11px 12px;color:#fff;text-shadow:0 1px 3px #0008}.pqbs-pop .pe{width:42px;height:42px;border-radius:12px;background:#00000040;display:flex;align-items:center;justify-content:center;font-size:21px;flex:none}.pqbs-pop .pe b{font-size:21px}.pqbs-pop .pt b{display:block;font-size:13.5px;line-height:1.25}.pqbs-pop .pt small{opacity:.9;font-size:11px}" +
    ".pqbs-pop .pb{padding:9px 12px 11px}.pqbs-pop .pr{display:flex;gap:7px;padding:3px 0;align-items:baseline}.pqbs-pop .pr span{width:16px;text-align:center}.pqbs-pop .pr i{font-style:normal;color:#8fb0c2;width:68px;flex:none;font-size:11px}.pqbs-pop .pr b{font-weight:600;flex:1;color:#f1f7fb}.pqbs-pop .pr em{font-style:normal;color:#8fb0c2;font-size:11px;margin-left:4px}.pqbs-pop .pn{margin:7px 0 3px;padding:7px 9px;border-radius:9px;background:#ffffff0d;border-left:3px solid #fb923c;color:#cfe3ef;font-size:11.5px}.pqbs-pop .pf{display:flex;justify-content:space-between;margin-top:8px;padding-top:7px;border-top:1px solid #ffffff18;font-size:11px;color:#8fb0c2}.pqbs-pop .pf a{color:#7dd3fc;font-weight:700;text-decoration:none}";
  function build() {
    if (P) return; const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    P = document.createElement("div"); P.id = "pqbsPanel";
    P.innerHTML = '<div class="h"><span>\u{1F30B}</span><b>Bencana Indonesia</b><button class="x" data-a="close">\u2715</button></div><div class="rg"><select id="pqbP"></select><select id="pqbK"></select></div><div class="tb"><button data-t="now">Terkini</button><button data-t="his">Riwayat</button><button data-t="rank">Peringkat</button><button data-t="sat">\u{1F6F0} Satelit</button></div><div class="bd" id="pqbB"></div>';
    document.body.appendChild(P); P.addEventListener("click", onClick); P.addEventListener("input", e => { if (e.target.id === "pqbsOp") { S.sop = e.target.value / 100; Object.values(SOL).concat(SBL ? [SBL] : []).forEach(l => l.setOpacity(S.sop)); } }); $("pqbP").onchange = e => { S.prov = e.target.value; S.kab = ""; regionChanged(); }; $("pqbK").onchange = e => { S.kab = e.target.value; regionChanged(); };
    const sp = $("pqbP"); sp.innerHTML = '<option value="">\u{1F1EE}\u{1F1E9} Seluruh Indonesia</option>' + provs().map(p => '<option>' + esc(p) + "</option>").join("");
  }
  function regionChanged() { fillKab(); draw(); if (S.prov) { fit(); loadHist(); } else fit(); render(); }
  function fillKab() { const k = $("pqbK"); k.style.display = S.prov ? "" : "none"; k.innerHTML = '<option value="">Semua kab/kota</option>' + (S.prov ? kabOf(S.prov).map(n => '<option' + (n === S.kab ? " selected" : "") + ">" + esc(n) + "</option>").join("") : ""); $("pqbP").value = S.prov; }
  function onClick(ev) {
    const t = ev.target.closest("[data-a],[data-t],[data-k],[data-i],[data-d],[data-m],[data-r],[data-hs],[data-sb],[data-sv],[data-sdd],[data-fb]"); if (!t) return;
    if (t.dataset.t) { S.tab = t.dataset.t; if (S.tab === "his" && S.prov) loadHist(); draw(); render(); return; }
    if (t.dataset.fb) { const f = fires().find(x => x.id === t.dataset.fb); if (f) map.fitBounds(FB(f).pad(.7), { maxZoom: 13 }); return; }
    if (t.dataset.hs) { S.hs = t.dataset.hs; loadHot(true); return; }
    if (t.dataset.sb) { S.sb = t.dataset.sb; applySat(); render(); return; }
    if (t.dataset.sv) { S.sov[t.dataset.sv] = !S.sov[t.dataset.sv]; applySat(); render(); return; }
    if (t.dataset.sdd) { const d = new Date(S.sd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + +t.dataset.sdd); if (d.getTime() <= NOW()) { S.sd = d.toISOString().slice(0, 10); applySat(); render(); } return; }
    if (t.dataset.a === "close") { setPanel(false); return; }
    if (t.dataset.k) { toggle(t.dataset.k); return; }
    if (t.dataset.d) { S.days = +t.dataset.d; draw(); render(); return; }
    if (t.dataset.m) { S.mag = +t.dataset.m; draw(); render(); return; }
    if (t.dataset.i != null) { fly(t.dataset.i); return; }
    if (t.dataset.r) { const [p, k] = t.dataset.r.split("|"); S.prov = p; S.kab = k || ""; fillKab(); regionChanged(); S.tab = "his"; render(); return; }
    const a = t.dataset.a;
    if (a === "hm") { histMarkers = !histMarkers; draw(); render(); } else if (a === "copy") { const A = analyze(); if (A) { try { navigator.clipboard.writeText(plainText(A)); say("Ringkasan disalin"); } catch (e) { say("Gagal menyalin", 1); } } }
    else if (a === "hotreload") loadHot(true);
    else if (a === "savekey") { ls("pq_firms_key", ($("pqbsKey").value || "").trim()); ls("pq_bnc_px", ($("pqbsPx").value || "").trim()); loadHot(true); say("Pengaturan disimpan"); }
    else if (a === "reload") { loaded = false; HIST = {}; load(true); if (S.prov) loadHist(); }
    else if (a === "all") { S.prov = ""; S.kab = ""; fillKab(); draw(); fit(); render(); }
  }
  function chips() { return '<div class="ch">' + Object.keys(HZ).map(k => '<span class="c' + (S.t[k] ? " a" : "") + '" data-k="' + k + '" style="--c:' + HZ[k].c + '">' + HZ[k].e + " " + HZ[k].n + "</span>").join("") + '<span class="c' + (S.t.hist ? " a" : "") + '" data-k="hist" style="--c:#facc15">\u2B50 Kejadian besar</span><span class="c' + (S.t.burn ? " a" : "") + '" data-k="burn" style="--c:#f97316">\u{1F525} Area terbakar</span><span class="c' + (S.t.vol ? " a" : "") + '" data-k="vol" style="--c:#fb923c">\u25B2 Gunung api</span></div>'; }
  function bars(arr, color, h) { const mx = Math.max(1, ...arr.map(a => a[1])), w = 100 / arr.length; return '<svg viewBox="0 0 100 ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px;display:block">' + arr.map((a, i) => '<rect x="' + (i * w + .2).toFixed(2) + '" y="' + (h - a[1] / mx * (h - 2)).toFixed(1) + '" width="' + (w - .4).toFixed(2) + '" height="' + (a[1] / mx * (h - 2)).toFixed(1) + '" fill="' + color + '"><title>' + a[0] + ": " + a[1] + "</title></rect>").join("") + "</svg>"; }
  function tabNow() {
    const L2 = LST, n = L2.length, eqN = L2.filter(e => e.type === "gempa").length, mx = L2.filter(e => e.type === "gempa").reduce((m, e) => Math.max(m, e.m), 0);
    let h = chips() + '<div class="ch">' + [7, 30, 90, 365].map(d => '<span class="c' + (S.days === d ? " a" : "") + '" data-d="' + d + '" style="--c:#22d3ee">' + (d === 365 ? "1 th" : d + " hr") + "</span>").join("") + [4.5, 5, 6].map(m => '<span class="c' + (S.mag === m ? " a" : "") + '" data-m="' + m + '" style="--c:#f43f5e">M\u2265' + m + "</span>").join("") + "</div>";
    if (S.loading) h += '<p class="mut">\u23F3 Memuat data USGS / BMKG / NASA\u2026</p>';
    const by = {}; L2.forEach(e => by[e.type] = (by[e.type] || 0) + 1);
    h += '<div class="sg"><div class="st" style="--c:#fb923c"><b>' + nf(n) + '</b><span>kejadian</span></div><div class="st" style="--c:#facc15"><b>' + nf(eqN) + '</b><span>gempa</span></div><div class="st" style="--c:#f43f5e"><b>' + (mx ? "M" + mx.toFixed(1) : "-") + '</b><span>terkuat</span></div></div>';
    if (n) h += '<div class="stk">' + Object.keys(by).map(t => '<i title="' + HZ[t].n + ": " + by[t] + '" style="width:' + by[t] / n * 100 + "%;background:" + HZ[t].c + '"></i>').join("") + '</div><div class="mut" style="margin-bottom:4px">' + (S.days === 365 ? "1 tahun" : S.days + " hari") + " terakhir \u00B7 " + esc(S.kab || S.prov || "Seluruh Indonesia") + '</div>';
    h += '<div class="lg"><span><i style="background:#facc15"></i>M&lt;5</span><span><i style="background:#fb923c"></i>M5\u20136</span><span><i style="background:#f43f5e"></i>M\u22656</span><span>\u25CC berdenyut = baru/berlangsung</span><span><i style="background:#ef4444"></i>titik panas (FRP)</span></div>';
    if (!anyOn()) h += '<p class="mut">Aktifkan minimal satu jenis bencana di atas untuk menampilkannya di peta.</p>';
    const HS = L2.filter(e => e.type === "hotspot");
    if (S.t.burn) { const F = fires().sort((a, b) => b.ha - a.ha), tot = F.reduce((q, f) => q + f.ha, 0); h += '<h4>\u{1F525} Area terbakar (polygon)</h4><div class="sg"><div class="st" style="--c:#fb923c"><b>' + nf(F.length) + '</b><span>area</span></div><div class="st" style="--c:#ef4444"><b>' + nf(tot) + '</b><span>hektare</span></div><div class="st" style="--c:#facc15"><b>' + (F[0] ? nf(F[0].ha) : "-") + '</b><span>terluas (ha)</span></div></div>' + F.slice(0, 6).map(f => '<div class="it" data-fb="' + esc(f.id) + '" style="--c:#ef4444"><span class="e">\u{1F525}</span><span><b>' + nf(f.ha) + " ha \u00B7 " + esc(f.reg || f.title) + "</b><small>" + esc((f.prov || "") + " \u00B7 " + ago(f.t) + " \u00B7 " + f.src) + "</small></span></div>").join("") + '<p class="mut">' + (F.length ? "Zoom \u2265 7 untuk melihat polygon animasi (bentuk = perkiraan dari titik panas satelit)." : (S.loading ? "\u23F3 Memuat\u2026" : "Belum ada area terdeteksi pada periode ini.")) + "</p>"; }
    if (S.t.hotspot) { const g = {}, lv = S.prov ? "reg" : "prov"; HS.forEach(e => { const k = e[lv]; if (!k) return; const o = g[k] = g[k] || { n: 0, f: 0 }; o.n++; o.f += e.frp || 0; }); const rows = Object.keys(g).sort((a, b) => g[b].n - g[a].n).slice(0, 8), mx = rows.length ? g[rows[0]].n : 1;
      h += '<h4>\u{1F6F0} Titik panas satelit (' + ({ "24h": "24 jam", "48h": "48 jam", "7d": "7 hari" })[S.hs] + ') \u00B7 ' + nf(HS.length) + '</h4>' + (rows.length ? rows.map(k => '<div class="it" data-r="' + esc(S.prov ? S.prov + "|" + k : k + "|") + '" style="--c:#ef4444"><span style="flex:1"><div class="rw"><b>' + esc(k) + '</b><span>' + g[k].n + ' titik \u00B7 ' + nf(g[k].f) + ' MW</span></div><div class="bar"><i style="width:' + g[k].n / mx * 100 + '%;background:linear-gradient(90deg,#fbbf24,#ef4444)"></i></div></span></div>').join("") : '<p class="mut">' + (S.loading ? "\u23F3 Memuat FIRMS\u2026" : "Belum ada titik panas terbaca \u2014 lihat tab Satelit (status sumber / MAP_KEY).") + '</p>'); }
    h += L2.filter(e => e.type !== "hotspot").slice(0, 80).map(e => '<div class="it" data-i="' + esc(e.id) + '" style="--c:' + (e.type === "gempa" ? (e.m >= 6 ? "#f43f5e" : e.m >= 5 ? "#fb923c" : "#facc15") : HZ[e.type].c) + '"><span class="e" style="color:' + HZ[e.type].c + '">' + (e.type === "gempa" ? e.m.toFixed(1) : HZ[e.type].e) + '</span><span><b>' + esc(e.type === "gempa" ? (e.place || e.reg || e.title) : e.title) + "</b><small>" + esc((e.reg ? e.reg + ", " : "") + (e.prov || "") + " \u00B7 " + ago(e.t2 || e.t) + (e.d ? " \u00B7 " + Math.round(e.d) + " km" : "") + " \u00B7 " + e.src) + "</small></span></div>").join("");
    if (n - HS.length > 80) h += '<p class="mut">+' + (n - HS.length - 80) + " lainnya di peta\u2026</p>"; if (!n && !S.loading) h += '<p class="mut">Tidak ada kejadian sesuai filter.</p>';
    return h + '<p><button class="btn" data-a="reload">\u21BB Muat ulang</button></p>';
  }
  function tabHis() {
    if (!S.prov) {
      const top = CUR.slice().sort((a, b) => (b.deaths || 0) - (a.deaths || 0)).slice(0, 12);
      return '<div class="bx"><b>Pilih provinsi atau kabupaten/kota</b> di atas untuk melihat <b>riwayat lengkap</b>, skor risiko, peluang gempa 10 tahun, gunung api terdekat & ringkasan cerdas.</div><h4>Kejadian paling mematikan di Indonesia</h4>' +
        top.map(e => '<div class="it" data-i="' + e.id + '"><span class="e">' + (e.tsu ? "\u{1F30A}" : HZ[e.type].e) + '</span><span><b>' + esc(e.title) + "</b><small>" + new Date(e.t).getUTCFullYear() + " \u00B7 " + (e.deaths ? "\u2248" + nf(e.deaths) + " jiwa \u00B7 " : "") + esc(e.prov || "") + "</small></span></div>").join("") +
        '<p class="mut">Basis data kurasi (BNPB/PVMBG/BMKG/USGS); angka korban perkiraan.</p>';
    }
    const A = analyze(); if (!A) return '<p class="mut">\u23F3 Memuat riwayat ' + esc(S.kab || S.prov) + " (katalog gempa USGS sejak 1900, NASA EONET)\u2026</p>";
    const gc = LVL(A.overall)[1], gv = A.overall;
    let h = '<div class="bx"><div class="gz"><svg viewBox="0 0 120 74"><path d="M10 62 A50 50 0 0 1 110 62" stroke="#ffffff1c" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M10 62 A50 50 0 0 1 110 62" stroke="' + gc + '" stroke-width="11" fill="none" stroke-linecap="round" pathLength="100" stroke-dasharray="' + gv + ' 100" style="filter:drop-shadow(0 0 6px ' + gc + ')"/><text x="60" y="56" text-anchor="middle" font-size="26" font-weight="800" fill="#fff">' + gv + '</text></svg><div><b style="font-size:15px">' + esc(A.R.name) + '</b><div style="color:' + gc + ';font-weight:800;font-size:13px">' + LVL(gv)[0] + ' \u00B7 skor risiko</div><div class="mut">' + esc(S.kab ? S.prov : "Provinsi") + "</div></div></div>" + narrative(A).map(x => "<p>" + x + "</p>").join("") + "</div>";
    h += "<h4>Skor risiko per jenis bahaya</h4>" + A.ks.map(k => '<div class="rw"><span>' + NM[k] + '</span><span style="color:' + LVL(A.sc[k])[1] + '">' + LVL(A.sc[k])[0] + " " + A.sc[k] + '</span></div><div class="bar"><i style="width:' + A.sc[k] + "%;background:" + LVL(A.sc[k])[1] + '"></i></div>').join("");
    if (A.H.ok) {
      const cy = new Date().getUTCFullYear(), yr = []; for (let y = Math.max(A.Y0, cy - 39); y <= cy; y++) yr.push([y, A.eq.filter(e => e.m >= 5 && new Date(e.t).getUTCFullYear() === y).length]);
      h += "<h4>Gempa M\u22655 per tahun (" + yr[0][0] + "\u2013" + cy + ")</h4>" + bars(yr, "#fb923c", 46) + '<div class="mut">M\u22655: ' + A.n[5] + " \u00B7 M\u22656: " + A.n[6] + " \u00B7 M\u22657: " + A.n[7] + " sejak " + A.Y0 + "</div>";
      h += '<h4>Gempa terkuat sejak 1900 (katalog USGS)</h4>' + A.H.eq.slice().sort((a, b) => b.m - a.m).slice(0, 6).map(e => '<div class="it" data-i="' + e.id + '"><span class="e">\u{1F30D}</span><span><b>M' + e.m.toFixed(1) + " \u00B7 " + fD(e.t) + "</b><small>" + esc(e.place) + " \u00B7 " + Math.round(e.d) + " km</small></span></div>").join("");
      h += '<p><button class="btn" data-a="hm">' + (histMarkers ? "Sembunyikan" : "Tampilkan") + " riwayat gempa M\u22655 di peta (" + A.H.eq.filter(e => e.m >= 5).length + ")</button></p>";
    }
    if (A.curR.length) h += "<h4>Kejadian besar bersejarah</h4>" + A.curR.slice().sort((a, b) => b.t - a.t).map(e => '<div class="it" data-i="' + e.id + '"><span class="e">' + (e.tsu ? "\u{1F30A}" : HZ[e.type].e) + '</span><span><b>' + new Date(e.t).getUTCFullYear() + " \u00B7 " + esc(e.title) + "</b><small>" + (e.deaths ? "\u2248" + nf(e.deaths) + " jiwa \u00B7 " : "") + esc(e.note) + "</small></span></div>").join("");
    if (A.allEv.length) h += "<h4>Banjir/longsor/gunung api/karhutla/badai tercatat (NASA EONET)</h4>" + A.allEv.slice(0, 15).map(e => '<div class="it" data-i="' + e.id + '"><span class="e">' + HZ[e.type].e + '</span><span><b>' + esc(e.title) + "</b><small>" + fD(e.t) + "</small></span></div>").join("");
    if (A.vn.length) h += "<h4>Gunung api terdekat</h4>" + A.vn.slice(0, 5).map(x => '<div class="it" data-i="' + x.v.id + '"><span class="e">\u{1F30B}</span><span><b>' + esc(x.v.title) + "</b><small>" + (x.inside ? "Di wilayah ini" : Math.round(x.d) + " km") + " \u00B7 " + nf(x.v.elev) + " mdpl \u00B7 " + esc(x.v.note) + "</small></span></div>").join("");
    const tp = A.ks.filter(k => A.sc[k] >= 20).slice(0, 3).map(k => "<p><b>" + NM[k] + ":</b> " + TIPS[k.replace("tsunami", "tsunami")] + "</p>").join("");
    h += "<h4>Kesiapsiagaan</h4>" + (tp || "<p>Tetap siapkan tas siaga bencana & kenali jalur evakuasi.</p>");
    h += '<p><button class="btn" data-a="copy">\u{1F4CB} Salin ringkasan</button><a class="btn" style="text-decoration:none;display:inline-block" href="https://inarisk.bnpb.go.id/" target="_blank" rel="noopener">InaRISK BNPB</a><a class="btn" style="text-decoration:none;display:inline-block" href="https://dibi.bnpb.go.id/" target="_blank" rel="noopener">DIBI</a></p><p class="mut">Skor & peluang = statistik historis indikatif, bukan prakiraan resmi. Peringatan resmi: BMKG &amp; PVMBG (MAGMA). Cakupan USGS M\u22654 (kab/kota) / M\u22654,5 (provinsi).</p>';
    return h;
  }
  function tabRank() {
    const g = {}; const lvl = S.prov ? "kab" : "prov";
    const lim = NOW() - S.days * 864e5, pool = LIVE.filter(e => e.t >= lim && e.m >= S.mag).concat(EON_ALL.filter(e => (e.t2 || e.t) >= lim));
    pool.filter(e => !S.prov || e.prov === S.prov).forEach(e => { const k = lvl === "prov" ? e.prov : e.reg; if (!k) return; const o = g[k] = g[k] || { n: 0, mx: 0, by: {} }; o.n++; o.by[e.type] = (o.by[e.type] || 0) + 1; if (e.m) o.mx = Math.max(o.mx, e.m); });
    const rows = Object.keys(g).map(k => [k, g[k]]).sort((a, b) => b[1].n - a[1].n).slice(0, 40), mx = rows.length ? rows[0][1].n : 1;
    return '<div class="ch">' + [7, 30, 90, 365].map(d => '<span class="c' + (S.days === d ? " a" : "") + '" data-d="' + d + '" style="--c:#22d3ee">' + (d === 365 ? "1 th" : d + " hr") + "</span>").join("") + '</div><p class="mut">Wilayah paling aktif (gempa M\u2265' + S.mag + " + kejadian EONET) " + (S.prov ? "di " + esc(S.prov) + " per kab/kota" : "per provinsi") + ". Klik untuk riwayat lengkap.</p>" +
      rows.map(r => '<div class="it" data-r="' + esc(lvl === "prov" ? r[0] + "|" : S.prov + "|" + r[0]) + '"><span style="flex:1"><div class="rw"><b>' + esc(r[0]) + "</b><span>" + r[1].n + " kejadian" + (r[1].mx ? " \u00B7 M" + r[1].mx.toFixed(1) : "") + '</span></div><div class="bar"><i style="width:' + (r[1].n / mx * 100) + '%;background:#fb923c"></i></div><small>' + Object.keys(r[1].by).map(t => HZ[t].e + r[1].by[t]).join("  ") + "</small></span></div>").join("") + (rows.length ? "" : '<p class="mut">Belum ada data' + (S.loading ? " (memuat\u2026)" : "") + ".</p>") + (S.prov ? '<p><button class="btn" data-a="all">\u2190 Semua provinsi</button></p>' : "");
  }
  function tabSat() {
    const ok = k => S.src[k] ? (S.src[k].ok ? '<span style="color:#34d399">\u2713 ' + (S.src[k].n ? nf(S.src[k].n) : "OK") + "</span>" : '<span style="color:#f87171">\u2717 ' + esc(S.src[k].err || "") + "</span>") : '<span class="mut">\u2026</span>';
    let h = "<h4>Status sumber data</h4><div class=\"bx\">" + ["USGS (gempa)", "BMKG (gempa)", "NASA EONET", "GDACS (PBB/UE)"].concat(FIRMS.map(f => f[0]), ["Titik panas (gabungan)"]).map(k => '<div class="rw"><span>' + k + "</span>" + ok(k) + "</div>").join("") + "</div>";
    h += "<h4>Periode titik panas</h4><div class=\"ch\">" + [["24h", "24 jam"], ["48h", "48 jam"], ["7d", "7 hari"]].map(x => '<span class="c' + (S.hs === x[0] ? " a" : "") + '" data-hs="' + x[0] + '" style="--c:#ef4444">' + x[1] + "</span>").join("") + '<span class="c" data-a="hotreload" style="--c:#22d3ee">\u21BB Muat ulang</span></div>';
    h += "<h4>Citra satelit (NASA GIBS)</h4><div class=\"ch\">" + SATB.map(b => '<span class="c' + (S.sb === b[0] ? " a" : "") + '" data-sb="' + b[0] + '" style="--c:#38bdf8">' + b[1] + "</span>").join("") + "</div><div class=\"ch\">" + SATO.map(o => '<span class="c' + (S.sov[o[0]] ? " a" : "") + '" data-sv="' + o[0] + '" style="--c:#f97316">' + o[1] + "</span>").join("") + "</div>";
    h += '<div class="rw" style="margin:4px 0"><button class="btn" data-sdd="-1">\u25C0</button><b>' + S.sd + '</b><button class="btn" data-sdd="1">\u25B6</button></div><div class="rw"><span class="mut">Transparansi</span><input type="range" id="pqbsOp" min="20" max="100" value="' + Math.round(S.sop * 100) + '" style="flex:1"></div><p class="mut">Citra harian terbaru biasanya baru tersedia beberapa jam setelah lewat satelit; bila kosong, mundurkan 1 hari.</p>';
    h += '<h4>Akses data (opsional)</h4><input id="pqbsKey" placeholder="NASA FIRMS MAP_KEY (gratis)" value="' + esc(ls("pq_firms_key")) + '" style="width:100%;box-sizing:border-box;background:#0b2a3b;color:#e6f1f7;border:1px solid #ffffff2a;border-radius:8px;padding:7px;margin-bottom:5px"><input id="pqbsPx" placeholder="URL proxy CORS (opsional)" value="' + esc(ls("pq_bnc_px")) + '" style="width:100%;box-sizing:border-box;background:#0b2a3b;color:#e6f1f7;border:1px solid #ffffff2a;border-radius:8px;padding:7px"><p><button class="btn" data-a="savekey">Simpan & muat ulang</button><a class="btn" style="text-decoration:none;display:inline-block" href="https://firms.modaps.eosdis.nasa.gov/api/map_key/" target="_blank" rel="noopener">Minta MAP_KEY</a></p><p class="mut">Titik panas dari NASA FIRMS: VIIRS S-NPP/NOAA-20/NOAA-21 (375 m) + MODIS (1 km), digabung & dihapus duplikatnya. Bila browser memblokir (CORS), isi MAP_KEY atau pasang proxy (lihat firms-proxy-worker.js).</p>';
    return h;
  }
  function render() {
    if (!P) return; P.classList.toggle("on", S.panel); if (!S.panel) return;
    P.querySelectorAll(".tb button").forEach(b => b.classList.toggle("a", b.dataset.t === S.tab));
    const b = $("pqbB"), sc = b.scrollTop, tab = S.tab === "his" ? tabHis : S.tab === "rank" ? tabRank : S.tab === "sat" ? tabSat : tabNow; b.innerHTML = tab(); b.scrollTop = sc;
  }

  /* ---------- kontrol ---------- */
  function setPanel(v) { build(); S.panel = v; if (v) { try { if (window.PETAQU_GEMPA) PETAQU_GEMPA.close(); } catch (e) { } if (!anyOn()) { Object.keys(HZ).forEach(k => S.t[k] = true); S.t.hist = true; S.t.vol = true; S.t.burn = true; } fillKab(); load(); draw(); } render(); }
  function toggle(k) { if (!S.t[k] && !loaded) load(); S.t[k] = !S.t[k]; if (S.t.hotspot || S.t.burn) loadHot(); draw(); render(); }
  function init() { if (started) return true; if (typeof map === "undefined" || !map || !map.getPane || !document.body || typeof L === "undefined") return false; started = true; build(); fillKab(); let zt, lz = -1; map.on("moveend", () => { clearTimeout(zt); zt = setTimeout(() => { if (!anyOn()) return; const z = map.getZoom(); if (z !== lz || (z >= 8 && LST.length > 400)) { lz = z; draw(); } }, 220); }); return true; }
  window.PETAQU_BENCANA_SEMUA = { open: () => setPanel(true), close: () => setPanel(false), toggle: k => { build(); toggle(k); }, select: (p, k) => { build(); S.prov = p || ""; S.kab = k || ""; fillKab(); regionChanged(); }, _t: { clusterFires, fires, firePopup, blobKm, eonFire, loadHot, tabSat, HOT: () => HOT, SRC: () => S.src, popup, mk, tabNow, tabHis, tabRank, analyze, locate, CUR, VOL, HZ, S } };
  window.PQ_FOLDER_EXTRA = window.PQ_FOLDER_EXTRA || [];
  window.PQ_FOLDER_EXTRA.push({
    title: "Bencana Indonesia",
    rows: () => [{ id: "panel", name: "Panel bencana, riwayat & risiko", ic: "\u{1F9E0}", c: "#fb923c", on: S.panel }].concat(Object.keys(HZ).map(k => ({ id: k, name: HZ[k].n, ic: HZ[k].e, c: HZ[k].c, on: !!S.t[k] }))).concat([{ id: "hist", name: "Kejadian besar bersejarah", ic: "\u2B50", c: "#facc15", on: !!S.t.hist }, { id: "burn", name: "Area kebakaran (polygon animasi)", ic: "\u{1F525}", c: "#f97316", on: !!S.t.burn }, { id: "vol", name: "Titik gunung api aktif", ic: "\u25B2", c: "#fb923c", on: !!S.t.vol }]),
    act: id => { const go = () => { build(); if (id === "panel") setPanel(!S.panel); else { toggle(id); } }; if (init()) go(); else say("Peta belum siap"); }
  });
  let tries = 0; const iv = setInterval(() => { if (init() || ++tries > 120) clearInterval(iv); }, 500);
})();
