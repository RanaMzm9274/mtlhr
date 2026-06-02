DROP POLICY IF EXISTS "User roles chat participant scoped select" ON public.user_roles;

CREATE POLICY "User roles chat participant scoped select"
ON public.user_roles
FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.chat_participants cp_self
    JOIN public.chat_participants cp_target
      ON cp_target.conversation_id = cp_self.conversation_id
    WHERE cp_self.user_id = auth.uid()
      AND cp_target.user_id = user_roles.user_id
  )
);
