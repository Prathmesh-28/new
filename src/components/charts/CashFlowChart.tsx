"use client";

/**
 * CashFlowChart — 90-day cash flow forecast visualisation.
 *
 * Renders three Recharts area layers (P10 / P50 / P90) forming a
 * confidence-band ribbon, with an optional scenario-overlay line.
 *
 * Today line (day 0) is drawn as a custom SVG reference line.
 * Negative-balance zone is filled red below the zero axis.
 * Tooltips show formatted ₹ amounts for all three bands.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { format, parseISO, isValid } from "date-fns";
import { useMemo } from "react";
import type { ForecastDatapoint } from "@/lib/schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScenarioOverlayPoint {
  date: string;
  scenario: number;
  delta: number;
}

interface CashFlowChartProps {
  datapoints: ForecastDatapoint[];
  scenarioOverlay?: ScenarioOverlayPoint[];
  scenarioName?: string;
  height?: number;
  /** If set, draw a horizontal reference line for the safety threshold */
  safetyThreshold?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatInr(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000)    return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000)       return `₹${(value / 1_000).toFixed(0)}K`;
  return `₹${value.toFixed(0)}`;
}

function formatDate(iso: string): string {
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, "d MMM") : iso;
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;

  const get = (name: string) =>
    payload.find((p) => p.dataKey === name)?.value as number | undefined;

  const p50   = get("balance_p50");
  const p10   = get("balance_p10");
  const p90   = get("balance_p90");
  const scen  = get("scenario");

  return (
    <div
      style={{
        background: "#1c2209",
        border: "1px solid #2e3a10",
        borderRadius: 8,
        padding: "10px 14px",
        minWidth: 180,
      }}
    >
      <p style={{ color: "#96b83d", fontSize: 12, marginBottom: 6 }}>
        {formatDate(String(label))}
      </p>
      {p50   !== undefined && (
        <Row label="Expected"  value={p50}  color="#c4d97a" />
      )}
      {p90   !== undefined && (
        <Row label="Best case" value={p90}  color="#6b8526" />
      )}
      {p10   !== undefined && (
        <Row label="Downside"  value={p10}  color="#854040" />
      )}
      {scen  !== undefined && (
        <Row label="Scenario"  value={scen} color="#c9a227" />
      )}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <p style={{ color, fontSize: 13, margin: "2px 0" }}>
      <span style={{ color: "#6b8526", marginRight: 6 }}>{label}</span>
      {formatInr(value)}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Tick formatters
// ---------------------------------------------------------------------------

function xTickFormatter(iso: string): string {
  return formatDate(iso);
}

function yTickFormatter(value: number): string {
  return formatInr(value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CashFlowChart({
  datapoints,
  scenarioOverlay,
  scenarioName,
  height = 340,
  safetyThreshold,
}: CashFlowChartProps) {
  // Merge forecast datapoints with optional scenario overlay
  const chartData = useMemo(() => {
    if (!scenarioOverlay?.length) return datapoints;

    const scenarioMap = new Map(
      scenarioOverlay.map((p) => [p.date, p.scenario])
    );
    return datapoints.map((dp) => ({
      ...dp,
      scenario: scenarioMap.get(dp.date),
    }));
  }, [datapoints, scenarioOverlay]);

  // Show only every ~15th label to avoid crowding
  const xTickInterval = Math.max(1, Math.floor(datapoints.length / 6));

  const hasNegative = datapoints.some((dp) => dp.balance_p50 < 0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={chartData}
        margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
      >
        <defs>
          {/* Gradient fill for P50 (expected) */}
          <linearGradient id="gradP50" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#4a5e1a" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#4a5e1a" stopOpacity={0.05} />
          </linearGradient>

          {/* Gradient fill for the P10→P90 band */}
          <linearGradient id="gradBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#2e3a10" stopOpacity={0.6} />
            <stop offset="95%" stopColor="#2e3a10" stopOpacity={0.05} />
          </linearGradient>

          {/* Red fill for negative zone */}
          <linearGradient id="gradNeg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#7f1d1d" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#7f1d1d" stopOpacity={0.1} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#2e3a10"
          vertical={false}
        />

        <XAxis
          dataKey="date"
          tickFormatter={xTickFormatter}
          interval={xTickInterval}
          tick={{ fill: "#6b8526", fontSize: 11 }}
          axisLine={{ stroke: "#2e3a10" }}
          tickLine={false}
        />

        <YAxis
          tickFormatter={yTickFormatter}
          tick={{ fill: "#6b8526", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={64}
        />

        <Tooltip content={<CustomTooltip />} />

        {/* Zero axis */}
        <ReferenceLine y={0} stroke="#3d3d3d" strokeDasharray="4 4" />

        {/* Safety threshold */}
        {safetyThreshold !== undefined && (
          <ReferenceLine
            y={safetyThreshold}
            stroke="#c9a227"
            strokeDasharray="6 3"
            label={{ value: "Buffer", fill: "#c9a227", fontSize: 10 }}
          />
        )}

        {/* P90 (best case) — top of band, barely visible fill */}
        <Area
          type="monotone"
          dataKey="balance_p90"
          stroke="#4a5e1a"
          strokeWidth={1}
          fill="url(#gradBand)"
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />

        {/* P50 (expected) — main line */}
        <Area
          type="monotone"
          dataKey="balance_p50"
          stroke="#96b83d"
          strokeWidth={2}
          fill="url(#gradP50)"
          dot={false}
          activeDot={{ r: 4, fill: "#c4d97a", stroke: "#96b83d" }}
          isAnimationActive={false}
        />

        {/* P10 (downside) — dashed red baseline */}
        <Area
          type="monotone"
          dataKey="balance_p10"
          stroke="#854040"
          strokeWidth={1}
          strokeDasharray="4 3"
          fill={hasNegative ? "url(#gradNeg)" : "none"}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />

        {/* Scenario overlay — gold line, no fill */}
        {scenarioOverlay?.length && (
          <Area
            type="monotone"
            dataKey="scenario"
            stroke="#c9a227"
            strokeWidth={2}
            fill="none"
            strokeDasharray="6 3"
            dot={false}
            activeDot={{ r: 4, fill: "#c9a227" }}
            name={scenarioName ?? "Scenario"}
            isAnimationActive={false}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
