BEGIN;

-- Keep only the most recent reaction per (message_id, user_id)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY message_id, user_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.chat_message_reactions
)
DELETE FROM public.chat_message_reactions r
USING ranked x
WHERE r.id = x.id
  AND x.rn > 1;

-- Remove previous uniqueness and enforce single reaction per user per message
ALTER TABLE public.chat_message_reactions
DROP CONSTRAINT IF EXISTS chat_message_reactions_message_id_user_id_emoji_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_message_reactions_message_user_unique
ON public.chat_message_reactions(message_id, user_id);

COMMIT;

