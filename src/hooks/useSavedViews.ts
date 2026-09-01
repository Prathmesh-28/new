import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

/**
 * Saved list views — "My overdue > 1L", "This month's Delhi sales".
 *
 * Re-applying the same four filters every morning was, per the audit, the single most
 * obviously-missing thing in a list-heavy product. A view stores the whole query
 * (filters + sort + search), can be shared with the firm, and one can be the default
 * that applies when the list opens.
 */
export type SavedView = {
  id: string;
  list_key: string;
  name: string;
  config: Record<string, string | number | null>;
  shared: boolean;
  is_default: boolean;
  is_mine: boolean;
};

export function useSavedViews(listKey: string) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    return api.get<SavedView[]>(`/api/prefs/views?listKey=${encodeURIComponent(listKey)}`)
      .then(setViews)
      .catch(() => setViews([]))
      .finally(() => setLoading(false));
  }, [listKey]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (name: string, config: SavedView["config"], opts?: { shared?: boolean; isDefault?: boolean }) => {
    try {
      const v = await api.post<SavedView>("/api/prefs/views", { listKey, name, config, ...opts });
      await load();
      toast.success(`Saved view "${v.name}"`);
      return v;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that view");
      return null;
    }
  }, [listKey, load]);

  const update = useCallback(async (id: string, patch: Partial<Pick<SavedView, "name" | "config" | "shared">> & { isDefault?: boolean }) => {
    try { await api.patch(`/api/prefs/views/${id}`, patch); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update that view"); }
  }, [load]);

  const remove = useCallback(async (id: string) => {
    try { await api.delete(`/api/prefs/views/${id}`); await load(); toast.success("View deleted"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete that view"); }
  }, [load]);

  return { views, loading, save, update, remove, reload: load, defaultView: views.find((v) => v.is_default) ?? null };
}

export default useSavedViews;
