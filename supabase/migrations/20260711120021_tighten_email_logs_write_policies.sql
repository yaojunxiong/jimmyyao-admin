-- Remove legacy permissive policies. The owner/admin-scoped policies remain
-- responsible for authenticated INSERT and UPDATE access.

drop policy if exists "email_logs insert authenticated"
  on public.email_logs;

drop policy if exists "email_logs update authenticated"
  on public.email_logs;

notify pgrst, 'reload schema';
