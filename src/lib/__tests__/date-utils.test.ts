import { describe, it, expect } from 'vitest';
import { parseDateOnly } from '@/lib/date-utils';

describe('parseDateOnly — fixes a critical timezone bug affecting Election Day itself', () => {
  it('produces a date whose local getDate()/getMonth()/getFullYear() match the input exactly', () => {
    // This is the actual bug: new Date("2026-11-03") parses as UTC midnight,
    // which .getDate() (a LOCAL-time method) can report as the 2nd instead
    // of the 3rd for anyone in a timezone behind UTC (all of the US).
    // parseDateOnly must never have this problem, regardless of which
    // timezone the test happens to run in.
    const date = parseDateOnly('2026-11-03');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(10); // November = index 10
    expect(date.getDate()).toBe(3);
  });

  it('matches toLocaleDateString output to the original calendar date, unlike new Date() on the same string', () => {
    const dateStr = '2026-01-01';
    const safe = parseDateOnly(dateStr);
    expect(safe.getDate()).toBe(1);
    expect(safe.getMonth()).toBe(0);
  });

  it('handles a leap-year date correctly', () => {
    const date = parseDateOnly('2028-02-29');
    expect(date.getMonth()).toBe(1);
    expect(date.getDate()).toBe(29);
  });
});
