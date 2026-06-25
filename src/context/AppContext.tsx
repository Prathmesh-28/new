import {
  createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode,
} from "react";
import type { AppStore, UserRole, RoleConfig } from "@/data/types";
import { FIELD_NAMESPACE, ROLE_NAMESPACES } from "@/data/types";
import { isReadOnlyRole } from "@/data/roles";
import { defaultConfig } from "@/data/defaultConfig";
import { api, clientId, setApiTenant } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";

const LS_KEY   = "hr_store";
const DEBOUNCE = 400;
const POLL_MS  = 5000;

const RO_MSG    = "You're viewing a client's data — exit client view to make changes.";
const VIEWER_MSG = "Your role has read-only access — ask a workspace owner for edit rights.";

type SetStore = (fn: (s: AppStore) => AppStore) => void;

interface AppCtx {
  store: AppStore;
  loading: boolean;
  currentRole: UserRole;
  setCurrentRole: (r: UserRole) => void;
  canAccess: (tab: string) => boolean;
  canExport: () => boolean;
  canEdit: () => boolean;
  setStore: SetStore;
  // Owner "view as" preview + per-role permission config
  previewRole: UserRole | null;
  setPreviewRole: (r: UserRole | null) => void;
  effectiveRole: UserRole;
  roleTabs: (roleId: UserRole) => string[];
  setRoleTabs: (roleId: UserRole, tabs: string[]) => void;
  resetRole: (roleId: UserRole) => void;
  // Client view (advisor feature)
  selectedClientTenantId: string | null;
  selectedClientLabel: string;
  setSelectedClient: (tenantId: string | null, label?: string) => void;
  isReadOnly: boolean;
  syncStatus: "saved" | "saving" | "error";
  // CRUD helpers
  addBankAccount:          (x: AppStore["bankAccounts"][0])        => void;
  updateBankAccount:       (x: AppStore["bankAccounts"][0])        => void;
  deleteBankAccount:       (id: string)                            => void;
  addTransaction:          (x: AppStore["transactions"][0])        => void;
  updateTransaction:       (x: AppStore["transactions"][0])        => void;
  deleteTransaction:       (id: string)                            => void;
  addAlert:                (x: AppStore["alerts"][0])              => void;
  markAlertRead:           (id: string)                            => void;
  deleteAlert:             (id: string)                            => void;
  addScenario:             (x: AppStore["scenarios"][0])           => void;
  updateScenario:          (x: AppStore["scenarios"][0])           => void;
  deleteScenario:          (id: string)                            => void;
  addObligation:           (x: AppStore["obligations"][0])         => void;
  updateObligation:        (x: AppStore["obligations"][0])         => void;
  deleteObligation:        (id: string)                            => void;
  addCreditApplication:    (x: AppStore["creditApplications"][0])  => void;
  updateCreditApplication: (x: AppStore["creditApplications"][0])  => void;
  addCreditOffer:          (x: AppStore["creditOffers"][0])        => void;
  addActiveLoan:           (x: AppStore["activeLoans"][0])         => void;
  updateActiveLoan:        (x: AppStore["activeLoans"][0])         => void;
  deleteActiveLoan:        (id: string)                            => void;
  updateFirm:              (f: Partial<AppStore["firm"]>)          => void;
  addCapitalRaise:         (x: AppStore["capitalRaises"][0])       => void;
  updateCapitalRaise:      (x: AppStore["capitalRaises"][0])       => void;
  addCapitalInvestment:    (x: AppStore["capitalInvestments"][0])  => void;
  // Connectors
  addConnector:            (x: AppStore["connectors"][0])          => void;
  updateConnector:         (x: AppStore["connectors"][0])          => void;
  deleteConnector:         (id: string)                            => void;
  // Operations — Orders
  addOrder:                (x: AppStore["orders"][0])              => void;
  updateOrder:             (x: AppStore["orders"][0])              => void;
  deleteOrder:             (id: string)                            => void;
  // Operations — Inventory
  addInventoryItem:        (x: AppStore["inventory"][0])           => void;
  updateInventoryItem:     (x: AppStore["inventory"][0])           => void;
  deleteInventoryItem:     (id: string)                            => void;
  // Operations — Procurement
  addProcurement:          (x: AppStore["procurement"][0])         => void;
  updateProcurement:       (x: AppStore["procurement"][0])         => void;
  deleteProcurement:       (id: string)                            => void;
  // Receivables
  addInvoice:              (x: AppStore["invoices"][0])            => void;
  updateInvoice:           (x: AppStore["invoices"][0])            => void;
  deleteInvoice:           (id: string)                            => void;
  // Fixed assets
  addFixedAsset:           (x: AppStore["fixedAssets"][0])         => void;
  updateFixedAsset:        (x: AppStore["fixedAssets"][0])         => void;
  deleteFixedAsset:        (id: string)                            => void;
  // Budgets
  addBudget:               (x: AppStore["budgets"][0])            => void;
  updateBudget:            (x: AppStore["budgets"][0])            => void;
  deleteBudget:            (id: string)                            => void;
  // Resolve an alert with the note the user typed (persisted to actionTaken).
  resolveAlert:            (id: string, note?: string)            => void;
}

const Ctx = createContext<AppCtx | null>(null);

function splitByNs(store: AppStore): Record<string, Partial<AppStore>> {
  const out: Record<string, Partial<AppStore>> = {};
  for (const [field, ns] of Object.entries(FIELD_NAMESPACE)) {
    if (!out[ns]) out[ns] = {};
    (out[ns] as unknown as Record<string, unknown>)[field] =
      (store as unknown as Record<string, unknown>)[field];
  }
  return out;
}

function kvUrl(ns: string, clientId: string | null): string {
  return clientId ? `/api/kv/${ns}/store?tenant_id=${encodeURIComponent(clientId)}` : `/api/kv/${ns}/store`;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = (user?.role ?? "owner") as UserRole;

  const [currentRole, setCurrentRole] = useState<UserRole>(role);
  // "View as" preview — owner/super_admin can render the app as another role sees
  // it. Purely presentational: it gates nav + canAccess but never changes which
  // data namespaces load/persist (those stay on the real role).
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);
  const effectiveRole: UserRole = previewRole ?? currentRole;
  // Ref mirror so the write-gate inside setStore never reads a stale role.
  const roleRef = useRef<UserRole>(role);
  useEffect(() => { roleRef.current = currentRole; }, [currentRole]);
  // Keep the acting role in sync with the authenticated user once it resolves. Without
  // this, a user whose auth loaded AFTER the provider's first render (so `role` was the
  // "owner" fallback) stays stuck on the wrong role — locking a super_admin out of
  // role-gated routes like /admin. ("View as" uses previewRole, so this never fights it.)
  useEffect(() => { if (user?.role) setCurrentRole(user.role); }, [user?.role]);
  const [store, _setStore] = useState<AppStore>(() => {
    try {
      const merged = { ...defaultConfig, ...JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") } as AppStore;
      // Safety: a stale/partial saved store can carry null or non-array fields, which
      // would crash .filter()/.map() on dashboard cards. Any field that's an array in
      // the defaults is coerced back to its default array.
      const def = defaultConfig as unknown as Record<string, unknown>;
      const m = merged as unknown as Record<string, unknown>;
      for (const k of Object.keys(def)) {
        if (Array.isArray(def[k]) && !Array.isArray(m[k])) m[k] = def[k];
      }
      return merged;
    }
    catch { return defaultConfig; }
  });
  const [loading, setLoading] = useState(true);

  // Client view state
  const [selectedClientTenantId, _setClientTenantId] = useState<string | null>(null);
  const [selectedClientLabel,     setSelectedClientLabel] = useState<string>("");
  // Ref so the polling interval always reads the latest value without stale closure
  const clientIdRef = useRef<string | null>(null);
  const isReadOnly  = selectedClientTenantId !== null;

  const setSelectedClient = useCallback((tenantId: string | null, label = "") => {
    clientIdRef.current = tenantId;
    _setClientTenantId(tenantId);
    setSelectedClientLabel(label);
    // Carry the opened tenant on every API call so the backend scopes ALL routes
    // (not just the KV store) to it — full read/write for the super-admin ombudsman.
    setApiTenant(tenantId);
    // When exiting client view, restore the CA's own data from localStorage
    if (!tenantId) {
      try {
        const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
        _setStore(prev => ({ ...prev, ...saved }));
      } catch { /* ignore */ }
    }
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const [syncStatus, setSyncStatus] = useState<"saved" | "saving" | "error">("saved");

  // Celebrate when an invoice transitions to "paid" (e.g. a Razorpay webhook came
  // through and the poll picked it up) — closes the "did the money land?" loop with
  // visible feedback. Seeds on first run so we don't toast historical paids on load.
  const paidSeenRef = useRef<Set<string>>(new Set());
  const paidInitRef = useRef(false);
  useEffect(() => {
    const paidNow = (store.invoices ?? []).filter(i => i.status === "paid");
    if (!paidInitRef.current) {
      paidNow.forEach(i => paidSeenRef.current.add(i.id));
      paidInitRef.current = true;
      return;
    }
    for (const inv of paidNow) {
      if (!paidSeenRef.current.has(inv.id)) {
        paidSeenRef.current.add(inv.id);
        toast.success(`Payment received — ₹${Number(inv.amount ?? 0).toLocaleString("en-IN")}${inv.customer ? ` from ${inv.customer}` : ""}`);
      }
    }
  }, [store.invoices]);

  const persist = useCallback(async (s: AppStore, clientId: string | null) => {
    // Only cache OWN data locally — never clobber it with an inspected tenant's data.
    if (!clientId) localStorage.setItem(LS_KEY, JSON.stringify(s));
    // When a super_admin is editing another tenant, write to that tenant's app+forecast.
    const namespaces = clientId ? ["app", "forecast"] : (ROLE_NAMESPACES[currentRole] ?? []);
    const split = splitByNs(s);
    const results = await Promise.allSettled(
      namespaces.map(ns => api.put(kvUrl(ns, clientId), { value: split[ns] ?? {} }))
    );
    if (results.some(r => r.status === "rejected")) {
      setSyncStatus("error");
      toast.error("Changes saved locally but failed to sync to server.", { id: "sync-error", duration: 4000 });
    } else {
      setSyncStatus("saved");
    }
  }, [currentRole]);

  // Gate every write: in client view only a super_admin may edit (advisors are
  // read-only); read-only roles (viewer) never write.
  const setStore: SetStore = useCallback((fn) => {
    const cid = clientIdRef.current;
    const isSuper = roleRef.current === "super_admin";
    if (cid !== null && !isSuper) {
      toast.error(RO_MSG, { id: "readonly", duration: 3000 });
      return;
    }
    if (isReadOnlyRole(roleRef.current)) {
      toast.error(VIEWER_MSG, { id: "viewer-readonly", duration: 3000 });
      return;
    }
    _setStore(prev => {
      const next = fn(prev);
      if (cid === null) localStorage.setItem(LS_KEY, JSON.stringify(next));
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSyncStatus("saving");
      debounceRef.current = setTimeout(() => persist(next, cid), DEBOUNCE);
      return next;
    });
  }, [persist]);

  // Load data whenever user, role, or selected client changes
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const clientId   = selectedClientTenantId;
    // CA in client view: only needs app + forecast namespaces for the client
    const namespaces = clientId ? ["app", "forecast"] : (ROLE_NAMESPACES[currentRole] ?? []);
    Promise.allSettled(namespaces.map(ns => api.get<{ value?: Record<string, unknown> }>(kvUrl(ns, clientId))))
      .then(results => {
        const merged: Record<string, unknown> = {};
        results.forEach(r => {
          if (r.status === "fulfilled" && r.value) {
            // Stored as { value: { ...fields } } — unwrap one level
            const payload = r.value?.value;
            if (payload && typeof payload === "object") Object.assign(merged, payload);
          }
        });
        if (Object.keys(merged).length) {
          _setStore(prev => ({ ...prev, ...merged }));
          // Only persist own data to localStorage
          if (!clientId) localStorage.setItem(LS_KEY, JSON.stringify({ ...(JSON.parse(localStorage.getItem(LS_KEY) ?? "{}")), ...merged }));
        }
      })
      .catch(() => {
        if (!clientId) toast.error("Failed to load your data. Working offline — changes will sync when reconnected.");
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentRole, selectedClientTenantId]);

  // Poll — uses ref so interval always reads latest clientId
  useEffect(() => {
    if (!user) return;
    pollRef.current = setInterval(async () => {
      const clientId   = clientIdRef.current;
      const namespaces = clientId ? ["app", "forecast"] : (ROLE_NAMESPACES[currentRole] ?? []);
      const results = await Promise.allSettled(
        namespaces.map(ns => api.get<{ value?: Record<string, unknown> }>(kvUrl(ns, clientId)))
      );
      const merged: Record<string, unknown> = {};
      results.forEach(r => {
        if (r.status === "fulfilled" && r.value) {
          const payload = r.value?.value;
          if (payload && typeof payload === "object") Object.assign(merged, payload);
        }
      });
      if (Object.keys(merged).length) _setStore(prev => ({ ...prev, ...merged }));
    }, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, currentRole]);

  // Live sync via Server-Sent Events — pushes cross-device changes instantly
  // (sub-second) instead of waiting for the 5s poll. Best-effort enhancement: if
  // the stream can't connect (e.g. native WebView CORS), the poll above still
  // keeps every device in sync. On an event from ANOTHER client we refetch only
  // the affected namespace and merge it.
  useEffect(() => {
    if (!user) return;
    let es: EventSource | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const refetchNs = async (ns: string) => {
      const tenantId = clientIdRef.current;
      try {
        const r = await api.get<{ value?: Record<string, unknown> }>(kvUrl(ns, tenantId));
        const payload = r?.value;
        if (payload && typeof payload === "object") _setStore(prev => ({ ...prev, ...payload }));
      } catch { /* poll will reconcile */ }
    };

    const connect = () => {
      if (stopped) return;
      const token = localStorage.getItem("hr_access");
      if (!token) return;
      const tenantId = clientIdRef.current;
      const url = `${API_BASE}/api/kv/stream?token=${encodeURIComponent(token)}`
        + (tenantId ? `&tenant_id=${encodeURIComponent(tenantId)}` : "");
      es = new EventSource(url);
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { ns?: string; clientId?: string; type?: string };
          // Platform-wide broadcast (super-admin changed platform settings) — re-emit
          // as a window event so usePlatformSettings refetches in real time everywhere.
          if (msg?.type === "platform") { window.dispatchEvent(new CustomEvent("headroom:platform")); return; }
          if (!msg?.ns) return;
          if (msg.clientId && msg.clientId === clientId()) return; // ignore our own echo
          const owned = clientIdRef.current ? ["app", "forecast"] : (ROLE_NAMESPACES[currentRole] ?? []);
          if (owned.includes(msg.ns)) refetchNs(msg.ns);
        } catch { /* ignore malformed */ }
      };
      es.onerror = () => {
        es?.close(); es = null;
        // Retry with a possibly-refreshed token (the poll refreshes hr_access on 401).
        if (!stopped) reconnect = setTimeout(connect, 8000);
      };
    };
    connect();

    return () => {
      stopped = true;
      if (reconnect) clearTimeout(reconnect);
      es?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentRole, selectedClientTenantId]);

  // Resolve a role's config: an owner-CUSTOMISED config (custom:true) is
  // authoritative; otherwise fall back to the latest shipped defaults so roles
  // never lose access to newly-released tabs.
  const getRoleConfig = (roleId: UserRole): RoleConfig | undefined => {
    const rc = store.roles.find(r => r.id === roleId);
    if (rc && (rc as RoleConfig & { custom?: boolean }).custom) return rc;
    return defaultConfig.roles.find(r => r.id === roleId) ?? rc;
  };

  const canAccess = (tab: string) => {
    if (effectiveRole === "super_admin") return true;
    // Agent Studio is open to every member — anyone can build/run agents for their
    // business (write-actions are still role-gated server-side at confirm time).
    if (tab === "agents") return true;
    // App Builder (Headroom Studio) — open to every member, like Agent Studio.
    // Writes are role-gated server-side (studio WRITE_ROLES).
    if (tab === "studio") return true;
    return getRoleConfig(effectiveRole)?.accessibleTabs.includes(tab) ?? false;
  };

  const canExport = () => {
    if (effectiveRole === "super_admin") return true;
    return getRoleConfig(effectiveRole)?.canExport ?? false;
  };

  // False when viewing a client's data (advisor) or when the (effective) role is read-only.
  // Exception: a real super_admin edits inside a client/tenant view too — the banner
  // promises "changes save to this company" and setStore already persists for super_admin,
  // so the edit UI must not be hidden. (Previewing another role drops this exemption.)
  const canEdit = () => effectiveRole === "super_admin" || (!isReadOnly && !isReadOnlyRole(effectiveRole));

  // The accessible-tab set shown in the role editor (effective config).
  const roleTabs = (roleId: UserRole): string[] => getRoleConfig(roleId)?.accessibleTabs ?? [];

  // Owner edits which tabs a role can reach — persisted to store.roles (app namespace).
  const setRoleTabs = (roleId: UserRole, tabs: string[]) => setStore(s => {
    const base = s.roles.find(r => r.id === roleId) ?? defaultConfig.roles.find(r => r.id === roleId);
    if (!base) return s;
    const updated = { ...base, accessibleTabs: tabs, visibleTabs: tabs, custom: true } as RoleConfig;
    const exists = s.roles.some(r => r.id === roleId);
    return { ...s, roles: exists ? s.roles.map(r => r.id === roleId ? updated : r) : [...s.roles, updated] };
  });
  const resetRole = (roleId: UserRole) => setStore(s => {
    const dc = defaultConfig.roles.find(r => r.id === roleId);
    if (!dc) return s;
    const fresh = { ...dc, custom: false } as RoleConfig;
    const exists = s.roles.some(r => r.id === roleId);
    return { ...s, roles: exists ? s.roles.map(r => r.id === roleId ? fresh : r) : [...s.roles, fresh] };
  });

  // ── CRUD factories ─────────────────────────────────────────────────────────
  const add    = <K extends keyof AppStore>(key: K) => (x: AppStore[K] extends (infer I)[] ? I : never) =>
    setStore(s => ({ ...s, [key]: [...(s[key] as unknown[]), x] } as AppStore));
  const update = <K extends keyof AppStore>(key: K) => (x: AppStore[K] extends (infer I)[] ? I : never) =>
    setStore(s => ({ ...s, [key]: (s[key] as { id: string }[]).map(i => i.id === (x as { id: string }).id ? x : i) } as AppStore));
  const del    = <K extends keyof AppStore>(key: K) => (id: string) =>
    setStore(s => ({ ...s, [key]: (s[key] as { id: string }[]).filter(i => i.id !== id) } as AppStore));

  const value: AppCtx = {
    store, loading, currentRole, setCurrentRole, canAccess, canExport, canEdit, setStore,
    previewRole, setPreviewRole, effectiveRole, roleTabs, setRoleTabs, resetRole,
    selectedClientTenantId, selectedClientLabel, setSelectedClient, isReadOnly, syncStatus,
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
    addActiveLoan:           add("activeLoans"),
    updateActiveLoan:        update("activeLoans"),
    deleteActiveLoan:        del("activeLoans"),
    updateFirm:              (f) => setStore(s => ({ ...s, firm: { ...s.firm, ...f } })),
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
    addInvoice:              add("invoices"),
    updateInvoice:           update("invoices"),
    deleteInvoice:           del("invoices"),
    addFixedAsset:           add("fixedAssets"),
    updateFixedAsset:        update("fixedAssets"),
    deleteFixedAsset:        del("fixedAssets"),
    addBudget:               add("budgets"),
    updateBudget:            update("budgets"),
    deleteBudget:            del("budgets"),
    resolveAlert:            (id, note) => setStore(s => ({ ...s, alerts: s.alerts.map(a => a.id === id ? { ...a, isRead: true, actionTaken: note?.trim() || a.actionTaken || "Resolved" } : a) })),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
