import { supabase } from '@/lib/supabase';
import {
  demoNewsArticles, demoVideos, demoSocialPosts,
  getDemoNewsByCandidate, getDemoVideosByCandidate, getDemoSocialByCandidate,
} from '@/services/demo-data';
import type { NewsArticle, Video, SocialPost, MediaCategory } from '@/types';

export async function getNews(candidateId?: string): Promise<NewsArticle[]> {
  try {
    let query = supabase
      .from('news_articles')
      .select(`
        id, candidate_id, issue_id, title, url, publisher, article_type,
        media_category, summary, published_date,
        candidate:candidates(id, first_name, last_name, party, is_demo)
      `)
      .order('published_date', { ascending: false });

    if (candidateId) {
      query = query.eq('candidate_id', candidateId);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (data && data.length > 0) return data as unknown as NewsArticle[];
  } catch {
    // Database unreachable — fall through to demo data
  }
  if (candidateId) return getDemoNewsByCandidate(candidateId);
  return demoNewsArticles;
}

export async function getNewsByCategory(category: MediaCategory): Promise<NewsArticle[]> {
  try {
    const { data, error } = await supabase
      .from('news_articles')
      .select(`
        id, candidate_id, issue_id, title, url, publisher, article_type,
        media_category, summary, published_date,
        candidate:candidates(id, first_name, last_name, party, is_demo)
      `)
      .eq('media_category', category)
      .order('published_date', { ascending: false });
    if (error) throw error;
    if (data && data.length > 0) return data as unknown as NewsArticle[];
  } catch {
    // Database unreachable — fall through to demo data
  }
  return demoNewsArticles.filter((a) => a.media_category === category);
}

export async function getVideos(candidateId?: string): Promise<Video[]> {
  try {
    let query = supabase
      .from('videos')
      .select(`
        id, candidate_id, title, url, thumbnail_url, video_type,
        publisher, description, published_date,
        candidate:candidates(id, first_name, last_name, party, is_demo)
      `)
      .order('published_date', { ascending: false });

    if (candidateId) query = query.eq('candidate_id', candidateId);

    const { data, error } = await query;
    if (error) throw error;
    if (data && data.length > 0) return data as unknown as Video[];
  } catch {
    // Database unreachable — fall through to demo data
  }
  if (candidateId) return getDemoVideosByCandidate(candidateId);
  return demoVideos;
}

export async function getSocialPosts(candidateId?: string): Promise<SocialPost[]> {
  try {
    let query = supabase
      .from('social_posts')
      .select(`
        id, candidate_id, platform, content, url, posted_date,
        candidate:candidates(id, first_name, last_name, party, is_demo)
      `)
      .order('posted_date', { ascending: false });

    if (candidateId) query = query.eq('candidate_id', candidateId);

    const { data, error } = await query;
    if (error) throw error;
    if (data && data.length > 0) return data as unknown as SocialPost[];
  } catch {
    // Database unreachable — fall through to demo data
  }
  if (candidateId) return getDemoSocialByCandidate(candidateId);
  return demoSocialPosts;
}

export async function getMediaByTab(
  tab: string,
  candidateId?: string
): Promise<{ news: NewsArticle[]; videos: Video[]; social: SocialPost[] }> {
  const tabToCategory: Record<string, MediaCategory | null> = {
    news: 'news',
    'local-news': 'local_news',
    investigations: 'investigation',
    video: 'video',
    debates: 'debate',
    interviews: 'interview',
    speeches: 'speech',
    'town-halls': 'town_hall',
    social: 'social',
    podcasts: 'podcast',
  };

  const category = tabToCategory[tab];
  const filter = category ?? null;

  try {
    if (filter) {
      const [news, videos, social] = await Promise.all([
        getNewsByCategory(filter as MediaCategory),
        filter === 'video' || filter === 'debate' || filter === 'town_hall' || filter === 'speech'
          ? getVideos(candidateId)
          : Promise.resolve([]),
        filter === 'social' ? getSocialPosts(candidateId) : Promise.resolve([]),
      ]);
      return { news, videos, social };
    }

    const [allNews, allVideos, allSocial] = await Promise.all([
      getNews(candidateId),
      getVideos(candidateId),
      getSocialPosts(candidateId),
    ]);
    return { news: allNews, videos: allVideos, social: allSocial };
  } catch {
    return { news: [], videos: [], social: [] };
  }
}
