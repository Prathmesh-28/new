// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "./Markdown";

const sample = `## Cash Position — Immediate Action Required

- You have a **balance of ₹67,40,000** against a monthly burn of **4,02,26,574**.
- **Overdue payables stand at ₹24,72,000 across 5 invoices**

### Top Priorities This Week

1. **Secure immediate liquidity** — arrange an OD/CC line.
2. **TDS deposit** is overdue.

> ⚠️ At current burn, you will be **cash-negative** by the end of this week.`;

// The exact shape that produced the "| Metric | Value | |---|---|" pipe-soup on screen.
const tableSample = `7. Summary

| Metric | Value |
|---|---|
| DCF Enterprise Value | ~₹3.18 Crore |
| Current Cash on Hand | ₹67.4 Lakhs |
| Cash Runway | ⚠️ Only 14 days |

---

*Based on data as of June 26, 2026.*`;

describe("Markdown renderer", () => {
  const html = renderToStaticMarkup(<Markdown text={sample} />);

  it("renders **bold** as <strong>", () => expect(html).toContain("<strong"));
  it("renders - bullets as <ul><li>", () => expect(html).toMatch(/<ul[^>]*><li/));
  it("renders 1. items as <ol><li>", () => expect(html).toMatch(/<ol[^>]*><li/));
  it("renders > as <blockquote>", () => expect(html).toContain("<blockquote"));
  it("keeps heading text (no ## marker)", () => {
    expect(html).toContain("Cash Position");
    expect(html).toContain("Top Priorities This Week");
  });
  it("leaves NO raw markdown syntax in the output", () => {
    expect(html).not.toContain("**");      // no stars
    expect(html).not.toMatch(/#{1,6}\s/);  // no # hatching
  });
  it("renders bold inside a bullet", () => expect(html).toMatch(/<li[^>]*>[^<]*<strong/));
  it("plain text degrades to a <p>", () => {
    const p = renderToStaticMarkup(<Markdown text={"Just a plain sentence."} />);
    expect(p).toContain("<p");
    expect(p).toContain("Just a plain sentence.");
  });
});

describe("Markdown renderer — tables, rules, links, italics", () => {
  const html = renderToStaticMarkup(<Markdown text={tableSample} />);

  it("renders a real <table> (not pipe-soup)", () => {
    expect(html).toContain("<table");
    expect(html).toContain("<thead");
    expect(html).toMatch(/<tbody[^>]*><tr/);
  });
  it("has header cells from the pipe row", () => {
    expect(html).toContain("<th");
    expect(html).toContain("Metric");
    expect(html).toContain("Value");
  });
  it("has the body rows as <td>", () => {
    expect(html).toContain("DCF Enterprise Value");
    expect(html).toContain("~₹3.18 Crore");
    expect(html).toContain("Only 14 days");
  });
  it("leaves NO raw pipes or separator dashes in the output", () => {
    expect(html).not.toContain("|");
    expect(html).not.toContain("---");
  });
  it("renders --- as an <hr>", () => expect(html).toContain("<hr"));
  it("renders *italic* as <em>", () => {
    const p = renderToStaticMarkup(<Markdown text={"This is *important* now."} />);
    expect(p).toContain("<em");
    expect(p).toContain("important");
    expect(p).not.toContain("*");
  });
  it("renders [text](url) as a safe <a>", () => {
    const p = renderToStaticMarkup(<Markdown text={"See [the report](https://x.test/r)."} />);
    expect(p).toMatch(/<a [^>]*href="https:\/\/x\.test\/r"/);
    expect(p).toContain('rel="noopener noreferrer"');
    expect(p).toContain("the report");
  });
  it("right/center alignment from :--: separators", () => {
    const p = renderToStaticMarkup(<Markdown text={"| A | B |\n|:--|--:|\n| 1 | 2 |"} />);
    expect(p).toMatch(/text-align:\s*right/);
  });
});
