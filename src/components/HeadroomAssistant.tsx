import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Sparkles, X, Send, Loader2, ArrowRight, List, MessageSquare, ArrowLeft, RotateCcw } from "lucide-react";
import { FEATURE_GUIDES } from "@/data/featureGuides";
import { CURATED_FAQ, type FaqEntry } from "@/data/assistantFaq";
import { TAB_CATALOG } from "@/data/roles";

interface KbItem { id: string; category: string; title: string; what: string; steps?: string[]; tips?: string[]; route?: string; haystack: string }

const tabLabel: Record<string, { label: string; group: string }> = Object.fromEntries(TAB_CATALOG.map(t => [t.tab, { label: t.label, group: t.group }]));

function buildKb(): KbItem[] {
  const faq: KbItem[] = CURATED_FAQ.map((f: FaqEntry, i) => ({
    id: `faq-${i}`, category: f.category, title: f.q, what: f.a, route: f.route,
    haystack: `${f.q} ${f.a} ${f.keywords ?? ""} ${f.category}`.toLowerCase(),
  }));
  const guides: KbItem[] = Object.entries(FEATURE_GUIDES).map(([key, g]) => {
    const meta = tabLabel[key] ?? { label: key, group: "Features" };
    return {
      id: `guide-${key}`, category: meta.group, title: `${meta.label} — what it does & how to use it`,
      what: g.what, steps: g.steps, tips: g.tips, route: `/${key}`,
      haystack: `${meta.label} ${meta.group} ${g.what} ${g.steps.join(" ")} ${g.tips.join(" ")}`.toLowerCase(),
    };
  });
  return [...faq, ...guides];
}

function rank(kb: KbItem[], q: string): KbItem[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const terms = s.split(/\s+/).filter(t => t.length > 1);
  return kb
    .map(it => ({ it, score: terms.reduce((acc, t) => acc + (it.title.toLowerCase().includes(t) ? 2 : 0) + (it.haystack.includes(t) ? 1 : 0), 0) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(r => r.it);
}

interface Msg { role: "user" | "assistant"; content: string; route?: string; routeLabel?: string; chips?: string[]; seed?: boolean }

const STARTERS = [
  "How do I set up my business?",
  "How do I file GSTR-3B?",
  "How do I get paid faster on overdue invoices?",
  "How do I run payroll with PF & ESI?",
  "How do I switch from Tally?",
  "Who can see what — how do roles work?",
];
const GREETING: Msg = {
  role: "assistant", seed: true,
  content: "Hi 👋 I'm your Headroom Assistant. Ask me anything about your books, GST, invoices, payroll, collections, your team — or how to do something. Try one of these:",
  chips: STARTERS,
};

export default function HeadroomAssistant() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "browse">("chat");
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const kb = useMemo(buildKb, []);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs, busy]);
  useEffect(() => { if (open && view === "chat") inputRef.current?.focus(); }, [open, view]);

  if (!user) return null;

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history = [...msgs, { role: "user", content: q } as Msg];
    setMsgs(history);
    setInput("");
    setBusy(true);

    const matches = rank(kb, q);
    const top = matches[0];
    const chips = matches.slice(1, 4).map(m => m.title);
    const route = top?.route;
    const routeLabel = top ? (tabLabel[top.route?.slice(1) ?? ""]?.label ?? "Open") : undefined;

    // Multi-turn: send the real conversation (exclude the seeded greeting) to the AI,
    // grounded with the top KB matches so answers stay accurate to Headroom.
    const ctx = matches.slice(0, 6).map(m => `• ${m.title}: ${m.what}${m.steps ? " Steps: " + m.steps.join("; ") : ""}`).join("\n");
    const system = `You are the Headroom Assistant, a friendly in-app helper for an India-first SMB finance & accounting super-app (books/GL, GST & India tax filing, invoicing, collections, payroll, inventory, banking, capital, CRM). Answer conversationally and concisely (2-4 short sentences or tight bullets), reference the real screen/route, and be accurate. Use ONLY this product context where relevant:\n${ctx || "(no direct match — answer from general Headroom knowledge and suggest where to look.)"}`;
    const apiMsgs = history.filter(m => !m.seed).map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await api.post<{ content?: string; error?: string }>("/api/ai/ask", { system, messages: apiMsgs });
      const content = res?.content?.trim() || (top ? top.what : "I couldn't find that — try rephrasing, or tap the list icon to browse topics.");
      setMsgs(m => [...m, { role: "assistant", content, route, routeLabel, chips }]);
    } catch {
      // AI off → answer straight from the knowledge base, still conversational.
      const content = top
        ? `${top.what}${top.steps && top.steps.length ? "\n\nQuick steps:\n" + top.steps.slice(0, 4).map((s, i) => `${i + 1}. ${s}`).join("\n") : ""}`
        : "I couldn't find a direct answer — try rephrasing, or tap the list icon (top-right) to browse all help topics.";
      setMsgs(m => [...m, { role: "assistant", content, route, routeLabel, chips }]);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => setMsgs([GREETING]);

  // ── Browse view (secondary) ──────────────────────────────────────────────────
  const byCategory = useMemo(() => {
    const m = new Map<string, KbItem[]>();
    for (const it of kb) { if (!m.has(it.category)) m.set(it.category, []); m.get(it.category)!.push(it); }
    return [...m.entries()];
  }, [kb]);
  const [openCat, setOpenCat] = useState<string | null>("Getting started & plans");
  const [detail, setDetail] = useState<KbItem | null>(null);

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open Headroom Assistant"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 hover:opacity-90">
          <Sparkles size={16} /> <span className="hidden sm:inline">Ask Headroom</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[600px] max-h-[calc(100vh-2.5rem)] w-[390px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-gradient-to-r from-[var(--color-primary)]/15 to-transparent px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)]/20"><Sparkles size={14} className="text-[var(--color-primary)]" /></span>
              <div><p className="text-sm font-semibold leading-tight">Headroom Assistant</p><p className="text-[10px] text-[var(--color-muted)]">Always here to help</p></div>
            </div>
            <div className="flex items-center gap-0.5">
              {view === "chat"
                ? <button onClick={() => { setView("browse"); setDetail(null); }} title="Browse all topics" className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><List size={15} /></button>
                : <button onClick={() => setView("chat")} title="Back to chat" className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><MessageSquare size={15} /></button>}
              {view === "chat" && msgs.length > 1 && <button onClick={reset} title="New chat" className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><RotateCcw size={14} /></button>}
              <button onClick={() => setOpen(false)} className="rounded-md p-1.5 hover:bg-[var(--color-surface-2)]"><X size={16} /></button>
            </div>
          </div>

          {view === "chat" ? (
            <>
              {/* Conversation */}
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
                {msgs.map((m, i) => (
                  <div key={i}>
                    <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-relaxed ${m.role === "user" ? "rounded-br-sm bg-[var(--color-primary)] text-white" : "rounded-bl-sm bg-[var(--color-surface-2)] text-[var(--color-text)]"}`}>
                        {m.content}
                      </div>
                    </div>
                    {m.role === "assistant" && m.route && (
                      <button onClick={() => { setOpen(false); navigate(m.route!); }}
                        className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-surface-2)]">
                        {m.routeLabel ? `Go to ${m.routeLabel}` : "Take me there"} <ArrowRight size={11} />
                      </button>
                    )}
                    {m.role === "assistant" && m.chips && m.chips.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.chips.map((c, j) => (
                          <button key={j} onClick={() => send(c)} disabled={busy}
                            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-left text-[11px] text-[var(--color-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-text)] disabled:opacity-50">
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {busy && (
                  <div className="flex justify-start"><div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-[var(--color-surface-2)] px-3 py-2.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-muted)] [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-muted)] [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-muted)]" />
                  </div></div>
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-[var(--color-border)] p-2.5">
                <div className="flex items-end gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5">
                  <textarea ref={inputRef} value={input} rows={1}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                    placeholder="Ask anything…"
                    className="max-h-24 flex-1 resize-none bg-transparent py-1 text-xs outline-none" />
                  <button onClick={() => send(input)} disabled={busy || !input.trim()}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white disabled:opacity-40">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
                <p className="mt-1 px-1 text-center text-[9px] text-[var(--color-muted)]">Answers are guidance — verify figures in the app.</p>
              </div>
            </>
          ) : (
            /* Browse view */
            <div className="flex-1 overflow-y-auto p-3">
              {detail ? (
                <div>
                  <button onClick={() => setDetail(null)} className="mb-2 inline-flex items-center gap-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]"><ArrowLeft size={12} /> back</button>
                  <p className="text-sm font-semibold">{detail.title}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">{detail.what}</p>
                  {detail.steps && detail.steps.length > 0 && (
                    <ol className="mt-3 space-y-1.5">{detail.steps.map((s, i) => (
                      <li key={i} className="flex gap-2 text-xs leading-relaxed"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[9px] font-semibold text-[var(--color-primary)]">{i + 1}</span><span>{s}</span></li>
                    ))}</ol>
                  )}
                  {detail.route && <button onClick={() => { setOpen(false); navigate(detail.route!); }} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90">Take me there <ArrowRight size={12} /></button>}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="mb-1 px-1 text-[11px] text-[var(--color-muted)]">Browse {kb.length}+ help topics, or go back to chat.</p>
                  {byCategory.map(([cat, items]) => (
                    <div key={cat} className="overflow-hidden rounded-lg border border-[var(--color-border)]">
                      <button onClick={() => setOpenCat(openCat === cat ? null : cat)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[var(--color-surface-2)]">
                        <span className="text-xs font-medium">{cat}</span><span className="text-[10px] text-[var(--color-muted)]">{items.length}</span>
                      </button>
                      {openCat === cat && <div className="border-t border-[var(--color-border)]">{items.slice(0, 40).map(it => (
                        <button key={it.id} onClick={() => setDetail(it)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-2)]"><span className="truncate text-[11px]">{it.title}</span><ArrowRight size={12} className="shrink-0 text-[var(--color-muted)]" /></button>
                      ))}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
