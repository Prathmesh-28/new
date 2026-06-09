import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppProvider } from "@/context/AppContext";
import { Toaster } from "sonner";
import Header from "@/components/layout/Header";
import ErrorBoundary from "@/components/ErrorBoundary";

const HomePage           = lazy(() => import("@/pages/HomePage"));
const LoginPage          = lazy(() => import("@/pages/LoginPage"));
const SignupPage         = lazy(() => import("@/pages/SignupPage"));
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
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/set-password"  element={<SetPasswordPage />} />
              <Route path="/dashboard"     element={<Dashboard />} />
              <Route path="/transactions"  element={<TransactionsPage />} />
              <Route path="/alerts"        element={<AlertsPage />} />
              <Route path="/forecast"      element={<Forecast />} />
              <Route path="/credit"        element={<Credit />} />
              <Route path="/capital"       element={<Capital />} />
              <Route path="/operations"    element={<Operations />} />
              <Route path="/advisor"       element={<AdvisorPage />} />
              <Route path="/investor"      element={<InvestorPage />} />
              <Route path="/connectors"    element={<ConnectorsPage />} />
              <Route path="/settings"      element={<SettingsPage />} />
              <Route path="/admin"         element={<AdminPage />} />
              <Route path="*"              element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
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
