/* PETAQU Rawan — peta kerawanan SELURUH provinsi & kabupaten/kota Indonesia (±507 wilayah dari data-kabbatas.js):
   1) Rawan Bencana (banjir, longsor, gempa, tsunami, gunung api, kekeringan, karhutla, angin kencang) + skor gabungan
   2) Rawan Macet        (profil: hari kerja / akhir pekan-libur / mudik-nataru)
   3) Rawan Kecelakaan   (lakalantas; profil sama)
   4) Rawan Gempa        (jarak ke zona subduksi & sesar aktif, + potensi tsunami & gunung api di popup)
   Muncul di menu folder tepat setelah "Cuaca Indonesia". Tidak mengubah modul lain, tanpa panggilan jaringan.
   CATATAN: skor = INDEKS INDIKATIF hasil kompilasi pengetahuan umum (pola BNPB/IRBI, PVMBG, BMKG, Korlantas, TomTom)
   + perhitungan geometri (jarak ke sesar/palung/gunung api, deteksi pesisir). BUKAN data resmi / peringatan dini. */
(function () {
  "use strict";
  if (window.PETAQU_RAWAN) return;
  const $ = id => document.getElementById(id);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const say = m => { try { toast(m, 3200); } catch (e) { console.log("[rawan]", m); } };
  const getMap = () => { try { if (typeof map !== "undefined" && map && map.addLayer) return map; } catch (e) { } return window.map && window.map.addLayer ? window.map : null; };
  const LSP = "petaqu_rawan_pref";
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };

  /* ============================ DATA PENGETAHUAN ============================ */
  /* basis provinsi 1–5: [banjir, longsor, gempa, tsunami, gunung api, kekeringan, karhutla, angin] */
  const PB = {
    "Aceh": [4, 4, 5, 5, 3, 2, 3, 2], "Bali": [3, 3, 4, 4, 5, 3, 1, 2], "Banten": [4, 3, 5, 5, 3, 2, 1, 3], "Bengkulu": [4, 4, 5, 5, 2, 1, 2, 2],
    "DI Yogyakarta": [3, 4, 5, 5, 5, 3, 1, 2], "DKI Jakarta": [5, 1, 3, 3, 1, 1, 1, 3], "Gorontalo": [4, 3, 5, 4, 2, 2, 1, 1], "Jambi": [4, 2, 4, 2, 3, 2, 5, 2],
    "Jawa Barat": [5, 5, 5, 4, 5, 3, 1, 4], "Jawa Tengah": [5, 5, 4, 4, 5, 3, 1, 4], "Jawa Timur": [5, 4, 4, 4, 5, 4, 2, 4], "Kalimantan Barat": [4, 2, 1, 1, 1, 2, 5, 2],
    "Kalimantan Selatan": [5, 2, 1, 1, 1, 2, 5, 2], "Kalimantan Tengah": [4, 1, 1, 1, 1, 2, 5, 1], "Kalimantan Timur": [4, 3, 1, 1, 1, 2, 4, 2], "Kalimantan Utara": [4, 2, 1, 1, 1, 1, 3, 1],
    "Kepulauan Bangka Belitung": [3, 1, 1, 1, 1, 2, 3, 2], "Kepulauan Riau": [3, 1, 2, 1, 1, 1, 2, 3], "Lampung": [4, 3, 5, 5, 4, 3, 3, 3], "Maluku": [3, 4, 5, 5, 4, 2, 1, 2],
    "Maluku Utara": [3, 4, 5, 5, 5, 1, 1, 2], "Nusa Tenggara Barat": [4, 3, 5, 4, 5, 5, 2, 3], "Nusa Tenggara Timur": [3, 3, 5, 5, 4, 5, 2, 3], "Papua": [4, 4, 5, 5, 2, 1, 1, 2],
    "Papua Barat": [4, 3, 5, 5, 1, 1, 1, 2], "Papua Barat Daya": [4, 3, 5, 5, 1, 1, 1, 2], "Papua Pegunungan": [3, 5, 5, 2, 1, 1, 1, 1], "Papua Selatan": [5, 1, 3, 3, 1, 1, 2, 1],
    "Papua Tengah": [4, 5, 5, 3, 1, 1, 1, 1], "Riau": [4, 1, 3, 2, 1, 2, 5, 2], "Sulawesi Barat": [4, 4, 5, 5, 1, 2, 1, 2], "Sulawesi Selatan": [5, 4, 4, 4, 3, 3, 1, 3],
    "Sulawesi Tengah": [4, 4, 5, 5, 2, 2, 1, 2], "Sulawesi Tenggara": [4, 3, 4, 4, 1, 2, 1, 2], "Sulawesi Utara": [4, 4, 5, 5, 5, 1, 1, 2], "Sumatera Barat": [4, 5, 5, 5, 5, 2, 2, 2],
    "Sumatera Selatan": [5, 2, 3, 2, 3, 2, 5, 2], "Sumatera Utara": [5, 5, 5, 5, 5, 2, 2, 3]
  };
  /* angka kecelakaan lalu lintas relatif per provinsi (0–100, pola data Korlantas/Jasa Raharja) */
  const PLK = {
    "Jawa Timur": 92, "Jawa Tengah": 90, "Jawa Barat": 86, "Sumatera Utara": 82, "Lampung": 76, "Sulawesi Selatan": 74, "Banten": 72, "DKI Jakarta": 70, "DI Yogyakarta": 70,
    "Sumatera Selatan": 70, "Riau": 68, "Bali": 68, "Sumatera Barat": 66, "Nusa Tenggara Barat": 62, "Kalimantan Selatan": 58, "Jambi": 58, "Aceh": 56, "Sulawesi Utara": 56,
    "Kalimantan Timur": 60, "Kalimantan Barat": 54, "Sulawesi Tenggara": 54, "Sulawesi Tengah": 54, "Kalimantan Tengah": 52, "Bengkulu": 52, "Nusa Tenggara Timur": 52, "Kepulauan Riau": 50,
    "Sulawesi Barat": 48, "Kepulauan Bangka Belitung": 44, "Gorontalo": 44, "Maluku": 38, "Kalimantan Utara": 38, "Maluku Utara": 36, "Papua": 34, "Papua Barat": 34, "Papua Barat Daya": 32,
    "Papua Selatan": 28, "Papua Tengah": 28, "Papua Pegunungan": 26
  };
  const URB_PROV = { "DKI Jakarta": 40, "Jawa Barat": 28, "Jawa Tengah": 28, "Jawa Timur": 28, "Banten": 30, "DI Yogyakarta": 30, "Bali": 28, "Sumatera Utara": 22, "Sumatera Barat": 20, "Sumatera Selatan": 22, "Lampung": 22, "Sulawesi Selatan": 22, "Riau": 20, "Kepulauan Riau": 22 };
  const INT_PROV = { "Jawa Barat": 32, "Jawa Tengah": 32, "Jawa Timur": 32, "Banten": 34, "DI Yogyakarta": 30, "Lampung": 36, "Bali": 34, "Sumatera Utara": 28, "Sumatera Selatan": 28, "Sumatera Barat": 26, "Riau": 28, "Jambi": 26, "Sulawesi Selatan": 24, "Nusa Tenggara Barat": 24 };
  /* kunci: "k:nama" (kota) / "b:nama" (kabupaten) / "nama" (keduanya); nama huruf kecil tanpa awalan */
  const URB = {
    "jakarta pusat": 98, "jakarta selatan": 96, "jakarta barat": 95, "jakarta timur": 95, "jakarta utara": 92, "k:surabaya": 94, "k:bandung": 93, "k:medan": 92, "k:bekasi": 92, "k:depok": 90, "k:tangerang": 90,
    "k:tangerang selatan": 86, "k:makassar": 88, "k:semarang": 86, "k:bogor": 86, "k:denpasar": 85, "k:palembang": 82, "k:yogyakarta": 84, "k:malang": 82, "k:batam": 78, "k:pekanbaru": 78, "k:balikpapan": 74,
    "k:samarinda": 76, "k:banjarmasin": 76, "k:pontianak": 74, "k:bandar lampung": 80, "k:padang": 72, "k:manado": 74, "k:surakarta": 76, "k:cimahi": 82, "k:cirebon": 72, "k:tegal": 62, "k:pekalongan": 60,
    "b:sidoarjo": 80, "b:gresik": 66, "b:bekasi": 84, "b:tangerang": 82, "b:bogor": 78, "b:bandung": 78, "b:bandung barat": 66, "b:sleman": 72, "b:badung": 80, "b:deli serdang": 70, "b:gowa": 62,
    "b:sumedang": 40, "b:karawang": 56, "b:purwakarta": 44, "b:serang": 48, "k:serang": 55, "k:cilegon": 56, "b:semarang": 52, "b:malang": 52, "k:batu": 50, "b:bantul": 52, "b:kudus": 50, "k:mataram": 60,
    "k:jambi": 62, "k:palu": 50, "k:kendari": 56, "k:ambon": 54, "k:jayapura": 56, "k:banda aceh": 56, "k:bengkulu": 50, "k:pangkal pinang": 46, "k:kediri": 52, "k:madiun": 48, "k:mojokerto": 48, "k:pasuruan": 48,
    "k:probolinggo": 46, "k:sukabumi": 50, "k:tasikmalaya": 52, "k:banjar": 44, "k:magelang": 50, "k:salatiga": 48, "k:binjai": 58, "k:pematang siantar": 52, "k:tanjung pinang": 44, "k:dumai": 44, "k:lubuklinggau": 40,
    "k:kupang": 52, "k:gorontalo": 50, "k:bitung": 44, "k:tarakan": 46, "k:banjarbaru": 50, "k:palangka raya": 44, "k:bontang": 40, "k:parepare": 40, "k:bukittinggi": 46, "k:blitar": 40, "k:batu": 50
  };
  const INTR = {
    "brebes": 85, "b:tegal": 70, "k:tegal": 60, "pemalang": 66, "b:pekalongan": 62, "k:pekalongan": 62, "batang": 70, "kendal": 66, "demak": 74, "kudus": 62, "pati": 62, "rembang": 50, "jepara": 48, "karawang": 82,
    "subang": 78, "indramayu": 74, "b:cirebon": 72, "k:cirebon": 66, "majalengka": 60, "kuningan": 48, "b:bekasi": 85, "k:bekasi": 80, "purwakarta": 66, "bandung barat": 62, "sumedang": 62, "b:bandung": 78, "garut": 52,
    "b:tasikmalaya": 52, "k:tasikmalaya": 56, "ciamis": 52, "k:banjar": 52, "cilacap": 60, "banyumas": 60, "purbalingga": 42, "banjarnegara": 40, "kebumen": 56, "purworejo": 50, "b:magelang": 52, "klaten": 62,
    "boyolali": 60, "sukoharjo": 55, "karanganyar": 50, "sragen": 60, "ngawi": 56, "b:madiun": 52, "nganjuk": 56, "jombang": 60, "b:mojokerto": 66, "b:sidoarjo": 78, "b:pasuruan": 72, "b:probolinggo": 66,
    "lumajang": 40, "jember": 50, "banyuwangi": 52, "situbondo": 54, "lamongan": 62, "tuban": 60, "bojonegoro": 50, "gresik": 66, "b:serang": 78, "k:cilegon": 82, "b:tangerang": 76, "b:bogor": 70, "b:sukabumi": 52,
    "cianjur": 62, "lampung selatan": 84, "lampung tengah": 56, "lampung timur": 62, "lampung utara": 50, "tulang bawang": 50, "k:bandar lampung": 72, "ogan komering ilir": 56, "ogan ilir": 54, "muara enim": 50, "banyuasin": 52,
    "b:semarang": 56, "k:semarang": 62, "b:deli serdang": 66, "serdang bedagai": 52, "asahan": 48, "labuhanbatu": 46, "b:kampar": 48, "pelalawan": 44, "bengkalis": 40, "b:gowa": 52, "maros": 50, "pangkajene dan kepulauan": 44,
    "jembrana": 70, "tabanan": 52, "badung": 56, "karangasem": 40, "lombok barat": 46, "lombok tengah": 46, "lombok timur": 44, "kutai kartanegara": 38, "penajam paser utara": 40, "pasuruan": 72
  };
  const WIS = {
    "badung": 90, "gianyar": 80, "k:denpasar": 70, "tabanan": 62, "karangasem": 56, "klungkung": 50, "buleleng": 46, "bangli": 44, "cianjur": 80, "b:bogor": 82, "bandung barat": 76, "b:bandung": 66, "b:sukabumi": 62, "garut": 56,
    "pangandaran": 66, "sleman": 76, "bantul": 72, "gunungkidul": 66, "k:yogyakarta": 76, "kulon progo": 40, "b:magelang": 62, "k:magelang": 50, "wonosobo": 62, "banjarnegara": 46, "b:semarang": 54, "karanganyar": 56, "k:batu": 86,
    "b:malang": 66, "k:malang": 56, "banyuwangi": 66, "lombok barat": 66, "lombok tengah": 66, "lombok utara": 56, "manggarai barat": 70, "toba": 50, "samosir": 52, "karo": 60, "agam": 56, "k:padang": 54, "tanah datar": 52, "lima puluh kota": 50,
    "tana toraja": 46, "toraja utara": 52, "raja ampat": 40, "k:batam": 50, "bintan": 58, "pandeglang": 60, "b:serang": 52, "lebak": 44, "cilacap": 40, "purbalingga": 42, "banyumas": 48, "pacitan": 48, "b:tangerang": 40, "boyolali": 46,
    "k:bandung": 62, "k:bogor": 60, "k:surakarta": 52, "k:bukittinggi": 60, "pesawaran": 40, "lampung selatan": 42, "k:tangerang": 30, "jepara": 44, "kuningan": 46, "majalengka": 44, "pasuruan": 50, "b:pasuruan": 50, "k:manado": 40, "minahasa utara": 42
  };
  /* titik rawan kelok/tanjakan/lintasan (kecelakaan) per kab — pola umum, indikatif */
  const BLK = {
    "subang": 80, "garut": 70, "b:bandung": 76, "sumedang": 70, "purwakarta": 80, "cianjur": 78, "b:bogor": 76, "brebes": 78, "banjarnegara": 70, "banyumas": 66, "wonosobo": 64, "b:semarang": 66, "boyolali": 62,
    "klaten": 60, "b:magelang": 60, "kendal": 68, "batang": 72, "demak": 66, "pati": 60, "kudus": 58, "lamongan": 62, "tuban": 66, "nganjuk": 62, "b:probolinggo": 66, "b:pasuruan": 72, "b:malang": 68, "jombang": 60,
    "b:mojokerto": 64, "lumajang": 56, "jember": 58, "banyuwangi": 62, "lima puluh kota": 78, "k:padang": 74, "solok": 62, "tanah datar": 62, "agam": 62, "karo": 66, "simalungun": 66, "tapanuli utara": 62, "b:deli serdang": 72,
    "langkat": 62, "lampung selatan": 66, "lampung tengah": 62, "purbalingga": 58, "cilacap": 60, "kebumen": 58, "majalengka": 60, "indramayu": 62, "karawang": 66, "b:bekasi": 66, "tasikmalaya": 60, "ciamis": 58, "sukabumi": 60,
    "toraja utara": 62, "tana toraja": 62, "enrekang": 64, "gowa": 60, "bone": 56, "maros": 56, "tabanan": 58, "karangasem": 58, "bangli": 56, "lombok barat": 52, "ogan komering ilir": 58, "muara enim": 58, "tangerang": 56
  };
  /* gunung api aktif/penting [nama, lat, lon, bobot] */
  const VOL = [["Seulawah Agam", 5.45, 95.66, .6], ["Peut Sague", 4.91, 96.33, .55], ["Bur Ni Telong", 4.77, 96.82, .75], ["Sinabung", 3.17, 98.39, 1], ["Sibayak", 3.23, 98.51, .6], ["Sorik Marapi", .69, 99.54, .8],
    ["Marapi", -.38, 100.47, 1], ["Talang", -.98, 100.68, .8], ["Kerinci", -1.7, 101.26, 1], ["Kaba", -3.52, 102.62, .6], ["Dempo", -4.03, 103.13, .75], ["Anak Krakatau", -6.1, 105.42, 1], ["Salak", -6.72, 106.73, .6], ["Gede-Pangrango", -6.78, 106.98, .8],
    ["Tangkuban Parahu", -6.76, 107.6, .8], ["Papandayan", -7.32, 107.73, .8], ["Guntur", -7.14, 107.84, .6], ["Galunggung", -7.25, 108.06, .7], ["Ciremai", -6.89, 108.4, .7], ["Slamet", -7.24, 109.21, .95], ["Dieng", -7.21, 109.92, .8],
    ["Sindoro", -7.3, 109.99, .65], ["Sumbing", -7.38, 110.07, .55], ["Merbabu", -7.45, 110.44, .6], ["Merapi", -7.54, 110.446, 1], ["Lawu", -7.63, 111.19, .55], ["Wilis", -7.81, 111.76, .5], ["Kelud", -7.93, 112.31, .9],
    ["Arjuno-Welirang", -7.73, 112.58, .65], ["Bromo-Tengger", -7.94, 112.95, .9], ["Semeru", -8.11, 112.92, 1], ["Raung", -8.125, 114.04, .95], ["Ijen", -8.06, 114.24, .8], ["Batur", -8.24, 115.375, .85], ["Agung", -8.34, 115.51, 1],
    ["Rinjani", -8.41, 116.47, .95], ["Tambora", -8.25, 118, .8], ["Sangeang Api", -8.18, 119.06, .9], ["Ebulobo", -8.82, 121.18, .6], ["Kelimutu", -8.77, 121.82, .65], ["Paluweh/Rokatenda", -8.32, 121.71, .85], ["Egon", -8.67, 122.45, .7],
    ["Lewotobi", -8.54, 122.77, 1], ["Ili Boleng", -8.34, 123.26, .7], ["Lewotolok", -8.27, 123.51, 1], ["Tangkoko", 1.52, 125.2, .5], ["Soputan", 1.11, 124.73, .95], ["Lokon", 1.36, 124.79, .9], ["Ruang", 2.3, 125.37, 1], ["Karangetang", 2.78, 125.4, 1],
    ["Colo (Una-Una)", -.17, 121.61, .6], ["Gamalama", .8, 127.33, .9], ["Gamkonora", 1.38, 127.53, .8], ["Ibu", 1.49, 127.63, 1], ["Dukono", 1.7, 127.89, 1], ["Banda Api", -4.52, 129.87, .75]];
  /* zona subduksi / palung / sesar naik (tsunamigenik) & sesar geser aktif — perkiraan garis */
  const SUB = [
    ["Megathrust Sunda (Sumatra–Jawa–Nusa Tenggara)", [[6.2, 93.2], [4, 94], [2, 95.3], [0, 97.3], [-2, 99], [-4, 100.9], [-6, 102.6], [-7.6, 105], [-8.9, 107.5], [-9.5, 110], [-10, 112.5], [-10.4, 115], [-10.7, 117.5], [-10.9, 120], [-10.6, 122.5]]],
    ["Palung Timor", [[-10.6, 122.5], [-10.3, 124.5], [-9.6, 126.5], [-8.8, 128.5]]], ["Palung Tanimbar", [[-8.8, 128.5], [-8.2, 130.5], [-7, 131.8]]],
    ["Sesar naik busur-belakang Flores", [[-8.1, 115], [-8.2, 117.5], [-8.1, 120], [-8, 122.5], [-7.9, 125]]], ["Palung Seram–Banda", [[-3.5, 126.5], [-3.2, 128.5], [-3.4, 130.5]]],
    ["Palung Sulawesi Utara", [[2.2, 122], [1.6, 123.5], [1.2, 125]]], ["Tumbukan Laut Maluku", [[3.5, 126.5], [1, 126.5], [-.5, 126]]], ["Palung Halmahera", [[2.5, 128.8], [.5, 128.8]]], ["Palung Papua Utara", [[-.5, 134], [-1.5, 137], [-2.4, 140]]]];
  const FLT = [
    ["Sesar Sumatra (Semangko)", [[5.5, 95.3], [4.7, 96.5], [3.5, 97.6], [2.5, 98.7], [1, 99.4], [0, 100.3], [-1.5, 101.2], [-3, 102.2], [-4.5, 103.3], [-5.9, 104.6], [-6, 105.2]]],
    ["Sesar Cimandiri", [[-7, 106.3], [-6.95, 106.9], [-6.85, 107.3]]], ["Sesar Lembang", [[-6.83, 107.45], [-6.82, 107.8]]], ["Sesar Baribis", [[-6.15, 107.15], [-6.55, 108], [-6.85, 108.6], [-7, 109.1]]],
    ["Sesar Opak", [[-8.05, 110.28], [-7.85, 110.5]]], ["Sesar Semarang", [[-6.95, 110.3], [-7.05, 110.5]]], ["Sesar Naik Kendeng", [[-7.1, 110.9], [-7.2, 111.8], [-7.3, 112.6]]], ["Sesar Pasuruan", [[-7.6, 112.7], [-7.7, 113.3]]],
    ["Sesar Palu–Koro", [[-.4, 119.7], [-1.2, 120], [-2, 120.4], [-2.6, 121.4]]], ["Sesar Matano", [[-2.5, 121.2], [-2.6, 122.3]]], ["Sesar Lawanopo", [[-3.4, 121.9], [-4.2, 122.9]]], ["Sesar Walanae", [[-3.7, 119.9], [-4.8, 120.3]]],
    ["Sesar Poso", [[-1.6, 120.5], [-1.4, 121.5]]], ["Sesar Gorontalo", [[.5, 122.3], [.6, 123.5]]], ["Sesar Sorong", [[-.9, 131.2], [-1, 132.5], [-1.4, 134], [-2.1, 136], [-2.6, 138.5], [-2.8, 140.2]]],
    ["Sesar Tarera–Aiduna", [[-3.8, 133], [-4.2, 134.5], [-4.4, 136.5]]], ["Sesar Seram", [[-3, 128.4], [-3.2, 130]]], ["Sesar Yapen", [[-1.8, 135.5], [-2.4, 136.9]]]];
  /* titik rawan terkenal (lokasi perkiraan) [nama, lat, lon, jenis, catatan] */
  const SPOTS = [["Pelabuhan Merak", -5.933, 106.007, "macet", "Antrean penyeberangan Jawa–Sumatra, puncak mudik/Nataru"], ["Pelabuhan Bakauheni", -5.865, 105.748, "macet", "Antrean kapal & akses tol Sumatra"],
    ["Pelabuhan Ketapang–Gilimanuk", -8.145, 114.388, "macet", "Antrean kapal Jawa–Bali pada libur panjang"], ["Nagreg", -7.0, 107.95, "laka", "Tanjakan/turunan padat jalur selatan Jawa Barat"], ["Tanjakan Emen (Subang)", -6.753, 107.676, "laka", "Tanjakan curam-berkelok, kendaraan berat"],
    ["Puncak Pass (Bogor–Cianjur)", -6.709, 106.998, "macet", "Macet wisata akhir pekan, sistem satu arah"], ["Brebes (gerbang Pantura/mudik)", -6.8745, 109.0522, "macet", "Pertemuan tol–arteri Pantura, puncak arus mudik"],
    ["Kaligawe, Semarang", -6.9547, 110.4714, "macet", "Genangan/rob & padat truk Pantura"], ["Cawang, Jakarta", -6.2425, 106.8737, "macet", "Simpul tol dalam kota & LRT"], ["Pelabuhan Tanjung Priok", -6.1, 106.88, "macet", "Antrean truk kontainer"],
    ["Wangon (simpang jalur selatan)", -7.5174, 109.0562, "laka", "Simpang jalur selatan Jateng, volume tinggi"], ["Pantura Demak–Kudus", -6.88, 110.72, "laka", "Jalur nasional padat truk & sepeda motor"], ["Alas Roban (Batang)", -6.93, 109.85, "laka", "Tikungan/tanjakan Pantura, truk berat, kabut & longsor"], ["Tanjakan Gentong (Tasikmalaya)", -7.37, 108.2, "laka", "Tanjakan panjang jalur selatan Jabar"], ["Sitinjau Lauik (Padang)", -0.99, 100.46, "laka", "Tanjakan curam-berkelok, truk berat"], ["Kelok 9 (Sumbar)", -0.1, 100.55, "laka", "Jalur lintas Sumatra berkelok, padat saat libur"], ["Porong (Sidoarjo)", -7.54, 112.7, "macet", "Simpul Surabaya–Malang/Pasuruan, tol & arteri padat"], ["Simpang Susun Kalikangkung (Semarang)", -6.98, 110.35, "macet", "Pertemuan tol–arteri, antrean saat mudik"], ["Gerbang Tol Cikampek Utama", -6.4, 107.45, "macet", "Titik pertemuan Cikampek–Cipali–Japek, antrean libur panjang"], ["Pelabuhan Gilimanuk/Padangbai (Bali)", -8.17, 114.44, "macet", "Antrean kendaraan penyeberangan"], ["Kota Medan (Jl. Gatot Subroto–Ringroad)", 3.58, 98.65, "macet", "Kepadatan jam sibuk kota besar"], ["Surabaya (Waru–Tol Sidoarjo)", -7.35, 112.73, "macet", "Antrean gerbang tol & arteri Waru"]];

  /* ============================ GEOMETRI ============================ */
  const DEG = Math.PI / 180;
  function dec(s) { let i = 0, la = 0, lo = 0, o = []; while (i < s.length) { let b, sh = 0, r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); la += r & 1 ? ~(r >> 1) : r >> 1; sh = 0; r = 0; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lo += r & 1 ? ~(r >> 1) : r >> 1; o.push([la / 1e5, lo / 1e5]); } return o; }
  function pip(r, la, lo) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > lo) !== (b[1] > lo) && la < (b[0] - a[0]) * (lo - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function dSeg(la, lo, a, b) {
    const k = Math.cos(la * DEG) * 111.32, px = lo * k, py = la * 110.57, ax = a[1] * k, ay = a[0] * 110.57, bx = b[1] * k, by = b[0] * 110.57, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = clamp(t, 0, 1); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function dLine(la, lo, pts) { let m = 1e9; for (let i = 1; i < pts.length; i++) { const d = dSeg(la, lo, pts[i - 1], pts[i]); if (d < m) m = d; } return m; }
  function dPt(la, lo, a, b) { return Math.hypot((lo - b) * Math.cos(la * DEG) * 111.32, (la - a) * 110.57); }

  /* ============================ PERHITUNGAN ============================ */
  const COAST_YES = { "k:palu": 1, "k:banda aceh": 1, "k:ambon": 1, "k:jayapura": 1, "k:bandar lampung": 1 };
  const COAST_NO = { "sanggau": 1, "sintang": 1, "kapuas hulu": 1, "melawi": 1, "sekadau": 1, "malinau": 1, "keerom": 1, "pegunungan bintang": 1, "boven digoel": 1, "belu": 1, "malaka": 1, "timor tengah utara": 1, "k:pontianak": 1, "k:palangka raya": 1, "k:banjarbaru": 1 };
  let KAB = null, PROVS = [];
  const nrm = full => { let s = String(full).toLowerCase(), t = "b"; if (/^kota administrasi /.test(s)) { s = s.replace(/^kota administrasi /, ""); t = "k"; } else if (/^kabupaten administrasi /.test(s)) { s = s.replace(/^kabupaten administrasi /, ""); } else if (/^kota /.test(s)) { s = s.replace(/^kota /, ""); t = "k"; } else s = s.replace(/^kabupaten /, ""); return { s, t }; };
  const look = (M, n, d) => { const v = M[n.t + ":" + n.s]; return v != null ? v : (M[n.s] != null ? M[n.s] : d); };
  function build() {
    if (KAB) return KAB; KAB = []; const D = window.PQ_KABBATAS || {};
    for (const p in D) D[p].forEach(k => {
      const rings = k[1].map(dec); let s = 90, w = 180, n = -90, e = -180, sx = 0, sy = 0, c = 0;
      rings.forEach(r => r.forEach(q => { if (q[0] < s) s = q[0]; if (q[0] > n) n = q[0]; if (q[1] < w) w = q[1]; if (q[1] > e) e = q[1]; sx += q[0]; sy += q[1]; c++; }));
      const big = rings.slice().sort((a, b) => b.length - a.length)[0] || [], st = Math.max(1, Math.ceil(big.length / 28)), smp = [];
      for (let i = 0; i < big.length; i += st) smp.push(big[i]); smp.push([sx / c, sy / c]);
      KAB.push({ p, n: k[0], nm: nrm(k[0]), rings, bb: [s, w, n, e], c: [sx / c, sy / c], smp });
    });
    /* deteksi pesisir: titik uji sedikit di luar batas yang tidak masuk poligon kabupaten mana pun */
    KAB.forEach(K => {
      let probes = 0, out = 0;
      const rs = K.rings.slice().sort((a, b) => b.length - a.length).slice(0, 3);
      rs.forEach(r => { const st = Math.max(1, Math.floor(r.length / 10)); for (let i = 0; i < r.length; i += st) {
        const q = r[i], dy = q[0] - K.c[0], dx = q[1] - K.c[1], L = Math.hypot(dx, dy) || 1, la = q[0] + .022 * dy / L, lo = q[1] + .022 * dx / L; probes++;
        let inside = false; for (let j = 0; j < KAB.length && !inside; j++) { const o = KAB[j], b = o.bb; if (la < b[0] || la > b[2] || lo < b[1] || lo > b[3]) continue; for (const rr of o.rings) if (pip(rr, la, lo)) { inside = true; break; } }
        if (!inside) out++; } });
      K.coast = probes ? out / probes : 0; K.pesisir = K.coast >= .14;
      const q = nrm(K.n), key = q.t + ":" + q.s; if (COAST_YES[key] || COAST_YES[q.s]) K.pesisir = true; if (COAST_NO[key] || COAST_NO[q.s]) K.pesisir = false; if (K.pesisir && K.coast < .14) K.coast = .3;
    });
    KAB.forEach(score); const set = {}; KAB.forEach(K => { (set[K.p] = set[K.p] || []).push(K); }); PROVS = Object.keys(set).sort(); PROVS.forEach(p => { KAB.PM = KAB.PM || {}; KAB.PM[p] = set[p]; });
    return KAB;
  }
  const mini = (K, f) => { let m = 1e9, w = null; K.smp.forEach(q => f(q[0], q[1], r => { if (r[0] < m) { m = r[0]; w = r[1]; } })); return [m, w]; };
  function score(K) {
    const pb = PB[K.p] || [3, 3, 3, 3, 1, 2, 1, 2], isK = K.nm.t === "k", n = K.nm, h = {};
    /* jarak ke sesar / subduksi / gunung api (min dari titik sampel poligon) */
    let dSub = 1e9, wSub = "", dFlt = 1e9, wFlt = "", dVol = 1e9, wVol = "", vScore = 0;
    K.smp.forEach(q => {
      SUB.forEach(s => { const d = dLine(q[0], q[1], s[1]); if (d < dSub) { dSub = d; wSub = s[0]; } });
      FLT.forEach(s => { const d = dLine(q[0], q[1], s[1]); if (d < dFlt) { dFlt = d; wFlt = s[0]; } });
      VOL.forEach(v => { const d = dPt(q[0], q[1], v[1], v[2]); if (d < dVol) { dVol = d; wVol = v[0]; } const sc = v[3] * Math.exp(-Math.max(0, d - 8) / 45); if (sc > vScore) vScore = sc; });
    });
    const gSub = Math.exp(-Math.max(0, dSub - 60) / 260) * .92, gFlt = Math.exp(-dFlt / 60) * .95, Q = Math.max(gSub, gFlt);
    h.gempa = clamp(Q * 78 + pb[2] * 2.5, 0, 100);
    h.gunung = clamp(vScore * 100, 0, 100);
    const urbanFlat = isK || /jakarta/.test(n.s) ? 6 : 0;
    h.banjir = clamp(pb[0] * 14 + (K.pesisir ? 8 : 0) + urbanFlat + look({ "jakarta utara": 14, "jakarta barat": 8, "jakarta timur": 8, "jakarta selatan": 6, "jakarta pusat": 6, "b:bandung": 12, "b:bekasi": 12, "k:bekasi": 10, "karawang": 10, "indramayu": 10, "demak": 12, "kudus": 8, "pati": 8, "grobogan": 10, "k:semarang": 10, "k:pekalongan": 10, "pekalongan": 6, "bojonegoro": 12, "lamongan": 8, "sidoarjo": 10, "gresik": 6, "banjar": 10, "hulu sungai tengah": 8, "hulu sungai utara": 10, "k:medan": 8, "deli serdang": 8, "k:samarinda": 10, "k:pontianak": 8, "k:bengkulu": 6, "b:tangerang": 8, "k:tangerang": 8, "kapuas": 6, "barito kuala": 8, "tapin": 6, "b:cirebon": 6, "brebes": 6, "k:bandung": 6, "b:sampang": 4, "k:jambi": 6, "mimika": 6, "asmat": 8, "mappi": 8 }, n, 0), 0, 100);
    h.longsor = clamp(pb[1] * 13 + vScore * 14 + look({ "b:bogor": 14, "b:sukabumi": 14, "cianjur": 14, "garut": 14, "b:tasikmalaya": 10, "banjarnegara": 18, "banyumas": 10, "purbalingga": 12, "kebumen": 8, "purworejo": 12, "wonosobo": 16, "temanggung": 10, "karanganyar": 12, "magetan": 8, "ponorogo": 8, "pacitan": 10, "trenggalek": 10, "b:malang": 8, "agam": 12, "tanah datar": 12, "padang pariaman": 8, "tapanuli utara": 10, "tapanuli tengah": 8, "tapanuli selatan": 10, "mandailing natal": 8, "tana toraja": 10, "toraja utara": 8, "enrekang": 10, "bandung barat": 12, "majalengka": 10, "kuningan": 8, "sumedang": 10, "lebak": 8, "bogor": 4, "jayawijaya": 8, "lanny jaya": 8, "puncak": 8, "nduga": 8 }, n, 0) - (isK ? 8 : 0) - (K.pesisir && pb[1] < 4 ? 4 : 0), 0, 100);
    const pantaiRentan = Math.exp(-Math.max(0, dSub - 40) / 200);
    h.tsunami = K.pesisir ? clamp(pb[3] * 9 + 48 * pantaiRentan * (.6 + .4 * Math.min(1, K.coast * 2.2)) + (dFlt < 60 && /palu|donggala|sigi/.test(n.s) ? 28 : 0), 0, 100) : 0;
    h.kering = clamp(pb[5] * 16 + (K.c[0] < -7.4 && K.c[1] > 110 && K.c[1] < 116 ? 6 : 0) + (K.c[0] < -8 && K.c[1] > 118 ? 8 : 0) + (isK ? -8 : 0), 0, 100);
    /* gambut: porsi titik grid 9x9 dalam wilayah yang berada di zona gambut (poligon kasar dari modul Karhutla) -> berlaku untuk SEMUA kab/kota */
    if (K.pf == null) { K.pf = 0; const PK = window.PETAQU_KARHUTLA; if (PK && PK._peat) { const b = K.bb; let tot = 0, hit = 0; for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { const la = b[0] + (b[2] - b[0]) * (i + .5) / 9, lo = b[1] + (b[3] - b[1]) * (j + .5) / 9; let ins = false; for (const rr of K.rings) if (pip(rr, la, lo)) { ins = true; break; } if (!ins) continue; tot++; if (PK._peat(la, lo)) hit++; } K.pf = tot ? hit / tot : 0; } }
    h.karhutla = clamp(pb[6] * 16 + K.pf * 26 + look({ "ogan komering ilir": 8, "musi banyuasin": 8, "banyuasin": 6, "kapuas": 8, "pulang pisau": 10, "katingan": 8, "kotawaringin timur": 6, "rokan hilir": 8, "bengkalis": 8, "indragiri hilir": 8, "pelalawan": 8, "siak": 6, "meranti": 8, "kepulauan meranti": 8, "ketapang": 6, "kubu raya": 6, "muaro jambi": 8, "tanjung jabung barat": 8, "tanjung jabung timur": 6, "merauke": 6 }, n, 0) - (isK ? 14 : 0), 0, 100);
    h.angin = clamp(pb[7] * 16 + (isK ? 5 : 0) + (K.pesisir ? 4 : 0), 0, 100);
    const arr = Object.keys(h).map(k => h[k]).sort((a, b) => b - a);
    h.comp = clamp(.55 * arr[0] + .45 * (arr[0] + arr[1] + arr[2]) / 3, 0, 100);
    K.h = h; K.geo = { dSub, wSub, dFlt, wFlt, dVol, wVol };
    /* lalu lintas */
    const dU = look(URB, n, isK ? 48 : (URB_PROV[K.p] || 14)), dI = look(INTR, n, INT_PROV[K.p] || (/Papua|Maluku/.test(K.p) ? 12 : 22)), dW = look(WIS, n, (isK ? 25 : 15) + (K.pesisir ? 6 : 0));
    const PROF = { kerja: [.7, .3, 0], libur: [.3, .25, .45], mudik: [.2, .65, .15] }; K.t = { U: dU, I: dI, W: dW };
    K.m = {}; K.l = {}; const P = PLK[K.p] || 45, RH = look(BLK, n, h.longsor * .45 + 25 + (dI > 60 ? 8 : 0));
    for (const k in PROF) { const w = PROF[k], m = clamp(w[0] * dU + w[1] * dI + w[2] * dW + (dU > 85 && k === "kerja" ? 4 : 0), 0, 100); K.m[k] = m; K.l[k] = clamp(.35 * P + .30 * m + .35 * RH, 0, 100); }
    K.lk = { P, RH };
  }

  /* ============================ KELAS & WARNA ============================ */
  const CL = [["Rendah", "#22c55e"], ["Sedang", "#facc15"], ["Tinggi", "#f97316"], ["Sangat tinggi", "#dc2626"]];
  let TH = [30, 52, 72];
  const cls = v => v < TH[0] ? 0 : v < TH[1] ? 1 : v < TH[2] ? 2 : 3;
  /* ambang kelas: lalu lintas = ambang absolut (skor ~ tingkat kepadatan/paparan nyata); bencana & gempa = campuran ambang absolut + peringkat se-Indonesia */
  const ABS = { macet: [22, 40, 60], laka: [38, 54, 70], bencana: [38, 55, 72], gempa: [30, 52, 72] };
  function calcTH() { if (!KAB) return; const a = (effLevel() === "prov" ? PROVS.map(provVal) : KAB.map(val)).sort((x, y) => x - y), q = f => a[Math.min(a.length - 1, Math.floor(a.length * f))], A = ABS[pref.mode] || ABS.bencana;
    if (pref.mode === "macet" || pref.mode === "laka") TH = A.slice(); else TH = [.5 * q(.35) + .5 * A[0], .5 * q(.65) + .5 * A[1], .5 * q(.88) + .5 * A[2]]; }
  const MODES = { bencana: { t: "Rawan Bencana", c: "#f97316", ic: "\uf071" }, macet: { t: "Rawan Macet", c: "#eab308", ic: "\uf637" }, laka: { t: "Rawan Kecelakaan (Lakalantas)", c: "#ef4444", ic: "\uf5e1" }, gempa: { t: "Rawan Gempa", c: "#a855f7", ic: "\uf83e" } };
  const HZ = [["banjir", "Banjir"], ["longsor", "Tanah longsor"], ["gempa", "Gempa bumi"], ["tsunami", "Tsunami"], ["gunung", "Gunung api"], ["kering", "Kekeringan"], ["karhutla", "Kebakaran hutan & lahan"], ["angin", "Angin kencang / puting beliung"]];
  const KOND = { kerja: "Hari kerja", libur: "Akhir pekan / libur", mudik: "Mudik / Nataru" };
  const TIP = { banjir: "Periksa drainase/gorong-gorong, siapkan pompa; tunda aspal saat hujan.", longsor: "Periksa lereng & talud, siapkan material tanggap darurat dan rambu rawan longsor.", gempa: "Cek struktur jembatan/oprit pasca-gempa; siapkan jalur alternatif.", tsunami: "Kenali jalur evakuasi; jangan andalkan jalan pesisir saat peringatan tsunami.", gunung: "Waspada lahar dingin di sungai/jembatan; ikuti level aktivitas PVMBG.", kering: "Siapkan air untuk perawatan/pemadatan; waspada debu & retak badan jalan.", karhutla: "Asap mengurangi jarak pandang — kurangi kecepatan, nyalakan lampu.", angin: "Patroli pohon tumbang & rambu roboh pasca hujan-angin.", macet: "Jadwalkan pekerjaan lapangan di luar jam puncak; rekayasa lalin & rambu pengalihan.", laka: "Rambu, marka & guardrail di tikungan/tanjakan; pengawasan kecepatan." };
  let pref = Object.assign({ mode: "bencana", jenis: "all", kond: "kerja", level: "auto", prov: "", ov: true }, lsGet(LSP) || {});
  const S = { on: false };
  const val = K => { if (pref.mode === "bencana") return K.h[pref.jenis === "all" ? "comp" : pref.jenis]; if (pref.mode === "gempa") return K.h.gempa; if (pref.mode === "macet") return K.m[pref.kond]; return K.l[pref.kond]; };
  const provVal = p => { const a = KAB.PM[p].map(val); return .5 * a.reduce((s, x) => s + x, 0) / a.length + .5 * Math.max.apply(null, a); };
  const effLevel = () => pref.level !== "auto" ? pref.level : ((getMap() && getMap().getZoom() < 7) ? "prov" : "kab");
  const titleNow = () => { let t = MODES[pref.mode].t; if (pref.mode === "bencana" && pref.jenis !== "all") t = "Rawan " + (HZ.filter(h => h[0] === pref.jenis)[0] || [0, ""])[1]; if (pref.mode === "macet" || pref.mode === "laka") t += " · " + KOND[pref.kond]; return t; };

  /* ============================ PETA ============================ */
  let G = null, OV = null, polys = [], card = null, rend = null;
  function ensureLayers() {
    const m = getMap(); if (!m || G) return !!G;
    if (!m.getPane("pqrwPane")) { m.createPane("pqrwPane"); m.getPane("pqrwPane").style.zIndex = 404; }
    try { m.getPane("popupPane").style.zIndex = 1100; } catch (e) { }
    rend = L.canvas({ pane: "pqrwPane", padding: .3 }); G = L.layerGroup(); OV = L.layerGroup();
    KAB.forEach((K, i) => { const pl = L.polygon(K.rings, { renderer: rend, pane: "pqrwPane", weight: .6, color: "#0b1220", opacity: .8, fillOpacity: .6, fillColor: "#64748b" }); pl.on("click", e => { L.DomEvent.stopPropagation(e); popup(K, e.latlng); }); pl._k = K; polys.push(pl); G.addLayer(pl); });
    return true;
  }
  function paint() {
    if (!G) return; calcTH(); const lv = effLevel(), pc = {}; if (lv === "prov") PROVS.forEach(p => { pc[p] = provVal(p); });
    polys.forEach(pl => { const K = pl._k, v = lv === "prov" ? pc[K.p] : val(K), show = !pref.prov || pref.prov === K.p; pl.setStyle({ fillColor: CL[cls(v)][1], fillOpacity: show ? .62 : 0, opacity: show ? .8 : 0, weight: lv === "prov" ? .35 : .7, interactive: show }); pl.unbindTooltip(); if (show) pl.bindTooltip(esc(lv === "prov" ? K.p : K.n) + " · " + Math.round(v) + " (" + CL[cls(v)][0] + ")", { sticky: true }); });
    overlays(); if (curPop) renderPop();
  }
  function overlays() {
    const m = getMap(); if (!m) return; OV.clearLayers();
    const showF = pref.ov && (pref.mode === "gempa" || (pref.mode === "bencana" && (pref.jenis === "all" || pref.jenis === "gempa" || pref.jenis === "tsunami" || pref.jenis === "gunung")));
    if (showF) {
      SUB.forEach(s => OV.addLayer(L.polyline(s[1], { pane: "pqrwPane", color: "#a855f7", weight: 3, opacity: .95, dashArray: "2 6" }).bindTooltip(esc(s[0]), { sticky: true })));
      FLT.forEach(s => OV.addLayer(L.polyline(s[1], { pane: "pqrwPane", color: "#ef4444", weight: 2.4, opacity: .95 }).bindTooltip(esc(s[0]), { sticky: true })));
      VOL.forEach(v => OV.addLayer(L.marker([v[1], v[2]], { icon: L.divIcon({ className: "", html: '<div style="color:#fb923c;font-size:15px;text-shadow:0 0 3px #000;line-height:1">\u25B2</div>', iconSize: [14, 14], iconAnchor: [7, 9] }) }).bindTooltip("Gunung " + esc(v[0]))));
    }
    if (pref.ov && (pref.mode === "macet" || pref.mode === "laka")) SPOTS.filter(s => s[3] === pref.mode || pref.mode === "laka").forEach(s => OV.addLayer(L.circleMarker([s[1], s[2]], { radius: 7, color: "#fff", weight: 1.5, fillColor: s[3] === "macet" ? "#eab308" : "#ef4444", fillOpacity: 1 }).bindPopup("<b>" + esc(s[0]) + "</b><br>" + esc(s[4]) + "<br><i>lokasi perkiraan, indikatif</i>")));
    if (S.on && !m.hasLayer(OV)) OV.addTo(m);
  }
  const bar = (l, v, c) => '<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="flex:0 0 150px;font-size:11px;color:#dbe7f3;white-space:nowrap;position:relative;z-index:1">' + l + '</span><span style="flex:1;height:6px;border-radius:3px;background:#1e293b"><i style="display:block;height:6px;border-radius:3px;width:' + Math.round(v) + "%;background:" + (c || CL[cls(v)][1]) + '"></i></span><b style="font-size:11px;width:24px;text-align:right">' + Math.round(v) + "</b></div>";
  function detail(K) {
    const g = K.geo; let h = "";
    if (pref.mode === "bencana") { h = HZ.map(z => (z[0] === "tsunami" && !K.pesisir) ? bar(z[1], 0) + '<div style="font-size:10px;color:#64748b;margin:-2px 0 2px 124px">bukan wilayah pesisir</div>' : bar(z[1], K.h[z[0]])).join(""); const top = HZ.slice().sort((a, b) => K.h[b[0]] - K.h[a[0]])[0][0]; h += '<div style="margin-top:6px;font-size:11.5px">\u26A0 Dominan: <b>' + esc(HZ.filter(z => z[0] === top)[0][1]) + "</b>. " + esc(TIP[top]) + "</div>"; }
    else if (pref.mode === "gempa") { h = bar("Gempa bumi", K.h.gempa) + (K.pesisir ? bar("Tsunami (pesisir)", K.h.tsunami) : "") + bar("Gunung api", K.h.gunung) + '<div style="font-size:11.5px;margin-top:6px">Zona subduksi terdekat: <b>' + esc(g.wSub) + "</b> (±" + Math.round(g.dSub) + ' km)<br>Sesar aktif terdekat: <b>' + esc(g.wFlt) + "</b> (±" + Math.round(g.dFlt) + ' km)<br>Gunung api terdekat: <b>' + esc(g.wVol) + "</b> (±" + Math.round(g.dVol) + " km)<br>" + esc(TIP.gempa) + "</div>"; }
    else if (pref.mode === "macet") h = bar("Kepadatan perkotaan", K.t.U, "#eab308") + bar("Jalur antar-kota / mudik", K.t.I, "#f59e0b") + bar("Arus wisata", K.t.W, "#fb923c") + '<div style="font-size:11.5px;margin-top:6px">' + esc(TIP.macet) + "</div>";
    else h = bar("Angka laka provinsi", K.lk.P, "#ef4444") + bar("Paparan lalu lintas", K.m[pref.kond], "#f59e0b") + bar("Tikungan/tanjakan/lintasan", K.lk.RH, "#fb7185") + '<div style="font-size:11.5px;margin-top:6px">' + esc(TIP.laka) + "</div>";
    return h;
  }
  /* popup di level <body> (bukan lapisan Leaflet) agar selalu di atas poligon, animasi & lapisan lain */
  let curPop = null, popEl = null;
  function closePop() { curPop = null; if (popEl) popEl.style.display = "none"; }
  function placePop() {
    const m = getMap(); if (!curPop || !popEl || !m) return;
    const r = m.getContainer().getBoundingClientRect(), pt = m.latLngToContainerPoint(curPop.ll), W = popEl.offsetWidth, H = popEl.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let x = r.left + pt.x - W / 2, y = r.top + pt.y - H - 14;
    if (y < r.top + 8) y = r.top + pt.y + 14;
    x = Math.max(8, Math.min(vw - W - 8, x)); y = Math.max(8, Math.min(vh - H - 8, y));
    popEl.style.left = x + "px"; popEl.style.top = y + "px";
  }
  function renderPop() {
    const m = getMap(); if (!curPop || !m) return; const K = curPop.K;
    calcTH(); const lv = effLevel(), v = lv === "prov" ? provVal(K.p) : val(K), c = cls(v);
    if (!popEl) {
      popEl = document.createElement("div"); popEl.id = "pqrwPop";
      popEl.addEventListener("click", e => { if (e.target.closest(".pqrw-x")) closePop(); e.stopPropagation(); });
      ["mousedown", "dblclick", "wheel", "touchstart"].forEach(t => popEl.addEventListener(t, e => e.stopPropagation(), { passive: true }));
      document.body.appendChild(popEl);
      m.on("move zoom resize", placePop); m.on("click", closePop);
    }
    popEl.innerHTML = '<button class="pqrw-x" aria-label="Tutup">\u00D7</button>' + ('<div style="min-width:270px;font:12px system-ui,sans-serif;color:#e6f1fb"><div style="font-size:14px;font-weight:700">' + esc(K.n) + '</div><div style="color:#9fb0c8;margin-bottom:4px">' + esc(K.p) + " · " + esc(titleNow()) + '</div><div style="display:inline-block;padding:2px 10px;border-radius:999px;background:' + CL[c][1] + ';color:#0a0e17;font-weight:700;margin:2px 0 6px">' + CL[c][0] + " · skor " + Math.round(v) + (lv === "prov" ? " (provinsi)" : "") + "</div>" + detail(K) + '<div style="margin-top:6px;font-size:10px;color:#64748b">Indeks indikatif — bukan data/peringatan resmi.</div></div>');
    popEl.style.display = "block"; placePop();
  }
  function popup(K, ll) { curPop = { K, ll: ll || K.c }; renderPop(); }

  /* ============================ PANEL ============================ */
  const CSS = "#pqrwPop{position:fixed;z-index:1400;display:none;width:min(320px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;box-sizing:border-box;padding:12px 14px;border-radius:12px;background:#0a0e17;color:#e6f1fb;border:1px solid rgba(148,178,204,.4);box-shadow:0 14px 40px #000d;font:12px/1.4 system-ui,sans-serif}#pqrwPop .pqrw-x{position:absolute;right:6px;top:4px;border:0;background:none;color:#fff;font-size:20px;line-height:1;cursor:pointer}.pqrw-pop{z-index:1200!important}.pqrw-pop .leaflet-popup-content-wrapper{background:#0a0e17!important;opacity:1!important;color:#e6f1fb!important;border:1px solid rgba(148,178,204,.35);border-radius:12px;box-shadow:0 12px 34px #000c;overflow:visible}.pqrw-pop .leaflet-popup-tip{background:#0a0e17!important;opacity:1!important}.pqrw-pop .leaflet-popup-content{margin:11px 14px!important;width:auto!important;max-height:none!important;overflow:visible!important;color:#e6f1fb!important}.pqrw-pop .leaflet-popup-content b{color:#fff}.pqrw-pop .leaflet-popup-close-button{color:#fff!important}" + "#pqrwCard{position:fixed;right:12px;top:76px;z-index:1262;width:min(350px,calc(100vw - 20px));max-height:calc(100vh - 96px);display:none;flex-direction:column;border-radius:14px;border:1px solid rgba(148,178,204,.28);background:#0a0e17f7;color:#dbe7f3;font:12.5px/1.4 system-ui,sans-serif;box-shadow:0 14px 40px #000a;backdrop-filter:blur(10px);overflow:hidden}#pqrwCard.open{display:flex}" +
    "#pqrwCard header{display:flex;align-items:center;gap:8px;padding:10px 12px 6px}#pqrwCard header b{flex:1;font-size:13.5px}#pqrwCard .x{background:0 0;border:0;color:#8fa6bd;font-size:20px;cursor:pointer;line-height:1}" +
    "#pqrwCard .tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:0 10px 6px}#pqrwCard .tabs button{padding:6px 2px;border-radius:8px;border:1px solid rgba(148,178,204,.25);background:#0f1726;color:#cfe0f0;font:600 11px/1.2 system-ui;cursor:pointer}#pqrwCard .tabs button.on{background:var(--c);color:#0a0e17;border-color:var(--c)}" +
    "#pqrwCard .bd{padding:0 10px 8px;overflow:auto;display:flex;flex-direction:column;gap:7px}#pqrwCard select,#pqrwCard input[type=search]{width:100%;box-sizing:border-box;padding:7px 8px;border-radius:8px;border:1px solid rgba(148,178,204,.25);background:#0f1726;color:#e6f1fb;font:inherit;outline:0}" +
    "#pqrwCard .r2{display:grid;grid-template-columns:1fr 1fr;gap:6px}#pqrwCard .lg{display:flex;gap:4px}#pqrwCard .lg span{flex:1;text-align:center;padding:3px 0;border-radius:6px;font-size:10.5px;font-weight:700;color:#0a0e17}" +
    "#pqrwCard .ls{display:flex;flex-direction:column;gap:2px;max-height:230px;overflow:auto;border-top:1px solid rgba(148,178,204,.15);padding-top:5px}#pqrwCard .it{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:7px;cursor:pointer}#pqrwCard .it:hover{background:#ffffff12}#pqrwCard .it i{width:9px;height:9px;border-radius:50%;flex:none}#pqrwCard .it b{flex:1;font-size:12px;font-weight:600}#pqrwCard .it small{color:#8fa6bd;font-size:10.5px}#pqrwCard .it em{font-style:normal;font-weight:700;font-size:12px}" +
    "#pqrwCard .ft{display:flex;gap:6px;flex-wrap:wrap}#pqrwCard .ft button{flex:1;padding:6px 8px;border-radius:8px;border:1px solid rgba(148,178,204,.25);background:#0f1726;color:#cfe0f0;font:600 11px system-ui;cursor:pointer}#pqrwCard .nt{font-size:10px;color:#64748b}#pqrwCard label.ck{display:flex;align-items:center;gap:6px;font-size:11.5px;color:#9db3c9}" +
    "@media(max-width:700px){#pqrwCard{right:8px;left:8px;width:auto;top:auto;bottom:8px;max-height:58vh}}";
  function items() {
    const lv = effLevel(), q = (card.querySelector("#pqrwQ").value || "").trim().toLowerCase(); let a;
    if (lv === "prov") a = PROVS.filter(p => !pref.prov || p === pref.prov).map(p => ({ n: p, p: "", v: provVal(p), K: KAB.PM[p][0], prov: 1 }));
    else a = KAB.filter(K => !pref.prov || K.p === pref.prov).map(K => ({ n: K.n, p: K.p, v: val(K), K }));
    if (q) a = a.filter(x => (x.n + " " + x.p).toLowerCase().indexOf(q) > -1);
    return a.sort((x, y) => y.v - x.v);
  }
  function render() {
    if (!card) return; const m = MODES[pref.mode]; card.style.setProperty("--c", m.c);
    card.querySelectorAll(".tabs button").forEach(b => { b.classList.toggle("on", b.dataset.m === pref.mode); b.style.setProperty("--c", MODES[b.dataset.m].c); });
    card.querySelector("#pqrwT").textContent = titleNow();
    const sj = card.querySelector("#pqrwJ"); if (pref.mode === "bencana") { sj.style.display = ""; sj.innerHTML = '<option value="all">Semua jenis (skor gabungan)</option>' + HZ.map(z => '<option value="' + z[0] + '">' + z[1] + "</option>").join(""); sj.value = pref.jenis; }
    else if (pref.mode === "macet" || pref.mode === "laka") { sj.style.display = ""; sj.innerHTML = Object.keys(KOND).map(k => '<option value="' + k + '">' + KOND[k] + "</option>").join(""); sj.value = pref.kond; } else sj.style.display = "none";
    calcTH(); const lst = items(), lv = effLevel(), cnt = [0, 0, 0, 0]; lst.forEach(x => cnt[cls(x.v)]++);
    card.querySelector("#pqrwL").innerHTML = CL.map((c, i) => '<span style="background:' + c[1] + '" title="' + c[0] + '">' + c[0] + " · " + cnt[i] + "</span>").join("");
    card.querySelector("#pqrwS").innerHTML = lst.map((x, i) => '<div class="it" data-i="' + i + '"><i style="background:' + CL[cls(x.v)][1] + '"></i><b>' + esc(x.n) + "</b><small>" + esc(x.p) + "</small><em style=\"color:" + CL[cls(x.v)][1] + '">' + Math.round(x.v) + "</em></div>").join("") || '<div class="nt" style="padding:8px;text-align:center">Tidak ada wilayah cocok</div>';
    card._lst = lst; card.querySelector("#pqrwLv").textContent = (lv === "prov" ? PROVS.length + " provinsi" : lst.length + " kabupaten/kota") + " · urut skor tertinggi";
    { let kb = card.querySelector("#pqrwKh"); if (!kb) { kb = el("button", "", '<i class="fa-solid fa-fire"></i> Potensi 7 hari, animasi &amp; simulasi api (area peta)'); kb.id = "pqrwKh"; kb.style.cssText = "margin:6px 0;padding:7px 10px;border-radius:9px;border:1px solid #f97316;background:#f9731620;color:#fb923c;font:700 11px system-ui;cursor:pointer;width:100%"; kb.onclick = () => { if (window.PETAQU_KARHUTLA) window.PETAQU_KARHUTLA.open(); else say("Modul Karhutla belum dimuat"); }; card.querySelector("#pqrwL").after(kb); } kb.style.display = pref.mode === "bencana" && (pref.jenis === "karhutla" || pref.jenis === "all") ? "" : "none"; }
    card.querySelector("#pqrwOvL").style.display = (pref.mode === "gempa" || pref.mode === "macet" || pref.mode === "laka" || (pref.mode === "bencana" && /^(all|gempa|tsunami|gunung)$/.test(pref.jenis))) ? "" : "none";
    card.querySelector("#pqrwOvT").textContent = pref.mode === "macet" || pref.mode === "laka" ? "Titik rawan terkenal (perkiraan)" : "Sesar, palung subduksi & gunung api";
  }
  function refresh() { lsSet(LSP, pref); if (!S.on) return; paint(); render(); }
  function build_ui() {
    if (card) return; if (!$("pqrwCss")) { const st = el("style"); st.id = "pqrwCss"; st.textContent = CSS; document.head.appendChild(st); }
    card = el("div"); card.id = "pqrwCard"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Peta kerawanan Indonesia");
    card.innerHTML = '<header><b id="pqrwT"></b><button class="x" id="pqrwX" aria-label="Tutup">\u00D7</button></header><div class="tabs">' + Object.keys(MODES).map(k => '<button data-m="' + k + '">' + { bencana: "Bencana", macet: "Macet", laka: "Laka", gempa: "Gempa" }[k] + "</button>").join("") + "</div>" +
      '<div class="bd"><select id="pqrwJ"></select><div class="r2"><select id="pqrwLvS"><option value="auto">Level: Otomatis</option><option value="prov">Seluruh provinsi</option><option value="kab">Kabupaten/kota</option></select><select id="pqrwP"><option value="">Semua provinsi</option>' + PROVS.map(p => "<option>" + esc(p) + "</option>").join("") + "</select></div>" +
      '<input type="search" id="pqrwQ" placeholder="Cari kabupaten/kota/provinsi\u2026" autocomplete="off"><div class="lg" id="pqrwL"></div><label class="ck" id="pqrwOvL"><input type="checkbox" id="pqrwOv"><span id="pqrwOvT"></span></label><div class="nt" id="pqrwLv"></div><div class="ls" id="pqrwS"></div>' +
      '<div class="ft"><button id="pqrwCp">Salin ringkasan</button><button id="pqrwGm">Gempa real-time</button><button id="pqrwBm">BMKG</button></div><div class="nt">Kelas macet/laka memakai ambang absolut; bencana = gabungan ambang absolut & peringkat se-Indonesia. Skor indikatif (kompilasi pengetahuan umum + geometri sesar/gunung api). Bukan data/peringatan resmi — rujukan: BNPB, PVMBG, BMKG, Korlantas.</div></div>';
    document.body.appendChild(card);
    card.querySelector("#pqrwX").onclick = close;
    card.querySelector(".tabs").onclick = e => { const b = e.target.closest("button"); if (!b) return; pref.mode = b.dataset.m; refresh(); };
    card.querySelector("#pqrwJ").onchange = e => { if (pref.mode === "bencana") pref.jenis = e.target.value; else pref.kond = e.target.value; refresh(); };
    card.querySelector("#pqrwLvS").onchange = e => { pref.level = e.target.value; refresh(); };
    card.querySelector("#pqrwP").onchange = e => { pref.prov = e.target.value; refresh(); if (pref.prov) { const b = KAB.PM[pref.prov].reduce((a, K) => [Math.min(a[0], K.bb[0]), Math.min(a[1], K.bb[1]), Math.max(a[2], K.bb[2]), Math.max(a[3], K.bb[3])], [90, 180, -90, -180]); try { getMap().fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: [30, 30] }); } catch (x) { } } };
    card.querySelector("#pqrwQ").oninput = render;
    card.querySelector("#pqrwOv").onchange = e => { pref.ov = e.target.checked; refresh(); };
    card.querySelector("#pqrwS").onclick = e => { const r = e.target.closest(".it"); if (!r) return; const x = card._lst[+r.dataset.i]; if (!x) return; const m = getMap(); const K = x.K; try { if (x.prov) { const ks = KAB.PM[x.n], b = ks.reduce((a, k) => [Math.min(a[0], k.bb[0]), Math.min(a[1], k.bb[1]), Math.max(a[2], k.bb[2]), Math.max(a[3], k.bb[3])], [90, 180, -90, -180]); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: [30, 30] }); } else m.fitBounds([[K.bb[0], K.bb[1]], [K.bb[2], K.bb[3]]], { padding: [40, 40], maxZoom: 11 }); } catch (z) { } setTimeout(() => popup(K, K.c), 350); };
    card.querySelector("#pqrwCp").onclick = copy;
    card.querySelector("#pqrwGm").onclick = () => { try { window.PETAQU_GEMPA.open(); } catch (e) { window.open("https://www.bmkg.go.id/gempabumi/gempabumi-terkini", "_blank"); } };
    card.querySelector("#pqrwBm").onclick = () => window.open("https://www.bmkg.go.id/", "_blank", "noopener");
    card.querySelector("#pqrwOv").checked = !!pref.ov;
  }
  function copy() {
    const l = items().slice(0, 15), t = "PETAQU \u2014 " + titleNow() + " (" + (effLevel() === "prov" ? "provinsi" : "kab/kota") + (pref.prov ? ", " + pref.prov : "") + ")\n" + l.map((x, i) => (i + 1) + ". " + x.n + (x.p ? " (" + x.p + ")" : "") + " \u2014 " + Math.round(x.v) + " " + CL[cls(x.v)][0]).join("\n") + "\n(Indeks indikatif, bukan data resmi)";
    (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => say("Ringkasan disalin"), () => { const ta = el("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); say("Ringkasan disalin"); } catch (e) { } ta.remove(); });
  }
  let zh = null;
  function open(mode, jenis) {
    const m = getMap(); if (!m) { say("Peta belum siap"); return; }
    if (!window.PQ_KABBATAS) { say("Memuat batas wilayah\u2026"); const s = el("script"); s.src = "data-kabbatas.js"; s.onload = () => open(mode, jenis); document.head.appendChild(s); return; }
    build(); build_ui(); if (mode) { pref.mode = mode; if (jenis) pref.jenis = jenis; } ensureLayers();
    try { const o = window.PETAQU_CUACA_WIL; if (o && o.isOn()) o.close(); } catch (e) { }
    S.on = true; if (!m.hasLayer(G)) G.addTo(m); if (!m.hasLayer(OV)) OV.addTo(m); card.classList.add("open");
    if (!zh) { zh = () => { if (S.on && pref.level === "auto") { paint(); render(); } }; m.on("zoomend", zh); }
    card.querySelector("#pqrwLvS").value = pref.level; card.querySelector("#pqrwP").value = pref.prov; refresh();
  }
  function close() { S.on = false; const m = getMap(); if (card) card.classList.remove("open"); if (m) { if (G && m.hasLayer(G)) m.removeLayer(G); if (OV && m.hasLayer(OV)) m.removeLayer(OV); try { m.closePopup(); } catch (e) { } } closePop(); }

  /* ============================ MENU FOLDER ============================ */
  const ROWS = [["bencana", "Rawan bencana (semua prov & kab/kota)"], ["macet", "Rawan macet (semua prov & kab/kota)"], ["laka", "Rawan kecelakaan / lakalantas"], ["gempa", "Rawan gempa (sesar & subduksi)"]];
  const rows = () => ROWS.map(r => ({ id: r[0], name: r[1], ic: MODES[r[0]].ic, c: MODES[r[0]].c, on: S.on && pref.mode === r[0] }));
  const act = id => { if (S.on && pref.mode === id) close(); else open(id); };
  window.PETAQU_RAWAN = { open, close, rows, act, isOn: () => S.on, _t: { calcTH, build, score, cls, val, KAB: () => KAB, PROVS: () => PROVS, pref, nrm, dec } };
  let tries = 0; const iv = setInterval(() => {
    if (++tries > 120) clearInterval(iv);
    if (!$("pqFolder") && window.PQ_DOCK && !window.PETAQU_RAWAN._dock) { window.PETAQU_RAWAN._dock = 1; try { const b = el("button", "", '<i class="fa-solid fa-triangle-exclamation"></i>'); b.title = "Rawan bencana, macet, kecelakaan & gempa"; b.onclick = () => (S.on ? close() : open()); PQ_DOCK.adopt(b, "Rawan bencana & lalu lintas"); } catch (e) { } }
  }, 700);
})();
