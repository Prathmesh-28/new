// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useUrlTab } from "./useUrlTab";

const VALID = ["overview", "ledger", "reports"] as const;

function Harness() {
  const [tab, setTab] = useUrlTab<(typeof VALID)[number]>("overview", { validValues: VALID });
  return (
    <div>
      <p>ACTIVE:{tab}</p>
      <button onClick={() => setTab("ledger")}>Go ledger</button>
      <button onClick={() => setTab("reports")}>Go reports</button>
      <button onClick={() => setTab("overview")}>Go overview</button>
    </div>
  );
}

afterEach(cleanup);

describe("useUrlTab", () => {
  it("defaults to the given tab with no ?tab= present", () => {
    render(<MemoryRouter initialEntries={["/gst"]}><Harness /></MemoryRouter>);
    expect(screen.getByText("ACTIVE:overview")).toBeTruthy();
  });

  it("deep-links from a ?tab= query param", () => {
    render(<MemoryRouter initialEntries={["/gst?tab=ledger"]}><Harness /></MemoryRouter>);
    expect(screen.getByText("ACTIVE:ledger")).toBeTruthy();
  });

  it("falls back to the default for an unknown ?tab= (never renders blank)", () => {
    render(<MemoryRouter initialEntries={["/gst?tab=not-a-real-tab"]}><Harness /></MemoryRouter>);
    expect(screen.getByText("ACTIVE:overview")).toBeTruthy();
  });

  it("switching tabs updates the rendered state", () => {
    render(<MemoryRouter initialEntries={["/gst"]}><Harness /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Go reports" }));
    expect(screen.getByText("ACTIVE:reports")).toBeTruthy();
  });

  it("switching back to the default tab is reflected immediately", () => {
    render(<MemoryRouter initialEntries={["/gst?tab=ledger"]}><Harness /></MemoryRouter>);
    expect(screen.getByText("ACTIVE:ledger")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go overview" }));
    expect(screen.getByText("ACTIVE:overview")).toBeTruthy();
  });

  it("works with a custom param name without colliding with the default", () => {
    function CustomHarness() {
      const [tab, setTab] = useUrlTab<(typeof VALID)[number]>("overview", { param: "section", validValues: VALID });
      return <div><p>ACTIVE:{tab}</p><button onClick={() => setTab("ledger")}>Go</button></div>;
    }
    render(<MemoryRouter initialEntries={["/gst?tab=reports"]}><CustomHarness /></MemoryRouter>);
    // ?tab=reports is irrelevant to a hook watching ?section= — must still be the default.
    expect(screen.getByText("ACTIVE:overview")).toBeTruthy();
  });
});
