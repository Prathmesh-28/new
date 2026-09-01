import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, Bell, BellOff, History, Loader2, MessageSquare, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import Button from "./Button";
import { useConfirm } from "./Confirm";

/**
 * The two things every record was missing: a conversation and a history.
 *
 * `audit_log` was written on every mutation and shown nowhere, so "who changed this and
 * why?" was unanswerable in the product — people asked on WhatsApp. This renders the
 * merged timeline (audit events + comments) and lets people talk on the record itself,
 * with @mentions that actually notify.
 */
type Comment = {
  id: string; body: string; created_at: string; edited_at: string | null;
  author_id: string; author_email: string; author_name: string | null; mentions: string[];
};
type Activity = {
  created_at: string; kind: "audit" | "comment"; title: string;
  meta: Record<string, unknown> | null; actor_email: string | null; actor_name: string | null; body: string | null;
};
type Person = { id: string; email: string; name: string | null; role: string };

const who = (name?: string | null, email?: string | null) => name || email?.split("@")[0] || "Someone";
const when = (iso: string) => {
  const d = new Date(iso), diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

// audit actions are stored as verbs ("created", "deleted"); make them read like English.
const PHRASE: Record<string, string> = {
  created: "created this", deleted: "deleted this", restored: "restored this",
  updated: "updated this", sent: "sent this", paid: "marked this paid",
};

export function CommentThread({ entity, entityId }: { entity: string; entityId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const confirm = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    api.get<Comment[]>(`/api/records/${entity}/${entityId}/comments`)
      .then(setComments).catch(() => setComments([])).finally(() => setLoading(false));
  }, [entity, entityId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get<Person[]>("/api/records/mentionable").then(setPeople).catch(() => setPeople([])); }, []);

  // Resolve "@name" tokens in the text back to user ids the server will accept.
  const mentionIds = useCallback((text: string) => {
    const ids: string[] = [];
    for (const p of people) {
      const handle = (p.name || p.email.split("@")[0]).toLowerCase().replace(/\s+/g, "");
      if (new RegExp(`@${handle}\\b`, "i").test(text.replace(/\s+/g, ""))) ids.push(p.id);
    }
    return ids;
  }, [people]);

  const post = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      if (editing) await api.patch(`/api/records/comments/${editing}`, { body: text });
      else await api.post(`/api/records/${entity}/${entityId}/comments`, { body: text, mentions: mentionIds(text) });
      setBody(""); setEditing(null); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't post that"); }
    finally { setBusy(false); }
  };

  const del = async (c: Comment) => {
    if (!await confirm({ title: "Delete this comment?", body: c.body.slice(0, 140), danger: true, confirmLabel: "Delete" })) return;
    try { await api.delete(`/api/records/comments/${c.id}`); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete it"); }
  };

  const insertMention = (p: Person) => {
    const handle = (p.name || p.email.split("@")[0]).replace(/\s+/g, "");
    setBody((b) => `${b.replace(/@\w*$/, "")}@${handle} `);
    setMentionOpen(false);
    boxRef.current?.focus();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare size={14} className="text-[var(--color-muted)]" />
        <h3 className="text-sm font-semibold">Comments</h3>
        <span className="text-xs text-[var(--color-muted)]">{comments.length || ""}</span>
      </div>

      {loading ? <p className="text-xs text-[var(--color-muted)] flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</p>
      : comments.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No comments yet. Leave a note for whoever picks this up next.</p>
      : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold">{who(c.author_name, c.author_email)}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-[var(--color-muted)]">{when(c.created_at)}{c.edited_at ? " · edited" : ""}</span>
                  <button type="button" onClick={() => { setEditing(c.id); setBody(c.body); boxRef.current?.focus(); }}
                    aria-label="Edit comment" className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><Pencil size={11} /></button>
                  <button type="button" onClick={() => del(c)} aria-label="Delete comment"
                    className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={11} /></button>
                </div>
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap break-words leading-relaxed">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <textarea
          ref={boxRef} value={body}
          onChange={(e) => { setBody(e.target.value); setMentionOpen(/@\w*$/.test(e.target.value)); }}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void post(); } }}
          placeholder={editing ? "Edit your comment…" : "Add a comment. Use @ to notify someone. ⌘+Enter to post."}
          rows={2}
          className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] resize-y"
        />
        {mentionOpen && people.length > 0 && (
          <div className="absolute bottom-full mb-1 left-0 z-20 w-56 max-h-44 overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl p-1">
            {people.slice(0, 8).map((p) => (
              <button key={p.id} type="button" onClick={() => insertMention(p)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-[var(--color-accent)]">
                <AtSign size={11} className="text-[var(--color-muted)]" />
                <span className="truncate">{p.name || p.email}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 mt-2">
          {editing && <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setBody(""); }}>Cancel</Button>}
          <Button size="sm" variant="primary" loading={busy} disabled={!body.trim()} onClick={post}>
            {editing ? "Save" : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ActivityTimeline({ entity, entityId }: { entity: string; entityId: string }) {
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<Activity[]>(`/api/records/${entity}/${entityId}/activity`)
      .then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, [entity, entityId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History size={14} className="text-[var(--color-muted)]" />
        <h3 className="text-sm font-semibold">History</h3>
      </div>
      {loading ? <p className="text-xs text-[var(--color-muted)] flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</p>
      : items.length === 0 ? <p className="text-xs text-[var(--color-muted)]">Nothing recorded yet.</p>
      : (
        <ol className="relative border-l border-[var(--color-border)] ml-1.5 space-y-3">
          {items.map((a, i) => (
            <li key={`${a.created_at}-${i}`} className="pl-4 relative">
              <span className={`absolute -left-[4.5px] top-1.5 w-2 h-2 rounded-full ${a.kind === "comment" ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`} />
              <p className="text-xs">
                <span className="font-semibold">{who(a.actor_name, a.actor_email)}</span>{" "}
                <span className="text-[var(--color-muted)]">{PHRASE[a.title] || a.title}</span>{" "}
                <span className="text-[10px] text-[var(--color-muted)]">· {when(a.created_at)}</span>
              </p>
              {a.body && <p className="text-xs text-[var(--color-muted)] mt-0.5 line-clamp-2">{a.body}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Watch a record: get told when someone comments on it. */
export function FollowButton({ entity, entityId }: { entity: string; entityId: string }) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ following: boolean }>(`/api/records/${entity}/${entityId}/followers`)
      .then((r) => setFollowing(r.following)).catch(() => setFollowing(false));
  }, [entity, entityId]);

  const toggle = async () => {
    setBusy(true);
    const next = !following;
    setFollowing(next); // optimistic — a follow toggle should feel instant
    try { await api.post(`/api/records/${entity}/${entityId}/follow`, { follow: next }); }
    catch { setFollowing(!next); toast.error("Couldn't change that"); }
    finally { setBusy(false); }
  };

  return (
    <Button size="sm" variant="secondary" loading={busy} onClick={toggle}
      icon={following ? <Bell size={13} className="text-[var(--color-primary)]" /> : <BellOff size={13} />}
      title={following ? "You'll be notified about this record" : "Get notified about this record"}>
      {following ? "Watching" : "Watch"}
    </Button>
  );
}
