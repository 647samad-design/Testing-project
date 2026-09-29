/**
 * Signed-out allowance for Ask BallotLens. The daily limit (5 free / 100 paid)
 * is enforced in the database per user, but the Ask page only checked it when
 * signed in -- so signing out gave unlimited questions, and a free user could
 * bypass the 5/day cap just by logging out. Signed-out visitors now get a small
 * per-browser daily allowance, then are asked to sign in.
 *
 * This is a product gate, not a security control: it lives in localStorage and
 * can be cleared. (The answers themselves are assembled in the browser from
 * public data, so there's no server cost to protect here.)
 */
export const ANON_DAILY_LIMIT = 3;
const KEY = 'ballotlens_anon_ai';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function read(): { date: string; count: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && raw.date === today() && typeof raw.count === 'number') return raw;
  } catch {
    // corrupt value -> start over
  }
  return { date: today(), count: 0 };
}

export function anonAiRemaining(): number {
  return Math.max(0, ANON_DAILY_LIMIT - read().count);
}

/** Uses one question if any remain; returns whether it was allowed. */
export function consumeAnonAiQuestion(): boolean {
  const state = read();
  if (state.count >= ANON_DAILY_LIMIT) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: state.date, count: state.count + 1 }));
  } catch {
    // storage unavailable (private mode): allow rather than block entirely
  }
  return true;
}
