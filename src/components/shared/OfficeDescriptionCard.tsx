import { useEffect, useState } from 'react';
import { Building2, Check, X, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getOfficeDescription } from '@/services/civic';
import type { OfficeDescription } from '@/types';

export function OfficeDescriptionCard({ officeName }: { officeName: string }) {
  const [office, setOffice] = useState<OfficeDescription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOfficeDescription(officeName).then((data) => {
      setOffice(data);
      setLoading(false);
    });
  }, [officeName]);

  if (loading) return null;
  if (!office) return null;

  return (
    <Card className="p-6 rounded-3xl border-primary/15 bg-gradient-to-br from-primary/3 to-transparent">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-bold text-sm">What Does This Office Actually Do?</h3>
          <p className="text-xs text-muted-foreground">{office.office_name}</p>
        </div>
      </div>

      {office.plain_english_summary && (
        <div className="mb-4 rounded-xl bg-secondary/40 p-3 text-sm text-foreground/80 leading-relaxed">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p>{office.plain_english_summary}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* What they control */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-success mb-2 flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" />
            What They Control
          </p>
          <ul className="space-y-1.5">
            {office.what_they_control.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* What they don't control */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-destructive mb-2 flex items-center gap-1.5">
            <X className="h-3.5 w-3.5" />
            What They Don't Control
          </p>
          <ul className="space-y-1.5">
            {office.what_they_dont_control.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/50" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
