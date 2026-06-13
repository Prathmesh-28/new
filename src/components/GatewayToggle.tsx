import type { Gateway } from "@/lib/billing";

/* Lets the user pick which payment gateway to upgrade through.
   Razorpay = India-first (UPI/cards/netbanking); Stripe = international cards.
   Unavailable gateways (no server keys) are shown disabled. */
export default function GatewayToggle({
  value, onChange, available,
}: {
  value: Gateway;
  onChange: (g: Gateway) => void;
  available?: { stripe: boolean; razorpay: boolean };
}) {
  const opts: { id: Gateway; label: string; sub: string }[] = [
    { id: "razorpay", label: "Razorpay", sub: "UPI · cards · netbanking" },
    { id: "stripe",   label: "Stripe",   sub: "International cards" },
  ];
  return (
    <div className="flex gap-2">
      {opts.map(o => {
        const enabled = !available || available[o.id];
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            disabled={!enabled}
            onClick={() => onChange(o.id)}
            className={`flex-1 rounded-lg border px-3 py-2 text-left transition ${
              active ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                     : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"
            } ${enabled ? "" : "opacity-40 cursor-not-allowed"}`}
          >
            <div className="text-xs font-semibold text-[var(--color-text)] flex items-center gap-1.5">
              {o.label}
              {active && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />}
            </div>
            <div className="text-[10px] text-[var(--color-muted)]">{enabled ? o.sub : "not configured"}</div>
          </button>
        );
      })}
    </div>
  );
}
