import { useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { authHeaders } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import Button from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import DatePicker from "@/components/DatePicker";
import { inWords } from "@/lib/invoiceTotals";
import { formatCurrency } from "@/lib/utils";

/**
 * /cheque — print a cheque (Wave 16).
 *
 * Firms that pay by cheque were hand-writing the amount in words on every leaf, and a
 * corrected cheque is a bounced cheque. This lays payee, date boxes, words and the amount
 * box onto a standard CTS-2010 leaf you feed through a printer; print the first one on
 * plain paper and hold it against a leaf to check alignment.
 */
export default function ChequePage() {
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [acPayee, setAcPayee] = useState(true);
  const [busy, setBusy] = useState(false);

  const amt = Number(amount) || 0;

  const print = async () => {
    if (!payee.trim() || !(amt > 0)) { toast.error("Payee and amount, then print."); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/tools/cheque`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ payee: payee.trim(), amount: amt, date, acPayee }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't generate the cheque");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `cheque-${payee.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't generate the cheque"); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Print a cheque</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Amount in words, date boxes and the A/c-payee crossing, laid out for a standard cheque leaf. Print the first one on plain paper to check alignment against your bank's leaf.
        </p>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
        <TextField label="Pay to" required value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Steel Supply Co" autoFocus />
        <div className="grid sm:grid-cols-2 gap-3">
          <TextField label="Amount" required type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1" htmlFor="chq-date">Date</label>
            <DatePicker id="chq-date" value={date} onChange={setDate} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <input type="checkbox" className="accent-[var(--color-primary)]" checked={acPayee} onChange={(e) => setAcPayee(e.target.checked)} />
          Cross it "A/c payee only" (uncheck only if you know why)
        </label>
        {amt > 0 && (
          <p className="text-xs text-[var(--color-muted)] rounded-lg border border-[var(--color-border)] px-3 py-2">
            {formatCurrency(amt)} — <span className="italic">{inWords(amt)}</span>
          </p>
        )}
        <Button variant="primary" icon={<Printer size={13} />} loading={busy} onClick={print}>Generate the cheque PDF</Button>
      </div>
    </div>
  );
}
