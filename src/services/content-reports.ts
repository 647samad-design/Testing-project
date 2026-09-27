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
