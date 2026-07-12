-- PostgreSQL does not create indexes automatically on the referencing side of
-- foreign keys. Cover the remaining Forum foreign keys so joins and cascades
-- do not need to scan entire tables as the community grows.

create index if not exists idx_forum_admin_actions_actor_user_id
on public.forum_admin_actions (actor_user_id);

create index if not exists forum_bookmarks_user_id_idx
on public.forum_bookmarks (user_id);

create index if not exists idx_forum_comment_admin_actions_actor_user_id
on public.forum_comment_admin_actions (actor_user_id);

create index if not exists idx_forum_comment_admin_actions_post_id
on public.forum_comment_admin_actions (post_id);

create index if not exists forum_comments_author_user_id_idx
on public.forum_comments (author_user_id);

create index if not exists forum_comments_parent_comment_id_idx
on public.forum_comments (parent_comment_id);

create index if not exists forum_likes_user_id_idx
on public.forum_likes (user_id);

create index if not exists forum_posts_reviewed_by_idx
on public.forum_posts (reviewed_by);
