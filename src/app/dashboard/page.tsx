"use client";

import {
  SectionHeader,
  Card,
  StatCard,
  Badge,
  Button,
  EmptyState,
  severityVariant,
  Spinner,
} from "@/components/ui";
import CashFlowTimeline from "@/components/charts/CashFlowTimeline";
import {
  useForecast,
  useTriggerForecast,
  useAlerts,
  useCreditApplications,
} from "@/lib/query";
import { useAppStore, selectTenantId } from "@/lib/store";
import { format, parseISO, differenceInDays } from "date-fns";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Runway helpers
// ---------------------------------------------------------------------------

function calcRunway(
  datapoints: Array<{ balance_p50: number; date: string }>
): { days: number | null; label: string } {
  const negative = datapoints.find((dp) => dp.balance_p50 < 0);
  if (!negative) return { days: null, label: "90d+" };
  const days = differenceInDays(parseISO(negative.date), new Date());
  return { days, label: `${days}d` };
}

function formatInr(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000)       return `₹${(v / 1_000).toFixed(0)}K`;
  return `₹${v.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const tenantId = useAppStore(selectTenantId);

  const { data: forecast, isLoading: forecastLoading } = useForecast(tenantId);
  const { data: alerts }   = useAlerts(tenantId, false);
  const { data: creditApps } = useCreditApplications(tenantId);
  const triggerForecast    = useTriggerForecast(tenantId ?? "");

  // ── Derived stats ────────────────────────────────────────────────────────
  const dp = forecast?.datapoints ?? [];
  const latest = dp[0];
  const runway = calcRunway(dp);
  const criticalAlerts = (alerts ?? []).filter((a) => a.severity === "critical");
  const unreadAlerts   = (alerts ?? []).filter((a) => !a.is_read);
  const activeCredit   = (creditApps ?? []).filter(
    (a) => a.status === "approved" || a.status === "submitted"
  );

  const runwayVariant =
    runway.days === null
      ? "green"
      : runway.days < 30
      ? "red"
      : runway.days < 60
      ? "gold"
      : "green";

  return (
    <>
      <SectionHeader
        title="Overview"
        subtitle={
          forecast
            ? `Forecast updated ${format(parseISO(forecast.generated_at), "d MMM, HH:mm")}`
            : "Loading forecast…"
        }
        action={
          <Button
            variant="secondary"
            size="sm"
            loading={triggerForecast.isPending}
            onClick={() => triggerForecast.mutate()}
          >
            Refresh forecast
          </Button>
        }
      />

      {/* ── Stats row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Cash in 30d (P50)"
          value={latest ? formatInr(latest.balance_p50) : "—"}
          sub="Expected balance"
          variant={
            latest && latest.balance_p50 < 0
              ? "red"
              : latest && latest.balance_p50 < 500_000
              ? "gold"
              : "green"
          }
        />
        <StatCard
          label="Runway"
          value={forecastLoading ? "…" : runway.label}
          sub="Until cash < 0 (P50)"
          variant={runwayVariant}
        />
        <StatCard
          label="Unread alerts"
          value={String(unreadAlerts.length)}
          sub={criticalAlerts.length > 0 ? `${criticalAlerts.length} critical` : undefined}
          variant={criticalAlerts.length > 0 ? "red" : "green"}
        />
        <StatCard
          label="Active credit"
          value={String(activeCredit.length)}
          sub="Applications in progress"
        />
      </div>

      {/* ── Main chart ─────────────────────────────────────────────── */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "#96b83d" }}>
            90-day Cash Flow Forecast
          </h2>
          <div className="flex items-center gap-4 text-xs" style={{ color: "#6b8526" }}>
            <LegendDot color="#96b83d" label="Expected (P50)" />
            <LegendDot color="#4a5e1a" label="Best case (P90)" />
            <LegendDot color="#854040" label="Downside (P10)" dashed />
          </div>
        </div>

        {forecastLoading ? (
          <div className="flex items-center justify-center h-[340px]">
            <Spinner size={32} />
          </div>
        ) : dp.length > 0 ? (
          <CashFlowTimeline datapoints={dp} height={340} />
        ) : (
          <EmptyState
            message="No forecast data. Connect your bank accounts to generate a prediction."
            action={
              <Link href="/dashboard/settings">
                <Button size="sm" variant="secondary">Connect accounts</Button>
              </Link>
            }
          />
        )}
      </Card>

      {/* ── Alerts + Credit side-by-side ───────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent alerts */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "#96b83d" }}>
              Recent Alerts
            </h2>
            <Link href="/dashboard/alerts">
              <Button variant="ghost" size="sm">View all →</Button>
            </Link>
          </div>

          {(alerts ?? []).length > 0 ? (
            <div className="space-y-2">
              {(alerts ?? []).slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 py-2 border-b last:border-0"
                  style={{ borderColor: "#2e3a10" }}
                >
                  <Badge variant={severityVariant(alert.severity)}>
                    {alert.severity}
                  </Badge>
                  <p className="text-sm flex-1" style={{ color: "#e8f0c2" }}>
                    {alert.message}
                  </p>
                  {!alert.is_read && (
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                      style={{ backgroundColor: "#c9a227" }}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No alerts — your cash flow looks healthy." />
          )}
        </Card>

        {/* Credit applications */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "#96b83d" }}>
              Credit Applications
            </h2>
            <Link href="/dashboard/credit">
              <Button variant="ghost" size="sm">View all →</Button>
            </Link>
          </div>

          {(creditApps ?? []).length > 0 ? (
            <div className="space-y-2">
              {(creditApps ?? []).slice(0, 4).map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                  style={{ borderColor: "#2e3a10" }}
                >
                  <div>
                    <p className="text-sm" style={{ color: "#e8f0c2" }}>
                      {app.loan_amount ? formatInr(app.loan_amount) : "Draft"}
                    </p>
                    <p className="text-xs" style={{ color: "#6b8526" }}>
                      Score: {app.underwriting_score ?? "—"}
                    </p>
                  </div>
                  <Badge
                    variant={
                      app.status === "approved" || app.status === "funded"
                        ? "gold"
                        : app.status === "rejected"
                        ? "red"
                        : "green"
                    }
                  >
                    {app.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No credit applications yet." />
          )}
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Legend helper
// ---------------------------------------------------------------------------

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-8 h-0.5 flex-shrink-0"
        style={{
          backgroundColor: dashed ? "transparent" : color,
          borderTop: dashed ? `2px dashed ${color}` : "none",
        }}
      />
      {label}
    </span>
  );
}
