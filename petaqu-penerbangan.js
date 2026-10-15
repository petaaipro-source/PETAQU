/* PETAQU Penerbangan — lapisan baru: pesawat LIVE (ADS-B), bandara internasional & nasional, jalur/rute penerbangan.
   Cerdas: jenis pesawat dikenali (ICAO type → nama + kategori), gerak mulus (dead-reckoning), jejak & jalur ke depan,
   prediksi tujuan/ETA, fase terbang, deteksi squawk darurat 7500/7600/7700, aktivitas per bandara, filter & pencarian.
   Sumber data: adsb.lol → airplanes.live → OpenSky (otomatis cadangan). Data komunitas, BUKAN untuk navigasi. */
(function () {
  "use strict";
  if (window.__pqFlightLayer) return; window.__pqFlightLayer = 1;
  const KEY = "petaqu_flight_v1", DEG = Math.PI / 180;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = m => { try { toast(m, 3000); } catch (e) { } };
  const gmap = () => { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } };
  const hav = (a, b, c, d) => { const x = Math.sin((c - a) * DEG / 2) ** 2 + Math.cos(a * DEG) * Math.cos(c * DEG) * Math.sin((d - b) * DEG / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const brg = (a, b, c, d) => { const y = Math.sin((d - b) * DEG) * Math.cos(c * DEG), x = Math.cos(a * DEG) * Math.sin(c * DEG) - Math.sin(a * DEG) * Math.cos(c * DEG) * Math.cos((d - b) * DEG); return (Math.atan2(y, x) / DEG + 360) % 360; };
  const DIR = ["U", "TL", "T", "TG", "S", "BD", "B", "BL"], dirOf = t => DIR[Math.round(((t % 360) + 360) % 360 / 45) % 8];

  let S = { on: false, ac: true, apI: true, apN: true, rtD: false, rtI: false, trail: false, col: "type", flt: "all", min: false, q: "" };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };

  /* ---------------- BANDARA: [IATA, ICAO, nama, kota, lat, lng, jenis] jenis: I=Internasional (RI), N=Nasional/domestik, X=luar negeri ---------------- */
  const AP_RAW = [
    ["CGK", "WIII", "Soekarno-Hatta", "Jakarta/Tangerang", -6.1256, 106.6559, "I"], ["HLP", "WIHH", "Halim Perdanakusuma", "Jakarta", -6.2666, 106.891, "I"],
    ["SUB", "WARR", "Juanda", "Surabaya", -7.3798, 112.7869, "I"], ["DPS", "WADD", "I Gusti Ngurah Rai", "Denpasar, Bali", -8.7482, 115.1672, "I"],
    ["KNO", "WIMM", "Kualanamu", "Medan", 3.6422, 98.8853, "I"], ["UPG", "WAAA", "Sultan Hasanuddin", "Makassar", -5.0617, 119.554, "I"],
    ["BPN", "WALL", "SAMS Sepinggan", "Balikpapan", -1.2683, 116.8945, "I"], ["PLM", "WIPP", "SM Badaruddin II", "Palembang", -2.8983, 104.6999, "I"],
    ["BTH", "WIDD", "Hang Nadim", "Batam", 1.121, 104.1187, "I"], ["PDG", "WIEE", "Minangkabau", "Padang", -0.7869, 100.2809, "I"],
    ["PKU", "WIBB", "Sultan Syarif Kasim II", "Pekanbaru", 0.4608, 101.4445, "I"], ["YIA", "WAHI", "Yogyakarta Int'l (YIA)", "Kulon Progo, DIY", -7.9007, 110.0573, "I"],
    ["SRG", "WAHS", "Ahmad Yani", "Semarang", -6.9714, 110.3742, "I"], ["SOC", "WAHQ", "Adi Soemarmo", "Solo/Boyolali", -7.516, 110.7569, "I"],
    ["BDO", "WICC", "Husein Sastranegara", "Bandung", -6.9006, 107.5763, "I"], ["KJT", "WICA", "Kertajati", "Majalengka", -6.6489, 108.1667, "I"],
    ["LOP", "WADL", "Zainuddin Abdul Madjid", "Lombok", -8.7573, 116.2767, "I"], ["BDJ", "WAOO", "Syamsudin Noor", "Banjarmasin", -3.4424, 114.7625, "I"],
    ["PNK", "WIOO", "Supadio", "Pontianak", -0.1507, 109.404, "I"], ["MDC", "WAMM", "Sam Ratulangi", "Manado", 1.5493, 124.9259, "I"],
    ["BIK", "WABB", "Frans Kaisiepo", "Biak", -1.19, 136.108, "I"], ["DJJ", "WAJJ", "Sentani", "Jayapura", -2.5769, 140.5163, "I"],
    ["AMQ", "WAPP", "Pattimura", "Ambon", -3.7103, 128.0891, "I"], ["KOE", "WATT", "El Tari", "Kupang", -10.1716, 123.671, "I"],
    ["BTJ", "WITT", "Sultan Iskandar Muda", "Banda Aceh", 5.5236, 95.4204, "I"], ["TNJ", "WIDN", "Raja Haji Fisabilillah", "Tanjungpinang", 0.9225, 104.532, "I"],
    ["TKG", "WILL", "Radin Inten II", "Bandar Lampung", -5.2423, 105.1789, "I"], ["MLG", "WARA", "Abdulrachman Saleh", "Malang", -7.9266, 112.7145, "I"],
    ["BWX", "WADY", "Banyuwangi", "Banyuwangi", -8.3103, 114.34, "I"], ["TRK", "WALR", "Juwata", "Tarakan", 3.3267, 117.5655, "I"],
    ["BEJ", "WALK", "Kalimarau", "Berau", 2.1555, 117.432, "N"], ["JOG", "WAHH", "Adisutjipto", "Yogyakarta", -7.7882, 110.4317, "N"],
    ["CXP", "", "Tunggul Wulung", "Cilacap", -7.6451, 109.034, "N"], ["PWL", "", "Jenderal Besar Soedirman", "Purbalingga", -7.464, 109.42, "N"],
    ["DHX", "", "Dhoho", "Kediri", -7.765, 112.181, "N"], ["JBI", "WIJJ", "Sultan Thaha", "Jambi", -1.638, 103.644, "N"],
    ["BKS", "WIPL", "Fatmawati Soekarno", "Bengkulu", -3.8637, 102.339, "N"], ["PGK", "WIPK", "Depati Amir", "Pangkalpinang", -2.162, 106.139, "N"],
    ["TJQ", "WIOD", "H.A.S. Hanandjoeddin", "Belitung", -2.746, 107.755, "N"], ["PKY", "WAGG", "Tjilik Riwut", "Palangka Raya", -2.225, 113.943, "N"],
    ["SMQ", "WAOS", "H. Asan", "Sampit", -2.499, 112.975, "N"], ["KTG", "WIOK", "Rahadi Oesman", "Ketapang", -1.8167, 109.964, "N"],
    ["SQG", "WIOS", "Susilo", "Sintang", 0.0636, 111.473, "N"], ["PSU", "WIOP", "Pangsuma", "Putussibau", 0.935, 112.937, "N"],
    ["BTW", "WAOC", "Bersujud", "Batulicin", -3.412, 115.995, "N"], ["SRI", "WALS", "Temindung", "Samarinda", -0.485, 117.157, "N"],
    ["AAP", "WALA", "APT Pranoto", "Samarinda", -0.373, 117.257, "N"], ["NNX", "WALV", "Nunukan", "Nunukan", 4.137, 117.667, "N"],
    ["TSX", "WALJ", "Tanjung Harapan", "Tanjung Selor", 2.836, 117.374, "N"], ["TTE", "WAEE", "Sultan Babullah", "Ternate", 0.8314, 127.3814, "N"],
    ["PLW", "WAFF", "Mutiara SIS Al-Jufri", "Palu", -0.9185, 119.9097, "N"], ["KDI", "WAWW", "Haluoleo", "Kendari", -4.0817, 122.4183, "N"],
    ["GTO", "WAMG", "Jalaluddin", "Gorontalo", 0.6371, 122.8498, "N"], ["LUW", "WAMW", "Syukuran Aminuddin Amir", "Luwuk", -1.039, 122.7728, "N"],
    ["MJU", "WAFJ", "Tampa Padang", "Mamuju", -2.5836, 119.054, "N"], ["MKW", "WAUU", "Rendani", "Manokwari", -0.8918, 134.049, "N"],
    ["SOQ", "WASS", "Domine Eduard Osok", "Sorong", -0.9264, 131.1211, "N"], ["TIM", "WAYY", "Moses Kilangin", "Timika", -4.5283, 136.8874, "N"],
    ["NBX", "WABI", "Douw Aturure", "Nabire", -3.368, 135.496, "N"], ["MKQ", "WAKK", "Mopah", "Merauke", -8.52, 140.418, "N"],
    ["WMX", "WAJW", "Wamena", "Wamena", -4.102, 138.942, "N"], ["ZRI", "WABO", "Stevanus Rumbewas", "Serui", -1.875, 136.242, "N"],
    ["LBJ", "WATO", "Komodo", "Labuan Bajo", -8.4865, 119.889, "N"], ["MOF", "WATC", "Frans Seda", "Maumere", -8.6407, 122.237, "N"],
    ["ENE", "WATE", "H. Hasan Aroeboesman", "Ende", -8.8493, 121.661, "N"], ["WGP", "WATW", "Umbu Mehang Kunda", "Waingapu", -9.669, 120.302, "N"],
    ["TMC", "WATK", "Tambolaka", "Sumba Barat Daya", -9.409, 119.245, "N"], ["BMU", "WADB", "Sultan M. Salahuddin", "Bima", -8.5396, 118.687, "N"],
    ["SWQ", "WADS", "Sultan Muhammad Kaharuddin", "Sumbawa", -8.489, 117.412, "N"], ["NDA", "WAPC", "Bandaneira", "Banda Neira", -4.521, 129.905, "N"],
    ["LUV", "WAPL", "Dumatubun", "Langgur/Tual", -5.66, 132.731, "N"], ["DOB", "WAPD", "Rar Gwamar", "Dobo", -5.769, 134.212, "N"],
    ["GNS", "WIMB", "Binaka", "Gunungsitoli", 1.166, 97.704, "N"], ["AEG", "WIMP", "Aek Godang", "Padang Sidempuan", 1.4, 99.43, "N"],
    ["DUM", "WIBD", "Pinang Kampai", "Dumai", 1.609, 101.433, "N"], ["SBG", "WITB", "Maimun Saleh", "Sabang", 5.874, 95.339, "N"],
    ["LSW", "WITM", "Malikussaleh", "Lhokseumawe", 5.2267, 96.95, "N"], ["PCB", "WIHP", "Pondok Cabe", "Tangerang Selatan", -6.3367, 106.765, "N"],
    ["SIN", "WSSS", "Changi", "Singapura", 1.3644, 103.9915, "X"], ["KUL", "WMKK", "Kuala Lumpur Int'l", "Malaysia", 2.7456, 101.7099, "X"],
    ["PEN", "WMKP", "Penang Int'l", "Malaysia", 5.2971, 100.277, "X"], ["BKI", "WBKK", "Kota Kinabalu", "Malaysia", 5.9372, 116.0511, "X"],
    ["KCH", "WBGG", "Kuching", "Malaysia", 1.4847, 110.3469, "X"], ["BWN", "WBSB", "Brunei Int'l", "Brunei", 4.9442, 114.9283, "X"],
    ["DIL", "WPDL", "Presidente Nicolau Lobato", "Dili, Timor-Leste", -8.5467, 125.5247, "X"], ["DRW", "YPDN", "Darwin", "Australia", -12.4147, 130.877, "X"],
    ["PER", "YPPH", "Perth", "Australia", -31.9403, 115.967, "X"], ["BKK", "VTBS", "Suvarnabhumi", "Bangkok", 13.69, 100.7501, "X"],
    ["HKG", "VHHH", "Hong Kong Int'l", "Hong Kong", 22.3089, 113.9146, "X"], ["ICN", "RKSI", "Incheon", "Seoul", 37.4602, 126.4407, "X"],
    ["TPE", "RCTP", "Taoyuan", "Taipei", 25.0777, 121.2328, "X"], ["JED", "OEJN", "King Abdulaziz", "Jeddah", 21.6796, 39.1565, "X"],
    ["DXB", "OMDB", "Dubai Int'l", "Dubai", 25.2528, 55.3644, "X"]
  ];
  const APT = AP_RAW.map(r => ({ iata: r[0], icao: r[1], name: r[2], city: r[3], lat: r[4], lng: r[5], t: r[6] }));
  const API = {}; APT.forEach(p => API[p.iata] = p);
  const AP_T = { I: ["Internasional", "#f59e0b"], N: ["Nasional", "#a78bfa"], X: ["Internasional (luar negeri)", "#fb7185"] };

  /* ---------------- RUTE populer (jalur penerbangan terjadwal) ---------------- */
  const RT_D = ("CGK-DPS CGK-SUB CGK-KNO CGK-UPG CGK-BPN CGK-PLM CGK-PDG CGK-PKU CGK-BTH CGK-BDJ CGK-PNK CGK-MDC CGK-YIA CGK-SOC CGK-SRG CGK-LOP CGK-AMQ CGK-DJJ CGK-KOE CGK-BTJ CGK-TKG CGK-PGK CGK-BKS CGK-JBI CGK-TNJ CGK-MLG CGK-KDI CGK-PLW CGK-TTE CGK-SOQ CGK-BIK CGK-TIM CGK-PKY CGK-TRK CGK-LBJ CGK-BWX " +
    "SUB-DPS SUB-UPG SUB-BPN SUB-BDJ SUB-LOP SUB-KOE SUB-MDC SUB-AMQ SUB-DJJ SUB-BTH SUB-PKU SUB-KNO SUB-PLM SUB-LBJ DPS-LOP DPS-UPG DPS-LBJ DPS-KOE DPS-BPN DPS-YIA DPS-SRG DPS-BTH DPS-KNO DPS-BDJ UPG-MDC UPG-AMQ UPG-DJJ UPG-KDI UPG-PLW UPG-SOQ UPG-BPN UPG-BIK UPG-TTE AMQ-DJJ DJJ-BIK DJJ-TIM " +
    "KNO-BTH KNO-PDG KNO-BTJ KNO-PKU KNO-PLM KNO-DPS BTH-PKU BTH-PDG BTH-PLM SRG-BPN SOC-BPN YIA-BPN SRG-BTH BDO-BPN KJT-DPS KJT-UPG").split(" ");
  const RT_I = ("CGK-SIN CGK-KUL CGK-JED CGK-HKG CGK-ICN CGK-BKK CGK-PER CGK-DXB DPS-SIN DPS-KUL DPS-PER DPS-HKG DPS-DRW DPS-ICN SUB-SIN SUB-KUL SUB-JED KNO-SIN KNO-KUL KNO-PEN BTH-SIN BTH-KUL PNK-KCH PNK-KUL MDC-HKG DIL-DPS DIL-DRW KOE-DIL KOE-DRW YIA-KUL YIA-SIN SRG-SIN BDO-SIN BDO-KUL SOC-KUL BPN-KUL UPG-KUL TPE-CGK BKI-BPN BWN-BPN").split(" ");

  /* ---------------- JENIS PESAWAT: kode ICAO → [nama, kategori] ---------------- */
  const CATN = { wb: "Jet berbadan lebar", nb: "Jet berbadan sempit", rj: "Jet regional", tp: "Turboprop", bj: "Jet bisnis", hl: "Helikopter", ga: "Pesawat ringan", mil: "Militer", unk: "Tidak diketahui" };
  const CATC = { wb: "#f472b6", nb: "#38bdf8", rj: "#34d399", tp: "#fbbf24", bj: "#c084fc", hl: "#a3e635", ga: "#e2e8f0", mil: "#f87171", unk: "#94a3b8" };
  const SZ = { wb: 32, nb: 26, rj: 22, tp: 22, bj: 20, hl: 22, ga: 17, mil: 26, unk: 20 };
  const TYD = {};
  (function (d) { Object.keys(d).forEach(c => d[c].split("|").forEach(x => { const p = x.split(":"); TYD[p[0]] = [p[1], c]; })); })({
    wb: "A332:Airbus A330-200|A333:Airbus A330-300|A338:Airbus A330-800neo|A339:Airbus A330-900neo|A359:Airbus A350-900|A35K:Airbus A350-1000|A388:Airbus A380-800|A306:Airbus A300-600|A310:Airbus A310|A343:Airbus A340-300|A346:Airbus A340-600|B744:Boeing 747-400|B748:Boeing 747-8|B74F:Boeing 747 Freighter|B762:Boeing 767-200|B763:Boeing 767-300|B764:Boeing 767-400|B772:Boeing 777-200|B77L:Boeing 777-200LR|B773:Boeing 777-300|B77W:Boeing 777-300ER|B77F:Boeing 777 Freighter|B778:Boeing 777-8|B779:Boeing 777-9|B788:Boeing 787-8 Dreamliner|B789:Boeing 787-9 Dreamliner|B78X:Boeing 787-10 Dreamliner|MD11:McDonnell Douglas MD-11|DC10:McDonnell Douglas DC-10|IL76:Ilyushin Il-76|A124:Antonov An-124",
    nb: "A318:Airbus A318|A319:Airbus A319|A320:Airbus A320|A321:Airbus A321|A19N:Airbus A319neo|A20N:Airbus A320neo|A21N:Airbus A321neo|B731:Boeing 737-100|B732:Boeing 737-200|B733:Boeing 737-300|B734:Boeing 737-400|B735:Boeing 737-500|B736:Boeing 737-600|B737:Boeing 737-700|B738:Boeing 737-800|B739:Boeing 737-900|B37M:Boeing 737 MAX 7|B38M:Boeing 737 MAX 8|B39M:Boeing 737 MAX 9|B3XM:Boeing 737 MAX 10|B752:Boeing 757-200|B753:Boeing 757-300|B712:Boeing 717|MD82:MD-82|MD83:MD-83|MD87:MD-87|MD88:MD-88|MD90:MD-90|BCS1:Airbus A220-100|BCS3:Airbus A220-300|SU95:Sukhoi Superjet 100|C919:COMAC C919",
    rj: "E170:Embraer 170|E175:Embraer 175|E75L:Embraer 175|E75S:Embraer 175|E190:Embraer 190|E195:Embraer 195|E290:Embraer E190-E2|E295:Embraer E195-E2|E145:Embraer ERJ-145|E135:Embraer ERJ-135|CRJ2:Bombardier CRJ-200|CRJ7:Bombardier CRJ-700|CRJ9:Bombardier CRJ-900|CRJX:Bombardier CRJ-1000|AJ27:COMAC ARJ21|F100:Fokker 100|F70:Fokker 70|RJ85:Avro RJ85|BAE146:BAe 146",
    tp: "AT72:ATR 72|AT75:ATR 72-500|AT76:ATR 72-600|AT45:ATR 42-500|AT46:ATR 42-600|AT43:ATR 42|DH8D:De Havilland Dash 8 Q400|DH8C:Dash 8-300|DH8B:Dash 8-200|DH8A:Dash 8-100|SF34:Saab 340|JS41:Jetstream 41|JS32:Jetstream 32|B190:Beechcraft 1900|C208:Cessna 208 Caravan|PC12:Pilatus PC-12|BE20:King Air 200|BE9L:King Air 90|BE99:Beech 99|DHC6:Twin Otter|DHC7:Dash 7|D328:Dornier 328|AN26:Antonov An-26|AN24:Antonov An-24|MA60:Xian MA60|CN35:CASA CN-235|C295:CASA C-295|SW4:Fairchild Metroliner|TBM9:Daher TBM 900|TBM8:Daher TBM 850|P46T:Piper Malibu Meridian|AC90:Aero Commander 690",
    bj: "C25A:Citation CJ2|C25B:Citation CJ3|C25C:Citation CJ4|C510:Citation Mustang|C525:Citation CJ1|C550:Citation II|C560:Citation V|C56X:Citation Excel|C680:Citation Sovereign|C68A:Citation Latitude|C700:Citation Longitude|C750:Citation X|GLF4:Gulfstream IV|GLF5:Gulfstream V|GLF6:Gulfstream G650|GL5T:Bombardier Global 5000|GL6T:Bombardier Global 6000|GL7T:Bombardier Global 7500|GLEX:Bombardier Global Express|CL30:Challenger 300|CL35:Challenger 350|CL60:Challenger 600|FA7X:Falcon 7X|FA8X:Falcon 8X|F2TH:Falcon 2000|F900:Falcon 900|LJ35:Learjet 35|LJ45:Learjet 45|LJ60:Learjet 60|H25B:Hawker 800|E55P:Phenom 300|E50P:Phenom 100|PC24:Pilatus PC-24|HDJT:HondaJet",
    hl: "H60:Sikorsky UH-60 Black Hawk|S76:Sikorsky S-76|S92:Sikorsky S-92|EC35:Airbus H135|EC45:Airbus H145|EC30:Airbus H130|AS50:Airbus AS350|AS55:Airbus AS355|AS65:Airbus AS365 Dauphin|EC20:Airbus H120|EC55:Airbus H155|EC25:Airbus H225|B06:Bell 206|B407:Bell 407|B412:Bell 412|B429:Bell 429|B505:Bell 505|A109:Agusta A109|A139:AW139|A169:AW169|R44:Robinson R44|R66:Robinson R66|R22:Robinson R22|MI8:Mil Mi-8|H500:MD 500|B105:Bo 105|BK17:BK 117|NH90:NH90",
    ga: "C172:Cessna 172|C182:Cessna 182|C152:Cessna 152|C150:Cessna 150|C206:Cessna 206|C210:Cessna 210|C177:Cessna 177|P28A:Piper Cherokee|PA28:Piper Cherokee|PA34:Piper Seneca|PA46:Piper Malibu|SR20:Cirrus SR20|SR22:Cirrus SR22|DA40:Diamond DA40|DA42:Diamond DA42|DA62:Diamond DA62|BE36:Beech Bonanza|BE58:Beech Baron|M20P:Mooney M20|G115:Grob G115|AA5:Grumman Tiger|TB20:Socata TB20|PA18:Piper Super Cub|AT3T:Air Tractor|GA8:Airvan GA8",
    mil: "C130:C-130 Hercules|C30J:C-130J Super Hercules|C17:C-17 Globemaster III|A400:Airbus A400M|K35R:KC-135 Stratotanker|KC10:KC-10 Extender|P8:Boeing P-8 Poseidon|B52:B-52 Stratofortress|F16:F-16 Fighting Falcon|F18:F/A-18 Hornet|F35:F-35 Lightning II|SU27:Sukhoi Su-27|SU30:Sukhoi Su-30|T50:KAI T-50 Golden Eagle|HAWK:BAE Hawk|E3TF:E-3 Sentry|E737:Boeing 737 AEW&C|CN23:CASA C-212"
  });
  const AIRL = { GIA: "Garuda Indonesia", LNI: "Lion Air", BTK: "Batik Air", CTV: "Citilink", SJY: "Sriwijaya Air", AWQ: "Indonesia AirAsia", WON: "Wings Air", PAS: "Pelita Air", SJV: "Super Air Jet", TNU: "TransNusa", SMI: "SMAC", SUS: "Susi Air", TGN: "Trigana Air", IDX: "Indonesia AirAsia X", AXM: "AirAsia Malaysia", XAX: "AirAsia X", MAS: "Malaysia Airlines", SIA: "Singapore Airlines", SLK: "SilkAir", TGW: "Scoot", JSA: "Jetstar Asia", QFA: "Qantas", VOZ: "Virgin Australia", UAE: "Emirates", QTR: "Qatar Airways", SVA: "Saudia", ETD: "Etihad", CPA: "Cathay Pacific", THA: "Thai Airways", AIQ: "Thai AirAsia", JAL: "Japan Airlines", ANA: "ANA", KAL: "Korean Air", EVA: "EVA Air", CAL: "China Airlines", CES: "China Eastern", CSN: "China Southern", CCA: "Air China", KLM: "KLM", BAW: "British Airways", FDX: "FedEx", UPS: "UPS", GTI: "Atlas Air", CKS: "Kalitta Air", DHK: "DHL Air", BCS: "DHL (EAT)", TVJ: "Thai Vietjet", VJC: "VietJet", HVN: "Vietnam Airlines", PAL: "Philippine Airlines", CEB: "Cebu Pacific", RBA: "Royal Brunei", GFA: "Gulf Air", OMA: "Oman Air", AIC: "Air India", IGO: "IndiGo", ETH: "Ethiopian", TUR: "Turkish Airlines", ACA: "Air Canada" };

  /* ---------------- STATE ---------------- */
  const AC = new Map(); let M, gAc, gAp, gRt, gTr, gSel, P, st = {}, pollT = 0, tickT = 0, selId = null, follow = null, lastOk = 0, polling = false, errN = 0, src = "", warnMulti = false;

  const catOf = a => a.mil ? "mil" : (TYD[a.t] ? TYD[a.t][1] : ({ A7: "hl", A5: "wb", A4: "nb", A3: "nb", A2: "rj", A1: "ga", B1: "ga", B2: "ga", B6: "ga" }[a.ecat] || "unk"));
  const tyName = a => TYD[a.t] ? TYD[a.t][0] : (a.t ? a.t : "Tidak diketahui");
  const airline = cs => { const m = /^([A-Z]{3})\d/.exec(cs || ""); return m && AIRL[m[1]] ? AIRL[m[1]] : ""; };
  const fmtAlt = a => a.gnd ? "Di darat" : (a.alt >= 18000 ? "FL" + String(Math.round(a.alt / 100)).padStart(3, "0") : Math.round(a.alt).toLocaleString("id-ID") + " ft");
  const altCol = a => a.gnd ? "#94a3b8" : "hsl(" + Math.round(30 + Math.max(0, Math.min(1, a.alt / 42000)) * 210) + " 90% 58%)";
  const colOf = a => S.col === "alt" ? altCol(a) : (CATC[a.cat] || CATC.unk);
  const phase = a => a.gnd ? "Di darat" : a.vr > 400 ? "Menanjak" : a.vr < -400 ? "Turun" : a.alt < 3000 ? "Terbang rendah" : "Jelajah / level";

  /* ---------------- PREDIKSI TUJUAN (cerdas) ---------------- */
  function predict(a) {
    const out = { near: null, nearD: 1e9, mode: "", ap: null, dist: 0, eta: 0 };
    for (const p of APT) { const d = hav(a.lat, a.lon, p.lat, p.lng); if (d < out.nearD) { out.nearD = d; out.near = p; } }
    if (a.gnd || !(a.gs > 30)) return out;
    if (a.alt < 9000 && a.vr > 300 && out.nearD < 30) { out.mode = "Baru lepas landas dari"; out.ap = out.near; out.dist = out.nearD; return out; }
    const landing = a.alt < 10000 && a.vr < -300; let best = null;
    for (const p of APT) {
      const d = hav(a.lat, a.lon, p.lat, p.lng); if (d < 3 || d > (landing ? 150 : 900)) continue;
      const dd = Math.abs(((brg(a.lat, a.lon, p.lat, p.lng) - a.trk + 540) % 360) - 180);
      if (dd > 80) continue;
      const cross = Math.abs(d * Math.sin(dd * DEG)), along = d * Math.cos(dd * DEG);
      if (along <= 0 || cross > (landing ? 22 : 40) || (!landing && along < 40)) continue;
      const sc = cross + along * (landing ? 0.05 : 0.01); if (!best || sc < best.sc) best = { sc, p, along };
    }
    if (best) { out.mode = landing ? "Sedang mendarat di" : "Kemungkinan menuju"; out.ap = best.p; out.dist = best.along; out.eta = best.along / (a.gs * 1.852) * 60; }
    return out;
  }

  /* ---------------- DATA ---------------- */
  async function getJSON(u, ms) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 9000); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } finally { clearTimeout(t); } }
  function norm(o) {
    const lat = o.lat, lon = o.lon; if (typeof lat !== "number" || typeof lon !== "number") return null;
    if (o.seen_pos != null && o.seen_pos > 60) return null;
    const gnd = o.alt_baro === "ground" || o.gnd === true;
    return { id: o.hex || o.icao24, cs: (o.flight || "").trim(), reg: o.r || "", t: o.t || "", lat, lon, alt: gnd ? 0 : (typeof o.alt_baro === "number" ? o.alt_baro : (o.alt_geom || 0)), gnd, gs: o.gs || 0, trk: o.track != null ? o.track : (o.true_heading || 0), vr: o.baro_rate != null ? o.baro_rate : (o.geom_rate || 0), sq: o.squawk || "", mil: !!(o.dbFlags & 1), ecat: o.category || "" };
  }
  function centers(m) {
    const b = m.getBounds(), c = m.getCenter(), w = hav(c.lat, b.getWest(), c.lat, b.getEast()), h = hav(b.getSouth(), c.lng, b.getNorth(), c.lng);
    const rNm = Math.ceil(hav(c.lat, c.lng, b.getNorth(), b.getEast()) / 1.852);
    if (rNm <= 250) return { pts: [[c.lat, c.lng, Math.max(15, rNm)]], full: true };
    let cols = Math.ceil(w / 600), rows = Math.ceil(h / 600), full = true; if (cols * rows > 6) { cols = Math.min(cols, 3); rows = Math.min(rows, 2); full = false; }
    const pts = []; for (let i = 0; i < cols; i++)for (let j = 0; j < rows; j++) pts.push([b.getSouth() + (b.getNorth() - b.getSouth()) * (j + .5) / rows, b.getWest() + (b.getEast() - b.getWest()) * (i + .5) / cols, 250]);
    return { pts, full };
  }
  async function fetchAll() {
    const m = gmap(), cs = centers(m); warnMulti = !cs.full;
    const mk = base => Promise.all(cs.pts.map(p => getJSON(base + p[0].toFixed(3) + "/" + p[1].toFixed(3) + "/" + Math.round(p[2])).then(j => j.ac || j.aircraft || [])));
    const tries = [
      ["adsb.lol", () => mk("https://api.adsb.lol/v2/point/")],
      ["airplanes.live", () => mk("https://api.airplanes.live/v2/point/")],
      ["OpenSky", async () => { const b = m.getBounds(); const j = await getJSON("https://opensky-network.org/api/states/all?lamin=" + b.getSouth().toFixed(2) + "&lomin=" + b.getWest().toFixed(2) + "&lamax=" + b.getNorth().toFixed(2) + "&lomax=" + b.getEast().toFixed(2), 12000); return [(j.states || []).map(s => ({ hex: s[0], flight: s[1], lon: s[5], lat: s[6], alt_baro: s[8] ? "ground" : (s[7] != null ? s[7] * 3.28084 : 0), gs: (s[9] || 0) * 1.94384, track: s[10] || 0, baro_rate: (s[11] || 0) * 196.85, squawk: s[14], category: s[17] === 8 ? "A7" : "" }))]; }]
    ];
    let lastE; for (const t of tries) { try { const parts = await t[1](); const seen = new Map(); parts.forEach(arr => arr.forEach(o => { const n = norm(o); if (n && n.id && !seen.has(n.id)) seen.set(n.id, n); })); if (seen.size || t[0] === "OpenSky") { src = t[0]; return [...seen.values()]; } } catch (e) { lastE = e; } }
    throw lastE || new Error("semua sumber gagal");
  }
  async function poll() {
    if (polling || !S.on || !S.ac || document.hidden) return; polling = true; setStatus("memuat…", "#fbbf24");
    try {
      let list = await fetchAll(); const c = gmap().getCenter();
      if (list.length > 700) { list.forEach(a => a.d = hav(c.lat, c.lng, a.lat, a.lon)); list.sort((x, y) => x.d - y.d); list = list.slice(0, 700); }
      const now = Date.now(), ids = new Set();
      list.forEach(n => {
        ids.add(n.id); let a = AC.get(n.id);
        if (!a) { a = { id: n.id, tr: [], miss: 0 }; AC.set(n.id, a); }
        Object.assign(a, n, { bl: n.lat, bo: n.lon, t0: now, miss: 0 }); a.cat = catOf(a); a.emg = /^7[567]00$/.test(a.sq) && a.sq !== "7000";
        const L0 = a.tr[a.tr.length - 1]; if (!L0 || hav(L0[0], L0[1], n.lat, n.lon) > 0.3) { a.tr.push([n.lat, n.lon]); if (a.tr.length > 60) a.tr.shift(); }
      });
      AC.forEach((a, id) => { if (!ids.has(id) && ++a.miss > 2) drop(id); });
      lastOk = now; errN = 0; sync(); setStatus(AC.size + " pesawat", "#34d399"); stats();
    } catch (e) { errN++; setStatus("gagal memuat (" + (e && e.message || e) + ")", "#f87171"); }
    polling = false;
  }
  function drop(id) { const a = AC.get(id); if (!a) return; try { if (a.mk) gAc.removeLayer(a.mk); if (a.tl) gTr.removeLayer(a.tl); } catch (e) { } AC.delete(id); if (selId === id) clearSel(); }

  /* ---------------- MARKER PESAWAT ---------------- */
  const PLANE = '<svg viewBox="0 0 24 24"><path fill="currentColor" stroke="#04121a" stroke-width=".9" stroke-linejoin="round" d="M12 1.5c.9 0 1.6.8 1.6 1.8V9l8.4 5.2v2.1l-8.4-2.6v4.7l2.2 1.7V22L12 21l-3.8 1v-1.4l2.2-1.7v-4.7L2 16.3v-2.1L10.4 9V3.3c0-1 .7-1.8 1.6-1.8z"/></svg>';
  const HELI = '<svg viewBox="0 0 24 24"><g stroke="#04121a" stroke-width=".8"><ellipse cx="12" cy="11" rx="3.6" ry="5" fill="currentColor"/><rect x="11.2" y="15" width="1.6" height="7" fill="currentColor"/></g><path d="M2.5 9.5h19M4 4l16 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const rotOf = a => (a.trk || 0) - (M && M.getBearing ? M.getBearing() : 0);
  function mkIcon(a) { const s = SZ[a.cat] || 20; return L.divIcon({ className: "pqfl-acw", iconSize: [s, s], iconAnchor: [s / 2, s / 2], html: '<div class="pqfl-ac' + (a.emg ? " pqfl-emg" : "") + '" style="width:' + s + "px;height:" + s + "px;color:" + colOf(a) + ";transform:rotate(" + rotOf(a) + 'deg)">' + (a.cat === "hl" ? HELI : PLANE) + "</div>" }); }
  function match(a) {
    if (S.flt !== "all" && (S.flt === "emg" ? !a.emg : S.flt === "rj" ? !(a.cat === "rj" || a.cat === "tp") : a.cat !== S.flt)) return false;
    const q = (S.q || "").trim().toUpperCase(); if (q && !(a.cs.toUpperCase().includes(q) || a.reg.toUpperCase().includes(q) || a.t.toUpperCase().includes(q) || tyName(a).toUpperCase().includes(q) || airline(a.cs).toUpperCase().includes(q))) return false;
    return true;
  }
  function sync() {
    if (!M) return;
    AC.forEach(a => {
      const ok = S.ac && match(a);
      if (ok) {
        if (!a.mk) {
          a.mk = L.marker([a.lat, a.lon], { icon: mkIcon(a), pane: "pqAcPane", keyboard: false, riseOnHover: true }); a.mk._a = a;
          a.mk.on("click", () => selectAc(a.id)); a.mk.bindPopup(() => popAc(a), { className: "pqfl-pop", maxWidth: 310, autoPan: false });
          a.mk.on("popupopen", () => { selId = a.id; drawSel(); }); a.mk.on("popupclose", () => { if (selId === a.id && follow !== a.id) clearSel(); });
        }
        if (!a.shown) { gAc.addLayer(a.mk); a.shown = 1; }
        paint(a);
      } else if (a.mk && a.shown) { gAc.removeLayer(a.mk); a.shown = 0; }
      trail(a, ok);
    });
  }
  function paint(a) { const el = a.mk && a.mk._icon && a.mk._icon.firstChild; if (!el) return; el.style.transform = "rotate(" + rotOf(a) + "deg)"; el.style.color = colOf(a); el.classList.toggle("pqfl-emg", !!a.emg); }
  function trail(a, vis) {
    if (S.trail && vis && a.tr.length > 1 && gTr.getLayers().length < 300) { if (!a.tl) { a.tl = L.polyline(a.tr, { pane: "pqTrPane", color: colOf(a), weight: 1.6, opacity: .65, interactive: false }); gTr.addLayer(a.tl); } else { a.tl.setLatLngs(a.tr); a.tl.setStyle({ color: colOf(a) }); } }
    else if (a.tl) { gTr.removeLayer(a.tl); a.tl = null; }
  }
  /* dead-reckoning 1 Hz: gerak mulus antar pembaruan data */
  function tick() {
    if (!M || !S.on) return; const now = Date.now();
    AC.forEach(a => {
      if (!a.shown || !(a.gs > 25)) return; const dt = Math.min(40, (now - a.t0) / 1000), dk = a.gs * 1.852 / 3600 * dt, tr = (a.trk || 0) * DEG;
      a.lat = a.bl + dk * Math.cos(tr) / 111.32; a.lon = a.bo + dk * Math.sin(tr) / (111.32 * Math.cos(a.bl * DEG)); a.mk.setLatLng([a.lat, a.lon]);
    });
    if (selId) { const a = AC.get(selId); if (a) { if (follow === selId && a.shown) M.panTo([a.lat, a.lon], { animate: true, duration: .9, easeLinearity: 1 }); if (a.mk && a.mk.isPopupOpen() && now % 3 < 1.2) a.mk.getPopup().setContent(popAc(a)); drawSel(); } }
    if (now - lastOk > 45000 && S.ac && !polling) setStatus("data tertunda >45 dtk", "#fbbf24");
  }
  function drawSel() {
    gSel.clearLayers(); const a = AC.get(selId); if (!a) return;
    if (a.tr.length > 1) gSel.addLayer(L.polyline(a.tr.concat([[a.lat, a.lon]]), { pane: "pqTrPane", color: "#22d3ee", weight: 2.4, opacity: .9, interactive: false }));
    if (a.gs > 40 && !a.gnd) {
      const pr = predict(a), pts = [[a.lat, a.lon]], km = Math.min(a.gs * 1.852 * 0.33, 260), tr = a.trk * DEG;
      for (let k = 1; k <= 8; k++) { const d = km * k / 8; pts.push([a.lat + d * Math.cos(tr) / 111.32, a.lon + d * Math.sin(tr) / (111.32 * Math.cos(a.lat * DEG))]); }
      gSel.addLayer(L.polyline(pts, { pane: "pqTrPane", color: "#facc15", weight: 2, opacity: .9, dashArray: "2 7", interactive: false }));
      if (pr.ap && /menuju|mendarat/.test(pr.mode)) gSel.addLayer(L.polyline(arc([a.lat, a.lon], [pr.ap.lat, pr.ap.lng], 20), { pane: "pqTrPane", color: "#34d399", weight: 1.4, opacity: .8, dashArray: "6 6", interactive: false }));
    }
  }
  function clearSel() { selId = null; follow = null; if (gSel) gSel.clearLayers(); }
  function selectAc(id, fly) { const a = AC.get(id); if (!a) return; selId = id; if (fly && M) { M.setView([a.lat, a.lon], Math.max(M.getZoom(), 9)); } if (a.mk) { if (!a.shown) { gAc.addLayer(a.mk); a.shown = 1; } a.mk.openPopup(); } drawSel(); }
  window.__pqflFollow = id => { const a = AC.get(id); if (!a) return; follow = follow === id ? null : id; selId = id; say(follow ? "Mengikuti " + (a.cs || a.id) : "Berhenti mengikuti"); if (a.mk && a.mk.isPopupOpen()) a.mk.getPopup().setContent(popAc(a)); };
  window.__pqflGo = id => selectAc(id, true);
  window.__pqflApt = i => { const p = API[i]; if (p && M) { M.setView([p.lat, p.lng], 12); } };

  function popAc(a) {
    const pr = predict(a), col = CATC[a.cat] || "#94a3b8", al = airline(a.cs), kmh = Math.round(a.gs * 1.852);
    const row = (k, v) => '<div class="pqfl-r"><span>' + k + "</span><b>" + v + "</b></div>";
    const eta = pr.ap && pr.eta ? ", ±" + Math.max(1, Math.round(pr.eta)) + " mnt" : "";
    return '<div class="pqfl-ph"><div><b class="pqfl-cs">' + esc(a.cs || a.id.toUpperCase()) + "</b>" + (al ? '<small>' + esc(al) + "</small>" : "") + '</div><span class="pqfl-chip" style="background:' + col + '22;color:' + col + ';border-color:' + col + '66">' + esc(CATN[a.cat]) + "</span></div>" +
      (a.emg ? '<div class="pqfl-alert">⚠ SQUAWK ' + esc(a.sq) + " — " + ({ "7500": "Pembajakan", "7600": "Gangguan radio", "7700": "Darurat umum" }[a.sq] || "") + "</div>" : "") +
      row("Jenis", esc(tyName(a)) + (a.t ? " <i>(" + esc(a.t) + ")</i>" : "")) + (a.reg ? row("Registrasi", esc(a.reg) + (/^PK-/.test(a.reg) ? " 🇮🇩" : "")) : "") +
      row("Ketinggian", fmtAlt(a) + (a.gnd ? "" : " <i>(" + Math.round(a.alt * 0.3048).toLocaleString("id-ID") + " m)</i>")) +
      row("Kecepatan", Math.round(a.gs) + " kt <i>(" + kmh + " km/j)</i>") + row("Arah", Math.round(a.trk) + "° " + dirOf(a.trk)) +
      row("Laju vertikal", (a.vr > 0 ? "▲ " : a.vr < 0 ? "▼ " : "") + Math.abs(Math.round(a.vr)) + " ft/mnt") + row("Fase", phase(a)) + (a.sq ? row("Squawk", esc(a.sq)) : "") +
      (pr.ap ? row(pr.mode, "<u>" + esc(pr.ap.iata) + "</u> " + esc(pr.ap.name) + " <i>(" + Math.round(pr.dist) + " km" + eta + ")</i>") : "") +
      (pr.near && pr.nearD < 400 ? row("Bandara terdekat", esc(pr.near.iata) + " · " + Math.round(pr.nearD) + " km") : "") +
      '<div class="pqfl-btns"><button onclick="__pqflFollow(\'' + a.id + '\')">' + (follow === a.id ? "■ Berhenti ikuti" : "◎ Ikuti pesawat") + "</button></div>" +
      '<div class="pqfl-ft">Garis cyan = jejak · kuning putus = jalur ke depan · hijau = ke bandara tujuan</div>';
  }

  /* ---------------- BANDARA & RUTE ---------------- */
  function arc(a, b, n) {
    const p1 = a[0] * DEG, l1 = a[1] * DEG, p2 = b[0] * DEG, l2 = b[1] * DEG, d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
    if (d < 1e-6) return [a, b]; const o = []; for (let i = 0; i <= n; i++) { const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d), x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2), y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2), z = A * Math.sin(p1) + B * Math.sin(p2); o.push([Math.atan2(z, Math.hypot(x, y)) / DEG, Math.atan2(y, x) / DEG]); } return o;
  }
  function drawAp() {
    gAp.clearLayers();
    APT.forEach(p => {
      if (p.t === "N" ? !S.apN : !S.apI) return; const big = p.t !== "N";
      const mk = L.marker([p.lat, p.lng], { pane: "pqApPane", keyboard: false, icon: L.divIcon({ className: "pqfl-apw", iconSize: [big ? 26 : 20, big ? 26 : 20], iconAnchor: [big ? 13 : 10, big ? 13 : 10], html: '<div class="pqfl-ap pqfl-ap' + p.t + '"><i>✈︎</i><span class="pqfl-lbl">' + p.iata + "</span></div>" }) });
      mk.bindPopup(() => popAp(p), { className: "pqfl-pop", maxWidth: 300 }); gAp.addLayer(mk);
    });
  }
  function popAp(p) {
    const t = AP_T[p.t], near = [...AC.values()].filter(a => hav(a.lat, a.lon, p.lat, p.lng) < 35); let arr = 0, dep = 0, gnd = 0;
    near.forEach(a => { if (a.gnd) gnd++; else if (a.vr < -300) arr++; else if (a.vr > 300) dep++; });
    const lst = near.sort((x, y) => x.alt - y.alt).slice(0, 5).map(a => '<a href="#" onclick="__pqflGo(\'' + a.id + '\');return false">' + esc(a.cs || a.id) + "</a> <i>" + esc(a.t || "?") + " · " + fmtAlt(a) + "</i>").join("<br>");
    const rts = RT_D.concat(RT_I).filter(r => r.indexOf(p.iata) >= 0).length;
    return '<div class="pqfl-ph"><div><b class="pqfl-cs">' + esc(p.iata) + (p.icao ? " / " + esc(p.icao) : "") + "</b><small>" + esc(p.name) + '</small></div><span class="pqfl-chip" style="background:' + t[1] + "22;color:" + t[1] + ";border-color:" + t[1] + '66">' + t[0] + "</span></div>" +
      '<div class="pqfl-r"><span>Lokasi</span><b>' + esc(p.city) + '</b></div><div class="pqfl-r"><span>Koordinat</span><b>' + p.lat.toFixed(4) + ", " + p.lng.toFixed(4) + '</b></div><div class="pqfl-r"><span>Rute populer</span><b>' + rts + " jalur</b></div>" +
      '<div class="pqfl-r"><span>Aktivitas ±35 km</span><b>▼' + arr + " mendarat · ▲" + dep + " lepas landas · " + gnd + " di darat</b></div>" + (lst ? '<div class="pqfl-ft" style="margin-top:6px">' + lst + "</div>" : '<div class="pqfl-ft">Belum ada pesawat terpantau di sekitar bandara ini (aktifkan lapisan pesawat & zoom ke area).</div>') +
      '<div class="pqfl-btns"><button onclick="__pqflApt(\'' + p.iata + "')\">Zoom ke bandara</button></div>";
  }
  function drawRt() {
    gRt.clearLayers();
    [[RT_D, S.rtD, "#22d3ee", "Domestik"], [RT_I, S.rtI, "#f59e0b", "Internasional"]].forEach(g => {
      if (!g[1]) return;
      g[0].forEach(r => {
        const [a, b] = r.split("-").map(x => API[x]); if (!a || !b) return; const d = hav(a.lat, a.lng, b.lat, b.lng), h = d / 780 + 0.5;
        const pl = L.polyline(arc([a.lat, a.lng], [b.lat, b.lng], Math.min(60, Math.max(8, Math.round(d / 60)))), { pane: "pqRtPane", color: g[2], weight: 1.5, opacity: .5, dashArray: "5 6" });
        pl.bindTooltip(a.iata + " ⇄ " + b.iata + " · " + g[3] + "<br>±" + Math.round(d).toLocaleString("id-ID") + " km · ±" + Math.floor(h) + " j " + Math.round((h % 1) * 60) + " mnt", { sticky: true });
        pl.on("mouseover", () => pl.setStyle({ opacity: 1, weight: 3 })); pl.on("mouseout", () => pl.setStyle({ opacity: .5, weight: 1.5 })); gRt.addLayer(pl);
      });
    });
  }

  /* ---------------- PANEL ---------------- */
  const CSS = ".pqfl-panel{position:absolute;left:12px;top:56px;width:min(340px,92vw);max-height:calc(100% - 150px);z-index:905;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;background:rgba(10,14,23,.93);border:1px solid rgba(56,189,248,.4);color:#e5edf7;font:12px/1.4 Inter,system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.55)}.pqfl-panel.min .pqfl-body{display:none}.pqfl-hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(135deg,#0369a1,#0e7490)}.pqfl-hd b{flex:1;font-size:13px;letter-spacing:.2px}.pqfl-hd small{display:block;font-weight:500;font-size:10.5px;opacity:.9}.pqfl-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:5px;background:#94a3b8}.pqfl-hd button{background:rgba(0,0,0,.25);border:0;color:#fff;width:26px;height:26px;border-radius:50%;cursor:pointer}.pqfl-body{overflow-y:auto;padding:10px 12px 12px;overscroll-behavior:contain}.pqfl-tg{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}.pqfl-tg button,.pqfl-qj button{border:1px solid #1e2938;background:#131a28;color:#9fb0c6;border-radius:99px;padding:5px 9px;font:600 11px Inter,sans-serif;cursor:pointer}.pqfl-tg button.on{background:#0e7490;border-color:#22d3ee;color:#fff}.pqfl-qj{display:flex;gap:5px;overflow-x:auto;margin-bottom:8px;padding-bottom:2px}.pqfl-qj button{white-space:nowrap;color:#67e8f9}.pqfl-row2{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px}.pqfl-panel select,.pqfl-panel input{width:100%;background:#0a0e17;border:1px solid #1e2938;color:#e5edf7;border-radius:8px;padding:6px 8px;font:12px Inter,sans-serif}.pqfl-st{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:8px 0}.pqfl-st div{background:rgba(255,255,255,.05);border-radius:9px;padding:6px 4px;text-align:center}.pqfl-st b{display:block;font-size:14px}.pqfl-st small{font-size:9.5px;opacity:.7}.pqfl-h{margin:10px 0 5px;font-weight:800;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:#67e8f9}.pqfl-bar{display:flex;align-items:center;gap:6px;margin-bottom:3px;font-size:11px}.pqfl-bar span{width:96px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pqfl-bar i{display:block;height:7px;border-radius:4px;min-width:3px}.pqfl-bar em{font-style:normal;opacity:.75}.pqfl-lg{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:10.5px;opacity:.9}.pqfl-lg span:before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;background:var(--c)}.pqfl-ls a{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:8px;color:#e5edf7;text-decoration:none;background:rgba(255,255,255,.04);margin-bottom:3px}.pqfl-ls a:hover{background:rgba(34,211,238,.15)}.pqfl-ls a b{width:72px}.pqfl-ls a em{margin-left:auto;font-style:normal;opacity:.7;font-size:10.5px}.pqfl-ls i{width:8px;height:8px;border-radius:50%}.pqfl-note{margin-top:8px;font-size:10px;opacity:.6}.pqfl-warn{background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);border-radius:8px;padding:5px 8px;margin-bottom:6px;font-size:10.5px}.pqfl-emgb{background:#7f1d1d;border:1px solid #f87171;border-radius:8px;padding:6px 8px;margin-bottom:8px;font-weight:700;animation:pqflB 1s infinite alternate}@keyframes pqflB{to{background:#b91c1c}}.pqfl-acw,.pqfl-apw{background:none!important;border:0!important}.pqfl-ac{filter:drop-shadow(0 1px 2px rgba(0,0,0,.8));transition:color .4s}.pqfl-ac svg{width:100%;height:100%;display:block}.pqfl-emg{animation:pqflE .8s infinite}@keyframes pqflE{50%{filter:drop-shadow(0 0 8px #f43f5e) drop-shadow(0 0 14px #f43f5e)}}.pqfl-ap{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%}.pqfl-ap i{font-style:normal;display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:50%;font-size:11px;color:#04121a;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.6)}.pqfl-apI i{background:#f59e0b}.pqfl-apX i{background:#fb7185}.pqfl-apN i{background:#a78bfa;font-size:9px}.pqfl-lbl{display:none;position:absolute;left:100%;margin-left:3px;top:50%;transform:translateY(-50%);font:800 10px Inter,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap}.pqfl-zm .pqfl-apI .pqfl-lbl,.pqfl-zm .pqfl-apX .pqfl-lbl,.pqfl-zh .pqfl-lbl{display:block}.pqfl-pop .leaflet-popup-content-wrapper{background:#0f1521;color:#e5edf7;border:1px solid #1e2938;border-radius:12px}.pqfl-pop .leaflet-popup-tip{background:#0f1521}.pqfl-pop .leaflet-popup-content{margin:10px 12px;font:12px/1.45 Inter,sans-serif;min-width:230px}.pqfl-ph{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px}.pqfl-cs{font-size:15px;letter-spacing:.3px}.pqfl-ph small{display:block;color:#9fb0c6}.pqfl-chip{border:1px solid;border-radius:99px;padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap}.pqfl-r{display:flex;justify-content:space-between;gap:12px;padding:2px 0;border-bottom:1px dashed rgba(255,255,255,.07)}.pqfl-r span{color:#9fb0c6}.pqfl-r b{text-align:right;font-weight:600}.pqfl-r i{opacity:.7;font-style:normal}.pqfl-alert{background:#7f1d1d;border:1px solid #f87171;border-radius:8px;padding:4px 8px;margin-bottom:5px;font-weight:700;color:#fecaca}.pqfl-btns{margin-top:8px}.pqfl-btns button{width:100%;border:0;border-radius:8px;padding:7px;background:#0e7490;color:#fff;font:700 12px Inter,sans-serif;cursor:pointer}.pqfl-ft{margin-top:6px;font-size:10px;opacity:.65}.pqfl-ft a{color:#67e8f9}@media(max-width:860px){.pqfl-panel{left:0;right:0;top:auto;bottom:0;width:auto;max-height:55%;border-radius:16px 16px 0 0}}";
  const QJ = [["Jateng·DIY", -7.5, 110.1, 8], ["Jabodetabek", -6.3, 106.8, 9], ["Bali·Nusra", -8.8, 116.0, 7], ["Sumatra", 0, 102, 5], ["Kalimantan", 0, 114, 5], ["Sulawesi·Papua", -2.5, 125, 5], ["Indonesia", -2.5, 118, 4]];
  function buildPanel() {
    if (P) return; const st0 = document.createElement("style"); st0.id = "pqflCss"; st0.textContent = CSS; document.head.appendChild(st0);
    P = document.createElement("div"); P.className = "pqfl-panel" + (S.min ? " min" : ""); P.style.display = "none";
    P.innerHTML = '<div class="pqfl-hd"><span style="font-size:20px">✈</span><b>Penerbangan Live<small><i class="pqfl-dot" id="pqflDot"></i><span id="pqflSt">siap</span></small></b><button id="pqflMin" title="Ciutkan/perbesar">–</button><button id="pqflX" title="Tutup & matikan lapisan">✕</button></div><div class="pqfl-body">' +
      '<div id="pqflEmg"></div><div id="pqflWarn"></div><div class="pqfl-qj" id="pqflQj"></div><div class="pqfl-tg" id="pqflTg"></div>' +
      '<div class="pqfl-row2"><select id="pqflFlt"><option value="all">Semua jenis</option><option value="wb">Jet berbadan lebar</option><option value="nb">Jet berbadan sempit</option><option value="rj">Regional + turboprop</option><option value="bj">Jet bisnis</option><option value="hl">Helikopter</option><option value="ga">Pesawat ringan</option><option value="mil">Militer</option><option value="emg">⚠ Darurat (squawk)</option></select><select id="pqflCol"><option value="type">Warna: jenis</option><option value="alt">Warna: ketinggian</option></select></div>' +
      '<input id="pqflQ" placeholder="Cari callsign / registrasi / jenis / maskapai…" autocomplete="off">' +
      '<div class="pqfl-st" id="pqflStats"></div><div class="pqfl-h">Jenis pesawat di peta</div><div id="pqflTy"></div><div class="pqfl-h">Pesawat terdekat dari pusat peta</div><div class="pqfl-ls" id="pqflLs"></div><div class="pqfl-h">Legenda</div><div class="pqfl-lg" id="pqflLg"></div>' +
      '<div class="pqfl-note">Data ADS-B komunitas (adsb.lol · airplanes.live · OpenSky), tertunda beberapa detik, tidak mencakup semua pesawat (mis. militer/area tanpa penerima). Bukan untuk navigasi — rujuk AirNav Indonesia.</div></div>';
    $("map").appendChild(P); try { L.DomEvent.disableClickPropagation(P); L.DomEvent.disableScrollPropagation(P); } catch (e) { }
    $("pqflMin").onclick = () => { S.min = !S.min; P.classList.toggle("min", S.min); save(); };
    $("pqflX").onclick = () => toggle(false);
    $("pqflQj").innerHTML = QJ.map((q, i) => '<button data-i="' + i + '">' + q[0] + "</button>").join(""); $("pqflQj").onclick = e => { const b = e.target.closest("button"); if (b && M) { const q = QJ[+b.dataset.i]; M.setView([q[1], q[2]], q[3]); setTimeout(poll, 600); } };
    const TG = [["ac", "✈ Pesawat"], ["apI", "Bandara Int'l"], ["apN", "Bandara Nasional"], ["rtD", "Rute Domestik"], ["rtI", "Rute Int'l"], ["trail", "Jejak"]];
    $("pqflTg").innerHTML = TG.map(t => '<button data-k="' + t[0] + '" class="' + (S[t[0]] ? "on" : "") + '">' + t[1] + "</button>").join("");
    $("pqflTg").onclick = e => { const b = e.target.closest("button"); if (!b) return; const k = b.dataset.k; S[k] = !S[k]; b.classList.toggle("on", S[k]); save(); applyLayers(); };
    $("pqflFlt").value = S.flt; $("pqflCol").value = S.col; $("pqflQ").value = S.q || "";
    $("pqflFlt").onchange = e => { S.flt = e.target.value; save(); sync(); stats(); }; $("pqflCol").onchange = e => { S.col = e.target.value; save(); sync(); stats(); };
    let qt; $("pqflQ").oninput = e => { clearTimeout(qt); qt = setTimeout(() => { S.q = e.target.value; save(); sync(); stats(); }, 250); };
    $("pqflLg").innerHTML = Object.keys(CATC).filter(k => k !== "unk").map(k => '<span style="--c:' + CATC[k] + '">' + CATN[k] + "</span>").join("") + '<span style="--c:#f59e0b">Bandara Int\'l</span><span style="--c:#a78bfa">Bandara Nasional</span>';
    $("pqflLs").onclick = e => { const a = e.target.closest("a"); if (a) { e.preventDefault(); selectAc(a.dataset.id, true); } };
  }
  function setStatus(t, c) { const s = $("pqflSt"), d = $("pqflDot"); if (s) s.textContent = t + (src && S.ac ? " · " + src : ""); if (d) d.style.background = c || "#94a3b8"; }
  function stats() {
    if (!P) return; const vis = [...AC.values()].filter(a => a.shown), c = M.getCenter();
    const emg = [...AC.values()].filter(a => a.emg); $("pqflEmg").innerHTML = emg.length ? '<div class="pqfl-emgb">⚠ Squawk darurat: ' + emg.map(a => esc(a.cs || a.id) + " (" + a.sq + ")").join(", ") + "</div>" : "";
    $("pqflWarn").innerHTML = warnMulti ? '<div class="pqfl-warn">Tampilan sangat luas — cakupan data sebagian. Zoom lebih dekat untuk data lengkap.</div>' : "";
    const air = vis.filter(a => !a.gnd), avg = air.length ? Math.round(air.reduce((s, a) => s + a.alt, 0) / air.length) : 0, fast = air.reduce((m, a) => a.gs > (m ? m.gs : 0) ? a : m, null), high = air.reduce((m, a) => a.alt > (m ? m.alt : 0) ? a : m, null);
    $("pqflStats").innerHTML = '<div><b>' + vis.length + "</b><small>tampil" + (AC.size !== vis.length ? " / " + AC.size : "") + "</small></div><div><b>" + (avg ? Math.round(avg / 100) / 10 + "k" : "–") + "</b><small>rata² alt (ft)</small></div><div><b>" + vis.filter(a => a.gnd).length + "</b><small>di darat</small></div><div><b>" + (fast ? Math.round(fast.gs * 1.852) : "–") + "</b><small>tercepat km/j" + (fast ? "<br>" + esc(fast.cs || fast.id) : "") + "</small></div><div><b>" + (high ? fmtAlt(high).replace(" ft", "") : "–") + "</b><small>tertinggi" + (high ? "<br>" + esc(high.cs || high.id) : "") + "</small></div><div><b>" + air.filter(a => a.vr > 400).length + "▲ " + air.filter(a => a.vr < -400).length + "▼</b><small>naik / turun</small></div>";
    const cnt = {}; vis.forEach(a => { const k = tyName(a); (cnt[k] = cnt[k] || { n: 0, c: a.cat }).n++; }); const top = Object.entries(cnt).sort((a, b) => b[1].n - a[1].n).slice(0, 6), mx = top.length ? top[0][1].n : 1;
    $("pqflTy").innerHTML = top.length ? top.map(([k, v]) => '<div class="pqfl-bar"><span title="' + esc(k) + '">' + esc(k) + '</span><i style="width:' + Math.max(4, v.n / mx * 100 * .55) + "%;background:" + CATC[v.c] + '"></i><em>' + v.n + "</em></div>").join("") : '<div class="pqfl-note">Belum ada pesawat terpantau di area ini.</div>';
    const near = vis.map(a => ({ a, d: hav(c.lat, c.lng, a.lat, a.lon) })).sort((x, y) => x.d - y.d).slice(0, 8);
    $("pqflLs").innerHTML = near.map(({ a, d }) => '<a href="#" data-id="' + a.id + '"><i style="background:' + colOf(a) + '"></i><b>' + esc(a.cs || a.id) + "</b><span>" + esc(a.t || "?") + "</span><em>" + fmtAlt(a) + " · " + Math.round(a.gs * 1.852) + " km/j</em></a>").join("");
  }

  /* ---------------- KONTROL LAPISAN ---------------- */
  function applyLayers() {
    if (!M) return; const on = S.on;
    [[gAp, on && (S.apI || S.apN)], [gRt, on && (S.rtD || S.rtI)], [gAc, on && S.ac], [gTr, on && S.trail], [gSel, on]].forEach(x => { const h = M.hasLayer(x[0]); if (x[1] && !h) M.addLayer(x[0]); else if (!x[1] && h) M.removeLayer(x[0]); });
    drawAp(); drawRt(); if (S.ac) { poll(); } else { AC.forEach((a, id) => drop(id)); setStatus("pesawat dimatikan", "#94a3b8"); } sync(); stats();
  }
  function zoomCls() { if (!M) return; const z = M.getZoom(), c = M.getContainer(); c.classList.toggle("pqfl-zm", z >= 5); c.classList.toggle("pqfl-zh", z >= 8); }
  let moveT;
  function setup() {
    if (M) return true; M = gmap(); if (!M || !M.getPane || typeof L === "undefined") { M = null; return false; }
    [["pqRtPane", 425], ["pqTrPane", 620], ["pqApPane", 635], ["pqAcPane", 645]].forEach(p => { if (!M.getPane(p[0])) M.createPane(p[0]).style.zIndex = p[1]; });
    M.getPane("pqRtPane").style.pointerEvents = "auto"; gAc = L.layerGroup(); gAp = L.layerGroup(); gRt = L.layerGroup(); gTr = L.layerGroup(); gSel = L.layerGroup();
    buildPanel(); zoomCls();
    M.on("zoomend", zoomCls); M.on("moveend", () => { clearTimeout(moveT); moveT = setTimeout(() => { if (S.on && S.ac) poll(); }, 700); }); M.on("rotate", () => AC.forEach(a => a.shown && paint(a)));
    document.addEventListener("visibilitychange", () => { if (!document.hidden && S.on) poll(); });
    return true;
  }
  function toggle(v) {
    if (!setup()) { say("Peta belum siap — coba lagi sebentar"); return; }
    S.on = v == null ? !S.on : !!v; save(); P.style.display = S.on ? "flex" : "none";
    clearInterval(pollT); clearInterval(tickT);
    if (S.on) {
      if (!S.apI && !S.apN && !S.ac && !S.rtD && !S.rtI) { S.ac = S.apI = S.apN = true; }
      applyLayers(); pollT = setInterval(poll, 12000); tickT = setInterval(tick, 1000); say("Lapisan Penerbangan aktif — data pesawat live");
    } else { clearSel(); applyLayers(); AC.forEach((a, id) => drop(id)); }
  }
  const api = { rows: () => [{ id: "penerbangan", name: "Penerbangan live · bandara · jalur", ic: "\uf072", c: "#38bdf8", on: !!S.on }], act: () => toggle(), open: () => toggle(true), close: () => toggle(false), isOn: () => !!S.on, _predict: predict, _norm: norm, _cat: catOf, _tyName: tyName, _apt: APT, _arc: arc };
  window.PETAQU_FLIGHT = api;
  /* pulihkan status terakhir setelah peta siap */
  if (S.on) { S.on = false; let n = 0; const w = setInterval(() => { if (++n > 60) return clearInterval(w); try { if (gmap() && gmap().getPane && typeof L !== "undefined" && $("map")) { clearInterval(w); toggle(true); } } catch (e) { } }, 500); }
})();
