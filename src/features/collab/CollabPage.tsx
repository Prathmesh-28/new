import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { humanizeAiError } from "@/components/ai/aiError";
import { MessageSquare, Hash, Plus, Send, Loader2, Users, X, AtSign, Search } from "lucide-react";

/**
 * Headroom Collab — Teams-style messaging (Phase 1: REST + polling; realtime is P2).
 * Channels + DMs sidebar with unread badges · message thread with keyset pagination ·
 * composer · read receipts. Every read/write is tenant-isolated (RLS) + membership-checked
 * server-side. Backed by /api/collab.
 */
interface Convo { id: string; type: "channel" | "group" | "dm"; title?: string | null; name?: string | null; unread: number; last_message_at?: string | null }
interface Msg { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; edited_at?: string | null; deleted_at?: string | null }
interface Teammate { id: string; name: string; email: string; self?: boolean }

export default function CollabPage() {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [msgsById, setMsgsById] = useState<Record<string, Msg[]>>({});
  const [members, setMembers] = useState<Teammate[]>([]);
  const [myId, setMyId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [picker, setPicker] = useState<null | "dm" | "channel">(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nameOf = useCallback((id: string) => members.find((m) => m.id === id)?.name || "Someone", [members]);

  const loadConvos = useCallback(async () => {
    try { setConvos(await api.get<Convo[]>("/api/collab/conversations")); } catch (e) { toast.error(humanizeAiError(e)); }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [cs, ms] = await Promise.all([
          api.get<Convo[]>("/api/collab/conversations"),
          api.get<Teammate[]>("/api/collab/members"),
        ]);
        setConvos(cs);
        setMembers(ms);
        setMyId(ms.find((m) => m.self)?.id || "");
        setActiveId((p) => p || cs[0]?.id || "");
      } catch (e) { toast.error(humanizeAiError(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const loadMessages = useCallback(async (convId: string, opts: { after?: string } = {}) => {
    try {
      const after = opts.after;
      const res = await api.get<{ messages: Msg[] }>(`/api/collab/conversations/${convId}/messages${after ? `?after=${after}` : ""}`);
      const incoming = res.messages || [];
      if (!incoming.length) return;
      setMsgsById((m) => {
        const prev = m[convId] ?? [];
        // `after` returns ascending newer msgs; the initial load returns newest-first → reverse to chronological.
        const add = after ? incoming : [...incoming].reverse();
        const seen = new Set(prev.map((x) => x.id));
        const merged = [...prev, ...add.filter((x) => !seen.has(x.id))];
        return { ...m, [convId]: merged };
      });
      // advance read pointer to the newest message
      const newest = incoming.reduce((a, b) => (a.id > b.id ? a : b));
      api.post(`/api/collab/conversations/${convId}/read`, { lastReadMessageId: newest.id }).then(loadConvos).catch(() => {});
    } catch (e) { toast.error(humanizeAiError(e)); }
  }, [loadConvos]);

  // Open a conversation → initial load.
  useEffect(() => { if (activeId && !msgsById[activeId]) void loadMessages(activeId); }, [activeId, msgsById, loadMessages]);

  // Poll: refresh sidebar + gap-recover the open conversation every 4s.
  useEffect(() => {
    const t = setInterval(() => {
      void loadConvos();
      if (activeId) {
        const cur = msgsById[activeId];
        const last = cur && cur.length ? cur[cur.length - 1].id : undefined;
        void loadMessages(activeId, last ? { after: last } : {});
      }
    }, 4000);
    return () => clearInterval(t);
  }, [activeId, msgsById, loadConvos, loadMessages]);

  const msgs = msgsById[activeId] ?? [];
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs.length, activeId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setDraft("");
    setSending(true);
    try {
      const msg = await api.post<Msg>(`/api/collab/conversations/${activeId}/messages`, { body });
      setMsgsById((m) => ({ ...m, [activeId]: [...(m[activeId] ?? []), msg] }));
      void loadConvos();
    } catch (e) { toast.error(humanizeAiError(e)); setDraft(body); }
    finally { setSending(false); }
  };

  const createChannel = async () => {
    const name = window.prompt("Channel name (e.g. finance, sales)");
    if (!name?.trim()) return;
    try {
      const c = await api.post<Convo>("/api/collab/conversations", { type: "channel", name: name.trim() });
      await loadConvos();
      setActiveId(c.id);
    } catch (e) { toast.error(humanizeAiError(e)); }
  };

  const startDm = async (teammate: Teammate) => {
    try {
      const c = await api.post<Convo>("/api/collab/conversations", { type: "dm", memberIds: [teammate.id] });
      setPicker(null);
      await loadConvos();
      setActiveId(c.id);
    } catch (e) { toast.error(humanizeAiError(e)); }
  };

  const active = convos.find((c) => c.id === activeId);
  const channels = convos.filter((c) => c.type === "channel" || c.type === "group");
  const dms = convos.filter((c) => c.type === "dm");
  const title = (c?: Convo) => c ? (c.title || c.name || (c.type === "dm" ? "Direct message" : "channel")) : "";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2 mr-auto">
          <MessageSquare className="text-[var(--color-primary)]" size={24} /> Messages
        </h1>
        <span className="text-[11px] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">Phase 1 · live polling</span>
      </div>

      <div className="flex h-[calc(100vh-13rem)] min-h-[28rem] rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-bg)]">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            <div>
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]/60">Channels</span>
                <button onClick={createChannel} title="New channel" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><Plus size={13} /></button>
              </div>
              {loading ? <p className="px-2 text-xs text-[var(--color-muted)]">Loading…</p> :
                channels.length === 0 ? <p className="px-2 py-1 text-xs text-[var(--color-muted)]">No channels yet.</p> :
                channels.map((c) => <ConvBtn key={c.id} c={c} active={c.id === activeId} onClick={() => setActiveId(c.id)} label={title(c)} icon={<Hash size={13} />} />)}
            </div>
            <div>
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]/60">Direct messages</span>
                <button onClick={() => setPicker("dm")} title="New direct message" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"><Plus size={13} /></button>
              </div>
              {dms.map((c) => <ConvBtn key={c.id} c={c} active={c.id === activeId} onClick={() => setActiveId(c.id)} label={title(c)} icon={<AtSign size={13} />} />)}
            </div>
          </div>
        </aside>

        {/* Thread */}
        <main className="flex-1 min-w-0 flex flex-col">
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <MessageSquare size={32} className="text-[var(--color-primary)] mb-3" />
              <p className="text-sm font-semibold">Your team's messages</p>
              <p className="text-xs text-[var(--color-muted)] mt-1 max-w-sm">Create a channel or start a direct message with a teammate.</p>
            </div>
          ) : (
            <>
              <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)]">
                {active.type === "dm" ? <AtSign size={15} className="text-[var(--color-primary)]" /> : <Hash size={15} className="text-[var(--color-primary)]" />}
                <span className="font-semibold truncate">{title(active)}</span>
                {active.type !== "dm" && <button onClick={() => setPicker("channel")} className="ml-auto flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"><Users size={13} /> Add people</button>}
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
                {msgs.length === 0 ? (
                  <p className="text-center text-xs text-[var(--color-muted)] py-8">No messages yet — say hello 👋</p>
                ) : msgs.map((m) => {
                  const mine = m.sender_id === myId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-[78%]">
                        {!mine && <div className="text-[11px] text-[var(--color-muted)] mb-0.5 px-1">{nameOf(m.sender_id)}</div>}
                        <div className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${mine ? "rounded-br-sm bg-[var(--color-primary)] text-[var(--color-bg)]" : "rounded-bl-sm bg-[var(--color-surface)] border border-[var(--color-border)]"}`}>
                          {m.deleted_at ? <span className="italic opacity-60">message deleted</span> : m.body}
                          {m.edited_at && !m.deleted_at && <span className="text-[10px] opacity-60 ml-1">(edited)</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="shrink-0 border-t border-[var(--color-border)] p-3">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 flex items-end gap-2">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                    placeholder={`Message ${title(active)}`} className="flex-1 bg-transparent px-2 py-1.5 text-sm outline-none resize-none" />
                  <button onClick={() => void send()} disabled={sending || !draft.trim()} className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-3 py-1.5 hover:opacity-90 disabled:opacity-40">
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Teammate picker (DM or add-to-channel) */}
      {picker && (
        <TeammatePicker
          members={members.filter((m) => !m.self)}
          title={picker === "dm" ? "Start a direct message" : "Add people to the channel"}
          onClose={() => setPicker(null)}
          onPick={async (t) => {
            if (picker === "dm") return startDm(t);
            try { await api.post(`/api/collab/conversations/${activeId}/members`, { userId: t.id }); toast.success(`Added ${t.name}`); setPicker(null); }
            catch (e) { toast.error(humanizeAiError(e)); }
          }}
        />
      )}
    </div>
  );
}

function ConvBtn({ c, active, onClick, label, icon }: { c: Convo; active: boolean; onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <button onClick={onClick} className={`w-full text-left flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${active ? "bg-[var(--color-primary)]/15 text-[var(--color-text)]" : "text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-text)]"}`}>
      <span className="shrink-0 text-[var(--color-primary)]">{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {c.unread > 0 && <span className="shrink-0 text-[10px] font-bold min-w-[18px] text-center bg-[var(--color-primary)] text-[var(--color-bg)] rounded-full px-1.5 py-0.5">{c.unread}</span>}
    </button>
  );
}

function TeammatePicker({ members, title, onClose, onPick }: { members: Teammate[]; title: string; onClose: () => void; onPick: (t: Teammate) => void }) {
  const [q, setQ] = useState("");
  const list = members.filter((m) => (m.name + m.email).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/4 z-50 w-[26rem] max-w-[92vw] -translate-x-1/2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
        </div>
        <div className="p-3">
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 mb-2">
            <Search size={13} className="text-[var(--color-muted)]" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teammates" className="flex-1 bg-transparent py-1.5 text-sm outline-none" />
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {list.length === 0 ? <p className="text-xs text-[var(--color-muted)] py-2 text-center">No teammates found.</p> :
              list.map((m) => (
                <button key={m.id} onClick={() => onPick(m)} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 text-left">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/15 flex items-center justify-center text-[var(--color-primary)] text-xs font-bold shrink-0">{m.name.charAt(0).toUpperCase()}</div>
                  <div className="min-w-0"><div className="text-sm truncate">{m.name}</div><div className="text-[11px] text-[var(--color-muted)] truncate">{m.email}</div></div>
                </button>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
