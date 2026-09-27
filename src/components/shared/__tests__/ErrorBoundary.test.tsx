import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

function Bomb(): never {
  throw new Error('Simulated render crash');
}

describe('ErrorBoundary — previously did not exist anywhere in the app', () => {
  afterEach(() => cleanup());

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>Everything is fine</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('Everything is fine')).toBeInTheDocument();
  });

  it('catches a render error and shows a recoverable fallback instead of crashing to a blank screen', () => {
    // Error boundaries log the error via componentDidCatch; suppress the
    // expected console.error noise from React + our own logging for this test.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Reload Page')).toBeInTheDocument();
    expect(screen.getByText('Go Home')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
