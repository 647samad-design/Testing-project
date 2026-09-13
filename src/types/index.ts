// BallotLens shared types

export type ContestLevel = 'federal' | 'state' | 'local' | 'judicial';
export type DistrictType =
  | 'congressional' | 'state_senate' | 'state_house'
  | 'county' | 'municipal' | 'judicial' | 'school' | 'special';

export type SourceType =
  | 'government' | 'candidate' | 'campaign' | 'legislative'
  | 'court' | 'news' | 'interview' | 'debate'
  | 'video' | 'social' | 'opinion' | 'other';

export type CredibilityLevel = 'primary' | 'secondary' | 'other';

export type VerificationStatus = 'verified' | 'not_verified' | 'insufficient_information';

export type AssessmentStatus =
  | 'requires_context' | 'supported' | 'unsupported' | 'insufficient_information';

export type ArticleType = 'reporting' | 'opinion' | 'campaign_material' | 'social_media';

export type MediaCategory =
  | 'news' | 'local_news' | 'investigation' | 'video' | 'debate'
  | 'interview' | 'speech' | 'town_hall' | 'social' | 'podcast';

export interface Election {
  id: string;
  name: string;
  election_date: string;
  description: string | null;
}

export interface District {
  id: string;
  name: string;
  district_type: DistrictType;
  state: string;
}

export interface BallotContest {
  id: string;
  election_id: string;
  district_id: string | null;
  office_name: string;
  contest_level: ContestLevel;
  seat_description: string | null;
  term_length: string | null;
  district?: District | null;
  election?: Election | null;
  candidates?: Candidate[];
}

export interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  party: string | null;
  photo_url: string | null;
  bio: string | null;
  education: string | null;
  professional_background: string | null;
  previous_offices: string | null;
  military_service: string | null;
  public_service: string | null;
  website_url: string | null;
  is_demo: boolean;
}

export interface CandidateOffice {
  id: string;
  candidate_id: string;
  contest_id: string;
  incumbent: boolean;
}

export interface Issue {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  is_custom: boolean;
  created_by: string | null;
}

export interface Source {
  id: string;
  title: string;
  url: string | null;
  publisher: string | null;
  source_type: SourceType;
  publication_date: string | null;
  author: string | null;
  description: string | null;
  credibility_level: CredibilityLevel;
}

export interface CandidatePosition {
  id: string;
  candidate_id: string;
  issue_id: string;
  summary: string | null;
  verification_status: VerificationStatus;
  issue?: Issue;
  sources?: Source[];
}

export interface CandidateStatement {
  id: string;
  candidate_id: string;
  issue_id: string | null;
  statement_text: string;
  source_id: string | null;
  statement_date: string | null;
  source?: Source | null;
  issue?: Issue | null;
}

export interface VotingRecord {
  id: string;
  candidate_id: string;
  bill_name: string;
  bill_number: string | null;
  vote: 'yes' | 'no' | 'abstain' | 'absent' | null;
  vote_date: string | null;
  chamber: string | null;
  description: string | null;
  source_id: string | null;
  source?: Source | null;
  plain_english_summary: string | null;
  eli5_explanation: string | null;
}

export interface BallotMeasure {
  id: string;
  election_id: string;
  district_id: string | null;
  title: string;
  measure_type: 'amendment' | 'referendum' | 'local';
  summary: string | null;
  full_text_url: string | null;
  arguments_for: string | null;
  arguments_against: string | null;
  plain_english_summary: string | null;
  eli5_explanation: string | null;
}

export interface NewsArticle {
  id: string;
  candidate_id: string | null;
  issue_id: string | null;
  title: string;
  url: string | null;
  publisher: string | null;
  article_type: ArticleType;
  media_category: MediaCategory;
  summary: string | null;
  published_date: string | null;
  candidate?: Candidate | null;
}

export interface Video {
  id: string;
  candidate_id: string | null;
  title: string;
  url: string | null;
  thumbnail_url: string | null;
  video_type: string | null;
  publisher: string | null;
  description: string | null;
  published_date: string | null;
  candidate?: Candidate | null;
}

export interface SocialPost {
  id: string;
  candidate_id: string;
  platform: string | null;
  content: string | null;
  url: string | null;
  posted_date: string | null;
  candidate?: Candidate | null;
}

export interface JudicialRecord {
  id: string;
  candidate_id: string;
  current_position: string | null;
  bar_admission_date: string | null;
  bar_number: string | null;
  previous_judicial_experience: string | null;
  notable_decisions: string | null;
  disciplinary_records: string | null;
  endorsements: string | null;
  campaign_contributions_summary: string | null;
}

export interface Claim {
  id: string;
  claim_text: string;
  candidate_id: string | null;
  assessment: AssessmentStatus;
  explanation: string | null;
  created_at: string;
  candidate?: Candidate | null;
  evidence?: ClaimEvidence[];
}

export interface ClaimEvidence {
  id: string;
  claim_id: string;
  source_id: string;
  note: string | null;
  source?: Source;
}

export type LanguageName = 'en' | 'es' | 'pt' | 'ht' | 'ru';

export const LANGUAGE_OPTIONS: { value: LanguageName; label: string; nativeLabel: string }[] = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { value: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { value: 'ht', label: 'Haitian Creole', nativeLabel: 'Kreyòl Ayisyen' },
  { value: 'ru', label: 'Russian', nativeLabel: 'Русский' },
];

export interface Profile {
  id: string;
  full_name: string | null;
  zip_code: string | null;
  is_admin: boolean;
  bio?: string | null;
  language_preference: LanguageName | null;
  photo_url?: string | null;
  occupation?: string | null;
  education?: string | null;
  civic_level?: number;
  civic_xp?: number;
}

export interface ElectionJourneyStep {
  id: string;
  user_id: string;
  step_number: number;
  completed: boolean;
  completed_at: string | null;
  progress_detail: string | null;
}

export interface UserLocation {
  id: string;
  user_id: string;
  city: string | null;
  state: string | null;
  zip_code: string;
  county: string | null;
}

// AI response structure
export interface AIResponse {
  answer: string;
  evidence: string[];
  sources: Source[];
  confidence: 'high' | 'medium' | 'low';
  limitations: string[];
}

export interface ClaimAssessment {
  claim: string;
  assessment: AssessmentStatus;
  explanation: string;
  evidence: string[];
  sources: Source[];
}

// Advertising
export type AdPlacement =
  | 'homepage' | 'candidates_page' | 'candidate_profile' | 'issues_page'
  | 'election_page' | 'news_page' | 'search' | 'mobile' | 'footer' | 'sidebar';

export type AdType = 'banner' | 'square' | 'sidebar' | 'mobile' | 'sponsored_content';

export type AdStatus = 'draft' | 'pending' | 'active' | 'paused' | 'rejected' | 'expired';

export interface Advertiser {
  id: string;
  user_id: string;
  organization_name: string;
  contact_email: string;
  contact_phone: string | null;
  logo_url: string | null;
  website_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Advertisement {
  id: string;
  advertiser_id: string;
  campaign_name: string;
  ad_title: string;
  ad_description: string | null;
  image_url: string | null;
  destination_url: string;
  ad_type: AdType;
  placement: AdPlacement;
  target_state: string | null;
  target_city: string | null;
  target_zip: string | null;
  target_district: string | null;
  start_date: string;
  end_date: string | null;
  budget: number | null;
  status: AdStatus;
  impressions: number;
  clicks: number;
  created_at: string;
  updated_at: string;
}

export interface AdPlan {
  id: string;
  plan_name: string;
  description: string | null;
  monthly_price: number;
  features: string[];
  is_active: boolean;
  display_order: number;
}

// Sponsorship
export type SponsorPlacement =
  | 'election_guide' | 'voter_education' | 'election_calendar'
  | 'educational_article' | 'civic_page' | 'ballot_page';

export interface Sponsor {
  id: string;
  user_id: string | null;
  sponsor_name: string;
  contact_email: string;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
  is_active: boolean;
}

export interface Sponsorship {
  id: string;
  sponsor_id: string;
  campaign_name: string;
  placement: SponsorPlacement;
  target_state: string | null;
  start_date: string;
  end_date: string | null;
  budget: number | null;
  status: 'draft' | 'pending' | 'active' | 'paused' | 'expired';
  impressions: number;
  clicks: number;
  sponsor?: Sponsor;
}

// Candidate claiming
export type ClaimStatus = 'pending' | 'verified' | 'rejected';

export interface CandidateClaim {
  id: string;
  candidate_id: string;
  user_id: string;
  full_name: string;
  campaign_name: string | null;
  office: string | null;
  email: string;
  campaign_website: string | null;
  verification_notes: string | null;
  status: ClaimStatus;
  admin_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

// Candidate submissions (pending approval)
export type SubmissionFieldName =
  | 'bio' | 'education' | 'professional_background' | 'previous_offices'
  | 'military_service' | 'public_service' | 'website_url' | 'photo_url'
  | 'campaign_email' | 'campaign_phone'
  | 'social_facebook' | 'social_twitter' | 'social_instagram' | 'social_linkedin'
  | 'position_statement';

export interface CandidateSubmission {
  id: string;
  candidate_id: string;
  user_id: string;
  field_name: SubmissionFieldName;
  field_value: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface CandidateQuestionnaireResponse {
  id: string;
  candidate_id: string;
  user_id: string;
  question: string;
  answer: string | null;
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at: string | null;
}

export interface CandidateEvent {
  id: string;
  candidate_id: string;
  user_id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  virtual_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
}

// Subscriptions
export interface Subscription {
  id: string;
  user_id: string;
  plan: 'free' | 'candidate_monthly' | 'candidate_yearly' | 'pro_monthly' | 'pro_yearly'
    | 'premium_monthly' | 'premium_yearly'; // legacy values, kept for old rows
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'expired';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
}

export interface CandidateServicePlan {
  id: string;
  plan_name: string;
  description: string | null;
  annual_price: number;
  features: string[];
  is_active: boolean;
  is_available: boolean;
  display_order: number;
}

// Candidate tags — user-applied informational labels
export interface CandidateTag {
  id: string;
  candidate_id: string;
  user_id: string;
  tag: string;
  created_at: string;
}

export const CANDIDATE_TAG_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: 'pro-black', label: 'Pro-Black', description: 'Advocates for Black communities and racial justice' },
  { value: 'pro-aipac', label: 'Pro-AIPAC', description: 'Supports AIPAC and US-Israel alliance' },
  { value: 'pro-life', label: 'Pro-Life', description: 'Opposes abortion' },
  { value: 'pro-choice', label: 'Pro-Choice', description: 'Supports abortion access' },
  { value: 'pro-gun', label: 'Pro-Gun', description: 'Strong Second Amendment support' },
  { value: 'gun-control', label: 'Gun Control Advocate', description: 'Supports gun safety legislation' },
  { value: 'pro-labor', label: 'Pro-Labor', description: 'Supports unions and workers rights' },
  { value: 'pro-business', label: 'Pro-Business', description: 'Favors business-friendly policies' },
  { value: 'pro-environment', label: 'Pro-Environment', description: 'Prioritizes climate and conservation' },
  { value: 'pro-lgbtq', label: 'Pro-LGBTQ+', description: 'Advocates for LGBTQ+ rights' },
  { value: 'pro-immigration', label: 'Pro-Immigration', description: 'Supports immigration reform and pathways' },
  { value: 'anti-establishment', label: 'Anti-Establishment', description: 'Runs against political establishment' },
  { value: 'bipartisan', label: 'Bipartisan', description: 'Known for cross-party cooperation' },
  { value: 'progressive', label: 'Progressive', description: 'Left-leaning policy positions' },
  { value: 'conservative', label: 'Conservative', description: 'Right-leaning policy positions' },
  { value: 'moderate', label: 'Moderate', description: 'Centrist or pragmatic positions' },
  { value: 'pro-police', label: 'Pro-Police', description: 'Supports law enforcement funding' },
  { value: 'police-reform', label: 'Police Reform', description: 'Advocates for policing reforms' },
  { value: 'pro-education', label: 'Pro-Education', description: 'Prioritizes education funding and reform' },
  { value: 'pro-healthcare', label: 'Pro-Healthcare', description: 'Supports healthcare access expansion' },
];

// Stories / Blog — keeps users engaged between elections
export interface StoryCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
}

export interface Story {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  category_id: string | null;
  category?: StoryCategory | null;
  author_name: string | null;
  hero_image_url: string | null;
  tags: string | null;
  is_featured: boolean;
  is_published: boolean;
  published_at: string | null;
  read_time_minutes: number | null;
}

// Service-layer utility types
export interface DistrictResult {
  state: string;
  county: string | null;
  congressional: string | null;
  state_senate: string | null;
  state_house: string | null;
  municipal: string | null;
  judicial: string | null;
  school: string | null;
  special: string[];
}

// === Social Engagement Types ===

export type FollowableType = 'candidate' | 'issue';

export interface Follow {
  id: string;
  user_id: string;
  followable_type: FollowableType;
  followable_id: string;
  created_at: string;
}

export type FeedPostType = 'update' | 'event' | 'position_change' | 'endorsement' | 'election_result' | 'news';

export interface FeedPost {
  id: string;
  candidate_id: string;
  author_user_id: string | null;
  post_type: FeedPostType;
  body: string;
  image_url: string | null;
  link_url: string | null;
  event_date: string | null;
  event_location: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  event_rsvp_count: number;
  is_pinned: boolean;
  source_name: string | null;
  source_url: string | null;
  created_at: string;
  like_count?: number;
  liked_by_me?: boolean;
  candidate?: Candidate;
}

export type TeamRole = 'candidate' | 'campaign_manager' | 'social_manager' | 'volunteer_manager' | 'staff' | 'volunteer';

export interface CampaignTeamMember {
  id: string;
  candidate_id: string;
  user_id: string | null;
  role: TeamRole;
  invited_email: string | null;
  status: 'pending' | 'active' | 'revoked';
  created_at: string;
  accepted_at: string | null;
}

export type QuestionStatus = 'open' | 'answered' | 'archived';

export interface VoterQuestion {
  id: string;
  candidate_id: string;
  user_id: string;
  question_text: string;
  issue_id: string | null;
  status: QuestionStatus;
  answer_text: string | null;
  answered_at: string | null;
  answered_by_user_id: string | null;
  helpful_count: number;
  evidence_count: number;
  responsive_count: number;
  created_at: string;
  issue?: Issue | null;
}

export type RatingType = 'helpful' | 'evidence' | 'responsive';

export interface QuestionRating {
  id: string;
  question_id: string;
  user_id: string;
  rating_type: RatingType;
  value: boolean;
  created_at: string;
}

export type NotificationType =
  | 'position_change' | 'new_post' | 'question_answered'
  | 'new_voting_record' | 'new_event' | 'new_endorsement'
  | 'new_follower' | 'team_invite';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  candidate_id: string | null;
  issue_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ProfileView {
  id: string;
  candidate_id: string;
  viewer_user_id: string | null;
  viewer_zip: string | null;
  created_at: string;
}

// === Messaging Types ===

export interface Conversation {
  id: string;
  voter_id: string;
  candidate_id: string;
  candidate_user_id: string | null;
  created_at: string;
  last_message_at: string;
  voter_read_at: string | null;
  candidate_read_at: string | null;
  candidate?: Candidate;
  last_message?: Message | null;
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: 'voter' | 'candidate';
  body: string;
  created_at: string;
}

// === Civic Engagement Types ===

export interface OfficeDescription {
  id: string;
  office_name: string;
  what_they_control: string[];
  what_they_dont_control: string[];
  plain_english_summary: string | null;
  typical_term_length: string | null;
}

export type FactCheckAssessment = 'true' | 'misleading' | 'false' | 'unverified' | 'needs_context';
export type FactCheckStatus = 'pending' | 'reviewed' | 'published';
export type FactCheckPlatform = 'tiktok' | 'instagram' | 'facebook' | 'x' | 'tv' | 'news' | 'other';

export interface FactCheck {
  id: string;
  submitted_by_user_id: string | null;
  claim_text: string;
  source_url: string | null;
  source_platform: FactCheckPlatform | null;
  assessment: FactCheckAssessment;
  explanation: string | null;
  evidence_text: string | null;
  evidence_url: string | null;
  candidate_id: string | null;
  issue_id: string | null;
  status: FactCheckStatus;
  created_at: string;
  reviewed_at: string | null;
}

export type PromiseStatus = 'completed' | 'in_progress' | 'not_started' | 'contradicted' | 'unverified';

export interface CandidatePromise {
  id: string;
  candidate_id: string;
  promise_text: string;
  issue_id: string | null;
  date_made: string | null;
  source_url: string | null;
  status: PromiseStatus;
  status_evidence: string | null;
  status_source_url: string | null;
  status_updated_at: string | null;
  created_at: string;
  issue?: Issue | null;
}

export type AuthorityAssessment = 'within' | 'partially_within' | 'outside' | 'unclear';

export interface CandidateClaimAnalysis {
  id: string;
  candidate_id: string;
  claim_text: string;
  issue_id: string | null;
  has_specific_plan: boolean;
  plan_details: string | null;
  plan_how: string | null;
  plan_how_much: string | null;
  plan_when: string | null;
  plan_cost: string | null;
  plan_what_gets_cut: string | null;
  authority_assessment: AuthorityAssessment | null;
  evidence_text: string | null;
  evidence_url: string | null;
  analysis_notes: string | null;
  created_at: string;
  issue?: Issue | null;
}

// === Candidate Profile Enhancements ===

export interface CandidateProfileExtras {
  candidate_id: string;
  office_sought: string | null;
  district: string | null;
  current_occupation: string | null;
  hometown_area: string | null;
  why_im_running_video_url: string | null;
  why_im_running_video_poster: string | null;
  election_date: string | null;
  election_type: 'primary' | 'runoff' | 'general' | null;
  term_length: string | null;
  next_election_date: string | null;
}

export interface CandidateGetToKnow {
  id: string;
  candidate_id: string;
  question: string;
  answer: string;
  display_order: number;
  status: 'pending' | 'approved' | 'rejected';
}

export type FundingSourceType = 'individuals' | 'pac' | 'organization' | 'self_funded' | 'other';

export interface CandidateFundingSource {
  id: string;
  candidate_id: string;
  source_type: FundingSourceType;
  percentage: number;
  amount_dollars: number | null;
  source_label: string | null;
  report_date: string | null;
  status: 'pending' | 'approved' | 'rejected';
}

export type EndorserType = 'organization' | 'elected_official' | 'union' | 'community_group' | 'other';

export interface CandidateEndorsement {
  id: string;
  candidate_id: string;
  endorser_name: string;
  endorser_type: EndorserType;
  endorser_title: string | null;
  endorser_logo_url: string | null;
  endorsement_date: string | null;
  display_order: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface CandidateElectionReminder {
  id: string;
  candidate_id: string;
  user_id: string;
  created_at: string;
}