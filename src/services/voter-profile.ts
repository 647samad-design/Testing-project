import { supabase } from '@/lib/supabase';
import { explainUploadError } from '@/components/shared/PhotoUpload';
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
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return [];

    const { data, error } = await supabase
      .from('election_journey_steps')
      .select('*')
      .eq('user_id', userData.user.id)
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

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Checks a chosen profile photo before uploading; returns an error message or null. */
export function validateProfilePhoto(file: File): string | null {
  if (!AVATAR_TYPES.includes(file.type)) {
    const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    return heic
      ? 'iPhone HEIC photos aren\u2019t supported. Share the photo as JPEG (or set Camera \u2192 Formats \u2192 Most Compatible) and try again.'
      : 'Please choose a JPEG, PNG or WebP image.';
  }
  if (file.size > AVATAR_MAX_BYTES) return 'Image must be smaller than 5MB.';
  return null;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Removes every file in the user's avatar folder except `keep`. */
async function clearOldAvatars(userId: string, keep?: string): Promise<void> {
  const { data } = await supabase.storage.from('avatars').list(userId, { limit: 100 });
  const stale = (data ?? []).map((f) => `${userId}/${f.name}`).filter((path) => path !== keep);
  if (stale.length > 0) await supabase.storage.from('avatars').remove(stale);
}

/** Uploads a new profile photo to avatars/<user id>/ and returns its public URL.
 * Each upload gets a new file name, so browsers never keep showing the old
 * picture from cache, and the previous photo is then deleted. */
export async function uploadProfilePhoto(file: File): Promise<{ url?: string; error?: string }> {
  const invalid = validateProfilePhoto(file);
  if (invalid) return { error: invalid };
  try {
    const userId = await currentUserId();
    if (!userId) return { error: 'Please sign in again.' };

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;

    await clearOldAvatars(userId, path).catch(() => {});
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return { url: data.publicUrl };
  } catch (e) {
    return { error: explainUploadError(e, 'profile') };
  }
}

/** Deletes the user's profile photo files. The caller clears profiles.photo_url. */
export async function removeProfilePhoto(): Promise<{ error?: string }> {
  try {
    const userId = await currentUserId();
    if (!userId) return { error: 'Please sign in again.' };
    await clearOldAvatars(userId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not remove the photo.' };
  }
}

/** Changes the signed-in user's password. Re-checks the current password first,
 * so someone using an unattended signed-in browser can't change it. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<{ error?: string }> {
  if (newPassword.length < 8) return { error: 'New password must be at least 8 characters.' };
  if (newPassword === currentPassword) return { error: 'New password must be different from the current one.' };
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) return { error: 'Please sign in again.' };

  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (verifyError) return { error: 'Your current password is incorrect.' };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return {};
}
