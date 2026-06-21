import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppProvider, useApp } from "@/context/AppContext";
import { CapabilitiesProvider } from "@/context/CapabilitiesContext";
import { Toaster } from "sonner";
import Sidebar from "@/components/layout/Sidebar";
import ErrorBoundary from "@/components/ErrorBoundary";
import { CommandPalette } from "@/components/CommandPalette";
import UpsellGate from "@/components/UpsellGate";
import InviteBanner from "@/components/InviteBanner";
import AppTopMeta from "@/components/AppTopMeta";
import OfflineBanner from "@/components/OfflineBanner";
import TenantSwitcher from "@/components/TenantSwitcher";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import AppLockGate from "@/components/AppLockGate";
import InstallPrompt from "@/components/InstallPrompt";
import NotificationBell from "@/components/NotificationBell";
import { onAppResume } from "@/lib/mobile";
import { onDeepLink } from "@/lib/native";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import { registerPush } from "@/lib/nativeFeatures";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Capacitor } from "@capacitor/core";
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
const AllDataPage        = lazy(() => import("@/features/admin/AllDataPage"));
const BooksPage          = lazy(() => import("@/features/books/BooksPage"));
const CrmPage            = lazy(() => import("@/features/crm/CrmPage"));
const ErpPage            = lazy(() => import("@/features/erp/ErpPage"));
const HrmsPage           = lazy(() => import("@/features/hrms/HrmsPage"));
const InsightsPage       = lazy(() => import("@/features/insights/InsightsPage"));
const SettingsPage       = lazy(() => import("@/features/settings/SettingsPage"));
const OrganizationPage   = lazy(() => import("@/features/settings/OrganizationPage"));
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
const SalesPage          = lazy(() => import("@/features/sales/SalesPage"));
const PaymentsPage       = lazy(() => import("@/features/payments/PaymentsPage"));
const InsurancePage      = lazy(() => import("@/features/insurance/InsurancePage"));
const TreasuryPage       = lazy(() => import("@/features/treasury/TreasuryPage"));
const EsgPage            = lazy(() => import("@/features/esg/EsgPage"));
const GlobalPage         = lazy(() => import("@/features/global/GlobalPage"));
const MarketplacePage    = lazy(() => import("@/features/marketplace/MarketplacePage"));
const NetworkPage        = lazy(() => import("@/features/network/NetworkPage"));
const AutomationPage     = lazy(() => import("@/features/automation/AutomationPage"));
const CopilotPage        = lazy(() => import("@/features/copilot/CopilotPage"));
const SecurityPage       = lazy(() => import("@/features/security/SecurityPage"));
const PrivacyPage        = lazy(() => import("@/features/privacy/PrivacyPage"));
const BankingPage        = lazy(() => import("@/features/banking/BankingPage"));
const PredictPage        = lazy(() => import("@/features/predict/PredictPage"));
const VoicePage          = lazy(() => import("@/features/voice/VoicePage"));
const FieldPage          = lazy(() => import("@/features/field/FieldPage"));
const TokensPage         = lazy(() => import("@/features/tokens/TokensPage"));
const FrontierPage       = lazy(() => import("@/features/frontier/FrontierPage"));

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
  "sales", "payments", "insurance", "treasury", "esg", "global",
  "marketplace", "network", "automation", "copilot", "security", "privacy",
  "banking", "predict", "voice", "field", "tokens", "frontier",
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
  const { refreshUser, logout } = useAuth();
  const navigate = useNavigate();

  // Register for push notifications (native only) — store the token server-side
  // and route taps to the right screen.
  useEffect(() => {
    registerPush({
      onToken: (token) => { api.post("/api/push/register", { token, platform: Capacitor.getPlatform() }).catch(() => {}); },
      onOpen: (path) => { if (path) navigate(path); },
    });
  }, [navigate]);

  // Deep links (headroom:// + https app links) → in-app navigation (native only).
  useEffect(() => onDeepLink((path) => navigate(path)), [navigate]);

  // Auto sign-out after 30 minutes of inactivity (protects unattended sessions).
  useIdleLogout(useCallback(() => {
    logout().then(() => { toast("Signed out after 2 hours of inactivity"); navigate("/login"); });
  }, [logout, navigate]));

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
      {/* pt-12 clears the fixed 48px mobile top bar so the banner strips below
          (offline / client-view / read-only / preview) aren't hidden behind it;
          no offset on md+ where the desktop sidebar is used. */}
      <div className="flex-1 flex flex-col min-w-0 pt-12 md:pt-0">
        <OfflineBanner />
        <TenantSwitcher />
        <ReadOnlyBanner />
        <PreviewBanner />
        <NotificationBell />
        <main className="flex-1 px-5 py-5 md:p-6 overflow-auto">
          <AppTopMeta />
          <InviteBanner />
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
                <Route path="/organization"  element={<OrganizationPage />} />
                <Route path="/admin"         element={<AdminPage />} />
                <Route path="/admin/data"    element={<AllDataPage />} />
                <Route path="/books"         element={<BooksPage />} />
                <Route path="/crm"           element={<CrmPage />} />
                <Route path="/erp"           element={<ErpPage />} />
                <Route path="/hrms"          element={<HrmsPage />} />
                <Route path="/insights"      element={<InsightsPage />} />
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
                <Route path="/sales"         element={<SalesPage />} />
                <Route path="/payments"      element={<PaymentsPage />} />
                <Route path="/insurance"     element={<InsurancePage />} />
                <Route path="/treasury"      element={<TreasuryPage />} />
                <Route path="/esg"           element={<EsgPage />} />
                <Route path="/global"        element={<GlobalPage />} />
                <Route path="/marketplace"   element={<MarketplacePage />} />
                <Route path="/network"       element={<NetworkPage />} />
                <Route path="/automation"    element={<AutomationPage />} />
                <Route path="/copilot"       element={<CopilotPage />} />
                <Route path="/security"      element={<SecurityPage />} />
                <Route path="/privacy"       element={<PrivacyPage />} />
                <Route path="/banking"       element={<BankingPage />} />
                <Route path="/predict"       element={<PredictPage />} />
                <Route path="/voice"         element={<VoicePage />} />
                <Route path="/field"         element={<FieldPage />} />
                <Route path="/tokens"        element={<TokensPage />} />
                <Route path="/frontier"      element={<FrontierPage />} />
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
        <CapabilitiesProvider>
        <BrowserRouter>
          <Toaster position="top-right" theme="dark" richColors />
          <InstallPrompt />
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/"                element={<HomePage />} />
                <Route path="/login"           element={<LoginPage />} />
                <Route path="/signup"          element={<SignupPage />} />
                <Route path="/signup-advisor" element={<SignupAdvisorPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/*"               element={<RequireAuth><AppLockGate><AppShell /></AppLockGate></RequireAuth>} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
        </CapabilitiesProvider>
      </AppProvider>
    </AuthProvider>
  );
}
