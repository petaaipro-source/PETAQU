-- Jalankan di Supabase SQL Editor. Peran: admin (tulis semua), surveyor (tulis), viewer (baca).
create table profiles (id uuid primary key references auth.users on delete cascade, role text not null default 'viewer' check (role in ('admin','surveyor','viewer')));
create table roads (id text primary key, name text, kabupaten text, data jsonb not null, updated_at timestamptz default now(), updated_by uuid references auth.users);
create table audit_log (id bigserial primary key, road_id text, action text, by uuid, at timestamptz default now());
alter table profiles enable row level security; alter table roads enable row level security; alter table audit_log enable row level security;
create function my_role() returns text language sql stable security definer as $$ select role from profiles where id = auth.uid() $$;
create policy "baca profil sendiri" on profiles for select using (id = auth.uid());
create policy "baca ruas" on roads for select using (auth.uid() is not null);
create policy "tulis ruas" on roads for insert with check (my_role() in ('admin','surveyor'));
create policy "ubah ruas" on roads for update using (my_role() in ('admin','surveyor'));
create policy "hapus ruas" on roads for delete using (my_role() = 'admin');
create policy "baca audit" on audit_log for select using (my_role() = 'admin');
create function touch_and_audit() returns trigger language plpgsql security definer as $$
begin new.updated_at := now(); insert into audit_log(road_id, action, by) values (new.id, tg_op, auth.uid()); return new; end $$;
create trigger roads_audit before insert or update on roads for each row execute function touch_and_audit();
create function new_user() returns trigger language plpgsql security definer as $$ begin insert into profiles(id) values (new.id); return new; end $$;
create trigger on_signup after insert on auth.users for each row execute function new_user();
-- Naikkan peran: update profiles set role='admin' where id='<uuid-user>';
