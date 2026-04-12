/**
 * Forecast feature — raw API call wrappers.
 *
 * React Query hooks (useForecast, useScenarios, …) live in hooks/.
 * This module contains the plain async functions that make the HTTP calls,
 * so they can be used in server components or tested independently.
 */

import { apiFetch } from "@/lib/query";
import {
  ForecastSchema,
  ScenarioSchema,
  ScenarioCompareSchema,
  type ScenarioCreate,
} from "@/lib/schemas";
import { z } from "zod";

const BASE = "/api";

export async function fetchForecast(tenantId: string) {
  return apiFetch(`${BASE}/forecast?tenant_id=${tenantId}`, ForecastSchema);
}

export async function triggerForecast(tenantId: string) {
  return apiFetch(`${BASE}/forecast/trigger`, undefined, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tenantId }),
  });
}

export async function fetchScenarios(tenantId: string) {
  return apiFetch(`${BASE}/scenarios?tenant_id=${tenantId}`, z.array(ScenarioSchema));
}

export async function createScenario(tenantId: string, data: ScenarioCreate) {
  return apiFetch(`${BASE}/scenarios`, ScenarioSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tenantId, ...data }),
  });
}

export async function fetchScenarioCompare(tenantId: string, scenarioId: string) {
  return apiFetch(
    `${BASE}/scenarios/${scenarioId}/compare?tenant_id=${tenantId}`,
    ScenarioCompareSchema
  );
}
