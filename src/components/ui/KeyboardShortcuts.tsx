import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./Modal";

/**
 * The shortcut list, and the shortcuts themselves.
 *
 * ⌘K existed; nothing else did, and nothing anywhere told the user that ⌘K existed.
 * "?" is the near-universal convention for "show me the keys" — this registers it, plus
 * the handful of jumps that save the most clicks in a product with 75 routes.
 *
 * Every handler bails out while the user is typing, so "?" in a customer's name is
 * still just a question mark.
 */
const isTyping = () => {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
};

export const SHORTCUTS: { keys: string; label: string; group: string; path?: string }[] = [
  { keys: "⌘ K", label: "Search anything — records, pages, tools", group: "Getting around" },
  { keys: "?",   label: "Show this list", group: "Getting around" },
  { keys: "G then D", label: "Go to Dashboard", group: "Go to", path: "/dashboard" },
  { keys: "G then I", label: "Go to Invoices", group: "Go to", path: "/invoices" },
  { keys: "G then T", label: "Go to Transactions", group: "Go to", path: "/transactions" },
  { keys: "G then C", label: "Go to Customers", group: "Go to", path: "/customers" },
  { keys: "G then V", label: "Go to Vendors", group: "Go to", path: "/vendors" },
  { keys: "G then B", label: "Go to Books", group: "Go to", path: "/books" },
  { keys: "N",   label: "New invoice", group: "Create", path: "/invoices?compose=1" },
  { keys: "Esc", label: "Close a dialog", group: "In a dialog" },
  { keys: "↑ ↓", label: "Move between rows", group: "In a list" },
  { keys: "Enter", label: "Open the highlighted row", group: "In a list" },
  { keys: "Space", label: "Select the highlighted row", group: "In a list" },
];

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let awaitingG = false;
    let gTimer: number | undefined;

    const onKey = (e: KeyboardEvent) => {
      if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;

      if (awaitingG) {
        const to = { d: "/dashboard", i: "/invoices", t: "/transactions", c: "/customers", v: "/vendors", b: "/books" }[e.key.toLowerCase()];
        awaitingG = false;
        window.clearTimeout(gTimer);
        if (to) { e.preventDefault(); navigate(to); }
        return;
      }
      if (e.key === "g" || e.key === "G") {
        awaitingG = true;
        // A lone "g" must not swallow the next unrelated keystroke forever.
        gTimer = window.setTimeout(() => { awaitingG = false; }, 1200);
        return;
      }
      if (e.key === "?") { e.preventDefault(); setOpen((v) => !v); return; }
      if (e.key === "n" || e.key === "N") { e.preventDefault(); navigate("/invoices?compose=1"); }
    };

    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.clearTimeout(gTimer); };
  }, [navigate]);

  const groups = Array.from(new Set(SHORTCUTS.map((s) => s.group)));

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" size="md"
      description="Press ? any time to bring this back.">
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
        {groups.map((g) => (
          <div key={g}>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-2">{g}</p>
            <ul className="space-y-1.5">
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <li key={s.keys + s.label} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-[var(--color-text)]">{s.label}</span>
                  <kbd className="shrink-0 px-1.5 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-[10px] text-[var(--color-muted)]">
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
