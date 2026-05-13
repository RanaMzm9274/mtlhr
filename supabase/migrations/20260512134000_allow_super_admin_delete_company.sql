CREATE POLICY "Company delete by super admin"
ON public.companies FOR DELETE
USING (public.is_super_admin(auth.uid()));
