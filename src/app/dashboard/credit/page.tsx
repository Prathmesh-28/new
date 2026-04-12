"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useCreditApplications,
  useSubmitCreditApplication,
} from "@/lib/query";
import { useAppStore, selectTenantId } from "@/lib/store";
import { CreditSubmitSchema, type CreditSubmit } from "@/lib/schemas";
import {
  Card,
  SectionHeader,
  Badge,
  Button,
  EmptyState,
  Spinner,
  StatCard,
} from "@/components/ui";
import { format, parseISO } from "date-fns";

function formatInr(v: number) {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000)       return `₹${(v / 1_000).toFixed(0)}K`;
  return `₹${v.toFixed(0)}`;
}

export default function CreditPage() {
  const tenantId = useAppStore(selectTenantId);
  const { data: applications, isLoading } = useCreditApplications(tenantId);
  const submitApp = useSubmitCreditApplication(tenantId ?? "");

  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  const form = useForm<CreditSubmit>({
    resolver: zodResolver(CreditSubmitSchema),
    defaultValues: { term_months: 12 },
  });

  function onSubmit(data: CreditSubmit) {
    if (!selectedAppId) return;
    submitApp.mutate(
      { applicationId: selectedAppId, data },
      { onSuccess: () => setApplyOpen(false) }
    );
  }

  const approved   = (applications ?? []).filter((a) => a.status === "approved" || a.status === "funded");
  const inProgress = (applications ?? []).filter((a) => a.status === "submitted" || a.status === "draft");

  return (
    <>
      <SectionHeader
        title="Credit"
        subtitle="Silent underwriting · forecast-triggered capital"
        action={
          <Button size="sm" onClick={() => setApplyOpen((v) => !v)}>
            Apply for credit
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Applications"
          value={String((applications ?? []).length)}
          sub="Total submitted"
        />
        <StatCard
          label="Approved"
          value={String(approved.length)}
          variant="gold"
        />
        <StatCard
          label="Best score"
          value={
            (applications ?? []).reduce((best, a) => Math.max(best, a.underwriting_score ?? 0), 0).toString() || "—"
          }
          sub="Underwriting score (0-100)"
        />
      </div>

      {/* Application form */}
      {applyOpen && (
        <Card className="mb-6">
          <h2
            className="text-sm font-semibold uppercase tracking-widest mb-4"
            style={{ color: "#96b83d" }}
          >
            New credit application
          </h2>

          {inProgress.length > 0 ? (
            <>
              <p className="text-sm mb-3" style={{ color: "#e8f0c2" }}>
                Select a draft application to submit:
              </p>
              <div className="space-y-2 mb-4">
                {inProgress.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => setSelectedAppId(app.id)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all"
                    style={{
                      backgroundColor:
                        selectedAppId === app.id ? "#2e3a10" : "#0f1505",
                      border: `1px solid ${
                        selectedAppId === app.id ? "#4a5e1a" : "#2e3a10"
                      }`,
                      color: "#e8f0c2",
                    }}
                  >
                    Draft · {format(parseISO(app.created_at), "d MMM yyyy")}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm mb-4" style={{ color: "#6b8526" }}>
              A new draft application will be created and submitted.
            </p>
          )}

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: "#96b83d" }}
                >
                  Amount (₹)
                </label>
                <input
                  type="number"
                  {...form.register("loan_amount", { valueAsNumber: true })}
                  placeholder="e.g. 2500000"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    backgroundColor: "#0f1505",
                    border: "1px solid #2e3a10",
                    color: "#e8f0c2",
                  }}
                />
                {form.formState.errors.loan_amount && (
                  <p className="text-xs mt-1" style={{ color: "#fca5a5" }}>
                    {form.formState.errors.loan_amount.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: "#96b83d" }}
                >
                  Term (months)
                </label>
                <select
                  {...form.register("term_months", { valueAsNumber: true })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    backgroundColor: "#0f1505",
                    border: "1px solid #2e3a10",
                    color: "#e8f0c2",
                  }}
                >
                  {[3, 6, 12, 18, 24, 36, 48, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} months
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                className="block text-xs mb-1"
                style={{ color: "#96b83d" }}
              >
                Purpose (optional)
              </label>
              <input
                {...form.register("purpose")}
                placeholder="e.g. Working capital for Q3 inventory"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: "#0f1505",
                  border: "1px solid #2e3a10",
                  color: "#e8f0c2",
                }}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" loading={submitApp.isPending}>
                Submit &amp; get offers
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setApplyOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>

          {submitApp.data && (
            <OffersPanel
              offers={submitApp.data.offers}
              score={submitApp.data.underwriting_score}
            />
          )}
        </Card>
      )}

      {/* Applications list */}
      <Card>
        <h2
          className="text-sm font-semibold uppercase tracking-widest mb-4"
          style={{ color: "#96b83d" }}
        >
          All applications
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size={24} />
          </div>
        ) : (applications ?? []).length === 0 ? (
          <EmptyState message="No applications yet. We run silent pre-qualification based on your forecast." />
        ) : (
          <div className="divide-y" style={{ borderColor: "#2e3a10" }}>
            {(applications ?? []).map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between py-4"
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "#e8f0c2" }}>
                    {app.loan_amount
                      ? formatInr(app.loan_amount)
                      : "Amount TBD"}
                    {app.term_months ? ` · ${app.term_months}mo` : ""}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#6b8526" }}>
                    Score: {app.underwriting_score ?? "—"} ·{" "}
                    {format(parseISO(app.created_at), "d MMM yyyy")}
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
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Offers panel shown after submission
// ---------------------------------------------------------------------------

function OffersPanel({
  offers,
  score,
}: {
  offers: any[];
  score: number;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-4">
        <h3
          className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: "#c9a227" }}
        >
          Offers received
        </h3>
        <Badge variant="gold">Score: {score}/100</Badge>
      </div>

      {offers.length === 0 ? (
        <p className="text-sm" style={{ color: "#6b8526" }}>
          No offers available at this time.
        </p>
      ) : (
        <div className="space-y-3">
          {offers.map((offer, i) => (
            <div
              key={i}
              className="p-4 rounded-lg"
              style={{
                backgroundColor: "#0f1505",
                border: "1px solid #2e3a10",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="font-semibold capitalize text-sm"
                  style={{ color: "#e8f0c2" }}
                >
                  {offer.lender?.replace(/_/g, " ")}
                </span>
                <Badge variant="gold">
                  {(offer.interest_rate * 100).toFixed(1)}% APR
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p style={{ color: "#6b8526" }}>Amount</p>
                  <p style={{ color: "#e8f0c2" }}>{formatInr(offer.amount)}</p>
                </div>
                <div>
                  <p style={{ color: "#6b8526" }}>Term</p>
                  <p style={{ color: "#e8f0c2" }}>{offer.term_months}mo</p>
                </div>
                <div>
                  <p style={{ color: "#6b8526" }}>Monthly</p>
                  <p style={{ color: "#e8f0c2" }}>{formatInr(offer.monthly_payment)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
