"use client";

import { useState } from "react";
import {
  useBankConnections,
} from "@/lib/query";
import { useAppStore, selectTenantId } from "@/lib/store";
import {
  Card,
  SectionHeader,
  Badge,
  Button,
  EmptyState,
  Spinner,
} from "@/components/ui";
import { format, parseISO } from "date-fns";

export default function SettingsPage() {
  const tenantId = useAppStore(selectTenantId);
  const { data: connections, isLoading } = useBankConnections(tenantId);
  const [addingAccount, setAddingAccount] = useState(false);

  const statusVariant = (s: string) =>
    s === "connected" ? "green" : s === "error" ? "red" : "neutral";

  return (
    <>
      <SectionHeader
        title="Settings"
        subtitle="Manage your bank connections and account preferences"
      />

      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ color: "#96b83d" }}
          >
            Bank Connections
          </h2>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAddingAccount(true)}
          >
            + Add Account
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Spinner size={24} />
          </div>
        ) : (connections ?? []).length === 0 ? (
          <EmptyState
            message="No bank accounts connected. Add your first account to start syncing transactions."
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setAddingAccount(true)}
              >
                Connect account
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {(connections ?? []).map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ border: "1px solid #2e3a10", backgroundColor: "#1c2209" }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "#e8f0c2" }}>
                    {conn.account_name ?? "Unnamed account"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#6b8526" }}>
                    {conn.provider} ·{" "}
                    {conn.last_sync
                      ? `Last synced ${format(parseISO(conn.last_sync), "d MMM, HH:mm")}`
                      : "Never synced"}
                  </p>
                  {conn.sync_error && (
                    <p className="text-xs mt-0.5" style={{ color: "#fca5a5" }}>
                      {conn.sync_error}
                    </p>
                  )}
                </div>
                <Badge variant={statusVariant(conn.status)}>{conn.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {addingAccount && (
        <Card>
          <h2
            className="text-sm font-semibold uppercase tracking-widest mb-4"
            style={{ color: "#96b83d" }}
          >
            Connect a Bank Account
          </h2>
          <p className="text-sm mb-4" style={{ color: "#96b83d" }}>
            Use Plaid to securely connect your bank. Click the button below to launch the Plaid Link flow.
          </p>
          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={() => {
                alert("Plaid Link integration — set NEXT_PUBLIC_PLAID_LINK_TOKEN in your environment to enable.");
              }}
            >
              Launch Plaid Link
            </Button>
            <Button variant="ghost" onClick={() => setAddingAccount(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
