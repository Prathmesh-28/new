import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { queryDb } from "@/lib/db";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

const PLAN_TIER_MAP: Record<string, string> = {
  starter: "starter",
  growth:  "growth",
  pro:     "pro",
};

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const tenantId = session.metadata?.tenant_id;
    const plan = session.metadata?.plan;

    if (tenantId && plan) {
      const tier = PLAN_TIER_MAP[plan] ?? "starter";
      await queryDb(
        `UPDATE tenants SET subscription_tier = $1, updated_at = NOW() WHERE id = $2`,
        [tier, tenantId],
      );
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const tenantId = subscription.metadata?.tenant_id;
    if (tenantId) {
      await queryDb(
        `UPDATE tenants SET subscription_tier = 'starter', updated_at = NOW() WHERE id = $1`,
        [tenantId],
      );
    }
  }

  return NextResponse.json({ received: true });
}
