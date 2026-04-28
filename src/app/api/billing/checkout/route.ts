import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminSession } from "@/lib/auth";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

const PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER ?? "",
  growth:  process.env.STRIPE_PRICE_GROWTH  ?? "",
  pro:     process.env.STRIPE_PRICE_PRO     ?? "",
};

export async function POST(request: NextRequest) {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { plan } = await request.json();
  const priceId = PRICE_IDS[plan?.toLowerCase()];

  if (!priceId) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3000";

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/dashboard?subscribed=${plan}`,
    cancel_url: `${origin}/pricing`,
    client_reference_id: user.tenant_id,
    customer_email: user.email,
    metadata: {
      tenant_id: user.tenant_id,
      user_id: user.id,
      plan,
    },
    subscription_data: {
      metadata: { tenant_id: user.tenant_id, plan },
    },
  });

  return NextResponse.json({ url: session.url });
}
