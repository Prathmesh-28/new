import { apiFetch } from "@/lib/query";
import { AlertSchema } from "@/lib/schemas";
import { z } from "zod";

const BASE = "/api";

export async function fetchAlerts(tenantId: string, unreadOnly = false) {
  const url = `${BASE}/alerts?tenant_id=${tenantId}${unreadOnly ? "&unread=true" : ""}`;
  return apiFetch(url, z.array(AlertSchema));
}

export async function markAlertRead(tenantId: string, alertId: string) {
  return apiFetch(`${BASE}/alerts/${alertId}/read`, undefined, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tenantId }),
  });
}

export async function markAllAlertsRead(tenantId: string) {
  return apiFetch(`${BASE}/alerts/read-all`, undefined, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tenantId }),
  });
}
