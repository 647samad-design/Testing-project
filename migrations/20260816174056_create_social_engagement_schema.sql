/*
# Create social engagement schema — follows, feed, questions, AMAs, ratings, team, notifications, analytics

## Summary
Adds the full social/engagement layer to BallotLens:
1. Follow candidates and issues (social graph)
2. Candidate social posts (text, images, events)
3. Voter questions + AMA-style answers organized by topic
4. Voter ratings on answers/claims (useful, evidence-backed, responsive)
5. Campaign team members with role-based permissions
6. Notifications ("what changed" feed)
7. Candidate profile view analytics

## New Tables

### follows
- id, user_id, followable_type ('candidate'|'issue'), followable_id, created_at
- Lets a user follow both candidates AND issues

### feed_posts
- id, candidate_id, author_user_id, post_type ('update'|'event'|'position_change'|'endorsement')
- body, image_url, link_url, event_date, event_location, event_rsvp_count
- is_pinned, created_at
- The candidate's social feed visible to voters

### post_likes
- id, post_id, user_id, created_at

### voter_questions
- id, candidate_id, user_id, question_text, issue_id (optional topic tag)
- status ('open'|'answered'|'archived'), answer_text, answered_at, answered_by_user_id
- helpful_count, evidence_count, responsive_count
- Voter-submitted questions with candidate answers (AMA)

### question_ratings
- id, question_id, user_id, rating_type ('helpful'|'evidence'|'responsive')
- value (boolean), created_at

### campaign_team
- id, candidate_id, user_id, role ('candidate'|'campaign_manager'|'social_manager'|'volunteer_manager'|'staff'|'volunteer')
- invited_email, status ('pending'|'active'|'revoked'), created_at, accepted_at

### notifications
- id, user_id, type ('position_change'|'new_post'|'question_answered'|'new_voting_record'|'new_event'|'new_endorsement')
- title, body, candidate_id, issue_id, is_read, created_at

### profile_views
- id, candidate_id, viewer_user_id (nullable for anonymous), viewer_zip, created_at
- For candidate analytics dashboard

## Security
- RLS enabled on all new tables
- Authenticated users can follow, post (if team member), ask questions, rate, and receive notifications
- Public reads on feed_posts, voter_questions (with answers), and campaign_team membership
- Only team members can create/edit feed_posts and answer questions
- Users can only delete their own follows, likes, questions, and ratings
*/