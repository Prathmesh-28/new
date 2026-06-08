import { useApp } from "@/context/AppContext";
import { formatCurrency, monthlyBurn, runwayDays } from "@/lib/utils";
import { AlertTriangle, TrendingDown, Landmark, Bell, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { useCountUp } from "@/hooks/useCountUp";

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400 border-red-800/40 bg-red-950/20",
  high:     "text-orange-400 border-orange-800/40 bg-orange-950/20",
  medium:   "text-yellow-400 border-yellow-800/40 bg-yellow-950/20",
  low:      "text-green-400 border-green-800/40 bg-green-950/20",
};

function StatCard({ label, raw, display, icon: Icon, color, trend }: {
  label: string; raw: number; display: string; icon: React.ElementType;
  color: string; trend?: "up" | "down" | null;
}) {
  const animated = useCountUp(raw, 900);
  const isFormatted = display.includes("₹") || display.includes("days");

  return (
    <div className="group bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 hover:border-[var(--color-primary)]/30 transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[var(--color-muted)] font-medium">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-current/5 ${color}`}>
          <Icon size={14} />
        </div>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>
        {isFormatted ? display : animated.toLocaleString()}
      </p>
      {trend && (
        <div className={`flex items-center gap-1 mt-1.5 text-xs ${trend === "up" ? "text-green-400" : "text-red-400"}`}>
          {trend === "up" ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
          <span>{trend === "up" ? "Healthy" : "Watch closely"}</span>
        </div>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3 shadow-xl text-xs">
      <p className="text-[var(--color-muted)] mb-2 font-medium">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="text-[var(--color-primary)]">₹{p.value}L</p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const { store, markAlertRead } = useApp();
  const { bankAccounts, transactions, alerts, forecast } = store;

  const totalBalance = bankAccounts.reduce((a, b) => a + b.balance, 0);
  const burn         = monthlyBurn(transactions);
  const runway       = runwayDays(bankAccounts.map(b => b.balance), burn);
  const unread       = alerts.filter(a => !a.isRead).length;

  const chartData = forecast.slice(0, 60).map(f => ({
    date: format(new Date(f.date), "MMM d"),
    p50:  Math.round(f.p50 / 100000),
    p90:  Math.round(f.p90 / 100000),
    p10:  Math.round(f.p10 / 100000),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <span className="text-xs text-[var(--color-muted)]">
          Last updated {format(new Date(), "MMM d, HH:mm")}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Balance"  raw={Math.round(totalBalance / 100000)} display={formatCurrency(totalBalance)} icon={Landmark}      color="text-[var(--color-primary)]" trend="up" />
        <StatCard label="Monthly Burn"   raw={Math.round(burn / 100000)}          display={formatCurrency(burn)}         icon={TrendingDown}  color="text-red-400"                trend="down" />
        <StatCard label="Cash Runway"    raw={runway}                              display={`${runway} days`}             icon={AlertTriangle} color={runway < 30 ? "text-red-400" : runway < 90 ? "text-yellow-400" : "text-green-400"} trend={runway < 30 ? "down" : "up"} />
        <StatCard label="Unread Alerts"  raw={unread}                              display={unread.toString()}            icon={Bell}          color="text-orange-400" />
      </div>

      {/* Chart */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-sm font-semibold">60-Day Cash Forecast</h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">P10 / P50 / P90 bands · ₹ Lakhs</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--color-muted)]">
            <span className="flex items-center gap-1.5"><span className="w-6 h-px border-t-2 border-dashed border-[var(--color-primary)]/40 inline-block" />P10/P90</span>
            <span className="flex items-center gap-1.5"><span className="w-6 h-0.5 bg-[var(--color-primary)] inline-block" />P50</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="grad50" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#C9A227" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#C9A227" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad90" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#C9A227" stopOpacity={0.06} />
                <stop offset="95%" stopColor="#C9A227" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={9} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} width={28} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="p90" stroke="#C9A227" strokeWidth={1} strokeDasharray="3 3" fill="url(#grad90)" />
            <Area type="monotone" dataKey="p50" stroke="#C9A227" strokeWidth={2.5} fill="url(#grad50)" />
            <Area type="monotone" dataKey="p10" stroke="#C9A227" strokeWidth={1} strokeDasharray="3 3" fill="transparent" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bank accounts */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-4">Bank Accounts</h2>
          <div className="space-y-1">
            {bankAccounts.map(a => {
              const pct = totalBalance > 0 ? (a.balance / totalBalance) * 100 : 0;
              return (
                <div key={a.id} className="py-2.5 border-b border-[var(--color-border)] last:border-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-[var(--color-muted)]">{a.provider} · {a.status}</p>
                    </div>
                    <span className="text-sm font-bold text-[var(--color-primary)]">{formatCurrency(a.balance)}</span>
                  </div>
                  <div className="h-1 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Recent Alerts</h2>
            {unread > 0 && (
              <span className="text-xs bg-orange-950/40 text-orange-400 border border-orange-800/30 px-2 py-0.5 rounded-full">
                {unread} unread
              </span>
            )}
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 5).map(a => (
              <div
                key={a.id}
                className={`text-xs rounded-xl px-3 py-2.5 border cursor-pointer transition-opacity hover:opacity-100 ${SEV_COLOR[a.severity]} ${a.isRead ? "opacity-40" : ""}`}
                onClick={() => markAlertRead(a.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="uppercase font-bold tracking-wider text-[10px]">{a.severity}</span>
                  {!a.isRead && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                </div>
                <p className="mt-0.5 leading-snug">{a.message}</p>
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="py-8 text-center text-sm text-[var(--color-muted)]">
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                No alerts
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
