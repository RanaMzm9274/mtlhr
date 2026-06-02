BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_message_reactions_emoji_check CHECK (char_length(emoji) > 0),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message ON public.chat_message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_user ON public.chat_message_reactions(user_id);

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Chat message reactions read" ON public.chat_message_reactions;
CREATE POLICY "Chat message reactions read"
ON public.chat_message_reactions FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.chat_messages cm
    JOIN public.chat_participants cp ON cp.conversation_id = cm.conversation_id
    WHERE cm.id = chat_message_reactions.message_id
      AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Chat message reactions self insert" ON public.chat_message_reactions;
CREATE POLICY "Chat message reactions self insert"
ON public.chat_message_reactions FOR INSERT
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

DROP POLICY IF EXISTS "Chat message reactions self delete" ON public.chat_message_reactions;
CREATE POLICY "Chat message reactions self delete"
ON public.chat_message_reactions FOR DELETE
USING (user_id = auth.uid());

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

COMMIT;

