-- Verificacao das tabelas do app Pobres Criaturas
-- Rode no SQL Editor do mesmo projeto Supabase usado no app.

select table_name
from information_schema.tables
where table_schema = 'public'
and table_name in (
  'club_members',
  'club_meeting',
  'club_books',
  'club_settings',
  'club_reviews',
  'club_member_library',
  'club_feed',
  'club_notifications',
  'club_state',
  'push_subscriptions'
)
order by table_name;

-- Se as tabelas aparecerem acima, mas o app disser "schema cache",
-- rode esta linha para a API reconhecer tudo imediatamente:
notify pgrst, 'reload schema';
