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
import { useAppStore } from "./store";

// ---------------------------------------------------------------------------
// QueryClient singleton (used in providers.tsx)
// ---------------------------------------------------------------------------

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
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
// Base fetch helper — calls Django directly with JWT from Zustand store
// ---------------------------------------------------------------------------

export const DJANGO_URL =
  process.env.NEXT_PUBLIC_DJANGO_API_URL ?? "http://13.54.2.137:8000";

export async function apiFetch<T>(
  path: string,
  schema?: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${DJANGO_URL}${path}`;
  const token = useAppStore.getState().token;

  const { headers: extraHeaders, ...restInit } = init ?? {};
  const res = await fetch(url, {
    ...restInit,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(extraHeaders as Record<string, string> ?? {}),
    },
  });

  if (res.status === 401) {
    useAppStore.getState().clearAuth();
    if (typeof window !== "undefined") window.location.href = "/admin/login/";
    throw new Error("Session expired");
  }

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
        `/organisations/${tenantId}/forecast`,
        ForecastSchema,
      ),
    enabled: !!tenantId,
  });
}

export function useTriggerForecast(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/organisations/${tenantId}/forecast/trigger`, undefined, { method: "POST" }),
    onSuccess: () => {
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
      apiFetch<Scenario[]>(`/organisations/${tenantId}/forecast/scenarios`),
    enabled: !!tenantId,
  });
}

export function useCreateScenario(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ScenarioCreate) =>
      apiFetch<Scenario>(`/organisations/${tenantId}/forecast/scenarios`, undefined, {
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
      }>(`/organisations/${tenantId}/forecast/scenarios/${scenarioId}/compare`),
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
        z.array(AlertSchema),
      ),
    enabled: !!tenantId,
    refetchInterval: 60 * 1000,
  });
}

export function useMarkAlertRead(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) =>
      apiFetch(`/alerts/${tenantId}/${alertId}/read`, undefined, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts", tenantId] });
    },
  });
}

export function useMarkAllAlertsRead(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/alerts/${tenantId}/read-all`, undefined, { method: "PATCH" }),
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
        undefined,
        {
          method: "POST",
          body: JSON.stringify({ tenant_id: tenantId, ...data }),
        },
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
      apiFetch<{ data: BankConnection[] }>(
        `/organisations/${tenantId}/accounts`,
      ).then((r) => r.data),
    enabled: !!tenantId,
  });
}
