import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkPlus, Check, Share2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSavedViews, type SavedView } from "@/hooks/useSavedViews";
import Modal from "./Modal";
import Button from "./Button";
import { TextField } from "./Field";

/**
 * Saved views — the toolbar control for the machinery that shipped in Wave 1.
 *
 * The backend (/api/prefs/views) and the hook have existed since then; this is the missing
 * UI: name the filter/sort/search you're looking at, get it back tomorrow with one click,
 * share it with the firm, make it your default for this list. Re-applying the same four
 * filters every morning was the single most obviously missing thing in a list-heavy
 * product.
 *
 * The component doesn't know what a "view" contains — the page supplies `currentConfig()`
 * (typically the URL query params) and `onApply(config)` — so it works for any list.
 */
export default function SavedViewsMenu({
  listKey, currentConfig, onApply, isFiltered,
}: {
  listKey: string;
  /** Snapshot of the current list state (filters + sort + q), stored verbatim. */
  currentConfig: () => Record<string, string | number | null>;
  onApply: (config: Record<string, string | number | null>) => void;
  /** Whether there is anything worth saving right now. */
  isFiltered: boolean;
}) {
  const { views, save, update, remove, defaultView } = useSavedViews(listKey);
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const appliedDefault = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  // The default view applies on first open of the list — but never when the user arrived
  // with an explicit query in the URL (a shared link must show what was shared).
  useEffect(() => {
    if (appliedDefault.current || !defaultView) return;
    appliedDefault.current = true;
    if (!isFiltered) onApply(defaultView.config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultView]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const doSave = async () => {
    setBusy(true);
    const v = await save(name.trim(), currentConfig(), { shared });
    setBusy(false);
    if (v) { setSaveOpen(false); setName(""); setShared(false); }
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="true" aria-expanded={open}
        title="Saved views"
        className={`p-2 rounded-lg border text-[var(--color-muted)] hover:text-[var(--color-text)] ${views.length ? "border-[var(--color-primary)]/40" : "border-[var(--color-border)]"}`}>
        <Bookmark size={14} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-1 z-30 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl p-1.5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] px-2 py-1.5">Saved views</p>
          {views.length === 0 && (
            <p className="px-2 py-2 text-xs text-[var(--color-muted)]">
              Nothing saved for this list yet. Set up the filters you use every day, then save them here.
            </p>
          )}
          {views.map((v: SavedView) => (
            <div key={v.id} className="group flex items-center gap-1 rounded hover:bg-[var(--color-accent)]">
              <button type="button" onClick={() => { onApply(v.config); setOpen(false); }}
                className="flex-1 text-left px-2 py-1.5 text-xs truncate">
                {v.name}
                {v.shared && <Share2 size={9} className="inline ml-1.5 text-[var(--color-muted)]" aria-label="Shared with the firm" />}
              </button>
              {v.is_mine && (
                <>
                  <button type="button" title={v.is_default ? "Your default for this list" : "Make this your default"}
                    aria-label={v.is_default ? `${v.name} is your default view` : `Make ${v.name} your default view`}
                    onClick={() => update(v.id, { isDefault: !v.is_default })}
                    className={`p-1 ${v.is_default ? "text-amber-400" : "text-[var(--color-muted)] opacity-0 group-hover:opacity-100"}`}>
                    <Star size={11} fill={v.is_default ? "currentColor" : "none"} />
                  </button>
                  <button type="button" title="Delete this view" aria-label={`Delete the view ${v.name}`}
                    onClick={() => remove(v.id)}
                    className="p-1 text-[var(--color-muted)] opacity-0 group-hover:opacity-100 hover:text-red-400">
                    <Trash2 size={11} />
                  </button>
                </>
              )}
            </div>
          ))}
          <div className="border-t border-[var(--color-border)] mt-1 pt-1">
            <button type="button"
              onClick={() => { if (!isFiltered) { toast.info("Filter or sort the list first — then save that as a view."); return; } setSaveOpen(true); setOpen(false); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left text-[var(--color-primary)] hover:bg-[var(--color-accent)]">
              <BookmarkPlus size={12} /> Save the current view…
            </button>
          </div>
        </div>
      )}

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save this view" size="sm"
        description="The filters, search and sort you're looking at, back with one click."
        footer={<>
          <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} icon={<Check size={13} />} onClick={doSave}>Save view</Button>
        </>}>
        <div className="space-y-3">
          <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)}
            placeholder='e.g. "Overdue over ₹1L"' autoFocus />
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <input type="checkbox" className="accent-[var(--color-primary)]" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            Share with everyone in the firm (they can use it, only you can change it)
          </label>
        </div>
      </Modal>
    </div>
  );
}
