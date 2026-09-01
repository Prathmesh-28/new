import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Drop-in replacement for <input type="password"> that adds a show/hide eye toggle.
 * Pass the same props (value, onChange, placeholder, className, required, …) - it
 * manages the type itself and reserves room on the right for the eye button.
 *
 * `showStrength` (Wave 18) adds the meter signup never had: people typed "ramesh123",
 * got accepted, and found out it was weak the day the account was phished. Heuristic on
 * purpose — length is weighted hardest because it is what actually resists cracking —
 * and it never blocks, only informs (the server owns the real policy).
 */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { score: 0, label: "" };
  let points = 0;
  if (pw.length >= 8) points++;
  if (pw.length >= 12) points++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) points++;
  if (/\d/.test(pw)) points++;
  if (/[^a-zA-Z0-9]/.test(pw)) points++;
  // The classics defeat everything above.
  if (/^(password|qwerty|123456|abc123|india|admin)/i.test(pw) || /^(.)\1+$/.test(pw)) points = 0;
  const score = (points <= 1 ? 1 : points <= 3 ? 2 : 3) as 1 | 2 | 3;
  return { score, label: score === 1 ? "Weak — a longer phrase beats symbols" : score === 2 ? "Okay — longer is stronger" : "Strong" };
}

export default function PasswordInput({ className, showStrength, ...props }: InputHTMLAttributes<HTMLInputElement> & { showStrength?: boolean }) {
  const [show, setShow] = useState(false);
  const strength = showStrength ? passwordStrength(String(props.value ?? "")) : null;
  const colors = ["", "bg-red-500", "bg-amber-400", "bg-[var(--color-primary)]"];
  return (
    <div>
      <div className="relative">
        <input {...props} type={show ? "text" : "password"} className={`${className ?? ""} pr-10`} />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {strength && strength.score > 0 && (
        <div className="mt-1.5" aria-live="polite">
          <div className="flex gap-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= strength.score ? colors[strength.score] : "bg-[var(--color-border)]"}`} />
            ))}
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-1">{strength.label}</p>
        </div>
      )}
    </div>
  );
}
