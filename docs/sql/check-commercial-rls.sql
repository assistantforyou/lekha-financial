-- Run in the project's SQL editor. All statements read catalog metadata only.
-- The application accesses these private tables via server-side service-role handlers.
-- Every row should report true for rls_enabled and zero browser_policies.
select target.name,
       coalesce(c.relrowsecurity, false) as rls_enabled,
       (select count(*) from pg_catalog.pg_policies p
        where p.schemaname = 'public' and p.tablename = target.name
          and p.roles && array['public','anon','authenticated']::name[]) as browser_policies
from (values ('pt_profiles'), ('pt_user_state'), ('pt_rag_docs'), ('pt_costs'), ('pt_cost_fixed')) as target(name)
left join pg_catalog.pg_class c on c.oid = to_regclass(format('public.%I', target.name))
order by target.name;
