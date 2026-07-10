drop policy if exists "minna_admin_lesson_progress_select" on public.lesson_progress;

create policy "minna_admin_lesson_progress_select"
on public.lesson_progress
for select
to authenticated
using ((select public.is_admin_user()));

create or replace view public.minna_admin_leaderboard_identity
with (security_invoker = true)
as
with records as (
  select
    coalesce(lp.user_id::text, lp.user_email, lp.user_key) as user_ref,
    '学习者 ' || right(md5(coalesce(lp.user_id::text, lp.user_email, lp.user_key)), 6) as display_name,
    lp.user_email as google_email,
    lp.user_id::text as user_id_text,
    lp.user_key,
    lp.lesson_id,
    lp.progress,
    lp.updated_at,
    coalesce(nullif(lp.progress ->> 'score', '')::integer, 0) as score,
    coalesce(nullif(lp.progress ->> 'rate', '')::integer, 0) as review_rate,
    case
      when lp.progress ? 'completed_count'
        then coalesce(nullif(lp.progress ->> 'completed_count', '')::integer, 0)
      when lp.progress ? 'done'
        then (select count(*)::integer from jsonb_object_keys(coalesce(lp.progress -> 'done', '{}'::jsonb)))
      else 0
    end as completed_slides,
    greatest(coalesce(nullif(lp.progress ->> 'total_slides', '')::integer, 12), 1) as total_slides,
    case
      when lp.progress ? 'wrong_count'
        then coalesce(nullif(lp.progress ->> 'wrong_count', '')::integer, 0)
      when lp.progress ? 'wrong'
        then (select count(*)::integer from jsonb_object_keys(coalesce(lp.progress -> 'wrong', '{}'::jsonb)))
      else 0
    end as wrong_count,
    coalesce(nullif(lp.progress -> 'mastery' ->> 'vocab', '')::integer, 0) as mastery_vocab,
    coalesce(nullif(lp.progress -> 'mastery' ->> 'grammar', '')::integer, 0) as mastery_grammar,
    coalesce(nullif(lp.progress -> 'mastery' ->> 'examples', '')::integer, 0) as mastery_examples,
    coalesce(nullif(lp.progress -> 'mastery' ->> 'final', '')::integer, 0) as mastery_final,
    coalesce(
      nullif(lp.progress ->> 'last_cloud_saved_at', '')::timestamptz,
      nullif(lp.progress ->> 'updated_client_at', '')::timestamptz,
      nullif(lp.progress ->> 'completed_at', '')::timestamptz,
      lp.updated_at
    ) as last_checkin_at
  from public.lesson_progress lp
  where (select public.is_admin_user())
    and (
      lp.user_id is not null
      or lp.user_email is not null
      or lp.user_key like 'auth:%'
    )
), scored as (
  select
    records.user_ref,
    records.display_name,
    records.google_email,
    records.user_id_text,
    records.user_key,
    records.lesson_id,
    records.completed_slides,
    records.score,
    records.review_rate,
    records.last_checkin_at,
    case
      when records.lesson_id ~ '^minna_lesson_[0-9]{2}$'
        and lower(coalesce(records.progress ->> 'mastery_passed', 'false')) = 'true' then 1
      when records.lesson_id ~ '^minna_lesson_[0-9]{2}$'
        and records.mastery_vocab >= 100
        and records.mastery_grammar >= 80
        and records.mastery_examples >= 80
        and records.mastery_final >= 80
        and records.wrong_count = 0 then 1
      when records.lesson_id ~ '^minna_lesson_[0-9]{2}$'
        and records.completed_slides >= records.total_slides then 1
      when records.lesson_id ~ '^minna_lesson_[0-9]{2}$'
        and lower(coalesce(records.progress ->> 'completed', 'false')) = 'true' then 1
      when records.lesson_id ~ '^minna_lesson_[0-9]{2}$'
        and lower(coalesce(records.progress ->> 'passed', 'false')) = 'true' then 1
      else 0
    end as completed_lesson,
    case
      when records.lesson_id = 'minna_review_01_25'
        and (
          lower(coalesce(records.progress ->> 'review_passed', 'false')) = 'true'
          or lower(coalesce(records.progress ->> 'mastery_passed', 'false')) = 'true'
          or lower(coalesce(records.progress ->> 'completed', 'false')) = 'true'
          or coalesce(nullif(records.progress ->> 'rate', '')::integer, 0) >= 80
        ) then 1
      else 0
    end as has_review_01_25
  from records
)
select
  display_name,
  max(google_email) as google_email,
  max(user_id_text) as user_id,
  max(user_key) as user_key,
  sum(completed_lesson)::integer as completed_lessons,
  sum(case when lesson_id ~ '^minna_lesson_[0-9]{2}$' then completed_slides else 0 end)::integer as completed_slides,
  sum(score)::integer as total_score,
  max(has_review_01_25) as has_review_01_25,
  max(case when lesson_id = 'minna_review_01_25' then review_rate else 0 end) as review_01_25_rate,
  max(last_checkin_at) as last_checkin_at
from scored
group by user_ref, display_name
order by
  sum(completed_lesson)::integer desc,
  max(has_review_01_25) desc,
  sum(score)::integer desc,
  max(last_checkin_at) desc;

revoke all on public.minna_admin_leaderboard_identity from public, anon;
grant select on public.minna_admin_leaderboard_identity to authenticated, service_role;

comment on view public.minna_admin_leaderboard_identity is
  'Admin-only Minna leaderboard identity view. Uses security_invoker and lesson_progress RLS; does not reference auth.users.';
