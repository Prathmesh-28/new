"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore, selectUser } from "@/lib/store";
import { DJANGO_URL } from "@/lib/query";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ForecastData {
  id: string;
  forecast_date: string;
  alerts?: string[];
}

interface CreditApplication {
  id: string;
  amount: number;
  status: string;
  created_at: string;
}

interface CapitalRaise {
  id: string;
  title: string;
  target_amount: number;
  status: string;
}

type Section = "overview" | "forecast" | "credit" | "capital" | "pages";

const PAGES = [
  { name: "Home",          path: "/",          description: "Hero, stats, features, credit section, how it works, testimonials, CTA" },
  { name: "Platform",      path: "/features/", description: "Full platform feature breakdown" },
  { name: "Pricing",       path: "/pricing/",  description: "Starter $29, Growth $79, Pro $149 + capital raise add-on $299" },
  { name: "Credit Rescue", path: "/credit/",   description: "Embedded credit rescue — silent underwriting + repayment simulation" },
  { name: "Capital Raise", path: "/capital/",  description: "Three capital tracks: Rev-share, Reg CF, Reg A+" },
  { name: "App Dashboard", path: "/dashboard/",description: "Product dashboard — live forecast, alerts, credit, capital" },
];

// ─── Component ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router     = useRouter();
  const user       = useAppStore(selectUser);
  const clearAuth  = useAppStore((s) => s.clearAuth);
  const token      = useAppStore((s) => s.token);

  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [loading, setLoading]     = useState(true);
  const [forecastData, setForecastData]   = useState<ForecastData[]>([]);
  const [creditData, setCreditData]       = useState<CreditApplication[]>([]);
  const [capitalData, setCapitalData]     = useState<CapitalRaise[]>([]);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const loadData = useCallback(async (tenantId: string) => {
    setLoading(true);
    const [fRes, cRes, capRes] = await Promise.allSettled([
      fetch(`${DJANGO_URL}/organisations/${tenantId}/forecast`,            { headers: authHeaders }).then((r) => r.json()),
      fetch(`${DJANGO_URL}/credit/applications?tenant_id=${tenantId}`,    { headers: authHeaders }).then((r) => r.json()),
      fetch(`${DJANGO_URL}/capital/raises?tenant_id=${tenantId}`,         { headers: authHeaders }).then((r) => r.json()),
    ]);
    if (fRes.status === "fulfilled") {
      const v = fRes.value;
      setForecastData(Array.isArray(v) ? v : v?.id ? [v] : []);
    }
    if (cRes.status === "fulfilled") setCreditData(Array.isArray(cRes.value) ? cRes.value : []);
    if (capRes.status === "fulfilled") setCapitalData(Array.isArray(capRes.value?.results ?? capRes.value) ? (capRes.value?.results ?? capRes.value) : []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!user) { router.push("/admin/login/"); return; }
    loadData(user.tenant_id);
  }, [user, router, loadData]);

  function handleLogout() {
    clearAuth();
    router.push("/admin/login/");
  }

  if (!user || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0f1505" }}>
        <div className="text-white text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#0f1505", color: "#e8f0c2" }}>
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col" style={{ backgroundColor: "#1c2209", borderRight: "1px solid #2e3a10" }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: "#2e3a10" }}>
          <span className="text-lg font-bold font-serif text-white" style={{ letterSpacing: "-0.02em" }}>
            Head<span style={{ color: "#c9a227" }}>room</span>
          </span>
          <p className="text-xs mt-0.5" style={{ color: "#6b8526" }}>Admin Portal</p>
          <p className="text-xs mt-1 truncate" style={{ color: "#96b83d" }}>{user.email}</p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {(["overview", "forecast", "credit", "capital", "pages"] as Section[]).map((id) => (
            <button key={id} onClick={() => setActiveSection(id)}
              className="text-left w-full px-3 py-2 rounded-lg text-sm capitalize transition-all"
              style={{ backgroundColor: activeSection === id ? "#2e3a10" : "transparent", color: activeSection === id ? "#c4d97a" : "#96b83d" }}>
              {id}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t flex flex-col gap-2" style={{ borderColor: "#2e3a10" }}>
          <Link href="/dashboard/" target="_blank"
            className="block text-center w-full px-3 py-2 rounded-lg text-xs transition-all"
            style={{ backgroundColor: "#2e3a10", color: "#c4d97a" }}>
            App dashboard ↗
          </Link>
          <button onClick={handleLogout}
            className="w-full px-3 py-2 rounded-lg text-xs transition-all hover:opacity-80"
            style={{ backgroundColor: "#4a1a1a", color: "#fca5a5" }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto">
        {activeSection === "overview"  && <OverviewSection forecastData={forecastData} creditData={creditData} capitalData={capitalData} onRefresh={() => loadData(user.tenant_id)} />}
        {activeSection === "forecast"  && <ForecastSection  data={forecastData} onRefresh={() => loadData(user.tenant_id)} />}
        {activeSection === "credit"    && <CreditSection    data={creditData}   onRefresh={() => loadData(user.tenant_id)} />}
        {activeSection === "capital"   && <CapitalSection   data={capitalData}  onRefresh={() => loadData(user.tenant_id)} />}
        {activeSection === "pages"     && <PagesSection />}
      </main>
    </div>
  );
}

// ─── Primitives ─────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold font-serif text-white">{title}</h1>
      {subtitle && <p className="text-sm mt-1" style={{ color: "#6b8526" }}>{subtitle}</p>}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl p-5 ${className}`} style={{ backgroundColor: "#1c2209", border: "1px solid #2e3a10" }}>
      {children}
    </div>
  );
}

function Badge({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
      style={{ backgroundColor: gold ? "rgba(201,162,39,0.2)" : "rgba(107,133,38,0.2)", color: gold ? "#c9a227" : "#96b83d" }}>
      {children}
    </span>
  );
}

function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
      style={{ backgroundColor: "#4a5e1a", color: "#c4d97a" }}>
      Refresh
    </button>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

function OverviewSection({ forecastData, creditData, capitalData, onRefresh }: {
  forecastData: ForecastData[]; creditData: CreditApplication[]; capitalData: CapitalRaise[]; onRefresh: () => void;
}) {
  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <SectionHeader title="Dashboard Overview" subtitle="Headroom — Cash Flow Intelligence for SMBs" />
        <RefreshButton onClick={onRefresh} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Forecasts",      value: forecastData.length },
          { label: "Credit Apps",    value: creditData.length },
          { label: "Capital Raises", value: capitalData.length },
          { label: "Active Alerts",  value: forecastData.reduce((a, f) => a + (f.alerts?.length ?? 0), 0) },
        ].map(({ label, value }) => (
          <Card key={label}>
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "#6b8526" }}>{label}</p>
            <p className="text-3xl font-bold text-white">{value}</p>
          </Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "#96b83d" }}>Recent Forecasts</h2>
          {forecastData.length > 0 ? (
            <div className="space-y-3">
              {forecastData.slice(0, 3).map((f, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0" style={{ borderColor: "#2e3a10" }}>
                  <span className="text-sm" style={{ color: "#e8f0c2" }}>{new Date(f.forecast_date).toLocaleDateString()}</span>
                  <Badge>{f.alerts?.length ?? 0} alerts</Badge>
                </div>
              ))}
            </div>
          ) : <p className="text-sm" style={{ color: "#6b8526" }}>No forecasts yet</p>}
        </Card>
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "#96b83d" }}>Recent Activity</h2>
          <div className="space-y-3">
            {creditData.slice(0, 2).map((app, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b" style={{ borderColor: "#2e3a10" }}>
                <span className="text-sm" style={{ color: "#e8f0c2" }}>Credit ₹{app.amount?.toLocaleString()}</span>
                <Badge gold={app.status === "approved"}>{app.status}</Badge>
              </div>
            ))}
            {capitalData.slice(0, 2).map((raise, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b" style={{ borderColor: "#2e3a10" }}>
                <span className="text-sm" style={{ color: "#e8f0c2" }}>{raise.title}</span>
                <Badge gold={raise.status === "active"}>{raise.status}</Badge>
              </div>
            ))}
            {forecastData.length === 0 && creditData.length === 0 && capitalData.length === 0 && (
              <p className="text-sm" style={{ color: "#6b8526" }}>No recent activity</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function ForecastSection({ data, onRefresh }: { data: ForecastData[]; onRefresh: () => void }) {
  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <SectionHeader title="Cash Flow Forecasts" subtitle="90-day predictions with confidence bands" />
        <RefreshButton onClick={onRefresh} />
      </div>
      {data.length > 0 ? (
        <div className="space-y-4">
          {data.map((forecast, i) => (
            <Card key={forecast.id ?? i}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Forecast {new Date(forecast.forecast_date).toLocaleDateString()}
                  </h3>
                </div>
                <Badge gold>{forecast.alerts?.length ?? 0} alerts</Badge>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card><p className="text-center py-8" style={{ color: "#6b8526" }}>No forecasts available. Connect bank accounts to generate predictions.</p></Card>
      )}
    </>
  );
}

function CreditSection({ data, onRefresh }: { data: CreditApplication[]; onRefresh: () => void }) {
  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <SectionHeader title="Credit Applications" subtitle="Embedded credit rescue with silent underwriting" />
        <RefreshButton onClick={onRefresh} />
      </div>
      {data.length > 0 ? (
        <div className="space-y-4">
          {data.map((app) => (
            <Card key={app.id}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-white">₹{app.amount?.toLocaleString() ?? "—"}</h3>
                  <p className="text-sm" style={{ color: "#6b8526" }}>{new Date(app.created_at).toLocaleDateString()}</p>
                </div>
                <Badge gold={app.status === "approved"}>{app.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      ) : <Card><p className="text-center py-8" style={{ color: "#6b8526" }}>No credit applications yet.</p></Card>}
    </>
  );
}

function CapitalSection({ data, onRefresh }: { data: CapitalRaise[]; onRefresh: () => void }) {
  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <SectionHeader title="Capital Raises" subtitle="Revenue-share, Reg CF, and Reg A+ tracks" />
        <RefreshButton onClick={onRefresh} />
      </div>
      {data.length > 0 ? (
        <div className="space-y-4">
          {data.map((raise) => (
            <Card key={raise.id}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-white">{raise.title}</h3>
                  <p className="text-sm" style={{ color: "#6b8526" }}>Target: ₹{raise.target_amount?.toLocaleString()}</p>
                </div>
                <Badge gold={raise.status === "active"}>{raise.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      ) : <Card><p className="text-center py-8" style={{ color: "#6b8526" }}>No capital raises yet.</p></Card>}
    </>
  );
}

function PagesSection() {
  return (
    <>
      <SectionHeader title="Site Pages" subtitle="Marketing pages and app routes" />
      <div className="grid gap-4">
        {PAGES.map((page) => (
          <Card key={page.path}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-white mb-1">{page.name}</h3>
                <code className="text-xs" style={{ color: "#6b8526" }}>{page.path}</code>
                <p className="text-sm mt-1" style={{ color: "#e8f0c2" }}>{page.description}</p>
              </div>
              <Link href={page.path} target="_blank"
                className="text-sm px-3 py-1 rounded transition-all hover:opacity-90 flex-shrink-0"
                style={{ backgroundColor: "#2e3a10", color: "#c4d97a" }}>
                View ↗
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
