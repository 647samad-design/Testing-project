import { useEffect, useState, memo } from 'react';
import { Handshake, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getActiveSponsorships, trackSponsorEvent } from '@/services/advertising';
import type { SponsorPlacement, Sponsorship, Sponsor } from '@/types';

interface SponsorBadgeProps {
  placement: SponsorPlacement;
  className?: string;
}

type SponsorshipWithSponsor = Sponsorship & { sponsor?: Sponsor };

export const SponsorBadge = memo(function SponsorBadge({ placement, className = '' }: SponsorBadgeProps) {
  const [sponsorships, setSponsorships] = useState<SponsorshipWithSponsor[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await getActiveSponsorships(placement);
      if (!cancelled) {
        setSponsorships(data);
        setLoaded(true);
        if (data.length > 0) trackSponsorEvent(data[0].id, 'impression');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [placement]);

  if (!loaded || sponsorships.length === 0) return null;

  const sp = sponsorships[0];
  const sponsor = sp.sponsor;
  if (!sponsor) return null;

  return (
    <div className={className}>
      <Card className="border-2 border-border/40 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 p-4">
        <div className="flex items-center gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Handshake className="h-5 w-5 text-primary/50" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Presented by</p>
            <div className="mt-1 flex items-center gap-3">
              {sponsor.logo_url ? (
                <img src={sponsor.logo_url} alt={sponsor.sponsor_name} className="h-8 w-auto max-w-[120px] object-contain" />
              ) : (
                <p className="font-bold text-foreground">{sponsor.sponsor_name}</p>
              )}
              {sponsor.description && <p className="hidden sm:block text-xs text-muted-foreground line-clamp-1">{sponsor.description}</p>}
              {sponsor.website_url && (
                <a
                  href={sponsor.website_url}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  onClick={() => trackSponsorEvent(sp.id, 'click')}
                >
                  Visit <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
});
