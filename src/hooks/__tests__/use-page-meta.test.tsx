import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { usePageMeta } from '@/hooks/use-page-meta';

function TestComponent({ title, description }: { title?: string; description?: string }) {
  usePageMeta({ title, description });
  return null;
}

describe('usePageMeta', () => {
  afterEach(() => cleanup());

  it('sets a per-page title and description instead of leaving the generic default', () => {
    render(<TestComponent title="Jane Doe (Democratic)" description="See Jane Doe's positions." />);

    expect(document.title).toBe('Jane Doe (Democratic) | BallotLens');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe("See Jane Doe's positions.");
  });

  it('falls back to the site default when no title is given', () => {
    render(<TestComponent />);
    expect(document.title).toContain('BallotLens');
    expect(document.title).not.toContain('undefined');
  });

  it('restores the site default title on unmount, so navigating away leaves nothing stale', () => {
    const { unmount } = render(<TestComponent title="Some Candidate" />);
    expect(document.title).toBe('Some Candidate | BallotLens');

    unmount();

    expect(document.title).not.toContain('Some Candidate');
    expect(document.title).toContain('BallotLens');
  });
});
