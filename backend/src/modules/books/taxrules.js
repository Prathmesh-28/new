// §TAXRULES — RULES-AS-DATA core for Indian direct + indirect tax.
//
// Pattern borrowed from OpenFisca and the PSLmodels Tax-Calculator: the tax
// LEGISLATION lives here as inspectable DATED PARAMETERS, not as code buried in
// the engines. Each parameter is an array of { from: 'YYYY-MM-DD', value|brackets|
// rate|... } entries; resolveParam(domain, key, onDate) returns the entry whose
// `from` is the latest date on/before onDate. The computation engines (incometax,
// tds) READ from this table by Assessment Year / date instead of carrying inline
// literals, so the numbers a user is taxed on are auditable in one place.
//
// Income-tax slabs are inherently keyed by Assessment Year (a Finance Act sets the
// rates for an AY, not a calendar date). We map an AY to a synthetic effective date
// — the 1-Apr that opens the relevant FY — so the same dated-resolver mechanism
// serves both: ayToDate('2025-26') → '2024-04-01'. The values are statutory facts
// (Income-Tax Act + the annual Finance Acts).
//
// A VALIDATION LAYER (validateParams) runs at module load and asserts every table
// is well-formed — brackets strictly increasing, rates within 0–100, dated entries
// sorted, no negative thresholds — and THROWS on malformed data. That assertion is
// what makes this core trustworthy: a typo in a rate table fails loudly at boot,
// not silently in someone's tax bill.
//
// No money math here — these are plain numbers (the parameter VALUES). The engines
// run them through ./money. Pure helpers (slabTax, applyRebate87A, surcharge,
// addCess) are exported so the engines never re-implement the slab walk.
const { money, ZERO } = require("./money");

// ── Dated parameter store ────────────────────────────────────────────────────
// Every leaf is an array of dated entries. Convention: entries are written
// most-recent-first; `from` is the date on/after which the entry is effective.
// resolveParam returns the entry with the greatest `from` that is ≤ onDate.
//
// For income-tax the dated entries are keyed by the AY's FY-opening 1-Apr (see
// ayToDate). For TDS/TCS/GST the `from` is the statutory effective date.

// Health & Education Cess on (tax + surcharge), individual/HUF + company/firm.
const CESS = {
  individual: [{ from: "2018-04-01", rate: 4 }],
  company: [{ from: "2018-04-01", rate: 4 }],
  firm: [{ from: "2018-04-01", rate: 4 }],
};

// Income-tax slab brackets. `brackets` is [{ upTo, rate }]; upTo=null = no ceiling.
// Keyed (via `from`) to the AY: ayToDate('2024-25')='2023-04-01', '2025-26'='2024-04-01'.
const IT_SLABS_NEW = [
  {
    from: "2024-04-01", // AY 2025-26 (FY 2024-25)
    brackets: [
      { upTo: 300000, rate: 0 },
      { upTo: 700000, rate: 5 },
      { upTo: 1000000, rate: 10 },
      { upTo: 1200000, rate: 15 },
      { upTo: 1500000, rate: 20 },
      { upTo: null, rate: 30 },
    ],
  },
  {
    from: "2023-04-01", // AY 2024-25 (FY 2023-24)
    brackets: [
      { upTo: 300000, rate: 0 },
      { upTo: 600000, rate: 5 },
      { upTo: 900000, rate: 10 },
      { upTo: 1200000, rate: 15 },
      { upTo: 1500000, rate: 20 },
      { upTo: null, rate: 30 },
    ],
  },
];

const IT_SLABS_OLD = [
  {
    from: "2023-04-01", // AY 2024-25 onward — old-regime slabs unchanged across both AYs
    brackets: [
      { upTo: 250000, rate: 0 },
      { upTo: 500000, rate: 5 },
      { upTo: 1000000, rate: 20 },
      { upTo: null, rate: 30 },
    ],
  },
];

// 87A rebate: { incomeLimit, maxRebate }. New-regime ≤7L; old-regime ≤5L.
const REBATE_87A_NEW = [{ from: "2023-04-01", incomeLimit: 700000, maxRebate: 25000 }];
const REBATE_87A_OLD = [{ from: "2018-04-01", incomeLimit: 500000, maxRebate: 12500 }];

// Surcharge bands [{ over, rate }] — highest crossed band applies. Under the new
// regime the 37% top band was abolished (capped 25%); old regime retains 37%.
const SURCHARGE_INDIVIDUAL_NEW = [
  {
    from: "2023-04-01",
    bands: [
      { over: 5000000, rate: 10 },
      { over: 10000000, rate: 15 },
      { over: 20000000, rate: 25 },
    ],
  },
];
const SURCHARGE_INDIVIDUAL_OLD = [
  {
    from: "2018-04-01",
    bands: [
      { over: 5000000, rate: 10 },
      { over: 10000000, rate: 15 },
      { over: 20000000, rate: 25 },
      { over: 50000000, rate: 37 },
    ],
  },
];

// Non-individual flat rates. Company: 30 default, 25 concessional opt; firm/LLP: 30.
const FLAT_COMPANY = [{ from: "2018-04-01", rate: 30, rate25: 25 }];
const FLAT_FIRM = [{ from: "2018-04-01", rate: 30 }];
const SURCHARGE_COMPANY = [
  {
    from: "2018-04-01",
    bands: [
      { over: 10000000, rate: 7 },
      { over: 100000000, rate: 12 },
    ],
  },
];
const SURCHARGE_FIRM = [{ from: "2018-04-01", bands: [{ over: 10000000, rate: 12 }] }];

// ── TDS sections (§194C/J/H/I/Q) + §206AA no-PAN floor ───────────────────────
const NO_PAN_RATE = 20; // §206AA penal rate (TDS).
const TDS = {
  "194C": [
    {
      from: "2020-04-01",
      section: "194C",
      description: "Payments to contractors / sub-contractors",
      rate: 1, // individual / HUF payee
      rateOther: 2, // any other payee (company, firm, etc.)
      threshold: 30000, // single contract
      aggregateThreshold: 100000, // annual aggregate
      noPan: NO_PAN_RATE,
    },
  ],
  "194J": [
    {
      from: "2020-04-01",
      section: "194J",
      description: "Professional / technical fees, royalty",
      rate: 10,
      threshold: 30000,
      noPan: NO_PAN_RATE,
    },
  ],
  "194H": [
    {
      from: "2020-04-01",
      section: "194H",
      description: "Commission or brokerage",
      rate: 5,
      threshold: 15000,
      noPan: NO_PAN_RATE,
    },
  ],
  "194I": [
    {
      from: "2020-04-01",
      section: "194I",
      description: "Rent (plant/machinery 2%, land/building/furniture 10%)",
      rate: 10,
      threshold: 240000,
      noPan: NO_PAN_RATE,
    },
  ],
  "194Q": [
    {
      from: "2021-07-01",
      section: "194Q",
      description: "Purchase of goods above the aggregate turnover trigger",
      rate: 0.1,
      threshold: 5000000, // deduct only on value above ₹50,00,000
      aggregateThreshold: 5000000,
      noPan: NO_PAN_RATE,
    },
  ],
};

// ── TCS sections (§206C variants); §206CC no-PAN = higher of 2× or 5% ─────────
const TCS = {
  "206C(1H)": [
    {
      from: "2020-10-01",
      section: "206C(1H)",
      description: "Sale of goods to a buyer above the ₹50,00,000 aggregate",
      rate: 0.1,
      threshold: 5000000, // collect only on value above ₹50,00,000
      aggregateThreshold: 5000000,
      label: "TCS on sale of goods",
    },
  ],
  "206C-SCRAP": [
    {
      from: "2018-04-01",
      section: "206C-SCRAP",
      description: "Sale of scrap",
      rate: 1,
      threshold: 0,
      label: "TCS on scrap",
    },
  ],
  "206C-TENDU": [
    {
      from: "2018-04-01",
      section: "206C-TENDU",
      description: "Sale of tendu leaves",
      rate: 5,
      threshold: 0,
      label: "TCS on tendu leaves",
    },
  ],
  "206C-TIMBER": [
    {
      from: "2018-04-01",
      section: "206C-TIMBER",
      description: "Sale of timber / other forest produce (not tendu)",
      rate: 2.5,
      threshold: 0,
      label: "TCS on timber / forest produce",
    },
  ],
};

// ── GST standard rate slabs (indirect tax) — reference data ──────────────────
// The standard ad-valorem slabs. Per-supply rates are captured at posting time;
// this table is the inspectable list of the legal standard slabs.
const GST = {
  standardSlabs: [{ from: "2017-07-01", rates: [0, 5, 12, 18, 28] }],
};

// The whole inspectable parameter object, grouped by domain.
const PARAMS = {
  incometax: {
    slabsNew: IT_SLABS_NEW,
    slabsOld: IT_SLABS_OLD,
    rebate87ANew: REBATE_87A_NEW,
    rebate87AOld: REBATE_87A_OLD,
    surchargeIndividualNew: SURCHARGE_INDIVIDUAL_NEW,
    surchargeIndividualOld: SURCHARGE_INDIVIDUAL_OLD,
    flatCompany: FLAT_COMPANY,
    flatFirm: FLAT_FIRM,
    surchargeCompany: SURCHARGE_COMPANY,
    surchargeFirm: SURCHARGE_FIRM,
    cessIndividual: CESS.individual,
    cessCompany: CESS.company,
    cessFirm: CESS.firm,
  },
  tds: TDS,
  tcs: TCS,
  gst: GST,
};

// ── Dated resolver ───────────────────────────────────────────────────────────
// Map an Assessment Year string ("2025-26") to the synthetic effective date used
// to key the income-tax parameters — the 1-Apr that opens the relevant FY.
// AY 2025-26 ⇒ FY 2024-25 ⇒ '2024-04-01'.
function ayToDate(ay) {
  const startYear = Number(String(ay).slice(0, 4)) - 1;
  if (!Number.isFinite(startYear)) throw new Error(`taxrules: bad AY "${ay}"`);
  return `${startYear}-04-01`;
}

// Return the parameter entry effective on/before onDate. Entries are stored
// most-recent-first; we pick the first whose `from` ≤ onDate. Throws if the domain/
// key is unknown or no entry is effective yet on that date.
function resolveParam(domain, key, onDate) {
  const d = PARAMS[domain];
  if (!d) throw new Error(`taxrules: unknown domain "${domain}"`);
  const entries = d[key];
  if (!Array.isArray(entries)) throw new Error(`taxrules: unknown param "${domain}.${key}"`);
  for (const e of entries) {
    if (String(e.from) <= String(onDate)) return e;
  }
  throw new Error(`taxrules: no "${domain}.${key}" entry effective on/before ${onDate}`);
}

// ── Pure helpers (the slab/rebate/surcharge/cess machine) ────────────────────
// Walk the brackets and tax each band's slice. Returns a Decimal.
function slabTax(taxable, brackets) {
  let tax = ZERO;
  let lower = money(0);
  const ti = money(taxable);
  for (const s of brackets) {
    const ceil = s.upTo == null ? ti : money(s.upTo);
    const top = ti.lessThan(ceil) ? ti : ceil;
    const slice = top.minus(lower);
    if (slice.greaterThan(0)) tax = tax.plus(slice.times(s.rate).div(100));
    lower = ceil;
    if (ti.lessThanOrEqualTo(ceil)) break;
  }
  return tax;
}

// 87A rebate: if total income ≤ incomeLimit, rebate the tax up to maxRebate.
// Returns the rebate amount (Decimal), never more than baseTax.
function applyRebate87A(taxable, baseTax, rebateCfg) {
  const ti = money(taxable);
  const bt = money(baseTax);
  if (!rebateCfg || !ti.lessThanOrEqualTo(rebateCfg.incomeLimit)) return ZERO;
  return bt.lessThan(rebateCfg.maxRebate) ? bt : money(rebateCfg.maxRebate);
}

// Surcharge on the supplied tax (tax-before-cess), by the highest band the income
// crosses. `bands` is [{ over, rate }]. Returns Decimal.
function surcharge(tax, income, bands) {
  const ti = money(income);
  let rate = 0;
  for (const b of bands || []) if (ti.greaterThan(b.over)) rate = b.rate;
  return rate === 0 ? ZERO : money(tax).times(rate).div(100);
}

// Health & Education cess on (tax + surcharge). Returns Decimal.
function addCess(taxPlusSurcharge, cessRate) {
  return money(taxPlusSurcharge).times(cessRate).div(100);
}

// ── Validation layer ─────────────────────────────────────────────────────────
// Asserts every table is well-formed and THROWS on malformed data. Run at load.
function assert(cond, msg) {
  if (!cond) throw new Error(`taxrules.validateParams: ${msg}`);
}

function isRate(x) {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 100;
}

// Dated entries must be sorted most-recent-first (strictly decreasing `from`),
// each `from` a valid YYYY-MM-DD.
function checkDatedSorted(label, entries) {
  assert(Array.isArray(entries) && entries.length > 0, `${label}: must be a non-empty array`);
  let prev = null;
  for (const e of entries) {
    assert(typeof e.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.from), `${label}: bad from "${e.from}"`);
    if (prev !== null) assert(e.from < prev, `${label}: dated entries must be sorted most-recent-first (${e.from} ≥ ${prev})`);
    prev = e.from;
  }
}

// Brackets strictly increasing in upTo (with a single null=open top), rates 0-100.
function checkBrackets(label, brackets) {
  assert(Array.isArray(brackets) && brackets.length > 0, `${label}: brackets must be a non-empty array`);
  let prevUpTo = null;
  let sawOpen = false;
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    assert(isRate(b.rate), `${label}: bracket[${i}] rate ${b.rate} out of 0-100`);
    if (b.upTo === null) {
      assert(i === brackets.length - 1, `${label}: open (null) bracket must be last`);
      sawOpen = true;
    } else {
      assert(typeof b.upTo === "number" && b.upTo > 0, `${label}: bracket[${i}] upTo must be positive`);
      assert(prevUpTo === null || b.upTo > prevUpTo, `${label}: brackets must strictly increase (${b.upTo} ≤ ${prevUpTo})`);
      prevUpTo = b.upTo;
    }
  }
  assert(sawOpen, `${label}: brackets must end with an open (null) band`);
}

// Surcharge bands strictly increasing in `over`, rates 0-100.
function checkBands(label, bands) {
  assert(Array.isArray(bands) && bands.length > 0, `${label}: bands must be a non-empty array`);
  let prevOver = null;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    assert(isRate(b.rate), `${label}: band[${i}] rate ${b.rate} out of 0-100`);
    assert(typeof b.over === "number" && b.over >= 0, `${label}: band[${i}] over must be ≥ 0`);
    assert(prevOver === null || b.over > prevOver, `${label}: bands must strictly increase (${b.over} ≤ ${prevOver})`);
    prevOver = b.over;
  }
}

function validateParams() {
  const it = PARAMS.incometax;

  // Slab tables (new + old): dated + well-formed brackets.
  for (const key of ["slabsNew", "slabsOld"]) {
    checkDatedSorted(`incometax.${key}`, it[key]);
    for (const e of it[key]) checkBrackets(`incometax.${key}@${e.from}`, e.brackets);
  }

  // 87A rebate tables.
  for (const key of ["rebate87ANew", "rebate87AOld"]) {
    checkDatedSorted(`incometax.${key}`, it[key]);
    for (const e of it[key]) {
      assert(typeof e.incomeLimit === "number" && e.incomeLimit >= 0, `incometax.${key}@${e.from}: incomeLimit must be ≥ 0`);
      assert(typeof e.maxRebate === "number" && e.maxRebate >= 0, `incometax.${key}@${e.from}: maxRebate must be ≥ 0`);
    }
  }

  // Surcharge tables.
  for (const key of ["surchargeIndividualNew", "surchargeIndividualOld", "surchargeCompany", "surchargeFirm"]) {
    checkDatedSorted(`incometax.${key}`, it[key]);
    for (const e of it[key]) checkBands(`incometax.${key}@${e.from}`, e.bands);
  }

  // Flat rates (company/firm).
  checkDatedSorted("incometax.flatCompany", it.flatCompany);
  for (const e of it.flatCompany) {
    assert(isRate(e.rate), `incometax.flatCompany@${e.from}: rate ${e.rate} out of 0-100`);
    assert(isRate(e.rate25), `incometax.flatCompany@${e.from}: rate25 ${e.rate25} out of 0-100`);
  }
  checkDatedSorted("incometax.flatFirm", it.flatFirm);
  for (const e of it.flatFirm) assert(isRate(e.rate), `incometax.flatFirm@${e.from}: rate ${e.rate} out of 0-100`);

  // Cess tables.
  for (const key of ["cessIndividual", "cessCompany", "cessFirm"]) {
    checkDatedSorted(`incometax.${key}`, it[key]);
    for (const e of it[key]) assert(isRate(e.rate), `incometax.${key}@${e.from}: rate ${e.rate} out of 0-100`);
  }

  // TDS sections: dated, rate/rateOther/noPan 0-100, thresholds ≥ 0.
  for (const sec of Object.keys(PARAMS.tds)) {
    const entries = PARAMS.tds[sec];
    checkDatedSorted(`tds.${sec}`, entries);
    for (const e of entries) {
      assert(isRate(e.rate), `tds.${sec}@${e.from}: rate ${e.rate} out of 0-100`);
      if (e.rateOther !== undefined) assert(isRate(e.rateOther), `tds.${sec}@${e.from}: rateOther out of 0-100`);
      assert(isRate(e.noPan), `tds.${sec}@${e.from}: noPan ${e.noPan} out of 0-100`);
      if (e.threshold !== undefined) assert(typeof e.threshold === "number" && e.threshold >= 0, `tds.${sec}@${e.from}: threshold negative`);
      if (e.aggregateThreshold !== undefined) assert(typeof e.aggregateThreshold === "number" && e.aggregateThreshold >= 0, `tds.${sec}@${e.from}: aggregateThreshold negative`);
    }
  }

  // TCS sections.
  for (const sec of Object.keys(PARAMS.tcs)) {
    const entries = PARAMS.tcs[sec];
    checkDatedSorted(`tcs.${sec}`, entries);
    for (const e of entries) {
      assert(isRate(e.rate), `tcs.${sec}@${e.from}: rate ${e.rate} out of 0-100`);
      if (e.threshold !== undefined) assert(typeof e.threshold === "number" && e.threshold >= 0, `tcs.${sec}@${e.from}: threshold negative`);
      if (e.aggregateThreshold !== undefined) assert(typeof e.aggregateThreshold === "number" && e.aggregateThreshold >= 0, `tcs.${sec}@${e.from}: aggregateThreshold negative`);
    }
  }

  // GST standard slabs.
  checkDatedSorted("gst.standardSlabs", PARAMS.gst.standardSlabs);
  for (const e of PARAMS.gst.standardSlabs) {
    assert(Array.isArray(e.rates) && e.rates.length > 0, `gst.standardSlabs@${e.from}: rates must be a non-empty array`);
    for (const r of e.rates) assert(isRate(r), `gst.standardSlabs@${e.from}: rate ${r} out of 0-100`);
  }

  return true;
}

// Run the validation at module load — malformed legislation fails loudly at boot.
validateParams();

module.exports = {
  PARAMS,
  NO_PAN_RATE,
  ayToDate,
  resolveParam,
  slabTax,
  applyRebate87A,
  surcharge,
  addCess,
  validateParams,
};
