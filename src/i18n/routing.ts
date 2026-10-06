/**
 * Language in the URL, for search engines: English lives at the root
 * (/candidates); other languages under a prefix (/es/candidates, /ru/...).
 * The router's basename is set to the prefix, so every <Link> and navigate()
 * inside the app keeps the language automatically.
 */
import type { LanguageName } from '@/types';

export const URL_LANGS: LanguageName[] = ['es', 'pt', 'ht', 'ru'];
export const ALL_LANGS: LanguageName[] = ['en', ...URL_LANGS];

/** The language encoded in a pathname ('/es/candidates' -> 'es'; '/candidates' -> 'en'). */
export function langFromPath(pathname: string): LanguageName {
  const seg = pathname.split('/')[1] as LanguageName;
  return URL_LANGS.includes(seg) ? seg : 'en';
}

/** Router basename for a language: '' for English, '/es' for Spanish, ... */
export function basenameFor(lang: LanguageName): string {
  return lang === 'en' ? '' : `/${lang}`;
}

/** The pathname without any language prefix ('/es/candidates' -> '/candidates'). */
export function stripLang(pathname: string): string {
  const lang = langFromPath(pathname);
  if (lang === 'en') return pathname || '/';
  const rest = pathname.slice(lang.length + 1);
  return rest === '' ? '/' : rest;
}

/** A root-relative path in a given language ('/candidates', 'es' -> '/es/candidates'). */
export function pathIn(lang: LanguageName, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (lang === 'en') return clean;
  return clean === '/' ? `/${lang}` : `/${lang}${clean}`;
}

/** The current page's URL (path + query + hash) in another language. */
export function currentUrlIn(lang: LanguageName, loc: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location): string {
  return pathIn(lang, stripLang(loc.pathname)) + loc.search + loc.hash;
}
