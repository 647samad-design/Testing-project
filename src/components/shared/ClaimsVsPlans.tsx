import { useEffect, useState } from 'react';
import { safeUrl } from '@/lib/safe-url';
import { toast } from 'sonner';
import { ClipboardList, XCircle, ExternalLink, Plus, FileText, Scale } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getCandidateClaimAnalysis, addClaimAnalysis } from '@/services/civic';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type { CandidateClaimAnalysis, AuthorityAssessment } from '@/types';
import { t } from '@/i18n';

const AUTHORITY_LABELS: Record<AuthorityAssessment, { label: string; color: string; bg: string }> = {
  within: { label: 'Within office authority', color: 'text-success', bg: 'bg-success/8' },
  partially_within: { label: 'Partially within authority', color: 'text-warning', bg: 'bg-warning/8' },
  outside: { label: 'Outside office authority', color: 'text-destructive', bg: 'bg-destructive/8' },
  unclear: { label: 'Authority unclear', color: 'text-muted-foreground', bg: 'bg-secondary' },
};

export function ClaimsVsPlans({ candidateId, canEdit }: { candidateId: string; canEdit: boolean }) {
  const { user } = useAuth();
  const [claims, setClaims] = useState<CandidateClaimAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newClaim, setNewClaim] = useState('');
  const [hasPlan, setHasPlan] = useState(false);
  const [planHow, setPlanHow] = useState('');
  const [planWhen, setPlanWhen] = useState('');
  const [planCost, setPlanCost] = useState('');
  const [authority, setAuthority] = useState<AuthorityAssessment | ''>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    load();
  }, [candidateId]);

  async function load() {
    const data = await getCandidateClaimAnalysis(candidateId);
    setClaims(data);
    setLoading(false);
  }

  async function handleAdd() {
    if (!newClaim.trim()) return;
    try {
      await addClaimAnalysis(candidateId, newClaim.trim(), hasPlan, {
        plan_how: planHow || undefined,
        plan_when: planWhen || undefined,
        plan_cost: planCost || undefined,
        authority_assessment: (authority || undefined) as AuthorityAssessment | undefined,
        analysis_notes: notes || undefined,
      });
      setNewClaim('');
      setPlanHow('');
      setPlanWhen('');
      setPlanCost('');
      setNotes('');
      setHasPlan(false);
      setAuthority('');
      setShowAdd(false);
      await load();
      toast.success(t("Saved. It will appear publicly after a Gov Search App reviewer approves it."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save this analysis.');
    }
  }

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">{t("Loading claims...")}</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-secondary/30 p-4 text-sm text-muted-foreground leading-relaxed">
        <p>{t("A campaign promise is not the same as an actionable plan. Here we break down what candidates say, whether they explain")} <span className="font-bold text-foreground">{t("how")}</span> {t("they'll do it, and whether the office they're running for even has the authority to do it.")}</p>
      </div>

      {/* Add claim button */}
      {canEdit && user && (
        <>
          {!showAdd ? (
            <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />{t("Add Claim Analysis")}</Button>
          ) : (
            <Card className="p-4 rounded-2xl space-y-3">
              <input
                type="text"
                value={newClaim}
                onChange={(e) => setNewClaim(e.target.value)}
                placeholder={t("e.g., \"I will lower property taxes\"")}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={hasPlan}
                  onChange={(e) => setHasPlan(e.target.checked)}
                  className="h-4 w-4 rounded"
                />{t("Has a specific plan?")}</label>
              {hasPlan && (
                <div className="space-y-2 pl-6">
                  <input
                    type="text"
                    value={planHow}
                    onChange={(e) => setPlanHow(e.target.value)}
                    placeholder={t("How?")}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    type="text"
                    value={planWhen}
                    onChange={(e) => setPlanWhen(e.target.value)}
                    placeholder={t("When?")}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    type="text"
                    value={planCost}
                    onChange={(e) => setPlanCost(e.target.value)}
                    placeholder={t("What it costs / what gets cut?")}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{t("Authority Assessment")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(AUTHORITY_LABELS).map(([key, s]) => (
                    <button
                      key={key}
                      onClick={() => setAuthority(authority === key ? '' : key as AuthorityAssessment)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                        authority === key ? cn(s.bg, s.color, 'ring-1 ring-current') : 'bg-secondary text-muted-foreground'
                      )}
                    >
                      {t(s.label)}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("Analysis notes...")}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                rows={2}
              />
              <div className="flex gap-2">
                <Button size="sm" className="rounded-xl" onClick={handleAdd} disabled={!newClaim.trim()}>{t("Save")}</Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setShowAdd(false)}>{t("Cancel")}</Button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Claims list */}
      {claims.length === 0 ? (
        <div className="text-center py-10">
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">{t("No claims analyzed yet.")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {claims.map((claim) => (
            <ClaimAnalysisCard key={claim.id} claim={claim} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClaimAnalysisCard({ claim }: { claim: CandidateClaimAnalysis }) {
  const authorityStyle = claim.authority_assessment ? AUTHORITY_LABELS[claim.authority_assessment] : null;

  return (
    <Card className="p-5 rounded-2xl">
      {/* What they say */}
      <div className="mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1">{t("What They Say")}</p>
        {claim.review_status === 'pending' && (
          <p className="mb-1 inline-block rounded-md bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">{t("Awaiting Gov Search App review — only your campaign can see this")}</p>
        )}
        <p className="text-sm font-semibold text-foreground">"{claim.claim_text}"</p>
        {claim.issue && (
          <Badge variant="secondary" className="mt-1.5 rounded-lg text-[10px]">{claim.issue.name}</Badge>
        )}
      </div>

      {/* How? */}
      <div className="mb-3 rounded-xl bg-secondary/30 p-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
          <FileText className="h-3 w-3" />{t("Specific Plan")}</p>
        {claim.has_specific_plan ? (
          <div className="space-y-1.5">
            {claim.plan_how && <PlanRow label={t("How")} value={claim.plan_how} />}
            {claim.plan_when && <PlanRow label={t("When")} value={claim.plan_when} />}
            {claim.plan_cost && <PlanRow label={t("Cost / Trade-offs")} value={claim.plan_cost} />}
            {claim.plan_details && <PlanRow label={t("Details")} value={claim.plan_details} />}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <XCircle className="h-4 w-4 text-destructive" />{t("No specific plan provided")}</p>
        )}
      </div>

      {/* Authority */}
      {authorityStyle && (
        <div className="mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <Scale className="h-3 w-3" />{t("Authority")}</p>
          <span className={cn('inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold', authorityStyle.bg, authorityStyle.color)}>
            {t(authorityStyle.label)}
          </span>
        </div>
      )}

      {/* Analysis notes */}
      {claim.analysis_notes && (
        <div className="mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-accent mb-1">{t("Gov Search App Analysis")}</p>
          <p className="text-sm text-foreground/80 leading-relaxed">{claim.analysis_notes}</p>
        </div>
      )}

      {/* Evidence */}
      {claim.evidence_text && (
        <div className="rounded-xl bg-card/50 p-2.5 text-xs text-foreground/80 mb-2">
          <p className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("Evidence")}</p>
          {claim.evidence_text}
        </div>
      )}
      {claim.evidence_url && (
        <a href={safeUrl(claim.evidence_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          <ExternalLink className="h-3 w-3" />{t("View Source")}</a>
      )}
    </Card>
  );
}

function PlanRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-xs font-bold text-muted-foreground shrink-0 w-20">{label}:</span>
      <span className="text-foreground/80">{value}</span>
    </div>
  );
}
