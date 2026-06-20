import { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import SyncIndicator from "./SyncIndicator";
import FeatureGuide from "./FeatureGuide";
import { recordRecentPage } from "./CommandPalette";
import { TAB_CATALOG } from "@/data/roles";

// C14 breadcrumb + C8 sync indicator, plus it feeds the command-palette "Recent"
// list by recording each page you land on.
const LABELS: Record<string, string> = {
  ...Object.fromEntries(TAB_CATALOG.map(t => [`/${t.tab}`, t.label])),
  "/admin": "Super Admin", "/admin/data": "All Data", "/settings": "Settings",
  "/organization": "Organization", "/profile": "Profile",
  "/cfo-brief": "CFO Brief", "/term-sheet": "Term Sheet", "/working-capital": "Working Capital",
};

export default function AppTopMeta() {
  const { pathname } = useLocation();
  useEffect(() => { if (pathname && pathname !== "/") recordRecentPage(pathname); }, [pathname]);
  const onDashboard = pathname === "/dashboard" || pathname === "/";
  const label = LABELS[pathname] || pathname.replace("/", "").replace(/-/g, " ") || "Home";
  return (
    <div className="flex items-center justify-between mb-4">
      <nav aria-label="Breadcrumb" className="text-xs text-[var(--color-muted)] flex items-center gap-1.5">
        <Link to="/dashboard" className="hover:text-[var(--color-text)]">Home</Link>
        {!onDashboard && <><span>/</span><span className="text-[var(--color-text)] font-medium capitalize">{label}</span></>}
      </nav>
      <div className="flex items-center gap-2">
        <FeatureGuide />
        <SyncIndicator />
      </div>
    </div>
  );
}
