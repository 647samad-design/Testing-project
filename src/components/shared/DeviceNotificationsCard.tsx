import { useEffect, useState } from 'react';
import { BellRing, MessageSquareText, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  pushSupported, isPushEnabled, enablePush, disablePush,
  getSmsState, startSmsVerification, confirmSmsCode, setSmsReminders, removeSmsPhone,
  type SmsState, type SmsResult,
} from '@/services/device-notifications';
import { t } from '@/i18n';

function smsMessage(r: SmsResult): string {
  switch (r.status) {
    case 'invalid_phone': return t("Enter a valid U.S. mobile number.");
    case 'too_many': return t("Too many tries. Please wait an hour and try again.");
    case 'expired': return t("That code expired. Send a new one.");
    case 'wrong_code': return t("That code isn't right. Check the text and try again.");
    case 'not_configured': return t("Text reminders aren't available yet.");
    default: return t("Something went wrong. Please try again.");
  }
}

/** Phone & browser notifications: Web Push for this device, and verified SMS reminders. */
export function DeviceNotificationsCard() {
  const [push, setPush] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [sms, setSms] = useState<SmsState | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);

  useEffect(() => {
    isPushEnabled().then(setPush).catch(() => setPush(false));
    getSmsState().then(setSms).catch(() => setSms({ phoneLast4: null, verified: false, reminders: false }));
  }, []);

  async function togglePush(on: boolean) {
    setBusy(true);
    try {
      if (on) {
        const r = await enablePush();
        if (r === 'denied') toast.error(t("Notifications are blocked for this site. Allow them in your browser settings, then try again."));
        setPush(r === 'enabled');
      } else {
        await disablePush();
        setPush(false);
      }
    } catch {
      toast.error(t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    setBusy(true);
    const r = await startSmsVerification(phone);
    setBusy(false);
    if (r.status === 'sent') { setCodeSentTo(r.phoneLast4 ?? ''); toast.success(t("We texted you a 6-digit code.")); } else toast.error(smsMessage(r));
  }

  async function confirm() {
    setBusy(true);
    const r = await confirmSmsCode(code);
    setBusy(false);
    if (r.status === 'verified') {
      setSms({ phoneLast4: r.phoneLast4 ?? null, verified: true, reminders: true });
      setCodeSentTo(null); setCode(''); setPhone('');
      toast.success(t("Text reminders are on."));
    } else toast.error(smsMessage(r));
  }

  async function toggleSms(on: boolean) {
    try { await setSmsReminders(on); setSms((s) => s && { ...s, reminders: on }); } catch { toast.error(t("Something went wrong. Please try again.")); }
  }

  async function removePhone() {
    try { await removeSmsPhone(); setSms({ phoneLast4: null, verified: false, reminders: false }); } catch { toast.error(t("Something went wrong. Please try again.")); }
  }

  return (
    <Card className="mt-6 rounded-2xl p-5">
      <h3 className="flex items-center gap-2 font-semibold text-foreground"><Smartphone className="h-5 w-5 text-primary" />{t("Phone & browser notifications")}</h3>

      <div className="mt-4 flex items-start justify-between gap-4 border-b border-border pb-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium"><BellRing className="h-4 w-4 text-primary" />{t("Push notifications on this device")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pushSupported()
              ? t("Election reminders and new messages, even when the site is closed.")
              : t("This browser doesn't support push notifications. On iPhone, add this site to your Home Screen first.")}
          </p>
        </div>
        <Switch
          checked={!!push}
          disabled={busy || push === null || !pushSupported()}
          onCheckedChange={togglePush}
          aria-label={t("Push notifications on this device")}
        />
      </div>

      <div className="mt-4">
        <p className="flex items-center gap-2 text-sm font-medium"><MessageSquareText className="h-4 w-4 text-primary" />{t("Text message election reminders")}</p>
        {sms?.verified && sms.phoneLast4 ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t("Texts go to the number ending in {last4}.", { last4: sms.phoneLast4 })}</p>
            <div className="flex items-center gap-3">
              <Switch checked={sms.reminders} onCheckedChange={toggleSms} aria-label={t("Text message election reminders")} />
              <Button size="sm" variant="outline" onClick={removePhone}>{t("Remove number")}</Button>
            </div>
          </div>
        ) : codeSentTo !== null ? (
          <form className="mt-2 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); confirm(); }}>
            <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" aria-label={t("6-digit code")} className="sm:max-w-[10rem]" />
            <Button type="submit" disabled={busy || code.replace(/\D/g, '').length !== 6}>{t("Confirm")}</Button>
            <Button type="button" variant="ghost" onClick={() => setCodeSentTo(null)}>{t("Change number")}</Button>
          </form>
        ) : (
          <>
            <form className="mt-2 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); sendCode(); }}>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="(904) 555-0123" aria-label={t("Mobile number")} className="sm:max-w-xs" />
              <Button type="submit" disabled={busy || phone.replace(/\D/g, '').length < 10}>{t("Send code")}</Button>
            </form>
            <p className="mt-2 text-[11px] text-muted-foreground">{t("By confirming your number you agree to receive election reminder texts from Gov Search App. Message and data rates may apply. Reply STOP to opt out at any time.")}</p>
          </>
        )}
      </div>
    </Card>
  );
}
