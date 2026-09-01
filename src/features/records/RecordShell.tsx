import { type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import Button from "@/components/ui/Button";
import { ActivityTimeline, CommentThread, FollowButton } from "@/components/ui/RecordPanel";

/**
 * The frame every record detail page uses.
 *
 * Before this there were no detail pages at all — all ~75 routes were hub pages, so no
 * invoice, customer or vendor had a URL you could send to a colleague. This gives each
 * one a stable shape: breadcrumb back to the list, a copyable permalink, who created it
 * and when, a Watch button, and the conversation + history rail that the audit_log has
 * been feeding for months with nowhere to show it.
 */
export default function RecordShell({
  entity, entityId, backTo, backLabel, title, subtitle, badges, actions, children, meta,
}: {
  entity: string;
  entityId: string;
  backTo: string;
  backLabel: string;
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** "Created by X on Y" — the provenance stamps records never carried. */
  meta?: { createdBy?: string | null; createdAt?: string | null; updatedAt?: string | null };
}) {
  const navigate = useNavigate();

  const copyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: "Anyone in your firm with access can open it." });
    } catch {
      // Clipboard is blocked in some in-app browsers; show the URL so it can still be copied.
      toast.info(url);
    }
  };

  const stamp = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-2 text-xs" data-no-print>
        <button onClick={() => navigate(backTo)} className="inline-flex items-center gap-1 text-[var(--color-muted)] hover:text-[var(--color-text)]">
          <ArrowLeft size={13} /> {backLabel}
        </button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold truncate">{title}</h1>
            {badges}
          </div>
          {subtitle && <div className="text-sm text-[var(--color-muted)] mt-1">{subtitle}</div>}
          {(meta?.createdAt || meta?.createdBy) && (
            <p className="text-[11px] text-[var(--color-muted)] mt-2">
              {meta.createdBy ? `Created by ${meta.createdBy}` : "Created"}
              {meta.createdAt ? ` · ${stamp(meta.createdAt)}` : ""}
              {meta.updatedAt && meta.updatedAt !== meta.createdAt ? ` · last changed ${stamp(meta.updatedAt)}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" data-no-print>
          <Button size="sm" variant="ghost" icon={<Link2 size={13} />} onClick={copyLink} title="Copy a link to this record">Copy link</Button>
          <FollowButton entity={entity} entityId={entityId} />
          {actions}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">{children}</div>
        <aside className="space-y-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5" data-no-print>
          <CommentThread entity={entity} entityId={entityId} />
          <div className="h-px bg-[var(--color-border)]" />
          <ActivityTimeline entity={entity} entityId={entityId} />
        </aside>
      </div>
    </div>
  );
}

/** Small labelled value — the building block of every detail summary card. */
export function Detail({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">{label}</p>
      <p className={`text-sm mt-0.5 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</p>
    </div>
  );
}

/** Copy-to-clipboard for identifiers (GSTIN, invoice number, UTR). */
export function CopyValue({ value }: { value: string }) {
  return (
    <button type="button"
      onClick={() => { navigator.clipboard?.writeText(value).then(() => toast.success("Copied")).catch(() => {}); }}
      className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]" title="Copy">
      {value} <Copy size={10} className="opacity-50" />
    </button>
  );
}

export { Link };
