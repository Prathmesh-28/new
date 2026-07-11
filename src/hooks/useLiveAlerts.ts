import { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import type { Alert } from "@/data/types";

// Real backend-raised alerts (overdue-invoice reminders, license/DSC expiry, flow
// triggers, team-invite reminders, treasury interest, winback nudges - anything
// created via backend/src/lib/alerts.js::raiseAlert) merged with the local KV
// `store.alerts` array. An audit found NOTHING client-side ever added real content
// to store.alerts (the `addAlert` action was dead code), so every notification
// surface reading it directly - the nav bell, dashboard unread count, the Alerts
// page itself - was blind to what the backend actually raised: mute/digest/
// escalation had nothing real to act on, and users never saw genuine alerts at all.
// This hook is the one shared source every surface should read instead.
type ServerAlertRow = { id: string; rule_id?: string; severity?: string; title?: string; message?: string; is_read?: boolean; is_resolved?: boolean; created_at?: string };

function rowToAlert(r: ServerAlertRow): Alert {
  return {
    id: r.id,
    type: r.rule_id || "general",
    severity: ((["critical", "high", "medium", "low"] as const).includes(r.severity as never) ? r.severity : "medium") as Alert["severity"],
    title: r.title || "",
    message: r.message || "",
    isRead: !!(r.is_read || r.is_resolved),
    createdAt: r.created_at || new Date().toISOString(),
  };
}

const POLL_MS = 20000;

export function useLiveAlerts(): Alert[] {
  const { store } = useApp();
  const [backendAlerts, setBackendAlerts] = useState<Alert[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ data?: ServerAlertRow[] }>("/api/alerts?limit=100");
      setBackendAlerts((r?.data ?? []).map(rowToAlert));
    } catch { /* offline - keep last-known, callers fall back to KV-only */ }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return useMemo(() => {
    const localIds = new Set(store.alerts.map((a) => a.id));
    const fromBackend = (backendAlerts ?? []).filter((a) => !localIds.has(a.id));
    return [...store.alerts, ...fromBackend];
  }, [store.alerts, backendAlerts]);
}
