-- PETAQU: RIWAYAT lengkap pengguna (login/sesi, perangkat, lokasi, uji coba GRATIS, peran, pembayaran, hapus akun).
-- Jalankan di Supabase > SQL Editor SETELAH supabase-sebaran-pengguna.sql, supabase-trial.sql & supabase-langganan.sql. Aman dijalankan ulang.
--
-- Mengapa tabel baru?
--  * Akun uji coba gratis DIKUNCI lalu bisa DIHAPUS (on delete cascade) -> catatan perangkat ikut hilang.
--    Tabel riwayat_akses sengaja TANPA foreign key + menyimpan salinan email, jadi jejak pengguna gratis tetap ada.
--
-- Keamanan (sama seperti fitur sebaran):
--  * RLS aktif TANPA policy  -> tidak bisa dibaca/ditulis langsung lewat API oleh siapa pun.
--  * Penulisan hanya lewat fungsi/trigger internal (SECURITY DEFINER). Pembacaan hanya lewat admin_riwayat_*() yang menolak non-admin.
--  * Alamat IP TIDAK disimpan. Yang dicatat: jenis kejadian, waktu, email, perangkat, perkiraan kota. Sidik jari perangkat hanya 8 karakter awal.

-- 1) Tabel riwayat ---------------------------------------------------------------
create table if not exists riwayat_akses (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  jenis     text not null,     -- daftar | sesi | perangkat_baru | lokasi_baru | trial_klaim | trial_lanjut | trial_ditolak | trial_info | peran | bayar | hapus_akun
  user_id   uuid,              -- TANPA foreign key: tetap ada setelah akun dihapus
  email     text,              -- salinan email saat kejadian
  oleh      uuid,              -- admin yang melakukan (bila ada)
  device_id text,
  detail    jsonb not null default '{}'::jsonb,
  kunci     text unique        -- mencegah data ganda (isi-ulang riwayat lama & kejadian sekali-saja)
);
alter table riwayat_akses enable row level security;      -- sengaja tanpa policy
revoke all on riwayat_akses from anon, authenticated;
create index if not exists riwayat_akses_at_idx    on riwayat_akses (at desc);
create index if not exists riwayat_akses_email_idx on riwayat_akses (lower(email), at desc);
create index if not exists riwayat_akses_jenis_idx on riwayat_akses (jenis, at desc);

-- durasi sesi: perangkat_pengguna menyimpan awal sesi & baris kejadiannya
alter table perangkat_pengguna add column if not exists sesi_mulai timestamptz;
alter table perangkat_pengguna add column if not exists sesi_event bigint;

-- 2) Pencatat internal (gagal mencatat TIDAK PERNAH boleh mengganggu proses utama) --
create or replace function catat_riwayat(p_jenis text, p_user uuid, p_email text, p_device text, p_detail jsonb default '{}'::jsonb, p_kunci text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare nid bigint;
begin
  insert into riwayat_akses (jenis, user_id, email, oleh, device_id, detail, kunci)
  values (left(p_jenis, 24), p_user, left(lower(p_email), 120), auth.uid(), left(p_device, 64), coalesce(p_detail, '{}'::jsonb), p_kunci)
  on conflict (kunci) do nothing
  returning id into nid;
  return nid;
exception when others then
  return null;
end $$;
revoke all on function catat_riwayat(text, uuid, text, text, jsonb, text) from public, anon, authenticated;

-- 3) Pendaftaran akun baru & penghapusan akun --------------------------------------
create or replace function riwayat_trg_daftar() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform catat_riwayat('daftar', new.id, new.email, null, jsonb_build_object('provider', coalesce(new.raw_app_meta_data->>'provider', '')));
  return new;
exception when others then return new;
end $$;
drop trigger if exists riwayat_signup on auth.users;
create trigger riwayat_signup after insert on auth.users for each row execute function riwayat_trg_daftar();

create or replace function riwayat_trg_hapus() returns trigger language plpgsql security definer set search_path = public as $$
declare rl text;
begin
  select role into rl from profiles where id = old.id;
  perform catat_riwayat('hapus_akun', old.id, old.email, null,
    jsonb_build_object('peran_terakhir', coalesce(rl, '?'), 'terdaftar', old.created_at, 'login_terakhir', old.last_sign_in_at));
  return old;
exception when others then return old;
end $$;
drop trigger if exists riwayat_delete on auth.users;
create trigger riwayat_delete before delete on auth.users for each row execute function riwayat_trg_hapus();

-- 4) Perubahan peran (pending -> trial -> viewer -> blocked, dst.) -------------------
create or replace function riwayat_trg_peran() returns trigger language plpgsql security definer set search_path = public as $$
declare em text;
begin
  if new.role is distinct from old.role then
    select email into em from auth.users where id = new.id;
    perform catat_riwayat('peran', new.id, em, null, jsonb_build_object('dari', old.role, 'ke', new.role));
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists riwayat_profiles_peran on profiles;
create trigger riwayat_profiles_peran after update of role on profiles for each row execute function riwayat_trg_peran();

-- 5) Pembayaran ------------------------------------------------------------------------
create or replace function riwayat_trg_bayar() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform catat_riwayat('bayar', new.user_id, new.email, null,
    jsonb_build_object('bulan', new.bulan, 'jumlah', new.jumlah, 'metode', new.metode, 'sampai', new.sampai), 'by:' || new.id);
  return new;
exception when others then return new;
end $$;
drop trigger if exists riwayat_pembayaran on pembayaran;
create trigger riwayat_pembayaran after insert on pembayaran for each row execute function riwayat_trg_bayar();

-- 6) Uji coba GRATIS: klaim berhasil / dilanjutkan / ditolak --------------------------
--    (menggantikan claim_trial_g dari supabase-trial.sql; perilakunya sama, hanya ditambah pencatatan)
create or replace function claim_trial_g(p_device text, p_fp text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); res jsonb; had boolean; jns text;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'no_auth'); end if;
  had := exists (select 1 from trial_claims where device_id = p_device);
  res := claim_trial_inner(uid, auth.jwt(), p_device, p_fp);
  perform kunci_trial(uid);          -- apa pun hasilnya, akun uji coba tidak boleh punya akses login
  if coalesce((res->>'ok')::boolean, false) then jns := case when had then 'trial_lanjut' else 'trial_klaim' end;
  else jns := 'trial_ditolak'; end if;
  perform catat_riwayat(jns, uid, auth.jwt()->>'email', p_device,
    jsonb_build_object('alasan', res->>'reason', 'sisa', res->'remaining', 'fp', left(coalesce(p_fp, ''), 8)));
  return res;
end $$;
revoke all on function claim_trial_g(text, text) from public;
grant execute on function claim_trial_g(text, text) to authenticated;

-- Info perangkat & perkiraan lokasi pengguna gratis (dikirim aplikasi sesaat setelah klaim; sekali per perangkat)
create or replace function catat_info_trial(p_device text, p_info jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); did text := left(coalesce(p_device, ''), 64);
begin
  if uid is null or did = '' or p_info is null then return; end if;
  if not exists (select 1 from trial_claims where device_id = did) then return; end if;
  if not exists (select 1 from profiles where id = uid and role = 'trial') then return; end if;
  perform catat_riwayat('trial_info', uid, auth.jwt()->>'email', did,
    jsonb_build_object('jenis', left(p_info->>'jenis', 12), 'os', left(p_info->>'os', 40), 'browser', left(p_info->>'browser', 40),
      'model', left(p_info->>'model', 60), 'layar', left(p_info->>'layar', 24), 'bahasa', left(p_info->>'bahasa', 16),
      'zona', left(p_info->>'zona', 48), 'jaringan', left(p_info->>'jaringan', 12), 'negara', left(p_info->>'negara', 60),
      'provinsi', left(p_info->>'provinsi', 80), 'kota', left(p_info->>'kota', 80)),
    'ti:' || uid || ':' || did);
end $$;
revoke all on function catat_info_trial(text, jsonb) from public, anon;
grant execute on function catat_info_trial(text, jsonb) to authenticated;

-- 7) Pencatat perangkat: kini juga menulis riwayat (sesi baru, perangkat baru, pindah lokasi, durasi sesi) --------
create or replace function catat_perangkat(
  p_device_id text, p_jenis text default null, p_os text default null, p_browser text default null,
  p_model text default null, p_layar text default null, p_bahasa text default null, p_zona text default null,
  p_pwa boolean default false, p_jaringan text default null, p_negara text default null, p_provinsi text default null,
  p_kota text default null, p_lat numeric default null, p_lng numeric default null, p_sumber text default 'ip')
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); did text := left(p_device_id, 64); o perangkat_pengguna; n perangkat_pengguna; em text; det jsonb; ev bigint;
begin
  if uid is null or coalesce(p_device_id, '') = '' then return; end if;
  select * into o from perangkat_pengguna where user_id = uid and device_id = did;
  insert into perangkat_pengguna as d
    (user_id, device_id, jenis, os, browser, model, layar, bahasa, zona, pwa, jaringan, negara, provinsi, kota, lat, lng, sumber)
  values
    (uid, did,
     case when p_jenis in ('mobile','tablet','desktop') then p_jenis else 'desktop' end,
     left(p_os, 40), left(p_browser, 40), left(p_model, 60), left(p_layar, 24), left(p_bahasa, 16), left(p_zona, 48),
     coalesce(p_pwa, false), left(p_jaringan, 12), left(p_negara, 60), left(p_provinsi, 80), left(p_kota, 80),
     case when p_lat between -90  and 90  then round(p_lat, 2) end,
     case when p_lng between -180 and 180 then round(p_lng, 2) end,
     case when p_sumber in ('ip','gps','zona') then p_sumber else 'ip' end)
  on conflict (user_id, device_id) do update set
    jenis = excluded.jenis, os = excluded.os, browser = excluded.browser,
    model = coalesce(excluded.model, d.model), layar = excluded.layar, bahasa = excluded.bahasa, zona = excluded.zona,
    pwa = excluded.pwa, jaringan = excluded.jaringan,
    negara = coalesce(excluded.negara, d.negara), provinsi = coalesce(excluded.provinsi, d.provinsi),
    kota = coalesce(excluded.kota, d.kota), lat = coalesce(excluded.lat, d.lat), lng = coalesce(excluded.lng, d.lng),
    sumber = excluded.sumber, terakhir = now(), jml_akses = d.jml_akses + 1;

  begin   -- pencatatan riwayat: kegagalan di sini tidak boleh membatalkan catatan perangkat
    select * into n from perangkat_pengguna where user_id = uid and device_id = did;
    select email into em from auth.users where id = uid;
    det := jsonb_build_object('jenis', n.jenis, 'os', n.os, 'browser', n.browser, 'model', n.model, 'kota', n.kota,
                              'provinsi', n.provinsi, 'negara', n.negara, 'pwa', n.pwa, 'jaringan', n.jaringan, 'sumber', n.sumber);
    if o.user_id is null then                                   -- perangkat ini belum pernah tercatat
      ev := catat_riwayat('perangkat_baru', uid, em, did, det);
      update perangkat_pengguna set sesi_mulai = now(), sesi_event = ev where user_id = uid and device_id = did;
    elsif now() - o.terakhir > interval '30 minutes' then       -- jeda > 30 menit = sesi baru
      ev := catat_riwayat('sesi', uid, em, did,
              det || jsonb_build_object('jeda_menit', round(extract(epoch from (now() - o.terakhir)) / 60)));
      update perangkat_pengguna set sesi_mulai = now(), sesi_event = ev where user_id = uid and device_id = did;
      if o.kota is not null and n.kota is not null and (o.kota is distinct from n.kota or o.provinsi is distinct from n.provinsi) then
        perform catat_riwayat('lokasi_baru', uid, em, did,
          jsonb_build_object('dari', concat_ws(', ', o.kota, o.provinsi), 'ke', concat_ws(', ', n.kota, n.provinsi),
                             'kota', n.kota, 'provinsi', n.provinsi, 'negara', n.negara));
      end if;
    elsif o.sesi_event is not null and o.sesi_mulai is not null then   -- sesi masih berjalan: perbarui durasinya
      update riwayat_akses set detail = detail || jsonb_build_object('menit', greatest(1, round(extract(epoch from (now() - o.sesi_mulai)) / 60)))
       where id = o.sesi_event;
    end if;
  exception when others then null;
  end;
end $$;
revoke all on function catat_perangkat(text,text,text,text,text,text,text,text,boolean,text,text,text,text,numeric,numeric,text) from public, anon;
grant execute on function catat_perangkat(text,text,text,text,text,text,text,text,boolean,text,text,text,text,numeric,numeric,text) to authenticated;

-- 8) Isi-ulang riwayat lama (sekali; aman diulang karena memakai kunci unik) -------------
insert into riwayat_akses (at, jenis, user_id, email, detail, kunci)
  select u.created_at, 'daftar', u.id, lower(u.email), jsonb_build_object('provider', coalesce(u.raw_app_meta_data->>'provider', ''), 'isi_ulang', true), 'daftar:' || u.id
    from auth.users u
  on conflict (kunci) do nothing;

insert into riwayat_akses (at, jenis, user_id, email, device_id, detail, kunci)
  select d.pertama, 'perangkat_baru', d.user_id, lower(u.email), d.device_id,
         jsonb_build_object('jenis', d.jenis, 'os', d.os, 'browser', d.browser, 'model', d.model, 'kota', d.kota, 'provinsi', d.provinsi,
                            'negara', d.negara, 'pwa', d.pwa, 'jaringan', d.jaringan, 'sumber', d.sumber, 'isi_ulang', true),
         'pb:' || d.user_id || ':' || d.device_id
    from perangkat_pengguna d join auth.users u on u.id = d.user_id
  on conflict (kunci) do nothing;

insert into riwayat_akses (at, jenis, user_id, email, device_id, detail, kunci)
  select c.started_at, 'trial_klaim',
         (select u.id from auth.users u where replace(split_part(split_part(lower(u.email), '@', 1), '+', 1), '.', '') || '@gmail.com' = c.email order by u.created_at limit 1),
         c.email, c.device_id, jsonb_build_object('alasan', null, 'sisa', 600, 'fp', left(c.fp, 8), 'isi_ulang', true), 'tk:' || c.id
    from trial_claims c
  on conflict (kunci) do nothing;

insert into riwayat_akses (at, jenis, user_id, email, detail, kunci)
  select b.tanggal::timestamptz, 'bayar', b.user_id, lower(b.email),
         jsonb_build_object('bulan', b.bulan, 'jumlah', b.jumlah, 'metode', b.metode, 'sampai', b.sampai, 'isi_ulang', true), 'by:' || b.id
    from pembayaran b
  on conflict (kunci) do nothing;

-- 9) Pembaca khusus ADMIN ----------------------------------------------------------------
-- 9a) Linimasa kejadian (terbaru dulu)
create or replace function admin_riwayat_akses(p_hari int default 365, p_limit int default 3000)
returns table(id bigint, at timestamptz, jenis text, user_id uuid, email text, nama text, role text, oleh_email text, device_id text, detail jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_cek();
  return query
    select r.id, r.at, r.jenis, r.user_id, coalesce(u.email::text, r.email), p.nama,
           coalesce(p.role, case when u.id is null then 'dihapus' else 'pending' end),
           ou.email::text, r.device_id, r.detail
      from riwayat_akses r
      left join auth.users u  on u.id  = r.user_id
      left join profiles   p  on p.id  = r.user_id
      left join auth.users ou on ou.id = r.oleh
     where r.at > now() - make_interval(days => greatest(1, least(coalesce(p_hari, 365), 3650)))
     order by r.at desc, r.id desc
     limit greatest(1, least(coalesce(p_limit, 3000), 5000));
end $$;
revoke all on function admin_riwayat_akses(int, int) from public, anon;
grant execute on function admin_riwayat_akses(int, int) to authenticated;

-- 9b) Riwayat pengguna GRATIS: satu baris per klaim uji coba + status terkini + pola mencurigakan
create or replace function admin_riwayat_gratis()
returns table(email text, nama text, instansi text, hp text, user_id uuid, device_id text, fp text, mulai timestamptz, status text, role text,
              sisa_detik int, ditolak int, ditolak_terakhir timestamptz, klaim_se_perangkat int,
              jenis text, os text, browser text, model text, kota text, provinsi text, negara text,
              akun_ada boolean, dikonversi_pada timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_cek();
  return query
    select c.email, coalesce(p.nama, nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', '')),
           p.instansi, p.hp, u.id, c.device_id, c.fp, c.started_at,
           case when u.id is null then 'akun_dihapus'
                when p.role = 'blocked' then 'diblokir'
                when p.role in ('viewer','surveyor','admin') and p.aktif_sampai is not null and p.aktif_sampai < hari_wib() then 'berlangganan_berakhir'
                when p.role in ('viewer','surveyor','admin') then 'berlangganan'
                when c.started_at > now() - interval '10 minutes' then 'berjalan'
                else 'habis' end,
           coalesce(p.role, case when u.id is null then 'dihapus' else 'pending' end),
           greatest(0, 600 - floor(extract(epoch from (now() - c.started_at)))::int),
           (select count(*)::int from riwayat_akses x
             where x.jenis = 'trial_ditolak'
               and (replace(split_part(split_part(lower(coalesce(x.email, '')), '@', 1), '+', 1), '.', '') || '@gmail.com' = c.email
                    or x.device_id = c.device_id or x.detail->>'fp' = left(c.fp, 8))),
           (select max(x.at) from riwayat_akses x
             where x.jenis = 'trial_ditolak'
               and (replace(split_part(split_part(lower(coalesce(x.email, '')), '@', 1), '+', 1), '.', '') || '@gmail.com' = c.email
                    or x.device_id = c.device_id or x.detail->>'fp' = left(c.fp, 8))),
           (select count(*)::int from trial_claims c2 where c2.fp = c.fp and c2.id <> c.id),
           i.detail->>'jenis', i.detail->>'os', i.detail->>'browser', i.detail->>'model',
           i.detail->>'kota', i.detail->>'provinsi', i.detail->>'negara',
           (u.id is not null),
           (select min(x.at) from riwayat_akses x
             where x.user_id = u.id and x.jenis = 'peran' and x.detail->>'ke' in ('viewer','surveyor') and x.at >= c.started_at)
      from trial_claims c
      left join lateral (select uu.* from auth.users uu
                          where replace(split_part(split_part(lower(uu.email), '@', 1), '+', 1), '.', '') || '@gmail.com' = c.email
                          order by uu.created_at limit 1) u on true
      left join profiles p on p.id = u.id
      left join lateral (select x.detail from riwayat_akses x
                          where x.jenis = 'trial_info' and x.device_id = c.device_id order by x.at desc limit 1) i on true
     order by c.started_at desc;
end $$;
revoke all on function admin_riwayat_gratis() from public, anon;
grant execute on function admin_riwayat_gratis() to authenticated;

-- 10) Bersihkan riwayat lama (admin saja; default > 365 hari, minimal 30). Data klaim uji coba (trial_claims) TIDAK disentuh.
create or replace function admin_bersihkan_riwayat(p_hari int default 365) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform admin_cek();
  delete from riwayat_akses where at < now() - make_interval(days => greatest(coalesce(p_hari, 365), 30)) and jenis <> 'bayar';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function admin_bersihkan_riwayat(int) from public, anon;
grant execute on function admin_bersihkan_riwayat(int) to authenticated;

notify pgrst, 'reload schema';
