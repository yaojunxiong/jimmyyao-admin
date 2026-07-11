-- Replace unrestricted INSERT/UPDATE checks with ownership and bounded-data
-- predicates while retaining anonymous telemetry and guest math workflows.

alter policy "math_devices insert all" on public.math_devices
with check (
  (user_id is null or user_id = (select auth.uid()))
  and char_length(btrim(device_fingerprint)) between 8 and 512
  and (
    user_id is not null
    or char_length(btrim(coalesce(guest_user_id, ''))) between 1 and 128
  )
  and (screen_width is null or screen_width between 1 and 20000)
  and (screen_height is null or screen_height between 1 and 20000)
);

alter policy "math_devices update all" on public.math_devices
using (
  (user_id is null or user_id = (select auth.uid()))
  and char_length(btrim(device_fingerprint)) between 8 and 512
)
with check (
  (user_id is null or user_id = (select auth.uid()))
  and char_length(btrim(device_fingerprint)) between 8 and 512
  and (
    user_id is not null
    or char_length(btrim(coalesce(guest_user_id, ''))) between 1 and 128
  )
  and (screen_width is null or screen_width between 1 and 20000)
  and (screen_height is null or screen_height between 1 and 20000)
);

alter policy "math_mistakes insert all" on public.math_mistake_facts
with check (
  (user_id is null or user_id = (select auth.uid()))
  and (
    user_id is not null
    or char_length(btrim(coalesce(guest_user_id, ''))) between 1 and 128
  )
  and a between -10000 and 10000
  and b between -10000 and 10000
  and answer between -100000000 and 100000000
  and wrong_count between 0 and 100000
  and slow_count between 0 and 100000
  and right_streak between 0 and 100000
);

alter policy "math_mistakes update all" on public.math_mistake_facts
using (
  (user_id is null or user_id = (select auth.uid()))
  and (
    user_id is not null
    or char_length(btrim(coalesce(guest_user_id, ''))) between 1 and 128
  )
)
with check (
  (user_id is null or user_id = (select auth.uid()))
  and (
    user_id is not null
    or char_length(btrim(coalesce(guest_user_id, ''))) between 1 and 128
  )
  and a between -10000 and 10000
  and b between -10000 and 10000
  and answer between -100000000 and 100000000
  and wrong_count between 0 and 100000
  and slow_count between 0 and 100000
  and right_streak between 0 and 100000
);

alter policy "math_test_results insert all" on public.math_test_results
with check (
  (user_id is null or user_id = (select auth.uid()))
  and (
    user_id is not null
    or char_length(btrim(coalesce(guest_user_id, ''))) between 1 and 128
  )
  and char_length(btrim(mode)) between 1 and 64
  and total_questions between 0 and 10000
  and correct_count between 0 and total_questions
  and accuracy between 0 and 100
  and total_seconds between 0 and 86400
  and avg_seconds between 0 and 86400
  and wrong_count between 0 and total_questions
  and char_length(locale) between 1 and 16
);

alter policy "math_test_results update authenticated"
on public.math_test_results
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and char_length(btrim(mode)) between 1 and 64
  and total_questions between 0 and 10000
  and correct_count between 0 and total_questions
  and accuracy between 0 and 100
  and total_seconds between 0 and 86400
  and avg_seconds between 0 and 86400
  and wrong_count between 0 and total_questions
  and char_length(locale) between 1 and 16
);

alter policy "allow visitor insert" on public.minna_visitor_logs
with check (
  (user_id is null or user_id = (select auth.uid()))
  and char_length(btrim(visitor_id)) between 1 and 256
  and (page_path is null or char_length(page_path) <= 2048)
  and (page_title is null or char_length(page_title) <= 1024)
  and (screen_width is null or screen_width between 1 and 20000)
  and (screen_height is null or screen_height between 1 and 20000)
);

alter policy "site_visit_logs insert all" on public.site_visit_logs
with check (
  (user_id is null or user_id = (select auth.uid()))
  and char_length(btrim(site_code)) between 1 and 64
  and char_length(page_url) between 1 and 4096
  and (guest_user_id is null or char_length(guest_user_id) <= 256)
  and (session_id is null or char_length(session_id) <= 256)
  and (screen_width is null or screen_width between 1 and 20000)
  and (screen_height is null or screen_height between 1 and 20000)
  and (extra is null or pg_column_size(extra) <= 65536)
);

alter policy "site_visit_logs update authenticated"
on public.site_visit_logs
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and char_length(btrim(site_code)) between 1 and 64
  and char_length(page_url) between 1 and 4096
  and (guest_user_id is null or char_length(guest_user_id) <= 256)
  and (session_id is null or char_length(session_id) <= 256)
  and (screen_width is null or screen_width between 1 and 20000)
  and (screen_height is null or screen_height between 1 and 20000)
  and (extra is null or pg_column_size(extra) <= 65536)
);

notify pgrst, 'reload schema';
