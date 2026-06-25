import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { api } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import { toast } from "sonner";
import { humanizeAiError } from "@/components/ai/aiError";
import { MessageSquare, Hash, Plus, Send, Loader2, Users, X, AtSign, Search, Bell, SmilePlus, MessageCircle, Link2 } from "lucide-react";

/**
 * Headroom Collab — Teams-style messaging.
 *  Phase 1: REST + polling. Phase 2: SSE realtime (per-user fan-out). Phase 3:
 *  reactions, threads, @mentions → notifications, full-text search, pins, and
 *  contextual links to financial objects (the differentiator). Tenant-isolated (RLS)
 *  + membership-checked server-side. Backed by /api/collab.
 */
interface Reaction { emoji: string; userIds: string[] }
interface Convo { id: string; type: "channel" | "group" | "dm"; title?: string | null; name?: string | null; unread: number; last_message_at?: string | null }
interface Msg { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; edited_at?: string | null; deleted_at?: string | null; reactions?: Reaction[]; thread_reply_count?: number; parent_message_id?: string | null }
interface Teammate { id: string; name: string; email: string; self?: boolean }
interface Notif { id: string; kind: string; conversation_id?: string | null; source_message_id?: string | null; actor_id?: string | null; read_at?: string | null; created_at: string }
interface SearchHit { id: string; conversation_id: string; sender_id: string; body: string; name?: string | null; type?: string }
interface Link { entity_type: string; entity_id: string }

const QUICK_EMOJI = ["👍", "🎉", "❤️", "😄", "🙏", "🔥", "✅", "👀"];

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

  // Phase 3 UI state
  const [notifs, setNotifs] = useState<{ notifications: Notif[]; unread: number }>({ notifications: [], unread: 0 });
  const [showNotifs, setShowNotifs] = useState(false);
  const [reactFor, setReactFor] = useState<string | null>(null); // messageId whose emoji-picker is open
  const [thread, setThread] = useState<{ parent: Msg; replies: Msg[] } | null>(null);
  const [threadDraft, setThreadDraft] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[] | null>(null);
  const [links, setLinks] = useState<Link[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef("");
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  const nameOf = useCallback((id: string) => members.find((m) => m.id === id)?.name || "Someone", [members]);

  const loadConvos = useCallback(async () => {
    try { setConvos(await api.get<Convo[]>("/api/collab/conversations")); } catch (e) { toast.error(humanizeAiError(e)); }
  }, []);
  const loadNotifs = useCallback(async () => {
    try { setNotifs(await api.get<{ notifications: Notif[]; unread: number }>("/api/collab/notifications")); } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [cs, ms] = await Promise.all([api.get<Convo[]>("/api/collab/conversations"), api.get<Teammate[]>("/api/collab/members")]);
        setConvos(cs); setMembers(ms); setMyId(ms.find((m) => m.self)?.id || "");
        setActiveId((p) => p || cs[0]?.id || "");
        void loadNotifs();
      } catch (e) { toast.error(humanizeAiError(e)); }
      finally { setLoading(false); }
    })();
  }, [loadNotifs]);

  const loadMessages = useCallback(async (convId: string, opts: { after?: string } = {}) => {
    try {
      const after = opts.after;
      const res = await api.get<{ messages: Msg[] }>(`/api/collab/conversations/${convId}/messages${after ? `?after=${after}` : ""}`);
      const incoming = res.messages || [];
      if (!incoming.length) return;
      setMsgsById((m) => {
        const prev = m[convId] ?? [];
        const add = after ? incoming : [...incoming].reverse();
        const seen = new Set(prev.map((x) => x.id));
        const merged = [...prev.map((p) => add.find((a) => a.id === p.id) || p), ...add.filter((x) => !seen.has(x.id))];
        return { ...m, [convId]: merged };
      });
      const newest = incoming.reduce((a, b) => (a.id > b.id ? a : b));
      api.post(`/api/collab/conversations/${convId}/read`, { lastReadMessageId: newest.id }).then(loadConvos).catch(() => {});
    } catch (e) { toast.error(humanizeAiError(e)); }
  }, [loadConvos]);

  useEffect(() => { if (activeId && !msgsById[activeId]) void loadMessages(activeId); }, [activeId, msgsById, loadMessages]);
  useEffect(() => { if (activeId) api.get<{ links: Link[] }>(`/api/collab/conversations/${activeId}/links`).then((r) => setLinks(r.links || [])).catch(() => setLinks([])); }, [activeId]);

  // helper to mutate a reaction set in place (used by SSE + optimistic)
  const applyReaction = (list: Msg[], messageId: string, emoji: string, uid: string, added: boolean): Msg[] =>
    list.map((m) => {
      if (m.id !== messageId) return m;
      const rx = (m.reactions || []).map((r) => ({ ...r, userIds: [...r.userIds] }));
      let g = rx.find((r) => r.emoji === emoji);
      if (added) { if (!g) { g = { emoji, userIds: [] }; rx.push(g); } if (!g.userIds.includes(uid)) g.userIds.push(uid); }
      else if (g) { g.userIds = g.userIds.filter((u) => u !== uid); }
      return { ...m, reactions: rx.filter((r) => r.userIds.length) };
    });

  // Realtime (SSE) — Phase 2/3 events.
  useEffect(() => {
    const token = localStorage.getItem("hr_access");
    if (!token || typeof EventSource === "undefined") return;
    const es = new EventSource(`${API_BASE}/api/collab/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (ev) => {
      let e: { type: string; conversationId?: string; messageId?: string; message?: Msg; emoji?: string; userId?: string; added?: boolean; notification?: Notif };
      try { e = JSON.parse(ev.data); } catch { return; }
      if (e.type === "message:new" && e.conversationId) {
        const cid = e.conversationId; void loadConvos();
        if (cid === activeIdRef.current && e.message) {
          const m = e.message;
          setMsgsById((s) => { const prev = s[cid] ?? []; return prev.some((x) => x.id === m.id) ? s : { ...s, [cid]: [...prev, m] }; });
          api.post(`/api/collab/conversations/${cid}/read`, { lastReadMessageId: m.id }).catch(() => {});
        }
      } else if (e.type === "message:updated" && e.conversationId && e.message) {
        const m = e.message; setMsgsById((s) => (s[e.conversationId!] ? { ...s, [e.conversationId!]: s[e.conversationId!].map((x) => (x.id === m.id ? { ...m, reactions: x.reactions } : x)) } : s));
      } else if (e.type === "message:deleted" && e.conversationId && e.messageId) {
        setMsgsById((s) => (s[e.conversationId!] ? { ...s, [e.conversationId!]: s[e.conversationId!].map((x) => (x.id === e.messageId ? { ...x, deleted_at: new Date().toISOString(), body: "" } : x)) } : s));
      } else if (e.type === "reaction:updated" && e.conversationId && e.messageId && e.emoji && e.userId) {
        setMsgsById((s) => (s[e.conversationId!] ? { ...s, [e.conversationId!]: applyReaction(s[e.conversationId!], e.messageId!, e.emoji!, e.userId!, !!e.added) } : s));
      } else if (e.type === "notification:new" && e.notification) {
        const n = e.notification; setNotifs((p) => ({ notifications: [n, ...p.notifications].slice(0, 50), unread: p.unread + 1 }));
      }
    };
    return () => es.close();
  }, [loadConvos]);

  // Slow backstop poll.
  useEffect(() => {
    const t = setInterval(() => {
      void loadConvos();
      if (activeId) { const cur = msgsById[activeId]; const last = cur && cur.length ? cur[cur.length - 1].id : undefined; void loadMessages(activeId, last ? { after: last } : {}); }
    }, 15000);
    return () => clearInterval(t);
  }, [activeId, msgsById, loadConvos, loadMessages]);

  const msgs = msgsById[activeId] ?? [];
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs.length, activeId]);

  // Resolve @tokens in a body to member ids (+ "everyone"). v1: name/email prefix match.
  const parseMentions = (body: string): string[] => {
    const out = new Set<string>();
    for (const tok of body.match(/@([a-zA-Z0-9._-]+)/g) || []) {
      const t = tok.slice(1).toLowerCase();
      if (t === "everyone" || t === "all" || t === "channel") { out.add("everyone"); continue; }
      const hit = members.find((m) => !m.self && (m.name.toLowerCase().replace(/\s+/g, "").startsWith(t) || m.email.toLowerCase().startsWith(t)));
      if (hit) out.add(hit.id);
    }
    return [...out];
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setDraft(""); setSending(true);
    try {
      const msg = await api.post<Msg>(`/api/collab/conversations/${activeId}/messages`, { body, mentions: parseMentions(body) });
      setMsgsById((m) => ({ ...m, [activeId]: [...(m[activeId] ?? []), msg] }));
      void loadConvos();
    } catch (e) { toast.error(humanizeAiError(e)); setDraft(body); }
    finally { setSending(false); }
  };

  const toggleReaction = async (m: Msg, emoji: string) => {
    const mine = (m.reactions || []).find((r) => r.emoji === emoji)?.userIds.includes(myId);
    setReactFor(null);
    setMsgsById((s) => ({ ...s, [m.conversation_id]: applyReaction(s[m.conversation_id] || [], m.id, emoji, myId, !mine) }));
    try {
      if (mine) await api.delete(`/api/collab/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`);
      else await api.put(`/api/collab/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`, {});
    } catch (e) { toast.error(humanizeAiError(e)); void loadMessages(m.conversation_id); }
  };

  const openThread = async (parent: Msg) => {
    setThread({ parent, replies: [] });
    try { const r = await api.get<{ messages: Msg[] }>(`/api/collab/messages/${parent.id}/thread`); setThread({ parent, replies: r.messages || [] }); }
    catch (e) { toast.error(humanizeAiError(e)); }
  };
  const sendThreadReply = async () => {
    const body = threadDraft.trim(); if (!body || !thread) return;
    setThreadDraft("");
    try {
      const msg = await api.post<Msg>(`/api/collab/conversations/${thread.parent.conversation_id}/messages`, { body, parentMessageId: thread.parent.id, mentions: parseMentions(body) });
      setThread((t) => (t ? { ...t, replies: [...t.replies, msg] } : t));
      void loadMessages(thread.parent.conversation_id);
    } catch (e) { toast.error(humanizeAiError(e)); }
  };

  const createChannel = async () => {
    const name = window.prompt("Channel name (e.g. finance, sales)"); if (!name?.trim()) return;
    try { const c = await api.post<Convo>("/api/collab/conversations", { type: "channel", name: name.trim() }); await loadConvos(); setActiveId(c.id); }
    catch (e) { toast.error(humanizeAiError(e)); }
  };
  const startDm = async (t: Teammate) => {
    try { const c = await api.post<Convo>("/api/collab/conversations", { type: "dm", memberIds: [t.id] }); setPicker(null); await loadConvos(); setActiveId(c.id); }
    catch (e) { toast.error(humanizeAiError(e)); }
  };
  const linkInvoice = async () => {
    const id = window.prompt("Link this conversation to an invoice — paste the invoice id:"); if (!id?.trim()) return;
    try { await api.post(`/api/collab/conversations/${activeId}/links`, { entityType: "invoice", entityId: id.trim() }); setLinks((l) => [{ entity_type: "invoice", entity_id: id.trim() }, ...l]); toast.success("Linked to invoice"); }
    catch (e) { toast.error(humanizeAiError(e)); }
  };
  const runSearch = async () => {
    const q = searchQ.trim(); if (!q) { setSearchResults(null); return; }
    try { const r = await api.get<{ results: SearchHit[] }>(`/api/collab/search?q=${encodeURIComponent(q)}`); setSearchResults(r.results || []); }
    catch (e) { toast.error(humanizeAiError(e)); }
  };
  const openNotif = (n: Notif) => {
    setShowNotifs(false);
    if (n.conversation_id) { setActiveId(n.conversation_id); if (!msgsById[n.conversation_id]) void loadMessages(n.conversation_id); }
    api.post("/api/collab/notifications/read", { ids: [n.id] }).then(loadNotifs).catch(() => {});
  };

  const active = convos.find((c) => c.id === activeId);
  const channels = convos.filter((c) => c.type === "channel" || c.type === "group");
  const dms = convos.filter((c) => c.type === "dm");
  const title = (c?: Convo) => (c ? c.title || c.name || (c.type === "dm" ? "Direct message" : "channel") : "");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2 mr-auto"><MessageSquare className="text-[var(--color-primary)]" size={24} /> Messages</h1>
        {/* Search */}
        <div className="relative">
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2">
            <Search size={13} className="text-[var(--color-muted)]" />
            <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }} placeholder="Search messages" className="bg-transparent py-1.5 text-sm outline-none w-44" />
            {searchResults !== null && <button onClick={() => { setSearchResults(null); setSearchQ(""); }} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={13} /></button>}
          </div>
          {searchResults !== null && (
            <div className="absolute right-0 top-10 z-30 w-96 max-h-80 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl p-2">
              {searchResults.length === 0 ? <p className="text-xs text-[var(--color-muted)] p-2">No matches.</p> : searchResults.map((h) => (
                <button key={h.id} onClick={() => { setActiveId(h.conversation_id); if (!msgsById[h.conversation_id]) void loadMessages(h.conversation_id); setSearchResults(null); }}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-white/5">
                  <div className="text-[11px] text-[var(--color-muted)]">{h.type === "dm" ? "DM" : `#${h.name}`} · {nameOf(h.sender_id)}</div>
                  <div className="text-sm truncate">{h.body}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Notifications */}
        <div className="relative">
          <button onClick={() => { setShowNotifs((v) => !v); if (!showNotifs) void loadNotifs(); }} className="relative p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]">
            <Bell size={15} />
            {notifs.unread > 0 && <span className="absolute -top-1 -right-1 text-[9px] font-bold min-w-[16px] text-center bg-red-500 text-white rounded-full px-1">{notifs.unread}</span>}
          </button>
          {showNotifs && (
            <div className="absolute right-0 top-11 z-30 w-80 max-h-96 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl p-2">
              <div className="flex items-center justify-between px-1 pb-1.5">
                <span className="text-xs font-semibold">Notifications</span>
                {notifs.unread > 0 && <button onClick={() => api.post("/api/collab/notifications/read", {}).then(loadNotifs)} className="text-[11px] text-[var(--color-primary)] hover:underline">Mark all read</button>}
              </div>
              {notifs.notifications.length === 0 ? <p className="text-xs text-[var(--color-muted)] p-2">Nothing yet.</p> : notifs.notifications.map((n) => (
                <button key={n.id} onClick={() => openNotif(n)} className={`w-full text-left px-2 py-1.5 rounded-md hover:bg-white/5 text-xs ${n.read_at ? "text-[var(--color-muted)]" : "text-[var(--color-text)]"}`}>
                  <span className="font-medium">{nameOf(n.actor_id || "")}</span>{" "}
                  {n.kind === "mention" ? "mentioned you" : n.kind === "thread_reply" ? "replied to your message" : n.kind}
                </button>
              ))}
            </div>
          )}
        </div>
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

        {/* Thread / message area */}
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
                {links.map((l) => <span key={l.entity_type + l.entity_id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--color-primary)]/40 text-[var(--color-primary)]"><Link2 size={10} /> {l.entity_type}</span>)}
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={linkInvoice} title="Link to a financial object" className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><Link2 size={14} /></button>
                  {active.type !== "dm" && <button onClick={() => setPicker("channel")} className="flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"><Users size={13} /> Add</button>}
                </div>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
                {msgs.length === 0 ? <p className="text-center text-xs text-[var(--color-muted)] py-8">No messages yet — say hello 👋</p> :
                  msgs.filter((m) => !m.parent_message_id).map((m) => (
                    <MessageRow key={m.id} m={m} mine={m.sender_id === myId} myId={myId} senderName={nameOf(m.sender_id)}
                      reactOpen={reactFor === m.id} onReactToggle={() => setReactFor((r) => (r === m.id ? null : m.id))}
                      onReact={(emoji) => toggleReaction(m, emoji)} onThread={() => openThread(m)} />
                  ))}
              </div>
              <div className="shrink-0 border-t border-[var(--color-border)] p-3">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 flex items-end gap-2">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                    placeholder={`Message ${title(active)} — @mention a teammate`} className="flex-1 bg-transparent px-2 py-1.5 text-sm outline-none resize-none" />
                  <button onClick={() => void send()} disabled={sending || !draft.trim()} className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-3 py-1.5 hover:opacity-90 disabled:opacity-40">
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </div>
            </>
          )}
        </main>

        {/* Thread panel */}
        {thread && (
          <section className="w-[22rem] max-w-[40vw] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col hidden md:flex">
            <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
              <MessageCircle size={15} className="text-[var(--color-primary)]" /><span className="text-sm font-semibold">Thread</span>
              <button onClick={() => setThread(null)} className="ml-auto text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={15} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm">
                <div className="text-[11px] text-[var(--color-muted)] mb-0.5">{nameOf(thread.parent.sender_id)}</div>
                {thread.parent.body}
              </div>
              <div className="text-[11px] text-[var(--color-muted)] px-1">{thread.replies.length} repl{thread.replies.length === 1 ? "y" : "ies"}</div>
              {thread.replies.map((r) => (
                <div key={r.id} className="text-sm px-1"><span className="text-[11px] text-[var(--color-muted)]">{nameOf(r.sender_id)}: </span>{r.deleted_at ? <span className="italic opacity-60">deleted</span> : r.body}</div>
              ))}
            </div>
            <div className="shrink-0 border-t border-[var(--color-border)] p-2">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-1.5 flex items-end gap-2">
                <textarea value={threadDraft} onChange={(e) => setThreadDraft(e.target.value)} rows={1}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendThreadReply(); } }}
                  placeholder="Reply…" className="flex-1 bg-transparent px-1.5 py-1 text-sm outline-none resize-none" />
                <button onClick={() => void sendThreadReply()} disabled={!threadDraft.trim()} className="rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] px-2.5 py-1.5 disabled:opacity-40"><Send size={13} /></button>
              </div>
            </div>
          </section>
        )}
      </div>

      {picker && (
        <TeammatePicker members={members.filter((m) => !m.self)} title={picker === "dm" ? "Start a direct message" : "Add people to the channel"} onClose={() => setPicker(null)}
          onPick={async (t) => {
            if (picker === "dm") return startDm(t);
            try { await api.post(`/api/collab/conversations/${activeId}/members`, { userId: t.id }); toast.success(`Added ${t.name}`); setPicker(null); } catch (e) { toast.error(humanizeAiError(e)); }
          }} />
      )}
    </div>
  );
}

function MessageRow({ m, mine, myId, senderName, reactOpen, onReactToggle, onReact, onThread }: {
  m: Msg; mine: boolean; myId: string; senderName: string; reactOpen: boolean; onReactToggle: () => void; onReact: (e: string) => void; onThread: () => void;
}) {
  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[78%] relative">
        {!mine && <div className="text-[11px] text-[var(--color-muted)] mb-0.5 px-1">{senderName}</div>}
        <div className="flex items-center gap-1">
          {mine && <RowActions onReactToggle={onReactToggle} onThread={onThread} />}
          <div className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${mine ? "rounded-br-sm bg-[var(--color-primary)] text-[var(--color-bg)]" : "rounded-bl-sm bg-[var(--color-surface)] border border-[var(--color-border)]"}`}>
            {m.deleted_at ? <span className="italic opacity-60">message deleted</span> : m.body}
            {m.edited_at && !m.deleted_at && <span className="text-[10px] opacity-60 ml-1">(edited)</span>}
          </div>
          {!mine && <RowActions onReactToggle={onReactToggle} onThread={onThread} />}
        </div>
        {/* reactions + thread count */}
        <div className={`flex items-center gap-1 mt-1 flex-wrap ${mine ? "justify-end" : ""}`}>
          {(m.reactions || []).map((r) => (
            <button key={r.emoji} onClick={() => onReact(r.emoji)} className={`text-xs rounded-full border px-1.5 py-0.5 ${r.userIds.includes(myId) ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15" : "border-[var(--color-border)]"}`}>{r.emoji} {r.userIds.length}</button>
          ))}
          {(m.thread_reply_count ?? 0) > 0 && <button onClick={onThread} className="text-[11px] text-[var(--color-primary)] hover:underline flex items-center gap-0.5"><MessageCircle size={11} /> {m.thread_reply_count} repl{m.thread_reply_count === 1 ? "y" : "ies"}</button>}
        </div>
        {reactOpen && (
          <div className={`absolute z-20 -top-9 ${mine ? "right-0" : "left-0"} flex gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg px-1.5 py-1`}>
            {QUICK_EMOJI.map((e) => <button key={e} onClick={() => onReact(e)} className="text-base hover:scale-125 transition-transform">{e}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}

function RowActions({ onReactToggle, onThread }: { onReactToggle: () => void; onThread: () => void }) {
  return (
    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
      <button onClick={onReactToggle} title="React" className="p-1 text-[var(--color-muted)] hover:text-[var(--color-primary)]"><SmilePlus size={14} /></button>
      <button onClick={onThread} title="Reply in thread" className="p-1 text-[var(--color-muted)] hover:text-[var(--color-primary)]"><MessageCircle size={14} /></button>
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
