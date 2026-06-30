import { Component, type ReactNode, type ErrorInfo } from "react";
import { reportError } from "@/lib/reportError";
import { isChunkError, recoverFromChunkError } from "@/lib/chunkReload";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // A lazy chunk that 404s after a deploy isn't a real crash - reload once.
    if (isChunkError(error.message)) { recoverFromChunkError(); return; }
    reportError(error.message, error.stack ?? info.componentStack ?? undefined);
  }

  render() {
    if (!this.state.error) return this.props.children;
    // Stale-deploy chunk error → a reload is already in flight; show a calm spinner.
    if (isChunkError(this.state.error.message)) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center">
          <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-[var(--color-muted)]">Updating to the latest version…</p>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-4 text-2xl">⚠</div>
        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-sm text-[var(--color-muted)] mb-6 max-w-sm font-mono">
          {this.state.error.message}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-6 py-2.5 rounded-lg text-sm hover:opacity-90"
        >
          Reload page
        </button>
      </div>
    );
  }
}
