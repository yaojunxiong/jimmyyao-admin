-- Forum categories are public reference data, but category administration is
-- owner-only. Data API clients may list active categories and cannot mutate
-- the catalog directly.

alter table public.forum_categories enable row level security;

drop policy if exists forum_categories_active_read
  on public.forum_categories;

create policy forum_categories_active_read
  on public.forum_categories
  for select
  to anon, authenticated
  using (is_active);

revoke all privileges
  on table public.forum_categories
  from public;

revoke all privileges
  on table public.forum_categories
  from anon, authenticated, service_role;

grant select
  on table public.forum_categories
  to anon, authenticated, service_role;

comment on policy forum_categories_active_read
  on public.forum_categories
  is 'Anonymous and authenticated Forum clients may list active categories; writes remain owner-only.';

notify pgrst, 'reload schema';
