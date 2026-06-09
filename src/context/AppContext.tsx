import {
  createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode,
} from "react";
import type { AppStore, UserRole, RoleConfig } from "@/data/types";
import { FIELD_NAMESPACE, ROLE_NAMESPACES } from "@/data/types";
import { defaultConfig } from "@/data/defaultConfig";
import { api } from "@/lib/api";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";

const LS_KEY = "hr_store";
const DEBOUNCE = 400;
const POLL_MS  = 5000;

type SetStore = (fn: (s: AppStore) => AppStore) => void;

interface AppCtx {
  store: AppStore;
  loading: boolean;
  currentRole: UserRole;
  setCurrentRole: (r: UserRole) => void;
  canAccess: (tab: string) => boolean;
  canExport: () => boolean;
  setStore: SetStore;
  // CRUD helpers
  addBankAccount:         (x: AppStore["bankAccounts"][0])       => void;
  updateBankAccount:      (x: AppStore["bankAccounts"][0])       => void;
  deleteBankAccount:      (id: string)                           => void;
  addTransaction:         (x: AppStore["transactions"][0])       => void;
  updateTransaction:      (x: AppStore["transactions"][0])       => void;
  deleteTransaction:      (id: string)                           => void;
  addAlert:               (x: AppStore["alerts"][0])             => void;
  markAlertRead:          (id: string)                           => void;
  deleteAlert:            (id: string)                           => void;
  addScenario:            (x: AppStore["scenarios"][0])          => void;
  updateScenario:         (x: AppStore["scenarios"][0])          => void;
  deleteScenario:         (id: string)                           => void;
  addObligation:          (x: AppStore["obligations"][0])        => void;
  updateObligation:       (x: AppStore["obligations"][0])        => void;
  deleteObligation:       (id: string)                           => void;
  addCreditApplication:   (x: AppStore["creditApplications"][0]) => void;
  updateCreditApplication:(x: AppStore["creditApplications"][0]) => void;
  addCreditOffer:         (x: AppStore["creditOffers"][0])       => void;
  addCapitalRaise:        (x: AppStore["capitalRaises"][0])      => void;
  updateCapitalRaise:     (x: AppStore["capitalRaises"][0])      => void;
  addCapitalInvestment:   (x: AppStore["capitalInvestments"][0]) => void;
  // Connectors
  addConnector:           (x: AppStore["connectors"][0])         => void;
  updateConnector:        (x: AppStore["connectors"][0])         => void;
  deleteConnector:        (id: string)                           => void;
  // Operations — Orders
  addOrder:               (x: AppStore["orders"][0])             => void;
  updateOrder:            (x: AppStore["orders"][0])             => void;
  deleteOrder:            (id: string)                           => void;
  // Operations — Inventory
  addInventoryItem:       (x: AppStore["inventory"][0])          => void;
  updateInventoryItem:    (x: AppStore["inventory"][0])          => void;
  deleteInventoryItem:    (id: string)                           => void;
  // Operations — Procurement
  addProcurement:         (x: AppStore["procurement"][0])        => void;
  updateProcurement:      (x: AppStore["procurement"][0])        => void;
  deleteProcurement:      (id: string)                           => void;
}

const Ctx = createContext<AppCtx | null>(null);

function splitByNs(store: AppStore): Record<string, Partial<AppStore>> {
  const out: Record<string, Partial<AppStore>> = {};
  for (const [field, ns] of Object.entries(FIELD_NAMESPACE)) {
    if (!out[ns]) out[ns] = {};
    (out[ns] as unknown as Record<string, unknown>)[field] = (store as unknown as Record<string, unknown>)[field];
  }
  return out;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = (user?.role ?? "owner") as UserRole;
  const [currentRole, setCurrentRole] = useState<UserRole>(role);
  const [store, _setStore]   = useState<AppStore>(() => {
    try { return { ...defaultConfig, ...JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") }; }
    catch { return defaultConfig; }
  });
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const persist = useCallback(async (s: AppStore) => {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    const namespaces = ROLE_NAMESPACES[currentRole] ?? [];
    const split = splitByNs(s);
    const results = await Promise.allSettled(
      namespaces.map(ns => api.put(`/api/kv/${ns}/store`, { value: split[ns] ?? {} }))
    );
    if (results.some(r => r.status === "rejected")) {
      toast.error("Changes saved locally but failed to sync to server.", { id: "sync-error", duration: 4000 });
    }
  }, [currentRole]);

  const setStore: SetStore = useCallback((fn) => {
    _setStore(prev => {
      const next = fn(prev);
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => persist(next), DEBOUNCE);
      return next;
    });
  }, [persist]);

  // Initial load from server
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const namespaces = ROLE_NAMESPACES[currentRole] ?? [];
    Promise.allSettled(namespaces.map(ns => api.get<Record<string, unknown>>(`/api/kv/${ns}/store`)))
      .then(results => {
        const merged: Record<string, unknown> = {};
        results.forEach(r => { if (r.status === "fulfilled" && r.value) Object.assign(merged, r.value); });
        if (Object.keys(merged).length) {
          _setStore(prev => ({ ...prev, ...merged }));
          localStorage.setItem(LS_KEY, JSON.stringify({ ...store, ...merged }));
        }
      })
      .catch(() => {
        toast.error("Failed to load your data. Working offline — changes will sync when reconnected.");
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentRole]);

  // Poll
  useEffect(() => {
    if (!user) return;
    pollRef.current = setInterval(async () => {
      const namespaces = ROLE_NAMESPACES[currentRole] ?? [];
      const results = await Promise.allSettled(
        namespaces.map(ns => api.get<Record<string, unknown>>(`/api/kv/${ns}/store`))
      );
      const merged: Record<string, unknown> = {};
      results.forEach(r => { if (r.status === "fulfilled" && r.value) Object.assign(merged, r.value); });
      if (Object.keys(merged).length) _setStore(prev => ({ ...prev, ...merged }));
    }, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, currentRole]);

  const canAccess = (tab: string) => {
    if (currentRole === "super_admin") return true;
    const rc: RoleConfig | undefined = store.roles.find(r => r.id === currentRole);
    return rc?.accessibleTabs.includes(tab) ?? false;
  };

  const canExport = () => {
    if (currentRole === "super_admin") return true;
    return store.roles.find(r => r.id === currentRole)?.canExport ?? false;
  };

  // ── CRUD factories ────────────────────────────────────────────────────────
  const add    = <K extends keyof AppStore>(key: K) => (x: AppStore[K] extends (infer I)[] ? I : never) =>
    setStore(s => ({ ...s, [key]: [...(s[key] as unknown[]), x] } as AppStore));
  const update = <K extends keyof AppStore>(key: K) => (x: AppStore[K] extends (infer I)[] ? I : never) =>
    setStore(s => ({ ...s, [key]: (s[key] as { id: string }[]).map(i => i.id === (x as { id: string }).id ? x : i) } as AppStore));
  const del    = <K extends keyof AppStore>(key: K) => (id: string) =>
    setStore(s => ({ ...s, [key]: (s[key] as { id: string }[]).filter(i => i.id !== id) } as AppStore));

  const value: AppCtx = {
    store, loading, currentRole, setCurrentRole, canAccess, canExport, setStore,
    addBankAccount:          add("bankAccounts"),
    updateBankAccount:       update("bankAccounts"),
    deleteBankAccount:       del("bankAccounts"),
    addTransaction:          add("transactions"),
    updateTransaction:       update("transactions"),
    deleteTransaction:       del("transactions"),
    addAlert:                add("alerts"),
    markAlertRead:           (id) => setStore(s => ({ ...s, alerts: s.alerts.map(a => a.id === id ? { ...a, isRead: true } : a) })),
    deleteAlert:             del("alerts"),
    addScenario:             add("scenarios"),
    updateScenario:          update("scenarios"),
    deleteScenario:          del("scenarios"),
    addObligation:           add("obligations"),
    updateObligation:        update("obligations"),
    deleteObligation:        del("obligations"),
    addCreditApplication:    add("creditApplications"),
    updateCreditApplication: update("creditApplications"),
    addCreditOffer:          add("creditOffers"),
    addCapitalRaise:         add("capitalRaises"),
    updateCapitalRaise:      update("capitalRaises"),
    addCapitalInvestment:    add("capitalInvestments"),
    addConnector:            add("connectors"),
    updateConnector:         update("connectors"),
    deleteConnector:         del("connectors"),
    addOrder:                add("orders"),
    updateOrder:             update("orders"),
    deleteOrder:             del("orders"),
    addInventoryItem:        add("inventory"),
    updateInventoryItem:     update("inventory"),
    deleteInventoryItem:     del("inventory"),
    addProcurement:          add("procurement"),
    updateProcurement:       update("procurement"),
    deleteProcurement:       del("procurement"),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
