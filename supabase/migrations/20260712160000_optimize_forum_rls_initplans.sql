-- Cache stable, row-independent identity checks once per statement instead of
-- re-evaluating them for every row. Helpers that depend on the current row's
-- post/comment IDs intentionally remain direct calls.

alter policy "forum_posts_read_visible"
on public.forum_posts
using (
  is_deleted = false
  and (
    status = 'approved'
    or (select private.forum_is_admin())
    or (
      author_user_id = (select auth.uid())
      and status in ('pending', 'rejected')
    )
  )
);

alter policy "forum_comments_insert_own"
on public.forum_comments
with check (
  author_user_id = (select auth.uid())
  and is_deleted = false
  and private.forum_can_select_post(post_id)
  and private.forum_parent_comment_matches(parent_comment_id, post_id)
);

alter policy "forum_comments_update_own"
on public.forum_comments
using (
  author_user_id = (select auth.uid())
  and is_deleted = false
)
with check (author_user_id = (select auth.uid()));

alter policy "forum_likes_insert_own"
on public.forum_likes
with check (
  user_id = (select auth.uid())
  and private.forum_can_select_post(post_id)
);

alter policy "forum_likes_read_own"
on public.forum_likes
using (user_id = (select auth.uid()));

alter policy "forum_likes_delete_own"
on public.forum_likes
using (user_id = (select auth.uid()));

alter policy "forum_bookmarks_insert_own"
on public.forum_bookmarks
with check (
  user_id = (select auth.uid())
  and private.forum_can_select_post(post_id)
);

alter policy "forum_bookmarks_read_own"
on public.forum_bookmarks
using (user_id = (select auth.uid()));

alter policy "forum_bookmarks_delete_own"
on public.forum_bookmarks
using (user_id = (select auth.uid()));

alter policy "admin_actions_select_admin"
on public.forum_admin_actions
using (
  (
    select ur.role
    from public.user_roles as ur
    where ur.user_id = (select auth.uid())
  ) = 'admin'
);

alter policy "admin_actions_insert_admin"
on public.forum_admin_actions
with check (
  (
    select ur.role
    from public.user_roles as ur
    where ur.user_id = (select auth.uid())
  ) = 'admin'
);

alter policy "comment_admin_actions_select_admin"
on public.forum_comment_admin_actions
using (
  (
    select ur.role
    from public.user_roles as ur
    where ur.user_id = (select auth.uid())
  ) = 'admin'
);

alter policy "comment_admin_actions_insert_admin"
on public.forum_comment_admin_actions
with check (
  (
    select ur.role
    from public.user_roles as ur
    where ur.user_id = (select auth.uid())
  ) = 'admin'
);

-- Supabase's linter does not flag custom helpers here, but these no-argument
-- STABLE calls are equally safe to cache once per statement.
alter policy "forum_posts_admin_manage"
on public.forum_posts
using ((select private.forum_is_admin()))
with check ((select private.forum_is_admin()));

alter policy "forum_comments_admin_manage"
on public.forum_comments
using ((select private.forum_is_admin()))
with check ((select private.forum_is_admin()));

notify pgrst, 'reload schema';
