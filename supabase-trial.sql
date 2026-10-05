-- Uji coba gratis 10 menit: 1 Gmail (diverifikasi lewat Google) ATAU 1 perangkat, tidak dapat diulang.
-- Setelah klaim, akun uji coba DIKUNCI (banned) -> tidak bisa login lagi sampai admin membayar/meng-upgrade (lihat supabase-trial-bersih.sql).
-- Jalankan SEKALI di Supabase > SQL Editor. Aman dijalankan ulang.
-- SYARAT: Authentication > Sign In / Providers > aktifkan "Allow new users to sign up" (Google sudah aktif).
--         Pendaftar baru otomatis 'pending' (uji coba -> 'trial'): TIDAK bisa membaca data ruas di awan sampai admin menyetujui.

create table if not exists trial_claims (
  id bigserial primary key,
  email text not null unique,          -- Gmail ternormalisasi (titik & +alias dibuang)
  device_id text not null unique,
  fp text not null,
  started_at timestamptz not null default now()
);
create index if not exists trial_claims_fp_idx on trial_claims (fp);
alter table trial_claims enable row level security;   -- tanpa policy: tak bisa diakses langsung lewat API

-- peran baru 'trial' + data ruas hanya untuk admin/surveyor/viewer
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin','surveyor','viewer','trial','pending','blocked'));
alter table profiles alter column role set default 'pending';   -- profil tanpa peran eksplisit = menunggu persetujuan admin
drop policy if exists "baca ruas" on roads;
create policy "baca ruas" on roads for select using (my_role() in ('admin','surveyor','viewer'));

-- SEMUA pendaftar baru (Google, email, apa pun) berperan 'pending' = BELUM punya akses. Admin harus menyetujui (supabase-akses-admin.sql).
create or replace function new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, role) values (new.id, 'pending') on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_signup on auth.users;
create trigger on_signup after insert on auth.users for each row execute function new_user();

-- fungsi lama (Gmail diketik manual) dihapus agar tidak bisa disalahgunakan
drop function if exists claim_trial(text, text, text);

-- akun uji coba dikunci (ban) di Supabase begitu klaim diproses: tidak bisa lagi login lewat OTP / Google / refresh token.
-- Hanya akun ber-peran 'trial' yang disentuh; admin/surveyor/viewer tidak pernah dikunci.
create or replace function kunci_trial(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update auth.users set banned_until = now() + interval '100 years'
   where id = p_uid and exists (select 1 from profiles where id = p_uid and role = 'trial');
end $$;

create or replace function claim_trial_inner(uid uuid, j jsonb, p_device text, p_fp text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e text; r trial_claims; rem int;
begin
  -- pendaftar baru (<10 menit) yang masih 'pending' ditandai 'trial'; pengguna yang sudah disetujui admin tidak pernah disentuh
  update profiles set role = 'trial'
   where id = uid and role = 'pending'
     and exists (select 1 from auth.users u where u.id = uid and u.created_at > now() - interval '10 minutes');

  e := lower(coalesce(j->>'email', ''));
  if coalesce(j->'app_metadata'->>'provider', '') <> 'google'
     or e !~ '^[a-z0-9._+-]+@(gmail|googlemail)\.com$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_email');
  end if;
  e := replace(split_part(split_part(e, '@', 1), '+', 1), '.', '');
  if length(e) < 6 then return jsonb_build_object('ok', false, 'reason', 'bad_email'); end if;
  e := e || '@gmail.com';
  if length(coalesce(p_device, '')) < 16 or length(coalesce(p_fp, '')) < 16 then
    return jsonb_build_object('ok', false, 'reason', 'bad_device');
  end if;

  select * into r from trial_claims where device_id = p_device;
  if found then   -- perangkat sama: lanjutkan sisa waktu atau tolak bila habis
    rem := greatest(0, 600 - floor(extract(epoch from (now() - r.started_at)))::int);
    if rem <= 0 then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
    return jsonb_build_object('ok', true, 'remaining', rem);
  end if;

  if exists (select 1 from trial_claims where email = e or fp = p_fp) then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;

  insert into trial_claims (email, device_id, fp) values (e, p_device, p_fp);
  return jsonb_build_object('ok', true, 'remaining', 600);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'used');
end $$;

create or replace function claim_trial_g(p_device text, p_fp text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); res jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'no_auth'); end if;
  res := claim_trial_inner(uid, auth.jwt(), p_device, p_fp);
  perform kunci_trial(uid);          -- apa pun hasilnya, akun uji coba tidak boleh punya akses login
  return res;
end $$;

create or replace function trial_status(p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r trial_claims; rem int;
begin
  select * into r from trial_claims where device_id = p_device;
  if not found then return jsonb_build_object('ok', false, 'reason', 'none'); end if;
  rem := greatest(0, 600 - floor(extract(epoch from (now() - r.started_at)))::int);
  return jsonb_build_object('ok', rem > 0, 'remaining', rem, 'reason', case when rem > 0 then 'active' else 'expired' end);
end $$;

revoke all on function kunci_trial(uuid) from public, anon, authenticated;
revoke all on function claim_trial_inner(uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function claim_trial_g(text, text) from public;
revoke all on function trial_status(text) from public;
grant execute on function claim_trial_g(text, text) to authenticated;
grant execute on function trial_status(text) to anon, authenticated;
