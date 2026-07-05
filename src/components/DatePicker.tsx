import { format, parseISO, isValid } from "date-fns";
import { Calendar } from "lucide-react";

// C7 (2026-07 gap audit): a consistent, Indian-friendly date field. Wraps the native
// `<input type="date">` rather than reinventing a calendar widget — that keeps the real
// OS picker, full keyboard/mobile/screen-reader support, and the ISO value contract every
// existing call site already expects (value/onChange both plain "YYYY-MM-DD" strings, a
// drop-in replacement for a bare `<input type="date">`). What it actually fixes: browser
// date inputs display in whatever the OS locale says (dd/mm/yyyy vs mm/dd/yyyy is a real,
// silent misread risk) — an unambiguous "5 Jul 2026"-style label next to the field removes
// the ambiguity regardless of the visitor's locale, and `required` gets a consistent hint.
export default function DatePicker({
  value, onChange, required, label, className, min, max, id,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  label?: string;
  className?: string;
  min?: string;
  max?: string;
  id?: string;
}) {
  const parsed = value ? parseISO(value) : null;
  const readable = parsed && isValid(parsed) ? format(parsed, "d MMM yyyy") : null;

  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-xs text-[var(--color-muted)] block mb-1">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
        <input
          id={id} type="date" value={value} min={min} max={max} required={required}
          onChange={(e) => onChange(e.target.value)}
          className={className ?? "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"}
        />
      </div>
      {readable && <p className="text-[10px] text-[var(--color-muted)] mt-1">{readable}</p>}
    </div>
  );
}
