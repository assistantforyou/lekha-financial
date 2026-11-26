-- Demo chat gives a question back when the request produced no answer (provider error or abort before
-- the first token). Paid daily quotas never call this. Service role only.
create or replace function public.pt_rate_undo(p_key text) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare c int;
begin
  update pt_rate set n = n - 1, updated_at = now()
    where key = p_key and n > 0
    returning n into c;
  return coalesce(c, 0);
end $$;

revoke all on function public.pt_rate_undo(text) from public, anon, authenticated;
grant execute on function public.pt_rate_undo(text) to service_role;
