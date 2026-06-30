import { useApp } from "@/context/AppContext";
import { Check, RefreshCw, CloudOff } from "lucide-react";

// C8 - make cross-device sync visible. Reads the live syncStatus from AppContext
// (saved / saving / error) so users trust their data carried over.
export default function SyncIndicator() {
  const { syncStatus } = useApp();
  const map = {
    saved:  { Icon: Check,     text: "Saved",   cls: "text-green-400", spin: false },
    saving: { Icon: RefreshCw, text: "Saving…", cls: "text-[var(--color-muted)]", spin: true },
    error:  { Icon: CloudOff,  text: "Offline", cls: "text-red-400", spin: false },
  } as const;
  const s = map[syncStatus];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium ${s.cls}`}
      title={syncStatus === "error" ? "Saved on this device - will sync when back online" : "Your changes sync automatically across your devices"}
    >
      <s.Icon size={11} className={s.spin ? "animate-spin" : ""} /> {s.text}
    </span>
  );
}
