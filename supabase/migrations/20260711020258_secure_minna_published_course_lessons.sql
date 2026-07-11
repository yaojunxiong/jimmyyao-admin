-- Published course content is already protected by the matching SELECT policy
-- on minna_course_lessons. Evaluate the view as the caller so that policy is
-- enforced, and remove the historical write grants from this updatable view.
alter view public.minna_published_course_lessons
set (security_invoker = true);

revoke all on public.minna_published_course_lessons
from public, anon, authenticated, service_role;

grant select on public.minna_published_course_lessons
to anon, authenticated, service_role;

comment on view public.minna_published_course_lessons is
  'Published-only Minna course content. Uses caller permissions and the minna_course_lessons RLS policies.';

notify pgrst, 'reload schema';
