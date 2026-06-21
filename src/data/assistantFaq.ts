// Cross-cutting Q&A for the Headroom Assistant — the "how do I…" questions that
// span features (onboarding, data, plans, roles, mobile, security). Per-feature
// "what is X / how do I use X" answers come from FEATURE_GUIDES; this fills the gaps
// between features. Each answer is detailed and references real buttons/routes.

export interface FaqEntry {
  category: string;
  q: string;
  a: string;
  route?: string;        // optional "take me there" deep link
  keywords?: string;     // extra search terms
}

export const CURATED_FAQ: FaqEntry[] = [
  // ── Getting started ─────────────────────────────────────────────────────────
  { category: "Getting started", q: "How do I set up Headroom for the first time?",
    a: "On your Dashboard you'll see a 'Get set up' checklist tailored to your role. For an owner it walks you through 5 steps: (1) set your business name & GSTIN in Settings, (2) create your chart of accounts with one click, (3) add your bank balance, (4) add customers & products (type or bulk-upload), and (5) raise your first invoice. Each step ticks itself off automatically as you complete it, so you always know what's left.",
    route: "/dashboard", keywords: "onboarding start begin first run checklist" },
  { category: "Getting started", q: "What is the 'Load demo data' button — is it my real data?",
    a: "No. 'Load demo data' (Data & Import) fills the whole app with six years of realistic *sample* financials so you can explore every feature before entering anything. It is not your data. Click 'Clear all' on the same screen to remove it in one click, then set up your own business with the Dashboard checklist or the migration wizard.",
    route: "/data", keywords: "sample demo fake test data" },
  { category: "Getting started", q: "I'm switching from Tally — how do I bring my data in?",
    a: "Go to Data & Import → 'Switch from Tally / bring your data' → Migrate data. Export your Masters from Tally (Gateway of Tally → Export → Masters, as XML) and drop the file in. Headroom splits it into ledgers and stock items automatically, previews the counts, and imports them. You can also upload CSVs for ledgers, items and opening invoices using the built-in templates.",
    route: "/data", keywords: "tally migrate import switch csv masters" },

  // ── Data in / out ───────────────────────────────────────────────────────────
  { category: "Data", q: "How do I bulk-upload data (customers, items, ledgers)?",
    a: "Most list screens have a 'Bulk upload' button. Click it, download the CSV template, fill it in (one row per record), and upload — you get a preview and a per-row result showing what was created and any rows that failed with the reason. Bulk upload is available for the chart of accounts, inventory items, cost centres, price lists, Bill-of-Entry/ITC-04, employees and opening invoices.",
    keywords: "bulk csv template upload import many rows" },
  { category: "Data", q: "How do I export a report as PDF, Excel or CSV?",
    a: "Tables across the app have an 'Export ▾' button — choose CSV, Excel (.xlsx), PDF, or Print. It exports exactly the rows on screen. You'll find it on the financial reports, trial balance, P&L, balance sheet, GST returns, receivables/payables aging and ledger lists.",
    keywords: "export download pdf excel csv print report" },
  { category: "Data", q: "How do I import a bank statement?",
    a: "Two ways: on Data & Import use 'Upload CSV' for a bank/accounting CSV (we auto-detect date/amount/description). Inside Books → Reconcile you can also import a real bank file in OFX/QFX, QIF, CAMT.053 or MT940 format and reconcile it against your ledger.",
    route: "/data", keywords: "bank statement import ofx qif camt mt940 reconcile" },

  // ── GST & Tax ───────────────────────────────────────────────────────────────
  { category: "GST & Tax", q: "How accurate is my GST — can I trust the numbers?",
    a: "Your Books overview shows a live 'Books & Tax Health' card: it confirms the trial balance is balanced (debits = credits), the balance sheet tallies, there are no posting errors (duplicate vouchers / mis-postings), and your GST payable for the month — all recomputed from your actual postings, the same double-entry checks a CA runs at audit. GSTR-1/2B/3B are generated from the same ledger, so what you file matches your books.",
    route: "/books", keywords: "gst accuracy trust reconcile 2b 3b correct audit" },
  { category: "GST & Tax", q: "Can I generate a real e-invoice IRN / e-way bill?",
    a: "The e-invoice and e-way bill payloads are built to the official NIC/IRP shape and the full lifecycle (generate, cancel within 24h, update vehicle, extend) is implemented. Generating a *live* IRN/e-way number requires connecting your GST Suvidha Provider (GSP) account — open Connectors and add your GSP credentials to switch it on. Until then it produces a clearly-labelled sample number.",
    route: "/connectors", keywords: "e-invoice irn e-way bill gsp nic generate" },
  { category: "GST & Tax", q: "How do I run TDS / file a TDS return?",
    a: "Books handles TDS sections (194C/J/H/I/Q, 206C TCS), produces Form 16A and a multi-challan 24Q/26Q/27EQ e-TDS file. First set your deductor TAN in Settings (the return requires it). Then record TDS on vouchers and use Books → Tax Filing to generate the return file and 26AS reconciliation.",
    route: "/books", keywords: "tds tcs 24q 26q form 16a tan return challan" },

  // ── Money ───────────────────────────────────────────────────────────────────
  { category: "Money", q: "How do I get paid faster on overdue invoices?",
    a: "Collections shows everyone who owes you, aged into buckets. Set up reminder ladders that nudge customers over WhatsApp / UPI / email, track promise-to-pay, and send one-tap customer statements. It's the fastest way to pull in cash that's stuck in receivables.",
    route: "/collections", keywords: "collections overdue reminders whatsapp upi get paid receivables dso" },
  { category: "Money", q: "How do approvals work and where do I see what's pending?",
    a: "When a transaction exceeds an approval threshold it goes to a queue. Owners and finance managers see a 'Pending approvals' card right on the Dashboard with inline Approve/Reject, and the full queue plus approval rules live in Books → Controls.",
    route: "/dashboard", keywords: "approval approve reject pending queue authorization controls" },
  { category: "Money", q: "How do I close a financial year / lock a period?",
    a: "Books → Closing lets you lock each accounting period (so nobody back-dates into a filed month), run the year-end Period-Closing-Voucher (rolls P&L into reserves), set opening balances, and post reversing journals. The Books health card warns you if anything's out of balance before you close.",
    route: "/books", keywords: "period close year end lock closing opening balance reversing" },

  // ── People ──────────────────────────────────────────────────────────────────
  { category: "People", q: "How do I run payroll with PF/ESI/PT/TDS?",
    a: "Payroll computes statutory PF, ESI, PT and TDS, projects annual TDS and spreads it monthly, supports investment declarations and formula-driven salary components, and posts a two-stage accrual + payment entry to your books. Add employees first (type or bulk-upload), set the salary structure, then run the month.",
    route: "/payroll", keywords: "payroll pf esi pt tds salary slip form 16 gratuity" },

  // ── Account & roles ───────────────────────────────────────────────────────────
  { category: "Account & roles", q: "Who can see what — how do roles work?",
    a: "Each invited teammate gets a role that shapes what they see: Owner (everything), Finance Manager (cash, AR/AP, GST, tax, payroll), Accountant/CA (books, GST/tax filing, compliance + their own client portal), Sales (invoices, receivables, collections, CRM), Operations (orders, inventory, vendors, spend), Viewer (read-only dashboards), Investor (portfolio, raises, valuation). Invite people and set roles in Settings → Team.",
    route: "/settings", keywords: "roles permissions team invite who sees access viewer" },
  { category: "Account & roles", q: "I'm a CA — how do I manage multiple clients?",
    a: "Open the Advisor / CA Portal. Click 'Add Client' and paste the business's Tenant ID (they copy it from their Settings). Every client then appears in one list with live balance, runway, alerts and filing status — you can switch into any client's books, track GST/TDS/ITR filings, chase documents and send branded monthly reports, all without logging in separately.",
    route: "/advisor", keywords: "ca accountant clients multi practice advisor portal tenant" },
  { category: "Account & roles", q: "Why can't I edit anything? (read-only)",
    a: "Your role is read-only (e.g. Viewer, or a board member). You can explore every dashboard, analytics and report, but changes are disabled — you'll see a read-only banner at the top. Ask a workspace owner to give you an editing role in Settings → Team.",
    keywords: "read only cant edit disabled viewer permission" },

  // ── Mobile & security ─────────────────────────────────────────────────────────
  { category: "Mobile & security", q: "Is there a mobile app?",
    a: "Yes — Headroom runs as native iOS and Android apps (and as a web app). The full feature set is available on mobile: tap the menu (top-left) to open navigation, and everything is laid out for the phone. Your daily loop — check cash, chase a payment, approve a bill — works on the go.",
    keywords: "mobile app ios android iphone phone" },
  { category: "Mobile & security", q: "How do I keep my workspace secure?",
    a: "Security covers app-lock (PIN/biometric on mobile), an access & action audit log, approval limits, expense policy, IP allowlist and segregation-of-duties mapping. Owners manage it in Security; sensitive actions are recorded so you can always see who changed what.",
    route: "/security", keywords: "security 2fa biometric audit log lock access" },
];
