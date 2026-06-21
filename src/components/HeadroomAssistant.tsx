import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Sparkles, X, Search, ArrowLeft, ArrowRight, Send, Loader2, MessageCircleQuestion, ExternalLink } from "lucide-react";
import { FEATURE_GUIDES } from "@/data/featureGuides";
import { CURATED_FAQ, type FaqEntry } from "@/data/assistantFaq";
import { TAB_CATALOG } from "@/data/roles";

// Unified knowledge-base entry — built from the curated FAQ + every FEATURE_GUIDE,
// so the assistant can answer the full surface of "what is X / how do I…" questions.
interface KbItem {
  id: string;
  category: string;
  title: string;       // the question / feature
  what: string;        // answer / "what is it"
  steps?: string[];
  tips?: string[];
  route?: string;
  haystack: string;    // lowercased searchable text
}

const tabLabel: Record<string, { label: string; group: string }> = Object.fromEntries(
  TAB_CATALOG.map(t => [t.tab, { label: t.label, group: t.group }]),
);

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

type ChatMsg = { role: "user" | "assistant"; content: string };

export default function HeadroomAssistant() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<KbItem | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const kb = useMemo(buildKb, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/);
    return kb
      .map(it => ({ it, score: terms.reduce((s, t) => s + (it.title.toLowerCase().includes(t) ? 2 : 0) + (it.haystack.includes(t) ? 1 : 0), 0) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(r => r.it);
  }, [query, kb]);

  // Category browse (when no query)
  const byCategory = useMemo(() => {
    const m = new Map<string, KbItem[]>();
    for (const it of kb) { if (!m.has(it.category)) m.set(it.category, []); m.get(it.category)!.push(it); }
    return [...m.entries()];
  }, [kb]);
  const [openCat, setOpenCat] = useState<string | null>("Getting started & plans");

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [chat, aiBusy]);

  if (!user) return null; // only inside the authed app

  const askAi = async () => {
    const q = query.trim();
    if (!q || aiBusy) return;
    setChat(c => [...c, { role: "user", content: q }]);
    setQuery("");
    setAiBusy(true);
    // Ground the model with the top KB matches so answers stay accurate to Headroom.
    const ctx = results.slice(0, 6).map(r => `• ${r.title}: ${r.what}${r.steps ? " Steps: " + r.steps.join("; ") : ""}`).join("\n");
    const system = `You are the Headroom Assistant for an India-first SMB finance & accounting super-app. Answer concisely and actionably, referencing real screens/buttons. If relevant, use this product context:\n${ctx || "(no direct match — answer from general Headroom knowledge: it does books/GL, GST & India tax filing, invoicing, collections, payroll, inventory, banking, capital.)"}`;
    try {
      const res = await api.post<{ content?: string; error?: string }>("/api/ai/ask", {
        system, messages: [{ role: "user", content: q }],
      });
      setChat(c => [...c, { role: "assistant", content: res?.content || "I couldn't find an answer — try browsing the guides below." }]);
    } catch {
      setChat(c => [...c, { role: "assistant", content: "Live AI answers aren't enabled in this workspace yet. I've shown the closest help guides below — open one for step-by-step instructions." }]);
    } finally { setAiBusy(false); }
  };

  return (
    <>
      {/* Floating launcher — bottom-right, above content, clear of the mobile bottom edge */}
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open Headroom Assistant"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 hover:opacity-90">
          <Sparkles size={16} /> <span className="hidden sm:inline">Ask Headroom</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[560px] max-h-[calc(100vh-2.5rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-gradient-to-r from-[var(--color-primary)]/15 to-transparent px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-[var(--color-primary)]" />
              <p className="text-sm font-semibold">Headroom Assistant</p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-[var(--color-surface-2)]"><X size={16} /></button>
          </div>

          {/* Search / ask */}
          <div className="border-b border-[var(--color-border)] p-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5">
              <Search size={14} className="text-[var(--color-muted)]" />
              <input value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }}
                onKeyDown={e => { if (e.key === "Enter") askAi(); }}
                placeholder="Ask anything, or search help…"
                className="w-full bg-transparent text-xs outline-none" />
              {query.trim() && (
                <button onClick={askAi} disabled={aiBusy} title="Ask the AI"
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50">
                  {aiBusy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Ask AI
                </button>
              )}
            </div>
          </div>

          <div ref={bodyRef} className="flex-1 overflow-y-auto p-3">
            {/* AI chat thread */}
            {chat.length > 0 && (
              <div className="mb-3 space-y-2">
                {chat.map((m, i) => (
                  <div key={i} className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${m.role === "user" ? "ml-6 bg-[var(--color-primary)]/15" : "mr-2 bg-[var(--color-surface-2)] whitespace-pre-wrap"}`}>{m.content}</div>
                ))}
                {aiBusy && <div className="mr-2 flex items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-muted)]"><Loader2 size={12} className="animate-spin" /> Thinking…</div>}
              </div>
            )}

            {/* Detail view */}
            {selected ? (
              <div>
                <button onClick={() => setSelected(null)} className="mb-2 inline-flex items-center gap-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]"><ArrowLeft size={12} /> back</button>
                <p className="text-sm font-semibold">{selected.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">{selected.what}</p>
                {selected.steps && selected.steps.length > 0 && (
                  <ol className="mt-3 space-y-1.5">
                    {selected.steps.map((s, i) => (
                      <li key={i} className="flex gap-2 text-xs leading-relaxed">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-[9px] font-semibold text-[var(--color-primary)]">{i + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {selected.tips && selected.tips.length > 0 && (
                  <div className="mt-3 rounded-lg bg-[var(--color-surface-2)] p-2.5">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Tips</p>
                    <ul className="space-y-1 text-[11px] leading-relaxed text-[var(--color-muted)]">{selected.tips.map((t, i) => <li key={i}>• {t}</li>)}</ul>
                  </div>
                )}
                {selected.route && (
                  <button onClick={() => { setOpen(false); navigate(selected.route!); }}
                    className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90">
                    Take me there <ArrowRight size={12} />
                  </button>
                )}
              </div>
            ) : query.trim() ? (
              /* Search results */
              <div className="space-y-1.5">
                <p className="px-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{results.length} help article{results.length === 1 ? "" : "s"}</p>
                {results.map(it => (
                  <button key={it.id} onClick={() => setSelected(it)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-left hover:border-[var(--color-primary)]">
                    <div className="min-w-0"><p className="truncate text-xs font-medium">{it.title}</p><p className="truncate text-[10px] text-[var(--color-muted)]">{it.category}</p></div>
                    <ArrowRight size={13} className="shrink-0 text-[var(--color-muted)]" />
                  </button>
                ))}
                {results.length === 0 && <p className="px-1 py-4 text-center text-xs text-[var(--color-muted)]">No match — hit <strong>Ask AI</strong> above for a direct answer.</p>}
              </div>
            ) : (
              /* Browse by category */
              <div className="space-y-1.5">
                <p className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-[var(--color-muted)]"><MessageCircleQuestion size={13} /> Browse help by topic, or type a question above.</p>
                {byCategory.map(([cat, items]) => (
                  <div key={cat} className="overflow-hidden rounded-lg border border-[var(--color-border)]">
                    <button onClick={() => setOpenCat(openCat === cat ? null : cat)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[var(--color-surface-2)]">
                      <span className="text-xs font-medium">{cat}</span>
                      <span className="text-[10px] text-[var(--color-muted)]">{items.length}</span>
                    </button>
                    {openCat === cat && (
                      <div className="border-t border-[var(--color-border)]">
                        {items.map(it => (
                          <button key={it.id} onClick={() => setSelected(it)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-2)]">
                            <span className="truncate text-[11px]">{it.title}</span>
                            <ArrowRight size={12} className="shrink-0 text-[var(--color-muted)]" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <button onClick={() => { setOpen(false); navigate("/copilot"); }} className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--color-border)] py-2 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]">
                  Open the full AI CFO <ExternalLink size={11} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
