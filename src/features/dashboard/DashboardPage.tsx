import { useApp } from "@/context/AppContext";
import { formatCurrency, formatNumber, monthlyBurn, runwayDays } from "@/lib/utils";
import { AlertTriangle, TrendingDown, Landmark, Bell } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400 border-red-800/40 bg-red-950/20",
  high:     "text-orange-400 border-orange-800/40 bg-orange-950/20",
  medium:   "text-yellow-400 border-yellow-800/40 bg-yellow-950/20",
  low:      "text-green-400 border-green-800/40 bg-green-950/20",
};

export default function DashboardPage() {
  const { store, markAlertRead } = useApp();
  const { bankAccounts, transactions, alerts, forecast } = store;

  const totalBalance = bankAccounts.reduce((a, b) => a + b.balance, 0);
  const burn = monthlyBurn(transactions);
  const runway = runwayDays(bankAccounts.map(b => b.balance), burn);
  const unread = alerts.filter(a => !a.isRead).length;

  const chartData = forecast.slice(0, 60).map(f => ({
    date: format(new Date(f.date), "MMM d"),
    p10:  Math.round(f.p10 / 100000),
    p50:  Math.round(f.p50 / 100000),
    p90:  Math.round(f.p90 / 100000),
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Balance",  value: formatCurrency(totalBalance), icon: Landmark,      color: "text-[var(--color-primary)]" },
          { label: "Monthly Burn",   value: formatCurrency(burn),         icon: TrendingDown,  color: "text-red-400" },
          { label: "Cash Runway",    value: `${runway} days`,             icon: AlertTriangle, color: runway < 30 ? "text-red-400" : "text-green-400" },
          { label: "Unread Alerts",  value: unread.toString(),            icon: Bell,          color: "text-orange-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--color-muted)] font-medium">{label}</span>
              <Icon size={16} className={color} />
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
        <h2 className="text-sm font-semibold mb-4">60-Day Cash Forecast (₹L)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gp90" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#C9A227" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#C9A227" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={9} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: "#1e1e14", border: "1px solid #2e2e1a", borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [`₹${v}L`, ""]}
            />
            <Area type="monotone" dataKey="p90" stroke="#C9A227" strokeWidth={1} strokeDasharray="3 3" fill="url(#gp90)" />
            <Area type="monotone" dataKey="p50" stroke="#C9A227" strokeWidth={2} fill="transparent" />
            <Area type="monotone" dataKey="p10" stroke="#C9A227" strokeWidth={1} strokeDasharray="3 3" fill="transparent" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bank accounts */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3">Bank Accounts</h2>
          <div className="space-y-2">
            {bankAccounts.map(a => (
              <div key={a.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{a.provider} · {a.status}</p>
                </div>
                <span className="text-sm font-bold text-[var(--color-primary)]">{formatCurrency(a.balance)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3">Recent Alerts</h2>
          <div className="space-y-2">
            {alerts.slice(0, 5).map(a => (
              <div key={a.id}
                className={`text-xs rounded-lg px-3 py-2 border cursor-pointer ${SEV_COLOR[a.severity]} ${a.isRead ? "opacity-50" : ""}`}
                onClick={() => markAlertRead(a.id)}
              >
                <span className="uppercase font-semibold mr-1">{a.severity}</span>
                {a.message}
              </div>
            ))}
            {alerts.length === 0 && <p className="text-sm text-[var(--color-muted)]">No alerts</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
