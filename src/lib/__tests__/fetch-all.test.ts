import { describe, it, expect, vi } from 'vitest';
import { fetchAllRows, fetchInChunks } from '@/lib/fetch-all';

describe('fetchAllRows', () => {
  it('keeps paging past the 1000-row cap until a short page', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({ i }));
    const page = vi.fn((from: number, to: number) => Promise.resolve({ data: all.slice(from, to + 1), error: null }));
    const rows = await fetchAllRows(page);
    expect(rows).toHaveLength(2500);
    expect(page).toHaveBeenCalledTimes(3);
    expect(page).toHaveBeenNthCalledWith(2, 1000, 1999);
  });
  it('makes exactly one extra request when the total is a multiple of the page size', async () => {
    const all = Array.from({ length: 2000 }, (_, i) => i);
    const page = vi.fn((from: number, to: number) => Promise.resolve({ data: all.slice(from, to + 1), error: null }));
    expect(await fetchAllRows(page)).toHaveLength(2000);
    expect(page).toHaveBeenCalledTimes(3);
  });
  it('throws on error instead of returning a partial list', async () => {
    await expect(fetchAllRows(() => Promise.resolve({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom');
  });
});

describe('fetchInChunks', () => {
  it('splits ids, de-duplicates, and concatenates', async () => {
    const ids = [...Array.from({ length: 320 }, (_, i) => `id${i}`), 'id0', 'id1'];
    const q = vi.fn((chunk: string[]) => Promise.resolve({ data: chunk.map((id) => ({ id })), error: null }));
    const rows = await fetchInChunks(ids, q, 150);
    expect(rows).toHaveLength(320);
    expect(q).toHaveBeenCalledTimes(3);
    expect(q.mock.calls.every(([c]) => c.length <= 150)).toBe(true);
  });
});
