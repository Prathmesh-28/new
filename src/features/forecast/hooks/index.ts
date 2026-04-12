/**
 * Forecast feature hooks — re-exports from the shared query module.
 * Collocated here so forecast components import from their own feature slice.
 */

export {
  useForecast,
  useTriggerForecast,
  useScenarios,
  useCreateScenario,
  useScenarioCompare,
} from "@/lib/query";
