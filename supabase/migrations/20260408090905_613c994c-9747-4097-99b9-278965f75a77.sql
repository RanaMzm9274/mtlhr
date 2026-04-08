
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'invitations'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can read invitations by token" ON public.invitations';
    EXECUTE 'CREATE POLICY "Block public invitation reads" ON public.invitations FOR SELECT USING (false)';
  END IF;
END $$;
