import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { Pool } from "pg";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const UNDERWRITING_URL =
  process.env.UNDERWRITING_SERVICE_URL || "http://localhost:8005";

/** Call the underwriting service and return the score result. */
async function getUnderwritingScore(
  tenantId: string,
  applicationId: string
): Promise<{
  score: number;
  approvedAmount: number;
  recommendedProduct: string;
  declineReason: string | null;
  fraudRisk: string;
  breakdown: Record<string, unknown>;
} | null> {
  try {
    const res = await fetch(
      `${UNDERWRITING_URL}/underwrite/${tenantId}?application_id=${applicationId}`,
      { method: "POST", headers: { "Content-Type": "application/json" } }
    );
    if (!res.ok) {
      console.error(`Underwriting service returned ${res.status}`);
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      score:              Number(data.score ?? 0),
      approvedAmount:     Number(data.approved_amount ?? 0),
      recommendedProduct: String(data.recommended_product ?? "unknown"),
      declineReason:      data.decline_reason ? String(data.decline_reason) : null,
      fraudRisk:          String(data.fraud_risk ?? "UNKNOWN"),
      breakdown:          (data.breakdown as Record<string, unknown>) ?? {},
    };
  } catch (err) {
    console.error("Underwriting service call failed:", err);
    return null;
  }
}

const app = express();
const port = parseInt(process.env.PORT || "8002", 10);

app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json());
app.use(morgan("combined"));

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "headroom",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  max: 10,
  idleTimeoutMillis: 30000,
});

interface CreditOffer {
  lender: string;
  amount: number;
  interest_rate: number;
  term_months: number;
  monthly_payment: number;
  expires_at: string;
}

app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "headroom-credit-service",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

app.post("/credit/applications", async (req: Request, res: Response) => {
  const { tenant_id } = req.body;
  if (!tenant_id) {
    return res.status(400).json({ error: "tenant_id is required" });
  }

  try {
    const client = await pool.connect();
    const result = await client.query(
      `INSERT INTO credit_applications (tenant_id, status, created_at, updated_at)
       VALUES ($1, 'draft', NOW(), NOW())
       RETURNING id, status`,
      [tenant_id]
    );
    client.release();

    return res.status(201).json({
      application_id: result.rows[0].id,
      status: result.rows[0].status,
    });
  } catch (error) {
    console.error("Failed to create application", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/credit/applications/:id/submit", async (req: Request, res: Response) => {
  const applicationId = req.params.id;
  const { tenant_id, loan_amount, term_months, purpose } = req.body;

  if (!loan_amount || !term_months || !tenant_id) {
    return res.status(400).json({ error: "tenant_id, loan_amount and term_months are required" });
  }

  try {
    const client = await pool.connect();

    // 1. Mark application as submitted
    await client.query(
      `UPDATE credit_applications
       SET loan_amount = $1, term_months = $2, status = 'submitted', updated_at = NOW()
       WHERE id = $3`,
      [loan_amount, term_months, applicationId]
    );

    // 2. Call underwriting service (synchronous — blocks until scored)
    const uw = await getUnderwritingScore(tenant_id, applicationId);

    if (uw?.declineReason) {
      await client.query(
        `UPDATE credit_applications SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
        [applicationId]
      );
      client.release();
      return res.status(200).json({
        application_id: applicationId,
        status: "rejected",
        decline_reason: uw.declineReason,
        underwriting_score: 0,
        offers: [],
      });
    }

    const score = uw?.score ?? 0;
    const approvedAmount = Math.min(loan_amount, uw?.approvedAmount ?? loan_amount);
    const recommendedProduct = uw?.recommendedProduct ?? "term_loan";

    // 3. Lender routing based on underwriting score
    const offers: CreditOffer[] = routeToLenders(
      tenant_id, approvedAmount, term_months, score, recommendedProduct
    );

    // 4. Persist offers
    for (const offer of offers) {
      await client.query(
        `INSERT INTO credit_offers
           (credit_application_id, lender_partner, product_type, offer_amount,
            apr_equivalent, term_months_est, expires_at, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), NOW())`,
        [
          applicationId,
          offer.lender,
          recommendedProduct,
          offer.amount,
          offer.interest_rate,
          offer.term_months,
          offer.expires_at,
        ]
      );
    }

    // 5. Update application status to approved
    await client.query(
      `UPDATE credit_applications
       SET status = 'approved', credit_score = $1, updated_at = NOW()
       WHERE id = $2`,
      [score, applicationId]
    );

    client.release();
    return res.status(200).json({
      application_id: applicationId,
      status: "approved",
      underwriting_score: score,
      recommended_product: recommendedProduct,
      approved_amount: approvedAmount,
      fraud_risk: uw?.fraudRisk ?? "UNKNOWN",
      offers,
    });
  } catch (error) {
    console.error("Failed to submit application", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// Lender routing logic
// ---------------------------------------------------------------------------

function routeToLenders(
  tenantId: string,
  amount: number,
  termMonths: number,
  score: number,
  product: string
): CreditOffer[] {
  const offers: CreditOffer[] = [];
  const now = Date.now();

  // Stripe Capital — score ≥ 65, any product
  if (score >= 65) {
    offers.push({
      lender: "stripe_capital",
      amount,
      interest_rate: 0.099 + Math.max(0, (80 - score) / 80) * 0.10,
      term_months: termMonths,
      monthly_payment: +((amount * 0.14) / termMonths).toFixed(2),
      expires_at: new Date(now + 7 * 86400000).toISOString(),
    });
  }

  // Fundbox — score ≥ 50, revolving credit line
  if (score >= 50 && product === "credit_line") {
    offers.push({
      lender: "fundbox",
      amount: amount * 0.75,
      interest_rate: 0.149,
      term_months: 12,
      monthly_payment: +((amount * 0.75 * 0.149) / 12).toFixed(2),
      expires_at: new Date(now + 5 * 86400000).toISOString(),
    });
  }

  // Capchase — SaaS revenue advance, score ≥ 40
  if (score >= 40 && product === "revenue_advance") {
    offers.push({
      lender: "capchase",
      amount,
      interest_rate: 0.129,
      term_months: termMonths,
      monthly_payment: +((amount * 0.129) / termMonths).toFixed(2),
      expires_at: new Date(now + 10 * 86400000).toISOString(),
    });
  }

  // Lendio marketplace — always as fallback if any score ≥ 35
  if (score >= 35) {
    offers.push({
      lender: "lendio",
      amount: amount * 0.80,
      interest_rate: 0.199,
      term_months: termMonths,
      monthly_payment: +((amount * 0.80 * 0.199) / termMonths).toFixed(2),
      expires_at: new Date(now + 14 * 86400000).toISOString(),
    });
  }

  // Sort by interest rate ascending
  return offers.sort((a, b) => a.interest_rate - b.interest_rate);
}

app.get("/credit/applications/:id", async (req: Request, res: Response) => {
  const applicationId = req.params.id;
  try {
    const client = await pool.connect();
    const result = await client.query(
      `SELECT id, tenant_id, status, loan_amount, interest_rate, term_months, monthly_payment, underwriting_score
       FROM credit_applications
       WHERE id = $1`,
      [applicationId]
    );
    client.release();

    if (!result.rows.length) {
      return res.status(404).json({ error: "Application not found" });
    }

    return res.status(200).json({ application: result.rows[0] });
  } catch (error) {
    console.error("Failed to fetch application", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/credit/offers/:id/accept", async (req: Request, res: Response) => {
  const offerId = req.params.id;
  try {
    const client = await pool.connect();
    await client.query(
      `UPDATE credit_offers
       SET status = 'accepted',
           created_at = NOW()
       WHERE id = $1`,
      [offerId]
    );
    client.release();

    return res.status(200).json({ accepted: true, offer_id: offerId });
  } catch (error) {
    console.error("Failed to accept offer", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`✅ Headroom Credit Service running on port ${port}`);
});
