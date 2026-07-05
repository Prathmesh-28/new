import { Radio, FlaskConical, Sparkles } from "lucide-react";

// C6 (2026-07 gap audit): a single, consistently-styled way to tell a user whether a
// number/result on screen is live data, an illustrative/indicative projection, or a
// simulated preview — previously ~38 feature files each spelled this out in ad hoc
// inline text ("Indicative only", "Simulated"), with no shared visual language. This is
// deliberately NOT the same thing as PreviewBadge (that's an action — "connect a partner
// to switch this on"); DataFreshnessBadge is a passive classification that sits next to
// a number so the user can tell at a glance what kind of number it is.
export type DataFreshness = "live" | "indicative" | "simulated";

const STYLE: Record<DataFreshness, { label: string; icon: typeof Radio; color: string; bg: string; border: string; title: string }> = {
  live: {
    label: "Live", icon: Radio, color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)",
    title: "Computed from your real, connected data.",
  },
  indicative: {
    label: "Indicative", icon: FlaskConical, color: "#C9A227", bg: "rgba(201,162,39,0.12)", border: "rgba(201,162,39,0.35)",
    title: "An illustrative projection or estimate — a planning aid, not a live or filed figure.",
  },
  simulated: {
    label: "Simulated", icon: Sparkles, color: "#8b5cf6", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.35)",
    title: "A preview built on sample/simulated data — not yet connected to a live source.",
  },
};

export default function DataFreshnessBadge({ kind, note, className }: { kind: DataFreshness; note?: string; className?: string }) {
  const s = STYLE[kind];
  const Icon = s.icon;
  return (
    <span
      title={note ? `${s.title} ${note}` : s.title}
      className={className}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle",
        fontSize: 11, fontWeight: 600, lineHeight: 1, padding: "3px 7px", borderRadius: 999,
        color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: "nowrap",
      }}
    >
      <Icon size={11} /> {s.label}
    </span>
  );
}
