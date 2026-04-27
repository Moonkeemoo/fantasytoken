import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Render-time crash safety net (INV-7 spirit on the client).
 * Without this, a throw during initial render shows an opaque white screen
 * — the worst kind of failure because there's nothing to debug from.
 *
 * Logs to console (visible in TG webview devtools / desktop dev mode) and
 * renders the message + stack so users can copy and report.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <main className="bg-tg-bg text-tg-text min-h-dvh p-4">
          <h1 className="text-lg font-semibold">Something broke</h1>
          <p className="text-tg-hint mt-2 text-sm">
            The app failed to render. Copy the details below and send to support.
          </p>
          <pre className="bg-tg-secondary-bg mt-4 overflow-auto rounded-lg p-3 text-xs">
            {this.state.error.name}: {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </main>
      );
    }
    return this.props.children;
  }
}
