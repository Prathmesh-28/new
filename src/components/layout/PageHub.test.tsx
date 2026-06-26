// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PageHub, { type HubTab } from "./PageHub";

const tabs: HubTab[] = [
  { key: "pipeline", label: "Sales Pipeline", element: <div>PIPELINE_BODY</div> },
  { key: "crm", label: "Contacts & CRM", element: <div>CRM_BODY</div> },
];

afterEach(cleanup);

describe("PageHub", () => {
  it("renders the first tab by default", () => {
    render(<MemoryRouter initialEntries={["/sales"]}><PageHub tabs={tabs} /></MemoryRouter>);
    expect(screen.getByText("PIPELINE_BODY")).toBeTruthy();
    expect(screen.queryByText("CRM_BODY")).toBeNull();   // only the active tab renders
  });

  it("deep-links to a tab via ?t=", () => {
    render(<MemoryRouter initialEntries={["/sales?t=crm"]}><PageHub tabs={tabs} /></MemoryRouter>);
    expect(screen.getByText("CRM_BODY")).toBeTruthy();
    expect(screen.queryByText("PIPELINE_BODY")).toBeNull();
  });

  it("switches the body when a tab is clicked", () => {
    render(<MemoryRouter initialEntries={["/sales"]}><PageHub tabs={tabs} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Contacts & CRM/ }));
    expect(screen.getByText("CRM_BODY")).toBeTruthy();
    expect(screen.queryByText("PIPELINE_BODY")).toBeNull();
  });

  it("falls back to the first tab for an unknown ?t=", () => {
    render(<MemoryRouter initialEntries={["/sales?t=nonsense"]}><PageHub tabs={tabs} /></MemoryRouter>);
    expect(screen.getByText("PIPELINE_BODY")).toBeTruthy();
  });

  it("renders every tab as a button", () => {
    render(<MemoryRouter initialEntries={["/sales"]}><PageHub tabs={tabs} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /Sales Pipeline/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Contacts & CRM/ })).toBeTruthy();
  });
});
