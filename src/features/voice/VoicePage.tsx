import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, generateId } from "@/lib/utils";
import {
  Mic, Languages, Volume2, BookOpen, Eye, Hash, AudioLines, Fingerprint, NotebookPen,
  AlertTriangle, CheckCircle2, Play, Square, Trash2, Copy, Plus,
  Receipt, FileText, Search, Globe, Sun, Bell, Type, ArrowRightLeft,
  PhoneCall, MessageCircle, BookMarked, Calculator, PartyPopper, Send, X,
  HelpCircle, SpellCheck2, CalendarClock, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// ── shared styles (reused from TaxPage/DebtPage convention) ──────────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

// ── minimal typings for the Web Speech APIs (no `any`) ───────────────────────────
interface SpeechRecognitionAlternativeLike { transcript: string }
interface SpeechRecognitionResultLike { 0: SpeechRecognitionAlternativeLike; isFinal: boolean; length: number }
interface SpeechRecognitionEventLike { results: { length: number; [i: number]: SpeechRecognitionResultLike } }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const SPEECH_IN = typeof window !== "undefined" && getRecognitionCtor() !== null;
const SPEECH_OUT = typeof window !== "undefined" && "speechSynthesis" in window;

// 22 scheduled Indian languages + BCP-47 hints for the speech APIs.
const LANGUAGES: { name: string; bcp47: string }[] = [
  { name: "Assamese", bcp47: "as-IN" }, { name: "Bengali", bcp47: "bn-IN" },
  { name: "Bodo", bcp47: "brx-IN" }, { name: "Dogri", bcp47: "doi-IN" },
  { name: "Gujarati", bcp47: "gu-IN" }, { name: "Hindi", bcp47: "hi-IN" },
  { name: "Kannada", bcp47: "kn-IN" }, { name: "Kashmiri", bcp47: "ks-IN" },
  { name: "Konkani", bcp47: "kok-IN" }, { name: "Maithili", bcp47: "mai-IN" },
  { name: "Malayalam", bcp47: "ml-IN" }, { name: "Manipuri", bcp47: "mni-IN" },
  { name: "Marathi", bcp47: "mr-IN" }, { name: "Nepali", bcp47: "ne-IN" },
  { name: "Odia", bcp47: "or-IN" }, { name: "Punjabi", bcp47: "pa-IN" },
  { name: "Sanskrit", bcp47: "sa-IN" }, { name: "Santali", bcp47: "sat-IN" },
  { name: "Sindhi", bcp47: "sd-IN" }, { name: "Tamil", bcp47: "ta-IN" },
  { name: "Telugu", bcp47: "te-IN" }, { name: "Urdu", bcp47: "ur-IN" },
];

// Speak helper — feature-detected; returns false if unsupported.
function speak(text: string, lang = "en-IN", rate = 1): boolean {
  if (!SPEECH_OUT) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  synth.speak(u);
  return true;
}

// Vernacular (Indian) number grouping: 12,34,567 vs international 1,234,567.
function formatIndianGrouping(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toString();
  if (s.length <= 3) return (neg ? "-" : "") + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return (neg ? "-" : "") + rest + "," + last3;
}
function lakhCrore(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} crore`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} lakh`;
  return formatIndianGrouping(n);
}

// A tiny banner used everywhere a browser API may be missing.
function FallbackNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-yellow-800/40 bg-yellow-950/20 px-3 py-2 text-[11px] text-yellow-300">
      <AlertTriangle size={12} className="shrink-0 mt-px" />
      <span>{children}</span>
    </div>
  );
}

export default function VoicePage() {
  const [tab, setTab] = useState<
    "overview" | "capture" | "language" | "reader" | "cheatsheet"
    | "access" | "numbers" | "audiostmt" | "voiceauth" | "scratchpad"
    | "expense" | "invoice" | "txnsearch" | "uipreview" | "digest"
    | "reminder" | "words" | "translit"
    | "payreminder" | "whatsapp" | "glossary" | "calc" | "greeting"
    | "askbalance" | "spellout" | "spokendate" | "quicklog"
  >("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Mic size={18} className="text-[var(--color-primary)]" /> Voice &amp; Vernacular
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Run your books by speaking, listen to summaries aloud, and tune the app for any language or ability — built on your browser&apos;s own speech engine.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["overview", "Overview", Mic],
            ["capture", "Voice Capture", Mic],
            ["language", "Language", Languages],
            ["reader", "Read Aloud", Volume2],
            ["cheatsheet", "Commands", BookOpen],
            ["access", "Accessibility", Eye],
            ["numbers", "Lakh / Crore", Hash],
            ["audiostmt", "Audio Statement", AudioLines],
            ["voiceauth", "Voice Auth", Fingerprint],
            ["scratchpad", "Dictation Pad", NotebookPen],
            ["expense", "Expense Logger", Receipt],
            ["invoice", "Spoken Invoice", FileText],
            ["txnsearch", "Voice Search", Search],
            ["uipreview", "UI Language", Globe],
            ["digest", "My Day", Sun],
            ["reminder", "Reminders", Bell],
            ["words", "Amount in Words", Type],
            ["translit", "Transliterate", ArrowRightLeft],
            ["payreminder", "Payment Reminder", PhoneCall],
            ["whatsapp", "Voice to WhatsApp", MessageCircle],
            ["glossary", "Audio Glossary", BookMarked],
            ["calc", "Speak Total", Calculator],
            ["greeting", "Greeting Recorder", PartyPopper],
            ["askbalance", "Ask Balance", HelpCircle],
            ["spellout", "Spell It Out", SpellCheck2],
            ["spokendate", "Spoken Date", CalendarClock],
            ["quicklog", "Work Log", ClipboardList],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <Overview />}
      {tab === "capture" && <VoiceCapture />}
      {tab === "language" && <LanguagePreference />}
      {tab === "reader" && <SummaryReader />}
      {tab === "cheatsheet" && <CommandCheatSheet />}
      {tab === "access" && <AccessibilitySettings />}
      {tab === "numbers" && <VernacularNumbers />}
      {tab === "audiostmt" && <AudioStatementBuilder />}
      {tab === "voiceauth" && <VoiceAuthSetup />}
      {tab === "scratchpad" && <DictationScratchpad />}
      {tab === "expense" && <VoiceExpenseLogger />}
      {tab === "invoice" && <SpokenInvoiceCreator />}
      {tab === "txnsearch" && <VoiceTransactionSearch />}
      {tab === "uipreview" && <UiLanguagePreview />}
      {tab === "digest" && <ReadMyDayDigest />}
      {tab === "reminder" && <VoiceReminderSetter />}
      {tab === "words" && <AmountInWords />}
      {tab === "translit" && <TransliterationHelper />}
      {tab === "payreminder" && <PaymentReminderDictation />}
      {tab === "whatsapp" && <VoiceToWhatsApp />}
      {tab === "glossary" && <FinanceGlossary />}
      {tab === "calc" && <SpeakTheTotal />}
      {tab === "greeting" && <GreetingRecorder />}
      {tab === "askbalance" && <AskBalanceAloud />}
      {tab === "spellout" && <SpellItOut />}
      {tab === "spokendate" && <SpokenDateEntry />}
      {tab === "quicklog" && <VoiceWorkLog />}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────────
function Overview() {
  const capabilities: { icon: typeof Mic; title: string; body: string; ok: boolean }[] = [
    { icon: Mic, title: "Speech recognition", body: "Dictate transactions and notes. Uses the browser's Web Speech API.", ok: SPEECH_IN },
    { icon: Volume2, title: "Text-to-speech", body: "Hear summaries and statements read aloud via speechSynthesis.", ok: SPEECH_OUT },
    { icon: Languages, title: "22 Indian languages", body: "Pick a preferred language; speech APIs are hinted with the right locale.", ok: true },
    { icon: Eye, title: "Accessibility", body: "Large-text and high-contrast modes for low-vision users.", ok: true },
    { icon: Hash, title: "Vernacular numbers", body: "Lakh / crore grouping instead of millions/billions.", ok: true },
    { icon: AudioLines, title: "Audio statements", body: "Compose a spoken financial summary and play it back.", ok: SPEECH_OUT },
  ];
  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1">Voice-first finance, honestly scoped</h2>
        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          Everything here works <strong className="text-[var(--color-text)]">today, in your browser</strong> — no cloud speech service required.
          Each tool feature-detects the underlying API and falls back to typing when it is unavailable.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {capabilities.map(c => (
          <div key={c.title} className={`${CARD} p-4`}>
            <div className="flex items-center justify-between mb-1.5">
              <c.icon size={16} className="text-[var(--color-primary)]" />
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${c.ok ? "bg-green-950/30 text-green-400 border-green-800/40" : "bg-yellow-950/30 text-yellow-400 border-yellow-800/40"}`}>
                {c.ok ? "Available" : "Fallback only"}
              </span>
            </div>
            <p className="text-sm font-semibold">{c.title}</p>
            <p className="text-[11px] text-[var(--color-muted)] mt-1 leading-relaxed">{c.body}</p>
          </div>
        ))}
      </div>

      <FallbackNote>
        Voice quality depends entirely on your device and browser. Web Speech recognition works best in Chrome/Edge on desktop and Android WebViews;
        Safari/iOS support is partial. Accent and vernacular accuracy vary by the OS speech engine installed — when recognition is unavailable, every tool here accepts typed input instead.
      </FallbackNote>
    </div>
  );
}

// ── Tool 1 · Voice note → entry capture ──────────────────────────────────────────
type DraftTxn = { direction: "in" | "out"; amount: number; party: string; raw: string };

function parseEntry(text: string): DraftTxn | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  // grab the first number (allow commas / decimals)
  const numMatch = t.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!numMatch) return null;
  const amount = parseFloat(numMatch[1].replace(/,/g, ""));
  if (!amount || isNaN(amount)) return null;
  const inWords = /\b(received|receive|got|collected|credit|credited|deposit|sale|sold)\b/;
  const direction: "in" | "out" = inWords.test(t) ? "in" : "out";
  // party: text after "from" / "to" / "for", else the trailing words
  const partyMatch = t.match(/\b(?:from|to|for|paid)\s+([a-z][a-z\s.&'-]{1,40})/);
  let party = partyMatch ? partyMatch[1].trim() : "";
  party = party.replace(/\b(rupees?|rs|inr|today|yesterday|by upi|cash|cheque)\b/g, "").trim();
  party = party.replace(/\s{2,}/g, " ");
  return { direction, amount, party: party ? party.replace(/\b\w/g, c => c.toUpperCase()) : "Unknown party", raw: text.trim() };
}

// store-side transaction category union (matches data/types Transaction.category
// and the AddTransactionModal save path on the Dashboard).
type LedgerCategory = "revenue" | "expense" | "payroll" | "loan" | "tax" | "transfer";
const LEDGER_CATEGORIES: LedgerCategory[] = ["revenue", "expense", "payroll", "loan", "tax", "transfer"];

// Map an EXPENSE_CATEGORIES-style hint to one of the store's ledger categories.
function suggestLedgerCategory(direction: "in" | "out", raw: string): LedgerCategory {
  if (direction === "in") return "revenue";
  const t = raw.toLowerCase();
  if (/\b(salary|salaries|wages|labour|labor|staff|worker|payroll)\b/.test(t)) return "payroll";
  if (/\b(tax|gst|tds|cess|duty)\b/.test(t)) return "tax";
  if (/\b(loan|emi|repayment|interest|instal?ment)\b/.test(t)) return "loan";
  if (/\b(transfer|moved|move to|own account|self)\b/.test(t)) return "transfer";
  return "expense";
}

function VoiceCapture() {
  const { store, addTransaction, isReadOnly } = useApp();
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const draft = useMemo(() => parseEntry(text), [text]);

  // Editable confirm fields, seeded from the parse and resettable when the draft changes.
  const [category, setCategory] = useState<LedgerCategory>("expense");
  const [party, setParty] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [posting, setPosting] = useState(false);
  const seedKey = draft ? `${draft.direction}|${draft.amount}|${draft.party}|${draft.raw}` : "";
  const lastSeed = useRef<string>("");
  useEffect(() => {
    if (draft && seedKey !== lastSeed.current) {
      lastSeed.current = seedKey;
      setCategory(suggestLedgerCategory(draft.direction, draft.raw));
      setParty(draft.party === "Unknown party" ? "" : draft.party);
      setDate(new Date().toISOString().split("T")[0]);
    }
  }, [draft, seedKey]);

  // Known parties already in the store (transactions + invoices + orders) for matching.
  const knownParties = useMemo(() => {
    const set = new Set<string>();
    for (const t of store.transactions ?? []) if (t.counterparty?.trim()) set.add(t.counterparty.trim());
    for (const inv of store.invoices ?? []) if (inv.customer?.trim()) set.add(inv.customer.trim());
    for (const o of store.orders ?? []) if (o.buyerName?.trim()) set.add(o.buyerName.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [store.transactions, store.invoices, store.orders]);

  // Case-insensitive match of the parsed/typed party against the known list.
  const matchedParty = useMemo(() => {
    const p = party.trim().toLowerCase();
    if (!p) return null;
    return knownParties.find(k => k.toLowerCase() === p)
      ?? knownParties.find(k => k.toLowerCase().includes(p) || p.includes(k.toLowerCase()))
      ?? null;
  }, [party, knownParties]);

  const toggleListen = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { toast.error("Speech recognition not supported — type the line instead"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let out = "";
      for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript;
      setText(out);
    };
    rec.onerror = (e) => { toast.error(`Mic error: ${e.error ?? "unknown"}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  useEffect(() => () => { recRef.current?.stop(); }, []);

  const post = () => {
    if (!draft) return;
    if (isReadOnly) { toast.error("Read-only view — switch to your own books to post entries"); return; }
    setPosting(true);
    try {
      // Prefer an existing known party (so the new entry reconciles against the
      // same counterparty already on file); else use what the owner typed.
      const counterparty = matchedParty ?? party.trim();
      // Same shape AddTransactionModal hands to store.addTransaction on the Dashboard.
      const defaultAccount = (store.bankAccounts ?? [])[0]?.id ?? "";
      addTransaction({
        id: generateId(),
        date,
        amount: draft.direction === "in" ? Math.abs(draft.amount) : -Math.abs(draft.amount),
        description: draft.raw,
        category,
        counterparty,
        isRecurring: false,
        bankAccountId: defaultAccount,
      });
      toast.success(`Posted ${formatCurrency(draft.amount)} ${draft.direction === "in" ? "in" : "out"}${counterparty ? ` · ${counterparty}` : ""} to the ledger`);
      setText("");
      lastSeed.current = "";
    } catch (err) {
      toast.error(`Couldn't post entry${err instanceof Error ? `: ${err.message}` : ""} — it stays here so you don't lose it`);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Mic size={14} className="text-[var(--color-primary)]" /> Voice note → transaction draft</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Say or type a line like <em className="text-[var(--color-text)]">&ldquo;received 5000 from Sharma&rdquo;</em> or <em className="text-[var(--color-text)]">&ldquo;paid 1200 to electricity&rdquo;</em>. We parse it into a draft you can review and post straight to your ledger.
        </p>
        {!SPEECH_IN && <FallbackNote>Microphone dictation isn&apos;t available in this browser. Type the line in the box below — parsing works exactly the same.</FallbackNote>}
        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} placeholder="received 5000 from Sharma" className={INP} />
          <button onClick={toggleListen} disabled={!SPEECH_IN}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap disabled:opacity-40 ${listening ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-[var(--color-primary)] text-[var(--color-bg)]"}`}>
            {listening ? <><Square size={13} /> Stop</> : <><Mic size={13} /> Speak</>}
          </button>
        </div>
        {listening && <p className="text-[11px] text-[var(--color-primary)] animate-pulse">Listening… speak now.</p>}
      </div>

      {text.trim() && (
        <div className={`${CARD} p-5`}>
          <p className="text-sm font-semibold mb-3">Confirm &amp; post</p>
          {draft ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                  <p className="text-[10px] text-[var(--color-muted)] mb-1">Direction</p>
                  <p className={`text-base font-bold tabular-nums ${draft.direction === "in" ? "text-green-400" : "text-red-400"}`}>{draft.direction === "in" ? "Money in" : "Money out"}</p>
                </div>
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                  <p className="text-[10px] text-[var(--color-muted)] mb-1">Amount</p>
                  <p className="text-base font-bold tabular-nums text-[var(--color-text)]">{formatCurrency(draft.amount)}</p>
                </div>
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                  <p className="text-[10px] text-[var(--color-muted)] mb-1">Date</p>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full bg-transparent text-sm font-bold tabular-nums text-[var(--color-text)] outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                  <p className="text-[10px] text-[var(--color-muted)] mb-1">Party</p>
                  <input value={party} onChange={e => setParty(e.target.value)} list="voice-known-parties" placeholder="Unknown party"
                    className="w-full bg-transparent text-sm font-semibold text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]" />
                  <datalist id="voice-known-parties">
                    {knownParties.map(k => <option key={k} value={k} />)}
                  </datalist>
                  {matchedParty && matchedParty.toLowerCase() !== party.trim().toLowerCase() && (
                    <button type="button" onClick={() => setParty(matchedParty)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[var(--color-primary)] hover:underline">
                      <CheckCircle2 size={11} /> Match existing: {matchedParty}
                    </button>
                  )}
                  {matchedParty && matchedParty.toLowerCase() === party.trim().toLowerCase() && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-green-400">
                      <CheckCircle2 size={11} /> Known counterparty
                    </p>
                  )}
                </div>
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                  <p className="text-[10px] text-[var(--color-muted)] mb-1">Category</p>
                  <select value={category} onChange={e => setCategory(e.target.value as LedgerCategory)}
                    className="w-full bg-transparent text-sm font-semibold text-[var(--color-text)] outline-none capitalize">
                    {LEDGER_CATEGORIES.map(c => <option key={c} value={c} className="bg-[var(--color-surface)]">{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button onClick={post} disabled={posting || isReadOnly}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--color-primary)] text-[var(--color-bg)] disabled:opacity-50">
                  <CheckCircle2 size={14} /> {posting ? "Posting…" : "Post to ledger"}
                </button>
                <button onClick={() => { setText(""); lastSeed.current = ""; }} disabled={posting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-50">
                  <X size={13} /> Discard
                </button>
              </div>
              <p className="text-[11px] text-[var(--color-muted)] mt-2">
                Posts a real transaction to your ledger via the same path as the Dashboard — it appears instantly in <strong className="text-[var(--color-text)]">Transactions</strong>.
                {isReadOnly && " Posting is disabled in this read-only client view."}
                {store.transactions.length > 0 && ` You currently have ${store.transactions.length} recorded transaction(s).`}
              </p>
            </>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">Couldn&apos;t find an amount. Include a number, e.g. &ldquo;paid <strong>2500</strong> to vendor&rdquo;.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tool 2 · Language preference ──────────────────────────────────────────────────
function LanguagePreference() {
  const [lang, setLang] = useFeatureState<string>("voice-language", "Hindi");
  const selected = LANGUAGES.find(l => l.name === lang) ?? LANGUAGES[5];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Languages size={14} className="text-[var(--color-primary)]" /> Preferred language</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Pick the language Headroom should prefer for voice prompts and read-aloud. We pass the matching locale ({selected.bcp47}) to the speech engine; actual coverage depends on the voices installed on your device.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {LANGUAGES.map(l => (
            <button key={l.name} onClick={() => { setLang(l.name); toast.success(`Language set to ${l.name}`); }}
              className={`text-xs px-3 py-2 rounded-lg border transition-colors text-left ${lang === l.name ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/40"}`}>
              {l.name}
              <span className="block text-[9px] opacity-60">{l.bcp47}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={`${CARD} p-4 flex items-center justify-between gap-3`}>
        <p className="text-sm">Test voice in <strong>{selected.name}</strong></p>
        <button onClick={() => { if (!speak(`This is a sample in ${selected.name}.`, selected.bcp47)) toast.error("Text-to-speech not supported here"); }}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-1.5 rounded-lg">
          <Play size={12} /> Play sample
        </button>
      </div>
      {!SPEECH_OUT && <FallbackNote>Text-to-speech isn&apos;t available, so the language choice only affects on-screen labels for now. It is saved and synced across your devices.</FallbackNote>}
    </div>
  );
}

// ── Tool 3 · Text-to-speech reader ────────────────────────────────────────────────
function SummaryReader() {
  const { store } = useApp();
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const [rate, setRate] = useState(1);
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";

  const summary = useMemo(() => {
    const txns = store.transactions ?? [];
    const inflow = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const outflow = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const net = inflow - outflow;
    return {
      inflow, outflow, net, count: txns.length,
      script: `Here is your financial summary. Total money in is ${lakhCrore(inflow)} rupees. Total money out is ${lakhCrore(outflow)} rupees. Your net position is ${net >= 0 ? "a surplus" : "a shortfall"} of ${lakhCrore(Math.abs(net))} rupees, across ${txns.length} transactions.`,
    };
  }, [store.transactions]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Volume2 size={14} className="text-[var(--color-primary)]" /> Read my summary aloud</h2>
        <p className="text-xs text-[var(--color-muted)]">A spoken walkthrough of your live cash position, useful when you can&apos;t look at a screen.</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Money in", value: formatCurrency(summary.inflow), color: "text-green-400" },
            { label: "Money out", value: formatCurrency(summary.outflow), color: "text-red-400" },
            { label: "Net", value: formatCurrency(summary.net), color: summary.net >= 0 ? "text-green-400" : "text-red-400" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)]">Speech rate: <strong className="text-[var(--color-text)]">{rate.toFixed(1)}x</strong></label>
          <input type="range" min={0.5} max={1.5} step={0.1} value={rate} onChange={e => setRate(Number(e.target.value))} className="w-full mt-1 accent-[var(--color-primary)]" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => { if (!speak(summary.script, bcp47, rate)) toast.error("Text-to-speech not supported here"); }} disabled={!SPEECH_OUT}
            className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium disabled:opacity-40">
            <Play size={13} /> Read aloud
          </button>
          <button onClick={() => { if (SPEECH_OUT) window.speechSynthesis.cancel(); }} disabled={!SPEECH_OUT}
            className="flex items-center gap-1.5 text-sm border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg disabled:opacity-40">
            <Square size={13} /> Stop
          </button>
        </div>
        {!SPEECH_OUT && <FallbackNote>Text-to-speech isn&apos;t available — the script is shown below so a screen reader can read it instead.</FallbackNote>}
        <p className="text-[11px] text-[var(--color-muted)] italic border-t border-[var(--color-border)] pt-2">&ldquo;{summary.script}&rdquo;</p>
      </div>
    </div>
  );
}

// ── Tool 4 · Voice-command cheat-sheet ────────────────────────────────────────────
function CommandCheatSheet() {
  const groups: { title: string; phrases: { say: string; does: string }[] }[] = [
    {
      title: "Capture entries", phrases: [
        { say: "received 5000 from Sharma", does: "Drafts a money-in entry" },
        { say: "paid 1200 to electricity", does: "Drafts a money-out entry" },
        { say: "sold 30 bags cement for 9000", does: "Drafts a sale" },
      ],
    },
    {
      title: "Ask questions", phrases: [
        { say: "what is my balance", does: "Reads cash position aloud" },
        { say: "how much does Ramesh owe", does: "Reads outstanding for a party" },
        { say: "read my summary", does: "Plays the spoken P&L summary" },
      ],
    },
    {
      title: "Navigate & control", phrases: [
        { say: "set language to Tamil", does: "Switches preferred language" },
        { say: "turn on large text", does: "Enables accessibility mode" },
        { say: "stop", does: "Stops listening / reading" },
      ],
    },
  ];
  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><BookOpen size={14} className="text-[var(--color-primary)]" /> Supported phrases</h2>
        <p className="text-xs text-[var(--color-muted)] mt-1">A reference of phrasings the parser understands. Phrasing is flexible — these are examples, not exact commands.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {groups.map(g => (
          <div key={g.title} className={`${CARD} p-4`}>
            <p className="text-sm font-semibold mb-3">{g.title}</p>
            <div className="space-y-2.5">
              {g.phrases.map(p => (
                <div key={p.say} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2.5">
                  <p className="text-xs font-medium text-[var(--color-primary)]">&ldquo;{p.say}&rdquo;</p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{p.does}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tool 5 · Accessibility settings ───────────────────────────────────────────────
function AccessibilitySettings() {
  const [largeText, setLargeText] = useFeatureState<boolean>("voice-a11y-large-text", false);
  const [highContrast, setHighContrast] = useFeatureState<boolean>("voice-a11y-high-contrast", false);

  const previewStyle: React.CSSProperties = {
    fontSize: largeText ? "1.25rem" : "0.875rem",
    background: highContrast ? "#000" : "var(--color-bg)",
    color: highContrast ? "#fff" : "var(--color-text)",
    border: highContrast ? "2px solid #fff" : "1px solid var(--color-border)",
  };

  const toggles: { label: string; desc: string; value: boolean; set: (v: boolean) => void }[] = [
    { label: "Large text", desc: "Increase font size for easier reading", value: largeText, set: setLargeText },
    { label: "High contrast", desc: "Black background, white text, bold borders", value: highContrast, set: setHighContrast },
  ];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Eye size={14} className="text-[var(--color-primary)]" /> Accessibility</h2>
        <p className="text-xs text-[var(--color-muted)]">Preferences are saved and synced. The preview below applies them live; app-wide rollout is wired separately.</p>
        {toggles.map(t => (
          <label key={t.label} className="flex items-center justify-between gap-3 py-2 border-b border-[var(--color-border)] last:border-0 cursor-pointer">
            <div>
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-[11px] text-[var(--color-muted)]">{t.desc}</p>
            </div>
            <input type="checkbox" checked={t.value} onChange={e => t.set(e.target.checked)} className="accent-[var(--color-primary)] w-4 h-4" />
          </label>
        ))}
      </div>
      <div className={`${CARD} p-4`}>
        <p className="text-xs text-[var(--color-muted)] mb-2">Live preview</p>
        <div style={previewStyle} className="rounded-lg p-4 transition-all">
          <p className="font-bold">Net cash position</p>
          <p className="tabular-nums">{formatCurrency(247500)} this month</p>
          <p style={{ fontSize: largeText ? "1rem" : "0.75rem" }} className="mt-1 opacity-80">Sample text rendered with your current settings.</p>
        </div>
      </div>
    </div>
  );
}

// ── Tool 6 · Vernacular number formatting ─────────────────────────────────────────
function VernacularNumbers() {
  const [indian, setIndian] = useFeatureState<boolean>("voice-number-indian", true);
  const [raw, setRaw] = useState("1234567");
  const n = parseFloat(raw.replace(/,/g, "")) || 0;

  const samples = [125000, 1234567, 25000000, 100000000];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Hash size={14} className="text-[var(--color-primary)]" /> Number formatting</h2>
        <p className="text-xs text-[var(--color-muted)]">Display amounts the way Indians actually read them — lakh and crore with 2-digit grouping — or switch to the international system.</p>
        <div className="flex gap-2">
          {([["indian", "Indian (lakh / crore)"], ["intl", "International (million / billion)"]] as const).map(([id, label]) => {
            const on = (id === "indian") === indian;
            return (
              <button key={id} onClick={() => setIndian(id === "indian")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${on ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                {label}
              </button>
            );
          })}
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Enter an amount</label>
          <input value={raw} onChange={e => setRaw(e.target.value)} className={INP} placeholder="1234567" />
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-[10px] text-[var(--color-muted)] mb-1">Formatted</p>
          <p className="text-2xl font-bold tabular-nums">{indian ? `₹${formatIndianGrouping(n)}` : n.toLocaleString("en-US")}</p>
          <p className="text-xs text-[var(--color-primary)] mt-1">{indian ? lakhCrore(n) : `${(n / 1e6).toFixed(2)} million`}</p>
        </div>
      </div>
      <div className={`${CARD} p-4`}>
        <p className="text-sm font-semibold mb-2">Side-by-side</p>
        <table className="w-full text-sm">
          <thead><tr>{["Raw", "Indian", "International"].map(h => <th key={h} className="text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider pb-2">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {samples.map(s => (
              <tr key={s}>
                <td className="py-2 tabular-nums text-[var(--color-muted)]">{s}</td>
                <td className="py-2 tabular-nums">₹{formatIndianGrouping(s)} <span className="text-[10px] text-[var(--color-primary)]">({lakhCrore(s)})</span></td>
                <td className="py-2 tabular-nums">{s.toLocaleString("en-US")} <span className="text-[10px] text-[var(--color-muted)]">({(s / 1e6).toFixed(1)}M)</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tool 7 · Audio statement builder ──────────────────────────────────────────────
type ScriptLine = { id: string; text: string };
function AudioStatementBuilder() {
  const { store } = useApp();
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";
  const [lines, setLines] = useFeatureState<ScriptLine[]>("voice-audio-statement", []);
  const [draft, setDraft] = useState("");

  const inflow = (store.transactions ?? []).filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outflow = (store.transactions ?? []).filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const suggestions = [
    `This statement covers ${(store.transactions ?? []).length} transactions.`,
    `Total revenue recorded is ${lakhCrore(inflow)} rupees.`,
    `Total expenses recorded is ${lakhCrore(outflow)} rupees.`,
    `The closing net position is ${lakhCrore(inflow - outflow)} rupees.`,
  ];

  const add = (text: string) => {
    if (!text.trim()) return;
    setLines([...lines, { id: crypto.randomUUID(), text: text.trim() }]);
    setDraft("");
  };
  const fullScript = lines.map(l => l.text).join(" ");

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><AudioLines size={14} className="text-[var(--color-primary)]" /> Audio statement builder</h2>
        <p className="text-xs text-[var(--color-muted)]">Compose a spoken-summary script line by line, then play the whole thing back as one narration.</p>
        <div className="flex gap-2">
          <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(draft); }} placeholder="Add a line to narrate…" className={INP} />
          <button onClick={() => add(draft)} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg text-sm font-medium"><Plus size={13} /> Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map(s => (
            <button key={s} onClick={() => add(s)} className="text-[10px] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/40">+ {s.length > 40 ? s.slice(0, 40) + "…" : s}</button>
          ))}
        </div>
      </div>

      {lines.length > 0 && (
        <div className={`${CARD} p-4 space-y-2`}>
          {lines.map((l, i) => (
            <div key={l.id} className="flex items-center gap-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
              <span className="text-[10px] text-[var(--color-muted)] tabular-nums w-5">{i + 1}.</span>
              <span className="flex-1">{l.text}</span>
              <button onClick={() => setLines(lines.filter(x => x.id !== l.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button onClick={() => { if (!speak(fullScript, bcp47)) toast.error("Text-to-speech not supported here"); }} disabled={!SPEECH_OUT}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium disabled:opacity-40"><Play size={13} /> Play statement</button>
            <button onClick={() => { if (SPEECH_OUT) window.speechSynthesis.cancel(); }} disabled={!SPEECH_OUT}
              className="flex items-center gap-1.5 text-sm border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg disabled:opacity-40"><Square size={13} /> Stop</button>
          </div>
          {!SPEECH_OUT && <FallbackNote>Playback needs text-to-speech support. The full script is assembled above so it can be copied or read by a screen reader.</FallbackNote>}
        </div>
      )}
    </div>
  );
}

// ── Tool 8 · Voice-auth setup (stub) ──────────────────────────────────────────────
async function hashPhrase(s: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  return btoa(unescape(encodeURIComponent(s))); // weak fallback
}

function VoiceAuthSetup() {
  const [stored, setStored] = useFeatureState<string | null>("voice-auth-hash", null);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const p = phrase.trim().toLowerCase();
    if (p.length < 6) { toast.error("Use a passphrase of at least 6 characters"); return; }
    setBusy(true);
    const h = await hashPhrase(p);
    setStored(h);
    setPhrase("");
    setBusy(false);
    toast.success("Passphrase enrolled (hash stored locally)");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Fingerprint size={14} className="text-[var(--color-primary)]" /> Voice-auth setup</h2>
        <FallbackNote>
          Setup stub only. This captures a spoken/typed passphrase and stores a one-way SHA-256 hash — it does <strong>not</strong> perform real voiceprint biometrics or gate any action yet. True voice-liveness auth needs a server-side model.
        </FallbackNote>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Passphrase</label>
          <input type="password" value={phrase} onChange={e => setPhrase(e.target.value)} placeholder="e.g. open my books" className={INP} />
        </div>
        <button onClick={save} disabled={busy} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          <CheckCircle2 size={13} /> {busy ? "Enrolling…" : stored ? "Re-enroll passphrase" : "Enroll passphrase"}
        </button>
        {stored && (
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-[11px] text-[var(--color-muted)] break-all">
            <p className="mb-1 text-[var(--color-text)] font-medium flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-400" /> Enrolled — stored hash:</p>
            <code>{stored.slice(0, 48)}…</code>
            <button onClick={() => { setStored(null); toast.success("Passphrase cleared"); }} className="block mt-2 text-red-400 hover:underline">Clear enrollment</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool 9 · Dictation scratchpad ─────────────────────────────────────────────────
function DictationScratchpad() {
  const [notes, setNotes] = useFeatureState<string>("voice-scratchpad", "");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";

  const toggleListen = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { toast.error("Speech recognition not supported — type your notes"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = bcp47;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let finalChunk = "";
      for (let i = 0; i < e.results.length; i++) if (e.results[i].isFinal) finalChunk += e.results[i][0].transcript + " ";
      if (finalChunk) setNotes(prev => (prev ? prev + " " : "") + finalChunk.trim());
    };
    rec.onerror = (e) => { toast.error(`Mic error: ${e.error ?? "unknown"}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  useEffect(() => () => { recRef.current?.stop(); }, []);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><NotebookPen size={14} className="text-[var(--color-primary)]" /> Dictation scratchpad</h2>
        <p className="text-xs text-[var(--color-muted)]">Speak freely and your words append to the notes below. Notes are saved and synced. Works for vendor memos, to-dos, anything.</p>
        {!SPEECH_IN && <FallbackNote>Dictation isn&apos;t available in this browser — type directly into the notes field.</FallbackNote>}
        <div className="flex gap-2">
          <button onClick={toggleListen} disabled={!SPEECH_IN}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40 ${listening ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-[var(--color-primary)] text-[var(--color-bg)]"}`}>
            {listening ? <><Square size={13} /> Stop dictation</> : <><Mic size={13} /> Start dictation</>}
          </button>
          <button onClick={() => { navigator.clipboard?.writeText(notes); toast.success("Notes copied"); }} disabled={!notes}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-[var(--color-border)] text-[var(--color-muted)] disabled:opacity-40"><Copy size={13} /> Copy</button>
          <button onClick={() => setNotes("")} disabled={!notes}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-[var(--color-border)] text-[var(--color-muted)] disabled:opacity-40"><Trash2 size={13} /> Clear</button>
        </div>
        {listening && <p className="text-[11px] text-[var(--color-primary)] animate-pulse">Listening… speak in {lang}.</p>}
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={8} placeholder="Your dictated notes appear here…"
          className={`${INP} resize-y leading-relaxed`} />
        <p className="text-[10px] text-[var(--color-muted)]">{notes.trim() ? `${notes.trim().split(/\s+/).length} words` : "Empty"}</p>
      </div>
    </div>
  );
}

// ── Tool 10 · Voice expense logger ────────────────────────────────────────────────
// Parses a multi-item utterance like "paid 200 for tea, 1500 diesel" into draft lines.
const EXPENSE_CATEGORIES: { key: string; words: string[] }[] = [
  { key: "Travel & Fuel", words: ["diesel", "petrol", "fuel", "auto", "taxi", "cab", "uber", "ola", "travel", "bus", "train"] },
  { key: "Food & Refreshments", words: ["tea", "chai", "coffee", "snack", "lunch", "food", "tiffin", "water", "biscuit"] },
  { key: "Utilities", words: ["electricity", "bill", "water bill", "internet", "wifi", "mobile", "recharge", "phone"] },
  { key: "Rent", words: ["rent", "lease"] },
  { key: "Salaries & Wages", words: ["salary", "wages", "labour", "labor", "staff", "worker"] },
  { key: "Supplies & Stationery", words: ["paper", "stationery", "pen", "printer", "cartridge", "supplies", "packing"] },
  { key: "Maintenance", words: ["repair", "maintenance", "cleaning", "service"] },
];
function categorise(text: string): string {
  const t = text.toLowerCase();
  for (const c of EXPENSE_CATEGORIES) if (c.words.some(w => t.includes(w))) return c.key;
  return "Uncategorised";
}
type ExpenseDraft = { id: string; amount: number; label: string; category: string };
function parseExpenses(text: string): ExpenseDraft[] {
  if (!text.trim()) return [];
  // split into clauses on commas / "and" / semicolons; each clause may hold one amount
  const clauses = text.split(/\s*(?:,|;|\band\b)\s*/i).map(c => c.trim()).filter(Boolean);
  const out: ExpenseDraft[] = [];
  for (const c of clauses) {
    const m = c.match(/(\d[\d,]*(?:\.\d+)?)/);
    if (!m) continue;
    const amount = parseFloat(m[1].replace(/,/g, ""));
    if (!amount || isNaN(amount)) continue;
    const label = c.replace(/(\d[\d,]*(?:\.\d+)?)/, "")
      .replace(/\b(paid|spent|for|rupees?|rs|inr|on)\b/gi, "")
      .replace(/\s{2,}/g, " ").trim() || "Expense";
    out.push({ id: crypto.randomUUID(), amount, label: label.replace(/\b\w/g, ch => ch.toUpperCase()), category: categorise(c) });
  }
  return out;
}

function VoiceExpenseLogger() {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const drafts = useMemo(() => parseExpenses(text), [text]);
  const total = drafts.reduce((s, d) => s + d.amount, 0);

  const toggleListen = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { toast.error("Speech recognition not supported — type the expenses instead"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = "en-IN"; rec.continuous = false; rec.interimResults = true;
    rec.onresult = (e) => { let out = ""; for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript; setText(out); };
    rec.onerror = (e) => { toast.error(`Mic error: ${e.error ?? "unknown"}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };
  useEffect(() => () => { recRef.current?.stop(); }, []);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> Voice expense logger</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Rattle off petty cash in one breath — <em className="text-[var(--color-text)]">&ldquo;paid 200 for tea, 1500 diesel, 300 packing&rdquo;</em> — and each item is split out and auto-categorised into a draft.
        </p>
        {!SPEECH_IN && <FallbackNote>Microphone dictation isn&apos;t available here. Type the items below — splitting and categorising work identically.</FallbackNote>}
        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} placeholder="200 tea, 1500 diesel, 300 packing" className={INP} />
          <button onClick={toggleListen} disabled={!SPEECH_IN}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap disabled:opacity-40 ${listening ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-[var(--color-primary)] text-[var(--color-bg)]"}`}>
            {listening ? <><Square size={13} /> Stop</> : <><Mic size={13} /> Speak</>}
          </button>
        </div>
        {listening && <p className="text-[11px] text-[var(--color-primary)] animate-pulse">Listening… speak now.</p>}
      </div>

      {drafts.length > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">{drafts.length} expense draft{drafts.length > 1 ? "s" : ""}</p>
            <p className="text-sm font-bold tabular-nums">{formatCurrency(total)}</p>
          </div>
          <div className="space-y-2">
            {drafts.map(d => (
              <div key={d.id} className="flex items-center gap-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">{d.label}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30">{d.category}</span>
                </div>
                <p className="text-sm font-bold tabular-nums text-red-400">{formatCurrency(d.amount)}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">Preview only — not posted. Confirm and save these against the right ledger in <strong className="text-[var(--color-text)]">Transactions</strong>.</p>
        </div>
      )}
    </div>
  );
}

// ── Tool 11 · Spoken invoice creator ──────────────────────────────────────────────
type InvoiceDraft = { customer: string; amount: number; description: string };
function parseInvoice(text: string): InvoiceDraft | null {
  const t = text.trim();
  if (!t) return null;
  const numMatch = t.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!numMatch) return null;
  const amount = parseFloat(numMatch[1].replace(/,/g, ""));
  if (!amount || isNaN(amount)) return null;
  // customer: word(s) after "invoice"/"bill" and before the number or "for"
  const custMatch = t.match(/\b(?:invoice|bill)\s+([a-zA-Z][a-zA-Z\s.&'-]{1,40}?)(?=\s+\d|\s+for\b|$)/i);
  let customer = custMatch ? custMatch[1].trim() : "";
  // description: text after "for"
  const descMatch = t.match(/\bfor\s+([a-zA-Z][a-zA-Z\s.&'-]{1,60})/i);
  const description = descMatch ? descMatch[1].replace(/\b(rupees?|rs|inr)\b/gi, "").trim() : "Services rendered";
  customer = customer.replace(/\b(rupees?|rs|inr)\b/gi, "").replace(/\s{2,}/g, " ").trim();
  return {
    customer: customer ? customer.replace(/\b\w/g, c => c.toUpperCase()) : "Unnamed customer",
    amount,
    description: description ? description.replace(/\b\w/g, c => c.toUpperCase()) : "Services rendered",
  };
}

function SpokenInvoiceCreator() {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const draft = useMemo(() => parseInvoice(text), [text]);
  const gst = draft ? draft.amount * 0.18 : 0;

  const toggleListen = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { toast.error("Speech recognition not supported — type the line instead"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = "en-IN"; rec.continuous = false; rec.interimResults = true;
    rec.onresult = (e) => { let out = ""; for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript; setText(out); };
    rec.onerror = (e) => { toast.error(`Mic error: ${e.error ?? "unknown"}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };
  useEffect(() => () => { recRef.current?.stop(); }, []);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> Spoken invoice creator</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Say <em className="text-[var(--color-text)]">&ldquo;invoice Sharma 5000 for consulting&rdquo;</em> and we draft the invoice header, amount, and an indicative 18% GST line.
        </p>
        {!SPEECH_IN && <FallbackNote>Dictation isn&apos;t available — type the invoice line; parsing is identical.</FallbackNote>}
        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} placeholder="invoice Sharma 5000 for consulting" className={INP} />
          <button onClick={toggleListen} disabled={!SPEECH_IN}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap disabled:opacity-40 ${listening ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-[var(--color-primary)] text-[var(--color-bg)]"}`}>
            {listening ? <><Square size={13} /> Stop</> : <><Mic size={13} /> Speak</>}
          </button>
        </div>
        {listening && <p className="text-[11px] text-[var(--color-primary)] animate-pulse">Listening… speak now.</p>}
      </div>

      {text.trim() && (
        <div className={`${CARD} p-5`}>
          {draft ? (
            <>
              <div className="flex items-start justify-between border-b border-[var(--color-border)] pb-3 mb-3">
                <div>
                  <p className="text-[10px] text-[var(--color-muted)]">Bill to</p>
                  <p className="text-base font-bold">{draft.customer}</p>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">{draft.description}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-950/30 text-yellow-400 border border-yellow-800/40">Draft</span>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Taxable value</span><span className="tabular-nums">{formatCurrency(draft.amount)}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">GST @ 18% (indicative)</span><span className="tabular-nums">{formatCurrency(gst)}</span></div>
                <div className="flex justify-between font-bold border-t border-[var(--color-border)] pt-1.5 mt-1.5"><span>Total</span><span className="tabular-nums text-[var(--color-primary)]">{formatCurrency(draft.amount + gst)}</span></div>
              </div>
              <p className="text-[11px] text-[var(--color-muted)] mt-3">Preview only. Rate, HSN, and place-of-supply are placeholders — finalise and issue from <strong className="text-[var(--color-text)]">Invoices</strong>.</p>
            </>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">Couldn&apos;t find an amount. Try &ldquo;invoice <strong>Ramesh 8000</strong> for repairs&rdquo;.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tool 12 · Voice transaction search ────────────────────────────────────────────
function VoiceTransactionSearch() {
  const { store } = useApp();
  const [query, setQuery] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const results = useMemo(() => {
    const txns = store.transactions ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return txns.slice(0, 20);
    // pull an optional "above/over N" / "below/under N" amount filter
    const aboveM = q.match(/\b(?:above|over|more than|greater than)\s+(\d[\d,]*)/);
    const belowM = q.match(/\b(?:below|under|less than)\s+(\d[\d,]*)/);
    const above = aboveM ? parseFloat(aboveM[1].replace(/,/g, "")) : null;
    const below = belowM ? parseFloat(belowM[1].replace(/,/g, "")) : null;
    const wantIn = /\b(received|credit|money in|inflow|sale|sales)\b/.test(q);
    const wantOut = /\b(paid|debit|money out|expense|outflow|spent)\b/.test(q);
    // remaining text → free-text term match against description/category
    const terms = q.replace(/\b(above|over|more than|greater than|below|under|less than|received|credit|money|in|out|inflow|outflow|sale|sales|paid|debit|expense|spent|than|the)\b/g, "")
      .replace(/\d[\d,]*/g, "").trim().split(/\s+/).filter(w => w.length > 1);
    return txns.filter(t => {
      const abs = Math.abs(t.amount);
      if (above !== null && abs < above) return false;
      if (below !== null && abs > below) return false;
      if (wantIn && t.amount <= 0) return false;
      if (wantOut && t.amount >= 0) return false;
      if (terms.length) {
        const hay = `${t.description ?? ""} ${t.category ?? ""}`.toLowerCase();
        if (!terms.some(term => hay.includes(term))) return false;
      }
      return true;
    }).slice(0, 50);
  }, [query, store.transactions]);

  const toggleListen = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { toast.error("Speech recognition not supported — type your query"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = "en-IN"; rec.continuous = false; rec.interimResults = true;
    rec.onresult = (e) => { let out = ""; for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript; setQuery(out); };
    rec.onerror = (e) => { toast.error(`Mic error: ${e.error ?? "unknown"}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };
  useEffect(() => () => { recRef.current?.stop(); }, []);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Search size={14} className="text-[var(--color-primary)]" /> Voice search across your books</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Speak or type a query like <em className="text-[var(--color-text)]">&ldquo;cash sales above 5000&rdquo;</em> or <em className="text-[var(--color-text)]">&ldquo;rent paid&rdquo;</em>. We filter your live transactions by direction, amount, and keywords.
        </p>
        {!SPEECH_IN && <FallbackNote>Voice query isn&apos;t available — type your filter; it works the same.</FallbackNote>}
        <div className="flex gap-2">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="sales above 5000" className={INP} />
          <button onClick={toggleListen} disabled={!SPEECH_IN}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap disabled:opacity-40 ${listening ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-[var(--color-primary)] text-[var(--color-bg)]"}`}>
            {listening ? <><Square size={13} /> Stop</> : <><Mic size={13} /> Speak</>}
          </button>
        </div>
        {listening && <p className="text-[11px] text-[var(--color-primary)] animate-pulse">Listening… speak now.</p>}
      </div>

      <div className={`${CARD} p-4`}>
        <p className="text-xs text-[var(--color-muted)] mb-3">{results.length} match{results.length === 1 ? "" : "es"}{query.trim() ? "" : " (showing recent)"}</p>
        {results.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No transactions match. Try a broader query, or check you have transactions recorded.</p>
        ) : (
          <div className="space-y-1.5">
            {results.map(t => (
              <div key={t.id} className="flex items-center gap-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.description || "(no description)"}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{t.category || "Uncategorised"}{t.date ? ` · ${t.date}` : ""}</p>
                </div>
                <p className={`text-sm font-bold tabular-nums ${t.amount >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(t.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool 13 · Multilingual UI language preview ────────────────────────────────────
// Sample interface strings translated for a handful of widely-spoken languages.
const UI_STRINGS: { key: string; en: string }[] = [
  { key: "dashboard", en: "Dashboard" },
  { key: "money_in", en: "Money in" },
  { key: "money_out", en: "Money out" },
  { key: "new_invoice", en: "New invoice" },
  { key: "pending", en: "Pending payments" },
  { key: "save", en: "Save" },
];
const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  Hindi: { dashboard: "डैशबोर्ड", money_in: "जमा", money_out: "खर्च", new_invoice: "नया बिल", pending: "बकाया भुगतान", save: "सहेजें" },
  Marathi: { dashboard: "डॅशबोर्ड", money_in: "जमा", money_out: "खर्च", new_invoice: "नवीन बिल", pending: "थकित देयके", save: "जतन करा" },
  Tamil: { dashboard: "டாஷ்போர்டு", money_in: "வரவு", money_out: "செலவு", new_invoice: "புதிய பில்", pending: "நிலுவை கட்டணம்", save: "சேமி" },
  Telugu: { dashboard: "డాష్‌బోర్డ్", money_in: "జమ", money_out: "ఖర్చు", new_invoice: "కొత్త బిల్లు", pending: "బకాయి చెల్లింపులు", save: "సేవ్" },
  Bengali: { dashboard: "ড্যাশবোর্ড", money_in: "জমা", money_out: "খরচ", new_invoice: "নতুন বিল", pending: "বকেয়া পরিশোধ", save: "সংরক্ষণ" },
  Gujarati: { dashboard: "ડેશબોર્ડ", money_in: "જમા", money_out: "ખર્ચ", new_invoice: "નવું બિલ", pending: "બાકી ચુકવણી", save: "સાચવો" },
  Kannada: { dashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", money_in: "ಜಮಾ", money_out: "ಖರ್ಚು", new_invoice: "ಹೊಸ ಬಿಲ್", pending: "ಬಾಕಿ ಪಾವತಿ", save: "ಉಳಿಸಿ" },
};
function UiLanguagePreview() {
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const [previewLang, setPreviewLang] = useState<string>(
    UI_TRANSLATIONS[lang] ? lang : "Hindi",
  );
  const available = Object.keys(UI_TRANSLATIONS);
  const dict = UI_TRANSLATIONS[previewLang] ?? {};
  const bcp47 = LANGUAGES.find(l => l.name === previewLang)?.bcp47 ?? "en-IN";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Globe size={14} className="text-[var(--color-primary)]" /> UI language preview</h2>
        <p className="text-xs text-[var(--color-muted)]">
          See how core interface labels read in your language before switching the whole app. Bundled samples below cover the most widely-spoken scripts; the other 22 languages roll out as translation packs land.
        </p>
        <div className="flex flex-wrap gap-2">
          {available.map(l => (
            <button key={l} onClick={() => setPreviewLang(l)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${previewLang === l ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className={`${CARD} p-4`}>
        <p className="text-xs text-[var(--color-muted)] mb-3">English → {previewLang}</p>
        <div className="space-y-1.5">
          {UI_STRINGS.map(s => (
            <div key={s.key} className="flex items-center justify-between gap-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
              <span className="text-xs text-[var(--color-muted)]">{s.en}</span>
              <span className="text-sm font-medium flex items-center gap-2">
                {dict[s.key] ?? s.en}
                <button onClick={() => { if (!speak(dict[s.key] ?? s.en, bcp47)) toast.error("Text-to-speech not supported here"); }}
                  className="text-[var(--color-muted)] hover:text-[var(--color-primary)]" aria-label="Hear this label"><Volume2 size={12} /></button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tool 14 · Read-my-day audio digest ────────────────────────────────────────────
function ReadMyDayDigest() {
  const { store } = useApp();
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";
  const today = new Date();
  const todayKey = format(today, "yyyy-MM-dd");

  const digest = useMemo(() => {
    const txns = store.transactions ?? [];
    const todays = txns.filter(t => (t.date ?? "").slice(0, 10) === todayKey);
    const inflow = todays.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const outflow = todays.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const allIn = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const allOut = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const balance = allIn - allOut;
    const script = todays.length
      ? `Good ${today.getHours() < 12 ? "morning" : today.getHours() < 17 ? "afternoon" : "evening"}. Today you recorded ${todays.length} transaction${todays.length > 1 ? "s" : ""}. Money in: ${lakhCrore(inflow)} rupees. Money out: ${lakhCrore(outflow)} rupees. Your overall balance stands at ${lakhCrore(balance)} rupees.`
      : `Good ${today.getHours() < 12 ? "morning" : today.getHours() < 17 ? "afternoon" : "evening"}. No transactions recorded today yet. Your overall balance stands at ${lakhCrore(balance)} rupees, across ${txns.length} entries.`;
    return { todays, inflow, outflow, balance, script };
  }, [store.transactions, todayKey]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Sun size={14} className="text-[var(--color-primary)]" /> Read my day</h2>
        <p className="text-xs text-[var(--color-muted)]">A spoken digest of today ({format(today, "d MMM yyyy")}) drawn live from your books — meant for the end-of-day glance you skip when you can&apos;t read the dashboard.</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "In today", value: formatCurrency(digest.inflow), color: "text-green-400" },
            { label: "Out today", value: formatCurrency(digest.outflow), color: "text-red-400" },
            { label: "Balance", value: formatCurrency(digest.balance), color: digest.balance >= 0 ? "text-green-400" : "text-red-400" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { if (!speak(digest.script, bcp47)) toast.error("Text-to-speech not supported here"); }} disabled={!SPEECH_OUT}
            className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium disabled:opacity-40"><Play size={13} /> Play digest</button>
          <button onClick={() => { if (SPEECH_OUT) window.speechSynthesis.cancel(); }} disabled={!SPEECH_OUT}
            className="flex items-center gap-1.5 text-sm border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg disabled:opacity-40"><Square size={13} /> Stop</button>
        </div>
        {!SPEECH_OUT && <FallbackNote>Text-to-speech isn&apos;t available — the digest script is shown below for a screen reader.</FallbackNote>}
        <p className="text-[11px] text-[var(--color-muted)] italic border-t border-[var(--color-border)] pt-2">&ldquo;{digest.script}&rdquo;</p>
      </div>
    </div>
  );
}

// ── Tool 15 · Voice reminder setter ───────────────────────────────────────────────
type Reminder = { id: string; text: string; when: string; created: string };
function VoiceReminderSetter() {
  const [reminders, setReminders] = useFeatureState<Reminder[]>("voice-reminders", []);
  const [text, setText] = useState("");
  const [when, setWhen] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const toggleListen = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { toast.error("Speech recognition not supported — type the reminder"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = "en-IN"; rec.continuous = false; rec.interimResults = true;
    rec.onresult = (e) => { let out = ""; for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript; setText(out); };
    rec.onerror = (e) => { toast.error(`Mic error: ${e.error ?? "unknown"}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };
  useEffect(() => () => { recRef.current?.stop(); }, []);

  const add = () => {
    if (!text.trim()) { toast.error("Say or type what to be reminded about"); return; }
    setReminders([{ id: crypto.randomUUID(), text: text.trim(), when: when || format(new Date(), "yyyy-MM-dd"), created: new Date().toISOString() }, ...reminders]);
    setText(""); setWhen("");
    toast.success("Reminder saved");
  };

  const sorted = [...reminders].sort((a, b) => a.when.localeCompare(b.when));

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Bell size={14} className="text-[var(--color-primary)]" /> Voice reminders</h2>
        <p className="text-xs text-[var(--color-muted)]">Speak a reminder — <em className="text-[var(--color-text)]">&ldquo;collect 5000 from Ramesh&rdquo;</em> — pick a date, and it&apos;s saved and synced. These are personal notes shown here; they don&apos;t trigger push notifications yet.</p>
        {!SPEECH_IN && <FallbackNote>Dictation isn&apos;t available — type the reminder text instead.</FallbackNote>}
        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} placeholder="collect payment from Ramesh" className={INP} />
          <button onClick={toggleListen} disabled={!SPEECH_IN}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap disabled:opacity-40 ${listening ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-[var(--color-primary)] text-[var(--color-bg)]"}`}>
            {listening ? <><Square size={13} /> Stop</> : <><Mic size={13} /> Speak</>}
          </button>
        </div>
        <div className="flex gap-2">
          <input type="date" value={when} onChange={e => setWhen(e.target.value)} className={INP} />
          <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"><Plus size={13} /> Add</button>
        </div>
        {listening && <p className="text-[11px] text-[var(--color-primary)] animate-pulse">Listening… speak now.</p>}
      </div>

      {sorted.length > 0 && (
        <div className={`${CARD} p-4 space-y-2`}>
          {sorted.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
              <Bell size={13} className="text-[var(--color-primary)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.text}</p>
                <p className="text-[10px] text-[var(--color-muted)]">Due {r.when}</p>
              </div>
              <button onClick={() => setReminders(reminders.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tool 16 · Amount-in-words (Indian) converter ──────────────────────────────────
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return TENS[t] + (o ? " " + ONES[o] : "");
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100), rest = n % 100;
  return (h ? ONES[h] + " hundred" + (rest ? " " : "") : "") + (rest ? twoDigits(rest) : "");
}
// Indian system: crore (1e7), lakh (1e5), thousand, hundred.
function numberToIndianWords(num: number): string {
  if (!isFinite(num)) return "";
  const neg = num < 0;
  let n = Math.floor(Math.abs(num));
  if (n === 0) return "zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  const hundred = n;
  if (crore) parts.push(threeDigits(crore) + " crore");
  if (lakh) parts.push(twoDigits(lakh) + " lakh");
  if (thousand) parts.push(twoDigits(thousand) + " thousand");
  if (hundred) parts.push(threeDigits(hundred));
  const words = parts.join(" ").replace(/\s+/g, " ").trim();
  return (neg ? "minus " : "") + words;
}
function AmountInWords() {
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";
  const [raw, setRaw] = useState("125000");
  const n = parseFloat(raw.replace(/,/g, "")) || 0;
  const rupees = Math.floor(Math.abs(n));
  const paise = Math.round((Math.abs(n) - rupees) * 100);
  const words = numberToIndianWords(rupees);
  const full = `${n < 0 ? "Minus " : ""}Rupees ${words || "zero"}${paise ? ` and ${twoDigits(paise)} paise` : ""} only`;
  const capped = full.replace(/\b\w/, c => c.toUpperCase());

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Type size={14} className="text-[var(--color-primary)]" /> Amount in words (Indian)</h2>
        <p className="text-xs text-[var(--color-muted)]">Spell out any amount the way it must appear on cheques and invoices — using lakh and crore, not millions. Includes paise.</p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Enter an amount</label>
          <input value={raw} onChange={e => setRaw(e.target.value)} className={INP} placeholder="125000.50" inputMode="decimal" />
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-[10px] text-[var(--color-muted)] mb-1">{formatCurrency(n)}</p>
          <p className="text-lg font-bold leading-snug">{capped}</p>
          <p className="text-xs text-[var(--color-primary)] mt-1">{lakhCrore(Math.abs(n))}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { navigator.clipboard?.writeText(capped); toast.success("Copied"); }}
            className="flex items-center gap-1.5 text-sm border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg"><Copy size={13} /> Copy</button>
          <button onClick={() => { if (!speak(capped, bcp47)) toast.error("Text-to-speech not supported here"); }} disabled={!SPEECH_OUT}
            className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium disabled:opacity-40"><Play size={13} /> Read aloud</button>
        </div>
        {!SPEECH_OUT && <FallbackNote>Read-aloud needs text-to-speech support; the words are shown above to copy onto a cheque.</FallbackNote>}
      </div>
    </div>
  );
}

// ── Tool 17 · Transliteration helper (Roman → Devanagari preview) ──────────────────
// Lightweight phonetic Roman→Devanagari mapping for quick note previews (not exhaustive).
const TRANSLIT_MAP: [string, string][] = [
  // ordered longest-first so multi-char clusters match before single chars
  ["chh", "छ"], ["sh", "श"], ["ch", "च"], ["th", "थ"], ["dh", "ध"], ["bh", "भ"], ["ph", "फ"],
  ["gh", "घ"], ["kh", "ख"], ["jh", "झ"], ["ng", "ंग"], ["ai", "ै"], ["au", "ौ"], ["aa", "ा"],
  ["ee", "ी"], ["ii", "ी"], ["oo", "ू"], ["uu", "ू"],
  ["a", "अ"], ["i", "इ"], ["u", "उ"], ["e", "े"], ["o", "ो"],
  ["k", "क"], ["g", "ग"], ["j", "ज"], ["t", "त"], ["d", "द"], ["n", "न"], ["p", "प"],
  ["b", "ब"], ["m", "म"], ["y", "य"], ["r", "र"], ["l", "ल"], ["v", "व"], ["w", "व"],
  ["s", "स"], ["h", "ह"], ["c", "क"], ["f", "फ"], ["z", "ज़"], ["q", "क"], ["x", "क्स"],
];
function transliterate(input: string): string {
  return input.split(/(\s+)/).map(token => {
    if (/^\s+$/.test(token)) return token;
    if (/\d/.test(token)) return token; // leave numbers as-is
    let t = token.toLowerCase(), out = "";
    while (t.length) {
      let matched = false;
      for (const [roman, dev] of TRANSLIT_MAP) {
        if (t.startsWith(roman)) { out += dev; t = t.slice(roman.length); matched = true; break; }
      }
      if (!matched) { out += t[0]; t = t.slice(1); }
    }
    return out;
  }).join("");
}
function TransliterationHelper() {
  const [roman, setRoman] = useState("");
  const dev = useMemo(() => transliterate(roman), [roman]);
  const examples = ["ramesh ko 5000 dena hai", "dukaan band", "bill banao"];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ArrowRightLeft size={14} className="text-[var(--color-primary)]" /> Transliteration helper</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Type a note in Roman letters (e.g. <em className="text-[var(--color-text)]">&ldquo;ramesh ko 5000 dena hai&rdquo;</em>) and preview it in Devanagari. This is a quick phonetic approximation for jotting vernacular notes — not a precise linguistic transliteration.
        </p>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Roman input</label>
          <textarea value={roman} onChange={e => setRoman(e.target.value)} rows={3} placeholder="ramesh ko 5000 dena hai" className={`${INP} resize-y`} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {examples.map(ex => (
            <button key={ex} onClick={() => setRoman(ex)} className="text-[10px] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/40">{ex}</button>
          ))}
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 min-h-[3rem]">
          <p className="text-[10px] text-[var(--color-muted)] mb-1">Devanagari preview</p>
          <p className="text-lg leading-snug">{dev || <span className="text-[var(--color-muted)] text-sm">Preview appears here…</span>}</p>
        </div>
        {dev && (
          <button onClick={() => { navigator.clipboard?.writeText(dev); toast.success("Copied"); }}
            className="flex items-center gap-1.5 text-sm border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg"><Copy size={13} /> Copy Devanagari</button>
        )}
        <FallbackNote>Phonetic approximation only — vowel matras and conjuncts won&apos;t always be exact. Use it for rough notes, not for printing official documents.</FallbackNote>
      </div>
    </div>
  );
}

// ── Tool 18 · Spoken payment-reminder dictation ───────────────────────────────────
// Builds a polite, ready-to-read reminder for an overdue invoice and speaks it aloud.
const REMINDER_TEMPLATES: { id: string; label: string; build: (firm: string, party: string, amt: string, days: number) => string }[] = [
  { id: "gentle", label: "Gentle nudge", build: (firm, party, amt, days) => `Hello ${party}, this is a friendly reminder from ${firm}. An amount of ${amt} rupees has been pending for ${days} day${days === 1 ? "" : "s"}. Whenever convenient, please arrange the payment. Thank you.` },
  { id: "firm", label: "Firm follow-up", build: (firm, party, amt, days) => `Dear ${party}, ${firm} here. Your payment of ${amt} rupees is now ${days} day${days === 1 ? "" : "s"} overdue. Kindly clear it at the earliest to avoid any late charges. Please confirm once done.` },
  { id: "festive", label: "Warm & festive", build: (firm, party, amt, days) => `Namaste ${party}, greetings from ${firm}. We hope business is good. A small balance of ${amt} rupees is open for ${days} day${days === 1 ? "" : "s"}. Do settle it when you can, and thank you for your continued trust.` },
];
function PaymentReminderDictation() {
  const { store } = useApp();
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";
  const firm = store.firm?.name?.trim() || "our business";

  const overdue = useMemo(() => {
    const today = new Date();
    return (store.invoices ?? [])
      .filter(i => i.status === "overdue" || i.status === "pending")
      .map(i => {
        const due = new Date(i.dueDate);
        const days = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
        return { id: i.id, party: i.customer || "customer", amount: i.amount, days };
      })
      .filter(i => i.days > 0)
      .sort((a, b) => b.days - a.days);
  }, [store.invoices]);

  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("7");
  const [template, setTemplate] = useState<string>("gentle");

  const chosen = REMINDER_TEMPLATES.find(t => t.id === template) ?? REMINDER_TEMPLATES[0];
  const amtNum = parseFloat(amount.replace(/,/g, "")) || 0;
  const message = chosen.build(firm, party.trim() || "customer", lakhCrore(amtNum), parseInt(days, 10) || 0);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><PhoneCall size={14} className="text-[var(--color-primary)]" /> Payment-reminder dictation</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Pick an overdue bill (or fill it in), choose a tone, and Headroom drafts a polite spoken reminder you can read aloud, copy, or repeat over a call. Nothing is sent automatically.
        </p>

        {overdue.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {overdue.slice(0, 6).map(o => (
              <button key={o.id} onClick={() => { setParty(o.party); setAmount(String(o.amount)); setDays(String(o.days)); }}
                className="text-[10px] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/40">
                {o.party} · {formatCurrency(o.amount)} · {o.days}d
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={party} onChange={e => setParty(e.target.value)} placeholder="Customer name" className={INP} />
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" inputMode="decimal" className={INP} />
          <input value={days} onChange={e => setDays(e.target.value)} placeholder="Days overdue" inputMode="numeric" className={INP} />
        </div>
        <div className="flex flex-wrap gap-2">
          {REMINDER_TEMPLATES.map(t => (
            <button key={t.id} onClick={() => setTemplate(t.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${template === t.id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`${CARD} p-5 space-y-3`}>
        <p className="text-xs text-[var(--color-muted)]">Reminder script</p>
        <p className="text-sm leading-relaxed bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">&ldquo;{message}&rdquo;</p>
        <div className="flex gap-2">
          <button onClick={() => { if (!speak(message, bcp47)) toast.error("Text-to-speech not supported here"); }} disabled={!SPEECH_OUT}
            className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium disabled:opacity-40"><Play size={13} /> Read aloud</button>
          <button onClick={() => { if (SPEECH_OUT) window.speechSynthesis.cancel(); }} disabled={!SPEECH_OUT}
            className="flex items-center gap-1.5 text-sm border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg disabled:opacity-40"><Square size={13} /> Stop</button>
          <button onClick={() => { navigator.clipboard?.writeText(message); toast.success("Reminder copied"); }}
            className="flex items-center gap-1.5 text-sm border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg"><Copy size={13} /> Copy</button>
        </div>
        {!SPEECH_OUT && <FallbackNote>Read-aloud needs text-to-speech support; copy the script above and read or send it manually instead.</FallbackNote>}
      </div>
    </div>
  );
}

// ── Tool 19 · Voice-to-WhatsApp message ───────────────────────────────────────────
// Dictates a message, then hands off to WhatsApp's wa.me deep link (no API sends here).
function VoiceToWhatsApp() {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";

  const toggleListen = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { toast.error("Speech recognition not supported — type the message"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = bcp47; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      let finalChunk = "";
      for (let i = 0; i < e.results.length; i++) if (e.results[i].isFinal) finalChunk += e.results[i][0].transcript + " ";
      if (finalChunk) setMessage(prev => (prev ? prev + " " : "") + finalChunk.trim());
    };
    rec.onerror = (e) => { toast.error(`Mic error: ${e.error ?? "unknown"}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };
  useEffect(() => () => { recRef.current?.stop(); }, []);

  const digits = phone.replace(/[^\d]/g, "");
  const openWhatsApp = () => {
    if (!message.trim()) { toast.error("Dictate or type a message first"); return; }
    const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
    const url = `${base}?text=${encodeURIComponent(message.trim())}`;
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success("Opening WhatsApp…");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><MessageCircle size={14} className="text-[var(--color-primary)]" /> Voice to WhatsApp</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Speak a message in your language, then hand it straight to WhatsApp pre-filled. We open WhatsApp&apos;s share link — your unsent draft, your number — so you tap send yourself. No message is sent in the background.
        </p>
        {!SPEECH_IN && <FallbackNote>Dictation isn&apos;t available — type the message; the WhatsApp hand-off works the same.</FallbackNote>}
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Recipient number (optional, with country code)</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="91XXXXXXXXXX" inputMode="tel" className={INP} />
          <p className="text-[10px] text-[var(--color-muted)] mt-1">Leave blank to pick the contact inside WhatsApp.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={toggleListen} disabled={!SPEECH_IN}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40 ${listening ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-[var(--color-primary)] text-[var(--color-bg)]"}`}>
            {listening ? <><Square size={13} /> Stop dictation</> : <><Mic size={13} /> Dictate message</>}
          </button>
          <button onClick={() => setMessage("")} disabled={!message}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-[var(--color-border)] text-[var(--color-muted)] disabled:opacity-40"><X size={13} /> Clear</button>
        </div>
        {listening && <p className="text-[11px] text-[var(--color-primary)] animate-pulse">Listening… speak in {lang}.</p>}
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} placeholder="Your message appears here…" className={`${INP} resize-y leading-relaxed`} />
        <button onClick={openWhatsApp} disabled={!message.trim()}
          className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium disabled:opacity-40"><Send size={13} /> Open in WhatsApp</button>
      </div>
    </div>
  );
}

// ── Tool 20 · Vernacular finance-term audio glossary ──────────────────────────────
const GLOSSARY: { term: string; plain: string }[] = [
  { term: "ITC (Input Tax Credit)", plain: "The GST you already paid on your purchases, which you can subtract from the GST you owe on your sales. Less tax out of pocket." },
  { term: "TDS (Tax Deducted at Source)", plain: "Tax that a payer cuts before paying you, and deposits with the government on your behalf. You claim it back at filing." },
  { term: "EBITDA", plain: "Your profit before counting interest, taxes, and the wear-and-tear of assets. A quick view of whether the core business earns money." },
  { term: "Working capital", plain: "The cash and near-cash you have to run day-to-day after paying short-term dues. Positive means you can cover the next few weeks." },
  { term: "Accounts receivable", plain: "Money your customers still owe you for goods or services already delivered. Your dues to collect." },
  { term: "Accounts payable", plain: "Money you still owe your suppliers and vendors for what you have already bought. Your dues to pay." },
  { term: "Gross margin", plain: "What is left from a sale after the direct cost of the goods. Higher margin means more room to cover expenses and profit." },
  { term: "Cash flow", plain: "The actual money moving in and out of your business. Profit on paper means little if cash does not arrive on time." },
  { term: "GSTR-2B", plain: "A monthly GST statement showing the input credit available to you, based on what your suppliers reported. Match it with your books." },
  { term: "Reconciliation", plain: "Matching your own records against the bank or GST statement so every rupee is accounted for and nothing is missed." },
];
function FinanceGlossary() {
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";
  const [q, setQ] = useState("");
  const [openTerm, setOpenTerm] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return GLOSSARY;
    return GLOSSARY.filter(g => g.term.toLowerCase().includes(needle) || g.plain.toLowerCase().includes(needle));
  }, [q]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><BookMarked size={14} className="text-[var(--color-primary)]" /> Audio finance glossary</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Plain-language explanations of the jargon that trips up owners — tap any term to expand it, or hear it read aloud. The voice uses your preferred language locale ({bcp47}); the explanation text is in simple English for now.
        </p>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a term, e.g. ITC, EBITDA…" className={INP} />
      </div>

      <div className={`${CARD} p-4 space-y-2`}>
        {filtered.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No term matches &ldquo;{q}&rdquo;.</p>
        ) : filtered.map(g => {
          const open = openTerm === g.term;
          return (
            <div key={g.term} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
              <button onClick={() => setOpenTerm(open ? null : g.term)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left">
                <span className="text-sm font-medium text-[var(--color-primary)]">{g.term}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span onClick={(e) => { e.stopPropagation(); if (!speak(`${g.term}. ${g.plain}`, bcp47)) toast.error("Text-to-speech not supported here"); }}
                    role="button" tabIndex={0} aria-label="Hear this term"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); speak(`${g.term}. ${g.plain}`, bcp47); } }}
                    className="text-[var(--color-muted)] hover:text-[var(--color-primary)] cursor-pointer"><Volume2 size={13} /></span>
                  <Plus size={13} className={`text-[var(--color-muted)] transition-transform ${open ? "rotate-45" : ""}`} />
                </span>
              </button>
              {open && <p className="text-xs text-[var(--color-muted)] leading-relaxed px-3 pb-3">{g.plain}</p>}
            </div>
          );
        })}
        {!SPEECH_OUT && <FallbackNote>Text-to-speech isn&apos;t available — every explanation is shown on screen so a screen reader can read it.</FallbackNote>}
      </div>
    </div>
  );
}

// ── Tool 21 · Speak-the-total voice calculator ────────────────────────────────────
// Dictate a running list of amounts ("200 plus 1500 and 300"); we total and speak it.
function parseAmounts(text: string): number[] {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const out: number[] = [];
  for (const m of matches) {
    const v = parseFloat(m.replace(/,/g, ""));
    if (!isNaN(v)) out.push(v);
  }
  return out;
}
function SpeakTheTotal() {
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const subtract = /\b(minus|less|subtract|deduct)\b/i.test(text);
  const amounts = useMemo(() => parseAmounts(text), [text]);
  const total = amounts.reduce((s, a, i) => (subtract && i > 0 ? s - a : s + a), 0);

  const toggleListen = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { toast.error("Speech recognition not supported — type the amounts"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = "en-IN"; rec.continuous = false; rec.interimResults = true;
    rec.onresult = (e) => { let out = ""; for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript; setText(out); };
    rec.onerror = (e) => { toast.error(`Mic error: ${e.error ?? "unknown"}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };
  useEffect(() => () => { recRef.current?.stop(); }, []);

  const speakTotal = () => {
    if (!amounts.length) { toast.error("Say or type some numbers first"); return; }
    if (!speak(`The total is ${lakhCrore(total)} rupees.`, bcp47)) toast.error("Text-to-speech not supported here");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> Speak the total</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Rattle off amounts — <em className="text-[var(--color-text)]">&ldquo;200 plus 1500 and 300&rdquo;</em> — and Headroom adds them up and reads the total back to you, so you can tally cash without looking. Say <em className="text-[var(--color-text)]">&ldquo;minus&rdquo;</em> anywhere to subtract the rest.
        </p>
        {!SPEECH_IN && <FallbackNote>Microphone dictation isn&apos;t available here — type the numbers; the totalling works identically.</FallbackNote>}
        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} placeholder="200 plus 1500 and 300" className={INP} />
          <button onClick={toggleListen} disabled={!SPEECH_IN}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap disabled:opacity-40 ${listening ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-[var(--color-primary)] text-[var(--color-bg)]"}`}>
            {listening ? <><Square size={13} /> Stop</> : <><Mic size={13} /> Speak</>}
          </button>
        </div>
        {listening && <p className="text-[11px] text-[var(--color-primary)] animate-pulse">Listening… speak now.</p>}
      </div>

      {amounts.length > 0 && (
        <div className={`${CARD} p-5 space-y-3`}>
          <div className="flex flex-wrap gap-1.5">
            {amounts.map((a, i) => (
              <span key={`${i}-${a}`} className="text-xs px-2 py-1 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 tabular-nums">
                {subtract && i > 0 ? "− " : i > 0 ? "+ " : ""}{formatIndianGrouping(a)}
              </span>
            ))}
          </div>
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">Total of {amounts.length} number{amounts.length > 1 ? "s" : ""}</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(total)}</p>
            <p className="text-xs text-[var(--color-primary)] mt-1">{lakhCrore(total)}</p>
          </div>
          <button onClick={speakTotal} disabled={!SPEECH_OUT}
            className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium disabled:opacity-40"><Volume2 size={13} /> Speak the total</button>
          {!SPEECH_OUT && <FallbackNote>Text-to-speech isn&apos;t available — the total is shown above instead.</FallbackNote>}
        </div>
      )}
    </div>
  );
}

// ── Tool 22 · Multilingual greeting recorder ──────────────────────────────────────
// Records a short audio greeting via MediaRecorder; falls back to a typed/spoken script.
type GreetingTemplate = { id: string; label: string; text: (firm: string) => string };
const GREETING_TEMPLATES: GreetingTemplate[] = [
  { id: "welcome", label: "Welcome", text: (f) => `Namaste, and welcome to ${f}. Thank you for choosing us — how may we help you today?` },
  { id: "thanks", label: "Thank you", text: (f) => `Thank you for your business with ${f}. We truly appreciate your trust and look forward to serving you again.` },
  { id: "diwali", label: "Diwali wishes", text: (f) => `Wishing you and your family a very happy Diwali from all of us at ${f}. May the year ahead bring prosperity and good health.` },
  { id: "newyear", label: "New year", text: (f) => `A very happy new year from ${f}. Thank you for being with us — here is to a successful year ahead together.` },
];
function GreetingRecorder() {
  const { store } = useApp();
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";
  const firm = store.firm?.name?.trim() || "our business";

  const [template, setTemplate] = useState<string>("welcome");
  const chosen = GREETING_TEMPLATES.find(t => t.id === template) ?? GREETING_TEMPLATES[0];
  const script = chosen.text(firm);

  const CAN_RECORD = typeof window !== "undefined" && typeof navigator !== "undefined"
    && !!navigator.mediaDevices && typeof window.MediaRecorder !== "undefined";

  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };

  const startRecording = async () => {
    if (!CAN_RECORD) { toast.error("Audio recording not supported in this browser"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        stopStream();
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Microphone permission denied or unavailable");
      stopStream();
    }
  };
  const stopRecording = () => { recorderRef.current?.stop(); setRecording(false); };

  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    stopStream();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><PartyPopper size={14} className="text-[var(--color-primary)]" /> Greeting recorder</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Record a short voice greeting in your own language to send customers on WhatsApp or play at the counter. Pick a starter script, hear it read, then record your own take. Recording stays on your device — nothing uploads.
        </p>
        <div className="flex flex-wrap gap-2">
          {GREETING_TEMPLATES.map(t => (
            <button key={t.id} onClick={() => setTemplate(t.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${template === t.id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-sm leading-relaxed bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 italic">&ldquo;{script}&rdquo;</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { if (!speak(script, bcp47)) toast.error("Text-to-speech not supported here"); }} disabled={!SPEECH_OUT}
            className="flex items-center gap-1.5 text-sm border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg disabled:opacity-40"><Play size={13} /> Hear script</button>
          {!recording ? (
            <button onClick={startRecording} disabled={!CAN_RECORD}
              className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium disabled:opacity-40"><Mic size={13} /> Record my voice</button>
          ) : (
            <button onClick={stopRecording}
              className="flex items-center gap-1.5 text-sm bg-red-500/20 text-red-400 border border-red-500/40 px-3 py-2 rounded-lg font-medium"><Square size={13} /> Stop recording</button>
          )}
        </div>
        {recording && <p className="text-[11px] text-red-400 animate-pulse">Recording… read the script aloud, then press stop.</p>}
        {!CAN_RECORD && <FallbackNote>Audio recording isn&apos;t supported here. You can still hear the script read aloud (if text-to-speech is available) and copy it to record on your phone&apos;s own recorder.</FallbackNote>}

        {audioUrl && (
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 space-y-2">
            <p className="text-[10px] text-[var(--color-muted)]">Your recording</p>
            <audio src={audioUrl} controls className="w-full" />
            <div className="flex gap-2">
              <a href={audioUrl} download="greeting.webm"
                className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg"><Send size={12} /> Download</a>
              <button onClick={() => { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }}
                className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-red-400 px-3 py-1.5 rounded-lg"><Trash2 size={12} /> Discard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool · Ask balance aloud (spoken Q&A over live store) ─────────────────────────
type BalanceAnswer = { kind: "balance" | "in" | "out" | "count" | "party" | "unknown"; text: string };
function answerQuestion(q: string, store: ReturnType<typeof useApp>["store"]): BalanceAnswer {
  const t = q.trim().toLowerCase();
  const txns = store.transactions ?? [];
  const inflow = txns.filter(x => x.amount > 0).reduce((s, x) => s + x.amount, 0);
  const outflow = txns.filter(x => x.amount < 0).reduce((s, x) => s + Math.abs(x.amount), 0);
  if (!t) return { kind: "unknown", text: "Ask me about your balance, money in, money out, or how many transactions you have." };
  // party lookup: "how much from/for <name>"
  const partyMatch = t.match(/\b(?:from|for|with|owe[ds]?|to)\s+([a-z][a-z\s.&'-]{1,40})/);
  if (partyMatch && /(owe|outstanding|pending|how much)/.test(t)) {
    const name = partyMatch[1].trim();
    const matched = txns.filter(x => (x.counterparty ?? "").toLowerCase().includes(name) || (x.description ?? "").toLowerCase().includes(name));
    const net = matched.reduce((s, x) => s + x.amount, 0);
    if (matched.length === 0) return { kind: "party", text: `I couldn't find any transactions matching "${name}".` };
    return { kind: "party", text: `Across ${matched.length} transactions matching ${name}, the net is ${lakhCrore(net)} rupees.` };
  }
  if (/(money in|inflow|revenue|received|income|collect)/.test(t)) return { kind: "in", text: `Total money in is ${lakhCrore(inflow)} rupees.` };
  if (/(money out|outflow|expense|spent|paid|spend)/.test(t)) return { kind: "out", text: `Total money out is ${lakhCrore(outflow)} rupees.` };
  if (/(how many|count|number of)/.test(t)) return { kind: "count", text: `You have ${txns.length} recorded transactions.` };
  if (/(balance|position|net|cash|left|profit|surplus|shortfall)/.test(t)) {
    const net = inflow - outflow;
    return { kind: "balance", text: `Your net position is ${net >= 0 ? "a surplus" : "a shortfall"} of ${lakhCrore(Math.abs(net))} rupees.` };
  }
  return { kind: "unknown", text: "I can answer questions about balance, money in, money out, transaction count, or a party. Try \"what is my balance\"." };
}

function AskBalanceAloud() {
  const { store } = useApp();
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";
  const [q, setQ] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const ans = useMemo(() => answerQuestion(q, store), [q, store]);

  const ask = (autoSpeak: boolean) => {
    if (autoSpeak) speak(ans.text, bcp47);
  };

  const toggleListen = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { toast.error("Speech recognition not supported — type your question"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = "en-IN"; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e) => {
      let out = ""; for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript;
      setQ(out);
      speak(answerQuestion(out, store).text, bcp47);
    };
    rec.onerror = (e) => { toast.error(`Mic error: ${e.error ?? "unknown"}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };
  useEffect(() => () => { recRef.current?.stop(); }, []);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><HelpCircle size={14} className="text-[var(--color-primary)]" /> Ask about your books</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Ask a question like <em className="text-[var(--color-text)]">&ldquo;what is my balance&rdquo;</em> or <em className="text-[var(--color-text)]">&ldquo;how much money out&rdquo;</em>. We answer from your live transactions and read it back aloud.
        </p>
        {!SPEECH_IN && <FallbackNote>Microphone questions aren&apos;t available here — type your question and we&apos;ll answer below.</FallbackNote>}
        <div className="flex gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ask(SPEECH_OUT); }} placeholder="what is my balance" className={INP} />
          <button onClick={toggleListen} disabled={!SPEECH_IN}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap disabled:opacity-40 ${listening ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-[var(--color-primary)] text-[var(--color-bg)]"}`}>
            {listening ? <><Square size={13} /> Stop</> : <><Mic size={13} /> Ask</>}
          </button>
        </div>
        {listening && <p className="text-[11px] text-[var(--color-primary)] animate-pulse">Listening… ask your question.</p>}
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-[10px] text-[var(--color-muted)] mb-1">Answer</p>
          <p className="text-sm">{ans.text}</p>
          <button onClick={() => { if (!speak(ans.text, bcp47)) toast.error("Text-to-speech not supported here"); }} disabled={!SPEECH_OUT}
            className="mt-2 flex items-center gap-1.5 text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-1.5 rounded-lg disabled:opacity-40"><Volume2 size={12} /> Read aloud</button>
        </div>
      </div>
    </div>
  );
}

// ── Tool · Spell it out (read codes char-by-char with NATO phonetics) ─────────────
const NATO: Record<string, string> = {
  a: "Alpha", b: "Bravo", c: "Charlie", d: "Delta", e: "Echo", f: "Foxtrot", g: "Golf",
  h: "Hotel", i: "India", j: "Juliett", k: "Kilo", l: "Lima", m: "Mike", n: "November",
  o: "Oscar", p: "Papa", q: "Quebec", r: "Romeo", s: "Sierra", t: "Tango", u: "Uniform",
  v: "Victor", w: "Whiskey", x: "X-ray", y: "Yankee", z: "Zulu",
};
function phonetic(ch: string): string {
  const c = ch.toLowerCase();
  if (NATO[c]) return NATO[c];
  if (/[0-9]/.test(c)) return c; // digits read as-is
  return ch;
}
function SpellItOut() {
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";
  const [raw, setRaw] = useState("");
  const chars = useMemo(() => raw.replace(/\s+/g, "").split(""), [raw]);
  const phoneticScript = chars.map(phonetic).join(", ");

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><SpellCheck2 size={14} className="text-[var(--color-primary)]" /> Spell it out</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Paste an IFSC, GSTIN, account number or reference and have it read back <strong className="text-[var(--color-text)]">character by character</strong> — letters with NATO phonetics — so it&apos;s unmistakable over a phone call.
        </p>
        <input value={raw} onChange={e => setRaw(e.target.value.toUpperCase())} placeholder="e.g. HDFC0001234 or 27AAAC…" className={`${INP} font-mono tracking-wider`} />
        {chars.length > 0 && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {chars.map((c, i) => (
                <span key={i} className="inline-flex flex-col items-center bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 min-w-[2.5rem]">
                  <span className="text-base font-bold font-mono">{c}</span>
                  <span className="text-[9px] text-[var(--color-muted)]">{phonetic(c)}</span>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { if (!speak(phoneticScript, bcp47, 0.85)) toast.error("Text-to-speech not supported here"); }} disabled={!SPEECH_OUT}
                className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-medium disabled:opacity-40"><Play size={13} /> Read aloud</button>
              <button onClick={() => { navigator.clipboard?.writeText(phoneticScript); toast.success("Phonetic spelling copied"); }}
                className="flex items-center gap-1.5 text-sm border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg"><Copy size={13} /> Copy</button>
            </div>
          </>
        )}
        {!SPEECH_OUT && <FallbackNote>Text-to-speech isn&apos;t available here — the phonetic breakdown above can be read out or copied instead.</FallbackNote>}
      </div>
    </div>
  );
}

// ── Tool · Spoken date entry (parse natural date phrases) ─────────────────────────
function parseSpokenDate(text: string, today: Date): Date | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/\btoday\b/.test(t)) return today;
  if (/\byesterday\b/.test(t)) { const d = new Date(today); d.setDate(d.getDate() - 1); return d; }
  if (/\btomorrow\b/.test(t)) { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }
  const daysAgo = t.match(/(\d+)\s*days?\s*ago/);
  if (daysAgo) { const d = new Date(today); d.setDate(d.getDate() - parseInt(daysAgo[1], 10)); return d; }
  // "3rd of march", "march 3", "3 march 2025"
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const monIdx = months.findIndex(m => t.includes(m) || t.includes(m.slice(0, 3)));
  if (monIdx >= 0) {
    const dayMatch = t.match(/(\d{1,2})/);
    const yearMatch = t.match(/\b(20\d{2})\b/);
    const day = dayMatch ? parseInt(dayMatch[1], 10) : 1;
    const year = yearMatch ? parseInt(yearMatch[1], 10) : today.getFullYear();
    if (day >= 1 && day <= 31) return new Date(year, monIdx, day);
  }
  // dd/mm or dd-mm[-yyyy]
  const dmy = t.match(/\b(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?\b/);
  if (dmy) {
    const day = parseInt(dmy[1], 10), mon = parseInt(dmy[2], 10) - 1;
    let year = dmy[3] ? parseInt(dmy[3], 10) : today.getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && mon >= 0 && mon <= 11) return new Date(year, mon, day);
  }
  return null;
}
function SpokenDateEntry() {
  const today = useMemo(() => new Date(), []);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const parsed = useMemo(() => parseSpokenDate(text, today), [text, today]);

  const toggleListen = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { toast.error("Speech recognition not supported — type the date"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = "en-IN"; rec.continuous = false; rec.interimResults = true;
    rec.onresult = (e) => { let out = ""; for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript; setText(out); };
    rec.onerror = (e) => { toast.error(`Mic error: ${e.error ?? "unknown"}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };
  useEffect(() => () => { recRef.current?.stop(); }, []);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Spoken date entry</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Say or type a date the way you&apos;d speak it — <em className="text-[var(--color-text)]">&ldquo;yesterday&rdquo;</em>, <em className="text-[var(--color-text)]">&ldquo;3 days ago&rdquo;</em>, <em className="text-[var(--color-text)]">&ldquo;15 march&rdquo;</em> — and we resolve it to a calendar date you can reuse.
        </p>
        {!SPEECH_IN && <FallbackNote>Microphone input isn&apos;t available here — type the date phrase instead; parsing is identical.</FallbackNote>}
        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} placeholder="yesterday / 3 days ago / 15 march" className={INP} />
          <button onClick={toggleListen} disabled={!SPEECH_IN}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap disabled:opacity-40 ${listening ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-[var(--color-primary)] text-[var(--color-bg)]"}`}>
            {listening ? <><Square size={13} /> Stop</> : <><Mic size={13} /> Speak</>}
          </button>
        </div>
        {listening && <p className="text-[11px] text-[var(--color-primary)] animate-pulse">Listening… say a date.</p>}
        {text.trim() && (
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-[10px] text-[var(--color-muted)] mb-1">Resolved date</p>
            {parsed ? (
              <>
                <p className="text-xl font-bold">{format(parsed, "EEEE, d MMMM yyyy")}</p>
                <p className="text-xs text-[var(--color-primary)] mt-1">ISO: {format(parsed, "yyyy-MM-dd")}</p>
                <button onClick={() => { navigator.clipboard?.writeText(format(parsed, "yyyy-MM-dd")); toast.success("Date copied"); }}
                  className="mt-2 flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-1.5 rounded-lg"><Copy size={12} /> Copy ISO date</button>
              </>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">Couldn&apos;t understand that date. Try &ldquo;yesterday&rdquo;, &ldquo;5 days ago&rdquo;, &ldquo;12 june&rdquo; or &ldquo;15/03/2025&rdquo;.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool · Voice work log (timestamped dictated activity entries) ─────────────────
type WorkLogEntry = { id: string; at: string; text: string };
function VoiceWorkLog() {
  const [entries, setEntries] = useFeatureState<WorkLogEntry[]>("voice-work-log", []);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const [lang] = useFeatureState<string>("voice-language", "Hindi");
  const bcp47 = LANGUAGES.find(l => l.name === lang)?.bcp47 ?? "en-IN";

  const add = (text: string) => {
    if (!text.trim()) return;
    setEntries([{ id: crypto.randomUUID(), at: new Date().toISOString(), text: text.trim() }, ...entries]);
    setDraft("");
  };

  const toggleListen = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { toast.error("Speech recognition not supported — type your entry"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = bcp47; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e) => { let out = ""; for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript; if (out.trim()) add(out); };
    rec.onerror = (e) => { toast.error(`Mic error: ${e.error ?? "unknown"}`); setListening(false); };
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };
  useEffect(() => () => { recRef.current?.stop(); }, []);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><ClipboardList size={14} className="text-[var(--color-primary)]" /> Voice work log</h2>
        <p className="text-xs text-[var(--color-muted)]">Dictate what you did and when — each entry is timestamped automatically. Handy for site visits, billable hours, or a daily diary. Entries are saved and synced.</p>
        {!SPEECH_IN && <FallbackNote>Dictation isn&apos;t available here — type each entry and press Add; timestamps are still recorded.</FallbackNote>}
        <div className="flex gap-2">
          <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(draft); }} placeholder="Visited Sharma's shop, collected payment…" className={INP} />
          <button onClick={() => add(draft)} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg text-sm font-medium"><Plus size={13} /> Add</button>
          <button onClick={toggleListen} disabled={!SPEECH_IN}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap disabled:opacity-40 ${listening ? "bg-red-500/20 text-red-400 border border-red-500/40" : "border border-[var(--color-border)] text-[var(--color-muted)]"}`}>
            {listening ? <><Square size={13} /> Stop</> : <><Mic size={13} /> Speak</>}
          </button>
        </div>
        {listening && <p className="text-[11px] text-[var(--color-primary)] animate-pulse">Listening… describe what you did.</p>}
      </div>

      {entries.length > 0 && (
        <div className={`${CARD} p-4 space-y-2`}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold">{entries.length} log entr{entries.length > 1 ? "ies" : "y"}</p>
            <button onClick={() => setEntries([])} className="text-[11px] text-[var(--color-muted)] hover:text-red-400 flex items-center gap-1"><Trash2 size={11} /> Clear all</button>
          </div>
          {entries.map(en => (
            <div key={en.id} className="flex items-start gap-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
              <span className="text-[10px] text-[var(--color-primary)] tabular-nums whitespace-nowrap mt-0.5">{format(new Date(en.at), "d MMM, HH:mm")}</span>
              <span className="flex-1 text-sm">{en.text}</span>
              <button onClick={() => setEntries(entries.filter(x => x.id !== en.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
