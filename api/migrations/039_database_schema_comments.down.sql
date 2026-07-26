-- 回滚本迁移添加的表备注和字段备注。

DO $$
DECLARE
    table_row RECORD;
    column_row RECORD;
BEGIN
    FOR table_row IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name <> '_sqlx_migrations'
        ORDER BY table_name
    LOOP
        FOR column_row IN
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = table_row.table_name
            ORDER BY ordinal_position
        LOOP
            EXECUTE format(
                'COMMENT ON COLUMN public.%I.%I IS NULL',
                table_row.table_name,
                column_row.column_name
            );
        END LOOP;
        EXECUTE format('COMMENT ON TABLE public.%I IS NULL', table_row.table_name);
    END LOOP;
END
$$;
