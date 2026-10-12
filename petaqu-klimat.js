/* PETAQU Atlas Langit & Iklim — jenis awan, jenis angin, ENSO (El Niño/La Niña/IOD), musim, fenomena atmosfer
   + alat pintar: Analisis Langit & Angin lokasi (Open-Meteo, gratis tanpa key), Identifikasi Awan (wizard),
   Kalkulator Beaufort, Penasihat Operasional proyek jalan/jembatan.
   Modul mandiri: tidak mengubah fitur lama, hanya menambah 1 tombol di dock. Indikatif; resmi: BMKG / NOAA. */
(function () {
  "use strict";
  if (window.__pqKlimat) return; window.__pqKlimat = 1;
  const KEY = "petaqu_klimat_v1";
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const gmap = () => { try { return typeof map !== "undefined" ? map : window.map; } catch (e) { return window.map; } };
  let S = { tab: "awan", enso: "auto", iod: "netral" };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };

  /* ===================== DATA AWAN ===================== */
  // [kode, nama, emoji, lapisan, bentuk, hujan(0-3), ketinggian, ciri, cuaca, dampak proyek]
  const AWAN = [
    ["Ci", "Cirrus", "🪶", "tinggi", "serat", 0, "6–18 km (kristal es)", "Serat tipis putih seperti bulu/ekor kuda, tidak menimbulkan bayangan.", "Cuaca cerah; jika menebal & turun bisa tanda front/sistem cuaca 12–24 jam lagi.", "Aman untuk semua pekerjaan. Bagus untuk survei & drone."],
    ["Cc", "Cirrocumulus", "🐟", "tinggi", "gumpal", 0, "6–12 km", "Butiran/riak kecil putih tanpa bayangan (\"sisik ikan\"), jarang & singkat.", "Cerah-berawan, kadang pendahulu perubahan cuaca.", "Aman. Pantau jika berubah menjadi Cs."],
    ["Cs", "Cirrostratus", "🌫️", "tinggi", "lapisan", 0, "6–12 km", "Tirai tipis transparan, menimbulkan halo di sekitar matahari/bulan.", "Pertanda hujan dalam 12–24 jam bila menebal (mendekati front/sistem hujan).", "Siapkan rencana cadangan pengecoran/aspal hari berikutnya."],
    ["Ac", "Altocumulus", "🐑", "menengah", "gumpal", 1, "2–7 km", "Gumpalan putih-abu bergelombang/berderet, ada sisi gelap, \"bulu domba\".", "Pagi hari + udara lembap di musim panas: waspada badai petir sore (Ac castellanus).", "Waspada awan menjulang sore; selesaikan pekerjaan luar lebih pagi."],
    ["As", "Altostratus", "🌥️", "menengah", "lapisan", 1, "2–7 km", "Lapisan abu-kebiruan menutup, matahari tampak samar seperti di balik kaca buram.", "Hujan ringan-menengah menyusul bila menebal menjadi Ns.", "Perkirakan hujan; tunda pengaspalan & pengecoran terbuka."],
    ["Ns", "Nimbostratus", "🌧️", "menengah", "lapisan", 2, "0,5–6 km (tebal, dasar rendah)", "Lapisan abu gelap tebal merata, hujan/gerimis terus-menerus, matahari tak terlihat.", "Hujan stratiform lama (berjam-jam – berhari-hari), intensitas ringan-sedang.", "Hentikan aspal/beton/drone; risiko genangan, longsor lereng jenuh bila berhari-hari."],
    ["Sc", "Stratocumulus", "☁️", "rendah", "gumpal", 0, "<2 km", "Gumpalan/gulungan abu-putih menyambung dengan celah biru, basis rendah.", "Mendung berselang; hujan sangat ringan jarang.", "Umumnya aman; visibilitas drone cukup."],
    ["St", "Stratus", "🌁", "rendah", "lapisan", 1, "0–0,5 km", "Lapisan abu seragam sangat rendah seperti kabut yang terangkat, gerimis halus.", "Kabut/gerimis; di dataran tinggi pagi hari berarti kabut tebal.", "Visibilitas rendah & jalan licin; hati-hati inspeksi lereng/jembatan pagi."],
    ["Cu", "Cumulus", "⛅", "rendah", "gumpal", 0, "0,5–2 km (puncak bisa lebih)", "Gumpalan putih seperti kapas, dasar datar, puncak membulat; terbentuk siang hari.", "Cuaca cerah (Cu humilis); bila tumbuh vertikal (congestus) -> hujan lebat lokal.", "Aman pagi-siang; pantau pertumbuhan vertikal sore."],
    ["Cb", "Cumulonimbus", "⛈️", "menjulang", "gumpal", 3, "0,5–16+ km (menjulang)", "Awan raksasa menjulang, puncak berbentuk landasan (anvil), dasar gelap.", "Hujan lebat, petir, angin kencang/downburst, hujan es, potensi puting beliung.", "BAHAYA: hentikan kerja di luar, jauhi crane/tiang/perancah, hindari bawah pohon & jembatan rangka baja."]
  ];
  // [nama, emoji, penjelasan, makna]
  const AWAN2 = [
    ["Lenticularis", "🛸", "Lensa/piring terbang yang diam di dekat puncak gunung (gelombang gunung).", "Angin kuat di ketinggian & turbulensi di sekitar pegunungan."],
    ["Mammatus", "🫧", "Kantong menggantung di dasar anvil Cb.", "Badai sangat kuat baru lewat/sedang aktif."],
    ["Arcus (shelf/roll)", "🌀", "Gulungan di depan badai petir.", "Gust front: angin kencang mendadak 5–15 menit lagi."],
    ["Pileus & Cumulus Congestus", "🎩", "Topi tipis di puncak Cu yang tumbuh cepat / Cu menjulang tinggi.", "Pertumbuhan Cb cepat — hujan lebat dalam 15–45 menit."],
    ["Kelvin-Helmholtz", "🌊", "Gelombang laut berderet di langit.", "Geser angin kuat & turbulensi di ketinggian."],
    ["Kondensasi Pesawat (contrail)", "✈️", "Garis putih dari mesin jet.", "Menandakan udara atas lembap/dingin; bertahan lama = lembap tinggi."],
    ["Awan Corong/Tuba", "🌪️", "Corong menggantung dari dasar Cb.", "Puting beliung/waterspout dapat terbentuk — berlindung segera."],
    ["Awan Nacreous & Noctilucent", "🌈", "Awan stratosfer/mesosfer langka, di lintang tinggi.", "Fenomena langka, tidak memengaruhi cuaca di Indonesia."]
  ];

  /* ===================== DATA ANGIN ===================== */
  // [nama, emoji, kelompok, wilayah, sifat, musim/waktu, risiko 0-3, catatan proyek]
  const ANGIN = [
    ["Angin Pasat (Trade Wind)", "🧭", "Global", "0–30° LU/LS", "Bertiup dari subtropis ke ekuator; di belahan utara dari timur laut, di selatan dari tenggara.", "Sepanjang tahun, menguat saat Juni–September di selatan ekuator.", 1, "Angin tenggara pasat memberi musim kemarau di Jawa-Nusa Tenggara."],
    ["Angin Antipasat", "🔝", "Global", "Lapisan atas troposfer", "Aliran balik di ketinggian dari ekuator ke subtropis.", "Sepanjang tahun.", 0, "Tidak dirasakan di permukaan."],
    ["Angin Barat (Westerlies)", "🌐", "Global", "30–60° LU/LS", "Bertiup dari barat ke timur di lintang menengah.", "Sepanjang tahun.", 1, "Pengaruh langsung ke Indonesia kecil, kecuali lewat monsun barat."],
    ["Angin Timur Kutub", "❄️", "Global", "60–90°", "Dingin dari kutub ke lintang 60°.", "Sepanjang tahun.", 0, "Tidak memengaruhi Indonesia."],
    ["Doldrum / ITCZ", "🌩️", "Global", "Sekitar ekuator (bergeser musiman)", "Zona konvergensi angin pasat: angin lemah, awan konvektif tebal, hujan lebat.", "Melintasi Indonesia 2× setahun (Mar–Apr & Okt–Nov).", 2, "Peralihan musim = hujan lebat tiba-tiba & petir; waspada banjir bandang."],
    ["Jet Stream", "✈️", "Global", "9–16 km", "Aliran angin kencang (>100 km/jam) di ketinggian.", "Pengaruh tidak langsung di Indonesia.", 0, "Mempengaruhi turbulensi penerbangan, bukan operasi proyek."],
    ["Monsun Barat (Asia)", "🌧️", "Monsun", "Indonesia (terutama selatan ekuator)", "Angin barat–barat laut membawa uap air dari Samudra Hindia/Laut Cina Selatan.", "Sekitar November–Maret (puncak Des–Feb).", 2, "Musim hujan: risiko banjir, longsor, gelombang tinggi; jadwalkan pekerjaan struktur dengan buffer."],
    ["Monsun Timur (Australia)", "☀️", "Monsun", "Indonesia (selatan ekuator)", "Angin tenggara dari Australia: kering & dingin pada malam hari.", "Sekitar Mei/Juni–September.", 1, "Kemarau: debu, kebakaran lahan, peluang kerja aspal/beton terbaik; angin kencang di pesisir selatan."],
    ["Angin Peralihan (Pancaroba)", "🔄", "Monsun", "Seluruh Indonesia", "Arah angin tidak menentu, matahari menyengat → konvektif kuat.", "Apr–Mei & Okt–Nov.", 3, "Frekuensi puting beliung, petir, hujan es tertinggi; hindari kerja ketinggian sore hari."],
    ["Angin Laut (Sea Breeze)", "🌊", "Lokal", "Pesisir", "Siang hari: dari laut ke darat karena darat lebih panas.", "Sekitar 10.00–18.00 lokal.", 1, "Membawa uap air → awan Cu/Cb di sore hari di daratan dekat pantai."],
    ["Angin Darat (Land Breeze)", "🌙", "Lokal", "Pesisir", "Malam hari: dari darat ke laut karena darat lebih cepat dingin.", "Sekitar 22.00–06.00 lokal.", 0, "Hujan malam-dini hari di laut/pesisir; nelayan & pekerjaan pelabuhan."],
    ["Angin Lembah", "⛰️", "Lokal", "Pegunungan", "Siang naik lereng dari lembah ke puncak.", "Siang.", 1, "Awan konvektif tumbuh di puncak; hujan sore di dataran tinggi."],
    ["Angin Gunung", "🏔️", "Lokal", "Pegunungan", "Malam turun dari puncak ke lembah (udara dingin berat).", "Malam–pagi.", 0, "Kabut/embun di lembah & jalan pegunungan pagi hari."],
    ["Angin Fohn / Jatuh", "🌬️", "Lokal (khas Indonesia)", "Bahorok (Sumut), Kumbang (Cirebon–Tegal), Gending (Probolinggo–Pasuruan), Brubu (Sulsel), Wambraw (Biak), Bohorok", "Angin panas, kering, kencang yang turun di sisi bawah angin pegunungan.", "Biasanya Juni–Oktober (kemarau).", 2, "Merusak atap/perancah, memperparah kebakaran lahan, mengeringkan beton & aspal terlalu cepat."],
    ["Angin Puting Beliung", "🌪️", "Ekstrem", "Seluruh Indonesia (tanah datar)", "Pusaran udara kecil (1–5 km, 5–10 menit) dari awan Cb; kecepatan >60 km/jam bisa 100+.", "Peralihan musim, siang–sore.", 3, "Terbaik: hentikan kerja saat Cb menggumpal gelap; lindungi material ringan & bekisting."],
    ["Downburst / Microburst", "💥", "Ekstrem", "Bawah Cb", "Hembusan turun kuat dari badai petir menyebar ke samping (hingga >100 km/jam).", "Saat badai petir.", 3, "Kerusakan lurus searah; waspada perancah, tiang, jembatan sementara."],
    ["Gust Front / Squall Line", "📏", "Ekstrem", "Depan badai petir", "Garis hembusan dingin kencang mendadak di depan badai/ garis badai.", "Siang–malam.", 2, "Tanda: arcus. Siapkan pengamanan alat sebelum hujan tiba."],
    ["Seruak Dingin (Cold Surge)", "🥶", "Fenomena regional", "Laut Cina Selatan → Indonesia", "Penguatan angin utara-timur laut dari Siberia/Asia saat musim dingin utara.", "Desember–Februari.", 2, "Gelombang tinggi Laut Natuna/Jawa, hujan lebat Kalimantan Barat, Sumatra bagian timur."],
    ["Bibit Siklon / Siklon Tropis", "🌀", "Ekstrem", "Samudra Hindia selatan & Pasifik barat", "Pusaran angin >63 km/jam (siklon tropis), terbentuk di perairan >26,5 °C. Tidak terbentuk dekat ekuator (<5°).", "Nov–Apr (selatan), Jun–Nov (utara).", 3, "Efek tidak langsung: gelombang tinggi, hujan ekstrem, angin kencang NTT/Jawa selatan."],
    ["Angin Muson Tenggara Jawa / Angin Kencang Selatan", "💨", "Regional", "Selat Sunda–Nusa Tenggara", "Penguatan tenggara pasat saat kemarau di selatan Jawa-Bali-NTT.", "Juli–September.", 2, "Angin kencang di jembatan bentang panjang & jalur pantai selatan."],
    ["Angin Santa Ana / Chinook / Sirocco", "🌍", "Referensi dunia", "Amerika Barat / Pegunungan Rocky / Mediterania", "Padanan angin Fohn di benua lain (hangat-kering-kencang).", "—", 1, "Sebagai pembanding ilmiah."]
  ];

  /* ===================== BEAUFORT ===================== */
  const BF = [
    [1, "Tenang", "Asap naik tegak lurus.", "Laut seperti cermin."],
    [5, "Udara ringan", "Arah angin terlihat dari asap.", "Riak kecil."],
    [11, "Sepoi ringan", "Angin terasa di wajah, daun bergerak.", "Ombak kecil 0,2 m."],
    [19, "Sepoi lembut", "Daun & ranting kecil terus bergerak.", "Ombak 0,6 m."],
    [28, "Sepoi sedang", "Debu & kertas beterbangan, dahan kecil bergerak.", "Ombak 1 m."],
    [38, "Sepoi segar", "Pohon kecil berayun.", "Ombak 2 m, ada buih."],
    [49, "Sepoi kuat", "Dahan besar bergerak, payung sulit dipakai.", "Ombak 3 m."],
    [61, "Angin ribut sedang (near gale)", "Seluruh pohon bergoyang, sulit berjalan melawan angin.", "Ombak 4 m."],
    [74, "Angin ribut (gale)", "Ranting patah, sulit berjalan.", "Ombak 5,5 m."],
    [88, "Angin ribut kuat", "Kerusakan kecil bangunan (genting).", "Ombak 7 m."],
    [102, "Badai", "Pohon tumbang, kerusakan bangunan.", "Ombak 9 m."],
    [117, "Badai dahsyat", "Kerusakan luas.", "Ombak 11,5 m."],
    [1e9, "Topan/Badai tropis", "Kerusakan sangat parah.", "Ombak >14 m."]
  ];
  const bfIdx = kmh => { const b = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118]; let i = 0; while (i < 12 && kmh >= b[i]) i++; return i; };

  /* ===================== ENSO / IOD ===================== */
  const ENSO = {
    nino: { n: "El Niño", c: "#f97316", e: "🔥", d: "Pemanasan suhu laut Pasifik tengah-timur (ONI ≥ +0,5 °C ≥5 bulan berturut-turut). Pusat konveksi bergeser ke timur → Indonesia kekurangan hujan.", i: ["Kemarau lebih kering/panjang; awal musim hujan mundur (dampak terkuat Jul–Nov).", "Curah hujan turun, terutama Sumatra bagian selatan, Jawa, Kalimantan, Sulawesi & Nusa Tenggara.", "Risiko kebakaran hutan/lahan & kabut asap, kekeringan, gagal panen.", "Suhu udara lebih tinggi; angin kencang/kering di kemarau."], o: ["Peluang kerja aspal/beton baik, tapi atur curing (siram/menutup) agar tidak retak.", "Bahaya debu & kebakaran lahan sekitar proyek: siapkan APAR/tanki air.", "Pasokan air proyek terbatas: kontrol penggunaan.", "Siapkan rencana saat hujan lebat tiba-tiba di peralihan (tanah kering → limpasan tinggi)."] },
    nina: { n: "La Niña", c: "#38bdf8", e: "💧", d: "Pendinginan suhu laut Pasifik tengah-timur (ONI ≤ −0,5 °C). Pusat konveksi bergeser ke barat → Indonesia lebih basah.", i: ["Curah hujan di atas normal (hingga +20–40% di beberapa wilayah).", "Kemarau basah, hujan di musim kemarau; musim hujan lebih awal/panjang.", "Risiko banjir, longsor, banjir bandang, gelombang tinggi meningkat.", "Suhu lebih sejuk, awan konvektif lebih sering."], o: ["Tambah buffer jadwal (10–25%) untuk pekerjaan terbuka & pekerjaan tanah.", "Prioritaskan drainase, gorong-gorong, penahan lereng sebelum musim hujan.", "Monitor lereng jenuh & debit sungai di sekitar jembatan (scouring).", "Jangan pengaspalan saat potensi hujan > 30%."] },
    netral: { n: "Netral", c: "#94a3b8", e: "⚖️", d: "Suhu laut Pasifik mendekati normal (ONI antara −0,5 dan +0,5). Pola monsun menentukan cuaca.", i: ["Musim mengikuti pola klimatologi normal.", "Variasi lokal ditentukan MJO, IOD, gelombang atmosfer & fenomena regional."], o: ["Gunakan kalender musim klimatologis & prakiraan BMKG mingguan."] }
  };
  const IOD = {
    plus: { n: "IOD Positif", d: "Suhu laut Samudra Hindia barat lebih hangat dari timur (DMI ≥ +0,4). Hujan berkurang di Sumatra-Jawa-Nusa Tenggara, bertambah di Afrika timur.", t: "Memperkuat dampak kering El Niño." },
    minus: { n: "IOD Negatif", d: "Suhu laut Samudra Hindia timur (dekat Indonesia) lebih hangat (DMI ≤ −0,4). Hujan meningkat di Indonesia bagian barat/selatan.", t: "Memperkuat basah La Niña — banjir lebih mungkin." },
    netral: { n: "IOD Netral", d: "Gradien suhu normal.", t: "Tidak ada penguatan tambahan." }
  };
  // Peristiwa historis [periode, jenis, kekuatan (ONI puncak ±), catatan] — angka dibulatkan, rujuk NOAA CPC
  const RIWAYAT = [
    ["1997–98", "nino", "Sangat kuat (≈ +2,4)", "Kebakaran hutan besar Kalimantan-Sumatra, kemarau ekstrem."],
    ["1998–2001", "nina", "Kuat (≈ −1,6)", "Hujan tinggi, banjir di banyak daerah."],
    ["2009–10", "nino", "Sedang (≈ +1,3)", "Kemarau panjang 2009."],
    ["2010–12", "nina", "Kuat (≈ −1,6)", "Kemarau basah 2010, banjir & longsor luas."],
    ["2015–16", "nino", "Sangat kuat (≈ +2,6)", "Kekeringan & karhutla 2015 (+ IOD positif)."],
    ["2018–19", "nino", "Lemah (≈ +0,9)", "Kemarau lebih kering 2019."],
    ["2020–23", "nina", "\"Triple-dip\" (≈ −1,3)", "Tiga musim La Niña berturut-turut; kemarau basah 2021–22."],
    ["2023–24", "nino", "Kuat (≈ +2,0)", "Kemarau 2023 kering & panas, karhutla."]
  ];
  const SIKLUS = { nino: "Siklus tiap ~2–7 tahun; fase biasanya berlangsung 9–12 bulan, puncak Nov–Jan.", nina: "Sering berlangsung 1–3 tahun; puncak Des–Feb.", netral: "Bisa berubah ke El Niño/La Niña dalam 1–2 musim." };

  /* ===================== MUSIM ===================== */
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const MUSIM = [ // 0..11
    ["hujan", "Monsun Barat — puncak hujan"], ["hujan", "Monsun Barat — puncak hujan"], ["trans", "Peralihan I (hujan → kemarau)"], ["trans", "Peralihan I — konvektif/ puting beliung"], ["trans", "Peralihan I — akhir"], ["kemarau", "Monsun Timur — mulai kemarau"],
    ["kemarau", "Kemarau — puncak"], ["kemarau", "Kemarau — puncak"], ["kemarau", "Kemarau — akhir"], ["trans", "Peralihan II (kemarau → hujan)"], ["trans", "Peralihan II — hujan sore/petir"], ["hujan", "Monsun Barat — awal hujan"]
  ];
  const MCOL = { hujan: "#38bdf8", trans: "#fbbf24", kemarau: "#f97316" };

  /* ===================== FENOMENA ===================== */
  const FEN = [
    ["MJO (Madden-Julian Oscillation)", "🌐", "Gelombang awan-hujan yang bergerak timur sepanjang ekuator tiap 30–60 hari. Fase 3–5 (Samudra Hindia timur–Benua Maritim) = hujan meningkat di Indonesia."],
    ["Gelombang Kelvin & Rossby", "〰️", "Gelombang atmosfer ekuator yang memicu pulsa hujan lebat 3–7 hari; sering menjadi penyebab banjir mendadak."],
    ["Borneo Vortex", "🌀", "Pusaran siklonik di sekitar Kalimantan saat monsun barat: hujan lebat Kalimantan hingga Jawa/Sumatra."],
    ["Bibit Siklon / Siklon Tropis", "🌀", "Depresi tropis (<34 knot) → siklon tropis (≥34 knot) → badai tropis berat (≥64 knot). Dampak tidak langsung: gelombang tinggi, hujan & angin kencang di selatan Jawa-NTT."],
    ["Konvektif (Hujan Lokal)", "🌩️", "Hujan lebat durasi pendek, siang-sore, dari Cu/Cb; paling sering di peralihan musim."],
    ["Orografis", "⛰️", "Hujan akibat udara dipaksa naik pegunungan: lereng angin hadap = hujan tinggi, lereng bayangan hujan = kering."],
    ["Frontal / Konvergensi", "↗️", "Hujan dari pertemuan massa udara/ angin (shear line/konvergensi) — lebih luas & lama, khas monsun."],
    ["Hujan Es", "🧊", "Es dari Cb kuat, sering di peralihan musim, sempit & singkat; merusak atap, kaca, kendaraan."],
    ["Suhu Panas Terik / Heat Index", "🥵", "Suhu ≥ 35 °C + lembap tinggi = risiko heat stress pekerja; atur istirahat, minum, & jam kerja."],
    ["Gelombang Panas ≠ Gelombang Panas Eropa", "☀️", "Di Indonesia dikenal \"suhu panas\"; penyebab: gerak semu matahari & udara kering saat El Niño/kemarau."],
    ["Kabut Asap Lintas Batas", "🌫️", "Dari karhutla saat kemarau/El Niño; angin tenggara membawa asap ke Sumatra-Kalimantan & negara tetangga."],
    ["Seiche / Rob / Banjir Pesisir", "🌊", "Naiknya muka air laut saat purnama/perigee + gelombang tinggi; pengaruh pada ruas jalan pesisir."],
    ["Gerakan Tanah (Longsor) Pemicu Hujan", "⛰️", "Hujan ≥ 100 mm/hari atau hujan akumulatif 3–7 hari jenuh lereng → longsor; waspada lereng sudut > 30°."]
  ];
  const INT_HUJAN = [
    ["Ringan", "1–5 mm/jam (5–20 mm/hari)", "#7dd3fc"],
    ["Sedang", "5–10 mm/jam (20–50 mm/hari)", "#38bdf8"],
    ["Lebat", "10–20 mm/jam (50–100 mm/hari)", "#0ea5e9"],
    ["Sangat lebat", "> 20 mm/jam (100–150 mm/hari)", "#6366f1"],
    ["Ekstrem", "> 150 mm/hari", "#a855f7"]
  ];

  /* ===================== LOGIKA PINTAR ===================== */
  function cardsHTML(arr, fn) { return arr.map(fn).join(""); }
  function badge(t, c) { return '<span class="pqk-b" style="background:' + c + '22;color:' + c + ';border-color:' + c + '66">' + esc(t) + "</span>"; }
  const RC = ["#22c55e", "#facc15", "#f97316", "#ef4444"], RN = ["Aman", "Waspada rendah", "Waspada", "Bahaya"];
  const compass = d => ["U", "TL", "T", "TG", "S", "BD", "B", "BL"][Math.round(((d % 360) + 360) % 360 / 45) % 8];

  function inferClouds(w) {
    const lo = w.low || 0, mi = w.mid || 0, hi = w.high || 0, cape = w.cape || 0, pr = w.precip || 0, code = w.code || 0, rh = w.rh || 0;
    const r = [];
    if (cape >= 1500 || code >= 95 || (cape >= 800 && pr > 2)) r.push(["Cb", "Cumulonimbus", Math.min(1, .6 + cape / 4000)]);
    else if (cape >= 300 && lo >= 30) r.push(["Cu", "Cumulus congestus/mediocris", Math.min(1, .45 + cape / 2500)]);
    if (pr > .3 && lo + mi >= 110 && cape < 800) r.push(["Ns", "Nimbostratus", .8]);
    if (mi >= 40 && cape < 800) r.push([pr > 0 ? "As" : (cape > 200 ? "Ac" : "As"), (pr > 0 || cape <= 200) ? "Altostratus" : "Altocumulus", mi / 100]);
    if (lo >= 40 && cape < 300 && pr <= .3) r.push([rh > 93 ? "St" : "Sc", rh > 93 ? "Stratus/kabut rendah" : "Stratocumulus", lo / 100]);
    else if (lo >= 15 && cape >= 100 && cape < 300) r.push(["Cu", "Cumulus humilis", .5]);
    if (hi >= 50) r.push(["Cs", "Cirrostratus", hi / 100]); else if (hi >= 15) r.push(["Ci", "Cirrus", hi / 100]);
    if (!r.length) r.push(["—", "Langit cerah", .9]);
    return r.sort((a, b) => b[2] - a[2]).slice(0, 3);
  }
  function advisor(w) {
    const g = Math.max(w.gust || 0, w.wind || 0), items = [], cb = (w.cape >= 1500 || w.code >= 95), rain = w.precip > .2 || w.code >= 51;
    const add = (n, lvl, why) => items.push([n, lvl, why]);
    add("Pengaspalan (hot mix)", rain || cb ? 3 : (w.rh > 90 || g >= 30 ? 1 : 0), rain || cb ? "Ada hujan/ potensi badai: hentikan, tutup material." : w.rh > 90 || g >= 30 ? "Lembap tinggi/angin: campuran cepat dingin, padatkan segera." : "Kondisi mendukung.");
    add("Pengecoran beton", rain ? 3 : (w.temp >= 33 && g >= 20 ? 2 : (cb ? 2 : 0)), rain ? "Hujan merusak permukaan beton segar." : (w.temp >= 33 && g >= 20) ? "Panas+angin → penguapan cepat, retak plastis: curing awal & pelindung angin." : cb ? "Cb mendekat: siapkan terpal & tunda finishing." : "Kondisi mendukung.");
    add("Crane / pekerjaan angkat", g >= 36 ? 3 : g >= 25 ? 1 : (cb ? 3 : 0), g >= 36 ? "Gust ≥ 36 km/j: hentikan angkat (cek manual alat)." : g >= 25 ? "Angin mendekati batas: kurangi beban/ luas permukaan beban." : cb ? "Risiko petir & downburst: hentikan." : "Kondisi mendukung.");
    add("Kerja di ketinggian / perancah", g >= 40 || cb ? 3 : g >= 28 ? 1 : 0, g >= 40 ? "Gust ≥ 40 km/j: hentikan." : cb ? "Ancaman petir/angin mendadak: turun." : g >= 28 ? "Waspada, gunakan pengaman tambahan." : "Kondisi mendukung.");
    add("Drone survei", rain || g >= 36 ? 3 : g >= 24 || (w.low >= 85) ? 1 : 0, rain || g >= 36 ? "Tidak layak terbang." : g >= 24 ? "Angin mendekati batas drone kecil (~ 28 km/j)." : w.low >= 85 ? "Awan rendah tebal: kabut/ visibilitas." : "Kondisi mendukung.");
    add("Inspeksi lapangan / survei", cb ? 3 : (rain ? 1 : 0), cb ? "Potensi petir: berlindung (aturan 30-30)." : rain ? "Basah/licin: APD & hati-hati lereng." : "Kondisi mendukung.");
    return items;
  }
  async function loadLive(lat, lng) {
    const u = "https://api.open-meteo.com/v1/forecast?latitude=" + lat.toFixed(4) + "&longitude=" + lng.toFixed(4) +
      "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m,wind_gusts_10m" +
      "&hourly=cape&forecast_hours=3&wind_speed_unit=kmh&timezone=auto";
    const j = await (await fetch(u)).json(), c = j.current || {};
    return { temp: c.temperature_2m, rh: c.relative_humidity_2m, precip: c.precipitation, code: c.weather_code, low: c.cloud_cover_low, mid: c.cloud_cover_mid, high: c.cloud_cover_high,
      wind: c.wind_speed_10m, dir: c.wind_direction_10m, gust: c.wind_gusts_10m, cape: ((j.hourly || {}).cape || [0])[0] || 0, time: c.time, lat, lng };
  }
  function hourOf(t) { const m = /T(\d\d)/.exec(t || ""); return m ? +m[1] : new Date().getHours(); }
  function localWind(h) {
    if (h >= 10 && h < 18) return "Siang: angin laut (pesisir) & angin lembah (pegunungan) — udara lembap naik, awan Cu/Cb tumbuh sore.";
    if (h >= 22 || h < 6) return "Malam: angin darat (pesisir) & angin gunung (pegunungan) — udara dingin turun, kabut di lembah.";
    return "Masa peralihan arah angin lokal (pagi/senja) — angin lemah, arah berubah.";
  }
  function monsunNow(m) { return MUSIM[m][1]; }
  function ensoNow() { return S.enso === "auto" ? (window.__pqOni ? window.__pqOni.k : "netral") : S.enso; }
  async function fetchOni() {
    try {
      const r = await fetch("https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"); if (!r.ok) throw 0;
      const L = (await r.text()).trim().split(/\n/).filter(x => /^\s*[A-Z]{3}\s+\d{4}/.test(x)), p = L[L.length - 1].trim().split(/\s+/), a = parseFloat(p[3]);
      window.__pqOni = { v: a, s: p[0], y: p[1], k: a >= .5 ? "nino" : a <= -.5 ? "nina" : "netral" }; return true;
    } catch (e) { return false; }
  }

  /* ===================== UI ===================== */
  let P;
  const TABS = [["awan", "☁️ Awan"], ["angin", "🌬️ Angin"], ["enso", "🌊 ENSO"], ["musim", "📅 Musim"], ["fen", "🌀 Fenomena"], ["pintar", "🧠 Alat Pintar"]];
  function css() {
    const s = document.createElement("style");
    s.textContent = "#pqkBtn{}#pqkPanel{position:fixed;right:10px;top:70px;z-index:1300;width:min(440px,calc(100vw - 20px));max-height:calc(100vh - 90px);display:none;flex-direction:column;background:#0a0e17f7;color:#dbe7f3;border:1px solid #94b2cc40;border-radius:14px;font:13px/1.45 system-ui,sans-serif;box-shadow:0 14px 40px #0009;backdrop-filter:blur(10px);overflow:hidden}" +
      "#pqkPanel header{display:flex;align-items:center;gap:8px;padding:11px 14px 6px}#pqkPanel header b{flex:1;font-size:14px}#pqkPanel header small{display:block;color:#8fa6bd;font-weight:400;font-size:11px}#pqkPanel .x{background:0;border:0;color:#8fa6bd;font-size:22px;cursor:pointer;line-height:1}" +
      ".pqk-tabs{display:flex;gap:4px;padding:0 10px 8px;overflow-x:auto;flex:none}.pqk-tabs button{flex:none;padding:6px 10px;border-radius:999px;border:1px solid #94b2cc33;background:#0f1726;color:#cbd5e1;font:600 12px system-ui;cursor:pointer}.pqk-tabs button.on{background:#0891b2;border-color:#22d3ee;color:#fff}" +
      "#pqkBody{overflow:auto;padding:0 12px 14px;display:flex;flex-direction:column;gap:8px}.pqk-q{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid #94b2cc40;background:#0f1726;color:#e6f1fb;font:inherit;outline:0}" +
      ".pqk-it{border:1px solid #94b2cc2e;border-radius:10px;background:#0f172a;padding:0}.pqk-it summary{cursor:pointer;padding:9px 10px;display:flex;gap:8px;align-items:center;list-style:none}.pqk-it summary::-webkit-details-marker{display:none}.pqk-it summary .e{font-size:20px}.pqk-it summary .t{flex:1;font-weight:600}.pqk-it summary small{color:#8fa6bd;font-weight:400;display:block;font-size:11px}" +
      ".pqk-it .c{padding:0 11px 10px;display:flex;flex-direction:column;gap:5px;color:#cbd5e1}.pqk-it .c i{color:#8fa6bd;font-style:normal;font-weight:600}.pqk-b{display:inline-block;padding:1px 7px;border-radius:999px;border:1px solid;font-size:10.5px;font-weight:700;margin-right:3px}" +
      ".pqk-box{border:1px solid #94b2cc2e;border-radius:10px;padding:10px;background:#0f172a}.pqk-box h4{margin:0 0 6px;font-size:13px}.pqk-box ul{margin:4px 0 0;padding-left:18px}.pqk-row{display:flex;gap:6px;flex-wrap:wrap}.pqk-btn{padding:8px 12px;border-radius:9px;border:1px solid #22d3ee88;background:#0e7490;color:#fff;font:600 12.5px system-ui;cursor:pointer}.pqk-btn.g{background:#0f1726;border-color:#94b2cc50;color:#cbd5e1}" +
      ".pqk-bar{display:flex;gap:3px}.pqk-bar div{flex:1;text-align:center;padding:6px 0;border-radius:6px;font-size:10.5px;color:#0a0e17;font-weight:700}.pqk-bar div.now{outline:2px solid #fff}.pqk-mini{color:#8fa6bd;font-size:11px}.pqk-sel{padding:7px;border-radius:8px;background:#0f1726;color:#e6f1fb;border:1px solid #94b2cc50;font:inherit}.pqk-lv{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px dashed #94b2cc22}";
    document.head.appendChild(s);
  }
  function build() {
    css(); P = document.createElement("div"); P.id = "pqkPanel";
    P.innerHTML = '<header><span style="font-size:20px">🌤️</span><b>Atlas Langit & Iklim<small>Awan • Angin • ENSO • Musim • Animasi peta</small></b><button class="x" id="pqkX" aria-label="Tutup">×</button></header><div class="pqk-tabs" id="pqkTabs"></div><div id="pqkBody"></div>';
    document.body.appendChild(P); $("pqkX").onclick = () => P.style.display = "none";
    $("pqkTabs").innerHTML = TABS.map(t => '<button data-t="' + t[0] + '">' + t[1] + "</button>").join("");
    $("pqkTabs").onclick = e => { const t = e.target.closest("button"); if (t) { S.tab = t.dataset.t; save(); render(); } };
  }
  function filterBox(ph) { return '<input class="pqk-q" id="pqkQ" placeholder="' + ph + '" oninput="PETAQU_KLIMAT._f(this.value)">'; }
  function render() {
    [...$("pqkTabs").children].forEach(b => b.classList.toggle("on", b.dataset.t === S.tab));
    const B = $("pqkBody"); B.scrollTop = 0; B.innerHTML = ({ awan: tAwan, angin: tAngin, enso: tEnso, musim: tMusim, fen: tFen, pintar: tPintar }[S.tab] || tAwan)();
    if (S.tab === "enso") { const q = B.querySelectorAll("select"); if (q[0]) q[0].value = S.enso; if (q[1]) q[1].value = S.iod; }
    if (S.tab === "enso" && !window.__pqOni && !window.__pqOniTry) { window.__pqOniTry = 1; fetchOni().then(ok => { if (ok && S.tab === "enso") render(); }); }
  }
  function tAwan() {
    const grp = { tinggi: "Awan Tinggi (6–18 km)", menengah: "Awan Menengah (2–7 km)", rendah: "Awan Rendah (<2 km)", menjulang: "Awan Menjulang Vertikal" };
    let h = filterBox("Cari awan… (mis. hujan, petir, kabut)");
    Object.keys(grp).forEach(k => {
      h += '<div class="pqk-mini pqk-grp" style="margin-top:4px;font-weight:700">' + grp[k] + "</div>";
      h += cardsHTML(AWAN.filter(a => a[3] === k), a => '<details class="pqk-it"><summary><span class="e">' + a[2] + '</span><span class="t">' + a[1] + " (" + a[0] + ")<small>" + esc(a[7]) + "</small></span>" + badge(RN[a[5]], RC[a[5]]) + '</summary><div class="c"><div><i>Ketinggian:</i> ' + esc(a[6]) + "</div><div><i>Cuaca:</i> " + esc(a[8]) + "</div><div><i>Dampak proyek:</i> " + esc(a[9]) + "</div></div></details>");
    });
    h += '<div class="pqk-mini pqk-grp" style="margin-top:6px;font-weight:700">Awan Khusus & Tanda Peringatan</div>';
    h += cardsHTML(AWAN2, a => '<details class="pqk-it"><summary><span class="e">' + a[1] + '</span><span class="t">' + a[0] + "<small>" + esc(a[2]) + '</small></span></summary><div class="c"><div><i>Makna:</i> ' + esc(a[3]) + "</div></div></details>");
    return h + '<div class="pqk-mini">Tips cepat: tinggi = tipis & putih → cerah/akan berubah; abu merata → hujan lama; gumpal menjulang gelap → petir & angin kencang.</div>';
  }
  function tAngin() {
    let h = filterBox("Cari angin… (mis. monsun, fohn, puting beliung)");
    const kel = [...new Set(ANGIN.map(a => a[2]))];
    kel.forEach(k => {
      h += '<div class="pqk-mini pqk-grp" style="margin-top:4px;font-weight:700">' + esc(k) + "</div>";
      h += cardsHTML(ANGIN.filter(a => a[2] === k), a => '<details class="pqk-it"><summary><span class="e">' + a[1] + '</span><span class="t">' + a[0] + "<small>" + esc(a[3]) + "</small></span>" + badge(RN[a[6]], RC[a[6]]) + '</summary><div class="c"><div><i>Sifat:</i> ' + esc(a[4]) + "</div><div><i>Waktu/musim:</i> " + esc(a[5]) + "</div><div><i>Catatan proyek:</i> " + esc(a[7]) + "</div></div></details>");
    });
    h += '<div class="pqk-box"><h4>Skala Beaufort</h4>' + BF.map((b, i) => '<div class="pqk-lv"><span><b>' + i + "</b> " + esc(b[1]) + "</span><span class='pqk-mini'>" + (i ? (i === 12 ? "≥118" : (i === 1 ? "1–5" : ([0, 0, "6–11", "12–19", "20–28", "29–38", "39–49", "50–61", "62–74", "75–88", "89–102", "103–117"][i]))) : "<1") + " km/j</span></div>").join("") + "</div>";
    return h;
  }
  function tEnso() {
    const k = ensoNow(), E = ENSO[k], oni = window.__pqOni;
    let h = '<div class="pqk-box" style="border-color:' + E.c + '88"><h4>' + E.e + " Status dipakai: " + E.n + (S.enso === "auto" ? (oni ? " (otomatis NOAA ONI " + esc(oni.s + " " + oni.y) + ": " + oni.v + ")" : " (otomatis; data NOAA belum terbaca → anggap Netral)") : " (manual)") + "</h4><div class='pqk-mini'>" + esc(E.d) + "</div></div>";
    h += '<div class="pqk-row"><label class="pqk-mini">Status ENSO<br><select class="pqk-sel" onchange="PETAQU_KLIMAT._e(this.value)"><option value="auto">Otomatis (NOAA)</option><option value="nino">El Niño</option><option value="nina">La Niña</option><option value="netral">Netral</option></select></label>' +
      '<label class="pqk-mini">IOD<br><select class="pqk-sel" onchange="PETAQU_KLIMAT._i(this.value)"><option value="netral">Netral</option><option value="plus">Positif</option><option value="minus">Negatif</option></select></label></div>';
    h += '<div class="pqk-box"><h4>Dampak umum di Indonesia</h4><ul>' + E.i.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>";
    h += '<div class="pqk-box"><h4>Saran operasional proyek jalan & jembatan</h4><ul>' + E.o.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>";
    const I = IOD[S.iod]; h += '<div class="pqk-box"><h4>' + I.n + "</h4><div class='pqk-mini'>" + esc(I.d) + "</div><div style='margin-top:4px'><b>" + esc(I.t) + "</b></div></div>";
    h += '<div class="pqk-box"><h4>Skala kekuatan (ONI)</h4><div class="pqk-lv"><span>Lemah</span><span>0,5–0,9</span></div><div class="pqk-lv"><span>Sedang</span><span>1,0–1,4</span></div><div class="pqk-lv"><span>Kuat</span><span>1,5–1,9</span></div><div class="pqk-lv"><span>Sangat kuat</span><span>≥ 2,0</span></div><div class="pqk-mini">' + esc(SIKLUS[k]) + "</div></div>";
    h += '<div class="pqk-box"><h4>Riwayat peristiwa besar (perkiraan)</h4>' + RIWAYAT.map(r => '<div class="pqk-lv"><span>' + badge(ENSO[r[1]].n, ENSO[r[1]].c) + "<b>" + r[0] + "</b> " + esc(r[2]) + "<br><span class='pqk-mini'>" + esc(r[3]) + "</span></span></div>").join("") + "</div>";
    return h + '<div class="pqk-mini">Status resmi & prakiraan: <a style="color:#22d3ee" target="_blank" rel="noopener" href="https://www.bmkg.go.id/iklim/informasi-index-enso.bmkg">BMKG</a> • <a style="color:#22d3ee" target="_blank" rel="noopener" href="https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/">NOAA CPC</a>. Angka historis dibulatkan.</div>';
  }
  function tMusim() {
    const m = new Date().getMonth(), k = ensoNow(), E = ENSO[k];
    let h = '<div class="pqk-box"><h4>Bulan ini: ' + BULAN[m] + " — " + esc(monsunNow(m)) + '</h4><div class="pqk-bar">' + MUSIM.map((x, i) => '<div class="' + (i === m ? "now" : "") + '" style="background:' + MCOL[x[0]] + '">' + BULAN[i] + "</div>").join("") + '</div><div class="pqk-mini" style="margin-top:6px"><span style="color:' + MCOL.hujan + '">■</span> Hujan  <span style="color:' + MCOL.trans + '">■</span> Peralihan  <span style="color:' + MCOL.kemarau + '">■</span> Kemarau (pola umum Jawa–Nusa Tenggara; Sumatra utara, Kalimantan, Maluku & Sulawesi tengah memiliki pola hujan berbeda).</div></div>';
    h += '<div class="pqk-box"><h4>Modifier ENSO (' + E.n + ")</h4><div class='pqk-mini'>" + esc(E.i[0]) + "</div></div>";
    h += '<div class="pqk-box"><h4>Tipe pola hujan Indonesia</h4><ul><li><b>Monsunal</b> (satu puncak hujan Des–Feb): Jawa, Bali, NTB/NTT, Sumatra selatan.</li><li><b>Ekuatorial</b> (dua puncak: Mar–Apr & Okt–Nov): Sumatra tengah, Kalimantan, Sulawesi utara.</li><li><b>Lokal</b> (puncak Jun–Agu): Maluku, Sulawesi tengah-tenggara, Papua selatan.</li></ul></div>';
    h += '<div class="pqk-box"><h4>Intensitas hujan (BMKG)</h4>' + INT_HUJAN.map(r => '<div class="pqk-lv"><span style="color:' + r[2] + '"><b>' + r[0] + "</b></span><span class='pqk-mini'>" + r[1] + "</span></div>").join("") + "</div>";
    return h;
  }
  function tFen() {
    return filterBox("Cari fenomena…") + cardsHTML(FEN, f => '<details class="pqk-it"><summary><span class="e">' + f[1] + '</span><span class="t">' + f[0] + '</span></summary><div class="c">' + esc(f[2]) + "</div></details>");
  }
  /* --- Alat pintar --- */
  const WZ = [
    ["Di posisi mana awan dominan?", ["Sangat tinggi, tipis, putih", "tinggi"], ["Menengah (terlihat abu-putih bergelombang/menutup)", "menengah"], ["Rendah (dekat bukit)", "rendah"], ["Menjulang vertikal besar & gelap", "menjulang"]],
    ["Bagaimana bentuknya?", ["Serat halus / bulu", "serat"], ["Gumpalan terpisah", "gumpal"], ["Lapisan rata menutup", "lapisan"]],
    ["Apa yang terjadi?", ["Tidak hujan", 0], ["Gerimis / hujan ringan", 1], ["Hujan terus-menerus", 2], ["Hujan lebat + petir", 3]]
  ];
  let wzA = [];
  function wizardHTML() {
    const s = wzA.length;
    if (s >= WZ.length) {
      const [l, f, r] = wzA, sc = AWAN.map(a => [a, (a[3] === l ? 3 : 0) + (a[4] === f ? 2 : 0) + (5 - Math.abs(a[5] - r) * 2) * .5]).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return '<div class="pqk-box"><h4>Kemungkinan awan Anda</h4>' + sc.map(x => '<div class="pqk-lv"><span>' + x[0][2] + " <b>" + x[0][1] + "</b> (" + x[0][0] + ")<br><span class='pqk-mini'>" + esc(x[0][8]) + "</span></span>" + badge(RN[x[0][5]], RC[x[0][5]]) + "</div>").join("") + '<button class="pqk-btn g" style="margin-top:6px" onclick="PETAQU_KLIMAT._w(-1)">Ulangi</button></div>';
    }
    const q = WZ[s];
    return '<div class="pqk-box"><h4>' + (s + 1) + "/" + WZ.length + " — " + q[0] + '</h4><div class="pqk-row">' + q.slice(1).map((o, i) => '<button class="pqk-btn g" onclick="PETAQU_KLIMAT._w(' + i + ')">' + esc(o[0]) + "</button>").join("") + "</div></div>";
  }
  function bfHTML(v) {
    const k = Math.max(0, +v || 0), i = bfIdx(k), b = BF[i];
    return '<div class="pqk-mini">' + k + " km/jam = " + (k / 3.6).toFixed(1) + " m/s = " + (k / 1.852).toFixed(1) + " knot</div><div><b>Beaufort " + i + " — " + esc(b[1]) + "</b></div><div class='pqk-mini'>" + esc(b[2]) + " " + esc(b[3]) + "</div>";
  }
  function tPintar() {
    return '<div class="pqk-box"><h4>📍 Analisis Langit & Angin (live, titik tengah peta)</h4><div class="pqk-mini">Mengambil data Open-Meteo: tutupan awan rendah/menengah/tinggi, CAPE, angin, hujan → menebak jenis awan + saran kerja.</div><div class="pqk-row" style="margin-top:6px"><button class="pqk-btn" onclick="PETAQU_KLIMAT._live()">Analisis lokasi peta</button></div><div id="pqkLive" style="margin-top:8px"></div></div>' +
      '<div class="pqk-box"><h4>🎞️ Animasi Peta</h4><div class="pqk-mini">Partikel angin bergerak + lapisan tutupan awan (putih = awan, biru = hujan) dari grid 8×6 titik pada area peta. Warna angin: biru &lt;15, kuning 15–30, oranye 30–50, merah &gt;50 km/j. Otomatis diperbarui saat peta digeser.</div><div class="pqk-row" style="margin-top:6px"><button class="pqk-btn" data-am="wind" onclick="PETAQU_KLIMAT._am(\'wind\')">💨 Angin</button><button class="pqk-btn" data-am="cloud" onclick="PETAQU_KLIMAT._am(\'cloud\')">☁️ Awan</button><button class="pqk-btn g" onclick="PETAQU_KLIMAT._am(\'off\')">⏹ Matikan</button></div><div class="pqk-mini" id="pqkAm" style="margin-top:4px"></div></div>' +
      '<div class="pqk-box"><h4>🔎 Identifikasi Awan (wizard)</h4><div id="pqkWz">' + wizardHTML() + "</div></div>" +
      '<div class="pqk-box"><h4>🌬️ Kalkulator Beaufort</h4><div class="pqk-row"><input class="pqk-q" style="max-width:140px" type="number" min="0" value="20" oninput="document.getElementById(\'pqkBf\').innerHTML=PETAQU_KLIMAT._bf(this.value)"><span class="pqk-mini" style="align-self:center">km/jam</span></div><div id="pqkBf" style="margin-top:6px">' + bfHTML(20) + "</div></div>";
  }
  async function live() {
    const o = $("pqkLive"), m = gmap(); if (!m) { o.textContent = "Peta belum siap."; return; }
    const c = m.getCenter(); o.textContent = "Memuat data langit…";
    try {
      const w = await loadLive(c.lat, c.lng), cl = inferClouds(w), ad = advisor(w), bi = bfIdx(w.wind || 0), bg = bfIdx(w.gust || 0), h = hourOf(w.time), mo = new Date().getMonth();
      o.innerHTML = '<div class="pqk-mini">' + c.lat.toFixed(3) + ", " + c.lng.toFixed(3) + " • " + esc(w.time || "") + "</div>" +
        '<div class="pqk-lv"><span>🌡️ ' + (w.temp ?? "–") + " °C • RH " + (w.rh ?? "–") + "%</span><span>🌧️ " + (w.precip ?? 0) + " mm</span></div>" +
        '<div class="pqk-lv"><span>☁️ Awan rendah/menengah/tinggi</span><span>' + (w.low ?? 0) + "/" + (w.mid ?? 0) + "/" + (w.high ?? 0) + "%</span></div>" +
        '<div class="pqk-lv"><span>⚡ CAPE (energi badai)</span><span>' + Math.round(w.cape) + " J/kg</span></div>" +
        '<div class="pqk-lv"><span>🌬️ Angin dari ' + compass(w.dir || 0) + " (" + Math.round(w.dir || 0) + "°)</span><span>" + Math.round(w.wind || 0) + " km/j (BF " + bi + "), hembusan " + Math.round(w.gust || 0) + " (BF " + bg + ")</span></div>" +
        '<div style="margin:6px 0"><b>Tebakan jenis awan:</b></div>' + cl.map(x => '<div class="pqk-lv"><span><b>' + esc(x[1]) + " (" + x[0] + ')</b></span><span class="pqk-mini">' + Math.round(x[2] * 100) + "%</span></div>").join("") +
        '<div class="pqk-mini" style="margin-top:6px">🧭 ' + esc(localWind(h)) + "<br>📅 " + esc(monsunNow(mo)) + " • ENSO: " + ENSO[ensoNow()].n + "</div>" +
        '<div style="margin:8px 0 2px"><b>Penasihat Operasional:</b></div>' + ad.map(x => '<div class="pqk-lv"><span>' + esc(x[0]) + "<br><span class='pqk-mini'>" + esc(x[2]) + "</span></span>" + badge(RN[x[1]], RC[x[1]]) + "</div>").join("") +
        '<div class="pqk-mini" style="margin-top:6px">Indikatif. Selalu ikuti SOP K3, manual alat & peringatan dini BMKG.</div>';
    } catch (e) { o.textContent = "Gagal memuat (cek koneksi). " + (e && e.message || ""); }
  }

  /* ===================== ANIMASI PETA (angin + awan) ===================== */
  const NX = 8, NY = 6; let AM = { wind: false, cloud: false, grid: null, cvW: null, cvC: null, raf: 0, parts: [], tm: 0, busy: false };
  function mkcv(z) { const c = document.createElement("canvas"); c.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;z-index:" + z; gmap().getContainer().appendChild(c); return c; }
  function sizecv() { const m = gmap(), z = m.getSize(); [AM.cvW, AM.cvC].forEach(c => { if (c && (c.width !== z.x || c.height !== z.y)) { c.width = z.x; c.height = z.y; } }); }
  async function fetchGrid() {
    const m = gmap(); if (!m || AM.busy) return; AM.busy = true;
    const b = m.getBounds().pad(.1), la = [], lo = [], pts = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const lat = Math.max(-89, Math.min(89, b.getSouth() + (b.getNorth() - b.getSouth()) * j / (NY - 1))), lng = b.getWest() + (b.getEast() - b.getWest()) * i / (NX - 1); la.push(lat.toFixed(3)); lo.push(((lng + 540) % 360 - 180).toFixed(3)); }
    try {
      const u = "https://api.open-meteo.com/v1/forecast?latitude=" + la.join(",") + "&longitude=" + lo.join(",") + "&current=wind_speed_10m,wind_direction_10m,cloud_cover,precipitation&wind_speed_unit=kmh";
      let j = await (await fetch(u)).json(); if (!Array.isArray(j)) j = [j];
      AM.grid = { b, v: j.map(o => { const c = o.current || {}, d = (c.wind_direction_10m || 0) * Math.PI / 180, sp = c.wind_speed_10m || 0; return { dx: -Math.sin(d) * sp, dy: Math.cos(d) * sp, sp, cl: c.cloud_cover || 0, pr: c.precipitation || 0 }; }) };
      drawCloud(); status();
    } catch (e) { say("Gagal memuat grid cuaca"); }
    AM.busy = false;
  }
  function say(t) { try { toast(t, 2500); } catch (e) { } }
  function status() { const o = $("pqkAm"); if (o) o.textContent = (AM.wind ? "💨 Angin " : "") + (AM.cloud ? "☁️ Awan " : "") + (AM.grid ? "• " + NX * NY + " titik grid" : ""); }
  function sample(lat, lng) {
    const g = AM.grid; if (!g) return null; const b = g.b;
    let fx = (lng - b.getWest()) / (b.getEast() - b.getWest()) * (NX - 1), fy = (lat - b.getSouth()) / (b.getNorth() - b.getSouth()) * (NY - 1);
    fx = Math.max(0, Math.min(NX - 1.001, fx)); fy = Math.max(0, Math.min(NY - 1.001, fy));
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, V = g.v, a = V[j * NX + i], c = V[j * NX + i + 1], d = V[(j + 1) * NX + i], e = V[(j + 1) * NX + i + 1], r = {};
    ["dx", "dy", "sp", "cl", "pr"].forEach(k => r[k] = (a[k] * (1 - tx) + c[k] * tx) * (1 - ty) + (d[k] * (1 - tx) + e[k] * tx) * ty); return r;
  }
  function drawCloud() {
    const c = AM.cvC; if (!c) return; sizecv(); const x = c.getContext("2d"), m = gmap(); x.clearRect(0, 0, c.width, c.height); if (!AM.cloud || !AM.grid) return;
    const st = 18; for (let py = 0; py < c.height; py += st) for (let px = 0; px < c.width; px += st) {
      const ll = m.containerPointToLatLng([px + st / 2, py + st / 2]), s = sample(ll.lat, ll.lng); if (!s) continue;
      const a = Math.min(.62, s.cl / 100 * .62), rc = s.pr > 2 ? "70,110,200" : s.pr > .2 ? "110,150,215" : "235,242,250";
      x.fillStyle = "rgba(" + rc + "," + a.toFixed(2) + ")"; x.fillRect(px, py, st, st);
    }
  }
  function loop() {
    const c = AM.cvW, m = gmap(); if (!c || !AM.wind || !AM.grid) { AM.raf = 0; return; }
    sizecv(); const x = c.getContext("2d"), W = c.width, H = c.height;
    x.globalCompositeOperation = "destination-out"; x.fillStyle = "rgba(0,0,0,.08)"; x.fillRect(0, 0, W, H); x.globalCompositeOperation = "source-over";
    while (AM.parts.length < 700) AM.parts.push({ x: Math.random() * W, y: Math.random() * H, a: Math.random() * 90 });
    AM.parts.forEach(p => {
      const ll = m.containerPointToLatLng([p.x, p.y]), s = sample(ll.lat, ll.lng); if (!s) return;
      const k = .035, nx = p.x + s.dx * k, ny = p.y + s.dy * k, col = s.sp > 50 ? "#f43f5e" : s.sp > 30 ? "#f97316" : s.sp > 15 ? "#facc15" : "#7dd3fc";
      x.strokeStyle = col; x.lineWidth = 1.4; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(nx, ny); x.stroke(); p.x = nx; p.y = ny; p.a++;
      if (p.a > 110 || nx < 0 || ny < 0 || nx > W || ny > H) { p.x = Math.random() * W; p.y = Math.random() * H; p.a = 0; }
    });
    AM.raf = requestAnimationFrame(loop);
  }
  function onMove() { clearTimeout(AM.tm); AM.tm = setTimeout(() => { if (AM.wind || AM.cloud) { fetchGrid().then(() => { AM.parts = []; }); } }, 600); }
  function animToggle(k) {
    const m = gmap(); if (!m) return say("Peta belum siap");
    if (k === "off") { AM.wind = AM.cloud = false; }
    else AM[k] = !AM[k];
    if (!AM.cvW) { AM.cvW = mkcv(451); AM.cvC = mkcv(449); m.on("moveend", onMove); }
    if (!AM.wind) AM.cvW.getContext("2d").clearRect(0, 0, AM.cvW.width, AM.cvW.height);
    sizecv(); AM.cloud || drawCloud(); status();
    if (AM.wind || AM.cloud) { (AM.grid ? Promise.resolve() : fetchGrid()).then(() => { drawCloud(); if (AM.wind && !AM.raf) AM.raf = requestAnimationFrame(loop); }); }
    const b = document.querySelectorAll("#pqkPanel [data-am]"); b.forEach(e => e.style.opacity = (e.dataset.am === "wind" ? AM.wind : AM.cloud) ? 1 : .6);
  }
  function open() { if (!P) build(); P.style.display = "flex"; render(); }
  function init() {
    const b = document.createElement("button"); b.id = "pqkBtn"; b.innerHTML = '<i class="fa-solid fa-cloud-sun-rain"></i>'; b.title = "Atlas Langit & Iklim (awan, angin, ENSO)"; b.onclick = () => (P && P.style.display === "flex") ? (P.style.display = "none") : open();
    const put = () => { try { PQ_DOCK.adopt(b, "Awan, Angin & ENSO"); } catch (e) { b.style.cssText = "position:fixed;left:10px;bottom:260px;z-index:900"; document.body.append(b); } };
    typeof PQ_DOCK !== "undefined" ? put() : setTimeout(put, 1000);
  }
  window.PETAQU_KLIMAT = {
    open, _live: live, _am: animToggle, _bf: bfHTML,
    _e: v => { S.enso = v; save(); render(); }, _i: v => { S.iod = v; save(); render(); },
    _w: i => { if (i < 0) wzA = []; else wzA.push(WZ[wzA.length][i + 1][1]); const d = $("pqkWz"); if (d) d.innerHTML = wizardHTML(); },
    _f: q => { q = (q || "").toLowerCase(); document.querySelectorAll("#pqkBody .pqk-it").forEach(e => e.style.display = e.textContent.toLowerCase().includes(q) ? "" : "none"); },
    _infer: inferClouds, _advisor: advisor, _bfi: bfIdx
  };
  if (typeof document !== "undefined") document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
