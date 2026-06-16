-- Pobres Criaturas - corrigir permissoes/RLS das tabelas do app
-- Rode no projeto correto do Supabase.
-- Este arquivo NAO apaga dados.

create table if not exists public.club_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

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
drop policy if exists "Integrantes podem criar estado do clube" on public.club_state;
drop policy if exists "Integrantes podem atualizar estado do clube" on public.club_state;

create policy "Integrantes podem ver estado do clube"
on public.club_state
for select
to authenticated
using (true);

create policy "Integrantes podem criar estado do clube"
on public.club_state
for insert
to authenticated
with check (true);

create policy "Integrantes podem atualizar estado do clube"
on public.club_state
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Integrante cria proprio perfil" on public.club_members;
drop policy if exists "Integrante atualiza proprio perfil" on public.club_members;
drop policy if exists "Integrante pode criar proprio perfil" on public.club_members;
drop policy if exists "Integrante pode atualizar proprio perfil" on public.club_members;
drop policy if exists "Integrantes veem integrantes" on public.club_members;

create policy "Integrantes podem ver integrantes"
on public.club_members
for select
to authenticated
using (true);

create policy "Integrantes podem criar integrantes"
on public.club_members
for insert
to authenticated
with check (true);

create policy "Integrantes podem atualizar integrantes"
on public.club_members
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Integrantes leem reuniao" on public.club_meeting;
drop policy if exists "Integrantes salvam reuniao" on public.club_meeting;
create policy "Integrantes leem reuniao" on public.club_meeting for select to authenticated using (true);
create policy "Integrantes salvam reuniao" on public.club_meeting for all to authenticated using (true) with check (true);

drop policy if exists "Integrantes leem livros" on public.club_books;
drop policy if exists "Integrantes salvam livros" on public.club_books;
create policy "Integrantes leem livros" on public.club_books for select to authenticated using (true);
create policy "Integrantes salvam livros" on public.club_books for all to authenticated using (true) with check (true);

drop policy if exists "Integrantes leem configuracoes" on public.club_settings;
drop policy if exists "Integrantes salvam configuracoes" on public.club_settings;
create policy "Integrantes leem configuracoes" on public.club_settings for select to authenticated using (true);
create policy "Integrantes salvam configuracoes" on public.club_settings for all to authenticated using (true) with check (true);

drop policy if exists "Integrantes leem avaliacoes" on public.club_reviews;
drop policy if exists "Integrantes salvam avaliacoes" on public.club_reviews;
create policy "Integrantes leem avaliacoes" on public.club_reviews for select to authenticated using (true);
create policy "Integrantes salvam avaliacoes" on public.club_reviews for all to authenticated using (true) with check (true);

drop policy if exists "Integrantes leem bibliotecas" on public.club_member_library;
drop policy if exists "Integrantes salvam bibliotecas" on public.club_member_library;
create policy "Integrantes leem bibliotecas" on public.club_member_library for select to authenticated using (true);
create policy "Integrantes salvam bibliotecas" on public.club_member_library for all to authenticated using (true) with check (true);

drop policy if exists "Integrantes leem feed" on public.club_feed;
drop policy if exists "Integrantes salvam feed" on public.club_feed;
create policy "Integrantes leem feed" on public.club_feed for select to authenticated using (true);
create policy "Integrantes salvam feed" on public.club_feed for all to authenticated using (true) with check (true);

drop policy if exists "Integrantes leem notificacoes" on public.club_notifications;
drop policy if exists "Integrantes salvam notificacoes" on public.club_notifications;
create policy "Integrantes leem notificacoes" on public.club_notifications for select to authenticated using (true);
create policy "Integrantes salvam notificacoes" on public.club_notifications for all to authenticated using (true) with check (true);

insert into public.club_state (id, data)
values ('default-club-state', '{}'::jsonb)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
