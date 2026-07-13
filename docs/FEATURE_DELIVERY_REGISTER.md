# Feature Delivery Register

_Created 2026-07-13. This replaces the earlier exploratory “top 200” list as the
source of truth for implementation. It is deliberately evidence-led: an item is
not a delivery candidate merely because an older audit called it missing._

## Re-baseline outcome

The previous high-level audit predates substantial implementation already present
in the repository. In particular, the following are **implemented or materially
implemented**, and must not be rebuilt as net-new features:

- email verification during signup and login;
- in-app invitations, join requests, invite resend/cancel, and plan-seat checks;
- audit writes for users, invites, billing and administrative organisation actions;
- tenant memberships and tenant-aware seat accounting;
- account activity fields (`last_login_at`, `last_active_at`, `login_count`);
- period locks and year-end close support for books;
- data-freshness and preview classifications;
- a command palette spanning pages, transactions, alerts, invoices, customers and
  vendors, including favourites and recents;
- searchable/pinnable mega-page tab overflow menus and URL-backed tab deep links;
- recurring invoices, API keys, webhooks and document expiry awareness;
- billing entitlement snapshots and Razorpay subscription lifecycle support.

## Delivery rules

1. Do not build a duplicate of a capability that is already live in a different
   surface. Improve the discoverability or completeness of that capability instead.
2. A financial action must retain a human approval boundary, a durable audit event,
   and a recoverable failure state.
3. “Live” data must name its source and timestamp; illustrative calculations must
   remain visibly labelled.
4. External rails are never mocked as completed. They require a contracted provider,
   credentials, production callback configuration, and applicable policy approval.

## Worksets

| Workset | Scope | Status | Dependency |
|---|---|---|---|
| W1 | Global tool/record launcher, favourites and recents | Tool catalog (53 entries across GST/Payroll/Sales/Collections/Accounting/Planning/Capital/Operations/Automation/Administration) added to the command palette; invoice/transaction/customer/vendor results deep-link to a filtered record view instead of only the page. Verified every catalog path resolves to a real route and, where applicable, a real tab id (`useUrlTab`/local tab-state cross-checked page by page) | None remaining for this pass |
| W2 | Mega-page tab search, grouping and deep-linking | Partial: implemented reusable control | Adopt/verify on every mega-page; internal |
| W3 | Owner guided home, sample-data mode and contextual help | Ready to build | Internal |
| W4 | Admin global search and user/company 360 view | Ready to build | Internal APIs; extend only where fields are absent |
| W5 | Close checklist, exceptions queue, maker-checker and correction controls | Ready to design/build | Accounting policy confirmation needed for approval thresholds |
| W6 | Import repair, migration and reconciliation rules | Ready to build incrementally | Internal |
| W7 | Collections execution, assignments and promise-to-pay escalation | Partial | Email/WhatsApp production configuration for actual delivery |
| W8 | Purchase-to-pay, three-way match and expense approvals | Ready to build incrementally | Internal |
| W9 | Payroll delivery, statutory filing and bank-file generation | Partial | Filing/payroll partner decisions |
| W10 | CRM capture, quote-to-cash and renewal workflow | Ready to build incrementally | Connector credentials for external capture |
| W11 | AI provenance, approval gates, feedback and tenant controls | Ready to build | Internal |
| W12 | Workflow testing, versioning, retry queue and templates | Ready to build | Internal |
| W13 | KYC, AML, bureau, Account Aggregator and bank feeds | Blocked | Provider contracts, credentials, compliance owner |
| W14 | GST filing, e-invoice/e-way bill and TDS filing | Blocked/partial | GSP/filing partner credentials and policy review |
| W15 | Lending disbursal, mandates, insurer/broker and investment rails | Blocked | Regulated partner contracts and production credentials |
| W16 | DPDP operations, data residency, encrypted files and incident response | Partial | Hosting/provider confirmation and legal policy owner |
| W17 | Multi-company consolidation and intercompany accounting | Ready to design | Accounting-policy decisions |
| W18 | Board/investor data room and cap-table governance | Ready to build incrementally | Legal document templates/approval |
| W19 | Partner/reseller and advisor workspace | Partial | Commercial operating model |
| W20 | Accessibility, mobile QA, reliability and support operations | Ready to build | Internal; needs device test matrix |

## Sequenced implementation

### Phase 1 — make the platform usable and trusted

1. W1: done — launcher has tool-level metadata/coverage, and record-result
   routing reaches the relevant record rather than only its page.
2. W2: adopt the existing reusable tab strip and URL-tab hook across every
   mega-page, then test the deep links.
3. W3: role-aware first-run home and empty-state action paths.
4. W4: admin global search and consolidated user/company view; reuse existing audit
   and activity fields rather than create competing stores.
5. W20: keyboard/focus baseline, responsive regression coverage, and reliable
   loading/error/empty states.

### Phase 2 — make finance operations executable

1. W5/W6: month-end operating controls, exception ownership, import repair and
   reconciliation rules.
2. W7/W8: collections accountability and controlled procurement/spend.
3. W10: quote-to-cash and sales-to-cash forecast continuity.
4. W11/W12: AI and automation controls before broader autonomous behaviour.

### Phase 3 — complete regulated and partner-backed rails

Start W13–W16 only after the named provider, data-processing terms, test keys,
production credentials, webhook endpoints, escalation owner and compliance sign-off
are supplied. Engineering can prepare adapter boundaries beforehand, but must not
claim these rails are live.

## External decisions required before those worksets can be completed

| Area | Required decision/input |
|---|---|
| KYC/AML | Vendor selection, contract, API credentials, permitted data fields, manual-review owner |
| Bank/AA | Aggregator selection, consent language, production callback URLs, support/revocation process |
| GST/TDS | GSP or filing partner, authorised signatory flow, return-filing responsibility |
| Payments/lending | Regulated entity/partner, commercial agreement, KFS and grievance owner, production keys |
| Email/SMS/WhatsApp | Provider accounts, sender/domain verification, approved templates, delivery/failure policy |
| Data protection | India hosting evidence, retention schedule, DPO/grievance owner, breach process |
| Accounting controls | Approval matrix, close/reopen authority, document-retention policy |

## Immediate engineering focus

Begin by completing W1 and W2, rather than replacing their already-good foundations.
They resolve the clearest stakeholder pain without needing external credentials:
people still cannot reliably find every individual tool or jump straight to a
specific matching record. This navigation foundation benefits every later feature.
