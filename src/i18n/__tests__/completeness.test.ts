import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import es from '@/i18n/locales/es';
import pt from '@/i18n/locales/pt';
import ht from '@/i18n/locales/ht';
import ru from '@/i18n/locales/ru';

/** Every string passed to t('...') anywhere in src/ must exist in every language. */
function collectKeys(): Set<string> {
  const root = path.resolve(__dirname, '../..');
  const keys = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'locales') walk(p); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      if (!src.includes("from '@/i18n'")) continue;
      const sf = ts.createSourceFile(p, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ['t', 'msg'].includes(n.expression.getText(sf))) {
          const a = n.arguments[0];
          if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) keys.add(a.text);
        }
        // msg('...') marks data strings that are translated where rendered.
        // label-like fields in objects (menus, badges, profile fields) are passed through t() where rendered
        if (ts.isPropertyAssignment(n) && ['label', 'description', 'desc', 'cta', 'heading', 'subtitle'].includes(n.name.getText(sf))
            && ts.isStringLiteral(n.initializer) && /[A-Za-z]{2}/.test(n.initializer.text)) keys.add(n.initializer.text);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  };
  walk(root);
  return keys;
}

/** User-facing sentences passed as plain string props (subtitle="...", desc="...")
 * in translated files bypass t(); this caught several the wrapper missed. */
function untranslatedProps(): string[] {
  const root = path.resolve(__dirname, '../..');
  const SKIP = new Set(['className', 'href', 'to', 'src', 'type', 'variant', 'size', 'id', 'name', 'value', 'key', 'role', 'htmlFor', 'autoComplete', 'inputMode', 'pattern', 'target', 'rel', 'side', 'align', 'defaultValue', 'd', 'viewBox', 'points', 'transform', 'fill', 'stroke']);
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!['__tests__', 'locales', 'ui'].includes(e.name)) walk(p); continue; }
      if (!e.name.endsWith('.tsx')) continue;
      const src = fs.readFileSync(p, 'utf8');
      if (!src.includes("from '@/i18n'")) continue;
      const sf = ts.createSourceFile(p, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node) => {
        if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer)) {
          const name = n.name.getText(sf), v = n.initializer.text;
          if (!SKIP.has(name) && /^[A-Z]/.test(v) && /\s/.test(v)) found.push(`${path.relative(root, p)}: ${name}="${v}"`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  };
  walk(root);
  return found;
}

describe('translations are complete', () => {
  it('no user-facing sentence is passed as a plain string prop in translated files', () => {
    expect(untranslatedProps()).toEqual([]);
  });
  const keys = collectKeys();
  it('found the translated strings', () => expect(keys.size).toBeGreaterThan(300));
  for (const [lang, dict] of Object.entries({ es, pt, ht, ru })) {
    it(`${lang} has every string`, () => {
      expect([...keys].filter((k) => !(k in dict))).toEqual([]);
    });
    it(`${lang} keeps {placeholders} intact`, () => {
      const bad = Object.entries(dict).filter(([k, v]) => {
        const want = (k.match(/\{\w+\}/g) ?? []).sort().join();
        return want !== (v.match(/\{\w+\}/g) ?? []).sort().join();
      });
      expect(bad).toEqual([]);
    });
  }
});
