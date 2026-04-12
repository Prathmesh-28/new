/**
 * Forecast feature — local types that extend or re-export from shared schemas.
 * Import from @/lib/schemas for Zod-validated API shapes;
 * use this file for UI-specific extensions.
 */

export type {
  ForecastDatapoint,
  Forecast,
  Scenario,
  ScenarioCreate,
  ScenarioType,
} from "@/lib/schemas";

export type { ScenarioOverlayPoint, AlertMarker } from "@/components/charts/CashFlowTimeline";
