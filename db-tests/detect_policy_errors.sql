-- Runs SELECT / INSERT / UPDATE / DELETE against EVERY public table as both
-- `authenticated` and `anon`, with WHERE false so no data is touched. RLS
-- policies are expanded at query-rewrite time, so a broken policy (e.g. infinite
-- recursion between policies) raises an error even with zero matching rows.
-- Exits non-zero if any table errors.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE policy_errors(tbl text, role_name text, op text, err text);
DO $$
DECLARE r record; c text; roles text[] := ARRAY['authenticated','anon']; rl text; ops text[]; op text; sql text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003', true);
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity ORDER BY 1 LOOP
    SELECT column_name INTO c FROM information_schema.columns
      WHERE table_schema='public' AND table_name=r.relname ORDER BY ordinal_position LIMIT 1;
    FOREACH rl IN ARRAY roles LOOP
      FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
        sql := CASE op
          WHEN 'SELECT' THEN format('SELECT 1 FROM public.%I WHERE false', r.relname)
          WHEN 'INSERT' THEN format('INSERT INTO public.%I SELECT * FROM public.%I WHERE false', r.relname, r.relname)
          WHEN 'UPDATE' THEN format('UPDATE public.%I SET %I = %I WHERE false', r.relname, c, c)
          WHEN 'DELETE' THEN format('DELETE FROM public.%I WHERE false', r.relname) END;
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', rl);
          EXECUTE sql;
          RESET ROLE;
        EXCEPTION WHEN OTHERS THEN
          RESET ROLE;
          -- permission-denied is expected for some role/table pairs, and INSERT..SELECT * trips on generated columns; only
          -- policy-evaluation failures matter here.
          IF SQLERRM NOT ILIKE 'permission denied%' AND SQLERRM NOT ILIKE '%non-DEFAULT value into column%' THEN
            INSERT INTO policy_errors VALUES (r.relname, rl, op, SQLERRM);
          END IF;
        END;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
SELECT tbl, role_name, op, err FROM policy_errors ORDER BY tbl, role_name, op;
SELECT count(*) AS broken_table_ops FROM policy_errors;
DO $$ BEGIN IF (SELECT count(*) FROM policy_errors) > 0 THEN RAISE EXCEPTION 'BROKEN RLS POLICIES DETECTED'; END IF; END $$;
ROLLBACK;
