/**
 * React Query — client config + all API query / mutation hooks.
 *
 * Keys follow the pattern:  [resource, ...identifiers]
 * e.g. ["forecast", tenantId]  ["alerts", tenantId, "unread"]
 */

import {
  QueryClient,
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import {
  ForecastSchema,
  type Forecast,
  type ScenarioCreate,
  type Scenario,
  AlertSchema,
  type Alert,
  type CreditApplication,
  type CreditOffer,
  type CreditSubmit,
  type BankConnection,
} from "./schemas";
import { z } from "zod";

// ---------------------------------------------------------------------------
// QueryClient singleton (used in providers.tsx)
// ---------------------------------------------------------------------------

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,          // 1 minute — matches Redis TTL logic
      gcTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

// ---------------------------------------------------------------------------
// Base fetch helper
// ---------------------------------------------------------------------------

const BASE = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "/api";

export async function apiFetch<T>(
  path: string,
  schema?: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }

  const json = await res.json();
  return schema ? schema.parse(json) : (json as T);
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const keys = {
  forecast: (tenantId: string) => ["forecast", tenantId] as const,
  scenarios: (tenantId: string) => ["scenarios", tenantId] as const,
  scenarioCompare: (tenantId: string, scenarioId: string) =>
    ["scenario-compare", tenantId, scenarioId] as const,
  alerts: (tenantId: string, unreadOnly?: boolean) =>
    ["alerts", tenantId, unreadOnly ? "unread" : "all"] as const,
  creditApplications: (tenantId: string) =>
    ["credit-applications", tenantId] as const,
  creditOffers: (applicationId: string) =>
    ["credit-offers", applicationId] as const,
  bankConnections: (tenantId: string) =>
    ["bank-connections", tenantId] as const,
};

// ---------------------------------------------------------------------------
// Forecast hooks
// ---------------------------------------------------------------------------

export function useForecast(tenantId: string | null) {
  return useQuery({
    queryKey: keys.forecast(tenantId ?? ""),
    queryFn: () =>
      apiFetch<Forecast>(
        `/forecast/${tenantId}`,
        undefined,
        ForecastSchema
      ),
    enabled: !!tenantId,
  });
}

export function useTriggerForecast(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/forecast/${tenantId}/trigger`, { method: "POST" }),
    onSuccess: () => {
      // Invalidate after a short delay to allow background job to start
      setTimeout(() => qc.invalidateQueries({ queryKey: keys.forecast(tenantId) }), 3000);
    },
  });
}

// ---------------------------------------------------------------------------
// Scenario hooks
// ---------------------------------------------------------------------------

export function useScenarios(tenantId: string | null) {
  return useQuery({
    queryKey: keys.scenarios(tenantId ?? ""),
    queryFn: () =>
      apiFetch<Scenario[]>(`/forecast/${tenantId}/scenarios`),
    enabled: !!tenantId,
  });
}

export function useCreateScenario(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ScenarioCreate) =>
      apiFetch<Scenario>(`/forecast/${tenantId}/scenarios`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.scenarios(tenantId) });
      qc.invalidateQueries({ queryKey: keys.forecast(tenantId) });
    },
  });
}

export function useScenarioCompare(
  tenantId: string | null,
  scenarioId: string | null
) {
  return useQuery({
    queryKey: keys.scenarioCompare(tenantId ?? "", scenarioId ?? ""),
    queryFn: () =>
      apiFetch<{
        comparison: Array<{ date: string; base: number; scenario: number; delta: number }>;
        scenario_name: string;
      }>(`/forecast/${tenantId}/scenarios/${scenarioId}/compare`),
    enabled: !!tenantId && !!scenarioId,
    staleTime: 2 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Alert hooks
// ---------------------------------------------------------------------------

export function useAlerts(tenantId: string | null, unreadOnly = false) {
  return useQuery({
    queryKey: keys.alerts(tenantId ?? "", unreadOnly),
    queryFn: () =>
      apiFetch<Alert[]>(
        `/alerts/${tenantId}?unread_only=${unreadOnly}&limit=50`,
        undefined,
        z.array(AlertSchema)
      ),
    enabled: !!tenantId,
    refetchInterval: 60 * 1000,   // poll every minute for new alerts
  });
}

export function useMarkAlertRead(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) =>
      apiFetch(`/alerts/${tenantId}/${alertId}/read`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts", tenantId] });
    },
  });
}

export function useMarkAllAlertsRead(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/alerts/${tenantId}/read-all`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts", tenantId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Credit hooks
// ---------------------------------------------------------------------------

export function useCreditApplications(tenantId: string | null) {
  return useQuery({
    queryKey: keys.creditApplications(tenantId ?? ""),
    queryFn: () =>
      apiFetch<CreditApplication[]>(`/credit/applications?tenant_id=${tenantId}`),
    enabled: !!tenantId,
  });
}

export function useSubmitCreditApplication(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      data,
    }: {
      applicationId: string;
      data: CreditSubmit;
    }) =>
      apiFetch<{ offers: CreditOffer[]; underwriting_score: number }>(
        `/credit/applications/${applicationId}/submit`,
        {
          method: "POST",
          body: JSON.stringify({ tenant_id: tenantId, ...data }),
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.creditApplications(tenantId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Bank connection hooks
// ---------------------------------------------------------------------------

export function useBankConnections(tenantId: string | null) {
  return useQuery({
    queryKey: keys.bankConnections(tenantId ?? ""),
    queryFn: () =>
      apiFetch<BankConnection[]>(
        `/connections?tenant_id=${tenantId}`
      ),
    enabled: !!tenantId,
  });
}
