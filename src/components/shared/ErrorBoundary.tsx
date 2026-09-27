import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Without this, the app had NO error boundary anywhere — a single
 * unexpected error thrown during render (a null field from an API
 * response, an edge case in a candidate's data, anything) would unmount
 * the entire component tree, leaving the user on a completely blank white
 * screen with no error message, no way to recover short of a manual page
 * refresh, and nothing logged anywhere to indicate what happened or where.
 * This catches render errors anywhere in the tree below it and shows a
 * recoverable fallback instead of a silent white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // At minimum, get this into the browser console / any error-monitoring
    // tool the deployment adds later (Sentry, etc.) — previously an error
    // here would just silently blank the screen with no trace anywhere.
    console.error('BallotLens: uncaught render error', error, errorInfo);
  }

  handleReload = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="font-display text-2xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mb-6">
              We hit an unexpected error loading this page. This has been logged — try reloading,
              and if it keeps happening, let us know.
            </p>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <Button onClick={() => window.location.reload()} className="gap-2 rounded-xl">
                <RefreshCw className="h-4 w-4" />
                Reload Page
              </Button>
              <Button variant="outline" onClick={this.handleReload} className="gap-2 rounded-xl">
                <Home className="h-4 w-4" />
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
