import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "@/lib/apiBase";
import { formatCurrency } from "@/lib/utils";
import { Loader2, Megaphone } from "lucide-react";

// PUBLIC, token-gated backer page — no login, no app shell. Mirrors the invoice
// portal pattern. Served by GET/POST /api/campaigns/public/:token.
interface PublicPerk { id: string; name: string; description?: string; unit_price: number; delivery_date?: string; sold_out: boolean }
interface PublicCampaign { name: string; description?: string; hero_image_url?: string; target_amount: number; raised_amount: number; status: string; days_left: number | null; perks: PublicPerk[] }

export default function PublicCampaignPage() {
  const { token = "" } = useParams();
  const [c, setC] = useState<PublicCampaign | null>(null);
  const [err, setErr] = useState("");
  const [perkId, setPerkId] = useState<string>("");
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false); const [done, setDone] = useState<string>("");

  useEffect(() => {
    fetch(`${API_BASE}/api/campaigns/public/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("This campaign link is invalid or has expired.")))
      .then((d: PublicCampaign) => { setC(d); setPerkId(d.perks?.[0]?.id || ""); })
      .catch(e => setErr(e.message));
  }, [token]);

  const pledge = async () => {
    setBusy(true); setDone("");
    try {
      const res = await fetch(`${API_BASE}/api/campaigns/public/${token}/pledge`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perk_id: perkId || undefined, backer_name: name || undefined, backer_email: email || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Pledge failed");
      if (d.payUrl) { window.location.href = d.payUrl; return; }   // gateway → hosted checkout
      setDone("Your pledge is recorded — the creator will reach out to collect payment.");
    } catch (e) { setDone((e as Error).message); }
    finally { setBusy(false); }
  };

  if (err) return <Shell><p className="text-[var(--color-muted)] text-center">{err}</p></Shell>;
  if (!c) return <Shell><p className="flex items-center justify-center gap-2 text-[var(--color-muted)]"><Loader2 className="animate-spin" size={16} /> Loading campaign…</p></Shell>;

  const pct = c.target_amount > 0 ? Math.min(100, Math.round((c.raised_amount / c.target_amount) * 100)) : 0;
  const selected = c.perks.find(p => p.id === perkId);
  const live = c.status === "active";

  return (
    <Shell>
      <div className="flex items-center gap-2 text-[var(--color-primary)] mb-3"><Megaphone size={18} /><span className="text-xs font-semibold uppercase tracking-widest">Pre-order campaign</span></div>
      <h1 className="text-2xl font-bold mb-2">{c.name}</h1>
      {c.description && <p className="text-sm text-[var(--color-muted)] mb-5">{c.description}</p>}

      <div className="mb-1 flex items-end justify-between">
        <span className="text-xl font-bold">{formatCurrency(c.raised_amount)}</span>
        <span className="text-xs text-[var(--color-muted)]">of {formatCurrency(c.target_amount)} goal{c.days_left != null ? ` · ${c.days_left} days left` : ""}</span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--color-surface)] overflow-hidden mb-6"><div className="h-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} /></div>

      {!live && <p className="mb-4 text-xs text-amber-400 border border-amber-700/40 rounded-lg px-3 py-2">This campaign is in preview — pledges aren't open for payment yet.</p>}

      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-2">Choose a reward</p>
      <div className="space-y-2 mb-5">
        {c.perks.map(p => (
          <button key={p.id} disabled={p.sold_out} onClick={() => setPerkId(p.id)}
            className={`w-full text-left rounded-xl border p-3 transition-colors ${perkId === p.id ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10" : "border-[var(--color-border)]"} ${p.sold_out ? "opacity-40" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{p.name}</span>
              <span className="text-sm">{formatCurrency(p.unit_price)}</span>
            </div>
            {p.description && <p className="text-xs text-[var(--color-muted)] mt-1">{p.description}</p>}
            {p.sold_out && <span className="text-[10px] text-red-400">Sold out</span>}
          </button>
        ))}
        {c.perks.length === 0 && <p className="text-xs text-[var(--color-muted)]">No reward tiers yet.</p>}
      </div>

      <div className="space-y-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (for updates)" className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
        <button onClick={pledge} disabled={busy || !live || c.perks.length === 0}
          className="w-full rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2.5 text-sm hover:opacity-90 disabled:opacity-40">
          {busy ? <Loader2 size={15} className="animate-spin inline" /> : `Pledge ${selected ? formatCurrency(selected.unit_price) : ""}`}
        </button>
        {done && <p className="text-xs text-center text-[var(--color-muted)] pt-1">{done}</p>}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
