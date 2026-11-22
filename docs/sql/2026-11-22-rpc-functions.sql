-- RPC functions the API calls (api/_lib.js). They existed on production but were never in the repo, so the
-- staging project lacked them: rateHit() fails closed, so every signup/login/AI call returned 429 "Too many attempts".
-- Definitions copied from production (read-only). Service role only.
create or replace function public.pt_av_spend(p_limit integer) returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare c int;
begin
  insert into pt_av_budget(day, calls) values (current_date, 0) on conflict do nothing;
  update pt_av_budget set calls = calls + 1 where day = current_date and calls < p_limit returning calls into c;
  return c is not null;
end $$;

create or replace function public.pt_rate_hit(p_key text, p_limit integer) returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare c int;
begin
  if random() < 0.01 then delete from pt_rate where updated_at < now() - interval '2 days'; end if;
  insert into pt_rate(key, n) values (p_key, 1)
    on conflict (key) do update set n = pt_rate.n + 1, updated_at = now() where pt_rate.n < p_limit
    returning n into c;
  return c is not null;
end $$;

revoke all on function public.pt_av_spend(integer) from public, anon, authenticated;
revoke all on function public.pt_rate_hit(text, integer) from public, anon, authenticated;
grant execute on function public.pt_av_spend(integer) to service_role;
grant execute on function public.pt_rate_hit(text, integer) to service_role;
