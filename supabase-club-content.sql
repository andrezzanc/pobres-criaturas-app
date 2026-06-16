-- Livros e reuniao oficial do Pobres Criaturas
-- Rode este bloco no SQL Editor do Supabase uma vez.

create table if not exists public.club_meeting (
  id text primary key default 'current',
  date text,
  time text,
  book_id text,
  place text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.club_meeting
add column if not exists date text,
add column if not exists time text,
add column if not exists book_id text,
add column if not exists place text,
add column if not exists notes text,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

alter table public.club_meeting enable row level security;

grant select, insert, update on public.club_meeting to authenticated;

drop policy if exists "Integrantes podem ver reuniao" on public.club_meeting;
create policy "Integrantes podem ver reuniao"
on public.club_meeting
for select
to authenticated
using (true);

drop policy if exists "Integrantes podem criar reuniao" on public.club_meeting;
create policy "Integrantes podem criar reuniao"
on public.club_meeting
for insert
to authenticated
with check (true);

drop policy if exists "Integrantes podem atualizar reuniao" on public.club_meeting;
create policy "Integrantes podem atualizar reuniao"
on public.club_meeting
for update
to authenticated
using (true)
with check (true);

insert into public.club_meeting (id)
values ('current')
on conflict (id) do nothing;

create table if not exists public.club_books (
  id text primary key,
  title text not null,
  author text,
  month text,
  month_index integer default 0,
  year integer,
  indicated_by text,
  genre text,
  pages integer default 0,
  cover text,
  cover_image text,
  synopsis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.club_books
add column if not exists title text,
add column if not exists author text,
add column if not exists month text,
add column if not exists month_index integer default 0,
add column if not exists year integer,
add column if not exists indicated_by text,
add column if not exists genre text,
add column if not exists pages integer default 0,
add column if not exists cover text,
add column if not exists cover_image text,
add column if not exists synopsis text,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

alter table public.club_books enable row level security;

grant select, insert, update on public.club_books to authenticated;

drop policy if exists "Integrantes podem ver livros" on public.club_books;
create policy "Integrantes podem ver livros"
on public.club_books
for select
to authenticated
using (true);

drop policy if exists "Integrantes podem criar livros" on public.club_books;
create policy "Integrantes podem criar livros"
on public.club_books
for insert
to authenticated
with check (true);

drop policy if exists "Integrantes podem atualizar livros" on public.club_books;
create policy "Integrantes podem atualizar livros"
on public.club_books
for update
to authenticated
using (true)
with check (true);
