-- Personal knowledge base for the research agent (pgvector, hybrid vector + full-text).
-- Run once (or re-run after a schema change) in the Supabase SQL editor.
-- The app connects with the service role, so RLS stays enabled with no policies.
create extension if not exists vector;

create table if not exists public.pt_rag_docs (
  id bigserial primary key,
  owner text not null,                -- user_id
  kind text not null,                 -- holdings | settings | valhist | snapshots | quant | filing | report | statement | note
  ref text not null,
  title text,
  content text not null,
  embedding vector(768),
  ticker text,
  doc_type text,
  as_of date,
  source_url text,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (owner, ref)
);

alter table public.pt_rag_docs add column if not exists ticker text;
alter table public.pt_rag_docs add column if not exists doc_type text;
alter table public.pt_rag_docs add column if not exists as_of date;
alter table public.pt_rag_docs add column if not exists source_url text;
alter table public.pt_rag_docs add column if not exists tsv tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || content)) stored;

create index if not exists pt_rag_docs_owner_idx on public.pt_rag_docs (owner);
create index if not exists pt_rag_docs_ticker_idx on public.pt_rag_docs (owner, ticker);
create index if not exists pt_rag_docs_tsv_idx on public.pt_rag_docs using gin (tsv);
create index if not exists pt_rag_docs_embedding_idx on public.pt_rag_docs using ivfflat (embedding vector_cosine_ops) with (lists = 50);

alter table public.pt_rag_docs enable row level security;

drop function if exists public.pt_rag_match(text, vector, int);
drop function if exists public.pt_rag_match(text, vector, text, int, text, text);

-- Hybrid retrieval: rank by cosine distance and by full-text rank, fuse with reciprocal ranks.
create or replace function public.pt_rag_match(
  p_owner text, p_query vector(768), p_qtext text default null, p_k int default 6,
  p_ticker text default null, p_kind text default null
)
returns table (ref text, kind text, title text, content text, meta jsonb, similarity double precision, ticker text, doc_type text, as_of date, source_url text)
language sql stable as $$
with vec as (
  select id, row_number() over (order by embedding <=> p_query) as r
  from public.pt_rag_docs
  where owner = p_owner and embedding is not null
    and (p_ticker is null or ticker = upper(p_ticker))
    and (p_kind is null or kind = p_kind)
  limit 40
), kw as (
  select id, row_number() over (order by ts_rank_cd(tsv, websearch_to_tsquery('english', coalesce(p_qtext, ''))) desc) as r
  from public.pt_rag_docs
  where owner = p_owner and coalesce(p_qtext, '') <> ''
    and (p_ticker is null or ticker = upper(p_ticker))
    and (p_kind is null or kind = p_kind)
    and tsv @@ websearch_to_tsquery('english', p_qtext)
  limit 40
), fused as (
  select id, sum(w) as s from (
    select id, 1.0 / (60 + r) as w from vec
    union all
    select id, 0.9 / (60 + r) as w from kw
  ) u group by id
)
select d.ref, d.kind, d.title, d.content, d.meta, f.s as similarity, d.ticker, d.doc_type, d.as_of, d.source_url
from fused f join public.pt_rag_docs d on d.id = f.id
order by f.s desc
limit least(greatest(p_k, 1), 20);
$$;
