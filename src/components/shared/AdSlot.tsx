import { useEffect, useState, memo } from 'react';
import { Megaphone, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getActiveAds, trackAdEvent } from '@/services/advertising';
import { getStoredRegion } from '@/services/elections';
import { useIsPaidUser } from '@/hooks/use-subscription';
import type { Advertisement, AdPlacement } from '@/types';

interface AdSlotProps {
  placement: AdPlacement;
  className?: string;
}

export const AdSlot = memo(function AdSlot({ placement, className = '' }: AdSlotProps) {
  const { isPaid } = useIsPaidUser();
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Ad-free browsing is a paid-tier perk (Candidate/Pro) — skip fetching
    // and rendering ads entirely for paying users, rather than fetching
    // them and hiding them, so it doesn't cost an impression/DB read either.
    if (isPaid) {
      setAds([]);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    async function load() {
      const region = getStoredRegion();
      const data = await getActiveAds(placement, region?.state);
      if (!cancelled) {
        setAds(data);
        setLoaded(true);
        if (data.length > 0) trackAdEvent(data[0].id, 'impression', region?.state);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [placement, isPaid]);

  if (!loaded || ads.length === 0) return null;

  const ad = ads[0];
  const region = getStoredRegion();

  return (
    <div className={className}>
      <Card
        className="relative overflow-hidden border-dashed border-2 border-border/60 bg-gradient-to-br from-secondary/20 to-secondary/5 p-0 transition-all hover:border-border"
        role="complementary"
        aria-label="Advertisement"
      >
        <div className="flex items-center justify-between border-b border-border/40 bg-secondary/20 px-4 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Advertisement</span>
          <a href="/advertise" className="text-[10px] font-medium text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            Advertise here
          </a>
        </div>
        <a
          href={ad.destination_url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="flex items-center gap-4 p-4"
          onClick={() => trackAdEvent(ad.id, 'click', region?.state)}
        >
          {ad.image_url ? (
            <img src={ad.image_url} alt={ad.ad_title} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Megaphone className="h-7 w-7 text-primary/40" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground text-sm leading-snug line-clamp-1">{ad.ad_title}</p>
            {ad.ad_description && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{ad.ad_description}</p>}
            <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
              Learn more <ExternalLink className="h-3 w-3" />
            </span>
          </div>
        </a>
      </Card>
    </div>
  );
});
