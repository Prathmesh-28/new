import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { MessageSquare, Loader2 } from "lucide-react";
import { humanizeAiError } from "@/components/ai/aiError";

/**
 * "Discuss" — the Headroom Collab wedge: a conversation that lives next to the work
 * it's about. Opens the conversation already linked to this financial object (invoice,
 * client, deal, reconciliation, gst filing), or creates one linked to it, then jumps to
 * Messages. Drop it on any financial-object row/detail.
 */
export default function DiscussButton({ entityType, entityId, entityLabel, className }: {
  entityType: "invoice" | "client" | "deal" | "reconciliation" | "gst_filing";
  entityId: string;
  entityLabel?: string;
  className?: string;
}) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const { conversations } = await api.get<{ conversations: { id: string }[] }>(
        `/api/collab/entity-conversations?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(entityId)}`
      );
      let convId = conversations[0]?.id;
      if (!convId) {
        const pretty = entityType.charAt(0).toUpperCase() + entityType.slice(1);
        const conv = await api.post<{ id: string }>("/api/collab/conversations", { type: "group", name: `${pretty} ${entityLabel || entityId}` });
        await api.post(`/api/collab/conversations/${conv.id}/links`, { entityType, entityId });
        convId = conv.id;
      }
      nav(`/collab?c=${convId}`);
    } catch (e) { toast.error(humanizeAiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <button
      onClick={(e) => { e.stopPropagation(); void go(); }}
      disabled={busy}
      title="Discuss with your team"
      className={className || "flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/50 px-2.5 py-1.5 rounded-lg shrink-0 disabled:opacity-40 transition-colors"}
    >
      {busy ? <Loader2 size={11} className="animate-spin" /> : <MessageSquare size={11} />} Discuss
    </button>
  );
}
