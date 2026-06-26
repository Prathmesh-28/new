import { lazy } from "react";
import { TrendingUp, Handshake } from "lucide-react";
import PageHub from "@/components/layout/PageHub";

// "Sales & CRM" — the pipeline and the contact/account book were two nav entries
// over the same /api/crm/deals data; now two tabs of one page.
const SalesPage = lazy(() => import("@/features/sales/SalesPage"));
const CrmPage   = lazy(() => import("@/features/crm/CrmPage"));

export default function SalesHub() {
  return (
    <PageHub
      tabs={[
        { key: "pipeline", label: "Sales Pipeline", icon: TrendingUp, element: <SalesPage /> },
        { key: "crm",      label: "Contacts & CRM", icon: Handshake,  element: <CrmPage /> },
      ]}
    />
  );
}
