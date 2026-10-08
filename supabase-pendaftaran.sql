-- PETAQU: PENDAFTARAN AKUN BARU + SARAN PINTAR UNTUK ADMIN
-- Jalankan di Supabase > SQL Editor SETELAH supabase-schema.sql, supabase-trial.sql, supabase-akses-admin.sql. Aman dijalankan ulang.
--
-- Yang dilakukan file ini:
--   1) Data pendaftar (nama, instansi, WhatsApp, keperluan) ikut tersimpan di tabel profiles.
--   2) Setiap pendaftar otomatis diberi SKOR KEPERCAYAAN (0-100) + SARAN (setujui / tinjau / waspada / tolak).
--      Skor HANYA saran untuk admin. Akun tetap 'pending' sampai admin menyetujui.
--   3) Opsional: domain email resmi (mis. instansi) boleh ditandai auto=true -> disetujui otomatis,
--      tetapi HANYA bila email sudah dikonfirmasi (kepemilikan email terbukti). Default semua auto=false.
--   4) Fungsi admin baru: setujui banyak sekaligus, tolak & hapus pendaftar, atur domain resmi.
--
-- SYARAT di Supabase Dashboard (tidak bisa lewat SQL):
--   Authentication > Sign In / Providers > Email : aktif, dan "Allow new users to sign up" : aktif
--   Authentication > Sign In / Providers > Email > "Confirm email" : DISARANKAN aktif (bukti email asli)
--   Authentication > URL Configuration : tambahkan https://petaqu.my.id ke Site URL & Redirect URLs

-- 1) Kolom data pendaftar -----------------------------------------------------
alter table profiles add column if not exists nama text;
alter table profiles add column if not exists instansi text;
alter table profiles add column if not exists hp text;
alter table profiles add column if not exists tujuan text;
alter table profiles add column if not exists skor int not null default 0;
alter table profiles add column if not exists saran text;
alter table profiles add column if not exists dibuat timestamptz not null default now();

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin','surveyor','viewer','trial','pending','blocked'));
alter table profiles alter column role set default 'pending';

-- 2) Daftar domain ------------------------------------------------------------
create table if not exists domain_resmi (
  domain text primary key,
  label  text,
  saran  text not null default 'viewer' check (saran in ('viewer','surveyor')),
  auto   boolean not null default false
);
create table if not exists domain_sekali_pakai (domain text primary key);
alter table domain_resmi enable row level security;          -- tanpa policy: hanya lewat fungsi admin
alter table domain_sekali_pakai enable row level security;

-- CONTOH isi: sesuaikan dengan domain instansi Anda. auto=false = hanya menambah skor, tidak menyetujui otomatis.
insert into domain_resmi(domain, label, saran, auto) values
  ('pu.go.id',          'Kementerian PU',            'viewer', false),
  ('jatengprov.go.id',  'Pemerintah Provinsi Jateng', 'viewer', false)
on conflict (domain) do nothing;

insert into domain_sekali_pakai(domain) values
  ('mailinator.com'),('guerrillamail.com'),('10minutemail.com'),('tempmail.com'),('temp-mail.org'),
  ('yopmail.com'),('trashmail.com'),('sharklasers.com'),('getnada.com'),('dispostable.com'),
  ('maildrop.cc'),('throwawaymail.com'),('fakeinbox.com'),('mohmal.com'),('emailondeck.com')
on conflict (domain) do nothing;

-- 3) Penilai pendaftar (internal, tidak bisa dipanggil dari browser) ------------
create or replace function nilai_pendaftar(p_email text, p_nama text, p_instansi text, p_hp text)
returns table(skor int, saran text) language plpgsql stable security definer set search_path = public as $$
declare d text := lower(split_part(coalesce(p_email,''), '@', 2)); s int := 0; dr domain_resmi;
begin
  if exists (select 1 from domain_sekali_pakai where domain = d) then
    return query select 0, 'tolak'::text; return;
  end if;
  select * into dr from domain_resmi where domain = d;
  if found then s := s + 50;
  elsif d like '%.go.id' then s := s + 35;
  elsif d like '%.ac.id' or d like '%.sch.id' then s := s + 15;
  end if;
  if coalesce(p_nama, '') ~ '^\S+(\s+\S+)+$' and length(p_nama) >= 5 then s := s + 15; end if;
  if length(coalesce(p_instansi, '')) >= 3 then s := s + 10; end if;
  if coalesce(p_instansi, '') ~* '(bbpjn|pjn|bina marga|pupr|\mpu\M|dinas|satker|balai|kementerian|pemerintah|pemkab|pemkot|pemprov)' then s := s + 10; end if;
  if coalesce(p_hp, '') ~ '^62[0-9]{8,13}$' then s := s + 15; end if;
  s := least(100, s);
  return query select s, case when s >= 70 then 'setujui' when s >= 45 then 'tinjau' else 'waspada' end::text;
end $$;
revoke all on function nilai_pendaftar(text, text, text, text) from public, anon, authenticated;

-- 4) Pendaftar baru: simpan data + skor. Tidak pernah menggagalkan pendaftaran. -----
create or replace function new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
        v_nama text; v_inst text; v_hp text; v_tuj text; sk int := 0; sr text := null; dr domain_resmi; v_role text := 'pending';
begin
  begin
    v_nama := left(btrim(coalesce(m->>'nama', m->>'full_name', m->>'name', '')), 80);
    v_inst := left(btrim(coalesce(m->>'instansi', '')), 100);
    v_hp   := left(regexp_replace(coalesce(m->>'hp', ''), '[^0-9]', '', 'g'), 16);
    v_tuj  := left(btrim(coalesce(m->>'tujuan', '')), 240);
    select n.skor, n.saran into sk, sr from nilai_pendaftar(new.email, v_nama, v_inst, v_hp) n;
    if new.email_confirmed_at is not null then      -- mis. daftar via Google: email sudah terbukti milik pendaftar
      select * into dr from domain_resmi where domain = lower(split_part(coalesce(new.email,''), '@', 2)) and auto;
      if found then v_role := dr.saran; end if;
    end if;
    insert into profiles(id, role, nama, instansi, hp, tujuan, skor, saran)
      values (new.id, v_role, nullif(v_nama,''), nullif(v_inst,''), nullif(v_hp,''), nullif(v_tuj,''), coalesce(sk,0), sr)
      on conflict (id) do nothing;
  exception when others then
    insert into profiles(id, role) values (new.id, 'pending') on conflict (id) do nothing;   -- cadangan aman
  end;
  return new;
end $$;
drop trigger if exists on_signup on auth.users;
create trigger on_signup after insert on auth.users for each row execute function new_user();

-- 5) Domain resmi auto=true + email baru dikonfirmasi -> disetujui otomatis -------
create or replace function auto_setuju_dikonfirmasi() returns trigger language plpgsql security definer set search_path = public as $$
declare dr domain_resmi;
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    select * into dr from domain_resmi where domain = lower(split_part(coalesce(new.email,''), '@', 2)) and auto;
    if found then
      update profiles set role = dr.saran where id = new.id and role = 'pending';
      if found then insert into audit_log(road_id, action, by) values (null, 'auto-setuju:' || new.email || ':' || dr.saran, null); end if;
    end if;
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists on_email_confirmed on auth.users;
create trigger on_email_confirmed after update of email_confirmed_at on auth.users for each row execute function auto_setuju_dikonfirmasi();

-- 6) Lengkapi skor untuk pengguna lama yang belum punya skor ----------------------
update profiles p set
  nama = coalesce(p.nama, nullif(left(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), 80), '')),
  skor = n.skor, saran = n.saran
from auth.users u, lateral nilai_pendaftar(u.email, coalesce(p.nama, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'), p.instansi, p.hp) n
where u.id = p.id and p.saran is null;

-- 7) Fungsi admin -------------------------------------------------------------------
drop function if exists admin_daftar_pengguna();
create or replace function admin_daftar_pengguna()
returns table(id uuid, email text, role text, provider text, created_at timestamptz, last_sign_in_at timestamptz, banned boolean,
              trial_dipakai boolean, nama text, instansi text, hp text, tujuan text, skor int, saran text, email_terkonfirmasi boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_cek();
  return query
    select u.id, u.email::text, coalesce(p.role, 'pending'), coalesce(u.raw_app_meta_data->>'provider', ''),
           u.created_at, u.last_sign_in_at, coalesce(u.banned_until > now(), false),
           exists (select 1 from trial_claims c
                    where c.email = replace(split_part(split_part(lower(u.email), '@', 1), '+', 1), '.', '') || '@gmail.com'),
           coalesce(p.nama, nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', '')),
           p.instansi, p.hp, p.tujuan, coalesce(p.skor, 0), p.saran, (u.email_confirmed_at is not null)
      from auth.users u left join profiles p on p.id = u.id
     order by (coalesce(p.role, 'pending') in ('pending','trial')) desc, coalesce(p.skor, 0) desc, u.created_at desc;
end $$;

create or replace function admin_setujui_banyak(p_ids uuid[], p_role text default 'viewer')
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int := 0; x uuid; em text;
begin
  perform admin_cek();
  if p_role not in ('viewer','surveyor') then return jsonb_build_object('ok', false, 'reason', 'peran_tidak_valid'); end if;
  foreach x in array coalesce(p_ids, '{}') loop
    select u.email into em from auth.users u where u.id = x;
    continue when em is null;
    continue when exists (select 1 from profiles where id = x and role in ('admin','blocked'));
    insert into profiles(id, role) values (x, p_role) on conflict (id) do update set role = excluded.role;
    update auth.users set banned_until = null where id = x;
    insert into audit_log(road_id, action, by) values (null, 'setujui:' || em || ':' || p_role, auth.uid());
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'jumlah', n);
end $$;

create or replace function admin_hapus_pendaftar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text;
begin
  perform admin_cek();
  if p_id = auth.uid() or exists (select 1 from profiles where id = p_id and role = 'admin') then
    return jsonb_build_object('ok', false, 'reason', 'akun_admin');
  end if;
  if not exists (select 1 from profiles where id = p_id and role in ('pending','trial','blocked')) then
    return jsonb_build_object('ok', false, 'reason', 'bukan_pendaftar');   -- akun aktif tidak bisa dihapus dari sini
  end if;
  select email into em from auth.users where id = p_id;
  delete from auth.users where id = p_id;                                  -- profil ikut terhapus (on delete cascade)
  insert into audit_log(road_id, action, by) values (null, 'tolak-hapus:' || coalesce(em, '?'), auth.uid());
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_atur_domain(p_domain text, p_saran text default 'viewer', p_auto boolean default false, p_hapus boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d text := lower(btrim(coalesce(p_domain, '')));
begin
  perform admin_cek();
  if d !~ '^[a-z0-9.-]+\.[a-z]{2,}$' then return jsonb_build_object('ok', false, 'reason', 'domain_tidak_valid'); end if;
  if p_hapus then delete from domain_resmi where domain = d; return jsonb_build_object('ok', true); end if;
  if p_saran not in ('viewer','surveyor') then return jsonb_build_object('ok', false, 'reason', 'peran_tidak_valid'); end if;
  insert into domain_resmi(domain, saran, auto) values (d, p_saran, coalesce(p_auto, false))
    on conflict (domain) do update set saran = excluded.saran, auto = excluded.auto;
  insert into audit_log(road_id, action, by) values (null, 'domain:' || d || ':auto=' || coalesce(p_auto, false)::text, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_daftar_domain()
returns table(domain text, label text, saran text, auto boolean) language plpgsql stable security definer set search_path = public as $$
begin perform admin_cek(); return query select d.domain, d.label, d.saran, d.auto from domain_resmi d order by d.domain; end $$;

revoke all on function admin_daftar_pengguna() from public, anon;
revoke all on function admin_setujui_banyak(uuid[], text) from public, anon;
revoke all on function admin_hapus_pendaftar(uuid) from public, anon;
revoke all on function admin_atur_domain(text, text, boolean, boolean) from public, anon;
revoke all on function admin_daftar_domain() from public, anon;
grant execute on function admin_daftar_pengguna() to authenticated;
grant execute on function admin_setujui_banyak(uuid[], text) to authenticated;
grant execute on function admin_hapus_pendaftar(uuid) to authenticated;
grant execute on function admin_atur_domain(text, text, boolean, boolean) to authenticated;
grant execute on function admin_daftar_domain() to authenticated;

-- 8) Cek hasil: pendaftar terbaru + skor + saran
select u.email, p.role, p.nama, p.instansi, p.skor, p.saran, u.created_at
  from auth.users u left join profiles p on p.id = u.id order by u.created_at desc limit 20;
