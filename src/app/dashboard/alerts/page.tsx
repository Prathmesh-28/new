"use client";

import {
  useAlerts,
  useMarkAlertRead,
  useMarkAllAlertsRead,
} from "@/lib/query";
import { useAppStore, selectTenantId } from "@/lib/store";
import {
  Card,
  SectionHeader,
  Badge,
  Button,
  EmptyState,
  Spinner,
  severityVariant,
} from "@/components/ui";
import { format, parseISO } from "date-fns";

export default function AlertsPage() {
  const tenantId = useAppStore(selectTenantId);
  const { data: alerts, isLoading } = useAlerts(tenantId, false);
  const markRead    = useMarkAlertRead(tenantId ?? "");
  const markAllRead = useMarkAllAlertsRead(tenantId ?? "");

  const unread = (alerts ?? []).filter((a) => !a.is_read).length;

  return (
    <>
      <SectionHeader
        title="Alerts"
        subtitle={unread > 0 ? `${unread} unread` : "All caught up"}
        action={
          unread > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              loading={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size={28} />
          </div>
        ) : (alerts ?? []).length === 0 ? (
          <EmptyState message="No alerts yet. We'll notify you when your forecast detects a cash risk." />
        ) : (
          <div className="divide-y" style={{ borderColor: "#2e3a10" }}>
            {(alerts ?? []).map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-4 py-4"
                style={{ opacity: alert.is_read ? 0.6 : 1 }}
              >
                <Badge variant={severityVariant(alert.severity)}>
                  {alert.severity}
                </Badge>

                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: "#e8f0c2" }}>
                    {alert.message}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#6b8526" }}>
                    {format(parseISO(alert.created_at), "d MMM yyyy, HH:mm")} ·{" "}
                    {alert.alert_type.replace(/_/g, " ")}
                  </p>
                </div>

                {!alert.is_read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={markRead.isPending}
                    onClick={() => markRead.mutate(alert.id)}
                  >
                    Mark read
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
