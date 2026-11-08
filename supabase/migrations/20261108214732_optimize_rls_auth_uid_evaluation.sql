-- Cache auth.uid() once per statement in policies where the value is row-independent.
DO $$
DECLARE p record; ddl text; role_list text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname='public'
      AND (
        (coalesce(qual,'') LIKE '%auth.uid()%' AND coalesce(qual,'') NOT LIKE '%SELECT auth.uid()%')
        OR
        (coalesce(with_check,'') LIKE '%auth.uid()%' AND coalesce(with_check,'') NOT LIKE '%SELECT auth.uid()%')
      )
  LOOP
    SELECT string_agg(quote_ident(r::text), ', ')
      INTO role_list
      FROM unnest(p.roles) AS r;
    ddl := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd, role_list);
    IF p.qual IS NOT NULL THEN
      ddl := ddl || format(' USING (%s)', replace(p.qual, 'auth.uid()', '(select auth.uid())'));
    END IF;
    IF p.with_check IS NOT NULL THEN
      ddl := ddl || format(' WITH CHECK (%s)', replace(p.with_check, 'auth.uid()', '(select auth.uid())'));
    END IF;
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    EXECUTE ddl;
  END LOOP;
END $$;
