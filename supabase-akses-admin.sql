-- PETAQU: akses penuh HANYA setelah admin menyetujui.
-- Jalankan di Supabase > SQL Editor SETELAH supabase-trial.sql (file itu sudah diperbarui). Aman dijalankan ulang.
--
-- Peran:  admin / surveyor / viewer = punya akses (hanya admin yang bisa memberikan)
--         pending = baru daftar, MENUNGGU persetujuan  |  trial = sudah memakai uji coba 10 menit  |  blocked = diblokir admin

-- 1) Peran baru + default aman (bila supabase-trial.sql lama sudah terlanjur dijalankan)
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin','surveyor','viewer','trial','pending','blocked'));
alter table profiles alter column role set default 'pending';

create or replace function new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, role) values (new.id, 'pending') on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_signup on auth.users;
create trigger on_signup after insert on auth.users for each row execute function new_user();

-- pengguna Auth yang belum punya profil -> pending (tidak diberi akses diam-diam)
insert into profiles(id, role) select u.id, 'pending' from auth.users u
 where not exists (select 1 from profiles p where p.id = u.id);

-- 2) Data ruas di awan: hanya peran resmi (ulang agar pasti terpasang)
drop policy if exists "baca ruas" on roads;
create policy "baca ruas" on roads for select using (my_role() in ('admin','surveyor','viewer'));

-- 3) Cabut akses dua akun yang masuk otomatis tanpa izin (kasum & supriyanto) -> kembali 'pending'.
--    Akun lain TIDAK diubah. Setujui kembali lewat panel admin di aplikasi bila memang berhak.
update profiles set role = 'pending'
 where role <> 'admin'
   and id in (select id from auth.users where lower(email) in ('kasumsum71@gmail.com','supriyantosest@gmail.com'));

-- 4) Fungsi admin (hanya peran 'admin' yang lolos; dicek di dalam fungsi, bukan di browser)
create or replace function admin_cek() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(my_role(), '') <> 'admin' then raise exception 'hanya admin' using errcode = '42501'; end if;
end $$;

create or replace function admin_daftar_pengguna()
returns table(id uuid, email text, role text, provider text, created_at timestamptz, last_sign_in_at timestamptz, banned boolean, trial_dipakai boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_cek();
  return query
    select u.id, u.email::text, coalesce(p.role, 'pending'), coalesce(u.raw_app_meta_data->>'provider', ''),
           u.created_at, u.last_sign_in_at, coalesce(u.banned_until > now(), false),
           exists (select 1 from trial_claims c
                    where c.email = replace(split_part(split_part(lower(u.email), '@', 1), '+', 1), '.', '') || '@gmail.com')
      from auth.users u left join profiles p on p.id = u.id
     order by (coalesce(p.role, 'pending') in ('pending','trial')) desc, u.created_at desc;
end $$;

create or replace function admin_setujui(p_id uuid, p_role text default 'viewer')
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text;
begin
  perform admin_cek();
  if p_role not in ('viewer','surveyor') then return jsonb_build_object('ok', false, 'reason', 'peran_tidak_valid'); end if;
  if exists (select 1 from profiles where id = p_id and role = 'admin') then return jsonb_build_object('ok', false, 'reason', 'akun_admin'); end if;
  select email into em from auth.users where id = p_id;
  if em is null then return jsonb_build_object('ok', false, 'reason', 'tidak_ada'); end if;
  insert into profiles(id, role) values (p_id, p_role) on conflict (id) do update set role = excluded.role;
  update auth.users set banned_until = null where id = p_id;      -- buka kunci uji coba
  insert into audit_log(road_id, action, by) values (null, 'setujui:' || em || ':' || p_role, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_blokir(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text;
begin
  perform admin_cek();
  if p_id = auth.uid() or exists (select 1 from profiles where id = p_id and role = 'admin') then
    return jsonb_build_object('ok', false, 'reason', 'akun_admin');
  end if;
  select email into em from auth.users where id = p_id;
  if em is null then return jsonb_build_object('ok', false, 'reason', 'tidak_ada'); end if;
  insert into profiles(id, role) values (p_id, 'blocked') on conflict (id) do update set role = 'blocked';
  update auth.users set banned_until = now() + interval '100 years' where id = p_id;
  delete from auth.sessions where user_id = p_id;                  -- keluarkan dari semua perangkat
  insert into audit_log(road_id, action, by) values (null, 'blokir:' || em, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

revoke all on function admin_cek() from public, anon, authenticated;
revoke all on function admin_daftar_pengguna() from public, anon;
revoke all on function admin_setujui(uuid, text) from public, anon;
revoke all on function admin_blokir(uuid) from public, anon;
grant execute on function admin_daftar_pengguna() to authenticated;
grant execute on function admin_setujui(uuid, text) to authenticated;
grant execute on function admin_blokir(uuid) to authenticated;

-- 5) Cek hasil: hanya admin/surveyor/viewer yang punya akses; sisanya pending/trial/blocked
select u.email, p.role, u.created_at, u.last_sign_in_at, u.banned_until
  from auth.users u left join profiles p on p.id = u.id
 order by u.created_at desc;

-- Setujui manual (alternatif panel):  update profiles set role='viewer' where id=(select id from auth.users where email='x@gmail.com');
--                                      update auth.users set banned_until=null where email='x@gmail.com';
