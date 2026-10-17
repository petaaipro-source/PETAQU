/* ==========================================================================
   DATA JALUR PELAYARAN INDONESIA — feri penyeberangan (ASDP), kapal cepat, Pelni, danau & lintas negara
   (dipakai petaqu-feri.js)  — INDIKATIF untuk pra-survei, BUKAN jadwal resmi.
   Edit mudah:
     FR_PELABUHAN = [kode, nama, kab/kota, provinsi, lat, lng, tipe, pulau]
         tipe (gabungan huruf): A = penyeberangan ro-ro (ASDP/swasta) · P = kapal penumpang laut (Pelni) ·
                                C = kapal cepat/speedboat · I = internasional · D = danau
     FR_RUTE      = [id, nama, jenisKapal, "KODE KODE @lat,lng KODE ...", frekuensi/hari/arah, operator]
         urutan = pelabuhan singgah; token "@lat,lng" = titik belok di laut (agar garis tidak memotong daratan)
         rute otomatis dua arah. frekuensi < 1 = tidak tiap hari (mis. 0.14 = seminggu sekali).
     FR_JENIS     = jenis kapal (kecepatan, bongkar-muat, batas gelombang aman, tarif/km)
   Garis rute = garis lurus antar pelabuhan + titik belok (kasar). Untuk geometri nyata gunakan tombol
   "Muat jalur feri dari OSM" di panel. Selalu cek jadwal & tarif resmi operator (ASDP, Pelni, dll).
   ========================================================================== */
window.FR_JENIS = {
  ro:    { n: "Feri Ro-Ro (ASDP)",       ic: "⛴️", kmh: 18, dwell: 50,  hs: 2.5, col: "#0ea5e9", pax: 650,  note: "Kendaraan + penumpang, antre masuk kapal & bongkar-muat ±50 mnt" },
  cepat: { n: "Kapal Cepat / Fast Boat", ic: "🚤", kmh: 38, dwell: 25,  hs: 1.5, col: "#a855f7", pax: 250,  note: "Penumpang saja (kadang motor); peka gelombang" },
  pelni: { n: "Kapal Penumpang Laut (Pelni)", ic: "🚢", kmh: 31, dwell: 360, hs: 3.5, col: "#22c55e", pax: 1500, note: "Rute jarak jauh, singgah ±6 jam tiap pelabuhan, jadwal jarang" },
  speed: { n: "Speedboat",               ic: "🛥️", kmh: 45, dwell: 15,  hs: 1.0, col: "#f97316", pax: 12,   note: "Sangat peka gelombang; berangkat bila penumpang penuh" },
  intl:  { n: "Feri Internasional",      ic: "🌏", kmh: 42, dwell: 45,  hs: 2.0, col: "#ef4444", pax: 400,  note: "Perlu paspor, imigrasi & bea cukai" },
  danau: { n: "Kapal Danau",             ic: "🛶", kmh: 16, dwell: 30,  hs: 0.8, col: "#14b8a6", pax: 200,  note: "Danau Toba dsb.; peka angin" }
};

/* golongan kendaraan penyeberangan (Kemenhub) — rate = Rp per km (model indikatif), sru = satuan ruang di dek */
window.FR_GOL = [
  { k: "0",   n: "Pejalan kaki (dewasa)",           rate: 650,    sru: 0 },
  { k: "I",   n: "Gol I — Sepeda",                  rate: 700,    sru: 0.2 },
  { k: "II",  n: "Gol II — Sepeda motor",           rate: 1500,   sru: 0.3 },
  { k: "III", n: "Gol III — Motor roda 3 / bajaj",  rate: 3000,   sru: 0.6 },
  { k: "IV",  n: "Gol IV — Mobil / pickup / jip",   rate: 13000,  sru: 1 },
  { k: "V",   n: "Gol V — Bus sedang / truk sedang (≤7 m)", rate: 27000,  sru: 2.5 },
  { k: "VI",  n: "Gol VI — Bus besar / truk besar (≤10 m)", rate: 42000,  sru: 3.5 },
  { k: "VII", n: "Gol VII — Truk tronton (≤12 m)",  rate: 68000,  sru: 5 },
  { k: "VIII",n: "Gol VIII — Truk gandeng / trailer (≤16 m)", rate: 105000, sru: 7 },
  { k: "IX",  n: "Gol IX — Kendaraan >16 m / alat berat", rate: 150000, sru: 9 }
];

/* preset muatan proyek jalan → golongan, berat (ton), panjang (m), lebar (m) */
window.FR_MUATAN = [
  ["Sepeda motor survei",             "II", 0.15, 2.0, 0.8],
  ["Mobil survei / pickup",           "IV", 2,    5.0, 1.9],
  ["Truk 6 roda / dump truck kecil",  "V",  12,   7.0, 2.4],
  ["Dump truck 10 roda",              "VI", 22,   9.5, 2.5],
  ["Truk tronton / mixer / tanki aspal", "VII", 30, 11.5, 2.5],
  ["Trailer + peti kemas 40 ft",      "VIII", 35, 15.5, 2.5],
  ["Excavator di atas lowbed",        "IX", 45,   17.0, 3.2],
  ["Wheel loader / grader (lowbed)",  "IX", 38,   16.5, 3.2],
  ["Asphalt finisher (lowbed)",       "IX", 30,   16.0, 3.4],
  ["Tandem / pneumatic roller (lowbed)", "IX", 28, 16.0, 2.6],
  ["Crane / batching plant (modul)",  "IX", 60,   18.0, 3.5]
];

window.FR_PELABUHAN = [
 /* ---- Banten / Lampung / Selat Sunda ---- */
 ["MRK", "Merak", "Kota Cilegon", "Banten", -5.9330, 106.0120, "A", "Jawa"],
 ["CWD", "Ciwandan", "Kota Cilegon", "Banten", -5.9830, 106.0300, "A", "Jawa"],
 ["BKH", "Bakauheni", "Lampung Selatan", "Lampung", -5.8650, 105.7440, "A", "Sumatera"],
 /* ---- Jakarta / Kepulauan Seribu ---- */
 ["TPK", "Tanjung Priok", "Jakarta Utara", "DKI Jakarta", -6.1000, 106.8800, "P", "Jawa"],
 ["KAD", "Kali Adem (Muara Angke)", "Jakarta Utara", "DKI Jakarta", -6.1020, 106.7500, "C", "Jawa"],
 ["MAN", "Marina Ancol", "Jakarta Utara", "DKI Jakarta", -6.1250, 106.8310, "C", "Jawa"],
 ["PRM", "Pulau Pramuka", "Kepulauan Seribu", "DKI Jakarta", -5.7420, 106.6160, "C", "Pulau Seribu"],
 ["TDG", "Pulau Tidung", "Kepulauan Seribu", "DKI Jakarta", -5.8030, 106.5230, "C", "Pulau Seribu"],
 /* ---- Jawa ---- */
 ["TEM", "Tanjung Emas", "Kota Semarang", "Jawa Tengah", -6.9500, 110.4200, "P", "Jawa"],
 ["JPR", "Jepara (Kartini)", "Jepara", "Jawa Tengah", -6.5820, 110.6570, "C", "Jawa"],
 ["KRJ", "Karimunjawa", "Jepara", "Jawa Tengah", -5.8790, 110.4330, "C", "Karimunjawa"],
 ["TPR", "Tanjung Perak", "Kota Surabaya", "Jawa Timur", -7.2000, 112.7320, "P", "Jawa"],
 ["UJG", "Ujung (Surabaya)", "Kota Surabaya", "Jawa Timur", -7.2060, 112.7290, "A", "Jawa"],
 ["KML", "Kamal", "Bangkalan", "Jawa Timur", -7.1570, 112.7250, "A", "Madura"],
 ["GRS", "Gresik", "Gresik", "Jawa Timur", -7.1580, 112.6540, "C", "Jawa"],
 ["SGK", "Sangkapura (Bawean)", "Gresik", "Jawa Timur", -5.8530, 112.6430, "C", "Bawean"],
 ["KTP", "Ketapang", "Banyuwangi", "Jawa Timur", -8.1370, 114.3870, "A", "Jawa"],
 ["GLM", "Gilimanuk", "Jembrana", "Bali", -8.1660, 114.4330, "A", "Bali"],
 /* ---- Bali / Nusa / Lombok ---- */
 ["PDB", "Padangbai", "Karangasem", "Bali", -8.5330, 115.5080, "AC", "Bali"],
 ["SNR", "Sanur", "Kota Denpasar", "Bali", -8.6800, 115.2620, "C", "Bali"],
 ["NLB", "Nusa Lembongan", "Klungkung", "Bali", -8.6700, 115.4550, "C", "Nusa Penida"],
 ["NPN", "Nusa Penida (Buyuk)", "Klungkung", "Bali", -8.6730, 115.5050, "AC", "Nusa Penida"],
 ["LMB", "Lembar", "Lombok Barat", "NTB", -8.7270, 116.0720, "A", "Lombok"],
 ["BSL", "Bangsal", "Lombok Utara", "NTB", -8.3850, 116.0960, "C", "Lombok"],
 ["GLT", "Gili Trawangan", "Lombok Utara", "NTB", -8.3500, 116.0380, "C", "Gili"],
 ["KYN", "Kayangan", "Lombok Timur", "NTB", -8.5640, 116.6940, "A", "Lombok"],
 ["PTN", "Poto Tano", "Sumbawa Barat", "NTB", -8.5050, 116.7580, "A", "Sumbawa"],
 ["BMA", "Bima", "Kota Bima", "NTB", -8.4550, 118.7200, "P", "Sumbawa"],
 ["SAP", "Sape", "Bima", "NTB", -8.5630, 118.9930, "A", "Sumbawa"],
 /* ---- NTT ---- */
 ["LBJ", "Labuan Bajo", "Manggarai Barat", "NTT", -8.4880, 119.8780, "ACP", "Flores"],
 ["END", "Ende (Ippi)", "Ende", "NTT", -8.8500, 121.6500, "AP", "Flores"],
 ["LRT", "Larantuka", "Flores Timur", "NTT", -8.3410, 122.9900, "AP", "Flores"],
 ["LWL", "Lewoleba", "Lembata", "NTT", -8.3700, 123.4100, "AP", "Lembata"],
 ["WGP", "Waingapu", "Sumba Timur", "NTT", -9.6600, 120.2600, "P", "Sumba"],
 ["KPG", "Kupang (Tenau)", "Kota Kupang", "NTT", -10.1900, 123.5700, "P", "Timor"],
 ["BLK", "Bolok (Kupang)", "Kupang", "NTT", -10.1950, 123.5250, "A", "Timor"],
 ["PTB", "Pantai Baru (Rote)", "Rote Ndao", "NTT", -10.7400, 123.0500, "A", "Rote"],
 /* ---- Sumatera ---- */
 ["BDA", "Ulee Lheue", "Kota Banda Aceh", "Aceh", 5.5700, 95.2800, "A", "Sumatera"],
 ["SBG", "Balohan (Sabang)", "Kota Sabang", "Aceh", 5.8470, 95.3390, "A", "Weh"],
 ["BLW", "Belawan", "Kota Medan", "Sumatera Utara", 3.7800, 98.7040, "P", "Sumatera"],
 ["AJB", "Ajibata (Toba)", "Toba", "Sumatera Utara", 2.6600, 98.9400, "D", "Sumatera"],
 ["TMK", "Tomok (Samosir)", "Samosir", "Sumatera Utara", 2.6560, 98.8610, "D", "Samosir"],
 ["SBL", "Sibolga", "Sibolga", "Sumatera Utara", 1.7400, 98.7800, "AP", "Sumatera"],
 ["GNS", "Gunungsitoli", "Kota Gunungsitoli", "Sumatera Utara", 1.2900, 97.6100, "AP", "Nias"],
 ["PDG", "Teluk Bayur", "Kota Padang", "Sumatera Barat", -1.0100, 100.3700, "P", "Sumatera"],
 ["DUM", "Dumai", "Kota Dumai", "Riau", 1.6900, 101.4500, "AIP", "Sumatera"],
 ["MLK", "Melaka (Tanjung Bruas)", "Melaka", "Malaysia", 2.1800, 102.1500, "I", "Semenanjung Malaysia"],
 ["TBK", "Tanjung Balai Karimun", "Karimun", "Kepulauan Riau", 0.9980, 103.4350, "AIP", "Karimun"],
 ["BTC", "Batam Centre", "Kota Batam", "Kepulauan Riau", 1.1190, 104.0580, "CI", "Batam"],
 ["HBR", "Harbour Bay (Batam)", "Kota Batam", "Kepulauan Riau", 1.1700, 104.0300, "CI", "Batam"],
 ["SKP", "Sekupang (Batam)", "Kota Batam", "Kepulauan Riau", 1.1300, 103.9380, "CI", "Batam"],
 ["BTA", "Batu Ampar (Batam)", "Kota Batam", "Kepulauan Riau", 1.1600, 104.0000, "P", "Batam"],
 ["TPI", "Tanjung Pinang (Sri Bintan Pura)", "Kota Tanjung Pinang", "Kepulauan Riau", 0.9230, 104.4490, "CPI", "Bintan"],
 ["BTL", "Bandar Bentan Telani (Lagoi)", "Bintan", "Kepulauan Riau", 1.2200, 104.2300, "CI", "Bintan"],
 ["SIN", "HarbourFront (Singapura)", "Singapura", "Singapura", 1.2640, 103.8200, "I", "Singapura"],
 ["TMR", "Tanah Merah (Singapura)", "Singapura", "Singapura", 1.3390, 103.9840, "I", "Singapura"],
 ["PLG", "Boom Baru (Palembang)", "Kota Palembang", "Sumatera Selatan", -2.9890, 104.7770, "P", "Sumatera"],
 ["TAA", "Tanjung Api-Api", "Banyuasin", "Sumatera Selatan", -2.2800, 104.9800, "A", "Sumatera"],
 ["MTK", "Muntok (Tanjung Kalian)", "Bangka Barat", "Kep. Bangka Belitung", -2.0550, 105.1430, "AP", "Bangka"],
 ["TPD", "Tanjung Pandan", "Belitung", "Kep. Bangka Belitung", -2.7510, 107.6370, "P", "Belitung"],
 /* ---- Kalimantan ---- */
 ["PNK", "Pontianak (Dwikora)", "Kota Pontianak", "Kalimantan Barat", -0.0240, 109.3200, "P", "Kalimantan"],
 ["KMI", "Kumai", "Kotawaringin Barat", "Kalimantan Tengah", -2.7400, 111.7250, "P", "Kalimantan"],
 ["BJM", "Banjarmasin (Trisakti)", "Kota Banjarmasin", "Kalimantan Selatan", -3.3450, 114.5730, "P", "Kalimantan"],
 ["BPN", "Balikpapan (Semayang)", "Kota Balikpapan", "Kalimantan Timur", -1.2780, 116.8110, "P", "Kalimantan"],
 ["KRG", "Kariangau (Balikpapan)", "Kota Balikpapan", "Kalimantan Timur", -1.1620, 116.7600, "A", "Kalimantan"],
 ["PNJ", "Penajam (Buat)", "Penajam Paser Utara", "Kalimantan Timur", -1.2200, 116.7480, "A", "Kalimantan"],
 ["TRK", "Tarakan (Malundung)", "Kota Tarakan", "Kalimantan Utara", 3.3000, 117.6300, "P", "Tarakan"],
 ["NNK", "Nunukan (Tunon Taka)", "Nunukan", "Kalimantan Utara", 4.0700, 117.6700, "PI", "Nunukan"],
 ["TWU", "Tawau (Malaysia)", "Tawau", "Malaysia", 4.2450, 117.8900, "I", "Borneo Utara"],
 /* ---- Sulawesi ---- */
 ["MKS", "Makassar", "Kota Makassar", "Sulawesi Selatan", -5.1310, 119.4100, "P", "Sulawesi"],
 ["PRE", "Parepare", "Kota Parepare", "Sulawesi Selatan", -4.0100, 119.6240, "P", "Sulawesi"],
 ["BIR", "Bira", "Bulukumba", "Sulawesi Selatan", -5.6050, 120.4600, "A", "Sulawesi"],
 ["PMT", "Pamatata (Selayar)", "Kepulauan Selayar", "Sulawesi Selatan", -6.1170, 120.4730, "A", "Selayar"],
 ["BJO", "Bajoe", "Bone", "Sulawesi Selatan", -4.5400, 120.3550, "A", "Sulawesi"],
 ["KLK", "Kolaka", "Kolaka", "Sulawesi Tenggara", -4.0520, 121.6000, "A", "Sulawesi"],
 ["BAU", "Bau-Bau", "Kota Baubau", "Sulawesi Tenggara", -5.4680, 122.6200, "AP", "Buton"],
 ["KDI", "Kendari", "Kota Kendari", "Sulawesi Tenggara", -3.9650, 122.5950, "P", "Sulawesi"],
 ["PNT", "Pantoloan (Palu)", "Kota Palu", "Sulawesi Tengah", -0.7100, 119.8600, "P", "Sulawesi"],
 ["GTO", "Gorontalo", "Kota Gorontalo", "Gorontalo", 0.5170, 123.0470, "P", "Sulawesi"],
 ["MDO", "Manado", "Kota Manado", "Sulawesi Utara", 1.4900, 124.8400, "CP", "Sulawesi"],
 ["BIT", "Bitung", "Kota Bitung", "Sulawesi Utara", 1.4300, 125.1900, "P", "Sulawesi"],
 /* ---- Maluku ---- */
 ["AMB", "Ambon (Yos Sudarso)", "Kota Ambon", "Maluku", -3.6900, 128.1800, "P", "Ambon"],
 ["TUL", "Tual", "Kota Tual", "Maluku", -5.6500, 132.7400, "P", "Kei"],
 ["SML", "Saumlaki", "Kep. Tanimbar", "Maluku", -7.9800, 131.2900, "P", "Tanimbar"],
 ["TTE", "Ternate (Ahmad Yani)", "Kota Ternate", "Maluku Utara", 0.7870, 127.3700, "P", "Ternate"],
 ["BST", "Bastiong (Ternate)", "Kota Ternate", "Maluku Utara", 0.7600, 127.3870, "A", "Ternate"],
 ["RUM", "Rum (Tidore)", "Kota Tidore", "Maluku Utara", 0.6900, 127.4100, "A", "Tidore"],
 ["SFI", "Sofifi", "Kota Tidore", "Maluku Utara", 0.7400, 127.5700, "A", "Halmahera"],
 /* ---- Papua ---- */
 ["SOQ", "Sorong", "Kota Sorong", "Papua Barat Daya", -0.8780, 131.2540, "ACP", "Papua"],
 ["WSI", "Waisai (Raja Ampat)", "Raja Ampat", "Papua Barat Daya", -0.4310, 130.8280, "AC", "Waigeo"],
 ["MKW", "Manokwari", "Manokwari", "Papua Barat", -0.8600, 134.0750, "P", "Papua"],
 ["BIK", "Biak", "Biak Numfor", "Papua", -1.1800, 136.0800, "P", "Biak"],
 ["DJJ", "Jayapura", "Kota Jayapura", "Papua", -2.5300, 140.7200, "P", "Papua"],
 ["FKQ", "Fakfak", "Fakfak", "Papua Barat", -2.9230, 132.2910, "P", "Papua"],
 ["MRO", "Merauke", "Merauke", "Papua Selatan", -8.4800, 140.4000, "P", "Papua"]
];

window.FR_RUTE = [
 /* ======== PENYEBERANGAN RO-RO (ASDP) ======== */
 ["merbkh", "Merak – Bakauheni (Selat Sunda)", "ro", "MRK BKH", 40, "ASDP"],
 ["cwdbkh", "Ciwandan – Bakauheni", "ro", "CWD BKH", 8, "ASDP"],
 ["ktpglm", "Ketapang – Gilimanuk (Selat Bali)", "ro", "KTP GLM", 48, "ASDP"],
 ["pdblmb", "Padangbai – Lembar (Selat Lombok)", "ro", "PDB LMB", 10, "ASDP"],
 ["kynptn", "Kayangan – Poto Tano", "ro", "KYN PTN", 16, "ASDP"],
 ["saplbj", "Sape – Labuan Bajo", "ro", "SAP LBJ", 2, "ASDP"],
 ["bjoklk", "Bajoe – Kolaka (Teluk Bone)", "ro", "BJO KLK", 5, "ASDP"],
 ["birpmt", "Bira – Pamatata (Selayar)", "ro", "BIR PMT", 6, "ASDP"],
 ["krgpnj", "Kariangau – Penajam", "ro", "KRG PNJ", 24, "ASDP"],
 ["ujgkml", "Ujung – Kamal (Selat Madura)", "ro", "UJG KML", 30, "ASDP"],
 ["bdasbg", "Ulee Lheue – Balohan (Sabang)", "ro", "BDA SBG", 3, "ASDP"],
 ["taamtk", "Tanjung Api-Api – Muntok", "ro", "TAA MTK", 3, "ASDP"],
 ["sblgns", "Sibolga – Gunungsitoli (Nias)", "ro", "SBL GNS", 1, "ASDP"],
 ["lrtlwl", "Larantuka – Lewoleba", "ro", "LRT LWL", 1, "ASDP"],
 ["blkptb", "Bolok – Pantai Baru (Rote)", "ro", "BLK PTB", 2, "ASDP"],
 ["pdbnpn", "Padangbai – Nusa Penida (Buyuk)", "ro", "PDB NPN", 6, "ASDP/lokal"],
 ["bstrum", "Bastiong – Rum (Ternate–Tidore)", "ro", "BST RUM", 12, "ASDP"],
 ["bstsfi", "Bastiong – Sofifi (Ternate–Halmahera)", "ro", "BST SFI", 4, "ASDP"],
 ["soqwsi", "Sorong – Waisai (Raja Ampat)", "ro", "SOQ WSI", 2, "ASDP"],
 ["lrtkpg", "Larantuka – Kupang (lintas Flores–Timor)", "ro", "LRT @-9.2,123.2 BLK", 0.3, "ASDP"],
 ["endblk", "Ende – Bolok (Kupang)", "ro", "END @-9.9,122.4 BLK", 0.3, "ASDP"],
 ["ajbtmk", "Ajibata – Tomok (Danau Toba)", "danau", "AJB TMK", 8, "ASDP/lokal"],

 /* ======== KAPAL CEPAT / SPEEDBOAT ======== */
 ["pdbglt", "Padangbai – Gili Trawangan (fast boat)", "cepat", "PDB @-8.46,115.80 GLT", 6, "Operator fast boat"],
 ["snrnlb", "Sanur – Nusa Lembongan", "cepat", "SNR NLB", 6, "Operator fast boat"],
 ["nlbnpn", "Nusa Lembongan – Nusa Penida", "speed", "NLB NPN", 6, "Perahu lokal"],
 ["bslglt", "Bangsal – Gili Trawangan", "speed", "BSL GLT", 10, "Perahu publik"],
 ["kadprm", "Kali Adem – Pulau Pramuka (Kep. Seribu)", "cepat", "KAD PRM", 2, "Kapal rakyat/cepat"],
 ["kadtdg", "Kali Adem – Pulau Tidung", "cepat", "KAD TDG", 2, "Kapal rakyat/cepat"],
 ["manprm", "Marina Ancol – Pulau Pramuka", "cepat", "MAN PRM", 1, "Kapal cepat"],
 ["jprkrj", "Jepara – Karimunjawa", "cepat", "JPR KRJ", 0.7, "Kapal cepat/ferry"],
 ["grssgk", "Gresik – Sangkapura (Bawean)", "cepat", "GRS SGK", 1, "Kapal cepat"],
 ["lbjkmd", "Labuan Bajo – Larantuka (pesisir utara Flores)", "cepat", "LBJ @-8.2,121.0 LRT", 0.1, "Kapal cepat (musiman)"],
 ["soqwsc", "Sorong – Waisai (kapal cepat)", "cepat", "SOQ WSI", 3, "Kapal cepat"],

 /* ======== INTERNASIONAL (Batam–Singapura–Johor–Melaka) ======== */
 ["btcsin", "Batam Centre – HarbourFront (Singapura)", "intl", "BTC SIN", 14, "Batam Fast / Majestic / dll"],
 ["hbrsin", "Harbour Bay – HarbourFront (Singapura)", "intl", "HBR SIN", 10, "Operator feri internasional"],
 ["skpsin", "Sekupang – HarbourFront (Singapura)", "intl", "SKP SIN", 10, "Operator feri internasional"],
 ["btcsin2", "Batam Centre – Tanah Merah (Singapura)", "intl", "BTC @1.20,104.20 TMR", 3, "Operator feri internasional"],
 ["tpisin", "Tanjung Pinang – Tanah Merah (Singapura)", "intl", "TPI @1.10,104.35 TMR", 6, "Operator feri internasional"],
 ["btlsin", "Lagoi (Bintan) – Tanah Merah (Singapura)", "intl", "BTL @1.28,104.30 TMR", 4, "Bintan Resort Ferries"],
 ["btctpi", "Batam Centre – Tanjung Pinang", "cepat", "BTC @1.00,104.30 TPI", 12, "Operator kapal cepat"],
 ["tbkbtc", "Tanjung Balai Karimun – Batam", "cepat", "TBK @1.00,103.70 SKP", 8, "Operator kapal cepat"],
 ["dummlk", "Dumai – Melaka", "intl", "DUM @2.00,101.60 MLK", 1, "Operator feri internasional"],
 ["nnktwu", "Nunukan – Tawau", "intl", "NNK TWU", 3, "Speedboat lintas batas"],

 /* ======== PELNI & KAPAL LAUT JARAK JAUH (koridor indikatif, bukan jadwal) ======== */
 ["pl-sum", "Koridor Pelni Sumatera–Jawa (Belawan–Batam–Priok)", "pelni", "BLW @2.60,101.30 @1.40,103.00 BTA @0.20,104.70 @-1.80,104.80 @-3.00,105.50 @-5.40,106.40 TPK", 0.14, "Pelni"],
 ["pl-bar", "Koridor Pelni Padang–Jawa", "pelni", "PDG @-3.50,101.00 @-5.75,105.90 @-5.85,106.50 TPK", 0.14, "Pelni"],
 ["pl-jwk", "Koridor Pelni Jawa (Priok–Semarang–Surabaya)", "pelni", "TPK @-6.40,108.50 TEM @-6.60,111.50 TPR", 0.3, "Pelni"],
 ["pl-kal", "Koridor Pelni Jawa–Kalimantan Barat (Semarang–Pontianak)", "pelni", "TEM @-5.50,108.50 PNK", 0.14, "Pelni"],
 ["pl-kum", "Koridor Pelni Surabaya–Kumai–Pontianak", "pelni", "TPR @-5.70,111.60 KMI @-2.40,110.40 PNK", 0.14, "Pelni"],
 ["pl-bjm", "Koridor Pelni Surabaya–Banjarmasin", "pelni", "TPR @-5.80,113.40 BJM", 0.3, "Pelni"],
 ["pl-bpn", "Koridor Pelni Surabaya–Balikpapan", "pelni", "TPR @-5.60,114.50 @-3.30,117.00 BPN", 0.14, "Pelni"],
 ["pl-sul", "Koridor Pelni Surabaya–Makassar", "pelni", "TPR @-6.50,114.50 @-6.20,118.00 MKS", 0.25, "Pelni"],
 ["pl-mks", "Koridor Pelni Makassar–Bau-Bau–Ambon", "pelni", "MKS @-5.80,119.40 @-5.80,120.50 BAU @-4.50,124.80 AMB", 0.14, "Pelni"],
 ["pl-pre", "Koridor Pelni Makassar–Parepare–Balikpapan", "pelni", "MKS @-4.70,118.90 PRE @-2.80,118.30 BPN", 0.14, "Pelni"],
 ["pl-kdi", "Koridor Pelni Bau-Bau–Kendari", "pelni", "BAU @-4.60,122.80 KDI", 0.14, "Pelni"],
 ["pl-bit", "Koridor Pelni Makassar–Palu–Bitung", "pelni", "MKS @-3.30,118.70 @0.00,119.60 PNT @1.00,120.60 @1.60,124.50 BIT", 0.1, "Pelni"],
 ["pl-gto", "Koridor Pelni Bitung–Gorontalo", "pelni", "BIT @1.30,124.40 @0.70,123.90 GTO", 0.1, "Pelni"],
 ["pl-tte", "Koridor Pelni Bitung–Ternate–Sorong", "pelni", "BIT @1.20,126.40 TTE @0.40,127.00 @0.10,129.00 SOQ", 0.14, "Pelni"],
 ["pl-amb", "Koridor Pelni Ambon–Sorong (Maluku–Papua)", "pelni", "AMB @-3.40,128.00 @-2.80,130.00 @-1.30,131.00 SOQ", 0.14, "Pelni"],
 ["pl-pap", "Koridor Pelni Papua (Sorong–Manokwari–Biak–Jayapura)", "pelni", "SOQ @-0.40,132.50 MKW @-0.50,135.00 BIK @-1.00,138.00 DJJ", 0.14, "Pelni"],
 ["pl-kei", "Koridor Pelni Ambon–Tual–Saumlaki", "pelni", "AMB @-4.80,130.00 TUL @-6.70,132.20 SML", 0.07, "Pelni"],
 ["pl-mrk", "Koridor Pelni Tual–Merauke", "pelni", "TUL @-7.50,134.00 MRO", 0.07, "Pelni"],
 ["pl-ntb", "Koridor Pelni Surabaya–Bima–Waingapu", "pelni", "TPR @-7.50,114.60 @-8.80,115.80 @-8.40,117.50 BMA @-8.60,119.00 @-9.30,119.60 WGP", 0.14, "Pelni"],
 ["pl-ntt", "Koridor Pelni Labuan Bajo–Ende–Kupang", "pelni", "LBJ @-9.20,120.20 END @-9.80,122.50 KPG", 0.14, "Pelni"],
 ["pl-lrt", "Koridor Pelni Kupang–Larantuka", "pelni", "KPG @-9.60,123.10 LRT", 0.14, "Pelni"],
 ["pl-bpd", "Koridor Pelni Tanjung Pandan–Priok", "pelni", "TPD @-4.20,108.50 TPK", 0.1, "Pelni"],
 ["pl-sbl", "Koridor Pelni Sibolga–Gunungsitoli", "pelni", "SBL @1.55,98.10 GNS", 0.2, "Pelni"],
 ["pl-mtk", "Koridor Pelni Palembang–Muntok–Priok", "pelni", "PLG @-2.60,105.40 MTK", 0.14, "Pelni"],
 ["pl-bnn", "Koridor Pelni Batam–Tanjung Pinang–Pontianak", "pelni", "TPI @0.40,106.80 @-0.10,108.40 PNK", 0.1, "Pelni"],
 ["pl-trk", "Koridor Pelni Balikpapan–Tarakan–Nunukan", "pelni", "BPN @-0.50,118.30 @1.80,118.50 TRK NNK", 0.14, "Pelni"],
 ["pl-tkm", "Koridor Pelni Tarakan–Bitung", "pelni", "TRK @3.10,120.00 @2.00,123.50 BIT", 0.07, "Pelni"],
 ["pl-sbg", "Koridor Pelni Fakfak–Sorong", "pelni", "FKQ @-2.50,131.50 SOQ", 0.1, "Pelni"],
 ["pl-bnd", "Koridor Pelni Ambon–Fakfak", "pelni", "AMB @-3.60,129.50 @-3.30,131.20 FKQ", 0.07, "Pelni"]
];

/* gabungan zona waktu menurut provinsi (selain WIB) */
window.FR_WITA = ["Bali", "NTB", "NTT", "Kalimantan Timur", "Kalimantan Utara", "Kalimantan Selatan", "Sulawesi Selatan", "Sulawesi Tenggara", "Sulawesi Tengah", "Sulawesi Utara", "Gorontalo", "Sulawesi Barat"];
window.FR_WIT = ["Maluku", "Maluku Utara", "Papua", "Papua Barat", "Papua Barat Daya", "Papua Selatan", "Papua Tengah", "Papua Pegunungan"];
