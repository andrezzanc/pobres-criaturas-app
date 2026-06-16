-- Pobres Criaturas - estrutura completa de sincronizacao
-- Rode este arquivo no SQL Editor do Supabase.

create table if not exists public.club_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.club_state
add column if not exists data jsonb not null default '{}'::jsonb,
add column if not exists updated_at timestamptz not null default now();

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

create unique index if not exists club_members_user_id_key on public.club_members (user_id);
create unique index if not exists club_members_participant_id_key on public.club_members (participant_id);

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

create unique index if not exists club_books_id_key on public.club_books (id);

create table if not exists public.club_settings (
  id text primary key default 'main',
  rules text,
  indication_order jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.club_settings
add column if not exists rules text,
add column if not exists indication_order jsonb not null default '[]'::jsonb,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

create table if not exists public.club_reviews (
  book_id text not null,
  participant_id text not null,
  rating numeric not null default 0,
  three_words text,
  deep_review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (book_id, participant_id)
);

alter table public.club_reviews
add column if not exists rating numeric not null default 0,
add column if not exists three_words text,
add column if not exists deep_review text,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

create unique index if not exists club_reviews_book_participant_key on public.club_reviews (book_id, participant_id);

create table if not exists public.club_member_library (
  participant_id text primary key,
  current_book_id text,
  completed_book_ids jsonb not null default '[]'::jsonb,
  books_read_year integer default 0,
  books_read_club integer default 0,
  progress jsonb not null default '{}'::jsonb,
  favorites jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.club_member_library
add column if not exists current_book_id text,
add column if not exists completed_book_ids jsonb not null default '[]'::jsonb,
add column if not exists books_read_year integer default 0,
add column if not exists books_read_club integer default 0,
add column if not exists progress jsonb not null default '{}'::jsonb,
add column if not exists favorites jsonb not null default '[]'::jsonb,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

create unique index if not exists club_member_library_participant_key on public.club_member_library (participant_id);

create table if not exists public.club_feed (
  id text primary key,
  participant_id text not null,
  book_id text,
  date text,
  type text,
  text text,
  progress integer default 0,
  liked_by jsonb not null default '[]'::jsonb,
  comments jsonb not null default '[]'::jsonb,
  edited_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.club_feed
add column if not exists participant_id text,
add column if not exists book_id text,
add column if not exists date text,
add column if not exists type text,
add column if not exists text text,
add column if not exists progress integer default 0,
add column if not exists liked_by jsonb not null default '[]'::jsonb,
add column if not exists comments jsonb not null default '[]'::jsonb,
add column if not exists edited_at text,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

create unique index if not exists club_feed_id_key on public.club_feed (id);

create table if not exists public.club_notifications (
  id text primary key,
  type text,
  title text,
  message text,
  date text,
  created_at timestamptz not null default now()
);

alter table public.club_notifications
add column if not exists type text,
add column if not exists title text,
add column if not exists message text,
add column if not exists date text,
add column if not exists created_at timestamptz not null default now();

create unique index if not exists club_notifications_id_key on public.club_notifications (id);

alter table public.club_state enable row level security;
alter table public.club_members enable row level security;
alter table public.club_meeting enable row level security;
alter table public.club_books enable row level security;
alter table public.club_settings enable row level security;
alter table public.club_reviews enable row level security;
alter table public.club_member_library enable row level security;
alter table public.club_feed enable row level security;
alter table public.club_notifications enable row level security;

grant select, insert, update on public.club_state to authenticated;
grant select, insert, update on public.club_members to authenticated;
grant select, insert, update on public.club_meeting to authenticated;
grant select, insert, update on public.club_books to authenticated;
grant select, insert, update on public.club_settings to authenticated;
grant select, insert, update on public.club_reviews to authenticated;
grant select, insert, update on public.club_member_library to authenticated;
grant select, insert, update on public.club_feed to authenticated;
grant select, insert, update on public.club_notifications to authenticated;

drop policy if exists "Integrantes podem ver estado do clube" on public.club_state;
create policy "Integrantes podem ver estado do clube" on public.club_state for select to authenticated using (true);
drop policy if exists "Integrantes podem criar estado do clube" on public.club_state;
create policy "Integrantes podem criar estado do clube" on public.club_state for insert to authenticated with check (true);
drop policy if exists "Integrantes podem atualizar estado do clube" on public.club_state;
create policy "Integrantes podem atualizar estado do clube" on public.club_state for update to authenticated using (true) with check (true);

drop policy if exists "Integrantes veem integrantes" on public.club_members;
create policy "Integrantes veem integrantes" on public.club_members for select to authenticated using (true);
drop policy if exists "Integrante cria proprio perfil" on public.club_members;
create policy "Integrante cria proprio perfil" on public.club_members for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Integrante atualiza proprio perfil" on public.club_members;
create policy "Integrante atualiza proprio perfil" on public.club_members for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Integrantes leem reuniao" on public.club_meeting;
create policy "Integrantes leem reuniao" on public.club_meeting for select to authenticated using (true);
drop policy if exists "Integrantes salvam reuniao" on public.club_meeting;
create policy "Integrantes salvam reuniao" on public.club_meeting for all to authenticated using (true) with check (true);

drop policy if exists "Integrantes leem livros" on public.club_books;
create policy "Integrantes leem livros" on public.club_books for select to authenticated using (true);
drop policy if exists "Integrantes salvam livros" on public.club_books;
create policy "Integrantes salvam livros" on public.club_books for all to authenticated using (true) with check (true);

drop policy if exists "Integrantes leem configuracoes" on public.club_settings;
create policy "Integrantes leem configuracoes" on public.club_settings for select to authenticated using (true);
drop policy if exists "Integrantes salvam configuracoes" on public.club_settings;
create policy "Integrantes salvam configuracoes" on public.club_settings for all to authenticated using (true) with check (true);

drop policy if exists "Integrantes leem avaliacoes" on public.club_reviews;
create policy "Integrantes leem avaliacoes" on public.club_reviews for select to authenticated using (true);
drop policy if exists "Integrantes salvam avaliacoes" on public.club_reviews;
create policy "Integrantes salvam avaliacoes" on public.club_reviews for all to authenticated using (true) with check (true);

drop policy if exists "Integrantes leem bibliotecas" on public.club_member_library;
create policy "Integrantes leem bibliotecas" on public.club_member_library for select to authenticated using (true);
drop policy if exists "Integrantes salvam bibliotecas" on public.club_member_library;
create policy "Integrantes salvam bibliotecas" on public.club_member_library for all to authenticated using (true) with check (true);

drop policy if exists "Integrantes leem feed" on public.club_feed;
create policy "Integrantes leem feed" on public.club_feed for select to authenticated using (true);
drop policy if exists "Integrantes salvam feed" on public.club_feed;
create policy "Integrantes salvam feed" on public.club_feed for all to authenticated using (true) with check (true);

drop policy if exists "Integrantes leem notificacoes" on public.club_notifications;
create policy "Integrantes leem notificacoes" on public.club_notifications for select to authenticated using (true);
drop policy if exists "Integrantes salvam notificacoes" on public.club_notifications;
create policy "Integrantes salvam notificacoes" on public.club_notifications for all to authenticated using (true) with check (true);

insert into public.club_meeting (id) values ('current') on conflict (id) do nothing;
insert into public.club_settings (id) values ('main') on conflict (id) do nothing;
insert into public.club_state (id, data) values ('default-club-state', '{}'::jsonb) on conflict (id) do nothing;

-- Forca a API do Supabase a reconhecer tabelas/colunas novas imediatamente.
notify pgrst, 'reload schema';
