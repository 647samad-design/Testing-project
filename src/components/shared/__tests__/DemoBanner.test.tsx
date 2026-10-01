import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DemoBanner } from '@/components/shared/DemoBanner';

describe('DemoBanner — only when demo data is on screen', () => {
  beforeEach(() => localStorage.clear());

  it('is hidden by default (it used to tell voters real candidates were "fictional")', () => {
    const { container } = render(<DemoBanner compact />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows when the page says its data is demo', () => {
    render(<DemoBanner compact show />);
    expect(screen.getByRole('note')).toHaveTextContent(/DEMO DATA/);
  });

  it('shows everywhere in explicit demo mode', () => {
    localStorage.setItem('ballotlens_demo', 'true');
    render(<DemoBanner compact />);
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});
