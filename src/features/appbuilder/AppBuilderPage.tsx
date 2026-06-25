import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { humanizeAiError } from "@/components/ai/aiError";
import { Blocks, Plus, Search, Loader2, Sparkles, FileCode2, Monitor, ShieldCheck, Cpu } from "lucide-react";

/**
 * App Builder — the Lovable/Emergent half of Headroom Studio. Describe an app →
 * a codegen agent generates a React project → live preview → iterate by chat →
 * publish. Phase 0 is the FOUNDATION only: project list + create (backed by
 * /api/studio), and the three-pane shell (projects · prompt+file-tree · preview)
 * with the codegen/preview panes as labelled placeholders for Phase 1/2.
 */
interface Project { id: string; name: string; slug: string; current_version_id?: string | null; created_at?: string; updated_at?: string }

export default function AppBuilderPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");

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

  const createProject = async () => {
    setCreating(true);
    try {
      const created = await api.post<Project>("/api/studio/projects", { name: "Untitled app" });
      await load();
      if (created?.id) setActiveId(created.id);
      toast.success("Project created — describe your app to build it (Phase 1).");
    } catch (e) { toast.error(humanizeAiError(e)); }
    finally { setCreating(false); }
  };

  const active = projects.find((p) => p.id === activeId);
  const filtered = projects.filter((p) => (p.name ?? "").toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2 mr-auto">
          <Blocks className="text-[var(--color-primary)]" size={24} /> App Builder
        </h1>
        <span className="text-[11px] px-2 py-1 rounded-full border border-[var(--color-primary)]/40 text-[var(--color-primary)] font-medium">Phase 0 · foundation</span>
      </div>

      <p className="text-sm text-[var(--color-muted)] max-w-3xl">
        Describe an app in plain English and Headroom builds it — a real React app with a live preview you can
        publish and share. Runs on <strong className="text-[var(--color-text)]">your own engine</strong>, and can
        embed your <strong className="text-[var(--color-text)]">Agent Studio</strong> agents. The builder pane goes
        live in the next phase; create a project to get set up.
      </p>

      <div className="flex h-[calc(100vh-15rem)] min-h-[28rem] rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-bg)]">
        {/* ── Projects rail ──────────────────────────────────────────── */}
        <aside className="w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
          <div className="p-3 border-b border-[var(--color-border)]">
            <button onClick={createProject} disabled={creating}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold py-2 hover:opacity-90 disabled:opacity-50">
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} New project
            </button>
            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2">
              <Search size={13} className="text-[var(--color-muted)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="flex-1 bg-transparent py-1.5 text-xs outline-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]/60">Projects</p>
            {loading ? (
              <p className="px-2 py-2 text-xs text-[var(--color-muted)]">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="px-2 py-2 text-xs text-[var(--color-muted)]">No projects yet — create one to start.</p>
            ) : filtered.map((p) => (
              <button key={p.id} onClick={() => setActiveId(p.id)}
                className={`w-full text-left flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${p.id === activeId ? "bg-[var(--color-primary)]/15 text-[var(--color-text)]" : "text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]"}`}>
                <FileCode2 size={14} className="shrink-0 text-[var(--color-primary)]" />
                <span className="truncate">{p.name || "Untitled app"}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Center: prompt + file tree (placeholder) ───────────────── */}
        <main className="flex-1 min-w-0 flex flex-col border-r border-[var(--color-border)]">
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <Blocks size={32} className="text-[var(--color-primary)] mb-3" />
              <p className="text-sm font-semibold">Create a project to start building</p>
              <p className="text-xs text-[var(--color-muted)] mt-1 max-w-sm">Each project is an app with its own files, versions, and (soon) a published URL.</p>
            </div>
          ) : (
            <>
              <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)]">
                <FileCode2 size={16} className="text-[var(--color-primary)] shrink-0" />
                <span className="font-semibold truncate">{active.name || "Untitled app"}</span>
                <span className="text-[11px] font-mono text-[var(--color-muted)] truncate">· {active.slug}.headroom.app</span>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-xs text-[var(--color-muted)] flex flex-col items-center gap-2">
                  <FileCode2 size={20} className="text-[var(--color-muted)]" />
                  Generated files will appear here once the codegen agent runs (Phase 1).
                </div>
              </div>
              {/* Composer (disabled until Phase 1) */}
              <div className="shrink-0 border-t border-[var(--color-border)] p-3">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 opacity-70">
                  <textarea rows={1} disabled placeholder="Describe your app — e.g. “a VC dashboard with my cash, runway and overdue receivables” (Phase 1)"
                    className="w-full bg-transparent px-2 py-1.5 text-sm outline-none resize-none cursor-not-allowed" />
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]"><Cpu size={12} /> Your engine</span>
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]"><ShieldCheck size={12} /> Sandboxed preview</span>
                    <button disabled className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-3.5 py-1.5 opacity-50 cursor-not-allowed">
                      <Sparkles size={14} /> Build
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>

        {/* ── Right: live preview (placeholder) ──────────────────────── */}
        <section className="w-[40%] max-w-[34rem] shrink-0 hidden lg:flex flex-col bg-[var(--color-surface)]">
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)]">
            <Monitor size={15} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Live preview</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-[var(--color-muted)]">
            <Monitor size={28} className="mb-3 opacity-60" />
            <p className="text-xs max-w-xs">Your app's live preview appears here once it's built (Phase 2). Publish to share it at a <span className="font-mono text-[var(--color-text)]">.headroom.app</span> link.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
