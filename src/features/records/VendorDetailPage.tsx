import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, Landmark, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { deleteWithUndo } from "@/lib/undo";
import Button from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Confirm";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { LoadingState, ErrorState } from "@/components/EmptyState";
import { useTrackView } from "@/hooks/useRecentlyViewed";
import RecordShell, { CopyValue, Detail } from "./RecordShell";

/**
 * /vendors/:id — the supplier record, openable at last.
 *
 * vendor_master has existed for a while but had no detail route and no single-record
 * endpoint, so a supplier could only be edited inside a row on a 4,700-line page and their
 * purchase history lived somewhere else entirely.
 *
 * MSME status is surfaced prominently because it is not cosmetic: s.43B(h) disallows the
 * expense if a micro or small supplier isn't paid within the statutory window.
 */
type Bill = { id: string; bill_number: string; bill_date: string | null; total_amount: string; paid_amount: string | null; status: string; due_date: string | null };
type Vendor = {
  id: string; name: string; gstin: string | null; pan: string | null; contact_name: string | null;
  phone: string | null; email: string | null; upi: string | null; bank_account: string | null; bank_ifsc: string | null;
  payment_terms_days: number | null; is_msme: boolean; msme_category: string | null; udyam: string | null;
  category: string | null; notes: string | null; created_at: string;
  bills: Bill[]; outstanding: number; billed: number; count: number;
};

/** Share-a-link panel: the supplier sees their own bills and what's due to them, straight
 *  from these books — so they stop calling to ask. Token shown once, stored hashed. */
function VendorPortalCard({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  type PLink = { id: string; token_hint: string; expires_at: string | null; view_count: number };
  const confirm = useConfirm();
  const [link, setLink] = useState<PLink | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<PLink | null>(`/api/vendors/${vendorId}/portal-link`).then(setLink).catch(() => setLink(null));
  }, [vendorId]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ token: string }>(`/api/vendors/${vendorId}/portal-link`, { expiresInDays: 90 });
      setFresh(r.token);
      toast.success("Link created", { description: "Copy it now — it can't be shown again, only replaced." });
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create the link"); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!await confirm({ title: `Turn off ${vendorName}'s link?`, body: "They stop being able to open it immediately.", danger: true, confirmLabel: "Turn it off" })) return;
    setBusy(true);
    try { await api.delete(`/api/vendors/${vendorId}/portal-link`); setFresh(null); toast.success("Link turned off"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't turn it off"); }
    finally { setBusy(false); }
  };
  const url = fresh ? `${window.location.origin}/vendor-portal/${fresh}` : null;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Supplier portal link</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          A page {vendorName} can open — no login — showing their booked bills, what's been paid, and what's still due to them. They stop calling to ask.
        </p>
      </div>
      {url && (
        <div className="flex items-center gap-2">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()}
            className="flex-1 bg-[var(--color-bg)] border border-[var(--color-primary)]/40 rounded-lg px-3 py-2 text-xs font-mono outline-none" />
          <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(url).then(() => toast.success("Copied")).catch(() => {}); }}>Copy</Button>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        {link
          ? <span className="text-[var(--color-muted)]">Live link ends in <span className="font-mono">…{link.token_hint}</span>{link.view_count ? ` · opened ${link.view_count}×` : " · not opened yet"}</span>
          : <span className="text-[var(--color-muted)]">No link is live.</span>}
        <span className="flex-1" />
        <Button size="sm" variant="primary" loading={busy} onClick={create}>{link ? "Replace" : "Create a link"}</Button>
        {link && <Button size="sm" variant="ghost" loading={busy} onClick={revoke}>Turn off</Button>}
      </div>
    </div>
  );
}

export default function VendorDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [v, setV] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    api.get<Vendor>(`/api/vendors/${id}`)
      .then((x) => {
        setV(x);
        setForm({
          name: x.name, gstin: x.gstin ?? "", pan: x.pan ?? "", contact_name: x.contact_name ?? "",
          phone: x.phone ?? "", email: x.email ?? "", upi: x.upi ?? "", bank_ifsc: x.bank_ifsc ?? "",
          payment_terms_days: String(x.payment_terms_days ?? 30), category: x.category ?? "",
          is_msme: !!x.is_msme, msme_category: x.msme_category ?? "", udyam: x.udyam ?? "", notes: x.notes ?? "",
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load this vendor"))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useTrackView(v ? { entity: "vendor", id: v.id, label: v.name, href: `/vendors/${v.id}` } : null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/vendors/${id}`, { ...form, payment_terms_days: Number(form.payment_terms_days) || 0 });
      toast.success("Saved");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!v) return;
    if (!await confirm({
      title: `Delete ${v.name}?`,
      body: v.count > 0
        ? `They have ${v.count} bill(s) on record. Deleting sends the vendor to Trash for 30 days; the bills stay.`
        : "They go to Trash for 30 days.",
      danger: true, confirmLabel: "Delete",
    })) return;
    await deleteWithUndo({ label: v.name, remove: () => api.delete(`/api/vendors/${v.id}`), onDone: () => navigate("/vendors") });
  };

  if (loading) return <div className="max-w-7xl mx-auto"><LoadingState rows={5} label="Loading vendor" /></div>;
  if (error || !v) return <div className="max-w-7xl mx-auto"><ErrorState title="Couldn't open this vendor" message={error ?? undefined} onRetry={load} /></div>;

  const msmeSmall = v.is_msme && ["micro", "small"].includes(String(v.msme_category || "").toLowerCase());

  return (
    <RecordShell
      entity="vendor" entityId={v.id}
      backTo="/vendors" backLabel="All vendors"
      title={v.name}
      subtitle={<span>{v.gstin ? <CopyValue value={v.gstin} /> : "No GSTIN on file"}{v.category ? ` · ${v.category}` : ""}</span>}
      meta={{ createdAt: v.created_at }}
      badges={
        <>
          {v.is_msme && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-semibold">
              <ShieldCheck size={9} /> MSME {v.msme_category || ""}
            </span>
          )}
          {v.outstanding > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold">
              {formatCurrency(v.outstanding)} owed
            </span>
          )}
        </>
      }
      actions={<Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={del} title="Delete (recoverable for 30 days)" />}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Detail label="Owed to them" value={<span className={`font-bold text-base ${v.outstanding > 0 ? "text-amber-400" : ""}`}>{formatCurrency(v.outstanding)}</span>} />
        <Detail label="Billed to date" value={formatCurrency(v.billed)} />
        <Detail label="Bills on record" value={String(v.count)} />
        <Detail label="Payment terms" value={v.payment_terms_days ? `Net ${v.payment_terms_days}` : "On receipt"} />
      </div>

      {msmeSmall && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-4">
          <p className="text-xs text-blue-300">
            <strong>MSME {v.msme_category}.</strong> Under s.43B(h), what you owe them is only deductible in the year
            you actually pay it if payment lands within the agreed window (or 15 days where there's no written
            agreement). Late payment here moves the deduction to a later year — it isn't just a supplier-relations issue.
          </p>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2"><Building2 size={14} className="text-[var(--color-muted)]" /><h2 className="text-sm font-semibold">Vendor details</h2></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <TextField label="Name" required value={String(form.name ?? "")} onChange={set("name")} />
          <TextField label="Category" value={String(form.category ?? "")} onChange={set("category")} placeholder="e.g. Raw materials" />
          <TextField label="GSTIN" value={String(form.gstin ?? "")} onChange={set("gstin")} />
          <TextField label="PAN" value={String(form.pan ?? "")} onChange={set("pan")} help="Stored encrypted." />
          <TextField label="Contact person" value={String(form.contact_name ?? "")} onChange={set("contact_name")} />
          <TextField label="Phone" value={String(form.phone ?? "")} onChange={set("phone")} />
          <TextField label="Email" type="email" value={String(form.email ?? "")} onChange={set("email")} />
          <TextField label="Payment terms (days)" type="number" min={0} max={365}
            value={String(form.payment_terms_days ?? "")} onChange={set("payment_terms_days")}
            help="Drives the 43B(h) clock for an MSME supplier." />
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2"><Landmark size={14} className="text-[var(--color-muted)]" /><h2 className="text-sm font-semibold">How you pay them</h2></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <TextField label="UPI ID" value={String(form.upi ?? "")} onChange={set("upi")} placeholder="name@bank" />
          <TextField label="Bank IFSC" value={String(form.bank_ifsc ?? "")} onChange={set("bank_ifsc")} />
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">
          The bank account number is stored encrypted and isn't shown here. Change it from the Vendors page if you need to.
        </p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-[var(--color-muted)]" /><h2 className="text-sm font-semibold">MSME status</h2></div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[var(--color-primary)]"
            checked={!!form.is_msme} onChange={(e) => setForm((f) => ({ ...f, is_msme: e.target.checked }))} />
          This supplier is registered as an MSME
        </label>
        {!!form.is_msme && (
          <div className="grid sm:grid-cols-2 gap-3">
            <SelectField label="Category" value={String(form.msme_category ?? "")} onChange={set("msme_category")}
              help="Only micro and small trigger s.43B(h).">
              <option value="">Not stated</option>
              <option value="micro">Micro</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
            </SelectField>
            <TextField label="Udyam registration number" value={String(form.udyam ?? "")} onChange={set("udyam")} />
          </div>
        )}
      </div>

      <TextAreaField label="Notes" value={String(form.notes ?? "")} onChange={set("notes")}
        help="Anything the next person paying this supplier should know." />

      <div className="flex justify-end">
        <Button variant="primary" icon={<Save size={13} />} loading={saving} onClick={save}>Save changes</Button>
      </div>

      <VendorPortalCard vendorId={v.id} vendorName={v.name} />

      {v.bills.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><h2 className="text-sm font-semibold">Recent bills</h2></div>
          <table className="w-full text-sm rcard">
            <thead className="border-b border-[var(--color-border)]">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Bill</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Date</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {v.bills.map((b) => (
                <tr key={b.id}>
                  <td data-label="Bill" className="px-4 py-2.5 font-mono text-xs">{b.bill_number}</td>
                  <td data-label="Date" className="px-4 py-2.5 text-xs">{b.bill_date || "—"}</td>
                  <td data-label="Amount" className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(Number(b.total_amount))}</td>
                  <td data-label="Status" className="px-4 py-2.5 text-xs">{b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </RecordShell>
  );
}
