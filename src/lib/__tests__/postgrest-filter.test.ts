import { describe, it, expect } from 'vitest';
import { pgrstQuote } from '@/lib/postgrest-filter';

describe('pgrstQuote', () => {
  it('wraps values so commas and parentheses stay inside one condition', () => {
    expect(pgrstQuote('%Miami, FL%')).toBe('"%Miami, FL%"');
    expect(pgrstQuote('x),id.neq.(null')).toBe('"x),id.neq.(null"');
  });
  it('escapes embedded quotes and backslashes', () => {
    expect(pgrstQuote('say "hi"')).toBe('"say \\"hi\\""');
    expect(pgrstQuote('a\\b')).toBe('"a\\\\b"');
  });
});
