-- Uji coba gratis 10 menit: 1 Gmail ATAU 1 perangkat, tidak dapat diulang.
-- Jalankan SEKALI di Supabase > SQL Editor. Tidak mengubah tabel/kebijakan yang sudah ada.
create table if not exists trial_claims (
  id bigserial primary key,
  email text not null unique,          -- Gmail ternormalisasi (titik & +alias dibuang)
  device_id text not null unique,      -- ID acak per perangkat/browser
  fp text not null,                    -- sidik perangkat (cadangan bila penyimpanan browser dihapus)
  started_at timestamptz not null default now()
);
create index if not exists trial_claims_fp_idx on trial_claims (fp);
alter table trial_claims enable row level security;   -- tanpa policy: tidak bisa dibaca/ditulis langsung lewat API

create or replace function claim_trial(p_email text, p_device text, p_fp text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e text; r trial_claims; rem int;
begin
  e := lower(trim(coalesce(p_email, '')));
  if e !~ '^[a-z0-9._+-]+@(gmail|googlemail)\.com$' then return jsonb_build_object('ok', false, 'reason', 'bad_email'); end if;
  e := replace(split_part(split_part(e, '@', 1), '+', 1), '.', '');
  if length(e) < 6 then return jsonb_build_object('ok', false, 'reason', 'bad_email'); end if;
  e := e || '@gmail.com';
  if length(coalesce(p_device, '')) < 16 or length(coalesce(p_fp, '')) < 16 then
    return jsonb_build_object('ok', false, 'reason', 'bad_device');
  end if;

  -- perangkat yang sama: lanjutkan sisa waktu (mis. halaman dimuat ulang) atau tolak bila sudah habis
  select * into r from trial_claims where device_id = p_device;
  if found then
    rem := greatest(0, 600 - floor(extract(epoch from (now() - r.started_at)))::int);
    if rem <= 0 then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
    return jsonb_build_object('ok', true, 'remaining', rem);
  end if;

  -- Gmail atau sidik perangkat sudah pernah dipakai -> tolak
  if exists (select 1 from trial_claims where email = e or fp = p_fp) then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;

  insert into trial_claims (email, device_id, fp) values (e, p_device, p_fp);
  return jsonb_build_object('ok', true, 'remaining', 600);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'used');
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

revoke all on function claim_trial(text, text, text) from public;
revoke all on function trial_status(text) from public;
grant execute on function claim_trial(text, text, text) to anon, authenticated;
grant execute on function trial_status(text) to anon, authenticated;
