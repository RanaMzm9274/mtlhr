BEGIN;

DROP POLICY IF EXISTS "Chat message reactions self update" ON public.chat_message_reactions;
CREATE POLICY "Chat message reactions self update"
ON public.chat_message_reactions FOR UPDATE
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.chat_messages cm
    JOIN public.chat_participants cp ON cp.conversation_id = cm.conversation_id
    WHERE cm.id = chat_message_reactions.message_id
      AND cp.user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.chat_messages cm
    JOIN public.chat_participants cp ON cp.conversation_id = cm.conversation_id
    WHERE cm.id = chat_message_reactions.message_id
      AND cp.user_id = auth.uid()
  )
);

COMMIT;

