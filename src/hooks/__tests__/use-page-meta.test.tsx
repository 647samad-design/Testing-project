import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { usePageMeta } from '@/hooks/use-page-meta';

function TestComponent({ title, description, noindex, structuredData }: {
  title?: string; description?: string; noindex?: boolean; structuredData?: Record<string, unknown>;
}) {
  usePageMeta({ title, description, noindex, structuredData });
  return null;
}

function renderAt(path: string, props: Parameters<typeof TestComponent>[0] = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TestComponent {...props} />
    </MemoryRouter>
  );
}

describe('usePageMeta', () => {
  afterEach(() => cleanup());

  it('sets a per-page title and description instead of leaving the generic default', () => {
    renderAt('/candidates/1', { title: 'Jane Doe (Democratic)', description: "See Jane Doe's positions." });

    expect(document.title).toBe('Jane Doe (Democratic) | BallotLens');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe("See Jane Doe's positions.");
  });

  it('falls back to the site default when no title is given', () => {
    renderAt('/');
    expect(document.title).toContain('BallotLens');
    expect(document.title).not.toContain('undefined');
  });

  it('restores the site default title on unmount, so navigating away leaves nothing stale', () => {
    const { unmount } = renderAt('/candidates/1', { title: 'Some Candidate' });
    expect(document.title).toBe('Some Candidate | BallotLens');

    unmount();

    expect(document.title).not.toContain('Some Candidate');
    expect(document.title).toContain('BallotLens');
  });

  it('sets the canonical link to the CURRENT path, not a hardcoded homepage URL', () => {
    renderAt('/candidates/42');
    const canonical = document.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe('https://ballotlens.com/candidates/42');
  });

  it('resets the canonical link back to the homepage on unmount', () => {
    const { unmount } = renderAt('/candidates/42');
    unmount();
    const canonical = document.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe('https://ballotlens.com/');
  });

  it('adds a noindex robots meta tag for private pages, previously every page was indexable by default', () => {
    renderAt('/account', { noindex: true });
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('does not add a robots meta tag for public pages', () => {
    renderAt('/candidates/1');
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('removes the noindex tag on unmount so navigating to a public page after a private one is not accidentally noindexed', () => {
    const { unmount } = renderAt('/account', { noindex: true });
    expect(document.querySelector('meta[name="robots"]')).not.toBeNull();
    unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('injects page-specific structured data (e.g. Person schema for a candidate)', () => {
    renderAt('/candidates/1', {
      structuredData: { '@context': 'https://schema.org', '@type': 'Person', name: 'Jane Doe' },
    });
    const script = document.getElementById('page-structured-data');
    expect(script).not.toBeNull();
    expect(JSON.parse(script!.textContent!)).toEqual({ '@context': 'https://schema.org', '@type': 'Person', name: 'Jane Doe' });
  });

  it('removes structured data on unmount', () => {
    const { unmount } = renderAt('/candidates/1', {
      structuredData: { '@context': 'https://schema.org', '@type': 'Person', name: 'Jane Doe' },
    });
    unmount();
    expect(document.getElementById('page-structured-data')).toBeNull();
  });
});
