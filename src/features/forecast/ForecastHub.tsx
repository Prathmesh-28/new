import { lazy } from "react";
import { TrendingUp, Sliders, Radar } from "lucide-react";
import PageHub from "@/components/layout/PageHub";

// "Forecast" — three pages (Forecast, Scenarios, Predict) re-ran the same projection
// engine over the same data; now one page with three tabs.
const ForecastPage  = lazy(() => import("@/features/forecast/ForecastPage"));
const ScenariosPage = lazy(() => import("@/features/scenarios/ScenariosPage"));
const PredictPage   = lazy(() => import("@/features/predict/PredictPage"));

export default function ForecastHub() {
  return (
    <PageHub
      tabs={[
        { key: "forecast",  label: "Forecast",  icon: TrendingUp, element: <ForecastPage /> },
        { key: "scenarios", label: "Scenarios", icon: Sliders,    element: <ScenariosPage /> },
        { key: "predict",   label: "Predict",   icon: Radar,      element: <PredictPage /> },
      ]}
    />
  );
}
