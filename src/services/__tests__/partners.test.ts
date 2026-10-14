import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { embedCode, SLUG_RE } from '@/services/partners';

describe('partner embed', () => {
  it('builds an iframe for the right language', () => {
    expect(embedCode('https://site.example', 'county-news', 'en')).toContain('src="https://site.example/embed?partner=county-news"');
    expect(embedCode('https://site.example', 'county-news', 'es')).toContain('src="https://site.example/es/embed?partner=county-news"');
  });
  it('accepts only safe slugs', () => {
    expect(SLUG_RE.test('county-news')).toBe(true);
    expect(SLUG_RE.test('-bad')).toBe(false);
    expect(SLUG_RE.test('a"><script>')).toBe(false);
  });
});
