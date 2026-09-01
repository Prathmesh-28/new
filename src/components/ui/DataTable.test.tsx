// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import DataTable, { type Column } from "./DataTable";
import { PrefsProvider } from "@/hooks/usePrefs";

// Node 22+ exposes a non-functional experimental `localStorage`; the prefs cache needs a
// real one. Same in-memory shim TabStrip.test.tsx uses.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
Object.defineProperty(window, "localStorage", { value: new MemoryStorage(), writable: true, configurable: true });

// The table renders inside PrefsProvider, which fetches /api/prefs on mount. Stub fetch so
// the component tree mounts without a backend.
beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Row = { id: string; name: string; amount: number; city: string };
const ROWS: Row[] = [
  { id: "1", name: "Zeta Traders",  amount: 3000, city: "Pune" },
  { id: "2", name: "Acme Supplies", amount: 1000, city: "Delhi" },
  { id: "3", name: "Mango Foods",   amount: 2000, city: "Delhi" },
];
const COLS: Column<Row>[] = [
  { key: "name",   header: "Name" },
  { key: "amount", header: "Amount", align: "right", total: "sum" },
  { key: "city",   header: "City", defaultHidden: true },
];

const setup = (props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) =>
  render(
    <PrefsProvider>
      <DataTable<Row> listKey="test" columns={COLS} rows={ROWS} rowKey={(r) => r.id} {...props} />
    </PrefsProvider>
  );

const bodyText = () =>
  Array.from(document.querySelectorAll("tbody tr")).map((tr) => tr.textContent || "");

describe("DataTable", () => {
  it("renders one row per record and reports the count honestly", () => {
    setup();
    expect(document.querySelectorAll("tbody tr").length).toBe(3);
    expect(screen.getByText(/of/).textContent).toContain("3");
  });

  it("sorts by a column, and flips direction on a second click", () => {
    setup();
    const amountHeader = screen.getByRole("button", { name: /Amount/ });
    fireEvent.click(amountHeader);
    expect(bodyText()[0]).toContain("Acme Supplies"); // 1000 first, ascending
    fireEvent.click(amountHeader);
    expect(bodyText()[0]).toContain("Zeta Traders");  // 3000 first, descending
  });

  it("exposes sort state to assistive technology via aria-sort", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Name/ }));
    const th = screen.getByRole("button", { name: /Name/ }).closest("th")!;
    expect(th.getAttribute("aria-sort")).toBe("ascending");
  });

  it("searches across visible columns", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(/Search this list/), { target: { value: "mango" } });
    expect(document.querySelectorAll("tbody tr").length).toBe(1);
    expect(bodyText()[0]).toContain("Mango Foods");
  });

  it("tells the user when a search matched nothing, instead of showing a blank table", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(/Search this list/), { target: { value: "zzzz" } });
    expect(screen.getByText(/Nothing matches/).textContent).toContain("zzzz");
  });

  it("hides defaultHidden columns but offers them in the column picker", () => {
    setup();
    expect(screen.queryByRole("button", { name: /^City/ })).toBeNull();
    fireEvent.click(screen.getByLabelText("Toggle row density")); // unrelated control still works
    fireEvent.click(screen.getByTitle("Choose columns"));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitemcheckbox", { name: "City" }).getAttribute("aria-checked")).toBe("false");
  });

  it("shows a footer total for columns that ask for one", () => {
    setup();
    const foot = document.querySelector("tfoot")!;
    expect(foot.textContent).toContain("6,000"); // 1000 + 2000 + 3000, en-IN grouping
  });

  it("paginates and never strands the user past the last page", () => {
    setup({ pageSize: 2 });
    expect(document.querySelectorAll("tbody tr").length).toBe(2);
    expect(screen.getByText(/Page 1 of 2/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(document.querySelectorAll("tbody tr").length).toBe(1);
    // Narrowing the result set while on page 2 must fall back to a page that exists,
    // not show an empty table because the old page number is now out of range.
    fireEvent.change(screen.getByPlaceholderText(/Search this list/), { target: { value: "Foods" } });
    expect(document.querySelectorAll("tbody tr").length).toBe(1);
    expect(bodyText()[0]).toContain("Mango Foods");
  });

  it("only searches columns the user can actually see", () => {
    // "Delhi" lives in the City column, which is hidden by default — matching on it would
    // return rows with no visible reason for being there.
    setup();
    fireEvent.change(screen.getByPlaceholderText(/Search this list/), { target: { value: "Delhi" } });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
  });

  it("selects rows and surfaces bulk actions only when something is selected", () => {
    const onBulk = vi.fn();
    setup({ bulkActions: (rows: Row[]) => <button onClick={() => onBulk(rows)}>Do it</button> });
    expect(screen.queryByText("Do it")).toBeNull();
    fireEvent.click(screen.getByLabelText("Select row 1"));
    expect(screen.getByText(/1 selected/)).toBeTruthy();
    fireEvent.click(screen.getByText("Do it"));
    expect(onBulk).toHaveBeenCalledOnce();
    expect(onBulk.mock.calls[0][0]).toHaveLength(1);
  });

  it("select-all covers every row on the page", () => {
    setup({ bulkActions: () => <span>bulk</span> });
    fireEvent.click(screen.getByLabelText("Select all rows on this page"));
    expect(screen.getByText(/3 selected/)).toBeTruthy();
  });

  it("opens a row on click, so a list row can be a permalink", () => {
    const onRowClick = vi.fn();
    setup({ onRowClick });
    fireEvent.click(document.querySelectorAll("tbody tr")[0]);
    expect(onRowClick).toHaveBeenCalledOnce();
  });

  it("in server mode it emits the query instead of filtering in memory", () => {
    const onQueryChange = vi.fn();
    setup({
      serverMode: true, total: 500,
      query: { page: 1, limit: 25, sort: "amount", order: "desc", q: "" },
      onQueryChange,
    });
    // Every row handed in is rendered — the server already did the filtering.
    expect(document.querySelectorAll("tbody tr").length).toBe(3);
    // The count reflects the SERVER total, not the three rows on screen.
    expect(document.querySelector("[aria-live=polite]")!.textContent).toContain("500");
    fireEvent.click(screen.getByRole("button", { name: /Name/ }));
    expect(onQueryChange).toHaveBeenCalledWith(expect.objectContaining({ sort: "name", order: "asc", page: 1 }));
  });

  it("moves the row focus with the arrow keys and opens with Enter", () => {
    const onRowClick = vi.fn();
    setup({ onRowClick });
    const grid = screen.getByRole("region", { name: /test table/ });
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
  });
});
