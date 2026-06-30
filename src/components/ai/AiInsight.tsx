import { useState } from "react";
import { api } from "@/lib/api";
import { humanizeAiError } from "./aiError";
import { Sparkles, RefreshCw, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import Markdown from "./Markdown";

/**
 * Drop-in "✨ AI insight" panel - give it a question + the on-screen data and it
 * narrates/analyses it via /api/ai/ask. Reusable across any page (dashboard, reports,
 * analytics, …) so AI shows up everywhere without bespoke wiring. Grounded: the model
 * is told to use ONLY the data passed in (no invented numbers). Degrades gracefully
 * when AI isn't configured. Auto-generates the first time it's expanded.
 */
interface Props {
  question: string;            // what to ask about the data
  context: unknown;            // the on-screen data (object or string) - the ONLY source of truth
  title?: string;
  system?: string;             // override the default CFO-assistant persona
  collapsed?: boolean;         // start collapsed (default true on dense pages)
  className?: string;
}

const DEFAULT_SYSTEM =
  "You are the CFO assistant for an Indian SMB. Answer in 3-5 crisp sentences or tight bullets - specific and actionable. Use ₹ with Indian grouping. Use ONLY the numbers in the data provided; never invent figures. If the data is empty, say so plainly.";

const NO_ENGINE_CTA =
  "Connect your AI engine in Agent Studio to turn this into a live insight.";

// Shared, one-time capability check across ALL AiInsight panels: a single GET
// to /llm-config tells us whether an engine is configured. Memoized in module
// scope so 26 panels expanding don't fire 26 requests - they await one promise.
interface LlmStatus { hasKey: boolean }
let llmStatus: Promise<LlmStatus> | null = null;
function checkLlm(): Promise<LlmStatus> {
  return (llmStatus ??= api
    .get<LlmStatus>("/api/books/agents/llm-config")
    .then((r) => ({ hasKey: !!r?.hasKey }))
    .catch(() => ({ hasKey: false })));
}

export default function AiInsight({ question, context, title = "AI insight", system, collapsed = true, className }: Props) {
  const [open, setOpen] = useState(!collapsed);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      // Fast, shared capability check first - skip /ask entirely when no engine
      // is configured so panels show a friendly CTA instead of erroring.
      const { hasKey } = await checkLlm();
      if (!hasKey) {
        setText(NO_ENGINE_CTA);
        return;
      }
      const ctx = typeof context === "string" ? context : JSON.stringify(context ?? {});
      const res = await api.post<{ content?: string; error?: string }>("/api/ai/ask", {
        system: system || DEFAULT_SYSTEM,
        messages: [{ role: "user", content: `${question}\n\nData:\n${ctx.slice(0, 6000)}` }],
      });
      setText(res?.content?.trim() || "No insight available for this data.");
    } catch (e) {
      setText(humanizeAiError(e));
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !busy) run();
  };

  return (
    <div className={`rounded-xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent ${className ?? ""}`}>
      <button onClick={toggle} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} className="text-[var(--color-primary)]" /> {title}</span>
        <span className="flex items-center gap-1.5">
          {loaded && <RefreshCw size={13} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" onClick={(e) => { e.stopPropagation(); run(); }} />}
          {open ? <ChevronDown size={16} className="text-[var(--color-muted)]" /> : <ChevronRight size={16} className="text-[var(--color-muted)]" />}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          {busy ? (
            <p className="flex items-center gap-2 text-xs text-[var(--color-muted)]"><Loader2 size={13} className="animate-spin" /> Analysing your numbers…</p>
          ) : text ? (
            <Markdown text={text} className="text-xs leading-relaxed text-[var(--color-text)]" />
          ) : (
            <p className="text-xs text-[var(--color-muted)]">Expand to generate.</p>
          )}
        </div>
      )}
    </div>
  );
}
