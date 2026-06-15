-- Etapa 7 - Sincronizacao inicial do app com Supabase
-- Rode este bloco no SQL Editor antes de publicar/testar o app conectado.

create table if not exists public.club_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.club_state enable row level security;

grant select, insert, update on public.club_state to authenticated;

drop policy if exists "Integrantes podem ver estado do clube" on public.club_state;
create policy "Integrantes podem ver estado do clube"
on public.club_state
for select
to authenticated
using (true);

drop policy if exists "Integrantes podem criar estado do clube" on public.club_state;
create policy "Integrantes podem criar estado do clube"
on public.club_state
for insert
to authenticated
with check (true);

drop policy if exists "Integrantes podem atualizar estado do clube" on public.club_state;
create policy "Integrantes podem atualizar estado do clube"
on public.club_state
for update
to authenticated
using (true)
with check (true);

insert into public.club_state (id, data)
values ('default-club-state', '{}'::jsonb)
on conflict (id) do nothing;
