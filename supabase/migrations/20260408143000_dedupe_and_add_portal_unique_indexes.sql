-- Clean up legacy duplicate rows and restore unique indexes required by the
-- portal's logical data model.

WITH ranked_profiles AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        COALESCE(profile_completed, false) DESC,
        COALESCE(updated_at, created_at, now()) DESC,
        created_at DESC,
        id DESC
    ) AS row_num
  FROM public.employee_profiles
  WHERE user_id IS NOT NULL
)
DELETE FROM public.employee_profiles
WHERE id IN (
  SELECT id
  FROM ranked_profiles
  WHERE row_num > 1
);

WITH ranked_roles AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, role
      ORDER BY id DESC
    ) AS row_num
  FROM public.user_roles
  WHERE user_id IS NOT NULL
)
DELETE FROM public.user_roles
WHERE id IN (
  SELECT id
  FROM ranked_roles
  WHERE row_num > 1
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'employee_profiles'
      AND indexname = 'employee_profiles_user_id_uidx'
  ) THEN
    CREATE UNIQUE INDEX employee_profiles_user_id_uidx
      ON public.employee_profiles(user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND indexname = 'user_roles_user_id_role_uidx'
  ) THEN
    CREATE UNIQUE INDEX user_roles_user_id_role_uidx
      ON public.user_roles(user_id, role);
  END IF;
END $$;
