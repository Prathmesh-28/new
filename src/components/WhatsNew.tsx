import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { usePref } from "@/hooks/usePrefs";
import Modal from "@/components/ui/Modal";

/**
 * What's new — a changelog the product simply did not have (zero implementations in the
 * audit). Without one, every improvement ships invisibly and users keep working around
 * things that were fixed weeks ago.
 *
 * The "seen" marker is a per-user preference, so it follows them across devices instead of
 * re-announcing the same release on every machine they sign in from.
 */
type Entry = { id: string; title: string; body: string; kind: "feature" | "improvement" | "fix"; published_at: string };

const KIND_STYLE: Record<Entry["kind"], string> = {
  feature: "bg-[var(--color-primary)]/15 text-[var(--color-primary)]",
  improvement: "bg-blue-500/15 text-blue-400",
  fix: "bg-amber-500/15 text-amber-400",
};

export default function WhatsNew() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = usePref<string>("changelog.lastSeen", "");

  const load = useCallback(() => {
    api.get<Entry[]>("/api/support/changelog?limit=20").then(setEntries).catch(() => setEntries([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const latest = entries[0]?.published_at ?? "";
  const unseen = !!latest && latest > lastSeen;

  const show = () => { setOpen(true); if (latest) setLastSeen(latest); };

  if (!entries.length) return null;

  return (
    <>
      <button type="button" onClick={show} data-no-print
        title="What's new in Headroom" aria-label="What's new"
        className="relative p-2 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)]">
        <Sparkles size={16} />
        {unseen && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />}
        {unseen && <span className="sr-only">There are unread release notes</span>}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="What's new" size="md"
        description="The most recent changes to Headroom.">
        <ol className="space-y-5">
          {entries.map((e) => (
            <li key={e.id}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide ${KIND_STYLE[e.kind]}`}>{e.kind}</span>
                <span className="text-[10px] text-[var(--color-muted)]">
                  {new Date(e.published_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
              <p className="text-sm font-semibold">{e.title}</p>
              <p className="text-sm text-[var(--color-muted)] mt-0.5 whitespace-pre-wrap leading-relaxed">{e.body}</p>
            </li>
          ))}
        </ol>
      </Modal>
    </>
  );
}
