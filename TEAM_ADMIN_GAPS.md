# Gap Audit — Super-Admin & SMB Org/Team Experience

*What exists today vs. what's missing, grounded in the code. Prioritised 🔴 high / 🟠 medium / 🟢 nice-to-have. No changes made — this is the "what's missing" list you asked for, for both surfaces.*

---

## A · Super-Admin experience ("see anything, do anything, easily")

**What's already there:** an all-users table (inline edit plan/role, edit email/display-name, reset password, delete), **Open-as** to view & edit any tenant's live data, a **Plan-Access matrix**, companies table with live financials, set-any-tenant's-plan, team-invite management, and ~28 admin tool tabs.

**Missing / weak:**

| # | Pri | Gap | Why it matters |
|---|---|---|---|
| A1 | 🔴 | **No global "find anyone" search.** Search is per-tab; no single box to jump to a user/company/tenant across the whole console. | "See anything" starts with finding it fast. |
| A2 | 🔴 | **No user/company 360 detail view.** Clicking a user opens a tiny email/name modal — not a consolidated page (their tenant, team, plan, role, last login, devices, activity, audit trail, their invoices/cash). | Django-admin's core is the record detail page. |
| A3 | 🔴 | **No real activity signals.** Users show only "Active / Pending login" — no **last-login**, last-active, login count, or device. Companies show "last_activity" but users don't. | Can't tell who's actually using it. |
| A4 | 🟠 | **No audit trail of admin actions.** An `audit_log` table + viewer tab exist, but the new mutations (set-plan, edit-profile, role change, delete, open-as) **aren't recorded**. | Accountability + "what did I change". |
| A5 | 🟠 | **No bulk actions.** Can't multi-select users/companies to bulk change plan/role, export, or message. | Scale. |
| A6 | 🟠 | **Open-as ≠ impersonate a user.** Open-as scopes to a *tenant* (you edit its data); it doesn't reproduce a *specific user's role-limited view* ("see exactly what this finance_manager sees"). `previewRole` exists but isn't wired into the admin per-user. | "See what they see." |
| A7 | 🟠 | **Companies tab is read-mostly.** Shows plan now, but no inline plan edit there, and no drill-down to a company's **members + pending invites**. | Manage a company in one place. |
| A8 | 🟠 | **No tenant lifecycle.** Can't **suspend/disable**, archive, or delete an org; no "last owner left" handling. | Ops + offboarding. |
| A9 | 🟠 | **No platform metrics that matter.** No MRR, active-subscriptions, plan distribution, churn, or signups-over-time. (`plan-usage` tab is a static modeller, not live billing.) | A super-admin's home screen. |
| A10 | 🟢 | **Destructive actions lack confirm/undo + consistent empty/error states**; the **28-tab nav** is unwieldy on mobile (no grouping/search of tabs). | Usability & safety. |

---

## B · SMB Org / Team experience (sign-up → create team → run it)

**What's already there:** signup creates a real tenant (`slug-hex`) with an owner + role; role-based access with a per-role scope preview; **in-platform invites** (request/accept/reject) + global banner + Settings invite card + sidebar badge; a "Your Team" members card (role change, remove).

**Missing / weak:**

| # | Pri | Gap | Why it matters |
|---|---|---|---|
| B1 | 🔴 | **Two conflicting invite flows.** The old "Your Team → Invite Member" card **directly creates a user** and says *"a temporary password is emailed to them"* — but **no email is sent** (it's a false promise), and there's **no consent**. The new "Invite teammates" card is in-platform accept/reject. **Reconcile to ONE in-platform flow** and fix the copy. | Confusing + misleading + duplicate. |
| B2 | 🔴 | **No email verification at signup.** `first_login=false` → straight in; anyone can sign up **with anyone's email**. No verify step. | Trust, security, deliverability. |
| B3 | 🔴 | **No "join my company" at signup.** A new employee who signs up **always creates a brand-new org** — they can't find/request to join their company's existing tenant. The only path in is the owner inviting them first. | The #1 team-onboarding miss. |
| B4 | 🔴 | **Plan seat limits not enforced.** Plans imply caps (Free 1 user, Starter 2, Growth 5, Pro 10) but invites/adds **aren't blocked at the cap** — no upsell when full. | Revenue + plan integrity. |
| B5 | 🟠 | **Thin company identity.** `company_name` is *optional* at signup (falls back to the email prefix → ugly tenant ids); no **GSTIN, industry, size, address, logo, phone** captured. | Identity, invoices, compliance. |
| B6 | 🟠 | **No owner onboarding wizard.** After signup there's no guided "set up your company → connect bank → invite team → send first invoice." (An *admin* OnboardingChecklist exists; the **owner** gets nothing.) | Activation / time-to-value. |
| B7 | 🟠 | **Member management is shallow.** No unified view of **members + pending invites together**, no **primary-owner** badge here, no resend, no **member status/last-login**. | "Whose team, who's pending." |
| B8 | 🟠 | **One team per user.** A CA or multi-business owner can't belong to **multiple orgs** / switch active team. (This is the multi-team item we paused.) | CAs, group companies. |
| B9 | 🟠 | **No transfer-ownership / backup admin / leave-team.** Primary ownership can't move; a member can't leave; risk if the sole owner is lost. | Continuity. |
| B10 | 🟢 | **Empty first-run experience.** A fresh org sees empty dashboards with no sample data or guided first actions. | First impression. |
| B11 | 🟢 | **Email/notifications not wired at all** (invites, resets, alerts claim email; none sent). Either integrate an email provider or remove the promise everywhere. | Honesty + real comms. |

---

## C · End-user UI / user-flow experience (every aspect)

**What's already there:** ~60 modules / ~1,500 tools, role-grouped Sidebar, ⌘K Command Palette, per-page tab strips, navy/green theme, responsive safety-net (tables scroll, tab strips wrap), ErrorBoundary, sonner toasts, KV live-sync via polling, plan-gated UpsellGates, offline queue (Field).

**Missing / weak:**

| # | Pri | Gap | Why it matters |
|---|---|---|---|
| C1 | 🔴 | **Discoverability is broken at this scale.** ~1,500 tools across ~60 pages; the ⌘K palette indexes *pages*, not the **tools inside them**. No global tool search, **favorites/recents, or a unified launcher**. Users can't find the calculator they need. | The single biggest UX risk of the breadth strategy. |
| C2 | 🔴 | **Tab overload inside pages.** GST has 52 tabs, Tax 57, Payroll 45 — wrapping into many rows with no **search/group/pin within the page**. Unscannable. | Each big page is a wall. |
| C3 | 🔴 | **No first-run / empty states.** A fresh user lands on empty dashboards with no sample data, no "do this first," no guidance. | Activation; first impression. |
| C4 | 🔴 | **Not click-tested on device.** Everything is build-verified only; the 60-item mobile drawer, wrapped tab strips, dense scrolling tables, and forms on small screens haven't been QA'd on a real iPhone/Android. | Real mobile usability unknown. |
| C5 | 🟠 | **Inconsistency across 1,500 agent-built tools.** Likely drift in layout, button styles, terminology, validation, number/date formatting, and empty/loading/error handling despite shared CSS vars. | Feels stitched-together. |
| C6 | 🟠 | **"Real vs indicative vs simulated vs preview" is invisible to users.** A user can't tell a live-data result from an illustrative calculator or a preview stub — risk of trusting the wrong number. | Trust / correctness. |
| C7 | 🟠 | **Form UX unevenness.** Required-field hints, inline validation, currency-formatted inputs (lakh/crore), date pickers, Enter-to-submit, and **autosave vs explicit save** aren't standardized. | Daily data entry friction. |
| C8 | 🟠 | **Sync is invisible.** Poll-based cross-device sync has **no "syncing / last synced" indicator**; users may not trust that data carried over. | Confidence in the data. |
| C9 | 🟠 | **No in-context help.** Complex Indian-finance tools (RCM, 43B(h), DSCR, MAT) have no tooltips / "what is this" / worked-example help. | Comprehension. |
| C10 | 🟠 | **Cross-data search missing.** No way to find a specific transaction / invoice / customer across modules from one search. | Finding records. |
| C11 | 🟢 | **Accessibility unverified** — contrast on the new theme, keyboard navigation, focus rings, ARIA labels, screen-reader, and mobile tap-target sizes haven't been checked. | Inclusivity + app-store/WCAG. |
| C12 | 🟢 | **English-only UI** (the Voice module aside) in a multilingual market; no language switch for the core UI. | Reach (ties to your moat). |
| C13 | 🟢 | **Personalization is thin** — Dashboard has a KPI widget builder, but no pinned/favorite tools, recents, or a curated "home" that adapts to the user's role/plan. | Make 1,500 tools feel like 10. |
| C14 | 🟢 | **Navigation niceties** — no breadcrumbs, deep-link-to-tool, or consistent back behavior across the tabbed pages. | Orientation. |

**The meta-point:** the product's superpower (breadth) is also its top UX risk. The highest-leverage UX work is **C1–C3** — make 1,500 tools *findable* (global tool search + favorites/recents), tame the mega-pages (in-page tab search/grouping), and add a first-run/guided home. That converts "overwhelming" into "powerful."

---

## Recommended order (my opinion)

1. **B1** — kill the duplicate/misleading invite flow; make the in-platform one the only one (quick, removes a live falsehood).
2. **B3 + B4** — "join my company" request-to-join + enforce seat caps with an upsell (these two convert and de-confuse onboarding).
3. **A1 + A2 + A3** — global search + a user/company **360 detail** with last-login/activity (the heart of "see anything as super-admin").
4. **B6 + B5** — owner onboarding wizard + richer company profile (activation).
5. **A4** — log admin actions to the audit trail (accountability).
6. **B8** — multi-team membership (the paused item) once the above are solid.

*Tell me which of these to build and I'll start — I'd suggest 1 → 2 → 3.*
