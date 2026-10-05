import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { submitContentReport, type ReportableContentType } from '@/services/content-reports';
import { t } from '@/i18n';

const REASONS = [
  'False or misleading information',
  'Spam',
  'Harassment or abuse',
  'Impersonation',
  'Other',
];

interface ReportButtonProps {
  contentType: ReportableContentType;
  contentId: string;
  className?: string;
  label?: string;
}

export function ReportButton({ contentType, contentId, className, label = 'Report' }: ReportButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  async function handleSubmit() {
    if (!reason) return;
    setSubmitting(true);
    try {
      await submitContentReport(contentType, contentId, reason, description.trim() || undefined);
      toast.success(t("Thanks — our team will review this."));
      setOpen(false);
      setReason('');
      setDescription('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? 'inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors'}
      >
        <Flag className="h-3 w-3" /> {label}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Report content")}</DialogTitle>
            <DialogDescription>{t("Let us know what's wrong — our team reviews every report.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              {REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                  {r}
                </label>
              ))}
            </div>
            <Input
              placeholder={t("Additional details (optional)")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!reason || submitting}>
              {submitting ? t("Submitting…") : t("Submit Report")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
