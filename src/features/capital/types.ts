/**
 * Capital raise feature types.
 * Extend as capital raise Zod schemas are added to @/lib/schemas.
 */

export interface CapitalRaise {
  id:            string;
  tenant_id:     string;
  title:         string;
  target_amount: number;
  raised_amount: number;
  status:        "draft" | "active" | "closed" | "cancelled";
  track:         "rev_share" | "reg_cf" | "reg_a_plus";
  created_at:    string;
}
