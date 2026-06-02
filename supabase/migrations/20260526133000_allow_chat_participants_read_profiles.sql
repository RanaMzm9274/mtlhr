DROP POLICY IF EXISTS "Employee profiles chat participant scoped select" ON public.employee_profiles;

CREATE POLICY "Employee profiles chat participant scoped select"
ON public.employee_profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_participants cp_self
    JOIN public.chat_participants cp_target
      ON cp_target.conversation_id = cp_self.conversation_id
    WHERE cp_self.user_id = auth.uid()
      AND cp_target.user_id = employee_profiles.user_id
  )
);
