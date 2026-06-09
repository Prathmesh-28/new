import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { Eye } from "lucide-react";
import {
  LayoutDashboard, TrendingUp, CreditCard, Rocket, ShieldCheck, Settings2,
  LogOut, Menu, X, Package, Users, Briefcase, PlugZap, FileText, Bell, Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_BY_ROLE: Record<string, { to: string; label: string; icon: React.ElementType; tab: string }[]> = {
  super_admin: [
    { to: "/dashboard",     label: "Dashboard",     icon: LayoutDashboard, tab: "dashboard"     },
    { to: "/transactions",  label: "Transactions",  icon: FileText,        tab: "transactions"  },
    { to: "/alerts",        label: "Alerts",        icon: Bell,            tab: "alerts"        },
    { to: "/receivables",   label: "Receivables",   icon: Receipt,         tab: "receivables"   },
    { to: "/forecast",      label: "Forecast",      icon: TrendingUp,      tab: "forecast"      },
    { to: "/credit",        label: "Credit",        icon: CreditCard,      tab: "credit"        },
    { to: "/capital",       label: "Capital",       icon: Rocket,          tab: "capital"       },
    { to: "/operations",    label: "Operations",    icon: Package,         tab: "operations"    },
    { to: "/connectors",    label: "Connectors",    icon: PlugZap,         tab: "connectors"    },
    { to: "/settings",      label: "Settings",      icon: Settings2,       tab: "settings"      },
    { to: "/admin",         label: "Admin",         icon: ShieldCheck,     tab: "admin"         },
  ],
  owner: [
    { to: "/dashboard",     label: "Dashboard",     icon: LayoutDashboard, tab: "dashboard"     },
    { to: "/transactions",  label: "Transactions",  icon: FileText,        tab: "transactions"  },
    { to: "/alerts",        label: "Alerts",        icon: Bell,            tab: "alerts"        },
    { to: "/receivables",   label: "Receivables",   icon: Receipt,         tab: "receivables"   },
    { to: "/forecast",      label: "Forecast",      icon: TrendingUp,      tab: "forecast"      },
    { to: "/credit",        label: "Credit",        icon: CreditCard,      tab: "credit"        },
    { to: "/capital",       label: "Capital",       icon: Rocket,          tab: "capital"       },
    { to: "/operations",    label: "Operations",    icon: Package,         tab: "operations"    },
    { to: "/connectors",    label: "Connectors",    icon: PlugZap,         tab: "connectors"    },
    { to: "/settings",      label: "Settings",      icon: Settings2,       tab: "settings"      },
  ],
  accountant: [
    { to: "/dashboard",  label: "Dashboard",   icon: LayoutDashboard, tab: "dashboard"  },
    { to: "/forecast",   label: "Forecast",    icon: TrendingUp,      tab: "forecast"   },
    { to: "/operations", label: "Operations",  icon: Package,         tab: "operations" },
    { to: "/advisor",    label: "My Clients",  icon: Users,           tab: "advisor"    },
  ],
  investor: [
    { to: "/investor",   label: "Portfolio",   icon: Briefcase,       tab: "investor"   },
  ],
};

export default function Header() {
  const { user, logout }                          = useAuth();
  const { canAccess, selectedClientTenantId,
          selectedClientLabel, setSelectedClient } = useApp();
  const navigate                                  = useNavigate();
  const [open, setOpen]                           = useState(false);

  const role = user?.role ?? "owner";
  const nav  = (NAV_BY_ROLE[role] ?? NAV_BY_ROLE.owner).filter(n => canAccess(n.tab));

  const handleLogout = async () => { await logout(); navigate("/login"); };

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between h-14">
        {/* Logo */}
        <span className="text-lg font-bold tracking-tight shrink-0">
          Head<span className="text-[var(--color-primary)]">room</span>
        </span>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          {nav.map(({ to, label, icon: Icon, tab }) => (
            <NavLink key={to} to={to} end={tab === "dashboard"}
              className={({ isActive }) => cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--color-primary)] text-[var(--color-bg)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)]"
              )}>
              <Icon size={13} />{label}
            </NavLink>
          ))}
        </nav>

        {/* Desktop user */}
        <div className="hidden md:flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-[var(--color-muted)] truncate max-w-[160px]">{user?.email}</p>
            <p className="text-[10px] text-[var(--color-muted)] opacity-60 capitalize">{role.replace("_", " ")}</p>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
            <LogOut size={14} />
          </button>
        </div>

        {/* Mobile hamburger */}
        <button onClick={() => setOpen(v => !v)}
          className="md:hidden p-2 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)] transition-colors"
          aria-label="Toggle menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Client view banner */}
      {selectedClientTenantId && (
        <div className="bg-blue-950/60 border-t border-blue-800/40 px-4 md:px-6 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-blue-300 min-w-0">
            <Eye size={12} className="shrink-0" />
            <span className="truncate">
              Viewing client: <strong className="text-blue-100">{selectedClientLabel || selectedClientTenantId}</strong>
              <span className="ml-2 opacity-60">— read-only</span>
            </span>
          </div>
          <button
            onClick={() => { setSelectedClient(null); navigate("/advisor"); }}
            className="shrink-0 text-xs bg-blue-900/60 text-blue-200 border border-blue-700/50 px-3 py-1 rounded-lg hover:bg-blue-900/90 transition-colors"
          >
            Exit client view
          </button>
        </div>
      )}

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 pb-4">
          <nav className="flex flex-col gap-1 pt-3">
            {nav.map(({ to, label, icon: Icon, tab }) => (
              <NavLink key={to} to={to} end={tab === "dashboard"}
                onClick={() => setOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--color-primary)] text-[var(--color-bg)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)]"
                )}>
                <Icon size={16} />{label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-[var(--color-border)] mt-3 pt-3 flex items-center justify-between">
            <div>
              <span className="text-xs text-[var(--color-muted)] truncate max-w-[200px]">{user?.email}</span>
              <p className="text-[10px] text-[var(--color-muted)] opacity-60 capitalize">{role.replace("_", " ")}</p>
            </div>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-red-400 transition-colors">
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
