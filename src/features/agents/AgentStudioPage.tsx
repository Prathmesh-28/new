import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Wand2, Sparkles, Loader2, Bot, ShieldCheck, Cpu, MessageSquare, Settings2 } from "lucide-react";
import BooksAgentsTab from "@/features/books/BooksAgentsTab";
import AgentWorkspace from "@/features/agents/AgentWorkspace";
import { humanizeAiError } from "@/components/ai/aiError";

interface ToolDef { name: string; description?: string; scope?: "read" | "write" }

/**
 * Agent Studio — a platform-wide, no-code AI-agent builder (Kogo-style). NOT limited
 * to Books: agents can reach the whole business (cash, transactions, receivables,
 * GST, books, inventory, alerts, forecast) via the cross-domain tool catalogue, and
 * everything runs on the tenant's OWN engine (their OpenRouter key). The page adds a
 * "describe it in plain English → we build it" flow on top of the full agent manager
 * (engine config, template store, editor, knowledge, playground) reused as-is.
 */
export default function AgentStudioPage() {
  // Bumping this remounts the manager so a freshly-built agent shows up immediately.
  const [reloadKey, setReloadKey] = useState(0);
  // The just-built agent — its row auto-opens its Run panel so it's ready to test.
  const [autoRunId, setAutoRunId] = useState<string | undefined>(undefined);
  // Workspace (Kogo-style chat) is the default surface; Build = engine/templates/editor.
  const [view, setView] = useState<"workspace" | "build">("workspace");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2 mr-auto">
          <Bot className="text-[var(--color-primary)]" size={24} /> Agent Studio
        </h1>
        <div className="flex rounded-lg border border-[var(--color-border)] p-0.5 text-sm">
          <button onClick={() => setView("workspace")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${view === "workspace" ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <MessageSquare size={14} /> Workspace
          </button>
          <button onClick={() => setView("build")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${view === "build" ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Settings2 size={14} /> Build &amp; manage
          </button>
        </div>
      </div>

      {view === "workspace" ? (
        <AgentWorkspace />
      ) : (
      <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="text-[var(--color-primary)]" size={26} /> Agent Studio
        </h1>
        <p className="text-sm text-[var(--color-muted)] mt-1.5 max-w-3xl">
          Build your own AI agents for <strong>anything</strong> in your business — collections, cash, GST, vendors,
          payroll, spend, ops. Describe what you want in plain English and your agent gets built. Runs on{" "}
          <strong className="text-[var(--color-text)]">your own engine</strong> (your OpenRouter key). Read tasks run
          instantly; anything that changes your data waits for your approval.
        </p>
        <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]"><Cpu size={12} /> Your engine, your key</span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]"><ShieldCheck size={12} /> Writes need approval</span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]"><Sparkles size={12} /> Reads the whole business</span>
        </div>
      </header>

      <NaturalLanguageBuilder onCreated={(id) => { setAutoRunId(id); setReloadKey((k) => k + 1); }} />

      <BooksAgentsTab key={reloadKey} autoRunAgentId={autoRunId} />
      </div>
      )}
    </div>
  );
}

const EXAMPLES = [
  "Every Monday, review overdue invoices and draft polite reminders for the customers who owe the most.",
  "Watch my cash runway and warn me — with the reason — when it drops below 60 days.",
  "Summarise this week's spending and flag anything unusual or duplicated.",
  "Prepare my GSTR-3B figures and tell me exactly what to file.",
];

function NaturalLanguageBuilder({ onCreated }: { onCreated: (createdId?: string) => void }) {
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  async function build() {
    if (!desc.trim()) return;
    setBusy(true);
    try {
      // Pull the live tool catalogue so the model can ONLY pick real tools.
      const catalog = await api.get<ToolDef[]>("/api/books/agents/tools");
      const toolList = catalog.map((t) => `- ${t.name} (${t.scope || "read"}): ${t.description || ""}`).join("\n");
      const system =
        "You design AI agents for an Indian SMB business app. Given the user's description and the available tools, " +
        "return ONLY a compact JSON object (no markdown, no prose): " +
        '{"name": a short title (<=4 words), "instructions": a clear, specific system prompt telling the agent its ' +
        'role, which tools to use and how to respond, "tools": an array of tool names to enable}. ' +
        "Choose tools ONLY from the provided catalogue. Prefer read tools; include a write tool ONLY if the task " +
        "clearly needs to create records. Never invent tool names.";
      const res = await api.post<{ content?: string }>("/api/ai/ask", {
        system,
        messages: [{ role: "user", content: `Available tools:\n${toolList}\n\nAgent to build:\n${desc.trim()}` }],
      });
      const raw = res?.content || "{}";
      const json = raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}";
      const spec = JSON.parse(json) as { name?: string; instructions?: string; tools?: string[] };
      const valid = new Set(catalog.map((t) => t.name));
      const tools = Array.isArray(spec.tools) ? spec.tools.filter((t) => valid.has(t)) : [];
      const name = (spec.name || "New agent").slice(0, 60);
      const created = await api.post<{ id?: string }>("/api/books/agents", { name, instructions: spec.instructions || desc.trim(), tools });
      toast.success(`Built "${name}" with ${tools.length} tool${tools.length === 1 ? "" : "s"} — opening it below to test live.`);
      setDesc("");
      onCreated(created?.id);
    } catch (e) {
      toast.error(humanizeAiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent p-5">
      <div className="flex items-center gap-2 mb-2.5">
        <Sparkles size={18} className="text-[var(--color-primary)]" />
        <h2 className="text-base font-semibold">Describe what you want — we'll build the agent</h2>
      </div>
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        rows={3}
        disabled={busy}
        placeholder="e.g. Every Monday, check overdue invoices and draft polite reminders for the customers who owe the most."
        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] resize-y disabled:opacity-60"
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") build(); }}
      />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setDesc(ex)}
            disabled={busy}
            className="text-[11px] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors disabled:opacity-40"
          >
            {ex.length > 46 ? ex.slice(0, 46) + "…" : ex}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-[var(--color-muted)] max-w-md">
          Your agent can read across cash, transactions, receivables, GST, books, inventory &amp; more — and only acts with your approval.
        </p>
        <button
          type="button"
          onClick={build}
          disabled={busy || !desc.trim()}
          className="inline-flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} {busy ? "Building…" : "Build my agent"}
        </button>
      </div>
    </div>
  );
}
