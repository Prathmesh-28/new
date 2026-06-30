// Q&A knowledge base for the Headroom Assistant - comprehensive, code-grounded
// answers across every feature and stakeholder (owner, finance, CA, sales, ops, HR,
// viewer, investor, evaluator, IT, and the SMB customer). Per-feature deep guides also
// come from FEATURE_GUIDES; this is the searchable question bank the assistant ranks over.

export interface FaqEntry {
  category: string;
  q: string;
  a: string;
  route?: string;        // optional "take me there" deep link
  keywords?: string;     // extra search terms
}

export const CURATED_FAQ: FaqEntry[] = [
  {
    "category": "Getting started & plans",
    "q": "How do I add a new employee?",
    "a": "On /payroll click Add employee and fill in the name and gross monthly salary (PAN, email, joining date, bank account and IFSC are optional but needed for Form 16 and bank disbursal). As you type the gross, the modal previews the estimated monthly TDS under the new regime. On /hrms the Employees tab Add employee form captures name, department, designation and date of joining instead - date of joining is what gratuity and full-and-final use. Only owner, finance manager and super admin can add staff; other roles see the list read-only.",
    "route": "/payroll",
    "keywords": "add new employee onboard staff joining Add employee"
  },
  {
    "category": "Getting started & plans",
    "q": "Can I bulk-upload my whole team at once?",
    "a": "Yes. On /payroll use the Bulk upload control which posts to /api/hrms/employees/bulk and accepts columns Name, Email, Designation, CTC (annual), PAN, PF No and Date of joining. Each row is created independently, so one bad row (e.g. a missing name) is reported as failed without aborting the rest - you get a created/failed count with per-row errors. This is the fastest way to migrate an existing roster.",
    "route": "/payroll",
    "keywords": "bulk import csv upload team migrate roster Add employee"
  },
  {
    "category": "Getting started & plans",
    "q": "I just paid but the feature is still locked - what do I do",
    "a": "After Razorpay confirms payment, Headroom verifies the signature server-side and flips your plan, then refreshes your account - you should see a 'You're upgraded - welcome aboard' toast and the feature unlocks. If it still shows the lock screen, reload the page (the entitlement is read from your refreshed user), and check the Plan & Billing card shows the new tier with a renewal date. If the badge still says the old plan, the payment may not have verified - contact support with your Razorpay payment id.",
    "route": "/settings",
    "keywords": "paid still locked not unlocked refresh after payment verify stuck After upgrade"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I quickly set up common rules like overdue-invoice or large-payout alerts?",
    "a": "Open /automation → 'Trigger Library' for one-click recipes: Overdue invoice nudge, Large payout review (outflow > ₹1,00,000, escalate to owner), Big invoice raised, Payroll posted watch, Tax outflow watch and Unpaid invoices. Installing a recipe drops a ready-made rule into the Rule Builder where you can preview the live matches and tune the threshold. The Overview tab's six tiles (Active Rules, Reminders, Approval Chains, etc.) show what you've set up.",
    "route": "/automation",
    "keywords": "recipe trigger library overdue invoice large payout template quick setup Automation"
  },
  {
    "category": "Getting started & plans",
    "q": "Can I track recurring AutoPay / e-mandate subscriptions for my customers?",
    "a": "Yes - the AutoPay Mandates tab on /payments lets you log each mandate with customer, cap amount, frequency (e.g. monthly) and rail. Active monthly mandates roll up into a 'capped per month' figure on the Overview card, and there are companion tools - AutoPay Calc, NACH Register and Mandate Retry Planner - for the recurring-debit side. These are local trackers, so update a mandate's status (active/paused/cancelled) as it changes to keep the numbers right.",
    "route": "/payments",
    "keywords": "autopay mandate emandate nach recurring subscription cap frequency rail retry AutoPay mandates"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I add my bank balance so runway and cash position are real?",
    "a": "Use 'Add Account' on the Dashboard header (/dashboard) or the 'Add bank' step in the checklist (which opens /banking). In the Add-a-bank-account modal, type your IFSC and Headroom auto-fetches the bank and branch for you (via a public IFSC lookup) - no hand-typing. Then enter account type (Current/Savings/CC/OD/Wallet), current balance and 'balance as of' date. If the IFSC lookup fails or you're offline, it falls back to letting you type the bank name manually.",
    "route": "/banking",
    "keywords": "add bank account balance IFSC runway cash position connect bank Bank setup"
  },
  {
    "category": "Getting started & plans",
    "q": "My IFSC isn't being recognised when I add an account - what now?",
    "a": "The IFSC field expects the standard format (4 letters, a 0, then 6 characters, e.g. HDFC0000123) and looks it up live. If the code is wrong or the lookup can't reach the network, you'll see 'Couldn't auto-fetch - check the IFSC, or enter your bank manually' and a manual bank-name box appears. Just type your bank name there and continue - the account still saves. The account number is optional and stored masked as ••••XXXX (last 4 only).",
    "route": "/banking",
    "keywords": "IFSC not found manual bank name lookup failed offline account number Bank setup"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I know my true available cash today and plan idle-cash sweeps?",
    "a": "The Daily Cash Position tab on /banking shows bank balance, today's inflows/outflows and 'available net of holds', where you add pending debits (uncleared cheques, standing instructions) that reduce truly spendable cash - it warns if holds exceed your balance. The Sweep Planner tab then lets you set an operating buffer and an FD/sweep rate to see the sweepable surplus and the extra annual yield versus leaving it idle, so you can set a daily sweep-in/sweep-out rule with your bank.",
    "route": "/banking",
    "keywords": "daily cash position available balance pending debits holds sweep planner idle fd yield buffer Banking - cash & sweeps"
  },
  {
    "category": "Getting started & plans",
    "q": "Where do I enter my company name, GSTIN and financial year?",
    "a": "Go to Settings (/settings) - the 'Set up your business' step links straight there. Enter your firm name, 15-character GSTIN and financial year. This matters because Headroom treats your business as 'set up' once you've given it a real name (not the default) or a GSTIN, and your GSTIN/GST-registered flag drives every figure on the /gst screen. For invoice PDFs and UPI QR codes, also fill in your address and UPI ID here.",
    "route": "/settings",
    "keywords": "business profile firm name GSTIN financial year company details settings Business setup"
  },
  {
    "category": "Getting started & plans",
    "q": "Several of my clients use Tally and want to switch - what's the cleanest migration path?",
    "a": "For a one-time move, use Tally Bridge in /data: Export gives you a Tally-importable Daybook XML, and pasting a Tally voucher export lets you Preview then Import vouchers into Headroom. For an ongoing feed, set up the Tally connector in /connectors - it's the one connector with a real working pipeline (the Headroom sync agent on the client's server pushes de-duplicated vouchers). Run Data Quality and Dedupe after the first import.",
    "route": "/connectors",
    "keywords": "tally migration, switch from tally, tally connector, sync agent, import vouchers CA · Cross-feature"
  },
  {
    "category": "Getting started & plans",
    "q": "Do the engagement letter and the monthly reports use the same branding?",
    "a": "Yes - both the white-label monthly Report (from a client card) and the Engagement letter (Engagement tab) pull from the same Firm Setup branding (firm name, tagline, GSTIN). Set Firm Setup once on /advisor and every document a client receives - reports and letters - looks consistent and professional under your firm's name.",
    "route": "/advisor",
    "keywords": "branding consistency, engagement letter, report branding, firm setup, white label CA · Engagement"
  },
  {
    "category": "Getting started & plans",
    "q": "I'm a CA, where do I actually manage all my clients in one place?",
    "a": "Go to /advisor - that's your CA Practice cockpit. It lists every business you advise with their live cash balance, runway, unread alerts and credit standing, split into a Needs Attention group and a Healthy group. From there you also get tabs for Bulk GST, the Compliance Board, Doc Tracker, Query Log, Engagement letters, Practice deadlines, the lead Marketplace and Billing - so you run your whole client book without logging into each business separately.",
    "route": "/advisor",
    "keywords": "ca dashboard, practice, clients, advisor cockpit, manage clients CA · Getting started"
  },
  {
    "category": "Getting started & plans",
    "q": "Can I import a client's Tally data instead of re-keying everything?",
    "a": "Yes. Two ways: the Tally Bridge tab in the Data module (/data) lets you paste a Tally voucher export, Preview, then Import - and Export a Tally-importable Daybook XML back out. For a live feed, Connectors (/connectors) has the Tally connector with a real working sync agent you install on the client's server; it pushes vouchers in and de-duplicates automatically.",
    "route": "/data",
    "keywords": "tally import, import tally, tally bridge, tally sync, migrate from tally, voucher export CA · Importing Tally data"
  },
  {
    "category": "Getting started & plans",
    "q": "I have capacity for new clients - does Headroom send me leads?",
    "a": "Yes, that's the Marketplace tab on /advisor. Headroom routes businesses that have no CA to you by city and sector for free - it shows open leads with an estimated annual fee, and you Accept the ones you want. The pitch is the \"inversion\": accepting even 2-3 leads a year (₹1-5L in fees) can cover your subscription many times over.",
    "route": "/advisor",
    "keywords": "marketplace, leads, new clients, ca lead, get clients, free leads CA · New business"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I add a client to my portfolio?",
    "a": "On /advisor click Add Client (top right), paste the business's Tenant ID and give it a display name, then Add to Portfolio. Ask the owner to copy their Tenant ID from their own Settings → Tenant ID and send it to you. Once added the client shows up immediately with live balance, runway and alerts under Needs Attention or Healthy.",
    "route": "/advisor",
    "keywords": "add client, link client, tenant id, onboard, connect business CA · Onboarding clients"
  },
  {
    "category": "Getting started & plans",
    "q": "Where does the client get their Tenant ID to share with me?",
    "a": "The owner finds it in their own workspace under Settings → Tenant ID - it's a copyable string. You can't pull a client in without it; that's the consent gate. Tell them \"go to Settings, copy the Tenant ID, WhatsApp it to me\" and you paste it into Add Client on /advisor.",
    "route": "/settings",
    "keywords": "tenant id, where is tenant id, client id, link code CA · Onboarding clients"
  },
  {
    "category": "Getting started & plans",
    "q": "What role do I need to post entries or set up a client's books?",
    "a": "Setting up Books (the \"Set up my books\" step that creates the 28 account groups and default ledgers) and posting vouchers requires an owner, finance or accountant role in that client's workspace. If you only have read access you can still review the Reports tab but can't post - ask the owner to grant you the accountant role when they invite you.",
    "route": "/books",
    "keywords": "role, permission, accountant role, post entry, set up books, write access CA · Permissions"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I review a client's actual books - Trial Balance, P&L, Balance Sheet?",
    "a": "Each client's accounting lives in their Books module at /books. The Reports tab there gives you Trial Balance, P&L, Balance Sheet and Cash Flow for a financial year, with a green \"Balanced\" badge confirming debits equal credits. GST is auto-split into CGST/SGST/IGST at posting, so there's far less cleanup before GSTR filing.",
    "route": "/books",
    "keywords": "review books, trial balance, p&l, balance sheet, double entry, ledger, financials CA · Reviewing books"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I get my firm's name and logo onto the reports I send clients?",
    "a": "Click Firm Setup at the top right of /advisor and enter your firm name, tagline (e.g. \"Chartered Accountants · Mumbai\") and GSTIN. That branding then appears on both the white-label monthly reports and the engagement letters you generate, so every document a client receives is consistent and on your firm's name.",
    "route": "/advisor",
    "keywords": "firm setup, branding, white label, logo, letterhead, firm name CA · White-label branding"
  },
  {
    "category": "Getting started & plans",
    "q": "I'm a CA setting up Headroom for my practice - how do I bring clients in?",
    "a": "Your accountant onboarding flow guides you: create the chart of accounts for the workspace (one-click seed), add your first client via the CA portal (/advisor - link a client tenant to your portal), import the trial balance / opening ledgers in Books (bulk CSV), then review GST for filing (GSTR-1/2B/3B from the ledger on /gst). Each step ticks off as data is detected, so the checklist tracks your real progress per client workspace.",
    "route": "/advisor",
    "keywords": "CA accountant practice clients onboarding advisor portal trial balance GST filing tenant CA / accountant"
  },
  {
    "category": "Getting started & plans",
    "q": "The Marketplace tab shows businesses - what is that and does it cost me?",
    "a": "The Marketplace tab in /advisor is Headroom's CA lead inversion: instead of charging CAs for software, it surfaces businesses on Headroom that have no CA linked and are seeking one, matched to you by city, sector and capacity - for free. Each lead shows a match score, revenue tier, an estimated annual fee and the reason they need help. Click 'Accept' to take a lead (the business is notified) or 'Pass' to skip it.",
    "route": "/advisor",
    "keywords": "marketplace leads new clients free ca lead generation accept pass match score CA / advisor portal"
  },
  {
    "category": "Getting started & plans",
    "q": "how do I cancel my subscription",
    "a": "Because upgrades are one-time Razorpay charges per ~30-day period (not a stored-card recurring mandate in this build), you 'cancel' by not renewing - the plan won't auto-charge a saved card, so it lapses to the lower entitlement at period end. The upsell screen wording 'cancel anytime' reflects this no-lock-in approach. If you need to stop mid-period or get help, reach out to support; there's no self-serve cancel button on the billing card.",
    "route": "/settings",
    "keywords": "cancel stop subscription end refund lapse no lock-in Cancellation"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I start a fundraising round in Headroom?",
    "a": "Go to /capital - you land on the Raises tab. Click New Raise (top right), give it a name (e.g. \"Seed 2026\"), pick an instrument, set a target amount in ₹ and click Create Raise. The raise starts as a draft; hit Publish to make it active and start accepting investors, then use + Investor to record commitments against the funding progress bar. Note: only the Owner or super_admin can create/publish raises - other roles see the raises read-only.",
    "route": "/capital",
    "keywords": "new raise, fundraise, equity round, start raise Capital raise"
  },
  {
    "category": "Getting started & plans",
    "q": "Can I change a team member's role after they've joined?",
    "a": "Yes. In Organization → Members, find them in the 'Your Team' list - their role shows as a dropdown next to their name. Pick a new role and it saves immediately (you'll get a 'is now <role>' toast). You can't change your own role from here, and the super admin role and the primary owner can't be reassigned this way. Use the trash icon to remove someone, or the check-circle icon to promote them to a backup owner.",
    "route": "/organization#members",
    "keywords": "change role reassign edit member role dropdown promote demote Changing roles"
  },
  {
    "category": "Getting started & plans",
    "q": "What does 'Create chart of accounts' actually do, and is it safe to click?",
    "a": "Clicking 'Create chart of accounts' in the setup checklist (or 'Set up my books' on the Books home screen, /books) runs a one-click seed that creates the 28 standard account groups and default ledgers (cash, sales, GST, etc.) so you can start posting double-entry vouchers. It's safe - it just lays down the standard Tally-style structure. You need an owner, finance or accountant role to run it.",
    "route": "/books",
    "keywords": "seed books chart of accounts ledgers set up my books groups COA Chart of accounts"
  },
  {
    "category": "Getting started & plans",
    "q": "Can I import all my ledgers at once instead of typing them one by one?",
    "a": "Yes. In the Chart of Accounts tab use 'Bulk upload ledgers' - download the template, fill in name, group, is_party, is_bank, gstin, pan and opening_balance, then upload. The 'group' column must match an existing account-group name exactly (case-insensitive); the importer resolves it to the group id for you. This is the fast way to bring across a Tally master.",
    "route": "/books",
    "keywords": "bulk import ledgers csv template tally migration upload Chart of Accounts"
  },
  {
    "category": "Getting started & plans",
    "q": "which plan should I pick for my business",
    "a": "Match the tier to your biggest job-to-be-done. If you just need invoicing, GST basics and to see your cash forecast and health, Free is enough. If you're constantly chasing overdue payments, Starter unlocks Collections + Receivables. If you run payroll and want forecasting, analytics and an AI CFO, go Growth. If you're raising capital, managing lenders/treasury, or need valuation/cap-table and API access, choose Pro. You can start free and upgrade anytime from Settings → Plan & Billing.",
    "route": "/settings",
    "keywords": "which plan recommend choose best tier for me compare Choosing a plan"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I clear the demo/sample data and start fresh with my own numbers?",
    "a": "Go to Data & Import (/data) and use 'Clear all data'. It wipes every module - transactions, invoices, bank accounts, loans, obligations, fixed assets, orders, inventory, procurement, budgets, scenarios, alerts, credit, capital raises, connectors and all feature-tool data - after a confirm prompt. This cannot be undone, so export a backup first from the Backup & Export tab if you want a copy. Then import your real data via CSV or the Tally migration.",
    "route": "/data",
    "keywords": "clear demo data delete sample reset start fresh wipe remove cannot undo backup Clearing demo data"
  },
  {
    "category": "Getting started & plans",
    "q": "I loaded the full demo by accident - how do I undo it?",
    "a": "There's no single undo, but Data & Import (/data) has 'Clear all data' which removes everything the demo seeded across every module in one step (with a confirm). The demo also seeds backend accounting books and the CRM pipeline; clearing on the Data page handles the frontend modules. If you only want some modules cleared, use the Archive & Purge or Dedupe tools on the same page for finer control.",
    "route": "/data",
    "keywords": "loaded demo by accident undo remove sample data clear all reset demo seed Clearing demo data"
  },
  {
    "category": "Getting started & plans",
    "q": "Which payment gateways and accounting tools can I integrate?",
    "a": "On /connectors the catalogue covers Razorpay, Stripe and PhonePe Business for payments (paste account name and webhook secret), plus Tally ERP, Zoho Books and QuickBooks for accounting. Tally is the one with a real working pipeline - install the Headroom Tally sync agent on your server and paste your Tenant ID, and it pushes vouchers in de-duplicated. There are also lower-down tools for POS, payroll software, CRM, shipping/logistics, E-Way Bill, courier AWB, WhatsApp BSP and the GSTN portal.",
    "route": "/connectors",
    "keywords": "razorpay stripe phonepe tally zoho quickbooks gateway accounting integration Connectors"
  },
  {
    "category": "Getting started & plans",
    "q": "What are cost centres and how do I set them up?",
    "a": "Cost centres (Tally-style dimensions) let you tag income/expense to a department, branch-of-activity or team. Open the 'Cost Centres' tab and create one with a name, optional parent and category; you can also bulk-upload them. The posting engine stores a cost centre per voucher line, and the 'Cost-centre P&L' report breaks down income, expense and net by cost centre for the financial year so you can see which activity actually makes money.",
    "route": "/books",
    "keywords": "cost centre dimension department tally P&L report category project Cost Centres"
  },
  {
    "category": "Getting started & plans",
    "q": "Can I see profit by project, branch or a custom tag?",
    "a": "Yes - the Cost Centres tab (route /books) also covers Projects and Branches and custom reporting tags. Projects give a per-project profitability/billable view; Branches give per-branch (per-GSTIN) Trial Balance and P&L; and reporting tags (project/location/class) drive a 'net profit by tag' report. Each is a separate dimension you attach to entries, and each has its own report so you can slice the same posted data multiple ways.",
    "route": "/books",
    "keywords": "project branch GSTIN tag dimension profitability per-branch trial balance net profit by tag Cost Centres"
  },
  {
    "category": "Getting started & plans",
    "q": "I don't use Tally - can I just upload spreadsheets to get started?",
    "a": "Yes. On /data click 'Migrate data' and choose 'Upload CSVs'. Import in this order so references resolve: (1) chart of accounts & parties (ledgers), (2) stock items, (3) opening invoices (SALES or PURCHASE per row - each posts a balanced GST voucher). Each has a downloadable template and a live preview. For opening balances specifically, use the Books → Closing tab to import a trial-balance CSV. There's also a plain 'Upload CSV' for bank/accounting transaction rows with auto-detected columns.",
    "route": "/data",
    "keywords": "CSV import spreadsheet template ledgers items invoices opening balance bulk upload order CSV import"
  },
  {
    "category": "Getting started & plans",
    "q": "Where do I get the CSV template so my file is in the right format?",
    "a": "On /data Overview there are 'Template' buttons in both the 'Bulk import transactions' card and the 'CSV templates' card - they download transactions-template.csv (date,amount,description,counterparty) and invoices-template.csv (customer,amount,invoice_number,invoice_date,due_date,status). For specialised loads, the 'Filing Templates' tab has ready-made CSVs for GSTR-1 B2B, opening balances, fixed-asset register and a vendor/customer master. Fill them in Excel, save as CSV, then bring them back via Upload CSV or the CSV Mapper.",
    "route": "/data",
    "keywords": "template format columns starter file download CSV templates"
  },
  {
    "category": "Getting started & plans",
    "q": "how do I check which plan I'm currently on",
    "a": "Open Settings → 'Plan & Billing' card (also at Organization → Billing & Plan, /organization#billing). The card shows a badge with your current tier (Free/Starter/Growth/Pro), and if you're on a paid plan it shows the renewal date ('Renews <date>'). Your current plan is also reflected on each paid tier - your tier shows a green 'Current plan' tick, and lower tiers show 'Included in your plan'.",
    "route": "/settings",
    "keywords": "current plan which tier renewal date status Current plan"
  },
  {
    "category": "Getting started & plans",
    "q": "they're asking me to set up an autopay / e-mandate - is that safe and how do i cancel?",
    "a": "An autopay (UPI/NACH) mandate lets the business auto-debit a capped amount on a set frequency - you approve it once in your UPI app or via your bank, and it can never pull more than the cap you authorised. It's the standard way to handle recurring bills. You can cancel or pause it anytime from the mandates/autopay section of your UPI app or by asking your bank, and the business can also stop it on their side.",
    "keywords": "autopay mandate e-mandate nach recurring auto debit cancel safe subscription Customer/Vendor · Autopay mandate"
  },
  {
    "category": "Getting started & plans",
    "q": "My dashboard and reports are empty - there's no data anywhere",
    "a": "A brand-new workspace starts empty. Bring data in three ways from Data & Import (/data): upload a CSV with the provided templates, run the 'Switch from Tally / bring your data' migration to import Tally masters, or click 'Load demo data' to fill every module with realistic sample data for a walkthrough. If you previously had data and it vanished, check you're not in a client view or a 'View as' preview pointing at a different/empty namespace.",
    "route": "/data",
    "keywords": "empty dashboard no data missing reports blank import CSV tally load demo new workspace Data not showing"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I load sample data to try the import and export tools, and how do I clear it?",
    "a": "On /data Overview click 'Load demo data' to populate the whole app with six years (FY23-FY28) of realistic financials - transactions, invoices, GST, payroll, a loan and more - and it also best-effort seeds the backend accounting books and CRM pipeline. To wipe it, click 'Clear all', which removes data across every module (transactions, invoices, accounts, loans, feature tools) after a confirm. Both are write actions, so they're disabled for read-only roles.",
    "route": "/data",
    "keywords": "demo sample data load clear seed test playground reset Demo / sample data"
  },
  {
    "category": "Getting started & plans",
    "q": "Can I see the whole app filled with sample data before I put in my own numbers?",
    "a": "Yes. Go to Data & Import (/data), Overview tab, and click 'Load demo data'. It populates every module - transactions, invoices, accounts, loans, GST, payroll, inventory, sales pipeline, treasury, compliance and more - with about six years (FY23-FY28) of realistic financials, so every statement, chart and forecast comes to life. It also seeds the backend accounting books (GL/GST/inventory) and CRM pipeline so those screens show data too. You'll get a confirmation prompt before it loads.",
    "route": "/data",
    "keywords": "demo data sample data try explore load demo FY23 FY28 test data Demo data"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I wipe the demo/sample data and start clean with my own figures?",
    "a": "On Data & Import (/data), Overview tab, click 'Clear all'. It removes data across every module - transactions, invoices, bank accounts, loans, obligations, fixed assets, orders, inventory, budgets, scenarios, alerts, credit/capital records and all feature-tool data. You'll get a confirmation warning first because it can't be undone. After clearing, follow the dashboard setup checklist to add your real business, books and bank balance.",
    "route": "/data",
    "keywords": "clear data delete demo reset start fresh wipe sample remove all Demo data"
  },
  {
    "category": "Getting started & plans",
    "q": "I clicked Load demo data but it says the backend seed was unavailable - did it fail?",
    "a": "Not entirely. The frontend demo always loads (transactions, charts, forecasts). The backend accounting books and CRM pipeline are seeded separately as a best-effort step; if you're not signed in to a workspace, that part can't run and you'll see 'Frontend demo loaded; backend seed unavailable (sign in to a workspace to seed books/CRM)'. Sign in to a workspace and reload the demo, or use the books 'Set up my books' seed on /books, to get the accounting side populated.",
    "route": "/data",
    "keywords": "backend seed unavailable books CRM demo partial workspace not signed in Demo data"
  },
  {
    "category": "Getting started & plans",
    "q": "Will loading demo data overwrite the real data I've already entered?",
    "a": "Load demo data replaces the in-app store with the full sample dataset (it merges your firm profile rather than replacing it, but other module data is overwritten with demo records). So don't load it on top of real numbers you care about - back up first via Data & Import (/data) → Backup & Export ('Full backup (JSON)') if you want a copy. If you've already explored with demo data, hit 'Clear all' before entering your real figures.",
    "route": "/data",
    "keywords": "demo overwrite real data backup before loading merge firm replace caution Demo data"
  },
  {
    "category": "Getting started & plans",
    "q": "can I downgrade to a cheaper plan",
    "a": "The Plan & Billing card only surfaces upgrade buttons - lower tiers show 'Included in your plan' rather than a downgrade action, because higher tiers already contain everything below them. There's no in-app one-click downgrade button in this build; since each paid period is a one-time ~30-day charge with no stored auto-renew, you effectively step down by simply not renewing the higher tier when the period ends. For an immediate change, contact support.",
    "route": "/settings",
    "keywords": "downgrade cancel reduce cheaper plan switch lower tier Downgrade"
  },
  {
    "category": "Getting started & plans",
    "q": "Can I push my Headroom transactions back into Tally?",
    "a": "Yes. On the 'Tally Bridge' tab of /data click 'Export N txns → Tally XML'. It builds a Tally.ERP9-style Daybook XML where each transaction becomes a Receipt (money in) or Payment (money out) voucher with the party and bank ledger entries, and downloads it as tally-daybook-YYYY-MM-DD.xml. Import that file in Tally. Because the party ledger is inferred from the counterparty/description, double-check the ledger mapping inside Tally before posting.",
    "route": "/data",
    "keywords": "tally export daybook xml voucher push receipt payment Export to Tally"
  },
  {
    "category": "Getting started & plans",
    "q": "why am I seeing a 'Preview - upgrade to unlock' lock screen on a feature",
    "a": "That's the upsell gate. A feature you opened (e.g. Payroll, Benchmarks, Credit) needs a higher plan than your tenant currently has, so instead of the live view you get a full-screen card with a blurred preview, the feature's perks, the price, and an 'Upgrade to …' button. The required tier is shown at the top (e.g. 'Growth plan'). Upgrade right there, or from Settings → Plan & Billing, and the real feature unlocks immediately.",
    "keywords": "locked gated blurred upsell upgrade required plan can't access Feature gating"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I plan sales territories and assign reps to areas?",
    "a": "On /sales open the Territory Planner tab. Add a territory with a name (e.g. South Pune), the rep, the covered pincodes (comma-separated), the number of accounts and the revenue potential in ₹. It then shows totals - total accounts, total potential, rep count and average accounts per rep - so you can balance load across the team. These territory records are saved in your synced feature data and shared to your other devices.",
    "route": "/sales",
    "keywords": "territory planner field sales pincode rep area assign region Field sales"
  },
  {
    "category": "Getting started & plans",
    "q": "the books won't balance, debits don't equal credits - what do I do",
    "a": "Don't delete anything. Go to the Books 'Recent vouchers' list, find the bad entry, and click Reverse - it posts a mirror voucher so nothing is silently lost and the audit trail stays clean. The green 'Balanced' badge on the Overview and Reports tabs will turn green again once the offending voucher is reversed and re-posted correctly.",
    "route": "/books",
    "keywords": "out of balance trial balance mismatch reverse voucher wrong entry Finance manager · Bank reconciliation"
  },
  {
    "category": "Getting started & plans",
    "q": "how do I make sure a big GST or advance-tax payment hits my forecast",
    "a": "From /tax Overview, on any deadline showing an Estimated amount (Advance Tax, GSTR-3B, TDS), click 'Add to Forecast' - it pushes that exact amount and due date into the /forecast cash-flow as a dated obligation. You can also add obligations manually in /forecast under Cash Obligations. This is how you stop a statutory instalment from quietly squeezing payroll or supplier payments.",
    "route": "/tax",
    "keywords": "add to forecast advance tax instalment obligation cash flow plan ahead Finance manager · Cash forecast"
  },
  {
    "category": "Getting started & plans",
    "q": "how much cash is stuck in receivables and how do I free it",
    "a": "Open /working-capital Overview - it shows your Cash Conversion Cycle (DSO + DIO - DPO) and an orange callout with the exact rupees your cycle ties up. The 'Where the days go' panel links DSO to Receivables, DIO to Operations, DPO to Vendors so you act on the worst leg. Use the Cash Release Simulator to see rupees freed by cutting DSO, then take those specific asks to named customers.",
    "route": "/working-capital",
    "keywords": "dso cash conversion cycle stuck cash receivables working capital free up Finance manager · DSO / working capital"
  },
  {
    "category": "Getting started & plans",
    "q": "how do I stop someone editing a period I've already filed?",
    "a": "In /settings open Financial Year & Books Lock and tap 'Lock books up to' your last filed date - this stops anyone on the team accidentally editing closed, filed periods. Push the lock date forward after you e-file GST/returns each quarter. Settings is owner or super-admin only, so if you don't see it ask the owner to set it.",
    "route": "/settings",
    "keywords": "lock books period filed close prevent editing financial year freeze Finance manager · Locking books"
  },
  {
    "category": "Getting started & plans",
    "q": "I'm closing the month, where do I actually start?",
    "a": "Run the close in order: first reconcile each bank ledger in Books under the Reconcile tab (paste statement rows, Auto-match, confirm the leftovers), then check the green 'Balanced' badge on the Books Reports tab so debits equal credits. After that pull Trial Balance, P&L and Balance Sheet from /books Reports for the financial year, and finish by locking the period in Settings so nobody edits it.",
    "route": "/books",
    "keywords": "month end closing books close period lock balanced Finance manager · Month-end close"
  },
  {
    "category": "Getting started & plans",
    "q": "What's the 'Get started with Headroom' wizard with the four cards on my dashboard?",
    "a": "That's a separate quick-start wizard on /dashboard with four data-driven steps: 'Add a bank account', 'Import 3+ transactions', 'Generate your first forecast', and 'Run credit pre-qualification'. Each step has a button that opens the right modal or page, and ticks off automatically once the data exists (e.g. once you have 3+ transactions, or once a forecast is generated). It fills the dashboard with real numbers and disappears when all four are done; you can also Dismiss it. It's hidden in read-only/client view.",
    "route": "/dashboard",
    "keywords": "get started wizard four cards add bank import transactions forecast credit pre-qualification First steps"
  },
  {
    "category": "Getting started & plans",
    "q": "Do I need to load demo data to use Headroom, or can I just start with my own numbers?",
    "a": "You don't need the demo data at all - the owner onboarding intro even says 'you don't need the demo data.' Demo data is purely for exploring how the app looks when populated. To go live with your own figures, follow the dashboard checklist: set up your business in Settings, create your chart of accounts, add your bank balance, add customers & products, and raise your first invoice. Use 'Clear all' on /data first if you've previously loaded demo data.",
    "route": "/dashboard",
    "keywords": "skip demo own numbers real data required start fresh need demo First steps"
  },
  {
    "category": "Getting started & plans",
    "q": "is the cash forecast a paid feature",
    "a": "No - the Cash-Flow Forecast (/forecast) and the Financial Health score (/health) are intentionally ungated and available on Free, because they're the core value proposition. What sits behind paid tiers are the advanced layers around them: Scenario planning, Benchmarks, Predict and Analytics are Growth-tier add-ons. So you can read your runway and health for free; you pay when you want to stress-test, compare to peers, or get the AI CFO narrative.",
    "route": "/forecast",
    "keywords": "forecast free paid health runway gated scenarios ungated Forecast & health gating"
  },
  {
    "category": "Getting started & plans",
    "q": "what can I do for free without paying anything",
    "a": "The Free plan covers your everyday finance core: creating GST-compliant invoices, GST basics, recording transactions, the Dashboard, documents, plus two of the headline features - the cash-flow Forecast and the Financial Health score - which are deliberately left ungated as the 'aha moment'. What's gated are the advanced layers on top: Collections/Receivables (Starter), Payroll/Analytics/AI CFO/Scenarios/Benchmarks (Growth), and Credit/Treasury/Valuation/API (Pro).",
    "route": "/forecast",
    "keywords": "free tier included no cost forecast health invoicing Free plan"
  },
  {
    "category": "Getting started & plans",
    "q": "Which payment gateways does Headroom actually integrate with?",
    "a": "Razorpay is the live integration: with its keys set the backend mints real hosted payment links and processes signed webhooks (it accepts SHA512 or SHA256 signatures). Cashfree exists as a deliberate stub - it only counts as 'configured' when its own keys (CASHFREE_APP_ID / CASHFREE_SECRET_KEY) are present, so it never half-activates by accident. For settlement-file reconciliation, fee profiles also exist for PayU and Stripe. You connect gateways like Razorpay/Stripe/PhonePe from the Connectors screen.",
    "route": "/payments",
    "keywords": "razorpay cashfree stripe payu phonepe gateway provider integration webhook keys connectors Gateways / providers"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I set up Headroom for the first time?",
    "a": "On your Dashboard you'll see a 'Get set up' checklist tailored to your role. For an owner it walks you through 5 steps: (1) set your business name & GSTIN in Settings, (2) create your chart of accounts with one click, (3) add your bank balance, (4) add customers & products (type or bulk-upload), and (5) raise your first invoice. Each step ticks itself off automatically as you complete it, so you always know what's left.",
    "route": "/dashboard",
    "keywords": "onboarding start begin first run checklist Getting started"
  },
  {
    "category": "Getting started & plans",
    "q": "What is the 'Load demo data' button - is it my real data?",
    "a": "No. 'Load demo data' (Data & Import) fills the whole app with six years of realistic *sample* financials so you can explore every feature before entering anything. It is not your data. Click 'Clear all' on the same screen to remove it in one click, then set up your own business with the Dashboard checklist or the migration wizard.",
    "route": "/data",
    "keywords": "sample demo fake test data Getting started"
  },
  {
    "category": "Getting started & plans",
    "q": "I'm switching from Tally - how do I bring my data in?",
    "a": "Go to Data & Import → 'Switch from Tally / bring your data' → Migrate data. Export your Masters from Tally (Gateway of Tally → Export → Masters, as XML) and drop the file in. Headroom splits it into ledgers and stock items automatically, previews the counts, and imports them. You can also upload CSVs for ledgers, items and opening invoices using the built-in templates.",
    "route": "/data",
    "keywords": "tally migrate import switch csv masters Getting started"
  },
  {
    "category": "Getting started & plans",
    "q": "Where do I see who owes me money and chase them?",
    "a": "Two screens work together. /receivables is the analytics + tracking view: it shows your aging summary (Current, 1-30, 31-60, 60+ days overdue), total outstanding, and a list or kanban of every unpaid invoice with Chase/Mark-paid/Delete actions. /collections is the active chase cockpit: top KPIs (Total overdue, Accounts overdue, Avg days overdue, Critical 60d+), clickable aging buckets, and per-customer Remind / UPI-link / Mark-contacted buttons. Both are derived from your invoices, so keep due dates accurate in /invoices.",
    "route": "/collections",
    "keywords": "receivables collections overdue chase outstanding AR Getting started"
  },
  {
    "category": "Getting started & plans",
    "q": "Where do I track my leads and sales pipeline?",
    "a": "Two places work together. /crm is the structured CRM with six tabs along the top: Pipeline, Leads, Tasks, Accounts, Contacts and SLA - it talks to the real backend and is where leads convert into deals and won deals become Books customers. /sales is a wider sales toolbox (40+ tools) whose Pipeline and Leads tabs sync the same CRM deals/leads, plus analytics like Win/Loss, Territory Planner, Commissions and forecasting. Use /crm for the core lead-to-deal-to-customer flow and /sales for sales-ops analysis.",
    "route": "/crm",
    "keywords": "crm sales pipeline leads start where Getting started"
  },
  {
    "category": "Getting started & plans",
    "q": "Where do I manage my stock and inventory?",
    "a": "Open Books at /books and click the Inventory tab. Across the top you get sub-tabs for Items, Receive / Issue, Manufacture, Physical adjust, Alerts, Stock summary, Serial numbers, Variants, Kits / BOM, Barcode, Reposting and Landed cost. Lighter manufacturing (multi-level BOMs, work orders, MRP) lives separately under the ERP screen at /erp. Both share the same stock items, so anything you create in one is visible in the other.",
    "route": "/books",
    "keywords": "inventory stock where find tab books Getting started"
  },
  {
    "category": "Getting started & plans",
    "q": "Where do I run payroll and add my staff?",
    "a": "There are two payroll surfaces. /payroll is the quick desk: add an employee with just a name and gross monthly salary, then hit Run payroll to compute PF/ESI/PT/TDS and net for everyone. /hrms is the deeper HR desk with five tabs (Employees, Attendance, Leave, Salary structures, Payroll) where you build component-based salary structures, track attendance-driven LOP, manage leave, and one click of Run payroll posts a balanced journal into your books. Most owners start on /payroll; finance teams who want structures and attendance proration use /hrms.",
    "route": "/payroll",
    "keywords": "salary staff employees run payroll start Getting started"
  },
  {
    "category": "Getting started & plans",
    "q": "I just signed up - what's the fastest way to get Headroom working with my real numbers?",
    "a": "Your Dashboard (/dashboard) shows a role-aware 'Get set up' checklist at the very top that walks you through it. For an owner the steps are: set up your business (name, GSTIN, financial year in Settings), create your chart of accounts (one click), add your bank balance, add customers & products, and raise your first invoice. Each step ticks itself off automatically as the data is detected - you don't mark anything manually - and the progress bar fills to 100% as you go.",
    "route": "/dashboard",
    "keywords": "onboarding checklist first steps quickstart setup wizard Getting started"
  },
  {
    "category": "Getting started & plans",
    "q": "what's included in the Growth plan",
    "a": "Growth (₹2,499/mo) is the payroll + intelligence tier. It unlocks Payroll (/payroll - full statutory PF/ESI/PT/TDS, salary slips, Form 16, payouts), Working Capital (/working-capital), Analytics (/analytics), the AI CFO Brief (/cfo-brief), Predict (/predict), Peer Benchmarks (/benchmarks), Scenario Planning (/scenarios) and Spend Intelligence (/spend) - in addition to everything in Free and Starter. It's the right tier once you have staff to pay and want forward-looking cash intelligence.",
    "route": "/payroll",
    "keywords": "growth payroll analytics cfo scenarios benchmarks predict 2499 Growth plan"
  },
  {
    "category": "Getting started & plans",
    "q": "do the plan prices include GST",
    "a": "The plan amounts (₹799 / ₹2,499 / ₹5,999 per month) are listed ex-GST - GST is applied on top at checkout. The final amount and the tax breakup appear in the Razorpay payment flow and on the Razorpay GST invoice you receive by email. So budget a bit above the headline price for the 18% GST on the SaaS subscription.",
    "route": "/settings",
    "keywords": "gst tax included exclusive 18% subscription price plus tax GST on price"
  },
  {
    "category": "Getting started & plans",
    "q": "Can I set up GST rates against HSN codes?",
    "a": "Yes - the 'GST rate master (HSN / SAC)' card on the Books GST tab lets you save a rate and cess against each HSN/SAC code. Enter the HSN (e.g. 9983), pick the GST rate (0/5/12/18/28%), optionally a cess % and a description, then 'Save rate'. Saved rates are listed below and are used to drive consistent rate lookups across the books so the same HSN always taxes at the same rate.",
    "route": "/books",
    "keywords": "gst rate master hsn sac cess rate lookup save percentage GST rate master"
  },
  {
    "category": "Getting started & plans",
    "q": "Why do my GST figures show zero even though I've added revenue?",
    "a": "GST only computes once your business profile is GST-registered. Go to Settings (/settings) → Business profile, enter your 15-character GSTIN, mark the firm GST-registered, and set your GST rate (default 18%). The banner at the top of /gst warns you when this is missing, and every GST figure - including the dashboard's estimated monthly GST liability from last month's revenue - depends on it. Once set, your sales vouchers auto-split into CGST/SGST or IGST.",
    "route": "/settings",
    "keywords": "GST zero GSTIN not registered GST rate setup CGST SGST IGST 18% GST setup"
  },
  {
    "category": "Getting started & plans",
    "q": "I have 40 employees to add, do I have to type them one by one?",
    "a": "No. On /payroll, the Employees tab has a Bulk upload button next to Add Employee - download the employees-template CSV, fill in Name, Email, Designation, CTC, PAN, PF No and Date of joining, then upload it to load everyone at once. Use Add Employee only for one-off additions where you want to watch the live estimated monthly TDS update as you type the salary.",
    "route": "/payroll",
    "keywords": "bulk add, import employees, csv upload, mass onboard, add many employees, template HR/Payroll admin · Bulk onboarding"
  },
  {
    "category": "Getting started & plans",
    "q": "I pay some people on contract not salary, where does that go",
    "a": "Use the Contractor Payouts tab on /payroll for non-employee payments - it keeps them separate from the salaried run and handles the relevant TDS treatment. Keep regular employees in the Employees tab so their PF/ESI/PT and Form 16 flow correctly; mixing the two would distort your statutory liability.",
    "route": "/payroll",
    "keywords": "contractor, consultant, freelancer, 194J, non-employee, contract payout HR/Payroll admin · Contractors"
  },
  {
    "category": "Getting started & plans",
    "q": "where do I set up leave types and approve leave requests",
    "a": "In the /hrms Leave tab: create leave types (e.g. Casual Leave with annual days and an LWP/unpaid flag), Allocate balances to staff, let people Apply, then Approve or Reject pending requests. Approvals draw down each person's leave-balance ledger; unpaid leave flows through as LOP into payroll proration.",
    "route": "/hrms",
    "keywords": "leave, leave types, casual leave, approve leave, leave balance, LWP HR/Payroll admin · Leave"
  },
  {
    "category": "Getting started & plans",
    "q": "When should I start my next raise, and how do I track investor conversations?",
    "a": "Open Next-Raise Timing on /investor: check the pre-filled cash and burn, set your raise lead time, and the \"Start raising in\" box tells you when to begin so you don't run out of runway mid-process. Then log every investor in the Raise Pipeline tab with their check size and next step, and prepare the matching documents on the Data Room tab - those three tabs are a single fundraising workflow.",
    "route": "/investor",
    "keywords": "next raise timing, when to raise, raise pipeline, investor CRM, lead time Investor portal"
  },
  {
    "category": "Getting started & plans",
    "q": "where do I download my payment invoice or GST receipt for the subscription",
    "a": "Headroom records your subscription payment (the Razorpay payment id, plan, status and period end) against your tenant, and the Plan & Billing card shows your active plan and renewal date. The tax invoice / receipt for the charge itself is generated by Razorpay - check your Razorpay payment confirmation email for the GST invoice. Note: invoices you create in Headroom (under /books or /invoices) are your customer billing, which is separate from your Headroom subscription receipt.",
    "route": "/settings",
    "keywords": "invoice receipt gst tax download subscription payment proof razorpay Invoices & receipts"
  },
  {
    "category": "Getting started & plans",
    "q": "where do the webhook secrets / gateway keys for payment connectors live?",
    "a": "On /connectors, when you connect a gateway like Razorpay or Stripe the setup form asks for the account name and a webhook secret (the masked 'whsec_…' field). For Tally you install the Headroom sync agent on your server and paste your Tenant ID into it rather than a key. Account Aggregator uses RBI-regulated one-time consent in your bank app - no passwords or API keys are stored. Treat the Key Rotation Reminder on /security as your schedule for rotating these credentials.",
    "route": "/connectors",
    "keywords": "webhook secret API key gateway credentials razorpay stripe whsec tally agent IT / Admin · Connector secrets"
  },
  {
    "category": "Getting started & plans",
    "q": "what external systems are connected and how do I cut one off?",
    "a": "Go to /connectors. 'Available Connectors' lists what you can link (Account Aggregator/Finbox for bank data, Razorpay/Stripe/PhonePe for payments, Tally/Zoho/QuickBooks for accounting), and 'Active Connections' shows what's live. Use the circular refresh icon to trigger a sync and the trash icon to disconnect a connector. Watch the 'Connector Health & Sync Monitor' to spot any feed that's gone stale (no sync in 24h).",
    "route": "/connectors",
    "keywords": "connectors integrations API disconnect revoke connection bank feed razorpay tally sync IT / Admin · Connectors & API access"
  },
  {
    "category": "Getting started & plans",
    "q": "someone's role is wrong - how do I change it without re-inviting?",
    "a": "On /organization → Members, each member has a role dropdown directly on their row. Pick the new role and it saves immediately (you'll see a confirmation). You can't change your own role or a super_admin's from here. The change is recorded under Controls & Audit → Organisation activity.",
    "route": "/organization",
    "keywords": "change role downgrade upgrade reassign permission edit member role IT / Admin · Roles & access"
  },
  {
    "category": "Getting started & plans",
    "q": "I tried to invite someone and it said seats are full - what now?",
    "a": "Your plan has a seat limit shown as a 'used/limit · plan' badge on the invite card in /organization → Members. When it's full, the invite is blocked and you'll see an upgrade prompt; go to /organization → Billing & Plan to move to a plan with more seats. Freeing a seat by removing a departed member (trash icon on Members) is the other way to make room.",
    "route": "/organization",
    "keywords": "seats full plan limit upgrade billing invite blocked too many users license IT / Admin · Seats & billing"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I add my finance person and CA to the account?",
    "a": "Go to /organization and stay on the Members tab. In the 'Invite teammates' card, type their email (or user-id), pick a role like Finance Manager or Accountant / CA, and hit Send invite. No email is actually sent - they see and accept the invite inside Headroom when they log in. Only an owner or super_admin can invite, and each seat counts against your plan's seat limit shown in the top-right badge.",
    "route": "/organization",
    "keywords": "invite teammate add user onboard staff team member IT / Admin · Team & invites"
  },
  {
    "category": "Getting started & plans",
    "q": "Can Headroom tell me what to make and buy from my sales orders?",
    "a": "Yes - on /erp create a Production plan from referenced sales orders or ad-hoc forecast rows; it nets demand against on-hand stock to get the planned quantity per finished item. Run MRP to explode each item's BOM (multi-level, so sub-assemblies expand into raw materials), aggregate the gross requirement, net it against stock and list the shortfall. Execute plan then auto-raises a work order per planned item and a single purchase material request covering all raw-material shortfalls.",
    "route": "/erp",
    "keywords": "MRP production plan material requirement planning demand forecast shortfall execute MRP / planning"
  },
  {
    "category": "Getting started & plans",
    "q": "How are forex gains and losses booked?",
    "a": "Realised gain/loss falls out when a foreign receipt/payment settles open items FIFO (oldest booked rate first) - the difference between the settle rate and the booked rate posts to the 'Forex Gain/Loss' ledger (sign flips for payables). For still-open balances, 'Revalue all' (period-end) marks each party/currency position to the as-of rate and posts the unrealised gain/loss. Revaluation is a reporting entry - it doesn't change the original booked rate of open items.",
    "keywords": "forex gain loss realised unrealised revaluation FIFO settle rate mark to market Multi-Currency"
  },
  {
    "category": "Getting started & plans",
    "q": "There's a Low-Data Mode toggle on the field page - what does it actually do, and why does it matter for rural plans?",
    "a": "Field & Offline > Low-Data Mode (/field) is the user-facing switch for conserving mobile data on ₹-per-MB rural plans. When on, it's designed to pause uploading receipt photos until you're on Wi-Fi, sync ledger entries only (deferring charts, logos and avatars), disable background auto-refresh, and batch the offline queue instead of syncing each entry live. If your device's own OS data-saver is enabled, the app notices and goes extra conservative. The preference is saved and synced across your devices.",
    "route": "/field",
    "keywords": "low data mode rural plan save data mb wifi receipts Offline / field"
  },
  {
    "category": "Getting started & plans",
    "q": "The setup checklist on my dashboard shows different steps than my colleague's - why?",
    "a": "The 'Get set up' checklist is role-aware, so each person sees steps they can actually complete. An owner gets business setup + books + bank + parties + first invoice; a finance manager gets books, bank balances, importing customers/vendors/items and recording the first invoice; a CA/accountant gets books, add-first-client, import trial balance/ledgers and review GST for filing; sales sees add leads, raise first invoice and set up collection reminders; an operations manager sees products, warehouses & BOMs and vendors/purchase orders. It reads your role from your account, so the flow matches your job.",
    "route": "/dashboard",
    "keywords": "role based onboarding owner finance accountant sales operations different steps Onboarding checklist"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I dismiss or hide the 'Get set up' card on the dashboard?",
    "a": "Click 'Dismiss' in the top-right of the 'Get set up' card on /dashboard and it won't show again (the dismissal is remembered per user). It also disappears on its own once every step is complete. Note there are actually two onboarding aids: this role-aware checklist (books/bank/invoice steps) and a separate 'Get started with Headroom' wizard (add a bank account, import 3+ transactions, generate a forecast, run credit pre-qualification) - each has its own dismiss control.",
    "route": "/dashboard",
    "keywords": "dismiss hide close onboarding card remove checklist Onboarding checklist"
  },
  {
    "category": "Getting started & plans",
    "q": "Do I have to manually tick off the setup steps as I finish them?",
    "a": "No - every step in the 'Get set up' checklist is data-detected, so it ticks itself off as you work. Your business step completes once you've set a real firm name or GSTIN; the books step once your chart of accounts has ledgers; the bank step once you've added an account; the parties step once you have customers/vendors or items; the invoice step once an invoice exists. The progress bar climbs automatically, and the whole card disappears at 100%.",
    "route": "/dashboard",
    "keywords": "auto tick complete steps manual mark done progress data detected checklist Onboarding checklist"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I enter my opening balances / trial balance from my previous system?",
    "a": "For ledger opening balances, use the Books → Closing tab to import a trial-balance CSV of opening balances (the Migration Wizard points you there). When bulk-uploading ledgers via the CSV path on /data, each ledger row also accepts 'Opening Balance' and a Dr/Cr direction column, so debtors/creditors come in with their balances. Stock items support 'Opening Qty' and 'Opening Value'. Import ledgers → items → invoices in that order so references resolve.",
    "route": "/books",
    "keywords": "opening balance trial balance closing tab Dr Cr opening qty value migrate previous system Opening balances"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I enter opening balances when migrating from Tally or another system?",
    "a": "On the 'Closing' tab there's an opening-balances entry and a bulk importer (POST /api/books/import/opening-balances). Set each ledger's opening figure with its Dr/Cr direction. Under the hood the integrity layer can also 'pad' a ledger to a target balance - it posts the difference against an 'Opening Balance Equity' wash account, which nets to zero once every opening balance is entered (the standard temporary-opening approach). This keeps the trial balance balanced while you load history.",
    "route": "/books",
    "keywords": "opening balances migration tally import pad opening balance equity Dr Cr Opening Balances"
  },
  {
    "category": "Getting started & plans",
    "q": "As an ops manager, what should I set up first?",
    "a": "Your onboarding flow is product/stock focused: add your products (Item master in Books, /books - type a few or bulk-upload), set up warehouses & BOMs (locations, putaway and manufacturing in the ERP module, /erp), then add vendors and a purchase order (procurement and supplier terms under /vendors). These steps tick off as items, locations and parties are detected, getting your inventory and procurement flows live.",
    "route": "/erp",
    "keywords": "operations ops manager products items warehouses BOM vendors purchase order inventory ERP Operations"
  },
  {
    "category": "Getting started & plans",
    "q": "how do i plan today's deliveries so the route isn't all over the place?",
    "a": "Use the 'Dispatch' tab on /operations. It plans today's delivery run grouped by area to reduce back-tracking and give an efficient route. Tap a status chip to cycle each stop pending → loaded → delivered as the day progresses.",
    "route": "/operations",
    "keywords": "dispatch, delivery route, route planning, loading, stops, delivery run Operations / Procurement · Dispatch"
  },
  {
    "category": "Getting started & plans",
    "q": "which products are barely making me any margin?",
    "a": "Use the 'Margin / SKU' tab on /operations. Set a selling price per SKU (it defaults to cost + 40% and saves per item) and it shows margin % (profit ÷ selling price), markup % (profit ÷ cost) and the profit locked in current stock. Rows are sorted lowest-margin first, so your thinnest products surface at the top for repricing or dropping.",
    "route": "/operations",
    "keywords": "margin per SKU, low margin products, markup, profit per item, pricing, which products profitable Operations / Procurement · Margin per SKU"
  },
  {
    "category": "Getting started & plans",
    "q": "when should I start raising my next round?",
    "a": "Open /investor's Next-Raise Timing tab - it pre-fills your cash and burn, you set your raise lead time, and the 'Start raising in' box tells you when to begin so you don't run dry mid-raise. Then log every investor in Raise Pipeline with their check size and next step, and prep the Data Room checklist toward 100%. Investors want to see burn multiple under 1.5x and runway over 12 months before you pitch.",
    "route": "/investor",
    "keywords": "when to raise, next round, fundraise timing, start raising Owner · Fundraising timing"
  },
  {
    "category": "Getting started & plans",
    "q": "I just signed up - what do I do first to see real numbers?",
    "a": "On /dashboard work through the 'Get started with Headroom' wizard: Add a bank account, Import 3+ transactions (use Import CSV to bulk-load a statement), generate a forecast, and run credit pre-qualification - the four cards then fill with real numbers. For a fast feel, /data has 'Load demo data' (six years of realistic financials) and 'Clear all' when you're ready for your own. Connect live feeds via /connectors using Account Aggregator (RBI-regulated, no passwords).",
    "route": "/dashboard",
    "keywords": "getting started, setup, first steps, onboarding, import data, new account Owner · Getting started"
  },
  {
    "category": "Getting started & plans",
    "q": "am I actually making money on what I sell?",
    "a": "Open /analytics - the P&L Deep Dive shows your real profit margin, and the SKU Profitability tab lets you set a COGS % per item to get true gross margins per product. For manufacturers, /erp calculates true per-unit cost including materials and labour from work orders so you know what each item costs to make and can price it right. Always set per-item COGS overrides before trusting the numbers - defaults are assumptions, not your actuals.",
    "route": "/analytics",
    "keywords": "margin, profit per product, am i making money, gross margin, pricing Owner · Margins"
  },
  {
    "category": "Getting started & plans",
    "q": "what happens to my profit if I raise prices 10%?",
    "a": "Open /scenarios and use the Price-Change Profit tab - it's a focused calculator that shows how a price change flows through to profit, including the volume you can afford to lose. For the broader cash picture, the Cash Planner tab lets you stack a revenue-increase event and see the 6-month runway impact. Run Break-even in the same module to confirm the new price still clears your fixed costs.",
    "route": "/scenarios",
    "keywords": "raise prices, price increase, profit impact, pricing change, what if Owner · Price increase"
  },
  {
    "category": "Getting started & plans",
    "q": "the upgrade button is disabled or says payments aren't enabled - why",
    "a": "If the server doesn't have Razorpay keys configured, the Plan & Billing card shows 'Payments aren't enabled on this environment yet' and the upgrade buttons are disabled. This happens on environments where RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET haven't been set. Once those are configured on the server the checkout goes live automatically - nothing changes on your side except the button becomes clickable.",
    "route": "/settings",
    "keywords": "disabled greyed out payments not enabled razorpay keys configured error Payments not enabled"
  },
  {
    "category": "Getting started & plans",
    "q": "I'm a finance manager / accountant - why can't I upgrade the plan myself",
    "a": "Upgrading is restricted to the account owner (and the platform super_admin). The billing endpoints (/api/billing/razorpay/order and /verify) require owner-or-admin, so a finance manager, accountant, sales, ops or viewer can see the Plan & Billing card and which features are gated, but the upgrade button is meant to be actioned by the owner. Ask your owner to open Settings → Plan & Billing and upgrade - the new tier then applies to every member of the workspace.",
    "keywords": "permission role finance accountant viewer cannot upgrade owner only Permissions"
  },
  {
    "category": "Getting started & plans",
    "q": "What are the pipeline stages and how do I move a deal between them?",
    "a": "The /crm Pipeline board has four open columns: Qualification, Demo, Proposal and Negotiation. On each deal card use the left/right arrows to step it back or forward one stage. Won and Lost are terminal - once a deal leaves the open stages it can't be flipped back, and the forward arrow disables at Negotiation. The card shows the deal value, win probability % and account, plus an SLA badge if a Deal SLA applies.",
    "route": "/crm",
    "keywords": "pipeline stages qualification demo proposal negotiation move kanban Pipeline"
  },
  {
    "category": "Getting started & plans",
    "q": "what plans does headroom have and what does each one cost",
    "a": "Headroom has four tiers: Free, Starter (₹799/mo), Growth (₹2,499/mo) and Pro (₹5,999/mo) - prices shown ex-GST and billed via Razorpay. Free covers the core daily-use surfaces (invoicing, GST basics, transactions, dashboard, documents, plus the cash-flow forecast and financial-health score). Starter adds the 'get paid faster' suite (Collections + Receivables); Growth adds Payroll, Working Capital, Analytics, the AI CFO brief, Predict, Benchmarks, Scenarios and Spend; Pro unlocks Credit/Lending, Treasury, Valuation, Cap-table/Term-sheet, Investor relations, Connectors & API, Automation and cross-border. You can see and compare all of them under Settings, in the 'Plan & Billing' card.",
    "route": "/settings",
    "keywords": "tiers pricing free starter growth pro how much Plans overview"
  },
  {
    "category": "Getting started & plans",
    "q": "Can I set up customer-specific pricing, discounts or price lists?",
    "a": "Yes, through the Books selling-side pricing engine. You can create pricing rules scoped by item/group/brand and by customer/group/territory, with an action of fixed rate, discount %, discount amount or margin markup, plus qty/amount thresholds and a validity window. When multiple rules match a line, the highest-priority and most-specific one wins. It also supports BXGY free-goods schemes, coupons (with validity, redemption limits and once-per-customer), shipping/freight slabs, and bulk price-list uploads. These live in the Books module at /books.",
    "route": "/books",
    "keywords": "price list pricing rule discount margin coupon BXGY customer specific freight Pricing / price lists"
  },
  {
    "category": "Getting started & plans",
    "q": "why do I see prices in dollars instead of rupees (or vice versa)",
    "a": "Headroom is India-first and shows ₹ by default; it only switches the displayed price to USD ($9/$29/$69 for Starter/Growth/Pro) for visitors detected as US-based (by timezone or browser locale). The actual charge is processed in INR through Razorpay regardless - USD is a display convenience. So even if you see dollars on the card, the Razorpay checkout settles in rupees.",
    "route": "/settings",
    "keywords": "usd dollars rupees inr currency price display region Pricing currency"
  },
  {
    "category": "Getting started & plans",
    "q": "what does the Pro plan unlock",
    "a": "Pro (₹5,999/mo) is the capital + advanced tier. On top of everything below it, it unlocks Credit & Lending (/credit), Treasury (/treasury), Lenders (/lenders), Business Valuation (/valuation) and Term Sheet builder (/term-sheet), Capital Raising (/capital), Investor Relations (/investor), Connectors & API (/connectors), Automation (/automation), the B2B Network (/network), Marketplace finance (/marketplace) and Cross-border (/global). Pick Pro if you're raising money, managing lenders/treasury, or need API/integrations.",
    "route": "/credit",
    "keywords": "pro credit treasury valuation capital api connectors investor 5999 Pro plan"
  },
  {
    "category": "Getting started & plans",
    "q": "my CA already uses Tally - will they hate this?",
    "a": "Probably not. Your CA gets clean financial-year P&L and Balance Sheet straight from /books (GST is already split into CGST/SGST/IGST at posting, so less cleanup at GSTR time), GSTR-2B reconciliation reports they can download from /gst, and a Tally Bridge in /data to push vouchers back to Tally if they prefer. There's even a dedicated CA cockpit (/advisor) if your accountant wants to manage you alongside other clients.",
    "route": "/advisor",
    "keywords": "ca, accountant, chartered accountant, tally workflow, my ca Prospect · CA workflow"
  },
  {
    "category": "Getting started & plans",
    "q": "is there a free version I can just use?",
    "a": "Yes. The Free plan includes the core daily features - your Dashboard, invoicing (/invoices), GST basics (/gst), transactions, the cash Forecast and Financial Health score, plus the document vault. Paid features (payroll, analytics, credit, etc.) show a 'Set up' / upgrade prompt when you open them. You can run the whole free tier without paying anything.",
    "route": "/dashboard",
    "keywords": "free plan, free forever, no cost, free tier Prospect · Free plan"
  },
  {
    "category": "Getting started & plans",
    "q": "where do I even start once I sign up?",
    "a": "Start on the Dashboard - there's a 'Get started with Headroom' wizard with four steps: add a bank account, import 3+ transactions, generate a forecast, and run credit pre-qualification. Doing those four fills the dashboard with real numbers. If you want to explore first, load demo data from /data instead.",
    "route": "/dashboard",
    "keywords": "getting started, first steps, setup, onboarding, where to begin Prospect · Getting started"
  },
  {
    "category": "Getting started & plans",
    "q": "what does it cost and which plan do I need?",
    "a": "There are four tiers (see Settings -> Plan & Billing): Free, Starter (₹799/mo) for unlimited invoicing + WhatsApp/UPI collections and GST prep, Growth (₹2,499/mo) which adds payroll, cash forecast, analytics and the AI CFO, and Pro (₹5,999/mo) which adds credit, treasury, valuation/cap-table and API access. Most small businesses start on Free or Starter and move to Growth when they need payroll and forecasting.",
    "route": "/settings",
    "keywords": "price, cost, plans, how much, subscription, pricing Prospect · Pricing"
  },
  {
    "category": "Getting started & plans",
    "q": "how hard is it to switch over from Tally?",
    "a": "Not hard. In /data there's a 'Switch from Tally / bring your data' wizard, plus a 'Tally Bridge' tab: you can paste a Tally voucher export and Import it, or use the CSV Mapper to drag in any bank/accounting spreadsheet by mapping the date/amount/description columns yourself. There's also a downloadable template and a Tally sync agent (via /connectors) that pushes vouchers in automatically and de-duplicates them.",
    "route": "/data",
    "keywords": "switch, migrate, import tally, move from tally, onboarding data Prospect · Switching cost"
  },
  {
    "category": "Getting started & plans",
    "q": "can I try it without putting in all my real data first?",
    "a": "Yes - open /data, Overview tab, and click 'Load demo data' to fill the entire app with six years of realistic financials so you can click around every feature and see how it behaves. When you're ready for the real thing, click 'Clear all' and import your own numbers. Nothing about the demo touches real bank accounts.",
    "route": "/data",
    "keywords": "demo, try, sample data, test drive, sandbox Prospect · Try before buying"
  },
  {
    "category": "Getting started & plans",
    "q": "how is this different from Tally?",
    "a": "Tally is desktop accounting; Headroom is cloud-based and built around cash flow, not just ledgers. You still get full double-entry books to Tally standards (/books gives you Trial Balance, P&L, Balance Sheet, Cash Flow with auto CGST/SGST/IGST splits), but on top of that you get a live cash runway dashboard, automatic collections reminders over WhatsApp, GST 2B reconciliation, payroll that posts to your books, and loan pre-qualification - none of which Tally does. And you can import your existing Tally data via the Tally Bridge in /data.",
    "route": "/books",
    "keywords": "tally difference, vs tally, replace tally, better than tally Prospect · vs Tally"
  },
  {
    "category": "Getting started & plans",
    "q": "ok so what actually is Headroom and what does it do",
    "a": "Headroom is an all-in-one finance platform for Indian SMBs: your Dashboard turns your bank balances, transactions and invoices into a live view of cash, monthly burn, runway and what's due next. From there you can do real double-entry accounting (/books), raise GST invoices (/invoices), chase overdue customers (/collections), run payroll (/payroll), forecast 90 days of cash (/forecast), file GST (/gst) and check loan eligibility (/credit) - all in one login instead of a stack of separate tools.",
    "route": "/dashboard",
    "keywords": "what is headroom, overview, what does it do, all in one Prospect · What is it"
  },
  {
    "category": "Getting started & plans",
    "q": "The import and demo-data buttons are greyed out - why can't I use them?",
    "a": "Your role has read-only access. The Data & Import page (/data) shows a yellow banner 'Your role has read-only access - importing and editing are disabled', and the Load demo / Clear all / Upload buttons are disabled. On the Dashboard, Add Account / Import CSV / Add Transaction are also disabled in client/read-only view (you'll see a 'Read-only in client view' tooltip). Ask an owner, finance or accountant on your workspace to do the setup, or have your role changed.",
    "route": "/data",
    "keywords": "read only disabled greyed out can't import permission role client view editing Read-only / permissions"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I set up a recurring or subscription invoice?",
    "a": "Use the 'Recurring' tab on /invoices: enter the customer, amount, GST rate, frequency (monthly/quarterly/yearly) and a next-run date, then '+ Schedule'. The panel tracks active subscriptions, estimated MRR (incl. GST) and how many are due to generate. Today cycles advance when you click 'Generate now' on a due row (you can also Pause/Resume) - the schedule advances the next-run date but invoices are not auto-fired on a timer yet.",
    "route": "/invoices",
    "keywords": "recurring subscription MRR monthly quarterly yearly generate now pause Recurring invoices"
  },
  {
    "category": "Getting started & plans",
    "q": "when does my subscription renew and is it monthly or yearly",
    "a": "Each paid upgrade is a one-time Razorpay Standard Checkout that activates roughly a 30-day period; the renewal date is shown as 'Renews <date>' on the Plan & Billing card. Prices are quoted per month (e.g. ₹2,499/mo) and the upsell screen notes 'billed yearly · cancel anytime'. Because each charge covers a single period, you re-run checkout to extend - there's no silent auto-charge stored card flow in this build.",
    "route": "/settings",
    "keywords": "renew renewal monthly yearly period 30 days billing cycle Renewal & period"
  },
  {
    "category": "Getting started & plans",
    "q": "Why can't I post entries or set up books - the buttons are disabled?",
    "a": "Posting, reconciling, creating documents and setting up books are write actions gated to owner, finance_manager and accountant roles (plus super_admin). If you're a viewer, sales or ops user you can still view reports and the chart of accounts, but the action buttons show a note like 'You need an owner / finance / accountant role to post entries.' Ask an admin to change your role if you need write access.",
    "route": "/books",
    "keywords": "permission role disabled cannot post write access viewer sales ops owner finance accountant Roles"
  },
  {
    "category": "Getting started & plans",
    "q": "how much commission am I making on my closed deals?",
    "a": "Use the Commissions tab on /sales. Add each closed deal with the rep, deal value and margin, and pick flat or tiered payout - it calculates the payout per rep and shows Revenue closed, Total commission and your effective payout %. The Quote to Order tab also shows a per-deal commission and net-margin breakdown when you build the quote.",
    "route": "/sales",
    "keywords": "commission payout incentive flat tiered earnings Sales · Commissions"
  },
  {
    "category": "Getting started & plans",
    "q": "how do I log a customer visit when I'm visiting clients?",
    "a": "On /field use the Visit Log to record customer visits and the Beat / Route Plan to plan your day's stops. End the day with Day Summary, which shows your field sales, cash/UPI collected, visits logged and how many entries are still awaiting sync - your fastest check that everything from the field reached the books.",
    "route": "/field",
    "keywords": "visit log field visit beat route plan day summary stops Sales · Field"
  },
  {
    "category": "Getting started & plans",
    "q": "Why can't I send an invite - it says my plan is full?",
    "a": "Each plan has a seat limit, shown as a 'used/limit seats · plan' pill at the top of the 'Invite teammates' card in Organization → Members. When you hit the limit the Send button disables and a yellow banner appears with an Upgrade shortcut to Billing & Plan. Removing an inactive member frees a seat, or upgrade your plan to add more seats.",
    "route": "/organization#billing",
    "keywords": "plan full seats limit can't invite upgrade billing seat limit reached Seats / billing"
  },
  {
    "category": "Getting started & plans",
    "q": "Why does a feature show a 'Set up' pill - does that mean it's fake?",
    "a": "No. The amber 'Set up' pill means the feature is fully working on realistic preview data, but its live external rail isn't connected yet. For example GST e-invoicing generates a sample IRN until you connect your GST Suvidha Provider, and bank sync runs on manual/sample accounts until you switch on Account Aggregator. Click the pill to jump to Connectors and switch on live data - the pill disappears the moment the partner key is configured.",
    "route": "/connectors",
    "keywords": "set up pill preview badge fake not real plug live data switch on credential gated Set up / preview features"
  },
  {
    "category": "Getting started & plans",
    "q": "Where do I connect my GST Suvidha Provider so e-invoices issue real IRNs?",
    "a": "Go to Connectors and connect your GSP (GST Suvidha Provider) - it's a one-time setup. Until then, e-invoice generation produces a sample IRN so you can test the full flow. Once the GSP is connected the 'Set up' pill on GST e-invoicing disappears and real IRNs are issued. The GST screen itself stays usable throughout.",
    "route": "/connectors",
    "keywords": "GSP GST suvidha provider e-invoice IRN real connect credential gated GST e-invoicing Set up / preview features"
  },
  {
    "category": "Getting started & plans",
    "q": "Why is my bank balance/transactions showing sample data instead of my real bank?",
    "a": "Automatic bank feeds run through Account Aggregator (AA), which is a one-time connect in Connectors. Until you switch it on, you add accounts and transactions manually (or via CSV import) and may see sample balances. Connect AA in Connectors to switch on automatic bank sync - the 'Set up' pill on banking clears once it's live.",
    "route": "/connectors",
    "keywords": "bank sync account aggregator AA sample data real bank balance connect feeds Set up / preview features"
  },
  {
    "category": "Getting started & plans",
    "q": "I want to actually disburse a loan / KYC a customer but it won't let me - why?",
    "a": "Eligibility, offers and underwriting are fully live, but actual loan disbursement needs a lending partner connected, and live KYC checks need a verification provider - both are credential-gated and set up in Connectors. The same applies to BNPL/EWA payouts (need a payout partner) and treasury sweeps (need a treasury partner). Open Connectors and connect the relevant partner; the 'Set up' pill on each disappears once it's wired.",
    "route": "/connectors",
    "keywords": "loan disbursement KYC verification payout BNPL EWA treasury sweep partner credit lending Set up / preview features"
  },
  {
    "category": "Getting started & plans",
    "q": "Is there a more rigorous, file-based settlement reconciliation than just entering one MDR number?",
    "a": "Yes - the backend has a settlement-grade PSP reconciliation engine (settlement.js) that ingests a parsed payout file with per-transaction gross, fee, tax, net and bank UTR. It runs each EXPECTED line through a rules matcher to find the matching bank deposit (by UTR, then amount) and the booked GROSS receipt, verifies fee+tax equals gross−net within the provider's negotiated band, and raises auto-flagged exceptions (MISSING_DEPOSIT, MISSING_RECEIPT, SHORT/OVER, FEE). It never mutates posted GL rows and only flips a line to POSTED once the net deposit is found. Default fee profiles cover Razorpay 2.0%, Cashfree 1.95%, PayU 2.0%, Stripe 2.9%, all at 18% GST.",
    "keywords": "PSP settlement file payout reconciliation utr exception fee decomposition hyperswitch razorpay cashfree payu stripe net gross Settlement reconciliation"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I start using Books / set up my chart of accounts?",
    "a": "Open Books from the left nav (route /books). The first time, the Overview area shows a 'Set up your books' card - press 'Set up my books'. That one click seeds 28 standard account groups (Sundry Debtors, Sales Accounts, Duties & Taxes, Bank Accounts, etc.) plus the default ledgers (cash, sales, GST and so on) so you can post double-entry vouchers immediately. You need an owner, finance_manager or accountant role to run it - viewers and sales/ops roles see the button disabled with a note explaining why.",
    "route": "/books",
    "keywords": "seed chart of accounts first time onboarding groups ledgers Setup"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I set up response-time targets for my team?",
    "a": "On /crm open the SLA tab and click New SLA. Name it, choose whether it applies on Lead or Deal, tick Default if it should auto-apply, then add priority rows with Response hours and Resolution hours (e.g. High = 1h response / 8h resolve, Low = 8h / 24h) and mark one priority as default. Hours are counted against business hours 9-18 Mon-Fri. A lead's Priority field then maps it to the matching tier.",
    "route": "/crm",
    "keywords": "sla setup create response resolution hours priority default business hours SLA"
  },
  {
    "category": "Getting started & plans",
    "q": "Where do I track corporate cards, petty cash and subscriptions?",
    "a": "Use Spend Intelligence at /spend. It tracks corporate cards and petty-cash floats (add a holder/custodian, type, limit and amount spent), recurring SaaS subscriptions (monthly/quarterly/annual) so you can catch creep and unused tools, cost centres with monthly budgets, a spend-request approval queue, and policy rules with per-transaction caps. It's the operational spend-control layer that complements category Budgets at /budgets.",
    "route": "/spend",
    "keywords": "spend corporate card petty cash subscription saas cost center policy approval Spend"
  },
  {
    "category": "Getting started & plans",
    "q": "what do I get if I upgrade to Starter",
    "a": "Starter (₹799/mo) is the 'get paid faster' tier. On top of everything in Free it unlocks the Collections suite (/collections) - automated WhatsApp/UPI/email reminder ladders, DSO and promise-to-pay tracking, one-tap customer statements - and Receivables intelligence (/receivables) with ageing buckets, an overdue heatmap, customer risk scoring and a collection forecast. If your main pain is chasing overdue invoices, this is the tier to pick.",
    "route": "/collections",
    "keywords": "starter collections receivables reminders dso ageing 799 Starter plan"
  },
  {
    "category": "Getting started & plans",
    "q": "why does the super admin / platform account never hit the upgrade wall",
    "a": "The platform super_admin (admin@headroom.app) bypasses every plan gate by design - the RouteGuard skips the entitlement check for super_admin, so it sees all features regardless of tenant plan. This is for platform administration only; a normal owner can't grant themselves super_admin via signup, so for real businesses the plan gates always apply.",
    "keywords": "super admin bypass gate platform owner all features admin@headroom Super admin"
  },
  {
    "category": "Getting started & plans",
    "q": "I'm coming from Tally - how do I bring my ledgers and stock items across?",
    "a": "Open Data & Import (/data) and click 'Migrate data' on the 'Switch from Tally / bring your data' card (or use the Tally Bridge tab). Pick 'Switch from Tally', then in Tally do Gateway of Tally → Display → List of Accounts → Export (or Export → Masters) and choose XML. Drop that single XML file in and Headroom automatically splits it into ledgers/parties and stock items, shows you how many of each it found, and imports them through the same validated bulk pipeline - bad rows are skipped with reasons, good rows go through.",
    "route": "/data",
    "keywords": "Tally migration switch import masters XML ledgers stock items move from Tally Switch from Tally"
  },
  {
    "category": "Getting started & plans",
    "q": "What's the difference between the Tally migration wizard and the Tally Bridge tab?",
    "a": "The 'Migrate data' wizard (Switch-from-Tally option) imports your Tally Masters export - a single XML file of ledgers/parties and stock items - into your books, ideal for a one-time switch. The 'Tally Bridge' tab on /data is for ongoing voucher/transaction movement: it exports your live transactions as a Tally-importable Daybook XML, and lets you paste a Tally voucher export (<ENVELOPE>…<VOUCHER>) to pull transactions into Headroom. Use the wizard to switch over, the Bridge to keep data flowing both ways.",
    "route": "/data",
    "keywords": "Tally bridge vs migrate wizard daybook voucher export import difference Switch from Tally"
  },
  {
    "category": "Getting started & plans",
    "q": "Does my Tally data get uploaded to your servers when I import it?",
    "a": "For the Tally Bridge tab the XML is generated and parsed entirely in your browser - nothing is uploaded - though you should verify the ledger mapping in Tally after an import. The Migration Wizard's Masters import posts the parsed ledgers and stock items to your own workspace's books via the validated bulk endpoints so they become your accounting data. Either way, the import shows you exactly how many records were created and lists any skipped rows with the reason.",
    "route": "/data",
    "keywords": "Tally privacy upload browser local parsing data security where stored Switch from Tally"
  },
  {
    "category": "Getting started & plans",
    "q": "An 'offline' banner appeared - what should I do?",
    "a": "The offline banner means the app can't currently reach the backend (network drop or a backend cold-start). You can keep working - changes are saved locally and the app keeps retrying; everything syncs automatically when the connection returns. No action needed beyond checking your internet. If reports look stale during this time, that's expected; they refresh on reconnect.",
    "keywords": "offline banner backend unreachable network cold start keep working sync reconnect Sync / saving"
  },
  {
    "category": "Getting started & plans",
    "q": "I'm switching from Tally - how do I bring my ledgers and data across?",
    "a": "Two routes. On /data Overview, 'Switch from Tally / bring your data' opens the Migration Wizard, which takes a Tally Masters XML export (one file → ledgers + stock items) or CSVs for ledgers, items and opening invoices, validated row-by-row. Separately, the 'Tally Bridge' tab does live transactions: 'Export → Tally XML' generates a Tally-importable Daybook, and you can paste a Tally voucher export (<ENVELOPE>/<VOUCHER>) and Preview then Import it into Headroom. All Tally XML is parsed in your browser - nothing is uploaded - so verify the ledger mapping in Tally afterward.",
    "route": "/data",
    "keywords": "tally migration switch ledgers xml daybook voucher import export Tally migration"
  },
  {
    "category": "Getting started & plans",
    "q": "if I upgrade, does the whole team get the new features or just me",
    "a": "The subscription is per-tenant (per company), not per-user. When the owner upgrades, Headroom writes the new plan to the tenant's billing record and updates the subscription_plan on every user in the workspace, so all team members' feature entitlements reflect the company plan at once. There's no separate per-seat charge - one tier covers the whole workspace.",
    "keywords": "seats team users per tenant company everyone shared subscription Team & seats"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I build an FD ladder so cash frees up at intervals?",
    "a": "Open the FD/RD Ladder tab on /treasury. Choose Fixed Deposit (lump sum) or Recurring Deposit (monthly), enter the amount, interest rate, the longest tenure in months and the number of rungs (2-8). It splits the money across staggered maturities and shows each rung's tenure, maturity date, principal, maturity value and interest, plus totals - so cash unlocks at regular intervals instead of being locked in one long FD. Match the rung dates to GST, advance-tax and payroll outflows.",
    "route": "/treasury",
    "keywords": "FD ladder, RD, rungs, staggered maturity, recurring deposit Treasury"
  },
  {
    "category": "Getting started & plans",
    "q": "Where is the trial balance and how do I know my books are balanced?",
    "a": "Books → 'Reports' tab → 'Trial Balance' (or the Overview tab shows a balanced/out-of-balance banner at a glance). Set the financial year (e.g. 2026-27) in the box at top right. Every ledger appears with its nature and a Dr or Cr column, with totals at the bottom and a green 'Balanced' / red 'Out of balance' badge. Because all reports read straight from the posted voucher entries (cancelled ones excluded), total debit must equal total credit - that's the correctness oracle.",
    "route": "/books",
    "keywords": "trial balance balanced debit credit reports oracle out of balance Trial Balance"
  },
  {
    "category": "Getting started & plans",
    "q": "how do I pay - what payment methods can I use to upgrade",
    "a": "Upgrades run through Razorpay Standard Checkout, so you can pay by UPI, debit/credit card, netbanking or wallet - India-first rails. When you click 'Upgrade to Growth' (or any tier) the Razorpay modal opens, you pay once for the period, and Headroom verifies the payment signature on the server before activating the plan. If you close the modal without paying, nothing is charged.",
    "route": "/settings",
    "keywords": "upi card netbanking wallet razorpay payment method Upgrading"
  },
  {
    "category": "Getting started & plans",
    "q": "Why does my UPI link say 'No payment gateway configured'?",
    "a": "That yellow banner appears when no Razorpay key is set up, so the backend returns a plain UPI intent deep-link (provider not razorpay, demo:true) instead of a trackable hosted link. The link still works for the customer to pay by UPI, but it won't auto-reconcile or track payment status. To issue trackable, auto-reconciling links, configure Razorpay in your integrations/payment settings. Until then it is an honest plain UPI deep-link.",
    "route": "/collections",
    "keywords": "razorpay gateway demo UPI intent reconcile configure UPI / payment links"
  },
  {
    "category": "Getting started & plans",
    "q": "How do I set up product variants like size and colour?",
    "a": "On the Variants sub-tab pick a Parent item, then Add variant with a name (e.g. Red / Large) and attributes typed as 'Color: Red, Size: L' or as JSON. Each variant is a real, independently-stocked item linked to the parent; it inherits the parent's unit and valuation method so it values consistently, while HSN/GST/barcode can differ. You receive, issue and value each variant separately, and the variants table shows each one's closing quantity.",
    "route": "/books",
    "keywords": "variant size colour attributes parent child item template Variants"
  },
  {
    "category": "Getting started & plans",
    "q": "I'm actually an advisor - can I get edit rights or is this it?",
    "a": "Only a workspace owner can change your role. They do it in Settings under the team/organization area, where they can move you from Viewer to a role with write access (e.g. Accountant/CA or Finance Manager). If you're an external CA advising multiple businesses, the better fit is the Advisor portal where the owner shares their Tenant ID and you manage clients from your own login - but that's the owner's call to set up. Until then, the read-only banner stays and saves are blocked.",
    "route": "/settings",
    "keywords": "get edit rights, change my role, advisor, upgrade access, owner permission Viewer · Role change"
  },
  {
    "category": "Getting started & plans",
    "q": "Why do voucher numbers never skip or repeat?",
    "a": "The posting engine allocates voucher numbers from an atomic per-(tenant, type, financial-year) counter inside the same database transaction that writes the voucher, so numbering is gap-free and rolls back with the transaction if anything fails. Retried/duplicate API requests are de-duplicated via an idempotency key, so a network retry never double-posts. This is what keeps the sequence audit-clean for your CA.",
    "keywords": "voucher number gap free sequential idempotency duplicate post Vouchers"
  },
  {
    "category": "Getting started & plans",
    "q": "where do I upgrade my plan",
    "a": "Go to /settings and scroll to the 'Plan & Billing' card, or open Organization → 'Billing & Plan' tab (/organization#billing) - both show the same card. Each paid tier has an 'Upgrade to …' button that opens Razorpay Standard Checkout (UPI, cards, netbanking, wallets). Only an owner or super_admin can actually trigger the upgrade; the payment is verified server-side before your plan flips over.",
    "route": "/settings",
    "keywords": "upgrade subscribe buy plan billing checkout Where to upgrade"
  },
  {
    "category": "Getting started & plans",
    "q": "How much cash is tied up in my working capital and how do I free it?",
    "a": "On /working-capital the funding-gap callout shows how much cash your cycle ties up (and how many months of opex that is). The Cash Release Simulator shows how much you'd unlock by reducing DSO, cutting DIO, or extending DPO, with specific tactics for each. The Terms Negotiator suggests concrete asks for your biggest customers and vendors with the cash impact quantified from your own receivables and payables.",
    "route": "/working-capital",
    "keywords": "cash tied up working capital gap free unlock release dso dio dpo negotiate Working Capital"
  },
  {
    "category": "Books & accounting",
    "q": "How do I reconcile my books against Form 26AS / AIS?",
    "a": "In Books > Tax Filing > '26AS reconcile' sub-tab, paste your Form 26AS (or AIS) export as CSV with a header row - columns like section, deductor, tan, amount, tds, date - then click Reconcile. It ingests each portal row and matches it against the TDS you suffered in your books (TDS rows with input/credit flag) on section + period + exact tax amount, returning Matched, Unmatched-in-portal and Unmatched-in-books buckets so you can chase deductors who haven't filed or fix mismatches.",
    "route": "/books",
    "keywords": "26AS, AIS, reconcile, TDS suffered, paste CSV, mismatch, tax credit 26AS reconciliation"
  },
  {
    "category": "Books & accounting",
    "q": "Why do some 26AS rows show as unmatched even though I booked that TDS?",
    "a": "Matching requires the section AND the period (YYYY-MM) to agree and the tax amount to be exactly equal. Common reasons for an unmatched row: the deductor reported a slightly different amount or rounding, the period differs (they credited a different month), the section is recorded differently in your books, or the deductor simply hasn't filed yet so 26AS hasn't reflected it. Rows your books have but 26AS doesn't show up under 'Unmatched-in-books' - those are the deductors to chase.",
    "keywords": "unmatched, period, exact amount, deductor not filed, rounding 26AS reconciliation"
  },
  {
    "category": "Books & accounting",
    "q": "Why should I add the GSTIN on an account, and what's the 'Linked' badge in the Books column?",
    "a": "Set the GSTIN on an Account (New account form, GSTIN field) before you win the related deal - when the deal is won the auto-created Books party ledger carries the GSTIN through, so your invoices show the correct buyer GSTIN and place-of-supply. The 'Linked' green check in the Accounts table's Books column means that account already has a connected Books ledger (books_ledger_id), i.e. it's been won/synced into your accounting.",
    "route": "/crm",
    "keywords": "gstin account books linked ledger badge place of supply Accounts & contacts"
  },
  {
    "category": "Books & accounting",
    "q": "Why do my GST returns always match my books exactly?",
    "a": "Every GST figure in Headroom is a pure aggregation over tax entries that are captured at posting time at full precision, joined only to vouchers that aren't cancelled. Outward tax (is_input = false) drives liability; ITC (is_input = true) drives credit. Taxable value is counted once per line (from the CGST/IGST limb) so CGST+SGST pairs never double-count it. Because GSTR-1, GSTR-3B and GSTR-9 all read the same posted data over the right date range, they reconcile to your trial balance by construction - there's no separate GST ledger to drift.",
    "route": "/books",
    "keywords": "reconcile books gst accuracy posting tax entries double count cancelled vouchers Accuracy / trust"
  },
  {
    "category": "Books & accounting",
    "q": "Where do I see my revenue, expenses and profit trends?",
    "a": "Open /analytics. The Overview tab shows a Revenue vs Expenses chart (toggle 3M/6M/12M and bars/trend), a Net Profit Margin line, an expense category pie, and your top 5 revenue sources and expense vendors. The KPI strip at the top gives period revenue, expenses, net P&L and average net margin with month-over-month deltas. There are 35 tabs in total covering P&L Deep Dive, Cash Flow, Ratios, Balance Sheet, Trial Balance, Cohorts, Unit Economics and more.",
    "route": "/analytics",
    "keywords": "analytics revenue expense profit trend chart margin overview dashboard Analytics"
  },
  {
    "category": "Books & accounting",
    "q": "Can I export my analytics or P&L as PDF or Excel?",
    "a": "Yes, if your role allows exports. On /analytics the PDF and Excel buttons appear top-right (gated by export permission). PDF produces a branded report with monthly P&L, top revenue sources and top expense vendors; Excel produces a multi-sheet workbook (Monthly P&L, Top customers, Top vendors). Both are named with your firm name. If you don't see the buttons, your viewer/client role doesn't have export rights.",
    "route": "/analytics",
    "keywords": "export pdf excel analytics report download P&L spreadsheet Analytics"
  },
  {
    "category": "Books & accounting",
    "q": "How does Headroom calculate gross margin, EBITDA and net income?",
    "a": "The P&L Deep Dive tab on /analytics builds an income-statement bridge from Revenue down to Net Income. Note these use estimates: direct operating costs are taken from the 'expense' category, depreciation is estimated at ~1.5% of revenue, and interest at ~35% of loan payments. EBITDA = EBIT + estimated depreciation. For depreciation grounded in your actual fixed-asset register, the Financial Health page uses the real asset register instead of the 1.5% proxy.",
    "route": "/analytics",
    "keywords": "gross margin ebitda net income calculation estimate depreciation interest ebit Analytics"
  },
  {
    "category": "Books & accounting",
    "q": "Why is my approval chain not actually stopping payments?",
    "a": "Only the server-backed 'Live Approval Engine' (top card in /automation → Approval Chains) actually gates document posting in Books - rules you create there with an entity type and minimum amount are enforced server-side. The 'Approval-Chain Builder' card below it is labelled 'design / preview': it just counts how many current outflows exceed the threshold and lets you sketch approver steps; it does not block anything. Use the Live Approval Engine for enforcement and the builder only for planning.",
    "route": "/automation",
    "keywords": "approval not working chain preview design enforcement books Approval limits"
  },
  {
    "category": "Books & accounting",
    "q": "Does Headroom support OFX, QFX, QIF or MT940 bank-statement files?",
    "a": "Yes - the accounting reconciliation engine can parse OFX/QFX, QIF, ISO-20022 camt.053 XML, SWIFT MT940 and plain CSV bank exports. You reach this through Books → Reconcile (/books) or Banking → Reconciliation (/banking): pick the bank ledger, upload/paste the statement, and it normalises every line to date, signed amount, description and reference (debits negative). Re-importing the same file is safe because each line is fingerprinted with a content hash, so already-imported lines are skipped instead of double-booked.",
    "route": "/books",
    "keywords": "ofx qfx qif mt940 camt053 swift iso20022 statement formats reconcile Bank-statement formats"
  },
  {
    "category": "Books & accounting",
    "q": "How do I reconcile my bank statement against my books?",
    "a": "Use the Reconciliation tab on /banking. Pick an account (or All accounts), set an amount tolerance in rupees, and paste your statement lines - one per line as 'date, amount, narration', where Dr/Cr or a minus sign marks a debit. It greedily matches each statement line to a book transaction within tolerance and shows three buckets: Matched, 'On statement but not in books' (red) and 'In books but not on statement' (yellow). Matching is by amount only, so confirm each match before posting to your ledger.",
    "route": "/banking",
    "keywords": "bank reconciliation statement paste match tolerance dr cr unmatched book transaction Banking - reconciliation"
  },
  {
    "category": "Books & accounting",
    "q": "Does payroll post to my accounts automatically?",
    "a": "Yes - that's the main reason to use /hrms. Each payroll run posts one consolidated, balanced journal: Dr Salaries for gross, Cr PF Payable / TDS Payable / Staff Deductions (ESI + PT fold in here) and Cr Salaries Payable for net. Paying the run posts the bank payment (Dr Salaries Payable, Cr Bank). F&F posts its own journal. Both use idempotency keys so a double-click won't double-post. You can attribute the cost by passing a cost centre, which tags the Salaries line for cost-centre P&L.",
    "route": "/books",
    "keywords": "payroll journal accounts books accrual payment cost centre ledger gl post Books integration"
  },
  {
    "category": "Books & accounting",
    "q": "How do I stop my team editing already-filed periods?",
    "a": "Use the Financial Year & Books Lock setting in /settings (owner / super-admin only). Confirm your April financial-year start and tap 'Lock books up to' your last filed date - this prevents anyone editing closed, filed periods. The recommended habit: after you e-file GST/returns each quarter, come back and push the Books Lock date forward. This pairs well with the /security Access Review Log and /automation Approval Engine for a layered control set.",
    "route": "/settings",
    "keywords": "books lock period close financial year editing filed protect ledger integrity Books lock / data integrity"
  },
  {
    "category": "Books & accounting",
    "q": "How do I stop staff editing already-filed months, and where's the audit log?",
    "a": "Organization → Controls & Audit. The 'Financial Year & Books Lock' card lets you set your FY start month (India defaults to April) and a lock date - entries on or before it are treated as filed and closed, so closed months can't be edited; click 'Unlock' to reverse. The same tab has the Audit Log & Login History (recent sign-ins and security-relevant changes for access review) plus org activity and data-retention controls.",
    "route": "/organization#audit",
    "keywords": "books lock financial year close period audit log login history retention closed months Books lock & audit"
  },
  {
    "category": "Books & accounting",
    "q": "What is the 'Bulk upload' button I see on some screens, and how is it different from Upload CSV?",
    "a": "The reusable 'Bulk upload' button (on screens like ledgers) opens a modal tailored to that record type. It shows the exact columns (required ones marked with *), a 'Download template' button pre-seeded with an example row, and lets you either choose a CSV file or paste rows. It previews the first 8 parsed rows, then POSTs them to that module's bulk endpoint and reports created/failed counts with row-level errors. Unlike the generic transaction Upload CSV, it maps headers to the specific API fields for that entity (matching by column label, case-insensitive, falling back to position).",
    "keywords": "bulk upload button modal ledgers template paste rows endpoint Bulk upload modal"
  },
  {
    "category": "Books & accounting",
    "q": "Client disputes an outstanding amount - how do I send them a clean ledger statement?",
    "a": "In the client's Collections module (/collections) the Statement tab copies a ready-to-send account ledger for one customer that you can paste into WhatsApp or email when an amount is disputed. Collections also gives the aging buckets and Remind flows (WhatsApp/Email/SMS with Friendly/Firm/Final tones) if you're helping the client chase their own debtors.",
    "route": "/collections",
    "keywords": "statement, ledger, dispute, account statement, soa, send ledger, collections CA · Cross-feature"
  },
  {
    "category": "Books & accounting",
    "q": "How do I reconcile a client's filed GST turnover against their books for GSTR-9C?",
    "a": "Use \"GST vs Books Recon\" in the client's Compliance module (/compliance) - it compares filed turnover against the transactions in their books, which is exactly what you need for GSTR-9/9C prep. Aim for under 1% difference. Their full financials for the annual return come from the Books Reports tab (/books) and the Statements module (/statements).",
    "route": "/compliance",
    "keywords": "gstr-9, gstr-9c, annual return, reconcile turnover, gst vs books, recon CA · GSTR-9 / annual"
  },
  {
    "category": "Books & accounting",
    "q": "A client's bank wants a proper Schedule III balance sheet and ratio pack - where from?",
    "a": "The Statements module (/statements) turns the client's transactions, payroll, loans and assets into a full finished set - Schedule III balance sheet, AS-3/Ind AS cash flow, ratio pack, notes to accounts and a 3-statement forecast - all live from their data and exportable to PDF or Excel. That's the bank/investor-ready pack; the day-to-day double-entry ledger is in Books (/books).",
    "route": "/statements",
    "keywords": "schedule iii, balance sheet, ratio pack, bank report, statements, ind as, notes to accounts CA · Statements"
  },
  {
    "category": "Books & accounting",
    "q": "What's the difference between a draft and an active raise?",
    "a": "A new raise starts as draft - it's saved but not accepting investors yet, and shows a Publish button. Clicking Publish flips it to active (\"now accepting investors\"), at which point the + Investor button appears so you can record commitments. Other statuses are closed and funded. Investors browsing the portal only see raises exposed via the public endpoint, so publishing is what makes a raise live for commitments.",
    "route": "/capital",
    "keywords": "draft vs active, publish, status, closed, funded, raise lifecycle Capital raise"
  },
  {
    "category": "Books & accounting",
    "q": "Can Headroom match bank receipts to my open invoices automatically?",
    "a": "Yes - the Cash Application tab on /receivables auto-matches revenue inflows (positive transactions categorised as revenue) to open invoices. It flags Exact matches (amount within Rs.1 AND the customer name or invoice number appears in the bank narration) and Likely matches (amount within 2%, or a name hit alone). Tap Apply to link the receipt and mark the invoice paid (synced to the ledger for backend invoices). You can Un-apply if it was wrong. Receipts with no match are listed separately as unmatched.",
    "route": "/receivables",
    "keywords": "cash application auto match bank receipt reconcile invoice payment Cash application"
  },
  {
    "category": "Books & accounting",
    "q": "Where do I add a new ledger account (e.g. a new customer or expense head)?",
    "a": "Go to the 'Chart of Accounts' tab in Books and click 'New ledger'. Enter the ledger name, pick the account group (which sets its nature - Asset/Liability/Income/Expense/Equity), and optionally set an opening balance with a Dr/Cr toggle. Tick 'Bank / cash' for bank and cash accounts, or 'Party (customer/vendor)' so the ledger shows up in the sales / receipt / payment pickers. Only owner/finance/accountant roles see the button.",
    "route": "/books",
    "keywords": "create ledger account head customer vendor party bank opening balance Chart of Accounts"
  },
  {
    "category": "Books & accounting",
    "q": "I'm a CA viewing my client's books but I can't change anything - is that broken?",
    "a": "No, that's intentional. When you enter a client's data from the Advisor portal you're in client view, which is read-only for advisors - you can inspect everything but writes are blocked with 'You're viewing a client's data - exit client view to make changes.' Use 'Exit client view' (the link in the sidebar under the client's name) to return to your own workspace where you can edit freely. Only a platform super_admin can edit inside a tenant's view.",
    "route": "/advisor",
    "keywords": "CA accountant client view read only inspect tenant exit advisor portal Client view (CA)"
  },
  {
    "category": "Books & accounting",
    "q": "How do I send a customer a statement of account showing everything they owe?",
    "a": "Use the Statement tab on /collections (there is also a Statement Generator tab on /receivables). Pick the customer from the dropdown. It builds a running-balance ledger (each invoice = a debit, each payment = a credit), sorted by date, with a closing Outstanding balance, plus headline tiles for Total Invoiced, Received, Outstanding and Overdue. Tap Copy statement to copy a plain-text STATEMENT OF ACCOUNT (with your firm name and 'as on' date) you can paste into WhatsApp or email. Note it is a simplified statement - for a fully GST-compliant one you'd add actual payment dates, TDS adjustments and credit/debit notes.",
    "route": "/collections",
    "keywords": "customer statement of account ledger running balance copy share Customer statements"
  },
  {
    "category": "Books & accounting",
    "q": "i think i don't owe this much - how do we sort it out?",
    "a": "Ask the business for your full account statement - they can generate a per-customer ledger showing every invoice, every payment and the running balance, and send it over. Compare it line by line against your records; if a payment you made is missing, send them the UTR so they can record it. The statement is the neutral document that resolves most disputes.",
    "keywords": "dispute disagree wrong balance owe too much reconcile statement Customer/Vendor · Disagree on amount"
  },
  {
    "category": "Books & accounting",
    "q": "can i get a full statement of everything i owe / have paid?",
    "a": "Yes, ask the business for your account statement. In Headroom they can pull a ready-to-send ledger for a single customer that lists every invoice raised, payments received and the running balance, and share it on WhatsApp or email. This is the cleanest way to settle any disagreement about what's outstanding.",
    "keywords": "statement ledger account summary owe balance history Customer/Vendor · Statement"
  },
  {
    "category": "Books & accounting",
    "q": "How do I bulk-upload data (customers, items, ledgers)?",
    "a": "Most list screens have a 'Bulk upload' button. Click it, download the CSV template, fill it in (one row per record), and upload - you get a preview and a per-row result showing what was created and any rows that failed with the reason. Bulk upload is available for the chart of accounts, inventory items, cost centres, price lists, Bill-of-Entry/ITC-04, employees and opening invoices.",
    "keywords": "bulk csv template upload import many rows Data"
  },
  {
    "category": "Books & accounting",
    "q": "How do I import a bank statement?",
    "a": "Two ways: on Data & Import use 'Upload CSV' for a bank/accounting CSV (we auto-detect date/amount/description). Inside Books → Reconcile you can also import a real bank file in OFX/QFX, QIF, CAMT.053 or MT940 format and reconcile it against your ledger.",
    "route": "/data",
    "keywords": "bank statement import ofx qif camt mt940 reconcile Data"
  },
  {
    "category": "Books & accounting",
    "q": "Do these payment and banking tools work offline, or do they need the backend?",
    "a": "Most run on-device. The UPI QR/intent and the share text use the open NPCI upi://pay spec with no gateway needed; trackers (refunds, mandates, settlement batches, cheques, virtual accounts, TDS) save to your synced store and only hold what you type. The exceptions are backend-backed: 'Create live payment link' and 'Mark paid' on the Payment Links tab call /api/books/payments, and that webhook-driven receipt posting needs your books set up and Razorpay keys configured. If books aren't set up the manual UPI link still works.",
    "route": "/payments",
    "keywords": "offline on-device backend api books required razorpay synced store npci Data / where things come from"
  },
  {
    "category": "Books & accounting",
    "q": "Which documents can generate an e-way bill?",
    "a": "E-way bills are generated from SALES vouchers only. The system assembles Part-A from the sale (doc no/date, from/to GSTIN, state codes, pincodes, the HSN item list with taxable + tax, transporter and distance) and Part-B from a vehicle number or transport document number. If you provide a vehicle/transport doc the EWB is 'complete' (Part AB); if not it's a Part-A-only bill you fill the vehicle on later via 'Update vehicle'. An unregistered buyer is sent as 'URP'. Trying to generate from a non-sales voucher returns a clear error.",
    "route": "/books",
    "keywords": "eway sales voucher part a part b vehicle transporter urp generate E-way bill"
  },
  {
    "category": "Books & accounting",
    "q": "how do I reconcile bank statement against books",
    "a": "You have two reconcile engines. The cleanest for close is /books Reconcile tab: pick the bank ledger, paste statement rows as date,amount,description (minus sign for money out), hit Import then Auto-match (it matches on amount and date within a few days), and for each leftover line pick the counter ledger and Confirm to post it in one tap. /banking Reconciliation does a lighter three-bucket view (Matched, on statement not in books, in books not on statement) if you just want to spot gaps.",
    "route": "/books",
    "keywords": "reconcile bank statement match auto-match unmatched Finance manager · Bank reconciliation"
  },
  {
    "category": "Books & accounting",
    "q": "how do I match my purchases against GSTR-2B so I don't lose input credit",
    "a": "In /gst open the 2B Match tab, upload the GSTR-2B JSON (from gst.gov.in > Returns > GSTR-2B) plus your purchase register (Supplier GSTIN, Invoice No, Taxable Value, tax columns), and tap Reconcile. It shows ITC at risk, mismatches and unclaimed credit - the 'ITC at risk / not in 2B' figure is real money you forfeit if you don't chase those suppliers before filing. Do it as a monthly ritual right after the 14th, and use Download report to send your CA.",
    "route": "/gst",
    "keywords": "2b reconciliation itc purchase register input tax credit at risk mismatch Finance manager · GST filing"
  },
  {
    "category": "Books & accounting",
    "q": "do my filed GST numbers actually match my books for GSTR-9C?",
    "a": "Use the 'GST vs Books Recon' tab in /compliance - it compares your filed turnover against your transactions for GSTR-9C prep; 'good' is under 1% difference. Separately, cross-check the /gst GSTR-1 output tax against the Calculator/3B output tax for the same month - if they disagree, your invoices and books are out of sync before filing.",
    "route": "/compliance",
    "keywords": "gst books reconciliation gstr-9c turnover mismatch annual return Finance manager · GST vs books"
  },
  {
    "category": "Books & accounting",
    "q": "how do I get a P&L and balance sheet to hand my CA at year end?",
    "a": "Open /statements, set the period to Financial Year (Apr-Mar), and the Income Statement, Balance Sheet, Cash Flow plus Schedule III, Notes to Accounts and AS-3 Cash Flow tabs give you a near-complete statutory pack - click PDF/Excel to download. Add every fixed asset in the Fixed Assets tab first or depreciation shows zero and profit is overstated. You can also pull the FY P&L and Balance Sheet straight from the Books Reports tab where GST is already split into CGST/SGST/IGST.",
    "route": "/statements",
    "keywords": "profit loss balance sheet ca filing schedule iii year end statutory pack Finance manager · MIS / board pack"
  },
  {
    "category": "Books & accounting",
    "q": "how do I run payroll so it posts to the books automatically?",
    "a": "Use /hrms (the full payroll desk): set attendance and approve leave for the month first, then on the Payroll tab pick the Run month and click Run payroll - it prorates pay, deducts PF/ESI/PT and posts ONE consolidated journal (Dr Salaries, Cr PF Payable / TDS Payable / Salaries Payable) into Books, marked POSTED. A month can only be run once, so finalise attendance and leave before running. /payroll is the lighter version focused on TDS and statutory calculators.",
    "route": "/hrms",
    "keywords": "run payroll salary journal pf esi pt tds posted books proration Finance manager · Payroll"
  },
  {
    "category": "Books & accounting",
    "q": "a customer is disputing the amount they owe - can I send them a full ledger?",
    "a": "Yes. In /collections open the Statement tab - it copies a ready-to-send account ledger for a single customer showing every invoice and what's outstanding, so you can settle the dispute. For a logged commitment use the Promise-to-Pay tab to record the date the customer says they'll pay, and Defaulters/Risk Score to decide who needs a final notice.",
    "route": "/collections",
    "keywords": "statement of account customer ledger dispute soa promise to pay Finance manager · Receivables"
  },
  {
    "category": "Books & accounting",
    "q": "What is the financial health score and how is it calculated?",
    "a": "The /health page shows one composite 0-100 score (with a letter grade) built live from seven weighted components: liquidity, profitability, collections, leverage, growth, customer concentration and compliance. The score ring, a radar profile, and a 'What's dragging the score' panel (your three weakest components) sit at the top. Each component links to the module that drives it so you can act. It recomputes automatically as your data changes.",
    "route": "/health",
    "keywords": "financial health score grade composite liquidity profitability components Financial Health"
  },
  {
    "category": "Books & accounting",
    "q": "The party doesn't appear in the Form 16A dropdown - why?",
    "a": "The Form 16A party picker only lists ledgers flagged as a party. If your vendor isn't there, create them as a party ledger in Books > Chart of Accounts first. Also, the certificate only shows TDS transactions for the chosen quarter; if you deducted in a different quarter the table will read 'No TDS transactions for that quarter'. The deductee's PAN and name on the certificate come from that party ledger, so fill in the vendor's PAN.",
    "route": "/books",
    "keywords": "party ledger, chart of accounts, missing vendor, PAN Form 16A"
  },
  {
    "category": "Books & accounting",
    "q": "How does Books split GST into CGST/SGST vs IGST?",
    "a": "When you post a sale, tick (or leave unticked) the 'Inter-state' box. Intra-state supplies split the tax in half into CGST and SGST (each rate/2); inter-state supplies put the whole tax into IGST. The split is computed live in the entry preview and the authoritative tax breakdown (rate, taxable value, tax amount, HSN/SAC, place of supply) is stored as side-records at posting time for GST filing - see the 'GST & Tax' tab for the filing view.",
    "route": "/books",
    "keywords": "GST CGST SGST IGST inter-state intra-state split tax rate HSN GST"
  },
  {
    "category": "Books & accounting",
    "q": "How accurate is my GST - can I trust the numbers?",
    "a": "Your Books overview shows a live 'Books & Tax Health' card: it confirms the trial balance is balanced (debits = credits), the balance sheet tallies, there are no posting errors (duplicate vouchers / mis-postings), and your GST payable for the month - all recomputed from your actual postings, the same double-entry checks a CA runs at audit. GSTR-1/2B/3B are generated from the same ledger, so what you file matches your books.",
    "route": "/books",
    "keywords": "gst accuracy trust reconcile 2b 3b correct audit GST & Tax"
  },
  {
    "category": "Books & accounting",
    "q": "How do I reconcile my purchases against GSTR-2B to find ITC at risk?",
    "a": "On the Books GST tab use the 'GSTR-2B ITC match (invoice-level)' card. Paste your portal 2B invoices as CSV (gstin, invoiceNo, invoiceDate, taxable, tax) - a header row is auto-detected and skipped - then click 'Match against books'. Headroom matches each portal invoice to your booked inward (ITC) invoices for the period by supplier GSTIN plus a fuzzy invoice-number and amount-within-₹1 tolerance, and buckets the results into Matched, Probable, Missing in books, and Missing in portal. The red 'ITC at risk' figure is the tax you've already claimed on invoices that aren't in your supplier's 2B.",
    "route": "/books",
    "keywords": "gstr2b 2b reconcile itc match csv paste at risk supplier GSTR-2B / ITC matching"
  },
  {
    "category": "Books & accounting",
    "q": "What's the difference between 'Probable' and 'Matched' in the 2B reconciliation?",
    "a": "Matched means a strong reconcile - same supplier GSTIN, the same cleaned invoice number, and amounts equal (or within a ₹1 rounding tolerance with a fuzzy invoice-no, dates within 10 days). Probable means the supplier GSTIN and amounts agree (within ₹1) but the invoice number is keyed differently and didn't pass the fuzzy match - it is very likely the same invoice entered with a different reference, so review and confirm before claiming. 'Missing in books' are 2B invoices you haven't booked; 'Missing in portal' are invoices you booked but the supplier hasn't filed (your ITC at risk).",
    "route": "/books",
    "keywords": "probable matched suggested fuzzy invoice number tolerance reconciliation buckets GSTR-2B / ITC matching"
  },
  {
    "category": "Books & accounting",
    "q": "Can I prepare GSTR-9C reconciliation in Headroom?",
    "a": "Yes - the same 'GSTR-9 / 9C' sub-tab in Books → Compliance has a 'GSTR-9C reconciliation statement' card. It reconciles three things: Pt II turnover, Pt III tax paid, and Pt IV ITC, each as 'per returns' (filled from your books / GSTR-9) versus 'audited' (which you supply and which defaults to zero). The unreconciled rows are highlighted in amber so you can spot the gaps before your auditor signs off. Hit 'Recompute' and 'Download GSTR-9C JSON' when ready. This is a working draft, not a filed return.",
    "route": "/books",
    "keywords": "gstr9c reconciliation audited turnover unreconciled itc tax paid auditor GSTR-9C"
  },
  {
    "category": "Books & accounting",
    "q": "How does Headroom actually deduct TDS when I record a vendor payment?",
    "a": "On a purchase/payment the vendor would normally be credited the full gross; to withhold TDS the system reduces the vendor credit by the TDS amount and credits a TDS Payable liability instead, so the voucher still balances and the vendor is settled net. The withheld amount sits in TDS Payable until you remit it to the government. The deduction is rounded to the nearest rupee (CBDT convention), and the section + rate are stored on the tax entry so the 26Q filing and Form 16A can read them.",
    "keywords": "TDS payable, net of TDS, voucher, withholding, vendor credit, journal How TDS is booked"
  },
  {
    "category": "Books & accounting",
    "q": "after I run payroll does it post to the accounts or do I tell the accountant?",
    "a": "It posts automatically. The HRMS run posts one consolidated balanced journal into your Books - Dr Salaries, Cr PF Payable / TDS Payable / Staff Deductions / Salaries Payable - and you can confirm the run shows POSTED. The Payroll Journal tab on /payroll shows the same entry. Check Books after running and pay the statutory dues out of those payable accounts before their due dates; nothing is re-keyed.",
    "route": "/books",
    "keywords": "journal, accounting entry, posts to books, ledger, salaries payable, integration HR/Payroll admin · Books impact"
  },
  {
    "category": "Books & accounting",
    "q": "How do I see the income tax my business owes from my books?",
    "a": "In Books > Tax Filing > 'Income Tax / ITR' sub-tab, use 'ITR summary - head-wise computation': enter the Financial year, any Other income and Chapter VI-A Deductions, then click 'Build ITR summary'. It pulls your net profit from the books P&L as 'Profits & gains of business or profession', adds the heads you supply, subtracts deductions, runs the slab/surcharge/cess engine for the matching Assessment Year, and shows gross total income, deductions, taxable income and tax payable. This is a computation to verify - not a filing.",
    "route": "/books",
    "keywords": "ITR summary, head-wise, PGBP, books P&L, taxable income, computation Income tax / ITR"
  },
  {
    "category": "Books & accounting",
    "q": "How can I verify my books are healthy / run integrity checks?",
    "a": "The Books Overview shows a Health card that calls the integrity checks endpoint (/api/books/integrity/checks). It runs duplicate-voucher detection (vouchers with the same party, type, date and amount - likely double-entered bills), a leaf-only check (warns if anything posts to a roll-up group that has sub-groups instead of a leaf account), and surfaces any failed balance assertions. 'Clean' means no duplicates, no non-leaf postings and no failed assertions.",
    "route": "/books",
    "keywords": "integrity checks health duplicate voucher leaf account assertion clean audit Integrity"
  },
  {
    "category": "Books & accounting",
    "q": "Can I assert that a ledger matches my bank statement balance?",
    "a": "Yes - the integrity layer supports a beancount-style balance assertion: you give a ledger, an as-of date and a confirmed figure (e.g. your bank statement closing balance), and it records whether the ledger's actual signed balance matches within an inferred tolerance (based on the decimal precision you wrote). Pass or fail, every assertion is stored, and failed ones surface in the integrity-checks dashboard so you can investigate the signed difference.",
    "keywords": "balance assertion confirm bank statement tolerance beancount signed difference verify Integrity"
  },
  {
    "category": "Books & accounting",
    "q": "Can the founder send me a clean MIS pack each month without me chasing?",
    "a": "Yes - /lenders has an MIS Pack tab: pick the month and cadence and click 'Copy MIS pack' to generate a ready P&L, ratios, receivables and cash summary built from live synced books, sent to the relationship manager. Separately, /investor's Investor Update composer and /cfo-brief's 'Investor Update (board)' mode auto-generate a monthly update email with metrics pre-filled.",
    "route": "/lenders",
    "keywords": "MIS, monthly report, RM pack, lender update, P&L ratios, board update Investor · Lender MIS"
  },
  {
    "category": "Books & accounting",
    "q": "Why don't the MRR/burn numbers match what I'd expect - can I trust them?",
    "a": "The metric tabs (KPI Tearsheet, MRR Movement, Burn Efficiency, Runway Timing) are only as good as the founder's transaction tagging - income must be categorised as 'revenue' and costs as 'expense'/'payroll', or the numbers skew. If a company hasn't connected its bank via AA, you're looking at illustrative sample data, not bank-verified figures. Confirm the bank feed is connected and categorised before treating the metrics as diligence-grade.",
    "route": "/investor",
    "keywords": "wrong numbers, MRR, categorisation, tagging, trust metrics, sample data, accuracy Investor · Metric integrity"
  },
  {
    "category": "Books & accounting",
    "q": "How do I give an investor access to just my fundraise and valuation, not my whole books?",
    "a": "Assign the Investor / Banker role. Its scope is limited to the investor portfolio, the capital-raises marketplace, and valuation/lender views - it does not expose your transactions, payroll or banking. A user with this role even lands on the investor view (/investor) at sign-in instead of the dashboard. Invite or switch them via Organization → Members.",
    "route": "/organization#access",
    "keywords": "investor banker role fundraise valuation lenders portfolio limited access cap raise Investor role"
  },
  {
    "category": "Books & accounting",
    "q": "how do I stop the team editing months we've already filed?",
    "a": "On /organization → Controls & Audit, use Financial Year & Books Lock. Confirm your FY start (India is April) and set 'Lock books up to & including' your last filed date, then click Lock books - entries dated on or before that date are treated as filed and closed, so nobody accidentally edits them. Push the lock date forward each time you e-file GST/returns. Use Unlock if you ever need to reopen a period.",
    "route": "/organization",
    "keywords": "books lock close period filed months prevent edits financial year lock GST IT / Admin · Books lock"
  },
  {
    "category": "Books & accounting",
    "q": "my CA wants to link our books to their portal - what do I give them and can I revoke it?",
    "a": "Share your Tenant ID, found on /organization → Company in the 'Your Tenant ID' card (click Copy). Your CA pastes it into the My Clients panel of their Advisor Portal to add you to their portfolio and get live cash visibility. You can revoke that linkage at any time by contacting support - it's a separate grant from the team-member roles you manage on the Members tab.",
    "route": "/organization",
    "keywords": "tenant id advisor portal CA access link books revoke share read access IT / Admin · Tenant & advisor access"
  },
  {
    "category": "Books & accounting",
    "q": "Can Headroom build my ITR JSON from the books?",
    "a": "Yes - Books → Compliance tab → 'ITR JSON' sub-tab. Pick the form (ITR-3 for regular books, ITR-4 SUGAM for 44AD/44ADA presumptive), assessment year, regime (new is default), and optional other income / capital gains / Chapter VI-A deductions, then 'Build ITR JSON'. It assembles a portal-ready draft from your P&L (business income via the income-tax engine) plus TDS/TCS credits and advance-tax challans, shows a schema-valid / missing-fields badge, and lets you download the JSON to upload to the e-filing utility. It is never filed automatically.",
    "route": "/books",
    "keywords": "itr json itr-3 itr-4 sugam 44ad 44ada regime assessment year download e-filing ITR JSON"
  },
  {
    "category": "Books & accounting",
    "q": "How do leave types, allocations and approvals work?",
    "a": "On /hrms, the Leave tab: first create a Leave type (name, annual days, and tick LWP if it's unpaid). Then Allocate leave to an employee, which posts a +entry to the leave ledger. Employees apply for leave (half-day deducts 0.5); a pending request can be Approved - which posts a −ledger entry consuming the balance - or Rejected (no ledger impact). The balance for any employee is simply the sum of their ledger entries, shown under Leave balances. LWP (unpaid) leave types are what drive LOP in payroll.",
    "route": "/hrms",
    "keywords": "leave type allocation balance ledger approve reject lwp half day apply Leave"
  },
  {
    "category": "Books & accounting",
    "q": "Can I see the profit margin on an invoice?",
    "a": "The 'Invoice Margin' tab on /invoices estimates the gross margin on an invoice when you supply the cost behind the line items, so you can spot when you're billing at thin or negative margins. It's a quick analysis layer over the invoice - the authoritative cost-of-goods and margin reporting comes from the Books ledger and inventory in /books.",
    "route": "/invoices",
    "keywords": "margin profit gross cost markup analysis per invoice Margin"
  },
  {
    "category": "Books & accounting",
    "q": "I received payment - how do I mark an invoice paid so it leaves the overdue list?",
    "a": "On /receivables, hit the green tick (Mark as paid) on the invoice row, or the Paid button on its kanban card. The invoice moves to the Paid section and drops out of the aging buckets and collections list. If the invoice originated from the backend ledger (source backend), Headroom also syncs status=paid to /api/invoices so your Books stay in sync; manual/CSV-imported invoices stay local. You can also let Cash Application auto-match a bank receipt to the invoice, which marks it paid for you.",
    "route": "/receivables",
    "keywords": "mark paid received payment settle invoice ledger sync Marking paid"
  },
  {
    "category": "Books & accounting",
    "q": "Can I add a convenience fee and pass the card charge on to the customer?",
    "a": "The MDR tab has a 'Pass the fee on to the customer as a convenience charge' toggle that recomputes the total so the customer absorbs the MDR + GST. Note the in-app caveat: RBI prohibits surcharging on debit cards, and convenience fees on credit cards are allowed only where clearly disclosed. The built-in rates are indicative market figures, not your contracted MDR - confirm exact slabs with your acquirer.",
    "route": "/payments",
    "keywords": "convenience fee surcharge pass on customer rbi debit prohibited disclosed MDR / fees"
  },
  {
    "category": "Books & accounting",
    "q": "How do I close a financial year / lock a period?",
    "a": "Books → Closing lets you lock each accounting period (so nobody back-dates into a filed month), run the year-end Period-Closing-Voucher (rolls P&L into reserves), set opening balances, and post reversing journals. The Books health card warns you if anything's out of balance before you close.",
    "route": "/books",
    "keywords": "period close year end lock closing opening balance reversing Money"
  },
  {
    "category": "Books & accounting",
    "q": "Can I invoice an overseas customer in foreign currency?",
    "a": "The 'Multi-Currency' tab on /invoices lets you record an export invoice in a foreign currency with the rate at invoice date and at realisation, so you can track FX gain/loss when the money lands. For full export tooling - LUT zero-rated invoices, FIRC/eBRC realisation tracking, customs and DTAA - use the dedicated Exports/cross-border module. Note multi-currency posting into the ledger is limited; treat the Invoices tab as a working tool for FX-denominated billing.",
    "route": "/invoices",
    "keywords": "multi currency foreign export FX realisation LUT USD EUR overseas Multi-currency"
  },
  {
    "category": "Books & accounting",
    "q": "How do I handle foreign-currency invoices and exchange rates?",
    "a": "Use the 'Multi-Currency' tab. The ledger always stores base currency (INR); a foreign voucher carries its original currency and fx rate. Maintain a dated exchange-rate master (set 'rate = ₹ per 1 unit' for a currency on a date) - the system uses the latest rate on or before each transaction date. There's also a quick converter, an open foreign-currency position view per party, and 'Revalue all' for period-end mark-to-market.",
    "route": "/books",
    "keywords": "multi-currency forex foreign currency exchange rate USD EUR base INR converter Multi-Currency"
  },
  {
    "category": "Books & accounting",
    "q": "How do I clean up messy amounts like '₹2,50,000', '1.5 lakh' or '(12,000)' from a column?",
    "a": "Use the 'Number Cleanup' tab on /data. Paste a column of amounts and it converts each to a clean signed number - handling ₹/$ symbols, thousands separators, brackets for negatives, trailing CR/DR, and lakh/crore/k suffixes (e.g. '3.2 cr' → 32,000,000, '(12,000)' → -12000). It shows parsed vs unparseable counts and a running total, and exports a two-column original,cleaned CSV. Handy before pasting figures into the CSV Mapper.",
    "route": "/data",
    "keywords": "number currency cleanup lakh crore brackets cr dr rupee parse Number cleanup"
  },
  {
    "category": "Books & accounting",
    "q": "What actually happens to a sale or collection I record offline - does it just disappear?",
    "a": "No. Every offline capture lands in the Offline Queue (Field & Offline > Offline Queue) marked 'Pending', with the timestamp it was captured. When the network returns the queue auto-flushes - or you can tap 'Sync now'. A collection posts to your cash book and settles the customer's oldest open invoice so their outstanding actually drops; a sale or day-sheet posts as revenue. Each entry then shows 'Synced to ledger' with a reference. Anything that fails to post stays Pending with a Retry button - it's never silently marked done.",
    "route": "/field",
    "keywords": "offline queue sync pending ledger collection sale retry Offline / field"
  },
  {
    "category": "Books & accounting",
    "q": "I'm a sales/ops rep - how do I reconcile a van route or hand over cash at end of day?",
    "a": "Field & Offline (/field) has route tools for exactly this. Van Day-Sheet reconciles opening stock, sales, returns and cash collected, showing closing stock, expected cash and any variance (excess/short) before you settle it to the queue. Cash Handover, Deposit Recon, Route-Wise Sales and Daily Target tabs help close the day, and Day Summary rolls up today's field sales, cash/UPI collected, visits logged and how many entries still await sync - all drawn from the offline queue.",
    "route": "/field",
    "keywords": "van day sheet route cash handover deposit reconcile variance sales rep summary Offline / field"
  },
  {
    "category": "Books & accounting",
    "q": "if i confirm a customer order, does it touch the accounts automatically?",
    "a": "Yes. On the Orders tab of /operations, moving an order to Confirmed auto-creates a revenue transaction (you'll see a toast 'Order confirmed - revenue transaction created'), then Dispatch and Delivered move it along. On the buying side, marking a PO Received on the Procurement tab logs the expense and adds the quantity back to inventory. So orders and POs flow into your money automatically - no separate entry.",
    "route": "/operations",
    "keywords": "confirm order, revenue, books, accounting link, order to cash, expense, auto entry Operations / Procurement · Orders to revenue"
  },
  {
    "category": "Books & accounting",
    "q": "where do i record every stock in and out movement?",
    "a": "The 'Stock Ledger' tab on /operations. Record each receipt (in) and issue (out) with date, SKU, quantity, rate and a note, and it builds a valued ledger. Choose FIFO or Weighted Average at the top: FIFO consumes the oldest receipts first; Weighted Average values issues at the running average cost. Rates apply to receipts; issues are auto-valued.",
    "route": "/operations",
    "keywords": "stock ledger, inventory movement, in out, receipt issue, stock card, valued ledger Operations / Procurement · Stock ledger"
  },
  {
    "category": "Books & accounting",
    "q": "i'm doing a physical count - how do i reconcile it against the system?",
    "a": "Use the 'Stock Take' tab on /operations. Scan or type a code (each scan adds 1) and known SKUs pull their system quantity automatically. It reconciles counted vs system stock: positive variance means more physical stock than the system (under-recorded), negative means shrinkage/loss. Export the variance sheet to adjust your inventory. For ongoing counts without shutting down, the 'Cycle Count' tab plans rolling counts by ABC class.",
    "route": "/operations",
    "keywords": "stock take, physical count, count sheet, variance, shrinkage, reconcile, cycle count Operations / Procurement · Stock take"
  },
  {
    "category": "Books & accounting",
    "q": "what's my closing stock worth for the audit - FIFO or weighted average?",
    "a": "Use the 'Stock Valuation' tab on /operations - it values closing stock by your chosen costing method for year-end audit and balance-sheet COGS. The 'Stock Ledger' tab records every in/out move valued by FIFO (oldest receipts consumed first) or Weighted Average (issues valued at running average cost). Pick the method at the top; receipts carry a rate and issues are auto-valued.",
    "route": "/operations",
    "keywords": "stock valuation, closing stock, FIFO, weighted average, costing method, COGS, audit Operations / Procurement · Stock valuation"
  },
  {
    "category": "Books & accounting",
    "q": "how is the business actually doing?",
    "a": "Two screens answer this. /health gives a single 0-100 score with an A+ to E grade (the way a bank would judge you), pulling live from cash, invoices, loans, growth and filings, plus a 'What's dragging the score' card. /analytics shows the real numbers - revenue and expense trends, profit margin, top customers/vendors and a full P&L. For the quick view, the Business Health Score ring on /dashboard breaks into Cash, Revenue, Debt and Compliance sub-scores.",
    "route": "/health",
    "keywords": "how am i doing, business performance, profit, healthy, financial health Owner · Business health"
  },
  {
    "category": "Books & accounting",
    "q": "I don't trust my numbers - how do I know my books are right?",
    "a": "Open /books and check the green 'Balanced' badge on the Overview and Reports tabs (green means debits equal credits). Do the Reconcile tab weekly - paste your bank statement, hit Auto-match, and it clears lines that match vouchers so you catch missing receipts or duplicate payments while fresh. Upstream, /transactions has a Reconcile/Bank Recon button and 'Potential Duplicates' cards. Clean categorisation here makes the Dashboard, P&L and forecasts trustworthy everywhere.",
    "route": "/books",
    "keywords": "books accurate, reconcile, trust numbers, balanced, double check Owner · Reconciliation worry"
  },
  {
    "category": "Books & accounting",
    "q": "the bank wants my P&L and balance sheet - where do I get them?",
    "a": "Open /statements - it builds a full P&L, Balance Sheet and Cash Flow live from your data, plus Schedule III, AS-3 Cash Flow, a Ratio Pack and 20 more, all exportable to PDF/Excel. Set the period to Financial Year (Apr-Mar) and add your fixed assets so depreciation flows through. Check the Ratio Pack before applying - those are the exact numbers lenders compute, so you spot a weak current ratio before the bank does. /books also exports FY P&L and Balance Sheet straight from its Reports tab.",
    "route": "/statements",
    "keywords": "p&l, balance sheet, financial statements, bank report, for lender, accounts Owner · Reports for the bank"
  },
  {
    "category": "Books & accounting",
    "q": "why is all my money tied up - I'm profitable but always short on cash?",
    "a": "Open /working-capital - it measures your Cash Conversion Cycle (days money sits in unpaid invoices + stock, minus supplier credit) and shows the exact rupee amount tied up. The 'Where the days go' panel lets you jump to the worst leg (DSO opens Receivables, DIO opens Operations, DPO opens Vendors). Chase the highest-day leg first, and the 'Funding the gap' table ranks the cheapest ways to bridge it while you fix the cycle.",
    "route": "/working-capital",
    "keywords": "cash tied up, profitable but no cash, working capital, dso, stock Owner · Working capital"
  },
  {
    "category": "Books & accounting",
    "q": "How do I record a partial payment against an invoice?",
    "a": "Use the 'Partial Payments' tab on /invoices to log part-payments (amount, mode, date) against an invoice and see the running balance still due. At the ledger level, Books reconciles a party's unapplied credit (advances, over-payments, credit notes) FIFO against their oldest open invoices via auto-apply, and never allocates more than a bill's outstanding or a source's available credit. The simple Mark-paid tick on the main table flips an invoice fully paid, so use the Partial Payments tab when you've only received some of it.",
    "route": "/invoices",
    "keywords": "partial payment part payment balance due installment received reconcile Partial payments"
  },
  {
    "category": "Books & accounting",
    "q": "When a customer pays my link, does it record the receipt in my books automatically?",
    "a": "Yes. If a live gateway (Razorpay) is wired and the webhook fires on a paid/captured event, the backend verifies the signature, dedupes the event and posts a RECEIPT into 'Undeposited Funds' against the party, then allocates it to the linked invoice. If you're settling manually, open the link in /payments, pick the bank/UPI ledger that received the money and click 'Mark paid' - that posts the receipt to that ledger and allocates it against the invoice too.",
    "route": "/payments",
    "keywords": "receipt voucher posted undeposited funds allocation invoice settled webhook Payment links"
  },
  {
    "category": "Books & accounting",
    "q": "How do I lock a month or close my financial year?",
    "a": "Use the 'Closing' tab. To lock a single month, set its period status to CLOSED - once a period is closed the posting engine refuses any voucher dated in it (you'll get a 'Period is CLOSED' error). For full year-end, run 'Close FY' (POST /api/books/period/close): it computes net profit from your P&L ledgers, posts one closing journal that zeroes every income/expense ledger into Reserves & Surplus, and locks all 12 periods of that year so it can never be re-posted.",
    "route": "/books",
    "keywords": "period close lock month year end closing financial year reserves journal CLOSED Period Close"
  },
  {
    "category": "Books & accounting",
    "q": "Can I re-close a financial year, or close one with no transactions?",
    "a": "No on both counts. Year-end close is idempotent: if a closing journal already exists for that FY, it refuses with 'already closed' and tells you the closing voucher number. And if the year has no P&L movement at all, it refuses with 'nothing to close' rather than posting an empty entry. The closing entry lands the net result in the Reserves & Surplus equity ledger, exactly as Schedule III expects.",
    "keywords": "re-close year end already closed nothing to close idempotent reserves surplus Period Close"
  },
  {
    "category": "Books & accounting",
    "q": "How do I reconcile a physical stock count with the system?",
    "a": "Use the Physical adjust sub-tab: pick the item, enter the Counted qty you physically found, an optional warehouse and a date, then Post adjustment. Headroom posts the difference between the system quantity and your count as a stock gain or loss - a surplus is received at current average cost, a shortage is issued - and books the value delta to the Stock Adjustment ledger so the GL stays in step with the stock subsidiary.",
    "route": "/books",
    "keywords": "physical adjust stock count reconcile stock take variance gain loss Physical count"
  },
  {
    "category": "Books & accounting",
    "q": "What is a proforma invoice and when should I use it?",
    "a": "Use the 'Proforma' tab on /invoices to generate a PI-YYYY-NNN proforma - useful for advance/booking documents where you quote an amount and an advance percentage (default 50%) before raising the actual tax invoice. Like quotations, a proforma is not a tax invoice and doesn't post to your books; convert it to a real invoice via 'New Invoice' once the order is confirmed.",
    "route": "/invoices",
    "keywords": "proforma PI advance percent booking not tax invoice Proforma"
  },
  {
    "category": "Books & accounting",
    "q": "I don't know accounting - can I still use the books part?",
    "a": "Yes - that's the point of /books. First time, click 'Set up my books' and it creates 28 standard account groups and default ledgers for you. To bill a customer you just pick them, type the total, choose the GST rate and post - it does the debit/credit and GST split behind the scenes. Reports (Trial Balance, P&L, Balance Sheet) generate themselves, and a green 'Balanced' badge tells you the books are trustworthy.",
    "route": "/books",
    "keywords": "no accounting, non finance, double entry, easy books, dont know accounting Prospect · No accounting knowledge"
  },
  {
    "category": "Books & accounting",
    "q": "why would I pick this over Zoho Books",
    "a": "Zoho Books is mostly invoicing and accounting. Headroom covers that (GST invoices in /invoices, full books in /books) but is wider on the things that actually kill Indian SMBs: a Monte-Carlo cash forecast (/forecast), an early-warning Alerts Centre (/alerts), automatic WhatsApp/UPI collections (/collections), GSTR-2B input-credit matching (/gst), payroll with PF/ESI/TDS (/payroll), and even loan eligibility scoring from your bank data (/credit). It's a finance command centre, not just a books tool.",
    "route": "/dashboard",
    "keywords": "zoho books, zoho difference, vs zoho, compare zoho Prospect · vs Zoho"
  },
  {
    "category": "Books & accounting",
    "q": "What format should I paste bank lines in for reconciliation?",
    "a": "One transaction per line as date,amount,description - for example '2026-06-01,11800.00,NEFT from Acme' for an inflow and '2026-06-02,-5000.00,Rent payment' for an outflow (negative amount = money out). The Reconcile tab shows a live count of valid lines parsed; positive amounts are suggested as RECEIPT, negatives as PAYMENT. If you have a downloaded statement file instead, use the file importer (OFX/QIF/CAMT.053/MT940/CSV) below the paste box.",
    "route": "/books",
    "keywords": "reconcile paste format date amount description inflow outflow negative Reconciliation"
  },
  {
    "category": "Books & accounting",
    "q": "Does Headroom auto-generate recurring invoices on a schedule, or do I have to do it manually?",
    "a": "In the /invoices Recurring tab, generation is manual today - you click 'Generate now' when a cycle is due and it advances the next-run date. The accounting engine in Books does have a real recurrence engine (daily/weekly/monthly/yearly, skip-N, weekend handling, end-by-date or after-N occurrences) that catches up every missed period and posts proper sales/purchase vouchers; set those recurring templates up in the Books module at /books rather than the lightweight Invoices tab if you want ledger-posted recurring entries.",
    "route": "/books",
    "keywords": "recurring auto generate cron scheduler catch up Books posting Recurring invoices"
  },
  {
    "category": "Books & accounting",
    "q": "Where do I get my P&L, balance sheet and cash flow statement?",
    "a": "All four are in Books → 'Reports' tab: Trial Balance, P&L, Balance Sheet and Cash Flow. P&L, Balance Sheet and Trial Balance are run per financial year; Cash Flow takes a From/To date range. Each report has an Export menu (CSV/PDF). P&L shows income, expense and net profit; the Balance Sheet rolls the current-period net profit into equity and shows its own balanced badge.",
    "route": "/books",
    "keywords": "profit and loss P&L balance sheet cash flow statement export financial year Reports"
  },
  {
    "category": "Books & accounting",
    "q": "Is the cash flow statement direct or indirect method?",
    "a": "The Books cash-flow report (Reports → Cash Flow, date-range) uses the true indirect method: it starts from net profit, adds back non-cash charges (depreciation, amortisation, provisions, write-offs detected by name), then explains the rest through the actual movement of every balance-sheet account, routed to Operating / Investing / Financing by the account's root group type. It reconciles to the real net change in cash & cash-equivalents and surfaces any unexplained residual rather than hiding it.",
    "route": "/books",
    "keywords": "cash flow indirect method operating investing financing depreciation reconcile Reports"
  },
  {
    "category": "Books & accounting",
    "q": "Do opening balances and prior-year figures carry forward automatically?",
    "a": "Yes. Permanent (balance-sheet) ledgers - assets, liabilities, equity - carry their balance across financial years: the opening for the year you select is the book opening plus the net movement of all prior years. P&L ledgers (income and expense) reset to zero every financial year, so they show only the current year's movement. You don't have to post anything for this carry-forward to appear in the Trial Balance and Balance Sheet.",
    "keywords": "opening balance carry forward prior year permanent ledger reset P&L financial year Reports"
  },
  {
    "category": "Books & accounting",
    "q": "Where do I find a day book, ledger statement or a party's account statement?",
    "a": "Beyond the four core statements on the Reports tab, Books exposes a Day Book (all vouchers in a date range, newest first, with their lines), a Ledger Statement (every entry hitting one ledger for an FY with a running balance), and a party statement (date-range ledger statement for one customer/vendor with opening, lines and closing). Receivables/Payables aging (AR/AP bucketed not-due / 0-30 / 31-60 / 61-90 / 90+) lives on the 'Receivables/Payables' tab.",
    "route": "/books",
    "keywords": "day book ledger statement party statement aging receivables payables running balance Reports"
  },
  {
    "category": "Books & accounting",
    "q": "Does Books produce Companies Act Schedule III financial statements?",
    "a": "Yes - there's a Schedule III layout (Companies Act, 2013) that presents the Balance Sheet as Equity & Liabilities (Shareholders' funds, Non-current liabilities, Current liabilities) and Assets (Non-current, Current), plus a Statement of Profit & Loss (Revenue from operations, Other income, Expenses), with a prior-year comparative column. It's driven by your seeded account-group hierarchy, so it follows the chart of accounts you set up rather than needing separate mapping.",
    "route": "/books",
    "keywords": "schedule III companies act statutory financial statements shareholders funds comparative prior year Reports"
  },
  {
    "category": "Books & accounting",
    "q": "Can I see total payroll cost, statutory liability and a payroll register?",
    "a": "Yes. On /payroll the Statutory Liability tab totals PF/ESI/PT/TDS payable, the Payroll Register tab gives the month's full line-by-line register (exportable), Headcount Cost and People ROI summarise the cost of headcount, and Variance compares months. The Payroll Journal tab shows the accounting entry the run produced. Most tables have an export menu so you can hand a CSV to your CA.",
    "route": "/payroll",
    "keywords": "payroll cost report register statutory liability variance headcount journal export Reports"
  },
  {
    "category": "Books & accounting",
    "q": "What actually happens when I click Run payroll?",
    "a": "On /hrms the Payroll tab builds one salary slip per active employee who has a structure assignment effective for that month, prorates pay by attendance (LOP days reduce payment days), appends PF/ESI/PT and the projected TDS, then posts ONE consolidated journal: Dr Salaries (gross) and Cr PF Payable, TDS Payable, Staff Deductions and Salaries Payable (net). You then pay the run separately, which posts the bank payment (Dr Salaries Payable, Cr Bank). A month can only be run once - re-running the same month returns 'Payroll already run for this month'.",
    "route": "/hrms",
    "keywords": "run payroll month journal accrual post books Run payroll"
  },
  {
    "category": "Books & accounting",
    "q": "I got a new enquiry - should I capture it in Leads here or in the CRM?",
    "a": "Either works and they share data. For quick field/sales follow-up use Leads & Follow-ups on /sales (phone, source, next follow-up date). For the fuller lifecycle with SLAs use /crm - capture the lead, log your first response, then 'Convert to deal'. When you click the green Win in /crm it automatically creates the customer ledger in Books, so sales and accounts stay in sync without re-typing.",
    "route": "/crm",
    "keywords": "new lead enquiry crm capture convert deal win customer ledger sla Sales · New customers"
  },
  {
    "category": "Books & accounting",
    "q": "How do I check the gateway actually paid me what it should after MDR?",
    "a": "Use the Settlement Recon tab on /payments. For each settlement batch enter the date, gross sales, MDR % and the payout actually received. It computes expected payout = gross − MDR fee − 18% GST on the fee, then flags the variance (a row turns red if it's off by more than ₹1). A negative variance means the gateway withheld more than expected - TDS, a rolling reserve or extra charges - which you then reconcile against the settlement report.",
    "route": "/payments",
    "keywords": "settlement payout reconciliation expected variance shortfall gross mdr gst withheld Settlement reconciliation"
  },
  {
    "category": "Books & accounting",
    "q": "How do I send a customer their statement of account?",
    "a": "Use the 'Statement of A/c' tab on /invoices to compile a customer's invoices, payments and running balance into a statement you can share - useful at month-end or when a customer asks 'what do we owe you?'. It reads the invoices you've raised, so keeping payments marked paid keeps the closing balance correct.",
    "route": "/invoices",
    "keywords": "statement of account customer ledger running balance outstanding share Statement of account"
  },
  {
    "category": "Books & accounting",
    "q": "Where can I see opening, inward, outward and closing stock value for a period?",
    "a": "The Stock summary sub-tab runs an item-wise report for a date range (defaults to this financial year start to today). Pick From and To and Run report to see opening qty/value, inward qty/value, outward qty/value and closing qty/value per item, with totals in the footer. It's the quickest way to value closing stock for a GST or year-end check.",
    "route": "/books",
    "keywords": "stock summary report opening closing inward outward value period financial year Stock summary"
  },
  {
    "category": "Books & accounting",
    "q": "How does closing stock value get into my accounts / balance sheet?",
    "a": "Stock movements keep a running value per item, and value-changing events post to the General Ledger automatically: physical adjustments, landed cost and reposts all post Stock-in-hand against Stock Adjustment, and work-order manufacture moves value through Work-in-Progress. There's also a closing-stock valuation journal (Dr Stock-in-hand / Cr Stock Adjustment) for the total current stock value. These require the Stock-in-hand and Stock Adjustment ledgers to be seeded - if they're missing you'll see a 'seed first' error.",
    "route": "/books",
    "keywords": "stock value GL balance sheet stock-in-hand journal closing stock ledger seed Stock value GL"
  },
  {
    "category": "Books & accounting",
    "q": "What's the difference between UTR Recon, Settlement Recon and the disputes tracker?",
    "a": "On /payments, Settlement Recon checks whether a whole gateway batch paid out correctly after MDR/GST. UTR Recon works at the individual transfer level - a UTR (for NEFT/RTGS) or RRN (IMPS/UPI) uniquely identifies one transfer end-to-end, so it surfaces 'missing' (expected but not yet credited - chase the gateway), 'unexpected' (a credit you didn't book) and 'mismatch' (amount differs, likely a fee or partial reversal). The Dispute Tracker is for chargebacks/representments. Use them together to catch any shortfall between what you billed and what landed.",
    "route": "/payments",
    "keywords": "utr rrn neft rtgs imps reconciliation missing unexpected mismatch chargeback dispute UTR reconciliation"
  },
  {
    "category": "Books & accounting",
    "q": "What if I'm pre-revenue or not yet profitable - does the DCF still work?",
    "a": "If you're not free-cash-flow positive, the page warns you and the DCF falls back to using 10% of revenue as a normalised FCF proxy, so the number is rough. For early-stage or pre-revenue companies use the Berkus or Scorecard method instead (jump via the section quick-nav at the top of /valuation). Berkus assigns up to ₹5,00,000 to each of five risk-reduction factors (cap ₹25,00,000); Scorecard rates you against a regional median pre-money on weighted factors.",
    "route": "/valuation",
    "keywords": "pre-revenue, Berkus, scorecard, not profitable, DCF proxy, early stage Valuation"
  },
  {
    "category": "Books & accounting",
    "q": "are margins improving or getting worse?",
    "a": "Analytics (/analytics) shows Avg Net Margin in the top strip and a margin trend over your chosen 3M/6M/12M window; the P&L Deep Dive tab breaks it down further. CFO Brief (/cfo-brief) has a dedicated Margin Snapshot and Profitability Trend tab that summarise the direction in plain words. Financial Health (/health) includes a Margin Stability score so you can see not just the level but how steady it is.",
    "route": "/analytics",
    "keywords": "margins, profitability trend, gross margin, getting worse, improving Viewer · Margins"
  },
  {
    "category": "Books & accounting",
    "q": "can I read the P&L and the financial reports?",
    "a": "You can read the management-level reporting on Analytics (/analytics) - the P&L Deep Dive tab gives a full income statement, plus Revenue, Expenses, Ratio Analysis and Benchmarks views. The formal statutory statements (Trial Balance, Balance Sheet, Cash Flow under /books or /statements) are not in your viewer sidebar, so for those ask the owner or CA to share an exported copy. CFO Brief (/cfo-brief) also has a Financial Ratios and One-Page Summary tab that reads cleanly without accounting knowledge.",
    "route": "/analytics",
    "keywords": "read P&L, profit loss, financial reports, balance sheet, income statement Viewer · Reports"
  },
  {
    "category": "Books & accounting",
    "q": "Can I add a transaction just by speaking, like 'received 5000 from Sharma'?",
    "a": "Yes. Go to Voice & Vernacular > Voice Capture (/voice), tap Speak (or type) and say something like 'received 5000 from Sharma' or 'paid 1200 to electricity'. Headroom parses the amount, direction (money in/out), party and a suggested category into an editable draft, matches the party to existing customers/vendors where it can, and posts a real transaction to your ledger via the same path as the Dashboard - it appears instantly in Transactions. If your view is read-only, posting is disabled.",
    "route": "/voice",
    "keywords": "voice capture speak dictate transaction received paid ledger Voice / vernacular"
  },
  {
    "category": "Books & accounting",
    "q": "How do I record a sales invoice quickly?",
    "a": "Use the 'New entry' tab in Books - the 'Sales invoice' card. Pick the customer ledger, enter the line total (pre-tax), choose the GST rate (0/5/12/18/28%), tick 'Inter-state' if it's an IGST supply, set the date, then 'Post sales invoice'. A live preview shows the CGST/SGST split (intra-state) or IGST (inter-state) and the gross total before you post. For multi-line invoices with HSN, discounts and per-line GST, use the 'Invoices' tab instead.",
    "route": "/books",
    "keywords": "sales invoice post voucher gst cgst sgst igst quick entry Vouchers"
  },
  {
    "category": "Books & accounting",
    "q": "How do I record money received or paid (a receipt or a payment)?",
    "a": "On the 'New entry' tab there are two cards: 'Receipt' (money received into bank/cash from a party) and 'Payment' (money paid out to a party). Pick the bank/cash ledger, the party ledger, enter the amount and date, add an optional UTR/reference, and post. Both create a balanced double-entry voucher automatically - you don't choose debit/credit sides yourself.",
    "route": "/books",
    "keywords": "receipt payment record money received paid bank cash party UTR Vouchers"
  },
  {
    "category": "Books & accounting",
    "q": "I made a mistake on a voucher - how do I edit or delete it?",
    "a": "You can't edit or delete a posted voucher - that's by design, so the audit trail stays intact. Instead, in 'New entry' → 'Recent vouchers', click 'Reverse' on the row. That posts a mirror voucher (every debit and credit swapped) and flags the original as cancelled, atomically. The net effect on your books is zero, then re-post the correct entry. A reversed voucher shows 'Cancelled' and its Reverse button is disabled.",
    "route": "/books",
    "keywords": "edit delete voucher reverse cancel mistake correction undo Vouchers"
  },
  {
    "category": "Books & accounting",
    "q": "Where do I find all the TDS and income-tax tools?",
    "a": "They're on the Books page (/books). Click the 'Tax Filing' tab to reach the six sub-tabs: TDS Returns, Form 16A, Lower-deduction (Sec 197), 26AS reconcile, Advance Tax, and Income Tax / ITR. The portal-ready ITR JSON assembler is one tab over, under the 'Compliance' tab. Salary TDS, PF/ESI and Form 16 (not 16A) live in the separate Payroll module.",
    "route": "/books",
    "keywords": "where, navigation, tax filing tab, compliance tab, books, sub-tabs Where is it"
  },
  {
    "category": "Books & accounting",
    "q": "What happens when I mark a deal as Won?",
    "a": "On the Pipeline board click the green Win button on the deal card and confirm. This marks the deal Won and automatically creates a customer (a Sundry Debtors party ledger) in Books, so your sales pipeline links to your accounting without re-typing the customer. Always use Win for this - just dragging a deal to a done state does not create the Books ledger. Tip: set the GSTIN on the Account before winning so the GSTIN carries through to the Books party for invoicing.",
    "route": "/crm",
    "keywords": "win won deal close customer books ledger sundry debtors Win/loss"
  },
  {
    "category": "GST & tax",
    "q": "How do I work out my advance-tax instalments?",
    "a": "Open Books > Tax Filing > Advance Tax sub-tab. Enter your Projected income, pick the Regime (new/old) and Entity type (individual/firm/company/HUF), then click 'Compute instalments'. It computes the full income-tax on that projected income and splits it into the s.211 statutory cumulative instalments - 15% by 15 Jun, 45% by 15 Sep, 75% by 15 Dec, 100% by 15 Mar - showing each due date, cumulative % , cumulative tax and the amount due that instalment.",
    "route": "/books",
    "keywords": "advance tax, 211, instalments, 15 June September December March, estimator Advance tax"
  },
  {
    "category": "GST & tax",
    "q": "I'm on 44AD presumptive - do I still pay four advance-tax instalments?",
    "a": "No. A 44AD/44ADA (presumptive) assessee pays the entire advance tax in a single instalment of 100% by 15 March, and the schedule reflects that with just one row. The estimator handles this when the regime is presumptive. Note the presumptive scheme only changes how the profit is arrived at; that profit is still taxed under the normal slabs.",
    "keywords": "44AD, 44ADA, presumptive, single instalment, 15 March, 100% Advance tax"
  },
  {
    "category": "GST & tax",
    "q": "How are advances received handled for GST (GSTR-1 Table 11)?",
    "a": "Advances on which you've paid tax but not yet raised an invoice are tracked from outward tax rows tagged supply_type = ADVANCE. They feed GSTR-1 Table 11A (AT - advance received) grouped by place of supply and rate, and Table 11B (TXPD - advance adjusted against later invoices). Because the books don't link an advance to the later invoice automatically, the TXPD adjustment side is caller-supplied. In GSTR-9 these advances surface in Table 4F. They are kept out of the normal B2B/B2C buckets so you don't double-count tax.",
    "route": "/books",
    "keywords": "advances at txpd table 11 4f advance received adjusted place of supply Advances"
  },
  {
    "category": "GST & tax",
    "q": "Does Headroom remind me about GST, TDS, PF and other statutory due dates?",
    "a": "Yes. In Alerts Centre open the Compliance Due-Dates tab (/alerts). Add deadlines or tap a preset - GSTR-3B, GSTR-1, TDS payment, PF & ESI deposit, TDS return (24Q/26Q), advance tax, ROC AOC-4/MGT-7, income-tax return - set the next due date and recurrence (monthly/quarterly/annual). Reminders escalate as the date nears: Upcoming → Due this week → Due ≤3 days → Overdue. When you've filed, tap 'Filed → next' to roll a recurring item to its next cycle. Always confirm exact dates with your CA since extensions and holidays shift them.",
    "route": "/alerts",
    "keywords": "GST TDS PF ESI advance tax ROC due dates compliance reminder statutory Alerts"
  },
  {
    "category": "GST & tax",
    "q": "Is my bank overcharging me on transaction fees and AMC?",
    "a": "The Bank-Fee Analyzer tab on /banking scans your transactions for fee/charge debits (NEFT/RTGS chg, AMC, min-balance, SMS, GST on charges, commission, penal) and benchmarks them as basis points of your total debit volume against an expected bps you set. It shows total fees paid, fees as bps, the amount over benchmark and a breakdown by fee type. If you're over, raise it with your relationship manager - many charges (min-balance, SMS, AMC) are negotiable on business accounts.",
    "route": "/banking",
    "keywords": "bank fee analyzer charges amc min balance neft rtgs gst on charges bps benchmark overcharge negotiate Banking - fees"
  },
  {
    "category": "GST & tax",
    "q": "What is the 'Blocked ITC - s.17(5)' card showing me?",
    "a": "On the Books GST tab this card sums input credit that is legally ineligible under section 17(5) (e.g. motor vehicles, personal consumption, certain goods) for the period, broken out by CGST/SGST/IGST/CESS with a total. The basis is either explicit vouchers you flagged or inward entries marked supply_type = BLOCKED. This credit is deliberately excluded from your claimable ITC and must not be set off against output tax - it's surfaced so you don't accidentally over-claim in GSTR-3B.",
    "route": "/books",
    "keywords": "blocked itc 17(5) ineligible credit cgst sgst igst cess section Blocked ITC"
  },
  {
    "category": "GST & tax",
    "q": "A client's imported data is messy - how do I clean it before I rely on the reports?",
    "a": "In the Data module (/data) run the pipeline: import via CSV Mapper, then Data Quality (health score flags blank dates, zero amounts, missing counterparties and likely duplicates), then Dedupe to remove double-booked rows. There's also a GSTIN Validator to bulk-check vendor/customer GSTINs before filing. Clean data here makes every report and forecast trustworthy downstream.",
    "route": "/data",
    "keywords": "clean data, data quality, dedupe, duplicates, gstin validator, fix import CA · Data quality"
  },
  {
    "category": "GST & tax",
    "q": "Where can I see every client's filing status for GSTR, TDS, PF, ITR and ROC at once?",
    "a": "Open the Compliance Board tab on /advisor. It's a grid with one row per client and columns for GSTR-3B, TDS, PF/ESI, ITR and ROC. Tap any cell to cycle it through Pending → Filed → N/A as you complete each return, or hit \"All filed ✓\" to clear a whole client in one tap.",
    "route": "/advisor",
    "keywords": "compliance board, filing tracker, gstr tds pf itr roc, return status, calendar CA · Filing calendar"
  },
  {
    "category": "GST & tax",
    "q": "I need this month's GSTR-3B liability for all my clients - fastest way?",
    "a": "Use the Bulk GST tab on /advisor. It shows this month's GSTR-3B liability across every linked client at once, with the CGST/SGST/IGST split and a running \"Total pending\" figure. Click \"Prepare [client]'s GSTR-3B →\" to stage it, then open that client's own GST tab (/gst) to review the GSTR-3B/GSTR-1 summary and actually file.",
    "route": "/advisor",
    "keywords": "bulk gst, gstr-3b all clients, monthly gst liability, gst across portfolio CA · GST across clients"
  },
  {
    "category": "GST & tax",
    "q": "Where do I create a GST-compliant sales invoice on behalf of a client?",
    "a": "In the client's workspace, Invoices (/invoices) creates GST-compliant invoices with multi-rate line items, emails or WhatsApps them, and generates a UPI QR for one-tap payment. It also has a GSTR-1 summary and e-invoice JSON helper. Alternatively, post a sales invoice directly into the ledger from Books → New entry (/books), where the CGST/SGST or IGST split happens live as you post.",
    "route": "/invoices",
    "keywords": "create invoice, gst invoice, sales invoice, e-invoice, gstr-1, billing for client CA · Invoicing for client"
  },
  {
    "category": "GST & tax",
    "q": "A client missed a GSTR-3B deadline - what does the delay actually cost them?",
    "a": "Open that client's Compliance module (/compliance) and drag the \"Cost of Filing Late\" slider - it shows the late fee plus 18% interest on a delayed GSTR-3B so you can quantify the damage and decide whether to scramble. Their Compliance Overview also lists every statutory deadline in the next 6 months with red flags for anything within 7 days.",
    "route": "/compliance",
    "keywords": "late fee, gstr-3b late, interest, penalty, cost of filing late, missed deadline CA · Late fees"
  },
  {
    "category": "GST & tax",
    "q": "Can I check a client's PF/ESI and Professional Tax numbers without my own spreadsheets?",
    "a": "Yes - Payroll (/payroll) bundles India-specific calculators for Professional Tax, PF/ESI, Gratuity, Form 16, salary slips and CTC breakup, alongside the monthly payroll run. The PF/ESI filing status per client is then a column on the /advisor Compliance Board so you can mark it Filed once deposited.",
    "route": "/payroll",
    "keywords": "pf, esi, professional tax, pt, gratuity, payroll compliance, ctc CA · Payroll compliance"
  },
  {
    "category": "GST & tax",
    "q": "Can it work out a client's ROC due dates like AOC-4 and MGT-7?",
    "a": "Yes - the client's Compliance module (/compliance) has \"ROC Auto-Prep\" which computes the AOC-4 and MGT-7 due dates from the AGM date and pre-fills turnover/profit from their books. On your /advisor Compliance Board you then mark the ROC column Filed once done. The Annual Master Calendar in /compliance has a \"Copy all\" button to hand a clean year-view.",
    "route": "/compliance",
    "keywords": "roc, aoc-4, mgt-7, company law, mca, agm, annual return CA · ROC / company law"
  },
  {
    "category": "GST & tax",
    "q": "Where do I see a client's TDS to deposit and their payroll TDS?",
    "a": "The client's Tax Autopilot (/tax) Overview computes the TDS to deposit alongside GST liability and the income-tax estimate. For salary TDS specifically, Payroll (/payroll) auto-calculates the income tax to withhold per employee each month and totals gross/TDS/net for the payroll run, plus Form 16. On /advisor the Compliance Board has a TDS column to mark deposited per client.",
    "route": "/tax",
    "keywords": "tds, tds deposit, payroll tds, withholding, form 16, salary tax CA · TDS"
  },
  {
    "category": "GST & tax",
    "q": "How do I bulk-check a client's vendor GSTINs before claiming input credit?",
    "a": "Use the GSTIN Validator tab in the Data module (/data) - paste the GSTINs one per line and it gives a valid/invalid breakdown. For input-credit protection at filing time, the client's GST workbench (/gst) also matches purchase bills against the government's GSTR-2B so you catch ITC you'd otherwise lose.",
    "route": "/data",
    "keywords": "gstin validator, verify gstin, check gst number, input credit, gstr-2b match CA · Verifying GSTIN"
  },
  {
    "category": "GST & tax",
    "q": "What can I do across all my clients at once in the CA portal?",
    "a": "The /advisor CA Practice screen has tabs across your whole portfolio: Clients (balance, runway, alerts, pre-qualified credit), Alert Feed (severity-ranked alerts from every client), Bulk GST (GSTR-3B status and net liability per client with 'Prepare All'), Compliance Board (a per-client Pending/Filed/N-A grid for GST, TDS, PF/ESI, ITR, ROC), Doc Tracker, Query Log, Engagement, Practice (compliance calendar + task board), Marketplace (new client leads), and Billing (invoice clients, collect via UPI). Trackers like tasks and bills are saved to your own server-side workspace and follow you across devices.",
    "route": "/advisor",
    "keywords": "ca portal tabs bulk gst compliance board doc tracker billing marketplace portfolio CA / advisor portal"
  },
  {
    "category": "GST & tax",
    "q": "Does Headroom file my GST returns directly with the portal?",
    "a": "No. Headroom is a preparation and reconciliation tool, not a filing agent. As the Compliance tab states up front, nothing here files on your behalf - every output (GSTR-1 JSON, GSTR-9/9C JSON, ITR JSON, e-invoice IRN, e-way bill) is a draft you review and then upload yourself to the GST portal or offline tool. The e-invoice and e-way bill flows only reach the actual portal when a GSP is configured; without GSP credentials they honestly report 'not configured' rather than faking a successful filing.",
    "route": "/books",
    "keywords": "file portal gsp draft upload not filed compliance honest Common confusion"
  },
  {
    "category": "GST & tax",
    "q": "Where do I set my company's legal name, GSTIN, PAN and address?",
    "a": "Organization → Company holds two cards. The 'Company profile' card captures legal/registered name, GSTIN, PAN, industry, team size, phone, website, full address, city, state, PIN and UPI/VPA - used on invoices, statements and compliance. The separate 'Business Profile' card sets your trading name, industry and a runway safety threshold used in underwriting and advisor reports. Only an owner can edit company identity; click Save on each card.",
    "route": "/organization#company",
    "keywords": "company profile legal name gstin pan address upi vpa industry business identity Company profile"
  },
  {
    "category": "GST & tax",
    "q": "Where do I see all my statutory deadlines - GST, TDS, advance tax, PF/ESI?",
    "a": "Open /compliance. The Overview tab builds a rolling 6-month calendar straight from your firm profile and transactions: TDS deposit (7th), GSTR-1 (11th) and GSTR-3B + payment (20th) if you're GST-registered, PF & ESI (15th) if you run payroll, and advance-tax instalments (15th of Jun/Sep/Dec/Mar). Each event carries the cash amount where known and a 'in Xd / overdue' badge, and clicking one jumps to /gst, /tax or /payroll. The KPI strip shows deadlines and cash due in the next 30 days.",
    "route": "/compliance",
    "keywords": "due dates calendar GST TDS advance tax PF ESI deadline statutory Compliance calendar"
  },
  {
    "category": "GST & tax",
    "q": "Does it track ROC / MCA filings like MGT-7, AOC-4, DIR-3 KYC?",
    "a": "Yes. The /compliance Overview includes a fixed ROC/MCA filing calendar - MGT-7/MGT-7A annual return, AOC-4 financial statements, ADT-1 auditor appointment, DIR-3 KYC (due 30 Sep, ₹5,000 penalty if late), LLP Form 11 and Form 8, INC-20A, and the MSME half-yearly return. There are also dedicated tabs: 'ROC Auto-Prep', 'DIR-3 KYC / DPT-3', 'Board / AGM', 'Event-Based ROC' and a full 'Annual Master Calendar'. Each row shows an urgency status (Overdue / Due Soon / Upcoming / Scheduled).",
    "route": "/compliance",
    "keywords": "ROC MCA MGT-7 AOC-4 DIR-3 KYC DPT-3 annual return company law LLP form 8 11 Compliance calendar"
  },
  {
    "category": "GST & tax",
    "q": "What's the cost of filing my GSTR-3B late?",
    "a": "On /compliance Overview, the 'Cost of Filing Late' card has a slider - drag it to the number of days late and it computes the late fee (₹50/day) plus interest at 18% p.a. on this month's net GST payable, and a total. It uses your live GST liability, so it's specific to your numbers. For deeper, multi-act penalty modelling (TDS, ROC, etc.) use the 'Penalty Estimator' tab in the same module.",
    "route": "/compliance",
    "keywords": "late fee GSTR-3B penalty interest 18% 50 per day GST late cost Compliance calendar"
  },
  {
    "category": "GST & tax",
    "q": "How do I track contract, licence and MSME 45-day-payment deadlines?",
    "a": "On /compliance: the 'Contract Expiry Tracker' (Overview) lets you add vendor/lease/employment/NDA contracts with an expiry date and flags 'expiring soon' within 30 days. The MSME / Udyam Checker classifies you Micro/Small/Medium and lists benefits including the 45-day payment protection. There are also dedicated tabs - 'MSME Form-1 (45-day)' for the half-yearly outstanding-payments disclosure, 'Shop & License Renewals', 'FSSAI / Industry Licenses', 'Trademark / IP' and 'Fire / Safety NOC'.",
    "route": "/compliance",
    "keywords": "contract expiry licence renewal MSME Udyam 45 day payment form 1 FSSAI shop act Compliance calendar"
  },
  {
    "category": "GST & tax",
    "q": "Does Headroom file my TDS return or ITR directly with the government?",
    "a": "No. Headroom only builds the artifact - the e-TDS .txt file, the Form 16A HTML, the ITR JSON, the advance-tax schedule - for you to review and upload yourself to the TIN-RPU/FVU, TRACES or the Income-Tax e-filing utility. Nothing is ever marked 'filed' on your behalf. Always verify the totals (and edit challan details in the RPU) before submitting on the portal.",
    "keywords": "does it file, not filed, draft, review and upload, TRACES, e-filing portal Confusion"
  },
  {
    "category": "GST & tax",
    "q": "How do I raise a new GST invoice?",
    "a": "Go to /invoices and click the 'New Invoice' button (top right). In the modal enter the customer name (required), optional GSTIN, email and WhatsApp number, pick the headline GST rate (0/5/12/18/28%) and an optional due date, then add line items with description, HSN/SAC, qty and rate. Each line can carry its OWN GST rate, so mixed-rate invoices total correctly; the modal shows live Subtotal, GST and Total before you hit 'Create Invoice'.",
    "route": "/invoices",
    "keywords": "new invoice bill customer line items HSN SAC create Create invoice"
  },
  {
    "category": "GST & tax",
    "q": "Why is the GST on my invoice different from the headline rate I picked?",
    "a": "Tax is computed per line on each line's own GST rate, not a single blanket rate. The dropdown at the top sets the default rate used when you add a new line, but if any line has a different rate (say one item at 5% and another at 18%), the total GST is the sum of each line's tax. This keeps mixed-rate invoices accurate - change a line's rate in the line-items grid to fix it.",
    "route": "/invoices",
    "keywords": "GST wrong mixed rate per line tax calculation 5 12 18 28 Create invoice"
  },
  {
    "category": "GST & tax",
    "q": "How do I issue a credit note for a return or a debit note for a price revision?",
    "a": "Open the 'Credit/Debit Note' tab on /invoices. Toggle Credit or Debit, optionally pick the invoice it's raised against (which auto-fills the customer and GST rate), enter the taxable value, GST rate and a reason (goods returned / price revision / deficiency). It auto-numbers as CN-YYYY-NNN or DN-YYYY-NNN and shows GST + total. A credit note reduces your output tax; a debit note increases it.",
    "route": "/invoices",
    "keywords": "credit note debit note CN DN return price revision GST adjustment Credit / debit notes"
  },
  {
    "category": "GST & tax",
    "q": "What's the deadline to report a credit note in GST?",
    "a": "The tool itself flags this: credit notes must be reported in GSTR-1 by 30 November following the end of the financial year in order to reverse the output tax - miss that window and you can't reduce your liability for it. Debit notes, by contrast, increase your tax liability in the month they're issued. Issue from the Credit/Debit Note tab on /invoices and reconcile the totals against your GSTR-1 in /gst.",
    "route": "/gst",
    "keywords": "credit note deadline 30 november GSTR-1 reverse output tax debit note Credit / debit notes"
  },
  {
    "category": "GST & tax",
    "q": "i need a proper gst invoice with my gstin on it for input credit",
    "a": "Ask the business to put your GSTIN on the invoice before sending it. Headroom splits GST into CGST/SGST (same state) or IGST (other state) automatically on the invoice, and your GSTIN on it is what lets you claim input tax credit. If they've already sent one without your GSTIN, request a corrected invoice - give them your exact GSTIN and registered name.",
    "keywords": "gst invoice gstin input credit itc tax bill cgst sgst igst Customer/Vendor · GST invoice"
  },
  {
    "category": "GST & tax",
    "q": "i'm deducting tds on this payment - how much do i actually pay?",
    "a": "Pay the invoice amount minus the TDS you're required to deduct, then deposit that TDS and issue the business a TDS certificate (Form 16A) so they can claim it. Tell the business you've deducted TDS and share the challan/certificate details - they reconcile it on their side, otherwise the amount looks short and you'll get a reminder for the 'balance'.",
    "keywords": "tds deduct short payment 194 certificate 16a less amount Customer/Vendor · TDS"
  },
  {
    "category": "GST & tax",
    "q": "How do I create a delivery challan and turn it into an invoice?",
    "a": "Use the 'Delivery Challan' tab on /invoices to record goods sent (customer, purpose, vehicle number, line items) before billing - handy for goods-in-transit or job-work movements. In the Books document pipeline a Delivery Challan is a non-posting document that can be converted to an Invoice (which is the step that actually posts to the ledger), and converting a challan/GRN also moves the underlying inventory. The standard chain is Estimate → Sales Order → Delivery Challan → Invoice.",
    "route": "/invoices",
    "keywords": "delivery challan goods transit vehicle convert invoice non-posting inventory Delivery challan"
  },
  {
    "category": "GST & tax",
    "q": "How do I apply a discount and see the correct GST after it?",
    "a": "Use the 'Discount + GST' tab on /invoices for a quick line-level calculation that applies the discount before computing GST, so the tax is charged on the net (post-discount) taxable value - which is the GST-correct order. For reusable, rule-based discounts tied to customers or items, set up pricing rules and coupons in the Books module at /books.",
    "route": "/invoices",
    "keywords": "discount GST after discount taxable value net coupon calculator Discounts + GST"
  },
  {
    "category": "GST & tax",
    "q": "Where do I manage DPDP Act 2023 compliance and my privacy obligations?",
    "a": "Open /privacy - your DPDP / Account Aggregator control centre. It keeps the durable proof an audit or the Data Protection Board can ask for: the DPDP Consent Log, data-subject Access/Erasure tracker, Retention Policy, third-party Sharing Registry, Breach Log and a Privacy-Hygiene readiness score. Start on the Privacy Hygiene tab and tick the 10 controls you actually have to get your readiness %. Backend consent toggles, data export and account-deletion requests live separately in Settings → Privacy & Data.",
    "route": "/privacy",
    "keywords": "DPDP data protection act 2023 data fiduciary privacy compliance DPDP / privacy"
  },
  {
    "category": "GST & tax",
    "q": "Do I need a signed agreement with every tool I share data with?",
    "a": "Track them in /privacy → 'Sharing Registry'. List every processor, SaaS tool or partner that receives personal data, what you share, the purpose and tick whether a Data Processing Agreement (DPA) is signed. Recipients without a signed DPA are flagged with a yellow warning, and the Privacy Overview alerts you to the count - under DPDP you remain accountable for your processors, so a DPA is your contractual safeguard if one mishandles data.",
    "route": "/privacy",
    "keywords": "DPA data processing agreement third party processor vendor sharing DPDP / privacy"
  },
  {
    "category": "GST & tax",
    "q": "Can I customise the dunning levels, interest and fees instead of the default ladder?",
    "a": "The backend supports a fully configurable dunning procedure (GET/POST /api/dunning/procedure). Each level carries a minimum overdue-days threshold, an interest rate (% p.a.), a flat dunning fee, a tone, and a subject+body letter template with placeholders like {{party}}, {{outstanding}}, {{interest}}, {{totalDue}}. If you haven't saved your own, it falls back to a default 4-rung ladder: Level 1 Reminder at 1 day (0%), Level 2 at 15 days (12%, gentle->firm), Level 3 Final notice at 30 days (18% + Rs.250 fee), Level 4 Pre-legal at 60 days (24% + Rs.500). Thresholds must be strictly increasing. GET /api/dunning/due previews exactly which invoices would be dunned and at what level/interest without recording anything.",
    "route": "/collections",
    "keywords": "dunning procedure configure levels interest fee letter template ERPNext Dunning ladder"
  },
  {
    "category": "GST & tax",
    "q": "Does Headroom support e-invoicing / IRN, and where do I get the JSON?",
    "a": "Use the 'e-Invoice JSON' tab on /invoices to generate an IRP-schema JSON for a selected invoice that you can upload to the e-invoice portal to obtain an IRN. Headroom builds the schema for you; it doesn't directly call the IRP. The invoice record also has an IRN field that displays once an IRN is recorded. GST e-invoicing applies to businesses over the prescribed turnover threshold.",
    "route": "/invoices",
    "keywords": "e-invoice IRN IRP JSON schema upload portal einvoice e-Invoice"
  },
  {
    "category": "GST & tax",
    "q": "How do I generate an e-invoice IRN for a sales invoice?",
    "a": "E-invoicing runs as an asynchronous queue: posting/enqueuing a sales voucher for e-invoicing parks it as QUEUED, and a background worker builds the IRP payload (seller/buyer GSTIN, item HSN list, taxable + tax) and registers it with your GSP, moving it to REGISTERED with the IRN, ack number, ack date and signed QR. Crucially this only works if a GSP is configured (GSP_BASE_URL / GSP_API_KEY) - without it the row sits in PENDING_CONFIG and no IRN is fabricated. You can check a voucher's e-invoice status by its voucher id.",
    "route": "/books",
    "keywords": "e-invoice irn generate gsp queue registered pending config signed qr ack E-invoice / IRN"
  },
  {
    "category": "GST & tax",
    "q": "How do I cancel an e-invoice (IRN)?",
    "a": "On the Books GST tab use the 'Cancel e-invoice (IRN)' card: enter the voucher id, pick a reason (1 Duplicate, 2 Data entry mistake, 3 Order cancelled, 4 Other), add optional remarks and click 'Cancel IRN' (it asks you to confirm). Cancellation is only valid within 24 hours of IRN generation (measured from the ack date) and needs a configured GSP - if no GSP is set up the call honestly reports 'GSP not configured' rather than faking a cancel. After the 24-hour window has passed, use a credit/debit note instead.",
    "route": "/books",
    "keywords": "cancel irn e-invoice 24 hours reason duplicate window credit note gsp E-invoice / IRN"
  },
  {
    "category": "GST & tax",
    "q": "Where do I manage the e-way bill lifecycle - vehicle, transporter, extend, cancel?",
    "a": "Go to Books → Compliance tab → 'E-way bill lifecycle' sub-tab. Enter the dispatch document's voucher id and click 'Load status' to see the EWB number, status, valid-upto, vehicle and transporter. Below that, owner/finance/accountant roles get four action cards: Update vehicle (Part-B), Assign transporter, Extend validity, and Cancel e-way bill. Each builds the NIC-shaped payload and routes through the GSP when configured; with no GSP credentials it tells you honestly the rail isn't configured instead of faking a portal action.",
    "route": "/books",
    "keywords": "eway bill ewb lifecycle vehicle transporter extend cancel part-b nic status E-way bill"
  },
  {
    "category": "GST & tax",
    "q": "Why can't I cancel or extend my e-way bill?",
    "a": "There are strict NIC time windows. Cancellation is only allowed within 24 hours of generation (measured from when the EWB was generated) - after that you cannot cancel and must raise a credit/debit note. Validity can only be extended in the window from 8 hours before to 8 hours after the current valid-upto; outside that window the extend call is rejected. You also need a live EWB number on the voucher to begin with, and a configured GSP - without GSP credentials lifecycle actions return 'not configured' rather than acting.",
    "route": "/books",
    "keywords": "eway cancel 24 hours extend 8 hours window valid upto rejected nic E-way bill"
  },
  {
    "category": "GST & tax",
    "q": "When is ESI deducted?",
    "a": "ESI is deducted only when gross monthly pay is ₹21,000 or below - above that threshold the employee is out of ESI and no deduction is made. The employee share is 0.75% of gross (the employer share is 3.25%). It appears only if the structure has ESI enabled. You can see the consolidated ESIC challan math on the PF / ESI Challan tab of /payroll, which mirrors the 0.75% / 3.25% split and the ₹21,000 threshold.",
    "route": "/payroll",
    "keywords": "esi 21000 threshold 0.75 percent 3.25 employer challan esic ESI"
  },
  {
    "category": "GST & tax",
    "q": "Should I sell my unpaid invoices for early cash - how do I estimate what I'd net?",
    "a": "Use the Factoring / Discounting tab on /receivables. Tick the open invoices you'd factor, then set advance rate (default 85%), discount rate (% p.a., default 18), service fee (% of face), and expected tenor in days. It computes cash advanced now, discount interest on the advance over the tenor, the flat service fee, reserve released on collection, net proceeds, and the effective + annualised cost. Compare the annualised cost against your own cost of capital before factoring. It's an estimate only - actual KredX/TReDS terms vary.",
    "route": "/receivables",
    "keywords": "factoring invoice discounting TReDS KredX advance early cash net proceeds Factoring"
  },
  {
    "category": "GST & tax",
    "q": "will we have enough cash to cover GST, payroll and rent next month?",
    "a": "Open /forecast and Generate Forecast - it builds a 90-day best/expected/worst (P10/P50/P90) projection from your transactions and invoices. Under Cash Obligations click + Add to log dated GST, rent, EMI and advance-tax payments (GSTR-3B is auto-added if you're GST-registered) and they appear as red lines so you see a crunch coming. Treat the P10 worst-case line, not the expected line, as your planning number.",
    "route": "/forecast",
    "keywords": "cash forecast runway crunch obligations payroll gst rent will we run short Finance manager · Cash forecast"
  },
  {
    "category": "GST & tax",
    "q": "what statutory deadlines are coming up and how much cash do they need?",
    "a": "Open /compliance Overview - the top strip shows deadlines in the next 30 days, cash due, GST payable this month and estimated annual tax, and the Next 6 Months list shows red dates within 7 days (click a row to jump to GST/Tax/Payroll to file). Drag the 'Cost of Filing Late' slider to see what a delayed GSTR-3B costs in late fee plus 18% interest. Cross-check that 'cash due next 30 days' figure against /forecast so an instalment never blindsides runway.",
    "route": "/compliance",
    "keywords": "due dates deadlines statutory calendar gst tds advance tax pf esi late fee Finance manager · Compliance dates"
  },
  {
    "category": "GST & tax",
    "q": "where do I file GSTR-3B and see what I owe this month?",
    "a": "Open /gst Calculator tab, pick the month and year and compute - it shows Output Tax, Input Tax Credit and Net Liability with the CGST/SGST GSTR-3B breakdown, then tap Create return to save a draft under the Returns tab. First make sure your 15-char GSTIN and GST-registered flag are set in Settings, or the banner at the top of /gst warns you and every figure depends on it.",
    "route": "/gst",
    "keywords": "gstr-3b gst liability output input tax credit net payable file return Finance manager · GST filing"
  },
  {
    "category": "GST & tax",
    "q": "I need to upload GSTR-1 - where's the outward supply summary",
    "a": "Use the GSTR-1 tab in /gst: pick the month, eyeball the outward-supply totals built from your invoices, and Download the CSV for portal upload. For the B2B/B2CL/B2CS split there's also a GSTR-1 Summary tool inside /invoices. Cross-check the GSTR-1 output tax against the Calculator/3B output tax for the same month - if they don't agree, your invoices and books are out of sync before you file.",
    "route": "/gst",
    "keywords": "gstr-1 outward supply b2b csv upload sales return Finance manager · GST filing"
  },
  {
    "category": "GST & tax",
    "q": "is this vendor's GSTIN real before I pay them?",
    "a": "Paste it into the Verify GSTIN tab on /gst and tap Verify - it confirms the 15-char format and check digit and shows the embedded state and PAN. ITC on invoices from cancelled or fake GSTINs gets disallowed, so run this on every new supplier and re-check before large payments. To validate many at once, use the GSTIN Validator in /data (paste one per line).",
    "route": "/gst",
    "keywords": "verify gstin validate vendor pan check digit fake cancelled Finance manager · GST filing"
  },
  {
    "category": "GST & tax",
    "q": "after payroll runs, how do I make sure PF and TDS get paid on time",
    "a": "Payroll posts the statutory dues into payable ledgers (PF Payable, TDS Payable) in Books - pay them from those accounts before their due dates. Track those dates on /compliance (PF/ESI rows appear once you set employee count and tag payroll transactions) and /tax for the TDS deposit date. The Prof. Tax tab in /payroll is state-specific, so set the right state to get the exact PT to deposit.",
    "route": "/compliance",
    "keywords": "pf esi tds professional tax due date deposit statutory payable Finance manager · Payroll"
  },
  {
    "category": "GST & tax",
    "q": "how much TDS do I need to deposit this month?",
    "a": "Two places. /payroll computes salary TDS - the Employees tab shows TDS/month per person and the top card shows total TDS monthly, with statutory tabs (PF ECR, Prof. Tax, Form 16) for filing. For the headline number plus the next TDS due date alongside GST and advance tax, check /tax Overview, which reads your live transactions. Vendor TDS sits in the Vendor TDS Ledger tab under /vendors.",
    "route": "/tax",
    "keywords": "tds deposit deduction salary tds vendor tds due date Finance manager · TDS"
  },
  {
    "category": "GST & tax",
    "q": "How do I raise my very first invoice?",
    "a": "The owner/finance/sales setup checklist has a 'Raise your first invoice' step that opens /invoices. Click 'New invoice', pick the customer (add a few customers in Books, /books, first or bulk-upload them), add line items, and the invoice starts tracking receivables and GST automatically. For the PDF header and the UPI payment QR to look right, fill your firm name, address, GSTIN and UPI ID in Settings first - otherwise the QR falls back to a placeholder.",
    "route": "/invoices",
    "keywords": "first invoice new invoice raise bill receivables GST UPI QR customer First invoice"
  },
  {
    "category": "GST & tax",
    "q": "How do I add a cash obligation like rent or a GST payment to the forecast?",
    "a": "On /forecast, in the 'Cash Obligations' card click '+ Add', enter a name, amount and due date. The obligation appears as a red dashed line on the 90-day chart so you can see when cash leaves. If you're GST-registered, Headroom auto-adds a GSTR-3B obligation (due the 20th) after you generate a forecast, using last month's net payable computed from your transactions.",
    "route": "/forecast",
    "keywords": "obligation rent EMI GST payment due date add cash out Forecast"
  },
  {
    "category": "GST & tax",
    "q": "What extra forecasting tools are hidden in the tabs?",
    "a": "The /forecast page has 30 tabs beyond the main Probabilistic view - including AR Inflow Projection, Seasonality, Best/Base/Worst, Cash Bridge, Break-Even Date, Rolling 12-Mo P&L, Owner Draw Planner, GST Payment Forecast, Cash-Conversion Cycle, Liquidity Stress Test, DSCR Forecast, Smart Reserve Tiers and Advance-Tax Calendar. They're in the scrollable tab strip under the page title; each rebuilds live from your invoices, transactions and obligations.",
    "route": "/forecast",
    "keywords": "forecast tabs tools seasonality break even advance tax dscr reserve Forecast"
  },
  {
    "category": "GST & tax",
    "q": "Can I generate Form 16 for my employees?",
    "a": "Yes - the Form 16 tab on /payroll produces a Form 16 summary per employee (you need employees added first, and PAN populated for it to be meaningful) using the new-regime slabs with the ₹75,000 standard deduction and 87A rebate so the figures match the run, slip and TDS. You can download it as a CSV (Form16_Name_FY.csv). It's a system-generated summary - file the actual Part A/B with your CA for ITR; the 24Q/TDS-return side is supported via the TDS u/s 192 tab.",
    "route": "/payroll",
    "keywords": "form 16 16a part b ay tds certificate 24q itr download Form 16"
  },
  {
    "category": "GST & tax",
    "q": "How do I issue a Form 16A TDS certificate to a vendor?",
    "a": "In Books (/books) > Tax Filing tab, open the Form 16A sub-tab. Select the Party (deductee) from your party ledgers, pick the Quarter and Financial year, then click 'Open Form 16A' - it opens an HTML certificate (Form No. 16A under section 203) in a new tab showing the deductor block, deductee block, a table of TDS transactions for that quarter and totals, ready to print/save. Note it is generated from your books, not downloaded from TRACES, so verify the totals against your Form 26Q filing before issuing.",
    "route": "/books",
    "keywords": "form 16A, TDS certificate, section 203, deductee, quarterly certificate Form 16A"
  },
  {
    "category": "GST & tax",
    "q": "How do I process a full-and-final settlement for someone leaving?",
    "a": "Use the F&F Settlement tab on /payroll. The calculator nets earnings (pending salary + notice/other dues + gratuity + leave encashment) minus recoveries (outstanding salary advances/loans + other deductions). Leave encashment = encashable leave balance × per-day Basic (last Basic ÷ 30). On completion the /hrms engine posts a journal (Dr Salaries, Cr Salaries Payable for the net, recoveries against Staff Deductions), closes any open loans, marks the employee INACTIVE and stamps their relieving date.",
    "route": "/payroll",
    "keywords": "full and final fnf settlement leaving relieving notice encashment loan recovery Full & Final"
  },
  {
    "category": "GST & tax",
    "q": "How does the GST rate and HSN on an item flow into invoices and returns?",
    "a": "The HSN/SAC and GST rate you set on the item master are stored on the item and carried through when you bill it, so the tax is computed consistently and your HSN-wise summary lines up at filing time. You pick the GST rate from the standard slabs (0/5/12/18/28%) in the New item form, and you can review or edit it in the items table. For the actual returns, see the GST area at /gst.",
    "route": "/books",
    "keywords": "GST rate HSN SAC item tax slab invoice returns filing GST"
  },
  {
    "category": "GST & tax",
    "q": "Can I bulk-validate a list of GSTINs before filing?",
    "a": "Yes - open the 'GSTIN Validator' tab on /data and paste GSTINs one per line. It checks the 15-character structure, the 2-digit state code (mapped to the state name), the embedded PAN segment and the official checksum digit, then shows a Valid/Invalid breakdown with reasons and a downloadable report CSV. It's offline structural + checksum validation only - it does not confirm the GSTIN is currently active/registered on the GST portal.",
    "route": "/data",
    "keywords": "gstin validate bulk checksum state code pan filing GST / GSTIN"
  },
  {
    "category": "GST & tax",
    "q": "Can I generate a real e-invoice IRN / e-way bill?",
    "a": "The e-invoice and e-way bill payloads are built to the official NIC/IRP shape and the full lifecycle (generate, cancel within 24h, update vehicle, extend) is implemented. Generating a *live* IRN/e-way number requires connecting your GST Suvidha Provider (GSP) account - open Connectors and add your GSP credentials to switch it on. Until then it produces a clearly-labelled sample number.",
    "route": "/connectors",
    "keywords": "e-invoice irn e-way bill gsp nic generate GST & Tax"
  },
  {
    "category": "GST & tax",
    "q": "How do I run TDS / file a TDS return?",
    "a": "Books handles TDS sections (194C/J/H/I/Q, 206C TCS), produces Form 16A and a multi-challan 24Q/26Q/27EQ e-TDS file. First set your deductor TAN in Settings (the return requires it). Then record TDS on vouchers and use Books → Tax Filing to generate the return file and 26AS reconciliation.",
    "route": "/books",
    "keywords": "tds tcs 24q 26q form 16a tan return challan GST & Tax"
  },
  {
    "category": "GST & tax",
    "q": "Where do I enter my GSTIN so Headroom estimates my GST liability?",
    "a": "Organization → Company has a 'GST Settings' card. Toggle 'I'm GST registered', enter your 15-character GSTIN and pick your primary output GST rate (0/5/12/18/28% - 18% is most common), then Save. Headroom then estimates your monthly GSTR-3B output tax as revenue × your rate and surfaces it in the tax calendar and forecast. That's a planning estimate before input tax credit - your actual liability is lower.",
    "route": "/organization#company",
    "keywords": "gst gstin rate gstr-3b liability estimate tax registered output rate GST settings"
  },
  {
    "category": "GST & tax",
    "q": "Is there a GSTR-1 import/export template, and where do I export GST data for the portal?",
    "a": "On /data the 'Filing Templates' tab gives a GSTR-1 B2B starter CSV (gstin, invoice_no, invoice_date, taxable_value, rate, igst/cgst/sgst). For your actual numbers, the GST module (/gst) builds outward supplies from your invoices - the GSTR-1 tab lets you pick a month and Download a CSV for portal upload, and the 2B Match tab takes your GSTR-2B JSON plus purchase register to reconcile ITC and export a report for your CA.",
    "route": "/gst",
    "keywords": "gstr1 gstr2b gst template export portal itc filing GST templates"
  },
  {
    "category": "GST & tax",
    "q": "Where do I see my GSTR-1 sections and download the JSON to file?",
    "a": "Open Books and go to the GST tab. Pick the tax period (month) at the top, then scroll to the 'GSTR-1 sections' card to see your invoices split into B2B, B2CL, B2CS, CDNR (credit/debit notes) and EXP/SEZ, each with taxable, CGST, SGST and IGST. To file, click 'Download GSTR-1 JSON' in the top-right - it builds gstr1-<period>.json from your posted vouchers for you to upload to the GST portal or offline tool. Headroom never files on your behalf; the JSON is a draft you review and upload yourself.",
    "route": "/books",
    "keywords": "gstr1 download json b2b b2cl b2cs export return filing GSTR-1"
  },
  {
    "category": "GST & tax",
    "q": "How do I get a GSTR-1 summary from my invoices?",
    "a": "The 'GSTR-1 Summary' tab on /invoices splits your invoices into B2B, B2CL and B2CS the way the return expects, built from the invoices you've raised. Use it to eyeball outward-supply totals before filing. The fuller GST workflow - picking a month, downloading the GSTR-1 CSV for portal upload, and 2B reconciliation - lives in the GST module at /gst. Cross-check the GSTR-1 output tax against your books for the same month so they don't drift.",
    "route": "/gst",
    "keywords": "GSTR-1 summary B2B B2CL B2CS outward supply return filing GSTR-1"
  },
  {
    "category": "GST & tax",
    "q": "How does Headroom decide whether a sale goes into B2B, B2CL or B2CS?",
    "a": "It classifies each outward voucher automatically from the data you posted. If the invoice has a counterparty GSTIN it goes to B2B; exports and SEZ supplies go to EXP; credit/debit notes against a GSTIN go to CDNR. For sales with no GSTIN it checks the place of supply - an inter-state invoice (IGST present) over ₹2,50,000 lands in B2CL, and everything else is aggregated by rate + place of supply into B2CS. So the split follows GST law from the GSTIN, IGST and invoice-value fields on your vouchers; if a sale lands in the wrong bucket, fix the GSTIN or inter-state flag on the original invoice.",
    "route": "/books",
    "keywords": "b2b b2cl b2cs 250000 large invoice place of supply classification GSTR-1 sections"
  },
  {
    "category": "GST & tax",
    "q": "How do I see my net GST liability for the month?",
    "a": "On the Books GST tab the stat cards at the top show GSTR-3B output tax, input tax credit and net GST liability for the selected period. Net liability is output tax minus ITC computed per head (CGST/SGST/IGST/CESS) from your posted vouchers. For the per-head breakdown and what's left to pay after challans, look at the 'Net GST to pay (PMT-06)' card lower down.",
    "route": "/books",
    "keywords": "gstr3b net liability output tax itc payable monthly GSTR-3B"
  },
  {
    "category": "GST & tax",
    "q": "Where is the GSTR-9 annual return and how is it built?",
    "a": "Go to Books → Compliance tab → 'GSTR-9 / 9C' sub-tab. Pick the financial year, then read Pt II Table 4 (outward supplies), Pt III Tables 6-7 (ITC availed/reversed) and Table 9 (tax paid). It is auto-populated by summing the same GSTR-3B/GSTR-1 period data over the FY's 12 months, so it reconciles to your books by construction. Click 'Recompute' to refresh, and 'Download GSTR-9 portal JSON' to get the offline-tool envelope. Figures the books can't know - prior-year amendments declared this year (Pt V), demands/refunds, late fee, and the 2A figure for Table 8A - default to zero and must be filled by you.",
    "route": "/books",
    "keywords": "gstr9 annual return part ii iii iv table 4 6 7 9 download json recompute GSTR-9"
  },
  {
    "category": "GST & tax",
    "q": "how do I make sure I don't miss a PF or TDS due date",
    "a": "The Statutory Liability tab on /payroll sums up what you owe after each run, and the Penalty Predictor tab flags the cost of late deposits. For the broader compliance calendar (GST, TDS, ROC, etc.) check the /compliance page. Pay PF/ESI/PT/TDS out of the payable accounts the payroll journal created in your Books before each due date.",
    "route": "/compliance",
    "keywords": "due dates, compliance calendar, PF deadline, TDS deadline, penalty, late deposit HR/Payroll admin · Compliance deadlines"
  },
  {
    "category": "GST & tax",
    "q": "can I generate Form 16 from here at year end",
    "a": "Yes - open the Form 16 tab on /payroll. It builds the Part A TDS summary (total annual TDS deducted, monthly TDS, annual gross, standard deduction, net taxable) per employee and downloads as CSV. Make sure each employee's PAN is filled on the Employees tab first, because the form is only as accurate as that data.",
    "route": "/payroll",
    "keywords": "Form 16, year end, TDS certificate, annual tax statement, part A HR/Payroll admin · Form 16"
  },
  {
    "category": "GST & tax",
    "q": "where do employees submit their 80C investment declarations",
    "a": "There isn't a self-serve employee form, but the Payslip Portal tab on /payroll has an IT investment declaration checkbox per employee so you can track who has submitted, and the payslip message it generates auto-includes a 'please submit your IT investment declaration if pending' prompt. Once you have their proofs you reflect the deductions in the TDS u/s 192 / Form 16 figures.",
    "route": "/payroll",
    "keywords": "investment declaration, 80C, tax saving proof, declaration tracking, IT declaration HR/Payroll admin · Investment declarations"
  },
  {
    "category": "GST & tax",
    "q": "where do I get the PF ECR file to upload on the EPFO portal",
    "a": "On /payroll open the PF ECR tab - it builds the Electronic Challan-cum-Return showing members, total PF wages, employee EPF and total remittance, downloadable for the EPFO upload. The PF / ESI Challan tab gives you the combined challan view, and the Statutory Liability tab summarises everything you owe so you don't miss a due date.",
    "route": "/payroll",
    "keywords": "PF ECR, EPFO upload, PF challan, ESI challan, remittance file, provident fund return HR/Payroll admin · PF challan"
  },
  {
    "category": "GST & tax",
    "q": "does it deduct PF ESI and PT automatically or do I calculate myself",
    "a": "It is automatic when you run payroll. The HRMS run (/hrms Payroll tab) deducts PF, ESI and Professional Tax based on the salary structure flags you ticked, and the /payroll run computes PF/ESI/PT/TDS using your CTC structure (Basic % and the ₹15,000 PF wage ceiling cap). For the exact PT figure, open the Prof. Tax tab on /payroll and pick your state - PT is state-specific (Maharashtra, Karnataka, etc.) and the per-employee total shown is what you deposit.",
    "route": "/payroll",
    "keywords": "PF deduction, ESI, professional tax, PT, statutory deductions, EPF, automatic HR/Payroll admin · PF/ESI/PT"
  },
  {
    "category": "GST & tax",
    "q": "where do I process employee expense reimbursements with salary",
    "a": "Use the Reimbursements tab on /payroll: log claims, approve them, and use Merge to Payroll so approved reimbursements get paid out alongside the salary run instead of as a separate transfer. The tab tracks total claims, pending approval and approved-to-pay so nothing slips through.",
    "route": "/payroll",
    "keywords": "reimbursement, expense claim, merge to payroll, employee expenses, claims HR/Payroll admin · Reimbursements"
  },
  {
    "category": "GST & tax",
    "q": "ok where do I actually run payroll for this month",
    "a": "Two places depending on how you set up. If you built salary structures and marked attendance, go to /hrms, open the Payroll tab and click Run payroll for the month - it prorates for LOP days, deducts PF/ESI/PT and posts one journal into your Books. If you only keep gross salaries, go to /payroll and click Run Payroll (top right); it computes a draft run totalling gross, TDS and net and drops you on the Payroll runs tab where you click Disburse to mark it paid.",
    "route": "/payroll",
    "keywords": "run payroll, monthly payroll, process salary, pay staff, salary run HR/Payroll admin · Running payroll"
  },
  {
    "category": "GST & tax",
    "q": "how is the monthly TDS for each employee worked out",
    "a": "Headroom uses one statutory engine on the new tax regime: it annualises the salary, applies the ₹75,000 standard deduction, runs the slab tax, applies the 87A rebate and 4% cess, then divides by 12 for the even monthly TDS. You see the estimate live in the Add Employee modal, and the TDS u/s 192 tab on /payroll shows the full annual-to-monthly projection so the slip, run and Form 16 all match.",
    "route": "/payroll",
    "keywords": "TDS, income tax deduction, section 192, monthly tax, new regime, withholding HR/Payroll admin · TDS"
  },
  {
    "category": "GST & tax",
    "q": "Is there an HSN/SAC summary for GSTR-1 Table 12?",
    "a": "Yes - on the Books GST tab the 'HSN / SAC summary (Table 12)' card lists every HSN/SAC code used in the period with its rate, taxable value, CGST, SGST, IGST and total tax. It is grouped by HSN and rate straight from your invoice line items, so it reconciles to the GSTR-1 sections above it. Use the Export menu on that card to pull it to CSV/Excel for the portal.",
    "route": "/books",
    "keywords": "hsn sac table 12 summary rate wise export HSN summary"
  },
  {
    "category": "GST & tax",
    "q": "How do I record an import Bill of Entry and its IGST credit?",
    "a": "Books → Compliance tab → 'Imports (BoE / ITC-04)' sub-tab → 'Bill of Entry (imports)' card. Click 'New BoE', pick the import supplier (vendor ledger), enter the BoE number/date, port code, assessable (CIF) value, BCD, SWS and import IGST, then 'Post Bill of Entry'. Posting books a balanced purchase voucher automatically. BCD and Social Welfare Surcharge are non-creditable and get capitalised into landed cost; the import IGST (on assessable + BCD + SWS) is creditable ITC that flows to GSTR-3B 4(A)(1). You can also bulk-upload BoEs from a template.",
    "route": "/books",
    "keywords": "bill of entry boe import igst bcd sws customs landed cost itc cif port Imports (BoE)"
  },
  {
    "category": "GST & tax",
    "q": "Is there a quick tax calculator if I just want to test a number?",
    "a": "Yes - the same 'Income Tax / ITR' sub-tab has a 'Quick tax calculator' card. Type a Taxable income, pick New or Old regime, and click 'Calculate tax'. It returns the base tax, surcharge, cess and total tax. For the new regime it applies the §87A rebate up to the ₹7,00,000 limit (₹5,00,000 under old), so incomes within that range come out at zero tax.",
    "route": "/books",
    "keywords": "quick calculator, taxable income, new old regime, 87A rebate, cess surcharge Income tax / ITR"
  },
  {
    "category": "GST & tax",
    "q": "What's the difference between the old and new regime in the calculator?",
    "a": "The new regime (default, 115BAC) uses the wider slabs (nil up to ₹3L, then 5/10/15/20/30%) with an §87A rebate up to ₹7L total income; the old regime uses the ₹2.5L/5L/10L slabs with rebate only up to ₹5L and retains the 37% top surcharge band that the new regime abolished (capped at 25%). Pick the regime in the dropdown on both the ITR summary and the Quick tax calculator. A 4% Health & Education cess is added on top in both regimes.",
    "keywords": "115BAC, old vs new regime, slabs, surcharge 37, 25 percent, cess Income tax / ITR"
  },
  {
    "category": "GST & tax",
    "q": "Which Assessment Years can the tax engine compute?",
    "a": "The individual/HUF slab engine is configured for AY 2024-25 and AY 2025-26 (FY 2023-24 and FY 2024-25); ask for any other AY on the individual path and it returns UNSUPPORTED_AY rather than silently reusing slabs. Company and firm/LLP use a flat rate (30%, or 25% concessional for companies) that is not AY-gated. The AY is derived from your FY automatically (FY 2024-25 ⇒ AY 2025-26).",
    "keywords": "assessment year, AY 2024-25, AY 2025-26, UNSUPPORTED_AY, supported years Income tax / ITR"
  },
  {
    "category": "GST & tax",
    "q": "How do employee investment declarations affect TDS?",
    "a": "Investment declarations flow straight into the TDS projection (old regime). They follow a lifecycle: DRAFT → SUBMITTED (planned) → PROOF_SUBMITTED → VERIFIED. While only declared, the planned amounts reduce projected tax; once proofs are submitted or verified, the projection switches to the proof figures instead. Each transition re-projects TDS automatically, so the per-month deduction updates. Caps are applied: 80C ₹1.5L, 80CCD(1B) ₹50k, 80D ₹1L. HRA inputs (monthly rent, metro flag) drive the least-of-three HRA exemption.",
    "keywords": "investment declaration 80c proofs verified hra rent metro chapter via Investment declarations"
  },
  {
    "category": "GST & tax",
    "q": "Are they actually filing their GST and tax - or is there compliance risk hiding?",
    "a": "Beyond the Data Room's Tax checklist (GST returns and 3 years of ITRs), the founder's /gst and /compliance modules track every statutory deadline - GST returns, TDS, advance tax, PF/ESI and ROC/MCA filings - with a GST-vs-Books reconciliation. For diligence, ask them to mark the Tax items Ready in the Data Room and share the Compliance Health Score; under-1% GST-vs-books variance is the clean signal.",
    "route": "/investor",
    "keywords": "GST, compliance, TDS, ITR, statutory, filing risk, PF ESI, ROC Investor · GST/compliance check"
  },
  {
    "category": "GST & tax",
    "q": "Can I create a proper multi-line tax invoice with HSN codes and per-line discounts?",
    "a": "Yes - use the 'Invoices' tab (not the quick 'New entry' card). Choose document type (Tax Invoice or Estimate/Quote), the customer, date, and the inter-state flag, then add lines with description/HSN, qty, rate, discount and a per-line GST%. You can pick from your inventory items to auto-fill HSN and GST rate. Totals (taxable, CGST/SGST or IGST, grand total) compute live. After saving you can Print/PDF or Send the document by email/WhatsApp.",
    "route": "/books",
    "keywords": "tax invoice estimate quote multi-line HSN discount per-line GST print send Invoices"
  },
  {
    "category": "GST & tax",
    "q": "we now count as a Data Fiduciary under DPDP - where do I manage that?",
    "a": "The /privacy page is the DPDP Act 2023 control centre. The Overview tab shows active AA consents, DPDP consents logged, open data requests and your DPDP readiness %. Use Privacy Hygiene (tick the 10 controls), DPDP Consent Log (record who you collect personal data from and mark withdrawals), Access / Erasure (log subject requests on a 30-day SLA clock), Sharing Registry (list vendors and whether a DPA is signed), and Policy Generator to produce a DPDP-aligned privacy notice. The Penalty Estimator sizes your exposure.",
    "route": "/privacy",
    "keywords": "DPDP data privacy compliance data fiduciary consent erasure privacy notice IT / Admin · DPDP compliance"
  },
  {
    "category": "GST & tax",
    "q": "Where do I track goods sent to a job-worker (ITC-04)?",
    "a": "Books → Compliance tab → 'Imports (BoE / ITC-04)' sub-tab → 'ITC-04 - job-work challans' card. Click 'New challan', choose direction (Sent to job-worker = Table 4, or Received back = Table 5A), and fill the challan no/date, job-worker GSTIN/name, item, HSN, qty, UoM, taxable value and goods type (inputs/capital). Sending goods on a delivery challan for job-work is not a supply - it carries no GST and posts no voucher, so these rows are tracked purely for the ITC-04 return. You can filter by Sent/Received and bulk-upload too.",
    "route": "/books",
    "keywords": "itc-04 itc04 job work challan sent received table 4 5a delivery challan ITC-04 / job work"
  },
  {
    "category": "GST & tax",
    "q": "Can I generate a portal-ready ITR JSON to upload to the e-filing utility?",
    "a": "Yes - that lives on the Compliance tab of Books (/books), not Tax Filing. Open Books > Compliance > 'ITR JSON' sub-tab and use the ITR JSON assembler: choose the form and regime, and it builds the nested JSON the Income-Tax Department's utility ingests, sourcing business income from your books P&L plus TDS/TCS credits and advance-tax challans. ITR-3 is for regular books; ITR-4 SUGAM is the 44AD/44ADA presumptive scheme. It is a draft you review and upload yourself - nothing is filed automatically.",
    "route": "/books",
    "keywords": "ITR JSON, ITR-3, ITR-4 SUGAM, e-filing utility, portal ready, compliance tab ITR JSON"
  },
  {
    "category": "GST & tax",
    "q": "The ITR JSON says required fields are missing - what do I fix?",
    "a": "The assembler validates each form's required fields before calling the JSON portal-ready: PAN, assessee name, assessment year, gross/total income, total tax payable and the verification name. The most common failures are a missing or wrongly-formatted PAN (it must match the AAAAA9999A pattern) or a blank legal name - both come from your company/tenant profile. Fill those in your profile and rebuild; blank optional fields are left for you to complete in the utility rather than fabricated.",
    "keywords": "schema validation, required fields, PAN format, AAAAA9999A, missing fields ITR JSON"
  },
  {
    "category": "GST & tax",
    "q": "Where do the TDS/TCS credits and advance-tax challans in my ITR come from?",
    "a": "The ITR JSON pulls prepaid-tax credits straight from your books for the financial year: TDS/TCS you suffered (withholding rows marked as input/credit) become the Schedule-TDS / Schedule-TCS per-deductor lines, and advance-tax / self-assessment challans you've recorded feed Schedule-IT. The totals roll into PartB-TTI as taxes paid, and the balance tax payable or refund due is computed against your total tax liability. Record advance/self-assessment challans (BSR code, challan no., date, amount) so they appear.",
    "keywords": "schedule TDS TCS IT, advance tax challan, prepaid tax, BSR, refund due, balance payable ITR JSON"
  },
  {
    "category": "GST & tax",
    "q": "How much does it cost me to accept a credit card vs UPI?",
    "a": "Open the MDR / Surcharge tab on /payments, enter the amount and pick the method. It shows the MDR fee, 18% GST on that fee, total cost to you and what you net. Indicative rates built in: UPI (P2M) and RuPay debit are 0%, Visa/MC debit ~0.9%, credit card ~2%, Amex/Diners ~3%, net banking ~1%, wallets ~1.5%. For any card sale it also shows exactly how many rupees you'd save by steering that sale to UPI/RuPay.",
    "route": "/payments",
    "keywords": "MDR merchant discount rate fees gst on fee credit debit upi rupay cost net received MDR / fees"
  },
  {
    "category": "GST & tax",
    "q": "which items should i focus my controls and counting on?",
    "a": "Open the 'ABC Analysis' tab on /operations. It runs a Pareto classification by stock value: Class A ≈ top 80% of value, B the next 15%, C the final 5%. Items auto-populate from your inventory and are classified automatically. Tighten counts, security and supplier terms on A items; relax on the C tail. This also drives how often each SKU is cycle-counted.",
    "route": "/operations",
    "keywords": "ABC analysis, pareto, vital few, classify items, A B C, stock value, focus controls Operations / Procurement · ABC analysis"
  },
  {
    "category": "GST & tax",
    "q": "where do i actually add a new product and set its reorder level?",
    "a": "On /operations open the Inventory tab and tap Add Product. Enter the product name, an optional SKU, current quantity, unit cost and the reorder level - then it's saved and every other tool (reorder alerts, ABC, valuation, oversell guard) pulls from it. The reorder level you set here is what drives the red low-stock badge and the procurement suggestions.",
    "route": "/operations",
    "keywords": "add product, new SKU, set reorder level, create item, inventory entry, master data Operations / Procurement · Adding inventory"
  },
  {
    "category": "GST & tax",
    "q": "is there anything that watches for double payments to suppliers?",
    "a": "Yes - the 'Anomaly Radar' tab on /operations scans your transactions for duplicate payments, spend spikes, creeping subscriptions and large new payees. Flags are graded high/medium/low and each one links straight to the underlying transactions - tap Review to open them in /transactions and confirm whether it's a genuine double payment or just a one-off spike.",
    "route": "/operations",
    "keywords": "anomaly, duplicate payment, double payment, spend spike, fraud, new vendor, radar Operations / Procurement · Anomaly radar"
  },
  {
    "category": "GST & tax",
    "q": "can i track batch numbers and expiry dates for my stock?",
    "a": "Yes - use the 'Batch / Expiry' tab on /operations. You can record lots, serial numbers and shelf life, which makes it FEFO-ready (first-expiry-first-out) for pharma, food and FMCG. Rows are sorted earliest-expiry-first; items expiring within 30 days or already expired show red, within 90 days amber. It's built for shelf-life compliance.",
    "route": "/operations",
    "keywords": "batch, lot, serial number, expiry, shelf life, FEFO, pharma, FMCG Operations / Procurement · Batch / serial"
  },
  {
    "category": "GST & tax",
    "q": "what is all this stock actually costing me to just sit there?",
    "a": "Use the 'Carrying Cost' tab on /operations. Carrying cost = stock value × total annual rate (capital, storage, obsolescence and insurance), and typical SMB rates run 18-30% - the biggest hidden tax on slow stock. The way to cut it is to shrink dead stock (see Stock Aging) and tighten reorder quantities (see EOQ).",
    "route": "/operations",
    "keywords": "carrying cost, holding cost, cost of stock, inventory cost, storage, obsolescence Operations / Procurement · Carrying cost"
  },
  {
    "category": "GST & tax",
    "q": "i can't shut the shop for a full stock-take every year - any alternative?",
    "a": "Yes - the 'Cycle Count' tab on /operations plans rolling counts by ABC class so you never close the business for a full annual count. High-value A items (top 80% of sales) are counted most often, C items least. Tapping 'Mark counted' resets that SKU's clock so the schedule keeps rolling. The classes are derived live from each SKU's revenue contribution.",
    "route": "/operations",
    "keywords": "cycle count, rolling count, ABC count, counting cadence, no annual stocktake Operations / Procurement · Cycle counting"
  },
  {
    "category": "GST & tax",
    "q": "how do i find slow-moving or dead stock before the auditor does?",
    "a": "Use the 'Stock Aging' tab on /operations. It buckets inventory by days held since the last fulfilled sale (or last stock update if never sold). Anything in the 180+ day bucket is a strong write-off / clearance candidate - review provisioning with your CA. The 'Carrying Cost' tab then shows what holding that slow stock costs you per year (typically 18-30% of stock value).",
    "route": "/operations",
    "keywords": "dead stock, slow moving, obsolete, aging, days held, write off, clearance Operations / Procurement · Dead stock"
  },
  {
    "category": "GST & tax",
    "q": "a supplier offered a discount if i pay early - is it worth it?",
    "a": "Use /suppliers. The Early-Pay tool shows discount offers with the green 'Save' amount and 'Pay today' price (note: today this shows sample offers, not yet your own bills). The Terms Optimizer is the real decision tool: set 'Your cost of capital' once, add each supplier's terms (e.g. 2% / 10 days / net 45), and it tells you 'Pay early' or 'Pay on net' with the annualised yield so you only take discounts that beat your cost of money.",
    "route": "/suppliers",
    "keywords": "early payment discount, prompt payment, 2/10 net 30, terms optimizer, cost of capital, worth paying early Operations / Procurement · Early payment"
  },
  {
    "category": "GST & tax",
    "q": "where do i record that goods actually arrived against a PO?",
    "a": "Two places, depending on what you need. To simply receive stock and book the expense, open the PO on the Procurement tab and tap Mark Received - that records the expense and tops up inventory. To do a proper three-way check, use the 'GRN vs PO' tab: it compares ordered vs received quantity and PO rate vs invoiced rate, flagging short deliveries (negative qty) and over-billing (positive price variance) so you catch problems before paying.",
    "route": "/operations",
    "keywords": "GRN, goods receipt, receiving, mark received, three way match, short delivery Operations / Procurement · GRN / receiving"
  },
  {
    "category": "GST & tax",
    "q": "vendor invoiced more than the PO rate - how do i catch that before paying?",
    "a": "Use the 'GRN vs PO' tab on /operations. Log the goods receipt against the PO and it runs a three-way check on quantity and rate: a positive price variance means the vendor invoiced above the PO rate. The screen tells you to resolve it before approving payment. On the buying side, /suppliers also has a 'GRN Match' / Three-way-match tool that flags over-billing and quality rejects so you never pay for goods you didn't receive or accept.",
    "route": "/operations",
    "keywords": "overbilling, price mismatch, rate variance, invoice vs PO, GRN discrepancy Operations / Procurement · GRN / receiving"
  },
  {
    "category": "GST & tax",
    "q": "i send material out to a job worker - how do i track that for ITC-04?",
    "a": "Use the 'Job-Work' tab on /operations. It tracks goods sent to job workers under delivery challans and their return, framed around Section 143 and the ITC-04 return. Record the challan when material goes out and mark it when it comes back so you can reconcile what's still with the processor at return time.",
    "route": "/operations",
    "keywords": "job work, challan, ITC-04, section 143, processing, subcontract, sent out Operations / Procurement · Job work"
  },
  {
    "category": "GST & tax",
    "q": "i import goods with freight and duty - how do i get the real landed cost?",
    "a": "Open the 'Landed Cost' tab on /operations. Add your imported items and the shipment overheads (freight, duty, insurance), and it apportions those overheads across items by value or by weight. Landed unit cost = goods cost + allocated overhead - the true number to value stock and price your imports. There's also a Landed Cost tool inside /suppliers if you're working from the vendor side.",
    "route": "/operations",
    "keywords": "landed cost, freight, duty, import cost, customs, allocate overhead, true cost Operations / Procurement · Landed cost"
  },
  {
    "category": "GST & tax",
    "q": "how do i see what's running low right now?",
    "a": "Go to /operations and open the Inventory tab - the tab itself shows a red badge with the count of items at or below their reorder level, and the Overview tab has a 'Low Stock Alerts' counter. Any SKU where quantity is at or under its reorderLevel is flagged. To act on it, jump to the Procurement tab where those same low-stock items appear under 'AI Procurement Suggestions' with a one-tap Create PO button.",
    "route": "/operations",
    "keywords": "low stock, reorder, out of stock, running out, stock alert, inventory low Operations / Procurement · Low stock"
  },
  {
    "category": "GST & tax",
    "q": "do you have anything to run a work order / cost a production batch?",
    "a": "Yes. The 'Production' tab on /operations lets you create a production run and cost a manufacturing batch - materials + labour + overhead, with yield. Pair it with the 'BOM Costing' tab to build a Bill of Materials (components, quantities, unit costs, overhead %, selling price) for each manufactured product. Together they're your light MRP for costing assembled/manufactured goods.",
    "route": "/operations",
    "keywords": "MRP, work order, production run, manufacturing, batch cost, BOM, assembly Operations / Procurement · MRP / work orders"
  },
  {
    "category": "GST & tax",
    "q": "which vendor bills do i have to pay first to avoid the 45-day MSME problem?",
    "a": "Two tools help. The 'Aged Payables' tab on /operations tracks payables aging and your MSME 45-day exposure (MSME vendors must be paid within 45 days, 15 if no agreement; amounts unpaid beyond the limit are disallowed under Sec 43B(h) until paid). On /suppliers, 'MSME Verify' lets you enter each vendor's Udyam number, outstanding and invoice date then 'Verify pending' to flag 43B(h) risks, and the Pay-Priority tool ranks open payables by urgency.",
    "route": "/operations",
    "keywords": "MSME, 45 days, 43B(h), Udyam, pay vendor first, payables aging, disallowance Operations / Procurement · MSME payments"
  },
  {
    "category": "GST & tax",
    "q": "how do i make sure i'm not promising stock i don't physically have?",
    "a": "Open the 'Oversell Guard' tab on /operations. It compares committed quantity (on open pending/confirmed/processing orders) against on-hand stock. Available = on-hand minus committed; a negative value means you've promised stock you don't have. SKUs at or below reorder level after commitments show as 'Tight' - so you catch phantom stock before you ship it.",
    "route": "/operations",
    "keywords": "oversell, overselling, phantom stock, committed, available stock, on hand vs promised Operations / Procurement · Oversell"
  },
  {
    "category": "GST & tax",
    "q": "how do i raise a purchase order to a supplier?",
    "a": "On /operations open the Procurement tab and tap Create PO. Enter the supplier name, an expected delivery date, the product, quantity and unit cost - it shows the total and saves as a Draft PO. From there push it through the lifecycle: Approve, then Mark Ordered, then Mark Received. Marking Received logs the expense and adds the quantity back into your inventory automatically.",
    "route": "/operations",
    "keywords": "PO, purchase order, raise PO, create PO, order from supplier, buy stock Operations / Procurement · Purchase orders"
  },
  {
    "category": "GST & tax",
    "q": "the system says i'm low on something - can it just make the PO for me?",
    "a": "Almost. On the Procurement tab, every low-stock item shows under the yellow 'AI Procurement Suggestions' panel with a Create PO button. Tapping it pre-fills the PO form with the product name, a suggested quantity (double the reorder level, minimum 50) and the last known unit cost. You still set the supplier and expected date, then tap Create Draft PO - so you review before it's raised.",
    "route": "/operations",
    "keywords": "auto PO, suggested PO, reorder suggestion, AI procurement, replenish Operations / Procurement · Purchase orders"
  },
  {
    "category": "GST & tax",
    "q": "how much should i actually reorder and when?",
    "a": "Use the planning tabs on /operations. 'Reorder Alert' shows each SKU's current stock vs reorder point (ROP), reorder quantity and lead time, with Critical flagged when stock is under 50% of ROP. 'EOQ Calc' gives the economic order quantity (√(2·D·S / H)) that minimises combined ordering + holding cost. 'Min/Max Plan' and 'Safety Stock' set per-SKU min/max levels from real ~90-day demand and lead-time variability.",
    "route": "/operations",
    "keywords": "reorder point, ROP, how much to order, EOQ, order quantity, min max, safety stock Operations / Procurement · Reorder planning"
  },
  {
    "category": "GST & tax",
    "q": "where do i log customer returns and goods i'm sending back to a vendor?",
    "a": "The 'Returns / RTV' tab on /operations. Track both customer returns and return-to-vendor (RTV) with a disposition and value. Restock returns flow back to sellable inventory; quarantine and scrap do not. Note RTV of defective stock may need an ITC reversal / debit note under GST - the screen flags this and says to consult a CA.",
    "route": "/operations",
    "keywords": "returns, RTV, return to vendor, customer return, reverse logistics, debit note, ITC reversal Operations / Procurement · Returns"
  },
  {
    "category": "GST & tax",
    "q": "how do i set a safety stock buffer instead of guessing?",
    "a": "Open the 'Safety Stock' tab on /operations. It computes safety stock = z × daily demand × √(lead-time variance) from a target service level, using roughly 90 days of fulfilled-order history for daily demand. It then derives Min (reorder point = demand over lead time + safety) and Max (min + demand over the review cycle), with an order-up-to quantity. So your buffer comes from variability and service level, not gut feel.",
    "route": "/operations",
    "keywords": "safety stock, buffer stock, service level, reorder point, min level, demand variability Operations / Procurement · Safety stock"
  },
  {
    "category": "GST & tax",
    "q": "how do i record damaged or expired stock so my numbers stay honest?",
    "a": "Use the 'Scrap / Wastage' tab on /operations. Log damaged, expired and production-loss stock with its cost impact - recording scrap keeps your stock value honest and surfaces avoidable losses. It feeds into your overall valuation so closing stock isn't overstated.",
    "route": "/operations",
    "keywords": "scrap, wastage, damaged stock, expired, write off, spoilage, production loss Operations / Procurement · Scrap / wastage"
  },
  {
    "category": "GST & tax",
    "q": "i'm worried i depend on one supplier too much - can the system show that?",
    "a": "Yes. On /suppliers use the Concentration / Risk-Diversification tools to see how much spend rides on each vendor, and the Alt-Supplier tool to flag single-sourced items - one disruption stops your line. The advice baked in is to qualify and periodically trial-order from a backup so you can switch fast when price, quality or availability slips.",
    "route": "/suppliers",
    "keywords": "single source, supplier concentration, dependency, backup supplier, second source, supply risk Operations / Procurement · Single-source risk"
  },
  {
    "category": "GST & tax",
    "q": "how fast is my stock actually moving?",
    "a": "Open the 'Stock Turnover' tab on /operations. Turns = period COGS ÷ stock value, and Days of Inventory = period ÷ turns; higher turns free up working capital. COGS is estimated from fulfilled-order units × current unit cost, so capture your sales/orders to get real numbers. Slow turns point you back to Stock Aging and Carrying Cost.",
    "route": "/operations",
    "keywords": "stock turnover, inventory turns, days of inventory, how fast moving, DOI, working capital Operations / Procurement · Stock turnover"
  },
  {
    "category": "GST & tax",
    "q": "how do i decide which low item to reorder first when cash is tight?",
    "a": "Use the 'Stockout Cost' tab on /operations. Over a 30-day horizon it estimates lost gross profit and goodwill from running out: lost margin = units short × selling price × margin %, plus a fraction for damaged customer trust. It ranks SKUs by that risk so you prioritise reordering the items that actually hurt most - pair it with the Pay-Priority view on /suppliers if cash is the constraint.",
    "route": "/operations",
    "keywords": "stockout cost, lost sales, which to reorder first, prioritise, lost margin, goodwill Operations / Procurement · Stockout cost"
  },
  {
    "category": "GST & tax",
    "q": "how do i flag a vendor whose quality keeps slipping?",
    "a": "Use the Quality / PPM tool on /suppliers. Log received and rejected units per supplier and it computes defects per million (PPM = rejected ÷ received × 1,000,000). Set a target threshold and it flags any vendor whose quality falls below your acceptance bar. World-class is under ~500 PPM; persistent high-PPM vendors warrant a corrective-action request or a second source.",
    "route": "/suppliers",
    "keywords": "quality, defects, rejects, PPM, parts per million, vendor quality, rejection rate Operations / Procurement · Supplier quality"
  },
  {
    "category": "GST & tax",
    "q": "which of my suppliers actually deliver on time?",
    "a": "Two scorecards exist. On /operations the 'Lead Time' tab lets you log ordered, promised and actual delivery dates per vendor - it grades each A (≥90% on-time), B (70-89%) or C (below 70%) and shows average lead time and average delay. For a richer rating, /suppliers has a Scorecard tool with a composite score: Quality 35% + OTIF 35% + Price 20% + Responsiveness 10%, so you can consolidate spend on A-grade vendors.",
    "route": "/operations",
    "keywords": "supplier scorecard, vendor rating, on time delivery, OTIF, lead time, grade vendor Operations / Procurement · Supplier scorecards"
  },
  {
    "category": "GST & tax",
    "q": "i have stock across two godowns - how do i move it between them?",
    "a": "Open the 'Warehouses' tab on /operations. It tracks stock per location (warehouse or shop) and supports inter-warehouse transfers, so you can see what's where and move quantities between locations. Add each warehouse first, then record transfers between them.",
    "route": "/operations",
    "keywords": "warehouse, godown, multi location, transfer stock, branch stock, inter-warehouse Operations / Procurement · Warehouse transfers"
  },
  {
    "category": "GST & tax",
    "q": "can orders my distributors send on whatsapp come in automatically?",
    "a": "That's the intent of WhatsApp Order Capture, shown on the Operations Hub overview: share your business WhatsApp number with distributors and retailers and order messages get parsed and added - across formats and mixed languages. To activate it you must go to Connectors and set up your WhatsApp Business number via Twilio or Wati. Until then you can still log orders manually with Source set to WhatsApp on the Orders tab.",
    "route": "/operations",
    "keywords": "whatsapp orders, auto capture, distributor orders, twilio, wati, connectors, parse messages Operations / Procurement · WhatsApp orders"
  },
  {
    "category": "GST & tax",
    "q": "What does the Operations Manager role get access to?",
    "a": "The Operations Manager role covers orders & inventory, procurement & vendors/suppliers, and spend intelligence, plus connectors - but not banking or payroll. It's the right fit for someone running supply, purchasing and vendor relationships who shouldn't touch cash accounts or salaries. The owner can fine-tune exactly which pages it opens under Organization → Roles & Access.",
    "route": "/organization#access",
    "keywords": "operations manager role inventory procurement vendors suppliers spend no banking payroll Operations role"
  },
  {
    "category": "GST & tax",
    "q": "how much GST do I have to pay this month?",
    "a": "Open /gst, go to the Calculator tab, pick the month and year, and compute - it shows Output Tax minus Input Tax Credit as your Net Liability with the CGST/SGST GSTR-3B breakdown. Set your GSTIN and GST-registered flag in Settings first or the figures won't compute. Tip: each month after the 14th, run the 2B Match tab to catch input credit at risk that you'd otherwise forfeit before filing.",
    "route": "/gst",
    "keywords": "gst payable, gstr-3b, tax to pay, monthly gst, net liability Owner · GST"
  },
  {
    "category": "GST & tax",
    "q": "I keep hearing about the 45-day payment rule for small vendors - am I at risk?",
    "a": "Open /suppliers and use MSME Verify - enter each vendor's Udyam number, outstanding amount and invoice date, then 'Verify pending' flags any micro/small supplier unpaid past 45 days as a Section 43B(h) disallowance risk (the unpaid dues get added back to your taxable income). Run this before financial year-end close, and have your CA confirm live Udyam status since the app only checks the number format.",
    "route": "/suppliers",
    "keywords": "45 day rule, msme, 43b(h), small vendor payment, udyam, tax disallowance Owner · MSME 45-day rule"
  },
  {
    "category": "GST & tax",
    "q": "where do I actually run payroll and does it handle PF and TDS?",
    "a": "You have two options. /hrms is the full desk - set attendance for the month first, then in the Payroll tab click Run payroll: it prorates pay for absences, auto-deducts PF/ESI/Professional Tax and posts one balanced journal into your Books (Dr Salaries, Cr PF/TDS/Salaries Payable). /payroll is the lighter version that auto-calculates TDS to withhold and totals gross/TDS/net per run. A month can only be run once, so finalise attendance and leave approvals first.",
    "route": "/hrms",
    "keywords": "run payroll, pf, esi, tds, professional tax, pay salaries, payslip Owner · Payroll run"
  },
  {
    "category": "GST & tax",
    "q": "how do I make sure I have the cash set aside when GST and advance tax hit?",
    "a": "Two moves. In /alerts set up Tax Set-Aside paired with Compliance Due-Dates so you reserve the cash percentage before GSTR-3B/TDS lands. In /treasury's Goal Planner create earmarked buckets (GST reserve, advance-tax) with a deadline and it calculates the exact monthly contribution to hit each on time. And from /tax click 'Add to Forecast' on each estimated deadline so the outflow is baked into your /forecast runway.",
    "route": "/alerts",
    "keywords": "set aside tax, gst reserve, advance tax cash, save for tax, provision Owner · Setting aside tax cash"
  },
  {
    "category": "GST & tax",
    "q": "what do I owe in tax and when is it due?",
    "a": "Open /tax - the Overview shows your annual income-tax estimate, this month's GST liability, what TDS to deposit, and the Next Deadline with days remaining, all computed from your live transactions. Scroll to Upcoming Deadlines and click 'Add to Forecast' on any amount (Advance Tax, GSTR-3B, TDS) so it lands in your /forecast cash plan. /compliance gives the full rolling 6-month deadline calendar across GST, TDS, PF/ESI, ROC and advance tax.",
    "route": "/tax",
    "keywords": "tax due, deadline, gst payable, advance tax, tds, when to pay Owner · Tax"
  },
  {
    "category": "GST & tax",
    "q": "Why does my payment link show a 'pending-gateway://' URL instead of a real clickable link?",
    "a": "That placeholder means no live payment gateway is configured on the backend. When Razorpay keys (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are set, Headroom mints a real Razorpay hosted link and stores its short_url; without them it still records a trackable link you settle by hand. The UI hides the pending-gateway URL from the share text and shows you a note to 'mark paid manually'. So the link is logged and reconcilable even though it isn't a clickable hosted page yet.",
    "route": "/payments",
    "keywords": "razorpay keys not configured hosted link placeholder gateway Payment links"
  },
  {
    "category": "GST & tax",
    "q": "How do I run payroll with PF/ESI/PT/TDS?",
    "a": "Payroll computes statutory PF, ESI, PT and TDS, projects annual TDS and spreads it monthly, supports investment declarations and formula-driven salary components, and posts a two-stage accrual + payment entry to your books. Add employees first (type or bulk-upload), set the salary structure, then run the month.",
    "route": "/payroll",
    "keywords": "payroll pf esi pt tds salary slip form 16 gratuity People"
  },
  {
    "category": "GST & tax",
    "q": "Why can't I post an RCM bill, record a challan or run e-way bill actions?",
    "a": "Write actions in Books - posting an RCM bill or Bill of Entry, recording a PMT-06 challan, saving a GST rate, cancelling an IRN, and all e-way bill lifecycle actions - require an owner, finance or accountant role. Viewers and other roles can still see the returns, summaries and reconciliations (everything is read-only for them) but the action buttons are hidden or gated. The e-way bill sub-tab spells this out with a banner: 'You need an owner / finance / accountant role to run e-way bill lifecycle actions.'",
    "route": "/books",
    "keywords": "permission role owner finance accountant viewer read only canwrite gated Permissions"
  },
  {
    "category": "GST & tax",
    "q": "Where do I get the PF ECR file and the EPFO/ESIC challans?",
    "a": "The PF ECR tab on /payroll downloads the ECR .txt (UAN, Member Name, Gross/EPF/EPS/ECR Wages, NCP Days, EE/ER contributions) to upload on the EPFO unified portal - deposit by the 15th of the following month. The UANs are placeholders until you replace them with real UANs. The PF / ESI Challan tab gives a consolidated EPFO challan (EPF A/C 1, EPS A/C 10, EDLI A/C 21, admin A/C 2) plus the ESIC challan, as a ready-reckoner before you deposit.",
    "route": "/payroll",
    "keywords": "ecr pf challan epfo esic uan deposit 15th edli eps admin PF ECR / challans"
  },
  {
    "category": "GST & tax",
    "q": "How do I record a GST challan payment (PMT-06)?",
    "a": "On the Books GST tab the 'GST challans (PMT-06)' card lets you click 'New challan', enter the CGST/SGST/IGST/Cess amounts plus optional CIN, bank reference and paid-on date, then 'Record challan'. A challan is marked PAID only once it has both a CIN and a paid-on date - otherwise it stays PENDING. The 'Net GST to pay (PMT-06)' card just above shows your liability versus what's already paid per head so you know how much challan to record to settle the period.",
    "route": "/books",
    "keywords": "pmt-06 challan cin bank ref paid pending liability vs paid record PMT-06 challan"
  },
  {
    "category": "GST & tax",
    "q": "Can I work out the probability of hitting a revenue or cash goal?",
    "a": "Yes - open /predict and use the 'Goal Probability' tab. Name your goal and it estimates the probability you'll hit it based on your modelled futures. The 'Cash-Out Day' tab predicts the date you'd run out of cash, and 'GST Liability' projects upcoming GST payable. These are simulation-based estimates, so keep invoices marked paid/unpaid and transactions tagged for accuracy.",
    "route": "/predict",
    "keywords": "goal probability revenue target hit chance cash out day gst forecast Predict"
  },
  {
    "category": "GST & tax",
    "q": "How is Professional Tax (PT) computed?",
    "a": "PT is a small monthly state slab on gross: nil up to ₹7,500, ₹175 up to ₹10,000, and ₹200 above (a common Maharashtra-style slab - real MH PT is ₹300 in February, which this monthly model flattens to ₹200). It's only deducted if the structure has PT enabled. The Prof. Tax tab on /payroll shows the slab breakdown across your staff. PT rates vary by state, so confirm your state's schedule with your CA before filing.",
    "route": "/payroll",
    "keywords": "professional tax pt slab 7500 175 200 state maharashtra Professional Tax"
  },
  {
    "category": "GST & tax",
    "q": "does it actually do Indian GST properly or will I get penalised?",
    "a": "It handles GST end-to-end. /books auto-splits every sales invoice into CGST/SGST or IGST (with an inter-state tick) at posting time, and /gst gives you a monthly liability calculator, a GSTR-3B/GSTR-1 summary, GSTR-2B reconciliation to catch input credit you'd otherwise lose, a GSTIN verifier, and a due-date calendar so you avoid late fees. Set your GSTIN in Settings -> Business profile first so every figure is right.",
    "route": "/gst",
    "keywords": "gst, gstr, igst, cgst, sgst, input credit, gst correct, gst filing Prospect · GST correctness"
  },
  {
    "category": "GST & tax",
    "q": "can I send GST invoices and get paid by UPI through this?",
    "a": "Yes. In /invoices click 'New Invoice', add multi-rate GST line items (0/5/12/18/28%) with HSN/SAC, then use the row icons to download the PDF, email/WhatsApp it, or generate a UPI QR + pay link the customer taps to pay. Overdue ones get reminders (preferring WhatsApp) from the Auto-Collect tab. Set your firm details and UPI ID in Settings first so the PDF header and QR are correct.",
    "route": "/invoices",
    "keywords": "invoice, billing, upi, qr code, gst invoice, send invoice, get paid Prospect · Invoicing"
  },
  {
    "category": "GST & tax",
    "q": "what about TDS and PF - does it handle those too?",
    "a": "Yes. /payroll auto-calculates the TDS to withhold per employee and totals it in each monthly run, and bundles India-specific calculators for Professional Tax (state-wise), PF/ESI, Gratuity, Form 16 and PF ECR. When you run payroll it posts one balanced journal into your books crediting PF Payable / TDS Payable, and /compliance tracks the TDS and PF/ESI due dates so you don't miss a deposit.",
    "route": "/payroll",
    "keywords": "tds, pf, esi, professional tax, payroll deductions, statutory Prospect · TDS / PF"
  },
  {
    "category": "GST & tax",
    "q": "How do I build a quotation and turn it into an order?",
    "a": "On /sales open the Quote → Order tab. Enter the buyer name and optional buyer GSTIN (it's format-validated to 15 chars), set an order-level discount %, then add line items - product, qty, rate and a GST slab (0/5/12/18/28%) per line. The summary shows subtotal, discount, taxable value, total GST and grand total live. Click Accept & create order to raise a real GST invoice via the invoices API; each priced line becomes an invoice item with the discount folded into the unit price.",
    "route": "/sales",
    "keywords": "quote quotation order line items gst convert invoice build Quotes"
  },
  {
    "category": "GST & tax",
    "q": "How do I make a quotation or estimate, and does it charge GST?",
    "a": "Use the 'Quotation' tab on /invoices (the Quotation Builder). Enter the customer, a 'valid until' date and line items, then Save Quotation - it gets a QT-YYYY-NNN number and a status of open/accepted/converted. Quotations carry NO GST liability until converted; when you click 'Convert', it marks the quote converted and you re-key the lines into a New Invoice to allot a real GST invoice number. Note: quotes are saved locally to your browser/workspace state, not posted to the ledger.",
    "route": "/invoices",
    "keywords": "quotation estimate quote QT convert validity GST not posted Quotes / estimates"
  },
  {
    "category": "GST & tax",
    "q": "Where do I track refunds I owe customers?",
    "a": "The Refund Tracker tab on /payments lets you log a refund with customer, order reference, amount and reason. Each entry starts as 'pending' and you move it to 'processed' or 'rejected' as you action it. Pending refunds and their total value also surface on the Payments Overview card so nothing slips. Keeping statuses current matters - the trackers only hold what you type, so the Overview numbers are only as honest as your updates.",
    "route": "/payments",
    "keywords": "refund tracker pending processed rejected customer order ref reason overview Refunds"
  },
  {
    "category": "GST & tax",
    "q": "How do I record a reverse-charge purchase bill?",
    "a": "On the Books GST tab use the 'Reverse-charge (RCM) bill' card: pick the vendor ledger, enter the line total, choose the GST rate (0/5/12/18/28%) and the date, then click 'Post RCM bill'. The card previews the taxable value and RCM GST so you can sanity-check before posting. Under reverse charge you self-account both the output (payable) and input GST on the same transaction, which is exactly how the posted voucher books it - so it flows into both your liability and your ITC.",
    "route": "/books",
    "keywords": "rcm reverse charge bill vendor self account output input gst post Reverse charge (RCM)"
  },
  {
    "category": "GST & tax",
    "q": "The gateway holds back part of every settlement - is there a way to track that and decide on instant settlement?",
    "a": "The Rolling Reserve tab on /payments logs each month's withheld slice (common for new or high-risk merchant accounts, released months later) so you can forecast the cash that frees up and chase releases the gateway forgets - treat reserves as a receivable in escrow, not an expense. The Instant Settle tab tells you whether paying a fee for same-day/T+0 settlement is worth it, by comparing that fee against the cost of money you'd otherwise borrow while waiting for the usual T+1/T+2 cycle.",
    "route": "/payments",
    "keywords": "rolling reserve hold escrow release instant settlement same day t+0 t+1 t+2 working capital Rolling reserve / instant settle"
  },
  {
    "category": "GST & tax",
    "q": "how do I send a quote to a customer with GST?",
    "a": "Use the Quote to Order tab on /sales. Add each line item with Qty, Rate and the correct GST slab (0/5/12/18/28%), set an order discount, and enter the buyer GSTIN (it is format-checked). The quote totals the CGST/SGST or IGST for you so it is GST-correct before you ever send it.",
    "route": "/sales",
    "keywords": "quote quotation estimate proposal gst slab line items Sales · Quoting"
  },
  {
    "category": "GST & tax",
    "q": "Marketplaces and gateways cut TDS before paying me - how do I record that so I get the credit?",
    "a": "Use the Settlement TDS tab on /payments. Tag each settlement with date, source (e.g. Amazon, Razorpay), gross settled amount and the TDS % (Section 194-O for marketplaces is typically ~1%). It totals gross settled, TDS deducted and the claimable credit, so that TDS shows up in your 26AS reconciliation and isn't silently written off as a fee. Treat it as your tax credit, not an expense.",
    "route": "/payments",
    "keywords": "tds 194-O marketplace gateway deduction 26AS credit amazon settlement Settlement TDS"
  },
  {
    "category": "GST & tax",
    "q": "How does Headroom handle TCS on sales (206C)?",
    "a": "TCS is the mirror of TDS - when you're the seller you collect extra tax on top of the sale and the customer's receivable is grossed up, then it sits in TCS Payable awaiting remittance. Supported sections include 206C(1H) sale of goods above the ₹50,00,000 aggregate (0.1%), scrap (1%), tendu leaves (5%) and timber/forest produce (2.5%). For no-PAN buyers §206CC applies the higher of twice the section rate or 5%. File the collected TCS via Books > Tax Filing > TDS Returns choosing form 27EQ.",
    "keywords": "TCS, 206C, 206C(1H), 206CC, sale of goods, scrap, 27EQ TCS"
  },
  {
    "category": "GST & tax",
    "q": "Is there a TDS calculator on the GST screen?",
    "a": "Yes - the Books GST tab has a 'TDS calculator' card alongside the GST tools. Pick the TDS section (it shows base rate, no-PAN rate and threshold), enter the gross amount, and tick/untick 'PAN available' (unticking applies the §206AA penal rate). Click 'Compute TDS' to see the rate, TDS amount and net payable. There's also a TDS deducted / base / count summary in the stat cards driven from your posted vouchers for the period.",
    "route": "/books",
    "keywords": "tds calculator section 206aa pan penal rate compute net payable TDS"
  },
  {
    "category": "GST & tax",
    "q": "How is monthly TDS on salary calculated?",
    "a": "TDS is not a flat percentage - it's annualized. Headroom projects the employee's full-year taxable salary, subtracts the standard deduction (₹75,000 new regime / ₹50,000 old), HRA exemption and Chapter VI-A declarations (old regime only), runs the slab + cess + 87A-rebate engine, then spreads the remaining tax across the months left in the year as a mid-year true-up: (annual tax − TDS already deducted) ÷ remaining months. So the per-month figure changes when declarations change or as the year progresses. The TDS u/s 192 tab on /payroll shows the computation.",
    "route": "/payroll",
    "keywords": "tds salary 192 annualized projection true-up standard deduction 87a regime TDS"
  },
  {
    "category": "GST & tax",
    "q": "Old regime or new regime - which one does payroll use?",
    "a": "The payroll year defaults to the NEW regime. The standard deduction (₹75,000 new / ₹50,000 old) applies in both, but HRA exemption and Chapter VI-A deductions (80C, 80D, 80CCD(1B) etc.) only reduce tax under the OLD regime - the new regime forgoes most exemptions. You set the regime per payroll year; the TDS projection recomputes against that regime. The CTC Optimizer, NPS Optimizer and Take-Home tabs on /payroll let you compare old vs new before locking it.",
    "route": "/payroll",
    "keywords": "old new regime tds standard deduction hra 80c chapter via TDS"
  },
  {
    "category": "GST & tax",
    "q": "How do I handle TDS or TCS on an invoice?",
    "a": "Two tools live on /invoices. The 'TDS & Round-off' tab helps you compute the customer's TDS deduction on a taxable amount and round the invoice off cleanly. The 'TCS u/s 206C' tab calculates Tax Collected at Source (including 206C(1H) on sale of goods) where applicable. TDS is deducted by your customer when they pay you, while TCS is collected by you on top of the invoice - use the right tab for each.",
    "route": "/invoices",
    "keywords": "TDS TCS 206C 206C(1H) round off deduction sale of goods TDS / TCS"
  },
  {
    "category": "GST & tax",
    "q": "Which TDS sections and rates does Headroom support?",
    "a": "The built-in sections cover what a small business actually hits: 194C contractors (1% individual/HUF, 2% others), 194J professional/technical fees (10%), 194H commission/brokerage (5%), 194I rent (10%, with 2% for plant & machinery), and 194Q purchase of goods above the ₹50,00,000 trigger (0.1%). No-PAN deductions fall to the §206AA penal rate of 20%. These live as dated, validated parameters so the rate that applied on the deduction date is the one used.",
    "keywords": "194C 194J 194H 194I 194Q, TDS rates, thresholds, sections TDS rates"
  },
  {
    "category": "GST & tax",
    "q": "How do I generate my quarterly TDS return file?",
    "a": "Go to Books (/books), open the Tax Filing tab, and stay on the TDS Returns sub-tab. Pick the Quarter (Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar), type the Financial year like 2025-26, choose the Form (26Q for non-salary TDS or 27EQ for TCS), and click 'Generate & download .txt'. It builds the fixed-width NSDL e-TDS/TCS flat file (caret-delimited, FH/BH/CD/DD/FT records) from the TDS rows captured in your books, which you then import into the TIN-RPU/FVU utility and validate before uploading to TRACES.",
    "route": "/books",
    "keywords": "e-tds, 24Q 26Q 27EQ, NSDL, RPU, FVU, quarterly statement, flat file TDS returns"
  },
  {
    "category": "GST & tax",
    "q": "Why does the e-TDS return fail with 'Deductor TAN is not set'?",
    "a": "The e-TDS statement and Form 16A are invalid without your TAN (Tax Deduction & Collection Account Number), so the generator throws TAN_NOT_SET if your company profile is missing it. Set your TAN (along with PAN, legal name and address) in your company/tenant profile, then re-run the TDS Returns generator in Books > Tax Filing. The file name itself is stamped with your TAN, e.g. 26Q_2025-26_Q1_<TAN>.txt.",
    "route": "/books",
    "keywords": "TAN, tenant profile, TAN_NOT_SET, deductor TDS returns"
  },
  {
    "category": "GST & tax",
    "q": "What's the difference between 24Q, 26Q and 27EQ?",
    "a": "24Q is salary TDS, 26Q is non-salary TDS (contractor/professional/rent/commission), and 27EQ is TCS. In the Books > Tax Filing > TDS Returns picker you'll see 26Q (non-salary TDS) and 27EQ (TCS) - these are driven off the TDS/TCS rows you withheld on purchases/payments and collected on sales. Salary TDS (24Q) is handled separately because it comes from your Payroll module, not from the books withholding rows.",
    "keywords": "24Q salary, 26Q non-salary, 27EQ TCS, forms TDS returns"
  },
  {
    "category": "GST & tax",
    "q": "How are challans grouped in the e-TDS file and is the deposit date correct?",
    "a": "The generator groups your withholding rows into one challan per (section, deposit-month) - exactly how a deductor actually deposits each section's monthly remittance. As a placeholder it stamps the deposit date as the 7th of the month following the deduction month (the CBDT due date) with zero BSR code and challan serial. You are expected to edit these to your actual challan date, BSR code and serial number inside the RPU before you validate the FVU - Headroom builds the import shape, it does not have your real challan details.",
    "keywords": "challan, BSR code, deposit date, 7th of month, monthly remittance TDS returns"
  },
  {
    "category": "GST & tax",
    "q": "Is FD or a liquid fund better for me after tax?",
    "a": "Open the Liquid vs FD tab on /treasury. Enter the amount, horizon in months, your tax slab, and the FD and liquid-fund rates; it shows gross gain, tax and net for each side and flags the winner. Since Budget 2023, debt-fund gains bought on/after 1-Apr-2023 are taxed at slab with no indexation - same as FD interest - so the winner comes down to rate and timing. The fund defers tax to redemption and lets you redeem T+1 without a break penalty.",
    "route": "/treasury",
    "keywords": "liquid fund vs FD, after tax, slab, debt fund tax, comparison, 2023 Treasury"
  },
  {
    "category": "GST & tax",
    "q": "Will I pay TDS on my FD interest, and how much?",
    "a": "Yes - banks deduct 10% TDS under Sec 194A once your FD interest crosses ₹40,000 in a year (₹50,000 for senior citizens). FD interest is also taxed at your slab overall. Headroom's Treasury tools (FD/RD Ladder, Liquid vs FD, Overview) all carry this note so you size deposits with the TDS threshold in mind. T-bill discount gains are taxed as interest income at your slab too.",
    "route": "/treasury",
    "keywords": "TDS, FD interest, 194A, 40000, 50000 senior, tax on FD Treasury"
  },
  {
    "category": "GST & tax",
    "q": "Can I save earmarked savings goals like a GST reserve or advance-tax bucket?",
    "a": "Yes - use the Goal Planner tab on /treasury. Click + Add to create a bucket (e.g. GST reserve, advance-tax, Diwali bonus, capex) with a target amount, deadline and assumed yield. It calculates the exact monthly contribution needed to hit each goal on time (accounting for growth) and shows a funded-% bar. Match each goal's deadline to your real outflow calendar - GST on the 20th, advance-tax in Jun/Sep/Dec/Mar, payroll month-end.",
    "route": "/treasury",
    "keywords": "goal planner, GST reserve, advance tax bucket, savings goal, earmark Treasury"
  },
  {
    "category": "GST & tax",
    "q": "Can I generate a UPI QR code without having a payment gateway account?",
    "a": "Yes - the UPI QR / Intent tab on /payments uses the open NPCI upi://pay spec, so it works with any UPI app and needs no gateway. Enter your payee VPA (e.g. yourbusiness@okhdfcbank), your name, an optional amount (leave blank to let the payer enter it) and a reference/order ID (tap Auto to auto-fill one). It renders a scannable QR and a copyable intent link, all on-device.",
    "route": "/payments",
    "keywords": "UPI QR intent npci upi://pay vpa no gateway scan to pay UPI"
  },
  {
    "category": "GST & tax",
    "q": "What commands can I text the WhatsApp bot to check my numbers?",
    "a": "On /whatsapp open the 'Chat commands' panel. Supported keywords include CASH (balance across accounts), RUNWAY (days of cash left), FORECAST (30-day projection in plain English), OVERDUE (invoices to chase), GST (next liability and due date), CREDIT (working-capital eligibility), PAUSE (mute alerts for 24 hours) and HELP (list all commands). You just reply with the word in your Headroom WhatsApp chat and get an answer in seconds. Tap any command in the list to copy it.",
    "route": "/whatsapp",
    "keywords": "commands CASH RUNWAY FORECAST OVERDUE GST CREDIT PAUSE HELP WhatsApp"
  },
  {
    "category": "GST & tax",
    "q": "Which WhatsApp alerts can I turn on or off, and where?",
    "a": "On /whatsapp under 'Alert preferences' you toggle six types: Low cash alert, Overdue invoice, GST filing reminder (7 days and 1 day before), Credit offer available, Payroll reminder (3 days before), and Weekly summary (Monday morning brief). Each toggle saves to your morning brief immediately and persists across devices. Note: if your role is read-only you'll see 'Your role has read-only access' and the toggles won't change.",
    "route": "/whatsapp",
    "keywords": "alert preferences toggle low cash overdue GST payroll weekly mute WhatsApp"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I add a receivable manually if the invoice isn't in the system yet?",
    "a": "On /receivables, click Add Invoice (top-right, hidden for read-only viewers). Fill customer name and amount (both required), optional invoice number, description, invoice date, and due date (defaults to +30 days). The status is set automatically: overdue if the due date is already past, otherwise pending. Manually-added invoices live in the local KV store; for invoices that should hit your double-entry Books, raise them in /invoices instead so they flow through the ledger.",
    "route": "/receivables",
    "keywords": "add invoice manually receivable create due date customer amount Adding invoices"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I track a customer advance or retainer and adjust it against invoices?",
    "a": "Use the 'Advance/Retainer' tab on /invoices to record money received in advance from a customer and adjust it against their invoices, showing how much of the advance is still unadjusted. In Books this is the allocation/auto-apply mechanism: an advance receipt carries unapplied party-side credit that FIFO-settles the customer's oldest open invoices when you run auto-apply.",
    "route": "/invoices",
    "keywords": "advance retainer adjust unadjusted prepaid allocate auto-apply Advances / retainer"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I see my receivables aging buckets?",
    "a": "The 'Ageing Buckets' tab on /invoices groups your unpaid invoices into current / 30d / 60d / 90d+ buckets so you can see how much money is stuck and how stale it is. The same aging drives the colour-coded Due column and the Auto-Collect overdue list. For a dedicated chasing workflow with dunning ladders, use /collections.",
    "route": "/invoices",
    "keywords": "ageing aging buckets 30 60 90 days receivables outstanding overdue Aging / receivables"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How are the aging buckets calculated and why is an invoice in the wrong one?",
    "a": "Aging is computed purely from days past the invoice's due date (today minus due date). On /receivables the buckets are Current (not yet overdue), 1-30 days, 31-60 days, and 60+ days overdue. On /collections there is an extra split: Current, 1-30, 31-60, 61-90, and 90+ days. If a customer lands in the wrong bucket, the due date on the invoice is wrong - fix it in /invoices and the bucket re-sorts automatically. Note the two screens label the most-severe band slightly differently (Receivables groups everything beyond 60 days; Collections separates 61-90 from 90+).",
    "route": "/receivables",
    "keywords": "ageing buckets 30 60 90 days overdue current due date Aging buckets"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I filter the collections list to just the 90+ day accounts?",
    "a": "Yes. On /collections, the Aging summary shows five clickable tiles (Current, 1-30d, 31-60d, 61-90d, 90+). Click any tile to filter the list below to only those accounts; click it again to clear back to All. There is also a Filter dropdown (top-right of the table) with the same options. The list is always pre-sorted most-overdue-first so you work the riskiest accounts top-down.",
    "route": "/collections",
    "keywords": "filter aging bucket 90 days overdue sort Aging buckets"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Does it watch for suspicious or fraudulent payments?",
    "a": "Yes, heuristically. Alerts Centre > Fraud / Anomaly (/alerts) scans your transactions for outsized payments (statistical outliers beyond mean + N·σ, with a tunable sensitivity slider), brand-new payees first seen in the last 30 days, round-trips where money flows out and back to the same party, and any transaction you manually flagged. Inter-account transfers are excluded. Treat it as a review queue, not proof of fraud - a large legitimate vendor settlement or a genuine new supplier will also show up.",
    "route": "/alerts",
    "keywords": "fraud anomaly suspicious payment outlier new payee round trip review Alerts"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I require sign-off above a spend amount (approval limit)?",
    "a": "Open /automation, Approval Chains tab. The top 'Live Approval Engine' card is connected to your Books ledger: pick an entity type (PAYMENT, SALES, PURCHASE, JOURNAL, EXPENSE), set 'Requires approval ≥ (₹)', choose the approver role (owner/admin/finance/accountant) and click Create rule. From then on, posting a document above that amount queues it in the Pending approvals table where an authorised user clicks Approve or Reject. The lower 'Approval-Chain Builder' card is design/preview only - it shows how many current outflows would route through a chain but does not gate posting.",
    "route": "/automation",
    "keywords": "approval threshold sign-off maker checker payment limit gate Approval limits"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can large invoices require approval before they go out?",
    "a": "Yes. The 'Approval' tab on /invoices gives you a maker-checker queue where an invoice above a threshold sits as pending until approved or rejected. At the ledger level, the Books posting engine enforces this hard: if an approval rule exists for invoices and the amount crosses the threshold, the document will refuse to post with a 'needs approval' error until an APPROVED record exists for it (you can override only with the explicit skip-approval flag). Configure the rules in Automation; see /automation.",
    "route": "/invoices",
    "keywords": "approval maker checker threshold authorize pending workflow needs approval Approval workflow"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I require sign-off before a large payment goes out (maker-checker)?",
    "a": "Yes, via the Approval Policy card in Organization → Roles & Access. Set a rupee threshold (e.g. ₹50,000), choose which role must approve (Finance, CA, Sales or Ops), add an optional note, and click 'Add rule'. Payments above that amount then need that role's sign-off. Rules are listed lowest-to-highest threshold and can be deleted with the trash icon. With no rules, every payment is auto-approved.",
    "route": "/organization#access",
    "keywords": "approval policy maker checker payment threshold sign off approve limit Approvals"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How does attendance affect pay (LOP)?",
    "a": "On /hrms, the Attendance tab, pick an employee and month and mark each day Present, Absent, Leave, Half day, WFH or Holiday. Absent counts as 1 LOP day, an absent half-day as 0.5, and unpaid (LWP) leave types as 1 - paid leave types do not reduce pay. Payment days = working days − LOP, and any component flagged Prorate is scaled by payment_days/working_days. The summary strip shows working days, LOP days and payment days, which is exactly what the slip and run consume.",
    "route": "/hrms",
    "keywords": "attendance lop loss of pay absent half day present payment days prorate Attendance"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Before I make big changes, how do I take a backup of everything?",
    "a": "On Data & Import (/data) open the 'Backup & Export' tab. 'Full backup (JSON)' downloads a snapshot of your firm, bank accounts, transactions, invoices, loans, obligations and feature data; 'Transactions (CSV)' exports just transactions. You can also set a cadence reminder (daily/weekly/monthly) and it keeps an export history log. The export is a one-click manual run done in your browser - nothing is uploaded to a server.",
    "route": "/data",
    "keywords": "backup export JSON CSV snapshot save data cadence reminder before changes Backup"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Should I use NEFT, RTGS, IMPS or UPI for a payment?",
    "a": "The Payment Rail tab on /banking picks for you. Enter the amount and tick whether it must settle instantly. It recommends a rail and shows a comparison: UPI (≤₹1L, free, instant, 24x7), IMPS (≤₹5L, ~₹5-15+GST, instant), NEFT (no upper limit, ~₹2-25+GST, half-hourly batches - cheapest for non-urgent bulk) and RTGS (₹2L minimum, real-time, ~₹20-50+GST, for large urgent transfers). Limits and charges are indicative per RBI norms; your bank may cap UPI/IMPS lower or waive online NEFT/RTGS fees.",
    "route": "/banking",
    "keywords": "neft rtgs imps upi payment rail which to use limits cutoff cost instant batch Banking - payment rails"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I issue per-customer virtual account numbers and track cheques?",
    "a": "On /banking, the Virtual Accounts tab issues a dedicated virtual account number per customer so every inflow auto-identifies who paid (no more guessing from cryptic NEFT/UPI narrations); log the expected amount and mark it received. The Cheque Register tab tracks issued and received cheques (including post-dated) through their lifecycle - click a status chip to advance issued → presented → cleared → bounced → cancelled - and summarises pending outflow and bounced counts.",
    "route": "/banking",
    "keywords": "virtual account number per customer collection cheque pdc register lifecycle bounced cleared Banking - virtual accounts & cheques"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I create many invoices at once from a CSV?",
    "a": "Yes - the 'Bulk (CSV)' tab on /invoices lets you paste/upload rows (customer, GSTIN, description, qty, rate, GST, due date), validates each, and creates them in one batch. The Books backend bulk-creates each row as its own posted sales/purchase voucher in its own transaction, so one bad row never rolls back the rows that posted cleanly - you get a created/failed count with per-row errors. It resolves the customer ledger by name, creating it under Sundry Debtors if it doesn't exist.",
    "route": "/invoices",
    "keywords": "bulk csv import many invoices batch upload errors Bulk invoicing"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I bill my clients for retainers and filing fees?",
    "a": "Open the Billing tab on /advisor. Create a New Invoice - pick the client, enter the amount and a description like \"Monthly retainer - Jun 2026\", and it tracks Total Invoiced, Outstanding and Collected. Mark each invoice Sent and then Paid as money comes in (collect via UPI). This is your own practice billing, separate from the client's own invoicing.",
    "route": "/advisor",
    "keywords": "billing, invoice clients, retainer, practice fees, collect fees, ca billing CA · Billing clients"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I chase overdue invoices and send reminders?",
    "a": "Open the 'Auto-Collect' tab on /invoices (it shows a red badge with the overdue count). It lists every overdue invoice by aging bucket (30d / 60d / 90d+) and lets you tap 'Remind' per invoice or 'Remind All' to send a WhatsApp message with a one-tap UPI payment link to each. You can also hit the WhatsApp (message) icon on any overdue row in the main table. For a fuller money-chasing worklist with dunning ladders, use the Collections module at /collections.",
    "route": "/invoices",
    "keywords": "overdue reminder dunning chase whatsapp collections aging Collections"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "What's the difference between Receivables and Collections - they look similar?",
    "a": "Receivables (/receivables) is the tracking + analytics home: aging summary, full invoice list/kanban, add/mark-paid/delete invoices, cash application, factoring, risk scoring and 25+ analytical tabs. Collections (/collections) is the action-focused chase cockpit: prioritised overdue worklist, one-tap WhatsApp/UPI reminders, mark-contacted, the dunning ladder, promise-to-pay, DSO and statement tools. Think Receivables = where invoices live and age; Collections = where you go to recover the cash. Both read the same invoice data, so fixing a due date or marking paid in one reflects in the other.",
    "route": "/collections",
    "keywords": "receivables vs collections difference which screen overlap AR Common confusion"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "What happens after I accept a loan offer?",
    "a": "When you click Accept and confirm via the Key Fact Sheet, Headroom hits the backend to disburse and creates a durable loan, then takes you to the Active Loans tab. There you record repayments - enter an amount (it pre-fills your EMI) and submit to shrink the outstanding balance and roll the next payment date forward. The loan also flows into the Debt Manager (/debt) where you can track total outstanding, DSCR, and run prepayment / refinance maths.",
    "route": "/credit",
    "keywords": "accept offer, disburse, active loans, repayment, EMI, KFS Credit / loans"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I block invoices to a customer who's over their credit limit?",
    "a": "Yes. The 'Credit Limit' tab on /invoices lets you set a limit and an overdue-days-hold per customer. The Books engine enforces it on posting: when a customer has a credit limit set, raising an invoice that would push their outstanding (current dues + this invoice) over the limit is blocked with a 'credit limit exceeded' error, unless you explicitly override it. This stops you extending more credit to a slow payer than you intended.",
    "route": "/invoices",
    "keywords": "credit limit hold block customer outstanding override exceeded Credit limit"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "What date and amount format do the CSV templates expect?",
    "a": "Templates accept dates as DD/MM/YYYY (also YYYY-MM-DD and DD-MM-YYYY are handled), and negative amounts are treated as expenses while positive amounts are income/revenue. You can grab ready-made templates from the 'CSV templates' card on /data Overview - 'Transactions' (date, amount, description, counterparty) and 'Invoices' (customer, amount, invoice_number, invoice_date, due_date, status). Filling these in first avoids mapping headaches.",
    "route": "/data",
    "keywords": "CSV date format DD/MM/YYYY amount negative expense template columns transactions invoices CSV format"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I know which customers are likely to pay late before extending credit?",
    "a": "Several tabs score this. On /receivables, Customer Risk Scoring rates each customer 0-100 (higher = safer) from pay-rate (45%), payment-speed (30%) and open-overdue health (25%), banded Low/Medium/High/Severe, sorted by exposure - use the bands to set credit limits and hold thresholds. The Overview also shows a Customer Payment DNA ranking. On /collections, Risk Score classifies customers High/Medium/Low risk from overdue rate, average days late and recency, and Profitability grades them A/B/C. Use these to decide WHO to chase first and who to put on credit-hold.",
    "route": "/receivables",
    "keywords": "customer risk score credit limit late payer payment DNA reliability who to chase Customer risk"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "i already paid but they're still chasing me - what do i do?",
    "a": "Send the business your payment proof: the UTR / transaction reference from your UPI or bank app, the date and the amount. They mark your invoice as paid on their side, which clears it from their overdue list and stops further reminders. Until they record it, their collections screen still shows you as outstanding, so the reference number is what closes the loop fastest.",
    "keywords": "already paid still chasing reminder proof utr reference double Customer/Vendor · Already paid"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "how will i know the business actually received my money?",
    "a": "Two ways: your own UPI/bank app shows the debit and a success status with a UTR immediately, and the business confirms once they mark the invoice paid on their end (which posts a receipt against your account). If you've paid but heard nothing in a day or two, forward your transaction reference and ask them to confirm - settlement to their account can take a short while, especially on cards.",
    "keywords": "received money confirm settled success status utr did it go through Customer/Vendor · Confirming receipt of payment"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "why is there an extra charge added on top of my bill on this payment page?",
    "a": "Some businesses pass the payment-processing fee (MDR) to the customer as a convenience charge, which is why the total on a card/hosted link can be a bit higher than the invoice. Paying by UPI usually avoids this, since UPI is zero-fee for most merchant payments - so if you see a card surcharge, ask if you can pay by UPI instead to skip it.",
    "keywords": "extra charge convenience fee surcharge mdr higher amount why more Customer/Vendor · Convenience fee"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "the payment link says expired or won't open, now what?",
    "a": "Payment links can be set to expire on a date by the business. If yours has lapsed or won't load, just ask them to send a fresh link or QR - they can regenerate it in seconds. Don't pay to any random account someone suggests as a 'workaround'; only pay against an official re-sent link or their known bank/UPI details.",
    "keywords": "expired link not working invalid broken regenerate fresh Customer/Vendor · Link expired"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "i got a payment link on whatsapp, how do i actually pay it?",
    "a": "Just tap the link from your phone. If it is a UPI link it opens GPay, PhonePe, Paytm or any UPI app with the payee and amount already filled in, so you only confirm and enter your PIN. If it is a hosted payment link (a web URL), it opens a secure page where you can pay by UPI, card or netbanking. Tip: tapping a UPI link on a desktop won't work, so open it on the phone where your UPI app lives, or scan the QR instead.",
    "keywords": "pay link whatsapp upi tap how to pay invoice Customer/Vendor · Paying an invoice"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "i keep getting payment reminders on whatsapp, why?",
    "a": "The business runs its overdue invoices through a reminders/dunning tool, so an unpaid invoice gets a friendly nudge, then a firmer reminder, then a final notice as it ages. Each message is pre-filled by them and sent manually - it's not an automated bot spamming you. The simplest way to stop them is to clear the invoice or, if you've already paid, reply with your UPI reference so they can mark it paid.",
    "keywords": "reminder nudge chasing whatsapp why overdue stop dunning Customer/Vendor · Payment reminders"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "i overpaid / want a refund - how does that work?",
    "a": "Refunds are handled by the business, not by you. Contact them with your payment reference and reason; they log it in their payments/refunds tracker and process it back to your original payment method. Keep your UPI/card transaction reference handy, as that's what they need to trace and reverse the payment.",
    "keywords": "refund overpaid return money back reverse cancel Customer/Vendor · Refund"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "is this payment link legit or a scam? i don't want to get cheated",
    "a": "Before paying, check that the payee name shown in your UPI app or on the payment page matches the business you actually deal with - a UPI link carries the seller's UPI ID (like name@bank) and their business name. A hosted link is a Razorpay secure page (the URL will be a razorpay.com / rzp.io address). If the name doesn't match who invoiced you, or anyone asks you to pay to a personal account that differs from past payments, stop and call the business directly before paying.",
    "keywords": "scam fraud safe legit verify trust real genuine Customer/Vendor · Trust & safety"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "what is this qr code they sent me - do i scan it or what?",
    "a": "Open any UPI app (GPay/PhonePe/Paytm), tap Scan, and point it at the QR. The business's UPI ID, name and the invoice amount are baked into the QR, so the app pre-fills everything and you just confirm and enter your UPI PIN. If you got the QR as an image on WhatsApp, save it and use your UPI app's 'scan from gallery' option.",
    "keywords": "qr code scan upi how to pay gallery Customer/Vendor · UPI QR"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "where can i see the actual invoice, not just the payment link?",
    "a": "The invoice itself comes from the business - there's no customer login or portal for you to browse. Ask them to share the invoice PDF (they generate it from their invoicing screen) along with the payment link or QR. If you only received a link, reply and request the matching invoice copy for your records.",
    "keywords": "see invoice copy pdf where portal login download bill Customer/Vendor · Where is the invoice"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "i don't use upi - can i pay by card or netbanking instead?",
    "a": "If the business sent a hosted payment link (a web URL, not a upi:// link), that page usually accepts UPI, cards and netbanking, so just pick card or netbanking there. If all you got is a plain UPI link or QR, ask them to send a hosted card/netbanking link or to share bank account details for a NEFT/IMPS transfer instead.",
    "keywords": "card netbanking neft no upi alternative debit credit bank transfer Customer/Vendor · Which app / no UPI"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Why do my invoices also show up in the Dashboard, Collections and Working Capital?",
    "a": "The Invoices page mirrors your backend invoices into one shared store so the analytics engine, Collections, Working Capital and Dashboard all read a single unified accounts-receivable list. Cancelled invoices are dropped from the mirror, and an invoice past its due date is treated as overdue. That's why a wrong due date or an unpaid-but-actually-paid invoice will throw off your runway, aging and overdue figures everywhere - keep statuses and due dates current.",
    "route": "/invoices",
    "keywords": "dashboard collections working capital shared store receivables overdue sync Data / where shown"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Why is my forecast or health score empty or wrong?",
    "a": "These tools are only as good as your data. The forecast engine needs transaction history (you'll be blocked with no transactions), runway and burn come from your transactions, receivables projections need invoices marked paid/unpaid with due dates, and obligations must be dated. For accurate health, working-capital and CFO-brief figures, connect a bank account, tag transactions with a counterparty and category, and keep invoices and obligations current - empty or untagged data produces empty or skewed results.",
    "route": "/forecast",
    "keywords": "empty wrong forecast health score no data transactions invoices tag accuracy Data quality"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "A payment got declined - how do I know if I should retry it?",
    "a": "Open the Decline Decoder tab on /payments and enter the gateway/acquirer decline code or reason. It maps common Indian-gateway codes to plain-English meaning, the fix, and whether a retry is safe. The key rule it enforces: never hammer retries on a hard decline (expired/revoked card, or RISK_DECLINED where the bank flagged fraud) - ask the customer to authenticate in their bank app first. Codes vary slightly by acquirer, so the settlement report carries the canonical reason.",
    "route": "/payments",
    "keywords": "decline code retry hard soft risk declined fraud authenticate decoder acquirer Declines / retries"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Where do I track an invoice the customer is disputing?",
    "a": "Use the 'Dispute Tracker' tab on /invoices to log a disputed invoice with the amount, reason, date raised and a status (open / in-review / resolved / written-off) plus the resolution. This keeps a paper trail for contested receivables so a stuck invoice isn't silently counted as collectible while it's under discussion.",
    "route": "/invoices",
    "keywords": "dispute disputed invoice contested write off resolution tracker Disputes"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "A customer is disputing an invoice - how do I park it instead of chasing?",
    "a": "Use the Disputes tab on /collections (Dispute Logger) or the Dispute Tracker on /receivables to log the disputed invoice, reason and status so you don't keep firing dunning reminders at an account that's genuinely contested. When a debt is truly unrecoverable, /receivables has a Write-Off Policy tab and /collections has a Bad-Debt provision tab to estimate expected credit loss. Settle disputes before escalating to the Final notice / Pre-legal dunning levels.",
    "route": "/collections",
    "keywords": "dispute logger contested invoice write off bad debt provision ECL Disputes & write-off"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "What's the difference between draft, sent, paid and cancelled invoices?",
    "a": "An invoice's status drives what actions you can take on /invoices. Draft and Sent are open/unpaid; clicking the email (Send) icon moves a draft to Sent and emails the customer (only shown when the invoice has an email and isn't already sent). Hitting the green tick marks it Paid; Paid and Cancelled invoices are terminal and lose their action buttons. Use the All / Pending / Paid tabs to filter, and note that cancelled invoices are excluded from the receivables totals.",
    "route": "/invoices",
    "keywords": "status draft sent paid cancelled mark paid lifecycle Document lifecycle"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I see my DSO (Days Sales Outstanding) and whether it's getting worse?",
    "a": "The DSO Trend tab on /collections shows Current DSO, previous-month DSO, the month-on-month change (red if rising, green if falling), and a 6-month bar chart. DSO per month is approximated as (open AR for that month / that month's sales) x 30 days, bucketed by invoice date. Below the chart is a Worst Payers table ranking your slowest customers by average days past due on their open invoices, with their outstanding amount. A rising trend means cash is taking longer to collect.",
    "route": "/collections",
    "keywords": "DSO days sales outstanding collection period trend worst payers DSO"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "What is the dunning ladder and at what intervals does it escalate?",
    "a": "The Dunning tab on /collections runs a staged reminder ladder keyed off each invoice's days overdue: D+1 (Gentle nudge / soft tone), D+7 (Reminder / firm), D+15 (Follow-up / firm), and D+30 (Final notice / final tone). Each overdue invoice is placed at the highest threshold it has crossed. The four tiles show how many accounts sit at each stage; the table lists each account with its ladder step and a Send button that opens the right-tone message in your chosen channel (WhatsApp/Email/SMS).",
    "route": "/collections",
    "keywords": "dunning ladder D+1 D+7 D+15 D+30 escalation tone final notice Dunning ladder"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "If I run dunning twice in a day will it spam the same customer?",
    "a": "No. The backend dunning run (POST /api/dunning/run) is idempotent: it records one run per invoice only when that invoice has crossed to a level at least as severe as its last recorded level. Re-running on the same day skips bills already at their level (counted as skippedAlready) and never regresses a bill to a lower rung. You can also pass dryRun to preview the letters that would be generated without writing anything. Interest accrues as principal x rate/100 x daysOverdue/365 (simple, per annum).",
    "route": "/collections",
    "keywords": "dunning run idempotent duplicate spam dry run interest accrual Dunning ladder"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I avoid raising a duplicate invoice?",
    "a": "The 'Duplicate Check' tab on /invoices scans your invoices and flags likely duplicates (same customer and amount, or repeated references) so you can catch a double-billing before it reaches the customer or your books. There's also a paste-dedupe utility in the Tools area for spotting repeated invoice numbers or GSTINs in pasted data.",
    "route": "/invoices",
    "keywords": "duplicate invoice double billing detect same amount customer repeated Duplicate detection"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "how do I make sure a vendor isn't over-billing us before I pay",
    "a": "Run the invoice through 3-Way Match in /vendors (or /suppliers): it checks PO quantity/rate vs goods received vs the invoice and surfaces over-billed exposure in rupees before you schedule payment. Pair it with the Duplicate Detector tab so the same bill isn't entered twice, and the GST-2B Match in /suppliers so ITC mismatches surface before you file GSTR-3B.",
    "route": "/vendors",
    "keywords": "3 way match over billing po goods received invoice verify vendor pay Finance manager · 3-way match"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "where do I approve the payments waiting on me?",
    "a": "The Dashboard surfaces a pending-approvals queue for finance/owner roles - that's your daily approval worklist on /dashboard. To set the policy (who signs off above what amount), use /automation Approval Chains: set 'Applies above (Rs)' threshold, add approver steps as Any one / All must approve, Save chain, and read the 'current outflows would route here' count to sanity-check the threshold. Note: Automation previews and routes, it does not yet auto-execute the payment.",
    "route": "/dashboard",
    "keywords": "approve approvals pending queue sign off authorization payment approval chain Finance manager · Approvals"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "can it match bank receipts to open invoices for me?",
    "a": "Yes - /receivables has a Cash Application tab that auto-matches bank credits (revenue inflows from your Transactions) to open invoices by customer name and amount. Fill the Invoice number and exact Amount on each invoice so matching is clean and one-click instead of manual. In Books, the Reconcile tab does the equivalent for bank-ledger lines against posted vouchers.",
    "route": "/receivables",
    "keywords": "cash application match receipts open invoices auto match bank credit Finance manager · Cash application"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "i'm worried we paid the same invoice twice - how do I check?",
    "a": "Open /security Duplicate Payments and drag the window slider (default 7 days) - each red group shows the recoverable rupee amount if it's a genuine double-pay, so chase those refunds first. /spend has a similar 'Duplicate / Anomaly Payment Detector' (same payee, same amount within 5 days). These are heuristics, not proof - always confirm against the actual invoice before clawing money back.",
    "route": "/security",
    "keywords": "duplicate payment double paid twice overpaid claw back refund Finance manager · Duplicate payments"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "can I build a custom report grouping invoices by customer without Excel",
    "a": "Yes - /insights has a no-SQL Query builder. Pick the 'Invoices & receivables' dataset, Add column for the amount with sum, tap the Group by chip for party_name, Order by descending, and Run to instantly see your biggest customers or who owes most. Save it as a chart and pin it to a custom dashboard that re-runs live each time you open it.",
    "route": "/insights",
    "keywords": "custom report query builder group by customer pivot dashboard no excel Finance manager · MIS / board pack"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "who hasn't paid us yet?",
    "a": "Open /collections - it loads every unpaid invoice sorted most-overdue first, with KPIs for Total overdue, Accounts overdue, Avg days overdue and Critical 60d+. The Aging row (Current, 1-30, 31-60, 61-90, 90d+) is clickable to filter to a bucket. For the same data with deeper analytics (DSO trend, Customer Payment DNA, collection forecast) use /receivables instead.",
    "route": "/collections",
    "keywords": "overdue outstanding unpaid debtors who owes money aging Finance manager · Receivables"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "how do I chase a customer for payment without typing out the message",
    "a": "In /collections find the customer and tap Remind, choose a channel (WhatsApp, Email or SMS) and a tone (Friendly nudge, Firm reminder or Final notice). The message auto-fills with the amount and a UPI pay link; tap Send now and it opens prefilled in your own WhatsApp/email/SMS. Tap Mark contacted afterwards so you don't double-chase the same day.",
    "route": "/collections",
    "keywords": "reminder dunning nudge chase whatsapp send payment reminder Finance manager · Receivables"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "how much of our outstanding will actually come in over the next 30 days",
    "a": "Open /receivables and use the Collection Forecast tab - it projects next-30-day cash from your open invoices. The forecast prices each invoice by a real pay-probability that drops the more overdue it is, and Customer Payment DNA ranks who actually pays on time vs stalls. Keep invoices marked Paid as money lands so the aging buckets, DSO and forecast stay accurate.",
    "route": "/receivables",
    "keywords": "collection forecast expected receipts next 30 days dso payment dna Finance manager · Receivables forecast"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I get an AI explanation of my forecast?",
    "a": "Yes - once a forecast exists, an 'Ask AI' button appears top-right on /forecast. It sends your balance, monthly burn, P10 runway and active scenario to a cash-flow advisor model and returns a concise 3-4 sentence explanation with two actionable suggestions in INR terms. If it says 'AI unavailable', the backend ANTHROPIC_API_KEY isn't set. For mobile, a 'Remind me' button can also schedule on-device reminders one day before each upcoming obligation.",
    "route": "/forecast",
    "keywords": "ai explain forecast ask advisor suggestions reminder obligation notify Forecast"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How does Headroom detect duplicate payments and how much can I recover?",
    "a": "Open /security → 'Duplicate Payments'. It groups outgoing payments with the same payee + same amount and flags any pair falling inside a window you set with a slider (default 7 days). Each red group shows the count of possible overpays and an estimated recoverable rupee figure (amount × extra copies). It is a heuristic 'suspect' list - confirm against the actual invoices and the vendor before clawing back. The Overview tab's 'Duplicate Suspects' counter gives a quick top-level read.",
    "route": "/security",
    "keywords": "double pay duplicate payment recover overpay refund window Fraud detection"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How is gratuity calculated?",
    "a": "Gratuity follows the Payment of Gratuity Act: 15/26 of last-drawn Basic (≈ 15 days' wages per completed year on a 26-day month) × completed years of service, vesting only after 5 continuous years and capped at ₹20,00,000. More than 6 months counts as a full year. The /hrms backend reads the employee's date_of_joining and last assigned structure's Basic; the Gratuity tab on /payroll has a provision calculator across your staff. Employees with under 5 years show ineligible.",
    "route": "/payroll",
    "keywords": "gratuity 15/26 5 years 20 lakh payment act vesting provision Gratuity"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "how does attendance affect the salary that gets paid",
    "a": "Mark it in the /hrms Attendance tab: pick an employee and month, then set each day Present/Absent/Leave/Half day/WFH/Holiday. The summary strip shows LOP days and Payment days, which directly prorate every salary component you ticked as Prorate. Always finalise attendance BEFORE running payroll - a month can only be run once, so absences must flow in first.",
    "route": "/hrms",
    "keywords": "attendance, LOP, loss of pay, proration, payment days, mark present absent HR/Payroll admin · Attendance"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "an employee is leaving, how do I do their full and final settlement",
    "a": "Open the F&F Settlement tab on /payroll. It computes the settlement for the chosen employee - leave encashment (gross ÷ 26 per day on the days you enter), gratuity if 5+ years of service, notice pay or recovery (with a checkbox if notice was waived by the employer), less any outstanding salary advance - giving the Net Payable, which you can download. Pair it with the Notice Recovery and Leave Encashment tabs if you need to refine those numbers.",
    "route": "/payroll",
    "keywords": "full and final, FnF, settlement, exit, leaving employee, final pay, last working day HR/Payroll admin · Full and final"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "can I require a second person to approve large payments?",
    "a": "Yes - on /organization → Roles & Access, use the Approval Policy card to build maker-checker rules: enter a rupee threshold (e.g. 50,000), choose which role must approve above it, add an optional note, and click Add rule. Rules sort by amount and any payment crossing a threshold then needs that role's sign-off. With no rules, every payment is auto-approved. This pairs with the Security page's Separation of Duties tools.",
    "route": "/organization",
    "keywords": "maker checker approval limit second approver dual control payment authorization threshold IT / Admin · Approval controls"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "how do I keep an eye on suspicious payments and vendor bank changes?",
    "a": "The /security page is the fraud watchtower over your existing ledger. The Overview counters flag Payment Anomalies, Duplicate Suspects and New Payees; open Vendor Bank Change to record each vendor's account/IFSC so a later change turns red (catches email-compromise reroutes), Under-Limit Splitting to catch payments kept just under your approval limit, and Monitoring Rules to add your own if-then watches. Every flag is a suspect to verify, not a verdict.",
    "route": "/security",
    "keywords": "fraud detection suspicious payments vendor bank change duplicate anomaly monitoring rules IT / Admin · Fraud & monitoring"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Does Headroom remind me to rotate passwords / API keys?",
    "a": "Yes - /security → 'Key Rotation' lets you keep a living record of when credentials and API keys were last rotated so you can spot ones overdue for a refresh. It is a tracker you maintain (a control record), not an automatic key-rotation service. Pair it with the IP / Device Allowlist and Data-Export Audit tabs in the same module for a fuller hygiene picture, and run the Security Checklist tab to confirm the basics are in place.",
    "route": "/security",
    "keywords": "rotate password api key credential refresh secret expiry reminder Key rotation"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can Headroom apply late fees or interest on overdue invoices?",
    "a": "Use the 'Late-Fee/Interest' tab on /invoices. It computes interest on overdue invoices based on the days overdue and a rate (the Payment Terms Library carries a late-rate % p.a. per term, e.g. 18% or 24% for due-on-receipt). It shows you what to add; you then raise a debit note or a fresh charge for the interest amount.",
    "route": "/invoices",
    "keywords": "late fee interest overdue penalty rate per annum debit note Late fees"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I charge interest on overdue invoices and how much can I claim?",
    "a": "The Late Interest tab on /collections computes claimable interest on every overdue invoice using a rate slider (0-36% p.a., default 18%): interest = principal x rate/100 x daysOverdue/365. It totals overdue principal, interest claimable, and overdue-account count. For India-specifics: under the MSMED Act, if you're a registered Micro/Small enterprise you can claim interest at three times the RBI bank rate (compounded monthly) on payments beyond 45 days - check your Udyam status in the compliance/MSME tools. The Interest Invoice tab can turn accrued interest into a billable line. Treat these figures as the amount you may claim, not an auto-posted charge.",
    "route": "/collections",
    "keywords": "late payment interest MSME MSMED 45 days RBI rate claimable overdue Late interest / MSME"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "On the Collections screen, what does the 'Live' vs 'Local' toggle mean?",
    "a": "Collections tries to load real outstanding receivables from the backend (GET /api/collections/pending), which carries the canonical invoice id needed for UPI links. When that succeeds the refresh button shows Live; if it fails it silently falls back to your local KV-derived invoices and shows Local. Click the refresh button to reload from the server. Either way the numbers are real outstanding receivables - Live just means they're coming from the server ledger rather than the local fallback.",
    "route": "/collections",
    "keywords": "live local backend pending receivables refresh sync server Live vs local data"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I get paid faster on overdue invoices?",
    "a": "Collections shows everyone who owes you, aged into buckets. Set up reminder ladders that nudge customers over WhatsApp / UPI / email, track promise-to-pay, and send one-tap customer statements. It's the fastest way to pull in cash that's stuck in receivables.",
    "route": "/collections",
    "keywords": "collections overdue reminders whatsapp upi get paid receivables dso Money"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I stamp a doorstep collection with GPS so there's no dispute about whether it happened?",
    "a": "Yes. In Field & Offline > Field Collection (/field), enter the customer (pick from your known-customer list so it posts to the right ledger account), amount and mode (Cash/UPI), then tap 'Add GPS stamp'. The browser asks for location permission and records the coordinates and a verifiable timestamp against the entry - useful proof against fake-collection disputes. If the device has no GPS or you decline permission, the collection still records, just without the stamp.",
    "route": "/field",
    "keywords": "GPS location collection doorstep proof dispute timestamp field Offline / field"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How does the kirana quick-bill work and can I collect over UPI from it?",
    "a": "Field & Offline > Kirana Quick-Bill (/field) is counter-speed billing: add item, qty and price line by line, and it totals instantly. Enter your UPI ID once (e.g. merchant@upi) and it generates a 'Collect ₹X via UPI' deep link that opens any UPI app pre-filled with the amount. Tap 'Save bill to queue' to drop the sale into the offline queue, which posts as revenue on the next sync. It works fully offline - the UPI link is built locally on the device.",
    "route": "/field",
    "keywords": "kirana quick bill UPI counter pos collect offline Offline / field"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "who owes me money and how do I get them to pay?",
    "a": "Open /collections - it pulls every unpaid invoice, sorts customers by how overdue they are (Current, 1-30, 31-60, 61-90, 90d+) and shows Total overdue. Tap Remind on a customer, pick a channel (WhatsApp/Email/SMS) and tone (Friendly nudge, Firm reminder, Final notice), and Send now opens it prefilled. Work the list top-down - recoveries drop below 40% after 90 days - and tap Mark contacted so you don't double-chase.",
    "route": "/collections",
    "keywords": "chase payment, overdue, receivables, customers owe me, get paid Owner · Collections"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "how do I bill a customer and get them to pay fast?",
    "a": "Open /invoices, click New Invoice, fill the customer's name, GSTIN, WhatsApp number, GST rate and due date, add line items, then Create. Use the row icons to Download the PDF, Send (emails it), or the QR icon to generate a UPI pay link the customer scans to pay in one tap. Always enter the WhatsApp number - reminders prefer WhatsApp where 80% of Indian buyers actually read messages - and always set a due date or it never shows as overdue.",
    "route": "/invoices",
    "keywords": "create invoice, bill customer, get paid, upi qr, payment link Owner · Getting paid"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "am I about to pay the same vendor twice or pay a fake account?",
    "a": "Open /security - it scans your payments and flags duplicate vendor payments, a fraudster silently changing a known vendor's bank account, ghost/first-time payees, and payments split just under your approval limit. /spend has a 'Duplicate / Anomaly Payment Detector' (same payee, same amount within 5 days) and /banking has a Duplicate Payments check. Always confirm a flagged double-payment against the actual invoice before clawing money back - these are heuristics, not proof.",
    "route": "/security",
    "keywords": "double payment, fraud, fake vendor, paid twice, vendor bank change Owner · Vendor protection"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "A customer paid part of an invoice - can I track the remaining balance?",
    "a": "There's a Part-Payments tab on /collections (and Partial Payments on /receivables) for tracking partial settlements against an invoice. Note the simple Mark-paid action on /receivables settles the whole invoice in one go, so for a genuine part-payment use the Part-Payments tracker, or in the backend ledger record an allocation against the bill - outstanding is always gross minus the sum of allocations, so a partial allocation leaves the remaining balance open and still ageing.",
    "route": "/collections",
    "keywords": "partial payment part payment balance remaining allocation outstanding Partial payments"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I collect payment by UPI QR or send a payment link?",
    "a": "Yes. On any unpaid invoice click the QR-code icon to open the UPI QR modal - it generates a one-tap UPI link plus a scannable QR for that invoice's amount. For more control use the 'Pay Links' billing tool (the Link2 tab below the status tabs): pick a live invoice or type a manual amount, set your UPI VPA and payee name, and it builds both a UPI deep link (opens GPay/PhonePe/Paytm) and a card/netbanking checkout URL you can copy and send.",
    "route": "/invoices",
    "keywords": "UPI QR payment link VPA collect card netbanking pay link Payment collection"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I create a payment link to send a customer on WhatsApp?",
    "a": "Go to /payments and open the Payment Links tab. Fill in a title, base amount, GST % (defaults to your firm's rate) and your payee VPA, set an expiry in days and optionally tick 'Allow partial payment'. The right-hand Preview builds a ready-to-share message you can Copy and paste into WhatsApp/SMS; if you also click 'Create live payment link' it asks the backend for a real hosted link.",
    "route": "/payments",
    "keywords": "pay request share link branded WhatsApp SMS upi link Payment links"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Where do I manage payment terms like Net 30 or 2/10 Net 30?",
    "a": "Open the 'Payment Terms' tab on /invoices (the Payment Terms Library). It ships with Net 15, Net 30, 2/10 Net 30 and Due on receipt, and you can add your own with net days, an early-pay discount window (e.g. 2% if paid within 10 days), and a late-interest rate % p.a. Mark one as Default and it pre-fills the due date on every new invoice. '2/10 Net 30' means 2% off if paid within 10 days, otherwise the full amount is due by day 30.",
    "route": "/invoices",
    "keywords": "payment terms net 30 net 15 2/10 early pay discount late interest default Payment terms"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I split an invoice into installments with different due dates?",
    "a": "Yes - the Books engine supports payment-term templates as installment splits, where each installment has a percentage and a due-date rule (basis = days after invoice, end of the invoice month, or N months after month-end). Expanding a template against a posted invoice produces dated installment rows that power 'what's due when' and overdue flags, and the last installment absorbs any rounding so the parts sum exactly to the total. This is the ledger-grade scheduling path in /books, distinct from the simpler Payment Terms Library on /invoices.",
    "route": "/books",
    "keywords": "installments split milestone schedule percentage due date basis month end Payment terms"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Why can't I see the Remind, Add Invoice or Mark-paid buttons?",
    "a": "Those write actions are hidden when you're in read-only mode (e.g. a viewer/investor role). On /receivables the Add Invoice button and the per-row Chase/Mark-paid/Delete actions only render when you're not read-only; the aging summary, totals and lists stay visible so you can still review the data. If you need to chase or settle invoices, ask the account owner to give you a finance/owner role with write access.",
    "route": "/receivables",
    "keywords": "read only viewer investor permissions hidden buttons cannot edit role Permissions"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Who on my team can create or edit invoices?",
    "a": "Invoicing is a write action, so it's gated to roles with billing/sales write access (typically owner, finance and sales), while viewers see a read-only view. If you can't see the 'New Invoice' button or the action icons, your role likely doesn't have write access - ask the owner to adjust your role. Posting an invoice that crosses an approval threshold can additionally require a checker's approval before it commits to the ledger.",
    "route": "/invoices",
    "keywords": "permission role who can create edit viewer read only owner finance sales Permissions"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I match an invoice against a customer purchase order?",
    "a": "Use the 'PO Matcher' tab on /invoices to record a customer PO (number, amount) and match it against the invoice with a tolerance percentage, so you can flag when the billed amount drifts beyond an acceptable variance from the PO. This 2-way match helps avoid over-billing disputes on large contracts.",
    "route": "/invoices",
    "keywords": "PO purchase order matching 2-way tolerance variance over-bill PO matching"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "what happens to my data if I stop paying or downgrade?",
    "a": "Your data stays yours - you can export everything any time from Settings -> Privacy & Data ('Export my data') or /data's Backup & Export. Downgrading to Free keeps your core books, invoices and GST; the paid-only features (payroll, analytics, credit, etc.) just show an upgrade prompt again. To fully leave, you can request account deletion in Privacy & Data, with legally-required financial records purged after the statutory period.",
    "route": "/settings",
    "keywords": "cancel, downgrade, refund, stop paying, leave, data after cancel Prospect · Cancel / refund"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "does Headroom move my money or is it just software?",
    "a": "It's software, not a bank - it reads your data and helps you decide and act, but it doesn't hold or transfer your money itself. For example /automation previews rules but doesn't auto-send or auto-pay yet, and the credit feature routes you to real NBFCs rather than lending to you directly. Things like UPI QR codes use the open NPCI spec so the customer pays straight into your own VPA.",
    "keywords": "move money, bank, holds money, does it pay, payments, just software Prospect · Is it a real bank"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "I do everything on WhatsApp - does it work with that?",
    "a": "Yes, WhatsApp is built in where it matters. Invoice and overdue-payment reminders go out over WhatsApp first (since most Indian SMB buyers read there), with email as fallback - see the Auto-Collect tab in /invoices and the Remind flow in /collections. You can also wire WhatsApp into /connectors so distributor order messages flow into /operations automatically.",
    "route": "/collections",
    "keywords": "whatsapp, reminders, whatsapp invoice, chat, messages Prospect · WhatsApp"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Why does my quote say 'No UPI ID set for your firm'?",
    "a": "When you accept a quote, Headroom tries to attach a UPI collect link built from your firm's own VPA so the buyer can pay on any UPI app (shareable over WhatsApp). If no UPI ID is found on your company profile, you'll see a yellow 'No UPI ID set' note and the invoice is still created - just without a payment link. Add your UPI/VPA in Company settings so accepted orders carry a real payment link.",
    "route": "/sales",
    "keywords": "upi vpa quote no upi id payment link company settings Quotes"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can a sales rep create the invoice when accepting a quote?",
    "a": "Building and pricing the quote works for sales users, but raising the actual invoice is gated: only an owner/admin can post invoices. If a rep clicks Accept & create order without that permission, the conversion fails with a 403 and a message saying to ask an owner/admin to convert the order. So sales preps the quote; finance/owner finalises the invoice.",
    "route": "/sales",
    "keywords": "quote invoice permission 403 rep owner admin who can Quotes"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Where do I track which quotes are about to expire?",
    "a": "On /sales open the Quote Expiry tab (clock icon). It tracks the quotes you log with their validity dates and flags ones nearing or past expiry so you can chase the buyer before the price lapses. This is a standalone tracker stored in your synced feature data, not auto-populated from the Quote builder - log quotes here to monitor their shelf life.",
    "route": "/sales",
    "keywords": "quote expiry validity expiring chase follow up Quotes"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I see a customer's full history across deals and invoices in one place?",
    "a": "On /sales open the Customer 360 tab for a consolidated view of a customer, and use Revenue / Customer, RFM Segments, Churn Risk and Renewals tabs for account-level analysis. Inside /crm, each lead has a Timeline (activities, status changes, tasks, notes) in its drawer, and an Account shows whether it's linked to a Books ledger. For the accounting side of a won customer, open Books and find their Sundry Debtors ledger.",
    "route": "/sales",
    "keywords": "customer 360 history account view deals invoices timeline churn rfm Reporting"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "I'm in sales - how do I get from lead to paid quickly?",
    "a": "Your setup flow is: add customers/leads in the CRM (/crm - build your pipeline or bulk-upload), raise your first invoice (/invoices) to bill a customer and start AR, then set up collection reminders (/collections - WhatsApp/UPI nudges for overdue). In the CRM you move deals through Qualification → Demo → Proposal → Negotiation with the arrows on each card, and a won deal auto-creates the customer in your Books ledger so sales and accounts stay in sync.",
    "route": "/crm",
    "keywords": "sales lead pipeline CRM invoice collections reminders WhatsApp deal stages Sales"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "which of my customers are overdue and how do I chase them?",
    "a": "Open /collections - it pulls every unpaid invoice, sorts customers by how overdue they are, and shows Total overdue and Critical 60d+. Tap Remind on a customer, pick a channel (WhatsApp/Email/SMS) and a tone (Friendly nudge, Firm reminder or Final notice), check the preview and Send now. Work top-down - the list is pre-sorted most-overdue first and recoveries drop below 40% after 90 days.",
    "route": "/collections",
    "keywords": "overdue customers chase payment reminder collect dues aging Sales · Collections"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "what's the full history on this customer before I call them?",
    "a": "Open the Customer 360 tab on /sales. It auto-builds from your invoices and shows the customer's lifetime value, total billed, outstanding and overdue (overdue shows red). Pair it with the Churn Risk and Revenue / Customer tabs to know who is slipping away and who is worth most before you pick up the phone.",
    "route": "/sales",
    "keywords": "customer 360 history lifetime value outstanding overdue account view Sales · Customers"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "why is my customer's overdue amount wrong in Customer 360?",
    "a": "Customer 360, Churn Risk, Reorder Reminder and Revenue / Customer all fill in automatically from your invoices in /invoices, so a wrong due date or an unmarked payment throws them off. Keep invoices accurate - correct due dates and mark payments as Paid - and these tabs (plus /collections aging buckets) stay right with zero extra data entry.",
    "route": "/invoices",
    "keywords": "wrong overdue customer 360 invoice due date mark paid accuracy data Sales · Data accuracy"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "can I bill a customer and take payment while I'm out on the road?",
    "a": "Yes - open /field. Use Kirana Quick-Bill to add items (Qty + Price) and generate a 'Collect via UPI' pay link, then 'Save bill to queue'. To record cash/UPI received, use Field Collection, tap 'Add GPS stamp' for proof of location, and Record collection. It all works offline and syncs to your books when signal returns, so a dead network never loses a sale.",
    "route": "/field",
    "keywords": "field sales on the road offline bill collect upi gps van visit Sales · Field"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "which leads do I need to call today before they go cold?",
    "a": "Open the Leads & Follow-ups tab on /sales. It shows a red overdue-follow-up counter - treat that as your daily call list. Each lead has a phone and WhatsApp icon to contact them in one tap, and logging the touch clears the red warning. The app itself flags that 80% of SMB deals die from no follow-up.",
    "route": "/sales",
    "keywords": "follow up leads overdue call whatsapp chase cold reminder Sales · Follow-ups"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "customer said yes to my quote - how do I turn it into an order and get them to pay?",
    "a": "In the Quote to Order tab on /sales, once the quote looks right click 'Accept & create order' - it converts the quote into an order and generates a shareable UPI payment link the customer can tap to pay. For a full GST invoice and PDF/email/WhatsApp send, the invoice itself lives in /invoices where you hit 'New Invoice', add the same lines, and use the QR icon for a UPI pay link.",
    "route": "/sales",
    "keywords": "convert quote to order invoice accept upi pay link Sales · Quote to invoice"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "which of my quotes are about to expire?",
    "a": "Use the Quote Expiry tab on /sales to see quotes nearing their expiry so you can chase the customer before the price lapses, and the Quote Acceptance tab to track your accept rate. A quote sitting unaccepted past its date is lost revenue, so this is worth a weekly glance.",
    "route": "/sales",
    "keywords": "quote expiry expiring acceptance follow up validity lapsed Sales · Quotes"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "can I send the invoice and reminders to customers on WhatsApp?",
    "a": "Yes. In /invoices the Send and reminder actions prefer WhatsApp (where ~80% of Indian buyers actually read), and /whatsapp has ready tools - Invoice & Pay sends an invoice with a UPI pay-link, and Reminder Bot auto-stages every overdue invoice into a D+1 gentle / D+7 firm / D+15 final-notice ladder. Always capture the customer's WhatsApp number on the invoice for this to work.",
    "route": "/whatsapp",
    "keywords": "whatsapp send invoice reminder pay link customer message dunning Sales · WhatsApp"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "I run sales - why can't I see banking, costs or payroll?",
    "a": "That's by design for the Sales / Collections role. Its scope is invoices, receivables, collections/reminders and revenue analytics - it intentionally excludes costs, payroll and banking so frontline sales staff can bill and chase money without seeing sensitive cash and salary data. If you genuinely need a specific extra page, ask the owner to grant it for the Sales role under Organization → Roles & Access → Configure access.",
    "route": "/organization#access",
    "keywords": "sales role no banking no payroll no costs invoices receivables collections scope Sales role"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I email an invoice to my customer or download the PDF?",
    "a": "On the /invoices table each row has action icons. The Download icon fetches a generated PDF (named after the invoice number). The Send (paper-plane) icon emails the invoice to the customer - it only appears when the invoice has a customer email and isn't already marked Sent. There's no separate 'preview' step; sending moves the status to Sent.",
    "route": "/invoices",
    "keywords": "email invoice pdf download send share customer Send / share"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How does the smart due-date suggester work?",
    "a": "The 'Smart Due-Date' tab on /invoices suggests a due date based on the customer's payment history and your terms, so you can set realistic dates instead of a flat Net 30 for everyone. Whatever due date an invoice carries drives its aging bucket and whether it shows up in Auto-Collect - so keeping due dates accurate keeps your overdue list and collections worklist correct.",
    "route": "/invoices",
    "keywords": "due date suggest payment history terms net days realistic Smart due date"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I schedule a follow-up task and mark it done?",
    "a": "On /crm open the Tasks tab and click New task - set a title, priority (Low/Medium/High) and a due date/time. Tasks move through a fixed flow: BACKLOG → TODO → IN_PROGRESS → DONE, advanced one step at a time using the arrow button on the right of each row (the button shows the next status). Done and Canceled tasks have no further action. Tasks also surface in a lead's timeline.",
    "route": "/crm",
    "keywords": "task follow up todo done schedule reminder status backlog in progress Tasks"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I brand my invoices with a logo, colours and terms?",
    "a": "Yes - the 'Template Studio' tab on /invoices lets you set a logo text, primary and accent colours, font, default terms and a footer for your invoice template so the PDFs go out looking like your firm. Set your firm name and UPI VPA in your profile/firm settings so they auto-fill on payment links and the template.",
    "route": "/invoices",
    "keywords": "template branding logo colour font terms footer customise PDF Templates / branding"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I catch payments deliberately split just under our approval limit?",
    "a": "Use /security → 'Under-Limit Splitting' tab. Set your real approval limit (e.g. ₹1,00,000) and it surfaces clusters of payments parked just below that line - the signature of someone breaking one big payment into several to dodge sign-off. Treat each cluster as a suspect to confirm against the invoices, not proof. Combine it with an Approval Chain in /automation set at the same threshold so legitimate large payments route for approval instead.",
    "route": "/security",
    "keywords": "structuring threshold splitting just under limit evasion Under-limit splitting"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "What is the VPA field and what format does it need?",
    "a": "VPA is your UPI ID - the 'pa' parameter in the upi://pay link, like yourbusiness@okhdfcbank or 9876543210@ybl. On both the UPI QR / Intent tab and the Payment Links tab in /payments it's validated against the pattern name@bank; if it doesn't match you'll see 'Enter a valid UPI ID like name@bank' and the QR won't render. Putting your real VPA here means money lands directly in your account with zero MDR.",
    "route": "/payments",
    "keywords": "vpa upi id pa parameter format invalid validation UPI"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I send a customer a UPI link or QR to pay an overdue invoice?",
    "a": "On /collections, tap the UPI link button on any account. It calls the backend (POST /api/collections/upi-link) and auto-generates a payment link plus QR. If Razorpay is configured it mints a trackable Razorpay payment link; if no gateway is set up it returns a plain UPI deep-link and shows a yellow note saying so. You then Copy link or Send on WhatsApp (it shares \"Hi [name], here is a secure link to pay [amount]: ...\"). Note: the receivable needs a backend invoice id - if it has none, open it from /invoices first.",
    "route": "/collections",
    "keywords": "UPI link QR razorpay payment link pay invoice UPI / payment links"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Can I send an invoice or a payment reminder to a customer over WhatsApp from Headroom?",
    "a": "Yes - the WhatsApp Channel (/whatsapp) has dedicated tools beyond the alert bot. 'Invoice & Pay' lets you pick an open invoice, attach an optional UPI/card pay-link, and send a formatted message; 'Reminder Bot' builds a dunning ladder (D+1 gentle, D+7 firm, D+15 final notice) from your overdue invoices with a 'Remind' button per customer; 'Statement' generates a full account statement to send. Each opens WhatsApp with the message pre-filled via a wa.me link - you tap Send in WhatsApp itself. There are 25+ such message templates (broadcast, order status, payment receipt, festive offer, quotation, COD confirm, and more).",
    "route": "/whatsapp",
    "keywords": "send invoice payment reminder dunning statement customer wa.me template WhatsApp"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Does the WhatsApp invoice/reminder send the message itself, or just open WhatsApp?",
    "a": "It opens WhatsApp with the message text pre-filled (a wa.me deep link). You review it and press Send inside WhatsApp - Headroom doesn't auto-blast messages on your behalf from these template tools. If you provide the customer's number it opens that specific chat; if you leave it blank, WhatsApp asks who to send to. The separate Morning Brief / alert digest is the part that's delivered automatically once your number is connected.",
    "route": "/whatsapp",
    "keywords": "wa.me deep link pre-filled send manual auto broadcast WhatsApp"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "How do I send a WhatsApp payment reminder to a customer?",
    "a": "On /collections, find the account and tap Remind. Pick a channel (WhatsApp, Email or SMS) and a tone (Friendly nudge, Firm reminder, or Final notice). Check the auto-filled preview - it includes the customer name, the formatted amount, and days overdue - then tap Send now. WhatsApp opens prefilled (api.whatsapp.com/send) so you choose the recipient and hit send yourself. Headroom does not silently deliver it server-side; it opens the message in your own WhatsApp so it is honest about who actually sends.",
    "route": "/collections",
    "keywords": "whatsapp reminder send chase nudge dunning message WhatsApp reminders"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Why does the reminder open in my own WhatsApp instead of sending automatically?",
    "a": "By design. There is no configured WhatsApp Business API delivery yet, so rather than pretend a message was sent, the Remind button opens WhatsApp/email/SMS prefilled with the drafted text and you press send. This means you pick the right contact and the message genuinely goes from your number. The Reminder modal toasts \"Reminder for [customer] opened in WhatsApp\" - that is the honest status. After sending, the account is auto-marked contacted.",
    "route": "/collections",
    "keywords": "whatsapp not sending automatic prefilled honest API WhatsApp reminders"
  },
  {
    "category": "Invoicing, payments & collections",
    "q": "Is taking a 2/10 net 30 early-payment discount worth it?",
    "a": "Check the Early-Payment Discount Economics table on /working-capital (Overview). It annualises common terms - 1/10 net 30, 2/10 net 30, 2/10 net 45, 3/15 net 60 - and marks a term 'Take it' when the annualised return beats ~18% borrowing cost. The Payables-Stretch vs Early-Pay tab lets you plug in your own discount %, windows and cost of capital to get a verdict on taking the discount versus stretching payables. Note: stretching beyond agreed MSME terms can trigger Sec 43B(h) interest.",
    "route": "/working-capital",
    "keywords": "early payment discount 2/10 net 30 worth annualised stretch payables msme 43b Working Capital"
  },
  {
    "category": "Inventory & operations",
    "q": "How do low-stock / reorder alerts work?",
    "a": "Set a Reorder level on the item (in the item master). The Alerts sub-tab's Low stock table then lists every active item whose current qty is at or below its reorder level (and reorder level is above zero). On the ERP side, /erp Material Requests has a Reorder report and a Raise purchase request button that auto-builds a purchase material request topping each short item back up to its reorder level.",
    "route": "/books",
    "keywords": "low stock reorder level alert reorder report raise purchase request Alerts"
  },
  {
    "category": "Inventory & operations",
    "q": "Can I assign and scan barcodes for my items?",
    "a": "Yes - the Barcode sub-tab has two cards. Assign barcode lets you pick an item and type/scan a code (one barcode maps to at most one item per business; a clash gives a clear 'already used by' error). Lookup by barcode lets you scan or type a code and press Enter to instantly pull up the item with its unit and closing quantity. You can also include a barcode column in the bulk item upload.",
    "route": "/books",
    "keywords": "barcode scan assign lookup EAN code item Barcode"
  },
  {
    "category": "Inventory & operations",
    "q": "How do I track batches and get warned about expiring stock?",
    "a": "Batch tracking works on FIFO items: when you Receive stock, fill in the Batch no, Mfg date and Expiry date fields. The Alerts sub-tab then shows Near-expiry lots within a window you choose (7/15/30/60/90 days) along with batch and remaining qty, plus a Low stock list of items at or below their reorder level. Issue with FEFO on to consume nearest-expiry lots first.",
    "route": "/books",
    "keywords": "batch lot expiry mfg date near expiry alert FEFO perishable Batch & expiry"
  },
  {
    "category": "Inventory & operations",
    "q": "How do I create a bill of materials with labour and sub-assemblies?",
    "a": "Go to /erp, BOMs tab, New BOM. Pick the finished item, set the output quantity per batch, add each component with its quantity (and tick a row as a sub-assembly to point it at another BOM), and optionally add Operations like Cutting or Welding with minutes and hourly rate. The live cost chips (Raw materials, Operating, Total/batch, Cost/unit) update as you type, valued from each component's weighted-average stock cost, then Create BOM. Click a BOM row to see the exploded raw-material breakdown all the way down through sub-assemblies.",
    "route": "/erp",
    "keywords": "BOM bill of materials recipe sub-assembly operations labour cost rollup BOM"
  },
  {
    "category": "Inventory & operations",
    "q": "My bank export columns are in a weird order and don't match the template - can I still import it?",
    "a": "Yes - open the 'CSV Mapper' tab on /data instead of using the fixed Upload CSV. Paste any sheet (copy cells straight out of Excel/Google Sheets), tick or untick 'First row is a header', then for each column pick what it is: date, amount, description, counterparty or ignore. You must map exactly one column to 'amount' to enable import. A live preview of the first 50 built rows appears below; click 'Import N rows' to commit. There's also a 'Treat all amounts as expenses (negate)' checkbox for statements that list only debits as positive numbers.",
    "route": "/data",
    "keywords": "column mapping excel paste reorder mapper no template CSV Mapper"
  },
  {
    "category": "Inventory & operations",
    "q": "the amount on the link is wrong / i only want to pay part of it now",
    "a": "If the business turned on partial payments when they created the link, you can pay a smaller amount now and the rest later against the same link. If the amount itself is wrong, don't force-pay - message the business so they reissue the link with the correct figure, because the amount is locked into the link/QR by them and you can't edit it on your side.",
    "keywords": "wrong amount partial pay part installment edit change Customer/Vendor · Amount control"
  },
  {
    "category": "Inventory & operations",
    "q": "do i need to create an account or share extra details to pay?",
    "a": "No. You don't sign up for anything - you just open the link or scan the QR and pay through your own UPI app or the secure payment page. You're not giving the business your bank login or UPI PIN; those stay inside your own app. If anyone asks for your PIN, OTP for a 'refund', or full card details over chat, that's a scam - never share those.",
    "keywords": "account signup register privacy data pin otp share details safe Customer/Vendor · Privacy"
  },
  {
    "category": "Inventory & operations",
    "q": "i paid, can i get a receipt for this?",
    "a": "Yes - ask the business for the receipt. On their side, once your money lands they mark the link/invoice as paid, which posts a receipt against your account in their books, so they can send you a confirmation. Your UPI app's transaction reference (UTR) is also valid proof of payment in the meantime - keep that screenshot until they confirm.",
    "keywords": "receipt proof confirmation paid acknowledgement utr Customer/Vendor · Receipt"
  },
  {
    "category": "Inventory & operations",
    "q": "what do we owe vendors and is anything past the MSME 45-day limit?",
    "a": "Open /vendors - the Directory lists everyone you pay with Total Spend, This Month and Last Paid. Use Schedule on a vendor row to book a payable (it flows into your forecast), then the 'AP Aging' tab buckets payables by how overdue they are and 'MSME 45-Day' flags micro/small suppliers unpaid past 45 days. For the 43B(h) disallowance risk specifically, use the MSME Verify tool in /suppliers - unpaid dues past 45 days get added back to taxable income.",
    "route": "/vendors",
    "keywords": "accounts payable ap aging vendor dues msme 45 day 43b(h) udyam Finance manager · AP / payables"
  },
  {
    "category": "Inventory & operations",
    "q": "a vendor sent new bank details - how do I avoid getting scammed",
    "a": "Use /security Vendor Bank Change: Record/update each regular vendor's account number and IFSC once, and next time different details are entered for that vendor it turns red 'Changed' - phone the vendor on a known number before paying. Pair it with the Payroll-vs-Vendor Bank tab, which catches the classic scam where a vendor or salary account is rerouted to a mule account matching an employee's details.",
    "route": "/security",
    "keywords": "vendor bank change fraud rerouted account email compromise scam payee verify Finance manager · Fraud controls"
  },
  {
    "category": "Inventory & operations",
    "q": "A vendor changed their bank account - how do I protect against business-email-compromise?",
    "a": "Go to /security → 'Vendor Bank Change'. Record each regular vendor's account number and IFSC with 'Record / update'. If you later enter different details for the same vendor it flips to a red 'Changed' status and warns you - the textbook sign of a BEC reroute where a fraudster hijacks a genuine vendor's payments. Always phone the vendor on a known number (not one from the change request) to confirm before paying. Pair it with the 'Payroll-vs-Vendor Bank' tab to catch a vendor account rerouted to match an employee's details.",
    "route": "/security",
    "keywords": "BEC email compromise vendor bank reroute IFSC fraud verify Fraud detection"
  },
  {
    "category": "Inventory & operations",
    "q": "How much headroom is left on their working-capital line?",
    "a": "Use /lenders Borrowing Base: set the AR and stock advance rates and the sanctioned limit, and it computes Available headroom against drawing power. A red 'Excess' warning means they are overdrawn against the borrowing base. /debt also has a Drawing Power / FOIR style capacity view. These read live AR and inventory so the headroom stays current with zero re-entry.",
    "route": "/lenders",
    "keywords": "borrowing base, drawing power, headroom, working capital line, overdrawn, AR stock Investor · Borrowing base"
  },
  {
    "category": "Inventory & operations",
    "q": "How do I add a new stock item?",
    "a": "Go to /books, Inventory tab, Items sub-tab and click New item. Enter the name, unit (Nos / Kg / Ltr), HSN/SAC code, GST rate (0/5/12/18/28%), the valuation method (FIFO, Weighted average or LIFO), and optionally opening qty and opening value, then Create item. The opening qty/value become the item's starting balance, so it shows up immediately in the items table and stock summary.",
    "route": "/books",
    "keywords": "create item master new product add SKU Items"
  },
  {
    "category": "Inventory & operations",
    "q": "What's the difference between a Kit and a BOM / work order?",
    "a": "A Kit (Inventory tab, Kits / BOM sub-tab) is the lightweight option: pick the kit/finished item, add its component items with per-kit quantities (Save kit definition), then enter a Build quantity and Build kit - it consumes each component (qty x build quantity) and adds the assembled kit to stock at rolled-up cost. A BOM/work order on /erp is the heavier flow that also handles multi-level sub-assemblies, labour operations, job cards and material requests. Use Kits for bundles, BOM/work orders for real manufacturing.",
    "route": "/books",
    "keywords": "kit bundle BOM difference build components assemble Kits / BOM"
  },
  {
    "category": "Inventory & operations",
    "q": "How do I add freight, customs or insurance to the cost of imported stock?",
    "a": "Use the Landed cost sub-tab. Add the received items (with qty, value and optional weight), then add charges naming an existing ledger (e.g. Freight Payable, Customs Duty Payable) with an amount and an apportionment basis (by quantity, by value or by weight), and Post landed cost. Headroom capitalises the charges into each item's stock value (Dr Stock-in-hand / Cr each charge ledger), bumps the receipt cost and re-prices downstream issues via reposting, so COGS and closing stock reflect the true landed price. The charge ledgers must already exist or you'll get a 'missing - create it first' error.",
    "route": "/books",
    "keywords": "landed cost freight customs duty insurance import capitalise apportion charges Landed cost"
  },
  {
    "category": "Inventory & operations",
    "q": "A vendor gave me a lower-deduction certificate. Where do I record it?",
    "a": "Go to Books > Tax Filing > Lower-deduction sub-tab and fill 'New lower-deduction certificate (Sec 197)': pick the Party, enter the TDS section (e.g. 194C), the Certificate no., the reduced Rate %, an optional Threshold limit, and the Valid from / Valid to dates, then Save. Once saved, when you deduct TDS for that party + section within the validity window the system applies the certificate's lower rate automatically - a §197 certificate can only lower the rate, never raise it.",
    "route": "/books",
    "keywords": "section 197, lower deduction certificate, nil deduction, reduced rate Lower-deduction (197)"
  },
  {
    "category": "Inventory & operations",
    "q": "Can a lower-deduction certificate be used when the vendor has no PAN?",
    "a": "No. If a party has no PAN, §206AA forces the penal 20% rate and a §197 certificate cannot bring it down - a valid 197 certificate is only ever issued against a valid PAN. So a no-PAN vendor is deducted at 20% regardless of any certificate. Record the certificate in Books > Tax Filing > Lower-deduction only for parties whose PAN you hold, and make sure the PAN is on their ledger.",
    "keywords": "206AA, no PAN, 20 percent, penal rate, nil certificate Lower-deduction (197)"
  },
  {
    "category": "Inventory & operations",
    "q": "How do I record a simple manufacturing / assembly entry?",
    "a": "On the Inventory tab open Manufacture. Add one or more Consumes lines (raw materials going out) and one or more Produces lines (finished goods coming in), set the date, and Post stock entry. If you leave the produced rate blank, Headroom rolls the total consumed cost onto the output proportionally by quantity, so the finished good is valued at what the materials actually cost. For repeatable recipes with labour, use BOMs and Work Orders on /erp instead.",
    "route": "/books",
    "keywords": "manufacture stock entry consume produce assembly finished goods Manufacture"
  },
  {
    "category": "Inventory & operations",
    "q": "How do I record stock coming in (a purchase receipt)?",
    "a": "On the Inventory tab open Receive / Issue and use the Receive stock (inward) card. Pick the item, enter quantity and rate per unit, and optionally a warehouse, batch number, mfg date and expiry date, then Receive. For Weighted-average items this re-averages the cost; for FIFO items it creates a new lot at that rate (with the batch/expiry you entered). Negative or zero quantities are rejected.",
    "route": "/books",
    "keywords": "receive inward purchase add stock rate batch expiry Movements"
  },
  {
    "category": "Inventory & operations",
    "q": "How do I issue or consume stock, and what is the FEFO checkbox?",
    "a": "Use the Issue stock (outward) card on the Receive / Issue sub-tab: pick the item, enter quantity and optionally a warehouse, then Issue. The cost leaving (COGS) follows the item's valuation method. For FIFO items the FEFO toggle (issue earliest-expiring lots first) makes it consume the lots with the nearest expiry date first instead of plain oldest-received order - handy for perishables. You can't issue more than you hold unless the item allows negative stock.",
    "route": "/books",
    "keywords": "issue outward consume FEFO expiry sell deduct stock Movements"
  },
  {
    "category": "Inventory & operations",
    "q": "Why does Headroom block me from issuing stock with a 'negative stock' error?",
    "a": "By default an item cannot go below zero - if you try to issue more than the current on-hand quantity you get a message like 'Only X Nos of <item> on hand'. If you specify a warehouse it also checks that specific warehouse's balance. To allow issuing into negative (e.g. you'll back-date the receipt later), the item must have allow-negative turned on in its master. Otherwise, Receive the missing stock first, then issue.",
    "route": "/books",
    "keywords": "negative stock error cannot issue insufficient on hand allow negative Movements"
  },
  {
    "category": "Inventory & operations",
    "q": "Does Headroom support multiple warehouses / stores?",
    "a": "Yes. Receive, Issue, Physical adjust and the single-item Repost forms all take an optional Warehouse field, and per-warehouse balances are tracked so the negative-stock guard works per location. The ERP screen at /erp also has a Warehouses tree with putaway rules. Note that valuation (WAVG at item level, FIFO at lot level) is computed for the item as a whole, so warehouse mainly partitions quantity, not a separate cost per warehouse.",
    "route": "/books",
    "keywords": "warehouse multi location store branch transfer putaway Multi-warehouse"
  },
  {
    "category": "Inventory & operations",
    "q": "Why can't I receive stock, build kits or run reposts - I only see read-only screens?",
    "a": "Stock movements, manufacturing, physical adjustments, kits, barcodes, reposting and landed-cost posting are write actions, so they need an owner, finance or accountant role. With a viewer/sales/ops role you'll see a notice like 'You need an owner / finance / accountant role to …' instead of the forms, but you can still view items, the stock summary, alerts and history. Ask an owner to upgrade your role if you need to post.",
    "route": "/books",
    "keywords": "permission role read only cannot post owner finance accountant viewer write gate Permissions"
  },
  {
    "category": "Inventory & operations",
    "q": "I run a manufacturing/trading shop - does this fit my kind of business?",
    "a": "Likely yes. Beyond core books and GST there are mode-specific tools: /erp for manufacturers (bill of materials, work orders, true per-unit cost), /operations for inventory + orders + purchase orders, /marketplace for Amazon/Flipkart/Meesho sellers (settlement recon, TCS, SKU profitability), /global for exporters/importers (LUT invoices, customs, FIRC), and /field for shop counters and delivery vans. /benchmarks even compares you against typical firms in your sector.",
    "route": "/operations",
    "keywords": "manufacturing, trading, retail, ecommerce, export, my industry, fit my business Prospect · Industry fit"
  },
  {
    "category": "Inventory & operations",
    "q": "My bank's statement layout is always the same - can I save the column mapping so I don't redo it monthly?",
    "a": "Open the 'Mapping Templates' tab on /data, name the layout (e.g. 'HDFC current account') and record the column order (date, description, counterparty, amount). Saved templates persist and can be exported as JSON to share with a teammate or your CA, so monthly statement imports stay consistent instead of being re-mapped by hand each time.",
    "route": "/data",
    "keywords": "save mapping template column order reusable hdfc icici recurring monthly Reusable mappings"
  },
  {
    "category": "Inventory & operations",
    "q": "What are the different team roles in Headroom and what can each one do?",
    "a": "Headroom ships seven assignable roles, each scoped to one job: Business Owner (full access - finances, capital, team, settings), Finance Manager (cash, AR/AP, GST, tax, payroll, debt - but no cap table or team admin), Accountant / CA (books, GST/tax filing, compliance calendar, plus the Advisor portal for their own clients), Sales / Collections (invoices, receivables, collections, revenue analytics - no costs, payroll or banking), Operations Manager (orders, inventory, procurement, vendors, spend - no banking or payroll), Viewer (read-only dashboards, health and forecast), and Investor / Banker (portfolio, raises, valuation, lender views only). Open Organization → Roles & Access to see the full 'What each role can do' reference card for every one.",
    "route": "/organization#access",
    "keywords": "owner finance manager accountant ca sales operations viewer investor permissions Roles overview"
  },
  {
    "category": "Inventory & operations",
    "q": "Can a component reference another component or have a condition?",
    "a": "Yes. Deductions can reference earning abbreviations and gross_pay because earnings are evaluated first, and components are topologically ordered so a formula can reference any other component regardless of row order - a circular reference throws 'Circular dependency in salary components'. The Condition column gates a row: if the condition is falsy the row is skipped entirely (e.g. condition base > 10000 only pays that component for higher base salaries). Conditions use the same safe operators: > >= < <= == != and or.",
    "route": "/hrms",
    "keywords": "condition reference component gross_pay dependency order Salary structure"
  },
  {
    "category": "Inventory & operations",
    "q": "which customers are due to reorder so I can call them?",
    "a": "Use the Reorder Reminder tab on /sales - it fills in automatically from your invoice history and flags customers whose usual buying cycle is up, so you reach out before they buy elsewhere. The Cross-Sell tab suggests what else to pitch them, and Churn Risk warns you which regulars have gone quiet.",
    "route": "/sales",
    "keywords": "reorder repeat buyer due cross sell churn upsell call again Sales · Repeat business"
  },
  {
    "category": "Inventory & operations",
    "q": "How do I track individual units with serial numbers?",
    "a": "Use the Serial numbers sub-tab on the Inventory tab. Pick the item, then in Receive serials paste serials one per line or comma-separated with a rate and date - Headroom posts one inward for the whole batch and records each serial as IN_STOCK (it rejects duplicates or serials that already exist). To sell/ship, use Issue serials with the same serials; it validates each is in stock, posts the outward, and flips them to ISSUED. The list below shows each serial's status, rate and received date.",
    "route": "/books",
    "keywords": "serial number track individual unit IN_STOCK issued receive serials Serial numbers"
  },
  {
    "category": "Inventory & operations",
    "q": "Can I buy in one unit and stock in another, like cartons vs pieces?",
    "a": "Items have one base unit, and all receive/issue movements work in that base unit. Headroom supports UoM conversions (a list of unit + factor, where factor is base units per 1 of that unit) stored on the item, so a helper can convert a purchase quantity to base units before posting. Set your base unit as the smallest tracked unit (e.g. pieces) and define conversions for larger packs.",
    "route": "/books",
    "keywords": "UOM unit of measure conversion carton pieces base unit factor UoM"
  },
  {
    "category": "Inventory & operations",
    "q": "How do work orders actually move my stock and cost?",
    "a": "On /erp, Work Orders tab, New work order: choose the BOM and quantity to produce. Tap Transfer to issue the required raw materials into Work-in-Progress (this consumes stock at real cost), then Manufacture to receive the finished goods back into stock at the full rolled cost - raw materials plus operating cost. If a BOM has operations, expand the work order and use Start card / Complete card on each to log actual labour time, which replaces the planned estimate in your COGS. Every move posts a balanced journal so the GL stays in step.",
    "route": "/erp",
    "keywords": "work order transfer manufacture WIP job card labour COGS produce Work orders"
  },
  {
    "category": "Inventory & operations",
    "q": "Does Headroom calculate bank drawing power (MPBF)?",
    "a": "Yes. /working-capital has an 'MPBF (Tandon)' calculator for the Maximum Permissible Bank Finance under the Tandon committee method, plus an OD/CC Utilisation & Drawing-Power tracker where you enter your sanctioned limit, drawn amount and the bank's stock and debtor margins (haircuts). It computes eligible stock + eligible debtors = drawing power, your effective (binding) limit, utilisation %, and headroom, and warns if you're overdrawn or if drawing power falls short of the sanction.",
    "route": "/working-capital",
    "keywords": "mpbf tandon drawing power bank od cc limit margin haircut stock debtors Working Capital"
  },
  {
    "category": "Payroll & HR",
    "q": "How do I keep a record of who has access and review it regularly?",
    "a": "Use /security → 'Access Review Log'. Add each person with their role and scope; the tool stamps a 'last reviewed' date. Any active grant not reviewed in over 90 days is flagged yellow with a 'review' warning - click 'Mark reviewed' after each quarterly check, or 'Suspend' to disable a leaver. Reviewing access quarterly and removing leavers promptly is the single cheapest control against insider fraud and stale credentials.",
    "route": "/security",
    "keywords": "access review user list leavers offboarding stale 90 days quarterly Access review"
  },
  {
    "category": "Payroll & HR",
    "q": "How do I leave a client's company and get back to my own data?",
    "a": "Click 'Exit client view' in the sidebar - it shows under the selected company's name (or via the tenant switcher at the top). Exiting restores your own workspace data from local cache immediately, so nothing you saw in the client's account leaks into yours. The two never mix: your data and each client's data live in separate tenant namespaces.",
    "route": "/advisor",
    "keywords": "exit client view switch back own workspace tenant switcher CA advisor Client view (CA)"
  },
  {
    "category": "Payroll & HR",
    "q": "What is the EWA tab - can employees draw salary early?",
    "a": "EWA (Earned Wage Access) on /payroll lets an employee request an advance against wages they've already earned in the month. It's a salary-advance facility shown alongside the run; the advance is later recovered (it shows up as 'Recovery from F&F' or against the next run). Treat the live money movement as wired only once you've connected your payout rail - until then it models the economics.",
    "route": "/payroll",
    "keywords": "ewa earned wage access advance early salary draw EWA"
  },
  {
    "category": "Payroll & HR",
    "q": "what details must I fill so payslips and bank payouts aren't wrong",
    "a": "Enter PAN, full bank account and IFSC for every employee in the Add Employee modal up front - payslips, Form 16 and the eventual bank payout file are only as accurate as that data, and the system won't chase you for missing fields. Also set your firm name/GSTIN in Settings so it appears on slips and Form 16.",
    "route": "/payroll",
    "keywords": "missing details, PAN, IFSC, bank account, accuracy, employee data HR/Payroll admin · Data accuracy"
  },
  {
    "category": "Payroll & HR",
    "q": "someone resigned, do I delete them or will it break their history",
    "a": "Don't delete - use Deactivate on the employee. In HRMS this removes them from future payroll while keeping all their history intact; combine it with the F&F Settlement tab on /payroll to compute their final dues. Deleting would lose the records you need for Form 16 and audits.",
    "route": "/hrms",
    "keywords": "deactivate, resign, remove employee, leaver, terminate, exit HR/Payroll admin · Deactivating staff"
  },
  {
    "category": "Payroll & HR",
    "q": "how do I work out gratuity and what it's costing me overall",
    "a": "The Gratuity tab on /payroll calculates per-employee gratuity (the 5-year eligibility is flagged) and the Statutory Liability / Liability tab shows total accrued gratuity liability, vested amount (≥5 yrs) and annual accrual cost to book as a provision (AS-15 / Ind AS 19). It pulls from your employee records, so keep dates of joining accurate. Verify the final figure with your CA before booking.",
    "route": "/payroll",
    "keywords": "gratuity, gratuity liability, provision, accrual, 5 years, end of service HR/Payroll admin · Gratuity"
  },
  {
    "category": "Payroll & HR",
    "q": "owner wants to know our total people cost, where do I pull that",
    "a": "Use the Headcount Cost tab on /payroll for total cost-to-company across the team, and the People ROI and Attrition Cost tabs for deeper analysis. For a live view alongside finance and sales, the /insights page 'Company at a glance' shows headcount and last payroll, and its Query builder can group the Payroll runs dataset by run_month for a trend.",
    "route": "/payroll",
    "keywords": "headcount cost, people cost, total payroll cost, manpower, salary expense HR/Payroll admin · Headcount cost"
  },
  {
    "category": "Payroll & HR",
    "q": "what happens to pay if someone takes too many unpaid days",
    "a": "Unpaid (LWP) days reduce Payment days in the Attendance summary, and every salary component you marked Prorate shrinks accordingly when you run payroll. The LWP Impact tab on /payroll lets you see exactly how loss-of-pay days hit a person's net before the run, so you can sanity-check it. Finalise attendance and leave approvals first - the run can only be done once for a month.",
    "route": "/payroll",
    "keywords": "LWP, unpaid leave, loss of pay, leave without pay, proration impact HR/Payroll admin · LWP / unpaid leave"
  },
  {
    "category": "Payroll & HR",
    "q": "can I generate an offer letter for a new hire from here",
    "a": "Yes - the Offer Letter tab on /payroll builds an offer with a CTC breakup, and the CTC Optimizer / Take-Home Breakup tabs help you structure Basic, HRA, LTA, NPS employer share and special allowance to maximise the candidate's take-home. Treat the Salary Benchmark tab as directional only - its bands are illustrative static figures, not a live market feed.",
    "route": "/payroll",
    "keywords": "offer letter, CTC breakup, new hire, structure salary, take home HR/Payroll admin · Offer letters"
  },
  {
    "category": "Payroll & HR",
    "q": "I need a full salary register for audit, is there a report",
    "a": "Yes - the Payroll Register tab on /payroll gives the full per-employee earnings/deductions/net register you can hand to an auditor, and the Variance tab compares month-on-month so you can explain any swings. The PF ECR, Form 16 and Statutory Liability tabs cover the filing-side documents.",
    "route": "/payroll",
    "keywords": "payroll register, salary register, audit, report, muster, export HR/Payroll admin · Payroll register"
  },
  {
    "category": "Payroll & HR",
    "q": "how do I send everyone their payslip after payroll",
    "a": "On /payroll use the Payslip Portal tab - pick the month, choose WhatsApp or email, and it generates a per-employee payslip link plus a ready message with their net pay that you copy or share. For the slip itself, the Salary Slips tab lets you preview and download any employee's slip for a chosen month/year; in HRMS, click Payslips on a completed run to see each person's slip.",
    "route": "/payroll",
    "keywords": "payslip, salary slip, send payslip, whatsapp payslip, distribute slips HR/Payroll admin · Payslips"
  },
  {
    "category": "Payroll & HR",
    "q": "I ran payroll then noticed an attendance mistake, can I redo it?",
    "a": "A month can only be run once - the system blocks duplicate runs - so the safe sequence is: finalise attendance and approve all leave first, preview with Slip preview, then run. If you catch an error, fix the underlying record and handle the correction through the next run or an adjustment rather than expecting a re-run of the same month. This is why finalising attendance up front matters.",
    "route": "/hrms",
    "keywords": "rerun, redo payroll, mistake, correction, duplicate run, edit run HR/Payroll admin · Re-running a month"
  },
  {
    "category": "Payroll & HR",
    "q": "an employee wants an advance against this month's salary, can I do that",
    "a": "Yes. The EWA tab on /payroll shows each employee's earned-to-date and a max-advance amount against wages already earned this month - click to approve the advance straight from there. The Salary Advance tab handles larger advances, and any outstanding advance is automatically netted off in the F&F Settlement and in the payroll run so you don't double-pay.",
    "route": "/payroll",
    "keywords": "salary advance, EWA, earned wage access, loan to employee, advance against salary HR/Payroll admin · Salary advance / EWA"
  },
  {
    "category": "Payroll & HR",
    "q": "how do I build a salary structure with basic HRA and the rest",
    "a": "In /hrms open Salary structures and click Build a salary structure: name it, tick PF/ESI/PT as needed, then add component rows. Each earning/deduction can be a static Amount or a Formula like base * 0.5 for Basic, base * 0.2 for HRA. Tick Prorate on the components that should shrink for unpaid days, Save, then use Assign structure to link an employee and set their base salary and effective-from date.",
    "route": "/hrms",
    "keywords": "salary structure, CTC breakup, basic HRA, components, formula, assign structure HR/Payroll admin · Salary structures"
  },
  {
    "category": "Payroll & HR",
    "q": "can I see net pay before I commit the run so I don't mess up",
    "a": "Yes - in /hrms Salary structures, after assigning a structure use Slip preview (pick employee + month, click Preview) to see the full earnings, deductions and net before committing. On /payroll the Add Employee modal shows live estimated monthly TDS, and the Take-Home Breakup tab spells out gross-to-net. Always preview after assigning a structure to confirm PF/ESI/PT are deducting correctly before the real run.",
    "route": "/hrms",
    "keywords": "preview, net pay check, slip preview, dry run, verify before payroll HR/Payroll admin · Verifying before paying"
  },
  {
    "category": "Payroll & HR",
    "q": "how do I remove someone who left the company?",
    "a": "On /organization → Members, find the person in 'Your Team' and click the trash icon next to their row, then confirm. You can't remove yourself or another super_admin from here. Do this promptly when staff leave - the Security page's Access Review Log and the DPDP/Privacy hygiene checklist both treat quarterly access review and prompt leaver-removal as a real control.",
    "route": "/organization",
    "keywords": "remove user delete member offboard leaver revoke access ex-employee IT / Admin · Removing a user"
  },
  {
    "category": "Payroll & HR",
    "q": "How do I remove someone from the team, and what happens if I leave?",
    "a": "To remove a teammate, click the trash icon next to their name in Organization → Members (you can't remove yourself). To leave a workspace yourself, use the 'Leave team' button in the top-right of the Team Members card - you'll get a fresh empty workspace of your own and your old team keeps all their data. Both actions ask for confirmation first. Super admins don't see the Leave button.",
    "route": "/organization#members",
    "keywords": "remove member delete teammate leave team quit workspace kick out Leaving / removing"
  },
  {
    "category": "Payroll & HR",
    "q": "can I make payroll this month?",
    "a": "Run /predict's Payroll Stress tab - it pre-fills your monthly wage bill and safe buffer and tells you whether you can cover salaries. You can also add your payroll as a Cash Obligation in /forecast so the outflow shows as a red line on the 90-day chart, and set a minimum-balance floor in /alerts (Cash-Low) covering one full payroll plus statutory dues so 'days to floor' becomes a real payroll-safety countdown.",
    "route": "/predict",
    "keywords": "afford salaries, pay staff, salary money, payroll safety Owner · Payroll"
  },
  {
    "category": "Payroll & HR",
    "q": "Where do I find and download payslips / salary slips?",
    "a": "On /hrms, the Payroll tab, click Payslips on any run row to expand a card per employee showing earnings, deductions (statutory ones marked *), gross, total deduction and net. On /payroll the Salary Slips tab renders downloadable slips, and the Payslip Portal tab generates a per-employee portal link plus a ready-to-send WhatsApp message with the net pay. Note the portal links are illustrative tokens until you wire your hosted self-service portal.",
    "route": "/hrms",
    "keywords": "payslip salary slip download view portal whatsapp send Payslips"
  },
  {
    "category": "Payroll & HR",
    "q": "Why can't I edit payroll - buttons are missing or greyed out?",
    "a": "Payroll and HRMS writes are gated to owner, finance manager and super admin (mirrored on both the frontend and backend WRITE_ROLES). Other roles - sales, ops, viewer, investor - can open /payroll and /hrms and see employees, runs, slips and balances, but the Add employee, Run payroll, mark-attendance, allocate-leave, approve/reject and structure-builder controls are hidden. Ask an owner or finance manager to grant you the role, or to action the change for you.",
    "route": "/payroll",
    "keywords": "permission role cannot edit greyed missing owner finance manager viewer write gate Permissions"
  },
  {
    "category": "Payroll & HR",
    "q": "How is PF calculated and can I cap it?",
    "a": "Provident Fund is 12% of Basic, computed on min(Basic, ₹15,000 wage ceiling) by default, rounded to the nearest rupee - so on the standard structure PF maxes at ₹1,800/month. It only appears if the structure has PF ticked. On /hrms the structure builder has a PF (12% basic) checkbox; on /payroll the statutory engine caps PF at the ₹15,000 ceiling. For EPFO filing, use the PF ECR tab on /payroll to generate the ECR .txt (UAN, EPF/EPS wages, contributions) to upload on the EPFO portal by the 15th.",
    "route": "/payroll",
    "keywords": "pf provident fund 12 percent 15000 ceiling 1800 ecr epfo PF"
  },
  {
    "category": "Payroll & HR",
    "q": "is my data mine - can I get it out if I leave?",
    "a": "Yes, you own your data and can export it any time. In Settings -> Privacy & Data, click 'Export my data' to download a full JSON of your account. Separately, /data has a 'Backup & Export' tab for a full JSON backup plus date-range and Tally-XML exports. You're never locked in.",
    "route": "/settings",
    "keywords": "data ownership, export data, download my data, lock in, leave Prospect · Data ownership"
  },
  {
    "category": "Payroll & HR",
    "q": "Why did my payroll run fail with 'no active employees with a salary structure assignment'?",
    "a": "On /hrms a payroll run only picks up employees who are ACTIVE and have a salary structure assigned with a from-date on or before that month. If you added employees but never assigned them a structure, the run has nothing to compute. Go to /hrms, the Salary structures tab, build a structure, then use Assign structure to set each employee's base salary and effective from-date. If you instead see 'Payroll GL ledgers missing', run the books setup/seed first so the Salaries, PF Payable, TDS Payable, Staff Deductions and Salaries Payable ledgers exist.",
    "route": "/hrms",
    "keywords": "payroll fails error no employees structure assignment 422 Run payroll"
  },
  {
    "category": "Payroll & HR",
    "q": "How do salary structure formulas work - what variables can I use?",
    "a": "On /hrms, Salary structures tab, each component row is an earning or deduction with either a fixed Amount or a Formula. Formulas may reference base (the assigned base salary), payment_days, working_days, lop_days and any other component's abbreviation (e.g. Basic's abbr is BS). Only arithmetic and comparisons are allowed - base * 0.5, base * 0.2 - no functions, no eval. A blank or zero-result row is dropped. Tick Prorate (depends-on-payment-days) so a component shrinks for unpaid days, and Stat. to flag a statutory line.",
    "route": "/hrms",
    "keywords": "formula salary structure base components abbreviation prorate Salary structure"
  },
  {
    "category": "Payroll & HR",
    "q": "How do I assign a salary and preview a payslip before running?",
    "a": "On /hrms, after saving a structure, use Assign structure (sets base salary): pick the employee, the structure, type the base salary and an effective from-date, then Assign. To check the result, use Slip preview lower on the same tab - pick the employee and month and click Preview to see earnings, gross, each deduction, total deduction and net pay, all attendance-prorated, without persisting anything. The latest assignment with a from-date on or before the month is the one that applies.",
    "route": "/hrms",
    "keywords": "assign base salary preview payslip slip before run Salary structure"
  },
  {
    "category": "Payroll & HR",
    "q": "how do I track contract renewals and ask happy customers for referrals?",
    "a": "Use the Renewals tab on /sales to track recurring/contract customers due to renew so you don't lose them to inertia, and the Referrals tab to log and chase referral asks from happy buyers. The NPS & Feedback tab helps you spot who is happy enough to refer in the first place.",
    "route": "/sales",
    "keywords": "renewals contract renewal referral nps feedback recurring retention Sales · Renewals & referrals"
  },
  {
    "category": "Payroll & HR",
    "q": "Can I check if I can afford a salary hike or a new hire?",
    "a": "Yes - /scenarios has dedicated tabs for both. 'Headcount / Hiring' lets you set number of hires, average salary, employer load % (PF/ESI/overhead) and expected added revenue, then shows burn before/after and the new runway, warning you if runway falls below the 6-month safety line. 'Salary-Hike Afford' models a raise against your live cash and burn. Both pull your live monthly revenue and cost from transactions.",
    "route": "/scenarios",
    "keywords": "afford hire salary hike headcount PF ESI employer load runway Scenario Planner"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What's the fastest read on whether a client is heading for a cash crunch before I advise them?",
    "a": "On /advisor the client card already shows runway and unread alerts; click Forecast to open their cash-flow forecast, or look at their Dashboard (/dashboard) for the Monte-Carlo \"chance of dipping below safety buffer\" banner. If they're tight, you can steer the Pre-qualified ones toward Headroom credit (/credit) as a natural advisory upsell - watch the Pre-qualified badge on the card.",
    "route": "/advisor",
    "keywords": "cash crunch, runway, forecast, pre-qualified, credit upsell, advisory CA · Cross-feature"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What fundraising instruments can I choose from?",
    "a": "When creating a raise you pick from five India-relevant instruments: Equity (priced round), CCPS (Compulsorily Convertible Preference Shares), SAFE (India / iSAFE), Convertible Note, or Revenue-Based Financing. Equity and CCPS are \"priced\" types, so Headroom asks you for a pre-money valuation to compute the equity percentage; SAFE, Convertible Note and RBF issue no equity upfront, so no pre-money is needed at creation.",
    "route": "/capital",
    "keywords": "SAFE, CCPS, convertible note, RBF, equity, instrument types Capital raise"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Why does it ask for a pre-money valuation only on some raises?",
    "a": "Pre-money is only requested for priced instruments - Equity and CCPS - because those issue equity immediately, so Headroom needs the pre-money to compute dilution. It uses the post-money method: investor equity % = amount ÷ (pre-money + amount). As you type the target and pre-money, it shows live the % equity investors take at target. SAFEs, convertible notes and revenue-based financing don't issue equity upfront, so the form skips pre-money and tells you so.",
    "route": "/capital",
    "keywords": "pre-money, dilution, equity percentage, post-money Capital raise"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Can my CA or sales/ops team add investors to a raise?",
    "a": "No. Creating raises, publishing them, and recording investor commitments are owner/super_admin-only actions - the backend endpoints 403 for other roles. A viewer or investor role still sees the raises list (read-only) so they can follow progress, but the New Raise button, Publish, and + Investor controls are hidden for them. If you need a teammate to manage raises, give them the owner role.",
    "route": "/capital",
    "keywords": "permissions, role, who can create raise, read-only Capital raise"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What is the CFO Brief and how do I generate one?",
    "a": "/cfo-brief is like a finance chief on call. The default 'AI Brief' tab shows live Cash Balance, Runway, MoM Revenue and Active Alerts, then you set the audience toggle - 'CFO Brief (you)' for a blunt weekly owner summary, or 'Investor Update (board)' for a board-ready monthly update with an Asks section - and click Generate. It needs AI configured on the backend (ANTHROPIC_API_KEY); switching audiences clears the old draft so you never send the wrong one.",
    "route": "/cfo-brief",
    "keywords": "cfo brief generate ai weekly summary investor update board audience CFO Brief"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Can Headroom build a board deck or investor update for me?",
    "a": "Yes. /cfo-brief has ~19 tabs that auto-build what a CFO would normally make by hand - a Board-Deck Generator, One-Page Financial Summary, Weekly KPI Scorecard, Risk & Watchlist Brief, Auto Variance Commentary, Cash-Flow Snapshot, Margin Snapshot, Financial Ratios, Loan & Covenant Brief, Liquidity Position Brief, Growth vs Burn Brief and more - all from your real transactions, balances, loans and alerts. Most tabs have Copy/Export buttons so you can paste straight into email or WhatsApp.",
    "route": "/cfo-brief",
    "keywords": "board deck investor update kpi scorecard variance commentary copy export CFO Brief"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What does the green 'Balanced' badge actually mean, and what do I do if it goes red?",
    "a": "Green means total debits equal total credits for that financial year - your books are internally consistent and trustworthy. It should essentially never go red, because every voucher is validated to balance before it's accepted. If it ever does, don't try to delete anything: find the offending voucher in 'New entry' → Recent vouchers and Reverse it, then re-post correctly. The Balance Sheet has its own balanced badge (assets = liabilities + equity).",
    "route": "/books",
    "keywords": "balanced badge green red out of balance debit credit trustworthy fix reverse Concepts"
  },
  {
    "category": "Capital, credit & investors",
    "q": "How do I apply for a working-capital or business loan?",
    "a": "Go to /credit and open the Apply tab. Enter how much you need, pick a repayment term and a purpose, then submit to get pre-qualified offers - the engine underwrites you instantly from your bank and transaction data using 9 signals (revenue, consistency, business age, runway, customer concentration, overdrafts and more) with no documents and no hard CIBIL pull. Approved offers appear on the Overview tab; click one to view its Key Fact Sheet, then accept.",
    "route": "/credit",
    "keywords": "loan, working capital, apply, credit, underwriting, pre-qualified Credit / loans"
  },
  {
    "category": "Capital, credit & investors",
    "q": "I only get one application - why can't I re-apply right away?",
    "a": "The underwriting service rate-limits applications: you can submit only one credit application every 90 days, and you can't submit a new one while another is in progress. If you hit this, Headroom shows a clear message (\"You can submit only one credit application every 90 days\" or \"You already have an application in progress\") rather than fabricating an approval. Use the waiting period to improve your score via the Not yet tab.",
    "route": "/credit",
    "keywords": "re-apply, 90 days, rate limit, application in progress, cooldown Credit / loans"
  },
  {
    "category": "Capital, credit & investors",
    "q": "I got no offers or a low score - what do I do?",
    "a": "Open the Not yet tab on /credit. It lists the specific fixes that raise your score toward the 50-point approval threshold and how many points each adds - e.g. cut revenue variation (CoV) below 25%, reach the 12/24-month business-age tier, diversify away from one big customer, and avoid negative balances. The single fastest lever is revenue consistency: invoicing on a steady monthly cadence pushes your CoV down and adds roughly 8 points.",
    "route": "/credit",
    "keywords": "no offers, low score, not yet, improve score, rejected, threshold Credit / loans"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Are there calculators to check if I can afford a loan before borrowing?",
    "a": "Yes - /credit bundles 25+ calculators. Before borrowing, sanity-check terms in EMI & Schedule (amortisation), Flat vs Reducing (true rate), FOIR / Capacity (can your income service it) and DSCR (the coverage ratio lenders watch). There's also WC Sizing, GST Eligibility, LAP / LTV, Drawing Power, Invoice Discounting, Prepayment Optimizer, OD vs Term Loan, Compare 3 Offers, NBFC vs Bank and a Scheme Finder. The EMI capacity gauge on Overview shows your EMI as a % of monthly burn (safe under 25%).",
    "route": "/credit",
    "keywords": "EMI calculator, FOIR, DSCR, affordability, flat vs reducing, can I afford Credit / loans"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Can Headroom route me to real lenders like Lendingkart or KreditBee?",
    "a": "Yes. If the in-house pre-qualified offers aren't enough, the Eligibility Matcher, NBFC vs Bank and Scheme Finder tabs help, and you can submit your lead to Finbox to be routed to real NBFCs such as Lendingkart, KreditBee and IIFL. Note the \"Credit & Loans\" heading carries a Preview badge for actual disbursement capability - the underwriting and offers are real, but live money-rail disbursement depends on partner integration.",
    "route": "/credit",
    "keywords": "Lendingkart, KreditBee, IIFL, Finbox, NBFC, real lenders, routing Credit / loans"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Should I raise equity or take debt - how do I compare?",
    "a": "Start on /valuation: in the Dilution card, if the investor stake turns red (over 25% in one round), it explicitly suggests a smaller raise or revenue-based financing, and a \"Compare with debt instead\" button jumps you to /credit. On the Credit side, use FOIR / Capacity, DSCR and EMI & Schedule to confirm you can service the debt. Treasury also has a Debt vs Equity tab, and Capital lets you set up a Revenue-Based Financing raise as a middle path that doesn't dilute equity.",
    "route": "/valuation",
    "keywords": "debt vs equity, RBF, revenue based financing, dilution vs loan, compare Debt vs equity"
  },
  {
    "category": "Capital, credit & investors",
    "q": "is our business in good enough shape to ask the bank for a loan?",
    "a": "Open /health - it gives a 0-100 score with a badge saying whether you meet the typical lender underwriting bar, plus a Key Ratios vs Lender Benchmarks grid (DSCR, Current Ratio, Runway) where red numbers are below target. Get the score to 65+ and DSCR to 1.25x before applying. For the loan itself, /credit scores you in under 60 seconds from bank data with no hard CIBIL pull and shows what to fix.",
    "route": "/health",
    "keywords": "lender ready loan eligible dscr current ratio health score creditworthy Finance manager · Health / lender-ready"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Am I lender-ready / would a bank lend to me?",
    "a": "On /health, the badge under the score ring reads 'Lender-ready' when your health score is ≥65 and your DSCR is either ≥1.25x or you have no debt - otherwise it says you're below the typical lender bar and to fix your weakest areas first. The Key Ratios grid checks Current Ratio (≥1.5x), Quick Ratio (≥1x), DSCR (≥1.25x), Interest Coverage (≥3x), Runway (≥90 days) and more against lender benchmarks, each clickable to the driving module.",
    "route": "/health",
    "keywords": "lender ready bank loan eligible dscr current ratio underwriting benchmark Financial Health"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What is the 13-week rolling cash forecast and why would I use it?",
    "a": "It's the weekly inflow/outflow format lenders and CFOs ask for. On /forecast click the '13-Week Rolling' tab - it builds a 13-week table live from your open invoices (collected on their due week), your trailing-90-day run-rate, dated cash obligations and active-loan EMIs, with a projected closing balance for each week. Rows that close below your safety buffer turn red, so you can spot the tightest week before it arrives.",
    "route": "/forecast",
    "keywords": "13 week thirteen week rolling lender bank weekly inflow outflow Forecast"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What are scenarios on the forecast page and how do I turn one on?",
    "a": "Scenarios are 'what-if' events (New Hire, Contract Won, Loan Draw, or Custom) layered onto the live forecast. On /forecast use the 'Scenarios' card to '+ Add' one with an amount and start date, then click the eye icon to toggle it active. Active scenarios are baked into the Monte-Carlo bands so the chart and risk metrics update immediately. For deeper multi-event modelling, use the dedicated Scenario Planner at /scenarios.",
    "route": "/forecast",
    "keywords": "scenario new hire contract loan draw toggle active what if Forecast"
  },
  {
    "category": "Capital, credit & investors",
    "q": "How does the bank verification (Account Aggregator) actually work - does the founder hand over passwords?",
    "a": "No passwords. AA is RBI-regulated: the founder raises a consent in Connectors (the 'Start AA Consent' / Bank-UPI Feed Connector card under /connectors), enters their bank/FIP name and registered mobile, and approves the one-time consent inside their own bank's app. Headroom then pulls live transaction batches via the AA, which feeds the verified revenue/burn/runway you see on the Investor Portal. It is the cleanest feed for underwriting because the data comes straight from the bank.",
    "route": "/connectors",
    "keywords": "account aggregator, AA consent, setu, finbox, bank feed, no password, RBI Investor · Account Aggregator"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Is there a board pack I can review before the meeting?",
    "a": "Yes - /investor has a Board Agenda tab, and /cfo-brief has a Board-Deck Generator where slides can be toggled in/out and exported. Both pull live cash, runway, MoM revenue, KPIs and risk/watchlist items from real data, so the founder produces a board-ready pack without a CA assembling it by hand. Use it alongside the KPI Tearsheet for the pre-read.",
    "route": "/cfo-brief",
    "keywords": "board pack, board deck, board agenda, pre-read, slides, investor meeting Investor · Board pack"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What burn multiple and runway should I want to see before backing them?",
    "a": "Headroom's own benchmark (stated in the Investor Portal guidance) is a burn multiple under 1.5x and runway over 12 months before a founder pitches. The Burn Efficiency tab computes net new revenue against net burn so you can sanity-check capital efficiency, and Next-Raise Timing tells you if they are raising with enough cushion. Anything raising with under ~6 months runway is flagged red.",
    "route": "/investor",
    "keywords": "burn multiple, capital efficiency, healthy burn, 1.5x, runway threshold Investor · Burn efficiency"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Where's the cap table and ESOP pool?",
    "a": "On /investor: the Exit Waterfall tab carries the cap-table exit math and the ESOP Pool tab is a dedicated option-pool/grant register. Both are saved across devices so the founder builds the cap table once and reuses it. For diligence, the Data Room checklist explicitly lists 'Current cap table' and 'ESOP pool & grant register' as items to mark Ready.",
    "route": "/investor",
    "keywords": "cap table, ESOP, option pool, grant register, ownership, shareholding Investor · Cap table"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Can I see retention / cohort data to judge the revenue quality?",
    "a": "Yes - the Cohort Retention tab on /investor visualises how revenue cohorts retain over time, alongside MRR Movement (new/expansion/churn breakdown) so you can tell durable recurring revenue from one-off spikes. As with the other metric tabs, these are derived from tagged transactions, so quality depends on the founder's bookkeeping and a connected bank feed.",
    "route": "/investor",
    "keywords": "cohort, retention, churn, MRR movement, revenue quality, recurring, NRR Investor · Cohort & retention"
  },
  {
    "category": "Capital, credit & investors",
    "q": "I'm a lender - how do I track whether they'll breach a loan covenant?",
    "a": "Open /lenders and go to the Covenant Dashboard - it tests DSCR, current ratio and leverage live against the company's synced books. 'AT RISK' means within 10% of a limit and 'BREACH' means past it. Use 'Add covenant' to enter the exact terms from your sanction letter. /debt also has a DSCR/Coverage tab that warns of a breach ahead of the reporting date, and flags DSCR under 1.25x in red.",
    "route": "/lenders",
    "keywords": "covenant, breach, DSCR, current ratio, leverage, sanction letter, default Investor · Covenants"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Is this data real or is the founder just typing numbers into a deck?",
    "a": "The portfolio companies shown by default on /investor are explicitly illustrative sample data - there is a banner saying so. The metrics become real only once the founder grants Account Aggregator (AA) consent, after which revenue, burn and runway are pulled directly from their bank via the RBI-regulated AA rails, not typed in. Look for the green 'aa_verified' badge on a company in the Portfolio tab; companies without it are not yet bank-verified.",
    "route": "/investor",
    "keywords": "real data, verified, account aggregator, AA, bank verified, trust, fake numbers, deck Investor · Data trust"
  },
  {
    "category": "Capital, credit & investors",
    "q": "How do I actually put money into a live round through this?",
    "a": "Go to the Deal Flow tab on /investor, filter by track or search a raise, click Express Interest, enter your amount, tick the acknowledgement box and Confirm Interest - it's recorded against the real raise and KYC follows. Larger leads can use the Syndicates tab to create a syndicate on a verified raise so smaller checks ride along on one term sheet.",
    "route": "/investor",
    "keywords": "deal flow, invest, express interest, commit, syndicate, put money in, KYC Investor · Deal flow"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What does their existing debt look like - total outstanding, EMI, blended rate?",
    "a": "Open /debt - the Overview tab shows Total Outstanding, Monthly Debt Service (EMI), weighted-average interest rate and DSCR as four KPI cards. The Active Loans table lists each facility; click one to see its amortisation and 12-month schedule. Note loans only populate here after the founder records them (the demo seeds one HDFC loan), so check the data is real before relying on it.",
    "route": "/debt",
    "keywords": "debt, loans, outstanding, EMI, blended rate, leverage, existing debt Investor · Debt stack"
  },
  {
    "category": "Capital, credit & investors",
    "q": "If I put in X, what stake do I get and what does the option pool do to it?",
    "a": "Use /valuation's dilution view - enter your investment against the pre-money and it shows post-money, your investor stake %, and founder/option-pool splits (turning the stake red above 25-30%). For a deeper apples-to-apples view across competing offers, /termsheet's Offer Compare table shows investor stake, the new option pool taken from pre-money, and resulting founder ownership for each scenario side by side.",
    "route": "/termsheet",
    "keywords": "dilution, stake, ownership, option pool, post-money, equity, my % Investor · Dilution"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Is there a due-diligence pack / data room I can work through?",
    "a": "Yes - the Data Room tab on /investor is a 16-item diligence checklist across Corporate (incorporation cert, MOA/AOA, SHA, board resolutions), Cap Table, Financials (3yr audited + management accounts + model), Tax (GST and 3yr ITRs), Legal (customer/vendor contracts, IP) and HR (employment, founder vesting). Click each item to cycle Missing to In progress to Ready, and a readiness bar tracks how close to 100% the data room is before diligence opens.",
    "route": "/investor",
    "keywords": "due diligence, data room, DD pack, checklist, diligence, documents, readiness Investor · Due diligence"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What do I get back at exit with my liquidation preference - show me the waterfall",
    "a": "Both /termsheet and /investor (Exit Waterfall tab) model this. /termsheet's exit model takes an exit value, your preference multiple and participating/non-participating choice, and returns your investor payout, your multiple (e.g. 2.0x), your share of the exit, and what's left for common (founders/ESOP). Anti-dilution scenarios (broad-based weighted-average vs full ratchet) are modelled separately so you can see down-round protection.",
    "route": "/termsheet",
    "keywords": "liquidation preference, waterfall, exit, 1x 2x, participating, anti-dilution, ratchet Investor · Liquidation preference"
  },
  {
    "category": "Capital, credit & investors",
    "q": "When are they going to run out of money and need to raise again?",
    "a": "The Next-Raise Timing tab on /investor (mirrored in /valuation) takes pre-filled cash and burn plus a raise lead time and computes 'start raising in X months' and projected cash at close. That tells you whether a follow-on is imminent and whether your pro-rata will be called soon. Cross-check it against the runway figure on the KPI Tearsheet.",
    "route": "/investor",
    "keywords": "next raise, when raise, runway, follow-on, pro-rata, out of money, timing Investor · Next raise timing"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Can I monitor all my portfolio companies in one place instead of chasing updates?",
    "a": "Yes - the Portfolio tab on /investor is a multi-company monitor showing each company's invested amount, sector, revenue/burn trend, runway and any critical alerts, split into 'Needs Attention' and 'Healthy'. The top strip rolls up Total Deployed, number of companies, average runway and active alerts, and a red badge on the tab counts companies in distress. Live numbers require each founder to have granted AA consent.",
    "route": "/investor",
    "keywords": "portfolio, monitor, all companies, distress, alerts, deployed, LP view Investor · Portfolio view"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Where do I see the company's runway and monthly burn?",
    "a": "Open /investor and use the KPI Tearsheet and Burn Efficiency tabs - they auto-fill MRR, ARR, monthly burn, net burn and runway from the company's real transactions. Next-Raise Timing also shows current runway and 'start raising in' months. For your own portfolio view, the Portfolio tab shows Avg Runway across all companies and flags anything under 60 days in red.",
    "route": "/investor",
    "keywords": "runway, burn rate, net burn, cash, months left, tearsheet, burn efficiency Investor · Runway & burn"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Can I compare two term sheets to see which one is actually better?",
    "a": "Yes - /termsheet has an Offer Compare table that lines up multiple offers by investment, pre/post-money, investor stake, new option pool, founder ownership, liquidation preference (Nx participating vs non-participating), board seats and pro-rata rights, and highlights the best on each row. There is also a clause library that flags each term as founder-friendly, neutral or 'watch closely'.",
    "route": "/termsheet",
    "keywords": "term sheet, compare offers, liquidation preference, board seats, pro-rata, clauses Investor · Term sheet"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What's the company actually worth and how is that number derived?",
    "a": "Go to /valuation - it shows an Indicative Valuation with a low/mid/high range derived from annual run-rate revenue (3-month average × 12) times the industry-median revenue multiple for their sector. It also offers Berkus and Scorecard methods for early-stage companies and a 409A/FMV-per-share calculation (common equity after liquidation preference, with a DLOM discount). Treat the revenue-multiple number as indicative, not a fairness opinion.",
    "route": "/valuation",
    "keywords": "valuation, worth, pre-money, revenue multiple, berkus, scorecard, 409A, FMV Investor · Valuation"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Who can access the Investor Portal?",
    "a": "The Investor Portal at /investor is restricted to users with the investor or super_admin role - anyone else is redirected to the dashboard. It's a 14-tab control room: investors browse live deal flow and join syndicates, while founders use the document/metric tabs (KPI Tearsheet, MRR Movement, Investor Update, Data Room, Exit Waterfall, ESOP Pool, Board Agenda, Raise Pipeline, Next-Raise Timing and more).",
    "route": "/investor",
    "keywords": "investor portal, access, role, who can see, restricted Investor portal"
  },
  {
    "category": "Capital, credit & investors",
    "q": "How does an investor put money into a live raise?",
    "a": "On /investor open the Deal Flow tab, filter by track (Revenue Share, Reg CF, Reg A+) or search a raise, then click Express Interest. Enter an amount, see the estimated ownership %, tick the acknowledgement box (this is an expression of interest, not a binding commitment; KYC follows) and click Confirm Interest. It's recorded against the real raise via the backend commit endpoint. If you already have an active investment in a raise, the card shows that instead of the button.",
    "route": "/investor",
    "keywords": "express interest, commit, invest, deal flow, KYC, ownership Investor portal"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Is the portfolio monitoring data real or sample?",
    "a": "The portfolio companies shown on the Portfolio tab are illustrative sample data demonstrating how monitoring works - the cards are labelled \"Sample\" and the banner says so. The design is that once a founder grants Account Aggregator (AA) consent, revenue, burn and runway are pulled directly from their bank rather than typed into a deck, so investors see distress the moment it happens. Until AA is connected, treat the metrics as a preview.",
    "route": "/investor",
    "keywords": "portfolio monitoring, sample data, AA, account aggregator, real data, mock Investor portal"
  },
  {
    "category": "Capital, credit & investors",
    "q": "How do I send a monthly investor update without writing it from scratch?",
    "a": "Open the Investor Update tab on /investor. MRR, monthly burn, net burn, cash in bank and runway are pulled live from your transactions (so make sure income is categorised \"revenue\" and costs as \"expense\"/\"payroll\"). Type your wins in Highlights and needs in Where we need help, and a finished draft is generated - then click Copy to copy it or Email to open a pre-filled mailto. The runway shows \"cash-flow positive\" if you're not burning.",
    "route": "/investor",
    "keywords": "investor update, monthly update, email, MRR, burn, runway, composer Investor portal"
  },
  {
    "category": "Capital, credit & investors",
    "q": "How do I prepare a due-diligence data room?",
    "a": "Use the Data Room tab on /investor. It ships a 16-item checklist across Corporate, Cap Table, Financials, Tax, Legal and HR (incorporation certificate, MoA/AoA, shareholders' agreement, cap table, ESOP register, audited statements, GST returns, ITRs, customer contracts, IP assignments, employment terms, founder vesting and more). Click each item's status to cycle Missing → In progress → Ready and watch the readiness bar climb toward 100% before you open diligence. It's saved across devices, and Reset restores the template.",
    "route": "/investor",
    "keywords": "data room, due diligence, checklist, documents, readiness, diligence Investor portal"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What are Syndicates and can I create one?",
    "a": "Syndicates (on the Syndicates tab of /investor) are the AngelList-style play for Indian SMBs: a lead investor creates a syndicate on a verified raise and smaller checks ride along on one term sheet, with Headroom handling the cap-table entry - typically ₹25L-₹2Cr deals. Click Create Syndicate, enter a name and minimum check size, and it's created for others to join. Joining a syndicate notifies the lead, who contacts you for KYC.",
    "route": "/investor",
    "keywords": "syndicate, angellist, lead investor, min check, join syndicate, create Investor portal"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What does the lead Score number mean and how do I raise it?",
    "a": "The Score (0-100, shown with a gauge icon) is computed automatically from how complete and valuable the lead record is - it rises when the lead has an email, phone, company, job title, website, industry and a higher annual revenue. Green (70+) is hot, amber (40-69) is warm, grey is thin. You can't type a score; you raise it by capturing more detail on the lead, which is why fuller records float to the top of the chase list.",
    "route": "/crm",
    "keywords": "lead score 0-100 gauge hot warm rating Leads"
  },
  {
    "category": "Capital, credit & investors",
    "q": "is my loan costing me too much - should I refinance or prepay?",
    "a": "Open /debt - the Overview shows total outstanding, monthly EMI, the interest share, your blended rate and DSCR (act if DSCR is under 1.25x). Use 'Refinance Compare' to add competing lender quotes and rank them by true Effective APR (not the headline rate - a low rate with 2% fees can cost more). Use 'Amortise & Prepay' to see exact interest saved, but check 'Prepay vs Penalty' first since fixed-rate loans often carry a foreclosure charge.",
    "route": "/debt",
    "keywords": "refinance, prepay loan, interest cost, emi too high, reduce loan cost Owner · Existing loans"
  },
  {
    "category": "Capital, credit & investors",
    "q": "how do I send my investors an update?",
    "a": "Open /investor, go to the Investor Update tab, type your wins in Highlights and needs in 'Where we need help', then click Copy or Email - the MRR, ARR, burn, runway and growth metrics auto-fill from your real transactions. Send it the same day each month; consistent updates are the single biggest driver of investors re-investing and making intros. /cfo-brief can also draft a board-ready Investor Update from your live numbers.",
    "route": "/investor",
    "keywords": "investor update, board update, monthly update, report to investors Owner · Investors"
  },
  {
    "category": "Capital, credit & investors",
    "q": "am I even eligible for a loan?",
    "a": "Open /health first - get your score to 65+ and DSCR to 1.25x before applying, since this page mirrors what the lender calculates and shows a green/yellow 'lender-ready' badge. Then /credit scores you on 9 signals (revenue, consistency, business age, runway, customer concentration, overdrafts) and the 'Not yet' tab tells you how many points each fix adds. The single fastest lever is steady monthly invoicing to push your revenue variation below 25%.",
    "route": "/health",
    "keywords": "loan eligible, qualify, creditworthy, can i borrow, lender ready Owner · Loan readiness"
  },
  {
    "category": "Capital, credit & investors",
    "q": "how do I raise money or get a loan?",
    "a": "For debt, open /credit - enter how much you need and click Get Pre-Qualified Offers; it underwrites you in under 60 seconds from your bank data with no documents and no hard CIBIL pull, then shows offers you can accept. If you get no offers, the 'Not yet' tab lists exact fixes to clear the score threshold. For equity, /capital runs your raise and /investor builds the investor-update emails, KPI tearsheet and data room investors ask for.",
    "route": "/credit",
    "keywords": "loan, working capital, borrow, funding, raise capital, fundraise Owner · Raising money"
  },
  {
    "category": "Capital, credit & investors",
    "q": "what's my company actually worth if I wanted to raise or sell?",
    "a": "Open /valuation - it pulls your real revenue and profit automatically and shows an indicative valuation range using the methods investors use (revenue multiples, DCF, comparables). Drag the Revenue-multiple, growth and discount-rate sliders to match your sector, and read the football-field range. Walk into a fundraise or buyout talk with this defensible number instead of a guess; pair it with /termsheet to see what raising against that value costs you in ownership.",
    "route": "/valuation",
    "keywords": "company worth, valuation, what's my business worth, sell, equity value Owner · What's my company worth"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Why are the Upload CSV, Import and Clear buttons greyed out for me?",
    "a": "Importing, bulk-editing, dedupe, purge and clearing data are write actions. If your role is read-only (e.g. viewer or investor) the /data Overview shows a yellow 'Your role has read-only access - importing and editing are disabled' banner and those buttons are disabled. Export, backup download and the read-only analysis tools (Data Quality, Column Profiler, GSTIN Validator) still work. Ask an owner or finance user to run the import, or have your role upgraded.",
    "route": "/data",
    "keywords": "greyed disabled read-only viewer investor permission import edit Permissions"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Which roles can edit data and which are view-only?",
    "a": "Owner, Finance Manager, Accountant/CA, Sales/Collections and Operations Manager can all create and edit (within the screens their role can reach). Viewer is fully read-only - dashboards and analytics only, no edits and no export. Investor/Banker sees portfolio, capital raises, valuation and lender views. Super Admin has god-mode across all tenants. You can see each role's exact scope in Settings under the role/permission reference.",
    "route": "/settings",
    "keywords": "roles permissions who can edit owner finance accountant sales viewer investor scope Permissions"
  },
  {
    "category": "Capital, credit & investors",
    "q": "can it actually help me get a business loan?",
    "a": "Yes. /credit scores your business in under 60 seconds from your bank/transaction data (no hard CIBIL pull, no documents), shows pre-qualified offers, and if you don't qualify yet, the 'Not yet' tab lists the exact fixes and points each adds. It also has 25+ calculators (EMI, flat-vs-reducing, DSCR, working-capital sizing, scheme finder) and can route your lead to real NBFCs. /health shows whether you're 'lender-ready'.",
    "route": "/credit",
    "keywords": "loan, credit, working capital, finance, lender, borrow, eligibility Prospect · Loans / credit"
  },
  {
    "category": "Capital, credit & investors",
    "q": "I want to give my investor or auditor look-only access without letting them edit anything. How?",
    "a": "Assign them the Viewer (Read-only) role when you invite them, or switch them to it in Organization → Members. A Viewer sees dashboards, analytics, financial health score, CFO brief and forecast but cannot create, edit, delete or export anything - it's the only role flagged read-only. For an external investor or banker who should only see portfolio/raise/valuation/lender views, use the Investor / Banker role instead.",
    "route": "/organization#access",
    "keywords": "read only viewer no edit auditor investor look only safe access Read-only / viewer"
  },
  {
    "category": "Capital, credit & investors",
    "q": "I back-dated a receipt / fixed an old rate - how do I correct the valuation of everything after it?",
    "a": "Use the Reposting sub-tab. Pick a scope (all items with movements on/after a date, or a single item), set the From date and an optional reason, and Repost. It replays the item's whole stock ledger from the opening balance in date order, re-prices every downstream issue, re-syncs the running balances and FIFO lots, and posts one net Stock-in-hand / Stock Adjustment correction to the GL - it never edits posted vouchers. It's safe to re-run because it always replays from the opening.",
    "route": "/books",
    "keywords": "repost reposting back-dated rate correction valuation replay downstream Reposting"
  },
  {
    "category": "Capital, credit & investors",
    "q": "How do I figure out how much I need to raise to extend runway?",
    "a": "On /capital open the Runway Planner tab. Your cash on hand and monthly burn are pre-filled from your last 90 days of transactions (override anything). Set your target runway in months, then pull the two levers - cost cut (%) and a one-time capital raise (₹). Projected runway turns green when you hit target; if it stays orange, the gap line tells you exactly how much more to raise at the current adjusted burn, OR what % to cut costs instead with no new raise.",
    "route": "/capital",
    "keywords": "runway, burn, cash, how much to raise, extend runway, planner Runway"
  },
  {
    "category": "Capital, credit & investors",
    "q": "How do I model what a SAFE or convertible note will convert into?",
    "a": "Open the SAFE / Note Modeller tab on /capital. Pick SAFE or Convertible Note, then enter the investment amount, valuation cap, discount %, the expected priced-round pre-money, and your fully-diluted pre-round shares; for a note you also enter interest p.a. and term in years (SAFEs don't accrue interest). It shows the conversion price per share, shares issued, the final ownership %, and tells you whether the cap or the discount wins - the investor converts at the lower (better-for-them) of the two prices.",
    "route": "/capital",
    "keywords": "SAFE, convertible note, valuation cap, discount, conversion, ownership SAFE / Notes"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Where do I model 'what if I hire two people' or 'what if I land a big deal'?",
    "a": "Open the Scenario Planner at /scenarios. The Cash Planner tab has one-click presets - 'Hire 2 people', 'Land a ₹20L deal', 'Take a ₹10L loan', 'Lose top client' - or add a Custom event with its monthly ₹ impact, start month and duration. It runs the same Monte-Carlo engine as your forecast over a 6-month window and shows base vs scenario cash paths, runway change, and whether the plan is 'viable' or a 'cash crunch risk'.",
    "route": "/scenarios",
    "keywords": "scenario planner what if hire deal loan lose client preset model Scenario Planner"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Is there a tool to model fundraising dilution?",
    "a": "Yes, the 'Funding Dilution' tab on /scenarios. Enter pre-money valuation (₹ Cr), amount raised, target post-round ESOP % and founder ownership before the round. It computes post-money, investor stake, founder stake after, and founder dilution in points, and draws the post-round cap table. It models the ESOP top-up as created pre-money (standard term-sheet mechanic) so it dilutes existing holders, not the new investor. Liquidation preferences and multiple share classes aren't modelled here.",
    "route": "/scenarios",
    "keywords": "dilution fundraise pre money post money esop cap table investor founder Scenario Planner"
  },
  {
    "category": "Capital, credit & investors",
    "q": "I only have raw bank-statement text with Dr/Cr columns, not a clean CSV. How do I import it?",
    "a": "Use the 'Statement Parser' tab on /data. Paste the raw statement text one transaction per line, each starting with a date. It detects Dr/Cr (or debit/credit/withdrawal/deposit) keywords to set the sign, picks the transaction amount, and heuristically drops a trailing running-balance figure when a line has three or more numbers. It shows rows parsed, total credits and total debits, then lets you import. It's a best-effort heuristic - verify the amounts and Dr/Cr direction before committing, and note lines without a leading date are skipped.",
    "route": "/data",
    "keywords": "statement text dr cr debit credit running balance paste parse Statement Parser"
  },
  {
    "category": "Capital, credit & investors",
    "q": "I have a term sheet - where can I check the dilution before signing?",
    "a": "Two places. For a SAFE or convertible note, run the SAFE / Note Modeller on /capital - it shows the real ownership % the investor ends up with and whether the cap or discount triggers, so you don't accidentally over-dilute. For a priced round, use the Dilution at this Valuation card on /valuation to see pre-money, post-money, investor stake and what you retain (it flags >25% in red). The Valuation page also has a Liq-Pref Stack, Option-Pool Shuffle and Down-Round Impact section to stress-test term-sheet clauses.",
    "route": "/valuation",
    "keywords": "term sheet, dilution, before signing, liquidation preference, option pool, down round Term sheet / dilution"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Where do I see how much idle cash I have and what it's costing me?",
    "a": "Go to /treasury (labelled \"Wealth & Treasury\") and open the Overview tab. It pulls your total cash across all bank accounts, subtracts what you've already deployed into recorded positions, and shows Idle Cash plus the Yield Forgone per year (idle cash at ~3% savings vs ~7% in a liquid fund). An invested-vs-idle bar visualises the split, and any holding maturing within 30 days is flagged at the top so you redeploy it instead of letting it auto-renew at a poor rate.",
    "route": "/treasury",
    "keywords": "idle cash, treasury, yield forgone, surplus, overview, wealth Treasury"
  },
  {
    "category": "Capital, credit & investors",
    "q": "How do I decide how much cash to sweep into a liquid fund?",
    "a": "Open the Idle-Cash Sweep tab on /treasury. Enter your weekly opex and the liquid-fund yield, then drag the Buffer (weeks) and Sweep % sliders. It computes the buffer to hold liquid, the surplus above buffer, the recommended sweep amount and the extra yield per year. The recommendation reminds you that liquid funds redeem T+1 (with ₹50k/25% instant) so swept cash stays reachable for committed payables and payroll.",
    "route": "/treasury",
    "keywords": "sweep, liquid fund, buffer, idle cash sweep, surplus, park cash Treasury"
  },
  {
    "category": "Capital, credit & investors",
    "q": "How do I record my actual FDs, liquid funds or T-bills so the dashboard is accurate?",
    "a": "Use the Maturity Calendar tab on /treasury - that's where you record real positions (FD, liquid fund, T-bill, etc.) with amount, bank, rate and maturity date. These persist to the backend and feed the Overview's invested-vs-idle split and the 30-day maturity reminders. Until you record positions, Overview treats all your bank cash as idle. You can delete a position if it's redeemed.",
    "route": "/treasury",
    "keywords": "record FD, holdings, maturity calendar, positions, T-bill, liquid fund Treasury"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Can I keep deposits within deposit-insurance limits across banks?",
    "a": "Yes - open the Bank Exposure (DICGC) tab on /treasury. DICGC deposit insurance covers up to ₹5 lakh per depositor per bank, so the tool helps you keep balances within the insured limit per bank and avoid over-concentrating cash in one institution. Pair it with the Surplus Allocator (Conservative/Balanced/Growth tiers) and the Maturity Calendar for a diversified, safety-graded treasury.",
    "route": "/treasury",
    "keywords": "DICGC, deposit insurance, 5 lakh, bank exposure, concentration Treasury"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Where do I find what my company is worth?",
    "a": "Go to /valuation. The four headline cards show your annual revenue run-rate (3-month average × 12), an indicative valuation with a low-high range, the implied multiple, and how much you've raised so far - all pulled automatically from your live Headroom financials. The Assumptions panel lets you drag three sliders (revenue multiple, annual growth for DCF, discount rate for risk) and watch the Valuation-by-Method chart and football-field range update live.",
    "route": "/valuation",
    "keywords": "valuation, worth, company value, revenue multiple, DCF, range Valuation"
  },
  {
    "category": "Capital, credit & investors",
    "q": "How much equity will I give up if I raise at this valuation?",
    "a": "On /valuation scroll to the \"Dilution at this Valuation\" card. Drag the Amount to raise slider and it shows your pre-money, post-money, the investor's stake and how much you retain after the round. The investor-stake number turns red when you'd give away over 25% in one round - at which point it suggests a smaller raise or revenue-based financing via Credit. Buttons let you jump to /capital to start/manage the raise or to /credit to compare debt instead.",
    "route": "/valuation",
    "keywords": "dilution, equity given up, pre-money, post-money, investor stake, 25% Valuation"
  },
  {
    "category": "Capital, credit & investors",
    "q": "Is the valuation page linked to my actual raises?",
    "a": "Yes. The Valuation page reads your live capital raises from the backend (the same ones on /capital). The \"Raised So Far\" headline sums committed investor amounts across all your raises, and the dilution simulator seeds its \"Amount to raise\" slider from your active or draft raise's target (until you drag it). If the backend can't be reached it falls back to local figures and shows a notice.",
    "route": "/valuation",
    "keywords": "valuation linked to raises, raised so far, sync, capital page Valuation"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What's the difference between FIFO and Weighted average, and which should I pick?",
    "a": "Weighted average (the default) keeps one blended cost per item - every receipt re-averages and every issue leaves at that average. FIFO tracks each receipt as a separate lot and consumes the oldest lot first, so it can hold batch, mfg and expiry dates and supports FEFO issuing. Pick FIFO if you need batch/expiry tracking or strict first-in-first-out costing; otherwise Weighted average is simpler. You set this per item in the New item form's Valuation method field.",
    "route": "/books",
    "keywords": "FIFO weighted average WAVG valuation method costing difference Valuation"
  },
  {
    "category": "Capital, credit & investors",
    "q": "how do I export a board pack to send round before the meeting?",
    "a": "Honest answer: as a read-only viewer you can't export it yourself - the PDF/Excel buttons on Analytics and the Export button on CFO Brief are hidden for your role (export is disabled for viewers). The board-ready material lives on CFO Brief (/cfo-brief) under 'Investor Update (board)' and the Board-Deck Generator tab, and Analytics (/analytics) has a Monthly P&L pack - but an owner or finance manager has to generate and send those to you. Ask them to draft the Investor Update and Export it.",
    "route": "/cfo-brief",
    "keywords": "export board pack, download PDF, board deck, investor update, can't export Viewer · Board pack"
  },
  {
    "category": "Capital, credit & investors",
    "q": "What is the cash conversion cycle and where do I see mine?",
    "a": "The Cash Conversion Cycle (CCC) = DSO + DIO − DPO, the days between paying for inputs and collecting from customers - every day in it is cash you must fund yourself. See it on /working-capital: the KPI strip shows your CCC, DSO (receivables days), DIO (inventory days) and DPO (payables days), with a 'Where the days go' bar chart. Target is ≤45 days; above 75 turns red. The CCC Dashboard tab adds a 6-month trend and sector peer benchmark.",
    "route": "/working-capital",
    "keywords": "cash conversion cycle ccc dso dio dpo working capital days Working Capital"
  },
  {
    "category": "Capital, credit & investors",
    "q": "How do I fund a working-capital gap - what's the cheapest option?",
    "a": "When you have a gap, /working-capital lists financing options ranked by true effective annual cost, with the cheapest tagged 'CHEAPEST'. Each row shows how it works, effective annual %, monthly cost and speed, with a button to the relevant module (e.g. /credit). There are also specialist tabs: WC Loan Sizer, Factoring vs OD, Bill Discounting, Debtor Financing and an OD/CC Utilisation & Drawing-Power tracker.",
    "route": "/working-capital",
    "keywords": "working capital loan funding cheapest option overdraft factoring bill discount cost Working Capital"
  },
  {
    "category": "Sales & CRM",
    "q": "How do I calculate sales commissions and track target vs actual?",
    "a": "On /sales, the Commissions tab lets you add closed-won deals (rep, deal value, margin) and computes payout on a flat rate you set, or a tiered scheme where bigger deals earn more (4% / 6% / 8% bands). The Target vs Actual tab tracks a monthly target against actual and flags on-track / near-miss / below-target. Rep Leaderboard ranks reps. These are sales-ops tools that store data in your synced feature data.",
    "route": "/sales",
    "keywords": "commission calculator target actual quota leaderboard rep payout incentive Commissions & targets"
  },
  {
    "category": "Sales & CRM",
    "q": "How do I check if a discount needs approval or kills my margin?",
    "a": "On /sales open the Discount Approval tab. Enter the list price, your cost, the discount asked %, commission %, your floor margin % and the approval-over-discount threshold. It computes net price, commission, gross and net margin and net margin %, then flags 'below floor' if the net margin drops under your floor and 'needs approval' if the discount exceeds your threshold - so reps know before they commit a price. It's a calculator; it doesn't route an approval request to anyone.",
    "route": "/sales",
    "keywords": "discount approval margin floor threshold commission price calculator Discounts"
  },
  {
    "category": "Sales & CRM",
    "q": "Where do I log field visits and calls to a customer?",
    "a": "Two options. On /crm a lead's drawer captures activity: 'Log outbound response' records an outbound EMAIL activity (and updates the SLA), shown on the lead's Timeline alongside status changes, tasks and notes. For a broader rep activity feed (calls, visits), /sales has an Activity Log tab. The Day-Sheet / Day Summary field-sales reconciliation (van stock, cash collected) lives in the operations area, not in CRM.",
    "route": "/crm",
    "keywords": "log activity call visit field timeline outbound response notes Field sales"
  },
  {
    "category": "Sales & CRM",
    "q": "Can I model a slow month or a sales dip in the forecast?",
    "a": "Yes. On /forecast (Probabilistic tab) drag the 'Slow month - what's the worst case?' slider down from 100% to see your P10 impact update live. Below it, the 'Burn rate inflation' slider lets you push outflows from 80% (leaner) up to 150% to test rising costs. If revenue drops below 70% or burn rises above 120% you get a red warning suggesting a credit buffer.",
    "route": "/forecast",
    "keywords": "slow month sales dip revenue drop burn inflation slider what if stress Forecast"
  },
  {
    "category": "Sales & CRM",
    "q": "How do I add a new lead?",
    "a": "On /crm open the Leads tab and click New lead. Fill in name, company, source (e.g. Referral, Website), email, phone and a Priority (the priority drives which SLA tier applies). You only need one of name, company or email to save. The lead lands in the table with an auto-calculated Score and an SLA badge; click any row to open its detail drawer for the full timeline and actions.",
    "route": "/crm",
    "keywords": "new lead add capture enquiry create Leads"
  },
  {
    "category": "Sales & CRM",
    "q": "How do I convert a lead into a deal?",
    "a": "Click the lead row on the Leads tab to open its drawer, then hit Convert to deal. Headroom auto-creates an Account and a Contact from the lead and drops a deal card onto the Pipeline board, carrying the lead's value and expected close date so the deal isn't ₹0. The button only shows while the lead is still open - once it's converted (status CONVERTED) the option disappears. Convert is one-way per lead.",
    "route": "/crm",
    "keywords": "convert lead deal qualify account contact Leads"
  },
  {
    "category": "Sales & CRM",
    "q": "Where do I work when I'm at a customer counter or in the van with no signal?",
    "a": "Open the Field & Offline screen at /field. It's a toolbox built for on-the-ground finance - Kirana Quick-Bill, Field Collection, Van Day-Sheet, Visit Log, Order Booking, Proof of Delivery, KM expense claims and more. Anything involving money is captured into a local Offline Queue and held safely on the device; it never needs a connection to record. The top of the page shows a live Network (Online/Offline) tile and a Pending sync count.",
    "route": "/field",
    "keywords": "field offline van counter no signal bharat rural Offline / field"
  },
  {
    "category": "Sales & CRM",
    "q": "Will my queued field entries sync automatically when I get back online, or do I have to remember to press a button?",
    "a": "They sync automatically. The Offline Queue watches your connection, and the moment it flips from offline back to online with pending items, it flushes them to the ledger for you - so a field rep who walks back into coverage doesn't have to remember anything. You can still force it manually with the 'Sync now (N)' button in Field & Offline > Offline Queue, and retry any single failed entry with its refresh icon.",
    "route": "/field",
    "keywords": "auto sync reconnect online offline queue flush field Offline / field"
  },
  {
    "category": "Sales & CRM",
    "q": "How do I know if Headroom thinks I'm online or offline?",
    "a": "Two places. App-wide, a sticky amber 'You're offline - showing the last synced data' banner appears at the top whenever you lose connection and disappears when it returns. For detail, open Field & Offline > Connectivity (/field): it shows navigator.onLine status, effective connection type (e.g. 4g/3g), estimated downlink in Mbps and whether data-saver is on. Some of those fields show 'Not reported' on browsers that don't expose the Network Information API, but basic online/offline detection works everywhere.",
    "route": "/field",
    "keywords": "online offline status connectivity banner network signal Offline / field"
  },
  {
    "category": "Sales & CRM",
    "q": "Is there a simple grid where I can tick exactly what Finance, CA, Sales and Ops can each do?",
    "a": "Yes - Organization → Roles & Access opens with the 'Role & Permission Matrix' card. It's a grid of four team types (Finance, CA / Accountant, Sales, Operations) against six capabilities: view cash & runway, add/edit transactions, approve payments, manage invoices, view reports & exports, and manage team & settings. Tick a box to grant; it saves automatically and syncs across your devices. Each column header shows how many of the six are granted.",
    "route": "/organization#access",
    "keywords": "permission matrix grid grant tick capabilities finance ca sales ops Permission matrix"
  },
  {
    "category": "Sales & CRM",
    "q": "I can see the pipeline but the New deal / New lead buttons are missing - why?",
    "a": "Adding or editing in CRM requires a write role: owner, finance manager, accountant, sales, operations manager or super admin. Roles like viewer (and the advisor/client read-only view) can browse the pipeline, leads, accounts and contacts but the New deal, New lead, New account, Convert and stage-move controls are hidden. Ask an owner to change your role if you need to create records.",
    "route": "/crm",
    "keywords": "permission viewer read only cannot add button missing role write Permissions"
  },
  {
    "category": "Sales & CRM",
    "q": "How do I add a deal directly without a lead?",
    "a": "On the /crm Pipeline tab click New deal (you need a write role - owner, finance, accountant, sales or operations). Enter a title, an optional value in ₹, pick the starting stage (Qualification/Demo/Proposal/Negotiation) and optionally link an Account. The deal appears in its stage column immediately. The /sales Pipeline tab can also add deals (title, customer, rep, value, source) and writes the same CRM deal.",
    "route": "/crm",
    "keywords": "new deal add create pipeline directly without lead Pipeline"
  },
  {
    "category": "Sales & CRM",
    "q": "What do the Weighted pipeline and Won value numbers at the top of the pipeline mean?",
    "a": "The stat strip on /crm Pipeline shows three figures: Weighted pipeline (open deal values multiplied by each stage's win probability, so it's a risk-adjusted forecast not the raw total), Open deals (count currently in the four open stages), and Won value (₹ from deals you've marked Won). The line below also breaks out won · open · lost counts. These same pipeline metrics feed the Insights and Dashboard 'at a glance' panels.",
    "route": "/crm",
    "keywords": "weighted pipeline won value open deals probability forecast stats meaning Reporting"
  },
  {
    "category": "Sales & CRM",
    "q": "where do I log the calls and meetings I did today?",
    "a": "Use the Activity Log tab on /sales to record calls, meetings and touches against deals, and the Response Time tab to see how fast leads are getting a first reply. Logging activity feeds the Rep Scorecard so your effort actually shows up when targets are reviewed.",
    "route": "/sales",
    "keywords": "activity log calls meetings touches response time rep scorecard Sales · Activity"
  },
  {
    "category": "Sales & CRM",
    "q": "can I give this customer a bigger discount or do I need approval?",
    "a": "Use the Discount Approval tab on /sales to route a deal discount for sign-off, and check the Rate Card tab for your approved price list so you are not quoting below floor. When you build the quote in Quote to Order, the net-margin % line turns red if you have priced below the margin floor - your live guardrail before you commit a discount.",
    "route": "/sales",
    "keywords": "discount approval price floor margin rate card authorisation Sales · Discounts"
  },
  {
    "category": "Sales & CRM",
    "q": "how do I get a realistic forecast instead of the optimistic one?",
    "a": "Open the Sales Forecast tab on /sales and tune the per-stage win probabilities to match your own history - the weighted forecast then reflects reality, not wishful thinking. Pipeline Velocity and Conversion Funnel tabs show how fast deals move and where they leak, which is what drives a believable number.",
    "route": "/sales",
    "keywords": "forecast weighted pipeline win probability realistic projection velocity funnel Sales · Forecast"
  },
  {
    "category": "Sales & CRM",
    "q": "where do I rank against the other reps?",
    "a": "Open the Rep Leaderboard tab on /sales - it ranks reps from your deals and win/loss data so you can see who is ahead on closed-won and pipeline. The overview also surfaces open pipeline, weighted forecast and overdue follow-ups per rep, which is what your sales head looks at in the Monday review.",
    "route": "/sales",
    "keywords": "leaderboard rank rep performance scorecard standings Sales · Leaderboard"
  },
  {
    "category": "Sales & CRM",
    "q": "where do I see all my deals and move them along?",
    "a": "Open /sales and go to the Pipeline tab. Add a deal under 'Add a deal' (title, customer, rep, value in Rs, and a Source like WhatsApp/IndiaMART/JustDial), then use the small left/right arrows on each card to push it Enquiry to Quoted to Negotiation to Won or Lost. The 'Weighted forecast' tile updates as deals progress so you see your probability-adjusted number, not just the raw open value.",
    "route": "/sales",
    "keywords": "pipeline kanban deals stages move card forecast Sales · Pipeline"
  },
  {
    "category": "Sales & CRM",
    "q": "which lead source actually makes me money - IndiaMART, JustDial or WhatsApp?",
    "a": "Set a Source on every deal and lead, then open the Source ROI tab on /sales and enter your spend per channel. It shows which sources return more than they cost so you can kill the channels that bleed money. The catch is the data only works if you tag the Source on each deal as you add it.",
    "route": "/sales",
    "keywords": "source roi lead source indiamart justdial whatsapp channel marketing spend Sales · Sources"
  },
  {
    "category": "Sales & CRM",
    "q": "am I on track for my monthly target?",
    "a": "Open the Target vs Actual tab on /sales and enter each rep's monthly target and achieved figure. It shows team target, team achieved and an Attainment % that turns green at 100%+, yellow at 70%+ and red below - so you instantly see who is on-track, near-miss or below-target.",
    "route": "/sales",
    "keywords": "target quota attainment monthly number achieved on track Sales · Targets"
  },
  {
    "category": "Sales & CRM",
    "q": "how do I split my area between reps by pincode?",
    "a": "Open the Territory Planner tab on /sales. Add a territory with a name, the assigned rep, the pincodes it covers, account count and potential value - it totals territories, accounts and potential so you can balance patches fairly. Pair it with Revenue / Region to see which areas actually generate sales.",
    "route": "/sales",
    "keywords": "territory pincode area beat region split assign reps coverage Sales · Territory"
  },
  {
    "category": "Sales & CRM",
    "q": "why am I losing deals and what's my win rate?",
    "a": "Use the Win / Loss tab on /sales. Log each closed deal with the outcome and a reason - it computes your Win rate (green at 50%+), won vs lost deal counts and value won. Reviewing the loss reasons tells you whether you are losing on price, timing or competition so you can fix your pitch.",
    "route": "/sales",
    "keywords": "win rate loss reason lost deals analysis why losing Sales · Win/Loss"
  },
  {
    "category": "Sales & CRM",
    "q": "I added a deal in /sales but don't see it in /crm - why?",
    "a": "The /sales Pipeline and Leads tabs sync to the same CRM backend, but a deal only appears in /crm once it was successfully written to the server. If the CRM call failed (offline/error), /sales keeps the deal locally on that device with a 'saved locally - couldn't reach the CRM' message, and it won't show in /crm or on other devices. Re-add it while online so it gets a CRM id. Analytics tabs (Win/Loss, Territory, Commissions, etc.) are separate trackers and never appear in /crm by design.",
    "route": "/crm",
    "keywords": "sync missing deal sales crm local offline not showing Sync & data"
  },
  {
    "category": "Sales & CRM",
    "q": "How do I mark a deal as lost and why does it ask for a reason?",
    "a": "On the deal card click the X (Mark lost) - Headroom prompts for a reason, which is required (the backend rejects a Lost move without a lost_reason). The reason feeds win/loss analysis. You can also mark a lead unqualified/junk from its drawer, which similarly asks for a lost reason. To analyse patterns, open the Win / Loss tab on /sales, which tallies your top loss reasons and computes your win rate.",
    "route": "/crm",
    "keywords": "lost mark lose reason why required deal Win/loss"
  },
  {
    "category": "Sales & CRM",
    "q": "Where can I see my win rate and the top reasons we lose deals?",
    "a": "Go to /sales and open the Win / Loss tab (trophy icon). Log each outcome with the deal name, value, won/lost and a reason; it then shows your win rate (won ÷ total) and a ranked tally of loss reasons so you can spot whether you're losing on price, timing or competitor. Note this tracker stores its entries in your synced feature data, separate from the live CRM deal records - log outcomes here for the analytics view.",
    "route": "/sales",
    "keywords": "win rate loss reasons tracker analysis why losing Win/loss"
  },
  {
    "category": "Planning & analytics",
    "q": "How do I set the cash level that triggers a low-cash alert?",
    "a": "In Alerts Centre click 'Configure' (top right) at /alerts and drag the 'Safety buffer (days of expenses)' slider to the number of days of expenses you want as your cash floor, then Save (valid range is shown). The page tells you the rupee value of that buffer (days × daily burn). The severity rules are spelled out there too: balance going negative within 30 days is Critical (in-app + email + WhatsApp), below the safety buffer within 45 days is a Warning, and unusual spend is Info (in-app only).",
    "route": "/alerts",
    "keywords": "safety buffer threshold low cash days configure slider runway floor Alerts"
  },
  {
    "category": "Planning & analytics",
    "q": "Can I make my own alert rule, like 'tell me when balance drops below 5 lakh'?",
    "a": "Yes - use the Threshold Builder tab in Alerts Centre (/alerts). Pick a metric (total bank balance, monthly burn, runway, last-30-day revenue or expense), choose 'crosses below' or 'crosses above', and enter a value (₹ or days). Each rule is evaluated live against your latest synced data, so a breach shows the moment your numbers cross the line, and a red summary lists every rule currently breached. Rules persist and sync across devices.",
    "route": "/alerts",
    "keywords": "custom alert rule threshold balance below runway burn revenue metric Alerts"
  },
  {
    "category": "Planning & analytics",
    "q": "What are the Benchmarks and are they real peer data?",
    "a": "The Benchmarks tab on /analytics compares your ratios (Payroll/Revenue, OpEx/Revenue, Net Profit Margin, Tax/Revenue) against typical SMB reference figures. Important: these are static reference points, NOT live peer data for your specific sector - the page says so explicitly. For a sector cash-cycle comparison there's a peer-median CCC benchmark under Working Capital (/working-capital → CCC Dashboard).",
    "route": "/analytics",
    "keywords": "benchmark peer industry comparison reference ratios real data sector Analytics"
  },
  {
    "category": "Planning & analytics",
    "q": "How do I create a budget and track spend against it?",
    "a": "Go to /budgets and click 'New Budget' (or the dashed 'Add budget category' card). Give it a name, pick a category (expense, payroll, tax, loan, transfer, other), set a monthly limit and a colour. Headroom then tracks actual spend live from your transactions in that category for the current month - each card shows spent vs limit with a progress bar that turns yellow at 80%+ and red when overspent, plus a comparison to last month.",
    "route": "/budgets",
    "keywords": "budget create monthly limit track spend vs limit alert overspend Budgets"
  },
  {
    "category": "Planning & analytics",
    "q": "Why does my budget show spend I didn't enter?",
    "a": "Budgets match actual spend automatically - they sum every outflow transaction in that category for the current month from your live transaction data, so you never key in actuals. If a budget shows unexpected spend, check that your transactions are tagged with the right category. The 'Budget Alerts' summary at the top of /budgets counts how many budgets are over or near (80%+) their limit.",
    "route": "/budgets",
    "keywords": "budget actual spend automatic category transactions wrong unexpected Budgets"
  },
  {
    "category": "Planning & analytics",
    "q": "Does Headroom have zero-based or annual budgeting?",
    "a": "Yes - the advanced tools strip below the budget cards on /budgets includes a Zero-Based Builder (justify every line from a clean slate, or roll a prior month forward) and an Annual Builder (enter one yearly figure and spread it evenly or on a festival-weighted seasonal curve with an Oct-Nov skew). There's also a Variance Report, Flexible Budget, Cash Budget, Department Allocation with approvals, Capex Tracker, Reforecast, Cost-Cutting and Contingency planners.",
    "route": "/budgets",
    "keywords": "zero based annual budgeting seasonal variance flexible capex department Budgets"
  },
  {
    "category": "Planning & analytics",
    "q": "Can I allocate budget to departments and route it for approval?",
    "a": "Yes, use the 'Dept Allocation' tool on /budgets. Set a total budget pool, allocate amounts across departments, and route each allocation through draft → submit → approve/reject sign-off. Each line shows live month spend for that category against its allocation and flags over-allocation. The Capex Tracker works similarly with planned → approved → completed status and logs actual spend to surface overruns.",
    "route": "/budgets",
    "keywords": "department allocation approval pool submit approve reject capex sign off Budgets"
  },
  {
    "category": "Planning & analytics",
    "q": "Which clients should I call today?",
    "a": "Work the Needs Attention group at the top of the /advisor Clients tab - it auto-collects any client with unread alerts or under 45 days of runway. Those are where a proactive call wins trust and protects retainer renewals. Click Forecast on a client card to drop straight into their cash-flow forecast before you ring them.",
    "route": "/advisor",
    "keywords": "needs attention, who to call, at risk clients, daily worklist, low runway CA · Daily workflow"
  },
  {
    "category": "Planning & analytics",
    "q": "Why did my connector sync fail or show an error?",
    "a": "When a real sync fails, Headroom surfaces the actual backend error (for example a 503 'Set AA_CLIENT_ID…') rather than faking a synced state - that usually means the live integration credentials aren't configured yet on the server. Use the 'Connector Health & Sync Monitor' on /connectors to see each connector's status: a feed is flagged 'Stale' after 24h with no sync, 'Failing' on an error, and you can hit retry. The simulated AA / e-commerce demo tools are labelled as client-side only and don't make live calls.",
    "route": "/connectors",
    "keywords": "sync failed error stale connector health monitor retry 503 credentials Connectors"
  },
  {
    "category": "Planning & analytics",
    "q": "After importing, how do I check my data is clean before I file or forecast?",
    "a": "Open the 'Data Quality' tab on /data. It scans your transactions and gives a health score plus per-check counts: missing description, missing counterparty, invalid/blank date, zero amount, future-dated, no bank account linked, and likely duplicates (same date + amount + counterparty). Fix anything flagged in red on the Transactions page, run Dedupe for duplicates, and re-check. Clean data here makes the dashboard, P&L and forecasts trustworthy everywhere else.",
    "route": "/data",
    "keywords": "data quality health score validate clean check missing duplicate before filing Data quality"
  },
  {
    "category": "Planning & analytics",
    "q": "why does it look like the bank overcharged us on fees this month?",
    "a": "Open /banking Bank-Fee Analyzer - it scans every charge debit it found (NEFT/RTGS chg, AMC, min-balance, GST on charges) and shows how much you paid over benchmark. Take the 'Over benchmark' figure to your relationship manager to negotiate. For the cheapest way to make a transfer, use the Payment Rail tool on the same page before any large payout.",
    "route": "/banking",
    "keywords": "bank charges fees overcharged neft rtgs amc min balance benchmark Finance manager · Bank charges"
  },
  {
    "category": "Planning & analytics",
    "q": "What is the Altman Z-score / distress indicator?",
    "a": "On /health, scroll to the 'Distress (Z')' section. It's an Altman Z'-style distress indicator built from your liquidity, profitability and leverage proxies - it flags whether the business sits in a safe, grey or distress zone. There's also a Distress Early-Warning Checklist of eight live red flags lenders watch (negative operating cash flow, runway under 90 days, DSCR below 1.25x, current ratio below 1, over 40% receivables overdue, customer concentration over 40%, CCC over 75 days, negative net working capital).",
    "route": "/health",
    "keywords": "altman z score distress bankruptcy early warning red flags solvency Financial Health"
  },
  {
    "category": "Planning & analytics",
    "q": "Can I stress-test the business against a downturn?",
    "a": "Yes. The Liquidity Stress Test on /health lets you drag four levers - revenue drop %, % of receivables stuck this quarter, operating-cost rise %, and minimum cash buffer in months - and instantly see your runway today vs under the shock and whether you'd breach your cash safety floor. A green/red verdict tells you if you survive. There's a matching Liquidity Stress Test inside /forecast and /working-capital too.",
    "route": "/health",
    "keywords": "stress test downturn shock recession revenue drop survive buffer simulation Financial Health"
  },
  {
    "category": "Planning & analytics",
    "q": "Does the health score track over time?",
    "a": "Yes - the 'Fitness Trend' section on /health records a durable monthly fingerprint of your score and its top driver/drag, then charts the trajectory so you see momentum, not just today's number. On day one it synthesises an estimated back-trend from your revenue history so the chart isn't empty, then captures the real score once per calendar month going forward.",
    "route": "/health",
    "keywords": "health score over time trend history momentum track monthly Financial Health"
  },
  {
    "category": "Planning & analytics",
    "q": "How do I generate a cash flow forecast?",
    "a": "Go to /forecast (Cash Flow Forecast) and click the green 'Generate Forecast' button at the top right. It runs a Monte-Carlo engine over your transaction history to produce a 90-day projection with P10 (worst case), P50 (expected) and P90 (best case) bands. You need some transaction history first - if you have none, you'll get a 'Add some transactions first' error, so connect a bank account or add transactions in the Dashboard before generating.",
    "route": "/forecast",
    "keywords": "cash flow projection generate 90 day monte carlo Forecast"
  },
  {
    "category": "Planning & analytics",
    "q": "What do P10, P50 and P90 mean on the forecast chart?",
    "a": "They are probability bands from the Monte-Carlo simulation on /forecast. P50 is the expected (median) path, P90 is the best-case 'good month' outcome, and P10 is the worst-case 'bad 10% of months' outcome. The risk strip above the chart turns each into plain metrics: breach probability, expected time to pressure, Cash-Flow-at-Risk (95%), and likely runway with its worst case. Tap any band in the legend to show or hide it.",
    "route": "/forecast",
    "keywords": "p10 p50 p90 bands probability percentile worst best expected Forecast"
  },
  {
    "category": "Planning & analytics",
    "q": "Where do I see my runway / how many days of cash I have left?",
    "a": "On /forecast the 'Likely runway' card in the risk strip shows your median (P50) runway in days plus the worst-case (P10). The Financial Health page (/health) also has a dedicated Cash-Runway Gauge showing months of survival, and the Runway ratio links straight back to /forecast. Runway is cash on hand divided by your net monthly burn, computed live from your transactions.",
    "route": "/forecast",
    "keywords": "runway days left cash out burn survival Forecast"
  },
  {
    "category": "Planning & analytics",
    "q": "why is my cash going down so fast?",
    "a": "Open /spend - it reads every payment out and flags duplicate vendors, subscriptions creeping up (+15% or more), and cost heads running over your own 12-month norm. /transactions has 'Category Spend Spike' and 'Spend Velocity' intelligence cards that catch runaway costs before month-end. You can also ask /copilot 'Why is cash down?' directly and it answers from your live numbers. Monthly Burn is a headline card on /dashboard.",
    "route": "/spend",
    "keywords": "burn rate, spending too much, expenses high, money leaking, where money goes Owner · Burn"
  },
  {
    "category": "Planning & analytics",
    "q": "what's my runway right now?",
    "a": "Your Cash Runway is one of the four stat cards on /dashboard (alongside Total Balance, Monthly Burn and Unread Alerts), computed live from your connected bank balances and burn. For the detailed view open /forecast, which shows Likely runway with a confidence range, or /capital's Runway Planner where cash on hand and monthly burn are pre-filled from your last 90 days of transactions and you can pull Cost-cut and Capital-raise levers to extend it.",
    "route": "/dashboard",
    "keywords": "how many months left, days of cash, runway Owner · Runway"
  },
  {
    "category": "Planning & analytics",
    "q": "Why can't I generate a forecast or export - it's greyed out?",
    "a": "Generating a forecast is disabled in read-only (client) view - the 'Generate Forecast' button on /forecast shows a 'Read-only in client view' tooltip when disabled. Similarly, analytics PDF/Excel export buttons on /analytics only appear when your role has export permission. If you're a viewer or external client, you can read the planning screens but can't trigger writes or exports; an owner or finance user can.",
    "route": "/forecast",
    "keywords": "read only greyed disabled cant generate export permission viewer client role Permissions"
  },
  {
    "category": "Planning & analytics",
    "q": "What does the Predict page do that the forecast doesn't?",
    "a": "/predict is an AI/statistical prediction studio with 27 tabs built on a 'digital twin' of your live numbers. Beyond cash forecasting it has What-If sliders, Monte-Carlo cash, Scenario Compare, Early Warning, Trend Projection, Churn Risk, Break-Even, Sensitivity, Goal Probability, Run-Rate, Expense Creep, Customer LTV, Pay-Delay, Cohort Retention, Cash-Out Day, Invoice Pay-Date, GST Liability, Payroll Stress, Debt Service and Profit Trajectory. It's the deepest 'what could happen' toolkit; /forecast is the focused 90-day cash view.",
    "route": "/predict",
    "keywords": "predict prediction digital twin monte carlo churn ltv goal probability sensitivity Predict"
  },
  {
    "category": "Planning & analytics",
    "q": "what's this 'AI CFO' thing I keep seeing - is it useful or gimmicky?",
    "a": "It's a plain-English finance layer over your real numbers. /cfo-brief drafts a weekly owner summary or board update and builds a KPI scorecard, risk watchlist and board deck from your live data. /copilot gives a daily brief, a ranked to-do list, and answers questions like 'why is cash down?'. It doesn't move money - every suggestion links you to the page that does the work - but it saves you assembling reports by hand.",
    "route": "/cfo-brief",
    "keywords": "ai cfo, copilot, ai, assistant, virtual cfo, is the ai useful Prospect · AI CFO"
  },
  {
    "category": "Planning & analytics",
    "q": "will this tell me before I run out of cash?",
    "a": "That's the core promise. Your Dashboard shows live Cash Runway and a red banner with the Monte-Carlo 'chance of dipping below your safety buffer'. /forecast projects 90 days of cash in best/expected/worst case and flags roughly when you'd hit pressure. /alerts is an early-warning system you can configure with a cash floor and custom thresholds. Together they're meant to warn you weeks ahead, not at month-end.",
    "route": "/forecast",
    "keywords": "run out of cash, runway, cash warning, alerts, will i run dry Prospect · Will it warn me"
  },
  {
    "category": "Planning & analytics",
    "q": "How is the Scenario Planner different from the scenarios on the Forecast page?",
    "a": "The /forecast scenarios are simple single-event toggles baked into your 90-day forecast. The /scenarios Scenario Planner is a richer 6-month modelling studio with presets, multi-event stacking, and 21 specialised calculators (price changes, break-even, revenue shock, cost-cut, marketing ROI, buy-vs-lease, debt-vs-equity, FX shock, churn, automation ROI and more). Both share the same Monte-Carlo engine, so results are consistent.",
    "route": "/scenarios",
    "keywords": "difference forecast scenarios planner price break even revenue shock Scenario Planner"
  },
  {
    "category": "Planning & analytics",
    "q": "How can I track where the money I raised is being spent?",
    "a": "Open the Use of Funds tab on /capital. Enter the total capital you raised, then use + Add allocation to create lines (e.g. Hiring, Marketing, Capex) with a committed amount and a deployed amount. The summary cards show total Committed, Deployed, Remaining (committed minus deployed) and Uncommitted (raised minus committed) - and it warns in red if you over-commit beyond what you actually raised. Each line shows a deployed-% progress bar.",
    "route": "/capital",
    "keywords": "use of funds, committed, deployed, allocation, spend tracking Use of funds"
  },
  {
    "category": "Planning & analytics",
    "q": "how does this company compare to others in its industry?",
    "a": "Open Benchmarks (/benchmarks). Pick the sector at top-right (it defaults to Manufacturing SMB) so the bands are relevant, then read the Peer score dial and the metric breakdown comparing the company against P25/Median/P75 on 20 metrics - gross margin, runway, collection days, growth, valuation, tax burden and more. With 12 months of history loaded it benchmarks against the company's own trailing-12-month quartiles, which is a more honest read.",
    "route": "/benchmarks",
    "keywords": "industry comparison, peers, how do we stack up, percentile, benchmark Viewer · Benchmarks"
  },
  {
    "category": "Planning & analytics",
    "q": "where's the cash trend? I want to see if the balance is going up or down",
    "a": "Two places. The Dashboard (/dashboard) shows Total Balance, Monthly Burn and Cash Runway as stat cards with up/down trend arrows, plus a Revenue Trend tile showing month-on-month change. For the forward-looking view, open Forecast (/forecast), which projects the cash curve and flags the chance of dipping below the safety buffer. Analytics (/analytics) gives you the historical revenue-vs-expenses trend with a 3M/6M/12M toggle.",
    "route": "/dashboard",
    "keywords": "cash trend, balance going up down, burn, runway, cashflow chart Viewer · Cash trend"
  },
  {
    "category": "Planning & analytics",
    "q": "is there a plain-English summary I can read instead of digging through numbers?",
    "a": "Yes - CFO Brief (/cfo-brief) is exactly that. The AI Brief tab writes a plain-language summary with Key Metrics, Cash & Risk Alerts and the Top 3 Action Items, drafted from the company's live numbers. Switch the audience toggle to 'Investor Update (board)' for a board-framed version. The Risk & Watchlist and KPI Scorecard tabs give you a red/amber/green read in seconds. Note you can read all of it, but the Export/Copy-to-send buttons are owner-only for your role.",
    "route": "/cfo-brief",
    "keywords": "summary, plain english, what's going on, CFO brief, board update Viewer · CFO brief"
  },
  {
    "category": "Planning & analytics",
    "q": "what happens to cash over the next few months - can I see the projection?",
    "a": "Open Forecast (/forecast). It projects the cash curve forward and shows the probability of dipping below the company's safety buffer (a Monte-Carlo style range, not a single line). You can read the scenario but, being read-only, you can't change assumptions or generate a new run - ask the owner to model a downside case if you want to stress-test it. The Dashboard's red 'X% chance of dipping below buffer' banner is driven by this same forecast.",
    "route": "/forecast",
    "keywords": "forecast, projection, future cash, will we run out, scenario Viewer · Forecast"
  },
  {
    "category": "Planning & analytics",
    "q": "where do I see the business health score and what's dragging it down?",
    "a": "Open Financial Health (/health) for the full composite score built from cash, receivables, debt, growth, compliance and concentration - each pillar is scored separately so you can see exactly which one is pulling the number down. The Dashboard (/dashboard) also shows a Business Health Score ring; tap it to expand the four sub-scores (Cash, Revenue, Debt, Compliance). The score recomputes live from every module, so it reflects the latest data the team has entered.",
    "route": "/health",
    "keywords": "health score, business health, what's wrong, sub scores, financial fitness Viewer · Health score"
  },
  {
    "category": "Planning & analytics",
    "q": "how many months of runway does the company have left?",
    "a": "Runway is on the Dashboard (/dashboard) Cash Runway stat card and on Financial Health (/health), which shows it against a 90-day target (green at 90+ days). For the projected view - how runway changes if revenue or burn shifts - open Forecast (/forecast). CFO Brief (/cfo-brief) also surfaces Runway as a headline metric on its AI Brief tab. Anything under 45-60 days is the number to raise at the board meeting.",
    "route": "/health",
    "keywords": "runway, how long cash lasts, months left, burn rate Viewer · Runway"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "I get a 403 or permission error trying to open a page",
    "a": "Each role can only reach the tabs granted to it - if a page isn't in your role's accessible set it won't appear in the nav and is blocked. For example Sales can't open banking or payroll, and Operations Manager can't open cap table. If you genuinely need a page, ask a workspace owner to grant it: owners can add tabs to any role in Settings (the per-role tab editor), or reassign you to a role that already includes it.",
    "route": "/settings",
    "keywords": "403 forbidden permission denied cannot access page blocked role tabs not visible 403 / permission"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Who can see what - how do roles work?",
    "a": "Each invited teammate gets a role that shapes what they see: Owner (everything), Finance Manager (cash, AR/AP, GST, tax, payroll), Accountant/CA (books, GST/tax filing, compliance + their own client portal), Sales (invoices, receivables, collections, CRM), Operations (orders, inventory, vendors, spend), Viewer (read-only dashboards), Investor (portfolio, raises, valuation). Invite people and set roles in Settings → Team.",
    "route": "/settings",
    "keywords": "roles permissions team invite who sees access viewer Account & roles"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "I'm a CA - how do I manage multiple clients?",
    "a": "Open the Advisor / CA Portal. Click 'Add Client' and paste the business's Tenant ID (they copy it from their Settings). Every client then appears in one list with live balance, runway, alerts and filing status - you can switch into any client's books, track GST/TDS/ITR filings, chase documents and send branded monthly reports, all without logging in separately.",
    "route": "/advisor",
    "keywords": "ca accountant clients multi practice advisor portal tenant Account & roles"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Why can't I edit anything? (read-only)",
    "a": "Your role is read-only (e.g. Viewer, or a board member). You can explore every dashboard, analytics and report, but changes are disabled - you'll see a read-only banner at the top. Ask a workspace owner to give you an editing role in Settings → Team.",
    "keywords": "read only cant edit disabled viewer permission Account & roles"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "When I add my accountant to my team, will they automatically get the Advisor portal?",
    "a": "Yes - the Accountant / CA role's scope includes the Advisor portal for their own linked clients, and on sign-in a user with that role lands on /advisor rather than the dashboard. Note that linking your business into their portfolio is a separate step: they still add you using your Tenant ID inside their own Advisor portal. Being a team member and being a portfolio client are two different connections.",
    "route": "/advisor",
    "keywords": "accountant ca role advisor portal lands on automatic tenant id link difference Accountant role"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "How do I see problems across all my clients in one feed instead of per business?",
    "a": "The Alert Feed tab on /advisor aggregates alerts across your whole portfolio, with a badge count of the non-low-severity ones. That's your portfolio-level early warning - a client showing critical/high alerts plus low runway is your priority call. Each business also has its own Alerts Centre (/alerts) for the configurable thresholds.",
    "route": "/advisor",
    "keywords": "alert feed, portfolio alerts, all clients alerts, warnings, early warning CA · Alerts"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "How do I track which documents I've asked each client for?",
    "a": "Use the Doc Tracker (and the Document Requests panel on the Practice tab) on /advisor to record what you've requested - bank statements, sales invoices, TDS certificates and so on - per client, with a \"Send link\" option to request it. Pair it with the Query Log tab to record the questions clients have raised so nothing slips between WhatsApp threads.",
    "route": "/advisor",
    "keywords": "doc tracker, missing documents, chase documents, request documents, pending docs CA · Chasing documents"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Where do I log the back-and-forth questions a client keeps asking me?",
    "a": "The Query Log tab on /advisor is for exactly that - record each client query so you (and your team) have a running trail per client instead of digging through email. It sits next to Doc Tracker so document requests and questions stay in one practice workspace.",
    "route": "/advisor",
    "keywords": "query log, client questions, log query, advisory notes, trail CA · Client queries"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Can Headroom generate an engagement letter for a new client?",
    "a": "Yes - open the Engagement tab on /advisor, pick the client, tick the scope of work (Monthly GST filing GSTR-1 & GSTR-3B, TDS computation and quarterly returns, annual ITR, statutory audit, ROC compliance MGT-7/AOC-4, monthly bookkeeping & MIS, or virtual-CFO retainer), set a fee and cadence (monthly/quarterly/annual), and it builds a ready-to-copy engagement letter on your Firm Setup branding.",
    "route": "/advisor",
    "keywords": "engagement letter, scope of work, retainer letter, client agreement, fee letter CA · Engagement letters"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Can I send a client a branded monthly report without rebuilding it in Excel?",
    "a": "Yes. On any client's card on the /advisor Clients tab click Report - it generates a white-label Monthly Financial Report showing their cash balance, revenue, expenses, net position and active alerts, under your firm branding from Firm Setup. You can then email it to the client straight from the modal.",
    "route": "/advisor",
    "keywords": "monthly report, white label report, client statement, mis, send report CA · Monthly reports"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Can I create my own tasks and deadlines across clients, not just the standard returns?",
    "a": "Yes - the Practice tab on /advisor lets you create tasks (e.g. \"File GSTR-3B for May 2026\") tied to a specific client with a type and deadline, and shows an \"Upcoming Deadlines Across All Clients\" view where each row is one statutory deadline against every linked client. It also holds the Document Requests panel for that client work.",
    "route": "/advisor",
    "keywords": "practice tab, tasks, deadlines, to-do, worklist, upcoming filings CA · Practice management"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "How accurate are the numbers I'm advising on - can I trust the auto-calculations?",
    "a": "Every figure is computed from the client's live transactions, balances, loans and invoices, so accuracy depends on the data being current and well-categorised. Always check the green \"Balanced\" badge in Books (/books), confirm categories are tagged, and treat sector benchmarks and ratio approximations as directional. The product itself flags this - confirm big decisions (and final filings) against your own review.",
    "route": "/books",
    "keywords": "accuracy, trust numbers, balanced badge, data quality, reliable, verify CA · Reliability"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "I'm a CA - how do I add a client to my multi-client portal?",
    "a": "Open the Advisor / CA portal at /advisor (the CA Practice screen). Click 'Add Client', paste the client's Tenant ID (ask the owner to copy it from their Organization → Company → Tenant ID card), optionally give it a display name, then 'Add to Portfolio'. The client appears with live balance, runway, alerts and underwriting score. The Tenant ID must belong to a real business or you'll get a 'No business found with that Tenant ID' error.",
    "route": "/advisor",
    "keywords": "ca portal add client tenant id link client multi-client advisor practice CA / advisor portal"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "How do I send a branded monthly report to a client from the CA portal?",
    "a": "First set your firm branding: on /advisor click 'Firm Setup' and enter your firm name, optional tagline and GSTIN - this stamps a white-label letterhead on reports. Then on any client card click 'Report' to open the monthly financial report (cash balance, revenue, expenses, net position and active alerts) and either 'Download PDF' or 'Email Client'. Until you set a firm name, reports go out as 'Your CA Firm' and a prompt nudges you to set it up.",
    "route": "/advisor",
    "keywords": "white label report monthly report firm branding letterhead pdf email client CA / advisor portal"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "As a CA, how do I remove a client from my portfolio, and does that delete their data?",
    "a": "On /advisor, each client card has a 'Remove' (unlink) button - confirm and the client drops out of your portfolio immediately. This only severs the advisor link in your view; it does not touch the client's own workspace or data, which stays entirely with them. You can re-add them later with their Tenant ID.",
    "route": "/advisor",
    "keywords": "unlink client remove portfolio ca disconnect does it delete data advisor link CA unlink"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Data showed up earlier but now it's gone - what happened?",
    "a": "First check the company switcher at the top: if you're an advisor in a client's view (or an owner previewing 'as' another role), you may be looking at a different namespace than your own. Exit client view / exit the preview from the banner to return to your data. Data also syncs from the server, so if the backend was briefly unreachable you may have seen an offline banner - your local data is intact and reloads once reconnected.",
    "keywords": "data disappeared gone vanished missing client view preview namespace offline reload Data not showing"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "I need a CSV of just one quarter or financial year for my CA - how?",
    "a": "Open the 'Date-Range Export' tab on /data. Set From and To dates (leave From blank to start at your earliest record), and it instantly shows the matched row count and net amount for that window. Click 'Export N rows CSV' to download transactions-FROM_to_TO.csv with date, amount, description, counterparty and category columns. It's the clean way to hand an auditor or CA exactly one period.",
    "route": "/data",
    "keywords": "quarter financial year audit period slice export ca Date-Range Export"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "A customer asked to see or delete their data - how do I handle the request?",
    "a": "Log it in /privacy → 'Access / Erasure' (the Data-Subject Rights tracker). Enter who raised it, the type (access, correction, erasure or portability) and a note; the tool starts a ~30-day response clock and shows 'due in Xd' or 'overdue'. Move it through open → in progress → fulfilled/rejected as you work it. The Overview tab raises an alert while any request is awaiting fulfilment, since DPDP expects a response within roughly 30 days.",
    "route": "/privacy",
    "keywords": "DSR data subject request right to erasure access portability delete data 30 days DPDP / privacy"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Why can't I export / download data?",
    "a": "Export is a per-role permission. Roles with canExport enabled (Owner, and the finance/accounting roles) can download; the Viewer role explicitly cannot export ('read-only - no edits or export'). If your export buttons are greyed out, you're on a role without export rights - ask an owner to reassign you. Super Admin can always export.",
    "keywords": "cannot export download greyed out disabled csv report viewer no export permission Export"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "How do I invite my finance person or accountant to my workspace?",
    "a": "Go to Organization → Members. In the 'Invite teammates' card, type their email (or their Headroom user-id), pick the role from the dropdown, and click 'Send invite'. No email is actually sent - they accept or decline the invite in-app the next time they sign in. Only an owner (or super admin) sees this card.",
    "route": "/organization#members",
    "keywords": "add teammate invite email user-id send invite team member Inviting teammates"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "My teammate says they never got an invite email - what happened?",
    "a": "That's expected - Headroom invites are in-app, not email. When you send an invite from Organization → Members, it appears for the invitee inside their own Headroom account (under their pending invites), where they accept or decline. Tell them to log in and look for the join prompt. You can see the live status (pending / accepted) in the 'Sent invites' list under the invite form, and cancel a pending one with the trash icon.",
    "route": "/organization#members",
    "keywords": "no email invite not received pending accept decline in-app Inviting teammates"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "I want to do a quarterly access review - is there a record for that?",
    "a": "Yes. On /security open the Access Review Log: record each person, their role, scope and when access was last reviewed - it warns when a grant hasn't been reviewed in 90 days. Combine it with /organization → Members (to actually change roles or remove leavers) and the Organisation activity log for evidence. The Privacy Hygiene checklist on /security counts 'quarterly access review - leavers removed promptly' as a tracked control.",
    "route": "/security",
    "keywords": "access review quarterly who has access stale credentials 90 days least privilege audit IT / Admin · Access review"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "a customer asked us to delete their data - how do I handle and prove it?",
    "a": "On /privacy open the Access / Erasure tab and log the request (subject, type - see/correct/delete/port). A 30-day SLA clock starts automatically and shows days remaining or overdue, and you move it Open → Fulfilled to keep a defensible trail. Also mark the person's entry in the DPDP Consent Log as 'withdrawn' so you can always show lawful basis ended. This is the register the Data Protection Board can ask to see.",
    "route": "/privacy",
    "keywords": "data deletion request erasure right to be forgotten DSR access request DPDP SLA IT / Admin · DPDP data requests"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "someone says they requested to join our workspace - where do I approve it?",
    "a": "Requests to join appear in /organization → Members in the invite card under 'Requests to join your team', with Approve and Decline buttons; approving adds them with the role they requested. People find your company and request access via the Join-company search using your Tenant ID. Only an owner or super_admin can approve, and the action lands in the Organisation activity log.",
    "route": "/organization",
    "keywords": "join request approve decline access request someone wants to join workspace IT / Admin · Join requests"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "is there a single grid where I can set exactly what each team type can do?",
    "a": "Yes - the Role & Permission Matrix on /organization → Roles & Access is a tick-grid of permissions by role type. Check or uncheck a cell to grant or remove a capability; it shows a 'granted/total' count per role and saves automatically, syncing across devices. Use it alongside the per-role page-access editor on the same tab for finer control.",
    "route": "/organization",
    "keywords": "permission matrix grid capabilities per role fine grained access control IT / Admin · Permission matrix"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "what roles can I give people and what does each one actually see?",
    "a": "When inviting, you can assign Finance Manager (cash, AR/AP, GST, tax, payroll, debt - no cap table or team admin), Accountant / CA (books, GST/tax filing, compliance, advisor portal), Sales / Collections (invoices, receivables, no costs/payroll/banking), Operations Manager (orders, inventory, vendors, spend), Viewer (read-only dashboards, no edits or export), and Investor / Banker (portfolio, raises, valuation). The 'What each role can do' reference card on the Roles & Access tab lists the exact scope. Owner is full access; Super Admin is platform-only and can't be assigned.",
    "route": "/organization",
    "keywords": "roles permissions what can each role see finance manager accountant viewer IT / Admin · Roles & access"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "can I control which pages a role is even allowed to open?",
    "a": "Yes. On /organization → Roles & Access, open 'Configure access', expand a role, and tick or untick individual pages grouped by area (Overview, Accounting & Tax, People, etc.) to grant or revoke that role's access - changes save automatically and sync across devices. Use 'Reset to default' on any role to undo. You can also 'Preview as' any role to see the app exactly as they do, then exit from the banner at the top.",
    "route": "/organization",
    "keywords": "restrict page access hide tabs configure access preview as role least privilege IT / Admin · Roles & access"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "I already have a Headroom account - how do I join my company's existing workspace?",
    "a": "Open Organization → Members and scroll to the 'Join an existing company' card. Search by your company name or workspace id, then click 'Request to join' on the right match. The owner of that workspace approves or declines your request in-app (no email needed). You'll see your request status under 'Your requests', and the owner sees it under 'Requests to join your team' in their invite card.",
    "route": "/organization#members",
    "keywords": "join existing team request to join search company workspace owner approves Joining a company"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Someone requested to join my team - where do I approve it?",
    "a": "Go to Organization → Members. In the 'Invite teammates' card, any pending join requests appear under 'Requests to join your team' with Approve / Decline buttons. Approving adds them straight to your team in the role they requested; you can change that role afterwards from the Team Members list. Only owners and super admins see and action these requests.",
    "route": "/organization#members",
    "keywords": "approve request join decline pending member request Joining a company"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "What does 'Awaiting first login' or 'Suspended' mean next to a team member?",
    "a": "In Organization → Members each person shows a status: 'Awaiting first login' (yellow) means they were added or accepted but haven't signed in yet, 'Active' (green) means they've logged in, and 'Suspended' (red) means their access is paused. Each row also shows 'last seen' (e.g. 3d ago / Never) so you can spot dormant accounts during an access review.",
    "route": "/organization#members",
    "keywords": "awaiting first login suspended active status last seen member state pending login Member status"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "How do I keep my workspace secure?",
    "a": "Security covers app-lock (PIN/biometric on mobile), an access & action audit log, approval limits, expense policy, IP allowlist and segregation-of-duties mapping. Owners manage it in Security; sensitive actions are recorded so you can always see who changed what.",
    "route": "/security",
    "keywords": "security 2fa biometric audit log lock access Mobile & security"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "What's the difference between Organization and Settings, and where do I manage the company?",
    "a": "Organization (/organization) is the company-admin console - Members, Roles & Access, Billing & Plan, Company (identity, GST, tenant ID, branches) and Controls & Audit (books lock, audit log, retention). It's owner / super-admin only. Settings (/settings) is your personal preferences (theme, density, notifications, invoice defaults and similar). The Organization page links across to Settings at the top for your own preferences.",
    "route": "/organization",
    "keywords": "organization vs settings company admin console difference where manage Organization vs Settings"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "I'm scared one big client leaving could sink me - how exposed am I?",
    "a": "Open /analytics - the Concentration and P&L Deep Dive tabs flag if any one customer is over 30-40% of revenue, which you should treat as a real risk. /dashboard also has a 'Revenue concentration' widget that flags a customer above 40%. To test the damage, open /scenarios and use the 'Lose top client' quick chip to see what it does to your 6-month runway before it happens, then diversify or tighten that client's payment terms.",
    "route": "/analytics",
    "keywords": "customer concentration, one big client, dependency risk, lose top customer Owner · Concentration risk"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "can I afford to hire two people right now?",
    "a": "Open /scenarios and click the 'Hire 2 people' quick chip - it stacks the salary cost onto your live cash position and shows a 6-month projection with a green 'Scenario viable' or red 'Cash crunch risk' badge. Stack it with a 'Land a deal' event to see if new revenue funds the hires. Watch the red P10 downside line, not just the median - if the downside dips below zero you have crunch risk even when the average looks fine.",
    "route": "/scenarios",
    "keywords": "hire, new staff, can i afford, headcount, add people, expand team Owner · Decisions"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "How do I control which pages a particular role can open?",
    "a": "Go to Organization → Roles & Access and open the 'Stakeholder Views & Permissions' card. Under 'Configure access', expand the role (Finance, CA, Sales, Ops, Viewer, Investor) and tick or untick individual pages - they're grouped by area (Overview, Sales & CRM, Accounting & Tax, Operations, People, Planning, Capital & Treasury, AI & Automation, Markets & Labs, Organization). Each role shows a live 'N pages enabled' count, and 'Reset to default' restores the standard set. The owner's own access can't be reshaped here.",
    "route": "/organization#access",
    "keywords": "page access tabs configure who sees what enable disable pages stakeholder views Per-role page access"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Can I preview the app exactly as one of my staff sees it?",
    "a": "Yes. In Organization → Roles & Access, the 'Stakeholder Views & Permissions' card has a 'Preview as' row with a button for each role. Click one and Headroom re-renders the whole app as that stakeholder (CA lands on the Advisor portal, Investor on the investor view, everyone else on the Dashboard). A banner stays pinned at the top so you can exit back to your own view anytime.",
    "route": "/organization#access",
    "keywords": "preview as role impersonate see app as staff stakeholder view test access Per-role page access"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "I'm the owner - how do I give a team member access to a page they can't see, or make them read-only?",
    "a": "Open Settings. For each role there's a tab editor where you toggle which pages that role can reach (toggling a tab grants or removes it instantly), plus 'Reset to default' to restore the shipped access. To make someone view-only, assign them the Viewer role when inviting or change their role in the team list - Viewer is read-only everywhere. You can also 'View as' a role to confirm exactly what they'll see before saving.",
    "route": "/settings",
    "keywords": "owner grant access add tab to role make read only viewer assign role permission editor reset default Permissions"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Do my logged promises-to-pay survive a refresh and sync to my team?",
    "a": "Yes. Promise-to-pay rows are stored via feature state (key collections-promise-to-pay), which persists across reloads and syncs across your devices and team members. Same for the 'contacted' flags you set on accounts (collections-contacted). So if your finance person marks a promise Kept or chases a breach, you see it too. You can mark a promise Kept or Broken manually, or delete it.",
    "route": "/collections",
    "keywords": "promise to pay sync persist team devices contacted flag Promise-to-pay"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "can my accountant and my staff log in too, or is it just me?",
    "a": "It's multi-user. You can invite teammates with roles like owner, finance, accountant, sales - Settings -> Organization manages seats and billing. Your CA can work in /books, /gst and /payroll while your sales person uses /sales and /crm, and everyone sees the same shared data. Seat counts depend on your plan; you'll be prompted to upgrade if you run out.",
    "route": "/settings",
    "keywords": "team, multiple users, accountant access, staff login, roles, seats Prospect · Team access"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Why is everything greyed out / why can't I save anything?",
    "a": "You're almost certainly signed in as a Viewer (Read-only) role, which can open dashboards, analytics, health and the CFO brief/forecast but is blocked from any create/edit/delete or export. Ask your workspace owner to switch your role in Organization → Members if you need to make changes. If you only need to see one specific page that isn't showing, the owner can also grant it under Roles & Access.",
    "keywords": "greyed out can't save read only blocked no edit permission denied Read-only / viewer"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Why can't I edit anything? All the Save/Add buttons just throw an error",
    "a": "Your account is on a read-only role. The Viewer role is read-only by design - you can open every dashboard, analytics, financial-health and CFO-brief screen, but creating, editing or deleting is disabled and any write attempt shows the toast 'Your role has read-only access - ask a workspace owner for edit rights.' To get write access, ask a workspace owner to change your role in Settings under the team list (e.g. to Finance Manager or Accountant).",
    "route": "/settings",
    "keywords": "viewer read only cannot save disabled buttons no edit rights Read-only roles"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "There's a banner at the top saying I have read-only access - what does that mean?",
    "a": "That persistent banner appears whenever your assigned role is read-only (the Viewer / board-member role). It reads 'You have read-only access - explore everything, but changes are disabled. Ask a workspace owner for edit rights.' It's not a bug or a trial limit - it's the role you were invited with. Only a workspace owner can lift it by reassigning your role in /settings.",
    "route": "/settings",
    "keywords": "read-only banner top of screen viewer access disabled Read-only roles"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "I don't see an option to assign 'Super Admin' - why?",
    "a": "Super Admin is a platform-level role for administration across all tenants, and it is not assignable from within a workspace - it never appears in the invite or role dropdowns, and signing up can't create one. Workspace owners can only assign the seven business roles (Owner, Finance Manager, Accountant/CA, Sales, Operations, Viewer, Investor). The seeded platform super admin is a separate, dedicated account.",
    "keywords": "super admin not assignable platform role can't assign god mode all tenants Super admin"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "What is my Tenant ID and where do I find it?",
    "a": "Your Tenant ID is your workspace's unique identifier. Find it in Organization → Company, in the 'Your Tenant ID' card - there's a Copy button next to it. Share it with your CA, CFO or banker so they can link your account into their Advisor Portal and get live cash visibility. The same value backs your whole workspace, so guard it like a key; access can be revoked by contacting support.",
    "route": "/organization#company",
    "keywords": "tenant id workspace id copy share with ca find where is identifier Tenant ID"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "I'm previewing the app 'as' another role and now I'm read-only - how do I get out?",
    "a": "As an owner you can 'View as' any role from Settings to see exactly what that person sees. While previewing, the app gates navigation and access to match that role - so previewing as Viewer makes everything read-only. Exit from the banner at the top of the screen (it appears the moment you start a preview); that clears the preview and returns you to full owner access. Previewing never changes any real data - it's purely presentational.",
    "route": "/settings",
    "keywords": "view as preview role owner impersonate exit banner see what role sees View as / preview role"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "what can I actually see with this read-only login?",
    "a": "Your viewer role unlocks six screens: the Dashboard (/dashboard), Analytics (/analytics), Financial Health (/health), CFO Brief (/cfo-brief), Forecast (/forecast) and Benchmarks (/benchmarks). Everything else - Books, GST, Collections, Payroll, Capital - is hidden from your sidebar because a board member or advisor only needs the read views, not the operational tools. If you need a screen that isn't there, ask a workspace owner to widen your access.",
    "route": "/dashboard",
    "keywords": "viewer permissions, what tabs, read only access, board member login Viewer · Access"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "what are the biggest risks right now that I should ask about?",
    "a": "Start with the CFO Brief (/cfo-brief) Risk & Watchlist tab - it scores the live risks (low runway, debt coverage, concentration) red/amber/green. The Dashboard (/dashboard) shows Unread Alerts as a stat card and a red banner if there's a forecast chance of dipping below the safety buffer. Financial Health (/health) tells you which pillar is weakest. These three give you a tight agenda of what to question without needing edit access.",
    "route": "/cfo-brief",
    "keywords": "biggest risks, what to ask, watchlist, red flags, concerns Viewer · Alerts & risk"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "is too much of the revenue coming from one customer?",
    "a": "Yes, you can check this. Analytics (/analytics) has a Customer Concentration / Churn Flags view - if one customer is over 30-40% of revenue it's flagged as a risk. The Dashboard (/dashboard) also has a Revenue concentration widget that turns red above 40%. Financial Health (/health) folds concentration into the composite score as its own pillar. This is the classic board-level risk to raise if the number is high.",
    "route": "/analytics",
    "keywords": "customer concentration, one customer, revenue risk, dependency, churn Viewer · Concentration risk"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "why can't I edit anything or add a transaction?",
    "a": "Your role is Viewer (Read-only) by design - you get a thin grey banner at the top reading 'You have read-only access - explore everything, but changes are disabled.' If you try to save or add anything you'll see a toast: 'Your role has read-only access - ask a workspace owner for edit rights.' This is deliberate so a board member or silent advisor can inspect the numbers without ever altering the company's books. Ask an owner in Settings to change your role if you genuinely need write access.",
    "keywords": "cannot edit, read only, changes disabled, why locked, add transaction blocked Viewer · Editing"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "can I pin the handful of metrics I care about so I'm not hunting each time?",
    "a": "The Dashboard (/dashboard) has a 'My KPI Board' with a Customize option to pin the 4-8 metrics you watch (balance, burn, runway, revenue MTD, etc.). Note that pinning is a personal preference, so it may or may not stick under a strict read-only role - if Customize doesn't save, just rely on the four fixed stat cards (Total Balance, Monthly Burn, Cash Runway, Unread Alerts) and the Health Score ring, which always show without any setup.",
    "route": "/dashboard",
    "keywords": "pin metrics, KPI board, customize dashboard, my numbers, favourites Viewer · KPIs"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "how do I know these dashboard numbers are current and not stale?",
    "a": "The numbers are computed live from whatever the team has entered - bank balances, transactions, invoices and loans - so freshness depends on the operators keeping data current, not on you. The Dashboard 'Priority actions' and the CFO Brief headline tiles read straight off that live data. If a figure looks off, it usually means a bank feed hasn't synced or invoices weren't marked paid; flag it to the finance manager rather than trying to fix it yourself, since you're read-only.",
    "route": "/dashboard",
    "keywords": "are numbers current, stale data, accurate, up to date, trustworthy Viewer · Trust in numbers"
  },
  {
    "category": "Team, roles & CA portal",
    "q": "Can the app read my financial summary out loud - useful when I can't look at the screen?",
    "a": "Yes. Voice & Vernacular > Read Aloud (/voice) speaks a plain-English walkthrough of your live position - total money in, money out and net across all transactions - using your browser's text-to-speech, in your preferred language locale, with an adjustable speech rate. There's also an Audio Statement builder where you compose a spoken summary line by line and play it back as one narration. If text-to-speech isn't available on the device, the full script is shown on screen so a screen reader can read it.",
    "route": "/voice",
    "keywords": "read aloud text to speech summary audio statement speech rate accessibility Voice / vernacular"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "Where do I see all my alerts and how do I clear them?",
    "a": "Open the Alerts Centre at /alerts. The Active tab groups live alerts by severity - Critical, High, Warning, Info. For each, you can type what you did in the 'Log action taken' box and click Resolve (it moves to the Resolved tab with your note), or click the X to just Dismiss. Use 'Mark all read' (top right) to clear them in one go. The system re-checks your cash position every 4 hours, so new alerts surface on their own.",
    "route": "/alerts",
    "keywords": "alerts centre active resolve dismiss mark all read severity critical Alerts"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "If I dismiss an alert on my laptop, will it still show as unread on my phone?",
    "a": "No - alert read/resolved state syncs to your account, so a dismissal on one device shows everywhere. The Alerts Centre shows a small 'Synced' (cloud) pill at the top when it's talking to the server, or an 'Offline' pill if the backend is unreachable - in which case read-state is kept on that device only and a note warns it won't sync. On the next reload when you're back online it reconciles automatically.",
    "route": "/alerts",
    "keywords": "alerts sync cross device unread offline cloud pill backend Alerts"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "Can I get one daily roll-up instead of a ping for every single alert?",
    "a": "Yes. In Alerts Centre go to the Alert Digest tab (/alerts), turn on 'Send me a periodic alert digest', then choose Daily or Weekly, the delivery hour, and the channel - Email, WhatsApp, or both. A live preview shows what your next digest would carry right now. To temporarily silence one noisy category instead, use the Snooze / Mute tab: pick the alert type and a window (1 hour up to 1 week); it auto-expires and the underlying alert is never deleted.",
    "route": "/alerts",
    "keywords": "alert digest daily weekly email whatsapp channel snooze mute roll-up Alerts"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "Does Headroom have an app-lock or biometric (FaceID / fingerprint) lock?",
    "a": "There is no built-in app-lock / FaceID / fingerprint screen-lock on the app itself. Headroom's security is account-based (your login plus org roles), and the Security module at /security is a fraud watchtower over your ledger, not a device lock. For device-level protection, lock your phone/laptop at the OS level and use the Access Review Log (/security, Access Review Log tab) to record who can sign in. Note: the 'Voice Auth' stub elsewhere only stores a passphrase hash and gates nothing, so don't rely on it as a lock.",
    "route": "/security",
    "keywords": "pin lock face id touch id passcode screen lock biometric App-lock / device security"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "My app feels slow with years of old transactions - can I archive and remove them?",
    "a": "Use the 'Archive & Purge' tab on /data. Pick a cut-off date and it shows how many rows are older, how many you'll keep, and the archived value. Click 'Download archive CSV' to save everything before the cut-off, then 'Purge old rows' to permanently remove them from the working set (confirm required - it can't be undone). Always download the archive first, and keep it safely: Indian statutory records should be retained for 8 years.",
    "route": "/data",
    "keywords": "archive purge old transactions slow cut-off remove retention 8 years Archive & purge"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "the landing page showed different prices than the app - which is right",
    "a": "Trust the in-app Plan & Billing card and the Razorpay checkout - those are the authoritative, current tiers: Starter ₹799, Growth ₹2,499, Pro ₹5,999 per month (plus the Free plan). Older marketing copy on the public homepage may list legacy figures or a different mix of tiers, but the price you're actually charged is the one shown on the Settings → Plan & Billing card when you click upgrade.",
    "route": "/settings",
    "keywords": "different price landing page mismatch homepage marketing authoritative Common confusion"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "can I get warned before cash dips below a safe level or a deadline slips",
    "a": "Yes - /alerts is the early-warning system. Click Configure to set your Safety buffer (days of expenses as a cash floor), use Threshold Builder for custom rules (balance/burn/runway crosses below/above a value), and add statutory dates under Compliance Due-Dates with a 'Filed -> next' roll. Turn on Alert Digest for one daily/weekly roll-up via Email or WhatsApp, and pair Tax Set-Aside with the due dates so cash is reserved before filing day.",
    "route": "/alerts",
    "keywords": "alert warning cash low threshold deadline buffer digest notify Finance manager · Alerts"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "how do I stop someone opening the app on a shared phone?",
    "a": "Go to /settings and find the App Lock card. Click 'Set PIN', enter a 4-digit PIN twice, and Enable lock - after that the app asks for the PIN on launch and whenever you reopen it. On supported devices a 'Biometric unlock' toggle then appears so you can use Face ID / fingerprint instead of typing the PIN. Use 'Turn off' to remove the lock.",
    "route": "/settings",
    "keywords": "app lock PIN passcode biometric face id fingerprint shared device protect IT / Admin · App lock & device security"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "Is there a mobile app?",
    "a": "Yes - Headroom runs as native iOS and Android apps (and as a web app). The full feature set is available on mobile: tap the menu (top-left) to open navigation, and everything is laid out for the phone. Your daily loop - check cash, chase a payment, approve a bill - works on the go.",
    "keywords": "mobile app ios android iphone phone Mobile & security"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "Is there a Headroom mobile app for iOS and Android, or do I download it from the app store?",
    "a": "Headroom runs as an installable web app (PWA) and also ships inside a native iOS/Android shell built with Capacitor - the same code runs everywhere. On Android or desktop Chrome you'll see an 'Install Headroom' banner at the bottom of the screen; tap Install to add it to your home screen with no app store. On iPhone/iPad Safari the banner instead tells you to tap the Share icon then 'Add to Home Screen'. Once installed it opens full-screen like a normal app.",
    "keywords": "PWA install download app store capacitor android iphone home screen Mobile app"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "I dismissed the 'Install Headroom' prompt and now it won't come back. How do I install it?",
    "a": "The install banner is hidden once you dismiss it (it sets a flag in your browser), once the app is already installed, or when you're inside the native shell. To install manually on Android/desktop Chrome, use the browser menu and pick 'Install app' / 'Add to Home screen'. On iPhone Safari, tap the Share icon then 'Add to Home Screen'. Clearing site data will also make the banner reappear on your next visit.",
    "keywords": "install prompt dismissed reappear add to home screen pwa Mobile app"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "Do I get vibration feedback and proper offline detection in the installed app like a real native app?",
    "a": "Yes, inside the native iOS/Android shell. Headroom uses Capacitor, so on-device it gives haptic feedback on key taps and listens to the OS network status for instant online/offline switching; on the web the same code falls back to the browser's online/offline events (which power the app-wide offline banner). The app also refreshes your plan/entitlements when it returns to the foreground. Everything degrades gracefully - features that a device can't do simply no-op rather than break.",
    "keywords": "haptics vibration native capacitor offline detection foreground resume entitlements Mobile app"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "How does Headroom notify me - push, email, WhatsApp or just in-app?",
    "a": "In-app alerts always show in the Alerts Centre (/alerts) and drive the unread badge. Beyond that, Critical alerts are designed to go in-app + email + WhatsApp and Warnings in-app + email (see Configure on /alerts). You can also schedule a daily/weekly Alert Digest by Email and/or WhatsApp, and once you connect WhatsApp at /whatsapp you get the 9 AM Morning Brief and instant chat alerts. WhatsApp is the channel most Indian SMB owners actually check, which is why it's front-and-centre.",
    "route": "/alerts",
    "keywords": "notifications push email whatsapp in-app digest morning brief channels Notifications"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "how do I get warned before something goes wrong instead of finding out at month-end?",
    "a": "Open /alerts - it watches your live balances, burn, invoices and deadlines and flags trouble (cash running low, overdraft, GST/TDS approaching, overdue customer, big payment). Click Configure to set your safety-buffer days, and use Threshold Builder to make custom rules (e.g. balance crosses below X). Turn on Alert Digest for a daily/weekly roll-up via Email or WhatsApp. Connect every bank feed first or the runway and overdraft checks under-report.",
    "route": "/alerts",
    "keywords": "early warning, get alerted, notifications, before it's too late, watch rules Owner · Early warning"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "can I just check my cash on WhatsApp instead of logging in?",
    "a": "Yes. On /whatsapp click Connect WhatsApp and verify your mobile via OTP. After that you get a daily 9 AM Morning Brief (cash, burn, runway, overdue, GST/payroll due) and can text CASH, RUNWAY, OVERDUE, FORECAST or plain-English questions like 'Should I take the credit offer?' to get answers in seconds. You pick which alerts go into the brief under Alert preferences. Keep your bank and invoices current or the brief comes back empty.",
    "route": "/whatsapp",
    "keywords": "whatsapp, check on phone, daily brief, text my numbers, morning update Owner · WhatsApp"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "is there a mobile app or is it web only?",
    "a": "It's a web app, but installable as a PWA - open it in your phone's browser and use 'Add to Home Screen' to get an app-like icon that opens full screen. There's also a /field mode built for staff on the move (counter billing, GPS-stamped cash collections, van day-sheets) that works offline and syncs when the signal returns.",
    "route": "/field",
    "keywords": "mobile app, android, ios, phone, app store, pwa, offline Prospect · Mobile app"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "It says 'saved locally but failed to sync to server' - did I lose my work?",
    "a": "No. That message means the edit is safely stored on this device but the server write failed (usually a brief network drop or backend cold-start). Your work isn't lost - keep working, and the app retries automatically; the next successful save will push everything up. If it persists, check your connection; the app also shows an offline banner when it can't reach the backend.",
    "keywords": "saved locally failed sync error lost work offline retry network Sync / saving"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "Voice isn't working / the mic does nothing in my browser - is it broken?",
    "a": "It's a browser limitation, not a bug. Voice features use your browser's own Web Speech engine, which works best in Chrome/Edge on desktop and Android; Safari/iOS support is partial and some browsers don't expose a microphone at all. Every voice tool feature-detects this and falls back to typing - when dictation is unavailable you'll see a yellow note and can type the same line, and the parsing works identically. Read-aloud (text-to-speech) is similarly optional and shows the script on screen when unavailable.",
    "route": "/voice",
    "keywords": "mic not working speech recognition browser chrome safari fallback type Voice / vernacular"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "Does Headroom support Indian languages and lakh/crore numbers?",
    "a": "Yes. Voice & Vernacular > Language (/voice) lets you pick from 22 scheduled Indian languages (Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Urdu and more); the matching locale is passed to the speech engine for prompts and read-aloud, and the choice is saved and synced. The 'Lakh / Crore' tab formats amounts the Indian way (12,34,567 with 2-digit grouping and lakh/crore labels) instead of millions/billions, with a toggle and a side-by-side comparison.",
    "route": "/voice",
    "keywords": "indian languages hindi tamil 22 lakh crore vernacular number grouping Voice / vernacular"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "Is the 'Voice Auth' a real biometric login I can rely on?",
    "a": "No - it's an honest setup stub, not security. Voice & Vernacular > Voice Auth (/voice) captures a spoken or typed passphrase and stores only a one-way SHA-256 hash locally. It does not perform real voiceprint biometrics and does not gate any action yet; true voice-liveness auth needs a server-side model. Don't treat it as a lock on your books. For real device security use your phone's own lock and Headroom's app-lock if enabled.",
    "route": "/voice",
    "keywords": "voice auth biometric passphrase login security stub fake Voice / vernacular"
  },
  {
    "category": "Mobile, channels & alerts",
    "q": "How do I connect my WhatsApp to Headroom and what will I get?",
    "a": "Go to the WhatsApp Channel at /whatsapp, click 'Connect WhatsApp', enter your 10-digit mobile (the +91 is pre-filled), and verify the 6-digit OTP sent to you on WhatsApp - no app download needed. Once connected you get a Morning Brief every day at 9 AM (cash balance, runway, top 3 actions, tax reminders) plus instant alerts, and you can reply with commands any time. You can disconnect from the same connect card.",
    "route": "/whatsapp",
    "keywords": "connect whatsapp OTP morning brief digest verify number WhatsApp"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "My Account Aggregator consent is about to expire - what breaks and how do I renew?",
    "a": "Open /privacy → 'Consent Expiry' calendar (it pulls live from your AA Consent Register). Every AA consent has a fixed validity; when it lapses, any lending or accounting flow relying on that data silently breaks. The calendar colour-codes consents expiring within 7 days (red) and 30 days (yellow), and the Privacy Overview raises an alert. Re-grant from the AA Consent Register tab before expiry. Keep the FIP/AA acknowledgement as proof when you grant or revoke.",
    "route": "/privacy",
    "keywords": "AA consent expiry renew account aggregator lapse revoke FIP DEPA underwriting AA consent / privacy"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "Where is the audit log / who-did-what trail in Headroom?",
    "a": "Two complementary logs exist. The Automation module's Activity Log (/automation, Activity Log tab) is a shared event stream where rule-builder, reminder and approval tools append create/run/delete events. Inside Security (/security) the Sensitive-Action Log and Data-Export Audit tabs let you record sensitive actions and data exports for your own audit trail. The live server-backed approval queue (Automation, Approval Chains) also records every approve/reject decision with who decided and when.",
    "route": "/automation",
    "keywords": "audit trail activity history who changed what event log Audit log"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "Can I build automation rules, and do they actually fire by themselves?",
    "a": "On /automation you can build no-code IF-THEN rules (Rule Builder), reminder schedules, dunning cadences, credit limits and 30+ policies - and instantly preview which of your live records each rule matches. Important honesty note shown in-app: today it previews and evaluates against your live data but does NOT yet send the WhatsApp/email, post the entry, or fire on a schedule by itself. Treat it as a decision aid and shared rulebook. The one exception that truly executes is the server-backed Approval Engine in the Approval Chains tab.",
    "route": "/automation",
    "keywords": "automation rules if then preview executor scheduler does it run fire Automation"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "Can I take a full backup of all my data, and is it automatic?",
    "a": "Open the 'Backup & Export' tab on /data. 'Full backup (JSON)' downloads a single snapshot of your firm, bank accounts, transactions, invoices, loans, obligations and feature data; 'Transactions (CSV)' exports just the transactions table. You can set a cadence (daily/weekly/monthly) which shows an 'overdue' or 'up to date' reminder and keeps an export history log - but note the cadence is only a reminder. The actual export is always a one-click manual run in your browser; nothing is uploaded or backed up to a server on a schedule.",
    "route": "/data",
    "keywords": "backup json full export automatic cadence snapshot restore Backup"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "How do I connect my bank so transactions sync automatically?",
    "a": "Go to /connectors. Under 'Available Connectors' pick Account Aggregator (AA Network) for RBI-mandated consent-based bank statement fetch (no credentials stored) or Finbox to upload a statement PDF. Click 'Start AA Consent', enter your bank/FIP name and registered mobile, then complete the consent in your bank's AA app. Once a connector shows Connected, hit the refresh (sync) icon to pull transactions. The 'Bank / UPI Feed Connector' lower down lets you raise per-account AA consents and Sync Now.",
    "route": "/connectors",
    "keywords": "connect bank account aggregator AA sync transactions FIP consent open banking Connectors"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "Can I convert a CSV to JSON or JSON back to CSV?",
    "a": "Yes - the 'CSV ↔ JSON' tab on /data does both. CSV → JSON turns a pasted CSV (header row + data) into a clean array of objects you can download as .json; JSON → CSV takes a pasted JSON array of objects and flattens it to a downloadable CSV (nested objects are JSON-stringified into the cell). There's also a separate 'JSON Formatter' tab to validate, pretty-print or minify JSON from an API/webhook. All of it runs in your browser.",
    "route": "/data",
    "keywords": "csv json convert two-way format pretty-print minify api webhook CSV / JSON"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "How do I log consent and prove lawful basis under DPDP?",
    "a": "Use /privacy → 'DPDP Consent Log' for each customer/employee whose personal data you collect: record the subject, purpose, collection channel (website form, invoice/KYC, WhatsApp, etc.) and whether consent is live. You can 'Mark withdrawn' anytime, which DPDP requires consent to allow. For financial-data consent fetched via Account Aggregator, use the separate 'AA Consent Register' tab which tracks the FIP, the AA, purpose, scope, grant date and expiry.",
    "route": "/privacy",
    "keywords": "consent log lawful basis withdraw specific informed DPDP record DPDP / privacy"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "We had a data breach - what do I do in Headroom?",
    "a": "Record it in /privacy → 'Breach Log' (and use the 'Breach Triage' tab to work severity and notification). Capture the detection date, description, records affected, severity and whether you've notified the Data Protection Board and the affected people. The Privacy Overview surfaces a red alert for any medium/high breach not yet notified to the DPB, because the DPDP Act expects notification 'without delay'. This maintains your own defensible record - it does not file the notification for you.",
    "route": "/privacy",
    "keywords": "breach data leak notify data protection board DPB incident report DPDP / privacy"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "How long should I keep data, and how do I size my DPDP penalty exposure?",
    "a": "Set retention rules in /privacy → 'Retention Policy' - it ships with statutory defaults (e.g. books/invoices 8 yrs, GST records 6 yrs per CGST s.36, marketing lists 2 yrs) and you can add categories with a years value and legal/business basis. For penalty exposure, the 'Penalty Estimator' tab lets you tick your real gaps and sums the statutory DPDP caps so you get a hard number to prioritise remediation. Confirm exact retention periods with your CA.",
    "route": "/privacy",
    "keywords": "retention period purge penalty estimator DPDP fine exposure data minimisation DPDP / privacy"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "is there two-factor authentication / 2FA on login?",
    "a": "Headroom doesn't yet have built-in TOTP/SMS two-factor on its own login - the device-level protection it offers is the 4-digit App Lock PIN plus biometric unlock on /settings. The Security page's Privacy Hygiene checklist tracks '2FA enabled on banking & email' as a control you should have in place on those external accounts, but it doesn't enforce 2FA inside Headroom itself. For shared finance machines, pair App Lock with the device auto-lock control on the checklist.",
    "route": "/settings",
    "keywords": "2FA two factor MFA TOTP authenticator OTP login security IT / Admin · 2FA"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "where's the audit log - who logged in and who changed what?",
    "a": "Two places, both on /organization → Controls & Audit. 'Audit Log & Login History' shows recent sign-ins and security-relevant changes (login, permission, lock, policy) for access review. 'Organisation activity' shows who did what across the workspace - invites, role changes, plan changes - pulled live from the server, with a Refresh button. The Security page also has fraud/control-specific logs like the Access Review Log and Sensitive Action Log.",
    "route": "/organization",
    "keywords": "audit log activity history who did what login history trail accountability IT / Admin · Audit log"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "how do I take a full backup of all our data?",
    "a": "Go to /data and open the 'Backup & Export' tab. Click 'Full backup (JSON)' for a complete snapshot (firm, bank accounts, transactions, invoices, loans, obligations and feature data) or 'Transactions (CSV)' for just the ledger - both download instantly to your device. Set a daily / weekly / monthly cadence reminder there too; it warns you when a backup is overdue. There's also a Tally Bridge tab to export a Tally-importable Daybook XML.",
    "route": "/data",
    "keywords": "backup export download all data JSON CSV snapshot disaster recovery IT / Admin · Data export & backup"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "can I track who exported data, especially anything with personal info?",
    "a": "On /security use the Data Export Audit log to record each export - who, what, row count, reason, and whether it contained PII. It summarises exports logged, those in the last 30 days, and how many contained PII, so you have a defensible trail for DPDP. Pair it with the Sharing Registry on /privacy to track which vendors you actually send data to and whether a DPA is signed.",
    "route": "/security",
    "keywords": "export audit data export log PII tracking who downloaded data DPDP evidence IT / Admin · Export tracking"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "what happens if I'm the only owner and I'm away - can I set a backup admin?",
    "a": "Yes. On /organization → Members, click the tick/badge 'Make owner' icon next to a trusted member to promote them to a second owner with full control of the workspace (it asks you to confirm). This gives you a backup admin so the business isn't locked out if you're unavailable. Owners can later be managed from the same Members list.",
    "route": "/organization",
    "keywords": "backup admin second owner co-owner make owner sole owner locked out IT / Admin · Owner continuity"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "Can a workspace have more than one owner, and how do I add a backup admin?",
    "a": "Yes. In Organization → Members, next to any non-owner teammate there's a check-circle 'Make owner' icon - confirm it and they get full owner control (a useful backup admin so you're not the single point of failure). The primary owner is marked with a check-circle badge in the list. Only an existing owner or super admin can promote someone to owner.",
    "route": "/organization#members",
    "keywords": "second owner backup admin make owner co-owner multiple owners promote Owners"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "When I paste or upload data into these tools, is it sent to a server?",
    "a": "Most of the /data utilities run entirely in your browser - CSV Mapper, Statement Parser, Tally Bridge, Column Profiler, Pivot Builder, CSV ↔ JSON, JSON Formatter, Number Cleanup, GSTIN Validator, Paste Dedupe, Backup/Export and Date-Range Export all parse and download locally with nothing uploaded. The exceptions are the structured Bulk upload modal (ledgers/items etc.), which POSTs rows to the relevant accounting endpoint, and the bank-statement reconciliation in Books/Banking which sends the statement to be matched against your ledger. The generic transaction Upload CSV writes into your workspace store.",
    "route": "/data",
    "keywords": "privacy server upload browser local nothing uploaded paste Privacy"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "is my financial data actually safe with you",
    "a": "Headroom is built to India's DPDP Act 2023 - Settings -> Privacy & Data shows your consent toggles, a 'Request account deletion' (right to erasure), and a named Grievance Officer who responds within 30 days. Bank data is pulled through RBI-regulated Account Aggregator consent (no passwords shared) via /connectors, and there's a whole /privacy console for consent registers and breach tracking. You can revoke consent or delete your account on your terms.",
    "route": "/privacy",
    "keywords": "data safe, security, privacy, dpdp, is my data secure, deletion Prospect · Data safety"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "is this one of those tools that promises automation but doesn't deliver?",
    "a": "It's honest about its limits. /automation, for instance, previews and evaluates rules against your live data but does not yet auto-send messages, post entries or fire on a schedule by itself - it's a decision aid, and the app says so. Features that depend on external accounts (money rails, some integrations) are clearly marked Preview vs Live so you know what's real today before you commit.",
    "route": "/automation",
    "keywords": "automation, does it really work, promises, honest, limitations, preview Prospect · Honesty / limits"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "Is the Security page accusing my staff of fraud, and how accurate is it?",
    "a": "No. Every detector on /security carries the disclaimer 'These are heuristic flags - suspects, not verdicts. Confirm with source documents and the counterparty before acting.' The tools (anomaly, duplicate, round-trip, new-payee, etc.) compute statistical signals from your existing ledger to point you at things worth a second look. Accuracy depends entirely on your data - link ALL bank accounts and cards via /connectors first, otherwise duplicate-vendor and anomaly detection miss spend in unlinked accounts. Always confirm a flag against the actual invoice before acting.",
    "route": "/security",
    "keywords": "false positive accurate heuristic suspect verdict accusation reliability disclaimer Security module basics"
  },
  {
    "category": "Security, privacy & integrations",
    "q": "Where do I configure webhooks and API automation endpoints?",
    "a": "Both Automation and Connectors have a Webhook Registry - /automation → 'Webhook Registry' (config only, no executor yet) and /connectors → Webhooks for connector-related callbacks. On /connectors you'll also find a Credential Vault, Field Mapping Studio, Sync Schedules, Environment (Sandbox/Prod) toggle and a Data Flow audit. For payment gateways like Razorpay/Stripe you paste the webhook secret when setting up the connector so settlements and refunds import automatically.",
    "route": "/automation",
    "keywords": "webhook api endpoint integration credential vault sandbox production callback Webhooks / API"
  },
  {
    "category": "For your customers",
    "q": "How exposed am I if my biggest customer doesn't pay?",
    "a": "Both screens have concentration tooling. /receivables has Concentration Risk and a Concentration Stress Test tab; /collections has a Concentration tab. They show how much of your outstanding AR is tied up in your top customers, so you can see if one defaulter would blow a hole in your cash. Pair this with Customer Risk Scoring (to see if that concentrated exposure is also a high-risk payer) and the 60d+ critical banner on the main Collections view.",
    "route": "/receivables",
    "keywords": "concentration risk customer exposure top customer default stress test Concentration risk"
  },
  {
    "category": "For your customers",
    "q": "How do I draft a legal demand notice for a customer who won't pay?",
    "a": "On /collections, the Legal Notice tab (Legal Notice Drafter) drafts a formal demand notice for chronic defaulters. This corresponds to the most-severe dunning rung - the backend's Level 4 'Pre-legal' template (default at 60 days overdue, 24% p.a. + Rs.500 fee) which warns the matter will be referred for recovery. Use it only after the gentle/firm/final dunning steps and any promise-to-pay have failed. The 60d+ critical banner on the main view flags exactly which accounts are at this stage.",
    "route": "/collections",
    "keywords": "legal notice demand pre-legal recovery defaulter final escalation Legal escalation"
  },
  {
    "category": "For your customers",
    "q": "A customer said they'll pay by Friday - where do I record that commitment?",
    "a": "Open the Promise-to-Pay tab on /collections. Pick the customer (dropdown of your invoiced customers, or type a name), enter the promised amount, set the Promised-by date (defaults to +7 days), add an optional note, and tap Add promise. The KPIs track Open, Broken, Kept and total promised value. When the committed date passes while still open, the row auto-flags as Breached with days-late. For a breached promise you get a Chase button that opens a WhatsApp follow-up reminding them of the exact amount and date they committed to.",
    "route": "/collections",
    "keywords": "promise to pay PTP commitment date breached kept broken follow up Promise-to-pay"
  },
  {
    "category": "More help",
    "q": "What's the difference between an Account and a Contact?",
    "a": "An Account is a company/customer (name, industry, website, phone, GSTIN, and a Books link once a deal is won). A Contact is a person at that account (name, designation, email, phone) and can be linked to an Account. Both have their own tabs on /crm with a New account / New contact button. When you convert a lead, Headroom creates both the Account and the Contact for you automatically.",
    "route": "/crm",
    "keywords": "account contact company person difference customer Accounts & contacts"
  },
  {
    "category": "More help",
    "q": "Where do I see all my bank balances across different banks in one place?",
    "a": "Go to /banking - the Overview shows total cash across all banks, connected feeds, feed issues and an 'Accounts at a glance' table with each account's balance, % of total, status and last sync. The Multi-Bank Balances tab adds a concentration check: drag the slider to flag any account holding more than a set % of total cash (DICGC insures only ₹5L per bank), so you can spread balances or sweep surplus into FDs. Add accounts or import a statement from the Data/Connectors screen.",
    "route": "/banking",
    "keywords": "bank accounts balances multi-bank consolidated concentration dicgc feeds connected last sync Banking - bank accounts"
  },
  {
    "category": "More help",
    "q": "How do I import my bank statement or transactions from a CSV?",
    "a": "Go to Data & Import (/data) and on the Overview tab click 'Upload CSV' in the 'Bulk import transactions' card. Pick your .csv file - Headroom auto-detects the date, amount and description columns, guesses a category for each row, and shows a preview screen with 'X valid rows' and any skipped rows before you commit. Click 'Import N Transactions' to add them. Importing is disabled if your role is read-only (viewer/investor).",
    "route": "/data",
    "keywords": "upload csv bank statement transactions import Bulk CSV upload"
  },
  {
    "category": "More help",
    "q": "Why is my finished-good cost different from what I typed for materials?",
    "a": "Because Headroom values everything from your weighted-average stock cost, not a typed guess. When you Manufacture (or build a kit, or run a work order), the finished good is received at the rolled-up cost of what was actually consumed - material COGS plus, for work orders, planned or actual operating (labour) cost - divided across the produced quantity. To get accurate numbers, always Receive purchases at the real rate first so component costs are right before you build.",
    "route": "/erp",
    "keywords": "cost finished good rolled cost weighted average operating labour COGS why different Costing"
  },
  {
    "category": "More help",
    "q": "Will the importer fill in categories and counterparties automatically?",
    "a": "The simple Upload CSV guesses a category from the description keywords - salary/payroll/wages → payroll, gst/tds/tax → tax, loan/emi/interest → loan, neft/imps/rtgs → transfer, sale/invoice/receipt → revenue, otherwise expense - but it leaves counterparty blank. The CSV Mapper and Statement Parser let you map/derive a counterparty. For best results map a real counterparty column and then bulk re-categorise on the Transactions page; many dashboard widgets (Top Vendors, revenue concentration) need a real counterparty to be useful. Use 'Bulk Find & Replace' on /data to standardise messy bank narrations (e.g. 'MEHTA CORP LTD' → 'Mehta Corp') across all rows at once.",
    "route": "/data",
    "keywords": "category counterparty auto guess narration find replace standardise Counterparty / categories"
  },
  {
    "category": "More help",
    "q": "What date format and amount sign does the transaction importer expect?",
    "a": "The importer accepts DD/MM/YYYY or DD-MM-YYYY (and 2-digit years like DD/MM/YY, treated as 20YY) as well as ISO YYYY-MM-DD. Amounts use a positive number for money in (income) and a negative number for money out (expense) - e.g. 50000 is a client receipt, -12000 is office rent. Commas in amounts are stripped automatically, so ₹2,50,000 typed as 250,000 still works. Rows with an unparseable date or a zero/blank amount are skipped and listed on the preview screen.",
    "route": "/data",
    "keywords": "date format DD/MM/YYYY negative amount sign expense income CSV format"
  },
  {
    "category": "More help",
    "q": "My bank statement CSV has odd column names - will the import still work?",
    "a": "Two options on /data. The 'Upload CSV' / Bulk import auto-detects date, amount and description columns, guesses categories and previews before committing. If your file is messier, use the 'CSV Mapper' tab: paste any sheet (copied cells from Excel/Sheets work too), then tell it which column is date, amount, description and counterparty - no fixed template required. There's a 'Treat all amounts as expenses (negate)' toggle for statements where debits aren't already negative, and a header-row toggle.",
    "route": "/data",
    "keywords": "CSV mapper column mapping bank statement messy paste Excel auto-detect debit negative CSV import"
  },
  {
    "category": "More help",
    "q": "How do I export a report as PDF, Excel or CSV?",
    "a": "Tables across the app have an 'Export ▾' button - choose CSV, Excel (.xlsx), PDF, or Print. It exports exactly the rows on screen. You'll find it on the financial reports, trial balance, P&L, balance sheet, GST returns, receivables/payables aging and ledger lists.",
    "keywords": "export download pdf excel csv print report Data"
  },
  {
    "category": "More help",
    "q": "I re-imported a statement and now have double entries - how do I clean them up?",
    "a": "Open the 'Dedupe' tab on /data. It groups transactions that share the same date, amount, counterparty and description, shows how many duplicate groups and removable rows it found, and 'Remove duplicates' keeps the first of each group and deletes the rest (with a confirm). Run 'Data Quality' first for a health score that also counts likely duplicates, and use 'Paste Dedupe' if you just want to spot repeated invoice numbers or GSTINs in a pasted list before they hit your books.",
    "route": "/data",
    "keywords": "duplicate double entry dedupe re-import clean remove Duplicates"
  },
  {
    "category": "More help",
    "q": "How do I export a table to Excel, PDF or CSV?",
    "a": "Most tables across the app have an 'Export ▾' button. Click it and choose CSV, Excel (.xlsx), PDF or Print. Everything is generated in your browser from the rows currently on screen - no server round-trip - so what you've filtered or sorted is what you export. The PDF and Print options use a clean titled layout with the heading and today's date. If the table is empty the Export button is disabled with a 'Nothing to export' tooltip.",
    "keywords": "export excel pdf csv print download table xlsx Export"
  },
  {
    "category": "More help",
    "q": "Does the Export only include the rows I've filtered, or everything?",
    "a": "The Export menu serialises exactly the row objects currently passed to the table - i.e. what's on screen after your search/filter/sort. It does not silently pull the full dataset behind a filter. So if you want a full dump, clear your filters first; if you want a slice, filter down then export. For transactions specifically, the Data module's 'Date-Range Export' tab gives a dedicated from/to CSV slice.",
    "route": "/data",
    "keywords": "filtered rows export scope visible all Export"
  },
  {
    "category": "More help",
    "q": "can I set a rule that any payout above ₹1 lakh needs approval?",
    "a": "Yes - in /automation open Approval Chains, set 'Applies above (Rs)' to 100000, add the approver steps, and Save. The 'current outflows would route here' count tells you live how many of your real payments would hit that gate so you can tune the threshold. To catch people deliberately splitting payments just under the limit, also set your approval limit in /security under Under-Limit Splitting.",
    "route": "/automation",
    "keywords": "approval threshold limit payout sign off chain under-limit splitting Finance manager · Approvals"
  },
  {
    "category": "More help",
    "q": "what's our total cash across all banks right now?",
    "a": "/banking Overview shows Total Cash across all banks, how many feeds are connected, and which bank holds your largest balance. The /dashboard Total Balance card shows the same headline. If it says 'No bank accounts linked yet', add or import accounts via /data or /connectors first - runway and reconciliation all sum across connected accounts, so a missing feed under-reports your real position.",
    "route": "/banking",
    "keywords": "total cash balance banks consolidated liquidity available Finance manager · Cash position"
  },
  {
    "category": "More help",
    "q": "where do I track post-dated cheques and bounced cheques",
    "a": "Use the Tools strip in /transactions: log every customer cheque in the PDC Register and record dishonoured ones in the Bounce Tracker the moment they bounce so you have the dated paper trail for a Section 138 notice. /banking also has a Cheque Register, and Daily Cash Position lets you add pending debits so your 'Available net of holds' figure is real, not just the bank balance.",
    "route": "/transactions",
    "keywords": "pdc post dated cheque bounce dishonoured register section 138 holds Finance manager · Cheques"
  },
  {
    "category": "More help",
    "q": "we've got idle cash sitting in current accounts - what should I do with it",
    "a": "Open /treasury Overview - it auto-splits your total bank cash into Operating Buffer, Investable Surplus and the Yield Forgone per year. The highest-rupee move for most SMBs is the Idle-Cash Sweep tab (park surplus in a liquid fund at ~7% vs ~3% in current account). Match FD/RD Ladder maturities to your GST/advance-tax/payroll calendar so cash frees up exactly when you need it.",
    "route": "/treasury",
    "keywords": "idle cash surplus sweep fd liquid fund park yield current account Finance manager · Idle cash"
  },
  {
    "category": "More help",
    "q": "I need to build the monthly MIS pack for the owner - where from?",
    "a": "Fastest path is /cfo-brief: the AI Brief tab auto-fills Cash Balance, Runway, MoM Revenue and Active Alerts; switch the audience to 'Investor Update (board)', click Draft, and Export. For the full statement pack hit PDF/Excel on /statements (P&L, Balance Sheet, Cash Flow, Schedule III, Ratio Pack) and /analytics (Monthly P&L, top customers/vendors). The Board-Deck Generator tab in /cfo-brief lets you tick which slides to include and Export the deck.",
    "route": "/cfo-brief",
    "keywords": "mis pack board report monthly owner management report export pdf Finance manager · MIS / board pack"
  },
  {
    "category": "More help",
    "q": "the bank feed is a mess - how do I categorise everything fast?",
    "a": "In /transactions tick several rows and use the floating bottom bar to bulk-tag them; if all ticked rows share one counterparty, click '+ Create rule' so that vendor is auto-categorised forever. Build a few rules early and within weeks the list cleans itself and your Dashboard/P&L become trustworthy. To fix the data before it even lands, run the pipeline in /data: CSV Mapper > Data Quality > Dedupe.",
    "route": "/transactions",
    "keywords": "categorise bulk tag rules messy bank feed clean transactions counterparty Finance manager · Transactions hygiene"
  },
  {
    "category": "More help",
    "q": "What is the Fraud Risk Score and how is it calculated?",
    "a": "On /security → 'Fraud Risk Score' you get a single 0-100 weighted index rolling up the detectors: outlier payments (>2σ), duplicate-payment suspects, round-number payments and invoices missing numbers. It bands as Low (<30), Elevated (30-59) or High (60+). It is a relative health gauge, not an accusation - a high score means take a closer look, not that fraud occurred. The signal breakdown below the gauge shows exactly which inputs are pushing it up so you know what to investigate.",
    "route": "/security",
    "keywords": "fraud score risk index scorecard 0-100 weighted signals Fraud detection"
  },
  {
    "category": "More help",
    "q": "How do I find government grants or MSME subsidies my business qualifies for?",
    "a": "Use the Grant / Subsidy Finder tab on /capital. Pick your MSME category (Micro/Small/Medium) and years in operation, then tick what applies - Udyam registered, Manufacturing, Women-led, SC/ST entrepreneur, Exporter, Upgrading plant/technology, DPIIT-recognised startup. It instantly lists matching Central and State schemes (CGTMSE, PMEGP, CLCSS, Startup India Seed Fund, Stand-Up India, state capital subsidies, etc.) with the benefit and why you qualify. Most central subsidies require Udyam registration, so get registered if nothing matches.",
    "route": "/capital",
    "keywords": "MSME, Udyam, CGTMSE, PMEGP, subsidy, grant, DPIIT, Stand-Up India Grants & subsidies"
  },
  {
    "category": "More help",
    "q": "Why were some of my rows skipped or marked failed on import?",
    "a": "On the simple CSV import, rows are skipped when the date can't be parsed ('invalid date') or the amount is blank, non-numeric or zero ('invalid amount'); the preview lists the first few with their row numbers and a count of the rest. On the structured Bulk upload modal (used for ledgers/items etc.) the backend returns created/failed counts and a per-row error list - each failed row shows 'Row N: <reason>' so you can fix that line in your CSV and re-upload. Fix the flagged cells and re-import; the valid rows still go through.",
    "route": "/data",
    "keywords": "skipped failed rows errors invalid date amount why Import errors"
  },
  {
    "category": "More help",
    "q": "how long is our financial data kept and can I set a retention period?",
    "a": "On /organization → Controls & Audit, the Data Retention card lets you pick how long records are kept before moving to cold archive, with options to include attachments and to warn before anything is permanently removed. Note the built-in reminder: India's Companies Act requires books be kept at least 8 years, so shorter windows only archive non-statutory data. It shows the exact cutoff date for archival eligibility.",
    "route": "/organization",
    "keywords": "data retention how long kept archive purge companies act 8 years statutory IT / Admin · Data retention"
  },
  {
    "category": "More help",
    "q": "Can I import all my items in one go instead of adding them one by one?",
    "a": "Yes. On the Items sub-tab use Bulk upload - download the template, fill in name, unit, HSN/SAC, GST rate, valuation method, opening qty, opening value and barcode, then upload. Each row is created independently, so one bad row never aborts the rest; you get a count of created vs failed with per-row errors. You can also Export the current item list to CSV/Excel from the Export menu next to it.",
    "route": "/books",
    "keywords": "bulk upload import CSV excel template many items barcode Items"
  },
  {
    "category": "More help",
    "q": "How do I bill a project in stages or milestones?",
    "a": "Use the 'Milestone Billing' tab on /invoices. Enter the customer, total contract value and GST rate, then define stages each with a percentage of the contract (e.g. 30% advance, 40% on delivery, 30% on sign-off). You mark each stage billed as you invoice it, so you can track how much of the contract has been billed versus what's remaining.",
    "route": "/invoices",
    "keywords": "milestone stage billing project contract percentage advance retention Milestone billing"
  },
  {
    "category": "More help",
    "q": "How do approvals work and where do I see what's pending?",
    "a": "When a transaction exceeds an approval threshold it goes to a queue. Owners and finance managers see a 'Pending approvals' card right on the Dashboard with inline Approve/Reject, and the full queue plus approval rules live in Books → Controls.",
    "route": "/dashboard",
    "keywords": "approval approve reject pending queue authorization controls Money"
  },
  {
    "category": "More help",
    "q": "Can I write my own custom fraud / transaction monitoring rules?",
    "a": "Yes - /security → 'Monitoring Rules' is a no-code if-then engine on top of the automatic detectors. Name a rule, pick a field (Amount, Payee or Description), a condition (greater/less than for amounts, contains for text) and a value, then add it. Matching outgoing transactions are listed with the rules they triggered. Examples: Amount greater than 100000, or Description contains 'cash'. You can mute or delete rules anytime. These flag transactions for review; they do not block payments.",
    "route": "/security",
    "keywords": "custom rule monitoring if then watchlist flag keyword amount Monitoring rules"
  },
  {
    "category": "More help",
    "q": "am I going to run out of cash?",
    "a": "Open /forecast and click Generate Forecast - it projects your bank balance over the next 90 days with a best/expected/worst-case (P10/P50/P90) range and shows a Breach probability (the chance you dip below your safety buffer) plus your Likely runway. Treat the P10 worst-case line as your planning number: if it stays above your buffer for 90 days you're genuinely safe. The /dashboard also shows a red 'X% chance of dipping below your safety buffer' banner driven by the same engine.",
    "route": "/forecast",
    "keywords": "run out of money, cash crunch, will i survive, broke, low cash Owner · Cash & survival"
  },
  {
    "category": "More help",
    "q": "what should I do this week?",
    "a": "Open /copilot - the Daily CFO Brief writes you an auto-digest each morning and Recommended Actions ranks your top tasks (HIGH items first), each with an Open button that drops you into Collections, Credit, etc. /dashboard also surfaces 'Priority actions' (your top 3 for today) and a 'Due in the next 7 days' widget. For the weekly review, /cfo-brief's Top Actions tab gives a tick-off action list and 'What Changed' shows what moved since last week.",
    "route": "/copilot",
    "keywords": "to do, priorities, what now, action list, this week Owner · Daily priorities"
  },
  {
    "category": "More help",
    "q": "if I take this SAFE how much of my company am I giving away?",
    "a": "Open /capital's SAFE / Note Modeller - pick SAFE or Convertible Note, enter the investment, valuation cap, discount %, expected priced-round pre-money and your fully-diluted shares, and it shows the conversion price, shares issued and the final ownership % the investor gets, plus whether the cap or discount wins. For a full term sheet and clause-by-clause impact (liquidation preference, ESOP top-up, anti-dilution) use /termsheet before you sign anything.",
    "route": "/capital",
    "keywords": "dilution, equity, safe, convertible note, ownership, giving away Owner · Dilution"
  },
  {
    "category": "More help",
    "q": "I've got cash sitting in my current account doing nothing - what do I do with it?",
    "a": "Open /treasury - the Overview auto-splits your total cash into Operating Buffer, Investable Surplus and the Yield Forgone per year (current accounts earn ~3% vs ~7% in a liquid fund). Use the Idle-Cash Sweep tab to set your buffer and sweep %, then 'Liquid vs FD' and the FD/RD Ladder to park surplus tax-efficiently. Use the Bank Exposure (DICGC) tab to keep no more than ₹5L per bank insured.",
    "route": "/treasury",
    "keywords": "idle cash, fd, invest surplus, park money, earn interest, sweep Owner · Idle cash"
  },
  {
    "category": "More help",
    "q": "Can I just copy cells from Excel/Google Sheets and paste them instead of saving a CSV file?",
    "a": "Yes. The 'CSV Mapper', 'Statement Parser', 'Column Profiler', 'Pivot Builder', 'CSV ↔ JSON', 'Number Cleanup' and 'Paste Dedupe' tools on /data all take pasted data directly into a textarea - no file needed. The reusable Bulk upload modal also has a 'paste CSV rows here' box alongside the file picker. Copy your range, paste, and the tool parses it (comma-delimited; quoted fields and embedded commas are handled).",
    "route": "/data",
    "keywords": "paste excel sheets clipboard textarea no file copy cells Paste from Excel"
  },
  {
    "category": "More help",
    "q": "do I have to give you my bank login to connect my account?",
    "a": "No. Bank feeds come through Account Aggregator (AA) - an RBI-regulated framework where you approve a one-time consent in your own bank's app and no passwords are ever shared with Headroom. Set it up in /connectors via 'Start AA Consent'. If you'd rather not link a feed at all, you can just import a bank statement CSV in /data instead.",
    "route": "/connectors",
    "keywords": "bank login, connect bank, account aggregator, password, link account, csv import Prospect · Bank connection"
  },
  {
    "category": "More help",
    "q": "Do I have to run a repost manually after every back-dated entry?",
    "a": "Usually not - when you Receive or Issue with a date earlier than later existing movements, Headroom detects the back-date and auto-triggers a repost as a follow-up correction. The original movement is committed first, so even if the auto-repost fails it never blocks your entry. If anything shows up as FAILED in the Reposting history, use the Recover failed reposts button, which re-runs every failed repost from the opening balance and is safe to click repeatedly.",
    "route": "/books",
    "keywords": "auto repost back-dated recover failed runs history retry self-heal Reposting"
  },
  {
    "category": "More help",
    "q": "Which columns are mandatory in my CSV - do I need a description?",
    "a": "Only date and amount are required. The importer searches the header row for a column matching 'date', one matching 'amount' or 'amt', and an optional description column (it recognises desc, narration, particular, detail or remark). If it can't find both date and amount it shows 'CSV must have columns: date, amount…' and won't proceed. When there's no description column each row is just labelled 'Row N'.",
    "route": "/data",
    "keywords": "mandatory columns header narration particulars required Required columns"
  },
  {
    "category": "More help",
    "q": "Does the note modeller account for interest accruing on a convertible note?",
    "a": "Yes - for a Convertible Note it adds accrued interest before conversion: amount converting = principal × (1 + interest% × years). SAFEs convert on principal only with no interest. Be aware the model is a simplified pre-money method: it ignores the new-money and option-pool shuffle and any MFN / pro-rata terms, so treat the ownership % as indicative dilution, not a signed cap-table number.",
    "route": "/capital",
    "keywords": "convertible note interest, accrued, SAFE no interest, simplified SAFE / Notes"
  },
  {
    "category": "More help",
    "q": "Can Headroom check segregation of duties (one person doing too much)?",
    "a": "Yes - open /security and switch to the 'Duties Separation' tab (the SoD tool). It analyses your transactions to surface concentration where a single party/role appears to both initiate and receive payments, the classic segregation-of-duties weakness. Pair it with the Access Review Log (record who can do what) and the Live Approval Engine (/automation) so high-value payments need a second person's sign-off rather than one user controlling the whole flow.",
    "route": "/security",
    "keywords": "sod separation of duties maker checker concentration control Segregation of duties"
  },
  {
    "category": "More help",
    "q": "What are the SLA badges on leads and deals, and how do I clear a red one?",
    "a": "SLAs put a response/resolution deadline on each lead or deal by priority. The badge reads Fulfilled (green - you replied in time), Failed (red - you missed the window), or 'First Response Due' (amber - still owe a first reply), and may add '· escalated'. To stop the clock on a lead, open its drawer and use 'Log outbound response' → Log response - that records your first response and recomputes the SLA. The working-hours clock only counts 9-18 Mon-Fri, so weekends don't penalise you.",
    "route": "/crm",
    "keywords": "sla badge fulfilled failed due escalated response deadline red amber green SLA"
  },
  {
    "category": "More help",
    "q": "How do I know my changes actually saved? Is there a save button?",
    "a": "There's no manual save - every change autosaves. After you edit, the sync indicator moves from 'saving' to 'saved' (changes are written to local storage instantly and pushed to the server after a short debounce, roughly under a second). If a save can't reach the server you'll see 'Changes saved locally but failed to sync to server.' - your edit is safe locally and will sync once the connection recovers.",
    "keywords": "autosave save button sync status saved saving indicator did it save Sync / saving"
  },
  {
    "category": "More help",
    "q": "I edited on my laptop but my phone still shows the old numbers",
    "a": "Devices reconcile automatically. The app polls the server every few seconds and also uses a live stream (Server-Sent Events) to push cross-device changes in under a second, so the other device should update on its own - give it a moment or pull the screen to refresh. If a device is offline the change syncs the moment it reconnects. If numbers still differ after a minute, check the sync status isn't stuck on 'error' (a failed server write).",
    "keywords": "sync across devices laptop phone not updating stale numbers live refresh poll Sync / saving"
  },
  {
    "category": "More help",
    "q": "Where is a feature - I can't find the page I'm looking for",
    "a": "Press Cmd/Ctrl-K to open the command palette and search any screen by name - it lists every page you can reach. The sidebar groups pages into Overview, Sales & CRM, Accounting & Tax, Operations, People, Planning, Capital & Treasury, AI & Automation, Markets & Labs and Organization. If a page is missing entirely, it's because your role doesn't have access to it (ask an owner to grant it in Settings).",
    "keywords": "where is find page search command palette cmd k navigation sidebar missing tab Where to find things"
  }
];
