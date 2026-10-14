// Lets a scheduled job (Supabase Cron via pg_net) call an admin-only function
// without a signed-in admin: it sends the shared CRON_SECRET in the
// "x-cron-secret" header. Without CRON_SECRET set, cron calls are refused.

/** Constant-time string comparison (no early exit on the first difference). */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isCronRequest(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const sent = req.headers.get("x-cron-secret") ?? "";
  return secret.length >= 32 && same(sent, secret);
}
