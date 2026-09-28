import { describe, it, expect } from 'vitest';
import { toStatePostal } from '@/lib/us-states';

describe('toStatePostal', () => {
  it('maps full names (any case) to postal codes', () => {
    expect(toStatePostal('Florida')).toBe('FL');
    expect(toStatePostal('new york')).toBe('NY');
    expect(toStatePostal('  District of Columbia ')).toBe('DC');
  });
  it('passes postal codes through, uppercased', () => {
    expect(toStatePostal('fl')).toBe('FL');
  });
  it('returns undefined for unknown or empty input', () => {
    expect(toStatePostal('Atlantis')).toBeUndefined();
    expect(toStatePostal(null)).toBeUndefined();
  });
});
