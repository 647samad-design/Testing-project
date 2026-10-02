import { describe, it, expect } from 'vitest';
import { safeUrl } from '@/lib/safe-url';

describe('safeUrl', () => {
  it('keeps http, https and mailto', () => {
    expect(safeUrl('https://www.nassauflpa.com/')).toBe('https://www.nassauflpa.com/');
    expect(safeUrl(' http://example.org/a?b=1 ')).toBe('http://example.org/a?b=1');
    expect(safeUrl('mailto:press@campaign.org')).toBe('mailto:press@campaign.org');
  });
  it('drops script and other schemes, including obfuscated ones', () => {
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd']) {
      expect(safeUrl(bad)).toBeUndefined();
    }
  });
  it('turns a bare domain into an https link', () => {
    expect(safeUrl('www.campaign.com')).toBe('https://www.campaign.com');
    expect(safeUrl('campaign.org/about')).toBe('https://campaign.org/about');
  });
  it('drops empty and relative values', () => {
    expect(safeUrl('')).toBeUndefined();
    expect(safeUrl(null)).toBeUndefined();
    expect(safeUrl('/admin')).toBeUndefined();
  });
});
