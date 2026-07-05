import { useState, useEffect } from "react";

// C7 (2026-07 gap audit): a consistent currency-formatted input — a ₹ prefix always
// visible, and Indian lakh/crore comma grouping shown once the field isn't focused (typing
// "1234567" and tabbing away shows "12,34,567"), reusing the same en-IN grouping
// formatCurrency/formatAmount already use for display elsewhere. Emits a plain number via
// onChange (not a formatted string) — a drop-in replacement for a bare numeric
// `<input type="number">` at the state-management layer.
const groupIndian = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

export default function CurrencyInput({
  value, onChange, required, label, placeholder, className, id, min,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  min?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(value != null ? String(value) : "");

  // Keep the raw edit buffer in sync when the value changes from OUTSIDE this input
  // (e.g. a parent resets the form) — but never while the user is actively typing in it.
  useEffect(() => { if (!focused) setRaw(value != null ? String(value) : ""); }, [value, focused]);

  const display = focused ? raw : (value != null ? groupIndian(value) : "");

  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-xs text-[var(--color-muted)] block mb-1">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] text-sm pointer-events-none">₹</span>
        <input
          id={id} type="text" inputMode="decimal" required={required} placeholder={placeholder}
          value={display}
          onFocus={() => { setFocused(true); setRaw(value != null ? String(value) : ""); }}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || /^\d*\.?\d*$/.test(v)) setRaw(v);
          }}
          onBlur={() => {
            setFocused(false);
            const n = parseFloat(raw);
            const clamped = Number.isFinite(n) ? (min != null ? Math.max(min, n) : n) : null;
            onChange(clamped);
          }}
          className={className ?? "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg pl-7 pr-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"}
        />
      </div>
    </div>
  );
}
