import { toast } from "sonner";
import { api } from "./api";

/**
 * Delete-with-undo. Every delete in the product used to be final: a confirm() and then a
 * hard DELETE. The backend now archives the row for 30 days (lib/trash.js) and returns a
 * `trashId`, so the only thing missing at the UI layer was the offer to put it back.
 *
 *   await deleteWithUndo({
 *     label: `Invoice ${inv.invoice_number}`,
 *     remove:  () => api.delete<TrashResult>(`/api/invoices/${inv.id}`),
 *     onDone:  reload,
 *   });
 *
 * The list is refreshed immediately (the row really is gone) and refreshed again if the
 * user takes the undo, so what's on screen always matches the server.
 */
export type TrashResult = { ok?: boolean; trashId?: string; label?: string };

export async function deleteWithUndo({
  label, remove, onDone, onRestore, undoSeconds = 10,
}: {
  label: string;
  remove: () => Promise<TrashResult>;
  onDone?: () => void | Promise<void>;
  /**
   * What to do once the record is back. Defaults to onDone, which is right for a LIST
   * (refetch). A detail page must pass this: its onDone navigates away, and calling that
   * again after the restore just re-navigates to a list that never refetches — the record
   * comes back on the server and the user never sees it.
   */
  onRestore?: (restored: { href?: string }) => void | Promise<void>;
  undoSeconds?: number;
}): Promise<boolean> {
  let result: TrashResult;
  try {
    result = await remove();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : `Couldn't delete ${label}`);
    return false;
  }
  await onDone?.();

  if (!result?.trashId) {
    // Endpoint hasn't adopted the trash yet — be honest rather than promise an undo we
    // cannot deliver.
    toast.success(`${label} deleted`);
    return true;
  }

  toast.success(`${label} deleted`, {
    duration: undoSeconds * 1000,
    description: "It's in Trash for 30 days.",
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          const back = await api.post<{ href?: string }>(`/api/trash/${result.trashId}/restore`, {});
          toast.success(`${label} restored`);
          if (onRestore) await onRestore(back ?? {});
          else await onDone?.();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't restore it");
        }
      },
    },
  });
  return true;
}
