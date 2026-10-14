import { describe, it, expect, vi, beforeEach } from 'vitest';

const { invokeMock, fromMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), fromMock: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: invokeMock }, from: fromMock, auth: { getUser: vi.fn() }, rpc: vi.fn() } }));

import { askWithLanguageModel } from '@/services/ai';

const CAND = '11111111-1111-1111-1111-111111111111';

describe('askWithLanguageModel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the question, candidate and language to the ask-ai function', async () => {
    invokeMock.mockResolvedValue({ data: { status: 'ok', usage: { allowed: true, remaining: 4, limit: 5, isPaid: false }, response: { answer: 'A', evidence: [], sources: [], confidence: 'high', limitations: [] } }, error: null });
    const r = await askWithLanguageModel('What about healthcare?', CAND, 'es');
    expect(invokeMock).toHaveBeenCalledWith('ask-ai', { body: { question: 'What about healthcare?', candidateId: CAND, lang: 'es' } });
    expect(r?.status).toBe('ok');
  });

  it('passes the daily limit through', async () => {
    invokeMock.mockResolvedValue({ data: { status: 'limit', usage: { allowed: false, remaining: 0, limit: 5, isPaid: false } }, error: null });
    expect((await askWithLanguageModel('q', CAND, 'en'))?.status).toBe('limit');
  });

  it('falls back (null) when the model is not configured or errors', async () => {
    invokeMock.mockResolvedValue({ data: { status: 'not_configured' }, error: null });
    expect(await askWithLanguageModel('q', CAND, 'en')).toBeNull();
    invokeMock.mockResolvedValue({ data: null, error: new Error('down') });
    expect(await askWithLanguageModel('q', CAND, 'en')).toBeNull();
  });
});
