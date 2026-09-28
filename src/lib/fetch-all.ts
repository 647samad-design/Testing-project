/**
 * Supabase/PostgREST returns at most 1000 rows per request (db-max-rows) and
 * silently drops the rest -- HTTP 200, no error. Verified against a real
 * PostgREST 12 with the same cap: a query over 1,621 races returned exactly
 * 1,000. Anything that loads "all" rows of a table that can grow past that
 * (candidates, districts, races, sources) must page.
 */
export const PAGE_SIZE = 1000;

// `data` is typed loosely on purpose: supabase-js infers embedded to-one
// relations as arrays, so callers name the real row shape via T instead.
type PageResult = { data: unknown; error: { message: string } | null };

/** Repeatedly calls `page(from, to)` (which should apply `.range(from, to)` and
 * a deterministic `.order(...)`) until a short page comes back. */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
}

/** Runs `query(chunk)` for slices of `ids` and concatenates the results, so a
 * `.in('col', ids)` filter never puts hundreds of UUIDs into one URL (gateways
 * in front of PostgREST cap URL length). */
export async function fetchInChunks<T>(
  ids: string[],
  query: (chunk: string[]) => PromiseLike<PageResult>,
  chunkSize = 150,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const { data, error } = await query(unique.slice(i, i + chunkSize));
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}
