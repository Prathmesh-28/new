import { Plug } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCapabilities, type CapabilityKey } from "@/context/CapabilitiesContext";

// Per-capability explanation — framed as "live data switches on when you connect",
// not "this is fake". Leads with what already works, then the one-time setup.
const COPY: Partial<Record<CapabilityKey, string>> = {
  bankSync:            "Add accounts manually now — or switch on automatic bank sync (Account Aggregator) anytime. One-time connect in Connectors.",
  creditDisbursement:  "Eligibility, offers and underwriting are live. Connect a lending partner to enable actual loan disbursement.",
  bnplPayout:          "Drawdowns are tracked live. Connect a payout partner to enable supplier payouts.",
  ewaPayout:           "Earned-wage amounts are live. Connect a payout partner to enable disbursement.",
  gstEInvoice:         "Generates a sample IRN now. Connect your GST Suvidha Provider to issue real IRNs — a one-time setup in Connectors.",
  lenderMarketplace:   "Showing sample lenders. The live two-sided marketplace switches on as lending partners onboard.",
  supplierMarketplace: "Showing sample early-pay offers. The live marketplace switches on as partners onboard.",
  treasurySweep:       "Idle-cash analysis is live. Connect a treasury partner to enable automated sweep enrolment.",
  kyc:                 "Connect a verification provider in Connectors to switch on live KYC checks.",
};

/**
 * Small "Set up" pill shown next to a feature whose live rail isn't connected
 * yet. It's an action, not a disclaimer: the feature is fully functional on a
 * realistic preview, and clicking takes the user to Connectors to switch on live
 * data. Renders nothing once the capability is live, so it disappears the moment
 * a partner key is configured.
 */
export default function PreviewBadge({ capability, className }: { capability: CapabilityKey; className?: string }) {
  const { caps, loaded } = useCapabilities();
  const navigate = useNavigate();
  if (!loaded || caps[capability]) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); navigate("/connectors"); }}
      title={`${COPY[capability] ?? "Fully functional on a realistic preview. Connect the partner in Connectors to switch on live data."} Click to set up.`}
      className={className}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle",
        fontSize: 11, fontWeight: 600, lineHeight: 1, padding: "3px 7px", borderRadius: 999,
        color: "#C9A227", background: "rgba(201,162,39,0.12)", border: "1px solid rgba(201,162,39,0.35)",
        cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      <Plug size={11} /> Set up
    </button>
  );
}
