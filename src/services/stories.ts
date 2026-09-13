import { supabase } from '@/lib/supabase';
import type { Story, StoryCategory } from '@/types';

const demoCategories: StoryCategory[] = [
  { id: 'cat1', name: 'Civic Education', slug: 'civic-education', description: 'How government works and why it matters', color: 'emerald' },
  { id: 'cat2', name: 'Election Analysis', slug: 'election-analysis', description: 'Breaking down election results and trends', color: 'blue' },
  { id: 'cat3', name: 'Voter Stories', slug: 'voter-stories', description: 'Real people, real civic engagement', color: 'amber' },
  { id: 'cat4', name: 'Local Politics', slug: 'local-politics', description: 'City council, school boards, and local impact', color: 'teal' },
  { id: 'cat5', name: 'Legislation Explained', slug: 'legislation-explained', description: 'Plain-English breakdowns of bills and laws', color: 'rose' },
  { id: 'cat6', name: 'Off-Season', slug: 'off-season', description: 'Keeping you engaged between elections', color: 'violet' },
];

const demoStories: Story[] = [
  {
    id: 'story1', title: 'Why Your School Board Election Matters More Than You Think', slug: 'school-board-election-matters',
    excerpt: 'School board decisions affect curriculum, budgets, and your child\'s daily education — yet turnout for these races is often under 15%.',
    body: 'School board elections are some of the most consequential yet overlooked races on your ballot. These locally elected officials decide how millions of dollars in education funding are spent, what curriculum is taught, and how schools are run.\n\nIn many districts, fewer than 15% of eligible voters participate in school board elections. That means a handful of people are making decisions that affect every child in your community.\n\nThis article breaks down what school boards actually do, how to find out who\'s running in your district, and why these down-ballot races deserve your attention.',
    category_id: 'cat4', category: demoCategories[3], author_name: 'BallotLens Editorial',
    hero_image_url: null, tags: 'school board, local elections, education',
    is_featured: true, is_published: true,
    published_at: new Date(Date.now() - 86400000 * 2).toISOString(), read_time_minutes: 5,
  },
  {
    id: 'story2', title: 'How a Bill Becomes Law: A Plain-English Guide', slug: 'how-a-bill-becomes-law',
    excerpt: 'Ever wondered what happens between a bill being introduced and it becoming law? Here\'s the actual process, explained simply.',
    body: 'The legislative process can seem opaque, but it follows a predictable path.\n\n1. A bill is introduced by a legislator.\n2. It gets assigned to a committee that specializes in the topic.\n3. The committee debates, amends, and votes on whether to send it forward.\n4. If it passes committee, it goes to the full chamber (House or Senate) for debate and a vote.\n5. If it passes one chamber, it goes to the other chamber for the same process.\n6. If both chambers pass it, it goes to the executive (governor or president) to sign or veto.\n7. If signed, it becomes law. If vetoed, the legislature can override the veto with a supermajority.\n\nThis guide walks through each step with real examples from recent legislation, so you can understand what your representatives are actually doing when they vote.',
    category_id: 'cat5', category: demoCategories[4], author_name: 'BallotLens Editorial',
    hero_image_url: null, tags: 'legislation, civics, how government works',
    is_featured: true, is_published: true,
    published_at: new Date(Date.now() - 86400000 * 5).toISOString(), read_time_minutes: 8,
  },
  {
    id: 'story3', title: 'The Voter Who Never Missed an Election — for 40 Years', slug: 'voter-never-missed-election',
    excerpt: 'Meet Margaret, who has voted in every local, state, and federal election since 1984. Here\'s why she says showing up matters.',
    body: 'Margaret Chen has voted in every election — local, state, and federal — for four decades.\n\n"People think their vote doesn\'t matter, especially in local elections," she says. "But I\'ve seen races decided by fewer than 20 votes. Twenty people. That\'s it."\n\nIn this voter story, Margaret shares what she\'s learned about researching candidates, why she started bringing her adult children to the polls, and how staying informed between elections keeps her engaged.\n\n"The key is to make it a habit," she says. "Not just every four years for president. Every year. Every race. That\'s how you make a difference in your community."',
    category_id: 'cat3', category: demoCategories[2], author_name: 'BallotLens Editorial',
    hero_image_url: null, tags: 'voter story, civic engagement, elections',
    is_featured: false, is_published: true,
    published_at: new Date(Date.now() - 86400000 * 7).toISOString(), read_time_minutes: 4,
  },
  {
    id: 'story4', title: 'What Actually Happens During an Off-Year? Plenty.', slug: 'what-happens-off-year',
    excerpt: 'Between presidential elections, a lot of governing happens. Here\'s how to stay informed and engaged when the spotlight is off.',
    body: 'Off-years — the years between major federal elections — are when most local and state policy actually gets made.\n\nCity councils pass budgets. State legislatures draft bills. School boards set curriculum. These decisions shape your daily life more than most federal policy, yet they happen with far less public scrutiny.\n\nThis article explains how to track what\'s happening in your area year-round, not just in November. From attending city council meetings to signing up for legislative alerts, there are many ways to stay engaged when the national spotlight is off.',
    category_id: 'cat6', category: demoCategories[5], author_name: 'BallotLens Editorial',
    hero_image_url: null, tags: 'off-season, local politics, civic engagement',
    is_featured: true, is_published: true,
    published_at: new Date(Date.now() - 86400000 * 10).toISOString(), read_time_minutes: 6,
  },
  {
    id: 'story5', title: 'Understanding Ballot Measures: Amendments vs. Referendums', slug: 'ballot-measures-explained',
    excerpt: 'Ballot measures come in several forms. Here\'s what each one means and how to evaluate them.',
    body: 'When you see a ballot measure, it might be a constitutional amendment, a referendum, a local initiative, or a bond measure. Each works differently and has different consequences.\n\nA constitutional amendment changes the state constitution — the foundational document that defines how government operates.\n\nA referendum lets voters directly approve or reject a law that the legislature already passed.\n\nAn initiative lets citizens propose a new law or constitutional amendment directly, bypassing the legislature entirely.\n\nA bond measure authorizes the government to borrow money for a specific project, like building a school or improving roads.\n\nThis guide explains the differences, walks through how to read the ballot language, and offers a framework for evaluating measures using source material rather than campaign ads.',
    category_id: 'cat1', category: demoCategories[0], author_name: 'BallotLens Editorial',
    hero_image_url: null, tags: 'ballot measures, civics, amendments, referendums',
    is_featured: false, is_published: true,
    published_at: new Date(Date.now() - 86400000 * 14).toISOString(), read_time_minutes: 7,
  },
  {
    id: 'story6', title: 'How to Research a Judge on Your Ballot', slug: 'how-to-research-a-judge',
    excerpt: 'Judicial races are notoriously hard to research. Here\'s a step-by-step approach to making an informed choice.',
    body: 'Judicial candidates often can\'t campaign the way other politicians do — they\'re constrained by ethical rules about making promises on cases. So how do you decide?\n\nThis guide covers where to find judicial evaluations, bar association ratings, disciplinary records, and notable decisions, so you can make an informed choice even when information is scarce.\n\nStart with your state\'s bar association — many publish judicial evaluation reports. Check your state\'s judicial conduct board for any disciplinary actions. Look up the candidate\'s previous rulings if they\'re an incumbent. And read local newspaper coverage of their court.',
    category_id: 'cat1', category: demoCategories[0], author_name: 'BallotLens Editorial',
    hero_image_url: null, tags: 'judicial elections, judges, civics, research',
    is_featured: false, is_published: true,
    published_at: new Date(Date.now() - 86400000 * 20).toISOString(), read_time_minutes: 6,
  },
];

export async function getStoryCategories(): Promise<StoryCategory[]> {
  try {
    const { data, error } = await supabase.from('story_categories').select('*').order('name');
    if (error) throw error;
    if (data && data.length > 0) return data as StoryCategory[];
  } catch { /* fall through */ }
  return demoCategories;
}

export async function getFeaturedStories(limit = 3): Promise<Story[]> {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select('*, category:story_categories(*)')
      .eq('is_published', true)
      .eq('is_featured', true)
      .order('published_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    if (data && data.length > 0) return data as Story[];
  } catch { /* fall through */ }
  return demoStories.filter((s) => s.is_featured).slice(0, limit);
}

export async function getRecentStories(limit = 12, categoryId?: string): Promise<Story[]> {
  try {
    let query = supabase
      .from('stories')
      .select('*, category:story_categories(*)')
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(limit);
    if (categoryId) query = query.eq('category_id', categoryId);
    const { data, error } = await query;
    if (error) throw error;
    if (data && data.length > 0) return data as Story[];
  } catch { /* fall through */ }
  if (categoryId) return demoStories.filter((s) => s.category_id === categoryId).slice(0, limit);
  return demoStories.slice(0, limit);
}

export async function getStoryBySlug(slug: string): Promise<Story | null> {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select('*, category:story_categories(*)')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as Story;
  } catch { /* fall through */ }
  return demoStories.find((s) => s.slug === slug) ?? null;
}
