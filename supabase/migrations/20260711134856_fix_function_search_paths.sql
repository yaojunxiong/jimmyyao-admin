-- Pin mutable function search paths without changing function bodies or
-- execution privileges. These functions only use trigger records, pg_catalog
-- built-ins, or scalar text operations, so an empty search path is safe.

alter function public.email_touch_updated_at()
  set search_path = '';

alter function public.forum_make_excerpt(text)
  set search_path = '';

alter function public.forum_slugify(text)
  set search_path = '';

alter function public.forum_touch_updated_at()
  set search_path = '';

alter function public.minna_course_lessons_touch_updated_at()
  set search_path = '';

alter function public.minna_touch_updated_at()
  set search_path = '';

alter function public.set_lesson_published_items_updated_at()
  set search_path = '';

alter function public.touch_updated_at()
  set search_path = '';

alter function public.trigger_set_updated_at()
  set search_path = '';

alter function public.user_roles_touch_updated_at()
  set search_path = '';

notify pgrst, 'reload schema';
