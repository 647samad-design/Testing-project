import { useEffect, useState } from 'react';
import { Calendar, MapPin, Target, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import {
  getCampaignEvents, getEventRsvpCount, getMyRsvpEventIds, rsvpToEvent, cancelRsvp,
  type Campaign, type CampaignEvent,
} from '@/services/campaign';

interface CampaignTabProps {
  campaign: Campaign;
}

export function CampaignTab({ campaign }: CampaignTabProps) {
  const { user } = useAuth();
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [myRsvps, setMyRsvps] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ev = await getCampaignEvents(campaign.candidate_id);
      setEvents(ev);

      const countEntries = await Promise.all(ev.map(async (e) => [e.id, await getEventRsvpCount(e.id)] as const));
      setCounts(Object.fromEntries(countEntries));

      if (user) {
        const mine = await getMyRsvpEventIds(ev.map((e) => e.id));
        setMyRsvps(new Set(mine));
      }
      setLoading(false);
    })();
  }, [campaign.candidate_id, user]);

  async function handleRsvpToggle(eventId: string) {
    if (!user) {
      toast.error('Please sign in to RSVP.');
      return;
    }
    setBusyEventId(eventId);
    const alreadyGoing = myRsvps.has(eventId);
    try {
      if (alreadyGoing) {
        await cancelRsvp(eventId);
        setMyRsvps((prev) => { const next = new Set(prev); next.delete(eventId); return next; });
        setCounts((prev) => ({ ...prev, [eventId]: Math.max(0, (prev[eventId] ?? 1) - 1) }));
      } else {
        await rsvpToEvent(eventId);
        setMyRsvps((prev) => new Set(prev).add(eventId));
        setCounts((prev) => ({ ...prev, [eventId]: (prev[eventId] ?? 0) + 1 }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update your RSVP.');
    } finally {
      setBusyEventId(null);
    }
  }

  return (
    <div className="space-y-5">
      {(campaign.headline || campaign.message) && (
        <Card className="p-6 rounded-2xl">
          {campaign.headline && <h3 className="font-display text-2xl font-semibold tracking-tight">{campaign.headline}</h3>}
          {campaign.message && <p className="mt-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{campaign.message}</p>}
        </Card>
      )}

      {campaign.goals?.length > 0 && (
        <Card className="p-6 rounded-2xl">
          <h4 className="font-semibold flex items-center gap-2"><Target className="h-4 w-4" /> Campaign Goals</h4>
          <ul className="mt-3 space-y-2">
            {campaign.goals.map((goal, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                {goal}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div>
        <h4 className="font-semibold flex items-center gap-2 mb-3"><Calendar className="h-4 w-4" /> Upcoming Events</h4>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming events posted yet.</p>
        ) : (
          <div className="space-y-3">
            {events.map((e) => {
              const going = myRsvps.has(e.id);
              return (
                <Card key={e.id} className="p-5 rounded-xl">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-semibold">{e.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(e.event_date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                      {e.location && (
                        <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" /> {e.location}
                        </p>
                      )}
                      {e.description && <p className="mt-2 text-sm text-muted-foreground">{e.description}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {counts[e.id] ?? 0} going
                      </span>
                      <Button
                        size="sm"
                        variant={going ? 'outline' : 'default'}
                        disabled={busyEventId === e.id}
                        onClick={() => handleRsvpToggle(e.id)}
                      >
                        {busyEventId === e.id ? '…' : going ? "I'm Going ✓" : "I'm Going"}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
