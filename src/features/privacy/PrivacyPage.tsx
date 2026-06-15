import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  ShieldCheck, Landmark, Grid3x3, Inbox, Clock4, Share2, CalendarClock,
  ListChecks, Database, AlertTriangle, Plus, CheckCircle2, XCircle, Trash2,
  RefreshCw, Ban, ChevronRight, ScrollText,
  FileText, Cookie, FileCheck, UserCheck, BarChart3, Layers,
  GraduationCap, Calculator, MapPin, Megaphone, Timer, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays, addDays, parseISO } from "date-fns";

// shared styles (reused from Tax/Debt input class)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";
const today = () => new Date().toISOString().split("T")[0];
const uid = () => crypto.randomUUID();

type TabId =
  | "overview" | "aa" | "dpdp-log" | "perms" | "dsr" | "retention"
  | "third-party" | "expiry" | "hygiene" | "data-map" | "breach"
  | "policy-gen" | "cookie" | "dpa-check" | "grievance" | "consent-rate"
  | "classify" | "training" | "penalty" | "localization" | "marketing-consent"
  | "sar-timer";

const TABS = [
  ["overview", "Overview", ShieldCheck],
  ["aa", "AA Consent Register", Landmark],
  ["dpdp-log", "DPDP Consent Log", ScrollText],
  ["perms", "Permissions Matrix", Grid3x3],
  ["dsr", "Access / Erasure", Inbox],
  ["retention", "Retention Policy", Clock4],
  ["third-party", "Sharing Registry", Share2],
  ["expiry", "Consent Expiry", CalendarClock],
  ["hygiene", "Privacy Hygiene", ListChecks],
  ["data-map", "Data Inventory", Database],
  ["breach", "Breach Log", AlertTriangle],
  ["policy-gen", "Policy Generator", FileText],
  ["cookie", "Cookie Consent", Cookie],
  ["dpa-check", "DPA Checklist", FileCheck],
  ["grievance", "Grievance Officer", UserCheck],
  ["consent-rate", "Consent Rate", BarChart3],
  ["classify", "Classification", Layers],
  ["training", "Staff Training", GraduationCap],
  ["penalty", "Penalty Estimator", Calculator],
  ["localization", "Localization", MapPin],
  ["marketing-consent", "Marketing Opt-in", Megaphone],
  ["sar-timer", "SAR SLA Timer", Timer],
] as const;

export default function PrivacyPage() {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck size={18} className="text-[var(--color-primary)]" /> Privacy & Consent
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            DEPA / Account Aggregator consents, DPDP Act 2023 compliance, data-rights tracking and breach response — one control centre.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <Overview onJump={setTab} />}
      {tab === "aa" && <AAConsentRegister />}
      {tab === "dpdp-log" && <DpdpConsentLog />}
      {tab === "perms" && <PermissionsMatrix />}
      {tab === "dsr" && <DataRightsTracker />}
      {tab === "retention" && <RetentionPolicy />}
      {tab === "third-party" && <ThirdPartyRegistry />}
      {tab === "expiry" && <ConsentExpiryCalendar />}
      {tab === "hygiene" && <PrivacyHygiene />}
      {tab === "data-map" && <DataInventory />}
      {tab === "breach" && <BreachLog />}
      {tab === "policy-gen" && <PolicyGenerator />}
      {tab === "cookie" && <CookieConsentConfig />}
      {tab === "dpa-check" && <DpaChecklist />}
      {tab === "grievance" && <GrievanceOfficerRegister />}
      {tab === "consent-rate" && <ConsentRateDashboard />}
      {tab === "classify" && <ClassificationMatrix />}
      {tab === "training" && <TrainingLog />}
      {tab === "penalty" && <PenaltyEstimator />}
      {tab === "localization" && <LocalizationChecklist />}
      {tab === "marketing-consent" && <MarketingConsentRegister />}
      {tab === "sar-timer" && <SarSlaTimer />}
    </div>
  );
}

// ── Types (durable records) ─────────────────────────────────────────────────────
type AAStatus = "pending" | "active" | "revoked" | "expired";
interface AAConsent {
  id: string; fip: string; aa: string; purpose: string;
  scope: string; status: AAStatus; grantedOn: string; expiresOn: string;
}
interface DpdpEntry {
  id: string; subject: string; purpose: string; collectedOn: string;
  channel: string; granted: boolean; withdrawnOn: string | null;
}
type PermLevel = "none" | "read" | "full";
interface PermRow { id: string; party: string; bank: boolean; gst: boolean; pan: boolean; invoices: boolean; payroll: boolean }
type DsrType = "access" | "erasure" | "correction" | "portability";
type DsrStatus = "open" | "in_progress" | "fulfilled" | "rejected";
interface DsrRequest { id: string; subject: string; type: DsrType; raisedOn: string; status: DsrStatus; note: string }
interface RetentionRow { id: string; category: string; years: number; basis: string }
interface ShareRow { id: string; recipient: string; dataShared: string; purpose: string; dpaSigned: boolean; sharedOn: string }
interface DataAsset { id: string; element: string; sensitivity: "low" | "medium" | "high"; location: string; purpose: string }
type BreachSeverity = "low" | "medium" | "high";
interface BreachRow { id: string; detectedOn: string; description: string; records: number; severity: BreachSeverity; dpbNotified: boolean; subjectsNotified: boolean }

const STATUS_PILL: Record<AAStatus, string> = {
  pending: "bg-yellow-950/30 text-yellow-400 border-yellow-800/40",
  active: "bg-green-950/30 text-green-400 border-green-800/40",
  revoked: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
  expired: "bg-red-950/30 text-red-400 border-red-800/40",
};

// ── Overview ─────────────────────────────────────────────────────────────────────
function Overview({ onJump }: { onJump: (t: TabId) => void }) {
  const [aa] = useFeatureState<AAConsent[]>("priv-aa-consents", []);
  const [dpdp] = useFeatureState<DpdpEntry[]>("priv-dpdp-log", []);
  const [dsr] = useFeatureState<DsrRequest[]>("priv-dsr", []);
  const [shares] = useFeatureState<ShareRow[]>("priv-shares", []);
  const [breaches] = useFeatureState<BreachRow[]>("priv-breaches", []);
  const [checks] = useFeatureState<Record<string, boolean>>("priv-hygiene", {});

  const now = new Date();
  const activeAA = aa.filter(c => c.status === "active").length;
  const expiringSoon = aa.filter(c => c.status === "active" && differenceInCalendarDays(parseISO(c.expiresOn), now) <= 30 && differenceInCalendarDays(parseISO(c.expiresOn), now) >= 0).length;
  const openDsr = dsr.filter(d => d.status === "open" || d.status === "in_progress").length;
  const unsignedDpa = shares.filter(s => !s.dpaSigned).length;
  const openBreaches = breaches.filter(b => !b.dpbNotified && b.severity !== "low").length;
  const hygieneDone = HYGIENE_ITEMS.filter(h => checks[h.id]).length;
  const hygieneScore = Math.round((hygieneDone / HYGIENE_ITEMS.length) * 100);

  const cards = [
    { label: "Active AA consents", value: String(activeAA), color: "text-green-400", sub: `${aa.length} total in register`, tab: "aa" as TabId },
    { label: "DPDP consents logged", value: String(dpdp.length), color: "text-blue-400", sub: `${dpdp.filter(d => d.granted && !d.withdrawnOn).length} currently live`, tab: "dpdp-log" as TabId },
    { label: "Open data requests", value: String(openDsr), color: openDsr > 0 ? "text-yellow-400" : "text-green-400", sub: "Right to access / erasure", tab: "dsr" as TabId },
    { label: "DPDP readiness", value: `${hygieneScore}%`, color: hygieneScore >= 80 ? "text-green-400" : hygieneScore >= 50 ? "text-yellow-400" : "text-red-400", sub: `${hygieneDone}/${HYGIENE_ITEMS.length} controls in place`, tab: "hygiene" as TabId },
  ];

  const alerts: { tone: "red" | "yellow"; text: string; tab: TabId }[] = [];
  if (openBreaches > 0) alerts.push({ tone: "red", text: `${openBreaches} reportable breach(es) not yet notified to the Data Protection Board — the DPDP Act expects notification without delay.`, tab: "breach" });
  if (expiringSoon > 0) alerts.push({ tone: "yellow", text: `${expiringSoon} Account-Aggregator consent(s) expire within 30 days — renew before cash-flow underwriting breaks.`, tab: "expiry" });
  if (unsignedDpa > 0) alerts.push({ tone: "yellow", text: `${unsignedDpa} third-party data recipient(s) have no signed processing agreement on file.`, tab: "third-party" });
  if (openDsr > 0) alerts.push({ tone: "yellow", text: `${openDsr} data-subject request(s) awaiting fulfilment — DPDP expects a response within ~30 days.`, tab: "dsr" });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <button key={c.label} onClick={() => onJump(c.tab)} className={`${CARD} p-4 text-left hover:border-[var(--color-primary)]/40 transition-colors`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-1">{c.sub}</p>
          </button>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <button key={i} onClick={() => onJump(a.tab)}
              className={`w-full text-left rounded-lg p-3.5 border flex items-center gap-2.5 ${a.tone === "red" ? "border-red-800/40 bg-red-950/20" : "border-yellow-800/40 bg-yellow-950/20"}`}>
              <AlertTriangle size={14} className={a.tone === "red" ? "text-red-400 shrink-0" : "text-yellow-400 shrink-0"} />
              <p className={`text-xs font-medium flex-1 ${a.tone === "red" ? "text-red-300" : "text-yellow-300"}`}>{a.text}</p>
              <ChevronRight size={13} className="text-[var(--color-muted)] shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1">Your privacy obligations under Indian law</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          The Digital Personal Data Protection Act 2023 makes your firm a Data Fiduciary for any personal data you hold. DEPA and the RBI's Account Aggregator framework govern how you fetch financial data with consent. This centre keeps the durable proof — registers, logs and request trails — that an audit or the Data Protection Board can ask for.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            { t: "Consent must be specific & withdrawable", d: "Log every grant and revocation — tracked in the AA register and DPDP log." },
            { t: "Honour data-subject rights", d: "Access, correction, erasure and portability — fulfilled via the request tracker." },
            { t: "Minimise & time-box retention", d: "Define a retention clock per data category so nothing is hoarded." },
            { t: "Report breaches promptly", d: "Maintain a breach log and notify the Data Protection Board and affected people." },
          ].map(r => (
            <div key={r.t} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-xs font-semibold flex items-center gap-1.5"><CheckCircle2 size={12} className="text-[var(--color-primary)]" /> {r.t}</p>
              <p className="text-[11px] text-[var(--color-muted)] mt-1">{r.d}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">
        These tools maintain your own compliance records. Backend consent toggles, data export and account-deletion requests live in Settings → Privacy & Data. This is not legal advice — confirm obligations with your counsel or CA.
      </p>
    </div>
  );
}

// ── AA Consent Register ────────────────────────────────────────────────────────
function AAConsentRegister() {
  const [rows, setRows] = useFeatureState<AAConsent[]>("priv-aa-consents", []);
  const [fip, setFip] = useState("");
  const [aa, setAa] = useState("");
  const [purpose, setPurpose] = useState("Cash-flow lending underwriting");
  const [scope, setScope] = useState("Bank statements (last 12 months)");
  const [months, setMonths] = useState("12");

  // Reconcile derived "expired" status against the live clock without mutating storage on render.
  const view = useMemo(() => rows.map(r => {
    if (r.status === "active" && differenceInCalendarDays(parseISO(r.expiresOn), new Date()) < 0) return { ...r, status: "expired" as AAStatus };
    return r;
  }), [rows]);

  const add = () => {
    if (!fip.trim() || !aa.trim()) { toast.error("Enter the FIP (your bank) and the Account Aggregator"); return; }
    const m = Math.max(1, Math.round(parseFloat(months) || 12));
    setRows([{ id: uid(), fip: fip.trim(), aa: aa.trim(), purpose: purpose.trim(), scope: scope.trim(), status: "active", grantedOn: today(), expiresOn: addDays(new Date(), m * 30).toISOString().split("T")[0] }, ...rows]);
    setFip(""); setAa("");
    toast.success("Consent recorded in your AA register");
  };
  const setStatus = (id: string, status: AAStatus) => {
    setRows(rows.map(r => r.id === id ? { ...r, status } : r));
    if (status === "revoked") toast.success("Consent marked revoked — keep the FIP acknowledgement for your records");
  };
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Landmark size={14} className="text-[var(--color-primary)]" /> Account Aggregator Consent Register</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Every DEPA consent you grant through an RBI-licensed Account Aggregator — the FIP holding your data, the purpose, scope and expiry. Track grant → active → revoke to stay in control.</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">FIP (data holder)</label>
            <input value={fip} onChange={e => setFip(e.target.value)} placeholder="HDFC Bank" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Account Aggregator</label>
            <input value={aa} onChange={e => setAa(e.target.value)} placeholder="Finvu / OneMoney" className={INP} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Purpose</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)} className={INP} />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Scope</label>
            <input value={scope} onChange={e => setScope(e.target.value)} className={INP} />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Valid (mo)</label>
              <input type="number" value={months} onChange={e => setMonths(e.target.value)} className={INP} />
            </div>
            <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><Plus size={13} /></button>
          </div>
        </div>
      </div>

      {view.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No AA consents recorded yet. Add one each time you authorise a financial-data fetch.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["FIP", "AA", "Purpose / Scope", "Granted", "Expires", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {view.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-3 font-medium">{r.fip}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{r.aa}</td>
                    <td className="px-4 py-3"><p className="text-xs">{r.purpose}</p><p className="text-[10px] text-[var(--color-muted)]">{r.scope}</p></td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted)] tabular-nums">{r.grantedOn}</td>
                    <td className="px-4 py-3 text-xs tabular-nums">{r.expiresOn}</td>
                    <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_PILL[r.status]}`}>{r.status}</span></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.status === "active" && (
                        <button onClick={() => setStatus(r.id, "revoked")} className="inline-flex items-center gap-1 text-[10px] text-yellow-400 hover:underline mr-3"><Ban size={11} /> Revoke</button>
                      )}
                      {(r.status === "revoked" || r.status === "expired") && (
                        <button onClick={() => setStatus(r.id, "active")} className="inline-flex items-center gap-1 text-[10px] text-green-400 hover:underline mr-3"><RefreshCw size={11} /> Re-grant</button>
                      )}
                      <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Under DEPA, consent is purpose-bound and revocable at any time. When you revoke, the FIP must stop sharing — keep the AA acknowledgement as proof.</p>
    </div>
  );
}

// ── DPDP Consent Log ───────────────────────────────────────────────────────────
function DpdpConsentLog() {
  const [rows, setRows] = useFeatureState<DpdpEntry[]>("priv-dpdp-log", []);
  const [subject, setSubject] = useState("");
  const [purpose, setPurpose] = useState("");
  const [channel, setChannel] = useState("Website signup form");

  const add = () => {
    if (!subject.trim() || !purpose.trim()) { toast.error("Enter the data subject and the purpose consented to"); return; }
    setRows([{ id: uid(), subject: subject.trim(), purpose: purpose.trim(), collectedOn: today(), channel, granted: true, withdrawnOn: null }, ...rows]);
    setSubject(""); setPurpose("");
    toast.success("Consent logged");
  };
  const withdraw = (id: string) => setRows(rows.map(r => r.id === id ? { ...r, granted: false, withdrawnOn: today() } : r));
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  const live = rows.filter(r => r.granted).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><ScrollText size={14} className="text-[var(--color-primary)]" /> DPDP Consent Log</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">A defensible record of every customer / employee whose personal data you collected, why, through which channel, and whether consent is still live. The DPDP Act requires consent to be specific, informed and withdrawable.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Data subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Customer / employee name" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Purpose</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Order fulfilment, marketing…" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Collected via</label>
            <select value={channel} onChange={e => setChannel(e.target.value)} className={INP}>
              {["Website signup form", "Invoice / KYC", "In-store / paper", "WhatsApp / chat", "Phone call", "Import / third party"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><Plus size={13} /> Log consent</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No consents logged. Record each collection of personal data so you can prove lawful basis.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total logged", value: String(rows.length), color: "text-[var(--color-text)]" },
              { label: "Currently granted", value: String(live), color: "text-green-400" },
              { label: "Withdrawn", value: String(rows.length - live), color: "text-[var(--color-muted)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Subject", "Purpose", "Channel", "Collected", "Status", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-3 font-medium">{r.subject}</td>
                      <td className="px-4 py-3 text-xs">{r.purpose}</td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{r.channel}</td>
                      <td className="px-4 py-3 text-xs tabular-nums text-[var(--color-muted)]">{r.collectedOn}</td>
                      <td className="px-4 py-3">
                        {r.granted
                          ? <span className="inline-flex items-center gap-1 text-xs text-green-400 font-semibold"><CheckCircle2 size={12} /> Granted</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]"><XCircle size={12} /> Withdrawn {r.withdrawnOn}</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {r.granted && <button onClick={() => withdraw(r.id)} className="text-[10px] text-yellow-400 hover:underline mr-3">Mark withdrawn</button>}
                        <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Data-Sharing Permissions Matrix ──────────────────────────────────────────────
const PERM_FIELDS = [
  ["bank", "Bank txns"], ["gst", "GST data"], ["pan", "PAN / KYC"], ["invoices", "Invoices"], ["payroll", "Payroll"],
] as const;
function PermissionsMatrix() {
  const [rows, setRows] = useFeatureState<PermRow[]>("priv-perms", []);
  const [party, setParty] = useState("");

  const add = () => {
    if (!party.trim()) { toast.error("Enter the party / app name"); return; }
    setRows([...rows, { id: uid(), party: party.trim(), bank: false, gst: false, pan: false, invoices: false, payroll: false }]);
    setParty("");
  };
  const toggle = (id: string, field: typeof PERM_FIELDS[number][0]) =>
    setRows(rows.map(r => r.id === id ? { ...r, [field]: !r[field] } : r));
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Grid3x3 size={14} className="text-[var(--color-primary)]" /> Data-Sharing Permissions Matrix</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">A field-level grid of exactly which data category each connected party, lender or app may access. Apply data-minimisation: grant only what each purpose needs.</p>
        <div className="flex gap-2 items-end max-w-md">
          <div className="flex-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Party / app / lender</label>
            <input value={party} onChange={e => setParty(e.target.value)} placeholder="e.g. Razorpay, your CA, lender" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Add a party to map its data permissions.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">Party</th>
                  {PERM_FIELDS.map(([, label]) => <th key={label} className="px-3 py-2.5 text-center text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{label}</th>)}
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-3 font-medium">{r.party}</td>
                    {PERM_FIELDS.map(([field]) => (
                      <td key={field} className="px-3 py-3 text-center">
                        <button onClick={() => toggle(r.id, field)} aria-label={`Toggle ${field} for ${r.party}`}
                          className={`w-8 h-5 rounded-full relative transition-colors ${r[field] ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${r[field] ? "left-[14px]" : "left-0.5"}`} />
                        </button>
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Green = access granted. Review this grid quarterly and switch off any access no longer justified by an active purpose.</p>
    </div>
  );
}

// ── Data-Subject Rights Tracker ───────────────────────────────────────────────────
const DSR_TYPE_LABEL: Record<DsrType, string> = { access: "Right to access", erasure: "Right to erasure", correction: "Correction", portability: "Portability" };
const DSR_STATUS_PILL: Record<DsrStatus, string> = {
  open: "bg-yellow-950/30 text-yellow-400 border-yellow-800/40",
  in_progress: "bg-blue-950/30 text-blue-400 border-blue-800/40",
  fulfilled: "bg-green-950/30 text-green-400 border-green-800/40",
  rejected: "bg-red-950/30 text-red-400 border-red-800/40",
};
const DSR_SLA_DAYS = 30;
function DataRightsTracker() {
  const [rows, setRows] = useFeatureState<DsrRequest[]>("priv-dsr", []);
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<DsrType>("access");
  const [note, setNote] = useState("");

  const add = () => {
    if (!subject.trim()) { toast.error("Enter who raised the request"); return; }
    setRows([{ id: uid(), subject: subject.trim(), type, raisedOn: today(), status: "open", note: note.trim() }, ...rows]);
    setSubject(""); setNote("");
    toast.success("Request logged — SLA clock started");
  };
  const setStatus = (id: string, status: DsrStatus) => setRows(rows.map(r => r.id === id ? { ...r, status } : r));
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Inbox size={14} className="text-[var(--color-primary)]" /> Data-Access & Erasure Request Tracker</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">When a customer or employee exercises a DPDP right — to access, correct, erase or port their data — log it here. Each request runs against a ~{DSR_SLA_DAYS}-day response clock.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Raised by</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Data subject name" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Request type</label>
            <select value={type} onChange={e => setType(e.target.value as DsrType)} className={INP}>
              {(Object.keys(DSR_TYPE_LABEL) as DsrType[]).map(t => <option key={t} value={t}>{DSR_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Scope / reference" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><Plus size={13} /> Log request</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No requests yet.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Raised by", "Type", "Raised", "Due in", "Status", "Action"].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const due = differenceInCalendarDays(addDays(parseISO(r.raisedOn), DSR_SLA_DAYS), new Date());
                  const closed = r.status === "fulfilled" || r.status === "rejected";
                  return (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-3 font-medium">{r.subject}{r.note && <p className="text-[10px] text-[var(--color-muted)] font-normal">{r.note}</p>}</td>
                      <td className="px-4 py-3 text-xs">{DSR_TYPE_LABEL[r.type]}</td>
                      <td className="px-4 py-3 text-xs tabular-nums text-[var(--color-muted)]">{r.raisedOn}</td>
                      <td className="px-4 py-3 text-xs tabular-nums">{closed ? "—" : <span className={due < 0 ? "text-red-400 font-semibold" : due <= 7 ? "text-yellow-400" : "text-[var(--color-muted)]"}>{due < 0 ? `${Math.abs(due)}d overdue` : `${due}d`}</span>}</td>
                      <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${DSR_STATUS_PILL[r.status]}`}>{r.status.replace("_", " ")}</span></td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <select value={r.status} onChange={e => setStatus(r.id, e.target.value as DsrStatus)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[11px] outline-none focus:border-[var(--color-primary)] mr-2">
                          {(Object.keys(DSR_STATUS_PILL) as DsrStatus[]).map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                        </select>
                        <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400 align-middle"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Data-Retention Policy Config ──────────────────────────────────────────────────
const DEFAULT_RETENTION: RetentionRow[] = [
  { id: "r1", category: "Books of account & invoices", years: 8, basis: "Income-tax Act / Companies Act" },
  { id: "r2", category: "GST records & returns", years: 6, basis: "CGST Act s.36" },
  { id: "r3", category: "Marketing contact lists", years: 2, basis: "Consent — DPDP minimisation" },
  { id: "r4", category: "Website analytics / logs", years: 1, basis: "Operational need" },
];
function RetentionPolicy() {
  const [rows, setRows] = useFeatureState<RetentionRow[]>("priv-retention", DEFAULT_RETENTION);
  const [category, setCategory] = useState("");
  const [years, setYears] = useState("3");
  const [basis, setBasis] = useState("");

  const add = () => {
    if (!category.trim()) { toast.error("Enter a data category"); return; }
    setRows([...rows, { id: uid(), category: category.trim(), years: Math.max(0, Math.round(parseFloat(years) || 0)), basis: basis.trim() || "Business need" }]);
    setCategory(""); setBasis("");
    toast.success("Retention rule added");
  };
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Clock4 size={14} className="text-[var(--color-primary)]" /> Data-Retention Policy</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Define how long you keep each data category and the legal or business basis. DPDP expects you to erase personal data once its purpose is served — unless a statute (tax, GST, companies law) mandates a longer hold.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Data category</label>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Vendor contracts" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Retain (years)</label>
            <input type="number" value={years} onChange={e => setYears(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Legal / business basis</label>
            <input value={basis} onChange={e => setBasis(e.target.value)} placeholder="Statute or need" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><Plus size={13} /> Add rule</button>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Data category", "Retention", "Basis", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-4 py-3 font-medium">{r.category}</td>
                  <td className="px-4 py-3 tabular-nums">{r.years === 0 ? "Until purpose ends" : `${r.years} year${r.years === 1 ? "" : "s"}`}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{r.basis}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Statutory minimums shown are typical — confirm exact periods with your CA. Set a calendar reminder to purge data once a clock expires and no legal hold applies.</p>
    </div>
  );
}

// ── Third-Party Data-Sharing Registry ─────────────────────────────────────────────
function ThirdPartyRegistry() {
  const [rows, setRows] = useFeatureState<ShareRow[]>("priv-shares", []);
  const [recipient, setRecipient] = useState("");
  const [dataShared, setDataShared] = useState("");
  const [purpose, setPurpose] = useState("");
  const [dpaSigned, setDpaSigned] = useState(false);

  const add = () => {
    if (!recipient.trim() || !dataShared.trim()) { toast.error("Enter the recipient and what data is shared"); return; }
    setRows([{ id: uid(), recipient: recipient.trim(), dataShared: dataShared.trim(), purpose: purpose.trim(), dpaSigned, sharedOn: today() }, ...rows]);
    setRecipient(""); setDataShared(""); setPurpose(""); setDpaSigned(false);
    toast.success("Recipient added to registry");
  };
  const toggleDpa = (id: string) => setRows(rows.map(r => r.id === id ? { ...r, dpaSigned: !r.dpaSigned } : r));
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  const unsigned = rows.filter(r => !r.dpaSigned).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Share2 size={14} className="text-[var(--color-primary)]" /> Third-Party Data-Sharing Registry</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Track every processor, SaaS tool or partner that receives personal data downstream — what you share, why, and whether a Data Processing Agreement (DPA) is on file. DPDP holds you accountable for your processors.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Recipient</label>
            <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. Mailchimp" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Data shared</label>
            <input value={dataShared} onChange={e => setDataShared(e.target.value)} placeholder="Email, name" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Purpose</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Newsletter" className={INP} />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer h-[38px]">
            <input type="checkbox" checked={dpaSigned} onChange={e => setDpaSigned(e.target.checked)} className="accent-[var(--color-primary)]" /> DPA signed
          </label>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><Plus size={13} /> Add</button>
        </div>
      </div>

      {unsigned > 0 && (
        <div className="rounded-lg p-3.5 border border-yellow-800/40 bg-yellow-950/20 flex items-center gap-2.5">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
          <p className="text-xs text-yellow-300">{unsigned} recipient(s) without a signed DPA. A processing agreement is your contractual safeguard if a processor mishandles data.</p>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No recipients recorded. Add each tool or partner you send personal data to.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Recipient", "Data shared", "Purpose", "Since", "DPA", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-3 font-medium">{r.recipient}</td>
                    <td className="px-4 py-3 text-xs">{r.dataShared}</td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{r.purpose || "—"}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-[var(--color-muted)]">{r.sharedOn}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleDpa(r.id)} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${r.dpaSigned ? "bg-green-950/30 text-green-400 border-green-800/40" : "bg-yellow-950/30 text-yellow-400 border-yellow-800/40"}`}>
                        {r.dpaSigned ? "Signed" : "Missing"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Consent-Expiry Calendar ────────────────────────────────────────────────────────
function ConsentExpiryCalendar() {
  const [rows] = useFeatureState<AAConsent[]>("priv-aa-consents", []);
  const now = new Date();

  const upcoming = useMemo(() =>
    rows
      .filter(r => r.status === "active" || r.status === "expired")
      .map(r => ({ ...r, days: differenceInCalendarDays(parseISO(r.expiresOn), now) }))
      .sort((a, b) => a.days - b.days),
  [rows, now]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Consent-Expiry Calendar</h2>
        <p className="text-xs text-[var(--color-muted)]">Every Account-Aggregator consent has a fixed validity. When it lapses, any lending or accounting flow that relies on that data silently breaks. Renew before expiry. Consents are pulled live from your AA register.</p>
      </div>

      {upcoming.length === 0 ? (
        <div className={`${CARD} p-10 text-center`}>
          <CalendarClock size={24} className="mx-auto text-[var(--color-muted)] mb-3 opacity-50" />
          <p className="text-sm font-medium mb-1">Nothing scheduled</p>
          <p className="text-xs text-[var(--color-muted)]">Add active consents in the AA Consent Register to see their expiry timeline here.</p>
        </div>
      ) : (
        <div className={`${CARD}`}>
          <div className="divide-y divide-[var(--color-border)]">
            {upcoming.map(r => {
              const past = r.days < 0;
              const urgent = r.days >= 0 && r.days <= 7;
              const soon = r.days > 7 && r.days <= 30;
              return (
                <div key={r.id} className={`flex items-center gap-4 px-5 py-3.5 ${past ? "opacity-60" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{r.fip} <span className="text-[var(--color-muted)] font-normal">via {r.aa}</span></p>
                    <p className="text-[11px] text-[var(--color-muted)] truncate">{r.purpose} · expires {r.expiresOn}</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    past ? "bg-red-950/30 text-red-400" :
                    urgent ? "bg-red-950/30 text-red-400" :
                    soon ? "bg-yellow-950/30 text-yellow-400" :
                    "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>
                    {past ? `Expired ${Math.abs(r.days)}d ago` : r.days === 0 ? "Expires today" : `${r.days}d left`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Privacy-Hygiene Checklist ──────────────────────────────────────────────────────
const HYGIENE_ITEMS = [
  { id: "h1", text: "Published a DPDP-compliant privacy notice on every collection touchpoint", weight: "high" },
  { id: "h2", text: "Appointed and published a Grievance Officer contact", weight: "high" },
  { id: "h3", text: "Maintain a consent log with lawful basis for each data subject", weight: "high" },
  { id: "h4", text: "Signed DPAs with every third-party processor", weight: "medium" },
  { id: "h5", text: "Defined retention periods and a purge process per data category", weight: "medium" },
  { id: "h6", text: "Documented a breach-detection and 'notify without delay' procedure", weight: "high" },
  { id: "h7", text: "Can fulfil access / erasure requests within ~30 days", weight: "medium" },
  { id: "h8", text: "Data minimisation reviewed — collect only what each purpose needs", weight: "medium" },
  { id: "h9", text: "Verifiable parental consent flow for any data subject under 18", weight: "low" },
  { id: "h10", text: "Sensitive data (PAN, Aadhaar, bank) stored encrypted on Indian soil", weight: "high" },
] as const;
function PrivacyHygiene() {
  const [checks, setChecks] = useFeatureState<Record<string, boolean>>("priv-hygiene", {});
  const done = HYGIENE_ITEMS.filter(h => checks[h.id]).length;
  const score = Math.round((done / HYGIENE_ITEMS.length) * 100);
  const toggle = (id: string) => setChecks({ ...checks, [id]: !checks[id] });

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><ListChecks size={14} className="text-[var(--color-primary)]" /> Privacy-Hygiene Checklist</h2>
            <p className="text-xs text-[var(--color-muted)]">Your DPDP readiness at a glance. Tick each control you have in place.</p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums ${score >= 80 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{score}%</p>
            <p className="text-[10px] text-[var(--color-muted)]">{done}/{HYGIENE_ITEMS.length} controls</p>
          </div>
        </div>
        <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, background: score >= 80 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444" }} />
        </div>
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {HYGIENE_ITEMS.map(h => (
          <button key={h.id} onClick={() => toggle(h.id)} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-white/2">
            {checks[h.id]
              ? <CheckCircle2 size={16} className="text-green-400 shrink-0" />
              : <div className="w-4 h-4 rounded-full border-2 border-[var(--color-border)] shrink-0" />}
            <span className={`text-sm flex-1 ${checks[h.id] ? "text-[var(--color-muted)] line-through" : ""}`}>{h.text}</span>
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0 ${h.weight === "high" ? "text-red-400 bg-red-950/30" : h.weight === "medium" ? "text-yellow-400 bg-yellow-950/30" : "text-[var(--color-muted)] bg-[var(--color-accent)]"}`}>{h.weight}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Data Inventory / Map ───────────────────────────────────────────────────────────
const SENS_PILL: Record<DataAsset["sensitivity"], string> = {
  low: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
  medium: "bg-yellow-950/30 text-yellow-400 border-yellow-800/40",
  high: "bg-red-950/30 text-red-400 border-red-800/40",
};
const DEFAULT_INVENTORY: DataAsset[] = [
  { id: "d1", element: "Customer name & contact", sensitivity: "medium", location: "App database (India)", purpose: "Order & support" },
  { id: "d2", element: "Bank transactions (AA)", sensitivity: "high", location: "Encrypted store (India)", purpose: "Cash-flow & lending" },
  { id: "d3", element: "PAN / GSTIN", sensitivity: "high", location: "KYC vault", purpose: "Tax & compliance" },
];
function DataInventory() {
  const { store } = useApp();
  const [rows, setRows] = useFeatureState<DataAsset[]>("priv-inventory", DEFAULT_INVENTORY);
  const [element, setElement] = useState("");
  const [sensitivity, setSensitivity] = useState<DataAsset["sensitivity"]>("medium");
  const [location, setLocation] = useState("");
  const [purpose, setPurpose] = useState("");

  // Surface live data volume so the inventory ties to real holdings, not just the manual map.
  const liveCounts = useMemo(() => ([
    { label: "Transactions held", value: store.transactions.length },
    { label: "Invoices", value: store.invoices.length },
    { label: "Orders", value: store.orders.length },
  ]), [store]);

  const add = () => {
    if (!element.trim()) { toast.error("Enter a data element"); return; }
    setRows([...rows, { id: uid(), element: element.trim(), sensitivity, location: location.trim() || "Unspecified", purpose: purpose.trim() || "—" }]);
    setElement(""); setLocation(""); setPurpose("");
    toast.success("Data element mapped");
  };
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));
  const highCount = rows.filter(r => r.sensitivity === "high").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {liveCounts.map(c => (
          <div key={c.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p><p className="text-xl font-bold tabular-nums">{c.value.toLocaleString("en-IN")}</p><p className="text-[10px] text-[var(--color-muted)] mt-0.5">Live in your store</p></div>
        ))}
        <div className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">High-sensitivity elements</p><p className={`text-xl font-bold tabular-nums ${highCount > 0 ? "text-red-400" : "text-green-400"}`}>{highCount}</p><p className="text-[10px] text-[var(--color-muted)] mt-0.5">Need strongest controls</p></div>
      </div>

      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Database size={14} className="text-[var(--color-primary)]" /> Personal-Data Inventory & Map</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Catalogue every category of personal data you hold, how sensitive it is, where it lives and why. This is the foundation of any DPDP audit — you can't protect what you haven't mapped.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Data element</label>
            <input value={element} onChange={e => setElement(e.target.value)} placeholder="e.g. Employee Aadhaar" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sensitivity</label>
            <select value={sensitivity} onChange={e => setSensitivity(e.target.value as DataAsset["sensitivity"])} className={INP}>
              {(["low", "medium", "high"] as const).map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Stored where</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="System / region" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Purpose</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Why held" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><Plus size={13} /> Map</button>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Data element", "Sensitivity", "Location", "Purpose", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-4 py-3 font-medium">{r.element}</td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${SENS_PILL[r.sensitivity]}`}>{r.sensitivity}</span></td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{r.location}</td>
                  <td className="px-4 py-3 text-xs">{r.purpose}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Breach-Notification Log ─────────────────────────────────────────────────────────
const SEV_PILL: Record<BreachSeverity, string> = {
  low: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
  medium: "bg-yellow-950/30 text-yellow-400 border-yellow-800/40",
  high: "bg-red-950/30 text-red-400 border-red-800/40",
};
function BreachLog() {
  const [rows, setRows] = useFeatureState<BreachRow[]>("priv-breaches", []);
  const [description, setDescription] = useState("");
  const [records, setRecords] = useState("");
  const [severity, setSeverity] = useState<BreachSeverity>("medium");
  // Indicative regulatory exposure (DPDP penalties run up to ₹250 crore for failure to safeguard).
  const PENALTY_PER_RECORD = 5000;

  const add = () => {
    if (!description.trim()) { toast.error("Describe the incident"); return; }
    setRows([{ id: uid(), detectedOn: today(), description: description.trim(), records: Math.max(0, Math.round(parseFloat(records) || 0)), severity, dpbNotified: false, subjectsNotified: false }, ...rows]);
    setDescription(""); setRecords("");
    toast.success("Incident logged — assess notification duties");
  };
  const toggle = (id: string, field: "dpbNotified" | "subjectsNotified") => setRows(rows.map(r => r.id === id ? { ...r, [field]: !r[field] } : r));
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  const affected = rows.reduce((s, r) => s + r.records, 0);
  const exposure = rows.filter(r => r.severity === "high").reduce((s, r) => s + r.records, 0) * PENALTY_PER_RECORD;
  const pendingDpb = rows.filter(r => !r.dpbNotified && r.severity !== "low").length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><AlertTriangle size={14} className="text-[var(--color-primary)]" /> Breach-Notification Log</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Record every personal-data breach, its scale and severity, and track whether you have notified the Data Protection Board and the affected individuals. The DPDP Act requires notification without delay.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Incident description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Misconfigured backup exposed customer emails" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Records affected</label>
            <input type="number" value={records} onChange={e => setRecords(e.target.value)} placeholder="0" className={INP} />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Severity</label>
              <select value={severity} onChange={e => setSeverity(e.target.value as BreachSeverity)} className={INP}>
                {(["low", "medium", "high"] as const).map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
            <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><Plus size={13} /></button>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Incidents logged", value: String(rows.length), color: "text-[var(--color-text)]" },
            { label: "Records affected", value: affected.toLocaleString("en-IN"), color: affected > 0 ? "text-yellow-400" : "text-green-400" },
            { label: "Pending DPB notice", value: String(pendingDpb), color: pendingDpb > 0 ? "text-red-400" : "text-green-400" },
            { label: "Indicative exposure", value: formatCurrency(exposure), color: "text-red-400" },
          ].map(k => (
            <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No breaches logged. Keep this register ready so an incident response is documented from minute one.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Detected", "Incident", "Records", "Severity", "DPB", "Subjects", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-3 text-xs tabular-nums text-[var(--color-muted)]">{r.detectedOn}</td>
                    <td className="px-4 py-3 text-xs max-w-[260px]">{r.description}</td>
                    <td className="px-4 py-3 tabular-nums text-xs">{r.records.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${SEV_PILL[r.severity]}`}>{r.severity}</span></td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggle(r.id, "dpbNotified")} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${r.dpbNotified ? "bg-green-950/30 text-green-400 border-green-800/40" : "bg-red-950/30 text-red-400 border-red-800/40"}`}>{r.dpbNotified ? "Notified" : "Pending"}</button>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggle(r.id, "subjectsNotified")} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${r.subjectsNotified ? "bg-green-950/30 text-green-400 border-green-800/40" : "bg-yellow-950/30 text-yellow-400 border-yellow-800/40"}`}>{r.subjectsNotified ? "Notified" : "Pending"}</button>
                    </td>
                    <td className="px-4 py-3 text-right"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Indicative exposure is a rough internal prompt (₹{PENALTY_PER_RECORD.toLocaleString("en-IN")}/high-severity record), not a legal estimate — DPDP penalties for failure to safeguard data can reach ₹250 crore. Notify the Data Protection Board promptly.</p>
    </div>
  );
}

// ── Privacy-Policy Generator ─────────────────────────────────────────────────────
interface PolicyFirm {
  name: string; email: string; officer: string; officerEmail: string;
  purposes: string; thirdParties: string; retention: string;
}
const POLICY_DEFAULT: PolicyFirm = {
  name: "", email: "", officer: "", officerEmail: "",
  purposes: "order fulfilment, invoicing, customer support and statutory compliance",
  thirdParties: "payment gateways, accounting/CA, logistics and email providers",
  retention: "as long as the purpose requires or a statute (Income-tax, GST, Companies Act) mandates",
};
function buildPolicy(f: PolicyFirm): string {
  const firm = f.name.trim() || "[Your firm]";
  const mail = f.email.trim() || "[contact email]";
  const officer = f.officer.trim() || "[Grievance Officer]";
  const offMail = f.officerEmail.trim() || mail;
  return [
    `PRIVACY NOTICE — ${firm}`,
    `Last updated: ${today()}`,
    ``,
    `${firm} ("we") acts as a Data Fiduciary under the Digital Personal Data Protection Act, 2023 (DPDP Act). This notice explains how we handle your personal data.`,
    ``,
    `1. DATA WE COLLECT`,
    `We collect personal data such as your name, contact details, and transaction or KYC information that you provide to us directly or that is shared with your consent (including via RBI-licensed Account Aggregators).`,
    ``,
    `2. PURPOSE`,
    `We process your personal data for ${f.purposes.trim() || "the stated business purposes"}. We collect only what each purpose requires (data minimisation).`,
    ``,
    `3. LAWFUL BASIS & CONSENT`,
    `We rely on your specific, informed and freely-given consent, or on legitimate uses permitted by the DPDP Act. You may withdraw consent at any time; withdrawal does not affect processing done before withdrawal.`,
    ``,
    `4. SHARING`,
    `We may share data with processors including ${f.thirdParties.trim() || "our service providers"}, each bound by a data processing agreement. We do not sell your personal data.`,
    ``,
    `5. RETENTION`,
    `We retain personal data ${f.retention.trim()}, after which it is erased.`,
    ``,
    `6. YOUR RIGHTS`,
    `You have the right to access, correct, complete, update and erase your personal data, to nominate, and to grievance redressal. To exercise these rights, contact us.`,
    ``,
    `7. GRIEVANCE OFFICER`,
    `${officer} — ${offMail}. We will respond to grievances within the timelines prescribed under the DPDP Act.`,
    ``,
    `8. CONTACT`,
    `${firm}, ${mail}.`,
  ].join("\n");
}
function PolicyGenerator() {
  const [f, setF] = useFeatureState<PolicyFirm>("priv-policy-firm", POLICY_DEFAULT);
  const set = (k: keyof PolicyFirm, v: string) => setF({ ...f, [k]: v });
  const text = useMemo(() => buildPolicy(f), [f]);
  const copy = () => { navigator.clipboard?.writeText(text); toast.success("Privacy notice copied to clipboard"); };

  const fields: { k: keyof PolicyFirm; label: string; placeholder: string; wide?: boolean }[] = [
    { k: "name", label: "Firm / business name", placeholder: "Acme Traders Pvt Ltd" },
    { k: "email", label: "Contact email", placeholder: "hello@acme.in" },
    { k: "officer", label: "Grievance Officer name", placeholder: "Priya Sharma" },
    { k: "officerEmail", label: "Grievance Officer email", placeholder: "privacy@acme.in" },
    { k: "purposes", label: "Purposes of processing", placeholder: "order fulfilment, support…", wide: true },
    { k: "thirdParties", label: "Processors / recipients", placeholder: "payment gateway, CA…", wide: true },
    { k: "retention", label: "Retention statement", placeholder: "as long as purpose requires…", wide: true },
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><FileText size={14} className="text-[var(--color-primary)]" /> Privacy-Policy Generator</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Fill in your firm details and get a plain-English DPDP-aligned privacy notice you can paste onto your website or signup form. Edit to suit, then have your CA or counsel confirm.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {fields.map(fl => (
            <div key={fl.k} className={fl.wide ? "md:col-span-2" : ""}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{fl.label}</label>
              <input value={f[fl.k]} onChange={e => set(fl.k, e.target.value)} placeholder={fl.placeholder} className={INP} />
            </div>
          ))}
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Generated notice</h3>
          <button onClick={copy} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-1.5 text-xs font-medium"><Copy size={12} /> Copy</button>
        </div>
        <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 max-h-[420px] overflow-y-auto">{text}</pre>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Template only — not legal advice. The DPDP Act expects notices to be clear and available in English and the Eighth-Schedule languages on request.</p>
    </div>
  );
}

// ── Cookie-Consent Config ──────────────────────────────────────────────────────────
interface CookieCfg {
  necessary: boolean; analytics: boolean; marketing: boolean; preferences: boolean;
  bannerText: string; rejectAll: boolean; granular: boolean;
}
const COOKIE_DEFAULT: CookieCfg = {
  necessary: true, analytics: false, marketing: false, preferences: false,
  bannerText: "We use cookies to run this site and, with your consent, to understand usage and personalise content. You can accept, reject or choose categories.",
  rejectAll: true, granular: true,
};
function CookieConsentConfig() {
  const [cfg, setCfg] = useFeatureState<CookieCfg>("priv-cookie-cfg", COOKIE_DEFAULT);
  const set = <K extends keyof CookieCfg>(k: K, v: CookieCfg[K]) => setCfg({ ...cfg, [k]: v });
  const toggleCat = (k: "analytics" | "marketing" | "preferences") => set(k, !cfg[k]);

  const categories: { k: "necessary" | "analytics" | "marketing" | "preferences"; label: string; desc: string; locked?: boolean }[] = [
    { k: "necessary", label: "Strictly necessary", desc: "Required for the site to work — no consent needed.", locked: true },
    { k: "analytics", label: "Analytics", desc: "Usage measurement (e.g. GA). Requires opt-in consent." },
    { k: "marketing", label: "Marketing / ads", desc: "Retargeting and ad pixels. Requires opt-in consent." },
    { k: "preferences", label: "Preferences", desc: "Remembers choices like language. Requires consent." },
  ];
  const compliant = cfg.rejectAll && cfg.granular;

  const snippet = useMemo(() => JSON.stringify({
    bannerText: cfg.bannerText.trim(),
    showRejectAll: cfg.rejectAll,
    granularChoice: cfg.granular,
    categories: {
      necessary: { enabled: true, consentRequired: false },
      analytics: { enabledByDefault: false, consentRequired: true, active: cfg.analytics },
      marketing: { enabledByDefault: false, consentRequired: true, active: cfg.marketing },
      preferences: { enabledByDefault: false, consentRequired: true, active: cfg.preferences },
    },
  }, null, 2), [cfg]);
  const copy = () => { navigator.clipboard?.writeText(snippet); toast.success("Cookie-banner config copied"); };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Cookie size={14} className="text-[var(--color-primary)]" /> Cookie-Consent Configurator</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Design a compliant cookie banner. Non-essential cookies must default OFF and only run after consent. Always offer a "Reject all" that is as easy as "Accept all".</p>
        <div className="space-y-2">
          {categories.map(c => (
            <div key={c.k} className="flex items-center gap-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <div className="flex-1">
                <p className="text-xs font-semibold">{c.label}</p>
                <p className="text-[10px] text-[var(--color-muted)]">{c.desc}</p>
              </div>
              <button disabled={c.locked} onClick={() => { if (!c.locked && c.k !== "necessary") toggleCat(c.k); }} aria-label={`Toggle ${c.label}`}
                className={`w-8 h-5 rounded-full relative transition-colors ${cfg[c.k] ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"} ${c.locked ? "opacity-50 cursor-not-allowed" : ""}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${cfg[c.k] ? "left-[14px]" : "left-0.5"}`} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Banner text</label>
          <textarea value={cfg.bannerText} onChange={e => set("bannerText", e.target.value)} rows={3} className={`${INP} resize-y`} />
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={cfg.rejectAll} onChange={e => set("rejectAll", e.target.checked)} className="accent-[var(--color-primary)]" /> Show "Reject all" button</label>
          <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={cfg.granular} onChange={e => set("granular", e.target.checked)} className="accent-[var(--color-primary)]" /> Allow per-category choice</label>
        </div>
      </div>

      <div className={`rounded-lg p-3.5 border flex items-center gap-2.5 ${compliant ? "border-green-800/40 bg-green-950/20" : "border-yellow-800/40 bg-yellow-950/20"}`}>
        {compliant ? <CheckCircle2 size={14} className="text-green-400 shrink-0" /> : <AlertTriangle size={14} className="text-yellow-400 shrink-0" />}
        <p className={`text-xs font-medium ${compliant ? "text-green-300" : "text-yellow-300"}`}>{compliant ? "Banner design meets the freely-given consent bar (reject + granular choice)." : "Add a 'Reject all' button and per-category choice so consent is genuinely freely given."}</p>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Config (hand to your developer)</h3>
          <button onClick={copy} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-1.5 text-xs font-medium"><Copy size={12} /> Copy JSON</button>
        </div>
        <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 overflow-x-auto">{snippet}</pre>
      </div>
    </div>
  );
}

// ── DPA Checklist ───────────────────────────────────────────────────────────────────
const DPA_ITEMS = [
  { id: "dp1", text: "Subject-matter, duration, nature and purpose of processing defined" },
  { id: "dp2", text: "Types of personal data and categories of data subjects listed" },
  { id: "dp3", text: "Processor acts only on the fiduciary's documented instructions" },
  { id: "dp4", text: "Confidentiality undertaking from everyone handling the data" },
  { id: "dp5", text: "Security safeguards (encryption, access control) specified" },
  { id: "dp6", text: "Sub-processor use requires prior written authorisation" },
  { id: "dp7", text: "Processor assists with data-subject rights requests" },
  { id: "dp8", text: "Processor notifies you of any breach without undue delay" },
  { id: "dp9", text: "Data returned or deleted at end of engagement, with proof" },
  { id: "dp10", text: "Audit / inspection rights granted to the fiduciary" },
  { id: "dp11", text: "Data localisation / cross-border terms align with DPDP rules" },
] as const;
function DpaChecklist() {
  const [vendor, setVendor] = useState("");
  const [checks, setChecks] = useFeatureState<Record<string, boolean>>("priv-dpa-checklist", {});
  const done = DPA_ITEMS.filter(i => checks[i.id]).length;
  const score = Math.round((done / DPA_ITEMS.length) * 100);
  const toggle = (id: string) => setChecks({ ...checks, [id]: !checks[id] });
  const reset = () => { setChecks({}); toast.success("Checklist reset for next vendor"); };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><FileCheck size={14} className="text-[var(--color-primary)]" /> Data-Processing-Agreement Checklist</h2>
            <p className="text-xs text-[var(--color-muted)]">Run this before signing any processor. Tick each clause your DPA covers.</p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums ${score >= 80 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{score}%</p>
            <p className="text-[10px] text-[var(--color-muted)]">{done}/{DPA_ITEMS.length} clauses</p>
          </div>
        </div>
        <div className="flex gap-2 items-end max-w-md">
          <div className="flex-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reviewing DPA for</label>
            <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor / processor name" className={INP} />
          </div>
          <button onClick={reset} className="flex items-center justify-center gap-1.5 bg-[var(--color-accent)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><RefreshCw size={13} /> Reset</button>
        </div>
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {DPA_ITEMS.map(i => (
          <button key={i.id} onClick={() => toggle(i.id)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-white/2">
            {checks[i.id] ? <CheckCircle2 size={16} className="text-green-400 shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-[var(--color-border)] shrink-0" />}
            <span className={`text-sm flex-1 ${checks[i.id] ? "text-[var(--color-muted)] line-through" : ""}`}>{i.text}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A DPA is your contractual safeguard under DPDP — the fiduciary stays accountable even when a processor mishandles data. Pair this with the Sharing Registry tab.</p>
    </div>
  );
}

// ── Grievance-Officer Register ───────────────────────────────────────────────────────
type GrievanceStatus = "open" | "in_progress" | "resolved";
interface Grievance { id: string; complainant: string; subject: string; raisedOn: string; status: GrievanceStatus; resolution: string }
const GRIEVANCE_SLA_DAYS = 30;
const GRIEVANCE_PILL: Record<GrievanceStatus, string> = {
  open: "bg-yellow-950/30 text-yellow-400 border-yellow-800/40",
  in_progress: "bg-blue-950/30 text-blue-400 border-blue-800/40",
  resolved: "bg-green-950/30 text-green-400 border-green-800/40",
};
function GrievanceOfficerRegister() {
  const [officer, setOfficer] = useFeatureState<{ name: string; email: string; phone: string }>("priv-grievance-officer", { name: "", email: "", phone: "" });
  const [rows, setRows] = useFeatureState<Grievance[]>("priv-grievances", []);
  const [complainant, setComplainant] = useState("");
  const [subject, setSubject] = useState("");

  const add = () => {
    if (!complainant.trim() || !subject.trim()) { toast.error("Enter who complained and about what"); return; }
    setRows([{ id: uid(), complainant: complainant.trim(), subject: subject.trim(), raisedOn: today(), status: "open", resolution: "" }, ...rows]);
    setComplainant(""); setSubject("");
    toast.success("Grievance logged — SLA clock started");
  };
  const setStatus = (id: string, status: GrievanceStatus) => setRows(rows.map(r => r.id === id ? { ...r, status } : r));
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));
  const overdue = rows.filter(r => r.status !== "resolved" && differenceInCalendarDays(addDays(parseISO(r.raisedOn), GRIEVANCE_SLA_DAYS), new Date()) < 0).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><UserCheck size={14} className="text-[var(--color-primary)]" /> Grievance-Officer Register</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">The DPDP Act requires you to publish a Grievance Officer and resolve data-subject grievances within prescribed timelines. Record the officer and every grievance here.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Grievance Officer name</label><input value={officer.name} onChange={e => setOfficer({ ...officer, name: e.target.value })} placeholder="Priya Sharma" className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Officer email</label><input value={officer.email} onChange={e => setOfficer({ ...officer, email: e.target.value })} placeholder="privacy@firm.in" className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Officer phone</label><input value={officer.phone} onChange={e => setOfficer({ ...officer, phone: e.target.value })} placeholder="+91…" className={INP} /></div>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold mb-3">Log a grievance</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Complainant</label><input value={complainant} onChange={e => setComplainant(e.target.value)} placeholder="Name" className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="What is the grievance about" className={INP} /></div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><Plus size={13} /> Log</button>
        </div>
      </div>

      {overdue > 0 && (
        <div className="rounded-lg p-3.5 border border-red-800/40 bg-red-950/20 flex items-center gap-2.5">
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{overdue} grievance(s) past the ~{GRIEVANCE_SLA_DAYS}-day response window. Resolve and document promptly.</p>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No grievances logged yet — this register is ready when the first one arrives.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Complainant", "Subject", "Raised", "Due in", "Status", ""].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => {
                  const due = differenceInCalendarDays(addDays(parseISO(r.raisedOn), GRIEVANCE_SLA_DAYS), new Date());
                  const closed = r.status === "resolved";
                  return (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-3 font-medium">{r.complainant}</td>
                      <td className="px-4 py-3 text-xs">{r.subject}</td>
                      <td className="px-4 py-3 text-xs tabular-nums text-[var(--color-muted)]">{r.raisedOn}</td>
                      <td className="px-4 py-3 text-xs tabular-nums">{closed ? "—" : <span className={due < 0 ? "text-red-400 font-semibold" : due <= 7 ? "text-yellow-400" : "text-[var(--color-muted)]"}>{due < 0 ? `${Math.abs(due)}d overdue` : `${due}d`}</span>}</td>
                      <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${GRIEVANCE_PILL[r.status]}`}>{r.status.replace("_", " ")}</span></td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <select value={r.status} onChange={e => setStatus(r.id, e.target.value as GrievanceStatus)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[11px] outline-none focus:border-[var(--color-primary)] mr-2">
                          {(Object.keys(GRIEVANCE_PILL) as GrievanceStatus[]).map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                        </select>
                        <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400 align-middle"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Consent-Rate Dashboard ───────────────────────────────────────────────────────────
function ConsentRateDashboard() {
  const [dpdp] = useFeatureState<DpdpEntry[]>("priv-dpdp-log", []);

  const stats = useMemo(() => {
    const total = dpdp.length;
    const live = dpdp.filter(d => d.granted).length;
    const withdrawn = total - live;
    const rate = total ? Math.round((live / total) * 100) : 0;
    const byChannel = new Map<string, { total: number; live: number }>();
    dpdp.forEach(d => {
      const c = byChannel.get(d.channel) ?? { total: 0, live: 0 };
      c.total += 1; if (d.granted) c.live += 1;
      byChannel.set(d.channel, c);
    });
    const channels = Array.from(byChannel.entries())
      .map(([channel, v]) => ({ channel, ...v, rate: Math.round((v.live / v.total) * 100) }))
      .sort((a, b) => b.total - a.total);
    return { total, live, withdrawn, rate, channels };
  }, [dpdp]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><BarChart3 size={14} className="text-[var(--color-primary)]" /> Consent-Rate Dashboard</h2>
        <p className="text-xs text-[var(--color-muted)]">How healthy is your consent base? A high withdrawal rate or a low-converting channel often signals a confusing notice or a dark pattern worth fixing. Data is pulled live from your DPDP Consent Log.</p>
      </div>

      {stats.total === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No consents logged yet. Add entries in the DPDP Consent Log to see rates here.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Active-consent rate", value: `${stats.rate}%`, color: stats.rate >= 80 ? "text-green-400" : stats.rate >= 50 ? "text-yellow-400" : "text-red-400" },
              { label: "Total subjects", value: String(stats.total), color: "text-[var(--color-text)]" },
              { label: "Currently granted", value: String(stats.live), color: "text-green-400" },
              { label: "Withdrawn", value: String(stats.withdrawn), color: stats.withdrawn > 0 ? "text-yellow-400" : "text-[var(--color-muted)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
            ))}
          </div>

          <div className={`${CARD} p-5`}>
            <h3 className="text-sm font-semibold mb-3">Consent rate by collection channel</h3>
            <div className="space-y-3">
              {stats.channels.map(c => (
                <div key={c.channel}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{c.channel}</span>
                    <span className="text-[var(--color-muted)] tabular-nums">{c.live}/{c.total} live · {c.rate}%</span>
                  </div>
                  <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${c.rate}%`, background: c.rate >= 80 ? "#22c55e" : c.rate >= 50 ? "#eab308" : "#ef4444" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Data-Classification Matrix ───────────────────────────────────────────────────────
type ClassTier = "public" | "internal" | "confidential" | "sensitive";
interface ClassRow { id: string; element: string; tier: ClassTier; handling: string }
const CLASS_TIER_PILL: Record<ClassTier, string> = {
  public: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
  internal: "bg-blue-950/30 text-blue-400 border-blue-800/40",
  confidential: "bg-yellow-950/30 text-yellow-400 border-yellow-800/40",
  sensitive: "bg-red-950/30 text-red-400 border-red-800/40",
};
const CLASS_HANDLING: Record<ClassTier, string> = {
  public: "No restriction; may be shared freely",
  internal: "Staff only; access on need-to-know",
  confidential: "Encrypted at rest; restricted access + DPA before sharing",
  sensitive: "Encrypted; India-resident store; strict logging (PAN/Aadhaar/bank/health)",
};
const CLASS_DEFAULT: ClassRow[] = [
  { id: "c1", element: "Marketing brochure content", tier: "public", handling: CLASS_HANDLING.public },
  { id: "c2", element: "Internal pricing sheet", tier: "internal", handling: CLASS_HANDLING.internal },
  { id: "c3", element: "Customer contact list", tier: "confidential", handling: CLASS_HANDLING.confidential },
  { id: "c4", element: "PAN / Aadhaar / bank statements", tier: "sensitive", handling: CLASS_HANDLING.sensitive },
];
function ClassificationMatrix() {
  const [rows, setRows] = useFeatureState<ClassRow[]>("priv-classification", CLASS_DEFAULT);
  const [element, setElement] = useState("");
  const [tier, setTier] = useState<ClassTier>("confidential");

  const add = () => {
    if (!element.trim()) { toast.error("Enter a data element"); return; }
    setRows([...rows, { id: uid(), element: element.trim(), tier, handling: CLASS_HANDLING[tier] }]);
    setElement("");
    toast.success("Element classified");
  };
  const setTierOf = (id: string, t: ClassTier) => setRows(rows.map(r => r.id === id ? { ...r, tier: t, handling: CLASS_HANDLING[t] } : r));
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Layers size={14} className="text-[var(--color-primary)]" /> Data-Classification Matrix</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Tag each data element with a sensitivity tier so the right handling rules apply. Classification is the basis for proportionate security — you protect the riskiest data hardest.</p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Data element</label>
            <input value={element} onChange={e => setElement(e.target.value)} placeholder="e.g. Supplier bank details" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tier</label>
            <select value={tier} onChange={e => setTier(e.target.value as ClassTier)} className={INP}>
              {(Object.keys(CLASS_TIER_PILL) as ClassTier[]).map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><Plus size={13} /> Classify</button>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Data element", "Tier", "Required handling", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-4 py-3 font-medium">{r.element}</td>
                  <td className="px-4 py-3">
                    <select value={r.tier} onChange={e => setTierOf(r.id, e.target.value as ClassTier)} className={`text-[10px] font-semibold px-2 py-1 rounded-full border capitalize outline-none ${CLASS_TIER_PILL[r.tier]}`}>
                      {(Object.keys(CLASS_TIER_PILL) as ClassTier[]).map(t => <option key={t} value={t} className="capitalize bg-[var(--color-bg)] text-[var(--color-text)]">{t}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{r.handling}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Employee Data-Handling Training Log ───────────────────────────────────────────────
interface TrainingRow { id: string; employee: string; role: string; trainedOn: string; validMonths: number }
function TrainingLog() {
  const [rows, setRows] = useFeatureState<TrainingRow[]>("priv-training", []);
  const [employee, setEmployee] = useState("");
  const [role, setRole] = useState("");
  const [validMonths, setValidMonths] = useState("12");

  const add = () => {
    if (!employee.trim()) { toast.error("Enter the employee name"); return; }
    setRows([{ id: uid(), employee: employee.trim(), role: role.trim() || "Staff", trainedOn: today(), validMonths: Math.max(1, Math.round(parseFloat(validMonths) || 12)) }, ...rows]);
    setEmployee(""); setRole("");
    toast.success("Training recorded");
  };
  const renew = (id: string) => setRows(rows.map(r => r.id === id ? { ...r, trainedOn: today() } : r));
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  const current = rows.filter(r => differenceInCalendarDays(addDays(parseISO(r.trainedOn), r.validMonths * 30), new Date()) >= 0).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><GraduationCap size={14} className="text-[var(--color-primary)]" /> Employee Data-Handling Training Log</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Most breaches are human. Record who has been trained on data handling and consent, and when their training lapses. An auditor will ask for this.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Employee</label><input value={employee} onChange={e => setEmployee(e.target.value)} placeholder="Name" className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Role</label><input value={role} onChange={e => setRole(e.target.value)} placeholder="Sales / Finance / Ops" className={INP} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Valid (months)</label><input type="number" value={validMonths} onChange={e => setValidMonths(e.target.value)} className={INP} /></div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><Plus size={13} /> Record</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No training recorded yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Staff trained", value: String(rows.length), color: "text-[var(--color-text)]" },
              { label: "Currently valid", value: String(current), color: "text-green-400" },
              { label: "Needs refresh", value: String(rows.length - current), color: rows.length - current > 0 ? "text-yellow-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Employee", "Role", "Trained", "Expires", "Status", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => {
                    const expiry = addDays(parseISO(r.trainedOn), r.validMonths * 30);
                    const days = differenceInCalendarDays(expiry, new Date());
                    const valid = days >= 0;
                    return (
                      <tr key={r.id} className="hover:bg-white/2">
                        <td className="px-4 py-3 font-medium">{r.employee}</td>
                        <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{r.role}</td>
                        <td className="px-4 py-3 text-xs tabular-nums text-[var(--color-muted)]">{r.trainedOn}</td>
                        <td className="px-4 py-3 text-xs tabular-nums">{expiry.toISOString().split("T")[0]}</td>
                        <td className="px-4 py-3">
                          {valid
                            ? <span className="inline-flex items-center gap-1 text-xs text-green-400 font-semibold"><CheckCircle2 size={12} /> Valid {days <= 30 ? `(${days}d)` : ""}</span>
                            : <span className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold"><XCircle size={12} /> Expired</span>}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={() => renew(r.id)} className="inline-flex items-center gap-1 text-[10px] text-green-400 hover:underline mr-3"><RefreshCw size={11} /> Renew</button>
                          <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400 align-middle"><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── DPDP Penalty-Exposure Estimator ───────────────────────────────────────────────────
const PENALTY_SCHEDULE = [
  { id: "p1", label: "Failure to take reasonable security safeguards (breach)", max: 2500000000 },
  { id: "p2", label: "Failure to notify a breach to the Board / data subjects", max: 2000000000 },
  { id: "p3", label: "Breach of additional obligations for children's data", max: 2000000000 },
  { id: "p4", label: "Breach of Significant-Data-Fiduciary obligations", max: 1500000000 },
  { id: "p5", label: "Breach of any other DPDP provision / rule", max: 500000000 },
] as const;
function PenaltyEstimator() {
  const [gaps, setGaps] = useFeatureState<Record<string, boolean>>("priv-penalty-gaps", {});
  const [likelihood, setLikelihood] = useState("25");

  const toggle = (id: string) => setGaps({ ...gaps, [id]: !gaps[id] });
  const lk = Math.min(100, Math.max(0, parseFloat(likelihood) || 0)) / 100;
  const headline = PENALTY_SCHEDULE.filter(p => gaps[p.id]).reduce((s, p) => s + p.max, 0);
  const adjusted = Math.round(headline * lk);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Calculator size={14} className="text-[var(--color-primary)]" /> DPDP Penalty-Exposure Estimator</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Tick the obligations you are currently exposed on. This sums the statutory maximum penalties under the DPDP Act 2023 schedule, then applies a rough likelihood weighting to size your remediation budget.</p>
        <div className="space-y-2">
          {PENALTY_SCHEDULE.map(p => (
            <button key={p.id} onClick={() => toggle(p.id)} className="w-full flex items-center gap-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-left hover:border-[var(--color-primary)]/40">
              {gaps[p.id] ? <CheckCircle2 size={16} className="text-red-400 shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-[var(--color-border)] shrink-0" />}
              <span className="text-xs flex-1">{p.label}</span>
              <span className="text-[11px] tabular-nums text-[var(--color-muted)]">up to {formatCurrency(p.max)}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Estimated likelihood of action (%)</label>
          <input type="number" value={likelihood} onChange={e => setLikelihood(e.target.value)} className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={`${CARD} p-5`}>
          <p className="text-xs text-[var(--color-muted)] mb-1">Headline maximum exposure</p>
          <p className="text-2xl font-bold tabular-nums text-red-400">{formatCurrency(headline)}</p>
          <p className="text-[10px] text-[var(--color-muted)] mt-1">Sum of statutory caps for ticked gaps</p>
        </div>
        <div className={`${CARD} p-5`}>
          <p className="text-xs text-[var(--color-muted)] mb-1">Likelihood-weighted exposure</p>
          <p className="text-2xl font-bold tabular-nums text-yellow-400">{formatCurrency(adjusted)}</p>
          <p className="text-[10px] text-[var(--color-muted)] mt-1">At {Math.round(lk * 100)}% likelihood — budgeting figure only</p>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Caps reflect the DPDP Act 2023 penalty schedule (the Board decides actual amounts case-by-case). This is a prioritisation aid, not a legal or actuarial estimate.</p>
    </div>
  );
}

// ── Data-Localization Checklist ────────────────────────────────────────────────────────
const LOCALIZATION_ITEMS = [
  { id: "l1", text: "Primary database hosted in an Indian region" },
  { id: "l2", text: "Backups and replicas pinned to Indian soil" },
  { id: "l3", text: "Payment data complies with RBI data-localisation circular" },
  { id: "l4", text: "Aadhaar / biometric data stored only in India (UIDAI rules)" },
  { id: "l5", text: "No personal data sent to jurisdictions restricted by the Govt." },
  { id: "l6", text: "Each cross-border transfer logged with a lawful basis" },
  { id: "l7", text: "SaaS/analytics vendors confirm Indian or approved data residency" },
  { id: "l8", text: "Cloud region & residency clause written into vendor contracts" },
] as const;
function LocalizationChecklist() {
  const [checks, setChecks] = useFeatureState<Record<string, boolean>>("priv-localization", {});
  const done = LOCALIZATION_ITEMS.filter(i => checks[i.id]).length;
  const score = Math.round((done / LOCALIZATION_ITEMS.length) * 100);
  const toggle = (id: string) => setChecks({ ...checks, [id]: !checks[id] });

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><MapPin size={14} className="text-[var(--color-primary)]" /> Data-Localization Checklist</h2>
            <p className="text-xs text-[var(--color-muted)]">Confirm where your regulated data physically lives. Many Indian clients now demand localisation assurance.</p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums ${score >= 80 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{score}%</p>
            <p className="text-[10px] text-[var(--color-muted)]">{done}/{LOCALIZATION_ITEMS.length} confirmed</p>
          </div>
        </div>
        <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, background: score >= 80 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444" }} />
        </div>
      </div>

      <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
        {LOCALIZATION_ITEMS.map(i => (
          <button key={i.id} onClick={() => toggle(i.id)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-white/2">
            {checks[i.id] ? <CheckCircle2 size={16} className="text-green-400 shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-[var(--color-border)] shrink-0" />}
            <span className={`text-sm flex-1 ${checks[i.id] ? "text-[var(--color-muted)] line-through" : ""}`}>{i.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Marketing-Consent (Opt-in/out) Register ───────────────────────────────────────────
interface MarketingRow { id: string; contact: string; channel: string; optedIn: boolean; updatedOn: string }
function MarketingConsentRegister() {
  const [rows, setRows] = useFeatureState<MarketingRow[]>("priv-marketing-consent", []);
  const [contact, setContact] = useState("");
  const [channel, setChannel] = useState("Email");
  const [optedIn, setOptedIn] = useState(true);

  const add = () => {
    if (!contact.trim()) { toast.error("Enter the contact (email / phone)"); return; }
    setRows([{ id: uid(), contact: contact.trim(), channel, optedIn, updatedOn: today() }, ...rows]);
    setContact("");
    toast.success("Marketing preference recorded");
  };
  const toggle = (id: string) => setRows(rows.map(r => r.id === id ? { ...r, optedIn: !r.optedIn, updatedOn: today() } : r));
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  const optedInCount = rows.filter(r => r.optedIn).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Megaphone size={14} className="text-[var(--color-primary)]" /> Marketing-Consent Register</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Only message contacts who have opted in. Record each opt-in / opt-out so you can prove consent for promotional communications and honour withdrawals (also relevant to TRAI / DLT rules).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Contact</label><input value={contact} onChange={e => setContact(e.target.value)} placeholder="email / phone" className={INP} /></div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value)} className={INP}>
              {["Email", "SMS", "WhatsApp", "Phone", "Push"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer h-[38px]"><input type="checkbox" checked={optedIn} onChange={e => setOptedIn(e.target.checked)} className="accent-[var(--color-primary)]" /> Opted in</label>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium h-[38px]"><Plus size={13} /> Add</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No marketing preferences recorded yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total contacts", value: String(rows.length), color: "text-[var(--color-text)]" },
              { label: "Opted in", value: String(optedInCount), color: "text-green-400" },
              { label: "Opted out", value: String(rows.length - optedInCount), color: "text-[var(--color-muted)]" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Contact", "Channel", "Status", "Updated", ""].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-3 font-medium">{r.contact}</td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{r.channel}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggle(r.id)} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${r.optedIn ? "bg-green-950/30 text-green-400 border-green-800/40" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{r.optedIn ? "Opted in" : "Opted out"}</button>
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-[var(--color-muted)]">{r.updatedOn}</td>
                      <td className="px-4 py-3 text-right"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Subject-Access-Request SLA Timer ─────────────────────────────────────────────────
function SarSlaTimer() {
  const [dsr] = useFeatureState<DsrRequest[]>("priv-dsr", []);
  const now = new Date();

  const live = useMemo(() =>
    dsr
      .filter(d => d.status === "open" || d.status === "in_progress")
      .map(d => ({ ...d, days: differenceInCalendarDays(addDays(parseISO(d.raisedOn), DSR_SLA_DAYS), now) }))
      .sort((a, b) => a.days - b.days),
  [dsr, now]);

  const overdue = live.filter(d => d.days < 0).length;
  const urgent = live.filter(d => d.days >= 0 && d.days <= 7).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Timer size={14} className="text-[var(--color-primary)]" /> Subject-Access-Request SLA Timer</h2>
        <p className="text-xs text-[var(--color-muted)]">A live countdown for every open data-rights request against the ~{DSR_SLA_DAYS}-day DPDP response clock. Open and in-progress requests are pulled live from the Access / Erasure tracker.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open requests", value: String(live.length), color: live.length > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Due within 7 days", value: String(urgent), color: urgent > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Overdue", value: String(overdue), color: overdue > 0 ? "text-red-400" : "text-green-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}><p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p><p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p></div>
        ))}
      </div>

      {live.length === 0 ? (
        <div className={`${CARD} p-10 text-center`}>
          <Timer size={24} className="mx-auto text-[var(--color-muted)] mb-3 opacity-50" />
          <p className="text-sm font-medium mb-1">No open requests</p>
          <p className="text-xs text-[var(--color-muted)]">Log access / correction / erasure requests in the Access / Erasure tab and their SLA timers appear here.</p>
        </div>
      ) : (
        <div className={`${CARD}`}>
          <div className="divide-y divide-[var(--color-border)]">
            {live.map(r => {
              const past = r.days < 0;
              const soon = r.days >= 0 && r.days <= 7;
              const pct = Math.min(100, Math.max(0, Math.round(((DSR_SLA_DAYS - r.days) / DSR_SLA_DAYS) * 100)));
              return (
                <div key={r.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{r.subject} <span className="text-[var(--color-muted)] font-normal">· {DSR_TYPE_LABEL[r.type]}</span></p>
                      <p className="text-[11px] text-[var(--color-muted)]">Raised {r.raisedOn}{r.note ? ` · ${r.note}` : ""}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${past ? "bg-red-950/30 text-red-400" : soon ? "bg-yellow-950/30 text-yellow-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>
                      {past ? `${Math.abs(r.days)}d overdue` : r.days === 0 ? "Due today" : `${r.days}d left`}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden mt-2">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: past ? "#ef4444" : soon ? "#eab308" : "#22c55e" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Update statuses in the Access / Erasure tab — fulfilled and rejected requests drop off this timer automatically.</p>
    </div>
  );
}
