import { useApp } from "@/context/AppContext";
import { isReadOnlyRole } from "@/data/roles";
import { Eye } from "lucide-react";

/**
 * Persistent affordance for read-only ROLES (e.g. viewer / board member). Without
 * it, edits just fail with a toast and the user can't tell why. Client-view
 * read-only (an advisor inspecting a client) is already surfaced by TenantSwitcher,
 * so this only covers the role case.
 */
export default function ReadOnlyBanner() {
  const { currentRole, isReadOnly } = useApp();
  if (isReadOnly) return null;                 // client-view → TenantSwitcher owns the message
  if (!isReadOnlyRole(currentRole)) return null;
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-500/30 bg-slate-600/15 px-4 py-1.5 text-[11px] text-slate-300 backdrop-blur">
      <Eye size={12} className="shrink-0" />
      <span>You have <strong>read-only</strong> access — explore everything, but changes are disabled. Ask a workspace owner for edit rights.</span>
    </div>
  );
}
