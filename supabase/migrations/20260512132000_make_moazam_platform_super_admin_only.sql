DO $$
DECLARE
  target_user_id UUID;
BEGIN
  SELECT id
  INTO target_user_id
  FROM auth.users
  WHERE lower(email) = 'moazam@mtlondon.tech'
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE NOTICE 'User moazam@mtlondon.tech not found in auth.users; skipping super-admin isolation.';
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles
  WHERE user_id = target_user_id
    AND role IN ('admin', 'employee');

  DELETE FROM public.company_memberships
  WHERE user_id = target_user_id;

  UPDATE public.employee_profiles
  SET company_id = NULL,
      status = 'active',
      updated_at = now()
  WHERE user_id = target_user_id;
END $$;
