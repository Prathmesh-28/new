import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { toast } from "sonner";
import Logo from "@/components/Logo";
import { ArrowRight, Loader2, Check } from "lucide-react";

// Post-signup onboarding — the high-intent moment to capture business profile +
// goal + acquisition source (segmentation gold). Writes to /api/analytics/profile.
// Kept short on purpose; everything is skippable so it never blocks getting in.
const INDUSTRIES = ["Manufacturing", "Retail / Wholesale", "Services", "IT / Software", "Logistics", "Construction", "Hospitality", "Healthcare", "Education", "Agriculture", "E-commerce", "Other"];
const BIZ_TYPES = ["Proprietorship", "Partnership", "LLP", "Private Limited", "Other"];
const TURNOVER = ["< ₹40L", "₹40L - ₹1Cr", "₹1Cr - ₹5Cr", "₹5Cr - ₹25Cr", "₹25Cr+"];
const TEAM = ["Just me", "2-10", "11-50", "51-200", "200+"];
const GOALS = [
  { id: "get_paid", label: "Get paid faster (invoices, collections)" },
  { id: "file_gst", label: "File GST & stay compliant" },
  { id: "manage_cash", label: "See cash flow & runway" },
  { id: "get_funding", label: "Access credit / raise capital" },
  { id: "run_books", label: "Run my accounting / books" },
];
const SOURCES = ["Google search", "Referral / word of mouth", "Social media", "My CA / accountant", "Ad", "Other"];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Record<string, string | boolean>>({ gst_registered: false });
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const finish = async (skip = false) => {
    setBusy(true);
    try {
      if (!skip) await api.post("/api/analytics/profile", f);
      track(skip ? "onboarding_skipped" : "onboarding_completed", skip ? {} : { industry: f.industry, primary_goal: f.primary_goal });
    } catch { /* don't block entry on a profile-save hiccup */ }
    finally {
      setBusy(false);
      navigate("/dashboard", { replace: true });
    }
  };

  const Pill = ({ k, val, children }: { k: string; val: string; children: React.ReactNode }) => (
    <button type="button" onClick={() => set(k, val)}
      className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors ${f[k] === val ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/40"}`}>
      {children}
    </button>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div><p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">{title}</p>{children}</div>
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <Logo variant="horizontal" size={22} className="text-[var(--color-text)] mb-6" />
        <h1 className="text-2xl font-bold mb-1">Tell us about your business</h1>
        <p className="text-sm text-[var(--color-muted)] mb-6">A few quick answers so we can tailor Headroom to you. You can skip and do this later.</p>

        <div className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6">
          <Section title="What's your goal first?">
            <div className="grid gap-2">{GOALS.map((g) => <Pill key={g.id} k="primary_goal" val={g.id}>{g.label}</Pill>)}</div>
          </Section>
          <Section title="Industry">
            <div className="flex flex-wrap gap-2">{INDUSTRIES.map((x) => <Pill key={x} k="industry" val={x}>{x}</Pill>)}</div>
          </Section>
          <div className="grid sm:grid-cols-2 gap-5">
            <Section title="Business type"><div className="flex flex-wrap gap-2">{BIZ_TYPES.map((x) => <Pill key={x} k="business_type" val={x}>{x}</Pill>)}</div></Section>
            <Section title="Team size"><div className="flex flex-wrap gap-2">{TEAM.map((x) => <Pill key={x} k="team_size" val={x}>{x}</Pill>)}</div></Section>
          </div>
          <Section title="Annual turnover"><div className="flex flex-wrap gap-2">{TURNOVER.map((x) => <Pill key={x} k="turnover_band" val={x}>{x}</Pill>)}</div></Section>
          <Section title="GST registered?">
            <div className="flex gap-2">
              <Pill k="gst_registered" val={true as unknown as string}>Yes</Pill>
              <Pill k="gst_registered" val={false as unknown as string}>No / not yet</Pill>
            </div>
            {f.gst_registered === true && (
              <input value={(f.gstin as string) || ""} onChange={(e) => set("gstin", e.target.value)} placeholder="GSTIN (optional)"
                className="mt-2 w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
            )}
          </Section>
          <div className="grid sm:grid-cols-2 gap-5">
            <Section title="City"><input value={(f.city as string) || ""} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Pune" className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" /></Section>
            <Section title="State"><input value={(f.state as string) || ""} onChange={(e) => set("state", e.target.value)} placeholder="e.g. Maharashtra" className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" /></Section>
          </div>
          <Section title="How did you hear about us?"><div className="flex flex-wrap gap-2">{SOURCES.map((x) => <Pill key={x} k="acquisition_source" val={x}>{x}</Pill>)}</div></Section>
        </div>

        <div className="flex items-center justify-between mt-5">
          <button onClick={() => finish(true)} disabled={busy} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">Skip for now</button>
          <button onClick={() => finish(false)} disabled={busy}
            className="flex items-center gap-2 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold rounded-lg px-5 py-2.5 text-sm hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Finish setup <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
