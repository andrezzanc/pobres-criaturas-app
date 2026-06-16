-- Correcao para push_subscriptions quando a tabela ja tinha a coluna subscription obrigatoria.
-- Rode no SQL Editor do Supabase.

alter table public.push_subscriptions
add column if not exists subscription jsonb not null default '{}'::jsonb;

alter table public.push_subscriptions
alter column subscription set default '{}'::jsonb;

update public.push_subscriptions
set subscription = jsonb_build_object(
  'endpoint', endpoint,
  'keys', jsonb_build_object('p256dh', p256dh, 'auth', auth)
)
where subscription = '{}'::jsonb
  and endpoint is not null
  and p256dh is not null
  and auth is not null;
