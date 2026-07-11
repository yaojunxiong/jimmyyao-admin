-- The public forum view needs only the profile identifier, display name, and
-- avatar for its LEFT JOIN. Give anon column-level access to that projection;
-- profiles.email and the remaining profile columns stay inaccessible.
drop policy if exists "profiles read public identity" on public.profiles;

create policy "profiles read public identity"
on public.profiles
for select
to anon
using (true);

revoke all on public.profiles from anon;

grant select (id, display_name, avatar_url)
on public.profiles
to anon;

alter view public.forum_posts_public
set (security_invoker = true);

revoke all on public.forum_posts_public
from public, anon, authenticated, service_role;

grant select on public.forum_posts_public
to anon, authenticated, service_role;

comment on policy "profiles read public identity" on public.profiles is
  'Anonymous readers can resolve only the id, display_name, and avatar_url columns granted for public forum authors.';

comment on view public.forum_posts_public is
  'Approved, non-deleted forum posts with public author identity fields; evaluated with caller permissions and base-table RLS.';

notify pgrst, 'reload schema';
