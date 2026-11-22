-- Per-user usage / audit trail. One row per API call, written by api/_audit.js (service role only: RLS on, no policies).
-- Stores NO prompts, request bodies, emails or tokens: only route, outcome, latency, error code, ticker symbol,
-- provider failures and a hashed client id. user_id is the VERIFIED Supabase user (null for anonymous visitors).
create table if not exists public.pt_audit (
  id bigserial primary key,
  ts timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  grp text not null,                 -- route group: data | ai | billing | auth | ...
  route text not null,               -- e.g. statements, agent, signup
  method text not null,
  status int not null,
  outcome text not null,             -- ok | denied | gated | rate_limited | client_error | server_error
  ms int not null,
  err text,                          -- short error code only
  client text,                       -- hashed client id (api/_history clientId), not an IP
  symbol text,                       -- ticker the call was about, if any
  meta jsonb                         -- {provider_errors:[...], cache:"..."}
);
alter table public.pt_audit enable row level security;
create index if not exists pt_audit_ts_idx on public.pt_audit (ts desc);
create index if not exists pt_audit_user_ts_idx on public.pt_audit (user_id, ts desc) where user_id is not null;
create index if not exists pt_audit_route_ts_idx on public.pt_audit (grp, route, ts desc);
-- Retention: keep 90 days. Run from a cron or by hand:  delete from public.pt_audit where ts < now() - interval '90 days';
revoke all on table public.pt_audit from anon, authenticated;
revoke all on sequence public.pt_audit_id_seq from anon, authenticated;
