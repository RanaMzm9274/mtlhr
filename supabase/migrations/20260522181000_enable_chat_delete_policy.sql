BEGIN;

DROP POLICY IF EXISTS "Chat conversations scoped delete" ON public.chat_conversations;
CREATE POLICY "Chat conversations scoped delete"
ON public.chat_conversations FOR DELETE
USING (
  public.is_super_admin(auth.uid())
  OR created_by = auth.uid()
  OR public.is_company_admin(auth.uid(), company_id)
);

COMMIT;
