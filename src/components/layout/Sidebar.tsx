import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import {
  Eye, ChevronLeft, ChevronRight, LogOut, Menu, X,
  LayoutDashboard, TrendingUp, CreditCard, Rocket, ShieldCheck, Settings2,
  Package, Users, Briefcase, PlugZap, FileText, Bell, Receipt,
} from "lucide-react";

interface NavItem  { to: string; label: string; icon: React.ElementType; tab: string }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: Record<string, NavGroup[]> = {
  super_admin: [
    { label: "Core", items: [
      { to: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard, tab: "dashboard"    },
      { to: "/transactions", label: "Transactions", icon: FileText,        tab: "transactions" },
      { to: "/forecast",     label: "Forecast",     icon: TrendingUp,      tab: "forecast"     },
    ]},
    { label: "Finance", items: [
      { to: "/credit",       label: "Credit",       icon: CreditCard,      tab: "credit"       },
      { to: "/capital",      label: "Capital",      icon: Rocket,          tab: "capital"      },
      { to: "/receivables",  label: "Receivables",  icon: Receipt,         tab: "receivables"  },
    ]},
    { label: "Operations", items: [
      { to: "/operations",   label: "Operations",   icon: Package,         tab: "operations"   },
      { to: "/connectors",   label: "Connectors",   icon: PlugZap,         tab: "connectors"   },
    ]},
    { label: "Tools", items: [
      { to: "/alerts",       label: "Alerts",       icon: Bell,            tab: "alerts"       },
      { to: "/settings",     label: "Settings",     icon: Settings2,       tab: "settings"     },
      { to: "/admin",        label: "Admin",        icon: ShieldCheck,     tab: "admin"        },
    ]},
  ],
  owner: [
    { label: "Core", items: [
      { to: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard, tab: "dashboard"    },
      { to: "/transactions", label: "Transactions", icon: FileText,        tab: "transactions" },
      { to: "/forecast",     label: "Forecast",     icon: TrendingUp,      tab: "forecast"     },
    ]},
    { label: "Finance", items: [
      { to: "/credit",       label: "Credit",       icon: CreditCard,      tab: "credit"       },
      { to: "/capital",      label: "Capital",      icon: Rocket,          tab: "capital"      },
      { to: "/receivables",  label: "Receivables",  icon: Receipt,         tab: "receivables"  },
    ]},
    { label: "Operations", items: [
      { to: "/operations",   label: "Operations",   icon: Package,         tab: "operations"   },
      { to: "/connectors",   label: "Connectors",   icon: PlugZap,         tab: "connectors"   },
    ]},
    { label: "Tools", items: [
      { to: "/alerts",       label: "Alerts",       icon: Bell,            tab: "alerts"       },
      { to: "/settings",     label: "Settings",     icon: Settings2,       tab: "settings"     },
    ]},
  ],
  accountant: [
    { label: "", items: [
      { to: "/advisor",      label: "My Clients",   icon: Users,           tab: "advisor"      },
      { to: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard, tab: "dashboard"    },
      { to: "/forecast",     label: "Forecast",     icon: TrendingUp,      tab: "forecast"     },
      { to: "/operations",   label: "Operations",   icon: Package,         tab: "operations"   },
    ]},
  ],
  investor: [
    { label: "", items: [
      { to: "/investor",     label: "Portfolio",    icon: Briefcase,       tab: "investor"     },
      { to: "/capital",      label: "Capital",      icon: Rocket,          tab: "capital"      },
    ]},
  ],
};

function NavItems({ groups, collapsed, onNavigate }: {
  groups: NavGroup[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {groups.map(group => (
        <div key={group.label || "default"} className="px-2">
          {group.label && !collapsed && (
            <p className="text-[10px] font-semibold text-[var(--color-muted)]/50 uppercase tracking-widest px-2 mb-1 mt-1 select-none">
              {group.label}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map(({ to, label, icon: Icon, tab }) => (
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
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-white/4"
                )}
              >
                <Icon size={15} className="shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export default function Sidebar() {
  const { user, logout }                          = useAuth();
  const { canAccess, selectedClientTenantId,
          selectedClientLabel, setSelectedClient } = useApp();
  const navigate                                  = useNavigate();
  const [collapsed, setCollapsed]                 = useState(
    () => localStorage.getItem("hr_sidebar_collapsed") === "true"
  );
  const [mobileOpen, setMobileOpen]               = useState(false);

  const role   = user?.role ?? "owner";
  const groups = (NAV_GROUPS[role] ?? NAV_GROUPS.owner)
    .map(g => ({ ...g, items: g.items.filter(n => canAccess(n.tab)) }))
    .filter(g => g.items.length > 0);

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
        {/* Logo row */}
        <div className={cn(
          "h-14 flex items-center border-b border-[var(--color-border)] shrink-0 select-none",
          collapsed ? "justify-center" : "px-4"
        )}>
          {collapsed
            ? <span className="text-base font-bold text-[var(--color-primary)]">H</span>
            : <span className="text-base font-bold tracking-tight">Head<span className="text-[var(--color-primary)]">room</span></span>
          }
        </div>

        {/* Client-view banner */}
        {selectedClientTenantId && !collapsed && (
          <div className="mx-2 mt-2 bg-blue-950/60 border border-blue-800/40 rounded-md p-2">
            <div className="flex items-start gap-1.5 mb-1.5">
              <Eye size={10} className="text-blue-400 shrink-0 mt-px" />
              <p className="text-[10px] text-blue-300 truncate font-medium leading-tight">
                {selectedClientLabel || selectedClientTenantId}
                <span className="block text-blue-400/60">read-only</span>
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
          <NavItems groups={groups} collapsed={collapsed} />
        </nav>

        {/* User + sign out */}
        <div className="border-t border-[var(--color-border)] p-2 shrink-0">
          {!collapsed && (
            <div className="px-2 mb-1 min-w-0">
              <p className="text-xs text-[var(--color-text)] truncate">{user?.email}</p>
              <p className="text-[10px] text-[var(--color-muted)] capitalize mt-px">{role.replace("_", " ")}</p>
            </div>
          )}
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
        <span className="text-base font-bold tracking-tight select-none">
          Head<span className="text-[var(--color-primary)]">room</span>
        </span>
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* ── Mobile drawer ────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-0 left-0 h-full w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col">
            <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--color-border)] shrink-0">
              <span className="text-base font-bold tracking-tight select-none">
                Head<span className="text-[var(--color-primary)]">room</span>
              </span>
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
              <NavItems groups={groups} collapsed={false} onNavigate={() => setMobileOpen(false)} />
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
