import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { computeInvoice, dueDateFromTerms, inWords } from "./invoiceTotals";

// The browser preview and the server MUST agree, or the user approves one number and a
// different one gets issued. Rather than trusting that two copies of the rules stay in
// step, this loads the actual server module and runs both over the same cases.
const require_ = createRequire(import.meta.url);
const server = require_("../../backend/src/lib/invoiceTotals.js") as typeof import("./invoiceTotals");

const CASES = [
  { name: "plain intra-state", input: { items: [{ quantity: 2, unit_price: 500 }], gst_rate: 18, place_of_supply_code: "27", seller_state_code: "27" } },
  { name: "inter-state", input: { items: [{ quantity: 1, unit_price: 1000 }], gst_rate: 18, place_of_supply_code: "29", seller_state_code: "27" } },
  { name: "unknown place of supply", input: { items: [{ quantity: 1, unit_price: 1000 }], gst_rate: 18 } },
  { name: "line % discount", input: { items: [{ quantity: 1, unit_price: 1000, discount_pct: 10 }], gst_rate: 18, place_of_supply_code: "27", seller_state_code: "27" } },
  { name: "line flat discount", input: { items: [{ quantity: 3, unit_price: 333.33, discount_amount: 100 }], gst_rate: 12, place_of_supply_code: "27", seller_state_code: "27" } },
  { name: "header discount apportioned", input: { items: [{ quantity: 1, unit_price: 1000 }, { quantity: 1, unit_price: 3000 }], gst_rate: 18, discount_amount: 400, place_of_supply_code: "27", seller_state_code: "27" } },
  { name: "freight", input: { items: [{ quantity: 1, unit_price: 1000 }], gst_rate: 18, shipping_amount: 200, place_of_supply_code: "27", seller_state_code: "27" } },
  { name: "three lines, indivisible discount", input: { items: [{ quantity: 1, unit_price: 100 }, { quantity: 1, unit_price: 100 }, { quantity: 1, unit_price: 100 }], gst_rate: 18, discount_amount: 10 } },
  { name: "mixed rates", input: { items: [{ quantity: 1, unit_price: 1000, gst_rate: 5 }, { quantity: 1, unit_price: 1000, gst_rate: 18 }], gst_rate: 18, place_of_supply_code: "27", seller_state_code: "27" } },
  { name: "reverse charge", input: { items: [{ quantity: 1, unit_price: 1000 }], gst_rate: 18, reverse_charge: true, place_of_supply_code: "27", seller_state_code: "27" } },
  { name: "round off down", input: { items: [{ quantity: 1, unit_price: 999.5 }], gst_rate: 18, place_of_supply_code: "27", seller_state_code: "27" } },
  { name: "round off disabled", input: { items: [{ quantity: 1, unit_price: 999.5 }], gst_rate: 18, round_off_enabled: false } },
  { name: "odd paise halving", input: { items: [{ quantity: 7, unit_price: 79.37 }], gst_rate: 18, place_of_supply_code: "27", seller_state_code: "27" } },
  { name: "empty", input: { items: [], gst_rate: 18, discount_amount: 500 } },
  { name: "junk input", input: { items: [{ quantity: "abc", unit_price: null }], gst_rate: 18 } },
];

const headline = (t: ReturnType<typeof computeInvoice>) => ({
  taxable_total: t.taxable_total, gst_amount: t.gst_amount,
  cgst: t.cgst_amount, sgst: t.sgst_amount, igst: t.igst_amount,
  round_off: t.round_off, total_amount: t.total_amount, is_inter_state: t.is_inter_state,
});

describe("invoice totals: the browser and the server agree", () => {
  for (const c of CASES) {
    it(c.name, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(headline(computeInvoice(c.input as any))).toEqual(headline(server.computeInvoice(c.input as any)));
    });
  }

  it("line-level values match too, not just the headline", () => {
    const input = { items: [{ quantity: 1, unit_price: 100 }, { quantity: 1, unit_price: 250 }], gst_rate: 18, discount_amount: 33, place_of_supply_code: "27", seller_state_code: "27" };
    const a = computeInvoice(input).lines.map((l) => [l.taxable_value, l.tax_amount, l.cgst_amount, l.sgst_amount]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = (server.computeInvoice(input as any).lines as any[]).map((l) => [l.taxable_value, l.tax_amount, l.cgst_amount, l.sgst_amount]);
    expect(a).toEqual(b);
  });

  it("due dates and words match", () => {
    expect(dueDateFromTerms("2026-09-01", 30)).toBe(server.dueDateFromTerms("2026-09-01", 30));
    expect(dueDateFromTerms("2026-01-31", 30)).toBe(server.dueDateFromTerms("2026-01-31", 30));
    for (const n of [0, 1, 15, 1180, 100000, 10000000, 123456.78, 999999.99]) {
      expect(inWords(n)).toBe(server.inWords(n));
    }
  });
});

describe("invoice totals: the rules themselves", () => {
  it("tax lands on the discounted value, not the list price", () => {
    const t = computeInvoice({ items: [{ quantity: 1, unit_price: 1000, discount_pct: 10 }], gst_rate: 18 });
    expect(t.taxable_total).toBe(900);
    expect(t.gst_amount).toBe(162);
  });
  it("CGST and SGST always sum exactly to the tax", () => {
    for (const p of [555.55, 333.33, 101.01, 79.37]) {
      const t = computeInvoice({ items: [{ quantity: 1, unit_price: p }], gst_rate: 18, place_of_supply_code: "27", seller_state_code: "27" });
      expect(Math.round((t.cgst_amount + t.sgst_amount) * 100) / 100).toBe(t.gst_amount);
    }
  });
  it("an unknown place of supply produces no split rather than a wrong one", () => {
    const t = computeInvoice({ items: [{ quantity: 1, unit_price: 1000 }], gst_rate: 18, seller_state_code: "27" });
    expect(t.is_inter_state).toBeNull();
    expect(t.cgst_amount + t.sgst_amount + t.igst_amount).toBe(0);
    expect(t.gst_amount).toBe(180);
  });
});
