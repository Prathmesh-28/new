// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import TabStrip, { type TabDef } from "./TabStrip";

// 12 tabs: 6 primary + 6 overflow, so overflow.length (6) stays BELOW the search
// threshold (8) for the no-search case, and a second 20-tab set exercises search.
const smallTabs: TabDef[] = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, label: `Tab ${i}` }));
const bigTabs: TabDef[] = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, label: `Tab ${i}` }));

// Node 22+'s own experimental `localStorage` global shadows jsdom's real implementation
// under this vitest/Node combination (present but every method is a non-functional stub) —
// a test-environment quirk, not a real-browser issue. A tiny in-memory polyfill sidesteps
// it so the pin-persistence test actually exercises real get/set/clear semantics.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
Object.defineProperty(window, "localStorage", { value: new MemoryStorage(), writable: true, configurable: true });

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

describe("TabStrip", () => {
  it("renders the first primaryCount tabs inline", () => {
    render(<TabStrip tabs={smallTabs} active="t0" onChange={() => {}} primaryCount={6} />);
    expect(screen.getByRole("button", { name: "Tab 0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tab 5" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tab 6" })).toBeNull(); // in overflow, not inline
  });

  it("does not show a search box when overflow is small", () => {
    render(<TabStrip tabs={smallTabs} active="t0" onChange={() => {}} primaryCount={6} />);
    fireEvent.click(screen.getByRole("button", { name: /More tools/ }));
    expect(screen.queryByPlaceholderText("Search tools…")).toBeNull();
  });

  it("shows a search box once overflow exceeds the threshold, and filters", () => {
    render(<TabStrip tabs={bigTabs} active="t0" onChange={() => {}} primaryCount={6} />);
    fireEvent.click(screen.getByRole("button", { name: /More tools/ }));
    const search = screen.getByPlaceholderText("Search tools…");
    expect(search).toBeTruthy();
    fireEvent.change(search, { target: { value: "Tab 15" } });
    expect(screen.getByRole("menuitem", { name: /Tab 15/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /^Tab 7$/ })).toBeNull();
  });

  it("calls onChange and closes the menu when an overflow tab is clicked", () => {
    let picked = "";
    render(<TabStrip tabs={smallTabs} active="t0" onChange={(id) => { picked = id; }} primaryCount={6} />);
    fireEvent.click(screen.getByRole("button", { name: /More tools/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Tab 7" }));
    expect(picked).toBe("t7");
  });

  it("pins an overflow tab to the top and persists it across remounts", () => {
    const { unmount } = render(<TabStrip tabs={bigTabs} active="t0" onChange={() => {}} primaryCount={6} storageKey="test-page" />);
    fireEvent.click(screen.getByRole("button", { name: /More tools/ }));
    // Pin the LAST overflow tab (Tab 19) specifically, so "did it move to the top" is an
    // unambiguous signal rather than coincidentally already being first.
    const pinButtons = screen.getAllByTitle("Pin to top");
    fireEvent.click(pinButtons[pinButtons.length - 1]);
    unmount();

    render(<TabStrip tabs={bigTabs} active="t0" onChange={() => {}} primaryCount={6} storageKey="test-page" />);
    fireEvent.click(screen.getByRole("button", { name: /More tools/ }));
    const menu = screen.getByRole("menu");
    const firstItem = menu.querySelector("[role=menuitem]");
    // Tab 19 (the LAST overflow tab, pinned above) must now be first.
    expect(firstItem?.textContent).toContain("Tab 19");
  });

  it("without storageKey, no pin affordance is offered", () => {
    render(<TabStrip tabs={bigTabs} active="t0" onChange={() => {}} primaryCount={6} />);
    fireEvent.click(screen.getByRole("button", { name: /More tools/ }));
    expect(screen.queryByTitle("Pin to top")).toBeNull();
  });
});
