// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import Modal from "./Modal";

afterEach(cleanup);

const open = (props: Partial<React.ComponentProps<typeof Modal>> = {}) => {
  const onClose = vi.fn();
  render(
    <Modal open onClose={onClose} title="Delete invoice" {...props}>
      <input aria-label="reason" />
      <button>Inside</button>
    </Modal>
  );
  return { onClose };
};

describe("Modal", () => {
  it("is announced as a dialog and labelled by its title", () => {
    open();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)!.textContent).toBe("Delete invoice");
  });

  it("closes on Escape", () => {
    const { onClose } = open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when the overlay behind it is clicked", () => {
    const { onClose } = open();
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close on an overlay click when the caller opted out", () => {
    const { onClose } = open({ closeOnOverlay: false });
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("lets a dirty form veto the close", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Edit" onBeforeClose={() => false}><p>body</p></Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks the page behind it so the background can't scroll", () => {
    open();
    expect(document.body.style.overflow).toBe("hidden");
    cleanup();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("renders nothing at all when closed", () => {
    render(<Modal open={false} onClose={() => {}} title="Hidden"><p>x</p></Modal>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
