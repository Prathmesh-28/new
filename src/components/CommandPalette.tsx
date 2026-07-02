import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useT } from "@/i18n";
import { formatCurrency } from "@/lib/utils";
import { TAB_CATALOG } from "@/data/roles";
import {
  Search, LayoutDashboard, ArrowRightLeft, TrendingUp, CreditCard, Briefcase,
  Package, Bell, Settings, Users, X, BarChart3, Sparkles, Building2, Store,
  Landmark, FilePlus, Calculator, Wallet, Receipt, Rocket, PlugZap, PiggyBank, ShieldCheck,
  HeartPulse, RefreshCcw, Scale, Gem, CalendarCheck, ScanSearch, FileSpreadsheet, ScrollText, Database,
  Star, Clock, Grid3x3,
} from "lucide-react";

type LucideIcon = typeof Search;

const NAV_ITEMS: { label: string; path: string; icon: LucideIcon; desc?: string }[] = [
  { label: "Dashboard",    path: "/dashboard",    icon: LayoutDashboard, desc: "Overview & health score" },
  { label: "Transactions", path: "/transactions", icon: ArrowRightLeft,  desc: "All bank transactions" },
  { label: "Forecast",     path: "/forecast",     icon: TrendingUp,      desc: "90-day cash projection" },
  { label: "Analytics",    path: "/analytics",    icon: BarChart3,       desc: "P&L, trends, benchmarks" },
  { label: "CFO Brief",    path: "/cfo-brief",    icon: Sparkles,        desc: "AI financial summary" },
  { label: "Financial Health", path: "/health",   icon: HeartPulse,      desc: "Composite score, ratios & lender readiness" },
  { label: "Working Capital", path: "/working-capital", icon: RefreshCcw, desc: "DSO, DPO, DIO & cash conversion cycle" },
  { label: "Debt Manager", path: "/debt",         icon: Scale,           desc: "Amortisation, prepayment & refinance maths" },
  { label: "Valuation",    path: "/valuation",    icon: Gem,             desc: "DCF, multiples & dilution simulator" },
  { label: "Financial Statements", path: "/statements", icon: FileSpreadsheet, desc: "Income statement, balance sheet & cash flow" },
  { label: "Term Sheet",   path: "/term-sheet",   icon: ScrollText,      desc: "Generate a fundraise term sheet" },
  { label: "Data & Import",path: "/data",         icon: Database,        desc: "Bulk CSV import, demo data & bulk edit" },
  { label: "Compliance",   path: "/compliance",   icon: CalendarCheck,   desc: "GST, TDS & advance-tax calendar" },
  { label: "Invoices",     path: "/invoices",     icon: FilePlus,        desc: "Invoices & auto-collect" },
  { label: "Receivables",  path: "/receivables",  icon: Receipt,         desc: "Aging pipeline & kanban" },
  { label: "GST",          path: "/gst",          icon: Calculator,      desc: "GST returns & filings" },
  { label: "Credit",       path: "/credit",       icon: CreditCard,      desc: "Working capital options" },
  { label: "Capital",      path: "/capital",      icon: Rocket,          desc: "Fundraise & term sheets" },
  { label: "Lenders",      path: "/lenders",      icon: Landmark,        desc: "Co-lending auction" },
  { label: "Payroll",      path: "/payroll",      icon: Wallet,          desc: "Payroll & EWA" },
  { label: "Vendors",      path: "/vendors",      icon: Building2,       desc: "Vendor directory & spend" },
  { label: "Suppliers",    path: "/suppliers",    icon: Store,           desc: "Early-pay marketplace" },
  { label: "Budgets",      path: "/budgets",      icon: PiggyBank,       desc: "Category budgets vs actuals" },
  { label: "Tax Autopilot",path: "/tax",          icon: ShieldCheck,     desc: "Advance tax & TDS tracker" },
  { label: "Spend Intel",  path: "/spend",        icon: ScanSearch,      desc: "Duplicate vendors, subscriptions, category benchmarks" },
  { label: "Operations",   path: "/operations",   icon: Package,         desc: "Business operations" },
  { label: "Connectors",   path: "/connectors",   icon: PlugZap,         desc: "Integrations & data sources" },
  { label: "Alerts",       path: "/alerts",       icon: Bell,            desc: "Notifications & alerts" },
  { label: "Advisor",      path: "/advisor",      icon: Users,           desc: "CA/CFO client portal" },
  { label: "Settings",     path: "/settings",     icon: Settings,        desc: "Personal & workspace preferences" },
  { label: "Organization", path: "/organization", icon: Users,           desc: "Members, roles & access, billing, company, audit" },
  { label: "Profile",      path: "/profile",      icon: Settings,        desc: "Your profile" },
  { label: "Admin Console",path: "/admin",        icon: ShieldCheck,     desc: "Super admin: users, companies, plans, audit" },
  { label: "All Data",     path: "/admin/data",   icon: Database,        desc: "Super admin master data explorer" },
];

// Complete page index: the curated NAV_ITEMS (rich icons/descriptions) plus every
// page in the canonical TAB_CATALOG that isn't already listed - so search reaches
// all ~60 pages, not just the popular ones.
const PAGE_INDEX: { label: string; path: string; icon: LucideIcon; desc?: string }[] = (() => {
  const byPath = new Map<string, { label: string; path: string; icon: LucideIcon; desc?: string }>();
  NAV_ITEMS.forEach(n => byPath.set(n.path, n));
  TAB_CATALOG.forEach(t => {
    const p = `/${t.tab}`;
    if (!byPath.has(p)) byPath.set(p, { label: t.label, path: p, icon: Grid3x3, desc: t.group });
  });
  return [...byPath.values()];
})();
const pageByPath = (p: string) => PAGE_INDEX.find(n => n.path === p);

// Favorites & recents - small, fast personalisation in localStorage (C13).
const FAV_KEY = "hr_fav_pages", REC_KEY = "hr_recent_pages", FREQ_KEY = "hr_page_freq";
function readList(k: string): string[] { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } }
function writeList(k: string, v: string[]) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
export function recordRecentPage(path: string) {
  const next = [path, ...readList(REC_KEY).filter(p => p !== path)].slice(0, 6);
  writeList(REC_KEY, next);
  try {
    const freq: Record<string, number> = JSON.parse(localStorage.getItem(FREQ_KEY) || "{}");
    freq[path] = (freq[path] || 0) + 1;
    localStorage.setItem(FREQ_KEY, JSON.stringify(freq));
  } catch { /* ignore */ }
}
// Top pages by visit count - powers the sidebar's personalised "Frequent" group.
export function getFrequentPages(limit = 5): string[] {
  try {
    const freq: Record<string, number> = JSON.parse(localStorage.getItem(FREQ_KEY) || "{}");
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([p]) => p);
  } catch { return []; }
}

type Result = {
  id: string;
  label: string;
  sub?: string;
  type: "fav" | "recent" | "nav" | "transaction" | "alert";
  path?: string;
  action: () => void;
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const tr = useT();   // `t` is used as the transaction param in the search filter below
  const navigate  = useNavigate();
  const { store } = useApp();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [favs, setFavs] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) { setQuery(""); setCursor(0); setFavs(readList(FAV_KEY)); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const toggleFav = (path: string) => {
    setFavs(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path];
      writeList(FAV_KEY, next);
      return next;
    });
  };

  const results: Result[] = useMemo(() => {
    const q = query.toLowerCase().trim();
    const go = (path: string) => { recordRecentPage(path); navigate(path); onClose(); };

    if (!q) {
      const out: Result[] = [];
      favs.map(pageByPath).filter(Boolean).forEach(n => out.push({ id: `fav${n!.path}`, label: n!.label, sub: n!.desc, type: "fav", path: n!.path, action: () => go(n!.path) }));
      readList(REC_KEY).filter(p => !favs.includes(p)).map(pageByPath).filter(Boolean).slice(0, 5).forEach(n => out.push({ id: `rec${n!.path}`, label: n!.label, sub: n!.desc, type: "recent", path: n!.path, action: () => go(n!.path) }));
      PAGE_INDEX.filter(n => !favs.includes(n.path)).slice(0, 8).forEach(n => out.push({ id: n.path, label: n.label, sub: n.desc, type: "nav", path: n.path, action: () => go(n.path) }));
      return out.slice(0, 16);
    }

    const out: Result[] = [];
    PAGE_INDEX.filter(n => n.label.toLowerCase().includes(q) || n.desc?.toLowerCase().includes(q) || n.path.includes(q)).forEach(n =>
      out.push({ id: n.path, label: n.label, sub: n.desc, type: "nav", path: n.path, action: () => go(n.path) })
    );
    store.transactions.filter(t =>
      t.description.toLowerCase().includes(q) || t.counterparty.toLowerCase().includes(q)
    ).slice(0, 6).forEach(t =>
      out.push({ id: t.id, label: t.description, sub: `${t.date} · ${formatCurrency(t.amount)} · ${t.category}`, type: "transaction", action: () => { navigate("/transactions"); onClose(); } })
    );
    store.alerts.filter(a => a.title.toLowerCase().includes(q) || a.message.toLowerCase().includes(q)).slice(0, 4).forEach(a =>
      out.push({ id: a.id, label: a.title, sub: a.message.slice(0, 60), type: "alert", action: () => { navigate("/alerts"); onClose(); } })
    );
    return out.slice(0, 16);
  }, [query, favs, store.transactions, store.alerts, navigate, onClose]);

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

  const typeLabel: Record<string, string> = { fav: tr("cmdk.favorites"), recent: tr("cmdk.recent"), nav: tr("cmdk.pages"), transaction: tr("Transactions"), alert: tr("Alerts") };
  let lastType = "";

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
          <Search size={15} className="text-[var(--color-muted)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={tr("cmdk.placeholder")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted)]"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
              <X size={13} />
            </button>
          )}
          <kbd className="text-[10px] font-mono text-[var(--color-muted)] bg-[var(--color-bg)] border border-[var(--color-border)] px-1.5 py-0.5 rounded shrink-0">esc</kbd>
        </div>

        <ul ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">{tr("cmdk.noResults", { query })}</li>
          )}
          {results.map((r, i) => {
            const showHeader = r.type !== lastType;
            lastType = r.type;
            const isPage = r.type === "fav" || r.type === "recent" || r.type === "nav";
            const NavIcon = isPage && r.path ? (pageByPath(r.path)?.icon ?? (r.type === "recent" ? Clock : Search)) : null;
            const isFav = r.path ? favs.includes(r.path) : false;
            return (
              <li key={r.id}>
                {showHeader && (
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    {typeLabel[r.type]}
                  </p>
                )}
                <div className={`group w-full flex items-center gap-3 px-4 py-2.5 ${i === cursor ? "bg-[var(--color-primary)]/10" : "hover:bg-white/3"}`}>
                  <button className="flex items-center gap-3 text-left flex-1 min-w-0" onMouseEnter={() => setCursor(i)} onClick={r.action}>
                    {NavIcon ? <NavIcon size={14} className="shrink-0 text-[var(--color-primary)]" /> : <span className="w-3.5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.label}</p>
                      {r.sub && <p className="text-[11px] text-[var(--color-muted)] truncate">{r.sub}</p>}
                    </div>
                  </button>
                  {isPage && r.path && (
                    <button onClick={() => toggleFav(r.path!)} title={isFav ? "Unpin" : "Pin to favorites"} className={`shrink-0 ${isFav ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]/40 hover:text-[var(--color-muted)] opacity-0 group-hover:opacity-100"}`}>
                      <Star size={13} fill={isFav ? "currentColor" : "none"} />
                    </button>
                  )}
                  {i === cursor && <span className="text-[10px] text-[var(--color-muted)] font-mono shrink-0">↵</span>}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--color-border)] text-[10px] text-[var(--color-muted)]">
          <span><kbd className="font-mono">↑↓</kbd> {tr("cmdk.navigate")}</span>
          <span><kbd className="font-mono">↵</kbd> {tr("cmdk.open")}</span>
          <span><Star size={9} className="inline" /> {tr("cmdk.pin")}</span>
          <span><kbd className="font-mono">esc</kbd> {tr("cmdk.close")}</span>
        </div>
      </div>
    </div>
  );
}
