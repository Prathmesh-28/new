import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

/* Honest empty-state — shown when a tenant genuinely has no data yet, instead of
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
