// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import CurrencyInput from "./CurrencyInput";

afterEach(cleanup);

describe("CurrencyInput", () => {
  it("shows Indian lakh-grouped formatting when not focused", () => {
    render(<CurrencyInput value={1234567} onChange={() => {}} label="Amount" id="a1" />);
    expect(screen.getByLabelText("Amount")).toHaveProperty("value", "12,34,567");
  });

  it("switches to a plain editable number on focus", () => {
    render(<CurrencyInput value={1234567} onChange={() => {}} label="Amount" id="a1" />);
    const input = screen.getByLabelText("Amount");
    fireEvent.focus(input);
    expect(input).toHaveProperty("value", "1234567");
  });

  it("emits a plain number (not a formatted string) on blur", () => {
    let seen: number | null = null;
    render(<CurrencyInput value={null} onChange={(v) => { seen = v; }} label="Amount" id="a1" />);
    const input = screen.getByLabelText("Amount");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "50000" } });
    fireEvent.blur(input);
    expect(seen).toBe(50000);
  });

  it("rejects non-numeric keystrokes while typing", () => {
    render(<CurrencyInput value={null} onChange={() => {}} label="Amount" id="a1" />);
    const input = screen.getByLabelText("Amount");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "12a34" } });
    expect(input).toHaveProperty("value", ""); // rejected: buffer unchanged from empty
  });

  it("rejects a negative keystroke outright — a currency amount is never negative", () => {
    render(<CurrencyInput value={null} onChange={() => {}} label="Amount" id="a1" />);
    const input = screen.getByLabelText("Amount");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "-50" } });
    expect(input).toHaveProperty("value", ""); // the "-" keystroke never lands in the buffer
  });

  it("clamps a valid-but-too-low value up to min on blur", () => {
    let seen: number | null = null;
    render(<CurrencyInput value={null} onChange={(v) => { seen = v; }} label="Amount" id="a1" min={100} />);
    const input = screen.getByLabelText("Amount");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.blur(input);
    expect(seen).toBe(100);
  });

  it("emits null on blur when the field is cleared", () => {
    let seen: number | null = 999;
    render(<CurrencyInput value={100} onChange={(v) => { seen = v; }} label="Amount" id="a1" />);
    const input = screen.getByLabelText("Amount");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(seen).toBeNull();
  });
});
