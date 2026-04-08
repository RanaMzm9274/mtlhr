CREATE OR REPLACE FUNCTION public.inspect_portal_table_contract(target_table TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  contract JSONB;
BEGIN
  SELECT jsonb_build_object(
    'columns',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'column_name', column_name,
            'data_type', data_type,
            'udt_name', udt_name,
            'is_nullable', is_nullable,
            'column_default', column_default
          )
          ORDER BY ordinal_position
        )
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = target_table
      ),
      '[]'::jsonb
    ),
    'constraints',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'constraint_name', constraint_name,
            'constraint_type', constraint_type,
            'definition', definition
          )
          ORDER BY constraint_name
        )
        FROM (
          SELECT
            constraint_name,
            constraint_type,
            pg_get_constraintdef(pg_constraint.oid, true) AS definition
          FROM information_schema.table_constraints
          JOIN pg_constraint
            ON pg_constraint.conname = table_constraints.constraint_name
          JOIN pg_class
            ON pg_class.oid = pg_constraint.conrelid
          JOIN pg_namespace
            ON pg_namespace.oid = pg_class.relnamespace
          WHERE table_constraints.table_schema = 'public'
            AND table_constraints.table_name = target_table
            AND pg_namespace.nspname = 'public'
            AND pg_class.relname = target_table
        ) AS constraint_rows
      ),
      '[]'::jsonb
    )
  )
  INTO contract;

  RETURN COALESCE(contract, '{}'::jsonb);
END;
$$;
