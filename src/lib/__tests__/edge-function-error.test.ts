import { describe, it, expect } from 'vitest';
import { edgeFunctionErrorMessage } from '@/lib/edge-function-error';

function httpError(body: unknown, status = 409) {
  const err = new Error('Edge Function returned a non-2xx status code') as Error & { context?: Response };
  err.context = new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  return err;
}

describe('edgeFunctionErrorMessage', () => {
  it('returns the function\'s own error message instead of the generic non-2xx text', async () => {
    const msg = await edgeFunctionErrorMessage(httpError({ error: 'You already have an active plan.' }), 'fallback');
    expect(msg).toBe('You already have an active plan.');
  });

  it('can be called twice on the same error (reads a clone of the body)', async () => {
    const err = httpError({ error: 'Your account was not deleted.' }, 502);
    await edgeFunctionErrorMessage(err, 'x');
    expect(await edgeFunctionErrorMessage(err, 'x')).toBe('Your account was not deleted.');
  });

  it('falls back to error.message when the body is not JSON', async () => {
    const err = new Error('Network down') as Error & { context?: Response };
    err.context = new Response('<html>oops</html>', { status: 500 });
    expect(await edgeFunctionErrorMessage(err, 'fallback')).toBe('Network down');
  });

  it('uses the fallback for non-Error values', async () => {
    expect(await edgeFunctionErrorMessage(null, 'fallback')).toBe('fallback');
  });
});

describe('edgeFunctionErrorMessage with plain error objects', () => {
  it('reads message from a plain { message } object too', async () => {
    expect(await edgeFunctionErrorMessage({ message: 'Stripe not configured' }, 'fallback')).toBe('Stripe not configured');
  });
});
