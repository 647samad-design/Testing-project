import { supabase } from '@/lib/supabase';

export interface NotificationPreferences {
  digest_frequency: 'daily' | 'weekly' | 'off';
  instant_election_reminders: boolean;
  instant_followed_updates: boolean;
  digest_candidate_updates: boolean;
  digest_ballot_measure_updates: boolean;
  digest_news_updates: boolean;
  digest_new_elections: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  digest_frequency: 'weekly',
  instant_election_reminders: true,
  instant_followed_updates: true,
  digest_candidate_updates: true,
  digest_ballot_measure_updates: true,
  digest_news_updates: true,
  digest_new_elections: true,
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return DEFAULT_PREFERENCES;

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('digest_frequency, instant_election_reminders, instant_followed_updates, digest_candidate_updates, digest_ballot_measure_updates, digest_news_updates, digest_new_elections')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error || !data) return DEFAULT_PREFERENCES;
  return data as NotificationPreferences;
}

export async function updateNotificationPreferences(updates: Partial<NotificationPreferences>): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: userData.user.id, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}
