import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";

/**
 * Drop-in "✨ Draft with AI" button for any text field — generates a short message
 * (reminder, email, note, description) into the field via onInsert. Reusable so AI
 * drafting shows up everywhere text is entered. Degrades gracefully when AI is off.
 */
interface Props {
  prompt: string;                  // what to write, e.g. "a polite payment reminder"
  context?: unknown;               // optional grounding data (customer, amount, days overdue…)
  onInsert: (text: string) => void;
  label?: string;
  system?: string;
  size?: "sm" | "md";
  className?: string;
}

const DEFAULT_SYSTEM =
  "You draft short, professional, friendly messages for an Indian SMB. Output ONLY the message text — no preamble, no quotes. Keep it concise. Use ₹ where money is mentioned.";

export default function AiDraft({ prompt, context, onInsert, label = "Draft with AI", system, size = "sm", className }: Props) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const ctx = context ? `\n\nContext:\n${typeof context === "string" ? context : JSON.stringify(context)}` : "";
      const res = await api.post<{ content?: string; error?: string }>("/api/ai/ask", {
        system: system || DEFAULT_SYSTEM,
        messages: [{ role: "user", content: `Write ${prompt}.${ctx}` }],
      });
      if (res?.content?.trim()) { onInsert(res.content.trim()); toast.success("Draft inserted — edit before sending"); }
      else toast.error("Couldn't generate a draft");
    } catch {
      toast.error("AI isn't enabled in this workspace yet");
    } finally { setBusy(false); }
  };
  const pad = size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs";
  return (
    <button type="button" onClick={run} disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-primary)]/40 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-50 ${pad} ${className ?? ""}`}>
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {busy ? "Drafting…" : label}
    </button>
  );
}
