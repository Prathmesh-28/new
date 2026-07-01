import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, FilePlus, ArrowRightLeft, Handshake, Search, type LucideIcon } from "lucide-react";

/* Mobile-only bottom tab bar. On a phone the sidebar is behind a hamburger, so the daily
   destinations were two taps away; this puts the four most-visited ones one thumb-tap from
   anywhere, plus a "More" that opens the ⌘K command palette (full search + every page).
   Hidden on md+ where the desktop sidebar is always present. */
const TABS: { to: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { to: "/dashboard",    label: "Home",     icon: LayoutDashboard, match: p => p === "/" || p.startsWith("/dashboard") },
  { to: "/invoices",     label: "Invoices", icon: FilePlus,        match: p => p.startsWith("/invoices") },
  { to: "/transactions", label: "Money",    icon: ArrowRightLeft,  match: p => p.startsWith("/transactions") },
  { to: "/sales",        label: "Sales",    icon: Handshake,       match: p => p.startsWith("/sales") },
];

export default function MobileBottomNav({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const itemCls = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
      active ? "text-[var(--color-primary)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
    }`;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex items-stretch pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      {TABS.map(({ to, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <button key={to} onClick={() => navigate(to)} className={itemCls(active)} aria-current={active ? "page" : undefined}>
            <Icon size={19} strokeWidth={active ? 2.4 : 2} />
            {label}
          </button>
        );
      })}
      <button onClick={onOpenSearch} className={itemCls(false)} aria-label="Search and more">
        <Search size={19} strokeWidth={2} />
        More
      </button>
    </nav>
  );
}
