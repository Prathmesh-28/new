import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import { toast } from "sonner";
import { humanizeAiError } from "@/components/ai/aiError";
import {
  Workflow, Plus, Search, Loader2, Play, Save, Trash2, ChevronRight, ChevronDown,
  Zap, Clock, Webhook, Check, X, CircleDot, AlertTriangle, History, Activity,
} from "lucide-react";

/**
 * Headroom Flows - native, n8n-independent workflow builder. List flows · edit a flow
 * (trigger + node graph) · run it · read the per-node execution log + history.
 * Backed by /api/flows (the engine is in modules/flows/runner.js).
 */
type TriggerType = "manual" | "schedule" | "webhook" | "event";
interface Trigger { type: TriggerType; config?: { frequency?: string; hour?: number; dow?: number; event?: string } }
interface FlowNode { id: string; type: string; config: Record<string, unknown> }
interface Edge { from: string; to: string; branch?: string }
interface Graph { nodes: FlowNode[]; edges: Edge[] }
interface FlowListItem { id: string; name: string; enabled: boolean; trigger: Trigger; last_run_at?: string | null }
interface FullFlow extends FlowListItem { description?: string; graph: Graph; webhook_token?: string | null }
interface CatalogField { key: string; type: string; label: string; options?: string[] }
interface CatalogNode { type: string; label: string; desc: string; fields: CatalogField[] }
interface FlowTemplate { id: string; name: string; description: string; trigger: Trigger; graph: Graph }
interface Catalog { nodes: CatalogNode[]; tools: { name: string; scope?: string }[]; agents: { id: string; name: string }[]; events?: { event: string; label: string; desc: string }[]; templates?: FlowTemplate[] }
interface NodeResult { type?: string; status: string; output?: unknown; error?: string; ms?: number }
interface FlowRun { id: string; status: string; trigger_kind?: string; error?: string | null; created_at: string; results?: Record<string, NodeResult> }

const TRIGGER_ICON: Record<TriggerType, typeof Zap> = { manual: Zap, schedule: Clock, webhook: Webhook, event: Activity };

export default function FlowsPage() {
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const loadFlows = useCallback(async () => {
    try { const r = await api.get<{ flows: FlowListItem[] }>("/api/flows/flows"); setFlows(r.flows || []); }
    catch (e) { toast.error(humanizeAiError(e)); }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [r, c] = await Promise.all([api.get<{ flows: FlowListItem[] }>("/api/flows/flows"), api.get<Catalog>("/api/flows/catalog")]);
        setFlows(r.flows || []); setCatalog(c);
        setActiveId((p) => p || r.flows?.[0]?.id || "");
      } catch (e) { toast.error(humanizeAiError(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const createFlow = async () => {
    try {
      const f = await api.post<FullFlow>("/api/flows/flows", { name: "Untitled flow", trigger: { type: "manual" }, graph: { nodes: [], edges: [] } });
      await loadFlows(); setActiveId(f.id);
    } catch (e) { toast.error(humanizeAiError(e)); }
  };

  const createFromTemplate = async (t: FlowTemplate) => {
    try {
      const f = await api.post<FullFlow>("/api/flows/flows", { name: t.name, trigger: t.trigger, graph: t.graph });
      await loadFlows(); setActiveId(f.id);
      toast.success(`Created "${t.name}" - review and run it`);
    } catch (e) { toast.error(humanizeAiError(e)); }
  };

  const filtered = flows.filter((f) => (f.name ?? "").toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2 mr-auto"><Workflow className="text-[var(--color-primary)]" size={24} /> Flows</h1>
        <span className="text-[11px] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">Your automation engine - no n8n</span>
      </div>
      <p className="text-sm text-[var(--color-muted)] max-w-3xl">Build automations from triggers and nodes - read/write your business data, ask AI, branch on conditions, call APIs, raise alerts. Runs on Headroom; nothing leaves to a third party.</p>

      <div className="flex h-[calc(100vh-15rem)] min-h-[30rem] rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-bg)]">
        <aside className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
          <div className="p-3 border-b border-[var(--color-border)]">
            <button onClick={createFlow} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold py-2 hover:opacity-90"><Plus size={15} /> New flow</button>
            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2">
              <Search size={13} className="text-[var(--color-muted)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="flex-1 bg-transparent py-1.5 text-xs outline-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? <p className="px-2 py-2 text-xs text-[var(--color-muted)]">Loading…</p> :
              filtered.length === 0 ? <p className="px-2 py-2 text-xs text-[var(--color-muted)]">No flows yet - create one.</p> :
              filtered.map((f) => {
                const I = TRIGGER_ICON[f.trigger?.type] || Zap;
                return (
                  <button key={f.id} onClick={() => setActiveId(f.id)} className={`w-full text-left flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${f.id === activeId ? "bg-[var(--color-primary)]/15 text-[var(--color-text)]" : "text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]"}`}>
                    <I size={13} className="shrink-0 text-[var(--color-primary)]" />
                    <span className="truncate flex-1">{f.name || "Untitled"}</span>
                    {!f.enabled && <span className="text-[9px] text-[var(--color-muted)] border border-[var(--color-border)] rounded px-1">off</span>}
                  </button>
                );
              })}
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">
          {!activeId || !catalog ? (
            <div className="h-full overflow-y-auto px-6 py-6">
              <div className="text-center mb-5">
                <Workflow size={30} className="text-[var(--color-primary)] mb-2 mx-auto" />
                <p className="text-sm font-semibold">Start from a template - or build your own</p>
                <p className="text-xs text-[var(--color-muted)] mt-1 max-w-md mx-auto">One click installs a working automation you can review and run. Or hit “New flow” for a blank canvas.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto">
                {(catalog?.templates || []).map((t) => {
                  const I = TRIGGER_ICON[t.trigger?.type] || Zap;
                  return (
                    <button key={t.id} onClick={() => createFromTemplate(t)} className="text-left rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 hover:border-[var(--color-primary)]/50 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0"><I size={14} className="text-[var(--color-primary)]" /></div>
                        <span className="text-sm font-semibold">{t.name}</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">{t.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <FlowEditor key={activeId} flowId={activeId} catalog={catalog} onSaved={loadFlows} onDeleted={() => { setActiveId(""); loadFlows(); }} />
          )}
        </main>
      </div>
    </div>
  );
}

let nodeSeq = 0;
const newNodeId = () => `n${Date.now().toString(36)}${(nodeSeq++).toString(36)}`;

function FlowEditor({ flowId, catalog, onSaved, onDeleted }: { flowId: string; catalog: Catalog; onSaved: () => void; onDeleted: () => void }) {
  const [flow, setFlow] = useState<FullFlow | null>(null);
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [trigger, setTrigger] = useState<Trigger>({ type: "manual" });
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [jsonErr, setJsonErr] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<FlowRun | null>(null);
  const [history, setHistory] = useState<FlowRun[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const f = await api.get<FullFlow>(`/api/flows/flows/${flowId}`);
        setFlow(f); setName(f.name || ""); setEnabled(f.enabled); setTrigger(f.trigger || { type: "manual" });
        setNodes(f.graph?.nodes || []); setEdges(f.graph?.edges || []); setLastRun(null);
      } catch (e) { toast.error(humanizeAiError(e)); }
    })();
  }, [flowId]);

  const nodeName = useCallback((id: string) => { const n = nodes.find((x) => x.id === id); const def = catalog.nodes.find((c) => c.type === n?.type); return n ? `${def?.label || n.type}` : id; }, [nodes, catalog]);
  const catFor = (type: string) => catalog.nodes.find((c) => c.type === type);

  const save = async () => {
    if (Object.values(jsonErr).some(Boolean)) { toast.error("Fix the invalid JSON fields first."); return; }
    setSaving(true);
    try {
      await api.patch(`/api/flows/flows/${flowId}`, { name, enabled, trigger, graph: { nodes, edges } });
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error(humanizeAiError(e)); }
    finally { setSaving(false); }
  };

  const runNow = async () => {
    setRunning(true); setLastRun(null);
    try {
      // save first so we run the latest definition
      if (!Object.values(jsonErr).some(Boolean)) await api.patch(`/api/flows/flows/${flowId}`, { name, enabled, trigger, graph: { nodes, edges } });
      const run = await api.post<FlowRun>(`/api/flows/flows/${flowId}/run`, { input: {} });
      setLastRun(run);
      run.status === "success" ? toast.success("Flow ran successfully") : toast.error("Flow run failed - see the log");
      onSaved();
    } catch (e) { toast.error(humanizeAiError(e)); }
    finally { setRunning(false); }
  };

  const del = async () => { if (!confirm("Delete this flow?")) return; try { await api.delete(`/api/flows/flows/${flowId}`); onDeleted(); } catch (e) { toast.error(humanizeAiError(e)); } };
  const loadHistory = async () => { try { const r = await api.get<{ runs: FlowRun[] }>(`/api/flows/flows/${flowId}/runs`); setHistory(r.runs || []); setShowHistory(true); } catch (e) { toast.error(humanizeAiError(e)); } };

  const addNode = (type: string) => { setNodes((ns) => [...ns, { id: newNodeId(), type, config: {} }]); setAddOpen(false); };
  const removeNode = (id: string) => { setNodes((ns) => ns.filter((n) => n.id !== id)); setEdges((es) => es.filter((e) => e.from !== id && e.to !== id)); };
  const setConfig = (id: string, key: string, val: unknown) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, config: { ...n.config, [key]: val } } : n)));
  const addEdge = (from: string, to: string, branch?: string) => { if (!to) return; setEdges((es) => [...es.filter((e) => !(e.from === from && e.branch === branch)), { from, to, ...(branch ? { branch } : {}) }]); };
  const removeEdge = (from: string, to: string, branch?: string) => setEdges((es) => es.filter((e) => !(e.from === from && e.to === to && e.branch === branch)));

  const webhookUrl = useMemo(() => (flow?.webhook_token ? `${API_BASE || window.location.origin}/api/flows/webhook/${flow.webhook_token}` : ""), [flow]);

  if (!flow) return <div className="p-6 text-sm text-[var(--color-muted)]"><Loader2 size={14} className="animate-spin inline mr-1.5" /> Loading…</div>;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <input value={name} onChange={(e) => setName(e.target.value)} className="text-lg font-semibold bg-transparent border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none px-1 min-w-0 flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
        <button onClick={loadHistory} className="flex items-center gap-1 text-xs rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)]"><History size={13} /> Runs</button>
        <button onClick={del} className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 text-xs rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save</button>
        <button onClick={runNow} disabled={running} className="flex items-center gap-1.5 text-sm rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3.5 py-1.5 hover:opacity-90 disabled:opacity-50">{running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run now</button>
      </div>

      {/* Trigger */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)] mb-2">TRIGGER</div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["manual", "event", "schedule", "webhook"] as TriggerType[]).map((t) => {
            const I = TRIGGER_ICON[t];
            return <button key={t} onClick={() => setTrigger({ type: t, config: trigger.type === t ? trigger.config : {} })} className={`flex items-center gap-1.5 text-xs rounded-lg border px-2.5 py-1.5 ${trigger.type === t ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}><I size={12} /> {t}</button>;
          })}
          {trigger.type === "event" && (
            <select value={trigger.config?.event || ""} onChange={(e) => setTrigger({ type: "event", config: { ...trigger.config, event: e.target.value } })} className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-1 outline-none">
              <option value="">- pick an event -</option>
              {(catalog.events || []).map((ev) => <option key={ev.event} value={ev.event}>{ev.label}</option>)}
            </select>
          )}
          {trigger.type === "schedule" && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <select value={trigger.config?.frequency || "daily"} onChange={(e) => setTrigger({ type: "schedule", config: { ...trigger.config, frequency: e.target.value } })} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-1 outline-none">
                <option value="hourly">hourly</option><option value="daily">daily</option><option value="weekly">weekly</option>
              </select>
              {trigger.config?.frequency !== "hourly" && <>at <input type="number" min={0} max={23} value={trigger.config?.hour ?? 9} onChange={(e) => setTrigger({ type: "schedule", config: { ...trigger.config, hour: Number(e.target.value) } })} className="w-14 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-1 outline-none" />:00 UTC</>}
            </div>
          )}
          {trigger.type === "webhook" && (webhookUrl ? <span className="text-[11px] text-[var(--color-muted)]">POST to <code className="text-[var(--color-primary)]">{webhookUrl}</code></span> : <span className="text-[11px] text-[var(--color-muted)]">Save to generate the webhook URL.</span>)}
        </div>
      </div>

      {/* Nodes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--color-muted)]">NODES</span>
          <div className="relative">
            <button onClick={() => setAddOpen((v) => !v)} className="flex items-center gap-1 text-xs rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)]"><Plus size={13} /> Add node</button>
            {addOpen && (
              <div className="absolute right-0 top-9 z-20 w-64 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl p-1">
                {catalog.nodes.map((c) => (
                  <button key={c.type} onClick={() => addNode(c.type)} className="w-full text-left px-2 py-1.5 rounded-md hover:bg-white/5">
                    <div className="text-sm font-medium">{c.label}</div><div className="text-[11px] text-[var(--color-muted)]">{c.desc}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {nodes.length === 0 ? <p className="text-xs text-[var(--color-muted)] py-3 text-center border border-dashed border-[var(--color-border)] rounded-lg">No nodes - add one. Root nodes (no incoming connection) run first.</p> :
          nodes.map((n) => (
            <NodeCard key={n.id} node={n} def={catFor(n.type)} catalog={catalog} allNodes={nodes} edges={edges} nodeName={nodeName}
              result={lastRun?.results?.[n.id]} jsonErr={jsonErr} setJsonErr={setJsonErr}
              onConfig={(k, v) => setConfig(n.id, k, v)} onRemove={() => removeNode(n.id)}
              onAddEdge={(to, br) => addEdge(n.id, to, br)} onRemoveEdge={(to, br) => removeEdge(n.id, to, br)} />
          ))}
      </div>

      {/* Last run log */}
      {lastRun && <RunLog run={lastRun} nodeName={nodeName} />}

      {/* History drawer */}
      {showHistory && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowHistory(false)} />
          <div className="fixed right-0 top-0 z-50 h-full w-[26rem] max-w-[92vw] bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]"><h3 className="text-sm font-semibold">Run history</h3><button onClick={() => setShowHistory(false)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={16} /></button></div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {history.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No runs yet.</p> : history.map((r) => (
                <button key={r.id} onClick={async () => { try { setLastRun(await api.get<FlowRun>(`/api/flows/runs/${r.id}`)); setShowHistory(false); } catch (e) { toast.error(humanizeAiError(e)); } }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 text-left text-xs">
                  <StatusDot status={r.status} />
                  <span className="flex-1 truncate">{new Date(r.created_at).toLocaleString()}</span>
                  <span className="text-[var(--color-muted)]">{r.trigger_kind}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === "success") return <Check size={13} className="text-green-400 shrink-0" />;
  if (status === "failed") return <AlertTriangle size={13} className="text-red-400 shrink-0" />;
  if (status === "skipped") return <CircleDot size={13} className="text-[var(--color-muted)] shrink-0" />;
  return <Loader2 size={13} className="animate-spin text-[var(--color-primary)] shrink-0" />;
}

function RunLog({ run, nodeName }: { run: FlowRun; nodeName: (id: string) => string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-2 text-xs font-semibold mb-2"><StatusDot status={run.status} /> Execution log {run.error && <span className="text-red-400 font-normal">· {run.error}</span>}</div>
      <div className="space-y-1.5">
        {Object.entries(run.results || {}).map(([id, r]) => (
          <details key={id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
            <summary className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer list-none">
              <StatusDot status={r.status} />
              <span className="font-medium">{nodeName(id)}</span>
              <span className="text-[var(--color-muted)]">{r.type}</span>
              {typeof r.ms === "number" && <span className="ml-auto text-[10px] text-[var(--color-muted)]">{r.ms}ms</span>}
            </summary>
            <pre className="px-2.5 pb-2 text-[10px] text-[var(--color-muted)] overflow-x-auto whitespace-pre-wrap break-all">{r.error ? r.error : JSON.stringify(r.output ?? null, null, 2)}</pre>
          </details>
        ))}
      </div>
    </div>
  );
}

function NodeCard({ node, def, catalog, allNodes, edges, nodeName, result, jsonErr, setJsonErr, onConfig, onRemove, onAddEdge, onRemoveEdge }: {
  node: FlowNode; def?: CatalogNode; catalog: Catalog; allNodes: FlowNode[]; edges: Edge[]; nodeName: (id: string) => string;
  result?: NodeResult; jsonErr: Record<string, boolean>; setJsonErr: (f: Record<string, boolean>) => void;
  onConfig: (k: string, v: unknown) => void; onRemove: () => void; onAddEdge: (to: string, branch?: string) => void; onRemoveEdge: (to: string, branch?: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const targets = allNodes.filter((n) => n.id !== node.id);
  const outEdges = edges.filter((e) => e.from === node.id);
  const isBranch = node.type === "branch";

  const field = (f: CatalogField) => {
    const v = node.config[f.key];
    if (f.type === "textarea") return <textarea value={(v as string) ?? ""} onChange={(e) => onConfig(f.key, e.target.value)} rows={2} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none resize-y" />;
    if (f.type === "select") return <select value={(v as string) ?? f.options?.[0] ?? ""} onChange={(e) => onConfig(f.key, e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none">{f.options?.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
    if (f.type === "toolselect") return <select value={(v as string) ?? ""} onChange={(e) => onConfig(f.key, e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none"><option value="">- pick a tool -</option>{catalog.tools.map((t) => <option key={t.name} value={t.name}>{t.name}{t.scope === "write" ? " (write)" : ""}</option>)}</select>;
    if (f.type === "agentselect") return <select value={(v as string) ?? ""} onChange={(e) => onConfig(f.key, e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none"><option value="">- pick an agent -</option>{catalog.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>;
    if (f.type === "json") {
      const ek = `${node.id}.${f.key}`;
      return <div>
        <textarea defaultValue={v != null ? JSON.stringify(v, null, 2) : ""} onChange={(e) => { const t = e.target.value.trim(); if (!t) { onConfig(f.key, undefined); setJsonErr({ ...jsonErr, [ek]: false }); return; } try { onConfig(f.key, JSON.parse(t)); setJsonErr({ ...jsonErr, [ek]: false }); } catch { setJsonErr({ ...jsonErr, [ek]: true }); } }}
          rows={3} className={`w-full bg-[var(--color-bg)] border rounded px-2 py-1 text-xs font-mono outline-none resize-y ${jsonErr[ek] ? "border-red-500" : "border-[var(--color-border)]"}`} placeholder="{ }" />
        {jsonErr[ek] && <span className="text-[10px] text-red-400">Invalid JSON</span>}
      </div>;
    }
    return <input value={(v as string) ?? ""} onChange={(e) => onConfig(f.key, e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none" />;
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen((o) => !o)} className="text-[var(--color-muted)]">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        {result && <StatusDot status={result.status} />}
        <span className="text-sm font-medium">{def?.label || node.type}</span>
        <span className="text-[10px] text-[var(--color-muted)] font-mono">{node.id}</span>
        <button onClick={onRemove} className="ml-auto text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-[var(--color-border)] pt-2">
          {def?.fields.map((f) => <div key={f.key}><label className="text-[11px] text-[var(--color-muted)] block mb-0.5">{f.label}</label>{field(f)}</div>)}
          {/* connections */}
          <div className="pt-1">
            <label className="text-[11px] text-[var(--color-muted)] block mb-1">Then →</label>
            <div className="space-y-1">
              {outEdges.map((e, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  {e.branch && <span className={`text-[10px] px-1 rounded ${e.branch === "true" ? "text-green-400 border border-green-700/40" : "text-amber-400 border border-amber-700/40"}`}>{e.branch}</span>}
                  <ChevronRight size={11} className="text-[var(--color-muted)]" />
                  <span className="flex-1">{nodeName(e.to)} <span className="text-[var(--color-muted)] font-mono text-[10px]">{e.to}</span></span>
                  <button onClick={() => onRemoveEdge(e.to, e.branch)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
                </div>
              ))}
              {targets.length > 0 ? (
                isBranch ? (
                  <div className="flex gap-2">
                    {(["true", "false"] as const).map((br) => (
                      <select key={br} value="" onChange={(e) => onAddEdge(e.target.value, br)} className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[11px] outline-none">
                        <option value="">if {br} →…</option>{targets.map((t) => <option key={t.id} value={t.id}>{nodeName(t.id)}</option>)}
                      </select>
                    ))}
                  </div>
                ) : (
                  <select value="" onChange={(e) => onAddEdge(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-1 text-[11px] outline-none">
                    <option value="">connect to…</option>{targets.map((t) => <option key={t.id} value={t.id}>{nodeName(t.id)}</option>)}
                  </select>
                )
              ) : <p className="text-[10px] text-[var(--color-muted)]">Add another node to connect to.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
