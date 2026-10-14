/* ==========================================================================
   DATA BANDARA & RUTE PENERBANGAN DOMESTIK INDONESIA  (dipakai petaqu-pesawat.js)
   --------------------------------------------------------------------------
   CARA UPDATE (cukup edit file ini):
   1. BANDARA_DATA  -> 1 baris per bandara:
        [IATA, ICAO, nama bandara, kota/kabupaten, provinsi, lat, lng, zona waktu, kelas]
        zona waktu: 7 = WIB, 8 = WITA, 9 = WIT
        kelas: 1 = hub utama, 2 = bandara besar, 3 = bandara sedang, 4 = bandara kecil/perintis
   2. RUTE_DATA     -> 1 baris per bandara asal, diikuti daftar tujuan IATA
        (otomatis dua arah). Contoh:  "CGK: DPS SUB UPG"
   Catatan: jaringan rute bersifat INDIKATIF (pola umum maskapai niaga & perintis);
   jadwal & ketersediaan berubah tiap musim — selalu cek maskapai/pemesanan resmi.
   Pengguna juga bisa menambah rute/bandara sendiri dari menu "Data" di panel Pesawat.
   ========================================================================== */
window.BANDARA_DATA = [
  /* ---- Sumatera ---- */
  ["BTJ", "WITT", "Sultan Iskandar Muda", "Banda Aceh", "Aceh", 5.5235, 95.4204, 7, 2],
  ["LSW", "WITM", "Malikussaleh", "Lhokseumawe", "Aceh", 5.2267, 96.9503, 7, 4],
  ["MES", "WIMM", "Kualanamu", "Deli Serdang (Medan)", "Sumatera Utara", 3.6422, 98.8853, 7, 1],
  ["DTB", "WIMN", "Silangit", "Tapanuli Utara", "Sumatera Utara", 2.2597, 98.9919, 7, 3],
  ["PDG", "WIEE", "Minangkabau", "Padang Pariaman", "Sumatera Barat", -0.7869, 100.2808, 7, 2],
  ["PKU", "WIBB", "Sultan Syarif Kasim II", "Pekanbaru", "Riau", 0.4608, 101.4445, 7, 2],
  ["DUM", "WIBD", "Pinang Kampai", "Dumai", "Riau", 1.6092, 101.4336, 7, 4],
  ["BTH", "WIDD", "Hang Nadim", "Batam", "Kepulauan Riau", 1.121, 104.119, 7, 1],
  ["TNJ", "WIDN", "Raja Haji Fisabilillah", "Tanjungpinang", "Kepulauan Riau", 0.9225, 104.5324, 7, 3],
  ["DJB", "WIJJ", "Sultan Thaha", "Jambi", "Jambi", -1.638, 103.6444, 7, 2],
  ["PLM", "WIPP", "Sultan Mahmud Badaruddin II", "Palembang", "Sumatera Selatan", -2.8983, 104.6999, 7, 2],
  ["PGK", "WIPK", "Depati Amir", "Pangkalpinang", "Kep. Bangka Belitung", -2.1622, 106.139, 7, 3],
  ["TJQ", "WIKD", "H.A.S. Hanandjoeddin", "Tanjung Pandan (Belitung)", "Kep. Bangka Belitung", -2.7457, 107.7549, 7, 3],
  ["TKG", "WIAT", "Radin Inten II", "Bandar Lampung", "Lampung", -5.2423, 105.1789, 7, 3],
  ["BKS", "WIPL", "Fatmawati Soekarno", "Bengkulu", "Bengkulu", -3.8637, 102.339, 7, 3],
  /* ---- Jawa ---- */
  ["CGK", "WIII", "Soekarno-Hatta", "Tangerang (Jakarta)", "Banten", -6.1256, 106.6559, 7, 1],
  ["HLP", "WIHH", "Halim Perdanakusuma", "Jakarta Timur", "DKI Jakarta", -6.2661, 106.8907, 7, 3],
  ["BDO", "WICC", "Husein Sastranegara", "Bandung", "Jawa Barat", -6.9006, 107.5763, 7, 2],
  ["KJT", "WICA", "Kertajati", "Majalengka", "Jawa Barat", -6.6489, 108.1667, 7, 3],
  ["CBN", "WICD", "Cakrabhuwana", "Cirebon", "Jawa Barat", -6.7561, 108.54, 7, 4],
  ["SRG", "WARS", "Jenderal Ahmad Yani", "Semarang", "Jawa Tengah", -6.9714, 110.3742, 7, 2],
  ["SOC", "WARQ", "Adi Soemarmo", "Surakarta (Solo)", "Jawa Tengah", -7.516, 110.7569, 7, 2],
  ["PWL", "WIHL", "Jenderal Besar Soedirman", "Purbalingga", "Jawa Tengah", -7.4631, 109.3419, 7, 4],
  ["CXP", "WAHL", "Tunggul Wulung", "Cilacap", "Jawa Tengah", -7.645, 109.0339, 7, 4],
  ["YIA", "WAHI", "Yogyakarta International", "Kulon Progo", "DI Yogyakarta", -7.9007, 110.0572, 7, 1],
  ["JOG", "WAHH", "Adisutjipto", "Sleman (Yogyakarta)", "DI Yogyakarta", -7.7882, 110.4317, 7, 4],
  ["SUB", "WARR", "Juanda", "Sidoarjo (Surabaya)", "Jawa Timur", -7.3798, 112.7869, 7, 1],
  ["MLG", "WARA", "Abdul Rachman Saleh", "Malang", "Jawa Timur", -7.9266, 112.7145, 7, 3],
  ["BWX", "WADY", "Banyuwangi", "Banyuwangi", "Jawa Timur", -8.3102, 114.3408, 7, 3],
  /* ---- Bali & Nusa Tenggara ---- */
  ["DPS", "WADD", "I Gusti Ngurah Rai", "Badung (Denpasar)", "Bali", -8.7482, 115.1672, 8, 1],
  ["LOP", "WADL", "Zainuddin Abdul Madjid", "Lombok Tengah", "Nusa Tenggara Barat", -8.7573, 116.2767, 8, 2],
  ["SWQ", "WADS", "Sultan M. Kaharuddin III", "Sumbawa Besar", "Nusa Tenggara Barat", -8.489, 117.4122, 8, 4],
  ["BMU", "WADB", "Sultan M. Salahuddin", "Bima", "Nusa Tenggara Barat", -8.5396, 118.687, 8, 4],
  ["LBJ", "WATO", "Komodo", "Labuan Bajo", "Nusa Tenggara Timur", -8.4867, 119.889, 8, 2],
  ["TMC", "WATK", "Tambolaka", "Sumba Barat Daya", "Nusa Tenggara Timur", -9.4097, 119.2446, 8, 4],
  ["WGP", "WADW", "Umbu Mehang Kunda", "Waingapu (Sumba Timur)", "Nusa Tenggara Timur", -9.6692, 120.302, 8, 4],
  ["RTG", "WATG", "Frans Sales Lega", "Ruteng (Manggarai)", "Nusa Tenggara Timur", -8.597, 120.477, 8, 4],
  ["BJW", "WATB", "Soa", "Bajawa (Ngada)", "Nusa Tenggara Timur", -8.7071, 121.0566, 8, 4],
  ["ENE", "WATE", "H. Hasan Aroeboesman", "Ende", "Nusa Tenggara Timur", -8.8493, 121.6606, 8, 4],
  ["MOF", "WATC", "Frans Seda", "Maumere (Sikka)", "Nusa Tenggara Timur", -8.6407, 122.2369, 8, 4],
  ["KOE", "WATT", "El Tari", "Kupang", "Nusa Tenggara Timur", -10.1716, 123.6712, 8, 2],
  ["ABU", "WATA", "A.A. Bere Tallo", "Atambua (Belu)", "Nusa Tenggara Timur", -9.0745, 124.9047, 8, 4],
  /* ---- Kalimantan ---- */
  ["PNK", "WIOO", "Supadio", "Kubu Raya (Pontianak)", "Kalimantan Barat", -0.1507, 109.404, 7, 2],
  ["KTG", "WIOK", "Rahadi Oesman", "Ketapang", "Kalimantan Barat", -1.8167, 109.9634, 7, 4],
  ["SQG", "WIOS", "Pangsuma / Sintang", "Sintang", "Kalimantan Barat", 0.0636, 111.473, 7, 4],
  ["PKN", "WAOI", "Iskandar", "Pangkalan Bun", "Kalimantan Tengah", -2.7052, 111.6733, 7, 4],
  ["PKY", "WAGG", "Tjilik Riwut", "Palangka Raya", "Kalimantan Tengah", -2.225, 113.943, 7, 3],
  ["BDJ", "WAOO", "Syamsudin Noor", "Banjarbaru (Banjarmasin)", "Kalimantan Selatan", -3.4424, 114.7625, 8, 2],
  ["BPN", "WALL", "Sultan Aji Muhammad Sulaiman", "Balikpapan", "Kalimantan Timur", -1.2683, 116.8944, 8, 1],
  ["SRI", "WALS", "Aji Pangeran Tumenggung Pranoto", "Samarinda", "Kalimantan Timur", -0.3745, 117.2574, 8, 3],
  ["BEJ", "WALK", "Kalimarau", "Berau", "Kalimantan Timur", 2.1555, 117.4316, 8, 4],
  ["TRK", "WALR", "Juwata", "Tarakan", "Kalimantan Utara", 3.3267, 117.5656, 8, 3],
  ["NNX", "WRLF", "Nunukan", "Nunukan", "Kalimantan Utara", 4.1367, 117.6668, 8, 4],
  /* ---- Sulawesi ---- */
  ["UPG", "WAAA", "Sultan Hasanuddin", "Maros (Makassar)", "Sulawesi Selatan", -5.0617, 119.554, 8, 1],
  ["TTR", "WAWT", "Toraja", "Toraja Utara", "Sulawesi Selatan", -3.0447, 119.8228, 8, 4],
  ["MJU", "WAAJ", "Tampa Padang", "Mamuju", "Sulawesi Barat", -2.5303, 119.0278, 8, 4],
  ["PLW", "WAFF", "Mutiara SIS Al-Jufrie", "Palu", "Sulawesi Tengah", -0.9187, 119.9097, 8, 2],
  ["LUW", "WAFL", "Syukuran Aminuddin Amir", "Luwuk (Banggai)", "Sulawesi Tengah", -1.0389, 122.7727, 8, 4],
  ["PSJ", "WAFP", "Kasiguncu", "Poso", "Sulawesi Tengah", -1.4167, 120.6573, 8, 4],
  ["KDI", "WAWW", "Haluoleo", "Kendari", "Sulawesi Tenggara", -4.0816, 122.418, 8, 2],
  ["BUW", "WAWB", "Betoambari", "Baubau", "Sulawesi Tenggara", -5.4869, 122.5692, 8, 4],
  ["WNI", "WAWD", "Matahora", "Wakatobi", "Sulawesi Tenggara", -5.2878, 123.6262, 8, 4],
  ["GTO", "WAMG", "Jalaluddin", "Gorontalo", "Gorontalo", 0.6371, 122.8497, 8, 3],
  ["MDC", "WAMM", "Sam Ratulangi", "Manado", "Sulawesi Utara", 1.5493, 124.9259, 8, 2],
  /* ---- Maluku ---- */
  ["TTE", "WAMT", "Sultan Babullah", "Ternate", "Maluku Utara", 0.8314, 127.3801, 9, 3],
  ["AMQ", "WAPP", "Pattimura", "Ambon", "Maluku", -3.7103, 128.0891, 9, 2],
  ["LUV", "WAPL", "Karel Sadsuitubun", "Langgur (Maluku Tenggara)", "Maluku", -5.6616, 132.7316, 9, 4],
  ["DOB", "WAPD", "Rar Gwamar", "Dobo (Kep. Aru)", "Maluku", -5.7722, 134.2125, 9, 4],
  ["SXK", "WAPI", "Mathilda Batlayeri", "Saumlaki", "Maluku", -7.9886, 131.3059, 9, 4],
  /* ---- Papua ---- */
  ["SOQ", "WASS", "Domine Eduard Osok", "Sorong", "Papua Barat Daya", -0.9264, 131.1214, 9, 2],
  ["FKQ", "WASF", "Torea", "Fakfak", "Papua Barat", -2.9201, 132.2671, 9, 4],
  ["KNG", "WASK", "Utarom", "Kaimana", "Papua Barat", -3.6445, 133.6958, 9, 4],
  ["MKW", "WASR", "Rendani", "Manokwari", "Papua Barat", -0.8918, 134.049, 9, 3],
  ["BIK", "WABB", "Frans Kaisiepo", "Biak", "Papua", -1.19, 136.108, 9, 3],
  ["NBX", "WABI", "Douw Aturure", "Nabire", "Papua Tengah", -3.3682, 135.4964, 9, 4],
  ["DJJ", "WAJJ", "Sentani", "Jayapura", "Papua", -2.5769, 140.5163, 9, 2],
  ["TIM", "WABP", "Mozes Kilangin", "Timika", "Papua Tengah", -4.5283, 136.8874, 9, 3],
  ["WMX", "WAJW", "Wamena", "Jayawijaya", "Papua Pegunungan", -4.1025, 138.8423, 9, 4],
  ["MKQ", "WAKK", "Mopah", "Merauke", "Papua Selatan", -8.5203, 140.4183, 9, 3]
];

window.RUTE_DATA = [
  "CGK: BTJ MES DTB PDG PKU BTH TNJ DJB PLM PGK TJQ TKG BKS SRG SOC YIA SUB MLG BWX DPS LOP LBJ KOE PNK KTG PKN PKY BDJ BPN TRK SRI UPG KDI PLW MDC AMQ DJJ SOQ PWL JOG",
  "HLP: MES PWL SRG",
  "SUB: DPS LOP SWQ BMU LBJ KOE UPG BPN BDJ PNK PKY PKN SRI TRK MDC KDI PLW AMQ DJJ SOQ MKW BTH MES PLM DJB PKU YIA",
  "DPS: LOP SWQ BMU LBJ KOE UPG BPN BDJ SRG SOC YIA BDO KJT MLG MDC AMQ DJJ BTH MES",
  "YIA: BTH MES PLM PKU PNK BPN BDJ UPG",
  "SRG: BTH PNK PKN BPN BDJ",
  "SOC: BTH BPN",
  "BDO: BTH MES PKU PLM PNK BPN",
  "KJT: MES BTH",
  "BTH: MES BTJ PDG PKU DUM TNJ DJB PLM PNK UPG",
  "MES: LSW DTB BTJ PDG PKU",
  "PKU: DUM PDG",
  "PNK: KTG SQG PKN",
  "PKY: BDJ",
  "PKN: BDJ",
  "BDJ: BPN UPG",
  "BPN: SRI TRK BEJ UPG",
  "TRK: NNX BEJ SRI UPG",
  "LOP: SWQ BMU UPG",
  "UPG: BDJ KOE LBJ MDC GTO AMQ DJJ SOQ TTE TIM KDI PLW LUW MJU TTR BUW LOP",
  "KDI: WNI BUW",
  "PLW: LUW PSJ",
  "MDC: GTO TTE",
  "TTE: AMQ",
  "AMQ: SXK LUV DOB DJJ",
  "LUV: DOB",
  "KOE: ENE MOF WGP TMC ABU RTG BJW LBJ",
  "DJJ: BIK TIM MKQ NBX WMX",
  "BIK: MKW NBX",
  "MKW: SOQ UPG",
  "SOQ: FKQ KNG MKW",
  "FKQ: KNG",
  "KNG: TIM",
  "TIM: MKQ NBX UPG"
];
