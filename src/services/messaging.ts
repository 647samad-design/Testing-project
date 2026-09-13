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

  return data as Message;
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
