import { currentLanguage } from '@/i18n';
import { ALL_LANGS, pathIn } from '@/i18n/routing';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// The live site's address: set VITE_SITE_URL in the hosting settings once the
// domain is final; otherwise the address the page was opened from.
const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
const DEFAULT_TITLE = 'Gov Search App — See your ballot. Know your candidates. Follow the evidence.';
const DEFAULT_DESCRIPTION = 'Gov Search App helps you research the candidates, issues and decisions that will appear on your ballot — using information and evidence from reliable sources.';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

interface PageMetaOptions {
  title?: string;
  description?: string;
  /** Absolute or relative image URL for social sharing (og:image). */
  image?: string;
  /** Set true for private, user-specific, or duplicate-content pages
   * (account, admin, messages, candidate portal, sign-in) that should never
   * show up in search results — without this, every page in the app was
   * indexable by default, including pages that only make sense to the
   * signed-in user viewing them. */
  noindex?: boolean;
  /** Page exists only in English (legal pages): canonical is the English URL in every language, no hreflang. */
  englishOnly?: boolean;
  /** Structured data (schema.org) for this specific page — e.g. a Person
   * schema for a candidate profile, or a NewsArticle schema for a story.
   * Passed as a plain object; JSON-stringified into a <script type="application/ld+json">. */
  structuredData?: Record<string, unknown>;
}

function setMetaTag(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function removeMetaTag(attr: 'name' | 'property', key: string) {
  document.querySelector(`meta[${attr}="${key}"]`)?.remove();
}

function setCanonical(url: string) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
}

const OG_LOCALE: Record<string, string> = { en: 'en_US', es: 'es_US', pt: 'pt_BR', ht: 'ht_HT', ru: 'ru_RU' };

/** <link rel="alternate" hreflang> for every language version of this page,
 * plus x-default (English), so search engines show each reader their language. */
function setAlternates(path: string | null) {
  document.querySelectorAll('link[rel="alternate"][data-hreflang]').forEach((el) => el.remove());
  if (path === null) return;
  const add = (hreflang: string, href: string) => {
    const el = document.createElement('link');
    el.setAttribute('rel', 'alternate');
    el.setAttribute('hreflang', hreflang);
    el.setAttribute('href', href);
    el.setAttribute('data-hreflang', '');
    document.head.appendChild(el);
  };
  for (const l of ALL_LANGS) add(l, `${SITE_URL}${pathIn(l, path)}`);
  add('x-default', `${SITE_URL}${pathIn('en', path)}`);
}

const STRUCTURED_DATA_ID = 'page-structured-data';

function setStructuredData(data: Record<string, unknown> | undefined) {
  const existing = document.getElementById(STRUCTURED_DATA_ID);
  existing?.remove();
  if (!data) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = STRUCTURED_DATA_ID;
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

/**
 * Sets a per-page <title>, meta description, canonical URL, robots
 * directive, Open Graph/Twitter tags, and optional structured data.
 *
 * Two real bugs this fixes, not just "adds titles":
 * 1. Every single page shared the exact same generic homepage title and
 *    description (candidate profiles, ballot measures, stories, elections
 *    were all indistinguishable in search results or social shares).
 * 2. The canonical URL was hardcoded to the homepage in index.html and
 *    never updated per route — every page on the entire site was telling
 *    Google "the real version of this page is the homepage," which
 *    actively suppresses every other page from being indexed at all, the
 *    opposite of what a canonical tag should do for genuinely distinct pages.
 *
 * Restores the site defaults on unmount so navigating to a page without its
 * own meta doesn't leave a stale title, noindex flag, or structured data
 * block behind.
 */
export function usePageMeta({ title, description, image, noindex, englishOnly, structuredData }: PageMetaOptions) {
  const location = useLocation();

  useEffect(() => {
    const fullTitle = title ? `${title} | Gov Search App` : DEFAULT_TITLE;
    const desc = description ?? DEFAULT_DESCRIPTION;
    // location.pathname has the language prefix removed by the router basename;
    // put it back so a Spanish page's canonical is the Spanish URL (otherwise it
    // pointed Google at the English page and the translation was never indexed).
    const lang = currentLanguage();
    const canonicalUrl = `${SITE_URL}${pathIn(englishOnly ? 'en' : lang, location.pathname)}`;
    const ogImage = image ?? DEFAULT_OG_IMAGE;

    document.title = fullTitle;
    setMetaTag('name', 'description', desc);
    setCanonical(canonicalUrl);
    setAlternates(noindex || englishOnly ? null : location.pathname);
    setMetaTag('property', 'og:locale', OG_LOCALE[lang]);
    setMetaTag('property', 'og:url', canonicalUrl);
    setMetaTag('property', 'og:title', title ?? 'Gov Search App');
    setMetaTag('property', 'og:description', desc);
    setMetaTag('property', 'og:image', ogImage);
    setMetaTag('name', 'twitter:title', title ?? 'Gov Search App');
    setMetaTag('name', 'twitter:description', desc);
    setMetaTag('name', 'twitter:image', ogImage);

    if (noindex) {
      setMetaTag('name', 'robots', 'noindex, nofollow');
    } else {
      removeMetaTag('name', 'robots');
    }

    setStructuredData(structuredData);

    return () => {
      document.title = DEFAULT_TITLE;
      setMetaTag('name', 'description', DEFAULT_DESCRIPTION);
      setCanonical(`${SITE_URL}/`);
      setMetaTag('property', 'og:url', `${SITE_URL}/`);
      setMetaTag('property', 'og:title', 'Gov Search App — See your ballot. Know your candidates.');
      setMetaTag('property', 'og:description', DEFAULT_DESCRIPTION);
      setMetaTag('property', 'og:image', DEFAULT_OG_IMAGE);
      setMetaTag('name', 'twitter:title', 'Gov Search App — See your ballot. Know your candidates.');
      setMetaTag('name', 'twitter:description', DEFAULT_DESCRIPTION);
      setMetaTag('name', 'twitter:image', DEFAULT_OG_IMAGE);
      removeMetaTag('name', 'robots');
      setStructuredData(undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, image, noindex, JSON.stringify(structuredData), location.pathname]);
}
