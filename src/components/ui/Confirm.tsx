import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";

/**
 * Replaces `window.confirm`, which 32 files were using to guard destructive actions.
 * The native dialog can't say what will be deleted, can't be styled, can't be typed into
 * for a high-stakes confirmation, and on mobile web it is easy to dismiss by accident.
 *
 *   const confirm = useConfirm();
 *   if (!await confirm({ title: "Delete invoice INV-0007?", body: "…", danger: true })) return;
 *
 * `confirmText` demands the user type an exact phrase — reserved for the handful of
 * actions with no undo (purging the bin, closing a period, deleting the firm).
 */
type ConfirmOpts = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the confirm button stays disabled until the user types this exactly. */
  confirmText?: string;
};

const Ctx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [typed, setTyped] = useState("");
  const resolver = useRef<(v: boolean) => void>(() => {});

  const confirm = useCallback((o: ConfirmOpts) => {
    setTyped("");
    setOpts(o);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = (v: boolean) => { setOpts(null); resolver.current(v); };
  const blocked = !!opts?.confirmText && typed.trim() !== opts.confirmText;

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => settle(false)}
        title={opts?.title ?? ""}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => settle(false)}>{opts?.cancelLabel ?? "Cancel"}</Button>
            <Button
              variant={opts?.danger ? "danger" : "primary"}
              disabled={blocked}
              onClick={() => settle(true)}
              autoFocus
            >
              {opts?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <div className="flex gap-3">
          {opts?.danger && (
            <div className="shrink-0 w-9 h-9 rounded-lg bg-red-950/40 flex items-center justify-center">
              <AlertTriangle size={17} className="text-red-400" />
            </div>
          )}
          <div className="min-w-0 space-y-3 text-sm text-[var(--color-muted)] leading-relaxed">
            {typeof opts?.body === "string" ? <p>{opts.body}</p> : opts?.body}
            {opts?.confirmText && (
              <div className="space-y-1.5">
                <label htmlFor="confirm-phrase" className="text-xs text-[var(--color-muted)]">
                  Type <span className="font-mono text-[var(--color-text)]">{opts.confirmText}</span> to continue
                </label>
                <input
                  id="confirm-phrase" value={typed} onChange={(e) => setTyped(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                  autoComplete="off"
                />
              </div>
            )}
          </div>
        </div>
      </Modal>
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
