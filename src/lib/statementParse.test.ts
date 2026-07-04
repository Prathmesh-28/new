// Bank-statement parsing: Indian date formats, lakh commas, Dr/Cr columns, quoted narrations.
// A regression here imports wrong amounts/dates into the ledger.
import { describe, it, expect } from "vitest";
import { parseIndianDate, parseAmount, splitCsvLine, parseStatementCsv, guessCategory } from "./statementParse";

describe("parseIndianDate", () => {
  it("reads the common Indian bank forms", () => {
    expect(parseIndianDate("31/03/2026")).toBe("2026-03-31");
    expect(parseIndianDate("31-03-26")).toBe("2026-03-31");
    expect(parseIndianDate("31.03.2026")).toBe("2026-03-31");
    expect(parseIndianDate("31 Mar 2026")).toBe("2026-03-31");
    expect(parseIndianDate("31-Mar-26")).toBe("2026-03-31");
    expect(parseIndianDate("2026-03-31")).toBe("2026-03-31");
  });
  it("rejects garbage and impossible months", () => {
    expect(parseIndianDate("Opening Balance")).toBeNull();
    expect(parseIndianDate("31/13/2026")).toBeNull();
    expect(parseIndianDate("")).toBeNull();
  });
});

describe("parseAmount", () => {
  it("handles lakh commas, rupee signs, parens and Dr/Cr suffixes", () => {
    expect(parseAmount("1,23,456.78")).toBe(123456.78);
    expect(parseAmount("₹ 2,500.00")).toBe(2500);
    expect(parseAmount("(500)")).toBe(-500);
    expect(parseAmount("500 Cr")).toBe(500);
    expect(parseAmount("500 Dr")).toBe(-500);
    expect(parseAmount("-")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("splitCsvLine", () => {
  it("honors quoted fields with embedded commas and escaped quotes", () => {
    expect(splitCsvLine('01/04/2026,"NEFT, ACME LTD",500', ",")).toEqual(["01/04/2026", "NEFT, ACME LTD", "500"]);
    expect(splitCsvLine('a,"he said ""hi""",b', ",")).toEqual(["a", 'he said "hi"', "b"]);
  });
});

describe("parseStatementCsv", () => {
  it("parses an HDFC-style Debit/Credit statement with metadata preamble", () => {
    const csv = [
      "Account Statement for 50100xxxx",
      "Period: 01/04/2026 to 30/04/2026",
      "Date,Narration,Chq/Ref No,Value Date,Withdrawal Amt,Deposit Amt,Closing Balance",
      '01/04/2026,"UPI-SHARMA TRADERS-PAY",UPI123,01/04/2026,,"25,000.00","1,25,000.00"',
      '03/04/2026,"NEFT-RENT APRIL",N001,03/04/2026,"18,000.00",,"1,07,000.00"',
      "TOTAL,,,,18000,25000,",
    ].join("\n");
    const r = parseStatementCsv(csv);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toEqual({ date: "2026-04-01", description: "UPI-SHARMA TRADERS-PAY", amount: 25000 });
    expect(r.lines[1]).toEqual({ date: "2026-04-03", description: "NEFT-RENT APRIL", amount: -18000 });
    expect(r.skipped).toBe(1); // the TOTAL footer row
  });

  it("parses a single-Amount-column statement keeping signs", () => {
    const csv = [
      "Txn Date,Description,Amount",
      "05/04/2026,Customer collection,15000",
      "06/04/2026,Vendor payment,-9000",
    ].join("\n");
    const r = parseStatementCsv(csv);
    expect(r.lines.map((l) => l.amount)).toEqual([15000, -9000]);
  });

  it("handles a headerless date-desc-amount file", () => {
    const r = parseStatementCsv("01/04/2026,Opening sale,1200\n02/04/2026,Tea shop,-40");
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1].amount).toBe(-40);
  });

  it("returns empty on unreadable input instead of throwing", () => {
    expect(parseStatementCsv("hello world\nnothing here").lines).toHaveLength(0);
    expect(parseStatementCsv("").lines).toHaveLength(0);
  });

  it("parses semicolon-delimited files", () => {
    const r = parseStatementCsv("Date;Narration;Debit;Credit\n01/04/2026;POS PURCHASE;450;\n02/04/2026;REFUND;;450");
    expect(r.lines.map((l) => l.amount)).toEqual([-450, 450]);
  });
});

describe("guessCategory", () => {
  it("routes the obvious keywords and defaults by sign", () => {
    expect(guessCategory("SALARY APRIL STAFF", -50000)).toBe("payroll");
    expect(guessCategory("GST CHALLAN PMT-06", -12000)).toBe("tax");
    expect(guessCategory("EMI HDFC LTD 402", -8000)).toBe("loan");
    expect(guessCategory("UPI CUSTOMER", 2000)).toBe("revenue");
    expect(guessCategory("UPI GROCERY", -2000)).toBe("expense");
  });
});
