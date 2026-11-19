-- Personal knowledge base for the research agent (pgvector).
-- Run once in the Supabase SQL editor. The app uses the service role, so RLS stays on with no policies.
create extension if not exists vector;

create table if not exists public.pt_rag_docs (
  id bigserial primary key,
  owner text not null,                -- user_id (or demo client id)
  kind text not null,                 -- holdings | settings | valhist | snapshots | quant
  ref text not null,
  title text,
  content text not null,
  embedding vector(768),
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (owner, ref)
);

create index if not exists pt_rag_docs_owner_idx on public.pt_rag_docs (owner);
create index if not exists pt_rag_docs_embedding_idx on public.pt_rag_docs using ivfflat (embedding vector_cosine_ops) with (lists = 50);

alter table public.pt_rag_docs enable row level security;

create or replace function public.pt_rag_match(p_owner text, p_query vector(768), p_k int default 6)
returns table (ref text, kind text, title text, content text, meta jsonb, similarity double precision)
language sql stable as $$
  select ref, kind, title, content, meta, 1 - (embedding <=> p_query) as similarity
  from public.pt_rag_docs
  where owner = p_owner and embedding is not null
  order by embedding <=> p_query
  limit least(greatest(p_k, 1), 20);
$$;
