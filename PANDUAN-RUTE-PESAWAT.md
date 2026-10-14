# Rute Pesawat Indonesia (modul `petaqu-pesawat.js`)

Tombol **Rute Pesawat** ada di dock "Alat" (kiri-bawah). Isi:

- **✈️ Rute** – cari rute bandara↔bandara, atau dari/ke **titik peta, lokasi Anda, ruas jalan, lokasi AMP/BP/Quarry**
  (otomatis menambah leg darat ke bandara berjadwal terdekat). Hasil: Terbaik / Tercepat / Termurah / Langsung,
  jam lokal WIB/WITA/WIT, layover, tarif perkiraan, CO₂, pesawat beranimasi di peta, tombol salin ringkasan.
- **🛬 Bandara** – katalog bandara per pulau, tombol Dari/Ke/Rute/Lihat, **tutup bandara (skenario)**.
- **📍 Terdekat** – bandara terdekat dari pusat peta / GPS / klik peta / ruas proyek, dengan jarak jalan & waktu.
- **🕸️ Jaringan** – hub terbesar, rute terjauh, keterhubungan, tampilkan seluruh rute & bandara di peta.
- **⚙️ Data** – skenario bandara/rute tutup, tambah rute & bandara kustom, ekspor CSV/JSON, impor JSON.

## Memperbarui data
Edit `data-bandara.js`: `BANDARA_DATA` (bandara) dan `RUTE_DATA` (`"CGK: DPS SUB ..."`, otomatis dua arah).
Naikkan `?v=` di `index.html` dan `sw.js` agar cache perangkat diperbarui.

## Catatan akurasi
Jaringan rute = pola umum maskapai (indikatif). Durasi = model jarak (jet 760 km/j, baling-baling 450 km/j)
+ 22–28 mnt; tarif = model jarak kelas ekonomi; darat 45 km/j, jarak jalan = garis lurus × 1,35.
Selalu cek jadwal & harga resmi maskapai.
