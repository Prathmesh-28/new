import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Landmark, Plus, RefreshCw, Calculator, Tag, Trash2, Layers, FolderTree, Scale,
} from "lucide-react";
import DatePicker from "@/components/DatePicker";

interface ItBlockRow { block: string; rate: number; opening_wdv: number; additions: number; additions_lt180: number; disposals: number; depreciation: number; closing_wdv: number; stcg: number; stcl: number }
interface ItDep { fy: string; blocks: ItBlockRow[]; total: { opening_wdv: number; additions: number; disposals: number; it_depreciation: number; closing_wdv: number; stcg: number; stcl: number }; book_depreciation_fy: number; timing_difference: number; committed: boolean; warnings: string[] }

// ─────────────────────────────────────────────────────────────────────────────
// TYPES - mirror backend/src/modules/books/assets.js (loose; columns are snake_case)
// ─────────────────────────────────────────────────────────────────────────────
interface AssetRow {
  id: string;
  name: string;
  cost: string | number;
  salvage?: string | number;
  acquired_on: string;
  method: "SLM" | "WDV" | string;
  rate: string | number;
  accumulated_dep?: string | number;
  asset_group?: string | null;
  is_active?: boolean;
  last_dep_on?: string | null;
  disposed_on?: string | null;
  disposal_value?: string | number | null;
}

interface RegisterAsset {
  id: string;
  name: string;
  assetGroup: string;
  method: string;
  rate: string;
  acquiredOn: string;
  cost: string;
  accumulatedDep: string;
  wdv: string;
  status: "active" | "disposed" | string;
  disposedOn: string | null;
  disposalValue: string | null;
}
interface RegisterGroup {
  group: string;
  count: number;
  assets: RegisterAsset[];
  subtotal: { cost: string; accumulatedDep: string; wdv: string };
}
interface Register {
  status: string;
  groups: RegisterGroup[];
  total: { count: number; cost: string; accumulatedDep: string; wdv: string };
}

interface DepResult {
  asOf: string;
  posted: { asset: string; period: string; depreciation: string; voucher: string }[];
}

interface Ledger {
  id: string;
  name: string;
  is_bank?: boolean;
  isBank?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function num(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function rupee(v: string | number | null | undefined): string {
  return `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

const DEP_METHODS = [
  { id: "SLM", label: "SLM - straight line (on cost)" },
  { id: "WDV", label: "WDV - written-down value" },
] as const;

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "disposed", label: "Disposed" },
] as const;

const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]";
const thCls =
  "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]";
const thR = `${thCls} text-right`;

// ─────────────────────────────────────────────────────────────────────────────
// SMALL PIECES
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, tint }: { label: string; value: string; tint?: "green" | "red" }) {
  const color =
    tint === "green" ? "text-green-400" : tint === "red" ? "text-red-400" : "text-[var(--color-primary)]";
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex-1 min-w-[150px]">
      <p className="text-[11px] text-[var(--color-muted)]">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function Card({ title, icon, children, action }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="text-[var(--color-primary)]">{icon}</span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksAssetsTab() {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [register, setRegister] = useState<Register | null>(null);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [status, setStatus] = useState<string>("all");
  const [busy, setBusy] = useState(true);
  const [running, setRunning] = useState(false);
  const [asOf, setAsOf] = useState(todayIso());
  const [lastRun, setLastRun] = useState<DepResult | null>(null);
  const nowFy = useMemo(() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; }, []);
  const [itFy, setItFy] = useState<number>(nowFy);
  const [itDep, setItDep] = useState<ItDep | null>(null);
  const [itBusy, setItBusy] = useState(false);
  const [clsAsset, setClsAsset] = useState("");
  const [clsBlock, setClsBlock] = useState("");
  const [clsRate, setClsRate] = useState("");

  const load = useCallback(async (st: string) => {
    setBusy(true);
    try {
      const [a, reg] = await Promise.all([
        api.get<unknown>("/api/books/assets"),
        api.get<Register>(`/api/books/assets/register?status=${encodeURIComponent(st)}`),
      ]);
      setAssets(asArray<AssetRow>(a));
      setRegister(reg);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  useEffect(() => {
    (async () => {
      try {
        const l = await api.get<unknown>("/api/books/ledgers");
        const list = asArray<Ledger>(l).filter((x) => x.is_bank || x.isBank);
        setLedgers(list);
      } catch {
        /* bank ledger list optional - only needed when disposing for proceeds */
      }
    })();
  }, []);

  const runDepreciation = async () => {
    if (!asOf) {
      toast.error("Pick an as-of date");
      return;
    }
    setRunning(true);
    try {
      const res = await api.post<DepResult>("/api/books/assets/depreciation/run", { asOf });
      setLastRun(res);
      const n = res?.posted?.length ?? 0;
      toast.success(n ? `Posted ${n} depreciation entr${n === 1 ? "y" : "ies"}` : "Nothing to depreciate - already up to date");
      await load(status);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  const loadItDep = useCallback(async (fy: number) => {
    setItBusy(true);
    try { setItDep(await api.get<ItDep>(`/api/books/assets/it-depreciation?fy=${fy}`)); }
    catch { setItDep(null); }
    finally { setItBusy(false); }
  }, []);
  useEffect(() => { void loadItDep(itFy); }, [itFy, loadItDep]);

  const closeItFy = async () => {
    setItBusy(true);
    try { const r = await api.post<ItDep>("/api/books/assets/it-depreciation/close", { fy: itFy }); setItDep(r); toast.success(`FY ${r.fy} closed - closing WDV carried forward`); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setItBusy(false); }
  };
  const classify = async () => {
    if (!clsAsset || clsRate.trim() === "" || !Number.isFinite(Number(clsRate))) { toast.error("Pick an asset and enter an IT rate"); return; }
    try {
      await api.patch(`/api/books/assets/${clsAsset}/it-block`, { itBlock: clsBlock.trim() || undefined, itRate: Number(clsRate) });
      toast.success("Asset classified for IT Act");
      setClsBlock(""); setClsRate("");
      await loadItDep(itFy);
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-6">
      {/* HEADER + HOW TO USE */}
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Landmark size={18} className="text-[var(--color-primary)]" /> Fixed assets
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-3xl">
          How to use: register each capitalised asset with its cost, acquisition date and an annual depreciation
          rate (SLM on cost, or WDV on the written-down value). Run depreciation to post a monthly Dr Depreciation /
          Cr Accumulated Depreciation journal - it catches up month-by-month to the as-of date. Group assets for the
          register subtotals, and dispose an asset to book the gain/loss and remove it from the net block.
        </p>
      </div>

      {/* NET BLOCK SUMMARY */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Assets" value={String(register?.total?.count ?? 0)} />
        <StatCard label="Gross cost" value={rupee(register?.total?.cost)} />
        <StatCard label="Accumulated depreciation" value={rupee(register?.total?.accumulatedDep)} tint="red" />
        <StatCard label="Net block (WDV)" value={rupee(register?.total?.wdv)} tint="green" />
      </div>

      {/* ADD ASSET + RUN DEPRECIATION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AddAssetForm onCreated={() => load(status)} />

        <Card title="Run depreciation" icon={<Calculator size={15} />}>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Depreciate up to (as-of date)</label>
              <DatePicker value={asOf} onChange={setAsOf} />
            </div>
            <p className="text-[11px] text-[var(--color-muted)]">
              Posts one journal per asset per elapsed month from each asset's last run (or acquisition) up to and
              including the as-of month. Needs seeded "Depreciation" and "Accumulated Depreciation" ledgers.
            </p>
            <button type="button" onClick={runDepreciation} disabled={running} className={`${btnPrimary} w-full`}>
              {running ? <RefreshCw size={14} className="animate-spin" /> : <Calculator size={14} />}
              Run depreciation
            </button>

            {lastRun && (
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm max-h-56 overflow-y-auto">
                <p className="text-[11px] text-[var(--color-muted)] mb-2">
                  As of {lastRun.asOf} · {lastRun.posted.length} entr{lastRun.posted.length === 1 ? "y" : "ies"} posted
                </p>
                {lastRun.posted.length === 0 ? (
                  <p className="text-[var(--color-muted)]">No depreciation due - all assets are up to date.</p>
                ) : (
                  <ul className="space-y-1">
                    {lastRun.posted.map((p, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="truncate">{p.asset} <span className="text-[var(--color-muted)]">· {p.period}</span></span>
                        <span className="tabular-nums text-red-400 whitespace-nowrap">{rupee(p.depreciation)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* DEPRECIATION BOARD / REGISTER */}
      <Card
        title="Depreciation board - asset register"
        icon={<FolderTree size={15} />}
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatus(f.id)}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    status === f.id
                      ? "bg-[var(--color-primary)] text-[var(--color-bg)]"
                      : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void load(status)} className={btnGhost} title="Refresh">
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            </button>
          </div>
        }
      >
        {busy ? (
          <p className="text-sm text-[var(--color-muted)] py-8 text-center">Loading register…</p>
        ) : (register?.groups?.length ?? 0) === 0 ? (
          <p className="text-sm text-[var(--color-muted)] py-8 text-center border border-dashed border-[var(--color-border)] rounded-lg">
            No assets yet - register one above.
          </p>
        ) : (
          <div className="space-y-6">
            {register!.groups.map((g) => (
              <div key={g.group}>
                <div className="flex items-center gap-2 mb-2">
                  <Layers size={14} className="text-[var(--color-muted)]" />
                  <h4 className="text-sm font-semibold">{g.group}</h4>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] tabular-nums">
                    {g.count}
                  </span>
                </div>
                <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
                  <table className="w-full text-sm border-collapse min-w-[760px]">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        <th className={thCls}>Asset</th>
                        <th className={thCls}>Method</th>
                        <th className={thR}>Rate</th>
                        <th className={thR}>Acquired</th>
                        <th className={thR}>Cost</th>
                        <th className={thR}>Accum. dep.</th>
                        <th className={thR}>WDV</th>
                        <th className={thCls}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.assets.map((a) => (
                        <tr key={a.id} className="border-b border-[var(--color-border)] last:border-b-0">
                          <td className="px-3 py-2.5 font-medium">{a.name}</td>
                          <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{a.method}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{num(a.rate)}%</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)] whitespace-nowrap">{a.acquiredOn}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{rupee(a.cost)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-red-400">{rupee(a.accumulatedDep)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--color-primary)]">{rupee(a.wdv)}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              a.status === "active"
                                ? "bg-green-900/30 text-green-300 border-green-700/40"
                                : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]"
                            }`}>
                              {a.status === "disposed" && a.disposedOn ? `disposed ${a.disposedOn}` : a.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[var(--color-border)] font-semibold bg-[var(--color-bg)]/40">
                        <td className="px-3 py-2.5" colSpan={4}>Subtotal - {g.group}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{rupee(g.subtotal.cost)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-red-400">{rupee(g.subtotal.accumulatedDep)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{rupee(g.subtotal.wdv)}</td>
                        <td className="px-3 py-2.5" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}

            {/* GRAND TOTAL NET BLOCK */}
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-[11px] text-[var(--color-muted)]">Total assets</p><p className="font-bold tabular-nums">{register!.total.count}</p></div>
              <div><p className="text-[11px] text-[var(--color-muted)]">Gross cost</p><p className="font-bold tabular-nums">{rupee(register!.total.cost)}</p></div>
              <div><p className="text-[11px] text-[var(--color-muted)]">Accumulated dep.</p><p className="font-bold tabular-nums text-red-400">{rupee(register!.total.accumulatedDep)}</p></div>
              <div><p className="text-[11px] text-[var(--color-muted)]">Net block (WDV)</p><p className="font-bold tabular-nums text-[var(--color-primary)]">{rupee(register!.total.wdv)}</p></div>
            </div>
          </div>
        )}
      </Card>

      {/* INCOME-TAX ACT (BLOCK-OF-ASSETS) DEPRECIATION - dual book */}
      <Card
        title="Income-Tax Act depreciation (block-of-assets)"
        icon={<Scale size={15} />}
        action={
          <div className="flex items-center gap-2">
            <select value={itFy} onChange={(e) => setItFy(Number(e.target.value))} className={`${inputCls} !w-auto`}>
              {[nowFy - 2, nowFy - 1, nowFy, nowFy + 1].map((y) => <option key={y} value={y}>FY {y}-{String(y + 1).slice(2)}</option>)}
            </select>
            <button type="button" onClick={() => void loadItDep(itFy)} className={btnGhost} title="Recompute"><RefreshCw size={14} className={itBusy ? "animate-spin" : ""} /></button>
          </div>
        }
      >
        <p className="text-sm text-[var(--color-muted)] mb-3 max-w-3xl">
          Block-of-assets WDV depreciation for income tax - separate from the Companies-Act book depreciation above.
          Additions put to use for under 180 days get half the block rate; a block that empties on disposal stops
          depreciating (residual WDV becomes a short-term capital loss/gain). Classify each asset's IT block, then
          Close each year in sequence to carry the closing WDV forward as next year's opening.
        </p>
        {/* Classify an asset for IT Act */}
        <div className="flex flex-wrap items-end gap-2 mb-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
          <div><label className={labelCls}>Asset</label>
            <select value={clsAsset} onChange={(e) => setClsAsset(e.target.value)} className={inputCls}>
              <option value="">Select…</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>
          <div><label className={labelCls}>IT block</label><input value={clsBlock} onChange={(e) => setClsBlock(e.target.value)} placeholder="e.g. Plant & Machinery" className={inputCls} /></div>
          <div><label className={labelCls}>IT rate %</label><input value={clsRate} onChange={(e) => setClsRate(e.target.value)} type="number" placeholder="15" className={`${inputCls} !w-24`} /></div>
          <button type="button" onClick={classify} className={btnPrimary}>Classify</button>
        </div>
        {itBusy ? (
          <p className="text-sm text-[var(--color-muted)] py-6 text-center">Computing…</p>
        ) : !itDep || itDep.blocks.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)] py-6 text-center border border-dashed border-[var(--color-border)] rounded-lg">No assets classified for IT Act yet - classify one above.</p>
        ) : (
          <>
            <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
              <table className="w-full text-sm border-collapse min-w-[820px]">
                <thead><tr className="border-b border-[var(--color-border)]">
                  <th className={thCls}>Block</th><th className={thR}>Rate</th><th className={thR}>Opening WDV</th><th className={thR}>Additions</th><th className={thR}>Disposals</th><th className={thR}>Depreciation</th><th className={thR}>Closing WDV</th><th className={thR}>STCG / STCL</th>
                </tr></thead>
                <tbody>
                  {itDep.blocks.map((b) => (
                    <tr key={b.block} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="px-3 py-2.5 font-medium">{b.block}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{b.rate}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(b.opening_wdv)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(b.additions)}{b.additions_lt180 > 0 && <span className="text-[10px] text-[var(--color-muted)]"> ({rupee(b.additions_lt180)} @½)</span>}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{b.disposals > 0 ? rupee(b.disposals) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-400">{rupee(b.depreciation)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--color-primary)]">{rupee(b.closing_wdv)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">{b.stcg > 0 ? <span className="text-green-400">+{rupee(b.stcg)}</span> : b.stcl > 0 ? <span className="text-red-400">−{rupee(b.stcl)}</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="IT Act depreciation" value={rupee(itDep.total.it_depreciation)} tint="red" />
              <StatCard label="Book depreciation (FY)" value={rupee(itDep.book_depreciation_fy)} />
              <StatCard label="Timing difference (book − IT)" value={rupee(itDep.timing_difference)} tint={itDep.timing_difference >= 0 ? "green" : "red"} />
              <StatCard label="Closing WDV (IT)" value={rupee(itDep.total.closing_wdv)} tint="green" />
            </div>
            {itDep.warnings?.length > 0 && (
              <div className="mt-3 text-[11px] text-amber-400 space-y-1">{itDep.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}</div>
            )}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button type="button" onClick={closeItFy} disabled={itBusy || itDep.committed} className={btnPrimary}>{itDep.committed ? "FY closed ✓" : "Close FY (save rollforward)"}</button>
              <span className="text-[11px] text-[var(--color-muted)]">Saves this FY's closing WDV as next year's opening. Run earlier years first.</span>
            </div>
          </>
        )}
      </Card>

      {/* MANAGE: SET GROUP + DISPOSE (per-asset) */}
      <Card title="Manage assets - group & dispose" icon={<Tag size={15} />}>
        {busy ? (
          <p className="text-sm text-[var(--color-muted)] py-6 text-center">Loading…</p>
        ) : assets.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)] py-6 text-center">No assets to manage.</p>
        ) : (
          <div className="space-y-3">
            {assets.map((a) => (
              <ManageAssetRow key={a.id} asset={a} ledgers={ledgers} onChanged={() => load(status)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD ASSET
// ─────────────────────────────────────────────────────────────────────────────
function AddAssetForm({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [salvage, setSalvage] = useState("");
  const [acquiredOn, setAcquiredOn] = useState(todayIso());
  const [method, setMethod] = useState<string>("SLM");
  const [rate, setRate] = useState("");
  const [assetGroup, setAssetGroup] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter an asset name"); return; }
    if ((Number(cost) || 0) <= 0) { toast.error("Enter a cost above zero"); return; }
    if (rate.trim() === "" || !Number.isFinite(Number(rate))) { toast.error("Enter an annual depreciation rate"); return; }
    setSaving(true);
    try {
      const created = await api.post<AssetRow>("/api/books/assets", {
        name: name.trim(),
        cost: Number(cost) || 0,
        salvage: Number(salvage) || 0,
        acquiredOn,
        method,
        rate: Number(rate) || 0,
      });
      // asset_group is not a create field on the backend - set it after creation if provided.
      if (assetGroup.trim() && created?.id) {
        try {
          await api.patch(`/api/books/assets/${created.id}/group`, { group: assetGroup.trim() });
        } catch {
          /* group is optional - asset is already created */
        }
      }
      toast.success(`Asset "${name.trim()}" registered`);
      setName(""); setCost(""); setSalvage(""); setRate(""); setAssetGroup("");
      await onCreated();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Register an asset" icon={<Plus size={15} />}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Asset name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Delivery van" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Cost</label>
            <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Salvage value</label>
            <input value={salvage} onChange={(e) => setSalvage(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Acquired on</label>
            <DatePicker value={acquiredOn} onChange={setAcquiredOn} />
          </div>
          <div>
            <label className={labelCls}>Annual rate %</label>
            <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="e.g. 15" className={`${inputCls} font-mono tabular-nums`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
              {DEP_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Group (optional)</label>
            <input value={assetGroup} onChange={(e) => setAssetGroup(e.target.value)} placeholder="e.g. Vehicles" className={inputCls} />
          </div>
        </div>
        <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} w-full`}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
          Register asset
        </button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE ASSET ROW - inline set-group + dispose
// ─────────────────────────────────────────────────────────────────────────────
function ManageAssetRow({
  asset, ledgers, onChanged,
}: {
  asset: AssetRow;
  ledgers: Ledger[];
  onChanged: () => Promise<void> | void;
}) {
  const disposed = !!asset.disposed_on || asset.is_active === false;
  const cost = num(asset.cost);
  const acc = num(asset.accumulated_dep);
  const wdv = cost - acc;

  const [group, setGroup] = useState(asset.asset_group || "");
  const [savingGroup, setSavingGroup] = useState(false);

  const [showDispose, setShowDispose] = useState(false);
  const [disposalValue, setDisposalValue] = useState("");
  const [date, setDate] = useState(todayIso());
  const [bankLedgerId, setBankLedgerId] = useState("");
  const [disposing, setDisposing] = useState(false);

  const saveGroup = async () => {
    setSavingGroup(true);
    try {
      await api.patch(`/api/books/assets/${asset.id}/group`, { group: group.trim() || null });
      toast.success(group.trim() ? `Grouped under "${group.trim()}"` : "Group cleared");
      await onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSavingGroup(false);
    }
  };

  const dispose = async () => {
    if (disposalValue.trim() === "" || !Number.isFinite(Number(disposalValue))) {
      toast.error("Enter the disposal proceeds (0 for scrap)");
      return;
    }
    const proceeds = Number(disposalValue) || 0;
    if (proceeds < 0) { toast.error("Disposal value cannot be negative"); return; }
    if (proceeds > 0 && !bankLedgerId) { toast.error("Pick a bank ledger for the proceeds"); return; }
    if (!window.confirm(`Dispose "${asset.name}"? This books the gain/loss journal and removes it from the net block.`)) return;
    setDisposing(true);
    try {
      const res = await api.post<{ gainLoss?: string; wdv?: string }>(`/api/books/assets/${asset.id}/dispose`, {
        disposalValue: proceeds,
        date,
        bankLedgerId: proceeds > 0 ? bankLedgerId : undefined,
      });
      const gl = num(res?.gainLoss);
      toast.success(`Disposed · ${gl >= 0 ? "gain" : "loss"} ${rupee(Math.abs(gl))}`);
      setShowDispose(false);
      await onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDisposing(false);
    }
  };

  return (
    <div className="border border-[var(--color-border)] rounded-lg p-3 bg-[var(--color-bg)]/40">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="min-w-0">
          <p className="font-medium truncate">{asset.name}</p>
          <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
            {asset.method} · {num(asset.rate)}% · cost {rupee(cost)} · WDV {rupee(wdv)}
            {disposed && asset.disposed_on ? ` · disposed ${asset.disposed_on}` : ""}
          </p>
        </div>
        {!disposed && (
          <div className="flex items-center gap-2">
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="Group"
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm w-32 outline-none focus:border-[var(--color-primary)]"
            />
            <button type="button" onClick={saveGroup} disabled={savingGroup} className={btnGhost} title="Set group">
              {savingGroup ? <RefreshCw size={14} className="animate-spin" /> : <Tag size={14} />} Group
            </button>
            <button
              type="button"
              onClick={() => setShowDispose((o) => !o)}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-red-700/40 text-red-300 hover:bg-red-900/20"
            >
              <Trash2 size={14} /> Dispose
            </button>
          </div>
        )}
        {disposed && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]">
            disposed
          </span>
        )}
      </div>

      {showDispose && !disposed && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className={labelCls}>Disposal value</label>
            <input value={disposalValue} onChange={(e) => setDisposalValue(e.target.value)} inputMode="decimal" placeholder="0.00 (scrap)" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div>
            <label className={labelCls}>Bank ledger (if proceeds &gt; 0)</label>
            <select value={bankLedgerId} onChange={(e) => setBankLedgerId(e.target.value)} className={inputCls}>
              <option value="">Select bank…</option>
              {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <button type="button" onClick={dispose} disabled={disposing} className={`${btnPrimary} w-full`}>
            {disposing ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Confirm dispose
          </button>
        </div>
      )}
    </div>
  );
}
