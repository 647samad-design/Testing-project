import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

/** A voter's private picks: candidate per race, yes/no per measure. Saved to
 * their account when signed in (visible only to them), otherwise kept on
 * this device. */
export interface Picks {
  contests: Record<string, string>; // contest_id -> candidate_id
  measures: Record<string, 'yes' | 'no'>; // measure_id -> choice
}

const LOCAL_KEY = 'govsearch_picks';
const empty = (): Picks => ({ contests: {}, measures: {} });

let state: Picks = empty();
let userId: string | null = null;
let loadedFor: string | null | undefined; // undefined = never loaded
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readLocal(): Picks {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw);
    return { contests: p.contests ?? {}, measures: p.measures ?? {} };
  } catch {
    return empty();
  }
}

function writeLocal(p: Picks) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

function clearLocal() {
  try { localStorage.removeItem(LOCAL_KEY); } catch { /* storage unavailable */ }
}

type Row = { contest_id: string | null; candidate_id: string | null; measure_id: string | null; measure_choice: 'yes' | 'no' | null };

/** Loads picks for the signed-in user (or the device when signed out). Picks
 * made on this device before signing in are moved into the account. */
export async function loadPicks(uid: string | null): Promise<void> {
  if (loadedFor === uid) return;
  loadedFor = uid;
  userId = uid;
  if (!uid) {
    state = readLocal();
    emit();
    return;
  }
  const local = readLocal();
  const { data, error } = await supabase.from('ballot_picks').select('contest_id, candidate_id, measure_id, measure_choice');
  if (error) {
    state = local; // offline / not migrated yet: still show what's on the device
    emit();
    return;
  }
  const next = empty();
  for (const r of (data ?? []) as Row[]) {
    if (r.contest_id && r.candidate_id) next.contests[r.contest_id] = r.candidate_id;
    if (r.measure_id && r.measure_choice) next.measures[r.measure_id] = r.measure_choice;
  }
  state = next;
  emit();
  // Carry over picks made while signed out (the account's own picks win).
  const moves: Promise<void>[] = [];
  for (const [c, cand] of Object.entries(local.contests)) if (!next.contests[c]) moves.push(setContestPick(c, cand));
  for (const [m, ch] of Object.entries(local.measures)) if (!next.measures[m]) moves.push(setMeasurePick(m, ch));
  await Promise.all(moves);
  clearLocal();
}

export async function setContestPick(contestId: string, candidateId: string | null): Promise<void> {
  const prev = state;
  const contests = { ...state.contests };
  if (candidateId) contests[contestId] = candidateId; else delete contests[contestId];
  state = { ...state, contests };
  emit();
  if (!userId) { writeLocal(state); return; }
  const del = await supabase.from('ballot_picks').delete().eq('user_id', userId).eq('contest_id', contestId);
  const ins = candidateId && !del.error
    ? await supabase.from('ballot_picks').insert({ user_id: userId, contest_id: contestId, candidate_id: candidateId })
    : { error: del.error };
  if (ins.error) { state = prev; emit(); throw ins.error; }
}

export async function setMeasurePick(measureId: string, choice: 'yes' | 'no' | null): Promise<void> {
  const prev = state;
  const measures = { ...state.measures };
  if (choice) measures[measureId] = choice; else delete measures[measureId];
  state = { ...state, measures };
  emit();
  if (!userId) { writeLocal(state); return; }
  const del = await supabase.from('ballot_picks').delete().eq('user_id', userId).eq('measure_id', measureId);
  const ins = choice && !del.error
    ? await supabase.from('ballot_picks').insert({ user_id: userId, measure_id: measureId, measure_choice: choice })
    : { error: del.error };
  if (ins.error) { state = prev; emit(); throw ins.error; }
}

export function countPicks(p: Picks): number {
  return Object.keys(p.contests).length + Object.keys(p.measures).length;
}

/** Current picks; loads them for the given user on first use. */
export function usePicks(uid: string | null | undefined): Picks {
  useEffect(() => { if (uid !== undefined) void loadPicks(uid); }, [uid]);
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
  );
}

/** Test hook: forget loaded state. */
export function _resetPicksForTests() {
  state = empty(); userId = null; loadedFor = undefined; listeners.clear();
}
