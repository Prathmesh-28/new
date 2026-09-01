import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-sm outline-none transition-colors " +
  "focus:border-[var(--color-primary)] disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * Label + required marker + help text + error, wired to the control with real
 * htmlFor/aria-describedby/aria-invalid. Before this, forms across the product had no
 * required markers, no field-level help and no inline errors — a failed save produced a
 * toast with no indication of WHICH field was wrong.
 */
export function Field({
  label, required, help, error, htmlFor, children, className, hint,
}: {
  label: string; required?: boolean; help?: string; error?: string | null;
  htmlFor?: string; children: ReactNode; className?: string; hint?: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-[var(--color-muted)]">
          {label}
          {required && <span className="text-red-400 ml-0.5" aria-hidden="true">*</span>}
          {required && <span className="sr-only"> (required)</span>}
        </label>
        {hint}
      </div>
      {children}
      {error
        ? <p className="text-[11px] text-red-400 flex items-center gap-1"><AlertCircle size={11} />{error}</p>
        : help ? <p className="text-[11px] text-[var(--color-muted)]">{help}</p> : null}
    </div>
  );
}

/** Input already wired into a Field — the common case, one line. */
export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & {
  label: string; help?: string; error?: string | null; hint?: ReactNode; wrapClass?: string;
}>(function TextField({ label, help, error, hint, wrapClass, className, id, required, ...rest }, ref) {
  const auto = useId();
  const fieldId = id || auto;
  return (
    <Field label={label} required={required} help={help} error={error} htmlFor={fieldId} hint={hint} className={wrapClass}>
      <input
        ref={ref} id={fieldId} required={required}
        aria-invalid={!!error} aria-describedby={error ? `${fieldId}-err` : undefined}
        className={cn(CONTROL, error ? "border-red-500/60" : "border-[var(--color-border)]", className)}
        {...rest}
      />
    </Field>
  );
});

export const SelectField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & {
  label: string; help?: string; error?: string | null; wrapClass?: string;
}>(function SelectField({ label, help, error, wrapClass, className, id, required, children, ...rest }, ref) {
  const auto = useId();
  const fieldId = id || auto;
  return (
    <Field label={label} required={required} help={help} error={error} htmlFor={fieldId} className={wrapClass}>
      <select
        ref={ref} id={fieldId} required={required} aria-invalid={!!error}
        className={cn(CONTROL, error ? "border-red-500/60" : "border-[var(--color-border)]", className)}
        {...rest}
      >{children}</select>
    </Field>
  );
});

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string; help?: string; error?: string | null; wrapClass?: string;
}>(function TextAreaField({ label, help, error, wrapClass, className, id, required, ...rest }, ref) {
  const auto = useId();
  const fieldId = id || auto;
  return (
    <Field label={label} required={required} help={help} error={error} htmlFor={fieldId} className={wrapClass}>
      <textarea
        ref={ref} id={fieldId} required={required} aria-invalid={!!error}
        className={cn(CONTROL, "resize-y min-h-[72px]", error ? "border-red-500/60" : "border-[var(--color-border)]", className)}
        {...rest}
      />
    </Field>
  );
});

/**
 * The summary a failed form needs: what went wrong, in one place, with a link to the
 * first bad field. Rendered at the top of the form so it is the first thing focus and a
 * screen reader reach after a failed submit.
 */
export function ErrorSummary({ errors, onFocusField }: { errors: Record<string, string>; onFocusField?: (k: string) => void }) {
  const keys = Object.keys(errors).filter((k) => errors[k]);
  if (!keys.length) return null;
  return (
    <div role="alert" tabIndex={-1} className="rounded-lg border border-red-500/40 bg-red-950/20 px-4 py-3">
      <p className="text-xs font-semibold text-red-300 flex items-center gap-1.5">
        <AlertCircle size={13} />
        {keys.length === 1 ? "There's a problem with one field" : `There are problems with ${keys.length} fields`}
      </p>
      <ul className="mt-2 space-y-1">
        {keys.map((k) => (
          <li key={k}>
            <button type="button" onClick={() => onFocusField?.(k)}
              className="text-[11px] text-red-300/90 hover:text-red-200 hover:underline text-left">
              {errors[k]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
