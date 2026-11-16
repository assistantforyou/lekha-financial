-- Accounts, Premium billing and the admin cost log. Server-only tables: RLS on, no policies,
-- so only the service-role key (Vercel functions) can read or write them.

create table if not exists public.pt_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  plan text not null default 'free',            -- free | premium
  stripe_customer_id text unique,
  stripe_subscription_id text,
  sub_status text,                              -- Stripe status: active, trialing, past_due, canceled, ...
  period_end timestamptz,
  prefs jsonb not null default '{}'::jsonb,     -- display + layout preferences synced from the browser
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pt_profiles enable row level security;

create table if not exists public.pt_costs (
  id bigserial primary key,
  ts timestamptz not null default now(),
  service text not null,                        -- Z.ai, Gemini, ...
  job text,                                     -- import, news, ...
  model text,
  units jsonb not null default '{}'::jsonb,     -- {in, out, pages}
  usd numeric(14, 8) not null default 0
);
create index if not exists pt_costs_ts on public.pt_costs (ts desc);
alter table public.pt_costs enable row level security;

create table if not exists public.pt_cost_fixed (
  service text primary key,
  usd_month numeric(10, 2) not null default 0,
  note text
);
alter table public.pt_cost_fixed enable row level security;
