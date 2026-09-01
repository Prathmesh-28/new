import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Confirm";
import EmptyState from "@/components/EmptyState";

/**
 * /trash — where deleted things go now.
 *
 * Every delete in the product used to be final: a window.confirm() and then a hard DELETE
 * with no way back. Deletes now archive the row and its children for 30 days
 * (backend lib/trash.js), which gives both the Undo toast at the moment of deletion and
 * this page for the times someone realises a week later.
 */
type TrashRow = {
  id: string; entity: string; entity_id: string; label: string;
  deleted_at: string; purge_after: string;
};

const ENTITY_LABEL: Record<string, string> = {
  invoice: "Invoice", customer: "Customer", vendor: "Vendor",
  transaction: "Transaction", note: "Note", file: "File",
};

const daysLeft = (purgeAfter: string) =>
  Math.max(0, Math.ceil((new Date(purgeAfter).getTime() - Date.now()) / 86400000));

export default function TrashPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    api.get<{ data: TrashRow[]; total: number }>("/api/trash?limit=100")
      .then((r) => { setRows(r.data); setTotal(r.total); })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the bin"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const restore = async (row: TrashRow) => {
    try {
      const r = await api.post<{ href: string; label: string }>(`/api/trash/${row.id}/restore`, {});
      toast.success(`${r.label} restored`, {
        action: r.href ? { label: "Open it", onClick: () => navigate(r.href) } : undefined,
      });
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't restore that"); }
  };

  const purge = async (targets: TrashRow[], clear?: () => void) => {
    if (!await confirm({
      title: targets.length === 1 ? `Permanently delete "${targets[0].label}"?` : `Permanently delete ${targets.length} records?`,
      body: "This is the one action here with no undo. The record and everything attached to it are gone for good.",
      danger: true,
      confirmLabel: "Delete forever",
      confirmText: targets.length > 1 ? "DELETE" : undefined,
    })) return;
    let ok = 0;
    for (const t of targets) { try { await api.delete(`/api/trash/${t.id}`); ok++; } catch { /* counted */ } }
    toast.success(`${ok} permanently deleted`);
    clear?.(); load();
  };

  const COLUMNS: Column<TrashRow>[] = [
    { key: "label", header: "What was deleted", locked: true,
      render: (r) => (
        <>
          <p className="font-medium truncate max-w-[280px]">{r.label || "(no name)"}</p>
          <p className="text-[10px] text-[var(--color-muted)]">{ENTITY_LABEL[r.entity] ?? r.entity}</p>
        </>
      ) },
    { key: "deleted_at", header: "Deleted",
      render: (r) => <span className="text-xs text-[var(--color-muted)]">{new Date(r.deleted_at).toLocaleString("en-IN")}</span> },
    { key: "purge_after", header: "Gone in", align: "right",
      render: (r) => {
        const d = daysLeft(r.purge_after);
        return <span className={`text-xs tabular-nums ${d <= 3 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{d} day{d === 1 ? "" : "s"}</span>;
      } },
    { key: "__actions", header: "", locked: true, sortable: false, align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="secondary" icon={<RotateCcw size={12} />} onClick={() => restore(r)}>Restore</Button>
          <button onClick={() => purge([r])} title="Delete forever" aria-label={`Permanently delete ${r.label}`}
            className="p-1.5 text-[var(--color-muted)] hover:text-red-400 hover:bg-red-900/10 rounded"><Trash2 size={13} /></button>
        </div>
      ) },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Trash</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Deleted records stay here for 30 days, with their line items and receipts intact. Restoring puts a record back exactly as it was.
        </p>
      </div>

      <DataTable<TrashRow>
        listKey="trash"
        exportName="trash"
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={load}
        pageSize={25}
        defaultSort={{ key: "deleted_at", order: "desc" }}
        searchPlaceholder="Find something you deleted…"
        bulkActions={(sel, clear) => (
          <>
            <Button size="sm" variant="secondary" icon={<RotateCcw size={12} />}
              onClick={async () => { for (const r of sel) await restore(r); clear(); }}>Restore</Button>
            <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => purge(sel, clear)}>Delete forever</Button>
          </>
        )}
        empty={
          <EmptyState
            icon={Trash2}
            title="Nothing in the bin"
            description={total === 0
              ? "When you delete an invoice, customer or transaction, it lands here for 30 days first — so a mis-click is never final."
              : "Everything here has been restored or permanently removed."}
          />
        }
      />
    </div>
  );
}
