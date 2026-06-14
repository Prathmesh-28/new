import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, monthlyBurn } from "@/lib/utils";
import { AlertTriangle, Bell, Info, CheckCircle2, X, Settings2 } from "lucide-react";
import { toast } from "sonner";

const SEV: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  critical: { color: "text-red-400",    bg: "bg-red-950/20 border-red-800/40",     icon: AlertTriangle, label: "Critical" },
  high:     { color: "text-orange-400", bg: "bg-orange-950/20 border-orange-800/40", icon: AlertTriangle, label: "High" },
  medium:   { color: "text-yellow-400", bg: "bg-yellow-950/20 border-yellow-800/40", icon: Bell,          label: "Warning" },
  low:      { color: "text-blue-400",   bg: "bg-blue-950/20 border-blue-800/40",     icon: Info,          label: "Info" },
};

export default function AlertsPage() {
  const { store, markAlertRead, deleteAlert, addAlert, updateFirm, resolveAlert } = useApp();
  const { alerts, transactions } = store;
  const safetyDays = store.firm.safetyThresholdDays ?? 14;

  const [tab,         setTab]         = useState<"active" | "history">("active");
  const [showConfig,  setShowConfig]  = useState(false);
  const [newThreshold, setNewThreshold] = useState(String(safetyDays));
  const [actionText,  setActionText]  = useState<Record<string, string>>({});

  const burn = monthlyBurn(transactions);
  const safetyBuffer = (burn / 30) * safetyDays;

  const active   = alerts.filter(a => !a.isRead).sort((a, b) => {
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4);
  });
  const history  = alerts.filter(a => a.isRead);

  const critical = active.filter(a => a.severity === "critical");
  const high     = active.filter(a => a.severity === "high");
  const medium   = active.filter(a => a.severity === "medium");
  const low      = active.filter(a => a.severity === "low");

  const handleMarkResolved = (id: string) => {
    // Persist the note the user typed (was previously computed then dropped, so
    // the history's "✓ {actionTaken}" line never showed what was done).
    resolveAlert(id, actionText[id]);
    toast.success("Alert marked as resolved");
    setActionText(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const handleDismiss = (id: string) => {
    markAlertRead(id);
    toast.success("Alert dismissed");
  };

  const handleSaveThreshold = () => {
    const val = parseInt(newThreshold);
    if (isNaN(val) || val < 1 || val > 180) { toast.error("Enter a value between 1 and 180 days"); return; }
    updateFirm({ safetyThresholdDays: val });
    toast.success(`Safety buffer updated to ${val} days`);
    setShowConfig(false);
  };

  const AlertCard = ({ a }: { a: typeof alerts[0] }) => {
    const { color, bg, icon: Icon, label } = SEV[a.severity] ?? SEV.low;
    return (
      <div className={`rounded-lg border px-4 py-3.5 ${bg}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <Icon size={15} className={`${color} mt-0.5 shrink-0`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</span>
                <span className="text-[10px] text-[var(--color-muted)]">{new Date(a.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {a.title && <p className="text-sm font-semibold mb-0.5">{a.title}</p>}
              <p className="text-sm text-[var(--color-muted)] leading-snug">{a.message}</p>
              <div className="flex items-center gap-2 mt-2">
                <input
                  value={actionText[a.id] ?? ""}
                  onChange={e => setActionText(prev => ({ ...prev, [a.id]: e.target.value }))}
                  placeholder="Log action taken (optional)…"
                  className="flex-1 text-xs bg-black/20 border border-[var(--color-border)] rounded-lg px-2.5 py-1 outline-none focus:border-[var(--color-primary)]"
                />
                <button onClick={() => handleMarkResolved(a.id)}
                  className="flex items-center gap-1 text-xs bg-green-900/40 text-green-400 border border-green-800/40 px-2 py-1 rounded-lg hover:bg-green-900/60 whitespace-nowrap">
                  <CheckCircle2 size={11} /> Resolve
                </button>
                <button onClick={() => handleDismiss(a.id)}
                  className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)] rounded-lg hover:bg-black/20">
                  <X size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const Section = ({ title, items, colorCls }: { title: string; items: typeof alerts; colorCls: string }) => {
    if (items.length === 0) return null;
    return (
      <div>
        <h2 className={`text-xs font-bold uppercase tracking-wider mb-2 ${colorCls}`}>{title} ({items.length})</h2>
        <div className="space-y-2">
          {items.map(a => <AlertCard key={a.id} a={a} />)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Alerts Centre</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">{active.length} active · {history.length} resolved</p>
        </div>
        <button onClick={() => setShowConfig(v => !v)}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40">
          <Settings2 size={12} /> Configure
        </button>
      </div>

      {/* Safety buffer config */}
      {showConfig && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">Alert Threshold Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Safety buffer (days of expenses)</label>
              <div className="flex items-center gap-3">
                <input type="range" min="7" max="60" value={newThreshold} onChange={e => setNewThreshold(e.target.value)}
                  className="flex-1 accent-[var(--color-primary)]" />
                <span className="text-sm font-bold text-[var(--color-primary)] w-16 text-right">{newThreshold} days</span>
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-1">
                Current buffer = {formatCurrency(safetyBuffer)} ({safetyDays} days × daily burn)
              </p>
            </div>
            <div className="space-y-1 text-xs text-[var(--color-muted)]">
              <p><strong className="text-[var(--color-text)]">Critical</strong> — balance goes negative within 30 days → in-app + email + WhatsApp</p>
              <p><strong className="text-[var(--color-text)]">Warning</strong> — below safety buffer within 45 days → in-app + email</p>
              <p><strong className="text-[var(--color-text)]">Info</strong> — unusual spend detected → in-app only</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveThreshold} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold text-sm px-4 py-2 rounded-lg hover:opacity-90">Save</button>
            <button onClick={() => setShowConfig(false)} className="text-sm text-[var(--color-muted)] px-4 py-2 rounded-lg hover:bg-[var(--color-accent)]">Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {([["active", `Active (${active.length})`], ["history", `Resolved (${history.length})`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 text-sm rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Active alerts */}
      {tab === "active" && (
        <>
          {active.length === 0 ? (
            <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
              <CheckCircle2 size={28} className="mx-auto mb-3 text-green-400 opacity-50" />
              <h2 className="text-base font-semibold mb-1">All clear</h2>
              <p className="text-sm text-[var(--color-muted)]">No active alerts. The system checks your cash position every 4 hours.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <Section title="Critical" items={critical} colorCls="text-red-400" />
              <Section title="High"     items={high}     colorCls="text-orange-400" />
              <Section title="Warning"  items={medium}   colorCls="text-yellow-400" />
              <Section title="Info"     items={low}      colorCls="text-blue-400" />
            </div>
          )}
        </>
      )}

      {/* History */}
      {tab === "history" && (
        <>
          {history.length === 0 ? (
            <p className="text-center py-10 text-sm text-[var(--color-muted)]">No resolved alerts yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map(a => {
                const { color, bg, label } = SEV[a.severity] ?? SEV.low;
                return (
                  <div key={a.id} className={`rounded-lg border px-4 py-3 opacity-60 ${bg}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</span>
                        <span className="text-[10px] text-[var(--color-muted)] ml-2">{new Date(a.createdAt).toLocaleDateString("en-IN")}</span>
                        {a.title && <p className="text-sm font-semibold mt-0.5">{a.title}</p>}
                        <p className="text-xs text-[var(--color-muted)]">{a.message}</p>
                        {a.actionTaken && <p className="text-xs text-[var(--color-muted)] italic mt-1">✓ {a.actionTaken}</p>}
                      </div>
                      <button onClick={() => deleteAlert(a.id)} className="p-1 text-[var(--color-muted)] hover:text-red-400 rounded">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
