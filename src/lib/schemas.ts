/**
 * Zod schemas — single source of truth for all data shapes.
 * Shared between form validation and API response parsing.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const IsoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}/);

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

export const ForecastDatapointSchema = z.object({
  date: IsoDateString,
  balance_p10: z.number(),
  balance_p50: z.number(),
  balance_p90: z.number(),
  confidence_score: z.number().min(0).max(1),
});
export type ForecastDatapoint = z.infer<typeof ForecastDatapointSchema>;

export const ForecastSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  generated_at: z.string(),
  status: z.enum(["pending", "complete", "error"]),
  model_version: z.string(),
  datapoints: z.array(ForecastDatapointSchema),
});
export type Forecast = z.infer<typeof ForecastSchema>;

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const ScenarioTypeSchema = z.enum([
  "new_hire",
  "contract_won",
  "loan_draw",
  "custom",
]);
export type ScenarioType = z.infer<typeof ScenarioTypeSchema>;

export const NewHireParamsSchema = z.object({
  salary: z.number().positive("Annual salary must be positive"),
  start_date: IsoDateString,
  benefits_multiplier: z.number().min(0).max(1).default(0.15),
});

export const ContractWonParamsSchema = z.object({
  amount: z.number().positive("Contract amount must be positive"),
  contract_date: IsoDateString,
  payment_terms: z.number().int().min(0).max(120).default(30),
});

export const LoanDrawParamsSchema = z.object({
  draw_amount: z.number().positive("Draw amount must be positive"),
  repayment_amount: z.number().positive("Repayment total must be positive"),
  term_months: z.number().int().min(1).max(60).default(12),
  draw_date: IsoDateString,
});

export const ScenarioCreateSchema = z
  .object({
    name: z.string().min(1).max(100),
    type: ScenarioTypeSchema,
    parameters: z.record(z.unknown()),
  })
  .superRefine((val, ctx) => {
    try {
      if (val.type === "new_hire") NewHireParamsSchema.parse(val.parameters);
      else if (val.type === "contract_won") ContractWonParamsSchema.parse(val.parameters);
      else if (val.type === "loan_draw") LoanDrawParamsSchema.parse(val.parameters);
    } catch (e: any) {
      ctx.addIssue({ code: "custom", message: e.message, path: ["parameters"] });
    }
  });
export type ScenarioCreate = z.infer<typeof ScenarioCreateSchema>;

export const ScenarioSchema = ScenarioCreateSchema.extend({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  version: z.number().int(),
  created_at: z.string(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const ScenarioComparePointSchema = z.object({
  date:     z.string(),
  scenario: z.number(),
  delta:    z.number(),
});

export const ScenarioCompareSchema = z.object({
  scenario_id:   z.string().uuid(),
  scenario_name: z.string(),
  comparison:    z.array(ScenarioComparePointSchema),
});
export type ScenarioCompare = z.infer<typeof ScenarioCompareSchema>;

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export const AlertSeveritySchema = z.enum(["critical", "warning", "info"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  alert_type: z.string(),
  severity: AlertSeveritySchema,
  message: z.string(),
  is_read: z.boolean(),
  created_at: z.string(),
});
export type Alert = z.infer<typeof AlertSchema>;

// ---------------------------------------------------------------------------
// Credit
// ---------------------------------------------------------------------------

export const CreditApplicationStatusSchema = z.enum([
  "draft",
  "submitted",
  "approved",
  "rejected",
  "funded",
  "repaid",
]);

export const CreditApplicationSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  status: CreditApplicationStatusSchema,
  loan_amount: z.number().nullable(),
  term_months: z.number().int().nullable(),
  underwriting_score: z.number().int().nullable(),
  credit_score: z.number().int().nullable(),
  fraud_check_status: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CreditApplication = z.infer<typeof CreditApplicationSchema>;

export const CreditOfferSchema = z.object({
  id: z.string().uuid(),
  credit_application_id: z.string().uuid(),
  lender_partner: z.string(),
  product_type: z.string(),
  offer_amount: z.number(),
  apr_equivalent: z.number().nullable(),
  term_months_est: z.number().int().nullable(),
  expires_at: z.string().nullable(),
  status: z.string(),
});
export type CreditOffer = z.infer<typeof CreditOfferSchema>;

export const CreditSubmitSchema = z.object({
  loan_amount: z
    .number({ required_error: "Amount is required" })
    .positive("Amount must be positive")
    .min(10_000, "Minimum ₹10,000"),
  term_months: z
    .number({ required_error: "Term is required" })
    .int()
    .min(3, "Minimum 3 months")
    .max(60, "Maximum 60 months"),
  purpose: z.string().min(10, "Please describe your purpose (10+ chars)").optional(),
});
export type CreditSubmit = z.infer<typeof CreditSubmitSchema>;

// ---------------------------------------------------------------------------
// Bank connections
// ---------------------------------------------------------------------------

export const BankConnectionSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  provider: z.string(),
  account_name: z.string().nullable(),
  status: z.enum(["pending", "connected", "disconnected", "error"]),
  last_sync: z.string().nullable(),
  sync_error: z.string().nullable(),
  created_at: z.string(),
});
export type BankConnection = z.infer<typeof BankConnectionSchema>;

// ---------------------------------------------------------------------------
// Tenant / session
// ---------------------------------------------------------------------------

export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  company_name: z.string().nullable(),
  subscription_tier: z.enum(["starter", "growth", "pro", "capital"]),
  features: z.record(z.unknown()).default({}),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const SessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["owner", "accountant", "investor", "admin"]),
  tenant_id: z.string().uuid(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;
