-- Push real - aparelhos inscritos para notificacoes do Pobres Criaturas
-- Rode este bloco no SQL Editor do Supabase.

create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text,
  p256dh text,
  auth text,
  subscription jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions
add column if not exists id uuid default gen_random_uuid(),
add column if not exists user_id uuid references auth.users(id) on delete cascade,
add column if not exists endpoint text,
add column if not exists p256dh text,
add column if not exists auth text,
add column if not exists subscription jsonb not null default '{}'::jsonb,
add column if not exists user_agent text,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

create unique index if not exists push_subscriptions_endpoint_key
on public.push_subscriptions (endpoint);

alter table public.push_subscriptions enable row level security;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop policy if exists "Integrante pode ver proprio push" on public.push_subscriptions;
create policy "Integrante pode ver proprio push"
on public.push_subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Integrante pode criar proprio push" on public.push_subscriptions;
create policy "Integrante pode criar proprio push"
on public.push_subscriptions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Integrante pode atualizar proprio push" on public.push_subscriptions;
create policy "Integrante pode atualizar proprio push"
on public.push_subscriptions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Integrante pode apagar proprio push" on public.push_subscriptions;
create policy "Integrante pode apagar proprio push"
on public.push_subscriptions
for delete
to authenticated
using (auth.uid() = user_id);
