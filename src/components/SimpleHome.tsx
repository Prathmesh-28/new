import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus, IndianRupee, Receipt, Wallet, HelpCircle, Bell, LayoutGrid } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import { useT } from "@/i18n";

// Assisted / simple mode (roadmap #173): a stripped-down home with a handful of large, clearly
// labelled buttons for low-digital-literacy owners — the daily jobs and nothing else. Toggled on
// from the dashboard; "Full view" returns to the normal app. Labels are translated at render
// (this is the vernacular-first surface, so full i18n matters most here).
const ACTIONS = [
  { labelKey: "simple.newBill",  hintKey: "simple.newBill.hint",  to: "/invoices?compose=1", icon: FilePlus,    color: "text-blue-400",   bg: "bg-blue-950/30" },
  { labelKey: "simple.gotPaid",  hintKey: "simple.gotPaid.hint",  to: "/payments",           icon: IndianRupee, color: "text-green-400",  bg: "bg-green-950/30" },
  { labelKey: "simple.spent",    hintKey: "simple.spent.hint",    to: "/transactions",       icon: Receipt,     color: "text-orange-400", bg: "bg-orange-950/30" },
  { labelKey: "simple.myMoney",  hintKey: "simple.myMoney.hint",  to: "/banking",            icon: Wallet,      color: "text-teal-400",   bg: "bg-teal-950/30" },
];

export default function SimpleHome({ onExit }: { onExit: () => void }) {
  const navigate = useNavigate();
  const t = useT();
  const { store } = useApp();
  const { bankAccounts = [], alerts = [] } = store;
  const balance = useMemo(() => bankAccounts.reduce((a, b) => a + (b.balance || 0), 0), [bankAccounts]);
  const unread = alerts.filter((a) => !a.isRead).length;

  return (
    <div className="min-h-[70vh] max-w-2xl mx-auto">
      {/* Balance banner */}
      <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 text-center mb-5">
        <p className="text-sm text-[var(--color-muted)]">{t("simple.balance")}</p>
        <p className="text-4xl font-bold mt-1 tabular-nums">{formatCurrency(balance)}</p>
      </div>

      {/* Big action buttons */}
      <div className="grid grid-cols-2 gap-4">
        {ACTIONS.map(({ labelKey, hintKey, to, icon: Icon, color, bg }) => (
          <button key={labelKey} onClick={() => navigate(to)}
            className={`${bg} border border-[var(--color-border)] rounded-2xl p-6 flex flex-col items-center justify-center gap-3 min-h-[140px] hover:scale-[1.02] active:scale-[0.98] transition-transform`}>
            <Icon size={40} className={color} />
            <span className="text-lg font-bold text-[var(--color-text)]">{t(labelKey)}</span>
            <span className="text-xs text-[var(--color-muted)]">{t(hintKey)}</span>
          </button>
        ))}
      </div>

      {/* Alerts + help + exit */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <button onClick={() => navigate("/alerts")}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 flex items-center justify-center gap-3 hover:border-[var(--color-primary)]/40 transition-colors">
          <Bell size={26} className="text-[var(--color-primary)]" />
          <span className="text-base font-semibold">{t("Alerts")}{unread > 0 ? ` (${unread})` : ""}</span>
        </button>
        <button onClick={() => { document.dispatchEvent(new CustomEvent("open-headroom-assistant")); }}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 flex items-center justify-center gap-3 hover:border-[var(--color-primary)]/40 transition-colors">
          <HelpCircle size={26} className="text-[var(--color-primary)]" />
          <span className="text-base font-semibold">{t("simple.getHelp")}</span>
        </button>
      </div>

      <button onClick={onExit} className="mt-6 mx-auto flex items-center gap-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">
        <LayoutGrid size={15} /> {t("simple.fullView")}
      </button>
    </div>
  );
}
