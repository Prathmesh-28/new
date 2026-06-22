import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Bot, RefreshCw, Plus, Save, Trash2, Pencil, X, Send, Cpu, KeyRound,
  CheckCircle2, AlertCircle, Wrench, ChevronRight, ChevronDown, MessageSquare, Sparkles,
  BookOpen, Upload, FileText, Check, ShieldAlert,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (loose — backend response shapes inlined)
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

interface Agent {
  id: string;
  name?: string;
  instructions?: string;
  model?: string | null;
  tools?: string[] | string | null;
  enabled?: boolean;
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

function pretty(v: unknown): string {
  if (v == null) return "—";
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
export default function BooksAgentsTab() {
  // engine config
  const [cfg, setCfg] = useState<LlmConfig | null>(null);
  // catalogue + agents (shared down to the children)
  const [catalog, setCatalog] = useState<ToolDef[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsBusy, setAgentsBusy] = useState(true);

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

      <EngineCard cfg={cfg} onChange={setCfg} />
      <AgentsManager
        agents={agents}
        busy={agentsBusy}
        catalog={catalog}
        reload={loadAgents}
        engineReady={!!cfg?.hasKey}
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

  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [embedModel, setEmbedModel] = useState(DEFAULT_EMBED_MODEL);

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <label className={labelCls}>
            <span className="inline-flex items-center gap-1"><KeyRound size={11} /> OpenRouter API key</span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={connected ? "•••••••••• (set — leave blank to keep)" : "sk-or-…"}
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
        Any OpenAI-compatible endpoint works. You can later point the base URL at your own server — e.g. a Raspberry Pi
        running Ollama at <code className="font-mono text-[var(--color-text)]">http://&lt;pi&gt;:11434/v1</code> — and keep the key blank.
        The embedding model powers each agent's Knowledge search.
      </p>

      <div className="flex justify-end mt-4">
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
}: {
  agents: Agent[];
  busy: boolean;
  catalog: ToolDef[];
  reload: () => Promise<void>;
  engineReady: boolean;
}) {
  const [editing, setEditing] = useState<Agent | "new" | null>(null);

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
          <div className="px-4 py-8 text-center text-[var(--color-muted)]">No agents yet — create one above.</div>
        ) : (
          agents.map((a) => (
            <AgentRow key={a.id} agent={a} onEdit={() => setEditing(a)} reload={reload} />
          ))
        )}
      </div>
    </div>
  );
}

function AgentRow({ agent: a, onEdit, reload }: { agent: Agent; onEdit: () => void; reload: () => Promise<void> }) {
  const [showKnowledge, setShowKnowledge] = useState(false);
  const tools = toolsOf(a);
  return (
    <div>
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
      {showKnowledge && (
        <div className="px-4 pb-4 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
          <KnowledgePanel agentId={a.id} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE PANEL (per agent) — upload/paste docs for retrieval (RAG)
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
          placeholder="Paste content the agent should know — policies, FAQs, product notes… It gets chunked, embedded and searched at chat time."
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
              <>Ask <span className="font-medium text-[var(--color-text)]">{selected.name || "this agent"}</span> something — e.g. "Who owes us the most right now?"</>
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
// PENDING ACTION CARD — a write the agent wants to perform, gated on approval
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
