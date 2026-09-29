import { describe, it, expect, vi, beforeEach } from 'vitest';

const { result } = vi.hoisted(() => ({ result: { data: [] as unknown[], error: null as null | { message: string } } }));
vi.mock('@/lib/supabase', () => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: null, error: result.error });
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return { supabase: { from: () => q } };
});
import { getRecentStories, getFeaturedStories, getStoryBySlug } from '@/services/stories';

describe('sample stories are not shown as real editorial', () => {
  beforeEach(() => { localStorage.clear(); result.data = []; result.error = null; });

  it('an empty stories table shows nothing (not invented "BallotLens Editorial" stories)', async () => {
    expect(await getRecentStories()).toEqual([]);
    expect(await getFeaturedStories()).toEqual([]);
    expect(await getStoryBySlug('voter-never-missed-election')).toBeNull();
  });

  it('a database error also shows nothing outside demo mode', async () => {
    result.error = { message: 'down' };
    expect(await getRecentStories()).toEqual([]);
  });

  it('demo mode still shows the samples', async () => {
    localStorage.setItem('ballotlens_demo', 'true');
    expect((await getRecentStories()).length).toBeGreaterThan(0);
  });
});
