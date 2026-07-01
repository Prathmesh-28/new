import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FilePlus, IndianRupee, Receipt, FileText, UserPlus } from "lucide-react";
import { useApp } from "@/context/AppContext";

/* Persistent global "New…" quick-create, fixed top-right just left of the notification
   bell. The daily jobs (raise an invoice, record a payment, add an expense/bill/customer)
   are one tap from anywhere instead of navigating into a feature page first. Deep-links to
   each create surface (invoices open their composer via ?compose=1). Hidden in read-only
   (client) view. */
const ITEMS: { label: string; to: string; icon: typeof Plus }[] = [
  { label: "New Invoice",    to: "/invoices?compose=1", icon: FilePlus },
  { label: "Record Payment", to: "/payments",           icon: IndianRupee },
  { label: "Add Expense",    to: "/transactions",       icon: Receipt },
  { label: "New Bill",       to: "/vendors",            icon: FileText },
  { label: "Add Customer",   to: "/sales?t=crm",        icon: UserPlus },
];

export default function QuickCreate() {
  const navigate = useNavigate();
  const { isReadOnly } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (isReadOnly) return null;
  const go = (to: string) => { setOpen(false); navigate(to); };

  return (
    <div ref={ref} className="fixed z-50 top-1.5 right-[6.25rem] md:top-4 md:right-[4.75rem]">
      <button onClick={() => setOpen((v) => !v)} aria-label="Create new" aria-expanded={open}
        className="h-9 px-2.5 md:px-3 rounded-full bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold text-xs flex items-center gap-1.5 shadow-sm hover:opacity-90">
        <Plus size={16} /><span className="hidden md:inline">New</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden py-1">
          {ITEMS.map(({ label, to, icon: Icon }) => (
            <button key={label} onClick={() => go(to)}
              className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-[var(--color-accent)]">
              <Icon size={15} className="text-[var(--color-muted)]" />{label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
