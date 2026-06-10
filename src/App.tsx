import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppProvider } from "@/context/AppContext";
import { Toaster } from "sonner";
import Sidebar from "@/components/layout/Sidebar";
import ErrorBoundary from "@/components/ErrorBoundary";
import { CommandPalette } from "@/components/CommandPalette";

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

function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette  = useCallback(() => setPaletteOpen(true),  []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setPaletteOpen(v => !v); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <Sidebar onOpenSearch={openPalette} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* pt-16 offsets the fixed mobile top bar; no offset needed on md+ */}
        <main className="flex-1 p-4 md:p-6 pt-16 md:pt-6 overflow-auto">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
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
                <Route path="/profile"       element={<ProfilePage />} />
                <Route path="*"              element={<NotFoundPage />} />
              </Routes>
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
