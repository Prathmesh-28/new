import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";

// Headroom's own published Privacy Policy (DPDP Act 2023) — a real, public, hosted page.
// Until now the homepage footer's Privacy link pointed at an unset admin setting that
// resolved to "#" (2026-07 gap audit, D1) and nothing linked to it from signup. This is
// the actual policy content; it reflects what the product genuinely does (consent ledger,
// export/erasure endpoints, retention windows) rather than boilerplate — keep it in sync
// with backend/src/routes/account.js and docs/COMPLIANCE.md if either changes.
const LAST_UPDATED = "5 July 2026";

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Who we are",
    body: <p>Headroom Technologies Pvt. Ltd. ("Headroom", "we") operates a finance and accounting platform for Indian small and medium businesses. This policy explains what personal and business data we collect, why, and the rights you have over it under the Digital Personal Data Protection Act, 2023 ("DPDP Act").</p>,
  },
  {
    title: "2. What we collect",
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li><strong>Account data</strong> — name, email, phone, role, and your organisation's identity (company name, GSTIN, PAN, address) when you sign up or complete your company profile.</li>
        <li><strong>Financial data you enter or connect</strong> — invoices, transactions, bank balances, payroll, tax filings, and credit applications you or your team create, or that a connected bank/GST/payment rail syncs on your instruction.</li>
        <li><strong>Usage data</strong> — login times, device/browser type, and in-app activity, used to secure your account (e.g. showing your team their last-login) and improve the product.</li>
        <li><strong>Uploaded files</strong> — receipts, documents, and attachments you add to the platform.</li>
      </ul>
    ),
  },
  {
    title: "3. Why we process it (purpose limitation)",
    body: <p>Every purpose is tied to running your accounting, tax, payroll, and credit-decisioning workflows — never sold to third parties, and never used to train models outside your own tenant without a separate, explicit opt-in. Where we rely on a partner (a bank, GST/e-invoice provider, payment gateway, or lending partner) to complete an action you asked for, we share only the minimum data that action needs.</p>,
  },
  {
    title: "4. Your rights",
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li><strong>Access / portability</strong> — download a machine-readable export of your data anytime from Settings → Privacy &amp; Data.</li>
        <li><strong>Erasure</strong> — request deletion of your account and personal data from the same page. Statutory records (invoices, GST filings, loan/credit records, transaction ledgers) are retained for the legally required period — typically 8 years under GST/Income Tax law, and for RBI-regulated credit records — after which they are purged; everything else is erased on request.</li>
        <li><strong>Consent withdrawal</strong> — every optional data use (e.g. marketing, an integration) is tracked in a consent ledger you can review and revoke at any time.</li>
        <li><strong>Grievance redressal</strong> — contact our Grievance Officer (see Settings → Privacy &amp; Data for the current contact) with any complaint; we respond within 30 days as required by the DPDP Act.</li>
      </ul>
    ),
  },
  {
    title: "5. How we protect it",
    body: <p>Data is encrypted in transit (TLS) and access-controlled by role within your organisation. Every table is scoped to your tenant so no other business can see your data. Passwords are hashed, never stored in plain text; sensitive secrets (like two-factor keys) are encrypted at rest.</p>,
  },
  {
    title: "6. Retention",
    body: <p>We keep account and product-usage data for as long as your account is active, plus a short window after closure to handle disputes and legal obligations. Statutory financial records follow the retention schedule in §4. You can see and manage this from Settings → Privacy &amp; Data → Data Retention.</p>,
  },
  {
    title: "7. Changes to this policy",
    body: <p>If we make a material change, we'll notify you in-app before it takes effect. The "last updated" date below always reflects the current version.</p>,
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="border-b border-[var(--color-border)]">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
            <Shield size={16} className="text-[var(--color-primary)]" />
            Head<span className="text-[var(--color-primary)]">room</span>
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
            <ArrowLeft size={13} /> Back to home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-1">Privacy Policy</h1>
        <p className="text-xs text-[var(--color-muted)] mb-10">Last updated {LAST_UPDATED} · Effective for all Headroom accounts</p>

        <div className="space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-base font-semibold mb-2">{s.title}</h2>
              <div className="text-sm text-[var(--color-muted)] leading-relaxed">{s.body}</div>
            </section>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-[var(--color-border)] text-xs text-[var(--color-muted)]">
          Questions about this policy or your data? Manage consent, exports, and erasure requests from{" "}
          <span className="text-[var(--color-text)]">Settings → Privacy &amp; Data</span> once signed in, or reach our Grievance Officer at the contact listed there.
        </div>
      </main>
    </div>
  );
}
