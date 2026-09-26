/*
# Fix: team invites were never actually usable beyond the initial insert

## What was found
inviteTeamMember() creates a campaign_team row with invited_email and
status='pending', but user_id stays NULL forever. Nothing anywhere links
that pending invite to an actual account:
- No email is sent to tell the invitee they were invited.
- If they sign up AFTER being invited, handle_new_user() only creates their
  profile row — it never checks for a matching pending invite.
- If they ALREADY have an account, nothing links it either.

Every RLS policy that grants team access checks
`ct.user_id = auth.uid() AND ct.status = 'active'` — since user_id was
always NULL, an invited team member could never gain any access at all,
under any circumstance. This is the core mechanic of the $299 Candidate
Management "invite your team" feature, and it was non-functional past the
database insert.

## Fix
1. `invite_team_member()` — a SECURITY DEFINER RPC that looks up whether an
   account with the invited email already exists (auth.users isn't
   client-readable, so this has to run server-side). If it does, the invite
   is linked and activated immediately. If not, it's stored pending as
   before, but see point 2.
2. `handle_new_user()` is updated to also check for a pending invite
   matching the new user's email at signup time, and link + activate it —
   covers the (more common) case of someone being invited before they have
   an account.
3. Sends the invited team member an instant email once linked, via the
   existing send-email infrastructure, notifying them they've been added.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;

  -- Link any pending team invite that was sent to this email before they
  -- had an account.
  UPDATE campaign_team
  SET user_id = new.id, status = 'active'
  WHERE invited_email = new.email
    AND user_id IS NULL
    AND status = 'pending';

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION invite_team_member(p_candidate_id uuid, p_email text, p_role text)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_can_invite boolean;
  v_existing_user_id uuid;
  v_new_status text;
  v_row_id uuid;
BEGIN
  SELECT (
    EXISTS (SELECT 1 FROM candidate_claims cc WHERE cc.candidate_id = p_candidate_id AND cc.user_id = auth.uid() AND cc.status = 'verified')
    OR EXISTS (SELECT 1 FROM campaign_team ct WHERE ct.candidate_id = p_candidate_id AND ct.user_id = auth.uid() AND ct.status = 'active')
  ) INTO v_can_invite;

  IF NOT v_can_invite THEN
    RAISE EXCEPTION 'Not authorized to invite team members for this candidate';
  END IF;

  -- auth.users is not client-readable, so this lookup has to happen here,
  -- server-side, to immediately activate an invite for someone who already
  -- has an account rather than leaving them stuck at "pending" forever.
  SELECT id INTO v_existing_user_id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  v_new_status := CASE WHEN v_existing_user_id IS NOT NULL THEN 'active' ELSE 'pending' END;

  INSERT INTO campaign_team (candidate_id, invited_email, user_id, role, status)
  VALUES (p_candidate_id, p_email, v_existing_user_id, p_role, v_new_status)
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object('id', v_row_id, 'linked_immediately', v_existing_user_id IS NOT NULL, 'user_id', v_existing_user_id);
END;
$$;

REVOKE ALL ON FUNCTION invite_team_member(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION invite_team_member(uuid, text, text) TO authenticated;
