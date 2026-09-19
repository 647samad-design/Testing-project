import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MessageSquare, Send, ArrowLeft, Mail, MailOpen, Eye } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { LoadingState, EmptyState } from '@/components/shared/StateComponents';
import { useAuth } from '@/hooks/use-auth';
import {
  getConversations,
  getMessages,
  sendMessage,
  markConversationRead,
  subscribeToMessages,
} from '@/services/messaging';
import type { Conversation, Message } from '@/types';
import { cn } from '@/lib/utils';

export function MessagesPage() {
  const { user, isDemo, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get('c');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const convs = await getConversations();
    setConversations(convs);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Set active conversation from URL or first conversation
  useEffect(() => {
    if (activeId) {
      const conv = conversations.find((c) => c.id === activeId);
      if (conv) setActiveConversation(conv);
    } else if (conversations.length > 0 && !activeConversation) {
      setActiveConversation(conversations[0]);
      setSearchParams({ c: conversations[0].id });
    }
  }, [activeId, conversations, activeConversation, setSearchParams]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversation) {
      setMessages([]);
      return;
    }

    let unsub: (() => void) | undefined;

    async function load() {
      if (!activeConversation) return;
      const msgs = await getMessages(activeConversation.id);
      setMessages(msgs);
      scrollToBottom();

      // Mark as read
      const isVoter = activeConversation.voter_id === user?.id;
      await markConversationRead(activeConversation.id, isVoter);
      // Refresh conversations to update unread counts
      loadConversations();

      // Subscribe to new messages
      unsub = subscribeToMessages(activeConversation.id, (msg) => {
        setMessages((prev) => [...prev, msg]);
        scrollToBottom();
        // Mark as read again since we received a new message
        markConversationRead(activeConversation.id, isVoter);
      });
    }

    load();
    return () => {
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation?.id]);

  function scrollToBottom() {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  async function handleSend() {
    if (!inputText.trim() || !activeConversation || !user) return;
    setSending(true);
    const isVoter = activeConversation.voter_id === user.id;
    const msg = await sendMessage(activeConversation.id, inputText.trim(), isVoter ? 'voter' : 'candidate');
    if (msg) {
      setMessages((prev) => [...prev, msg]);
      setInputText('');
      scrollToBottom();
      loadConversations();
    }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-content px-4 sm:px-6 py-8">
        <LoadingState message="Loading…" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-content px-4 sm:px-6 py-8">
        <EmptyState
          title="Sign in to view messages"
          description="You need an account to send and receive messages with candidates."
          icon={<MessageSquare className="h-10 w-10" />}
        />
        <div className="mt-4 text-center">
          <Link to="/signin">
            <Button className="rounded-xl">Sign In</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (loading) return <LoadingState message="Loading messages…" />;

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      {isDemo && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3">
          <Eye className="h-5 w-5 text-warning shrink-0" />
          <p className="text-sm text-warning font-medium">
            Demo mode — messaging is not available. Create a real account to send messages.
          </p>
        </div>
      )}
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Messages</h1>

      {conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Visit a candidate's profile and click Message to start a conversation."
          icon={<MessageSquare className="h-10 w-10" />}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[320px_1fr] h-[calc(100vh-220px)] min-h-[400px]">
          {/* Conversation list */}
          <Card className="rounded-2xl overflow-hidden flex flex-col">
            <div className="border-b border-border p-3">
              <h2 className="text-sm font-semibold text-muted-foreground px-2">Conversations</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations.map((conv) => {
                const isActive = activeConversation?.id === conv.id;
                const hasUnread = (conv.unread_count ?? 0) > 0;
                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setActiveConversation(conv);
                      setSearchParams({ c: conv.id });
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors touch-target',
                      isActive ? 'bg-primary/10' : 'hover:bg-secondary'
                    )}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      {conv.candidate?.photo_url ? (
                        <img
                          src={conv.candidate.photo_url}
                          alt={`${conv.candidate.first_name} ${conv.candidate.last_name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <AvatarFallback className="text-sm font-semibold">
                          {conv.candidate?.first_name?.[0] ?? '?'}
                          {conv.candidate?.last_name?.[0] ?? ''}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn('truncate text-sm', hasUnread ? 'font-bold text-foreground' : 'font-medium text-foreground')}>
                          {conv.candidate?.first_name} {conv.candidate?.last_name}
                        </p>
                        {hasUnread ? (
                          <Mail className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <MailOpen className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {conv.last_message?.body ?? 'No messages yet'}
                      </p>
                    </div>
                    {hasUnread && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                        {conv.unread_count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Chat view */}
          {activeConversation ? (
            <Card className="rounded-2xl flex flex-col overflow-hidden">
              {/* Chat header */}
              <div className="flex items-center gap-3 border-b border-border p-4">
                <Link
                  to={`/candidates/${activeConversation.candidate_id}`}
                  className="flex items-center gap-3 hover:text-primary transition-colors"
                >
                  <Avatar className="h-9 w-9">
                    {activeConversation.candidate?.photo_url ? (
                      <img
                        src={activeConversation.candidate.photo_url}
                        alt={`${activeConversation.candidate.first_name} ${activeConversation.candidate.last_name}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <AvatarFallback className="text-xs font-semibold">
                        {activeConversation.candidate?.first_name?.[0] ?? '?'}
                        {activeConversation.candidate?.last_name?.[0] ?? ''}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">
                      {activeConversation.candidate?.first_name} {activeConversation.candidate?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activeConversation.candidate?.party ?? 'Independent'}
                    </p>
                  </div>
                </Link>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">
                      Start the conversation — send a message below.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.sender_id === user.id;
                    return (
                      <div
                        key={msg.id}
                        className={cn('flex', isMe ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                            isMe
                              ? 'bg-primary text-primary-foreground rounded-br-md'
                              : 'bg-secondary text-foreground rounded-bl-md'
                          )}
                        >
                          <p>{msg.body}</p>
                          <p className={cn('mt-1 text-[10px]', isMe ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                            {new Date(msg.created_at).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="Type a message…"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    className="rounded-xl h-11"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={sending || !inputText.trim()}
                    size="icon"
                    className="h-11 w-11 rounded-xl shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="rounded-2xl flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Select a conversation to view messages</p>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
