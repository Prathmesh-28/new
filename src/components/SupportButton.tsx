import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Bug, Lightbulb, LifeBuoy, MessageCircleQuestion, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { lastErrorRef } from "@/lib/reportError";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { TextField, TextAreaField } from "@/components/ui/Field";

/**
 * Reach a human without leaving the page you're stuck on.
 *
 * The audit found no in-app help, no support contact and no feedback path anywhere — so a
 * user who hit a problem had to find an email address on the marketing site and describe
 * from memory what they had been doing. This attaches the page they were on and, if
 * something crashed, the error reference the server logged, so the first reply doesn't
 * have to be "what were you doing?".
 */
type Kind = "question" | "bug" | "idea";

const KINDS: { id: Kind; label: string; icon: typeof Bug; hint: string }[] = [
  { id: "question", label: "I need help", icon: MessageCircleQuestion, hint: "Something isn't clear or you're not sure how to do it." },
  { id: "bug", label: "Something's broken", icon: Bug, hint: "It did the wrong thing, or nothing at all." },
  { id: "idea", label: "I have an idea", icon: Lightbulb, hint: "Something that would make this easier for you." },
];

export default function SupportButton() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("question");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const errorRef = lastErrorRef();

  const submit = async () => {
    if (!subject.trim() || !body.trim()) { toast.error("A subject and a description, and it's on its way."); return; }
    setBusy(true);
    try {
      const r = await api.post<{ id: string; emailed: boolean }>("/api/support/tickets", {
        kind, subject, body,
        pageUrl: location.pathname + location.search,
        errorRef: errorRef ?? undefined,
      });
      // Don't claim a human was paged if no support address is configured.
      toast.success(r.emailed ? "Sent — we'll reply by email" : "Recorded", {
        description: r.emailed ? undefined : "Support email isn't configured on this deployment, so this is saved but not yet delivered.",
      });
      setOpen(false); setSubject(""); setBody("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send that"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        title="Get help or send feedback"
        aria-label="Get help or send feedback"
        data-no-print
        className="fixed bottom-20 right-4 md:bottom-5 md:right-5 z-40 w-11 h-11 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 transition-colors"
      >
        <LifeBuoy size={18} />
      </button>

      <Modal
        open={open} onClose={() => setOpen(false)} size="md"
        title="Get help or send feedback"
        description="Goes straight to the people who build this. We'll reply to your account email."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} icon={<Send size={13} />} onClick={submit}>Send</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button key={k.id} type="button" onClick={() => setKind(k.id)}
                className={`text-left p-3 rounded-lg border transition-colors ${kind === k.id
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                  : "border-[var(--color-border)] hover:bg-[var(--color-accent)]"}`}>
                <k.icon size={15} className={kind === k.id ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"} />
                <p className="text-xs font-semibold mt-1.5">{k.label}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5 leading-snug">{k.hint}</p>
              </button>
            ))}
          </div>

          <TextField label="One-line summary" required value={subject} onChange={(e) => setSubject(e.target.value)}
            placeholder={kind === "bug" ? "Marking an invoice paid does nothing" : kind === "idea" ? "Let me email a statement to a customer" : "How do I record a part payment?"} />
          <TextAreaField label="What happened?" required value={body} onChange={(e) => setBody(e.target.value)} rows={5}
            help="What you were trying to do, what you expected, and what happened instead." />

          <div className="text-[11px] text-[var(--color-muted)] space-y-0.5">
            <p>We'll include the page you're on: <span className="font-mono">{location.pathname}</span></p>
            {errorRef && <p>And the error reference from what just went wrong: <span className="font-mono text-amber-400">{errorRef}</span></p>}
          </div>
        </div>
      </Modal>
    </>
  );
}
