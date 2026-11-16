-- Per-user document store: every document the app keeps (holdings, valuation settings,
-- saved valuations, quant runs, snapshots) lives here, keyed by the same path the browser
-- used in localStorage ("holdings/all", "val/settings", ...). Server-only: RLS on, no
-- policies, so only the service-role key (Vercel functions) can read or write it.

create table if not exists public.pt_user_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,                            -- document path, e.g. holdings/all, val/settings
  data jsonb,                                   -- document body (null = tombstone is not used; delete is a DELETE)
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.pt_user_state enable row level security;

-- listing a user's documents newest first
create index if not exists pt_user_state_user_updated_idx
  on public.pt_user_state (user_id, updated_at desc);
