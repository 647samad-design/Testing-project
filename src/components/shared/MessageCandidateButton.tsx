import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

interface MessageCandidateButtonProps {
  candidateId: string;
}

export function MessageCandidateButton({ candidateId }: MessageCandidateButtonProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!user) {
      navigate('/signin');
      return;
    }
    setLoading(true);
    const { getOrCreateConversation } = await import('@/services/messaging');
    const conv = await getOrCreateConversation(candidateId);
    if (conv) {
      navigate(`/messages?c=${conv.id}`);
    }
    setLoading(false);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 rounded-xl touch-target"
      onClick={handleClick}
      disabled={loading}
    >
      <Mail className="h-4 w-4" />
      {loading ? 'Opening…' : 'Message'}
    </Button>
  );
}
