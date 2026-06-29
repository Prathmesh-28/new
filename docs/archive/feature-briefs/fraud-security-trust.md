# Fraud, Security, Anomaly & Trust (140 features)
> A self-defending finance fabric that detects fraud, verifies every actor, and earns trust through autonomous, quantum-safe, deepfake-proof vigilance.

1. **Duplicate Payment Catcher** — Flags identical amount-vendor-invoice combos before release, preventing accidental double payouts. · _finance_ · SMB pain: manual reconciliation misses double-pays
2. **Round-Trip Payment Detector** — Surfaces money cycling A→B→A across linked accounts hinting at circular/shell transactions. · _CA_ · competitor gap: Tally/Zoho lack circular-flow detection
3. **Vendor Bank-Change Alert** — Holds payments when a vendor's bank account suddenly changes, requiring out-of-band confirmation. · _finance_ · SMB pain: business-email-compromise rerouting
4. **GST Fake-Invoice Scanner** — Cross-checks supplier GSTINs against bogus-firm registries before claiming ITC on their bills. · _CA_ · competitor gap: ClearTax flags mismatch, not fraud-rings
5. **UPI Velocity Anomaly** — Detects abnormal bursts of small UPI debits signaling card-testing or mule activity on the account. · _owner_ · future trend: real-time UPI fraud spiking
6. **Benford's-Law Ledger Audit** — Runs first-digit distribution tests on expense entries to surface fabricated or padded numbers. · _CA_ · SMB pain: silent expense manipulation
7. **Role-Based Access Control** — Granular owner/finance/CA/sales/ops permissions scoped per module, account, and rupee threshold. · _owner_ · core user: small team needs least-privilege
8. **Maker-Checker Workflow** — Requires a second approver for payments above a configurable limit before funds move. · _finance_ · SMB pain: single-person payment errors
9. **Immutable Audit Log** — Append-only, tamper-evident record of every financial action with actor, time, and device. · _CA_ · competitor gap: editable logs in legacy tools
10. **Device Fingerprint Binding** — Ties logins to recognized devices; new hardware triggers step-up verification. · _owner_ · future trend: credential-stuffing defense
11. **Login Geo-Anomaly Block** — Stops sessions from impossible-travel locations or known fraud-hotspot IP ranges. · _owner_ · SMB pain: stolen-credential access
12. **Duplicate Vendor Dedupe** — Detects near-identical vendor records (typos, spacing) that enable split-payment fraud. · _finance_ · SMB pain: ghost-vendor padding
13. **Invoice Tampering Detector** — Compares received PDF invoices against issuer hashes to catch altered amounts or IBANs. · _finance_ · future trend: AI-edited document fraud
14. **Aadhaar/PAN KYC Verify** — Validates vendor and customer identity against authoritative sources during onboarding. · _CA_ · competitor gap: weak counterparty KYC
15. **AML Watchlist Screening** — Screens counterparties against sanctions, PEP, and RBI defaulter lists before transacting. · _CA_ · future trend: tightening AML compliance
16. **Session Timeout & Re-Auth** — Auto-locks idle finance sessions and re-prompts before sensitive operations. · _ops_ · SMB pain: shared-device exposure
17. **Suspicious Amount Threshold** — Flags transactions just under approval limits, catching deliberate splitting to evade review. · _finance_ · SMB pain: structuring around controls
18. **Ghost Employee Payroll Check** — Cross-references payroll names against bank, PAN, and attendance for phantom workers. · _owner_ · SMB pain: payroll fraud by insiders
19. **Two-Factor Payment Release** — OTP or app-push confirmation required to authorize any outbound transfer. · _finance_ · competitor gap: weak payout 2FA
20. **Login Attempt Throttling** — Rate-limits and lockouts brute-force credential guessing with progressive backoff. · _ops_ · SMB pain: weak-password accounts
21. **Data Export Watermarking** — Embeds invisible per-user watermarks in exported reports to trace leaks. · _owner_ · future trend: insider data exfiltration
22. **Breach Notification Workflow** — DPDP-compliant incident logging and timed regulator/customer notification templates. · _CA_ · future trend: DPDP breach-reporting duty
23. **Vendor Trust Score** — Composite reliability rating from payment history, KYC depth, and dispute rate. · _finance_ · SMB pain: blind vendor selection
24. **Anomalous Expense Categorizer** — Flags expenses inconsistent with a vendor's normal category or the firm's baseline. · _finance_ · SMB pain: misclassified/disguised spend
25. **Failed-Login Heatmap** — Visual dashboard of attack attempts by time, geo, and account for owner awareness. · _owner_ · competitor gap: no security visibility for SMBs
26. **Privileged Action Alerts** — Real-time push when admin rights, bank details, or limits are changed. · _owner_ · SMB pain: unnoticed privilege abuse
27. **Invoice Number Gap Detector** — Spots missing or out-of-sequence invoice numbers indicating skimming or off-book sales. · _CA_ · SMB pain: revenue skimming
28. **Bank Statement Reconciler+** — Matches every ledger entry to bank feed, flagging unexplained credits/debits as anomalies. · _finance_ · SMB pain: unreconciled fraud hiding
29. **Phishing-Link Email Guard** — Scans inbound vendor emails for spoofed domains and malicious payment links. · _ops_ · future trend: BEC phishing surge
30. **Consent Audit Trail (DEPA)** — Logs every Account Aggregator data consent grant, scope, and revocation. · _CA_ · future trend: DPDP/DEPA accountability
31. **Round-Number Bias Flag** — Highlights suspiciously round payment amounts common in fabricated invoices. · _CA_ · SMB pain: padded fake bills
32. **Dormant Account Reactivation Alert** — Warns when long-idle vendor/customer accounts suddenly transact. · _finance_ · SMB pain: hijacked stale accounts
33. **Split-Invoice Pattern Detector** — Recognizes one purchase fragmented into many bills to dodge approval thresholds. · _finance_ · SMB pain: control evasion
34. **GSTR-2B Mismatch Fraud Flag** — Distinguishes innocent ITC mismatches from patterns indicating collusive fake suppliers. · _CA_ · competitor gap: ClearTax stops at mismatch
35. **Beneficiary Whitelist** — Restricts payouts to pre-approved accounts; new payees require verification. · _finance_ · SMB pain: rogue payee fraud
36. **IP Allowlist for Finance** — Limits banking/payment functions to known office or VPN networks. · _ops_ · core user: small-team perimeter control
37. **Suspicious Refund Monitor** — Flags refunds to accounts differing from the original payer or unusually frequent refunds. · _finance_ · SMB pain: refund-abuse fraud
38. **Multi-Account Login Detector** — Spots one device controlling many business accounts, a mule-network signal. · _ops_ · future trend: mule-network mapping
39. **Encrypted Field-Level Vault** — Encrypts PAN, bank, and Aadhaar fields at rest with per-record keys. · _CA_ · future trend: DPDP data-minimization
40. **Time-of-Day Anomaly** — Flags payments or logins at unusual hours versus the user's established pattern. · _owner_ · SMB pain: after-hours insider fraud
41. **Vendor Collusion Graph** — Maps shared addresses, phones, or bank accounts across "independent" vendors. · _CA_ · SMB pain: collusive supplier rings
42. **Duplicate Reimbursement Block** — Detects the same receipt submitted across employees or periods. · _finance_ · SMB pain: expense-claim double-dipping
43. **Card-Not-Present Risk Score** — Real-time risk on online card charges using merchant, amount, and geo signals. · _customer_ · future trend: e-commerce CNP fraud
44. **Audit Log Export to CA** — One-click signed activity report for auditors and statutory review. · _CA_ · competitor gap: painful audit-evidence pulls
45. **Password-less Passkey Login** — FIDO2 passkeys replace passwords, eliminating phishing and reuse risk. · _owner_ · future trend: passwordless standard
46. **Anomaly Severity Triage** — Auto-ranks alerts by financial impact so finance acts on the costliest first. · _finance_ · SMB pain: alert fatigue
47. **Vendor Onboarding Risk Gate** — New suppliers pass KYC, GST validity, and watchlist checks before first payment. · _finance_ · SMB pain: unvetted vendor exposure
48. **Quishing (QR) Scam Guard** — Validates UPI QR codes against the intended payee before scan-to-pay. · _customer_ · future trend: malicious-QR fraud
49. **Insider Threat Behavior Model** — Baselines each employee's activity and flags deviations like bulk exports. · _owner_ · SMB pain: trusted-insider risk
50. **Transaction Monitoring Rules Engine** — No-code rules to flag patterns (amount, frequency, geography, counterparty). · _finance_ · competitor gap: rigid alerting elsewhere
51. **Chargeback Fraud Predictor** — Scores incoming orders for chargeback likelihood before fulfillment. · _sales_ · SMB pain: friendly-fraud losses
52. **Sensitive-Data Access Log** — Records who viewed customer PII and why, supporting DPDP audits. · _CA_ · future trend: privacy accountability
53. **Counterparty Sanctions Re-Screen** — Periodically re-screens existing partners as watchlists update. · _CA_ · future trend: continuous AML
54. **Payment Anomaly Hold-and-Ask** — Pauses outlier payments and asks the approver one clarifying question. · _finance_ · SMB pain: rushed wrong payments
55. **Wire/NEFT Recall Assistant** — Guides fast recall requests when a fraudulent transfer is caught early. · _finance_ · SMB pain: irreversible-payment panic
56. **Shadow-IT Account Detector** — Finds unsanctioned finance tools touching company data via integrations. · _ops_ · SMB pain: ungoverned tool sprawl
57. **Behavioral Login Biometrics** — Models typing cadence and navigation to confirm the human behind a session. · _owner_ · future trend: continuous authentication
58. **Geo-Fenced Approval** — High-value approvals only valid from registered geographies. · _finance_ · SMB pain: remote-takeover payments
59. **Tax Refund Fraud Watch** — Flags abnormal GST/TDS refund claim patterns before filing. · _CA_ · SMB pain: penalty-triggering errors
60. **Vendor Invoice Frequency Model** — Learns each vendor's billing rhythm and flags off-pattern invoices. · _finance_ · SMB pain: injected fake bills
61. **Secure Document Sharing** — Time-boxed, access-controlled links for financials with revocation. · _owner_ · SMB pain: leaky email attachments
62. **Account Takeover Recovery** — Guided lockdown, key rotation, and forensic timeline after suspected compromise. · _owner_ · future trend: ATO response need
63. **Real-Time Mule Account Flag** — Cross-references payee accounts against shared mule intelligence feeds. · _finance_ · future trend: mule-network defense
64. **Configurable Approval Hierarchy** — Multi-tier sign-off chains by amount, department, or risk score. · _owner_ · core user: growing-team controls
65. **PII Redaction in Reports** — Auto-masks Aadhaar, PAN, and bank numbers in shared or exported views. · _CA_ · future trend: DPDP minimization
66. **Suspicious New-Customer Score** — Risk-rates new buyers using identity, behavior, and order signals before credit. · _sales_ · SMB pain: first-order fraud
67. **Login Notification & Kill-Switch** — Alerts on every new session with one-tap remote logout of all devices. · _owner_ · SMB pain: lingering rogue sessions
68. **Expense Policy Violation Detector** — Flags out-of-policy spend (alcohol, weekend, over-limit) automatically. · _finance_ · SMB pain: leaky expense control
69. **Cryptographic Invoice Signing** — Digitally signs issued invoices so recipients verify authenticity. · _finance_ · future trend: verifiable documents
70. **Trust Center Dashboard** — Customer-facing page showing the firm's security posture and certifications. · _customer_ · competitor gap: no SMB trust signal
71. **Anomalous Vendor Bank Geo** — Flags when a domestic vendor's payout account is suddenly foreign. · _finance_ · SMB pain: cross-border rerouting fraud
72. **Recurring Charge Sentinel** — Detects new or rising subscription debits and unauthorized auto-mandates. · _owner_ · SMB pain: subscription/UPI-mandate leakage
73. **Segregation-of-Duties Checker** — Alerts when one person both creates and approves the same vendor or payment. · _CA_ · SMB pain: weak internal control
74. **Forensic Transaction Replay** — Reconstructs the full event chain of any suspect transaction for investigation. · _CA_ · competitor gap: no audit-replay tooling
75. **Phone-Number Risk Lookup** — Scores counterparty mobile numbers against spam/fraud reputation databases. · _ops_ · future trend: identity-signal scoring
76. **Encrypted Backup with Key Escrow** — Tamper-proof financial backups with secure recovery for continuity. · _ops_ · SMB pain: ransomware data loss
77. **Anomaly Explanation Panel** — Every flag shows plain-language reasoning and the evidence behind it. · _finance_ · SMB pain: opaque black-box alerts
78. **Consent-Scope Enforcer** — Blocks data uses beyond the scope the customer actually consented to. · _CA_ · future trend: DPDP purpose-limitation
79. **Duplicate GSTIN Usage Alert** — Flags one GSTIN appearing across unrelated vendor records. · _CA_ · SMB pain: identity reuse fraud
80. **Cash Transaction Spike Monitor** — Detects abnormal cash deposits/withdrawals that risk AML scrutiny. · _CA_ · India: cash-heavy SMB AML risk
81. **Adaptive Step-Up Auth** — Raises verification strength dynamically as transaction risk rises. · _owner_ · future trend: risk-based authentication
82. **Vendor Email Domain Age Check** — Flags brand-new lookalike domains used in supplier impersonation. · _ops_ · SMB pain: domain-spoofing BEC
83. **Self-Healing Permission Drift** — Detects and reverts access grants that violate baseline policy. · _ops_ · future trend: zero-trust posture management
84. **Tokenized Card Vault** — Stores customer cards as network tokens, removing raw PAN from systems. · _customer_ · future trend: tokenization mandate
85. **Anomalous Approval Velocity** — Flags an approver rubber-stamping payments far faster than human review allows. · _CA_ · SMB pain: collusive fast-approval
86. **Cross-Entity Fraud Correlation** — Links suspicious patterns across a group's multiple GSTINs/entities. · _CA_ · SMB pain: multi-entity blind spots
87. **Whistleblower Secure Channel** — Anonymous, encrypted internal reporting for suspected financial misconduct. · _owner_ · competitor gap: no built-in reporting line
88. **Honeypot Decoy Records** — Plants traceable fake vendor records to detect and attribute data theft. · _ops_ · future trend: active-defense deception
89. **Zero-Trust Microsegmentation** — Every internal service call is authenticated and authorized independently. · _ops_ · future trend: zero-trust architecture
90. **Real-Time Fraud Scoring API** — Sub-second risk score on any transaction for embedded payment flows. · _finance_ · future trend: embedded-finance risk
91. **Deepfake Voice-Call Detector** — Flags synthetic-voice "CEO calls" demanding urgent payment authorization. · _finance_ · future trend: voice-clone CEO fraud
92. **Synthetic Identity Detector** — Spots fabricated identities stitched from real and fake KYC fragments. · _CA_ · future trend: synthetic-ID fraud
93. **Continuous Behavioral Auth** — Persistently verifies the user through ongoing interaction signals, no re-login. · _owner_ · future trend: invisible continuous auth
94. **Graph-Neural Fraud-Ring Mapper** — GNN exposes hidden multi-hop collusion networks across counterparties. · _CA_ · future trend: network-graph fraud AI
95. **Federated Fraud Intelligence** — Learns fraud patterns across SMBs without exposing any firm's raw data. · _finance_ · future trend: privacy-preserving ML
96. **Autonomous Fraud-Hunting Agent** — AI agent proactively investigates ledgers, opens cases, and proposes blocks. · _finance_ · future trend: agentic AI defense
97. **Quantum-Safe Encryption** — Post-quantum cryptography protecting stored financial data against future decryption. · _CA_ · future trend: harvest-now-decrypt-later
98. **Deepfake Document Verifier** — Detects AI-generated invoices, statements, and IDs via provenance and artifacts. · _finance_ · future trend: generative-doc fraud
99. **Predictive Anomaly Forecasting** — Digital twin simulates likely fraud vectors before they materialize. · _owner_ · future trend: predictive defense
100. **Agent-to-Agent Auth Handshake** — Cryptographic mutual verification between negotiating finance agents. · _finance_ · future trend: agent-to-agent commerce
101. **Self-Defending Ledger** — Books that auto-quarantine and roll back entries detected as fraudulent in real time. · _CA_ · future trend: self-healing finance
102. **Neural Intent Verification** — Confirms a high-value action matches the operator's genuine intent before execution. · _owner_ · future trend: neural-interface security
103. **Zero-Knowledge KYC Proof** — Proves identity/eligibility to counterparties without revealing underlying data. · _customer_ · future trend: ZK privacy
104. **Adversarial Model Hardening** — Continuously red-teams fraud models against evasion and poisoning attacks. · _ops_ · future trend: adversarial-ML resilience
105. **Programmable Escrow Guardrails** — Smart-contract funds release only when fraud checks and conditions pass. · _finance_ · future trend: programmable money
106. **Ambient Fraud Whisper** — Spatial/AR overlay quietly flags a risky payee while the owner reviews a deal. · _owner_ · future trend: ambient/AR interfaces
107. **Biometric Liveness Gate** — Anti-spoof face/fingerprint liveness for high-value approvals. · _owner_ · future trend: deepfake-proof biometrics
108. **CBDC Programmable Spend Control** — Embeds anti-fraud spend rules directly into e-rupee tokens. · _finance_ · India: CBDC programmable money
109. **Autonomous Breach Containment** — On detection, agent isolates systems, rotates keys, and preserves forensics instantly. · _ops_ · future trend: autonomous incident response
110. **Cross-Border Layering Detector** — Traces multi-jurisdiction hops designed to launder funds via GIFT-City flows. · _CA_ · future trend: cross-border AML
111. **Explainable Fraud Verdicts** — Every AI fraud decision ships a regulator-grade rationale and evidence chain. · _CA_ · future trend: AI accountability
112. **Self-Sovereign Vendor Identity** — Decentralized verifiable credentials let vendors prove legitimacy portably. · _finance_ · future trend: SSI/verifiable credentials
113. **Predictive Insider-Risk Index** — Forecasts employees at elevated fraud risk from behavioral and access drift. · _owner_ · future trend: predictive insider analytics
114. **Quantum Random Key Rotation** — Quantum-entropy keys rotated continuously for unforgeable session security. · _ops_ · future trend: quantum security
115. **Holographic Identity Proofing** — Multi-modal 3D liveness defeating mask, screen, and deepfake attacks. · _customer_ · future trend: advanced biometric proofing
116. **Agentic Dispute Negotiator** — AI agent autonomously resolves fraud disputes with counterparty agents. · _finance_ · future trend: agent-to-agent resolution
117. **Real-Time Deception Detection** — Analyzes counterparty communication for manipulation and urgency-pressure tactics. · _owner_ · future trend: social-engineering defense
118. **Causal Fraud Inference Engine** — Distinguishes true fraud causes from coincidental correlations to cut false positives. · _finance_ · future trend: causal AI
119. **Sovereign Data Enclave** — Confidential-compute enclaves process sensitive data India-resident and unreadable. · _CA_ · India: DPDP data sovereignty
120. **Autonomous Compliance Sentinel** — Continuously enforces AML/KYC/DPDP rules and auto-files required disclosures. · _CA_ · future trend: zero-touch compliance
121. **Deepfake Video-Approval Block** — Detects synthetic video used to fake live approval ceremonies. · _owner_ · future trend: video-deepfake defense
122. **Swarm Anomaly Consensus** — Multiple independent AI models must agree before a transaction is blocked. · _finance_ · future trend: ensemble agent trust
123. **Time-Locked High-Value Vault** — Large transfers face a mandatory cool-off window with cancel rights. · _finance_ · future trend: programmable delay controls
124. **Predictive Vendor-Fraud Twin** — Simulates a vendor's future behavior to pre-empt impending invoice fraud. · _finance_ · future trend: digital-twin defense
125. **Continuous Trust Recalculation** — Every actor's trust score updates live with each action and signal. · _owner_ · future trend: dynamic trust fabric
126. **Neuro-Adaptive Phishing Shield** — Learns each user's susceptibility and tailors just-in-time warnings. · _ops_ · future trend: personalized defense
127. **Autonomous Mule-Network Takedown** — Agent maps and reports mule rings to authorities with evidence packages. · _finance_ · future trend: collaborative enforcement
128. **Quantum Anomaly Search** — Quantum-accelerated scanning of vast transaction spaces for rare fraud signatures. · _CA_ · future trend: quantum fraud modeling
129. **Provenance-Chained Money Trail** — Every rupee carries a cryptographic lineage proving clean origin. · _CA_ · future trend: programmable provenance
130. **Self-Auditing Books Agent** — AI continuously audits the ledger and certifies integrity in real time. · _CA_ · future trend: self-driving books
131. **Adaptive Zero-Trust Mesh** — Trust boundaries reshape dynamically per real-time risk across the whole stack. · _ops_ · future trend: adaptive zero-trust
132. **Emotion-Aware Coercion Detector** — Senses duress in an operator authorizing payment under threat and intervenes. · _owner_ · future trend: coercion/duress defense
133. **Cross-Agent Reputation Ledger** — Shared, tamper-proof reputation record for every autonomous finance agent. · _finance_ · future trend: agent-trust infrastructure
134. **Predictive Breach Surface Map** — Continuously models and shrinks the firm's attack surface before exploitation. · _ops_ · future trend: predictive security posture
135. **Synthetic-Transaction Decoys** — Injects undetectable canary transactions to expose internal fraud attempts. · _CA_ · future trend: active deception defense
136. **Verifiable AI Decision Receipts** — Cryptographically signed receipts for every autonomous fraud action, court-ready. · _CA_ · future trend: AI auditability
137. **Bio-Signature Payment Consent** — Multi-factor biometric + neural confirmation for irreversible large transfers. · _owner_ · future trend: deepfake-proof consent
138. **Self-Organizing Defense Swarm** — Distributed agents collectively adapt defenses faster than evolving attacks. · _ops_ · future trend: swarm cyber-defense
139. **Quantum-Entangled Audit Seal** — Tamper attempts on records are instantly and provably detectable via entanglement. · _CA_ · future trend: unforgeable audit integrity
140. **Sovereign Trust Operating System** — A unified autonomous layer continuously proving the entire business is fraud-free and trustworthy. · _owner_ · future trend: trust-as-a-service fabric
