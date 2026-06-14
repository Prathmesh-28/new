import { describe, it, expect } from "vitest";
import { parse2BJson, parseRegisterRows, reconcile } from "./gstReconcile";

const TWO_B_JSON = JSON.stringify({
  data: {
    gstin: "27AAAAA0000A1Z5",
    docdata: {
      b2b: [
        {
          ctin: "29AAGCB7383J1Z4", trdnm: "Acme Supplies",
          inv: [
            { inum: "INV-001", dt: "10-05-2026", txval: 100000, igst: 18000 },
            { inum: "INV-002", dt: "12-05-2026", txval: 50000, cgst: 4500, sgst: 4500 },
          ],
        },
        {
          ctin: "27AAPFU0939F1ZV", trdnm: "Beta Traders",
          inv: [{ inum: "B/77", dt: "15-05-2026", itms: [{ itm_det: { txval: 20000, igst: 3600 } }] }],
        },
      ],
    },
  },
});

describe("parse2BJson", () => {
  it("flattens supplier→invoice and sums tax (inv-level and item-level)", () => {
    const lines = parse2BJson(TWO_B_JSON);
    expect(lines).toHaveLength(3);
    const inv1 = lines.find(l => l.invoiceNo === "INV-001")!;
    expect(inv1.gstin).toBe("29AAGCB7383J1Z4");
    expect(inv1.tax).toBe(18000);
    expect(lines.find(l => l.invoiceNo === "INV-002")!.tax).toBe(9000);
    expect(lines.find(l => l.invoiceNo === "B/77")!.tax).toBe(3600); // from items
  });
  it("rejects non-2B JSON", () => {
    expect(() => parse2BJson('{"foo":1}')).toThrow();
    expect(() => parse2BJson("not json")).toThrow();
  });
});

describe("parseRegisterRows", () => {
  it("maps fuzzy headers and sums igst/cgst/sgst when no total column", () => {
    // Uniform columns, as a real sheet export produces.
    const rows = [
      { "Supplier GSTIN": "29AAGCB7383J1Z4", "Invoice No": "INV-001", IGST: 18000, CGST: 0, SGST: 0, "Taxable Value": 100000 },
      { "Supplier GSTIN": "27AAPFU0939F1ZV", "Invoice No": "B 77", IGST: 0, CGST: 1800, SGST: 1800, "Taxable Value": 20000 },
    ];
    const lines = parseRegisterRows(rows);
    expect(lines).toHaveLength(2);
    expect(lines[0].tax).toBe(18000);   // must NOT pick up Taxable Value (100000)
    expect(lines[1].tax).toBe(3600);
  });
});

describe("reconcile", () => {
  it("buckets matched / mismatch / missing-in-2b / missing-in-books and totals ITC", () => {
    const twoB = parse2BJson(TWO_B_JSON); // INV-001(18000), INV-002(9000), B/77(3600)
    const register = parseRegisterRows([
      { gstin: "29AAGCB7383J1Z4", invoice_no: "INV-001", total_tax: 18000 },     // matched
      { gstin: "29AAGCB7383J1Z4", invoice_no: "INV-002", total_tax: 7000 },      // mismatch (9000 vs 7000)
      { gstin: "29AAGCB7383J1Z4", invoice_no: "INV-009", total_tax: 5000 },      // missing in 2B
      // B/77 present in 2B but NOT in register → missing in books
    ]);
    const { summary } = reconcile(register, twoB);
    expect(summary.counts.matched).toBe(1);
    expect(summary.counts.mismatch).toBe(1);
    expect(summary.counts.missing_in_2b).toBe(1);
    expect(summary.counts.missing_in_books).toBe(1);
    expect(summary.itcAtRisk).toBe(5000);            // INV-009 claimed but not in 2B
    expect(summary.itcAvailableUnclaimed).toBe(3600); // B/77 in 2B, not booked
    expect(summary.mismatchDelta).toBe(-2000);        // 7000 - 9000
  });

  it("treats invoice numbers with spacing/case differences as the same", () => {
    const twoB = parseRegisterRows([{ gstin: "29aagcb7383j1z4", invoice_no: "inv 001", total_tax: 1000 }]);
    const reg = parseRegisterRows([{ gstin: "29AAGCB7383J1Z4", invoice_no: "INV001", total_tax: 1000 }]);
    expect(reconcile(reg, twoB).summary.counts.matched).toBe(1);
  });
});
