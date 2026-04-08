CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.employee_profiles (user_id, name, email, position, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'position', ''),
    'invited'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = CASE
      WHEN COALESCE(NULLIF(public.employee_profiles.name, ''), '') = '' THEN EXCLUDED.name
      ELSE public.employee_profiles.name
    END,
    position = CASE
      WHEN COALESCE(NULLIF(public.employee_profiles.position, ''), '') = '' THEN EXCLUDED.position
      ELSE public.employee_profiles.position
    END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
