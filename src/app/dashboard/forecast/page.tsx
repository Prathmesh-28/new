"use client";

/**
 * Forecast page — full 90-day chart + scenario builder + scenario compare.
 *
 * Scenario form uses React Hook Form + Zod for validation.
 * Scenario overlay is fetched from the compare endpoint and drawn
 * as a gold dashed line on top of the base forecast.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useForecast,
  useTriggerForecast,
  useScenarios,
  useCreateScenario,
  useScenarioCompare,
} from "@/lib/query";
import { useAppStore, selectTenantId } from "@/lib/store";
import {
  ScenarioCreateSchema,
  type ScenarioCreate,
  type ScenarioType,
} from "@/lib/schemas";
import CashFlowTimeline from "@/components/charts/CashFlowTimeline";
import {
  Card,
  SectionHeader,
  Button,
  Badge,
  EmptyState,
  Spinner,
} from "@/components/ui";
import { format, parseISO } from "date-fns";

// ---------------------------------------------------------------------------
// Scenario type labels + default params
// ---------------------------------------------------------------------------

const SCENARIO_TYPES: { value: ScenarioType; label: string; description: string }[] = [
  {
    value: "new_hire",
    label: "New hire",
    description: "Adds annual salary × 1.15 as a monthly outflow from a start date",
  },
  {
    value: "contract_won",
    label: "Contract won",
    description: "Inflow on payment date (net-30/60/90 from contract date)",
  },
  {
    value: "loan_draw",
    label: "Loan draw",
    description: "Inflow on draw date + monthly repayment series",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ForecastPage() {
  const tenantId = useAppStore(selectTenantId);
  const [showScenarioForm, setShowScenarioForm] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [scenarioType, setScenarioType] = useState<ScenarioType>("new_hire");

  const { data: forecast, isLoading } = useForecast(tenantId);
  const { data: scenarios }           = useScenarios(tenantId);
  const triggerForecast               = useTriggerForecast(tenantId ?? "");
  const createScenario                = useCreateScenario(tenantId ?? "");
  const { data: compareData }         = useScenarioCompare(tenantId, activeScenarioId);

  const dp = forecast?.datapoints ?? [];

  // ── Scenario form ────────────────────────────────────────────────────────
  const form = useForm<ScenarioCreate>({
    resolver: zodResolver(ScenarioCreateSchema),
    defaultValues: { type: "new_hire", parameters: {} },
  });

  function onSubmit(data: ScenarioCreate) {
    createScenario.mutate(data, {
      onSuccess: () => {
        form.reset();
        setShowScenarioForm(false);
      },
    });
  }

  return (
    <>
      <SectionHeader
        title="Cash Flow Forecast"
        subtitle={
          forecast
            ? `Model v${forecast.model_version} · generated ${format(
                parseISO(forecast.generated_at),
                "d MMM yyyy, HH:mm"
              )}`
            : undefined
        }
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowScenarioForm((v) => !v)}
            >
              + Scenario
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={triggerForecast.isPending}
              onClick={() => triggerForecast.mutate()}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* ── Main chart ────────────────────────────────────────────── */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ color: "#96b83d" }}
          >
            90-day projection
            {activeScenarioId && compareData && (
              <span style={{ color: "#c9a227" }}>
                {" "}
                vs {compareData.scenario_name}
              </span>
            )}
          </h2>
          {activeScenarioId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveScenarioId(null)}
            >
              ✕ Clear scenario
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-80">
            <Spinner size={32} />
          </div>
        ) : dp.length > 0 ? (
          <CashFlowTimeline
            datapoints={dp}
            scenarioOverlay={compareData?.comparison}
            scenarioName={compareData?.scenario_name}
            height={380}
          />
        ) : (
          <EmptyState message="No forecast data yet." />
        )}
      </Card>

      {/* ── Scenario form ─────────────────────────────────────────── */}
      {showScenarioForm && (
        <Card className="mb-6">
          <h2
            className="text-sm font-semibold uppercase tracking-widest mb-4"
            style={{ color: "#96b83d" }}
          >
            Add scenario
          </h2>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Name */}
            <FormField label="Scenario name" error={form.formState.errors.name?.message}>
              <input
                {...form.register("name")}
                placeholder="e.g. Hire lead developer"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: "#0f1505",
                  border: "1px solid #2e3a10",
                  color: "#e8f0c2",
                }}
              />
            </FormField>

            {/* Type selector */}
            <FormField label="Type" error={form.formState.errors.type?.message}>
              <div className="grid grid-cols-3 gap-2">
                {SCENARIO_TYPES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setScenarioType(value);
                      form.setValue("type", value);
                      form.setValue("parameters", {});
                    }}
                    className="px-3 py-2 rounded-lg text-xs text-left transition-all"
                    style={{
                      backgroundColor:
                        scenarioType === value ? "#2e3a10" : "#1c2209",
                      border: `1px solid ${
                        scenarioType === value ? "#4a5e1a" : "#2e3a10"
                      }`,
                      color:
                        scenarioType === value ? "#c4d97a" : "#6b8526",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FormField>

            {/* Dynamic params */}
            <ScenarioParams type={scenarioType} form={form} />

            <div className="flex gap-2 pt-2">
              <Button type="submit" loading={createScenario.isPending}>
                Save scenario
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowScenarioForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Saved scenarios ───────────────────────────────────────── */}
      <Card>
        <h2
          className="text-sm font-semibold uppercase tracking-widest mb-4"
          style={{ color: "#96b83d" }}
        >
          Saved scenarios
        </h2>

        {(scenarios ?? []).length === 0 ? (
          <EmptyState message="No scenarios yet. Add one to model future cash flow changes." />
        ) : (
          <div className="space-y-2">
            {(scenarios ?? []).map((sc) => (
              <div
                key={sc.id}
                className="flex items-center justify-between py-3 px-3 rounded-lg"
                style={{
                  backgroundColor:
                    activeScenarioId === sc.id ? "#2e3a10" : "transparent",
                  border: `1px solid ${
                    activeScenarioId === sc.id ? "#4a5e1a" : "#2e3a10"
                  }`,
                }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "#e8f0c2" }}>
                    {sc.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#6b8526" }}>
                    {sc.type.replace("_", " ")} · v{sc.version}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={activeScenarioId === sc.id ? "gold" : "neutral"}>
                    {sc.type.replace("_", " ")}
                  </Badge>
                  <Button
                    size="sm"
                    variant={activeScenarioId === sc.id ? "secondary" : "ghost"}
                    onClick={() =>
                      setActiveScenarioId(
                        activeScenarioId === sc.id ? null : sc.id
                      )
                    }
                  >
                    {activeScenarioId === sc.id ? "Hide" : "Compare"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Dynamic parameter fields per scenario type
// ---------------------------------------------------------------------------

function ScenarioParams({
  type,
  form,
}: {
  type: ScenarioType;
  form: ReturnType<typeof useForm<ScenarioCreate>>;
}) {
  const today = new Date().toISOString().slice(0, 10);

  if (type === "new_hire") {
    return (
      <>
        <FormField label="Annual salary (₹)">
          <input
            type="number"
            min={0}
            onChange={(e) =>
              form.setValue("parameters.salary" as any, Number(e.target.value))
            }
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: "#0f1505", border: "1px solid #2e3a10", color: "#e8f0c2" }}
            placeholder="e.g. 1200000"
          />
        </FormField>
        <FormField label="Start date">
          <input
            type="date"
            defaultValue={today}
            onChange={(e) =>
              form.setValue("parameters.start_date" as any, e.target.value)
            }
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: "#0f1505", border: "1px solid #2e3a10", color: "#e8f0c2" }}
          />
        </FormField>
      </>
    );
  }

  if (type === "contract_won") {
    return (
      <>
        <FormField label="Contract value (₹)">
          <input
            type="number"
            min={0}
            onChange={(e) =>
              form.setValue("parameters.amount" as any, Number(e.target.value))
            }
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: "#0f1505", border: "1px solid #2e3a10", color: "#e8f0c2" }}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Contract date">
            <input
              type="date"
              defaultValue={today}
              onChange={(e) =>
                form.setValue("parameters.contract_date" as any, e.target.value)
              }
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "#0f1505", border: "1px solid #2e3a10", color: "#e8f0c2" }}
            />
          </FormField>
          <FormField label="Payment terms (days)">
            <select
              defaultValue={30}
              onChange={(e) =>
                form.setValue("parameters.payment_terms" as any, Number(e.target.value))
              }
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "#0f1505", border: "1px solid #2e3a10", color: "#e8f0c2" }}
            >
              <option value={0}>Immediate</option>
              <option value={30}>Net-30</option>
              <option value={60}>Net-60</option>
              <option value={90}>Net-90</option>
            </select>
          </FormField>
        </div>
      </>
    );
  }

  if (type === "loan_draw") {
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Draw amount (₹)">
            <input
              type="number"
              min={0}
              onChange={(e) =>
                form.setValue("parameters.draw_amount" as any, Number(e.target.value))
              }
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "#0f1505", border: "1px solid #2e3a10", color: "#e8f0c2" }}
            />
          </FormField>
          <FormField label="Total repayment (₹)">
            <input
              type="number"
              min={0}
              onChange={(e) =>
                form.setValue("parameters.repayment_amount" as any, Number(e.target.value))
              }
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "#0f1505", border: "1px solid #2e3a10", color: "#e8f0c2" }}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Draw date">
            <input
              type="date"
              defaultValue={today}
              onChange={(e) =>
                form.setValue("parameters.draw_date" as any, e.target.value)
              }
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "#0f1505", border: "1px solid #2e3a10", color: "#e8f0c2" }}
            />
          </FormField>
          <FormField label="Term (months)">
            <input
              type="number"
              min={1}
              max={60}
              defaultValue={12}
              onChange={(e) =>
                form.setValue("parameters.term_months" as any, Number(e.target.value))
              }
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "#0f1505", border: "1px solid #2e3a10", color: "#e8f0c2" }}
            />
          </FormField>
        </div>
      </>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Small form field wrapper
// ---------------------------------------------------------------------------

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: "#96b83d" }}>
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs mt-1" style={{ color: "#fca5a5" }}>
          {error}
        </p>
      )}
    </div>
  );
}
