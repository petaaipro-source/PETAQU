# UPDATE 16 Okt 2026 — harga baru + deploy otomatis lewat GitHub

**Harga:** 1 bln Rp 99.900 · 3 bln 269.900 · 6 bln 499.900 · 1 th 899.900 · 2 th 1.599.900 · 3 th 2.199.900 (diskon .ac.id/.sch.id 30% tetap). Jalankan `supabase-harga-baru.sql` sekali di SQL Editor (juga mengubah pembulatan ke Rp 100).

**Fungsi server kini ada di repo** (`supabase/functions/`). Cukup push ke GitHub; workflow `.github/workflows/deploy-supabase.yml` men-deploy otomatis. Isi 3 secret di GitHub (Settings → Secrets → Actions): `SUPABASE_ACCESS_TOKEN`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_ENV` (`sandbox`/`production`). Payment Notification URL Midtrans: `https://fhulmqwuzswxrqjcioww.supabase.co/functions/v1/qris-webhook`.

**Syarat go-live:** akun Midtrans Production harus lolos Business registration/review dulu (QRIS statis GoPay Merchant tidak bisa mendeteksi pembayaran otomatis). Sebelum itu, uji pakai Sandbox.

---
# Bayar QRIS otomatis — akun aktif sendiri, tanpa admin klik

## Cara kerja
1. Pengguna ketuk **Bayar / Perpanjang via QRIS** (layar login) atau **Bayar sekarang** (setelah daftar) → pilih lama langganan, isi email.
2. Server membuat **QRIS dinamis dengan nominal pas** (harga dihitung di database, tidak bisa diakali dari browser).
3. Pengguna scan dengan GoPay / OVO / DANA / ShopeePay / m-banking apa pun.
4. Midtrans memanggil `qris-webhook` → server memverifikasi tanda tangan **dan** mengecek ulang ke Midtrans → akun aktif + masa aktif terisi + tercatat di riwayat bayar. Layar pengguna otomatis berubah "Akun aktif".
5. Cadangan bila webhook terlambat: layar bayar menanyakan status tiap ±9 detik lewat `qris-cek`.

Kasus khusus (semua otomatis):
- **Perpanjang**: sisa masa aktif tidak hangus, ditambah di belakangnya.
- **Bayar sebelum punya akun**: pembayaran disimpan, akun aktif begitu email itu mendaftar.
- **Akun diblokir / admin / sudah tanpa batas waktu / nominal tidak cocok**: status `ditahan`, tidak ada yang diubah (lihat bagian Admin).
- **Webhook ganda / QR dibayar dua kali**: aman, hanya diterapkan sekali.
- Akun uji coba (dikunci) otomatis dibuka saat bayar. Peran hasil bayar = `viewer` (peran `surveyor` yang sudah ada tidak diturunkan).

## Harga awal (ubah kapan saja)
| Lama | Harga | Per bulan |
|---|---|---|
| 1 bulan | Rp 49.000 | 49.000 |
| 3 bulan | Rp 129.000 | 43.000 |
| 6 bulan | Rp 239.000 | 39.833 |
| 1 tahun | Rp 429.000 | 35.750 |
| 2 tahun | Rp 749.000 | 31.208 |
| 3 tahun | Rp 999.000 | 27.750 |

Email berakhiran `.ac.id` / `.sch.id` otomatis diskon 30% (berdasarkan domain email). Ubah di SQL Editor:
```sql
update harga_langganan set harga = 59000 where bulan = 1;
update diskon_domain set persen = 40 where akhiran = 'ac.id';
insert into diskon_domain values ('go.id', 20, 'Instansi pemerintah');   -- contoh diskon baru
```
Berlaku untuk order berikutnya. Biaya QRIS Midtrans (sekitar 0,7%) ditanggung Anda, bukan pembeli.

## Pemasangan (±20 menit)

### A. Midtrans (sekali)
1. Daftar di https://midtrans.com → buat merchant → aktifkan **QRIS** (GoPay QRIS). Mulai dari **Sandbox** untuk uji coba.
2. **Settings → Access Keys**: salin **Server Key** (sandbox dulu).
3. **Settings → Configuration → Payment Notification URL**: isi
   `https://fhulmqwuzswxrqjcioww.supabase.co/functions/v1/qris-webhook`
   (sandbox dan production masing-masing punya pengaturan sendiri).

### B. Supabase
1. **SQL Editor** → tempel isi `supabase-qris-otomatis.sql` → Run (setelah `supabase-langganan.sql` dan `supabase-langganan-pilihan.sql`). Hasil akhir menampilkan daftar harga.
2. Pasang Supabase CLI (https://supabase.com/docs/guides/cli), lalu di folder proyek ini:
```bash
supabase login
supabase link --project-ref fhulmqwuzswxrqjcioww
supabase secrets set MIDTRANS_SERVER_KEY="SB-Mid-server-xxxx" MIDTRANS_ENV="sandbox"
supabase functions deploy qris-buat  --no-verify-jwt
supabase functions deploy qris-cek   --no-verify-jwt
supabase functions deploy qris-webhook --no-verify-jwt
```
`--no-verify-jwt` wajib (browser memakai kunci "publishable", bukan JWT; setiap fungsi sudah memeriksa sendiri).
Bila situs Anda bukan `petaqu.my.id`, tambahkan: `supabase secrets set ALLOWED_ORIGINS="https://domain-anda.com,https://petaqu.my.id"`.

### C. Unggah ke GitHub (timpa yang lama)
`index.html`, `sw.js`, `petaqu-auth.js`, `petaqu-daftar.js`, `petaqu-qris.js`, plus file baru `petaqu-bayar.js` dan `petaqu-qrgen.js`.
(Folder `supabase/` dan file `.sql` tidak perlu diunggah ke situs; simpan saja di repo.)

### D. Uji di Sandbox
1. Buka situs → **Bayar / Perpanjang via QRIS** → pakai email akun uji → pilih 1 bulan → muncul QR.
2. Buka https://simulator.sandbox.midtrans.com/qris/index → tempel kode/URL QR → **Pay**.
3. Layar bayar berubah "Pembayaran diterima — akun aktif!" dalam beberapa detik. Cek di panel admin → riwayat bayar: metode **QRIS otomatis**.

### E. Go live
```bash
supabase secrets set MIDTRANS_SERVER_KEY="Mid-server-xxxx(production)" MIDTRANS_ENV="production"
```
Isi Payment Notification URL di mode **Production** Midtrans (URL sama), lalu uji dengan paket 1 bulan dan uang sungguhan.

## Admin
Daftar order (yang `ditahan` / belum diterapkan paling atas), di SQL Editor atau lewat `rpc('admin_order_qris')`:
```sql
select order_id, email, bulan, jumlah, status, diterapkan, sampai, catatan
  from order_qris order by (status = 'ditahan') desc, dibuat desc limit 50;
```
Order `ditahan`: putuskan manual (refund lewat dashboard Midtrans, atau atur akun dengan panel admin / `admin_perpanjang`).

## Keamanan (ringkas)
- Server Key hanya di Secrets Supabase, tidak pernah ke browser atau GitHub.
- Harga & nominal ditentukan database; pembayaran hanya diterima bila nominal dari Midtrans **sama persis** dengan order.
- Webhook dicek tanda tangan SHA-512, lalu status dicek ulang langsung ke API Midtrans (webhook palsu tidak berguna).
- Tabel order dan fungsi aktivasi tidak bisa diakses dari browser (hanya service_role).
- `order_id` acak 128-bit; status order tidak membocorkan email.

## Ganti gateway lain (Xendit, Tripay, dll.)
Hanya `supabase/functions/_shared/midtrans.ts` (buat QR, cek status, verifikasi signature) yang perlu diganti; SQL dan tampilan tidak berubah.
