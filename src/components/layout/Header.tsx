import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { LayoutDashboard, TrendingUp, CreditCard, Rocket, ShieldCheck, Settings2, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tab: "dashboard" },
  { to: "/forecast",  label: "Forecast",  icon: TrendingUp,      tab: "forecast"  },
  { to: "/credit",    label: "Credit",    icon: CreditCard,      tab: "credit"    },
  { to: "/capital",   label: "Capital",   icon: Rocket,          tab: "capital"   },
  { to: "/settings",  label: "Settings",  icon: Settings2,       tab: "settings"  },
  { to: "/admin",     label: "Admin",     icon: ShieldCheck,     tab: "admin"     },
];

export default function Header() {
  const { user, logout } = useAuth();
  const { canAccess }    = useApp();
  const navigate         = useNavigate();
  const [open, setOpen]  = useState(false);

  const visibleNav = NAV.filter(n => canAccess(n.tab));

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between h-14">
        {/* Logo */}
        <span className="text-lg font-bold tracking-tight shrink-0">
          Head<span className="text-[var(--color-primary)]">room</span>
        </span>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {visibleNav.map(({ to, label, icon: Icon, tab }) => (
            <NavLink
              key={to} to={to} end={tab === "dashboard"}
              className={({ isActive }) => cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--color-primary)] text-[var(--color-bg)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)]"
              )}
            >
              <Icon size={14} />{label}
            </NavLink>
          ))}
        </nav>

        {/* Desktop user */}
        <div className="hidden md:flex items-center gap-3">
          <span className="text-xs text-[var(--color-muted)] truncate max-w-[160px]">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(v => !v)}
          className="md:hidden p-2 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)] transition-colors"
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 pb-4">
          <nav className="flex flex-col gap-1 pt-3">
            {visibleNav.map(({ to, label, icon: Icon, tab }) => (
              <NavLink
                key={to} to={to} end={tab === "dashboard"}
                onClick={() => setOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--color-primary)] text-[var(--color-bg)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)]"
                )}
              >
                <Icon size={16} />{label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-[var(--color-border)] mt-3 pt-3 flex items-center justify-between">
            <span className="text-xs text-[var(--color-muted)] truncate max-w-[200px]">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-red-400 transition-colors"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
