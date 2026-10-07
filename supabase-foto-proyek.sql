-- PETAQU: penyimpanan FOTO PEKERJAAN proyek jalan & jembatan (pengaspalan, pengecoran, dll.)
-- Jalankan di Supabase > SQL Editor SETELAH supabase-schema.sql (butuh tabel profiles + fungsi my_role()).
-- Aman dijalankan ulang.
--
-- Akses (sesuai peran PETAQU yang sudah ada):
--   admin, surveyor, viewer  = login penuh: boleh MELIHAT dan MENGUNGGAH foto
--   admin                    = boleh menghapus/mengubah SEMUA foto; surveyor & viewer hanya foto miliknya sendiri
--   pending / trial / blocked = tidak punya akses sama sekali (akun gratisan/trial ditolak)

-- 1) Bucket penyimpanan (PRIVAT, maks 5 MB per file, hanya gambar)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto-proyek', 'foto-proyek', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- 2) Tabel metadata foto
create table if not exists project_photos (
  id            uuid primary key default gen_random_uuid(),
  paket         text,                       -- nama/nomor paket pekerjaan
  ruas_id       text,                       -- id ruas (cocok dgn roads.id bila ada)
  ruas_nama     text,
  jembatan      text,                       -- nama jembatan bila foto jembatan
  km_sta        text,                       -- mis. "KM 12+300" / "STA 3+150"
  jenis         text not null default 'lainnya',   -- mis. ac_wc, ac_bc, lpa, rigid, galian, jembatan_girder ...
  tahap         text not null default 'sedang' check (tahap in ('sebelum','sedang','sesudah')),
  progres       smallint check (progres between 0 and 100),
  lat           double precision,
  lng           double precision,
  akurasi_m     real,
  taken_at      timestamptz,                -- waktu foto diambil (EXIF)
  catatan       text,
  nama_file     text,
  storage_path  text not null,              -- path di bucket, mis. <user_id>/2026/<uuid>.jpg
  thumb_path    text,                       -- thumbnail (opsional)
  size_bytes    integer,
  uploaded_by   uuid not null default auth.uid() references auth.users,
  created_at    timestamptz not null default now()
);
create index if not exists project_photos_paket_idx  on project_photos (paket);
create index if not exists project_photos_ruas_idx   on project_photos (ruas_id);
create index if not exists project_photos_jenis_idx  on project_photos (jenis);
create index if not exists project_photos_taken_idx  on project_photos (taken_at desc);
create index if not exists project_photos_user_idx   on project_photos (uploaded_by);

alter table project_photos enable row level security;

drop policy if exists "baca foto proyek"  on project_photos;
drop policy if exists "tulis foto proyek" on project_photos;
drop policy if exists "ubah foto proyek"  on project_photos;
drop policy if exists "hapus foto proyek" on project_photos;

create policy "baca foto proyek"  on project_photos for select
  using (my_role() in ('admin','surveyor','viewer'));
create policy "tulis foto proyek" on project_photos for insert
  with check (my_role() in ('admin','surveyor','viewer') and uploaded_by = auth.uid());
create policy "ubah foto proyek"  on project_photos for update
  using (my_role() = 'admin' or (my_role() in ('surveyor','viewer') and uploaded_by = auth.uid()));
create policy "hapus foto proyek" on project_photos for delete
  using (my_role() = 'admin' or (my_role() in ('surveyor','viewer') and uploaded_by = auth.uid()));

-- 3) Aturan akses FILE di bucket 'foto-proyek'
--    Aturan path: file HARUS di dalam folder bernama user id pengunggah:  <user_id>/....
drop policy if exists "foto-proyek baca"   on storage.objects;
drop policy if exists "foto-proyek unggah" on storage.objects;
drop policy if exists "foto-proyek hapus"  on storage.objects;

create policy "foto-proyek baca" on storage.objects for select to authenticated
  using (bucket_id = 'foto-proyek' and my_role() in ('admin','surveyor','viewer'));
create policy "foto-proyek unggah" on storage.objects for insert to authenticated
  with check (bucket_id = 'foto-proyek' and my_role() in ('admin','surveyor','viewer')
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "foto-proyek hapus" on storage.objects for delete to authenticated
  using (bucket_id = 'foto-proyek' and (my_role() = 'admin'
         or (my_role() in ('surveyor','viewer') and (storage.foldername(name))[1] = auth.uid()::text)));

-- 4) Cek cepat (opsional): jalankan setelah ada data
-- select jenis, tahap, count(*) from project_photos group by 1,2 order by 3 desc;
