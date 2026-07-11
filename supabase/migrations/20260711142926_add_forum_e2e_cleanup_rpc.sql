-- Allow the authenticated admin test flow to remove only its own synthetic
-- Forum posts after a successful or failed run. Keeping this narrowly scoped
-- prevents hidden test posts from consuming the normal user's daily quota.

create function private.admin_delete_forum_e2e_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text;
  v_body text;
  v_created_at timestamptz;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not exists (
    select 1
    from public.user_roles
    where user_id = v_user_id
      and role = 'admin'
  ) then
    return jsonb_build_object('success', false, 'error', 'not_authorized');
  end if;

  select title, body, created_at
  into v_title, v_body, v_created_at
  from public.forum_posts
  where id = p_post_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'post_not_found');
  end if;

  if v_title not like 'Forum E2E %'
     or v_body not like 'Automated Forum Issue 2 acceptance body %'
     or v_created_at < now() - interval '24 hours' then
    return jsonb_build_object('success', false, 'error', 'not_e2e_post');
  end if;

  delete from public.forum_posts where id = p_post_id;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'action', 'delete_e2e_test'
  );
end;
$$;

revoke execute on function private.admin_delete_forum_e2e_post(uuid)
from public, anon, authenticated;
grant execute on function private.admin_delete_forum_e2e_post(uuid)
to authenticated, service_role;

create function public.admin_delete_forum_e2e_post(p_post_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.admin_delete_forum_e2e_post($1) $$;

revoke execute on function public.admin_delete_forum_e2e_post(uuid)
from public, anon, authenticated;
grant execute on function public.admin_delete_forum_e2e_post(uuid)
to authenticated, service_role;

notify pgrst, 'reload schema';
