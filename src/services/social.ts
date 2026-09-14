import { supabase } from '@/lib/supabase';
import type {
  Follow, FeedPost, VoterQuestion, QuestionRating,
  AppNotification, CampaignTeamMember, FollowableType, FeedPostType,
  TeamRole, RatingType, Candidate, Issue,
} from '@/types';

// ─── Follows ───

export async function follow(followableType: FollowableType, followableId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .insert({ followable_type: followableType, followable_id: followableId });
  if (error) throw error;
}

export async function unfollow(followableType: FollowableType, followableId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('followable_type', followableType)
    .eq('followable_id', followableId);
  if (error) throw error;
}

export async function isFollowing(followableType: FollowableType, followableId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('follows')
    .select('id')
    .eq('followable_type', followableType)
    .eq('followable_id', followableId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export async function getFollowingIds(followableType: FollowableType): Promise<string[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('followable_id')
    .eq('followable_type', followableType);
  if (error || !data) return [];
  return data.map((f: { followable_id: string }) => f.followable_id);
}

export async function getFollowedCandidates(): Promise<(Follow & { candidate?: Candidate })[]> {
  // `follows.followable_id` is polymorphic (can point at candidates OR issues),
  // so it has no real foreign key — PostgREST can't auto-join via `candidates!inner(...)`
  // (that was causing a 400 "could not find relationship" error). Fetch the
  // follow rows and the candidates separately, then merge them in JS instead.
  const { data: followRows, error: followError } = await supabase
    .from('follows')
    .select('*')
    .eq('followable_type', 'candidate')
    .order('created_at', { ascending: false });
  if (followError || !followRows || followRows.length === 0) return [];

  const candidateIds = followRows.map((f: Follow) => f.followable_id);
  const { data: candidates } = await supabase
    .from('candidates')
    .select('id, first_name, last_name, party, photo_url, bio, website_url')
    .in('id', candidateIds);

  const candidateById = new Map((candidates ?? []).map((c) => [c.id as string, c as unknown as Candidate]));
  return followRows.map((f: Follow) => ({ ...f, candidate: candidateById.get(f.followable_id) }));
}

export async function getFollowedIssues(): Promise<(Follow & { issue?: Issue })[]> {
  // Same polymorphic-relationship issue as getFollowedCandidates() above.
  const { data: followRows, error: followError } = await supabase
    .from('follows')
    .select('*')
    .eq('followable_type', 'issue')
    .order('created_at', { ascending: false });
  if (followError || !followRows || followRows.length === 0) return [];

  const issueIds = followRows.map((f: Follow) => f.followable_id);
  const { data: issues } = await supabase
    .from('issues')
    .select('id, name, slug, description, color')
    .in('id', issueIds);

  const issueById = new Map((issues ?? []).map((i) => [i.id as string, i as unknown as Issue]));
  return followRows.map((f: Follow) => ({ ...f, issue: issueById.get(f.followable_id) }));
}

export async function getFollowerCount(followableType: FollowableType, followableId: string): Promise<number> {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('followable_type', followableType)
    .eq('followable_id', followableId);
  if (error) return 0;
  return count ?? 0;
}

// ─── Feed Posts ───

export async function getFeedPosts(candidateId: string): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from('feed_posts')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  const posts = data as FeedPost[];

  // Get like counts and whether current user liked
  if (posts.length > 0) {
    const postIds = posts.map((p) => p.id);
    const { data: likes } = await supabase
      .from('post_likes')
      .select('post_id, user_id')
      .in('post_id', postIds);

    const likeCounts: Record<string, number> = {};
    const likedByMe: Record<string, boolean> = {};
    const currentUserId = (await supabase.auth.getUser()).data.user?.id;

    (likes ?? []).forEach((l: { post_id: string; user_id: string }) => {
      likeCounts[l.post_id] = (likeCounts[l.post_id] ?? 0) + 1;
      if (l.user_id === currentUserId) likedByMe[l.post_id] = true;
    });

    posts.forEach((p) => {
      p.like_count = likeCounts[p.id] ?? 0;
      p.liked_by_me = likedByMe[p.id] ?? false;
    });
  }

  return posts;
}

export async function getSocialFeed(): Promise<FeedPost[]> {
  // Get posts from candidates the user follows PLUS source-authored posts (election results, news)
  const followedIds = await getFollowingIds('candidate');

  let query;
  if (followedIds.length > 0) {
    query = supabase
      .from('feed_posts')
      .select(`
        *,
        candidate:candidates(id, first_name, last_name, party, photo_url)
      `)
      .or(`candidate_id.in.(${followedIds.join(',')}),source_name.not.is.null`)
      .order('created_at', { ascending: false })
      .limit(50);
  } else {
    // No follows yet — still show election results and news posts
    query = supabase
      .from('feed_posts')
      .select(`
        *,
        candidate:candidates(id, first_name, last_name, party, photo_url)
      `)
      .not('source_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data as unknown as FeedPost[];
}

export async function createFeedPost(
  candidateId: string,
  body: string,
  postType: FeedPostType = 'update',
  extra?: { image_url?: string; link_url?: string; event_date?: string; event_location?: string; event_start_time?: string; event_end_time?: string }
): Promise<FeedPost | null> {
  const { data, error } = await supabase
    .from('feed_posts')
    .insert({
      candidate_id: candidateId,
      post_type: postType,
      body,
      ...extra,
    })
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data as FeedPost | null;
}

export async function deleteFeedPost(postId: string): Promise<void> {
  const { error } = await supabase.from('feed_posts').delete().eq('id', postId);
  if (error) throw error;
}

export async function togglePostLike(postId: string, liked: boolean): Promise<void> {
  if (liked) {
    await supabase.from('post_likes').insert({ post_id: postId });
  } else {
    await supabase.from('post_likes').delete().eq('post_id', postId);
  }
}

// ─── Voter Questions (AMA) ───

export async function getVoterQuestions(candidateId: string): Promise<VoterQuestion[]> {
  const { data, error } = await supabase
    .from('voter_questions')
    .select(`
      *,
      issue:issues(id, name, slug, description, color)
    `)
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as unknown as VoterQuestion[];
}

export async function askQuestion(candidateId: string, questionText: string, issueId?: string): Promise<void> {
  const { error } = await supabase
    .from('voter_questions')
    .insert({
      candidate_id: candidateId,
      question_text: questionText,
      issue_id: issueId ?? null,
    });
  if (error) throw error;
}

export async function answerQuestion(questionId: string, answerText: string): Promise<void> {
  const { error } = await supabase
    .from('voter_questions')
    .update({
      answer_text: answerText,
      answered_at: new Date().toISOString(),
      status: 'answered',
    })
    .eq('id', questionId);
  if (error) throw error;
}

export async function rateQuestion(questionId: string, ratingType: RatingType, value: boolean): Promise<void> {
  if (value) {
    await supabase.from('question_ratings').upsert({
      question_id: questionId,
      rating_type: ratingType,
      value: true,
    }, { onConflict: 'question_id, user_id, rating_type' });
  } else {
    await supabase.from('question_ratings').delete().eq('question_id', questionId).eq('rating_type', ratingType);
  }
}

// ─── Notifications ───

export async function getNotifications(unreadOnly = false): Promise<AppNotification[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (unreadOnly) query = query.eq('is_read', false);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as AppNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id);
}

export async function markAllNotificationsRead(): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).neq('is_read', true);
}

// ─── Campaign Team ───

export async function getTeamMembers(candidateId: string): Promise<CampaignTeamMember[]> {
  const { data, error } = await supabase
    .from('campaign_team')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as CampaignTeamMember[];
}

export async function inviteTeamMember(candidateId: string, email: string, role: TeamRole): Promise<void> {
  const { error } = await supabase
    .from('campaign_team')
    .insert({
      candidate_id: candidateId,
      invited_email: email,
      role,
      status: 'pending',
    });
  if (error) throw error;
}

export async function updateTeamMemberRole(id: string, role: TeamRole): Promise<void> {
  await supabase.from('campaign_team').update({ role }).eq('id', id);
}

export async function revokeTeamMember(id: string): Promise<void> {
  await supabase.from('campaign_team').update({ status: 'revoked' }).eq('id', id);
}

// ─── Analytics ───

export async function trackProfileView(candidateId: string, zip?: string): Promise<void> {
  await supabase.from('profile_views').insert({
    candidate_id: candidateId,
    viewer_zip: zip ?? null,
  });
}

export async function getCandidateAnalytics(candidateId: string): Promise<{
  profileViews: number;
  followers: number;
  questionCount: number;
  answeredCount: number;
  postCount: number;
}> {
  const [views, followers, questions, posts] = await Promise.all([
    supabase.from('profile_views').select('*', { count: 'exact', head: true }).eq('candidate_id', candidateId),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followable_type', 'candidate').eq('followable_id', candidateId),
    supabase.from('voter_questions').select('*', { count: 'exact', head: true }).eq('candidate_id', candidateId),
    supabase.from('feed_posts').select('*', { count: 'exact', head: true }).eq('candidate_id', candidateId),
  ]);

  const answeredRes = await supabase
    .from('voter_questions')
    .select('*', { count: 'exact', head: true })
    .eq('candidate_id', candidateId)
    .eq('status', 'answered');

  return {
    profileViews: views.count ?? 0,
    followers: followers.count ?? 0,
    questionCount: questions.count ?? 0,
    answeredCount: answeredRes.count ?? 0,
    postCount: posts.count ?? 0,
  };
}

export async function getIssueBreakdown(candidateId: string): Promise<{ name: string; count: number; pct: number }[]> {
  const { data, error } = await supabase
    .from('voter_questions')
    .select('issue:issues(name)')
    .eq('candidate_id', candidateId)
    .not('issue_id', 'is', null);
  if (error || !data) return [];

  const counts: Record<string, number> = {};
  let total = 0;
  data.forEach((row: Record<string, unknown>) => {
    const issue = row.issue as { name: string } | null;
    const name = issue?.name ?? 'Other';
    counts[name] = (counts[name] ?? 0) + 1;
    total++;
  });

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}
