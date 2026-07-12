-- Align Forum table grants with the operations allowed by RLS policies.
-- RLS remains the row-level boundary; these grants remove unnecessary
-- TRUNCATE, TRIGGER, REFERENCES, and unused DML privileges from clients.

revoke all privileges on table
  public.forum_posts,
  public.forum_comments,
  public.forum_likes,
  public.forum_bookmarks,
  public.forum_admin_actions,
  public.forum_comment_admin_actions
from anon, authenticated;

-- Anonymous visitors only read published/visible Forum content through RLS.
grant select on table
  public.forum_posts,
  public.forum_comments
to anon;

-- Signed-in Forum users read posts/comments, create and update their own
-- comments, and toggle their own likes/bookmarks. Admin-only rows and actions
-- continue to be filtered by their existing RLS policies.
grant select on table
  public.forum_posts,
  public.forum_comments,
  public.forum_likes,
  public.forum_bookmarks,
  public.forum_admin_actions,
  public.forum_comment_admin_actions
to authenticated;

grant insert, update, delete on table public.forum_comments
to authenticated;

grant insert, delete on table
  public.forum_likes,
  public.forum_bookmarks
to authenticated;

grant insert on table
  public.forum_admin_actions,
  public.forum_comment_admin_actions
to authenticated;

notify pgrst, 'reload schema';
