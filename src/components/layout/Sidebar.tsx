import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth, BASE } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import {
  Eye, ChevronLeft, ChevronRight, ChevronDown, Lock, LogOut, Menu, X, Search, User,
  LayoutDashboard, TrendingUp, CreditCard, Rocket, ShieldCheck, Settings2,
  Package, Users, Briefcase, PlugZap, FileText, Bell, Receipt,
  FilePlus, Calculator, Wallet, Store, Landmark, BarChart3, Sparkles, Building2,
  PiggyBank, HeartPulse, RefreshCcw, Scale, Gem, CalendarCheck, ScanSearch,
  MessageCircle, Sliders, PhoneCall, Award, FolderOpen, FileSpreadsheet, ScrollText, Database,
  Handshake, IndianRupee, Umbrella, Coins, Leaf, Globe,
  ShoppingCart, Network, Workflow, Bot, ShieldAlert, KeyRound, Banknote, Radar,
  Mic, Smartphone, Blocks, FlaskConical, BookOpen, Factory, LineChart, UsersRound, Wand2,
} from "lucide-react";

import { FEATURE_ENTITLEMENTS, PLAN_RANK, PLAN_LABEL, type PlanTier } from "@/data/types";
import { getFrequentPages } from "@/components/CommandPalette";

interface NavItem  { to: string; label: string; icon: React.ElementType; tab: string }
interface NavGroup { label: string; items: NavItem[] }

// ─────────────────────────────────────────────────────────────────────────────
// Single master navigation catalogue — every page in the app, organised by the
// JOB the user is doing (user-flow categories), not by which team built it.
// Each role's sidebar is derived from this ONE list, filtered by canAccess() —
// so categorisation stays identical for everyone and we never duplicate it per
// role. Order of groups = the natural daily flow: understand → sell → record →
// run → people → plan → fund → automate → extend → administer.
// ─────────────────────────────────────────────────────────────────────────────
const NAV_CATALOG: NavGroup[] = [
  { label: "Overview", items: [
    { to: "/dashboard",       label: "Dashboard",     icon: LayoutDashboard, tab: "dashboard"  },
    { to: "/analytics",       label: "Analytics",     icon: BarChart3,       tab: "analytics"  },
    { to: "/insights",        label: "Insights",      icon: LineChart,       tab: "insights"   },
    { to: "/health",          label: "Fin Health",    icon: HeartPulse,      tab: "health"     },
    { to: "/cfo-brief",       label: "CFO Brief",     icon: Sparkles,        tab: "cfo-brief"  },
    { to: "/benchmarks",      label: "Benchmarks",    icon: Award,           tab: "benchmarks" },
  ]},
  { label: "Sales & CRM", items: [
    { to: "/crm",             label: "CRM",           icon: Handshake,       tab: "crm"         },
    { to: "/sales",           label: "Sales Pipeline",icon: TrendingUp,      tab: "sales"       },
    { to: "/invoices",        label: "Invoices",      icon: FilePlus,        tab: "invoices"    },
    { to: "/receivables",     label: "Receivables",   icon: Receipt,         tab: "receivables" },
    { to: "/collections",     label: "Collections",   icon: PhoneCall,       tab: "collections" },
  ]},
  { label: "Accounting & Tax", items: [
    { to: "/transactions",    label: "Transactions",  icon: FileText,        tab: "transactions" },
    { to: "/books",           label: "Books (GL)",    icon: BookOpen,        tab: "books"        },
    { to: "/gst",             label: "GST",           icon: Calculator,      tab: "gst"          },
    { to: "/tax",             label: "Tax Autopilot", icon: ShieldCheck,     tab: "tax"          },
    { to: "/statements",      label: "Statements",    icon: FileSpreadsheet, tab: "statements"   },
    { to: "/payments",        label: "Payments",      icon: IndianRupee,     tab: "payments"     },
    { to: "/banking",         label: "Banking",       icon: Banknote,        tab: "banking"      },
  ]},
  { label: "Operations", items: [
    { to: "/erp",             label: "ERP / Mfg",     icon: Factory,         tab: "erp"         },
    { to: "/operations",      label: "Operations",    icon: Package,         tab: "operations"  },
    { to: "/vendors",         label: "Vendors",       icon: Building2,       tab: "vendors"     },
    { to: "/suppliers",       label: "Suppliers",     icon: Store,           tab: "suppliers"   },
    { to: "/spend",           label: "Spend Intel",   icon: ScanSearch,      tab: "spend"       },
    { to: "/connectors",      label: "Connectors",    icon: PlugZap,         tab: "connectors"  },
  ]},
  { label: "People", items: [
    { to: "/hrms",            label: "HRMS",          icon: Users,           tab: "hrms"    },
    { to: "/payroll",         label: "Payroll",       icon: Wallet,          tab: "payroll" },
  ]},
  { label: "Planning", items: [
    { to: "/forecast",        label: "Forecast",      icon: TrendingUp,      tab: "forecast"        },
    { to: "/budgets",         label: "Budgets",       icon: PiggyBank,       tab: "budgets"         },
    { to: "/working-capital", label: "Working Capital",icon: RefreshCcw,     tab: "working-capital" },
    { to: "/scenarios",       label: "Scenarios",     icon: Sliders,         tab: "scenarios"       },
    { to: "/predict",         label: "Predict",       icon: Radar,           tab: "predict"         },
    { to: "/compliance",      label: "Compliance",    icon: CalendarCheck,   tab: "compliance"      },
  ]},
  { label: "Capital & Treasury", items: [
    { to: "/capital",         label: "Capital",       icon: Rocket,          tab: "capital"    },
    { to: "/credit",          label: "Credit",        icon: CreditCard,      tab: "credit"     },
    { to: "/debt",            label: "Debt",          icon: Scale,           tab: "debt"       },
    { to: "/valuation",       label: "Valuation",     icon: Gem,             tab: "valuation"  },
    { to: "/term-sheet",      label: "Term Sheet",    icon: ScrollText,      tab: "term-sheet" },
    { to: "/lenders",         label: "Lenders",       icon: Landmark,        tab: "lenders"    },
    { to: "/investor",        label: "Investors",     icon: Briefcase,       tab: "investor"   },
    { to: "/treasury",        label: "Treasury",      icon: Coins,           tab: "treasury"   },
    { to: "/insurance",       label: "Insurance",     icon: Umbrella,        tab: "insurance"  },
  ]},
  { label: "AI & Automation", items: [
    { to: "/agents",          label: "Agent Studio",  icon: Wand2,           tab: "agents"     },
    { to: "/copilot",         label: "AI CFO",        icon: Bot,             tab: "copilot"    },
    { to: "/automation",      label: "Automation",    icon: Workflow,        tab: "automation" },
    { to: "/whatsapp",        label: "WhatsApp",      icon: MessageCircle,   tab: "whatsapp"   },
    { to: "/voice",           label: "Voice",         icon: Mic,             tab: "voice"      },
    { to: "/documents",       label: "Documents",     icon: FolderOpen,      tab: "documents"  },
    { to: "/advisor",         label: "Advisor / CA",  icon: Users,           tab: "advisor"    },
    { to: "/alerts",          label: "Alerts",        icon: Bell,            tab: "alerts"     },
    { to: "/field",           label: "Field/Offline", icon: Smartphone,      tab: "field"      },
  ]},
  { label: "Markets & Labs", items: [
    { to: "/marketplace",     label: "Marketplace",   icon: ShoppingCart,    tab: "marketplace" },
    { to: "/network",         label: "B2B Network",   icon: Network,         tab: "network"     },
    { to: "/global",          label: "Global",        icon: Globe,           tab: "global"      },
    { to: "/esg",             label: "ESG",           icon: Leaf,            tab: "esg"         },
    { to: "/tokens",          label: "Tokens",        icon: Blocks,          tab: "tokens"      },
    { to: "/frontier",        label: "Frontier Lab",  icon: FlaskConical,    tab: "frontier"    },
  ]},
  { label: "Organization", items: [
    // The company-admin console (members, roles & access, billing, company,
    // audit). Gated on the "settings" tab, so only owner + super_admin see it.
    { to: "/organization",    label: "Organization",  icon: UsersRound,      tab: "settings"   },
    { to: "/settings",        label: "Settings",      icon: Settings2,       tab: "settings"   },
    { to: "/data",            label: "Data & Import", icon: Database,        tab: "data"        },
    { to: "/security",        label: "Security",      icon: ShieldAlert,     tab: "security"    },
    { to: "/privacy",         label: "Privacy",       icon: KeyRound,        tab: "privacy"     },
    { to: "/admin",           label: "Admin Console", icon: ShieldCheck,     tab: "admin"       },
    { to: "/admin/data",      label: "All Data",      icon: Database,        tab: "admin"       },
  ]},
];

// Audit #1 — the 6-8 daily-driver pages per role shown up top as "Main"; the rest
// stay collapsed under their user-flow group. The 20% of features used 80% of the time.
const PRIMARY_NAV: Record<string, string[]> = {
  super_admin:        ["dashboard", "transactions", "invoices", "gst", "forecast", "agents", "admin", "settings"],
  owner:              ["dashboard", "transactions", "invoices", "gst", "forecast", "agents", "settings"],
  finance_manager:    ["dashboard", "transactions", "invoices", "receivables", "gst", "agents", "forecast"],
  accountant:         ["dashboard", "transactions", "books", "gst", "tax", "agents", "compliance", "advisor"],
  sales:              ["dashboard", "crm", "invoices", "receivables", "collections", "agents"],
  operations_manager: ["dashboard", "operations", "erp", "vendors", "suppliers", "agents", "spend"],
  viewer:             ["dashboard", "analytics", "health", "cfo-brief", "forecast", "agents"],
  investor:           ["investor", "capital", "valuation", "term-sheet", "lenders"],
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
                <span className="flex-1 text-left">{group.label}</span>
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
                      title={collapsed ? label : undefined}
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
                      {!collapsed && <span className="flex-1 truncate">{label}</span>}
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
  // One catalogue, filtered to what this role can actually reach. Empty groups drop out.
  const groupsRaw = NAV_CATALOG
    .map(g => ({ ...g, items: g.items.filter(n => canAccess(n.tab)) }))
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
  // Dedup is by PATH (not tab) so items that intentionally share a tab — e.g.
  // /admin + /admin/data, or /settings + /settings#team — don't collide.
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
  // "Main" (the curated primary nav — incl. Admin for super_admin) and "Frequent"
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
        {/* Logo row — click returns to the dashboard (home) */}
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

        {/* Always-visible CTA — build your own AI agent, reachable from every tab */}
        <NavLink
          to="/agents"
          title="Build your own AI agent"
          className={cn(
            "shrink-0 mx-2 mt-2 flex items-center gap-2 rounded-lg font-semibold text-[var(--color-bg)] bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-light)] hover:opacity-90 transition-opacity",
            collapsed ? "justify-center p-2" : "px-3 py-2 text-sm"
          )}
        >
          <Wand2 size={collapsed ? 16 : 15} className="shrink-0" />
          {!collapsed && <span>Build an Agent</span>}
        </NavLink>

        {/* Client-view banner */}
        {selectedClientTenantId && !collapsed && (
          <div className="mx-2 mt-2 bg-blue-950/60 border border-blue-800/40 rounded-md p-2">
            <div className="flex items-start gap-1.5 mb-1.5">
              <Eye size={10} className="text-blue-400 shrink-0 mt-px" />
              <p className="text-[10px] text-blue-300 truncate font-medium leading-tight">
                {selectedClientLabel || selectedClientTenantId}
                <span className="block text-blue-400/60">{user?.role === "super_admin" ? "editing — changes save to this company" : "read-only"}</span>
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
                  <span className="flex-1 text-left">Search…</span>
                  <kbd className="font-mono text-[10px] bg-[var(--color-bg)] border border-[var(--color-border)] px-1 py-0.5 rounded">⌘K</kbd>
                </>
              )}
            </button>
          </div>
        )}

        {/* User + sign out */}
        <div className="border-t border-[var(--color-border)] p-2 shrink-0">
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
              {!collapsed && <span>Admin Console</span>}
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
            {!collapsed && <span>Profile</span>}
          </NavLink>
          <button
            onClick={handleLogout}
            title="Sign out"
            className={cn(
              "flex items-center gap-2 text-xs text-[var(--color-muted)] hover:text-red-400 transition-colors rounded-md px-2 py-1.5 w-full",
              collapsed && "justify-center"
            )}
          >
            <LogOut size={13} />
            {!collapsed && <span>Sign out</span>}
          </button>
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
      <div className="md:hidden fixed top-0 left-0 right-0 h-12 z-50 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-4">
        <button onClick={() => navigate("/dashboard")} aria-label="Go to dashboard" className="hover:opacity-80 transition-opacity">
          <Logo variant="horizontal" size={20} className="text-[var(--color-text)] select-none" />
        </button>
        <div className="flex items-center gap-1">
          <NavLink to="/agents" aria-label="Build an Agent" onClick={() => setMobileOpen(false)}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] text-[var(--color-bg)] text-[11px] font-semibold px-2 py-1">
            <Wand2 size={13} /> Agent
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

            <div className="border-t border-[var(--color-border)] px-4 py-3 flex items-center justify-between shrink-0">
              <div className="min-w-0 mr-3">
                <p className="text-xs text-[var(--color-text)] truncate">{user?.email}</p>
                <p className="text-[10px] text-[var(--color-muted)] capitalize">{role.replace("_", " ")}</p>
              </div>
              <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-red-400 transition-colors shrink-0">
                <LogOut size={13} /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
