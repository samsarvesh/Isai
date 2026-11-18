import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, message: '' };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ISAI ErrorBoundary caught error:', error, info);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh w-full flex items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-primary)] p-6">
          <div className="max-w-md w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h1 className="text-base font-bold text-[var(--text-primary)]">Something went wrong</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)] break-words leading-relaxed">
              {this.state.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reload ISAI
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
