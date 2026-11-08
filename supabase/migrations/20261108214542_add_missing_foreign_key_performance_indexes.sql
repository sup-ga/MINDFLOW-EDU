-- Add covering indexes for foreign-key columns flagged by Supabase's performance advisor.
DO $$
DECLARE r record; idx_name text; cols_sql text;
BEGIN
  FOR r IN
    SELECT c.conrelid, c.conname, c.conkey,
           c.conrelid::regclass AS tbl,
           array_agg(quote_ident(a.attname) ORDER BY k.ord) AS cols_sql,
           array_agg(a.attname ORDER BY k.ord) AS cols
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ord)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
    WHERE c.contype='f' AND c.connamespace='public'::regnamespace
    GROUP BY c.oid,c.conrelid,c.conname,c.conkey
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid=r.conrelid AND i.indisvalid
        AND (SELECT array_agg(a.attname ORDER BY x.ord)
             FROM unnest(i.indkey::smallint[]) WITH ORDINALITY x(attnum,ord)
             JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=x.attnum
             WHERE x.ord <= cardinality(r.conkey)) = r.cols
    ) THEN
      idx_name := left('idx_fk_' || replace(r.tbl::text,'.','_') || '_' || array_to_string(r.cols,'_'), 60);
      cols_sql := array_to_string(r.cols_sql, ', ');
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%s)', idx_name, r.tbl, cols_sql);
    END IF;
  END LOOP;
END $$;
