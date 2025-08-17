-- === Extensions ===
create extension if not exists pgcrypto;

-- === Tables ===
create table if not exists public.players (
  id          text primary key,
  name        text not null,
  color       text not null default '#000000',
  avatar_url  text
);

create table if not exists public.activities (
  id      text primary key,
  name    text not null,
  points  integer not null
);

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  player_id    text not null references public.players(id) on delete cascade,
  activity_id  text not null references public.activities(id) on delete cascade,
  points       integer not null,
  note         text,
  ts           bigint not null,
  day          integer not null,
  created_at   timestamptz not null default now()
);

-- === Indexes ===
create index if not exists events_player_idx  on public.events(player_id);
create index if not exists events_created_idx on public.events(created_at);
create index if not exists events_day_idx     on public.events(day);

-- === RLS OFF (MVP) ===
alter table public.players    disable row level security;
alter table public.activities disable row level security;
alter table public.events     disable row level security;

-- === Grants (MVP: anon + authenticated full access) ===
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.players    to anon, authenticated;
grant select, insert, update, delete on public.activities to anon, authenticated;
grant select, insert, update, delete on public.events     to anon, authenticated;

-- === Realtime publication (aggiunge le tabelle alla pubblicazione Realtime) ===
-- NB: se la publication 'supabase_realtime' non esiste, la crea Supabase automaticamente.
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.activities;

-- === Storage: public bucket per avatar dei players ===
-- Bucket (id = 'players')
insert into storage.buckets (id, name, public)
values ('players', 'players', true)
on conflict (id) do nothing;

-- Policies Storage (permissive MVP)
-- Leggere tutti i file del bucket 'players'
create policy if not exists "Public read players"
on storage.objects for select
to public
using (bucket_id = 'players');

-- Caricare nel bucket 'players'
create policy if not exists "Anon can upload players"
on storage.objects for insert
to public
with check (bucket_id = 'players');

-- Aggiornare file nel bucket 'players'
create policy if not exists "Anon can update players"
on storage.objects for update
to public
using (bucket_id = 'players');

-- Cancellare file nel bucket 'players'
create policy if not exists "Anon can delete players"
on storage.objects for delete
to public
using (bucket_id = 'players');
