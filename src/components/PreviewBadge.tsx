import { FlaskConical } from "lucide-react";
import { useCapabilities, type CapabilityKey } from "@/context/CapabilitiesContext";

const COPY: Partial<Record<CapabilityKey, string>> = {
  bankSync:            "Live bank/account-aggregator sync activates once a data partner is connected. Until then, add accounts manually.",
  creditDisbursement:  "Offers and underwriting are real; actual loan disbursement activates once a lending partner is connected.",
  bnplPayout:          "Drawdowns are tracked, but supplier payouts activate once the payout partner is connected.",
  ewaPayout:           "Earned-wage amounts are real; disbursement activates once the payout partner is connected.",
  gstEInvoice:         "IRN/e-invoice generation uses a demo number until a GST Suvidha Provider is connected.",
  lenderMarketplace:   "Showing sample lenders. The live two-sided marketplace activates once lending partners are onboarded.",
  supplierMarketplace: "Showing sample early-pay offers. The live marketplace activates once partners are onboarded.",
  treasurySweep:       "Idle-cash analysis is real; automated sweep enrolment activates once a treasury partner is connected.",
  kyc:                 "KYC checks activate once a verification provider is connected.",
};

/**
 * Small "Preview" pill shown next to a feature whose backend rail isn't wired
 * yet (returns sample/demo data). Renders nothing once the capability is live,
 * so the badge disappears automatically the moment a partner key is configured.
 */
export default function PreviewBadge({ capability, className }: { capability: CapabilityKey; className?: string }) {
  const { caps, loaded } = useCapabilities();
  if (!loaded || caps[capability]) return null;
  return (
    <span
      title={COPY[capability] ?? "This feature is in preview and shows sample data."}
      className={className}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle",
        fontSize: 11, fontWeight: 600, lineHeight: 1, padding: "3px 7px", borderRadius: 999,
        color: "#C9A227", background: "rgba(201,162,39,0.12)", border: "1px solid rgba(201,162,39,0.35)",
        cursor: "help", whiteSpace: "nowrap",
      }}
    >
      <FlaskConical size={11} /> Preview
    </span>
  );
}
