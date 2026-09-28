import { supabase } from '@/lib/supabase';
import type { Conversation, Message, Candidate } from '@/types';

export async function getOrCreateConversation(candidateId: string): Promise<Conversation | null> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('candidate_id', candidateId)
    .maybeSingle();

  if (existing) return existing as Conversation;

  // Look up the candidate's claimed user_id if any
  const { data: claim } = await supabase
    .from('candidate_claims')
    .select('user_id')
    .eq('candidate_id', candidateId)
    .eq('status', 'verified')
    .maybeSingle();

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      candidate_id: candidateId,
      candidate_user_id: claim?.user_id ?? null,
    })
    .select('*')
    .single();

  if (error) return null;
  return data as Conversation;
}

export async function getConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false });

  if (error || !data) return [];

  const conversations = data as Conversation[];
  if (conversations.length === 0) return [];

  // Fetch candidate info for each conversation
  const candidateIds = [...new Set(conversations.map((c) => c.candidate_id))];
  const { data: candidates } = await supabase
    .from('candidates')
    .select('id, first_name, last_name, party, photo_url')
    .in('id', candidateIds);

  const candidateMap: Record<string, Candidate> = {};
  (candidates ?? []).forEach((c) => {
    candidateMap[c.id] = c as Candidate;
  });

  // Fetch last message + unread count for each conversation
  const conversationIds = conversations.map((c) => c.id);
  const { data: messages } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, sender_role, body, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false });

  const lastMessageMap: Record<string, Message> = {};
  const unreadMap: Record<string, number> = {};
  const { data: { user } } = await supabase.auth.getUser();

  (messages ?? []).forEach((m) => {
    const mid = m.conversation_id as string;
    if (!lastMessageMap[mid]) {
      lastMessageMap[mid] = m as Message;
    }
    // Count unread: messages not sent by current user, and after their read timestamp
    const conv = conversations.find((c) => c.id === mid);
    if (conv && user && m.sender_id !== user.id) {
      const isVoter = conv.voter_id === user.id;
      const readAt = isVoter ? conv.voter_read_at : conv.candidate_read_at;
      if (!readAt || new Date(m.created_at) > new Date(readAt)) {
        unreadMap[mid] = (unreadMap[mid] ?? 0) + 1;
      }
    }
  });

  return conversations.map((c) => ({
    ...c,
    candidate: candidateMap[c.candidate_id],
    last_message: lastMessageMap[c.id] ?? null,
    unread_count: unreadMap[c.id] ?? 0,
  }));
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as Message[];
}

export async function sendMessage(
  conversationId: string,
  body: string,
  senderRole: 'voter' | 'candidate'
): Promise<Message | null> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_role: senderRole,
      body,
    })
    .select('*')
    .single();

  if (error) return null;

  // Update conversation's last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  // Notify the recipient — previously nobody was told a new message had
  // arrived unless they happened to already have this exact conversation
  // open. Best-effort: a notification failure shouldn't block the message
  // itself from sending.
  try {
    await notifyMessageRecipient(conversationId, senderRole, body);
  } catch {
    // Notification is best-effort; the message already sent successfully.
  }

  return data as Message;
}

async function notifyMessageRecipient(
  conversationId: string,
  senderRole: 'voter' | 'candidate',
  body: string
): Promise<void> {
  const { data: conv } = await supabase
    .from('conversations')
    .select('voter_id, candidate_user_id, candidate_id, candidates(first_name, last_name)')
    .eq('id', conversationId)
    .maybeSingle<{
      voter_id: string;
      candidate_user_id: string | null;
      candidate_id: string;
      candidates: { first_name: string; last_name: string } | null;
    }>();
  if (!conv) return;

  // The recipient is whichever side did NOT send this message.
  const recipientUserId = senderRole === 'voter' ? conv.candidate_user_id : conv.voter_id;
  if (!recipientUserId) return; // e.g. an unclaimed candidate has no user to notify

  // The in-app notification is created by the database (trigger
  // messages_notify_recipient, migration 20260913003400). It used to be inserted
  // here, for the OTHER user -- which the notifications RLS policy always
  // rejected, silently, so recipients never saw a message in the bell.

  // Messages are a direct, personal communication — send an instant email
  // regardless of digest preferences, the same way a messaging app doesn't
  // gate DMs behind a "weekly digest" setting.
  try {
    await supabase.functions.invoke('send-message-notification', {
      body: { conversationId, userId: recipientUserId },
    });
  } catch {
    // Email is best-effort.
  }
}

export async function markConversationRead(conversationId: string, asVoter: boolean): Promise<void> {
  const field = asVoter ? 'voter_read_at' : 'candidate_read_at';
  await supabase
    .from('conversations')
    .update({ [field]: new Date().toISOString() })
    .eq('id', conversationId);
}

export function subscribeToMessages(
  conversationId: string,
  callback: (message: Message) => void
): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        callback(payload.new as Message);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
