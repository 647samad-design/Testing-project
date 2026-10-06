/**
 * Site translations.
 *
 * Strings are written in English in the code and wrapped in t('...'). The
 * English text is the lookup key, so a string missing from a language simply
 * shows in English instead of breaking. Non-English dictionaries are loaded
 * only when that language is chosen.
 *
 * Changing language re-mounts the page tree (see I18nProvider), so every t()
 * call re-renders in the new language without each component subscribing.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LanguageName } from '@/types';
import { langFromPath, currentUrlIn } from './routing';

type Dict = Record<string, string>;
const loaders: Record<Exclude<LanguageName, 'en'>, () => Promise<{ default: Dict }>> = {
  es: () => import('./locales/es'),
  pt: () => import('./locales/pt'),
  ht: () => import('./locales/ht'),
  ru: () => import('./locales/ru'),
};
export const SUPPORTED: LanguageName[] = ['en', 'es', 'pt', 'ht', 'ru'];
export const LANGUAGE_EVENT = 'app:language';

let current: LanguageName = 'en';
let dict: Dict = {};

/** Translate an English source string, filling {placeholders} from vars. */
export function t(source: string, vars?: Record<string, string | number>): string {
  const text = (current !== 'en' && dict[source]) || source;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Marks a string defined in data (plan features, menus) for translation.
 * Returns it unchanged; translate it with t() where it is rendered. */
export const msg = (source: string): string => source;

export function currentLanguage(): LanguageName {
  return current;
}

function initialLanguage(): LanguageName {
  // The URL decides: /es/... is Spanish for everyone, including search engines.
  const fromUrl = langFromPath(window.location.pathname);
  let saved: LanguageName | null = null;
  try { saved = localStorage.getItem('ballotlens_lang') as LanguageName | null; } catch { /* storage unavailable */ }
  if (fromUrl !== 'en') {
    try { localStorage.setItem('ballotlens_lang', fromUrl); } catch { /* ignore */ }
    return fromUrl;
  }
  // An unprefixed URL for someone who chose another language: send them to it.
  // (Crawlers have no saved choice, so they always get the English page here.)
  if (saved && saved !== 'en' && SUPPORTED.includes(saved)) {
    window.location.replace(currentUrlIn(saved));
    return saved;
  }
  return 'en';
}

const I18nContext = createContext<{ lang: LanguageName }>({ lang: 'en' });
export const useLanguage = () => useContext(I18nContext).lang;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<LanguageName>(initialLanguage);
  const [ready, setReady] = useState<LanguageName>('en');

  useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<LanguageName>).detail;
      if (!SUPPORTED.includes(next)) return;
      // Each language has its own URL; switching moves to the same page there.
      if (next !== langFromPath(window.location.pathname)) {
        window.location.assign(currentUrlIn(next));
        return;
      }
      setLang(next);
    };
    window.addEventListener(LANGUAGE_EVENT, onChange);
    return () => window.removeEventListener(LANGUAGE_EVENT, onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    document.documentElement.setAttribute('lang', lang);
    if (lang === 'en') {
      current = 'en'; dict = {}; setReady('en');
      return;
    }
    loaders[lang]().then((m) => {
      if (cancelled) return;
      dict = m.default; current = lang; setReady(lang);
    }).catch(() => { /* keep English if a dictionary fails to load */ });
    return () => { cancelled = true; };
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang: ready }}>
      {/* key: re-mount on language change so every t() re-evaluates */}
      <div key={ready} style={{ display: 'contents' }}>{children}</div>
    </I18nContext.Provider>
  );
}
