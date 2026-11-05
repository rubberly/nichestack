import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/sync";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  try {
    const fresh = await handleStripeEvent(event);
    return NextResponse.json({ received: true, duplicate: !fresh });
  } catch (err) {
    console.error("Stripe webhook failed", event.type, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
