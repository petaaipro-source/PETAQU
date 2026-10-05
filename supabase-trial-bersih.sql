-- Jalankan di Supabase > SQL Editor SETELAH supabase-trial.sql. Langkah 1-2 aman dijalankan ulang.

-- 1) LIHAT dulu siapa saja dan perannya. Pengguna uji coba = role 'trial'. Pelanggan berbayar harus 'viewer' / 'surveyor' / 'admin'.
select u.email, p.role, u.created_at, u.last_sign_in_at, u.banned_until
  from auth.users u left join profiles p on p.id = u.id
 order by u.created_at desc;

-- 2) KUNCI akun uji coba yang SUDAH memakai jatah 10 menitnya (akun trial yang belum klaim dibiarkan agar masih bisa mencoba).
update auth.users u set banned_until = now() + interval '100 years'
 where u.id in (select id from profiles where role = 'trial')
   and exists (select 1 from trial_claims c
                where c.email = replace(split_part(split_part(lower(u.email), '@', 1), '+', 1), '.', '') || '@gmail.com');

-- 3) UPGRADE pelanggan yang sudah membayar (ganti emailnya, jalankan dua baris ini):
--   update profiles set role = 'viewer' where id = (select id from auth.users where email = 'pelanggan@gmail.com');
--   update auth.users set banned_until = null where email = 'pelanggan@gmail.com';

-- 4) Akun biasa yang tidak sengaja ter-ban (BUKAN pengguna uji coba):
--   update auth.users set banned_until = null where email = 'orang@contoh.com';
