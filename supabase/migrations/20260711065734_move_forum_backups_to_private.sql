-- These CTAS snapshots are retained for incident forensics only. They have no
-- application callers or database dependents and must not remain reachable
-- through the public Data API schema.
alter table public.forum_posts_backup_20260708
set schema private;

alter table public.forum_comments_backup_20260708
set schema private;

alter table public.forum_likes_backup_20260708
set schema private;

alter table public.forum_bookmarks_backup_20260708
set schema private;

revoke all privileges
on table
  private.forum_posts_backup_20260708,
  private.forum_comments_backup_20260708,
  private.forum_likes_backup_20260708,
  private.forum_bookmarks_backup_20260708
from public, anon, authenticated, service_role;

alter table private.forum_posts_backup_20260708
enable row level security;

alter table private.forum_comments_backup_20260708
enable row level security;

alter table private.forum_likes_backup_20260708
enable row level security;

alter table private.forum_bookmarks_backup_20260708
enable row level security;

comment on table private.forum_posts_backup_20260708 is
  'Private forensic snapshot created on 2026-07-08; not a complete production restore source.';

comment on table private.forum_comments_backup_20260708 is
  'Private empty forensic snapshot created on 2026-07-08; not a complete production restore source.';

comment on table private.forum_likes_backup_20260708 is
  'Private empty forensic snapshot created on 2026-07-08; not a complete production restore source.';

comment on table private.forum_bookmarks_backup_20260708 is
  'Private empty forensic snapshot created on 2026-07-08; not a complete production restore source.';

notify pgrst, 'reload schema';
