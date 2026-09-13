import { useState } from 'react';
import { BadgeCheck, CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { submitCandidateClaim } from '@/services/candidate-portal';
import { useAuth } from '@/hooks/use-auth';
import { Link } from 'react-router-dom';

interface ClaimProfileButtonProps {
  candidateId: string;
  candidateName: string;
}

export function ClaimProfileButton({ candidateId, candidateName }: ClaimProfileButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: '', campaign_name: '', office: '', email: '', campaign_website: '', verification_notes: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      setError('Your name and email are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await submitCandidateClaim(candidateId, {
      full_name: form.full_name,
      campaign_name: form.campaign_name || undefined,
      office: form.office || undefined,
      email: form.email,
      campaign_website: form.campaign_website || undefined,
      verification_notes: form.verification_notes || undefined,
    });
    setSubmitting(false);
    if (result.success) setSubmitted(true);
    else setError(result.error ?? 'Something went wrong. Please try again.');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 rounded-xl touch-target border-emerald-300 text-emerald-700 hover:bg-emerald-50">
          <BadgeCheck className="h-4 w-4" />
          Is this your profile?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Claim Your Candidate Profile</DialogTitle>
          <DialogDescription>
            Verify your identity to manage this profile — like claiming a business on Google or Yelp.
            Submissions are reviewed by our team before going live. This service does not affect
            your ranking or placement.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <p className="mt-3 font-semibold text-foreground">Claim submitted!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We'll review your request and contact you at <strong>{form.email}</strong> within 2-3 business days.
            </p>
            <Button onClick={() => setOpen(false)} className="mt-4 rounded-xl">Close</Button>
          </div>
        ) : !user ? (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">You need an account to claim a candidate profile.</p>
            <Link to="/signin" onClick={() => setOpen(false)}>
              <Button className="mt-3 rounded-xl">Sign In or Create Account</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="claim-full-name">Full Name *</Label>
              <Input id="claim-full-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Your full name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="claim-email">Email *</Label>
              <Input id="claim-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@campaign.com" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="claim-campaign">Campaign Name</Label>
                <Input id="claim-campaign" value={form.campaign_name} onChange={(e) => setForm({ ...form, campaign_name: e.target.value })} placeholder="Campaign committee" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claim-office">Office</Label>
                <Input id="claim-office" value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} placeholder="Office sought" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="claim-website">Campaign Website</Label>
              <Input id="claim-website" type="url" value={form.campaign_website} onChange={(e) => setForm({ ...form, campaign_website: e.target.value })} placeholder="https://yourcampaign.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="claim-notes">Verification Notes</Label>
              <Textarea id="claim-notes" value={form.verification_notes} onChange={(e) => setForm({ ...form, verification_notes: e.target.value })} placeholder="Any information that helps us verify you are the candidate" rows={3} />
            </div>
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">
                Profile Claim is $99/year and includes a verified badge, bio, website, social links,
                contact info, and questionnaire. Claiming never affects your ranking or placement.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full rounded-xl">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <><Send className="h-4 w-4" /> Submit Claim</>}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
