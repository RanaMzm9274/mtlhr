BEGIN;

DROP POLICY IF EXISTS "Chat participants scoped read" ON public.chat_participants;
DROP POLICY IF EXISTS "Chat participants scoped insert" ON public.chat_participants;
DROP POLICY IF EXISTS "Chat participants self update" ON public.chat_participants;

CREATE POLICY "Chat participants scoped read"
ON public.chat_participants FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.chat_conversations cc
    WHERE cc.id = chat_participants.conversation_id
      AND (
        public.is_company_admin(auth.uid(), cc.company_id)
        OR cc.company_id = public.get_user_company_id(auth.uid())
      )
  )
);

CREATE POLICY "Chat participants scoped insert"
ON public.chat_participants FOR INSERT
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.chat_conversations cc
    WHERE cc.id = chat_participants.conversation_id
      AND (
        cc.created_by = auth.uid()
        OR public.is_company_admin(auth.uid(), cc.company_id)
        OR cc.company_id = public.get_user_company_id(auth.uid())
      )
  )
);

CREATE POLICY "Chat participants self update"
ON public.chat_participants FOR UPDATE
USING (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
);

COMMIT;
