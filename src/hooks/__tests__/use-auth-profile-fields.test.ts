import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'node:fs';

/**
 * The profile the app keeps in memory comes from ONE select in use-auth. If a
 * field the UI reads isn't in that select, it's silently undefined: that is how
 * photo_url, bio, occupation and education were saved but never shown, and then
 * overwritten with blanks on the next save. Keep the select and the reads in sync.
 */
describe('use-auth loads every profile field the app reads', () => {
  const authSrc = fs.readFileSync(path.resolve(__dirname, '../use-auth.tsx'), 'utf8');
  const select = authSrc.match(/from\('profiles'\)[\s\S]*?\.select\('([^']+)'\)/)?.[1] ?? '';
  const loaded = new Set(select.split(',').map((s) => s.trim()));

  const srcRoot = path.resolve(__dirname, '../..');
  const files = (globSync as unknown as (p: string, o: { cwd: string }) => string[])('**/*.{ts,tsx}', { cwd: srcRoot })
    .filter((f) => !f.includes('__tests__'));
  const read = new Set<string>();
  for (const f of files) {
    const text = fs.readFileSync(path.join(srcRoot, f), 'utf8');
    for (const m of text.matchAll(/\bprofile\??\.([a-z_]+)/g)) read.add(m[1]);
  }

  it('found the select and some reads', () => {
    expect(loaded.size).toBeGreaterThan(3);
    expect(read.size).toBeGreaterThan(3);
  });

  it('every profile.<field> used in the app is loaded', () => {
    const missing = [...read].filter((f) => !loaded.has(f));
    expect(missing).toEqual([]);
  });
});
