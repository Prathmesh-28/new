import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { LayoutDashboard, TrendingUp, CreditCard, Rocket, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tab: "dashboard" },
  { to: "/forecast", label: "Forecast",  icon: TrendingUp,      tab: "forecast"  },
  { to: "/credit",   label: "Credit",    icon: CreditCard,      tab: "credit"    },
  { to: "/capital",  label: "Capital",   icon: Rocket,          tab: "capital"   },
  { to: "/admin",    label: "Admin",     icon: Settings,        tab: "admin"     },
];

export default function Header() {
  const { user, logout } = useAuth();
  const { canAccess, store } = useApp();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
        {/* Logo */}
        <span className="text-lg font-bold tracking-tight">
          Head<span className="text-[var(--color-primary)]">room</span>
        </span>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {NAV.filter(n => canAccess(n.tab)).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/dashboard"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--color-primary)] text-[var(--color-bg)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)]"
                )
              }
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-muted)]">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
