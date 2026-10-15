# Rute Pesawat Indonesia (modul `petaqu-pesawat.js`)

Tombol **Rute Pesawat** ada di dock "Alat" (kiri-bawah). Isi:

- **✈️ Rute** – cari rute bandara↔bandara, atau dari/ke **titik peta, lokasi Anda, ruas jalan, lokasi AMP/BP/Quarry**.
  Hasil: Terbaik / Tercepat / Termurah / Langsung / **Darat saja**, jam lokal WIB/WITA/WIT, layover, tarif perkiraan, CO₂,
  kendaraan beranimasi di peta (pesawat ✈ di udara, 🚗/🚆/🚌 di darat), tombol salin ringkasan.
- **🛬 Bandara** – katalog bandara per pulau, tombol Dari/Ke/Rute/Lihat, **tutup bandara (skenario)**.
- **📍 Terdekat** – bandara terdekat dari pusat peta / GPS / klik peta / ruas proyek, dengan jarak jalan & waktu.
- **🕸️ Jaringan** – hub terbesar, rute terjauh, keterhubungan, tampilkan seluruh rute & bandara di peta.
- **⚙️ Data** – skenario bandara/rute tutup, tambah rute & bandara kustom, ekspor CSV/JSON, impor JSON.

## Perjalanan darat yang logis (baru)
Bila asal/tujuan bukan bandara, modul menambah leg darat ke bandara berjadwal dengan aturan:

1. **Satu pulau saja** – leg darat tidak pernah menyeberangi laut. Titik di Kalimantan hanya dihubungkan ke bandara Kalimantan, dst.
2. **Multi-moda** per leg, bisa diganti lewat tombol di *Rincian perjalanan*:
   🚗 mobil/taksi/ojol · 🚌 bus/travel/DAMRI · 🚆 kereta api (+ 🚈 KA Bandara bila stasiun terhubung: CGK, YIA, SOC, JOG, MES, PDG; atau taksi/ojol dari stasiun).
3. **Jalan nyata** – jarak & waktu mobil/bus memakai OSRM (OpenStreetMap), garis di peta mengikuti jalan.
   Bila OSRM tak terjangkau, otomatis kembali ke estimasi (garis lurus × 1,35) dan diberi tanda "≈ estimasi".
4. **Bandara kandidat dipilih cerdas** – bukan sekadar yang terdekat: dinilai dari waktu+biaya darat, ditambah hub besar di sekitar.
   Darat > 7 jam ditolak; darat panjang diberi penalti kelelahan pada skor "Terbaik".
5. **Darat saja** – bila asal & tujuan satu pulau dan cukup dekat (Jawa ≤ 650 km, Sumatera ≤ 450 km, lainnya ≤ 300 km),
   opsi kereta/bus/mobil tanpa pesawat ikut dibandingkan.

## Memperbarui data
- Bandara & rute: edit `data-bandara.js` (`BANDARA_DATA`, `RUTE_DATA` `"CGK: DPS SUB ..."`, otomatis dua arah).
- Stasiun kereta & tautan KA Bandara: edit tabel `STA` di `petaqu-pesawat.js`
  (`[nama, lat, lng, pulau, kode bandara terhubung, menit, tarif]`).
- Bandara di pulau kecil terpisah (tak bisa dicapai lewat darat): daftar `ISO` di `petaqu-pesawat.js`.
Naikkan `?v=` di `index.html` dan `sw.js` agar cache perangkat diperbarui.

## Catatan akurasi
Jaringan rute & KA Bandara = pola umum (indikatif). Durasi terbang = model jarak (jet 760 km/j, baling-baling 450 km/j)
+ 22–28 mnt; kereta ±55 km/j dari jarak ×1,28; tarif = model jarak. Selalu cek jadwal & harga resmi maskapai/KAI/Railink.
