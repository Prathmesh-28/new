import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || "8003", 10);

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

app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "headroom-capital-service",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

app.post("/capital/raises", async (req: Request, res: Response) => {
  const { tenant_id, track, target_amount, terms } = req.body;

  if (!tenant_id || !track || !target_amount) {
    return res.status(400).json({
      error: "tenant_id, track, and target_amount are required"
    });
  }

  try {
    const client = await pool.connect();
    const result = await client.query(
      `INSERT INTO capital_raises (tenant_id, track, target_amount, raised_amount, status, start_date, end_date, created_at, updated_at)
       VALUES ($1, $2, $3, 0, 'draft', NOW(), NOW(), NOW(), NOW())
       RETURNING id, status`,
      [tenant_id, track, target_amount]
    );
    client.release();

    return res.status(201).json({
      raise_id: result.rows[0].id,
      status: result.rows[0].status,
    });
  } catch (error) {
    console.error("Failed to create capital raise", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/capital/raises/:id", async (req: Request, res: Response) => {
  const raiseId = req.params.id;
  const { status, terms } = req.body;

  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }

  try {
    const client = await pool.connect();
    await client.query(
      `UPDATE capital_raises
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [status, raiseId]
    );
    client.release();

    return res.status(200).json({ raise_id: raiseId, status });
  } catch (error) {
    console.error("Failed to update capital raise", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/capital/raises/:id/publish", async (req: Request, res: Response) => {
  const raiseId = req.params.id;

  try {
    const client = await pool.connect();
    await client.query(
      `UPDATE capital_raises
       SET status = 'active',
           updated_at = NOW()
       WHERE id = $1`,
      [raiseId]
    );
    client.release();

    return res.status(200).json({
      raise_id: raiseId,
      status: "active",
      public_url: `/capital/raises/${raiseId}`
    });
  } catch (error) {
    console.error("Failed to publish capital raise", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/capital/investors/:id/invest", async (req: Request, res: Response) => {
  const raiseId = req.params.id;
  const { investor_email, amount, accredited } = req.body;

  if (!investor_email || !amount) {
    return res.status(400).json({ error: "investor_email and amount are required" });
  }

  try {
    const client = await pool.connect();
    const raiseResult = await client.query(
      `SELECT target_amount, raised_amount FROM capital_raises WHERE id = $1`,
      [raiseId]
    );

    if (!raiseResult.rows.length) {
      client.release();
      return res.status(404).json({ error: "Capital raise not found" });
    }

    const targetAmount = parseFloat(raiseResult.rows[0].target_amount);
    const updatedRaisedAmount = parseFloat(raiseResult.rows[0].raised_amount) + amount;
    const equityPercentage = targetAmount > 0 ? +(amount / targetAmount * 100).toFixed(2) : 0;

    const insertResult = await client.query(
      `INSERT INTO capital_investors (capital_raise_id, investor_email, investment_amount, equity_percentage, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())
       RETURNING id`,
      [raiseId, investor_email, amount, equityPercentage]
    );

    await client.query(
      `UPDATE capital_raises
       SET raised_amount = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [updatedRaisedAmount, raiseId]
    );

    client.release();

    return res.status(201).json({
      investment_id: insertResult.rows[0].id,
      status: "pending",
      equity_percentage: equityPercentage,
      raised_amount: updatedRaisedAmount,
    });
  } catch (error) {
    console.error("Failed to create investor record", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/capital/raises/:id/dataroom", async (req: Request, res: Response) => {
  const raiseId = req.params.id;
  
  try {
    return res.status(200).json({
      raise_id: raiseId,
      documents: [
        { name: "Offering Deck", url: "/assets/offering-deck.pdf" },
        { name: "Financial Model", url: "/assets/financial-model.xlsx" },
        { name: "Investor Presentation", url: "/assets/investor-presentation.pdf" }
      ]
    });
  } catch (error) {
    console.error("Failed to retrieve dataroom documents", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`✅ Headroom Capital Service running on port ${port}`);
});
