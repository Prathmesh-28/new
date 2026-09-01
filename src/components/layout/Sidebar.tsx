import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth, BASE } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import {
  Eye, ChevronLeft, ChevronRight, ChevronDown, Lock, LogOut, Menu, X, Search, User,
  LayoutDashboard, TrendingUp, CreditCard, Rocket, ShieldCheck, Settings2,
  Users, Briefcase, PlugZap, FileText, Bell,
  FilePlus, Calculator, Wallet, Landmark, Sparkles, Building2,
  PiggyBank, HeartPulse, RefreshCcw, CalendarCheck,
  MessageCircle, PhoneCall, FolderOpen, Database,
  Handshake, IndianRupee, Umbrella, Coins,
  ShoppingCart, ShieldAlert, KeyRound, Banknote,
  Smartphone, FlaskConical, BookOpen, Factory, LineChart, UsersRound, Wand2, AppWindow, MessagesSquare, Waypoints,
  BarChart3, Check, Plus,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useT } from "@/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

import { FEATURE_ENTITLEMENTS, PLAN_RANK, PLAN_LABEL, type PlanTier } from "@/data/types";
import { getFrequentPages } from "@/components/CommandPalette";
import { usePlatformSettings } from "@/lib/usePlatformSettings";

type Firm = { tenant_id: string; role: string; name: string };

// Multi-firm switcher (#197). Shows the firms a user may act in and lets them switch the
// active one (or, for owners, spin up another). Hidden entirely for ordinary single-firm
// users (one firm, not an owner) so their sidebar is unchanged.
function FirmSwitcher({ collapsed }: { collapsed: boolean }) {
  const { user, switchFirm, createFirm } = useAuth();
  const t = useT();
  const [firms, setFirms] = useState<Firm[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const canCreate = user?.role === "owner" || user?.role === "super_admin";

  useEffect(() => {
    let cancelled = false;
    api.get<{ firms: Firm[]; active: string }>("/api/auth/my-firms")
      .then(r => { if (!cancelled) { setFirms(r.firms || []); setActive(r.active); } })
      .catch(() => { /* non-fatal: switcher stays hidden */ });
    return () => { cancelled = true; };
  }, []);

  // Single-firm, non-owner → render nothing (zero change for ordinary users).
  if (firms.length <= 1 && !canCreate) return null;
  if (firms.length === 0) return null;

  const current = firms.find(f => f.tenant_id === active) || firms[0];

  const doSwitch = async (tid: string) => {
    if (tid === active || busy) { setOpen(false); return; }
    setBusy(true);
    try { await switchFirm(tid); } // reloads on success
    catch (e) { setBusy(false); toast.error(e instanceof Error ? e.message : "Could not switch firm"); }
  };
  const doCreate = async () => {
    const name = window.prompt("Name of the new firm");
    if (!name || !name.trim()) return;
    setBusy(true);
    try { await createFirm(name.trim()); } // reloads on success
    catch (e) { setBusy(false); toast.error(e instanceof Error ? e.message : "Could not create firm"); }
  };

  if (collapsed) {
    return (
      <div className="mx-2 mb-1 flex items-center justify-center" title={current?.name}>
        <Building2 size={14} className="text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="px-2 mb-1.5 relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 transition-colors disabled:opacity-50"
        title={t("firm.switch")}
      >
        <Building2 size={13} className="text-[var(--color-primary)] shrink-0" />
        <span className="flex-1 text-left truncate font-medium">{current?.name}</span>
        <ChevronDown size={12} className={cn("shrink-0 text-[var(--color-muted)] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg overflow-hidden z-20 max-h-72 overflow-y-auto">
          {firms.map(f => (
            <button
              key={f.tenant_id}
              onClick={() => doSwitch(f.tenant_id)}
              className="flex items-center gap-1.5 w-full px-2.5 py-2 text-xs hover:bg-white/5 transition-colors text-left"
            >
              <span className="w-3.5 shrink-0">{f.tenant_id === active && <Check size={12} className="text-[var(--color-primary)]" />}</span>
              <span className="flex-1 min-w-0">
                <span className="block truncate">{f.name}</span>
                <span className="block text-[10px] text-[var(--color-muted)] capitalize">{f.role.replace("_", " ")}</span>
              </span>
            </button>
          ))}
          {canCreate && (
            <button
              onClick={doCreate}
              className="flex items-center gap-1.5 w-full px-2.5 py-2 text-xs text-[var(--color-primary)] hover:bg-white/5 transition-colors border-t border-[var(--color-border)]"
            >
              <Plus size={12} className="shrink-0" /> {t("firm.add")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Maps a nav tab → its super-admin feature switch (Console → Platform → Features).
// A tab not listed here is always on. Turning a switch off hides the module live.
const FEATURE_TAB: Record<string, string> = {
  agents: "enableAgents", whatsapp: "enableWhatsapp", marketplace: "enableMarketplace",
  investor: "enableInvestor", esg: "enableEsg", global: "enableGlobal", tokens: "enableTokens",
};

interface NavItem  { to: string; label: string; icon: React.ElementType; tab: string }
interface NavGroup { label: string; items: NavItem[] }

// ─────────────────────────────────────────────────────────────────────────────
// Single master navigation catalogue - every page in the app, organised by the
// JOB the user is doing (user-flow categories), not by which team built it.
// Each role's sidebar is derived from this ONE list, filtered by canAccess() -
// so categorisation stays identical for everyone and we never duplicate it per
// role. Order of groups = the natural daily flow: understand → sell → record →
// run → people → plan → fund → automate → extend → administer.
// ─────────────────────────────────────────────────────────────────────────────
// IA redesign (2026-06): grouped by the JOB the owner does, not by tech. Every
// nav item is a CANONICAL page for its job. Duplicate / thin / stub pages (e.g.
// Analytics→Insights, Debt→Credit, Scenarios→Forecast, Automation→Flows, Voice,
// ESG, Tokens) are intentionally NOT listed here - their ROUTES stay alive in
// App.tsx and remain reachable via ⌘K search (CommandPalette has its own list).
// This is the nav layer only: no feature page was merged or rewritten.
const NAV_CATALOG: NavGroup[] = [
  { label: "Home", items: [
    { to: "/dashboard",       label: "Dashboard",          icon: LayoutDashboard, tab: "dashboard"  },
    { to: "/health",          label: "Financial Health",   icon: HeartPulse,      tab: "health"     },
    { to: "/cfo-brief",       label: "CFO Brief",          icon: Sparkles,        tab: "cfo-brief"  },
    { to: "/alerts",          label: "Alerts",             icon: Bell,            tab: "alerts"     },
  ]},
  { label: "Get Paid & Sell", items: [
    { to: "/sales",           label: "Sales & CRM",        icon: Handshake,       tab: "sales"       },
    { to: "/customers",       label: "Customers",          icon: Users,           tab: "customers"   },
    { to: "/invoices",        label: "Invoices",           icon: FilePlus,        tab: "invoices"    },
    { to: "/collections",     label: "Receivables & Collections", icon: PhoneCall, tab: "collections" },
    { to: "/payments",        label: "Payments",           icon: IndianRupee,     tab: "payments"    },
    { to: "/field",           label: "Field Sales",        icon: Smartphone,      tab: "field"       },
  ]},
  { label: "Money & Books", items: [
    { to: "/transactions",    label: "Transactions",       icon: FileText,        tab: "transactions" },
    { to: "/books",           label: "Books (GL)",         icon: BookOpen,        tab: "books"        },
    { to: "/gst",             label: "GST",                icon: Calculator,      tab: "gst"          },
    { to: "/tax",             label: "Tax Autopilot",      icon: ShieldCheck,     tab: "tax"          },
    { to: "/compliance",      label: "Compliance",         icon: CalendarCheck,   tab: "compliance"   },
    { to: "/reports",         label: "Reports",            icon: LineChart,       tab: "reports"      },
    { to: "/insights",        label: "Analytics & Insights",icon: LineChart,      tab: "insights"     },
    { to: "/banking",         label: "Banking",            icon: Banknote,        tab: "banking"      },
    { to: "/payouts",         label: "Payouts",            icon: Coins,           tab: "payouts"      },
    { to: "/fraud-sentinel",  label: "Books Integrity",    icon: ShieldAlert,     tab: "fraud-sentinel" },
    { to: "/documents",       label: "Documents",          icon: FolderOpen,      tab: "documents"    },
  ]},
  { label: "Run Operations", items: [
    { to: "/operations",      label: "Operations & Mfg",   icon: Factory,         tab: "operations"  },
    { to: "/vendors",         label: "Vendors & Suppliers",icon: Building2,       tab: "vendors"     },
    { to: "/marketplace",     label: "Online Seller Finance", icon: ShoppingCart, tab: "marketplace" },
  ]},
  { label: "Team", items: [
    { to: "/hrms",            label: "People (HRMS)",      icon: Users,           tab: "hrms"    },
    { to: "/payroll",         label: "Payroll",            icon: Wallet,          tab: "payroll" },
    { to: "/collab",          label: "Messages",           icon: MessagesSquare,  tab: "collab"  },
  ]},
  { label: "Plan & Grow Capital", items: [
    { to: "/forecast",        label: "Forecast",           icon: TrendingUp,      tab: "forecast"        },
    { to: "/budgets",         label: "Budgets",            icon: PiggyBank,       tab: "budgets"         },
    { to: "/working-capital", label: "Working Capital",    icon: RefreshCcw,      tab: "working-capital" },
    { to: "/credit",          label: "Credit & Loans",     icon: CreditCard,      tab: "credit"          },
    { to: "/lenders",         label: "Loan Marketplace",   icon: Landmark,        tab: "lenders"         },
    { to: "/bank-credit",     label: "Bank Credit",        icon: Banknote,        tab: "bank-credit"     },
    { to: "/capital",         label: "Fundraise",          icon: Rocket,          tab: "capital"         },
    { to: "/treasury",        label: "Treasury",           icon: Coins,           tab: "treasury"        },
    { to: "/insurance",       label: "Insurance",          icon: Umbrella,        tab: "insurance"       },
  ]},
  { label: "Build & Automate", items: [
    // /agents is the BuildHub: Agents · App Builder · Flows · Automation as tabs.
    { to: "/agents",          label: "Build & Automate",   icon: Wand2,           tab: "agents"   },
    { to: "/whatsapp",        label: "WhatsApp",           icon: MessageCircle,   tab: "whatsapp" },
    { to: "/frontier",        label: "Labs",               icon: FlaskConical,    tab: "frontier" },
  ]},
  { label: "Organization", items: [
    // The company-admin console (members, roles & access, billing, company,
    // audit). Gated on the "settings" tab, so only owner + super_admin see it.
    { to: "/organization",    label: "Organization",  icon: UsersRound,      tab: "settings"   },
    { to: "/product-analytics", label: "Product Analytics", icon: BarChart3,  tab: "product-analytics" },
    { to: "/settings",        label: "Settings",      icon: Settings2,       tab: "settings"   },
    { to: "/data",            label: "Data & Import", icon: Database,        tab: "data"        },
    { to: "/connectors",      label: "Connectors",    icon: PlugZap,         tab: "connectors"  },
    { to: "/security",        label: "Security",      icon: ShieldAlert,     tab: "security"    },
    { to: "/privacy",         label: "Privacy",       icon: KeyRound,        tab: "privacy"     },
    // Role-scoped consoles (see ROLE_ONLY): the external-CA portal + the investor view.
    { to: "/advisor",         label: "CA Console",    icon: Users,           tab: "advisor"     },
    { to: "/investor",        label: "Investors",     icon: Briefcase,       tab: "investor"    },
    { to: "/admin",           label: "Admin Console", icon: ShieldCheck,     tab: "admin"       },
    { to: "/admin/data",      label: "All Data",      icon: Database,        tab: "admin"       },
  ]},
];

// Nav-level role gate (on top of canAccess): some real pages serve a NON-owner
// audience and only clutter the owner's sidebar. The route + canAccess are
// unchanged - this just decides who sees the nav slot.
const ROLE_ONLY: Record<string, string[]> = {
  advisor:  ["accountant", "super_admin"],   // external-CA multi-client console
  investor: ["investor", "super_admin"],      // the other side of the cap table
};

// The 6-10 daily-driver pages per role shown up top as "Main"; the rest stay
// collapsed under their job group. Only references CANONICAL (visible) tabs.
const PRIMARY_NAV: Record<string, string[]> = {
  super_admin:        ["dashboard", "invoices", "collections", "transactions", "gst", "forecast", "agents", "flows", "collab", "insights", "admin"],
  owner:              ["dashboard", "invoices", "customers", "collections", "transactions", "gst", "forecast", "agents", "flows", "collab", "insights"],
  finance_manager:    ["dashboard", "invoices", "collections", "transactions", "gst", "forecast", "agents", "insights", "banking", "collab"],
  accountant:         ["dashboard", "transactions", "books", "gst", "compliance", "agents", "insights", "advisor", "collab"],
  sales:              ["dashboard", "sales", "customers", "invoices", "collections", "payments", "agents", "collab", "field"],
  operations_manager: ["dashboard", "operations", "vendors", "marketplace", "agents", "flows", "collab", "transactions"],
  viewer:             ["dashboard", "health", "cfo-brief", "insights", "forecast"],
  investor:           ["investor", "capital", "credit", "lenders"],
};

function NavItems({ groups, collapsed, onNavigate, badges, expanded, onToggleGroup, lockedPlan }: {
  groups: NavGroup[];
  collapsed: boolean;
  onNavigate?: () => void;
  badges?: Record<string, number>;
  expanded: Set<string>;
  onToggleGroup: (label: string) => void;
  lockedPlan: (tab: string) => PlanTier | null;
}) {
  // Nav labels are translated at render (key = the English label, gettext-style); the
  // catalog keeps the English label as its stable identity for expand/collapse state.
  const t = useT();
  return (
    <>
      {groups.map(group => {
        // Headers (and therefore collapsing) only when the rail is expanded.
        const hasHeader = !!group.label && !collapsed;
        const isOpen = !hasHeader || expanded.has(group.label);
        return (
          <div key={group.label || "default"} className="px-2">
            {hasHeader && (
              <button
                onClick={() => onToggleGroup(group.label)}
                className="w-full flex items-center gap-1 px-2 mb-1 mt-1 text-[10px] font-semibold text-[var(--color-muted)]/50 uppercase tracking-widest select-none hover:text-[var(--color-muted)] transition-colors"
              >
                <ChevronDown size={11} className={cn("transition-transform shrink-0", !isOpen && "-rotate-90")} />
                <span className="flex-1 text-left">{t(group.label)}</span>
                <span className="font-sans normal-case tracking-normal text-[var(--color-muted)]/40">{group.items.length}</span>
              </button>
            )}
            {isOpen && (
              <div className="flex flex-col gap-0.5">
                {group.items.map(({ to, label, icon: Icon, tab }) => {
                  const badge = badges?.[tab];
                  const lock = lockedPlan(tab);
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      end={tab === "dashboard"}
                      title={collapsed ? t(label) : undefined}
                      onClick={onNavigate}
                      className={({ isActive }) => cn(
                        "flex items-center gap-2.5 px-2 py-2 rounded-md text-sm font-medium transition-colors",
                        collapsed && "justify-center",
                        isActive
                          ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                          : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-white/4",
                        lock && "opacity-60"
                      )}
                    >
                      <div className="relative shrink-0">
                        <Icon size={15} />
                        {badge !== undefined && badge > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                            {badge > 9 ? "9+" : badge}
                          </span>
                        )}
                      </div>
                      {!collapsed && <span className="flex-1 truncate">{t(label)}</span>}
                      {!collapsed && lock && (
                        <span title={`Upgrade to ${PLAN_LABEL[lock]}`} className="flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wide bg-[var(--color-primary)]/15 text-[var(--color-primary)] px-1.5 py-0.5 rounded-full shrink-0">
                          <Lock size={8} /> {PLAN_LABEL[lock]}
                        </span>
                      )}
                      {!collapsed && !lock && badge !== undefined && badge > 0 && (
                        <span className="text-[9px] font-bold bg-red-950/60 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full">
                          {badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export default function Sidebar({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const { user, logout }                          = useAuth();
  const t = useT();
  // Pending in-platform invites for this user → badge on the Settings nav (polled, no websockets).
  const [inviteCount, setInviteCount] = useState(0);
  useEffect(() => {
    const load = () => fetch(`${BASE}/api/invites`, { headers: { Authorization: `Bearer ${localStorage.getItem("hr_access") ?? ""}` } })
      .then(r => (r.ok ? r.json() : { incoming: [] }))
      .then(d => setInviteCount((d.incoming ?? []).length))
      .catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);
  const { canAccess, selectedClientTenantId,
          selectedClientLabel, setSelectedClient, store, previewRole } = useApp();
  const navigate                                  = useNavigate();
  const [collapsed, setCollapsed]                 = useState(
    () => localStorage.getItem("hr_sidebar_collapsed") === "true"
  );
  const [mobileOpen, setMobileOpen]               = useState(false);

  // When previewing "as" another role, render that role's navigation.
  const role   = previewRole ?? user?.role ?? "owner";
  const location = useLocation();
  // Super-admin feature switches (Console → Platform → Feature switches). When a
  // module is turned off it disappears from every user's nav in real time. The
  // super_admin still sees everything (so they can turn it back on).
  const { features } = usePlatformSettings();
  const featureOn = (tab: string) => {
    const flag = FEATURE_TAB[tab];
    return role === "super_admin" || !flag || features[flag] !== false;
  };
  // One catalogue, filtered to what this role can reach AND what's enabled. Empty groups drop out.
  const roleAllows = (tab: string) => !ROLE_ONLY[tab] || ROLE_ONLY[tab].includes(role);
  const groupsRaw = NAV_CATALOG
    .map(g => ({ ...g, items: g.items.filter(n => canAccess(n.tab) && featureOn(n.tab) && roleAllows(n.tab)) }))
    .filter(g => g.items.length > 0);

  // What plan a tab needs if the current plan can't reach it (null = accessible).
  const plan = ((user as { plan?: PlanTier })?.plan) ?? "free";
  const planRank = PLAN_RANK[plan] ?? 0;
  const lockedPlan = (tab: string): PlanTier | null => {
    if (role === "super_admin") return null;
    const req = FEATURE_ENTITLEMENTS[tab] as PlanTier | undefined;
    return req && (PLAN_RANK[req] ?? 0) > planRank ? req : null;
  };

  // ── IA (audit #1): a short role-based "Main" + a personalised "Frequent" group,
  // with the long tail collapsed. Turns a ~60-item wall into ~8 visible by default.
  // Dedup is by PATH (not tab) so items that intentionally share a tab - e.g.
  // /admin + /admin/data, or /settings + /settings#team - don't collide.
  const byTab: Record<string, NavItem> = {};
  const byPath: Record<string, NavItem> = {};
  groupsRaw.forEach(g => g.items.forEach(it => { if (!byTab[it.tab]) byTab[it.tab] = it; byPath[it.to] = it; }));
  const primaryTabs = (PRIMARY_NAV[role] ?? []).filter(t => byTab[t]);
  const primaryItems = primaryTabs.map(t => byTab[t]);
  const primaryPaths = new Set(primaryItems.map(it => it.to));
  const freqItems = getFrequentPages(8).map(p => byPath[p]).filter(Boolean).filter(it => !primaryPaths.has(it.to)).slice(0, 4);
  const restGroups = groupsRaw
    .map(g => ({ ...g, items: g.items.filter(it => !primaryPaths.has(it.to)) }))
    .filter(g => g.items.length > 0);
  const groups: NavGroup[] = [
    ...(freqItems.length ? [{ label: "Frequent", items: freqItems }] : []),
    ...(primaryItems.length ? [{ label: "Main", items: primaryItems }] : []),
    ...restGroups,
  ];

  // Collapsible groups. Main + Frequent open by default; the rest tucked away.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem("hr_nav_open"); if (s) return new Set<string>(JSON.parse(s)); } catch { /* ignore */ }
    return new Set<string>(["Frequent", "Main"]);
  });
  const toggleGroup = (lbl: string) => setOpenGroups(prev => {
    const n = new Set(prev); n.has(lbl) ? n.delete(lbl) : n.add(lbl);
    localStorage.setItem("hr_nav_open", JSON.stringify([...n]));
    return n;
  });
  const activeGroupLabel = groups.find(g => g.items.some(it => it.to === location.pathname))?.label;
  const shownGroups = new Set(openGroups);
  // "Main" (the curated primary nav - incl. Admin for super_admin) and "Frequent"
  // are always shown; a stale saved state can never hide them.
  shownGroups.add("Main"); shownGroups.add("Frequent");
  if (activeGroupLabel) shownGroups.add(activeGroupLabel);

  const unreadAlerts = store.alerts.filter(a => !a.isRead).length;
  const today        = new Date().toISOString().split("T")[0];
  const overdueInvoices = (store as { invoices?: { dueDate: string; status: string }[] }).invoices
    ? (store as { invoices: { dueDate: string; status: string }[] }).invoices.filter(inv => inv.dueDate < today && inv.status !== "paid").length
    : 0;
  const badges: Record<string, number> = {};
  if (unreadAlerts > 0)   badges["alerts"]   = unreadAlerts;
  if (overdueInvoices > 0) badges["invoices"] = overdueInvoices;
  if (inviteCount > 0)     badges["settings"]  = inviteCount;

  const handleLogout = async () => { await logout(); navigate("/login"); };
  const toggleCollapse = () => setCollapsed(v => {
    const next = !v;
    localStorage.setItem("hr_sidebar_collapsed", String(next));
    return next;
  });

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className={cn(
        "hidden md:flex flex-col h-screen sticky top-0 shrink-0 z-40",
        "bg-[var(--color-surface)] border-r border-[var(--color-border)]",
        "transition-[width] duration-200",
        collapsed ? "w-14" : "w-56"
      )}>
        {/* Logo row - click returns to the dashboard (home) */}
        <button
          onClick={() => navigate("/dashboard")}
          aria-label="Go to dashboard"
          className={cn(
            "h-14 flex items-center border-b border-[var(--color-border)] shrink-0 select-none w-full hover:opacity-80 transition-opacity cursor-pointer",
            collapsed ? "justify-center" : "px-4"
          )}>
          {collapsed
            ? <Logo variant="mark" size={26} className="text-[var(--color-text)]" />
            : <Logo variant="horizontal" size={22} className="text-[var(--color-text)]" />
          }
        </button>

        {/* Always-visible CTA - the single Build & Automate hub (agents, app builder,
            flows). Shares /agents with the "Build & Automate" nav item: one door. */}
        <NavLink
          to="/agents"
          title="Build & Automate - agents, apps, flows"
          className={cn(
            "shrink-0 mx-2 mt-2 flex items-center gap-2 rounded-lg font-semibold text-[var(--color-bg)] bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-light)] hover:opacity-90 transition-opacity",
            collapsed ? "justify-center p-2" : "px-3 py-2 text-sm"
          )}
        >
          <Wand2 size={collapsed ? 16 : 15} className="shrink-0" />
          {!collapsed && <span>Build</span>}
        </NavLink>

        {/* Client-view banner */}
        {selectedClientTenantId && !collapsed && (
          <div className="mx-2 mt-2 bg-blue-950/60 border border-blue-800/40 rounded-md p-2">
            <div className="flex items-start gap-1.5 mb-1.5">
              <Eye size={10} className="text-blue-400 shrink-0 mt-px" />
              <p className="text-[10px] text-blue-300 truncate font-medium leading-tight">
                {selectedClientLabel || selectedClientTenantId}
                <span className="block text-blue-400/60">{user?.role === "super_admin" ? "editing - changes save to this company" : "read-only"}</span>
              </p>
            </div>
            <button
              onClick={() => { setSelectedClient(null); navigate("/advisor"); }}
              className="w-full text-[10px] bg-blue-900/60 text-blue-200 border border-blue-700/50 px-2 py-1 rounded hover:bg-blue-900/90 transition-colors"
            >
              Exit client view
            </button>
          </div>
        )}
        {selectedClientTenantId && collapsed && (
          <div className="mx-2 mt-2 p-2 bg-blue-950/60 border border-blue-800/40 rounded-md flex items-center justify-center">
            <Eye size={12} className="text-blue-400" />
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 flex flex-col gap-3">
          <NavItems groups={groups} collapsed={collapsed} badges={badges} expanded={shownGroups} onToggleGroup={toggleGroup} lockedPlan={lockedPlan} />
        </nav>

        {/* Search shortcut */}
        {onOpenSearch && (
          <div className="px-2 mb-1 shrink-0">
            <button
              onClick={onOpenSearch}
              title="Search (⌘K)"
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-white/4 transition-colors",
                collapsed && "justify-center"
              )}
            >
              <Search size={13} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{t("common.search")}</span>
                  <kbd className="font-mono text-[10px] bg-[var(--color-bg)] border border-[var(--color-border)] px-1 py-0.5 rounded">⌘K</kbd>
                </>
              )}
            </button>
          </div>
        )}

        {/* User + sign out */}
        <div className="border-t border-[var(--color-border)] p-2 shrink-0">
          <FirmSwitcher collapsed={collapsed} />
          {!collapsed && (
            <div className="px-2 mb-1 min-w-0">
              <p className="text-xs text-[var(--color-text)] truncate">{user?.email}</p>
              <p className="text-[10px] text-[var(--color-muted)] capitalize mt-px">{role.replace("_", " ")}</p>
            </div>
          )}
          {/* Always-visible Admin Console for the platform super_admin (never hidden by nav grouping/scroll) */}
          {user?.role === "super_admin" && (
            <NavLink
              to="/admin"
              title="Admin Console"
              className={({ isActive }) => cn(
                "flex items-center gap-2 text-xs font-semibold transition-colors rounded-md px-2 py-1.5 w-full mb-0.5",
                collapsed && "justify-center",
                isActive
                  ? "text-purple-300 bg-purple-900/30"
                  : "text-purple-300 hover:bg-purple-900/20"
              )}
            >
              <ShieldCheck size={13} />
              {!collapsed && <span>{t("nav.adminConsole")}</span>}
            </NavLink>
          )}
          <NavLink
            to="/profile"
            title="Profile"
            className={({ isActive }) => cn(
              "flex items-center gap-2 text-xs transition-colors rounded-md px-2 py-1.5 w-full mb-0.5",
              collapsed && "justify-center",
              isActive
                ? "text-[var(--color-primary)] bg-[var(--color-primary)]/10"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-white/4"
            )}
          >
            <User size={13} />
            {!collapsed && <span>{t("nav.profile")}</span>}
          </NavLink>
          <button
            onClick={handleLogout}
            title={t("nav.signOut")}
            className={cn(
              "flex items-center gap-2 text-xs text-[var(--color-muted)] hover:text-red-400 transition-colors rounded-md px-2 py-1.5 w-full",
              collapsed && "justify-center"
            )}
          >
            <LogOut size={13} />
            {!collapsed && <span>{t("nav.signOut")}</span>}
          </button>
          {!collapsed && (
            <div className="px-2 pt-1.5">
              <LanguageSwitcher />
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          className="absolute -right-3 top-[72px] w-6 h-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/40 transition-all"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
        </button>
      </aside>

      {/* ── Mobile top bar ───────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-[calc(3rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-4">
        <button onClick={() => navigate("/dashboard")} aria-label="Go to dashboard" className="hover:opacity-80 transition-opacity">
          <Logo variant="horizontal" size={20} className="text-[var(--color-text)] select-none" />
        </button>
        <div className="flex items-center gap-1">
          <NavLink to="/agents" aria-label="Build & Automate" onClick={() => setMobileOpen(false)}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] text-[var(--color-bg)] text-[11px] font-semibold px-2 py-1">
            <Wand2 size={13} /> Build
          </NavLink>
          {onOpenSearch && (
            <button onClick={onOpenSearch} aria-label="Search" className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
              <Search size={18} />
            </button>
          )}
          <button
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Menu"
            className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-0 left-0 h-full w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col">
            <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--color-border)] shrink-0">
              <button onClick={() => { setMobileOpen(false); navigate("/dashboard"); }} aria-label="Go to dashboard" className="hover:opacity-80 transition-opacity">
                <Logo variant="horizontal" size={20} className="text-[var(--color-text)] select-none" />
              </button>
              <button onClick={() => setMobileOpen(false)} className="p-1 text-[var(--color-muted)]">
                <X size={16} />
              </button>
            </div>

            {selectedClientTenantId && (
              <div className="bg-blue-950/60 border-b border-blue-800/40 px-4 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-blue-300 min-w-0">
                  <Eye size={10} className="shrink-0" />
                  <span className="truncate text-[10px]">{selectedClientLabel || selectedClientTenantId}</span>
                </div>
                <button
                  onClick={() => { setSelectedClient(null); navigate("/advisor"); setMobileOpen(false); }}
                  className="text-[10px] bg-blue-900/60 text-blue-200 border border-blue-700/50 px-2 py-0.5 rounded hover:bg-blue-900/90 shrink-0"
                >
                  Exit
                </button>
              </div>
            )}

            <nav className="flex-1 overflow-y-auto py-3 flex flex-col gap-3">
              <NavItems groups={groups} collapsed={false} onNavigate={() => setMobileOpen(false)} badges={badges} expanded={shownGroups} onToggleGroup={toggleGroup} lockedPlan={lockedPlan} />
            </nav>

            <div className="border-t border-[var(--color-border)] pt-2 shrink-0">
              <FirmSwitcher collapsed={false} />
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0 mr-3">
                  <p className="text-xs text-[var(--color-text)] truncate">{user?.email}</p>
                  <p className="text-[10px] text-[var(--color-muted)] capitalize">{role.replace("_", " ")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <LanguageSwitcher compact />
                  <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-red-400 transition-colors">
                    <LogOut size={13} /> {t("nav.signOut")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
