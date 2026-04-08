
DROP POLICY IF EXISTS "Anyone can read invitations by token" ON public.invitations;
CREATE POLICY "Block public invitation reads" ON public.invitations FOR SELECT USING (false);
