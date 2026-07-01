import { useNavigate } from "react-router-dom";
import { AlertTriangle, RefreshCw, type LucideIcon } from "lucide-react";

/* Honest empty-state - shown when a tenant genuinely has no data yet, instead of
   fabricated sample rows. Optional CTA routes to the import/create flow. */
export default function EmptyState({
  icon: Icon, title, description, ctaText, ctaHref, onCta,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  ctaText?: string;
  ctaHref?: string;
  onCta?: () => void;
}) {
  const navigate = useNavigate();
  const handle = () => { if (onCta) onCta(); else if (ctaHref) navigate(ctaHref); };
  return (
    <div className="bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-lg px-6 py-12 text-center">
      <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center">
        <Icon size={22} className="text-[var(--color-primary)]" />
      </div>
      <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
      <p className="text-xs text-[var(--color-muted)] mt-1.5 max-w-sm mx-auto leading-relaxed">{description}</p>
      {(ctaText && (ctaHref || onCta)) && (
        <button onClick={handle}
          className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg hover:opacity-90">
          {ctaText}
        </button>
      )}
    </div>
  );
}

/* Loading skeleton - shimmer placeholder rows matching the shape of the content that's
   about to arrive, so the layout doesn't jump. Prefer this over a bare centred spinner. */
export function LoadingState({ rows = 4, label }: { rows?: number; label?: string }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4" role="status" aria-busy="true">
      {label && <p className="sr-only">{label}</p>}
      <div className="space-y-3 animate-pulse">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-border)]/60 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 rounded bg-[var(--color-border)]/60" style={{ width: `${70 - i * 8}%` }} />
              <div className="h-2.5 rounded bg-[var(--color-border)]/40" style={{ width: `${45 - i * 5}%` }} />
            </div>
            <div className="h-3 w-16 rounded bg-[var(--color-border)]/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* Error state - shown when a fetch fails, with a plain-language message and (optionally)
   a retry. Never a raw stack trace or a silent blank; tells the user what to do next. */
export function ErrorState({
  title = "Couldn't load this", message, onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-dashed border-red-800/40 rounded-lg px-6 py-10 text-center">
      <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-red-950/30 flex items-center justify-center">
        <AlertTriangle size={22} className="text-red-400" />
      </div>
      <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
      <p className="text-xs text-[var(--color-muted)] mt-1.5 max-w-sm mx-auto leading-relaxed">
        {message || "Something went wrong fetching this data. Check your connection and try again."}
      </p>
      {onRetry && (
        <button onClick={onRetry}
          className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold border border-[var(--color-border)] text-[var(--color-text)] px-4 py-2 rounded-lg hover:bg-[var(--color-accent)]">
          <RefreshCw size={13} /> Try again
        </button>
      )}
    </div>
  );
}
