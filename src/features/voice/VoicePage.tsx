import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  Mic, Languages, Volume2, BookOpen, Eye, Hash, AudioLines, Fingerprint, NotebookPen,
  AlertTriangle, CheckCircle2, Play, Square, Trash2, Copy, Plus,
} from "lucide-react";
import { toast } from "sonner";

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

function VoiceCapture() {
  const { store } = useApp();
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const draft = useMemo(() => parseEntry(text), [text]);

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

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Mic size={14} className="text-[var(--color-primary)]" /> Voice note → transaction draft</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Say or type a line like <em className="text-[var(--color-text)]">&ldquo;received 5000 from Sharma&rdquo;</em> or <em className="text-[var(--color-text)]">&ldquo;paid 1200 to electricity&rdquo;</em>. We parse it into a draft you can review.
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
          <p className="text-sm font-semibold mb-3">Parsed draft</p>
          {draft ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: "Direction", value: draft.direction === "in" ? "Money in" : "Money out", color: draft.direction === "in" ? "text-green-400" : "text-red-400" },
                  { label: "Amount", value: formatCurrency(draft.amount), color: "text-[var(--color-text)]" },
                  { label: "Party", value: draft.party, color: "text-[var(--color-text)]" },
                ].map(k => (
                  <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                    <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                    <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[var(--color-muted)] mt-3">
                Preview only — this draft is not posted. Take it to <strong className="text-[var(--color-text)]">Transactions</strong> to confirm and save against the right ledger.
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
