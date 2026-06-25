import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { humanizeAiError } from "@/components/ai/aiError";
import {
  Bot, Plus, Search, Send, Loader2, Wrench, ChevronDown, ChevronRight, X,
  ShieldAlert, Check, Cpu, Sparkles, Clock, Coins, Network, Slash,
} from "lucide-react";

/**
 * Agent Workspace — a Kogo-OS-style chat surface over our agent engine. Left: agents
 * as "workspaces" + search + history. Right: a conversation with task-progress
 * accordions, approval cards for writes, a usage/credits meter, a Tools slide-over,
 * a model selector, a "/" command menu, and a Task-mode toggle that runs a sub-agent
 * SWARM (planner → sub-agents → synthesis). Backed by /api/books/agents/*.
 */
interface Agent { id: string; name?: string; instructions?: string; model?: string | null; tools?: string[]; enabled?: boolean }
interface ToolDef { name: string; description?: string; scope?: "read" | "write" }
interface RunStep { tool?: string; args?: unknown; result?: unknown }
interface PendingAction { id: string; tool: string; args?: unknown; label?: string }
interface SubResult { task: string; reply: string; steps?: RunStep[] }
interface RunResponse { reply?: string; steps?: RunStep[]; pendingActions?: PendingAction[]; plan?: string[]; subResults?: SubResult[] }
interface Turn { role: "user" | "assistant"; text: string; steps?: RunStep[]; pending?: PendingAction[]; plan?: string[]; subResults?: SubResult[] }
interface Usage { tokensThisMonth: number; cap: number; runs: number }

// LLM-agnostic, like Kogo: pick the engine per agent. Free default first.
const MODELS = [
  { id: "openrouter/owl-alpha", label: "Owl Alpha (free)" },
  { id: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B (free)" },
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3" },
];

// "/" task-mode commands — insert a ready-made prompt (Kogo's "/ to use task mode").
const SLASH = [
  { cmd: "/briefing", prompt: "Give me today's business briefing — cash, runway, what needs attention.", swarm: false },
  { cmd: "/pay", prompt: "Who should I pay first this week, and in what order?", swarm: false },
  { cmd: "/afford", prompt: "Can I afford a ₹2,00,000 purchase this month? Check my runway.", swarm: false },
  { cmd: "/itc", prompt: "What's my ITC at risk this cycle and what should I action?", swarm: false },
  { cmd: "/plan", prompt: "Build me a cash-crunch action plan for the next 30 days.", swarm: true },
];

const pretty = (v: unknown) => { try { return typeof v === "string" ? v : JSON.stringify(v, null, 2); } catch { return String(v); } };
const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

export default function AgentWorkspace() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [catalog, setCatalog] = useState<ToolDef[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [convos, setConvos] = useState<Record<string, Turn[]>>({});
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [taskMode, setTaskMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadUsage = useCallback(() => {
    api.get<Usage>("/api/books/agents/usage").then(setUsage).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, tools, cfg] = await Promise.all([
        api.get<Agent[]>("/api/books/agents"),
        api.get<ToolDef[]>("/api/books/agents/tools"),
        api.get<{ hasKey?: boolean }>("/api/books/agents/llm-config").catch(() => ({ hasKey: false })),
      ]);
      const list = Array.isArray(rows) ? rows : [];
      setAgents(list);
      setCatalog(Array.isArray(tools) ? tools : []);
      setHasKey(!!cfg?.hasKey);
      setActiveId(prev => prev || list[0]?.id || "");
      loadUsage();
    } catch (e) { toast.error(humanizeAiError(e)); }
    finally { setLoading(false); }
  }, [loadUsage]);
  useEffect(() => { void load(); }, [load]);

  const active = agents.find(a => a.id === activeId);
  const turns = convos[activeId] ?? [];
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [turns, running]);

  const createWorkspace = async () => {
    try {
      const created = await api.post<Agent>("/api/books/agents", { name: "New workspace", instructions: "You are a helpful business assistant.", tools: ["get_business_snapshot"] });
      await load();
      if (created?.id) setActiveId(created.id);
      toast.success("Workspace created — add tools and start chatting");
    } catch (e) { toast.error(humanizeAiError(e)); }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !activeId) return;
    setInput("");
    setConvos(c => ({ ...c, [activeId]: [...(c[activeId] ?? []), { role: "user", text }] }));
    setRunning(true);
    try {
      const endpoint = taskMode ? "swarm" : "run";
      const res = await api.post<RunResponse>(`/api/books/agents/${activeId}/${endpoint}`, { message: text });
      setConvos(c => ({ ...c, [activeId]: [...(c[activeId] ?? []), {
        role: "assistant",
        text: res?.reply || "(no reply)",
        steps: res?.steps || [],
        pending: Array.isArray(res?.pendingActions) ? res!.pendingActions : [],
        plan: res?.plan, subResults: res?.subResults,
      }] }));
      loadUsage();
    } catch (e) {
      const m = humanizeAiError(e);
      setConvos(c => ({ ...c, [activeId]: [...(c[activeId] ?? []), { role: "assistant", text: m }] }));
    } finally { setRunning(false); }
  };

  const toggleTool = async (name: string) => {
    if (!active) return;
    const cur = active.tools ?? [];
    const next = cur.includes(name) ? cur.filter(t => t !== name) : [...cur, name];
    setAgents(as => as.map(a => a.id === active.id ? { ...a, tools: next } : a));
    try { await api.patch(`/api/books/agents/${active.id}`, { tools: next }); }
    catch (e) { toast.error(humanizeAiError(e)); void load(); }
  };

  const setModel = async (model: string) => {
    if (!active) return;
    setAgents(as => as.map(a => a.id === active.id ? { ...a, model } : a));
    try { await api.patch(`/api/books/agents/${active.id}`, { model }); }
    catch (e) { toast.error(humanizeAiError(e)); void load(); }
  };

  const filtered = agents.filter(a => (a.name ?? "").toLowerCase().includes(q.trim().toLowerCase()));
  const activeTools = active?.tools ?? [];
  const slashOpen = input.startsWith("/");
  const slashMatches = SLASH.filter(s => s.cmd.startsWith(input.split(" ")[0].toLowerCase()));

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[30rem] rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-bg)]">
      {/* ── Workspaces rail ─────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
        <div className="p-3 border-b border-[var(--color-border)]">
          <button onClick={createWorkspace} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold py-2 hover:opacity-90">
            <Plus size={15} /> New workspace
          </button>
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2">
            <Search size={13} className="text-[var(--color-muted)]" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="flex-1 bg-transparent py-1.5 text-xs outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]/60">Workspaces</p>
          {loading ? (
            <p className="px-2 py-2 text-xs text-[var(--color-muted)]">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-2 text-xs text-[var(--color-muted)]">No agents yet — create a workspace.</p>
          ) : filtered.map(a => (
            <button key={a.id} onClick={() => setActiveId(a.id)}
              className={`w-full text-left flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${a.id === activeId ? "bg-[var(--color-primary)]/15 text-[var(--color-text)]" : "text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]"}`}>
              <Bot size={14} className="shrink-0 text-[var(--color-primary)]" />
              <span className="truncate">{a.name || "Untitled agent"}</span>
            </button>
          ))}
          {active && turns.length > 0 && (
            <>
              <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]/60">History</p>
              <div className="px-2 py-1 text-xs text-[var(--color-muted)] flex items-center gap-1.5"><Clock size={11} /> {turns.filter(t => t.role === "user").length} message(s) this session</div>
            </>
          )}
        </div>
        {usage && (
          <div className="border-t border-[var(--color-border)] px-3 py-2 text-[11px] text-[var(--color-muted)] flex items-center gap-1.5" title="Agent AI usage this month">
            <Coins size={12} className="text-[var(--color-primary)]" />
            {fmtTokens(usage.tokensThisMonth)}{usage.cap > 0 ? ` / ${fmtTokens(usage.cap)}` : ""} tokens · {usage.runs} runs
          </div>
        )}
      </aside>

      {/* ── Conversation ───────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col">
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <Bot size={32} className="text-[var(--color-primary)] mb-3" />
            <p className="text-sm font-semibold">Create a workspace to start</p>
            <p className="text-xs text-[var(--color-muted)] mt-1 max-w-sm">Each workspace is an agent with its own tools and engine. Build one, give it tools, and chat — it plans, runs read tools, and asks approval for any write.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2 min-w-0">
                <Bot size={16} className="text-[var(--color-primary)] shrink-0" />
                <span className="font-semibold truncate">{active.name || "Untitled agent"}</span>
                <span className="text-[11px] font-mono text-[var(--color-muted)] truncate">· {active.tools?.length ?? 0} tools</span>
              </div>
              {hasKey === false && <span className="text-[10px] text-amber-400 border border-amber-700/40 rounded-full px-2 py-0.5">Connect engine in Build tab</span>}
            </div>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {turns.length === 0 ? (
                <div className="text-center text-[var(--color-muted)] py-10 text-sm">
                  Ask <span className="font-medium text-[var(--color-text)]">{active.name || "this agent"}</span> anything — or type <span className="font-mono text-[var(--color-primary)]">/</span> for tasks. Toggle <span className="text-[var(--color-text)]">Task mode</span> to run a sub-agent swarm.
                </div>
              ) : turns.map((t, i) => t.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-3.5 py-2 text-sm whitespace-pre-wrap">{t.text}</div>
                </div>
              ) : (
                <div key={i} className="flex flex-col items-start gap-2">
                  {t.subResults && t.subResults.length > 0 && <SwarmAccordion plan={t.plan ?? []} subResults={t.subResults} />}
                  {t.steps && t.steps.length > 0 && (!t.subResults || t.subResults.length === 0) && <TaskAccordion steps={t.steps} />}
                  <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-[var(--color-surface)] border border-[var(--color-border)] px-3.5 py-2 text-sm whitespace-pre-wrap">{t.text}</div>
                  {t.pending && t.pending.length > 0 && (
                    <div className="w-full space-y-1.5">{t.pending.map(p => <ApprovalCard key={p.id} action={p} agentId={active.id} />)}</div>
                  )}
                </div>
              ))}
              {running && <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><Loader2 size={13} className="animate-spin" /> {taskMode ? "Coordinating sub-agents…" : "Working…"}</div>}
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-[var(--color-border)] p-3">
              {slashOpen && slashMatches.length > 0 && (
                <div className="mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                  {slashMatches.map(s => (
                    <button key={s.cmd} onClick={() => { setInput(s.prompt); if (s.swarm) setTaskMode(true); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/5">
                      <Slash size={11} className="text-[var(--color-primary)]" />
                      <span className="font-mono text-[var(--color-primary)]">{s.cmd}</span>
                      <span className="text-[var(--color-muted)] truncate">{s.prompt}</span>
                      {s.swarm && <span className="ml-auto text-[9px] text-[var(--color-primary)] border border-[var(--color-primary)]/40 rounded-full px-1.5">task</span>}
                    </button>
                  ))}
                </div>
              )}
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                <textarea value={input} onChange={e => setInput(e.target.value)} rows={1}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder='Ask anything — "@" to reference, "/" for tasks'
                  className="w-full bg-transparent px-2 py-1.5 text-sm outline-none resize-none" />
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <button onClick={() => setToolsOpen(true)} className="flex items-center gap-1.5 text-xs rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]">
                    <Wrench size={12} /> Tools <span className="text-[var(--color-primary)] font-semibold">{activeTools.length}</span>
                  </button>
                  <button onClick={() => setTaskMode(v => !v)} title="Task mode: a planner coordinates sub-agents to complete the goal"
                    className={`flex items-center gap-1.5 text-xs rounded-lg border px-2.5 py-1.5 transition-colors ${taskMode ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"}`}>
                    <Network size={12} /> Task mode {taskMode ? "on" : "off"}
                  </button>
                  <div className="flex items-center gap-1.5 text-xs rounded-lg border border-[var(--color-border)] px-2 py-1 text-[var(--color-muted)]">
                    <Cpu size={12} />
                    <select value={active.model || MODELS[0].id} onChange={e => setModel(e.target.value)} className="bg-transparent outline-none text-xs max-w-[150px]">
                      {MODELS.map(m => <option key={m.id} value={m.id} className="bg-[var(--color-surface)] text-[var(--color-text)]">{m.label}</option>)}
                      {active.model && !MODELS.some(m => m.id === active.model) && <option value={active.model} className="bg-[var(--color-surface)] text-[var(--color-text)]">{active.model}</option>}
                    </select>
                  </div>
                  <button onClick={() => void send()} disabled={running || !input.trim()} className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-3.5 py-1.5 hover:opacity-90 disabled:opacity-40">
                    {running ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── Tools slide-over ───────────────────────────────────────── */}
      {toolsOpen && active && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setToolsOpen(false)} />
          <div className="fixed right-0 top-0 z-50 h-full w-[22rem] max-w-[92vw] bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Wrench size={15} className="text-[var(--color-primary)]" /> Tools — {active.name}</h3>
              <button onClick={() => setToolsOpen(false)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
            </div>
            <p className="px-4 pt-2 text-xs text-[var(--color-muted)]">Toggle what this agent can use. Read tools run instantly; write tools need your approval.</p>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {catalog.map(t => {
                const on = activeTools.includes(t.name);
                return (
                  <button key={t.name} onClick={() => toggleTool(t.name)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${on ? "border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10" : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-mono font-medium truncate">{t.name}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full border ${t.scope === "write" ? "border-amber-700/40 text-amber-400" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{t.scope === "write" ? "write" : "read"}</span>
                        {on && <Check size={14} className="text-[var(--color-primary)]" />}
                      </span>
                    </div>
                    {t.description && <p className="text-[11px] text-[var(--color-muted)] mt-1 line-clamp-2">{t.description}</p>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Sub-agent swarm result — the plan + each sub-task's answer, then the synthesis.
function SwarmAccordion({ plan, subResults }: { plan: string[]; subResults: SubResult[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full max-w-[85%] rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-surface)] overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5">
        {open ? <ChevronDown size={13} className="text-[var(--color-muted)]" /> : <ChevronRight size={13} className="text-[var(--color-muted)]" />}
        <Network size={12} className="text-[var(--color-primary)]" />
        <span className="text-xs font-medium text-[var(--color-primary)]">Swarm · {subResults.length} sub-agent{subResults.length === 1 ? "" : "s"} completed</span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2 border-t border-[var(--color-border)]">
          {subResults.map((r, j) => (
            <div key={j} className="mt-2">
              <p className="text-[11px] font-semibold flex items-start gap-1.5"><span className="text-[var(--color-primary)]">{j + 1}.</span> {r.task}</p>
              <p className="text-[11px] text-[var(--color-muted)] whitespace-pre-wrap mt-0.5 pl-4">{r.reply}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Kogo-style "N tasks completed" accordion over the tool steps the agent ran.
function TaskAccordion({ steps }: { steps: RunStep[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full max-w-[80%] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5">
        {open ? <ChevronDown size={13} className="text-[var(--color-muted)]" /> : <ChevronRight size={13} className="text-[var(--color-muted)]" />}
        <Sparkles size={12} className="text-[var(--color-primary)]" />
        <span className="text-xs font-medium text-[var(--color-primary)]">{steps.length} task{steps.length === 1 ? "" : "s"} completed</span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-2 border-t border-[var(--color-border)]">
          {steps.map((s, j) => (
            <div key={j} className="mt-2">
              <div className="flex items-center gap-1.5 text-[11px] font-mono"><Wrench size={11} className="text-[var(--color-primary)]" /> {s.tool || "tool"}</div>
              {s.result != null && <pre className="text-[10px] font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-2 mt-1 overflow-x-auto max-h-40 overflow-y-auto">{pretty(s.result)}</pre>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Write the agent proposed — gated on the user's approval (role-checked server-side).
function ApprovalCard({ action, agentId }: { action: PendingAction; agentId: string }) {
  const [state, setState] = useState<"pending" | "approving" | "done" | "rejected">("pending");
  const [result, setResult] = useState<unknown>(null);
  const approve = async () => {
    setState("approving");
    try { const r = await api.post(`/api/books/agents/${agentId}/confirm`, { tool: action.tool, args: action.args ?? {} }); setResult(r); setState("done"); toast.success("Approved & executed"); }
    catch (e) { setState("pending"); toast.error(humanizeAiError(e)); }
  };
  if (state === "rejected") return <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)] flex items-center gap-2"><X size={13} /> Rejected: <span className="font-mono">{action.tool}</span></div>;
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-900/10 overflow-hidden">
      <div className="px-3 py-2 flex items-start gap-2">
        <ShieldAlert size={15} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium flex items-center gap-2 flex-wrap">{action.label || `Run ${action.tool}`}<span className="text-[10px] uppercase font-mono text-amber-400 border border-amber-500/40 rounded-full px-1.5 py-0.5">needs approval</span></div>
          <pre className="text-[11px] font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-2 mt-1.5 overflow-x-auto max-h-32 overflow-y-auto">{pretty(action.args)}</pre>
        </div>
      </div>
      {state === "done" ? (
        <div className="px-3 pb-3"><div className="text-[11px] uppercase text-green-400 mb-1 flex items-center gap-1"><Check size={12} /> Executed</div><pre className="text-[11px] font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">{pretty(result)}</pre></div>
      ) : (
        <div className="px-3 pb-2.5 flex items-center justify-end gap-2">
          <button onClick={() => setState("rejected")} disabled={state === "approving"} className="text-xs px-2.5 py-1 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={12} className="inline" /> Reject</button>
          <button onClick={approve} disabled={state === "approving"} className="text-xs px-3 py-1 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold">{state === "approving" ? <Loader2 size={13} className="animate-spin inline" /> : <Check size={13} className="inline" />} Approve</button>
        </div>
      )}
    </div>
  );
}
