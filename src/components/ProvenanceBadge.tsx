// C6 — tell users whether a number is real, illustrative, or a preview, so they
// never mistake an indicative calculator for live data.
const MAP = {
  live:       { text: "Live",       cls: "bg-green-900/30 text-green-400 border-green-800/40" },
  indicative: { text: "Indicative", cls: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" },
  preview:    { text: "Preview",    cls: "bg-purple-900/30 text-purple-400 border-purple-800/40" },
  sample:     { text: "Sample",     cls: "bg-blue-900/30 text-blue-400 border-blue-800/40" },
} as const;

export type Provenance = keyof typeof MAP;

export default function ProvenanceBadge({ kind, label }: { kind: Provenance; label?: string }) {
  const m = MAP[kind];
  return (
    <span className={`inline-flex items-center text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${m.cls}`}>
      {label || m.text}
    </span>
  );
}
