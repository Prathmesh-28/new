"use client";

/**
 * CashFlowTimeline — custom SVG cash-flow forecast chart.
 *
 * Uses D3 scales for axis math, React for DOM rendering.
 * No Recharts dependency — hand-built for full control over:
 *   - P10/P50/P90 confidence band (area fill between P10 & P90)
 *   - P50 centre line with color change below zero
 *   - Zero reference line (red when balance crosses)
 *   - Alert markers — vertical tick lines at alert dates
 *   - Scenario overlay — gold dashed path
 *   - Portal tooltip following the mouse
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { scaleTime, scaleLinear } from "d3-scale";
import { area, line, curveMonotoneX } from "d3-shape";
import { extent } from "d3-array";
import { format, parseISO, isValid } from "date-fns";
import type { ForecastDatapoint } from "@/lib/schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScenarioOverlayPoint {
  date: string;
  scenario: number;
  delta: number;
}

export interface AlertMarker {
  date: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  message?: string;
}

interface CashFlowTimelineProps {
  datapoints: ForecastDatapoint[];
  scenarioOverlay?: ScenarioOverlayPoint[];
  scenarioName?: string;
  alertMarkers?: AlertMarker[];
  safetyThreshold?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARGIN = { top: 16, right: 20, bottom: 36, left: 68 };

const COLORS = {
  band:          "rgba(74, 94, 26, 0.22)",   // P10→P90 fill
  bandStroke:    "rgba(74, 94, 26, 0.0)",
  p50:           "#96b83d",                  // Expected line
  p50Neg:        "#ef4444",                  // Expected line below zero
  p90:           "#4a5e1a",                  // Best-case line
  p10:           "#854040",                  // Downside line
  zero:          "#3d3d3d",                  // Zero reference
  zeroNeg:       "#7f1d1d",                  // Zero line where balance dips
  scenario:      "#c9a227",                  // Scenario overlay
  safety:        "#c9a227",                  // Safety threshold
  grid:          "#1e2c09",
  axis:          "#6b8526",
  alertCritical: "#ef4444",
  alertHigh:     "#f97316",
  alertMedium:   "#c9a227",
  alertLow:      "#96b83d",
  tooltipBg:     "#1c2209",
  tooltipBorder: "#2e3a10",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatInr(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000)    return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000)       return `${sign}₹${(abs / 1_000).toFixed(0)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function fmtDate(iso: string): string {
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, "d MMM") : iso;
  } catch {
    return iso;
  }
}

function fmtDateLong(iso: string): string {
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, "d MMM yyyy") : iso;
  } catch {
    return iso;
  }
}

function alertColor(severity: AlertMarker["severity"]): string {
  return (
    severity === "critical" ? COLORS.alertCritical
    : severity === "high"   ? COLORS.alertHigh
    : severity === "medium" ? COLORS.alertMedium
                            : COLORS.alertLow
  );
}

// ---------------------------------------------------------------------------
// Tooltip (portal)
// ---------------------------------------------------------------------------

interface TooltipState {
  x: number;
  y: number;
  date: string;
  p50: number;
  p90: number;
  p10: number;
  scenario?: number;
  alert?: AlertMarker;
}

function Tooltip({ tip }: { tip: TooltipState }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: tip.x + 12, top: tip.y - 8 });

  useEffect(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      left: tip.x + 12 + width > vw  ? tip.x - width - 12 : tip.x + 12,
      top:  tip.y - 8 + height  > vh ? tip.y - height      : tip.y - 8,
    });
  }, [tip.x, tip.y]);

  return (
    <div
      ref={ref}
      style={{
        position:    "fixed",
        left:        pos.left,
        top:         pos.top,
        zIndex:      9999,
        background:  COLORS.tooltipBg,
        border:      `1px solid ${COLORS.tooltipBorder}`,
        borderRadius: 8,
        padding:     "10px 14px",
        minWidth:    180,
        pointerEvents: "none",
        boxShadow:   "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      <p style={{ color: "#96b83d", fontSize: 12, marginBottom: 6 }}>
        {fmtDateLong(tip.date)}
      </p>
      <TooltipRow label="Expected"  value={tip.p50} color="#c4d97a" />
      <TooltipRow label="Best case" value={tip.p90} color="#6b8526" />
      <TooltipRow label="Downside"  value={tip.p10} color="#854040" />
      {tip.scenario !== undefined && (
        <TooltipRow label="Scenario" value={tip.scenario} color="#c9a227" />
      )}
      {tip.alert && (
        <p style={{ color: alertColor(tip.alert.severity), fontSize: 11, marginTop: 6, borderTop: `1px solid ${COLORS.tooltipBorder}`, paddingTop: 5 }}>
          {tip.alert.severity.toUpperCase()} · {tip.alert.message ?? "Alert"}
        </p>
      )}
    </div>
  );
}

function TooltipRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <p style={{ color, fontSize: 13, margin: "2px 0" }}>
      <span style={{ color: "#6b8526", marginRight: 6 }}>{label}</span>
      {formatInr(value)}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Parsed data
// ---------------------------------------------------------------------------

interface ParsedPoint {
  date:       Date;
  dateIso:    string;
  p50:        number;
  p90:        number;
  p10:        number;
  scenario?:  number;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CashFlowTimeline({
  datapoints,
  scenarioOverlay,
  scenarioName,
  alertMarkers,
  safetyThreshold,
  height = 360,
}: CashFlowTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth]     = useState(600);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // ── Responsive width via ResizeObserver ────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 600);
    return () => ro.disconnect();
  }, []);

  // ── Parse & merge data ─────────────────────────────────────────────────
  const data: ParsedPoint[] = useMemo(() => {
    const scenMap = new Map(scenarioOverlay?.map((p) => [p.date, p.scenario]));
    return datapoints
      .map((dp) => {
        const d = parseISO(dp.date);
        if (!isValid(d)) return null;
        return {
          date:    d,
          dateIso: dp.date,
          p50:     dp.balance_p50,
          p90:     dp.balance_p90,
          p10:     dp.balance_p10,
          scenario: scenMap.get(dp.date),
        };
      })
      .filter(Boolean) as ParsedPoint[];
  }, [datapoints, scenarioOverlay]);

  // ── Scales ─────────────────────────────────────────────────────────────
  const innerW = width  - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top  - MARGIN.bottom;

  const xScale = useMemo(() => {
    const [min, max] = extent(data, (d) => d.date) as [Date, Date];
    return scaleTime().domain([min ?? new Date(), max ?? new Date()]).range([0, innerW]);
  }, [data, innerW]);

  const yScale = useMemo(() => {
    const allValues = data.flatMap((d) => [d.p10, d.p50, d.p90]);
    if (safetyThreshold !== undefined) allValues.push(safetyThreshold);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const pad    = (maxVal - minVal) * 0.12 || 100_000;
    return scaleLinear()
      .domain([minVal - pad, maxVal + pad])
      .range([innerH, 0])
      .nice();
  }, [data, innerH, safetyThreshold]);

  // ── Path generators ────────────────────────────────────────────────────

  // Confidence band P10 → P90
  const bandPath = useMemo(() => {
    const gen = area<ParsedPoint>()
      .x((d) => xScale(d.date))
      .y0((d) => yScale(d.p10))
      .y1((d) => yScale(d.p90))
      .curve(curveMonotoneX);
    return gen(data) ?? "";
  }, [data, xScale, yScale]);

  // P90 top edge line
  const p90Path = useMemo(() => {
    const gen = line<ParsedPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.p90))
      .curve(curveMonotoneX);
    return gen(data) ?? "";
  }, [data, xScale, yScale]);

  // P10 bottom edge line
  const p10Path = useMemo(() => {
    const gen = line<ParsedPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.p10))
      .curve(curveMonotoneX);
    return gen(data) ?? "";
  }, [data, xScale, yScale]);

  // P50 segments: split at zero crossings for colour change
  const p50Segments = useMemo(() => {
    if (data.length === 0) return { positive: "", negative: "" };
    // Build one continuous path; colour applied via clipPath masks
    const gen = line<ParsedPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.p50))
      .curve(curveMonotoneX);
    return { full: gen(data) ?? "" };
  }, [data, xScale, yScale]);

  // Scenario overlay
  const scenarioPath = useMemo(() => {
    if (!scenarioOverlay?.length) return "";
    const scPoints = data.filter((d) => d.scenario !== undefined);
    if (scPoints.length < 2) return "";
    const gen = line<ParsedPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.scenario!))
      .curve(curveMonotoneX);
    return gen(scPoints) ?? "";
  }, [data, xScale, yScale, scenarioOverlay]);

  // ── Zero y pixel ──────────────────────────────────────────────────────
  const zeroY = yScale(0);

  // ── Alert markers ─────────────────────────────────────────────────────
  const parsedAlerts = useMemo(() => {
    return (alertMarkers ?? [])
      .map((a) => {
        const d = parseISO(a.date);
        return isValid(d) ? { ...a, px: xScale(d) } : null;
      })
      .filter(Boolean) as (AlertMarker & { px: number })[];
  }, [alertMarkers, xScale]);

  // ── X-axis ticks ──────────────────────────────────────────────────────
  const xTicks = useMemo(() => {
    const ticks = xScale.ticks(6);
    return ticks.map((t) => ({ date: t, x: xScale(t) }));
  }, [xScale]);

  // ── Y-axis ticks ──────────────────────────────────────────────────────
  const yTicks = useMemo(() => {
    return yScale.ticks(5).map((v) => ({ value: v, y: yScale(v) }));
  }, [yScale]);

  // ── Hover logic ──────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      // Invert x to find closest datapoint
      const dateAtMouse = xScale.invert(mouseX);
      let closest = data[0];
      let closestDist = Infinity;
      for (const pt of data) {
        const dist = Math.abs(pt.date.getTime() - dateAtMouse.getTime());
        if (dist < closestDist) { closestDist = dist; closest = pt; }
      }
      if (!closest) return;

      const nearestAlert = parsedAlerts.find(
        (a) => Math.abs(parseISO(a.date).getTime() - closest.date.getTime()) < 86_400_000 * 2
      );

      setTooltip({
        x:        e.clientX,
        y:        e.clientY,
        date:     closest.dateIso,
        p50:      closest.p50,
        p90:      closest.p90,
        p10:      closest.p10,
        scenario: closest.scenario,
        alert:    nearestAlert,
      });
    },
    [data, xScale, parsedAlerts]
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // ── Nothing to render ─────────────────────────────────────────────────
  if (data.length === 0) return null;

  // ── Clip IDs ─────────────────────────────────────────────────────────
  const clipAbove = "clip-above-zero";
  const clipBelow = "clip-below-zero";

  return (
    <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
      <svg
        width={width}
        height={height}
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          {/* Clip region above zero (for green P50) */}
          <clipPath id={clipAbove}>
            <rect x={0} y={0} width={innerW} height={Math.max(0, zeroY)} />
          </clipPath>
          {/* Clip region below zero (for red P50) */}
          <clipPath id={clipBelow}>
            <rect
              x={0}
              y={Math.max(0, zeroY)}
              width={innerW}
              height={Math.max(0, innerH - zeroY)}
            />
          </clipPath>
          {/* Confidence band gradient */}
          <linearGradient id="band-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#4a5e1a" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#4a5e1a" stopOpacity={0.08} />
          </linearGradient>
          {/* Negative-zone red fill */}
          <linearGradient id="neg-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#7f1d1d" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#7f1d1d" stopOpacity={0.35} />
          </linearGradient>
        </defs>

        {/* ── Axis group ─────────────────────────────────────────────── */}
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>

          {/* Horizontal grid lines */}
          {yTicks.map(({ value, y }) => (
            <line
              key={value}
              x1={0} x2={innerW} y1={y} y2={y}
              stroke={COLORS.grid}
              strokeWidth={1}
            />
          ))}

          {/* Y-axis tick labels */}
          {yTicks.map(({ value, y }) => (
            <text
              key={value}
              x={-8} y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill={COLORS.axis}
            >
              {formatInr(value)}
            </text>
          ))}

          {/* X-axis tick labels */}
          {xTicks.map(({ date, x }) => (
            <text
              key={date.getTime()}
              x={x} y={innerH + 18}
              textAnchor="middle"
              fontSize={11}
              fill={COLORS.axis}
            >
              {format(date, "d MMM")}
            </text>
          ))}

          {/* ── Confidence band (P10 → P90) ──────────────────────────── */}
          <path d={bandPath} fill="url(#band-fill)" stroke="none" />
          <path d={p90Path} fill="none" stroke={COLORS.p90} strokeWidth={1} strokeOpacity={0.7} />
          <path d={p10Path} fill="none" stroke={COLORS.p10} strokeWidth={1} strokeOpacity={0.7} strokeDasharray="4 3" />

          {/* Negative-zone red fill (below zero) */}
          {zeroY < innerH && (
            <rect
              x={0} y={Math.max(0, zeroY)}
              width={innerW}
              height={innerH - Math.max(0, zeroY)}
              fill="url(#neg-fill)"
            />
          )}

          {/* ── Zero reference line ──────────────────────────────────── */}
          <line
            x1={0} x2={innerW}
            y1={zeroY} y2={zeroY}
            stroke={COLORS.zero}
            strokeWidth={1}
            strokeDasharray="4 4"
          />

          {/* ── Safety threshold ─────────────────────────────────────── */}
          {safetyThreshold !== undefined && (
            <>
              <line
                x1={0} x2={innerW}
                y1={yScale(safetyThreshold)} y2={yScale(safetyThreshold)}
                stroke={COLORS.safety}
                strokeWidth={1}
                strokeDasharray="6 3"
              />
              <text
                x={innerW - 2}
                y={yScale(safetyThreshold) - 4}
                textAnchor="end"
                fontSize={10}
                fill={COLORS.safety}
              >
                Buffer
              </text>
            </>
          )}

          {/* ── P50 line — green above zero, red below ───────────────── */}
          <g clipPath={`url(#${clipAbove})`}>
            <path d={p50Segments.full} fill="none" stroke={COLORS.p50} strokeWidth={2.5} />
          </g>
          <g clipPath={`url(#${clipBelow})`}>
            <path d={p50Segments.full} fill="none" stroke={COLORS.p50Neg} strokeWidth={2.5} />
          </g>

          {/* ── Scenario overlay ─────────────────────────────────────── */}
          {scenarioPath && (
            <path
              d={scenarioPath}
              fill="none"
              stroke={COLORS.scenario}
              strokeWidth={2}
              strokeDasharray="8 4"
            />
          )}

          {/* Scenario label at end of path */}
          {scenarioPath && data.find((d) => d.scenario !== undefined) && (() => {
            const last = [...data].reverse().find((d) => d.scenario !== undefined);
            if (!last) return null;
            return (
              <text
                x={xScale(last.date) + 4}
                y={yScale(last.scenario!)}
                fontSize={10}
                fill={COLORS.scenario}
                dominantBaseline="middle"
              >
                {scenarioName ?? "Scenario"}
              </text>
            );
          })()}

          {/* ── Alert markers ────────────────────────────────────────── */}
          {parsedAlerts.map((a, i) => (
            <g key={i}>
              <line
                x1={a.px} x2={a.px}
                y1={0} y2={innerH}
                stroke={alertColor(a.severity)}
                strokeWidth={1}
                strokeDasharray="3 3"
                strokeOpacity={0.7}
              />
              {/* Diamond marker at the top */}
              <polygon
                points={`${a.px},${-6} ${a.px + 4},${0} ${a.px},${6} ${a.px - 4},${0}`}
                fill={alertColor(a.severity)}
                opacity={0.9}
              />
            </g>
          ))}

          {/* ── Today line ────────────────────────────────────────────── */}
          {(() => {
            const todayX = xScale(new Date());
            if (todayX < 0 || todayX > innerW) return null;
            return (
              <>
                <line
                  x1={todayX} x2={todayX}
                  y1={0} y2={innerH}
                  stroke="#e8f0c2"
                  strokeWidth={1}
                  strokeOpacity={0.25}
                />
                <text
                  x={todayX + 3} y={8}
                  fontSize={10}
                  fill="#e8f0c2"
                  opacity={0.4}
                >
                  Today
                </text>
              </>
            );
          })()}

          {/* ── Invisible hover overlay ───────────────────────────────── */}
          <rect
            x={0} y={0}
            width={innerW} height={innerH}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ cursor: "crosshair" }}
          />
        </g>
      </svg>

      {/* Portal tooltip */}
      {tooltip && typeof document !== "undefined" &&
        createPortal(<Tooltip tip={tooltip} />, document.body)
      }
    </div>
  );
}
