import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import { Search, LayoutDashboard, ArrowRightLeft, TrendingUp, CreditCard, Briefcase, Package, Bell, Settings, Users, X } from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard",    path: "/dashboard",    icon: LayoutDashboard },
  { label: "Transactions", path: "/transactions", icon: ArrowRightLeft },
  { label: "Forecast",     path: "/forecast",     icon: TrendingUp },
  { label: "Credit",       path: "/credit",       icon: CreditCard },
  { label: "Operations",   path: "/operations",   icon: Package },
  { label: "Alerts",       path: "/alerts",       icon: Bell },
  { label: "Settings",     path: "/settings",     icon: Settings },
  { label: "Advisor",      path: "/advisor",      icon: Users },
  { label: "Capital",      path: "/capital",      icon: Briefcase },
  { label: "Profile",      path: "/profile",      icon: Settings },
];

type Result = {
  id: string;
  label: string;
  sub?: string;
  type: "nav" | "transaction" | "alert";
  action: () => void;
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate  = useNavigate();
  const { store } = useApp();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) { setQuery(""); setCursor(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const results: Result[] = useMemo(() => {
    const q = query.toLowerCase().trim();
    const go = (path: string) => { navigate(path); onClose(); };

    if (!q) return NAV_ITEMS.map(n => ({ id: n.path, label: n.label, type: "nav" as const, action: () => go(n.path) }));

    const out: Result[] = [];

    // Nav
    NAV_ITEMS.filter(n => n.label.toLowerCase().includes(q)).forEach(n =>
      out.push({ id: n.path, label: n.label, type: "nav", action: () => go(n.path) })
    );

    // Transactions
    store.transactions.filter(t =>
      t.description.toLowerCase().includes(q) || t.counterparty.toLowerCase().includes(q)
    ).slice(0, 6).forEach(t =>
      out.push({
        id: t.id, label: t.description,
        sub: `${t.date} · ${formatCurrency(t.amount)} · ${t.category}`,
        type: "transaction",
        action: () => { navigate("/transactions"); onClose(); },
      })
    );

    // Alerts
    store.alerts.filter(a => a.title.toLowerCase().includes(q) || a.message.toLowerCase().includes(q)).slice(0, 4).forEach(a =>
      out.push({
        id: a.id, label: a.title, sub: a.message.slice(0, 60),
        type: "alert",
        action: () => { navigate("/alerts"); onClose(); },
      })
    );

    return out.slice(0, 12);
  }, [query, store.transactions, store.alerts, navigate, onClose]);

  useEffect(() => { setCursor(0); }, [results.length]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    if (e.key === "Enter"  && results[cursor]) { results[cursor].action(); }
    if (e.key === "Escape") onClose();
  };

  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const typeLabel: Record<string, string> = { nav: "Pages", transaction: "Transactions", alert: "Alerts" };
  let lastType = "";

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
          <Search size={15} className="text-[var(--color-muted)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search pages, transactions, alerts…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted)]"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
              <X size={13} />
            </button>
          )}
          <kbd className="text-[10px] font-mono text-[var(--color-muted)] bg-[var(--color-bg)] border border-[var(--color-border)] px-1.5 py-0.5 rounded shrink-0">esc</kbd>
        </div>

        {/* Results */}
        <ul ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">No results for "{query}"</li>
          )}
          {results.map((r, i) => {
            const showHeader = r.type !== lastType;
            lastType = r.type;
            const NavIcon = r.type === "nav" ? (NAV_ITEMS.find(n => n.path === r.id)?.icon ?? Search) : null;
            return (
              <li key={r.id}>
                {showHeader && (
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    {typeLabel[r.type]}
                  </p>
                )}
                <button
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === cursor ? "bg-[var(--color-primary)]/10 text-[var(--color-text)]" : "hover:bg-white/3 text-[var(--color-text)]"}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={r.action}
                >
                  {NavIcon && <NavIcon size={14} className="shrink-0 text-[var(--color-primary)]" />}
                  {r.type !== "nav" && <span className="w-3.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.label}</p>
                    {r.sub && <p className="text-[11px] text-[var(--color-muted)] truncate">{r.sub}</p>}
                  </div>
                  {i === cursor && <span className="ml-auto text-[10px] text-[var(--color-muted)] font-mono shrink-0">↵</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--color-border)] text-[10px] text-[var(--color-muted)]">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
