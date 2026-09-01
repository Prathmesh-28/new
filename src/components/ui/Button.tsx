import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:   "bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold hover:opacity-90",
  secondary: "border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-accent)]",
  ghost:     "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)]",
  danger:    "bg-red-500/90 text-white font-semibold hover:bg-red-500",
  link:      "text-[var(--color-primary)] hover:underline px-0 py-0",
};
const SIZE: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5 gap-1.5",
  md: "text-sm px-4 py-2 gap-2",
  lg: "text-sm px-5 py-2.5 gap-2",
};

/**
 * One button. The audit found every page inventing its own — different paddings, no
 * disabled styling, no busy state, and nothing stopping a double-click from firing a
 * payment twice. `loading` disables AND shows why, which is the actual fix for
 * double-submits at the UI layer (the server side is the Idempotency-Key contract).
 */
const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode; block?: boolean;
}>(function Button({ variant = "secondary", size = "md", loading, icon, block, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANT[variant], SIZE[size], block && "w-full", className
      )}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

export default Button;
