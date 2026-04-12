/**
 * Zustand global store — UI state only.
 * Server/async state lives in React Query.
 *
 * Slices:
 *   auth      — current user session
 *   ui        — sidebar, active view, modals
 *   forecast  — client-side scenario builder state
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionUser, Tenant, ScenarioCreate } from "./schemas";

// ---------------------------------------------------------------------------
// Auth slice
// ---------------------------------------------------------------------------

interface AuthSlice {
  user: SessionUser | null;
  tenant: Tenant | null;
  setUser: (user: SessionUser | null) => void;
  setTenant: (tenant: Tenant | null) => void;
  clearAuth: () => void;
}

// ---------------------------------------------------------------------------
// UI slice
// ---------------------------------------------------------------------------

type DashboardView =
  | "overview"
  | "forecast"
  | "credit"
  | "capital"
  | "alerts"
  | "settings";

interface UISlice {
  activeView: DashboardView;
  sidebarOpen: boolean;
  setActiveView: (view: DashboardView) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Forecast / scenario builder slice
// ---------------------------------------------------------------------------

interface ScenarioBuilderState {
  pendingScenario: Partial<ScenarioCreate> | null;
  scenarioModalOpen: boolean;
  compareScenarioId: string | null;
}

interface ForecastSlice extends ScenarioBuilderState {
  openScenarioModal: (prefill?: Partial<ScenarioCreate>) => void;
  closeScenarioModal: () => void;
  setCompareScenario: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Combined store
// ---------------------------------------------------------------------------

type AppStore = AuthSlice & UISlice & ForecastSlice;

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      // ── Auth ──────────────────────────────────────────────────────────
      user: null,
      tenant: null,
      setUser: (user) => set({ user }),
      setTenant: (tenant) => set({ tenant }),
      clearAuth: () => set({ user: null, tenant: null }),

      // ── UI ────────────────────────────────────────────────────────────
      activeView: "overview",
      sidebarOpen: true,
      setActiveView: (activeView) => set({ activeView }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

      // ── Forecast ──────────────────────────────────────────────────────
      pendingScenario: null,
      scenarioModalOpen: false,
      compareScenarioId: null,
      openScenarioModal: (prefill) =>
        set({ scenarioModalOpen: true, pendingScenario: prefill ?? null }),
      closeScenarioModal: () =>
        set({ scenarioModalOpen: false, pendingScenario: null }),
      setCompareScenario: (compareScenarioId) => set({ compareScenarioId }),
    }),
    {
      name: "headroom-app",
      // Only persist non-sensitive UI preferences, not auth (handled by server cookie)
      partialize: (s) => ({
        activeView: s.activeView,
        sidebarOpen: s.sidebarOpen,
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// Selectors (memoised via shallow comparison in components)
// ---------------------------------------------------------------------------

export const selectUser = (s: AppStore) => s.user;
export const selectTenant = (s: AppStore) => s.tenant;
export const selectTenantId = (s: AppStore) => s.user?.tenant_id ?? null;
export const selectActiveView = (s: AppStore) => s.activeView;
export const selectSidebarOpen = (s: AppStore) => s.sidebarOpen;
export const selectScenarioModal = (s: AppStore) => ({
  open: s.scenarioModalOpen,
  pending: s.pendingScenario,
  openModal: s.openScenarioModal,
  closeModal: s.closeScenarioModal,
});
