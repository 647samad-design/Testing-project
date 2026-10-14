import { describe, it, expect } from 'vitest';
import { buildIcs } from '@/lib/ics';

describe('buildIcs', () => {
  const now = new Date('2026-10-15T10:00:00Z');
  it('creates an all-day Election Day event with a reminder', () => {
    const ics = buildIcs({ title: 'Vote: 2026 General Election', date: '2026-11-03', location: '1 Main St, Town, FL' }, now);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261103\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261104\r\n');
    expect(ics).toContain('LOCATION:1 Main St\\, Town\\, FL');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('escapes newlines and semicolons in the description', () => {
    const ics = buildIcs({ title: 'x', date: '2026-11-03', description: 'A; B\nC' }, now);
    expect(ics).toContain('DESCRIPTION:A\\; B\\nC');
  });
  it('folds long lines to 75 octets', () => {
    const ics = buildIcs({ title: 'x', date: '2026-11-03', description: 'Ñ'.repeat(200) }, now);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it('handles the month rollover for the end date', () => {
    expect(buildIcs({ title: 'x', date: '2026-12-31' }, now)).toContain('DTEND;VALUE=DATE:20270101');
  });
  it('rejects a bad date', () => {
    expect(() => buildIcs({ title: 'x', date: 'Nov 3' }, now)).toThrow();
  });
});
