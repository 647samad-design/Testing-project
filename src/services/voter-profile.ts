import { supabase } from '@/lib/supabase';
import type { ElectionJourneyStep } from '@/types';

export const JOURNEY_STEPS = [
  { number: 1, label: 'Verify registration', link: '/ballot' },
  { number: 2, label: "Learn what's on your ballot", link: '/ballot' },
  { number: 3, label: 'Pick your top issues', link: '/issues' },
  { number: 4, label: 'Research candidates', link: '/candidates' },
  { number: 5, label: 'Compare candidates', link: '/compare' },
  { number: 6, label: 'Review ballot measures', link: '/ballot' },
  { number: 7, label: 'Find your polling location', link: '/ballot' },
  { number: 8, label: 'Make your voting plan', link: '/ballot' },
] as const;

export async function getJourneySteps(): Promise<ElectionJourneyStep[]> {
  try {
    const { data, error } = await supabase
      .from('election_journey_steps')
      .select('*')
      .order('step_number', { ascending: true });
    if (error) throw error;
    return (data as ElectionJourneyStep[]) ?? [];
  } catch {
    return [];
  }
}

export async function toggleJourneyStep(
  stepNumber: number,
  completed: boolean,
  progressDetail?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return { success: false, error: 'Not authenticated' };

    const { error } = await supabase
      .from('election_journey_steps')
      .upsert({
        user_id: userId,
        step_number: stepNumber,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        progress_detail: progressDetail ?? null,
      });
    if (error) throw error;
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function uploadProfilePhoto(file: File): Promise<{ url?: string; error?: string }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return { error: 'Not authenticated' };

    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return { url: data.publicUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Upload failed' };
  }
}
