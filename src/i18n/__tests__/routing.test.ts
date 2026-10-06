import { describe, it, expect } from 'vitest';
import { langFromPath, basenameFor, stripLang, pathIn, currentUrlIn } from '@/i18n/routing';

describe('language URLs', () => {
  it('reads the language from the first path segment', () => {
    expect(langFromPath('/es/candidates')).toBe('es');
    expect(langFromPath('/ru')).toBe('ru');
    expect(langFromPath('/candidates')).toBe('en');
    expect(langFromPath('/')).toBe('en');
    expect(langFromPath('/estimates')).toBe('en'); // not fooled by a word starting with "es"
  });
  it('builds basenames and paths', () => {
    expect(basenameFor('en')).toBe('');
    expect(basenameFor('pt')).toBe('/pt');
    expect(stripLang('/ht/ballot/123')).toBe('/ballot/123');
    expect(stripLang('/es')).toBe('/');
    expect(stripLang('/ballot')).toBe('/ballot');
    expect(pathIn('es', '/')).toBe('/es');
    expect(pathIn('es', '/candidates')).toBe('/es/candidates');
    expect(pathIn('en', '/candidates')).toBe('/candidates');
  });
  it('switches the current URL between languages, keeping query and hash', () => {
    const loc = { pathname: '/es/candidates/42', search: '?tab=votes', hash: '#top' };
    expect(currentUrlIn('ru', loc)).toBe('/ru/candidates/42?tab=votes#top');
    expect(currentUrlIn('en', loc)).toBe('/candidates/42?tab=votes#top');
  });
});
