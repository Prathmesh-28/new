import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { formatCurrency, monthlyBurn, runwayDays, generateId } from "@/lib/utils";
import { AlertTriangle, TrendingDown, Landmark, Bell, ArrowUpRight, ArrowDownRight, Plus, Building2, Upload } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { useCountUp } from "@/hooks/useCountUp";
import { toast } from "sonner";
import TransactionImportModal from "@/components/TransactionImportModal";

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
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 hover:border-[var(--color-primary)]/30 transition-all">
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

function AddAccountModal({ onClose, onAdd }: { onClose: () => void; onAdd: (a: { name: string; balance: number; provider: string }) => void }) {
  const [name, setName]         = useState("");
  const [balance, setBalance]   = useState("");
  const [provider, setProvider] = useState("Manual");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !balance) return;
    const bal = parseFloat(balance);
    if (isNaN(bal)) { toast.error("Enter a valid balance"); return; }
    onAdd({ name, balance: bal, provider });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-base font-bold mb-4">Add Bank Account</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input required value={name} onChange={e => setName(e.target.value)} placeholder="Account name (e.g. HDFC Current)"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input required type="number" min="0" value={balance} onChange={e => setBalance(e.target.value)} placeholder="Current balance (₹)"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          <select value={provider} onChange={e => setProvider(e.target.value)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm outline-none">
            {["Manual", "HDFC", "ICICI", "SBI", "Axis", "Kotak", "Yes Bank", "Razorpay", "Stripe"].map(p => <option key={p}>{p}</option>)}
          </select>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-xl text-sm hover:opacity-90">Add Account</button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-xl">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddTransactionModal({ accountId, onClose, onAdd }: { accountId: string; onClose: () => void; onAdd: (t: object) => void }) {
  const [desc, setDesc]         = useState("");
  const [amount, setAmount]     = useState("");
  const [type, setType]         = useState<"income" | "expense">("income");
  const [category, setCategory] = useState("revenue");
  const [date, setDate]         = useState(new Date().toISOString().split("T")[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!desc || isNaN(amt) || amt <= 0) { toast.error("Fill all fields with valid values"); return; }
    onAdd({
      id: generateId(), date, description: desc,
      amount: type === "expense" ? -amt : amt,
      category, counterparty: "", isRecurring: false, bankAccountId: accountId,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-base font-bold mb-4">Add Transaction</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            {(["income", "expense"] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${type === t ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                {t === "income" ? "Income +" : "Expense −"}
              </button>
            ))}
          </div>
          <input required value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input required type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹)"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm outline-none">
            {["revenue", "expense", "payroll", "tax", "loan", "other"].map(c => <option key={c}>{c}</option>)}
          </select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm outline-none" />
          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-xl text-sm hover:opacity-90">Add</button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-xl">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { store, markAlertRead, addBankAccount, addTransaction } = useApp();
  const { bankAccounts, transactions, alerts, forecast } = store;
  const navigate = useNavigate();
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddTx, setShowAddTx]           = useState(false);
  const [showImport,    setShowImport]      = useState(false);

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

  const isEmpty = bankAccounts.length === 0 && transactions.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddAccount(true)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40 transition-colors">
            <Building2 size={12} /> Add Account
          </button>
          {bankAccounts.length > 0 && (
            <>
              <button onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40 transition-colors">
                <Upload size={12} /> Import CSV
              </button>
              <button onClick={() => setShowAddTx(true)}
                className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
                <Plus size={12} /> Add Transaction
              </button>
            </>
          )}
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="border border-dashed border-[var(--color-border)] rounded-2xl p-10 text-center">
          <Building2 size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-semibold mb-1">Add your first bank account</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-xs mx-auto">
            Connect your accounts to start tracking cash flow, generate forecasts, and get alerts.
          </p>
          <button onClick={() => setShowAddAccount(true)}
            className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-xl text-sm hover:opacity-90">
            Add Bank Account
          </button>
        </div>
      )}

      {!isEmpty && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <StatCard label="Total Balance"  raw={Math.round(totalBalance / 100000)} display={formatCurrency(totalBalance)} icon={Landmark}      color="text-[var(--color-primary)]" trend="up" />
            <StatCard label="Monthly Burn"   raw={Math.round(burn / 100000)}          display={formatCurrency(burn)}         icon={TrendingDown}  color="text-red-400"                trend="down" />
            <StatCard label="Cash Runway"    raw={runway}                              display={`${runway} days`}             icon={AlertTriangle} color={runway < 30 ? "text-red-400" : runway < 90 ? "text-yellow-400" : "text-green-400"} trend={runway < 30 ? "down" : "up"} />
            <StatCard label="Unread Alerts"  raw={unread}                              display={unread.toString()}            icon={Bell}          color="text-orange-400" />
          </div>

          {/* Credit rescue CTA */}
          {runway > 0 && runway < 45 && (
            <div className="bg-red-950/20 border border-red-800/40 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertTriangle size={16} className="text-red-400 shrink-0" />
                <p className="text-sm">Your cash runway is <strong className="text-red-400">{runway} days</strong> — balance pressure detected. Act now before it becomes critical.</p>
              </div>
              <button onClick={() => navigate("/credit")}
                className="text-xs bg-red-900/40 text-red-300 border border-red-800/40 px-3 py-1.5 rounded-lg hover:bg-red-900/60 shrink-0 whitespace-nowrap">
                See rescue options →
              </button>
            </div>
          )}

          {/* Chart */}
          {forecast.length > 0 ? (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <div>
                  <h2 className="text-sm font-semibold">60-Day Cash Forecast</h2>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">P10 / P50 / P90 bands · ₹ Lakhs</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="grad50" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#C9A227" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#C9A227" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} interval={9} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#8a8060" }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip contentStyle={{ background: "#1e1e14", border: "1px solid #2e2e1a", borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`₹${v}L`, ""]} />
                  <Area type="monotone" dataKey="p90" stroke="#C9A227" strokeWidth={1} strokeDasharray="3 3" fill="#C9A22710" />
                  <Area type="monotone" dataKey="p50" stroke="#C9A227" strokeWidth={2.5} fill="url(#grad50)" />
                  <Area type="monotone" dataKey="p10" stroke="#C9A227" strokeWidth={1} strokeDasharray="3 3" fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-xl p-8 text-center text-sm text-[var(--color-muted)]">
              Go to <strong className="text-[var(--color-text)]">Forecast</strong> to generate your 90-day cash projection.
            </div>
          )}

          {/* Category burn breakdown + inflow vs outflow */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Burn by category */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-3">Monthly burn by category</h2>
              {(() => {
                const cats = ["payroll","expense","loan","tax","transfer"];
                const totals = cats.map(c => ({
                  cat: c,
                  val: Math.abs(transactions.filter(t => t.category === c && t.amount < 0).reduce((s, t) => s + t.amount, 0)),
                })).filter(x => x.val > 0).sort((a, b) => b.val - a.val);
                const max = totals[0]?.val ?? 1;
                const CAT_CLR: Record<string, string> = { payroll:"bg-blue-500", expense:"bg-red-500", loan:"bg-purple-500", tax:"bg-orange-500", transfer:"bg-[var(--color-muted)]" };
                return totals.length === 0
                  ? <p className="text-sm text-[var(--color-muted)] py-4 text-center">No expense transactions yet</p>
                  : <div className="space-y-2">{totals.map(({ cat, val }) => (
                      <div key={cat}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="capitalize font-medium">{cat}</span>
                          <span className="text-[var(--color-muted)]">{formatCurrency(val)}</span>
                        </div>
                        <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${CAT_CLR[cat] ?? "bg-[var(--color-primary)]"}`} style={{ width: `${(val / max) * 100}%` }} />
                        </div>
                      </div>
                    ))}</div>;
              })()}
            </div>

            {/* Inflow vs Outflow this month vs last */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-3">This month vs last month</h2>
              {(() => {
                const now = new Date();
                const thisM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
                const lastM = new Date(now.getFullYear(), now.getMonth()-1, 1);
                const lastMStr = `${lastM.getFullYear()}-${String(lastM.getMonth()+1).padStart(2,"0")}`;
                const thisIn  = transactions.filter(t => t.date.startsWith(thisM) && t.amount > 0).reduce((s,t) => s+t.amount, 0);
                const thisOut = transactions.filter(t => t.date.startsWith(thisM) && t.amount < 0).reduce((s,t) => s+Math.abs(t.amount), 0);
                const lastIn  = transactions.filter(t => t.date.startsWith(lastMStr) && t.amount > 0).reduce((s,t) => s+t.amount, 0);
                const lastOut = transactions.filter(t => t.date.startsWith(lastMStr) && t.amount < 0).reduce((s,t) => s+Math.abs(t.amount), 0);
                const rows = [
                  { label: "Inflow",  this: thisIn,  last: lastIn,  color: "text-green-400" },
                  { label: "Outflow", this: thisOut, last: lastOut, color: "text-red-400" },
                  { label: "Net",     this: thisIn - thisOut, last: lastIn - lastOut, color: thisIn - thisOut >= 0 ? "text-green-400" : "text-red-400" },
                ];
                return (
                  <div className="space-y-3">
                    {rows.map(({ label, this: cur, last, color }) => {
                      const delta = last > 0 ? ((cur - last) / last) * 100 : 0;
                      return (
                        <div key={label} className="flex items-center justify-between text-sm">
                          <span className="text-[var(--color-muted)] text-xs w-14">{label}</span>
                          <span className={`font-bold ${color}`}>{formatCurrency(cur)}</span>
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-[var(--color-muted)]">prev {formatCurrency(last)}</span>
                            {last > 0 && (
                              <span className={delta >= 0 ? "text-green-400" : "text-red-400"}>{delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(0)}%</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bank accounts */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">Bank Accounts</h2>
                <button onClick={() => setShowAddAccount(true)} className="text-xs text-[var(--color-primary)] hover:underline">+ Add</button>
              </div>
              <div className="space-y-1">
                {bankAccounts.map(a => {
                  const pct = totalBalance > 0 ? (a.balance / totalBalance) * 100 : 0;
                  return (
                    <div key={a.id} className="py-2.5 border-b border-[var(--color-border)] last:border-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <p className="text-sm font-medium">{a.name}</p>
                          <p className="text-xs text-[var(--color-muted)]">{a.provider}</p>
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
                {unread > 0 && <span className="text-xs bg-orange-950/40 text-orange-400 border border-orange-800/30 px-2 py-0.5 rounded-full">{unread} unread</span>}
              </div>
              <div className="space-y-2">
                {alerts.slice(0, 5).map(a => (
                  <div key={a.id} onClick={() => markAlertRead(a.id)}
                    className={`text-xs rounded-xl px-3 py-2.5 border cursor-pointer transition-opacity hover:opacity-100 ${SEV_COLOR[a.severity]} ${a.isRead ? "opacity-40" : ""}`}>
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
                    No alerts yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onAdd={({ name, balance, provider }) => {
            addBankAccount({ id: generateId(), name, provider, balance, lastSync: new Date().toISOString(), status: "connected" });
            toast.success("Account added");
          }}
        />
      )}
      {showAddTx && bankAccounts[0] && (
        <AddTransactionModal
          accountId={bankAccounts[0].id}
          onClose={() => setShowAddTx(false)}
          onAdd={tx => { addTransaction(tx as Parameters<typeof addTransaction>[0]); toast.success("Transaction recorded"); }}
        />
      )}
      {showImport && bankAccounts[0] && (
        <TransactionImportModal
          bankAccountId={bankAccounts[0].id}
          onClose={() => setShowImport(false)}
          onImport={txns => txns.forEach(t => addTransaction(t))}
        />
      )}
    </div>
  );
}
