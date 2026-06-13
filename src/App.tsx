import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppProvider, useApp } from "@/context/AppContext";
import { Toaster } from "sonner";
import Sidebar from "@/components/layout/Sidebar";
import ErrorBoundary from "@/components/ErrorBoundary";
import { CommandPalette } from "@/components/CommandPalette";
import UpsellGate from "@/components/UpsellGate";
import OfflineBanner from "@/components/OfflineBanner";
import { onAppResume } from "@/lib/mobile";
import { FEATURE_ENTITLEMENTS, PLAN_RANK, type PlanTier } from "@/data/types";

const HomePage           = lazy(() => import("@/pages/HomePage"));
const LoginPage          = lazy(() => import("@/pages/LoginPage"));
const SignupPage         = lazy(() => import("@/pages/SignupPage"));
const SignupAdvisorPage  = lazy(() => import("@/pages/SignupAdvisorPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage"));
const SetPasswordPage    = lazy(() => import("@/pages/SetPasswordPage"));
const NotFoundPage       = lazy(() => import("@/pages/NotFoundPage"));
const Dashboard          = lazy(() => import("@/features/dashboard/DashboardPage"));
const Forecast           = lazy(() => import("@/features/forecast/ForecastPage"));
const Credit             = lazy(() => import("@/features/credit/CreditPage"));
const Capital            = lazy(() => import("@/features/capital/CapitalPage"));
const Operations         = lazy(() => import("@/features/operations/OperationsPage"));
const AdvisorPage        = lazy(() => import("@/features/advisor/AdvisorPage"));
const InvestorPage       = lazy(() => import("@/features/investor/InvestorPage"));
const ConnectorsPage     = lazy(() => import("@/features/connectors/ConnectorsPage"));
const AdminPage          = lazy(() => import("@/features/admin/AdminPage"));
const SettingsPage       = lazy(() => import("@/features/settings/SettingsPage"));
const TransactionsPage   = lazy(() => import("@/features/transactions/TransactionsPage"));
const AlertsPage         = lazy(() => import("@/features/alerts/AlertsPage"));
const ReceivablesPage    = lazy(() => import("@/features/receivables/ReceivablesPage"));
const ProfilePage        = lazy(() => import("@/pages/ProfilePage"));
const InvoicesPage       = lazy(() => import("@/features/invoices/InvoicesPage"));
const GstPage            = lazy(() => import("@/features/gst/GstPage"));
const PayrollPage        = lazy(() => import("@/features/payroll/PayrollPage"));
const SuppliersPage      = lazy(() => import("@/features/suppliers/SuppliersPage"));
const LendersPage        = lazy(() => import("@/features/lenders/LendersPage"));
const AnalyticsPage      = lazy(() => import("@/features/analytics/AnalyticsPage"));
const CfoBriefPage       = lazy(() => import("@/features/cfo-brief/CfoBriefPage"));
const VendorsPage        = lazy(() => import("@/features/vendors/VendorsPage"));
const BudgetsPage        = lazy(() => import("@/features/budgets/BudgetsPage"));
const TaxPage            = lazy(() => import("@/features/tax/TaxPage"));
const FinancialHealthPage = lazy(() => import("@/features/health/FinancialHealthPage"));
const WorkingCapitalPage = lazy(() => import("@/features/working-capital/WorkingCapitalPage"));
const DebtPage           = lazy(() => import("@/features/debt/DebtPage"));
const ValuationPage      = lazy(() => import("@/features/valuation/ValuationPage"));
const CompliancePage     = lazy(() => import("@/features/compliance/CompliancePage"));
const SpendPage          = lazy(() => import("@/features/spend/SpendPage"));
const WhatsAppPage       = lazy(() => import("@/features/whatsapp/WhatsAppPage"));
const ScenariosPage      = lazy(() => import("@/features/scenarios/ScenariosPage"));
const CollectionsPage    = lazy(() => import("@/features/collections/CollectionsPage"));
const BenchmarksPage     = lazy(() => import("@/features/benchmarks/BenchmarksPage"));
const DocumentsPage      = lazy(() => import("@/features/documents/DocumentsPage"));
const StatementsPage     = lazy(() => import("@/features/statements/StatementsPage"));
const TermSheetPage      = lazy(() => import("@/features/termsheet/TermSheetPage"));
const DataPage           = lazy(() => import("@/features/data/DataPage"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname === "/" ? "/dashboard" : location.pathname)}`} replace />;
  if (user.first_login && location.pathname !== "/set-password") return <Navigate to="/set-password" replace />;
  return <>{children}</>;
}

// Every routable feature tab. Anything in here that the current role can't access
// is bounced to their landing page — so a scoped team member (e.g. Sales) can't
// reach /payroll by typing the URL. Routes NOT in this set (e.g. /profile, unknown
// paths) fall through untouched so universal pages and the 404 still work.
const GUARDED_TABS = new Set([
  "dashboard", "transactions", "alerts", "receivables", "forecast", "credit", "capital",
  "operations", "advisor", "investor", "connectors", "settings", "admin", "invoices",
  "gst", "payroll", "suppliers", "lenders", "analytics", "cfo-brief", "vendors", "budgets",
  "tax", "health", "working-capital", "debt", "valuation", "compliance", "spend", "whatsapp",
  "scenarios", "collections", "benchmarks", "documents", "statements", "term-sheet", "data",
]);

function landingFor(role: string): string {
  if (role === "investor") return "/investor";
  if (role === "accountant") return "/advisor";
  return "/dashboard";
}

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { canAccess, effectiveRole } = useApp();
  const { user } = useAuth();
  const location = useLocation();
  const tab = location.pathname.split("/")[1] ?? "";
  if (GUARDED_TABS.has(tab) && !canAccess(tab)) {
    return <Navigate to={landingFor(effectiveRole)} replace />;
  }
  // Plan entitlement gate — show the upsell instead of the feature when the
  // tenant's plan can't reach it. super_admin (platform owner) bypasses everything.
  const required = FEATURE_ENTITLEMENTS[tab] as Exclude<PlanTier, "free"> | undefined;
  if (required && effectiveRole !== "super_admin" &&
      PLAN_RANK[(user?.plan ?? "free") as PlanTier] < PLAN_RANK[required]) {
    return <UpsellGate feature={tab} requiredPlan={required} />;
  }
  return <>{children}</>;
}

function PreviewBanner() {
  const { previewRole, setPreviewRole } = useApp();
  if (!previewRole) return null;
  const label = previewRole.replace(/_/g, " ");
  return (
    <div className="sticky top-0 z-30 bg-purple-900/40 border-b border-purple-700/50 backdrop-blur px-4 py-2 flex items-center justify-between gap-3">
      <p className="text-xs text-purple-200">
        Previewing the app as <strong className="capitalize">{label}</strong> — this is exactly what they see.
      </p>
      <button onClick={() => setPreviewRole(null)}
        className="text-xs font-semibold bg-purple-800/60 text-purple-100 border border-purple-600/50 px-3 py-1 rounded-md hover:bg-purple-800/90 whitespace-nowrap">
        Exit preview
      </button>
    </div>
  );
}

function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette  = useCallback(() => setPaletteOpen(true),  []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const { refreshUser } = useAuth();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setPaletteOpen(v => !v); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Refresh entitlements when the app returns to the foreground (e.g. after an
  // upgrade completed elsewhere, or on native resume).
  useEffect(() => onAppResume(() => { refreshUser(); }), [refreshUser]);

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <Sidebar onOpenSearch={openPalette} />
      <div className="flex-1 flex flex-col min-w-0">
        <OfflineBanner />
        <PreviewBanner />
        {/* pt-16 offsets the fixed mobile top bar; no offset needed on md+ */}
        <main className="flex-1 p-4 md:p-6 pt-16 md:pt-6 overflow-auto">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <RouteGuard>
              <Routes>
                <Route path="/set-password"  element={<SetPasswordPage />} />
                <Route path="/dashboard"     element={<Dashboard />} />
                <Route path="/transactions"  element={<TransactionsPage />} />
                <Route path="/alerts"        element={<AlertsPage />} />
                <Route path="/receivables"   element={<ReceivablesPage />} />
                <Route path="/forecast"      element={<Forecast />} />
                <Route path="/credit"        element={<Credit />} />
                <Route path="/capital"       element={<Capital />} />
                <Route path="/operations"    element={<Operations />} />
                <Route path="/advisor"       element={<AdvisorPage />} />
                <Route path="/investor"      element={<InvestorPage />} />
                <Route path="/connectors"    element={<ConnectorsPage />} />
                <Route path="/settings"      element={<SettingsPage />} />
                <Route path="/admin"         element={<AdminPage />} />
                <Route path="/invoices"      element={<InvoicesPage />} />
                <Route path="/gst"           element={<GstPage />} />
                <Route path="/payroll"       element={<PayrollPage />} />
                <Route path="/suppliers"     element={<SuppliersPage />} />
                <Route path="/lenders"       element={<LendersPage />} />
                <Route path="/analytics"     element={<AnalyticsPage />} />
                <Route path="/cfo-brief"     element={<CfoBriefPage />} />
                <Route path="/vendors"       element={<VendorsPage />} />
                <Route path="/budgets"       element={<BudgetsPage />} />
                <Route path="/tax"           element={<TaxPage />} />
                <Route path="/health"        element={<FinancialHealthPage />} />
                <Route path="/working-capital" element={<WorkingCapitalPage />} />
                <Route path="/debt"          element={<DebtPage />} />
                <Route path="/valuation"     element={<ValuationPage />} />
                <Route path="/compliance"    element={<CompliancePage />} />
                <Route path="/spend"         element={<SpendPage />} />
                <Route path="/whatsapp"      element={<WhatsAppPage />} />
                <Route path="/scenarios"     element={<ScenariosPage />} />
                <Route path="/collections"   element={<CollectionsPage />} />
                <Route path="/benchmarks"    element={<BenchmarksPage />} />
                <Route path="/documents"     element={<DocumentsPage />} />
                <Route path="/statements"    element={<StatementsPage />} />
                <Route path="/term-sheet"    element={<TermSheetPage />} />
                <Route path="/data"          element={<DataPage />} />
                <Route path="/profile"       element={<ProfilePage />} />
                <Route path="*"              element={<NotFoundPage />} />
              </Routes>
              </RouteGuard>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <Toaster position="top-right" theme="dark" richColors />
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/"                element={<HomePage />} />
                <Route path="/login"           element={<LoginPage />} />
                <Route path="/signup"          element={<SignupPage />} />
                <Route path="/signup-advisor" element={<SignupAdvisorPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/*"               element={<RequireAuth><AppShell /></RequireAuth>} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
}
