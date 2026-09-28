import { supabase } from '@/lib/supabase';

export type ReportableContentType = 'candidate' | 'feed_post' | 'message' | 'story' | 'fact_check' | 'other';

export interface ContentReport {
  id: string;
  user_id: string;
  content_type: string;
  content_id: string;
  reason: string;
  description: string | null;
  status: 'pending' | 'reviewed' | 'actioned' | 'dismissed';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/**
 * Lets a user flag content as false, abusive, or spam — a real gap for a
 * civic platform where election misinformation is a genuine risk. The
 * database table and RLS for this already existed correctly (admin-only
 * review, no self-approval hole), but nothing in the app ever called it.
 */
export async function submitContentReport(
  contentType: ReportableContentType,
  contentId: string,
  reason: string,
  description?: string
): Promise<void> {
  const { error } = await supabase.from('content_reports').insert({
    content_type: contentType,
    content_id: contentId,
    reason,
    description: description ?? null,
  });
  if (error) throw error;
}

/** Admin-only: reports awaiting review. */
export async function getPendingReports(): Promise<ContentReport[]> {
  const { data, error } = await supabase
    .from('content_reports')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as ContentReport[];
}

export async function markReportReviewed(id: string, outcome: 'actioned' | 'dismissed'): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('content_reports')
    .update({ status: outcome, reviewed_by: userData?.user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** A human-readable preview of what was reported. Previously the admin
 * Reports tab showed only the raw content UUID, so reviewing a report meant
 * looking the row up in the database by hand. */
export async function getReportedContentPreview(contentType: string, contentId: string): Promise<string | null> {
  try {
    if (contentType === 'candidate') {
      const { data } = await supabase.from('candidates').select('first_name, last_name, party').eq('id', contentId).maybeSingle();
      return data ? `Candidate profile: ${data.first_name} ${data.last_name}${data.party ? ` (${data.party})` : ''}` : null;
    }
    if (contentType === 'feed_post') {
      const { data } = await supabase.from('feed_posts').select('body').eq('id', contentId).maybeSingle();
      return data ? `Feed post: "${data.body}"` : null;
    }
    if (contentType === 'fact_check') {
      const { data } = await supabase.from('fact_checks').select('claim_text').eq('id', contentId).maybeSingle();
      return data ? `Fact check: "${data.claim_text}"` : null;
    }
    if (contentType === 'story') {
      const { data } = await supabase.from('stories').select('title').eq('id', contentId).maybeSingle();
      return data ? `Story: ${data.title}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Admin-only removal of a reported feed post (policy added in 20260913002500).
 * Before that there was no admin DELETE on feed_posts, so "Mark Actioned" on a
 * report about an abusive post had no way to actually take the post down. */
export async function removeReportedFeedPost(postId: string): Promise<void> {
  const { error } = await supabase.from('feed_posts').delete().eq('id', postId);
  if (error) throw error;
}
