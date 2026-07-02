import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, FilePlus, ArrowRightLeft, Handshake, Search, type LucideIcon } from "lucide-react";
import { useT } from "@/i18n";

/* Mobile-only bottom tab bar. On a phone the sidebar is behind a hamburger, so the daily
   destinations were two taps away; this puts the four most-visited ones one thumb-tap from
   anywhere, plus a "More" that opens the ⌘K command palette (full search + every page).
   Hidden on md+ where the desktop sidebar is always present. */
const TABS: { to: string; labelKey: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { to: "/dashboard",    labelKey: "mobilenav.home",     icon: LayoutDashboard, match: p => p === "/" || p.startsWith("/dashboard") },
  { to: "/invoices",     labelKey: "mobilenav.invoices", icon: FilePlus,        match: p => p.startsWith("/invoices") },
  { to: "/transactions", labelKey: "mobilenav.money",    icon: ArrowRightLeft,  match: p => p.startsWith("/transactions") },
  { to: "/sales",        labelKey: "mobilenav.sales",    icon: Handshake,       match: p => p.startsWith("/sales") },
];

export default function MobileBottomNav({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const t = useT();

  const itemCls = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
      active ? "text-[var(--color-primary)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
    }`;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex items-stretch pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      {TABS.map(({ to, labelKey, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <button key={to} onClick={() => navigate(to)} className={itemCls(active)} aria-current={active ? "page" : undefined}>
            <Icon size={19} strokeWidth={active ? 2.4 : 2} />
            {t(labelKey)}
          </button>
        );
      })}
      <button onClick={onOpenSearch} className={itemCls(false)} aria-label="Search and more">
        <Search size={19} strokeWidth={2} />
        {t("mobilenav.more")}
      </button>
    </nav>
  );
}
