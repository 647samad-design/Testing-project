import { useEffect } from 'react';

const DEFAULT_TITLE = 'BallotLens — See your ballot. Know your candidates. Follow the evidence.';
const DEFAULT_DESCRIPTION = 'BallotLens helps you research the candidates, issues and decisions that will appear on your ballot — using information and evidence from reliable sources.';

interface PageMetaOptions {
  title?: string;
  description?: string;
  /** Absolute or relative image URL for social sharing (og:image). */
  image?: string;
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

/**
 * Sets a per-page <title>, meta description, and Open Graph/Twitter tags —
 * without this, every single page in the app (candidate profiles, ballot
 * measures, stories, elections) shared the exact same generic homepage
 * title and description, so none of them were individually discoverable or
 * distinguishable in search results or social shares. Restores the site
 * defaults on unmount so navigating to a page without its own meta doesn't
 * leave a stale title behind.
 */
export function usePageMeta({ title, description, image }: PageMetaOptions) {
  useEffect(() => {
    const fullTitle = title ? `${title} | BallotLens` : DEFAULT_TITLE;
    const desc = description ?? DEFAULT_DESCRIPTION;

    document.title = fullTitle;
    setMetaTag('name', 'description', desc);
    setMetaTag('property', 'og:title', title ?? 'BallotLens');
    setMetaTag('property', 'og:description', desc);
    setMetaTag('name', 'twitter:title', title ?? 'BallotLens');
    setMetaTag('name', 'twitter:description', desc);
    if (image) {
      setMetaTag('property', 'og:image', image);
    }

    return () => {
      document.title = DEFAULT_TITLE;
      setMetaTag('name', 'description', DEFAULT_DESCRIPTION);
      setMetaTag('property', 'og:title', 'BallotLens — See your ballot. Know your candidates.');
      setMetaTag('property', 'og:description', DEFAULT_DESCRIPTION);
      setMetaTag('name', 'twitter:title', 'BallotLens — See your ballot. Know your candidates.');
      setMetaTag('name', 'twitter:description', DEFAULT_DESCRIPTION);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, image]);
}
