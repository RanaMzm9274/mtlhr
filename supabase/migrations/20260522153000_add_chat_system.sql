BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_group BOOLEAN NOT NULL DEFAULT false,
  title TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  attachment_path TEXT,
  attachment_name TEXT,
  attachment_mime TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_message_has_payload CHECK (
    NULLIF(BTRIM(COALESCE(content, '')), '') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(attachment_path, '')), '') IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.chat_message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_company ON public.chat_conversations(company_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON public.chat_participants(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_message_reads_user ON public.chat_message_reads(user_id, message_id);

CREATE OR REPLACE FUNCTION public.touch_chat_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.chat_conversations
  SET updated_at = now(),
      last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_chat_conversation ON public.chat_messages;
CREATE TRIGGER trg_touch_chat_conversation
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_chat_conversation();

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chat conversations scoped read"
ON public.chat_conversations FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.chat_participants cp
    WHERE cp.conversation_id = chat_conversations.id
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Chat conversations scoped insert"
ON public.chat_conversations FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_company_admin(auth.uid(), company_id)
    OR company_id = public.get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Chat participants scoped read"
ON public.chat_participants FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.chat_participants cp
    WHERE cp.conversation_id = chat_participants.conversation_id
      AND cp.user_id = auth.uid()
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
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Chat messages scoped read"
ON public.chat_messages FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.chat_participants cp
    WHERE cp.conversation_id = chat_messages.conversation_id
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Chat messages scoped insert"
ON public.chat_messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.chat_participants cp
      WHERE cp.conversation_id = chat_messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Chat message reads scoped read"
ON public.chat_message_reads FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.chat_messages cm
    JOIN public.chat_participants cp ON cp.conversation_id = cm.conversation_id
    WHERE cm.id = chat_message_reads.message_id
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Chat message reads self insert"
ON public.chat_message_reads FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.chat_messages cm
    JOIN public.chat_participants cp ON cp.conversation_id = cm.conversation_id
    WHERE cm.id = chat_message_reads.message_id
      AND cp.user_id = auth.uid()
  )
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Chat attachments read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.chat_messages cm
    JOIN public.chat_participants cp ON cp.conversation_id = cm.conversation_id
    WHERE cm.attachment_path = storage.objects.name
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Chat attachments insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reads';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

COMMIT;
