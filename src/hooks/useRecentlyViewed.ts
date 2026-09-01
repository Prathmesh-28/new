import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * "What was I just looking at?" — the product forgot every record the moment you left it.
 * Recorded server-side so it follows the user across devices, and surfaced in the command
 * palette so ⌘K opens with the things they actually touch.
 */
export type RecentRecord = { entity: string; entity_id: string; label: string; href: string; viewed_at: string };

/** Call from a record detail page. Cheap, fire-and-forget, deduped per record. */
export function useTrackView(rec: { entity: string; id?: string | null; label?: string; href?: string } | null) {
  useEffect(() => {
    if (!rec?.id || !rec.entity) return;
    const t = window.setTimeout(() => {
      api.post("/api/records/recent", { entity: rec.entity, id: rec.id, label: rec.label ?? "", href: rec.href ?? "" })
        .catch(() => { /* a missed breadcrumb must never surface as an error */ });
    }, 1200); // only count it as "viewed" if they actually stayed
    return () => window.clearTimeout(t);
  }, [rec?.entity, rec?.id, rec?.label, rec?.href]);
}

export function useRecentlyViewed(limit = 12) {
  const [items, setItems] = useState<RecentRecord[]>([]);
  const load = useCallback(() => {
    api.get<RecentRecord[]>(`/api/records/recent?limit=${limit}`).then(setItems).catch(() => setItems([]));
  }, [limit]);
  useEffect(() => { load(); }, [load]);
  return { items, reload: load };
}
