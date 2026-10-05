import { describe, it, expect } from 'vitest';
import { t } from '@/i18n';
describe('t()', () => {
  it('returns English when no language is loaded, and fills placeholders', () => {
    expect(t('My Ballot')).toBe('My Ballot');
    expect(t('in {days} days', { days: 3 })).toBe('in 3 days');
  });
});
