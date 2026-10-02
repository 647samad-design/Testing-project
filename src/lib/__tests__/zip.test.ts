import { describe, it, expect } from 'vitest';
import { extractZip } from '@/lib/zip';

describe('extractZip', () => {
  it('accepts 5-digit ZIPs, ZIP+4, padding, and addresses ending in a ZIP', () => {
    expect(extractZip('32034')).toBe('32034');
    expect(extractZip(' 32034 ')).toBe('32034');
    expect(extractZip('32034-1234')).toBe('32034');
    expect(extractZip('12 Main St, Fernandina Beach, FL 32034')).toBe('32034');
    expect(extractZip('Fernandina Beach, FL 32034-1234')).toBe('32034');
  });
  it('rejects things that are not ZIP codes', () => {
    for (const bad of ['abcde', '123', '00000', '320345', '', 'Florida', '3203a']) expect(extractZip(bad)).toBeNull();
  });
});
