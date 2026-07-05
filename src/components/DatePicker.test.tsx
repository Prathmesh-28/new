// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import DatePicker from "./DatePicker";

afterEach(cleanup);

describe("DatePicker", () => {
  it("renders the ISO value in the native date input", () => {
    render(<DatePicker value="2026-07-05" onChange={() => {}} label="Due date" id="d1" />);
    expect(screen.getByLabelText("Due date")).toHaveProperty("value", "2026-07-05");
  });

  it("shows an unambiguous readable date label next to the field", () => {
    render(<DatePicker value="2026-07-05" onChange={() => {}} label="Due date" id="d1" />);
    expect(screen.getByText("5 Jul 2026")).toBeTruthy();
  });

  it("shows no readable label when there is no value", () => {
    render(<DatePicker value="" onChange={() => {}} label="Due date" id="d1" />);
    expect(screen.queryByText(/\d{4}/)).toBeNull();
  });

  it("shows a required asterisk when required", () => {
    render(<DatePicker value="" onChange={() => {}} label="Due date" required id="d1" />);
    expect(screen.getByText("*")).toBeTruthy();
  });

  it("emits the raw ISO string on change, unchanged", () => {
    let seen = "";
    render(<DatePicker value="" onChange={(v) => { seen = v; }} label="Due date" id="d1" />);
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-12-25" } });
    expect(seen).toBe("2026-12-25");
  });
});
