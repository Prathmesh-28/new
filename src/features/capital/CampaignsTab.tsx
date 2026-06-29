import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Megaphone, Plus, Loader2, Link2, Send, Check, ChevronDown, ChevronRight, Trash2, Package } from "lucide-react";

// Rewards (pre-order) crowdfunding — creator surface over /api/campaigns. A backer is
// a customer; a pledge is a liability until fulfilment (booked server-side).
interface Perk { id: string; name: string; unit_price: number; quantity_limit: number | null; quantity_sold: number }
interface Campaign {
  id: string; name: string; description?: string; status: string;
  target_amount: number; raised_amount: number; fulfillment_type: string;
  public_token?: string | null; backers_paid?: number; perks?: Perk[];
}
interface Backer { id: string; backer_name?: string; amount: number; status: string; fulfillment_status: string; perk_id?: string | null }

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-[var(--color-accent)] text-[var(--color-muted)]",
  pending_review: "bg-amber-900/30 text-amber-400",
  approved: "bg-blue-900/30 text-blue-400",
  preview: "bg-amber-900/30 text-amber-400",
  active: "bg-green-900/30 text-green-400",
  funded: "bg-purple-900/30 text-purple-400",
  refunding: "bg-red-900/30 text-red-400",
  closed_pending_settlement: "bg-[var(--color-accent)] text-[var(--color-muted)]",
  completed: "bg-purple-900/30 text-purple-300",
};
const fmtStatus = (s: string) => s.replace(/_/g, " ");

export default function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  // create form
  const [name, setName] = useState(""); const [target, setTarget] = useState(""); const [desc, setDesc] = useState("");
  const [aon, setAon] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCampaigns(await api.get<Campaign[]>("/api/campaigns")); }
    catch { toast.error("Couldn't load campaigns"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!name.trim()) { toast.error("Name your campaign"); return; }
    setBusy(true);
    try {
      await api.post("/api/campaigns", { name: name.trim(), target_amount: parseFloat(target) || 0, description: desc.trim() || undefined, fulfillment_type: aon ? "all_or_nothing" : "keep_it_all" });
      toast.success("Campaign created (draft)");
      setName(""); setTarget(""); setDesc(""); setAon(false); setShowCreate(false);
      await load();
    } catch (e) { toast.error((e as { message?: string })?.message || "Create failed"); }
    finally { setBusy(false); }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); }
    catch (e) { toast.error((e as { message?: string })?.message || "Action failed"); }
    finally { setBusy(false); }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/c/${token}`;
    navigator.clipboard?.writeText(url).then(() => toast.success("Public campaign link copied"), () => toast.error("Copy failed"));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-muted)] max-w-2xl">
          Pre-sell a product to raise money. A backer pays for a reward; the pledge is booked as an advance (liability) and recognised as revenue when you fulfil. <span className="text-[var(--color-text)]">Keep-it-All</span> is live; All-or-Nothing holds need a gateway upgrade.
        </p>
        <button onClick={() => setShowCreate(v => !v)} className="shrink-0 flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
          <Plus size={12} /> New campaign
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Campaign name (e.g. Cold Brew Launch)" className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
          <div className="flex gap-3 flex-wrap">
            <input value={target} onChange={e => setTarget(e.target.value)} type="number" placeholder="Goal ₹" className="flex-1 min-w-[140px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
            <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <input type="checkbox" checked={aon} onChange={e => setAon(e.target.checked)} /> All-or-Nothing (refund if goal missed)
            </label>
          </div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="What are you pre-selling?" className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none resize-none" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)]">Cancel</button>
            <button onClick={create} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold disabled:opacity-50">{busy ? <Loader2 size={12} className="animate-spin inline" /> : "Create"}</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--color-muted)] flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      ) : campaigns.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Megaphone size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-semibold mb-1">No campaigns yet</h2>
          <p className="text-xs text-[var(--color-muted)]">Launch a pre-order campaign to raise money from your customers.</p>
        </div>
      ) : campaigns.map(c => (
        <CampaignCard key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? "" : c.id)}
          busy={busy} onAct={act} onCopy={copyLink} onReload={load} />
      ))}
    </div>
  );
}

function CampaignCard({ c, open, onToggle, busy, onAct, onCopy, onReload }: {
  c: Campaign; open: boolean; onToggle: () => void; busy: boolean;
  onAct: (fn: () => Promise<unknown>, ok: string) => Promise<void>; onCopy: (t: string) => void; onReload: () => Promise<void>;
}) {
  const pct = c.target_amount > 0 ? Math.min(100, Math.round((c.raised_amount / c.target_amount) * 100)) : 0;
  const [perks, setPerks] = useState<Perk[]>([]);
  const [backers, setBackers] = useState<Backer[]>([]);
  const [perkName, setPerkName] = useState(""); const [perkPrice, setPerkPrice] = useState("");

  const loadDetail = useCallback(async () => {
    try {
      const detail = await api.get<Campaign>(`/api/campaigns/${c.id}`);
      setPerks(detail.perks || []);
      setBackers(await api.get<Backer[]>(`/api/campaigns/${c.id}/backers`));
    } catch { /* ignore */ }
  }, [c.id]);
  useEffect(() => { if (open) void loadDetail(); }, [open, loadDetail]);

  const addPerk = async () => {
    if (!perkName.trim()) return;
    await api.post(`/api/campaigns/${c.id}/perks`, { name: perkName.trim(), unit_price: parseFloat(perkPrice) || 0 });
    setPerkName(""); setPerkPrice(""); await loadDetail();
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <button onClick={onToggle} className="flex items-center gap-2 text-left min-w-0">
            {open ? <ChevronDown size={15} className="text-[var(--color-muted)] shrink-0" /> : <ChevronRight size={15} className="text-[var(--color-muted)] shrink-0" />}
            <span className="font-semibold truncate">{c.name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[c.status] ?? "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>{fmtStatus(c.status)}</span>
          </button>
          <div className="flex items-center gap-1.5 flex-wrap">
            {c.status === "draft" && <ActBtn label="Submit" disabled={busy} onClick={() => onAct(() => api.post(`/api/campaigns/${c.id}/submit`, {}), "Submitted for review")} />}
            {c.status === "pending_review" && <ActBtn label="Approve" icon={Check} disabled={busy} onClick={() => onAct(() => api.post(`/api/campaigns/${c.id}/vet`, { approve: true }), "Approved")} />}
            {["approved", "draft", "preview"].includes(c.status) && <ActBtn label="Publish" icon={Send} disabled={busy} onClick={() => onAct(() => api.post(`/api/campaigns/${c.id}/publish`, {}), "Published")} primary />}
            {c.public_token && ["active", "preview", "funded"].includes(c.status) && <ActBtn label="Copy link" icon={Link2} disabled={busy} onClick={() => onCopy(c.public_token!)} />}
            {["active", "preview"].includes(c.status) && <ActBtn label="Close" disabled={busy} onClick={() => onAct(() => api.post(`/api/campaigns/${c.id}/close`, {}), "Closed")} />}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-[var(--color-bg)] overflow-hidden">
            <div className="h-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-[var(--color-muted)] shrink-0">{formatCurrency(c.raised_amount)} / {formatCurrency(c.target_amount)} · {c.backers_paid ?? 0} backers</span>
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--color-border)] p-4 space-y-4 bg-[var(--color-bg)]/40">
          {/* Perks */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-2 flex items-center gap-1.5"><Package size={12} /> Reward tiers</p>
            <div className="space-y-1.5">
              {perks.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                  <span>{p.name} <span className="text-[var(--color-muted)]">· {formatCurrency(p.unit_price)}</span></span>
                  <span className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                    {p.quantity_limit != null ? `${p.quantity_sold}/${p.quantity_limit}` : `${p.quantity_sold} sold`}
                    <Trash2 size={13} className="cursor-pointer hover:text-red-400" onClick={async () => { await api.delete(`/api/campaigns/${c.id}/perks/${p.id}`); await loadDetail(); }} />
                  </span>
                </div>
              ))}
            </div>
            {["draft", "pending_review", "approved", "preview", "active"].includes(c.status) && (
              <div className="flex gap-2 mt-2">
                <input value={perkName} onChange={e => setPerkName(e.target.value)} placeholder="Perk name" className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs outline-none" />
                <input value={perkPrice} onChange={e => setPerkPrice(e.target.value)} type="number" placeholder="₹" className="w-24 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs outline-none" />
                <button onClick={addPerk} className="text-xs px-3 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]">Add</button>
              </div>
            )}
          </div>
          {/* Backers */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-2">Backers ({backers.length})</p>
            {backers.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No pledges yet — share the public link.</p> : (
              <div className="space-y-1.5">
                {backers.map(b => (
                  <div key={b.id} className="flex items-center justify-between text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                    <span className="truncate">{b.backer_name || "Anonymous"} <span className="text-[var(--color-muted)]">· {formatCurrency(b.amount)}</span></span>
                    <span className="flex items-center gap-2 text-xs">
                      <span className={b.status === "paid" ? "text-green-400" : "text-[var(--color-muted)]"}>{b.status}</span>
                      {b.status === "pledged" && <button onClick={async () => { await api.post(`/api/campaigns/${c.id}/backers/${b.id}/mark-paid`, {}); await loadDetail(); await onReload(); }} className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-border)] hover:text-[var(--color-text)]">Mark paid</button>}
                      {b.status === "paid" && b.fulfillment_status !== "delivered" && <button onClick={async () => { await api.patch(`/api/campaigns/${c.id}/backers/${b.id}/fulfilment`, { status: "delivered" }); await loadDetail(); }} className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-border)] hover:text-[var(--color-text)]">Mark delivered</button>}
                      {b.fulfillment_status === "delivered" && <span className="text-[10px] text-purple-300">delivered</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActBtn({ label, icon: Icon, onClick, disabled, primary }: { label: string; icon?: typeof Check; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium disabled:opacity-50 ${primary ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
      {Icon && <Icon size={12} />}{label}
    </button>
  );
}
