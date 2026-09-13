/*
# Create voter-candidate messaging system

## What this does
Adds a direct messaging feature that allows signed-in voters to message
candidates (and candidates to message voters back). Conversations are
1:1 between a user and a candidate. Messages belong to a conversation.

## New Tables

### `conversations`
- `id` (uuid PK)
- `voter_id` (uuid, NOT NULL, DEFAULT auth.uid()) — the voter who started the conversation
- `candidate_id` (uuid, NOT NULL) — the candidate being messaged
- `candidate_user_id` (uuid, NULLABLE) — the user_id of the candidate's claimed account (filled when a candidate has a verified claim)
- `created_at` (timestamptz, DEFAULT now())
- `last_message_at` (timestamptz, DEFAULT now()) — updated on each new message, used for sorting
- `voter_read_at` (timestamptz, NULLABLE) — last time the voter marked the conversation as read
- `candidate_read_at` (timestamptz, NULLABLE) — last time the candidate marked the conversation as read
- Unique constraint on (voter_id, candidate_id) to prevent duplicate conversations

### `messages`
- `id` (uuid PK)
- `conversation_id` (uuid, NOT NULL, FK to conversations ON DELETE CASCADE)
- `sender_id` (uuid, NOT NULL, DEFAULT auth.uid()) — the user who sent the message
- `sender_role` (text, NOT NULL) — 'voter' or 'candidate'
- `body` (text, NOT NULL)
- `created_at` (timestamptz, DEFAULT now())

## Security (RLS)

### conversations
- SELECT: a user can see conversations where they are the voter OR where they are the candidate's claimed user (candidate_user_id matches auth.uid())
- INSERT: any authenticated user can create a conversation where they are the voter (auth.uid() = voter_id)
- UPDATE: both the voter and the candidate user can update read timestamps on conversations they can see
- DELETE: only the voter can delete their own conversations

### messages
- SELECT: a user can see messages in conversations they are a participant of
- INSERT: a user can send messages in conversations they are a participant of
- DELETE: only the sender can delete their own messages

## Indexes
- `idx_conversations_voter` on conversations(voter_id)
- `idx_conversations_candidate` on conversations(candidate_id)
- `idx_conversations_candidate_user` on conversations(candidate_user_id)
- `idx_messages_conversation` on messages(conversation_id)
- `idx_messages_sender` on messages(sender_id)
*/

-- ============================================
-- conversations table
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  candidate_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  voter_read_at timestamptz,
  candidate_read_at timestamptz,
  UNIQUE (voter_id, candidate_id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user the candidate's claimed account?
-- A candidate's user_id comes from candidate_claims where status = 'verified'.
-- We check this inline in policies rather than a separate function to keep it
-- transparent and avoid SECURITY DEFINER complexity.

DROP POLICY IF EXISTS "select_own_conversations" ON conversations;
CREATE POLICY "select_own_conversations"
ON conversations FOR SELECT
TO authenticated
USING (
  auth.uid() = voter_id
  OR auth.uid() = candidate_user_id
  OR (
    candidate_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = conversations.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  )
);

DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations"
ON conversations FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = voter_id
);

DROP POLICY IF EXISTS "update_own_conversations" ON conversations;
CREATE POLICY "update_own_conversations"
ON conversations FOR UPDATE
TO authenticated
USING (
  auth.uid() = voter_id
  OR auth.uid() = candidate_user_id
  OR (
    candidate_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = conversations.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  )
)
WITH CHECK (
  auth.uid() = voter_id
  OR auth.uid() = candidate_user_id
  OR (
    candidate_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM candidate_claims cc
      WHERE cc.candidate_id = conversations.candidate_id
        AND cc.user_id = auth.uid()
        AND cc.status = 'verified'
    )
  )
);

DROP POLICY IF EXISTS "delete_own_conversations" ON conversations;
CREATE POLICY "delete_own_conversations"
ON conversations FOR DELETE
TO authenticated
USING (auth.uid() = voter_id);

-- ============================================
-- messages table
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL DEFAULT 'voter' CHECK (sender_role IN ('voter', 'candidate')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_messages" ON messages;
CREATE POLICY "select_own_messages"
ON messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND (
      auth.uid() = c.voter_id
      OR auth.uid() = c.candidate_user_id
      OR (
        c.candidate_user_id IS NULL
        AND EXISTS (
          SELECT 1 FROM candidate_claims cc
          WHERE cc.candidate_id = c.candidate_id
            AND cc.user_id = auth.uid()
            AND cc.status = 'verified'
        )
      )
    )
  )
);

DROP POLICY IF EXISTS "insert_own_messages" ON messages;
CREATE POLICY "insert_own_messages"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND (
      auth.uid() = c.voter_id
      OR auth.uid() = c.candidate_user_id
      OR (
        c.candidate_user_id IS NULL
        AND EXISTS (
          SELECT 1 FROM candidate_claims cc
          WHERE cc.candidate_id = c.candidate_id
            AND cc.user_id = auth.uid()
            AND cc.status = 'verified'
        )
      )
    )
  )
);

DROP POLICY IF EXISTS "delete_own_messages" ON messages;
CREATE POLICY "delete_own_messages"
ON messages FOR DELETE
TO authenticated
USING (auth.uid() = sender_id);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_conversations_voter ON conversations(voter_id);
CREATE INDEX IF NOT EXISTS idx_conversations_candidate ON conversations(candidate_id);
CREATE INDEX IF NOT EXISTS idx_conversations_candidate_user ON conversations(candidate_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO authenticated;
