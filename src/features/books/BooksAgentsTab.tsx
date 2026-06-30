import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Bot, RefreshCw, Plus, Save, Trash2, Pencil, X, Send, Cpu, KeyRound,
  CheckCircle2, AlertCircle, Wrench, ChevronRight, ChevronDown, MessageSquare, Sparkles,
  BookOpen, Upload, FileText, Check, ShieldAlert, Clock, Server, Cloud, Zap, LayoutGrid, Play,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (loose - backend response shapes inlined)
// ─────────────────────────────────────────────────────────────────────────────
interface LlmConfig {
  baseUrl?: string;
  base_url?: string;
  model?: string;
  embedModel?: string;
  embed_model?: string;
  hasKey?: boolean;
}

interface ToolDef {
  name: string;
  description?: string;
  scope?: "read" | "write";
}

interface AgentDoc {
  title: string;
  chunks?: number;
  chars?: number;
  created_at?: string;
}

interface PendingAction {
  id: string;
  tool: string;
  args?: unknown;
  label?: string;
}

type Schedule = "off" | "daily" | "weekly";

interface Agent {
  id: string;
  name?: string;
  instructions?: string;
  model?: string | null;
  tools?: string[] | string | null;
  enabled?: boolean;
  schedule?: Schedule | null;
  schedule_hour?: number | null;
  schedule_dow?: number | null;
  trigger_prompt?: string | null;
  last_run_at?: string | null;
}

interface AgentTemplate {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  tools?: string[];
  suggestedModel?: string;
}

interface RunStep {
  tool?: string;
  args?: unknown;
  result?: unknown;
}

interface RunResponse {
  reply?: string;
  steps?: RunStep[];
  pendingActions?: PendingAction[];
}

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small";
const SELFHOSTED_BASE_URL = "http://localhost:11434/v1";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}

function toolsOf(a: Agent): string[] {
  const t = a.tools;
  if (Array.isArray(t)) return t.map(String);
  if (typeof t === "string") {
    try {
      const p = JSON.parse(t);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hourLabel(h: number): string {
  const hr = ((h % 24) + 24) % 24;
  const ampm = hr < 12 ? "AM" : "PM";
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}:00 ${ampm}`;
}

function scheduleSummary(a: Agent): string | null {
  const s = (a.schedule ?? "off") as Schedule;
  if (s === "off") return null;
  const h = hourLabel(a.schedule_hour ?? 9);
  if (s === "daily") return `Daily at ${h}`;
  const dow = a.schedule_dow ?? 1;
  return `Weekly · ${WEEKDAYS[((dow % 7) + 7) % 7]} at ${h}`;
}

function pretty(v: unknown): string {
  if (v == null) return "-";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED STYLES (match the rest of Books)
// ─────────────────────────────────────────────────────────────────────────────
const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)] disabled:opacity-40 transition-colors";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksAgentsTab({ autoRunAgentId }: { autoRunAgentId?: string } = {}) {
  // engine config
  const [cfg, setCfg] = useState<LlmConfig | null>(null);
  // catalogue + agents (shared down to the children)
  const [catalog, setCatalog] = useState<ToolDef[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsBusy, setAgentsBusy] = useState(true);
  const [showHelp, setShowHelp] = useState(true);

  const loadAgents = useCallback(async () => {
    setAgentsBusy(true);
    try {
      const rows = await api.get<Agent[]>("/api/books/agents");
      setAgents(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
      setAgents([]);
    } finally {
      setAgentsBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tools = await api.get<ToolDef[]>("/api/books/agents/tools");
        if (!cancelled) setCatalog(Array.isArray(tools) ? tools : []);
      } catch (e) {
        if (!cancelled) toast.error(errMsg(e));
      }
    })();
    void loadAgents();
    return () => {
      cancelled = true;
    };
  }, [loadAgents]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Bot size={18} className="text-[var(--color-primary)]" /> Agents
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-0.5">
          No-code AI assistants over your books. Connect a model, give an agent instructions and tools, then chat with it.
        </p>
      </div>

      {/* How to use - collapsible guide */}
      <div className="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5">
        <button onClick={() => setShowHelp(v => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
          <span className="flex items-center gap-2 text-sm font-semibold"><BookOpen size={15} className="text-[var(--color-primary)]" /> How to use AI Agents</span>
          {showHelp ? <ChevronDown size={16} className="text-[var(--color-muted)]" /> : <ChevronRight size={16} className="text-[var(--color-muted)]" />}
        </button>
        {showHelp && (
          <div className="space-y-2.5 border-t border-[var(--color-border)] px-4 py-3 text-xs leading-relaxed text-[var(--color-muted)]">
            <p><strong className="text-[var(--color-text)]">What this is:</strong> build your own AI assistants that read your live books (and, with approval, take actions) - no code.</p>
            <ol className="space-y-2">
              <li className="flex gap-2"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[9px] font-semibold text-[var(--color-primary)]">1</span><span><strong className="text-[var(--color-text)]">Connect a model</strong> (Engine card below): if your workspace key is already set you're ready to go - the default is a <strong>free model</strong> (no credits needed). To use your own, paste an <strong>OpenRouter API key</strong>, pick a model, then <strong>Save → Test connection</strong>. (Self-hosted later: switch the preset to point at your own Pi/Ollama URL.)</span></li>
              <li className="flex gap-2"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[9px] font-semibold text-[var(--color-primary)]">2</span><span><strong className="text-[var(--color-text)]">Add an agent</strong>: pick a <strong>Template</strong> (Collections Chaser, Cash-flow Watchdog, GST Filing Helper…) and click <em>Use template</em> - or <strong>New agent</strong>: name it, write instructions in plain English, and tick the <strong>tools</strong> it may use.</span></li>
              <li className="flex gap-2"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[9px] font-semibold text-[var(--color-primary)]">3</span><span><strong className="text-[var(--color-text)]">(Optional) Add knowledge</strong>: upload your price list / policies in the agent's Knowledge panel so it answers from your own data.</span></li>
              <li className="flex gap-2"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[9px] font-semibold text-[var(--color-primary)]">4</span><span><strong className="text-[var(--color-text)]">Test in the Playground</strong>: chat with it. If it proposes a <strong>write</strong> (create invoice/ledger), you get <strong>Approve / Reject</strong> cards - nothing posts to your books without your click.</span></li>
              <li className="flex gap-2"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[9px] font-semibold text-[var(--color-primary)]">5</span><span><strong className="text-[var(--color-text)]">(Optional) Schedule it</strong>: set Daily/Weekly + an hour so it runs itself (e.g. a 9am cash brief). Scheduled runs are <strong>read-only</strong> - proposed writes wait for your approval.</span></li>
            </ol>
            <p className="flex items-center gap-1.5 text-[11px]"><ShieldAlert size={12} className="text-[var(--color-warning,#d97706)]" /> Runs on your own engine (free model by default - no credits needed). Writes always need approval and are role-checked + audited.</p>
          </div>
        )}
      </div>

      <EngineCard cfg={cfg} onChange={setCfg} />
      <AgentsManager
        agents={agents}
        busy={agentsBusy}
        catalog={catalog}
        reload={loadAgents}
        engineReady={!!cfg?.hasKey}
        autoRunAgentId={autoRunAgentId}
      />
      <Playground agents={agents} engineReady={!!cfg?.hasKey} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (1) ENGINE CARD
// ─────────────────────────────────────────────────────────────────────────────
function EngineCard({ cfg, onChange }: { cfg: LlmConfig | null; onChange: (c: LlmConfig) => void }) {
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [embedModel, setEmbedModel] = useState(DEFAULT_EMBED_MODEL);

  // Derive the active provider preset from the base URL.
  const isSelfHosted = /localhost|127\.0\.0\.1|:11434|ollama/i.test(baseUrl);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const c = await api.get<LlmConfig>("/api/books/agents/llm-config");
      onChange(c ?? {});
      setModel(c?.model || DEFAULT_MODEL);
      setBaseUrl(c?.baseUrl || c?.base_url || DEFAULT_BASE_URL);
      setEmbedModel(c?.embedModel || c?.embed_model || DEFAULT_EMBED_MODEL);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        model: model.trim() || DEFAULT_MODEL,
        baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
        embedModel: embedModel.trim() || DEFAULT_EMBED_MODEL,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const c = await api.put<LlmConfig>("/api/books/agents/llm-config", body);
      onChange(c ?? {});
      setApiKey("");
      setModel(c?.model || DEFAULT_MODEL);
      setBaseUrl(c?.baseUrl || c?.base_url || DEFAULT_BASE_URL);
      setEmbedModel(c?.embedModel || c?.embed_model || DEFAULT_EMBED_MODEL);
      toast.success("Engine saved");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const body: Record<string, unknown> = {
        baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
        model: model.trim() || DEFAULT_MODEL,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const res = await api.post<{ ok?: boolean; error?: string }>("/api/books/agents/llm-config/test", body);
      if (res?.ok) toast.success("Connection OK");
      else toast.error(res?.error || "Connection failed");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setTesting(false);
    }
  };

  const connected = !!cfg?.hasKey;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Cpu size={15} className="text-[var(--color-primary)]" /> Engine
        </h3>
        <div className="flex items-center gap-3">
          {connected ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400">
              <CheckCircle2 size={13} /> Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
              <AlertCircle size={13} /> Not connected
            </span>
          )}
          <button type="button" onClick={() => void load()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Provider preset toggle - prefills the base URL */}
      <div className="mb-4">
        <label className={labelCls}>Provider</label>
        <div className="inline-flex rounded-lg border border-[var(--color-border)] overflow-hidden">
          <button
            type="button"
            onClick={() => setBaseUrl(DEFAULT_BASE_URL)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
              !isSelfHosted
                ? "bg-[var(--color-primary)] text-[var(--color-bg)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <Cloud size={13} /> OpenRouter
          </button>
          <button
            type="button"
            onClick={() => setBaseUrl(SELFHOSTED_BASE_URL)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-l border-[var(--color-border)] transition-colors ${
              isSelfHosted
                ? "bg-[var(--color-primary)] text-[var(--color-bg)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <Server size={13} /> Self-hosted (Pi/Ollama)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <label className={labelCls}>
            <span className="inline-flex items-center gap-1">
              <KeyRound size={11} /> {isSelfHosted ? "API key (optional)" : "OpenRouter API key"}
            </span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={connected ? "•••••••••• (set - leave blank to keep)" : "sk-or-…"}
            autoComplete="off"
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label className={labelCls}>Model</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODEL}
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label className={labelCls}>Base URL</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={DEFAULT_BASE_URL}
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label className={labelCls}>
            <span className="inline-flex items-center gap-1"><BookOpen size={11} /> Embedding model</span>
          </label>
          <input
            value={embedModel}
            onChange={(e) => setEmbedModel(e.target.value)}
            placeholder={DEFAULT_EMBED_MODEL}
            className={`${inputCls} font-mono`}
          />
        </div>
      </div>

      <p className="text-xs text-[var(--color-muted)] mt-3">
        Any OpenAI-compatible endpoint works. You can later point the base URL at your own server - e.g. a Raspberry Pi
        running Ollama at <code className="font-mono text-[var(--color-text)]">http://&lt;pi&gt;:11434/v1</code> - and keep the key blank.
        The embedding model powers each agent's Knowledge search.
      </p>

      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={test} disabled={testing || saving} className={btnGhost}>
          {testing ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
          Test connection
        </button>
        <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          Save engine
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (2) AGENTS LIST + CREATE/EDIT
// ─────────────────────────────────────────────────────────────────────────────
function AgentsManager({
  agents,
  busy,
  catalog,
  reload,
  engineReady,
  autoRunAgentId,
}: {
  agents: Agent[];
  busy: boolean;
  catalog: ToolDef[];
  reload: () => Promise<void>;
  engineReady: boolean;
  autoRunAgentId?: string;
}) {
  const [editing, setEditing] = useState<Agent | "new" | null>(null);

  // After cloning a template the list reloads; we want to open the new agent in
  // the editor. We stash its id and pick it up once it appears in `agents`.
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!openId) return;
    const found = agents.find((a) => a.id === openId);
    if (found) {
      setEditing(found);
      setOpenId(null);
    }
  }, [openId, agents]);

  const onCloned = useCallback(
    async (created: Agent) => {
      setOpenId(created.id);
      await reload();
    },
    [reload]
  );

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles size={15} className="text-[var(--color-primary)]" /> Your agents
        </h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void reload()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
          <button type="button" onClick={() => setEditing("new")} className={btnPrimary}>
            <Plus size={14} /> New agent
          </button>
        </div>
      </div>

      <TemplatesGallery onCloned={onCloned} />

      {editing && (
        <div className="px-4 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <AgentEditor
            agent={editing === "new" ? null : editing}
            catalog={catalog}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await reload();
            }}
          />
        </div>
      )}

      {!engineReady && (
        <div className="px-4 py-2 text-xs text-amber-400 border-b border-[var(--color-border)] bg-amber-900/10 flex items-center gap-1.5">
          <AlertCircle size={12} /> Connect an LLM in the Engine card above before running agents.
        </div>
      )}

      <div className="divide-y divide-[var(--color-border)]">
        {busy ? (
          <div className="px-4 py-8 text-center text-[var(--color-muted)]">Loading…</div>
        ) : agents.length === 0 ? (
          <div className="px-4 py-8 text-center text-[var(--color-muted)]">No agents yet - create one above.</div>
        ) : (
          agents.map((a) => (
            <AgentRow key={a.id} agent={a} onEdit={() => setEditing(a)} reload={reload} engineReady={engineReady} autoRun={a.id === autoRunAgentId} />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES GALLERY - curated starting points; clone -> open in editor
// ─────────────────────────────────────────────────────────────────────────────
function TemplatesGallery({ onCloned }: { onCloned: (created: Agent) => Promise<void> }) {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const rows = await api.get<AgentTemplate[]>("/api/books/agents/templates");
      setTemplates(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
      setTemplates([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const use = async (t: AgentTemplate) => {
    setCloningId(t.id);
    try {
      const created = await api.post<Agent>(`/api/books/agents/templates/${t.id}/clone`, {});
      toast.success(`Created "${created?.name || t.name}" from template`);
      await onCloned(created);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCloningId(null);
    }
  };

  // Hide entirely if the endpoint yields nothing.
  if (!busy && templates.length === 0) return null;

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-[var(--color-surface)] transition-colors"
      >
        <span className="text-xs font-semibold flex items-center gap-1.5 text-[var(--color-muted)]">
          <LayoutGrid size={13} className="text-[var(--color-primary)]" /> Start from a template
          {templates.length > 0 && (
            <span className="text-[10px] font-normal">({templates.length})</span>
          )}
        </span>
        {open ? <ChevronDown size={14} className="text-[var(--color-muted)]" /> : <ChevronRight size={14} className="text-[var(--color-muted)]" />}
      </button>

      {open && (
        <div className="px-4 pb-4">
          {busy ? (
            <div className="text-xs text-[var(--color-muted)] py-3">Loading templates…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] p-3"
                >
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    <Sparkles size={13} className="text-[var(--color-primary)] shrink-0" />
                    {t.name}
                  </div>
                  {t.description && (
                    <p className="text-xs text-[var(--color-muted)] mt-1 flex-1 leading-relaxed">{t.description}</p>
                  )}
                  {Array.isArray(t.tools) && t.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {t.tools.slice(0, 4).map((tool) => (
                        <span
                          key={tool}
                          className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-muted)]"
                        >
                          <Wrench size={9} /> {tool}
                        </span>
                      ))}
                      {t.tools.length > 4 && (
                        <span className="text-[10px] text-[var(--color-muted)]">+{t.tools.length - 4}</span>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => use(t)}
                    disabled={cloningId === t.id}
                    className={`${btnGhost} mt-3 justify-center`}
                  >
                    {cloningId === t.id ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                    Use template
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent: a, onEdit, reload, engineReady, autoRun }: { agent: Agent; onEdit: () => void; reload: () => Promise<void>; engineReady: boolean; autoRun?: boolean }) {
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [showRun, setShowRun] = useState(!!autoRun);
  const rowRef = useRef<HTMLDivElement>(null);
  const tools = toolsOf(a);
  // A freshly-built agent opens its Run panel automatically and scrolls into view,
  // so the test box is waiting for the user the moment it's created.
  useEffect(() => {
    if (autoRun) {
      setShowRun(true);
      rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [autoRun]);
  return (
    <div ref={rowRef}>
      <div className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.name || "Untitled agent"}</span>
                    {a.enabled === false && (
                      <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] border border-[var(--color-border)] rounded-full px-1.5 py-0.5">
                        disabled
                      </span>
                    )}
                    {a.model && (
                      <span className="text-[11px] font-mono text-[var(--color-muted)]">{a.model}</span>
                    )}
                    {scheduleSummary(a) && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-primary)] border border-[var(--color-primary)]/40 rounded-full px-1.5 py-0.5">
                        <Clock size={9} /> {scheduleSummary(a)}
                      </span>
                    )}
                  </div>
                  {a.instructions && (
                    <p className="text-xs text-[var(--color-muted)] mt-0.5 line-clamp-2">{a.instructions}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {tools.length === 0 ? (
                      <span className="text-[11px] text-[var(--color-muted)]">No tools</span>
                    ) : (
                      tools.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-muted)]"
                        >
                          <Wrench size={9} /> {t}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowRun((s) => !s)}
                    className={showRun
                      ? `${btnPrimary} !px-3 !py-1.5`
                      : "inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90 transition-opacity"}
                    title="Run / test this agent"
                  >
                    {showRun ? <X size={12} /> : <Play size={12} />} {showRun ? "Close" : "Run"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowKnowledge((s) => !s)}
                    className={btnGhost}
                    title="Knowledge"
                  >
                    <BookOpen size={12} /> Knowledge
                  </button>
                  <button type="button" onClick={onEdit} className={btnGhost} title="Edit">
                    <Pencil size={12} /> Edit
                  </button>
                  <DeleteButton agent={a} onDone={reload} />
                </div>
      </div>
      {showRun && (
        <div className="px-4 pb-4 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
          <AgentChat agentId={a.id} agentName={a.name || "this agent"} engineReady={engineReady} />
        </div>
      )}
      {showKnowledge && (
        <div className="px-4 pb-4 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
          <KnowledgePanel agentId={a.id} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT CHAT - an inline live runner scoped to ONE agent. Used both in the
// per-agent "Run" panel (in the list) and as the body of the standalone
// Playground. Sends to /run, shows the tool steps it took, and renders any
// write the agent proposes as an approval-gated PendingActionCard.
// ─────────────────────────────────────────────────────────────────────────────
function AgentChat({ agentId, agentName, engineReady, autoFocus }: { agentId: string; agentName: string; engineReady: boolean; autoFocus?: boolean }) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [running, setRunning] = useState(false);

  const send = async () => {
    const text = message.trim();
    if (!text) return;
    setMessage("");
    setTurns((t) => [...t, { role: "user", text }]);
    setRunning(true);
    try {
      const res = await api.post<RunResponse>(`/api/books/agents/${agentId}/run`, { message: text });
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: res?.reply || "(no reply)",
          steps: res?.steps || [],
          pendingActions: Array.isArray(res?.pendingActions) ? res!.pendingActions : [],
        },
      ]);
    } catch (e) {
      const m = errMsg(e);
      setTurns((t) => [...t, { role: "assistant", text: `Error: ${m}` }]);
      toast.error(m);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
        <span className="text-xs font-semibold flex items-center gap-1.5 text-[var(--color-muted)]">
          <MessageSquare size={13} className="text-[var(--color-primary)]" /> Test run · {agentName}
        </span>
        {turns.length > 0 && (
          <button type="button" onClick={() => setTurns([])} className={btnGhost} title="Clear">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      <div className="px-3 py-3 space-y-3 max-h-[24rem] overflow-y-auto">
        {turns.length === 0 ? (
          <div className="text-center text-[var(--color-muted)] py-5 text-xs">
            Ask <span className="font-medium text-[var(--color-text)]">{agentName}</span> something to test it live - e.g. "Run your task now and show me the result."
          </div>
        ) : (
          turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] bg-[var(--color-primary)] text-[var(--color-bg)] rounded-2xl rounded-br-sm px-3 py-1.5 text-sm whitespace-pre-wrap">{t.text}</div>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-start gap-2">
                <div className="max-w-[85%] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl rounded-bl-sm px-3 py-1.5 text-sm whitespace-pre-wrap">{t.text}</div>
                {t.steps && t.steps.length > 0 && (
                  <div className="w-full space-y-1.5 pl-1">
                    {t.steps.map((s, j) => (<StepRow key={j} step={s} />))}
                  </div>
                )}
                {t.pendingActions && t.pendingActions.length > 0 && (
                  <div className="w-full space-y-1.5 pl-1">
                    {t.pendingActions.map((pa) => (<PendingActionCard key={pa.id} action={pa} agentId={agentId} />))}
                  </div>
                )}
              </div>
            )
          )
        )}
        {running && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <RefreshCw size={13} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 border-t border-[var(--color-border)] flex items-end gap-2">
        <textarea
          value={message}
          autoFocus={autoFocus}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          rows={1}
          placeholder={engineReady ? "Type a message…  (Enter to send)" : "Connect an LLM in the Engine card first…"}
          className={`${inputCls} resize-none`}
        />
        <button type="button" onClick={() => void send()} disabled={running} className={btnPrimary}>
          {running ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />} Send
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE PANEL (per agent) - upload/paste docs for retrieval (RAG)
// ─────────────────────────────────────────────────────────────────────────────
function KnowledgePanel({ agentId }: { agentId: string }) {
  const [docs, setDocs] = useState<AgentDoc[]>([]);
  const [busy, setBusy] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const rows = await api.get<AgentDoc[]>(`/api/books/agents/${agentId}/docs`);
      setDocs(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
      setDocs([]);
    } finally {
      setBusy(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onFile = async (file: File) => {
    try {
      const text = await file.text();
      setContent(text);
      if (!title.trim()) setTitle(file.name);
    } catch {
      toast.error("Couldn't read that file");
    }
  };

  const add = async () => {
    const t = title.trim();
    const c = content.trim();
    if (!t) { toast.error("Give the document a title"); return; }
    if (!c) { toast.error("Paste or upload some content"); return; }
    setSaving(true);
    try {
      await api.post(`/api/books/agents/${agentId}/docs`, { title: t, content: c });
      toast.success("Knowledge added");
      setTitle("");
      setContent("");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (docTitle: string) => {
    if (!window.confirm(`Remove "${docTitle}" from this agent's knowledge?`)) return;
    try {
      await api.delete(`/api/books/agents/${agentId}/docs/${encodeURIComponent(docTitle)}`);
      toast.success("Removed");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-semibold flex items-center gap-1.5 text-[var(--color-muted)]">
          <BookOpen size={12} className="text-[var(--color-primary)]" /> Knowledge
        </h5>
        <button type="button" onClick={() => void load()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
          <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title (e.g. Credit policy)"
            className={inputCls}
          />
          <label className={`${btnGhost} cursor-pointer whitespace-nowrap`} title="Upload a text file">
            <Upload size={12} /> Upload
            <input
              type="file"
              accept=".txt,.md,.csv,.json,text/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
            />
          </label>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="Paste content the agent should know - policies, FAQs, product notes… It gets chunked, embedded and searched at chat time."
          className={`${inputCls} resize-y leading-relaxed`}
        />
        <div className="flex justify-end">
          <button type="button" onClick={add} disabled={saving} className={btnPrimary}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Add to knowledge
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {busy ? (
          <div className="text-xs text-[var(--color-muted)] py-2">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="text-xs text-[var(--color-muted)] py-2">No documents yet. Add one above to ground this agent's answers.</div>
        ) : (
          docs.map((d) => (
            <div
              key={d.title}
              className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <div className="min-w-0 flex items-center gap-2">
                <FileText size={13} className="text-[var(--color-primary)] shrink-0" />
                <span className="text-sm truncate">{d.title}</span>
                <span className="text-[11px] text-[var(--color-muted)] shrink-0">
                  {d.chunks ? `${d.chunks} chunk${d.chunks === 1 ? "" : "s"}` : ""}
                  {d.chars ? ` · ${d.chars.toLocaleString()} chars` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => remove(d.title)}
                className="text-[var(--color-muted)] hover:text-red-400 shrink-0"
                title="Remove"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DeleteButton({ agent, onDone }: { agent: Agent; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const del = async () => {
    if (!window.confirm(`Delete agent "${agent.name || "Untitled"}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.delete(`/api/books/agents/${agent.id}`);
      toast.success("Agent deleted");
      await onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={del} disabled={busy} className={btnGhost} title="Delete">
      {busy ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
    </button>
  );
}

function AgentEditor({
  agent,
  catalog,
  onClose,
  onSaved,
}: {
  agent: Agent | null;
  catalog: ToolDef[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(agent?.name ?? "");
  const [instructions, setInstructions] = useState(agent?.instructions ?? "");
  const [model, setModel] = useState(agent?.model ?? "");
  const [tools, setTools] = useState<string[]>(agent ? toolsOf(agent) : []);
  const [saving, setSaving] = useState(false);

  // Schedule controls
  const [schedule, setSchedule] = useState<Schedule>((agent?.schedule as Schedule) || "off");
  const [scheduleHour, setScheduleHour] = useState<number>(agent?.schedule_hour ?? 9);
  const [scheduleDow, setScheduleDow] = useState<number>(agent?.schedule_dow ?? 1);
  const [triggerPrompt, setTriggerPrompt] = useState(agent?.trigger_prompt ?? "");

  const toggleTool = (t: string) => {
    setTools((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Give the agent a name");
      return;
    }
    setSaving(true);
    const body = {
      name: name.trim(),
      instructions: instructions.trim(),
      model: model.trim() || null,
      tools,
      schedule,
      schedule_hour: scheduleHour,
      schedule_dow: schedule === "weekly" ? scheduleDow : null,
      trigger_prompt: triggerPrompt.trim() || null,
    };
    try {
      if (agent) {
        await api.patch(`/api/books/agents/${agent.id}`, body);
        toast.success("Agent updated");
      } else {
        await api.post("/api/books/agents", body);
        toast.success("Agent created");
      }
      await onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{agent ? "Edit agent" : "New agent"}</h4>
        <button type="button" onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Close">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Collections assistant"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Model override (optional)</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Leave blank to use the engine default"
            className={`${inputCls} font-mono`}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Instructions (system prompt)</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={5}
          placeholder="You are a helpful accounting assistant for an Indian SMB. When asked about money owed, use the receivables tool and summarise the top overdue parties…"
          className={`${inputCls} resize-y leading-relaxed`}
        />
      </div>

      <div>
        <label className={labelCls}>Tools the agent may use</label>
        {catalog.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No tools available.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {catalog.map((t) => {
              const on = tools.includes(t.name);
              return (
                <label
                  key={t.name}
                  className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    on
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                      : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleTool(t.name)}
                    className="mt-0.5 accent-[var(--color-primary)]"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-mono">{t.name}</span>
                      {t.scope === "write" && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide font-semibold text-amber-400 border border-amber-500/40 rounded-full px-1.5 py-0.5">
                          <ShieldAlert size={9} /> write
                        </span>
                      )}
                    </span>
                    {t.description && (
                      <span className="block text-xs text-[var(--color-muted)] mt-0.5">{t.description}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Schedule - autonomous, read-only runs */}
      <div className="border border-[var(--color-border)] rounded-lg p-3 bg-[var(--color-surface)] space-y-3">
        <div className="text-xs font-semibold flex items-center gap-1.5 text-[var(--color-muted)]">
          <Clock size={12} className="text-[var(--color-primary)]" /> Schedule
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Run</label>
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as Schedule)}
              className={inputCls}
            >
              <option value="off">Off</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          {schedule !== "off" && (
            <div>
              <label className={labelCls}>At hour</label>
              <select
                value={scheduleHour}
                onChange={(e) => setScheduleHour(Number(e.target.value))}
                className={inputCls}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{hourLabel(h)}</option>
                ))}
              </select>
            </div>
          )}
          {schedule === "weekly" && (
            <div>
              <label className={labelCls}>Day of week</label>
              <select
                value={scheduleDow}
                onChange={(e) => setScheduleDow(Number(e.target.value))}
                className={inputCls}
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {schedule !== "off" && (
          <>
            <div>
              <label className={labelCls}>Trigger prompt (optional)</label>
              <textarea
                value={triggerPrompt}
                onChange={(e) => setTriggerPrompt(e.target.value)}
                rows={2}
                placeholder="What should the agent do on each scheduled run? e.g. Summarise overdue invoices and draft reminders. Leave blank for a sensible default."
                className={`${inputCls} resize-y leading-relaxed`}
              />
            </div>
            <p className="text-[11px] text-[var(--color-muted)] flex items-start gap-1.5">
              <ShieldAlert size={12} className="text-amber-400 shrink-0 mt-0.5" />
              Scheduled runs are read-only - any actions that change data are saved as pending approvals for you to review later, not executed automatically.
            </p>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnGhost}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          {agent ? "Save changes" : "Create agent"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (3) PLAYGROUND
// ─────────────────────────────────────────────────────────────────────────────
interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  steps?: RunStep[];
  pendingActions?: PendingAction[];
}

function Playground({ agents, engineReady }: { agents: Agent[]; engineReady: boolean }) {
  const [agentId, setAgentId] = useState("");
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [running, setRunning] = useState(false);

  // Default the picker to the first agent once they load.
  useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const selected = useMemo(() => agents.find((a) => a.id === agentId), [agents, agentId]);

  const send = async () => {
    const text = message.trim();
    if (!agentId) {
      toast.error("Pick an agent");
      return;
    }
    if (!text) return;
    setMessage("");
    setTurns((t) => [...t, { role: "user", text }]);
    setRunning(true);
    try {
      const res = await api.post<RunResponse>(`/api/books/agents/${agentId}/run`, { message: text });
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: res?.reply || "(no reply)",
          steps: res?.steps || [],
          pendingActions: Array.isArray(res?.pendingActions) ? res!.pendingActions : [],
        },
      ]);
    } catch (e) {
      const m = errMsg(e);
      setTurns((t) => [...t, { role: "assistant", text: `Error: ${m}` }]);
      toast.error(m);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare size={15} className="text-[var(--color-primary)]" /> Playground
        </h3>
        <div className="flex items-center gap-2">
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={`${inputCls} w-auto`}>
            <option value="">Select an agent…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name || "Untitled agent"}</option>
            ))}
          </select>
          {turns.length > 0 && (
            <button type="button" onClick={() => setTurns([])} className={btnGhost} title="Clear conversation">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* transcript */}
      <div className="px-4 py-4 space-y-3 max-h-[28rem] overflow-y-auto">
        {turns.length === 0 ? (
          <div className="text-center text-[var(--color-muted)] py-8 text-sm">
            {selected ? (
              <>Ask <span className="font-medium text-[var(--color-text)]">{selected.name || "this agent"}</span> something - e.g. "Who owes us the most right now?"</>
            ) : (
              <>Pick an agent and start chatting.</>
            )}
          </div>
        ) : (
          turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] bg-[var(--color-primary)] text-[var(--color-bg)] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm whitespace-pre-wrap">
                  {t.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-start gap-2">
                <div className="max-w-[80%] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm whitespace-pre-wrap">
                  {t.text}
                </div>
                {t.steps && t.steps.length > 0 && (
                  <div className="w-full space-y-1.5 pl-1">
                    {t.steps.map((s, j) => (
                      <StepRow key={j} step={s} />
                    ))}
                  </div>
                )}
                {t.pendingActions && t.pendingActions.length > 0 && agentId && (
                  <div className="w-full space-y-1.5 pl-1">
                    {t.pendingActions.map((pa) => (
                      <PendingActionCard key={pa.id} action={pa} agentId={agentId} />
                    ))}
                  </div>
                )}
              </div>
            )
          )
        )}
        {running && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <RefreshCw size={13} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>

      {/* composer */}
      <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-end gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={engineReady ? "Type a message…  (Enter to send, Shift+Enter for newline)" : "Connect an LLM in the Engine card first…"}
          className={`${inputCls} resize-none`}
        />
        <button type="button" onClick={() => void send()} disabled={running || !agentId} className={btnPrimary}>
          {running ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
          Send
        </button>
      </div>
    </div>
  );
}

function StepRow({ step }: { step: RunStep }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--color-bg)] transition-colors"
      >
        {open ? <ChevronDown size={13} className="text-[var(--color-muted)]" /> : <ChevronRight size={13} className="text-[var(--color-muted)]" />}
        <Wrench size={12} className="text-[var(--color-primary)]" />
        <span className="text-xs font-mono font-medium">{step.tool || "tool"}</span>
        <span className="text-[11px] text-[var(--color-muted)] truncate flex-1">
          {step.args ? pretty(step.args).replace(/\s+/g, " ").slice(0, 80) : ""}
        </span>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-[var(--color-border)]">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mt-2 mb-1">Arguments</div>
            <pre className="text-[11px] font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-2 overflow-x-auto">{pretty(step.args)}</pre>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">Result</div>
            <pre className="text-[11px] font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-2 overflow-x-auto max-h-60 overflow-y-auto">{pretty(step.result)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PENDING ACTION CARD - a write the agent wants to perform, gated on approval
// ─────────────────────────────────────────────────────────────────────────────
type ActionState = "pending" | "approving" | "done" | "rejected";

function PendingActionCard({ action, agentId }: { action: PendingAction; agentId: string }) {
  const [state, setState] = useState<ActionState>("pending");
  const [result, setResult] = useState<unknown>(null);

  const approve = async () => {
    setState("approving");
    try {
      const res = await api.post(`/api/books/agents/${agentId}/confirm`, {
        tool: action.tool,
        args: action.args ?? {},
      });
      setResult(res);
      setState("done");
      toast.success("Action approved & executed");
    } catch (e) {
      setState("pending");
      toast.error(errMsg(e));
    }
  };

  if (state === "rejected") {
    return (
      <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)] flex items-center gap-2">
        <X size={13} /> Rejected: <span className="font-mono">{action.tool}</span>
      </div>
    );
  }

  return (
    <div className="border border-amber-500/40 rounded-lg bg-amber-900/10 overflow-hidden">
      <div className="px-3 py-2 flex items-start gap-2">
        <ShieldAlert size={15} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
            {action.label || `Run ${action.tool}`}
            <span className="text-[10px] uppercase tracking-wide font-mono text-amber-400 border border-amber-500/40 rounded-full px-1.5 py-0.5">
              needs approval
            </span>
          </div>
          <div className="text-[11px] font-mono text-[var(--color-muted)] mt-0.5">{action.tool}</div>
          <pre className="text-[11px] font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-2 mt-1.5 overflow-x-auto max-h-40 overflow-y-auto">{pretty(action.args)}</pre>
        </div>
      </div>

      {state === "done" ? (
        <div className="px-3 pb-3">
          <div className="text-[11px] uppercase tracking-wide text-green-400 mb-1 flex items-center gap-1">
            <Check size={12} /> Executed
          </div>
          <pre className="text-[11px] font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-2 overflow-x-auto max-h-60 overflow-y-auto">{pretty(result)}</pre>
        </div>
      ) : (
        <div className="px-3 pb-2.5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setState("rejected")}
            disabled={state === "approving"}
            className={btnGhost}
          >
            <X size={12} /> Reject
          </button>
          <button type="button" onClick={approve} disabled={state === "approving"} className={btnPrimary}>
            {state === "approving" ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            Approve
          </button>
        </div>
      )}
    </div>
  );
}
