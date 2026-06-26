import { lazy } from "react";
import { Wand2, AppWindow, Waypoints, Workflow } from "lucide-react";
import PageHub from "@/components/layout/PageHub";

// One "Build & Automate" door. The four builder surfaces that used to be separate
// top-level nav entries (the owner's "repeated things") are now tabs of one page.
const AgentStudioPage = lazy(() => import("@/features/agents/AgentStudioPage"));
const AppBuilderPage  = lazy(() => import("@/features/appbuilder/AppBuilderPage"));
const FlowsPage       = lazy(() => import("@/features/flows/FlowsPage"));
const AutomationPage  = lazy(() => import("@/features/automation/AutomationPage"));

export default function BuildHub() {
  return (
    <PageHub
      tabs={[
        { key: "agents",     label: "Agents",      icon: Wand2,     element: <AgentStudioPage embedded /> },
        { key: "app-builder",label: "App Builder", icon: AppWindow, element: <AppBuilderPage /> },
        { key: "flows",      label: "Flows",       icon: Waypoints, element: <FlowsPage /> },
        { key: "automation", label: "Automation",  icon: Workflow,  element: <AutomationPage /> },
      ]}
    />
  );
}
