# Kontrol Uji Coba Gratis (khusus admin)

Hanya akun ber-peran **admin** yang bisa melihat dan mengubah pengaturan gratis. Semua aturan dijalankan di server
(Supabase), bukan di browser, jadi tidak bisa dibobol dengan mengutak-atik halaman.

## Pasang (sekali)
1. Supabase > SQL Editor > jalankan **`supabase-gratis-kontrol.sql`** — jalankan **paling akhir**, setelah
   `supabase-trial.sql`, `supabase-akses-admin.sql` (dan `supabase-langganan.sql` / `supabase-riwayat-pengguna.sql` bila dipakai).
   Bila kamu menjalankan ulang `supabase-riwayat-pengguna.sql` di kemudian hari, jalankan file ini sekali lagi sesudahnya.
2. Unggah file situs yang baru/berubah: `petaqu-trial.js`, `petaqu-admin.js`, `petaqu-gratis.js`, `petaqu-sebaran.js`.
3. Buka aplikasi sebagai admin > menu **Persetujuan akses** > tab **⚡ Kontrol Gratis**.

> Setelah SQL dipasang, gratis **MATI** sampai kamu menyalakannya. Selama mati, tombol "Coba Gratis" tidak tampil sama sekali
> di layar login (pengunjung tidak tahu fitur ini ada). Tombol "Masuk dengan email / username" untuk admin tetap ada.

## Isi tab Kontrol Gratis
| Bagian | Fungsi |
|---|---|
| Saklar | Nyalakan / matikan gratis. Tersimpan langsung. |
| Hentikan yang berjalan | Memutus semua uji coba yang sedang jalan (berlaku di perangkat ≤ ±1 menit). |
| Statistik | Berjalan kini, hari ini vs kuota, 7 hari, % jadi pelanggan, ditolak 24 jam, perangkat ganda, grafik klaim per jam. |
| Penasihat cerdas | Membaca pengaturan + statistik lalu memberi peringatan/saran; tombol "Terapkan rekomendasi terbaik". |
| Pengaturan | Lama gratis (menit, 1–1440), kuota harian/total, maks per jam (anti-lonjakan), maks per sidik perangkat, jam buka WIB, tanggal tutup otomatis, pesan saat waktu habis. Ada preset: Rekomendasi, Ketat, Jam kerja, Event 24 jam, Demo terbatas. |
| Undangan khusus | Tautan pribadi `?gratis=KODE` berisi menit sendiri. Sekali pakai, tetap bisa dipakai walau gratis umum mati / kuota habis. Gmail boleh diisi (jatah lama Gmail itu dihapus & akun dibuka kuncinya). |
| Klaim terbaru | 40 klaim terakhir: Hentikan, Jatah ulang, Blokir email, Blokir perangkat. |
| Daftar blokir | Email / perangkat yang ditolak selamanya sampai blokir dibuka. |

## Rekomendasi pengaturan (bila ragu)
10–15 menit · kuota 30/hari · 10/jam · 1 per perangkat · isi "Pesan saat waktu habis" dengan nomor WhatsApp admin.

## Catatan teknis
- Menit disimpan **per klaim** saat klaim dibuat; mengubah menit tidak memotong/menambah uji coba yang sedang berjalan.
- Penolakan sementara (mati, tutup, kuota habis, penuh) **tidak mengunci akun Google** pengunjung — mereka bisa coba lagi nanti.
- Pengunjung hanya bisa menanyakan "perlu tampil atau tidak?" (jawaban ya/tidak); angka kuota/menit tidak pernah dikirim ke mereka.
- Undangan untuk Gmail yang **sudah pernah** memakai uji coba sebaiknya diisi emailnya (agar kunci akunnya dibuka). Undangan tanpa email cocok untuk Gmail baru.
- Bila SQL belum dipasang atau server tak terjangkau, tombol gratis disembunyikan (aman secara bawaan).
