-- Integrantes oficiais do Pobres Criaturas
-- Rode este bloco no SQL Editor do Supabase uma vez.

create table if not exists public.club_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  participant_id text not null,
  name text not null,
  role text,
  tone text,
  favorite_book text,
  favorite_character text,
  quote text,
  goal integer default 12,
  books_read_year integer default 0,
  books_read_club integer default 0,
  genres jsonb not null default '[]'::jsonb,
  personality text,
  discussion text,
  photo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.club_members
add column if not exists email text,
add column if not exists participant_id text,
add column if not exists name text,
add column if not exists role text,
add column if not exists tone text,
add column if not exists favorite_book text,
add column if not exists favorite_character text,
add column if not exists quote text,
add column if not exists goal integer default 12,
add column if not exists books_read_year integer default 0,
add column if not exists books_read_club integer default 0,
add column if not exists genres jsonb not null default '[]'::jsonb,
add column if not exists personality text,
add column if not exists discussion text,
add column if not exists photo text,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

alter table public.club_members enable row level security;

grant select, insert, update on public.club_members to authenticated;

drop policy if exists "Integrantes podem ver o clube" on public.club_members;
create policy "Integrantes podem ver o clube"
on public.club_members
for select
to authenticated
using (true);

drop policy if exists "Integrante pode criar proprio perfil" on public.club_members;
create policy "Integrante pode criar proprio perfil"
on public.club_members
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Integrante pode atualizar proprio perfil" on public.club_members;
create policy "Integrante pode atualizar proprio perfil"
on public.club_members
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
