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
  it("renders bold inside a bullet", () => expect(html).toMatch(/<li>[^<]*<strong/));
  it("plain text degrades to a <p>", () => {
    const p = renderToStaticMarkup(<Markdown text={"Just a plain sentence."} />);
    expect(p).toContain("<p");
    expect(p).toContain("Just a plain sentence.");
  });
});
