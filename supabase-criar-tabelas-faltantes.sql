-- Pobres Criaturas - criar apenas as tabelas que ainda faltam
-- Rode no projeto correto do Supabase: yglotvctkiwwowshdjqw

create table if not exists public.club_settings (
  id text primary key default 'main',
  rules text,
  indication_order jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.club_notifications (
  id text primary key,
  type text,
  title text,
  message text,
  date text,
  created_at timestamptz not null default now()
);

alter table public.club_settings enable row level security;
alter table public.club_reviews enable row level security;
alter table public.club_member_library enable row level security;
alter table public.club_feed enable row level security;
alter table public.club_notifications enable row level security;

grant select, insert, update on public.club_settings to authenticated;
grant select, insert, update on public.club_reviews to authenticated;
grant select, insert, update on public.club_member_library to authenticated;
grant select, insert, update on public.club_feed to authenticated;
grant select, insert, update on public.club_notifications to authenticated;

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

insert into public.club_settings (id)
values ('main')
on conflict (id) do nothing;

notify pgrst, 'reload schema';

select table_name
from information_schema.tables
where table_schema = 'public'
and table_name in (
  'club_settings',
  'club_reviews',
  'club_member_library',
  'club_feed',
  'club_notifications'
)
order by table_name;
