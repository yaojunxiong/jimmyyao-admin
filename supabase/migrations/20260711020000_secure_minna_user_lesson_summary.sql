-- Restrict the lesson summary view to authenticated users and make it obey
-- the row-level security policies on public.lesson_progress.
create or replace view public.minna_user_lesson_summary
with (security_invoker = true)
as
select
  user_key,
  user_id,
  user_email,
  lesson_id,
  progress ->> 'score' as score,
  progress ->> 'xp' as xp,
  progress -> 'done' as done_map,
  progress -> 'wrong' as wrong_map,
  updated_at
from public.lesson_progress;

revoke all on public.minna_user_lesson_summary
from public, anon, authenticated, service_role;

grant select on public.minna_user_lesson_summary
to authenticated, service_role;

comment on view public.minna_user_lesson_summary is
  'Authenticated users see their own lesson summary through lesson_progress RLS; admins and service_role retain full access.';
