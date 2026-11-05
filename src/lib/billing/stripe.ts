import Stripe from "stripe";

let client: Stripe | null = null;

/** Throws on live keys unless ALLOW_LIVE_STRIPE=true, so test mode can't accidentally charge real cards. */
export function assertTestKey(key: string | undefined, allowLive = process.env.ALLOW_LIVE_STRIPE === "true"): string {
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set. See .env.example.");
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_") && !allowLive) {
    throw new Error("Live Stripe key blocked. Use a test key (sk_test_...) or set ALLOW_LIVE_STRIPE=true at launch.");
  }
  return key;
}

export function stripe(): Stripe {
  if (!client) client = new Stripe(assertTestKey(process.env.STRIPE_SECRET_KEY));
  return client;
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
