import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * The dialog every page hand-rolled. Before this, a modal was a bare
 * `<div className="fixed inset-0 …">`: Escape did nothing, focus stayed behind the
 * overlay (so a screen reader read the page underneath), the background scrolled, and
 * clicking outside sometimes closed it and sometimes didn't.
 *
 * Handles: focus trap + restore, Escape, scroll lock, overlay click, aria wiring, and
 * an optional `onBeforeClose` veto so a dirty form can ask before it disappears.
 */
export default function Modal({
  open, onClose, title, description, children, footer,
  size = "md", closeOnOverlay = true, onBeforeClose,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  closeOnOverlay?: boolean;
  /** Return false to keep the dialog open (e.g. "you have unsaved changes"). */
  onBeforeClose?: () => boolean | Promise<boolean>;
}) {
  const panelRef   = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId    = useRef(`m${Math.random().toString(36).slice(2, 9)}`).current;

  const attemptClose = async () => {
    if (onBeforeClose && (await onBeforeClose()) === false) return;
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement;

    // Lock the page behind the dialog without the layout jumping as the scrollbar goes.
    const prevOverflow = document.body.style.overflow;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    // Focus the first sensible control, not the panel itself, so typing starts working.
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [autofocus]"
      );
      (first ?? panelRef.current)?.focus();
    }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); void attemptClose(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      // Trap Tab inside the panel — otherwise focus walks into the page behind it.
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);

    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = "";
      restoreRef.current?.focus?.();
    };
    // attemptClose is stable enough for this lifecycle; re-running on every render would
    // thrash the focus timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const width = { sm: "max-w-sm", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl", full: "max-w-[96vw]" }[size];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 overflow-y-auto py-8 px-4 animate-fade-in"
      onMouseDown={(e) => { if (closeOnOverlay && e.target === e.currentTarget) void attemptClose(); }}
      data-no-print
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full ${width} outline-none animate-scale-in my-auto`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[var(--color-border)]">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold truncate">{title}</h2>
            {description && <p className="text-xs text-[var(--color-muted)] mt-0.5">{description}</p>}
          </div>
          <button
            type="button" onClick={() => void attemptClose()} aria-label="Close dialog"
            className="shrink-0 p-1 -m-1 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
