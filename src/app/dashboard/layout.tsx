"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAppStore, selectUser, selectSidebarOpen } from "@/lib/store";
import { Button, Spinner } from "@/components/ui";
import { useAlerts } from "@/lib/query";

const NAV: { href: string; label: string; icon: string }[] = [
  { href: "/dashboard",          label: "Overview",  icon: "◈" },
  { href: "/dashboard/forecast", label: "Forecast",  icon: "〜" },
  { href: "/dashboard/credit",   label: "Credit",    icon: "₹" },
  { href: "/dashboard/alerts",   label: "Alerts",    icon: "◉" },
  { href: "/dashboard/settings", label: "Settings",  icon: "⚙" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const user     = useAppStore(selectUser);
  const open     = useAppStore(selectSidebarOpen);
  const toggle   = useAppStore((s) => s.toggleSidebar);
  const clearAuth = useAppStore((s) => s.clearAuth);

  // Unread alert badge
  const { data: unreadAlerts } = useAlerts(user?.tenant_id ?? null, true);
  const unreadCount = unreadAlerts?.length ?? 0;

  // Guard: redirect if not authenticated
  useEffect(() => {
    if (user === null) {
      // Check server session before redirecting
      fetch("/api/admin/session")
        .then((r) => r.json())
        .then((d) => {
          if (d?.user) {
            useAppStore.getState().setUser(d.user);
          } else {
            router.push("/admin/login");
          }
        })
        .catch(() => router.push("/admin/login"));
    }
  }, [user, router]);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    clearAuth();
    router.push("/admin/login");
  }

  if (!user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0f1505" }}
      >
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: "#0f1505", color: "#e8f0c2" }}
    >
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className={`${
          open ? "w-56" : "w-14"
        } flex-shrink-0 flex flex-col transition-all duration-200`}
        style={{ backgroundColor: "#1c2209", borderRight: "1px solid #2e3a10" }}
      >
        {/* Logo */}
        <div
          className="px-4 py-5 flex items-center gap-2 border-b"
          style={{ borderColor: "#2e3a10" }}
        >
          <button
            onClick={toggle}
            className="text-xs"
            style={{ color: "#6b8526" }}
            title="Toggle sidebar"
          >
            ☰
          </button>
          {open && (
            <span
              className="text-base font-bold font-serif text-white truncate"
              style={{ letterSpacing: "-0.02em" }}
            >
              Head<span style={{ color: "#c9a227" }}>room</span>
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 flex flex-col gap-1">
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href;
            const isAlerts = href.includes("alerts");
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-all relative"
                style={{
                  backgroundColor: active ? "#2e3a10" : "transparent",
                  color: active ? "#c4d97a" : "#96b83d",
                }}
              >
                <span className="text-base w-5 text-center flex-shrink-0">
                  {icon}
                </span>
                {open && <span>{label}</span>}
                {isAlerts && unreadCount > 0 && (
                  <span
                    className="ml-auto text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "#7f1d1d", color: "#fca5a5" }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="px-2 py-4 border-t flex flex-col gap-2"
          style={{ borderColor: "#2e3a10" }}
        >
          {open && (
            <p className="text-xs px-2 truncate" style={{ color: "#6b8526" }}>
              {user.email}
            </p>
          )}
          <Button
            variant="danger"
            size="sm"
            onClick={handleLogout}
            className={open ? "w-full" : "w-10 px-2"}
            title="Sign out"
          >
            {open ? "Sign out" : "↩"}
          </Button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <main className="flex-1 p-6 md:p-8 overflow-auto">{children}</main>
    </div>
  );
}
