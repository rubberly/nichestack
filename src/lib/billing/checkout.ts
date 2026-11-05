import type Stripe from "stripe";
import { stripe } from "./stripe";
import { lookupKey, type PlanKey, type ProductKey } from "./plans";

export async function findPrice(product: ProductKey, plan: PlanKey): Promise<Stripe.Price | null> {
  const res = await stripe().prices.list({ lookup_keys: [lookupKey(product, plan)], active: true, limit: 1 });
  return res.data[0] ?? null;
}

/** The customer-portal configuration created by `npm run stripe:setup` (tagged with metadata app=nichestack). */
export async function portalConfigId(): Promise<string | undefined> {
  const res = await stripe().billingPortal.configurations.list({ active: true, limit: 20 });
  return res.data.find((c) => c.metadata?.app === "nichestack")?.id;
}
