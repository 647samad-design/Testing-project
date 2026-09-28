/**
 * Extracts the real error message from a failed supabase.functions.invoke().
 *
 * When an edge function responds with a non-2xx status, supabase-js puts a
 * generic "Edge Function returned a non-2xx status code" in `error.message`
 * and keeps the actual Response in `error.context`. Every caller here used
 * `error.message`, so the specific reasons our functions return -- "You
 * already have an active plan...", "Could not cancel your subscription. Your
 * account was not deleted." -- never reached the user.
 */
export async function edgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).clone().json();
      if (body && typeof body.error === 'string' && body.error) return body.error;
    } catch {
      // not JSON -- fall through
    }
  }
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && message) return message;
  return fallback;
}
