-- Preserve anonymous demo progress while preventing anonymous access to rows
-- linked to authenticated identities. Bound guest keys and JSON payload size.

alter policy "demo_select_lesson_progress"
on public.lesson_progress
using (
  user_id is null
  and user_email is null
);

alter policy "demo_insert_lesson_progress"
on public.lesson_progress
with check (
  user_id is null
  and user_email is null
  and char_length(btrim(user_key)) between 1 and 256
  and char_length(btrim(lesson_id)) between 1 and 128
  and jsonb_typeof(progress) = 'object'
  and pg_column_size(progress) <= 65536
);

alter policy "demo_update_lesson_progress"
on public.lesson_progress
using (
  user_id is null
  and user_email is null
  and char_length(btrim(user_key)) between 1 and 256
)
with check (
  user_id is null
  and user_email is null
  and char_length(btrim(user_key)) between 1 and 256
  and char_length(btrim(lesson_id)) between 1 and 128
  and jsonb_typeof(progress) = 'object'
  and pg_column_size(progress) <= 65536
);

notify pgrst, 'reload schema';
