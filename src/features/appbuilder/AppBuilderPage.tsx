import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { useT } from "@/i18n";
import { API_BASE } from "@/lib/apiBase";
import { toast } from "sonner";
import { humanizeAiError } from "@/components/ai/aiError";
import {
  Blocks, Plus, Search, Loader2, Sparkles, FileCode2, Monitor, ShieldCheck, Cpu,
  Send, ExternalLink, Share2, History, RotateCcw, RefreshCw, Lightbulb, Bot, Trash2, Check,
} from "lucide-react";

/**
 * App Builder - the Lovable/Emergent half of Headroom Studio. Describe an app in
 * plain English → the codegen orchestrator (runs on your OpenRouter engine,
 * grounded on your real business data) generates a self-contained app → it renders
 * live in a sandboxed preview → iterate by chat (each prompt = a new version) →
 * restore any version → publish to a shareable sandboxed link. Backed by /api/studio.
 */
interface Project { id: string; name: string; slug: string; current_version_id?: string | null }
interface Version { id: string; summary?: string | null; prompt?: string | null; created_at?: string; file_tree?: Record<string, string> }
interface AgentRef { id: string; name: string }
interface AppAgents { granted: AgentRef[]; available: AgentRef[] }
interface LogEntry { role: "user" | "system"; text: string; plan?: boolean; error?: boolean; buildPrompt?: string }
interface GenResult { mode: "plan" | "build"; plan?: string; html?: string; summary?: string; version?: Version }

// Starter apps - one click creates a project and builds it from your real business data.
const APP_TEMPLATES: { name: string; tag: string; prompt: string }[] = [
  { name: "VC Dashboard", tag: "Fundraising", prompt: "Build a VC/board dashboard with my cash on hand, monthly burn, runway in days, and overdue receivables - with charts and a clean executive summary." },
  { name: "Cash Runway Monitor", tag: "Cash", prompt: "Build a cash runway monitor: current cash, daily burn trend, projected zero-cash date, and a traffic-light status." },
  { name: "Invoice Tracker", tag: "Receivables", prompt: "Build an invoice tracker showing outstanding invoices, aging buckets (0-30 / 31-60 / 61-90 / 90+ days), and total receivable, sortable." },
  { name: "Collections Tracker", tag: "Receivables", prompt: "Build a collections tracker: who owes the most, days overdue, and a follow-up checklist." },
  { name: "Expense Report", tag: "Spend", prompt: "Build an expense report grouped by category with a chart and the top 10 expenses, for the current month." },
  { name: "GST Summary", tag: "Compliance", prompt: "Build a GST summary page showing output tax, input tax credit, and net payable for the current period." },
  { name: "KPI Scorecard", tag: "Overview", prompt: "Build a one-screen KPI scorecard with revenue, profit, cash, and receivables - each with a trend sparkline." },
  { name: "Sales Pipeline", tag: "Sales", prompt: "Build a sales pipeline board (leads → won) with deal values and a weighted forecast." },
];

export default function AppBuilderPage() {
  const tr = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");

  // Per-project state (keyed by project id) so switching projects keeps context.
  const [htmlById, setHtmlById] = useState<Record<string, string>>({});
  const [logById, setLogById] = useState<Record<string, LogEntry[]>>({});
  const [versionsById, setVersionsById] = useState<Record<string, Version[]>>({});
  const [pubById, setPubById] = useState<Record<string, string>>({}); // projectId → public url

  const [agentsById, setAgentsById] = useState<Record<string, AppAgents>>({});
  const [prompt, setPrompt] = useState("");
  const [building, setBuilding] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const loaded = useRef<Set<string>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ projects: Project[] }>("/api/studio/projects");
      const list = Array.isArray(res?.projects) ? res.projects : [];
      setProjects(list);
      setActiveId((prev) => prev || list[0]?.id || "");
    } catch (e) { toast.error(humanizeAiError(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const refreshVersions = useCallback(async (id: string) => {
    try {
      const v = await api.get<{ versions: Version[] }>(`/api/studio/projects/${id}/versions`);
      setVersionsById((m) => ({ ...m, [id]: Array.isArray(v?.versions) ? v.versions : [] }));
    } catch { /* non-fatal */ }
  }, []);

  // Hydrate a project's html + versions + publish state when first opened.
  useEffect(() => {
    if (!activeId || loaded.current.has(activeId)) return;
    loaded.current.add(activeId);
    (async () => {
      try {
        const p = await api.get<Project & { current_version?: Version }>(`/api/studio/projects/${activeId}`);
        const html = p.current_version?.file_tree?.["index.html"] || "";
        setHtmlById((m) => ({ ...m, [activeId]: html }));
      } catch { /* ignore */ }
      refreshVersions(activeId);
      api.get<{ url?: string; token?: string }[]>(`/api/studio/projects/${activeId}/deployments`)
        .then((d) => { const live = Array.isArray(d) ? d.find((x) => x.url) : null; if (live?.url) setPubById((m) => ({ ...m, [activeId]: (API_BASE || window.location.origin) + live.url })); })
        .catch(() => {});
      api.get<AppAgents>(`/api/studio/projects/${activeId}/agents`).then((a) => setAgentsById((m) => ({ ...m, [activeId]: a }))).catch(() => {});
    })();
  }, [activeId, refreshVersions]);

  const toggleAgent = async (agentId: string, grant: boolean) => {
    try {
      const res = grant
        ? await api.post<AppAgents>(`/api/studio/projects/${activeId}/agents`, { agentId })
        : await api.delete<AppAgents>(`/api/studio/projects/${activeId}/agents/${agentId}`);
      setAgentsById((m) => ({ ...m, [activeId]: res }));
    } catch (e) { toast.error(humanizeAiError(e)); }
  };

  const deleteProject = async (id: string) => {
    try {
      await api.delete(`/api/studio/projects/${id}`);
      loaded.current.delete(id);
      if (activeId === id) setActiveId("");
      await load();
      toast.success("Project deleted");
    } catch (e) { toast.error(humanizeAiError(e)); }
  };

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [logById, activeId, building]);

  const createProject = async () => {
    setCreating(true);
    try {
      const created = await api.post<Project>("/api/studio/projects", { name: "Untitled app" });
      await load();
      if (created?.id) setActiveId(created.id);
      toast.success("Project created - describe the app you want to build.");
    } catch (e) { toast.error(humanizeAiError(e)); }
    finally { setCreating(false); }
  };

  const appendLog = (id: string, entry: LogEntry) => setLogById((m) => ({ ...m, [id]: [...(m[id] ?? []), entry] }));

  // Core build/plan call for a specific project (used by the composer + templates).
  const runBuild = async (projectId: string, text: string, mode: "plan" | "build") => {
    if (!text || building) return;
    appendLog(projectId, { role: "user", text });
    setBuilding(true);
    try {
      const res = await api.post<GenResult>(`/api/studio/projects/${projectId}/generate`, { prompt: text, mode });
      if (mode === "plan") {
        appendLog(projectId, { role: "system", text: res?.plan || "(no plan)", plan: true, buildPrompt: text });
      } else {
        setHtmlById((m) => ({ ...m, [projectId]: res?.html || "" }));
        setPreviewNonce((n) => n + 1);
        appendLog(projectId, { role: "system", text: `Built · ${res?.summary || "updated the app"}` });
        refreshVersions(projectId);
      }
    } catch (e) {
      appendLog(projectId, { role: "system", text: humanizeAiError(e), error: true });
    } finally { setBuilding(false); }
  };

  const generate = async (mode: "plan" | "build") => {
    const text = prompt.trim();
    if (!text || !activeId || building) return;
    setPrompt("");
    await runBuild(activeId, text, mode);
  };

  // One-click starter: create a project, open it, and build from the template prompt.
  const startFromTemplate = async (tpl: { name: string; prompt: string }) => {
    if (building) return;
    try {
      const created = await api.post<Project>("/api/studio/projects", { name: tpl.name });
      loaded.current.add(created.id);
      await load();
      setActiveId(created.id);
      await runBuild(created.id, tpl.prompt, "build");
    } catch (e) { toast.error(humanizeAiError(e)); }
  };

  const restore = async (versionId: string) => {
    try {
      const v = await api.post<Version>(`/api/studio/projects/${activeId}/restore/${versionId}`, {});
      setHtmlById((m) => ({ ...m, [activeId]: v?.file_tree?.["index.html"] || "" }));
      setPreviewNonce((n) => n + 1);
      appendLog(activeId, { role: "system", text: "Restored an earlier version" });
      refreshVersions(activeId);
      setShowVersions(false);
      toast.success("Restored");
    } catch (e) { toast.error(humanizeAiError(e)); }
  };

  const publish = async () => {
    if (!activeId) return;
    setPublishing(true);
    try {
      const r = await api.post<{ token: string; path: string }>(`/api/studio/projects/${activeId}/publish`, {});
      const url = (API_BASE || window.location.origin) + r.path;
      setPubById((m) => ({ ...m, [activeId]: url }));
      try { await navigator.clipboard?.writeText(url); toast.success("Published - link copied to clipboard"); }
      catch { toast.success("Published"); }
    } catch (e) { toast.error(humanizeAiError(e)); }
    finally { setPublishing(false); }
  };

  const openPreview = () => {
    const html = htmlById[activeId];
    const pub = pubById[activeId];
    if (pub) { window.open(pub, "_blank", "noopener"); return; }
    if (html) { const blob = new Blob([html], { type: "text/html" }); window.open(URL.createObjectURL(blob), "_blank", "noopener"); }
  };

  const active = projects.find((p) => p.id === activeId);
  const filtered = projects.filter((p) => (p.name ?? "").toLowerCase().includes(q.trim().toLowerCase()));
  const html = htmlById[activeId] || "";
  const log = logById[activeId] ?? [];
  const versions = versionsById[activeId] ?? [];
  const pub = pubById[activeId];
  const appAgents = agentsById[activeId] ?? { granted: [], available: [] };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2 mr-auto">
          <Blocks className="text-[var(--color-primary)]" size={24} /> {tr("appb.title")}
        </h1>
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]"><Cpu size={12} /> {tr("appb.yourEngine")}</span>
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]"><ShieldCheck size={12} /> {tr("appb.sandboxed")}</span>
      </div>

      <div className="flex h-[calc(100vh-13rem)] min-h-[30rem] rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-bg)]">
        {/* ── Projects rail ──────────────────────────────────────────── */}
        <aside className="w-52 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
          <div className="p-3 border-b border-[var(--color-border)]">
            <button onClick={createProject} disabled={creating}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold py-2 hover:opacity-90 disabled:opacity-50">
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} {tr("appb.newProject")}
            </button>
            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2">
              <Search size={13} className="text-[var(--color-muted)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("appb.searchPlaceholder")} className="flex-1 bg-transparent py-1.5 text-xs outline-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]/60">{tr("appb.projects")}</p>
            {loading ? (
              <p className="px-2 py-2 text-xs text-[var(--color-muted)]">{tr("appb.loading")}</p>
            ) : filtered.length === 0 ? (
              <p className="px-2 py-2 text-xs text-[var(--color-muted)]">{tr("appb.noProjects")}</p>
            ) : filtered.map((p) => (
              <div key={p.id} onClick={() => setActiveId(p.id)} role="button" tabIndex={0}
                className={`group w-full text-left flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors cursor-pointer ${p.id === activeId ? "bg-[var(--color-primary)]/15 text-[var(--color-text)]" : "text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]"}`}>
                <FileCode2 size={14} className="shrink-0 text-[var(--color-primary)]" />
                <span className="truncate flex-1">{p.name || "Untitled app"}</span>
                <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${p.name || "this app"}"? This can't be undone.`)) deleteProject(p.id); }}
                  title="Delete project" className="opacity-0 group-hover:opacity-100 text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Center: build chat + composer ──────────────────────────── */}
        <main className="flex-1 min-w-0 flex flex-col border-r border-[var(--color-border)]">
          {!active ? (
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="text-center mb-5">
                <Blocks size={30} className="text-[var(--color-primary)] mb-2 mx-auto" />
                <p className="text-sm font-semibold">{tr("appb.startHeading")}</p>
                <p className="text-xs text-[var(--color-muted)] mt-1 max-w-md mx-auto">{tr("appb.startSubtitle")}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto">
                {APP_TEMPLATES.map((t) => (
                  <button key={t.name} onClick={() => startFromTemplate(t)} disabled={building}
                    className="text-left rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 hover:border-[var(--color-primary)]/50 transition-colors disabled:opacity-50">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0"><Sparkles size={14} className="text-[var(--color-primary)]" /></div>
                      <span className="text-sm font-semibold">{t.name}</span>
                      <span className="ml-auto text-[10px] text-[var(--color-muted)] border border-[var(--color-border)] rounded-full px-1.5 py-0.5">{t.tag}</span>
                    </div>
                    <p className="text-[11px] text-[var(--color-muted)] leading-relaxed line-clamp-2">{t.prompt}</p>
                  </button>
                ))}
              </div>
              {building && <p className="text-center text-xs text-[var(--color-muted)] mt-4 flex items-center justify-center gap-2"><Loader2 size={13} className="animate-spin" /> {tr("appb.buildingApp")}</p>}
            </div>
          ) : (
            <>
              <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)]">
                <FileCode2 size={16} className="text-[var(--color-primary)] shrink-0" />
                <span className="font-semibold truncate">{active.name || "Untitled app"}</span>
                {/* Agents this app may embed (the wedge) */}
                <div className="ml-auto relative">
                  <button onClick={() => setShowAgents((v) => !v)}
                    className="flex items-center gap-1 text-xs rounded-lg border border-[var(--color-border)] px-2 py-1 text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Embed your agents in this app">
                    <Bot size={12} /> {tr("appb.agents")}{appAgents.granted.length ? ` ${appAgents.granted.length}` : ""}
                  </button>
                  {showAgents && (
                    <div className="absolute right-0 top-8 z-20 w-72 max-h-72 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl p-2">
                      <p className="text-[11px] text-[var(--color-muted)] px-1 pb-1.5">Let this app call your agents via <span className="font-mono">window.HEADROOM.askAgent()</span>. Then ask the builder to "add a chatbot powered by &lt;agent&gt;".</p>
                      {appAgents.available.length === 0 ? (
                        <p className="text-xs text-[var(--color-muted)] px-1 py-2">{tr("appb.noAgents")}</p>
                      ) : appAgents.available.map((a) => {
                        const on = appAgents.granted.some((g) => g.id === a.id);
                        return (
                          <button key={a.id} onClick={() => toggleAgent(a.id, !on)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${on ? "bg-[var(--color-primary)]/10 text-[var(--color-text)]" : "text-[var(--color-muted)] hover:bg-white/5"}`}>
                            <Bot size={13} className="text-[var(--color-primary)] shrink-0" />
                            <span className="flex-1 truncate text-left">{a.name}</span>
                            {on && <Check size={13} className="text-[var(--color-primary)]" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button onClick={() => setShowVersions((v) => !v)} disabled={versions.length === 0}
                    className="flex items-center gap-1 text-xs rounded-lg border border-[var(--color-border)] px-2 py-1 text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-40">
                    <History size={12} /> {versions.length} version{versions.length === 1 ? "" : "s"}
                  </button>
                  {showVersions && (
                    <div className="absolute right-0 top-8 z-20 w-72 max-h-72 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl p-1">
                      {versions.map((v) => (
                        <div key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 text-xs">
                          <span className="flex-1 truncate text-[var(--color-muted)]">{v.summary || v.prompt || "version"}</span>
                          <button onClick={() => restore(v.id)} title="Restore this version" className="text-[var(--color-primary)] hover:opacity-80"><RotateCcw size={13} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Build log */}
              <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {log.length === 0 ? (
                  <div className="text-center text-[var(--color-muted)] py-8 text-sm">
                    {tr("appb.logEmpty")}{" "}
                    <button onClick={() => setPrompt("Build a VC dashboard with my cash, runway, monthly burn and overdue receivables, with charts.")} className="text-[var(--color-primary)] hover:underline">“a VC dashboard with my cash, runway & overdue receivables”</button>.
                  </div>
                ) : log.map((e, i) => e.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-3.5 py-2 text-sm whitespace-pre-wrap">{e.text}</div>
                  </div>
                ) : (
                  <div key={i} className={`max-w-[90%] rounded-2xl rounded-bl-sm border px-3.5 py-2 text-sm whitespace-pre-wrap ${e.error ? "border-red-700/40 text-red-300 bg-red-900/10" : e.plan ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
                    {e.plan && <div className="flex items-center gap-1 text-[11px] text-[var(--color-primary)] mb-1 font-semibold"><Lightbulb size={12} /> {tr("appb.plan")}</div>}
                    {e.text}
                    {e.plan && e.buildPrompt && (
                      <button onClick={() => runBuild(activeId, e.buildPrompt!, "build")} disabled={building}
                        className="mt-2 flex items-center gap-1.5 text-xs rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 hover:opacity-90 disabled:opacity-50">
                        <Check size={13} /> {tr("appb.approveBuild")}
                      </button>
                    )}
                  </div>
                ))}
                {building && <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><Loader2 size={13} className="animate-spin" /> {tr("appb.buildingApp")}</div>}
              </div>

              {/* Composer */}
              <div className="shrink-0 border-t border-[var(--color-border)] p-3">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={1} disabled={building}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void generate("build"); } }}
                    placeholder={html ? tr("appb.composerChange") : tr("appb.composerNew")}
                    className="w-full bg-transparent px-2 py-1.5 text-sm outline-none resize-none disabled:opacity-60" />
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <button onClick={() => void generate("plan")} disabled={building || !prompt.trim()}
                      className="flex items-center gap-1.5 text-xs rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)] disabled:opacity-40">
                      <Lightbulb size={12} /> {tr("appb.planFirst")}
                    </button>
                    <button onClick={() => void generate("build")} disabled={building || !prompt.trim()}
                      className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-3.5 py-1.5 hover:opacity-90 disabled:opacity-50">
                      {building ? <Loader2 size={14} className="animate-spin" /> : html ? <Send size={14} /> : <Sparkles size={14} />} {html ? tr("appb.update") : tr("appb.build")}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>

        {/* ── Right: live preview ────────────────────────────────────── */}
        <section className="w-[44%] max-w-[40rem] shrink-0 hidden lg:flex flex-col bg-[var(--color-surface)]">
          <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)]">
            <Monitor size={15} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">{tr("appb.livePreview")}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => setPreviewNonce((n) => n + 1)} disabled={!html} title="Refresh preview" className="p-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-40"><RefreshCw size={13} /></button>
              <button onClick={openPreview} disabled={!html} title="Open in new tab" className="p-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-40"><ExternalLink size={13} /></button>
              <button onClick={publish} disabled={!html || publishing} title="Publish to a shareable link"
                className="flex items-center gap-1.5 text-xs rounded-md bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-2.5 py-1.5 hover:opacity-90 disabled:opacity-40">
                {publishing ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />} {tr("appb.publish")}
              </button>
            </div>
          </div>
          {pub && (
            <div className="shrink-0 px-3 py-1.5 border-b border-[var(--color-border)] text-[11px] flex items-center gap-2">
              <span className="text-[var(--color-muted)]">{tr("appb.liveLabel")}</span>
              <a href={pub} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] truncate hover:underline">{pub}</a>
              <button onClick={() => { navigator.clipboard?.writeText(pub); toast.success("Link copied"); }} className="ml-auto text-[var(--color-muted)] hover:text-[var(--color-text)]">{tr("appb.copy")}</button>
            </div>
          )}
          <div className="flex-1 bg-white">
            {html ? (
              <iframe key={previewNonce} title="App preview" srcDoc={html} sandbox="allow-scripts allow-popups allow-forms allow-modals allow-downloads" className="w-full h-full border-0" />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 text-[var(--color-muted)] bg-[var(--color-surface)]">
                <Monitor size={28} className="mb-3 opacity-60" />
                <p className="text-xs max-w-xs">{tr("appb.previewEmpty")}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
