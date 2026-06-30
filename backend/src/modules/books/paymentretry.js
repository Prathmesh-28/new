// §M-RETRY - RECURRING-COLLECTION DECLINE HANDLING. Pure logic ported (not copied)
// from the patterns proven by Hyperswitch (juspay/hyperswitch - its smart-retry /
// "revenue recovery" engine and normalized error-code taxonomy) and Lago's dunning
// schedule (getlago/lago). Nothing here touches the ledger or the network - it is a
// deterministic policy layer the webhook + dunning paths consult, so it is fully
// unit-testable with no DB (mirrored in selftest.js).
//
// Three responsibilities:
//   1. classifyDecline(provider, code) → a NORMALIZED {retryable, category, network}
//      verdict. Each gateway speaks its own dialect of failure codes; we fold them
//      into one taxonomy so the retry strategy never has to care who declined.
//   2. selectStrategy(classification, attempt) → which recovery move to make
//      (cascade / step-up 3DS / clear-PAN / network-token / give-up) plus the next
//      backoff delay. This is the "smart retry" decision Hyperswitch makes per attempt.
//   3. retryPolicy() → the static schedule + taxonomy, surfaced read-only over HTTP so
//      ops/front-end can show "we'll retry on day 1, 3, 5, 7" without guessing.
//
// CommonJS. No money math here (amounts are decided by the collection that failed),
// so it intentionally does NOT import ./money - keep it dependency-free.

// ── 1. NORMALIZED DECLINE TAXONOMY ───────────────────────────────────────────
// Categories are the canonical buckets every gateway code maps into. A HARD bucket
// is permanently retryable=false (retrying just burns a network fee + risks an issuer
// block); a SOFT/transient bucket is retryable=true. AUTHENTICATION is special - it is
// retryable, but only via a step-up (re-trigger 3DS / new mandate), not a blind retry.
const CATEGORY = {
  INSUFFICIENT_FUNDS:    { retryable: true,  hard: false }, // soft-decline: funds may arrive - retry on schedule
  DO_NOT_HONOR:          { retryable: true,  hard: false }, // generic issuer soft-decline - Hyperswitch retries these
  PROCESSOR_UNAVAILABLE: { retryable: true,  hard: false }, // gateway/issuer transient outage
  LOCK_TIMEOUT:          { retryable: true,  hard: false }, // contention/timeout - safe to re-attempt
  RATE_LIMITED:          { retryable: true,  hard: false }, // backoff then retry
  AUTHENTICATION:        { retryable: true,  hard: false }, // needs step-up (3DS / re-auth) - NOT a blind retry
  INVALID_CVC:           { retryable: false, hard: true  }, // bad card data - retrying is pointless
  INVALID_CARD:          { retryable: false, hard: true  }, // wrong/expired number, closed account
  EXPIRED_CARD:          { retryable: false, hard: true  }, // hard until the customer updates the card
  FRAUD:                 { retryable: false, hard: true  }, // issuer fraud block - never auto-retry
  MANDATE_REVOKED:       { retryable: false, hard: true  }, // customer cancelled the mandate - must re-collect consent
  UNKNOWN:               { retryable: false, hard: false }, // fail closed: don't auto-retry what we can't classify
};

// Per-provider code → canonical category. Lower-cased, punctuation-insensitive lookup.
// We keep Razorpay (live path) and Cashfree (stubbed) dialects; "generic" covers the
// Stripe-style vocabulary the prompt names (insufficient_funds / invalid_cvc / etc.)
// and is always consulted as a fallback so a code we already speak resolves even if the
// provider tag is wrong.
const CODE_MAP = {
  generic: {
    insufficient_funds: "INSUFFICIENT_FUNDS",
    card_declined: "DO_NOT_HONOR",
    do_not_honor: "DO_NOT_HONOR",
    invalid_cvc: "INVALID_CVC",
    incorrect_cvc: "INVALID_CVC",
    invalid_number: "INVALID_CARD",
    expired_card: "EXPIRED_CARD",
    fraudulent: "FRAUD",
    authentication_required: "AUTHENTICATION",
    lock_timeout: "LOCK_TIMEOUT",
    processing_error: "PROCESSOR_UNAVAILABLE",
    processor_unavailable: "PROCESSOR_UNAVAILABLE",
    issuer_unavailable: "PROCESSOR_UNAVAILABLE",
    rate_limit: "RATE_LIMITED",
    too_many_requests: "RATE_LIMITED",
  },
  razorpay: {
    // Razorpay payment "error_reason" / "error_code" vocabulary.
    bad_request_error: "DO_NOT_HONOR",
    payment_failed: "DO_NOT_HONOR",
    insufficient_funds: "INSUFFICIENT_FUNDS",
    insufficient_balance: "INSUFFICIENT_FUNDS",
    payment_authentication_failed: "AUTHENTICATION",
    payment_3ds_failed: "AUTHENTICATION",
    invalid_cvv: "INVALID_CVC",
    incorrect_cvv: "INVALID_CVC",
    invalid_card: "INVALID_CARD",
    card_expired: "EXPIRED_CARD",
    expired_card: "EXPIRED_CARD",
    fraud_check_failed: "FRAUD",
    gateway_error: "PROCESSOR_UNAVAILABLE",
    server_error: "PROCESSOR_UNAVAILABLE",
    gateway_timeout: "LOCK_TIMEOUT",
    payment_timeout: "LOCK_TIMEOUT",
    mandate_revoked: "MANDATE_REVOKED",
    mandate_cancelled: "MANDATE_REVOKED",
    rate_limit_exceeded: "RATE_LIMITED",
  },
  cashfree: {
    // Cashfree (stubbed provider) failure reasons - kept so the seam compiles end-to-end.
    insufficient_funds: "INSUFFICIENT_FUNDS",
    transaction_declined: "DO_NOT_HONOR",
    invalid_cvv: "INVALID_CVC",
    invalid_card: "INVALID_CARD",
    card_expired: "EXPIRED_CARD",
    suspected_fraud: "FRAUD",
    auth_failed: "AUTHENTICATION",
    bank_unavailable: "PROCESSOR_UNAVAILABLE",
    request_timeout: "LOCK_TIMEOUT",
    upi_mandate_revoked: "MANDATE_REVOKED",
    rate_limited: "RATE_LIMITED",
  },
};

const norm = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/[\s.-]+/g, "_");

// classifyDecline - fold a (provider, code) pair into the canonical verdict. Resolution
// order: provider dialect → generic dialect → UNKNOWN (fail closed). Always returns a
// fully-shaped object so callers never branch on undefined.
function classifyDecline(provider, code) {
  const p = norm(provider) || "generic";
  const c = norm(code);
  const dialect = CODE_MAP[p] || {};
  const category = dialect[c] || CODE_MAP.generic[c] || "UNKNOWN";
  const meta = CATEGORY[category];
  return {
    provider: p,
    code: c || null,
    category,
    retryable: meta.retryable,
    hard: meta.hard,
    // network-level (non-card-data, non-permanent) failures are the ones a blind
    // network retry can clear without any customer action.
    networkRetry: meta.retryable && !meta.hard && category !== "AUTHENTICATION",
  };
}

// ── 2. RETRY STRATEGY + BACKOFF ──────────────────────────────────────────────
// Backoff schedule (in DAYS from the original failure) for recurring/dunning. This is
// the Lago-style dunning cadence: spread attempts so a soft decline (funds, transient
// outage) gets several chances over a week before the subscription is dunned/cancelled.
// attempt is 1-based; the Nth retry waits SCHEDULE[N-1] days. Beyond the schedule we
// stop retrying (the dunning workflow takes over: notify / pause / cancel).
const BACKOFF_DAYS = [1, 3, 5, 7];
const MAX_ATTEMPTS = BACKOFF_DAYS.length;

// Strategy names mirror Hyperswitch's recovery moves:
//   CASCADE        - re-route the same charge through an alternate processor/route.
//   STEP_UP_3DS    - re-attempt with a 3DS/authentication challenge (for AUTHENTICATION).
//   CLEAR_PAN      - retry with the raw PAN instead of a network token (token may be stale).
//   NETWORK_RETRY  - plain scheduled re-attempt, same route (transient failures).
//   NONE           - do not retry (hard decline or attempts exhausted).
const STRATEGY = { CASCADE: "cascade", STEP_UP_3DS: "step_up_3ds", CLEAR_PAN: "clear_pan", NETWORK_RETRY: "network", NONE: "none" };

// selectStrategy - given a classification and the upcoming attempt number (1-based),
// decide the recovery move + when to run it. Returns {retry, strategy, attempt,
// delayDays, reason}. Deterministic; no side effects.
function selectStrategy(classification, attempt = 1) {
  const cls = classification && classification.category ? classification : classifyDecline(null, null);
  const n = Math.max(1, Math.floor(Number(attempt) || 1));

  const stop = (reason) => ({ retry: false, strategy: STRATEGY.NONE, attempt: n, delayDays: null, reason });

  if (!cls.retryable) return stop(cls.hard ? `hard decline (${cls.category}) - retry would fail` : `unclassified (${cls.category}) - fail closed`);
  if (n > MAX_ATTEMPTS) return stop(`exhausted ${MAX_ATTEMPTS} attempts - hand off to dunning`);

  const delayDays = BACKOFF_DAYS[n - 1];

  // Authentication needs a customer-facing step-up, never a silent retry.
  if (cls.category === "AUTHENTICATION") {
    return { retry: true, strategy: STRATEGY.STEP_UP_3DS, attempt: n, delayDays, reason: "needs re-authentication (3DS / re-consent)" };
  }
  // Processor-side outages: cascade to an alternate route once we've already retried
  // the same route once (first retry = plain network retry; escalate after that).
  if (cls.category === "PROCESSOR_UNAVAILABLE" || cls.category === "LOCK_TIMEOUT") {
    return n >= 2
      ? { retry: true, strategy: STRATEGY.CASCADE, attempt: n, delayDays, reason: "processor still unavailable - route to alternate processor" }
      : { retry: true, strategy: STRATEGY.NETWORK_RETRY, attempt: n, delayDays, reason: "transient processor failure - same-route retry" };
  }
  // A stale network token can masquerade as a soft decline; on the last scheduled
  // attempt, fall back to the clear PAN before giving up.
  if (n === MAX_ATTEMPTS && (cls.category === "DO_NOT_HONOR" || cls.category === "INSUFFICIENT_FUNDS")) {
    return { retry: true, strategy: STRATEGY.CLEAR_PAN, attempt: n, delayDays, reason: "final attempt - retry with clear PAN (token may be stale)" };
  }
  // Default soft-decline path: scheduled network retry.
  return { retry: true, strategy: STRATEGY.NETWORK_RETRY, attempt: n, delayDays, reason: `soft decline (${cls.category}) - scheduled retry` };
}

// nextRetryAt - convenience: the absolute timestamp for a strategy's delay, from `from`.
function nextRetryAt(delayDays, from = new Date()) {
  if (delayDays == null) return null;
  const t = new Date(from.getTime());
  t.setUTCDate(t.getUTCDate() + Number(delayDays));
  return t.toISOString();
}

// ── 3. READ-ONLY POLICY (for GET /payments/retry-policy) ─────────────────────
function retryPolicy() {
  return {
    backoffDays: BACKOFF_DAYS.slice(),
    maxAttempts: MAX_ATTEMPTS,
    strategies: Object.values(STRATEGY),
    categories: Object.fromEntries(Object.entries(CATEGORY).map(([k, v]) => [k, { retryable: v.retryable, hard: v.hard }])),
    providers: Object.keys(CODE_MAP),
  };
}

module.exports = {
  CATEGORY, STRATEGY, BACKOFF_DAYS, MAX_ATTEMPTS,
  classifyDecline, selectStrategy, nextRetryAt, retryPolicy,
};
