import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import { useApp } from "@/context/AppContext";
import { LoadingState, ErrorState } from "@/components/EmptyState";
import { KeyRound, Plus, Copy, Trash2, Terminal, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

// Developer portal (#185): mint/revoke public-API keys + browse the v1 endpoints. The plaintext
// key is shown ONCE on creation. All data comes from the real /api/developer + /api/v1 surface.
interface ApiKey { id: string; name: string; prefix: string; scopes: string[]; last_used_at: string | null; created_at: string; revoked: boolean }
const V1 = [
  { m: "GET", path: "/api/v1/ping", desc: "Verify the key + see its scopes" },
  { m: "GET", path: "/api/v1/invoices?limit=100&status=sent", desc: "List invoices" },
  { m: "GET", path: "/api/v1/vendors", desc: "List vendors (master)" },
  { m: "GET", path: "/api/v1/credit-score", desc: "Underwriting score, grade, eligible limit" },
  { m: "GET", path: "/api/v1/reports/trial-balance?fy=2024-25", desc: "Trial balance for an FY" },
];

export default function DeveloperPage() {
  const { isReadOnly } = useApp();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [scopeWrite, setScopeWrite] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null); // plaintext key shown once
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const load = useCallback(() => { setError(null); api.get<ApiKey[]>("/api/developer/keys").then(setKeys).catch((e) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      const r = await api.post<{ key: string }>("/api/developer/keys", { name: name.trim() || "API key", scopes: scopeWrite ? ["read", "write"] : ["read"] });
      setFresh(r.key); setName(""); setScopeWrite(false); load();
    } catch (e) { toast.error((e as Error).message); }
  };
  const revoke = async (id: string) => { try { await api.delete(`/api/developer/keys/${id}`); toast.success("Key revoked"); load(); } catch (e) { toast.error((e as Error).message); } };
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copied"));
  const curl = fresh ? `curl ${API_BASE}/api/v1/ping -H "X-API-Key: ${fresh}"` : "";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Terminal size={20} className="text-[var(--color-primary)]" />
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Developer</h1>
          <p className="text-sm text-[var(--color-muted)]">Mint API keys and call your business data over the public REST API (v1).</p>
        </div>
      </div>

      {/* Freshly-created key (shown once) */}
      {fresh && (
        <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-lg p-4">
          <p className="text-sm font-semibold text-emerald-300 flex items-center gap-1.5"><AlertTriangle size={14} /> Copy your key now — it won't be shown again</p>
          <div className="flex gap-2 items-center mt-2">
            <code className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 flex-1 min-w-0 truncate">{fresh}</code>
            <button onClick={() => copy(fresh)} className="text-xs border border-[var(--color-border)] px-3 py-1.5 rounded-lg flex items-center gap-1"><Copy size={12} /> Copy</button>
            <button onClick={() => setFresh(null)} className="text-xs text-[var(--color-muted)] px-2">Done</button>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-2">Try it: <code className="text-[var(--color-text)]">{curl}</code></p>
        </div>
      )}

      {/* Create */}
      {!isReadOnly && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap gap-2 items-end">
          <input className={inp} placeholder="Key name (e.g. Zapier)" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="text-xs text-[var(--color-muted)] flex items-center gap-1.5"><input type="checkbox" checked={scopeWrite} onChange={(e) => setScopeWrite(e.target.checked)} /> allow write scope</label>
          <button onClick={create} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-semibold"><Plus size={13} /> Create key</button>
        </div>
      )}

      {/* Keys */}
      {error ? <ErrorState message={error} onRetry={load} /> : !keys ? <LoadingState rows={3} /> : keys.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No API keys yet.</p>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <table className="w-full text-sm rcard"><tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-[var(--color-border)]">
                <td data-label="Name" className="py-1.5">{k.name} {k.revoked && <span className="text-red-400 text-[11px]">(revoked)</span>}</td>
                <td data-label="Prefix" className="py-1.5"><code className="text-xs text-[var(--color-muted)]">{k.prefix}…</code></td>
                <td data-label="Scopes" className="py-1.5 text-xs">{(k.scopes || []).join(", ")}</td>
                <td data-label="Last used" className="py-1.5 text-xs text-[var(--color-muted)]">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "never"}</td>
                {!isReadOnly && <td className="py-1.5">{!k.revoked && <button onClick={() => revoke(k.id)} className="text-red-400"><Trash2 size={13} /></button>}</td>}
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {/* Endpoints */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold flex items-center gap-2"><KeyRound size={14} className="text-[var(--color-primary)]" /> API v1 endpoints</p>
          <a href={`${API_BASE}/api/v1/openapi.json`} target="_blank" rel="noreferrer" className="text-xs border border-[var(--color-border)] px-2.5 py-1 rounded-lg">OpenAPI spec</a>
        </div>
        <table className="w-full text-sm rcard"><tbody>
          {V1.map((e, i) => (
            <tr key={i} className="border-t border-[var(--color-border)]">
              <td data-label="Method" className="py-1.5"><span className="text-[10px] font-bold text-emerald-400">{e.m}</span></td>
              <td data-label="Path" className="py-1.5"><code className="text-xs">{e.path}</code></td>
              <td data-label="Description" className="py-1.5 text-xs text-[var(--color-muted)]">{e.desc}</td>
            </tr>
          ))}
        </tbody></table>
        <p className="text-[11px] text-[var(--color-muted)] mt-2">Authenticate every call with <code>X-API-Key: &lt;your key&gt;</code>. Rate limit 120/min per key. Read-only in v1.</p>
      </div>
    </div>
  );
}
