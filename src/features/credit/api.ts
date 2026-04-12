import { apiFetch } from "@/lib/query";
import { CreditApplicationSchema, type CreditSubmit } from "@/lib/schemas";
import { z } from "zod";

const BASE = "/api";

export async function fetchCreditApplications(tenantId: string) {
  return apiFetch(
    `${BASE}/credit/applications?tenant_id=${tenantId}`,
    z.array(CreditApplicationSchema)
  );
}

export async function submitCreditApplication(
  tenantId: string,
  applicationId: string,
  data: CreditSubmit
) {
  return apiFetch(`${BASE}/credit/applications/${applicationId}/submit`, undefined, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tenantId, ...data }),
  });
}
