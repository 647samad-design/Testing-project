import { supabase } from '@/lib/supabase';

// ─── Browser / phone push (Web Push) ───

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function pushSupported(): boolean {
  return !!VAPID_PUBLIC_KEY && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Is push on for this device (subscribed and saved to this account)? */
export async function isPushEnabled(): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return false;
  const { data } = await supabase.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle();
  return !!data;
}

/** Asks permission, subscribes this browser and saves it to the account. */
export async function enablePush(): Promise<'enabled' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error('Not signed in.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource });
  const json = sub.toJSON();
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  const { error } = await supabase.from('push_subscriptions').insert({
    user_id: userData.user.id,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) throw error;
  return 'enabled';
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => false);
}

// ─── Text message reminders (verified phone) ───

export interface SmsState {
  phoneLast4: string | null;
  verified: boolean;
  reminders: boolean;
}

export async function getSmsState(): Promise<SmsState> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { phoneLast4: null, verified: false, reminders: false };
  const { data } = await supabase.from('notification_preferences')
    .select('sms_phone, sms_phone_verified, sms_election_reminders').eq('user_id', userData.user.id).maybeSingle();
  return {
    phoneLast4: data?.sms_phone ? String(data.sms_phone).slice(-4) : null,
    verified: !!data?.sms_phone_verified,
    reminders: !!data?.sms_election_reminders,
  };
}

export type SmsResult = { status: 'sent' | 'verified' | 'invalid_phone' | 'too_many' | 'send_failed' | 'expired' | 'wrong_code' | 'not_configured' | 'unauthorized' | 'error'; phoneLast4?: string };

async function smsCall(body: object): Promise<SmsResult> {
  const { data, error } = await supabase.functions.invoke<SmsResult>('sms-optin', { body });
  if (data?.status) return data;
  // Non-2xx responses still carry a status in the body.
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { const b = await ctx.json(); if (b?.status) return b; } catch { /* not JSON */ }
  }
  return { status: 'error' };
}

export const startSmsVerification = (phone: string) => smsCall({ action: 'start', phone });
export const confirmSmsCode = (code: string) => smsCall({ action: 'confirm', code });

export async function setSmsReminders(on: boolean): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error('Not signed in.');
  const { error } = await supabase.from('notification_preferences').update({ sms_election_reminders: on }).eq('user_id', userData.user.id);
  if (error) throw error;
}

export async function removeSmsPhone(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error('Not signed in.');
  const { error } = await supabase.from('notification_preferences').update({ sms_phone: null }).eq('user_id', userData.user.id);
  if (error) throw error;
}
