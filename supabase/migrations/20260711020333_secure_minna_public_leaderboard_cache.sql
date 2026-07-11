-- Preserve the site-wide leaderboard for both signed-out and signed-in users
-- without evaluating lesson_progress as the view owner. The cache contains one
-- hidden identity hash plus the same seven sanitized fields exposed by the
-- existing view.
create schema if not exists private;

revoke all on schema private
from public, anon, authenticated, service_role;

create table public.minna_public_leaderboard_cache (
  identity_hash text primary key,
  display_name text not null,
  completed_lessons integer not null,
  completed_slides integer not null,
  total_score integer not null,
  has_review_01_25 integer not null,
  review_01_25_rate integer not null,
  last_checkin_at timestamptz,
  constraint minna_public_leaderboard_cache_identity_hash_length
    check (length(identity_hash) = 64)
);

alter table public.minna_public_leaderboard_cache enable row level security;

revoke all on public.minna_public_leaderboard_cache
from public, anon, authenticated, service_role;

create policy "Public read sanitized Minna leaderboard cache"
on public.minna_public_leaderboard_cache
for select
to anon, authenticated
using (true);

-- Do not grant identity_hash. It exists only to update one cached identity at
-- a time and is not part of the public leaderboard contract.
grant select (
  display_name,
  completed_lessons,
  completed_slides,
  total_score,
  has_review_01_25,
  review_01_25_rate,
  last_checkin_at
)
on public.minna_public_leaderboard_cache
to anon, authenticated, service_role;

create function private.rebuild_minna_public_leaderboard_entry(p_user_ref text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  target_identity_hash text;
begin
  if p_user_ref is null then
    return;
  end if;

  -- Serialize refreshes for the same identity. Updates that move a row between
  -- identities acquire these locks in lexical order in the trigger wrapper.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'private.rebuild_minna_public_leaderboard_entry:' || p_user_ref,
      0
    )
  );

  target_identity_hash := pg_catalog.encode(
    extensions.digest(p_user_ref, 'sha256'),
    'hex'
  );

  delete from public.minna_public_leaderboard_cache cache
  where cache.identity_hash = target_identity_hash;

  insert into public.minna_public_leaderboard_cache (
    identity_hash,
    display_name,
    completed_lessons,
    completed_slides,
    total_score,
    has_review_01_25,
    review_01_25_rate,
    last_checkin_at
  )
  with records as (
    select
      p_user_ref as user_ref,
      '学习者 ' || right(md5(p_user_ref), 6) as display_name,
      lp.lesson_id,
      lp.progress,
      lp.updated_at,
      case
        when pg_catalog.pg_input_is_valid(nullif(lp.progress ->> 'score', ''), 'integer')
          then (lp.progress ->> 'score')::integer
        else 0
      end as score,
      case
        when pg_catalog.pg_input_is_valid(nullif(lp.progress ->> 'rate', ''), 'integer')
          then (lp.progress ->> 'rate')::integer
        else 0
      end as review_rate,
      case
        when lp.progress ? 'completed_count'
          and pg_catalog.pg_input_is_valid(
            nullif(lp.progress ->> 'completed_count', ''),
            'integer'
          )
          then (lp.progress ->> 'completed_count')::integer
        when pg_catalog.jsonb_typeof(lp.progress -> 'done') = 'object'
          then (
            select count(*)::integer
            from pg_catalog.jsonb_object_keys(lp.progress -> 'done')
          )
        else 0
      end as completed_slides,
      greatest(
        case
          when pg_catalog.pg_input_is_valid(
            nullif(lp.progress ->> 'total_slides', ''),
            'integer'
          )
            then (lp.progress ->> 'total_slides')::integer
          else 12
        end,
        1
      ) as total_slides,
      case
        when lp.progress ? 'wrong_count'
          and pg_catalog.pg_input_is_valid(
            nullif(lp.progress ->> 'wrong_count', ''),
            'integer'
          )
          then (lp.progress ->> 'wrong_count')::integer
        when pg_catalog.jsonb_typeof(lp.progress -> 'wrong') = 'object'
          then (
            select count(*)::integer
            from pg_catalog.jsonb_object_keys(lp.progress -> 'wrong')
          )
        else 0
      end as wrong_count,
      case
        when pg_catalog.pg_input_is_valid(
          nullif(lp.progress -> 'mastery' ->> 'vocab', ''),
          'integer'
        )
          then (lp.progress -> 'mastery' ->> 'vocab')::integer
        else 0
      end as mastery_vocab,
      case
        when pg_catalog.pg_input_is_valid(
          nullif(lp.progress -> 'mastery' ->> 'grammar', ''),
          'integer'
        )
          then (lp.progress -> 'mastery' ->> 'grammar')::integer
        else 0
      end as mastery_grammar,
      case
        when pg_catalog.pg_input_is_valid(
          nullif(lp.progress -> 'mastery' ->> 'examples', ''),
          'integer'
        )
          then (lp.progress -> 'mastery' ->> 'examples')::integer
        else 0
      end as mastery_examples,
      case
        when pg_catalog.pg_input_is_valid(
          nullif(lp.progress -> 'mastery' ->> 'final', ''),
          'integer'
        )
          then (lp.progress -> 'mastery' ->> 'final')::integer
        else 0
      end as mastery_final,
      coalesce(
        case
          when pg_catalog.pg_input_is_valid(
            nullif(lp.progress ->> 'last_cloud_saved_at', ''),
            'timestamp with time zone'
          )
            then (lp.progress ->> 'last_cloud_saved_at')::timestamptz
        end,
        case
          when pg_catalog.pg_input_is_valid(
            nullif(lp.progress ->> 'updated_client_at', ''),
            'timestamp with time zone'
          )
            then (lp.progress ->> 'updated_client_at')::timestamptz
        end,
        case
          when pg_catalog.pg_input_is_valid(
            nullif(lp.progress ->> 'completed_at', ''),
            'timestamp with time zone'
          )
            then (lp.progress ->> 'completed_at')::timestamptz
        end,
        lp.updated_at
      ) as last_checkin_at
    from public.lesson_progress lp
    where (
        lp.user_id is not null
        and lp.user_id = case
          when pg_catalog.pg_input_is_valid(p_user_ref, 'uuid')
            then p_user_ref::uuid
        end
      )
      or (
        lp.user_id is null
        and lp.user_email is not null
        and lp.user_email = p_user_ref
      )
      or (
        lp.user_id is null
        and lp.user_email is null
        and lp.user_key = p_user_ref
        and lp.user_key like 'auth:%'
      )
  ), scored as (
    select
      records.user_ref,
      records.display_name,
      records.lesson_id,
      records.completed_slides,
      records.score,
      records.review_rate,
      records.last_checkin_at,
      case
        when records.lesson_id ~ '^minna_lesson_[0-9]{2}$'
          and lower(coalesce(records.progress ->> 'mastery_passed', 'false')) = 'true'
          then 1
        when records.lesson_id ~ '^minna_lesson_[0-9]{2}$'
          and records.mastery_vocab >= 100
          and records.mastery_grammar >= 80
          and records.mastery_examples >= 80
          and records.mastery_final >= 80
          and records.wrong_count = 0
          then 1
        when records.lesson_id ~ '^minna_lesson_[0-9]{2}$'
          and records.completed_slides >= records.total_slides
          then 1
        when records.lesson_id ~ '^minna_lesson_[0-9]{2}$'
          and lower(coalesce(records.progress ->> 'completed', 'false')) = 'true'
          then 1
        when records.lesson_id ~ '^minna_lesson_[0-9]{2}$'
          and lower(coalesce(records.progress ->> 'passed', 'false')) = 'true'
          then 1
        else 0
      end as completed_lesson,
      case
        when records.lesson_id = 'minna_review_01_25'
          and (
            lower(coalesce(records.progress ->> 'review_passed', 'false')) = 'true'
            or lower(coalesce(records.progress ->> 'mastery_passed', 'false')) = 'true'
            or lower(coalesce(records.progress ->> 'completed', 'false')) = 'true'
            or records.review_rate >= 80
          )
          then 1
        else 0
      end as has_review_01_25
    from records
  )
  select
    target_identity_hash,
    scored.display_name,
    sum(scored.completed_lesson)::integer as completed_lessons,
    sum(
      case
        when scored.lesson_id ~ '^minna_lesson_[0-9]{2}$'
          then scored.completed_slides
        else 0
      end
    )::integer as completed_slides,
    sum(scored.score)::integer as total_score,
    max(scored.has_review_01_25)::integer as has_review_01_25,
    max(
      case
        when scored.lesson_id = 'minna_review_01_25'
          then scored.review_rate
        else 0
      end
    )::integer as review_01_25_rate,
    max(scored.last_checkin_at) as last_checkin_at
  from scored
  group by scored.user_ref, scored.display_name;
end;
$$;

create function private.refresh_minna_public_leaderboard_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_user_ref text;
  new_user_ref text;
begin
  if tg_op = 'TRUNCATE' then
    delete from public.minna_public_leaderboard_cache;
    return null;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    old_user_ref := coalesce(old.user_id::text, old.user_email, old.user_key);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    new_user_ref := coalesce(new.user_id::text, new.user_email, new.user_key);
  end if;

  if old_user_ref is null then
    perform private.rebuild_minna_public_leaderboard_entry(new_user_ref);
  elsif new_user_ref is null then
    perform private.rebuild_minna_public_leaderboard_entry(old_user_ref);
  elsif old_user_ref = new_user_ref then
    perform private.rebuild_minna_public_leaderboard_entry(old_user_ref);
  elsif old_user_ref < new_user_ref then
    perform private.rebuild_minna_public_leaderboard_entry(old_user_ref);
    perform private.rebuild_minna_public_leaderboard_entry(new_user_ref);
  else
    perform private.rebuild_minna_public_leaderboard_entry(new_user_ref);
    perform private.rebuild_minna_public_leaderboard_entry(old_user_ref);
  end if;

  return null;
end;
$$;

revoke all on function private.rebuild_minna_public_leaderboard_entry(text)
from public, anon, authenticated, service_role;

revoke all on function private.refresh_minna_public_leaderboard_entry()
from public, anon, authenticated, service_role;

-- Row-level triggers fire once for the actual ON CONFLICT path, avoiding the
-- duplicate full rebuild caused by mixed statement-level INSERT/UPDATE triggers.
create trigger refresh_minna_public_leaderboard_entry
after insert or update or delete
on public.lesson_progress
for each row
execute function private.refresh_minna_public_leaderboard_entry();

create trigger clear_minna_public_leaderboard_cache
after truncate
on public.lesson_progress
for each statement
execute function private.refresh_minna_public_leaderboard_entry();

-- CREATE TRIGGER locks lesson_progress against concurrent writes until this
-- migration commits, so no update can land between this backfill and trigger
-- installation.
select private.rebuild_minna_public_leaderboard_entry(source.user_ref)
from (
  select distinct coalesce(lp.user_id::text, lp.user_email, lp.user_key) as user_ref
  from public.lesson_progress lp
  where lp.user_id is not null
     or lp.user_email is not null
     or lp.user_key like 'auth:%'
) source;

create or replace view public.minna_public_leaderboard
with (security_invoker = true)
as
select
  cache.display_name,
  cache.completed_lessons,
  cache.completed_slides,
  cache.total_score,
  cache.has_review_01_25,
  cache.review_01_25_rate,
  cache.last_checkin_at
from public.minna_public_leaderboard_cache cache
order by
  cache.completed_lessons desc,
  cache.has_review_01_25 desc,
  cache.total_score desc,
  cache.last_checkin_at desc;

revoke all on public.minna_public_leaderboard
from public, anon, authenticated, service_role;

grant select on public.minna_public_leaderboard
to anon, authenticated, service_role;

comment on table public.minna_public_leaderboard_cache is
  'RLS cache with a hidden identity hash and the seven sanitized public leaderboard fields.';

comment on function private.refresh_minna_public_leaderboard_entry() is
  'Internal trigger only. Refreshes the affected sanitized leaderboard identity after lesson progress changes.';

comment on view public.minna_public_leaderboard is
  'Site-wide sanitized leaderboard backed by an incrementally maintained RLS cache and evaluated with caller permissions.';

notify pgrst, 'reload schema';
