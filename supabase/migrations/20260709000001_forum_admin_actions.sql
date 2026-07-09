-- Forum Admin Actions Audit Log
-- Records all Approve / Reject / Hide / Restore operations on forum_posts

CREATE TABLE IF NOT EXISTS public.forum_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approve', 'reject', 'hide', 'restore')),
  previous_status text,
  next_status text,
  previous_is_deleted boolean,
  next_is_deleted boolean,
  review_note text,
  actor_user_id uuid REFERENCES auth.users(id),
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient query by post_id
CREATE INDEX IF NOT EXISTS idx_forum_admin_actions_post_id ON public.forum_admin_actions(post_id);
CREATE INDEX IF NOT EXISTS idx_forum_admin_actions_created_at ON public.forum_admin_actions(created_at DESC);

-- Enable RLS
ALTER TABLE public.forum_admin_actions ENABLE ROW LEVEL SECURITY;

-- Admin SELECT: authenticated users with role='admin' in user_roles
CREATE POLICY "admin_actions_select_admin" ON public.forum_admin_actions
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) = 'admin'
  );

-- Admin INSERT: same check as above
CREATE POLICY "admin_actions_insert_admin" ON public.forum_admin_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) = 'admin'
  );

-- No UPDATE or DELETE — audit log is append-only
